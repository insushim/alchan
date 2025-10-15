// src/services/stockAutoManagementService.js
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  collectionGroup,
  writeBatch,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';

// 상장 폐지 조건 확인
const shouldDelist = (stock) => {
  if (!stock || stock.isManual) return false; // 수동 주식은 폐지 안 함

  const initialPrice = stock.initialPrice || stock.price;
  const currentPrice = stock.price;

  // 최소 상장가(초기가의 10%)에 도달하면 상장 폐지
  const minListingPrice = initialPrice * 0.1;
  return currentPrice <= minListingPrice;
};

// 자동 재상장 조건 확인 (초기 가격으로 회복)
const shouldAutoList = (stock) => {
  if (!stock || stock.isManual || stock.isListed) return false;

  const initialPrice = stock.initialPrice || stock.price;
  const currentPrice = stock.price;

  // 초기 가격 이상으로 회복하면 재상장하고 가격을 초기가로 리셋
  return currentPrice >= initialPrice;
};

// 상장 폐지 처리
export const delistInactiveStocks = async () => {
  try {
    console.log('[Stock Auto] 상장 폐지 검사 시작');

    const stocksRef = collection(db, 'CentralStocks');
    const q = query(stocksRef, where('isListed', '==', true), where('isManual', '==', false));
    const snapshot = await getDocs(q);

    const batch = writeBatch(db);
    const delistedStocks = [];

    for (const docSnap of snapshot.docs) {
      const stock = { id: docSnap.id, ...docSnap.data() };

      if (shouldDelist(stock)) {
        const stockRef = doc(db, 'CentralStocks', stock.id);
        batch.update(stockRef, {
          isListed: false,
          delistedAt: serverTimestamp(),
          delistReason: '가격 급락 (초기가의 10% 미만)',
        });
        delistedStocks.push(stock);
      }
    }

    if (delistedStocks.length > 0) {
      await batch.commit();

      // 폐지된 주식의 포트폴리오 업데이트
      for (const stock of delistedStocks) {
        await markPortfoliosAsDelisted(stock.id);
      }

      console.log(`[Stock Auto] ${delistedStocks.length}개 주식 상장 폐지 완료:`,
        delistedStocks.map(s => s.name));
    } else {
      console.log('[Stock Auto] 상장 폐지 대상 없음');
    }

    return delistedStocks;
  } catch (error) {
    console.error('[Stock Auto] 상장 폐지 처리 오류:', error);
    return [];
  }
};

// 자동 재상장 처리 (가격을 초기가로 리셋)
export const autoListStocks = async () => {
  try {
    console.log('[Stock Auto] 재상장 검사 시작');

    const stocksRef = collection(db, 'CentralStocks');
    const q = query(stocksRef, where('isListed', '==', false), where('isManual', '==', false));
    const snapshot = await getDocs(q);

    const batch = writeBatch(db);
    const relistedStocks = [];

    for (const docSnap of snapshot.docs) {
      const stock = { id: docSnap.id, ...docSnap.data() };

      if (shouldAutoList(stock)) {
        const stockRef = doc(db, 'CentralStocks', stock.id);
        const initialPrice = stock.initialPrice || stock.price;

        // 재상장 시 가격을 초기가로 리셋
        batch.update(stockRef, {
          isListed: true,
          price: initialPrice,
          relistedAt: serverTimestamp(),
          delistedAt: null,
          delistReason: null,
        });
        relistedStocks.push(stock);
      }
    }

    if (relistedStocks.length > 0) {
      await batch.commit();
      console.log(`[Stock Auto] ${relistedStocks.length}개 주식 재상장 완료 (가격 초기화):`,
        relistedStocks.map(s => s.name));
    } else {
      console.log('[Stock Auto] 재상장 대상 없음');
    }

    return relistedStocks;
  } catch (error) {
    console.error('[Stock Auto] 재상장 처리 오류:', error);
    return [];
  }
};

// 포트폴리오를 상장폐지 상태로 마킹 (CentralStocks에 기록)
const markPortfoliosAsDelisted = async (stockId) => {
  try {
    // CentralStocks에 상장폐지 정보 기록
    const stockRef = doc(db, 'CentralStocks', stockId);
    const stockSnap = await getDoc(stockRef);

    if (!stockSnap.exists()) {
      console.warn('[Stock Auto] 주식 문서를 찾을 수 없음:', stockId);
      return;
    }

    const stock = stockSnap.data();

    // 주식 문서에 포트폴리오 폐지 정보 추가
    await updateDoc(stockRef, {
      portfolioDelistMarked: true,
      portfolioDelistMarkedAt: serverTimestamp(),
    });

    // 1시간 후 자동 삭제 스케줄
    scheduleDelistedStockCleanup(stockId);

    console.log(`[Stock Auto] 주식 ${stock.name} 상장폐지 마킹 완료 (보유자: ${stock.holderCount || 0}명)`);
  } catch (error) {
    console.error('[Stock Auto] 포트폴리오 마킹 오류:', error);
  }
};

// 1시간 후 상장폐지 주식 자동 삭제 스케줄
const scheduleDelistedStockCleanup = (stockId) => {
  setTimeout(async () => {
    try {
      await cleanupDelistedPortfolios(stockId);
    } catch (error) {
      console.error('[Stock Auto] 자동 삭제 오류:', error);
    }
  }, 60 * 60 * 1000); // 1시간
};

// 상장폐지된 포트폴리오 자동 삭제 (주식 정보만 업데이트)
export const cleanupDelistedPortfolios = async (stockId) => {
  try {
    const stockRef = doc(db, 'CentralStocks', stockId);
    const stockSnap = await getDoc(stockRef);

    if (!stockSnap.exists()) {
      console.warn('[Stock Auto] 주식 문서를 찾을 수 없음:', stockId);
      return;
    }

    const stock = stockSnap.data();
    const delistedAt = stock.portfolioDelistMarkedAt;

    if (!delistedAt) {
      console.log('[Stock Auto] 상장폐지 마킹이 없는 주식:', stockId);
      return;
    }

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // 1시간 이상 경과한 경우에만 처리
    if (delistedAt.toMillis() < oneHourAgo) {
      // 주식 문서에 자동 삭제 완료 표시
      await updateDoc(stockRef, {
        portfolioAutoCleanupDone: true,
        portfolioAutoCleanupAt: serverTimestamp(),
      });

      console.log(`[Stock Auto] 주식 ${stock.name} 포트폴리오 자동 정리 완료 표시`);
    }
  } catch (error) {
    console.error('[Stock Auto] 포트폴리오 삭제 오류:', error);
  }
};

// 주기적 자동 관리 실행
export const runStockAutoManagement = async () => {
  console.log('[Stock Auto] 자동 관리 실행 시작');

  try {
    const [delisted, relisted] = await Promise.all([
      delistInactiveStocks(),
      autoListStocks()
    ]);

    return {
      success: true,
      delisted: delisted.length,
      relisted: relisted.length,
      timestamp: new Date()
    };
  } catch (error) {
    console.error('[Stock Auto] 자동 관리 실행 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// 자동 관리 스케줄러 시작 (10분마다)
export const startAutoManagementScheduler = () => {
  console.log('[Stock Auto] 스케줄러 시작 (10분 간격)');

  // 즉시 한 번 실행
  runStockAutoManagement();

  // 10분마다 실행
  const interval = setInterval(() => {
    runStockAutoManagement();
  }, 10 * 60 * 1000);

  return () => {
    console.log('[Stock Auto] 스케줄러 중지');
    clearInterval(interval);
  };
};
