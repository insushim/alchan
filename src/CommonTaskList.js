import React from "react";
import TaskItem from "./TaskItem"; // TaskItem 컴포넌트 임포트 확인

// props에서 commonTasks 대신 tasks를 받도록 수정
export default function CommonTaskList({
  tasks, // prop 이름을 'tasks'로 변경
  isAdmin,
  onEditTask, // 수정 핸들러 prop 추가 (Dashboard에서 전달 필요)
  onDeleteTask, // 삭제 핸들러 prop 추가 (Dashboard에서 전달 필요)
  onEarnCoupon, // 쿠폰 획득 핸들러 prop 추가 (Dashboard에서 전달 필요)
  // handleTaskClick는 TaskItem 내부에서 onEarnCoupon 등으로 대체 가능하므로 제거 고려
  // handleAddTaskClick는 컴포넌트 외부(Dashboard)에서 버튼 관리하므로 제거
}) {
  // tasks가 배열이 아니거나 비어있는 경우 표시할 내용
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>공통 할 일</div>
        </div>
        <div style={{ padding: "20px", textAlign: "center", color: "#6b7280" }}>
          {isAdmin
            ? "등록된 공통 할일이 없습니다. 관리자 설정에서 추가해주세요."
            : "현재 수행할 수 있는 공통 할일이 없습니다."}
        </div>
        {/* 관리자용 추가 버튼은 Dashboard에서 관리하므로 여기서는 제거 */}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>공통 할 일</div>
        {/* 관리자용 추가 버튼은 Dashboard에서 관리하므로 여기서는 제거 */}
      </div>

      <div style={styles.listContainer}>
        {/* commonTasks 대신 tasks를 사용 */}
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            taskId={task.id}
            onEarnCoupon={onEarnCoupon}
            onEditTask={() => onEditTask(task.id)} // task.id 전달
            onDeleteTask={() => onDeleteTask(task.id)} // task.id 전달
            isAdmin={isAdmin}
            isJobTask={false} // 공통 할일임을 명시
          />
        ))}
      </div>
    </div>
  );
}

// 스타일 객체 추가 (코드 가독성 향상)
const styles = {
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "10px",
    border: "2px solid #10b981", // 공통 할일 테두리 색상
    overflow: "hidden",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
    marginBottom: "20px", // 컴포넌트 하단 마진 추가 (Dashboard에서 sectionContainer 사용 시 불필요할 수 있음)
  },
  header: {
    backgroundColor: "#10b981", // 공통 할일 헤더 색상
    color: "white",
    padding: "10px 12px",
    display: "flex",
    justifyContent: "space-between", // 버튼 제거로 space-between 불필요 시 center 또는 flex-start
    alignItems: "center",
    borderBottom: "1px solid #e5e7eb",
  },
  headerTitle: {
    fontWeight: "600",
    fontSize: "14px",
  },
  listContainer: {
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
};
