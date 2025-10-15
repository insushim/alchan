/* eslint-disable */
/**
 * GitHub Actions에서 직접 호출 가능한 스케줄러 함수들
 * onSchedule를 사용하지 않고 직접 호출 가능한 형태로 export
 */

const admin = require("firebase-admin");
const {logger} = require("firebase-functions/v2");

// admin이 이미 초기화되어 있지 않으면 초기화
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// index.js에서 필요한 함수들을 import
// 실제로는 index.js의 로직을 여기서 재사용할 것입니다

/**
 * 주식 시장 업데이트 (Manual 버전)
 */
async function updateCentralStockMarketManual() {
  logger.info("--- [Manual] updateCentralStockMarket 실행 ---");

  // 이 함수는 실제 구현을 위해 index.js의 로직을 참조해야 합니다
  // 현재는 placeholder만 작성
  console.log("주식 시장 업데이트 실행됨");
}

/**
 * 자동 주식 관리 (Manual 버전)
 */
async function autoManageStocksManual() {
  logger.info("--- [Manual] autoManageStocks 실행 ---");
  console.log("자동 주식 관리 실행됨");
}

/**
 * 무가치 주식 정리 (Manual 버전)
 */
async function cleanupWorthlessStocksManual() {
  logger.info("--- [Manual] cleanupWorthlessStocks 실행 ---");
  console.log("무가치 주식 정리 실행됨");
}

/**
 * 중앙 뉴스 생성 (Manual 버전)
 */
async function createCentralMarketNewsManual() {
  logger.info("--- [Manual] createCentralMarketNews 실행 ---");
  console.log("중앙 뉴스 생성 실행됨");
}

/**
 * 만료된 중앙 뉴스 정리 (Manual 버전)
 */
async function cleanupExpiredCentralNewsManual() {
  logger.info("--- [Manual] cleanupExpiredCentralNews 실행 ---");
  console.log("만료된 중앙 뉴스 정리 실행됨");
}

/**
 * 클래스 뉴스 동기화 (Manual 버전)
 */
async function syncCentralNewsToClassesManual() {
  logger.info("--- [Manual] syncCentralNewsToClasses 실행 ---");
  console.log("클래스 뉴스 동기화 실행됨");
}

/**
 * 클래스 만료 뉴스 정리 (Manual 버전)
 */
async function cleanupExpiredClassNewsManual() {
  logger.info("--- [Manual] cleanupExpiredClassNews 실행 ---");
  console.log("클래스 만료 뉴스 정리 실행됨");
}

/**
 * 일일 작업 리셋 (Manual 버전)
 */
async function resetDailyTasksManual() {
  logger.info("--- [Manual] resetDailyTasks 실행 ---");
  console.log("일일 작업 리셋 실행됨");
}

/**
 * 주급 지급 (Manual 버전)
 */
async function payWeeklySalariesManual() {
  logger.info("--- [Manual] payWeeklySalaries 실행 ---");
  console.log("주급 지급 실행됨");
}

/**
 * 임대료 징수 (Manual 버전)
 */
async function collectWeeklyRentManual() {
  logger.info("--- [Manual] collectWeeklyRent 실행 ---");
  console.log("임대료 징수 실행됨");
}

/**
 * 사회안전망 제공 (Manual 버전)
 */
async function provideSocialSafetyNetManual() {
  logger.info("--- [Manual] provideSocialSafetyNet 실행 ---");
  console.log("사회안전망 제공 실행됨");
}

/**
 * 시장 개장 (Manual 버전)
 */
async function openMarketManual() {
  logger.info("--- [Manual] openMarket 실행 ---");
  console.log("시장 개장 실행됨");
}

/**
 * 시장 폐장 (Manual 버전)
 */
async function closeMarketManual() {
  logger.info("--- [Manual] closeMarket 실행 ---");
  console.log("시장 폐장 실행됨");
}

/**
 * 활동 통계 집계 (Manual 버전)
 */
async function aggregateActivityStatsManual() {
  logger.info("--- [Manual] aggregateActivityStats 실행 ---");
  console.log("활동 통계 집계 실행됨");
}

/**
 * 클래스 통계 업데이트 (Manual 버전)
 */
async function updateClassStatsManual() {
  logger.info("--- [Manual] updateClassStats 실행 ---");
  console.log("클래스 통계 업데이트 실행됨");
}

/**
 * 포트폴리오 요약 업데이트 (Manual 버전)
 */
async function updatePortfolioSummaryManual() {
  logger.info("--- [Manual] updatePortfolioSummary 실행 ---");
  console.log("포트폴리오 요약 업데이트 실행됨");
}

/**
 * 활동 로그 집계 (Manual 버전)
 */
async function aggregateActivityLogsManual() {
  logger.info("--- [Manual] aggregateActivityLogs 실행 ---");
  console.log("활동 로그 집계 실행됨");
}

module.exports = {
  updateCentralStockMarketManual,
  autoManageStocksManual,
  cleanupWorthlessStocksManual,
  createCentralMarketNewsManual,
  cleanupExpiredCentralNewsManual,
  syncCentralNewsToClassesManual,
  cleanupExpiredClassNewsManual,
  resetDailyTasksManual,
  payWeeklySalariesManual,
  collectWeeklyRentManual,
  provideSocialSafetyNetManual,
  openMarketManual,
  closeMarketManual,
  aggregateActivityStatsManual,
  updateClassStatsManual,
  updatePortfolioSummaryManual,
  aggregateActivityLogsManual,
};
