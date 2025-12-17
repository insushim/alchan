// src/components/AlchanHeader.js
// 알찬 UI 헤더 컴포넌트 - 새로운 슬레이트 기반 디자인

import React, { useState, useRef, useEffect, memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { verifyClassCode } from '../firebase';
import {
  Menu, Bell, X, LogOut, User, Key, Building2, Trash2,
  ChevronLeft, ChevronRight, Sparkles, Gift, Settings, LayoutDashboard, Wallet
} from 'lucide-react';
import SettingsPanel from './SettingsPanel';
import Avatar from './Avatar';
import { getAvatarConfig } from '../utils/avatarSystem';
import { getLevelInfo } from '../utils/levelSystem';
import { getUserAchievements, getAchievementById } from '../utils/achievementSystem';

// 금액 포맷
const formatMoney = (amount) => {
  if (amount >= 100000000) {
    const ok = Math.floor(amount / 100000000);
    const man = Math.floor((amount % 100000000) / 10000);
    if (man > 0) return `${ok}억 ${man.toLocaleString()}만`;
    return `${ok}억`;
  }
  if (amount >= 10000) {
    const man = Math.floor(amount / 10000);
    return `${man.toLocaleString()}만`;
  }
  return new Intl.NumberFormat('ko-KR').format(amount);
};

// 모달 컴포넌트
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1a2e] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-700 bg-gradient-to-r from-[#141423] to-indigo-900/20 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

const AlchanHeader = memo(({ toggleSidebar, isMobile, isSidebarCollapsed, onToggleSidebarCollapse }) => {
  const navigate = useNavigate();
  const { user, userDoc, logout, updateUser, changePassword, deleteCurrentUserAccount, loginWithEmailPassword } = useAuth();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const userMenuRef = useRef(null);

  const [activeModal, setActiveModal] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // 닉네임
  const [newNickname, setNewNickname] = useState("");
  const [nicknameError, setNicknameError] = useState("");

  // 비밀번호
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // 학급 코드
  const [newClassCodeInput, setNewClassCodeInput] = useState("");
  const [classCodeError, setClassCodeError] = useState("");
  const [classCodeSuccess, setClassCodeSuccess] = useState(false);

  const isCurrentUserAdmin = userDoc?.isAdmin || userDoc?.role === "admin" || userDoc?.isSuperAdmin;
  const displayName = userDoc?.name || userDoc?.nickname || user?.displayName || "사용자";

  let userRole = "학생";
  if (userDoc?.isSuperAdmin) userRole = "앱 관리자";
  else if (userDoc?.isAdmin) userRole = "교사";

  // 아바타, 레벨, 업적 정보
  const avatarConfig = useMemo(() => {
    if (user?.uid) return getAvatarConfig(user.uid);
    return null;
  }, [user?.uid]);

  const levelInfo = useMemo(() => {
    const cash = Number(userDoc?.cash) || 0;
    const stockValue = Number(userDoc?.stockValue) || 0;
    const realEstateValue = Number(userDoc?.realEstateValue) || 0;
    const itemValue = Number(userDoc?.itemValue) || 0;
    const netAssets = cash + stockValue + realEstateValue + itemValue;
    return getLevelInfo(netAssets);
  }, [userDoc?.cash, userDoc?.stockValue, userDoc?.realEstateValue, userDoc?.itemValue]);

  const bestAchievement = useMemo(() => {
    if (!user?.uid) return null;
    const achievements = getUserAchievements(user.uid);
    if (achievements.length === 0) return null;

    const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
    const sorted = [...achievements].sort((a, b) => {
      const achA = getAchievementById(a.id);
      const achB = getAchievementById(b.id);
      return (rarityOrder[achA?.rarity] || 99) - (rarityOrder[achB?.rarity] || 99);
    });

    return getAchievementById(sorted[0].id);
  }, [user?.uid]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const closeModal = () => {
    setActiveModal(null);
    setNicknameError("");
    setPasswordError("");
    setPasswordSuccess(false);
    setClassCodeError("");
    setClassCodeSuccess(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleLogout = async () => {
    if (logout) {
      await logout();
      navigate('/login');
    }
    setShowUserMenu(false);
  };

  // 닉네임 변경
  const handleChangeNickname = () => {
    setNewNickname(userDoc?.name || userDoc?.nickname || "");
    setActiveModal('nickname');
    setShowUserMenu(false);
  };

  const saveNickname = async () => {
    const trimmed = newNickname.trim();
    if (!trimmed) return setNicknameError("닉네임을 입력해주세요.");
    if (trimmed.length < 2) return setNicknameError("닉네임은 최소 2자 이상이어야 합니다.");
    if (trimmed.length > 12) return setNicknameError("닉네임은 최대 12자까지 가능합니다.");

    setIsLoading(true);
    try {
      const success = await updateUser({ name: trimmed });
      if (success) {
        alert("닉네임이 변경되었습니다.");
        closeModal();
      } else {
        setNicknameError("변경에 실패했습니다.");
      }
    } catch (error) {
      setNicknameError(`오류: ${error.message}`);
    }
    setIsLoading(false);
  };

  // 비밀번호 변경
  const handleChangePassword = () => {
    setActiveModal('password');
    setShowUserMenu(false);
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) return setPasswordError("모든 필드를 입력해주세요.");
    if (newPassword.length < 6) return setPasswordError("새 비밀번호는 6자 이상이어야 합니다.");
    if (newPassword !== confirmPassword) return setPasswordError("비밀번호가 일치하지 않습니다.");

    setIsLoading(true);
    try {
      await loginWithEmailPassword(user.email, currentPassword, true);
      await changePassword(newPassword);
      setPasswordSuccess(true);
      setTimeout(closeModal, 2000);
    } catch (error) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setPasswordError("현재 비밀번호가 올바르지 않습니다.");
      } else {
        setPasswordError(`오류: ${error.message}`);
      }
    }
    setIsLoading(false);
  };

  // 학급 코드
  const handleEnterClassCode = () => {
    setNewClassCodeInput(userDoc?.classCode || "");
    setActiveModal('classCode');
    setShowUserMenu(false);
  };

  const saveClassCode = async () => {
    const trimmed = newClassCodeInput.trim().toUpperCase();
    if (!trimmed) return setClassCodeError("학급 코드를 입력해주세요.");

    setIsLoading(true);
    try {
      const isValid = await verifyClassCode(trimmed);
      if (!isValid) {
        setClassCodeError(`'${trimmed}'는 유효하지 않은 학급 코드입니다.`);
        setIsLoading(false);
        return;
      }

      const success = await updateUser({ classCode: trimmed });
      if (success) {
        setClassCodeSuccess(true);
        setTimeout(() => {
          alert(`학급 코드가 '${trimmed}'로 변경되었습니다!`);
          closeModal();
        }, 1000);
      } else {
        setClassCodeError("저장에 실패했습니다.");
      }
    } catch (error) {
      setClassCodeError(`오류: ${error.message}`);
    }
    setIsLoading(false);
  };

  // 계정 삭제
  const handleDeleteAccount = async () => {
    setShowUserMenu(false);
    const confirmation = window.prompt("정말로 계정을 삭제하시려면 '계정삭제'라고 입력해주세요.");
    if (confirmation === '계정삭제') {
      const password = window.prompt("현재 비밀번호를 입력해주세요.");
      if (password) {
        try {
          await loginWithEmailPassword(user.email, password, true);
          await deleteCurrentUserAccount();
          alert("계정이 삭제되었습니다.");
        } catch (error) {
          alert(`삭제 오류: ${error.message}`);
        }
      }
    }
  };

  return (
    <>
      {/* 모바일 헤더 */}
      <header className="md:hidden sticky top-0 z-30 bg-[#141423] border-b border-[#00fff2]/10">
        {/* 상단 헤더 바 */}
        <div className="h-14 px-3 flex items-center justify-between">
          {/* 왼쪽: 메뉴 버튼 + 앱 이름 */}
          <div className="flex items-center gap-2">
            <button onClick={toggleSidebar} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
              <LayoutDashboard size={22} className="text-white" />
            </button>
            <h2 className="text-sm font-bold text-white whitespace-nowrap">
              오늘도 <span className="text-[#00fff2]">알찬</span> 하루!
            </h2>
          </div>

          {/* 오른쪽: 레벨/업적 + 아바타 */}
          <div className="flex items-center gap-2">
            {/* 레벨 & 업적 배지 */}
            <div
              onClick={() => navigate('/my-profile')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer"
              style={{ background: 'rgba(167, 139, 250, 0.2)' }}
            >
              <span style={{ fontSize: '14px' }}>{levelInfo?.icon || '🌟'}</span>
              <div className="flex flex-col leading-none">
                <span style={{ fontSize: '9px', color: '#9ca3af' }}>LEVEL</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: levelInfo?.color || '#a78bfa' }}>
                  {levelInfo?.level || 1}
                </span>
              </div>
              {bestAchievement && (
                <span style={{ fontSize: '14px', marginLeft: '2px' }}>{bestAchievement.icon}</span>
              )}
            </div>

            {/* 아바타 */}
            <div
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-10 h-10 rounded-xl overflow-hidden cursor-pointer"
              style={{
                border: `2px solid ${levelInfo?.color || '#a78bfa'}`,
                boxShadow: `0 0 8px ${levelInfo?.color || '#a78bfa'}40`
              }}
            >
              <Avatar config={avatarConfig} size={36} />
            </div>
          </div>
        </div>

        {/* 모바일 자산 정보 바 */}
        <div className="px-4 pb-3 flex gap-3">
          {/* 현금 */}
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-emerald-900/10 rounded-xl border border-emerald-500/20">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
              <span className="font-bold text-xs">₩</span>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider leading-none">현금</p>
              <p className="text-sm font-bold text-white truncate">{formatMoney(userDoc?.cash || 0)}원</p>
            </div>
          </div>

          {/* 쿠폰 */}
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-rose-900/10 rounded-xl border border-rose-500/20">
            <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
              <Gift size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] text-rose-400 font-bold uppercase tracking-wider leading-none">쿠폰</p>
              <p className="text-sm font-bold text-white truncate">{userDoc?.coupons || 0}개</p>
            </div>
          </div>
        </div>
      </header>

      {/* PC 헤더 */}
      <header
        className="hidden md:flex items-center justify-between bg-[#141423] border-b border-[#00fff2]/10 shadow-sm z-10"
        style={{ height: '64px', minHeight: '64px', maxHeight: '64px', padding: '0 16px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* 사이드바 토글 버튼 */}
          <button
            onClick={onToggleSidebarCollapse}
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: '1px solid rgba(0, 255, 242, 0.1)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', color: 'white', whiteSpace: 'nowrap', lineHeight: '1.2' }}>
              오늘도 <span style={{ color: '#00fff2', fontFamily: "'Jua', sans-serif" }}>알찬</span> 하루! 👋
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap', lineHeight: '1.2' }}>{displayName}님 환영합니다</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* 현금 위젯 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: '8px',
            color: '#34d399'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#10b981',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '12px'
            }}>₩</div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: '600', opacity: 0.7, lineHeight: '1.2' }}>현금</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap', lineHeight: '1.2' }}>{formatMoney(userDoc?.cash || 0)}원</div>
            </div>
          </div>

          {/* 쿠폰 위젯 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            background: 'rgba(244, 63, 94, 0.1)',
            borderRadius: '8px',
            color: '#fb7185'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#f43f5e',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}><Gift size={14} /></div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: '600', opacity: 0.7, lineHeight: '1.2' }}>쿠폰</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap', lineHeight: '1.2' }}>{userDoc?.coupons || 0}개</div>
            </div>
          </div>

          {/* 레벨 & 업적 위젯 */}
          <div
            onClick={() => navigate('/my-profile')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              background: `rgba(167, 139, 250, 0.1)`,
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(167, 139, 250, 0.2)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(167, 139, 250, 0.1)'}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: levelInfo?.color || '#a78bfa',
              fontSize: '14px',
            }}>
              {levelInfo?.icon || '🌟'}
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: '600', color: levelInfo?.color || '#a78bfa', lineHeight: '1.2' }}>
                Lv.{levelInfo?.level || 1}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#e8e8ff', whiteSpace: 'nowrap', lineHeight: '1.2' }}>
                {levelInfo?.title || '새싹'}
              </div>
            </div>
            {bestAchievement && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginLeft: '4px',
                padding: '2px 6px',
                background: bestAchievement.rarity === 'legendary' ? 'rgba(245, 158, 11, 0.2)' :
                           bestAchievement.rarity === 'epic' ? 'rgba(167, 139, 250, 0.2)' :
                           bestAchievement.rarity === 'rare' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                borderRadius: '4px',
              }}>
                <span style={{ fontSize: '12px' }}>{bestAchievement.icon}</span>
              </div>
            )}
          </div>

          {/* 사용자 메뉴 */}
          <div style={{ position: 'relative' }} ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                paddingLeft: '12px',
                borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'white', whiteSpace: 'nowrap', lineHeight: '1.2' }}>{displayName}</div>
                <div style={{ fontSize: '11px', color: '#818cf8', fontWeight: '500', whiteSpace: 'nowrap', lineHeight: '1.2' }}>{userRole}</div>
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/my-profile');
                }}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  border: `2px solid ${levelInfo?.color || '#a78bfa'}`,
                  cursor: 'pointer',
                }}
              >
                <Avatar config={avatarConfig} size={36} />
              </div>
            </button>

            {/* 드롭다운 메뉴 */}
            {showUserMenu && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-[#1a1a2e] rounded-2xl shadow-2xl border border-slate-700 overflow-hidden z-50">
                <div className="px-5 py-4 bg-gradient-to-r from-[#141423] to-indigo-900/20 border-b border-slate-700">
                  <p className="font-bold text-white">{displayName}</p>
                  <p className="text-sm text-slate-400 flex items-center gap-2 mt-1">
                    {isCurrentUserAdmin && <span className="text-indigo-400 font-semibold">관리자</span>}
                    {userDoc?.classCode && <span>학급: {userDoc.classCode}</span>}
                  </p>
                </div>

                {/* 모바일: 자산 정보 */}
                <div className="md:hidden px-5 py-4 bg-[#141423]/50 border-b border-slate-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-slate-400">현금</span>
                    <span className="font-bold text-emerald-400">{formatMoney(userDoc?.cash || 0)}원</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">쿠폰</span>
                    <span className="font-bold text-rose-400">{userDoc?.coupons || 0}개</span>
                  </div>
                </div>

                <div className="p-2">
                  {/* 내 프로필 - 첫 번째로 배치 */}
                  <button
                    onClick={() => { navigate('/my-profile'); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-white hover:bg-indigo-600/20 transition-colors bg-indigo-500/10 border border-indigo-500/30 mb-2"
                  >
                    <User size={18} className="text-indigo-400" />
                    내 프로필
                    <span className="ml-auto text-xs text-indigo-400">Lv.{levelInfo?.level || 0}</span>
                  </button>

                  <div className="h-px bg-slate-700 my-2" />

                  <button onClick={handleChangeNickname} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors">
                    <User size={18} className="text-slate-500" />
                    닉네임 변경
                  </button>
                  <button onClick={handleChangePassword} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors">
                    <Key size={18} className="text-slate-500" />
                    비밀번호 변경
                  </button>
                  <button onClick={handleEnterClassCode} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors">
                    <Building2 size={18} className="text-slate-500" />
                    학급 코드 변경
                  </button>
                  <button onClick={() => { setShowSettings(true); setShowUserMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors">
                    <Settings size={18} className="text-slate-500" />
                    설정
                  </button>

                  <div className="h-px bg-slate-700 my-2" />

                  <button onClick={handleDeleteAccount} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-900/10 transition-colors">
                    <Trash2 size={18} />
                    계정 삭제
                  </button>

                  <div className="h-px bg-slate-700 my-2" />

                  <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors">
                    <LogOut size={18} className="text-slate-500" />
                    로그아웃
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 모달들 */}
      <Modal isOpen={activeModal === 'nickname'} onClose={closeModal} title="닉네임 변경">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">새 닉네임</label>
            <input
              type="text"
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              placeholder="2-12자"
              maxLength={12}
              className="w-full px-4 py-3 border-2 border-slate-700 bg-[#141423] text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />
          </div>
          {nicknameError && <p className="text-sm text-red-400 bg-red-900/10 p-3 rounded-xl">{nicknameError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={closeModal} className="flex-1 py-3 border border-slate-700 rounded-xl text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors">취소</button>
            <button onClick={saveNickname} disabled={isLoading} className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50">
              {isLoading ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'password'} onClose={closeModal} title="비밀번호 변경">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">현재 비밀번호</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-4 py-3 border-2 border-slate-700 bg-[#141423] text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">새 비밀번호</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-3 border-2 border-slate-700 bg-[#141423] text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">비밀번호 확인</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-3 border-2 border-slate-700 bg-[#141423] text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          {passwordError && <p className="text-sm text-red-400 bg-red-900/10 p-3 rounded-xl">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm text-green-400 bg-green-900/10 p-3 rounded-xl">비밀번호가 변경되었습니다!</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={closeModal} className="flex-1 py-3 border border-slate-700 rounded-xl text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors">취소</button>
            <button onClick={savePassword} disabled={isLoading || passwordSuccess} className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50">
              {isLoading ? "변경 중..." : "변경"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'classCode'} onClose={closeModal} title="학급 코드 변경">
        <div className="space-y-4">
          {userDoc?.classCode && (
            <p className="text-sm text-slate-400 bg-slate-800/50 p-3 rounded-xl">
              현재 학급 코드: <strong className="text-white">{userDoc.classCode}</strong>
            </p>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">새 학급 코드</label>
            <input
              type="text"
              value={newClassCodeInput}
              onChange={(e) => setNewClassCodeInput(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
              placeholder="영문자와 숫자만"
              maxLength={20}
              className="w-full px-4 py-3 border-2 border-slate-700 bg-[#141423] text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-2">영문자와 숫자만 입력 가능합니다.</p>
          </div>
          {classCodeError && <p className="text-sm text-red-400 bg-red-900/10 p-3 rounded-xl">{classCodeError}</p>}
          {classCodeSuccess && <p className="text-sm text-green-400 bg-green-900/10 p-3 rounded-xl">학급 코드가 저장되었습니다!</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={closeModal} className="flex-1 py-3 border border-slate-700 rounded-xl text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors">취소</button>
            <button onClick={saveClassCode} disabled={isLoading} className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50">
              {isLoading ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </Modal>

      {/* 설정 패널 */}
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </>
  );
});

export default AlchanHeader;
