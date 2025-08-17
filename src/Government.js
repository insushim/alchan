// src/Government.js
import React, { useState } from "react";
import "./Government.css"; // 스타일 임포트
import OrganizationChart from "./OrganizationChart";
import NationalTaxService from "./NationalTaxService";
import Investment from "./Investment";
import SendReceive from "./SendReceive";
import { useAuth } from "./AuthContext"; // 👈 [1] useAuth 훅 임포트

const Government = () => {
  const { userDoc } = useAuth(); // 👈 [2] userDoc 가져오기
  const classCode = userDoc?.classCode; // 👈 [3] classCode 추출

  // 탭 상태 관리. 기본값 'orgChart'
  const [activeTab, setActiveTab] = useState("orgChart");

  // 탭 버튼 클릭 핸들러
  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
  };

  // 탭 콘텐츠 렌더링 함수
  const renderTabContent = () => {
    if (!classCode) {
      // 👈 [4] classCode가 없으면 로딩 또는 안내 메시지 표시
      return (
        <p>학급 정보를 불러오는 중이거나, 학급 코드가 할당되지 않았습니다.</p>
      );
    }

    switch (activeTab) {
      case "orgChart":
        return <OrganizationChart classCode={classCode} />; // 👈 [5] classCode 전달
      case "tax":
        return <NationalTaxService classCode={classCode} />; // 👈 [5] classCode 전달
      case "investment":
        return <Investment classCode={classCode} />; // 👈 [5] classCode 전달
      case "transfer":
        return <SendReceive classCode={classCode} />; // 👈 [5] classCode 전달
      default:
        return <OrganizationChart classCode={classCode} />; // 👈 [5] classCode 전달
    }
  };

  return (
    <div className="government-container">
      <h1 className="government-header">
        정부 ({classCode ? `학급: ${classCode}` : "학급 정보 없음"})
      </h1>

      {/* 탭 메뉴 */}
      <div className="government-tabs">
        <button
          className={`gov-tab-button ${
            activeTab === "orgChart" ? "active" : ""
          }`}
          onClick={() => handleTabClick("orgChart")}
          disabled={!classCode} // 👈 [6] classCode가 없으면 버튼 비활성화
        >
          법안 관리
        </button>
        <button
          className={`gov-tab-button ${activeTab === "tax" ? "active" : ""}`}
          onClick={() => handleTabClick("tax")}
          disabled={!classCode} // 👈 [6] classCode가 없으면 버튼 비활성화
        >
          국세청
        </button>
        <button
          className={`gov-tab-button ${
            activeTab === "investment" ? "active" : ""
          }`}
          onClick={() => handleTabClick("investment")}
          disabled={!classCode} // 👈 [6] classCode가 없으면 버튼 비활성화
        >
          투자하기
        </button>
        <button
          className={`gov-tab-button ${
            activeTab === "transfer" ? "active" : ""
          }`}
          onClick={() => handleTabClick("transfer")}
          disabled={!classCode} // 👈 [6] classCode가 없으면 버튼 비활성화
        >
          보내기/가져오기
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="government-tab-content">{renderTabContent()}</div>
    </div>
  );
};

export default Government;
