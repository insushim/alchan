// src/ReportStatus.js
import React, { useState, useEffect } from "react";

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
  // 탭 상태 추가
  const [activeTab, setActiveTab] = useState("submitted"); // "submitted" 또는 "accepted"

  // 처리 모달 상태 (벌금 처리 전용)
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [processingAmount, setProcessingAmount] = useState("");
  const [processingReason, setProcessingReason] = useState("");

  // 처리 모달 열기
  const openProcessModal = (report) => {
    // 먼저 report 객체가 유효한지 확인
    if (!report) {
      return;
    }

    // 기본값 설정
    let defaultAmount = "";
    if (Array.isArray(reportReasons) && reportReasons.length > 0) {
      const reasonInfo = reportReasons.find((r) => r.reason === report.reason);
      if (reasonInfo && typeof reasonInfo.amount === 'number') {
        defaultAmount = reasonInfo.amount.toString();
      }
    }

    // 상태 업데이트
    setSelectedReport(report);
    setProcessingAmount(defaultAmount);
    setProcessingReason("");
    setShowProcessModal(true);
  };

  // 합의 처리 버튼 핸들러
  const handleSettlementClick = (report) => {
    
    if (!onSettlement) {
      console.error("onSettlement 함수가 전달되지 않았습니다");
      alert("합의 처리 기능을 사용할 수 없습니다. 관리자에게 문의하세요.");
      return;
    }
    
    if (!report) {
      console.error("handleSettlementClick: report가 없습니다");
      return;
    }
    
    try {
      onSettlement(report);
    } catch (error) {
      console.error("합의 처리 중 오류:", error);
      alert("합의 처리 중 오류가 발생했습니다.");
    }
  };

  // 신고 사유의 기본 금액 조회
  const getDefaultAmount = (reason) => {
    if (!Array.isArray(reportReasons)) return null;
    const reasonInfo = reportReasons.find((r) => r.reason === reason);
    return reasonInfo ? reasonInfo.amount : null;
  };

  // 모달 필드 변경 핸들러
  const handleProcessingAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    setProcessingAmount(value);
  };

  // 처리 제출 핸들러
  const handleProcessSubmit = () => {
    if (!selectedReport) {
      return;
    }

    if (!onProcessReport) {
      alert("벌금 처리 기능을 사용할 수 없습니다.");
      return;
    }

    const amount = processingAmount ? parseInt(processingAmount, 10) : 0;

    try {
      onProcessReport(selectedReport.id, amount, processingReason);
      closeModals();
    } catch (error) {
      console.error("벌금 처리 중 오류:", error);
      alert("벌금 처리 중 오류가 발생했습니다.");
    }
  };

  // 모달 닫기
  const closeModals = () => {
    setShowProcessModal(false);
    setSelectedReport(null);
    setProcessingAmount("");
    setProcessingReason("");
  };

  // 필터링: '접수됨' 상태와 '제출됨' 상태 분리
  const acceptedReports = reports.filter((r) => r.status === "accepted");
  const submittedReports = reports.filter((r) => r.status === "submitted");

  // 법안 이름 강조 함수
  const highlightLawName = (reason) => {
    if (reason && reason.startsWith("[법안]")) {
      return <span className="law-reason-highlight">{reason}</span>;
    }
    return reason;
  };

  // 벌금 처리 모달 컴포넌트 (Portal 대신 직접 렌더링)
  const ProcessReportModal = React.useMemo(() => {
    if (!showProcessModal || !selectedReport) return null;

    return () => (
      <div 
        className="modal-overlay" 
        onClick={(e) => {
          if (e.target.className === "modal-overlay") {
            closeModals();
          }
        }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999, // 매우 높은 z-index 설정
          backdropFilter: 'blur(5px)'
        }}
      >
        <div
          className="process-modal-container modal-container"
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto',
            position: 'relative',
            zIndex: 100000 // 오버레이보다 더 높은 z-index
          }}
        >
          <div className="modal-header" style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            borderBottom: '1px solid #e0e0e0',
            padding: '20px 25px 15px',
            marginBottom: '20px'
          }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#333' }}>
              벌금 처리 (사건번호: {selectedReport?.id?.slice(-6) || '없음'})
            </h2>
            <button 
              className="close-button" 
              onClick={closeModals}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.8rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: '#888',
                padding: 0,
                lineHeight: 1
              }}
            >
              &times;
            </button>
          </div>
          
          <div className="modal-content" style={{ padding: '0 25px', marginBottom: '25px' }}>
            <div className="report-summary" style={{
              backgroundColor: '#f8f9fa',
              border: '1px solid #e9ecef',
              borderRadius: '8px',
              padding: '15px',
              marginBottom: '20px',
              fontSize: '0.9rem'
            }}>
              <p style={{ margin: '5px 0' }}>
                <strong>사건번호:</strong> {selectedReport?.id?.slice(-6) || '없음'}
              </p>
              <p style={{ margin: '5px 0' }}>
                <strong>대상자:</strong> {selectedReport?.reportedUserName || '알 수 없음'}
              </p>
              <p className="report-reason" style={{ margin: '5px 0' }}>
                <strong>신고 사유:</strong> {selectedReport?.reason || '알 수 없음'}
              </p>
              {selectedReport?.description && (
                <p className="law-description" style={{ margin: '5px 0' }}>
                  <strong>설명:</strong> {selectedReport.description}
                </p>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label htmlFor="processingAmount" style={{
                display: 'block',
                fontWeight: '500',
                color: '#444',
                marginBottom: '8px'
              }}>
                벌금 금액 (원)
              </label>
              <input
                type="text"
                id="processingAmount"
                value={processingAmount}
                onChange={handleProcessingAmountChange}
                placeholder="벌금 금액을 입력하세요 (0원은 경고)"
                className="form-input"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
              {getDefaultAmount(selectedReport?.reason) !== null && (
                <p className="form-hint" style={{
                  fontSize: '0.85rem',
                  color: '#666',
                  marginTop: '5px'
                }}>
                  기본 금액: {getDefaultAmount(selectedReport?.reason)?.toLocaleString()}원
                </p>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label htmlFor="processingReason" style={{
                display: 'block',
                fontWeight: '500',
                color: '#444',
                marginBottom: '8px'
              }}>
                처리 사유 (선택)
              </label>
              <textarea
                id="processingReason"
                value={processingReason}
                onChange={(e) => setProcessingReason(e.target.value)}
                placeholder="처리 사유를 입력하세요 (선택사항)"
                className="form-textarea"
                rows="3"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
              />
            </div>

            {reportReasons && reportReasons.length > 0 && (
              <div className="quick-reasons" style={{ marginTop: '15px' }}>
                <p style={{ fontWeight: '500', marginBottom: '10px' }}>빠른 선택:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {reportReasons.map((reasonItem, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setProcessingAmount(reasonItem.amount.toString());
                        setProcessingReason(reasonItem.reason);
                      }}
                      style={{
                        padding: '5px 10px',
                        fontSize: '0.8rem',
                        border: '1px solid #007bff',
                        backgroundColor: 'white',
                        color: '#007bff',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      {reasonItem.reason} ({reasonItem.amount.toLocaleString()}원)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="modal-footer" style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            padding: '15px 25px 20px',
            borderTop: '1px solid #e0e0e0'
          }}>
            <button 
              className="modal-button cancel" 
              onClick={closeModals}
              style={{
                padding: '10px 20px',
                fontSize: '0.95rem',
                fontWeight: '500',
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: 'white',
                color: '#444',
                cursor: 'pointer'
              }}
            >
              취소
            </button>
            <button
              className="modal-button process"
              onClick={handleProcessSubmit}
              style={{
                padding: '10px 20px',
                fontSize: '0.95rem',
                fontWeight: '500',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: '#dc3545',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              처리 완료
            </button>
          </div>
        </div>
      </div>
    );
  }, [showProcessModal, selectedReport, processingAmount, processingReason, reportReasons]);

  return (
    <div className="report-status-container">
      <h2 className="section-title">신고 처리 현황</h2>

      {/* 탭 버튼 */}
      <div className="tabs-container" style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '20px',
        borderBottom: '2px solid #e0e0e0'
      }}>
        <button
          onClick={() => setActiveTab("submitted")}
          className={`tab-button ${activeTab === "submitted" ? "active" : ""}`}
          style={{
            padding: '10px 20px',
            fontSize: '1rem',
            fontWeight: activeTab === "submitted" ? '600' : '400',
            border: 'none',
            borderBottom: activeTab === "submitted" ? '3px solid #007bff' : '3px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === "submitted" ? '#007bff' : '#666',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          제출된 신고 ({submittedReports.length})
        </button>
        <button
          onClick={() => setActiveTab("accepted")}
          className={`tab-button ${activeTab === "accepted" ? "active" : ""}`}
          style={{
            padding: '10px 20px',
            fontSize: '1rem',
            fontWeight: activeTab === "accepted" ? '600' : '400',
            border: 'none',
            borderBottom: activeTab === "accepted" ? '3px solid #007bff' : '3px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === "accepted" ? '#007bff' : '#666',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          접수된 신고 ({acceptedReports.length})
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="empty-state">처리 중인 신고가 없습니다.</div>
      ) : (
        <>
          {/* 접수된 신고 탭 */}
          {activeTab === "accepted" && (
            <div className="status-section">
              <div className="report-list">
                {acceptedReports.length === 0 ? (
                  <div className="empty-state">접수된 신고가 없습니다.</div>
                ) : (
                  acceptedReports.map((report) => (
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
                            onClick={() => {
                              console.log("벌금 처리 버튼 클릭됨:", report);
                              openProcessModal(report);
                            }}
                            className="action-button process-button fine-button"
                          >
                            벌금 처리
                          </button>
                          <button
                            onClick={() => {
                              console.log("합의 처리 버튼 클릭됨:", report);
                              handleSettlementClick(report);
                            }}
                            className="action-button settlement-button"
                          >
                            합의 처리
                          </button>
                          <button
                            onClick={() => {
                              console.log("반려 버튼 클릭됨:", report.id);
                              if (onDismissReport) {
                                onDismissReport(report.id);
                              } else {
                                console.error("onDismissReport 함수가 없습니다");
                              }
                            }}
                            className="action-button dismiss-button"
                          >
                            반려
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 제출된 신고 탭 */}
          {activeTab === "submitted" && (
            <div className="status-section">
              <div className="report-list">
                {submittedReports.length === 0 ? (
                  <div className="empty-state">제출된 신고가 없습니다.</div>
                ) : (
                  submittedReports.map((report) => (
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
                            onClick={() => {
                              console.log("접수 버튼 클릭됨:", report.id);
                              if (onAcceptReport) {
                                onAcceptReport(report.id);
                              } else {
                                console.error("onAcceptReport 함수가 없습니다");
                              }
                            }}
                            className="action-button accept-button"
                          >
                            접수
                          </button>
                          <button
                            onClick={() => {
                              console.log("반려 버튼 클릭됨:", report.id);
                              if (onDismissReport) {
                                onDismissReport(report.id);
                              } else {
                                console.error("onDismissReport 함수가 없습니다");
                              }
                            }}
                            className="action-button dismiss-button"
                          >
                            반려
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* 벌금 처리 모달 - Portal 제거하고 직접 렌더링 */}
      {ProcessReportModal && ProcessReportModal()}
    </div>
  );
};

export default ReportStatus;