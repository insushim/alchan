// src/AdminSettingsModal.js
import React, { useState, useEffect, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import {
  db,
  functions,
  firebaseDoc,
  firebaseCollection,
  firebaseGetSingleDoc,
  firebaseUpdateDoc,
  firebaseSetDoc,
  firebaseGetDocs,
  serverTimestamp,
  increment,
  writeBatch,
  query as firebaseQuery,
  where as firebaseWhere,
} from "./firebase";

// 최적화된 데이터 훅들
import {
  useOptimizedAdminSettings,
  useOptimizedStudents,
  useOptimizedSalarySettings,
  useOptimizedSystemManagement,
  useBatchPaySalaries,
  useAdminDataPreloader,
} from "./hooks/useOptimizedAdminData";

// 시스템 모니터링 컴포넌트
import SystemMonitoring from "./SystemMonitoring";

// 데이터베이스 관리 컴포넌트
import AdminDatabase from "./AdminDatabase";

const AdminSettingsModal = ({
  isAdmin,
  isSuperAdmin,
  userClassCode,
  showAdminSettingsModal,
  setShowAdminSettingsModal,
  adminSelectedMenu,
  setAdminSelectedMenu,

  // 목표 설정 관련 props
  newGoalAmount,
  setNewGoalAmount,
  adminCouponValue,
  setAdminCouponValue,
  handleSaveAdminSettings,

  // 직업 관리 관련 props
  jobs,
  adminNewJobTitle,
  setAdminNewJobTitle,
  adminEditingJob,
  setAdminEditingJob,
  handleSaveJob,
  handleDeleteJob,
  handleEditJob,

  // 할일 관리 관련 props
  commonTasks,
  showAddTaskForm,
  setShowAddTaskForm,
  adminNewTaskName,
  setAdminNewTaskName,
  adminNewTaskReward,
  setAdminNewTaskReward,
  adminNewTaskMaxClicks,
  setAdminNewTaskMaxClicks,
  adminEditingTask,
  setAdminEditingTask,
  handleSaveTask,
  handleEditTask,
  handleDeleteTask,
  taskFormJobId,
  taskFormIsJobTask,
  handleAddTaskClick,

  // 학급 코드 관리 관련 props
  classCodes = [],
  onAddClassCode,
  onRemoveClassCode,
}) => {
  const [newClassCode, setNewClassCode] = useState("");
  const [classCodeOperationLoading, setClassCodeOperationLoading] =
    useState(false);
  const [classMembers, setClassMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showEditStudentJobsModal, setShowEditStudentJobsModal] =
    useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [tempSelectedJobIds, setTempSelectedJobIds] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [appLoading, setAppLoading] = useState(false);
  const [isPayingSalary, setIsPayingSalary] = useState(false);
  const [lastSalaryPaidDate, setLastSalaryPaidDate] = useState(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectAllStudents, setSelectAllStudents] = useState(false);
  const [error, setError] = useState("");

  // 급여 설정 상태
  const [salarySettings, setSalarySettings] = useState({
    taxRate: 0.1, // 10% 세율
    salaryIncreaseRate: 0.03, // 3% 주급 인상률 
  });
  const [tempTaxRate, setTempTaxRate] = useState("10");
  const [tempSalaryIncreaseRate, setTempSalaryIncreaseRate] = useState("3");
  const [salarySettingsLoading, setSalarySettingsLoading] = useState(false);

  // 최적화된 데이터 훅들
  const studentsQuery = useOptimizedStudents();
  const salarySettingsQuery = useOptimizedSalarySettings();
  const systemManagementQuery = useOptimizedSystemManagement();
  const generalSettingsQuery = useOptimizedAdminSettings("generalSettings");
  const batchPaySalariesMutation = useBatchPaySalaries();
  const { preloadAdminData } = useAdminDataPreloader();

  // 급여 설정 로드
  const loadSalarySettings = useCallback(async () => {
    if (!db) return;

    try {
      // 학급별 급여 설정을 사용하거나, 없으면 전역 설정 사용
      const classSettingsRef = userClassCode
        ? firebaseDoc(db, "settings", `salarySettings_${userClassCode}`)
        : firebaseDoc(db, "settings", "salarySettings");
      const settingsSnap = await firebaseGetSingleDoc(classSettingsRef);
      
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        const settings = {
          taxRate: data.taxRate || 0.1,
          salaryIncreaseRate: data.salaryIncreaseRate || 0.03,
        };
        setSalarySettings(settings);
        setTempTaxRate(String((settings.taxRate * 100).toFixed(1)));
        setTempSalaryIncreaseRate(String((settings.salaryIncreaseRate * 100).toFixed(1)));
        
        if (data.lastPaidDate) {
          setLastSalaryPaidDate(data.lastPaidDate.toDate());
        }
      } else {
        // 기본 설정으로 초기화
        await firebaseSetDoc(classSettingsRef, {
          taxRate: 0.1,
          salaryIncreaseRate: 0.03,
          lastPaidDate: null,
          classCode: userClassCode || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("급여 설정 로드 오류:", error);
    }
  }, [db, userClassCode]);

  // 급여 설정 저장
  const handleSaveSalarySettings = useCallback(async () => {
    if (!db) {
      alert("데이터베이스 연결 오류.");
      return;
    }

    const taxRateNum = parseFloat(tempTaxRate);
    const increaseRateNum = parseFloat(tempSalaryIncreaseRate);

    if (isNaN(taxRateNum) || taxRateNum < 0 || taxRateNum > 100) {
      alert("세율은 0~100 사이의 숫자여야 합니다.");
      return;
    }

    if (isNaN(increaseRateNum) || increaseRateNum < 0 || increaseRateNum > 100) {
      alert("주급 인상률은 0~100 사이의 숫자여야 합니다.");
      return;
    }

    setSalarySettingsLoading(true);

    try {
      const classSettingsRef = userClassCode
        ? firebaseDoc(db, "settings", `salarySettings_${userClassCode}`)
        : firebaseDoc(db, "settings", "salarySettings");
      const newSettings = {
        taxRate: taxRateNum / 100,
        salaryIncreaseRate: increaseRateNum / 100,
        classCode: userClassCode || null,
        updatedAt: serverTimestamp(),
      };

      await firebaseUpdateDoc(classSettingsRef, newSettings);
      setSalarySettings({
        taxRate: newSettings.taxRate,
        salaryIncreaseRate: newSettings.salaryIncreaseRate,
      });

      alert("급여 설정이 저장되었습니다.");
    } catch (error) {
      console.error("급여 설정 저장 오류:", error);
      alert("급여 설정 저장 중 오류가 발생했습니다: " + error.message);
    } finally {
      setSalarySettingsLoading(false);
    }
  }, [db, userClassCode]);

  // 월급 계산 함수 (세금 공제 포함)
  const calculateSalary = useCallback((selectedJobIds, includesTax = false) => {
    if (!Array.isArray(selectedJobIds) || selectedJobIds.length === 0) {
      return { gross: 0, tax: 0, net: 0 };
    }
    
    const baseSalary = 2000000;
    const additionalSalary = 500000;
    const grossSalary = baseSalary + Math.max(0, selectedJobIds.length - 1) * additionalSalary;
    
    if (!includesTax) {
      return grossSalary;
    }
    
    const tax = Math.floor(grossSalary * salarySettings.taxRate);
    const netSalary = grossSalary - tax;
    
    return { gross: grossSalary, tax, net: netSalary };
  }, [salarySettings.taxRate]);

  // 직업 편집 핸들러
  const handleJobEdit = useCallback(
    (job) => {
      console.log("[AdminSettingsModal] 직업 편집 클릭:", job);
      if (handleEditJob && typeof handleEditJob === "function") {
        handleEditJob(job);
      } else {
        console.error(
          "[AdminSettingsModal] handleEditJob 함수가 정의되지 않았습니다."
        );
        alert("직업 편집 기능을 사용할 수 없습니다.");
      }
    },
    [handleEditJob]
  );

  // 직업 삭제 핸들러
  const handleJobDelete = useCallback(
    (jobId) => {
      console.log("[AdminSettingsModal] 직업 삭제 클릭:", jobId);
      if (handleDeleteJob && typeof handleDeleteJob === "function") {
        handleDeleteJob(jobId);
      } else {
        console.error(
          "[AdminSettingsModal] handleDeleteJob 함수가 정의되지 않았습니다."
        );
        alert("직업 삭제 기능을 사용할 수 없습니다.");
      }
    },
    [handleDeleteJob]
  );

  // 할일 편집 핸들러
  const handleTaskEdit = useCallback(
    (task, jobId = null) => {
      console.log(
        "[AdminSettingsModal] 할일 편집 클릭:",
        task,
        "jobId:",
        jobId
      );
      if (handleEditTask && typeof handleEditTask === "function") {
        handleEditTask(task, jobId);
      } else {
        console.error(
          "[AdminSettingsModal] handleEditTask 함수가 정의되지 않았습니다."
        );
        alert("할일 편집 기능을 사용할 수 없습니다.");
      }
    },
    [handleEditTask]
  );

  // 할일 삭제 핸들러
  const handleTaskDelete = useCallback(
    (taskId, jobId = null) => {
      console.log(
        "[AdminSettingsModal] 할일 삭제 클릭:",
        taskId,
        "jobId:",
        jobId
      );
      if (handleDeleteTask && typeof handleDeleteTask === "function") {
        handleDeleteTask(taskId, jobId);
      } else {
        console.error(
          "[AdminSettingsModal] handleDeleteTask 함수가 정의되지 않았습니다."
        );
        alert("할일 삭제 기능을 사용할 수 없습니다.");
      }
    },
    [handleDeleteTask]
  );

  // 할일 추가 핸들러
  const handleTaskAdd = useCallback(
    (jobId = null, isJobTask = false) => {
      console.log(
        "[AdminSettingsModal] 할일 추가 클릭:",
        jobId,
        "isJobTask:",
        isJobTask
      );
      if (handleAddTaskClick && typeof handleAddTaskClick === "function") {
        handleAddTaskClick(jobId, isJobTask);
      } else {
        console.error(
          "[AdminSettingsModal] handleAddTaskClick 함수가 정의되지 않았습니다."
        );
        alert("할일 추가 기능을 사용할 수 없습니다.");
      }
    },
    [handleAddTaskClick]
  );

  // 학생 목록 로드 함수 (Class/students 구조와 users 구조 모두 지원)
  const loadStudents = useCallback(async () => {
    if (!db) {
      console.error("loadStudents: Firestore 데이터베이스 연결이 없습니다.");
      setError("데이터베이스 연결 오류로 학생 정보를 가져올 수 없습니다.");
      setStudents([]);
      setStudentsLoading(false);
      return;
    }

    setStudentsLoading(true);
    setError("");

    try {
      let studentsList = [];

      if (!isSuperAdmin && !userClassCode) {
        setError("학급 코드가 설정되지 않아 학생 정보를 가져올 수 없습니다.");
        setStudents([]);
        setStudentsLoading(false);
        return;
      }

      // 1. Class/{classCode}/students 구조에서 시도
      if (!isSuperAdmin && userClassCode) {
        try {
          const classStudentsRef = firebaseCollection(db, "Class", userClassCode, "students");
          const classStudentsSnapshot = await firebaseGetDocs(classStudentsRef);

          classStudentsSnapshot.forEach((doc) => {
            const userData = doc.data();
            studentsList.push({
              id: doc.id,
              nickname: userData.nickname || userData.name || "이름 없음",
              name: userData.name || "",
              email: userData.email || "",
              classCode: userClassCode,
              selectedJobIds: userData.selectedJobIds || [],
              cash: userData.money || userData.cash || 0, // money 필드도 확인
              lastSalaryDate: userData.lastSalaryDate
                ? userData.lastSalaryDate.toDate()
                : null,
              lastGrossSalary: userData.lastGrossSalary || 0,
              lastTaxAmount: userData.lastTaxAmount || 0,
              lastNetSalary: userData.lastNetSalary || 0,
              totalSalaryReceived: userData.totalSalaryReceived || 0,
            });
          });
        } catch (classError) {
          // Class 구조에서 로드 실패 시 users 구조에서 재시도
        }
      }

      // 2. users 컬렉션에서 시도 (Class 구조에서 못 찾았거나 최고 관리자인 경우)
      if (studentsList.length === 0) {
        const usersRef = firebaseCollection(db, "users");
        let queryRef;

        if (!isSuperAdmin && userClassCode) {
          queryRef = firebaseQuery(
            usersRef,
            firebaseWhere("classCode", "==", userClassCode)
          );
        } else if (isSuperAdmin) {
          queryRef = usersRef;
        }

        const querySnapshot = await firebaseGetDocs(queryRef);

        querySnapshot.forEach((doc) => {
          const userData = doc.data();
          if (!userData.isAdmin && !userData.isSuperAdmin) {
            studentsList.push({
              id: doc.id,
              nickname: userData.nickname || userData.name || "이름 없음",
              name: userData.name || "",
              email: userData.email || "",
              classCode: userData.classCode || "미지정",
              selectedJobIds: userData.selectedJobIds || [],
              cash: userData.cash || 0,
              lastSalaryDate: userData.lastSalaryDate
                ? userData.lastSalaryDate.toDate()
                : null,
              lastGrossSalary: userData.lastGrossSalary || 0,
              lastTaxAmount: userData.lastTaxAmount || 0,
              lastNetSalary: userData.lastNetSalary || 0,
              totalSalaryReceived: userData.totalSalaryReceived || 0,
            });
          }
        });
      }

      setStudents(studentsList);

      try {
        const classSettingsRef = userClassCode
          ? firebaseDoc(db, "settings", `salarySettings_${userClassCode}`)
          : firebaseDoc(db, "settings", "salarySettings");
        const settingsDoc = await firebaseGetSingleDoc(classSettingsRef);
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          setLastSalaryPaidDate(data.lastPaidDate ? data.lastPaidDate.toDate() : null);
          setSalarySettings({
            taxRate: data.taxRate || 0.1,
            salaryIncreaseRate: data.salaryIncreaseRate || 0.03,
          });
        } else {
          setLastSalaryPaidDate(null);
        }
      } catch (settingsError) {
        console.error("급여 설정 로드 오류:", settingsError);
        setLastSalaryPaidDate(null);
      }

      setSelectedStudentIds([]);
      setSelectAllStudents(false);
    } catch (error) {
      console.error("loadStudents: 학생 목록 로드 오류:", error);
      setError("학생 목록을 불러오는 중 오류가 발생했습니다: " + error.message);
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, [db, isSuperAdmin, userClassCode]);

  // 최적화된 선택 학생 급여 지급
  const handlePaySalariesToSelected = async () => {
    if (selectedStudentIds.length === 0) {
      alert("선택된 학생이 없습니다.");
      return;
    }

    const currentSalarySettings = salarySettingsQuery.data?.settings || salarySettings;

    if (
      !window.confirm(
        `선택된 ${selectedStudentIds.length}명의 학생에게 주급을 지급하시겠습니까?\n(세금 ${(currentSalarySettings.taxRate * 100).toFixed(1)}% 공제 후 지급)`
      )
    ) {
      return;
    }

    setIsPayingSalary(true);

    try {
      const result = await batchPaySalariesMutation.mutateAsync({
        studentIds: selectedStudentIds,
        payAll: false,
      });

      if (result.success) {
        const { summary } = result;
        alert(
          `주급 지급 완료!\n${summary.totalStudentsPaid}명의 학생에게 지급\n총 급여: ${(
            summary.totalGrossPaid / 10000
          ).toFixed(0)}만원\n세금 공제: ${(
            summary.totalTaxDeducted / 10000
          ).toFixed(0)}만원\n실제 지급: ${(
            summary.totalNetPaid / 10000
          ).toFixed(0)}만원`
        );

        // 선택 상태 초기화
        setSelectedStudentIds([]);
        setSelectAllStudents(false);
      } else {
        alert(result.message || "주급 지급에 실패했습니다.");
      }
    } catch (error) {
      console.error("[AdminSettingsModal] 선택된 학생 주급 지급 오류:", error);
      alert("주급 지급 중 오류가 발생했습니다: " + error.message);
    } finally {
      setIsPayingSalary(false);
    }
  };

  // 최적화된 전체 학생 급여 지급
  const handlePaySalariesToAll = async () => {
    const currentStudents = studentsQuery.data?.students || students;
    const currentSalarySettings = salarySettingsQuery.data?.settings || salarySettings;

    if (!currentStudents || currentStudents.length === 0) {
      alert("학생 정보가 없습니다.");
      return;
    }

    if (
      !window.confirm(
        `모든 학생들에게 직업별 주급을 지급하시겠습니까?\n(직업이 있는 학생만 해당, 세금 ${(currentSalarySettings.taxRate * 100).toFixed(1)}% 공제)`
      )
    ) {
      return;
    }

    setIsPayingSalary(true);

    try {
      const result = await batchPaySalariesMutation.mutateAsync({
        studentIds: [], // 빈 배열은 전체 지급을 의미
        payAll: true,
      });

      if (result.success) {
        const { summary } = result;
        alert(
          `주급 지급 완료!\n${summary.totalStudentsPaid}명의 학생에게 지급\n총 급여: ${(
            summary.totalGrossPaid / 10000
          ).toFixed(0)}만원\n세금 공제: ${(
            summary.totalTaxDeducted / 10000
          ).toFixed(0)}만원\n실제 지급: ${(
            summary.totalNetPaid / 10000
          ).toFixed(0)}만원`
        );
      } else {
        alert(result.message || "주급 지급에 실패했습니다.");
      }
    } catch (error) {
      console.error("[AdminSettingsModal] 전체 학생 주급 지급 오류:", error);
      alert("주급 지급 중 오류가 발생했습니다: " + error.message);
    } finally {
      setIsPayingSalary(false);
    }
  };

  // 학급 구성원 로드
  const loadClassMembers = useCallback(async () => {
    if (!db) {
      console.error(
        "loadClassMembers: Firestore 데이터베이스 연결이 없습니다."
      );
      setError(
        "데이터베이스 연결 오류로 학급 구성원 정보를 가져올 수 없습니다."
      );
      setClassMembers([]);
      setMembersLoading(false);
      return;
    }

    setMembersLoading(true);
    setError("");

    try {
      const usersRef = firebaseCollection(db, "users");
      let queryRef;

      if (!isSuperAdmin && userClassCode) {
        queryRef = firebaseQuery(
          usersRef,
          firebaseWhere("classCode", "==", userClassCode)
        );
      } else if (isSuperAdmin) {
        queryRef = usersRef;
      } else {
        console.warn("관리자의 학급 코드가 설정되지 않았습니다.");
        setError("학급 코드가 설정되지 않아 구성원 정보를 가져올 수 없습니다.");
        setClassMembers([]);
        setMembersLoading(false);
        return;
      }

      const querySnapshot = await firebaseGetDocs(queryRef);
      const usersList = [];

      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        usersList.push({
          id: doc.id,
          name: userData.name || userData.nickname || "이름 없음",
          email: userData.email,
          classCode: userData.classCode || "코드 없음",
          isAdmin: userData.isAdmin || false,
          isSuperAdmin: userData.isSuperAdmin || false,
        });
      });

      setClassMembers(usersList);
      console.log(
        `[AdminSettingsModal] ${usersList.length}명의 구성원 로드 완료`
      );
    } catch (error) {
      console.error("loadClassMembers: 학급 구성원 로드 오류:", error);
      setError(
        "학급 구성원을 불러오는 중 오류가 발생했습니다: " + error.message
      );
      setClassMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [db, isSuperAdmin, userClassCode]);

  // 학생 직업 편집 모달 열기
  const handleEditStudentJobs = (student) => {
    setSelectedStudent(student);
    setTempSelectedJobIds(
      Array.isArray(student.selectedJobIds) ? [...student.selectedJobIds] : []
    );
    setShowEditStudentJobsModal(true);
  };

  // 직업 선택 토글
  const handleToggleJobSelection = (jobId) => {
    setTempSelectedJobIds((prev) => {
      if (prev.includes(jobId)) {
        return prev.filter((id) => id !== jobId);
      } else {
        return [...prev, jobId];
      }
    });
  };

  // 학생 선택 토글
  const handleToggleStudentSelection = (studentId) => {
    setSelectedStudentIds((prev) => {
      if (prev.includes(studentId)) {
        return prev.filter((id) => id !== studentId);
      } else {
        return [...prev, studentId];
      }
    });
  };

  // 전체 선택 토글
  const handleToggleSelectAll = () => {
    if (selectAllStudents) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(
        students.map((student) => student.id).filter((id) => id != null)
      );
    }
    setSelectAllStudents(!selectAllStudents);
  };

  // 학생 직업 저장
  const handleSaveStudentJobs = async () => {
    if (!selectedStudent || !db) {
      alert("학생 정보 또는 데이터베이스 연결 오류");
      return;
    }

    setAppLoading(true);

    try {
      const userRef = firebaseDoc(db, "users", selectedStudent.id);
      await firebaseUpdateDoc(userRef, {
        selectedJobIds: tempSelectedJobIds,
        updatedAt: serverTimestamp(),
      });

      setStudents((prevStudents) =>
        prevStudents.map((student) =>
          student.id === selectedStudent.id
            ? { ...student, selectedJobIds: tempSelectedJobIds }
            : student
        )
      );

      alert("학생 직업이 성공적으로 업데이트되었습니다.");
      setShowEditStudentJobsModal(false);
    } catch (error) {
      console.error("학생 직업 업데이트 오류:", error);
      alert("학생 직업 업데이트 중 오류가 발생했습니다: " + error.message);
    } finally {
      setAppLoading(false);
    }
  };

  const adminResetUserPassword = httpsCallable(functions, 'adminResetUserPassword');

  const handleResetPassword = useCallback(async (userId) => {
    if (!isAdmin && !isSuperAdmin) {
      alert("관리자만 비밀번호를 초기화할 수 있습니다.");
      return;
    }

    const newPassword = prompt("새로운 비밀번호를 입력하세요. 6자 이상이어야 합니다.");

    if (!newPassword || newPassword.length < 6) {
      alert("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    if (window.confirm(`사용자(ID: ${userId})의 비밀번호를 정말로 초기화하시겠습니까?`)) {
      try {
        setMembersLoading(true);
        const result = await adminResetUserPassword({ userId, newPassword });
        if (result.data.success) {
          alert(result.data.message);
        } else {
          throw new Error(result.data.message || "알 수 없는 오류");
        }
      } catch (error) {
        console.error("비밀번호 초기화 오류:", error);
        alert(`비밀번호 초기화 중 오류가 발생했습니다: ${error.message}`);
      } finally {
        setMembersLoading(false);
      }
    }
  }, [isAdmin, isSuperAdmin, adminResetUserPassword]);

  // 관리자 권한 토글
  const toggleAdminStatus = useCallback(
    async (userId, currentStatus) => {
      if (!db) {
        alert("데이터베이스 연결 오류.");
        return;
      }

      if (!isSuperAdmin) {
        alert("최고 관리자만 관리자 권한을 부여/해제할 수 있습니다.");
        return;
      }

      if (
        window.confirm(
          `이 사용자의 관리자 권한을 ${
            currentStatus ? "제거" : "부여"
          }하시겠습니까?`
        )
      ) {
        setMembersLoading(true);

        try {
          const userRef = firebaseDoc(db, "users", userId);
          await firebaseUpdateDoc(userRef, { isAdmin: !currentStatus });

          setClassMembers((prevMembers) =>
            prevMembers.map((member) =>
              member.id === userId
                ? { ...member, isAdmin: !currentStatus }
                : member
            )
          );

          alert(`관리자 권한이 ${!currentStatus ? "부여" : "제거"}되었습니다.`);
        } catch (error) {
          console.error("관리자 권한 변경 오류:", error);
          alert("관리자 권한 변경 중 오류가 발생했습니다.");
        } finally {
          setMembersLoading(false);
        }
      }
    },
    [db, isSuperAdmin]
  );

  // 학급 코드 추가
  const handleAddClassCode = useCallback(async () => {
    if (!onAddClassCode || typeof onAddClassCode !== "function") {
      alert("학급 코드 추가 기능을 사용할 수 없습니다.");
      return;
    }

    const codeToAdd = newClassCode.trim();
    if (!codeToAdd) {
      alert("학급 코드를 입력해주세요.");
      return;
    }

    setClassCodeOperationLoading(true);

    try {
      const success = await onAddClassCode(codeToAdd);
      if (success) {
        setNewClassCode("");
      }
    } catch (error) {
      console.error("AdminSettingsModal: 학급 코드 추가 중 오류:", error);
    } finally {
      setClassCodeOperationLoading(false);
    }
  }, [newClassCode, onAddClassCode]);

  // 학급 코드 삭제
  const handleRemoveClassCode = useCallback(
    async (codeToRemove) => {
      if (!onRemoveClassCode || typeof onRemoveClassCode !== "function") {
        alert("학급 코드 삭제 기능을 사용할 수 없습니다.");
        return;
      }

      setClassCodeOperationLoading(true);

      try {
        await onRemoveClassCode(codeToRemove);
      } catch (error) {
        console.error("AdminSettingsModal: 학급 코드 삭제 중 오류:", error);
      } finally {
        setClassCodeOperationLoading(false);
      }
    },
    [onRemoveClassCode]
  );

  // 최적화된 데이터 동기화
  useEffect(() => {
    if (showAdminSettingsModal) {
      // 데이터 프리로딩 (필요한 탭들 미리 로드)
      preloadAdminData();
      setError("");
    }

    if (!showAdminSettingsModal) {
      setNewClassCode("");
      setClassMembers([]);
      setStudents([]);
      setSelectedStudent(null);
      setTempSelectedJobIds([]);
      setShowEditStudentJobsModal(false);
      setLastSalaryPaidDate(null);
      setSelectedStudentIds([]);
      setSelectAllStudents(false);
      setClassCodeOperationLoading(false);
      setMembersLoading(false);
      setStudentsLoading(false);
      setAppLoading(false);
      setError("");
    }
  }, [
    showAdminSettingsModal,
    adminSelectedMenu,
    loadClassMembers,
    loadStudents,
    loadSalarySettings,
  ]);

  // 마지막 월급 지급일 포맷
  const formatLastSalaryDate = () => {
    if (!lastSalaryPaidDate) return "아직 지급 기록 없음";

    try {
      const date = lastSalaryPaidDate;
      return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}월 ${String(date.getDate()).padStart(2, "0")}일 ${String(
        date.getHours()
      ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    } catch (e) {
      console.error("formatLastSalaryDate 오류:", e);
      return "날짜 형식 오류";
    }
  };

  if (!showAdminSettingsModal) return null;

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="admin-settings-modal show">
        <div className="admin-settings-content">
          <h2>관리자 설정</h2>
          <p>관리자만 접근할 수 있습니다.</p>
          <button
            onClick={() => setShowAdminSettingsModal(false)}
            className="admin-cancel-button"
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`admin-settings-modal ${showAdminSettingsModal ? "show" : ""}`}
    >
      <div className="admin-settings-content">
        <h2>
          관리자 설정{" "}
          {isSuperAdmin && (
            <span className="super-admin-badge">(최고 관리자)</span>
          )}
        </h2>
        {!isSuperAdmin && userClassCode && (
          <p className="admin-class-info">관리 학급: {userClassCode}</p>
        )}

        <div className="admin-menu-tabs">
          <button
            className={adminSelectedMenu === "generalSettings" ? "active" : ""}
            onClick={() => setAdminSelectedMenu("generalSettings")}
          >
            일반 설정
          </button>
          <button
            className={adminSelectedMenu === "taskManagement" ? "active" : ""}
            onClick={() => setAdminSelectedMenu("taskManagement")}
          >
            할일 관리
          </button>
          <button
            className={adminSelectedMenu === "jobSettings" ? "active" : ""}
            onClick={() => setAdminSelectedMenu("jobSettings")}
          >
            직업 관리
          </button>
          <button
            className={adminSelectedMenu === "studentManagement" ? "active" : ""}
            onClick={() => {
              setAdminSelectedMenu("studentManagement");
              loadStudents();
            }}
          >
            학생 관리
          </button>
          <button
            className={adminSelectedMenu === "salarySettings" ? "active" : ""}
            onClick={() => setAdminSelectedMenu("salarySettings")}
          >
            급여 설정
          </button>
          <button
            className={adminSelectedMenu === "memberManagement" ? "active" : ""}
            onClick={() => {
              setAdminSelectedMenu("memberManagement");
              loadClassMembers();
            }}
          >
            학급 구성원 관리
          </button>
          <button
            className={adminSelectedMenu === "databaseManagement" ? "active" : ""}
            onClick={() => setAdminSelectedMenu("databaseManagement")}
          >
            데이터베이스
          </button>
          {isSuperAdmin && (
            <button
              className={adminSelectedMenu === "systemManagement" ? "active" : ""}
              onClick={() => setAdminSelectedMenu("systemManagement")}
            >
              시스템 관리
            </button>
          )}
        </div>

        {/* 일반 설정 탭 */}
        {adminSelectedMenu === "generalSettings" && (
          <div className="general-settings-tab">
            {!isSuperAdmin && userClassCode && (
              <div className="class-info-header">
                <p className="current-class-info">🏫 현재 관리 학급: <strong>{userClassCode}</strong></p>
              </div>
            )}
            {/* 목표 설정 섹션 */}
            <div className="admin-goal-settings section-card">
              <h3>목표 및 쿠폰 가치 설정</h3>
              <div className="form-group">
                <label>클래스 목표 쿠폰 수:</label>
                <input
                  type="number"
                  min="1"
                  value={newGoalAmount || ""}
                  onChange={(e) =>
                    setNewGoalAmount && setNewGoalAmount(e.target.value)
                  }
                  className="admin-input"
                />
              </div>
              <div className="form-group">
                <label>쿠폰 가치 (원):</label>
                <input
                  type="number"
                  min="1"
                  value={adminCouponValue || ""}
                  onChange={(e) =>
                    setAdminCouponValue && setAdminCouponValue(e.target.value)
                  }
                  className="admin-input"
                />
              </div>
              <button
                onClick={handleSaveAdminSettings}
                className="admin-save-button"
              >
                저장
              </button>
            </div>
          </div>
        )}

        {/* 할일 관리 탭 */}
        {adminSelectedMenu === "taskManagement" && (
          <div className="task-management-tab">
            {!isSuperAdmin && userClassCode && (
              <div className="class-info-header">
                <p className="current-class-info">🏫 현재 관리 학급: <strong>{userClassCode}</strong></p>
              </div>
            )}
            {/* 할일 관리 섹션 */}
            <div className="admin-tasks-settings section-card">
              <h3>할일 관리</h3>
              <p className="admin-section-desc">
                직업별 할일과 공통 할일을 관리합니다.
              </p>

              {showAddTaskForm ? (
                <div className="add-task-form">
                  <h4>{adminEditingTask ? "할일 수정" : "새 할일 추가"}</h4>
                  <p>
                    {taskFormIsJobTask && jobs && taskFormJobId
                      ? `직업: ${
                          jobs.find((j) => j.id === taskFormJobId)?.title ||
                          "알 수 없는 직업"
                        }`
                      : "공통 할일"}
                  </p>

                  <div className="form-group">
                    <label>할일 이름:</label>
                    <input
                      type="text"
                      value={adminNewTaskName}
                      onChange={(e) => setAdminNewTaskName(e.target.value)}
                      placeholder="할일 이름 입력"
                      className="admin-input"
                    />
                  </div>

                  <div className="form-group">
                    <label>보상 (쿠폰):</label>
                    <input
                      type="number"
                      min="0"
                      value={adminNewTaskReward}
                      onChange={(e) => setAdminNewTaskReward(e.target.value)}
                      placeholder="쿠폰 보상"
                      className="admin-input"
                    />
                  </div>

                  <div className="form-group">
                    <label>최대 클릭 수:</label>
                    <input
                      type="number"
                      min="1"
                      value={adminNewTaskMaxClicks}
                      onChange={(e) => setAdminNewTaskMaxClicks(e.target.value)}
                      placeholder="최대 클릭 수"
                      className="admin-input"
                    />
                  </div>

                  <div className="task-form-buttons">
                    <button
                      onClick={() => {
                        console.log("[AdminSettingsModal] 할일 저장 버튼 클릭");
                        if (
                          handleSaveTask &&
                          typeof handleSaveTask === "function"
                        ) {
                          handleSaveTask();
                        } else {
                          console.error(
                            "[AdminSettingsModal] handleSaveTask 함수가 정의되지 않았습니다."
                          );
                          alert("할일 저장 기능을 사용할 수 없습니다.");
                        }
                      }}
                      className="admin-save-button"
                    >
                      {adminEditingTask ? "수정" : "추가"}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddTaskForm(false);
                        setAdminEditingTask(null);
                      }}
                      className="admin-cancel-button"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="task-management">
                  <div className="task-management-buttons">
                    <button
                      onClick={() => {
                        console.log(
                          "[AdminSettingsModal] 공통 할일 추가 버튼 클릭"
                        );
                        handleTaskAdd(null, false);
                      }}
                      className="admin-button"
                    >
                      공통 할일 추가
                    </button>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          console.log(
                            "[AdminSettingsModal] 직업별 할일 추가 선택:",
                            e.target.value
                          );
                          handleTaskAdd(e.target.value, true);
                        }
                      }}
                      className="job-select"
                      value=""
                    >
                      <option value="">직업별 할일 추가...</option>
                      {Array.isArray(jobs) &&
                        jobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.title}에 할일 추가
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* 직업별 할일 목록 */}
                  <div className="tasks-by-job">
                    <h4>직업별 할일</h4>
                    {Array.isArray(jobs) && jobs.length > 0 ? (
                      jobs.map((job) => (
                        <div key={job.id} className="job-tasks">
                          <h5>{job.title}</h5>
                          {Array.isArray(job.tasks) && job.tasks.length > 0 ? (
                            <ul className="admin-tasks">
                              {job.tasks.map((task) => (
                                <li key={task.id} className="admin-task-item">
                                  <div className="task-info">
                                    <span className="task-name">{task.name}</span>
                                    <span className="task-reward">
                                      보상: {task.reward || 0} 쿠폰
                                    </span>
                                    <span className="task-clicks">
                                      클릭: {task.clicks || 0}/
                                      {task.maxClicks || 5}
                                    </span>
                                  </div>
                                  <div className="task-actions">
                                    <button
                                      onClick={() => {
                                        console.log(
                                          "[AdminSettingsModal] 직업 할일 수정 버튼 클릭:",
                                          task,
                                          job.id
                                        );
                                        handleTaskEdit(task, job.id);
                                      }}
                                      className="edit-button"
                                    >
                                      수정
                                    </button>
                                    <button
                                      onClick={() => {
                                        console.log(
                                          "[AdminSettingsModal] 직업 할일 삭제 버튼 클릭:",
                                          task.id,
                                          job.id
                                        );
                                        handleTaskDelete(task.id, job.id);
                                      }}
                                      className="delete-button"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="no-items-message">
                              이 직업에 등록된 할일이 없습니다.
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="no-items-message">등록된 직업이 없습니다.</p>
                    )}
                  </div>

                  {/* 공통 할일 목록 */}
                  <div className="common-tasks">
                    <h4>공통 할일</h4>
                    {Array.isArray(commonTasks) && commonTasks.length > 0 ? (
                      <ul className="admin-tasks">
                        {commonTasks.map((task) => (
                          <li key={task.id} className="admin-task-item">
                            <div className="task-info">
                              <span className="task-name">{task.name}</span>
                              <span className="task-reward">
                                보상: {task.reward || 0} 쿠폰
                              </span>
                              <span className="task-clicks">
                                클릭: {task.clicks || 0}/{task.maxClicks || 5}
                              </span>
                            </div>
                            <div className="task-actions">
                              <button
                                onClick={() => {
                                  console.log(
                                    "[AdminSettingsModal] 공통 할일 수정 버튼 클릭:",
                                    task
                                  );
                                  handleTaskEdit(task);
                                }}
                                className="edit-button"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => {
                                  console.log(
                                    "[AdminSettingsModal] 공통 할일 삭제 버튼 클릭:",
                                    task.id
                                  );
                                  handleTaskDelete(task.id);
                                }}
                                className="delete-button"
                              >
                                삭제
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="no-items-message">
                        등록된 공통 할일이 없습니다.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 직업 관리 탭 */}
        {adminSelectedMenu === "jobSettings" && (
          <div className="job-settings-tab">
            {!isSuperAdmin && userClassCode && (
              <div className="class-info-header">
                <p className="current-class-info">🏫 현재 관리 학급: <strong>{userClassCode}</strong></p>
              </div>
            )}
            {/* 직업 관리 섹션 */}
            <div className="admin-jobs-settings section-card">
              <h3>직업 관리</h3>
              <div className="add-job-form">
                <input
                  type="text"
                  value={adminNewJobTitle}
                  onChange={(e) => setAdminNewJobTitle(e.target.value)}
                  placeholder={adminEditingJob ? "직업명 수정" : "새 직업명 입력"}
                  className="admin-input"
                />
                <button
                  onClick={() => {
                    console.log("[AdminSettingsModal] 직업 저장 버튼 클릭");
                    if (handleSaveJob && typeof handleSaveJob === "function") {
                      handleSaveJob();
                    } else {
                      console.error(
                        "[AdminSettingsModal] handleSaveJob 함수가 정의되지 않았습니다."
                      );
                      alert("직업 저장 기능을 사용할 수 없습니다.");
                    }
                  }}
                  className="admin-save-button"
                >
                  {adminEditingJob ? "수정" : "추가"}
                </button>
                {adminEditingJob && (
                  <button
                    onClick={() => {
                      setAdminEditingJob(null);
                      setAdminNewJobTitle("");
                    }}
                    className="admin-cancel-button"
                  >
                    취소
                  </button>
                )}
              </div>
              <div className="jobs-list">
                <h4>등록된 직업 목록</h4>
                {jobs && jobs.length > 0 ? (
                  <ul className="admin-jobs">
                    {jobs.map((job) => (
                      <li key={job.id} className="admin-job-item">
                        <span className="job-title">{job.title}</span>
                        <div className="job-actions">
                          <button
                            onClick={() => {
                              console.log(
                                "[AdminSettingsModal] 직업 수정 버튼 클릭:",
                                job
                              );
                              handleJobEdit(job);
                            }}
                            className="edit-button"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => {
                              console.log(
                                "[AdminSettingsModal] 직업 삭제 버튼 클릭:",
                                job.id
                              );
                              handleJobDelete(job.id);
                            }}
                            className="delete-button"
                          >
                            삭제
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="no-items-message">등록된 직업이 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 학생 관리 탭 */}
        {adminSelectedMenu === "studentManagement" && (
          <div className="student-management-tab">
            {!isSuperAdmin && userClassCode && (
              <div className="class-info-header">
                <p className="current-class-info">🏫 현재 관리 학급: <strong>{userClassCode}</strong></p>
              </div>
            )}
            {/* 학생직업 관리 섹션 */}
            <div className="student-jobs-settings section-card">
              <h3>학생직업 관리</h3>
              {error && <p className="error-message">{error}</p>}
              <p className="admin-section-desc">
                학생들에게 직업을 배정하거나 관리합니다. 주급은 직업 수에 따라
                차등 지급됩니다.
              </p>

              <div className="salary-management">
                <div className="salary-info">
                  <h4>주급 지급 관리</h4>
                  <p>기본 주급: 200만원, 추가 직업당: 50만원</p>
                  <p>세율: {(salarySettings.taxRate * 100).toFixed(1)}%</p>
                  <p>주급 인상률: {(salarySettings.salaryIncreaseRate * 100).toFixed(1)}% (매주)</p>
                  <p>마지막 주급 지급일: {formatLastSalaryDate()}</p>
                  <p className="auto-payment-info">
                    ⏰ 자동 주급 지급: 매주 금요일 오전 8시 (서버 자동 실행)
                  </p>
                </div>
                <div className="salary-buttons">
                  <button
                    className="admin-button pay-salary-button"
                    onClick={handlePaySalariesToAll}
                    disabled={isPayingSalary || studentsLoading}
                  >
                    {isPayingSalary ? "주급 지급 중..." : "전체 학생 주급 지급"}
                  </button>
                  <button
                    className="admin-button pay-selected-salary-button"
                    onClick={handlePaySalariesToSelected}
                    disabled={
                      isPayingSalary ||
                      studentsLoading ||
                      selectedStudentIds.length === 0
                    }
                  >
                    {isPayingSalary
                      ? "주급 지급 중..."
                      : `선택 학생(${selectedStudentIds.length}) 주급 지급`}
                  </button>
                </div>
              </div>

              <div className="student-jobs-container">
                <div className="student-list-header">
                  <h4>
                    학생 목록{" "}
                    {!isSuperAdmin && userClassCode && `(${userClassCode} 학급)`}
                  </h4>
                  <button
                    onClick={loadStudents}
                    className="admin-button"
                    disabled={studentsLoading}
                  >
                    {studentsLoading ? "로딩 중..." : "학생 목록 새로고침"}
                  </button>
                </div>
                {studentsLoading ? (
                  <p>학생 정보 로딩 중...</p>
                ) : students.length > 0 ? (
                  <div className="members-table-container">
                    <table className="members-table">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              checked={selectAllStudents}
                              onChange={handleToggleSelectAll}
                              disabled={students.length === 0}
                            />
                          </th>
                          <th>학생 이름</th>
                          <th>이메일</th>
                          <th>학급</th>
                          <th>현재 직업</th>
                          <th>예상 총급여</th>
                          <th>세금 공제</th>
                          <th>실급여</th>
                          <th>보유 현금</th>
                          <th>최근 주급일</th>
                          <th>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student) => {
                          const salaryCalc = calculateSalary(student.selectedJobIds, true);
                          return (
                            <tr
                              key={student.id}
                              className={
                                selectedStudentIds.includes(student.id)
                                  ? "selected-student-row"
                                  : ""
                              }
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selectedStudentIds.includes(student.id)}
                                  onChange={() =>
                                    handleToggleStudentSelection(student.id)
                                  }
                                />
                              </td>
                              <td>
                                {student.nickname || student.name || "이름 없음"}
                              </td>
                              <td>{student.email || "-"}</td>
                              <td>{student.classCode || "미지정"}</td>
                              <td>
                                {Array.isArray(student.selectedJobIds) &&
                                student.selectedJobIds.length > 0 ? (
                                  student.selectedJobIds
                                    .map((jobId) => {
                                      const job = Array.isArray(jobs)
                                        ? jobs.find((j) => j.id === jobId)
                                        : null;
                                      return job ? job.title : null;
                                    })
                                    .filter(Boolean)
                                    .join(", ")
                                ) : (
                                  <span className="no-jobs">직업 없음</span>
                                )}
                              </td>
                              <td className="salary-column">
                                {`${(salaryCalc.gross / 10000).toFixed(0)}만원`}
                              </td>
                              <td className="tax-column">
                                {`${(salaryCalc.tax / 10000).toFixed(0)}만원`}
                              </td>
                              <td className="net-salary-column">
                                {`${(salaryCalc.net / 10000).toFixed(0)}만원`}
                              </td>
                              <td className="cash-column">
                                {(student.cash || 0).toLocaleString()}원
                              </td>
                              <td>
                                {student.lastSalaryDate
                                  ? student.lastSalaryDate.toLocaleDateString()
                                  : "없음"}
                              </td>
                              <td>
                                <button
                                  className="edit-button"
                                  onClick={() => handleEditStudentJobs(student)}
                                >
                                  직업 설정
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="no-items-message">
                    {!isSuperAdmin && !userClassCode
                      ? "학급 코드가 설정되지 않았습니다."
                      : "학생 정보가 없습니다."}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 학급 구성원 관리 탭 */}
        {adminSelectedMenu === "memberManagement" && (
          <div className="member-management-tab">
            {!isSuperAdmin && userClassCode && (
              <div className="class-info-header">
                <p className="current-class-info">🏫 현재 관리 학급: <strong>{userClassCode}</strong></p>
              </div>
            )}
            <div className="admin-class-members-container section-card">
              <h3>학급 구성원 관리</h3>
              {error && <p className="error-message">{error}</p>}
              <p className="admin-section-desc">
                학급 구성원의 정보를 확인하고 관리합니다.
                {isSuperAdmin && " 최고 관리자는 모든 학급의 구성원을 확인할 수 있습니다."}
              </p>

              {membersLoading ? (
                <p>구성원 정보 로딩 중...</p>
              ) : classMembers.length > 0 ? (
                <div className="user-cards-container">
                  {classMembers.map((member) => (
                    <div key={member.id} className="user-card">
                      <div className="user-card-header">
                        <span className="user-card-name">{member.name}</span>
                        <span className={`user-card-role role-${member.isSuperAdmin ? 'super' : member.isAdmin ? 'admin' : 'student'}`}>
                          {member.isSuperAdmin
                            ? "최고 관리자"
                            : member.isAdmin
                            ? "관리자"
                            : "학생"}
                        </span>
                      </div>
                      <div className="user-card-body">
                        <p><strong>이메일:</strong> {member.email}</p>
                        <p><strong>학급 코드:</strong> {member.classCode}</p>
                      </div>
                      {isSuperAdmin && (
                        <div className="user-card-actions">
                          {!member.isSuperAdmin && (
                            <button
                              onClick={() =>
                                toggleAdminStatus(member.id, member.isAdmin)
                              }
                              className={`admin-action-button ${
                                member.isAdmin
                                  ? "remove-admin-button"
                                  : "add-admin-button"
                              }`}
                              disabled={membersLoading}
                            >
                              {member.isAdmin ? "관리자 해제" : "관리자 지정"}
                            </button>
                          )}
                          <button
                            onClick={() => handleResetPassword(member.id)}
                            className="admin-action-button reset-password-button"
                            disabled={membersLoading}
                          >
                            비밀번호 초기화
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-members-message">
                  {!isSuperAdmin && !userClassCode
                    ? "학급 코드가 설정되지 않았습니다."
                    : "등록된 학급 구성원이 없습니다."}
                </p>
              )}

              <div className="refresh-members-section">
                <button
                  onClick={loadClassMembers}
                  className="admin-button"
                  disabled={membersLoading}
                >
                  {membersLoading ? "로딩 중..." : "구성원 목록 새로고침"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 급여 설정 탭 */}
        {adminSelectedMenu === "salarySettings" && (
          <div className="salary-settings-tab">
            {!isSuperAdmin && userClassCode && (
              <div className="class-info-header">
                <p className="current-class-info">🏫 현재 관리 학급: <strong>{userClassCode}</strong></p>
              </div>
            )}
            {/* 급여 설정 섹션 */}
            <div className="salary-settings section-card">
              <h3>급여 설정</h3>
              <p className="admin-section-desc">
                세율과 주급 인상률을 설정합니다. 자동 주급 지급은 매주 금요일 오전 8시에 실행됩니다.
              </p>

              <div className="salary-settings-form">
                <div className="form-group">
                  <label>세율 (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={tempTaxRate}
                    onChange={(e) => setTempTaxRate(e.target.value)}
                    className="admin-input"
                    placeholder="예: 10 (10%)"
                  />
                  <small className="form-help">
                    학생들의 주급에서 공제될 세율을 설정합니다.
                  </small>
                </div>

                <div className="form-group">
                  <label>주급 인상률 (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={tempSalaryIncreaseRate}
                    onChange={(e) => setTempSalaryIncreaseRate(e.target.value)}
                    className="admin-input"
                    placeholder="예: 3 (3%)"
                  />
                  <small className="form-help">
                    매주 자동으로 적용될 주급 인상률을 설정합니다.
                  </small>
                </div>

                <button
                  onClick={handleSaveSalarySettings}
                  className="admin-save-button"
                  disabled={salarySettingsLoading}
                >
                  {salarySettingsLoading ? "저장 중..." : "급여 설정 저장"}
                </button>
              </div>

              <div className="current-salary-settings">
                <h4>현재 급여 설정</h4>
                <div className="settings-display">
                  <p>현재 세율: <strong>{(salarySettings.taxRate * 100).toFixed(1)}%</strong></p>
                  <p>현재 주급 인상률: <strong>{(salarySettings.salaryIncreaseRate * 100).toFixed(1)}%</strong></p>
                  <p>마지막 자동 지급일: <strong>{formatLastSalaryDate()}</strong></p>
                </div>
                
                <div className="salary-calculation-example">
                  <h5>주급 계산 예시</h5>
                  <p>• 직업 1개: 총 200만원 → 세금 {(2000000 * salarySettings.taxRate / 10000).toFixed(0)}만원 공제 → 실급여 {((2000000 * (1 - salarySettings.taxRate)) / 10000).toFixed(0)}만원</p>
                  <p>• 직업 2개: 총 250만원 → 세금 {(2500000 * salarySettings.taxRate / 10000).toFixed(0)}만원 공제 → 실급여 {((2500000 * (1 - salarySettings.taxRate)) / 10000).toFixed(0)}만원</p>
                  <p>• 직업 3개: 총 300만원 → 세금 {(3000000 * salarySettings.taxRate / 10000).toFixed(0)}만원 공제 → 실급여 {((3000000 * (1 - salarySettings.taxRate)) / 10000).toFixed(0)}만원</p>
                </div>
                
                <div className="auto-payment-info">
                  <h5>자동 주급 지급 시스템</h5>
                  <p>🤖 매주 금요일 오전 8시에 서버에서 자동으로 주급이 지급됩니다.</p>
                  <p>📈 매주 주급 인상률만큼 급여가 자동으로 인상됩니다.</p>
                  <p>💰 세금이 자동으로 공제되어 실급여가 지급됩니다.</p>
                  <p>⚙️ 관리자가 로그인하지 않아도 자동으로 실행됩니다.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 데이터베이스 관리 탭 */}
        {adminSelectedMenu === "databaseManagement" && (
          <div className="database-management-tab">
            {!isSuperAdmin && userClassCode && (
              <div className="class-info-header">
                <p className="current-class-info">🏫 현재 관리 학급: <strong>{userClassCode}</strong></p>
              </div>
            )}
            <div className="database-management-container section-card" style={{ minHeight: "500px", maxHeight: "70vh", overflow: "auto" }}>
              <AdminDatabase />
            </div>
          </div>
        )}

        {/* 시스템 관리 탭 */}
        {adminSelectedMenu === "systemManagement" && (
          <div className="system-management-tab">
            {isSuperAdmin && (
              <div className="class-info-header">
                <p className="current-class-info">🌐 시스템 전체 관리 (최고 관리자)</p>
              </div>
            )}
            {/* 학급 코드 관리 섹션 */}
            {isSuperAdmin && (
              <div className="admin-class-codes-container section-card">
                <h3>학급 코드 관리</h3>
                {error && <p className="error-message">{error}</p>}
                <div className="add-class-code-form">
                  <input
                    type="text"
                    value={newClassCode}
                    onChange={(e) => setNewClassCode(e.target.value)}
                    placeholder="새 학급 코드 입력"
                    disabled={classCodeOperationLoading}
                    className="admin-input"
                  />
                  <button
                    onClick={handleAddClassCode}
                    disabled={classCodeOperationLoading || !newClassCode.trim()}
                    className="admin-button"
                  >
                    {classCodeOperationLoading ? "추가 중..." : "코드 추가"}
                  </button>
                </div>
                <div className="class-codes-list">
                  <h4>
                    등록된 학급 코드 목록 (
                    {Array.isArray(classCodes) ? classCodes.length : 0}개)
                  </h4>
                  {Array.isArray(classCodes) && classCodes.length > 0 ? (
                    <ul className="codes-list">
                      {classCodes.map((code) => (
                        <li key={code} className="code-item">
                          <span className="code-text">{code}</span>
                          <button
                            onClick={() => handleRemoveClassCode(code)}
                            className="remove-code-button"
                            disabled={classCodeOperationLoading}
                          >
                            삭제
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-codes-message">등록된 학급 코드가 없습니다.</p>
                  )}
                </div>
              </div>
            )}

            {/* 서버 상태 모니터링 섹션 */}
            <SystemMonitoring isSuperAdmin={isSuperAdmin} />
          </div>
        )}

        <div className="admin-settings-footer">
          <button
            onClick={() => setShowAdminSettingsModal(false)}
            className="admin-close-button"
          >
            닫기
          </button>
        </div>
      </div>

      {/* 학생 직업 수정 모달 */}
      {showEditStudentJobsModal && selectedStudent && (
        <div className="modal-overlay show">
          <div className="edit-student-jobs-modal">
            <div className="modal-header">
              <h3>
                학생 직업 설정:{" "}
                {selectedStudent.nickname || selectedStudent.name}
              </h3>
              <button
                className="close-modal-btn"
                onClick={() => setShowEditStudentJobsModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                <strong>
                  {selectedStudent.nickname || selectedStudent.name}
                </strong>
                님의 직업을 설정합니다.
              </p>
              <div className="salary-info">
                <p>
                  현재 보유 현금: {(selectedStudent.cash || 0).toLocaleString()}
                  원
                </p>
                {(() => {
                  const salaryCalc = calculateSalary(tempSelectedJobIds, true);
                  return (
                    <>
                      <p>예상 총급여: {`${(salaryCalc.gross / 10000).toFixed(0)}만원`}</p>
                      <p>세금 공제: {`${(salaryCalc.tax / 10000).toFixed(0)}만원`} ({(salarySettings.taxRate * 100).toFixed(1)}%)</p>
                      <p>실급여: {`${(salaryCalc.net / 10000).toFixed(0)}만원`}</p>
                    </>
                  );
                })()}
                <p className="salary-explanation">
                  (기본 200만원 + 추가 직업당 50만원, 세금 {(salarySettings.taxRate * 100).toFixed(1)}% 공제)
                </p>
              </div>
              <div className="job-selection-list">
                {Array.isArray(jobs) &&
                jobs.filter((job) => job.active !== false).length > 0 ? (
                  jobs
                    .filter((job) => job.active !== false)
                    .map((job) => (
                      <div key={job.id} className="job-selection-item">
                        <input
                          type="checkbox"
                          id={`job-modal-${job.id}`}
                          checked={tempSelectedJobIds.includes(job.id)}
                          onChange={() => handleToggleJobSelection(job.id)}
                        />
                        <label htmlFor={`job-modal-${job.id}`}>
                          {job.title}
                        </label>
                      </div>
                    ))
                ) : (
                  <p className="no-items-message">
                    설정 가능한 직업이 없습니다.
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="admin-cancel-button"
                onClick={() => setShowEditStudentJobsModal(false)}
              >
                취소
              </button>
              <button
                className="admin-save-button"
                onClick={handleSaveStudentJobs}
                disabled={appLoading}
              >
                {appLoading ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettingsModal;