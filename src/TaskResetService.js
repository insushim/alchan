// src/TaskResetService.js
import {
  db,
  collection,
  query, // query 추가
  where, // where 추가
  getDocs,
  doc,
  // updateDoc, // batch 사용으로 직접 사용 안 함
  writeBatch,
  // serverTimestamp, // 이 파일에서는 직접 사용 안 함
} from "./firebase";

// 특정 학급의 모든 사용자의 'completedTasks'를 초기화
export const resetUserTaskCountsByClass = async (classCode) => {
  if (!classCode) {
    console.error("초기화를 위해 학급 코드가 필요합니다.");
    return {
      success: false,
      message: "학급 코드가 제공되지 않아 초기화할 수 없습니다.",
    };
  }

  try {
    const batch = writeBatch(db);
    const usersQuery = query(
      collection(db, "users"),
      where("classCode", "==", classCode)
    );

    const usersSnapshot = await getDocs(usersQuery);

    if (usersSnapshot.empty) {
      console.log(`${classCode} 학급에 사용자가 없습니다.`);
      return { success: true, message: "초기화할 사용자가 없습니다." };
    }

    usersSnapshot.forEach((userDoc) => {
      const userRef = doc(db, "users", userDoc.id);
      batch.update(userRef, { completedTasks: {} });
    });

    await batch.commit();
    console.log(
      `${classCode} 학급의 ${usersSnapshot.size}명 사용자의 할일 횟수가 초기화되었습니다.`
    );
    return {
      success: true,
      message: `${usersSnapshot.size}명 학생의 할일 횟수가 초기화되었습니다.`,
    };
  } catch (error) {
    console.error(`${classCode} 학급 할일 초기화 중 오류:`, error);
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

// 관리자의 수동 초기화 함수 (수정됨: resetUserTaskCountsByClass 호출)
export const manualResetAllTaskCounts = async (classCode) => {
  console.log(`관리자에 의한 ${classCode} 학급 수동 할일 초기화를 시작합니다.`);
  try {
    // 이제 classCode를 받아 해당 학급만 초기화합니다.
    const result = await resetUserTaskCountsByClass(classCode);
    if (result.success) {
      // 수동 리셋도 오늘의 리셋으로 간주하여 localStorage 업데이트
      localStorage.setItem(
        LAST_RESET_DATE_KEY,
        new Date().toISOString().split("T")[0]
      );
      console.log(
        `관리자에 의해 ${classCode} 학급의 할일 횟수가 성공적으로 초기화되었습니다.`
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
