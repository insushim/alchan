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
      product.dailyRate !== undefined && !isNaN(product.dailyRate) ? parseFloat(product.dailyRate) : 0,
    termInDays:
      product.termInDays !== undefined && !isNaN(product.termInDays) ? parseInt(product.termInDays) : 1,
    minAmount:
      product.minAmount !== undefined && !isNaN(product.minAmount) ? parseInt(product.minAmount) : 0,
    maxAmount:
      product.maxAmount !== undefined && !isNaN(product.maxAmount) ? parseInt(product.maxAmount) : 0,
  }));
};

import "./Banking.css";

const styles = {
  adminSection: {
    marginBottom: "30px",
    paddingBottom: "20px",
    borderBottom: "1px solid #eee",
  },
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
        } else if (field === "dailyRate") {
          const dailyRateValue = parseFloat(value);
          updatedProduct.dailyRate =
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
      dailyRate: 0.01,
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

  if (auth.loading) {
    return (
      <div className="banking-container">
        <div style={{ padding: "20px", textAlign: "center" }}>
          금융 정보 로딩 중...
        </div>
      </div>
    );
  }

  return (
    <div className="banking-container">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">처리 중...</div>
        </div>
      )}

      <div className="header">
        <div className="header-content">
          <div className="logo-circle">B</div>
          <h1 className="bank-title">통합 금융 관리</h1>
        </div>
        {auth.user &&
          (auth.userDoc?.isAdmin || auth.userDoc?.role === "admin") && (
            <button
              onClick={() =>
                setActiveTab(activeTab === "admin" ? "parking" : "admin")
              }
              className={`admin-button ${activeTab === "admin" ? "admin-active" : "admin-inactive"}`}>
              {activeTab === "admin" ? "사용자 화면 보기" : "관리자 모드"}
            </button>
          )}
      </div>

      <div className="content-container">
        {message && <div className={`message ${messageType}-message`}>{message}</div>}

        <div className="tab-container">
          <div className="tab-menu">
            <button
              className={`tab-button ${activeTab === "parking" ? "parking-tab-active" : "parking-tab-inactive"}`}
              onClick={() => setActiveTab("parking")}>
              나의 금융 현황
            </button>
            {auth.user &&
              (auth.userDoc?.isAdmin || auth.userDoc?.role === "admin") && (
                <button
                  className={`tab-button ${activeTab === "admin" ? "parking-tab-active" : "parking-tab-inactive"}`}
                  onClick={() => setActiveTab("admin")}
                  disabled={
                    !(auth.userDoc?.isAdmin || auth.userDoc?.role === "admin")
                  }>
                  상품 관리 (관리자)
                </button>
              )}
          </div>
        </div>

        <div className={activeTab === "admin" ? "content-box" : ""}>
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
                <h2 className="admin-header">
                  관리자 - 금융 상품 관리 (일 복리 기준)
                </h2>
                {/* Savings Products */}
                <div className="admin-section">
                  <h3>파킹 예금 상품</h3>
                  <p className="admin-info-text">
                    일 이율(%)과 기간(일)을 입력합니다. 변경 후 '저장' 버튼을
                    클릭하세요.
                  </p>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th style={{width: "25%" }}>
                          상품명
                        </th>
                        <th style={{width: "15%" }}>
                          기간(일)
                        </th>
                        <th style={{width: "18%" }}>
                          일 이율(%)
                        </th>
                        <th style={{width: "18%" }}>
                          최소금액(원)
                        </th>
                        <th style={{width: "12%" }}>
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parkingSavingsProducts.map((p, index) => (
                        <tr key={p.id}>
                          <td className="admin-td">
                            <input
                              type="text"
                              value={p.name || ''}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "savings",
                                  index,
                                  "name",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="1"
                              value={p.termInDays || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "savings",
                                  index,
                                  "termInDays",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={p.dailyRate || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "savings",
                                  index,
                                  "dailyRate",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              placeholder="예: 0.01"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="0"
                              value={p.minAmount || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "savings",
                                  index,
                                  "minAmount",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <button
                              onClick={() =>
                                deleteParkingProduct("savings", index)
                              }
                              className={`admin-button-small delete-button ${isLoading ? "disabled-button" : ""}`}
                              disabled={isLoading}>
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="admin-action-buttons">
                    <button
                      onClick={() => addParkingProduct("savings")}
                      className={`admin-button-small add-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("savings")}
                      className={`admin-button-small save-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
                      예금 상품 저장
                    </button>
                  </div>
                </div>

                {/* Installment Products */}
                <div className="admin-section">
                  <h3>파킹 적금 상품</h3>
                  <p className="admin-info-text">
                    일 이율(%)과 기간(일)을 입력합니다. 변경 후 '저장' 버튼을
                    클릭하세요.
                  </p>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th style={{width: "25%" }}>
                          상품명
                        </th>
                        <th style={{width: "15%" }}>
                          기간(일)
                        </th>
                        <th style={{width: "18%" }}>
                          일 이율(%)
                        </th>
                        <th style={{width: "18%" }}>
                          최소 월납입(원)
                        </th>
                        <th style={{width: "12%" }}>
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parkingInstallmentProducts.map((p, index) => (
                        <tr key={p.id}>
                          <td className="admin-td">
                            <input
                              type="text"
                              value={p.name || ''}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "name",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="1"
                              value={p.termInDays || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "termInDays",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={p.dailyRate || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "dailyRate",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              placeholder="예: 0.011"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="0"
                              value={p.minAmount || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "minAmount",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <button
                              onClick={() =>
                                deleteParkingProduct("installments", index)
                              }
                              className={`admin-button-small delete-button ${isLoading ? "disabled-button" : ""}`}
                              disabled={isLoading}>
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="admin-action-buttons">
                    <button
                      onClick={() => addParkingProduct("installments")}
                      className={`admin-button-small add-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("installments")}
                      className={`admin-button-small save-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
                      적금 상품 저장
                    </button>
                  </div>
                </div>

                {/* Loan Products */}
                <div style={{ ...styles.adminSection, borderBottom: "none" }}>
                  <h3>파킹 대출 상품</h3>
                  <p className="admin-info-text">
                    일 이율(%)과 기간(일)을 입력합니다. 변경 후 '저장' 버튼을
                    클릭하세요.
                  </p>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th style={{width: "25%" }}>
                          상품명
                        </th>
                        <th style={{width: "15%" }}>
                          기간(일)
                        </th>
                        <th style={{width: "18%" }}>
                          일 이율(%)
                        </th>
                        <th style={{width: "18%" }}>
                          최대 대출액(원)
                        </th>
                        <th style={{width: "12%" }}>
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parkingLoanProducts.map((p, index) => (
                        <tr key={p.id}>
                          <td className="admin-td">
                            <input
                              type="text"
                              value={p.name || ''}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "name",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="1"
                              value={p.termInDays || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "termInDays",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={p.dailyRate || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "dailyRate",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              placeholder="예: 0.05"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="0"
                              value={p.maxAmount || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "maxAmount",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                            />
                          </td>
                          <td className="admin-td">
                            <button
                              onClick={() =>
                                deleteParkingProduct("loans", index)
                              }
                              className={`admin-button-small delete-button ${isLoading ? "disabled-button" : ""}`}
                              disabled={isLoading}>
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="admin-action-buttons">
                    <button
                      onClick={() => addParkingProduct("loans")}
                      className={`admin-button-small add-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("loans")}
                      className={`admin-button-small save-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
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