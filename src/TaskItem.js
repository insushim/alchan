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

  return (
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
        {task.reward > 0 && (
          <span style={couponStyle}>
            +{task.reward} 쿠폰
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