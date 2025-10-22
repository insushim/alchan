/* eslint-disable */
/* eslint-disable max-len */
// eslint-disable-next-line no-unused-vars
const functions = require("firebase-functions");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall, HttpsError, onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const LOG_TYPES = {
  CASH_INCOME: "현금 입금",
  CASH_EXPENSE: "현금 출금",
  CASH_TRANSFER_SEND: "송금",
  CASH_TRANSFER_RECEIVE: "송금 수신",
  ADMIN_CASH_SEND: "관리자 지급",
  ADMIN_CASH_TAKE: "관리자 회수",
  COUPON_EARN: "쿠폰 획득",
  COUPON_USE: "쿠폰 사용",
  COUPON_GIVE: "쿠폰 지급",
  COUPON_TAKE: "쿠폰 회수",
  COUPON_TRANSFER_SEND: "쿠폰 송금",
  COUPON_TRANSFER_RECEIVE: "쿠폰 수신",
  COUPON_DONATE: "쿠폰 기부",
  COUPON_SELL: "쿠폰 판매",
  ITEM_PURCHASE: "아이템 구매",
  ITEM_USE: "아이템 사용",
  ITEM_SELL: "아이템 판매",
  ITEM_MARKET_LIST: "아이템 시장 등록",
  ITEM_MARKET_BUY: "아이템 시장 구매",
  ITEM_OBTAIN: "아이템 획득",
  ITEM_MOVE: "아이템 이동",
  TASK_COMPLETE: "과제 완료",
  TASK_REWARD: "과제 보상",
  SYSTEM: "시스템",
  ADMIN_ACTION: "관리자 조치",
};

const logActivity = async (transaction, userId, type, description, metadata = {}) => {
  if (!userId || userId === "system") {
    logger.info(`[System Log] ${type}: ${description}`, {metadata});
    return;
  }
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    const userName = userDoc.exists ? userDoc.data().name : "알 수 없는 사용자";
    const classCode = userDoc.exists ? userDoc.data().classCode : "미지정";
    const logData = {
      userId,
      userName,
      classCode,
      type,
      description,
      metadata,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };
    const logRef = db.collection("activity_logs").doc();
    if (transaction) {
      transaction.set(logRef, logData);
    } else {
      await logRef.set(logData);
    }
  } catch (error) {
    logger.error(`[logActivity Error] User: ${userId}, Type: ${type}`, error);
  }
};

const checkAuthAndGetUserData = async (request, checkAdmin = false) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "인증된 사용자만 함수를 호출할 수 있습니다.");
  }
  const uid = request.auth.uid;
  if (!uid || uid.trim() === "") {
    throw new HttpsError("unauthenticated", "유효한 사용자 ID를 찾을 수 없습니다.");
  }
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
  }
  const userData = userDoc.data();
  const isAdmin = userData.isAdmin || false;
  const isSuperAdmin = userData.isSuperAdmin || false;
  if (checkAdmin && !isAdmin && !isSuperAdmin) {
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  }
  return {uid, classCode: userData.classCode, isAdmin, isSuperAdmin, userData};
};

// ===================================================================================
// 🔥 스케줄러 함수 구현
// ===================================================================================

const _updateCentralStockMarket = async () => {};
const _autoManageStocks = async () => {};
const _aggregateActivityStats = async () => {};
const _createCentralMarketNews = async () => {};
const _cleanupExpiredCentralNews = async () => {};
const _syncCentralNewsToClasses = async () => {};
const _cleanupExpiredClassNews = async () => {};

const resetTasksForClass = async (classCode) => {
  if (!classCode) {
    logger.error("resetTasksForClass: 학급 코드가 제공되지 않았습니다.");
    return { userCount: 0, jobCount: 0 };
  }
  try {
    const batch = db.batch();
    let userCount = 0;
    let jobCount = 0;

    const usersQuery = db.collection("users").where("classCode", "==", classCode);
    const usersSnapshot = await usersQuery.get();
    if (!usersSnapshot.empty) {
      usersSnapshot.forEach((userDoc) => {
        batch.update(userDoc.ref, { completedTasks: {} });
        userCount++;
      });
    }

    const jobsSnapshot = await db.collection("jobs").get();
    if (!jobsSnapshot.empty) {
      jobsSnapshot.docs.forEach((jobDoc) => {
        if (jobDoc.data().classCode === classCode) {
          const jobData = jobDoc.data();
          if (jobData.tasks && jobData.tasks.some(t => (t.clicks || 0) > 0)) {
            const updatedTasks = jobData.tasks.map(t => ({ ...t, clicks: 0 }));
            batch.update(jobDoc.ref, { tasks: updatedTasks });
            jobCount++;
          }
        }
      });
    }
    
    await batch.commit();
    logger.info(`[${classCode}] 리셋 완료: ${userCount}명 학생, ${jobCount}개 직업.`);
    return { userCount, jobCount };
  } catch (error) {
    logger.error(`[${classCode}] 할일 리셋 중 심각한 오류:`, error);
    throw error;
  }
};

const _resetDailyTasks = async () => {
  logger.info("🔄 일일 할일 리셋 시작");
  try {
    const classCodesDoc = await db.collection("settings").doc("classCodes").get();
    if (!classCodesDoc.exists) {
      logger.warn("'settings/classCodes' 문서가 없어 클래스 목록을 가져올 수 없습니다.");
      return;
    }
    const classCodes = classCodesDoc.data().validCodes;
    if (!classCodes || classCodes.length === 0) {
      logger.info("리셋할 클래스가 없습니다.");
      return;
    }
    const resetPromises = classCodes.map((classCode) => resetTasksForClass(classCode));
    const results = await Promise.all(resetPromises);
    let totalUserCount = 0;
    let totalJobCount = 0;
    results.forEach(result => {
      totalUserCount += result.userCount;
      totalJobCount += result.jobCount;
    });
    logger.info(`✅ 일일 할일 리셋 완료: ${classCodes.length}개 클래스, 총 ${totalUserCount}명 학생 및 ${totalJobCount}개 직업 리셋`);
  } catch (error) {
    logger.error("🚨 일일 할일 리셋 중 오류 발생:", error);
  }
};

exports.runScheduler = onRequest({region: "asia-northeast3"}, async (req, res) => {
  const tasks = req.body.tasks;
  if (!tasks || !Array.isArray(tasks)) {
    return res.status(400).send("Bad Request");
  }
  for (const task of tasks) {
    try {
      switch (task) {
        case "resetDailyTasks":
          await _resetDailyTasks();
          break;
      }
    } catch (error) {
      logger.error(`🚨 작업 '${task}' 실행 중 오류 발생:`, error);
    }
  }
  res.status(200).send({ message: "스케줄러 실행 완료" });
});

exports.completeTask = onCall({region: "asia-northeast3"}, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const { taskId, jobId = null, isJobTask = false } = request.data;
  if (!taskId) {
    throw new HttpsError("invalid-argument", "할일 ID가 필요합니다.");
  }
  const userRef = db.collection("users").doc(uid);
  try {
    let taskReward = 0;
    let taskName = "";
    if (isJobTask && jobId) {
      const jobRef = db.collection("jobs").doc(jobId);
      await db.runTransaction(async (transaction) => {
        const jobDoc = await transaction.get(jobRef);
        if (!jobDoc.exists) throw new Error("직업을 찾을 수 없습니다.");
        const jobData = jobDoc.data();
        const jobTasks = jobData.tasks || [];
        const taskIndex = jobTasks.findIndex((t) => t.id === taskId);
        if (taskIndex === -1) throw new Error("직업 할일을 찾을 수 없습니다.");
        const task = jobTasks[taskIndex];
        taskName = task.name;
        taskReward = task.reward || 0;
        const currentClicks = task.clicks || 0;
        if (currentClicks >= task.maxClicks) {
          throw new Error(`${taskName} 할일은 오늘 이미 최대 완료했습니다.`);
        }
        const updatedTasks = [...jobTasks];
        updatedTasks[taskIndex] = { ...task, clicks: currentClicks + 1 };
        transaction.update(jobRef, { tasks: updatedTasks });
        if (taskReward > 0) {
          transaction.update(userRef, {
            coupons: admin.firestore.FieldValue.increment(taskReward),
          });
        }
      });
    } else {
      const commonTaskRef = db.collection("commonTasks").doc(taskId);
      await db.runTransaction(async (transaction) => {
        const commonTaskDoc = await transaction.get(commonTaskRef);
        if (!commonTaskDoc.exists) throw new Error("공통 할일을 찾을 수 없습니다.");
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new Error("사용자 정보를 찾을 수 없습니다.");
        const taskData = commonTaskDoc.data();
        taskName = taskData.name;
        taskReward = taskData.reward || 0;
        const userData = userDoc.data();
        const completedTasks = userData.completedTasks || {};
        const currentClicks = completedTasks[taskId] || 0;
        if (currentClicks >= taskData.maxClicks) {
          throw new Error(`${taskName} 할일은 오늘 이미 최대 완료했습니다.`);
        }
        const updateData = {
          [`completedTasks.${taskId}`]: admin.firestore.FieldValue.increment(1),
        };
        if (taskReward > 0) {
          updateData.coupons = admin.firestore.FieldValue.increment(taskReward);
        }
        transaction.update(userRef, updateData);
      });
    }
    if (taskReward > 0) {
      try {
        await logActivity(null, uid, LOG_TYPES.COUPON_EARN, `'${taskName}' 할일 완료로 쿠폰 ${taskReward}개를 획득했습니다.`, { taskName, reward: taskReward, taskId, isJobTask, jobId: jobId || null });
      } catch (logError) {
        logger.warn(`[completeTask] 활동 로그 기록 실패:`, logError);
      }
    }
    const updatedUserDoc = await userRef.get();
    const updatedUserData = updatedUserDoc.data();
    return {
      success: true,
      message: `'${taskName}' 완료! ${taskReward > 0 ? `+${taskReward} 쿠폰!` : ""}`,
      taskName: taskName,
      reward: taskReward,
      updatedCash: updatedUserData.cash || 0,
      updatedCoupons: updatedUserData.coupons || 0,
    };
  } catch (error) {
    logger.error(`[completeTask] User: ${uid}, Task: ${taskId}, Error:`, error);
    throw new HttpsError("aborted", error.message || "할일 완료 처리 중 오류가 발생했습니다.");
  }
});

exports.manualResetClassTasks = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request, true);
  const {classCode} = request.data;
  if (!classCode) throw new HttpsError("invalid-argument", "유효한 classCode가 필요합니다.");
  logger.info(`[수동 리셋] 관리자(UID: ${uid})가 클래스 '${classCode}'의 할일을 수동 리셋합니다.`);
  try {
    const result = await resetTasksForClass(classCode);
    const message = `클래스 '${classCode}'의 ${result.userCount}명 학생 및 ${result.jobCount}개 직업의 할일이 리셋되었습니다.`;
    logger.info(`[수동 리셋] ${message}`);
    return {success: true, message, updatedCount: result.userCount};
  } catch (error) {
    logger.error(`[수동 리셋] 클래스 '${classCode}' 리셋 중 오류:`, error);
    throw new HttpsError("internal", `할일 리셋 실패: ${error.message}`);
  }
});

exports.donateCoupon = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, userData, classCode} = await checkAuthAndGetUserData(request);
  const {amount, message} = request.data;
  if (!classCode) {
    throw new HttpsError("failed-precondition", "사용자에게 학급 코드가 할당되지 않았습니다. 프로필을 확인하거나 관리자에게 문의해주세요.");
  }
  if (!amount || amount <= 0) {
    throw new HttpsError("invalid-argument", "유효한 쿠폰 수량을 입력해야 합니다.");
  }
  const userRef = db.collection("users").doc(uid);
  const goalRef = db.collection("goals").doc(`${classCode}_goal`);
  try {
    await db.runTransaction(async (transaction) => {
      const [userDoc, goalDoc] = await transaction.getAll(userRef, goalRef);
      if (!userDoc.exists) {
        throw new Error("사용자 정보가 없습니다.");
      }
      const currentCoupons = userDoc.data().coupons || 0;
      if (currentCoupons < amount) {
        throw new Error("보유한 쿠폰이 부족합니다.");
      }
      transaction.set(userRef, {
        coupons: admin.firestore.FieldValue.increment(-amount),
        myContribution: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      const newDonation = {
        id: db.collection("goals").doc().id,
        userId: uid,
        userName: userData.name || "알 수 없는 사용자",
        amount: amount,
        message: message || "",
        timestamp: admin.firestore.Timestamp.now(),
        classCode: classCode,
      };
      if (goalDoc.exists) {
        transaction.update(goalRef, {
          progress: admin.firestore.FieldValue.increment(amount),
          donations: admin.firestore.FieldValue.arrayUnion(newDonation),
          donationCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.set(goalRef, {
          progress: amount,
          donations: [newDonation],
          donationCount: 1,
          targetAmount: 1000,
          classCode: classCode,
          title: `${classCode} 학급 목표`,
          description: `${classCode} 학급의 쿠폰 목표입니다.`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: uid,
        });
      }
      logActivity(transaction, uid, LOG_TYPES.COUPON_USE, `학급 목표에 쿠폰 ${amount}개를 기부했습니다.`, {amount, message, type: "donation"});
      logActivity(transaction, uid, LOG_TYPES.COUPON_DONATE, `쿠폰 ${amount}개를 기부했습니다. 메시지: ${message || "없음"}`, {amount, message});
    });
    return {success: true, message: "쿠폰 기부가 완료되었습니다."};
  } catch (error) {
    logger.error(`[donateCoupon] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "쿠폰 기부에 실패했습니다.");
  }
});

exports.sellCoupon = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request);
  const {amount} = request.data;
  if (!amount || amount <= 0) {
    throw new HttpsError("invalid-argument", "유효한 쿠폰 수량을 입력해야 합니다.");
  }
  const userRef = db.collection("users").doc(uid);
  const mainSettingsRef = db.collection("settings").doc("mainSettings");
  try {
    await db.runTransaction(async (transaction) => {
      const [userDoc, settingsDoc] = await transaction.getAll(userRef, mainSettingsRef);
      if (!userDoc.exists) throw new Error("사용자 정보가 없습니다.");
      const currentCoupons = userDoc.data().coupons || 0;
      if (currentCoupons < amount) throw new Error("보유한 쿠폰이 부족합니다.");
      const couponValue = settingsDoc.exists ? settingsDoc.data().couponValue : 1000;
      const cashGained = amount * couponValue;
      transaction.update(userRef, {
        coupons: admin.firestore.FieldValue.increment(-amount),
        cash: admin.firestore.FieldValue.increment(cashGained),
      });
      logActivity(transaction, uid, LOG_TYPES.COUPON_SELL, `쿠폰 ${amount}개를 ${cashGained.toLocaleString()}원에 판매했습니다.`, { amount, couponValue, cashGained });
    });
    return {success: true, message: "쿠폰 판매가 완료되었습니다."};
  } catch (error) {
    logger.error(`[sellCoupon] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "쿠폰 판매에 실패했습니다.");
  }
});

exports.giftCoupon = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid, userData} = await checkAuthAndGetUserData(request);
  const {recipientId, amount, message} = request.data;
  if (!recipientId || !amount || amount <= 0) {
    throw new HttpsError("invalid-argument", "받는 사람과 쿠폰 수량을 정확히 입력해야 합니다.");
  }
  if (uid === recipientId) {
    throw new HttpsError("invalid-argument", "자기 자신에게는 쿠폰을 선물할 수 없습니다.");
  }
  const senderRef = db.collection("users").doc(uid);
  const recipientRef = db.collection("users").doc(recipientId);
  try {
    await db.runTransaction(async (transaction) => {
      const [senderDoc, recipientDoc] = await transaction.getAll(senderRef, recipientRef);
      if (!senderDoc.exists) throw new Error("보내는 사람의 정보가 없습니다.");
      if (!recipientDoc.exists) throw new Error("받는 사람의 정보가 없습니다.");
      const senderCoupons = senderDoc.data().coupons || 0;
      if (senderCoupons < amount) throw new Error("보유한 쿠폰이 부족합니다.");
      transaction.update(senderRef, {coupons: admin.firestore.FieldValue.increment(-amount)});
      transaction.update(recipientRef, {coupons: admin.firestore.FieldValue.increment(amount)});
      const recipientData = recipientDoc.data();
      logActivity(transaction, uid, LOG_TYPES.COUPON_TRANSFER_SEND, `${recipientData.name}님에게 쿠폰 ${amount}개를 선물했습니다.`, {recipientId, recipientName: recipientData.name, amount, message});
      logActivity(transaction, recipientId, LOG_TYPES.COUPON_TRANSFER_RECEIVE, `${userData.name}님으로부터 쿠폰 ${amount}개를 선물 받았습니다.`, {senderId: uid, senderName: userData.name, amount, message});
    });
    return {success: true, message: "쿠폰 선물이 완료되었습니다."};
  } catch (error) {
    logger.error(`[giftCoupon] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "쿠폰 선물에 실패했습니다.");
  }
});