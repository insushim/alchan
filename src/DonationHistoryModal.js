// src/DonationHistoryModal.js
import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

export default function DonationHistoryModal({
  showDonationHistoryModal,
  setShowDonationHistoryModal,
  students = [],
  classCode,
  donations = [],
}) {
  const { user, userDoc } = useAuth();
  const userId = user?.uid;
  const userClassCode = userDoc?.classCode || classCode;

  const [studentDonationSummary, setStudentDonationSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalDonationForThisClassGoal, setTotalDonationForThisClassGoal] = useState(0);

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
      const processDonationData = () => {
        setLoading(true);
        setError(null);
        setStudentDonationSummary([]);
        setTotalDonationForThisClassGoal(0);

        console.log("[DonationHistoryModal] 데이터 처리 시작:", {
          userClassCode,
          studentsCount: students.length,
          donationsCount: donations.length,
          students: students.map(s => ({ 
            id: s.id || s.uid, 
            name: s.name || s.nickname,
            classCode: s.classCode 
          })),
          donations: donations
        });

        if (!userClassCode) {
          setError("학급 정보를 확인할 수 없어 기부 내역을 처리할 수 없습니다.");
          setLoading(false);
          return;
        }

        try {
          const classDonations = donations || [];
          const validStudents = Array.isArray(students) ? students : [];

          const donationsByStudent = {};
          let currentClassGoalTotal = 0;

          // 모든 기부 기록을 처리하여 학생별 기부액과 총 기부액을 계산
          classDonations.forEach((donation) => {
            const amount = Number(donation.amount) || 0;
            const donorId = donation.userId;
            const donorName = donation.userName || donation.name || "알 수 없는 사용자";

            if (donorId) {
              if (!donationsByStudent[donorId]) {
                donationsByStudent[donorId] = {
                  amount: 0,
                  name: donorName
                };
              }
              donationsByStudent[donorId].amount += amount;
              // 이름 업데이트 (가장 최신 이름 사용)
              if (donorName && donorName !== "알 수 없는 사용자") {
                donationsByStudent[donorId].name = donorName;
              }
            }
            currentClassGoalTotal += amount;
          });

          setTotalDonationForThisClassGoal(currentClassGoalTotal);

          console.log("[DonationHistoryModal] 기부 집계:", {
            donationsByStudent,
            totalAmount: currentClassGoalTotal,
            uniqueDonors: Object.keys(donationsByStudent).length
          });

          // 🔥 수정: donations 배열에서 직접 기부자 목록 생성
          // students prop에 없는 사용자도 포함
          const donorIds = Object.keys(donationsByStudent);

          // 기부한 사용자들의 목록 생성
          const summary = donorIds
            .map((donorId) => {
              const donorInfo = donationsByStudent[donorId];
              const isCurrentUser = userId && donorId === userId;

              return {
                id: donorId,
                name: donorInfo.name,
                cumulativeAmount: donorInfo.amount,
                isCurrentUser: isCurrentUser,
              };
            })
            // 기부액 기준으로 내림차순 정렬 (많이 기부한 순서)
            .sort((a, b) => b.cumulativeAmount - a.cumulativeAmount);

          console.log("[DonationHistoryModal] 최종 학생 목록:", {
            totalDonors: summary.length,
            summary
          });

          setStudentDonationSummary(summary);
        } catch (err) {
          console.error("[DonationHistoryModal] 기부 내역 처리 중 오류:", err);
          setError("기부 내역을 처리하는 중 오류가 발생했습니다.");
        } finally {
          setLoading(false);
        }
      };

      processDonationData();
    }
  }, [showDonationHistoryModal, students, userId, userClassCode, donations]);

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
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#1f2937" }}>
            우리 학급 기부 현황
            {userClassCode && (
              <span style={{ 
                marginLeft: "8px", 
                fontSize: "14px", 
                backgroundColor: "#dbeafe", 
                color: "#1e40af", 
                padding: "4px 8px", 
                borderRadius: "12px", 
                fontWeight: "500" 
              }}>
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
              lineHeight: "1" 
            }} 
            aria-label="닫기"
          >
            &times;
          </button>
        </div>

        <div style={modalBodyStyle}>
          <div style={{ 
            backgroundColor: "#eef2ff", 
            padding: "12px 15px", 
            borderRadius: "8px", 
            marginBottom: "20px", 
            border: "1px solid #c7d2fe" 
          }}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              marginBottom: "8px" 
            }}>
              <span style={{ fontSize: "14px", fontWeight: "500", color: "#4338ca" }}>
                내 누적 기부액
              </span>
              <span style={{ fontSize: "16px", fontWeight: "600", color: "#4f46e5" }}>
                {formatAmount(myTotalDonation)} 쿠폰
              </span>
            </div>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center" 
            }}>
              <span style={{ fontSize: "14px", fontWeight: "500", color: "#4338ca" }}>
                우리 학급 총 기부액
              </span>
              <span style={{ fontSize: "16px", fontWeight: "600", color: "#4f46e5" }}>
                {formatAmount(totalDonationForThisClassGoal)} 쿠폰
              </span>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#6b7280" }}>
              기부 현황을 불러오는 중...
            </div>
          ) : error ? (
            <div style={{ color: "#ef4444", textAlign: "center", padding: "40px 0" }}>
              {error}
            </div>
          ) : (
            <>
              {studentDonationSummary.length > 0 ? (
                <table style={tableStyles.table}>
                  <thead style={tableStyles.thead}>
                    <tr>
                      <th style={tableStyles.th}>학생 이름</th>
                      <th style={{ ...tableStyles.th, width: "150px", textAlign: "right" }}>
                        누적 기부 쿠폰
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentDonationSummary.map((student, index) => (
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
                          if (!student.isCurrentUser) {
                            e.currentTarget.style.backgroundColor = "#eef2ff";
                          }
                        }}
                        onMouseOut={(e) => {
                          if (!student.isCurrentUser) {
                            e.currentTarget.style.backgroundColor = 
                              index % 2 === 0 ? "#f9fafb" : "#ffffff";
                          }
                        }}
                      >
                        <td style={tableStyles.td}>
                          {student.name}
                          {student.isCurrentUser && (
                            <span style={{ 
                              marginLeft: "8px", 
                              fontSize: "12px", 
                              backgroundColor: "#dbeafe", 
                              color: "#1e40af", 
                              padding: "2px 6px", 
                              borderRadius: "10px", 
                              fontWeight: "600", 
                              verticalAlign: "middle" 
                            }}>
                              나
                            </span>
                          )}
                        </td>
                        <td style={{ 
                          ...tableStyles.td, 
                          textAlign: "right", 
                          color: student.cumulativeAmount > 0 ? "#4f46e5" : "#6b7280", 
                          fontWeight: student.cumulativeAmount > 0 ? "600" : "normal" 
                        }}>
                          {formatAmount(student.cumulativeAmount)} 쿠폰
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={tableStyles.emptyContainer}>
                  <div style={tableStyles.emptyIcon}>👥</div>
                  <p style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: "500" }}>
                    학급 학생 정보를 불러올 수 없거나 등록된 학생이 없습니다
                  </p>
                  <p style={{ margin: 0, fontSize: "14px" }}>
                    관리자에게 문의하여 학급 설정을 확인해주세요.
                  </p>
                </div>
              )}
            </>
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
              transition: "background-color 0.2s, color 0.2s" 
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