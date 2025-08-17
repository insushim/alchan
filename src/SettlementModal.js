// src/SettlementModal.js
import React, { useState, useEffect } from "react";

const SettlementModal = ({ complaint, users, onSave, onCancel }) => {
  const [senderId, setSenderId] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState("");

  // 모달이 열릴 때 기본값 설정 (예: 피고소인 -> 고소인)
  useEffect(() => {
    if (complaint) {
      setSenderId(complaint.defendantId || "");
      setRecipientId(complaint.complainantId || "");
    }
  }, [complaint]);

  const handleSaveClick = () => {
    // onSave 핸들러는 성공 시 true, 실패 시 false를 반환하도록 가정
    const success = onSave(complaint.id, amount, senderId, recipientId);
    // 성공했을 경우에만 입력 필드 초기화 (선택적)
    // if (success) {
    //   setAmount("");
    // }
  };

  // 금액 입력 시 숫자만 받도록 처리 (간단 버전)
  const handleAmountChange = (e) => {
    const value = e.target.value;
    // 숫자만 허용 (빈 문자열 허용)
    if (/^\d*$/.test(value)) {
      setAmount(value);
    }
  };

  // 사용자 목록을 <option>으로 변환
  const userOptions = users.map((user) => (
    <option key={user.id} value={user.id}>
      {user.name} (ID: {user.id.slice(0, 6)})
    </option>
  ));

  return (
    <div className="edit-modal-overlay">
      {" "}
      {/* 기존 오버레이 재활용 */}
      <div className="settlement-modal-container">
        {" "}
        {/* 모달 컨테이너 스타일 적용 */}
        <h3 className="settlement-modal-header">
          합의금 지급 (사건번호: {complaint.id.slice(-6)})
        </h3>
        <div className="settlement-modal-content">
          {/* 보내는 사람 선택 */}
          <div className="form-group">
            <label htmlFor="senderSelect" className="form-label">
              보내는 사람 (Sender)
            </label>
            <select
              id="senderSelect"
              className="form-select"
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
            >
              <option value="">-- 선택 --</option>
              {userOptions}
            </select>
          </div>

          {/* 받는 사람 선택 */}
          <div className="form-group">
            <label htmlFor="recipientSelect" className="form-label">
              받는 사람 (Recipient)
            </label>
            <select
              id="recipientSelect"
              className="form-select"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
            >
              <option value="">-- 선택 --</option>
              {userOptions}
            </select>
          </div>

          {/* 금액 입력 */}
          <div className="form-group">
            <label htmlFor="amountInput" className="form-label">
              금액 (Amount)
            </label>
            <input
              type="text" // type="number" 대신 text 사용 (숫자 외 입력 방지 로직 추가)
              inputMode="numeric" // 모바일에서 숫자 키패드 표시
              id="amountInput"
              className="form-input"
              placeholder="지급할 금액 입력 (숫자만)"
              value={amount}
              onChange={handleAmountChange}
            />
          </div>
        </div>
        <div className="settlement-modal-actions">
          <button onClick={onCancel} className="cancel-button">
            취소
          </button>
          <button onClick={handleSaveClick} className="save-button">
            지급하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettlementModal;
