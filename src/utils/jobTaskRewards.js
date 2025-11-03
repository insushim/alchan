// 직업 할일 보상 생성 함수

// 가중치 기반 랜덤 보상 생성 (직업 할일용)
export const generateJobTaskReward = () => {
  // 현금 보상 (100원 ~ 50,000원)
  const cashRewards = [
    { amount: 50000, weight: 0.1 },   // 5만원: 매우 낮은 확률
    { amount: 30000, weight: 0.5 },   // 3만원: 낮은 확률
    { amount: 20000, weight: 1 },     // 2만원
    { amount: 10000, weight: 3 },     // 1만원
    { amount: 5000, weight: 8 },      // 5천원
    { amount: 3000, weight: 12 },     // 3천원
    { amount: 1000, weight: 20 },     // 1천원
    { amount: 500, weight: 25 },      // 500원
    { amount: 100, weight: 30.4 }     // 100원: 가장 높은 확률
  ];

  // 쿠폰 보상 (1개 ~ 20개)
  const couponRewards = [
    { amount: 20, weight: 0.5 },      // 20개: 매우 낮은 확률
    { amount: 18, weight: 1 },        // 18개
    { amount: 15, weight: 2 },        // 15개
    { amount: 12, weight: 3 },        // 12개
    { amount: 10, weight: 5 },        // 10개
    { amount: 8, weight: 8 },         // 8개
    { amount: 5, weight: 12 },        // 5개
    { amount: 3, weight: 18 },        // 3개
    { amount: 2, weight: 25 },        // 2개
    { amount: 1, weight: 50 }         // 1개: 가장 높은 확률
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
