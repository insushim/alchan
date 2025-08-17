// src/Header.js
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { verifyClassCode } from "./firebase"; // 학급 코드 검증 함수 import
import "./Header.css";

const MenuIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    width="20"
    height="20"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 6h16M4 12h16m-7 6h7"
    />
  </svg>
);

const UserIconPlaceholder = ({ userName }) => (
  <div className="my-info-icon-wrapper">
    {userName ? userName.charAt(0).toUpperCase() : "👤"}
  </div>
);

const Header = ({ toggleSidebar, isAdmin: isAdminProp }) => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { user, userDoc, logout, updateUser: updateAuthUser } = auth;

  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  const [isChangingNickname, setIsChangingNickname] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [nicknameError, setNicknameError] = useState("");

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // --- 학급 코드 입력/변경 관련 상태 ---
  const [isEnteringClassCode, setIsEnteringClassCode] = useState(false);
  const [newClassCodeInput, setNewClassCodeInput] = useState("");
  const [classCodeEntryError, setClassCodeEntryError] = useState("");
  const [classCodeEntrySuccess, setClassCodeEntrySuccess] = useState(false);
  const [isVerifyingAndSavingCode, setIsVerifyingAndSavingCode] =
    useState(false);

  const isCurrentUserAdmin =
    userDoc?.isAdmin ||
    userDoc?.role === "admin" ||
    userDoc?.isSuperAdmin ||
    isAdminProp;

  const toggleUserMenu = () => {
    setShowUserMenu(!showUserMenu);
  };

  const handleLogout = async () => {
    if (logout && typeof logout === "function") {
      try {
        await logout();
        navigate("/login");
      } catch (error) {
        console.error("Header: logout 중 오류 발생:", error);
        alert("로그아웃 중 오류가 발생했습니다.");
      }
    } else {
      console.error("Header: logout 함수가 유효하지 않습니다.");
      alert("로그아웃 기능을 사용할 수 없습니다.");
    }
    setShowUserMenu(false);
  };

  const handleChangeNickname = () => {
    setNewNickname(userDoc?.name || userDoc?.nickname || "");
    setIsChangingNickname(true);
    setIsChangingPassword(false);
    setIsEnteringClassCode(false);
    setNicknameError("");
    setShowUserMenu(false);
  };

  const cancelNicknameChange = () => {
    setIsChangingNickname(false);
    setNewNickname("");
    setNicknameError("");
  };

  const saveNickname = async () => {
    const trimmedNickname = newNickname.trim();
    if (!trimmedNickname) {
      setNicknameError("닉네임을 입력해주세요.");
      return;
    }
    if (trimmedNickname.length < 2) {
      setNicknameError("닉네임은 최소 2자 이상이어야 합니다.");
      return;
    }
    if (trimmedNickname.length > 12) {
      setNicknameError("닉네임은 최대 12자까지 가능합니다.");
      return;
    }
    if (trimmedNickname === (userDoc?.name || userDoc?.nickname)) {
      setNicknameError("현재 닉네임과 동일합니다.");
      return;
    }
    try {
      const success = await updateAuthUser({ name: trimmedNickname });
      if (success) {
        setIsChangingNickname(false);
        setNewNickname("");
        setNicknameError("");
        alert("닉네임이 성공적으로 변경되었습니다.");
      } else {
        setNicknameError("닉네임 변경에 실패했습니다. 다시 시도해주세요.");
      }
    } catch (error) {
      console.error("닉네임 변경 중 오류:", error);
      setNicknameError("닉네임 변경 중 오류: " + error.message);
    }
  };

  const handleChangePassword = () => {
    setIsChangingPassword(true);
    setIsChangingNickname(false);
    setIsEnteringClassCode(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordSuccess(false);
    setShowUserMenu(false);
  };

  const cancelPasswordChange = () => {
    setIsChangingPassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordSuccess(false);
  };

  const savePassword = async () => {
    if (!currentPassword) {
      setPasswordError("현재 비밀번호를 입력해주세요.");
      return;
    }
    if (!newPassword) {
      setPasswordError("새 비밀번호를 입력해주세요.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("비밀번호는 최소 8자 이상이어야 합니다.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("새 비밀번호가 현재 비밀번호와 동일합니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
      return;
    }
    try {
      if (
        auth.changeUserPassword &&
        typeof auth.changeUserPassword === "function"
      ) {
        await auth.changeUserPassword(currentPassword, newPassword);
        setPasswordSuccess(true);
        setPasswordError("");
        setTimeout(() => {
          setIsChangingPassword(false);
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setPasswordSuccess(false);
        }, 3000);
      } else {
        setPasswordError(
          "비밀번호 변경 기능을 사용할 수 없습니다. (AuthContext 미구현)"
        );
      }
    } catch (error) {
      console.error("비밀번호 변경 중 오류:", error);
      setPasswordError(`비밀번호 변경 오류: ${error.message}`);
    }
  };

  // --- 🔥 개선된 학급 코드 입력/변경 관련 함수들 ---
  const handleEnterClassCodeClick = () => {
    console.log("[Header] 학급 코드 입력 모드 시작");
    setNewClassCodeInput(userDoc?.classCode || ""); // 기존 학급 코드 표시
    setIsEnteringClassCode(true);
    setIsChangingNickname(false);
    setIsChangingPassword(false);
    setClassCodeEntryError("");
    setClassCodeEntrySuccess(false);
    setIsVerifyingAndSavingCode(false);
    setShowUserMenu(false);
  };

  const cancelClassCodeEntry = () => {
    console.log("[Header] 학급 코드 입력 취소");
    setIsEnteringClassCode(false);
    setNewClassCodeInput("");
    setClassCodeEntryError("");
    setClassCodeEntrySuccess(false);
    setIsVerifyingAndSavingCode(false);
  };

  // 🔥 개선된 학급 코드 저장 함수
  const saveEnteredClassCode = async () => {
    console.log("[Header] saveEnteredClassCode 시작");
    console.log("[Header] 입력된 코드:", newClassCodeInput);

    const trimmedNewClassCode = newClassCodeInput.trim().toUpperCase();
    console.log("[Header] 정제된 코드:", trimmedNewClassCode);

    // 🔥 입력 검증 강화
    if (!trimmedNewClassCode) {
      console.warn("[Header] 학급 코드가 비어있음");
      setClassCodeEntryError("학급 코드를 입력해주세요.");
      return;
    }

    if (trimmedNewClassCode === userDoc?.classCode) {
      console.warn("[Header] 현재 학급 코드와 동일함");
      setClassCodeEntryError("현재 학급 코드와 동일합니다.");
      return;
    }

    // 🔥 코드 길이 검증 추가
    if (trimmedNewClassCode.length < 2) {
      setClassCodeEntryError("학급 코드는 최소 2자 이상이어야 합니다.");
      return;
    }

    if (trimmedNewClassCode.length > 20) {
      setClassCodeEntryError("학급 코드는 최대 20자까지 가능합니다.");
      return;
    }

    console.log("[Header] 검증 시작, 로딩 상태 활성화");
    setIsVerifyingAndSavingCode(true);
    setClassCodeEntryError("");
    setClassCodeEntrySuccess(false);

    try {
      console.log(`[Header] 학급 코드 검증 시작: ${trimmedNewClassCode}`);

      // 🔥 학급 코드 검증에 더 상세한 로깅 추가
      let isValid = false;
      try {
        isValid = await verifyClassCode(trimmedNewClassCode);
        console.log(`[Header] 검증 결과: ${isValid}`);
      } catch (verifyError) {
        console.error("[Header] 검증 중 오류:", verifyError);
        setClassCodeEntryError(
          `학급 코드 검증 중 오류가 발생했습니다: ${verifyError.message}`
        );
        setIsVerifyingAndSavingCode(false);
        return;
      }

      if (!isValid) {
        console.warn(`[Header] 학급 코드 검증 실패: ${trimmedNewClassCode}`);
        setClassCodeEntryError(
          `'${trimmedNewClassCode}'는 유효하지 않은 학급 코드입니다. 선생님께 정확한 코드를 확인해주세요.`
        );
        setIsVerifyingAndSavingCode(false);
        return;
      }

      console.log(`[Header] 학급 코드 검증 성공, Firestore 업데이트 시작`);

      // 🔥 updateAuthUser 함수 검증 추가
      if (!updateAuthUser || typeof updateAuthUser !== "function") {
        console.error("[Header] updateAuthUser 함수가 유효하지 않음");
        setClassCodeEntryError(
          "사용자 정보 업데이트 기능을 사용할 수 없습니다."
        );
        setIsVerifyingAndSavingCode(false);
        return;
      }

      // 2. 유효하다면 Firestore 사용자 문서에 업데이트
      const success = await updateAuthUser({ classCode: trimmedNewClassCode });

      console.log(`[Header] 학급 코드 업데이트 결과: ${success}`);

      if (success) {
        console.log(`[Header] 학급 코드 저장 성공`);
        setClassCodeEntrySuccess(true);
        setClassCodeEntryError("");

        // 🔥 성공 후 UI 처리 개선
        setTimeout(() => {
          setIsEnteringClassCode(false);
          setNewClassCodeInput("");
          setClassCodeEntrySuccess(false);
          alert(
            `학급 코드가 '${trimmedNewClassCode}'로 성공적으로 변경되었습니다!`
          );
        }, 1500); // 1.5초 후 창 닫기
      } else {
        console.error(`[Header] 학급 코드 저장 실패`);
        setClassCodeEntryError(
          "학급 코드 저장에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요."
        );
      }
    } catch (error) {
      console.error("[Header] 학급 코드 저장 중 오류:", error);

      // 🔥 에러 메시지 개선
      let errorMessage = "학급 코드 처리 중 오류가 발생했습니다.";
      if (error.message) {
        errorMessage += ` 오류 내용: ${error.message}`;
      }
      if (error.code) {
        errorMessage += ` (코드: ${error.code})`;
      }

      setClassCodeEntryError(errorMessage);
    } finally {
      console.log("[Header] 로딩 상태 비활성화");
      setIsVerifyingAndSavingCode(false);
    }
  };

  // 🔥 Enter 키 처리 추가
  const handleClassCodeKeyPress = (event) => {
    if (event.key === "Enter" && !isVerifyingAndSavingCode) {
      event.preventDefault();
      saveEnteredClassCode();
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "정말로 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며, 모든 관련 데이터가 영구적으로 삭제될 수 있습니다."
    );
    if (confirmed) {
      try {
        if (
          auth.deleteUserAccount &&
          typeof auth.deleteUserAccount === "function"
        ) {
          await auth.deleteUserAccount();
          alert("계정이 성공적으로 삭제되었습니다. 자동으로 로그아웃됩니다.");
        } else {
          alert("계정 삭제 기능을 사용할 수 없습니다. (AuthContext 미구현)");
        }
      } catch (error) {
        alert(`계정 삭제 중 오류: ${error.message}`);
        console.error("계정 삭제 오류:", error);
      }
    }
    setShowUserMenu(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const displayName =
    userDoc?.name || userDoc?.nickname || user?.displayName || "사용자";

  return (
    <header className="header">
      <div className="header-left">
        <button onClick={toggleSidebar} className="menu-button">
          <MenuIcon />
          <span className="menu-text">메뉴</span>
        </button>
      </div>

      <div className="header-center">
        <a href="/" className="header-title">
          Ineconomy<span className="highlight-text">s</span>U Clas
          <span className="highlight-text">S</span>
        </a>
      </div>

      <div className="header-right" ref={userMenuRef}>
        {user ? (
          <>
            {/* --- 닉네임 변경 UI --- */}
            {isChangingNickname && (
              <div className="nickname-change-container">
                <input
                  type="text"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  placeholder="새 닉네임 (2-12자)"
                  maxLength={12}
                  className="nickname-input"
                  autoFocus
                />
                {nicknameError && (
                  <div className="nickname-error">{nicknameError}</div>
                )}
                <div className="nickname-buttons">
                  <button onClick={saveNickname} className="save-nickname-btn">
                    저장
                  </button>
                  <button
                    onClick={cancelNicknameChange}
                    className="cancel-nickname-btn"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}

            {/* --- 비밀번호 변경 UI --- */}
            {isChangingPassword && (
              <div className="password-change-container">
                <h3 className="change-form-title">비밀번호 변경</h3>
                <div className="password-form">
                  <div className="password-form-group">
                    <label htmlFor="current-password">현재 비밀번호</label>
                    <input
                      type="password"
                      id="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="현재 비밀번호 입력"
                      className="password-input"
                      autoFocus
                    />
                  </div>
                  <div className="password-form-group">
                    <label htmlFor="new-password">새 비밀번호</label>
                    <input
                      type="password"
                      id="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="새 비밀번호 (8자 이상)"
                      className="password-input"
                    />
                  </div>
                  <div className="password-form-group">
                    <label htmlFor="confirm-password">비밀번호 확인</label>
                    <input
                      type="password"
                      id="confirm-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="새 비밀번호 다시 입력"
                      className="password-input"
                    />
                  </div>
                </div>
                {passwordError && (
                  <div className="password-error">{passwordError}</div>
                )}
                {passwordSuccess && (
                  <div className="password-success">
                    비밀번호가 성공적으로 변경되었습니다!
                  </div>
                )}
                <div className="password-buttons">
                  <button
                    onClick={savePassword}
                    className="save-password-btn"
                    disabled={passwordSuccess || isVerifyingAndSavingCode}
                  >
                    {passwordSuccess ? "변경됨" : "변경하기"}
                  </button>
                  <button
                    onClick={cancelPasswordChange}
                    className="cancel-password-btn"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}

            {/* --- 🔥 개선된 학급 코드 입력/변경 UI --- */}
            {isEnteringClassCode && (
              <div className="classcode-entry-container">
                <h3 className="change-form-title">학급 코드 입력/변경</h3>
                <div className="form-group">
                  <label htmlFor="new-class-code-input" className="form-label">
                    학급 코드
                    {userDoc?.classCode && (
                      <span className="current-code-hint">
                        (현재: {userDoc.classCode})
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    id="new-class-code-input"
                    value={newClassCodeInput}
                    onChange={(e) => {
                      // 🔥 입력값 실시간 대문자 변환 및 특수문자 제거
                      const cleaned = e.target.value
                        .replace(/[^a-zA-Z0-9]/g, "")
                        .toUpperCase();
                      setNewClassCodeInput(cleaned);
                    }}
                    onKeyPress={handleClassCodeKeyPress}
                    placeholder="선생님께 받은 학급 코드를 입력하세요"
                    className="form-input"
                    autoFocus
                    disabled={isVerifyingAndSavingCode}
                    maxLength={20}
                  />
                  <div className="input-hint">
                    • 영문자와 숫자만 입력 가능합니다 • 자동으로 대문자로
                    변환됩니다 • Enter 키를 눌러 저장할 수 있습니다
                  </div>
                </div>

                {/* 🔥 에러/성공 메시지 UI 개선 */}
                {classCodeEntryError && (
                  <div className="error-message inline-error">
                    ❌ {classCodeEntryError}
                  </div>
                )}
                {classCodeEntrySuccess && (
                  <div className="success-message inline-success">
                    ✅ 학급 코드가 성공적으로 저장되었습니다!
                  </div>
                )}

                <div className="form-buttons">
                  <button
                    onClick={saveEnteredClassCode}
                    className="save-button"
                    disabled={
                      isVerifyingAndSavingCode || !newClassCodeInput.trim()
                    }
                  >
                    {isVerifyingAndSavingCode ? (
                      <>
                        <span className="loading-spinner">⏳</span>
                        검증 중...
                      </>
                    ) : (
                      "저장"
                    )}
                  </button>
                  <button
                    onClick={cancelClassCodeEntry}
                    className="cancel-button"
                    disabled={isVerifyingAndSavingCode}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}

            {/* --- 사용자 정보 버튼 --- */}
            {!isChangingNickname &&
              !isChangingPassword &&
              !isEnteringClassCode && (
                <button onClick={toggleUserMenu} className="my-info-button">
                  <UserIconPlaceholder userName={displayName} />
                  <span className="my-info-text">{displayName}</span>
                </button>
              )}

            {showUserMenu && (
              <div className="user-dropdown-menu">
                <div className="user-info-section">
                  <span className="nickname">
                    {displayName}
                    {isCurrentUserAdmin && (
                      <span className="admin-badge">관리자</span>
                    )}
                  </span>
                  <span className="class-code">
                    학급코드: {userDoc?.classCode || "미지정"}
                  </span>
                </div>
                <ul>
                  <li>
                    <button onClick={handleChangeNickname}>닉네임 변경</button>
                  </li>
                  <li>
                    <button onClick={handleChangePassword}>
                      비밀번호 변경
                    </button>
                  </li>
                  <li>
                    <button onClick={handleEnterClassCodeClick}>
                      학급 코드 입력/변경
                    </button>
                  </li>
                  <li className="separator"></li>
                  <li>
                    <button
                      onClick={handleDeleteAccount}
                      className="delete-account-button"
                    >
                      계정 삭제
                    </button>
                  </li>
                  <li className="separator"></li>
                  <li>
                    <button onClick={handleLogout} className="logout-button">
                      로그아웃
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </>
        ) : (
          <a href="/login" className="my-info-button login-link">
            <span className="my-info-text">로그인</span>
          </a>
        )}
      </div>
    </header>
  );
};

export default Header;
