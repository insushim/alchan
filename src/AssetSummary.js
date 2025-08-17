import React, { useState, useEffect } from "react";
import { useAuth } from "./App"; // App.js에서 useAuth 훅 가져오기
import { formatKoreanCurrency } from "./numberFormatter"; // 숫자 포맷팅 헬퍼

// Dashboard에서 전달하는 props: { user, couponValue, setShowTransferModal }
export default function AssetSummary({
  user,
  couponValue = 1000, // 쿠폰 개당 가치 (기본값 1000원)
  setShowTransferModal,
}) {
  const {
    id: userId,
    name: userName,
    cash: currentCash = 0,
    coupons = 0,
  } = user || {};

  // localStorage에서 데이터를 불러오기 위한 상태
  const [parkingBalance, setParkingBalance] = useState(0);
  const [loans, setLoans] = useState([]);
  const [realEstateAssets, setRealEstateAssets] = useState([]);
  // --- 보유 주식 관련 상태 변경 ---
  // const [stockAssets, setStockAssets] = useState([]); // 기존 상태 제거
  const [userPortfolio, setUserPortfolio] = useState({ holdings: [] }); // StockExchange와 동일한 구조 사용
  const [allStocks, setAllStocks] = useState([]); // 전체 주식 목록 상태 추가 (현재가 포함)
  // --- 보유 주식 관련 상태 변경 끝 ---
  const [totalAssets, setTotalAssets] = useState(0); // 총 자산 (순자산) 상태

  // localStorage 데이터 로딩 useEffect
  useEffect(() => {
    if (userId) {
      // 파킹통장 (기존과 동일)
      try {
        const savedParkingAccount = localStorage.getItem(
          `parkingAccount_${userId}`
        );
        setParkingBalance(
          savedParkingAccount ? JSON.parse(savedParkingAccount).balance || 0 : 0
        );
      } catch (error) {
        console.error("파킹통장 데이터 로딩 오류:", error);
        setParkingBalance(0);
      }
      // 대출 (기존과 동일)
      try {
        const savedUserProducts = localStorage.getItem(
          `userProducts_${userId}`
        );
        setLoans(
          savedUserProducts ? JSON.parse(savedUserProducts).loans || [] : []
        );
      } catch (error) {
        console.error("대출 데이터 로딩 오류:", error);
        setLoans([]);
      }
      // 부동산 (기존과 동일)
      try {
        const savedProperties = localStorage.getItem("realEstateProperties");
        if (savedProperties) {
          const allProperties = JSON.parse(savedProperties);
          setRealEstateAssets(
            allProperties.filter((p) => p.owner === userName)
          );
        } else {
          setRealEstateAssets([]);
        }
      } catch (error) {
        console.error("부동산 데이터 로딩 오류:", error);
        setRealEstateAssets([]);
      }

      // --- 보유 주식 데이터 로딩 수정 ---
      // 1. 전체 주식 목록 (stocksData) 로드
      try {
        const savedStocksData = localStorage.getItem("stocksData");
        if (savedStocksData) {
          const parsedStocks = JSON.parse(savedStocksData);
          if (Array.isArray(parsedStocks)) {
            setAllStocks(parsedStocks); // 전체 주식 목록 상태 업데이트
            console.log("AssetSummary: stocksData 로드 성공", parsedStocks);
          } else {
            setAllStocks([]);
          }
        } else {
          setAllStocks([]);
        }
      } catch (error) {
        console.error("AssetSummary: stocksData 로딩 오류", error);
        setAllStocks([]);
      }

      // 2. 사용자 포트폴리오 (userStockPortfolio) 로드
      try {
        const savedPortfolio = localStorage.getItem("userStockPortfolio"); // StockExchange와 동일한 키 사용
        if (savedPortfolio) {
          const parsedPortfolio = JSON.parse(savedPortfolio);
          // 데이터 구조 유효성 검사 강화
          if (parsedPortfolio && Array.isArray(parsedPortfolio.holdings)) {
            // 각 holding 객체의 유효성 검사 (예: stockId, quantity 타입 확인)
            const validHoldings = parsedPortfolio.holdings.filter(
              (h) =>
                typeof h.stockId === "number" &&
                typeof h.quantity === "number" &&
                h.quantity >= 0
            );
            setUserPortfolio({ holdings: validHoldings }); // 사용자 포트폴리오 상태 업데이트
            console.log("AssetSummary: userStockPortfolio 로드 성공", {
              holdings: validHoldings,
            });
          } else {
            setUserPortfolio({ holdings: [] }); // 유효하지 않으면 초기화
            console.log(
              "AssetSummary: 로드된 userStockPortfolio 형식이 잘못됨, 초기화"
            );
          }
        } else {
          setUserPortfolio({ holdings: [] }); // 저장된 데이터 없으면 초기화
          console.log("AssetSummary: 저장된 userStockPortfolio 없음, 초기화");
        }
      } catch (error) {
        console.error("AssetSummary: userStockPortfolio 로딩 오류", error);
        setUserPortfolio({ holdings: [] });
      }
      // --- 보유 주식 데이터 로딩 수정 끝 ---
    } else {
      // userId가 없으면 모든 자산 초기화
      setParkingBalance(0);
      setLoans([]);
      setRealEstateAssets([]);
      // --- 보유 주식 관련 상태 초기화 ---
      setUserPortfolio({ holdings: [] });
      setAllStocks([]);
      // --- 보유 주식 관련 상태 초기화 끝 ---
    }
  }, [userId, userName]); // 의존성 배열에 userName 추가 (부동산 필터링 때문)

  // --- 총 자산 계산 로직 수정 ---
  // 보유 주식 총 가치 계산 함수
  const calculateTotalStockValue = () => {
    // allStocks와 userPortfolio.holdings 데이터가 모두 로드되었는지 확인
    if (!allStocks.length || !userPortfolio.holdings.length) {
      return 0;
    }

    return userPortfolio.holdings.reduce((sum, holding) => {
      // 전체 주식 목록(allStocks)에서 현재 보유 주식(holding) 정보 찾기
      const stockInfo = allStocks.find((stock) => stock.id === holding.stockId);
      // 주식 정보를 찾았고, 상장 상태(isListed)이며, 보유 수량(quantity)이 0보다 큰 경우에만 계산
      if (stockInfo && stockInfo.isListed && holding.quantity > 0) {
        // 현재가(stockInfo.price)와 보유 수량(holding.quantity)을 곱하여 합산
        return sum + stockInfo.price * holding.quantity;
      }
      // 조건을 만족하지 않으면 합계에 더하지 않음
      return sum;
    }, 0); // 초기 합계는 0
  };

  // 총 자산 계산 useEffect (주식 가치 계산 로직 반영)
  useEffect(() => {
    const couponValueTotal = coupons * couponValue;
    const realEstateValue = realEstateAssets.reduce(
      (sum, asset) => sum + (asset.price || 0),
      0
    );
    const totalStockValueCalculated = calculateTotalStockValue(); // 수정된 함수 호출
    const totalLoanBalance = loans.reduce(
      (sum, loan) => sum + (loan.remainingPrincipal || 0),
      0
    );

    const calculatedTotalAssets =
      currentCash +
      couponValueTotal +
      parkingBalance +
      totalStockValueCalculated + // 계산된 주식 가치 사용
      realEstateValue -
      totalLoanBalance;

    setTotalAssets(calculatedTotalAssets);
  }, [
    currentCash,
    coupons,
    couponValue,
    parkingBalance,
    realEstateAssets,
    // --- 의존성 배열 수정 ---
    userPortfolio, // stockAssets 대신 userPortfolio 사용
    allStocks, // allStocks 추가
    // --- 의존성 배열 수정 끝 ---
    loans,
  ]);

  // --- 계산된 값들 (렌더링 시 사용) ---
  const totalLoanBalance = loans.reduce(
    (sum, loan) => sum + (loan.remainingPrincipal || 0),
    0
  );
  const totalRealEstateValue = realEstateAssets.reduce(
    (sum, asset) => sum + (asset.price || 0),
    0
  );
  // 보유 주식 총 가치 계산 (렌더링용) <-- 수정된 함수 사용
  const totalStockValue = calculateTotalStockValue();
  // 총액 자산 계산 시 주식 가치 포함 <-- 수정
  const grossAssets =
    currentCash +
    coupons * couponValue +
    parkingBalance +
    totalStockValue + // 계산된 주식 가치 사용
    totalRealEstateValue;

  // --- 스타일 객체 (기존과 동일) ---
  const styles = {
    sectionContainer: { marginBottom: "12px" },
    sectionTitle: {
      fontSize: "17px",
      fontWeight: "600",
      color: "#374151",
      marginBottom: "8px",
      paddingBottom: "3px",
      borderBottom: "1px solid #e5e7eb",
    },
    totalAssetBox: {
      backgroundColor: "#eef2ff",
      borderRadius: "8px",
      padding: "12px",
      marginBottom: "15px",
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
      border: "1px solid #c7d2fe",
    },
    totalAssetTitle: { fontWeight: "bold", fontSize: "17px", color: "#4338ca" },
    totalAssetAmount: {
      fontWeight: "bold",
      fontSize: "24px",
      color: "#4f46e5",
    },
    totalAssetDesc: {
      marginTop: "3px",
      fontSize: "13px",
      color: "#64748b",
      textAlign: "right",
    },
    assetGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
      gap: "10px",
    },
    assetItemBox: (bgColor = "#f9fafb", borderColor = "#e5e7eb") => ({
      backgroundColor: bgColor,
      borderRadius: "6px",
      padding: "10px",
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
      border: `1px solid ${borderColor}`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      minHeight: "110px", // 카드 최소 높이 조절 (필요시)
    }),
    assetItemTitle: (color = "#1f2937") => ({
      color: color,
      fontWeight: "600",
      fontSize: "15px",
      marginBottom: "4px",
      display: "flex",
      alignItems: "center",
      gap: "5px",
    }),
    assetItemAmount: (color = "#111827") => ({
      color: color,
      fontWeight: "bold",
      fontSize: "20px",
      textAlign: "right",
      wordBreak: "break-all", // 금액이 길어질 경우 줄바꿈
    }),
    button: {
      backgroundColor: "#0ea5e9",
      color: "white",
      border: "none",
      borderRadius: "5px",
      padding: "4px 8px",
      fontSize: "13px",
      fontWeight: "500",
      cursor: "pointer",
      transition: "background-color 0.2s ease",
      marginLeft: "auto", // 버튼 오른쪽 정렬 유지
      marginTop: "auto", // 내용을 채우고 남은 공간 아래에 버튼 위치
      alignSelf: "flex-end", // Flexbox 아이템 자체를 오른쪽 끝으로
    },
    progressBarContainer: {
      width: "100%",
      backgroundColor: "#e5e7eb",
      borderRadius: "3px",
      height: "4px",
      overflow: "hidden",
      marginTop: "4px",
    },
    progressBar: (widthPercentage, color = "#3b82f6") => ({
      width: `${widthPercentage}%`,
      height: "100%",
      backgroundColor: color,
      transition: "width 0.5s ease-in-out",
    }),
    detailList: {
      listStyle: "none",
      paddingLeft: 0,
      margin: "4px 0 0 0",
      fontSize: "13px",
      color: "#4b5563",
    },
    detailListItem: { marginBottom: "2px", lineHeight: "1.3" },
    amountSubText: {
      textAlign: "right",
      color: "#92400e",
      marginTop: "2px",
      fontSize: "13px",
      fontWeight: "500",
    },
    infoText: { fontSize: "13px", color: "#6b7280", marginTop: "5px" },
  };

  // 파킹 통장 잔액 비율 계산 (기존과 동일)
  const parkingRatio =
    grossAssets > 0 ? Math.min(100, (parkingBalance / grossAssets) * 100) : 0;

  // --- JSX 렌더링 부분 수정 (보유 주식 섹션) ---
  return (
    <div style={styles.sectionContainer}>
      <h3
        style={{
          ...styles.sectionTitle,
          fontSize: "18px",
          marginBottom: "10px",
        }}
      >
        종합 자산 현황
      </h3>
      {/* 총 자산 (순자산) */}
      <div style={styles.totalAssetBox}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "3px",
          }}
        >
          <span style={styles.totalAssetTitle}>📊 총 자산 (순자산)</span>
          <span style={styles.totalAssetAmount}>
            {formatKoreanCurrency(totalAssets)}
          </span>
        </div>
        {/* 총 자산 설명 수정 <-- 주식 포함 */}
        <p style={styles.totalAssetDesc}>
          (현금 + 쿠폰 + 파킹 + 주식 + 부동산 - 대출)
        </p>
      </div>

      {/* 유동 자산 섹션 */}
      <div style={styles.sectionContainer}>
        <h4 style={styles.sectionTitle}>유동 자산</h4>
        <div style={styles.assetGrid}>
          {/* 보유 현금 (기존과 동일) */}
          <div style={styles.assetItemBox("#f0f9ff", "#e0f2fe")}>
            <div>
              <div style={styles.assetItemTitle("#0c4a6e")}>💰 보유 현금</div>
              <div style={styles.assetItemAmount("#0369a1")}>
                {formatKoreanCurrency(currentCash)}
              </div>
            </div>
            <button
              onClick={() => setShowTransferModal(true)}
              style={styles.button}
            >
              송금
            </button>
          </div>
          {/* 파킹통장 (기존과 동일) */}
          <div style={styles.assetItemBox("#f0f9ff", "#e0f2fe")}>
            <div>
              <div style={styles.assetItemTitle("#0c4a6e")}>🅿️ 파킹통장</div>
              <div style={styles.assetItemAmount("#0369a1")}>
                {formatKoreanCurrency(parkingBalance)}
              </div>
              <div style={styles.progressBarContainer}>
                <div style={styles.progressBar(parkingRatio, "#38bdf8")}></div>
              </div>
            </div>
            {/* 파킹통장에는 버튼 없음, 공간 확보 위해 빈 div 추가 */}
            <div style={{ marginTop: "auto" }}></div>
          </div>
          {/* 보유 쿠폰 (기존과 동일) */}
          <div style={styles.assetItemBox("#fffbeb", "#fef3c7")}>
            <div>
              <div style={styles.assetItemTitle("#b45309")}>🎟️ 보유 쿠폰</div>
              <div style={styles.assetItemAmount("#d97706")}>{coupons} 개</div>
              <p style={styles.amountSubText}>
                ({formatKoreanCurrency(coupons * couponValue)})
              </p>
            </div>
            {/* 쿠폰에도 버튼 없음, 공간 확보 */}
            <div style={{ marginTop: "auto" }}></div>
          </div>

          {/* 보유 주식 <-- 수정된 로직 반영 */}
          <div style={styles.assetItemBox("#ecfdf5", "#d1fae5")}>
            <div>
              <div style={styles.assetItemTitle("#065f46")}>📈 보유 주식</div>
              <div style={styles.assetItemAmount("#047857")}>
                {/* 수정된 totalStockValue 사용 */}
                {formatKoreanCurrency(totalStockValue)}
              </div>
              {/* 주식 상세 내역 표시 (개선) */}
              {userPortfolio.holdings.length > 0 ? (
                <ul style={{ ...styles.detailList, marginTop: "5px" }}>
                  {/* 최대 2개만 표시 (개선된 로직) */}
                  {userPortfolio.holdings.slice(0, 2).map((holding) => {
                    // allStocks에서 주식 정보 찾기
                    const stockInfo = allStocks.find(
                      (stock) => stock.id === holding.stockId
                    );
                    // 주식 이름과 현재 가치 계산
                    const stockName = stockInfo
                      ? stockInfo.name
                      : `ID: ${holding.stockId}`;
                    const holdingValue =
                      stockInfo && stockInfo.isListed
                        ? stockInfo.price * holding.quantity
                        : 0;
                    // 수량이 0보다 큰 경우만 표시
                    if (holding.quantity > 0) {
                      return (
                        <li key={holding.stockId} style={styles.detailListItem}>
                          - {stockName}: {holding.quantity}주 (
                          {formatKoreanCurrency(holdingValue)})
                        </li>
                      );
                    }
                    return null; // 수량이 0이면 표시 안함
                  })}
                  {/* 2개 초과 시 "..." 표시 */}
                  {userPortfolio.holdings.filter((h) => h.quantity > 0).length >
                    2 && (
                    <li style={styles.detailListItem}>
                      ... 등{" "}
                      {
                        userPortfolio.holdings.filter((h) => h.quantity > 0)
                          .length
                      }
                      개 종목
                    </li>
                  )}
                </ul>
              ) : (
                <p style={{ ...styles.infoText, marginTop: "5px" }}>
                  보유 주식 없음
                </p>
              )}
            </div>
            {/* 주식에도 버튼 없음, 공간 확보 */}
            <div style={{ marginTop: "auto" }}></div>
          </div>
        </div>
      </div>

      {/* 투자 자산 섹션 (기존과 동일) */}
      <div style={styles.sectionContainer}>
        <h4 style={styles.sectionTitle}>투자 자산</h4>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}
        >
          {/* 부동산 현황 */}
          <div style={styles.assetItemBox("#f0fdf4", "#dcfce7")}>
            <div>
              <div style={styles.assetItemTitle("#166534")}>🏠 부동산 가치</div>
              <div style={styles.assetItemAmount("#15803d")}>
                {formatKoreanCurrency(totalRealEstateValue)}
              </div>
              {realEstateAssets.length > 0 ? (
                <ul style={styles.detailList}>
                  {realEstateAssets.map((asset) => (
                    <li key={asset.id} style={styles.detailListItem}>
                      - #{asset.id}: {formatKoreanCurrency(asset.price || 0)}
                      {asset.forSale && (
                        <span style={{ color: "#ca8a04", fontWeight: "500" }}>
                          (판매중)
                        </span>
                      )}
                      {asset.tenant && (
                        <span style={{ color: "#059669" }}>
                          (세입자: {asset.tenant})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={styles.infoText}>보유 부동산 없음</p>
              )}
            </div>
            {/* 부동산에도 버튼 없음, 공간 확보 */}
            <div style={{ marginTop: "auto" }}></div>
          </div>
        </div>
      </div>

      {/* 부채 섹션 (기존과 동일) */}
      <div style={styles.sectionContainer}>
        <h4 style={styles.sectionTitle}>부채 (대출)</h4>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}
        >
          {/* 대출 현황 */}
          <div style={styles.assetItemBox("#fff1f2", "#ffe4e6")}>
            <div>
              <div style={styles.assetItemTitle("#9f1239")}>
                💸 총 대출 잔액
              </div>
              <div style={styles.assetItemAmount("#be123c")}>
                {formatKoreanCurrency(totalLoanBalance)}
              </div>
              {loans.length > 0 ? (
                <ul style={styles.detailList}>
                  {loans.map((loan) => (
                    <li key={loan.id} style={styles.detailListItem}>
                      - {loan.name}:{" "}
                      {formatKoreanCurrency(loan.remainingPrincipal || 0)} (
                      {loan.rate}%)
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={styles.infoText}>대출 없음</p>
              )}
            </div>
            {/* 대출에도 버튼 없음, 공간 확보 */}
            <div style={{ marginTop: "auto" }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
