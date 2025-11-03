// src/data/typingWords.js
// 타자연습 게임용 한글 문장 데이터

export const typingWords = {
  easy: [
    // 쉬움 난이도 - 짧은 문장 (10-15자)
    { text: "안녕하세요" },
    { text: "감사합니다" },
    { text: "사랑해요" },
    { text: "오늘 날씨가 좋아요" },
    { text: "책을 읽어요" },
    { text: "물을 마셔요" },
    { text: "학교에 가요" },
    { text: "친구를 만나요" },
    { text: "음악을 들어요" },
    { text: "밥을 먹어요" },
    { text: "공부를 해요" },
    { text: "운동을 해요" },
    { text: "잠을 자요" },
    { text: "영화를 봐요" },
    { text: "게임을 해요" },
    { text: "그림을 그려요" },
    { text: "노래를 불러요" },
    { text: "춤을 춰요" },
    { text: "청소를 해요" },
    { text: "요리를 해요" }
  ],

  normal: [
    // 보통 난이도 - 중간 길이 문장 (20-30자)
    { text: "오늘은 날씨가 정말 좋습니다" },
    { text: "도서관에서 책을 빌렸어요" },
    { text: "친구와 함께 영화를 봤습니다" },
    { text: "학교에서 수학을 공부했어요" },
    { text: "컴퓨터로 게임을 하고 있어요" },
    { text: "주말에는 가족과 여행을 갑니다" },
    { text: "음악을 들으며 산책을 했어요" },
    { text: "숙제를 다 끝내고 쉬고 있어요" },
    { text: "맛있는 음식을 먹고 싶어요" },
    { text: "내일은 체육 시간이 있습니다" },
    { text: "새로운 친구를 사귀었어요" },
    { text: "열심히 노력하면 잘할 수 있어요" },
    { text: "꿈을 이루기 위해 공부합니다" },
    { text: "부모님께 감사 인사를 드렸어요" },
    { text: "건강을 위해 운동을 시작했어요" },
    { text: "재미있는 이야기를 들었습니다" },
    { text: "아름다운 풍경을 보고 왔어요" },
    { text: "선생님께서 칭찬을 해주셨어요" },
    { text: "도전하는 것이 중요합니다" },
    { text: "매일 조금씩 성장하고 있어요" }
  ],

  hard: [
    // 어려움 난이도 - 긴 문장 (35-50자)
    { text: "열심히 노력하면 언젠가는 반드시 좋은 결과를 얻을 수 있습니다" },
    { text: "친구들과 함께 즐거운 시간을 보내는 것이 행복의 비결입니다" },
    { text: "책을 많이 읽으면 지식이 쌓이고 생각의 폭이 넓어집니다" },
    { text: "꾸준한 연습과 노력이 성공으로 가는 가장 빠른 길입니다" },
    { text: "어려운 문제를 풀었을 때의 성취감은 정말 대단합니다" },
    { text: "긍정적인 마음가짐을 가지면 어떤 일도 해낼 수 있어요" },
    { text: "새로운 것을 배우는 과정에서 실수는 자연스러운 것입니다" },
    { text: "서로 존중하고 배려하는 마음이 좋은 관계를 만듭니다" },
    { text: "목표를 세우고 계획적으로 실천하는 것이 중요합니다" },
    { text: "창의적인 생각은 고정관념을 깨는 것에서 시작됩니다" },
    { text: "건강한 몸과 마음을 위해 규칙적인 생활습관이 필요해요" },
    { text: "작은 실천이 모여 큰 변화를 만들어낼 수 있습니다" },
    { text: "다양한 경험을 통해 우리는 더 넓은 세상을 알게 됩니다" },
    { text: "협력과 소통은 팀워크의 가장 중요한 요소입니다" },
    { text: "실패를 두려워하지 말고 도전하는 용기를 가지세요" },
    { text: "감사하는 마음을 가지면 일상이 더욱 행복해집니다" },
    { text: "자신만의 속도로 천천히 성장하는 것도 멋진 일이에요" },
    { text: "어제보다 나은 오늘을 만들기 위해 노력하고 있습니다" },
    { text: "좋은 습관을 만드는 것은 미래를 위한 최고의 투자예요" },
    { text: "서로 다른 생각을 존중하며 함께 성장할 수 있습니다" }
  ]
};

// 난이도별 설정 (30초 통일)
export const difficultyConfig = {
  easy: {
    name: "쉬움",
    sentencesPerGame: 10,
    timeLimit: 30, // 30초 통일
  },
  normal: {
    name: "보통",
    sentencesPerGame: 8,
    timeLimit: 30, // 30초 통일
  },
  hard: {
    name: "어려움",
    sentencesPerGame: 6,
    timeLimit: 30, // 30초 통일
  }
};

// 가중치 기반 랜덤 보상 생성
export const generateRandomReward = () => {
  // 현금 보상 (100원 ~ 100,000원)
  const cashRewards = [
    { amount: 100000, weight: 0.1 },
    { amount: 50000, weight: 0.5 },
    { amount: 30000, weight: 1 },
    { amount: 10000, weight: 3 },
    { amount: 5000, weight: 8 },
    { amount: 3000, weight: 12 },
    { amount: 1000, weight: 20 },
    { amount: 500, weight: 25 },
    { amount: 100, weight: 30.4 }
  ];

  // 쿠폰 보상 (1개 ~ 10개)
  const couponRewards = [
    { amount: 10, weight: 1 },
    { amount: 8, weight: 2 },
    { amount: 5, weight: 5 },
    { amount: 3, weight: 12 },
    { amount: 2, weight: 30 },
    { amount: 1, weight: 50 }
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

// 난이도별 랜덤 문장 가져오기 함수
export const getRandomSentences = (difficulty) => {
  const sentences = typingWords[difficulty];
  const config = difficultyConfig[difficulty];
  const count = config.sentencesPerGame;

  // 배열 섞기 (Fisher-Yates 알고리즘)
  const shuffled = [...sentences].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, count);
};