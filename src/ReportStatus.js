// src/ReportStatus.js
import React, { useState } from "react";

const ReportStatus = ({
  reports,
  onProcessReport,
  onSettlement,
  reportReasons,
  formatDate,
  onAcceptReport,
  onDismissReport,
  isAdminView,
}) => {
  // 처리 모달 상태
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [processingAmount, setProcessingAmount] = useState("");
  const [processingReason, setProcessingReason] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementReason, setSettlementReason] = useState("");

  // 처리 모달 열기
  const openProcessModal = (report) => {
    // 법안 기반 신고인 경우 기본 금액 설정
    const defaultAmount = getDefaultAmount(report.reason);

    setSelectedReport(report);
    setProcessingAmount(defaultAmount !== null ? defaultAmount.toString() : "");
    setProcessingReason("");
    setShowProcessModal(true);
  };

  // 합의 모달 열기
  const openSettlementModal = (report) => {
    setSelectedReport(report);
    setSettlementAmount("");
    setSettlementReason("");
    setShowSettlementModal(true);
  };

  // 신고 사유의 기본 금액 조회
  const getDefaultAmount = (reason) => {
    const reasonInfo = reportReasons.find((r) => r.reason === reason);
    return reasonInfo ? reasonInfo.amount : null;
  };

  // 모달 필드 변경 핸들러
  const handleProcessingAmountChange = (e) => {
    // 숫자만 입력 허용
    const value = e.target.value.replace(/[^0-9]/g, "");
    setProcessingAmount(value);
  };

  const handleSettlementAmountChange = (e) => {
    // 숫자만 입력 허용
    const value = e.target.value.replace(/[^0-9]/g, "");
    setSettlementAmount(value);
  };

  // 처리 제출 핸들러
  const handleProcessSubmit = () => {
    if (selectedReport) {
      const amount = processingAmount ? parseInt(processingAmount, 10) : 0;
      onProcessReport(selectedReport.id, amount, processingReason);
      closeModals();
    }
  };

  // 합의 제출 핸들러
  const handleSettlementSubmit = () => {
    if (selectedReport) {
      const amount = settlementAmount ? parseInt(settlementAmount, 10) : 0;
      if (amount <= 0) {
        alert("유효한 합의금액을 입력해주세요.");
        return;
      }
      onSettlement(selectedReport.id, amount, settlementReason);
      closeModals();
    }
  };

  // 모달 닫기
  const closeModals = () => {
    setShowProcessModal(false);
    setShowSettlementModal(false);
    setSelectedReport(null);
    setProcessingAmount("");
    setProcessingReason("");
    setSettlementAmount("");
    setSettlementReason("");
  };

  // 필터링: '접수됨' 상태와 '제출됨' 상태 분리
  const acceptedReports = reports.filter((r) => r.status === "accepted");
  const submittedReports = reports.filter((r) => r.status === "submitted");

  // 법안 이름 강조 함수
  const highlightLawName = (reason) => {
    if (reason.startsWith("[법안]")) {
      return <span className="law-reason-highlight">{reason}</span>;
    }
    return reason;
  };

  return (
    <div className="report-status-container">
      <h2 className="section-title">신고 처리 현황</h2>

      {reports.length === 0 ? (
        <div className="empty-state">처리 중인 신고가 없습니다.</div>
      ) : (
        <>
          {/* 접수된 신고 섹션 */}
          {acceptedReports.length > 0 && (
            <div className="status-section">
              <h3 className="subsection-title">
                접수된 신고 ({acceptedReports.length})
              </h3>
              <div className="report-list">
                {acceptedReports.map((report) => (
                  <div
                    key={report.id}
                    className={`report-item ${
                      report.isLawReport ? "law-report" : ""
                    }`}
                  >
                    <div className="report-header">
                      <span className="report-id">
                        사건번호: {report.id.slice(-6)}
                      </span>
                      <span className="report-date">
                        접수일: {formatDate(report.acceptanceDate)}
                      </span>
                    </div>
                    <div className="report-content">
                      <p>
                        <strong>신고자:</strong> {report.reporterName}
                      </p>
                      <p>
                        <strong>대상:</strong> {report.reportedUserName}
                      </p>
                      <p className="report-reason">
                        <strong>사유:</strong> {highlightLawName(report.reason)}
                      </p>
                      {report.description && (
                        <p className="report-description">
                          <strong>설명:</strong> {report.description}
                        </p>
                      )}
                      {report.details && (
                        <p>
                          <strong>상세:</strong> {report.details}
                        </p>
                      )}
                    </div>

                    {isAdminView && (
                      <div className="report-actions">
                        <button
                          onClick={() => openProcessModal(report)}
                          className="action-button process-button"
                        >
                          벌금 처리
                        </button>
                        <button
                          onClick={() => openSettlementModal(report)}
                          className="action-button settlement-button"
                        >
                          합의 처리
                        </button>
                        <button
                          onClick={() => onDismissReport(report.id)}
                          className="action-button dismiss-button"
                        >
                          반려
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 제출된 신고 섹션 */}
          {submittedReports.length > 0 && (
            <div className="status-section">
              <h3 className="subsection-title">
                제출된 신고 ({submittedReports.length})
              </h3>
              <div className="report-list">
                {submittedReports.map((report) => (
                  <div
                    key={report.id}
                    className={`report-item ${
                      report.isLawReport ? "law-report" : ""
                    }`}
                  >
                    <div className="report-header">
                      <span className="report-id">
                        사건번호: {report.id.slice(-6)}
                      </span>
                      <span className="report-date">
                        제출일: {formatDate(report.submitDate)}
                      </span>
                    </div>
                    <div className="report-content">
                      <p>
                        <strong>신고자:</strong> {report.reporterName}
                      </p>
                      <p>
                        <strong>대상:</strong> {report.reportedUserName}
                      </p>
                      <p className="report-reason">
                        <strong>사유:</strong> {highlightLawName(report.reason)}
                      </p>
                      {report.description && (
                        <p className="report-description">
                          <strong>설명:</strong> {report.description}
                        </p>
                      )}
                      {report.details && (
                        <p>
                          <strong>상세:</strong> {report.details}
                        </p>
                      )}
                    </div>

                    {isAdminView && (
                      <div className="report-actions">
                        <button
                          onClick={() => onAcceptReport(report.id)}
                          className="action-button accept-button"
                        >
                          접수
                        </button>
                        <button
                          onClick={() => onDismissReport(report.id)}
                          className="action-button dismiss-button"
                        >
                          반려
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 벌금 처리 모달 */}
      {showProcessModal && selectedReport && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h2>벌금 처리</h2>
              <button className="close-button" onClick={closeModals}>
                &times;
              </button>
            </div>
            <div className="modal-content">
              <div className="report-summary">
                <p>
                  <strong>사건번호:</strong> {selectedReport.id.slice(-6)}
                </p>
                <p>
                  <strong>대상자:</strong> {selectedReport.reportedUserName}
                </p>
                <p className="report-reason">
                  <strong>신고 사유:</strong> {selectedReport.reason}
                </p>
                {selectedReport.description && (
                  <p className="law-description">
                    <strong>설명:</strong> {selectedReport.description}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="processingAmount">벌금 금액 (원)</label>
                <input
                  type="text"
                  id="processingAmount"
                  value={processingAmount}
                  onChange={handleProcessingAmountChange}
                  placeholder="벌금 금액을 입력하세요"
                  className="form-input"
                />
                {getDefaultAmount(selectedReport.reason) !== null && (
                  <p className="form-hint">
                    기본 금액:{" "}
                    {getDefaultAmount(selectedReport.reason).toLocaleString()}원
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="processingReason">처리 사유 (선택)</label>
                <textarea
                  id="processingReason"
                  value={processingReason}
                  onChange={(e) => setProcessingReason(e.target.value)}
                  placeholder="처리 사유를 입력하세요 (선택사항)"
                  className="form-textarea"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-button cancel" onClick={closeModals}>
                취소
              </button>
              <button
                className="modal-button process"
                onClick={handleProcessSubmit}
              >
                처리
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 합의 처리 모달 */}
      {showSettlementModal && selectedReport && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h2>합의 처리</h2>
              <button className="close-button" onClick={closeModals}>
                &times;
              </button>
            </div>
            <div className="modal-content">
              <div className="report-summary">
                <p>
                  <strong>사건번호:</strong> {selectedReport.id.slice(-6)}
                </p>
                <p>
                  <strong>신고자:</strong> {selectedReport.reporterName}
                </p>
                <p>
                  <strong>대상자:</strong> {selectedReport.reportedUserName}
                </p>
                <p>
                  <strong>신고 사유:</strong> {selectedReport.reason}
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="settlementAmount">합의금 금액 (원)</label>
                <input
                  type="text"
                  id="settlementAmount"
                  value={settlementAmount}
                  onChange={handleSettlementAmountChange}
                  placeholder="합의금 금액을 입력하세요"
                  className="form-input"
                />
                <p className="form-hint">
                  합의 처리 시 대상자({selectedReport.reportedUserName})에게서
                  신고자({selectedReport.reporterName})에게 합의금이 지급됩니다.
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="settlementReason">합의 사유 (선택)</label>
                <textarea
                  id="settlementReason"
                  value={settlementReason}
                  onChange={(e) => setSettlementReason(e.target.value)}
                  placeholder="합의 사유를 입력하세요 (선택사항)"
                  className="form-textarea"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-button cancel" onClick={closeModals}>
                취소
              </button>
              <button
                className="modal-button settlement"
                onClick={handleSettlementSubmit}
                disabled={!settlementAmount}
              >
                합의 처리
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportStatus;
