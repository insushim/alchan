/* eslint-disable */
/**
 * GitHub Actions에서 HTTP로 호출 가능한 스케줄러 엔드포인트입니다.
 * 기존 onSchedule 함수의 로직을 HTTP 호출 가능하게 변환
 */

const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  checkAuthAndGetUserData,
  db,
  admin,
  logger
} = require("./utils");
const {
  updateRealStockPrices,
  createRealStocks,
  addSingleRealStock,
  getAvailableSymbols,
  updateExchangeRate,
  getCurrentExchangeRate,
  DEFAULT_REAL_STOCKS,
  updateCentralStocksSnapshot,
  getCentralStocksSnapshot
} = require("./realStockService");

// 보안: 간단한 인증 토큰 체크 (GitHub Actions에서 호출 가능)
const AUTH_TOKEN = process.env.SCHEDULER_AUTH_TOKEN || "github-actions-scheduler-2024";

// [삭제됨] SECTOR_NEWS_TEMPLATES - 뉴스 기능 제거됨

function verifyAuth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== AUTH_TOKEN) {
    throw new Error('Unauthorized');
  }
}

// ===================================================================================
// TODO 주석: 아래 함수들을 실제 index.js의 로직으로 교체해야 합니다.
// 지금은 index.js에서 로직을 import하여 유사하게 하도록 구성합니다.
// ===================================================================================

// Deprecated: 더 이상 사용되지 않는 runScheduler 함수 제거
// 이유: GitHub Actions 사용했었으나 더 이상 사용하지 않음
// 대신 simpleScheduler를 cron-job.org에서 사용 중

// 수동 테스트용 엔드포인트 (관리자용)
exports.manualUpdateStockMarket = onCall({ region: "asia-northeast3" }, async (request) => {
  await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

  logger.info(">>> [수동 실행] 주식 시장 업데이트 시작");

  try {
    await updateCentralStockMarketLogic();

    return {
      success: true,
      message: "주식 가격 업데이트 완료"
    };
  } catch (error) {
    logger.error(">> [수동 실행] 오류:", error);
    throw new HttpsError("internal", error.message || "업데이트 실패");
  }
});

// 간단한 GET 방식 스케줄러 (cron-job.org 등 외부 cron 서비스용)
exports.simpleScheduler = onRequest({
  region: "asia-northeast3",
  timeoutSeconds: 540,
  invoker: 'public',
}, async (req, res) => {
  try {
    // URL 파라미터로 인증 토큰 확인
    const token = req.query.token;
    if (token !== AUTH_TOKEN) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // 🔥 최적화: 이 스케줄러는 더 이상 사용되지 않음 (deprecated)
    // stockPriceScheduler가 동일한 역할을 수행하므로, 중복 실행을 막기 위해 즉시 종료
    logger.info(`[simpleScheduler] 호출됨 - Deprecated. 아무 작업도 수행하지 않고 종료합니다.`);
    res.json({ success: true, message: 'Scheduler is deprecated and no longer in use.' });
    return;

  } catch (error) {
    logger.error('[simpleScheduler] 전체 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 주식 가격 업데이트용 스케줄러 (15분마다 실행 - cron-job.org)
// 🔥 최적화: 실제 주식만 업데이트 (시뮬레이션 로직 제거)
exports.stockPriceScheduler = onRequest({
  region: "asia-northeast3",
  timeoutSeconds: 540,
  invoker: 'public',
}, async (req, res) => {
  try {
    const token = req.query.token;
    if (token !== AUTH_TOKEN) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const now = new Date();
    const kstOffset = 9 * 60;
    const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
    const hour = kstTime.getUTCHours();
    const day = kstTime.getUTCDay();

    logger.info(`[stockPriceScheduler] 호출됨 - KST ${hour}시, 요일: ${day}`);

    // 평일(1-5) 8시-18시 KST (한국+미국 시장 커버)
    const isWeekday = day >= 1 && day <= 5;
    const isMarketHours = hour >= 8 && hour < 18;

    if (!isWeekday || !isMarketHours) {
      logger.info(`[stockPriceScheduler] 시장 시간 아님 - 작업 건너뜀`);
      res.json({
        success: true,
        message: '시장 시간 아님 - 작업 건너뜀',
        kstHour: hour,
        day: day
      });
      return;
    }

    // 🔥 최적화: 캐시된 활성 사용자 상태 사용 (읽기 최소화)
    const forceUpdate = req.query.force === 'true';

    if (!forceUpdate) {
      // 🔥 Settings 문서에서 마지막 활성 시간 확인 (1회 읽기로 최적화)
      const settingsDoc = await db.doc("Settings/activeStatus").get();
      const lastActiveTime = settingsDoc.exists ? settingsDoc.data()?.lastActiveAt?.toDate() : null;
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      if (!lastActiveTime || lastActiveTime < thirtyMinutesAgo) {
        logger.info(`[stockPriceScheduler] 활성 사용자 없음 - 작업 건너뜀 (읽기 비용 절감)`);
        res.json({
          success: true,
          message: '활성 사용자 없음 - 작업 건너뜀',
          kstHour: hour,
          skippedReason: 'no_active_users'
        });
        return;
      }
    } else {
      logger.info(`[stockPriceScheduler] force=true - 활성 사용자 체크 건너뜀`);
    }

    logger.info(`[stockPriceScheduler] 활성 사용자 있음 - 실제 주식 가격 업데이트 시작`);

    const results = {};

    // 🔥 실제 주식 데이터만 업데이트 (Yahoo Finance)
    try {
      const realStockResult = await updateRealStockPrices();
      results.updateRealStocks = `success (updated: ${realStockResult.updated}, failed: ${realStockResult.failed})`;
      logger.info(`[stockPriceScheduler] 실제 주식 업데이트 완료:`, realStockResult);

      // 업데이트된 가격을 기반으로 스냅샷 문서도 갱신하여 클라이언트 읽기 횟수 절감
      const snapshotResult = await updateCentralStocksSnapshot();
      results.updateStocksSnapshot = `success (count: ${snapshotResult.count})`;
      logger.info(`[stockPriceScheduler] 중앙 스톡 스냅샷 갱신 완료:`, snapshotResult);
    } catch (error) {
      logger.error('[stockPriceScheduler] 가격/스냅샷 업데이트 오류:', error);
      results.updateRealStocks = `error: ${error.message}`;
    }

    logger.info(`[stockPriceScheduler] 작업 완료:`, results);

    res.json({ success: true, results, kstHour: hour });
  } catch (error) {
    logger.error('[stockPriceScheduler] 전체 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 자정 리셋용 간단한 GET 엔드포인트
exports.midnightReset = onRequest({
  region: "asia-northeast3",
  timeoutSeconds: 540,
  invoker: 'public',
}, async (req, res) => {
  try {
    const token = req.query.token;
    if (token !== AUTH_TOKEN) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    logger.info(`[midnightReset] 일일 과제 리셋 시작`);

    await resetDailyTasksLogic();

    res.json({ success: true, message: '일일 과제 리셋 완료' });
  } catch (error) {
    logger.error('[midnightReset] 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 주급 지급용 GET 엔드포인트 (매주 금요일 또는 원하는 요일에 실행)
exports.weeklySalary = onRequest({
  region: "asia-northeast3",
  timeoutSeconds: 540,
  invoker: 'public',
}, async (req, res) => {
  try {
    const token = req.query.token;
    if (token !== AUTH_TOKEN) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    logger.info(`[weeklySalary] 주급 지급 시작`);

    await payWeeklySalariesLogic();

    res.json({ success: true, message: '주급 지급 완료' });
  } catch (error) {
    logger.error('[weeklySalary] 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 월세 징수용 GET 엔드포인트 (매주 금요일 14:40에 실행)
exports.weeklyRent = onRequest({
  region: "asia-northeast3",
  timeoutSeconds: 540,
  invoker: 'public',
}, async (req, res) => {
  try {
    const token = req.query.token;
    if (token !== AUTH_TOKEN) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    logger.info(`[weeklyRent] 월세 징수 시작`);

    await collectWeeklyRentLogic();

    res.json({ success: true, message: '월세 징수 완료' });
  } catch (error) {
    logger.error('[weeklyRent] 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Deprecated: cleanupOldNews 함수 제거
// 이유: simpleScheduler의 cleanupExpiredCentralNews와 중복
// 또한 simpleScheduler가 15분마다 자동으로 만료된 뉴스를 정리함

// 🔥 실제 주식 생성 (관리자용 Cloud Function)
exports.createRealStocksFunction = onCall({ region: "asia-northeast3" }, async (request) => {
  await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

  const { stocks } = request.data;

  logger.info("[createRealStocks] 실제 주식 생성 요청 - 관리자 호출");

  try {
    // 사용자가 지정한 주식 목록이 있으면 사용, 없으면 기본 목록 사용
    const stocksToCreate = stocks && stocks.length > 0 ? stocks : DEFAULT_REAL_STOCKS;

    const result = await createRealStocks(stocksToCreate);
    const snapshotResult = await updateCentralStocksSnapshot();

    return {
      success: true,
      message: `실제 주식 ${result.created}개 생성 완료 (스냅샷 ${snapshotResult.count}개)`,
      created: result.created,
      snapshot: snapshotResult
    };
  } catch (error) {
    logger.error("[createRealStocks] 오류:", error);
    throw new HttpsError("internal", error.message || "실제 주식 생성 실패");
  }
});

// 🔥 실제 주식 가격 수동 업데이트 (관리자용 Cloud Function)
exports.updateRealStocksFunction = onCall({ region: "asia-northeast3" }, async (request) => {
  await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

  logger.info("[updateRealStocks] 실제 주식 가격 수동 업데이트 요청 - 관리자 호출");

  try {
    const result = await updateRealStockPrices();
    const snapshotResult = await updateCentralStocksSnapshot();

    return {
      success: true,
      message: `실제 주식 업데이트 완료 - 성공: ${result.updated}, 실패: ${result.failed} (스냅샷 ${snapshotResult.count}개)`,
      ...result,
      snapshot: snapshotResult
    };
  } catch (error) {
    logger.error("[updateRealStocks] 오류:", error);
    throw new HttpsError("internal", error.message || "실제 주식 업데이트 실패");
  }
});

// 🔥 개별 실제 주식/ETF 추가 (관리자용 Cloud Function)
exports.addSingleRealStockFunction = onCall({ region: "asia-northeast3" }, async (request) => {
  await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

  const { name, symbol, sector, productType } = request.data;

  if (!name) {
    throw new HttpsError("invalid-argument", "주식 이름이 필요합니다.");
  }

  logger.info(`[addSingleRealStock] 개별 실제 주식 추가 요청: ${name}`);

  try {
    const result = await addSingleRealStock({ name, symbol, sector, productType });

    if (!result.success) {
      throw new HttpsError("failed-precondition", result.error);
    }

    const snapshotResult = await updateCentralStocksSnapshot();

    return {
      success: true,
      message: `${name} 추가 완료! (스냅샷 ${snapshotResult.count}개)`,
      stock: result.stock,
      snapshot: snapshotResult
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("[addSingleRealStock] 오류:", error);
    throw new HttpsError("internal", error.message || "주식 추가 실패");
  }
});

// 🔥 스냅샷만 별도로 갱신 (관리자용)
exports.updateStocksSnapshotFunction = onCall({ region: "asia-northeast3" }, async (request) => {
  await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능
  logger.info("[updateStocksSnapshot] 스냅샷 갱신 요청 - 관리자 호출");

  try {
    const snapshotResult = await updateCentralStocksSnapshot();

    return {
      success: true,
      message: `스냅샷 갱신 완료 - ${snapshotResult.count}개`,
      ...snapshotResult
    };
  } catch (error) {
    logger.error("[updateStocksSnapshot] 오류:", error);
    throw new HttpsError("internal", error.message || "스냅샷 갱신 실패");
  }
});

// 🔥 스냅샷 조회 (사용자용) - 없으면 생성 후 반환
exports.getStocksSnapshotFunction = onCall({ region: "asia-northeast3" }, async (request) => {
  await checkAuthAndGetUserData(request, false); // 일반 사용자도 가능
  logger.info("[getStocksSnapshot] 스냅샷 조회 요청");

  try {
    const snapshot = await getCentralStocksSnapshot();
    return {
      success: true,
      ...snapshot
    };
  } catch (error) {
    logger.error("[getStocksSnapshot] 오류:", error);
    throw new HttpsError("internal", error.message || "스냅샷 조회 실패");
  }
});

// 🔥 관리자용 단일 주식 추가 (규칙 우회용)
exports.addStockDocFunction = onCall({ region: "asia-northeast3" }, async (request) => {
  await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

  const { stock } = request.data || {};
  if (!stock || !stock.name || !stock.price || !stock.minListingPrice) {
    throw new HttpsError("invalid-argument", "stock(name, price, minListingPrice)이 필요합니다.");
  }

  try {
    const stockRef = db.collection("CentralStocks").doc();
    const stockData = {
      ...stock,
      initialPrice: stock.price,
      priceHistory: [stock.price],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      holderCount: 0,
      tradingVolume: 1000,
      buyVolume: 0,
      sellVolume: 0,
      recentBuyVolume: 0,
      recentSellVolume: 0,
      volatility: stock.volatility || (stock.productType === "bond" ? 0.005 : 0.02),
      isListed: stock.isListed !== undefined ? stock.isListed : true,
      isManual: !!stock.isManual,
      sector: stock.sector || "TECH",
      productType: stock.productType || "stock",
    };

    await stockRef.set(stockData);
    const snapshotResult = await updateCentralStocksSnapshot();

    return {
      success: true,
      id: stockRef.id,
      snapshot: snapshotResult
    };
  } catch (error) {
    logger.error("[addStockDocFunction] 오류:", error);
    throw new HttpsError("internal", error.message || "주식 추가 실패");
  }
});

// 🔥 사용 가능한 실제 주식 심볼 목록 조회
exports.getAvailableSymbolsFunction = onCall({ region: "asia-northeast3" }, async (request) => {
  await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

  logger.info("[getAvailableSymbols] 사용 가능한 심볼 목록 조회");

  try {
    const symbols = getAvailableSymbols();
    const currentRate = getCurrentExchangeRate();

    return {
      success: true,
      symbols: symbols,
      exchangeRate: currentRate
    };
  } catch (error) {
    logger.error("[getAvailableSymbols] 오류:", error);
    throw new HttpsError("internal", error.message || "심볼 목록 조회 실패");
  }
});

// 🔥 환율 수동 업데이트 (관리자용 Cloud Function)
exports.updateExchangeRateFunction = onCall({ region: "asia-northeast3" }, async (request) => {
  await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

  logger.info("[updateExchangeRate] 환율 수동 업데이트 요청");

  try {
    const result = await updateExchangeRate();

    return {
      success: true,
      message: `환율 업데이트 완료: 1 USD = ${result.rate} KRW`,
      rate: result.rate,
      updated: result.updated
    };
  } catch (error) {
    logger.error("[updateExchangeRate] 오류:", error);
    throw new HttpsError("internal", error.message || "환율 업데이트 실패");
  }
});

// 🔥 환율 자동 업데이트 스케줄러 (하루 1회 - cron-job.org용)
exports.exchangeRateScheduler = onRequest({
  region: "asia-northeast3",
  timeoutSeconds: 60,
  invoker: 'public',
}, async (req, res) => {
  try {
    const token = req.query.token;
    if (token !== AUTH_TOKEN) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    logger.info(`[exchangeRateScheduler] 환율 자동 업데이트 시작`);

    const result = await updateExchangeRate();

    logger.info(`[exchangeRateScheduler] 환율 업데이트 완료: ${result.rate}원`);

    res.json({
      success: true,
      message: `환율 업데이트 완료`,
      rate: result.rate,
      updated: result.updated
    });
  } catch (error) {
    logger.error('[exchangeRateScheduler] 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔥 시뮬레이션 주식 삭제 (관리자용 Cloud Function)
exports.deleteSimulationStocksFunction = onCall({ region: "asia-northeast3" }, async (request) => {
  await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

  logger.info("[deleteSimulationStocks] 시뮬레이션 주식 삭제 요청");

  try {
    // isRealStock이 없거나 false인 주식 가져오기
    const simulationStocksSnapshot = await db.collection("CentralStocks")
      .where("isRealStock", "!=", true)
      .get();

    // isRealStock 필드가 없는 주식도 포함
    const allStocksSnapshot = await db.collection("CentralStocks").get();

    const stocksToDelete = [];
    allStocksSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!data.isRealStock) {
        stocksToDelete.push(doc);
      }
    });

    if (stocksToDelete.length === 0) {
      return {
        success: true,
        message: '삭제할 시뮬레이션 주식이 없습니다.',
        deletedCount: 0
      };
    }

    // 배치로 삭제 (500개씩)
    let deletedCount = 0;
    const batchSize = 500;

    for (let i = 0; i < stocksToDelete.length; i += batchSize) {
      const batch = db.batch();
      const chunk = stocksToDelete.slice(i, i + batchSize);

      chunk.forEach(doc => {
        batch.delete(doc.ref);
        deletedCount++;
      });

      await batch.commit();
    }

    logger.info(`[deleteSimulationStocks] ${deletedCount}개의 시뮬레이션 주식 삭제 완료`);

    return {
      success: true,
      message: `시뮬레이션 주식 ${deletedCount}개 삭제 완료`,
      deletedCount: deletedCount
    };
  } catch (error) {
    logger.error("[deleteSimulationStocks] 오류:", error);
    throw new HttpsError("internal", error.message || "시뮬레이션 주식 삭제 실패");
  }
});

// ===================================================================================
// 실제 로직 함수들 (대부분 Deprecated - 실제 주식만 사용)
// ===================================================================================

/**
 * FCM 푸시 알림 제거
 * 이유:
 * 1. 사용자에게 알림 스팸 (15분마다 모든 사용자에게 푸시)
 * 2. 트래픽 증가 (푸시 받으면 fetchAllData(true)로 캐시 무시하고 강제 트래픽)
 * 3. 사용자 경험 저하 (앱 꺼져있는데 계속 알림)
 *
 * 대안:
 * - 30초 캐시로 충분한 최신 데이터 제공
 * - 1분마다 자동 폴링 (부드러운 업데이트)
 * - 사용자가 원할 때 새로고침 버튼 사용
 */
// async function sendMarketUpdateNotification() {
//   const topic = 'market_updates';
//   const message = {
//     data: {
//       type: 'MARKET_UPDATE',
//       timestamp: String(Date.now()),
//     },
//     topic: topic,
//   };
//   try {
//     await admin.messaging().send(message);
//     logger.info(`→ FCM 메시지를 '${topic}' 토픽으로 발송했습니다.`);
//   } catch (error) {
//     logger.error(`FCM 메시지 발송 실패:`, error);
//   }
// }

// [삭제됨] 시뮬레이션 로직 - 실제 주식만 사용
// updateMarketConditionLogic, updateCentralStockMarketLogic, autoManageStocksLogic 등 제거됨

// 하위 호환성을 위한 빈 함수 (manualUpdateStockMarket에서 호출)
async function updateCentralStockMarketLogic() {
  logger.info(">>> [스케줄러] 시뮬레이션 로직 비활성화됨 - 실제 주식만 사용");
  // 실제 주식 가격은 stockPriceScheduler에서 Yahoo Finance를 통해 업데이트됨
  return null;
}

async function resetTasksForClass(classCode) {
  if (!classCode) {
    logger.error("resetTasksForClass: 학급 코드가 제공되지 않았습니다.");
    return { userCount: 0, jobCount: 0 };
  }
  try {
    const batch = db.batch();
    let userCount = 0;

    // 사용자별 일일 진행 상황 리셋 (공통 과제 + 직업 과제)
    const usersQuery = db.collection("users").where("classCode", "==", classCode);
    const usersSnapshot = await usersQuery.get();
    if (!usersSnapshot.empty) {
      usersSnapshot.forEach((userDoc) => {
        batch.update(userDoc.ref, {
          completedTasks: {},        // 공통 과제 리셋
          completedJobTasks: {}      // 직업 과제 리셋 (개인)
        });
        userCount++;
      });
    }

    await batch.commit();
    logger.info(`[${classCode}] 리셋 완료: ${userCount}명 학생.`);
    return { userCount, jobCount: 0 };
  } catch (error) {
    logger.error(`[${classCode}] 과제 리셋 중 심각한 오류:`, error);
    throw error;
  }
}

async function resetDailyTasksLogic() {
  logger.info(">>> [스케줄러] 일일 과제 리셋 시작");
  try {
    const classCodesDoc = await db.collection("settings").doc("classCodes").get();
    if (!classCodesDoc.exists) {
      logger.warn("'settings/classCodes' 문서가 없어 클래스 목록을 가져올 수 없습니다.");
      return;
    }
    const classCodes = classCodesDoc.data().validCodes;
    if (!classCodes || classCodes.length === 0) {
      logger.info("리셋할 클래스가 없습니다.");
      return;
    }
    const resetPromises = classCodes.map((classCode) => resetTasksForClass(classCode));
    const results = await Promise.all(resetPromises);
    let totalUserCount = 0;
    let totalJobCount = 0;
    results.forEach(result => {
      totalUserCount += result.userCount;
      totalJobCount += result.jobCount;
    });
    logger.info(`→ 일일 과제 리셋 완료: ${classCodes.length}개 클래스, 총 ${totalUserCount}명 학생, ${totalJobCount}개 직업 리셋`);
  } catch (error) {
    logger.error("→ 일일 과제 리셋 중 오류 발생:", error);
    throw error; // re-throw to be caught by the main handler
  }
}

async function payWeeklySalariesLogic() {
  logger.info(">>> [스케줄러] 주급 지급 시작");
  try {
    // 모든 학급 코드 가져오기
    const classCodesDoc = await db.collection("settings").doc("classCodes").get();
    if (!classCodesDoc.exists) {
      logger.warn("classCodes 문서가 없습니다.");
      return;
    }

    const classCodes = classCodesDoc.data().validCodes || [];
    let totalPaidCount = 0;
    let totalAmount = 0;

    for (const classCode of classCodes) {
      // 학급별 급여 설정 조회
      const salaryDoc = await db.collection("classSettings")
        .doc(classCode)
        .collection("settings")
        .doc("salary")
        .get();

      if (!salaryDoc.exists) continue;

      const salarySettings = salaryDoc.data();

      // 학급 학생들 조회
      const studentsSnapshot = await db.collection("users")
        .where("classCode", "==", classCode)
        .where("role", "==", "student")
        .get();

      if (studentsSnapshot.empty) continue;

      // 배치로 급여 지급
      const batch = db.batch();
      let classCount = 0;

      studentsSnapshot.forEach(doc => {
        const student = doc.data();
        const job = student.job || "무직";
        const salary = salarySettings[job] || 0;

        if (salary > 0) {
          batch.update(doc.ref, {
            cash: admin.firestore.FieldValue.increment(salary),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          classCount++;
          totalAmount += salary;
        }
      });

      if (classCount > 0) {
        await batch.commit();
        totalPaidCount += classCount;
        logger.info(`[주급 지급] ${classCode}: ${classCount}명에게 총 ${totalAmount.toLocaleString()}원 지급`);
      }
    }

    logger.info(`→ 주급 지급 완료: 총 ${totalPaidCount}명, ${totalAmount.toLocaleString()}원`);
  } catch (error) {
    logger.error("→ 주급 지급 중 오류:", error);
    throw error;
  }
}

async function collectWeeklyRentLogic() {
  logger.info(">>> [스케줄러] 월세 징수 시작");
  try {
    // 모든 학급 코드 가져오기
    const classCodesDoc = await db.collection("settings").doc("classCodes").get();
    if (!classCodesDoc.exists) {
      logger.warn("classCodes 문서가 없습니다.");
      return;
    }

    const classCodes = classCodesDoc.data().validCodes || [];
    let totalCollected = 0;
    let totalTenantsCount = 0;

    for (const classCode of classCodes) {
      logger.info(`[월세 징수] ${classCode} 클래스 처리 시작`);

      // 학급의 모든 부동산 조회
      const propertiesSnapshot = await db.collection("classes")
        .doc(classCode)
        .collection("realEstateProperties")
        .get();

      if (propertiesSnapshot.empty) {
        logger.info(`[월세 징수] ${classCode}: 부동산이 없습니다.`);
        continue;
      }

      let classCollected = 0;
      let classTenantsCount = 0;

      for (const propertyDoc of propertiesSnapshot.docs) {
        const property = propertyDoc.data();

        // 세입자가 있는 경우에만 처리
        if (!property.tenantId || !property.rent) {
          continue;
        }

        classTenantsCount++;

        try {
          await db.runTransaction(async (transaction) => {
            const now = admin.firestore.Timestamp.now();

            // 세입자 정보 조회
            const tenantRef = db.collection("users").doc(property.tenantId);
            const tenantDoc = await transaction.get(tenantRef);

            if (!tenantDoc.exists) {
              logger.warn(`[월세 징수] 세입자 ${property.tenantId} 문서가 없습니다.`);
              return;
            }

            const tenantData = tenantDoc.data();
            const rentAmount = property.rent;

            // 집주인 정보 조회
            let ownerRef = null;
            if (property.owner && property.owner !== "government") {
              ownerRef = db.collection("users").doc(property.owner);
              const ownerDoc = await transaction.get(ownerRef);
              if (!ownerDoc.exists) {
                logger.warn(`[월세 징수] 집주인 ${property.owner} 문서가 없습니다.`);
              }
            }

            // 강제 징수: 돈이 부족해도 마이너스로 차감
            const newTenantCash = tenantData.cash - rentAmount;

            // 세입자 돈 차감 (마이너스 허용)
            transaction.update(tenantRef, {
              cash: newTenantCash,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 집주인에게 월세 지급 (본인 소유 아닌 경우)
            if (ownerRef && property.owner !== property.tenantId) {
              transaction.update(ownerRef, {
                cash: admin.firestore.FieldValue.increment(rentAmount),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }

            // 부동산 문서 업데이트
            transaction.update(propertyDoc.ref, {
              lastRentPayment: now,
              updatedAt: now,
            });

            classCollected += rentAmount;
            logger.info(
              `[월세 징수] ${property.tenantName} → ${property.ownerName || "정부"}: ${rentAmount.toLocaleString()}원 ${newTenantCash < 0 ? "(마이너스 발생)" : ""
              }`
            );
          });
        } catch (error) {
          logger.error(`[월세 징수] 부동산 ${property.id} 처리 중 오류:`, error);
        }
      }

      totalCollected += classCollected;
      totalTenantsCount += classTenantsCount;
      logger.info(
        `[월세 징수] ${classCode} 완료: ${classTenantsCount}명 세입자, 총 ${classCollected.toLocaleString()}원`
      );
    }

    logger.info(`→ 월세 징수 완료: 총 ${totalTenantsCount}명, ${totalCollected.toLocaleString()}원`);
  } catch (error)
 {
    logger.error("→ 월세 징수 중 오류:", error);
    throw error;
  }
}

async function provideSocialSafetyNetLogic() {
  logger.info(">>> [스케줄러] 사회안전망 제공 시작");
  // 추후 복지 시스템과 연동하여 구현 예정
  logger.info("사회안전망 제공 로직은 아직 구현되지 않았습니다.");
}

async function openMarketLogic() {
  logger.info(">>> [스케줄러] 시장 개장 시작");
  // 필요시 시장 상태 플래그 설정 등으로 구현 가능
  logger.info("시장 개장 로직은 아직 구현되지 않았습니다.");
}

async function closeMarketLogic() {
  logger.info(">>> [스케줄러] 시장 폐장 시작");
  // 필요시 시장 상태 플래그 설정 등으로 구현 가능
  logger.info("시장 폐장 로직은 아직 구현되지 않았습니다.");
}

async function aggregateActivityStatsLogic() {
  logger.info(">>> [스케줄러] 활동 통계 집계 시작");
  // 필요시 추후에 구현
}

async function updateClassStatsLogic() {
  logger.info(">>> [스케줄러] 클래스 통계 업데이트 시작");
  // 필요시 추후에 구현
}

async function updatePortfolioSummaryLogic() {
  logger.info(">>> [스케줄러] 포트폴리오 요약 업데이트 시작");
  // 필요시 추후에 구현
}

async function aggregateActivityLogsLogic() {
  logger.info(">>> [스케줄러] 활동 로그 집계 시작");
  // 필요시 추후에 구현
}

// ===================================================================================
// 외부에서 사용될 수 있도록 로직 함수들 export
// ===================================================================================
module.exports.updateCentralStockMarketLogic = updateCentralStockMarketLogic; // 하위 호환성용 빈 함수
module.exports.resetDailyTasksLogic = resetDailyTasksLogic;
module.exports.resetTasksForClass = resetTasksForClass;
