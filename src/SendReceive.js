// src/SendReceive.js
import { onSnapshot } from "firebase/firestore";
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import {
  db,
  doc,
  runTransaction,
  serverTimestamp,
  collection,
  addDoc,
  getDoc,
  setDoc,
  increment,
  Timestamp,
} from "./firebase"; // firebase.js 경로 확인
import "./SendReceive.css"; // 스타일 파일 (아래에 CSS 코드 제공)

const SendReceive = ({ classCode }) => {
  const { user, userDoc, refreshUserDocument } = useAuth();
  const [amount, setAmount] = useState("");
  const [actionType, setActionType] = useState("deposit"); // 'deposit' 또는 'withdraw'
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const [userCash, setUserCash] = useState(userDoc?.cash || 0);

  const treasuryRef = doc(db, "classes", classCode, "treasury", "balanceDoc");
  const transactionsColRef = collection(
    db,
    "classes",
    classCode,
    "treasuryTransactions"
  );

  // 학급 금고 잔액 실시간 감시
  useEffect(() => {
    if (!classCode) return;

    const unsubscribeTreasury = onSnapshot(
      treasuryRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          setTreasuryBalance(docSnap.data().balance);
        } else {
          // 금고 문서가 없으면 0원으로 초기화
          try {
            await setDoc(treasuryRef, {
              balance: 0,
              classCode: classCode,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            setTreasuryBalance(0);
            console.log(`학급 [${classCode}]의 금고가 없어 새로 생성했습니다.`);
          } catch (error) {
            console.error("금고 생성 중 오류:", error);
            setFeedback({
              type: "error",
              message: "금고 정보를 가져오거나 생성하는데 실패했습니다.",
            });
          }
        }
      },
      (error) => {
        console.error("금고 잔액 실시간 감시 중 오류:", error);
        setFeedback({
          type: "error",
          message: "금고 잔액을 가져오는데 실패했습니다.",
        });
      }
    );

    return () => unsubscribeTreasury();
  }, [classCode, treasuryRef]);

  // 사용자 잔액 업데이트 (AuthContext의 userDoc 변경 감지)
  useEffect(() => {
    setUserCash(userDoc?.cash || 0);
  }, [userDoc?.cash]);

  const handleTransaction = async () => {
    if (!user || !userDoc) {
      setFeedback({ type: "error", message: "로그인이 필요합니다." });
      return;
    }
    if (!classCode) {
      setFeedback({
        type: "error",
        message: "학급 코드가 없어 작업을 수행할 수 없습니다.",
      });
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFeedback({ type: "error", message: "유효한 금액을 입력하세요." });
      return;
    }

    setIsLoading(true);
    setFeedback({ type: "", message: "" });

    const userRef = doc(db, "users", user.uid);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. 최신 사용자 정보 가져오기
        const latestUserDocSnap = await transaction.get(userRef);
        if (!latestUserDocSnap.exists()) {
          throw new Error("사용자 정보를 찾을 수 없습니다.");
        }
        const latestUserCash = latestUserDocSnap.data().cash || 0;

        // 2. 최신 금고 정보 가져오기
        const latestTreasurySnap = await transaction.get(treasuryRef);
        let currentTreasuryBalance = 0;
        if (latestTreasurySnap.exists()) {
          currentTreasuryBalance = latestTreasurySnap.data().balance || 0;
        } else {
          // 이 경우는 useEffect에서 처리하지만, 만약을 대비
          console.warn(
            "금고 문서가 트랜잭션 중 존재하지 않아 0으로 간주합니다."
          );
        }

        if (actionType === "deposit") {
          if (latestUserCash < numAmount) {
            throw new Error("입금할 금액이 현재 보유 현금보다 많습니다.");
          }
          // 사용자 현금 차감
          transaction.update(userRef, { cash: increment(-numAmount) });
          // 금고 잔액 증가
          transaction.update(treasuryRef, {
            balance: increment(numAmount),
            updatedAt: serverTimestamp(),
          });
        } else if (actionType === "withdraw") {
          if (currentTreasuryBalance < numAmount) {
            throw new Error("출금할 금액이 금고 잔액보다 많습니다.");
          }
          if (
            userDoc?.role !== "admin" &&
            userDoc?.jobId !== "president" &&
            userDoc?.jobName !== "대통령" &&
            !userDoc.canWithdrawTreasury
          ) {
            // 예시: 관리자, 대통령, 또는 특정 권한(canWithdrawTreasury)이 있는 사용자만 출금 가능
            // 실제 직업 ID나 역할은 애플리케이션에 맞게 조정 필요
            throw new Error("금고에서 출금할 권한이 없습니다.");
          }
          // 금고 잔액 차감
          transaction.update(treasuryRef, {
            balance: increment(-numAmount),
            updatedAt: serverTimestamp(),
          });
          // 사용자 현금 증가
          transaction.update(userRef, { cash: increment(numAmount) });
        }

        // 3. 거래 기록 남기기
        const transactionData = {
          type: actionType,
          userId: user.uid,
          userDisplayName: userDoc.name || userDoc.nickname || user.email,
          amount: numAmount,
          classCode: classCode,
          timestamp: serverTimestamp(),
          userCashBefore: latestUserCash,
          userCashAfter:
            latestUserCash +
            (actionType === "deposit" ? -numAmount : numAmount),
          treasuryBalanceBefore: currentTreasuryBalance,
          treasuryBalanceAfter:
            currentTreasuryBalance +
            (actionType === "deposit" ? numAmount : -numAmount),
        };
        // addDoc은 트랜잭션 객체의 메서드가 아니므로, transaction.set(doc(transactionsColRef), data) 사용
        transaction.set(doc(transactionsColRef), transactionData);
      });

      setFeedback({
        type: "success",
        message: `${
          actionType === "deposit" ? "입금" : "출금"
        } 완료! (${numAmount.toLocaleString()}원)`,
      });
      setAmount(""); // 입력 필드 초기화
      if (refreshUserDocument) refreshUserDocument(); // AuthContext의 사용자 정보 갱신
    } catch (error) {
      console.error("거래 처리 중 오류:", error);
      setFeedback({ type: "error", message: `오류: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="send-receive-panel">
      <h3>학급 금고 관리 (학급: {classCode})</h3>
      <div className="balance-display">
        <p>내 현금: {userCash.toLocaleString()} 원</p>
        <p>학급 금고 잔액: {treasuryBalance.toLocaleString()} 원</p>
      </div>

      <div className="action-selector">
        <button
          onClick={() => setActionType("deposit")}
          className={actionType === "deposit" ? "active" : ""}
          disabled={isLoading}
        >
          입금 (보내기)
        </button>
        <button
          onClick={() => setActionType("withdraw")}
          className={actionType === "withdraw" ? "active" : ""}
          disabled={isLoading}
        >
          출금 (가져오기)
        </button>
      </div>

      <div className="transaction-form">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="금액 입력"
          min="0"
          className="amount-input"
          disabled={isLoading}
        />
        <button
          onClick={handleTransaction}
          disabled={isLoading || !amount}
          className="submit-button"
        >
          {isLoading
            ? "처리 중..."
            : actionType === "deposit"
            ? "금고에 입금하기"
            : "금고에서 출금하기"}
        </button>
      </div>

      {feedback.message && (
        <p
          className={`feedback-message ${
            feedback.type === "error" ? "error" : "success"
          }`}
        >
          {feedback.message}
        </p>
      )}
      <div className="info-text">
        <p>
          <strong>입금 (보내기):</strong> 자신의 현금을 학급 공용 금고로
          보냅니다.
        </p>
        <p>
          <strong>출금 (가져오기):</strong> 학급 공용 금고에서 자신의 현금으로
          가져옵니다. (일반적으로 관리자 또는 특정 직책만 가능할 수 있습니다.)
        </p>
      </div>
    </div>
  );
};

export default SendReceive;
