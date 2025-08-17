// src/Auction.js (수정됨)
import React, { useState, useEffect } from "react"; // useContext는 직접 사용하지 않으므로 제거
import { useAuth } from "./AuthContext";
import { useItems } from "./ItemContext";

// firebase.js에서 익스포트하는 함수들
import {
  db,
  serverTimestamp,
  collection,
  query,
  // where, // where는 현재 코드에서 사용되지 않음
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  runTransaction,
  Timestamp,
  increment,
  getDoc,
  // getDocs, // getDocs는 현재 코드에서 사용되지 않음
} from "./firebase"; // firebase.js 경로에 맞게 수정

// onSnapshot과 orderBy는 firebase/firestore에서 직접 가져옵니다.
import {
  onSnapshot as firebaseOnSnapshot,
  orderBy as firebaseOrderBy,
} from "firebase/firestore";

export default function Auction() {
  // --- Context Data ---
  const authContext = useAuth(); //
  const itemsContext = useItems(); //
  // allUsersData는 AuthContext의 users 상태를 가져옵니다.
  const allUsersData = authContext?.users ?? []; //

  const authLoading = authContext?.loading ?? true; //
  const firebaseUser = !authLoading ? authContext?.user : null; // Firebase Auth User 객체
  const userDoc = !authLoading ? authContext?.userDoc : null; // Firestore 사용자 문서 데이터

  // 수정된 값 참조
  const balance = userDoc?.cash ?? 0; //
  const currentUserId = firebaseUser?.uid || userDoc?.id; //
  const classCode = userDoc?.classCode; //
  const currentUserName =
    userDoc?.name || firebaseUser?.displayName || "판매자 정보 없음";

  const itemsLoading = itemsContext?.loading ?? true; //
  const inventoryItems = !itemsLoading ? itemsContext?.userItems ?? [] : []; //
  const updateUserItemQuantity = itemsContext?.updateUserItemQuantity; //

  // --- Component State ---
  const [activeTab, setActiveTab] = useState("ongoing"); //
  const [searchTerm, setSearchTerm] = useState(""); //
  const [selectedAssetForAuction, setSelectedAssetForAuction] = useState(null); //
  const [newAuction, setNewAuction] = useState({
    //
    assetId: null,
    assetType: "item",
    name: "",
    description: "",
    startPrice: "",
    duration: "1",
  });
  const [bidAmount, setBidAmount] = useState({}); //
  const [notification, setNotification] = useState(null); //
  const [currentTime, setCurrentTime] = useState(new Date()); //
  const [auctions, setAuctions] = useState([]); //
  const [auctionsLoading, setAuctionsLoading] = useState(true); //

  // --- Effects ---
  useEffect(() => {
    //
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); //
    return () => clearInterval(timer); //
  }, []);

  useEffect(() => {
    //
    if (!classCode || !currentUserId) {
      //
      setAuctionsLoading(false); //
      setAuctions([]); //
      return; //
    }
    setAuctionsLoading(true); //
    const auctionsRef = collection(db, "classes", classCode, "auctions"); //
    const q = query(auctionsRef, firebaseOrderBy("endTime", "desc")); //

    const unsubscribe = firebaseOnSnapshot(
      //
      q,
      (querySnapshot) => {
        const auctionsData = querySnapshot.docs.map((doc) => ({
          //
          id: doc.id, //
          ...doc.data(), //
          endTime: doc.data().endTime?.toDate //
            ? doc.data().endTime.toDate() //
            : null, //
        }));
        setAuctions(auctionsData); //
        setAuctionsLoading(false); //
        console.log(
          //
          "[Auction] Firestore auctions data loaded/updated for class:", //
          classCode, //
          auctionsData //
        );
      },
      (error) => {
        console.error(
          //
          "[Auction] Error fetching auctions from Firestore:", //
          error //
        );
        showNotification(
          //
          "경매 데이터를 불러오는 중 오류가 발생했습니다.", //
          "error" //
        );
        setAuctionsLoading(false); //
      }
    );

    return () => unsubscribe(); //
  }, [classCode, currentUserId]); //

  useEffect(() => {
    //
    if (selectedAssetForAuction) {
      //
      if (
        //
        !selectedAssetForAuction.type || //
        selectedAssetForAuction.type !== "item" //
      ) {
        showNotification(
          //
          "선택된 자산의 타입을 식별할 수 없거나 아이템이 아닙니다.", //
          "error" //
        );
        setSelectedAssetForAuction(null); //
        return; //
      }
      setNewAuction((prev) => ({
        //
        ...prev, //
        assetId: selectedAssetForAuction.id, //
        assetType: selectedAssetForAuction.type, //
        name: selectedAssetForAuction.name || "이름 없음", //
        description: selectedAssetForAuction.description || "", //
        startPrice: "", //
        duration: "1", //
      }));
    } else {
      setNewAuction((prev) => ({
        //
        ...prev, //
        assetId: null, //
        assetType: "item", //
        name: "", //
        description: "", //
        startPrice: "", //
        duration: "1", //
      }));
    }
  }, [selectedAssetForAuction]); //

  // --- Data Filtering ---
  const ongoingAuctions = auctions //
    .filter(
      //
      (auction) =>
        auction.endTime instanceof Date && auction.endTime > currentTime //
    )
    .filter(
      //
      (auction) =>
        searchTerm === "" || //
        auction.name.toLowerCase().includes(searchTerm.toLowerCase()) || //
        (auction.description && //
          auction.description.toLowerCase().includes(searchTerm.toLowerCase())) //
    );
  const myAuctions = auctions.filter(
    //
    (auction) => auction.seller === currentUserId //
  );
  const myBids = auctions.filter(
    //
    (auction) =>
      auction.highestBidder === currentUserId && //
      auction.seller !== currentUserId //
  );
  const completedAuctions = auctions.filter(
    //
    (auction) =>
      auction.endTime instanceof Date && auction.endTime <= currentTime //
  );

  // --- Helper Functions ---
  const getTimeLeft = (endTime) => {
    //
    if (!(endTime instanceof Date) || isNaN(endTime.getTime()))
      //
      return "시간 정보 없음"; //
    const timeDiff = endTime.getTime() - currentTime.getTime(); //
    if (timeDiff <= 0) return "종료됨"; //
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24)); //
    const hours = Math.floor((timeDiff / (1000 * 60 * 60)) % 24); //
    const minutes = Math.floor((timeDiff / 1000 / 60) % 60); //
    let output = ""; //
    if (days > 0) output += `${days}일 `; //
    if (hours > 0 || days > 0) output += `${hours}시간 `; //
    if (minutes > 0 || (days === 0 && hours === 0)) output += `${minutes}분`; //
    return output.trim() || "곧 종료"; //
  };
  const formatPrice = (price) => {
    //
    if (typeof price !== "number" || isNaN(price)) return "가격 정보 없음"; //
    return `${price.toLocaleString("ko-KR")}원`; //
  };
  const showNotification = (message, type = "info") => {
    //
    setNotification({ message, type }); //
    setTimeout(() => setNotification(null), 3500); //
  };

  // --- Event Handlers ---
  const handleBid = async (auctionId) => {
    //
    if (!currentUserId || !classCode) {
      //
      showNotification("로그인이 필요하거나 학급 정보가 없습니다.", "error"); //
      return; //
    }
    const auctionRef = doc(db, "classes", classCode, "auctions", auctionId); //
    const userRef = doc(db, "users", currentUserId); //

    const auctionFromState = auctions.find((a) => a.id === auctionId); //
    if (!auctionFromState) {
      //
      showNotification("경매 정보를 찾을 수 없습니다 (로컬 상태).", "error"); //
      return; //
    }

    const amount = parseInt(bidAmount[auctionId] || "0", 10); //

    if (!amount || isNaN(amount) || amount <= 0) {
      //
      showNotification("유효한 입찰 금액을 입력하세요.", "error"); //
      return; //
    }
    if (amount <= auctionFromState.currentBid) {
      //
      showNotification(
        //
        `현재가 (${formatPrice(
          //
          auctionFromState.currentBid //
        )})보다 높은 금액을 입력하세요.`, //
        "error" //
      );
      return; //
    }
    if (amount > balance) {
      //
      showNotification(
        //
        `보유 금액(${formatPrice(
          //
          balance //
        )})이 부족합니다. 트랜잭션에서 다시 확인됩니다.`, //
        "warning" //
      );
    }
    if (auctionFromState.seller === currentUserId) {
      //
      showNotification("자신의 경매에는 입찰할 수 없습니다.", "error"); //
      return; //
    }
    if (
      //
      !auctionFromState.endTime || //
      !(auctionFromState.endTime instanceof Date) || //
      auctionFromState.endTime <= currentTime //
    ) {
      showNotification("이미 종료되었거나 유효하지 않은 경매입니다.", "error"); //
      return; //
    }

    try {
      await runTransaction(db, async (transaction) => {
        //
        const auctionDoc = await transaction.get(auctionRef); //
        if (!auctionDoc.exists()) {
          //
          throw new Error("경매 정보를 찾을 수 없습니다 (Firestore)."); //
        }
        const currentAuctionData = auctionDoc.data(); //

        const bidderUserDoc = await transaction.get(userRef); //
        if (!bidderUserDoc.exists()) {
          //
          throw new Error("입찰자 정보를 찾을 수 없습니다."); //
        }
        const bidderUserData = bidderUserDoc.data(); //

        if (bidderUserData.cash < amount) {
          //
          throw new Error( //
            `보유 현금이 부족합니다. (현재: ${formatPrice(
              //
              bidderUserData.cash //
            )}, 필요: ${formatPrice(amount)})` //
          );
        }
        if (amount <= currentAuctionData.currentBid) {
          //
          throw new Error( //
            `입찰 금액이 현재가(${formatPrice(
              //
              currentAuctionData.currentBid //
            )})보다 낮거나 같습니다.` //
          );
        }
        if (currentAuctionData.seller === currentUserId) {
          //
          throw new Error("자신의 경매에는 입찰할 수 없습니다."); //
        }
        const auctionEndTime = currentAuctionData.endTime.toDate(); //
        if (auctionEndTime <= new Date()) {
          //
          throw new Error("경매가 이미 종료되었습니다."); //
        }

        if (
          //
          currentAuctionData.highestBidder && //
          currentAuctionData.currentBid > 0 //
        ) {
          const previousHighestBidderRef = doc(
            //
            db, //
            "users", //
            currentAuctionData.highestBidder //
          );
          transaction.update(previousHighestBidderRef, {
            //
            cash: increment(currentAuctionData.currentBid), //
            updatedAt: serverTimestamp(), //
          });
          console.log(
            //
            `[Auction Bid] Returned ${currentAuctionData.currentBid} to previous bidder ${currentAuctionData.highestBidder} via transaction.` //
          );
        }

        transaction.update(userRef, {
          //
          cash: increment(-amount), //
          updatedAt: serverTimestamp(), //
        });

        transaction.update(auctionRef, {
          //
          currentBid: amount, //
          bidCount: increment(1), //
          highestBidder: currentUserId, //
          highestBidderName: currentUserName, // 필요시 입찰자 이름도 저장 (currentUserName 사용)
          updatedAt: serverTimestamp(), //
        });
      });

      if (authContext.refreshUserDocument) authContext.refreshUserDocument(); //

      showNotification("입찰이 성공적으로 완료되었습니다.", "success"); //
      setBidAmount({ ...bidAmount, [auctionId]: "" }); //
    } catch (error) {
      console.error("[Auction Bid] Error placing bid:", error); //
      showNotification(`입찰 실패: ${error.message}`, "error"); //
    }
  };

  const handleCreateAuction = async (e) => {
    //
    e.preventDefault(); //
    if (!currentUserId || !classCode || !firebaseUser) {
      // firebaseUser (로그인된 사용자 객체) 확인
      showNotification(
        //
        "로그인이 필요하거나 학급 또는 사용자 정보가 없습니다.", //
        "error" //
      );
      return; //
    }
    if (typeof updateUserItemQuantity !== "function") {
      //
      showNotification(
        //
        "아이템 상태 업데이트 기능을 사용할 수 없습니다.", //
        "error" //
      );
      return; //
    }
    if (
      //
      !selectedAssetForAuction || //
      !newAuction.assetId || //
      newAuction.assetType !== "item" //
    ) {
      showNotification("경매에 등록할 아이템을 선택해주세요.", "error"); //
      return; //
    }
    const startPrice = parseFloat(newAuction.startPrice); //
    if (isNaN(startPrice) || startPrice <= 0) {
      //
      showNotification("유효한 시작가를 입력해주세요.", "error"); //
      return; //
    }
    const durationHours = parseInt(newAuction.duration, 10); //
    if (isNaN(durationHours) || durationHours < 1 || durationHours > 24) {
      //
      showNotification("유효한 경매 기간(1-24시간)을 선택해주세요.", "error"); //
      return; //
    }

    let itemDeducted = false; //
    try {
      const itemUpdateResult = await updateUserItemQuantity(
        //
        newAuction.assetId, //
        -1 //
      );
      if (
        //
        !itemUpdateResult || //
        (typeof itemUpdateResult === "object" && !itemUpdateResult.success) //
      ) {
        throw new Error( //
          itemUpdateResult?.error || "아이템 수량 변경에 실패했습니다." //
        );
      }
      itemDeducted = true; //

      const auctionsRef = collection(db, "classes", classCode, "auctions"); //
      const endTime = new Date(Date.now() + durationHours * 60 * 60 * 1000); //

      await addDoc(auctionsRef, {
        //
        assetId: newAuction.assetId, //
        assetType: newAuction.assetType, //
        name: newAuction.name, //
        description: newAuction.description, //
        startPrice: startPrice, //
        currentBid: startPrice, //
        bidCount: 0, //
        endTime: Timestamp.fromDate(endTime), //
        highestBidder: null, //
        seller: currentUserId, //
        sellerName: currentUserName, // userDoc.name 또는 firebaseUser.displayName 사용
        status: "ongoing", //
        createdAt: serverTimestamp(), //
        updatedAt: serverTimestamp(), //
        classCode: classCode, //
        itemIcon: selectedAssetForAuction.icon || "📦", //
      });

      setNewAuction({
        //
        assetId: null, //
        assetType: "item", //
        name: "", //
        description: "", //
        startPrice: "", //
        duration: "1", //
      });
      setSelectedAssetForAuction(null); //
      showNotification("경매가 성공적으로 등록되었습니다.", "success"); //
      setActiveTab("myAuctions"); //
    } catch (error) {
      console.error("[Auction Create] Error creating auction:", error); //
      showNotification(`경매 등록 실패: ${error.message}`, "error"); //
      if (
        //
        itemDeducted && //
        newAuction.assetId && //
        typeof updateUserItemQuantity === "function" //
      ) {
        await updateUserItemQuantity(newAuction.assetId, 1); //
        console.log(
          //
          "[Auction Create Error] Item quantity rollback successful for asset ID:", //
          newAuction.assetId //
        );
      }
    }
  };

  const handleCancelAuction = async (auctionId) => {
    //
    if (!currentUserId || !classCode) return; //
    if (typeof updateUserItemQuantity !== "function") {
      //
      showNotification(
        //
        "아이템 상태 업데이트 기능을 사용할 수 없습니다.", //
        "error" //
      );
      return; //
    }

    const auctionRef = doc(db, "classes", classCode, "auctions", auctionId); //
    const auction = auctions.find((a) => a.id === auctionId); //

    if (!auction || auction.seller !== currentUserId) {
      //
      showNotification("취소 권한이 없거나 존재하지 않는 경매입니다.", "error"); //
      return; //
    }
    if (!auction.endTime || !(auction.endTime instanceof Date)) {
      //
      showNotification("유효하지 않은 경매 데이터입니다.", "error"); //
      return; //
    }
    try {
      const auctionDocSnap = await getDoc(auctionRef); //
      if (!auctionDocSnap.exists()) {
        //
        showNotification(
          //
          "경매 정보를 Firestore에서 찾을 수 없습니다.", //
          "error" //
        );
        return; //
      }
      const firestoreAuctionData = auctionDocSnap.data(); //
      const firestoreEndTime = firestoreAuctionData.endTime.toDate(); //

      if (firestoreEndTime <= currentTime) {
        //
        showNotification(
          //
          "이미 종료된 경매는 취소할 수 없습니다 (Firestore 확인).", //
          "info" //
        );
        return; //
      }
      if (firestoreAuctionData.bidCount > 0) {
        //
        showNotification(
          //
          "입찰이 진행된 경매는 취소할 수 없습니다 (Firestore 확인).", //
          "error" //
        );
        return; //
      }

      const itemRestoreResult = await updateUserItemQuantity(
        //
        firestoreAuctionData.assetId, //
        1 //
      );
      if (
        //
        !itemRestoreResult || //
        (typeof itemRestoreResult === "object" && !itemRestoreResult.success) //
      ) {
        throw new Error( //
          itemRestoreResult?.error || "아이템 수량 복구에 실패했습니다." //
        );
      }

      await deleteDoc(auctionRef); //
      showNotification("경매가 취소되었습니다.", "success"); //
    } catch (error) {
      console.error("[Auction Cancel] Error canceling auction:", error); //
      showNotification(`경매 취소 실패: ${error.message}`, "error"); //
    }
  };

  const handleInputChange = (e) => {
    //
    const { name, value } = e.target; //
    if (name === "startPrice" && value && !/^\d*\.?\d*$/.test(value)) {
      //
      return; //
    }
    setNewAuction({ ...newAuction, [name]: value }); //
  };

  const handleSelectAssetForAuction = (event) => {
    //
    const selectedId = event.target.value; //
    if (!selectedId) {
      //
      setSelectedAssetForAuction(null); //
      return; //
    }
    const foundItem = inventoryItems.find((i) => i.id === selectedId); //
    if (foundItem) {
      //
      if (!foundItem.type || foundItem.type !== "item") {
        //
        showNotification(
          //
          "선택된 자산 정보에 타입 속성이 없거나 아이템이 아닙니다.", //
          "error" //
        );
        setSelectedAssetForAuction(null); //
        return; //
      }
      setSelectedAssetForAuction(foundItem); //
    } else {
      showNotification(
        //
        "선택한 ID에 해당하는 아이템을 찾을 수 없습니다.", //
        "error" //
      );
      setSelectedAssetForAuction(null); //
    }
  };

  const handleBidAmountChange = (e, auctionId) => {
    //
    const value = e.target.value; //
    if (value === "" || /^\d+$/.test(value)) {
      //
      setBidAmount({ ...bidAmount, [auctionId]: value }); //
    }
  };

  // --- 로딩 및 사용자/학급 코드 확인 ---
  if (authLoading || itemsLoading) {
    //
    return (
      <div className="loading-container">경매장 정보를 불러오는 중...</div>
    );
  }

  if (!firebaseUser || !currentUserId) {
    // 로그인하지 않은 경우
    return (
      <div className="login-required-container">
        경매장을 이용하려면 로그인이 필요합니다.
      </div>
    );
  }

  if (!userDoc) {
    // Firestore 사용자 정보가 아직 로드되지 않은 경우 (AuthContext 로딩이 완료되었음에도)
    return (
      <div className="loading-container">사용자 정보를 확인 중입니다...</div>
    );
  }

  if (!classCode) {
    // 학급 코드가 없는 경우 (userDoc은 있으나 classCode가 falsy 값)
    return (
      <div className="login-required-container">
        경매장을 이용하려면 학급 코드가 사용자 정보에 설정되어 있어야 합니다.
        (학급 코드: 없음)
      </div>
    );
  }

  // classCode가 확정된 후, auctionsLoading 상태를 확인합니다.
  // 이 시점에서는 classCode가 유효한 값(빈 문자열이 아닌)을 가지고 있다고 가정합니다.
  // 만약 "미지정" 등의 특정 classCode 값을 다른 방식으로 처리하고 싶다면, 여기에 추가 로직이 필요합니다.
  if (auctionsLoading) {
    //
    return (
      <div className="loading-container">
        학급 경매 정보를 불러오는 중... (학급: {classCode})
      </div>
    );
  }

  const durationOptions = []; //
  for (let i = 1; i <= 24; i++) {
    //
    durationOptions.push(
      //
      <option key={i} value={i}>
        {i}시간
      </option>
    );
  }

  const availableItems = inventoryItems.filter(
    //
    (item) => item.quantity >= 1 && item.type === "item" //
  );

  return (
    <div className="auction-container">
      {notification && ( //
        <div className={`notification notification-${notification.type}`}>
          {notification.message}
        </div>
      )}

      <header className="auction-header">
        {" "}
        {/* */}
        <h1>경매장 (학급: {classCode || "정보 없음"})</h1> {/* */}
        <div className="auction-balance">
          {" "}
          {/* */}
          <span>보유 금액: </span> {/* */}
          <span className="balance-amount">{formatPrice(balance)}</span> {/* */}
        </div>
      </header>

      <nav className="tab-container">
        {" "}
        {/* */}
        <button
          className={`tab ${activeTab === "ongoing" ? "active" : ""}`} //
          onClick={() => setActiveTab("ongoing")} //
        >
          진행중
        </button>
        <button
          className={`tab ${activeTab === "myAuctions" ? "active" : ""}`} //
          onClick={() => setActiveTab("myAuctions")} //
        >
          내 경매
        </button>
        <button
          className={`tab ${activeTab === "myBids" ? "active" : ""}`} //
          onClick={() => setActiveTab("myBids")} //
        >
          내 입찰
        </button>
        <button
          className={`tab ${activeTab === "completed" ? "active" : ""}`} //
          onClick={() => setActiveTab("completed")} //
        >
          종료됨
        </button>
        <button
          className={`tab register-tab ${
            //
            activeTab === "register" ? "active" : "" //
          }`}
          onClick={() => setActiveTab("register")} //
        >
          경매 등록
        </button>
      </nav>

      <main className="tab-content">
        {" "}
        {/* */}
        {activeTab === "ongoing" && ( //
          <div className="ongoing-auctions-content">
            {" "}
            {/* */}
            <div className="search-bar">
              {" "}
              {/* */}
              <input
                type="text" //
                placeholder="경매 물품 검색..." //
                value={searchTerm} //
                onChange={(e) => setSearchTerm(e.target.value)} //
                aria-label="경매 물품 검색" //
              />
              <button
                onClick={() => setSearchTerm("")} //
                className="search-reset-button" //
                aria-label="검색어 초기화" //
              >
                {searchTerm ? "초기화" : "검색"} {/* */}
              </button>
            </div>
            {ongoingAuctions.length > 0 ? ( //
              <div className="auctions-grid">
                {" "}
                {/* */}
                {ongoingAuctions.map(
                  (
                    auction //
                  ) => (
                    <article key={auction.id} className="auction-card">
                      {" "}
                      {/* */}
                      <div className="auction-info">
                        {" "}
                        {/* */}
                        <header className="card-header">
                          {" "}
                          {/* */}
                          <h3>
                            <span style={{ marginRight: "5px" }}>
                              {" "}
                              {/* */}
                              {auction.itemIcon || "📦"} {/* */}
                            </span>
                            {auction.name} {/* */}
                          </h3>
                          <span
                            className={`time-left-badge ${
                              //
                              !(auction.endTime instanceof Date) || //
                              isNaN(auction.endTime.getTime()) //
                                ? "error" //
                                : "" //
                            }`}
                            title={
                              //
                              auction.endTime instanceof Date //
                                ? auction.endTime.toLocaleString() //
                                : "종료 시간 정보 없음" //
                            }
                          >
                            {getTimeLeft(auction.endTime)} {/* */}
                          </span>
                        </header>
                        <p className="auction-description">
                          {" "}
                          {/* */}
                          {auction.description || "설명 없음"} {/* */}
                        </p>
                        <div className="auction-price-details">
                          {" "}
                          {/* */}
                          <p>
                            시작가: {/* */}
                            <span className="price start-price">
                              {" "}
                              {/* */}
                              {formatPrice(auction.startPrice)} {/* */}
                            </span>
                          </p>
                          <p>
                            현재가: {/* */}
                            <span className="price current-price">
                              {" "}
                              {/* */}
                              {formatPrice(auction.currentBid)} {/* */}
                            </span>
                          </p>
                        </div>
                        <p className="auction-meta">
                          {" "}
                          {/* */}
                          <span>입찰: {auction.bidCount}회</span> | {/* */}
                          <span>
                            판매자: {/* */}
                            {auction.seller === currentUserId //
                              ? "나" //
                              : auction.sellerName || //
                                auction.seller?.substring(0, 6)}{" "}
                            {/* */}
                          </span>
                        </p>
                        {auction.highestBidder === currentUserId && //
                          auction.seller !== currentUserId && ( //
                            <p className="bid-status-indicator highest">
                              {" "}
                              {/* */}
                              현재 최고 입찰자입니다!
                            </p>
                          )}
                      </div>
                      {auction.seller !== currentUserId && //
                        auction.endTime instanceof Date && //
                        auction.endTime > currentTime && ( //
                          <footer className="auction-actions">
                            {" "}
                            {/* */}
                            <div className="bid-input-group">
                              {" "}
                              {/* */}
                              <input
                                type="text" //
                                inputMode="numeric" //
                                pattern="[0-9]*" //
                                className="bid-input" //
                                placeholder={`${formatPrice(
                                  //
                                  auction.currentBid + 1 //
                                )} 이상`}
                                value={bidAmount[auction.id] || ""} //
                                onChange={
                                  (
                                    e //
                                  ) => handleBidAmountChange(e, auction.id) //
                                }
                                aria-label={`${auction.name} 입찰 금액`} //
                              />
                              <button
                                className="bid-button" //
                                onClick={() => handleBid(auction.id)} //
                                disabled={
                                  //
                                  !bidAmount[auction.id] || //
                                  isNaN(
                                    //
                                    parseInt(bidAmount[auction.id] || "0", 10) //
                                  ) || //
                                  parseInt(bidAmount[auction.id] || "0", 10) <= //
                                    auction.currentBid //
                                }
                              >
                                입찰
                              </button>
                            </div>
                          </footer>
                        )}
                      {auction.seller === currentUserId && //
                        auction.endTime instanceof Date && //
                        auction.endTime > currentTime && ( //
                          <footer className="auction-actions owner-notice">
                            {" "}
                            {/* */}
                            <span>내 경매 물품</span> {/* */}
                          </footer>
                        )}
                    </article>
                  )
                )}
              </div>
            ) : (
              <div className="no-results-message">
                {" "}
                {/* */}
                {searchTerm //
                  ? "검색 결과가 없습니다." //
                  : "현재 진행 중인 경매가 없습니다."}{" "}
                {/* */}
              </div>
            )}
          </div>
        )}
        {activeTab === "myAuctions" && ( //
          <div className="my-auctions-content">
            {" "}
            {/* */}
            <h2>내 경매 물품</h2> {/* */}
            {myAuctions.length > 0 ? ( //
              <div className="list-view">
                {" "}
                {/* */}
                {myAuctions.map(
                  (
                    auction //
                  ) => (
                    <article
                      key={auction.id} //
                      className="list-item my-auction-item" //
                    >
                      <div className="item-info">
                        {" "}
                        {/* */}
                        <h3>
                          <span style={{ marginRight: "5px" }}>
                            {" "}
                            {/* */}
                            {auction.itemIcon || "📦"} {/* */}
                          </span>
                          {auction.name} {/* */}
                        </h3>
                        <p className="item-description">
                          {" "}
                          {/* */}
                          {auction.description || "설명 없음"} {/* */}
                        </p>
                        <div className="price-details">
                          {" "}
                          {/* */}
                          <span>
                            시작가: {formatPrice(auction.startPrice)}
                          </span>{" "}
                          {/* */}
                          <span>
                            현재가: {formatPrice(auction.currentBid)}
                          </span>{" "}
                          {/* */}
                        </div>
                        <p className="meta-details">
                          {" "}
                          {/* */}
                          <span>입찰: {auction.bidCount}회</span> | {/* */}
                          <span>
                            남은 시간: {getTimeLeft(auction.endTime)}
                          </span>{" "}
                          {/* */}
                        </p>
                        <p
                          className={`status-indicator ${
                            //
                            auction.endTime > currentTime //
                              ? "ongoing" //
                              : "completed" //
                          }`}
                        >
                          상태: {/* */}
                          {auction.endTime > currentTime //
                            ? "진행 중" //
                            : auction.highestBidder //
                            ? "판매 완료" //
                            : "유찰됨"}{" "}
                          {/* */}
                        </p>
                        {auction.highestBidder && ( //
                          <p className="highest-bidder-info">
                            {" "}
                            {/* */}
                            최고 입찰자: {/* */}
                            {auction.highestBidder === currentUserId //
                              ? "나" //
                              : allUsersData?.find(
                                  //
                                  (u) => u.id === auction.highestBidder //
                                )?.name ||
                                auction.highestBidder?.substring(0, 6)}{" "}
                            {/* */}
                          </p>
                        )}
                      </div>
                      <div className="item-actions">
                        {" "}
                        {/* */}
                        {auction.endTime > currentTime && //
                          auction.assetType === "item" && //
                          auction.bidCount === 0 && //
                          auction.seller === currentUserId && ( //
                            <button
                              className="action-button cancel-button" //
                              onClick={() => handleCancelAuction(auction.id)} //
                            >
                              등록 취소
                            </button>
                          )}
                        {auction.endTime > currentTime && //
                          auction.bidCount > 0 && ( //
                            <span className="action-status-text">
                              {" "}
                              {/* */}
                              입찰 진행 중
                            </span>
                          )}
                        {auction.endTime <= currentTime && //
                          auction.highestBidder && ( //
                            <span className="action-status-text sold">
                              {" "}
                              {/* */}
                              판매 완료
                            </span>
                          )}
                        {auction.endTime <= currentTime && //
                          !auction.highestBidder && ( //
                            <span className="action-status-text unsold">
                              {" "}
                              {/* */}
                              유찰됨
                            </span>
                          )}
                      </div>
                    </article>
                  )
                )}
              </div>
            ) : (
              <div className="no-results-message">
                {" "}
                {/* */}
                <p>등록한 경매 물품이 없습니다.</p> {/* */}
                <button
                  className="action-button primary" //
                  onClick={() => setActiveTab("register")} //
                >
                  경매 등록하기
                </button>
              </div>
            )}
          </div>
        )}
        {activeTab === "myBids" && ( //
          <div className="my-bids-content">
            {" "}
            {/* */}
            <h2>내 입찰 현황</h2> {/* */}
            {myBids.length > 0 ? ( //
              <div className="list-view">
                {" "}
                {/* */}
                {myBids.map(
                  (
                    auction //
                  ) => (
                    <article
                      key={auction.id} //
                      className={`list-item my-bid-item ${
                        //
                        auction.highestBidder === currentUserId //
                          ? "status-highest" //
                          : "status-outbid" //
                      }`}
                    >
                      <div className="item-info">
                        {" "}
                        {/* */}
                        <h3>
                          <span style={{ marginRight: "5px" }}>
                            {" "}
                            {/* */}
                            {auction.itemIcon || "📦"} {/* */}
                          </span>
                          {auction.name} {/* */}
                        </h3>
                        <p className="item-description">
                          {" "}
                          {/* */}
                          {auction.description || "설명 없음"} {/* */}
                        </p>
                        <p className="bid-info">
                          {" "}
                          {/* */}내 최고 입찰가: {/* */}
                          <span className="price">
                            {" "}
                            {/* */}
                            {formatPrice(auction.currentBid)} {/* */}
                          </span>
                        </p>
                        <p className="meta-details">
                          {" "}
                          {/* */}
                          <span>
                            남은 시간: {getTimeLeft(auction.endTime)}
                          </span>{" "}
                          | {/* */}
                          <span>
                            판매자: {/* */}
                            {auction.seller === currentUserId //
                              ? "나" //
                              : auction.sellerName || //
                                auction.seller?.substring(0, 6)}{" "}
                            {/* */}
                          </span>
                        </p>
                        <p className="status-indicator">
                          {" "}
                          {/* */}
                          상태:
                          {auction.endTime <= currentTime ? ( //
                            auction.highestBidder === currentUserId ? ( //
                              <span className="won">낙찰 완료</span> //
                            ) : (
                              <span className="lost">패찰</span> //
                            )
                          ) : auction.highestBidder === currentUserId ? ( //
                            <span className="highest">최고 입찰 중</span> //
                          ) : (
                            <span className="outbid">상회 입찰됨</span> //
                          )}
                        </p>
                      </div>
                      {auction.endTime > currentTime && //
                        auction.highestBidder !== currentUserId && ( //
                          <div className="item-actions rebid-section">
                            {" "}
                            {/* */}
                            <input
                              type="text" //
                              inputMode="numeric" //
                              pattern="[0-9]*" //
                              className="bid-input small" //
                              placeholder={`${formatPrice(
                                //
                                auction.currentBid + 1 //
                              )} 이상`}
                              value={bidAmount[auction.id] || ""} //
                              onChange={
                                (
                                  e //
                                ) => handleBidAmountChange(e, auction.id) //
                              }
                              aria-label={`${auction.name} 재입찰 금액`} //
                            />
                            <button
                              className="action-button rebid-button" //
                              onClick={() => handleBid(auction.id)} //
                              disabled={
                                //
                                !bidAmount[auction.id] || //
                                isNaN(
                                  //
                                  parseInt(bidAmount[auction.id] || "0", 10) //
                                ) || //
                                parseInt(bidAmount[auction.id] || "0", 10) <= //
                                  auction.currentBid //
                              }
                            >
                              재입찰
                            </button>
                          </div>
                        )}
                      {auction.endTime > currentTime && //
                        auction.highestBidder === currentUserId && ( //
                          <div className="item-actions highest-bid-notice">
                            {" "}
                            {/* */}
                            <span>최고 입찰자</span> {/* */}
                          </div>
                        )}
                      {auction.endTime <= currentTime && ( //
                        <div className="item-actions">
                          {" "}
                          {/* */}
                          <span
                            className={`action-status-text ${
                              //
                              auction.highestBidder === currentUserId //
                                ? "won" //
                                : "lost" //
                            }`}
                          >
                            {auction.highestBidder === currentUserId //
                              ? "낙찰" //
                              : "패찰"}{" "}
                            {/* */}
                          </span>
                        </div>
                      )}
                    </article>
                  )
                )}
              </div>
            ) : (
              <div className="no-results-message">
                {" "}
                {/* */}
                <p>입찰한 경매가 없습니다.</p> {/* */}
                <button
                  className="action-button primary" //
                  onClick={() => setActiveTab("ongoing")} //
                >
                  경매 둘러보기
                </button>
              </div>
            )}
          </div>
        )}
        {activeTab === "completed" && ( //
          <div className="completed-auctions-content">
            {" "}
            {/* */}
            <h2>종료된 경매</h2> {/* */}
            {completedAuctions.length > 0 ? ( //
              <div className="list-view">
                {" "}
                {/* */}
                {completedAuctions.map(
                  (
                    auction //
                  ) => (
                    <article
                      key={auction.id} //
                      className={`list-item completed-item ${
                        //
                        auction.highestBidder === currentUserId //
                          ? "result-won" //
                          : "" //
                      } ${
                        auction.seller === currentUserId ? "result-sold" : "" //
                      } ${!auction.highestBidder ? "result-unsold" : ""}`} //
                    >
                      <div className="item-info">
                        {" "}
                        {/* */}
                        <h3>
                          <span style={{ marginRight: "5px" }}>
                            {" "}
                            {/* */}
                            {auction.itemIcon || "📦"} {/* */}
                          </span>
                          {auction.name} {/* */}
                        </h3>
                        <p className="item-description">
                          {" "}
                          {/* */}
                          {auction.description || "설명 없음"} {/* */}
                        </p>
                        <p className="final-result">
                          {" "}
                          {/* */}
                          {auction.highestBidder //
                            ? `최종 낙찰가: ${formatPrice(auction.currentBid)}` //
                            : `유찰됨 (시작가: ${formatPrice(
                                //
                                auction.startPrice //
                              )})`}
                        </p>
                        <p className="meta-details">
                          {" "}
                          {/* */}
                          <span>총 입찰: {auction.bidCount}회</span> | {/* */}
                          <span>
                            판매자: {/* */}
                            {auction.seller === currentUserId //
                              ? "나" //
                              : auction.sellerName || //
                                auction.seller?.substring(0, 6)}{" "}
                            {/* */}
                          </span>
                        </p>
                        {auction.highestBidder ? ( //
                          <p className="winner-info">
                            {" "}
                            {/* */}
                            낙찰자: {/* */}
                            {auction.highestBidder === currentUserId //
                              ? "나" //
                              : allUsersData?.find(
                                  //
                                  (u) => u.id === auction.highestBidder //
                                )?.name ||
                                auction.highestBidder?.substring(0, 6)}{" "}
                            {/* */}
                          </p>
                        ) : (
                          <p className="status-indicator unsold">유찰됨</p> //
                        )}
                      </div>
                      <div className="item-actions result-badge">
                        {" "}
                        {/* */}
                        {auction.highestBidder === currentUserId && ( //
                          <span className="badge won">낙찰 받음</span> //
                        )}
                        {auction.seller === currentUserId && //
                          auction.highestBidder && ( //
                            <span className="badge sold">판매 완료</span> //
                          )}
                        {auction.seller === currentUserId && //
                          !auction.highestBidder && ( //
                            <span className="badge unsold">유찰됨</span> //
                          )}
                        {auction.seller !== currentUserId && //
                          auction.highestBidder !== currentUserId && //
                          auction.highestBidder && ( //
                            <span className="badge neutral">종료됨</span> //
                          )}
                        {auction.seller !== currentUserId && //
                          auction.highestBidder !== currentUserId && //
                          !auction.highestBidder && ( //
                            <span className="badge unsold">유찰됨</span> //
                          )}
                      </div>
                    </article>
                  )
                )}
              </div>
            ) : (
              <div className="no-results-message">
                {" "}
                {/* */}
                <p>종료된 경매가 없습니다.</p> {/* */}
              </div>
            )}
          </div>
        )}
        {activeTab === "register" && ( //
          <div className="register-auction-content">
            {" "}
            {/* */}
            <h2>경매 물품 등록</h2> {/* */}
            <form className="auction-form" onSubmit={handleCreateAuction}>
              {" "}
              {/* */}
              <div className="form-group">
                {" "}
                {/* */}
                <label htmlFor="auctionAssetSelect">
                  등록할 아이템 선택 *
                </label>{" "}
                {/* */}
                <select
                  id="auctionAssetSelect" //
                  name="auctionAssetSelect" //
                  className="form-control" //
                  value={
                    //
                    selectedAssetForAuction ? selectedAssetForAuction.id : "" //
                  }
                  onChange={handleSelectAssetForAuction} //
                  required //
                  aria-describedby="assetSelectHint" //
                >
                  <option value="">-- 보유 아이템 목록 --</option> {/* */}
                  {availableItems.length > 0 && ( //
                    <optgroup label="아이템 (수량 1개 이상)">
                      {" "}
                      {/* */}
                      {availableItems.map(
                        (
                          item //
                        ) => (
                          <option key={`item-${item.id}`} value={item.id}>
                            {" "}
                            {/* */}
                            {item.icon} {item.name} (수량: {item.quantity})
                          </option>
                        )
                      )}
                    </optgroup>
                  )}
                </select>
                {availableItems.length === 0 && ( //
                  <p id="assetSelectHint" className="form-hint error">
                    {" "}
                    {/* */}
                    경매에 등록할 수 있는 아이템(수량 1개 이상)이 없습니다.
                  </p>
                )}
              </div>
              <div className="form-group">
                {" "}
                {/* */}
                <label htmlFor="name">물품명</label> {/* */}
                <input
                  type="text" //
                  id="name" //
                  name="name" //
                  className="form-control" //
                  placeholder="등록할 아이템을 선택하세요" //
                  value={newAuction.name} //
                  readOnly //
                  aria-label="선택된 물품명" //
                />
              </div>
              <div className="form-group">
                {" "}
                {/* */}
                <label htmlFor="description">물품 설명</label> {/* */}
                <textarea
                  id="description" //
                  name="description" //
                  className="form-control" //
                  rows="3" //
                  placeholder="자동 입력된 설명을 수정할 수 있습니다." //
                  value={newAuction.description} //
                  onChange={handleInputChange} //
                  aria-label="물품 설명" //
                />
              </div>
              <div className="form-group">
                {" "}
                {/* */}
                <label htmlFor="startPrice">시작가 (원) *</label> {/* */}
                <input
                  type="text" //
                  inputMode="numeric" //
                  pattern="[0-9]*" //
                  id="startPrice" //
                  name="startPrice" //
                  className="form-control" //
                  placeholder="경매 시작가를 숫자로 입력 (예: 10000)" //
                  value={newAuction.startPrice} //
                  onChange={handleInputChange} //
                  required //
                  aria-required="true" //
                  aria-label="경매 시작가" //
                />
              </div>
              <div className="form-group">
                {" "}
                {/* */}
                <label htmlFor="duration">경매 기간 *</label> {/* */}
                <select
                  id="duration" //
                  name="duration" //
                  className="form-control" //
                  value={newAuction.duration} //
                  onChange={handleInputChange} //
                  required //
                  aria-required="true" //
                  aria-label="경매 기간 선택" //
                >
                  {durationOptions} {/* */}
                </select>
              </div>
              <div className="form-actions">
                {" "}
                {/* */}
                <button
                  type="submit" //
                  className="action-button primary register-button" //
                  disabled={
                    //
                    !selectedAssetForAuction || //
                    !newAuction.startPrice || //
                    isNaN(parseFloat(newAuction.startPrice)) || //
                    parseFloat(newAuction.startPrice) <= 0 || //
                    !newAuction.duration || //
                    selectedAssetForAuction.type !== "item" //
                  }
                >
                  경매 등록
                </button>
                <button
                  type="button" //
                  className="action-button cancel-button" //
                  onClick={() => {
                    //
                    setSelectedAssetForAuction(null); //
                    setActiveTab("ongoing"); //
                  }}
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      <style>{`
        /* --- 여기에 제공된 CSS 코드를 그대로 붙여넣으세요 --- */
        /* --- Global & Layout --- */
        .auction-container {
          font-family: "Segoe UI", "Roboto", "Noto Sans KR", sans-serif;
          max-width: 1200px;
          margin: 0 auto;
          padding: 15px;
          color: #333;
          background-color: #f8f9fa; /* 밝은 배경 */
        }
        .loading-container,
        .login-required-container {
          text-align: center;
          padding: 40px 20px;
          font-size: 1.1em;
          color: #667;
        }
        .auction-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid #dee2e6;
        }
        .auction-header h1 {
          font-size: 1.8em;
          font-weight: 600;
          color: #212529;
          margin: 0;
        }
        .auction-balance {
          background-color: #e9ecef;
          padding: 8px 15px;
          border-radius: 15px;
          font-size: 0.95em;
          color: #495057;
        }
        .auction-balance .balance-amount {
          font-weight: 600;
          color: #007bff; /* 포인트 컬러 */
          margin-left: 5px;
        }
        /* --- Tabs --- */
        .tab-container {
          display: flex;
          flex-wrap: wrap;
          margin-bottom: 25px;
          border-bottom: 2px solid #dee2e6;
          gap: 8px;
        }
        .tab {
          padding: 10px 18px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          font-size: 1em;
          font-weight: 500;
          color: #6c757d;
          transition: all 0.2s ease;
          white-space: nowrap;
          position: relative;
          top: 2px; /* 하단 보더와 정렬 */
        }
        .tab:hover {
          color: #495057;
        }
        .tab.active {
          color: #007bff;
          font-weight: 600;
          border-bottom-color: #007bff;
        }
        .tab.register-tab {
          /* 등록 탭 강조 (선택 사항) */
          /* background-color: #e7f3ff; */
          /* border-radius: 6px 6px 0 0; */
        }
        .tab-content {
          padding: 0; /* 컨텐츠 영역 패딩 제거 (내부에서 관리) */
        }

        /* --- Search Bar --- */
        .search-bar {
          display: flex;
          margin-bottom: 25px;
          gap: 8px;
        }
        .search-bar input[type="text"] {
          flex-grow: 1;
          padding: 10px 15px;
          border: 1px solid #ced4da;
          border-radius: 6px;
          font-size: 1em;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .search-bar input[type="text"]:focus {
          border-color: #80bdff;
          box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
          outline: none;
        }
        .search-reset-button {
          padding: 10px 18px;
          background-color: #6c757d; /* 회색 계열 */
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          font-weight: 500;
          transition: background-color 0.2s;
        }
        .search-reset-button:hover {
          background-color: #5a6268;
        }

        /* --- Grid & Card Styles (진행 중 경매) --- */
        .auctions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        .auction-card {
          background-color: #fff;
          border-radius: 8px;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.08);
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          flex-direction: column; /* 카드 내부 요소 세로 정렬 */
        }
        .auction-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
        }
        .auction-info {
          padding: 15px;
          flex-grow: 1; /* 남은 공간 채우기 */
          display: flex;
          flex-direction: column; /* 내부 정보도 세로 정렬 */
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .card-header h3 {
          font-size: 1.15em;
          font-weight: 600;
          color: #343a40;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: calc(100% - 85px); /* 시간 공간 확보 (아이콘 고려) */
          display: flex; /* 아이콘과 텍스트 정렬 */
          align-items: center; /* 아이콘과 텍스트 세로 중앙 정렬 */
        }
        .time-left-badge {
          background-color: #f1f3f5; /* 연한 회색 */
          color: #495057;
          padding: 3px 8px;
          border-radius: 10px;
          font-size: 0.8em;
          font-weight: 500;
          white-space: nowrap;
          flex-shrink: 0; /* 줄어들지 않도록 */
        }
        .time-left-badge.error {
          /* 시간 정보 오류 시 */
          background-color: #f8d7da;
          color: #721c24;
        }
        .auction-description {
          color: #495057;
          font-size: 0.9em;
          line-height: 1.5;
          margin-bottom: 12px;
          /* 여러 줄 표시 후 말줄임 (선택 사항) */
          /* display: -webkit-box;
           -webkit-line-clamp: 2;
           -webkit-box-orient: vertical;
           overflow: hidden; */
        }
        .auction-price-details {
          display: flex;
          justify-content: space-between;
          font-size: 0.9em;
          margin-bottom: 8px;
          color: #6c757d;
        }
        .auction-price-details .price {
          font-weight: 600;
        }
        .auction-price-details .start-price {
          color: #6c757d;
        }
        .auction-price-details .current-price {
          color: #dc3545;
        } /* 현재가 강조 */
        .auction-meta {
          font-size: 0.85em;
          color: #868e96;
          margin-bottom: 10px;
        }
        .auction-meta span + span {
          margin-left: 10px;
        }
        .bid-status-indicator.highest {
          /* 최고 입찰자 표시 */
          color: #28a745; /* 녹색 */
          font-weight: 600;
          font-size: 0.9em;
          margin-top: auto; /* 카드 하단에 붙도록 */
        }
        .auction-actions {
          padding: 12px 15px;
          background-color: #f8f9fa; /* 구분되는 배경색 */
          border-top: 1px solid #e9ecef;
        }
        .owner-notice {
          /* 내 경매 표시 */
          text-align: center;
          font-size: 0.9em;
          color: #007bff;
          font-weight: 500;
        }
        .bid-input-group {
          display: flex;
          gap: 8px;
        }
        .bid-input {
          flex-grow: 1;
          padding: 8px 12px;
          border: 1px solid #ced4da;
          border-radius: 6px;
          font-size: 0.9em;
          -moz-appearance: textfield; /* Firefox 숫자 입력 화살표 제거 */
        }
        /* Chrome, Safari, Edge, Opera 숫자 입력 화살표 제거 */
        .bid-input::-webkit-outer-spin-button,
        .bid-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .bid-button {
          padding: 8px 15px;
          background-color: #28a745; /* 입찰 버튼 녹색 */
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          font-weight: 500;
          transition: background-color 0.2s;
          white-space: nowrap;
        }
        .bid-button:hover:not(:disabled) {
          background-color: #218838; /* 호버 시 약간 어둡게 */
        }
        .bid-button:disabled {
          background-color: #adb5bd;
          cursor: not-allowed;
        }

        /* --- List View Styles (내 경매, 내 입찰, 종료된 탭) --- */
        .my-auctions-content h2,
        .my-bids-content h2,
        .completed-auctions-content h2 {
          font-size: 1.5em;
          color: #343a40;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid #dee2e6;
        }
        .list-view {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        .list-item {
          background-color: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.06);
          display: flex;
          align-items: center; /* 세로 중앙 정렬 */
          padding: 15px;
          transition: box-shadow 0.2s ease;
          border-left: 4px solid transparent; /* 상태 표시용 왼쪽 보더 */
        }
        .list-item:hover {
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
        }
        .list-item .item-info {
          flex-grow: 1; /* 정보 영역이 남은 공간 차지 */
          padding-right: 15px; /* 액션 영역과 간격 */
        }
        .list-item h3 {
          font-size: 1.1em;
          font-weight: 600;
          margin: 0 0 5px 0; /* 제목 하단 마진 */
          display: flex; /* 아이콘과 텍스트 정렬 */
          align-items: center; /* 아이콘과 텍스트 세로 중앙 정렬 */
        }
        .list-item .item-description {
          font-size: 0.9em;
          color: #495057;
          margin-bottom: 8px;
          line-height: 1.4;
        }
        .list-item .price-details,
        .list-item .meta-details {
          font-size: 0.85em;
          color: #6c757d;
          margin-bottom: 5px;
        }
        .list-item .price-details span + span,
        .list-item .meta-details span + span {
          margin-left: 10px; /* 항목 간 간격 */
        }
        .list-item .price-details .price {
          font-weight: 600;
          color: #343a40;
        }
        .list-item .bid-info .price {
          /* 내 입찰가 강조 */
          color: #007bff;
          font-weight: 600;
        }
        .list-item .status-indicator {
          font-size: 0.9em;
          font-weight: 500;
          margin-top: 8px; /* 위 요소와 간격 */
        }
        /* 상태별 색상 */
        .list-item .status-indicator.ongoing {
          color: #17a2b8;
        } /* 진행중: 청록 */
        .list-item .status-indicator.completed {
          color: #6c757d;
        } /* 완료: 회색 */
        .list-item .status-indicator.sold {
          color: #007bff;
        } /* 판매: 파랑 */
        .list-item .status-indicator.unsold {
          color: #dc3545;
        } /* 유찰: 빨강 */
        .list-item .status-indicator .won {
          color: #28a745;
          font-weight: 600;
        } /* 낙찰 */
        .list-item .status-indicator .lost {
          color: #6c757d;
        } /* 패찰 */
        .list-item .status-indicator .highest {
          color: #28a745;
          font-weight: 600;
        } /* 최고입찰 */
        .list-item .status-indicator .outbid {
          color: #ffc107;
          font-weight: 600;
        } /* 상회입찰: 노랑 */

        .list-item .highest-bidder-info {
          font-size: 0.85em;
          color: #28a745; /* 녹색 */
          margin-top: 5px;
        }
        .list-item .item-actions {
          flex-shrink: 0; /* 액션 영역 크기 고정 */
          display: flex;
          align-items: center;
          gap: 10px;
        }

        /* --- Action Buttons (공통) --- */
        .action-button {
          padding: 8px 15px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          font-weight: 500;
          transition: all 0.2s ease;
          white-space: nowrap; /* 버튼 텍스트 줄바꿈 방지 */
        }
        .action-button.primary {
          background-color: #007bff;
          color: white;
        }
        .action-button.primary:hover {
          background-color: #0056b3;
        }
        .action-button.cancel-button {
          background-color: #dc3545;
          color: white;
        }
        .action-button.cancel-button:hover {
          background-color: #c82333;
        }
        .action-button.rebid-button {
          background-color: #ffc107;
          color: #212529;
        }
        .action-button.rebid-button:hover:not(:disabled) {
          background-color: #e0a800;
        }
        .action-button:disabled {
          background-color: #adb5bd;
          color: #fff;
          cursor: not-allowed;
        }

        /* --- Status Text/Badge (리스트 뷰) --- */
        .action-status-text {
          font-size: 0.9em;
          font-weight: 500;
          padding: 5px 10px;
          border-radius: 4px;
        }
        .action-status-text.sold {
          color: #007bff;
          background-color: #e7f3ff;
        }
        .action-status-text.unsold {
          color: #dc3545;
          background-color: #f8d7da;
        }
        .action-status-text.won {
          color: #28a745;
          background-color: #eaf6ec;
        }
        .action-status-text.lost {
          color: #6c757d;
          background-color: #f8f9fa;
        }
        .badge {
          /* 종료된 경매 결과 배지 */
          font-size: 0.8em;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 12px;
          color: white;
        }
        .badge.won {
          background-color: #28a745;
        }
        .badge.sold {
          background-color: #007bff;
        }
        .badge.unsold {
          background-color: #dc3545;
        }
        .badge.neutral {
          background-color: #6c757d;
        }

        /* --- My Bids Specific Styles --- */
        .my-bid-item.status-highest {
          border-left-color: #28a745;
        } /* 최고 입찰 시 왼쪽 보더 */
        .my-bid-item.status-outbid {
          border-left-color: #ffc107;
        } /* 상회 입찰 시 왼쪽 보더 */
        .my-bid-item .rebid-section {
          /* 재입찰 영역 */
          display: flex;
          flex-direction: column;
          gap: 5px;
          align-items: flex-end;
        }
        .my-bid-item .bid-input.small {
          /* 재입찰 입력칸 */
          font-size: 0.85em;
          padding: 6px 10px;
          max-width: 120px;
        }
        .my-bid-item .highest-bid-notice {
          /* 최고 입찰자 텍스트 */
          font-size: 0.9em;
          font-weight: 600;
          color: #28a745;
        }

        /* --- Completed Auctions Specific Styles --- */
        .completed-item.result-won {
          border-left-color: #28a745;
        }
        .completed-item.result-sold {
          border-left-color: #007bff;
        }
        .completed-item.result-unsold {
          border-left-color: #dc3545;
        }
        .completed-item .final-result {
          font-size: 1em;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .completed-item .winner-info {
          font-size: 0.9em;
          color: #28a745;
          font-weight: 500;
        }

        /* --- Auction Form Styles (등록 탭) --- */
        .register-auction-content h2 {
          font-size: 1.5em;
          color: #343a40;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid #dee2e6;
        }
        .auction-form {
          background-color: #fff;
          padding: 25px;
          border-radius: 8px;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
          max-width: 650px;
          margin: 0 auto;
        }
        .form-group {
          margin-bottom: 20px;
        }
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          font-size: 0.95em;
          color: #495057;
        }
        .form-control {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid #ced4da;
          border-radius: 6px;
          font-size: 1em;
          transition: border-color 0.2s, box-shadow 0.2s;
          background-color: #fff;
          box-sizing: border-box;
        }
        .form-control:focus {
          border-color: #80bdff;
          box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
          outline: none;
        }
        .form-control[readOnly] {
          background-color: #e9ecef;
          cursor: default;
        }
        textarea.form-control {
          resize: vertical;
          min-height: 90px;
        }
        select.form-control {
          appearance: none; /* 기본 화살표 제거 (커스텀 화살표 필요 시 추가) */
          background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23007bff%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
          background-repeat: no-repeat;
          background-position: right 1rem center;
          background-size: 0.7em auto;
          padding-right: 2.5rem; /* 화살표 공간 확보 */
        }
        .form-hint {
          font-size: 0.85em;
          color: #6c757d;
          margin-top: 5px;
        }
        .form-hint.error {
          color: #dc3545;
          font-weight: 500;
        }
        .form-actions {
          display: flex;
          gap: 15px;
          margin-top: 30px;
        }
        .form-actions .action-button {
          flex: 1;
          padding: 12px 15px;
          font-size: 1em;
        }
        .form-actions .register-button {
          background-color: #007bff;
          color: white;
        }
        .form-actions .register-button:hover:not(:disabled) {
          background-color: #0056b3;
        }
        .form-actions .cancel-button {
          background-color: #6c757d;
          color: white;
        }
        .form-actions .cancel-button:hover {
          background-color: #5a6268;
        }

        /* --- 알림 스타일 --- */
        .notification {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          padding: 8px 18px;
          font-size: 0.9em;
          border-radius: 6px;
          color: white;
          font-weight: 500;
          animation: fadeInOut 3.5s ease-in-out forwards;
          z-index: 1001;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .notification.success {
          background-color: #28a745;
        }
        .notification.error {
          background-color: #dc3545;
        }
        .notification.info {
          background-color: #17a2b8;
        }
        @keyframes fadeInOut {
          0% {
            opacity: 0;
            transform: translate(-50%, 15px);
          }
          10% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          90% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -5px);
          }
        }

        /* --- No results message --- */
        .no-results-message {
          text-align: center;
          padding: 30px 20px;
          color: #6c757d;
          background-color: #fff;
          border-radius: 8px;
          margin-top: 20px;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.06);
        }
        .no-results-message p {
          margin: 0 0 15px 0;
        }

        /* --- 반응형 스타일 --- */
        @media (max-width: 768px) {
          .auction-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
          .auction-balance {
            width: 100%;
            text-align: right;
          }
          .auctions-grid {
            grid-template-columns: 1fr;
            gap: 15px;
          }
          .list-item {
            flex-direction: column;
            align-items: flex-start;
            padding: 12px;
          }
          .list-item .item-info {
            padding-right: 0;
          }
          .list-item .item-actions {
            width: 100%;
            margin-top: 10px;
            justify-content: flex-end;
          }
          .tab {
            padding: 8px 12px;
            font-size: 0.9em;
          }
          .auction-form {
            padding: 20px;
          }
          .form-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
