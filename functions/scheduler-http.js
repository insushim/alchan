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
          case 'updateMarketCondition':
            await updateMarketConditionLogic();
            results[task] = 'success';
            break;
          case 'updateStocks':
          case 'updateCentralStockMarket':
            await updateCentralStockMarketLogic();
            results[task] = 'success';
            break;
          case 'manageStocks':
          case 'autoManageStocks':
            await autoManageStocksLogic();
            results[task] = 'success';
            break;
          case 'cleanupStocks':
            await cleanupWorthlessStocksLogic();
            results[task] = 'success';
            break;
          case 'createNews':
          case 'createCentralMarketNews':
            await createCentralMarketNewsLogic();
            results[task] = 'success';
            break;
          case 'cleanupNews':
          case 'cleanupExpiredCentralNews':
            await cleanupExpiredCentralNewsLogic();
            results[task] = 'success';
            break;
          case 'syncNews':
          case 'syncCentralNewsToClasses':
            await syncCentralNewsToClassesLogic();
            results[task] = 'success';
            break;
          case 'cleanupClassNews':
          case 'cleanupExpiredClassNews':
            await cleanupExpiredClassNewsLogic();
            results[task] = 'success';
            break;
          case 'resetDaily':
          case 'resetDailyTasks':
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
// 실제 로직 함수들
// ===================================================================================

// 시장 상황 업데이트 (5분마다 랜덤 생성)
async function updateMarketConditionLogic() {
  logger.info("📊 [스케줄러] 시장 상황 업데이트 시작");
  try {
    const marketConditions = [
      { type: "super_bull", name: "초강세장", impact: 0.05, description: "시장 전체가 매우 강한 상승세를 보이고 있습니다" },
      { type: "strong_bull", name: "강세장", impact: 0.03, description: "시장이 강한 상승세를 보이고 있습니다" },
      { type: "bull", name: "강보합", impact: 0.01, description: "시장이 소폭 상승하고 있습니다" },
      { type: "bear", name: "약보합", impact: -0.01, description: "시장이 소폭 하락하고 있습니다" },
      { type: "strong_bear", name: "약세장", impact: -0.03, description: "시장이 강한 하락세를 보이고 있습니다" },
      { type: "super_bear", name: "초약세장", impact: -0.05, description: "시장 전체가 매우 강한 하락세를 보이고 있습니다" }
    ];

    // 랜덤으로 시장 상황 선택
    const randomCondition = marketConditions[Math.floor(Math.random() * marketConditions.length)];

    // Firestore에 저장
    const marketConditionRef = db.collection("MarketCondition").doc("current");
    await marketConditionRef.set({
      type: randomCondition.type,
      name: randomCondition.name,
      impact: randomCondition.impact,
      description: randomCondition.description,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000) // 5분 후 만료
    });

    logger.info(`✅ 시장 상황 업데이트 완료: ${randomCondition.name} (${randomCondition.impact * 100}%)`);
  } catch (error) {
    logger.error("❌ 시장 상황 업데이트 중 오류:", error);
    throw error;
  }
}

async function updateCentralStockMarketLogic() {
  logger.info("📈 [스케줄러] 주식 시장 가격 업데이트 시작");
  try {
    const stocksSnapshot = await db.collection("CentralStocks").where("isListed", "==", true).get();

    if (stocksSnapshot.empty) {
      logger.info("상장된 주식이 없습니다.");
      return;
    }

    // 현재 시장 상황 가져오기
    const marketConditionDoc = await db.collection("MarketCondition").doc("current").get();
    let marketImpact = 0;
    let marketConditionName = "보통";

    if (marketConditionDoc.exists) {
      const marketData = marketConditionDoc.data();
      marketImpact = marketData.impact || 0;
      marketConditionName = marketData.name || "보통";
      logger.info(`[시장 상황] ${marketConditionName} (${marketImpact * 100}%) - 모든 주식에 영향 적용`);
    }

    // 활성 뉴스 가져오기
    const activeNewsSnapshot = await db.collection("CentralNews").where("isActive", "==", true).get();
    const activeNews = activeNewsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const batch = db.batch();
    let updateCount = 0;

    for (const stockDoc of stocksSnapshot.docs) {
      const stockData = stockDoc.data();

      // 수동 관리 주식은 건너뜀
      if (stockData.isManual) {
        continue;
      }

      const currentPrice = stockData.price || 0;
      const minPrice = stockData.minListingPrice || 1000;

      // 거래량 기반 변동성 계산
      const buyVolume = stockData.recentBuyVolume || 0;
      const sellVolume = stockData.recentSellVolume || 0;
      const netVolume = buyVolume - sellVolume;

      // 기본 변동성
      let volatility = stockData.volatility || 0.02; // 2%
      if (stockData.productType === "bond") {
        volatility = 0.005; // 채권은 변동성 낮음 (0.5%)
      }

      // 거래량에 따른 변동성 조정
      const volumeImpact = Math.min(Math.abs(netVolume) * 0.0001, 0.05);
      const direction = netVolume > 0 ? 1 : netVolume < 0 ? -1 : 0;

      // 랜덤 변동 + 거래량 영향
      const randomChange = (Math.random() - 0.5) * volatility * 2;
      const volumeChange = direction * volumeImpact;

      // 뉴스 영향 계산 (개별 주식)
      let newsImpact = 0;
      const relatedNews = activeNews.find(news => news.relatedStocks && news.relatedStocks.includes(stockDoc.id));

      if (relatedNews) {
        switch (relatedNews.category) {
          case "strong_bull": newsImpact = 0.03; break; // +3%
          case "bull": newsImpact = 0.015; break;      // +1.5%
          case "bear": newsImpact = -0.015; break;     // -1.5%
          case "strong_bear": newsImpact = -0.03; break; // -3%
        }
        logger.info(`[주가 업데이트] ${stockData.name}에 뉴스(${relatedNews.title}) 효과 ${newsImpact * 100}% 적용`);
      }

      // 전체 변동 = 랜덤 + 거래량 + 개별 뉴스 + 시장 상황
      const totalChange = randomChange + volumeChange + newsImpact + marketImpact;

      let newPrice = Math.round(currentPrice * (1 + totalChange));

      // 최소 가격 유지
      if (newPrice < minPrice) {
        newPrice = minPrice;
      }

      // 가격 히스토리 업데이트
      const priceHistory = stockData.priceHistory || [currentPrice];
      const updatedHistory = [...priceHistory.slice(-19), newPrice]; // 최근 20개만 유지

      batch.update(stockDoc.ref, {
        price: newPrice,
        priceHistory: updatedHistory,
        recentBuyVolume: 0, // 거래량 리셋
        recentSellVolume: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });

      updateCount++;
    }

    await batch.commit();
    logger.info(`✅ ${updateCount}개 주식 가격 업데이트 완료 (시장 상황: ${marketConditionName})`);
  } catch (error) {
    logger.error("❌ 주식 가격 업데이트 중 오류:", error);
    throw error;
  }
}

async function autoManageStocksLogic() {
  logger.info("🔄 [스케줄러] 자동 주식 상장/폐지 관리 시작");
  try {
    const now = Date.now();
    let delistCount = 0;
    let relistCount = 0;

    // 1. 최소 상장가에 도달한 주식 자동 폐지
    const listedStocksSnapshot = await db.collection("CentralStocks")
      .where("isListed", "==", true)
      .get();

    const batch1 = db.batch();

    for (const stockDoc of listedStocksSnapshot.docs) {
      const stockData = stockDoc.data();

      // 수동 관리 주식은 건너뜀
      if (stockData.isManual) {
        continue;
      }

      const currentPrice = stockData.price || 0;
      const minPrice = stockData.minListingPrice || 1000;

      // 최소 상장가 이하로 떨어지면 폐지
      if (currentPrice <= minPrice) {
        batch1.update(stockDoc.ref, {
          isListed: false,
          delistedAt: admin.firestore.FieldValue.serverTimestamp(),
          delistedTimestamp: now, // 5분 후 재상장 계산용
          delistReason: '가격 급락 (최소 상장가 도달)',
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        delistCount++;
        logger.info(`[상장 폐지] ${stockData.name} - 현재가: ${currentPrice}원, 최소가: ${minPrice}원`);
      }
    }

    if (delistCount > 0) {
      await batch1.commit();
      logger.info(`📉 ${delistCount}개 주식 상장 폐지 완료`);
    }

    // 2. 폐지된 지 5분이 지난 주식 재상장 (초기 가격으로 리셋)
    const delistedStocksSnapshot = await db.collection("CentralStocks")
      .where("isListed", "==", false)
      .get();

    const batch2 = db.batch();

    for (const stockDoc of delistedStocksSnapshot.docs) {
      const stockData = stockDoc.data();

      // 수동 관리 주식은 건너뜀
      if (stockData.isManual) {
        continue;
      }

      const delistedTimestamp = stockData.delistedTimestamp;

      // 폐지 시간이 없거나 5분이 지났는지 확인
      if (delistedTimestamp && (now - delistedTimestamp >= 5 * 60 * 1000)) {
        // initialPrice 필드명 통일 (initialPrice 우선, 없으면 minListingPrice 사용)
        const initialPrice = stockData.initialPrice || stockData.minListingPrice || 1000;

        batch2.update(stockDoc.ref, {
          isListed: true,
          price: initialPrice,
          priceHistory: [initialPrice],
          relistedAt: admin.firestore.FieldValue.serverTimestamp(),
          delistedAt: admin.firestore.FieldDelete(), // 폐지 시간 필드 삭제
          delistedTimestamp: admin.firestore.FieldDelete(), // 폐지 타임스탬프 필드 삭제
          delistReason: admin.firestore.FieldDelete(), // 폐지 사유 필드 삭제
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        relistCount++;
        logger.info(`[재상장] ${stockData.name} - 초기가로 리셋: ${initialPrice}원`);
      }
    }

    if (relistCount > 0) {
      await batch2.commit();
      logger.info(`📈 ${relistCount}개 주식 재상장 완료 (초기 가격으로 리셋)`);
    }

    logger.info(`✅ 자동 관리 완료 - 폐지: ${delistCount}개, 재상장: ${relistCount}개`);
  } catch (error) {
    logger.error("❌ 자동 주식 관리 중 오류:", error);
    throw error;
  }
}

async function cleanupWorthlessStocksLogic() {
  logger.info("🧹 [스케줄러] 무가치 주식 정리 시작");
  // 필요시 나중에 구현
}

async function createCentralMarketNewsLogic() {
  logger.info("📰 [스케줄러] 중앙 시장 뉴스 생성 시작");
  try {
    const stocksSnapshot = await db.collection("CentralStocks")
      .where("isListed", "==", true)
      .get();

    if (stocksSnapshot.empty) {
      logger.info("상장된 주식이 없어 뉴스를 생성하지 않습니다.");
      return;
    }

    const newsItems = [];
    const now = admin.firestore.Timestamp.now();

    // 가격 변동이 큰 주식 찾기
    for (const stockDoc of stocksSnapshot.docs) {
      const stockData = stockDoc.data();
      const priceHistory = stockData.priceHistory || [];

      if (priceHistory.length < 2) continue;

      const currentPrice = priceHistory[priceHistory.length - 1];
      const previousPrice = priceHistory[priceHistory.length - 2];
      const changePercent = ((currentPrice - previousPrice) / previousPrice) * 100;

      // 5% 이상 변동 시 뉴스 생성
      if (Math.abs(changePercent) >= 5) {
        const isRise = changePercent > 0;
        const newsTemplates = isRise ? [
          `${stockData.name} 주가 급등! ${changePercent.toFixed(1)}% 상승`,
          `${stockData.name}, 투자자들의 관심 집중으로 ${changePercent.toFixed(1)}% 급등세`,
          `${stockData.name} 강세장 진입, ${changePercent.toFixed(1)}% 상승 기록`,
        ] : [
          `${stockData.name} 주가 급락, ${Math.abs(changePercent).toFixed(1)}% 하락`,
          `${stockData.name} 투자 심리 악화로 ${Math.abs(changePercent).toFixed(1)}% 급락`,
          `${stockData.name} 약세장 진입, ${Math.abs(changePercent).toFixed(1)}% 하락 기록`,
        ];

        const randomTemplate = newsTemplates[Math.floor(Math.random() * newsTemplates.length)];

        newsItems.push({
          title: randomTemplate,
          content: `현재가: ${currentPrice.toLocaleString()}원`,
          relatedStocks: [stockDoc.id],
          isActive: true,
          timestamp: now,
          expiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 30 * 60 * 1000), // 30분 후 만료
          createdAt: now,
        });
      }
    }

    // 랜덤 일반 뉴스도 추가
    if (Math.random() > 0.5) {
      const generalNews = [
        "오늘의 시장 전망: 투자자들의 신중한 접근 필요",
        "글로벌 경제 동향이 국내 증시에 영향",
        "전문가들 \"장기 투자 관점에서 접근해야\"",
        "시장 변동성 확대, 분산 투자 권장",
      ];

      newsItems.push({
        title: generalNews[Math.floor(Math.random() * generalNews.length)],
        content: "자세한 내용은 경제 전문가와 상담하세요.",
        relatedStocks: [],
        isActive: true,
        timestamp: now,
        expiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 60 * 60 * 1000), // 1시간 후 만료
        createdAt: now,
      });
    }

    // Firestore에 뉴스 추가
    const batch = db.batch();
    for (const news of newsItems) {
      const newsRef = db.collection("CentralNews").doc();
      batch.set(newsRef, news);
    }

    await batch.commit();
    logger.info(`✅ ${newsItems.length}개의 시장 뉴스 생성 완료`);
  } catch (error) {
    logger.error("❌ 뉴스 생성 중 오류:", error);
    throw error;
  }
}

async function cleanupExpiredCentralNewsLogic() {
  logger.info("🧹 [스케줄러] 만료된 중앙 뉴스 정리 시작");
  try {
    const now = admin.firestore.Timestamp.now();
    const expiredNewsSnapshot = await db.collection("CentralNews")
      .where("expiresAt", "<=", now)
      .get();

    if (expiredNewsSnapshot.empty) {
      logger.info("만료된 뉴스가 없습니다.");
      return;
    }

    const batch = db.batch();
    for (const newsDoc of expiredNewsSnapshot.docs) {
      batch.update(newsDoc.ref, { isActive: false });
    }

    await batch.commit();
    logger.info(`✅ ${expiredNewsSnapshot.size}개의 만료된 뉴스 비활성화 완료`);
  } catch (error) {
    logger.error("❌ 뉴스 정리 중 오류:", error);
    throw error;
  }
}

async function syncCentralNewsToClassesLogic() {
  logger.info("🔄 [스케줄러] 중앙 뉴스를 클래스로 동기화 시작");
  // 현재는 중앙 뉴스만 사용하므로 비워둠
}

async function cleanupExpiredClassNewsLogic() {
  logger.info("🧹 [스케줄러] 만료된 클래스 뉴스 정리 시작");
  // 현재는 중앙 뉴스만 사용하므로 비워둠
}

async function resetDailyTasksLogic() {
  logger.info("🔄 [스케줄러] 일일 작업 리셋 시작");
  // 필요시 나중에 구현
}

async function payWeeklySalariesLogic() {
  logger.info("💰 [스케줄러] 주급 지급 시작");
  // 필요시 나중에 구현
}

async function collectWeeklyRentLogic() {
  logger.info("🏠 [스케줄러] 임대료 징수 시작");
  // 필요시 나중에 구현
}

async function provideSocialSafetyNetLogic() {
  logger.info("🛡️ [스케줄러] 사회안전망 제공 시작");
  // 필요시 나중에 구현
}

async function openMarketLogic() {
  logger.info("🔓 [스케줄러] 시장 개장 시작");
  // 필요시 나중에 구현
}

async function closeMarketLogic() {
  logger.info("🔒 [스케줄러] 시장 폐장 시작");
  // 필요시 나중에 구현
}

async function aggregateActivityStatsLogic() {
  logger.info("📊 [스케줄러] 활동 통계 집계 시작");
  // 필요시 나중에 구현
}

async function updateClassStatsLogic() {
  logger.info("📊 [스케줄러] 클래스 통계 업데이트 시작");
  // 필요시 나중에 구현
}

async function updatePortfolioSummaryLogic() {
  logger.info("📊 [스케줄러] 포트폴리오 요약 업데이트 시작");
  // 필요시 나중에 구현
}

async function aggregateActivityLogsLogic() {
  logger.info("📊 [스케줄러] 활동 로그 집계 시작");
  // 필요시 나중에 구현
}
