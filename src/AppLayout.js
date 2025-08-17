// src/AppLayout.js 수정본
import React, { useState, useEffect, useContext } from "react"; // useContext 제거 가능
import { useLocation, useNavigate } from "react-router-dom";
// ===> AuthContext 직접 import 제거 <===
// import AuthContext from "./AuthContext";

// ===> 공식 useAuth 훅 import <===
import { useAuth } from "./App"; // App.js에서 export된 useAuth 사용

import Sidebar from "./Sidebar";
import Header from "./Header";
import "./sidebar.css";
import "./Header.css";

const AppLayout = ({ children, sidebarMenuItems }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fullscreenMenu, setFullscreenMenu] = useState(false);

  // ===> useAuth 훅 사용으로 변경 <===
  const auth = useAuth();
  // auth 객체가 로드되기 전일 수 있으므로 optional chaining 사용 권장
  const user = auth?.user; // auth가 null/undefined일 수 있음을 처리

  const location = useLocation();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // 모바일 상태 변경 시 사이드바 상태 초기화 (기존 로직 유지)
      setSidebarOpen(false);
      setFullscreenMenu(false);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => {
    if (isMobile) {
      setFullscreenMenu(!fullscreenMenu);
      setSidebarOpen(false); // 전체 화면 메뉴 열면 사이드바는 닫힘
    } else {
      setSidebarOpen(!sidebarOpen);
      setFullscreenMenu(false); // 데스크탑 사이드바 열면 전체 메뉴는 닫힘
    }
  };

  const closeSidebar = () => {
    setFullscreenMenu(false);
    setSidebarOpen(false);
  };

  // 현재 페이지 ID 찾기 (오류 가능성 방지 - item.path null 체크 추가)
  const getCurrentPageId = () => {
    const currentPath = location.pathname;
    const matchedItem = sidebarMenuItems?.find(
      // sidebarMenuItems가 없을 경우 대비
      (item) =>
        item &&
        item.path && // item 및 item.path 유효성 검사
        (currentPath === item.path || currentPath.startsWith(`${item.path}/`))
    );
    return matchedItem ? matchedItem.id : "dashboard"; // 기본값 dashboard
  };

  const handleNavigate = (pageId) => {
    const menuItem = sidebarMenuItems?.find(
      (item) => item && item.id === pageId
    );
    if (menuItem && menuItem.path) {
      navigate(menuItem.path);
      closeSidebar(); // 네비게이션 후 사이드바 닫기
    }
  };

  // user 객체가 로드된 후에 필터링 수행
  const filteredMenuItems = React.useMemo(() => {
    if (!sidebarMenuItems) return []; // 메뉴 아이템 없으면 빈 배열
    return sidebarMenuItems.filter(
      (item) => item && (!item.adminOnly || (user && user.isAdmin)) // user와 isAdmin 속성 존재 확인
    );
  }, [sidebarMenuItems, user]); // user 정보 변경 시 메뉴 다시 필터링

  // auth 로딩 상태 추가 (useAuth 훅에서 loading 상태 제공 가정)
  if (auth && auth.loading) {
    return <div>레이아웃 로딩중...</div>; // 또는 다른 로딩 표시
  }

  return (
    // flex-col 제거하고 flex 사용, 높이 관리 조정
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <Header
        toggleSidebar={toggleSidebar}
        isMenuOpen={fullscreenMenu || sidebarOpen}
      />

      {/* Sidebar 영역 (z-index 조정 및 조건부 렌더링 명확화) */}
      {/* 전체 화면 메뉴 (모바일 전용) */}
      {isMobile && fullscreenMenu && (
        <div className="fixed inset-0 z-40 pt-[80px] bg-white overflow-y-auto">
          <Sidebar
            isOpen={true}
            onNavigate={handleNavigate}
            currentPage={getCurrentPageId()}
            menuItems={filteredMenuItems}
            isFullscreen={true}
            onClose={closeSidebar}
          />
        </div>
      )}

      {/* 데스크탑 사이드바 (모바일 아닐 때 & 열려 있을 때) */}
      {!isMobile && sidebarOpen && (
        <div
          className="fixed top-[80px] left-0 z-30 h-[calc(100vh-80px)] sidebar-container transition-transform duration-300 ease-in-out"
          // transform 속성 대신 width 직접 제어 또는 AppLayout의 margin-left 조정과 연동
          // style={{ width: '260px' }} // 사이드바 너비 고정
        >
          <Sidebar
            isOpen={true}
            onNavigate={handleNavigate}
            currentPage={getCurrentPageId()}
            menuItems={filteredMenuItems}
            isFullscreen={false}
            onClose={closeSidebar} // 데스크탑에서도 닫기 버튼 필요 시
          />
        </div>
      )}

      {/* 메인 콘텐츠 영역 (마진 조정 로직 개선) */}
      <div
        className="flex-1 overflow-hidden" // flex-col 제거
        style={{
          paddingTop: "80px", // Header 높이만큼 패딩
          // 데스크탑에서 사이드바 열렸을 때만 margin 적용
          marginLeft: !isMobile && sidebarOpen ? "260px" : "0",
          transition: "margin-left 0.3s ease",
        }}
      >
        {/* 실제 페이지 내용 */}
        <main className="flex-1 overflow-y-auto p-4 h-full">{children}</main>
      </div>

      {/* 모바일 메뉴 오버레이 (전체 화면 메뉴 열렸을 때만) */}
      {isMobile && fullscreenMenu && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30" // 사이드바보다 낮은 z-index
          onClick={closeSidebar}
        />
      )}
    </div>
  );
};

export default AppLayout;
