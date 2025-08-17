// src/Admin.js
import React, { useState } from "react";
import AdminParking from "./AdminParking"; // AdminParking 컴포넌트 임포트

const Admin = ({
  depositProducts,
  setDepositProducts,
  savingProducts,
  setSavingProducts,
  loanProducts,
  setLoanProducts,
  setMessage,
  setMessageType,
}) => {
  const [adminActiveTab, setAdminActiveTab] = useState("deposit"); // 'deposit', 'saving', 'loan', 'parking'
  const [newProductName, setNewProductName] = useState("");
  const [newProductPeriod, setNewProductPeriod] = useState("");
  const [newProductRate, setNewProductRate] = useState("");

  // 상품 유형 텍스트 반환 함수
  const getProductTypeText = (type) => {
    switch (type) {
      case "deposit":
        return "예금";
      case "saving":
        return "적금";
      case "loan":
        return "대출";
      case "parking":
        return "파킹 통장"; // Add parking type
      default:
        return "금융";
    }
  };

  // 관리자 상품 추가 처리 함수
  const handleAddProduct = () => {
    // 유효성 검사
    if (!newProductName || newProductName.trim() === "") {
      setMessage("상품명을 입력해주세요.");
      setMessageType("error");
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (
      !newProductPeriod ||
      isNaN(newProductPeriod) ||
      parseInt(newProductPeriod) <= 0
    ) {
      setMessage("유효한 기간을 입력해주세요.");
      setMessageType("error");
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (
      !newProductRate ||
      isNaN(newProductRate) ||
      parseFloat(newProductRate) < 0
    ) {
      setMessage("유효한 이율을 입력해주세요.");
      setMessageType("error");
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    const newProduct = {
      id: Date.now(),
      name: newProductName,
      period: parseInt(newProductPeriod),
      rate: parseFloat(newProductRate),
    };

    // 상품 유형에 따라 다른 상태 및 저장소에 추가
    let updatedProducts = [];
    let storageKey = "";

    if (adminActiveTab === "deposit") {
      updatedProducts = [...depositProducts, newProduct];
      setDepositProducts(updatedProducts);
      storageKey = "depositProducts";
    } else if (adminActiveTab === "saving") {
      updatedProducts = [...savingProducts, newProduct];
      setSavingProducts(updatedProducts);
      storageKey = "savingProducts";
    } else if (adminActiveTab === "loan") {
      updatedProducts = [...loanProducts, newProduct];
      setLoanProducts(updatedProducts);
      storageKey = "loanProducts";
    } else {
      // 파킹 통장은 상품 추가 목록에 포함되지 않으므로 오류 메시지 또는 처리가 필요 없습니다.
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(updatedProducts));

    // 성공 메시지 표시
    setMessage(
      `새 ${getProductTypeText(adminActiveTab)} 상품이 추가되었습니다.`
    );
    setMessageType("success");

    // 입력 필드 초기화
    setNewProductName("");
    setNewProductPeriod("");
    setNewProductRate("");

    setTimeout(() => {
      setMessage(null);
    }, 3000);
  };

  // 관리자 상품 삭제 처리 함수
  const handleDeleteProduct = (id, type) => {
    let updatedProducts = [];
    let productList = [];
    let storageKey = "";

    if (type === "deposit") {
      productList = depositProducts;
      storageKey = "depositProducts";
    } else if (type === "saving") {
      productList = savingProducts;
      storageKey = "savingProducts";
    } else if (type === "loan") {
      productList = loanProducts;
      storageKey = "loanProducts";
    } else {
      return; // 파킹 통장은 삭제 대상이 아닙니다.
    }

    updatedProducts = productList.filter((product) => product.id !== id);

    if (type === "deposit") {
      setDepositProducts(updatedProducts);
    } else if (type === "saving") {
      setSavingProducts(updatedProducts);
    } else if (type === "loan") {
      setLoanProducts(updatedProducts);
    }

    localStorage.setItem(storageKey, JSON.stringify(updatedProducts));

    setMessage(`${getProductTypeText(type)} 상품이 삭제되었습니다.`);
    setMessageType("success");
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="admin-panel bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-semibold mb-4">관리자 기능</h3>

      {/* 관리자 탭 메뉴 */}
      <div className="admin-tabs mb-6 border-b">
        <div className="flex">
          <button
            className={`py-2 px-4 font-medium ${
              adminActiveTab === "parking"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setAdminActiveTab("parking")}
          >
            파킹 통장 관리
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              adminActiveTab === "deposit"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setAdminActiveTab("deposit")}
          >
            예금 상품 관리
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              adminActiveTab === "saving"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setAdminActiveTab("saving")}
          >
            적금 상품 관리
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              adminActiveTab === "loan"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setAdminActiveTab("loan")}
          >
            대출 상품 관리
          </button>
        </div>
      </div>

      {/* 관리자 탭 내용 */}
      <div className="admin-tab-content">
        {adminActiveTab === "parking" && <AdminParking />}

        {adminActiveTab !== "parking" && ( // Show product management for other tabs
          <>
            {/* 상품 추가 폼 */}
            <div className="add-product-form mb-6 p-4 bg-gray-50 rounded-md">
              <h4 className="font-semibold mb-3">
                {getProductTypeText(adminActiveTab)} 상품 추가
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    상품명
                  </label>
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="상품명 입력"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    기간 (일)
                  </label>
                  <input
                    type="number"
                    value={newProductPeriod}
                    onChange={(e) => setNewProductPeriod(e.target.value)}
                    className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="기간 입력 (일)"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이율 (%)
                  </label>
                  <input
                    type="number"
                    value={newProductRate}
                    onChange={(e) => setNewProductRate(e.target.value)}
                    className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="이율 입력 (%)"
                    min="0"
                    step="0.1"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddProduct}
                className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-md focus:outline-none"
              >
                상품 추가하기
              </button>
            </div>

            {/* 상품 목록 테이블 */}
            <div className="product-list">
              <h4 className="font-semibold mb-3">
                {getProductTypeText(adminActiveTab)} 상품 목록
              </h4>

              {/* 예금 상품 목록 */}
              {adminActiveTab === "deposit" &&
                (depositProducts.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    등록된 예금 상품이 없습니다.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            상품명
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            기간 (일)
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            이율 (%)
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            관리
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {depositProducts.map((product) => (
                          <tr key={product.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {product.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {product.period}일
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {product.rate}%
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() =>
                                  handleDeleteProduct(product.id, "deposit")
                                }
                                className="text-red-600 hover:text-red-900"
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

              {/* 적금 상품 목록 */}
              {adminActiveTab === "saving" &&
                (savingProducts.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    등록된 적금 상품이 없습니다.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            상품명
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            기간 (일)
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            이율 (%)
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            관리
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {savingProducts.map((product) => (
                          <tr key={product.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {product.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {product.period}일
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {product.rate}%
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() =>
                                  handleDeleteProduct(product.id, "saving")
                                }
                                className="text-red-600 hover:text-red-900"
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

              {/* 대출 상품 목록 */}
              {adminActiveTab === "loan" &&
                (loanProducts.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    등록된 대출 상품이 없습니다.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            상품명
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            기간 (일)
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            이율 (%)
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            관리
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {loanProducts.map((product) => (
                          <tr key={product.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {product.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {product.period}일
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {product.rate}%
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() =>
                                  handleDeleteProduct(product.id, "loan")
                                }
                                className="text-red-600 hover:text-red-900"
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Admin;
