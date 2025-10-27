/* eslint-disable */
/* eslint-disable max-len */
// eslint-disable-next-line no-unused-vars
const functions = require("firebase-functions");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall, HttpsError, onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const LOG_TYPES = {
  CASH_INCOME: "현금 입금",
  CASH_EXPENSE: "현금 출금",
  CASH_TRANSFER_SEND: "송금",
  CASH_TRANSFER_RECEIVE: "송금 수신",
  ADMIN_CASH_SEND: "관리자 지급",
  ADMIN_CASH_TAKE: "관리자 회수",
  COUPON_EARN: "쿠폰 획득",
  COUPON_USE: "쿠폰 사용",
  COUPON_GIVE: "쿠폰 지급",
  COUPON_TAKE: "쿠폰 회수",
  COUPON_TRANSFER_SEND: "쿠폰 송금",
  COUPON_TRANSFER_RECEIVE: "쿠폰 수신",
  COUPON_DONATE: "쿠폰 기부",
  COUPON_SELL: "쿠폰 판매",
  ITEM_PURCHASE: "아이템 구매",
  ITEM_USE: "아이템 사용",
  ITEM_SELL: "아이템 판매",
  ITEM_MARKET_LIST: "아이템 시장 등록",
  ITEM_MARKET_BUY: "아이템 시장 구매",
  ITEM_OBTAIN: "아이템 획득",
  ITEM_MOVE: "아이템 이동",
  TASK_COMPLETE: "과제 완료",
  TASK_REWARD: "과제 보상",
  SYSTEM: "시스템",
  ADMIN_ACTION: "관리자 조치",
};

const logActivity = async (transaction, userId, type, description, metadata = {}) => {
  if (!userId || userId === "system") {
    logger.info(`[System Log] ${type}: ${description}`, {metadata});
    return;
  }
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    const userName = userDoc.exists ? userDoc.data().name : "알 수 없는 사용자";
    const classCode = userDoc.exists ? userDoc.data().classCode : "미지정";
    const logData = {
      userId,
      userName,
      classCode,
      type,
      description,
      metadata,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };
    const logRef = db.collection("activity_logs").doc();
    if (transaction) {
      transaction.set(logRef, logData);
    } else {
      await logRef.set(logData);
    }
  } catch (error) {
    logger.error(`[logActivity Error] User: ${userId}, Type: ${type}`, error);
  }
};

const checkAuthAndGetUserData = async (request, checkAdmin = false) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "인증된 사용자만 함수를 호출할 수 있습니다.");
  }
  const uid = request.auth.uid;
  if (!uid || uid.trim() === "") {
    throw new HttpsError("unauthenticated", "유효한 사용자 ID를 찾을 수 없습니다.");
  }
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
  }
  const userData = userDoc.data();
  const isAdmin = userData.isAdmin || false;
  const isSuperAdmin = userData.isSuperAdmin || false;
  if (checkAdmin && !isAdmin && !isSuperAdmin) {
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  }
  return {uid, classCode: userData.classCode, isAdmin, isSuperAdmin, userData};
};

// ===================================================================================
// 🔥 스케줄러 함수 구현
// ===================================================================================

const _updateCentralStockMarket = async () => {
  logger.info("📈 [스케줄러] 주식 시장 가격 업데이트 시작");
  try {
    const stocksSnapshot = await db.collection("CentralStocks").where("isListed", "==", true).get();

    if (stocksSnapshot.empty) {
      logger.info("상장된 주식이 없습니다.");
      return;
    }

    // 활성 뉴스 가져오기
    const activeNewsSnapshot = await db.collection("CentralNews").where("isActive", "==", true).get();
    const activeNews = activeNewsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const batch = db.batch();
    let updateCount = 0;

    for (const stockDoc of stocksSnapshot.docs) {
      const stockData = stockDoc.data();

      if (stockData.isManual) {
        continue;
      }

      const currentPrice = stockData.price || 0;
      const minPrice = stockData.minListingPrice || 1000;

      const buyVolume = stockData.recentBuyVolume || 0;
      const sellVolume = stockData.recentSellVolume || 0;
      const netVolume = buyVolume - sellVolume;

      let volatility = stockData.volatility || 0.02;
      if (stockData.productType === "bond") {
        volatility = 0.005;
      }

      const volumeImpact = Math.min(Math.abs(netVolume) * 0.0001, 0.05);
      const direction = netVolume > 0 ? 1 : netVolume < 0 ? -1 : 0;

      const randomChange = (Math.random() - 0.5) * volatility * 2;
      const volumeChange = direction * volumeImpact;

      // 뉴스 영향 계산
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

      const totalChange = randomChange + volumeChange + newsImpact;
      let newPrice = Math.round(currentPrice * (1 + totalChange));

      if (newPrice < minPrice) {
        newPrice = minPrice;
      }

      const priceHistory = stockData.priceHistory || [currentPrice];
      const updatedHistory = [...priceHistory.slice(-19), newPrice];

      batch.update(stockDoc.ref, {
        price: newPrice,
        priceHistory: updatedHistory,
        recentBuyVolume: 0,
        recentSellVolume: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });

      updateCount++;
    }

    await batch.commit();
    logger.info(`✅ ${updateCount}개 주식 가격 업데이트 완료`);
  } catch (error) {
    logger.error("❌ 주식 가격 업데이트 중 오류:", error);
  }
};

const _autoManageStocks = async () => {
  logger.info("🔄 [스케줄러] 자동 주식 상장/폐지 관리 시작");
  // 현재는 수동으로 관리하므로 비워둠
  // 필요시 나중에 구현
};

const _aggregateActivityStats = async () => {
  logger.info("📊 [스케줄러] 활동 통계 집계 시작");
  // 필요시 나중에 구현
};

// 13개 섹터별 × 4가지 상태별 뉴스 템플릿 (총 52개)
const SECTOR_NEWS_TEMPLATES = {
  TECH: {
    strong_bull: [ // 강세 (3% 이상 상승)
      "IT 대기업 주가 급등, 신제품 기대감 고조",
      "반도체 업계 실적 개선 전망, 강세 지속",
      "기술주 대표기업 투자심리 회복, 상승폭 확대"
    ],
    bull: [ // 강보합 (1% ~ 3% 상승)
      "전자기기 제조사 안정적 상승세 유지",
      "IT 업계 긍정적 전망, 완만한 상승",
      "기술주 매수세 유입, 상승 마감 전망"
    ],
    bear: [ // 약보합 (-3% ~ -1% 하락)
      "반도체 수요 둔화 우려, 소폭 조정",
      "IT 대기업 차익실현 매물 출회",
      "기술주 단기 조정 국면, 관망세 지속"
    ],
    strong_bear: [ // 약세 (-3% 이하 하락)
      "전자기기 업계 실적 우려, 급락세",
      "IT 섹터 투자심리 악화, 하락폭 확대",
      "반도체 업계 수급 불안, 약세 지속"
    ]
  },
  FINANCE: {
    strong_bull: [
      "금융 대기업 순이익 급증, 주가 강세",
      "은행권 대출 증가세, 실적 개선 기대",
      "증권사 거래대금 확대, 수익성 개선"
    ],
    bull: [
      "금융주 안정적 회복세, 배당 매력 부각",
      "보험업계 실적 양호, 완만한 상승",
      "은행권 순이자마진 개선 기대감"
    ],
    bear: [
      "금융권 규제 우려, 소폭 하락",
      "증권사 수수료 수익 감소 전망",
      "은행주 대출 부실 우려, 약보합"
    ],
    strong_bear: [
      "금융 대기업 부실채권 우려 확산",
      "은행권 실적 악화, 급락세 지속",
      "보험업계 운용손실 우려, 하락폭 확대"
    ]
  },
  CONSUMER: {
    strong_bull: [
      "소비재 대기업 매출 급증, 강세 전환",
      "유통업계 소비심리 회복, 주가 급등",
      "식품업계 해외 수출 호조, 실적 개선"
    ],
    bull: [
      "생활용품 업계 안정적 수요, 상승세",
      "유통주 계절적 성수기 진입 기대",
      "소비재 섹터 방어적 매수세 유입"
    ],
    bear: [
      "소비재 업계 원자재 가격 상승 부담",
      "유통업계 소비 위축 우려, 조정",
      "식품주 수익성 악화 전망, 약보합"
    ],
    strong_bear: [
      "소비재 대기업 실적 쇼크, 급락",
      "유통업계 경기 둔화 영향, 하락세",
      "생활용품 업체 판매 부진, 약세 지속"
    ]
  },
  HEALTHCARE: {
    strong_bull: [
      "제약 대기업 신약 승인 기대, 급등",
      "바이오 업계 임상시험 성공 소식",
      "의료기기 업체 수출 확대, 강세"
    ],
    bull: [
      "헬스케어 섹터 방어적 매수 지속",
      "제약주 안정적 실적 기대감",
      "바이오 업계 연구개발 투자 확대"
    ],
    bear: [
      "제약 업계 약가 인하 압박, 조정",
      "바이오주 임상 불확실성, 약보합",
      "의료기기 업체 경쟁 심화 우려"
    ],
    strong_bear: [
      "제약 대기업 신약 개발 실패 충격",
      "바이오 업계 투자심리 급랭",
      "헬스케어 섹터 규제 강화 우려"
    ]
  },
  ENERGY: {
    strong_bull: [
      "에너지 대기업 유가 상승 수혜, 급등",
      "정유사 정제마진 개선, 강세 전환",
      "신재생에너지 업체 정부 지원 확대"
    ],
    bull: [
      "에너지 섹터 수요 증가 전망",
      "전력회사 안정적 배당 매력",
      "정유업계 계절적 수요 증가 기대"
    ],
    bear: [
      "에너지 업계 유가 하락 부담",
      "정유사 정제마진 축소 우려",
      "전력회사 연료비 상승 압박"
    ],
    strong_bear: [
      "에너지 대기업 유가 급락 충격",
      "정유업계 수요 감소, 급락세",
      "신재생에너지 투자 축소 우려"
    ]
  },
  INDUSTRIAL: {
    strong_bull: [
      "제조 대기업 수주 증가, 강세",
      "중공업 업체 해외 프로젝트 수주",
      "건설사 수주잔고 확대, 급등"
    ],
    bull: [
      "산업재 섹터 경기 회복 기대",
      "제조업 가동률 상승세 지속",
      "건설주 정부 SOC 투자 확대"
    ],
    bear: [
      "중공업 업체 수주 경쟁 심화",
      "제조업 원자재 가격 부담 확대",
      "건설사 공사 지연 우려, 조정"
    ],
    strong_bear: [
      "산업재 대기업 수주 급감 충격",
      "중공업 경기 둔화 직격탄",
      "건설업계 부실 우려 확산"
    ]
  },
  MATERIALS: {
    strong_bull: [
      "철강 대기업 가격 상승, 급등세",
      "화학 업체 제품 수요 급증",
      "소재 기업 공급 부족 수혜"
    ],
    bull: [
      "원자재 업계 수요 회복 기대",
      "철강주 재고 감소, 상승 전환",
      "화학 섹터 마진 개선 전망"
    ],
    bear: [
      "소재 업계 원자재 가격 하락",
      "철강 수요 둔화 우려, 조정",
      "화학주 경쟁 심화, 약보합"
    ],
    strong_bear: [
      "철강 대기업 수요 급감, 급락",
      "화학 업계 재고 증가 부담",
      "소재 섹터 경기 둔화 직격탄"
    ]
  },
  REALESTATE: {
    strong_bull: [
      "부동산 대기업 분양 호조, 급등",
      "건설사 수주 확대, 강세 지속",
      "리츠 기업 배당 매력 부각"
    ],
    bull: [
      "부동산 섹터 정책 기대감 확산",
      "건설주 재건축 수요 증가",
      "개발업체 프로젝트 진행 순조"
    ],
    bear: [
      "부동산 규제 강화 우려, 조정",
      "건설사 분양 부진 우려",
      "리츠 금리 상승 부담, 약보합"
    ],
    strong_bear: [
      "부동산 대기업 분양 급감 충격",
      "건설업계 자금 압박 우려",
      "개발업체 프로젝트 중단 리스크"
    ]
  },
  UTILITIES: {
    strong_bull: [
      "공기업 배당 확대 기대, 급등",
      "인프라 기업 정부 투자 확대",
      "유틸리티 업체 안정적 수익 구조"
    ],
    bull: [
      "공공 섹터 방어적 매수세 유입",
      "인프라 주식 배당 매력 부각",
      "유틸리티 안정적 실적 기대"
    ],
    bear: [
      "공기업 요금 인상 제한 부담",
      "인프라 기업 투자 지연 우려",
      "유틸리티 규제 강화, 조정"
    ],
    strong_bear: [
      "공기업 실적 악화 우려 확산",
      "인프라 투자 축소 충격",
      "유틸리티 섹터 정책 불확실성"
    ]
  },
  COMMUNICATION: {
    strong_bull: [
      "통신 대기업 5G 투자 수혜, 급등",
      "미디어 기업 광고 매출 증가",
      "방송사 콘텐츠 수출 호조"
    ],
    bull: [
      "통신주 배당 매력, 상승세",
      "미디어 업계 구독자 증가 지속",
      "방송 섹터 안정적 실적 유지"
    ],
    bear: [
      "통신 업계 경쟁 심화, 조정",
      "미디어 기업 광고 수익 감소",
      "방송사 시청률 하락 우려"
    ],
    strong_bear: [
      "통신 대기업 가입자 이탈 가속",
      "미디어 업계 실적 악화 충격",
      "방송 섹터 구조조정 우려"
    ]
  },
  ENTERTAINMENT: {
    strong_bull: [
      "엔터 대기업 해외 진출 성공, 급등",
      "게임사 신작 흥행, 강세 전환",
      "콘텐츠 기업 IP 가치 상승"
    ],
    bull: [
      "엔터 업계 한류 열풍 수혜",
      "게임주 이용자 증가 지속",
      "콘텐츠 섹터 해외 수출 확대"
    ],
    bear: [
      "엔터 업계 경쟁 심화, 조정",
      "게임사 신작 부진 우려",
      "콘텐츠 기업 제작비 부담"
    ],
    strong_bear: [
      "엔터 대기업 실적 쇼크, 급락",
      "게임업계 규제 강화 충격",
      "콘텐츠 섹터 수익성 악화"
    ]
  },
  INDEX: {
    strong_bull: [
      "종합주가지수 강세, 시장 전반 상승",
      "시장 대표 지수 급등, 투자심리 개선",
      "지수 추종 상품 강세, 매수세 집중"
    ],
    bull: [
      "종합지수 완만한 상승, 안정적 흐름",
      "시장 지수 상승 전환, 긍정적 분위기",
      "지수 상품 꾸준한 매수세 유입"
    ],
    bear: [
      "종합지수 소폭 하락, 조정 국면",
      "시장 지수 약보합, 관망세 지속",
      "지수 상품 차익실현 매물 출회"
    ],
    strong_bear: [
      "종합주가지수 급락, 시장 전반 약세",
      "시장 대표 지수 하락폭 확대",
      "지수 추종 상품 투자심리 악화"
    ]
  },
  GOVERNMENT: {
    strong_bull: [
      "국채 가격 급등, 안전자산 선호 현상",
      "정부 채권 수요 급증, 금리 하락",
      "국채 시장 강세, 경기 둔화 우려"
    ],
    bull: [
      "국채 안정적 상승, 안전 자산 매력",
      "정부 채권 꾸준한 매수세",
      "국채 금리 하락, 채권 가격 상승"
    ],
    bear: [
      "국채 가격 조정, 금리 상승 압력",
      "정부 채권 매도세, 약보합",
      "국채 시장 변동성 확대"
    ],
    strong_bear: [
      "국채 가격 급락, 금리 급등 충격",
      "정부 채권 대량 매도, 약세 지속",
      "국채 시장 불안, 투자 심리 악화"
    ]
  }
};

const _createCentralMarketNews = async () => {
  logger.info("📰 [스케줄러] 중앙 시장 뉴스 생성 시작");
  try {
    const stocksSnapshot = await db.collection("CentralStocks")
      .where("isListed", "==", true)
      .get();

    if (stocksSnapshot.empty) {
      logger.info("상장된 주식이 없어 뉴스를 생성하지 않습니다.");
      return;
    }

    const now = admin.firestore.Timestamp.now();

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
    const allSectors = Object.keys(SECTOR_NEWS_TEMPLATES);
    const newsCategories = ["strong_bull", "bull", "bear", "strong_bear"];

    for (let i = 0; i < 2; i++) {
      const randomSector = allSectors[Math.floor(Math.random() * allSectors.length)];
      const randomCategory = newsCategories[Math.floor(Math.random() * newsCategories.length)];
      const templates = SECTOR_NEWS_TEMPLATES[randomSector][randomCategory];
      const randomTemplate = templates[Math.floor(Math.random() * templates.length)];

      const relatedStockIds = stocksBySector[randomSector] || [];

      logger.info(`[뉴스 생성] 랜덤 선택된 뉴스 ${i + 1}: ${randomSector} (${randomCategory}) - ${randomTemplate}`);

      newsItems.push({
        title: randomTemplate,
        content: "투자 판단 시 신중한 분석이 필요합니다.",
        relatedStocks: relatedStockIds,
        category: randomCategory, // 주가 영향용 카테고리
        isActive: true,
        timestamp: now,
        expiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 3 * 60 * 1000), // 3분 후 만료
        createdAt: now,
      });
    }

    logger.info(`[뉴스 생성] 최종 생성될 뉴스 개수: ${newsItems.length}개`);

    if (newsItems.length > 0) {
      const batch = db.batch();
      for (const news of newsItems) {
        const newsRef = db.collection("CentralNews").doc();
        batch.set(newsRef, news);
      }
      await batch.commit();
      logger.info(`✅ ${newsItems.length}개의 시장 뉴스 생성 완료`);
    }
  } catch (error) {
    logger.error("❌ 뉴스 생성 중 오류:", error);
  }
};

const _cleanupExpiredCentralNews = async () => {
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
  }
};

const _syncCentralNewsToClasses = async () => {
  logger.info("🔄 [스케줄러] 중앙 뉴스를 클래스로 동기화 시작");
  // 현재는 중앙 뉴스만 사용하므로 비워둠
};

const _cleanupExpiredClassNews = async () => {
  logger.info("🧹 [스케줄러] 만료된 클래스 뉴스 정리 시작");
  // 현재는 중앙 뉴스만 사용하므로 비워둠
};

const resetTasksForClass = async (classCode) => {
  if (!classCode) {
    logger.error("resetTasksForClass: 학급 코드가 제공되지 않았습니다.");
    return { userCount: 0, jobCount: 0 };
  }
  try {
    const batch = db.batch();
    let userCount = 0;
    let jobCount = 0;

    const usersQuery = db.collection("users").where("classCode", "==", classCode);
    const usersSnapshot = await usersQuery.get();
    if (!usersSnapshot.empty) {
      usersSnapshot.forEach((userDoc) => {
        batch.update(userDoc.ref, { completedTasks: {} });
        userCount++;
      });
    }

    const jobsSnapshot = await db.collection("jobs").get();
    if (!jobsSnapshot.empty) {
      jobsSnapshot.docs.forEach((jobDoc) => {
        if (jobDoc.data().classCode === classCode) {
          const jobData = jobDoc.data();
          if (jobData.tasks && jobData.tasks.some(t => (t.clicks || 0) > 0)) {
            const updatedTasks = jobData.tasks.map(t => ({ ...t, clicks: 0 }));
            batch.update(jobDoc.ref, { tasks: updatedTasks });
            jobCount++;
          }
        }
      });
    }
    
    await batch.commit();
    logger.info(`[${classCode}] 리셋 완료: ${userCount}명 학생, ${jobCount}개 직업.`);
    return { userCount, jobCount };
  } catch (error) {
    logger.error(`[${classCode}] 할일 리셋 중 심각한 오류:`, error);
    throw error;
  }
};

const _resetDailyTasks = async () => {
  logger.info("🔄 일일 할일 리셋 시작");
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
  }
};

exports.runScheduler = onRequest({region: "asia-northeast3"}, async (req, res) => {
  const tasks = req.body.tasks;
  if (!tasks || !Array.isArray(tasks)) {
    return res.status(400).send("Bad Request");
  }
  for (const task of tasks) {
    try {
      switch (task) {
        case "updateCentralStockMarket":
          await _updateCentralStockMarket();
          break;
        case "createCentralMarketNews":
          await _createCentralMarketNews();
          break;
        case "cleanupExpiredCentralNews":
          await _cleanupExpiredCentralNews();
          break;
        case "autoManageStocks":
          await _autoManageStocks();
          break;
        case "aggregateActivityStats":
          await _aggregateActivityStats();
          break;
        case "syncCentralNewsToClasses":
          await _syncCentralNewsToClasses();
          break;
        case "cleanupExpiredClassNews":
          await _cleanupExpiredClassNews();
          break;
        case "resetDailyTasks":
          await _resetDailyTasks();
          break;
        default:
          logger.warn(`⚠️ 알 수 없는 작업: ${task}`);
      }
    } catch (error) {
      logger.error(`🚨 작업 '${task}' 실행 중 오류 발생:`, error);
    }
  }
  res.status(200).send({ message: "스케줄러 실행 완료" });
});

// 🔥 수동 테스트용 엔드포인트 (관리자 전용)
exports.manualUpdateStockMarket = onCall({region: "asia-northeast3"}, async (request) => {
  await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

  logger.info("📈 [수동 실행] 주식 시장 업데이트 시작");

  try {
    await _updateCentralStockMarket();
    await _createCentralMarketNews();

    return {
      success: true,
      message: "주식 가격 업데이트 및 뉴스 생성 완료"
    };
  } catch (error) {
    logger.error("❌ [수동 실행] 오류:", error);
    throw new HttpsError("internal", error.message || "업데이트 실패");
  }
});

exports.completeTask = onCall({region: "asia-northeast3"}, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const { taskId, jobId = null, isJobTask = false } = request.data;
  if (!taskId) {
    throw new HttpsError("invalid-argument", "할일 ID가 필요합니다.");
  }
  const userRef = db.collection("users").doc(uid);
  try {
    let taskReward = 0;
    let taskName = "";
    if (isJobTask && jobId) {
      const jobRef = db.collection("jobs").doc(jobId);
      await db.runTransaction(async (transaction) => {
        const jobDoc = await transaction.get(jobRef);
        if (!jobDoc.exists) throw new Error("직업을 찾을 수 없습니다.");
        const jobData = jobDoc.data();
        const jobTasks = jobData.tasks || [];
        const taskIndex = jobTasks.findIndex((t) => t.id === taskId);
        if (taskIndex === -1) throw new Error("직업 할일을 찾을 수 없습니다.");
        const task = jobTasks[taskIndex];
        taskName = task.name;
        taskReward = task.reward || 0;
        const currentClicks = task.clicks || 0;
        if (currentClicks >= task.maxClicks) {
          throw new Error(`${taskName} 할일은 오늘 이미 최대 완료했습니다.`);
        }
        const updatedTasks = [...jobTasks];
        updatedTasks[taskIndex] = { ...task, clicks: currentClicks + 1 };
        transaction.update(jobRef, { tasks: updatedTasks });
        if (taskReward > 0) {
          transaction.update(userRef, {
            coupons: admin.firestore.FieldValue.increment(taskReward),
          });
        }
      });
    } else {
      const commonTaskRef = db.collection("commonTasks").doc(taskId);
      await db.runTransaction(async (transaction) => {
        const commonTaskDoc = await transaction.get(commonTaskRef);
        if (!commonTaskDoc.exists) throw new Error("공통 할일을 찾을 수 없습니다.");
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new Error("사용자 정보를 찾을 수 없습니다.");
        const taskData = commonTaskDoc.data();
        taskName = taskData.name;
        taskReward = taskData.reward || 0;
        const userData = userDoc.data();
        const completedTasks = userData.completedTasks || {};
        const currentClicks = completedTasks[taskId] || 0;
        if (currentClicks >= taskData.maxClicks) {
          throw new Error(`${taskName} 할일은 오늘 이미 최대 완료했습니다.`);
        }
        const updateData = {
          [`completedTasks.${taskId}`]: admin.firestore.FieldValue.increment(1),
        };
        if (taskReward > 0) {
          updateData.coupons = admin.firestore.FieldValue.increment(taskReward);
        }
        transaction.update(userRef, updateData);
      });
    }
    if (taskReward > 0) {
      try {
        await logActivity(null, uid, LOG_TYPES.COUPON_EARN, `'${taskName}' 할일 완료로 쿠폰 ${taskReward}개를 획득했습니다.`, { taskName, reward: taskReward, taskId, isJobTask, jobId: jobId || null });
      } catch (logError) {
        logger.warn(`[completeTask] 활동 로그 기록 실패:`, logError);
      }
    }
    const updatedUserDoc = await userRef.get();
    const updatedUserData = updatedUserDoc.data();
    return {
      success: true,
      message: `'${taskName}' 완료! ${taskReward > 0 ? `+${taskReward} 쿠폰!` : ""}`,
      taskName: taskName,
      reward: taskReward,
      updatedCash: updatedUserData.cash || 0,
      updatedCoupons: updatedUserData.coupons || 0,
    };
  } catch (error) {
    logger.error(`[completeTask] User: ${uid}, Task: ${taskId}, Error:`, error);
    throw new HttpsError("aborted", error.message || "할일 완료 처리 중 오류가 발생했습니다.");
  }
});

exports.manualResetClassTasks = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request, true);
  const {classCode} = request.data;
  if (!classCode) throw new HttpsError("invalid-argument", "유효한 classCode가 필요합니다.");
  logger.info(`[수동 리셋] 관리자(UID: ${uid})가 클래스 '${classCode}'의 할일을 수동 리셋합니다.`);
  try {
    const result = await resetTasksForClass(classCode);
    const message = `클래스 '${classCode}'의 ${result.userCount}명 학생 및 ${result.jobCount}개 직업의 할일이 리셋되었습니다.`;
    logger.info(`[수동 리셋] ${message}`);
    return {success: true, message, updatedCount: result.userCount};
  } catch (error) {
    logger.error(`[수동 리셋] 클래스 '${classCode}' 리셋 중 오류:`, error);
    throw new HttpsError("internal", `할일 리셋 실패: ${error.message}`);
  }
});

exports.donateCoupon = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, userData, classCode} = await checkAuthAndGetUserData(request);
  const {amount, message} = request.data;
  if (!classCode) {
    throw new HttpsError("failed-precondition", "사용자에게 학급 코드가 할당되지 않았습니다. 프로필을 확인하거나 관리자에게 문의해주세요.");
  }
  if (!amount || amount <= 0) {
    throw new HttpsError("invalid-argument", "유효한 쿠폰 수량을 입력해야 합니다.");
  }
  const userRef = db.collection("users").doc(uid);
  const goalRef = db.collection("goals").doc(`${classCode}_goal`);
  try {
    await db.runTransaction(async (transaction) => {
      const [userDoc, goalDoc] = await transaction.getAll(userRef, goalRef);
      if (!userDoc.exists) {
        throw new Error("사용자 정보가 없습니다.");
      }
      const currentCoupons = userDoc.data().coupons || 0;
      if (currentCoupons < amount) {
        throw new Error("보유한 쿠폰이 부족합니다.");
      }
      transaction.set(userRef, {
        coupons: admin.firestore.FieldValue.increment(-amount),
        myContribution: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      const newDonation = {
        id: db.collection("goals").doc().id,
        userId: uid,
        userName: userData.name || "알 수 없는 사용자",
        amount: amount,
        message: message || "",
        timestamp: admin.firestore.Timestamp.now(),
        classCode: classCode,
      };
      if (goalDoc.exists) {
        transaction.update(goalRef, {
          progress: admin.firestore.FieldValue.increment(amount),
          donations: admin.firestore.FieldValue.arrayUnion(newDonation),
          donationCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.set(goalRef, {
          progress: amount,
          donations: [newDonation],
          donationCount: 1,
          targetAmount: 1000,
          classCode: classCode,
          title: `${classCode} 학급 목표`,
          description: `${classCode} 학급의 쿠폰 목표입니다.`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: uid,
        });
      }
      logActivity(transaction, uid, LOG_TYPES.COUPON_USE, `학급 목표에 쿠폰 ${amount}개를 기부했습니다.`, {amount, message, type: "donation"});
      logActivity(transaction, uid, LOG_TYPES.COUPON_DONATE, `쿠폰 ${amount}개를 기부했습니다. 메시지: ${message || "없음"}`, {amount, message});
    });
    return {success: true, message: "쿠폰 기부가 완료되었습니다."};
  } catch (error) {
    logger.error(`[donateCoupon] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "쿠폰 기부에 실패했습니다.");
  }
});

exports.sellCoupon = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request);
  const {amount} = request.data;
  if (!amount || amount <= 0) {
    throw new HttpsError("invalid-argument", "유효한 쿠폰 수량을 입력해야 합니다.");
  }
  const userRef = db.collection("users").doc(uid);
  const mainSettingsRef = db.collection("settings").doc("mainSettings");
  try {
    await db.runTransaction(async (transaction) => {
      const [userDoc, settingsDoc] = await transaction.getAll(userRef, mainSettingsRef);
      if (!userDoc.exists) throw new Error("사용자 정보가 없습니다.");
      const currentCoupons = userDoc.data().coupons || 0;
      if (currentCoupons < amount) throw new Error("보유한 쿠폰이 부족합니다.");
      const couponValue = settingsDoc.exists ? settingsDoc.data().couponValue : 1000;
      const cashGained = amount * couponValue;
      transaction.update(userRef, {
        coupons: admin.firestore.FieldValue.increment(-amount),
        cash: admin.firestore.FieldValue.increment(cashGained),
      });
      logActivity(transaction, uid, LOG_TYPES.COUPON_SELL, `쿠폰 ${amount}개를 ${cashGained.toLocaleString()}원에 판매했습니다.`, { amount, couponValue, cashGained });
    });
    return {success: true, message: "쿠폰 판매가 완료되었습니다."};
  } catch (error) {
    logger.error(`[sellCoupon] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "쿠폰 판매에 실패했습니다.");
  }
});

exports.giftCoupon = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, userData} = await checkAuthAndGetUserData(request);
  const {recipientId, amount, message} = request.data;
  if (!recipientId || !amount || amount <= 0) {
    throw new HttpsError("invalid-argument", "받는 사람과 쿠폰 수량을 정확히 입력해야 합니다.");
  }
  if (uid === recipientId) {
    throw new HttpsError("invalid-argument", "자기 자신에게는 쿠폰을 선물할 수 없습니다.");
  }
  const senderRef = db.collection("users").doc(uid);
  const recipientRef = db.collection("users").doc(recipientId);
  try {
    await db.runTransaction(async (transaction) => {
      const [senderDoc, recipientDoc] = await transaction.getAll(senderRef, recipientRef);
      if (!senderDoc.exists) throw new Error("보내는 사람의 정보가 없습니다.");
      if (!recipientDoc.exists) throw new Error("받는 사람의 정보가 없습니다.");
      const senderCoupons = senderDoc.data().coupons || 0;
      if (senderCoupons < amount) throw new Error("보유한 쿠폰이 부족합니다.");
      transaction.update(senderRef, {coupons: admin.firestore.FieldValue.increment(-amount)});
      transaction.update(recipientRef, {coupons: admin.firestore.FieldValue.increment(amount)});
      const recipientData = recipientDoc.data();
      logActivity(transaction, uid, LOG_TYPES.COUPON_TRANSFER_SEND, `${recipientData.name}님에게 쿠폰 ${amount}개를 선물했습니다.`, {recipientId, recipientName: recipientData.name, amount, message});
      logActivity(transaction, recipientId, LOG_TYPES.COUPON_TRANSFER_RECEIVE, `${userData.name}님으로부터 쿠폰 ${amount}개를 선물 받았습니다.`, {senderId: uid, senderName: userData.name, amount, message});
    });
    return {success: true, message: "쿠폰 선물이 완료되었습니다."};
  } catch (error) {
    logger.error(`[giftCoupon] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "쿠폰 선물에 실패했습니다.");
  }
});

// ===================================================================================
// 🔥 주식 거래 함수 구현
// ===================================================================================

const COMMISSION_RATE = 0.003; // 수수료율 0.3%
const TAX_RATE = 0.22; // 양도소득세율 22%
const BOND_TAX_RATE = 0.154; // 채권세율 15.4%
const TRANSACTION_TAX_RATE = 0.01; // 거래세율 1%

exports.buyStock = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, classCode} = await checkAuthAndGetUserData(request);
  const {stockId, quantity} = request.data;

  if (!stockId || !quantity || quantity <= 0) {
    throw new HttpsError("invalid-argument", "유효한 주식 ID와 수량을 입력해야 합니다.");
  }

  if (!classCode) {
    throw new HttpsError("failed-precondition", "학급 코드가 할당되지 않았습니다.");
  }

  const userRef = db.collection("users").doc(uid);
  const stockRef = db.collection("CentralStocks").doc(stockId);
  const treasuryRef = db.collection("nationalTreasuries").doc(classCode);

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 🔥 모든 읽기 작업을 먼저 수행
      const portfolioRef = db.collection("users").doc(uid).collection("portfolio").doc(stockId);
      const [userDoc, stockDoc, portfolioDoc, treasuryDoc] = await transaction.getAll(
        userRef,
        stockRef,
        portfolioRef,
        treasuryRef
      );

      if (!userDoc.exists) {
        throw new Error("사용자 정보를 찾을 수 없습니다.");
      }

      if (!stockDoc.exists) {
        throw new Error("주식 정보를 찾을 수 없습니다.");
      }

      const userData = userDoc.data();
      const stockData = stockDoc.data();

      if (!stockData.isListed) {
        throw new Error("상장되지 않은 주식입니다.");
      }

      const stockPrice = stockData.price || 0;
      const cost = stockPrice * quantity;
      const commission = Math.round(cost * COMMISSION_RATE);
      const transactionTax = Math.floor(cost * TRANSACTION_TAX_RATE);
      const totalCost = cost + commission + transactionTax;

      const currentCash = userData.cash || 0;
      if (currentCash < totalCost) {
        throw new Error(`현금이 부족합니다. 필요: ${totalCost.toLocaleString()}원, 보유: ${currentCash.toLocaleString()}원`);
      }

      // 🔥 이제 모든 쓰기 작업 수행

      // 사용자 현금 차감
      transaction.update(userRef, {
        cash: admin.firestore.FieldValue.increment(-totalCost),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 포트폴리오에 주식 추가 또는 업데이트
      if (portfolioDoc.exists) {
        const portfolioData = portfolioDoc.data();
        const currentQuantity = portfolioData.quantity || 0;
        const currentAvgPrice = portfolioData.averagePrice || 0;
        const newQuantity = currentQuantity + quantity;
        const newAvgPrice = ((currentAvgPrice * currentQuantity) + (stockPrice * quantity)) / newQuantity;

        transaction.update(portfolioRef, {
          quantity: newQuantity,
          averagePrice: newAvgPrice,
          lastBuyTime: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.set(portfolioRef, {
          stockId: stockId,
          stockName: stockData.name,
          quantity: quantity,
          averagePrice: stockPrice,
          classCode: classCode,
          productType: stockData.productType || "stock",
          lastBuyTime: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 주식 거래량 업데이트
      transaction.update(stockRef, {
        buyVolume: admin.firestore.FieldValue.increment(quantity),
        recentBuyVolume: admin.firestore.FieldValue.increment(quantity),
      });

      // 국고에 세금 및 수수료 추가
      if (treasuryDoc.exists) {
        transaction.update(treasuryRef, {
          totalAmount: admin.firestore.FieldValue.increment(commission + transactionTax),
          stockCommissionRevenue: admin.firestore.FieldValue.increment(commission),
          stockTaxRevenue: admin.firestore.FieldValue.increment(transactionTax),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // 국고가 없으면 생성
        transaction.set(treasuryRef, {
          totalAmount: commission + transactionTax,
          stockCommissionRevenue: commission,
          stockTaxRevenue: transactionTax,
          realEstateTransactionTaxRevenue: 0,
          realEstateAnnualTaxRevenue: 0,
          incomeTaxRevenue: 0,
          corporateTaxRevenue: 0,
          otherTaxRevenue: 0,
          classCode: classCode,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return {
        stockName: stockData.name,
        quantity: quantity,
        price: stockPrice,
        cost: cost,
        commission: commission,
        tax: transactionTax,
        totalCost: totalCost,
      };
    });

    logger.info(`[buyStock] ${uid}님이 ${result.stockName} ${result.quantity}주 매수 (총 ${result.totalCost}원)`);

    return {
      success: true,
      message: `${result.stockName} ${result.quantity}주 매수 완료`,
      ...result,
    };
  } catch (error) {
    logger.error(`[buyStock] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "주식 매수에 실패했습니다.");
  }
});

exports.sellStock = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, classCode} = await checkAuthAndGetUserData(request);
  const {holdingId, quantity} = request.data;

  if (!holdingId || !quantity || quantity <= 0) {
    throw new HttpsError("invalid-argument", "유효한 보유 주식 ID와 수량을 입력해야 합니다.");
  }

  if (!classCode) {
    throw new HttpsError("failed-precondition", "학급 코드가 할당되지 않았습니다.");
  }

  const userRef = db.collection("users").doc(uid);
  const portfolioRef = db.collection("users").doc(uid).collection("portfolio").doc(holdingId);
  const treasuryRef = db.collection("nationalTreasuries").doc(classCode);

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 🔥 먼저 portfolioData에서 stockId를 가져오기 위해 포트폴리오를 읽어야 함
      const [userDoc, portfolioDoc] = await transaction.getAll(userRef, portfolioRef);

      if (!userDoc.exists) {
        throw new Error("사용자 정보를 찾을 수 없습니다.");
      }

      if (!portfolioDoc.exists) {
        throw new Error("보유 주식 정보를 찾을 수 없습니다.");
      }

      const portfolioData = portfolioDoc.data();

      if (portfolioData.delistedAt) {
        throw new Error("상장폐지된 주식은 매도할 수 없습니다.");
      }

      const currentQuantity = portfolioData.quantity || 0;
      if (currentQuantity < quantity) {
        throw new Error(`보유 수량이 부족합니다. 보유: ${currentQuantity}주, 요청: ${quantity}주`);
      }

      // 매수 후 5분 이내 매도 제한 확인
      if (portfolioData.lastBuyTime) {
        const lastBuyTime = portfolioData.lastBuyTime.toDate ? portfolioData.lastBuyTime.toDate() : new Date(portfolioData.lastBuyTime);
        const timeSinceBuy = Date.now() - lastBuyTime.getTime();
        const LOCK_PERIOD = 5 * 60 * 1000; // 5분
        if (timeSinceBuy < LOCK_PERIOD) {
          const remainingSeconds = Math.ceil((LOCK_PERIOD - timeSinceBuy) / 1000);
          throw new Error(`매수 후 5분간은 매도할 수 없습니다. 남은 시간: ${remainingSeconds}초`);
        }
      }

      // 🔥 이제 stockId를 알았으니 주식 정보와 국고 정보를 읽음
      const stockRef = db.collection("CentralStocks").doc(portfolioData.stockId);
      const [stockDoc, treasuryDoc] = await transaction.getAll(stockRef, treasuryRef);

      if (!stockDoc.exists) {
        throw new Error("주식 정보를 찾을 수 없습니다.");
      }

      const stockData = stockDoc.data();

      if (!stockData.isListed) {
        throw new Error("상장되지 않은 주식은 매도할 수 없습니다.");
      }

      const stockPrice = stockData.price || 0;
      const sellPrice = stockPrice * quantity;
      const commission = Math.round(sellPrice * COMMISSION_RATE);

      // 양도소득세 계산
      const profit = (stockPrice - portfolioData.averagePrice) * quantity;
      const productType = stockData.productType || "stock";
      let profitTax = 0;
      if (profit > 0) {
        if (productType === "bond") {
          profitTax = Math.floor(profit * BOND_TAX_RATE);
        } else {
          profitTax = Math.floor(profit * TAX_RATE);
        }
      }

      // 거래세
      const transactionTax = Math.floor(sellPrice * TRANSACTION_TAX_RATE);
      const totalTax = profitTax + transactionTax;
      const netRevenue = sellPrice - commission - totalTax;

      // 🔥 이제 모든 쓰기 작업 수행

      // 사용자 현금 증가
      transaction.update(userRef, {
        cash: admin.firestore.FieldValue.increment(netRevenue),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 포트폴리오 업데이트 또는 삭제
      const remainingQuantity = currentQuantity - quantity;
      if (remainingQuantity > 0) {
        transaction.update(portfolioRef, {
          quantity: remainingQuantity,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.delete(portfolioRef);
      }

      // 주식 거래량 업데이트
      transaction.update(stockRef, {
        sellVolume: admin.firestore.FieldValue.increment(quantity),
        recentSellVolume: admin.firestore.FieldValue.increment(quantity),
      });

      // 국고에 세금 및 수수료 추가
      if (treasuryDoc.exists) {
        transaction.update(treasuryRef, {
          totalAmount: admin.firestore.FieldValue.increment(commission + totalTax),
          stockCommissionRevenue: admin.firestore.FieldValue.increment(commission),
          stockTaxRevenue: admin.firestore.FieldValue.increment(totalTax),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // 국고가 없으면 생성
        transaction.set(treasuryRef, {
          totalAmount: commission + totalTax,
          stockCommissionRevenue: commission,
          stockTaxRevenue: totalTax,
          realEstateTransactionTaxRevenue: 0,
          realEstateAnnualTaxRevenue: 0,
          incomeTaxRevenue: 0,
          corporateTaxRevenue: 0,
          otherTaxRevenue: 0,
          classCode: classCode,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return {
        stockName: stockData.name,
        quantity: quantity,
        sellPrice: sellPrice,
        commission: commission,
        totalTax: totalTax,
        profit: profit,
        netRevenue: netRevenue,
      };
    });

    logger.info(`[sellStock] ${uid}님이 ${result.stockName} ${result.quantity}주 매도 (순수익 ${result.netRevenue}원)`);

    return {
      success: true,
      message: `${result.stockName} ${result.quantity}주 매도 완료`,
      ...result,
    };
  } catch (error) {
    logger.error(`[sellStock] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "주식 매도에 실패했습니다.");
  }
});

// ===================================================================================
// 🔥 아이템 시스템 함수 구현
// ===================================================================================

exports.getItemContextData = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, classCode} = await checkAuthAndGetUserData(request);

  try {
    // 1. 상점 아이템 조회 (인덱스 없이 단순 조회)
    const storeItemsSnapshot = await db.collection("storeItems")
      .where("classCode", "==", classCode)
      .get();

    const storeItems = storeItemsSnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        return a.name.localeCompare(b.name);
      });

    // 2. 사용자 아이템 조회
    const userItemsSnapshot = await db.collection("users")
      .doc(uid)
      .collection("inventory")
      .get();

    const userItems = userItemsSnapshot.docs.map(doc => {
      const data = doc.data();
      const itemId = data.itemId || doc.id;

      // storeItems에서 아이템 정보 찾기
      const storeItem = storeItems.find(item => item.id === itemId);

      return {
        id: doc.id,
        ...data,
        itemId: itemId,
        // 아이템 정보가 없으면 storeItems에서 가져오기
        name: data.name || (storeItem ? storeItem.name : '알 수 없는 아이템'),
        icon: data.icon || (storeItem ? storeItem.icon : '🔮'),
        description: data.description || (storeItem ? storeItem.description : ''),
        type: data.type || (storeItem ? storeItem.type : 'general'),
        category: data.category || (storeItem ? storeItem.category : ''),
      };
    });

    logger.info(`[getItemContextData] User ${uid} has ${userItems.length} items in subcollection:`,
      userItems.map(item => `${item.itemId}:${item.name}(${item.quantity})`).join(', '));

    // 3. 마켓 리스팅 조회
    const marketListingsSnapshot = await db.collection("marketListings")
      .where("classCode", "==", classCode)
      .where("status", "==", "active")
      .get();

    const marketListings = marketListingsSnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const aTime = a.listedAt?.toMillis() || 0;
        const bTime = b.listedAt?.toMillis() || 0;
        return bTime - aTime;
      });

    // 4. 마켓 제안 조회 (사용자가 받은 제안)
    const marketOffersSnapshot = await db.collection("marketOffers")
      .where("sellerId", "==", uid)
      .where("status", "==", "pending")
      .get();

    const marketOffers = marketOffersSnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const aTime = a.offeredAt?.toMillis() || 0;
        const bTime = b.offeredAt?.toMillis() || 0;
        return bTime - aTime;
      });

    return {
      success: true,
      data: {
        storeItems,
        userItems,
        marketListings,
        marketOffers,
      },
    };
  } catch (error) {
    logger.error(`[getItemContextData] Error for user ${uid}:`, error);
    throw new HttpsError("internal", error.message || "아이템 데이터 조회에 실패했습니다.");
  }
});

exports.purchaseStoreItem = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, classCode} = await checkAuthAndGetUserData(request);
  const {itemId, quantity = 1} = request.data;

  if (!itemId || quantity <= 0) {
    throw new HttpsError("invalid-argument", "유효한 아이템 ID와 수량을 입력해야 합니다.");
  }

  const userRef = db.collection("users").doc(uid);
  const itemRef = db.collection("storeItems").doc(itemId);
  const userItemRef = userRef.collection("inventory").doc(itemId);

  try {
    // 먼저 데이터를 읽어서 검증
    const [userDoc, itemDoc, userItemDoc] = await Promise.all([
      userRef.get(),
      itemRef.get(),
      userItemRef.get(),
    ]);

    if (!userDoc.exists) {
      throw new Error("사용자 정보를 찾을 수 없습니다.");
    }

    if (!itemDoc.exists) {
      throw new Error("아이템을 찾을 수 없습니다.");
    }

    const userData = userDoc.data();
    const itemData = itemDoc.data();

    const totalCost = itemData.price * quantity;
    const currentCash = userData.cash || 0;

    if (currentCash < totalCost) {
      throw new Error(`현금이 부족합니다. 필요: ${totalCost.toLocaleString()}원, 보유: ${currentCash.toLocaleString()}원`);
    }

    // Batch write로 원자적 처리
    const batch = db.batch();

    // 현금 차감
    batch.update(userRef, {
      cash: admin.firestore.FieldValue.increment(-totalCost),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 사용자 아이템에 추가
    if (userItemDoc.exists) {
      batch.update(userItemRef, {
        quantity: admin.firestore.FieldValue.increment(quantity),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      const newItemData = {
        itemId: itemId,
        name: itemData.name || "",
        quantity: quantity,
        acquiredAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // optional 필드들만 추가
      if (itemData.category) newItemData.category = itemData.category;
      if (itemData.description) newItemData.description = itemData.description;
      if (itemData.effect) newItemData.effect = itemData.effect;

      batch.set(userItemRef, newItemData);
    }

    await batch.commit();

    const result = {
      itemName: itemData.name,
      quantity: quantity,
      totalCost: totalCost,
    };

    logger.info(`[purchaseStoreItem] ${uid}님이 ${result.itemName} ${result.quantity}개 구매 (${result.totalCost}원)`);

    return {
      success: true,
      message: `${result.itemName} ${result.quantity}개 구매 완료`,
      ...result,
    };
  } catch (error) {
    logger.error(`[purchaseStoreItem] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "아이템 구매에 실패했습니다.");
  }
});

exports.useUserItem = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request);
  const {itemId} = request.data;

  if (!itemId) {
    throw new HttpsError("invalid-argument", "아이템 ID가 필요합니다.");
  }

  const userRef = db.collection("users").doc(uid);
  const userItemRef = userRef.collection("inventory").doc(itemId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const userItemDoc = await transaction.get(userItemRef);

      if (!userItemDoc.exists) {
        throw new Error("아이템을 찾을 수 없습니다.");
      }

      const itemData = userItemDoc.data();
      const currentQuantity = itemData.quantity || 0;

      if (currentQuantity <= 0) {
        throw new Error("아이템 수량이 부족합니다.");
      }

      // 아이템 효과 적용 (예: 현금 증가)
      if (itemData.effect && itemData.effect.type === "cash") {
        const cashAmount = itemData.effect.value || 0;
        transaction.update(userRef, {
          cash: admin.firestore.FieldValue.increment(cashAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 아이템 수량 감소
      const newQuantity = currentQuantity - 1;
      if (newQuantity > 0) {
        transaction.update(userItemRef, {
          quantity: newQuantity,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.delete(userItemRef);
      }

      return {
        itemName: itemData.name,
        effect: itemData.effect,
      };
    });

    logger.info(`[useUserItem] ${uid}님이 ${result.itemName} 사용`);

    return {
      success: true,
      message: `${result.itemName} 사용 완료`,
      ...result,
    };
  } catch (error) {
    logger.error(`[useUserItem] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "아이템 사용에 실패했습니다.");
  }
});

exports.listUserItemForSale = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, classCode, userData} = await checkAuthAndGetUserData(request);
  const {inventoryItemId, quantity, price} = request.data;

  if (!inventoryItemId || !quantity || quantity <= 0 || !price || price <= 0) {
    throw new HttpsError("invalid-argument", "유효한 아이템 정보, 수량, 가격을 입력해야 합니다.");
  }

  const userItemRef = db.collection("users").doc(uid).collection("inventory").doc(inventoryItemId);
  const marketListingsRef = db.collection("marketListings");

  try {
    await db.runTransaction(async (transaction) => {
      const userItemDoc = await transaction.get(userItemRef);

      if (!userItemDoc.exists) {
        throw new Error("판매할 아이템을 인벤토리에서 찾을 수 없습니다.");
      }

      const itemData = userItemDoc.data();
      const currentQuantity = itemData.quantity || 0;

      if (currentQuantity < quantity) {
        throw new Error(`아이템 수량이 부족합니다. (보유: ${currentQuantity}, 판매 요청: ${quantity})`);
      }

      // 인벤토리에서 아이템 수량 차감
      const newQuantity = currentQuantity - quantity;
      if (newQuantity > 0) {
        transaction.update(userItemRef, {quantity: newQuantity});
      } else {
        transaction.delete(userItemRef);
      }

      // 새로운 마켓 리스팅 생성
      const newListingRef = marketListingsRef.doc();
      transaction.set(newListingRef, {
        sellerId: uid,
        sellerName: userData.name,
        classCode: classCode,
        itemId: itemData.itemId || inventoryItemId,
        name: itemData.name || "알 수 없는 아이템",
        icon: itemData.icon || "🔮",
        description: itemData.description || "",
        type: itemData.type || "general",
        quantity: quantity,
        price: price,
        status: "active",
        listedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return {success: true, message: "아이템을 시장에 등록했습니다."};
  } catch (error) {
    logger.error(`[listUserItemForSale] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "아이템 판매 등록에 실패했습니다.");
  }
});

// ===================================================================================
// 관리자 설정 데이터 통합 조회 (최적화)
// ===================================================================================

exports.getAdminSettingsData = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, classCode, isAdmin, isSuperAdmin} = await checkAuthAndGetUserData(request, true);
  const {tab} = request.data;

  try {
    let data = {};

    switch (tab) {
      case "studentManagement":
        // 학생 데이터 조회
        const studentsSnapshot = await db.collection("users")
          .where("classCode", "==", classCode)
          .where("role", "==", "student")
          .get();

        data.students = studentsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        break;

      case "salarySettings":
        // 급여 설정 조회
        const salaryDoc = await db.collection("classSettings")
          .doc(classCode)
          .collection("settings")
          .doc("salary")
          .get();

        data.salarySettings = salaryDoc.exists ? salaryDoc.data() : {};
        break;

      case "generalSettings":
        // 일반 설정 조회
        const settingsDoc = await db.collection("classSettings")
          .doc(classCode)
          .get();

        data.generalSettings = settingsDoc.exists ? settingsDoc.data() : {};
        break;

      case "systemManagement":
        if (!isSuperAdmin) {
          throw new HttpsError("permission-denied", "최고 관리자 권한이 필요합니다.");
        }

        // 시스템 관리 데이터 조회
        const allClassesSnapshot = await db.collection("classSettings").get();
        data.allClasses = allClassesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        break;

      default:
        // 기본적으로 일반 설정 반환
        const defaultDoc = await db.collection("classSettings")
          .doc(classCode)
          .get();

        data = defaultDoc.exists ? defaultDoc.data() : {};
    }

    logger.info(`[getAdminSettingsData] ${uid}님이 ${tab} 데이터 조회`);

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    logger.error(`[getAdminSettingsData] Error for user ${uid}:`, error);
    throw new HttpsError("internal", error.message || "데이터 조회에 실패했습니다.");
  }
});

// ===================================================================================
// 배치 급여 지급
// ===================================================================================

exports.batchPaySalaries = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, classCode, isAdmin, isSuperAdmin} = await checkAuthAndGetUserData(request, true);
  const {studentIds, payAll} = request.data;

  try {
    // 급여 설정 가져오기
    const salaryDoc = await db.collection("classSettings")
      .doc(classCode)
      .collection("settings")
      .doc("salary")
      .get();

    const salarySettings = salaryDoc.exists ? salaryDoc.data() : {};

    // 지급할 학생 목록 결정
    let targetStudents = [];
    if (payAll) {
      const studentsSnapshot = await db.collection("users")
        .where("classCode", "==", classCode)
        .where("role", "==", "student")
        .get();

      targetStudents = studentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } else {
      // 특정 학생들만 조회
      const studentDocs = await Promise.all(
        studentIds.map(id => db.collection("users").doc(id).get())
      );

      targetStudents = studentDocs
        .filter(doc => doc.exists)
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
    }

    // 배치로 급여 지급
    const batch = db.batch();
    let paidCount = 0;
    let totalAmount = 0;

    for (const student of targetStudents) {
      const job = student.job || "무직";
      const salary = salarySettings[job] || 0;

      if (salary > 0) {
        const studentRef = db.collection("users").doc(student.id);
        batch.update(studentRef, {
          cash: admin.firestore.FieldValue.increment(salary),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        paidCount++;
        totalAmount += salary;
      }
    }

    await batch.commit();

    logger.info(`[batchPaySalaries] ${uid}님이 ${paidCount}명에게 총 ${totalAmount}원 지급`);

    return {
      success: true,
      message: `${paidCount}명에게 총 ${totalAmount.toLocaleString()}원 지급 완료`,
      paidCount: paidCount,
      totalAmount: totalAmount,
    };
  } catch (error) {
    logger.error(`[batchPaySalaries] Error for user ${uid}:`, error);
    throw new HttpsError("internal", error.message || "급여 지급에 실패했습니다.");
  }
});

// ===================================================================================
// 아이템 시장 거래 함수
// ===================================================================================

exports.buyMarketItem = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, userData} = await checkAuthAndGetUserData(request);
  const {listingId} = request.data;

  if (!listingId) {
    throw new HttpsError("invalid-argument", "구매할 아이템 ID를 입력해야 합니다.");
  }

  const listingRef = db.collection("marketListings").doc(listingId);
  const buyerRef = db.collection("users").doc(uid);

  try {
    await db.runTransaction(async (transaction) => {
      const listingDoc = await transaction.get(listingRef);

      if (!listingDoc.exists) {
        throw new Error("판매 중인 아이템을 찾을 수 없습니다.");
      }

      const listingData = listingDoc.data();

      if (listingData.status !== "active") {
        throw new Error("이미 판매 완료되었거나 취소된 아이템입니다.");
      }

      if (listingData.sellerId === uid) {
        throw new Error("자신이 판매한 아이템은 구매할 수 없습니다.");
      }

      const buyerDoc = await transaction.get(buyerRef);
      if (!buyerDoc.exists) {
        throw new Error("구매자 정보를 찾을 수 없습니다.");
      }

      const buyerData = buyerDoc.data();
      const totalPrice = listingData.price * listingData.quantity;

      if (buyerData.cash < totalPrice) {
        throw new Error(`현금이 부족합니다. (필요: ${totalPrice.toLocaleString()}원, 보유: ${buyerData.cash.toLocaleString()}원)`);
      }

      // 구매자 현금 차감
      transaction.update(buyerRef, {
        cash: admin.firestore.FieldValue.increment(-totalPrice),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 판매자에게 현금 지급
      const sellerRef = db.collection("users").doc(listingData.sellerId);
      transaction.update(sellerRef, {
        cash: admin.firestore.FieldValue.increment(totalPrice),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 구매자 인벤토리에 아이템 추가
      const buyerInventoryRef = db.collection("users").doc(uid).collection("inventory");
      const buyerItemQuery = await buyerInventoryRef.where("itemId", "==", listingData.itemId).get();

      if (!buyerItemQuery.empty) {
        const buyerItemDoc = buyerItemQuery.docs[0];
        transaction.update(buyerItemDoc.ref, {
          quantity: admin.firestore.FieldValue.increment(listingData.quantity),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const newItemRef = buyerInventoryRef.doc();
        transaction.set(newItemRef, {
          itemId: listingData.itemId,
          name: listingData.name,
          icon: listingData.icon || "🔮",
          description: listingData.description || "",
          type: listingData.type || "general",
          quantity: listingData.quantity,
          purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 마켓 리스팅 상태 업데이트
      transaction.update(listingRef, {
        status: "sold",
        buyerId: uid,
        buyerName: userData.name,
        soldAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return {success: true, message: "아이템을 성공적으로 구매했습니다."};
  } catch (error) {
    logger.error(`[buyMarketItem] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "아이템 구매에 실패했습니다.");
  }
});

exports.cancelMarketSale = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request);
  const {listingId} = request.data;

  if (!listingId) {
    throw new HttpsError("invalid-argument", "취소할 판매 ID를 입력해야 합니다.");
  }

  const listingRef = db.collection("marketListings").doc(listingId);

  try {
    await db.runTransaction(async (transaction) => {
      const listingDoc = await transaction.get(listingRef);

      if (!listingDoc.exists) {
        throw new Error("판매 정보를 찾을 수 없습니다.");
      }

      const listingData = listingDoc.data();

      if (listingData.sellerId !== uid) {
        throw new Error("본인이 등록한 판매만 취소할 수 있습니다.");
      }

      if (listingData.status !== "active") {
        throw new Error("이미 판매 완료되었거나 취소된 아이템입니다.");
      }

      // 판매자 인벤토리에 아이템 복원
      const sellerInventoryRef = db.collection("users").doc(uid).collection("inventory");
      const sellerItemQuery = await sellerInventoryRef.where("itemId", "==", listingData.itemId).get();

      if (!sellerItemQuery.empty) {
        const sellerItemDoc = sellerItemQuery.docs[0];
        transaction.update(sellerItemDoc.ref, {
          quantity: admin.firestore.FieldValue.increment(listingData.quantity),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const newItemRef = sellerInventoryRef.doc();
        transaction.set(newItemRef, {
          itemId: listingData.itemId,
          name: listingData.name,
          icon: listingData.icon || "🔮",
          description: listingData.description || "",
          type: listingData.type || "general",
          quantity: listingData.quantity,
          restoredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 마켓 리스팅 삭제
      transaction.delete(listingRef);
    });

    return {success: true, message: "판매가 취소되었습니다."};
  } catch (error) {
    logger.error(`[cancelMarketSale] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "판매 취소에 실패했습니다.");
  }
});

exports.makeOffer = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, userData} = await checkAuthAndGetUserData(request);
  const {listingId, offerPrice, quantity = 1} = request.data;

  if (!listingId || !offerPrice || offerPrice <= 0) {
    throw new HttpsError("invalid-argument", "유효한 제안 가격을 입력해야 합니다.");
  }

  const listingRef = db.collection("marketListings").doc(listingId);
  const offersRef = db.collection("marketOffers");

  try {
    const listingDoc = await listingRef.get();

    if (!listingDoc.exists) {
      throw new Error("판매 정보를 찾을 수 없습니다.");
    }

    const listingData = listingDoc.data();

    if (listingData.status !== "active") {
      throw new Error("현재 판매 중인 아이템이 아닙니다.");
    }

    if (listingData.sellerId === uid) {
      throw new Error("자신이 판매한 아이템에는 제안할 수 없습니다.");
    }

    // 새 제안 생성
    const newOfferRef = offersRef.doc();
    await newOfferRef.set({
      listingId: listingId,
      buyerId: uid,
      buyerName: userData.name,
      sellerId: listingData.sellerId,
      sellerName: listingData.sellerName,
      itemId: listingData.itemId,
      itemName: listingData.name,
      originalPrice: listingData.price,
      offerPrice: offerPrice,
      quantity: quantity,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {success: true, message: "가격 제안이 전송되었습니다.", offerId: newOfferRef.id};
  } catch (error) {
    logger.error(`[makeOffer] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "가격 제안에 실패했습니다.");
  }
});