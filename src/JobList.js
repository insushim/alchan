import React from "react";
import TaskItem from "./TaskItem"; // TaskItem 컴포넌트 임포트 필요

// props로 jobs 배열 대신 job 객체를 받도록 수정
export default function JobList({
  job, // 직업 객체 데이터 (상위 컴포넌트에서 prop으로 전달)
  isAdmin, // 관리자 여부 (상위 컴포넌트에서 prop으로 전달)
  onEditJob, // 직업 수정 핸들러 (관리자 모드)
  onDeleteJob, // 직업 삭제 핸들러 (관리자 모드) <-- 누락된 prop 추가
  onAddTask, // 해당 직업에 할일 추가 핸들러 (관리자 모드)
  onEditTask, // 할일 수정 핸들러
  onDeleteTask, // 할일 삭제 핸들러
  onEarnCoupon, // 쿠폰 획득 핸들러
  addJobTaskButtonStyle, // Dashboard에서 전달받는 버튼 스타일 <-- 스타일 prop 추가
}) {
  // job 객체가 유효하지 않으면 아무것도 렌더링하지 않음 (오류 방지)
  if (!job) {
    return null;
  }

  const isMobile = window.innerWidth <= 768;

  return (
    <div
      key={job.id} // 상위에서 map을 사용하므로 여기서 key는 필수 X, 식별용으로 유지
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "10px",
        border: "2px solid #4f46e5",
        overflow: "hidden",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
        marginBottom: "15px",
        display: "flex", // Flexbox 레이아웃 사용
        flexDirection: "column", // 세로 방향 배치
        height: "100%", // 부모 그리드 셀 높이 채우기 (선택 사항)
      }}
    >
      {/* 직업 헤더 - 시인성 개선 */}
      <div
        className="job-header-container"
        style={{
          background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
          padding: isMobile ? "12px 14px" : "14px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "none",
        }}
      >
        <div
          className="job-title-text"
          style={{
            fontWeight: "700",
            fontSize: isMobile ? "15px" : "18px",
            textShadow: "0 1px 3px rgba(0,0,0,0.2)",
            letterSpacing: "-0.01em",
            color: "#ffffff", // 흰색 텍스트
          }}
        >
          {job.title}
        </div>
        {/* 관리자 모드에서 직업 수정/삭제 버튼 */}
        {isAdmin && (
          <div>
            <button
              onClick={() => onEditJob(job.id)} // job.id 전달 확인
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "white",
                marginRight: "8px",
                padding: "0",
              }}
              aria-label={`${job.title} 직업 수정`}
            >
              ✏️
            </button>
            <button
              onClick={() => onDeleteJob(job.id)} // job.id 전달 확인
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "white",
                padding: "0",
              }}
              aria-label={`${job.title} 직업 삭제`}
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      {/* 직업 할일 목록 (flex-grow로 남은 공간 채우기) */}
      <div style={{ padding: isMobile ? "8px" : "10px", flexGrow: 1, overflowY: "auto" }}>
        {job.tasks && job.tasks.length > 0 ? (
          job.tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              taskId={task.id}
              jobId={job.id}
              // 핸들러에 task.id 전달 확인
              onEarnCoupon={onEarnCoupon}
              onEditTask={() => onEditTask(task.id, job.id)} // Dashboard 핸들러 형식에 맞게 job.id 전달
              onDeleteTask={() => onDeleteTask(task.id, job.id)} // Dashboard 핸들러 형식에 맞게 job.id 전달
              isAdmin={isAdmin}
              isJobTask={true}
            />
          ))
        ) : (
          <p
            style={{
              fontSize: "13px",
              color: "#6b7280",
              textAlign: "center",
              margin: "10px 0",
            }}
          >
            등록된 할일이 없습니다.
          </p>
        )}
      </div>

      {/* 관리자 모드에서 할일 추가 버튼 (하단 고정 영역) */}
      {isAdmin && (
        <div style={{ padding: isMobile ? "8px" : "10px", borderTop: "1px solid #e5e7eb" }}>
          <button
            onClick={onAddTask} // Dashboard에서 job.id 포함하여 생성된 핸들러 전달
            // --- 인라인 스타일 대신 전달받은 스타일 적용 ---
            style={
              addJobTaskButtonStyle || {
                /* 기본 스타일 (선택 사항) */ width: "100%",
                padding: isMobile ? "6px" : "8px",
                backgroundColor: "#eef2ff",
                border: "1px solid #c7d2fe",
                color: "#4f46e5",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: isMobile ? "12px" : "13px",
                fontWeight: "500",
                marginTop: "0", // 위쪽 마진 제거
              }
            }
          >
            + 이 직업에 할일 추가
          </button>
        </div>
      )}
    </div>
  );
}
