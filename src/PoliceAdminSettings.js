import React, { useState, useEffect } from "react";

// CSS 스타일을 JavaScript 객체로 변환하여 통합
const styles = {
  container: {
    backgroundColor: "#f9f9f9",
    padding: "24px",
    borderRadius: "8px",
    border: "1px solid #e0e0e0",
  },
  h2: {
    fontSize: "24px",
    color: "#333",
    borderBottom: "2px solid #eee",
    paddingBottom: "12px",
    marginBottom: "20px",
  },
  section: {
    backgroundColor: "#fff",
    padding: "20px",
    borderRadius: "8px",
    marginBottom: "24px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
    border: "1px solid #eee",
  },
  h3: {
    fontSize: "18px",
    color: "#444",
    marginTop: "0",
    marginBottom: "8px",
  },
  sectionDescription: {
    fontSize: "14px",
    color: "#666",
    marginBottom: "16px",
    lineHeight: 1.5,
  },
  reasonsList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginBottom: "16px",
  },
  reasonItemEditor: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px",
    backgroundColor: "#fcfdff",
    borderRadius: "6px",
    border: "1px solid #e0e6f0",
  },
  reasonInput: {
    border: "1px solid #ccc",
    borderRadius: "4px",
    padding: "8px 10px",
    fontSize: "14px",
    transition: "border-color 0.3s ease",
  },
  reasonTextInput: {
    flexGrow: 1,
  },
  reasonAmountWrapper: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    color: "#555",
  },
  reasonAmountInput: {
    width: "100px",
  },
  reasonActions: {
    display: "flex",
    gap: "10px",
    marginTop: "16px",
  },
  reasonDeleteButton: {
    border: "none",
    padding: "8px 14px",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "600",
    transition: "background-color 0.3s ease",
    backgroundColor: "#f8d7da",
    color: "#721c24",
  },
  reasonAddButton: {
    border: "none",
    padding: "8px 14px",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "600",
    transition: "background-color 0.3s ease",
    backgroundColor: "#cce5ff",
    color: "#004085",
  },
  reasonSaveButton: {
    border: "none",
    padding: "8px 14px",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "600",
    transition: "background-color 0.3s ease",
    backgroundColor: "#28a745",
    color: "white",
  },
  dangerZone: {
    borderColor: "#dc3545",
    backgroundColor: "#fff5f5",
  },
  dangerZoneH3: {
    color: "#dc3545",
  },
  dangerZoneActions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "15px",
  },
  dangerZoneP: {
    margin: 0,
    color: "#555",
    flexBasis: "60%",
  },
  dangerZoneButton: {
    border: "none",
    backgroundColor: "#dc3545",
    color: "white",
    padding: "10px 16px",
    borderRadius: "5px",
    cursor: "pointer",
    fontWeight: "bold",
    transition: "background-color 0.3s ease, transform 0.1s ease",
  },
};

const PoliceAdminSettings = ({
  reportReasons,
  onUpdateReasons,
  onDeleteAllReports,
}) => {
  const [reasons, setReasons] = useState([]);

  useEffect(() => {
    setReasons(JSON.parse(JSON.stringify(reportReasons || [])));
  }, [reportReasons]);

  const handleReasonChange = (index, field, value) => {
    const updatedReasons = [...reasons];
    if (field === "amount") {
      updatedReasons[index][field] = value === "" ? 0 : parseInt(value, 10);
    } else {
      updatedReasons[index][field] = value;
    }
    setReasons(updatedReasons);
  };

  const handleAddReason = () => {
    setReasons([
      ...reasons,
      { reason: "새로운 사유", amount: 10000, isLaw: false },
    ]);
  };

  const handleDeleteReason = (indexToDelete) => {
    if (window.confirm("이 사유를 정말 삭제하시겠습니까?")) {
      setReasons(reasons.filter((_, index) => index !== indexToDelete));
    }
  };

  const handleSaveChanges = () => {
    if (reasons.some((r) => !r.reason.trim())) {
      alert("사유 이름은 비워둘 수 없습니다.");
      return;
    }
    onUpdateReasons(reasons);
  };

  const handleDeleteAllClick = () => {
    if (
      window.confirm(
        "정말로 모든 신고 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
      )
    ) {
      onDeleteAllReports();
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.h2}>관리자 설정</h2>

      {/* --- 사용자 정의 신고 사유 관리 섹션 --- */}
      <div style={styles.section}>
        <h3 style={styles.h3}>사용자 정의 신고 사유 관리</h3>
        <p style={styles.sectionDescription}>
          법안 기반이 아닌, 사용자가 직접 추가하는 신고 사유 목록입니다.
          벌금액을 0으로 설정하면 벌금 없이 처리할 수 있습니다.
        </p>
        <div style={styles.reasonsList}>
          {reasons.map((reason, index) => (
            <div key={index} style={styles.reasonItemEditor}>
              <input
                type="text"
                value={reason.reason}
                onChange={(e) =>
                  handleReasonChange(index, "reason", e.target.value)
                }
                placeholder="신고 사유"
                style={{ ...styles.reasonInput, ...styles.reasonTextInput }}
              />
              <div style={styles.reasonAmountWrapper}>
                <input
                  type="number"
                  value={reason.amount}
                  onChange={(e) =>
                    handleReasonChange(index, "amount", e.target.value)
                  }
                  placeholder="벌금액"
                  style={{ ...styles.reasonInput, ...styles.reasonAmountInput }}
                  min="0"
                  step="1000"
                />
                <span>원</span>
              </div>
              <button
                onClick={() => handleDeleteReason(index)}
                style={styles.reasonDeleteButton}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <div style={styles.reasonActions}>
          <button onClick={handleAddReason} style={styles.reasonAddButton}>
            사유 추가
          </button>
          <button onClick={handleSaveChanges} style={styles.reasonSaveButton}>
            변경사항 저장
          </button>
        </div>
      </div>

      {/* --- 위험 구역 섹션 --- */}
      <div style={{ ...styles.section, ...styles.dangerZone }}>
        <h3 style={{ ...styles.h3, ...styles.dangerZoneH3 }}>위험 구역</h3>
        <p style={styles.sectionDescription}>
          주의: 이 작업은 되돌릴 수 없으므로 신중하게 진행해주세요.
        </p>
        <div style={styles.dangerZoneActions}>
          <p style={styles.dangerZoneP}>
            <strong>모든 신고 기록 삭제</strong>
            <br />
            현재 학급에 제출, 처리, 완료된 모든 신고 내역을 영구적으로
            삭제합니다.
          </p>
          <button
            onClick={handleDeleteAllClick}
            style={styles.dangerZoneButton}
          >
            모든 기록 삭제
          </button>
        </div>
      </div>
    </div>
  );
};

export default PoliceAdminSettings;