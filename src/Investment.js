// src/Investment.js
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext"; // AuthContext에서 user 정보 가져오기

// Firestore 관련 함수 임포트
import {
  db,
  doc,
  runTransaction,
  serverTimestamp,
  collection,
  // addDoc, // 더 이상 직접 사용하지 않음 (transaction.set 사용)
  getDoc,
  setDoc,
  increment,
  // query, orderBy, limit 등은 firebase/firestore에서 직접 가져옴
} from "./firebase"; // firebase.js 경로 확인

// ⭐️ query, orderBy, limit, onSnapshot, Timestamp를 firebase/firestore에서 직접 가져옵니다.
import {
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";

// Investment 컴포넌트
const Investment = ({ classCode }) => {
  // classCode를 prop으로 받음
  const { user, userDoc, isAdmin, refreshUserDocument } = useAuth(); // 현재 사용자 정보 및 isAdmin 함수 사용

  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const [adminCash, setAdminCash] = useState(userDoc?.cash || 0); // 관리자(현재 사용자)의 현금
  const [transferAmount, setTransferAmount] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [lastTransactions, setLastTransactions] = useState([]);

  // Firestore 경로 참조 (classCode가 있을 때만 정의)
  // classCode가 변경될 때마다 참조가 재생성되도록 useEffect 밖으로 빼거나, useCallback/useMemo 사용 고려
  // 여기서는 useEffect의 dependency array에 classCode를 넣어 처리합니다.
  let treasuryRef = null;
  let treasuryTransactionsColRef = null;
  if (classCode) {
    treasuryRef = doc(db, "classes", classCode, "treasury", "balanceDoc");
    treasuryTransactionsColRef = collection(
      db,
      "classes",
      classCode,
      "treasuryTransactions"
    );
  }

  // 사용자(관리자) 현금 상태 업데이트 (userDoc 변경 감지)
  useEffect(() => {
    setAdminCash(userDoc?.cash || 0);
  }, [userDoc?.cash]);

  // 국고 잔액 및 최근 거래 내역 실시간 감시
  useEffect(() => {
    if (!classCode || !treasuryRef || !treasuryTransactionsColRef) {
      setTreasuryBalance(0);
      setLastTransactions([]);
      setIsLoading(false); // 로딩 상태 초기화
      return;
    }

    setIsLoading(true);
    // 국고 잔액 감시
    const unsubscribeTreasury = onSnapshot(
      treasuryRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          setTreasuryBalance(docSnap.data().balance || 0);
        } else {
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
            setMessage({
              type: "error",
              text: "금고 정보를 초기화하는 데 실패했습니다.",
            });
          }
        }
      },
      (error) => {
        console.error("국고 잔액 감시 오류:", error);
        setMessage({
          type: "error",
          text: "국고 잔액을 불러오는데 실패했습니다.",
        });
      }
    );

    // 최근 거래 내역 감시 (예: 최근 5건)
    // ⭐️ 수정된 import에 따라 query, orderBy, limit 정상 작동해야 함
    const q = query(
      treasuryTransactionsColRef,
      orderBy("timestamp", "desc"),
      limit(5)
    );
    const unsubscribeTransactions = onSnapshot(
      q,
      (snapshot) => {
        const transactions = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setLastTransactions(transactions);
        setIsLoading(false); // 데이터 로드 완료
      },
      (error) => {
        console.error("최근 거래 내역 감시 오류:", error);
        setMessage({
          type: "error",
          text: "최근 거래 내역을 불러오는데 실패했습니다.",
        });
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribeTreasury();
      unsubscribeTransactions();
    };
  }, [classCode]); // classCode가 변경될 때 treasuryRef, treasuryTransactionsColRef도 변경되므로, 이를 직접 의존성으로 넣거나 재생성 로직 고려

  // 국고 ↔ 관리자 현금 이체 함수
  const handleTreasuryTransfer = async (e, operationType) => {
    e.preventDefault();
    setMessage({ text: "", type: "" });

    if (!isAdmin()) {
      setMessage({
        text: "이 작업은 관리자만 수행할 수 있습니다.",
        type: "error",
      });
      return;
    }

    if (
      !user ||
      !userDoc ||
      !classCode ||
      !treasuryRef ||
      !treasuryTransactionsColRef
    ) {
      setMessage({
        text: "사용자 또는 학급 정보가 유효하지 않습니다.",
        type: "error",
      });
      return;
    }

    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      setMessage({ text: "유효한 금액을 입력해주세요.", type: "error" });
      return;
    }

    setIsLoading(true);
    const adminUserRef = doc(db, "users", user.uid);

    try {
      await runTransaction(db, async (transaction) => {
        const latestTreasurySnap = await transaction.get(treasuryRef);
        const latestAdminSnap = await transaction.get(adminUserRef);

        if (!latestAdminSnap.exists())
          throw new Error("관리자(사용자) 정보를 찾을 수 없습니다.");

        const currentTreasuryBalance = latestTreasurySnap.exists()
          ? latestTreasurySnap.data().balance || 0
          : 0;
        const currentAdminCash = latestAdminSnap.data().cash || 0;

        let reason = "";
        let newTreasuryBalance, newAdminCash;

        if (operationType === "withdraw_to_admin") {
          // 국고 -> 관리자 현금
          reason = "투자 자금 인출 (관리자)";
          if (currentTreasuryBalance < amount)
            throw new Error("국고 잔액이 부족합니다.");
          newTreasuryBalance = currentTreasuryBalance - amount;
          newAdminCash = currentAdminCash + amount;
          transaction.update(treasuryRef, {
            balance: increment(-amount),
            updatedAt: serverTimestamp(),
          });
          transaction.update(adminUserRef, {
            cash: increment(amount),
            updatedAt: serverTimestamp(),
          });
        } else if (operationType === "deposit_from_admin") {
          // 관리자 현금 -> 국고
          reason = "투자 수익 입금 (관리자)";
          if (currentAdminCash < amount)
            throw new Error("관리자 현금이 부족합니다.");
          newTreasuryBalance = currentTreasuryBalance + amount;
          newAdminCash = currentAdminCash - amount;
          transaction.update(adminUserRef, {
            cash: increment(-amount),
            updatedAt: serverTimestamp(),
          });
          transaction.update(treasuryRef, {
            balance: increment(amount),
            updatedAt: serverTimestamp(),
          });
        } else {
          throw new Error("잘못된 작업 유형입니다.");
        }

        // 거래 기록 추가 (새 문서 ID 자동 생성)
        const newTransactionRef = doc(treasuryTransactionsColRef);
        transaction.set(newTransactionRef, {
          type: operationType,
          actorId: user.uid,
          actorDisplayName: userDoc.name || userDoc.nickname || user.email,
          amount: amount,
          reason: reason,
          classCode: classCode,
          timestamp: serverTimestamp(),
          treasuryBalanceBefore: currentTreasuryBalance,
          treasuryBalanceAfter: newTreasuryBalance,
          adminCashBefore: currentAdminCash,
          adminCashAfter: newAdminCash,
        });
      });

      setMessage({
        text: `${
          operationType === "withdraw_to_admin" ? "인출" : "입금"
        } 성공! (${amount.toLocaleString()}원)`,
        type: "success",
      });
      setTransferAmount("");
      if (refreshUserDocument) refreshUserDocument();
    } catch (error) {
      console.error("자금 이체 오류:", error);
      setMessage({ text: `오류: ${error.message}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!classCode) {
    return (
      <div className="investment-container" style={styles.container}>
        <p>학급 정보를 불러오는 중이거나, 학급 코드가 할당되지 않았습니다.</p>
      </div>
    );
  }

  if (
    isLoading &&
    treasuryBalance === 0 &&
    lastTransactions.length === 0 &&
    !message.text
  ) {
    return (
      <div className="investment-container" style={styles.container}>
        데이터를 불러오는 중입니다...
      </div>
    );
  }

  if (!isAdmin()) {
    return (
      <div className="investment-container" style={styles.container}>
        <p>이 기능은 관리자만 사용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="investment-container" style={styles.container}>
      <h2>투자 관리 (국고 ↔ 관리자 현금)</h2>
      <p style={styles.classCodeDisplay}>학급 코드: {classCode}</p>

      {message.text && (
        <div
          style={{
            ...styles.messageBox,
            borderColor: message.type === "success" ? "#c3e6cb" : "#f5c6cb",
            backgroundColor: message.type === "success" ? "#d4edda" : "#f8d7da",
            color: message.type === "success" ? "#155724" : "#721c24",
          }}
        >
          {message.text}
        </div>
      )}

      <div style={styles.balanceDisplay}>
        <p>
          현재 국고 잔액:{" "}
          <span style={styles.balanceValue}>
            {treasuryBalance.toLocaleString()}원
          </span>
        </p>
        <p>
          관리자 (내) 현금:{" "}
          <span style={styles.balanceValue}>
            {adminCash.toLocaleString()}원
          </span>
        </p>
      </div>

      <form
        onSubmit={(e) => handleTreasuryTransfer(e, "withdraw_to_admin")}
        style={styles.form}
      >
        <h3>국고에서 투자 자금 인출 (→ 내 현금으로)</h3>
        <div style={styles.formGroup}>
          <label htmlFor="withdrawAmount" style={styles.label}>
            인출 금액:
          </label>
          <input
            type="number"
            id="withdrawAmount"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            required
            min="1"
            placeholder="인출할 금액"
            style={styles.input}
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          style={{ ...styles.actionButton, backgroundColor: "#007bff" }}
          disabled={isLoading}
        >
          {isLoading ? "처리중..." : "자금 인출 실행"}
        </button>
      </form>

      <hr style={styles.divider} />

      <form
        onSubmit={(e) => handleTreasuryTransfer(e, "deposit_from_admin")}
        style={styles.form}
      >
        <h3>투자 수익 국고 입금 (내 현금에서 →)</h3>
        <div style={styles.formGroup}>
          <label htmlFor="depositAmount" style={styles.label}>
            입금 금액:
          </label>
          <input
            type="number"
            id="depositAmount"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            required
            min="1"
            placeholder="국고로 입금할 금액"
            style={styles.input}
            disabled={isLoading}
          />
        </div>
        <button type="submit" style={styles.actionButton} disabled={isLoading}>
          {isLoading ? "처리중..." : "국고 입금 실행"}
        </button>
      </form>

      <hr style={styles.divider} />
      <div>
        <h3>최근 국고 거래 내역 (관리자 관련)</h3>
        {lastTransactions.length === 0 && !isLoading ? (
          <p>최근 거래 내역이 없습니다.</p>
        ) : (
          <ul style={styles.transactionList}>
            {lastTransactions.map((tx) => (
              <li key={tx.id} style={styles.transactionItem}>
                <span style={styles.transactionItem_span}>
                  {tx.timestamp && tx.timestamp.toDate
                    ? new Date(tx.timestamp.toDate()).toLocaleString()
                    : "날짜 정보 없음"}
                </span>
                <span style={styles.transactionItem_span}>
                  {" "}
                  [
                  {tx.type === "withdraw_to_admin"
                    ? "인출(관리자)"
                    : tx.type === "deposit_from_admin"
                    ? "입금(관리자)"
                    : tx.type || "알 수 없음"}
                  ]
                </span>
                <span style={styles.transactionItem_span}>
                  {" "}
                  {tx.actorDisplayName || "정보 없음"}
                </span>
                <span style={styles.transactionItem_span}>
                  : {tx.amount?.toLocaleString()}원
                </span>
                {tx.reason && (
                  <span style={styles.transactionItem_span}>
                    {" "}
                    ({tx.reason})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <hr style={styles.divider} />

      <div>
        <h3>실제 투자 집행</h3>
        <p>위에서 인출한 자금으로 아래 링크를 통해 실제 투자를 진행하세요.</p>
        <div style={styles.linkContainer}>
          <Link to="/stock-trading" style={styles.linkButton}>
            주식 거래소 가기
          </Link>
          <Link to="/banking" style={styles.linkButton}>
            한국 은행 가기
          </Link>
        </div>
      </div>
    </div>
  );
};

// 간단한 인라인 스타일
const styles = {
  container: {
    maxWidth: "800px",
    margin: "20px auto",
    padding: "20px",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    backgroundColor: "#fff",
    fontFamily: "'Noto Sans KR', sans-serif",
  },
  classCodeDisplay: {
    textAlign: "center",
    marginBottom: "15px",
    fontSize: "0.9em",
    color: "#666",
    backgroundColor: "#f0f0f0",
    padding: "5px",
    borderRadius: "4px",
  },
  balanceDisplay: {
    marginBottom: "20px",
    padding: "15px",
    backgroundColor: "#f8f9fa",
    borderRadius: "8px",
    border: "1px solid #e9ecef",
  },
  balanceValue: { fontWeight: "bold", color: "#007bff" },
  form: {
    marginBottom: "20px",
    padding: "20px",
    border: "1px solid #dee2e6",
    borderRadius: "8px",
    backgroundColor: "#f8f9fa",
  },
  formGroup: { marginBottom: "15px" },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: "500",
    color: "#495057",
  },
  input: {
    width: "calc(100% - 22px)", // 패딩 고려
    padding: "10px",
    border: "1px solid #ced4da",
    borderRadius: "4px",
    fontSize: "1rem",
  },
  actionButton: {
    padding: "10px 20px",
    backgroundColor: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "1rem",
    transition: "background-color 0.2s ease, opacity 0.2s ease",
  },
  divider: { margin: "30px 0", border: 0, borderTop: "1px solid #dee2e6" },
  messageBox: {
    padding: "15px",
    marginBottom: "20px",
    borderRadius: "5px",
    borderWidth: "1px",
    borderStyle: "solid",
    fontSize: "1rem",
  },
  linkContainer: {
    marginTop: "15px",
    display: "flex",
    gap: "15px",
  },
  linkButton: {
    display: "inline-block",
    padding: "10px 15px",
    backgroundColor: "#6c757d",
    color: "white",
    textDecoration: "none",
    borderRadius: "5px",
    textAlign: "center",
    transition: "background-color 0.2s ease",
  },
  transactionList: {
    listStyleType: "none",
    paddingLeft: 0,
    maxHeight: "200px",
    overflowY: "auto",
    border: "1px solid #eee",
    borderRadius: "4px",
    padding: "10px",
  },
  transactionItem: {
    padding: "8px 0",
    borderBottom: "1px solid #f0f0f0",
    fontSize: "0.9em",
    display: "flex",
    flexWrap: "wrap",
    gap: "5px",
  },
  transactionItem_span: {
    // 최근 거래 내역의 각 span 태그에 오른쪽 여백을 주기 위한 스타일
    marginRight: "5px",
  },
};

export default Investment;
