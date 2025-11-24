// src/Government.js
import React, { useState, useEffect, useCallback } from "react";
import "./Government.css";
import "./NationalAssembly.css"; // 법안 카드 스타일 재사용
import NationalTaxService from "./NationalTaxService";
import Investment from "./Investment";
import SendReceive from "./SendReceive";
import { useAuth } from "./AuthContext";
import { usePolling } from "./hooks/usePolling";
import { db } from "./firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  // orderBy, // orderBy는 잠시 사용하지 않습니다.
} from "firebase/firestore";

// 날짜 포맷팅 헬퍼 함수
const formatDate = (dateString) => {
    if (!dateString) return "정보 없음";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "유효하지 않은 날짜";
      return `${date.getFullYear()}년 ${
        date.getMonth() + 1
      }월 ${date.getDate()}일`;
    } catch (e) {
      return "날짜 변환 오류";
    }
  };

// 법안 관리 컴포넌트
const LawManagement = ({ classCode }) => {
  const [laws, setLaws] = useState([]);
  const { isAdmin, userDoc } = useAuth();

  const { data: jobs } = usePolling(
    async () => {
      if (!classCode) return [];
      const jobsRef = collection(db, "jobs");
      const q = query(jobsRef, where("classCode", "==", classCode));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    },
    {
      // 🔥 [최적화] 1분 → 5분으로 변경 (읽기 비용 절감)
      interval: 300000,
      enabled: !!classCode,
      deps: [classCode],
    }
  );

  // 대통령 또는 관리자 권한 확인 함수
  const canManageLaws = useCallback(() => {
    if (isAdmin()) return true;
    if (!userDoc?.selectedJobIds || !jobs || jobs.length === 0) return false;
    const selectedJobs = jobs.filter(job => userDoc.selectedJobIds.includes(job.id));
    return selectedJobs.some(job => job.title === '대통령');
  }, [isAdmin, userDoc, jobs]);

  // 법안 데이터 가져오기 함수
  const fetchLaws = async () => {
    if (!classCode) {
      return;
    }

    try {
      const lawsCollectionRef = collection(
        db,
        "classes",
        classCode,
        "nationalAssemblyLaws"
      );

      const q = query(
        lawsCollectionRef,
        where("status", "==", "pending_government_approval")
      );

      const querySnapshot = await getDocs(q);
      const loadedLaws = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setLaws(loadedLaws);
    } catch (error) {
      console.error("Error fetching pending laws:", error);
      alert("정부 이송 법안을 불러오는 데 실패했습니다. 콘솔을 확인해주세요.");
    }
  };

  // usePolling hook 사용 (30초 간격)
  const { loading, refetch } = usePolling(fetchLaws, { interval: 300000, enabled: !!classCode });

  // 법안 승인 핸들러
  const handleApprove = async (lawId) => {
    if (!canManageLaws()) {
        alert("대통령 또는 관리자만 법안을 승인할 수 있습니다.");
        return;
    }
    if(window.confirm("이 법안을 최종 승인하시겠습니까?")) {
        const lawDocRef = doc(db, "classes", classCode, "nationalAssemblyLaws", lawId);
        try {
            await updateDoc(lawDocRef, {
                status: "approved",
                finalStatus: "final_approved",
                finalApprovalDate: serverTimestamp(),
            });
            alert("법안이 최종 승인되었습니다.");
            refetch(); // 즉시 데이터 갱신
        } catch (error) {
            console.error("Error approving law:", error);
            alert("법안 승인 중 오류가 발생했습니다.");
        }
    }
  };

  // 거부권 행사 핸들러
  const handleVeto = async (lawId) => {
    if (!canManageLaws()) {
        alert("대통령 또는 관리자만 거부권을 행사할 수 있습니다.");
        return;
    }
    const reason = prompt("거부권 행사 사유를 입력해주세요.");
    if (reason && reason.trim() !== "") {
        const lawDocRef = doc(db, "classes", classCode, "nationalAssemblyLaws", lawId);
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 7); // 재의결 기한: 7일

        try {
            await updateDoc(lawDocRef, {
                status: "vetoed",
                vetoReason: reason,
                vetoDate: serverTimestamp(),
                vetoDeadline: deadline,
                approvals: 0,
                disapprovals: 0,
                voters: {},
            });
            alert("거부권이 행사되었습니다. 해당 법안은 국회에서 재의결 절차를 거칩니다.");
            refetch(); // 즉시 데이터 갱신
        } catch (error) {
            console.error("Error vetoing law:", error);
            alert("거부권 행사 중 오류가 발생했습니다.");
        }
    } else {
        alert("거부 사유를 반드시 입력해야 합니다.");
    }
  };

  if (loading) {
    return <p>정부로 이송된 법안을 불러오는 중입니다...</p>;
  }

  return (
    <div className="law-management-container">
      <h2>정부 이송 법안 목록</h2>
      {laws.length === 0 ? (
        <div className="empty-state">현재 정부로 이송된 법안이 없습니다.</div>
      ) : (
        <div className="law-list">
          {laws.map((law) => (
            <div key={law.id} className="law-card pending-gov">
              <div className="law-content-wrapper">
                <div className="law-header">
                  <h3 className="law-title">{law.title}</h3>
                  <span className="law-status pending-gov">정부 심의중</span>
                </div>
                <div className="law-content">
                    <p><strong>제안자:</strong> {law.proposerName || "정보 없음"}</p>
                    <p><strong>취지:</strong> {law.purpose}</p>
                    <p><strong>설명:</strong> {law.description}</p>
                    <p><strong>벌금:</strong> {law.fine}</p>
                    <p className="law-timestamp">국회 통과일: {formatDate(law.approvalDate?.toDate().toISOString())}</p>
                </div>
                {canManageLaws() && (
                    <div className="law-footer government-actions">
                        <button onClick={() => handleApprove(law.id)} className="gov-action-button approve">승인</button>
                        <button onClick={() => handleVeto(law.id)} className="gov-action-button veto">거부권 행사</button>
                    </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


const Government = () => {
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;

  const [activeTab, setActiveTab] = useState("lawManage");

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
  };

  const renderTabContent = () => {
    if (!classCode) {
      return (
        <p>학급 정보를 불러오는 중이거나, 학급 코드가 할당되지 않았습니다.</p>
      );
    }

    switch (activeTab) {
      case "lawManage":
        return <LawManagement classCode={classCode} />;
      case "tax":
        return <NationalTaxService classCode={classCode} />;
      case "investment":
        return <Investment classCode={classCode} />;
      case "transfer":
        return <SendReceive classCode={classCode} />;
      default:
        return <LawManagement classCode={classCode} />;
    }
  };

  return (
    <div className="government-container">
      <h1 className="government-header">
        정부 ({classCode ? `학급: ${classCode}` : "학급 정보 없음"})
      </h1>

      <div className="government-tabs">
        <button
          className={`gov-tab-button ${
            activeTab === "lawManage" ? "active" : ""
          }`}
          onClick={() => handleTabClick("lawManage")}
          disabled={!classCode}
        >
          법안 관리
        </button>
        <button
          className={`gov-tab-button ${activeTab === "tax" ? "active" : ""}`}
          onClick={() => handleTabClick("tax")}
          disabled={!classCode}
        >
          국세청
        </button>
        <button
          className={`gov-tab-button ${
            activeTab === "investment" ? "active" : ""
          }`}
          onClick={() => handleTabClick("investment")}
          disabled={!classCode}
        >
          투자하기
        </button>
        <button
          className={`gov-tab-button ${
            activeTab === "transfer" ? "active" : ""
          }`}
          onClick={() => handleTabClick("transfer")}
          disabled={!classCode}
        >
          보내기/가져오기
        </button>
      </div>

      <div className="government-tab-content">{renderTabContent()}</div>
    </div>
  );
};

export default Government;