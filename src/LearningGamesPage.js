// LearningGamesPage.js - 수정됨
import React from "react";
// 수정: ResourceFlow (7).js에서 ResourceFlow 컴포넌트를 임포트합니다.
// 파일 경로가 현재 파일 기준으로 올바른지 확인하세요. (예: './ResourceFlow (7).js')
import ResourceFlow from "./ResourceFlow (7).js"; // 경로 수정

const LearningGamesPage = () => {
  const handleLevelClear = (points) => {
    // 포인트를 학급 경제 시스템에 통합하는 로직
    console.log(`획득한 포인트: ${points}`);
    // 예: API 호출 또는 상태 관리를 통한 포인트 저장
  };

  return (
    <div className="learning-games-container">
      <h1 className="text-2xl font-bold">학습 게임</h1>
      <p className="text-gray-600 mb-4">
        게임을 통해 즐겁게 공부하고 포인트도 획득해보세요!
      </p>

      <ResourceFlow onLevelClear={handleLevelClear} />
    </div>
  );
};

export default LearningGamesPage;
