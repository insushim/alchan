// src/TaskResetService.js
import {
  db,
  collection,
  // query, // resetGlobalTaskCounts에서는 직접 사용 안 함
  // where, // resetGlobalTaskCounts에서는 직접 사용 안 함
  getDocs,
  doc,
  updateDoc,
  writeBatch,
  serverTimestamp,
} from "./firebase"; // firebase.js에서 올바른 export 가져오는지 확인

// 모든 공통 할일 및 직업 할일의 'clicks' 횟수를 0으로 초기화 (글로벌)
export const resetGlobalTaskCounts = async () => {
  try {
    const batch = writeBatch(db);

    // 1. 모든 commonTasks의 clicks를 0으로 초기화
    const commonTasksSnapshot = await getDocs(collection(db, "commonTasks"));
    commonTasksSnapshot.forEach((taskDoc) => {
      batch.update(doc(db, "commonTasks", taskDoc.id), {
        clicks: 0,
        // lastResetAt: serverTimestamp(), // 필요하다면 작업 레벨에 리셋 시간 기록
      });
    });
    console.log("모든 공통 할일의 clicks 필드가 0으로 초기화될 예정입니다.");

    // 2. 모든 jobs 내의 tasks 배열에 있는 clicks를 0으로 초기화
    const jobsSnapshot = await getDocs(collection(db, "jobs"));
    jobsSnapshot.forEach((jobDoc) => {
      const jobData = jobDoc.data();
      const tasks = jobData.tasks || [];
      const updatedTasks = tasks.map((task) => ({ ...task, clicks: 0 }));

      batch.update(doc(db, "jobs", jobDoc.id), {
        tasks: updatedTasks,
        // lastResetAt: serverTimestamp(), // 필요하다면 작업 레벨에 리셋 시간 기록
      });
    });
    console.log("모든 직업 할일의 clicks 필드가 0으로 초기화될 예정입니다.");

    await batch.commit();
    console.log("모든 글로벌 할일 횟수가 성공적으로 초기화되었습니다.");
    return { success: true, message: "모든 할일 횟수가 초기화되었습니다." };
  } catch (error) {
    console.error("글로벌 할일 횟수 초기화 중 오류:", error);
    return {
      success: false,
      message: "할일 횟수 초기화 중 오류가 발생했습니다.",
      error: error.message,
    };
  }
};

// localStorage 키 (기존과 동일)
const NEXT_RESET_TIME_KEY = "nextTaskResetTime";
const LAST_RESET_DATE_KEY = "lastTaskResetDate"; // 오늘 초기화 여부 확인용

// 다음 초기화 시간 계산 (오전 8시) (기존과 동일)
export const calculateNextResetTime = () => {
  const now = new Date();
  const nextReset = new Date(now);
  if (now.getHours() >= 8) {
    nextReset.setDate(now.getDate() + 1);
  }
  nextReset.setHours(8, 0, 0, 0);
  return nextReset;
};

// 다음 초기화 시간을 localStorage에 저장 (기존과 동일)
export const updateNextResetTime = () => {
  const nextReset = calculateNextResetTime();
  localStorage.setItem(NEXT_RESET_TIME_KEY, nextReset.getTime().toString());
  return nextReset;
};

// 다음 초기화까지 남은 시간 (밀리초) 계산 (기존과 동일)
export const getTimeUntilNextReset = () => {
  let nextResetTime = localStorage.getItem(NEXT_RESET_TIME_KEY);
  if (!nextResetTime || parseInt(nextResetTime, 10) < Date.now()) {
    nextResetTime = updateNextResetTime().getTime();
  } else {
    nextResetTime = parseInt(nextResetTime, 10);
  }
  return nextResetTime - Date.now();
};

// 브라우저 환경용 초기화 타이머 설정 (수정됨: resetGlobalTaskCounts 호출)
export const setupTaskResetTimer = (onResetCallback) => {
  const timeUntilReset = getTimeUntilNextReset();
  console.log(
    `다음 자동 초기화까지 약 ${Math.round(
      timeUntilReset / 1000 / 60
    )}분 남았습니다.`
  );

  const resetTimer = setTimeout(async () => {
    console.log("자동 일일 할일 초기화 시간입니다...");
    try {
      const result = await resetGlobalTaskCounts(); // 수정된 함수 호출
      if (onResetCallback && typeof onResetCallback === "function") {
        onResetCallback(result);
      }
      if (result.success) {
        localStorage.setItem(
          LAST_RESET_DATE_KEY,
          new Date().toISOString().split("T")[0]
        ); // 오늘 날짜 (YYYY-MM-DD)
        console.log(
          `${new Date().toLocaleString()}: 할일 횟수가 자동으로 초기화되었습니다.`
        );
      } else {
        console.error("자동 초기화 실패:", result.message);
      }
    } catch (error) {
      console.error("자동 초기화 실행 중 예외 발생:", error);
      if (onResetCallback && typeof onResetCallback === "function") {
        onResetCallback({ success: false, error: error.message });
      }
    } finally {
      // 다음 날을 위한 타이머 다시 설정
      setupTaskResetTimer(onResetCallback);
    }
  }, timeUntilReset);

  return resetTimer; // 타이머 ID 반환 (clearTimeout용)
};

// 앱 시작 시 초기화 확인 (수정됨: resetGlobalTaskCounts 호출)
export const checkAndResetOnAppStart = async () => {
  try {
    const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const lastResetDateStr = localStorage.getItem(LAST_RESET_DATE_KEY);

    // 오늘 이미 초기화했거나, 아직 오전 8시가 안 됐으면 실행 안 함
    if (lastResetDateStr === todayStr) {
      console.log("앱 시작: 오늘은 이미 초기화가 실행되었습니다.");
      updateNextResetTime(); // 다음 리셋 시간은 업데이트
      return {
        success: true,
        message: "오늘은 이미 초기화되었거나 초기화 시간이 아닙니다.",
      };
    }

    const now = new Date();
    if (now.getHours() >= 8) {
      // 오전 8시 이후이고, 오늘 아직 초기화 안됐으면 실행
      console.log(
        "앱 시작: 오전 8시가 지났고 오늘 초기화가 안되어 초기화를 실행합니다."
      );
      const result = await resetGlobalTaskCounts(); // 수정된 함수 호출
      if (result.success) {
        localStorage.setItem(LAST_RESET_DATE_KEY, todayStr);
        updateNextResetTime(); // 다음 리셋 시간 업데이트
        return {
          success: true,
          message: "할일 횟수가 초기화되었습니다.",
          details: result,
        };
      } else {
        return {
          success: false,
          message: "앱 시작 시 초기화 실패.",
          details: result,
        };
      }
    } else {
      console.log("앱 시작: 아직 초기화 시간(오전 8시)이 아닙니다.");
      updateNextResetTime(); // 다음 리셋 시간 업데이트
      return { success: true, message: "아직 초기화 시간이 아닙니다." };
    }
  } catch (error) {
    console.error("앱 시작 시 초기화 확인 중 오류:", error);
    return {
      success: false,
      message: "초기화 확인 중 오류가 발생했습니다.",
      error: error.message,
    };
  }
};

// 관리자의 수동 초기화 함수 (수정됨: resetGlobalTaskCounts 호출, classCode 불필요)
// 이 함수는 localStorage의 LAST_RESET_DATE_KEY를 건드리지 않는 것이 좋을 수 있습니다.
// 또는 관리자가 수동 리셋 시, '오늘의 자동 리셋'을 수행한 것으로 간주할지 정책 결정 필요.
// 여기서는 localStorage를 업데이트하도록 유지하되, 필요시 해당 라인 제거.
export const manualResetAllTaskCounts = async () => {
  console.log("관리자에 의한 수동 할일 초기화를 시작합니다.");
  try {
    const result = await resetGlobalTaskCounts(); // 모든 글로벌 할일 초기화
    if (result.success) {
      // 수동 리셋도 오늘의 리셋으로 간주하여 localStorage 업데이트
      localStorage.setItem(
        LAST_RESET_DATE_KEY,
        new Date().toISOString().split("T")[0]
      );
      updateNextResetTime(); // 다음 리셋 시간도 업데이트
      console.log(
        "관리자에 의해 모든 할일 횟수가 성공적으로 초기화되었습니다."
      );
    }
    return result;
  } catch (error) {
    console.error("수동 초기화 중 오류:", error);
    return {
      success: false,
      message: "수동 초기화 중 오류.",
      error: error.message,
    };
  }
};

// Firebase Cloud Functions 배포용 (수정됨: resetGlobalTaskCounts 호출, classCode 불필요)
// 이 함수를 Firebase Functions에 배포하고, 매일 오전 8시에 실행되도록 스케줄링하면
// 클라이언트 상태와 관계없이 안정적인 자동 초기화가 가능합니다.
export const scheduledDailyTaskReset = async () => {
  // 함수 이름 변경 (기존 scheduleDailyReset에서)
  console.log(
    `Cloud Function: ${new Date().toLocaleString()} - 일일 할일 초기화 시작`
  );
  try {
    const result = await resetGlobalTaskCounts();
    if (result.success) {
      console.log(
        `Cloud Function: ${new Date().toLocaleString()} - 일일 할일 초기화 완료`
      );
      return {
        success: true,
        message: "Cloud Function으로 일일 초기화 성공",
        details: result,
      };
    } else {
      console.error(
        `Cloud Function: ${new Date().toLocaleString()} - 일일 할일 초기화 실패`,
        result.message
      );
      return {
        success: false,
        message: "Cloud Function으로 일일 초기화 실패",
        details: result,
      };
    }
  } catch (error) {
    console.error(
      `Cloud Function: ${new Date().toLocaleString()} - 일일 할일 초기화 중 예외 발생`,
      error
    );
    return { success: false, error: error.message };
  }
};
// TaskResetService (6).js 파일 마지막에 있던 불필요한 '}'는 제거되었습니다.
