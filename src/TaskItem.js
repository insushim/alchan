// src/TaskItem.js
import React, { useState, useEffect } from "react";
import { generateJobTaskReward } from "./utils/jobTaskRewards";

export default function TaskItem({
  task,
  onEarnCoupon,
  isJobTask,
  isAdmin,
  onEditTask,
  onDeleteTask,
  taskId, // taskId prop 추가
  jobId = null, // jobId prop 추가 (직업 할일일 경우)
}) {
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const [showCardModal, setShowCardModal] = useState(false);
  const [rewardData, setRewardData] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [isFlipping, setIsFlipping] = useState(false);

  const handleInternalClick = () => {
    if (
      !task ||
      typeof task.clicks !== "number" ||
      typeof task.maxClicks !== "number" ||
      typeof task.reward !== "number"
    ) {
      console.error("Invalid task prop:", task);
      return;
    }
    if (task.maxClicks > 0 && task.clicks >= task.maxClicks) {
      return;
    }

    // 직업 할일인 경우 카드 선택 모달 표시
    if (isJobTask) {
      const rewards = generateJobTaskReward();
      setRewardData(rewards);
      setSelectedCard(null);
      setIsFlipping(false);
      setShowCardModal(true);
    } else {
      // 공통 할일은 기존 방식 유지
      const currentClicks = task.clicks;
      const maxClicks = task.maxClicks > 0 ? task.maxClicks : 1;
      const remainingClicksAfterClick = maxClicks - (currentClicks + 1);
      const gainedCouponText =
        task.reward > 0 ? `+${task.reward} 쿠폰 획득! 😊` : "완료! 😊";
      const remainingText =
        maxClicks <= 1
          ? ""
          : remainingClicksAfterClick > 0
          ? `(오늘 ${remainingClicksAfterClick}번 남음)`
          : "(오늘 할당량 완료!)";
      setBubbleText(`${gainedCouponText} ${remainingText}`.trim());
      setShowBubble(true);

      if (typeof onEarnCoupon === "function") {
        onEarnCoupon(taskId || task.id, null, false);
      } else {
        console.warn("onEarnCoupon prop is not a function in TaskItem");
      }
    }
  };

  const handleCardSelect = (cardType) => {
    if (isFlipping || selectedCard) return;

    setSelectedCard(cardType);
    setIsFlipping(true);

    // 800ms 후 보상 적용
    setTimeout(() => {
      const reward = cardType === "cash" ? rewardData.cash : rewardData.coupon;
      const rewardText = cardType === "cash" ? `${reward.toLocaleString()}원` : `${reward}개`;

      // onEarnCoupon 호출 - taskId, jobId, isJobTask, cardType, reward 전달
      if (typeof onEarnCoupon === "function") {
        onEarnCoupon(taskId || task.id, jobId, isJobTask, cardType, reward);
      }

      setShowCardModal(false);
      setBubbleText(`${cardType === "cash" ? "💰 현금" : "🎫 쿠폰"} ${rewardText} 획득! 😊`);
      setShowBubble(true);
      setIsFlipping(false);
    }, 800);
  };

  useEffect(() => {
    let timer;
    if (showBubble) {
      timer = setTimeout(() => {
        setShowBubble(false);
        setBubbleText("");
      }, 2000);
    }
    return () => clearTimeout(timer);
  }, [showBubble]);

  const isCompleted =
    task && task.maxClicks > 0 && task.clicks >= task.maxClicks;

  if (!task) return null;

  const taskItemStyle = {
    backgroundColor: isCompleted ? "#e0e7ff" : "#ffffff",
    borderRadius: "8px",
    cursor: isCompleted ? "default" : "pointer",
    transition: "all 0.2s ease",
    border: `1px solid ${isCompleted ? "#c7d2fe" : "#e5e7eb"}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
    opacity: isCompleted ? 0.6 : 1,
    padding: "12px",
    marginBottom: "8px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  };

  const taskInfoStyle = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexGrow: 1,
    minWidth: 0,
  };

  const taskNameStyle = {
    color: "#374151",
    fontWeight: "600",
    fontSize: "16px",
    wordBreak: "break-word",
    lineHeight: "1.4",
  };

  const taskActionsStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  };

  const couponStyle = {
    backgroundColor: isJobTask ? "#4f46e5" : "#10b981",
    color: "white",
    padding: "4px 10px",
    borderRadius: "12px",
    fontSize: "13px",
    fontWeight: "500",
    whiteSpace: "nowrap",
  };

  const renderCardModal = () => {
    if (!showCardModal || !rewardData) return null;

    return (
      <div style={modalOverlayStyle} onClick={() => setShowCardModal(false)}>
        <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
          <h3 style={modalTitleStyle}>🎁 보상 선택</h3>
          <p style={modalSubtitleStyle}>두 개의 카드 중 하나를 선택하세요!</p>

          <div style={cardsContainerStyle}>
            {/* 현금 카드 */}
            <div
              style={{
                ...cardStyle,
                ...(selectedCard === "cash" && selectedCardStyle),
              }}
              onClick={() => !selectedCard && handleCardSelect("cash")}
            >
              <div style={{
                ...cardInnerStyle,
                transform: selectedCard === "cash" ? "rotateY(180deg)" : "rotateY(0deg)",
              }}>
                <div style={cardFrontStyle}>
                  <div style={cardIconStyle}>💰</div>
                  <div style={cardTextStyle}>현금</div>
                </div>
                <div style={{...cardBackStyle, ...(selectedCard === "cash" && cardBackVisibleStyle)}}>
                  <div style={rewardAmountStyle}>{rewardData.cash.toLocaleString()}원</div>
                  <div style={rewardLabelStyle}>💰 현금 획득!</div>
                </div>
              </div>
            </div>

            {/* 쿠폰 카드 */}
            <div
              style={{
                ...cardStyle,
                ...(selectedCard === "coupon" && selectedCardStyle),
              }}
              onClick={() => !selectedCard && handleCardSelect("coupon")}
            >
              <div style={{
                ...cardInnerStyle,
                transform: selectedCard === "coupon" ? "rotateY(180deg)" : "rotateY(0deg)",
              }}>
                <div style={cardFrontStyle}>
                  <div style={cardIconStyle}>🎫</div>
                  <div style={cardTextStyle}>쿠폰</div>
                </div>
                <div style={{...cardBackStyle, ...(selectedCard === "coupon" && cardBackVisibleStyle)}}>
                  <div style={rewardAmountStyle}>{rewardData.coupon}개</div>
                  <div style={rewardLabelStyle}>🎫 쿠폰 획득!</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        style={taskItemStyle}
        onClick={isCompleted ? null : handleInternalClick}
      >
        <div style={taskInfoStyle}>
          <span style={taskNameStyle} title={task.name}>
            {task.name}
          </span>
        </div>

        <div style={taskActionsStyle}>
          {task.reward > 0 && !isJobTask && (
            <span style={couponStyle}>
              +{task.reward} 쿠폰
            </span>
          )}
          {isJobTask && (
            <span style={couponStyle}>
              🎁 랜덤보상
            </span>
          )}

          {isAdmin && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTask();
                }}
                style={adminButtonStyles}
                aria-label="할일 수정"
              >
                ✏️
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTask();
                }}
                style={adminButtonStyles}
                aria-label="할일 삭제"
              >
                🗑️
              </button>
            </>
          )}
        </div>

        {showBubble && (
          <div style={bubbleStyle}>
            {bubbleText}
            <div style={bubbleTailStyle}></div>
          </div>
        )}
      </div>

      {renderCardModal()}
    </>
  );
}

const adminButtonStyles = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "4px",
  fontSize: "16px",
  color: "#6b7280",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const bubbleStyle = {
  position: "absolute",
  bottom: "calc(100% + 8px)",
  left: "50%",
  transform: "translateX(-50%)",
  backgroundColor: "rgba(0, 0, 0, 0.75)",
  color: "white",
  padding: "5px 10px",
  borderRadius: "6px",
  fontSize: "12px",
  fontWeight: "500",
  whiteSpace: "nowrap",
  zIndex: 10,
  pointerEvents: "none",
  boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
};

const bubbleTailStyle = {
  content: '""',
  position: "absolute",
  top: "100%",
  left: "50%",
  marginLeft: "-5px",
  borderWidth: "5px",
  borderStyle: "solid",
  borderColor: "rgba(0, 0, 0, 0.75) transparent transparent transparent",
};

// 카드 모달 스타일
const modalOverlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10000,
  animation: "fadeIn 0.3s ease",
};

const modalContentStyle = {
  backgroundColor: "white",
  borderRadius: "20px",
  padding: "40px",
  maxWidth: "600px",
  width: "90%",
  boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)",
  animation: "zoomIn 0.3s ease",
};

const modalTitleStyle = {
  fontSize: "28px",
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: "10px",
  color: "#333",
};

const modalSubtitleStyle = {
  fontSize: "16px",
  textAlign: "center",
  color: "#666",
  marginBottom: "30px",
};

const cardsContainerStyle = {
  display: "flex",
  gap: "20px",
  justifyContent: "center",
  flexWrap: "wrap",
};

const cardStyle = {
  width: "200px",
  height: "280px",
  perspective: "1000px",
  cursor: "pointer",
  transition: "transform 0.2s ease",
};

const selectedCardStyle = {
  transform: "scale(1.05)",
};

const cardInnerStyle = {
  position: "relative",
  width: "100%",
  height: "100%",
  transition: "transform 0.8s",
  transformStyle: "preserve-3d",
};

const cardFrontStyle = {
  position: "absolute",
  width: "100%",
  height: "100%",
  backfaceVisibility: "hidden",
  backgroundColor: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  borderRadius: "15px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)",
  border: "3px solid #fff",
};

const cardBackStyle = {
  position: "absolute",
  width: "100%",
  height: "100%",
  backfaceVisibility: "hidden",
  backgroundColor: "#fff",
  borderRadius: "15px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)",
  border: "3px solid #667eea",
  transform: "rotateY(180deg)",
  opacity: 0,
  transition: "opacity 0.3s ease 0.4s",
};

const cardBackVisibleStyle = {
  opacity: 1,
};

const cardIconStyle = {
  fontSize: "80px",
  marginBottom: "20px",
};

const cardTextStyle = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "white",
};

const rewardAmountStyle = {
  fontSize: "36px",
  fontWeight: "bold",
  color: "#667eea",
  marginBottom: "10px",
};

const rewardLabelStyle = {
  fontSize: "18px",
  color: "#666",
};