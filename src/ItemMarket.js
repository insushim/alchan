// src/ItemMarket.js
import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useItems } from "./ItemContext";
import LoginWarning from "./LoginWarning";
import "./ItemMarket.css";

// Firebase 관련 임포트 추가 (필요한 경우)
// import { db } from "./firebase";
// import { collection, query, where, onSnapshot } from "firebase/firestore";

const ItemMarket = () => {
  const auth = useAuth() || {};
  const { user, loading: authLoading } = auth;

  const itemsContext = useItems() || {};

  // ItemContext가 아직 준비되지 않았을 경우를 대비하여 기본값 설정
  const {
    marketListings = [],
    marketOffers = [],
    listItemForSale,
    buyMarketItem,
    cancelSale,
    makeOffer,
    respondToOffer,
    userItems = [],
    loading: itemsContextLoading = false,
    fetchMarketListings, // 새로운 함수 추가 (ItemContext에 구현 필요)
  } = itemsContext;

  const [showSellModal, setShowSellModal] = useState(false);
  const [sellModalData, setSellModalData] = useState({
    itemId: "",
    quantity: 1,
    price: 100,
  });

  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerModalData, setOfferModalData] = useState({
    listingId: null,
    itemName: "",
    currentPrice: 0,
    quantity: 1,
    offerPrice: 0,
    availableQuantity: 1,
  });

  const [notification, setNotification] = useState(null);
  const [activeTab, setActiveTab] = useState("listings");
  const [refreshKey, setRefreshKey] = useState(0);

  // 로컬 상태로 마켓 데이터 관리 (필요한 경우)
  const [localMarketListings, setLocalMarketListings] = useState([]);

  // ItemContext 로딩 상태를 감지
  const itemsLoading = !itemsContext || itemsContextLoading;

  // 컴포넌트가 마운트될 때와 판매 등록/취소 후 데이터 새로고침 로직
  useEffect(() => {
    console.log("[ItemMarket] useEffect triggered", {
      user,
      marketListings,
      refreshKey,
      authLoading,
      itemsLoading,
    });

    // 사용자 정보와 아이템 컨텍스트가 모두 로드된 경우에만 실행
    if (!authLoading && !itemsLoading && user) {
      console.log("[ItemMarket] Data loaded, user authenticated:", user.id);

      // ItemContext에 fetchMarketListings 함수가 있는 경우 호출
      if (typeof fetchMarketListings === "function") {
        console.log("[ItemMarket] Calling fetchMarketListings");
        fetchMarketListings();
      }

      // 여기서 필요한 경우 직접 Firebase에서 데이터를 가져올 수도 있음
      // 예시: 직접 Firebase 쿼리 작성
      /*
      const marketListingsRef = collection(db, "marketListings");
      const q = query(marketListingsRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const listings = [];
        snapshot.forEach((doc) => {
          listings.push({
            id: doc.id,
            ...doc.data()
          });
        });
        console.log("[ItemMarket] Direct Firebase fetch:", listings);
        setLocalMarketListings(listings);
      });

      return () => unsubscribe();
      */
    }
  }, [user, authLoading, itemsLoading, refreshKey]);

  // marketListings 변경 감지
  useEffect(() => {
    console.log("[ItemMarket] marketListings updated:", marketListings);
  }, [marketListings]);

  const showAppNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const sellableUserItems = userItems
    ? userItems.filter((item) => item && item.quantity > 0)
    : [];

  const handleOpenSellModalFromMarket = () => {
    if (sellableUserItems.length === 0) {
      showAppNotification("info", "판매할 수 있는 아이템이 없습니다.");
      return;
    }
    const firstSellable = sellableUserItems[0];
    setSellModalData({
      itemId: firstSellable?.id || "",
      quantity: 1,
      price: Math.max(1, Math.round((firstSellable?.price || 100) * 0.8)),
    });
    setShowSellModal(true);
  };

  const handleSellModalChange = (e) => {
    const { name, value } = e.target;
    setSellModalData((prev) => ({ ...prev, [name]: value }));
    if (name === "itemId") {
      const selected = sellableUserItems.find((item) => item.id === value);
      setSellModalData((prev) => ({
        ...prev,
        quantity: 1,
        price: selected ? Math.max(1, Math.round(selected.price * 0.8)) : 100,
      }));
    }
  };

  const handleSellQuantityChange = (value) => {
    const itemDetails = sellableUserItems.find(
      (item) => item.id === sellModalData.itemId
    );
    const maxQty = itemDetails ? itemDetails.quantity : 1;
    setSellModalData((prev) => ({
      ...prev,
      quantity: Math.max(1, Math.min(maxQty, parseInt(value) || 1)),
    }));
  };

  const handleRegisterSale = async () => {
    if (authLoading || itemsLoading) {
      showAppNotification(
        "info",
        "데이터 로딩 중입니다. 잠시 후 다시 시도해주세요."
      );
      return;
    }

    if (!user) {
      showAppNotification("error", "로그인이 필요합니다.");
      return;
    }

    if (typeof listItemForSale !== "function") {
      showAppNotification(
        "error",
        "판매 등록 기능을 사용할 수 없습니다. (listItemForSale is not a function)"
      );
      console.error(
        "listItemForSale is not a function. Current context:",
        itemsContext
      );
      return;
    }

    if (
      !sellModalData.itemId ||
      sellModalData.quantity <= 0 ||
      sellModalData.price <= 0
    ) {
      showAppNotification("error", "판매 정보를 올바르게 입력해주세요.");
      return;
    }

    try {
      console.log("[ItemMarket] Registering sale with data:", sellModalData);
      const result = await listItemForSale(sellModalData);
      console.log("[ItemMarket] Sale registration result:", result);

      if (result.success) {
        showAppNotification("success", result.message);
        setShowSellModal(false);

        // 판매 등록 성공 후 새로고침 트리거
        setRefreshKey((prev) => prev + 1);

        // 판매 목록 탭으로 전환 (약간 지연 추가)
        setTimeout(() => {
          setActiveTab("myListings");
        }, 500);
      } else {
        showAppNotification(
          "error",
          result.message || "판매 등록에 실패했습니다."
        );
      }
    } catch (error) {
      console.error("[ItemMarket] Error in handleRegisterSale:", error);
      showAppNotification(
        "error",
        "판매 등록 중 오류가 발생했습니다: " + error.message
      );
    }
  };

  const handleBuyItem = async (listing) => {
    if (authLoading || itemsLoading || typeof buyMarketItem !== "function") {
      showAppNotification("info", "잠시 후 다시 시도해주세요.");
      return;
    }
    if (
      window.confirm(
        `${listing.itemName} ${listing.quantity || 1}개를 ${(
          (listing.price || 0) * (listing.quantity || 1)
        ).toLocaleString()}원에 구매하시겠습니까?`
      )
    ) {
      const result = await buyMarketItem(listing.id);
      showAppNotification(result.success ? "success" : "error", result.message);
      if (result.success) {
        setRefreshKey((prev) => prev + 1);
      }
    }
  };

  const handleCancelSaleItem = async (listingId) => {
    if (authLoading || itemsLoading || typeof cancelSale !== "function") {
      showAppNotification("info", "잠시 후 다시 시도해주세요.");
      return;
    }
    if (window.confirm("정말로 판매를 취소하시겠습니까?")) {
      const result = await cancelSale(listingId);
      showAppNotification(result.success ? "success" : "error", result.message);
      if (result.success) {
        setRefreshKey((prev) => prev + 1);
      }
    }
  };

  const handleOpenOfferModal = (listing) => {
    setOfferModalData({
      listingId: listing.id,
      itemName: listing.itemName,
      currentPrice: listing.price || 0,
      quantity: 1,
      offerPrice: Math.round((listing.price || 0) * 0.9),
      availableQuantity: listing.quantity || 1,
    });
    setShowOfferModal(true);
  };

  const handleOfferModalChange = (e) => {
    const { name, value } = e.target;
    setOfferModalData((prev) => ({ ...prev, [name]: value }));
  };

  const handleOfferQuantityChange = (value) => {
    setOfferModalData((prev) => ({
      ...prev,
      quantity: Math.max(
        1,
        Math.min(prev.availableQuantity, parseInt(value) || 1)
      ),
    }));
  };

  const handleSubmitOffer = async () => {
    if (authLoading || itemsLoading || typeof makeOffer !== "function") {
      showAppNotification("info", "잠시 후 다시 시도해주세요.");
      return;
    }
    if (offerModalData.offerPrice <= 0 || offerModalData.quantity <= 0) {
      showAppNotification("error", "유효한 제안 가격과 수량을 입력하세요.");
      return;
    }
    const result = await makeOffer({
      listingId: offerModalData.listingId,
      offerPrice: offerModalData.offerPrice,
      quantity: offerModalData.quantity,
    });
    showAppNotification(result.success ? "success" : "error", result.message);
    if (result.success) {
      setShowOfferModal(false);
      setRefreshKey((prev) => prev + 1);
      setActiveTab("myOffers");
    }
  };

  const handleRespondToOffer = async (offerId, response) => {
    if (authLoading || itemsLoading || typeof respondToOffer !== "function") {
      showAppNotification("info", "잠시 후 다시 시도해주세요.");
      return;
    }
    const offer = marketOffers.find((o) => o.id === offerId);
    if (!offer) return;

    const confirmMessage =
      response === "accepted"
        ? `[${offer.buyerName}]님의 '${offer.itemName}' ${
            offer.quantity || 1
          }개, 개당 ${(
            offer.offeredPricePerItem || 0
          ).toLocaleString()}원 제안을 수락하시겠습니까?`
        : `[${offer.buyerName}]님의 '${offer.itemName}' 제안을 거절하시겠습니까?`;

    if (window.confirm(confirmMessage)) {
      const result = await respondToOffer({ offerId, response });
      showAppNotification(result.success ? "success" : "error", result.message);
      if (result.success) {
        setRefreshKey((prev) => prev + 1);
      }
    }
  };

  const selectedSellItemDetails = sellModalData.itemId
    ? sellableUserItems.find((item) => item.id === sellModalData.itemId)
    : null;
  const maxSellQuantity = selectedSellItemDetails
    ? selectedSellItemDetails.quantity
    : 1;

  // 마켓 리스팅을 가져오는 함수 개선
  const getFilteredListings = () => {
    // 사용할 데이터 소스 결정 (컨텍스트 또는 로컬)
    const listings =
      marketListings.length > 0 ? marketListings : localMarketListings;

    if (!listings || !Array.isArray(listings) || !user) {
      console.log("[ItemMarket] getFilteredListings - No valid data or user", {
        listings,
        isArray: Array.isArray(listings),
        user,
      });
      return [];
    }

    // 사용자 ID 가져오기 (uid 또는 id)
    const currentUserId = user.uid || user.id;

    // 활성 상태인 리스팅만 필터링 - status가 "active"인 것만
    const activeListings = listings.filter(
      (listing) => listing && listing.status === "active"
    );

    console.log("[ItemMarket] Filtering listings:", {
      allListings: listings,
      activeListings: activeListings,
      userId: currentUserId,
      myListings: activeListings.filter(
        (l) =>
          l && (l.sellerId === currentUserId || l.sellerUid === currentUserId)
      ),
    });

    switch (activeTab) {
      case "myListings":
        return activeListings.filter(
          (l) =>
            l && (l.sellerId === currentUserId || l.sellerUid === currentUserId)
        );
      case "listings":
      default:
        return activeListings.filter(
          (l) =>
            l && l.sellerId !== currentUserId && l.sellerUid !== currentUserId
        );
    }
  };

  const getFilteredOffers = () => {
    if (!marketOffers || !Array.isArray(marketOffers) || !user) return [];

    switch (activeTab) {
      case "myOffers":
        return marketOffers.filter((o) => o && o.buyerId === user.id);
      case "offersToMe":
        return marketOffers.filter(
          (o) => o && o.sellerId === user.id && o.status === "pending"
        );
      default:
        return [];
    }
  };

  if (authLoading || itemsLoading) {
    return (
      <div className="page-container text-center">
        아이템 시장 정보를 불러오는 중...
      </div>
    );
  }

  if (!user) {
    return <LoginWarning />;
  }

  return (
    <div className="page-container item-market-page">
      <h2 className="page-title">아이템 시장</h2>
      <p className="page-description">
        다른 학생들과 아이템을 자유롭게 거래해보세요!
      </p>

      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      <div className="market-tabs">
        <button
          onClick={() => setActiveTab("listings")}
          className={activeTab === "listings" ? "active" : ""}
        >
          아이템 목록
        </button>
        <button
          onClick={() => setActiveTab("myListings")}
          className={activeTab === "myListings" ? "active" : ""}
        >
          내 판매 목록
        </button>
        <button
          onClick={() => setActiveTab("offersToMe")}
          className={activeTab === "offersToMe" ? "active" : ""}
        >
          받은 제안
        </button>
        <button
          onClick={() => setActiveTab("myOffers")}
          className={activeTab === "myOffers" ? "active" : ""}
        >
          보낸 제안
        </button>
      </div>

      {activeTab === "listings" && (
        <div className="market-actions">
          <button
            onClick={handleOpenSellModalFromMarket}
            className="action-button sell-button"
          >
            내 아이템 판매하기
          </button>
        </div>
      )}

      {(activeTab === "listings" || activeTab === "myListings") && (
        <div className="market-listings-section">
          <h3 className="section-title">
            {activeTab === "myListings"
              ? "내가 판매 중인 아이템"
              : "판매 중인 아이템"}
          </h3>
          {getFilteredListings().length > 0 ? (
            <div className="items-grid market-grid">
              {getFilteredListings().map((listing) => (
                <div
                  key={listing.id}
                  className="store-item-card market-item-card"
                >
                  <div className="item-header">
                    <span className="item-icon-large">
                      {listing.itemIcon || "📦"}
                    </span>
                    <h4 className="item-name">{listing.itemName}</h4>
                  </div>
                  <p className="item-description-market">
                    {listing.itemDescription || "설명이 없습니다."}
                  </p>
                  <div className="item-info-market">
                    <p>
                      판매자: {listing.sellerName}{" "}
                      {(listing.sellerId === user.id ||
                        listing.sellerUid === user.uid) &&
                        "(나)"}
                    </p>
                    <p>수량: {listing.quantity || 0}개</p>
                    <p>개당 가격: {(listing.price || 0).toLocaleString()}원</p>
                    <p className="total-price">
                      총 가격:{" "}
                      {(
                        (listing.price || 0) * (listing.quantity || 1)
                      ).toLocaleString()}
                      원
                    </p>
                    <p className="listed-date">
                      등록일:{" "}
                      {new Date(listing.listedDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="item-actions-market">
                    {activeTab === "myListings" ||
                    listing.sellerId === user.id ||
                    (listing.sellerUid && listing.sellerUid === user.uid) ? (
                      <button
                        onClick={() => handleCancelSaleItem(listing.id)}
                        className="button-cancel-sale"
                      >
                        판매 취소
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleBuyItem(listing)}
                          className="button-buy"
                        >
                          즉시 구매
                        </button>
                        <button
                          onClick={() => handleOpenOfferModal(listing)}
                          className="button-make-offer"
                        >
                          가격 제안
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-message">
              <p>
                {activeTab === "myListings"
                  ? "내가 판매 중인 아이템이 없습니다."
                  : "현재 시장에 판매 중인 아이템이 없습니다."}
              </p>
              {activeTab === "myListings" && marketListings.length > 0 && (
                <p className="debug-message">
                  (시장에 총{" "}
                  {marketListings.filter((l) => l.status === "active").length}
                  개의 활성 아이템이 있지만 본인의 아이템은 없습니다.)
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "offersToMe" && (
        <div className="market-offers-section">
          <h3 className="section-title">내가 받은 제안</h3>
          {getFilteredOffers().filter((o) => o.status === "pending").length >
          0 ? (
            <div className="offers-list">
              {getFilteredOffers()
                .filter((o) => o.status === "pending")
                .map((offer) => (
                  <div key={offer.id} className="offer-card">
                    <div className="offer-item-info">
                      <span className="item-icon-small">{offer.itemIcon}</span>
                      <strong>{offer.itemName}</strong> (수량:{" "}
                      {offer.quantity || 1})
                    </div>
                    <p>제안자: {offer.buyerName}</p>
                    <p>
                      제안가(개당):{" "}
                      {(offer.offeredPricePerItem || 0).toLocaleString()}원 (총:{" "}
                      {(
                        (offer.offeredPricePerItem || 0) * (offer.quantity || 1)
                      ).toLocaleString()}
                      원)
                    </p>
                    <p>
                      제안 시간: {new Date(offer.timestamp).toLocaleString()}
                    </p>
                    <div className="offer-actions">
                      <button
                        onClick={() =>
                          handleRespondToOffer(offer.id, "accepted")
                        }
                        className="button-accept-offer"
                      >
                        수락
                      </button>
                      <button
                        onClick={() =>
                          handleRespondToOffer(offer.id, "rejected")
                        }
                        className="button-reject-offer"
                      >
                        거절
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="empty-message">
              <p>새로운 제안이 없습니다.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "myOffers" && (
        <div className="market-offers-section">
          <h3 className="section-title">내가 보낸 제안</h3>
          {getFilteredOffers().length > 0 ? (
            <div className="offers-list">
              {getFilteredOffers().map((offer) => (
                <div
                  key={offer.id}
                  className={`offer-card offer-status-${offer.status}`}
                >
                  <div className="offer-item-info">
                    <span className="item-icon-small">{offer.itemIcon}</span>
                    <strong>{offer.itemName}</strong> (수량:{" "}
                    {offer.quantity || 1})
                  </div>
                  <p>
                    판매자:{" "}
                    {marketListings.find((l) => l.id === offer.listingId)
                      ?.sellerName || "알수없음"}
                  </p>
                  <p>
                    제안가(개당):{" "}
                    {(offer.offeredPricePerItem || 0).toLocaleString()}원 (총:{" "}
                    {(
                      (offer.offeredPricePerItem || 0) * (offer.quantity || 1)
                    ).toLocaleString()}
                    원)
                  </p>
                  <p>
                    상태:{" "}
                    <span className={`status-badge ${offer.status}`}>
                      {offer.status === "pending"
                        ? "대기중"
                        : offer.status === "accepted"
                        ? "수락됨"
                        : "거절됨"}
                    </span>
                    {offer.responseMessage && (
                      <span className="response-message">
                        {" "}
                        ({offer.responseMessage})
                      </span>
                    )}
                  </p>
                  <p>제안 시간: {new Date(offer.timestamp).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-message">
              <p>보낸 제안이 없습니다.</p>
            </div>
          )}
        </div>
      )}

      {showSellModal && (
        <div className="modal-overlay" onClick={() => setShowSellModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>아이템 판매 등록</h3>
              <button
                onClick={() => setShowSellModal(false)}
                className="close-button"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="sellItemId">판매할 아이템:</label>
                <select
                  id="sellItemId"
                  name="itemId"
                  value={sellModalData.itemId}
                  onChange={handleSellModalChange}
                >
                  <option value="">아이템 선택</option>
                  {sellableUserItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} (보유: {item.quantity}개) {item.icon}
                    </option>
                  ))}
                </select>
              </div>
              {selectedSellItemDetails && (
                <>
                  <div className="form-group">
                    <label htmlFor="sellQuantity">
                      판매 수량 (최대: {maxSellQuantity}개):
                    </label>
                    <input
                      type="number"
                      id="sellQuantity"
                      name="quantity"
                      value={sellModalData.quantity}
                      onChange={(e) => handleSellQuantityChange(e.target.value)}
                      min="1"
                      max={maxSellQuantity}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="sellPrice">개당 판매 가격 (원):</label>
                    <input
                      type="number"
                      id="sellPrice"
                      name="price"
                      value={sellModalData.price}
                      onChange={handleSellModalChange}
                      min="1"
                    />
                  </div>
                  <div className="item-preview-simple">
                    <span className="item-icon-small">
                      {selectedSellItemDetails.icon}
                    </span>
                    <span>{selectedSellItemDetails.name}</span>
                    <p className="item-desc-small">
                      {selectedSellItemDetails.description}
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowSellModal(false)}
                className="button-secondary"
              >
                취소
              </button>
              <button
                onClick={handleRegisterSale}
                className="button-primary"
                disabled={!selectedSellItemDetails}
              >
                판매 등록
              </button>
            </div>
          </div>
        </div>
      )}

      {showOfferModal && (
        <div className="modal-overlay" onClick={() => setShowOfferModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>'{offerModalData.itemName}' 가격 제안</h3>
              <button
                onClick={() => setShowOfferModal(false)}
                className="close-button"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                현재 개당 가격: {offerModalData.currentPrice.toLocaleString()}원
                (판매 수량: {offerModalData.availableQuantity}개)
              </p>
              <div className="form-group">
                <label htmlFor="offerQuantity">
                  제안 수량 (최대: {offerModalData.availableQuantity}개):
                </label>
                <input
                  type="number"
                  id="offerQuantity"
                  name="quantity"
                  value={offerModalData.quantity}
                  onChange={(e) => handleOfferQuantityChange(e.target.value)}
                  min="1"
                  max={offerModalData.availableQuantity}
                />
              </div>
              <div className="form-group">
                <label htmlFor="offerPrice">제안할 개당 가격 (원):</label>
                <input
                  type="number"
                  id="offerPrice"
                  name="offerPrice"
                  value={offerModalData.offerPrice}
                  onChange={handleOfferModalChange}
                  min="1"
                />
              </div>
              <p>
                총 제안 금액:{" "}
                <strong>
                  {(
                    offerModalData.offerPrice * offerModalData.quantity
                  ).toLocaleString()}
                  원
                </strong>
              </p>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowOfferModal(false)}
                className="button-secondary"
              >
                취소
              </button>
              <button onClick={handleSubmitOffer} className="button-primary">
                제안하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemMarket;
