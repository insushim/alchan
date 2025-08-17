// AdminCommonTaskSettings.js
import React, { useEffect, useState } from "react";
import {
  setupTaskResetTimer,
  manualResetAllTaskCounts,
  checkAndResetOnAppStart,
} from "./TaskResetService";

export default function AdminCommonTaskSettings({
  commonTasks,
  handleEditTask,
  handleDeleteTask,
  handleAddTaskClick,
  classCode, // 현재 학급 코드
}) {
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState(null);

  // 컴포넌트 마운트 시 앱 시작 초기화 확인 및 타이머 설정
  useEffect(() => {
    // 앱 시작 시 초기화 확인
    const checkInitialReset = async () => {
      try {
        const result = await checkAndResetOnAppStart();
        if (
          result.success &&
          result.message !==
            "오늘은 이미 초기화되었거나 초기화 시간이 아닙니다."
        ) {
          setResetMessage({
            type: "info",
            text: result.message,
          });

          // 메시지 3초 후 자동 제거
          setTimeout(() => setResetMessage(null), 3000);
        }
      } catch (error) {
        console.error("초기화 확인 중 오류:", error);
      }
    };

    checkInitialReset();

    // 다음 오전 8시 초기화 타이머 설정
    const resetTimerId = setupTaskResetTimer((result) => {
      // 자동 초기화 완료 후 메시지 표시
      if (result.success) {
        setResetMessage({
          type: "success",
          text: "모든 할일 횟수가 자동으로 초기화되었습니다.",
        });
      } else {
        setResetMessage({
          type: "error",
          text: "할일 자동 초기화 중 오류가 발생했습니다.",
        });
      }

      // 메시지 3초 후 자동 제거
      setTimeout(() => setResetMessage(null), 3000);
    });

    // 컴포넌트 언마운트 시 타이머 제거
    return () => {
      if (resetTimerId) {
        clearTimeout(resetTimerId);
      }
    };
  }, []);

  // 관리자의 수동 초기화 처리
  const handleResetTaskCounts = async () => {
    if (window.confirm("모든 학생의 할일 횟수를 초기화하시겠습니까?")) {
      setIsResetting(true);
      try {
        const result = await manualResetAllTaskCounts(classCode);

        setResetMessage({
          type: result.success ? "success" : "error",
          text: result.message,
        });

        // 메시지 3초 후 자동 제거
        setTimeout(() => setResetMessage(null), 3000);
      } catch (error) {
        console.error("할일 초기화 중 오류:", error);
        setResetMessage({
          type: "error",
          text: "할일 초기화 중 오류가 발생했습니다.",
        });
      } finally {
        setIsResetting(false);
      }
    }
  };

  // 버튼 스타일 정의
  const smallButtonStyle = {
    padding: "4px 8px",
    fontSize: "12px",
    marginLeft: "5px",
    cursor: "pointer",
    borderRadius: "4px",
    border: "1px solid #d1d5db",
  };

  const editButtonStyle = {
    ...smallButtonStyle,
    backgroundColor: "#e0e7ff",
    color: "#4338ca",
    borderColor: "#a5b4fc",
  };

  const deleteButtonStyle = {
    ...smallButtonStyle,
    backgroundColor: "#fee2e2",
    color: "#991b1b",
    borderColor: "#fca5a5",
  };

  const addButtonStyle = {
    padding: "8px 14px",
    fontSize: "14px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "#4f46e5",
    color: "white",
    cursor: "pointer",
    fontWeight: "500",
    transition: "background-color 0.2s ease",
  };

  const resetButtonStyle = {
    padding: "8px 14px",
    fontSize: "14px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: isResetting ? "#9ca3af" : "#ef4444",
    color: "white",
    cursor: isResetting ? "default" : "pointer",
    fontWeight: "500",
    transition: "background-color 0.2s ease",
    marginLeft: "10px",
    opacity: isResetting ? 0.7 : 1,
  };

  const messageStyle = {
    padding: "8px 12px",
    marginBottom: "16px",
    borderRadius: "4px",
    fontSize: "14px",
  };

  const messageStyles = {
    success: {
      ...messageStyle,
      backgroundColor: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
    },
    error: {
      ...messageStyle,
      backgroundColor: "#fee2e2",
      color: "#991b1b",
      border: "1px solid #fca5a5",
    },
    info: {
      ...messageStyle,
      backgroundColor: "#eff6ff",
      color: "#1e40af",
      border: "1px solid #bfdbfe",
    },
  };

  return (
    <div>
      {/* 초기화 메시지 표시 */}
      {resetMessage && (
        <div style={messageStyles[resetMessage.type]}>{resetMessage.text}</div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h4
          style={{
            marginTop: 0,
            marginBottom: 0,
            color: "#1f2937",
            fontSize: "18px",
          }}
        >
          공통 할일 목록
        </h4>
        <div>
          {/* 공통 할일 추가 버튼 */}
          <button
            onClick={() => handleAddTaskClick(null, false)}
            style={addButtonStyle}
          >
            + 새 공통 할일 추가
          </button>

          {/* 할일 횟수 초기화 버튼 */}
          <button
            onClick={handleResetTaskCounts}
            style={resetButtonStyle}
            disabled={isResetting}
            title="모든 학생의 할일 횟수를 초기화합니다"
          >
            {isResetting ? "초기화 중..." : "할일 횟수 초기화"}
          </button>
        </div>
      </div>

      {/* 공통 할일 목록 표시 */}
      {(!commonTasks || commonTasks.length === 0) && (
        <p
          style={{
            color: "#6b7280",
            textAlign: "center",
            padding: "20px 0",
            border: "1px dashed #d1d5db",
            borderRadius: "8px",
          }}
        >
          등록된 공통 할일이 없습니다.
        </p>
      )}

      {commonTasks && commonTasks.length > 0 && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            backgroundColor: "#f9fafb",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "14px",
                    color: "#374151",
                  }}
                >
                  할일 내용
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "center",
                    fontSize: "14px",
                    color: "#374151",
                  }}
                >
                  보상
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "center",
                    fontSize: "14px",
                    color: "#374151",
                  }}
                >
                  최대 클릭
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "right",
                    fontSize: "14px",
                    color: "#374151",
                  }}
                >
                  작업
                </th>
              </tr>
            </thead>
            <tbody>
              {commonTasks.map((task) => (
                <tr key={task.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontSize: "14px",
                      color: "#4b5563",
                    }}
                  >
                    {task.name}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontSize: "14px",
                      color: "#4b5563",
                      textAlign: "center",
                    }}
                  >
                    {task.reward}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontSize: "14px",
                      color: "#4b5563",
                      textAlign: "center",
                    }}
                  >
                    {task.maxClicks}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <button
                      onClick={() => handleEditTask(task.id, null)}
                      style={editButtonStyle}
                      title="할일 수정"
                    >
                      <span
                        role="img"
                        aria-label="edit"
                        style={{
                          display: "inline-block",
                          width: "16px",
                          height: "16px",
                        }}
                      >
                        ✏️
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `"${task.name}" 할일을 정말 삭제하시겠습니까?`
                          )
                        ) {
                          handleDeleteTask(task.id, null);
                        }
                      }}
                      style={deleteButtonStyle}
                      title="할일 삭제"
                    >
                      <span
                        role="img"
                        aria-label="delete"
                        style={{
                          display: "inline-block",
                          width: "16px",
                          height: "16px",
                        }}
                      >
                        🗑️
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
