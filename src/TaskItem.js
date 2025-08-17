// src/TaskItem.js
import React, { useState, useEffect } from "react";

export default function TaskItem({
  task,
  onEarnCoupon,
  isJobTask,
  isAdmin,
  onEditTask,
  onDeleteTask,
}) {
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState("");

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
      onEarnCoupon();
    } else {
      console.warn("onEarnCoupon prop is not a function in TaskItem");
    }
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

  const taskItemActionsStyle = {
    display: "flex",
    alignItems: "center", // 버튼 세로 정렬
    gap: "5px", // 버튼 사이 간격
    flexWrap: "wrap", // 공간 부족 시 줄 바꿈 허용
    justifyContent: "flex-end", // 버튼을 오른쪽으로 정렬 (선택 사항)
    flexShrink: 0, // 버튼 영역이 줄어들지 않도록 함 (선택 사항)
  };

  return (
    // 최상위 부모 태그 (하나만 존재해야 함)
    <div
      style={{
        backgroundColor: isCompleted ? "#e0e7ff" : "#ffffff",
        borderRadius: "8px",
        cursor: isCompleted ? "default" : "pointer",
        transition: "all 0.2s ease",
        border: `1px solid ${isCompleted ? "#c7d2fe" : "#e5e7eb"}`,
        display: "flex",
        flexDirection: "column", // 세로 방향 유지
        position: "relative",
        opacity: isCompleted ? 0.6 : 1,
        padding: "10px 12px",
        marginBottom: "8px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
      onClick={isCompleted ? null : handleInternalClick}
    >
      {/* 1. 윗줄: 할일 이름 */}
      <div style={{ marginBottom: "8px" }}>
        {" "}
        {/* 이름과 아랫줄 사이 간격 */}
        <span
          style={{
            color: "#374151",
            fontWeight: "500",
            fontSize: "14px",
            wordBreak: "break-word", // 자연스러운 줄바꿈 허용
            lineHeight: "1.4", // 줄 간격 조정 (선택 사항)
          }}
          title={task.name}
        >
          {task.name}
        </span>
      </div>{" "}
      {/* 여기가 109번째 줄 근처입니다 */}
      {/* 2. 아랫줄: 보상 및 버튼 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "auto" /* marginTop: auto 로 아래에 붙임 */,
        }}
      >
        {/* 쿠폰 보상 */}
        <span>
          {" "}
          {/* 빈 span 또는 내용있는 span으로 왼쪽 공간 차지 */}
          {task.reward > 0 && (
            <span
              style={{
                backgroundColor: isJobTask ? "#4f46e5" : "#10b981",
                color: "white",
                padding: "3px 8px",
                borderRadius: "12px",
                fontSize: "12px",
                fontWeight: "500",
                whiteSpace: "nowrap",
              }}
            >
              +{task.reward} 쿠폰
            </span>
          )}
          {/* 보상이 0일 때 빈 공간 유지 또는 다른 내용 표시 가능 */}
          {task.reward <= 0 && (
            <span style={{ visibility: "hidden", fontSize: "12px" }}>-</span>
          )}
        </span>
        {/* 관리자 버튼 */}
        {isAdmin && (
          <div style={taskItemActionsStyle}>
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
          </div>
        )}
      </div>
      {/* 진행도 바 */}
      {task.maxClicks > 0 && (
        <div style={{ ...progressWrapperStyle, marginTop: "8px" }}>
          {" "}
          {/* 아랫줄과의 간격 추가 */}
          <div
            style={{
              ...progressBarBaseStyle,
              width: `${Math.min((task.clicks / task.maxClicks) * 100, 100)}%`,
              backgroundColor: isCompleted
                ? "#a5b4fc"
                : isJobTask
                ? "#6366f1"
                : "#10b981",
            }}
          ></div>
        </div>
      )}
      {/* 쿠폰 획득 알림 말풍선 */}
      {showBubble && (
        <div style={bubbleStyle}>
          {bubbleText}
          <div style={bubbleTailStyle}></div>
        </div>
      )}
    </div> // 최상위 부모 태그 닫힘
  );
}

// --- 스타일 정의 (변경 없음) ---
const adminButtonStyles = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "2px",
  fontSize: "14px",
  color: "#6b7280",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const progressWrapperStyle = {
  height: "5px",
  backgroundColor: "#e5e7eb",
  borderRadius: "3px",
  overflow: "hidden",
  // marginTop은 위에서 조건부로 적용
};
const progressBarBaseStyle = {
  height: "100%",
  transition: "width 0.3s ease-in-out, background-color 0.3s ease",
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
