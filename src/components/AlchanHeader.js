// src/components/AlchanHeader.js
// 알찬 UI 헤더 컴포넌트 - 새로운 슬레이트 기반 디자인

import React, { useState, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { verifyClassCode } from '../firebase';
import {
  Menu, Bell, X, LogOut, User, Key, Building2, Trash2,
  ChevronLeft, ChevronRight, Sparkles, Gift, Settings, LayoutDashboard, Wallet
} from 'lucide-react';
import SettingsPanel from './SettingsPanel';

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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/30 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
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
      <header className="md:hidden sticky top-0 z-30 bg-white border-b border-slate-200">
        {/* 상단 헤더 바 */}
        <div className="h-16 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={toggleSidebar} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <LayoutDashboard size={24} className="text-slate-600" />
            </button>
            <div className="hidden sm:block">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                오늘도 <span className="text-indigo-600">알찬</span> 하루!
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-full hover:bg-slate-100 transition-colors">
              <Bell size={20} className="text-slate-500" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm border-2 border-white shadow-sm"
            >
              {displayName.charAt(0)}
            </button>
          </div>
        </div>

        {/* 모바일 자산 정보 바 */}
        <div className="px-4 pb-3 flex gap-3">
          {/* 현금 */}
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-sm flex-shrink-0">
              <span className="font-bold text-xs">₩</span>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider leading-none">현금</p>
              <p className="text-sm font-bold text-slate-800 truncate">{formatMoney(userDoc?.cash || 0)}원</p>
            </div>
          </div>

          {/* 쿠폰 */}
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-rose-50 rounded-xl border border-rose-100">
            <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shadow-sm flex-shrink-0">
              <Gift size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] text-rose-600 font-bold uppercase tracking-wider leading-none">쿠폰</p>
              <p className="text-sm font-bold text-slate-800 truncate">{userDoc?.coupons || 0}개</p>
            </div>
          </div>
        </div>
      </header>

      {/* PC 헤더 */}
      <header
        className="hidden md:flex items-center justify-between bg-white border-b border-slate-200 shadow-sm z-10"
        style={{ height: '64px', minHeight: '64px', maxHeight: '64px', padding: '0 16px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* 사이드바 토글 버튼 */}
          <button
            onClick={onToggleSidebarCollapse}
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', whiteSpace: 'nowrap', lineHeight: '1.2' }}>
              오늘도 <span style={{ color: '#4f46e5', fontFamily: "'Jua', sans-serif" }}>알찬</span> 하루! 👋
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', lineHeight: '1.2' }}>{displayName}님 환영합니다</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* 현금 위젯 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            background: '#ecfdf5',
            borderRadius: '8px',
            color: '#047857'
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
            background: '#fff1f2',
            borderRadius: '8px',
            color: '#be123c'
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

          {/* 사용자 메뉴 */}
          <div style={{ position: 'relative' }} ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                paddingLeft: '12px',
                borderLeft: '1px solid #e2e8f0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b', whiteSpace: 'nowrap', lineHeight: '1.2' }}>{displayName}</div>
                <div style={{ fontSize: '11px', color: '#4f46e5', fontWeight: '500', whiteSpace: 'nowrap', lineHeight: '1.2' }}>{userRole}</div>
              </div>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '14px'
              }}>
                {displayName.charAt(0)}
              </div>
            </button>

            {/* 드롭다운 메뉴 */}
            {showUserMenu && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
                <div className="px-5 py-4 bg-gradient-to-r from-slate-50 to-indigo-50/30 border-b border-slate-100">
                  <p className="font-bold text-slate-900">{displayName}</p>
                  <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                    {isCurrentUserAdmin && <span className="text-indigo-600 font-semibold">관리자</span>}
                    {userDoc?.classCode && <span>학급: {userDoc.classCode}</span>}
                  </p>
                </div>

                {/* 모바일: 자산 정보 */}
                <div className="md:hidden px-5 py-4 bg-slate-50/50 border-b border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-slate-500">현금</span>
                    <span className="font-bold text-emerald-600">{formatMoney(userDoc?.cash || 0)}원</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">쿠폰</span>
                    <span className="font-bold text-rose-600">{userDoc?.coupons || 0}개</span>
                  </div>
                </div>

                <div className="p-2">
                  <button onClick={handleChangeNickname} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    <User size={18} className="text-slate-400" />
                    닉네임 변경
                  </button>
                  <button onClick={handleChangePassword} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    <Key size={18} className="text-slate-400" />
                    비밀번호 변경
                  </button>
                  <button onClick={handleEnterClassCode} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    <Building2 size={18} className="text-slate-400" />
                    학급 코드 변경
                  </button>
                  <button onClick={() => { setShowSettings(true); setShowUserMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    <Settings size={18} className="text-slate-400" />
                    설정
                  </button>

                  <div className="h-px bg-slate-100 my-2" />

                  <button onClick={handleDeleteAccount} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={18} />
                    계정 삭제
                  </button>

                  <div className="h-px bg-slate-100 my-2" />

                  <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    <LogOut size={18} className="text-slate-400" />
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">새 닉네임</label>
            <input
              type="text"
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              placeholder="2-12자"
              maxLength={12}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />
          </div>
          {nicknameError && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-xl">{nicknameError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={closeModal} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">취소</button>
            <button onClick={saveNickname} disabled={isLoading} className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-200/50 hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50">
              {isLoading ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'password'} onClose={closeModal} title="비밀번호 변경">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">현재 비밀번호</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">새 비밀번호</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">비밀번호 확인</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          {passwordError && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-xl">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm text-green-600 bg-green-50 p-3 rounded-xl">비밀번호가 변경되었습니다!</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={closeModal} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">취소</button>
            <button onClick={savePassword} disabled={isLoading || passwordSuccess} className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-200/50 hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50">
              {isLoading ? "변경 중..." : "변경"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'classCode'} onClose={closeModal} title="학급 코드 변경">
        <div className="space-y-4">
          {userDoc?.classCode && (
            <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-xl">
              현재 학급 코드: <strong className="text-gray-900">{userDoc.classCode}</strong>
            </p>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">새 학급 코드</label>
            <input
              type="text"
              value={newClassCodeInput}
              onChange={(e) => setNewClassCodeInput(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
              placeholder="영문자와 숫자만"
              maxLength={20}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-2">영문자와 숫자만 입력 가능합니다.</p>
          </div>
          {classCodeError && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-xl">{classCodeError}</p>}
          {classCodeSuccess && <p className="text-sm text-green-600 bg-green-50 p-3 rounded-xl">학급 코드가 저장되었습니다!</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={closeModal} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">취소</button>
            <button onClick={saveClassCode} disabled={isLoading} className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-200/50 hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50">
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
