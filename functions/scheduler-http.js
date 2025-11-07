/* eslint-disable */
/**
 * GitHub Actions에서 HTTP로 호출 가능한 스케줄러 엔드포인트
 * 기존 onSchedule 함수들의 로직을 HTTP 호출 가능하게 변환
 */

const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {
    checkAuthAndGetUserData,
    db,
    admin,
    logger
} = require("./utils");

// 보안: 간단한 인증 토큰 체크 (GitHub Actions에서만 호출 가능)
const AUTH_TOKEN = process.env.SCHEDULER_AUTH_TOKEN || "github-actions-scheduler-2024";

// 섹터별 뉴스 템플릿 (주식 이름 없이 힌트만 제공)
const SECTOR_NEWS_TEMPLATES = {
  TECH: {
    strong_bull: [
      "IT 업계, 신기술 개발 소식에 투자 심리 급등",
      "기술주 전반에 걸친 강세장 전망",
      "클라우드 및 AI 산업 성장세 가속화",
    ],
    bull: [
      "기술 기업들의 실적 개선 기대감 확산",
      "디지털 전환 가속화로 IT 업계 수혜 전망",
      "소프트웨어 산업 성장세 지속",
    ],
    bear: [
      "기술주 투자 심리 위축, 조정 국면 진입",
      "IT 업계 규제 강화 우려 확산",
      "기술 기업 실적 부진 우려",
    ],
    strong_bear: [
      "기술주 급락, 투자자 이탈 현상 심화",
      "IT 산업 전반 침체 우려 확대",
      "디지털 기업들의 수익성 악화 전망",
    ]
  },
  FINANCE: {
    strong_bull: [
      "금융권 규제 완화 전망에 투자 심리 개선",
      "은행 및 증권사 실적 호조 기대",
      "금융 산업 수익성 개선 신호 포착",
    ],
    bull: [
      "금융주 상승세, 이자 마진 개선 기대",
      "자산 관리 산업 성장세 지속",
      "금융권 디지털 전환 성과 가시화",
    ],
    bear: [
      "금융주 약세, 대출 수요 감소 우려",
      "금융권 건전성 지표 악화 조짐",
      "은행 및 증권사 수익성 압박",
    ],
    strong_bear: [
      "금융 산업 전반 급락, 시스템 리스크 우려",
      "금융권 부실 우려 확산",
      "은행주 투자 심리 급격히 냉각",
    ]
  },
  BIO: {
    strong_bull: [
      "제약·바이오 산업 신약 개발 성공 소식",
      "헬스케어 기업들의 임상 결과 호조",
      "바이오 산업 투자 확대 전망",
    ],
    bull: [
      "제약 업계 실적 개선 기대감",
      "바이오 기업들의 연구개발 성과 가시화",
      "헬스케어 시장 성장세 지속",
    ],
    bear: [
      "제약·바이오주 조정, 임상 결과 불확실성",
      "바이오 기업 투자 심리 위축",
      "헬스케어 산업 규제 강화 우려",
    ],
    strong_bear: [
      "제약·바이오 산업 급락, 신약 개발 실패 소식",
      "바이오 기업들의 자금 압박 심화",
      "헬스케어 투자 심리 급격히 악화",
    ]
  },
  ENERGY: {
    strong_bull: [
      "에너지 산업 수요 급증, 가격 상승 전망",
      "친환경 에너지 투자 확대 기대",
      "전력 및 신재생 에너지 산업 호황",
    ],
    bull: [
      "에너지 기업 실적 개선 기대",
      "전력 수요 증가세 지속",
      "신재생 에너지 산업 성장 가속화",
    ],
    bear: [
      "에너지 가격 하락, 업계 수익성 압박",
      "전력 산업 투자 심리 위축",
      "에너지 기업 실적 부진 우려",
    ],
    strong_bear: [
      "에너지 산업 급락, 수요 감소 우려 확산",
      "전력 기업 수익성 악화 전망",
      "에너지주 투자 심리 급격히 냉각",
    ]
  },
  CONSUMER: {
    strong_bull: [
      "소비재 산업 판매 급증, 실적 호조 전망",
      "유통 업계 매출 신장세 지속",
      "소비 심리 개선으로 유통주 강세",
    ],
    bull: [
      "소비재 기업 실적 개선 기대",
      "유통 산업 성장세 지속",
      "온라인 쇼핑 확대로 유통업 수혜",
    ],
    bear: [
      "소비 심리 위축, 유통업 매출 감소 우려",
      "소비재 기업 수익성 압박",
      "유통주 투자 심리 냉각",
    ],
    strong_bear: [
      "소비재 산업 급락, 소비 심리 급격히 악화",
      "유통 업계 실적 부진 우려 확산",
      "소비재주 투자 이탈 현상 심화",
    ]
  },
  INDUSTRIAL: {
    strong_bull: [
      "제조업 경기 회복 조짐, 산업재 강세",
      "건설 및 중공업 수주 증가 전망",
      "산업재 기업들의 실적 개선 기대",
    ],
    bull: [
      "제조업 지표 개선, 산업재주 상승세",
      "건설 경기 회복 기대감",
      "중공업 수주 증가세 지속",
    ],
    bear: [
      "제조업 경기 둔화, 산업재 약세",
      "건설 업계 수주 감소 우려",
      "중공업 기업 수익성 압박",
    ],
    strong_bear: [
      "산업재 급락, 제조업 침체 우려 확산",
      "건설 및 중공업 업황 악화 전망",
      "산업재주 투자 심리 급격히 냉각",
    ]
  }
};

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

// 🔥 수동 테스트용 엔드포인트 (관리자 전용)
exports.manualUpdateStockMarket = onCall({region: "asia-northeast3"}, async (request) => {
  await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

  logger.info("📈 [수동 실행] 주식 시장 업데이트 시작");

  try {
    await updateCentralStockMarketLogic();
    await createCentralMarketNewsLogic();

    return {
      success: true,
      message: "주식 가격 업데이트 및 뉴스 생성 완료"
    };
  } catch (error) {
    logger.error("❌ [수동 실행] 오류:", error);
    throw new HttpsError("internal", error.message || "업데이트 실패");
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
  logger.info("<<<<< AUTOMATIC STOCK UPDATE CHECK - THIS IS A TEST LOG >>>>>");
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
    let skippedCount = 0;
    const totalStocks = stocksSnapshot.docs.length;

    for (const stockDoc of stocksSnapshot.docs) {
      const stockData = stockDoc.data();

      // 수동 관리 주식은 건너뜀
      if (stockData.isManual) {
        logger.info(`[주가 업데이트] ${stockData.name} - 수동 관리 주식으로 건너뜀`);
        skippedCount++;
        continue;
      }

      const currentPrice = stockData.price || 0;
      const minPrice = stockData.minListingPrice || 1000;

      // 거래량 기반 변동성 계산
      const buyVolume = stockData.recentBuyVolume || 0;
      const sellVolume = stockData.recentSellVolume || 0;
      const netVolume = buyVolume - sellVolume;

      // 기본 변동성 증가 (더 활발한 시장을 위해)
      let volatility = stockData.volatility || 0.04; // 4% (기존 2%에서 증가)
      if (stockData.productType === "bond") {
        volatility = 0.01; // 채권은 변동성 낮음 (1%, 기존 0.5%에서 증가)
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

      const changePercent = ((newPrice - currentPrice) / currentPrice) * 100;
      logger.info(`[주가 업데이트] ${stockData.name}: ${currentPrice.toLocaleString()}원 → ${newPrice.toLocaleString()}원 (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);

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
    logger.info(`✅ 주식 가격 업데이트 완료 - 총 ${totalStocks}개 중 ${updateCount}개 업데이트, ${skippedCount}개 건너뜀 (시장 상황: ${marketConditionName})`);
    logger.info(`[주식 업데이트 통계] 읽기: ${totalStocks + (marketConditionDoc.exists ? 1 : 0) + activeNews.length}개, 쓰기: ${updateCount}개`);
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
    logger.info(`[자동 관리 통계] 읽기: ${listedStocksSnapshot.docs.length + delistedStocksSnapshot.docs.length}개, 쓰기: ${delistCount + relistCount}개`);
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
  logger.info("<<<<< AUTOMATIC NEWS CREATION CHECK - THIS IS A TEST LOG >>>>>");
  logger.info("📰 [스케줄러] 중앙 시장 뉴스 생성 시작 (무조건 2개 생성, 영향력 3분)");
  try {
    const stocksSnapshot = await db.collection("CentralStocks")
      .where("isListed", "==", true)
      .get();

    if (stocksSnapshot.empty) {
      logger.info("상장된 주식이 없어 뉴스를 생성하지 않습니다.");
      return;
    }

    // 섹터별로 주식 그룹화
    const stocksBySector = {};
    for (const stockDoc of stocksSnapshot.docs) {
      const stockData = stockDoc.data();
      const sector = stockData.sector || "TECH";
      if (!stocksBySector[sector]) {
        stocksBySector[sector] = [];
      }
      stocksBySector[sector].push(stockDoc.id);
    }

    const newsItems = [];
    const now = admin.firestore.Timestamp.now();
    const allSectors = Object.keys(SECTOR_NEWS_TEMPLATES);
    const newsCategories = ["strong_bull", "bull", "bear", "strong_bear"];

    // 무조건 2개의 뉴스 생성
    for (let i = 0; i < 2; i++) {
      const randomSector = allSectors[Math.floor(Math.random() * allSectors.length)];
      const randomCategory = newsCategories[Math.floor(Math.random() * newsCategories.length)];
      const templates = SECTOR_NEWS_TEMPLATES[randomSector][randomCategory];
      const randomTemplate = templates[Math.floor(Math.random() * templates.length)];

      const relatedStockIds = stocksBySector[randomSector] || [];

      logger.info(`[뉴스 생성] 뉴스 ${i + 1}: ${randomSector} 섹터 (${randomCategory}) - ${randomTemplate}`);

      newsItems.push({
        title: randomTemplate,
        content: "투자 판단 시 신중한 분석이 필요합니다.",
        relatedStocks: relatedStockIds,
        sector: randomSector,
        category: randomCategory, // 주가 영향용 카테고리
        isActive: true,
        timestamp: now,
        expiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 3 * 60 * 1000), // 3분 후 만료
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

    logger.info(`✅ ${newsItems.length}개의 시장 뉴스 생성 완료 (영향력 지속: 3분)`);
    newsItems.forEach(news => {
      logger.info(`  - [${news.sector}] ${news.title} (${news.category})`);
    });
    logger.info(`[뉴스 생성 통계] 읽기: ${stocksSnapshot.docs.length}개, 쓰기: ${newsItems.length}개`);
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

async function resetTasksForClass(classCode) {
  if (!classCode) {
    logger.error("resetTasksForClass: 학급 코드가 제공되지 않았습니다.");
    return { userCount: 0, jobCount: 0 };
  }
  try {
    const batch = db.batch();
    let userCount = 0;

    // 사용자별 할일 진행 상황 리셋 (공통 할일 + 직업 할일)
    const usersQuery = db.collection("users").where("classCode", "==", classCode);
    const usersSnapshot = await usersQuery.get();
    if (!usersSnapshot.empty) {
      usersSnapshot.forEach((userDoc) => {
        batch.update(userDoc.ref, {
          completedTasks: {},        // 공통 할일 리셋
          completedJobTasks: {}      // 직업 할일 리셋 (개인별)
        });
        userCount++;
      });
    }

    await batch.commit();
    logger.info(`[${classCode}] 리셋 완료: ${userCount}명 학생.`);
    return { userCount, jobCount: 0 };
  } catch (error) {
    logger.error(`[${classCode}] 할일 리셋 중 심각한 오류:`, error);
    throw error;
  }
}

async function resetDailyTasksLogic() {
  logger.info("🔄 [스케줄러] 일일 작업 리셋 시작");
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
    logger.info(`✅ 일일 할일 리셋 완료: ${classCodes.length}개 클래스, 총 ${totalUserCount}명 학생 및 ${totalJobCount}개 직업 리셋`);
  } catch (error) {
    logger.error("🚨 일일 할일 리셋 중 오류 발생:", error);
    throw error; // re-throw to be caught by the main handler
  }
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

// ===================================================================================
// 외부에서 사용할 수 있도록 로직 함수들 export
// ===================================================================================
module.exports.updateCentralStockMarketLogic = updateCentralStockMarketLogic;
module.exports.createCentralMarketNewsLogic = createCentralMarketNewsLogic;
module.exports.autoManageStocksLogic = autoManageStocksLogic;
module.exports.cleanupExpiredCentralNewsLogic = cleanupExpiredCentralNewsLogic;
module.exports.resetDailyTasksLogic = resetDailyTasksLogic;
module.exports.updateMarketConditionLogic = updateMarketConditionLogic;
