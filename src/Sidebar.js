// src/Sidebar.js 수정본 (오류 해결 및 onNavigate 호출 수정 완료)
import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

// 올바른 import 방식: useAuth 직접 import
import { useAuth } from "./AuthContext";

import "./sidebar.css"; // 사이드바 스타일

export default function Sidebar({
  isOpen, // App.js로부터 전달받는 사이드바 열림 상태 값
  menuItems,
  onNavigate, // onNavigate prop (페이지 이동 함수)
  currentPage, // 현재 사용되지 않지만 props로 유지
  isFullscreen = false,
  onClose = () => {}, // App.js로부터 전달받는 사이드바 닫기 함수
}) {
  const location = useLocation();
  // useAuth 훅 사용
  const auth = useAuth();
  // auth 객체 및 user 속성 존재 여부 안전하게 확인
  const user = auth?.user;
  // isAdmin 상태 계산 (user?.isAdmin 우선 확인)
  const isAdmin = user?.isAdmin || user?.role === "admin" || false;

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [expandedCategories, setExpandedCategories] = useState({});

  // 메뉴 아이템 기반 초기 카테고리 확장 상태 설정
  useEffect(() => {
    const initialExpanded = {};
    (menuItems || []).forEach((item) => {
      if (item?.isCategory) {
        // item 유효성 체크
        initialExpanded[item.id] =
          item.id === "myAssetsCategory" ? true : !isMobile;
      }
    });
    setExpandedCategories(initialExpanded);
  }, [menuItems, isMobile]);

  // 카테고리 토글
  const toggleCategory = (categoryId) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  // 메뉴 활성화 상태 확인
  const isActive = (item) => {
    if (!item?.path) return false; // item 및 path 유효성 체크
    // 현재 경로가 메뉴 아이템 경로와 정확히 일치하거나 하위 경로일 때 활성
    return (
      location.pathname === item.path ||
      location.pathname.startsWith(`${item.path}/`)
    );
  };

  // 메뉴 클릭 핸들러
  const handleItemClick = (item) => {
    console.log(
      "사이드바 메뉴 클릭됨 (Sidebar.js):",
      item?.id,
      "경로:",
      item?.path
    ); // Sidebar 측 로그 추가 및 item?. 사용
    // onNavigate 호출 시 item 객체 전체를 전달하도록 수정
    if (item?.path && onNavigate) {
      onNavigate(item); // <-- 여기서 item 객체 전체를 전달합니다.
    }
  };

  // 아이콘 렌더링 (기존 코드 유지)
  const renderIcon = (icon, isCategory = false, itemName = "") => {
    const className = isCategory
      ? "sidebar-category-icon larger-icon"
      : "sidebar-menu-item-icon";
    const iconMap = {
      /* ... 아이콘 매핑 ... */
    };
    const nameToUse = itemName || (typeof icon === "string" ? icon : "");
    const customIcon = iconMap[nameToUse] || icon || "📁";
    return <span className={className}>{customIcon}</span>;
  };

  // 닫기 버튼 렌더링 (기존 코드 유지)
  const renderCloseButton = () => {
    if (isFullscreen) {
      return (
        <div className="sidebar-header">
          <div className="sidebar-title-container">
            <span className="menu-text">닫기</span>
          </div>
          <button onClick={onClose} className="close-sidebar-button">
            ✕
          </button>
        </div>
      );
    }
    return null;
  };

  // '나의 자산' 헤더 렌더링 (기존 코드 유지)
  const renderMyAssetsHeader = () => {
    const myAssetsItem = menuItems?.find((item) => item?.id === "dashboard"); // item 유효성 체크
    if (myAssetsItem) {
      const isItemActive = isActive(myAssetsItem);
      return (
        <div
          className={`sidebar-my-assets ${isItemActive ? "active" : ""}`}
          onClick={() => handleItemClick(myAssetsItem)} // handleItemClick에 myAssetsItem 객체 전달
        >
          {renderIcon(myAssetsItem.icon, false, myAssetsItem.name)}
          <span>{myAssetsItem.name}</span>
        </div>
      );
    }
    return null;
  };

  // 메뉴 항목 렌더링 (기존 코드 유지, 관리자 체크 강화)
  const renderMenuItems = () => {
    if (!menuItems?.length) return null; // menuItems 유효성 체크

    const renderedItems = [];
    menuItems.forEach((item) => {
      if (!item) return; // item 유효성 체크
      if (item.adminOnly && !isAdmin) return; // 관리자 체크
      if (item.id === "dashboard") return; // 나의 자산 헤더에서 처리

      if (item.isCategory) {
        const isCategoryActive = menuItems.some(
          (subItem) =>
            subItem &&
            !subItem.isCategory &&
            subItem.categoryId === item.id &&
            isActive(subItem)
        );
        renderedItems.push(
          <div key={item.id} className="sidebar-category">
            <div
              className={`sidebar-category-header ${
                isCategoryActive ? "active" : ""
              }`}
              onClick={() => toggleCategory(item.id)}
            >
              {renderIcon(item.icon, true, item.name)}
              <span className="sidebar-category-title">{item.name}</span>
              <span
                className={`sidebar-category-arrow ${
                  expandedCategories[item.id] ? "expanded" : ""
                }`}
              >
                ▼
              </span>
            </div>
            <div
              className={`sidebar-category-items ${
                expandedCategories[item.id] ? "expanded" : ""
              }`}
            >
              {menuItems
                .filter(
                  (subItem) =>
                    subItem &&
                    !subItem.isCategory &&
                    subItem.categoryId === item.id
                )
                .map((subItem) => {
                  if (subItem.adminOnly && !isAdmin) return null; // 하위 항목 관리자 체크
                  const isItemActive = isActive(subItem);
                  return (
                    <div
                      key={subItem.id}
                      className={`sidebar-menu-item ${
                        isItemActive ? "active" : ""
                      }`}
                      onClick={() => handleItemClick(subItem)} // handleItemClick에 subItem 객체 전달
                    >
                      {renderIcon(subItem.icon, false, subItem.name)}
                      <span>{subItem.name}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        );
      } else if (!item.categoryId) {
        // 최상위 메뉴 항목
        const isItemActive = isActive(item);
        renderedItems.push(
          <div
            key={item.id}
            className={`sidebar-menu-item top-level ${
              isItemActive ? "active" : ""
            }`}
            onClick={() => handleItemClick(item)} // handleItemClick에 item 객체 전달
          >
            {renderIcon(item.icon, false, item.name)}
            <span>{item.name}</span>
          </div>
        );
      }
    });
    return renderedItems;
  };

  // Sidebar 최종 렌더링
  return (
    <div
      className={`sidebar ${isOpen ? "open" : "closed"} ${
        isFullscreen ? "fullscreen" : ""
      }`}
    >
      {/* 사이드바 헤더 (닫기 버튼 포함) - 이 부분은 Fullscreen 모드에서만 렌더링됩니다. */}
      {isFullscreen && ( // Fullscreen일 때만 닫기 버튼 포함 헤더 렌더링
        <div className="fullscreen-menu-header">
          {" "}
          {/* CSS 클래스 이름 확인 */}
          <div className="sidebar-title-container">
            {/* 제목 추가 또는 아이콘/텍스트 유지 */}
            <span className="fullscreen-menu-title">메뉴</span>{" "}
            {/* 예시 제목 */}
          </div>
          {/* 닫기 버튼 */}
          <button onClick={onClose} className="close-menu-button">
            {" "}
            {/* CSS 클래스 이름 확인 */}✕
          </button>
        </div>
      )}
      {/* 나의 자산 헤더 - Fullscreen 모드가 아닐 때 또는 항상 필요시 유지 */}
      {!isFullscreen && renderMyAssetsHeader()}{" "}
      {/* Fullscreen이 아닐 때만 렌더링 */}
      {/* 메뉴 항목 목록 */}
      <div className="sidebar-menu-list">{renderMenuItems()}</div>
      {/* 하단 사용자 정보 (user 유효성 체크) */}
      {user && (
        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar">
              {user.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div>
              <p className="sidebar-user-name">{user.name || "사용자"}</p>{" "}
              {/* user.username 대신 user.name 사용 가정 */}
              <p className="sidebar-user-role">{isAdmin ? "관리자" : "학생"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
