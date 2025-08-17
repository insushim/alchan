// src/MyAssets.js
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import {
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  increment,
  writeBatch,
  arrayUnion,
  getDocs,
  collection,
  query,
  where,
} from "./firebase";

import CouponGoal from "./CouponGoal";
import LoginWarning from "./LoginWarning";
import DonateCouponModal from "./DonateCouponModal";
import SellCouponModal from "./SellCouponModal";
import GiftCouponModal from "./GiftCouponModal";
import DonationHistoryModal from "./DonationHistoryModal";
import TransferModal from "./TransferModal";

export default function MyAssets() {
  const {
    user,
    userDoc,
    users,
    loading: authLoading,
    updateUser: updateUserInAuth,
    addCashToUserById,
    deductCash: deductCurrentUserCash,
  } = useAuth();

  const userId = user?.uid;
  const userName =
    userDoc?.name || userDoc?.nickname || user?.displayName || "사용자";
  const currentUserClassCode = userDoc?.classCode; // 현재 사용자의 학급 코드

  const [assetsLoading, setAssetsLoading] = useState(true);
  const [parkingBalance, setParkingBalance] = useState(0);
  const [loans, setLoans] = useState([]);
  const [realEstateAssets, setRealEstateAssets] = useState([]);
  const [totalNetAssets, setTotalNetAssets] = useState(0);

  // 🔥 학급별 목표 ID 생성 - mainGoal 대신 {classCode}_goal 형태 사용
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
  const [showDonationHistoryModal, setShowDonationHistoryModal] =
    useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  const loadMyAssetsData = useCallback(async () => {
    if (authLoading) {
      console.log("[MyAssets] 데이터 로드 대기: AuthContext 로딩 중...");
      setAssetsLoading(true);
      return;
    }

    if (!userId || !userDoc || !db) {
      console.log("[MyAssets] loadMyAssetsData: 필수 정보 부족.", {
        userIdExists: !!userId,
        userDocExists: !!userDoc,
        dbExists: !!db,
      });
      setAssetsLoading(false);
      setParkingBalance(0);
      setLoans([]);
      setRealEstateAssets([]);
      setTotalNetAssets(0);
      setMyContribution(0);
      return;
    }

    if (!currentUserClassCode) {
      console.warn(
        "[MyAssets] 학급 코드가 없어 일부 데이터 로드를 건너뜁니다."
      );
    }

    console.log(
      "[MyAssets] 데이터 로드 시작 (userDoc, classCode 사용 가능):",
      userId,
      "classCode:",
      currentUserClassCode,
      "goalId:",
      currentGoalId
    );

    setAssetsLoading(true);

    try {
      // 로컬스토리지 기반 데이터 로드 (권한 문제 없음)
      const savedParkingAccount = localStorage.getItem(
        `parkingAccount_${userId}`
      );
      setParkingBalance(
        savedParkingAccount ? JSON.parse(savedParkingAccount).balance || 0 : 0
      );

      const savedUserProducts = localStorage.getItem(`userProducts_${userId}`);
      setLoans(
        savedUserProducts ? JSON.parse(savedUserProducts).loans || [] : []
      );

      const savedProperties = localStorage.getItem("realEstateProperties");
      setRealEstateAssets(
        savedProperties
          ? JSON.parse(savedProperties).filter((p) => p.ownerId === userId)
          : []
      );

      // 쿠폰 가치 로드 (권한 오류 처리 추가)
      try {
        const settingsDocRef = doc(db, "settings", "mainSettings");
        const settingsDocSnap = await getDoc(settingsDocRef);

        if (settingsDocSnap.exists()) {
          setCouponValue(settingsDocSnap.data().couponValue || 1000);
          console.log(
            "[MyAssets] 쿠폰 가치 로드 성공:",
            settingsDocSnap.data().couponValue
          );
        } else {
          console.log("[MyAssets] 설정 문서가 존재하지 않음, 기본값 사용");
          setCouponValue(1000);

          // 문서 생성 시도 (권한이 있는 경우에만)
          try {
            await setDoc(settingsDocRef, {
              couponValue: 1000,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            console.log("[MyAssets] 기본 설정 문서 생성 완료");
          } catch (createError) {
            console.warn(
              "[MyAssets] 설정 문서 생성 권한 없음:",
              createError.message
            );
          }
        }
      } catch (settingsError) {
        console.error(
          "[MyAssets] 설정 로드 오류 (권한 문제일 수 있음):",
          settingsError.message
        );
        setCouponValue(1000); // 기본값 사용

        if (settingsError.code === "permission-denied") {
          console.warn(
            "[MyAssets] 설정 정보 접근 권한이 없습니다. 기본값을 사용합니다."
          );
        }
      }

      // 학급별 목표 로드 (권한 오류 처리 추가)
      if (currentUserClassCode && currentGoalId) {
        try {
          const goalDocRef = doc(db, "goals", currentGoalId);
          const goalDocSnap = await getDoc(goalDocRef);

          if (goalDocSnap.exists()) {
            const goalData = goalDocSnap.data();

            if (goalData.classCode === currentUserClassCode) {
              setClassCouponGoal(goalData.targetAmount || 1000);
              setGoalProgress(goalData.progress || 0);
              console.log(
                `[MyAssets] 학급(${currentUserClassCode}) 목표 로드 완료:`,
                {
                  targetAmount: goalData.targetAmount,
                  progress: goalData.progress,
                }
              );
            } else {
              console.warn(
                `[MyAssets] 목표의 학급 코드가 일치하지 않음: ${goalData.classCode} vs ${currentUserClassCode}`
              );

              // 기본 목표 생성 시도
              try {
                await createDefaultGoalForClass(
                  currentUserClassCode,
                  currentGoalId
                );
                setClassCouponGoal(1000);
                setGoalProgress(0);
              } catch (createError) {
                console.error(
                  "[MyAssets] 기본 목표 생성 실패:",
                  createError.message
                );
                setClassCouponGoal(1000);
                setGoalProgress(0);
              }
            }
          } else {
            console.log(
              `[MyAssets] 학급(${currentUserClassCode})의 목표 문서 없음. 기본 목표 생성 시도.`
            );

            try {
              await createDefaultGoalForClass(
                currentUserClassCode,
                currentGoalId
              );
              setClassCouponGoal(1000);
              setGoalProgress(0);
              console.log("[MyAssets] 기본 목표 생성 완료");
            } catch (createError) {
              console.error(
                "[MyAssets] 기본 목표 생성 실패:",
                createError.message
              );
              setClassCouponGoal(1000);
              setGoalProgress(0);

              if (createError.code === "permission-denied") {
                console.warn(
                  "[MyAssets] 목표 생성 권한이 없습니다. 기본값을 사용합니다."
                );
              }
            }
          }
        } catch (goalError) {
          console.error(
            "[MyAssets] 목표 로드 오류 (권한 문제일 수 있음):",
            goalError.message
          );
          setClassCouponGoal(1000);
          setGoalProgress(0);

          if (goalError.code === "permission-denied") {
            console.warn(
              "[MyAssets] 목표 정보 접근 권한이 없습니다. 기본값을 사용합니다."
            );
          }
        }
      } else {
        // 학급 코드가 없으면 목표 관련 정보는 기본값으로
        setClassCouponGoal(1000);
        setGoalProgress(0);
      }

      setMyContribution(userDoc.myContribution || 0);
    } catch (error) {
      console.error("[MyAssets] 전체 데이터 로드 오류:", error);

      // 권한 오류인 경우 사용자에게 알림
      if (error.code === "permission-denied") {
        console.warn(
          "[MyAssets] 데이터 접근 권한이 없습니다. 일부 기능이 제한될 수 있습니다."
        );
      }
    } finally {
      setAssetsLoading(false);
      console.log(
        "[MyAssets] 데이터 로드 완료. 현금:",
        userDoc.cash,
        "파킹:",
        parkingBalance
      );
    }
  }, [userId, userDoc, db, currentGoalId, currentUserClassCode, authLoading]);

  // 🔥 학급별 기본 목표 생성 함수
  const createDefaultGoalForClass = async (classCode, goalId) => {
    try {
      const goalDocRef = doc(db, "goals", goalId);
      const defaultGoalData = {
        classCode: classCode,
        targetAmount: 1000,
        progress: 0,
        donations: [],
        donationCount: 0,
        title: `${classCode} 학급 목표`,
        description: `${classCode} 학급의 쿠폰 목표입니다.`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      };

      await setDoc(goalDocRef, defaultGoalData);
      console.log(`[MyAssets] 학급(${classCode}) 기본 목표 생성 완료:`, goalId);
    } catch (error) {
      console.error(
        `[MyAssets] 학급(${classCode}) 기본 목표 생성 오류:`,
        error
      );
      throw error; // 오류를 다시 던져서 호출자가 처리할 수 있도록
    }
  };

  useEffect(() => {
    console.log("[MyAssets] Auth 상태 또는 userDoc 변경 감지:", {
      authLoading,
      user: !!user,
      userDocExists: !!userDoc,
      classCode: userDoc?.classCode,
      currentGoalId,
    });
    if (!authLoading && user) {
      // user가 있으면 userDoc 로드를 기다리거나 이미 로드됨
      loadMyAssetsData();
    } else if (!authLoading && !user) {
      // 로그아웃 상태
      setAssetsLoading(false);
      setParkingBalance(0);
      setLoans([]);
      setRealEstateAssets([]);
      setTotalNetAssets(0);
      setMyContribution(0);
      setClassCouponGoal(1000);
      setGoalProgress(0);
      setCouponValue(1000); // 목표 관련 상태도 초기화
    } else if (authLoading) {
      // AuthContext가 아직 로딩 중
      setAssetsLoading(true);
    }
  }, [authLoading, user, userDoc, loadMyAssetsData]);

  useEffect(() => {
    const cashValue = userDoc?.cash || 0;
    const couponMonetaryValue = (userDoc?.coupons || 0) * couponValue; // 변수명 명확화
    const realEstateValue = realEstateAssets.reduce(
      (sum, asset) => sum + (asset.price || 0),
      0
    );
    const loanTotal = loans.reduce(
      (sum, loan) => sum + (loan.remainingPrincipal || 0),
      0
    );
    const calculatedTotalAssets =
      cashValue +
      couponMonetaryValue +
      parkingBalance +
      realEstateValue -
      loanTotal;
    setTotalNetAssets(calculatedTotalAssets);
  }, [
    userDoc?.cash,
    userDoc?.coupons,
    couponValue,
    parkingBalance,
    realEstateAssets,
    loans,
  ]);

  useEffect(() => {
    setGoalAchieved(goalProgress >= classCouponGoal && classCouponGoal > 0);
  }, [goalProgress, classCouponGoal]);

  const handleDonateCoupon = async (amount, memo) => {
    if (
      !userDoc ||
      !userId ||
      !db ||
      typeof updateUserInAuth !== "function" ||
      !currentUserClassCode ||
      !currentGoalId
    ) {
      alert("필수 정보(사용자, 학급코드, DB) 또는 기능이 준비되지 않았습니다.");
      return false;
    }

    const donationAmount = parseInt(amount, 10);
    if (isNaN(donationAmount) || donationAmount <= 0) {
      alert("유효한 쿠폰 수량을 입력해주세요.");
      return false;
    }
    if (donationAmount > (userDoc.coupons || 0)) {
      alert("보유 쿠폰이 부족합니다.");
      return false;
    }

    setAssetsLoading(true);
    try {
      const batch = writeBatch(db);
      // 🔥 학급별 목표 문서 참조
      const goalRef = doc(db, "goals", currentGoalId);
      const goalSnap = await getDoc(goalRef);

      if (!goalSnap.exists()) {
        // 목표 문서가 없으면 생성
        await createDefaultGoalForClass(currentUserClassCode, currentGoalId);
      } else {
        const goalData = goalSnap.data();
        if (goalData.classCode !== currentUserClassCode) {
          alert("학급 목표 정보가 일치하지 않습니다.");
          setAssetsLoading(false);
          return false;
        }
      }

      const newDonationRecord = {
        userId,
        userName,
        amount: donationAmount,
        message: memo || "",
        timestamp: new Date().toISOString(),
        classCode: currentUserClassCode,
      };

      batch.update(goalRef, {
        progress: increment(donationAmount),
        donationCount: increment(1),
        donations: arrayUnion(newDonationRecord),
        updatedAt: serverTimestamp(),
      });

      // 🔥 localStorage 기부 내역 키를 학급별로 관리
      const goalHistoryKey = `goalDonationHistory_${currentUserClassCode}_goal`;
      try {
        const historyString = localStorage.getItem(goalHistoryKey);
        let currentHistory = historyString
          ? JSON.parse(historyString) || []
          : [];
        currentHistory.push({
          userId,
          amount: donationAmount,
          memo: memo || "",
          timestamp: new Date().toISOString(),
        });
        localStorage.setItem(goalHistoryKey, JSON.stringify(currentHistory));
      } catch (localStorageErr) {
        console.error("localStorage 기부 내역 동기화 오류:", localStorageErr);
      }

      await batch.commit();

      const userUpdateSuccess = await updateUserInAuth({
        coupons: increment(-donationAmount),
        myContribution: increment(donationAmount),
      });

      if (userUpdateSuccess) {
        alert(`${donationAmount} 쿠폰 기부 완료!`);
        setShowDonateModal(false);
        setGoalProgress((prev) => prev + donationAmount);
        setMyContribution((prev) => prev + donationAmount);
        return true;
      } else {
        alert("기부 실패 (사용자 정보 업데이트 실패).");
        return false;
      }
    } catch (error) {
      console.error("쿠폰 기부 오류:", error);
      alert(`기부 오류: ${error.message}`);
      return false;
    } finally {
      setAssetsLoading(false);
    }
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
    if (
      !window.confirm(
        `정말로 ${currentUserClassCode} 학급의 쿠폰 목표와 기여 기록을 초기화하시겠습니까?`
      )
    )
      return;

    setIsResettingGoal(true);
    try {
      const batch = writeBatch(db);
      // 🔥 학급별 목표 문서 참조
      const goalRef = doc(db, "goals", currentGoalId);

      // 해당 학급의 사용자들만 기여도 초기화
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

      // 🔥 localStorage 키도 학급별로 관리
      localStorage.removeItem(
        `goalDonationHistory_${currentUserClassCode}_goal`
      );

      await batch.commit();

      // 현재 로그인한 사용자의 myContribution 상태 즉시 업데이트
      setMyContribution(0);
      setGoalProgress(0);

      alert(
        `학급(${currentUserClassCode})의 쿠폰 목표와 기여 기록이 초기화되었습니다.`
      );
    } catch (error) {
      console.error("쿠폰 목표 초기화 오류:", error);
      alert(`목표 초기화 오류: ${error.message}`);
    } finally {
      setIsResettingGoal(false);
    }
  };

  const handleSellCoupon = async () => {
    if (!userDoc || !userId || !db || typeof updateUserInAuth !== "function") {
      alert("정보가 부족합니다.");
      return;
    }
    const amount = parseInt(sellAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      alert("유효한 수량을 입력해주세요.");
      return;
    }
    if (amount > (userDoc.coupons || 0)) {
      alert("쿠폰이 부족합니다.");
      return;
    }
    setAssetsLoading(true);
    try {
      const totalValue = amount * couponValue;
      const success = await updateUserInAuth({
        coupons: increment(-amount),
        cash: increment(totalValue),
      });
      if (success) {
        alert(
          `${amount}쿠폰을 ${totalValue.toLocaleString()}원에 판매했습니다.`
        );
        setShowSellCouponModal(false);
        setSellAmount("");
      } else {
        alert("쿠폰 판매에 실패했습니다.");
      }
    } catch (error) {
      console.error("쿠폰 판매 오류:", error);
      alert("판매 오류: " + error.message);
    } finally {
      setAssetsLoading(false);
    }
  };

  const handleGiftCoupon = async () => {
    if (
      !userDoc ||
      !userId ||
      !db ||
      !users ||
      typeof updateUserInAuth !== "function"
    ) {
      alert("정보가 부족합니다.");
      return;
    }
    const recipientUser = users.find((u) => u.id === giftRecipient);
    const amount = parseInt(giftAmount, 10);
    if (!recipientUser) {
      alert("받는 사람을 선택해주세요.");
      return;
    }
    if (recipientUser.id === userId) {
      alert("자신에게는 선물할 수 없습니다.");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      alert("올바른 수량을 입력해주세요.");
      return;
    }
    if (amount > (userDoc.coupons || 0)) {
      alert("쿠폰이 부족합니다.");
      return;
    }

    if (
      window.confirm(
        `${
          recipientUser.name || recipientUser.nickname || recipientUser.id
        }님에게 쿠폰 ${amount}개를 선물하시겠습니까?`
      )
    ) {
      setAssetsLoading(true);
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, "users", userId), {
          coupons: increment(-amount),
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, "users", recipientUser.id), {
          coupons: increment(amount),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();

        alert("쿠폰 선물이 완료되었습니다.");
        setShowGiftCouponModal(false);
        setGiftRecipient("");
        setGiftAmount("");
      } catch (error) {
        console.error("쿠폰 선물 오류:", error);
        alert("선물 오류: " + error.message);
      } finally {
        setAssetsLoading(false);
      }
    }
  };

  const handleTransfer = async () => {
    if (
      !userDoc ||
      !userId ||
      !db ||
      !users ||
      !deductCurrentUserCash ||
      !addCashToUserById
    ) {
      alert("정보가 부족합니다.");
      return;
    }
    const recipientUser = users.find((u) => u.id === transferRecipient);
    const amount = parseInt(transferAmount, 10);
    if (!recipientUser) {
      alert("받는 사람을 선택해주세요.");
      return;
    }
    if (recipientUser.id === userId) {
      alert("자신에게는 송금할 수 없습니다.");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      alert("올바른 금액을 입력해주세요.");
      return;
    }
    if ((userDoc.cash || 0) < amount) {
      alert("현금이 부족합니다.");
      return;
    }

    if (
      window.confirm(
        `${
          recipientUser.name || recipientUser.nickname || recipientUser.id
        }님에게 ${amount.toLocaleString()}원을 송금하시겠습니까?`
      )
    ) {
      setAssetsLoading(true);
      try {
        const deductSuccess = await deductCurrentUserCash(amount);
        if (deductSuccess) {
          const addSuccess = await addCashToUserById(recipientUser.id, amount);
          if (addSuccess) {
            alert("송금이 완료되었습니다.");
            setShowTransferModal(false);
            setTransferRecipient("");
            setTransferAmount("");
          } else {
            alert("받는 사람 현금 추가 오류. 송금 취소를 시도합니다.");
            await addCashToUserById(userId, amount); // 보낸 사람에게 다시 돈 추가 (롤백)
          }
        } else {
          alert("현금 차감 오류입니다.");
        }
      } catch (error) {
        console.error("송금 오류:", error);
        alert("송금 오류: " + error.message);
      } finally {
        setAssetsLoading(false);
      }
    }
  };

  const renderTitle = () => (
    <div>
      <h2
        style={{
          fontSize: "24px",
          fontWeight: "bold",
          color: "#4f46e5",
          borderBottom: "2px solid #e0e7ff",
          paddingBottom: "10px",
          marginBottom: "20px",
        }}
      >
        나의 자산 현황 💳
      </h2>
    </div>
  );

  const renderAssetSummary = () => {
    const displayCash = userDoc?.cash ?? 0;
    const displayCoupons = userDoc?.coupons ?? 0;
    return (
      <div
        style={{
          padding: "20px",
          background: "#ffffff",
          borderRadius: "12px",
          marginBottom: "25px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 8px rgba(0,0,0,0.05)",
        }}
      >
        <h3
          style={{
            fontWeight: "700",
            fontSize: "18px",
            color: "#1f2937",
            marginBottom: "20px",
          }}
        >
          자산 요약
        </h3>
        <div
          style={{
            marginBottom: "12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#4b5563", fontWeight: "500" }}>
            💰 보유 현금
          </span>
          <span style={{ fontWeight: "600", color: "#1f2937" }}>
            {displayCash.toLocaleString()} 원
          </span>
        </div>
        <div style={{ textAlign: "right", marginBottom: "20px" }}>
          <button
            onClick={() => setShowTransferModal(true)}
            style={{
              padding: "8px 12px",
              backgroundColor: "#4f46e5",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: "500",
              cursor: "pointer",
            }}
            disabled={assetsLoading || authLoading}
          >
            💸 송금하기
          </button>
        </div>
        <div
          style={{
            marginBottom: "12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#4b5563", fontWeight: "500" }}>
            🎟️ 보유 쿠폰
          </span>
          <span style={{ fontWeight: "600", color: "#1f2937" }}>
            {displayCoupons.toLocaleString()} 개
          </span>
        </div>
        <p
          style={{
            fontSize: "12px",
            color: "#6b7280",
            textAlign: "right",
            marginBottom: "20px",
          }}
        >
          (1쿠폰 = {couponValue.toLocaleString()}원 가치)
        </p>
        <div
          style={{
            borderTop: "1px solid #e5e7eb",
            paddingTop: "20px",
            marginTop: "20px",
          }}
        >
          <h4
            style={{
              fontWeight: "600",
              fontSize: "16px",
              color: "#374151",
              marginBottom: "10px",
            }}
          >
            🅿️ 파킹통장
          </h4>
          <div
            style={{
              backgroundColor: "#e0f2fe",
              borderRadius: "8px",
              padding: "15px",
              border: "1px solid #bae6fd",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <span style={{ color: "#0c4a6e", fontWeight: "500" }}>
                현재 잔액
              </span>
              <span
                style={{
                  fontWeight: "700",
                  fontSize: "18px",
                  color: "#0369a1",
                }}
              >
                {parkingBalance.toLocaleString()} 원
              </span>
            </div>
          </div>
          <p style={{ marginTop: "8px", fontSize: "12px", color: "#6b7280" }}>
            * 파킹통장 메뉴에서 입출금 및 상품 가입이 가능합니다.
          </p>
        </div>
        <div
          style={{
            borderTop: "1px solid #4f46e5",
            paddingTop: "20px",
            marginTop: "30px",
          }}
        >
          <h4
            style={{
              fontWeight: "700",
              fontSize: "18px",
              color: "#4f46e5",
              marginBottom: "10px",
              textAlign: "right",
            }}
          >
            📊 총 순자산
          </h4>
          <div
            style={{
              textAlign: "right",
              fontWeight: "bold",
              fontSize: "22px",
              color: "#3730a3",
            }}
          >
            {totalNetAssets.toLocaleString()} 원
          </div>
          <p
            style={{
              marginTop: "8px",
              fontSize: "12px",
              color: "#6b7280",
              textAlign: "right",
            }}
          >
            (현금 + 쿠폰가치 + 파킹통장 + 부동산가치 - 대출잔액)
          </p>
        </div>
      </div>
    );
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
        자산 정보를 불러오는 중... ⏳
      </div>
    );
  }
  if (!user) {
    return <LoginWarning />;
  }
  if (!userDoc && !authLoading) {
    // auth 로딩은 끝났는데 userDoc이 없는 경우
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
        사용자 데이터를 불러오지 못했습니다. (userDoc null). 앱을 새로고침하거나
        재로그인해보세요.
      </div>
    );
  }
  if (!userDoc) {
    // 이 경우는 거의 없어야 하지만, userDoc이 아직도 null인 최종 방어
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "80vh",
          fontSize: "1.2em",
          color: "#f97316",
        }}
      >
        사용자 정보 확인 중... 🧐
      </div>
    );
  }
  if (!currentUserClassCode && !authLoading) {
    // auth 로딩 후에도 classCode가 없다면
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
      className="my-assets-container"
      style={{
        padding: "20px",
        maxWidth: "1200px",
        margin: "0 auto",
        fontFamily: "'Noto Sans KR', sans-serif",
      }}
    >
      {renderTitle()}
      {renderAssetSummary()}
      {currentUserClassCode &&
        currentGoalId && ( // 🔥 학급 코드와 목표 ID 모두 확인
          <div
            className="coupon-goal-section-container"
            style={{ marginTop: "40px" }}
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
              쿠폰 목표 🎯 (학급: {currentUserClassCode})
            </h2>
            <CouponGoal
              classCouponGoal={classCouponGoal}
              goalProgress={goalProgress}
              myContribution={myContribution}
              currentCoupons={userDoc.coupons || 0}
              couponValue={couponValue}
              setShowDonateModal={setShowDonateModal}
              setShowSellCouponModal={setShowSellCouponModal}
              setShowDonationHistoryModal={setShowDonationHistoryModal}
              setShowGiftCouponModal={setShowGiftCouponModal}
              goalAchieved={goalAchieved}
              resetGoalButton={
                userDoc.isAdmin || userDoc.isSuperAdmin ? resetCouponGoal : null
              }
              isResettingGoal={isResettingGoal}
              currentGoalId={currentGoalId}
              classCode={currentUserClassCode} // 🔥 학급 코드 전달
            />
          </div>
        )}

      {showDonateModal && currentUserClassCode && currentGoalId && (
        <DonateCouponModal
          showDonateModal={showDonateModal}
          setShowDonateModal={setShowDonateModal}
          currentCoupons={userDoc.coupons || 0}
          onDonate={handleDonateCoupon}
          userId={userId}
          currentGoalId={currentGoalId}
          classCode={currentUserClassCode} // 🔥 학급 코드 전달
        />
      )}
      {showSellCouponModal && (
        <SellCouponModal
          showSellCouponModal={showSellCouponModal}
          setShowSellCouponModal={setShowSellCouponModal}
          currentCoupons={userDoc.coupons || 0}
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
          recipients={
            users
              ? users.filter(
                  (u) => u.id !== userId && u.classCode === currentUserClassCode
                )
              : []
          }
          giftRecipient={giftRecipient}
          setGiftRecipient={setGiftRecipient}
          giftAmount={giftAmount}
          setGiftAmount={setGiftAmount}
          handleGiftCoupon={handleGiftCoupon}
          currentCoupons={userDoc.coupons || 0}
          userId={userId}
        />
      )}
      {showDonationHistoryModal && currentUserClassCode && currentGoalId && (
        <DonationHistoryModal
          showDonationHistoryModal={showDonationHistoryModal}
          setShowDonationHistoryModal={setShowDonationHistoryModal}
          students={
            users
              ? users.filter((u) => u.classCode === currentUserClassCode)
              : []
          }
          currentGoalId={currentGoalId}
          classCode={currentUserClassCode} // 🔥 학급 코드 전달
        />
      )}
      {showTransferModal && (
        <TransferModal
          showTransferModal={showTransferModal}
          setShowTransferModal={setShowTransferModal}
          recipients={
            users
              ? users.filter(
                  (u) => u.id !== userId && u.classCode === currentUserClassCode
                )
              : []
          }
          transferRecipient={transferRecipient}
          setTransferRecipient={setTransferRecipient}
          transferAmount={transferAmount}
          setTransferAmount={setTransferAmount}
          handleTransfer={handleTransfer}
          userId={userId}
          userCash={userDoc.cash || 0}
        />
      )}
    </div>
  );
}
