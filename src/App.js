// src/App.js
import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";

// Firebase imports
import { db, isFirestoreInitialized } from "./firebase";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query, // query 추가
  where, // where 추가
  serverTimestamp, // serverTimestamp 사용 예시를 위해 주석 해제
} from "firebase/firestore";

import { AuthProvider, useAuth } from "./AuthContext";
import { ItemProvider } from "./ItemContext"; // ItemContext 임포트

// 자동 초기화 서비스 임포트
import {
  setupTaskResetTimer,
  checkAndResetOnAppStart,
} from "./TaskResetService";
import AdminCommonTaskSettings from "./AdminCommonTaskSettings";

// 페이지 컴포넌트
import Dashboard from "./Dashboard";
import ItemStore from "./ItemStore";
import LearningGames from "./ResourceFlow";
import "./LearningGames.css";
import MyItems from "./MyItems";
import MyAssets from "./MyAssets";
import ItemMarket from "./ItemMarket";
import Login from "./Login";
import AdminItemPage from "./AdminItemPage";
import Header from "./Header";
import Sidebar from "./Sidebar";
import LearningBoard from "./LearningBoard";
import AdminPanel from "./AdminPanel";
import Banking from "./Banking";
import StockExchange from "./StockExchange";
import RealEstateRegistry from "./RealEstateRegistry";
import NationalAssembly from "./NationalAssembly";
import Government from "./Government";
import Court from "./Court";
import PoliceStation from "./PoliceStation";
import Auction from "./Auction";

// 스타일 파일 임포트
import "./styles.css";
import "./sidebar.css";
import "./Header.css";
import "./StockExchange.css";
import "./RealEstateRegistry.css";
import "./NationalAssembly.css";
import "./Government.css";
import "./Court.css";
import "./Police.css";
import "./ItemStore.css";
import "./LearningGames.css";
import "./MyItems.css";
import "./ItemMarket.css";
import "./LearningBoard.css";
import "./AdminPanel.css";
import "./App.css";
import "./LearningGames.css";

const cashCouponStyle = (textColor, bgColor, borderColor) => ({
  fontWeight: "bold",
  color: textColor,
  backgroundColor: bgColor,
  padding: "8px 15px",
  borderRadius: "15px",
  border: `1px solid ${borderColor}`,
  display: "flex",
  alignItems: "center",
  gap: "8px",
});

// *** 수정된 부분 시작: UserManagementComponent에 classCode 필터링 추가 ***
function UserManagementComponent() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ name: "", email: "" });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [firebaseStatus, setFirebaseStatus] = useState({
    initialized: false,
    checked: false,
  });

  const { userDoc } = useAuth(); // useAuth 훅 사용
  const adminClassCode = userDoc?.classCode; // 관리자의 classCode 가져오기
  const isSuperAdmin = userDoc?.isSuperAdmin; // 슈퍼 관리자 여부 확인 (AuthContext에 추가 필요)

  useEffect(() => {
    const checkFirebase = () => {
      const initialized = isFirestoreInitialized();
      setFirebaseStatus({ initialized, checked: true });
      if (!initialized) {
        setError("Firestore 연결 실패.");
        setLoading(false);
      }
    };
    checkFirebase();
    const timer = setTimeout(
      () => !isFirestoreInitialized() && checkFirebase(),
      2000
    );
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Firestore가 초기화되지 않았거나, 관리자가 아닌데 classCode가 없으면 실행 중단
    if (!firebaseStatus.initialized || (!isSuperAdmin && !adminClassCode)) {
      if (firebaseStatus.checked) setLoading(false);
      if (firebaseStatus.checked && !isSuperAdmin && !adminClassCode) {
        setError(
          "관리자의 학급 코드를 찾을 수 없어 사용자 목록을 불러올 수 없습니다."
        );
      }
      return;
    }

    setLoading(true);
    let unsubscribe;
    try {
      console.log("사용자 데이터 구독 시작...", {
        adminClassCode,
        isSuperAdmin,
      });

      // 슈퍼 관리자는 모든 사용자를, 일반 관리자는 자기 학급 사용자만 보도록 쿼리 구성
      const usersCollection = collection(db, "users");
      const usersQuery = isSuperAdmin
        ? usersCollection // 슈퍼 관리자는 필터 없음
        : query(usersCollection, where("classCode", "==", adminClassCode)); // 일반 관리자는 classCode 필터

      unsubscribe = onSnapshot(
        usersQuery, // 수정된 쿼리 사용
        (snapshot) => {
          const usersList = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          console.log("사용자 데이터 수신:", usersList.length, "명");
          setUsers(usersList);
          setLoading(false);
          setError(null);
        },
        (error) => {
          console.error("사용자 컬렉션 리스닝 오류:", error);
          setError("사용자 데이터 로딩 오류: " + error.message);
          setLoading(false);
        }
      );
    } catch (err) {
      console.error("onSnapshot 설정 오류:", err);
      setError("데이터 구독 설정 오류: " + err.message);
      setLoading(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [firebaseStatus.initialized, adminClassCode, isSuperAdmin]); // adminClassCode와 isSuperAdmin 의존성 추가

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!isFirestoreInitialized()) return setError("Firestore 미초기화.");
    if (!newUser.name || !newUser.email)
      return setError("이름과 이메일 입력 필요.");
    // !! 중요: 새 사용자 추가 시 classCode를 어떻게 할당할지 정책 필요.
    // 여기서는 관리자의 classCode를 할당하거나, 슈퍼 관리자인 경우 입력을 받도록 해야 함.
    // 여기서는 일단 관리자의 classCode를 할당하는 것으로 가정.
    if (!adminClassCode)
      return setError("새 사용자를 추가할 학급 코드를 알 수 없습니다.");

    setLoading(true);
    try {
      await addDoc(collection(db, "users"), {
        ...newUser,
        classCode: adminClassCode, // 관리자의 classCode 할당
        createdAt: serverTimestamp(), // serverTimestamp 사용
      });
      setNewUser({ name: "", email: "" });
      setError(null);
    } catch (error) {
      setError(`사용자 추가 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!isFirestoreInitialized() || !editing) return;
    if (!editing.name || !editing.email)
      return setError("이름과 이메일 입력 필요.");

    setLoading(true);
    try {
      const userRef = doc(db, "users", editing.id);
      await updateDoc(userRef, {
        name: editing.name,
        email: editing.email,
        // !! 중요: classCode 변경 기능이 필요하다면 여기에 로직 추가
        updatedAt: serverTimestamp(), // serverTimestamp 사용
      });
      setEditing(null);
      setError(null);
    } catch (error) {
      setError(`사용자 업데이트 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!isFirestoreInitialized()) return;
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "users", userId));
      setError(null);
    } catch (error) {
      setError(`사용자 삭제 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!firebaseStatus.initialized && firebaseStatus.checked) {
    return <div>Firebase 초기화 실패...</div>;
  }
  if (loading || !firebaseStatus.checked) {
    return <div>데이터 로딩 중...</div>;
  }

  // JSX 렌더링 (폼과 목록)
  return (
    <div className="user-management-container">
      <h1>
        사용자 관리{" "}
        {adminClassCode
          ? `(학급: ${adminClassCode})`
          : isSuperAdmin
          ? "(전체)"
          : ""}
      </h1>
      {error && (
        <div className="error-message">
          {error} <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* 새 사용자 추가 폼 (관리자만) */}
      {adminClassCode && (
        <div className="form-container">
          <h2>새 사용자 추가 ({adminClassCode})</h2>
          <form onSubmit={handleAddUser}>
            {/* ... (input 필드) ... */}
            <div>
              <label>이름:</label>
              <input
                type="text"
                value={newUser.name}
                onChange={(e) =>
                  setNewUser({ ...newUser, name: e.target.value })
                }
                required
                disabled={loading && !users.length} // 데이터 로딩 중이면서 사용자가 없을 때 비활성화 (선택적)
              />
            </div>
            <div>
              <label>이메일:</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
                required
                disabled={loading && !users.length}
              />
            </div>
            <button type="submit" disabled={loading}>
              {loading ? "처리 중..." : "추가"}
            </button>
          </form>
        </div>
      )}

      {/* 사용자 수정 폼 */}
      {editing && (
        <div className="form-container">
          <h2>사용자 정보 수정</h2>
          <form onSubmit={handleUpdateUser}>
            {/* ... (input 필드 및 버튼) ... */}
            <div>
              <label>이름:</label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                required
                disabled={loading}
              />
            </div>
            <div>
              <label>이메일:</label>
              <input
                type="email"
                value={editing.email}
                onChange={(e) =>
                  setEditing({ ...editing, email: e.target.value })
                }
                required
                disabled={loading}
              />
            </div>
            {isSuperAdmin && ( // 슈퍼 관리자만 학급 코드 수정 가능 (예시)
              <div>
                <label>학급 코드:</label>
                <input
                  type="text"
                  value={editing.classCode || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, classCode: e.target.value })
                  }
                  disabled={loading}
                />
              </div>
            )}
            <div className="form-buttons">
              <button type="submit" disabled={loading}>
                {loading ? "처리 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={loading}
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 사용자 목록 */}
      <div className="users-list">
        <h2>사용자 목록</h2>
        {users.length === 0 ? (
          <p>등록된 사용자가 없습니다.</p>
        ) : (
          <ul>
            {users.map((user) => (
              <li key={user.id}>
                <div className="user-info">
                  <strong>{user.name || "이름 없음"}</strong>
                  <p>이메일: {user.email || "이메일 없음"}</p>
                  <p>학급 코드: {user.classCode || "미지정"}</p>{" "}
                  {/* 학급 코드 표시 */}
                  <p>ID: {user.id}</p>
                  {user.createdAt && (
                    <p>
                      생성일:{" "}
                      {new Date(user.createdAt.toDate()).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="user-actions">
                  <button onClick={() => setEditing(user)} disabled={loading}>
                    수정
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    disabled={loading}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
// *** 수정된 부분 끝 ***

const ProtectedRoute = ({ children }) => {
  // ... (기존 코드 유지) ...
  const authHook = useAuth();
  const location = useLocation();

  if (authHook.loading) {
    return <div className="p-4 text-center">사용자 정보 로딩 중...</div>;
  }
  if (!authHook.user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
};

const AdminRoute = ({ children }) => {
  // ... (기존 코드 유지) ...
  const authHook = useAuth(); // useAuth() 호출
  const location = useLocation(); // useLocation() 호출

  if (authHook.loading) {
    return <div className="p-4 text-center">관리자 정보 로딩 중...</div>;
  }
  if (!authHook.user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  // authHook.user가 있고, isAdmin 또는 role이 admin인지 확인
  const isAdminUser =
    authHook.userDoc?.isAdmin || authHook.userDoc?.role === "admin"; // userDoc 사용
  if (!isAdminUser) {
    // *** 기본 페이지를 "오늘의 할일"로 변경 ***
    return <Navigate to="/dashboard/tasks" replace />;
  }
  return children;
};

// --- 사이드바 메뉴 항목 정의 (변경 없음 -> 변경 있음) ---
const sidebarMenuItems = [
  {
    id: "todayTasks", // ID 변경
    name: "오늘의 할일",
    icon: "✅",
    path: "/dashboard/tasks", // Dashboard의 할일 섹션 경로
  },
  {
    id: "myAssets", // ID 변경 및 "나의 자산"으로 명칭 변경
    name: "나의 자산",
    icon: "💰", // 아이콘 변경 (기존 🏠에서)
    path: "/my-assets", // MyAssets 컴포넌트 경로
  },
  {
    id: "learningGames",
    name: "학습 게임",
    icon: "🎮",
    path: "/learning-games",
  },
  // ***** 문제 해결을 위해 이 부분 추가 *****
  {
    id: "itemCategory",
    name: "아이템", // 카테고리 이름 (예: 아이템, 상점 등 원하시는 대로 수정 가능)
    icon: "📦", // 카테고리 아이콘 (원하시는 아이콘으로 수정 가능)
    isCategory: true,
  },
  // ***** 여기까지 추가 *****
  {
    id: "myItems",
    name: "내 아이템",
    icon: "💼",
    path: "/my-items",
    categoryId: "itemCategory", // 변경된 카테고리 ID 참조
  },
  {
    id: "itemStore",
    name: "아이템상점",
    icon: "🏪", // 아이콘 변경 (기존 🛍️에서)
    path: "/item-shop",
    categoryId: "itemCategory", // 변경된 카테고리 ID 참조
  },
  {
    id: "itemMarket",
    name: "아이템시장",
    icon: "♻️",
    path: "/item-market",
    categoryId: "itemCategory", // 변경된 카테고리 ID 참조
  },
  {
    id: "financeCategory",
    name: "금융",
    icon: "💹",
    isCategory: true,
    pathPrefix: "/finance",
  },
  {
    id: "banking",
    name: "한국은행",
    icon: "🏦",
    path: "/banking",
    categoryId: "financeCategory",
  },
  {
    id: "stockTrading",
    name: "주식거래소",
    icon: "📈",
    path: "/stock-trading",
    categoryId: "financeCategory",
  },
  {
    id: "auction",
    name: "경매장",
    icon: "🔨",
    path: "/auction",
    categoryId: "financeCategory",
  },
  {
    id: "realEstate",
    name: "부동산거래소",
    icon: "🏠",
    path: "/real-estate",
    categoryId: "financeCategory",
  },
  {
    id: "publicInstitutionsCategory",
    name: "공공기관",
    icon: "🏛️",
    isCategory: true,
    pathPrefix: "/public",
  },
  {
    id: "government",
    name: "정부",
    icon: "⚖️", // 아이콘 변경 (기존 🏛️에서)
    path: "/government",
    categoryId: "publicInstitutionsCategory",
  },
  {
    id: "nationalAssembly",
    name: "국회",
    icon: "🏢",
    path: "/national-assembly",
    categoryId: "publicInstitutionsCategory",
  },
  {
    id: "court",
    name: "법원",
    icon: "👨‍⚖️", // 아이콘 변경 (기존 ⚖️에서)
    path: "/court",
    categoryId: "publicInstitutionsCategory",
  },
  {
    id: "policeStation",
    name: "경찰서",
    icon: "👮",
    path: "/police",
    categoryId: "publicInstitutionsCategory",
  },
  {
    id: "boardCategory", // ID 변경 (기존 economyCategory)
    name: "게시판",
    icon: "📊",
    isCategory: true,
    pathPrefix: "/board", // pathPrefix 변경
  },
  {
    id: "learningBoard",
    name: "학습 게시판",
    icon: "📝",
    path: "/learning-board",
    categoryId: "boardCategory", // 변경된 카테고리 ID 참조
  },
  {
    id: "userManagement",
    name: "사용자 관리",
    icon: "👥",
    path: "/user-management",
    categoryId: "boardCategory", // 변경된 카테고리 ID 참조
    adminOnly: true, // 관리자 전용 메뉴로 명시
  },
];

function LoginRedirect() {
  // ... (기존 코드 유지) ...
  const authHook = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authHook.loading) {
      if (authHook.user) {
        // *** 기본 페이지를 "오늘의 할일"로 변경 ***
        navigate("/dashboard/tasks", { replace: true });
      }
    }
  }, [authHook.loading, authHook.user, navigate]);

  if (authHook.loading) {
    return <div className="p-4 text-center">로딩 중...</div>;
  }
  if (!authHook.user) {
    return <Login />;
  }
  // *** 기본 페이지를 "오늘의 할일"로 변경 ***
  return <Navigate to="/dashboard/tasks" replace />;
}

function AppLayoutContent() {
  const navigate = useNavigate();
  const authHook = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // *** 수정된 부분 시작: TaskResetService에 classCode 전달 ***
  useEffect(() => {
    const classCode = authHook.userDoc?.classCode; // 현재 사용자의 classCode 가져오기

    const checkInitialReset = async () => {
      if (!classCode) {
        console.log(
          "학급 코드를 찾을 수 없어 초기화를 건너<0xEB><0x8B><0x88>니다."
        );
        return;
      }
      try {
        // classCode를 전달하여 해당 학급의 태스크만 초기화
        const result = await checkAndResetOnAppStart(classCode);
        console.log("앱 시작 시 초기화 확인 결과:", result);
        if (result.success && result.message.includes("초기화되었습니다")) {
          // alert('오늘의 할 일이 초기화되었습니다!');
        }
      } catch (error) {
        console.error("앱 시작 시 초기화 확인 중 오류:", error);
      }
    };

    // classCode가 있을 때만 초기화 및 타이머 설정
    if (classCode) {
      checkInitialReset();

      const resetTimerId = setupTaskResetTimer(
        (result) => {
          console.log("자동 초기화 결과:", result);
          if (result.success) {
            // alert('오늘의 할 일이 자동으로 초기화되었습니다!');
          }
        },
        classCode // classCode 전달
      );

      return () => {
        if (resetTimerId) {
          clearTimeout(resetTimerId);
          console.log("자동 초기화 타이머가 정리되었습니다.");
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHook.userDoc?.classCode]); // userDoc.classCode가 변경될 때 재실행
  // *** 수정된 부분 끝 ***

  // ... (toggleSidebar, handleSidebarNavigate, useEffect(handleResize)는 그대로 유지) ...
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  const handleSidebarNavigate = (item) => {
    if (item?.path) {
      navigate(item.path);
      if (isMobile) setIsSidebarOpen(false);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      const mobileState = window.innerWidth < 768;
      setIsMobile(mobileState);
      // 데스크탑에서는 사이드바를 기본적으로 열어두고, 모바일에서는 닫아둠
      if (!mobileState) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize(); // 초기 로드 시 실행
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (authHook.loading) {
    return <div className="p-4 text-center">앱 로딩 중...</div>;
  }

  if (location.pathname === "/login") {
    return authHook.user ? (
      <Navigate to="/dashboard/tasks" replace />
    ) : (
      <LoginRedirect />
    );
  }

  if (!authHook.user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!authHook.userDoc) {
    return (
      <div className="p-4 text-center">사용자 정보를 불러오는 중입니다...</div>
    );
  }

  // *** 수정된 부분 시작: userDoc.classCode 확인 추가 ***
  if (!authHook.userDoc.classCode && location.pathname !== "/login") {
    return (
      <div className="p-4 text-center">
        학급 코드 정보가 없습니다. 관리자에게 문의하여 학급 코드를 할당받으세요.
        <button onClick={authHook.logout}>로그아웃</button>
      </div>
    );
  }
  // *** 수정된 부분 끝 ***

  const currentUser = authHook.userDoc;
  const isAdminUser = currentUser?.isAdmin || currentUser?.role === "admin";
  const userClassCode = currentUser?.classCode; // 현재 사용자의 classCode

  // ... (cashBarStyle, cashContainerStyle, couponContainerStyle 등 스타일은 그대로 유지) ...
  const cashBarStyle = {
    position: "fixed",
    top: "80px",
    height: "60px",
    backgroundColor: "#e0f2f7",
    zIndex: 30,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    borderBottom: "1px solid #b2ebf2",
    transition: "left 0.3s ease, width 0.3s ease",
    boxSizing: "border-box",
    ...(isMobile
      ? {
          left: "0",
          width: "100%",
          padding: "0 10px",
        }
      : {
          left: isSidebarOpen ? "260px" : "0",
          width: isSidebarOpen ? "calc(100% - 260px)" : "100%",
          padding: "0 20px",
        }),
  };

  const cashContainerStyle = {
    width: isMobile ? "66%" : "66.6%",
    paddingRight: isMobile ? "5px" : "10px",
    boxSizing: "border-box",
  };

  const couponContainerStyle = {
    width: isMobile ? "34%" : "33.3%",
    paddingLeft: isMobile ? "5px" : "10px",
    boxSizing: "border-box",
  };

  const mainStyle = {
    padding: "20px",
    backgroundColor: "#f9fafb",
    overflowY: "auto",
    flexGrow: 1,
    boxSizing: "border-box",
    transition: "margin-left 0.3s ease, width 0.3s ease",
    width: "100%",
    marginLeft: "0",
    position: "relative",
  };

  if (!isMobile && isSidebarOpen) {
    mainStyle.marginLeft = "260px";
    mainStyle.width = "calc(100% - 260px)";
  }

  const layoutContainerStyle = {
    display: "flex",
    paddingTop: "140px",
    minHeight: "100vh",
    boxSizing: "border-box",
  };

  const cashDisplayStyle = {
    ...cashCouponStyle("#0277bd", "#e0f7fa", "#81d4fa"),
    width: "100%",
    borderRadius: "15px",
    justifyContent: "center",
    fontSize: isMobile ? "0.85rem" : "0.95rem",
    padding: isMobile ? "8px 10px" : "8px 15px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    boxSizing: "border-box",
  };

  const couponDisplayStyle = {
    ...cashCouponStyle("#ef6c00", "#fff3e0", "#ffcc80"),
    width: "100%",
    borderRadius: "15px",
    justifyContent: "center",
    fontSize: isMobile ? "0.85rem" : "0.95rem",
    padding: isMobile ? "8px 10px" : "8px 15px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    boxSizing: "border-box",
  };

  const valueTextStyle = {
    color: "#01579b",
    marginLeft: "4px",
    fontWeight: "700",
    whiteSpace: "nowrap",
  };

  const couponValueTextStyle = {
    color: "#e65100",
    marginLeft: "4px",
    fontWeight: "700",
    whiteSpace: "nowrap",
  };

  return (
    <div className="app-container">
      <Header
        toggleSidebar={toggleSidebar}
        user={authHook.user}
        logout={authHook.logout}
        isAdmin={isAdminUser}
      />

      <div style={cashBarStyle}>
        {/* ... (캐시바 JSX는 그대로 유지) ... */}
        <div style={cashContainerStyle}>
          <div style={cashDisplayStyle}>
            <span style={{ display: "flex", alignItems: "center" }}>
              <span style={{ marginRight: "4px" }}>💰</span>
              {!isMobile ? "보유 현금:" : "현금:"}
              <span style={valueTextStyle}>
                {currentUser?.cash?.toLocaleString() || 0}원
              </span>
            </span>
          </div>
        </div>
        <div style={couponContainerStyle}>
          <div style={couponDisplayStyle}>
            <span style={{ display: "flex", alignItems: "center" }}>
              <span style={{ marginRight: "4px" }}>🎫</span>
              {!isMobile ? "보유 쿠폰:" : "쿠폰:"}
              <span style={couponValueTextStyle}>
                {currentUser?.coupons?.toLocaleString() || 0}개
              </span>
            </span>
          </div>
        </div>
      </div>

      <div style={layoutContainerStyle}>
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={toggleSidebar}
          menuItems={sidebarMenuItems}
          isFullscreen={isMobile}
          onNavigate={handleSidebarNavigate}
        />
        <main style={mainStyle}>
          <Routes>
            {/* 모든 ProtectedRoute와 AdminRoute는 classCode가 있다는 가정 하에 작동 */}
            <Route
              path="/dashboard/tasks"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-assets"
              element={
                <ProtectedRoute>
                  <MyAssets />
                </ProtectedRoute>
              }
            />
            {/* !! ItemStore 등도 classCode를 사용하도록 수정 필요 */}
            <Route
              path="/item-shop"
              element={
                <ProtectedRoute>
                  <ItemStore />
                </ProtectedRoute>
              }
            />
            <Route
              path="/learning-games"
              element={
                <ProtectedRoute>
                  <LearningGames />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-items"
              element={
                <ProtectedRoute>
                  <MyItems />
                </ProtectedRoute>
              }
            />
            {/* !! ItemMarket 등도 classCode를 사용하도록 수정 필요 */}
            <Route
              path="/item-market"
              element={
                <ProtectedRoute>
                  <ItemMarket />
                </ProtectedRoute>
              }
            />
            {/* !! Banking 등 다른 컴포넌트들도 classCode 필터링 필요 */}
            <Route
              path="/banking"
              element={
                <ProtectedRoute>
                  <Banking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock-trading"
              element={
                <ProtectedRoute>
                  <StockExchange />
                </ProtectedRoute>
              }
            />
            <Route
              path="/auction"
              element={
                <ProtectedRoute>
                  <Auction />
                </ProtectedRoute>
              }
            />
            <Route
              path="/real-estate"
              element={
                <ProtectedRoute>
                  <RealEstateRegistry />
                </ProtectedRoute>
              }
            />
            <Route
              path="/government"
              element={
                <ProtectedRoute>
                  <Government />
                </ProtectedRoute>
              }
            />
            <Route
              path="/national-assembly"
              element={
                <ProtectedRoute>
                  <NationalAssembly />
                </ProtectedRoute>
              }
            />
            <Route
              path="/court"
              element={
                <ProtectedRoute>
                  <Court />
                </ProtectedRoute>
              }
            />
            <Route
              path="/police"
              element={
                <ProtectedRoute>
                  <PoliceStation />
                </ProtectedRoute>
              }
            />
            {/* !! LearningBoard도 classCode 필터링 필요 */}
            <Route
              path="/learning-board"
              element={
                <ProtectedRoute>
                  <LearningBoard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/user-management"
              element={
                <AdminRoute>
                  <UserManagementComponent />
                </AdminRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <div>
                    <h1>관리자 작업 설정 페이지</h1>
                    <AdminCommonTaskSettings
                      commonTasks={[]} // !! classCode로 필터링된 데이터 전달 필요
                      handleEditTask={(id) => console.log("Edit task", id)}
                      handleDeleteTask={(id) => console.log("Delete task", id)}
                      handleAddTaskClick={() => console.log("Add task")}
                      classCode={userClassCode} // classCode 전달
                    />
                  </div>
                </AdminRoute>
              }
            />
            {/* !! AdminItemPage도 classCode 전달 필요 */}
            <Route
              path="/admin/items"
              element={
                <AdminRoute>
                  <AdminItemPage />
                </AdminRoute>
              }
            />
            {/* *** AdminPanel에 classCode 전달 *** */}
            <Route
              path="/admin-panel"
              element={
                <AdminRoute>
                  <AdminPanel
                    onClose={() => navigate(-1)}
                    classCode={userClassCode} // classCode 전달
                  />
                </AdminRoute>
              }
            />
            <Route
              path="/"
              element={<Navigate to="/dashboard/tasks" replace />}
            />
            <Route
              path="*"
              element={<Navigate to="/dashboard/tasks" replace />}
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ItemProvider>
        {" "}
        {/* !! ItemProvider가 classCode를 사용하도록 수정 필요 */}
        <Router>
          <Routes>
            <Route path="/login" element={<LoginRedirect />} />
            <Route path="/*" element={<AppLayoutContent />} />
          </Routes>
        </Router>
      </ItemProvider>
    </AuthProvider>
  );
}

export default App;
