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
import { db } from "./firebase";
import { applyStockTax } from "./utils/taxUtils";
// 자동 상장/폐지는 Firebase Functions에서 처리 (10분마다)
// import { startAutoManagementScheduler } from "./services/stockAutoManagementService";
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
      if (cached) return cached;
    }

    // 이미 같은 배치 요청이 진행 중이면 대기
    if (this.pendingRequests.has(batchKey)) {
      return await this.pendingRequests.get(batchKey);
    }

    const batchPromise = this._executeBatchLoad(classCode, userId);
    this.pendingRequests.set(batchKey, batchPromise);
    
    try {
      const result = await batchPromise;
      globalCache.set(batchKey, result, 3 * 60 * 1000);
      return result;
    } finally {
      this.pendingRequests.delete(batchKey);
    }
  },

  _executeBatchLoad: async function(classCode, userId) {
    const [stocks, portfolio, news, marketOpen] = await Promise.all([
      this._loadStocks(classCode),
      this._loadPortfolio(userId, classCode),
      this._loadNews(classCode),
      this._loadMarketStatus(classCode)
    ]);

    return {
      stocks: stocks || [],
      portfolio: portfolio || [],
      news: news || [],
      marketOpen: marketOpen || false,
      errors: []
    };
  },

  _loadStocks: async function(classCode) {
    try {
      const stocksRef = collection(db, "CentralStocks");
      const q = query(stocksRef, where("isListed", "==", true));
      const querySnapshot = await getDocs(q);

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

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('[batchDataLoader] Portfolio load error:', error);
      return [];
    }
  },

  _loadNews: async function(classCode) {
    try {
      const allNews = [];

      // 중앙 뉴스만 가져오기
      try {
        const centralNewsRef = collection(db, "CentralNews");
        const centralActiveQuery = query(
          centralNewsRef,
          where("isActive", "==", true),
          orderBy("timestamp", "desc"),
          limit(15)
        );
        const centralSnapshot = await getDocs(centralActiveQuery);

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

      // 시간순으로 정렬
      return allNews.sort((a, b) => b.timestamp - a.timestamp);

    } catch (error) {
      console.error('[batchDataLoader] News load error:', error);
      return [];
    }
  },

  _loadMarketStatus: async function(classCode) {
    try {
      // 현재 한국 시간 기준으로 요일과 시간 확인
      const now = new Date();
      const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
      const day = koreaTime.getDay(); // 0: 일요일, 1: 월요일, ..., 6: 토요일
      const hour = koreaTime.getHours();

      // 월요일(1) ~ 금요일(5), 8시~15시
      const isWeekday = day >= 1 && day <= 5;
      const isOpenHour = hour >= 8 && hour < 15;

      return isWeekday && isOpenHour;
    } catch (error) {
      console.error('[batchDataLoader] Market status load error:', error);
      return false;
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

const HOLDING_LOCK_PERIOD = 5 * 60 * 1000;
const COMMISSION_RATE = 0.003;
const TAX_RATE = 0.22;
const BOND_TAX_RATE = 0.154;

const CACHE_TTL = {
  BATCH_DATA: 1000 * 60, // 1 minute
  STOCKS: 1000 * 60 * 5, // 5 minutes
  PORTFOLIO: 1000 * 30, // 30 seconds
  NEWS: 1000 * 60 * 2, // 2 minutes
  MARKET_STATUS: 1000 * 60 * 10, // 10 minutes
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
  const timeSinceBuy = Date.now() - holding.lastBuyTime.toDate().getTime();
  return timeSinceBuy >= HOLDING_LOCK_PERIOD;
};

const getRemainingLockTime = (holding) => {
  if (!holding.lastBuyTime) return 0;
  const timeSinceBuy = Date.now() - holding.lastBuyTime.toDate().getTime();
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
  const keysToDelete = [];
  for (const key of globalCache.keys()) {
    if (key.includes(pattern)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => globalCache.delete(key));
};

// === 관리자 패널 컴포넌트 ===
const AdminPanel = React.memo(({ stocks, classCode, onClose, onAddStock, onDeleteStock, onEditStock, onToggleManualStock, cacheStats }) => {
    const [showAddForm, setShowAddForm] = useState(false);
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
  const { user, userDoc, isAdmin, loading: authLoading, firebaseReady } = useAuth();

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

  useEffect(() => {
    if (userDoc?.classCode) {
      setClassCode(userDoc.classCode);
    }
  }, [userDoc]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newTimers = {};
      portfolio.forEach(holding => {
        const remaining = getRemainingLockTime(holding);
        if (remaining > 0) {
          newTimers[holding.id] = remaining;
        }
      });
      setLockTimers(newTimers);
      
      // 캐시 통계 업데이트
      setCacheStatus({
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        savings: cacheStats.savings
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [portfolio]);

  // === 최적화된 데이터 가져오기 함수 (배치 처리 사용) ===
  const fetchAllData = useCallback(async (forceRefresh = false) => {
    if (!classCode || !user) return;

    // 🔥 isFetching을 ref로 체크 (state 대신)
    if (isFetchingRef.current) {
      return;
    }

    const now = Date.now();
    const timeSinceLastBatch = now - lastFetchTimeRef.current.batchLoad;

    // 강제 새로고침이거나 캐시가 만료된 경우에만 로드
    if (!forceRefresh && timeSinceLastBatch <= CACHE_TTL.BATCH_DATA) {
      return;
    }

    isFetchingRef.current = true;
    setIsFetching(true);

    try {
      const batchResult = await batchDataLoader.loadBatchData(classCode, user.uid, forceRefresh);

      if (batchResult.errors && batchResult.errors.length > 0) {
        console.warn('[StockExchange] 배치 로드 중 일부 오류 발생:', batchResult.errors);
      }

      setStocks(batchResult.stocks || []);
      setPortfolio(batchResult.portfolio || []);
      setNewsFeed(batchResult.news || []);
      setMarketOpen(batchResult.marketOpen || false);

      lastFetchTimeRef.current.batchLoad = now;
      lastFetchTimeRef.current.stocks = now;
      lastFetchTimeRef.current.portfolio = now;
      lastFetchTimeRef.current.news = now;
      lastFetchTimeRef.current.marketStatus = now;

      setLastBatchLoad(new Date());
      setLastUpdated(new Date());

    } catch (error) {
      console.error('[StockExchange] 배치 로드 실패:', error);
      alert('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      isFetchingRef.current = false;
      setIsFetching(false);
    }
  }, [classCode, user]);

  // === 초기 데이터 로드 및 조건부 자동 새로고침 (읽기 비용 최적화) ===
  useEffect(() => {
    if (!user || !firebaseReady || !classCode) return;

    // 초기 로드
    fetchAllData(true);

    // 페이지 가시성 상태 추적
    let isPageVisible = !document.hidden;
    let pollingInterval = null;

    // 폴링 시작/중지 함수
    const startPolling = () => {
      if (pollingInterval) return; // 이미 실행 중이면 무시

      pollingInterval = setInterval(() => {
        // 페이지가 보이고 있고, 시장이 열려있을 때만 폴링
        if (isPageVisible && marketOpen) {
          fetchAllData(false);
        }
      }, 5 * 60 * 1000); // 5분 간격
    };

    const stopPolling = () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };

    // 페이지 가시성 변경 감지
    const handleVisibilityChange = () => {
      isPageVisible = !document.hidden;

      if (isPageVisible && marketOpen) {
        // 페이지가 다시 활성화되고 시장이 열려있으면 즉시 데이터 갱신 후 폴링 시작
        fetchAllData(false);
        startPolling();
      } else {
        // 페이지가 비활성화되거나 시장이 닫혔으면 폴링 중지
        stopPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 시장이 열려있고 페이지가 활성화되어 있으면 폴링 시작
    if (marketOpen && isPageVisible) {
      startPolling();
    }

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // 🔥 fetchAllData는 useCallback으로 메모이제이션되어 있으므로 의존성에 포함 안전
  }, [user, firebaseReady, classCode, marketOpen, fetchAllData]);

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
    if (!classCode) return alert("클래스 정보가 없습니다.");
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
      
      // 선택적 캐시 무효화
      invalidateCache(`STOCKS_${classCode}`);
      invalidateCache(`BATCH_${classCode}`);
      await fetchAllData(true);
      
      alert(`${stockData.name} 상품이 추가되었습니다.`);
    } catch (error) { 
      alert("상품 추가 중 오류가 발생했습니다."); 
    }
  }, [classCode, fetchAllData]);

  const deleteStock = useCallback(async (stockId, stockName) => {
    if (!classCode) return alert("클래스 정보가 없습니다.");
    if (window.confirm(`'${stockName}' 상품을 정말로 삭제하시겠습니까?`)) {
      try {
        await deleteDoc(doc(db, "CentralStocks", stockId));
        
        invalidateCache(`STOCKS_${classCode}`);
        invalidateCache(`BATCH_${classCode}`);
        await fetchAllData(true);
        
        alert(`${stockName} 상품이 삭제되었습니다.`);
      } catch (error) { 
        alert("상품 삭제 중 오류가 발생했습니다."); 
      }
    }
  }, [classCode, fetchAllData]);

  const editStock = useCallback(async (stockId) => {
    if (!classCode) return alert("클래스 정보가 없습니다.");
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
      
      invalidateCache(`STOCKS_${classCode}`);
      invalidateCache(`BATCH_${classCode}`);
      await fetchAllData(true);
      
      alert('가격이 수정되었습니다.');
    } catch (error) { 
      alert("가격 수정 중 오류가 발생했습니다."); 
    }
  }, [stocks, classCode, fetchAllData]);

  const toggleManualStock = useCallback(async (stockId, currentIsListed) => {
    if (!classCode) return alert("클래스 정보가 없습니다.");
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
        
        invalidateCache(`STOCKS_${classCode}`);
        invalidateCache(`PORTFOLIO`);
        invalidateCache(`BATCH_${classCode}`);
        await fetchAllData(true);
        
        alert(`${action} 처리되었습니다.`);
      } catch (error) { 
        alert(`${action} 처리 중 오류가 발생했습니다.`); 
      }
    }
  }, [stocks, classCode, fetchAllData]);

  const buyStock = useCallback(async (stockId, quantityString) => {
    if (!marketOpen) return alert("주식시장이 마감되었습니다. 운영 시간: 월-금 오전 8시-오후 3시");
    if (isTrading || !classCode) return;
    const quantity = parseInt(quantityString, 10);
    if (isNaN(quantity) || quantity <= 0) return alert("유효한 수량을 입력해주세요.");
    const stock = stocks.find(s => s.id === stockId);
    if (!user || !stock || !stock.isListed) return alert("매수할 수 없는 상태입니다.");
    const cost = stock.price * quantity;
    const commission = Math.round(cost * COMMISSION_RATE);

    // 거래세 계산
    const taxResult = await applyStockTax(classCode, user.uid, cost, '매수');
    const { taxAmount } = taxResult;
    const totalCost = cost + commission + taxAmount;

    setIsTrading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", user.uid);
        const stockRef = doc(db, "CentralStocks", stockId);
        const holdingRef = doc(db, "users", user.uid, "portfolio", stockId);

        const userDocSnapshot = await transaction.get(userRef);
        if (!userDocSnapshot.exists() || userDocSnapshot.data().cash < totalCost)
          throw new Error(`현금이 부족합니다. (매수비용: ${cost.toLocaleString()}원 + 수수료: ${commission.toLocaleString()}원 + 거래세: ${taxAmount.toLocaleString()}원 = 총 ${totalCost.toLocaleString()}원 필요)`);
        
        const holdingDoc = await transaction.get(holdingRef);
        if (holdingDoc.exists()) {
          const holdingData = holdingDoc.data();
          const newQuantity = holdingData.quantity + quantity;
          const newAveragePrice = Math.round(((holdingData.averagePrice * holdingData.quantity) + cost) / newQuantity);
          transaction.update(holdingRef, {
            quantity: newQuantity,
            averagePrice: newAveragePrice,
            updatedAt: serverTimestamp(),
            lastBuyTime: serverTimestamp()
          });
        } else {
          transaction.set(holdingRef, {
            stockId,
            stockName: stock.name,
            quantity,
            averagePrice: stock.price,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastBuyTime: serverTimestamp(),
            delistedAt: null,
            classCode,
            productType: stock.productType || PRODUCT_TYPES.STOCK
          });
          transaction.update(stockRef, {
            holderCount: increment(1),
          });
        }
        
        transaction.update(stockRef, {
          tradingVolume: increment(quantity),
          buyVolume: increment(quantity),
          recentBuyVolume: increment(quantity * 0.3)
        });
        
        transaction.update(userRef, { cash: increment(-totalCost) });
      });
      
      if (commission > 0 && userDoc?.classCode) 
        await updateNationalTreasury(commission, 'commission', userDoc.classCode);
      
      invalidateCache(`PORTFOLIO_user_${user.uid}`);
      invalidateCache(`STOCKS_${classCode}`);
      invalidateCache(`BATCH_${classCode}`);
      await fetchAllData(true);
      
      setBuyQuantities(prev => ({ ...prev, [stockId]: "" }));
      alert(`${stock.name} ${quantity}주 매수 완료!\n수수료: ${formatCurrency(commission)}`);
    } catch (error) { 
      alert(error.message); 
    } finally { 
      setIsTrading(false); 
    }
  }, [stocks, user, userDoc, isTrading, classCode, marketOpen, fetchAllData]);

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
      return alert(`매수 후 ${HOLDING_LOCK_PERIOD / 60000}분간은 매도할 수 없습니다.\n남은 시간: ${formatTime(remaining)}`);
    }

    const stock = stocks.find(s => s.id === holding.stockId);
    if (!stock || !stock.isListed) return alert("현재 거래할 수 없는 상품입니다.");
    const sellPrice = stock.price * quantity;
    const commission = Math.round(sellPrice * COMMISSION_RATE);
    const profit = (stock.price - holding.averagePrice) * quantity;

    // 기존 양도소득세와 새로운 거래세 모두 적용
    const existingTax = calculateStockTax(profit, stock.productType);
    const taxResult = await applyStockTax(classCode, user.uid, sellPrice, '매도');
    const { taxAmount: transactionTax } = taxResult;
    const totalTax = existingTax + transactionTax;
    const netRevenue = sellPrice - commission - totalTax;
    setIsTrading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", user.uid);
        const holdingRef = doc(db, "users", user.uid, "portfolio", holdingId);
        const stockRef = doc(db, "CentralStocks", holding.stockId);
        
        const currentHoldingDoc = await transaction.get(holdingRef);
        if (!currentHoldingDoc.exists() || currentHoldingDoc.data().quantity < quantity) 
          throw new Error("보유 수량이 변경되었습니다.");
        
        transaction.update(userRef, { cash: increment(netRevenue) });
        
        if (currentHoldingDoc.data().quantity === quantity) {
          transaction.delete(holdingRef);
          transaction.update(stockRef, {
            holderCount: increment(-1),
          });
        } else {
          transaction.update(holdingRef, {
            quantity: increment(-quantity),
            updatedAt: serverTimestamp()
          });
        }
        
        transaction.update(stockRef, {
          sellVolume: increment(quantity),
          recentSellVolume: increment(quantity * 0.3)
        });
      });
      
      if (totalTax > 0 && userDoc?.classCode) await updateNationalTreasury(totalTax, 'tax', userDoc.classCode);
      if (commission > 0 && userDoc?.classCode) await updateNationalTreasury(commission, 'commission', userDoc.classCode);

      invalidateCache(`PORTFOLIO_user_${user.uid}`);
      invalidateCache(`STOCKS_${classCode}`);
      invalidateCache(`BATCH_${classCode}`);
      await fetchAllData(true);

      setSellQuantities(prev => ({ ...prev, [holdingId]: "" }));
      const taxInfo = totalTax > 0 ? `\n세금: ${formatCurrency(totalTax)}` : '';
      alert(`${stock.name} ${quantity}주 매도 완료!\n수익: ${formatCurrency(profit)}${taxInfo}\n수수료: ${formatCurrency(commission)}\n순수익: ${formatCurrency(netRevenue)}`);
    } catch (error) { 
      alert(error.message); 
    } finally { 
      setIsTrading(false); 
    }
  }, [stocks, portfolio, user, userDoc, isTrading, marketOpen, fetchAllData]);

  const deleteHolding = useCallback(async (holdingId) => {
    if (!user) return;
    if (window.confirm("이 상품(휴지조각)을 포트폴리오에서 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, "users", user.uid, "portfolio", holdingId));
        
        invalidateCache(`PORTFOLIO_user_${user.uid}`);
        invalidateCache(`BATCH_${classCode}`);
        await fetchAllData(true);
        
        alert("삭제되었습니다.");
      } catch (error) { 
        alert("삭제 중 오류가 발생했습니다."); 
      }
    }
  }, [user, classCode, fetchAllData]);

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
    fetchAllData(true);
  }, [fetchAllData]);

  if (authLoading || !firebaseReady) return <div className="loading-message">데이터를 불러오는 중입니다...</div>;
  if (!user || !userDoc) return <div className="loading-message">로그인이 필요합니다.</div>;
  if (!classCode && !authLoading) return <div className="loading-message">참여 중인 클래스 정보를 불러오는 중...</div>;
  if (showAdminPanel && isAdmin()) return <AdminPanel stocks={stocks} classCode={classCode} onClose={() => setShowAdminPanel(false)} onAddStock={addStock} onDeleteStock={deleteStock} onEditStock={editStock} onToggleManualStock={toggleManualStock} cacheStats={cacheStatus} />; 

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
                        <span>종합지수: {marketCondition.index} {marketCondition.trend === 'bull' ? '📼' : marketCondition.trend === 'bear' ? '📽' : ''}</span>
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
                        return (
                            <div key={holding.id} className={`portfolio-card ${profit >= 0 ? 'profit' : 'loss'}`}>
                                <div className="portfolio-card-header">
                                    <div className="stock-title-section">
                                        <h3 className="stock-name">{getProductIcon(stock.productType)} {holding.stockName}</h3>
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
                                {lockTimers[holding.id] && (
                                    <div style={{
                                        padding: '8px',
                                        background: '#fef3c7',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '0.85rem',
                                        color: '#92400e',
                                        marginTop: '8px'
                                    }}>
                                        <Lock size={16} />
                                        <span>매도 제한: {formatTime(lockTimers[holding.id])} 남음</span>
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