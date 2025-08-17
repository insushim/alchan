// src/ItemContext.js
import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
} from "react";
import { useAuth } from "./AuthContext";

import {
  collection,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

import {
  db,
  addStoreItem,
  updateStoreItem,
  deleteStoreItem,
  purchaseItemTransaction,
  firebaseDoc,
  firebaseGetSingleDoc as fbGetDoc,
  firebaseUpdateDoc,
  firebaseDeleteDoc,
  firebaseAddDoc,
  increment,
  runTransaction,
  addMarketListing as fbAddMarketListing,
} from "./firebase";

export const ItemContext = createContext(null);

export const useItems = () => {
  const context = useContext(ItemContext);
  if (!context) {
    console.warn("useItems Hook: ItemContext 사용 범위 초과 - 기본값 반환");
    return {
      items: [],
      userItems: [],
      loading: true,
      adminPriceIncreasePercentage: 10,
      addItem: async () => {
        console.warn("addItem not ready");
        return false;
      },
      purchaseItem: async () => {
        console.warn("purchaseItem not ready");
        return { success: false, message: "Not ready" };
      },
      updateItem: async () => {
        console.warn("updateItem not ready");
        return false;
      },
      deleteItem: async () => {
        console.warn("deleteItem not ready");
        return false;
      },
      setAdminPriceIncrease: () => {
        console.warn("setAdminPriceIncrease not ready");
      },
      marketListings: [],
      fetchMarketListings: () => {
        console.warn("fetchMarketListings not ready");
      },
      marketOffers: [],
      userProperties: [],
      usageHistory: [],
      updateUserItemQuantity: async () => {
        console.warn("updateUserItemQuantity not ready");
        return { success: false, error: "Not ready" };
      },
      useItem: async () => {
        console.warn("useItem: Not ready");
        return false;
      },
      listItemForSale: async () => ({ success: false, message: "Not ready" }),
      buyMarketItem: async () => ({ success: false, message: "Not ready" }),
      cancelSale: async () => ({ success: false, message: "Not ready" }),
      makeOffer: async () => ({ success: false, message: "Not ready" }),
      respondToOffer: async () => ({ success: false, message: "Not ready" }),
    };
  }
  return context;
};

export const ItemProvider = ({ children }) => {
  const {
    user,
    userDoc,
    isAdmin: isAuthAdmin,
    loading: authLoading,
  } = useAuth() || {
    user: null,
    userDoc: null,
    isAdmin: () => false,
    loading: true,
  };
  const userId = user?.uid;
  const currentUserClassCode = userDoc?.classCode;

  const [items, setItems] = useState([]);
  const [userItems, setUserItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingUserItems, setLoadingUserItems] = useState(true);
  const [loadingMarketListings, setLoadingMarketListings] = useState(true);
  const [adminPriceIncreasePercentage, setAdminPriceIncreasePercentage] =
    useState(10);
  const [marketListings, setMarketListings] = useState([]);
  const [marketOffers, setMarketOffers] = useState([]);

  // 1. 상점 아이템 실시간 로드
  useEffect(() => {
    if (authLoading) {
      setLoadingItems(true);
      console.log(
        "[ItemContext] 'storeItems' 로드 대기: AuthContext 로딩 중..."
      );
      return;
    }
    if (!currentUserClassCode) {
      console.log(
        "[ItemContext] 'storeItems' 로드 중단: 학급 코드가 없습니다."
      );
      setItems([]);
      setLoadingItems(false);
      return;
    }

    setLoadingItems(true);
    console.log(
      `[ItemContext] Firestore 'storeItems' 컬렉션 리스너 설정 시도 (학급: ${currentUserClassCode})`
    );
    const itemsCollectionRef = collection(db, "storeItems");
    let q;
    if (isAuthAdmin()) {
      q = query(
        itemsCollectionRef,
        where("classCode", "==", currentUserClassCode)
      );
    } else {
      q = query(
        itemsCollectionRef,
        where("classCode", "==", currentUserClassCode),
        where("available", "==", true)
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const fetchedItems = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setItems(fetchedItems);
        setLoadingItems(false);
        console.log(
          `[ItemContext] 'storeItems' (학급: ${currentUserClassCode}) 업데이트: ${fetchedItems.length}개`
        );
      },
      (error) => {
        console.error(
          `[ItemContext] 'storeItems' (학급: ${currentUserClassCode}) 리스닝 오류:`,
          error
        );
        setItems([]);
        setLoadingItems(false);
      }
    );
    return () => {
      console.log(
        `[ItemContext] 'storeItems' (학급: ${currentUserClassCode}) 리스너 해제.`
      );
      unsubscribe();
    };
  }, [currentUserClassCode, isAuthAdmin, authLoading]);

  // 2. 사용자 인벤토리 실시간 로드
  useEffect(() => {
    if (authLoading) {
      setLoadingUserItems(true);
      console.log(
        "[ItemContext] 'inventory' 로드 대기: AuthContext 로딩 중..."
      );
      return;
    }
    if (userId) {
      setLoadingUserItems(true);
      const userInventoryCollectionRef = collection(
        db,
        "users",
        userId,
        "inventory"
      );
      const unsubscribe = onSnapshot(
        userInventoryCollectionRef,
        (querySnapshot) => {
          const fetchedUserItems = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setUserItems(fetchedUserItems);
          setLoadingUserItems(false);
          console.log(
            `[ItemContext] 사용자 (${userId}) 'inventory' 업데이트: ${fetchedUserItems.length}개`
          );
        },
        (error) => {
          console.error(
            `[ItemContext] 사용자 (${userId}) 'inventory' 리스닝 오류:`,
            error
          );
          setUserItems([]);
          setLoadingUserItems(false);
        }
      );
      return () => unsubscribe();
    } else {
      setUserItems([]);
      setLoadingUserItems(false);
    }
  }, [userId, authLoading]);

  // 3. 마켓 리스팅 실시간 로드
  const fetchMarketListings = useCallback(() => {
    console.log(
      `[ItemContext] fetchMarketListings 호출됨 (학급: ${currentUserClassCode})`
    );
    const marketItemsCollectionRef = collection(db, "marketItems");
    const q = query(
      marketItemsCollectionRef,
      where("classCode", "==", currentUserClassCode),
      where("status", "==", "active")
    );
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const fetchedListings = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMarketListings(fetchedListings);
        setLoadingMarketListings(false);
        console.log(
          `[ItemContext] 'marketItems' (학급: ${currentUserClassCode}) 업데이트: ${fetchedListings.length}개`
        );
      },
      (error) => {
        console.error(
          `[ItemContext] 'marketItems' (학급: ${currentUserClassCode}) 리스닝 오류:`,
          error
        );
        setMarketListings([]);
        setLoadingMarketListings(false);
      }
    );
    return unsubscribe;
  }, [currentUserClassCode]);

  useEffect(() => {
    if (authLoading) {
      setLoadingMarketListings(true);
      console.log(
        "[ItemContext] 'marketItems' 로드 대기: AuthContext 로딩 중..."
      );
      return;
    }
    if (!currentUserClassCode) {
      console.log(
        "[ItemContext] 'marketItems' 로드 중단: 학급 코드가 없습니다."
      );
      setMarketListings([]);
      setLoadingMarketListings(false);
      return;
    }
    setLoadingMarketListings(true);
    const unsubscribe = fetchMarketListings();
    return () => {
      if (unsubscribe && typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [fetchMarketListings, currentUserClassCode, authLoading]);

  // 4. 오퍼 로드
  useEffect(() => {
    if (authLoading) {
      setLoadingMarketListings(true);
      console.log(
        "[ItemContext] 'marketOffers' 로드 대기: AuthContext 로딩 중..."
      );
      return;
    }
    if (!currentUserClassCode) {
      console.log(
        "[ItemContext] 'marketOffers' 로드 중단: 학급 코드가 없습니다."
      );
      setMarketOffers([]);
      return;
    }
    console.log(
      `[ItemContext] 'marketOffers' 컬렉션 리스너 설정 시도 (학급: ${currentUserClassCode})`
    );
    const offersQuery = query(
      collection(db, "marketOffers"),
      where("classCode", "==", currentUserClassCode)
    );
    const unsubscribe = onSnapshot(
      offersQuery,
      (snapshot) => {
        const offers = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMarketOffers(offers);
        console.log(
          `[ItemContext] 'marketOffers' (학급: ${currentUserClassCode}) 업데이트: ${offers.length}`
        );
      },
      (error) => {
        console.error(
          `[ItemContext] 'marketOffers' (학급: ${currentUserClassCode}) 리스닝 오류:`,
          error
        );
        setMarketOffers([]);
      }
    );
    return () => unsubscribe();
  }, [currentUserClassCode, userId, authLoading]);

  // --- CRUD 함수들 ---
  const addItemToStoreContext = useCallback(
    async (newItemData, classCode) => {
      if (!isAuthAdmin()) {
        alert("아이템 추가는 관리자만 가능합니다.");
        return false;
      }
      if (!classCode) {
        alert("아이템을 추가할 학급 코드가 지정되지 않았습니다.");
        return false;
      }
      try {
        const itemToAdd = {
          ...newItemData,
          initialStock: newItemData.initialStock ?? newItemData.stock,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const docRef = await addStoreItem(itemToAdd, classCode);
        return !!(docRef && docRef.id);
      } catch (error) {
        console.error("[ItemContext] Firestore 아이템 추가 오류:", error);
        alert(`아이템 추가 중 오류: ${error.message}`);
        return false;
      }
    },
    [isAuthAdmin]
  );

  const updateStoreItemInContext = useCallback(
    async (itemDataWithId) => {
      if (!isAuthAdmin()) {
        alert("아이템 수정은 관리자만 가능합니다.");
        return false;
      }
      if (!itemDataWithId || !itemDataWithId.id) {
        alert("수정할 아이템의 ID 정보가 없습니다.");
        return false;
      }
      const itemId = itemDataWithId.id;
      const updatesToApply = { ...itemDataWithId };
      delete updatesToApply.id;
      if (Object.keys(updatesToApply).length === 0) {
        alert("수정할 정보가 없습니다.");
        return false;
      }
      try {
        await updateStoreItem(itemId, updatesToApply);
        return true;
      } catch (error) {
        console.error(
          `[ItemContext] 아이템 (ID: ${itemId}) 업데이트 오류:`,
          error
        );
        alert(`아이템 수정 중 오류: ${error.message}`);
        return false;
      }
    },
    [isAuthAdmin]
  );

  const deleteStoreItemFromContext = useCallback(
    async (itemId, itemClassCode) => {
      if (!isAuthAdmin()) {
        alert("아이템 삭제는 관리자만 가능합니다.");
        return false;
      }
      if (!itemId) {
        alert("삭제할 아이템의 ID가 없습니다.");
        return false;
      }
      try {
        await deleteStoreItem(itemId);
        return true;
      } catch (error) {
        console.error(`[ItemContext] 아이템 (ID: ${itemId}) 삭제 오류:`, error);
        alert(`아이템 삭제 중 오류: ${error.message}`);
        return false;
      }
    },
    [isAuthAdmin, currentUserClassCode]
  );

  const purchaseItemFromFirestore = useCallback(
    async (
      itemId,
      quantityToPurchase = 1,
      priceIncreasePercentageFromStore,
      skipCashDeduction = false
    ) => {
      if (!userId || !userDoc || !currentUserClassCode) {
        alert("구매 관련 정보가 부족합니다.");
        return { success: false, message: "Info missing." };
      }
      try {
        const success = await purchaseItemTransaction(
          userId,
          itemId,
          currentUserClassCode,
          quantityToPurchase,
          skipCashDeduction
        );
        return { success };
      } catch (error) {
        console.error(`[ItemContext] 아이템 (ID: ${itemId}) 구매 예외:`, error);
        alert(`구매 오류: ${error.message}`);
        return { success: false, message: error.message };
      }
    },
    [userId, userDoc, currentUserClassCode]
  );

  const setAdminPriceIncrease = useCallback((percentage) => {
    const numPercentage = Number(percentage);
    if (isNaN(numPercentage) || numPercentage < 0) {
      alert("가격 인상률은 0 이상이어야 합니다.");
      return;
    }
    setAdminPriceIncreasePercentage(numPercentage);
  }, []);

  // ✅ 완전히 수정된 updateUserItemQuantity 함수
  const updateUserItemQuantity = useCallback(
    async (inventoryItemId, quantityChange) => {
      if (!userId) {
        console.warn(
          "[ItemContext] updateUserItemQuantity: 사용자 ID가 없습니다."
        );
        return { success: false, error: "사용자 정보가 없습니다." };
      }

      if (!inventoryItemId || typeof quantityChange !== "number") {
        console.warn(
          "[ItemContext] updateUserItemQuantity: 유효하지 않은 매개변수",
          { inventoryItemId, quantityChange }
        );
        return { success: false, error: "유효하지 않은 매개변수입니다." };
      }

      try {
        console.log(
          `[ItemContext] updateUserItemQuantity 시작: 인벤토리 ID ${inventoryItemId}, 변경량 ${quantityChange}`
        );
        console.log(
          `[ItemContext] 현재 userItems:`,
          userItems.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
          }))
        );

        // 현재 사용자의 아이템 인벤토리에서 해당 아이템 찾기 (인벤토리 문서 ID로 찾기)
        const currentItem = userItems.find(
          (item) => item.id === inventoryItemId
        );

        if (!currentItem) {
          console.warn(
            `[ItemContext] updateUserItemQuantity: 인벤토리 아이템 ID ${inventoryItemId}를 사용자 인벤토리에서 찾을 수 없음`
          );
          return { success: false, error: "아이템을 찾을 수 없습니다." };
        }

        const newQuantity = currentItem.quantity + quantityChange;

        // 수량이 0보다 작아지는 것을 방지
        if (newQuantity < 0) {
          console.warn(
            `[ItemContext] updateUserItemQuantity: 수량이 부족합니다. 현재: ${currentItem.quantity}, 변경량: ${quantityChange}`
          );
          return {
            success: false,
            error: `아이템 수량이 부족합니다. (현재: ${currentItem.quantity})`,
          };
        }

        const userInventoryItemRef = firebaseDoc(
          db,
          "users",
          userId,
          "inventory",
          currentItem.id
        );

        // Firestore 트랜잭션으로 안전하게 수량 변경
        await runTransaction(db, async (transaction) => {
          const itemDoc = await transaction.get(userInventoryItemRef);

          if (!itemDoc.exists()) {
            throw new Error("인벤토리 아이템이 존재하지 않습니다.");
          }

          const currentItemData = itemDoc.data();
          const currentQuantityInFirestore = currentItemData.quantity || 0;

          // 최종 수량 다시 계산 (Firestore 데이터 기준)
          const finalQuantity = currentQuantityInFirestore + quantityChange;

          if (finalQuantity < 0) {
            throw new Error(
              `아이템 수량이 부족합니다. (현재: ${currentQuantityInFirestore})`
            );
          }

          if (finalQuantity === 0) {
            // 수량이 0이 되면 아이템 삭제
            transaction.delete(userInventoryItemRef);
            console.log(
              `[ItemContext] updateUserItemQuantity: 아이템 ${inventoryItemId} 삭제됨 (수량 0)`
            );
          } else {
            // 수량 업데이트
            transaction.update(userInventoryItemRef, {
              quantity: finalQuantity,
              updatedAt: serverTimestamp(),
            });
            console.log(
              `[ItemContext] updateUserItemQuantity: 아이템 ${inventoryItemId} 수량 업데이트 (${currentQuantityInFirestore} → ${finalQuantity})`
            );
          }
        });

        console.log(
          `[ItemContext] updateUserItemQuantity 성공: 아이템 ${inventoryItemId}, 변경량 ${quantityChange}`
        );
        return { success: true };
      } catch (error) {
        console.error(
          `[ItemContext] updateUserItemQuantity 오류 (아이템 ID: ${inventoryItemId}):`,
          error
        );
        return {
          success: false,
          error: error.message || "아이템 수량 변경에 실패했습니다.",
        };
      }
    },
    [userId, userItems]
  );

  const useItem = useCallback(
    async (inventoryItemId) => {
      if (!userId) {
        alert("로그인이 필요합니다.");
        return false;
      }
      const itemRef = firebaseDoc(
        db,
        "users",
        userId,
        "inventory",
        inventoryItemId
      );
      try {
        await runTransaction(db, async (transaction) => {
          const itemSnap = await transaction.get(itemRef);
          if (!itemSnap.exists())
            throw new Error("인벤토리에 없는 아이템입니다.");
          const currentData = itemSnap.data();
          if (currentData.quantity <= 0)
            throw new Error("아이템 수량이 부족합니다.");
          transaction.update(itemRef, {
            quantity: increment(-1),
            updatedAt: serverTimestamp(),
          });
        });
        return true;
      } catch (error) {
        console.error(
          `[useItem] 트랜잭션 오류 (ID: ${inventoryItemId}):`,
          error
        );
        alert(`아이템 사용 실패: ${error.message}`);
        return false;
      }
    },
    [userId]
  );

  const listItemForSale = useCallback(
    async ({ itemId: inventoryItemId, quantity, price }) => {
      if (!userId || !userDoc || !currentUserClassCode) {
        return { success: false, message: "정보 부족." };
      }
      if (
        !inventoryItemId ||
        typeof quantity !== "number" ||
        quantity <= 0 ||
        typeof price !== "number" ||
        price <= 0
      ) {
        return { success: false, message: "판매 정보 오류." };
      }
      const userInventoryItemRef = firebaseDoc(
        db,
        "users",
        userId,
        "inventory",
        inventoryItemId
      );
      try {
        const listingId = await runTransaction(db, async (transaction) => {
          const invItemSnap = await transaction.get(userInventoryItemRef);
          if (!invItemSnap.exists())
            throw new Error("인벤토리에 없는 아이템입니다.");
          const invItemData = invItemSnap.data();
          if (invItemData.quantity < quantity)
            throw new Error(`보유 수량(${invItemData.quantity}) 부족.`);

          const newQuantityInInventory = invItemData.quantity - quantity;
          if (newQuantityInInventory > 0) {
            transaction.update(userInventoryItemRef, {
              quantity: newQuantityInInventory,
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.delete(userInventoryItemRef);
          }

          const sellerName =
            userDoc?.displayName ||
            user?.displayName ||
            userDoc?.name ||
            "익명";
          const marketItemData = {
            sellerId: userId,
            sellerUid: userId,
            sellerName,
            inventoryItemId,
            originalStoreItemId: invItemData.itemId,
            itemName: invItemData.name,
            itemIcon: invItemData.icon || "📦",
            itemDescription: invItemData.description || "",
            itemType: invItemData.type || "기타",
            quantity,
            pricePerItem: price,
            totalPrice: price * quantity,
            status: "active",
            classCode: currentUserClassCode,
            listedDate: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          const newMarketItemRef = firebaseDoc(collection(db, "marketItems"));
          transaction.set(newMarketItemRef, marketItemData);
          return newMarketItemRef.id;
        });
        return { success: true, listingId, message: "시장 등록 성공." };
      } catch (error) {
        console.error(`[listItemForSale] 오류:`, error);
        return { success: false, message: error.message || "시장 등록 실패." };
      }
    },
    [userId, userDoc, user, currentUserClassCode]
  );

  const buyMarketItem = useCallback(
    async (listingId) => {
      if (!userId || !userDoc || !currentUserClassCode) {
        return { success: false, message: "정보 부족." };
      }
      if (!listingId) {
        return { success: false, message: "리스팅 ID 없음." };
      }
      const marketItemRef = firebaseDoc(db, "marketItems", listingId);
      try {
        const result = await runTransaction(db, async (transaction) => {
          const marketItemSnap = await transaction.get(marketItemRef);
          if (!marketItemSnap.exists()) throw new Error("판매 아이템 없음.");
          const listingData = marketItemSnap.data();
          if (listingData.classCode !== currentUserClassCode)
            throw new Error("학급 마켓 상품 아님.");
          if (listingData.status !== "active") throw new Error("판매중 아님.");
          if (listingData.sellerId === userId)
            throw new Error("자신의 아이템 구매 불가.");
          const totalPrice =
            listingData.totalPrice ||
            listingData.pricePerItem * listingData.quantity;
          const buyerUserRef = firebaseDoc(db, "users", userId);
          const buyerDocSnap = await transaction.get(buyerUserRef);
          if (!buyerDocSnap.exists()) throw new Error("구매자 정보 없음.");
          if ((buyerDocSnap.data().cash || 0) < totalPrice)
            throw new Error("캐시 부족.");
          transaction.update(buyerUserRef, {
            cash: increment(-totalPrice),
            updatedAt: serverTimestamp(),
          });
          const sellerUserRef = firebaseDoc(db, "users", listingData.sellerId);
          const sellerDocSnap = await transaction.get(sellerUserRef);
          if (!sellerDocSnap.exists()) throw new Error("판매자 정보 없음.");
          transaction.update(sellerUserRef, {
            cash: increment(totalPrice),
            updatedAt: serverTimestamp(),
          });
          const buyerInventoryColRef = collection(
            db,
            "users",
            userId,
            "inventory"
          );
          const qBuyerInv = query(
            buyerInventoryColRef,
            where("itemId", "==", listingData.originalStoreItemId)
          );
          const buyerInvResults = await transaction.get(qBuyerInv);
          if (buyerInvResults.empty) {
            const newInvItemRef = firebaseDoc(buyerInventoryColRef);
            transaction.set(newInvItemRef, {
              itemId: listingData.originalStoreItemId,
              name: listingData.itemName,
              icon: listingData.itemIcon,
              description: listingData.itemDescription || "",
              type: listingData.itemType || "기타",
              quantity: listingData.quantity,
              purchasedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.update(buyerInvResults.docs[0].ref, {
              quantity: increment(listingData.quantity),
              updatedAt: serverTimestamp(),
            });
          }
          transaction.update(marketItemRef, {
            status: "sold",
            soldTo: userId,
            soldAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          return {
            itemName: listingData.itemName,
            quantity: listingData.quantity,
          };
        });
        return {
          success: true,
          message: `${result.itemName} ${result.quantity}개 구매.`,
        };
      } catch (error) {
        console.error(`[buyMarketItem] 오류:`, error);
        return { success: false, message: `구매 오류: ${error.message}` };
      }
    },
    [userId, userDoc, currentUserClassCode]
  );

  const cancelSale = useCallback(
    async (listingId) => {
      if (!userId || !currentUserClassCode) {
        return { success: false, message: "정보 부족." };
      }
      if (!listingId) return { success: false, message: "리스팅 ID 없음." };
      try {
        const marketItemRef = firebaseDoc(db, "marketItems", listingId);
        const marketItemSnap = await fbGetDoc(marketItemRef);
        if (!marketItemSnap.exists()) throw new Error("판매 아이템 없음.");
        const listingData = marketItemSnap.data();
        if (listingData.classCode !== currentUserClassCode)
          throw new Error("학급 마켓 상품 아님.");
        if (
          listingData.sellerId !== userId &&
          !(listingData.sellerUid && listingData.sellerUid === userId)
        )
          throw new Error("본인 판매만 취소 가능.");
        if (listingData.status !== "active") throw new Error("판매중 아님.");
        await runTransaction(db, async (transaction) => {
          const currentMarketItemSnap = await transaction.get(marketItemRef);
          if (
            !currentMarketItemSnap.exists() ||
            currentMarketItemSnap.data().status !== "active"
          )
            throw new Error("상태 변경되어 취소 불가.");
          transaction.update(marketItemRef, {
            status: "cancelled",
            updatedAt: serverTimestamp(),
          });
          const userInventoryColRef = collection(
            db,
            "users",
            userId,
            "inventory"
          );
          const qUserInv = query(
            userInventoryColRef,
            where("itemId", "==", listingData.originalStoreItemId)
          );
          const userInvResults = await transaction.get(qUserInv);
          if (userInvResults.empty) {
            const newInvItemRef = firebaseDoc(userInventoryColRef);
            transaction.set(newInvItemRef, {
              itemId: listingData.originalStoreItemId,
              name: listingData.itemName,
              icon: listingData.itemIcon,
              description: listingData.itemDescription || "",
              type: listingData.itemType || "기타",
              quantity: listingData.quantity,
              addedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.update(userInvResults.docs[0].ref, {
              quantity: increment(listingData.quantity),
              updatedAt: serverTimestamp(),
            });
          }
        });
        return { success: true, message: "판매 취소 및 아이템 반환 완료." };
      } catch (error) {
        console.error(`[cancelSale] 오류:`, error);
        return { success: false, message: `판매 취소 오류: ${error.message}` };
      }
    },
    [userId, currentUserClassCode]
  );

  const makeOffer = useCallback(
    async ({ listingId, offerPrice, quantity = 1 }) => {
      if (!userId || !userDoc || !currentUserClassCode) {
        return { success: false, message: "정보 부족." };
      }
      if (
        !listingId ||
        typeof offerPrice !== "number" ||
        offerPrice <= 0 ||
        typeof quantity !== "number" ||
        quantity <= 0
      ) {
        return { success: false, message: "제안 정보 오류." };
      }
      try {
        const marketItemRef = firebaseDoc(db, "marketItems", listingId);
        const marketItemSnap = await fbGetDoc(marketItemRef);
        if (!marketItemSnap.exists()) throw new Error("제안 대상 아이템 없음.");
        const marketItemData = marketItemSnap.data();
        if (marketItemData.classCode !== currentUserClassCode)
          throw new Error("학급 마켓 상품 아님.");
        if (marketItemData.status !== "active")
          throw new Error("거래 가능 아이템 아님.");
        if (marketItemData.sellerId === userId)
          throw new Error("자신의 아이템에 제안 불가.");
        if (marketItemData.quantity < quantity)
          throw new Error(
            `제안 수량(${quantity})이 판매 수량(${marketItemData.quantity}) 초과.`
          );
        const offerData = {
          listingId,
          offererId: userId,
          offererName:
            userDoc?.displayName ||
            user?.displayName ||
            userDoc?.name ||
            "익명",
          sellerId: marketItemData.sellerId,
          itemName: marketItemData.itemName,
          itemIcon: marketItemData.itemIcon,
          listingQuantity: marketItemData.quantity,
          offerPrice,
          quantityOffered: quantity,
          status: "pending",
          classCode: currentUserClassCode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const offerDocRef = await firebaseAddDoc(
          collection(db, "marketOffers"),
          offerData
        );
        return {
          success: true,
          offerId: offerDocRef.id,
          message: "제안 등록 성공.",
        };
      } catch (error) {
        console.error(`[makeOffer] 오류:`, error);
        return { success: false, message: `제안 등록 오류: ${error.message}` };
      }
    },
    [userId, userDoc, user, currentUserClassCode]
  );

  const respondToOffer = useCallback(
    async (offerId, action) => {
      if (!userId || !userDoc || !currentUserClassCode) {
        return { success: false, message: "정보 부족." };
      }
      if (!offerId || (action !== "accept" && action !== "reject")) {
        return { success: false, message: "잘못된 요청." };
      }
      const offerRef = firebaseDoc(db, "marketOffers", offerId);
      try {
        return await runTransaction(db, async (transaction) => {
          const offerSnap = await transaction.get(offerRef);
          if (!offerSnap.exists()) throw new Error("제안 없음.");
          const offerData = offerSnap.data();
          if (offerData.classCode !== currentUserClassCode)
            throw new Error("학급 제안 아님.");
          if (offerData.sellerId !== userId)
            throw new Error("본인에게 온 제안만 처리 가능.");
          if (offerData.status !== "pending")
            throw new Error(`이미 처리된 제안(상태: ${offerData.status}).`);
          const marketItemRef = firebaseDoc(
            db,
            "marketItems",
            offerData.listingId
          );
          const marketItemSnap = await transaction.get(marketItemRef);
          if (!marketItemSnap.exists())
            throw new Error("원래 판매 아이템 없음.");
          const marketItemData = marketItemSnap.data();
          if (marketItemData.status !== "active")
            throw new Error("원래 판매 아이템 활성 상태 아님.");
          if (marketItemData.quantity < offerData.quantityOffered)
            throw new Error("판매 아이템 수량 < 오퍼 수량.");
          if (action === "reject") {
            transaction.update(offerRef, {
              status: "rejected",
              updatedAt: serverTimestamp(),
            });
            return { success: true, message: "제안 거절." };
          }
          // action === "accept"
          const totalPrice = offerData.offerPrice;
          const sellerRef = firebaseDoc(db, "users", offerData.sellerId);
          transaction.update(sellerRef, {
            cash: increment(totalPrice),
            updatedAt: serverTimestamp(),
          });
          const buyerRef = firebaseDoc(db, "users", offerData.offererId);
          const buyerSnap = await transaction.get(buyerRef);
          if (!buyerSnap.exists()) throw new Error("제안자(구매자) 정보 없음.");
          if ((buyerSnap.data().cash || 0) < totalPrice)
            throw new Error(
              `제안자 캐시 부족 (필요: ${totalPrice}, 보유: ${
                buyerSnap.data().cash || 0
              })`
            );
          transaction.update(buyerRef, {
            cash: increment(-totalPrice),
            updatedAt: serverTimestamp(),
          });
          const buyerInventoryColRef2 = collection(
            db,
            "users",
            offerData.offererId,
            "inventory"
          );
          const qBuyerInv2 = query(
            buyerInventoryColRef2,
            where("itemId", "==", marketItemData.originalStoreItemId)
          );
          const buyerInvResults2 = await transaction.get(qBuyerInv2);
          if (buyerInvResults2.empty) {
            const newInvItemRef = firebaseDoc(buyerInventoryColRef2);
            transaction.set(newInvItemRef, {
              itemId: marketItemData.originalStoreItemId,
              name: marketItemData.itemName,
              icon: marketItemData.itemIcon,
              description: marketItemData.itemDescription || "",
              type: marketItemData.itemType || "기타",
              quantity: offerData.quantityOffered,
              purchasedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.update(buyerInvResults2.docs[0].ref, {
              quantity: increment(offerData.quantityOffered),
              updatedAt: serverTimestamp(),
            });
          }
          const newMarketItemQuantity =
            marketItemData.quantity - offerData.quantityOffered;
          if (newMarketItemQuantity > 0) {
            transaction.update(marketItemRef, {
              quantity: newMarketItemQuantity,
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.update(marketItemRef, {
              status: "sold",
              soldTo: offerData.offererId,
              soldAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          transaction.update(offerRef, {
            status: "accepted",
            updatedAt: serverTimestamp(),
          });
          return {
            success: true,
            message: `제안 수락 및 ${offerData.itemName} ${offerData.quantityOffered}개 판매.`,
          };
        });
      } catch (error) {
        console.error(`[respondToOffer] 오류 (ID: ${offerId}):`, error);
        return { success: false, message: `오퍼 처리 오류: ${error.message}` };
      }
    },
    [userId, userDoc, currentUserClassCode]
  );

  const contextValue = {
    items,
    userItems,
    loading: loadingItems || loadingUserItems || loadingMarketListings,
    addItem: addItemToStoreContext,
    purchaseItem: purchaseItemFromFirestore,
    updateItem: updateStoreItemInContext,
    deleteItem: deleteStoreItemFromContext,
    adminPriceIncreasePercentage,
    setAdminPriceIncrease,
    useItem,
    marketListings,
    fetchMarketListings,
    marketOffers,
    userProperties: [],
    usageHistory: [],
    updateUserItemQuantity,
    listItemForSale,
    buyMarketItem,
    cancelSale,
    makeOffer,
    respondToOffer,
  };

  return (
    <ItemContext.Provider value={contextValue}>{children}</ItemContext.Provider>
  );
};
