// src/MyItems.js
import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useItems } from "./ItemContext"; // ItemContext 사용
import "./styles.css";
import "./MyItems.css";
import LoginWarning from "./LoginWarning";
import { useNavigate } from "react-router-dom"; // 아이템 시장으로 이동하기 위해 추가

const ITEM_DEFAULT_DURATION_MS = 60 * 60 * 1000;

const formatTimeLeft = (
  usedTimestamp,
  durationMs = ITEM_DEFAULT_DURATION_MS
) => {
  const now = Date.now();
  const timeElapsed = now - usedTimestamp;
  const timeLeft = durationMs - timeElapsed;

  if (timeLeft <= 0) return "만료됨";

  const hours = Math.floor(timeLeft / (60 * 60 * 1000));
  const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);

  let formattedTime = "";
  if (hours > 0) formattedTime += `${hours}시간 `;
  if (minutes > 0 || hours > 0) formattedTime += `${minutes}분 `;
  formattedTime += `${seconds}초 남음`;

  return formattedTime.trim();
};

const QuantityBadge = ({ quantity }) => {
  let badgeClass = "";
  if (quantity > 10) badgeClass = "quantity-high";
  else if (quantity > 5) badgeClass = "quantity-medium";
  else badgeClass = "quantity-low";
  return <span className={`quantity-badge ${badgeClass}`}>×{quantity}</span>;
};

const MyItems = () => {
  const { user } = useAuth() || {};
  const { userItems, useItem, giftItem, listItemForSale } = useItems // listItemForSale 추가
    ? useItems()
    : { userItems: [], useItem: null, giftItem: null, listItemForSale: null };
  const navigate = useNavigate(); // useNavigate 훅 사용

  const [notification, setNotification] = useState(null);
  const [recentlyUsedItems, setRecentlyUsedItems] = useState(() => {
    const savedUsedItems = localStorage.getItem(
      `recentlyUsedItems_${user?.id || "guest"}`
    );
    try {
      const parsed = savedUsedItems ? JSON.parse(savedUsedItems) : {};
      const now = Date.now();
      Object.keys(parsed).forEach((itemId) => {
        const itemData = parsed[itemId];
        const duration =
          itemData.itemDetails?.durationMs || ITEM_DEFAULT_DURATION_MS;
        if (now - itemData.usedTimestamp > duration) {
          delete parsed[itemId];
        }
      });
      return parsed;
    } catch (error) {
      return {};
    }
  });

  const [giftModal, setGiftModal] = useState({ isOpen: false, itemId: null });
  const [giftQuantity, setGiftQuantity] = useState(1);
  const [giftRecipient, setGiftRecipient] = useState("");

  // 아이템 시장 판매 모달 상태
  const [sellToMarketModal, setSellToMarketModal] = useState({
    isOpen: false,
    item: null,
    quantity: 1,
    price: 0,
  });

  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(
        `recentlyUsedItems_${user.id}`,
        JSON.stringify(recentlyUsedItems)
      );
    } else if (Object.keys(recentlyUsedItems).length === 0) {
      localStorage.removeItem("recentlyUsedItems_guest");
    }
  }, [recentlyUsedItems, user?.id]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setRecentlyUsedItems((prevItems) => {
        let itemsChanged = false;
        const updatedItems = { ...prevItems };
        const now = Date.now();
        Object.keys(updatedItems).forEach((itemId) => {
          const itemData = updatedItems[itemId];
          const duration =
            itemData.itemDetails?.durationMs || ITEM_DEFAULT_DURATION_MS;
          if (now - itemData.usedTimestamp > duration) {
            delete updatedItems[itemId];
            itemsChanged = true;
          }
        });
        return itemsChanged ? updatedItems : prevItems;
      });
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleUseItem = async (itemId) => {
    // Firestore 연동을 위해 async 추가
    if (!useItem) return;
    const itemToUse = userItems?.find((item) => item?.id === itemId);
    if (!itemToUse) return;
    try {
      const useSuccessful = await useItem(itemId); // await 추가
      if (useSuccessful) {
        setRecentlyUsedItems((prevItems) => {
          const updatedItems = { ...prevItems };
          updatedItems[itemId] = {
            quantity: (updatedItems[itemId]?.quantity || 0) + 1,
            usedTimestamp: Date.now(),
            itemDetails: {
              ...itemToUse,
              durationMs: itemToUse.durationMs || ITEM_DEFAULT_DURATION_MS,
            },
          };
          return updatedItems;
        });
        showNotification("success", `${itemToUse.name}을(를) 사용했습니다!`);
      } else {
        // useItem 내부에서 오류를 throw하지 않고 false를 반환하는 경우
        showNotification(
          "error",
          "아이템 사용에 실패했습니다. (예: 조건 불충족)"
        );
      }
    } catch (error) {
      // useItem 내부에서 오류를 throw하는 경우
      console.error("Error using item:", error);
      showNotification(
        "error",
        `아이템 사용 중 오류 발생: ${error.message || "알 수 없는 오류"}`
      );
    }
  };

  const handleDeleteUsedItem = (itemId) => {
    setRecentlyUsedItems((prevItems) => {
      const updatedItems = { ...prevItems };
      if (updatedItems[itemId]) {
        const itemName = updatedItems[itemId]?.itemDetails?.name || "아이템";
        if (updatedItems[itemId].quantity > 1) {
          updatedItems[itemId].quantity -= 1;
        } else {
          delete updatedItems[itemId];
        }
        showNotification("info", `${itemName} 효과를 중단했습니다.`);
      }
      return updatedItems;
    });
  };

  const handleOpenGiftModal = (itemId) => {
    const item = userItems?.find((item) => item?.id === itemId);
    if (item) {
      setGiftModal({ isOpen: true, itemId: itemId });
      setGiftQuantity(1);
      setGiftRecipient("");
    }
  };

  const handleCloseGiftModal = () =>
    setGiftModal({ isOpen: false, itemId: null });

  const handleSendGift = async () => {
    // giftItem이 비동기일 수 있으므로 async 추가 고려
    if (!giftItem) return;
    const itemToGift = userItems?.find((item) => item?.id === giftModal.itemId);
    if (
      !itemToGift ||
      giftQuantity <= 0 ||
      giftQuantity > itemToGift.quantity ||
      !giftRecipient.trim()
    ) {
      showNotification("error", "선물 정보를 확인해주세요.");
      return;
    }
    try {
      const giftSuccessful = await giftItem(
        // giftItem이 비동기 함수라고 가정하고 await 사용
        giftModal.itemId,
        giftQuantity,
        giftRecipient.trim()
      );
      if (giftSuccessful) {
        showNotification(
          "success",
          `${giftRecipient.trim()}님에게 ${
            itemToGift.name
          } ${giftQuantity}개를 선물했습니다!`
        );
        handleCloseGiftModal();
      } else {
        showNotification(
          "error",
          "선물하기에 실패했습니다. (예: 수신자 없음, 아이템 부족 등)"
        );
      }
    } catch (error) {
      console.error("Error gifting item:", error);
      showNotification(
        "error",
        `선물하기 중 오류 발생: ${error.message || "알 수 없는 오류"}`
      );
    }
  };

  // 시장에 판매하기 모달 열기
  const handleOpenSellToMarketModal = (item) => {
    setSellToMarketModal({
      isOpen: true,
      item: item,
      quantity: 1,
      price: item.price ? Math.max(1, Math.round(item.price * 0.8)) : 10, // 기본 판매가는 상점가의 80% 또는 최소 10원
    });
  };

  const handleCloseSellToMarketModal = () =>
    setSellToMarketModal({ isOpen: false, item: null, quantity: 1, price: 0 });

  const handleSellToMarketQuantityChange = (value) => {
    const maxQty = sellToMarketModal.item?.quantity || 1;
    setSellToMarketModal((prev) => ({
      ...prev,
      quantity: Math.max(1, Math.min(maxQty, parseInt(value) || 1)),
    }));
  };

  const handleSellToMarketPriceChange = (value) => {
    setSellToMarketModal((prev) => ({
      ...prev,
      price: Math.max(1, parseInt(value) || 1),
    }));
  };

  // 시장에 아이템 판매 등록 로직
  const handleConfirmSellToMarket = async () => {
    if (!listItemForSale || !sellToMarketModal.item) return;
    const { item, quantity, price } = sellToMarketModal;

    if (quantity <= 0 || price <= 0) {
      showNotification("error", "수량과 가격을 올바르게 입력해주세요.");
      return;
    }
    if (quantity > item.quantity) {
      showNotification("error", "보유 수량보다 많이 판매할 수 없습니다.");
      return;
    }

    try {
      const result = await listItemForSale({
        itemId: item.id,
        quantity,
        price,
      });

      if (result.success) {
        showNotification(
          "success",
          `${item.name} ${quantity}개를 시장에 ${price}원으로 판매 등록했습니다.`
        );
        handleCloseSellToMarketModal();
        // 선택적: 아이템 시장 페이지로 이동
        // navigate('/item-market');
      } else {
        showNotification(
          "error",
          result.message || "시장 판매 등록에 실패했습니다."
        );
      }
    } catch (error) {
      console.error("Error listing item for sale:", error);
      showNotification(
        "error",
        `시장 판매 등록 중 오류 발생: ${error.message || "알 수 없는 오류"}`
      );
    }
  };

  return (
    <div className="page-container relative">
      <h2 className="page-title">내 아이템</h2>

      {!user && <LoginWarning />}

      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {user && (
        <>
          <div className="content-card-section">
            <h3 className="section-title">보유 아이템</h3>
            {userItems &&
            userItems.length > 0 &&
            userItems.some((item) => item && item.quantity > 0) ? (
              <div className="items-grid">
                {userItems.map(
                  (item) =>
                    item &&
                    item.quantity > 0 && (
                      <div
                        key={item.id}
                        className="store-item-card shop-item-card"
                      >
                        <div className="item-content">
                          <div className="my-item-header">
                            <div className="item-icon-group">
                              <div className="item-icon">
                                {item.icon || "🆕"}
                              </div>
                              <QuantityBadge quantity={item.quantity} />
                            </div>
                            <h3 className="item-name">{item.name}</h3>
                          </div>
                          <p className="item-description">{item.description}</p>
                          <div className="item-footer my-item-actions">
                            {" "}
                            {/* 클래스명 변경 */}
                            <button
                              onClick={() => handleUseItem(item.id)}
                              className="use-item-button"
                              disabled={item.quantity <= 0}
                            >
                              사용하기
                            </button>
                            <button
                              onClick={() => handleOpenGiftModal(item.id)}
                              className="gift-item-button"
                              disabled={item.quantity <= 0}
                            >
                              선물하기
                            </button>
                            {/* 시장에 판매하기 버튼 추가 */}
                            <button
                              onClick={() => handleOpenSellToMarketModal(item)}
                              className="sell-to-market-button"
                              disabled={item.quantity <= 0}
                            >
                              시장에 팔기
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                )}
              </div>
            ) : (
              <div className="empty-message">
                <p>보유 중인 아이템이 없습니다.</p>
              </div>
            )}
          </div>

          {/* 선물하기 모달 (기존과 동일하게 유지하되, 스타일은 CSS로 관리) */}
          {giftModal.isOpen &&
            (() => {
              const itemToGift = userItems?.find(
                (item) => item?.id === giftModal.itemId
              );
              const maxQuantity = itemToGift?.quantity || 1;
              return (
                <div className="modal-overlay" onClick={handleCloseGiftModal}>
                  <div
                    className="modal-container"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="modal-header">
                      <h3>{itemToGift?.name || "아이템"} 선물하기</h3>
                      <button
                        onClick={handleCloseGiftModal}
                        className="close-button"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="modal-body">
                      <div className="form-group">
                        <label htmlFor="giftRecipient">선물 받을 친구:</label>
                        <input
                          id="giftRecipient"
                          type="text"
                          value={giftRecipient}
                          onChange={(e) => setGiftRecipient(e.target.value)}
                          placeholder="친구 이름 또는 ID 입력"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="giftQuantity">
                          선물할 수량: (최대 {maxQuantity}개)
                        </label>
                        <div className="quantity-controls">
                          <button
                            onClick={() =>
                              setGiftQuantity((prev) => Math.max(1, prev - 1))
                            }
                            disabled={giftQuantity <= 1}
                          >
                            -
                          </button>
                          <input
                            id="giftQuantity"
                            type="number"
                            min="1"
                            max={maxQuantity}
                            value={giftQuantity}
                            onChange={(e) =>
                              setGiftQuantity(
                                Math.max(
                                  1,
                                  Math.min(
                                    maxQuantity,
                                    parseInt(e.target.value) || 1
                                  )
                                )
                              )
                            }
                          />
                          <button
                            onClick={() =>
                              setGiftQuantity((prev) =>
                                Math.min(maxQuantity, prev + 1)
                              )
                            }
                            disabled={giftQuantity >= maxQuantity}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button
                        onClick={handleCloseGiftModal}
                        className="button-secondary"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleSendGift}
                        className="button-primary"
                      >
                        선물하기
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* 시장에 판매하기 모달 */}
          {sellToMarketModal.isOpen && sellToMarketModal.item && (
            <div
              className="modal-overlay"
              onClick={handleCloseSellToMarketModal}
            >
              <div
                className="modal-container"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3>'{sellToMarketModal.item.name}' 시장에 판매하기</h3>
                  <button
                    onClick={handleCloseSellToMarketModal}
                    className="close-button"
                  >
                    ✕
                  </button>
                </div>
                <div className="modal-body">
                  <div
                    className="item-preview-simple"
                    style={{ marginBottom: "15px" }}
                  >
                    <span className="item-icon-small">
                      {sellToMarketModal.item.icon}
                    </span>
                    <span>
                      {sellToMarketModal.item.name} (보유:{" "}
                      {sellToMarketModal.item.quantity}개)
                    </span>
                  </div>
                  <div className="form-group">
                    <label htmlFor="sellToMarketQuantity">
                      판매 수량 (최대: {sellToMarketModal.item.quantity}개):
                    </label>
                    <input
                      type="number"
                      id="sellToMarketQuantity"
                      value={sellToMarketModal.quantity}
                      onChange={(e) =>
                        handleSellToMarketQuantityChange(e.target.value)
                      }
                      min="1"
                      max={sellToMarketModal.item.quantity}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="sellToMarketPrice">
                      개당 판매 가격 (원):
                    </label>
                    <input
                      type="number"
                      id="sellToMarketPrice"
                      value={sellToMarketModal.price}
                      onChange={(e) =>
                        handleSellToMarketPriceChange(e.target.value)
                      }
                      min="1"
                    />
                  </div>
                  <p>
                    예상 판매 총액:{" "}
                    <strong>
                      {(
                        sellToMarketModal.price * sellToMarketModal.quantity
                      ).toLocaleString()}
                      원
                    </strong>
                  </p>
                </div>
                <div className="modal-footer">
                  <button
                    onClick={handleCloseSellToMarketModal}
                    className="button-secondary"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleConfirmSellToMarket}
                    className="button-primary"
                  >
                    판매 등록
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 사용 중인 아이템 섹션 (기존과 동일하게 유지) */}
          {Object.keys(recentlyUsedItems).length > 0 && (
            <div className="content-card-section mt-6">
              <h3 className="section-title">사용 중인 아이템</h3>
              <div className="items-grid">
                {Object.entries(recentlyUsedItems).map(([itemId, itemData]) => {
                  const details = itemData.itemDetails || {};
                  const durationMs =
                    details.durationMs || ITEM_DEFAULT_DURATION_MS;
                  const timeLeftMs = itemData.usedTimestamp
                    ? durationMs - (Date.now() - itemData.usedTimestamp)
                    : -1;
                  if (timeLeftMs <= 0 && itemData.usedTimestamp) return null;
                  return (
                    <div
                      key={`used-${itemId}`}
                      className="store-item-card shop-item-card active-item-card"
                    >
                      <div className="item-content">
                        <div className="active-item-header">
                          <div className="active-item-details">
                            <div className="item-icon-group">
                              <div className="item-icon active-icon">
                                {details.icon || "❓"}
                              </div>
                            </div>
                            <span className="name-badge-group">
                              <h3 className="item-name">
                                {details.name || "알 수 없는 아이템"}
                              </h3>
                              {itemData.quantity > 0 && (
                                <span className="active-quantity-badge">
                                  ×{itemData.quantity}
                                </span>
                              )}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteUsedItem(itemId)}
                            className="active-item-cancel-button"
                            title="효과 중단하기"
                          >
                            ✕
                          </button>
                        </div>
                        <p className="item-description">
                          {details.description || "설명이 없습니다."}
                        </p>
                        <div className="active-item-timer">
                          <div className="timer-bar">
                            <div
                              className="timer-progress"
                              style={{
                                width: `${
                                  itemData.usedTimestamp
                                    ? Math.max(
                                        0,
                                        (timeLeftMs / durationMs) * 100
                                      )
                                    : 0
                                }%`,
                              }}
                            ></div>
                          </div>
                          <span className="timer-text">
                            {itemData.usedTimestamp
                              ? formatTimeLeft(
                                  itemData.usedTimestamp,
                                  durationMs
                                )
                              : "시간 정보 없음"}
                          </span>
                        </div>
                        <div className="active-item-footer">
                          <span className="active-status">
                            {timeLeftMs > 0 ? "사용 중" : "만료됨"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MyItems;
