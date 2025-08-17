// src/Dashboard.js
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import "./Dashboard.css";
import { useAuth } from "./AuthContext";
import { db } from "./firebase";
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
} from "firebase/firestore";

import JobList from "./JobList";
import CommonTaskList from "./CommonTaskList";
import TransferModal from "./TransferModal";
import DonateCouponModal from "./DonateCouponModal";
import DonationHistoryModal from "./DonationHistoryModal";
import SellCouponModal from "./SellCouponModal";
import AdminSettingsModal from "./AdminSettingsModal";
import GiftCouponModal from "./GiftCouponModal";

// Utility functions
const fetchClassData = async (classCode) => {
  try {
    const q = query(
      firestoreCollection(db, "sharedData"),
      where("classCode", "==", classCode)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching class data:", error);
    return [];
  }
};

const saveSharedData = async (data, classCode) => {
  try {
    await addDoc(firestoreCollection(db, "sharedData"), {
      ...data,
      classCode,
      createdAt: serverTimestamp(),
    });
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

const styles = {
  pageTitle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "15px 20px",
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e5e7eb",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  pageTitleText: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#1f2937",
  },
  welcomeMessage: {
    fontSize: "20px",
    fontWeight: "600",
    color: "#374151",
  },
  sectionContainer: {
    backgroundColor: "#ffffff",
    padding: "20px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    marginBottom: "25px",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    paddingBottom: "10px",
    borderBottom: "1px solid #e5e7eb",
  },
  sectionHeaderTitle: {
    fontSize: "20px",
    fontWeight: "600",
    color: "#111827",
  },
  subsectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "30px",
    marginBottom: "15px",
  },
  subsectionHeaderTitle: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#1f2937",
  },
  jobTaskListGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
  },
};

const buttonStyles = {
  adminSettings: {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: "500",
    backgroundColor: "#4f46e5",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  goBack: {
    padding: "8px 16px",
    fontSize: "14px",
    backgroundColor: "#d1d5db",
    color: "#1f2937",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  headerButton: {
    padding: "8px 12px",
    fontSize: "14px",
    fontWeight: "500",
    backgroundColor: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  greenButton: {
    padding: "8px 12px",
    fontSize: "14px",
    fontWeight: "500",
    backgroundColor: "#10b981",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  addJobTaskButton: {
    padding: "6px 10px",
    fontSize: "13px",
    backgroundColor: "#6366f1",
    color: "white",
  },
};

function Dashboard() {
  console.log("Dashboard 컴포넌트 렌더링");
  const navigate = useNavigate();
  const {
    user,
    userDoc,
    loading: authLoading,
    updateUser,
    isAdmin,
    isSuperAdmin,
  } = useAuth();

  // State management
  const [appLoading, setAppLoading] = useState(true);
  const [viewMode, setViewMode] = useState("list");
  const [showAdminSettingsModal, setShowAdminSettingsModal] = useState(false);
  const [adminSelectedMenu, setAdminSelectedMenu] = useState("goal");

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

  // Utility function for generating IDs
  const generateId = useCallback(() => {
    try {
      return doc(firestoreCollection(db, "temp")).id;
    } catch (error) {
      console.error("Error generating ID:", error);
      return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }
  }, []);

  // Data loading function
  const loadTasksData = useCallback(async () => {
    if (!userDoc?.id || !userDoc?.classCode) {
      console.log("Dashboard: userDoc 또는 classCode 없음, 데이터 로드 중단");
      setAppLoading(false);
      setJobs([]);
      setCommonTasks([]);
      return;
    }

    console.log("Dashboard: 데이터 로드 시작");
    setAppLoading(true);

    try {
      const classCode = userDoc.classCode;

      // Firestore queries with error handling
      const [
        jobsSnapshot,
        commonTasksSnapshot,
        settingsSnap,
        goalSnap,
        classCodeSnap,
      ] = await Promise.allSettled([
        getDocs(
          query(
            firestoreCollection(db, "jobs"),
            where("classCode", "==", classCode)
          )
        ),
        getDocs(
          query(
            firestoreCollection(db, "commonTasks"),
            where("classCode", "==", classCode)
          )
        ),
        getDoc(doc(db, "settings", "mainSettings")),
        currentGoalId && isAdmin?.()
          ? getDoc(doc(db, "goals", currentGoalId))
          : Promise.resolve({ exists: () => false }),
        getDoc(doc(db, "settings", "classCodes")),
      ]);

      // Process jobs
      if (jobsSnapshot.status === "fulfilled") {
        const loadedJobs = jobsSnapshot.value.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          tasks: (d.data().tasks || []).map((task) => ({
            ...task,
            reward: task.reward || 0,
            clicks: task.clicks || 0,
            maxClicks: task.maxClicks || 5,
          })),
          active: d.data().active !== false,
        }));
        setJobs(loadedJobs);
      } else {
        console.error("Jobs 로드 실패:", jobsSnapshot.reason);
        setJobs([]);
      }

      // Process common tasks
      if (commonTasksSnapshot.status === "fulfilled") {
        const loadedCommonTasks = commonTasksSnapshot.value.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          reward: d.data().reward || 0,
          clicks: d.data().clicks || 0,
          maxClicks: d.data().maxClicks || 5,
        }));
        setCommonTasks(loadedCommonTasks);
      } else {
        console.error("CommonTasks 로드 실패:", commonTasksSnapshot.reason);
        setCommonTasks([]);
      }

      // Process settings
      if (settingsSnap.status === "fulfilled" && settingsSnap.value.exists()) {
        const settingsData = settingsSnap.value.data();
        const newCouponValue = settingsData.couponValue || 1000;
        setCouponValue(newCouponValue);
        setAdminCouponValueInput(String(newCouponValue));
      }

      // Process goal (admin only)
      if (
        goalSnap.status === "fulfilled" &&
        goalSnap.value.exists &&
        goalSnap.value.exists() &&
        isAdmin?.()
      ) {
        const goalData = goalSnap.value.data();
        if (goalData.classCode === classCode) {
          const targetAmount = goalData.targetAmount || 1000;
          setClassCouponGoal(targetAmount);
          setAdminGoalAmountInput(String(targetAmount));
        }
      }

      // Process class codes
      if (
        classCodeSnap.status === "fulfilled" &&
        classCodeSnap.value.exists()
      ) {
        setClassCodes(classCodeSnap.value.data().validCodes || []);
      }

      console.log("Dashboard: 데이터 로드 완료");
    } catch (error) {
      console.error("Dashboard: 데이터 로드 오류:", error);
    } finally {
      setAppLoading(false);
    }
  }, [userDoc, currentGoalId, isAdmin]);

  // Effect for data loading
  useEffect(() => {
    console.log("Dashboard useEffect:", {
      authLoading,
      user: !!user,
      userDoc: !!userDoc,
    });

    if (authLoading) {
      setAppLoading(true);
      return;
    }

    if (!user) {
      setAppLoading(false);
      setJobs([]);
      setCommonTasks([]);
      return;
    }

    if (!userDoc) {
      setAppLoading(true);
      return;
    }

    if (userDoc.id && userDoc.classCode) {
      loadTasksData();
    } else {
      setAppLoading(false);
    }
  }, [authLoading, user, userDoc, loadTasksData]);

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
        await updateDoc(jobRef, { title, updatedAt: serverTimestamp() });
      } else {
        const newJobId = generateId();
        await setDoc(doc(db, "jobs", newJobId), {
          title,
          active: true,
          tasks: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          classCode: userDoc.classCode,
        });
      }

      setAdminNewJobTitle("");
      setEditingJob(null);
      setShowAdminSettingsModal(false);
      alert(`직업이 ${editingJob ? "수정" : "추가"}되었습니다.`);
      await loadTasksData();
    } catch (error) {
      console.error("handleSaveJob 오류:", error);
      alert("직업 저장 중 오류 발생");
    } finally {
      setAppLoading(false);
    }
  }, [adminNewJobTitle, editingJob, loadTasksData, generateId, userDoc]);

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
        await deleteDoc(doc(db, "jobs", jobIdToDelete));

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
        await loadTasksData();
      } catch (error) {
        console.error("handleDeleteJob 오류:", error);
        alert("직업 삭제 중 오류 발생");
      } finally {
        setAppLoading(false);
      }
    },
    [user, userDoc, editingJob, updateUser, loadTasksData]
  );

  const handleEditJob = useCallback((jobToEdit) => {
    if (jobToEdit) {
      setEditingJob(jobToEdit);
      setAdminNewJobTitle(jobToEdit.title);
      setAdminSelectedMenu("jobs");
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
    setAdminSelectedMenu("tasks");
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
      setAdminSelectedMenu("tasks");
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
          await updateDoc(jobRef, {
            tasks: updatedTasks,
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(doc(db, "commonTasks", taskId), {
            ...taskData,
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        const newTaskId = generateId();
        const newTaskDataWithId = { ...taskData, id: newTaskId, clicks: 0 };
        if (isJobTaskForForm && currentJobIdForTask) {
          const jobRef = doc(db, "jobs", currentJobIdForTask);
          await updateDoc(jobRef, {
            tasks: arrayUnion(newTaskDataWithId),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(doc(db, "commonTasks", newTaskId), {
            ...newTaskDataWithId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            classCode: userDoc.classCode,
          });
        }
      }

      setShowAddTaskForm(false);
      setEditingTask(null);
      setShowAdminSettingsModal(false);
      alert(`할일이 ${editingTask ? "수정" : "추가"}되었습니다.`);
      await loadTasksData();
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
    loadTasksData,
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
          await updateDoc(jobRef, {
            tasks: updatedTasks,
            updatedAt: serverTimestamp(),
          });
        } else {
          await deleteDoc(doc(db, "commonTasks", taskIdToDelete));
        }

        if (editingTask?.id === taskIdToDelete) {
          setShowAddTaskForm(false);
          setEditingTask(null);
        }

        setShowAdminSettingsModal(false);
        alert("할일이 삭제되었습니다.");
        await loadTasksData();
      } catch (error) {
        console.error("handleDeleteTask 오류:", error);
        alert("할일 삭제 중 오류 발생: " + error.message);
      } finally {
        setAppLoading(false);
      }
    },
    [editingTask, loadTasksData]
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

  // Task completion handler
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
            alert(`${currentTaskData.name} 할일은 이미 최대 완료했습니다.`);
            return;
          }

          taskReward = currentTaskData.reward;
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

          await updateDoc(jobRef, {
            tasks: updatedDbTasks,
            updatedAt: serverTimestamp(),
          });
        } else {
          currentTaskData = commonTasks.find((t) => t.id === taskId);
          if (!currentTaskData)
            throw new Error("공통 할일을 찾을 수 없습니다.");

          if (currentTaskData.clicks >= currentTaskData.maxClicks) {
            alert(`${currentTaskData.name} 할일은 이미 최대 완료했습니다.`);
            return;
          }

          taskReward = currentTaskData.reward;
          const currentTaskRef = doc(db, "commonTasks", taskId);
          await updateDoc(currentTaskRef, {
            clicks: increment(1),
            updatedAt: serverTimestamp(),
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
        }

        alert(
          `'${currentTaskData.name}' 완료! ${
            taskReward > 0 ? `+${taskReward} 쿠폰!` : ""
          }`
        );
        await loadTasksData();
      } catch (error) {
        console.error("handleTaskEarnCoupon 오류:", error);
        alert(`오류 발생: ${error.message}`);
        await loadTasksData();
      } finally {
        setIsHandlingTask(false);
      }
    },
    [userDoc, jobs, commonTasks, isHandlingTask, updateUser, loadTasksData]
  );

  // Admin settings handlers
  const handleOpenAdminSettings = useCallback(() => {
    setAdminGoalAmountInput(String(classCouponGoal));
    setAdminCouponValueInput(String(couponValue));
    setAdminSelectedMenu("goal");
    setShowAdminSettingsModal(true);
  }, [classCouponGoal, couponValue]);

  const handleSaveAdminSettings = useCallback(async () => {
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
      const batch = writeBatch(db);
      const settingsRef = doc(db, "settings", "mainSettings");

      const settingsSnap = await getDoc(settingsRef);
      if (
        !settingsSnap.exists() ||
        settingsSnap.data().couponValue !== newValue
      ) {
        batch.set(
          settingsRef,
          { couponValue: newValue, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }

      // Goals collection access with permission check
      if (currentGoalId && isAdmin?.()) {
        try {
          const goalRef = doc(db, "goals", currentGoalId);
          const goalSnap = await getDoc(goalRef);

          if (!goalSnap.exists()) {
            batch.set(goalRef, {
              targetAmount: newGoal,
              progress: 0,
              donations: [],
              donationCount: 0,
              classCode: userDoc.classCode,
              title: `${userDoc.classCode} 학급 목표`,
              description: `${userDoc.classCode} 학급의 쿠폰 목표입니다.`,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (goalSnap.data().targetAmount !== newGoal) {
            batch.update(goalRef, {
              targetAmount: newGoal,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (goalError) {
          console.warn(
            "목표 설정 권한이 없어 목표 금액 설정을 건너뜁니다:",
            goalError.code
          );
        }
      }

      await batch.commit();

      setCouponValue(newValue);
      if (currentGoalId && isAdmin?.()) {
        setClassCouponGoal(newGoal);
      }
      setShowAdminSettingsModal(false);
      alert("관리자 설정이 저장되었습니다.");
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

  // Class code management
  const loadClassCodes = useCallback(async () => {
    if (!db || !isAdmin?.()) return;

    try {
      const codeRef = doc(db, "settings", "classCodes");
      const codeDoc = await getDoc(codeRef);

      if (codeDoc.exists()) {
        setClassCodes(
          Array.isArray(codeDoc.data().validCodes)
            ? codeDoc.data().validCodes
            : []
        );
      } else {
        await setDoc(codeRef, {
          validCodes: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
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

        await updateDoc(codeRef, {
          validCodes: [...currentValidCodes, trimmedCode],
          updatedAt: serverTimestamp(),
        });

        alert("학급 코드가 추가되었습니다.");
        await loadClassCodes();
        return true;
      } catch (error) {
        console.error("학급 코드 추가 오류:", error);
        alert("학급 코드 추가 중 오류 발생");
        return false;
      } finally {
        setAppLoading(false);
      }
    },
    [classCodes, loadClassCodes]
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

        await updateDoc(codeRef, {
          validCodes: updatedCodes,
          updatedAt: serverTimestamp(),
        });

        alert("학급 코드가 삭제되었습니다.");
        await loadClassCodes();
        return true;
      } catch (error) {
        console.error("학급 코드 삭제 오류:", error);
        alert("학급 코드 삭제 중 오류 발생: " + error.message);
        return false;
      } finally {
        setAppLoading(false);
      }
    },
    [loadClassCodes]
  );

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
      <div
        className="dashboard-content-area"
        style={{ padding: "0", backgroundColor: "#f9fafb" }}
      >
        <div style={{ marginBottom: "15px" }}>
          <h2 className="dashboard-page-title" style={styles.pageTitle}>
            <span style={{ ...styles.pageTitleText, ...styles.welcomeMessage }}>
              오늘의 할일 ✨ ({userNickname}님)
            </span>
            {isAdmin?.() && viewMode === "list" && !showAdminSettingsModal && (
              <button
                onClick={handleOpenAdminSettings}
                style={buttonStyles.adminSettings}
              >
                앱 설정 (할일/직업)
              </button>
            )}
            {viewMode === "selectJob" && (
              <button onClick={handleCancelForm} style={buttonStyles.goBack}>
                ← 뒤로가기
              </button>
            )}
          </h2>
        </div>

        {viewMode === "list" && !showAdminSettingsModal && (
          <>
            <div style={styles.sectionContainer}>
              <div style={styles.sectionHeader}>
                <h3 style={styles.sectionHeaderTitle}>나의 직업 할일</h3>
                <button
                  onClick={handleSelectJobClick}
                  style={buttonStyles.headerButton}
                >
                  직업 추가/선택
                </button>
              </div>
              <div className="job-tasks-grid" style={styles.jobTaskListGrid}>
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
                      addJobTaskButtonStyle={buttonStyles.addJobTaskButton}
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

              <div style={styles.subsectionHeader}>
                <h4 style={styles.subsectionHeaderTitle}>공통 할일</h4>
                {isAdmin?.() && (
                  <button
                    onClick={() => handleAddTaskClick(null, false)}
                    style={buttonStyles.greenButton}
                  >
                    + 공통 할일 추가
                  </button>
                )}
              </div>
              <div style={{ marginTop: "15px" }}>
                <CommonTaskList
                  tasks={commonTasks}
                  isAdmin={isAdmin?.()}
                  onEarnCoupon={(taskId) =>
                    handleTaskEarnCoupon(taskId, null, false)
                  }
                  onEditTask={(task) => handleEditTask(task, null)}
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
