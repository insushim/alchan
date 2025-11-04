// 직업 할일 보상 생성 함수

// 가중치 기반 랜덤 보상 생성 (직업 할일용)
export const generateJobTaskReward = () => {
  // 현금 보상 (100원 ~ 50,000원) - 높은 보상 확률 증가
  const cashRewards = [
    { amount: 50000, weight: 5 },     // 5만원: 확률 증가
    { amount: 30000, weight: 10 },    // 3만원: 확률 증가
    { amount: 20000, weight: 15 },    // 2만원: 확률 증가
    { amount: 10000, weight: 20 },    // 1만원: 확률 증가
    { amount: 5000, weight: 18 },     // 5천원
    { amount: 3000, weight: 12 },     // 3천원
    { amount: 1000, weight: 10 },     // 1천원: 확률 감소
    { amount: 500, weight: 7 },       // 500원: 확률 감소
    { amount: 100, weight: 3 }        // 100원: 확률 대폭 감소
  ];

  // 쿠폰 보상 (1개 ~ 20개) - 높은 보상 확률 증가
  const couponRewards = [
    { amount: 20, weight: 15 },       // 20개: 확률 증가
    { amount: 18, weight: 15 },       // 18개: 확률 증가
    { amount: 15, weight: 18 },       // 15개: 확률 증가
    { amount: 12, weight: 15 },       // 12개: 확률 증가
    { amount: 10, weight: 12 },       // 10개: 확률 증가
    { amount: 8, weight: 10 },        // 8개
    { amount: 5, weight: 8 },         // 5개: 확률 감소
    { amount: 3, weight: 5 },         // 3개: 확률 감소
    { amount: 2, weight: 3 },         // 2개: 확률 감소
    { amount: 1, weight: 2 }          // 1개: 확률 대폭 감소
  ];

  // 가중치 기반 랜덤 선택 함수
  const weightedRandom = (items) => {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of items) {
      random -= item.weight;
      if (random <= 0) {
        return item.amount;
      }
    }

    return items[items.length - 1].amount;
  };

  return {
    cash: weightedRandom(cashRewards),
    coupon: weightedRandom(couponRewards)
  };
};
