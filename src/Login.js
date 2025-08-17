// src/Login.js
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Login.css";
import { useAuth } from "./AuthContext";
import {
  registerWithEmailAndPassword,
  updateUserProfile,
  addUserDocument,
  verifyClassCode,
  serverTimestamp, // serverTimestamp를 firebase.js에서 가져옴
} from "./firebase";

// Firebase 오류 코드에 따른 한글 메시지 변환 함수
const getFirebaseErrorMessage = (error) => {
  if (!error || !error.code) {
    return "알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }
  switch (error.code) {
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "등록되지 않은 아이디이거나 잘못된 비밀번호입니다.";
    case "auth/wrong-password":
      return "잘못된 비밀번호입니다.";
    case "auth/invalid-email":
      return "유효하지 않은 이메일 형식입니다. (아이디는 이메일 형식이어야 합니다)";
    case "auth/too-many-requests":
      return "너무 많은 로그인 시도를 하셨습니다. 잠시 후 다시 시도해주세요.";
    case "auth/network-request-failed":
      return "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.";
    case "auth/email-already-in-use":
      return "이미 사용 중인 이메일입니다. 다른 이메일을 사용하세요.";
    default:
      console.error("Unhandled Firebase Auth Error:", error);
      return (
        "처리 중 오류가 발생했습니다: " + (error.message || "알 수 없는 오류")
      );
  }
};

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    userDoc,
    loading,
    firebaseReady,
    loginWithEmailPassword,
    auth,
    logout: contextLogout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState("login");
  const [saveId, setSaveId] = useState(false);

  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [registerName, setRegisterName] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [registerClassCode, setRegisterClassCode] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const from = location.state?.from?.pathname || "/dashboard/tasks";

  useEffect(() => {
    if (!loading && user) {
      // userDoc이 로드될 때까지 기다리거나, userDoc이 있다면 바로 이동
      // userDoc이 아직 로드되지 않았다면 AuthContext 내부에서 userDoc 로드 후 리디렉션이 일어날 수 있음
      if (userDoc) {
        console.log(
          "[Login.js] 이미 로그인 및 userDoc 로드됨, 리디렉션:",
          from,
          userDoc
        );
        navigate(from, { replace: true });
      } else {
        console.log("[Login.js] 이미 로그인되었으나 userDoc 대기 중...");
        // AuthContext에서 userDoc 로딩 후 리디렉션할 것으로 기대
      }
    }
  }, [user, userDoc, loading, navigate, from]);

  useEffect(() => {
    const savedLoginIdFromStorage = localStorage.getItem("savedLoginId");
    if (savedLoginIdFromStorage) {
      setLoginId(savedLoginIdFromStorage);
      setSaveId(true);
    }
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setErrorMessage("");
    setRegisterError("");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setRegisterError("");
    const emailToLogin = loginId.trim();

    if (!emailToLogin || !loginPassword) {
      setErrorMessage("아이디(이메일)와 비밀번호를 모두 입력해주세요.");
      return;
    }
    if (!firebaseReady) {
      setErrorMessage(
        "인증 서비스가 준비되지 않았습니다. 잠시 후 다시 시도해주세요."
      );
      return;
    }
    setIsLoggingIn(true);
    try {
      const firebaseUser = await loginWithEmailPassword(
        emailToLogin,
        loginPassword
      );
      if (firebaseUser) {
        if (saveId) {
          localStorage.setItem("savedLoginId", emailToLogin);
        } else {
          localStorage.removeItem("savedLoginId");
        }
        // 성공 시 리디렉션은 useEffect에서 user 및 userDoc 상태 변경에 따라 처리
      }
    } catch (error) {
      setErrorMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegisterError("");
    setErrorMessage("");

    if (
      !registerName.trim() ||
      !registerId.trim() ||
      !registerPassword ||
      !registerConfirmPassword ||
      !registerClassCode.trim()
    ) {
      setRegisterError("모든 필드를 입력해주세요.");
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setRegisterError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (registerPassword.length < 6) {
      setRegisterError("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }
    if (!firebaseReady || !auth) {
      setRegisterError(
        "인증 서비스가 준비되지 않았습니다. 잠시 후 다시 시도해주세요."
      );
      return;
    }

    setIsRegistering(true);
    setIsVerifyingCode(true);
    const trimmedClassCode = registerClassCode.trim();
    console.log(
      "[Login.js] handleRegister: 검증할 학급 코드 (입력값):",
      trimmedClassCode
    );

    try {
      const isValidClassCode = await verifyClassCode(trimmedClassCode);
      setIsVerifyingCode(false);
      console.log(
        "[Login.js] handleRegister: verifyClassCode 결과:",
        isValidClassCode
      );

      if (!isValidClassCode) {
        setRegisterError(
          "유효하지 않은 학급 코드입니다. 코드를 다시 확인하거나 관리자에게 문의하세요."
        );
        setIsRegistering(false);
        return;
      }

      const userCredential = await registerWithEmailAndPassword(
        auth,
        registerId.trim(),
        registerPassword
      );
      const newUser = userCredential.user;
      console.log(
        "[Login.js] Firebase Auth 회원가입 성공:",
        newUser.uid,
        newUser.email
      );

      await updateUserProfile(newUser, registerName.trim());
      console.log(
        "[Login.js] 사용자 프로필 업데이트 성공 (displayName):",
        registerName.trim()
      );

      const userData = {
        name: registerName.trim(),
        nickname: registerName.trim(),
        email: registerId.trim().toLowerCase(),
        classCode: trimmedClassCode, // ⭐ 검증된 학급 코드 저장
        isAdmin: false,
        isSuperAdmin: false,
        cash: 100000,
        coupons: 10,
        selectedJobIds: [],
        myContribution: 0,
        createdAt: serverTimestamp(),
      };
      console.log("[Login.js] Firestore에 저장할 사용자 데이터:", userData);

      await addUserDocument(newUser.uid, userData);
      console.log(
        "[Login.js] Firestore에 사용자 문서 추가 성공, UID:",
        newUser.uid
      );

      // 회원가입 성공 후 자동 로그인된 사용자 로그아웃
      if (contextLogout && typeof contextLogout === "function") {
        await contextLogout();
        console.log("[Login.js] 회원가입 후 자동 로그아웃 (AuthContext 사용)");
      } else if (auth && typeof auth.signOut === "function") {
        await auth.signOut();
        console.log(
          "[Login.js] 회원가입 후 자동 로그아웃 (auth.signOut 직접 사용)"
        );
      } else {
        console.warn("[Login.js] 로그아웃 함수를 찾을 수 없습니다.");
      }

      alert(
        "회원가입이 완료되었습니다. 생성한 아이디와 비밀번호로 로그인해주세요."
      );
      setActiveTab("login");
      setRegisterName("");
      setRegisterId("");
      setRegisterPassword("");
      setRegisterConfirmPassword("");
      setRegisterClassCode("");
    } catch (error) {
      console.error("[Login.js] 회원가입 처리 중 오류:", error);
      setRegisterError(getFirebaseErrorMessage(error));
    } finally {
      setIsRegistering(false);
      setIsVerifyingCode(false);
    }
  };

  if (loading || !firebaseReady) {
    return (
      <div className="login-wrapper">
        <div className="login-container">
          <div className="login-header">
            <h1 className="app-title">
              Ineconomy<span className="highlight-text">s</span>U Clas
              <span className="highlight-text">S</span>
            </h1>
          </div>
          <p className="loading-text">인증 서비스 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrapper">
      <div className="login-container">
        <div className="login-header">
          <h1 className="app-title">
            Ineconomy<span className="highlight-text">s</span>U Clas
            <span className="highlight-text">S</span>
          </h1>
          <div className="divider"></div>
          <p className="app-description">학급 경제 교육 시스템</p>
        </div>

        <div className="login-tabs">
          <button
            className={`tab-button ${activeTab === "login" ? "active" : ""}`}
            onClick={() => handleTabChange("login")}
            disabled={isLoggingIn || isRegistering}
          >
            로그인
          </button>
          <button
            className={`tab-button ${activeTab === "register" ? "active" : ""}`}
            onClick={() => handleTabChange("register")}
            disabled={isLoggingIn || isRegistering}
          >
            가입하기
          </button>
        </div>

        {activeTab === "login" && errorMessage && (
          <p className="error-message">{errorMessage}</p>
        )}
        {activeTab === "register" && registerError && (
          <p className="error-message">{registerError}</p>
        )}

        {activeTab === "login" && (
          <div className="login-form-container">
            <form className="login-form" onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label" htmlFor="loginIdInput">
                  아이디 (이메일)
                </label>
                <input
                  id="loginIdInput"
                  type="email"
                  className="form-input"
                  placeholder="이메일 주소 입력"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  required
                  disabled={isLoggingIn}
                  aria-describedby={
                    errorMessage ? "loginErrorGlobal" : undefined
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="loginPasswordInput">
                  비밀번호
                </label>
                <input
                  id="loginPasswordInput"
                  type="password"
                  className="form-input"
                  placeholder="비밀번호 입력"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  disabled={isLoggingIn}
                  aria-describedby={
                    errorMessage ? "loginErrorGlobal" : undefined
                  }
                />
              </div>
              <div className="checkbox-container">
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    id="saveId"
                    checked={saveId}
                    onChange={(e) => setSaveId(e.target.checked)}
                    disabled={isLoggingIn}
                  />
                  <label htmlFor="saveId">아이디 저장</label>
                </div>
              </div>
              <button
                type="submit"
                className="login-button"
                disabled={isLoggingIn}
              >
                {isLoggingIn ? "로그인 중..." : "로그인"}
              </button>
              <div className="test-accounts">
                <p>테스트 계정: student@example.com / password</p>
                <p>관리자 계정: admin@example.com / admin</p>
              </div>
            </form>
          </div>
        )}

        {activeTab === "register" && (
          <div className="login-form-container">
            <form className="login-form" onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label" htmlFor="registerName">
                  이름
                </label>
                <input
                  id="registerName"
                  type="text"
                  className="form-input"
                  placeholder="실명 입력"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  required
                  disabled={isRegistering}
                  aria-describedby={
                    registerError ? "registerErrorSpecific" : undefined
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="registerId">
                  아이디 (이메일)
                </label>
                <input
                  id="registerId"
                  type="email"
                  className="form-input"
                  placeholder="이메일 주소 입력"
                  value={registerId}
                  onChange={(e) => setRegisterId(e.target.value)}
                  required
                  disabled={isRegistering}
                  aria-describedby={
                    registerError ? "registerErrorSpecific" : undefined
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="registerPassword">
                  비밀번호
                </label>
                <input
                  id="registerPassword"
                  type="password"
                  className="form-input"
                  placeholder="6자 이상 입력"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  required
                  disabled={isRegistering}
                  aria-describedby={
                    registerError ? "registerErrorSpecific" : undefined
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="registerConfirmPassword">
                  비밀번호 확인
                </label>
                <input
                  id="registerConfirmPassword"
                  type="password"
                  className="form-input"
                  placeholder="비밀번호 재입력"
                  value={registerConfirmPassword}
                  onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                  required
                  disabled={isRegistering}
                  aria-describedby={
                    registerError ? "registerErrorSpecific" : undefined
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="registerClassCode">
                  학급 코드
                </label>
                <input
                  id="registerClassCode"
                  type="text"
                  className="form-input"
                  placeholder="교사가 제공한 코드 입력"
                  value={registerClassCode}
                  onChange={(e) => setRegisterClassCode(e.target.value)}
                  required
                  disabled={isRegistering}
                  aria-describedby={
                    registerError ? "registerErrorSpecific" : undefined
                  }
                />
                <small className="form-helper-text">
                  교사에게 받은 학급 코드를 입력하세요.
                </small>
              </div>
              <button
                type="submit"
                className="login-button"
                disabled={isRegistering}
              >
                {isRegistering
                  ? isVerifyingCode
                    ? "학급 코드 확인 중..."
                    : "가입 처리 중..."
                  : "가입하기"}
              </button>
            </form>
          </div>
        )}
        {errorMessage && activeTab === "login" && (
          <div id="loginErrorGlobal" role="alert" style={{ display: "none" }}>
            {errorMessage}
          </div>
        )}
        {registerError && activeTab === "register" && (
          <div
            id="registerErrorSpecific"
            role="alert"
            style={{ display: "none" }}
          >
            {registerError}
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
