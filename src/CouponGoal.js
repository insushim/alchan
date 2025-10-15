// src/CouponGoal.js
import React from "react";

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
    goalProgress > 0 ? Math.round((myContribution / goalProgress) * 100) : 0;

  return (
    <div
      className="class-coupon-goal"
      style={{
        paddingBottom: "15px",
        borderBottom: "1px solid #e5e7eb",
        marginBottom: "15px",
        backgroundColor: "#ffffff",
        padding: "20px",
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        border: goalAchieved ? "2px solid #10b981" : "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <h3
          style={{
            fontSize: "16px",
            fontWeight: "600",
            color: "#1f2937",
            margin: 0,
          }}
        >
          쿠폰 목표
        </h3>

        {/* --- 목표 초기화 버튼 (관리자에게만 표시) --- */}
        {resetGoalButton && (
          <button
            onClick={resetGoalButton} // 🔥 바로 props로 받은 함수를 호출하도록 수정
            disabled={isResettingGoal}
            style={{
              backgroundColor: isResettingGoal ? "#9ca3af" : "#ef4444", // 비활성화 시 회색, 활성화 시 빨간색
              color: "white",
              border: "none",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "12px",
              fontWeight: "500",
              cursor: isResettingGoal ? "not-allowed" : "pointer",
              opacity: isResettingGoal ? 0.7 : 1,
            }}
            title="현재 목표와 기부 내역을 모두 초기화합니다."
          >
            {isResettingGoal ? "초기화 중..." : "목표 초기화"}
          </button>
        )}
        {/* --- 목표 초기화 버튼 끝 --- */}

        {goalAchieved && (
          <span
            style={{
              backgroundColor: "#ecfdf5",
              color: "#10b981",
              padding: "4px 8px",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
            }}
          >
            목표 달성! 🎉
          </span>
        )}
      </div>

      <div className="goal-info">
        <div
          className="goal-numbers"
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "13px",
            color: "#4b5563",
            marginBottom: "5px",
          }}
        >
          <div className="goal-current">현재: {goalProgress || 0} 쿠폰</div>
          <div className="goal-target">목표: {validClassCouponGoal} 쿠폰</div>
        </div>

        <div
          className="goal-progress-container"
          style={{
            backgroundColor: "#e5e7eb",
            height: "18px",
            borderRadius: "9px",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            className="goal-progress-bar"
            style={{
              width: `${goalPercentage}%`,
              height: "100%",
              backgroundColor: goalAchieved ? "#10b981" : "#4f46e5",
              transition: "width 0.3s ease, background-color 0.3s ease",
            }}
          >
            <span
              className="goal-progress-text"
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                color: "white",
                fontWeight: "bold",
                fontSize: "11px",
                textShadow: "0 1px 1px rgba(0,0,0,0.25)",
              }}
            >
              {goalPercentage}%
            </span>
          </div>
        </div>

        <div style={{ marginTop: "12px", marginBottom: "5px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "13px",
              color: "#4b5563",
              marginBottom: "5px",
            }}
          >
            <div>내 기여도: {myContribution || 0} 쿠폰</div>
            <div>전체 기여율: {myContributionPercentage}%</div>
          </div>
          <div
            style={{
              height: "8px",
              backgroundColor: "#e5e7eb",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${myContributionPercentage}%`,
                height: "100%",
                backgroundColor: "#a5b4fc",
                borderRadius: "4px",
                transition: "width 0.5s ease",
              }}
            />
          </div>
        </div>

        <div className="my-contribution" style={{ marginTop: "15px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "13px",
              color: "#4b5563",
              marginBottom: "10px",
            }}
          >
            <div>현재 보유량: {currentCoupons || 0} 쿠폰</div>
            <div>
              1쿠폰 ={" "}
              {typeof couponValue === "number"
                ? couponValue.toLocaleString()
                : "0"}
              원
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
              gap: "8px",
              alignItems: "start",
            }}
          >
            <button
              className="donate-coupon-button"
              onClick={() => setShowDonateModal(true)}
              style={{
                backgroundColor: "#4f46e5",
                color: "white",
                border: "none",
                borderRadius: "6px",
                padding: "6px 8px",
                fontSize: "13px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "background-color 0.2s ease",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: "18px", marginBottom: "2px" }}>💰</span>
              <span>쿠폰 기부</span>
            </button>

            <button
              className="sell-coupon-button"
              onClick={() => setShowSellCouponModal(true)}
              style={{
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "6px",
                padding: "6px 8px",
                fontSize: "13px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "background-color 0.2s ease",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: "18px", marginBottom: "2px" }}>💵</span>
              <span>쿠폰 판매</span>
            </button>

            <button
              className="gift-coupon-button"
              onClick={() => setShowGiftCouponModal(true)}
              style={{
                backgroundColor: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "6px",
                padding: "6px 8px",
                fontSize: "13px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "background-color 0.2s ease",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: "18px", marginBottom: "2px" }}>🎁</span>
              <span>쿠폰 선물</span>
            </button>

            <button
              className="view-donation-history-button"
              onClick={() => setShowDonationHistoryModal(true)}
              style={{
                backgroundColor: "#f3f4f6",
                color: "#4b5563",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                padding: "6px 8px",
                fontSize: "13px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "background-color 0.2s ease",
                textAlign: "center",
              }}
            >
              기부 내역
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}