/* eslint-disable */
/**
 * GitHub Actions에서 HTTP로 호출 가능한 스케줄러 엔드포인트
 * 기존 onSchedule 함수들의 로직을 HTTP 호출 가능하게 변환
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions/v2");
const admin = require("firebase-admin");

// Admin이 이미 초기화되어 있지 않으면 초기화
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// 보안: 간단한 인증 토큰 체크 (GitHub Actions에서만 호출 가능)
const AUTH_TOKEN = process.env.SCHEDULER_AUTH_TOKEN || "github-actions-scheduler-2024";

function verifyAuth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== AUTH_TOKEN) {
    throw new Error('Unauthorized');
  }
}

// ===================================================================================
// 📌 주석: 아래 함수들을 실제 index.js의 로직으로 교체해야 합니다
// 지금은 index.js에서 로직을 import하여 재사용하도록 구성합니다
// ===================================================================================

/**
 * 통합 스케줄러 엔드포인트
 * POST /runScheduler
 * Body: { tasks: ['updateStocks', 'createNews', ...] }
 */
exports.runScheduler = onRequest({
  region: "asia-northeast3",
  timeoutSeconds: 540, // 9분
  invoker: 'public', // 인증 없이 호출 가능 (Authorization 헤더로 보안 유지)
}, async (req, res) => {
  try {
    verifyAuth(req);

    const tasks = req.body?.tasks || [];
    logger.info(`[runScheduler] 요청된 작업: ${tasks.join(', ')}`);

    const results = {};

    // 각 작업 실행
    for (const task of tasks) {
      try {
        switch(task) {
          case 'updateStocks':
            await updateCentralStockMarketLogic();
            results[task] = 'success';
            break;
          case 'manageStocks':
            await autoManageStocksLogic();
            results[task] = 'success';
            break;
          case 'cleanupStocks':
            await cleanupWorthlessStocksLogic();
            results[task] = 'success';
            break;
          case 'createNews':
            await createCentralMarketNewsLogic();
            results[task] = 'success';
            break;
          case 'cleanupNews':
            await cleanupExpiredCentralNewsLogic();
            results[task] = 'success';
            break;
          case 'syncNews':
            await syncCentralNewsToClassesLogic();
            results[task] = 'success';
            break;
          case 'cleanupClassNews':
            await cleanupExpiredClassNewsLogic();
            results[task] = 'success';
            break;
          case 'resetDaily':
            await resetDailyTasksLogic();
            results[task] = 'success';
            break;
          case 'paySalaries':
            await payWeeklySalariesLogic();
            results[task] = 'success';
            break;
          case 'collectRent':
            await collectWeeklyRentLogic();
            results[task] = 'success';
            break;
          case 'provideSafety':
            await provideSocialSafetyNetLogic();
            results[task] = 'success';
            break;
          case 'openMarket':
            await openMarketLogic();
            results[task] = 'success';
            break;
          case 'closeMarket':
            await closeMarketLogic();
            results[task] = 'success';
            break;
          case 'aggregateStats':
            await aggregateActivityStatsLogic();
            results[task] = 'success';
            break;
          case 'updateClassStats':
            await updateClassStatsLogic();
            results[task] = 'success';
            break;
          case 'updatePortfolio':
            await updatePortfolioSummaryLogic();
            results[task] = 'success';
            break;
          case 'aggregateLogs':
            await aggregateActivityLogsLogic();
            results[task] = 'success';
            break;
          default:
            results[task] = 'unknown';
        }
      } catch (error) {
        logger.error(`[runScheduler] ${task} 실행 중 오류:`, error);
        results[task] = `error: ${error.message}`;
      }
    }

    res.json({success: true, results});
  } catch (error) {
    logger.error('[runScheduler] 오류:', error);
    res.status(error.message === 'Unauthorized' ? 401 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// ===================================================================================
// 실제 로직 함수들 (index.js에서 복사)
// ===================================================================================

// 이 함수들은 index.js의 onSchedule 내부 로직을 복사하면 됩니다
// 간단한 placeholder로 시작합니다

async function updateCentralStockMarketLogic() {
  logger.info("📈 주식 시장 업데이트 실행");
  // TODO: index.js의 updateCentralStockMarket 로직 복사
}

async function autoManageStocksLogic() {
  logger.info("🔄 자동 주식 관리 실행");
  // TODO: index.js의 autoManageStocks 로직 복사
}

async function cleanupWorthlessStocksLogic() {
  logger.info("🧹 무가치 주식 정리 실행");
  // TODO: index.js의 cleanupWorthlessStocks 로직 복사
}

async function createCentralMarketNewsLogic() {
  logger.info("📰 중앙 뉴스 생성 실행");
  // TODO: index.js의 createCentralMarketNews 로직 복사
}

async function cleanupExpiredCentralNewsLogic() {
  logger.info("🧹 만료 뉴스 정리 실행");
  // TODO: index.js의 cleanupExpiredCentralNews 로직 복사
}

async function syncCentralNewsToClassesLogic() {
  logger.info("🔄 뉴스 동기화 실행");
  // TODO: index.js의 syncCentralNewsToClasses 로직 복사
}

async function cleanupExpiredClassNewsLogic() {
  logger.info("🧹 클래스 뉴스 정리 실행");
  // TODO: index.js의 cleanupExpiredClassNews 로직 복사
}

async function resetDailyTasksLogic() {
  logger.info("🔄 일일 작업 리셋 실행");
  // TODO: index.js의 resetDailyTasks 로직 복사
}

async function payWeeklySalariesLogic() {
  logger.info("💰 주급 지급 실행");
  // TODO: index.js의 payWeeklySalaries 로직 복사
}

async function collectWeeklyRentLogic() {
  logger.info("🏠 임대료 징수 실행");
  // TODO: index.js의 collectWeeklyRent 로직 복사
}

async function provideSocialSafetyNetLogic() {
  logger.info("🛡️ 사회안전망 제공 실행");
  // TODO: index.js의 provideSocialSafetyNet 로직 복사
}

async function openMarketLogic() {
  logger.info("🔓 시장 개장 실행");
  // TODO: index.js의 openMarket 로직 복사
}

async function closeMarketLogic() {
  logger.info("🔒 시장 폐장 실행");
  // TODO: index.js의 closeMarket 로직 복사
}

async function aggregateActivityStatsLogic() {
  logger.info("📊 활동 통계 집계 실행");
  // TODO: index.js의 aggregateActivityStats 로직 복사
}

async function updateClassStatsLogic() {
  logger.info("📊 클래스 통계 업데이트 실행");
  // TODO: index.js의 updateClassStats 로직 복사
}

async function updatePortfolioSummaryLogic() {
  logger.info("📊 포트폴리오 요약 업데이트 실행");
  // TODO: index.js의 updatePortfolioSummary 로직 복사
}

async function aggregateActivityLogsLogic() {
  logger.info("📊 활동 로그 집계 실행");
  // TODO: index.js의 aggregateActivityLogs 로직 복사
}
