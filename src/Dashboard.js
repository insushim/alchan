// src/Dashboard.js - Firestore 최적화 버전 + 일일 할일 리셋 기능
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import "./Dashboard.css";
import { useAuth } from "./AuthContext";
import { db, functions } from "./firebase"; // functions import 추가
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  increment,
  arrayUnion,
  query,
  where,
  addDoc,
  collection as firestoreCollection,
  limit,
  orderBy,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions"; // httpsCallable import 추가
import { formatKoreanCurrency, formatCouponCount } from './numberFormatter';
import JobList from "./JobList";
import CommonTaskList from "./CommonTaskList";
import TransferModal from "./TransferModal";
import DonateCouponModal from "./DonateCouponModal";
import DonationHistoryModal from "./DonationHistoryModal";
import SellCouponModal from "./SellCouponModal";
import AdminSettingsModal from "./AdminSettingsModal";
import GiftCouponModal from "./GiftCouponModal";

// Cloud Functions 호출 함수 설정
const manualResetClassTasks = httpsCallable(functions, 'manualResetClassTasks');

// 캐시 관리 클래스
class DataCache {
  constructor() {
    this.cache = new Map();
    this.timestamps = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5분
  }

  set(key, data, ttl = this.defaultTTL) {
    this.cache.set(key, data);
    this.timestamps.set(key, Date.now() + ttl);
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    
    const expiry = this.timestamps.get(key);
    if (Date.now() > expiry) {
      this.cache.delete(key);
      this.timestamps.delete(key);
      return null;
    }
    
    return this.cache.get(key);
  }

  invalidate(key) {
    this.cache.delete(key);
    this.timestamps.delete(key);
  }

  clear() {
    this.cache.clear();
    this.timestamps.clear();
  }
}

// 전역 캐시 인스턴스
const dataCache = new DataCache();

// 배치 작업 관리 클래스
class BatchManager {
  constructor() {
    this.pendingWrites = [];
    this.batchTimeout = null;
    this.BATCH_DELAY = 2000; // 2초 지연
    this.MAX_BATCH_SIZE = 500; // Firestore 제한
  }

  addWrite(operation) {
    this.pendingWrites.push(operation);
    
    if (this.pendingWrites.length >= this.MAX_BATCH_SIZE) {
      this.executeBatch();
    } else {
      this.scheduleBatch();
    }
  }

  scheduleBatch() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    
    this.batchTimeout = setTimeout(() => {
      this.executeBatch();
    }, this.BATCH_DELAY);
  }

  async executeBatch() {
    if (this.pendingWrites.length === 0) return;
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    const batch = writeBatch(db);
    const operations = [...this.pendingWrites];
    this.pendingWrites = [];

    try {
      operations.forEach(({ type, ref, data }) => {
        switch (type) {
          case 'set':
            batch.set(ref, data);
            break;
          case 'update':
            batch.update(ref, data);
            break;
          case 'delete':
            batch.delete(ref);
            break;
        }
      });

      await batch.commit();
      console.log(`배치 실행 완료: ${operations.length}개 작업`);
    } catch (error) {
      console.error('배치 실행 실패:', error);
      // 실패한 작업들을 다시 큐에 추가할 수 있음
    }
  }
}

const batchManager = new BatchManager();

// 실시간 리스너 관리 클래스
class RealtimeManager {
  constructor() {
    this.listeners = new Map();
  }

  addListener(key, unsubscribe) {
    if (this.listeners.has(key)) {
      this.listeners.get(key)();
    }
    this.listeners.set(key, unsubscribe);
  }

  removeListener(key) {
    if (this.listeners.has(key)) {
      this.listeners.get(key)();
      this.listeners.delete(key);
    }
  }

  removeAllListeners() {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }
}

// Utility functions - 캐시 및 최적화 적용
const fetchClassData = async (classCode) => {
  const cacheKey = `classData_${classCode}`;
  const cached = dataCache.get(cacheKey);
  if (cached) return cached;

  try {
    const q = query(
      firestoreCollection(db, "sharedData"),
      where("classCode", "==", classCode),
      limit(100) // 제한 추가
    );
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    
    dataCache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Error fetching class data:", error);
    return [];
  }
};

const saveSharedData = async (data, classCode) => {
  try {
    // 배치 매니저 사용
    const newDocRef = doc(firestoreCollection(db, "sharedData"));
    batchManager.addWrite({
      type: 'set',
      ref: newDocRef,
      data: {
        ...data,
        classCode,
        createdAt: serverTimestamp(),
      }
    });
    
    // 캐시 무효화
    dataCache.invalidate(`classData_${classCode}`);
    return true;
  } catch (error) {
    console.error("Error saving shared data:", error);
    return false;
  }
};

function SelectMultipleJobsView({
  availableJobs,
  currentSelectedJobIds = [],
  onConfirmSelection,
  onCancel,
}) {
  const [tempSelection, setTempSelection] = useState(
    Array.isArray(currentSelectedJobIds) ? [...currentSelectedJobIds] : []
  );

  const activeJobs = useMemo(() => {
    return Array.isArray(availableJobs)
      ? availableJobs.filter((job) => job.active !== false)
      : [];
  }, [availableJobs]);

  const formStyles = {
    container: {
      padding: "20px",
      backgroundColor: "#ffffff",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
      maxWidth: "600px",
      margin: "30px auto",
    },
    title: {
      fontSize: "22px",
      fontWeight: "600",
      color: "#1f2937",
      marginBottom: "8px",
      textAlign: "center",
    },
    buttonGroup: {
      display: "flex",
      justifyContent: "flex-end",
      gap: "10px",
      marginTop: "25px",
    },
    button: {
      padding: "10px 20px",
      fontSize: "16px",
      fontWeight: "500",
      borderRadius: "6px",
      border: "none",
      cursor: "pointer",
      transition: "background-color 0.2s ease, box-shadow 0.2s ease",
    },
    saveButton: {
      backgroundColor: "#4f46e5",
      color: "white",
    },
    cancelButton: {
      backgroundColor: "#e5e7eb",
      color: "#374151",
    },
  };

  const handleCheckboxChange = useCallback((jobId) => {
    setTempSelection((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId]
    );
  }, []);

  return (
    <div style={formStyles.container}>
      <h4 style={formStyles.title}>직업 선택 (다중 선택 가능)</h4>
      <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "15px" }}>
        '나의 할일'에 표시할 직업을 선택하세요.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {activeJobs.map((job) => (
          <label
            key={job.id}
            style={{
              padding: "12px 15px",
              border: `2px solid ${
                tempSelection.includes(job.id) ? "#4f46e5" : "#d1d5db"
              }`,
              borderRadius: "8px",
              cursor: "pointer",
              backgroundColor: tempSelection.includes(job.id)
                ? "#eef2ff"
                : "#ffffff",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <input
              type="checkbox"
              checked={tempSelection.includes(job.id)}
              onChange={() => handleCheckboxChange(job.id)}
              style={{ width: "16px", height: "16px", cursor: "pointer" }}
            />
            <span
              style={{
                fontWeight: "500",
                color: tempSelection.includes(job.id) ? "#4338ca" : "#374151",
              }}
            >
              {job.title}
            </span>
          </label>
        ))}
        {activeJobs.length === 0 && (
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            선택 가능한 직업이 없습니다.
          </p>
        )}
      </div>
      <div style={formStyles.buttonGroup}>
        <button
          onClick={onCancel}
          style={{ ...formStyles.button, ...formStyles.cancelButton }}
        >
          취소
        </button>
        <button
          onClick={() => onConfirmSelection(tempSelection)}
          style={{ ...formStyles.button, ...formStyles.saveButton }}
        >
          선택 완료
        </button>
      </div>
    </div>
  );
}

function Dashboard({ adminTabMode }) {
  const navigate = useNavigate();
  const {
    user,
    userDoc,
    setUserDoc,
    loading: authLoading,
    updateUser,
    isAdmin,
    isSuperAdmin,
  } = useAuth();

  // Refs for cleanup
  const realtimeManager = useRef(new RealtimeManager());
  const lastFetchTime = useRef(0);
  const fetchPromise = useRef(null);

  // State management
  const [appLoading, setAppLoading] = useState(true);
  const [viewMode, setViewMode] = useState("list");
  const [showAdminSettingsModal, setShowAdminSettingsModal] = useState(false);
  const [adminSelectedMenu, setAdminSelectedMenu] = useState("generalSettings");

  const [jobs, setJobs] = useState([]);
  const [commonTasks, setCommonTasks] = useState([]);

  const [editingJob, setEditingJob] = useState(null);
  const [adminNewJobTitle, setAdminNewJobTitle] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [currentJobIdForTask, setCurrentJobIdForTask] = useState(null);
  const [isJobTaskForForm, setIsJobTaskForForm] = useState(false);
  const [showAddTaskForm, setShowAddTaskForm] = useState(false);
  const [adminNewTaskName, setAdminNewTaskName] = useState("");
  const [adminNewTaskReward, setAdminNewTaskReward] = useState("");
  const [adminNewTaskMaxClicks, setAdminNewTaskMaxClicks] = useState("5");

  const [isHandlingTask, setIsHandlingTask] = useState(false);

  const [classCouponGoal, setClassCouponGoal] = useState(1000);
  const [couponValue, setCouponValue] = useState(1000);
  const [adminCouponValueInput, setAdminCouponValueInput] = useState(
    String(1000)
  );
  const [adminGoalAmountInput, setAdminGoalAmountInput] = useState(
    String(1000)
  );
  const [classCodes, setClassCodes] = useState([]);

  // adminTabMode가 있으면 모달 열기
  useEffect(() => {
    if (adminTabMode && isAdmin?.()) {
      setAdminSelectedMenu(adminTabMode);
      setShowAdminSettingsModal(true);
    }
  }, [adminTabMode, isAdmin]);

  // Memoized values
  const currentGoalId = useMemo(() => {
    return userDoc?.classCode && isAdmin?.()
      ? `${userDoc.classCode}_goal`
      : null;
  }, [userDoc?.classCode, isAdmin]);

  const currentSelectedJobIdsFromUserDoc = useMemo(() => {
    return userDoc && Array.isArray(userDoc.selectedJobIds)
      ? userDoc.selectedJobIds
      : [];
  }, [userDoc]);

  const jobsToShow = useMemo(() => {
    return Array.isArray(jobs)
      ? jobs.filter(
          (job) =>
            currentSelectedJobIdsFromUserDoc.includes(job.id) &&
            job.active !== false
        )
      : [];
  }, [jobs, currentSelectedJobIdsFromUserDoc]);

  const commonTasksWithUserProgress = useMemo(() => {
    if (!commonTasks || !userDoc) {
      return [];
    }
    const userCompletedTasks = userDoc.completedTasks || {};
    return commonTasks.map(task => ({
      ...task,
      clicks: userCompletedTasks[task.id] || 0,
    }));
  }, [commonTasks, userDoc]);

  // Utility function for generating IDs
  const generateId = useCallback(() => {
    try {
      return doc(firestoreCollection(db, "temp")).id;
    } catch (error) {
      console.error("Error generating ID:", error);
      return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }
  }, []);

  // 🔥 [최적화] Polling 방식으로 전환 (30초마다)
  const setupPolling = useCallback(async (classCode) => {
    if (!classCode) return;

    const pollData = async () => {
      try {
        // Jobs 조회 (인덱스 없이 작동하도록 orderBy 제거)
        const jobsQuery = query(
          firestoreCollection(db, "jobs"),
          where("classCode", "==", classCode),
          limit(50)
        );

        const jobsSnap = await getDocs(jobsQuery);
        const loadedJobs = jobsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          tasks: (d.data().tasks || []).map((task) => ({
            ...task,
            reward: task.reward || 0,
            clicks: task.clicks || 0,
            maxClicks: task.maxClicks || 5,
          })),
          active: d.data().active !== false,
        }))
        // 클라이언트 측에서 정렬 (updatedAt이 있는 경우)
        .sort((a, b) => {
          const timeA = a.updatedAt?.toMillis?.() || 0;
          const timeB = b.updatedAt?.toMillis?.() || 0;
          return timeB - timeA;
        });

        setJobs(loadedJobs);
        dataCache.set(`jobs_${classCode}`, loadedJobs, 10 * 60 * 1000);

        // Common Tasks 조회 (인덱스 없이 작동하도록 orderBy 제거)
        const tasksQuery = query(
          firestoreCollection(db, "commonTasks"),
          where("classCode", "==", classCode),
          limit(50)
        );

        const tasksSnap = await getDocs(tasksQuery);
        const loadedCommonTasks = tasksSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          reward: d.data().reward || 0,
          clicks: d.data().clicks || 0,
          maxClicks: d.data().maxClicks || 5,
        }))
        // 클라이언트 측에서 정렬 (updatedAt이 있는 경우)
        .sort((a, b) => {
          const timeA = a.updatedAt?.toMillis?.() || 0;
          const timeB = b.updatedAt?.toMillis?.() || 0;
          return timeB - timeA;
        });

        setCommonTasks(loadedCommonTasks);
        dataCache.set(`commonTasks_${classCode}`, loadedCommonTasks, 10 * 60 * 1000);
      } catch (error) {
        console.error("Polling 에러:", error);
      }
    };

    // 즉시 한 번 실행
    await pollData();

    // 5분마다 실행 (30초에서 5분으로 변경 - Firebase 읽기 최적화)
    const intervalId = setInterval(pollData, 300000);

    // Cleanup 함수 저장
    realtimeManager.current.addListener('polling', () => clearInterval(intervalId));
  }, []);

  // 캐시된 데이터 로드 함수
  const loadCachedData = useCallback(async (classCode) => {
    const jobsCache = dataCache.get(`jobs_${classCode}`);
    const tasksCache = dataCache.get(`commonTasks_${classCode}`);
    const settingsCache = dataCache.get('mainSettings');

    if (jobsCache) {
      setJobs(jobsCache);
    }
    if (tasksCache) {
      setCommonTasks(tasksCache);
    }
    if (settingsCache) {
      setCouponValue(settingsCache.couponValue || 1000);
      setAdminCouponValueInput(String(settingsCache.couponValue || 1000));
    }

    return {
      hasJobsCache: !!jobsCache,
      hasTasksCache: !!tasksCache,
      hasSettingsCache: !!settingsCache
    };
  }, []);

  // 최적화된 데이터 로드 함수
  const loadTasksData = useCallback(async (forceRefresh = false) => {
    if (!userDoc?.classCode) {
      setAppLoading(false);
      return;
    }

    const now = Date.now();
    const classCode = userDoc.classCode;

    // 중복 요청 방지
    if (fetchPromise.current && !forceRefresh) {
      return fetchPromise.current;
    }

    // 최소 요청 간격 보장 (30초)
    if (!forceRefresh && now - lastFetchTime.current < 300000) {
      setAppLoading(false);
      return;
    }

    // 초기 로딩 표시
    setAppLoading(true);

    const fetchData = async () => {
      try {
        // 1단계: 캐시된 데이터 먼저 로드하여 즉시 UI 표시
        const cacheStatus = await loadCachedData(classCode);

        // 캐시 데이터가 있으면 즉시 로딩 상태 해제하여 빠른 UI 표시
        if (cacheStatus.hasJobsCache && cacheStatus.hasTasksCache) {
          setAppLoading(false);
        }

        // 2단계: 백그라운드에서 실시간 리스너 설정 (한 번만)
        if (!realtimeManager.current.listeners.has('jobs')) {
          // 리스너 설정을 다음 틱으로 지연하여 초기 렌더링 차단 방지
          setTimeout(() => setupPolling(classCode), 0);
        }

        // 3단계: 캐시되지 않은 정적 데이터만 가져오기
        const promises = [];

        if (!cacheStatus.hasSettingsCache || forceRefresh) {
          promises.push(
            getDoc(doc(db, "settings", "mainSettings")).then(snap => ({
              type: 'settings',
              data: snap.exists() ? snap.data() : null
            }))
          );
        }

        if (currentGoalId && (!dataCache.get(`goal_${currentGoalId}`) || forceRefresh)) {
          promises.push(
            getDoc(doc(db, "goals", currentGoalId)).then(snap => ({
              type: 'goal',
              data: snap.exists() ? snap.data() : null
            }))
          );
        }

        if (isSuperAdmin() && (!dataCache.get('classCodes') || forceRefresh)) {
          promises.push(
            getDoc(doc(db, "settings", "classCodes")).then(snap => ({
              type: 'classCodes',
              data: snap.exists() ? snap.data() : null
            }))
          );
        }

        // 필요한 데이터만 병렬로 가져오기
        if (promises.length > 0) {
          const results = await Promise.all(promises);

          results.forEach(result => {
            switch (result.type) {
              case 'settings':
                if (result.data) {
                  const newCouponValue = result.data.couponValue || 1000;
                  setCouponValue(newCouponValue);
                  setAdminCouponValueInput(String(newCouponValue));
                  dataCache.set('mainSettings', result.data, 30 * 60 * 1000); // 30분
                }
                break;
              case 'goal':
                if (result.data && result.data.classCode === classCode) {
                  const targetAmount = result.data.targetAmount || 1000;
                  setClassCouponGoal(targetAmount);
                  setAdminGoalAmountInput(String(targetAmount));
                  dataCache.set(`goal_${currentGoalId}`, result.data, 15 * 60 * 1000); // 15분
                }
                break;
              case 'classCodes':
                if (result.data) {
                  setClassCodes(result.data.validCodes || []);
                  dataCache.set('classCodes', result.data, 60 * 60 * 1000); // 1시간
                }
                break;
            }
          });
        }

        lastFetchTime.current = now;
      } catch (error) {
      } finally {
        setAppLoading(false);
        fetchPromise.current = null;
      }
    };

    fetchPromise.current = fetchData();
    return fetchPromise.current;
  }, [userDoc?.classCode, currentGoalId, isSuperAdmin, setupPolling, loadCachedData]);

  // Effect for data loading
  useEffect(() => {
    if (authLoading) {
      setAppLoading(true);
      return;
    }

    if (!user) {
      setAppLoading(false);
      setJobs([]);
      setCommonTasks([]);
      // 리스너 정리
      realtimeManager.current.removeAllListeners();
      return;
    }

    if (userDoc?.id && userDoc?.classCode) {
      loadTasksData();
    } else {
      setAppLoading(false);
    }

    // 컴포넌트 언마운트 시 리스너 정리
    return () => {
      realtimeManager.current.removeAllListeners();
    };
  }, [authLoading, user, userDoc?.id, userDoc?.classCode, loadTasksData]);

  // Job management handlers
  const handleSaveJob = useCallback(async () => {
    if (!db || !userDoc?.classCode) {
      alert("데이터베이스 연결 오류 또는 학급 코드 없음.");
      return;
    }

    const title = adminNewJobTitle.trim();
    if (!title) {
      alert("직업 이름을 입력해주세요.");
      return;
    }

    setAppLoading(true);
    try {
      if (editingJob) {
        const jobRef = doc(db, "jobs", editingJob.id);
        // 배치 매니저 사용
        batchManager.addWrite({
          type: 'update',
          ref: jobRef,
          data: { title, updatedAt: serverTimestamp() }
        });
        
        alert(`직업이 수정되었습니다.`);
        setAdminNewJobTitle("");
        setEditingJob(null);
        setShowAdminSettingsModal(false);
      } else {
        const newJobId = generateId();
        const jobRef = doc(db, "jobs", newJobId);
        batchManager.addWrite({
          type: 'set',
          ref: jobRef,
          data: {
            title,
            active: true,
            tasks: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            classCode: userDoc.classCode,
          }
        });
        
        alert(`직업이 추가되었습니다.`);
        setAdminNewJobTitle("");
      }

      // 캐시 무효화
      dataCache.invalidate(`jobs_${userDoc.classCode}`);
    } catch (error) {
      console.error("handleSaveJob 오류:", error);
      alert("직업 저장 중 오류 발생");
    } finally {
      setAppLoading(false);
    }
  }, [adminNewJobTitle, editingJob, generateId, userDoc]);

  const handleDeleteJob = useCallback(
    async (jobIdToDelete) => {
      if (!db) {
        alert("데이터베이스 연결 오류.");
        return;
      }

      if (
        !window.confirm(
          "정말로 이 직업을 삭제하시겠습니까? 관련된 할일도 모두 삭제됩니다."
        )
      ) {
        return;
      }

      setAppLoading(true);
      try {
        // 배치 매니저 사용
        const jobRef = doc(db, "jobs", jobIdToDelete);
        batchManager.addWrite({
          type: 'delete',
          ref: jobRef,
          data: null
        });

        if (user && userDoc?.selectedJobIds?.includes(jobIdToDelete)) {
          const updatedSelectedIds = userDoc.selectedJobIds.filter(
            (id) => id !== jobIdToDelete
          );
          await updateUser({ selectedJobIds: updatedSelectedIds });
        }

        if (editingJob?.id === jobIdToDelete) {
          setAdminNewJobTitle("");
          setEditingJob(null);
        }

        setShowAdminSettingsModal(false);
        alert("직업이 삭제되었습니다.");
        
        // 캐시 무효화
        dataCache.invalidate(`jobs_${userDoc.classCode}`);
      } catch (error) {
        console.error("handleDeleteJob 오류:", error);
        alert("직업 삭제 중 오류 발생");
      } finally {
        setAppLoading(false);
      }
    },
    [user, userDoc, editingJob, updateUser]
  );

  const handleEditJob = useCallback((jobToEdit) => {
    if (jobToEdit) {
      setEditingJob(jobToEdit);
      setAdminNewJobTitle(jobToEdit.title);
      setAdminSelectedMenu("jobSettings");
      setShowAdminSettingsModal(true);
    } else {
      alert("해당 직업을 찾을 수 없습니다.");
    }
  }, []);

  // Task management handlers
  const handleAddTaskClick = useCallback((jobId = null, isJobTask = false) => {
    setIsJobTaskForForm(isJobTask);
    setCurrentJobIdForTask(jobId);
    setAdminNewTaskName("");
    setAdminNewTaskReward("");
    setAdminNewTaskMaxClicks("5");
    setEditingTask(null);
    setAdminSelectedMenu("taskManagement");
    setShowAddTaskForm(true);
    setShowAdminSettingsModal(true);
  }, []);

  const handleEditTask = useCallback((taskToEdit, jobId = null) => {
    if (taskToEdit) {
      setEditingTask(taskToEdit);
      setAdminNewTaskName(taskToEdit.name);
      setAdminNewTaskReward(String(taskToEdit.reward || 0));
      setAdminNewTaskMaxClicks(String(taskToEdit.maxClicks || 5));
      setIsJobTaskForForm(!!jobId);
      setCurrentJobIdForTask(jobId);
      setAdminSelectedMenu("taskManagement");
      setShowAddTaskForm(true);
      setShowAdminSettingsModal(true);
    } else {
      alert("수정할 할일을 찾을 수 없습니다.");
    }
  }, []);

  const handleSaveTask = useCallback(async () => {
    if (!db || !userDoc?.classCode) {
      alert("데이터베이스 연결 오류 또는 학급 코드 없음.");
      return;
    }

    const name = adminNewTaskName.trim();
    const reward = parseInt(adminNewTaskReward, 10);
    const maxClicks = parseInt(adminNewTaskMaxClicks, 10);

    if (
      !name ||
      isNaN(reward) ||
      reward < 0 ||
      isNaN(maxClicks) ||
      maxClicks <= 0
    ) {
      alert(
        "입력값을 확인해주세요. (이름, 보상: 0 이상 숫자, 최대 클릭: 1 이상 숫자)"
      );
      return;
    }

    setAppLoading(true);
    const taskData = {
      name,
      reward,
      maxClicks,
      clicks: editingTask?.clicks || 0,
    };

    try {
      if (editingTask) {
        const taskId = editingTask.id;
        if (isJobTaskForForm && currentJobIdForTask) {
          const jobRef = doc(db, "jobs", currentJobIdForTask);
          const jobSnap = await getDoc(jobRef);
          if (
            !jobSnap.exists() ||
            jobSnap.data().classCode !== userDoc.classCode
          ) {
            throw new Error("직업 문서를 찾을 수 없거나 권한이 없습니다.");
          }
          const jobTasks = jobSnap.data().tasks || [];
          const taskIndex = jobTasks.findIndex((t) => t.id === taskId);
          if (taskIndex === -1) {
            throw new Error("직업 내 할일을 찾을 수 없습니다.");
          }
          const updatedTasks = [...jobTasks];
          updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], ...taskData };
          
          // 배치 매니저 사용
          batchManager.addWrite({
            type: 'update',
            ref: jobRef,
            data: {
              tasks: updatedTasks,
              updatedAt: serverTimestamp(),
            }
          });
        } else {
          const taskRef = doc(db, "commonTasks", taskId);
          batchManager.addWrite({
            type: 'update',
            ref: taskRef,
            data: {
              ...taskData,
              updatedAt: serverTimestamp(),
            }
          });
        }
        setShowAddTaskForm(false);
        setEditingTask(null);
        setShowAdminSettingsModal(false);
        alert(`할일이 수정되었습니다.`);
      } else {
        const newTaskId = generateId();
        const newTaskDataWithId = { ...taskData, id: newTaskId, clicks: 0 };
        if (isJobTaskForForm && currentJobIdForTask) {
          const jobRef = doc(db, "jobs", currentJobIdForTask);
          batchManager.addWrite({
            type: 'update',
            ref: jobRef,
            data: {
              tasks: arrayUnion(newTaskDataWithId),
              updatedAt: serverTimestamp(),
            }
          });
        } else {
          const newTaskRef = doc(db, "commonTasks", newTaskId);
          batchManager.addWrite({
            type: 'set',
            ref: newTaskRef,
            data: {
              ...newTaskDataWithId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              classCode: userDoc.classCode,
            }
          });
        }
        setAdminNewTaskName("");
        setAdminNewTaskReward("");
        setAdminNewTaskMaxClicks("5");
        alert(`할일이 추가되었습니다.`);
      }

      // 캐시 무효화
      if (isJobTaskForForm) {
        dataCache.invalidate(`jobs_${userDoc.classCode}`);
      } else {
        dataCache.invalidate(`commonTasks_${userDoc.classCode}`);
      }
    } catch (error) {
      console.error("handleSaveTask 오류:", error);
      alert("할일 저장 중 오류 발생: " + error.message);
    } finally {
      setAppLoading(false);
    }
  }, [
    adminNewTaskName,
    adminNewTaskReward,
    adminNewTaskMaxClicks,
    editingTask,
    isJobTaskForForm,
    currentJobIdForTask,
    generateId,
    userDoc,
  ]);

  const handleDeleteTask = useCallback(
    async (taskIdToDelete, jobId = null) => {
      if (!db) {
        alert("데이터베이스 연결 오류.");
        return;
      }

      if (!window.confirm("정말로 이 할일을 삭제하시겠습니까?")) {
        return;
      }

      setAppLoading(true);
      try {
        if (jobId) {
          const jobRef = doc(db, "jobs", jobId);
          const jobSnap = await getDoc(jobRef);
          if (!jobSnap.exists()) {
            throw new Error("직업 문서를 찾을 수 없습니다.");
          }
          const tasks = jobSnap.data().tasks || [];
          const updatedTasks = tasks.filter((t) => t.id !== taskIdToDelete);
          
          // 배치 매니저 사용
          batchManager.addWrite({
            type: 'update',
            ref: jobRef,
            data: {
              tasks: updatedTasks,
              updatedAt: serverTimestamp(),
            }
          });
        } else {
          const taskRef = doc(db, "commonTasks", taskIdToDelete);
          batchManager.addWrite({
            type: 'delete',
            ref: taskRef,
            data: null
          });
        }

        if (editingTask?.id === taskIdToDelete) {
          setShowAddTaskForm(false);
          setEditingTask(null);
        }

        setShowAdminSettingsModal(false);
        alert("할일이 삭제되었습니다.");
        
        // 캐시 무효화
        if (jobId) {
          dataCache.invalidate(`jobs_${userDoc.classCode}`);
        } else {
          dataCache.invalidate(`commonTasks_${userDoc.classCode}`);
        }
      } catch (error) {
        console.error("handleDeleteTask 오류:", error);
        alert("할일 삭제 중 오류 발생: " + error.message);
      } finally {
        setAppLoading(false);
      }
    },
    [editingTask, userDoc]
  );

  // Job selection handlers
  const handleSelectJobClick = useCallback(() => {
    setViewMode("selectJob");
  }, []);

  const handleConfirmJobSelection = useCallback(
    async (newlySelectedJobIds) => {
      if (!user?.uid) {
        alert("사용자 정보 오류.");
        return;
      }

      const idsToSave = Array.isArray(newlySelectedJobIds)
        ? newlySelectedJobIds
        : [];
      setAppLoading(true);

      try {
        const success = await updateUser({ selectedJobIds: idsToSave });
        if (success) {
          setUserDoc({ ...userDoc, selectedJobIds: idsToSave }); // Optimistic update
          setViewMode("list");
          alert("선택한 직업이 저장되었습니다.");
        } else {
          alert("선택한 직업 저장 중 오류 발생.");
        }
      } catch (error) {
        console.error("handleConfirmJobSelection 오류:", error);
        alert("선택 직업 저장 중 예상치 못한 오류 발생.");
      } finally {
        setAppLoading(false);
      }
    },
    [user, updateUser]
  );

  const handleCancelForm = useCallback(() => {
    setViewMode("list");
  }, []);

  // Task completion handler - 디바운싱 및 낙관적 업데이트 적용
  const handleTaskEarnCoupon = useCallback(
    async (taskId, jobId = null, isJobTask = false) => {
      if (!db || !userDoc?.id || isHandlingTask) {
        alert("데이터베이스/사용자 정보 오류 또는 처리 중입니다.");
        return;
      }

      setIsHandlingTask(true);

      try {
        let taskReward = 0;
        let currentTaskData;

        if (isJobTask && jobId) {
          const job = jobs.find((j) => j.id === jobId);
          if (!job) throw new Error("직업을 찾을 수 없습니다.");

          currentTaskData = job.tasks.find((t) => t.id === taskId);
          if (!currentTaskData)
            throw new Error("직업 할일을 찾을 수 없습니다.");

          if (currentTaskData.clicks >= currentTaskData.maxClicks) {
            alert(`${currentTaskData.name} 할일은 오늘 이미 최대 완료했습니다.`);
            setIsHandlingTask(false);
            return;
          }

          taskReward = currentTaskData.reward;

          // 낙관적 업데이트
          setJobs(prevJobs =>
            prevJobs.map(j =>
              j.id === jobId
                ? {
                    ...j,
                    tasks: j.tasks.map(t =>
                      t.id === taskId
                        ? { ...t, clicks: t.clicks + 1 }
                        : t
                    )
                  }
                : j
            )
          );

          // 즉시 Firestore 업데이트 (배치 사용 안 함 - 학생 권한 문제 해결)
          const jobRef = doc(db, "jobs", jobId);
          const jobSnap = await getDoc(jobRef);

          if (!jobSnap.exists())
            throw new Error("직업 문서(DB)를 찾을 수 없습니다.");

          const jobDbTasks = jobSnap.data().tasks || [];
          const taskIndex = jobDbTasks.findIndex((t) => t.id === taskId);

          if (taskIndex === -1)
            throw new Error("DB에서 해당 직업 할일을 찾을 수 없습니다.");

          const updatedDbTasks = [...jobDbTasks];
          updatedDbTasks[taskIndex].clicks =
            (updatedDbTasks[taskIndex].clicks || 0) + 1;

          // 즉시 업데이트
          await updateDoc(jobRef, {
            tasks: updatedDbTasks,
            updatedAt: serverTimestamp(),
          });
        } else {
          // 공통 할일 로직 - 사용자 문서에 completedTasks 저장
          currentTaskData = commonTasks.find((t) => t.id === taskId);
          if (!currentTaskData)
            throw new Error("공통 할일을 찾을 수 없습니다.");

          const userCompletedTasks = userDoc.completedTasks || {};
          const currentClicks = userCompletedTasks[taskId] || 0;

          if (currentClicks >= currentTaskData.maxClicks) {
            alert(`${currentTaskData.name} 할일은 오늘 이미 최대 완료했습니다.`);
            setIsHandlingTask(false);
            return;
          }

          taskReward = currentTaskData.reward;

          // 낙관적 업데이트 (userDoc 상태 업데이트)
          const updatedCompletedTasks = {
            ...userCompletedTasks,
            [taskId]: currentClicks + 1,
          };
          setUserDoc(prevUserDoc => ({
            ...prevUserDoc,
            completedTasks: updatedCompletedTasks,
          }));

          // Firestore 즉시 업데이트 (배치 사용 안 함)
          const userRef = doc(db, "users", userDoc.id);
          await updateDoc(userRef, {
            [`completedTasks.${taskId}`]: increment(1),
          });
        }

        if (taskReward > 0) {
          const couponUpdateSuccess = await updateUser({
            coupons: increment(taskReward),
          });

          if (!couponUpdateSuccess) {
            console.error("쿠폰 지급 실패");
            alert("쿠폰 지급에 실패했습니다. 관리자에게 문의하세요.");
            throw new Error("쿠폰 지급 실패");
          }

          // 🔥 쿠폰 획득 활동 로그 기록
          try {
            const activityLogRef = doc(firestoreCollection(db, "activity_logs"));
            await setDoc(activityLogRef, {
              userId: userDoc.id,
              userName: userDoc.name || userDoc.nickname || "사용자",
              type: "쿠폰 획득",
              description: `'${currentTaskData.name}' 할일 완료로 쿠폰 ${taskReward}개를 획득했습니다.`,
              metadata: {
                taskName: currentTaskData.name,
                reward: taskReward,
                taskId: taskId,
                isJobTask: isJobTask,
                jobId: jobId || null
              },
              timestamp: serverTimestamp(),
              classCode: userDoc.classCode
            });
            console.log(`[Dashboard] 쿠폰 획득 활동 로그 기록 완료: ${taskReward}개`);
          } catch (logError) {
            console.error("[Dashboard] 활동 로그 기록 실패:", logError);
            // 로그 실패는 전체 작업을 실패시키지 않음
          }
        }

        alert(
          `'${currentTaskData.name}' 완료! ${
            taskReward > 0 ? `+${taskReward} 쿠폰!` : ""
          }`
        );
      } catch (error) {
        console.error("handleTaskEarnCoupon 오류:", error);
        alert(`오류 발생: ${error.message}`);
        
        // 실패 시 낙관적 업데이트 롤백
        if (isJobTask && jobId) {
          setJobs(prevJobs => 
            prevJobs.map(j => 
              j.id === jobId 
                ? {
                    ...j,
                    tasks: j.tasks.map(t => 
                      t.id === taskId 
                        ? { ...t, clicks: Math.max(0, t.clicks - 1) }
                        : t
                    )
                  }
                : j
            )
          );
        } else {
          // 공통 할일 롤백 (userDoc)
          const userCompletedTasks = userDoc.completedTasks || {};
          const currentClicks = userCompletedTasks[taskId] || 0;
          if (currentClicks > 0) {
            const updatedCompletedTasks = {
              ...userCompletedTasks,
              [taskId]: currentClicks - 1,
            };
            setUserDoc(prevUserDoc => ({
              ...prevUserDoc,
              completedTasks: updatedCompletedTasks,
            }));
          }
        }
      } finally {
        setIsHandlingTask(false);
      }
    },
    [userDoc, isHandlingTask, jobs, commonTasks, updateUser, setUserDoc]
  );

  // Admin settings handlers
  const handleOpenAdminSettings = useCallback((tabName = "generalSettings") => {
    setAdminGoalAmountInput(String(classCouponGoal));
    setAdminCouponValueInput(String(couponValue));
    setAdminSelectedMenu(tabName);
    setShowAdminSettingsModal(true);
  }, [classCouponGoal, couponValue]);

  const handleSaveAdminSettings = useCallback(async () => {
    console.log("--- [DEBUG] EXECUTING handleSaveAdminSettings with LATEST code ---");
    if (!db) {
      alert("데이터베이스 연결 오류.");
      return;
    }

    const newGoal = parseInt(adminGoalAmountInput, 10);
    const newValue = parseInt(adminCouponValueInput, 10);

    if (isNaN(newGoal) || newGoal <= 0 || isNaN(newValue) || newValue <= 0) {
      alert("올바른 목표 금액과 쿠폰 가치를 입력하세요 (0보다 큰 숫자).");
      return;
    }

    setAppLoading(true);
    try {
      const settingsRef = doc(db, "settings", "mainSettings");
      const settingsSnap = await getDoc(settingsRef);
      
      if (
        !settingsSnap.exists() ||
        settingsSnap.data().couponValue !== newValue
      ) {
        batchManager.addWrite({
          type: 'set',
          ref: settingsRef,
          data: { couponValue: newValue, updatedAt: serverTimestamp() }
        });
      }

      if (currentGoalId && isAdmin?.()) {
        try {
          const goalRef = doc(db, "goals", currentGoalId);
          // setDoc with merge: true ensures we don't overwrite existing fields like progress.
          // This safely updates the target amount or creates the document if it doesn't exist.
          await setDoc(goalRef, {
            targetAmount: newGoal,
            classCode: userDoc.classCode,
            updatedAt: serverTimestamp(),
          }, { merge: true });

        } catch (goalError) {
          console.warn(
            "목표 설정 권한이 없어 목표 금액 설정을 건너뜀:",
            goalError.code
          );
        }
      }

      setCouponValue(newValue);
      if (currentGoalId && isAdmin?.()) {
        setClassCouponGoal(newGoal);
      }
      setShowAdminSettingsModal(false);
      alert("관리자 설정이 저장되었습니다.");
      
      // 캐시 무효화
      dataCache.invalidate('mainSettings');
      if (currentGoalId) {
        dataCache.invalidate(`goal_${currentGoalId}`);
      }
    } catch (error) {
      console.error("관리자 설정 저장 오류:", error);
      alert("관리자 설정 저장 중 오류: " + error.message);
    } finally {
      setAppLoading(false);
    }
  }, [
    adminGoalAmountInput,
    adminCouponValueInput,
    currentGoalId,
    userDoc,
    isAdmin,
  ]);

  // Class code management - 캐시 및 배치 처리 적용
  const loadClassCodes = useCallback(async () => {
    if (!db || !isAdmin?.()) return;

    // 캐시 확인
    const cached = dataCache.get('classCodes');
    if (cached) {
      setClassCodes(cached.validCodes || []);
      return;
    }

    try {
      const codeRef = doc(db, "settings", "classCodes");
      const codeDoc = await getDoc(codeRef);

      if (codeDoc.exists()) {
        const codes = Array.isArray(codeDoc.data().validCodes)
          ? codeDoc.data().validCodes
          : [];
        setClassCodes(codes);
        dataCache.set('classCodes', codeDoc.data(), 60 * 60 * 1000); // 1시간
      } else {
        batchManager.addWrite({
          type: 'set',
          ref: codeRef,
          data: {
            validCodes: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        });
        setClassCodes([]);
      }
    } catch (error) {
      console.error("학급 코드 로드 오류:", error);
      setClassCodes([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin?.()) {
      loadClassCodes();
    }
  }, [isAdmin, loadClassCodes]);

  const handleAddClassCode = useCallback(
    async (codeToAdd) => {
      if (!db) return false;

      const trimmedCode = codeToAdd.trim();
      if (!trimmedCode) {
        alert("학급 코드를 입력해주세요.");
        return false;
      }

      if (classCodes.includes(trimmedCode)) {
        alert("이미 등록된 학급 코드입니다.");
        return false;
      }

      setAppLoading(true);
      try {
        const codeRef = doc(db, "settings", "classCodes");
        const codeSnap = await getDoc(codeRef);
        const currentValidCodes = codeSnap.exists()
          ? codeSnap.data().validCodes || []
          : [];

        batchManager.addWrite({
          type: 'update',
          ref: codeRef,
          data: {
            validCodes: [...currentValidCodes, trimmedCode],
            updatedAt: serverTimestamp(),
          }
        });

        alert("학급 코드가 추가되었습니다.");
        
        // 낙관적 업데이트
        setClassCodes(prev => [...prev, trimmedCode]);
        
        // 캐시 무효화
        dataCache.invalidate('classCodes');
        
        return true;
      } catch (error) {
        console.error("학급 코드 추가 오류:", error);
        alert("학급 코드 추가 중 오류 발생");
        return false;
      } finally {
        setAppLoading(false);
      }
    },
    [classCodes]
  );

  const handleRemoveClassCode = useCallback(
    async (codeToRemove) => {
      if (!db) return false;

      if (!window.confirm(`'${codeToRemove}' 코드를 삭제하시겠습니까?`)) {
        return false;
      }

      setAppLoading(true);
      try {
        const codeRef = doc(db, "settings", "classCodes");
        const codeSnap = await getDoc(codeRef);

        if (!codeSnap.exists()) {
          throw new Error("학급 코드 문서를 찾을 수 없습니다.");
        }

        const currentValidCodes = codeSnap.data().validCodes || [];
        const updatedCodes = currentValidCodes.filter(
          (code) => code !== codeToRemove
        );

        batchManager.addWrite({
          type: 'update',
          ref: codeRef,
          data: {
            validCodes: updatedCodes,
            updatedAt: serverTimestamp(),
          }
        });

        alert("학급 코드가 삭제되었습니다.");
        
        // 낙관적 업데이트
        setClassCodes(prev => prev.filter(code => code !== codeToRemove));
        
        // 캐시 무효화
        dataCache.invalidate('classCodes');
        
        return true;
      } catch (error) {
        console.error("학급 코드 삭제 오류:", error);
        alert("학급 코드 삭제 중 오류 발생: " + error.message);
        return false;
      } finally {
        setAppLoading(false);
      }
    },
    []
  );

  // 강제 새로고침 핸들러
  const handleForceRefresh = useCallback(() => {
    // 캐시 클리어
    dataCache.clear();
    
    // 리스너 재설정
    realtimeManager.current.removeAllListeners();
    if (userDoc?.classCode) {
      setupPolling(userDoc.classCode);
    }
    
    // 데이터 강제 로드
    loadTasksData(true);
  }, [loadTasksData, userDoc?.classCode, setupPolling]);

  // 🔄 수동 할일 리셋 핸들러 (새로 추가)
  const handleManualTaskReset = useCallback(async () => {
    if (!userDoc?.classCode) {
      alert("학급 코드 정보가 없습니다.");
      return;
    }

    if (!window.confirm(`'${userDoc.classCode}' 클래스의 모든 할일을 리셋하시겠습니까?\n\n이 작업은 클래스의 모든 사용자에게 적용되며 되돌릴 수 없습니다.`)) {
      return;
    }

    setAppLoading(true);
    try {
      const result = await manualResetClassTasks({ classCode: userDoc.classCode });
      
      if (result.data.success) {
        alert(`성공적으로 리셋되었습니다!\n\n${result.data.message}`);
        // 데이터 새로고침
        handleForceRefresh();
      } else {
        throw new Error(result.data.message || "알 수 없는 오류");
      }
    } catch (error) {
      console.error("할일 리셋 실패:", error);
      alert(`할일 리셋 실패: ${error.message}`);
    } finally {
      setAppLoading(false);
    }
  }, [userDoc?.classCode, handleForceRefresh]);

  // Loading and error states
  if (authLoading || appLoading) {
    return <div className="dashboard-loading">정보를 불러오는 중...</div>;
  }

  if (!user) {
    return <div className="dashboard-loading">로그인이 필요합니다...</div>;
  }

  if (!userDoc?.id) {
    return (
      <div className="dashboard-loading">
        사용자 정보를 완전히 불러오지 못했습니다. 새로고침하거나 다시
        로그인해주세요.
      </div>
    );
  }

  if (!userDoc.classCode) {
    return (
      <div className="dashboard-loading">
        학급 코드 정보가 없습니다. 관리자에게 문의하여 학급 코드를 할당받으세요.
      </div>
    );
  }

  const userId = user?.uid;
  const userNickname =
    userDoc?.nickname || userDoc?.name || user?.displayName || "사용자";

  return (
    <div className="dashboard-container">
      <div className="dashboard-content-area">
        <div style={{ marginBottom: "15px" }}>
          <h2 className="dashboard-page-title">
            <span className="welcome-message">
              오늘의 할일 ✨ ({userNickname}님)
            </span>
            {isAdmin?.() && viewMode === "list" && !showAdminSettingsModal && !adminTabMode && (
              <div className="admin-buttons-group">
                <button
                  onClick={() => handleOpenAdminSettings("generalSettings")}
                  className="admin-settings-button"
                >
                  관리자 기능
                </button>
                <button
                  onClick={handleForceRefresh}
                  className="admin-settings-button"
                  style={{ backgroundColor: "#28a745" }}
                >
                  새로고침
                </button>
                {/* 🔄 할일 리셋 버튼 (관리자 전용) */}
                <button
                  onClick={handleManualTaskReset}
                  className="admin-settings-button"
                  style={{ backgroundColor: "#dc3545", color: "white" }}
                  title="이 클래스의 모든 사용자 할일을 리셋합니다"
                >
                  할일 리셋
                </button>
              </div>
            )}
            {viewMode === "selectJob" && (
              <button onClick={handleCancelForm} className="go-back-button">
                ← 뒤로가기
              </button>
            )}
          </h2>
        </div>

        {viewMode === "list" && !showAdminSettingsModal && !adminTabMode && (
          <>
            <div className="section-container">
              <div className="section-header">
                <h3 className="section-header-title">나의 직업 할일</h3>
                <button
                  onClick={handleSelectJobClick}
                  className="header-button"
                >
                  직업 추가/선택
                </button>
              </div>
              <div className="job-tasks-grid">
                {jobsToShow.length > 0 ? (
                  jobsToShow.map((job) => (
                    <JobList
                      key={job.id}
                      job={job}
                      isAdmin={isAdmin?.()}
                      onEditJob={() => handleEditJob(job)}
                      onDeleteJob={() => handleDeleteJob(job.id)}
                      onAddTask={() => handleAddTaskClick(job.id, true)}
                      onEarnCoupon={(taskId) =>
                        handleTaskEarnCoupon(taskId, job.id, true)
                      }
                      onEditTask={(task) => handleEditTask(task, job.id)}
                      onDeleteTask={(taskId) =>
                        handleDeleteTask(taskId, job.id)
                      }
                      isHandlingTask={isHandlingTask}
                    />
                  ))
                ) : (
                  <p
                    style={{
                      color: "#6b7280",
                      gridColumn: "1 / -1",
                      textAlign: "center",
                      padding: "20px 0",
                    }}
                  >
                    표시할 직업이 없습니다. '직업 추가/선택' 버튼을 눌러 직업을
                    선택해주세요.
                  </p>
                )}
              </div>

              <div className="subsection-header">
                <h4 className="subsection-header-title">공통 할일</h4>
                {isAdmin?.() && (
                  <button
                    onClick={() => handleAddTaskClick(null, false)}
                    className="green-button"
                  >
                    + 공통 할일 추가
                  </button>
                )}
              </div>
              <div style={{ marginTop: "15px" }}>
                <CommonTaskList
                  tasks={commonTasksWithUserProgress} // 사용자 진행 상황이 포함된 데이터 전달
                  isAdmin={isAdmin?.()}
                  onEarnCoupon={(taskId) =>
                    handleTaskEarnCoupon(taskId, null, false)
                  }
                  onEditTask={(taskId) => handleEditTask(commonTasks.find(t => t.id === taskId), null)}
                  onDeleteTask={(taskId) => handleDeleteTask(taskId, null)}
                  isHandlingTask={isHandlingTask}
                />
              </div>
            </div>
          </>
        )}

        {viewMode === "selectJob" && (
          <SelectMultipleJobsView
            availableJobs={jobs}
            currentSelectedJobIds={currentSelectedJobIdsFromUserDoc}
            onConfirmSelection={handleConfirmJobSelection}
            onCancel={handleCancelForm}
          />
        )}

        {isAdmin?.() && (
          <AdminSettingsModal
            isAdmin={isAdmin?.()}
            isSuperAdmin={isSuperAdmin?.()}
            userClassCode={userDoc?.classCode}
            showAdminSettingsModal={showAdminSettingsModal}
            setShowAdminSettingsModal={setShowAdminSettingsModal}
            adminSelectedMenu={adminSelectedMenu}
            setAdminSelectedMenu={setAdminSelectedMenu}
            classCodes={classCodes}
            onAddClassCode={handleAddClassCode}
            onRemoveClassCode={handleRemoveClassCode}
            newGoalAmount={adminGoalAmountInput}
            setNewGoalAmount={setAdminGoalAmountInput}
            adminCouponValue={adminCouponValueInput}
            setAdminCouponValue={setAdminCouponValueInput}
            handleSaveAdminSettings={handleSaveAdminSettings}
            jobs={jobs}
            adminNewJobTitle={adminNewJobTitle}
            setAdminNewJobTitle={setAdminNewJobTitle}
            adminEditingJob={editingJob}
            setAdminEditingJob={setEditingJob}
            handleSaveJob={handleSaveJob}
            handleDeleteJob={handleDeleteJob}
            handleEditJob={handleEditJob}
            commonTasks={commonTasks}
            showAddTaskForm={showAddTaskForm}
            setShowAddTaskForm={setShowAddTaskForm}
            adminNewTaskName={adminNewTaskName}
            setAdminNewTaskName={setAdminNewTaskName}
            adminNewTaskReward={adminNewTaskReward}
            setAdminNewTaskReward={setAdminNewTaskReward}
            adminNewTaskMaxClicks={adminNewTaskMaxClicks}
            setAdminNewTaskMaxClicks={setAdminNewTaskMaxClicks}
            adminEditingTask={editingTask}
            setAdminEditingTask={setEditingTask}
            handleSaveTask={handleSaveTask}
            handleEditTask={handleEditTask}
            handleDeleteTask={handleDeleteTask}
            taskFormJobId={currentJobIdForTask}
            taskFormIsJobTask={isJobTaskForForm}
            handleAddTaskClick={handleAddTaskClick}
          />
        )}
      </div>
    </div>
  );
}

export default Dashboard;