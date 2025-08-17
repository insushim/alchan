// src/DonateCouponModal.js
import React, { useState } from "react";

export default function DonateCouponModal({
  showDonateModal,
  setShowDonateModal,
  currentCoupons,
  onDonate,
  userId,
  currentGoalId,
  classCode, // 🔥 학급 코드 추가
}) {
  const [donateAmount, setDonateAmount] = useState("");
  const [donateMessage, setDonateMessage] = useState("");
  const [isDonating, setIsDonating] = useState(false);

  const handleDonate = async () => {
    const amount = parseInt(donateAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      alert("올바른 쿠폰 수량을 입력해주세요.");
      return;
    }
    if (amount > currentCoupons) {
      alert("보유 쿠폰보다 많이 기부할 수 없습니다.");
      return;
    }

    setIsDonating(true);
    try {
      const success = await onDonate(amount, donateMessage);
      if (success) {
        // 🔥 학급별 localStorage 기부 내역 업데이트
        try {
          const goalHistoryKey = classCode
            ? `goalDonationHistory_${classCode}_goal`
            : `goalDonationHistory_${currentGoalId}`;

          const historyString = localStorage.getItem(goalHistoryKey);
          let currentHistory = historyString
            ? JSON.parse(historyString) || []
            : [];

          currentHistory.push({
            userId,
            amount,
            memo: donateMessage || "",
            timestamp: new Date().toISOString(),
          });

          localStorage.setItem(goalHistoryKey, JSON.stringify(currentHistory));
          console.log(
            `[DonateCouponModal] 기부 내역 localStorage 업데이트 완료: ${goalHistoryKey}`
          );
        } catch (localStorageErr) {
          console.error(
            "[DonateCouponModal] localStorage 기부 내역 동기화 오류:",
            localStorageErr
          );
        }

        setDonateAmount("");
        setDonateMessage("");
      }
    } catch (error) {
      console.error("[DonateCouponModal] 기부 처리 중 오류:", error);
      alert("기부 처리 중 오류가 발생했습니다.");
    } finally {
      setIsDonating(false);
    }
  };

  const handleClose = () => {
    if (!isDonating) {
      setShowDonateModal(false);
      setDonateAmount("");
      setDonateMessage("");
    }
  };

  if (!showDonateModal) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          width: "100%",
          maxWidth: "500px",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#f9fafb",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: "600",
              color: "#1f2937",
            }}
          >
            쿠폰 기부하기
            {classCode && (
              <span
                style={{
                  marginLeft: "8px",
                  fontSize: "14px",
                  backgroundColor: "#dbeafe",
                  color: "#1e40af",
                  padding: "4px 8px",
                  borderRadius: "12px",
                  fontWeight: "500",
                }}
              >
                {classCode}
              </span>
            )}
          </h3>
          <button
            onClick={handleClose}
            disabled={isDonating}
            style={{
              background: "none",
              border: "none",
              cursor: isDonating ? "not-allowed" : "pointer",
              fontSize: "20px",
              color: "#9ca3af",
              padding: "0",
              lineHeight: "1",
            }}
            aria-label="닫기"
          >
            &times;
          </button>
        </div>

        {/* 내용 */}
        <div style={{ padding: "20px" }}>
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#eef2ff",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid #c7d2fe",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#4338ca",
                }}
              >
                현재 보유 쿠폰
              </span>
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#4f46e5",
                }}
              >
                {currentCoupons.toLocaleString()} 개
              </span>
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                color: "#374151",
                marginBottom: "6px",
              }}
            >
              기부할 쿠폰 수량
            </label>
            <input
              type="number"
              min="1"
              max={currentCoupons}
              value={donateAmount}
              onChange={(e) => setDonateAmount(e.target.value)}
              disabled={isDonating}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "16px",
                backgroundColor: isDonating ? "#f9fafb" : "white",
                cursor: isDonating ? "not-allowed" : "text",
              }}
              placeholder="기부할 쿠폰 수량을 입력하세요"
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                color: "#374151",
                marginBottom: "6px",
              }}
            >
              기부 메시지 (선택사항)
            </label>
            <textarea
              value={donateMessage}
              onChange={(e) => setDonateMessage(e.target.value)}
              disabled={isDonating}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
                resize: "vertical",
                minHeight: "80px",
                backgroundColor: isDonating ? "#f9fafb" : "white",
                cursor: isDonating ? "not-allowed" : "text",
              }}
              placeholder="기부와 함께 전할 메시지를 입력하세요"
            />
          </div>

          {/* 예상 기부액 표시 */}
          {donateAmount && !isNaN(parseInt(donateAmount, 10)) && (
            <div
              style={{
                backgroundColor: "#f0fdf4",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid #bbf7d0",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#15803d",
                  }}
                >
                  기부 예정 쿠폰
                </span>
                <span
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    color: "#16a34a",
                  }}
                >
                  {parseInt(donateAmount, 10).toLocaleString()} 개
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div
          style={{
            padding: "16px 20px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <button
            onClick={handleClose}
            disabled={isDonating}
            style={{
              padding: "8px 16px",
              backgroundColor: "#e5e7eb",
              color: "#374151",
              border: "none",
              borderRadius: "6px",
              cursor: isDonating ? "not-allowed" : "pointer",
              fontWeight: "500",
              opacity: isDonating ? 0.6 : 1,
            }}
          >
            취소
          </button>
          <button
            onClick={handleDonate}
            disabled={
              isDonating ||
              !donateAmount ||
              isNaN(parseInt(donateAmount, 10)) ||
              parseInt(donateAmount, 10) <= 0 ||
              parseInt(donateAmount, 10) > currentCoupons
            }
            style={{
              padding: "8px 16px",
              backgroundColor:
                isDonating ||
                !donateAmount ||
                isNaN(parseInt(donateAmount, 10)) ||
                parseInt(donateAmount, 10) <= 0 ||
                parseInt(donateAmount, 10) > currentCoupons
                  ? "#9ca3af"
                  : "#4f46e5",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor:
                isDonating ||
                !donateAmount ||
                isNaN(parseInt(donateAmount, 10)) ||
                parseInt(donateAmount, 10) <= 0 ||
                parseInt(donateAmount, 10) > currentCoupons
                  ? "not-allowed"
                  : "pointer",
              fontWeight: "500",
            }}
          >
            {isDonating ? "기부 중..." : "기부하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
