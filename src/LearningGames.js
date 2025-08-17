// src/LearningGames.js - 수정됨
import React from "react";
import { useAuth } from "./AuthContext";
// 수정: ResourceFlow (7).js에서 ResourceFlow 컴포넌트를 임포트합니다.
// 파일 이름이 ResourceFlow (7).js이고, 여기서 export default ResourceFlow; 를 가정합니다.
import ResourceFlowGame from "./ResourceFlow (7).js"; // 경로 수정 및 파일 이름 일치 확인

// LearningGames 컴포넌트
const LearningGames = () => {
  const auth = useAuth?.() || {};
  const { userDoc } = auth || {};

  const handleLevelClear = (points) => {
    if (!userDoc) return;
    try {
      alert(`축하합니다! ${points} 포인트를 획득했습니다!`);
      console.log(`사용자 ${userDoc.id}에게 ${points} 포인트 추가됨`);
      // 예시: auth.updateUserPoints(points); // 실제 포인트 업데이트 로직
    } catch (error) {
      console.error("포인트 적립 중 오류 발생:", error);
    }
  };

  return (
    <div
      className="learning-games-container"
      style={{
        fontFamily: "'Arial', sans-serif",
        padding: "20px",
        backgroundColor: "#f0f4f8",
        color: "#333",
      }}
    >
      <h1
        className="learning-games-title"
        style={{
          textAlign: "center",
          color: "#2c3e50",
          marginBottom: "30px",
          fontSize: "2.5em",
        }}
      >
        학습 게임
      </h1>

      <div
        className="learning-games-intro"
        style={{
          textAlign: "center",
          marginBottom: "40px",
          fontSize: "1.1em",
          color: "#555",
        }}
      >
        <p>
          학습 게임을 통해 재미있게 공부하면서 포인트도 획득해보세요! 게임에서
          얻은 포인트는 학급 경제 활동에 사용할 수 있습니다.
        </p>
      </div>

      <div
        className="game-card"
        style={{
          backgroundColor: "white",
          borderRadius: "10px",
          padding: "25px",
          marginBottom: "30px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
        }}
      >
        <div
          className="game-header"
          style={{
            fontSize: "1.8em",
            fontWeight: "bold",
            color: "#3498db",
            marginBottom: "15px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <span className="game-header-icon" style={{ marginRight: "10px" }}>
            🧩
          </span>
          자원 흐름 (Resource Flow)
        </div>
        <div className="game-content">
          <p
            className="game-description"
            style={{ marginBottom: "20px", lineHeight: "1.6", color: "#444" }}
          >
            자원을 효율적으로 배치하고 블록들을 밀고 당겨 목표를 달성하는 논리
            퍼즐 게임입니다. 빨간색 목표 블록을 출구로 이동시키세요!
          </p>
          {/* 수정: 임포트한 ResourceFlowGame 컴포넌트 사용 및 onLevelClear prop 전달 */}
          <ResourceFlowGame onLevelClear={handleLevelClear} />
        </div>
      </div>

      <div
        className="coming-soon"
        style={{
          textAlign: "center",
          padding: "20px",
          backgroundColor: "#e9ecef",
          borderRadius: "8px",
        }}
      >
        <p
          className="coming-soon-title"
          style={{
            fontSize: "1.5em",
            fontWeight: "bold",
            color: "#2c3e50",
            marginBottom: "10px",
          }}
        >
          <span className="coming-soon-icon" style={{ marginRight: "8px" }}>
            🎲
          </span>
          더 많은 게임이 준비 중입니다!
        </p>
        <p style={{ color: "#555" }}>
          곧 새로운 학습 게임이 추가될 예정입니다. 기대해주세요.
        </p>
      </div>

     
        .learning-games-container {
          /* 예시 스타일 */
          max-width: 800px;
          margin: 0 auto;
        }
        /* 필요한 경우 LearningGames 페이지의 다른 요소들에 대한 스타일 추가 */
      `}</style>
    </div>
  );
};

export default LearningGames;
