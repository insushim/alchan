// src/Banking.js
import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext"; // AuthContext 경로 확인
import ParkingAccount from "./ParkingAccount";

const convertAdminProductsToAccountFormat = (adminProducts) => {
  if (!Array.isArray(adminProducts)) {
    console.error(
      "convertAdminProductsToAccountFormat: 입력값이 배열이 아닙니다.",
      adminProducts
    );
    return [];
  }
  return adminProducts.map((product) => ({
    id: product.id,
    name: product.name,
    dailyRate:
      product.annualRate !== undefined ? parseFloat(product.annualRate) : 0,
    termInDays:
      product.termInDays !== undefined ? parseInt(product.termInDays) : 1,
    minAmount:
      product.minAmount !== undefined ? parseInt(product.minAmount) : 0, // parseInt 추가 및 기본값
    maxAmount:
      product.maxAmount !== undefined ? parseInt(product.maxAmount) : 0, // parseInt 추가 및 기본값
  }));
};

const Banking = () => {
  const auth = useAuth();
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [activeTab, setActiveTab] = useState("parking");

  const [parkingSavingsProducts, setParkingSavingsProducts] = useState([]);
  const [parkingInstallmentProducts, setParkingInstallmentProducts] = useState(
    []
  );
  const [parkingLoanProducts, setParkingLoanProducts] = useState([]);

  const [formattedSavingsProducts, setFormattedSavingsProducts] = useState([]);
  const [formattedInstallmentProducts, setFormattedInstallmentProducts] =
    useState([]);
  const [formattedLoanProducts, setFormattedLoanProducts] = useState([]);

  const PARKING_SAVINGS_KEY = "parkingSavingsProducts_v6_daily";
  const PARKING_INSTALLMENTS_KEY = "parkingInstallmentProducts_v6_daily";
  const PARKING_LOANS_KEY = "parkingLoanProducts_v6_daily";

  const loadAllData = () => {
    try {
      const loadProducts = (key, defaultProducts, setProductsState) => {
        const savedData = localStorage.getItem(key);
        let productsToSet = defaultProducts.map((p) => ({
          ...p,
          annualRate: parseFloat(p.dailyRate !== undefined ? p.dailyRate : 0),
          termInDays: parseInt(p.termInDays !== undefined ? p.termInDays : 1),
          minAmount: parseInt(p.minAmount !== undefined ? p.minAmount : 0),
          maxAmount: parseInt(p.maxAmount !== undefined ? p.maxAmount : 0),
        }));

        if (savedData) {
          try {
            const loadedProducts = JSON.parse(savedData);
            productsToSet = loadedProducts.map((product) => {
              const dailyRateNum = parseFloat(product.annualRate);
              const termDaysNum = parseInt(product.termInDays);
              return {
                ...product,
                name: product.name || "이름 없음",
                annualRate:
                  !isNaN(dailyRateNum) && dailyRateNum >= 0 ? dailyRateNum : 0,
                termInDays:
                  !isNaN(termDaysNum) && termDaysNum > 0 ? termDaysNum : 1,
                minAmount:
                  parseInt(product.minAmount) >= 0
                    ? parseInt(product.minAmount)
                    : 0,
                maxAmount:
                  parseInt(product.maxAmount) >= 0
                    ? parseInt(product.maxAmount)
                    : 0,
              };
            });
          } catch (e) {
            console.error(`로컬 스토리지 (${key}) 파싱 오류:`, e);
            productsToSet = defaultProducts.map((p) => ({
              ...p,
              annualRate: parseFloat(
                p.dailyRate !== undefined ? p.dailyRate : 0
              ),
              termInDays: parseInt(
                p.termInDays !== undefined ? p.termInDays : 1
              ),
              minAmount: parseInt(p.minAmount !== undefined ? p.minAmount : 0),
              maxAmount: parseInt(p.maxAmount !== undefined ? p.maxAmount : 0),
            }));
            localStorage.setItem(key, JSON.stringify(productsToSet));
          }
        } else {
          localStorage.setItem(key, JSON.stringify(productsToSet));
        }
        setProductsState(productsToSet);
      };

      const defaultParkingSavings = [
        {
          id: 1,
          name: "일복리예금 90일",
          dailyRate: 0.01,
          termInDays: 90,
          minAmount: 500000,
        },
        {
          id: 2,
          name: "일복리예금 180일",
          dailyRate: 0.012,
          termInDays: 180,
          minAmount: 1000000,
        },
        {
          id: 3,
          name: "일복리예금 365일",
          dailyRate: 0.015,
          termInDays: 365,
          minAmount: 2000000,
        },
      ];
      const defaultParkingInstallments = [
        {
          id: 1,
          name: "일복리적금 180일",
          dailyRate: 0.011,
          termInDays: 180,
          minAmount: 100000,
        },
        {
          id: 2,
          name: "일복리적금 365일",
          dailyRate: 0.014,
          termInDays: 365,
          minAmount: 100000,
        },
        {
          id: 3,
          name: "일복리적금 730일",
          dailyRate: 0.018,
          termInDays: 730,
          minAmount: 50000,
        },
      ];
      const defaultParkingLoans = [
        {
          id: 1,
          name: "일복리대출 90일",
          dailyRate: 0.05,
          termInDays: 90,
          maxAmount: 3000000,
        },
        {
          id: 2,
          name: "일복리대출 365일",
          dailyRate: 0.08,
          termInDays: 365,
          maxAmount: 10000000,
        },
        {
          id: 3,
          name: "일복리대출 730일",
          dailyRate: 0.1,
          termInDays: 730,
          maxAmount: 50000000,
        },
      ];

      loadProducts(
        PARKING_SAVINGS_KEY,
        defaultParkingSavings,
        setParkingSavingsProducts
      );
      loadProducts(
        PARKING_INSTALLMENTS_KEY,
        defaultParkingInstallments,
        setParkingInstallmentProducts
      );
      loadProducts(
        PARKING_LOANS_KEY,
        defaultParkingLoans,
        setParkingLoanProducts
      );
    } catch (error) {
      console.error("데이터 로딩 중 오류:", error);
      setMessage("데이터 로딩 중 오류가 발생했습니다.");
      setMessageType("error");
    }
  };

  useEffect(() => {
    if (auth && !auth.loading && auth.user) {
      loadAllData();
    } else if (auth && !auth.loading && !auth.user) {
      setParkingSavingsProducts([]);
      setParkingInstallmentProducts([]);
      setParkingLoanProducts([]);
    }
  }, [auth]);

  useEffect(() => {
    setFormattedSavingsProducts(
      convertAdminProductsToAccountFormat(parkingSavingsProducts)
    );
    setFormattedInstallmentProducts(
      convertAdminProductsToAccountFormat(parkingInstallmentProducts)
    );
    setFormattedLoanProducts(
      convertAdminProductsToAccountFormat(parkingLoanProducts)
    );
  }, [parkingSavingsProducts, parkingInstallmentProducts, parkingLoanProducts]);

  const handleParkingProductChange = (type, index, field, value) => {
    let productsState, setProductsState;
    switch (type) {
      case "savings":
        productsState = parkingSavingsProducts;
        setProductsState = setParkingSavingsProducts;
        break;
      case "installments":
        productsState = parkingInstallmentProducts;
        setProductsState = setParkingInstallmentProducts;
        break;
      case "loans":
        productsState = parkingLoanProducts;
        setProductsState = setParkingLoanProducts;
        break;
      default:
        return;
    }
    const updatedProducts = productsState.map((product, i) => {
      if (i === index) {
        const updatedProduct = { ...product };
        if (
          field === "termInDays" ||
          field === "minAmount" ||
          field === "maxAmount"
        ) {
          const numValue = parseInt(value);
          updatedProduct[field] =
            isNaN(numValue) || numValue < (field === "termInDays" ? 1 : 0)
              ? field === "termInDays"
                ? 1
                : 0
              : numValue;
        } else if (field === "annualRate") {
          const dailyRateValue = parseFloat(value);
          updatedProduct.annualRate =
            isNaN(dailyRateValue) || dailyRateValue < 0 ? 0 : dailyRateValue;
        } else if (field === "name") {
          updatedProduct[field] = value;
        }
        return updatedProduct;
      }
      return product;
    });
    setProductsState(updatedProducts);
  };

  const saveParkingProducts = (type) => {
    // ... (이전 로직과 동일)
  };

  const addParkingProduct = (type) => {
    // ... (이전 로직과 동일)
  };

  const deleteParkingProduct = (type, indexToDelete) => {
    // ... (이전 로직과 동일)
  };

  const styles = {
    bankingContainer: {
      maxWidth: "1000px",
      margin: "20px auto",
      padding: "20px",
      fontFamily: "'Noto Sans KR', sans-serif",
      backgroundColor: "#f8f9fa",
      borderRadius: "8px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "15px 25px",
      backgroundColor: "#ffffff",
      borderRadius: "8px 8px 0 0",
      borderBottom: "1px solid #dee2e6",
    },
    headerContent: { display: "flex", alignItems: "center" },
    bankTitle: {
      fontSize: "24px",
      fontWeight: "bold",
      color: "#3a5080",
      margin: 0,
      marginLeft: "12px",
    },
    logoCircle: {
      width: "30px",
      height: "30px",
      backgroundColor: "#3a5080",
      borderRadius: "50%",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      color: "white",
      fontWeight: "bold",
      fontSize: "16px",
    },
    adminButton: {
      padding: "8px 16px",
      borderRadius: "6px",
      border: "1px solid",
      cursor: "pointer",
      fontWeight: "500",
      transition: "all 0.3s ease",
    },
    adminActive: {
      backgroundColor: "#007bff",
      color: "white",
      borderColor: "#007bff",
    },
    adminInactive: {
      backgroundColor: "white",
      color: "#007bff",
      borderColor: "#007bff",
    },
    contentContainer: {
      padding: "25px",
      backgroundColor: "#ffffff",
      borderRadius: "0 0 8px 8px",
    },
    message: {
      padding: "12px 15px",
      marginBottom: "20px",
      borderRadius: "6px",
      fontSize: "14px",
      borderLeftWidth: "4px",
      borderLeftStyle: "solid",
    },
    successMessage: {
      backgroundColor: "#e8f5e9",
      color: "#2e7d32",
      borderColor: "#4caf50",
    },
    warningMessage: {
      backgroundColor: "#fff3e0",
      color: "#ef6c00",
      borderColor: "#ff9800",
    },
    errorMessage: {
      backgroundColor: "#ffebee",
      color: "#c62828",
      borderColor: "#f44336",
    },
    infoMessage: {
      backgroundColor: "#e3f2fd",
      color: "#1565c0",
      borderColor: "#42a5f5",
    },
    tabContainer: { marginBottom: "20px", borderBottom: "1px solid #dee2e6" },
    tabMenu: { display: "flex" },
    tabButton: {
      padding: "10px 20px",
      border: "none",
      background: "none",
      cursor: "pointer",
      fontSize: "16px",
      fontWeight: "500",
      color: "#6c757d",
      borderBottom: "3px solid transparent",
      transition: "all 0.3s ease",
      marginRight: "10px",
      marginBottom: "-1px",
    },
    // *** 수정된 부분: parkingTab을 함수가 아닌 객체로 정의 ***
    parkingTabActive: {
      color: "#3a5080",
      borderBottomColor: "#3a5080",
      fontWeight: "bold",
    },
    parkingTabInactive: {
      color: "#6c757d",
      borderBottomColor: "transparent",
      fontWeight: "500",
    },
    // *** 수정 끝 ***
    contentBox: {
      padding: "20px",
      borderRadius: "8px",
      backgroundColor: "#f8f9fa",
      marginTop: "10px",
    },
    adminSection: {
      marginBottom: "30px",
      paddingBottom: "20px",
      borderBottom: "1px solid #eee",
    },
    adminHeader: {
      fontSize: "20px",
      fontWeight: "600",
      color: "#343a40",
      marginBottom: "15px",
    },
    adminTable: {
      width: "100%",
      borderCollapse: "collapse",
      marginBottom: "15px",
    },
    adminTh: {
      backgroundColor: "#f8f9fa",
      padding: "10px 12px",
      textAlign: "left",
      fontSize: "12px",
      fontWeight: "600",
      color: "#495057",
      borderBottom: "2px solid #dee2e6",
      textTransform: "uppercase",
    },
    adminTd: {
      padding: "10px 12px",
      borderBottom: "1px solid #e9ecef",
      fontSize: "14px",
      verticalAlign: "middle",
    },
    adminInput: {
      width: "95%",
      padding: "8px",
      border: "1px solid #ced4da",
      borderRadius: "4px",
      fontSize: "14px",
      transition:
        "border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out",
    },
    adminButtonSmall: {
      padding: "6px 12px",
      fontSize: "13px",
      borderRadius: "4px",
      border: "none",
      cursor: "pointer",
      fontWeight: "500",
      transition: "background-color 0.2s ease",
    },
    saveButton: {
      backgroundColor: "#28a745",
      color: "white",
      marginRight: "5px",
    },
    deleteButton: { backgroundColor: "#dc3545", color: "white" },
    addButton: { backgroundColor: "#007bff", color: "white" },
    adminInfoText: {
      fontSize: "13px",
      color: "#6c757d",
      marginBottom: "15px",
      fontStyle: "italic",
    },
    adminActionButtons: { marginTop: "10px", textAlign: "right" },
  };

  const getMessageStyle = () => {
    /* ... */
  };
  const getContentStyle = () => {
    /* ... */
  };
  const getAdminButtonStyle = () => {
    /* ... */
  };

  if (auth.loading) {
    return (
      <div style={styles.bankingContainer}>
        <div style={{ padding: "20px", textAlign: "center" }}>
          금융 정보 로딩 중...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.bankingContainer}>
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logoCircle}>B</div>
          <h1 style={styles.bankTitle}>통합 금융 관리</h1>
        </div>
        {auth.user &&
          (auth.userDoc?.isAdmin || auth.userDoc?.role === "admin") && (
            <button
              onClick={() =>
                setActiveTab(activeTab === "admin" ? "parking" : "admin")
              }
              style={getAdminButtonStyle()}
            >
              {activeTab === "admin" ? "사용자 화면 보기" : "관리자 모드"}
            </button>
          )}
      </div>

      <div style={styles.contentContainer}>
        {message && <div style={getMessageStyle()}>{message}</div>}

        <div style={styles.tabContainer}>
          <div style={styles.tabMenu}>
            {/* *** 수정된 부분: 조건부 스타일 적용 방식 변경 *** */}
            <button
              style={{
                ...styles.tabButton,
                ...(activeTab === "parking"
                  ? styles.parkingTabActive
                  : styles.parkingTabInactive),
              }}
              onClick={() => setActiveTab("parking")}
            >
              나의 금융 현황
            </button>
            {auth.user &&
              (auth.userDoc?.isAdmin || auth.userDoc?.role === "admin") && (
                <button
                  style={{
                    ...styles.tabButton,
                    ...(activeTab === "admin"
                      ? styles.parkingTabActive
                      : styles.parkingTabInactive),
                  }}
                  onClick={() => setActiveTab("admin")}
                  disabled={
                    !(auth.userDoc?.isAdmin || auth.userDoc?.role === "admin")
                  }
                >
                  상품 관리 (관리자)
                </button>
              )}
            {/* *** 수정 끝 *** */}
          </div>
        </div>

        <div style={getContentStyle()}>
          {activeTab === "parking" && (
            <ParkingAccount
              auth={auth}
              savingsProducts={formattedSavingsProducts}
              installmentProducts={formattedInstallmentProducts}
              loanProducts={formattedLoanProducts}
            />
          )}
          {activeTab === "admin" &&
            auth.user &&
            (auth.userDoc?.isAdmin || auth.userDoc?.role === "admin") && (
              <div>
                <h2 style={styles.adminHeader}>
                  관리자 - 금융 상품 관리 (일 복리 기준)
                </h2>
                {/* Savings */}
                <div style={styles.adminSection}>
                  <h3>파킹 예금 상품</h3>
                  <p style={styles.adminInfoText}>
                    일 이율(%)과 기간(일)을 입력합니다. 변경 후 '저장' 버튼을
                    클릭하세요.
                  </p>
                  <table style={styles.adminTable}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.adminTh, width: "25%" }}>
                          상품명
                        </th>
                        <th style={{ ...styles.adminTh, width: "15%" }}>
                          기간(일)
                        </th>
                        <th style={{ ...styles.adminTh, width: "18%" }}>
                          일 이율(%)
                        </th>
                        <th style={{ ...styles.adminTh, width: "18%" }}>
                          최소금액(원)
                        </th>
                        <th style={{ ...styles.adminTh, width: "12%" }}>
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parkingSavingsProducts.map((p, index) => (
                        <tr key={p.id}>
                          <td style={styles.adminTd}>
                            <input
                              type="text"
                              value={p.name}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "savings",
                                  index,
                                  "name",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <input
                              type="number"
                              min="1"
                              value={p.termInDays}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "savings",
                                  index,
                                  "termInDays",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={p.annualRate}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "savings",
                                  index,
                                  "annualRate",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                              placeholder="예: 0.01"
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <input
                              type="number"
                              min="0"
                              value={p.minAmount}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "savings",
                                  index,
                                  "minAmount",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <button
                              onClick={() =>
                                deleteParkingProduct("savings", index)
                              }
                              style={{
                                ...styles.adminButtonSmall,
                                ...styles.deleteButton,
                              }}
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={styles.adminActionButtons}>
                    <button
                      onClick={() => addParkingProduct("savings")}
                      style={{
                        ...styles.adminButtonSmall,
                        ...styles.addButton,
                      }}
                    >
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("savings")}
                      style={{
                        ...styles.adminButtonSmall,
                        ...styles.saveButton,
                      }}
                    >
                      예금 상품 저장
                    </button>
                  </div>
                </div>
                {/* Installments */}
                <div style={styles.adminSection}>
                  <h3>파킹 적금 상품</h3>
                  <p style={styles.adminInfoText}>
                    일 이율(%)과 기간(일)을 입력합니다. 변경 후 '저장' 버튼을
                    클릭하세요.
                  </p>
                  <table style={styles.adminTable}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.adminTh, width: "25%" }}>
                          상품명
                        </th>
                        <th style={{ ...styles.adminTh, width: "15%" }}>
                          기간(일)
                        </th>
                        <th style={{ ...styles.adminTh, width: "18%" }}>
                          일 이율(%)
                        </th>
                        <th style={{ ...styles.adminTh, width: "18%" }}>
                          최소 월납입(원)
                        </th>
                        <th style={{ ...styles.adminTh, width: "12%" }}>
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parkingInstallmentProducts.map((p, index) => (
                        <tr key={p.id}>
                          <td style={styles.adminTd}>
                            <input
                              type="text"
                              value={p.name}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "name",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <input
                              type="number"
                              min="1"
                              value={p.termInDays}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "termInDays",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={p.annualRate}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "annualRate",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                              placeholder="예: 0.011"
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <input
                              type="number"
                              min="0"
                              value={p.minAmount}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "minAmount",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <button
                              onClick={() =>
                                deleteParkingProduct("installments", index)
                              }
                              style={{
                                ...styles.adminButtonSmall,
                                ...styles.deleteButton,
                              }}
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={styles.adminActionButtons}>
                    <button
                      onClick={() => addParkingProduct("installments")}
                      style={{
                        ...styles.adminButtonSmall,
                        ...styles.addButton,
                      }}
                    >
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("installments")}
                      style={{
                        ...styles.adminButtonSmall,
                        ...styles.saveButton,
                      }}
                    >
                      적금 상품 저장
                    </button>
                  </div>
                </div>
                {/* Loans */}
                <div style={{ ...styles.adminSection, borderBottom: "none" }}>
                  <h3>파킹 대출 상품</h3>
                  <p style={styles.adminInfoText}>
                    일 이율(%)과 기간(일)을 입력합니다. 변경 후 '저장' 버튼을
                    클릭하세요.
                  </p>
                  <table style={styles.adminTable}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.adminTh, width: "25%" }}>
                          상품명
                        </th>
                        <th style={{ ...styles.adminTh, width: "15%" }}>
                          기간(일)
                        </th>
                        <th style={{ ...styles.adminTh, width: "18%" }}>
                          일 이율(%)
                        </th>
                        <th style={{ ...styles.adminTh, width: "18%" }}>
                          최대 대출액(원)
                        </th>
                        <th style={{ ...styles.adminTh, width: "12%" }}>
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parkingLoanProducts.map((p, index) => (
                        <tr key={p.id}>
                          <td style={styles.adminTd}>
                            <input
                              type="text"
                              value={p.name}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "name",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <input
                              type="number"
                              min="1"
                              value={p.termInDays}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "termInDays",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={p.annualRate}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "annualRate",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                              placeholder="예: 0.05"
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <input
                              type="number"
                              min="0"
                              value={p.maxAmount}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "maxAmount",
                                  e.target.value
                                )
                              }
                              style={styles.adminInput}
                            />
                          </td>
                          <td style={styles.adminTd}>
                            <button
                              onClick={() =>
                                deleteParkingProduct("loans", index)
                              }
                              style={{
                                ...styles.adminButtonSmall,
                                ...styles.deleteButton,
                              }}
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={styles.adminActionButtons}>
                    <button
                      onClick={() => addParkingProduct("loans")}
                      style={{
                        ...styles.adminButtonSmall,
                        ...styles.addButton,
                      }}
                    >
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("loans")}
                      style={{
                        ...styles.adminButtonSmall,
                        ...styles.saveButton,
                      }}
                    >
                      대출 상품 저장
                    </button>
                  </div>
                </div>
              </div>
            )}
          {activeTab === "admin" &&
            !(
              auth.user &&
              (auth.userDoc?.isAdmin || auth.userDoc?.role === "admin")
            ) && <div>관리자 권한이 필요합니다.</div>}
        </div>
      </div>
    </div>
  );
};

export default Banking;
