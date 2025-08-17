import React from "react";

export default function TransferModal({
  showTransferModal,
  setShowTransferModal,
  recipients, // 받는 사람 목록 (Dashboard에서 전달)
  transferRecipient, // 받는 사람 ID 상태 (Dashboard에서 전달)
  setTransferRecipient, // 받는 사람 ID 설정 함수 (Dashboard에서 전달)
  transferAmount, // 송금액 상태 (Dashboard에서 전달)
  setTransferAmount, // 송금액 설정 함수 (Dashboard에서 전달)
  handleTransfer, // 송금 처리 함수 (Dashboard에서 전달)
  userId, // 현재 사용자 ID (Dashboard에서 전달)
  userCash, // 현재 사용자 보유 현금 (Dashboard에서 전달)
}) {
  if (!showTransferModal) {
    return null;
  }

  // recipients prop 기본값 처리
  const validRecipients = recipients ?? [];

  // 모달 닫기 및 상태 초기화 함수
  const closeModal = () => {
    setShowTransferModal(false);
    if (typeof setTransferRecipient === "function") {
      setTransferRecipient("");
    }
    if (typeof setTransferAmount === "function") {
      setTransferAmount("");
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
      onClick={closeModal} // 배경 클릭 시 모달 닫기
    >
      <div
        className="transfer-modal"
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          width: "90%",
          maxWidth: "400px",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()} // 모달 내부 클릭 시 닫힘 방지
      >
        <h3 style={{ marginTop: 0, color: "#374151" }}>송금하기</h3>
        <div style={{ marginBottom: "16px", color: "#6b7280" }}>
          {/* 현재 보유 현금 표시 (선택 사항) */}
          <p>
            현재 보유 현금:{" "}
            <strong>{(userCash || 0).toLocaleString()}원</strong>
          </p>
        </div>
        <div className="form-group" style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "500",
              color: "#4b5563",
            }}
          >
            받는 사람
          </label>
          <select
            value={transferRecipient}
            onChange={(e) =>
              typeof setTransferRecipient === "function"
                ? setTransferRecipient(e.target.value)
                : console.error("setTransferRecipient is not a function")
            }
            style={{
              width: "100%",
              padding: "10px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
            }}
          >
            <option value="">받는 분을 선택하세요</option>
            {/* --- 수정된 부분 --- */}
            {validRecipients
              .filter((recipient) => recipient.id !== userId) // 본인 제외
              .map((recipient) => (
                <option key={recipient.id} value={recipient.id}>
                  {recipient.name} ({recipient.id})
                </option>
              ))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "500",
              color: "#4b5563",
            }}
          >
            금액 (원)
          </label>
          <input
            type="number"
            value={transferAmount}
            onChange={(e) =>
              typeof setTransferAmount === "function"
                ? setTransferAmount(e.target.value)
                : console.error("setTransferAmount is not a function")
            }
            placeholder="송금할 금액을 입력하세요"
            style={{
              width: "100%",
              padding: "10px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
            }}
            min="1" // 최소 송금액
            max={userCash || 0} // 최대 송금액 (보유 현금)
          />
        </div>
        <div
          className="modal-actions"
          style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
        >
          <button
            className="cancel-button"
            onClick={closeModal} // 취소 버튼
            style={{
              padding: "8px 16px",
              backgroundColor: "#f3f4f6",
              color: "#4b5563",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            취소
          </button>
          <button
            className="confirm-button"
            onClick={handleTransfer} // 송금 실행 함수 호출
            disabled={
              !transferRecipient ||
              !transferAmount ||
              parseInt(transferAmount) <= 0 ||
              parseInt(transferAmount) > (userCash || 0)
            } // 보유 현금 초과 시 비활성화
            style={{
              padding: "8px 16px",
              backgroundColor: "#6366f1",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontWeight: "500",
              fontSize: "14px",
              cursor:
                !transferRecipient ||
                !transferAmount ||
                parseInt(transferAmount) <= 0 ||
                parseInt(transferAmount) > (userCash || 0)
                  ? "not-allowed"
                  : "pointer",
              opacity:
                !transferRecipient ||
                !transferAmount ||
                parseInt(transferAmount) <= 0 ||
                parseInt(transferAmount) > (userCash || 0)
                  ? 0.7
                  : 1,
            }}
          >
            송금
          </button>
        </div>
      </div>
    </div>
  );
}
