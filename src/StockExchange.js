import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import "./StockExchange.css"; // 이 CSS 파일이 프로젝트 내에 있어야 합니다.
import { useAuth } from "./AuthContext"; // AuthContext가 필요합니다.
import { db } from "./firebase"; // firebase 설정 파일이 필요합니다.
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  where,
  getDoc,
  getDocs,
  serverTimestamp,
  increment,
  writeBatch,
  runTransaction,
} from "firebase/firestore";

// === 아이콘 컴포넌트들 ===
const TrendingUp = ({ size = 24, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
  >
    <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
    <polyline points="16,7 22,7 22,13" />
  </svg>
);

const TrendingDown = ({ size = 24, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
  >
    <polyline points="22,17 13.5,8.5 8.5,13.5 2,7" />
    <polyline points="16,17 22,17 22,11" />
  </svg>
);

const Settings = ({ size = 24, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m17.5-3.5L19 10m-2 2l-2.5 2.5M6.5 6.5L9 9m-2 2l-2.5 2.5" />
  </svg>
);

const Plus = ({ size = 24, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const BarChart3 = ({ size = 24, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
  >
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </svg>
);

const Trash2 = ({ size = 16, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
);

// === 포맷 함수 ===
const formatCurrency = (amount) => {
  if (typeof amount !== "number" || isNaN(amount)) return "0원";
  return new Intl.NumberFormat("ko-KR").format(Math.round(amount)) + "원";
};

const formatPercent = (percent) => {
  const num = parseFloat(percent);
  if (isNaN(num)) return "0.00%";
  return (num >= 0 ? "+" : "") + num.toFixed(2) + "%";
};

// === 세금 계산 함수 ===
const calculateStockTax = (profit) => {
  return profit > 0 ? Math.round(profit * 0.01) : 0;
};

// === 국고 연동 함수 ===
const updateNationalTreasury = async (taxAmount) => {
  if (taxAmount <= 0) return;
  try {
    const treasuryRef = doc(db, "government", "nationalTreasury");
    await runTransaction(db, async (transaction) => {
      const treasuryDoc = await transaction.get(treasuryRef);
      if (treasuryDoc.exists()) {
        transaction.update(treasuryRef, {
          totalAmount: increment(taxAmount),
          stockTaxRevenue: increment(taxAmount),
          lastStockTaxUpdate: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
      } else {
        transaction.set(treasuryRef, {
          totalAmount: taxAmount,
          stockTaxRevenue: taxAmount,
          incomeTaxRevenue: 0,
          corporateTaxRevenue: 0,
          otherTaxRevenue: 0,
          createdAt: serverTimestamp(),
          lastStockTaxUpdate: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
      }
    });
    console.log(`국고에 주식세 ${formatCurrency(taxAmount)} 납부 완료`);
  } catch (error) {
    console.error("국고 업데이트 실패:", error);
  }
};

// === 국고 현황 조회 훅 ===
const useNationalTreasury = () => {
  const [treasuryData, setTreasuryData] = useState({
    totalAmount: 0,
    stockTaxRevenue: 0,
    incomeTaxRevenue: 0,
    corporateTaxRevenue: 0,
    otherTaxRevenue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const treasuryRef = doc(db, "government", "nationalTreasury");
    const unsubscribe = onSnapshot(
      treasuryRef,
      (doc) => {
        if (doc.exists()) {
          setTreasuryData(doc.data());
        } else {
          setTreasuryData({
            totalAmount: 0,
            stockTaxRevenue: 0,
            incomeTaxRevenue: 0,
            corporateTaxRevenue: 0,
            otherTaxRevenue: 0,
          });
        }
        setLoading(false);
      },
      (error) => {
        console.error("국고 데이터 로드 실패:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  return { treasuryData, loading };
};

// === 데이터 압축 훅 ===
const useCompressedData = (data) => {
  return useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      isListed: item.isListed,
      isManual: item.isManual,
      minListingPrice: item.minListingPrice,
      initialPrice: item.initialPrice,
      priceHistory: (item.priceHistory || []).slice(-5),
      relistCount: item.relistCount || 0,
      delistedAt: item.delistedAt,
    }));
  }, [data]);
};

// === 지연 로딩 훅 ===
const useLazyTransactions = (user, showTransactions) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!showTransactions || !user) {
      setTransactions([]);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "users", user.uid, "transactions"),
      orderBy("timestamp", "desc"),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const transactionsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(),
      }));
      setTransactions(transactionsData);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, showTransactions]);

  return { transactions, loading };
};

// === 관리자 설정 저장/로드 훅 ===
const useAdminSettings = () => {
  const [settings, setSettings] = useState({
    relistMultiplier: 1.15,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const settingsRef = doc(db, "admin", "settings");
    const unsubscribe = onSnapshot(
      settingsRef,
      (doc) => {
        if (doc.exists()) {
          setSettings(doc.data());
        } else {
          setSettings({
            relistMultiplier: 1.15,
          });
        }
        setLoading(false);
      },
      (error) => {
        console.error("관리자 설정 로드 실패:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const saveSettings = useCallback(async (newSettings) => {
    setSaving(true);
    try {
      const settingsRef = doc(db, "admin", "settings");
      await setDoc(settingsRef, {
        ...newSettings,
        lastUpdated: serverTimestamp(),
        updatedBy: "admin",
      });
      console.log("관리자 설정 저장 완료:", newSettings);
      return true;
    } catch (error) {
      console.error("관리자 설정 저장 실패:", error);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, saving, saveSettings };
};

// === 최적화된 주식 가격 관리 훅 ===
const useOptimizedStockPrices = (initialStocks) => {
  const [stocksData, setStocksData] = useState(initialStocks);
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());
  const batchUpdateQueue = useRef(new Map());
  const isUpdatingRef = useRef(false);

  const flushBatchUpdates = useCallback(async () => {
    if (isUpdatingRef.current || batchUpdateQueue.current.size === 0) return;

    isUpdatingRef.current = true;
    const batch = writeBatch(db);
    const updates = Array.from(batchUpdateQueue.current.entries());

    try {
      updates.forEach(([stockId, updateData]) => {
        const stockRef = doc(db, "stocks", stockId);
        batch.set(
          stockRef,
          {
            ...updateData,
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );
      });

      const marketDataRef = doc(db, "marketData", "currentPrices");
      const marketUpdate = {};
      updates.forEach(([stockId, updateData]) => {
        marketUpdate[stockId] = updateData;
      });

      batch.set(
        marketDataRef,
        {
          ...marketUpdate,
          lastUpdate: serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();
      batchUpdateQueue.current.clear();
      setLastUpdateTime(Date.now());
      console.log(`배치 업데이트 완료: ${updates.length}개 주식`);
    } catch (error) {
      console.error("배치 업데이트 실패:", error);
      console.error("실패한 업데이트:", updates);
      try {
        console.log("개별 업데이트 재시도 중...");
        for (const [stockId, updateData] of updates) {
          const stockRef = doc(db, "stocks", stockId);
          await setDoc(
            stockRef,
            {
              ...updateData,
              lastUpdated: serverTimestamp(),
            },
            { merge: true }
          );
        }
        console.log("개별 업데이트 재시도 성공");
        batchUpdateQueue.current.clear();
        setLastUpdateTime(Date.now());
      } catch (retryError) {
        console.error("개별 업데이트 재시도도 실패:", retryError);
      }
    } finally {
      isUpdatingRef.current = false;
    }
  }, []);

  const updateStockPrices = useCallback(() => {
    setStocksData((prevStocks) => {
      if (!prevStocks || prevStocks.length === 0) return [];

      const updatedStocks = prevStocks.map((stock) => {
        if (!stock || !stock.isListed || stock.isManual) return stock;

        const change = (Math.random() - 0.5) * 0.24;
        const newPrice = Math.max(1, Math.round(stock.price * (1 + change)));

        if (newPrice < (stock.minListingPrice || 1)) {
          console.log(
            `${stock.name} 상장폐지: 현재가 ${newPrice} < 최소가 ${stock.minListingPrice}`
          );

          const updateData = {
            price: newPrice,
            isListed: false,
            delistedAt: new Date(),
            priceHistory: [...(stock.priceHistory || []).slice(-9), newPrice],
          };

          batchUpdateQueue.current.set(stock.id, {
            ...updateData,
            delistedAt: serverTimestamp(),
          });

          return { ...stock, ...updateData };
        }

        const changePercent = Math.abs(newPrice - stock.price) / stock.price;
        if (changePercent >= 0.01) {
          const updateData = {
            price: newPrice,
            priceHistory: [...(stock.priceHistory || []).slice(-9), newPrice],
          };
          batchUpdateQueue.current.set(stock.id, updateData);
        }

        return { ...stock, price: newPrice };
      });

      return updatedStocks;
    });
  }, []);

  return {
    stocks: stocksData,
    setStocks: setStocksData,
    updateStockPrices,
    flushBatchUpdates,
    lastUpdateTime,
  };
};

// === 캐시된 데이터 훅 ===
const useCachedFirestoreData = (collectionPath, queryOptions = {}) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const cacheRef = useRef({});
  const lastFetchRef = useRef(0);

  useEffect(() => {
    if (collectionPath === "dummy") {
      setData([]);
      setLoading(false);
      return;
    }

    const now = Date.now();
    const cacheKey = JSON.stringify({ collectionPath, queryOptions });

    if (
      cacheRef.current[cacheKey] &&
      now - lastFetchRef.current < 5 * 60 * 1000
    ) {
      setData(cacheRef.current[cacheKey]);
      setLoading(false);
      return;
    }

    let q = collection(db, collectionPath);
    if (queryOptions.orderBy) {
      q = query(
        q,
        orderBy(queryOptions.orderBy.field, queryOptions.orderBy.direction)
      );
    }
    if (queryOptions.limit) {
      q = query(q, limit(queryOptions.limit));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        cacheRef.current[cacheKey] = newData;
        lastFetchRef.current = now;
        setData(newData);
        setLoading(false);
      },
      (error) => {
        console.error(`데이터 로드 실패 (${collectionPath}):`, error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [collectionPath, JSON.stringify(queryOptions)]); // 의존성 배열에 queryOptions를 JSON 문자열로 추가

  return { data, loading };
};

// === 실시간 상장폐지 감지 훅 ===
const useDelistedStockDetector = (portfolio, stocksData, user) => {
  useEffect(() => {
    if (!portfolio || !stocksData || !user) return;

    const checkDelistedStocks = async () => {
      const batch = writeBatch(db);
      let hasUpdates = false;

      for (const holding of portfolio) {
        if (holding.isDelisted) continue;

        const stock = stocksData.find((s) => s && s.id === holding.stockId);

        if (stock && stock.delistedAt && !stock.isListed) {
          const holdingCreatedAt = holding.createdAt?.seconds
            ? new Date(holding.createdAt.seconds * 1000)
            : holding.createdAt?.toDate
            ? holding.createdAt.toDate()
            : new Date(0);

          const stockDelistedAt = stock.delistedAt?.seconds
            ? new Date(stock.delistedAt.seconds * 1000)
            : stock.delistedAt?.toDate
            ? stock.delistedAt.toDate()
            : new Date();

          if (holdingCreatedAt < stockDelistedAt) {
            const holdingRef = doc(
              db,
              "users",
              user.uid,
              "portfolio",
              holding.id
            );
            batch.update(holdingRef, {
              isDelisted: true,
              delistedAt: stock.delistedAt,
              updatedAt: serverTimestamp(),
            });
            hasUpdates = true;
            console.log(
              `실시간 감지: ${holding.stockName} 보유분을 상장폐지 처리`
            );
          }
        }
      }

      if (hasUpdates) {
        try {
          await batch.commit();
          console.log("실시간 상장폐지 감지 및 업데이트 완료");
        } catch (error) {
          console.error("실시간 상장폐지 처리 실패:", error);
        }
      }
    };

    checkDelistedStocks();
  }, [portfolio, stocksData, user]);
};

// === 자동 삭제 스케줄러 훅 ===
const useAutoDeleteDelistedHoldings = (portfolio, user) => {
  useEffect(() => {
    if (!portfolio || !user) return;

    const scheduleAutoDelete = () => {
      portfolio.forEach((holding) => {
        if (holding.isDelisted && holding.delistedAt) {
          const delistedTime = holding.delistedAt?.seconds
            ? new Date(holding.delistedAt.seconds * 1000)
            : holding.delistedAt?.toDate
            ? holding.delistedAt.toDate()
            : new Date();

          const deleteTime = new Date(
            delistedTime.getTime() + 24 * 60 * 60 * 1000
          );
          const now = new Date();
          const timeUntilDelete = deleteTime.getTime() - now.getTime();

          if (timeUntilDelete > 0 && timeUntilDelete <= 24 * 60 * 60 * 1000) {
            console.log(
              `${holding.stockName} 자동 삭제 예약: ${Math.round(
                timeUntilDelete / 1000 / 60
              )}분 후`
            );

            setTimeout(async () => {
              try {
                const holdingRef = doc(
                  db,
                  "users",
                  user.uid,
                  "portfolio",
                  holding.id
                );
                const docSnap = await getDoc(holdingRef);
                if (docSnap.exists() && docSnap.data().isDelisted) {
                  await deleteDoc(holdingRef);
                  console.log(
                    `${holding.stockName} 상장폐지 보유분 자동 삭제 완료`
                  );
                  alert(
                    `${holding.stockName} 상장폐지된 보유 주식이 자동으로 삭제되었습니다.`
                  );
                }
              } catch (error) {
                console.error("자동 삭제 실패:", error);
              }
            }, timeUntilDelete);
          } else if (timeUntilDelete <= 0) {
            const holdingRef = doc(
              db,
              "users",
              user.uid,
              "portfolio",
              holding.id
            );
            deleteDoc(holdingRef)
              .then(() => {
                console.log(
                  `${holding.stockName} 만료된 상장폐지 보유분 즉시 삭제 완료`
                );
              })
              .catch((error) => {
                console.error("만료된 보유분 삭제 실패:", error);
              });
          }
        }
      });
    };

    const timerId = setTimeout(scheduleAutoDelete, 5000);
    return () => clearTimeout(timerId);
  }, [portfolio, user]);
};

// === 관리자 패널 컴포넌트 ===
const AdminPanel = ({
  stocksList,
  relistMultiplier,
  setRelistMultiplier,
  addStock,
  toggleManualStock,
  deleteStock,
  editStock,
  onClose,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStock, setNewStock] = useState({
    name: "",
    price: "",
    minListingPrice: "",
    isManual: false,
  });

  const {
    settings,
    loading: settingsLoading,
    saving,
    saveSettings,
  } = useAdminSettings();
  const [tempRelistMultiplier, setTempRelistMultiplier] =
    useState(relistMultiplier);

  useEffect(() => {
    if (!settingsLoading && settings.relistMultiplier) {
      setTempRelistMultiplier(settings.relistMultiplier);
      setRelistMultiplier(settings.relistMultiplier);
    }
  }, [settings, settingsLoading, setRelistMultiplier]);

  const handleSaveRelistMultiplier = async () => {
    const success = await saveSettings({
      ...settings,
      relistMultiplier: tempRelistMultiplier,
    });

    if (success) {
      setRelistMultiplier(tempRelistMultiplier);
      alert(
        `재상장 비율이 ${((tempRelistMultiplier - 1) * 100).toFixed(
          0
        )}%로 저장되었습니다.`
      );
    } else {
      alert("재상장 비율 저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const handleAddStock = async () => {
    if (!newStock.name || !newStock.price || !newStock.minListingPrice) {
      alert("모든 필드를 입력해주세요.");
      return;
    }
    const price = parseFloat(newStock.price);
    const minPrice = parseFloat(newStock.minListingPrice);
    if (price <= 0 || minPrice <= 0) {
      alert("가격은 0보다 커야 합니다.");
      return;
    }
    try {
      await addStock({
        name: newStock.name,
        price: price,
        minListingPrice: minPrice,
        isListed: true,
        isManual: newStock.isManual,
      });
      setNewStock({
        name: "",
        price: "",
        minListingPrice: "",
        isManual: false,
      });
      setShowAddForm(false);
      alert("새 주식이 성공적으로 추가되었습니다.");
    } catch (error) {
      console.error("주식 추가 오류:", error);
      alert("주식 추가 중 오류가 발생했습니다.");
    }
  };

  const handleToggleManualStock = async (stockId, currentIsListed) => {
    try {
      await toggleManualStock(stockId, currentIsListed);
    } catch (error) {
      console.error("주식 상태 변경 오류:", error);
      alert("주식 상태 변경 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteStock = async (stockId, stockName) => {
    if (
      window.confirm(
        `정말로 '${stockName}' 주식을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
      )
    ) {
      try {
        await deleteStock(stockId);
        alert("주식이 성공적으로 삭제되었습니다.");
      } catch (error) {
        console.error("주식 삭제 오류:", error);
        alert("주식 삭제 중 오류가 발생했습니다.");
      }
    }
  };

  const handleEditStockClick = async (stockId) => {
    try {
      await editStock(stockId);
    } catch (error) {
      console.error("주식 가격 수정 오류:", error);
      alert("주식 가격 수정 중 오류가 발생했습니다.");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "30px",
          maxWidth: "900px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "30px",
            borderBottom: "2px solid #f0f0f0",
            paddingBottom: "20px",
          }}
        >
          <h2 style={{ margin: 0, color: "#333", fontSize: "1.8em" }}>
            <Settings size={24} style={{ marginRight: "10px" }} />
            관리자 패널
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "#e74c3c",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "12px 20px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "bold",
            }}
          >
            ✕ 닫기
          </button>
        </div>

        <div style={{ marginBottom: "30px" }}>
          <h3 style={{ color: "#2196F3", marginBottom: "15px" }}>
            ⚙️ 자동 재상장 설정
          </h3>
          <div
            style={{
              background: "#f8f9fa",
              padding: "20px",
              borderRadius: "8px",
              border: "1px solid #e9ecef",
            }}
          >
            <label
              style={{
                display: "block",
                marginBottom: "10px",
                fontWeight: "bold",
              }}
            >
              재상장 비율 (기본값: 115%):
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "15px",
                marginBottom: "15px",
              }}
            >
              <input
                type="number"
                step="0.01"
                min="1"
                value={tempRelistMultiplier}
                onChange={(e) =>
                  setTempRelistMultiplier(parseFloat(e.target.value) || 1.15)
                }
                style={{
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  width: "120px",
                  fontSize: "16px",
                }}
              />
              <span style={{ color: "#666" }}>
                현재: {((tempRelistMultiplier - 1) * 100).toFixed(0)}% 프리미엄
              </span>
              <button
                onClick={handleSaveRelistMultiplier}
                disabled={saving || settingsLoading}
                style={{
                  background: saving ? "#95a5a6" : "#27ae60",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  padding: "10px 20px",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                {saving ? "저장 중..." : "💾 저장"}
              </button>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <span style={{ fontSize: "14px", color: "#666" }}>
                저장된 설정:{" "}
                {((settings.relistMultiplier - 1) * 100).toFixed(0)}% 프리미엄
              </span>
              {tempRelistMultiplier !== settings.relistMultiplier && (
                <span
                  style={{
                    fontSize: "12px",
                    color: "#e74c3c",
                    fontWeight: "bold",
                  }}
                >
                  ⚠️ 변경사항이 저장되지 않았습니다
                </span>
              )}
              {tempRelistMultiplier === settings.relistMultiplier &&
                !settingsLoading && (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#27ae60",
                      fontWeight: "bold",
                    }}
                  >
                    ✅ 저장됨
                  </span>
                )}
            </div>
            <p style={{ margin: "0", color: "#666", fontSize: "14px" }}>
              자동 관리 주식이 상장폐지 후 재상장될 때 적용되는 가격 비율입니다.
              (2분마다 체크)
            </p>
          </div>
        </div>

        <div style={{ marginBottom: "30px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "15px",
            }}
          >
            <h3 style={{ color: "#4CAF50", margin: 0 }}>➕ 새 주식 추가</h3>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                background: showAddForm ? "#95a5a6" : "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              {showAddForm ? "취소" : "+ 추가"}
            </button>
          </div>
          {showAddForm && (
            <div
              style={{
                background: "#f8f9fa",
                padding: "20px",
                borderRadius: "8px",
                border: "1px solid #e9ecef",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "15px",
                  marginBottom: "15px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "5px",
                      fontWeight: "bold",
                    }}
                  >
                    종목명
                  </label>
                  <input
                    type="text"
                    value={newStock.name}
                    onChange={(e) =>
                      setNewStock((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="예: 카카오"
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "5px",
                      fontWeight: "bold",
                    }}
                  >
                    초기 가격
                  </label>
                  <input
                    type="number"
                    value={newStock.price}
                    onChange={(e) =>
                      setNewStock((prev) => ({
                        ...prev,
                        price: e.target.value,
                      }))
                    }
                    placeholder="100000"
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "5px",
                      fontWeight: "bold",
                    }}
                  >
                    최소 상장가
                  </label>
                  <input
                    type="number"
                    value={newStock.minListingPrice}
                    onChange={(e) =>
                      setNewStock((prev) => ({
                        ...prev,
                        minListingPrice: e.target.value,
                      }))
                    }
                    placeholder="50000"
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  />
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <input
                    type="checkbox"
                    id="isManual"
                    checked={newStock.isManual}
                    onChange={(e) =>
                      setNewStock((prev) => ({
                        ...prev,
                        isManual: e.target.checked,
                      }))
                    }
                    style={{ width: "18px", height: "18px" }}
                  />
                  <label htmlFor="isManual" style={{ fontWeight: "bold" }}>
                    수동 관리 주식
                  </label>
                </div>
              </div>
              <button
                onClick={handleAddStock}
                style={{
                  background: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px 24px",
                  cursor: "pointer",
                  fontSize: "16px",
                  fontWeight: "bold",
                }}
              >
                추가하기
              </button>
            </div>
          )}
        </div>

        <div>
          <h3 style={{ color: "#FF9800", marginBottom: "15px" }}>
            📊 주식 관리
          </h3>
          <div style={{ maxHeight: "400px", overflow: "auto" }}>
            {stocksList &&
              stocksList.map((stock) => (
                <div
                  key={stock.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "15px",
                    border: "1px solid #e9ecef",
                    borderRadius: "8px",
                    marginBottom: "10px",
                    background: stock.isListed ? "#fff" : "#f8f9fa",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: "bold",
                        fontSize: "16px",
                        marginBottom: "5px",
                      }}
                    >
                      {stock.name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        marginBottom: "5px",
                      }}
                    >
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: "bold",
                          background: stock.isManual ? "#e74c3c" : "#3498db",
                          color: "white",
                        }}
                      >
                        {stock.isManual ? "수동" : "자동"}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: "bold",
                          background: stock.isListed ? "#27ae60" : "#e74c3c",
                          color: "white",
                        }}
                      >
                        {stock.isListed ? "상장" : "상장폐지"}
                      </span>
                    </div>
                    <div style={{ fontSize: "14px", color: "#666" }}>
                      현재가: {formatCurrency(stock.price)} | 최소가:{" "}
                      {formatCurrency(stock.minListingPrice)} | 재상장:{" "}
                      {stock.relistCount || 0}회
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => handleEditStockClick(stock.id)}
                      style={{
                        background: "#3498db",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontSize: "14px",
                      }}
                    >
                      ✏️ 가격 수정
                    </button>
                    {stock.isManual && (
                      <button
                        onClick={() =>
                          handleToggleManualStock(stock.id, stock.isListed)
                        }
                        style={{
                          background: stock.isListed ? "#e74c3c" : "#3498db",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          padding: "8px 16px",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                      >
                        {stock.isListed ? "🚫 상장폐지" : "📈 재상장"}
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteStock(stock.id, stock.name)}
                      style={{
                        background: "#e74c3c",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontSize: "14px",
                      }}
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// === 메인 컴포넌트 ===
const OptimizedStockExchange = () => {
  const {
    user,
    userDoc,
    isAdmin,
    loading: authLoading,
    firebaseReady,
  } = useAuth();

  const { data: initialStocks, loading: loadingStocks } =
    useCachedFirestoreData("stocks");
  const { data: portfolio, loading: loadingPortfolio } = useCachedFirestoreData(
    user ? `users/${user.uid}/portfolio` : "dummy"
  );

  const [showTransactions, setShowTransactions] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [relistMultiplier, setRelistMultiplier] = useState(1.15);
  const [buyQuantities, setBuyQuantities] = useState({});
  const [sellQuantities, setSellQuantities] = useState({});

  const { settings: adminSettings, loading: adminSettingsLoading } =
    useAdminSettings();

  const compressedStocks = useCompressedData(initialStocks);
  const { transactions: lazyTransactions, loading: transactionsLoading } =
    useLazyTransactions(user, showTransactions);

  const { treasuryData, loading: treasuryLoading } = useNationalTreasury();

  const {
    stocks,
    setStocks,
    updateStockPrices,
    flushBatchUpdates,
    lastUpdateTime,
  } = useOptimizedStockPrices(compressedStocks);

  useEffect(() => {
    if (!adminSettingsLoading && adminSettings.relistMultiplier) {
      setRelistMultiplier(adminSettings.relistMultiplier);
    }
  }, [adminSettings, adminSettingsLoading]);

  useDelistedStockDetector(portfolio, stocks, user);
  useAutoDeleteDelistedHoldings(portfolio, user);

  useEffect(() => {
    if (
      compressedStocks.length > 0 &&
      JSON.stringify(stocks) !== JSON.stringify(compressedStocks)
    ) {
      setStocks(compressedStocks);
    }
  }, [compressedStocks, stocks, setStocks]);

  useEffect(() => {
    if (!firebaseReady) return;

    console.log("자동 주식 가격 업데이트 시작");
    const priceUpdateInterval = setInterval(() => {
      console.log("가격 업데이트 실행 중...");
      updateStockPrices();
    }, 20000);

    const batchFlushInterval = setInterval(() => {
      console.log("배치 업데이트 실행 중...");
      flushBatchUpdates();
    }, 30000);

    return () => {
      clearInterval(priceUpdateInterval);
      clearInterval(batchFlushInterval);
    };
  }, [firebaseReady, updateStockPrices, flushBatchUpdates]);

  useEffect(() => {
    if (!firebaseReady || !stocks || stocks.length === 0) return;

    console.log("자동 재상장 체크 시작 (2분 간격)");
    const relistInterval = setInterval(async () => {
      console.log("재상장 체크 실행 중...");

      const delistedStocks = stocks.filter(
        (stock) => stock && !stock.isListed && !stock.isManual
      );

      console.log(`상장폐지된 자동 주식 ${delistedStocks.length}개 발견`);

      if (delistedStocks.length === 0) return;

      const batch = writeBatch(db);
      const updatedStockList = [...stocks];
      let hasUpdates = false;

      delistedStocks.forEach((stock) => {
        const newPrice = Math.round(stock.minListingPrice * relistMultiplier);
        const newRelistCount = (stock.relistCount || 0) + 1;

        console.log(
          `${stock.name} 재상장: ${formatCurrency(
            stock.minListingPrice
          )} → ${formatCurrency(newPrice)} (${newRelistCount}회째)`
        );

        const stockRef = doc(db, "stocks", stock.id);
        batch.set(
          stockRef,
          {
            price: newPrice,
            isListed: true,
            relistCount: newRelistCount,
            delistedAt: null,
            priceHistory: [newPrice],
            lastUpdated: serverTimestamp(),
            name: stock.name,
            minListingPrice: stock.minListingPrice,
            initialPrice: stock.initialPrice || stock.minListingPrice,
            isManual: stock.isManual || false,
          },
          { merge: true }
        );

        const marketDataRef = doc(db, "marketData", "currentPrices");
        batch.set(
          marketDataRef,
          {
            [stock.id]: {
              price: newPrice,
              isListed: true,
              relistCount: newRelistCount,
              delistedAt: null,
              priceHistory: [newPrice],
            },
            lastUpdate: serverTimestamp(),
          },
          { merge: true }
        );

        const index = updatedStockList.findIndex((s) => s && s.id === stock.id);
        if (index !== -1) {
          updatedStockList[index] = {
            ...updatedStockList[index],
            price: newPrice,
            isListed: true,
            relistCount: newRelistCount,
            delistedAt: null,
            priceHistory: [newPrice],
          };
          hasUpdates = true;
        }
      });

      if (hasUpdates) {
        try {
          await batch.commit();
          console.log(`${delistedStocks.length}개 주식 재상장 완료`);
          setStocks(updatedStockList);
        } catch (error) {
          console.error("재상장 배치 처리 실패:", error);
        }
      }
    }, 2 * 60 * 1000);

    return () => clearInterval(relistInterval);
  }, [stocks, relistMultiplier, firebaseReady, setStocks]);

  const addStock = useCallback(async (stockData) => {
    try {
      console.log("새 주식 추가 시도:", stockData);

      const stockId = `stock_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const stockRef = doc(db, "stocks", stockId);

      await setDoc(stockRef, {
        ...stockData,
        initialPrice: stockData.price,
        relistCount: 0,
        priceHistory: [stockData.price],
        createdAt: serverTimestamp(),
      });

      console.log("주식 문서 생성 완료:", stockId);

      const marketDataRef = doc(db, "marketData", "currentPrices");
      await setDoc(
        marketDataRef,
        {
          [stockId]: {
            price: stockData.price,
            isListed: true,
            relistCount: 0,
            priceHistory: [stockData.price],
            isManual: stockData.isManual,
            minListingPrice: stockData.minListingPrice,
            initialPrice: stockData.price,
          },
        },
        { merge: true }
      );

      console.log("시장 데이터 업데이트 완료");
    } catch (error) {
      console.error("주식 추가 오류:", error);
      throw error;
    }
  }, []);

  const deleteStock = useCallback(
    async (stockId) => {
      try {
        console.log("주식 삭제 시도:", stockId);

        const stockRef = doc(db, "stocks", stockId);
        const batch = writeBatch(db);
        batch.delete(stockRef);
        await batch.commit();

        console.log("주식 삭제 완료:", stockId);
        setStocks((prevStocks) => prevStocks.filter((s) => s.id !== stockId));
      } catch (error) {
        console.error("주식 삭제 오류:", error);
        throw error;
      }
    },
    [setStocks]
  );

  const editStock = useCallback(
    async (stockId) => {
      const stock = stocks.find((s) => s.id === stockId);
      if (!stock) return;

      const newPriceStr = prompt(
        `'${stock.name}'의 새로운 가격을 입력하세요:`,
        stock.price.toString()
      );
      const newPrice = parseFloat(newPriceStr);

      if (isNaN(newPrice) || newPrice <= 0) {
        alert("유효한 가격을 입력해주세요.");
        return;
      }

      try {
        const stockRef = doc(db, "stocks", stockId);
        const marketDataRef = doc(db, "marketData", "currentPrices");
        const batch = writeBatch(db);

        const updateData = {
          price: newPrice,
          priceHistory: [...(stock.priceHistory || []).slice(-9), newPrice],
          updatedAt: serverTimestamp(),
        };

        batch.update(stockRef, updateData);
        batch.set(
          marketDataRef,
          {
            [stockId]: {
              price: newPrice,
              priceHistory: [...(stock.priceHistory || []).slice(-9), newPrice],
            },
          },
          { merge: true }
        );

        await batch.commit();
        console.log("주식 가격 수정 완료:", stockId);

        setStocks((prevStocks) =>
          prevStocks.map((s) => {
            if (s.id === stockId) {
              return { ...s, ...updateData };
            }
            return s;
          })
        );

        alert(
          `${stock.name} 주식 가격이 ${formatCurrency(
            newPrice
          )}로 성공적으로 수정되었습니다.`
        );
      } catch (error) {
        console.error("주식 가격 수정 오류:", error);
        alert("주식 가격 수정 중 오류가 발생했습니다.");
      }
    },
    [stocks, setStocks]
  );

  const toggleManualStock = useCallback(
    async (stockId, currentIsListed) => {
      const stockRef = doc(db, "stocks", stockId);
      const marketDataRef = doc(db, "marketData", "currentPrices");
      const stock = stocks.find((s) => s.id === stockId);
      if (!stock || !stock.isManual || !user) return;

      const batch = writeBatch(db);
      let newPrice;
      let newIsListed;
      let updateData;
      let marketUpdateField;

      if (currentIsListed) {
        const confirmDelist = window.confirm(
          `${stock.name} 주식을 상장폐지 하시겠습니까?\n\n⚠️ 경고:\n- 보유자들의 주식 가치가 0이 됩니다\n- 하루 후 자동으로 삭제됩니다\n- 이 작업은 되돌릴 수 없습니다\n- 한번 상장폐지된 보유 주식은 재상장되어도 복구되지 않습니다`
        );

        if (!confirmDelist) return;

        newPrice = 0;
        newIsListed = false;
        const delistTime = serverTimestamp();

        updateData = {
          price: newPrice,
          isListed: newIsListed,
          delistedAt: delistTime,
          priceHistory: [...(stock.priceHistory || []).slice(-9), newPrice],
          updatedAt: serverTimestamp(),
        };
        marketUpdateField = {
          price: newPrice,
          isListed: newIsListed,
          delistedAt: delistTime,
          priceHistory: [...(stock.priceHistory || []).slice(-9), newPrice],
        };

        alert(
          `${stock.name} 주식이 상장폐지되었습니다.\n보유자들은 다음 로그인 시 또는 실시간 감지를 통해 주식이 상장폐지 처리됩니다.`
        );
      } else {
        newPrice = stock.minListingPrice;
        if (typeof newPrice !== "number" || newPrice <= 0) {
          alert("최소 상장가가 유효하지 않습니다.");
          return;
        }

        const newRelistCount = (stock.relistCount || 0) + 1;
        newIsListed = true;

        updateData = {
          isListed: newIsListed,
          price: newPrice,
          priceHistory: [newPrice],
          relistCount: increment(1),
          delistedAt: null,
          updatedAt: serverTimestamp(),
        };
        marketUpdateField = {
          isListed: newIsListed,
          price: newPrice,
          priceHistory: [newPrice],
          relistCount: newRelistCount,
          delistedAt: null,
        };

        alert(
          `${stock.name} 주식이 ${formatCurrency(
            newPrice
          )}로 재상장되었습니다.\n⚠️ 기존 보유자들의 상장폐지된 주식은 복구되지 않습니다.\n새로 매수해야만 해당 주식을 보유할 수 있습니다.`
        );
      }

      batch.update(stockRef, updateData);
      batch.set(
        marketDataRef,
        { [stockId]: marketUpdateField },
        { merge: true }
      );

      try {
        await batch.commit();
        setStocks((prevStocks) =>
          prevStocks.map((s) => {
            if (s.id === stockId) {
              const updated = { ...s, ...updateData };
              if (updateData.relistCount) {
                updated.relistCount = (s.relistCount || 0) + 1;
              }
              updated.price = newPrice;
              updated.isListed = newIsListed;
              updated.priceHistory = marketUpdateField.priceHistory;
              updated.delistedAt = updateData.delistedAt;
              return updated;
            }
            return s;
          })
        );
      } catch (error) {
        console.error("수동 주식 상태 변경 오류:", error);
        alert("주식 상태 변경 중 오류가 발생했습니다.");
        throw error;
      }
    },
    [stocks, setStocks, user]
  );

  const buyStock = useCallback(
    async (stockId, quantityString) => {
      const quantity = parseInt(quantityString);
      if (isNaN(quantity) || quantity <= 0) {
        alert("유효한 수량을 입력해주세요.");
        return;
      }

      const stock = stocks.find((s) => s.id === stockId);
      if (!user || !userDoc || !stock || !stock.isListed) {
        alert("매수할 수 없는 상태입니다.");
        return;
      }

      if (userDoc.cash < stock.price * quantity) {
        alert("현금이 부족합니다.");
        return;
      }

      const cost = stock.price * quantity;

      try {
        const portfolioQuery = query(
          collection(db, "users", user.uid, "portfolio"),
          where("stockId", "==", stockId)
        );
        const portfolioSnapshot = await getDocs(portfolioQuery);
        const existingHolding = portfolioSnapshot.empty
          ? null
          : {
              id: portfolioSnapshot.docs[0].id,
              ...portfolioSnapshot.docs[0].data(),
            };

        await runTransaction(db, async (transaction) => {
          const userRef = doc(db, "users", user.uid);

          const userSnapshot = await transaction.get(userRef);
          if (!userSnapshot.exists()) {
            throw new Error("사용자 문서를 찾을 수 없습니다.");
          }

          const userData = userSnapshot.data();
          if (userData.cash < cost) {
            throw new Error("현금이 부족합니다.");
          }

          transaction.update(userRef, { cash: increment(-cost) });

          if (existingHolding) {
            const holdingRef = doc(
              db,
              "users",
              user.uid,
              "portfolio",
              existingHolding.id
            );

            if (existingHolding.isDelisted) {
              transaction.update(holdingRef, {
                quantity: quantity,
                averagePrice: stock.price,
                isDelisted: false,
                delistedAt: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } else {
              const newQuantity = existingHolding.quantity + quantity;
              const newAveragePrice = Math.round(
                (existingHolding.averagePrice * existingHolding.quantity +
                  cost) /
                  newQuantity
              );

              transaction.update(holdingRef, {
                quantity: newQuantity,
                averagePrice: newAveragePrice,
                updatedAt: serverTimestamp(),
              });
            }
          } else {
            const portfolioDocId = `${stockId}_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`;
            const newHoldingRef = doc(
              db,
              "users",
              user.uid,
              "portfolio",
              portfolioDocId
            );

            transaction.set(newHoldingRef, {
              stockId,
              stockName: stock.name,
              quantity,
              averagePrice: stock.price,
              isDelisted: false,
              delistedAt: null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          const transactionId = `buy_${stockId}_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          const txRef = doc(
            db,
            "users",
            user.uid,
            "transactions",
            transactionId
          );

          transaction.set(txRef, {
            type: "매수",
            stockId,
            stockName: stock.name,
            quantity,
            price: stock.price,
            total: cost,
            timestamp: serverTimestamp(),
          });
        });

        setBuyQuantities((prev) => ({ ...prev, [stockId]: "" }));
        alert(`${stock.name} ${quantity}주 매수 완료!`);
      } catch (error) {
        console.error("매수 처리 오류:", error);
        alert(`매수 처리 중 오류가 발생했습니다: ${error.message}`);
      }
    },
    [stocks, user, userDoc]
  );

  const sellStock = useCallback(
    async (holdingId, quantityString) => {
      const quantity = parseInt(quantityString);
      if (isNaN(quantity) || quantity <= 0) {
        alert("유효한 수량을 입력해주세요.");
        return;
      }

      const holding = portfolio.find((h) => h.id === holdingId);
      if (!user || !holding || quantity > holding.quantity) {
        alert("매도할 수 없는 상태입니다. (수량 확인)");
        return;
      }

      if (holding.isDelisted) {
        alert("상장폐지된 주식은 매도할 수 없습니다.");
        return;
      }

      const stock = stocks.find((s) => s.id === holding.stockId);
      if (!stock || !stock.isListed) {
        alert("매도할 수 없는 상태입니다. (상장 상태 확인)");
        return;
      }

      const sellPrice = stock.price * quantity;
      const averageCost = holding.averagePrice * quantity;
      const profit = sellPrice - averageCost;
      const stockTax = calculateStockTax(profit);
      const netRevenue = sellPrice - stockTax;

      try {
        await runTransaction(db, async (transaction) => {
          const userRef = doc(db, "users", user.uid);
          const holdingRef = doc(db, "users", user.uid, "portfolio", holdingId);

          const userSnapshot = await transaction.get(userRef);
          const holdingSnapshot = await transaction.get(holdingRef);

          if (!userSnapshot.exists() || !holdingSnapshot.exists()) {
            throw new Error("문서를 찾을 수 없습니다.");
          }

          const currentHoldingData = holdingSnapshot.data();
          if (currentHoldingData.quantity < quantity) {
            throw new Error("보유 수량이 부족합니다.");
          }

          transaction.update(userRef, { cash: increment(netRevenue) });

          if (currentHoldingData.quantity === quantity) {
            transaction.delete(holdingRef);
          } else {
            transaction.update(holdingRef, {
              quantity: increment(-quantity),
              updatedAt: serverTimestamp(),
            });
          }

          const transactionId = `sell_${
            holding.stockId
          }_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const txRef = doc(
            db,
            "users",
            user.uid,
            "transactions",
            transactionId
          );
          transaction.set(txRef, {
            type: "매도",
            stockId: holding.stockId,
            stockName: stock.name,
            quantity,
            price: stock.price,
            total: sellPrice,
            profit: profit,
            stockTax: stockTax,
            netAmount: netRevenue,
            timestamp: serverTimestamp(),
          });
        });

        if (stockTax > 0) {
          await updateNationalTreasury(stockTax);
        }

        setSellQuantities((prev) => ({ ...prev, [holdingId]: "" }));

        if (stockTax > 0) {
          alert(
            `${stock.name} ${quantity}주 매도 완료!\n수익: ${formatCurrency(
              profit
            )}\n주식세: ${formatCurrency(
              stockTax
            )}\n실제 수령액: ${formatCurrency(netRevenue)}`
          );
        } else {
          alert(
            `${stock.name} ${quantity}주 매도 완료!\n${
              profit < 0 ? "손실" : "수익"
            }: ${formatCurrency(Math.abs(profit))}\n수령액: ${formatCurrency(
              netRevenue
            )}`
          );
        }
      } catch (error) {
        console.error("매도 처리 오류:", error);
        alert(`매도 처리 중 오류가 발생했습니다: ${error.message}`);
      }
    },
    [stocks, portfolio, user]
  );

  const deleteHolding = useCallback(
    async (holdingId, stockName) => {
      if (!user) return;
      if (
        window.confirm(
          `정말로 '${stockName}' 보유 주식을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
        )
      ) {
        try {
          const holdingRef = doc(db, "users", user.uid, "portfolio", holdingId);
          await deleteDoc(holdingRef);
          alert(`${stockName} 보유 주식이 성공적으로 삭제되었습니다.`);
        } catch (error) {
          console.error("보유 주식 삭제 오류:", error);
          alert("보유 주식 삭제 중 오류가 발생했습니다.");
        }
      }
    },
    [user]
  );

  const portfolioStats = useMemo(() => {
    let totalValue = 0,
      totalInvested = 0,
      totalProfit = 0;

    portfolio.forEach((holding) => {
      const stock = stocks.find((s) => s && s.id === holding.stockId);

      if (holding.isDelisted) {
        const investedValue = holding.averagePrice * holding.quantity;
        totalInvested += investedValue;
        totalProfit -= investedValue;
      } else if (stock && stock.isListed) {
        const currentValue = stock.price * holding.quantity;
        const investedValue = holding.averagePrice * holding.quantity;
        totalValue += currentValue;
        totalInvested += investedValue;
        totalProfit += currentValue - investedValue;
      } else {
        totalInvested += holding.averagePrice * holding.quantity;
        totalProfit -= holding.averagePrice * holding.quantity;
      }
    });

    const profitPercent =
      totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
    return { totalValue, totalInvested, totalProfit, profitPercent };
  }, [portfolio, stocks]);

  const getPriceChangeInfo = useCallback((stock) => {
    if (!stock) return { change: 0, percent: 0, direction: "neutral" };
    const history = stock.priceHistory || [stock.price];
    if (history.length < 2)
      return { change: 0, percent: 0, direction: "neutral" };

    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    const change = current - previous;
    const percent = previous === 0 ? 0 : (change / previous) * 100;

    return {
      change,
      percent,
      direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
    };
  }, []);

  if (authLoading || !firebaseReady || loadingStocks) {
    return <div className="loading-message">데이터를 불러오는 중입니다...</div>;
  }

  if (!user || !userDoc) {
    return <div className="loading-message">로그인이 필요합니다.</div>;
  }

  if (showAdminPanel && isAdmin()) {
    return (
      <AdminPanel
        stocksList={stocks}
        relistMultiplier={relistMultiplier}
        setRelistMultiplier={setRelistMultiplier}
        addStock={addStock}
        toggleManualStock={toggleManualStock}
        deleteStock={deleteStock}
        editStock={editStock}
        onClose={() => setShowAdminPanel(false)}
      />
    );
  }

  return (
    <div className="stock-exchange-container">
      <div className="stock-header">
        <div className="stock-header-content">
          <div className="logo-title">
            <BarChart3 size={32} color="white" />
            <h1>최적화된 주식 거래소</h1>
          </div>
          <div className="stock-header-actions">
            <div className="user-info-display">
              <span>{userDoc.name || user.displayName || "사용자"}님</span>
              <small style={{ color: "#ccc", marginLeft: 8 }}>
                마지막 업데이트: {new Date(lastUpdateTime).toLocaleTimeString()}
              </small>
              {!treasuryLoading && (
                <div
                  style={{
                    fontSize: "0.9em",
                    color: "#4CAF50",
                    marginLeft: 16,
                  }}
                >
                  💰 국고: {formatCurrency(treasuryData.totalAmount)}
                  <span style={{ fontSize: "0.8em", marginLeft: 8 }}>
                    (주식세: {formatCurrency(treasuryData.stockTaxRevenue)})
                  </span>
                </div>
              )}
            </div>
            {isAdmin() && (
              <button
                onClick={() => setShowAdminPanel(true)}
                className="btn btn-primary"
              >
                <Settings size={16} />
                <span>관리자</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="market-section">
        <div className="asset-summary">
          <div className="asset-cards">
            <div className="asset-card">
              <div className="asset-card-content">
                <div className="asset-card-info">
                  <h3>보유 현금</h3>
                  <p className="value">{formatCurrency(userDoc.cash)}</p>
                </div>
                <div className="asset-card-icon green">
                  <span>💰</span>
                </div>
              </div>
            </div>
            <div className="asset-card">
              <div className="asset-card-content">
                <div className="asset-card-info">
                  <h3>주식 평가액</h3>
                  <p className="value">
                    {formatCurrency(portfolioStats.totalValue)}
                  </p>
                </div>
                <div className="asset-card-icon blue">
                  <span>📊</span>
                </div>
              </div>
            </div>
            <div className="asset-card">
              <div className="asset-card-content">
                <div className="asset-card-info">
                  <h3>총 자산</h3>
                  <p className="value">
                    {formatCurrency(userDoc.cash + portfolioStats.totalValue)}
                  </p>
                </div>
                <div className="asset-card-icon purple">
                  <span>💎</span>
                </div>
              </div>
            </div>
            <div className="asset-card">
              <div className="asset-card-content">
                <div className="asset-card-info">
                  <h3>수익률</h3>
                  <p
                    className={`value ${
                      portfolioStats.profitPercent >= 0
                        ? "profit-positive"
                        : "profit-negative"
                    }`}
                  >
                    {formatPercent(portfolioStats.profitPercent)}
                  </p>
                </div>
                <div
                  className={`asset-card-icon ${
                    portfolioStats.profitPercent >= 0 ? "red" : "blue"
                  }`}
                >
                  {portfolioStats.profitPercent >= 0 ? (
                    <TrendingUp size={24} color="white" />
                  ) : (
                    <TrendingDown size={24} color="white" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="market-list-section">
          <div className="section-header">
            <h2 className="section-title">
              <BarChart3 size={24} />
              주식 시장 (최적화됨)
            </h2>
            <div className="update-indicator">
              <span>🔄 20초마다 가격 업데이트, 2분마다 재상장 체크</span>
            </div>
          </div>
          <div className="market-grid">
            {stocks &&
              stocks
                .filter((stock) => stock && stock.isListed)
                .map((stock) => {
                  const priceChange = getPriceChangeInfo(stock);
                  const quantity = buyQuantities[stock.id] || "";
                  const currentCost = stock.price * parseInt(quantity || "0");
                  const canAfford =
                    userDoc.cash >= currentCost &&
                    parseInt(quantity || "0") > 0;

                  return (
                    <div
                      key={stock.id}
                      className={`stock-card ${
                        priceChange.direction === "up"
                          ? "price-up"
                          : priceChange.direction === "down"
                          ? "price-down"
                          : ""
                      }`}
                    >
                      <div className="stock-card-header">
                        <div className="stock-info">
                          <h3>{stock.name}</h3>
                          <div className="stock-badges">
                            <span
                              className={`stock-badge ${
                                stock.isManual ? "manual" : "auto"
                              }`}
                            >
                              {stock.isManual ? "수동" : "자동"}
                            </span>
                            {(stock.relistCount || 0) > 0 && (
                              <span className="stock-badge relist">
                                재상장 {stock.relistCount}회
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="stock-price-section">
                          <div className="stock-price">
                            {formatCurrency(stock.price)}
                          </div>
                          {priceChange.direction !== "neutral" && (
                            <div
                              className={`stock-change ${priceChange.direction}`}
                            >
                              {priceChange.direction === "up" ? (
                                <TrendingUp size={16} />
                              ) : (
                                <TrendingDown size={16} />
                              )}
                              <span>{formatPercent(priceChange.percent)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="stock-actions">
                        <input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(e) =>
                            setBuyQuantities((prev) => ({
                              ...prev,
                              [stock.id]: e.target.value,
                            }))
                          }
                          placeholder="수량"
                          className="quantity-input"
                        />
                        <button
                          onClick={() => buyStock(stock.id, quantity)}
                          disabled={!canAfford}
                          className={`trade-button buy ${
                            !canAfford ? "disabled" : ""
                          }`}
                        >
                          매수
                        </button>
                      </div>
                      {parseInt(quantity || "0") > 0 && (
                        <div className="cost-display">
                          총 금액: {formatCurrency(currentCost)}
                        </div>
                      )}
                    </div>
                  );
                })}
          </div>
        </div>

        <div className="portfolio-section">
          <div className="section-header">
            <h2 className="section-title">내 포트폴리오</h2>
            {portfolio.length > 0 && (
              <div className="portfolio-summary-badge">
                <span
                  className={`total-profit ${
                    portfolioStats.totalProfit >= 0 ? "profit" : "loss"
                  }`}
                >
                  {formatCurrency(portfolioStats.totalProfit)} (
                  {formatPercent(portfolioStats.profitPercent)})
                </span>
              </div>
            )}
          </div>
          {loadingPortfolio ? (
            <div style={{ textAlign: "center", padding: "20px" }}>
              포트폴리오를 불러오는 중...
            </div>
          ) : portfolio.length === 0 ? (
            <p className="no-transactions">보유한 주식이 없습니다.</p>
          ) : (
            <div className="portfolio-cards">
              {portfolio.map((holding) => {
                const stock = stocks.find((s) => s && s.id === holding.stockId);
                const isDelisted = holding.isDelisted;
                const isUnlistedOrInfoMissing = !stock || !stock.isListed;

                if (isDelisted || isUnlistedOrInfoMissing) {
                  const title = isDelisted
                    ? `${holding.stockName} ⚠️ (상장폐지됨)`
                    : `${holding.stockName} (정보없음/비상장)`;

                  return (
                    <div
                      key={holding.id}
                      className="portfolio-card delisted"
                      style={{ border: "2px solid #e74c3c" }}
                    >
                      <div className="portfolio-card-header">
                        <h4>{title}</h4>
                        <span>{holding.quantity.toLocaleString()}주</span>
                      </div>
                      <div className="portfolio-metrics">
                        <div>
                          평균매수가: {formatCurrency(holding.averagePrice)}
                        </div>
                        <div style={{ color: "#e74c3c", fontWeight: "bold" }}>
                          현재가: 0원 (가치 없음)
                        </div>
                        <div style={{ color: "#e74c3c", fontWeight: "bold" }}>
                          평가손익: -
                          {formatCurrency(
                            holding.averagePrice * holding.quantity
                          )}{" "}
                          (-100%)
                        </div>
                        {isDelisted && (
                          <div
                            style={{
                              fontSize: "0.9em",
                              color: "#666",
                              marginTop: "10px",
                            }}
                          >
                            ⏰ 상장폐지된 주식은 24시간 후 자동 삭제될 수
                            있습니다.
                          </div>
                        )}
                      </div>
                      <div
                        className="portfolio-card-actions"
                        style={{ marginTop: "10px" }}
                      >
                        <button
                          onClick={() =>
                            deleteHolding(holding.id, holding.stockName)
                          }
                          style={{
                            background: "#e74c3c",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            padding: "8px 15px",
                            cursor: "pointer",
                            fontSize: "14px",
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "5px",
                          }}
                        >
                          <Trash2 size={14} /> 즉시 삭제
                        </button>
                      </div>
                    </div>
                  );
                }

                const currentValue = stock.price * holding.quantity;
                const investedValue = holding.averagePrice * holding.quantity;
                const profit = currentValue - investedValue;
                const profitPercent =
                  investedValue > 0 ? (profit / investedValue) * 100 : 0;
                const sellQuantityValue = sellQuantities[holding.id] || "";
                const canSell =
                  parseInt(sellQuantityValue || "0") > 0 &&
                  parseInt(sellQuantityValue || "0") <= holding.quantity;

                return (
                  <div
                    key={holding.id}
                    className={`portfolio-card ${
                      profit >= 0 ? "profit" : "loss"
                    }`}
                  >
                    <div className="portfolio-card-header">
                      <h4>{holding.stockName}</h4>
                      <span>{holding.quantity.toLocaleString()}주</span>
                    </div>
                    <div className="portfolio-metrics">
                      <div>
                        평균매수가: {formatCurrency(holding.averagePrice)}
                      </div>
                      <div>현재가: {formatCurrency(stock.price)}</div>
                      <div>
                        평가손익:{" "}
                        <span className={profit >= 0 ? "profit" : "loss"}>
                          {formatCurrency(profit)} (
                          {formatPercent(profitPercent)})
                        </span>
                      </div>
                    </div>
                    <div className="portfolio-card-actions">
                      <div className="trade-section">
                        <input
                          type="number"
                          min="1"
                          max={holding.quantity}
                          value={sellQuantityValue}
                          onChange={(e) =>
                            setSellQuantities((prev) => ({
                              ...prev,
                              [holding.id]: e.target.value,
                            }))
                          }
                          placeholder="매도수량"
                          className="trade-input"
                        />
                        <button
                          onClick={() =>
                            sellStock(holding.id, sellQuantityValue)
                          }
                          disabled={!canSell}
                          className={`action-btn sell-btn ${
                            !canSell ? "disabled" : ""
                          }`}
                        >
                          매도
                        </button>
                      </div>
                      {parseInt(sellQuantityValue || "0") > 0 && (
                        <div className="expected-amount">
                          <div>
                            예상 수령액:{" "}
                            {formatCurrency(
                              stock.price * parseInt(sellQuantityValue)
                            )}
                          </div>
                          {(() => {
                            const sellAmount =
                              stock.price * parseInt(sellQuantityValue);
                            const costBasis =
                              holding.averagePrice *
                              parseInt(sellQuantityValue);
                            const expectedProfit = sellAmount - costBasis;
                            const expectedTax =
                              calculateStockTax(expectedProfit);

                            if (expectedTax > 0) {
                              return (
                                <div
                                  style={{ fontSize: "0.8em", color: "#666" }}
                                >
                                  수익: {formatCurrency(expectedProfit)} → 세금:{" "}
                                  {formatCurrency(expectedTax)} → 실수령:{" "}
                                  {formatCurrency(sellAmount - expectedTax)}
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="transaction-section">
          <div className="section-header">
            <h2 className="section-title">거래 내역</h2>
            <button
              onClick={() => setShowTransactions(!showTransactions)}
              className="btn btn-secondary"
            >
              {showTransactions ? "숨기기" : "보기"}
            </button>
          </div>
          {showTransactions && (
            <div>
              {transactionsLoading ? (
                <div style={{ textAlign: "center", padding: "20px" }}>
                  거래내역을 불러오는 중...
                </div>
              ) : lazyTransactions.length === 0 ? (
                <p className="no-transactions">거래내역이 없습니다.</p>
              ) : (
                <div className="transaction-table-container">
                  <table className="transaction-table">
                    <thead>
                      <tr>
                        <th>시간</th>
                        <th>구분</th>
                        <th>종목</th>
                        <th>수량</th>
                        <th>가격</th>
                        <th>총액</th>
                        <th>세금</th>
                        <th>실수령액/총액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lazyTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td>{tx.timestamp.toLocaleString()}</td>
                          <td>
                            <span
                              className={`status-badge ${
                                tx.type === "매수" ? "buy" : "sell"
                              }`}
                            >
                              {tx.type}
                            </span>
                          </td>
                          <td>{tx.stockName}</td>
                          <td>{tx.quantity.toLocaleString()}</td>
                          <td>{formatCurrency(tx.price)}</td>
                          <td>{formatCurrency(tx.total)}</td>
                          <td>
                            {tx.type === "매도" && tx.stockTax > 0 ? (
                              <span style={{ color: "#e74c3c" }}>
                                {formatCurrency(tx.stockTax)}
                              </span>
                            ) : (
                              <span>-</span>
                            )}
                          </td>
                          <td>
                            {tx.type === "매도"
                              ? formatCurrency(tx.netAmount)
                              : formatCurrency(tx.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OptimizedStockExchange;
