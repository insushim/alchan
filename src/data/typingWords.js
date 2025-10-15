// src/data/typingWords.js
// 타자연습 게임용 영어-한글 단어 데이터

export const typingWords = {
  easy: [
    // 쉬움 난이도 - 기초 단어 (3-5글자)
    { english: "cat", korean: "고양이", distractors: ["강아지", "토끼", "새"] },
    { english: "dog", korean: "강아지", distractors: ["고양이", "말", "소"] },
    { english: "book", korean: "책", distractors: ["펜", "종이", "가방"] },
    { english: "home", korean: "집", distractors: ["학교", "병원", "공원"] },
    { english: "water", korean: "물", distractors: ["우유", "주스", "차"] },
    { english: "apple", korean: "사과", distractors: ["바나나", "오렌지", "포도"] },
    { english: "happy", korean: "행복한", distractors: ["슬픈", "화난", "평온한"] },
    { english: "love", korean: "사랑", distractors: ["미움", "우정", "가족"] },
    { english: "time", korean: "시간", distractors: ["공간", "돈", "사람"] },
    { english: "school", korean: "학교", distractors: ["집", "병원", "상점"] },
    { english: "friend", korean: "친구", distractors: ["가족", "선생님", "학생"] },
    { english: "food", korean: "음식", distractors: ["물", "옷", "집"] },
    { english: "car", korean: "자동차", distractors: ["자전거", "버스", "기차"] },
    { english: "music", korean: "음악", distractors: ["영화", "책", "그림"] },
    { english: "sun", korean: "태양", distractors: ["달", "별", "구름"] },
    { english: "moon", korean: "달", distractors: ["태양", "별", "하늘"] },
    { english: "tree", korean: "나무", distractors: ["꽃", "풀", "잎"] },
    { english: "blue", korean: "파란색", distractors: ["빨간색", "노란색", "초록색"] },
    { english: "red", korean: "빨간색", distractors: ["파란색", "노란색", "보라색"] },
    { english: "good", korean: "좋은", distractors: ["나쁜", "보통", "특별한"] }
  ],

  normal: [
    // 보통 난이도 - 중급 단어 (5-8글자)
    { english: "computer", korean: "컴퓨터", distractors: ["키보드", "마우스", "모니터"] },
    { english: "language", korean: "언어", distractors: ["문화", "역사", "과학"] },
    { english: "education", korean: "교육", distractors: ["학습", "훈련", "지도"] },
    { english: "important", korean: "중요한", distractors: ["특별한", "필요한", "유용한"] },
    { english: "beautiful", korean: "아름다운", distractors: ["예쁜", "멋진", "훌륭한"] },
    { english: "challenge", korean: "도전", distractors: ["기회", "위험", "선택"] },
    { english: "different", korean: "다른", distractors: ["같은", "비슷한", "특별한"] },
    { english: "creative", korean: "창의적인", distractors: ["논리적인", "실용적인", "감정적인"] },
    { english: "problem", korean: "문제", distractors: ["해답", "질문", "상황"] },
    { english: "solution", korean: "해결책", distractors: ["문제", "원인", "결과"] },
    { english: "knowledge", korean: "지식", distractors: ["경험", "기술", "능력"] },
    { english: "development", korean: "개발", distractors: ["연구", "제작", "설계"] },
    { english: "technology", korean: "기술", distractors: ["과학", "공학", "정보"] },
    { english: "environment", korean: "환경", distractors: ["자연", "생태", "기후"] },
    { english: "university", korean: "대학교", distractors: ["고등학교", "중학교", "대학원"] },
    { english: "interesting", korean: "흥미로운", distractors: ["지루한", "재미있는", "놀라운"] },
    { english: "opportunity", korean: "기회", distractors: ["위기", "도전", "선택"] },
    { english: "experience", korean: "경험", distractors: ["지식", "기억", "학습"] },
    { english: "communication", korean: "의사소통", distractors: ["정보전달", "대화", "교류"] },
    { english: "successful", korean: "성공적인", distractors: ["실패한", "완전한", "효과적인"] }
  ],

  hard: [
    // 어려움 난이도 - 고급 단어 (8글자 이상)
    { english: "responsibility", korean: "책임", distractors: ["의무", "권리", "역할"] },
    { english: "understanding", korean: "이해", distractors: ["인식", "파악", "깨달음"] },
    { english: "extraordinary", korean: "특별한", distractors: ["평범한", "일반적인", "독특한"] },
    { english: "accomplishment", korean: "성취", distractors: ["목표", "결과", "업적"] },
    { english: "determination", korean: "결심", distractors: ["의지", "노력", "계획"] },
    { english: "independence", korean: "독립", distractors: ["자유", "자율", "해방"] },
    { english: "contemporary", korean: "현대의", distractors: ["과거의", "미래의", "전통적인"] },
    { english: "sophisticated", korean: "정교한", distractors: ["단순한", "복잡한", "섬세한"] },
    { english: "philosophical", korean: "철학적인", distractors: ["과학적인", "논리적인", "종교적인"] },
    { english: "psychological", korean: "심리적인", distractors: ["생리적인", "정신적인", "감정적인"] },
    { english: "international", korean: "국제적인", distractors: ["국내의", "지역의", "세계적인"] },
    { english: "characteristic", korean: "특성", distractors: ["성격", "특징", "성질"] },
    { english: "revolutionary", korean: "혁명적인", distractors: ["진보적인", "보수적인", "변화하는"] },
    { english: "entrepreneurship", korean: "기업가정신", distractors: ["리더십", "창업", "경영"] },
    { english: "transformation", korean: "변화", distractors: ["개선", "발전", "진화"] },
    { english: "collaboration", korean: "협력", distractors: ["경쟁", "협조", "팀워크"] },
    { english: "administration", korean: "관리", distractors: ["운영", "경영", "지도"] },
    { english: "investigation", korean: "조사", distractors: ["연구", "분석", "탐구"] },
    { english: "establishment", korean: "설립", distractors: ["창설", "건설", "구축"] },
    { english: "comprehensive", korean: "포괄적인", distractors: ["전체적인", "완전한", "광범위한"] }
  ]
};

// 난이도별 스테이지 설정
export const stageConfig = {
  easy: {
    wordsPerStage: 5,
    rewardPerStage: 1,
    totalStages: 4, // 20개 단어를 4스테이지로 분할
    name: "쉬움"
  },
  normal: {
    wordsPerStage: 5,
    rewardPerStage: 2,
    totalStages: 4, // 20개 단어를 4스테이지로 분할
    name: "보통"
  },
  hard: {
    wordsPerStage: 5,
    rewardPerStage: 3,
    totalStages: 4, // 20개 단어를 4스테이지로 분할
    name: "어려움"
  }
};

// 스테이지별 단어 가져오기 함수
export const getWordsForStage = (difficulty, stage) => {
  const words = typingWords[difficulty];
  const config = stageConfig[difficulty];
  const startIndex = (stage - 1) * config.wordsPerStage;
  const endIndex = startIndex + config.wordsPerStage;

  return words.slice(startIndex, endIndex);
};

// 랜덤 선택지 생성 함수 (정답 + 오답들)
export const generateChoices = (correctAnswer, distractors) => {
  const choices = [correctAnswer, ...distractors];

  // 배열 섞기 (Fisher-Yates 알고리즘)
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  return choices;
};