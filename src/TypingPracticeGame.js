// src/TypingPracticeGame.js
// 최적화된 타자연습 게임 컴포넌트

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import "./TypingPracticeGame.css";

const TypingPracticeGame = ({ onClose }) => {
  const { user, userDoc, updateUser } = useAuth();
  const userNickname = userDoc?.nickname || userDoc?.name || "사용자";

  // 게임 상태
  const [gameState, setGameState] = useState("menu"); // menu, playing, completed, loading
  const [difficulty, setDifficulty] = useState("easy");
  const [currentStage, setCurrentStage] = useState(1);
  const [stageData, setStageData] = useState(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [score, setScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [gameProgress, setGameProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(60); // 60초 제한
  const [gameStartTime, setGameStartTime] = useState(null);

  // Refs
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  // Firebase Functions
  const getTypingGameStage = httpsCallable(functions, "getTypingGameStage");
  const completeTypingGameStage = httpsCallable(functions, "completeTypingGameStage");
  const getTypingGameProgress = httpsCallable(functions, "getTypingGameProgress");

  // 난이도 설정
  const difficultyConfig = {
    easy: { name: "쉬움", reward: 1, color: "#4ade80", timeLimit: 60 },
    normal: { name: "보통", reward: 2, color: "#fbbf24", timeLimit: 45 },
    hard: { name: "어려움", reward: 3, color: "#f87171", timeLimit: 30 },
  };

  // 진행 상황 로드
  const loadProgress = useCallback(async () => {
    try {
      const result = await getTypingGameProgress();
      if (result.data.success) {
        setGameProgress(result.data.data);
      }
    } catch (error) {
      console.error("진행 상황 로드 오류:", error);
    }
  }, [getTypingGameProgress]);

  // 스테이지 데이터 로드
  const loadStageData = useCallback(async (diff, stage) => {
    setLoading(true);
    setError("");
    try {
      const result = await getTypingGameStage({ difficulty: diff, stage });
      if (result.data.success) {
        setStageData(result.data.data);
        setCurrentWordIndex(0);
        setUserInput("");
        setScore(0);
        setCorrectAnswers(0);
        setWrongAnswers(0);
        setTimeLeft(difficultyConfig[diff].timeLimit);
        setGameStartTime(Date.now());
      } else {
        setError("스테이지 데이터를 불러올 수 없습니다.");
      }
    } catch (error) {
      console.error("스테이지 로드 오류:", error);
      setError("스테이지 로드 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [getTypingGameStage]);

  // 게임 시작
  const startGame = useCallback(async (diff, stage) => {
    setDifficulty(diff);
    setCurrentStage(stage);
    await loadStageData(diff, stage);
    setGameState("playing");
  }, [loadStageData]);

  // 타이머 시작
  useEffect(() => {
    if (gameState === "playing" && timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (gameState === "playing" && timeLeft === 0) {
      // 시간 종료
      handleGameEnd();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [gameState, timeLeft]);

  // 게임 종료 처리
  const handleGameEnd = useCallback(async () => {
    if (!stageData) return;

    const timeSpent = Math.floor((Date.now() - gameStartTime) / 1000);
    const totalQuestions = stageData.words.length;
    const finalScore = Math.floor((correctAnswers / totalQuestions) * 100);

    setLoading(true);
    try {
      const result = await completeTypingGameStage({
        difficulty,
        stage: currentStage,
        score: finalScore,
        correctAnswers,
        totalQuestions,
        timeSpent,
      });

      if (result.data.success) {
        setGameState("completed");

        // 쿠폰 업데이트
        if (result.data.passed) {
          await updateUser({
            coupons: (userDoc?.coupons || 0) + result.data.reward,
          });
        }

        // 진행 상황 새로고침
        await loadProgress();
      } else {
        setError(result.data.message || "게임 완료 처리 실패");
        setGameState("completed");
      }
    } catch (error) {
      console.error("게임 완료 오류:", error);
      setError("게임 완료 처리 중 오류가 발생했습니다.");
      setGameState("completed");
    } finally {
      setLoading(false);
    }
  }, [stageData, gameStartTime, correctAnswers, difficulty, currentStage, completeTypingGameStage, updateUser, userDoc, loadProgress]);

  // 답안 확인
  const checkAnswer = useCallback(() => {
    if (!stageData || currentWordIndex >= stageData.words.length) return;

    const currentWord = stageData.words[currentWordIndex];
    const isCorrect = userInput.trim() === currentWord.korean;

    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      setScore(prev => prev + 10);
    } else {
      setWrongAnswers(prev => prev + 1);
    }

    // 다음 단어로 이동
    if (currentWordIndex + 1 < stageData.words.length) {
      setCurrentWordIndex(prev => prev + 1);
      setUserInput("");
    } else {
      // 모든 단어 완료
      handleGameEnd();
    }
  }, [stageData, currentWordIndex, handleGameEnd, userInput]);

  // 입력 처리
  const handleInputChange = useCallback((e) => {
    setUserInput(e.target.value);
  }, []);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      checkAnswer();
    }
  };

  // 초기 진행 상황 로드
  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  // 입력 포커스
  useEffect(() => {
    if (gameState === "playing" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [gameState, currentWordIndex]);

  // 메뉴 화면
  const renderMenu = () => (
    <div className="typing-game-menu">
      <div className="game-header">
        <h2>🎯 타자연습 게임</h2>
        <p>영어 단어의 올바른 한글 뜻을 입력하세요!</p>
        {onClose && <button className="close-btn" onClick={onClose}>✕</button>}
      </div>

      <div className="difficulty-selection">
        <h3>난이도 선택</h3>
        <div className="difficulty-cards">
          {Object.entries(difficultyConfig).map(([key, config]) => {
            const progressData = gameProgress?.difficulties?.find(d => d.difficulty === key);
            const maxCompleted = progressData?.progress?.maxStageCompleted || 0;
            const totalRewards = progressData?.progress?.totalRewardsEarned || 0;

            return (
              <div key={key} className="difficulty-card" style={{ borderColor: config.color }}>
                <div className="difficulty-header">
                  <h4 style={{ color: config.color }}>{config.name}</h4>
                  <span className="reward-badge">스테이지당 {config.reward}🎫</span>
                </div>

                <div className="difficulty-info">
                  <p>시간 제한: {config.timeLimit}초</p>
                  <p>통과 조건: 70% 이상 정답</p>
                  <p>완료 스테이지: {maxCompleted}/4</p>
                  <p>획득 쿠폰: {totalRewards}🎫</p>
                </div>

                <div className="stage-buttons">
                  {[1, 2, 3, 4].map(stage => {
                    const isUnlocked = stage === 1 || stage <= maxCompleted + 1;
                    const isCompleted = stage <= maxCompleted;

                    return (
                      <button
                        key={stage}
                        className={`stage-btn ${isCompleted ? "completed" : ""} ${!isUnlocked ? "locked" : ""}`}
                        disabled={!isUnlocked || loading}
                        onClick={() => startGame(key, stage)}
                      >
                        {isCompleted ? "✓" : ""} {stage}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // 게임 화면
  const renderGame = () => {
    if (!stageData || currentWordIndex >= stageData.words.length) {
      return <div className="loading">게임 로딩 중...</div>;
    }

    const currentWord = stageData.words[currentWordIndex];
    const progress = ((currentWordIndex) / stageData.words.length) * 100;

    return (
      <div className="typing-game-play">
        <div className="game-header">
          <div className="game-info">
            <span>{difficultyConfig[difficulty].name} - 스테이지 {currentStage}</span>
            <span>⏱️ {timeLeft}초</span>
            <span>📊 {correctAnswers}/{stageData.words.length}</span>
          </div>
          <button className="close-btn" onClick={() => setGameState("menu")}>← 메뉴</button>
        </div>

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>

        <div className="word-display">
          <div className="english-word">{currentWord.english}</div>
          <div className="word-counter">{currentWordIndex + 1} / {stageData.words.length}</div>
        </div>

        <div className="input-section">
          <input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="한글 뜻을 입력하고 Enter를 누르세요"
            className="word-input"
          />
        </div>

        <div className="score-display">
          <div className="score-item correct">✓ {correctAnswers}</div>
          <div className="score-item wrong">✗ {wrongAnswers}</div>
          <div className="score-item total">점수: {score}</div>
        </div>
      </div>
    );
  };

  // 완료 화면
  const renderCompleted = () => {
    const totalQuestions = stageData?.words.length || 0;
    const accuracy = totalQuestions > 0 ? ((correctAnswers / totalQuestions) * 100).toFixed(1) : 0;
    const passed = correctAnswers / totalQuestions >= 0.7;

    return (
      <div className="typing-game-completed">
        <div className="completion-header">
          <h2>{passed ? "🎉 스테이지 완료!" : "😅 아쉬워요!"}</h2>
          <p>{difficultyConfig[difficulty].name} 난이도 - 스테이지 {currentStage}</p>
        </div>

        <div className="results">
          <div className="result-card">
            <h3>결과</h3>
            <div className="result-stats">
              <div className="stat">
                <span className="label">정답률:</span>
                <span className="value">{accuracy}%</span>
              </div>
              <div className="stat">
                <span className="label">정답 수:</span>
                <span className="value">{correctAnswers}/{totalQuestions}</span>
              </div>
              <div className="stat">
                <span className="label">점수:</span>
                <span className="value">{score}점</span>
              </div>
              {passed && (
                <div className="stat reward">
                  <span className="label">획득 쿠폰:</span>
                  <span className="value">{difficultyConfig[difficulty].reward}🎫</span>
                </div>
              )}
            </div>
          </div>

          {!passed && (
            <div className="retry-message">
              <p>통과하려면 70% 이상의 정답률이 필요합니다.</p>
              <p>다시 도전해보세요!</p>
            </div>
          )}
        </div>

        <div className="completion-actions">
          <button
            className="menu-btn"
            onClick={() => setGameState("menu")}
          >
            메뉴로 돌아가기
          </button>

          <button
            className="retry-btn"
            onClick={() => startGame(difficulty, currentStage)}
          >
            다시 도전
          </button>

          {passed && currentStage < 4 && (
            <button
              className="next-btn"
              onClick={() => startGame(difficulty, currentStage + 1)}
            >
              다음 스테이지
            </button>
          )}
        </div>
      </div>
    );
  };

  // 로딩 화면
  if (loading) {
    return (
      <div className="typing-game-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  // 에러 화면
  if (error) {
    return (
      <div className="typing-game-container">
        <div className="error-screen">
          <h3>오류 발생</h3>
          <p>{error}</p>
          <button onClick={() => {
            setError("");
            setGameState("menu");
          }}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="typing-game-container">
      {gameState === "menu" && renderMenu()}
      {gameState === "playing" && renderGame()}
      {gameState === "completed" && renderCompleted()}
    </div>
  );
};

export default TypingPracticeGame;