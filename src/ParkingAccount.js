// src/ParkingAccount.js
import React, { useState, useEffect, useCallback } from "react";
import { db, doc, getDoc, setDoc, serverTimestamp, updateDoc, increment, runTransaction, collection, getDocs, deleteDoc } from "./firebase";
import { format, isToday, differenceInDays } from 'date-fns';
import { PiggyBank, Landmark, HandCoins, Wallet, X } from 'lucide-react';

// --- Styles ---
const styles = {
  container: { fontFamily: 'sans-serif', backgroundColor: '#f0f2f5', padding: '24px', minHeight: '100vh' },
  message: (type) => ({ padding: '12px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', color: type === 'error' ? '#721c24' : '#155724', backgroundColor: type === 'error' ? '#f8d7da' : '#d4edda' }),
  grid: { display: 'grid', gap: '24px' },
  card: { backgroundColor: '#ffffff', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)', borderRadius: '12px', padding: '24px' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' },
  cardTitle: { fontSize: '20px', fontWeight: 'bold', color: '#111827' },
  tabContainer: { display: 'flex', borderBottom: '1px solid #d1d5db', marginBottom: '16px' },
  tabButton: (isActive) => ({ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: isActive ? '#4f46e5' : '#6b7280', borderBottom: `2px solid ${isActive ? '#4f46e5' : 'transparent'}`, marginBottom: '-1px', fontWeight: isActive ? '600' : '500' }),
  button: (disabled, variant = 'primary') => ({ backgroundColor: variant === 'primary' ? '#4f46e5' : (variant === 'danger' ? '#dc2626' : '#4b5563'), color: 'white', padding: '10px 16px', borderRadius: '8px', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }),
  noProduct: { textAlign: 'center', color: '#6b7280', padding: '16px 0' },
  input: { width: '100%', padding: '10px 12px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', marginBottom: '16px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { background: 'white', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '400px', position: 'relative' },
  modalTitle: { fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' },
  modalCloseBtn: { position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer' },
};

// --- Helper Functions & Sub-Components ---
const formatCurrency = (amount) => (typeof amount === 'number' ? Math.round(amount).toLocaleString() : '0');
const calculateMaturity = (principal, annualRate, termInDays) => {
  if (principal <= 0 || !annualRate || termInDays <= 0) return { interest: 0, total: principal };
  const interest = principal * (annualRate / 100) * (termInDays / 365);
  return { interest, total: principal + interest };
};

const ICON_MAP = {
  parking: <Wallet size={24} style={{ color: '#4f46e5' }} />,
  deposits: <Landmark size={24} style={{ color: '#16a34a' }} />,
  savings: <PiggyBank size={24} style={{ color: '#2563eb' }} />,
  loans: <HandCoins size={24} style={{ color: '#dc2626' }} />,
};

const SubscribedProductItem = ({ product, onCancel }) => {
  const { interest, total } = calculateMaturity(product.balance, product.rate, product.termInDays);
  return (
    <div style={{padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '12px', background: '#f9fafb'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: '600'}}><span>{product.name}</span><span>{formatCurrency(product.balance)}원</span></div>
      <div style={{fontSize: '14px', color: '#6b7280', marginTop: '8px', display: 'grid', gap: '4px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between'}}><span>금리:</span> <span>{product.rate}%</span></div>
        {product.maturityDate && <div style={{display: 'flex', justifyContent: 'space-between'}}><span>만기일:</span> <span>{format(product.maturityDate, 'yyyy-MM-dd')}</span></div>}
      </div>
      <div style={{borderTop: '1px dashed #d1d5db', margin: '12px 0'}}></div>
      <div style={{fontSize: '14px', color: '#374151', display: 'grid', gap: '4px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between'}}><span>만기 시 이자 (세전):</span> <span style={{fontWeight: '600', color: '#16a34a'}}>+{formatCurrency(interest)}원</span></div>
        <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 'bold'}}><span>만기 시 총액:</span> <span>{formatCurrency(total)}원</span></div>
      </div>
      <div style={{marginTop: '16px', textAlign: 'right'}}>
        <button onClick={onCancel} style={{...styles.button(false, 'danger'), padding: '6px 12px', fontSize: '14px'}}>{product.type === 'loan' ? '대출 상환' : '중도 해지'}</button>
      </div>
    </div>
  );
};

const AvailableProductItem = ({ product, onSubscribe }) => (
  <div style={{padding: '12px', border: '1px solid #eee', borderRadius: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
    <div>
      <div style={{fontWeight: '600'}}>{product.name}</div>
      <div style={{fontSize: '14px', color: '#6b7280', marginTop: '4px'}}>금리 {product.annualRate}% (기간: {product.termInDays}일)</div>
    </div>
    <button onClick={onSubscribe} style={styles.button(false)}>가입</button>
  </div>
);

const ProductSection = ({ title, icon, subscribedProducts, availableProducts, onSubscribe, onCancel }) => {
  const [activeTab, setActiveTab] = useState('subscribed');
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}> {icon} <h2 style={styles.cardTitle}>{title}</h2> </div>
      <div style={styles.tabContainer}>
        <button onClick={() => setActiveTab('subscribed')} style={styles.tabButton(activeTab === 'subscribed')}>가입한 상품</button>
        <button onClick={() => setActiveTab('available')} style={styles.tabButton(activeTab === 'available')}>가입 가능한 상품</button>
      </div>
      <div>
        {activeTab === 'subscribed' && (subscribedProducts.length > 0 ? subscribedProducts.map(p => <SubscribedProductItem key={p.id} product={p} onCancel={() => onCancel(p)} />) : <p style={styles.noProduct}>가입한 상품이 없습니다.</p>)}
        {activeTab === 'available' && (availableProducts.length > 0 ? availableProducts.map(p => <AvailableProductItem key={p.id} product={p} onSubscribe={() => onSubscribe(p)} />) : <p style={styles.noProduct}>가입 가능한 상품이 없습니다.</p>)}
      </div>
    </div>
  );
};

const SubscriptionModal = ({ isOpen, onClose, product, onConfirm, isProcessing }) => {
  const [amount, setAmount] = useState("");
  if (!isOpen) return null;
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContent}>
        <button onClick={onClose} style={styles.modalCloseBtn}><X size={24} /></button>
        <h3 style={styles.modalTitle}>{product.name} 가입</h3>
        <p style={{marginBottom: '8px'}}>금액을 입력해주세요.</p>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={styles.input} placeholder={`${formatCurrency(product.minAmount || 0)}원 이상`} />
        <button onClick={() => {onConfirm(amount); setAmount("");}} disabled={isProcessing} style={{...styles.button(isProcessing), width: '100%'}}>{isProcessing ? '처리 중...' : '가입하기'}</button>
      </div>
    </div>
  );
};

const ParkingAccountSection = ({ balance, onDeposit, onWithdraw, isProcessing }) => {
  const [amount, setAmount] = useState("");
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}> {ICON_MAP.parking} <h2 style={styles.cardTitle}>파킹통장</h2> </div>
      <div style={{fontSize: '32px', fontWeight: 'bold', color: '#111827'}}>{formatCurrency(balance)}원</div>
      <p style={{fontSize: '14px', color: '#6b7280', marginBottom: '24px'}}>매일 이자가 자동 지급되는 자유 입출금 통장</p>
      <div style={{display: 'flex', gap: '8px'}}>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="금액 입력" style={{...styles.input, marginBottom: 0}} disabled={isProcessing} />
        <button onClick={() => {onDeposit(amount); setAmount("");}} disabled={isProcessing} style={styles.button(isProcessing)}>입금</button>
        <button onClick={() => {onWithdraw(amount); setAmount("");}} disabled={isProcessing} style={{...styles.button(isProcessing), backgroundColor: '#4b5563'}}>출금</button>
      </div>
    </div>
  );
};

// --- Main Component ---
const ParkingAccount = ({ auth = {}, savingsProducts = [], installmentProducts = [], loanProducts = [] }) => {
  const { user, userDoc, loading, refreshUserDocument } = auth;
  const userId = user?.uid;

  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [parkingBalance, setParkingBalance] = useState(0);
  const [userDeposits, setUserDeposits] = useState([]);
  const [userSavings, setUserSavings] = useState([]);
  const [userLoans, setUserLoans] = useState([]);
  const [modal, setModal] = useState({ isOpen: false, product: null, type: '' });

  const displayMessage = (text, type = "info", duration = 3000) => { setMessage(text); setMessageType(type); if (duration) setTimeout(() => setMessage(null), duration); };

  const loadAllData = useCallback(async () => {
    if (!userId) return;
    setIsProcessing(true);
    try {
      const parkingRef = doc(db, "users", userId, "financials", "parkingAccount");
      const parkingRateProduct = savingsProducts.length > 0 ? savingsProducts[0] : null;
      if (parkingRateProduct) {
        const parkingDoc = await getDoc(parkingRef);
        if (parkingDoc.exists()) {
          const data = parkingDoc.data();
          const lastInterestDate = data.lastInterestDate?.toDate();
          if (!lastInterestDate || !isToday(lastInterestDate)) {
            const daysToApply = lastInterestDate ? differenceInDays(new Date(), lastInterestDate) : 1;
            if (daysToApply > 0) {
              const dailyRate = (parkingRateProduct.annualRate || 0) / 365 / 100;
              const interest = Math.floor(data.balance * Math.pow(1 + dailyRate, daysToApply) - data.balance);
              if (interest > 0) {
                await updateDoc(parkingRef, { balance: increment(interest), lastInterestDate: serverTimestamp() });
                displayMessage(`파킹통장 이자 ${formatCurrency(interest)}원이 지급되었습니다.`, 'success');
              }
            }
          }
        }
      }

      const finalParkingDoc = await getDoc(parkingRef);
      if (finalParkingDoc.exists()) setParkingBalance(finalParkingDoc.data().balance || 0);

      const productsRef = collection(db, "users", userId, "products");
      const snapshot = await getDocs(productsRef);
      const deposits = [], savings = [], loans = [];
      snapshot.forEach(doc => {
        const product = { id: doc.id, ...doc.data(), maturityDate: doc.data().maturityDate?.toDate() };
        if (product.type === 'deposit') deposits.push(product);
        else if (product.type === 'savings') savings.push(product);
        else if (product.type === 'loan') loans.push(product);
      });
      setUserDeposits(deposits);
      setUserSavings(savings);
      setUserLoans(loans);
    } catch (error) { console.error("데이터 로드 오류:", error); displayMessage("데이터를 불러오는 데 실패했습니다.", "error");
    } finally { setIsProcessing(false); }
  }, [userId, savingsProducts]);

  useEffect(() => { if (!loading && userId) loadAllData(); }, [userId, loading, loadAllData]);

  const handleOpenModal = (product, type) => setModal({ isOpen: true, product, type });
  const handleCloseModal = () => setModal({ isOpen: false, product: null, type: '' });

  const handleSubscribe = async (subscribeAmount) => {
    const amount = parseFloat(subscribeAmount);
    const { product, type } = modal;
    if (isNaN(amount) || amount <= 0) return displayMessage("유효한 금액을 입력하세요.", "error");
    if (product.minAmount && amount < product.minAmount) return displayMessage(`최소 가입 금액은 ${formatCurrency(product.minAmount)}원입니다.`, "error");
    if (product.maxAmount && amount > product.maxAmount) return displayMessage(`최대 가입 한도는 ${formatCurrency(product.maxAmount)}원입니다.`, "error");

    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", userId);
        const userSnapshot = await transaction.get(userRef);
        const currentCash = userSnapshot.data()?.cash ?? 0;
        if (type !== 'loans' && currentCash < amount) throw new Error("보유 현금이 부족합니다.");

        const newProductData = { 
          name: product.name, termInDays: product.termInDays, rate: product.annualRate, balance: amount, 
          startDate: serverTimestamp(), maturityDate: new Date(new Date().setDate(new Date().getDate() + product.termInDays)),
          type: type === 'deposits' ? 'deposit' : (type === 'savings' ? 'savings' : 'loan'),
        };
        transaction.set(doc(collection(db, "users", userId, "products")), newProductData);
        transaction.update(userRef, { cash: increment(type === 'loans' ? amount : -amount) });
      });
      displayMessage("상품 가입이 완료되었습니다.", "success");
      loadAllData();
      if (refreshUserDocument) refreshUserDocument();
      handleCloseModal();
    } catch (error) { displayMessage(`가입 처리 오류: ${error.message}`, "error");
    } finally { setIsProcessing(false); }
  };
  
  const handleCancelEarly = async (product) => {
    const isLoan = product.type === 'loan';
    if (!window.confirm(isLoan ? `대출금 ${formatCurrency(product.balance)}원을 상환하시겠습니까?` : `'${product.name}'을(를) 중도 해지하시겠습니까?`)) return;

    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", userId);
        const productRef = doc(db, "users", userId, "products", product.id);
        const userSnapshot = await transaction.get(userRef);
        const currentCash = userSnapshot.data()?.cash ?? 0;
        if (isLoan && currentCash < product.balance) throw new Error("대출금을 상환하기에 현금이 부족합니다.");
        transaction.update(userRef, { cash: increment(isLoan ? -product.balance : product.balance) });
        transaction.delete(productRef);
      });
      displayMessage(`${isLoan ? '대출 상환' : '중도 해지'} 완료.`, "success");
      loadAllData();
      if (refreshUserDocument) refreshUserDocument();
    } catch (error) { displayMessage(`처리 오류: ${error.message}`, "error");
    } finally { setIsProcessing(false); }
  };

  const handleParkingTransaction = async (amountStr, isDeposit) => {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return displayMessage("유효한 금액을 입력하세요.", "error");
    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", userId);
        const parkingRef = doc(db, "users", userId, "financials", "parkingAccount");
        const userSnapshot = await transaction.get(userRef);
        const currentCash = userSnapshot.data()?.cash ?? 0;
        if (isDeposit && currentCash < amount) throw new Error("보유 현금이 부족합니다.");
        const parkingSnapshot = await transaction.get(parkingRef);
        const currentParkingBalance = parkingSnapshot.data()?.balance ?? 0;
        if (!isDeposit && currentParkingBalance < amount) throw new Error("파킹통장 잔액이 부족합니다.");
        transaction.update(userRef, { cash: increment(isDeposit ? -amount : amount) });
        transaction.update(parkingRef, { balance: increment(isDeposit ? amount : -amount) });
      });
      displayMessage(`${formatCurrency(amount)}원 ${isDeposit ? '입금' : '출금'} 완료.`, "success");
      loadAllData();
      if (refreshUserDocument) refreshUserDocument();
    } catch (error) { displayMessage(`처리 오류: ${error.message}`, "error");
    } finally { setIsProcessing(false); }
  };

  if (loading) return <div style={styles.container}>금융 정보를 불러오는 중입니다...</div>;
  if (!user) return <div style={styles.container}>로그인이 필요합니다.</div>;

  return (
    <div style={styles.container}>
      {message && <div style={styles.message(messageType)}>{message}</div>}
      <div style={styles.grid}>
        <ParkingAccountSection balance={parkingBalance} onDeposit={handleParkingTransaction} onWithdraw={(amount) => handleParkingTransaction(amount, false)} isProcessing={isProcessing} />
        <ProductSection title="예금" icon={ICON_MAP.deposits} subscribedProducts={userDeposits} availableProducts={savingsProducts} onSubscribe={(p) => handleOpenModal(p, 'deposits')} onCancel={handleCancelEarly} />
        <ProductSection title="적금" icon={ICON_MAP.savings} subscribedProducts={userSavings} availableProducts={installmentProducts} onSubscribe={(p) => handleOpenModal(p, 'savings')} onCancel={handleCancelEarly} />
        <ProductSection title="대출" icon={ICON_MAP.loans} subscribedProducts={userLoans} availableProducts={loanProducts} onSubscribe={(p) => handleOpenModal(p, 'loans')} onCancel={handleCancelEarly} />
      </div>
      <SubscriptionModal isOpen={modal.isOpen} onClose={handleCloseModal} product={modal.product} onConfirm={handleSubscribe} isProcessing={isProcessing} />
    </div>
  );
};

export default ParkingAccount;