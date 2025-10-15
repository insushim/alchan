// src/MyItems.js
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { useItems } from "./ItemContext";
import "./styles.css";
import "./MyItems.css";
import LoginWarning from "./LoginWarning";
import { useNavigate } from "react-router-dom";

// Firebase
import {
  db,
  firebaseDoc,
  collection,
  serverTimestamp,
  runTransaction,
  increment,
  query,
  where,
  getDocs,
} from "./firebase";

const ITEM_DEFAULT_DURATION_MS = 5 * 60 * 1000;

const formatTimeLeft = (usedTimestamp, durationMs = ITEM_DEFAULT_DURATION_MS) => {
  const now = Date.now();
  const timeElapsed = now - usedTimestamp;
  const timeLeft = durationMs - timeElapsed;
  if (timeLeft <= 0) return "만료됨";
  const hours = Math.floor(timeLeft / (60 * 60 * 1000));
  const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);
  let formatted = "";
  if (hours > 0) formatted += `${hours}시간 `;
  if (minutes > 0 || hours > 0) formatted += `${minutes}분 `;
  formatted += `${seconds}초 남음`;
  return formatted.trim();
};

const QuantityBadge = ({ quantity }) => {
  let badgeClass = "";
  if (quantity > 10) badgeClass = "quantity-high";
  else if (quantity > 5) badgeClass = "quantity-medium";
  else badgeClass = "quantity-low";
  return <span className={`quantity-badge ${badgeClass}`}>×{quantity}</span>;
};

const MyItems = () => {
  const { user, userDoc, users, classmates } = useAuth() || {};
  const {
    userItems,
    useItem,
    listItemForSale,
    refreshData,
    updateLocalUserItems,
  } = useItems() || {
    userItems: [],
    useItem: null,
    listItemForSale: null,
    refreshData: null,
    updateLocalUserItems: null,
  };

  const navigate = useNavigate();

  // 디버깅: classmates 데이터 확인
  useEffect(() => {
    console.log('[MyItems] 컴포넌트 렌더링됨 - classmates 상태:', {
      user: !!user,
      userDoc: !!userDoc,
      classmates: classmates,
      classmatesCount: classmates?.length,
      users: users?.length
    });
  }, [user, userDoc, classmates, users]);

  const [notification, setNotification] = useState(null);
  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const groupedUserItems = useMemo(() => {
    console.log('[MyItems] groupedUserItems 계산 시작, userItems:', userItems?.length, userItems);
    if (!userItems || userItems.length === 0) {
      console.log('[MyItems] userItems 비어있음');
      return [];
    }

    const itemsMap = new Map();

    userItems.forEach(item => {
      // Validate item structure
      if (!item || !item.itemId || typeof item.quantity !== 'number' || item.quantity <= 0) {
        console.warn('[MyItems] 잘못된 아이템 데이터 무시:', item);
        return;
      }
      console.log('[MyItems] 유효한 아이템:', item.itemId, item.name, item.quantity);

      const key = item.itemId;

      if (itemsMap.has(key)) {
        const existingGroup = itemsMap.get(key);
        existingGroup.totalQuantity += item.quantity;
        existingGroup.sourceDocs.push(item);
        // Update display info with more complete data if available
        if (item.name && !existingGroup.displayInfo.name) {
          existingGroup.displayInfo.name = item.name;
        }
        if (item.icon && !existingGroup.displayInfo.icon) {
          existingGroup.displayInfo.icon = item.icon;
        }
        if (item.description && !existingGroup.displayInfo.description) {
          existingGroup.displayInfo.description = item.description;
        }
      } else {
        itemsMap.set(key, {
          displayInfo: {
            itemId: item.itemId,
            name: item.name || '알 수 없는 아이템',
            icon: item.icon || '🔮',
            description: item.description || '',
            type: item.type || 'general',
            price: item.price || 0,
            durationMs: item.durationMs || ITEM_DEFAULT_DURATION_MS
          },
          totalQuantity: item.quantity,
          sourceDocs: [item],
        });
      }
    });

    // Sort by item name for consistent display
    return Array.from(itemsMap.values()).sort((a, b) =>
      a.displayInfo.name.localeCompare(b.displayInfo.name)
    );
  }, [userItems]);

  const [recentlyUsedItems, setRecentlyUsedItems] = useState(() => {
    try {
      const saved = localStorage.getItem(
        `recentlyUsedItems_${user?.uid || "guest"}`
      );
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    if (user?.uid) {
      localStorage.setItem(
        `recentlyUsedItems_${user.uid}`,
        JSON.stringify(recentlyUsedItems)
      );
    }
  }, [recentlyUsedItems, user?.uid]);

  useEffect(() => {
    const timer = setInterval(() => {
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
    return () => clearInterval(timer);
  }, []);

  const [useItemModal, setUseItemModal] = useState({
    isOpen: false,
    item: null,
    quantity: 1,
  });
  const [giftModal, setGiftModal] = useState({
    isOpen: false,
    item: null,
  });
  const [giftRecipientUid, setGiftRecipientUid] = useState("");
  const [giftQuantity, setGiftQuantity] = useState(1);
  const [sellToMarketModal, setSellToMarketModal] = useState({
    isOpen: false,
    item: null,
    quantity: 1,
    price: 0,
  });

  const handleOpenUseItemModal = (group) => {
    if (!user) {
      showNotification("error", "로그인이 필요합니다.");
      return;
    }
    if (!group || group.totalQuantity <= 0) {
      showNotification("error", "사용할 수 있는 아이템이 아닙니다.");
      return;
    }
    setUseItemModal({ isOpen: true, item: group, quantity: 1 });
  };

  const handleCloseUseItemModal = () => {
    setUseItemModal({ isOpen: false, item: null, quantity: 1 });
  };

  const handleOpenGiftModal = (group) => {
    console.log('[MyItems] handleOpenGiftModal 호출됨', {
      user: !!user,
      classmates: classmates?.length,
      group: group?.displayInfo?.name,
      totalQuantity: group?.totalQuantity
    });

    if (!user) {
      console.error('[MyItems] 사용자가 로그인하지 않음');
      showNotification("error", "로그인이 필요합니다.");
      return;
    }
    if (!classmates || classmates.length === 0) {
      console.error('[MyItems] 친구 목록이 비어있음:', classmates);
      showNotification("error", "선물할 친구 목록을 불러올 수 없습니다.");
      return;
    }
    if (!group || group.totalQuantity <= 0) {
      console.error('[MyItems] 아이템 그룹이 없거나 수량이 0:', group);
      showNotification("error", "선물할 아이템이 없습니다.");
      return;
    }

    console.log('[MyItems] 선물 모달 열기 성공');
    setGiftRecipientUid("");
    setGiftQuantity(1);
    setGiftModal({ isOpen: true, item: group });
  };

  const handleCloseGiftModal = () => {
    setGiftModal({ isOpen: false, item: null });
  };

  const handleOpenSellToMarketModal = (group) => {
    if (!user) {
      showNotification("error", "로그인이 필요합니다.");
      return;
    }
    if (!group || group.totalQuantity <= 0) {
      showNotification("error", "판매할 아이템이 없습니다.");
      return;
    }
    if (!listItemForSale) {
      showNotification("error", "판매 기능을 사용할 수 없습니다.");
      return;
    }
    const defaultPrice = group.displayInfo.price
      ? Math.max(1, Math.round(group.displayInfo.price * 0.8))
      : 100;
    setSellToMarketModal({
      isOpen: true,
      item: group,
      quantity: 1,
      price: defaultPrice,
    });
  };

  const handleCloseSellToMarketModal = () => {
    setSellToMarketModal({
      isOpen: false,
      item: null,
      quantity: 1,
      price: 0,
    });
  };

  const handleSellToMarketQuantityChange = (value) => {
    const maxQty = sellToMarketModal.item?.totalQuantity || 1;
    const newQty = Math.max(1, Math.min(maxQty, parseInt(value) || 1));
    setSellToMarketModal((prev) => ({
      ...prev,
      quantity: newQty,
    }));
  };

  const handleSellToMarketPriceChange = (value) => {
    const newPrice = Math.max(1, parseInt(value) || 1);
    setSellToMarketModal((prev) => ({
      ...prev,
      price: newPrice,
    }));
  };

  const handleConfirmUseItem = async () => {
    const { item: group, quantity: quantityToUse } = useItemModal;
    if (!group || !quantityToUse || quantityToUse <= 0) {
      showNotification("error", "사용할 아이템 정보가 올바르지 않습니다.");
      return;
    }

    // Check if we have enough items to use
    if (group.totalQuantity < quantityToUse) {
      showNotification("error", "보유 수량이 부족합니다.");
      return;
    }

    try {
      let remainingToUse = quantityToUse;
      const results = [];

      // Sort sourceDocs by quantity (use from smallest quantities first to consolidate)
      const sortedDocs = [...group.sourceDocs].sort((a, b) => a.quantity - b.quantity);

      for (const doc of sortedDocs) {
        if (remainingToUse <= 0) break;

        const amountToUse = Math.min(doc.quantity, remainingToUse);
        console.log(`[MyItems] 아이템 사용 시도:`, {
          docId: doc.id,
          itemName: doc.name || group.displayInfo.name,
          amountToUse,
          docQuantity: doc.quantity,
          remainingToUse
        });

        const result = await useItem(doc.id, amountToUse);
        results.push(result);

        if (!result.success) {
          throw new Error(result.message || `아이템 사용에 실패했습니다 (${doc.id})`);
        }

        remainingToUse -= amountToUse;
      }

      if (remainingToUse > 0) {
        throw new Error(`요청한 수량을 모두 사용할 수 없습니다. (부족한 수량: ${remainingToUse})`);
      }

      showNotification("success", `${group.displayInfo.name} ${quantityToUse}개를 사용했습니다.`);
      handleCloseUseItemModal();

      // Track recently used items
      setRecentlyUsedItems(prev => ({
        ...prev,
        [group.displayInfo.itemId]: {
          usedTimestamp: Date.now(),
          itemDetails: {
            name: group.displayInfo.name,
            icon: group.displayInfo.icon,
            durationMs: group.displayInfo.durationMs || ITEM_DEFAULT_DURATION_MS
          }
        }
      }));

    } catch (error) {
      console.error("아이템 사용 중 예외 발생:", error);
      showNotification("error", `아이템 사용 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  const handleRemoveUsedItem = (itemId) => {
    setRecentlyUsedItems(prevItems => {
      const updatedItems = { ...prevItems };
      delete updatedItems[itemId];
      return updatedItems;
    });
    showNotification("info", "아이템 사용을 중지했습니다.");
  };

  const handleSendGift = async () => {
    const { item: group } = giftModal;
    if (!user || !giftRecipientUid || !group) {
      showNotification("error", "선물 정보가 올바르지 않습니다.");
      return;
    }
    const quantity = Number(giftQuantity) || 1;
    if (quantity <= 0 || quantity > group.totalQuantity) {
      showNotification("error", "선물 수량이 올바르지 않습니다.");
      return;
    }

    try {
      const recipientInventoryRef = collection(db, "users", giftRecipientUid, "inventory");
      const q = query(recipientInventoryRef, where("itemId", "==", group.displayInfo.itemId));
      const recipientQuerySnapshot = await getDocs(q);
      const recipientItemDocRef = recipientQuerySnapshot.empty ? null : recipientQuerySnapshot.docs[0].ref;

      // 🔥 트랜잭션 전 현재 상태 저장 (롤백용)
      const originalUserItems = [...userItems];

      // 🔥 즉시 로컬 상태 업데이트 (Firestore 읽기 없이)
      const updatedUserItems = [];
      let remainingToDeduct = quantity;

      for (const item of userItems) {
        if (item.itemId === group.displayInfo.itemId && remainingToDeduct > 0) {
          const deductAmount = Math.min(item.quantity, remainingToDeduct);
          const newQuantity = item.quantity - deductAmount;

          if (newQuantity > 0) {
            updatedUserItems.push({ ...item, quantity: newQuantity });
          }
          // quantity가 0이면 아이템을 목록에서 제거 (push 안함)

          remainingToDeduct -= deductAmount;
        } else {
          updatedUserItems.push(item);
        }
      }

      // 즉시 UI 업데이트 (ItemContext의 상태를 직접 업데이트)
      if (updateLocalUserItems) {
        updateLocalUserItems(updatedUserItems);
      }

      await runTransaction(db, async (transaction) => {
        let remainingToSend = quantity;
        for (const senderDoc of group.sourceDocs) {
          if (remainingToSend <= 0) break;

          const senderItemRef = firebaseDoc(db, "users", user.uid, "inventory", senderDoc.id);
          const senderItemSnap = await transaction.get(senderItemRef);
          if (!senderItemSnap.exists()) continue;

          const amountFromThisDoc = Math.min(senderItemSnap.data().quantity, remainingToSend);
          const newSenderQty = senderItemSnap.data().quantity - amountFromThisDoc;

          if (newSenderQty <= 0) {
            transaction.delete(senderItemRef);
          } else {
            transaction.update(senderItemRef, { quantity: newSenderQty });
          }
          remainingToSend -= amountFromThisDoc;
        }

        if (recipientItemDocRef) {
          transaction.update(recipientItemDocRef, { quantity: increment(quantity) });
        } else {
          const newRecipientItemRef = firebaseDoc(recipientInventoryRef);
          transaction.set(newRecipientItemRef, {
            itemId: group.displayInfo.itemId,
            name: group.displayInfo.name,
            icon: group.displayInfo.icon,
            description: group.displayInfo.description,
            type: group.displayInfo.type,
            quantity,
            receivedAt: serverTimestamp(),
          });
        }
      });

      console.log('[MyItems] ✅ 선물 트랜잭션 성공 - Firestore 동기화 완료');
      showNotification("success", `선물하기가 완료되었습니다.`);
      handleCloseGiftModal();

      // 백그라운드에서 실제 데이터 동기화 (선택적)
      setTimeout(() => {
        if (refreshData) refreshData();
      }, 2000);

    } catch (error) {
      console.error('[MyItems] ❌ 선물 트랜잭션 실패:', error);
      showNotification("error", `선물하기 오류: ${error.message}`);

      // 트랜잭션 실패 시 실제 데이터로 복구
      if (refreshData) await refreshData();
    }
  };

  const handleConfirmSellToMarket = async () => {
    const { item: group, quantity, price } = sellToMarketModal;
    if (!group || !quantity || !price) {
      showNotification("error", "판매 정보가 올바르지 않습니다.");
      return;
    }

    let remainingToSell = quantity;
    const itemsToProcess = [...group.sourceDocs].sort((a,b) => a.quantity - b.quantity);

    try {
      for(const doc of itemsToProcess) {
        if(remainingToSell <= 0) break;
        const amountToSell = Math.min(doc.quantity, remainingToSell);

        console.log(`[MyItems] 아이템 판매 시도:`, {
          docId: doc.id,
          itemName: doc.name || group.displayInfo.name,
          amountToSell,
          price,
          sourceCollection: doc.source || 'inventory'
        });

        const result = await listItemForSale({
          itemId: doc.id,  // Changed from inventoryItemId to itemId
          quantity: amountToSell,
          price,
        });

        if (!result.success) {
          throw new Error(result.message || "일부 아이템 판매 등록에 실패했습니다.");
        }
        remainingToSell -= amountToSell;
      }

      showNotification("success", `${group.displayInfo.name} ${quantity}개를 시장에 판매 등록했습니다.`);
      handleCloseSellToMarketModal();

      setTimeout(() => {
        if (window.confirm("아이템 시장으로 이동하시겠습니까?")) {
          navigate("/item-market");
        }
      }, 500);

    } catch(error) {
      console.error('[MyItems] 판매 등록 오류:', error);
      showNotification("error", `시장 판매 등록 중 오류: ${error.message}`);
    }
  };

  const itemToGift = giftModal.isOpen ? giftModal.item : null;

  return (
    <>
      <div className="page-container relative">
        <h2 className="page-title">내 아이템 관리</h2>
        {!user && <LoginWarning />}
        {notification && (<div className={`notification bg-${notification.type}-100`}>{notification.message}</div>)}

        {user && (
          <>
            {Object.keys(recentlyUsedItems).length > 0 && (
              <div className="content-card-section">
                <h3 className="section-title">사용 중인 아이템</h3>
                <div className="items-grid">
                  {Object.entries(recentlyUsedItems).map(([itemId, itemData]) => (
                    <div key={itemId} className="store-item-card active-item-card">
                       <div className="item-content">
                         <div className="my-item-header">
                           <div className="item-icon-group"><div className="item-icon">{itemData.itemDetails.icon || '✨'}</div></div>
                           <div className="item-info">
                             <h3 className="item-name">{itemData.itemDetails.name}</h3>
                             <p className="timer-text">{formatTimeLeft(itemData.usedTimestamp, itemData.itemDetails.durationMs)}</p>
                           </div>
                         </div>
                         <div className="my-item-actions"><button className="stop-using-button" onClick={() => handleRemoveUsedItem(itemId)}>사용 중지</button></div>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="content-card-section">
              <h3 className="section-title">보유 아이템</h3>
              {groupedUserItems.length > 0 ? (
                <div className="items-grid">
                  {groupedUserItems.map((group) => (
                    <div key={group.displayInfo.itemId} className="store-item-card">
                      <div className="item-content">
                        <div className="my-item-header">
                          <div className="item-icon-group">
                            <div className="item-icon">{group.displayInfo.icon || "🆕"}</div>
                            <QuantityBadge quantity={group.totalQuantity} />
                          </div>
                          <div className="item-info">
                            <h3 className="item-name">{group.displayInfo.name}</h3>
                            <p className="item-description">{group.displayInfo.description}</p>
                          </div>
                        </div>
                        <div className="my-item-actions">
                          <button className="use-item-button" onClick={() => {
                            console.log('[MyItems] 사용하기 버튼 클릭됨');
                            handleOpenUseItemModal(group);
                          }}>사용하기</button>
                          <button
                            className="gift-item-button"
                            onClick={() => {
                              console.log('[MyItems] 선물하기 버튼 클릭됨', {
                                disabled: !classmates || classmates.length === 0,
                                classmatesCount: classmates?.length
                              });
                              handleOpenGiftModal(group);
                            }}
                            disabled={!classmates || classmates.length === 0}
                          >
                            선물하기
                          </button>
                          <button className="sell-to-market-button" onClick={() => {
                            console.log('[MyItems] 시장에 팔기 버튼 클릭됨');
                            handleOpenSellToMarketModal(group);
                          }}>시장에 팔기</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-message"><p>보유 중인 아이템이 없습니다.</p></div>
              )}
            </div>
          </>
        )}
      </div>

      {useItemModal.isOpen && useItemModal.item && (
        <div className="myitems-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleCloseUseItemModal(); }}>
          <div className="myitems-modal-container">
            <div className="myitems-modal-header">
              <h3>{useItemModal.item.displayInfo.name} 사용하기</h3>
              <button onClick={handleCloseUseItemModal} className="myitems-close-button">✕</button>
            </div>
            <div className="myitems-modal-body">
              <div className="form-group">
                <label htmlFor="useQuantity">사용할 수량: (최대 {useItemModal.item.totalQuantity}개)</label>
                <div className="quantity-controls">
                  <button onClick={() => setUseItemModal(prev => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))} disabled={useItemModal.quantity <= 1}>-</button>
                  <input id="useQuantity" type="number" min="1" max={useItemModal.item.totalQuantity} value={useItemModal.quantity}
                    onChange={(e) => setUseItemModal(prev => ({ ...prev, quantity: Math.max(1, Math.min(prev.item.totalQuantity, parseInt(e.target.value) || 1)) }))}
                  />
                  <button onClick={() => setUseItemModal(prev => ({ ...prev, quantity: Math.min(prev.item.totalQuantity, prev.quantity + 1) }))} disabled={useItemModal.quantity >= useItemModal.item.totalQuantity}>+</button>
                </div>
              </div>
            </div>
            <div className="myitems-modal-footer">
              <button onClick={handleCloseUseItemModal} className="button-secondary">취소</button>
              <button onClick={handleConfirmUseItem} className="button-primary">사용하기</button>
            </div>
          </div>
        </div>
      )}

      {giftModal.isOpen && itemToGift && (
        <div className="myitems-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleCloseGiftModal(); }}>
          <div className="myitems-modal-container">
            <div className="myitems-modal-header">
              <h3>{itemToGift.displayInfo.name || "아이템"} 선물하기</h3>
              <button onClick={handleCloseGiftModal} className="myitems-close-button">✕</button>
            </div>
            <div className="myitems-modal-body">
              <div className="form-group">
                <label htmlFor="giftRecipient">선물 받을 친구:</label>
                <select id="giftRecipient" value={giftRecipientUid} onChange={(e) => setGiftRecipientUid(e.target.value)} className="form-select">
                  <option value="" disabled>-- 친구를 선택하세요 --</option>
                  {classmates.map((classmate) => (
                    <option key={classmate.uid || classmate.id} value={classmate.uid || classmate.id}>{classmate.name} ({classmate.nickname})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="giftQuantity">선물할 수량: (최대 {itemToGift.totalQuantity}개)</label>
                <div className="quantity-controls">
                  <button onClick={() => setGiftQuantity((prev) => Math.max(1, prev - 1))} disabled={giftQuantity <= 1}>-</button>
                  <input id="giftQuantity" type="number" min="1" max={itemToGift.totalQuantity} value={giftQuantity}
                    onChange={(e) => setGiftQuantity(Math.max(1, Math.min(itemToGift.totalQuantity, parseInt(e.target.value) || 1)))}
                  />
                  <button onClick={() => setGiftQuantity((prev) => Math.min(itemToGift.totalQuantity, prev + 1))} disabled={giftQuantity >= itemToGift.totalQuantity}>+</button>
                </div>
              </div>
            </div>
            <div className="myitems-modal-footer">
              <button onClick={handleCloseGiftModal} className="button-secondary">취소</button>
              <button onClick={handleSendGift} className="button-primary">선물하기</button>
            </div>
          </div>
        </div>
      )}

      {sellToMarketModal.isOpen && sellToMarketModal.item && (
        <div className="myitems-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleCloseSellToMarketModal(); }}>
          <div className="myitems-modal-container">
            <div className="myitems-modal-header">
              <h3>'{sellToMarketModal.item.displayInfo.name}' 시장에 판매하기</h3>
              <button onClick={handleCloseSellToMarketModal} className="myitems-close-button">✕</button>
            </div>
            <div className="myitems-modal-body">
              <div className="item-preview-simple">
                <span className="item-icon-small">{sellToMarketModal.item.displayInfo.icon}</span>
                <span>{sellToMarketModal.item.displayInfo.name} (보유: {sellToMarketModal.item.totalQuantity}개)</span>
              </div>
              <div className="form-group">
                <label htmlFor="sellToMarketQuantity">판매 수량 (최대: {sellToMarketModal.item.totalQuantity}개):</label>
                <input type="number" id="sellToMarketQuantity" value={sellToMarketModal.quantity} onChange={(e) => handleSellToMarketQuantityChange(e.target.value)} min="1" max={sellToMarketModal.item.totalQuantity} />
              </div>
              <div className="form-group">
                <label htmlFor="sellToMarketPrice">개당 판매 가격 (원):</label>
                <input type="number" id="sellToMarketPrice" value={sellToMarketModal.price} onChange={(e) => handleSellToMarketPriceChange(e.target.value)} min="1" />
              </div>
              <div className="total-price-preview">
                예상 판매 총액: <strong>{(sellToMarketModal.price * sellToMarketModal.quantity).toLocaleString()}원</strong>
              </div>
            </div>
            <div className="myitems-modal-footer">
              <button onClick={handleCloseSellToMarketModal} className="button-secondary">취소</button>
              <button onClick={handleConfirmSellToMarket} className="button-primary sell-button">판매 등록</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MyItems;