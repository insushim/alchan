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
        logger.info(`[상장폐지] ${stock.name} (${stock.id}) 주식이 최소 상장가격 ${stock.minListingPrice} 미만($_PRICE})이 되어 상장폐지됩니다.`);
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
  schedule: "every 3 minutes",
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
  schedule: "every 5 minutes",
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

  if (!amount || amount <= 0) {
    throw new HttpsError("invalid-argument", "유효한 쿠폰 수량을 입력해야 합니다.");
  }

  const userRef = db.collection("users").doc(uid);
  const goalRef = db.collection("goals").doc(`${classCode}_goal`);

  try {
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error("사용자 정보가 없습니다.");

      const currentCoupons = userDoc.data().coupons || 0;
      if (currentCoupons < amount) throw new Error("보유한 쿠폰이 부족합니다.");

      // 사용자 쿠폰 차감
      transaction.update(userRef, {
        coupons: admin.firestore.FieldValue.increment(-amount),
        myContribution: admin.firestore.FieldValue.increment(amount),
      });

      // 학급 목표에 기여
      transaction.set(goalRef, {
        goalProgress: admin.firestore.FieldValue.increment(amount),
      }, {merge: true});

      // 활동 로그 기록 (쿠폰 사용)
      logActivity(
          transaction,
          uid,
          LOG_TYPES.COUPON_USE,
          `학급 목표에 쿠폰 ${amount}개를 기부했습니다.`,
          {amount, message, type: "donation"},
      );

      // 활동 로그 기록 (쿠폰 기부)
      logActivity(
          transaction,
          uid,
          LOG_TYPES.COUPON_DONATE,
          `쿠폰 ${amount}개를 기부했습니다. 메시지: ${message || "없음"}`,
          {amount, message},
      );
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

async function resetTasksForClass(classCode) {
  const batch = db.batch();
  let updateCount = 0;
  try {
    const jobsSnapshot = await db.collection("jobs").where("classCode", "==", classCode).get();
    jobsSnapshot.forEach((doc) => {
      const jobData = doc.data();
      if (jobData.tasks && Array.isArray(jobData.tasks)) {
        const resetTasks = jobData.tasks.map((task) => ({...task, clicks: 0}));
        batch.update(doc.ref, {tasks: resetTasks, updatedAt: admin.firestore.FieldValue.serverTimestamp()});
        updateCount += jobData.tasks.length;
      }
    });

    const commonTasksSnapshot = await db.collection("commonTasks").where("classCode", "==", classCode).get();
    commonTasksSnapshot.forEach((doc) => {
      batch.update(doc.ref, {clicks: 0, updatedAt: admin.firestore.FieldValue.serverTimestamp()});
      updateCount++;
    });

    await batch.commit();
    logger.info(`[${classCode}] 할일 리셋 완료: ${updateCount}개 할일`);
    return updateCount;
  } catch (error) {
    logger.error(`[${classCode}] 할일 리셋 중 오류:`, error);
    throw error;
  }
}

// ===================================================================================
// 🧑‍🎓 학생 자산 관련 정기 함수
// ===================================================================================

exports.distributeDividends = onCall({region: "asia-northeast3"}, async (request) => {
  await checkAuthAndGetUserData(request, true);
  const {stockId, dividendPerShare, classCode, stockName} = request.data;
  if (!stockId || !dividendPerShare || dividendPerShare <= 0 || !classCode) {
    throw new HttpsError("invalid-argument", "유효한 classCode, stockId, dividendPerShare를 제공해야 합니다.");
  }

  logger.info(`[${classCode}] '${stockName || stockId}' 주식 배당금 지급 시작 (주당 ${dividendPerShare}원)`);
  try {
    const studentStocksSnapshot = await db.collectionGroup("stocks").where("stockId", "==", stockId).get();
    if (studentStocksSnapshot.empty) return {success: true, message: "배당금을 지급할 학생이 없습니다."};

    const batch = db.batch();
    let processedStudents = 0;
    for (const stockDoc of studentStocksSnapshot.docs) {
      const studentRef = stockDoc.ref.parent.parent;
      if (studentRef.parent.parent.id !== classCode) continue;

      const studentDoc = await studentRef.get();
      const studentData = studentDoc.data();
      const quantity = stockDoc.data().quantity;

      if (quantity > 0) {
        const dividendAmount = quantity * dividendPerShare;
        batch.update(studentRef, {money: admin.firestore.FieldValue.increment(dividendAmount)});
        const transactionRef = studentRef.collection("transactions").doc();
        batch.set(transactionRef, {
          type: "dividend", description: `'${stockName || stockId}' 배당금`, amount: dividendAmount,
          balance: (studentData.money || 0) + dividendAmount, date: admin.firestore.FieldValue.serverTimestamp(),
        });
        processedStudents++;
      }
    }
    await batch.commit();
    logger.info(`✅ [${classCode}] ${processedStudents}명의 학생에게 배당금 지급 완료.`);
    return {success: true, message: `${processedStudents}명의 학생에게 배당금 지급이 완료되었습니다.`};
  } catch (error) {
    logger.error(`[${classCode}] 배당금 지급 중 오류:`, error);
    throw new HttpsError("internal", "배당금 지급에 실패했습니다.");
  }
});

exports.payWeeklySalaries = onSchedule({schedule: "30 8 * * 1", timeZone: "Asia/Seoul", region: "asia-northeast3"}, async (event) => {
  logger.info("주급 지급 프로세스를 시작합니다.");
  const classesSnapshot = await db.collection("ClassStock").get();
  if (classesSnapshot.empty) return;

  const promises = classesSnapshot.docs.map(async (classDoc) => {
    const classCode = classDoc.id;
    const studentsSnapshot = await db.collection("ClassStock").doc(classCode).collection("students").where("job.salary", ">", 0).get();
    if (studentsSnapshot.empty) return;

    const batch = db.batch();
    studentsSnapshot.forEach((studentDoc) => {
      const studentData = studentDoc.data();
      const salary = studentData.job.salary;
      batch.update(studentDoc.ref, {money: admin.firestore.FieldValue.increment(salary)});
      const transactionRef = studentDoc.ref.collection("transactions").doc();
      batch.set(transactionRef, {
        type: "income", description: "주급", amount: salary,
        balance: (studentData.money || 0) + salary, date: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    logger.info(`[${classCode}] 학생 ${studentsSnapshot.size}명의 주급 처리를 완료했습니다.`);
  });
  await Promise.all(promises);
  logger.info("✅ 모든 클래스의 주급 지급이 완료되었습니다.");
});

exports.collectWeeklyRent = onSchedule({schedule: "30 8 * * 5", timeZone: "Asia/Seoul", region: "asia-northeast3"}, async (event) => {
  logger.info("부동산 월세 징수 프로세스를 시작합니다.");
  const classesSnapshot = await db.collection("ClassStock").get();
  if (classesSnapshot.empty) return;

  const promises = classesSnapshot.docs.map(async (classDoc) => {
    const classCode = classDoc.id;
    const studentsSnapshot = await db.collection("ClassStock").doc(classCode).collection("students").get();
    if (studentsSnapshot.empty) return;

    const batch = db.batch();
    for (const studentDoc of studentsSnapshot.docs) {
      const realEstatesSnapshot = await studentDoc.ref.collection("realestates").where("rent", ">", 0).get();
      if (!realEstatesSnapshot.empty) {
        let totalRent = 0;
        realEstatesSnapshot.forEach((doc) => totalRent += doc.data().rent);
        if (totalRent > 0) {
          batch.update(studentDoc.ref, {money: admin.firestore.FieldValue.increment(-totalRent)});
          const transactionRef = studentDoc.ref.collection("transactions").doc();
          batch.set(transactionRef, {
            type: "expense", description: "부동산 월세", amount: -totalRent,
            balance: (studentDoc.data().money || 0) - totalRent, date: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }
    await batch.commit();
    logger.info(`[${classCode}] 월세 징수를 완료했습니다.`);
  });
  await Promise.all(promises);
  logger.info("✅ 모든 클래스의 월세 징수가 완료되었습니다.");
});

exports.provideSocialSafetyNet = onSchedule({schedule: "0 8 * * *", timeZone: "Asia/Seoul", region: "asia-northeast3"}, async (event) => {
  logger.info("사회 복지 기금 지급 프로세스를 시작합니다.");
  const WELFARE_AMOUNT = 10000;
  const classesSnapshot = await db.collection("ClassStock").get();
  if (classesSnapshot.empty) return;

  const promises = classesSnapshot.docs.map(async (classDoc) => {
    const classCode = classDoc.id;
    const studentsSnapshot = await db.collection("ClassStock").doc(classCode).collection("students").where("money", "<", 0).get();
    if (studentsSnapshot.empty) return;

    const batch = db.batch();
    studentsSnapshot.forEach((studentDoc) => {
      const studentData = studentDoc.data();
      batch.update(studentDoc.ref, {money: admin.firestore.FieldValue.increment(WELFARE_AMOUNT)});
      const transactionRef = studentDoc.ref.collection("transactions").doc();
      batch.set(transactionRef, {
        type: "income", description: "사회 복지 기금", amount: WELFARE_AMOUNT,
        balance: (studentData.money || 0) + WELFARE_AMOUNT, date: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    logger.info(`[${classCode}] 학생 ${studentsSnapshot.size}명의 복지 기금 지급을 완료했습니다.`);
  });
  await Promise.all(promises);
  logger.info("✅ 모든 클래스의 사회 복지 기금 지급이 완료되었습니다.");
});

exports.executePersonalRehabilitation = onCall({region: "asia-northeast3"}, async (request) => {
  await checkAuthAndGetUserData(request, true);
  const {classCode, studentId} = request.data;
  if (!classCode || !studentId) throw new HttpsError("invalid-argument", "클래스 코드와 학생 ID가 필요합니다.");

  logger.info(`[${classCode}] 학생 ID ${studentId}의 개인회생 절차를 시작합니다.`);
  const studentRef = db.collection("ClassStock").doc(classCode).collection("students").doc(studentId);

  try {
    const batch = db.batch();
    const subcollections = ["stocks", "realestates", "deposits", "parkingAccounts", "items"];
    for (const collection of subcollections) {
      const snapshot = await studentRef.collection(collection).get();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    }

    batch.update(studentRef, {money: 0});
    const transactionRef = studentRef.collection("transactions").doc();
    batch.set(transactionRef, {type: "system", description: "개인회생 (자산 초기화)", amount: 0, balance: 0, date: admin.firestore.FieldValue.serverTimestamp()});
    await batch.commit();

    logger.info(`[${classCode}] 학생 ID ${studentId}의 개인회생 절차를 완료했습니다.`);
    return {success: true, message: "개인회생 처리가 완료되었습니다."};
  } catch (error) {
    logger.error(`[${classCode}] 개인회생 처리 중 오류:`, error);
    throw new HttpsError("internal", "개인회생 처리에 실패했습니다.");
  }
});

// ===================================================================================
// ⚙️ 시장 관리 및 관리자 기능
// ===================================================================================

exports.openMarket = onSchedule({schedule: "0 8 * * 1-5", timeZone: "Asia/Seoul", region: "asia-northeast3"}, async (event) => {
  logger.info("모든 클래스의 주식 시장을 자동으로 개장합니다.");
  const snapshot = await db.collection("ClassStock").get();
  if (snapshot.empty) return;

  const batch = db.batch();
  snapshot.forEach((doc) => {
    const marketStatusRef = doc.ref.collection("marketStatus").doc("status");
    batch.set(marketStatusRef, {isOpen: true}, {merge: true});
  });
  await batch.commit();
  logger.info(`✅ ${snapshot.size}개 클래스의 시장을 성공적으로 개장했습니다.`);
});

exports.closeMarket = onSchedule({schedule: "0 15 * * 1-5", timeZone: "Asia/Seoul", region: "asia-northeast3"}, async (event) => {
  logger.info("모든 클래스의 주식 시장을 자동으로 폐장합니다.");
  const snapshot = await db.collection("ClassStock").get();
  if (snapshot.empty) return;

  const batch = db.batch();
  snapshot.forEach((doc) => {
    const marketStatusRef = doc.ref.collection("marketStatus").doc("status");
    batch.update(marketStatusRef, {isOpen: false});
  });
  await batch.commit();
  logger.info(`✅ ${snapshot.size}개 클래스의 시장을 성공적으로 폐장했습니다.`);
});

exports.toggleMarketManually = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request, true);
  const {classCode, isOpen} = request.data;
  if (!classCode || typeof isOpen !== "boolean") {
    throw new HttpsError("invalid-argument", "유효한 파라미터(classCode, isOpen)를 제공해야 합니다.");
  }
  logger.info(`[${classCode}] 관리자(UID: ${uid})가 시장 상태를 수동으로 변경 -> ${isOpen ? "개장" : "폐장"}`);

  try {
    const marketStatusRef = db.collection("ClassStock").doc(classCode).collection("marketStatus").doc("status");
    await marketStatusRef.set({isOpen: isOpen}, {merge: true});
    const message = `[${classCode}] 시장이 성공적으로 ${isOpen ? "열렸습니다" : "닫혔습니다"}.`;
    return {success: true, message: message};
  } catch (error) {
    logger.error(`[${classCode}] 시장 상태 변경 중 오류:`, error);
    throw new HttpsError("internal", "시장 상태를 변경하는 데 실패했습니다.");
  }
});

exports.createManualNews = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request, true);
  const {stockId, newsType, title, content, duration = 3} = request.data;

  if (!stockId || !newsType || !title || !content) {
    throw new HttpsError("invalid-argument", "stockId, newsType, title, content는 필수 항목입니다.");
  }
  if (!["strongPositive", "weakPositive", "weakNegative", "strongNegative"].includes(newsType)) {
    throw new HttpsError("invalid-argument", "잘못된 newsType입니다.");
  }
  logger.info(`[수동 뉴스] 관리자(UID: ${uid})가 '${stockId}' 주식에 대한 ${newsType} 뉴스를 생성합니다.`);

  try {
    const stockDoc = await db.collection("CentralStocks").doc(stockId).get();
    if (!stockDoc.exists) throw new HttpsError("not-found", `주식 ID '${stockId}'를 찾을 수 없습니다.`);

    const stock = stockDoc.data();
    const batch = db.batch();
    const centralNewsRef = db.collection("CentralNews").doc();
    batch.set(centralNewsRef, {
      type: "stock", newsType, title, content,
      affectedStockId: stockId, affectedStockName: stock.name,
      affectedStockSector: stock.sector, affectedStockProductType: stock.productType,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      expiryTime: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      isActive: true, isManual: true, createdBy: uid,
    });

    const stockRef = db.collection("CentralStocks").doc(stockId);
    batch.update(stockRef, {activeNewsEffect: {type: newsType, duration, newsId: centralNewsRef.id, isManual: true}});
    await batch.commit();

    return {success: true, message: `'${stock.name}' 주식에 대한 뉴스가 생성되었습니다.`, newsId: centralNewsRef.id};
  } catch (error) {
    logger.error("수동 뉴스 생성 중 오류 발생:", error);
    throw new HttpsError("internal", `뉴스 생성 실패: ${error.message}`);
  }
});

// ===================================================================================
// 🚀 성능 최적화 및 데이터 조회 함수
// ===================================================================================

exports.getClassCommonData = onCall({region: "asia-northeast3"}, async (request) => {
  const {classCode} = request.data;
  if (!classCode) throw new HttpsError("invalid-argument", "classCode가 필요합니다.");

  const cacheKey = `class_data_${classCode}`;
  const cachedResult = cacheUtils.get(cacheKey);
  if (cachedResult) {
    return {success: true, data: cachedResult, cached: true};
  }

  try {
    const data = await fetchClassData(classCode);
    cacheUtils.set(cacheKey, data, 300);
    return {success: true, data: data, cached: false};
  } catch (error) {
    logger.error(`클래스 공통 데이터 조회 오류 (${classCode}):`, error);
    throw new HttpsError("internal", `데이터 조회 실패: ${error.message}`);
  }
});

async function fetchClassData(classCode) {
  try {
    const marketStatusPromise = db.doc(`ClassStock/${classCode}/marketStatus/status`).get();
    const stocksPromise = db.collection(`ClassStock/${classCode}/stocks`).where("isListed", "==", true).limit(50).get();
    const newsPromise = db.collection(`ClassStock/${classCode}/marketNews`).orderBy("timestamp", "desc").limit(5).get();

    const [marketStatusDoc, stocksSnapshot, newsSnapshot] = await Promise.all([marketStatusPromise, stocksPromise, newsPromise]);

    return {
      classCode,
      marketStatus: marketStatusDoc.exists ? marketStatusDoc.data() : {isOpen: false},
      stocks: stocksSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()})),
      recentNews: newsSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()})),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };
  } catch (error) {
    logger.error(`fetchClassData 오류 (${classCode}):`, error);
    throw error;
  }
}

exports.getUserAssetsSummary = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request);

  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      const defaultData = {cash: 0, coupons: 0, myContribution: 0, createdAt: admin.firestore.FieldValue.serverTimestamp()};
      await db.collection("users").doc(uid).set(defaultData);
      return {success: true, data: {cash: 0, coupons: 0, totalAssets: 0, myContribution: 0}};
    }

    const userData = userDoc.data();
    const totalAssets = (userData.cash || 0) + ((userData.coupons || 0) * 1000) + (userData.myContribution || 0);

    return {
      success: true,
      data: {
        cash: userData.cash || 0,
        coupons: userData.coupons || 0,
        totalAssets,
        myContribution: userData.myContribution || 0,
      },
    };
  } catch (error) {
    logger.error(`사용자 자산 요약 조회 오류 (${uid}):`, error);
    throw new HttpsError("internal", `자산 요약 조회 실패: ${error.message}`);
  }
});

// ===================================================================================
// 🎯 관리자 설정 데이터 통합 함수 (Firebase 사용량 최적화)
// ===================================================================================

exports.getAdminSettingsData = onCall({region: "asia-northeast3"}, async (request) => {
  const {userData, isAdmin, isSuperAdmin} = await checkAuthAndGetUserData(request, true);
  const {tab} = request.data;

  if (!isAdmin && !isSuperAdmin) {
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  }

  const classCode = userData.classCode;
  const cacheKey = `admin_settings_${classCode}_${tab}_${userData.uid}`;

  // 캐시 확인
  const cached = cacheUtils.get(cacheKey);
  if (cached) {
    logger.info(`관리자 설정 캐시 히트: ${cacheKey}`);
    return {success: true, data: cached, cached: true};
  }

  try {
    let data = {};

    // 탭별로 필요한 데이터만 가져오기
    switch (tab) {
      case "generalSettings":
        data = await fetchGeneralSettings(classCode);
        break;
      case "taskManagement":
        data = await fetchTaskManagementData(classCode);
        break;
      case "jobSettings":
        data = await fetchJobData(classCode);
        break;
      case "studentManagement":
        data = await fetchStudentData(classCode, isSuperAdmin);
        break;
      case "salarySettings":
        data = await fetchSalarySettings(classCode);
        break;
      case "systemManagement":
        if (isSuperAdmin) {
          data = await fetchSystemManagementData();
        }
        break;
      default:
        data = await fetchGeneralSettings(classCode);
    }

    // 5분 캐시
    cacheUtils.set(cacheKey, data, 300);

    return {success: true, data, cached: false};
  } catch (error) {
    logger.error(`관리자 설정 데이터 조회 오류 (${classCode}, ${tab}):`, error);
    throw new HttpsError("internal", `데이터 조회 실패: ${error.message}`);
  }
});

// 일반 설정 데이터 가져오기
async function fetchGeneralSettings(classCode) {
  const [goalDoc, mainSettingsDoc] = await Promise.all([
    db.doc(`goals/${classCode}_goal`).get(),
    db.doc("settings/mainSettings").get(),
  ]);

  return {
    goal: goalDoc.exists ? goalDoc.data() : null,
    mainSettings: mainSettingsDoc.exists ? mainSettingsDoc.data() : {couponValue: 1000},
    timestamp: Date.now(),
  };
}

// 할일 관리 데이터 가져오기 (Dashboard에서 이미 제공하므로 최소화)
async function fetchTaskManagementData(classCode) {
  // Dashboard에서 이미 jobs와 commonTasks를 제공하므로 추가 데이터만
  return {
    timestamp: Date.now(),
    message: "Task data provided by Dashboard context",
  };
}

// 직업 데이터 가져오기 (Dashboard에서 이미 제공하므로 최소화)
async function fetchJobData(classCode) {
  // Dashboard에서 이미 jobs를 제공하므로 추가 데이터만
  return {
    timestamp: Date.now(),
    message: "Job data provided by Dashboard context",
  };
}

// 학생 데이터 가져오기 (배치 최적화)
async function fetchStudentData(classCode, isSuperAdmin) {
  const usersQuery = isSuperAdmin ?
    db.collection("users").where("isAdmin", "==", false).where("isSuperAdmin", "==", false) :
    db.collection("users").where("classCode", "==", classCode).where("isAdmin", "==", false).where("isSuperAdmin", "==", false);

  const [usersSnapshot, salarySettingsDoc] = await Promise.all([
    usersQuery.get(),
    db.doc(classCode ? `settings/salarySettings_${classCode}` : "settings/salarySettings").get(),
  ]);

  const students = usersSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    // 필요한 필드만 선택하여 전송량 최소화
    nickname: doc.data().nickname || doc.data().name || "이름 없음",
    name: doc.data().name || "",
    email: doc.data().email || "",
    classCode: doc.data().classCode || "미지정",
    selectedJobIds: doc.data().selectedJobIds || [],
    cash: doc.data().cash || 0,
    lastSalaryDate: doc.data().lastSalaryDate || null,
    lastGrossSalary: doc.data().lastGrossSalary || 0,
    lastTaxAmount: doc.data().lastTaxAmount || 0,
    lastNetSalary: doc.data().lastNetSalary || 0,
    totalSalaryReceived: doc.data().totalSalaryReceived || 0,
  }));

  return {
    students,
    salarySettings: salarySettingsDoc.exists ? salarySettingsDoc.data() : {
      taxRate: 0.1,
      salaryIncreaseRate: 0.03,
    },
    timestamp: Date.now(),
  };
}

// 급여 설정 데이터 가져오기
async function fetchSalarySettings(classCode) {
  const settingsDoc = await db.doc(classCode ? `settings/salarySettings_${classCode}` : "settings/salarySettings").get();

  return {
    settings: settingsDoc.exists ? settingsDoc.data() : {
      taxRate: 0.1,
      salaryIncreaseRate: 0.03,
      lastPaidDate: null,
    },
    timestamp: Date.now(),
  };
}

// 시스템 관리 데이터 가져오기 (최고 관리자 전용)
async function fetchSystemManagementData() {
  const [classCodesDoc, usersSnapshot] = await Promise.all([
    db.doc("settings/classCodes").get(),
    db.collection("users").get(),
  ]);

  const members = usersSnapshot.docs.map((doc) => ({
    id: doc.id,
    name: doc.data().name || doc.data().nickname || "이름 없음",
    email: doc.data().email,
    classCode: doc.data().classCode || "코드 없음",
    isAdmin: doc.data().isAdmin || false,
    isSuperAdmin: doc.data().isSuperAdmin || false,
  }));

  return {
    classCodes: classCodesDoc.exists ? classCodesDoc.data().validCodes || [] : [],
    members,
    timestamp: Date.now(),
  };
}

// 배치 급여 지급 함수 (최적화된 버전)
exports.batchPaySalaries = onCall({region: "asia-northeast3"}, async (request) => {
  const {userData, isAdmin} = await checkAuthAndGetUserData(request, true);
  const {studentIds, payAll = false} = request.data;

  if (!isAdmin) {
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  }

  const classCode = userData.classCode;

  try {
    // 배치로 학생 데이터와 급여 설정을 한 번에 가져오기
    const [salarySettingsDoc, studentsQuery] = await Promise.all([
      db.doc(classCode ? `settings/salarySettings_${classCode}` : "settings/salarySettings").get(),
      payAll ?
        db.collection("users").where("classCode", "==", classCode).where("isAdmin", "==", false).get() :
        batchRead(studentIds.map((id) => db.doc(`users/${id}`))),
    ]);

    const salarySettings = salarySettingsDoc.exists ? salarySettingsDoc.data() : {
      taxRate: 0.1,
      salaryIncreaseRate: 0.03,
    };

    const students = payAll ?
      studentsQuery.docs.map((doc) => ({id: doc.id, ...doc.data()})) :
      studentsQuery.filter((doc) => doc.exists).map((doc) => ({id: doc.id, ...doc.data()}));

    // 배치 업데이트
    const batch = db.batch();
    let successCount = 0;
    let totalGrossPaid = 0;
    let totalTaxDeducted = 0;
    let totalNetPaid = 0;

    for (const student of students) {
      if (student.selectedJobIds && student.selectedJobIds.length > 0) {
        const baseSalary = 2000000;
        const additionalSalary = 500000;
        const grossSalary = baseSalary + Math.max(0, student.selectedJobIds.length - 1) * additionalSalary;
        const tax = Math.floor(grossSalary * salarySettings.taxRate);
        const netSalary = grossSalary - tax;

        if (grossSalary > 0) {
          const userRef = db.doc(`users/${student.id}`);
          batch.update(userRef, {
            cash: admin.firestore.FieldValue.increment(netSalary),
            lastSalaryDate: admin.firestore.FieldValue.serverTimestamp(),
            lastGrossSalary: grossSalary,
            lastTaxAmount: tax,
            lastNetSalary: netSalary,
            totalSalaryReceived: admin.firestore.FieldValue.increment(netSalary),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          successCount++;
          totalGrossPaid += grossSalary;
          totalTaxDeducted += tax;
          totalNetPaid += netSalary;
        }
      }
    }

    if (successCount > 0) {
      // 급여 지급 기록 저장
      const settingsRef = db.doc(classCode ? `settings/salarySettings_${classCode}` : "settings/salarySettings");
      batch.set(settingsRef, {
        lastPaidDate: admin.firestore.FieldValue.serverTimestamp(),
        lastPaymentSummary: {
          totalStudentsPaid: successCount,
          totalGrossPaid,
          totalTaxDeducted,
          totalNetPaid,
          paymentDate: admin.firestore.FieldValue.serverTimestamp(),
        },
        classCode: classCode || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      await batch.commit();

      // 캐시 무효화
      cache.clear();

      return {
        success: true,
        summary: {
          totalStudentsPaid: successCount,
          totalGrossPaid,
          totalTaxDeducted,
          totalNetPaid,
        },
      };
    } else {
      return {success: false, message: "급여를 지급할 대상이 없습니다."};
    }
  } catch (error) {
    logger.error(`급여 지급 오류 (${classCode}):`, error);
    throw new HttpsError("internal", `급여 지급 실패: ${error.message}`);
  }
});

// ===================================================================================
// 🎮 타자연습 게임 최적화 함수
// ===================================================================================

// 타자연습 게임 데이터
const typingWords = {
  easy: [
    {english: "apple", korean: "사과"}, {english: "ant", korean: "개미"},
    {english: "arm", korean: "팔"}, {english: "art", korean: "예술"},
    {english: "baby", korean: "아기"}, {english: "back", korean: "등"},
    {english: "bag", korean: "가방"}, {english: "ball", korean: "공"},
    {english: "bed", korean: "침대"}, {english: "bee", korean: "벌"},
    {english: "big", korean: "큰"}, {english: "bird", korean: "새"},
    {english: "blue", korean: "파란색"}, {english: "boat", korean: "보트"},
    {english: "body", korean: "몸"}, {english: "book", korean: "책"},
    {english: "box", korean: "상자"}, {english: "boy", korean: "소년"},
    {english: "bread", korean: "빵"}, {english: "bus", korean: "버스"},
    {english: "buy", korean: "사다"}, {english: "cake", korean: "케이크"},
    {english: "call", korean: "전화하다"}, {english: "camp", korean: "캠프"},
    {english: "can", korean: "깡통"}, {english: "cap", korean: "모자"},
    {english: "car", korean: "자동차"}, {english: "cat", korean: "고양이"},
    {english: "city", korean: "도시"}, {english: "class", korean: "수업"},
    {english: "clean", korean: "깨끗한"}, {english: "clock", korean: "시계"},
    {english: "cloud", korean: "구름"}, {english: "cold", korean: "추운"},
    {english: "come", korean: "오다"}, {english: "cook", korean: "요리하다"},
    {english: "cool", korean: "시원한"}, {english: "cow", korean: "소"},
    {english: "cup", korean: "컵"}, {english: "cut", korean: "자르다"},
    {english: "dad", korean: "아빠"}, {english: "day", korean: "낮"},
    {english: "deep", korean: "깊은"}, {english: "desk", korean: "책상"},
    {english: "die", korean: "죽다"}, {english: "do", korean: "하다"},
    {english: "dog", korean: "개"}, {english: "door", korean: "문"},
    {english: "down", korean: "아래로"}, {english: "draw", korean: "그리다"},
    {english: "dream", korean: "꿈"}, {english: "drink", korean: "마시다"},
    {english: "drive", korean: "운전하다"}, {english: "duck", korean: "오리"},
    {english: "ear", korean: "귀"}, {english: "eat", korean: "먹다"},
    {english: "egg", korean: "달걀"}, {english: "end", korean: "끝"},
    {english: "eye", korean: "눈"}, {english: "face", korean: "얼굴"},
    {english: "fall", korean: "가을"}, {english: "fan", korean: "선풍기"},
    {english: "farm", korean: "농장"}, {english: "fast", korean: "빠른"},
    {english: "fat", korean: "뚱뚱한"}, {english: "find", korean: "찾다"},
    {english: "fine", korean: "좋은"}, {english: "fire", korean: "불"},
    {english: "fish", korean: "물고기"}, {english: "five", korean: "다섯"},
    {english: "fly", korean: "날다"}, {english: "food", korean: "음식"},
    {english: "foot", korean: "발"}, {english: "four", korean: "넷"},
    {english: "fox", korean: "여우"}, {english: "free", korean: "자유로운"},
    {english: "frog", korean: "개구리"}, {english: "full", korean: "가득 찬"},
    {english: "game", korean: "게임"}, {english: "get", korean: "얻다"},
    {english: "girl", korean: "소녀"}, {english: "give", korean: "주다"},
    {english: "go", korean: "가다"}, {english: "good", korean: "좋은"},
    {english: "gray", korean: "회색"}, {english: "great", korean: "위대한"},
    {english: "green", korean: "초록색"}, {english: "hair", korean: "머리카락"},
    {english: "hand", korean: "손"}, {english: "happy", korean: "행복한"},
    {english: "hat", korean: "모자"}, {english: "have", korean: "가지다"},
    {english: "he", korean: "그"}, {english: "head", korean: "머리"},
    {english: "hear", korean: "듣다"}, {english: "help", korean: "돕다"},
    {english: "hen", korean: "암탉"}, {english: "here", korean: "여기"},
    {english: "high", korean: "높은"}, {english: "hill", korean: "언덕"},
    {english: "hit", korean: "치다"}, {english: "home", korean: "집"},
    {english: "hot", korean: "더운"}, {english: "hour", korean: "시간"},
    {english: "how", korean: "어떻게"}, {english: "I", korean: "나"},
    {english: "ice", korean: "얼음"}, {english: "in", korean: "안에"},
    {english: "ink", korean: "잉크"}, {english: "it", korean: "그것"},
    {english: "jam", korean: "잼"}, {english: "jet", korean: "제트기"},
    {english: "job", korean: "직업"}, {english: "join", korean: "참여하다"},
    {english: "jump", korean: "뛰다"}, {english: "key", korean: "열쇠"},
    {english: "kick", korean: "차다"}, {english: "king", korean: "왕"},
    {english: "know", korean: "알다"}, {english: "lake", korean: "호수"},
    {english: "land", korean: "땅"}, {english: "late", korean: "늦은"},
    {english: "leg", korean: "다리"}, {english: "let", korean: "시키다"},
    {english: "lie", korean: "눕다"}, {english: "like", korean: "좋아하다"},
    {english: "line", korean: "선"}, {english: "lion", korean: "사자"},
    {english: "lip", korean: "입술"}, {english: "list", korean: "목록"},
    {english: "long", korean: "긴"}, {english: "look", korean: "보다"},
    {english: "love", korean: "사랑"}, {english: "low", korean: "낮은"},
    {english: "make", korean: "만들다"}, {english: "man", korean: "남자"},
    {english: "many", korean: "많은"}, {english: "map", korean: "지도"},
    {english: "may", korean: "아마도"}, {english: "meet", korean: "만나다"},
    {english: "menu", korean: "메뉴"}, {english: "milk", korean: "우유"},
    {english: "mom", korean: "엄마"}, {english: "moon", korean: "달"},
    {english: "move", korean: "움직이다"}, {english: "movie", korean: "영화"},
    {english: "music", korean: "음악"}, {english: "my", korean: "나의"},
    {english: "name", korean: "이름"}, {english: "neck", korean: "목"},
    {english: "need", korean: "필요하다"}, {english: "new", korean: "새로운"},
    {english: "next", korean: "다음의"}, {english: "nice", korean: "좋은"},
    {english: "nine", korean: "아홉"}, {english: "no", korean: "아니요"},
    {english: "nose", korean: "코"}, {english: "not", korean: "아니다"},
    {english: "note", korean: "메모"}, {english: "now", korean: "지금"},
    {english: "of", korean: "~의"}, {english: "off", korean: "떨어져"},
    {english: "oil", korean: "기름"}, {english: "old", korean: "오래된"},
    {english: "on", korean: "위에"}, {english: "one", korean: "하나"},
    {english: "open", korean: "열다"}, {english: "or", korean: "또는"},
    {english: "out", korean: "밖에"}, {english: "pack", korean: "싸다"},
    {english: "page", korean: "페이지"}, {english: "paint", korean: "그리다"},
    {english: "park", korean: "공원"}, {english: "party", korean: "파티"},
    {english: "pen", korean: "펜"}, {english: "pet", korean: "애완동물"},
    {english: "pie", korean: "파이"}, {english: "pig", korean: "돼지"},
    {english: "pin", korean: "핀"}, {english: "pink", korean: "분홍색"},
    {english: "play", korean: "놀다"}, {english: "plus", korean: "더하기"},
    {english: "pool", korean: "수영장"}, {english: "poor", korean: "가난한"},
    {english: "post", korean: "우편"}, {english: "pull", korean: "당기다"},
    {english: "push", korean: "밀다"}, {english: "put", korean: "놓다"},
    {english: "queen", korean: "여왕"}, {english: "quick", korean: "빠른"},
    {english: "rain", korean: "비"}, {english: "read", korean: "읽다"},
    {english: "red", korean: "빨간색"}, {english: "rich", korean: "부유한"},
    {english: "ride", korean: "타다"}, {english: "right", korean: "오른쪽"},
    {english: "ring", korean: "반지"}, {english: "road", korean: "도로"},
    {english: "room", korean: "방"}, {english: "run", korean: "달리다"},
    {english: "sad", korean: "슬픈"}, {english: "safe", korean: "안전한"},
    {english: "salt", korean: "소금"}, {english: "same", korean: "같은"},
    {english: "say", korean: "말하다"}, {english: "school", korean: "학교"},
    {english: "sea", korean: "바다"}, {english: "see", korean: "보다"},
    {english: "send", korean: "보내다"}, {english: "seven", korean: "일곱"},
    {english: "she", korean: "그녀"}, {english: "ship", korean: "배"},
    {english: "shop", korean: "가게"}, {english: "short", korean: "짧은"},
    {english: "sing", korean: "노래하다"}, {english: "sit", korean: "앉다"},
    {english: "six", korean: "여섯"}, {english: "size", korean: "크기"},
    {english: "sky", korean: "하늘"}, {english: "sleep", korean: "자다"},
    {english: "slow", korean: "느린"}, {english: "small", korean: "작은"},
    {english: "snow", korean: "눈"}, {english: "so", korean: "그래서"},
    {english: "sofa", korean: "소파"}, {english: "soft", korean: "부드러운"},
    {english: "some", korean: "약간의"}, {english: "song", korean: "노래"},
    {english: "sorry", korean: "미안한"}, {english: "soup", korean: "수프"},
    {english: "speak", korean: "말하다"}, {english: "star", korean: "별"},
    {english: "start", korean: "시작하다"}, {english: "stay", korean: "머무르다"},
    {english: "stop", korean: "멈추다"}, {english: "story", korean: "이야기"},
    {english: "sun", korean: "태양"}, {english: "swim", korean: "수영하다"},
    {english: "table", korean: "탁자"}, {english: "take", korean: "가져가다"},
    {english: "talk", korean: "이야기하다"}, {english: "tall", korean: "키가 큰"},
    {english: "taxi", korean: "택시"}, {english: "tea", korean: "차"},
    {english: "teach", korean: "가르치다"}, {english: "ten", korean: "열"},
    {english: "test", korean: "시험"}, {english: "that", korean: "저것"},
    {english: "the", korean: "그"}, {english: "then", korean: "그때"},
    {english: "thin", korean: "얇은"}, {english: "this", korean: "이것"},
    {english: "three", korean: "셋"}, {english: "tie", korean: "넥타이"},
    {english: "time", korean: "시간"}, {english: "to", korean: "~로"},
    {english: "today", korean: "오늘"}, {english: "too", korean: "너무"},
    {english: "top", korean: "꼭대기"}, {english: "town", korean: "마을"},
    {english: "toy", korean: "장난감"}, {english: "tree", korean: "나무"},
    {english: "try", korean: "시도하다"}, {english: "two", korean: "둘"},
    {english: "up", korean: "위로"}, {english: "use", korean: "사용하다"},
    {english: "van", korean: "밴"}, {english: "very", korean: "매우"},
    {english: "vest", korean: "조끼"}, {english: "view", korean: "전망"},
    {english: "visit", korean: "방문하다"}, {english: "voice", korean: "목소리"},
    {english: "wait", korean: "기다리다"}, {english: "walk", korean: "걷다"},
    {english: "want", korean: "원하다"}, {english: "warm", korean: "따뜻한"},
    {english: "was", korean: "이었다"}, {english: "wash", korean: "씻다"},
    {english: "watch", korean: "보다"}, {english: "water", korean: "물"},
    {english: "way", korean: "길"}, {english: "we", korean: "우리"},
    {english: "week", korean: "주"}, {english: "well", korean: "잘"},
    {english: "what", korean: "무엇"}, {english: "when", korean: "언제"},
    {english: "where", korean: "어디에"}, {english: "white", korean: "흰색"},
    {english: "who", korean: "누구"}, {english: "why", korean: "왜"},
    {english: "will", korean: "~일 것이다"}, {english: "wind", korean: "바람"},
    {english: "with", korean: "함께"}, {english: "wolf", korean: "늑대"},
    {english: "work", korean: "일하다"}, {english: "year", korean: "년"},
    {english: "yes", korean: "네"}, {english: "you", korean: "너"},
    {english: "zero", korean: "영"}, {english: "zoo", korean: "동물원"},
  ],
  normal: [
    {english: "able", korean: "할 수 있는"}, {english: "about", korean: "대하여"},
    {english: "above", korean: "위에"}, {english: "across", korean: "가로질러"},
    {english: "action", korean: "행동"}, {english: "actor", korean: "배우"},
    {english: "add", korean: "더하다"}, {english: "address", korean: "주소"},
    {english: "afraid", korean: "두려워하는"}, {english: "after", korean: "후에"},
    {english: "again", korean: "다시"}, {english: "age", korean: "나이"},
    {english: "ago", korean: "전에"}, {english: "agree", korean: "동의하다"},
    {english: "air", korean: "공기"}, {english: "album", korean: "앨범"},
    {english: "all", korean: "모든"}, {english: "almost", korean: "거의"},
    {english: "along", korean: "따라서"}, {english: "always", korean: "항상"},
    {english: "animal", korean: "동물"}, {english: "answer", korean: "대답하다"},
    {english: "any", korean: "어떤"}, {english: "appear", korean: "나타나다"},
    {english: "around", korean: "주위에"}, {english: "arrive", korean: "도착하다"},
    {english: "ask", korean: "묻다"}, {english: "aunt", korean: "이모"},
    {english: "away", korean: "멀리"}, {english: "bad", korean: "나쁜"},
    {english: "banana", korean: "바나나"}, {english: "band", korean: "밴드"},
    {english: "bank", korean: "은행"}, {english: "base", korean: "기초"},
    {english: "basket", korean: "바구니"}, {english: "bath", korean: "목욕"},
    {english: "be", korean: "이다"}, {english: "beach", korean: "해변"},
    {english: "bear", korean: "곰"}, {english: "beautiful", korean: "아름다운"},
    {english: "because", korean: "때문에"}, {english: "become", korean: "되다"},
    {english: "before", korean: "전에"}, {english: "begin", korean: "시작하다"},
    {english: "behind", korean: "뒤에"}, {english: "believe", korean: "믿다"},
    {english: "bell", korean: "종"}, {english: "below", korean: "아래에"},
    {english: "bench", korean: "벤치"}, {english: "beside", korean: "옆에"},
    {english: "best", korean: "최고의"}, {english: "better", korean: "더 좋은"},
    {english: "between", korean: "사이에"}, {english: "bicycle", korean: "자전거"},
    {english: "birthday", korean: "생일"}, {english: "black", korean: "검은색"},
    {english: "blow", korean: "불다"}, {english: "board", korean: "판자"},
    {english: "boil", korean: "끓이다"}, {english: "born", korean: "태어난"},
    {english: "borrow", korean: "빌리다"}, {english: "both", korean: "둘 다"},
    {english: "bottle", korean: "병"}, {english: "bottom", korean: "바닥"},
    {english: "bowl", korean: "그릇"}, {english: "brave", korean: "용감한"},
    {english: "break", korean: "깨다"}, {english: "breakfast", korean: "아침식사"},
    {english: "bridge", korean: "다리"}, {english: "bright", korean: "밝은"},
    {english: "bring", korean: "가져오다"}, {english: "brother", korean: "형제"},
    {english: "brown", korean: "갈색"}, {english: "build", korean: "짓다"},
    {english: "burn", korean: "타다"}, {english: "busy", korean: "바쁜"},
    {english: "but", korean: "그러나"}, {english: "butter", korean: "버터"},
    {english: "button", korean: "단추"}, {english: "camera", korean: "카메라"},
    {english: "candle", korean: "양초"}, {english: "careful", korean: "조심하는"},
    {english: "carry", korean: "나르다"}, {english: "case", korean: "경우"},
    {english: "catch", korean: "잡다"}, {english: "center", korean: "중심"},
    {english: "chair", korean: "의자"}, {english: "change", korean: "바꾸다"},
    {english: "cheap", korean: "싼"}, {english: "cheese", korean: "치즈"},
    {english: "chicken", korean: "닭"}, {english: "child", korean: "아이"},
    {english: "choose", korean: "고르다"}, {english: "church", korean: "교회"},
    {english: "circle", korean: "원"}, {english: "climb", korean: "오르다"},
    {english: "close", korean: "닫다"}, {english: "clothes", korean: "옷"},
    {english: "club", korean: "클럽"}, {english: "coat", korean: "코트"},
    {english: "coffee", korean: "커피"}, {english: "coin", korean: "동전"},
    {english: "color", korean: "색깔"}, {english: "computer", korean: "컴퓨터"},
    {english: "corner", korean: "모퉁이"}, {english: "count", korean: "세다"},
    {english: "country", korean: "나라"}, {english: "course", korean: "과정"},
    {english: "cover", korean: "덮다"}, {english: "crayon", korean: "크레용"},
    {english: "cream", korean: "크림"}, {english: "cross", korean: "건너다"},
    {english: "cry", korean: "울다"}, {english: "dance", korean: "춤추다"},
    {english: "dark", korean: "어두운"}, {english: "date", korean: "날짜"},
    {english: "daughter", korean: "딸"}, {english: "decide", korean: "결정하다"},
    {english: "delicious", korean: "맛있는"}, {english: "design", korean: "디자인"},
    {english: "develop", korean: "개발하다"}, {english: "dictionary", korean: "사전"},
    {english: "different", korean: "다른"}, {english: "difficult", korean: "어려운"},
    {english: "dinner", korean: "저녁식사"}, {english: "dirty", korean: "더러운"},
    {english: "discover", korean: "발견하다"}, {english: "dish", korean: "접시"},
    {english: "doctor", korean: "의사"}, {english: "dollar", korean: "달러"},
    {english: "dolphin", korean: "돌고래"}, {english: "dragon", korean: "용"},
    {english: "dress", korean: "드레스"}, {english: "during", korean: "동안"},
    {english: "each", korean: "각각의"}, {english: "early", korean: "일찍"},
    {english: "earth", korean: "지구"}, {english: "east", korean: "동쪽"},
    {english: "easy", korean: "쉬운"}, {english: "eight", korean: "여덟"},
    {english: "either", korean: "어느 한쪽"}, {english: "elephant", korean: "코끼리"},
    {english: "empty", korean: "빈"}, {english: "engine", korean: "엔진"},
    {english: "enjoy", korean: "즐기다"}, {english: "enough", korean: "충분한"},
    {english: "enter", korean: "들어가다"}, {english: "eraser", korean: "지우개"},
    {english: "evening", korean: "저녁"}, {english: "every", korean: "모든"},
    {english: "example", korean: "예시"}, {english: "excite", korean: "흥분시키다"},
    {english: "excuse", korean: "용서하다"}, {english: "exit", korean: "출구"},
    {english: "expect", korean: "기대하다"}, {english: "expensive", korean: "비싼"},
    {english: "explain", korean: "설명하다"}, {english: "family", korean: "가족"},
    {english: "famous", korean: "유명한"}, {english: "far", korean: "먼"},
    {english: "farmer", korean: "농부"}, {english: "father", korean: "아버지"},
    {english: "favorite", korean: "가장 좋아하는"}, {english: "feel", korean: "느끼다"},
    {english: "festival", korean: "축제"}, {english: "few", korean: "소수의"},
    {english: "field", korean: "들판"}, {english: "fifteen", korean: "열 다섯"},
    {english: "fight", korean: "싸우다"}, {english: "fill", korean: "채우다"},
    {english: "film", korean: "영화"}, {english: "finally", korean: "마침내"},
    {english: "finger", korean: "손가락"}, {english: "finish", korean: "끝내다"},
    {english: "first", korean: "첫 번째"}, {english: "flower", korean: "꽃"},
    {english: "follow", korean: "따라가다"}, {english: "forget", korean: "잊다"},
    {english: "fork", korean: "포크"}, {english: "fourteen", korean: "열 넷"},
    {english: "fresh", korean: "신선한"}, {english: "friend", korean: "친구"},
    {english: "front", korean: "앞"}, {english: "fruit", korean: "과일"},
    {english: "future", korean: "미래"}, {english: "garden", korean: "정원"},
    {english: "gas", korean: "가스"}, {english: "gate", korean: "문"},
    {english: "gentle", korean: "온화한"}, {english: "gift", korean: "선물"},
    {english: "giraffe", korean: "기린"}, {english: "glass", korean: "유리"},
    {english: "glove", korean: "장갑"}, {english: "glue", korean: "풀"},
    {english: "goal", korean: "목표"}, {english: "goat", korean: "염소"},
    {english: "gold", korean: "금"}, {english: "golf", korean: "골프"},
    {english: "grape", korean: "포도"}, {english: "grass", korean: "풀"},
    {english: "ground", korean: "땅"}, {english: "group", korean: "그룹"},
    {english: "grow", korean: "자라다"}, {english: "guess", korean: "추측하다"},
    {english: "guest", korean: "손님"}, {english: "guide", korean: "안내하다"},
    {english: "guitar", korean: "기타"}, {english: "half", korean: "절반"},
    {english: "hall", korean: "홀"}, {english: "hamburger", korean: "햄버거"},
    {english: "handsome", korean: "잘생긴"}, {english: "happen", korean: "일어나다"},
    {english: "hard", korean: "어려운"}, {english: "health", korean: "건강"},
    {english: "heavy", korean: "무거운"}, {english: "hello", korean: "안녕하세요"},
    {english: "history", korean: "역사"}, {english: "hobby", korean: "취미"},
    {english: "hold", korean: "잡다"}, {english: "hole", korean: "구멍"},
    {english: "holiday", korean: "휴일"}, {english: "hope", korean: "희망하다"},
    {english: "horse", korean: "말"}, {english: "hospital", korean: "병원"},
    {english: "hotel", korean: "호텔"}, {english: "house", korean: "집"},
    {english: "hundred", korean: "백"}, {english: "hungry", korean: "배고픈"},
    {english: "hurry", korean: "서두르다"}, {english: "husband", korean: "남편"},
    {english: "idea", korean: "생각"}, {english: "imagine", korean: "상상하다"},
    {english: "important", korean: "중요한"}, {english: "inside", korean: "안에"},
    {english: "interest", korean: "관심"}, {english: "introduce", korean: "소개하다"},
    {english: "invent", korean: "발명하다"}, {english: "invite", korean: "초대하다"},
    {english: "island", korean: "섬"}, {english: "jacket", korean: "재킷"},
    {english: "jeans", korean: "청바지"}, {english: "juice", korean: "주스"},
    {english: "just", korean: "단지"}, {english: "keep", korean: "유지하다"},
    {english: "kind", korean: "친절한"}, {english: "kitchen", korean: "부엌"},
    {english: "knife", korean: "칼"}, {english: "knock", korean: "두드리다"},
    {english: "lady", korean: "숙녀"}, {english: "lamp", korean: "램프"},
    {english: "language", korean: "언어"}, {english: "large", korean: "큰"},
    {english: "last", korean: "마지막의"}, {english: "laugh", korean: "웃다"},
    {english: "lead", korean: "이끌다"}, {english: "learn", korean: "배우다"},
    {english: "leave", korean: "떠나다"}, {english: "left", korean: "왼쪽"},
    {english: "lemon", korean: "레몬"}, {english: "lend", korean: "빌려주다"},
    {english: "lesson", korean: "수업"}, {english: "letter", korean: "편지"},
    {english: "library", korean: "도서관"}, {english: "light", korean: "빛"},
    {english: "listen", korean: "듣다"}, {english: "little", korean: "작은"},
    {english: "live", korean: "살다"}, {english: "lose", korean: "잃다"},
    {english: "loud", korean: "시끄러운"}, {english: "lunch", korean: "점심"},
    {english: "machine", korean: "기계"}, {english: "magic", korean: "마술"},
    {english: "mail", korean: "우편"}, {english: "market", korean: "시장"},
  ],
  hard: [
    {english: "ability", korean: "능력"}, {english: "abroad", korean: "해외에"},
    {english: "accept", korean: "받아들이다"}, {english: "accident", korean: "사고"},
    {english: "achieve", korean: "성취하다"}, {english: "activity", korean: "활동"},
    {english: "actually", korean: "실제로"}, {english: "adult", korean: "성인"},
    {english: "advantage", korean: "이점"}, {english: "adventure", korean: "모험"},
    {english: "advertise", korean: "광고하다"}, {english: "advice", korean: "조언"},
    {english: "affect", korean: "영향을 미치다"}, {english: "against", korean: "대항하여"},
    {english: "allow", korean: "허락하다"}, {english: "alone", korean: "혼자"},
    {english: "although", korean: "비록 ~이지만"}, {english: "amazing", korean: "놀라운"},
    {english: "amount", korean: "양"}, {english: "ancient", korean: "고대의"},
    {english: "angry", korean: "화난"}, {english: "announce", korean: "발표하다"},
    {english: "anxious", korean: "걱정하는"}, {english: "apologize", korean: "사과하다"},
    {english: "area", korean: "지역"}, {english: "argue", korean: "논쟁하다"},
    {english: "army", korean: "군대"}, {english: "arrange", korean: "정리하다"},
    {english: "artist", korean: "예술가"}, {english: "ashamed", korean: "부끄러운"},
    {english: "attack", korean: "공격하다"}, {english: "attend", korean: "참석하다"},
    {english: "attention", korean: "주의"}, {english: "attractive", korean: "매력적인"},
    {english: "audience", korean: "청중"}, {english: "average", korean: "평균"},
    {english: "avoid", korean: "피하다"}, {english: "award", korean: "상"},
    {english: "awful", korean: "끔찍한"}, {english: "balance", korean: "균형"},
    {english: "barber", korean: "이발사"}, {english: "baseball", korean: "야구"},
    {english: "basic", korean: "기본적인"}, {english: "battle", korean: "전투"},
    {english: "bean", korean: "콩"}, {english: "become", korean: "되다"},
    {english: "beef", korean: "소고기"}, {english: "behave", korean: "행동하다"},
    {english: "belong", korean: "속하다"}, {english: "belt", korean: "벨트"},
    {english: "blanket", korean: "담요"}, {english: "blind", korean: "눈이 먼"},
    {english: "block", korean: "블록"}, {english: "blood", korean: "피"},
    {english: "blossom", korean: "꽃이 피다"}, {english: "boast", korean: "자랑하다"},
    {english: "boil", korean: "끓이다"}, {english: "bold", korean: "대담한"},
    {english: "bone", korean: "뼈"}, {english: "bored", korean: "지루한"},
    {english: "borrow", korean: "빌리다"}, {english: "boss", korean: "사장"},
    {english: "bother", korean: "괴롭히다"}, {english: "brain", korean: "뇌"},
    {english: "branch", korean: "나뭇가지"}, {english: "brave", korean: "용감한"},
    {english: "breath", korean: "숨"}, {english: "breathe", korean: "숨쉬다"},
    {english: "brick", korean: "벽돌"}, {english: "bride", korean: "신부"},
    {english: "broadcast", korean: "방송하다"}, {english: "bucket", korean: "양동이"},
    {english: "budget", korean: "예산"}, {english: "bug", korean: "벌레"},
    {english: "bull", korean: "황소"}, {english: "bunch", korean: "다발"},
    {english: "bury", korean: "묻다"}, {english: "businessman", korean: "사업가"},
    {english: "cabbage", korean: "양배추"}, {english: "cage", korean: "새장"},
    {english: "calendar", korean: "달력"}, {english: "calm", korean: "고요한"},
    {english: "cancel", korean: "취소하다"}, {english: "cancer", korean: "암"},
    {english: "candidate", korean: "후보자"}, {english: "captain", korean: "주장"},
    {english: "career", korean: "경력"}, {english: "careless", korean: "부주의한"},
    {english: "carpenter", korean: "목수"}, {english: "carrot", korean: "당근"},
    {english: "cartoon", korean: "만화"}, {english: "cash", korean: "현금"},
    {english: "castle", korean: "성"}, {english: "cause", korean: "원인"},
    {english: "celebrate", korean: "축하하다"}, {english: "cell", korean: "세포"},
    {english: "century", korean: "세기"}, {english: "cereal", korean: "시리얼"},
    {english: "ceremony", korean: "의식"}, {english: "certain", korean: "확실한"},
    {english: "challenge", korean: "도전"}, {english: "champion", korean: "챔피언"},
    {english: "chance", korean: "기회"}, {english: "character", korean: "성격"},
    {english: "charge", korean: "요금"}, {english: "charm", korean: "매력"},
    {english: "chase", korean: "쫓다"}, {english: "chat", korean: "잡담하다"},
    {english: "cheat", korean: "속이다"}, {english: "check", korean: "확인하다"},
    {english: "cheek", korean: "뺨"}, {english: "cheer", korean: "환호하다"},
    {english: "chemical", korean: "화학의"}, {english: "chess", korean: "체스"},
    {english: "chief", korean: "주요한"}, {english: "chin", korean: "턱"},
    {english: "choice", korean: "선택"}, {english: "chorus", korean: "합창"},
    {english: "citizen", korean: "시민"}, {english: "claim", korean: "주장하다"},
    {english: "clap", korean: "박수치다"}, {english: "classic", korean: "고전의"},
    {english: "classmate", korean: "급우"}, {english: "classroom", korean: "교실"},
    {english: "clay", korean: "점토"}, {english: "clerk", korean: "점원"},
    {english: "clever", korean: "영리한"}, {english: "client", korean: "고객"},
    {english: "climate", korean: "기후"}, {english: "clinic", korean: "진료소"},
    {english: "cloth", korean: "천"}, {english: "coach", korean: "코치"},
    {english: "coast", korean: "해안"}, {english: "collect", korean: "모으다"},
    {english: "college", korean: "대학"}, {english: "combine", korean: "결합하다"},
    {english: "comedy", korean: "코미디"}, {english: "comfort", korean: "편안함"},
    {english: "comic", korean: "만화의"}, {english: "command", korean: "명령하다"},
    {english: "comment", korean: "논평"}, {english: "common", korean: "흔한"},
    {english: "community", korean: "공동체"}, {english: "company", korean: "회사"},
    {english: "compare", korean: "비교하다"}, {english: "compete", korean: "경쟁하다"},
    {english: "complain", korean: "불평하다"}, {english: "complete", korean: "완성하다"},
    {english: "concentrate", korean: "집중하다"}, {english: "concert", korean: "콘서트"},
    {english: "condition", korean: "상태"}, {english: "connect", korean: "연결하다"},
    {english: "consider", korean: "고려하다"}, {english: "contain", korean: "포함하다"},
    {english: "contest", korean: "대회"}, {english: "continue", korean: "계속하다"},
    {english: "control", korean: "통제하다"}, {english: "convenient", korean: "편리한"},
    {english: "conversation", korean: "대화"}, {english: "cookie", korean: "쿠키"},
    {english: "copy", korean: "복사하다"}, {english: "correct", korean: "옳은"},
    {english: "cost", korean: "비용"}, {english: "cotton", korean: "솜"},
    {english: "cough", korean: "기침"}, {english: "couple", korean: "한 쌍"},
    {english: "courage", korean: "용기"}, {english: "cousin", korean: "사촌"},
    {english: "create", korean: "창조하다"}, {english: "credit", korean: "신용"},
    {english: "crew", korean: "승무원"}, {english: "crime", korean: "범죄"},
    {english: "crisis", korean: "위기"}, {english: "critic", korean: "비평가"},
    {english: "crop", korean: "농작물"}, {english: "culture", korean: "문화"},
    {english: "cure", korean: "치료하다"}, {english: "curious", korean: "호기심이 강한"},
    {english: "current", korean: "현재의"}, {english: "curtain", korean: "커튼"},
    {english: "custom", korean: "관습"}, {english: "customer", korean: "고객"},
    {english: "daily", korean: "매일의"}, {english: "damage", korean: "손상"},
    {english: "danger", korean: "위험"}, {english: "deal", korean: "거래하다"},
    {english: "debate", korean: "토론하다"}, {english: "debt", korean: "빚"},
    {english: "decade", korean: "10년"}, {english: "decide", korean: "결정하다"},
    {english: "decrease", korean: "감소하다"}, {english: "degree", korean: "정도"},
    {english: "delay", korean: "지연시키다"}, {english: "deliver", korean: "배달하다"},
    {english: "demand", korean: "요구하다"}, {english: "dentist", korean: "치과의사"},
    {english: "depart", korean: "출발하다"}, {english: "depend", korean: "의존하다"},
    {english: "depth", korean: "깊이"}, {english: "describe", korean: "묘사하다"},
    {english: "desert", korean: "사막"}, {english: "deserve", korean: "받을 만하다"},
    {english: "desire", korean: "욕망"}, {english: "dessert", korean: "디저트"},
    {english: "destroy", korean: "파괴하다"}, {english: "detail", korean: "세부사항"},
    {english: "detective", korean: "탐정"}, {english: "develop", korean: "발전시키다"},
    {english: "device", korean: "장치"}, {english: "diamond", korean: "다이아몬드"},
    {english: "diary", korean: "일기"}, {english: "differ", korean: "다르다"},
    {english: "difficulty", korean: "어려움"}, {english: "dig", korean: "파다"},
    {english: "direct", korean: "직접적인"}, {english: "direction", korean: "방향"},
    {english: "disappear", korean: "사라지다"}, {english: "disappoint", korean: "실망시키다"},
    {english: "discount", korean: "할인"}, {english: "discuss", korean: "토론하다"},
    {english: "disease", korean: "질병"}, {english: "dislike", korean: "싫어하다"},
    {english: "distance", korean: "거리"}, {english: "divide", korean: "나누다"},
    {english: "divorce", korean: "이혼"}, {english: "double", korean: "두 배의"},
    {english: "doubt", korean: "의심"}, {english: "dozen", korean: "12개"},
    {english: "drama", korean: "드라마"}, {english: "drawing", korean: "그림"},
    {english: "drop", korean: "떨어지다"}, {english: "drug", korean: "약"},
    {english: "dry", korean: "마른"}, {english: "dull", korean: "지루한"},
    {english: "dust", korean: "먼지"}, {english: "duty", korean: "의무"},
    {english: "earn", korean: "벌다"}, {english: "earthquake", korean: "지진"},
    {english: "echo", korean: "메아리"}, {english: "economy", korean: "경제"},
    {english: "edge", korean: "가장자리"}, {english: "educate", korean: "교육하다"},
    {english: "effect", korean: "효과"}, {english: "effort", korean: "노력"},
    {english: "elect", korean: "선출하다"}, {english: "electric", korean: "전기의"},
    {english: "element", korean: "요소"}, {english: "else", korean: "그 밖에"},
    {english: "embarrass", korean: "당황하게 하다"}, {english: "emotion", korean: "감정"},
    {english: "employ", korean: "고용하다"}, {english: "encourage", korean: "격려하다"},
    {english: "enemy", korean: "적"}, {english: "energy", korean: "에너지"},
    {english: "engage", korean: "관여하다"}, {english: "engineer", korean: "엔지니어"},
    {english: "enormous", korean: "거대한"}, {english: "enter", korean: "들어가다"},
    {english: "entertain", korean: "즐겁게 하다"}, {english: "entrance", korean: "입구"},
    {english: "envelope", korean: "봉투"}, {english: "environment", korean: "환경"},
    {english: "envy", korean: "부러워하다"}, {english: "equal", korean: "동일한"},
    {english: "error", korean: "오류"}, {english: "escape", korean: "탈출하다"},
    {english: "especially", korean: "특히"}, {english: "essay", korean: "에세이"},
    {english: "event", korean: "사건"}, {english: "evil", korean: "사악한"},
    {english: "exact", korean: "정확한"}, {english: "exam", korean: "시험"},
    {english: "examine", korean: "조사하다"}, {english: "excellent", korean: "훌륭한"},
    {english: "except", korean: "제외하고"}, {english: "exchange", korean: "교환하다"},
    {english: "excited", korean: "신이 난"}, {english: "exercise", korean: "운동"},
    {english: "exhibit", korean: "전시하다"}, {english: "exist", korean: "존재하다"},
    {english: "exit", korean: "출구"}, {english: "expensive", korean: "비싼"},
    {english: "experience", korean: "경험"}, {english: "expert", korean: "전문가"},
    {english: "express", korean: "표현하다"}, {english: "extra", korean: "여분의"},
  ],
};

const stageConfig = {
  easy: {wordsPerStage: 15, rewardPerStage: 1, totalStages: 4, name: "쉬움"},
  normal: {wordsPerStage: 15, rewardPerStage: 2, totalStages: 4, name: "보통"},
  hard: {wordsPerStage: 15, rewardPerStage: 3, totalStages: 4, name: "어려움"},
};

// Helper function to shuffle an array
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// 타자연습 게임 스테이지 데이터 가져오기
exports.getTypingGameStage = onCall({region: "asia-northeast3"}, async (request) => {
  const {userData} = await checkAuthAndGetUserData(request);
  const {difficulty, stage} = request.data;

  if (!difficulty || !stage) {
    throw new HttpsError("invalid-argument", "난이도와 스테이지 정보가 필요합니다.");
  }

  const classCode = userData.classCode;
  // 스테이지별로 캐시하지 않고, 함수 호출 시마다 새로운 단어 조합을 생성

  try {
    const allWordsForDifficulty = typingWords[difficulty];
    const config = stageConfig[difficulty];

    if (!allWordsForDifficulty || !config) {
      throw new HttpsError("invalid-argument", "잘못된 난이도입니다.");
    }

    if (stage < 1 || stage > config.totalStages) {
      throw new HttpsError("invalid-argument", "잘못된 스테이지입니다.");
    }

    // 단어 풀에서 무작위로 단어 선택
    const shuffledPool = shuffleArray([...allWordsForDifficulty]);
    const stageWords = shuffledPool.slice(0, config.wordsPerStage);

    // 각 단어에 대한 오답 선택지 생성 및 셔플
    const wordsWithChoices = stageWords.map((word) => {
      const distractors = [];
      const allKoreanWords = allWordsForDifficulty.map((w) => w.korean);

      // 자기 자신과 다른 단어들 중에서 오답 선택
      const otherWords = allKoreanWords.filter((k) => k !== word.korean);
      const shuffledDistractors = shuffleArray(otherWords);

      // 2개의 오답 선택
      for (let i = 0; i < 2 && i < shuffledDistractors.length; i++) {
        distractors.push(shuffledDistractors[i]);
      }

      const choices = shuffleArray([word.korean, ...distractors]);

      return {
        english: word.english,
        korean: word.korean,
        choices: choices,
      };
    });

    const stageData = {
      difficulty,
      stage,
      totalStages: config.totalStages,
      words: wordsWithChoices,
      rewardPerStage: config.rewardPerStage,
      classCode,
    };

    return {success: true, data: stageData, cached: false};
  } catch (error) {
    logger.error(`타자연습 게임 데이터 조회 오류 (${difficulty}, ${stage}):`, error);
    throw new HttpsError("internal", `게임 데이터 조회 실패: ${error.message}`);
  }
});

// 타자연습 게임 스테이지 완료 및 보상 지급
exports.completeTypingGameStage = onCall({region: "asia-northeast3"}, async (request) => {
  const {userData, uid} = await checkAuthAndGetUserData(request);
  const {difficulty, stage, score, correctAnswers, totalQuestions, timeSpent} = request.data;

  if (!difficulty || !stage || score === undefined) {
    throw new HttpsError("invalid-argument", "게임 결과 정보가 필요합니다.");
  }

  const classCode = userData.classCode;

  try {
    const config = stageConfig[difficulty];
    if (!config) {
      throw new HttpsError("invalid-argument", "잘못된 난이도입니다.");
    }

    // 최소 점수 조건 (70% 이상 정답)
    const minCorrectRate = 0.7;
    const correctRate = totalQuestions > 0 ? correctAnswers / totalQuestions : 0;

    if (correctRate < minCorrectRate) {
      return {
        success: true, // 함수 자체는 성공했으나, 게임 통과는 실패
        message: `스테이지 통과 실패! 최소 ${(minCorrectRate * 100)}% 이상 정답이 필요합니다. (현재: ${(correctRate * 100).toFixed(1)}%)`,
        passed: false,
        correctRate: correctRate * 100,
      };
    }

    const batch = db.batch();
    const reward = config.rewardPerStage;

    // 사용자 보상 지급
    const userRef = db.doc(`users/${uid}`);
    batch.update(userRef, {
      coupons: admin.firestore.FieldValue.increment(reward),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 게임 기록 저장 (학급별)
    const gameRecordRef = db.collection(`gameRecords/${classCode}/typingGame`).doc();
    batch.set(gameRecordRef, {
      userId: uid,
      userNickname: userData.nickname || userData.name || "이름 없음",
      difficulty,
      stage,
      score,
      correctAnswers,
      totalQuestions,
      correctRate: correctRate * 100,
      timeSpent,
      reward,
      classCode,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 사용자별 진행 상황 업데이트
    const progressRef = db.doc(`gameProgress/${uid}/typingGame/${difficulty}`);
    const currentProgress = await progressRef.get();
    const existingData = currentProgress.exists ? currentProgress.data() : {};

    const maxStageCompleted = Math.max(existingData.maxStageCompleted || 0, stage);
    const totalRewardsEarned = (existingData.totalRewardsEarned || 0) + reward;

    batch.set(progressRef, {
      maxStageCompleted,
      totalRewardsEarned,
      lastPlayedAt: admin.firestore.FieldValue.serverTimestamp(),
      classCode,
      [`stage${stage}BestScore`]: Math.max(existingData[`stage${stage}BestScore`] || 0, score),
      [`stage${stage}BestTime`]: Math.min(existingData[`stage${stage}BestTime`] || Infinity, timeSpent),
      [`stage${stage}Completed`]: true,
    }, {merge: true});

    // 활동 로그 기록
    const activityRef = db.collection(`activityLogs/${classCode}/logs`).doc();
    batch.set(activityRef, {
      userId: uid,
      userNickname: userData.nickname || userData.name || "이름 없음",
      type: "typing_game",
      description: `타자연습 게임 스테이지 완료`,
      metadata: {
        difficulty: config.name,
        stage,
        score,
        correctRate: (correctRate * 100).toFixed(1),
        reward,
        timeSpent,
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      classCode,
    });

    await batch.commit();

    // 관련 캐시 무효화
    cache.delete(`user_progress_${uid}`);
    cache.delete(`typing_progress_${uid}`);

    logger.info(`타자연습 게임 완료: ${uid}, ${difficulty} 난이도 ${stage}스테이지, 보상: ${reward}쿠폰`);

    return {
      success: true,
      passed: true,
      reward,
      message: `스테이지 ${stage} 완료! ${reward}쿠폰을 획득했습니다!`,
      correctRate: correctRate * 100,
      maxStageCompleted,
      isNewRecord: stage > (existingData.maxStageCompleted || 0),
    };
  } catch (error) {
    logger.error(`타자연습 게임 완료 처리 오류 (${uid}, ${difficulty} ${stage}):`, error);
    throw new HttpsError("internal", `게임 완료 처리 실패: ${error.message}`);
  }
});

// 타자연습 게임 진행 상황 조회
exports.getTypingGameProgress = onCall({region: "asia-northeast3"}, async (request) => {
  const {userData, uid} = await checkAuthAndGetUserData(request);
  const classCode = userData.classCode;

  const cacheKey = `typing_progress_${uid}`;
  const cached = cacheUtils.get(cacheKey);
  if (cached) {
    return {success: true, data: cached, cached: true};
  }

  try {
    const progressPromises = Object.keys(stageConfig).map(async (difficulty) => {
      const progressDoc = await db.doc(`gameProgress/${uid}/typingGame/${difficulty}`).get();
      return {
        difficulty,
        ...stageConfig[difficulty],
        progress: progressDoc.exists ? progressDoc.data() : {
          maxStageCompleted: 0,
          totalRewardsEarned: 0,
        },
      };
    });

    const progressData = await Promise.all(progressPromises);

    const result = {
      userId: uid,
      classCode,
      difficulties: progressData,
      timestamp: Date.now(),
    };

    // 5분 캐시
    cacheUtils.set(cacheKey, result, 300);

    return {success: true, data: result, cached: false};
  } catch (error) {
    logger.error(`타자연습 게임 진행상황 조회 오류 (${uid}):`, error);
    throw new HttpsError("internal", `진행상황 조회 실패: ${error.message}`);
  }
});

// ===================================================================================
// 🛠️ 기존 마켓 아이템 환불 (일회성 관리자 함수)
// ===================================================================================

exports.refundOldMarketItems = onCall({region: "asia-northeast3"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요한 기능입니다.");
  }

  const uid = request.auth.uid;

  try {
    // 관리자 권한 확인
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists || !userDoc.data().isAdmin) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const classCode = userDoc.data().classCode;
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    // 기존 경로에서 해당 클래스의 모든 활성 마켓 아이템 조회
    const oldMarketItemsSnap = await db.collection("marketItems")
        .where("classCode", "==", classCode)
        .where("status", "==", "active")
        .get();

    logger.info(`[환불] 기존 마켓 아이템 ${oldMarketItemsSnap.size}개 발견`);

    let refundCount = 0;
    const batch = db.batch();

    for (const doc of oldMarketItemsSnap.docs) {
      const item = doc.data();
      const sellerId = item.sellerId;
      const inventoryItemId = item.inventoryItemId;
      const originalStoreItemId = item.originalStoreItemId || item.itemId;
      const quantity = item.quantity || 1;

      if (!sellerId) {
        logger.warn(`[환불] 판매자 정보 없음: ${doc.id}`);
        continue;
      }

      // 인벤토리로 아이템 복구
      if (inventoryItemId) {
        // 기존 인벤토리 아이템이 있는지 확인
        const inventoryRef = db.collection("users").doc(sellerId).collection("inventory");
        const existingInventorySnap = await inventoryRef
            .where("itemId", "==", originalStoreItemId)
            .limit(1)
            .get();

        if (!existingInventorySnap.empty) {
          // 기존 아이템에 수량 추가
          const existingDoc = existingInventorySnap.docs[0];
          batch.update(existingDoc.ref, {
            quantity: admin.firestore.FieldValue.increment(quantity),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          // 새로운 인벤토리 아이템 생성
          const newInventoryRef = inventoryRef.doc();
          batch.set(newInventoryRef, {
            itemId: originalStoreItemId,
            quantity: quantity,
            purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // 마켓 아이템 삭제
      batch.delete(doc.ref);
      refundCount++;

      logger.info(`[환불] ${doc.id}: ${quantity}개 환불 (판매자: ${sellerId})`);
    }

    if (refundCount > 0) {
      await batch.commit();
      logger.info(`[환불] 총 ${refundCount}개 아이템 환불 완료`);
    }

    return {
      success: true,
      message: `${refundCount}개 아이템을 환불했습니다.`,
      refundCount,
    };
  } catch (error) {
    logger.error("[환불] 오류:", error);
    throw new HttpsError("internal", `환불 실패: ${error.message}`);
  }
});

// ===================================================================================
// 📈 주식 자동 상장/폐지 관리 (Scheduled Function)
// ===================================================================================

/**
 * 1분마다 실행되는 자동 상장/폐지/재상장 스케줄러
 * - 최소 상장가(초기가의 10%) 도달 시 자동 폐지 + 보유자 주식 휴지조각 마킹
 * - 폐지 5분 후 초기 가격으로 자동 재상장 (새 주식으로 등록)
 */
exports.autoManageStocks = onSchedule({
  schedule: "every 1 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  try {
    logger.info("[Stock Auto] 자동 관리 시작");

    const stocksRef = db.collection("CentralStocks");
    const batch = db.batch();
    let delistedCount = 0;
    let relistedCount = 0;

    // 1. 상장 폐지 검사 (상장된 자동 주식만)
    const listedStocksSnap = await stocksRef
        .where("isListed", "==", true)
        .where("isManual", "==", false)
        .get();

    for (const doc of listedStocksSnap.docs) {
      const stock = doc.data();
      const initialPrice = stock.initialPrice || stock.price;
      const minListingPrice = initialPrice * 0.1;

      // 최소 상장가 도달 시 폐지
      if (stock.price <= minListingPrice) {
        batch.update(doc.ref, {
          isListed: false,
          delistedAt: admin.firestore.FieldValue.serverTimestamp(),
          delistReason: `가격 급락 (최소 상장가 ${minListingPrice.toFixed(0)}원 도달)`,
          relistScheduledAt: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), // 5분 후
        });
        delistedCount++;
        logger.info(`[Stock Auto] 상장 폐지: ${stock.name} (5분 후 재상장 예정)`);

        // 보유자 주식 휴지조각 마킹
        await markPortfoliosAsWorthless(stock.id, stock.name);
      }
    }

    // 2. 재상장 검사 (5분 경과한 폐지 주식)
    const now = admin.firestore.Timestamp.now();
    const delistedStocksSnap = await stocksRef
        .where("isListed", "==", false)
        .where("isManual", "==", false)
        .get();

    for (const doc of delistedStocksSnap.docs) {
      const stock = doc.data();
      const relistScheduledAt = stock.relistScheduledAt;
      const delistedAt = stock.delistedAt;

      // relistScheduledAt이 있는 경우 - 그 시간 확인
      if (relistScheduledAt && relistScheduledAt.toMillis() <= now.toMillis()) {
        const initialPrice = stock.initialPrice || stock.price;

        batch.update(doc.ref, {
          isListed: true,
          price: initialPrice, // 초기 가격으로 리셋
          relistedAt: admin.firestore.FieldValue.serverTimestamp(),
          delistedAt: null,
          delistReason: null,
          relistScheduledAt: null,
        });
        relistedCount++;
        logger.info(`[Stock Auto] 재상장: ${stock.name} (초기가 ${initialPrice}원)`);
      } else if (!relistScheduledAt && delistedAt) {
        // relistScheduledAt이 없는 경우 - delistedAt 기준으로 5분 경과 확인 (기존 폐지 주식)
        const fiveMinutesAgo = now.toMillis() - (5 * 60 * 1000);
        if (delistedAt.toMillis() <= fiveMinutesAgo) {
          const initialPrice = stock.initialPrice || stock.price;

          batch.update(doc.ref, {
            isListed: true,
            price: initialPrice,
            relistedAt: admin.firestore.FieldValue.serverTimestamp(),
            delistedAt: null,
            delistReason: null,
            relistScheduledAt: null,
          });
          relistedCount++;
          logger.info(`[Stock Auto] 재상장 (기존): ${stock.name} (초기가 ${initialPrice}원)`);
        }
      }
    }

    // 3. 배치 커밋
    if (delistedCount > 0 || relistedCount > 0) {
      await batch.commit();
      logger.info(`[Stock Auto] 완료 - 폐지: ${delistedCount}개, 재상장: ${relistedCount}개`);
    } else {
      logger.info("[Stock Auto] 처리 대상 없음");
    }

    return {
      success: true,
      delisted: delistedCount,
      relisted: relistedCount,
    };
  } catch (error) {
    logger.error("[Stock Auto] 오류:", error);
    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * 상장폐지된 주식의 보유자 포트폴리오를 휴지조각으로 마킹
 */
const markPortfoliosAsWorthless = async (stockId, stockName) => {
  try {
    // Users 컬렉션의 모든 사용자 검색
    const usersSnap = await db.collection("Users").get();
    const batch = db.batch();
    let markedCount = 0;

    for (const userDoc of usersSnap.docs) {
      // 각 사용자의 portfolio에서 해당 주식 찾기
      const portfolioSnap = await db.collection("Users")
          .doc(userDoc.id)
          .collection("portfolio")
          .where("stockId", "==", stockId)
          .get();

      portfolioSnap.docs.forEach((portfolioDoc) => {
        batch.update(portfolioDoc.ref, {
          isWorthless: true, // 휴지조각 마킹
          worthlessAt: admin.firestore.FieldValue.serverTimestamp(),
          autoDeleteAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), // 10분 후 자동 삭제
        });
        markedCount++;
      });
    }

    if (markedCount > 0) {
      await batch.commit();
      logger.info(`[Stock Auto] ${stockName} 보유자 ${markedCount}건 휴지조각 마킹 완료`);
    }
  } catch (error) {
    logger.error("[Stock Auto] 포트폴리오 마킹 오류:", error);
  }
};

/**
 * 1분마다 실행 - 휴지조각 주식 자동 삭제 (10분 경과 시)
 */
exports.cleanupWorthlessStocks = onSchedule({
  schedule: "every 1 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  try {
    logger.info("[Portfolio Cleanup] 휴지조각 자동 삭제 시작");

    const now = admin.firestore.Timestamp.now();
    const usersSnap = await db.collection("Users").get();
    let deletedCount = 0;

    for (const userDoc of usersSnap.docs) {
      const portfolioSnap = await db.collection("Users")
          .doc(userDoc.id)
          .collection("portfolio")
          .where("isWorthless", "==", true)
          .get();

      const batch = db.batch();

      portfolioSnap.docs.forEach((portfolioDoc) => {
        const portfolio = portfolioDoc.data();
        const autoDeleteAt = portfolio.autoDeleteAt;

        // 자동 삭제 시간이 도래한 경우
        if (autoDeleteAt && autoDeleteAt.toMillis() <= now.toMillis()) {
          batch.delete(portfolioDoc.ref);
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        await batch.commit();
      }
    }

    if (deletedCount > 0) {
      logger.info(`[Portfolio Cleanup] ${deletedCount}건 휴지조각 자동 삭제 완료`);
    } else {
      logger.info("[Portfolio Cleanup] 삭제 대상 없음");
    }

    return {success: true, deleted: deletedCount};
  } catch (error) {
    logger.error("[Portfolio Cleanup] 오류:", error);
    return {success: false, error: error.message};
  }
});

// ===================================================================================
// 🚀 집계 데이터 캐시 시스템 (읽기 최적화)
// ===================================================================================

/**
 * 학급별 사용자 통계 캐시 (5분마다 갱신)
 */
exports.updateClassStats = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  try {
    logger.info("[Stats Cache] 학급 통계 업데이트 시작");

    const usersSnap = await db.collection("Users").get();
    const classStats = {};

    // 학급별 집계
    usersSnap.docs.forEach((doc) => {
      const user = doc.data();
      const classCode = user.classCode;

      if (!classCode) return;

      if (!classStats[classCode]) {
        classStats[classCode] = {
          totalCash: 0,
          totalCoupons: 0,
          userCount: 0,
          avgCash: 0,
          avgCoupons: 0,
          richestUser: null,
          richestCash: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
      }

      classStats[classCode].totalCash += user.cash || 0;
      classStats[classCode].totalCoupons += user.coupons || 0;
      classStats[classCode].userCount += 1;

      if ((user.cash || 0) > classStats[classCode].richestCash) {
        classStats[classCode].richestCash = user.cash || 0;
        classStats[classCode].richestUser = {
          id: doc.id,
          name: user.name,
          cash: user.cash || 0,
        };
      }
    });

    // 평균 계산 및 저장
    const batch = db.batch();
    for (const [classCode, stats] of Object.entries(classStats)) {
      stats.avgCash = Math.round(stats.totalCash / stats.userCount);
      stats.avgCoupons = Math.round(stats.totalCoupons / stats.userCount);

      const statsRef = db.collection("ClassStats").doc(classCode);
      batch.set(statsRef, stats, {merge: true});
    }

    await batch.commit();
    logger.info(`[Stats Cache] ${Object.keys(classStats).length}개 학급 통계 업데이트 완료`);

    return {success: true, classCount: Object.keys(classStats).length};
  } catch (error) {
    logger.error("[Stats Cache] 오류:", error);
    return {success: false, error: error.message};
  }
});

/**
 * 사용자별 포트폴리오 요약 캐시 (10분마다 갱신)
 */
exports.updatePortfolioSummary = onSchedule({
  schedule: "every 10 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  try {
    logger.info("[Portfolio Cache] 포트폴리오 요약 업데이트 시작");

    const usersSnap = await db.collection("Users").get();
    let updatedCount = 0;

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;

      // 포트폴리오 조회
      const portfolioSnap = await db.collection("Users")
          .doc(userId)
          .collection("portfolio")
          .get();

      if (portfolioSnap.empty) continue;

      let totalValue = 0;
      let totalInvested = 0;
      const holdings = [];

      for (const pDoc of portfolioSnap.docs) {
        const holding = pDoc.data();

        // 휴지조각 제외
        if (holding.isWorthless) continue;

        // 주식 가격 조회
        const stockSnap = await db.collection("CentralStocks")
            .doc(holding.stockId)
            .get();

        if (!stockSnap.exists) continue;

        const stock = stockSnap.data();
        const currentValue = stock.price * holding.quantity;
        const investedValue = holding.averagePrice * holding.quantity;

        totalValue += currentValue;
        totalInvested += investedValue;

        holdings.push({
          stockId: holding.stockId,
          stockName: holding.stockName,
          quantity: holding.quantity,
          currentValue,
          profit: currentValue - investedValue,
        });
      }

      // 요약 저장
      const summaryRef = db.collection("Users")
          .doc(userId)
          .collection("cache")
          .doc("portfolioSummary");

      await summaryRef.set({
        totalValue,
        totalInvested,
        totalProfit: totalValue - totalInvested,
        profitRate: totalInvested > 0 ?
          ((totalValue - totalInvested) / totalInvested) * 100 : 0,
        holdingsCount: holdings.length,
        topHoldings: holdings.slice(0, 5),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      updatedCount++;
    }

    logger.info(`[Portfolio Cache] ${updatedCount}명 포트폴리오 요약 업데이트 완료`);
    return {success: true, updated: updatedCount};
  } catch (error) {
    logger.error("[Portfolio Cache] 오류:", error);
    return {success: false, error: error.message};
  }
});

/**
 * HTTP API: 학급 통계 조회 (캐시된 데이터 반환)
 */
exports.getClassStats = onRequest({
  region: "asia-northeast3",
  cors: true,
}, async (req, res) => {
  try {
    const {classCode} = req.query;

    if (!classCode) {
      res.status(400).json({error: "classCode required"});
      return;
    }

    const statsDoc = await db.collection("ClassStats").doc(classCode).get();

    if (!statsDoc.exists) {
      res.status(404).json({error: "Class not found"});
      return;
    }

    res.json({success: true, data: statsDoc.data()});
  } catch (error) {
    logger.error("[API] getClassStats 오류:", error);
    res.status(500).json({error: error.message});
  }
});

/**
 * HTTP API: 포트폴리오 요약 조회 (캐시된 데이터 반환)
 */
exports.getPortfolioSummary = onRequest({
  region: "asia-northeast3",
  cors: true,
}, async (req, res) => {
  try {
    const {userId} = req.query;

    if (!userId) {
      res.status(400).json({error: "userId required"});
      return;
    }

    const summaryDoc = await db.collection("Users")
        .doc(userId)
        .collection("cache")
        .doc("portfolioSummary")
        .get();

    if (!summaryDoc.exists) {
      res.json({success: true, data: null}); // 캐시 없음
      return;
    }

    res.json({success: true, data: summaryDoc.data()});
  } catch (error) {
    logger.error("[API] getPortfolioSummary 오류:", error);
    res.status(500).json({error: error.message});
  }
});

/**
 * Activity Log 집계 (5분마다) - 읽기 최적화의 핵심
 */
exports.aggregateActivityLogs = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
}, async (event) => {
  try {
    logger.info("[Activity Cache] Activity Log 집계 시작");

    // 모든 학급 코드 조회
    const usersSnap = await db.collection("Users").get();
    const classCodeSet = new Set();

    usersSnap.docs.forEach((doc) => {
      const classCode = doc.data().classCode;
      if (classCode) classCodeSet.add(classCode);
    });

    const classCodes = Array.from(classCodeSet);
    let aggregatedCount = 0;

    for (const classCode of classCodes) {
      // 최근 로그 100개만 조회
      const logsSnap = await db.collection("activity_logs")
          .where("classCode", "==", classCode)
          .orderBy("timestamp", "desc")
          .limit(100)
          .get();

      const logs = logsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // 캐시 저장
      await db.collection("CachedActivityLogs").doc(classCode).set({
        logs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      aggregatedCount++;
    }

    logger.info(`[Activity Cache] ${aggregatedCount}개 학급 Activity Log 집계 완료`);
    return {success: true, aggregated: aggregatedCount};
  } catch (error) {
    logger.error("[Activity Cache] 오류:", error);
    return {success: false, error: error.message};
  }
});

/**
 * HTTP API: 캐시된 Activity Log 조회
 */
exports.getActivityLogs = onRequest({
  region: "asia-northeast3",
  cors: true,
}, async (req, res) => {
  try {
    const {classCode} = req.query;

    if (!classCode) {
      res.status(400).json({error: "classCode required"});
      return;
    }

    const cacheDoc = await db.collection("CachedActivityLogs")
        .doc(classCode).get();

    if (!cacheDoc.exists) {
      res.json({success: true, data: []});
      return;
    }

    res.json({success: true, data: cacheDoc.data().logs || []});
  } catch (error) {
    logger.error("[API] getActivityLogs 오류:", error);
    res.status(500).json({error: error.message});
  }
});

/**
 * 슈퍼관리자 전용: 사용자 비밀번호 변경
 */
exports.updateUserPassword = onCall({
  region: "asia-northeast3",
}, async (request) => {
  try {
    // 인증 확인 및 관리자 권한 확인
    const {isAdmin, isSuperAdmin, classCode, userData} = await checkAuthAndGetUserData(request, false);

    if (!isAdmin && !isSuperAdmin) {
      throw new HttpsError("permission-denied", "관리자만 비밀번호를 변경할 수 있습니다.");
    }

    const {email, newPassword} = request.data;

    if (!email || !newPassword) {
      throw new HttpsError("invalid-argument", "이메일과 새 비밀번호가 필요합니다.");
    }

    if (newPassword.length < 6) {
      throw new HttpsError("invalid-argument", "비밀번호는 최소 6자 이상이어야 합니다.");
    }

    // 이메일로 사용자 찾기
    const userRecord = await admin.auth().getUserByEmail(email);

    // 일반 관리자인 경우, 같은 학급 학생만 변경 가능
    if (!isSuperAdmin) {
      const targetUserDoc = await db.collection("users").doc(userRecord.uid).get();
      if (!targetUserDoc.exists) {
        throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
      }


      // 학급 코드 확인 - Class/학급코드/students 구조 고려
      const studentInClassDoc = await db.collection("Class").doc(classCode).collection("students").doc(userRecord.uid).get();

      if (!studentInClassDoc.exists) {
        throw new HttpsError("permission-denied", "같은 학급 학생의 비밀번호만 변경할 수 있습니다.");
      }
    }

    // 비밀번호 업데이트
    await admin.auth().updateUser(userRecord.uid, {
      password: newPassword,
    });

    logger.info(`[Password Update] ${userData.email}(관리자)가 ${email} 사용자의 비밀번호를 변경했습니다.`);

    return {
      success: true,
      message: "비밀번호가 성공적으로 변경되었습니다.",
    };
  } catch (error) {
    logger.error("[Password Update] 오류:", error);
    throw new HttpsError("internal", `비밀번호 변경 실패: ${error.message}`);
  }
});

// ===================================================================================
// 🔥 [최적화] MyAssets 통합 데이터 로드 API (여러 쿼리를 한 번에 처리)
// ===================================================================================

exports.getUserAssetsData = onCall({
  region: "asia-northeast3",
  cors: true,
}, async (request) => {
  logger.info("[getUserAssetsData] Function invoked (v3 - multi-path shotgun query).");
  try {
    const {uid, classCode} = await checkAuthAndGetUserData(request, false);

    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없어 자산 정보를 조회할 수 없습니다.");
    }

    logger.info(`[getUserAssetsData] 사용자 ${uid}의 자산 데이터 조회 시작. ClassCode: ${classCode}`);

    // 데이터가 여러 곳에 분산 저장된 문제에 대응하기 위해 모든 경로를 병렬로 조회
    const [
      // Parking Account Paths
      parkingSnap1, // users/{uid}/financials/parkingAccount
      parkingSnap2, // ClassStock/{classCode}/students/{uid}/parkingAccounts

      // Real Estate Paths
      realEstateSnap3, // realEstate (root)

      // Other data
      loansSnap,
      transactionsSnap,
      goalSnap,
    ] = await Promise.all([
      // --- Parking Account Queries ---
      db.collection("users").doc(uid).collection("financials").doc("parkingAccount").get(),
      db.collection("ClassStock").doc(classCode).collection("students").doc(uid).collection("parkingAccounts").get(),

      // --- Real Estate Queries ---
      db.collection("realEstate").where("ownerId", "==", uid).get(),

      // --- Other Queries ---
      db.collection("users").doc(uid).collection("loans").get(),
      db.collection("users").doc(uid).collection("transactions").orderBy("timestamp", "desc").limit(5).get(),
      db.collection("goals").doc(`${classCode}_goal`).get(),
    ]);

    // --- 데이터 가공 및 병합 ---

    // 1. 파킹통장 잔액 합산
    let parkingBalance = 0;
    if (parkingSnap1.exists) {
      parkingBalance += parkingSnap1.data().balance || 0;
    }
    parkingSnap2.docs.forEach((doc) => {
      parkingBalance += doc.data().balance || 0;
    });

    // 2. 부동산 자산 병합 (중복 제거)
    const realEstateAssets = [];
    const seenRealEstate = new Set();

    const addRealEstate = (doc) => {
      const id = doc.id; // Firestore 문서 ID를 고유 식별자로 사용
      if (!seenRealEstate.has(id)) {
        realEstateAssets.push({id, ...doc.data()});
        seenRealEstate.add(id);
      }
    };

    realEstateSnap3.docs.forEach(addRealEstate);

    // 최종 결과 객체 생성
    const result = {
      parkingBalance,
      realEstateAssets,
      loans: loansSnap.docs.map((doc) => ({id: doc.id, ...doc.data()})),
      transactionHistory: transactionsSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          amount: data.amount || 0,
          description: data.description || "거래 내역",
          timestamp: data.timestamp || null,
        };
      }),
      goalData: goalSnap && goalSnap.exists ? goalSnap.data() : null,
    };

    logger.info(`[getUserAssetsData] 조회 완료. Parking: ${parkingBalance}, RealEstate: ${realEstateAssets.length}건`);
    return {success: true, data: result};
  } catch (error) {
    logger.error("[getUserAssetsData] 오류:", error);
    if (error.code === "failed-precondition" && error.message.includes("requires an index")) {
      logger.error("Firestore 인덱스 필요 오류. 콘솔에서 인덱스를 생성해야 합니다.");
      throw new HttpsError("failed-precondition", `데이터베이스 쿼리에 필요한 인덱스가 없습니다. Firebase 콘솔에서 생성해야 합니다: ${error.message}`);
    }
    throw new HttpsError("internal", `자산 데이터 조회 실패: ${error.message}`);
  }
});
