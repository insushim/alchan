// src/App.js
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";

// Firebase imports
import { db, isFirestoreInitialized, functions } from "./firebase";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  getDocs,
  limit,
  orderBy,
} from "firebase/firestore";

import { AuthProvider, useAuth } from "./AuthContext";
import { ItemProvider } from "./ItemContext";

// 숫자 포맷터 import 추가
import { formatKoreanCurrency, formatCouponCount } from "./numberFormatter";

// 서비스 및 컴포넌트 imports
import {
  setupTaskResetTimer,
  checkAndResetOnAppStart,
} from "./TaskResetService";
import AdminCommonTaskSettings from "./AdminCommonTaskSettings";
import Dashboard from "./Dashboard";
import ItemStore from "./ItemStore";
import MyItems from "./MyItems";
import MyAssets from "./MyAssets";
import ItemMarket from "./ItemMarket";
import Login from "./Login";
import AdminItemPage from "./AdminItemPage";
import AdminPage from "./AdminPage";
import Header from "./Header";
import Sidebar from "./Sidebar";
import LearningBoard from "./LearningBoard";
import MusicRequest from './MusicRequest';
import MusicRoom from './MusicRoom';
import StudentRequest from './StudentRequest';
import AdminPanel from "./AdminPanel";
import Banking from "./Banking";
import StockExchange from "./StockExchange";
import RealEstateRegistry from "./RealEstateRegistry";
import NationalAssembly from "./NationalAssembly";
import Government from "./Government";
import Court from "./Court";
import PoliceStation from "./PoliceStation";
import Auction from "./Auction";
import MoneyTransfer from "./MoneyTransfer";
import ActivityLog from "./ActivityLog";
import AdminDatabase from "./AdminDatabase";
import AdminJobSettings from "./AdminJobSettings";
import CouponTransfer from "./CouponTransfer";
import CouponGoalPage from "./CouponGoalPage";

// 게임 컴포넌트 import
import GonuGame from "./GonuGame";
import OmokGame from "./OmokGame";
import ChessGame from "./ChessGame";

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
import "./MyItems.css";
import "./ItemMarket.css";
import "./LearningBoard.css";
import "./AdminPanel.css";
import "./App.css";
import "./MoneyTransfer.css";
import "./ActivityLog.css";
import "./CouponTransfer.css";
import "./AdminSettingsModal.css";

// 아이콘 imports
import {
  FaBars,
  FaCog,
  FaBriefcase,
  FaShieldAlt,
  FaHome,
  FaTasks,
  FaBullseye,
  FaStore,
  FaTrophy,
  FaUser,
  FaMoneyBillTransfer,
  FaChess,
  FaSignOutAlt,
  FaClipboardList,
  FaUsers
} from "react-icons/fa";

// 캐시 관리를 위한 전역 객체
const userDataCache = new Map();
const cacheTimeouts = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5분 캐시
const DEBOUNCE_DELAY = 500; // 500ms 디바운스

// 디바운스 유틸리티 함수
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

// 배치 업데이트를 위한 큐
const batchUpdateQueue = new Map();
const BATCH_UPDATE_DELAY = 1000; // 1초 배치 딜레이

const processBatchUpdates = debounce(async () => {
  if (batchUpdateQueue.size === 0) return;
  
  const updates = Array.from(batchUpdateQueue.entries());
  batchUpdateQueue.clear();
  
  try {
    const promises = updates.map(([docPath, updateData]) => {
      const docRef = doc(db, ...docPath.split('/'));
      return updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp(),
      });
    });
    
    await Promise.all(promises);
  } catch (error) {
    // 실패한 업데이트는 개별적으로 재시도
    updates.forEach(([docPath, updateData]) => {
      setTimeout(async () => {
        try {
          const docRef = doc(db, ...docPath.split('/'));
          await updateDoc(docRef, {
            ...updateData,
            updatedAt: serverTimestamp(),
          });
        } catch (retryError) {
        }
      }, 2000);
    });
  }
}, BATCH_UPDATE_DELAY);

// 캐시된 업데이트 함수
const queueBatchUpdate = (docPath, updateData) => {
  batchUpdateQueue.set(docPath, updateData);
  processBatchUpdates();
};

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
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());
  const hasLoadedFromCacheRef = useRef(false);
  const [groupedUsers, setGroupedUsers] = useState({});
  const [newPassword, setNewPassword] = useState("");

  const { userDoc, functions } = useAuth();
  const adminClassCode = userDoc?.classCode;
  const isSuperAdmin = userDoc?.isSuperAdmin;

  useEffect(() => {
    const groups = users.reduce((acc, user) => {
      const classCode = user.classCode || '미지정';
      if (!acc[classCode]) {
        acc[classCode] = [];
      }
      acc[classCode].push(user);
      return acc;
    }, {});

    for (const classCode in groups) {
      groups[classCode].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    const sortedGroups = Object.keys(groups).sort().reduce(
      (obj, key) => {
        obj[key] = groups[key];
        return obj;
      },
      {}
    );

    setGroupedUsers(sortedGroups);
  }, [users]);

  const cacheKey = useMemo(() =>
    `users_${isSuperAdmin ? 'all' : adminClassCode || 'none'}`, 
    [isSuperAdmin, adminClassCode]
  );

  const loadCachedUsers = useCallback(() => {
    const cached = userDataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setUsers(cached.data);
      setLoading(false);
      return true;
    }
    return false;
  }, [cacheKey]);

  const updateUserCache = useCallback((userData) => {
    userDataCache.set(cacheKey, {
      data: userData,
      timestamp: Date.now()
    });

    const existingTimeout = cacheTimeouts.get(cacheKey);
    if (existingTimeout) clearTimeout(existingTimeout);

    const newTimeout = setTimeout(() => {
      userDataCache.delete(cacheKey);
      cacheTimeouts.delete(cacheKey);
    }, CACHE_DURATION);

    cacheTimeouts.set(cacheKey, newTimeout);
  }, [cacheKey]);

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
    hasLoadedFromCacheRef.current = false;
  }, [cacheKey]);

  useEffect(() => {
    if (!firebaseStatus.initialized || (!isSuperAdmin && !adminClassCode)) {
      if (firebaseStatus.checked) setLoading(false);
      if (firebaseStatus.checked && !isSuperAdmin && !adminClassCode) {
        setError(
          "관리자의 학급 코드를 찾을 수 없어 사용자 목록을 불러올 수 없습니다."
        );
      }
      return;
    }

    if (!hasLoadedFromCacheRef.current) {
      if (loadCachedUsers()) {
        hasLoadedFromCacheRef.current = true;
      } else {
        setLoading(true);
      }
    }

    let unsubscribe;
    try {
      const usersCollection = collection(db, "users");

      const usersQuery = isSuperAdmin
        ? query(usersCollection, orderBy("createdAt", "desc"))
        : query(
            usersCollection,
            where("classCode", "==", adminClassCode),
            orderBy("createdAt", "desc")
          );

      const loadUsers = async () => {
        try {
          const snapshot = await getDocs(usersQuery);
          const usersList = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          setUsers(usersList);
          updateUserCache(usersList);
          setLoading(false);
          setError(null);
          setLastUpdateTime(Date.now());
        } catch (error) {
          console.error("사용자 데이터 로드 오류:", error);
          setError("사용자 데이터 로딩 오류: " + error.message);
          setLoading(false);
        }
      };

      const startUserPolling = () => {
        const pollUsers = async () => {
          try {
            const cached = userDataCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < 240000) { // 4분 이내
              return;
            }
            await loadUsers();
          } catch (error) {
            console.error("폴링 오류:", error);
          }
        };
        loadUsers();
        const pollingInterval = setInterval(pollUsers, 300000); // 5분
        return () => {
          clearInterval(pollingInterval);
        };
      };

      return startUserPolling();

    } catch (err) {
      console.error("사용자 데이터 설정 오류:", err);
      setError("데이터 구독 설정 오류: " + err.message);
      setLoading(false);
    }
  }, [
    firebaseStatus.initialized,
    adminClassCode,
    isSuperAdmin,
    updateUserCache,
    loadCachedUsers,
    cacheKey
  ]);

  const debouncedAddUser = useCallback(
    debounce(async (userData) => {
      if (!isFirestoreInitialized()) return setError("Firestore 미초기화.");
      if (!userData.name || !userData.email)
        return setError("이름과 이메일 입력 필요.");
      if (!adminClassCode)
        return setError("새 사용자를 추가할 학급 코드를 알 수 없습니다.");

      setLoading(true);
      try {
        const docRef = await addDoc(collection(db, "users"), {
          ...userData,
          classCode: adminClassCode,
          createdAt: serverTimestamp(),
        });

        const newUserData = {
          id: docRef.id,
          ...userData,
          classCode: adminClassCode,
          createdAt: { toDate: () => new Date() }
        };

        setUsers(prevUsers => [newUserData, ...prevUsers]);
        setNewUser({ name: "", email: "" });
        setError(null);

        const updatedUsers = [newUserData, ...users];
        updateUserCache(updatedUsers);

      } catch (error) {
        setError(`사용자 추가 오류: ${error.message}`);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_DELAY),
    [adminClassCode, users, updateUserCache]
  );

  const handleAddUser = async (e) => {
    e.preventDefault();
    debouncedAddUser(newUser);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!isFirestoreInitialized() || !editing) return;
    if (!editing.name || !editing.email)
      return setError("이름과 이메일 입력 필요.");

    setLoading(true);
    try {
      queueBatchUpdate(`users/${editing.id}`, {
        name: editing.name,
        email: editing.email,
        classCode: editing.classCode,
      });

      setUsers(prevUsers =>
        prevUsers.map(user =>
          user.id === editing.id
            ? { ...user, name: editing.name, email: editing.email, classCode: editing.classCode }
            : user
        )
      );

      setEditing(null);
      setError(null);

      const updatedUsers = users.map(user =>
        user.id === editing.id
          ? { ...user, name: editing.name, email: editing.email, classCode: editing.classCode }
          : user
      );
      updateUserCache(updatedUsers);

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

      setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
      setError(null);

      const updatedUsers = users.filter(user => user.id !== userId);
      updateUserCache(updatedUsers);

    } catch (error) {
      setError(`사용자 삭제 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!editing || !newPassword) {
      alert("새 비밀번호를 입력하세요.");
      return;
    }
    if (!window.confirm(`${editing.name}님의 비밀번호를 변경하시겠습니까?`)) return;

    setLoading(true);
    try {
      const adminResetUserPassword = httpsCallable(functions, 'adminResetUserPassword');
      await adminResetUserPassword({ uid: editing.id, newPassword });
      alert("비밀번호가 성공적으로 변경되었습니다.");
      setNewPassword("");
      setEditing(null);
    } catch (error) {
      setError(`비밀번호 변경 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const usersCollection = collection(db, "users");
      const usersQuery = isSuperAdmin
        ? query(usersCollection, orderBy("createdAt", "desc"))
        : query(
            usersCollection,
            where("classCode", "==", adminClassCode),
            orderBy("createdAt", "desc")
          );

      const snapshot = await getDocs(usersQuery);
      const usersList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setUsers(usersList);
      updateUserCache(usersList);
      setLastUpdateTime(Date.now());
      setError(null);
    } catch (error) {
      setError(`새로고침 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, adminClassCode, updateUserCache]);

  if (!firebaseStatus.initialized && firebaseStatus.checked) {
    return <div>Firebase 초기화 실패...</div>;
  }
  if (loading && users.length === 0) {
    return <div>데이터 로딩 중...</div>;
  }

  return (
    <div className="user-management-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>
          사용자 관리{" "}
          {adminClassCode
            ? `(학급: ${adminClassCode})`
            : isSuperAdmin
            ? "(전체)"
            : ""}
        </h1>
        <div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            style={{ marginRight: '10px' }}
          >
            {loading ? "새로고침 중..." : "🔄 새로고침"}
          </button>
          <small style={{ color: '#666' }}>
            마지막 업데이트: {new Date(lastUpdateTime).toLocaleTimeString()}
          </small>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error} <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {adminClassCode && (
        <div className="form-container">
          <h2>새 사용자 추가 ({adminClassCode})</h2>
          <form onSubmit={handleAddUser}>
            <div>
              <label>이름:</label>
              <input
                type="text"
                value={newUser.name}
                onChange={(e) =>
                  setNewUser({ ...newUser, name: e.target.value })
                }
                required
                disabled={loading && !users.length}
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

      {editing && (
        <div className="form-container">
          <h2>사용자 정보 수정</h2>
          <form onSubmit={handleUpdateUser}>
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
            {isSuperAdmin && (
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
          <div className="password-change-container">
            <h3>비밀번호 변경</h3>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="새 비밀번호"
              disabled={loading}
            />
            <button onClick={handleChangePassword} disabled={loading}>
              {loading ? "처리 중..." : "비밀번호 변경"}
            </button>
          </div>
        </div>
      )}

      <div className="users-list">
        <h2>사용자 목록 ({users.length}명)</h2>
        {Object.keys(groupedUsers).map(classCode => (
          <div key={classCode} className="class-group">
            <h3>{classCode} ({groupedUsers[classCode].length}명)</h3>
            <ul>
              {groupedUsers[classCode].map((user) => (
                <li key={user.id}>
                  <div className="user-info">
                    <strong>{user.name || "이름 없음"}</strong>
                    <p>이메일: {user.email || "이메일 없음"}</p>
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
          </div>
        ))}
      </div>
    </div>
  );
}

const ProtectedRoute = ({ children }) => {
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
  const authHook = useAuth();
  const location = useLocation();

  if (authHook.loading) {
    return <div className="p-4 text-center">관리자 정보 로딩 중...</div>;
  }
  if (!authHook.user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  const isAdminUser =
    authHook.userDoc?.isAdmin || authHook.userDoc?.role === "admin";
  if (!isAdminUser) {
    return <Navigate to="/dashboard/tasks" replace />;
  }
  return children;
};

// 사이드바 메뉴 항목 정의
const sidebarMenuItems = [
  {
    id: "todayTasks",
    name: "오늘의 할일",
    icon: "✅",
    path: "/dashboard/tasks",
  },
  {
    id: "myAssets",
    name: "나의 자산",
    icon: "💰",
    path: "/my-assets",
  },
  {
    id: "couponGoal",
    name: "쿠폰 목표",
    icon: "🎯",
    path: "/coupon-goal",
  },
  {
    id: "learningGamesCategory",
    name: "학습 게임",
    icon: "🎮",
    isCategory: true,
  },
  {
    id: "omokGame",
    name: "오목",
    icon: "⚫",
    path: "/learning-games/omok",
    categoryId: "learningGamesCategory",
  },
  {
    id: "typingGame",
    name: "타자연습",
    icon: "⌨️",
    path: "/learning-games/typing",
    categoryId: "learningGamesCategory",
  },
  {
    id: "gonuGame",
    name: "고누 게임",
    icon: "🎲",
    path: "/gonu-game",
    categoryId: "learningGamesCategory",
  },
  {
    id: "scienceGame",
    name: "체스 게임",
    icon: "♟️",
    path: "/learning-games/science",
    categoryId: "learningGamesCategory",
  },
  {
    id: "itemCategory",
    name: "아이템",
    icon: "📦",
    isCategory: true,
  },
  {
    id: "myItems",
    name: "내 아이템",
    icon: "💼",
    path: "/my-items",
    categoryId: "itemCategory",
  },
  {
    id: "itemStore",
    name: "아이템상점",
    icon: "🛒",
    path: "/item-shop",
    categoryId: "itemCategory",
  },
  {
    id: "itemMarket",
    name: "아이템시장",
    icon: "♻️",
    path: "/item-market",
    categoryId: "itemCategory",
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
    icon: "⚖️",
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
    icon: "👨‍⚖️",
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
    id: "boardCategory",
    name: "게시판",
    icon: "📊",
    isCategory: true,
    pathPrefix: "/board",
  },
  {
    id: "learningBoard",
    name: "학습 게시판",
    icon: "📝",
    path: "/learning-board",
    categoryId: "boardCategory",
  },
  {
    id: "musicRequest",
    name: "음악 신청",
    icon: "🎵",
    path: "/learning-board/music-request",
    categoryId: "boardCategory",
  },
  {
    id: "adminFunctionsCategory",
    name: "관리자 기능",
    icon: "👑",
    isCategory: true,
    adminOnly: true,
  },
  {
    id: "adminAppSettings",
    name: "앱 설정",
    icon: "⚙️",
    path: "/admin/app-settings",
    categoryId: "adminFunctionsCategory",
    adminOnly: true,
  },
  {
    id: "couponTransfer",
    name: "쿠폰 보내기/가져오기",
    icon: "🎟️",
    path: "/admin/coupon-transfer",
    categoryId: "adminFunctionsCategory",
    adminOnly: true,
  },
  {
    id: "moneyTransfer",
    name: "돈 보내기/가져오기",
    icon: "💸",
    path: "/admin/money-transfer",
    categoryId: "adminFunctionsCategory",
    adminOnly: true,
  },
  {
    id: "activityLog",
    name: "데이터베이스",
    icon: "🗂️",
    path: "/admin/activity-log",
    categoryId: "adminFunctionsCategory",
    adminOnly: true,
  },
  {
    id: "adminPage",
    name: "관리자 제어판",
    icon: "🎛️",
    path: "/admin/page",
    categoryId: "adminFunctionsCategory",
    adminOnly: true,
  },
  {
    id: "userManagement",
    name: "사용자 관리",
    icon: "👥",
    path: "/user-management",
    categoryId: "adminFunctionsCategory",
    adminOnly: true,
    superAdminOnly: true,
  },
];

function LoginRedirect() {
  const authHook = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authHook.loading) {
      if (authHook.user) {
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
  return <Navigate to="/dashboard/tasks" replace />;
}

function AppLayoutContent() {
  const navigate = useNavigate();
  const authHook = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [lastTaskResetCheck, setLastTaskResetCheck] = useState(Date.now());

  const currentUser = authHook.userDoc;
  const isAdminUser = useMemo(() => currentUser?.isAdmin || currentUser?.role === "admin", [currentUser]);
  const classCode = authHook.userDoc?.classCode;
  const userClassCode = currentUser?.classCode;

  // 태스크 리셋 체크를 최적화 - 10분마다만 체크
  useEffect(() => {
    const checkInitialReset = async () => {
      if (!classCode) {
        return;
      }
      
      // 마지막 체크로부터 10분이 지났는지 확인
      const now = Date.now();
      if (now - lastTaskResetCheck < 10 * 60 * 1000) { // 10분
        return;
      }
      
      try {
        const result = await checkAndResetOnAppStart(classCode);
        setLastTaskResetCheck(now);
      } catch (error) {
      }
    };

    if (classCode) {
      checkInitialReset();
      
      // 태스크 리셋 타이머를 1시간마다만 체크하도록 최적화
      const resetTimerId = setupTaskResetTimer(() => {
        setLastTaskResetCheck(Date.now());
      }, classCode);
      
      return () => {
        if (resetTimerId) {
          clearTimeout(resetTimerId);
        }
      };
    }
  }, [classCode, lastTaskResetCheck]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const handleSidebarNavigate = useCallback((item) => {
    if (item?.path) {
      navigate(item.path);
      if (isMobile) setIsSidebarOpen(false);
    }
  }, [navigate, isMobile]);

  useEffect(() => {
    const handleResize = () => {
      const mobileState = window.innerWidth < 768;
      setIsMobile(mobileState);
      if (!mobileState) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };
    
    window.addEventListener("resize", handleResize);
    handleResize();
    
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 메모이제이션된 스타일 객체들
  const cashBarStyle = useMemo(() => ({
    position: "fixed",
    top: "80px",
    height: "60px",
    backgroundColor: "#e0f2f7",
    zIndex: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    borderBottom: "1px solid #b2ebf2",
    transition: "left 0.3s ease, width 0.3s ease",
    boxSizing: "border-box",
    ...(isMobile
      ? { left: "0", width: "100%", padding: "0 10px" }
      : {
          left: isSidebarOpen ? "260px" : "0",
          width: isSidebarOpen ? "calc(100% - 260px)" : "100%",
          padding: "0 20px",
        }),
  }), [isMobile, isSidebarOpen]);

  const mainStyle = useMemo(() => {
    const baseStyle = {
      padding: "20px",
      backgroundColor: "#f9fafb",
      flexGrow: 1,
      boxSizing: "border-box",
      transition: "margin-left 0.3s ease, width 0.3s ease",
      width: "100%",
      marginLeft: "0",
    };

    if (!isMobile && isSidebarOpen) {
      baseStyle.marginLeft = "260px";
      baseStyle.width = "calc(100% - 260px)";
    }

    return baseStyle;
  }, [isMobile, isSidebarOpen]);

  const layoutContainerStyle = useMemo(() => ({
    display: "flex",
    paddingTop: "140px",
    minHeight: "100vh",
    boxSizing: "border-box",
  }), []);

  const cashContainerStyle = useMemo(() => ({
    width: isMobile ? "66%" : "66.6%",
    paddingRight: isMobile ? "5px" : "10px",
    boxSizing: "border-box",
  }), [isMobile]);

  const couponContainerStyle = useMemo(() => ({
    width: isMobile ? "34%" : "33.3%",
    paddingLeft: isMobile ? "5px" : "10px",
    boxSizing: "border-box",
  }), [isMobile]);

  const cashDisplayStyle = useMemo(() => ({
    ...cashCouponStyle("#0277bd", "#e0f7fa", "#81d4fa"),
    width: "100%",
    justifyContent: "center",
    fontSize: isMobile ? "0.85rem" : "0.95rem",
  }), [isMobile]);

  const couponDisplayStyle = useMemo(() => ({
    ...cashCouponStyle("#ef6c00", "#fff3e0", "#ffcc80"),
    width: "100%",
    justifyContent: "center",
    fontSize: isMobile ? "0.85rem" : "0.95rem",
  }), [isMobile]);

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

  if (!authHook.userDoc.classCode && location.pathname !== "/login") {
    return (
      <div className="p-4 text-center">
        학급 코드 정보가 없습니다. 관리자에게 문의하여 학급 코드를 할당받으세요.
        <button onClick={authHook.logout}>로그아웃</button>
      </div>
    );
  }



  return (
    <div className="app-container">
      <Header
        toggleSidebar={toggleSidebar}
        isAdmin={isAdminUser}
      />

      <div style={cashBarStyle}>
        <div style={cashContainerStyle}>
          <div style={cashDisplayStyle}>
            <span>
              <span style={{ marginRight: "4px" }}>💰</span>
              {!isMobile ? "보유 현금:" : "현금:"}
              <span style={{ color: "#01579b", fontWeight: "700" }}>
                {formatKoreanCurrency(currentUser?.cash || 0)}
              </span>
            </span>
          </div>
        </div>
        <div style={couponContainerStyle}>
          <div style={couponDisplayStyle}>
            <span>
              <span style={{ marginRight: "4px" }}>🎫</span>
              {!isMobile ? "보유 쿠폰:" : "쿠폰:"}
              <span style={{ color: "#e65100", fontWeight: "700" }}>
                {formatCouponCount(currentUser?.coupons || 0)}
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
            <Route
              path="/coupon-goal"
              element={
                <ProtectedRoute>
                  <CouponGoalPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/gonu-game"
              element={
                <ProtectedRoute>
                  <GonuGame />
                </ProtectedRoute>
              }
            />
            
            <Route path="/learning-games/omok" element={<ProtectedRoute><OmokGame /></ProtectedRoute>} />
            <Route path="/learning-games/science" element={<ProtectedRoute><ChessGame /></ProtectedRoute>} />
            
            <Route
              path="/learning-board/music-request"
              element={
                <ProtectedRoute>
                  <MusicRequest user={authHook.user} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/music-room/:roomId"
              element={
                <ProtectedRoute>
                  <MusicRoom user={authHook.user} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student-request/:roomId"
              element={<StudentRequest />}
            />
            
            <Route
              path="/item-shop"
              element={<ProtectedRoute><ItemStore /></ProtectedRoute>}
            />
            <Route
              path="/my-items"
              element={<ProtectedRoute><MyItems /></ProtectedRoute>}
            />
            <Route
              path="/item-market"
              element={<ProtectedRoute><ItemMarket /></ProtectedRoute>}
            />
            <Route
              path="/banking"
              element={<ProtectedRoute><Banking /></ProtectedRoute>}
            />
            <Route
              path="/stock-trading"
              element={<ProtectedRoute><StockExchange /></ProtectedRoute>}
            />
            <Route
              path="/auction"
              element={<ProtectedRoute><Auction /></ProtectedRoute>}
            />
            <Route
              path="/real-estate"
              element={<ProtectedRoute><RealEstateRegistry /></ProtectedRoute>}
            />
            <Route
              path="/government"
              element={<ProtectedRoute><Government /></ProtectedRoute>}
            />
            <Route
              path="/national-assembly"
              element={<ProtectedRoute><NationalAssembly /></ProtectedRoute>}
            />
            <Route
              path="/court"
              element={<ProtectedRoute><Court /></ProtectedRoute>}
            />
            <Route
              path="/police"
              element={<ProtectedRoute><PoliceStation /></ProtectedRoute>}
            />
            <Route
              path="/learning-board"
              element={<ProtectedRoute><LearningBoard /></ProtectedRoute>}
            />
            <Route
              path="/user-management"
              element={<AdminRoute><UserManagementComponent /></AdminRoute>}
            />
            
            {/* 관리자 라우트 */}
            <Route
              path="/admin/app-settings"
              element={
                <AdminRoute>
                  <Dashboard adminTabMode="generalSettings" />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/job-settings"
              element={
                <AdminRoute>
                  <Dashboard adminTabMode="jobSettings" />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/app-management"
              element={
                <AdminRoute>
                  <Dashboard adminTabMode="appManagement" />
                </AdminRoute>
              }
            />
            
            <Route
              path="/admin/coupon-transfer"
              element={<AdminRoute><CouponTransfer /></AdminRoute>}
            />
            <Route
              path="/admin/money-transfer"
              element={<AdminRoute><MoneyTransfer /></AdminRoute>}
            />
            <Route
              path="/admin/activity-log"
              element={<AdminRoute><AdminDatabase /></AdminRoute>}
            />
            <Route
              path="/admin/items"
              element={<AdminRoute><AdminItemPage /></AdminRoute>}
            />
            <Route
              path="/admin/page"
              element={<AdminRoute><AdminPage /></AdminRoute>}
            />
            <Route
              path="/admin-panel"
              element={
                <AdminRoute>
                  <AdminPanel
                    onClose={() => navigate(-1)}
                    classCode={userClassCode}
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
  // 앱 종료 시 캐시 정리
  useEffect(() => {
    const handleBeforeUnload = () => {
      // 배치 업데이트 강제 실행
      if (batchUpdateQueue.size > 0) {
        processBatchUpdates();
      }
      
      // 캐시 정리
      userDataCache.clear();
      cacheTimeouts.forEach(timeout => clearTimeout(timeout));
      cacheTimeouts.clear();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, []);

  return (
    <AuthProvider>
      <ItemProvider>
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