// src/Court.js
import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import {
  db, // db는 firebase.js에서 가져옵니다.
  // Firestore 함수들은 아래에서 직접 가져옵니다.
  getAllUsersDocuments, // 이 함수는 firebase.js에 정의되어 있다고 가정합니다.
} from "./firebase";
import "./Court.css";
import SubmitComplaint from "./SubmitComplaint";
import ComplaintStatus from "./ComplaintStatus";
import SettlementModal from "./SettlementModal";

// Firestore v9 모듈식 API에서 필요한 함수들을 직접 가져옵니다.
import {
  collection,
  doc,
  runTransaction,
  increment,
  serverTimestamp,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy, // ❗ orderBy 함수를 여기서 import 합니다.
  onSnapshot,
  // getDoc, getDocs, where, writeBatch 등 필요한 다른 함수들도 여기에 추가
} from "firebase/firestore";

// --- Helper Components (EditComplaintModal, JudgmentModal, TrialResults) ---
// 이 컴포넌트들은 props로 데이터를 받으므로, Firestore 연동에 따른 직접적인 수정은 거의 없음
// (이전과 동일 - 생략)
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

  const defendantOptions = users
    .filter((user) => user.id !== complaint.complainantId)
    .map((user) => (
      <option key={user.id} value={user.id}>
        {user.name || user.displayName || user.id}
      </option>
    ));

  return (
    <div className="edit-modal-overlay">
      <div className="edit-modal-container">
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
    <div className="edit-modal-overlay">
      <div className="edit-modal-container">
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

const TrialResults = ({ complaints, users, onOpenSettlementModal }) => {
  const getUserNameById = (userId) => {
    const user = users.find((u) => u.id === userId);
    return user?.name || user?.displayName || userId || "알 수 없음";
  };

  const resolvedComplaints = complaints.filter((c) => c.status === "resolved");

  if (resolvedComplaints.length === 0) {
    return <p className="empty-state">완료된 재판이 없습니다.</p>;
  }

  return (
    <div className="trial-results-container">
      {resolvedComplaints.map((complaint) => (
        <div key={complaint.id} className="result-card">
          <div className="result-header">
            <span className="case-id">사건번호: {complaint.id.slice(-6)}</span>
            <span className="parties">
              {getUserNameById(complaint.complainantId)} vs{" "}
              {getUserNameById(complaint.defendantId)}
            </span>
            <span className="case-status status-resolved">재판완료</span>
          </div>
          <div className="result-content">
            <h4>고소 요지</h4>
            <p className="summary">
              {complaint.reason.substring(0, 100)}
              {complaint.reason.length > 100 ? "..." : ""}
            </p>
            <h4>판결문</h4>
            <div className="judgment-display">
              <p>{complaint.judgment || "판결문 내용이 없습니다."}</p>
            </div>
          </div>
          <div className="result-actions">
            {complaint.settlementPaid ? (
              <button className="settlement-button paid" disabled>
                지급 완료
              </button>
            ) : (
              <button
                className="settlement-button"
                onClick={() => onOpenSettlementModal(complaint)}
              >
                합의금 지급
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// --- Main Court Component ---
const Court = () => {
  const auth = useAuth();
  const currentUserDoc = auth?.userDoc; // AuthContext에서 userDoc 직접 사용
  const currentUserId = currentUserDoc?.id;
  const classCode = currentUserDoc?.classCode; // 학급 코드
  // isAdmin은 AuthContext의 isAdmin 함수 또는 userDoc 필드를 사용할 수 있음
  const isAdmin = auth?.isAdmin
    ? auth.isAdmin()
    : currentUserDoc?.isAdmin || currentUserDoc?.id === "admin1";

  const [activeTab, setActiveTab] = useState("submit");
  const [complaints, setComplaints] = useState([]);
  const [complaintsLoading, setComplaintsLoading] = useState(true); // 고소장 로딩 상태
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingComplaint, setEditingComplaint] = useState(null);
  const [isJudgmentModalOpen, setIsJudgmentModalOpen] = useState(false);
  const [judgingComplaint, setJudgingComplaint] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true); // 사용자 목록 로딩 상태
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementComplaint, setSettlementComplaint] = useState(null);

  // 사용자 목록 로드
  useEffect(() => {
    const fetchUsers = async () => {
      if (!auth.loading) {
        // AuthContext 로딩 완료 후 사용자 목록 가져오기
        setUsersLoading(true);
        try {
          // getAllUsersDocuments가 classCode를 인자로 받아 필터링하거나,
          // 여기서 classCode로 필터링 필요. 현재는 모든 사용자를 가져옴.
          // 학급별로 하려면: query(collection(db, "users"), where("classCode", "==", classCode))
          const fetchedUsers = await getAllUsersDocuments();
          setUsers(fetchedUsers || []);
        } catch (error) {
          console.error("Firebase 사용자 목록 로드 실패:", error);
          setUsers([]);
        } finally {
          setUsersLoading(false);
        }
      }
    };
    fetchUsers();
  }, [auth.loading, classCode]); // classCode 변경 시 사용자 다시 로드 (필요시)

  // 고소장 데이터 로드 (Firestore)
  useEffect(() => {
    if (!classCode) {
      setComplaintsLoading(false);
      setComplaints([]);
      return;
    }
    setComplaintsLoading(true);
    const complaintsRef = collection(
      db,
      "classes",
      classCode,
      "courtComplaints"
    );
    const q = query(complaintsRef, orderBy("submissionDate", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const loadedComplaints = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          // Firestore Timestamp를 JS Date 객체로 변환 (필요시)
          submissionDate: doc.data().submissionDate?.toDate
            ? doc.data().submissionDate.toDate().toISOString()
            : null,
          indictmentDate: doc.data().indictmentDate?.toDate
            ? doc.data().indictmentDate.toDate().toISOString()
            : null,
        }));
        setComplaints(loadedComplaints);
        setComplaintsLoading(false);
      },
      (error) => {
        console.error("Error loading complaints from Firestore:", error);
        setComplaints([]);
        setComplaintsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [classCode]);

  const handleAddComplaint = async (newComplaintData) => {
    if (!currentUserId || !classCode) {
      alert("로그인 정보 또는 학급 정보가 유효하지 않습니다.");
      return;
    }
    const currentUserInfo =
      users.find((u) => u.id === currentUserId) || currentUserDoc;

    const complaintToSave = {
      ...newComplaintData,
      status: "pending",
      submissionDate: serverTimestamp(),
      complainantId: currentUserId,
      complainantName:
        currentUserInfo?.name || currentUserInfo?.displayName || "알 수 없음",
      likedBy: [],
      dislikedBy: [],
      judgment: null,
      indictmentDate: null,
      settlementPaid: false,
      classCode: classCode, // 학급 코드 명시적 저장
    };
    try {
      const complaintsRef = collection(
        db,
        "classes",
        classCode,
        "courtComplaints"
      );
      await addDoc(complaintsRef, complaintToSave);
      setActiveTab("status");
      alert("고소장이 성공적으로 제출되었습니다.");
    } catch (error) {
      console.error("Error adding complaint to Firestore:", error);
      alert("고소장 제출 중 오류가 발생했습니다.");
    }
  };

  const handleIndictComplaint = async (id) => {
    if (!isAdmin || !classCode) return alert("기소 권한이 없습니다.");
    const complaintRef = doc(db, "classes", classCode, "courtComplaints", id);
    try {
      await updateDoc(complaintRef, {
        status: "indicted",
        indictmentDate: serverTimestamp(),
      });
      alert(`사건번호 ${id.slice(-6)}이(가) 기소되었습니다.`);
    } catch (error) {
      console.error("Error indicting complaint:", error);
      alert("기소 처리 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteComplaint = async (id) => {
    if (!isAdmin || !classCode) return alert("삭제 권한이 없습니다.");
    if (
      window.confirm(`사건번호 ${id.slice(-6)} 기록을 정말 삭제하시겠습니까?`)
    ) {
      const complaintRef = doc(db, "classes", classCode, "courtComplaints", id);
      try {
        await deleteDoc(complaintRef);
        alert("기록이 삭제되었습니다.");
      } catch (error) {
        console.error("Error deleting complaint:", error);
        alert("기록 삭제 중 오류가 발생했습니다.");
      }
    }
  };

  const handleDismissComplaint = async (id) => {
    if (!isAdmin || !classCode) return alert("처리 권한이 없습니다.");
    const complaintRef = doc(db, "classes", classCode, "courtComplaints", id);
    try {
      await updateDoc(complaintRef, { status: "dismissed" });
      alert(`사건번호 ${id.slice(-6)}이(가) 불기소/기각 처리되었습니다.`);
    } catch (error) {
      console.error("Error dismissing complaint:", error);
      alert("처리 중 오류가 발생했습니다.");
    }
  };

  const handleEditClick = (complaint) => {
    if (!currentUserId) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (!isAdmin && complaint.complainantId !== currentUserId)
      return alert("본인이 작성한 고소장만 수정할 수 있습니다.");
    if (complaint.status !== "pending" && !isAdmin) {
      return alert("진행 중이거나 완료된 사건은 수정할 수 없습니다.");
    }
    setEditingComplaint(complaint);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (updatedComplaintData) => {
    if (!classCode || !editingComplaint?.id) return;

    const complaintRef = doc(
      db,
      "classes",
      classCode,
      "courtComplaints",
      editingComplaint.id
    );
    const {
      id,
      classCode: prevClassCode,
      ...dataToSave
    } = updatedComplaintData; // id, classCode는 경로에 사용되므로 업데이트 데이터에서 제외

    try {
      await updateDoc(complaintRef, {
        ...dataToSave,
        updatedAt: serverTimestamp(), // 수정 시간 기록
      });
      setIsEditModalOpen(false);
      setEditingComplaint(null);
      alert(`사건번호 ${editingComplaint.id.slice(-6)} 정보가 수정되었습니다.`);
    } catch (error) {
      console.error("Error updating complaint:", error);
      alert("고소장 수정 중 오류가 발생했습니다.");
    }
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingComplaint(null);
  };

  const handleVote = async (complaintId, voteType) => {
    if (!currentUserId || !classCode) return alert("로그인이 필요합니다.");
    const complaintRef = doc(
      db,
      "classes",
      classCode,
      "courtComplaints",
      complaintId
    );

    try {
      await runTransaction(db, async (transaction) => {
        const complaintDoc = await transaction.get(complaintRef);
        if (!complaintDoc.exists()) {
          throw "고소장을 찾을 수 없습니다.";
        }
        const complaintData = complaintDoc.data();
        let likedBy = complaintData.likedBy || [];
        let dislikedBy = complaintData.dislikedBy || [];

        const alreadyLiked = likedBy.includes(currentUserId);
        const alreadyDisliked = dislikedBy.includes(currentUserId);

        if (voteType === "like") {
          likedBy = alreadyLiked
            ? likedBy.filter((id) => id !== currentUserId)
            : [...likedBy, currentUserId];
          dislikedBy = dislikedBy.filter((id) => id !== currentUserId); // 반대 투표는 제거
        } else if (voteType === "dislike") {
          dislikedBy = alreadyDisliked
            ? dislikedBy.filter((id) => id !== currentUserId)
            : [...dislikedBy, currentUserId];
          likedBy = likedBy.filter((id) => id !== currentUserId); // 찬성 투표는 제거
        }
        transaction.update(complaintRef, {
          likedBy,
          dislikedBy,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      console.error("Error voting on complaint:", error);
      alert("투표 처리 중 오류가 발생했습니다: " + error.message);
    }
  };

  const handleStartTrial = async (id) => {
    if (!isAdmin || !classCode) return alert("재판 시작 권한이 없습니다.");
    const complaintRef = doc(db, "classes", classCode, "courtComplaints", id);
    try {
      await updateDoc(complaintRef, { status: "on_trial" });
      alert(`사건번호 ${id.slice(-6)}의 재판을 시작합니다.`);
    } catch (error) {
      console.error("Error starting trial:", error);
      alert("재판 시작 처리 중 오류가 발생했습니다.");
    }
  };

  const handleOpenJudgmentModal = (complaint) => {
    if (!isAdmin) return alert("판결문 작성 권한이 없습니다.");
    if (complaint.status !== "on_trial")
      return alert("재판 진행 중인 사건만 판결할 수 있습니다.");
    setJudgingComplaint(complaint);
    setIsJudgmentModalOpen(true);
  };

  const handleSaveJudgment = async (complaintId, judgmentText) => {
    if (!classCode) return;
    const complaintRef = doc(
      db,
      "classes",
      classCode,
      "courtComplaints",
      complaintId
    );
    try {
      await updateDoc(complaintRef, {
        judgment: judgmentText,
        status: "resolved",
        resolvedAt: serverTimestamp(),
      });
      setIsJudgmentModalOpen(false);
      setJudgingComplaint(null);
      alert(`사건번호 ${complaintId.slice(-6)}의 판결문이 저장되었습니다.`);
      setActiveTab("results");
    } catch (error) {
      console.error("Error saving judgment:", error);
      alert("판결문 저장 중 오류가 발생했습니다.");
    }
  };

  const handleCloseJudgmentModal = () => {
    setIsJudgmentModalOpen(false);
    setJudgingComplaint(null);
  };

  const handleOpenSettlementModal = (complaint) => {
    if (!isAdmin) return alert("합의금 지급 처리 권한은 관리자에게 있습니다.");
    if (complaint.status !== "resolved")
      return alert(
        "재판이 완료된 사건에 대해서만 합의금을 처리할 수 있습니다."
      );
    if (complaint.settlementPaid)
      return alert("이미 합의금 지급이 완료된 사건입니다.");

    setSettlementComplaint(complaint);
    setIsSettlementModalOpen(true);
  };

  const handleCloseSettlementModal = () => {
    setIsSettlementModalOpen(false);
    setSettlementComplaint(null);
  };

  const handleSendSettlement = async (
    complaintId,
    amount,
    senderId,
    recipientId
  ) => {
    if (!classCode) {
      alert("학급 정보가 없어 합의금 지급을 처리할 수 없습니다.");
      return false;
    }
    const numericAmount = parseInt(amount, 10);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      alert("유효한 금액을 입력해주세요.");
      return false;
    }
    if (!senderId || !recipientId) {
      alert("보내는 사람과 받는 사람을 모두 선택해주세요.");
      return false;
    }
    if (senderId === recipientId) {
      alert("보내는 사람과 받는 사람은 같을 수 없습니다.");
      return false;
    }

    const sender = users.find((u) => u.id === senderId);
    const recipient = users.find((u) => u.id === recipientId);

    if (!sender || !recipient) {
      alert("유효하지 않은 사용자 정보입니다.");
      return false;
    }
    const senderName = sender?.name || sender?.displayName || senderId;
    const recipientName =
      recipient?.name || recipient?.displayName || recipientId;

    try {
      await runTransaction(db, async (transaction) => {
        const senderRef = doc(db, "users", senderId); // 'users' 컬렉션에 classCode 필터링은 필요에 따라
        const recipientRef = doc(db, "users", recipientId);
        const complaintDocRef = doc(
          db,
          "classes",
          classCode,
          "courtComplaints",
          complaintId
        );

        const senderSnap = await transaction.get(senderRef);
        const recipientSnap = await transaction.get(recipientRef);
        const complaintSnap = await transaction.get(complaintDocRef);

        if (!senderSnap.exists())
          throw new Error(`${senderName}님의 사용자 정보를 찾을 수 없습니다.`);
        if (!recipientSnap.exists())
          throw new Error(
            `${recipientName}님의 사용자 정보를 찾을 수 없습니다.`
          );
        if (!complaintSnap.exists())
          throw new Error("해당 고소 정보를 찾을 수 없습니다.");

        const senderCash = senderSnap.data().cash || 0;
        if (senderCash < numericAmount) {
          throw new Error(
            `${senderName}님의 잔액이 부족합니다. (필요: ${numericAmount.toLocaleString()}, 현재: ${senderCash.toLocaleString()})`
          );
        }

        transaction.update(senderRef, {
          cash: increment(-numericAmount),
          updatedAt: serverTimestamp(),
        });
        transaction.update(recipientRef, {
          cash: increment(numericAmount),
          updatedAt: serverTimestamp(),
        });
        // 고소장 문서에 합의금 지급 완료 상태 업데이트
        transaction.update(complaintDocRef, {
          settlementPaid: true,
          settlementAmount: numericAmount,
          settlementDate: serverTimestamp(),
        });
      });

      // 로컬 상태 업데이트는 onSnapshot에 의해 자동으로 처리될 것이므로 제거 가능
      // setComplaints((prevComplaints) => prevComplaints.map((c) => c.id === complaintId ? { ...c, settlementPaid: true } : c));

      alert(
        `${senderName}님이 ${recipientName}님에게 ${numericAmount.toLocaleString()}원 합의금 지급을 완료했습니다. 💸`
      );
      handleCloseSettlementModal();
      return true;
    } catch (error) {
      console.error("합의금 지급 트랜잭션 오류:", error);
      alert(`합의금 지급에 실패했습니다: ${error.message}`);
      return false;
    }
  };

  const getUserNameById = (userId) => {
    const user = users.find((u) => u.id === userId);
    return user?.name || user?.displayName || userId || "알 수 없음";
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "날짜 정보 없음";
      return date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      console.error("Date formatting error:", dateString, error);
      return "날짜 변환 오류";
    }
  };

  const renderTabContent = () => {
    // currentUserId는 상단에서 auth.userDoc.id로 이미 정의됨
    if (!currentUserId && activeTab === "submit") {
      return (
        <p className="empty-state">고소장 제출을 위해 로그인이 필요합니다.</p>
      );
    }

    switch (activeTab) {
      case "submit":
        return currentUserId ? (
          <SubmitComplaint
            onSubmitComplaint={handleAddComplaint}
            // 피고소인 목록에서 자신 제외 + 같은 학급 학생만 (getAllUsersDocuments가 학급 필터링을 안 한다면 여기서 추가 필터링)
            users={users.filter(
              (u) => u.id !== currentUserId && u.classCode === classCode
            )}
            currentUserId={currentUserId}
          />
        ) : (
          <p className="empty-state">고소장 제출을 위해 로그인이 필요합니다.</p>
        );
      case "status":
        return (
          <ComplaintStatus
            complaints={complaints.filter((c) =>
              ["pending", "indicted", "on_trial", "dismissed"].includes(
                c.status
              )
            )}
            onEditComplaint={handleEditClick}
            onDeleteComplaint={handleDeleteComplaint}
            onIndictComplaint={handleIndictComplaint}
            onDismissComplaint={handleDismissComplaint}
            onStartTrial={handleStartTrial}
            onOpenJudgment={handleOpenJudgmentModal}
            onVote={handleVote}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            users={users} // ComplaintStatus 내부에서 필요시 필터링
            formatDate={formatDate}
            getUserNameById={getUserNameById}
          />
        );
      case "results":
        return (
          <TrialResults
            complaints={complaints}
            users={users}
            onOpenSettlementModal={handleOpenSettlementModal}
          />
        );
      default:
        return <p>탭을 선택해주세요.</p>;
    }
  };

  // 최상단 로딩 조건 수정
  if (auth.loading || usersLoading) {
    // AuthContext 로딩과 사용자 목록 로딩을 먼저 확인
    return (
      <div className="court-container loading">
        사용자 정보를 불러오는 중...
      </div>
    );
  }
  if (!currentUserDoc) {
    // auth.loading은 끝났지만 currentUserDoc이 없는 경우
    return (
      <div className="court-container loading">
        로그인 정보가 없습니다. 다시 로그인해주세요.
      </div>
    );
  }
  if (!classCode) {
    // classCode가 없는 경우
    return (
      <div className="court-container loading">
        법원 시스템을 이용하려면 학급 코드가 설정되어야 합니다.
      </div>
    );
  }
  if (complaintsLoading) {
    // 학급 코드가 있고, 고소장 목록 로딩 중
    return (
      <div className="court-container loading">
        사건 목록을 불러오는 중... (학급: {classCode})
      </div>
    );
  }

  return (
    <div className="court-container">
      <div className="court-header-container">
        <h1 className="court-header">법원 시스템 (학급: {classCode})</h1>
      </div>

      <div className="court-tabs">
        <div className="main-tabs">
          <button
            className={`court-tab-button ${
              activeTab === "submit" ? "active" : ""
            }`}
            onClick={() => setActiveTab("submit")}
          >
            고소장 제출
          </button>
          <button
            className={`court-tab-button ${
              activeTab === "status" ? "active" : ""
            }`}
            onClick={() => setActiveTab("status")}
          >
            사건 현황
          </button>
          <button
            className={`court-tab-button ${
              activeTab === "results" ? "active" : ""
            }`}
            onClick={() => setActiveTab("results")}
          >
            재판 결과
          </button>
        </div>
      </div>

      <div className="court-tab-content">{renderTabContent()}</div>

      {isEditModalOpen && editingComplaint && (
        <EditComplaintModal
          complaint={editingComplaint}
          onSave={handleSaveEdit}
          onCancel={handleCloseEditModal}
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
          onCancel={handleCloseJudgmentModal}
        />
      )}
      {isSettlementModalOpen && settlementComplaint && (
        <SettlementModal
          complaint={settlementComplaint}
          users={users} // SettlementModal 내부에서 sender/recipient 필터링 필요시
          onSave={handleSendSettlement}
          onCancel={handleCloseSettlementModal}
          getUserNameById={getUserNameById}
        />
      )}
    </div>
  );
};

export default Court;
