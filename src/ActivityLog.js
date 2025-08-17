import React, { useState } from "react";

export default function ActivityLog({ activities }) {
  const [activeTab, setActiveTab] = useState("all");

  // 활동 유형별 아이콘 매핑
  const activityIcons = {
    과제: "📝",
    참여: "👥",
    거래: "💰",
    할일: "✅",
    학습: "📚",
    기타: "📌",
  };

  // 활동 상태별 색상 매핑
  const statusColors = {
    완료: "#10b981",
    진행중: "#f59e0b",
    예정: "#6b7280",
    취소: "#ef4444",
  };

  // 탭 전환 핸들러
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  // 활동 필터링
  const filteredActivities = activities.filter((activity) => {
    if (activeTab === "all") return true;
    return activity.type === activeTab;
  });

  // 활동 유형별 개수 계산
  const activityCounts = activities.reduce((acc, activity) => {
    acc[activity.type] = (acc[activity.type] || 0) + 1;
    return acc;
  }, {});

  // 고유한 활동 유형 추출
  const uniqueTypes = [...new Set(activities.map((activity) => activity.type))];

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "10px",
        border: "2px solid #8b5cf6", // 보라색 테두리
        overflow: "hidden",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
        marginTop: "20px",
      }}
    >
      <div
        style={{
          backgroundColor: "#8b5cf6", // 보라색 헤더
          color: "white",
          padding: "10px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div style={{ fontWeight: "600", fontSize: "16px" }}>나의 활동</div>
      </div>

      {/* 탭 메뉴 */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
          overflowX: "auto", // 스크롤 기능 추가
          whiteSpace: "nowrap", // 탭이 많을 경우 줄바꿈 방지
        }}
      >
        <button
          onClick={() => handleTabChange("all")}
          style={{
            padding: "10px 15px",
            backgroundColor: activeTab === "all" ? "#ffffff" : "transparent",
            border: "none",
            borderBottom: activeTab === "all" ? "2px solid #8b5cf6" : "none",
            color: activeTab === "all" ? "#8b5cf6" : "#6b7280",
            fontWeight: activeTab === "all" ? "600" : "400",
            cursor: "pointer",
          }}
        >
          전체 ({activities.length})
        </button>

        {uniqueTypes.map((type) => (
          <button
            key={type}
            onClick={() => handleTabChange(type)}
            style={{
              padding: "10px 15px",
              backgroundColor: activeTab === type ? "#ffffff" : "transparent",
              border: "none",
              borderBottom: activeTab === type ? "2px solid #8b5cf6" : "none",
              color: activeTab === type ? "#8b5cf6" : "#6b7280",
              fontWeight: activeTab === type ? "600" : "400",
              cursor: "pointer",
            }}
          >
            {type} ({activityCounts[type] || 0})
          </button>
        ))}
      </div>

      {/* 활동 목록 */}
      <div
        style={{
          maxHeight: "380px",
          overflowY: "auto",
          padding: "0 10px",
        }}
      >
        {filteredActivities.length > 0 ? (
          filteredActivities.map((activity) => (
            <div
              key={activity.id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 5px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  backgroundColor: "rgba(139, 92, 246, 0.1)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  marginRight: "12px",
                }}
              >
                {activityIcons[activity.type] || "📋"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: "500" }}>
                  {activity.title}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginTop: "2px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span>{activity.date}</span>
                  <span
                    style={{
                      display: "inline-block",
                      width: "4px",
                      height: "4px",
                      borderRadius: "50%",
                      backgroundColor: "#d1d5db",
                      margin: "0 6px",
                    }}
                  ></span>
                  <span>{activity.type}</span>
                </div>
              </div>
              <div
                style={{
                  fontSize: "12px",
                  padding: "4px 8px",
                  borderRadius: "12px",
                  backgroundColor: `${
                    statusColors[activity.status] || "#6b7280"
                  }20`,
                  color: statusColors[activity.status] || "#6b7280",
                  fontWeight: "500",
                }}
              >
                {activity.status}
              </div>
            </div>
          ))
        ) : (
          <div
            style={{
              padding: "30px 0",
              textAlign: "center",
              color: "#6b7280",
              fontSize: "14px",
            }}
          >
            활동 내역이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
