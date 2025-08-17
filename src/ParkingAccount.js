// src/ParkingAccount.js
import React, { useState, useEffect, useCallback } from "react";

// --- 유틸리티 함수들 ---
const calculateDaysBetween = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const calculateDailyCompoundInterest = (principal, dailyRatePercent, days) => {
  if (
    principal <= 0 ||
    typeof dailyRatePercent !== "number" ||
    dailyRatePercent < 0 || // 0% 이율도 가능하도록 수정
    days <= 0
  ) {
    return 0;
  }
  const dailyRate = dailyRatePercent / 100;
  const finalAmount = principal * Math.pow(1 + dailyRate, days);
  const interest = finalAmount - principal;
  return Math.round(interest); // 소수점 이하 반올림
};

const calculateInstallmentInterest = (
  payments,
  dailyRatePercent,
  maturityDateStr
) => {
  let totalInterest = 0;
  if (typeof dailyRatePercent !== "number" || dailyRatePercent < 0) return 0;

  const matDate = new Date(maturityDateStr);
  matDate.setHours(0, 0, 0, 0);

  payments.forEach((payment) => {
    const paymentDate = new Date(payment.date);
    paymentDate.setHours(0, 0, 0, 0);
    const depositDays = calculateDaysBetween(paymentDate, matDate);
    if (depositDays > 0 && payment.amount > 0) {
      const interestForPayment = calculateDailyCompoundInterest(
        payment.amount,
        dailyRatePercent,
        depositDays
      );
      totalInterest += interestForPayment;
    }
  });
  return Math.round(totalInterest);
};

const getLocalStorageItem = (key, defaultValue) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`Error reading localStorage key "${key}":`, error);
    return defaultValue;
  }
};

const setLocalStorageItem = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error setting localStorage key "${key}":`, error);
  }
};

const getParkingInterestRate = () => {
  const savedRate = getLocalStorageItem("parkingDailyInterestRate", 1.0);
  const parsedRate = parseFloat(savedRate);
  return !isNaN(parsedRate) && parsedRate >= 0 ? parsedRate : 1.0;
};

const getEarlyRepaymentFeeRate = () => {
  const savedRate = getLocalStorageItem("earlyRepaymentFeeRate", 1.0);
  const parsedRate = parseFloat(savedRate);
  return !isNaN(parsedRate) && parsedRate >= 0 ? parsedRate : 1.0;
};

const ParkingAccount = ({
  auth = {}, // ✅ 기본값 설정
  savingsProducts: propSavingsProducts = [],
  installmentProducts: propInstallmentProducts = [],
  loanProducts: propLoanProducts = [],
}) => {
  // ✅ 안전한 접근을 위한 처리
  const user = auth?.user;
  const userDoc = auth?.userDoc;
  const userId = user?.uid;
  const isLoading = auth?.loading ?? true; // ✅ loading이 undefined일 경우 true로 처리

  const [parkingBalance, setParkingBalance] = useState(0);
  const [parkingAmount, setParkingAmount] = useState("");
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState(""); // "success", "error", "info"
  const [parkingTransactions, setParkingTransactions] = useState([]);

  const [showProductModal, setShowProductModal] = useState(false);
  const [productType, setProductType] = useState(""); // "savings", "installment", "loan"
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productAmount, setProductAmount] = useState("");

  const [userProducts, setUserProducts] = useState({
    savings: [],
    installments: [],
    loans: [],
  });

  const [depositHover, setDepositHover] = useState(false);
  const [withdrawHover, setWithdrawHover] = useState(false);

  // --- 스타일 객체 (기존과 동일) ---
  const styles = {
    container: {
      backgroundColor: "white",
      padding: "24px 0",
      marginBottom: "24px",
      width: "100%",
      boxSizing: "border-box",
    },
    innerContentContainer: { paddingLeft: "16px", paddingRight: "16px" },
    header: {
      fontSize: "20px",
      fontWeight: "600",
      marginBottom: "16px",
      color: "#3a5080",
      borderBottom: "2px solid #eaeaea",
      paddingBottom: "10px",
    },
    messageContainer: {
      padding: "12px",
      marginBottom: "16px",
      borderRadius: "6px",
      fontSize: "14px",
    },
    successMessage: {
      backgroundColor: "#e8f5e9",
      color: "#2e7d32",
      borderLeft: "4px solid #4caf50",
    },
    errorMessage: {
      backgroundColor: "#ffebee",
      color: "#c62828",
      borderLeft: "4px solid #f44336",
    },
    infoMessage: {
      backgroundColor: "#e3f2fd",
      color: "#1565c0",
      borderLeft: "4px solid #42a5f5",
    },
    cashBalanceContainer: { marginBottom: "8px" },
    cashBalanceText: { fontSize: "16px", fontWeight: "500", color: "#616161" },
    cashBalanceAmount: { fontWeight: "600", color: "#1a237e" },
    balanceContainer: { marginBottom: "16px" },
    balanceText: { fontSize: "18px", fontWeight: "500", color: "#424242" },
    balanceAmount: { fontWeight: "600", color: "#3a5080" },
    interestText: { fontSize: "14px", color: "#616161" },
    interestRate: { fontWeight: "600", color: "#3a5080" },
    dailyInterestText: {
      fontSize: "14px",
      color: "#4caf50",
      fontWeight: "500",
      marginTop: "5px",
    },
    inputContainer: { marginBottom: "16px" },
    inputLabel: {
      display: "block",
      color: "#424242",
      marginBottom: "8px",
      fontWeight: "500",
    },
    inputWrapper: { position: "relative" },
    input: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid #e0e0e0",
      borderRadius: "6px",
      outline: "none",
      fontSize: "16px",
      transition: "all 0.3s ease",
      boxSizing: "border-box",
    },
    inputCurrency: {
      position: "absolute",
      right: "12px",
      top: "50%",
      transform: "translateY(-50%)",
      color: "#757575",
    },
    buttonContainer: {
      display: "flex",
      gap: "16px",
      marginBottom: "24px",
      flexWrap: "wrap",
    },
    baseButton: {
      flex: 1,
      padding: "12px",
      border: "none",
      borderRadius: "6px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 0.3s ease",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
      minWidth: "100px",
      fontSize: "14px",
    },
    depositButton: {
      background: "linear-gradient(135deg, #3f51b5, #7986cb)",
      color: "white",
    },
    withdrawButton: {
      background: "linear-gradient(135deg, #ff5722, #ff8a65)",
      color: "white",
    },
    financialProductButton: {
      background: "linear-gradient(135deg, #00897b, #4db6ac)",
      color: "white",
      minWidth: "120px",
    },
    disabledButton: {
      backgroundColor: "#bdbdbd",
      backgroundImage: "none",
      color: "#616161",
      cursor: "not-allowed",
      boxShadow: "none",
    },
    buttonIcon: { marginRight: "8px", fontSize: "18px" },
    transactionsContainer: { marginTop: "24px" },
    transactionsHeader: {
      fontWeight: "600",
      marginBottom: "12px",
      fontSize: "16px",
      color: "#424242",
    },
    emptyTransactions: {
      textAlign: "center",
      padding: "16px",
      color: "#757575",
    },
    tableContainer: { overflowX: "auto" },
    table: { width: "100%", borderCollapse: "separate", borderSpacing: "0" },
    tableHeader: { backgroundColor: "#f5f5f5" },
    tableHeaderCell: {
      padding: "10px 12px",
      textAlign: "left",
      fontSize: "12px",
      fontWeight: "500",
      color: "#757575",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      whiteSpace: "nowrap",
    },
    tableHeaderCellRight: {
      padding: "10px 12px",
      textAlign: "right",
      fontSize: "12px",
      fontWeight: "500",
      color: "#757575",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      whiteSpace: "nowrap",
    },
    tableBody: { backgroundColor: "white" },
    tableRow: { borderBottom: "1px solid #eeeeee" },
    tableCell: {
      padding: "12px",
      whiteSpace: "nowrap",
      fontSize: "14px",
      color: "#616161",
    },
    tableCellRight: {
      padding: "12px",
      whiteSpace: "nowrap",
      fontSize: "14px",
      textAlign: "right",
    },
    depositAmount: { color: "#4caf50", fontWeight: "500" },
    withdrawAmount: { color: "#f44336", fontWeight: "500" },
    productList: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
      gap: "15px",
      marginBottom: "20px",
    },
    productCard: {
      backgroundColor: "white",
      borderRadius: "8px",
      padding: "15px",
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
      border: "1px solid #e0e0e0",
      transition: "all 0.3s ease",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
    },
    productCardSelected: {
      border: "2px solid #3a5080",
      boxShadow: "0 4px 8px rgba(58, 80, 128, 0.2)",
    },
    productName: {
      fontWeight: "600",
      fontSize: "15px",
      color: "#3a5080",
      marginBottom: "8px",
    },
    productDetail: { fontSize: "13px", color: "#616161", margin: "4px 0" },
    productRate: { fontWeight: "600", color: "#2e7d32" },
    modalOverlay: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 1000,
      padding: "16px",
    },
    modalContainer: {
      backgroundColor: "white",
      borderRadius: "8px",
      width: "100%",
      maxWidth: "500px",
      maxHeight: "90vh",
      overflowY: "auto",
      padding: "20px",
      boxShadow: "0 5px 15px rgba(0, 0, 0, 0.2)",
      boxSizing: "border-box",
    },
    modalHeader: {
      borderBottom: "1px solid #e0e0e0",
      paddingBottom: "15px",
      marginBottom: "20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    modalTitle: { fontSize: "18px", fontWeight: "600", color: "#3a5080" },
    closeButton: {
      border: "none",
      background: "none",
      fontSize: "24px",
      color: "#757575",
      cursor: "pointer",
      padding: "0",
      lineHeight: 1,
    },
    modalForm: { display: "flex", flexDirection: "column", gap: "15px" },
    userProductsContainer: { marginTop: "30px" },
    userProductsHeader: {
      fontSize: "16px",
      fontWeight: "600",
      color: "#424242",
      marginBottom: "15px",
    },
    userProductCard: {
      backgroundColor: "#f8f9fa",
      borderRadius: "8px",
      padding: "15px",
      marginBottom: "12px",
      border: "1px solid #e9ecef",
    },
    userProductTitle: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "10px",
      flexWrap: "wrap",
      gap: "8px",
    },
    userProductName: {
      fontWeight: "600",
      color: "#3a5080",
      flexBasis: "auto",
      marginRight: "auto",
    },
    userProductButtonContainer: {
      display: "flex",
      gap: "8px",
      flexWrap: "wrap",
    },
    userProductButton: {
      padding: "6px 12px",
      color: "white",
      border: "none",
      borderRadius: "4px",
      fontSize: "12px",
      cursor: "pointer",
      transition: "background-color 0.3s ease, transform 0.1s ease",
    },
    userProductDetails: { fontSize: "13px", color: "#495057", lineHeight: 1.6 },
    userProductItem: { margin: "6px 0" },
  };

  // --- 헬퍼 함수들 ---
  const getTransactionTypeText = (type) => {
    switch (type) {
      case "deposit":
        return "나의 통장 입금";
      case "withdraw":
        return "나의 통장 출금";
      case "interest":
        return "이자 (나의 통장)";
      case "savingsDeposit":
        return "예금가입(현금)";
      case "savingsWithdraw":
        return "예금해지(현금)"; // 현금으로 받는다고 가정
      case "installmentSetup":
        return "적금설정"; // 명확하게 변경
      case "installmentPayment":
        return "적금납입(통장)"; // 통장에서 출금
      case "installmentWithdraw":
        return "적금해지(통장)"; // 통장으로 받는다고 가정
      case "loanIssue":
        return "대출(현금입금)"; // 명확하게 변경
      case "loanRepayment":
        return "대출상환(통장)";
      case "earlyLoanRepayment":
        return "대출 중도상환(현금)";
      default:
        return type;
    }
  };

  const getAmountStyle = (type) => {
    if (
      [
        "deposit",
        "interest",
        "savingsWithdraw",
        "installmentWithdraw",
        "loanIssue",
      ].includes(type)
    )
      return styles.depositAmount;
    if (
      [
        "withdraw",
        "savingsDeposit",
        "installmentPayment",
        "loanRepayment",
        "earlyLoanRepayment",
      ].includes(type)
    )
      return styles.withdrawAmount;
    return {};
  };

  const getAmountDisplayText = (type, amount) => {
    const validAmount = amount ?? 0;
    const formattedAmount = `${validAmount.toLocaleString()}원`;
    if (
      [
        "deposit",
        "interest",
        "savingsWithdraw",
        "installmentWithdraw",
        "loanIssue",
      ].includes(type)
    )
      return `+ ${formattedAmount}`;
    if (
      [
        "withdraw",
        "savingsDeposit",
        "installmentPayment",
        "loanRepayment",
        "earlyLoanRepayment",
      ].includes(type)
    )
      return `- ${formattedAmount}`;
    return formattedAmount;
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "유효하지 않은 날짜";
      return date
        .toLocaleString("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
        .replace(/\. /g, ".")
        .replace(/\.$/, "")
        .replace(/\.([^0-9])/g, "-$1");
    } catch (e) {
      return "날짜 오류";
    }
  };

  const formatShortDate = (dateString) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "유효하지 않은 날짜";
      return date
        .toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
        .replace(/\. /g, "-")
        .replace(/\.$/, "");
    } catch (e) {
      return "날짜 오류";
    }
  };

  const displayMessage = (text, type = "info", duration = 3000) => {
    setMessage(text);
    setMessageType(type);
    if (duration) {
      setTimeout(() => setMessage(null), duration);
    }
  };

  // --- 데이터 로드 및 저장 함수 ---
  const loadParkingData = useCallback(() => {
    if (!userId) {
      setParkingBalance(0);
      setParkingTransactions([]);
      return;
    }
    const accountData = getLocalStorageItem(`parkingAccount_${userId}`, {
      balance: 0,
      transactions: [],
      lastInterestDate: null,
    });
    setParkingBalance(accountData.balance);
    setParkingTransactions(accountData.transactions);
  }, [userId]);

  const saveParkingData = useCallback(
    (newBalance, newTransactions, lastInterestDateUpdate = null) => {
      if (!userId) return;
      const currentData = getLocalStorageItem(`parkingAccount_${userId}`, {
        balance: 0,
        transactions: [],
        lastInterestDate: null,
      });
      const dataToSave = {
        balance: newBalance,
        transactions: Array.isArray(newTransactions)
          ? newTransactions
          : currentData.transactions,
        lastInterestDate: lastInterestDateUpdate
          ? lastInterestDateUpdate
          : currentData.lastInterestDate,
      };
      setLocalStorageItem(`parkingAccount_${userId}`, dataToSave);
    },
    [userId]
  );

  const loadUserProducts = useCallback(() => {
    if (!userId) {
      setUserProducts({ savings: [], installments: [], loans: [] });
      return;
    }
    const loadedProducts = getLocalStorageItem(`userProducts_${userId}`, {
      savings: [],
      installments: [],
      loans: [],
    });
    setUserProducts({
      savings: Array.isArray(loadedProducts.savings)
        ? loadedProducts.savings.map((s) => ({
            ...s,
            dailyRate: typeof s.dailyRate === "number" ? s.dailyRate : 0,
          }))
        : [],
      installments: Array.isArray(loadedProducts.installments)
        ? loadedProducts.installments.map((inst) => ({
            ...inst,
            payments: Array.isArray(inst.payments) ? inst.payments : [],
            dailyRate: typeof inst.dailyRate === "number" ? inst.dailyRate : 0,
          }))
        : [],
      loans: Array.isArray(loadedProducts.loans)
        ? loadedProducts.loans.map((l) => ({
            ...l,
            dailyRate: typeof l.dailyRate === "number" ? l.dailyRate : 0,
          }))
        : [],
    });
  }, [userId]);

  const saveUserProducts = useCallback(
    (products) => {
      if (!userId) return;
      setLocalStorageItem(`userProducts_${userId}`, products);
    },
    [userId]
  );

  const addParkingTransaction = useCallback(
    (type, amount, detail, currentParkingBal) => {
      const newTransaction = {
        id: Date.now(),
        type,
        amount,
        date: new Date().toISOString(),
        balance: currentParkingBal, // 거래 후 잔액
        detail,
      };
      const updatedTransactions = [newTransaction, ...parkingTransactions];
      setParkingTransactions(updatedTransactions);
      return updatedTransactions; // saveParkingData에 전달하기 위함
    },
    [parkingTransactions]
  );

  // --- 일일 이자 계산 ---
  const calculateParkingDailyInterestAmount = useCallback(() => {
    if (!userId || parkingBalance <= 0) return 0;
    const dailyRatePercent = getParkingInterestRate();
    return calculateDailyCompoundInterest(parkingBalance, dailyRatePercent, 1);
  }, [userId, parkingBalance]);

  const checkAndApplyDailyInterest = useCallback(() => {
    if (!userId) return;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const accountData = getLocalStorageItem(`parkingAccount_${userId}`, {
      balance: 0,
      transactions: [],
      lastInterestDate: null,
    });
    const lastInterestDateStr = accountData.lastInterestDate
      ? new Date(accountData.lastInterestDate).toISOString().split("T")[0]
      : null;

    if (!lastInterestDateStr || lastInterestDateStr < todayStr) {
      const interestRate = getParkingInterestRate();
      const balanceForInterest = accountData.balance;

      if (balanceForInterest > 0 && interestRate >= 0) {
        // 0% 이율도 처리
        const dailyInterest = calculateDailyCompoundInterest(
          balanceForInterest,
          interestRate,
          1
        );
        if (dailyInterest > 0) {
          // 실제 이자가 발생한 경우에만
          const newBalanceAfterInterest = accountData.balance + dailyInterest;
          const newTransaction = {
            id: Date.now(),
            type: "interest",
            amount: dailyInterest,
            date: now.toISOString(),
            balance: newBalanceAfterInterest,
            detail: `일 복리 이자 (이율: ${interestRate.toFixed(3)}%)`,
          };
          const updatedTransactions = [
            newTransaction,
            ...(Array.isArray(accountData.transactions)
              ? accountData.transactions
              : []),
          ];

          setParkingBalance(newBalanceAfterInterest); // 상태 업데이트
          setParkingTransactions(updatedTransactions); // 상태 업데이트

          saveParkingData(
            newBalanceAfterInterest,
            updatedTransactions,
            now.toISOString()
          ); // 저장 시 업데이트된 lastInterestDate 전달
        } else {
          // 이자가 0원이어도 날짜는 업데이트
          saveParkingData(
            accountData.balance,
            accountData.transactions,
            now.toISOString()
          );
        }
      } else {
        // 잔액이 없거나 이율이 음수(사실상 없음)인 경우 날짜만 업데이트
        saveParkingData(
          accountData.balance,
          accountData.transactions,
          now.toISOString()
        );
      }
    }
  }, [userId, saveParkingData]);

  // --- 파킹통장 입출금 핸들러 ---
  const handleParkingDeposit = async () => {
    if (!userId || !userDoc)
      return displayMessage("로그인 또는 사용자 정보가 필요합니다.", "error");
    const parsedAmount = parseFloat(parkingAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0)
      return displayMessage("유효한 입금 금액을 입력해주세요.", "error");
    if ((userDoc.cash ?? 0) < parsedAmount)
      return displayMessage("보유 현금이 부족합니다.", "error");

    // ✅ 안전한 함수 호출
    if (auth?.deductCash && typeof auth.deductCash === "function") {
      const success = await auth.deductCash(parsedAmount);
      if (success) {
        const newParkingBalance = parkingBalance + parsedAmount;
        const updatedTransactions = addParkingTransaction(
          "deposit",
          parsedAmount,
          "보유 현금에서 입금",
          newParkingBalance
        );
        setParkingBalance(newParkingBalance);
        saveParkingData(newParkingBalance, updatedTransactions);
        displayMessage(
          `${parsedAmount.toLocaleString()}원이 나의 통장에 입금되었습니다.`,
          "success"
        );
        setParkingAmount("");
      } else {
        displayMessage(
          "입금 처리 중 오류가 발생했습니다 (현금 차감 실패).",
          "error"
        );
      }
    } else {
      displayMessage("현금 처리 기능을 사용할 수 없습니다.", "error");
    }
  };

  const handleParkingWithdraw = async () => {
    if (!userId || !userDoc)
      return displayMessage("로그인 또는 사용자 정보가 필요합니다.", "error");
    const parsedAmount = parseFloat(parkingAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0)
      return displayMessage("유효한 출금 금액을 입력해주세요.", "error");
    if (parkingBalance < parsedAmount)
      return displayMessage("나의 통장 잔액이 부족합니다.", "error");

    // ✅ 안전한 함수 호출
    if (auth?.addCash && typeof auth.addCash === "function") {
      const success = await auth.addCash(parsedAmount);
      if (success) {
        const newParkingBalance = parkingBalance - parsedAmount;
        const updatedTransactions = addParkingTransaction(
          "withdraw",
          parsedAmount,
          "보유 현금으로 출금",
          newParkingBalance
        );
        setParkingBalance(newParkingBalance);
        saveParkingData(newParkingBalance, updatedTransactions);
        displayMessage(
          `${parsedAmount.toLocaleString()}원이 나의 통장에서 출금되었습니다.`,
          "success"
        );
        setParkingAmount("");
      } else {
        displayMessage(
          "출금 처리 중 오류가 발생했습니다 (현금 추가 실패).",
          "error"
        );
      }
    } else {
      displayMessage("현금 처리 기능을 사용할 수 없습니다.", "error");
    }
  };

  // --- 모달 관련 함수 ---
  const openProductModal = (type) => {
    setProductType(type);
    setShowProductModal(true);
    setSelectedProduct(null);
    setProductAmount("");
    setMessage(null);
  };

  const closeProductModal = () => {
    setShowProductModal(false);
    setProductType("");
    setSelectedProduct(null);
    setProductAmount("");
  };

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setProductAmount("");
    setMessage(null);
  };

  const handleProductAmountChange = (e) => {
    setProductAmount(e.target.value.replace(/[^0-9]/g, ""));
  };

  // --- 금융 상품 가입 핸들러 ---
  const handleSavingsSubmit = async () => {
    if (!selectedProduct || !productAmount)
      return displayMessage("상품을 선택하고 가입 금액을 입력하세요.", "error");
    const amount = parseInt(productAmount);
    const minAmount = selectedProduct.minAmount || 0;

    if (isNaN(amount) || amount <= 0 || amount < minAmount)
      return displayMessage(
        `유효한 가입 금액을 입력하세요 (최소 ${minAmount.toLocaleString()}원).`,
        "error"
      );
    if ((userDoc?.cash ?? 0) < amount)
      return displayMessage(
        "보유 현금이 부족하여 예금에 가입할 수 없습니다.",
        "error"
      );

    // ✅ 안전한 함수 호출
    const success = await auth?.deductCash?.(amount);
    if (!success)
      return displayMessage(
        "예금 가입을 위한 현금 차감에 실패했습니다.",
        "error"
      );

    const startDate = new Date();
    const maturityDate = new Date(startDate);
    maturityDate.setDate(startDate.getDate() + selectedProduct.termInDays);

    const newSaving = {
      id: `sav_${Date.now()}`,
      productId: selectedProduct.id,
      name: selectedProduct.name,
      amount,
      dailyRate: selectedProduct.dailyRate,
      termInDays: selectedProduct.termInDays,
      startDate: startDate.toISOString(),
      maturityDate: maturityDate.toISOString(),
    };
    const updatedUserProducts = {
      ...userProducts,
      savings: [...userProducts.savings, newSaving],
    };
    setUserProducts(updatedUserProducts);
    saveUserProducts(updatedUserProducts);
    addParkingTransaction(
      "savingsDeposit",
      amount,
      `${selectedProduct.name} 가입 (현금 출금)`,
      parkingBalance
    ); // 현금에서 바로 출금되므로 파킹통장 잔액 변동 없음, 거래내역은 참고용
    saveParkingData(parkingBalance, parkingTransactions); // parkingTransactions 업데이트 때문

    displayMessage(
      `${
        selectedProduct.name
      } (${amount.toLocaleString()}원) 예금 가입이 완료되었습니다.`,
      "success"
    );
    closeProductModal();
  };

  const handleInstallmentSubmit = async () => {
    if (!selectedProduct || !productAmount)
      return displayMessage(
        "상품을 선택하고 월 납입 금액을 입력하세요.",
        "error"
      );
    const monthlyAmount = parseInt(productAmount);
    const minAmount = selectedProduct.minAmount || 0;

    if (isNaN(monthlyAmount) || monthlyAmount <= 0 || monthlyAmount < minAmount)
      return displayMessage(
        `유효한 월 납입 금액을 입력하세요 (최소 ${minAmount.toLocaleString()}원).`,
        "error"
      );

    const startDate = new Date();
    const maturityDate = new Date(startDate);
    maturityDate.setDate(startDate.getDate() + selectedProduct.termInDays);
    const nextPaymentDate = new Date(startDate);
    nextPaymentDate.setMonth(startDate.getMonth() + 1);

    const newInstallment = {
      id: `inst_${Date.now()}`,
      productId: selectedProduct.id,
      name: selectedProduct.name,
      monthlyAmount,
      totalPaid: 0,
      paymentsMade: 0,
      payments: [],
      dailyRate: selectedProduct.dailyRate,
      termInDays: selectedProduct.termInDays,
      startDate: startDate.toISOString(),
      maturityDate: maturityDate.toISOString(),
      nextPaymentDate: nextPaymentDate.toISOString(),
    };
    const updatedUserProducts = {
      ...userProducts,
      installments: [...userProducts.installments, newInstallment],
    };
    setUserProducts(updatedUserProducts);
    saveUserProducts(updatedUserProducts);
    // 적금 설정 시에는 파킹통장이나 현금에서 돈이 나가지 않음. 거래내역도 없음.
    displayMessage(
      `${
        selectedProduct.name
      } (월 ${monthlyAmount.toLocaleString()}원) 적금 설정이 완료되었습니다. 첫 납입은 다음 달부터 진행됩니다.`,
      "success"
    );
    closeProductModal();
  };

  const handleLoanSubmit = async () => {
    if (!selectedProduct || !productAmount)
      return displayMessage("상품을 선택하고 대출 금액을 입력하세요.", "error");
    const amount = parseInt(productAmount);
    const maxAmount = selectedProduct.maxAmount || 0;
    const currentTotalOutstandingForProduct = (userProducts.loans || [])
      .filter((loan) => loan.productId === selectedProduct.id && !loan.isRepaid)
      .reduce((sum, loan) => sum + (loan.remainingPrincipal || 0), 0);
    const availableLimit = Math.max(
      0,
      maxAmount - currentTotalOutstandingForProduct
    );

    if (isNaN(amount) || amount <= 0 || amount > availableLimit)
      return displayMessage(
        `유효한 대출 금액을 입력하세요 (이 상품으로 추가 가능액: ${availableLimit.toLocaleString()}원).`,
        "error"
      );

    // ✅ 안전한 함수 호출
    const success = await auth?.addCash?.(amount);
    if (!success)
      return displayMessage("대출금 현금 지급에 실패했습니다.", "error");

    const startDate = new Date();
    const maturityDate = new Date(startDate);
    maturityDate.setDate(startDate.getDate() + selectedProduct.termInDays);
    const nextPaymentDate = new Date(startDate);
    nextPaymentDate.setMonth(startDate.getMonth() + 1); // 첫 상환일은 다음달로 가정
    const approxTotalMonths = Math.ceil(selectedProduct.termInDays / 30.4375); // 평균 월 일수
    const approxMonthlyPrincipal =
      approxTotalMonths > 0 ? Math.round(amount / approxTotalMonths) : amount;

    const newLoan = {
      id: `loan_${Date.now()}`,
      productId: selectedProduct.id,
      name: selectedProduct.name,
      amount,
      remainingPrincipal: amount,
      paidInterest: 0,
      paidPrincipal: 0,
      paymentsMade: 0,
      dailyRate: selectedProduct.dailyRate,
      termInDays: selectedProduct.termInDays,
      approxMonthlyPrincipal,
      startDate: startDate.toISOString(),
      maturityDate: maturityDate.toISOString(),
      lastPaymentDate: null,
      nextPaymentDate: nextPaymentDate.toISOString(),
      isRepaid: false,
    };
    const updatedUserProducts = {
      ...userProducts,
      loans: [...userProducts.loans, newLoan],
    };
    setUserProducts(updatedUserProducts);
    saveUserProducts(updatedUserProducts);
    addParkingTransaction(
      "loanIssue",
      amount,
      `${selectedProduct.name} 대출 실행 (현금 입금)`,
      parkingBalance
    ); // 현금으로 바로 입금, 파킹통장 잔액 변동 없음, 거래내역 참고용
    saveParkingData(parkingBalance, parkingTransactions);

    displayMessage(
      `${
        selectedProduct.name
      } (${amount.toLocaleString()}원) 대출 신청이 완료되어 현금으로 입금되었습니다.`,
      "success"
    );
    closeProductModal();
  };

  // --- 금융 상품 관리 핸들러 ---
  const handleTerminateSaving = async (savingId) => {
    const saving = userProducts.savings.find((s) => s.id === savingId);
    if (!saving)
      return displayMessage("해지할 예금 정보를 찾을 수 없습니다.", "error");

    const today = new Date();
    const maturityD = new Date(saving.maturityDate);
    let interestEarned = 0;
    let detailMsg = "";

    if (today >= maturityD) {
      // 만기 해지
      interestEarned = calculateDailyCompoundInterest(
        saving.amount,
        saving.dailyRate,
        saving.termInDays
      );
      detailMsg = `${saving.name} 만기 해지 (이자 포함)`;
    } else {
      // 중도 해지 (여기서는 편의상 이자 없이 원금만 반환, 필요시 중도해지 이율 적용)
      interestEarned = 0; // 실제로는 중도해지 이율 적용 필요
      displayMessage(
        "예금이 중도 해지되었습니다. (중도해지 이율은 정책에 따라 다를 수 있습니다. 여기서는 원금만 반환됩니다.)",
        "info",
        5000
      );
      detailMsg = `${saving.name} 중도 해지`;
    }
    const totalReturn = saving.amount + interestEarned;

    // ✅ 안전한 함수 호출
    const success = await auth?.addCash?.(totalReturn);
    if (!success)
      return displayMessage("예금 해지금 현금 지급에 실패했습니다.", "error");

    const updatedSavings = userProducts.savings.filter(
      (s) => s.id !== savingId
    );
    const updatedUserProducts = { ...userProducts, savings: updatedSavings };
    setUserProducts(updatedUserProducts);
    saveUserProducts(updatedUserProducts);
    addParkingTransaction(
      "savingsWithdraw",
      totalReturn,
      detailMsg,
      parkingBalance
    );
    saveParkingData(parkingBalance, parkingTransactions);

    displayMessage(
      `${
        saving.name
      }이 해지되어 ${totalReturn.toLocaleString()}원이 현금으로 입금되었습니다.`,
      "success"
    );
  };

  const handleInstallmentPayment = async (installmentId) => {
    const installment = userProducts.installments.find(
      (i) => i.id === installmentId
    );
    if (!installment)
      return displayMessage("적금 정보를 찾을 수 없습니다.", "error");
    if (parkingBalance < installment.monthlyAmount)
      return displayMessage(
        "나의 통장 잔액이 부족하여 적금을 납입할 수 없습니다.",
        "error"
      );

    const newParkingBalance = parkingBalance - installment.monthlyAmount;
    const updatedTransactions = addParkingTransaction(
      "installmentPayment",
      installment.monthlyAmount,
      `${installment.name} 월 납입`,
      newParkingBalance
    );
    setParkingBalance(newParkingBalance);
    saveParkingData(newParkingBalance, updatedTransactions);

    const newPayment = {
      date: new Date().toISOString(),
      amount: installment.monthlyAmount,
    };
    const updatedInstallment = {
      ...installment,
      totalPaid: installment.totalPaid + installment.monthlyAmount,
      paymentsMade: installment.paymentsMade + 1,
      payments: [...installment.payments, newPayment],
      nextPaymentDate: new Date(
        new Date(installment.nextPaymentDate).setMonth(
          new Date(installment.nextPaymentDate).getMonth() + 1
        )
      ).toISOString(),
    };
    const updatedInstallments = userProducts.installments.map((i) =>
      i.id === installmentId ? updatedInstallment : i
    );
    const updatedUserProducts = {
      ...userProducts,
      installments: updatedInstallments,
    };
    setUserProducts(updatedUserProducts);
    saveUserProducts(updatedUserProducts);

    displayMessage(
      `${
        installment.name
      } ${installment.monthlyAmount.toLocaleString()}원 납입이 완료되었습니다.`,
      "success"
    );
  };

  const handleTerminateInstallment = async (installmentId) => {
    const installment = userProducts.installments.find(
      (i) => i.id === installmentId
    );
    if (!installment)
      return displayMessage("해지할 적금 정보를 찾을 수 없습니다.", "error");

    const today = new Date();
    const maturityD = new Date(installment.maturityDate);
    let totalReturn = 0;
    let detailMsg = "";

    if (today >= maturityD) {
      // 만기 해지
      const interestEarned = calculateInstallmentInterest(
        installment.payments,
        installment.dailyRate,
        installment.maturityDate
      );
      totalReturn = installment.totalPaid + interestEarned;
      detailMsg = `${installment.name} 만기 해지 (이자 포함)`;
    } else {
      // 중도 해지 (여기서는 납입 원금만 반환)
      totalReturn = installment.totalPaid;
      displayMessage(
        "적금이 중도 해지되었습니다. (중도해지 시 이자는 지급되지 않거나 정책에 따릅니다. 여기서는 납입원금만 반환됩니다.)",
        "info",
        5000
      );
      detailMsg = `${installment.name} 중도 해지 (원금 반환)`;
    }

    // 적금 해지금은 파킹통장으로 입금한다고 가정
    const newParkingBalance = parkingBalance + totalReturn;
    const updatedTransactions = addParkingTransaction(
      "installmentWithdraw",
      totalReturn,
      detailMsg,
      newParkingBalance
    );
    setParkingBalance(newParkingBalance);
    saveParkingData(newParkingBalance, updatedTransactions);

    const updatedInstallments = userProducts.installments.filter(
      (i) => i.id !== installmentId
    );
    const updatedUserProducts = {
      ...userProducts,
      installments: updatedInstallments,
    };
    setUserProducts(updatedUserProducts);
    saveUserProducts(updatedUserProducts);

    displayMessage(
      `${
        installment.name
      }이 해지되어 ${totalReturn.toLocaleString()}원이 나의 통장으로 입금되었습니다.`,
      "success"
    );
  };

  const handleLoanRepayment = async (loanId) => {
    const loan = userProducts.loans.find((l) => l.id === loanId);
    if (!loan || loan.isRepaid)
      return displayMessage(
        "상환할 대출 정보를 찾을 수 없거나 이미 상환된 대출입니다.",
        "error"
      );

    const today = new Date();
    const lastPaymentD = new Date(loan.lastPaymentDate || loan.startDate);
    const daysSinceLastPayment = calculateDaysBetween(lastPaymentD, today);

    const interestForPeriod =
      daysSinceLastPayment > 0
        ? calculateDailyCompoundInterest(
            loan.remainingPrincipal,
            loan.dailyRate,
            daysSinceLastPayment
          )
        : 0;
    let principalPayment = loan.approxMonthlyPrincipal;
    if (loan.remainingPrincipal - principalPayment < 0) {
      principalPayment = loan.remainingPrincipal; // 남은 원금이 상환액보다 적으면 남은 원금만큼만 상환
    }

    const totalPayment = principalPayment + interestForPeriod;

    if (parkingBalance < totalPayment)
      return displayMessage(
        `나의 통장 잔액이 부족합니다 (필요 금액: ${totalPayment.toLocaleString()}원).`,
        "error"
      );

    const newParkingBalance = parkingBalance - totalPayment;
    const updatedTransactions = addParkingTransaction(
      "loanRepayment",
      totalPayment,
      `${
        loan.name
      } 월 상환 (원금: ${principalPayment.toLocaleString()}원, 이자: ${interestForPeriod.toLocaleString()}원)`,
      newParkingBalance
    );
    setParkingBalance(newParkingBalance);
    saveParkingData(newParkingBalance, updatedTransactions);

    const newRemainingPrincipal = loan.remainingPrincipal - principalPayment;
    const updatedLoan = {
      ...loan,
      remainingPrincipal: newRemainingPrincipal,
      paidPrincipal: loan.paidPrincipal + principalPayment,
      paidInterest: loan.paidInterest + interestForPeriod,
      paymentsMade: loan.paymentsMade + 1,
      lastPaymentDate: today.toISOString(),
      nextPaymentDate:
        newRemainingPrincipal > 0
          ? new Date(
              new Date(loan.nextPaymentDate).setMonth(
                new Date(loan.nextPaymentDate).getMonth() + 1
              )
            ).toISOString()
          : null,
      isRepaid: newRemainingPrincipal <= 0,
    };
    const updatedLoans = userProducts.loans.map((l) =>
      l.id === loanId ? updatedLoan : l
    );
    const updatedUserProducts = { ...userProducts, loans: updatedLoans };
    setUserProducts(updatedUserProducts);
    saveUserProducts(updatedUserProducts);

    displayMessage(
      `${loan.name} ${totalPayment.toLocaleString()}원 상환 완료. ${
        updatedLoan.isRepaid
          ? "대출 상환이 완료되었습니다!"
          : `다음 상환일: ${formatShortDate(updatedLoan.nextPaymentDate)}`
      }`,
      "success"
    );
  };

  const handleEarlyLoanRepayment = async (loanId) => {
    const loan = userProducts.loans.find((l) => l.id === loanId);
    if (!loan || loan.isRepaid)
      return displayMessage(
        "중도 상환할 대출 정보를 찾을 수 없거나 이미 상환된 대출입니다.",
        "error"
      );

    const today = new Date();
    const lastPaymentD = new Date(loan.lastPaymentDate || loan.startDate);
    const daysSinceLastPayment = calculateDaysBetween(lastPaymentD, today);

    const interestForPeriod =
      daysSinceLastPayment > 0
        ? calculateDailyCompoundInterest(
            loan.remainingPrincipal,
            loan.dailyRate,
            daysSinceLastPayment
          )
        : 0;
    const feeRate = getEarlyRepaymentFeeRate(); // % 단위
    const earlyRepaymentFee = Math.round(
      loan.remainingPrincipal * (feeRate / 100)
    );
    const totalPayment =
      loan.remainingPrincipal + interestForPeriod + earlyRepaymentFee;

    if ((userDoc?.cash ?? 0) < totalPayment)
      return displayMessage(
        `보유 현금이 부족합니다 (필요 금액: ${totalPayment.toLocaleString()}원).`,
        "error"
      );

    // ✅ 안전한 함수 호출
    const deductSuccess = await auth?.deductCash?.(totalPayment);
    if (!deductSuccess)
      return displayMessage("중도상환금 현금 차감에 실패했습니다.", "error");

    const updatedLoan = {
      ...loan,
      remainingPrincipal: 0,
      paidPrincipal: loan.paidPrincipal + loan.remainingPrincipal,
      paidInterest: loan.paidInterest + interestForPeriod,
      paymentsMade: loan.paymentsMade + 1, // 중도상환도 1회 상환으로 간주
      lastPaymentDate: today.toISOString(),
      nextPaymentDate: null,
      isRepaid: true,
    };
    const updatedLoans = userProducts.loans.map((l) =>
      l.id === loanId ? updatedLoan : l
    );
    const updatedUserProducts = { ...userProducts, loans: updatedLoans };
    setUserProducts(updatedUserProducts);
    saveUserProducts(updatedUserProducts);
    // 현금에서 바로 출금되므로 파킹통장 잔액 변동 없음. 거래내역은 참고용.
    addParkingTransaction(
      "earlyLoanRepayment",
      totalPayment,
      `${
        loan.name
      } 중도상환 (원금: ${loan.remainingPrincipal.toLocaleString()}원, 이자: ${interestForPeriod.toLocaleString()}원, 수수료: ${earlyRepaymentFee.toLocaleString()}원)`,
      parkingBalance
    );
    saveParkingData(parkingBalance, parkingTransactions);

    displayMessage(
      `${
        loan.name
      } 중도 상환이 완료되었습니다. 총 ${totalPayment.toLocaleString()}원이 현금에서 출금되었습니다.`,
      "success"
    );
  };

  // --- useEffect 훅들 ---
  // ✅ auth.loading 대신 isLoading 사용
  useEffect(() => {
    if (!isLoading && userId && userDoc) {
      loadParkingData();
      loadUserProducts();
      checkAndApplyDailyInterest(); // 초기 로드 시 이자 즉시 확인 및 적용
    } else if (!isLoading && !userId) {
      setParkingBalance(0);
      setParkingTransactions([]);
      setUserProducts({ savings: [], installments: [], loans: [] });
      setMessage(null);
    }
  }, [
    userId,
    isLoading, // ✅ auth.loading 대신 isLoading 사용
    userDoc,
    loadParkingData,
    loadUserProducts,
    checkAndApplyDailyInterest,
  ]);

  useEffect(() => {
    let intervalId = null;
    let timeoutId = null;
    const scheduleDailyInterestCheck = () => {
      if (!userId) return;
      const now = new Date();
      const midnight = new Date(now);
      midnight.setDate(midnight.getDate() + 1);
      midnight.setHours(0, 0, 5, 0); // 다음날 00:05:00 에 실행 (약간의 여유)

      const timeUntilMidnight = midnight.getTime() - now.getTime();

      timeoutId = setTimeout(() => {
        checkAndApplyDailyInterest(); // 자정이 지난 후 첫 실행
        intervalId = setInterval(() => {
          // 그 후 매 24시간 마다
          checkAndApplyDailyInterest();
        }, 1000 * 60 * 60 * 24);
      }, timeUntilMidnight);
    };

    if (userId) {
      scheduleDailyInterestCheck();
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [userId, checkAndApplyDailyInterest]);

  // --- 렌더링 로직 ---
  // ✅ isLoading 사용
  if (isLoading)
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        나의 통장 정보 로딩 중...
      </div>
    );
  if (!user)
    return (
      <div style={styles.container}>
        <div style={styles.innerContentContainer}>
          <h2 style={styles.header}>나의 통장 (일 복리)</h2>
          <p style={{ padding: "20px", textAlign: "center" }}>
            금융 서비스를 이용하려면 로그인이 필요합니다.
          </p>
        </div>
      </div>
    );
  if (!userDoc)
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        사용자 금융 데이터 확인 중...
      </div>
    );

  // 버튼 스타일 함수 (렌더링 직전에 계산)
  const getDepositButtonStyle = () => {
    const amountNum = parseFloat(parkingAmount);
    const availableCash = userDoc?.cash ?? 0;
    const isDisabled =
      !userId ||
      !userDoc ||
      !parkingAmount ||
      isNaN(amountNum) ||
      amountNum <= 0 ||
      availableCash < amountNum;
    return {
      ...styles.baseButton,
      ...(isDisabled ? styles.disabledButton : styles.depositButton),
      opacity: depositHover && !isDisabled ? 0.9 : 1,
    };
  };
  const getWithdrawButtonStyle = () => {
    const amountNum = parseFloat(parkingAmount);
    const isDisabled =
      !userId ||
      !userDoc ||
      !parkingAmount ||
      isNaN(amountNum) ||
      amountNum <= 0 ||
      parkingBalance < amountNum;
    return {
      ...styles.baseButton,
      ...(isDisabled ? styles.disabledButton : styles.withdrawButton),
      opacity: withdrawHover && !isDisabled ? 0.9 : 1,
    };
  };

  return (
    <div style={styles.container}>
      <div style={styles.innerContentContainer}>
        <h2 style={styles.header}>나의 통장 (일 복리)</h2>
        {message && (
          <div
            style={{
              ...styles.messageContainer,
              ...(messageType === "success"
                ? styles.successMessage
                : messageType === "error"
                ? styles.errorMessage
                : styles.infoMessage),
            }}
          >
            {message}
          </div>
        )}
        <div style={styles.cashBalanceContainer}>
          <div style={styles.cashBalanceText}>
            보유 현금:{" "}
            <span style={styles.cashBalanceAmount}>
              {(userDoc?.cash ?? 0).toLocaleString()}원
            </span>
          </div>
        </div>
        <div style={styles.balanceContainer}>
          <div style={styles.balanceText}>
            나의 통장 잔액:{" "}
            <span style={styles.balanceAmount}>
              {parkingBalance.toLocaleString()}원
            </span>
          </div>
          <div style={styles.interestText}>
            기본 일 이자율:{" "}
            <span style={styles.interestRate}>
              {typeof getParkingInterestRate() === "number"
                ? getParkingInterestRate().toFixed(3)
                : "N/A"}
              %
            </span>{" "}
            (일 단위 복리)
          </div>
          <div style={styles.dailyInterestText}>
            {userId &&
              parkingBalance > 0 &&
              `오늘 예상 이자: +${calculateParkingDailyInterestAmount().toLocaleString()}원`}
          </div>
        </div>
        <div style={styles.inputContainer}>
          <label style={styles.inputLabel}>입금/출금 금액</label>
          <div style={styles.inputWrapper}>
            <input
              type="text"
              value={parkingAmount}
              onChange={(e) =>
                setParkingAmount(e.target.value.replace(/[^0-9]/g, ""))
              }
              style={styles.input}
              placeholder="금액을 입력하세요"
              disabled={!userId || !userDoc}
              inputMode="numeric"
            />
            <span style={styles.inputCurrency}>원</span>
          </div>
        </div>
        <div style={styles.buttonContainer}>
          <button
            onClick={handleParkingDeposit}
            onMouseEnter={() => setDepositHover(true)}
            onMouseLeave={() => setDepositHover(false)}
            style={getDepositButtonStyle()}
            disabled={getDepositButtonStyle().cursor === "not-allowed"}
          >
            <span style={styles.buttonIcon}>↓</span> 나의 통장 입금
          </button>
          <button
            onClick={handleParkingWithdraw}
            onMouseEnter={() => setWithdrawHover(true)}
            onMouseLeave={() => setWithdrawHover(false)}
            style={getWithdrawButtonStyle()}
            disabled={getWithdrawButtonStyle().cursor === "not-allowed"}
          >
            <span style={styles.buttonIcon}>↑</span> 나의 통장 출금
          </button>
        </div>
        <div style={styles.buttonContainer}>
          <button
            onClick={() => openProductModal("savings")}
            style={{
              ...styles.baseButton,
              ...styles.financialProductButton,
              ...((!userId || !userDoc) && styles.disabledButton),
            }}
            disabled={!userId || !userDoc}
          >
            예금 가입
          </button>
          <button
            onClick={() => openProductModal("installment")}
            style={{
              ...styles.baseButton,
              ...styles.financialProductButton,
              ...((!userId || !userDoc) && styles.disabledButton),
            }}
            disabled={!userId || !userDoc}
          >
            적금 가입
          </button>
          <button
            onClick={() => openProductModal("loan")}
            style={{
              ...styles.baseButton,
              ...styles.financialProductButton,
              ...((!userId || !userDoc) && styles.disabledButton),
            }}
            disabled={!userId || !userDoc}
          >
            대출 신청
          </button>
        </div>
      </div>

      {userId && userDoc && (
        <div style={styles.innerContentContainer}>
          <div style={styles.userProductsContainer}>
            <h3 style={styles.userProductsHeader}>가입 상품 현황</h3>
            {/* 예금 상품 목록 */}
            {Array.isArray(userProducts.savings) &&
              userProducts.savings.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <h4 style={{ fontSize: "15px", marginBottom: "10px" }}>
                    예금 상품
                  </h4>
                  {userProducts.savings.map((saving) => {
                    if (
                      !saving ||
                      typeof saving.amount !== "number" ||
                      typeof saving.dailyRate !== "number" ||
                      typeof saving.termInDays !== "number"
                    )
                      return null;
                    const expectedInterest = calculateDailyCompoundInterest(
                      saving.amount,
                      saving.dailyRate,
                      saving.termInDays
                    );
                    const expectedMaturityAmount =
                      saving.amount + expectedInterest;
                    return (
                      <div key={saving.id} style={styles.userProductCard}>
                        <div style={styles.userProductTitle}>
                          <div style={styles.userProductName}>
                            {saving.name || "N/A"}
                          </div>
                          <div style={styles.userProductButtonContainer}>
                            <button
                              onClick={() => handleTerminateSaving(saving.id)}
                              style={{
                                ...styles.userProductButton,
                                backgroundColor: "#f44336",
                              }}
                            >
                              해지하기
                            </button>
                          </div>
                        </div>
                        <div style={styles.userProductDetails}>
                          <div style={styles.userProductItem}>
                            가입금액: {saving.amount.toLocaleString()}원
                          </div>
                          <div style={styles.userProductItem}>
                            일 이율:{" "}
                            <span style={styles.productRate}>
                              {typeof saving.dailyRate === "number"
                                ? saving.dailyRate.toFixed(3)
                                : "N/A"}
                              %
                            </span>
                          </div>
                          <div style={styles.userProductItem}>
                            기간: {saving.termInDays}일
                          </div>
                          <div style={styles.userProductItem}>
                            가입일: {formatShortDate(saving.startDate)}
                          </div>
                          <div style={styles.userProductItem}>
                            만기일: {formatShortDate(saving.maturityDate)}
                          </div>
                          <div style={styles.userProductItem}>
                            예상 만기금액:{" "}
                            {expectedMaturityAmount.toLocaleString()}원
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            {/* 적금 상품 목록 */}
            {Array.isArray(userProducts.installments) &&
              userProducts.installments.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <h4 style={{ fontSize: "15px", marginBottom: "10px" }}>
                    적금 상품
                  </h4>
                  {userProducts.installments.map((installment) => {
                    if (
                      !installment ||
                      typeof installment.monthlyAmount !== "number" ||
                      typeof installment.totalPaid !== "number" ||
                      typeof installment.dailyRate !== "number" ||
                      typeof installment.termInDays !== "number"
                    )
                      return null;
                    const nextPaymentDateStr = installment.nextPaymentDate;
                    let nextPaymentDateObj = null;
                    let paymentDue = false;
                    if (nextPaymentDateStr) {
                      nextPaymentDateObj = new Date(nextPaymentDateStr);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (!isNaN(nextPaymentDateObj.getTime())) {
                        const tempNextPayDate = new Date(nextPaymentDateObj);
                        tempNextPayDate.setHours(0, 0, 0, 0);
                        paymentDue = tempNextPayDate <= today;
                      }
                    }
                    return (
                      <div key={installment.id} style={styles.userProductCard}>
                        <div style={styles.userProductTitle}>
                          <div style={styles.userProductName}>
                            {installment.name || "N/A"}
                          </div>
                          <div style={styles.userProductButtonContainer}>
                            {paymentDue &&
                              new Date() <
                                new Date(installment.maturityDate) && (
                                <button
                                  onClick={() =>
                                    handleInstallmentPayment(installment.id)
                                  }
                                  style={{
                                    ...styles.userProductButton,
                                    backgroundColor: "#4caf50",
                                  }}
                                >
                                  납입하기
                                </button>
                              )}
                            <button
                              onClick={() =>
                                handleTerminateInstallment(installment.id)
                              }
                              style={{
                                ...styles.userProductButton,
                                backgroundColor: "#f44336",
                              }}
                            >
                              해지하기
                            </button>
                          </div>
                        </div>
                        <div style={styles.userProductDetails}>
                          <div style={styles.userProductItem}>
                            월 납입금액:{" "}
                            {installment.monthlyAmount.toLocaleString()}원
                          </div>
                          <div style={styles.userProductItem}>
                            총 납입금액:{" "}
                            {installment.totalPaid.toLocaleString()}원 (
                            {installment.paymentsMade || 0}회)
                          </div>
                          <div style={styles.userProductItem}>
                            일 이율:{" "}
                            <span style={styles.productRate}>
                              {typeof installment.dailyRate === "number"
                                ? installment.dailyRate.toFixed(3)
                                : "N/A"}
                              %
                            </span>
                          </div>
                          <div style={styles.userProductItem}>
                            기간: {installment.termInDays}일
                          </div>
                          <div style={styles.userProductItem}>
                            가입일: {formatShortDate(installment.startDate)}
                          </div>
                          <div style={styles.userProductItem}>
                            만기일: {formatShortDate(installment.maturityDate)}
                          </div>
                          {new Date() < new Date(installment.maturityDate) &&
                            installment.nextPaymentDate && (
                              <div style={styles.userProductItem}>
                                다음 납입일:{" "}
                                {formatShortDate(installment.nextPaymentDate)}
                                {paymentDue && (
                                  <span
                                    style={{
                                      color: "#f44336",
                                      marginLeft: "5px",
                                      fontWeight: "bold",
                                    }}
                                  >
                                    {" "}
                                    납입필요
                                  </span>
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            {/* 대출 상품 목록 */}
            {Array.isArray(userProducts.loans) &&
              userProducts.loans.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <h4 style={{ fontSize: "15px", marginBottom: "10px" }}>
                    대출 상품
                  </h4>
                  {userProducts.loans.map((loan) => {
                    if (
                      !loan ||
                      typeof loan.amount !== "number" ||
                      typeof loan.remainingPrincipal !== "number" ||
                      typeof loan.dailyRate !== "number" ||
                      typeof loan.termInDays !== "number" ||
                      typeof loan.approxMonthlyPrincipal !== "number"
                    )
                      return null;
                    let nextPaymentDateObj = null;
                    let paymentDue = false;
                    if (loan.nextPaymentDate && !loan.isRepaid) {
                      nextPaymentDateObj = new Date(loan.nextPaymentDate);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (!isNaN(nextPaymentDateObj.getTime())) {
                        const tempNextPayDate = new Date(nextPaymentDateObj);
                        tempNextPayDate.setHours(0, 0, 0, 0);
                        paymentDue = tempNextPayDate <= today;
                      }
                    }
                    let estimatedMonthlyPayment = 0;
                    if (!loan.isRepaid && loan.remainingPrincipal > 0) {
                      const lastPaymentD = new Date(
                        loan.lastPaymentDate || loan.startDate
                      );
                      const todayForCalc = new Date();
                      const daysDiff = calculateDaysBetween(
                        lastPaymentD,
                        todayForCalc
                      );
                      const interestForPeriod =
                        daysDiff > 0
                          ? calculateDailyCompoundInterest(
                              loan.remainingPrincipal,
                              loan.dailyRate,
                              daysDiff
                            )
                          : 0;
                      let principalPart = loan.approxMonthlyPrincipal;
                      if (principalPart > loan.remainingPrincipal)
                        principalPart = loan.remainingPrincipal;
                      estimatedMonthlyPayment = Math.round(
                        Math.max(0, principalPart) + interestForPeriod
                      );
                    }

                    return (
                      <div key={loan.id} style={styles.userProductCard}>
                        <div style={styles.userProductTitle}>
                          <div style={styles.userProductName}>
                            {loan.name || "N/A"}
                          </div>
                          <div style={styles.userProductButtonContainer}>
                            {!loan.isRepaid && (
                              <>
                                {paymentDue && (
                                  <button
                                    onClick={() => handleLoanRepayment(loan.id)}
                                    style={{
                                      ...styles.userProductButton,
                                      backgroundColor: "#4caf50",
                                    }}
                                    title={`이번 달 상환 예상 금액: ${estimatedMonthlyPayment.toLocaleString()}원 (나의 통장에서 출금)`}
                                  >
                                    월 상환
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    handleEarlyLoanRepayment(loan.id)
                                  }
                                  style={{
                                    ...styles.userProductButton,
                                    backgroundColor: "#ff9800",
                                  }}
                                  title={`중도상환 시 ${getEarlyRepaymentFeeRate()}% 수수료 발생 (보유 현금에서 출금)`}
                                >
                                  중도상환
                                </button>
                              </>
                            )}
                            {loan.isRepaid && (
                              <span
                                style={{
                                  fontSize: "12px",
                                  color: "#4caf50",
                                  fontWeight: "bold",
                                }}
                              >
                                상환 완료
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={styles.userProductDetails}>
                          <div style={styles.userProductItem}>
                            대출금액: {loan.amount.toLocaleString()}원
                          </div>
                          <div style={styles.userProductItem}>
                            남은원금:{" "}
                            {loan.isRepaid
                              ? 0
                              : loan.remainingPrincipal.toLocaleString()}
                            원
                          </div>
                          <div style={styles.userProductItem}>
                            일 이율:{" "}
                            <span
                              style={{
                                ...styles.productRate,
                                color: styles.withdrawAmount.color,
                              }}
                            >
                              {typeof loan.dailyRate === "number"
                                ? loan.dailyRate.toFixed(3)
                                : "N/A"}
                              %
                            </span>
                          </div>
                          <div style={styles.userProductItem}>
                            기간: {loan.termInDays}일 (상환횟수:{" "}
                            {loan.paymentsMade || 0}회)
                          </div>
                          <div style={styles.userProductItem}>
                            상환방식: 원금균등 (월 단위 상환)
                          </div>
                          <div style={styles.userProductItem}>
                            대출일: {formatShortDate(loan.startDate)}
                          </div>
                          <div style={styles.userProductItem}>
                            만기일: {formatShortDate(loan.maturityDate)}
                          </div>
                          {!loan.isRepaid && loan.nextPaymentDate && (
                            <>
                              <div style={styles.userProductItem}>
                                다음 상환일:{" "}
                                {formatShortDate(loan.nextPaymentDate)}
                                {paymentDue && (
                                  <span
                                    style={{
                                      color: "#f44336",
                                      marginLeft: "5px",
                                      fontWeight: "bold",
                                    }}
                                  >
                                    {" "}
                                    상환필요
                                  </span>
                                )}
                              </div>
                              <div style={styles.userProductItem}>
                                이번 달 상환 예정금:{" "}
                                {estimatedMonthlyPayment > 0
                                  ? estimatedMonthlyPayment.toLocaleString()
                                  : 0}
                                원
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            {userProducts.savings.length === 0 &&
              userProducts.installments.length === 0 &&
              userProducts.loans.length === 0 && (
                <div style={styles.emptyTransactions}>
                  가입한 금융 상품이 없습니다.
                </div>
              )}
          </div>

          <div style={styles.transactionsContainer}>
            <h3 style={styles.transactionsHeader}>
              거래 내역 (나의 통장 기준)
            </h3>
            {!Array.isArray(parkingTransactions) ||
            parkingTransactions.length === 0 ? (
              <div style={styles.emptyTransactions}>거래 내역이 없습니다.</div>
            ) : (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead style={styles.tableHeader}>
                    <tr>
                      <th style={styles.tableHeaderCell}>거래일시</th>
                      <th style={styles.tableHeaderCell}>거래구분</th>
                      <th style={styles.tableHeaderCellRight}>거래금액</th>
                      <th style={styles.tableHeaderCellRight}>잔액(통장)</th>
                      <th style={styles.tableHeaderCell}>비고</th>
                    </tr>
                  </thead>
                  <tbody style={styles.tableBody}>
                    {parkingTransactions.map((transaction) => (
                      <tr
                        key={transaction?.id || Math.random()}
                        style={styles.tableRow}
                      >
                        <td style={styles.tableCell}>
                          {formatDate(transaction?.date)}
                        </td>
                        <td style={styles.tableCell}>
                          {getTransactionTypeText(transaction?.type)}
                        </td>
                        <td
                          style={{
                            ...styles.tableCellRight,
                            ...getAmountStyle(transaction?.type),
                          }}
                        >
                          {transaction &&
                            getAmountDisplayText(
                              transaction.type,
                              transaction.amount
                            )}
                        </td>
                        <td style={styles.tableCellRight}>
                          {typeof transaction?.balance === "number"
                            ? transaction.balance.toLocaleString()
                            : "N/A"}
                          원
                        </td>
                        <td
                          style={{
                            ...styles.tableCell,
                            whiteSpace: "normal",
                            wordBreak: "break-all",
                          }}
                        >
                          {transaction?.detail || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showProductModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContainer}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>
                {productType === "savings"
                  ? "예금 가입"
                  : productType === "installment"
                  ? "적금 가입"
                  : "대출 신청"}
              </h3>
              <button style={styles.closeButton} onClick={closeProductModal}>
                ×
              </button>
            </div>
            <div style={styles.modalForm}>
              <div>
                <label style={styles.inputLabel}>상품 선택</label>
                <div style={styles.productList}>
                  {productType === "savings" &&
                    propSavingsProducts.map((product) => (
                      <div
                        key={product.id}
                        style={{
                          ...styles.productCard,
                          ...(selectedProduct?.id === product.id
                            ? styles.productCardSelected
                            : {}),
                        }}
                        onClick={() => handleSelectProduct(product)}
                      >
                        <div style={styles.productName}>
                          {product.name || "N/A"}
                        </div>
                        <div>
                          <div style={styles.productDetail}>
                            일 금리:{" "}
                            <span style={styles.productRate}>
                              {typeof product.dailyRate === "number"
                                ? product.dailyRate.toFixed(3)
                                : "N/A"}
                              %
                            </span>
                          </div>
                          <div style={styles.productDetail}>
                            기간: {product.termInDays || "N/A"}일
                          </div>
                          <div style={styles.productDetail}>
                            최소 가입:{" "}
                            {(product.minAmount || 0).toLocaleString()}원
                          </div>
                        </div>
                      </div>
                    ))}
                  {productType === "installment" &&
                    propInstallmentProducts.map((product) => (
                      <div
                        key={product.id}
                        style={{
                          ...styles.productCard,
                          ...(selectedProduct?.id === product.id
                            ? styles.productCardSelected
                            : {}),
                        }}
                        onClick={() => handleSelectProduct(product)}
                      >
                        <div style={styles.productName}>
                          {product.name || "N/A"}
                        </div>
                        <div>
                          <div style={styles.productDetail}>
                            일 금리:{" "}
                            <span style={styles.productRate}>
                              {typeof product.dailyRate === "number"
                                ? product.dailyRate.toFixed(3)
                                : "N/A"}
                              %
                            </span>
                          </div>
                          <div style={styles.productDetail}>
                            기간: {product.termInDays || "N/A"}일
                          </div>
                          <div style={styles.productDetail}>
                            최소 월납입:{" "}
                            {(product.minAmount || 0).toLocaleString()}원
                          </div>
                        </div>
                      </div>
                    ))}
                  {productType === "loan" &&
                    propLoanProducts.map((product) => (
                      <div
                        key={product.id}
                        style={{
                          ...styles.productCard,
                          ...(selectedProduct?.id === product.id
                            ? styles.productCardSelected
                            : {}),
                        }}
                        onClick={() => handleSelectProduct(product)}
                      >
                        <div style={styles.productName}>
                          {product.name || "N/A"}
                        </div>
                        <div>
                          <div style={styles.productDetail}>
                            일 금리:{" "}
                            <span
                              style={{
                                ...styles.productRate,
                                color: styles.withdrawAmount.color,
                              }}
                            >
                              {typeof product.dailyRate === "number"
                                ? product.dailyRate.toFixed(3)
                                : "N/A"}
                              %
                            </span>
                          </div>
                          <div style={styles.productDetail}>
                            기간: {product.termInDays || "N/A"}일
                          </div>
                          <div style={styles.productDetail}>
                            최대 대출:{" "}
                            {(product.maxAmount || 0).toLocaleString()}원
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              {selectedProduct && (
                <div style={styles.inputContainer}>
                  <label style={styles.inputLabel}>
                    {productType === "savings"
                      ? "가입 금액"
                      : productType === "installment"
                      ? "월 납입 금액"
                      : "대출 금액"}
                  </label>
                  <div style={styles.inputWrapper}>
                    <input
                      type="text"
                      value={productAmount}
                      onChange={handleProductAmountChange}
                      style={styles.input}
                      placeholder={
                        productType === "savings"
                          ? `최소 ${(
                              selectedProduct.minAmount || 0
                            ).toLocaleString()}원 이상`
                          : productType === "installment"
                          ? `최소 ${(
                              selectedProduct.minAmount || 0
                            ).toLocaleString()}원 이상`
                          : `최대 ${(
                              selectedProduct.maxAmount || 0
                            ).toLocaleString()}원 이하`
                      }
                      inputMode="numeric"
                    />
                    <span style={styles.inputCurrency}>원</span>
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#757575",
                      marginTop: "4px",
                    }}
                  >
                    {productType === "savings" &&
                      `최소 가입 금액: ${(
                        selectedProduct.minAmount || 0
                      ).toLocaleString()}원 (보유 현금에서 출금)`}
                    {productType === "installment" &&
                      `최소 월 납입 금액: ${(
                        selectedProduct.minAmount || 0
                      ).toLocaleString()}원 (가입 시 출금 없음)`}
                    {productType === "loan" &&
                      (() => {
                        const currentLoansTotal = (userProducts.loans || [])
                          .filter(
                            (loan) =>
                              loan.productId === selectedProduct.id &&
                              !loan.isRepaid
                          )
                          .reduce(
                            (sum, loan) => sum + (loan.remainingPrincipal || 0),
                            0
                          );
                        const availableLoanLimit = Math.max(
                          0,
                          (selectedProduct.maxAmount || 0) - currentLoansTotal
                        );
                        return `최대 대출 가능 금액: ${(
                          selectedProduct.maxAmount || 0
                        ).toLocaleString()}원 (현재 이 상품으로 추가 가능액: ${availableLoanLimit.toLocaleString()}원, 보유 현금으로 입금)`;
                      })()}
                  </div>
                </div>
              )}
              {selectedProduct &&
                (() => {
                  const amountNum = parseInt(productAmount);
                  const isAmountValid = !isNaN(amountNum) && amountNum > 0;
                  let isDisabled = true;
                  const minAmount = selectedProduct.minAmount || 0;
                  const maxAmount = selectedProduct.maxAmount || 0;

                  if (productType === "savings") {
                    isDisabled =
                      !isAmountValid ||
                      amountNum < minAmount ||
                      (userDoc?.cash ?? 0) < amountNum;
                  } else if (productType === "installment") {
                    isDisabled = !isAmountValid || amountNum < minAmount;
                  } else if (productType === "loan") {
                    const currentLoansTotal = (userProducts.loans || [])
                      .filter(
                        (loan) =>
                          loan.productId === selectedProduct.id &&
                          !loan.isRepaid
                      )
                      .reduce(
                        (sum, loan) => sum + (loan.remainingPrincipal || 0),
                        0
                      );
                    const availableLoanLimit = Math.max(
                      0,
                      maxAmount - currentLoansTotal
                    );
                    isDisabled =
                      !isAmountValid ||
                      amountNum > maxAmount ||
                      amountNum > availableLoanLimit;
                  }
                  const activeBackground =
                    productType === "savings"
                      ? "#1976d2"
                      : productType === "installment"
                      ? "#388e3c"
                      : "#f57c00";
                  return (
                    <button
                      onClick={
                        productType === "savings"
                          ? handleSavingsSubmit
                          : productType === "installment"
                          ? handleInstallmentSubmit
                          : handleLoanSubmit
                      }
                      style={{
                        ...styles.baseButton,
                        padding: "12px",
                        marginTop: "10px",
                        width: "100%",
                        ...(isDisabled
                          ? styles.disabledButton
                          : {
                              background: activeBackground,
                              color: "white",
                              cursor: "pointer",
                            }),
                      }}
                      disabled={isDisabled}
                    >
                      {productType === "savings"
                        ? "예금 가입하기"
                        : productType === "installment"
                        ? "적금 가입하기"
                        : "대출 신청하기"}
                    </button>
                  );
                })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParkingAccount;
