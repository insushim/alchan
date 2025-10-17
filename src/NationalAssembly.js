// src/NationalAssembly.js
import React, { useState, useEffect, useCallback } from "react";
import "./NationalAssembly.css";
import { useAuth } from "./AuthContext";
import { db } from "./firebase";
import { usePolling } from "./hooks/usePolling";

// Firestore v9 모듈식 API에서 필요한 함수들을 직접 한 번에 가져옵니다.
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  increment,
  writeBatch,
  setDoc,
  serverTimestamp,
  runTransaction, // ❗ runTransaction 함수 추가
} from "firebase/firestore";

const NationalAssembly = () => {
  const { userDoc: currentUser, loading: authLoading, isAdmin } = useAuth();

  const classCode = currentUser?.classCode;

  const [activeTab, setActiveTab] = useState("propose");
  const [showProposeLawModal, setShowProposeLawModal] = useState(false);
  const [showEditLawModal, setShowEditLawModal] = useState(false);
  const [newLaw, setNewLaw] = useState({
    title: "",
    purpose: "",
    description: "",
    fine: "",
  });
  const [editingLaw, setEditingLaw] = useState(null);
  const [localAdminSettings, setLocalAdminSettings] = useState(null);
  const [localGovSettings, setLocalGovSettings] = useState(null);

  // 모달 상태 변경 감지를 위한 useEffect
  useEffect(() => {
    console.log("[NationalAssembly] showProposeLawModal 상태 변경:", showProposeLawModal);
    if (showProposeLawModal) {
      // DOM에서 모달이 실제로 존재하는지 확인
      setTimeout(() => {
        const modal = document.querySelector('.modal-overlay');
        console.log("[NationalAssembly] DOM에서 모달 찾기:", modal);
        if (modal) {
          console.log("[NationalAssembly] 모달 스타일:", {
            display: modal.style.display,
            zIndex: window.getComputedStyle(modal).zIndex,
            position: window.getComputedStyle(modal).position,
            visibility: window.getComputedStyle(modal).visibility,
            opacity: window.getComputedStyle(modal).opacity
          });
        }
      }, 100);
    }
  }, [showProposeLawModal]);

  // 관리자 설정 로드 및 초기화
  const { data: adminSettings, loading: adminSettingsLoading } = usePolling(
    async () => {
      if (!classCode) return { totalStudents: 25 };

      const adminSettingsDocRefNode = doc(
        db,
        "classes",
        classCode,
        "nationalAssemblySettings",
        "admin"
      );

      const docSnap = await getDoc(adminSettingsDocRefNode);

      if (docSnap.exists()) {
        return docSnap.data();
      } else {
        const defaultAdminSettings = { totalStudents: 25 };
        await setDoc(adminSettingsDocRefNode, defaultAdminSettings);
        return defaultAdminSettings;
      }
    },
    {
      interval: 30000,
      enabled: !!classCode,
      deps: [classCode],
      defaultValue: { totalStudents: 25 },
      onError: (error) => {
        console.error("Error fetching admin settings:", error);
      }
    }
  );

  // 정부 설정 로드 및 초기화
  const { data: governmentSettings, loading: govSettingsLoading } = usePolling(
    async () => {
      if (!classCode || adminSettingsLoading) {
        return {
          vetoOverrideRequired: Math.ceil(
            ((adminSettings?.totalStudents) || 25) * (2 / 3)
          ),
        };
      }

      const govSettingsDocRefNode = doc(
        db,
        "classes",
        classCode,
        "nationalAssemblySettings",
        "government"
      );

      const docSnap = await getDoc(govSettingsDocRefNode);

      if (docSnap.exists()) {
        return docSnap.data();
      } else {
        const defaultGovSettings = {
          vetoOverrideRequired: Math.ceil(
            ((adminSettings?.totalStudents) || 25) * (2 / 3)
          ),
        };
        await setDoc(govSettingsDocRefNode, defaultGovSettings);
        return defaultGovSettings;
      }
    },
    {
      interval: 30000,
      enabled: !!classCode && !adminSettingsLoading,
      deps: [classCode, adminSettings?.totalStudents, adminSettingsLoading],
      defaultValue: {
        vetoOverrideRequired: Math.ceil(
          ((adminSettings?.totalStudents) || 25) * (2 / 3)
        ),
      },
      onError: (error) => {
        console.error("Error fetching government settings:", error);
      }
    }
  );

  // 법안 데이터 로드
  const { data: laws, loading: lawsLoading } = usePolling(
    async () => {
      if (!classCode) return [];

      const lawsCollectionRefNode = collection(
        db,
        "classes",
        classCode,
        "nationalAssemblyLaws"
      );
      const q = query(lawsCollectionRefNode, orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate
          ? doc.data().timestamp.toDate().toISOString()
          : new Date().toISOString(),
        vetoDate: doc.data().vetoDate?.toDate
          ? doc.data().vetoDate.toDate().toISOString()
          : null,
        vetoDeadline: doc.data().vetoDeadline?.toDate
          ? doc.data().vetoDeadline.toDate().toISOString()
          : null,
        finalApprovalDate: doc.data().finalApprovalDate?.toDate
          ? doc.data().finalApprovalDate.toDate().toISOString()
          : null,
      }));
    },
    {
      interval: 30000,
      enabled: !!classCode,
      deps: [classCode],
      defaultValue: [],
      onError: (error) => {
        console.error("Error fetching laws:", error);
      }
    }
  );

  // 사용자 투표 이력 로드
  const { data: userVotes, loading: userVotesLoading } = usePolling(
    async () => {
      if (!classCode || !currentUser?.id) return {};

      const userVotesDocRefNode = doc(
        db,
        "classes",
        classCode,
        "userVotes",
        currentUser.id
      );

      const docSnap = await getDoc(userVotesDocRefNode);

      if (docSnap.exists()) {
        return docSnap.data();
      } else {
        return {};
      }
    },
    {
      interval: 30000,
      enabled: !!classCode && !!currentUser?.id,
      deps: [classCode, currentUser?.id],
      defaultValue: {},
      onError: (error) => {
        console.error("Error fetching user votes:", error);
      }
    }
  );

  // --- 🔥 [수정] 새 법안 제안 함수 ---
  const handleProposeLaw = async () => {
    console.log("[NationalAssembly] handleProposeLaw 시작");
    console.log("[NationalAssembly] classCode:", classCode);
    console.log("[NationalAssembly] currentUser:", currentUser);
    console.log("[NationalAssembly] newLaw:", newLaw);

    if (!classCode || !currentUser) {
      console.log("[NationalAssembly] 학급 정보 또는 유저 정보 없음");
      alert("학급 정보가 없거나 로그인되지 않았습니다.");
      return;
    }
    if (!newLaw.title || !newLaw.description || !newLaw.fine) {
      console.log("[NationalAssembly] 필수 필드 누락");
      alert("모든 필드를 입력해주세요.");
      return;
    }

    // 🔥 collection 함수의 올바른 사용법: db 인스턴스와 전체 경로를 인자로 전달합니다.
    const lawsCollectionRef = collection(db, "classes", classCode, "nationalAssemblyLaws");

    const newLawData = {
      ...newLaw,
      proposerId: currentUser.id,
      proposerName: currentUser.name || "익명",
      approvals: 0,
      disapprovals: 0,
      status: "pending",
      timestamp: serverTimestamp(),
      classCode: classCode,
      voters: {},
    };

    try {
      // 🔥 수정된 collection 참조를 사용하여 문서를 추가합니다.
      await addDoc(lawsCollectionRef, newLawData);
      console.log("새 법안이 성공적으로 제안되었습니다:", newLawData.title);
      setShowProposeLawModal(false);
      setNewLaw({ title: "", purpose: "", description: "", fine: "" });
    } catch (error) {
      console.error("Error proposing new law:", error);
      alert("법안 제안 중 오류가 발생했습니다.");
    }
  };

  const handleOpenEditModal = (law) => {
    if (!isAdmin()) {
      alert("관리자만 법안을 수정할 수 있습니다.");
      return;
    }
    setEditingLaw({ ...law });
    setShowEditLawModal(true);
  };

  const handleSaveEditLaw = async () => {
    if (!classCode || !editingLaw || !editingLaw.id || !isAdmin()) {
      alert("수정 권한이 없거나 정보가 부족합니다.");
      return;
    }
    if (!editingLaw.title || !editingLaw.description || !editingLaw.fine) {
      alert("모든 필드를 입력해주세요.");
      return;
    }

    const lawDocRef = doc(
      db,
      "classes",
      classCode,
      "nationalAssemblyLaws",
      editingLaw.id
    );
    try {
      const {
        id,
        voters,
        timestamp,
        classCode: lawClassCode,
        proposerId,
        proposerName,
        ...dataToUpdate
      } = editingLaw;
      await updateDoc(lawDocRef, {
        ...dataToUpdate,
        updatedAt: serverTimestamp(),
      });
      setShowEditLawModal(false);
      setEditingLaw(null);
    } catch (error) {
      console.error("Error saving edited law:", error);
      alert("법안 저장 중 오류가 발생했습니다.");
    }
  };

  const handleVote = async (lawId, voteType) => {
    if (!classCode || !currentUser?.id) {
      alert("투표를 처리할 수 없습니다. (정보 부족)");
      return;
    }
    const userVotesDocRefNode = doc(
      db,
      "classes",
      classCode,
      "userVotes",
      currentUser.id
    );
    const lawRef = doc(db, "classes", classCode, "nationalAssemblyLaws", lawId);
    const currentLaw = laws.find((l) => l.id === lawId);

    if (
      !isAdmin() &&
      ((currentLaw?.voters &&
        currentLaw.voters[currentUser.id] &&
        currentLaw.status !== "vetoed") ||
        (userVotes[lawId] && currentLaw.status !== "vetoed"))
    ) {
      alert("이미 이 법안에 투표하셨습니다.");
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const lawDoc = await transaction.get(lawRef);
        if (!lawDoc.exists()) {
          throw new Error("법안이 존재하지 않습니다.");
        }
        
        const lawData = lawDoc.data();
        const totalStudents = adminSettings.totalStudents;
        const halfStudents = Math.ceil(totalStudents / 2); // 부결 처리를 위해 과반수는 유지
        const vetoOverrideRequiredCount = governmentSettings.vetoOverrideRequired;
        
        // 현재 투표 수에 1을 더해 새로운 투표 수를 미리 계산합니다.
        const newApprovals = (lawData.approvals || 0) + (voteType === 'approvals' ? 1 : 0);
        const newDisapprovals = (lawData.disapprovals || 0) + (voteType === 'disapprovals' ? 1 : 0);

        // 업데이트할 데이터를 준비합니다.
        const updates = { updatedAt: serverTimestamp() };
        
        if(voteType === 'approvals') {
            updates.approvals = increment(1);
        } else {
            updates.disapprovals = increment(1);
        }
        
        if (!isAdmin()) {
          updates[`voters.${currentUser.id}`] = voteType;
        }

        // 법안 상태에 따라 상태 변경 로직을 적용합니다.
        if (lawData.status === "vetoed") {
          if (voteType === "approvals" && newApprovals >= vetoOverrideRequiredCount) {
            updates.status = "veto_overridden";
            updates.finalStatus = "final_approved";
            updates.finalApprovalDate = serverTimestamp();
          }
        } else if (["pending", "rejected", "auto_rejected"].includes(lawData.status)) {
          // ✨✨✨ 핵심 수정 부분: 찬성 13표 이상이면 정부로 이송합니다. ✨✨✨
          if (voteType === "approvals" && newApprovals >= 13) {
            updates.status = "pending_government_approval";
            updates.approvalDate = serverTimestamp();
          } else if (voteType === "disapprovals" && newDisapprovals >= halfStudents) {
            // 반대가 과반수 이상이면 부결 처리
            updates.status = "rejected";
          }
        } else {
          // 투표가 불가능한 상태이므로 아무 작업도 하지 않고 종료합니다.
          console.log("이미 처리되었거나 투표가 불가능한 법안입니다.");
          return;
        }

        // 트랜잭션 내에서 법안 문서를 업데이트합니다.
        transaction.update(lawRef, updates);

        // 관리자가 아닌 경우에만 사용자 투표 이력을 기록합니다.
        if (!isAdmin()) {
          const userVoteData = { [lawId]: voteType };
          transaction.set(userVotesDocRefNode, userVoteData, { merge: true });
        }
      });
    } catch (error) {
      console.error("Error voting on law:", error);
      alert(`투표 중 오류 발생: ${error.message || error}`);
    }
  };


  const handleResetVotes = async (lawId) => {
    if (!isAdmin() || !classCode) {
      alert("관리자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (window.confirm("이 법안의 모든 투표를 초기화하시겠습니까?")) {
      const lawDocRef = doc(
        db,
        "classes",
        classCode,
        "nationalAssemblyLaws",
        lawId
      );
      try {
        await updateDoc(lawDocRef, {
          approvals: 0,
          disapprovals: 0,
          status: "pending",
          voters: {},
          updatedAt: serverTimestamp(),
          finalStatus: null,
          finalApprovalDate: null,
        });
        alert("법안 투표가 초기화되었습니다.");
      } catch (error) {
        console.error("Error resetting votes:", error);
        alert("투표 초기화 중 오류가 발생했습니다.");
      }
    }
  };

  const handleDeleteLaw = async (id) => {
    if (!classCode) return;
    const lawToDelete = laws.find((law) => law.id === id);
    if (!lawToDelete) return;

    if (
      !isAdmin() &&
      !(
        (lawToDelete.status === "rejected" ||
          lawToDelete.status === "auto_rejected") &&
        lawToDelete.proposerId === currentUser?.id
      )
    ) {
      alert("관리자 또는 부결된 법안의 제안자만 삭제할 수 있습니다.");
      return;
    }
    if (window.confirm("정말로 이 법안을 삭제하시겠습니까?")) {
      const lawDocRef = doc(
        db,
        "classes",
        classCode,
        "nationalAssemblyLaws",
        id
      );
      try {
        await deleteDoc(lawDocRef);
        alert("법안이 삭제되었습니다.");
      } catch (error) {
        console.error("Error deleting law:", error);
        alert("법안 삭제 중 오류가 발생했습니다.");
      }
    }
  };

  const handleSaveAdminSettings = async () => {
    if (!classCode || !isAdmin()) {
      alert("관리자 권한이 없거나 학급 정보가 없습니다.");
      return;
    }
    const adminSettingsDocRefNode = doc(
      db,
      "classes",
      classCode,
      "nationalAssemblySettings",
      "admin"
    );
    try {
      const settingsToSave = localAdminSettings || adminSettings;
      await setDoc(
        adminSettingsDocRefNode,
        {
          totalStudents: parseInt(settingsToSave.totalStudents, 10) || 25,
        },
        { merge: true }
      );
      setLocalAdminSettings(null);
      alert("관리자 설정이 저장되었습니다.");
    } catch (error) {
      console.error("Error saving admin settings:", error);
      alert("관리자 설정 저장 중 오류가 발생했습니다.");
    }
  };

  const handleSaveGovernmentSettings = async () => {
    if (!classCode || !isAdmin()) {
      alert("설정 저장 권한이 없거나 학급 정보가 없습니다.");
      return;
    }
    const govSettingsDocRefNode = doc(
      db,
      "classes",
      classCode,
      "nationalAssemblySettings",
      "government"
    );
    try {
      const settingsToSave = localGovSettings || governmentSettings;
      await setDoc(
        govSettingsDocRefNode,
        {
          vetoOverrideRequired:
            parseInt(settingsToSave.vetoOverrideRequired, 10) ||
            Math.ceil(adminSettings.totalStudents * (2 / 3)),
        },
        { merge: true }
      );
      setLocalGovSettings(null);
      alert("재의결 설정이 저장되었습니다.");
    } catch (error) {
      console.error("Error saving government settings:", error);
      alert("재의결 설정 저장 중 오류가 발생했습니다.");
    }
  };

  const approvedLaws = (laws || []).filter(
    (law) =>
      law.status === "veto_overridden" ||
      law.finalStatus === "final_approved"
  );
  // ✨ 수정된 부분: pendingLaws 필터에 'pending_government_approval' 추가
  const pendingLaws = (laws || []).filter(
    (law) =>
      law.status === "pending" ||
      law.status === "rejected" ||
      law.status === "auto_rejected" ||
      law.status === "pending_government_approval"
  );
  const vetoedLaws = (laws || []).filter((law) => law.status === "vetoed");

  let displayedLaws;
  if (activeTab === "approved") {
    displayedLaws = approvedLaws;
  } else if (activeTab === "vetoed") {
    displayedLaws = vetoedLaws;
  } else {
    displayedLaws = pendingLaws;
  }

  const sortedLaws = [...displayedLaws];

  const getLawStatusDisplay = (law) => {
    if (law.finalStatus === "final_approved") {
      return <span className="law-status final-approved">최종 가결</span>;
    }
    switch (law.status) {
      // ✨ 추가된 부분: '정부 이송' 상태 표시
      case "pending_government_approval":
        return <span className="law-status pending-gov">정부 이송</span>;
      case "approved":
        return <span className="law-status approved">가결됨</span>;
      case "veto_overridden":
        return <span className="law-status override">재의결 가결</span>;
      case "vetoed":
        return <span className="law-status vetoed">거부권 행사됨</span>;
      case "rejected":
        return <span className="law-status rejected">부결됨</span>;
      case "auto_rejected":
        return <span className="law-status auto-rejected">자동 부결됨</span>;
      default:
        return <span className="law-status pending">심의중</span>;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "정보 없음";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "유효하지 않은 날짜";
      return `${date.getFullYear()}년 ${
        date.getMonth() + 1
      }월 ${date.getDate()}일 ${date.getHours()}시 ${date.getMinutes()}분`;
    } catch (e) {
      return "날짜 변환 오류";
    }
  };

  const getRemainingTime = (deadlineString) => {
    if (!deadlineString) return "기한 없음";
    const now = new Date();
    const deadlineDate = new Date(deadlineString);
    if (isNaN(deadlineDate.getTime())) return "유효하지 않은 기한";
    const diff = deadlineDate - now;

    if (diff <= 0) return "시간 만료";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    let remaining = "";
    if (days > 0) remaining += `${days}일 `;
    if (hours > 0 || days > 0) remaining += `${hours}시간 `;
    if (minutes > 0 || (days === 0 && hours === 0)) remaining += `${minutes}분`;

    return remaining.trim() + " 남음" || "곧 만료";
  };

  const renderAdminActions = (law) => {
    if (!isAdmin()) return null;
    return (
      <div className="admin-actions">
        <button
          onClick={() => handleOpenEditModal(law)}
          className="admin-button edit-button"
        >
          수정
        </button>
        <button
          onClick={() => handleDeleteLaw(law.id)}
          className="admin-button delete-button"
        >
          삭제
        </button>
        {(law.status === "pending" ||
          law.status === "rejected" ||
          law.status === "vetoed" ||
          law.status === "auto_rejected") && (
          <button
            onClick={() => handleResetVotes(law.id)}
            className="admin-button reset-button"
          >
            투표 초기화
          </button>
        )}
      </div>
    );
  };

  if (authLoading) {
    return (
      <div className="loading-container">사용자 정보를 불러오는 중...</div>
    );
  }
  if (!currentUser) {
    return (
      <div className="loading-container">
        로그인이 필요합니다. 국회 기능을 사용하려면 다시 로그인해주세요.
      </div>
    );
  }
  if (!classCode) {
    return (
      <div className="loading-container">
        국회 기능을 사용하려면 학급 코드가 사용자 정보에 설정되어 있어야 합니다.
        프로필에서 학급 코드를 설정해주세요.
      </div>
    );
  }
  if (
    lawsLoading ||
    adminSettingsLoading ||
    govSettingsLoading ||
    userVotesLoading
  ) {
    const loadingParts = [];
    if (lawsLoading) loadingParts.push("법안 목록");
    if (adminSettingsLoading) loadingParts.push("관리자 설정");
    if (govSettingsLoading) loadingParts.push("정부 설정");
    if (userVotesLoading) loadingParts.push("투표 정보");
    return (
      <div className="loading-container">
        {loadingParts.join(", ")} 정보를 불러오는 중...
      </div>
    );
  }

  if (!adminSettings) {
    return (
      <div className="loading-container">관리자 설정을 불러오는 중...</div>
    );
  }

  return (
    <div className="national-assembly-container">
      <div className="assembly-header">
        <h1 className="assembly-title">국회 의사당 (학급: {classCode})</h1>
        <div className="assembly-tabs">
          <button
            className={`assembly-tab ${
              activeTab === "propose" ? "active" : ""
            }`}
            onClick={() => setActiveTab("propose")}
          >
            법안 올리기/심의
          </button>
          <button
            className={`assembly-tab ${
              activeTab === "approved" ? "active" : ""
            }`}
            onClick={() => setActiveTab("approved")}
          >
            우리반 법
          </button>
          <button
            className={`assembly-tab ${activeTab === "vetoed" ? "active" : ""}`}
            onClick={() => setActiveTab("vetoed")}
          >
            재의결 법안
          </button>
          {isAdmin() && (
            <button
              className={`assembly-tab ${
                activeTab === "admin" ? "active" : ""
              }`}
              onClick={() => setActiveTab("admin")}
            >
              관리자 설정
            </button>
          )}
        </div>
      </div>

      <div className="assembly-content">
        {activeTab === "propose" && (
          <>
            <div className="content-actions">
              <button
                onClick={() => {
                  console.log("[NationalAssembly] 새 법안 제안하기 버튼 클릭됨");
                  console.log("[NationalAssembly] showProposeLawModal:", showProposeLawModal);
                  setShowProposeLawModal(true);
                  console.log("[NationalAssembly] setShowProposeLawModal(true) 호출 완료");
                }}
                className="action-button propose-button"
              >
                새 법안 제안하기
              </button>
            </div>
            {sortedLaws.length === 0 ? (
              <div className="empty-state">
                아직 등록되거나 심의중인 법안이 없습니다. 새 법안을
                제안해보세요!
              </div>
            ) : (
              <div className="law-list">
                {sortedLaws.map((law) => (
                  <div key={law.id} className={`law-card ${law.status}`}>
                    <div className="law-content-wrapper">
                      <div className="law-header">
                        <h2 className="law-title">{law.title}</h2>
                        <div className="law-status-container">
                          {getLawStatusDisplay(law)}
                        </div>
                      </div>
                      <div className="law-content">
                        <p>
                          <strong>제안자:</strong>{" "}
                          {law.proposerName || "정보 없음"}
                        </p>
                        <p>
                          <strong>취지:</strong> {law.purpose}
                        </p>
                        <p>
                          <strong>설명:</strong> {law.description}
                        </p>
                        <p>
                          <strong>벌금:</strong> {law.fine}
                        </p>
                        <p className="law-timestamp">
                          제안일: {formatDate(law.timestamp)}
                        </p>
                      </div>
                      <div className="law-footer">
                        <div className="vote-stats">
                          <div className="vote-count">
                            <div className="vote-type approval">
                              찬성:{" "}
                              <span className="vote-number">
                                {law.approvals || 0}
                              </span>
                              {/* ✨ 수정된 부분: 필요 투표 수 안내 문구 변경 */}
                              <span className="vote-required">
                                /13표 필요 (정부 이송)
                              </span>
                            </div>
                            <div className="vote-type disapproval">
                              반대:{" "}
                              <span className="vote-number">
                                {law.disapprovals || 0}
                              </span>
                              <span className="vote-required">
                                /{Math.ceil(adminSettings.totalStudents / 2)}{" "}
                                필요 (부결)
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="action-buttons">
                          {(law.status === "pending" ||
                            ((law.status === "rejected" ||
                              law.status === "auto_rejected") &&
                              law.proposerId === currentUser?.id)) && (
                            <div className="vote-actions">
                              <button
                                onClick={() => handleVote(law.id, "approvals")}
                                className={`vote-button approve ${
                                  !isAdmin() && (userVotes[law.id] ||
                                  (law.voters && law.voters[currentUser?.id]))
                                    ? "voted"
                                    : ""
                                }`}
                                disabled={
                                  !isAdmin() && (userVotes[law.id] ||
                                  (law.voters && law.voters[currentUser?.id]))
                                }
                              >
                                찬성
                              </button>
                              <button
                                onClick={() =>
                                  handleVote(law.id, "disapprovals")
                                }
                                className={`vote-button disapprove ${
                                  !isAdmin() && (userVotes[law.id] ||
                                  (law.voters && law.voters[currentUser?.id]))
                                    ? "voted"
                                    : ""
                                }`}
                                disabled={
                                  !isAdmin() && (userVotes[law.id] ||
                                  (law.voters && law.voters[currentUser?.id]))
                                }
                              >
                                반대
                              </button>
                            </div>
                          )}
                          {(law.status === "rejected" ||
                            law.status === "auto_rejected") &&
                            law.proposerId === currentUser?.id &&
                            !isAdmin() && (
                              <button
                                onClick={() => handleDeleteLaw(law.id)}
                                className="reject-delete-button"
                              >
                                부결 법안 삭제
                              </button>
                            )}
                          {renderAdminActions(law)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "approved" && (
          <div className="approved-laws-container">
            <h2 className="section-title">📜 우리반 법안 목록</h2>
            {approvedLaws.length === 0 ? (
              <div className="empty-state">아직 가결된 법안이 없습니다.</div>
            ) : (
              <div className="law-list">
                {approvedLaws.map((law) => (
                  <div
                    key={law.id}
                    className={`law-card ${law.finalStatus || law.status}`}
                  >
                    <div className="law-content-wrapper">
                      <div className="law-header">
                        <h2 className="law-title">{law.title}</h2>
                        {getLawStatusDisplay(law)}
                      </div>
                      <div className="law-content">
                        <p>
                          <strong>제안자:</strong>{" "}
                          {law.proposerName || "정보 없음"}
                        </p>
                        <p>
                          <strong>취지:</strong> {law.purpose}
                        </p>
                        <p>
                          <strong>설명:</strong> {law.description}
                        </p>
                        <p>
                          <strong>벌금:</strong> {law.fine}
                        </p>
                        <p className="law-timestamp">
                          {law.finalStatus === "final_approved" &&
                          law.finalApprovalDate
                            ? "최종 승인일: "
                            : "가결일: "}
                          {formatDate(law.finalApprovalDate || law.timestamp)}
                        </p>
                      </div>
                      <div className="law-footer">
                        <div className="vote-stats">
                          <div className="vote-count">
                            <div className="vote-type approval">
                              찬성:{" "}
                              <span className="vote-number">
                                {law.approvals || 0}
                              </span>
                            </div>
                            <div className="vote-type disapproval">
                              반대:{" "}
                              <span className="vote-number">
                                {law.disapprovals || 0}
                              </span>
                            </div>
                          </div>
                        </div>
                        {renderAdminActions(law)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "vetoed" && (
          <div className="vetoed-laws-container">
            <h2 className="section-title">🏛️ 재의결 진행 중인 법안</h2>
            {vetoedLaws.length === 0 ? (
              <div className="empty-state">재의결 중인 법안이 없습니다.</div>
            ) : (
              <div className="law-list">
                {vetoedLaws.map((law) => (
                  <div key={law.id} className="law-card vetoed">
                    <div className="law-content-wrapper">
                      <div className="law-header">
                        <h2 className="law-title">{law.title}</h2>
                        {getLawStatusDisplay(law)}
                      </div>
                      <div className="law-content">
                        <p>
                          <strong>제안자:</strong>{" "}
                          {law.proposerName || "정보 없음"}
                        </p>
                        <p>
                          <strong>취지:</strong> {law.purpose}
                        </p>
                        <p>
                          <strong>설명:</strong> {law.description}
                        </p>
                        <p>
                          <strong>벌금:</strong> {law.fine}
                        </p>
                        <p>
                          <strong>거부 사유:</strong>{" "}
                          {law.vetoReason || "사유 없음"}
                        </p>
                        <p>
                          <strong>거부 일시:</strong> {formatDate(law.vetoDate)}
                        </p>
                        <p>
                          <strong>재의결 기한:</strong>{" "}
                          {getRemainingTime(law.vetoDeadline)}
                        </p>
                      </div>
                      <div className="law-footer">
                        <div className="vote-stats">
                          <div className="vote-count">
                            <div className="vote-type approval">
                              찬성:{" "}
                              <span className="vote-number">
                                {law.approvals || 0}
                              </span>
                              <span className="vote-required">
                                /{governmentSettings.vetoOverrideRequired} 필요
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="action-buttons">
                          <div className="vote-actions">
                            <button
                              onClick={() => handleVote(law.id, "approvals")}
                              className={`vote-button approve ${
                                !isAdmin() && (userVotes[law.id] === "approvals" ||
                                (law.voters &&
                                  law.voters[currentUser?.id] === "approvals"))
                                  ? "voted"
                                  : ""
                              }`}
                              disabled={
                                !isAdmin() && (userVotes[law.id] === "approvals" ||
                                (law.voters &&
                                  law.voters[currentUser?.id] === "approvals"))
                              }
                            >
                              재의결 찬성
                            </button>
                          </div>
                          {renderAdminActions(law)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "admin" && isAdmin() && (
          <div className="admin-container">
            <h2 className="section-title">🔒 관리자 설정</h2>
            <div className="admin-content">
              <div className="admin-setting-card">
                <div className="setting-header">
                  <h3>총 학생 수 설정</h3>
                </div>
                <div className="setting-content">
                  <div className="form-group">
                    <div className="student-count-control">
                      <button
                        className="count-button decrease"
                        onClick={() =>
                          setLocalAdminSettings((prev) => ({
                            ...(prev || adminSettings),
                            totalStudents: Math.max(
                              1,
                              ((prev || adminSettings).totalStudents || 25) - 1
                            ),
                          }))
                        }
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        className="setting-input student-count"
                        value={(localAdminSettings || adminSettings).totalStudents || 25}
                        onChange={(e) =>
                          setLocalAdminSettings((prev) => ({
                            ...(prev || adminSettings),
                            totalStudents: Math.max(
                              1,
                              parseInt(e.target.value) || 1
                            ),
                          }))
                        }
                      />
                      <button
                        className="count-button increase"
                        onClick={() =>
                          setLocalAdminSettings((prev) => ({
                            ...(prev || adminSettings),
                            totalStudents: ((prev || adminSettings).totalStudents || 25) + 1,
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="setting-info">
                    <p>
                      가결/부결 필요 투표 수:{" "}
                      <strong>
                        {Math.ceil(((localAdminSettings || adminSettings).totalStudents || 25) / 2)}
                      </strong>
                      명
                    </p>
                  </div>
                  <button
                    onClick={handleSaveAdminSettings}
                    className="admin-button save-settings-button"
                  >
                    학생 수 저장
                  </button>
                </div>
              </div>

              <div className="admin-setting-card">
                <div className="setting-header">
                  <h3>재의결 설정</h3>
                </div>
                <div className="setting-content">
                  <div className="form-group">
                    <label className="form-label">
                      재의결 필요 찬성수 (현재:{" "}
                      {(localGovSettings || governmentSettings).vetoOverrideRequired ||
                        Math.ceil(
                          (adminSettings.totalStudents || 25) * (2 / 3)
                        )}
                      )
                    </label>
                    <div className="student-count-control">
                      <button
                        className="count-button decrease"
                        onClick={() =>
                          setLocalGovSettings((prev) => ({
                            ...(prev || governmentSettings),
                            vetoOverrideRequired: Math.max(
                              1,
                              ((prev || governmentSettings).vetoOverrideRequired || 1) - 1
                            ),
                          }))
                        }
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max={adminSettings.totalStudents || 25}
                        className="setting-input student-count"
                        value={(localGovSettings || governmentSettings).vetoOverrideRequired || ""}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          const maxVal = adminSettings.totalStudents || 25;
                          setLocalGovSettings((prev) => ({
                            ...(prev || governmentSettings),
                            vetoOverrideRequired: Math.max(
                              1,
                              Math.min(val || 1, maxVal)
                            ),
                          }));
                        }}
                      />
                      <button
                        className="count-button increase"
                        onClick={() =>
                          setLocalGovSettings((prev) => ({
                            ...(prev || governmentSettings),
                            vetoOverrideRequired: Math.min(
                              adminSettings.totalStudents || 25,
                              ((prev || governmentSettings).vetoOverrideRequired || 0) + 1
                            ),
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="setting-info">
                    <p className="setting-description">
                      거부권 행사 후 법안이 최종 가결되기 위해 필요한 찬성표
                      수입니다.
                    </p>
                  </div>
                  <button
                    onClick={handleSaveGovernmentSettings}
                    className="admin-button save-settings-button"
                  >
                    재의결 설정 저장
                  </button>
                </div>
              </div>

              <div className="admin-setting-card">
                <div className="setting-header">
                  <h3>법안 관리</h3>
                </div>
                <div className="setting-content">
                  <p>
                    법안 개수: <strong>{laws?.length || 0}</strong>개
                  </p>
                  <p>
                    가결된 법안: <strong>{approvedLaws.length}</strong>개
                  </p>
                  <p>
                    심의/부결 법안: <strong>{pendingLaws.length}</strong>개
                  </p>
                  <p>
                    재의결 중인 법안: <strong>{vetoedLaws.length}</strong>개
                  </p>
                  <button
                    className="admin-button danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          "모든 법안을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
                        )
                      ) {
                        const batch = writeBatch(db);
                        laws.forEach((law) => {
                          const lawDocRef = doc(
                            db,
                            "classes",
                            classCode,
                            "nationalAssemblyLaws",
                            law.id
                          );
                          batch.delete(lawDocRef);
                        });
                        // 사용자 투표 이력 문서들도 삭제 (선택적, 주의 필요)
                        // 예를 들어 모든 userVotes 문서를 가져와서 삭제하는 로직 추가 가능
                        batch
                          .commit()
                          .then(() => {
                            alert("모든 법안이 삭제되었습니다.");
                          })
                          .catch((err) => {
                            console.error("Error deleting all laws:", err);
                            alert("모든 법안 삭제 중 오류가 발생했습니다.");
                          });
                      }
                    }}
                  >
                    모든 법안 삭제
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === "admin" && !isAdmin() && (
          <div className="empty-state">
            관리자만 접근할 수 있는 페이지입니다.
          </div>
        )}
      </div>

      {showProposeLawModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            console.log("[NationalAssembly] 모달 오버레이 클릭됨 (닫기)");
            setShowProposeLawModal(false);
          }}
        >
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">✍️ 새 법안 제안</h2>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label className="form-label">법안 제목</label>
                <input
                  type="text"
                  className="form-input"
                  value={newLaw.title}
                  onChange={(e) =>
                    setNewLaw({ ...newLaw, title: e.target.value })
                  }
                  placeholder="법안의 제목을 입력하세요"
                />
              </div>
              <div className="form-group">
                <label className="form-label">법안 취지</label>
                <input
                  type="text"
                  className="form-input"
                  value={newLaw.purpose}
                  onChange={(e) =>
                    setNewLaw({ ...newLaw, purpose: e.target.value })
                  }
                  placeholder="법안의 취지를 간략히 설명하세요"
                />
              </div>
              <div className="form-group">
                <label className="form-label">법안 설명</label>
                <textarea
                  className="form-textarea"
                  rows="3"
                  value={newLaw.description}
                  onChange={(e) =>
                    setNewLaw({ ...newLaw, description: e.target.value })
                  }
                  placeholder="법안에 대한 자세한 설명을 작성하세요"
                ></textarea>
              </div>
              <div className="form-group">
                <label className="form-label">벌금</label>
                <input
                  type="text"
                  className="form-input"
                  value={newLaw.fine}
                  onChange={(e) =>
                    setNewLaw({ ...newLaw, fine: e.target.value })
                  }
                  placeholder="위반 시 벌금 (예: 5,000원)"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => {
                  console.log("[NationalAssembly] 취소 버튼 클릭됨");
                  setShowProposeLawModal(false);
                }}
                className="modal-button cancel"
              >
                취소
              </button>
              <button
                onClick={() => {
                  console.log("[NationalAssembly] 제안하기 버튼 클릭됨");
                  console.log("[NationalAssembly] 버튼 disabled 상태:", !newLaw.title || !newLaw.description || !newLaw.fine);
                  handleProposeLaw();
                }}
                className="modal-button submit"
                disabled={!newLaw.title || !newLaw.description || !newLaw.fine}
              >
                제안하기
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditLawModal && editingLaw && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowEditLawModal(false);
            setEditingLaw(null);
          }}
        >
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">✏️ 법안 수정</h2>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label className="form-label">법안 제목</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingLaw.title}
                  onChange={(e) =>
                    setEditingLaw({ ...editingLaw, title: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">법안 취지</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingLaw.purpose}
                  onChange={(e) =>
                    setEditingLaw({ ...editingLaw, purpose: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">법안 설명</label>
                <textarea
                  className="form-textarea"
                  rows="3"
                  value={editingLaw.description}
                  onChange={(e) =>
                    setEditingLaw({
                      ...editingLaw,
                      description: e.target.value,
                    })
                  }
                ></textarea>
              </div>
              <div className="form-group">
                <label className="form-label">벌금</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingLaw.fine}
                  onChange={(e) =>
                    setEditingLaw({ ...editingLaw, fine: e.target.value })
                  }
                />
              </div>
              {isAdmin() && (
                <div className="form-group">
                  <label className="form-label">상태</label>
                  <select
                    className="form-input"
                    value={editingLaw.status}
                    onChange={(e) =>
                      setEditingLaw({ ...editingLaw, status: e.target.value })
                    }
                  >
                    <option value="pending">심의중</option>
                    <option value="pending_government_approval">정부 이송</option>
                    <option value="approved">가결됨</option>
                    <option value="rejected">부결됨</option>
                    <option value="vetoed">거부권 행사됨</option>
                    <option value="veto_overridden">재의결 가결됨</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                onClick={() => {
                  setShowEditLawModal(false);
                  setEditingLaw(null);
                }}
                className="modal-button cancel"
              >
                취소
              </button>
              <button
                onClick={handleSaveEditLaw}
                className="modal-button submit"
                disabled={
                  !editingLaw.title ||
                  !editingLaw.description ||
                  !editingLaw.fine
                }
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NationalAssembly;