// src/CouponGoal.js
import React from "react";

// 원형 프로그레스 컴포넌트
const CircularProgress = ({ percentage, size = 140, strokeWidth = 12, color, children }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* 배경 원 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />
        {/* 프로그레스 원 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      {/* 중앙 콘텐츠 */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default function CouponGoal({
  classCouponGoal,
  goalProgress,
  myContribution,
  currentCoupons,
  couponValue,
  setShowDonateModal,
  setShowSellCouponModal,
  setShowDonationHistoryModal,
  setShowGiftCouponModal,
  goalAchieved,
  resetGoalButton,
  isResettingGoal,
}) {
  const validClassCouponGoal =
    typeof classCouponGoal === "number" && classCouponGoal > 0
      ? classCouponGoal
      : 1;

  const goalPercentage = Math.min(
    Math.round((goalProgress / validClassCouponGoal) * 100),
    100
  );

  const myContributionPercentage =
    validClassCouponGoal > 0
      ? Math.min(Math.round((myContribution / validClassCouponGoal) * 100), 100)
      : 0;

  const mainColor = goalAchieved ? "#10b981" : "#6366f1";

  return (
    <div
      className="class-coupon-goal"
      style={{
        backgroundColor: "rgba(20, 20, 35, 0.6)",
        padding: "24px",
        borderRadius: "20px",
        boxShadow: goalAchieved
          ? "0 4px 20px rgba(16, 185, 129, 0.25)"
          : "0 4px 20px rgba(0, 255, 242, 0.15)",
        border: goalAchieved ? "2px solid #10b981" : "1px solid rgba(0, 255, 242, 0.2)",
        position: "relative",
        overflow: "hidden",
        backdropFilter: "blur(10px)",
      }}
    >
      {/* 배경 장식 */}
      <div
        style={{
          position: "absolute",
          top: "-50px",
          right: "-50px",
          width: "150px",
          height: "150px",
          background: goalAchieved
            ? "radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)",
          borderRadius: "50%",
        }}
      />

      {/* 헤더 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "28px" }}>🎯</span>
          <h3
            style={{
              fontSize: "20px",
              fontWeight: "700",
              color: "#e8e8ff",
              margin: 0,
              textShadow: "0 0 5px rgba(0, 255, 242, 0.5)",
            }}
          >
            학급 쿠폰 목표
          </h3>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {goalAchieved && (
            <span
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "white",
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: "700",
                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.4)",
                animation: "pulse 2s infinite",
              }}
            >
              🎉 목표 달성!
            </span>
          )}
          {resetGoalButton && (
            <button
              onClick={resetGoalButton}
              disabled={isResettingGoal}
              style={{
                backgroundColor: isResettingGoal ? "#9ca3af" : "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "12px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: isResettingGoal ? "not-allowed" : "pointer",
                opacity: isResettingGoal ? 0.7 : 1,
              }}
            >
              {isResettingGoal ? "초기화 중..." : "초기화"}
            </button>
          )}
        </div>
      </div>

      {/* 메인 프로그레스 영역 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "30px",
          padding: "20px 0",
          flexWrap: "wrap",
        }}
      >
        {/* 학급 목표 원형 프로그레스 */}
        <div style={{ textAlign: "center" }}>
          <CircularProgress
            percentage={goalPercentage}
            size={150}
            strokeWidth={14}
            color={mainColor}
          >
            <div style={{ fontSize: "32px", fontWeight: "800", color: mainColor }}>
              {goalPercentage}%
            </div>
            <div style={{ fontSize: "11px", color: "#a0a0c0", fontWeight: "500" }}>
              달성률
            </div>
          </CircularProgress>
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "22px", fontWeight: "800", color: "#e8e8ff" }}>
              {(goalProgress || 0).toLocaleString()}
              <span style={{ fontSize: "14px", color: "#a0a0c0", fontWeight: "500" }}> / {validClassCouponGoal.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>학급 전체 기부량</div>
          </div>
        </div>

        {/* 내 기여도 원형 프로그레스 */}
        <div style={{ textAlign: "center" }}>
          <CircularProgress
            percentage={myContributionPercentage}
            size={120}
            strokeWidth={10}
            color="#f59e0b"
          >
            <div style={{ fontSize: "24px", fontWeight: "800", color: "#f59e0b" }}>
              {myContributionPercentage}%
            </div>
            <div style={{ fontSize: "10px", color: "#a0a0c0", fontWeight: "500" }}>
              내 기여
            </div>
          </CircularProgress>
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "#e8e8ff" }}>
              {(myContribution || 0).toLocaleString()}
              <span style={{ fontSize: "12px", color: "#a0a0c0", fontWeight: "500" }}> 쿠폰</span>
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>내가 기부한 쿠폰</div>
          </div>
        </div>

        {/* 내 보유량 카드 */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(245, 158, 11, 0.2) 100%)",
            borderRadius: "16px",
            padding: "20px",
            textAlign: "center",
            minWidth: "130px",
            boxShadow: "0 4px 12px rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(251, 191, 36, 0.3)",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>🎫</div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#fbbf24", textShadow: "0 0 10px rgba(251, 191, 36, 0.3)" }}>
            {(currentCoupons || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: "12px", color: "#fcd34d", fontWeight: "600", marginTop: "4px" }}>
            보유 쿠폰
          </div>
          <div style={{ fontSize: "10px", color: "#fcd34d", marginTop: "8px", padding: "4px 8px", background: "rgba(0,0,0,0.3)", borderRadius: "8px" }}>
            1쿠폰 = {typeof couponValue === "number" ? couponValue.toLocaleString() : "0"}원
          </div>
        </div>
      </div>

      {/* 액션 버튼들 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "8px",
          marginTop: "20px",
        }}
      >
        <button
          onClick={() => setShowDonateModal(true)}
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            border: "none",
            borderRadius: "14px",
            padding: "14px 8px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 4px 12px rgba(99, 102, 241, 0.35)",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
        >
          <span style={{ fontSize: "22px" }}>💰</span>
          <span style={{ color: "#fff", fontSize: "12px", fontWeight: "700" }}>쿠폰 기부</span>
        </button>

        <button
          onClick={() => setShowSellCouponModal(true)}
          style={{
            background: "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
            border: "none",
            borderRadius: "14px",
            padding: "14px 8px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 4px 12px rgba(239, 68, 68, 0.35)",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
        >
          <span style={{ fontSize: "22px" }}>💵</span>
          <span style={{ color: "#fff", fontSize: "12px", fontWeight: "700" }}>쿠폰 판매</span>
        </button>

        <button
          onClick={() => setShowGiftCouponModal(true)}
          style={{
            background: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
            border: "none",
            borderRadius: "14px",
            padding: "14px 8px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.35)",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
        >
          <span style={{ fontSize: "22px" }}>🎁</span>
          <span style={{ color: "#fff", fontSize: "12px", fontWeight: "700" }}>쿠폰 선물</span>
        </button>

        <button
          onClick={() => setShowDonationHistoryModal(true)}
          style={{
            background: "linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)",
            border: "1px solid #d1d5db",
            borderRadius: "14px",
            padding: "14px 8px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "6px",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
        >
          <span style={{ fontSize: "22px" }}>📋</span>
          <span style={{ color: "#a0a0c0", fontSize: "12px", fontWeight: "700" }}>기부 내역</span>
        </button>
      </div>

      {/* 애니메이션 스타일 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .class-coupon-goal button:hover {
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
}
