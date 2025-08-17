// src/PoliceStation.js
import React, { useState, useEffect, useMemo, useCallback } from "react"; // useCallback 추가
import { useAuth } from "./AuthContext";
import { db } from "./firebase"; // firebase.js에서는 db만 가져옵니다.
// getAllUsersDocuments는 직접 쿼리로 대체했으므로 삭제 또는 주석 처리 가능
// import { getAllUsersDocuments } from "./firebase";

import "./Police.css";
import SubmitReport from "./SubmitReport";
import ReportStatus from "./ReportStatus";
import ReportResults from "./ReportResults";
import PoliceAdminSettings from "./PoliceAdminSettings";

// Firestore v9 모듈식 API에서 필요한 함수들을 직접 한 번에 가져옵니다.
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  increment,
  serverTimestamp,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot, // ❗ onSnapshot 함수가 여기에 포함되어 있는지 확인!
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";

// --- Helper Components (내용은 이전과 동일하므로 간략히 표시) ---
const EditComplaintModal = ({ complaint, onSave, onCancel, users }) => {
  const [reason, setReason] = useState(complaint.reason);
  const [desiredResolution, setDesiredResolution] = useState(
    complaint.desiredResolution
  );
  const [defendantId, setDefendantId] = useState(complaint.defendantId);

  const handleSave = () => {
    if (!defendantId || !reason.trim() || !desiredResolution.trim()) {
      alert("모든 필드를 입력해주세요.");
      return;
    }
    onSave({ ...complaint, reason, desiredResolution, defendantId });
  };

  const defendantOptions = users.map((user) => (
    <option key={user.id} value={user.id}>
      {user.name || user.displayName || user.id}
    </option>
  ));

  return (
    <div className="edit-modal-overlay" onClick={onCancel}>
      <div
        className="edit-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="edit-modal-header">
          고소장 수정 (ID: {complaint.id.slice(-6)})
        </h3>
        <div className="edit-modal-content">
          <div className="form-group">
            <label htmlFor="defendantSelectEdit" className="form-label">
              피고소인
            </label>
            <select
              id="defendantSelectEdit"
              className="form-select"
              value={defendantId}
              onChange={(e) => setDefendantId(e.target.value)}
            >
              <option value="">-- 선택 --</option>
              {defendantOptions}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">고소 사유</label>
            <textarea
              className="form-textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
            />
          </div>
          <div className="form-group">
            <label className="form-label">원하는 결과</label>
            <textarea
              className="form-textarea"
              value={desiredResolution}
              onChange={(e) => setDesiredResolution(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <div className="edit-modal-actions">
          <button onClick={onCancel} className="cancel-button">
            취소
          </button>
          <button onClick={handleSave} className="save-button">
            저장
          </button>
        </div>
      </div>
    </div>
  );
};

const JudgmentModal = ({ complaint, onSave, onCancel }) => {
  const [judgmentText, setJudgmentText] = useState(complaint.judgment || "");
  const handleSaveClick = () => {
    if (!judgmentText.trim()) {
      alert("판결 내용을 입력해주세요.");
      return;
    }
    onSave(complaint.id, judgmentText);
  };
  return (
    <div className="edit-modal-overlay" onClick={onCancel}>
      <div
        className="edit-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="edit-modal-header">
          판결문 작성 (ID: {complaint.id.slice(-6)})
        </h3>
        <div className="edit-modal-content">
          <div className="form-group">
            <label htmlFor="judgmentText" className="form-label">
              판결 내용
            </label>
            <textarea
              id="judgmentText"
              className="form-textarea judgment-textarea"
              value={judgmentText}
              onChange={(e) => setJudgmentText(e.target.value)}
              rows={10}
              placeholder="판결 내용을 상세히 작성해주세요..."
            />
          </div>
        </div>
        <div className="edit-modal-actions">
          <button onClick={onCancel} className="cancel-button">
            취소
          </button>
          <button onClick={handleSaveClick} className="save-button">
            판결 저장
          </button>
        </div>
      </div>
    </div>
  );
};

const SettlementModal = ({
  complaint,
  users,
  onSave,
  onCancel,
  getUserNameById,
}) => {
  const [amount, setAmount] = useState(complaint.amount?.toString() || "");
  const [reason, setReason] = useState(
    complaint.resolution || "상호 합의에 따른 합의금 지급"
  );
  const [senderId, setSenderId] = useState(complaint.defendantId);
  const [recipientId, setRecipientId] = useState(complaint.complainantId);
  const auth = useAuth();
  const currentAdminId = auth.userDoc?.id;

  const handleSave = async () => {
    if (!amount || isNaN(parseInt(amount)) || parseInt(amount) <= 0) {
      alert("유효한 합의 금액을 입력해주세요.");
      return;
    }
    if (!senderId || !recipientId) {
      alert("송금자와 수금자를 모두 선택해주세요.");
      return;
    }
    if (senderId === recipientId) {
      alert("송금자와 수금자는 같을 수 없습니다.");
      return;
    }
    await onSave(
      complaint.id,
      parseInt(amount),
      senderId,
      recipientId,
      reason,
      currentAdminId
    );
  };

  const availableSenders = users.filter((u) => u.id !== recipientId);
  const availableRecipients = users.filter((u) => u.id !== senderId);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="settlement-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="settlement-modal-header">
          합의금 지급 처리 (사건번호: {complaint.id.slice(-6)})
        </h3>
        <div className="settlement-modal-content">
          <p>
            <strong>고소인:</strong> {getUserNameById(complaint.complainantId)}
          </p>
          <p>
            <strong>피고소인:</strong> {getUserNameById(complaint.defendantId)}
          </p>
          <div className="form-group">
            <label htmlFor="settlementSender" className="form-label">
              송금자:
            </label>
            <select
              id="settlementSender"
              className="form-select"
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
            >
              <option value="">-- 선택 --</option>
              {availableSenders.map((user) => (
                <option key={user.id} value={user.id}>
                  {getUserNameById(user.id)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="settlementRecipient" className="form-label">
              수금자:
            </label>
            <select
              id="settlementRecipient"
              className="form-select"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
            >
              <option value="">-- 선택 --</option>
              {availableRecipients.map((user) => (
                <option key={user.id} value={user.id}>
                  {getUserNameById(user.id)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="settlementAmount" className="form-label">
              합의금 (원):
            </label>
            <input
              type="number"
              id="settlementAmount"
              className="form-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="금액 입력"
            />
          </div>
          <div className="form-group">
            <label htmlFor="settlementReason" className="form-label">
              처리 사유:
            </label>
            <textarea
              id="settlementReason"
              className="form-textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows="3"
              placeholder="예: 상호 원만한 합의"
            />
          </div>
        </div>
        <div className="settlement-modal-actions">
          <button onClick={onCancel} className="cancel-button">
            취소
          </button>
          <button onClick={handleSave} className="save-button">
            지급 처리
          </button>
        </div>
      </div>
    </div>
  );
};

const TrialResults = ({
  complaints,
  users,
  onOpenSettlementModal,
  getUserNameById: propGetUserNameById,
  isAdmin,
}) => {
  const getUserName =
    propGetUserNameById ||
    ((userId) => {
      const user = users.find((u) => u.id === userId);
      return user?.name || user?.displayName || userId || "알 수 없음";
    });
  const resolvedComplaints = complaints.filter(
    (c) =>
      c.status === "resolved_fine" ||
      c.status === "resolved_settlement" ||
      c.status === "dismissed"
  );
  if (resolvedComplaints.length === 0)
    return <p className="empty-state">완료된 재판/처리가 없습니다.</p>;
  return (
    <div className="trial-results-container">
      {resolvedComplaints.map((complaint) => (
        <div
          key={complaint.id}
          className={`result-card status-${complaint.status}`}
        >
          <div className="result-header">
            <span className="case-id">사건번호: {complaint.id.slice(-6)}</span>
            <span className="parties">
              {getUserName(complaint.complainantId)} vs{" "}
              {getUserName(complaint.defendantId)}
            </span>
            <span className={`case-status status-${complaint.status}`}>
              {complaint.status === "resolved_fine"
                ? "벌금형 확정"
                : complaint.status === "resolved_settlement"
                ? "합의 완료"
                : complaint.status === "dismissed"
                ? "반려/기각됨"
                : "처리완료"}
            </span>
          </div>
          <div className="result-content">
            <h4>고소 요지</h4>
            <p className="summary">
              {complaint.reason?.substring(0, 100)}
              {complaint.reason?.length > 100 ? "..." : ""}
            </p>
            <h4>판결/처리 내용</h4>
            <div className="judgment-display">
              <p>{complaint.resolution || complaint.judgment || "내용 없음"}</p>
            </div>
            {complaint.amount > 0 && (
              <p>
                <strong>금액:</strong> {complaint.amount.toLocaleString()}원
              </p>
            )}
          </div>
          <div className="result-actions">
            {isAdmin &&
              complaint.status === "resolved_fine" &&
              !complaint.settlementPaid && (
                <button
                  className="settlement-button admin-action"
                  onClick={() => onOpenSettlementModal(complaint)}
                >
                  합의금 처리 필요 (관리자)
                </button>
              )}
            {complaint.status === "resolved_settlement" &&
              complaint.settlementPaid && (
                <button className="settlement-button paid" disabled>
                  합의 완료됨
                </button>
              )}
            {complaint.status === "resolved_fine" &&
              complaint.settlementPaid === true && (
                <button className="settlement-button paid" disabled>
                  벌금 및 합의 완료
                </button>
              )}
          </div>
        </div>
      ))}
    </div>
  );
};
// --- Helper Components 끝 ---

const defaultReasons = [
  { reason: "급식실 새치기", amount: 30000, isLaw: false },
  { reason: "실내에서 신발신기", amount: 30000, isLaw: false },
  { reason: "운동장에서 실내화 신기", amount: 30000, isLaw: false },
  { reason: "욕설 사용", amount: 50000, isLaw: false },
  { reason: "친구 건들기/때리기", amount: 100000, isLaw: false },
  { reason: "시비 걸기", amount: 70000, isLaw: false },
  { reason: "기타", amount: 0, isLaw: false },
];

const getClassTreasuryPath = (classCode) =>
  `classes/${classCode}/treasury/balance`;

const PoliceStation = () => {
  const auth = useAuth();
  // ❗ auth.userDoc이 로드되기 전에는 currentUser가 undefined일 수 있으므로 주의
  const currentUser = auth.userDoc;
  const currentUserId = currentUser?.id;
  const classCode = currentUser?.classCode;
  // ❗ isAdmin 접근 시 currentUser가 확실히 로드된 후 또는 auth.loading 확인 후 접근
  const isAdmin = auth.loading
    ? false
    : auth.isAdmin
    ? auth.isAdmin()
    : currentUser?.isAdmin || false;

  const [activeTab, setActiveTab] = useState("submit");
  const [previousTab, setPreviousTab] = useState("submit");

  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  const [reportReasons, setReportReasons] = useState([]);
  const [customReportReasons, setCustomReportReasons] = useState([]);
  const [reasonsLoading, setReasonsLoading] = useState(true);

  const [approvedLaws, setApprovedLaws] = useState([]);
  const [lawsLoading, setLawsLoading] = useState(true);

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const [treasuryLoading, setTreasuryLoading] = useState(true);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingComplaint, setEditingComplaint] = useState(null);
  const [isJudgmentModalOpen, setIsJudgmentModalOpen] = useState(false);
  const [judgingComplaint, setJudgingComplaint] = useState(null);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementComplaint, setSettlementComplaint] = useState(null);

  const getUserNameById = useCallback(
    (userId) => {
      if (!users || users.length === 0) return userId || "정보 없음";
      const user = users.find((u) => u.id === userId);
      return user?.name || user?.displayName || userId || "알 수 없음";
    },
    [users]
  );

  const formatDate = (dateInput) => {
    if (!dateInput) return "N/A";
    try {
      const date =
        typeof dateInput.toDate === "function"
          ? dateInput.toDate()
          : new Date(dateInput);
      if (isNaN(date.getTime())) return "유효하지 않은 날짜";
      return date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch (error) {
      console.error("Error formatting date:", dateInput, error);
      return "날짜 오류";
    }
  };

  useEffect(() => {
    if (auth.loading || !classCode) {
      setUsersLoading(false);
      setUsers([]);
      return;
    }
    setUsersLoading(true);
    const usersQuery = query(
      collection(db, "users"),
      where("classCode", "==", classCode)
    );
    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const fetchedUsers = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setUsers(fetchedUsers || []);
        setUsersLoading(false);
      },
      (error) => {
        console.error("Firebase 사용자 목록 로드 실패 (학급별):", error);
        setUsers([]);
        setUsersLoading(false);
      }
    );
    return () => unsubscribe();
  }, [auth.loading, classCode]);

  useEffect(() => {
    if (auth.loading || !classCode) {
      setTreasuryLoading(false);
      setTreasuryBalance(0);
      return;
    }
    const treasuryRef = doc(db, getClassTreasuryPath(classCode));
    setTreasuryLoading(true);
    const unsubscribe = onSnapshot(
      treasuryRef,
      (docSnap) => {
        if (docSnap.exists()) setTreasuryBalance(docSnap.data().balance || 0);
        else {
          if (isAdmin)
            setDoc(treasuryRef, {
              balance: 0,
              createdAt: serverTimestamp(),
              classCode: classCode,
            }).catch((err) =>
              console.error("Error creating class treasury:", err)
            );
          setTreasuryBalance(0);
        }
        setTreasuryLoading(false);
      },
      (error) => {
        console.error("Error loading class treasury:", error);
        setTreasuryBalance(0);
        setTreasuryLoading(false);
      }
    );
    return () => unsubscribe();
  }, [auth.loading, classCode, isAdmin]);

  useEffect(() => {
    if (!classCode) {
      setLawsLoading(false);
      setApprovedLaws([]);
      return;
    }
    setLawsLoading(true);
    const lawsRef = collection(
      db,
      "classes",
      classCode,
      "nationalAssemblyLaws"
    );
    const q = query(
      lawsRef,
      where("finalStatus", "==", "final_approved"),
      orderBy("timestamp", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const lawsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setApprovedLaws(lawsData);
        setLawsLoading(false);
      },
      (error) => {
        console.error("Error loading approved laws:", error);
        setApprovedLaws([]);
        setLawsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [classCode]);

  useEffect(() => {
    if (!classCode) {
      setReasonsLoading(false);
      setCustomReportReasons([...defaultReasons.filter((r) => !r.isLaw)]);
      return;
    }
    setReasonsLoading(true);
    const customReasonsDocRef = doc(
      db,
      "classes",
      classCode,
      "policeReportReasons",
      "custom"
    );
    const unsubscribe = onSnapshot(
      customReasonsDocRef,
      (docSnap) => {
        if (docSnap.exists() && docSnap.data().reasons)
          setCustomReportReasons(docSnap.data().reasons);
        else {
          const defaultCustom = defaultReasons.filter((r) => !r.isLaw);
          setCustomReportReasons(defaultCustom);
          if (isAdmin)
            setDoc(customReasonsDocRef, {
              reasons: defaultCustom,
              updatedAt: serverTimestamp(),
              classCode: classCode,
            }).catch((err) =>
              console.error("Error creating default custom reasons:", err)
            );
        }
        setReasonsLoading(false);
      },
      (error) => {
        console.error("Error loading custom report reasons:", error);
        setCustomReportReasons([...defaultReasons.filter((r) => !r.isLaw)]);
        setReasonsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [classCode, isAdmin]);

  useEffect(() => {
    if (lawsLoading || reasonsLoading) return;
    const lawReasons = approvedLaws.map((law) => {
      const fineMatch = law.fine?.match(/\d+/g);
      const amount = fineMatch ? parseInt(fineMatch.join(""), 10) : 10000;
      return {
        reason: `[법안] ${law.title} 위반`,
        description: law.description || "",
        amount,
        lawId: law.id,
        isLaw: true,
      };
    });
    setReportReasons([...lawReasons, ...customReportReasons]);
  }, [approvedLaws, customReportReasons, lawsLoading, reasonsLoading]);

  useEffect(() => {
    if (!classCode) {
      setReportsLoading(false);
      setReports([]);
      return;
    }
    setReportsLoading(true);
    const reportsRef = collection(db, "classes", classCode, "policeReports");
    const q = query(reportsRef, orderBy("submitDate", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const loadedReports = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            submitDate: data.submitDate?.toDate
              ? data.submitDate.toDate().toISOString()
              : null,
            acceptanceDate: data.acceptanceDate?.toDate
              ? data.acceptanceDate.toDate().toISOString()
              : null,
            resolutionDate: data.resolutionDate?.toDate
              ? data.resolutionDate.toDate().toISOString()
              : null,
          };
        });
        setReports(loadedReports);
        setReportsLoading(false);
      },
      (error) => {
        console.error("Error loading reports:", error);
        setReports([]);
        setReportsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [classCode]);

  const handleTabChange = (newTab) => {
    setPreviousTab(activeTab);
    setActiveTab(newTab);
  };

  const handleBackToPolice = () => {
    setActiveTab(previousTab !== "admin" ? previousTab : "submit");
  };

  const handleAddReport = async (newReportData) => {
    if (!currentUserId || !classCode) {
      alert("로그인이 필요하거나 학급 정보가 없습니다.");
      return;
    }
    if (!newReportData.reportedUserId || !newReportData.reason) {
      alert("신고 대상과 사유를 모두 선택해주세요.");
      return;
    }
    const reasonInfo = reportReasons.find(
      (r) => r.reason === newReportData.reason
    );
    const reportsRef = collection(db, "classes", classCode, "policeReports");
    const newReport = {
      ...newReportData,
      reporterId: currentUserId,
      reporterName: currentUser.name || currentUser.displayName || "익명",
      submitDate: serverTimestamp(),
      status: "submitted",
      amount: reasonInfo?.amount || 0,
      isLawReport: reasonInfo?.isLaw || false,
      description: reasonInfo?.description || newReportData.reason,
      lawId: reasonInfo?.lawId || null,
      classCode: classCode,
      acceptanceDate: null,
      resolution: null,
      resolutionDate: null,
      processedById: null,
      processedByName: null,
      settlementPaid: false,
    };
    try {
      await addDoc(reportsRef, newReport);
      handleTabChange("status");
      alert("신고가 성공적으로 제출되었습니다.");
    } catch (error) {
      console.error("Error adding report:", error);
      alert("신고 제출 오류.");
    }
  };

  const handleAcceptReport = async (id) => {
    if (!isAdmin || !classCode || !currentUserId) {
      alert("권한이 없거나 정보가 부족합니다.");
      return;
    }
    const reportRef = doc(db, "classes", classCode, "policeReports", id);
    try {
      await updateDoc(reportRef, {
        status: "accepted",
        acceptanceDate: serverTimestamp(),
        processedById: currentUserId,
        processedByName:
          currentUser.name || currentUser.displayName || "관리자",
      });
    } catch (error) {
      console.error("Error accepting report:", error);
      alert("신고 접수 오류.");
    }
  };

  const handleDismissReport = async (id) => {
    if (!isAdmin || !classCode || !currentUserId) {
      alert("권한이 없거나 정보가 부족합니다.");
      return;
    }
    const reportRef = doc(db, "classes", classCode, "policeReports", id);
    try {
      await updateDoc(reportRef, {
        status: "dismissed",
        resolution: "신고 반려/기각",
        resolutionDate: serverTimestamp(),
        processedById: currentUserId,
        processedByName:
          currentUser.name || currentUser.displayName || "관리자",
      });
      handleTabChange("results");
    } catch (error) {
      console.error("Error dismissing report:", error);
      alert("신고 반려 오류.");
    }
  };

  const handleProcessReport = async (
    id,
    processingAmount,
    processingReason
  ) => {
    if (!isAdmin || !currentUserId || !classCode) {
      alert("권한 또는 정보 부족");
      return;
    }
    const report = reports.find((r) => r.id === id);
    if (!report || report.status !== "accepted") {
      alert("접수된 신고만 처리 가능");
      return;
    }
    const numericProcessingAmount = parseInt(processingAmount, 10);
    if (isNaN(numericProcessingAmount) || numericProcessingAmount < 0) {
      alert("유효한 금액(0 이상) 입력 필요");
      return;
    }
    let finalResolution = processingReason || "벌금 부과 처리";
    if (report.isLawReport && report.description) {
      finalResolution = `${processingReason || "법안 위반"}: ${
        report.description
      }`;
    }
    const reportRef = doc(db, "classes", classCode, "policeReports", id);

    if (numericProcessingAmount > 0) {
      const reportedUserRef = doc(db, "users", report.reportedUserId);
      const treasuryRef = doc(db, getClassTreasuryPath(classCode));
      try {
        await runTransaction(db, async (transaction) => {
          const userSnap = await transaction.get(reportedUserRef);
          const treasurySnap = await transaction.get(treasuryRef);
          if (!userSnap.exists()) throw new Error("피신고자 정보 없음");

          let currentTreasuryBalance = 0;
          if (treasurySnap.exists()) {
            currentTreasuryBalance = treasurySnap.data().balance || 0;
          } else {
            transaction.set(treasuryRef, {
              balance: 0,
              classCode: classCode,
              createdAt: serverTimestamp(),
            });
          }
          const userCash = userSnap.data().cash || 0;
          if (userCash < numericProcessingAmount)
            throw new Error("피신고자 잔액 부족");

          transaction.update(reportedUserRef, {
            cash: increment(-numericProcessingAmount),
            updatedAt: serverTimestamp(),
          });
          transaction.update(treasuryRef, {
            balance: increment(numericProcessingAmount),
            updatedAt: serverTimestamp(),
          });
        });
        await updateDoc(reportRef, {
          status: "resolved_fine",
          resolutionDate: serverTimestamp(),
          resolution: finalResolution,
          amount: numericProcessingAmount,
          processedById: currentUserId,
          processedByName:
            currentUser.name || currentUser.displayName || "관리자",
        });
        handleTabChange("results");
      } catch (error) {
        console.error("벌금 처리 트랜잭션 오류:", error);
        alert(`벌금 처리 실패: ${error.message}`);
        return;
      }
    } else {
      try {
        await updateDoc(reportRef, {
          status: "resolved_fine",
          resolutionDate: serverTimestamp(),
          resolution: finalResolution,
          amount: 0,
          processedById: currentUserId,
          processedByName:
            currentUser.name || currentUser.displayName || "관리자",
        });
        handleTabChange("results");
      } catch (error) {
        console.error("벌금 0원 처리 오류:", error);
        alert("처리 중 오류.");
      }
    }
  };

  const handleSettlement = async (id, settlementAmount, settlementReason) => {
    if (!isAdmin || !currentUserId || !classCode) {
      alert("권한 또는 정보 부족");
      return;
    }
    const report = reports.find((r) => r.id === id);
    if (!report || report.status !== "accepted") {
      alert("접수된 신고만 처리 가능");
      return;
    }
    const numericSettlementAmount = parseInt(settlementAmount, 10);
    if (isNaN(numericSettlementAmount) || numericSettlementAmount <= 0) {
      alert("유효한 합의 금액(0 초과) 입력 필요");
      return;
    }
    const senderRef = doc(db, "users", report.reportedUserId);
    const recipientRef = doc(db, "users", report.reporterId);
    const reportRef = doc(db, "classes", classCode, "policeReports", id);
    try {
      await runTransaction(db, async (transaction) => {
        const senderSnap = await transaction.get(senderRef);
        const recipientSnap = await transaction.get(recipientRef);
        if (!senderSnap.exists()) throw new Error("피신고자 정보 없음");
        if (!recipientSnap.exists()) throw new Error("신고자 정보 없음");
        const senderCash = senderSnap.data().cash || 0;
        if (senderCash < numericSettlementAmount)
          throw new Error("피신고자 잔액 부족");

        transaction.update(senderRef, {
          cash: increment(-numericSettlementAmount),
          updatedAt: serverTimestamp(),
        });
        transaction.update(recipientRef, {
          cash: increment(numericSettlementAmount),
          updatedAt: serverTimestamp(),
        });

        let finalResolution = settlementReason || "합의금 지급 완료";
        if (report.isLawReport && report.description) {
          finalResolution = `${settlementReason || "합의 처리"}: ${
            report.description
          }`;
        }
        transaction.update(reportRef, {
          status: "resolved_settlement",
          resolutionDate: serverTimestamp(),
          resolution: finalResolution,
          amount: numericSettlementAmount,
          processedById: currentUserId,
          processedByName:
            currentUser.name || currentUser.displayName || "관리자",
          settlementPaid: true,
        });
      });
      handleTabChange("results");
    } catch (error) {
      console.error("합의 처리 트랜잭션 오류:", error);
      alert(`합의금 처리 실패: ${error.message}`);
    }
  };

  const handleDeleteAllReports = async () => {
    if (!isAdmin || !classCode) return alert("권한이 없습니다.");
    if (window.confirm("모든 신고 기록 삭제?")) {
      try {
        const reportsRef = collection(
          db,
          "classes",
          classCode,
          "policeReports"
        );
        const snapshot = await getDocs(reportsRef);
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        alert("모든 신고 기록 삭제 완료.");
      } catch (error) {
        console.error("Error deleting all reports:", error);
        alert("모든 신고 기록 삭제 오류.");
      }
    }
  };

  const handleDeleteSingleReport = async (idToDelete) => {
    if (!isAdmin || !classCode) return alert("권한이 없습니다.");
    const reportToDelete = reports.find((r) => r.id === idToDelete);
    if (!reportToDelete) return;
    if (window.confirm(`사건번호 ${idToDelete.slice(-6)} 삭제?`)) {
      try {
        const reportRef = doc(
          db,
          "classes",
          classCode,
          "policeReports",
          idToDelete
        );
        await deleteDoc(reportRef);
        alert("신고 기록 삭제 완료.");
      } catch (error) {
        console.error("Error deleting report:", error);
        alert("신고 기록 삭제 오류.");
      }
    }
  };

  const handleEditSingleReport = (idToEdit) => {
    if (!isAdmin) return;
    const reportToEdit = reports.find((r) => r.id === idToEdit);
    if (reportToEdit) {
      setEditingComplaint(reportToEdit);
      setIsEditModalOpen(true);
    }
  };

  const handleUpdateReasons = async (updatedCustomReasons) => {
    if (!isAdmin || !classCode) return alert("권한이 없습니다.");
    if (
      !Array.isArray(updatedCustomReasons) ||
      updatedCustomReasons.some(
        (r) =>
          typeof r !== "object" || !r.reason || typeof r.amount !== "number"
      )
    ) {
      alert("신고 사유 데이터 형식 오류.");
      return;
    }
    try {
      const customReasonsDocRef = doc(
        db,
        "classes",
        classCode,
        "policeReportReasons",
        "custom"
      );
      await setDoc(customReasonsDocRef, {
        reasons: updatedCustomReasons,
        updatedAt: serverTimestamp(),
        classCode: classCode,
      });
      alert("사용자 정의 신고 사유 업데이트 완료.");
    } catch (error) {
      console.error("Error updating reasons:", error);
      alert("신고 사유 업데이트 오류.");
    }
  };

  const reportsWithNames = useMemo(() => {
    if (usersLoading || reportsLoading) return reports;
    return reports.map((r) => ({
      ...r,
      reporterName: getUserNameById(r.reporterId),
      reportedUserName: getUserNameById(r.reportedUserId),
      processedByName: r.processedById
        ? getUserNameById(r.processedById)
        : null,
    }));
  }, [reports, users, usersLoading, reportsLoading, getUserNameById]);

  const statusReports = useMemo(() => {
    return reportsWithNames.filter(
      (r) => r.status === "submitted" || r.status === "accepted"
    );
  }, [reportsWithNames]);

  const resultReports = useMemo(() => {
    return reportsWithNames
      .filter(
        (r) => r.status.startsWith("resolved_") || r.status === "dismissed"
      )
      .sort((a, b) => {
        const dateA = a.resolutionDate || a.submitDate;
        const dateB = b.resolutionDate || b.submitDate;
        const timeA =
          typeof dateA?.toDate === "function"
            ? dateA.toDate().getTime()
            : new Date(dateA).getTime();
        const timeB =
          typeof dateB?.toDate === "function"
            ? dateB.toDate().getTime()
            : new Date(dateB).getTime();
        return timeB - timeA;
      });
  }, [reportsWithNames]);

  if (auth.loading) {
    return (
      <div className="police-container loading">
        사용자 인증 정보를 확인 중입니다...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="police-container loading">
        로그인이 필요합니다. 경찰서 기능을 사용하려면 다시 로그인해주세요.
      </div>
    );
  }

  if (!classCode && !isAdmin) {
    return (
      <div className="police-container loading">
        경찰서 기능을 사용하려면 학급 코드가 사용자 정보에 설정되어 있어야
        합니다. 프로필에서 학급 코드를 설정해주세요.
      </div>
    );
  }

  if (
    classCode &&
    (usersLoading ||
      treasuryLoading ||
      lawsLoading ||
      reasonsLoading ||
      reportsLoading)
  ) {
    let loadingMessages = [];
    if (usersLoading) loadingMessages.push("학급 사용자");
    if (treasuryLoading) loadingMessages.push("국고");
    if (lawsLoading) loadingMessages.push("법안");
    if (reasonsLoading) loadingMessages.push("신고 사유");
    if (reportsLoading) loadingMessages.push("신고 내역");
    return (
      <div className="police-container loading">
        {loadingMessages.length > 0
          ? loadingMessages.join(", ")
          : "경찰서 정보"}{" "}
        로딩 중... (학급: {classCode})
      </div>
    );
  }

  if (isAdmin && !classCode && activeTab !== "admin") {
    // 관리자가 학급코드 없이 일반 탭 접근 시
    return (
      <div className="police-container loading">
        관리자님, 현재 학급 코드가 설정되지 않아 이 탭의 내용을 볼 수 없습니다.
        관리자 설정을 확인하거나 프로필에서 학급 코드를 설정해주세요.
        <button onClick={() => setActiveTab("admin")}>
          관리자 설정으로 이동
        </button>
      </div>
    );
  }

  const renderTabContent = () => {
    if (!classCode && !isAdmin && activeTab !== "admin") {
      // 일반 사용자가 학급 코드 없을 때
      return (
        <p className="empty-state">
          학급 코드가 설정되어 있지 않아 기능을 사용할 수 없습니다.
        </p>
      );
    }

    switch (activeTab) {
      case "submit":
        if (!classCode)
          return (
            <p className="empty-state">
              신고를 제출할 학급이 설정되지 않았습니다.
            </p>
          );
        return (
          <SubmitReport
            onSubmitReport={handleAddReport}
            reportReasons={reportReasons}
            users={users.filter((u) => u.id !== currentUserId)}
            currentUser={currentUser}
          />
        );
      case "status":
        if (!classCode)
          return (
            <p className="empty-state">
              처리 현황을 볼 학급이 설정되지 않았습니다.
            </p>
          );
        return (
          <ReportStatus
            reports={statusReports}
            onProcessReport={handleProcessReport}
            onSettlement={handleSettlement}
            reportReasons={reportReasons}
            formatDate={formatDate}
            onAcceptReport={handleAcceptReport}
            onDismissReport={handleDismissReport}
            currentUser={currentUser}
            isAdminView={isAdmin}
            users={users}
          />
        );
      case "results":
        if (!classCode)
          return (
            <p className="empty-state">
              처리 결과를 볼 학급이 설정되지 않았습니다.
            </p>
          );
        return (
          <ReportResults
            reports={resultReports}
            formatDate={formatDate}
            isAdminView={isAdmin}
            onEditReport={handleEditSingleReport}
            onDeleteReport={handleDeleteSingleReport}
            users={users}
            getUserNameById={getUserNameById}
            isAdmin={isAdmin}
          />
        );
      case "admin":
        // isAdmin() 체크는 PoliceStation 컴포넌트 레벨에서 이미 이루어짐
        return (
          <div className="police-admin-content">
            <div className="admin-nav-buttons">
              <button
                onClick={handleBackToPolice}
                className="back-to-police-button"
              >
                경찰서로 돌아가기
              </button>
            </div>
            <PoliceAdminSettings
              reportReasons={customReportReasons}
              onUpdateReasons={handleUpdateReasons}
              onDeleteAllReports={
                classCode
                  ? handleDeleteAllReports
                  : () =>
                      alert(
                        "모든 신고 삭제는 학급 코드가 설정된 후 가능합니다."
                      )
              }
            />
            <div className="law-reasons-info">
              <h3>법안 기반 신고 사유 (자동 업데이트)</h3>
              {classCode ? (
                reportReasons.filter((r) => r.isLaw).length > 0 ? (
                  <div className="law-reasons-list">
                    {reportReasons
                      .filter((r) => r.isLaw)
                      .map((reason, index) => (
                        <div key={index} className="law-reason-item">
                          <div className="reason-name">{reason.reason}</div>
                          {reason.description && (
                            <div className="reason-description">
                              {reason.description}
                            </div>
                          )}
                          <div className="reason-amount">
                            벌금: {reason.amount.toLocaleString()}원
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="empty-state">
                    현재 학급에 가결된 법안이 없거나, 불러오는 중입니다.
                  </p>
                )
              ) : (
                <p className="empty-state">
                  학급 코드가 설정되지 않아 법안 기반 신고 사유를 볼 수
                  없습니다.
                </p>
              )}
            </div>
          </div>
        );
      default:
        return <p>탭을 선택해주세요.</p>;
    }
  };

  return (
    <div className="police-container">
      {(auth.loading ||
        (classCode &&
          (usersLoading ||
            reportsLoading ||
            treasuryLoading ||
            lawsLoading ||
            reasonsLoading))) && (
        <div className="loading-overlay-transparent">데이터 동기화 중...</div>
      )}
      <div className="police-header-container">
        <h1 className="police-header">
          경찰서 {classCode && `(학급: ${classCode})`}
        </h1>
        <div className="header-info">
          {currentUser && (
            <span className="welcome-message">
              환영합니다,{" "}
              {currentUser.name || currentUser.displayName || currentUser.id}님!
            </span>
          )}
          <span className="treasury-balance">
            현재 국고 잔액: {treasuryBalance.toLocaleString()}원
          </span>
          {isAdmin && (
            <button
              onClick={() => handleTabChange("admin")}
              className={`admin-settings-button ${
                activeTab === "admin" ? "active" : ""
              }`}
              title="관리 설정 열기"
            >
              관리 설정
            </button>
          )}
        </div>
      </div>

      {activeTab !== "admin" ? (
        <>
          {classCode ? (
            <>
              <div className="police-tabs">
                <button
                  onClick={() => handleTabChange("submit")}
                  className={`police-tab-button ${
                    activeTab === "submit" ? "active" : ""
                  }`}
                >
                  신고하기
                </button>
                <button
                  onClick={() => handleTabChange("status")}
                  className={`police-tab-button ${
                    activeTab === "status" ? "active" : ""
                  }`}
                >
                  처리 현황 ({statusReports.length})
                </button>
                <button
                  onClick={() => handleTabChange("results")}
                  className={`police-tab-button ${
                    activeTab === "results" ? "active" : ""
                  }`}
                >
                  처리 결과 ({resultReports.length})
                </button>
              </div>
              <div className="police-tab-content">{renderTabContent()}</div>
            </>
          ) : (
            !isAdmin && (
              <div className="empty-state">
                학급 코드가 설정되어야 경찰서 기능을 이용할 수 있습니다.
              </div>
            )
          )}
        </>
      ) : isAdmin ? (
        renderTabContent()
      ) : (
        <div className="empty-state">관리자만 접근 가능합니다.</div>
      )}

      {isEditModalOpen && editingComplaint && (
        <EditComplaintModal
          complaint={editingComplaint}
          onSave={handleSaveEdit}
          onCancel={() => setIsEditModalOpen(false)}
          users={users.filter(
            (u) =>
              u.id !== editingComplaint.complainantId &&
              u.classCode === classCode
          )}
        />
      )}
      {isJudgmentModalOpen && judgingComplaint && (
        <JudgmentModal
          complaint={judgingComplaint}
          onSave={handleSaveJudgment}
          onCancel={() => setIsJudgmentModalOpen(false)}
        />
      )}
      {isSettlementModalOpen && settlementComplaint && (
        <SettlementModal
          complaint={settlementComplaint}
          users={users}
          onSave={handleSendSettlement}
          onCancel={() => setIsSettlementModalOpen(false)}
          getUserNameById={getUserNameById}
        />
      )}
    </div>
  );
};
// ❗❗❗ SyntaxError: Unexpected token (774:0) 오류가 발생했다면, 아래 export default 문 다음에 불필요한 '}'가 있는지 확인하고 제거해야 합니다.
export default PoliceStation;
// ❗❗❗ 여기 다음에 불필요한 '}'가 없어야 합니다.
