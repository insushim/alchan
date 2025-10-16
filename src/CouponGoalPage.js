// src/CouponGoalPage.js - 쿠폰 목표 전용 페이지
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import {
  db,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  functions,
  httpsCallable,
  writeBatch,
  serverTimestamp,
  runTransaction,
} from "./firebase";
import CouponGoal from "./CouponGoal";
import LoginWarning from "./LoginWarning";
import DonateCouponModal from "./DonateCouponModal";
import SellCouponModal from "./SellCouponModal";
import GiftCouponModal from "./GiftCouponModal";
import DonationHistoryModal from "./DonationHistoryModal";

export default function CouponGoalPage() {
  const {
    user,
    userDoc,
    users,
    classmates,
    allClassMembers,
    loading: authLoading,
  } = useAuth();

  const userId = user?.uid;
  const currentUserClassCode = userDoc?.classCode;

  const [assetsLoading, setAssetsLoading] = useState(true);
  const loadingRef = useRef(false);
  const [goalDonations, setGoalDonations] = useState([]);

  const donateCouponFunction = httpsCallable(functions, 'donateCoupon');
  const sellCouponFunction = httpsCallable(functions, 'sellCoupon');
  const giftCouponFunction = httpsCallable(functions, 'giftCoupon');

  const CACHE_DURATION = 5 * 60 * 1000;

  const currentGoalId = currentUserClassCode
    ? `${currentUserClassCode}_goal`
    : null;

  const [classCouponGoal, setClassCouponGoal] = useState(1000);
  const [couponValue, setCouponValue] = useState(1000);
  const [goalProgress, setGoalProgress] = useState(0);
  const [myContribution, setMyContribution] = useState(0);
  const [goalAchieved, setGoalAchieved] = useState(false);
  const [isResettingGoal, setIsResettingGoal] = useState(false);

  const [showDonateModal, setShowDonateModal] = useState(false);
  const [showSellCouponModal, setShowSellCouponModal] = useState(false);
  const [sellAmount, setSellAmount] = useState("");
  const [showGiftCouponModal, setShowGiftCouponModal] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [showDonationHistoryModal, setShowDonationHistoryModal] = useState(false);

  const safeTimestampToDate = (timestamp) => {
    try {
      if (!timestamp) return new Date();
      if (timestamp instanceof Date) {
        return isNaN(timestamp.getTime()) ? new Date() : timestamp;
      }
      if (timestamp && typeof timestamp.toDate === 'function') {
        const date = timestamp.toDate();
        return isNaN(date.getTime()) ? new Date() : date;
      }
      if (timestamp && timestamp.seconds) {
        const date = new Date(timestamp.seconds * 1000);
        return isNaN(date.getTime()) ? new Date() : date;
      }
      if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? new Date() : date;
      }
      if (typeof timestamp === 'number') {
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? new Date() : date;
      }
      return new Date();
    } catch (error) {
      return new Date();
    }
  };

  const getCachedFirestoreData = (key) => {
    try {
      const cached = localStorage.getItem(`firestore_cache_${key}_${userId}`);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          return data;
        }
      }
    } catch (error) {
    }
    return null;
  };

  const setCachedFirestoreData = (key, data) => {
    try {
      const cacheItem = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(`firestore_cache_${key}_${userId}`, JSON.stringify(cacheItem));
    } catch (error) {
    }
  };

  const loadGoalData = useCallback(async () => {
    if (!userId || !currentUserClassCode || !currentGoalId) {
      setAssetsLoading(false);
      return;
    }

    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    setAssetsLoading(true);

    try {
      const cacheKey = `goal_${currentGoalId}`;
      const cachedData = getCachedFirestoreData(cacheKey);

      if (cachedData) {
        setClassCouponGoal(cachedData.targetAmount || 1000);
        setGoalProgress(cachedData.progress || 0);
        setGoalDonations(cachedData.donations || []);
        setAssetsLoading(false);
        loadingRef.current = false;
        return;
      }

      const goalDocRef = doc(db, "goals", currentGoalId);
      const goalDocSnap = await getDoc(goalDocRef);

      if (goalDocSnap.exists()) {
        const goalData = goalDocSnap.data();
        setClassCouponGoal(goalData.targetAmount || 1000);
        setGoalProgress(goalData.progress || 0);
        setGoalDonations(goalData.donations || []);

        setCachedFirestoreData(cacheKey, goalData);
      } else {
        await runTransaction(db, async (transaction) => {
          const goalDoc = await transaction.get(goalDocRef);
          if (!goalDoc.exists()) {
            const defaultGoalData = {
              classCode: currentUserClassCode,
              targetAmount: 1000,
              progress: 0,
              donations: [],
              donationCount: 0,
              title: `${currentUserClassCode} 학급 목표`,
              description: `${currentUserClassCode} 학급의 쿠폰 목표입니다.`,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              createdBy: userId,
            };
            transaction.set(goalDocRef, defaultGoalData);
            setCachedFirestoreData(cacheKey, defaultGoalData);
          }
        });
      }
    } catch (error) {
      console.error('[CouponGoalPage] 목표 데이터 로드 실패:', error);
    } finally {
      setAssetsLoading(false);
      loadingRef.current = false;
    }
  }, [userId, currentUserClassCode, currentGoalId]);

  useEffect(() => {
    if (!authLoading && user && currentUserClassCode) {
      loadGoalData();
    } else if (!authLoading && !user) {
      setAssetsLoading(false);
    } else if (authLoading) {
      setAssetsLoading(true);
    }
  }, [authLoading, user, currentUserClassCode, loadGoalData]);

  useEffect(() => {
    if (userDoc) {
      setMyContribution(userDoc.myContribution || 0);
    }
  }, [userDoc]);

  useEffect(() => {
    setGoalAchieved(goalProgress >= classCouponGoal && classCouponGoal > 0);
  }, [goalProgress, classCouponGoal]);

  const handleDonateCoupon = async (amount, memo) => {
    if (!userId || !currentUserClassCode) {
      alert("사용자 또는 학급 정보가 없어 기부할 수 없습니다.");
      return false;
    }

    const donationAmount = parseInt(amount, 10);
    if (isNaN(donationAmount) || donationAmount <= 0) {
      alert("유효한 쿠폰 수량을 입력해주세요.");
      return false;
    }

    setAssetsLoading(true);
    try {
      await donateCouponFunction({ amount: donationAmount, message: memo });
      alert(`${donationAmount} 쿠폰 기부 완료!`);
      setShowDonateModal(false);
      loadGoalData();
      return true;
    } catch (error) {
      alert(`기부 오류: ${error.message}`);
      return false;
    } finally {
      setAssetsLoading(false);
    }
  };

  const forceRefreshGoalData = async () => {
    if (!currentGoalId || !currentUserClassCode) {
      alert("학급 정보가 없습니다.");
      return;
    }

    setAssetsLoading(true);

    try {
      localStorage.removeItem(`firestore_cache_goal_${currentGoalId}_${userId}`);

      const goalDocRef = doc(db, "goals", currentGoalId);
      const goalDocSnap = await getDoc(goalDocRef);

      if (goalDocSnap.exists()) {
        const latestGoalData = goalDocSnap.data();

        setClassCouponGoal(Number(latestGoalData.targetAmount) || 1000);
        setGoalProgress(Number(latestGoalData.progress) || 0);

        const freshDonations = Array.isArray(latestGoalData.donations)
          ? latestGoalData.donations.map((donation) => {
              let processedTimestamp;
              if (donation.timestamp && donation.timestamp.toDate) {
                processedTimestamp = donation.timestamp.toDate().toISOString();
              } else if (donation.timestamp && donation.timestamp.seconds) {
                processedTimestamp = new Date(donation.timestamp.seconds * 1000).toISOString();
              } else if (donation.timestampISO) {
                processedTimestamp = donation.timestampISO;
              } else if (typeof donation.timestamp === 'string') {
                processedTimestamp = donation.timestamp;
              } else {
                processedTimestamp = new Date().toISOString();
              }

              return {
                ...donation,
                amount: Number(donation.amount) || 0,
                timestamp: processedTimestamp,
                userId: donation.userId || '',
                userName: donation.userName || '알 수 없는 사용자',
                message: donation.message || '',
                classCode: donation.classCode || currentUserClassCode,
              };
            })
          : [];

        setGoalDonations(freshDonations);
        setCachedFirestoreData(`goal_${currentGoalId}`, latestGoalData);

        alert(`목표 데이터 새로고침 완료!\n목표 진행률: ${latestGoalData.progress || 0}/${latestGoalData.targetAmount || 1000}\n기부 내역: ${freshDonations.length}개`);
      } else {
        alert("목표 문서를 찾을 수 없습니다. 관리자에게 문의해주세요.");
      }
    } catch (error) {
      alert(`데이터 새로고침 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setAssetsLoading(false);
    }
  };

  const showDebugInfo = () => {
    const debugInfo = {
      userId,
      currentUserClassCode,
      currentGoalId,
      goalProgress,
      classCouponGoal,
      myContribution,
      donationsCount: goalDonations.length,
      donations: goalDonations,
      userCoupons: userDoc?.coupons,
      userCash: userDoc?.cash,
    };

    console.log('[CouponGoalPage Debug]', debugInfo);
    alert(`디버그 정보가 콘솔에 출력되었습니다.\n기부 내역: ${goalDonations.length}개\n목표 진행률: ${goalProgress}/${classCouponGoal}`);
  };

  const resetCouponGoal = async () => {
    if (!userDoc?.isAdmin && !userDoc?.isSuperAdmin) {
      alert("관리자만 초기화 가능합니다.");
      return;
    }
    if (!currentUserClassCode || !currentGoalId) {
      alert("학급 코드나 목표 정보가 없어 초기화할 수 없습니다.");
      return;
    }
    if (!window.confirm(`정말로 ${currentUserClassCode} 학급의 쿠폰 목표와 기여 기록을 초기화하시겠습니까?`)) {
      return;
    }

    setIsResettingGoal(true);
    try {
      const batch = writeBatch(db);
      const goalRef = doc(db, "goals", currentGoalId);

      const usersQuery = query(
        collection(db, "users"),
        where("classCode", "==", currentUserClassCode)
      );
      const usersSnapshot = await getDocs(usersQuery);

      usersSnapshot.forEach((userDocument) => {
        const userRef = doc(db, "users", userDocument.id);
        batch.update(userRef, {
          myContribution: 0,
          updatedAt: serverTimestamp(),
        });
      });

      batch.update(goalRef, {
        progress: 0,
        donations: [],
        donationCount: 0,
        updatedAt: serverTimestamp(),
        resetAt: serverTimestamp(),
        resetBy: userId,
      });

      await batch.commit();

      localStorage.removeItem(`goalDonationHistory_${currentUserClassCode}_goal`);
      localStorage.removeItem(`firestore_cache_goal_${currentGoalId}_${userId}`);

      setMyContribution(0);
      setGoalProgress(0);
      setGoalDonations([]);

      alert(`학급(${currentUserClassCode})의 쿠폰 목표와 기여 기록이 초기화되었습니다.`);
    } catch (error) {
      alert(`목표 초기화 오류: ${error.message}`);
    } finally {
      setIsResettingGoal(false);
    }
  };

  const handleSellCoupon = async () => {
    const amount = parseInt(sellAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      alert("유효한 수량을 입력해주세요.");
      return;
    }

    setAssetsLoading(true);
    try {
      await sellCouponFunction({ amount });
      alert(`${amount}개 쿠폰을 판매했습니다.`);
      setShowSellCouponModal(false);
      setSellAmount("");
      loadGoalData();
    } catch (error) {
      alert(`판매 오류: ${error.message}`);
    } finally {
      setAssetsLoading(false);
    }
  };

  const handleGiftCoupon = async () => {
    const recipientUser = users.find((u) => u.id === giftRecipient);
    const amount = parseInt(giftAmount, 10);

    if (!recipientUser) {
      alert("받는 사람을 선택해주세요.");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      alert("올바른 수량을 입력해주세요.");
      return;
    }

    if (window.confirm(`${recipientUser.name}님에게 쿠폰 ${amount}개를 선물하시겠습니까?`)) {
      setAssetsLoading(true);
      try {
        await giftCouponFunction({ recipientId: recipientUser.id, amount, message: "" });
        alert("쿠폰 선물이 완료되었습니다.");
        setShowGiftCouponModal(false);
        setGiftRecipient("");
        setGiftAmount("");
        loadGoalData();
      } catch (error) {
        alert(`선물 오류: ${error.message}`);
      } finally {
        setAssetsLoading(false);
      }
    }
  };

  if (authLoading || assetsLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "80vh",
          fontSize: "1.2em",
          color: "#4f46e5",
        }}
      >
        쿠폰 목표 정보를 불러오는 중... ⏳
      </div>
    );
  }

  if (!user) {
    return <LoginWarning />;
  }

  if (!currentUserClassCode && !authLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "80vh",
          fontSize: "1.2em",
          color: "#ef4444",
        }}
      >
        학급 코드 정보가 없습니다. 관리자에게 문의하여 학급 코드를 할당받으세요.
      </div>
    );
  }

  return (
    <div
      className="coupon-goal-page-container"
      style={{
        padding: "20px",
        maxWidth: "1200px",
        margin: "0 auto",
        fontFamily: "'Noto Sans KR', sans-serif",
      }}
    >
      <h2
        style={{
          fontSize: "24px",
          fontWeight: "bold",
          color: "#10b981",
          borderBottom: "2px solid #a7f3d0",
          paddingBottom: "10px",
          marginBottom: "20px",
        }}
      >
        🎯 쿠폰 목표 (학급: {currentUserClassCode})
      </h2>

      {currentUserClassCode && currentGoalId && (
        <>
          <CouponGoal
            classCouponGoal={classCouponGoal}
            goalProgress={goalProgress}
            myContribution={myContribution}
            currentCoupons={Number(userDoc?.coupons) || 0}
            couponValue={couponValue}
            setShowDonateModal={setShowDonateModal}
            setShowSellCouponModal={setShowSellCouponModal}
            setShowDonationHistoryModal={setShowDonationHistoryModal}
            setShowGiftCouponModal={setShowGiftCouponModal}
            goalAchieved={goalAchieved}
            resetGoalButton={
              userDoc?.isAdmin || userDoc?.isSuperAdmin ? resetCouponGoal : null
            }
            isResettingGoal={isResettingGoal}
          />

          <div
            style={{
              marginTop: "20px",
              padding: "15px",
              backgroundColor: "#f8f9fa",
              borderRadius: "8px",
              border: "1px solid #e9ecef",
            }}
          >
            <h4
              style={{
                fontSize: "14px",
                color: "#6c757d",
                marginBottom: "10px",
                fontWeight: "600",
              }}
            >
              🔧 데이터 관리 도구
            </h4>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={forceRefreshGoalData}
                disabled={assetsLoading}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#17a2b8",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: "500",
                }}
              >
                📊 목표 데이터 새로고침
              </button>
              <button
                onClick={showDebugInfo}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: "500",
                }}
              >
                🔍 디버그 정보 확인
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  alert("로컬 캐시가 모두 삭제되었습니다. 페이지를 새로고침해주세요.");
                  window.location.reload();
                }}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#dc3545",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: "500",
                }}
              >
                🗑️ 캐시 삭제 후 새로고침
              </button>
            </div>
            <p
              style={{
                fontSize: "11px",
                color: "#868e96",
                marginTop: "8px",
                marginBottom: "0",
                lineHeight: "1.4",
              }}
            >
              • 기부 내역이 표시되지 않으면 "목표 데이터 새로고침" 버튼을 클릭하세요
              <br />
              • 문제가 지속되면 "캐시 삭제 후 새로고침"을 시도해보세요
              <br />• 현재 상태: 기부 내역 {goalDonations.length}개, 목표 진행률{" "}
              {goalProgress}/{classCouponGoal}
            </p>
          </div>
        </>
      )}

      {showDonateModal && currentUserClassCode && currentGoalId && (
        <DonateCouponModal
          showDonateModal={showDonateModal}
          setShowDonateModal={setShowDonateModal}
          currentCoupons={Number(userDoc?.coupons) || 0}
          onDonate={handleDonateCoupon}
          classCode={currentUserClassCode}
        />
      )}
      {showSellCouponModal && (
        <SellCouponModal
          showSellCouponModal={showSellCouponModal}
          setShowSellCouponModal={setShowSellCouponModal}
          currentCoupons={Number(userDoc?.coupons) || 0}
          couponValue={couponValue}
          sellAmount={sellAmount}
          setSellAmount={setSellAmount}
          SellCoupon={handleSellCoupon}
        />
      )}
      {showGiftCouponModal && (
        <GiftCouponModal
          showGiftCouponModal={showGiftCouponModal}
          setShowGiftCouponModal={setShowGiftCouponModal}
          recipients={classmates}
          giftRecipient={giftRecipient}
          setGiftRecipient={setGiftRecipient}
          giftAmount={giftAmount}
          setGiftAmount={setGiftAmount}
          handleGiftCoupon={handleGiftCoupon}
          currentCoupons={Number(userDoc?.coupons) || 0}
          userId={userId}
        />
      )}
      {showDonationHistoryModal && currentUserClassCode && currentGoalId && (
        <DonationHistoryModal
          showDonationHistoryModal={showDonationHistoryModal}
          setShowDonationHistoryModal={setShowDonationHistoryModal}
          students={allClassMembers || []}
          classCode={currentUserClassCode}
          donations={goalDonations}
        />
      )}
    </div>
  );
}
