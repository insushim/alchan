import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import "./StockExchange.css";
import { formatKoreanCurrency } from './numberFormatter';
import { useAuth } from "./AuthContext";
import { db, functions } from "./firebase";
import { applyStockTax } from "./utils/taxUtils";
// 🔥 뉴스 생성: cron-job.org 스케줄러만 사용 (클라이언트 측 뉴스 생성 없음)
// 🔥 자동 상장/폐지: Firebase Functions에서 처리 (10분마다)
import { httpsCallable } from "firebase/functions";
import { usePolling, POLLING_INTERVALS } from "./hooks/usePolling";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  writeBatch,
  runTransaction,
  where,
  collectionGroup,
} from "firebase/firestore";

import { globalCache, cacheStats } from "./services/globalCacheService";

// === 배치 데이터 로딩 시스템 ===
const batchDataLoader = {
  pendingRequests: new Map(),
  
  // 배치로 여러 데이터를 한 번에 로드
  loadBatchData: async function(classCode, userId, forceRefresh = false) {
    const batchKey = globalCache.generateKey('BATCH', { classCode, userId });

    if (!forceRefresh) {
      const cached = globalCache.get(batchKey);
      if (cached) {
        console.log('[batchDataLoader] Cache HIT - 캐시된 데이터 사용');
        return cached;
      }
    } else {
      console.log('[batchDataLoader] forceRefresh=true - 캐시 무시하고 서버에서 로드');
      // 강제 새로고침 시 캐시 무효화
      globalCache.invalidate(batchKey);
    }

    // 이미 같은 배치 요청이 진행 중이면 대기
    if (this.pendingRequests.has(batchKey)) {
      console.log('[batchDataLoader] 대기 중인 요청 재사용');
      return await this.pendingRequests.get(batchKey);
    }

    console.log('[batchDataLoader] 서버에서 새 데이터 로드 시작');
    const batchPromise = this._executeBatchLoad(classCode, userId);
    this.pendingRequests.set(batchKey, batchPromise);

    try {
      const result = await batchPromise;
      globalCache.set(batchKey, result, 10 * 60 * 1000); // 🔥 최적화: 10분 캐시 (읽기 비용 절감)
      console.log('[batchDataLoader] 서버에서 새 데이터 로드 완료 및 캐시 저장 (10분)');
      return result;
    } finally {
      this.pendingRequests.delete(batchKey);
    }
  },

  _executeBatchLoad: async function(classCode, userId) {
    const [stocks, portfolio, news, marketCondition] = await Promise.all([
      this._loadStocks(classCode),
      this._loadPortfolio(userId, classCode),
      this._loadNews(classCode),
      this._loadMarketCondition()
    ]);

    return {
      stocks: stocks || [],
      portfolio: portfolio || [],
      news: news || [],
      marketCondition: marketCondition || null,
      errors: []
    };
  },

  _loadStocks: async function(classCode) {
    try {
      const stocksRef = collection(db, "CentralStocks");
      const q = query(stocksRef, where("isListed", "==", true));
      const querySnapshot = await getDocs(q);

      console.log(`[Firebase 읽기] Stocks: ${querySnapshot.docs.length}개 문서 읽음`);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('[batchDataLoader] Stocks load error:', error);
      return [];
    }
  },

  _loadPortfolio: async function(userId, classCode) {
    try {
      const portfolioRef = collection(db, "users", userId, "portfolio");
      const q = query(portfolioRef, where("classCode", "==", classCode));
      const querySnapshot = await getDocs(q);

      console.log(`[Firebase 읽기] Portfolio: ${querySnapshot.docs.length}개 문서 읽음`);

      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // 🔥 Timestamp를 Date로 변환하여 캐시 호환성 확보
          lastBuyTime: data.lastBuyTime?.toDate ? data.lastBuyTime.toDate() : data.lastBuyTime,
          delistedAt: data.delistedAt?.toDate ? data.delistedAt.toDate() : data.delistedAt,
        };
      });
    } catch (error) {
      console.error('[batchDataLoader] Portfolio load error:', error);
      return [];
    }
  },

  _loadNews: async function(classCode) {
    try {
      const allNews = [];

      // 중앙 뉴스만 가져오기 (인덱스 없이 작동하도록 orderBy 제거) - 정확히 2개의 뉴스만 표시
      try {
        const centralNewsRef = collection(db, "CentralNews");
        const centralActiveQuery = query(
          centralNewsRef,
          where("isActive", "==", true),
          limit(2)
        );
        const centralSnapshot = await getDocs(centralActiveQuery);

        console.log(`[Firebase 읽기] News: ${centralSnapshot.docs.length}개 문서 읽음`);

        centralSnapshot.docs.forEach(doc => {
          const data = doc.data();
          allNews.push({
            id: doc.id,
            ...data,
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp || Date.now()),
            source: 'central'
          });
        });
      } catch (centralError) {
        console.warn('[batchDataLoader] Central news load failed:', centralError);
      }

      // 🔥 최적화: 클라이언트 측에서 시간순으로 정렬하고 최신 2개만 반환
      return allNews
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 2);

    } catch (error) {
      console.error('[batchDataLoader] News load error:', error);
      return [];
    }
  },

  _loadMarketCondition: async function() {
    try {
      const marketConditionRef = doc(db, "MarketCondition", "current");
      const marketConditionDoc = await getDoc(marketConditionRef);

      if (marketConditionDoc.exists()) {
        return marketConditionDoc.data();
      }
      return null;
    } catch (error) {
      console.error('[batchDataLoader] Market condition load error:', error);
      return null;
    }
  }
};



// === 아이콘 컴포넌트들 ===
const TrendingUp = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="22,7 13.5,15.5 8.5,10.5 2,17" /><polyline points="16,7 22,7 22,13" /></svg>
);
const TrendingDown = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="22,17 13.5,8.5 8.5,13.5 2,7" /><polyline points="16,17 22,17 22,11" /></svg>
);
const Settings = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m17.5-3.5L19 10m-2 2l-2.5 2.5M6.5 6.5L9 9m-2 2l-2.5 2.5" /></svg>
);
const RefreshCw = ({ size = 16, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L20.49 10"></path><path d="M20.49 15a9 9 0 0 1-14.85 3.36L3.51 14"></path></svg>
);
const BarChart3 = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>
);
const ChevronDown = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
);
const ChevronUp = ({ size = 24, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="18 15 12 9 6 15" /></svg>
);
const Lock = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);

// === 상수 및 유틸리티 함수들 ===
const PRODUCT_TYPES = {
  STOCK: "stock",
  ETF: "etf",
  BOND: "bond"
};

const SECTORS = {
  TECH: { name: "기술" },
  FINANCE: { name: "금융" },
  CONSUMER: { name: "소비재" },
  HEALTHCARE: { name: "헬스케어" },
  ENERGY: { name: "에너지" },
  INDUSTRIAL: { name: "산업" },
  MATERIALS: { name: "소재" },
  REALESTATE: { name: "부동산" },
  UTILITIES: { name: "유틸리티" },
  COMMUNICATION: { name: "통신" },
  ENTERTAINMENT: { name: "엔터테인먼트" },
  INDEX: { name: "지수" },
  GOVERNMENT: { name: "국채" },
  CORPORATE: { name: "회사채" }
};

const HOLDING_LOCK_PERIOD = 60 * 60 * 1000; // 1시간 (60분)
const COMMISSION_RATE = 0.003;
const TAX_RATE = 0.22;
const BOND_TAX_RATE = 0.154;

const CACHE_TTL = {
  BATCH_DATA: 1000 * 60 * 5, // 🔥 최적화: 5분 캐시 (뉴스가 30분마다 생성되므로 5분이면 새 뉴스를 빠르게 확인 가능)
  STOCKS: 1000 * 60 * 5, // 5분 (주가가 자주 변동되므로)
  PORTFOLIO: 1000 * 60 * 5, // 🔥 최적화: 5분 캐시
  NEWS: 1000 * 60 * 5, // 5분 (뉴스가 30분마다 생성되므로)
  MARKET_STATUS: 1000 * 60 * 60, // 60분 (시장 상태는 거의 변경되지 않음)
};

// === 유틸리티 함수들 ===
const formatCurrency = (amount) => {
  if (typeof amount !== "number" || isNaN(amount)) return "0원";
  return new Intl.NumberFormat("ko-KR").format(Math.round(amount)) + "원";
};

const formatPercent = (percent) => {
  const num = parseFloat(percent);
  if (isNaN(num)) return "0.00%";
  return (num >= 0 ? "+" : "") + num.toFixed(2) + "%";
};

const calculateStockTax = (profit, productType = PRODUCT_TYPES.STOCK) => {
  if (profit <= 0) return 0;
  if (productType === PRODUCT_TYPES.BOND) {
    return Math.round(profit * BOND_TAX_RATE);
  }
  return Math.round(profit * TAX_RATE);
};

// 배치 처리를 위한 국고 업데이트 최적화
const treasuryUpdateQueue = new Map();
const updateNationalTreasury = async (amount, type, classCode) => {
  if (amount <= 0 || !classCode) return;
  
  const key = `${classCode}_${type}`;
  const existing = treasuryUpdateQueue.get(key) || { amount: 0, type, classCode };
  existing.amount += amount;
  treasuryUpdateQueue.set(key, existing);
  
  // 배치 처리를 위해 지연
  setTimeout(() => processTreasuryQueue(), 1000);
};

const processTreasuryQueue = async () => {
  if (treasuryUpdateQueue.size === 0) return;
  
  const batch = writeBatch(db);
  const updates = Array.from(treasuryUpdateQueue.values());
  treasuryUpdateQueue.clear();
  
  for (const { amount, type, classCode } of updates) {
    const treasuryRef = doc(db, "nationalTreasuries", classCode);
    const updateData = {
      totalAmount: increment(amount),
      lastUpdated: serverTimestamp(),
    };
    
    if (type === 'tax') {
      updateData.stockTaxRevenue = increment(amount);
    } else if (type === 'commission') {
      updateData.stockCommissionRevenue = increment(amount);
    }
    
    batch.update(treasuryRef, updateData, { merge: true });
  }
  
  try {
    await batch.commit();
  } catch (error) {
    // 실패한 업데이트들을 다시 큐에 추가
    updates.forEach(update => {
      const key = `${update.classCode}_${update.type}`;
      treasuryUpdateQueue.set(key, update);
    });
  }
};

const calculateMarketIndex = (stocks) => {
  if (!stocks || stocks.length === 0) return 1000;
  const listedStocks = stocks.filter(s => s && s.isListed && s.productType === PRODUCT_TYPES.STOCK);
  if (listedStocks.length === 0) return 1000;

  const totalMarketCap = listedStocks.reduce((sum, stock) => {
    const shares = 1000;
    return sum + (stock.price * shares);
  }, 0);

  const baseMarketCap = listedStocks.reduce((sum, stock) => {
    const shares = 1000;
    const basePrice = stock.initialPrice || stock.minListingPrice || stock.price;
    return sum + (basePrice * shares);
  }, 0);

  if (baseMarketCap === 0) return 1000;

  return Math.round((totalMarketCap / baseMarketCap) * 1000);
};

const canSellHolding = (holding) => {
  if (!holding.lastBuyTime) return true;

  // 🔥 Date 객체, Timestamp, 문자열 모두 처리
  let lastBuyTimeMs;
  if (holding.lastBuyTime instanceof Date) {
    lastBuyTimeMs = holding.lastBuyTime.getTime();
  } else if (holding.lastBuyTime?.toDate) {
    lastBuyTimeMs = holding.lastBuyTime.toDate().getTime();
  } else if (typeof holding.lastBuyTime === 'number') {
    lastBuyTimeMs = holding.lastBuyTime;
  } else if (typeof holding.lastBuyTime === 'string') {
    lastBuyTimeMs = new Date(holding.lastBuyTime).getTime();
  } else {
    return true; // 알 수 없는 형식이면 매도 가능
  }

  const timeSinceBuy = Date.now() - lastBuyTimeMs;
  return timeSinceBuy >= HOLDING_LOCK_PERIOD;
};

const getRemainingLockTime = (holding) => {
  if (!holding.lastBuyTime) return 0;

  // 🔥 Date 객체, Timestamp, 문자열 모두 처리
  let lastBuyTimeMs;
  if (holding.lastBuyTime instanceof Date) {
    lastBuyTimeMs = holding.lastBuyTime.getTime();
  } else if (holding.lastBuyTime?.toDate) {
    lastBuyTimeMs = holding.lastBuyTime.toDate().getTime();
  } else if (typeof holding.lastBuyTime === 'number') {
    lastBuyTimeMs = holding.lastBuyTime;
  } else if (typeof holding.lastBuyTime === 'string') {
    lastBuyTimeMs = new Date(holding.lastBuyTime).getTime();
  } else {
    return 0; // 알 수 없는 형식이면 0 반환
  }

  const now = Date.now();
  const timeSinceBuy = now - lastBuyTimeMs;
  const remaining = HOLDING_LOCK_PERIOD - timeSinceBuy;

  return Math.max(0, remaining);
};

const formatTime = (milliseconds) => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}분 ${remainingSeconds}초`;
};

const getProductIcon = (productType) => {
  switch(productType) {
    case PRODUCT_TYPES.ETF: return "📊";
    case PRODUCT_TYPES.BOND: return "📜";
    default: return "📈";
  }
};

const getProductBadgeClass = (productType) => {
  switch(productType) {
    case PRODUCT_TYPES.ETF: return "etf";
    case PRODUCT_TYPES.BOND: return "bond";
    default: return "stock";
  }
};

// === 캐시 무효화 함수 ===
const invalidateCache = (pattern) => {
  // globalCache.invalidatePattern 메서드 사용 (더 안전함)
  if (globalCache && typeof globalCache.invalidatePattern === 'function') {
    globalCache.invalidatePattern(pattern);
  }
};

// === 관리자 패널 컴포넌트 ===
const AdminPanel = React.memo(({ stocks, classCode, onClose, onAddStock, onDeleteStock, onEditStock, onToggleManualStock, cacheStats, onManualUpdate, onDeleteAllNews }) => {
    const [showAddForm, setShowAddForm] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeletingNews, setIsDeletingNews] = useState(false);
    const [newStock, setNewStock] = useState({
        name: "",
        price: "",
        minListingPrice: "",
        isManual: false,
        sector: "TECH",
        productType: PRODUCT_TYPES.STOCK,
        maturityYears: "",
        couponRate: ""
    });

    const handleManualUpdate = async () => {
        if (isUpdating) return;
        setIsUpdating(true);
        try {
            await onManualUpdate();
            alert("주식 가격 및 뉴스 업데이트 완료!");
        } catch (error) {
            alert("업데이트 실패: " + error.message);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDeleteAllNews = async () => {
        if (!window.confirm("정말로 모든 뉴스를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
            return;
        }
        if (isDeletingNews) return;
        setIsDeletingNews(true);
        try {
            await onDeleteAllNews();
            alert("모든 뉴스가 삭제되었습니다!");
        } catch (error) {
            alert("뉴스 삭제 실패: " + error.message);
        } finally {
            setIsDeletingNews(false);
        }
    };

    const handleAddStock = async () => {
        if (!newStock.name || !newStock.price || !newStock.minListingPrice) return alert("모든 필드를 입력해주세요.");
        const price = parseFloat(newStock.price);
        const minPrice = parseFloat(newStock.minListingPrice);
        if (price <= 0 || minPrice <= 0) return alert("가격은 0보다 커야 합니다.");

        const stockData = {
            name: newStock.name,
            price,
            minListingPrice: minPrice,
            isListed: true,
            isManual: newStock.isManual,
            sector: newStock.sector,
            productType: newStock.productType,
            buyVolume: 0,
            sellVolume: 0,
            recentBuyVolume: 0,
            recentSellVolume: 0,
            volatility: newStock.productType === PRODUCT_TYPES.BOND ? 0.005 : 0.02
        };

        if (newStock.productType === PRODUCT_TYPES.BOND) {
            stockData.maturityYears = parseFloat(newStock.maturityYears) || 10;
            stockData.couponRate = parseFloat(newStock.couponRate) || 3.5;
            stockData.sector = "GOVERNMENT";
        }

        if (newStock.productType === PRODUCT_TYPES.ETF) {
            stockData.sector = "INDEX";
        }

        await onAddStock(stockData);
        setNewStock({ name: "", price: "", minListingPrice: "", isManual: false, sector: "TECH", productType: PRODUCT_TYPES.STOCK, maturityYears: "", couponRate: "" });
        setShowAddForm(false);
    };

    return (
        <div className="admin-panel-fullscreen">
            <div className="admin-header">
                <h2><Settings size={24} /> 관리자 패널 ({classCode})</h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        캐시 통계: 적중 {cacheStats.hits}, 누락 {cacheStats.misses}, 절약 {cacheStats.savings}회
                    </div>
                    <button onClick={onClose} className="btn btn-danger">닫기</button>
                </div>
            </div>
            <div className="admin-content">
                <div className="admin-section">
                    <h3>🔄 시장 관리</h3>
                    <div style={{ marginBottom: '20px', padding: '15px', background: '#f0f9ff', borderRadius: '8px' }}>
                        <p style={{ marginBottom: '10px', color: '#0369a1' }}>
                            📊 주식/ETF/채권 가격을 즉시 업데이트하고 뉴스를 생성합니다.<br/>
                            ⏰ 자동 업데이트: cron-job.org 스케줄러를 통해 정기적으로 실행됩니다.
                        </p>
                        <button
                            onClick={handleManualUpdate}
                            disabled={isUpdating}
                            className="btn btn-success"
                            style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 'bold', marginBottom: '10px' }}
                        >
                            {isUpdating ? '⏳ 업데이트 중...' : '🚀 지금 즉시 가격 & 뉴스 업데이트'}
                        </button>
                        <button
                            onClick={handleDeleteAllNews}
                            disabled={isDeletingNews}
                            className="btn btn-danger"
                            style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 'bold' }}
                        >
                            {isDeletingNews ? '⏳ 삭제 중...' : '🗑️ 모든 뉴스 강제 삭제'}
                        </button>
                    </div>
                </div>
                <div className="admin-section">
                    <h3><BarChart3 size={20} /> 상품 목록 관리</h3>
                    <div className="admin-stock-list">
                        {stocks.map(stock => (
                            <div key={stock.id} className="admin-stock-item">
                                <div className="admin-stock-info">
                                    <span className="stock-name">{getProductIcon(stock.productType)} {stock.name}</span>
                                    <span className="stock-details">
                                        {formatCurrency(stock.price)} | {SECTORS[stock.sector]?.name || '기타'} | {stock.isListed ? '상장' : '상장폐지'} | {stock.isManual ? '수동' : '자동'}
                                        {stock.productType === PRODUCT_TYPES.BOND && ` | 만기: ${stock.maturityYears}년 | 이자율: ${stock.couponRate}%`}
                                    </span>
                                </div>
                                <div className="form-actions">
                                    <button onClick={() => onEditStock(stock.id)} className="btn btn-primary">가격 수정</button>
                                    <button onClick={() => onToggleManualStock(stock.id, stock.isListed)} className={`btn ${stock.isListed ? 'btn-secondary' : 'btn-success'}`}>{stock.isListed ? '상장폐지' : '재상장'}</button>
                                    <button onClick={() => onDeleteStock(stock.id, stock.name)} className="btn btn-danger">삭제</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="admin-section">
                    <h3>새 상품 추가</h3>
                    <button onClick={() => setShowAddForm(!showAddForm)} className="btn btn-primary">{showAddForm ? '취소' : '새 상품 추가 양식 열기'}</button>
                    {showAddForm && (
                        <div className="add-stock-form">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label className="form-label">상품 유형</label>
                                    <select value={newStock.productType} onChange={e => setNewStock(p => ({ ...p, productType: e.target.value }))} className="form-input">
                                        <option value={PRODUCT_TYPES.STOCK}>주식</option>
                                        <option value={PRODUCT_TYPES.ETF}>ETF/지수</option>
                                        <option value={PRODUCT_TYPES.BOND}>채권</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">상품명</label>
                                    <input type="text" value={newStock.name} onChange={e => setNewStock(p => ({ ...p, name: e.target.value }))} className="form-input"
                                        placeholder={newStock.productType === PRODUCT_TYPES.BOND ? "예: 국고채 10년" : newStock.productType === PRODUCT_TYPES.ETF ? "예: KOSPI 200" : "예: 삼성전자"} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">초기 가격</label>
                                    <input type="number" value={newStock.price} onChange={e => setNewStock(p => ({ ...p, price: e.target.value }))} className="form-input" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">최소 상장가</label>
                                    <input type="number" value={newStock.minListingPrice} onChange={e => setNewStock(p => ({ ...p, minListingPrice: e.target.value }))} className="form-input" />
                                </div>
                                {newStock.productType === PRODUCT_TYPES.STOCK && (
                                    <div className="form-group">
                                        <label className="form-label">섹터</label>
                                        <select value={newStock.sector} onChange={e => setNewStock(p => ({ ...p, sector: e.target.value }))} className="form-input">
                                            {Object.entries(SECTORS).filter(([key]) => !['INDEX', 'GOVERNMENT', 'CORPORATE'].includes(key)).map(([key, value]) => (
                                                <option key={key} value={key}>{value.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {newStock.productType === PRODUCT_TYPES.BOND && (
                                    <>
                                        <div className="form-group">
                                            <label className="form-label">만기 (년)</label>
                                            <input type="number" value={newStock.maturityYears} onChange={e => setNewStock(p => ({ ...p, maturityYears: e.target.value }))} className="form-input" placeholder="예: 10" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">표면이자율 (%)</label>
                                            <input type="number" step="0.1" value={newStock.couponRate} onChange={e => setNewStock(p => ({ ...p, couponRate: e.target.value }))} className="form-input" placeholder="예: 3.5" />
                                        </div>
                                    </>
                                )}
                                <div className="form-group checkbox-group">
                                    <input type="checkbox" checked={newStock.isManual} onChange={e => setNewStock(p => ({ ...p, isManual: e.target.checked }))} id="isManualCheckbox" className="checkbox-input" />
                                    <label htmlFor="isManualCheckbox">수동 관리 (자동 가격 변동 제외)</label>
                                </div>
                            </div>
                            <div className="form-actions">
                                <button onClick={handleAddStock} className="btn btn-success">상품 추가</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

// === 메인 컴포넌트 ===
const StockExchange = () => {
  const { user, userDoc, isAdmin, loading: authLoading, firebaseReady, functions, optimisticUpdate, refreshUserDocument } = useAuth();

  const [classCode, setClassCode] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [marketCondition, setMarketCondition] = useState({ index: 1000, trend: "neutral", volatility: "normal" });
  const [newsFeed, setNewsFeed] = useState([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [buyQuantities, setBuyQuantities] = useState({});
  const [sellQuantities, setSellQuantities] = useState({});
  const [isTrading, setIsTrading] = useState(false);
  const [showNews, setShowNews] = useState(true);
  const [lockTimers, setLockTimers] = useState({});
  const [activeTab, setActiveTab] = useState("stocks");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [showAllNews, setShowAllNews] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  
  // 성능 최적화를 위한 상태 추가
  const [cacheStatus, setCacheStatus] = useState({ hits: 0, misses: 0, savings: 0 });
  const [lastBatchLoad, setLastBatchLoad] = useState(null);

  const lastFetchTimeRef = useRef({
    stocks: 0,
    portfolio: 0,
    news: 0,
    marketStatus: 0,
    batchLoad: 0
  });

  // 🔥 fetching 상태를 ref로 관리 (무한 루프 방지)
  const isFetchingRef = useRef(false);

  // 시장 개장 상태를 1분마다 확인하여 marketOpen 상태를 안정적으로 업데이트 (자동 폴링 시작 버그 수정)
  useEffect(() => {
    const checkMarketStatus = () => {
      const now = new Date();
      const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
      const day = koreaTime.getDay(); // 0: 일요일, 1: 월요일, ..., 6: 토요일
      const hour = koreaTime.getHours();
      const isWeekday = day >= 1 && day <= 5;
      const isOpenHour = hour >= 8 && hour < 15;
      setMarketOpen(isWeekday && isOpenHour);
    };

    checkMarketStatus(); // 초기 로드 시 즉시 확인
    const interval = setInterval(checkMarketStatus, 60000); // 1분마다 확인

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (userDoc?.classCode) {
      setClassCode(userDoc.classCode);
    }
  }, [userDoc]);

  // 🔥 매도 제한 타이머: 1초마다 업데이트 (portfolio를 ref로 참조)
  const portfolioRef = useRef(portfolio);

  useEffect(() => {
    portfolioRef.current = portfolio;
  }, [portfolio]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLockTimers(prevTimers => {
        const newTimers = {};
        portfolioRef.current.forEach(holding => {
          const remaining = getRemainingLockTime(holding);
          if (remaining > 0) {
            newTimers[holding.id] = remaining;
          }
        });
        return newTimers;
      });

      // 캐시 통계 업데이트
      setCacheStatus({
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        savings: cacheStats.savings
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []); // 빈 의존성 배열 - portfolioRef를 통해 최신 portfolio 참조

  // 🔥 portfolio가 변경되면 즉시 타이머 재계산
  useEffect(() => {
    const newTimers = {};
    portfolio.forEach(holding => {
      const remaining = getRemainingLockTime(holding);
      if (remaining > 0) {
        newTimers[holding.id] = remaining;
      }
    });
    setLockTimers(newTimers);
  }, [portfolio]);

  // === 최적화된 데이터 가져오기 함수 (배치 처리 사용) ===
  const fetchAllData = useCallback(async (forceRefresh = true) => { // forceRefresh 기본값을 true로 변경
    if (!classCode || !user) return;

    if (isFetchingRef.current && !forceRefresh) {
      console.log('[StockExchange] 이미 fetching 중이므로 대기');
      return;
    }

    const now = Date.now();
    
    // usePolling이 간격을 제어하므로, 시간 기반 캐시 체크 로직은 제거하거나 수정할 수 있지만,
    // 수동 새로고침 시에도 동작해야 하므로 유지.
    const timeSinceLastBatch = now - lastFetchTimeRef.current.batchLoad;
    if (!forceRefresh && timeSinceLastBatch <= CACHE_TTL.BATCH_DATA) {
      return;
    }

    isFetchingRef.current = true;
    setIsFetching(true);

    try {
      // usePolling에서 호출 시 항상 최신 데이터를 가져오도록 forceRefresh를 true로 전달
      const batchResult = await batchDataLoader.loadBatchData(classCode, user.uid, forceRefresh);

      if (batchResult.errors && batchResult.errors.length > 0) {
        console.warn('[StockExchange] 배치 로드 중 일부 오류 발생:', batchResult.errors);
      }

      setStocks(batchResult.stocks || []);
      setPortfolio(batchResult.portfolio || []);
      setNewsFeed(batchResult.news || []);
      if (batchResult.marketCondition) {
        setMarketCondition(batchResult.marketCondition);
      }

      lastFetchTimeRef.current.batchLoad = now;
      lastFetchTimeRef.current.stocks = now;
      lastFetchTimeRef.current.portfolio = now;
      lastFetchTimeRef.current.news = now;
      lastFetchTimeRef.current.marketStatus = now;

      setLastBatchLoad(new Date());
      setLastUpdated(new Date());

    } catch (error) {
      console.error('[StockExchange] 배치 로드 실패:', error);
      // Polling 중에는 alert을 띄우지 않는 것이 사용자 경험에 좋음
      // alert('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      isFetchingRef.current = false;
      setIsFetching(false);
    }
  }, [classCode, user]);

  // === 데이터 자동 갱신 (Polling) ===
  usePolling(fetchAllData, {
    interval: POLLING_INTERVALS.REALTIME, // 1분마다 자동 갱신
    enabled: firebaseReady && !!user && !!classCode,
    deps: [classCode, user]
  });

  // 🔥 FCM 푸시 알림 제거됨 (이유: 알림 스팸, 읽기 증가, 사용자 경험 악화)
  // 대신 30분 캐시 + 시간당 1회 자동 폴링으로 부드러운 업데이트 제공

  // === 자동 상장/폐지 관리는 Firebase Functions에서 처리 ===
  // 10분마다 서버에서 자동으로 실행됨 (autoManageStocks 함수)
  // 클라이언트에서는 별도 스케줄러 불필요

  // === 시장 지수 계산 ===
  useEffect(() => {
    if (!stocks || stocks.length === 0) return;
    const index = calculateMarketIndex(stocks);
    let trend = "neutral";
    if (index > 1100) trend = "bull";
    else if (index < 900) trend = "bear";
    setMarketCondition({ index, trend, volatility: "normal" });
  }, [stocks]);

  // === 거래 함수들 (최적화된 캐시 무효화) ===
  const addStock = useCallback(async (stockData) => {
    if (!classCode || !user) return alert("클래스 정보가 없습니다.");
    try {
      const stockRef = doc(collection(db, "CentralStocks"));
      await setDoc(stockRef, {
        ...stockData,
        initialPrice: stockData.price,
        priceHistory: [stockData.price],
        createdAt: serverTimestamp(),
        holderCount: 0,
        tradingVolume: 1000,
        buyVolume: 0,
        sellVolume: 0,
        recentBuyVolume: 0,
        recentSellVolume: 0,
        volatility: stockData.volatility || 0.02
      });

      // 캐시 무효화
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`STOCKS_${classCode}`);
      await fetchAllData(true);

      alert(`${stockData.name} 상품이 추가되었습니다.`);
    } catch (error) {
      alert("상품 추가 중 오류가 발생했습니다.");
    }
  }, [classCode, user, fetchAllData]);

  const deleteStock = useCallback(async (stockId, stockName) => {
    if (!classCode || !user) return alert("클래스 정보가 없습니다.");
    if (window.confirm(`'${stockName}' 상품을 정말로 삭제하시겠습니까?`)) {
      try {
        await deleteDoc(doc(db, "CentralStocks", stockId));

        // 캐시 무효화
        const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
        globalCache.invalidate(batchKey);
        invalidateCache(`STOCKS_${classCode}`);
        await fetchAllData(true);

        alert(`${stockName} 상품이 삭제되었습니다.`);
      } catch (error) {
        alert("상품 삭제 중 오류가 발생했습니다.");
      }
    }
  }, [classCode, user, fetchAllData]);

  const editStock = useCallback(async (stockId) => {
    if (!classCode || !user) return alert("클래스 정보가 없습니다.");
    const stock = stocks.find(s => s.id === stockId);
    if (!stock) return;
    const newPriceStr = prompt(`'${stock.name}'의 새로운 가격:`, stock.price.toString());
    const newPrice = parseFloat(newPriceStr);
    if (isNaN(newPrice) || newPrice <= 0) return alert("유효한 가격을 입력해주세요.");
    try {
      await updateDoc(doc(db, "CentralStocks", stockId), {
        price: newPrice,
        priceHistory: [...(stock.priceHistory || []).slice(-19), newPrice]
      });

      // 캐시 무효화
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`STOCKS_${classCode}`);
      await fetchAllData(true);

      alert('가격이 수정되었습니다.');
    } catch (error) {
      alert("가격 수정 중 오류가 발생했습니다.");
    }
  }, [stocks, classCode, user, fetchAllData]);

  const toggleManualStock = useCallback(async (stockId, currentIsListed) => {
    if (!classCode || !user) return alert("클래스 정보가 없습니다.");
    const stock = stocks.find(s => s.id === stockId);
    if (!stock) return;
    const action = currentIsListed ? '상장폐지' : '재상장';

    if (window.confirm(`'${stock.name}' 상품을 ${action}하시겠습니까?`)) {
      try {
        const updateData = currentIsListed
            ? { isListed: false, price: 0, delistedAt: serverTimestamp() }
            : { isListed: true, price: stock.minListingPrice, priceHistory: [stock.minListingPrice], delistedAt: null };

        await updateDoc(doc(db, "CentralStocks", stockId), updateData);

        if (currentIsListed) {
          const batch = writeBatch(db);

          const portfoliosToDelistQuery = query(
            collectionGroup(db, 'portfolio'),
            where('classCode', '==', classCode),
            where('stockId', '==', stockId)
          );

          const snapshot = await getDocs(portfoliosToDelistQuery);

          snapshot.forEach(doc => {
            batch.update(doc.ref, { delistedAt: serverTimestamp() });
          });

          await batch.commit();
        }

        // 캐시 무효화
        const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
        globalCache.invalidate(batchKey);
        invalidateCache(`STOCKS_${classCode}`);
        invalidateCache(`PORTFOLIO`);
        await fetchAllData(true);

        alert(`${action} 처리되었습니다.`);
      } catch (error) {
        alert(`${action} 처리 중 오류가 발생했습니다.`);
      }
    }
  }, [stocks, classCode, user, fetchAllData]);

  const buyStock = useCallback(async (stockId, quantityString) => {
    if (!marketOpen) return alert("주식시장이 마감되었습니다. 운영 시간: 월-금 오전 8시-오후 3시");
    if (isTrading || !classCode) return;
    const quantity = parseInt(quantityString, 10);
    if (isNaN(quantity) || quantity <= 0) return alert("유효한 수량을 입력해주세요.");
    const stock = stocks.find(s => s.id === stockId);
    if (!user || !stock || !stock.isListed) return alert("매수할 수 없는 상태입니다.");

    const cost = stock.price * quantity;
    const commission = Math.round(cost * COMMISSION_RATE);
    const taxRate = 0.01; // 기본 거래세율 1%
    const taxAmount = Math.floor(cost * taxRate);
    const totalCost = cost + commission + taxAmount;

    console.log('[buyStock] 매수 시작:', { stockId, stockName: stock.name, quantity, totalCost });

    // 🔥 즉시 UI 업데이트 (낙관적 업데이트)
    if (optimisticUpdate) {
      optimisticUpdate({ cash: -totalCost });
    }

    setIsTrading(true);
    try {
      // Cloud Function 호출
      const buyStockFunction = httpsCallable(functions, 'buyStock');
      const result = await buyStockFunction({ stockId, quantity });

      console.log('[buyStock] 매수 성공:', result.data);

      // 🔥 [수정] 서버에서 받은 정확한 잔액으로 낙관적 업데이트 보정
      if (result.data.newBalance !== undefined && optimisticUpdate) {
        const currentCash = userDoc?.cash || 0;
        const cashDiff = result.data.newBalance - currentCash;
        optimisticUpdate({ cash: cashDiff });
        console.log('[buyStock] 현금 정확한 값으로 업데이트:', result.data.newBalance);
      }

      // 캐시 무효화 및 데이터 새로고침
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`PORTFOLIO_user_${user.uid}`);
      invalidateCache(`STOCKS_${classCode}`);

      // 🔥 [수정] localStorage에서 BATCH 관련 키 직접 삭제
      try {
        const keysToDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('BATCH')) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach(key => {
          localStorage.removeItem(key);
          console.log('[거래] localStorage 캐시 삭제:', key);
        });
      } catch (error) {
        console.warn('[거래] localStorage 정리 오류:', error);
      }

      // 주식 데이터 새로고침
      await fetchAllData(true);

      setBuyQuantities(prev => ({ ...prev, [stockId]: "" }));

      alert(`${stock.name} ${quantity}주 매수 완료!\n수수료: ${formatCurrency(commission)}`);
    } catch (error) {
      console.error('[buyStock] 매수 실패:', error);

      // 실패 시 롤백 (낙관적 업데이트 취소)
      if (optimisticUpdate) {
        optimisticUpdate({ cash: totalCost });
      }

      alert(error.message || '매수 처리 중 오류가 발생했습니다.');
    } finally {
      setIsTrading(false);
    }
  }, [stocks, user, isTrading, classCode, marketOpen, functions, fetchAllData, invalidateCache, optimisticUpdate, refreshUserDocument]);

  const sellStock = useCallback(async (holdingId, quantityString) => {
    if (!marketOpen) return alert("주식시장이 마감되었습니다. 운영 시간: 월-금 오전 8시-오후 3시");
    if (isTrading) return;
    const quantity = parseInt(quantityString, 10);
    if (isNaN(quantity) || quantity <= 0) return alert("유효한 수량을 입력해주세요.");
    const holding = portfolio.find(h => h.id === holdingId);
    if (!user || !userDoc || !holding || quantity > holding.quantity) return alert("매도할 수 없는 상태입니다.");
    if (holding.delistedAt) return alert("상장폐지된 상품은 매도할 수 없습니다.");

    if (!canSellHolding(holding)) {
      const remaining = getRemainingLockTime(holding);
      return alert(`매수 후 1시간 동안은 매도할 수 없습니다.\n남은 시간: ${formatTime(remaining)}`);
    }

    const stock = stocks.find(s => s.id === holding.stockId);
    if (!stock || !stock.isListed) return alert("현재 거래할 수 없는 상품입니다.");

    // 예상 수익 계산 (낙관적 업데이트용)
    const sellPrice = stock.price * quantity;
    const commission = Math.round(sellPrice * COMMISSION_RATE);
    const profit = (stock.price - holding.averagePrice) * quantity;
    const profitTax = profit > 0 ? Math.floor(profit * 0.22) : 0;
    const transactionTax = Math.floor(sellPrice * 0.01);
    const totalTax = profitTax + transactionTax;
    const estimatedNetRevenue = sellPrice - commission - totalTax;

    console.log('[sellStock] 매도 시작:', { holdingId, stockName: stock.name, quantity, estimatedNetRevenue });

    // 🔥 즉시 UI 업데이트 (낙관적 업데이트)
    if (optimisticUpdate) {
      optimisticUpdate({ cash: estimatedNetRevenue });
    }

    setIsTrading(true);

    try {
      const sellStockFunction = httpsCallable(functions, 'sellStock');
      const result = await sellStockFunction({ holdingId, quantity });

      console.log('[sellStock] 매도 성공:', result.data);

      // 🔥 [수정] 서버에서 받은 정확한 잔액으로 낙관적 업데이트 보정
      if (result.data.newBalance !== undefined && optimisticUpdate) {
        const currentCash = userDoc?.cash || 0;
        const cashDiff = result.data.newBalance - currentCash;
        optimisticUpdate({ cash: cashDiff });
        console.log('[sellStock] 현금 정확한 값으로 업데이트:', result.data.newBalance);
      }

      // 캐시 무효화 및 데이터 새로고침
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`PORTFOLIO_user_${user.uid}`);
      invalidateCache(`STOCKS_${classCode}`);

      // 🔥 [수정] localStorage에서 BATCH 관련 키 직접 삭제
      try {
        const keysToDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('BATCH')) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach(key => {
          localStorage.removeItem(key);
          console.log('[거래] localStorage 캐시 삭제:', key);
        });
      } catch (error) {
        console.warn('[거래] localStorage 정리 오류:', error);
      }

      // 주식 데이터 새로고침
      await fetchAllData(true);

      setSellQuantities(prev => ({ ...prev, [holdingId]: "" }));

      const { stockName, sellPrice: actualSellPrice, commission: actualCommission, totalTax: actualTax, profit: actualProfit, netRevenue } = result.data;
      const taxInfo = actualTax > 0 ? `\n세금: ${formatCurrency(actualTax)}` : '';
      alert(`${stockName} ${quantity}주 매도 완료!\n수익: ${formatCurrency(actualProfit)}${taxInfo}\n수수료: ${formatCurrency(actualCommission)}\n순수익: ${formatCurrency(netRevenue)}`);
    } catch (error) {
      console.error('[sellStock] 매도 실패:', error);

      // 실패 시 롤백 (낙관적 업데이트 취소)
      if (optimisticUpdate) {
        optimisticUpdate({ cash: -estimatedNetRevenue });
      }

      alert(error.message || '매도 처리 중 오류가 발생했습니다.');
    } finally {
      setIsTrading(false);
    }
  }, [stocks, portfolio, user, userDoc, isTrading, classCode, marketOpen, fetchAllData, functions, optimisticUpdate, refreshUserDocument]);

  const deleteHolding = useCallback(async (holdingId) => {
    if (!user || !classCode) return;
    if (window.confirm("이 상품(휴지조각)을 포트폴리오에서 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, "users", user.uid, "portfolio", holdingId));

        // 캐시 무효화
        const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
        globalCache.invalidate(batchKey);
        invalidateCache(`PORTFOLIO_user_${user.uid}`);
        await fetchAllData(true);

        alert("삭제되었습니다.");
      } catch (error) {
        alert("삭제 중 오류가 발생했습니다.");
      }
    }
  }, [user, classCode, fetchAllData]);

  // 🔥 수동으로 주식 시장 업데이트 (관리자 전용)
  const manualUpdateStockMarket = useCallback(async () => {
    if (!functions || !classCode || !user) {
      throw new Error("Firebase Functions가 초기화되지 않았습니다.");
    }

    try {
      console.log('[manualUpdateStockMarket] 수동 업데이트 시작');
      const manualUpdateFunction = httpsCallable(functions, 'manualUpdateStockMarket');
      const result = await manualUpdateFunction({});

      console.log('[manualUpdateStockMarket] 업데이트 성공:', result.data);

      // 캐시 무효화 및 데이터 새로고침
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`STOCKS_${classCode}`);
      await fetchAllData(true);

      return result.data;
    } catch (error) {
      console.error('[manualUpdateStockMarket] 업데이트 실패:', error);
      throw error;
    }
  }, [functions, classCode, user, fetchAllData]);

  // 🔥 모든 뉴스 강제 삭제 (관리자 전용)
  const deleteAllNews = useCallback(async () => {
    if (!classCode || !user) {
      throw new Error("클래스 정보가 없습니다.");
    }

    try {
      console.log('[deleteAllNews] 모든 뉴스 삭제 시작');

      // CentralNews 컬렉션의 모든 문서 가져오기
      const centralNewsRef = collection(db, "CentralNews");
      const snapshot = await getDocs(centralNewsRef);

      console.log(`[deleteAllNews] ${snapshot.size}개의 뉴스 발견`);

      // 배치로 삭제 (최대 500개씩)
      const batch = writeBatch(db);
      let count = 0;

      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        count++;
      });

      if (count > 0) {
        await batch.commit();
        console.log(`[deleteAllNews] ${count}개의 뉴스 삭제 완료`);
      }

      // 캐시 무효화 및 데이터 새로고침
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`NEWS_${classCode}`);
      await fetchAllData(true);

      return { deletedCount: count };
    } catch (error) {
      console.error('[deleteAllNews] 뉴스 삭제 실패:', error);
      throw error;
    }
  }, [classCode, user, fetchAllData]);

  // === stocks 데이터를 Map으로 변환하여 조회 성능 향상 ===
  const stocksMap = useMemo(() => {
    const map = new Map();
    stocks.forEach(stock => map.set(stock.id, stock));
    return map;
  }, [stocks]);

  // === 계산된 값들 ===
  const portfolioStats = useMemo(() => {
    let totalValue = 0, totalInvested = 0;
    portfolio.forEach(holding => {
      const investedValue = holding.averagePrice * holding.quantity;
      totalInvested += investedValue;
      if (!holding.delistedAt) {
        const stock = stocksMap.get(holding.stockId);
        if (stock && stock.isListed) totalValue += stock.price * holding.quantity;
      }
    });
    const totalProfit = totalValue - totalInvested;
    const profitPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
    return { totalValue, totalInvested, totalProfit, profitPercent };
  }, [portfolio, stocksMap]);

  const filteredStocks = useMemo(() => {
    return stocks.filter(s => {
      if (!s.isListed) return false;
      if (activeTab === "stocks") return s.productType === PRODUCT_TYPES.STOCK || !s.productType;
      if (activeTab === "etfs") return s.productType === PRODUCT_TYPES.ETF;
      if (activeTab === "bonds") return s.productType === PRODUCT_TYPES.BOND;
      return false;
    });
  }, [stocks, activeTab]);

  const [showAllStocks, setShowAllStocks] = useState(false);

  const displayedStocks = useMemo(() => {
    return showAllStocks ? filteredStocks : filteredStocks.slice(0, 20);
  }, [filteredStocks, showAllStocks]);

  const displayedNews = useMemo(() => {
    return showAllNews ? newsFeed : newsFeed.slice(0, 3);
  }, [newsFeed, showAllNews]);

  // === 수동 새로고침 함수 ===
  const handleManualRefresh = useCallback(() => {
    if (!classCode || !user) return;
    // 캐시 강제 삭제
    const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
    globalCache.invalidate(batchKey);
    fetchAllData(true);
  }, [fetchAllData, classCode, user]);

  if (authLoading || !firebaseReady) return <div className="loading-message">데이터를 불러오는 중입니다...</div>;
  if (!user || !userDoc) return <div className="loading-message">로그인이 필요합니다.</div>;
  if (!classCode && !authLoading) return <div className="loading-message">참여 중인 클래스 정보를 불러오는 중...</div>;
  if (showAdminPanel && isAdmin()) return <AdminPanel stocks={stocks} classCode={classCode} onClose={() => setShowAdminPanel(false)} onAddStock={addStock} onDeleteStock={deleteStock} onEditStock={editStock} onToggleManualStock={toggleManualStock} cacheStats={cacheStatus} onManualUpdate={manualUpdateStockMarket} onDeleteAllNews={deleteAllNews} />; 

   

  return (
    <div className="stock-exchange-container">
        <header className="stock-header">
            <div className="stock-header-content">
                <div className="logo-title">
                    <BarChart3 size={32} color="white" /><h1>투자 거래소 ({classCode})</h1>
                </div>
                <div className={`market-status ${marketOpen ? 'open' : 'closed'}`}>
                    {marketOpen ? '● 개장' : '○ 마감'}
                </div>
                <div className="stock-header-actions">
                    <div className="user-info-display">{formatCurrency(userDoc.cash)}</div>
                    {isAdmin() && <button onClick={() => setShowAdminPanel(true)} className="btn btn-primary"><Settings size={16} /> 관리</button>}
                </div>
            </div>
        </header>
        <main className="market-section">
            <section className="asset-summary">
                <div className="asset-cards">
                    <div className="asset-card"><div className="asset-card-content"><div className="asset-card-info"><h3>투자 평가액</h3><p className="value">{formatCurrency(portfolioStats.totalValue)}</p></div><div className="asset-card-icon blue">📊</div></div></div>
                    <div className="asset-card"><div className="asset-card-content"><div className="asset-card-info"><h3>총 자산</h3><p className="value">{formatCurrency(userDoc.cash + portfolioStats.totalValue)}</p></div><div className="asset-card-icon purple">💎</div></div></div>
                    <div className="asset-card"><div className="asset-card-content"><div className="asset-card-info"><h3>평가손익</h3><p className={`value ${portfolioStats.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatCurrency(portfolioStats.totalProfit)}</p></div><div className={`asset-card-icon ${portfolioStats.totalProfit >= 0 ? 'red' : 'blue'}`}>{portfolioStats.totalProfit >= 0 ? <TrendingUp size={24} color="white" /> : <TrendingDown size={24} color="white" />}</div></div></div>
                    <div className="asset-card"><div className="asset-card-content"><div className="asset-card-info"><h3>수익률</h3><p className={`value ${portfolioStats.profitPercent >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPercent(portfolioStats.profitPercent)}</p></div><div className={`asset-card-icon ${portfolioStats.profitPercent >= 0 ? 'red' : 'blue'}`}>{portfolioStats.profitPercent >= 0 ? <TrendingUp size={24} color="white" /> : <TrendingDown size={24} color="white" />}</div></div></div>
                </div>
                
                {/* 성능 통계 표시 (관리자 전용) */}
                {isAdmin() && (
                    <div style={{ 
                        marginTop: '10px', 
                        padding: '8px 12px', 
                        background: '#f0f9ff', 
                        borderRadius: '6px', 
                        fontSize: '0.8rem', 
                        color: '#0369a1',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            🚀 성능 최적화 상태: 캐시 적중 {cacheStatus.hits}회, 누락 {cacheStatus.misses}회 
                            (절약률: {cacheStatus.hits + cacheStatus.misses > 0 ? Math.round((cacheStatus.hits / (cacheStatus.hits + cacheStatus.misses)) * 100) : 0}%)
                        </div>
                        {lastBatchLoad && (
                            <div>마지막 배치로드: {lastBatchLoad.toLocaleTimeString()}</div>
                        )}
                    </div>
                )}
            </section>

            {/* 시장 전체 상황 표시 */}
            {marketCondition && marketCondition.name && (
                <section className="market-condition-section" style={{
                    background: marketCondition.impact > 0 ? 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)' :
                                marketCondition.impact < 0 ? 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)' :
                                '#f5f5f5',
                    border: `2px solid ${marketCondition.impact > 0 ? '#4caf50' : marketCondition.impact < 0 ? '#f44336' : '#9e9e9e'}`,
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '20px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div>
                            <h3 style={{
                                margin: 0,
                                fontSize: '1.2rem',
                                color: marketCondition.impact > 0 ? '#2e7d32' : marketCondition.impact < 0 ? '#c62828' : '#424242',
                                fontWeight: 'bold'
                            }}>
                                📊 시장 상황: {marketCondition.name}
                            </h3>
                            <p style={{margin: '8px 0 0 0', color: '#666', fontSize: '0.9rem'}}>
                                {marketCondition.description}
                            </p>
                        </div>
                        <div style={{
                            fontSize: '2rem',
                            fontWeight: 'bold',
                            color: marketCondition.impact > 0 ? '#2e7d32' : marketCondition.impact < 0 ? '#c62828' : '#424242'
                        }}>
                            {marketCondition.impact > 0 ? '📈' : marketCondition.impact < 0 ? '📉' : '➡️'}
                            <span style={{fontSize: '1.5rem', marginLeft: '8px'}}>
                                {marketCondition.impact > 0 ? '+' : ''}{(marketCondition.impact * 100).toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </section>
            )}

            <section className="news-section">
                <div className="news-header" onClick={() => setShowNews(!showNews)}>
                    <h3 className="news-title">📰 최신 뉴스</h3>
                    <div className={`news-toggle ${showNews ? 'expanded' : ''}`}>
                        {showNews ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                </div>
                <div className={`news-content ${showNews ? 'expanded' : ''}`}>
                    {displayedNews.length > 0 ? (
                        <>
                            {displayedNews.map(news => {
                                // 안전한 타임스탬프 처리
                                const newsTime = news.timestamp instanceof Date
                                    ? news.timestamp
                                    : new Date(news.timestamp || Date.now());

                                return (
                                    <div key={news.id} className="news-item">
                                        <div className="news-meta">
                                            <span className="news-time">
                                                {newsTime.toLocaleTimeString('ko-KR', {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit',
                                                    hour12: true
                                                })}
                                            </span>
                                            {news.source && (
                                                <span className={`news-source ${news.source}`}>
                                                    {news.source === 'central' ? '🌐 중앙' : '🏫 클래스'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="news-headline">
                                            <strong>{news.title || '제목 없음'}</strong>
                                            {news.content && <span className="news-content"> - {news.content}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                            {newsFeed.length > 3 && (
                                <button
                                    onClick={() => setShowAllNews(!showAllNews)}
                                    className="btn btn-secondary"
                                    style={{ marginTop: '10px', width: '100%' }}
                                >
                                    {showAllNews ? `접기` : `더보기 (${newsFeed.length - 3}개 더)`}
                                </button>
                            )}
                        </>
                    ) : (
                        <p>새로운 뉴스가 없습니다.</p>
                    )}
                </div>
            </section>

            <section className="market-list-section">
                <div className="section-header">
                    <h2 className="section-title">📈 투자 시장</h2>
                    <div className="update-indicator">
                        <button onClick={handleManualRefresh} disabled={isFetching} className="btn btn-secondary" style={{padding: '4px 8px', fontSize: '0.75rem'}}>
                            <RefreshCw size={12} />
                            {isFetching ? '갱신중...' : '새로고침'}
                        </button>
                        {lastUpdated && <span style={{fontSize: '0.75rem', color: '#6b7280'}}>마지막 갱신: {lastUpdated.toLocaleTimeString()}</span>}
                    </div>
                </div>

                <div className="market-tabs">
                    <button onClick={() => setActiveTab("stocks")} className={`tab-button ${activeTab === "stocks" ? "active" : ""}`}>주식</button>
                    <button onClick={() => setActiveTab("etfs")} className={`tab-button ${activeTab === "etfs" ? "active" : ""}`}>ETF/지수</button>
                    <button onClick={() => setActiveTab("bonds")} className={`tab-button ${activeTab === "bonds" ? "active" : ""}`}>채권</button>
                </div>

                <div className="market-grid">
                    {displayedStocks.map(stock => {
                        const priceHistory = stock.priceHistory || [stock.price];
                        const priceChange = priceHistory.length >= 2 ? ((priceHistory.slice(-1)[0] - priceHistory.slice(-2)[0]) / priceHistory.slice(-2)[0]) * 100 : 0;
                        return (
                            <div key={stock.id} className={`stock-card ${priceChange > 0 ? 'price-up' : priceChange < 0 ? 'price-down' : ''}`}>
                                <div className="stock-card-header">
                                    <div className="stock-info">
                                        <h3>{getProductIcon(stock.productType)} {stock.name}</h3>
                                        <div className="stock-badges">
                                            <span className={`stock-badge ${getProductBadgeClass(stock.productType)}`}>
                                                {stock.productType === PRODUCT_TYPES.BOND ? `${stock.maturityYears}년 ${stock.couponRate}%` : SECTORS[stock.sector]?.name || '기타'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="stock-price-section">
                                        <div className="stock-price">{formatCurrency(stock.price)}</div>
                                        <div className={`stock-change ${priceChange > 0 ? 'up' : 'down'}`}>
                                            <span>{formatPercent(priceChange)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="stock-actions">
                                    <input type="number" min="1" value={buyQuantities[stock.id] || ''} onChange={e => setBuyQuantities(p => ({ ...p, [stock.id]: e.target.value }))} placeholder="수량" className="quantity-input" />
                                    <button onClick={() => buyStock(stock.id, buyQuantities[stock.id])} disabled={!buyQuantities[stock.id] || isTrading || !marketOpen} className="trade-button buy">매수</button>
                                </div>
                                <div className="cost-display">
                                    {buyQuantities[stock.id] && `예상 비용: ${formatCurrency(stock.price * parseInt(buyQuantities[stock.id]) * (1 + COMMISSION_RATE))}`}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {filteredStocks.length > 20 && (
                  <div className="load-more-container">
                    <button onClick={() => setShowAllStocks(!showAllStocks)} className="load-more-button">
                      {showAllStocks ? "접기" : "더 보기"}
                    </button>
                  </div>
                )}
            </section>
            <section className="portfolio-section">
                <div className="section-header">
                    <h2 className="section-title">💼 내 포트폴리오</h2>
                </div>
                <div className="portfolio-cards">
                    {portfolio.length === 0 ? <p className="no-transactions">보유한 상품이 없습니다.</p> : portfolio.map(holding => {
                        const stock = stocksMap.get(holding.stockId);

                        // 휴지조각 주식 처리 (상장폐지로 가치 0이 된 주식)
                        if (holding.isWorthless) {
                            return (
                                <div key={holding.id} className="portfolio-card delisted">
                                    <div className="portfolio-card-header">
                                        <div className="stock-title-section">
                                            <h3 className="stock-name">{holding.stockName}</h3>
                                            <span className="stock-status delisted">🗑️ 휴지조각</span>
                                        </div>
                                        <div className="stock-quantity">{holding.quantity}<span className="unit">주</span></div>
                                    </div>
                                    <div className="portfolio-metrics-compact">
                                        <div className="metrics-row">
                                            <div className="metric-item"><span className="metric-label">현재 가치</span><span className="metric-value" style={{color: '#ef4444', fontWeight: 'bold'}}>0원</span></div>
                                            <div className="metric-item"><span className="metric-label">손실</span><span className="metric-value" style={{color: '#ef4444'}}>-100%</span></div>
                                        </div>
                                    </div>
                                    <p style={{fontSize: '0.85rem', color: '#6b7280', marginTop: '8px'}}>상장폐지된 상품입니다. 10분 후 자동 삭제됩니다.</p>
                                    <div className="portfolio-card-actions">
                                        <button onClick={() => deleteHolding(holding.id)} className="action-btn delete-btn">지금 삭제</button>
                                    </div>
                                </div>
                            );
                        }

                        if (!stock) return null;
                        const currentValue = stock.price * holding.quantity;
                        const investedValue = holding.averagePrice * holding.quantity;
                        const profit = currentValue - investedValue;
                        const profitPercent = investedValue > 0 ? (profit / investedValue) * 100 : 0;
                        const isLocked = !!lockTimers[holding.id];
                        const canSell = !isLocked;

                        return (
                            <div key={holding.id} className={`portfolio-card ${profit >= 0 ? 'profit' : 'loss'}`}>
                                <div className="portfolio-card-header">
                                    <div className="stock-title-section">
                                        <h3 className="stock-name">{getProductIcon(stock.productType)} {holding.stockName}</h3>
                                        {isLocked && (
                                            <span style={{
                                                fontSize: '0.75rem',
                                                padding: '2px 8px',
                                                background: '#fef3c7',
                                                color: '#92400e',
                                                borderRadius: '4px',
                                                fontWeight: 'bold',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                <Lock size={12} />
                                                매도 불가
                                            </span>
                                        )}
                                    </div>
                                    <div className="stock-quantity">{holding.quantity}<span className="unit">주</span></div>
                                </div>
                                <div className="portfolio-metrics-compact">
                                    <div className="metrics-row">
                                        <div className="metric-item"><span className="metric-label">평균 매수가</span><span className="metric-value">{formatCurrency(holding.averagePrice)}</span></div>
                                        <div className="metric-item"><span className="metric-label">현재가</span><span className="metric-value current">{formatCurrency(stock.price)}</span></div>
                                    </div>
                                </div>
                                <div className={`profit-summary ${profit >= 0 ? 'profit' : 'loss'}`}>
                                    <div className="profit-amount">{formatCurrency(profit)}</div>
                                    <div className="profit-percent">{formatPercent(profitPercent)}</div>
                                </div>
                                {isLocked && (
                                    <div style={{
                                        padding: '10px 12px',
                                        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px',
                                        marginTop: '8px',
                                        border: '1px solid #fbbf24'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontSize: '0.9rem',
                                            color: '#92400e',
                                            fontWeight: 'bold'
                                        }}>
                                            <Lock size={16} />
                                            <span>매도 제한 시간</span>
                                        </div>
                                        <div style={{
                                            fontSize: '1.1rem',
                                            color: '#78350f',
                                            fontWeight: 'bold',
                                            textAlign: 'center',
                                            marginTop: '4px',
                                            fontFamily: 'monospace'
                                        }}>
                                            ⏱️ {formatTime(lockTimers[holding.id])} 남음
                                        </div>
                                    </div>
                                )}
                                <div className="portfolio-card-actions">
                                    <div className="trade-section">
                                        <div className="trade-input-group">
                                            <input type="number" min="1" max={holding.quantity} value={sellQuantities[holding.id] || ''} onChange={e => setSellQuantities(p => ({ ...p, [holding.id]: e.target.value }))} placeholder="매도 수량" className="trade-input" disabled={!!lockTimers[holding.id] || !marketOpen} />
                                            <button onClick={() => sellStock(holding.id, sellQuantities[holding.id])} disabled={!sellQuantities[holding.id] || isTrading || !!lockTimers[holding.id] || !marketOpen} className="action-btn sell-btn">매도</button>
                                        </div>
                                        {sellQuantities[holding.id] && !lockTimers[holding.id] && (
                                            <div className="expected-amount">
                                                예상 수익: {formatCurrency((stock.price * parseInt(sellQuantities[holding.id])) * (1 - COMMISSION_RATE) - calculateStockTax(Math.max(0, (stock.price - holding.averagePrice) * parseInt(sellQuantities[holding.id])), stock.productType))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </main>
    </div>
  );
};

export default StockExchange;