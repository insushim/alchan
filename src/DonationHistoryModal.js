// src/DonationHistoryModal.js
import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

export default function DonationHistoryModal({
  showDonationHistoryModal,
  setShowDonationHistoryModal,
  students = [],
  currentGoalId,
  classCode, // 🔥 학급 코드 추가
}) {
  const auth = useAuth();
  const userDoc = auth?.userDoc || {};
  const userId = userDoc?.uid || userDoc?.id;
  const userClassCode = userDoc?.classCode || classCode; // props로 받은 classCode 사용

  const [studentDonationSummary, setStudentDonationSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalDonationForThisClassGoal, setTotalDonationForThisClassGoal] =
    useState(0);

  // 스타일 정의
  const modalOverlayStyle = {
    display: showDonationHistoryModal ? "flex" : "none",
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
  };

  const modalContentStyle = {
    backgroundColor: "white",
    borderRadius: "12px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    width: "100%",
    maxWidth: "600px",
    maxHeight: "85vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const modalHeaderStyle = {
    padding: "16px 20px",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  };

  const modalBodyStyle = {
    padding: "20px",
    overflowY: "auto",
    maxHeight: "calc(85vh - 120px)",
  };

  const modalFooterStyle = {
    padding: "16px 20px",
    borderTop: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "flex-end",
  };

  const tableStyles = {
    table: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: "14px",
      borderRadius: "8px",
      overflow: "hidden",
      border: "1px solid #e5e7eb",
    },
    thead: {
      backgroundColor: "#f3f4f6",
    },
    th: {
      padding: "12px 16px",
      textAlign: "left",
      fontWeight: "600",
      color: "#374151",
      borderBottom: "1px solid #d1d5db",
      position: "sticky",
      top: 0,
      backgroundColor: "#f3f4f6",
      zIndex: 1,
    },
    td: {
      padding: "12px 16px",
      borderBottom: "1px solid #e5e7eb",
      color: "#4b5563",
    },
    tr: {
      transition: "background-color 0.2s",
    },
    emptyContainer: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      backgroundColor: "#f9fafb",
      borderRadius: "8px",
      border: "1px dashed #d1d5db",
      textAlign: "center",
      color: "#6b7280",
    },
    emptyIcon: {
      fontSize: "36px",
      marginBottom: "16px",
      color: "#9ca3af",
    },
  };

  useEffect(() => {
    if (showDonationHistoryModal) {
      setLoading(true);
      setError(null);
      setStudentDonationSummary([]);
      setTotalDonationForThisClassGoal(0);

      if (auth?.loading) {
        return;
      }

      if (!userClassCode) {
        console.warn(
          "[DonationHistoryModal] 현재 사용자의 학급 코드가 없습니다."
        );
        setError("학급 정보를 확인할 수 없어 기부 내역을 불러올 수 없습니다.");
        setLoading(false);
        return;
      }

      const validStudents = Array.isArray(students) ? students : [];

      try {
        console.log(
          `[DonationHistoryModal] 학급(${userClassCode}) 목표 기부 내역 불러오기 시작`
        );

        // 🔥 학급별 localStorage 키 사용
        const goalHistoryKey = `goalDonationHistory_${userClassCode}_goal`;
        let classSpecificGoalDonations = [];

        const historyString = localStorage.getItem(goalHistoryKey);
        if (historyString) {
          try {
            const parsed = JSON.parse(historyString);
            classSpecificGoalDonations = Array.isArray(parsed) ? parsed : [];
          } catch (parseErr) {
            console.error(
              `[DonationHistoryModal] 학급(${userClassCode}) 기부 내역 파싱 오류:`,
              parseErr
            );
          }
        } else {
          console.log(
            `[DonationHistoryModal] 학급(${userClassCode})에 대한 기부 내역이 없습니다.`
          );
        }

        console.log(
          `[DonationHistoryModal] 불러온 기부 내역 ${classSpecificGoalDonations.length}개`
        );

        // 현재 사용자와 같은 학급 코드를 가진 학생들만 필터링
        const sameClassStudents = validStudents.filter(
          (student) => student.classCode && student.classCode === userClassCode
        );
        console.log(
          `[DonationHistoryModal] 필터링된 현재 학급 학생 수: ${sameClassStudents.length}명 (전체 ${validStudents.length}명)`
        );

        const donationsByStudent = {};
        let currentClassGoalTotal = 0;

        classSpecificGoalDonations.forEach((donation) => {
          const amount = Number(donation.amount) || 0;
          if (donation.userId) {
            donationsByStudent[donation.userId] =
              (donationsByStudent[donation.userId] || 0) + amount;
          }
          currentClassGoalTotal += amount;
        });

        console.log(
          `[DonationHistoryModal] 학급(${userClassCode}) 학생별 집계:`,
          donationsByStudent
        );
        console.log(`[DonationHistoryModal] 현재 userId: ${userId}`);

        setTotalDonationForThisClassGoal(currentClassGoalTotal);

        const summary = sameClassStudents
          .map((student) => {
            const studentId = student.uid || student.id;
            const studentName =
              student.name || student.nickname || "알 수 없음";
            const isCurrentUser = userId && studentId === userId;
            return {
              id: studentId,
              name: studentName,
              cumulativeAmount: donationsByStudent[studentId] || 0,
              isCurrentUser: isCurrentUser,
              classCode: student.classCode,
            };
          })
          .sort((a, b) => {
            if (a.isCurrentUser && !b.isCurrentUser) return -1;
            if (!a.isCurrentUser && b.isCurrentUser) return 1;
            return a.name.localeCompare(b.name, "ko");
          });

        setStudentDonationSummary(summary);
      } catch (err) {
        console.error("[DonationHistoryModal] 기부 내역 처리 중 오류:", err);
        setError("기부 내역을 처리하는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
  }, [
    showDonationHistoryModal,
    students,
    currentGoalId,
    userId,
    userClassCode,
    auth?.loading,
  ]);

  const handleClose = () => {
    setShowDonationHistoryModal(false);
  };

  const formatAmount = (amount) => {
    if (typeof amount !== "number" || isNaN(amount)) return "0";
    return amount.toLocaleString();
  };

  const myTotalDonation =
    studentDonationSummary.find((s) => s.isCurrentUser)?.cumulativeAmount || 0;

  return (
    <div style={modalOverlayStyle} onClick={handleClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h3
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: "600",
              color: "#1f2937",
            }}
          >
            우리 학급 기부 현황
            {userClassCode && (
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
                {userClassCode}
              </span>
            )}
          </h3>
          <button
            onClick={handleClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
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

        <div style={modalBodyStyle}>
          <div
            style={{
              backgroundColor: "#eef2ff",
              padding: "12px 15px",
              borderRadius: "8px",
              marginBottom: "20px",
              border: "1px solid #c7d2fe",
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
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#4338ca",
                }}
              >
                내 누적 기부액
              </span>
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#4f46e5",
                }}
              >
                {formatAmount(myTotalDonation)} 쿠폰
              </span>
            </div>
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
                  color: "#4338ca",
                }}
              >
                우리 학급 총 기부액
              </span>
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#4f46e5",
                }}
              >
                {formatAmount(totalDonationForThisClassGoal)} 쿠폰
              </span>
            </div>
          </div>

          {loading ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: "#6b7280",
              }}
            >
              기부 현황을 불러오는 중...
            </div>
          ) : error ? (
            <div
              style={{
                color: "#ef4444",
                textAlign: "center",
                padding: "40px 0",
              }}
            >
              {error}
            </div>
          ) : (
            <table style={tableStyles.table}>
              <thead style={tableStyles.thead}>
                <tr>
                  <th style={tableStyles.th}>학생 이름</th>
                  <th
                    style={{
                      ...tableStyles.th,
                      width: "150px",
                      textAlign: "right",
                    }}
                  >
                    누적 기부 쿠폰
                  </th>
                </tr>
              </thead>
              <tbody>
                {studentDonationSummary.length > 0 ? (
                  studentDonationSummary.map((student, index) => (
                    <tr
                      key={student.id || index}
                      style={{
                        ...tableStyles.tr,
                        backgroundColor: student.isCurrentUser
                          ? "#e0e7ff"
                          : index % 2 === 0
                          ? "#f9fafb"
                          : "#ffffff",
                      }}
                      onMouseOver={(e) => {
                        if (!student.isCurrentUser)
                          e.currentTarget.style.backgroundColor = "#eef2ff";
                      }}
                      onMouseOut={(e) => {
                        if (!student.isCurrentUser)
                          e.currentTarget.style.backgroundColor =
                            index % 2 === 0 ? "#f9fafb" : "#ffffff";
                      }}
                    >
                      <td style={tableStyles.td}>
                        {student.name}
                        {student.isCurrentUser && (
                          <span
                            style={{
                              marginLeft: "8px",
                              fontSize: "12px",
                              backgroundColor: "#dbeafe",
                              color: "#1e40af",
                              padding: "2px 6px",
                              borderRadius: "10px",
                              fontWeight: "600",
                              verticalAlign: "middle",
                            }}
                          >
                            나
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          ...tableStyles.td,
                          textAlign: "right",
                          color:
                            student.cumulativeAmount > 0
                              ? "#4f46e5"
                              : "#6b7280",
                          fontWeight:
                            student.cumulativeAmount > 0 ? "600" : "normal",
                        }}
                      >
                        {formatAmount(student.cumulativeAmount)} 쿠폰
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="2" style={{ padding: 0, border: 0 }}>
                      <div style={tableStyles.emptyContainer}>
                        <div style={tableStyles.emptyIcon}>👥</div>
                        <p
                          style={{
                            margin: "0 0 8px 0",
                            fontSize: "16px",
                            fontWeight: "500",
                          }}
                        >
                          아직 우리 학급에서 기부한 학생이 없습니다
                        </p>
                        <p style={{ margin: 0, fontSize: "14px" }}>
                          첫 기부를 통해 목표 달성에 기여해보세요!
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div style={modalFooterStyle}>
          <button
            onClick={handleClose}
            style={{
              padding: "8px 16px",
              backgroundColor: "#e5e7eb",
              color: "#374151",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "500",
              transition: "background-color 0.2s, color 0.2s",
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = "#d1d5db";
              e.target.style.color = "#1f2937";
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = "#e5e7eb";
              e.target.style.color = "#374151";
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
