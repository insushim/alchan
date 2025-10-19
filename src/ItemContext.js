import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useAuth } from "./AuthContext";
import { functions, httpsCallable } from "./firebase";

export const ItemContext = createContext(null);

export const useItems = () => {
  const context = useContext(ItemContext);
  if (!context) {
    // This fallback is for components that might render outside the provider.
    // It provides a safe, non-functional version of the context values.
    console.warn("useItems: ItemContext 범위 밖에서 사용됨");
    return {
      items: [], userItems: [], marketListings: [], marketOffers: [],
      loading: true, error: null,
      addItem: async () => ({ success: false, message: "Context not available" }),
      purchaseItem: async () => ({ success: false, message: "Context not available" }),
      updateItem: async () => ({ success: false, message: "Context not available" }),
      deleteItem: async () => ({ success: false, message: "Context not available" }),
      useItem: async () => ({ success: false, message: "Context not available" }),
      updateUserItemQuantity: async () => ({ success: false, message: "Context not available" }),
      listItemForSale: async () => ({ success: false, message: "Context not available" }),
      buyMarketItem: async () => ({ success: false, message: "Context not available" }),
      cancelSale: async () => ({ success: false, message: "Context not available" }),
      makeOffer: async () => ({ success: false, message: "Context not available" }),
      respondToOffer: async () => ({ success: false, message: "Context not available" }),
      adminCancelSale: async () => ({ success: false, message: "Context not available" }),
      adminDeleteItem: async () => ({ success: false, message: "Context not available" }),
      refreshData: async () => {},
    };
  }
  return context;
};

export const ItemProvider = ({ children }) => {
  const { user, userDoc, isAdmin: isAuthAdmin, loading: authLoading, deductCash, addCash } = useAuth() || {};
  const userId = user?.uid;
  const currentUserClassCode = userDoc?.classCode;

  // State for all economic data
  const [items, setItems] = useState([]);
  const [userItems, setUserItems] = useState([]);
  const [marketListings, setMarketListings] = useState([]);
  const [marketOffers, setMarketOffers] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState(null);

  // Unified loading state
  const loading = authLoading || dataLoading;

  // Memoized Firebase callables
  const getItemContextData = useMemo(() => httpsCallable(functions, 'getItemContextData'), []);
  const firebaseFunctions = useMemo(() => ({
    addStoreItem: httpsCallable(functions, 'addStoreItem'),
    updateStoreItem: httpsCallable(functions, 'updateStoreItem'),
    deleteStoreItem: httpsCallable(functions, 'deleteStoreItem'),
    purchaseStoreItem: httpsCallable(functions, 'purchaseStoreItem'),
    useUserItem: httpsCallable(functions, 'useUserItem'),
    updateUserItemQuantity: httpsCallable(functions, 'updateUserItemQuantity'),
    listUserItemForSale: httpsCallable(functions, 'listUserItemForSale'),
    buyMarketItem: httpsCallable(functions, 'buyMarketItem'),
    cancelMarketSale: httpsCallable(functions, 'cancelMarketSale'),
    makeOffer: httpsCallable(functions, 'makeOffer'),
    respondToOffer: httpsCallable(functions, 'respondToOffer'),
    adminCancelSale: httpsCallable(functions, 'adminCancelSale'),
    adminDeleteItem: httpsCallable(functions, 'adminDeleteItem'),
  }), []);

  // Central data fetching function
  const fetchData = useCallback(async () => {
    if (!userId || !currentUserClassCode) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    try {
      const result = await getItemContextData();
      if (result.data.success) {
        const { storeItems, userItems: groupedUserItems, marketListings, marketOffers } = result.data.data;
        setItems(storeItems || []);
        setUserItems(groupedUserItems || []);
        setMarketListings(marketListings || []);
        setMarketOffers(marketOffers || []);
        setError(null);
      } else {
        throw new Error(result.data.message || '데이터를 불러오는데 실패했습니다.');
      }
    } catch (err) {
      console.error('[ItemContext] 데이터 로드 오류:', err);
      setError(err);
    } finally {
      setDataLoading(false);
    }
  }, [userId, currentUserClassCode, getItemContextData]);

  // Effect to fetch data when user is authenticated
  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, fetchData]);

  // Public refresh function
  const refreshData = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // 🔥 로컬 상태 즉시 업데이트 함수 (Firestore 읽기 없이)
  const updateLocalUserItems = useCallback((newUserItems) => {
    console.log('[ItemContext] 로컬 userItems 업데이트:', newUserItems?.length, '개');
    setUserItems(newUserItems);
  }, []);

  // All context functions now use firebaseFunctions and refreshData
  const addItem = useCallback(async (newItemData) => {
    if (!isAuthAdmin()) return { success: false, message: "관리자 권한 필요" };
    try {
      const result = await firebaseFunctions.addStoreItem({ newItemData });
      if (result.data.success) {
        refreshData();
        return { success: true };
      }
      throw new Error(result.data.message);
    } catch (error) {
      if (error.code === 'not-found') {
        return { success: false, message: "아이템 추가 함수(addStoreItem)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [isAuthAdmin, firebaseFunctions, refreshData]);

  const updateItem = useCallback(async (itemId, updatesToApply) => {
    if (!isAuthAdmin()) return { success: false, message: "관리자 권한 필요" };
    try {
      await firebaseFunctions.updateStoreItem({ itemId, updatesToApply });
      refreshData();
      return { success: true };
    } catch (error) {
      if (error.code === 'not-found') {
        return { success: false, message: "아이템 수정 함수(updateStoreItem)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [isAuthAdmin, firebaseFunctions, refreshData]);

  const deleteItem = useCallback(async (itemId) => {
    if (!isAuthAdmin()) return { success: false, message: "관리자 권한 필요" };
    try {
      await firebaseFunctions.deleteStoreItem({ itemId });
      refreshData();
      return { success: true };
    } catch (error) {
      if (error.code === 'not-found') {
        return { success: false, message: "아이템 삭제 함수(deleteStoreItem)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [isAuthAdmin, firebaseFunctions, refreshData]);

  const purchaseItem = useCallback(async (itemId, quantity = 1) => {
    if (!userId) return { success: false, message: "로그인 필요" };
    const itemToPurchase = items.find(item => item.id === itemId);
    if (!itemToPurchase) return { success: false, message: "아이템을 찾을 수 없습니다." };

    const totalPrice = itemToPurchase.price * quantity;

    // Optimistically deduct cash
    const deductResult = await deductCash(totalPrice, `${itemToPurchase.name} ${quantity}개 구매`);
    if (!deductResult) {
      // If deductCash itself failed (e.g., insufficient funds, though it should be checked earlier)
      return { success: false, message: "현금 차감에 실패했습니다." };
    }

    try {
      const result = await firebaseFunctions.purchaseStoreItem({ itemId, quantity });
      if (result.data.success) {
        refreshData(); // Keep this to update item stock/availability
        return { success: true };
      } else {
        // Rollback cash if Cloud Function fails
        await addCash(totalPrice, `${itemToPurchase.name} 구매 실패 (롤백)`);
        throw new Error(result.data.message || "구매에 실패했습니다.");
      }
    } catch (error) {
      // Rollback cash if any error occurs
      await addCash(totalPrice, `${itemToPurchase.name} 구매 실패 (롤백)`);
      if (error.code === 'not-found') {
        return { success: false, message: "아이템 구매 함수(purchaseStoreItem)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [userId, firebaseFunctions, refreshData, items, userDoc?.cash, deductCash, addCash]);

  const useItem = useCallback(async (inventoryItemId, quantity = 1) => {
    if (!userId) return { success: false, message: "로그인 필요" };
    try {
      await firebaseFunctions.useUserItem({ itemId: inventoryItemId, quantityToUse: quantity, sourceCollection: 'inventory' });
      refreshData();
      return { success: true };
    } catch (error) {
      refreshData();
      if (error.code === 'not-found') {
        return { success: false, message: "아이템 사용 함수(useUserItem)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [userId, firebaseFunctions, refreshData]);

  const listItemForSale = useCallback(async ({ itemId, quantity, price }) => {
    if (!userId) return { success: false, message: "로그인 필요" };
    try {
      await firebaseFunctions.listUserItemForSale({ inventoryItemId: itemId, quantity, price, sourceCollection: 'inventory' });
      refreshData();
      return { success: true };
    } catch (error) {
      refreshData();
      if (error.code === 'not-found') {
        return { success: false, message: "아이템 판매 등록 함수(listUserItemForSale)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [userId, firebaseFunctions, refreshData]);

  const buyMarketItem = useCallback(async (listingId) => {
    if (!userId) return { success: false, message: "로그인 필요" };
    const itemToBuy = marketListings.find(item => item.id === listingId);
    if (!itemToBuy) return { success: false, message: "판매 목록에서 아이템을 찾을 수 없습니다." };

    const itemPrice = itemToBuy.price || itemToBuy.totalPrice || 0;

    // Optimistically deduct cash
    const deductResult = await deductCash(itemPrice, `${itemToBuy.itemName} 구매`);
    if (!deductResult) {
      return { success: false, message: "현금 차감에 실패했습니다." };
    }

    try {
      const result = await firebaseFunctions.buyMarketItem({ listingId });
      if (result.data.success) {
        refreshData(); // Keep this to update market listings
        return { success: true };
      } else {
        // Rollback cash if Cloud Function fails
        await addCash(itemPrice, `${itemToBuy.itemName} 구매 실패 (롤백)`);
        throw new Error(result.data.message || "구매에 실패했습니다.");
      }
    } catch (error) {
      // Rollback cash if any error occurs
      await addCash(itemPrice, `${itemToBuy.itemName} 구매 실패 (롤백)`);
      if (error.code === 'not-found') {
        return { success: false, message: "구매 처리 함수(buyMarketItem)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [userId, firebaseFunctions, refreshData, marketListings, userDoc?.cash, deductCash, addCash]);

  const cancelSale = useCallback(async (listingId) => {
    if (!userId) return { success: false, message: "로그인 필요" };
    try {
      await firebaseFunctions.cancelMarketSale({ listingId });
      refreshData();
      return { success: true };
    } catch (error) {
      refreshData();
      if (error.code === 'not-found') {
        return { success: false, message: "판매 취소 함수(cancelMarketSale)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [userId, firebaseFunctions, refreshData]);

  const makeOffer = useCallback(async ({ listingId, offerPrice, quantity = 1 }) => {
    if (!userId) return { success: false, message: "로그인 필요" };
    try {
      const result = await firebaseFunctions.makeOffer({ listingId, offerPrice, quantity });
      refreshData();
      return { success: true, offerId: result.data.offerId };
    } catch (error) {
      refreshData();
      if (error.code === 'not-found') {
        return { success: false, message: "가격 제안 함수(makeOffer)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [userId, firebaseFunctions, refreshData]);

  const respondToOffer = useCallback(async ({ offerId, response }) => {
    if (!userId) return { success: false, message: "로그인 필요" };
    try {
      await firebaseFunctions.respondToOffer({ offerId, response });
      refreshData();
      return { success: true };
    } catch (error) {
      refreshData();
      if (error.code === 'not-found') {
        return { success: false, message: "제안 응답 함수(respondToOffer)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [userId, firebaseFunctions, refreshData]);

  const adminCancelSale = useCallback(async (listingId) => {
    if (!isAuthAdmin()) return { success: false, message: "관리자 권한 필요" };
    try {
      await firebaseFunctions.adminCancelSale({ listingId });
      refreshData();
      return { success: true };
    } catch (error) {
      refreshData();
      if (error.code === 'not-found') {
        return { success: false, message: "관리자 판매 취소 함수(adminCancelSale)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [isAuthAdmin, firebaseFunctions, refreshData]);

  const adminDeleteItem = useCallback(async (listingId) => {
    if (!isAuthAdmin()) return { success: false, message: "관리자 권한 필요" };
    try {
      await firebaseFunctions.adminDeleteItem({ listingId });
      refreshData();
      return { success: true };
    } catch (error) {
      refreshData();
      if (error.code === 'not-found') {
        return { success: false, message: "관리자 아이템 삭제 함수(adminDeleteItem)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [isAuthAdmin, firebaseFunctions, refreshData]);

  const updateUserItemQuantity = useCallback(async (itemId, quantityChange, sourceCollection = 'inventory') => {
    if (!userId) return { success: false, message: "로그인 필요" };
    try {
      const result = await firebaseFunctions.updateUserItemQuantity({ itemId, quantityChange, sourceCollection });
      if (result.data.success) {
        refreshData();
        return { success: true };
      } else {
        throw new Error(result.data.message || "아이템 수량 업데이트에 실패했습니다.");
      }
    } catch (error) {
      refreshData();
      if (error.code === 'not-found') {
        return { success: false, message: "아이템 수량 업데이트 함수(updateUserItemQuantity)를 찾을 수 없습니다. 관리자에게 문의하세요." };
      }
      return { success: false, message: error.message };
    }
  }, [userId, firebaseFunctions, refreshData]);

  // Final context value
  const contextValue = useMemo(() => ({
    items,
    userItems,
    marketListings,
    marketOffers,
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
    purchaseItem,
    useItem,
    updateUserItemQuantity,
    listItemForSale,
    buyMarketItem,
    cancelSale,
    makeOffer,
    respondToOffer,
    adminCancelSale,
    adminDeleteItem,
    refreshData,
    updateLocalUserItems,
  }), [
    items, userItems, marketListings, marketOffers, loading, error,
    addItem, updateItem, deleteItem, purchaseItem, useItem, updateUserItemQuantity,
    listItemForSale, buyMarketItem, cancelSale, makeOffer, respondToOffer,
    adminCancelSale, adminDeleteItem, refreshData, updateLocalUserItems
  ]);

  return (
    <ItemContext.Provider value={contextValue}>
      {children}
    </ItemContext.Provider>
  );
};
