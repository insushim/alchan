/* eslint-disable */
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

// ===================================================================================
// 📝 활동 로그 관련 함수 및 설정
// ===================================================================================

const LOG_TYPES = {
  // 현금 관련
  CASH_INCOME: "현금 입금",
  CASH_EXPENSE: "현금 출금",
  CASH_TRANSFER_SEND: "송금",
  CASH_TRANSFER_RECEIVE: "송금 수신",
  ADMIN_CASH_SEND: "관리자 지급",
  ADMIN_CASH_TAKE: "관리자 회수",

  // 쿠폰 관련
  COUPON_EARN: "쿠폰 획득",
  COUPON_USE: "쿠폰 사용",
  COUPON_GIVE: "쿠폰 지급",
  COUPON_TAKE: "쿠폰 회수",
  COUPON_TRANSFER_SEND: "쿠폰 송금",
  COUPON_TRANSFER_RECEIVE: "쿠폰 수신",
  COUPON_DONATE: "쿠폰 기부",
  COUPON_SELL: "쿠폰 판매",

  // 아이템 관련
  ITEM_PURCHASE: "아이템 구매",
  ITEM_USE: "아이템 사용",
  ITEM_SELL: "아이템 판매",
  ITEM_MARKET_LIST: "아이템 시장 등록",
  ITEM_MARKET_BUY: "아이템 시장 구매",
  ITEM_OBTAIN: "아이템 획득",
  ITEM_MOVE: "아이템 이동",

  // 과제 관련
  TASK_COMPLETE: "과제 완료",
  TASK_REWARD: "과제 보상",

  // 시스템 관련
  SYSTEM: "시스템",
  ADMIN_ACTION: "관리자 조치",
};

/**
 * 활동 로그를 기록하는 함수 (서버용)
 * @param {admin.firestore.Transaction|null} transaction - Firestore 트랜잭션 객체 (트랜잭션 내에서 실행될 경우)
 * @param {string} userId - 사용자 ID
 * @param {string} type - 활동 유형 (LOG_TYPES 참조)
 * @param {string} description - 활동 설명
 * @param {object} metadata - 추가 메타데이터
 */
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


// ===================================================================================
// 🛠️ 공통 헬퍼 함수 및 설정
// ===================================================================================

const cache = new Map();


// 배치 읽기 최적화 헬퍼
const batchRead = async (refs) => {
  const chunks = [];
  for (let i = 0; i < refs.length; i += 500) {
    chunks.push(refs.slice(i, i + 500));
  }

  const allResults = [];
  for (const chunk of chunks) {
    const results = await db.getAll(...chunk);
    allResults.push(...results);
  }

  return allResults;
};

const cacheUtils = {
  get: (key) => {
    const item = cache.get(key);
    if (item && Date.now() < item.expiry) {
      return item.data;
    }
    cache.delete(key);
    return null;
  },
  set: (key, data, ttlSeconds = 300) => {
    cache.set(key, {
      data,
      expiry: Date.now() + (ttlSeconds * 1000),
    });
  },
  clear: () => cache.clear(),
};

const checkAuthAndGetUserData = async (request, checkAdmin = false) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "인증된 사용자만 함수를 호출할 수 있습니다.");
  }

  const uid = request.auth.uid;
  logger.info(`[checkAuthAndGetUserData] Received UID: ${uid}`);
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

function isMarketOpen() {
  const now = new Date();
  const koreaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
  const day = koreaTime.getDay();
  const hour = koreaTime.getHours();

  logger.info(`[Market Check] 현재 한국 시간: ${koreaTime.toISOString()}, 요일: ${day}, 시간: ${hour}`);

  if (day === 0 || day === 6) {
    logger.info("[Market Check] 주말이므로 시장이 닫혔습니다.");
    return false;
  }
  if (hour < 8 || hour >= 15) {
    logger.info(`[Market Check] 운영 시간이 아니므로 (현재 ${hour}시) 시장이 닫혔습니다.`);
    return false;
  }

  logger.info("[Market Check] 시장이 열려있습니다.");
  return true;
}

const PRODUCT_TYPES = {
  STOCK: "stock",
  ETF: "etf",
  BOND: "bond",
};

const STOCK_NEWS = {
  TECH: {
    strongPositive: [{title: "🚀 혁신적 AI 칩 대박", content: "차세대 AI 칩이 성능 테스트에서 경쟁사 대비 5배 향상된 결과를 보여 업계를 충격에 빠뜨렸습니다."}],
    weakPositive: [{title: "📈 실적 예상 상회", content: "분기 실적이 시장 예상치를 소폭 상회하며 안정적인 성장세를 보이고 있습니다."}],
    weakNegative: [{title: "📉 성장 둔화 우려", content: "시장 포화로 인해 성장률이 점진적으로 둔화되고 있다는 분석이 나왔습니다."}],
    strongNegative: [{title: "🔴 대규모 리콜 사태", content: "심각한 제품 결함으로 전량 리콜 조치가 내려져 막대한 손실이 예상됩니다."}],
  },
  FINANCE: {
    strongPositive: [
      {title: "🏦 사상 최대 순익", content: "역대 최고 분기 순이익을 달성하며 주주 배당금을 대폭 인상했습니다."},
      {title: "💰 초대형 M&A 성사", content: "업계 1위 기업 인수에 성공하여 시장 지배력을 크게 강화했습니다."},
      {title: "📊 신용등급 상향", content: "국제 신용평가사로부터 최고 등급을 획득했습니다."},
    ],
    weakPositive: [
      {title: "📈 대출 포트폴리오 개선", content: "부실대출 비율이 전분기 대비 소폭 감소했습니다."},
      {title: "🪙 지점 효율화 성공", content: "디지털 전환으로 운영 비용이 절감되고 있습니다."},
      {title: "💳 카드 사용액 증가", content: "신용카드 결제액이 꾸준히 증가하고 있습니다."},
    ],
    weakNegative: [
      {title: "📉 예대마진 축소", content: "저금리 기조로 인해 순이자마진이 압박받고 있습니다."},
      {title: "⚖️ 규제 비용 증가", content: "금융 규제 강화로 준법 비용이 상승하고 있습니다."},
      {title: "🏢 상업용 부동산 우려", content: "상업용 부동산 대출 부실 가능성이 제기되고 있습니다."},
    ],
    strongNegative: [
      {title: "🔴 대규모 손실 발생", content: "투자 실패로 수조원의 손실이 발생했습니다."},
      {title: "⚠️ 횡령 스캔들", content: "임원진 횡령 사건으로 금융당국 특별 감사를 받게 되었습니다."},
      {title: "💥 시스템 마비", content: "전산 시스템 장애로 금융 거래가 전면 중단되었습니다."},
    ],
  },
  CONSUMER: {
    strongPositive: [
      {title: "🚀 글로벌 히트 상품", content: "신제품이 전 세계적으로 폭발적인 인기를 얻으며 품절 대란이 일어났습니다."},
      {title: "🏆 브랜드 가치 1위", content: "글로벌 브랜드 가치 평가에서 업계 1위를 차지했습니다."},
      {title: "💎 프리미엄 시장 석권", content: "고급 제품 라인이 큰 성공을 거두며 수익성이 대폭 개선되었습니다."},
    ],
    weakPositive: [
      {title: "🛍️ 매출 소폭 증가", content: "계절 특수로 매출이 전년 동기 대비 상승했습니다."},
      {title: "📦 온라인 판매 호조", content: "이커머스 채널 매출이 꾸준히 성장하고 있습니다."},
      {title: "🌱 신규 브랜드 론칭", content: "젊은 층을 타겟으로 한 새로운 브랜드를 출시했습니다."},
    ],
    weakNegative: [
      {title: "📉 재고 증가 부담", content: "판매 부진으로 재고 수준이 상승하고 있습니다."},
      {title: "💸 마케팅 비용 상승", content: "경쟁 심화로 광고비 지출이 늘어나고 있습니다."},
      {title: "🚚 물류비 부담 지속", content: "운송비 상승이 수익성을 압박하고 있습니다."},
    ],
    strongNegative: [
      {title: "🔴 대규모 불매 운동", content: "품질 논란으로 소비자 불매 운동이 확산되고 있습니다."},
      {title: "⚠️ 리콜 사태 발생", content: "안전 문제로 전 제품 리콜 조치가 내려졌습니다."},
      {title: "💥 주력 매장 폐쇄", content: "핵심 지역 대형 매장들이 연쇄 폐점했습니다."},
    ],
  },
  HEALTHCARE: {
    strongPositive: [
      {title: "💊 블록버스터 신약 승인", content: "혁신 신약이 FDA 승인을 받아 연 매출 10조원이 예상됩니다."},
      {title: "🧬 획기적 치료법 개발", content: "난치병 완치 가능한 유전자 치료제 개발에 성공했습니다."},
      {title: "🏆 글로벌 제약사 인수", content: "세계적인 제약회사 인수로 시장 점유율 1위로 도약했습니다."},
    ],
    weakPositive: [
      {title: "💉 임상 3상 진입", content: "주요 신약 후보물질이 임상 3상에 진입했습니다."},
      {title: "🏥 병원 계약 체결", content: "대형 병원 체인과 의약품 공급 계약을 체결했습니다."},
      {title: "📈 바이오시밀러 성장", content: "바이오시밀러 제품 매출이 꾸준히 증가하고 있습니다."},
    ],
    weakNegative: [
      {title: "📉 약가 인하 압박", content: "정부의 약가 인하 정책으로 마진이 축소되고 있습니다."},
      {title: "⏰ 특허 만료 임박", content: "주력 제품의 특허 만료가 다가오고 있습니다."},
      {title: "💊 제네릭 경쟁 심화", content: "저가 제네릭 의약품과의 경쟁이 치열해지고 있습니다."},
    ],
    strongNegative: [
      {title: "🔴 임상시험 대실패", content: "수조원을 투자한 신약 임상시험이 완전히 실패했습니다."},
      {title: "⚠️ 약물 부작용 소송", content: "심각한 부작용으로 대규모 집단 소송에 직면했습니다."},
      {title: "💥 생산시설 폐쇄", content: "품질 문제로 주요 생산시설이 강제 폐쇄되었습니다."},
    ],
  },
  ENERGY: {
    strongPositive: [
      {title: "🛢️ 초대형 유전 발견", content: "사상 최대 규모의 유전을 발견하여 기업 가치가 급등했습니다."},
      {title: "⚡ 차세대 배터리 혁명", content: "혁신적인 배터리 기술로 에너지 저장 시장을 선도하게 되었습니다."},
      {title: "☀️ 태양광 효율 신기록", content: "세계 최고 효율의 태양광 패널 개발에 성공했습니다."},
    ],
    weakPositive: [
      {title: "📈 유가 상승 수혜", content: "국제 유가 상승으로 실적 개선이 예상됩니다."},
      {title: "🌱 신재생 투자 확대", content: "친환경 에너지 사업에 대한 투자를 늘리고 있습니다."},
      {title: "⛽ 정제마진 개선", content: "정유 부문 마진이 회복세를 보이고 있습니다."},
    ],
    weakNegative: [
      {title: "📉 수요 둔화 우려", content: "경기 침체로 에너지 수요가 감소할 것으로 예상됩니다."},
      {title: "🏭 탄소세 부담 증가", content: "환경 규제 강화로 추가 비용이 발생하고 있습니다."},
      {title: "⚡ 전력 가격 하락", content: "전력 도매가격 하락으로 수익성이 악화되고 있습니다."},
    ],
    strongNegative: [
      {title: "🔴 대형 사고 발생", content: "정유시설 폭발 사고로 가동이 전면 중단되었습니다."},
      {title: "⚠️ 환경 재해 배상", content: "대규모 환경 오염으로 천문학적 배상금을 지불하게 되었습니다."},
      {title: "💥 에너지 자산 좌초", content: "화석연료 자산이 좌초자산으로 분류되어 대규모 손실이 발생했습니다."},
    ],
  },
  INDUSTRIAL: {
    strongPositive: [
      {title: "🏗️ 초대형 프로젝트 수주", content: "100조원 규모의 인프라 프로젝트를 단독 수주했습니다."},
      {title: "🚀 혁신 기술 특허", content: "4차 산업혁명 핵심 기술 특허를 독점 확보했습니다."},
      {title: "✈️ 항공기 대량 계약", content: "글로벌 항공사로부터 대규모 항공기 주문을 받았습니다."},
    ],
    weakPositive: [
      {title: "📈 수주 잔고 증가", content: "신규 수주가 늘어 수주잔고가 증가했습니다."},
      {title: "🏭 가동률 상승", content: "공장 가동률이 전분기 대비 개선되었습니다."},
      {title: "🔧 자동화 투자 효과", content: "생산 자동화로 효율성이 향상되고 있습니다."},
    ],
    weakNegative: [
      {title: "📉 원자재 가격 상승", content: "철강 등 원자재 가격 상승으로 원가 부담이 커지고 있습니다."},
      {title: "⚙️ 설비 노후화", content: "생산 설비 노후화로 유지보수 비용이 증가하고 있습니다."},
      {title: "🚢 물류 지연", content: "글로벌 물류 차질로 납기에 어려움을 겪고 있습니다."},
    ],
    strongNegative: [
      {title: "🔴 핵심 계약 취소", content: "최대 고객사가 전격적으로 계약을 취소했습니다."},
      {title: "⚠️ 대형 사고 발생", content: "산업재해로 공장 가동이 무기한 중단되었습니다."},
      {title: "💥 공급망 완전 마비", content: "핵심 부품 공급이 끊겨 생산이 전면 중단되었습니다."},
    ],
  },
  MATERIALS: {
    strongPositive: [
      {title: "💎 희귀 광물 독점", content: "전략 광물 광산을 인수하여 시장을 독점하게 되었습니다."},
      {title: "🔬 신소재 개발 성공", content: "혁명적인 신소재 개발로 노벨상 후보에 올랐습니다."},
      {title: "📈 원자재 가격 급등", content: "보유 원자재 가격이 급등하여 재고 가치가 크게 상승했습니다."},
    ],
    weakPositive: [
      {title: "🏗️ 건설 수요 회복", content: "건설경기 회복으로 자재 수요가 증가하고 있습니다."},
      {title: "♻️ 재활용 사업 성장", content: "친환경 재활용 소재 사업이 성장세를 보이고 있습니다."},
      {title: "🌏 수출 물량 증가", content: "해외 수출이 전년 대비 증가했습니다."},
    ],
    weakNegative: [
      {title: "📉 재고 부담 증가", content: "수요 둔화로 재고가 늘어나고 있습니다."},
      {title: "💰 가격 경쟁 심화", content: "저가 수입품과의 경쟁이 치열해지고 있습니다."},
      {title: "⚡ 에너지 비용 상승", content: "전력비 인상으로 생산 원가가 상승하고 있습니다."},
    ],
    strongNegative: [
      {title: "🔴 광산 붕괴 사고", content: "주요 광산 붕괴로 생산이 완전 중단되었습니다."},
      {title: "⚠️ 환경 오염 적발", content: "심각한 환경 오염으로 영업 정지 처분을 받았습니다."},
      {title: "💥 핵심 고객 이탈", content: "최대 고객사가 경쟁사로 전격 이동했습니다."},
    ],
  },
  REALESTATE: {
    strongPositive: [
      {title: "🏢 랜드마크 개발 성공", content: "초대형 복합단지 개발로 도시의 새로운 중심지를 만들었습니다."},
      {title: "📈 부동산 가격 급등", content: "보유 부동산 가치가 전년 대비 50% 이상 상승했습니다."},
      {title: "🏆 글로벌 리츠 1위", content: "세계 최대 규모의 부동산투자신탁으로 성장했습니다."},
    ],
    weakPositive: [
      {title: "🏠 분양 호조", content: "신규 분양이 조기 완판되었습니다."},
      {title: "📊 임대료 인상", content: "상업용 부동산 임대료가 상승하고 있습니다."},
      {title: "🏗️ 재개발 승인", content: "대규모 재개발 사업이 승인되었습니다."},
    ],
    weakNegative: [
      {title: "📉 공실률 상승", content: "오피스 공실률이 증가하고 있습니다."},
      {title: "💰 금리 인상 부담", content: "대출 금리 상승으로 자금 조달 비용이 증가했습니다."},
      {title: "🏠 미분양 증가", content: "주택 미분양 물량이 늘어나고 있습니다."},
    ],
    strongNegative: [
      {title: "🔴 프로젝트 파산", content: "대형 개발 프로젝트가 자금난으로 파산했습니다."},
      {title: "⚠️ 부실 시공 발각", content: "아파트 부실 시공으로 전면 재시공 명령을 받았습니다."},
      {title: "💥 부동산 버블 붕괴", content: "부동산 가격이 폭락하여 대규모 손실이 발생했습니다."},
    ],
  },
  UTILITIES: {
    strongPositive: [
      {title: "⚡ 전력 독점권 획득", content: "대도시 전력 공급 독점권을 30년간 확보했습니다."},
      {title: "💧 수자원 개발 성공", content: "대규모 수자원 개발로 안정적인 수익원을 확보했습니다."},
      {title: "🌟 스마트그리드 혁신", content: "차세대 스마트그리드로 에너지 효율을 획기적으로 개선했습니다."},
    ],
    weakPositive: [
      {title: "📈 전력 수요 증가", content: "데이터센터 증설로 전력 수요가 늘고 있습니다."},
      {title: "💰 요금 인상 승인", content: "공공요금 인상이 승인되어 수익성이 개선될 전망입니다."},
      {title: "🔧 인프라 개선", content: "노후 설비 교체로 운영 효율성이 향상되었습니다."},
    ],
    weakNegative: [
      {title: "📉 사용량 감소", content: "에너지 절약으로 전력 사용량이 줄어들고 있습니다."},
      {title: "🏭 유지보수 비용 증가", content: "설비 노후화로 유지보수 비용이 상승하고 있습니다."},
      {title: "⚖️ 규제 강화", content: "환경 규제 강화로 추가 투자가 필요합니다."},
    ],
    strongNegative: [
      {title: "🔴 대규모 정전 사태", content: "시스템 오류로 대도시 전체가 정전되었습니다."},
      {title: "⚠️ 댐 붕괴 위험", content: "주요 댐에 심각한 균열이 발견되어 긴급 보수가 필요합니다."},
      {title: "💥 요금 인상 철회", content: "시민 반발로 요금 인상이 전면 철회되었습니다."},
    ],
  },
  COMMUNICATION: {
    strongPositive: [
      {title: "📡 6G 기술 선점", content: "세계 최초 6G 상용화에 성공하여 시장을 선도하게 되었습니다."},
      {title: "🛰️ 위성통신 독점", content: "글로벌 위성통신 사업권을 독점 확보했습니다."},
      {title: "💎 콘텐츠 대박", content: "독점 콘텐츠가 전 세계적으로 폭발적인 인기를 얻었습니다."},
    ],
    weakPositive: [
      {title: "📱 5G 가입자 증가", content: "5G 서비스 가입자가 꾸준히 늘고 있습니다."},
      {title: "📊 데이터 사용량 증가", content: "모바일 데이터 트래픽이 증가하여 수익이 개선되고 있습니다."},
      {title: "🤝 로밍 제휴 확대", content: "국제 로밍 파트너십을 확대했습니다."},
    ],
    weakNegative: [
      {title: "📉 ARPU 하락", content: "가입자당 평균 수익이 감소하고 있습니다."},
      {title: "💸 망 투자 부담", content: "차세대 네트워크 구축 비용이 예상보다 많이 소요됩니다."},
      {title: "⚔️ 요금 경쟁 심화", content: "통신사 간 요금 인하 경쟁이 치열해지고 있습니다."},
    ],
    strongNegative: [
      {title: "🔴 대규모 통신 장애", content: "전국적인 통신망 마비로 서비스가 중단되었습니다."},
      {title: "⚠️ 개인정보 대량 유출", content: "해킹으로 전체 가입자 정보가 유출되었습니다."},
      {title: "💥 주파수 라이센스 취소", content: "규정 위반으로 핵심 주파수 사용권이 취소되었습니다."},
    ],
  },
  ENTERTAINMENT: {
    strongPositive: [
      {title: "🎬 글로벌 메가히트", content: "제작 영화가 전 세계 박스오피스 1위를 기록했습니다."},
      {title: "🎮 게임 대박", content: "신작 게임이 출시 첫날 1000만 다운로드를 돌파했습니다."},
      {title: "🌟 스타 영입", content: "세계적인 스타를 독점 계약으로 영입했습니다."},
    ],
    weakPositive: [
      {title: "📺 시청률 상승", content: "새 드라마가 시청률 1위를 기록하고 있습니다."},
      {title: "🎵 음원 차트 진입", content: "신곡이 주요 음원 차트에 진입했습니다."},
      {title: "🎭 공연 매진", content: "콘서트 티켓이 오픈 직후 매진되었습니다."},
    ],
    weakNegative: [
      {title: "📉 구독자 감소", content: "스트리밍 서비스 구독자가 소폭 감소했습니다."},
      {title: "💰 제작비 상승", content: "콘텐츠 제작 비용이 증가하고 있습니다."},
      {title: "🎬 개봉 연기", content: "대작 영화 개봉이 연기되었습니다."},
    ],
    strongNegative: [
      {title: "🔴 흥행 대참패", content: "블록버스터 영화가 제작비도 회수하지 못했습니다."},
      {title: "⚠️ 스캔들 발생", content: "소속 스타의 스캔들로 이미지가 크게 실추되었습니다."},
      {title: "💥 저작권 소송 패소", content: "대규모 저작권 소송에서 패소하여 막대한 배상금을 지불하게 되었습니다."},
    ],
  },
  INDEX: {
    strongPositive: [
      {title: "📊 시장 강세장 진입", content: "주요 지수가 역대 최고치를 경신하며 강세장에 진입했습니다."},
      {title: "💹 대규모 자금 유입", content: "기관투자자들의 대규모 매수로 지수가 급등했습니다."},
      {title: "🚀 경제지표 호조", content: "주요 경제지표가 예상을 크게 상회하며 시장 전체가 상승했습니다."},
    ],
    weakPositive: [
      {title: "📈 지수 소폭 상승", content: "주요 지수가 안정적인 상승세를 이어가고 있습니다."},
      {title: "💰 ETF 순매수", content: "ETF에 대한 순매수가 지속되고 있습니다."},
      {title: "🌏 글로벌 시장 회복", content: "글로벌 증시 회복세에 따라 국내 지수도 상승하고 있습니다."},
    ],
    weakNegative: [
      {title: "📉 지수 조정", content: "차익실현 매물로 지수가 소폭 하락했습니다."},
      {title: "🌊 변동성 확대", content: "시장 변동성이 커지면서 투자 심리가 위축되고 있습니다."},
      {title: "💸 외국인 매도", content: "외국인 투자자들의 순매도가 이어지고 있습니다."},
    ],
    strongNegative: [
      {title: "🔴 시장 대폭락", content: "패닉 매도로 주요 지수가 급락했습니다."},
      {title: "⚠️ 금융위기 우려", content: "글로벌 금융위기 우려로 시장이 크게 흔들리고 있습니다."},
      {title: "💥 서킷브레이커 발동", content: "급락으로 서킷브레이커가 발동되어 거래가 중단되었습니다."},
    ],
  },
  GOVERNMENT: {
    strongPositive: [
      {title: "📊 신용등급 상향", content: "국가 신용등급이 상향 조정되어 국채 가치가 상승했습니다."},
      {title: "💰 안전자산 선호", content: "글로벌 불확실성으로 안전자산인 국채 수요가 급증했습니다."},
      {title: "📈 금리 인하 기대", content: "중앙은행 금리 인하 기대로 채권 가격이 크게 올랐습니다."},
    ],
    weakPositive: [
      {title: "💵 국채 수요 증가", content: "기관투자자들의 국채 매수가 늘어나고 있습니다."},
      {title: "🏦 통화정책 완화", content: "통화정책 완화 기조로 채권 시장이 안정세를 보이고 있습니다."},
      {title: "🌏 외국인 순매수", content: "외국인의 국채 순매수가 이어지고 있습니다."},
    ],
    weakNegative: [
      {title: "📉 채권 가격 하락", content: "인플레이션 우려로 채권 가격이 소폭 하락했습니다."},
      {title: "💸 수익률 상승", content: "시장 금리 상승으로 채권 수익률이 올라가고 있습니다."},
      {title: "🏃 자금 이탈", content: "위험자산 선호로 채권 시장에서 자금이 빠지고 있습니다."},
    ],
    strongNegative: [
      {title: "🔴 국가 신용등급 강등", content: "신용평가사가 국가 신용등급을 강등시켜 국채 가치가 폭락했습니다."},
      {title: "⚠️ 디폴트 위기", content: "국가 부채 위기로 채무 불이행 우려가 커지고 있습니다."},
      {title: "💥 금리 급등", content: "예상치 못한 금리 인상으로 채권 가격이 급락했습니다."},
    ],
  },
  CORPORATE: {
    strongPositive: [
      {title: "💎 우량 회사채 발행", content: "AAA급 회사채가 성공적으로 발행되어 시장 신뢰를 얻었습니다."},
      {title: "📊 신용등급 상향", content: "주요 기업들의 신용등급이 일제히 상향되었습니다."},
      {title: "💰 회사채 완판", content: "신규 발행 회사채가 조기에 완판되었습니다."},
    ],
    weakPositive: [
      {title: "📈 스프레드 축소", content: "회사채 스프레드가 축소되며 투자 매력이 높아졌습니다."},
      {title: "🏢 기업 실적 개선", content: "기업 실적 호조로 회사채 신용도가 개선되고 있습니다."},
      {title: "💵 수요 증가", content: "안정적인 수익을 추구하는 투자자들의 회사채 수요가 늘고 있습니다."},
    ],
    weakNegative: [
      {title: "📉 스프레드 확대", content: "신용 위험 우려로 회사채 스프레드가 확대되고 있습니다."},
      {title: "⚠️ 부도 위험 증가", content: "일부 기업의 재무 상태 악화로 부도 위험이 커지고 있습니다."},
      {title: "💸 발행 금리 상승", content: "시장 불안으로 회사채 발행 금리가 상승했습니다."},
    ],
    strongNegative: [
      {title: "🔴 대기업 디폴트", content: "대기업이 회사채 상환 불능을 선언했습니다."},
      {title: "💥 연쇄 부도 위기", content: "기업 연쇄 부도로 회사채 시장이 마비되었습니다."},
      {title: "⚠️ 신용경색", content: "회사채 시장 경색으로 기업 자금조달이 막혔습니다."},
    ],
  },
};

// ===================================================================================
// 🔥 중앙 주식 시장 관련 함수
// ===================================================================================

// ⚠️ [최적화] Cloud Scheduler 비용 절감을 위해 비활성화
// GitHub Actions로 전환하거나 필요시 수동 실행
// SETUP_GUIDE.md 참고하여 GitHub Actions 설정 권장
/*
exports.updateCentralStockMarket = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  logger.info("--- [실행] updateCentralStockMarket 함수가 호출되었습니다. ---");

  if (!isMarketOpen()) {
    logger.info("[정보] 시장이 열려있지 않아 주식 가격 업데이트를 건너뜁니다.");
    return;
  }

  logger.info("🔥 중앙 주식 시장 업데이트를 시작합니다.");

  try {
    const stocksRef = db.collection("CentralStocks");
    const stocksSnapshot = await stocksRef.get();

    if (stocksSnapshot.empty) {
      logger.warn("[경고] CentralStocks 컬렉션에 데이터가 없습니다.");
      return;
    }
    logger.info(`[DB] ${stocksSnapshot.size}개의 주식 정보를 조회했습니다.`);

    const marketCondition = calculateMarketCondition(stocksSnapshot.docs.map((doc) => doc.data()));
    logger.info(`[분석] 현재 시장 상황: ${marketCondition.trend}`);

    const batch = db.batch();
    stocksSnapshot.docs.forEach((stockDoc) => {
      const stock = {id: stockDoc.id, ...stockDoc.data()};
      const stockRef = stockDoc.ref;
      const activeNewsEffect = stock.activeNewsEffect || null;

      if (activeNewsEffect) {
        const newDuration = activeNewsEffect.duration - 1;
        if (newDuration <= 0) {
          batch.update(stockRef, {activeNewsEffect: admin.firestore.FieldValue.delete()});
        } else {
          batch.update(stockRef, {"activeNewsEffect.duration": newDuration});
        }
      }

      // 상장된 주식만 가격 업데이트
      if (stock.isListed && !stock.isManual) {
        const priceChange = calculatePriceChange(stock, marketCondition, activeNewsEffect);
        const newPrice = Math.max(1, Math.round(stock.price * (1 + priceChange)));

        batch.update(stockRef, {
          price: newPrice,
          priceHistory: [...(stock.priceHistory || []).slice(-19), newPrice],
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    await batch.commit();
    logger.info(`✅ 중앙 주식 ${stocksSnapshot.size}개 업데이트 완료.`);
  } catch (error) {
    logger.error("🚨 중앙 주식 시장 업데이트 중 오류 발생:", error);
  }
});
*/

/*
exports.autoManageStocks = onSchedule({
  schedule: "every 10 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  logger.info("--- [실행] autoManageStocks 함수가 호출되었습니다. ---");

  try {
    const stocksRef = db.collection("CentralStocks");
    const stocksSnapshot = await stocksRef.where("isListed", "==", true).get();

    if (stocksSnapshot.empty) {
      logger.info("[정보] 상장된 주식이 없어 자동 관리를 건너뜁니다.");
      return;
    }

    const batch = db.batch();
    stocksSnapshot.docs.forEach((stockDoc) => {
      const stock = {id: stockDoc.id, ...stockDoc.data()};
      const stockRef = stockDoc.ref;

      if (stock.price < stock.minListingPrice) {
        logger.info(`[상장폐지] ${stock.name} (${stock.id}) 주식이 최소 상장가격 ${stock.minListingPrice} 미만(${stock.price})이 되어 상장폐지됩니다.`);
        batch.update(stockRef, {
          isListed: false,
          delistedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    await batch.commit();
    logger.info(`✅ 자동 주식 관리 완료.`);
  } catch (error) {
    logger.error("🚨 자동 주식 관리 중 오류 발생:", error);
  }
});
*/

// 🔥 주석 해제 - aggregateActivityStats 등의 함수들이 사용 가능하도록
exports.aggregateActivityStats = onSchedule({
  schedule: "every 10 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  logger.info("--- [실행] aggregateActivityStats 함수가 호출되었습니다. ---");

  try {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000); // 15분 전으로 여유있게 설정

    const activityLogsSnapshot = await db.collection("activity_logs")
        .where("timestamp", ">=", tenMinutesAgo)
        .get();

    if (activityLogsSnapshot.empty) {
      logger.info("[정보] 집계할 새로운 활동 로그가 없습니다.");
      return;
    }

    const stats = {
      coupon_used_total: admin.firestore.FieldValue.increment(0),
    };

    activityLogsSnapshot.docs.forEach((doc) => {
      const log = doc.data();
      if (log.type === LOG_TYPES.COUPON_USE) {
        stats.coupon_used_total = admin.firestore.FieldValue.increment(log.metadata.amount || 0);
      }
    });

    const statsRef = db.collection("system_stats").doc("activity_summary");
    await statsRef.set(stats, {merge: true});

    logger.info(`✅ 활동 로그 통계 집계 완료: ${activityLogsSnapshot.size}개 로그 처리`);
  } catch (error) {
    logger.error("🚨 활동 로그 통계 집계 중 오류 발생:", error);
  }
});

const calculatePriceChange = (stock, marketCondition, newsEffect) => {
  let priceChange = 0;
  const productType = stock.productType || PRODUCT_TYPES.STOCK;
  let newsImpact = 0;
  if (newsEffect) {
    switch (newsEffect.type) {
      case "strongPositive": newsImpact = 0.03 + Math.random() * 0.03; break;
      case "weakPositive": newsImpact = 0.005 + Math.random() * 0.015; break;
      case "weakNegative": newsImpact = -0.005 - Math.random() * 0.015; break;
      case "strongNegative": newsImpact = -0.03 - Math.random() * 0.03; break;
    }
  }

  if (productType === PRODUCT_TYPES.ETF) {
    let baseVolatility = 0.003;
    if (marketCondition.trend === "strongBull" || marketCondition.trend === "strongBear") baseVolatility *= 1.3;
    if (marketCondition.trend === "weakBull" || marketCondition.trend === "weakBear") baseVolatility *= 1.1;
    priceChange = (Math.random() - 0.5) * 2.0 * baseVolatility;
    if (marketCondition.trend === "strongBull") priceChange += 0.003;
    if (marketCondition.trend === "weakBull") priceChange += 0.001;
    if (marketCondition.trend === "weakBear") priceChange -= 0.001;
    if (marketCondition.trend === "strongBear") priceChange -= 0.003;
    priceChange += newsImpact * 0.5;
    return Math.max(-0.02, Math.min(0.02, priceChange));
  }

  if (productType === PRODUCT_TYPES.BOND) {
    let baseVolatility = 0.002;
    if (marketCondition.trend === "strongBull" || marketCondition.trend === "weakBull") baseVolatility *= 0.8;
    if (marketCondition.trend === "strongBear" || marketCondition.trend === "weakBear") baseVolatility *= 1.2;
    priceChange = (Math.random() - 0.5) * 1.5 * baseVolatility;
    if (marketCondition.trend === "strongBull" || marketCondition.trend === "weakBull") priceChange -= 0.0005;
    if (marketCondition.trend === "strongBear" || marketCondition.trend === "weakBear") priceChange += 0.001;
    priceChange += newsImpact;
    return Math.max(-0.015, Math.min(0.015, priceChange));
  }

  let baseVolatility = 0.012;
  if (marketCondition.trend === "strongBull") baseVolatility *= 1.2;
  if (marketCondition.trend === "weakBull") baseVolatility *= 1.05;
  if (marketCondition.trend === "weakBear") baseVolatility *= 1.1;
  if (marketCondition.trend === "strongBear") baseVolatility *= 1.25;
  priceChange = (Math.random() - 0.5) * 2.0 * baseVolatility;
  if (marketCondition.trend === "strongBull") priceChange += 0.003;
  if (marketCondition.trend === "weakBull") priceChange += 0.001;
  if (marketCondition.trend === "weakBear") priceChange -= 0.001;
  if (marketCondition.trend === "strongBear") priceChange -= 0.003;
  priceChange += newsImpact;
  return Math.max(-0.08, Math.min(0.08, priceChange));
};

// 글로벌 시장 상황 저장 (10분마다 변경)
let globalMarketCondition = {trend: "neutral", volatility: "normal", lastUpdated: 0};

const calculateMarketCondition = (stocks) => {
  // 10분(600000ms)마다 랜덤하게 시장 상황 변경
  const now = Date.now();
  if (now - globalMarketCondition.lastUpdated > 600000) {
    const trends = ["strongBull", "weakBull", "weakBear", "strongBear"];
    const weights = [0.25, 0.25, 0.25, 0.25]; // 각각 25%씩 동일

    const random = Math.random();
    let cumulative = 0;
    let selectedTrend = "weakBull";

    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (random < cumulative) {
        selectedTrend = trends[i];
        break;
      }
    }

    globalMarketCondition = {
      trend: selectedTrend,
      volatility: "normal",
      lastUpdated: now,
    };

    logger.info(`🎲 시장 상황 변경: ${selectedTrend} (다음 변경: 10분 후)`);
  }

  return globalMarketCondition;
};

// ===================================================================================
// 📰 중앙 뉴스 관리 시스템
// ===================================================================================

exports.createCentralMarketNews = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  logger.info("--- [실행] createCentralMarketNews 함수가 호출되었습니다. ---");
  if (!isMarketOpen()) {
    logger.info("[정보] 시장이 열려있지 않아 중앙 뉴스 생성을 건너뜁니다.");
    return;
  }
  logger.info("📰 중앙 뉴스 시스템 - 시장 뉴스 생성을 시작합니다.");

  try {
    const stocksSnapshot = await db.collection("CentralStocks").where("isListed", "==", true).get();
    if (stocksSnapshot.empty) {
      logger.warn("[경고] 뉴스를 생성할 상장된 주식이 없습니다.");
      return;
    }
    const stocks = stocksSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    const stock = stocks[Math.floor(Math.random() * stocks.length)];
    logger.info(`[선택] 뉴스 대상 주식으로 '${stock.name}'이 랜덤 선택되었습니다.`);

    let sectorNews;
    if (stock.productType === PRODUCT_TYPES.ETF) sectorNews = STOCK_NEWS.INDEX;
    else if (stock.productType === PRODUCT_TYPES.BOND) {
      sectorNews = stock.issuer === "government" ? STOCK_NEWS.GOVERNMENT : STOCK_NEWS.CORPORATE;
    } else {
      sectorNews = STOCK_NEWS[stock.sector];
    }

    if (!sectorNews) {
      logger.warn(`[경고] 주식 '${stock.name}'의 섹터 '${stock.sector}'에 대한 뉴스 템플릿이 없습니다.`);
      return;
    }

    const newsTypes = ["strongPositive", "weakPositive", "weakNegative", "strongNegative"];
    const weights = [0.15, 0.35, 0.35, 0.15];
    const random = Math.random();
    let newsType;
    let cumulative = 0;
    for (let j = 0; j < weights.length; j++) {
      cumulative += weights[j];
      if (random < cumulative) {
        newsType = newsTypes[j];
        break;
      }
    }

    const newsTemplates = sectorNews[newsType];
    if (!newsTemplates || newsTemplates.length === 0) {
      logger.warn(`[경고] ${newsType} 타입의 뉴스 템플릿이 없습니다.`);
      return;
    }
    const template = newsTemplates[Math.floor(Math.random() * newsTemplates.length)];

    const batch = db.batch();
    const centralNewsRef = db.collection("CentralNews").doc();
    batch.set(centralNewsRef, {
      type: "stock",
      newsType: newsType,
      title: template.title,
      content: template.content,
      affectedStockId: stock.id,
      affectedStockName: stock.name,
      affectedStockSector: stock.sector,
      affectedStockProductType: stock.productType,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      expiryTime: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      isActive: true,
    });

    const stockRef = db.collection("CentralStocks").doc(stock.id);
    const newsEffect = {type: newsType, duration: 3, newsId: centralNewsRef.id};
    batch.update(stockRef, {activeNewsEffect: newsEffect});

    await batch.commit();
    logger.info(`✅ 중앙 뉴스 시스템 - '${stock.name}' 관련 ${newsType} 뉴스 생성 및 적용 완료.`);
  } catch (error) {
    logger.error("🚨 중앙 뉴스 생성 중 오류 발생:", error);
  }
});

exports.cleanupExpiredCentralNews = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  logger.info("🧹 만료된 중앙 뉴스 정리를 시작합니다.");
  try {
    const now = admin.firestore.Timestamp.now();
    const expiredNewsSnapshot = await db.collection("CentralNews")
        .where("expiryTime", "<=", now)
        .where("isActive", "==", true)
        .get();

    if (expiredNewsSnapshot.empty) {
      logger.info("[정보] 정리할 만료된 뉴스가 없습니다.");
      return;
    }

    const batch = db.batch();
    expiredNewsSnapshot.docs.forEach((newsDoc) => {
      batch.update(newsDoc.ref, {isActive: false});
    });
    await batch.commit();
    logger.info(`✅ ${expiredNewsSnapshot.size}개의 만료된 중앙 뉴스를 정리했습니다.`);
  } catch (error) {
    logger.error("🚨 중앙 뉴스 정리 중 오류 발생:", error);
  }
});

exports.syncCentralNewsToClasses = onSchedule({
  schedule: "every 10 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  logger.info("🔄 클래스별 뉴스 동기화를 시작합니다.");
  try {
    const classStockSnapshot = await db.collection("ClassStock").get();
    if (classStockSnapshot.empty) return;

    const openClassCodes = [];
    for (const classDoc of classStockSnapshot.docs) {
      const marketStatusDoc = await db.collection("ClassStock").doc(classDoc.id).collection("marketStatus").doc("status").get();
      if (marketStatusDoc.exists && marketStatusDoc.data().isOpen === true) {
        openClassCodes.push(classDoc.id);
      }
    }

    if (openClassCodes.length === 0) return;

    const activeCentralNewsSnapshot = await db.collection("CentralNews")
        .where("isActive", "==", true)
        .orderBy("timestamp", "desc").limit(10).get();
    if (activeCentralNewsSnapshot.empty) return;

    const syncPromises = openClassCodes.map(async (classCode) => {
      const batch = db.batch();
      let syncedCount = 0;
      for (const centralNewsDoc of activeCentralNewsSnapshot.docs) {
        const centralNews = centralNewsDoc.data();
        const existingNewsSnapshot = await db.collection("ClassStock").doc(classCode).collection("marketNews").where("centralNewsId", "==", centralNewsDoc.id).get();
        if (existingNewsSnapshot.empty) {
          const classNewsRef = db.collection("ClassStock").doc(classCode).collection("marketNews").doc();
          batch.set(classNewsRef, {
            ...centralNews,
            centralNewsId: centralNewsDoc.id,
            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          syncedCount++;
        }
      }
      if (syncedCount > 0) {
        await batch.commit();
        logger.info(`[${classCode}] ${syncedCount}개의 중앙 뉴스를 동기화했습니다.`);
      }
    });
    await Promise.all(syncPromises);
    logger.info(`✅ ${openClassCodes.length}개 클래스에 중앙 뉴스 동기화 완료.`);
  } catch (error) {
    logger.error("🚨 클래스별 뉴스 동기화 중 오류 발생:", error);
  }
});

exports.cleanupExpiredClassNews = onSchedule({
  schedule: "every 10 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  logger.info("🧹 클래스별 만료된 뉴스 정리를 시작합니다.");
  try {
    const classStockSnapshot = await db.collection("ClassStock").get();
    if (classStockSnapshot.empty) return;

    const now = admin.firestore.Timestamp.now();
    const cleanupPromises = classStockSnapshot.docs.map(async (classDoc) => {
      const classCode = classDoc.id;
      const expiredNewsSnapshot = await classDoc.ref.collection("marketNews").where("expiryTime", "<=", now).get();
      if (!expiredNewsSnapshot.empty) {
        const batch = db.batch();
        expiredNewsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        logger.info(`[${classCode}] ${expiredNewsSnapshot.size}개의 만료된 뉴스를 삭제했습니다.`);
      }
    });
    await Promise.all(cleanupPromises);
    logger.info("✅ 모든 클래스의 만료된 뉴스 정리 완료.");
  } catch (error) {
    logger.error("🚨 클래스별 뉴스 정리 중 오류 발생:", error);
  }
});

// ===================================================================================
// 📦 아이템 시스템 - 통합 데이터 조회 (최적화)
// ===================================================================================

exports.getItemContextData = onCall({region: "asia-northeast3"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요한 기능입니다.");
  }

  const uid = request.auth.uid;
  let classCode = null;

  try {
    const userDocSnap = await db.collection("users").doc(uid).get();
    if (!userDocSnap.exists) {
      throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
    }
    classCode = userDocSnap.data().classCode;

    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 설정되지 않았습니다.");
    }

    const [
      storeItemsSnap,
      userItemsSnap,
      marketListingsSnap,
      marketOffersSnap,
    ] = await Promise.all([
      db.collection("storeItems")
          .where("classCode", "==", classCode)
          .limit(50)
          .get(),

      db.collection("users")
          .doc(uid)
          .collection("inventory")
          .limit(100)
          .get(),

      db.collection("classes")
          .doc(classCode)
          .collection("marketItems")
          .where("status", "==", "active")
          .limit(50)
          .get(),

      db.collection("classes")
          .doc(classCode)
          .collection("marketProposals")
          .limit(100)
          .get(),
    ]);

    const toArray = (snapshot) =>
      snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
          listedDate: data.listedDate?.toDate?.()?.toISOString() || null,
          timestamp: data.timestamp?.toDate?.()?.toISOString() || null,
        };
      });

    const userItemsGrouped = toArray(userItemsSnap).reduce((acc, item) => {
      const {itemId, quantity} = item;
      if (acc[itemId]) {
        acc[itemId].quantity += quantity;
      } else {
        acc[itemId] = {...item};
      }
      return acc;
    }, {});

    const result = {
      success: true,
      data: {
        storeItems: toArray(storeItemsSnap),
        userItems: Object.values(userItemsGrouped).map((item) => ({...item, source: "inventory"})),
        marketListings: toArray(marketListingsSnap),
        marketOffers: toArray(marketOffersSnap),
      },
    };

    logger.info(`[getItemContextData] Success for user ${uid} in class ${classCode}`);
    return result;
  } catch (error) {
    logger.error("getItemContextData 함수 오류:", error);

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
        "internal",
        `데이터를 불러오는 중 오류가 발생했습니다: ${error.message}`,
    );
  }
});

// ===================================================================================
// 🛍️ 상점 아이템 관리
// ===================================================================================

exports.addStoreItem = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, classCode} = await checkAuthAndGetUserData(request, true);
  const {newItemData} = request.data;

  if (!newItemData || !newItemData.name || !newItemData.price || !newItemData.stock) {
    throw new HttpsError("invalid-argument", "아이템 이름, 가격, 재고는 필수입니다.");
  }

  try {
    const itemToAdd = {
      ...newItemData,
      classCode,
      createdBy: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection("storeItems").add(itemToAdd);
    return {success: true, id: docRef.id, message: "상점 아이템이 추가되었습니다."};
  } catch (error) {
    logger.error("상점 아이템 추가 오류:", error);
    throw new HttpsError("internal", "아이템 추가에 실패했습니다.");
  }
});

exports.updateStoreItem = onCall({region: "asia-northeast3"}, async (request) => {
  await checkAuthAndGetUserData(request, true);
  const {itemId, updatesToApply} = request.data;

  if (!itemId || !updatesToApply) {
    throw new HttpsError("invalid-argument", "아이템 ID와 업데이트 정보가 필요합니다.");
  }

  updatesToApply.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  try {
    await db.collection("storeItems").doc(itemId).update(updatesToApply);
    return {success: true, message: "상점 아이템이 수정되었습니다."};
  } catch (error) {
    logger.error("상점 아이템 수정 오류:", error);
    throw new HttpsError("internal", "아이템 수정에 실패했습니다.");
  }
});

exports.deleteStoreItem = onCall({region: "asia-northeast3"}, async (request) => {
  await checkAuthAndGetUserData(request, true);
  const {itemId} = request.data;

  if (!itemId) {
    throw new HttpsError("invalid-argument", "아이템 ID가 필요합니다.");
  }

  try {
    await db.collection("storeItems").doc(itemId).delete();
    return {success: true, message: "상점 아이템이 삭제되었습니다."};
  } catch (error) {
    logger.error("상점 아이템 삭제 오류:", error);
    throw new HttpsError("internal", "아이템 삭제에 실패했습니다.");
  }
});

exports.purchaseStoreItem = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request);
  const {itemId, quantity} = request.data;

  if (!itemId || !quantity || quantity <= 0) {
    throw new HttpsError("invalid-argument", "유효한 아이템 ID와 수량을 입력해야 합니다.");
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await db.runTransaction(async (transaction) => {
        const storeItemRef = db.collection("storeItems").doc(itemId);
        const userRef = db.collection("users").doc(uid);

        const [storeItemDoc, userDoc] = await transaction.getAll(storeItemRef, userRef);

        if (!storeItemDoc.exists) throw new Error("존재하지 않는 상점 아이템입니다.");
        if (!userDoc.exists) throw new Error("사용자 정보가 없습니다.");

        const itemData = storeItemDoc.data();
        const userData = userDoc.data();
        const classCode = userData.classCode;
        const {getTaxSettings} = require("./taxUtils");
        const taxSettings = await getTaxSettings(db, classCode);
        const taxRate = taxSettings.itemStoreVATRate || 0.1;
        const basePrice = (itemData.price || 0) * quantity;
        const taxAmount = Math.floor(basePrice * taxRate);
        const totalPrice = basePrice + taxAmount;

        if (itemData.stock < quantity) throw new Error("아이템 재고가 부족합니다.");
        if ((userData.cash || 0) < totalPrice) throw new Error(`현금이 부족합니다. (상품 가격: ${basePrice}원 + 부가세: ${taxAmount}원 = 총 ${totalPrice}원 필요)`);

        const userInventoryColRef = db.collection("users").doc(uid).collection("inventory");
        const inventoryQuerySnapshot = await transaction.get(userInventoryColRef.where("itemId", "==", itemId).limit(1));
        const existingInventoryDocRef = inventoryQuerySnapshot.empty ? null : inventoryQuerySnapshot.docs[0].ref;

        logActivity(
            transaction,
            uid,
            LOG_TYPES.ITEM_PURCHASE,
            `${itemData.name} ${quantity}개를 상점에서 구매했습니다.`,
            {
              itemId: storeItemRef.id,
              itemName: itemData.name,
              quantity,
              pricePerItem: itemData.price,
              basePrice,
              taxAmount,
              totalPrice,
              seller: "store",
            },
        );

        const newStock = itemData.stock - quantity;
        const storeItemUpdates = {};

        if (newStock <= 0) {
          storeItemUpdates.stock = itemData.initialStock || 10;
          logger.info(`[purchaseStoreItem] Item ${itemId} sold out. Restocking to ${storeItemUpdates.stock}.`);

          const priceIncreasePercentage = itemData.priceIncreasePercentage || 0;
          if (priceIncreasePercentage > 0) {
            const currentPrice = itemData.price;
            const newPrice = Math.round(currentPrice * (1 + priceIncreasePercentage / 100));
            storeItemUpdates.price = newPrice;
            logger.info(`[purchaseStoreItem] Item ${itemId} price increased from ${currentPrice} to ${newPrice}.`);
          }
        } else {
          storeItemUpdates.stock = admin.firestore.FieldValue.increment(-quantity);
        }
        transaction.update(storeItemRef, storeItemUpdates);

        transaction.update(userRef, {cash: admin.firestore.FieldValue.increment(-totalPrice)});

        if (taxAmount > 0) {
          const treasuryRef = db.collection("treasury").doc(classCode);
          transaction.set(treasuryRef, {
            totalAmount: admin.firestore.FieldValue.increment(taxAmount),
            itemStoreRevenue: admin.firestore.FieldValue.increment(taxAmount),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          }, {merge: true});
        }

        if (existingInventoryDocRef) {
          transaction.update(existingInventoryDocRef, {
            quantity: admin.firestore.FieldValue.increment(quantity),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          const newInventoryItemRef = userInventoryColRef.doc();
          transaction.set(newInventoryItemRef, {
            itemId: itemId, name: itemData.name, icon: itemData.icon, description: itemData.description,
            type: itemData.type || "기타", quantity: quantity,
            purchasedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });
      logger.info(`[purchaseStoreItem] Success on attempt ${attempt}: User ${uid} purchased ${quantity} of ${itemId}.`);
      return {success: true, message: "아이템을 성공적으로 구매했습니다."};
    } catch (error) {
      logger.error(`[purchaseStoreItem] Attempt ${attempt}/${maxRetries} failed for user ${uid}:`, error);
      if (attempt === maxRetries) {
        throw new HttpsError("aborted", error.message || "아이템 구매에 실패했습니다.");
      }
      const delay = Math.pow(2, attempt - 1) * 200 + Math.random() * 100;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw new HttpsError("aborted", "최대 재시도 횟수 후에도 아이템 구매에 실패했습니다.");
});


exports.batchPurchaseItems = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request);
  const {purchases} = request.data;

  if (!Array.isArray(purchases) || purchases.length === 0) {
    throw new HttpsError("invalid-argument", "구매 목록이 필요합니다.");
  }

  const userRef = db.collection("users").doc(uid);

  try {
    const results = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const userData = userDoc.data();
      let totalCost = 0;
      const updates = [];

      for (const {itemId, quantity} of purchases) {
        const storeItemRef = db.collection("storeItems").doc(itemId);
        const storeItemDoc = await transaction.get(storeItemRef);

        if (!storeItemDoc.exists) {
          throw new Error(`아이템 ${itemId}를 찾을 수 없습니다.`);
        }

        const itemData = storeItemDoc.data();
        if (itemData.stock < quantity) {
          throw new Error(`${itemData.name} 재고가 부족합니다.`);
        }

        totalCost += (itemData.price || 0) * quantity;
        updates.push({itemId, itemData, quantity, storeItemRef});
      }

      if ((userData.cash || 0) < totalCost) {
        throw new Error("현금이 부족합니다.");
      }

      transaction.update(userRef, {
        cash: admin.firestore.FieldValue.increment(-totalCost),
      });

      for (const {itemId, itemData, quantity, storeItemRef} of updates) {
        transaction.update(storeItemRef, {
          stock: admin.firestore.FieldValue.increment(-quantity),
        });

        const inventoryQuery = await db.collection("users")
            .doc(uid)
            .collection("inventory")
            .where("itemId", "==", itemId)
            .limit(1)
            .get();

        if (!inventoryQuery.empty) {
          transaction.update(inventoryQuery.docs[0].ref, {
            quantity: admin.firestore.FieldValue.increment(quantity),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          const newInvRef = db.collection("users").doc(uid).collection("inventory").doc();
          transaction.set(newInvRef, {
            itemId,
            name: itemData.name,
            icon: itemData.icon,
            description: itemData.description,
            type: itemData.type || "기타",
            quantity,
            purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      return {purchasedCount: purchases.length, totalCost};
    });

    logger.info(`[batchPurchaseItems] User ${uid} purchased ${results.purchasedCount} items`);
    return {success: true, ...results};
  } catch (error) {
    logger.error(`[batchPurchaseItems] Error:`, error);
    throw new HttpsError("aborted", error.message);
  }
});

exports.useUserItem = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request);
  const {itemId, quantityToUse, sourceCollection} = request.data;

  if (!itemId || !quantityToUse || quantityToUse <= 0 || !sourceCollection) {
    throw new HttpsError("invalid-argument", "필수 정보(아이템 ID, 수량, 소스)가 누락되었습니다.");
  }

  const inventoryItemRef = db.collection("users").doc(uid).collection(sourceCollection).doc(itemId);
  const userRef = db.collection("users").doc(uid);

  try {
    // 트랜잭션 실행 후 로그 정보를 저장할 변수
    let itemData = null;
    let effectDescription = "효과 없음";
    let effect = null;

    await db.runTransaction(async (transaction) => {
      const itemSnap = await transaction.get(inventoryItemRef);
      if (!itemSnap.exists) {
        throw new Error("인벤토리에 해당 아이템이 없습니다.");
      }

      itemData = itemSnap.data();
      const currentQuantity = itemData.quantity || 0;
      if (currentQuantity < quantityToUse) {
        throw new Error(`아이템 수량이 부족합니다. (보유: ${currentQuantity}, 필요: ${quantityToUse})`);
      }

      // 스토어 아이템 정보 가져오기 (선택사항 - 효과 확인용)
      const storeItemId = itemData.itemId;
      if (storeItemId) {
        const storeItemRef = db.collection("storeItems").doc(storeItemId);
        const storeItemSnap = await transaction.get(storeItemRef);
        if (storeItemSnap.exists) {
          const storeItemData = storeItemSnap.data();
          effect = storeItemData.effect;
        } else {
          logger.warn(`[useUserItem] StoreItem not found: ${storeItemId}, proceeding without effect.`);
        }
      }

      // 아이템 효과 적용
      logger.info(`[useUserItem] 아이템 효과 확인:`, {
        hasEffect: !!effect,
        effectType: effect?.type,
        effectAmount: effect?.amount,
        quantityToUse,
      });

      if (effect && quantityToUse > 0) {
        switch (effect.type) {
          case "grantCoupon": {
            const totalCouponsGranted = (effect.amount || 0) * quantityToUse;
            logger.info(`[useUserItem] 쿠폰 지급 시도: ${totalCouponsGranted}개`);
            if (totalCouponsGranted > 0) {
              transaction.update(userRef, {
                coupons: admin.firestore.FieldValue.increment(totalCouponsGranted),
              });
              effectDescription = `쿠폰 ${totalCouponsGranted}개 획득`;
              logger.info(`[useUserItem] 쿠폰 지급 완료: ${totalCouponsGranted}개`);
            }
            break;
          }
          // 다른 효과 타입 추가 가능
          default:
            logger.warn(`[useUserItem] 알 수 없는 아이템 효과 타입: ${effect.type}`);
        }
      } else {
        logger.info(`[useUserItem] 아이템 효과 없음`);
      }

      // 인벤토리에서 아이템 수량 차감 또는 삭제
      const newQuantity = currentQuantity - quantityToUse;
      if (newQuantity <= 0) {
        transaction.delete(inventoryItemRef);
      } else {
        transaction.update(inventoryItemRef, {quantity: newQuantity});
      }
    });

    // 트랜잭션 완료 후 로그 기록 (transaction 없이)
    if (itemData) {
      // 아이템 사용에 대한 메인 로그
      await logActivity(
          null,
          uid,
          LOG_TYPES.ITEM_USE,
          `'${itemData.name}' ${quantityToUse}개를 사용했습니다. (결과: ${effectDescription})`,
          {
            itemId: itemId,
            itemName: itemData.name,
            quantity: quantityToUse,
            sourceCollection,
            effect: effect || null,
            effectDescription,
          },
      );

      // 쿠폰 획득 효과가 있었다면 별도 로그
      if (effect && effect.type === "grantCoupon") {
        const totalCouponsGranted = (effect.amount || 0) * quantityToUse;
        if (totalCouponsGranted > 0) {
          await logActivity(
              null,
              uid,
              LOG_TYPES.COUPON_EARN,
              `'${itemData.name}' 아이템 사용으로 쿠폰 ${totalCouponsGranted}개를 획득했습니다.`,
              {
                reason: "item_use",
                itemName: itemData.name,
                quantityUsed: quantityToUse,
                couponsGranted: totalCouponsGranted,
              },
          );
        }
      }
    }

    logger.info(`[useUserItem] Success: User ${uid} used ${quantityToUse} of ${itemId}.`);
    return {success: true, message: "아이템을 성공적으로 사용했습니다."};
  } catch (error) {
    logger.error(`[useUserItem] Transaction Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "아이템 사용 트랜잭션에 실패했습니다.");
  }
});

exports.processSettlement = onCall({region: "asia-northeast3"}, async (request) => {
  const { uid, userData } = await checkAuthAndGetUserData(request);
  const { reportId, senderId, recipientId, amount, reason } = request.data;

  // 1. Server-side validation
  if (!reportId || !senderId || !recipientId || !amount || amount <= 0) {
    throw new HttpsError("invalid-argument", "필수 정보(사건 ID, 송금자, 수신자, 금액)가 누락되었습니다.");
  }

  // 2. Authorization Check: Caller must be an admin or a Police Chief
  const isSystemAdmin = userData.isAdmin || false;
  const isPoliceChief = userData.job === '경찰청장' || userData.jobName === '경찰청장';

  if (!isSystemAdmin && !isPoliceChief) {
    throw new HttpsError("permission-denied", "이 작업을 수행할 권한이 없습니다. (관리자 또는 경찰청장 필요)");
  }

  const classCode = userData.classCode;
  if (!classCode) {
    throw new HttpsError("failed-precondition", "작업을 수행하는 관리자에게 학급 코드가 설정되어 있어야 합니다.");
  }

  // 3. Define document references
  const senderRef = db.collection("users").doc(senderId);
  const recipientRef = db.collection("users").doc(recipientId);
  const reportRef = db.collection("classes").doc(classCode).collection("policeReports").doc(reportId);

  try {
    // 4. Execute atomic transaction
    await db.runTransaction(async (transaction) => {
      const [senderSnap, recipientSnap, reportSnap] = await transaction.getAll(senderRef, recipientRef, reportRef);

      if (!senderSnap.exists) throw new Error("송금자를 찾을 수 없습니다.");
      if (!recipientSnap.exists) throw new Error("수신자를 찾을 수 없습니다.");
      if (!reportSnap.exists) throw new Error("해당 사건 보고서를 찾을 수 없습니다.");

      const senderData = senderSnap.data();
      
      // allowNegative is true for settlements, so no balance check needed.
      
      // Use serverTimestamp for consistency
      const timestamp = admin.firestore.FieldValue.serverTimestamp();

      // Update sender and receiver cash
      transaction.update(senderRef, { cash: admin.firestore.FieldValue.increment(-amount), updatedAt: timestamp });
      transaction.update(recipientRef, { cash: admin.firestore.FieldValue.increment(amount), updatedAt: timestamp });

      // Update the police report
      transaction.update(reportRef, {
        status: "resolved_settlement",
        resolution: reason || "상호 합의 완료",
        amount: amount,
        resolutionDate: timestamp,
        settlementPaid: true,
        processedById: uid, // The admin/police chief who processed it
        processedByName: userData.name || userData.displayName || "관리자",
        settlementSenderId: senderId,
        settlementRecipientId: recipientId,
      });

      // Add a settlement record
      const settlementRef = db.collection("settlements").doc();
      transaction.set(settlementRef, {
        classCode,
        reportId,
        amount,
        senderId,
        recipientId,
        reason: reason || "상호 합의 완료",
        processedBy: uid,
        createdAt: timestamp,
      });
    });

    // 5. Post-transaction logging (outside the main transaction)
    logger.info(`[processSettlement] Success: Report ${reportId} settled by ${uid}. ${senderId} -> ${recipientId}, Amount: ${amount}`);
    
    return { success: true, message: "합의금 지급 처리가 성공적으로 완료되었습니다." };

  } catch (error) {
    logger.error(`[processSettlement] Error processing settlement for report ${reportId} by user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "합의금 처리 중 서버에서 오류가 발생했습니다.");
  }
});

// ===================================================================================
// 📦 아이템 수량 업데이트 함수 (경매/특수 용도)
// ===================================================================================

/**
 * 사용자의 인벤토리 아이템 수량을 변경합니다 (효과 적용 없이)
 * 경매 등록, 취소 등 특수한 경우에 사용됩니다.
 */
exports.updateUserItemQuantity = onCall({
  region: "asia-northeast3",
  cors: true,
}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request);
  const {itemId, quantityChange, sourceCollection = 'inventory'} = request.data;

  if (!itemId || quantityChange === undefined || quantityChange === 0) {
    throw new HttpsError("invalid-argument", "아이템 ID와 수량 변경값이 필요합니다.");
  }

  const inventoryItemRef = db.collection("users").doc(uid).collection(sourceCollection).doc(itemId);

  try {
    let itemData = null;
    let operationType = quantityChange > 0 ? "추가" : "차감";

    await db.runTransaction(async (transaction) => {
      const itemSnap = await transaction.get(inventoryItemRef);

      if (!itemSnap.exists) {
        throw new Error("인벤토리에 해당 아이템이 없습니다.");
      }

      itemData = itemSnap.data();
      const currentQuantity = itemData.quantity || 0;
      const newQuantity = currentQuantity + quantityChange;

      if (newQuantity < 0) {
        throw new Error(`아이템 수량이 부족합니다. (보유: ${currentQuantity}, 필요: ${Math.abs(quantityChange)})`);
      }

      // 수량이 0 이하가 되면 문서 삭제, 아니면 업데이트
      if (newQuantity <= 0) {
        transaction.delete(inventoryItemRef);
      } else {
        transaction.update(inventoryItemRef, {quantity: newQuantity});
      }
    });

    // 로그 기록
    if (itemData) {
      await logActivity(
          null,
          uid,
          LOG_TYPES.ITEM_MOVE,
          `'${itemData.name}' ${Math.abs(quantityChange)}개를 ${operationType}했습니다.`,
          {
            itemId: itemId,
            itemName: itemData.name,
            quantityChange,
            sourceCollection,
            operationType,
          },
      );
    }

    logger.info(`[updateUserItemQuantity] Success: User ${uid} updated item ${itemId} by ${quantityChange}.`);
    return {success: true, message: "아이템 수량이 업데이트되었습니다."};
  } catch (error) {
    logger.error(`[updateUserItemQuantity] Transaction Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "아이템 수량 업데이트에 실패했습니다.");
  }
});

// ===================================================================================
// 🏪 마켓 시스템
// ===================================================================================

exports.listUserItemForSale = onCall({region: "asia-northeast3"}, async (request) => {
  // eslint-disable-next-line no-unused-vars
  const {uid, userData} = await checkAuthAndGetUserData(request);
  const {inventoryItemId, quantity, price, sourceCollection} = request.data;

  logger.info(`[listUserItemForSale] Request data:`, {uid, inventoryItemId, quantity, price, sourceCollection});

  if (!inventoryItemId || !quantity || quantity <= 0 || price < 0 || !sourceCollection) {
    throw new HttpsError("invalid-argument", "필수 정보가 누락되었습니다.");
  }

  const userInventoryItemRef = db.collection("users").doc(uid).collection(sourceCollection).doc(inventoryItemId);
  logger.info(`[listUserItemForSale] Inventory ref path:`, userInventoryItemRef.path);

  try {
    const listingId = await db.runTransaction(async (transaction) => {
      const invItemSnap = await transaction.get(userInventoryItemRef);
      logger.info(`[listUserItemForSale] Inventory exists:`, invItemSnap.exists);
      if (!invItemSnap.exists) throw new Error("인벤토리에 없는 아이템입니다.");

      const invItemData = invItemSnap.data();
      if ((invItemData.quantity || 0) < quantity) throw new Error(`보유 수량(${invItemData.quantity})이 부족합니다.`);

      const newQuantityInInventory = invItemData.quantity - quantity;
      if (newQuantityInInventory > 0) {
        transaction.update(userInventoryItemRef, {quantity: newQuantityInInventory});
      } else {
        transaction.delete(userInventoryItemRef);
      }

      const sellerName = userData.displayName || userData.name || "익명";
      const marketItemData = {
        sellerId: uid, sellerName, inventoryItemId,
        originalStoreItemId: invItemData.itemId, itemName: invItemData.name,
        itemIcon: invItemData.icon || "📦", itemDescription: invItemData.description || "",
        itemType: invItemData.type || "기타", quantity, price, totalPrice: price * quantity,
        status: "active", classCode: userData.classCode,
        listedDate: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const newMarketItemRef = db.collection("classes").doc(userData.classCode).collection("marketItems").doc();
      transaction.set(newMarketItemRef, marketItemData);

      // 활동 로그 기록
      logActivity(
          transaction,
          uid,
          LOG_TYPES.ITEM_MARKET_LIST,
          `${invItemData.name} ${quantity}개를 ${price}원에 시장에 등록했습니다.`,
          {
            listingId: newMarketItemRef.id,
            itemName: invItemData.name,
            quantity,
            pricePerItem: price,
            totalPrice: price * quantity,
          },
      );

      return newMarketItemRef.id;
    });

    logger.info(`[listUserItemForSale] Success: User ${uid} listed item ${inventoryItemId}. Listing ID: ${listingId}.`);
    return {success: true, listingId, message: "시장에 아이템을 등록했습니다."};
  } catch (error) {
    logger.error(`[listUserItemForSale] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "시장 등록에 실패했습니다.");
  }
});

exports.buyMarketItem = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, userData} = await checkAuthAndGetUserData(request);
  const {listingId} = request.data;

  if (!listingId) throw new HttpsError("invalid-argument", "리스팅 ID가 필요합니다.");

  try {
    const result = await db.runTransaction(async (transaction) => {
      const marketItemRef = db.collection("marketItems").doc(listingId);
      const marketItemSnap = await transaction.get(marketItemRef);
      if (!marketItemSnap.exists) throw new Error("판매 아이템이 존재하지 않습니다.");

      const listingData = marketItemSnap.data();
      if (listingData.status !== "active") throw new Error("이미 판매되었거나 판매 중이 아닌 아이템입니다.");
      if (listingData.sellerId === uid) throw new Error("자신의 아이템은 구매할 수 없습니다.");

      const buyerUserRef = db.collection("users").doc(uid);
      const userSnap = await transaction.get(buyerUserRef);
      if (!userSnap.exists) throw new Error("사용자 정보를 찾을 수 없습니다.");
      const userData = userSnap.data();

      const totalPrice = listingData.totalPrice || (listingData.price * listingData.quantity);
      if ((userData.cash || 0) < totalPrice) throw new Error("현금이 부족합니다.");

      const sellerUserRef = db.collection("users").doc(listingData.sellerId);
      transaction.update(buyerUserRef, {cash: admin.firestore.FieldValue.increment(-totalPrice)});
      transaction.update(sellerUserRef, {cash: admin.firestore.FieldValue.increment(totalPrice)});

      const buyerInventoryColRef = db.collection("users").doc(uid).collection("inventory");
      const q = buyerInventoryColRef.where("itemId", "==", listingData.originalStoreItemId);
      const existingItemQuerySnapshot = await transaction.get(q);
      const existingItemDocRef = existingItemQuerySnapshot.empty ? null : existingItemQuerySnapshot.docs[0].ref;

      if (existingItemDocRef) {
        transaction.update(existingItemDocRef, {quantity: admin.firestore.FieldValue.increment(listingData.quantity)});
      } else {
        const newInvItemRef = buyerInventoryColRef.doc();
        transaction.set(newInvItemRef, {
          itemId: listingData.originalStoreItemId, name: listingData.itemName, icon: listingData.itemIcon,
          description: listingData.itemDescription || "", type: listingData.itemType || "기타",
          quantity: listingData.quantity,
          purchasedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      transaction.update(marketItemRef, {
        status: "sold", soldTo: uid,
        soldAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // ... logging ...
      return {itemName: listingData.itemName, quantity: listingData.quantity};
    });

    logger.info(`[buyMarketItem] Success: User ${uid} bought listing ${listingId}`);
    return {success: true, message: `${result.itemName} ${result.quantity}개를 구매했습니다.`};
  } catch (error) {
    logger.error(`[buyMarketItem] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "구매에 실패했습니다.");
  }
});

exports.cancelMarketSale = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request);
  const {listingId} = request.data;

  if (!listingId) throw new HttpsError("invalid-argument", "리스팅 ID가 필요합니다.");

  try {
    await db.runTransaction(async (transaction) => {
      const marketItemRef = db.collection("marketItems").doc(listingId);
      const marketItemSnap = await transaction.get(marketItemRef);
      if (!marketItemSnap.exists) throw new Error("판매 아이템이 없습니다.");

      const listingData = marketItemSnap.data();
      if (listingData.sellerId !== uid) throw new Error("본인의 판매만 취소할 수 있습니다.");
      if (listingData.status !== "active") throw new Error("판매 중인 아이템만 취소할 수 있습니다.");

      const userInventoryColRef = db.collection("users").doc(uid).collection("inventory");
      const q = userInventoryColRef.where("itemId", "==", listingData.originalStoreItemId);
      const existingItemQuerySnapshot = await transaction.get(q);
      const existingItemDocRef = existingItemQuerySnapshot.empty ? null : existingItemQuerySnapshot.docs[0].ref;

      if (existingItemDocRef) {
        transaction.update(existingItemDocRef, {quantity: admin.firestore.FieldValue.increment(listingData.quantity)});
      } else {
        const newInvItemRef = userInventoryColRef.doc();
        transaction.set(newInvItemRef, {
          itemId: listingData.originalStoreItemId, name: listingData.itemName, icon: listingData.itemIcon,
          description: listingData.itemDescription || "", type: listingData.itemType || "기타",
          quantity: listingData.quantity,
          addedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      transaction.update(marketItemRef, {status: "cancelled", updatedAt: admin.firestore.FieldValue.serverTimestamp()});
    });
    logger.info(`[cancelMarketSale] Success: User ${uid} cancelled listing ${listingId}.`);
    return {success: true, message: "판매를 취소하고 아이템을 인벤토리로 되돌렸습니다."};
  } catch (error) {
    logger.error(`[cancelMarketSale] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "판매 취소에 실패했습니다.");
  }
});

exports.makeOffer = onCall({region: "asia-northeast3"}, async (request) => {
  // eslint-disable-next-line no-unused-vars
  const {uid, classCode, userData} = await checkAuthAndGetUserData(request);
  const {listingId, offerPrice, quantity} = request.data;

  if (!listingId || isNaN(offerPrice) || isNaN(quantity) || quantity <= 0) {
    throw new HttpsError("invalid-argument", "유효한 제안 정보가 아닙니다.");
  }

  const marketItemRef = db.collection("marketItems").doc(listingId);

  try {
    const marketItemSnap = await marketItemRef.get();
    if (!marketItemSnap.exists) throw new HttpsError("not-found", "마켓 아이템이 존재하지 않습니다.");

    const marketItemData = marketItemSnap.data();
    if (marketItemData.classCode !== classCode) throw new HttpsError("permission-denied", "다른 학급의 아이템에 제안할 수 없습니다.");
    if (marketItemData.status !== "active") throw new HttpsError("failed-precondition", "더 이상 판매 중인 아이템이 아닙니다.");
    if (marketItemData.sellerId === uid) throw new HttpsError("failed-precondition", "자신의 아이템에 제안할 수 없습니다.");
    if (marketItemData.quantity < quantity) throw new HttpsError("failed-precondition", "제안 수량이 판매 수량을 초과합니다.");

    const offerData = {
      listingId,
      buyerId: uid,
      buyerName: userData.displayName || userData.name || "익명",
      sellerId: marketItemData.sellerId,
      itemName: marketItemData.itemName,
      itemIcon: marketItemData.itemIcon,
      offeredPricePerItem: offerPrice,
      quantity,
      status: "pending",
      classCode,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    const offerDocRef = await db.collection("marketOffers").add(offerData);
    return {success: true, offerId: offerDocRef.id};
  } catch (error) {
    logger.error("가격 제안 중 오류:", error);
    throw new HttpsError("internal", error.message || "가격 제안에 실패했습니다.");
  }
});

exports.respondToOffer = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, classCode} = await checkAuthAndGetUserData(request);
  const {offerId, response} = request.data;

  if (!offerId || !["accepted", "rejected"].includes(response)) {
    throw new HttpsError("invalid-argument", "유효한 오퍼 ID와 응답이 필요합니다.");
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      const offerRef = db.collection("marketOffers").doc(offerId);
      const offerSnap = await transaction.get(offerRef);
      if (!offerSnap.exists) throw new Error("오퍼가 존재하지 않습니다.");

      const offerData = offerSnap.data();
      if (offerData.classCode !== classCode || offerData.sellerId !== uid) throw new Error("이 오퍼에 응답할 권한이 없습니다.");
      if (offerData.status !== "pending") throw new Error("이미 처리된 오퍼입니다.");

      if (response === "rejected") {
        transaction.update(offerRef, {status: "rejected", updatedAt: admin.firestore.FieldValue.serverTimestamp()});
        return {success: true, message: "오퍼를 거절했습니다."};
      }

      const marketItemRef = db.collection("marketItems").doc(offerData.listingId);
      const marketItemSnap = await transaction.get(marketItemRef);
      if (!marketItemSnap.exists) throw new Error("원본 마켓 아이템을 찾을 수 없습니다.");

      const marketItemData = marketItemSnap.data();
      if (marketItemData.status !== "active") throw new Error("아이템이 더 이상 판매 가능하지 않습니다.");
      if (marketItemData.quantity < offerData.quantity) throw new Error("오퍼를 수락하기에 아이템 재고가 부족합니다.");

      const buyerRef = db.collection("users").doc(offerData.buyerId);
      const buyerSnap = await transaction.get(buyerRef);
      if (!buyerSnap.exists) throw new Error("구매자를 찾을 수 없습니다.");

      const totalPrice = (offerData.offeredPricePerItem || 0) * (offerData.quantity || 1);
      if ((buyerSnap.data().cash || 0) < totalPrice) throw new Error("구매자의 현금이 부족합니다.");

      transaction.update(db.collection("users").doc(offerData.sellerId), {cash: admin.firestore.FieldValue.increment(totalPrice)});
      transaction.update(buyerRef, {cash: admin.firestore.FieldValue.increment(-totalPrice)});

      const buyerInventoryColRef = db.collection("users").doc(offerData.buyerId).collection("inventory");
      const q = buyerInventoryColRef.where("itemId", "==", marketItemData.originalStoreItemId);
      const existingItemQuerySnapshot = await transaction.get(q);
      const existingItemDocRef = existingItemQuerySnapshot.empty ? null : existingItemQuerySnapshot.docs[0].ref;

      if (existingItemDocRef) {
        transaction.update(existingItemDocRef, {quantity: admin.firestore.FieldValue.increment(offerData.quantity)});
      } else {
        const newInvItemRef = buyerInventoryColRef.doc();
        transaction.set(newInvItemRef, {
          itemId: marketItemData.originalStoreItemId, name: marketItemData.itemName, icon: marketItemData.itemIcon,
          description: marketItemData.itemDescription || "", type: marketItemData.itemType || "기타",
          quantity: offerData.quantity,
          purchasedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      const newMarketItemQuantity = marketItemData.quantity - offerData.quantity;
      if (newMarketItemQuantity > 0) {
        transaction.update(marketItemRef, {quantity: newMarketItemQuantity, updatedAt: admin.firestore.FieldValue.serverTimestamp()});
      } else {
        transaction.update(marketItemRef, {status: "sold", soldTo: offerData.buyerId, soldAt: admin.firestore.FieldValue.serverTimestamp()});
      }

      transaction.update(offerRef, {status: "accepted", updatedAt: admin.firestore.FieldValue.serverTimestamp()});
      return {success: true, message: "오퍼를 수락하여 거래가 완료되었습니다."};
    });
    return result;
  } catch (error) {
    logger.error("오퍼 응답 중 오류:", error);
    throw new HttpsError("aborted", error.message || "오퍼 응답 처리에 실패했습니다.");
  }
});

exports.adminCancelSale = onCall({region: "asia-northeast3"}, async (request) => {
  await checkAuthAndGetUserData(request, true);
  const {listingId} = request.data;
  if (!listingId) throw new HttpsError("invalid-argument", "리스팅 ID가 필요합니다.");

  const marketItemRef = db.collection("marketItems").doc(listingId);
  try {
    await db.runTransaction(async (transaction) => {
      const marketItemSnap = await transaction.get(marketItemRef);
      if (!marketItemSnap.exists) throw new Error("마켓 아이템을 찾을 수 없습니다.");

      const listingData = marketItemSnap.data();
      if (listingData.status !== "active") throw new Error("활성 상태인 아이템이 아닙니다.");

      const sellerId = listingData.sellerId;
      if (!sellerId) throw new Error("판매자 정보가 없습니다.");

      const sellerInventoryColRef = db.collection("users").doc(sellerId).collection("inventory");
      const newInvItemRef = sellerInventoryColRef.doc();
      transaction.set(newInvItemRef, {
        itemId: listingData.originalStoreItemId, name: listingData.itemName, icon: listingData.itemIcon,
        description: listingData.itemDescription || "", type: listingData.itemType || "기타",
        quantity: listingData.quantity,
        addedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.update(marketItemRef, {status: "cancelled_by_admin", updatedAt: admin.firestore.FieldValue.serverTimestamp()});
    });
    return {success: true, message: "관리자에 의해 판매가 취소되었습니다."};
  } catch (error) {
    logger.error("관리자 판매 취소 오류:", error);
    throw new HttpsError("internal", error.message || "판매 취소에 실패했습니다.");
  }
});

exports.adminDeleteItem = onCall({region: "asia-northeast3"}, async (request) => {
  await checkAuthAndGetUserData(request, true);
  const {listingId} = request.data;
  if (!listingId) throw new HttpsError("invalid-argument", "리스팅 ID가 필요합니다.");

  try {
    await db.collection("marketItems").doc(listingId).update({
      status: "deleted_by_admin",
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {success: true, message: "관리자에 의해 아이템이 삭제되었습니다."};
  } catch (error) {
    logger.error("관리자 아이템 삭제 오류:", error);
    throw new HttpsError("internal", "아이템 삭제에 실패했습니다.");
  }
});

// ===================================================================================
// 🎟️ 쿠폰 관련 함수
// ===================================================================================

exports.donateCoupon = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, userData, classCode} = await checkAuthAndGetUserData(request);
  const {amount, message} = request.data;

  // 사용자의 classCode가 유효한지 확인하는 방어 코드 추가
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

      // 사용자 쿠폰 차감 및 기여도 증가 (set과 merge:true 사용)
      transaction.set(userRef, {
        coupons: admin.firestore.FieldValue.increment(-amount),
        myContribution: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // 새 기부 객체 생성
      const newDonation = {
        id: db.collection("goals").doc().id, // 유니크 ID 추가
        userId: uid,
        userName: userData.name || "알 수 없는 사용자",
        amount: amount,
        message: message || "",
        timestamp: admin.firestore.Timestamp.now(),
        classCode: classCode,
      };

      if (goalDoc.exists) {
        // 🔥 update 사용 - arrayUnion이 제대로 작동하려면 update 필요!
        transaction.update(goalRef, {
          progress: admin.firestore.FieldValue.increment(amount),
          donations: admin.firestore.FieldValue.arrayUnion(newDonation),
          donationCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // If goal doc doesn't exist, create it.
        transaction.set(goalRef, {
          progress: amount,
          donations: [newDonation],
          donationCount: 1,
          targetAmount: 1000, // Default target
          classCode: classCode,
          title: `${classCode} 학급 목표`,
          description: `${classCode} 학급의 쿠폰 목표입니다.`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: uid,
        });
      }

      // 활동 로그 기록 (트랜잭션 내에서 직접 처리)
      const logRefUse = db.collection("activity_logs").doc();
      transaction.set(logRefUse, {
        userId: uid,
        userName: userData.name || "알 수 없는 사용자",
        classCode: classCode,
        type: LOG_TYPES.COUPON_USE,
        description: `학급 목표에 쿠폰 ${amount}개를 기부했습니다.`,
        metadata: {amount, message, type: "donation"},
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      const logRefDonate = db.collection("activity_logs").doc();
      transaction.set(logRefDonate, {
        userId: uid,
        userName: userData.name || "알 수 없는 사용자",
        classCode: classCode,
        type: LOG_TYPES.COUPON_DONATE,
        description: `쿠폰 ${amount}개를 기부했습니다. 메시지: ${message || "없음"}`,
        metadata: {amount, message},
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return {success: true, message: "쿠폰 기부가 완료되었습니다."};
  } catch (error) {
    logger.error(`[donateCoupon] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "쿠폰 기부에 실패했습니다.");
  }
});

exports.sellCoupon = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, userData, classCode} = await checkAuthAndGetUserData(request);
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

      const couponValue = settingsDoc.exists ? settingsDoc.data().couponValue : 1000; // 기본값 설정
      const cashGained = amount * couponValue;

      // 사용자 쿠폰 차감 및 현금 증가
      transaction.update(userRef, {
        coupons: admin.firestore.FieldValue.increment(-amount),
        cash: admin.firestore.FieldValue.increment(cashGained),
      });

      // 활동 로그 기록
      logActivity(
          transaction,
          uid,
          LOG_TYPES.COUPON_SELL,
          `쿠폰 ${amount}개를 ${cashGained.toLocaleString()}원에 판매했습니다.`,
          {
            amount,
            couponValue,
            cashGained,
          },
      );
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

      // 쿠폰 전송
      transaction.update(senderRef, {coupons: admin.firestore.FieldValue.increment(-amount)});
      transaction.update(recipientRef, {coupons: admin.firestore.FieldValue.increment(amount)});

      const recipientData = recipientDoc.data();

      // 보내는 사람 활동 로그
      logActivity(
          transaction,
          uid,
          LOG_TYPES.COUPON_TRANSFER_SEND,
          `${recipientData.name}님에게 쿠폰 ${amount}개를 선물했습니다.`,
          {recipientId, recipientName: recipientData.name, amount, message},
      );

      // 받는 사람 활동 로그
      logActivity(
          transaction,
          recipientId,
          LOG_TYPES.COUPON_TRANSFER_RECEIVE,
          `${userData.name}님으로부터 쿠폰 ${amount}개를 선물 받았습니다.`,
          {senderId: uid, senderName: userData.name, amount, message},
      );
    });

    return {success: true, message: "쿠폰 선물이 완료되었습니다."};
  } catch (error) {
    logger.error(`[giftCoupon] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "쿠폰 선물에 실패했습니다.");
  }
});

// ===================================================================================
// 📅 일일 할일 리셋 시스템
// ===================================================================================

exports.resetDailyTasks = onSchedule({
  schedule: "0 0 * * *",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  logger.info("🔄 일일 할일 리셋 시작");
  try {
    const classSnapshot = await db.collection("ClassStock").get();
    if (classSnapshot.empty) {
      logger.info("리셋할 클래스가 없습니다.");
      return;
    }
    const resetPromises = classSnapshot.docs.map((doc) => resetTasksForClass(doc.id));
    const results = await Promise.all(resetPromises);
    const totalUpdated = results.reduce((sum, count) => sum + count, 0);
    logger.info(`✅ 일일 할일 리셋 완료: ${classSnapshot.size}개 클래스, 총 ${totalUpdated}개 할일 리셋`);
  } catch (error) {
    logger.error("🚨 일일 할일 리셋 중 오류 발생:", error);
  }
});

exports.manualResetClassTasks = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request, true);
  const {classCode} = request.data;
  if (!classCode) throw new HttpsError("invalid-argument", "유효한 classCode가 필요합니다.");

  logger.info(`[수동 리셋] 관리자(UID: ${uid})가 클래스 '${classCode}'의 할일을 수동 리셋합니다.`);
  try {
    const classDoc = await db.collection("ClassStock").doc(classCode).get();
    if (!classDoc.exists) throw new HttpsError("not-found", `클래스 '${classCode}'를 찾을 수 없습니다.`);

    const updatedCount = await resetTasksForClass(classCode);
    const message = `클래스 '${classCode}'의 ${updatedCount}개 할일이 리셋되었습니다.`;
    logger.info(`[수동 리셋] ${message}`);
    return {success: true, message, updatedCount};
  } catch (error) {
    logger.error(`[수동 리셋] 클래스 '${classCode}' 리셋 중 오류:`, error);
    throw new HttpsError("internal", `할일 리셋 실패: ${error.message}`);
  }
});


// 데이터 복구를 위한 임시 함수
exports.recoverGoalData = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request, true); // 관리자만 실행
  const {classCode} = request.data;

  if (!classCode) {
    throw new HttpsError("invalid-argument", "학급 코드를 반드시 입력해야 합니다.");
  }

  logger.info(`[recoverGoalData] 데이터 복구를 시작합니다. 학급: ${classCode}, 관리자: ${uid}`);

  try {
    const logsQuery = db.collection("activity_logs")
      .where("classCode", "==", classCode)
      .where("type", "==", "COUPON_DONATE");

    const logsSnapshot = await logsQuery.get();

    if (logsSnapshot.empty) {
      logger.warn(`[recoverGoalData] 복구할 기부 로그가 없습니다: ${classCode}`);
      const goalRef = db.collection("goals").doc(`${classCode}_goal`);
      await goalRef.set({
        progress: 0,
        donations: [],
        donationCount: 0,
      }, { merge: true });
      return {success: true, message: `기부 로그가 없어, 학급(${classCode}) 목표를 초기화했습니다.`};
    }

    let totalProgress = 0;
    const recoveredDonations = [];

    logsSnapshot.forEach(doc => {
      const log = doc.data();
      const amount = log.metadata?.amount || 0;
      if (amount > 0) {
        totalProgress += amount;
        recoveredDonations.push({
          id: doc.id,
          userId: log.userId,
          userName: log.userName,
          amount: amount,
          message: log.metadata?.message || "",
          timestamp: log.timestamp,
          classCode: log.classCode,
        });
      }
    });

    recoveredDonations.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

    const goalRef = db.collection("goals").doc(`${classCode}_goal`);
    await goalRef.set({
      progress: totalProgress,
      donations: recoveredDonations,
      donationCount: recoveredDonations.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastRecoveryAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info(`[recoverGoalData] 복구 완료: ${classCode}. 총 진행률: ${totalProgress}, 총 기부 수: ${recoveredDonations.length}`);

    return {
      success: true,
      message: `학급(${classCode}) 데이터 복구에 성공했습니다.`,
      recoveredProgress: totalProgress,
      recoveredDonationCount: recoveredDonations.length,
    };

  } catch (error) {
    logger.error(`[recoverGoalData] 복구 중 오류 발생: ${classCode}:`, error);
    throw new HttpsError("internal", `데이터 복구 실패: ${error.message}`);
  }
});

async function resetTasksForClass(classCode) {
  const batch = db.batch();
  let userCount = 0;
  try {
    // 학급의 모든 사용자 조회
    const usersQuery = db.collection("users").where("classCode", "==", classCode);
    const usersSnapshot = await usersQuery.get();

    if (usersSnapshot.empty) {
      logger.info(`[${classCode}] 초기화할 사용자가 없습니다.`);
      return 0;
    }

    // 각 사용자의 completedTasks 필드를 빈 객체로 업데이트
    usersSnapshot.forEach((userDoc) => {
      const userRef = userDoc.ref;
      batch.update(userRef, { completedTasks: {} });
      userCount++;
    });

    await batch.commit();
    logger.info(`[${classCode}] 학생 ${userCount}명의 할일 기록을 초기화했습니다.`);
    return userCount;
  } catch (error) {
    logger.error(`[${classCode}] 할일 리셋 중 오류:`, error);
    throw error; // 상위 함수에서 오류를 처리하도록 전파
  }
}

// ===================================================================================
// 🧑‍🎓 학생 자산 관련 정기 함수
// ===================================================================================

exports.getAdminSettingsData = onCall({region: "asia-northeast3"}, async (request) => {
  const {classCode, isSuperAdmin} = await checkAuthAndGetUserData(request, true); // 관리자 권한 확인

  try {
    const settingsRef = db.collection("settings");
    const mainSettingsDoc = await settingsRef.doc("mainSettings").get();
    const classCodesDoc = await settingsRef.doc("classCodes").get();

    const mainSettings = mainSettingsDoc.exists ? mainSettingsDoc.data() : {};
    const classCodes = classCodesDoc.exists ? classCodesDoc.data().validCodes || [] : [];

    return { 
      success: true, 
      data: { 
        mainSettings: {
          couponValue: mainSettings.couponValue || 1000,
        },
        classCodes: isSuperAdmin ? classCodes : [], // 최고 관리자만 학급 코드 접근
      }
    };
  } catch (error) {
    logger.error("getAdminSettingsData 함수 오류:", error);
    throw new HttpsError("internal", "관리자 설정 데이터를 불러오는 중 오류가 발생했습니다.");
  }
});

exports.distributeDividends = onCall({region: "asia-northeast3"}, async (request) => {
  await checkAuthAndGetUserData(request, true);
  const {stockId, dividendPerShare, classCode, stockName} = request.data;
  if (!stockId || !dividendPerShare || dividendPerShare <= 0 || !classCode) {
    throw new HttpsError("invalid-argument", "유효한 classCode, stockId, dividendPerShare를 제공해야 합니다.");
  }

  // TODO: 배당금 분배 로직 구현 필요
  throw new HttpsError("unimplemented", "배당금 분배 기능은 아직 구현되지 않았습니다.");
});

exports.adminResetUserPassword = onCall({region: "asia-northeast3"}, async (request) => {
  const { uid: adminUid, isSuperAdmin } = await checkAuthAndGetUserData(request, true);
  const { userId, newPassword } = request.data;

  if (!isSuperAdmin) {
    throw new HttpsError("permission-denied", "최고 관리자만 비밀번호를 초기화할 수 있습니다.");
  }

  if (!userId || !newPassword) {
    throw new HttpsError("invalid-argument", "사용자 ID와 새 비밀번호가 필요합니다.");
  }

  if (newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "비밀번호는 6자 이상이어야 합니다.");
  }

  try {
    await admin.auth().updateUser(userId, {
      password: newPassword,
    });

    logger.info(`[adminResetUserPassword] Admin ${adminUid} reset password for user ${userId}`);

    // 활동 로그 기록
    await logActivity(
      null,
      adminUid,
      LOG_TYPES.ADMIN_ACTION,
      `관리자(${adminUid})가 사용자(${userId})의 비밀번호를 초기화했습니다.`,
      { targetUserId: userId }
    );

    return { success: true, message: "사용자 비밀번호가 성공적으로 초기화되었습니다." };
  } catch (error) {
    logger.error(`[adminResetUserPassword] Error resetting password for user ${userId}:`, error);
    throw new HttpsError("internal", "비밀번호 초기화에 실패했습니다.", error.message);
  }
});

const { getTaxSettings, applyStockTax } = require("./taxUtils");

exports.buyStock = onCall({region: "asia-northeast3"}, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const { stockId, quantity } = request.data;

  if (!stockId || !quantity || quantity <= 0) {
    throw new HttpsError("invalid-argument", "유효한 상품 ID와 수량을 입력해야 합니다.");
  }

  const stockRef = db.collection("CentralStocks").doc(stockId);
  const userRef = db.collection("users").doc(uid);
  const holdingRef = db.collection("users").doc(uid).collection("portfolio").doc(stockId);

  try {
    const taxSettings = await getTaxSettings(db, classCode);
    const taxRate = taxSettings.stockTransactionTaxRate || 0.01;

    await db.runTransaction(async (transaction) => {
      // 🔥 모든 READ를 먼저 수행
      const stockDoc = await transaction.get(stockRef);
      const userDoc = await transaction.get(userRef);
      const holdingDoc = await transaction.get(holdingRef);

      // 유효성 검사
      if (!stockDoc.exists) throw new Error("존재하지 않는 상품입니다.");
      if (!userDoc.exists) throw new Error("사용자 정보를 찾을 수 없습니다.");

      const stock = stockDoc.data();
      const user = userDoc.data();

      if (!stock.isListed) throw new Error("현재 거래할 수 없는 상품입니다.");

      const cost = stock.price * quantity;
      const commission = Math.round(cost * 0.003); // 수수료 0.3%
      const taxAmount = Math.floor(cost * taxRate);
      const totalCost = cost + commission + taxAmount;

      if (user.cash < totalCost) {
        throw new Error(`현금이 부족합니다. (매수비용: ${cost.toLocaleString()}원 + 수수료: ${commission.toLocaleString()}원 + 거래세: ${taxAmount.toLocaleString()}원 = 총 ${totalCost.toLocaleString()}원 필요)`);
      }

      // 🔥 모든 WRITE를 수행
      // 사용자 현금 차감
      transaction.update(userRef, { cash: admin.firestore.FieldValue.increment(-totalCost) });

      // 주식 거래량 업데이트
      transaction.update(stockRef, {
        tradingVolume: admin.firestore.FieldValue.increment(quantity),
        buyVolume: admin.firestore.FieldValue.increment(quantity),
        recentBuyVolume: admin.firestore.FieldValue.increment(quantity * 0.3)
      });

      // 사용자 포트폴리오 업데이트
      if (holdingDoc.exists) {
        const holdingData = holdingDoc.data();
        const newQuantity = holdingData.quantity + quantity;
        const newAveragePrice = Math.round(((holdingData.averagePrice * holdingData.quantity) + cost) / newQuantity);
        transaction.update(holdingRef, {
          quantity: newQuantity,
          averagePrice: newAveragePrice,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastBuyTime: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        transaction.set(holdingRef, {
          stockId,
          stockName: stock.name,
          quantity,
          averagePrice: stock.price,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastBuyTime: admin.firestore.FieldValue.serverTimestamp(),
          delistedAt: null,
          classCode: classCode,
          productType: stock.productType || "stock"
        });
        transaction.update(stockRef, { holderCount: admin.firestore.FieldValue.increment(1) });
      }

      // 세금 적용
      if (taxAmount > 0) {
        await applyStockTax(db, classCode, uid, cost, "매수", transaction);
      }
    });

    return { success: true, message: "매수 완료!" };
  } catch (error) {
    logger.error(`[buyStock] User: ${uid}, Stock: ${stockId}, Qty: ${quantity}, Error:`, error);
    throw new HttpsError("aborted", error.message || "매수 처리 중 오류가 발생했습니다.");
  }
});

exports.purchaseRealEstate = onCall({region: "asia-northeast3"}, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const { propertyId } = request.data;

  if (!propertyId) {
    throw new HttpsError("invalid-argument", "부동산 ID가 필요합니다.");
  }

  const propertyRef = db.collection("classes").doc(classCode).collection("realEstateProperties").doc(propertyId);
  const userRef = db.collection("users").doc(uid);

  try {
    let sellerRef = null;
    let sellerUid = null;

    await db.runTransaction(async (transaction) => {
      // 🔥 모든 READ를 먼저 수행
      const propertyDoc = await transaction.get(propertyRef);
      const userDoc = await transaction.get(userRef);

      // 유효성 검사
      if (!propertyDoc.exists) throw new Error("존재하지 않는 부동산입니다.");
      if (!userDoc.exists) throw new Error("사용자 정보를 찾을 수 없습니다.");

      const property = propertyDoc.data();
      const user = userDoc.data();

      if (!property.forSale) throw new Error("현재 판매 중이 아닌 부동산입니다.");
      if (property.owner === uid) throw new Error("자신의 부동산은 구매할 수 없습니다.");

      const purchasePrice = property.salePrice || 0;
      if (user.cash < purchasePrice) {
        throw new Error(`현금이 부족합니다. (필요: ${purchasePrice.toLocaleString()}원, 보유: ${user.cash.toLocaleString()}원)`);
      }

      // 판매자 정보 저장 (WRITE 전에)
      if (property.owner && property.owner !== "정부") {
        sellerUid = property.owner;
        sellerRef = db.collection("users").doc(sellerUid);
      }

      // 판매자가 있으면 판매자 문서도 READ
      let sellerDoc = null;
      if (sellerRef) {
        sellerDoc = await transaction.get(sellerRef);
        if (!sellerDoc.exists) {
          logger.warn(`[purchaseRealEstate] Seller ${sellerUid} not found`);
          sellerRef = null; // 판매자가 없으면 null로 설정
        }
      }

      // 🔥 모든 WRITE를 수행
      // 구매자 현금 차감
      transaction.update(userRef, { cash: admin.firestore.FieldValue.increment(-purchasePrice) });

      // 판매자에게 대금 지급
      if (sellerRef && sellerDoc && sellerDoc.exists) {
        transaction.update(sellerRef, { cash: admin.firestore.FieldValue.increment(purchasePrice) });
      }

      // 부동산 소유권 이전
      transaction.update(propertyRef, {
        owner: uid,
        ownerName: userData.name || "알 수 없는 소유자",
        forSale: false,
        salePrice: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, message: "부동산 구매가 완료되었습니다!" };
  } catch (error) {
    logger.error(`[purchaseRealEstate] User: ${uid}, Property: ${propertyId}, Error:`, error);
    throw new HttpsError("aborted", error.message || "부동산 구매 중 오류가 발생했습니다.");
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
      // 직업 할일 처리
      const jobRef = db.collection("jobs").doc(jobId);

      await db.runTransaction(async (transaction) => {
        // 🔥 모든 READ 먼저 수행
        const jobDoc = await transaction.get(jobRef);
        const userDoc = await transaction.get(userRef);

        if (!jobDoc.exists) throw new Error("직업을 찾을 수 없습니다.");
        if (!userDoc.exists) throw new Error("사용자 정보를 찾을 수 없습니다.");

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

        // 🔥 모든 WRITE 수행
        const updatedTasks = [...jobTasks];
        updatedTasks[taskIndex].clicks = currentClicks + 1;

        transaction.update(jobRef, {
          tasks: updatedTasks,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (taskReward > 0) {
          transaction.update(userRef, {
            coupons: admin.firestore.FieldValue.increment(taskReward),
          });
        }
      });
    } else {
      // 공통 할일 처리
      const commonTaskRef = db.collection("commonTasks").doc(taskId);

      await db.runTransaction(async (transaction) => {
        // 🔥 모든 READ 먼저 수행
        const commonTaskDoc = await transaction.get(commonTaskRef);
        const userDoc = await transaction.get(userRef);

        if (!commonTaskDoc.exists) throw new Error("공통 할일을 찾을 수 없습니다.");
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

        // 🔥 모든 WRITE 수행
        const updateData = {
          [`completedTasks.${taskId}`]: admin.firestore.FieldValue.increment(1),
        };

        if (taskReward > 0) {
          updateData.coupons = admin.firestore.FieldValue.increment(taskReward);
        }

        transaction.update(userRef, updateData);
      });
    }

    // 활동 로그 기록 (트랜잭션 외부에서)
    if (taskReward > 0) {
      try {
        await db.collection("activity_logs").add({
          userId: uid,
          userName: userData.name || userData.nickname || "사용자",
          type: "쿠폰 획득",
          description: `'${taskName}' 할일 완료로 쿠폰 ${taskReward}개를 획득했습니다.`,
          metadata: {
            taskName: taskName,
            reward: taskReward,
            taskId: taskId,
            isJobTask: isJobTask,
            jobId: jobId || null,
          },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          classCode: classCode,
        });
      } catch (logError) {
        logger.warn(`[completeTask] 활동 로그 기록 실패:`, logError);
        // 로그 실패는 전체 작업을 실패시키지 않음
      }
    }

    return {
      success: true,
      message: `'${taskName}' 완료! ${taskReward > 0 ? `+${taskReward} 쿠폰!` : ""}`,
      taskName: taskName,
      reward: taskReward,
    };
  } catch (error) {
    logger.error(`[completeTask] User: ${uid}, Task: ${taskId}, Error:`, error);
    throw new HttpsError("aborted", error.message || "할일 완료 처리 중 오류가 발생했습니다.");
  }
});