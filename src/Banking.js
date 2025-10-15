// src/Banking.js
import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import ParkingAccount from "./ParkingAccount";
import { getBankingProducts, updateBankingProducts } from "./firebase";
import { formatKoreanCurrency } from './numberFormatter';

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
      product.annualRate !== undefined && !isNaN(product.annualRate) ? parseFloat(product.annualRate) : 0,
    termInDays:
      product.termInDays !== undefined && !isNaN(product.termInDays) ? parseInt(product.termInDays) : 1,
    minAmount:
      product.minAmount !== undefined && !isNaN(product.minAmount) ? parseInt(product.minAmount) : 0,
    maxAmount:
      product.maxAmount !== undefined && !isNaN(product.maxAmount) ? parseInt(product.maxAmount) : 0,
  }));
};

const Banking = () => {
  const auth = useAuth();
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [activeTab, setActiveTab] = useState("parking");
  const [isLoading, setIsLoading] = useState(false);

  const [parkingSavingsProducts, setParkingSavingsProducts] = useState([]);
  const [parkingInstallmentProducts, setParkingInstallmentProducts] = useState(
    []
  );
  const [parkingLoanProducts, setParkingLoanProducts] = useState([]);

  const [formattedSavingsProducts, setFormattedSavingsProducts] = useState([]);
  const [formattedInstallmentProducts, setFormattedInstallmentProducts] =
    useState([]);
  const [formattedLoanProducts, setFormattedLoanProducts] = useState([]);

  // Firestore에서 데이터 로드
  const loadAllData = async () => {
    if (!auth?.userDoc?.classCode) {
      console.warn("학급 코드가 없어 뱅킹 상품을 로드할 수 없습니다.");
      return;
    }

    setIsLoading(true);
    try {
      const bankingData = await getBankingProducts(auth.userDoc.classCode);

      // deposits를 savings로 매핑 (예금 상품)
      if (bankingData.deposits) {
        setParkingSavingsProducts(bankingData.deposits);
      } else {
        setParkingSavingsProducts([]);
      }

      // savings를 installments로 매핑 (적금 상품)
      if (bankingData.savings) {
        setParkingInstallmentProducts(bankingData.savings);
      } else {
        setParkingInstallmentProducts([]);
      }

      // loans는 그대로 매핑 (대출 상품)
      if (bankingData.loans) {
        setParkingLoanProducts(bankingData.loans);
      } else {
        setParkingLoanProducts([]);
      }

      console.log("뱅킹 상품 로드 성공:", bankingData);
    } catch (error) {
      console.error("뱅킹 상품 로드 중 오류:", error);
      setMessage("데이터 로딩 중 오류가 발생했습니다.");
      setMessageType("error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (auth && !auth.loading && auth.user && auth.userDoc?.classCode) {
      loadAllData();
    } else if (auth && !auth.loading && !auth.user) {
      setParkingSavingsProducts([]);
      setParkingInstallmentProducts([]);
      setParkingLoanProducts([]);
    }
  }, [auth?.user, auth?.loading, auth?.userDoc?.classCode]);

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

  const saveParkingProducts = async (type) => {
    if (!auth?.userDoc?.classCode) {
      setMessage("학급 코드가 없어 저장할 수 없습니다.");
      setMessageType("error");
      return;
    }

    setIsLoading(true);
    try {
      let products, firestoreType;

      switch (type) {
        case "savings":
          products = parkingSavingsProducts;
          firestoreType = "deposits"; // Firebase에서는 deposits로 저장
          break;
        case "installments":
          products = parkingInstallmentProducts;
          firestoreType = "savings"; // Firebase에서는 savings로 저장
          break;
        case "loans":
          products = parkingLoanProducts;
          firestoreType = "loans";
          break;
        default:
          return;
      }

      await updateBankingProducts(
        auth.userDoc.classCode,
        firestoreType,
        products
      );

      setMessage(
        `${
          type === "savings"
            ? "예금"
            : type === "installments"
            ? "적금"
            : "대출"
        } 상품이 성공적으로 저장되었습니다.`
      );
      setMessageType("success");

      setTimeout(() => {
        setMessage(null);
        setMessageType("");
      }, 3000);
    } catch (error) {
      console.error(`${type} 상품 저장 중 오류:`, error);
      setMessage("저장 중 오류가 발생했습니다.");
      setMessageType("error");
    } finally {
      setIsLoading(false);
    }
  };

  const addParkingProduct = (type) => {
    const newProduct = {
      id: Date.now(),
      name: `새 ${
        type === "savings"
          ? "예금"
          : type === "installments"
          ? "적금"
          : "대출"
      } 상품`,
      annualRate: 0.01,
      termInDays: 365,
      minAmount: type === "loans" ? 0 : 100000,
      maxAmount: type === "loans" ? 1000000 : 0,
    };

    switch (type) {
      case "savings":
        setParkingSavingsProducts([...parkingSavingsProducts, newProduct]);
        break;
      case "installments":
        setParkingInstallmentProducts([
          ...parkingInstallmentProducts,
          newProduct,
        ]);
        break;
      case "loans":
        setParkingLoanProducts([...parkingLoanProducts, newProduct]);
        break;
      default:
        break;
    }
  };

  const deleteParkingProduct = async (type, indexToDelete) => {
    if (isLoading) return; // 중복 클릭 방지

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

    const updatedProducts = productsState.filter(
      (_, index) => index !== indexToDelete
    );
    setProductsState(updatedProducts);

    // 삭제 후 자동 저장
    if (auth?.userDoc?.classCode) {
      setIsLoading(true);
      try {
        const firestoreType =
          type === "savings"
            ? "deposits"
            : type === "installments"
            ? "savings"
            : "loans";
        await updateBankingProducts(
          auth.userDoc.classCode,
          firestoreType,
          updatedProducts
        );
        setMessage("상품이 삭제되었습니다.");
        setMessageType("info");
        setTimeout(() => {
          setMessage(null);
          setMessageType("");
        }, 2000);
      } catch (error) {
        console.error("상품 삭제 중 오류:", error);
        setMessage("삭제 중 오류가 발생했습니다.");
        setMessageType("error");
        // 삭제 실패 시 원래 상태로 되돌릴 수 있습니다 (선택적)
        setProductsState(productsState);
      } finally {
        setIsLoading(false);
      }
    }
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
      transition: "border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out",
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
    loadingOverlay: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.3)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 9999,
    },
    loadingSpinner: {
      backgroundColor: "white",
      padding: "20px 40px",
      borderRadius: "8px",
      fontSize: "16px",
      fontWeight: "500",
    },
    disabledButton: {
      backgroundColor: "#cccccc",
      color: "#666666",
      cursor: "not-allowed",
    },
  };

  const getMessageStyle = () => {
    switch (messageType) {
      case "success":
        return { ...styles.message, ...styles.successMessage };
      case "warning":
        return { ...styles.message, ...styles.warningMessage };
      case "error":
        return { ...styles.message, ...styles.errorMessage };
      case "info":
        return { ...styles.message, ...styles.infoMessage };
      default:
        return styles.message;
    }
  };

  const getContentStyle = () => {
    if (activeTab === "admin") {
      return styles.contentBox;
    }
    return {};
  };

  const getAdminButtonStyle = () => {
    return {
      ...styles.adminButton,
      ...(activeTab === "admin" ? styles.adminActive : styles.adminInactive),
    };
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
      {isLoading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.loadingSpinner}>처리 중...</div>
        </div>
      )}

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
                {/* Savings Products */}
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
                              disabled={isLoading}
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
                              disabled={isLoading}
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
                              disabled={isLoading}
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
                              disabled={isLoading}
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
                                ...(isLoading && styles.disabledButton),
                              }}
                              disabled={isLoading}
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
                        ...(isLoading && styles.disabledButton),
                      }}
                      disabled={isLoading}
                    >
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("savings")}
                      style={{
                        ...styles.adminButtonSmall,
                        ...styles.saveButton,
                        ...(isLoading && styles.disabledButton),
                      }}
                      disabled={isLoading}
                    >
                      예금 상품 저장
                    </button>
                  </div>
                </div>

                {/* Installment Products */}
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
                              disabled={isLoading}
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
                              disabled={isLoading}
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
                              disabled={isLoading}
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
                              disabled={isLoading}
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
                                ...(isLoading && styles.disabledButton),
                              }}
                              disabled={isLoading}
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
                        ...(isLoading && styles.disabledButton),
                      }}
                      disabled={isLoading}
                    >
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("installments")}
                      style={{
                        ...styles.adminButtonSmall,
                        ...styles.saveButton,
                        ...(isLoading && styles.disabledButton),
                      }}
                      disabled={isLoading}
                    >
                      적금 상품 저장
                    </button>
                  </div>
                </div>

                {/* Loan Products */}
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
                              disabled={isLoading}
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
                              disabled={isLoading}
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
                              disabled={isLoading}
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
                              disabled={isLoading}
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
                                ...(isLoading && styles.disabledButton),
                              }}
                              disabled={isLoading}
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
                        ...(isLoading && styles.disabledButton),
                      }}
                      disabled={isLoading}
                    >
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("loans")}
                      style={{
                        ...styles.adminButtonSmall,
                        ...styles.saveButton,
                        ...(isLoading && styles.disabledButton),
                      }}
                      disabled={isLoading}
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