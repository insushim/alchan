// src/ItemStore.js
import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useItems } from "./ItemContext"; // ItemContext가 classCode를 사용하도록 수정되어야 함
import "./ItemStore.css";
import "./AdminPanel.css";
import LoginWarning from "./LoginWarning";
import AdminPanel from "./AdminPanel";

const StockBadge = ({ stock }) => {
  let badgeClass = "";
  let label = "";
  if (stock === undefined || stock === null) return null;
  if (stock <= 0) {
    badgeClass = "stock-low";
    label = "품절";
  } else if (stock <= 3) {
    badgeClass = "stock-low";
    label = "매진 임박";
  } else if (stock <= 5) {
    badgeClass = "stock-medium";
    label = "인기 상품";
  } else {
    badgeClass = "stock-high";
    label = "재고 충분";
  }
  return <span className={`stock-badge ${badgeClass}`}>{label}</span>;
};

const ItemStore = () => {
  const { user, userDoc, deductCash, isAdmin } = useAuth() || {
    user: null,
    userDoc: null,
    deductCash: null,
    isAdmin: () => false,
  };

  // !! 중요: useItems 훅은 내부적으로 현재 사용자의 classCode를 사용하여
  // !! 해당 학급의 아이템만 가져오도록 ItemContext에서 수정되어야 합니다.
  const {
    items, // 이 items는 이미 classCode로 필터링된 아이템이어야 합니다.
    purchaseItem, // 이 함수는 (itemId, quantity, priceIncrease, skipCashDeduction) 등을 인자로 받습니다.
    deleteItem, // 이 함수는 (itemId, classCode) 등을 인자로 받아야 할 수 있습니다.
    updateItem, // 이 함수는 (itemDataWithClassCode) 등을 인자로 받아야 할 수 있습니다.
    addItem, // 이 함수는 (itemData, classCode) 등을 인자로 받아야 할 수 있습니다.
    setAdminPriceIncrease, // 이 설정은 전역일 수도, classCode별일 수도 있습니다.
    adminPriceIncreasePercentage,
  } = useItems() || {
    items: [],
    purchaseItem: null,
    updateItem: null,
    deleteItem: null,
    addItem: null,
    setAdminPriceIncrease: null,
    adminPriceIncreasePercentage: 10,
  };

  const [shopItems, setShopItems] = useState([]);
  const [notification, setNotification] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [priceIncreasePercentage, setPriceIncreasePercentage] = useState(
    adminPriceIncreasePercentage || 10
  );
  const [isMobile, setIsMobile] = useState(false);
  const [purchaseQuantities, setPurchaseQuantities] = useState({});

  const isCurrentUserAdmin = isAdmin();
  const currentUserClassCode = userDoc?.classCode; // 현재 사용자의 classCode

  useEffect(() => {
    // items는 ItemContext에서 이미 classCode로 필터링되어 제공된다고 가정합니다.
    if (items && Array.isArray(items)) {
      const itemsWithDefaults = items.map((item) => ({
        ...item,
        initialStock: item.initialStock ?? item.stock ?? 10,
      }));
      const availableItems = itemsWithDefaults.filter(
        (item) => item?.available !== false
      );
      setShopItems(availableItems);

      const initialQuantities = {};
      availableItems.forEach((item) => {
        initialQuantities[item.id] = 1;
      });
      setPurchaseQuantities(initialQuantities);
    } else {
      setShopItems([]);
    }
  }, [items]); // items가 ItemContext에서 classCode에 따라 변경될 때마다 실행

  useEffect(() => {
    setPriceIncreasePercentage(adminPriceIncreasePercentage || 10);
  }, [adminPriceIncreasePercentage]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleEditItem = (item) => {
    setEditingItem({ ...item }); // 이 아이템은 이미 특정 classCode에 속해있음
    setShowAdminPanel(true);
  };

  const handleDeleteConfirm = (item) => {
    setItemToDelete(item);
    setShowDeleteConfirm(true);
  };

  const handleDeleteItem = async () => {
    if (!deleteItem || !itemToDelete || !currentUserClassCode) {
      // classCode 확인
      showNotification("error", "삭제 기능 오류 또는 학급 코드 없음");
      return;
    }
    try {
      // !! deleteItem 함수가 (itemId, classCode)를 받도록 ItemContext에서 수정 필요
      await deleteItem(itemToDelete.id, currentUserClassCode);
      showNotification("success", `${itemToDelete.name} 삭제 완료`);
    } catch (error) {
      console.error("아이템 삭제 중 오류:", error);
      showNotification("error", "아이템 삭제 중 오류가 발생했습니다.");
    } finally {
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    }
  };

  const handlePriceIncreaseChange = (value) => {
    // 이 설정이 classCode별로 되어야 한다면 setAdminPriceIncrease도 classCode를 받아야 함
    const numericValue = parseInt(value, 10);
    if (isNaN(numericValue) || numericValue < 0) {
      showNotification("error", "가격 인상률은 0 이상의 숫자여야 합니다.");
      setPriceIncreasePercentage(adminPriceIncreasePercentage || 10);
      if (setAdminPriceIncrease)
        setAdminPriceIncrease(
          adminPriceIncreasePercentage || 10 /*, currentUserClassCode */
        );
      return;
    }
    setPriceIncreasePercentage(numericValue);
    if (setAdminPriceIncrease)
      setAdminPriceIncrease(numericValue /*, currentUserClassCode */);
  };

  const handleQuantityChange = (itemId, value) => {
    const item = shopItems.find((item) => item.id === itemId);
    if (!item) return;
    let quantity = parseInt(value, 10);
    if (isNaN(quantity) || quantity < 1) quantity = 1;
    if (quantity > item.stock) quantity = item.stock;
    setPurchaseQuantities((prev) => ({ ...prev, [itemId]: quantity }));
  };

  const handlePurchase = async (item) => {
    if (!item || item.stock <= 0) return showNotification("error", "재고 없음");
    if (!user || !currentUserClassCode)
      return showNotification("error", "로그인 또는 학급 정보 필요"); // classCode 확인

    const quantity = purchaseQuantities[item.id] || 1;
    const currentUserCash =
      userDoc?.cash !== undefined ? userDoc.cash : user?.cash;
    if (currentUserCash === undefined)
      return showNotification("error", "잔액 정보 오류");

    const totalPrice = item.price * quantity;
    if (currentUserCash < totalPrice)
      return showNotification("error", "잔액 부족");

    if (!purchaseItem || !deductCash)
      return showNotification("error", "구매 기능 오류");

    try {
      const deductSuccess = await deductCash(totalPrice);
      if (!deductSuccess) return showNotification("error", "결제 처리 중 오류");

      // 올바른 파라미터 순서로 수정
      const purchaseResult = await purchaseItem(
        item.id, // itemId
        quantity, // quantityToPurchase
        priceIncreasePercentage, // priceIncreasePercentageFromStore
        true // skipCashDeduction = true
      );

      if (purchaseResult.success) {
        showNotification("success", `${item.name} ${quantity}개 구매 완료!`);
      } else {
        await deductCash(-totalPrice); // 구매 실패 시 환불
        showNotification(
          "error",
          `${item.name} 구매 실패. ${
            purchaseResult.message || "다시 시도해 주세요."
          }`
        );
      }
    } catch (error) {
      console.error("구매 처리 중 오류:", error);
      showNotification("error", "구매 중 문제가 발생했습니다.");
      // 실패 시 환불 시도
      try {
        await deductCash(-totalPrice);
      } catch (refundError) {
        console.error("환불 처리 중 오류:", refundError);
      }
    }
  };

  const handleAddItemViaAdminPanel = async (newItemData) => {
    // AdminPanel에서 호출될 함수
    if (!addItem || !currentUserClassCode) {
      // classCode 확인
      showNotification(
        "error",
        "아이템 추가 기능 사용 불가 또는 학급 코드 없음"
      );
      return false;
    }
    try {
      // !! addItem 함수가 (itemData, classCode)를 받도록 ItemContext에서 수정 필요
      const success = await addItem(newItemData, currentUserClassCode); // classCode 전달
      if (success) {
        showNotification("success", `${newItemData.name} 추가 완료`);
        return true;
      }
      return false;
    } catch (error) {
      console.error("아이템 추가 중 오류:", error);
      showNotification("error", "아이템 추가 중 오류가 발생했습니다.");
      return false;
    }
  };

  const handleUpdateItemViaAdminPanel = async (updatedItemData) => {
    // AdminPanel에서 호출될 함수
    if (!updateItem || !currentUserClassCode) {
      // classCode 확인
      showNotification(
        "error",
        "아이템 업데이트 기능 사용 불가 또는 학급 코드 없음"
      );
      return false;
    }
    try {
      // !! updateItem 함수가 (itemDataWithClassCode) 또는 (itemId, updates, classCode) 등을 받도록 ItemContext에서 수정 필요
      // updatedItemData에는 이미 classCode가 포함되어 있거나, 여기서 추가해야 함.
      // AdminPanel에서 저장 시 classCode를 포함하도록 수정했었음.
      const itemDataForUpdate = {
        ...updatedItemData,
        classCode: updatedItemData.classCode || currentUserClassCode,
      };

      const success = await updateItem(itemDataForUpdate);
      if (success) {
        showNotification("success", `${updatedItemData.name} 업데이트 완료`);
        // setShowAdminPanel(false); // AdminPanel 내부에서 탭 전환 등으로 처리할 수 있도록 여기서 닫지 않음
        // setEditingItem(null);
        return true;
      }
      return false;
    } catch (error) {
      console.error("아이템 업데이트 중 오류:", error);
      showNotification("error", "아이템 업데이트 중 오류가 발생했습니다.");
      return false;
    }
  };

  const getButtonText = (item) => {
    if (item.stock <= 0) return "품절";
    const currentUserCash =
      userDoc?.cash !== undefined ? userDoc.cash : user?.cash;
    const quantity = purchaseQuantities[item.id] || 1;
    const totalPrice = item.price * quantity;
    if (user && currentUserCash !== undefined && currentUserCash < totalPrice)
      return "잔액 부족";
    return "구매하기";
  };

  // userDoc.classCode가 없을 경우 AdminPanel 접근 제한
  const canOpenAdminPanel = isCurrentUserAdmin && currentUserClassCode;

  return (
    <div
      className={`page-container ${
        showAdminPanel && canOpenAdminPanel ? "admin-mode" : ""
      }`}
    >
      <div className="page-header-container">
        <h2 className="page-title">
          {showAdminPanel && canOpenAdminPanel
            ? "관리자 페이지"
            : "아이템 상점"}
          {currentUserClassCode && (
            <span
              style={{ fontSize: "0.7em", marginLeft: "10px", color: "#777" }}
            >
              (학급: {currentUserClassCode})
            </span>
          )}
        </h2>
        {isCurrentUserAdmin && ( // 관리자이고
          <button
            onClick={() => {
              if (!currentUserClassCode) {
                showNotification(
                  "error",
                  "관리자의 학급 코드가 없어 관리자 패널을 열 수 없습니다."
                );
                return;
              }
              setShowAdminPanel((prev) => !prev);
              if (showAdminPanel) setEditingItem(null);
            }}
            className="admin-icon-button"
            title={showAdminPanel ? "상점 보기" : "관리자 기능"}
          >
            {showAdminPanel && canOpenAdminPanel ? "🛒" : "⚙️"}
          </button>
        )}
      </div>

      {notification && (
        <div
          className={`notification ${
            notification.type === "success"
              ? "bg-green-100 text-green-800"
              : notification.type === "error"
              ? "bg-red-100 text-red-800"
              : "bg-blue-100 text-blue-800"
          }`}
        >
          {notification.message}
        </div>
      )}

      {showDeleteConfirm && canOpenAdminPanel && (
        <div className="delete-confirm-modal">
          <div className="delete-confirm-content">
            <h3>아이템 삭제 확인</h3>
            <p>
              <strong>{itemToDelete?.name}</strong> 아이템을 정말
              삭제하시겠습니까? <br />이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="delete-confirm-buttons">
              <button
                onClick={handleDeleteItem}
                className="delete-confirm-button"
              >
                삭제
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setItemToDelete(null);
                }}
                className="delete-cancel-button"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdminPanel && canOpenAdminPanel ? (
        <div className="admin-panel-full-container">
          <AdminPanel
            classCode={currentUserClassCode} // classCode 전달
            editingItemFromStore={editingItem}
            // AdminPanel에서 탭 전환 시 편집 아이템이 유지되도록 setEditingItemFromStore 제거 또는 수정
            // setEditingItemFromStore={setEditingItem}
            onAddItem={handleAddItemViaAdminPanel} // AdminPanel에서 호출될 함수
            onUpdateItem={handleUpdateItemViaAdminPanel} // AdminPanel에서 호출될 함수
            priceIncreasePercentage={priceIncreasePercentage}
            onPriceIncreaseChange={handlePriceIncreaseChange}
            onClose={() => {
              // AdminPanel 닫기 버튼 (또는 탭 전환) 시 호출될 함수
              setShowAdminPanel(false);
              setEditingItem(null);
            }}
          />
        </div>
      ) : (
        <>
          {!user && <LoginWarning />}
          {user && // 로그인 했을 때만 상점 표시
            (!currentUserClassCode ? ( // classCode가 없을 때
              <div
                className="empty-message"
                style={{ padding: "20px", textAlign: "center", color: "red" }}
              >
                학급 코드 정보가 없어 상점 기능을 이용할 수 없습니다. 관리자에게
                문의하세요.
              </div>
            ) : shopItems.length > 0 ? ( // classCode가 있고 아이템이 있을 때
              <div className="shop-content">
                <div className="content-card-section">
                  <h3 className="section-title">판매 아이템</h3>
                  <div className="items-grid">
                    {shopItems.map((item) => (
                      <div
                        key={item.id}
                        className="store-item-card shop-item-card"
                        data-icon={item.icon || "🆕"}
                      >
                        <div className="item-content">
                          <div
                            className={`item-header ${
                              isMobile ? "flex-col items-start" : ""
                            }`}
                          >
                            <div className="item-icon-container">
                              <div className="item-icon">
                                {item.icon || "🆕"}
                              </div>
                            </div>
                            <div className={isMobile ? "w-full" : ""}>
                              <h3 className="item-name">{item.name}</h3>
                              <p className="item-stock">
                                <span className="item-stock-label">재고:</span>
                                <span
                                  className={
                                    item.stock <= 3
                                      ? "item-stock-low"
                                      : "item-stock-count"
                                  }
                                >
                                  {item.stock ?? "?"}
                                </span>
                                <StockBadge stock={item.stock} />
                              </p>
                            </div>
                          </div>
                          <p className="item-description">
                            {item.description || "아이템 설명이 없습니다."}
                          </p>
                          <div
                            className={`item-actions-primary ${
                              isMobile ? "flex-col" : ""
                            }`}
                          >
                            <span
                              className={`item-price ${isMobile ? "mb-2" : ""}`}
                            >
                              {item.price?.toLocaleString() || 0} 원
                              {purchaseQuantities[item.id] > 1 &&
                                ` × ${purchaseQuantities[item.id]} = ${(
                                  item.price *
                                  (purchaseQuantities[item.id] || 1)
                                ).toLocaleString()} 원`}
                            </span>
                            <div className="quantity-and-buy-container">
                              <input
                                type="number"
                                min="1"
                                max={item.stock}
                                value={purchaseQuantities[item.id] || 1}
                                onChange={(e) =>
                                  handleQuantityChange(item.id, e.target.value)
                                }
                                className="quantity-input"
                                disabled={item.stock <= 0}
                              />
                              <button
                                onClick={() => handlePurchase(item)}
                                className={`buy-item-button ${
                                  isMobile ? "w-full" : ""
                                }`}
                                disabled={
                                  !user ||
                                  item.stock <= 0 ||
                                  (userDoc?.cash !== undefined
                                    ? userDoc.cash
                                    : user?.cash) <
                                    item.price *
                                      (purchaseQuantities[item.id] || 1)
                                }
                              >
                                {getButtonText(item)}
                              </button>
                            </div>
                          </div>
                          {isCurrentUserAdmin &&
                            currentUserClassCode && ( // 관리자이고 classCode 있을때만
                              <div className="item-actions-admin">
                                <button
                                  onClick={() => handleEditItem(item)}
                                  className="edit-item-button"
                                  title="아이템 수정"
                                >
                                  수정
                                  <span className="admin-button-icon">✏️</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteConfirm(item)}
                                  className="delete-item-button"
                                  title="아이템 삭제"
                                >
                                  삭제
                                  <span className="admin-button-icon">🗑️</span>
                                </button>
                              </div>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              // classCode는 있지만 아이템이 없을 때
              <div
                className="empty-message"
                style={{ padding: "20px", textAlign: "center" }}
              >
                <p>판매 중인 아이템이 없습니다.</p>
                {isCurrentUserAdmin && currentUserClassCode && (
                  <p>관리자 기능을 통해 아이템을 추가할 수 있습니다.</p>
                )}
              </div>
            ))}
        </>
      )}
    </div>
  );
};

export default ItemStore;
