// src/components/AlchanLayout.js
// 알찬 UI 메인 레이아웃 컴포넌트 - Tailwind CSS 버전

import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import AlchanSidebar, { AppIcon } from './AlchanSidebar';
import AlchanHeader from './AlchanHeader';
import MobileNav from './MobileNav';
import PWAInstallPrompt from './PWAInstallPrompt';
import UpdateNotification from './UpdateNotification';
import { useServiceWorker } from '../hooks/useServiceWorker';
import { AlchanLoadingScreen } from './ui/Skeleton';
import { WifiOff } from 'lucide-react';

// 페이지 컴포넌트 imports
import Dashboard from '../Dashboard';
import ItemStore from '../ItemStore';
import MyItems from '../MyItems';
import MyAssets from '../MyAssets';
import ItemMarket from '../ItemMarket';
import Login from '../Login';
import AdminItemPage from '../AdminItemPage';
import AdminPage from '../AdminPage';
import LearningBoard from '../LearningBoard';
import MusicRequest from '../MusicRequest';
import MusicRoom from '../MusicRoom';
import StudentRequest from '../StudentRequest';
import AdminPanel from '../AdminPanel';
import Banking from '../Banking';
import StockExchange from '../StockExchange';
import RealEstateRegistry from '../RealEstateRegistry';
import NationalAssembly from '../NationalAssembly';
import Government from '../Government';
import Court from '../Court';
import PoliceStation from '../PoliceStation';
import Auction from '../Auction';
import MoneyTransfer from '../MoneyTransfer';
import AdminDatabase from '../AdminDatabase';
import CouponTransfer from '../CouponTransfer';
import CouponGoalPage from '../CouponGoalPage';
import FirestoreDoctor from '../FirestoreDoctor';
import RecoverDonations from '../RecoverDonations';
import GonuGame from '../GonuGame';
import OmokGame from '../OmokGame';
import ChessGame from '../ChessGame';
import TypingPracticeGame from '../TypingPracticeGame';
import StudentManager from './StudentManager';

// 전체 화면이 필요한 페이지 경로 (자동으로 사이드바 접기)
const FULLSCREEN_PAGES = [
  '/learning-games/omok',
  '/learning-games/science',
  '/learning-games/typing',
  '/gonu-game',
  '/auction',
  '/court',
  '/national-assembly',
  '/music-room',
];

// 공통 로딩 컴포넌트 - 항상 통일된 보라색 전체화면 로딩 사용
const AlchanLoading = ({ message = '로딩 중...' }) => {
  return <AlchanLoadingScreen message={message} />;
};

// Protected Route 컴포넌트
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AlchanLoading />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

// Admin Route 컴포넌트
const AdminRoute = ({ children }) => {
  const { user, userDoc, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AlchanLoading />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isAdmin = userDoc?.isAdmin || userDoc?.role === "admin" || userDoc?.isSuperAdmin;
  if (!isAdmin) {
    return <Navigate to="/dashboard/tasks" replace />;
  }

  return children;
};

// 선생님/관리자 Route 컴포넌트
const TeacherRoute = ({ children }) => {
  const { user, userDoc, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AlchanLoading />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isTeacher = userDoc?.isTeacher || userDoc?.isAdmin || userDoc?.isSuperAdmin;
  if (!isTeacher) {
    return <Navigate to="/dashboard/tasks" replace />;
  }

  return children;
};

// 메인 레이아웃 컴포넌트
export default function AlchanLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userDoc, loading, logout } = useAuth();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showUpdateDismissed, setShowUpdateDismissed] = useState(false);

  // PWA 서비스 워커 훅
  const { updateAvailable, updateServiceWorker, isOnline } = useServiceWorker();

  // Jua 폰트 로드
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Jua&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      if (document.head.contains(link)) {
        document.head.removeChild(link);
      }
    };
  }, []);

  // 전체 화면 페이지에서 자동으로 사이드바 접기
  useEffect(() => {
    const isFullscreenPage = FULLSCREEN_PAGES.some(page => location.pathname.startsWith(page));
    if (isFullscreenPage && !isMobile) {
      setIsSidebarCollapsed(true);
    }
  }, [location.pathname, isMobile]);

  // 화면 크기 감지
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const toggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
  }, []);

  // 🔥 비로그인 상태면 즉시 로그인 페이지로 리다이렉트 (흰화면 방지)
  if (!loading && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 로딩 상태 (loading 중이거나, 로그인했는데 userDoc 아직 없음)
  if (loading || (user && !userDoc)) {
    return <AlchanLoading />;
  }

  // 로그인 페이지 (이미 로그인했으면 대시보드로)
  if (location.pathname === '/login') {
    return user ? <Navigate to="/dashboard/tasks" replace /> : <Login />;
  }

  // 학급 코드 없음
  if (!userDoc.classCode) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">학급 코드가 필요합니다</h2>
          <p className="text-gray-500 mb-6">
            선생님께 학급 코드를 받아 입력해주세요.
          </p>
          <button
            onClick={() => logout()}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  const userClassCode = userDoc?.classCode;

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 flex">
      {/* PC 사이드바 */}
      <AlchanSidebar
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        isCollapsed={isSidebarCollapsed}
      />

      {/* 메인 콘텐츠 영역 - 스크롤 문제 수정 */}
      <main className="flex-1 min-w-0 md:min-h-screen relative bg-slate-50/50 overflow-visible">
        {/* 헤더 */}
        <AlchanHeader
          toggleSidebar={toggleSidebar}
          isMobile={isMobile}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebarCollapse={toggleSidebarCollapse}
        />

        {/* 콘텐츠 영역 */}
        <div className="w-full pb-20 md:pb-4">
          <Routes>
            {/* 메인 페이지 */}
            <Route path="/dashboard/tasks" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/my-assets" element={<ProtectedRoute><MyAssets /></ProtectedRoute>} />
            <Route path="/coupon-goal" element={<ProtectedRoute><CouponGoalPage /></ProtectedRoute>} />

            {/* 게임 */}
            <Route path="/learning-games/omok" element={<ProtectedRoute><OmokGame /></ProtectedRoute>} />
            <Route path="/learning-games/typing" element={<ProtectedRoute><TypingPracticeGame /></ProtectedRoute>} />
            <Route path="/learning-games/science" element={<ProtectedRoute><ChessGame /></ProtectedRoute>} />
            <Route path="/gonu-game" element={<ProtectedRoute><GonuGame /></ProtectedRoute>} />

            {/* 아이템 */}
            <Route path="/item-shop" element={<ProtectedRoute><ItemStore /></ProtectedRoute>} />
            <Route path="/my-items" element={<ProtectedRoute><MyItems /></ProtectedRoute>} />
            <Route path="/item-market" element={<ProtectedRoute><ItemMarket /></ProtectedRoute>} />

            {/* 금융 */}
            <Route path="/banking" element={<ProtectedRoute><Banking /></ProtectedRoute>} />
            <Route path="/stock-trading" element={<ProtectedRoute><StockExchange /></ProtectedRoute>} />
            <Route path="/auction" element={<ProtectedRoute><Auction /></ProtectedRoute>} />
            <Route path="/real-estate" element={<ProtectedRoute><RealEstateRegistry /></ProtectedRoute>} />

            {/* 공공기관 */}
            <Route path="/government" element={<ProtectedRoute><Government /></ProtectedRoute>} />
            <Route path="/national-assembly" element={<ProtectedRoute><NationalAssembly /></ProtectedRoute>} />
            <Route path="/court" element={<ProtectedRoute><Court /></ProtectedRoute>} />
            <Route path="/police" element={<ProtectedRoute><PoliceStation /></ProtectedRoute>} />

            {/* 게시판 */}
            <Route path="/learning-board" element={<ProtectedRoute><LearningBoard /></ProtectedRoute>} />
            <Route path="/learning-board/music-request" element={<ProtectedRoute><MusicRequest user={user} /></ProtectedRoute>} />
            <Route path="/music-room/:roomId" element={<ProtectedRoute><MusicRoom user={user} /></ProtectedRoute>} />
            <Route path="/student-request/:roomId" element={<StudentRequest />} />

            {/* 관리자 페이지 */}
            <Route path="/admin/app-settings" element={<AdminRoute><Dashboard adminTabMode="generalSettings" /></AdminRoute>} />
            <Route path="/admin/job-settings" element={<AdminRoute><Dashboard adminTabMode="jobSettings" /></AdminRoute>} />
            <Route path="/admin/app-management" element={<AdminRoute><Dashboard adminTabMode="appManagement" /></AdminRoute>} />
            <Route path="/admin/coupon-transfer" element={<AdminRoute><CouponTransfer /></AdminRoute>} />
            <Route path="/admin/money-transfer" element={<AdminRoute><MoneyTransfer /></AdminRoute>} />
            <Route path="/admin/activity-log" element={<AdminRoute><AdminDatabase /></AdminRoute>} />
            <Route path="/admin/items" element={<AdminRoute><AdminItemPage /></AdminRoute>} />
            <Route path="/admin/page" element={<AdminRoute><AdminPage /></AdminRoute>} />
            <Route path="/admin-panel" element={<AdminRoute><AdminPanel onClose={() => navigate(-1)} classCode={userClassCode} /></AdminRoute>} />
            <Route path="/admin/students" element={<TeacherRoute><StudentManager /></TeacherRoute>} />

            {/* 유틸리티 */}
            <Route path="/doctor" element={<ProtectedRoute><FirestoreDoctor /></ProtectedRoute>} />
            <Route path="/recover-donations" element={<ProtectedRoute><RecoverDonations /></ProtectedRoute>} />

            {/* 기본 리다이렉트 */}
            <Route path="/" element={<Navigate to="/dashboard/tasks" replace />} />
            <Route path="*" element={<Navigate to="/dashboard/tasks" replace />} />
          </Routes>
        </div>

        {/* 푸터 - PC만 */}
        <footer className="hidden md:block py-8 text-center text-sm text-gray-400 font-medium">
          © 2025 알찬 Corp. All rights reserved.
        </footer>
      </main>

      {/* 모바일 하단 네비게이션 */}
      <MobileNav />

      {/* PWA 설치 프롬프트 */}
      <PWAInstallPrompt />

      {/* 업데이트 알림 */}
      {updateAvailable && !showUpdateDismissed && (
        <UpdateNotification
          onUpdate={updateServiceWorker}
          onDismiss={() => setShowUpdateDismissed(true)}
        />
      )}

      {/* 오프라인 알림 */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white text-center py-2 text-sm font-medium z-50 flex items-center justify-center gap-2">
          <WifiOff size={16} />
          오프라인 상태입니다. 일부 기능이 제한될 수 있습니다.
        </div>
      )}

      {/* 전역 스타일 */}
      <style>{`
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
        .font-jua { font-family: 'Jua', sans-serif; }
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow { animation: spin-slow 2s linear infinite; }
      `}</style>
    </div>
  );
}

// AlchanLoading 컴포넌트 export
export { AlchanLoading };
