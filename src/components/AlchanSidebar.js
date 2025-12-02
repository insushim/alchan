// src/components/AlchanSidebar.js
// 알찬 UI 사이드바 컴포넌트 - Tailwind CSS 버전

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import {
  X, ChevronRight, ChevronDown,
  LayoutDashboard, Wallet, Target, Gamepad2, Package, TrendingUp,
  Landmark, FileText, Crown, ShoppingBag, Building2, Music,
  Settings, Users, Banknote, Scale, Shield, Sparkles, LogOut,
  Boxes, Store, RefreshCw, Hammer, BarChart3, BookOpen, Keyboard, Circle
} from 'lucide-react';

// "알찬" 부분을 강조 표시하는 헬퍼 함수
const renderAlchanLabel = (label) => {
  if (label.includes('알찬')) {
    const parts = label.split('알찬');
    return (
      <>
        {parts[0]}<span className="text-indigo-500 font-jua">알찬</span>{parts[1]}
      </>
    );
  }
  return label;
};

// 메뉴 구조 정의 - "알찬" 접두어 적용
export const ALCHAN_MENU_ITEMS = [
  // Main - 알찬 메인
  { id: 'todayTasks', label: '알찬 오늘의 할일', icon: LayoutDashboard, path: '/dashboard/tasks', category: 'main' },
  { id: 'myAssets', label: '알찬 나의 자산', icon: Wallet, path: '/my-assets', category: 'main' },
  { id: 'couponGoal', label: '알찬 쿠폰 목표', icon: Target, path: '/coupon-goal', category: 'main' },

  // Games Category - 알찬 학습 게임
  { id: 'gamesCategory', label: '알찬 학습 게임', icon: Gamepad2, isCategory: true, category: 'play' },
  { id: 'omokGame', label: '오목', icon: Circle, path: '/learning-games/omok', parentId: 'gamesCategory' },
  { id: 'typingGame', label: '타자연습', icon: Keyboard, path: '/learning-games/typing', parentId: 'gamesCategory' },
  { id: 'gonuGame', label: '고누 게임', icon: Gamepad2, path: '/gonu-game', parentId: 'gamesCategory' },
  { id: 'chessGame', label: '체스 게임', icon: Crown, path: '/learning-games/science', parentId: 'gamesCategory' },

  // Items Category - 알찬 아이템
  { id: 'itemsCategory', label: '알찬 아이템', icon: Package, isCategory: true, category: 'economy' },
  { id: 'myItems', label: '내 아이템', icon: Boxes, path: '/my-items', parentId: 'itemsCategory' },
  { id: 'itemStore', label: '아이템 상점', icon: Store, path: '/item-shop', parentId: 'itemsCategory' },
  { id: 'itemMarket', label: '아이템 시장', icon: RefreshCw, path: '/item-market', parentId: 'itemsCategory' },

  // Finance Category - 알찬 금융
  { id: 'financeCategory', label: '알찬 금융', icon: TrendingUp, isCategory: true, category: 'economy' },
  { id: 'banking', label: '은행', icon: Banknote, path: '/banking', parentId: 'financeCategory' },
  { id: 'stockTrading', label: '주식 거래소', icon: BarChart3, path: '/stock-trading', parentId: 'financeCategory' },
  { id: 'auction', label: '경매장', icon: Hammer, path: '/auction', parentId: 'financeCategory' },
  { id: 'realEstate', label: '부동산', icon: Building2, path: '/real-estate', parentId: 'financeCategory' },

  // Public Category - 알찬 공공기관
  { id: 'publicCategory', label: '알찬 공공기관', icon: Landmark, isCategory: true, category: 'society' },
  { id: 'government', label: '정부', icon: Landmark, path: '/government', parentId: 'publicCategory' },
  { id: 'nationalAssembly', label: '국회', icon: Users, path: '/national-assembly', parentId: 'publicCategory' },
  { id: 'court', label: '법원', icon: Scale, path: '/court', parentId: 'publicCategory' },
  { id: 'policeStation', label: '경찰서', icon: Shield, path: '/police', parentId: 'publicCategory' },

  // Board Category - 알찬 게시판
  { id: 'boardCategory', label: '알찬 게시판', icon: FileText, isCategory: true, category: 'community' },
  { id: 'learningBoard', label: '학습 게시판', icon: BookOpen, path: '/learning-board', parentId: 'boardCategory' },
  { id: 'musicRequest', label: '음악 신청', icon: Music, path: '/learning-board/music-request', parentId: 'boardCategory' },

  // Admin Category - 알찬 관리자
  { id: 'adminCategory', label: '알찬 관리자', icon: Crown, isCategory: true, category: 'admin', adminOnly: true },
  { id: 'studentManagement', label: '학생 관리', icon: Users, path: '/admin/students', parentId: 'adminCategory', adminOnly: true },
  { id: 'adminAppSettings', label: '앱 설정', icon: Settings, path: '/admin/app-settings', parentId: 'adminCategory', adminOnly: true },
  { id: 'couponTransfer', label: '쿠폰 보내기/가져오기', icon: Target, path: '/admin/coupon-transfer', parentId: 'adminCategory', adminOnly: true },
  { id: 'moneyTransfer', label: '돈 보내기/가져오기', icon: Banknote, path: '/admin/money-transfer', parentId: 'adminCategory', adminOnly: true },
  { id: 'activityLog', label: '데이터베이스', icon: FileText, path: '/admin/activity-log', parentId: 'adminCategory', adminOnly: true },
  { id: 'adminPage', label: '관리자 제어판', icon: Settings, path: '/admin/page', parentId: 'adminCategory', adminOnly: true },
];

// 카테고리 라벨
const CATEGORY_LABELS = {
  main: '메인',
  play: '게임',
  economy: '경제',
  society: '사회',
  community: '커뮤니티',
  admin: '관리',
};

// 메뉴 아이템 컴포넌트
const MenuItem = ({ item, isActive, onClick, isChild = false }) => {
  const Icon = item.icon;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
        isActive
          ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100/50'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
      } ${isChild ? 'ml-4 pl-6 border-l-2 border-gray-100' : ''}`}
    >
      <Icon
        size={isChild ? 18 : 20}
        className={`transition-colors flex-shrink-0 ${
          isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'
        }`}
      />
      <span className="flex-1 text-left truncate">{renderAlchanLabel(item.label)}</span>
      {isActive && <ChevronRight size={16} className="opacity-70 flex-shrink-0" />}
    </button>
  );
};

// 카테고리 컴포넌트
const CategoryItem = ({ category, children, isExpanded, onToggle, hasActiveChild }) => {
  const Icon = category.icon;

  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
          hasActiveChild
            ? 'bg-indigo-50/50 text-indigo-700'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <Icon
          size={20}
          className={`transition-colors flex-shrink-0 ${
            hasActiveChild ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'
          }`}
        />
        <span className="flex-1 text-left">{renderAlchanLabel(category.label)}</span>
        <ChevronDown
          size={16}
          className={`transition-transform duration-300 opacity-50 flex-shrink-0 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="py-1 space-y-1">
          {children}
        </div>
      </div>
    </div>
  );
};

// 메인 사이드바 컴포넌트
export default function AlchanSidebar({ isOpen, onClose, isCollapsed = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { userDoc, logout } = useAuth();

  const [expandedCategories, setExpandedCategories] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const isActive = (path) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const hasActiveChild = (categoryId) => {
    return ALCHAN_MENU_ITEMS.some(item =>
      item.parentId === categoryId && isActive(item.path)
    );
  };

  const handleItemClick = (item) => {
    if (item.path) {
      navigate(item.path);
      if (isMobile) onClose?.();
    }
  };

  const handleLogout = async () => {
    if (logout) {
      await logout();
      navigate('/login');
    }
  };

  const isAdmin = userDoc?.isAdmin || userDoc?.isSuperAdmin;
  const isSuperAdmin = userDoc?.isSuperAdmin;

  let userRole = "학생";
  if (userDoc?.isSuperAdmin) userRole = "앱 관리자";
  else if (userDoc?.isAdmin) userRole = "교사";

  const userName = userDoc?.name || userDoc?.nickname || "사용자";

  // 카테고리별 메뉴 렌더링
  const renderMenuSection = (categoryKey) => {
    const items = ALCHAN_MENU_ITEMS.filter(item => {
      if (item.category !== categoryKey) return false;
      if (item.adminOnly && !isAdmin) return false;
      if (item.superAdminOnly && !isSuperAdmin) return false;
      return true;
    });

    if (items.length === 0) return null;

    return (
      <div key={categoryKey} className="mb-4">
        <div className="text-xs font-semibold text-gray-400 mb-2 px-2 uppercase tracking-wider">
          {CATEGORY_LABELS[categoryKey]}
        </div>
        {items.map(item => {
          if (item.isCategory) {
            const childItems = ALCHAN_MENU_ITEMS.filter(child => {
              if (child.parentId !== item.id) return false;
              if (child.adminOnly && !isAdmin) return false;
              if (child.superAdminOnly && !isSuperAdmin) return false;
              return true;
            });

            if (childItems.length === 0) return null;

            return (
              <CategoryItem
                key={item.id}
                category={item}
                isExpanded={expandedCategories[item.id] || hasActiveChild(item.id)}
                onToggle={() => toggleCategory(item.id)}
                hasActiveChild={hasActiveChild(item.id)}
              >
                {childItems.map(child => (
                  <MenuItem
                    key={child.id}
                    item={child}
                    isActive={isActive(child.path)}
                    onClick={() => handleItemClick(child)}
                    isChild
                  />
                ))}
              </CategoryItem>
            );
          } else if (!item.parentId) {
            return (
              <MenuItem
                key={item.id}
                item={item}
                isActive={isActive(item.path)}
                onClick={() => handleItemClick(item)}
              />
            );
          }
          return null;
        })}
      </div>
    );
  };

  // PC 접힌 상태일 때
  if (isCollapsed && !isMobile) {
    return (
      <aside className="hidden md:flex flex-col w-20 bg-white/80 backdrop-blur-xl border-r border-gray-200/50 h-screen sticky top-0 left-0 z-50 shadow-sm transition-all duration-300">
        {/* 로고 */}
        <div className="p-4 border-b border-gray-100/50 flex justify-center">
          <div className="bg-gradient-to-tr from-indigo-600 to-violet-500 text-white p-2 rounded-2xl shadow-lg shadow-indigo-200/50">
            <Sparkles size={24} className="text-yellow-300" fill="currentColor" />
          </div>
        </div>

        {/* 아이콘 메뉴 */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-2">
          {ALCHAN_MENU_ITEMS.filter(item => !item.parentId && !item.isCategory).map(item => {
            if (item.adminOnly && !isAdmin) return null;
            if (item.superAdminOnly && !isSuperAdmin) return null;
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                title={item.label}
                className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center transition-all duration-200 ${
                  active
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200/50'
                    : 'bg-white border border-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
                }`}
              >
                <Icon size={24} />
              </button>
            );
          })}

          <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent my-4" />

          {ALCHAN_MENU_ITEMS.filter(item => item.isCategory).map(item => {
            if (item.adminOnly && !isAdmin) return null;
            const Icon = item.icon;
            const hasActive = hasActiveChild(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleCategory(item.id)}
                title={item.label}
                className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center transition-all duration-200 ${
                  hasActive
                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                    : 'bg-white border border-gray-100 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <Icon size={24} />
              </button>
            );
          })}
        </nav>

        {/* 사용자 아바타 */}
        <div className="p-4 border-t border-gray-100/50">
          <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-tr from-indigo-100 to-violet-100 flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm">
            {userName.charAt(0)}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <>
      {/* 모바일 오버레이 */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* 사이드바 - PC에서는 항상 보이고, 모바일에서는 isOpen에 따라 표시 */}
      <aside
        className={`
          top-0 left-0 h-screen z-50
          w-64 bg-white/80 backdrop-blur-xl border-r border-gray-200/50 shadow-sm
          flex-col transition-transform duration-300 ease-out flex-shrink-0
          ${isMobile
            ? `fixed ${isOpen ? 'flex' : 'hidden'}`
            : 'hidden md:flex sticky'
          }
        `}
      >
        {/* 로고 영역 */}
        <div className="p-6 border-b border-gray-100/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="bg-gradient-to-tr from-indigo-600 to-violet-500 text-white p-2 rounded-2xl shadow-lg shadow-indigo-200/50 rotate-3 hover:rotate-0 transition-transform">
                <Sparkles size={24} className="text-yellow-300" fill="currentColor" />
              </div>
              <div className="absolute inset-0 bg-indigo-400/20 rounded-2xl blur-lg -z-10"></div>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight leading-none font-jua">
                알찬
              </h1>
              <span className="text-indigo-600 text-[10px] font-bold uppercase tracking-wider bg-indigo-50/50 px-1.5 py-0.5 rounded-md">
                Alchan
              </span>
            </div>
          </div>
          {isMobile && (
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-400"
            >
              <X size={24} />
            </button>
          )}
        </div>

        {/* 메뉴 리스트 */}
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          {renderMenuSection('main')}
          {renderMenuSection('play')}
          {renderMenuSection('economy')}
          {renderMenuSection('society')}
          {renderMenuSection('community')}
          {renderMenuSection('admin')}
        </nav>

        {/* 사용자 정보 푸터 */}
        {userDoc && (
          <div className="p-4 border-t border-gray-100/50 bg-gray-50/30">
            <div
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/80 transition-colors cursor-pointer border border-transparent hover:border-gray-200/50 hover:shadow-sm group"
              onClick={handleLogout}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-100 to-violet-100 flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm">
                {userName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{userName}</p>
                <p className="text-xs text-gray-500 truncate">{userRole}</p>
              </div>
              <LogOut size={16} className="text-gray-400 group-hover:text-red-500 transition-colors" />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
