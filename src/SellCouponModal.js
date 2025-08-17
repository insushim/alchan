// src/SellCouponModal.js
import React, { useState } from "react";

// 모달 배경 스타일
const modalBackdropStyle = {
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
};

// 모달 컨테이너 스타일
const modalContainerStyle = {
  backgroundColor: "white",
  padding: "20px",
  borderRadius: "8px",
  maxWidth: "500px",
  width: "90%",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
};

export default function SellCouponModal({
  showSellCouponModal,
  setShowSellCouponModal,
  currentCoupons = 0,
  couponValue = 1000,
  sellAmount = "",
  setSellAmount,
  // Dashboard 또는 MyAssets로부터 실제 판매 처리 함수를 props로 전달받습니다.
  // 이전 답변에서 언급했듯이, Dashboard.js에서는 <SellCouponModal SellCoupon={handleSellCoupon} ... /> 형태로 전달하고 있습니다.
  // 이 prop 이름을 그대로 사용합니다.
  SellCoupon, // 실제 판매 로직을 처리하는 함수 (Dashboard 또는 MyAssets 에서 전달받음)
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  // 모달이 표시되지 않을 때는 렌더링하지 않음
  if (!showSellCouponModal) return null;

  // 판매 금액 계산
  const calculateValue = () => {
    const amount = parseInt(sellAmount);
    if (!isNaN(amount) && amount > 0) {
      return amount * couponValue;
    }
    return 0;
  };

  // handleSubmit 함수에서 Dashboard의 handleSellCoupon (props로 전달받은 SellCoupon)을 호출합니다.
  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseInt(sellAmount);

    // 오류 메시지 초기화
    setError("");

    // 유효성 검사 추가
    if (!amount || isNaN(amount) || amount <= 0) {
      setError("유효한 쿠폰 수량을 입력해주세요.");
      return;
    }

    if (amount > currentCoupons) {
      setError("보유한 쿠폰보다 많은 수량을 판매할 수 없습니다.");
      return;
    }

    // SellCoupon prop이 함수인지 확인
    if (typeof SellCoupon !== "function") {
      setError("판매 처리 함수가 올바르게 전달되지 않았습니다.");
      console.error("SellCoupon prop is not a function:", SellCoupon);
      // 사용자에게 이 오류를 직접 알릴 수도 있습니다.
      // alert("판매 처리 중 시스템 오류가 발생했습니다. 관리자에게 문의하세요.");
      return;
    }

    setIsProcessing(true);

    try {
      // Dashboard 또는 MyAssets로부터 전달받은 SellCoupon 함수를 호출합니다.
      // Dashboard.js의 handleSellCoupon 함수는 내부적으로 sellAmount 상태를 사용하므로,
      // 해당 함수는 별도의 인자 없이 호출될 수 있습니다 (Dashboard.js 구현에 따름).
      await SellCoupon(); // Dashboard의 handleSellCoupon 또는 MyAssets의 handleSellCoupon 호출

      // 판매 성공 후의 처리는 Dashboard.js 또는 MyAssets.js의 handleSellCoupon 함수 내부에서
      // 모달을 닫고, sellAmount를 초기화하는 등의 작업을 수행할 것으로 기대합니다.
      // (예: setShowSellCouponModal(false); setSellAmount(""); 등을 해당 함수 내에서 호출)
      // 현재 Dashboard.js의 handleSellCoupon 함수는 성공 시 모달을 닫고 sellAmount를 초기화하도록 되어 있습니다.
    } catch (err) {
      console.error("판매 처리 중 예상치 못한 오류:", err);
      // err.message가 사용자에게 보여주기에 적절한 내용인지 확인 필요
      setError(
        err.message || "판매 처리 중 오류가 발생했습니다. 다시 시도해주세요."
      );
    } finally {
      setIsProcessing(false);
      // 성공/실패 여부와 관계없이 isProcessing 상태는 false로 변경
      // 성공 시 모달 닫기 및 입력 필드 초기화는 SellCoupon 함수가 담당
    }
  };

  const handleCancel = () => {
    setSellAmount("");
    setError("");
    setShowSellCouponModal(false);
  };

  // 판매 버튼 활성화 조건
  const isInvalidAmount =
    !sellAmount ||
    isNaN(parseInt(sellAmount)) ||
    parseInt(sellAmount) <= 0 ||
    parseInt(sellAmount) > currentCoupons;

  return (
    <div style={modalBackdropStyle} onClick={handleCancel}>
      <div style={modalContainerStyle} onClick={(e) => e.stopPropagation()}>
        <h3
          style={{
            fontSize: "18px",
            fontWeight: "600",
            marginBottom: "15px",
            color: "#1f2937",
          }}
        >
          쿠폰 판매하기
        </h3>
        <p
          style={{
            marginBottom: "10px",
            fontSize: "14px",
            color: "#4b5563",
          }}
        >
          쿠폰을 판매하고 현금으로 교환하세요.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "15px",
            padding: "10px",
            backgroundColor: "#f9fafb",
            borderRadius: "6px",
            fontSize: "15px",
          }}
        >
          <span>현재 보유 쿠폰:</span>
          <strong>{currentCoupons.toLocaleString()}</strong>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "15px",
            padding: "10px",
            backgroundColor: "#f9fafb",
            borderRadius: "6px",
            fontSize: "15px",
            color: "#4f46e5",
          }}
        >
          <span>1쿠폰 판매가:</span>
          <strong>{couponValue.toLocaleString()}원</strong>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "15px" }}>
            <label
              htmlFor="sellAmount"
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "500",
                color: "#374151",
              }}
            >
              판매할 쿠폰 수:
            </label>
            <input
              id="sellAmount"
              type="number"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              min="1"
              max={currentCoupons} // 최대값 설정
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
                outline: "none", // 포커스 시 기본 테두리 제거
              }}
              disabled={isProcessing}
              required // HTML5 기본 유효성 검사
            />
          </div>

          {/* 에러 메시지 표시 */}
          {error && (
            <div
              style={{
                backgroundColor: "#fee2e2", // 빨간색 배경
                border: "1px solid #fecaca", // 빨간색 테두리
                borderRadius: "6px",
                padding: "12px 15px",
                marginBottom: "15px",
                color: "#b91c1c", // 어두운 빨간색 텍스트
                fontSize: "14px",
              }}
            >
              <p style={{ margin: 0 }}>⚠️ {error}</p>
            </div>
          )}

          <div
            style={{
              marginBottom: "20px",
              padding: "10px 15px",
              backgroundColor: "#eef2ff", // 연한 파란색 배경
              borderRadius: "6px",
              borderLeft: "4px solid #4f46e5", // 파란색 왼쪽 테두리
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "16px",
                fontWeight: "600",
                color: "#1f2937", // 어두운 회색 텍스트
              }}
            >
              <span>예상 수령액:</span>
              <span style={{ color: "#4f46e5" /* 파란색 텍스트 */ }}>
                {calculateValue().toLocaleString()}원
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "20px",
            }}
          >
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: "8px 16px",
                backgroundColor: "#f3f4f6", // 연한 회색 배경
                color: "#4b5563", // 중간 회색 텍스트
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                cursor: "pointer",
                transition: "background-color 0.2s ease",
              }}
              disabled={isProcessing}
            >
              취소
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                backgroundColor: "#ef4444", // 빨간색 배경 (판매 버튼이므로)
                color: "white", // 흰색 텍스트
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                cursor:
                  isInvalidAmount || isProcessing ? "not-allowed" : "pointer", // 조건부 커서 변경
                opacity: isInvalidAmount || isProcessing ? 0.6 : 1, // 조건부 투명도
                transition: "background-color 0.2s ease, opacity 0.2s ease",
              }}
              disabled={isInvalidAmount || isProcessing} // 조건부 비활성화
            >
              {isProcessing ? "처리 중..." : "판매하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
