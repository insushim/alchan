// src/firebase.js - 데이터 사용량 최적화 및 Firestore 초기화 방식 수정 버전 + getClassmates 함수 추가 + Firebase Functions 추가

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  runTransaction,
  query as originalFirebaseQuery,
  where as originalFirebaseWhere,
  addDoc as originalFirebaseAddDoc,
  connectFirestoreEmulator,
  Timestamp,
  onSnapshot,
  orderBy,
  // ⭐️ [수정] Firestore 초기화 방식 변경
  initializeFirestore,
  persistentLocalCache,
  // enableIndexedDbPersistence, // 더 이상 사용하지 않음
  getDocFromCache,
  getDocsFromCache,
  enableNetwork,
  disableNetwork,
  setLogLevel,
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword as fbSignInInternal,
  signOut as fbSignOutInternal,
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPasswordInternal,
  updateProfile,
  connectAuthEmulator,
  updatePassword,
  deleteUser,
} from "firebase/auth";
import { getStorage } from "firebase/storage";
// 👇 [수정] httpsCallable import 추가
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions"; 

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

console.log("[firebase.js] Firebase 앱 초기화 시작...");
const app = initializeApp(firebaseConfig);

// ⭐️ [수정] Firestore 초기화 방식 변경 (경고 해결)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache(/*{ tabManager: 'primary' }*/)
});

// Firestore 로그 레벨 설정 (WebChannel 오류 숨기기)
setLogLevel('error'); // 'debug', 'error', 'silent' 중 선택

const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'asia-northeast3');
console.log("[firebase.js] Firebase 앱 초기화 완료");

// 로컬 개발 환경일 때 에뮬레이터에 연결
// ⚠️ 에뮬레이터 비활성화: 로컬에서도 배포 서버 사용
if (false && window.location.hostname === 'localhost') {
  console.log('[firebase.js] 로컬 개발 환경: 에뮬레이터에 연결합니다...');
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFunctionsEmulator(functions, 'localhost', 5001);
    console.log('[firebase.js] 로컬 에뮬레이터 연결 성공.');
  } catch (error) {
    console.error('[firebase.js] 에뮬레이터 연결 오류:', error);
  }
}

// 🔥 [최적화] 강화된 인메모리 캐시 - TTL 연장 및 용량 관리
const cache = new Map();
const CACHE_TTL = 20 * 60 * 1000; // 20분으로 연장
const MAX_CACHE_SIZE = 200; // 최대 캐시 항목 수

const setCache = (key, data) => {
  // 캐시 용량 관리
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
    console.log(`[Cache] SIZE_LIMIT: Removed oldest ${oldestKey}`);
  }
  
  const expiry = Date.now() + CACHE_TTL;
  cache.set(key, { data, expiry, lastAccessed: Date.now() });
  console.log(`[Cache] SET: ${key} (TTL: ${CACHE_TTL/1000/60}분)`);
};

const getCache = (key) => {
  const cachedItem = cache.get(key);
  if (!cachedItem) {
    console.log(`[Cache] MISS: ${key}`);
    return null;
  }

  if (Date.now() > cachedItem.expiry) {
    console.log(`[Cache] EXPIRED: ${key}`);
    cache.delete(key);
    return null;
  }

  // 액세스 시간 업데이트 (LRU)
  cachedItem.lastAccessed = Date.now();
  console.log(`[Cache] HIT: ${key}`);
  return cachedItem.data;
};

const invalidateCache = (key) => {
    if (cache.has(key)) {
        cache.delete(key);
        console.log(`[Cache] INVALIDATED: ${key}`);
    }
};

// 🔥 [최적화] 패턴별 캐시 무효화
const invalidateCachePattern = (pattern) => {
  const keysToDelete = [];
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => {
    cache.delete(key);
    console.log(`[Cache] PATTERN_INVALIDATED: ${key}`);
  });
};

// 🔥 [최적화] 배치 캐시 설정
const setBatchCache = (dataMap) => {
  Object.entries(dataMap).forEach(([key, data]) => {
    setCache(key, data);
  });
};

const isInitialized = () => {
  const initialized = Boolean(app && db && auth);
  if (!initialized) {
    console.warn(
      "[firebase.js] Firebase 서비스가 아직 초기화되지 않았습니다.",
      {
        app: !!app,
        db: !!db,
        auth: !!auth,
      }
    );
  }
  return initialized;
};

// =================================================================
// 🔥 [최적화] 캐시 우선 CRUD 함수들
// =================================================================

export const addData = (collectionName, data) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  
  // 캐시 무효화
  invalidateCachePattern(collectionName);
  
  const dataWithTimestamp = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  return originalFirebaseAddDoc(collection(db, collectionName), dataWithTimestamp);
};

export const updateData = (collectionName, docId, updates) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  
  // 관련 캐시 무효화
  if (collectionName === 'users') {
      invalidateCache(`user_${docId}`);
      invalidateCache('users_all');
      invalidateCachePattern(`classmates_`); // 학급 구성원 캐시도 무효화
  }
  if (collectionName === 'governmentSettings') {
      invalidateCache(`gov_settings_${docId}`);
  }
  invalidateCachePattern(collectionName);

  const docRef = doc(db, collectionName, docId);
  const dataWithTimestamp = {
    ...updates,
    updatedAt: serverTimestamp(),
  };
  return updateDoc(docRef, dataWithTimestamp);
};

export const deleteData = (collectionName, docId) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  
  // 관련 캐시 무효화
  if (collectionName === 'users') {
      invalidateCache(`user_${docId}`);
      invalidateCache('users_all');
      invalidateCachePattern(`classmates_`); // 학급 구성원 캐시도 무효화
  }
  invalidateCachePattern(collectionName);
  
  const docRef = doc(db, collectionName, docId);
  return deleteDoc(docRef);
};

// 🔥 [최적화] 캐시 우선 컬렉션 조회
export const fetchCollectionOnce = async (collectionName, useCache = true) => {
    if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
    
    const cacheKey = `collection_${collectionName}`;
    
    if (useCache) {
      const cached = getCache(cacheKey);
      if (cached) return cached;
    }
    
    try {
      // 🔥 [최적화] 캐시에서 먼저 시도
      const querySnapshot = await getDocs(collection(db, collectionName));
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (useCache) {
        setCache(cacheKey, data);
      }
      
      console.log(`[firebase.js] ${collectionName} 컬렉션 조회: ${data.length}개 (DB)`);
      return data;
    } catch (error) {
      console.error(`[firebase.js] ${collectionName} 컬렉션 조회 오류:`, error);
      throw error;
    }
};

// 🔥 [최적화] 조건부 실시간 구독 - 중요한 데이터만
export const subscribeToCollection = (collectionName, callback, conditions = []) => {
  if (!db) {
    console.error("Firestore가 초기화되지 않아 구독할 수 없습니다.");
    return () => {};
  }
  
  console.warn(`[비용 경고] ${collectionName} 컬렉션에 대한 실시간 구독을 시작합니다. 이 작업은 많은 읽기 비용을 발생시킬 수 있습니다.`);
  
  let q = originalFirebaseQuery(collection(db, collectionName));
  
  // 조건 추가
  conditions.forEach(condition => {
    q = originalFirebaseQuery(q, condition);
  });
  
  const unsubscribe = onSnapshot(q, 
    {
      // 🔥 [최적화] 캐시 우선 정책
      source: 'default'
    },
    (querySnapshot) => {
      const data = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      
      // 캐시 업데이트
      setCache(`collection_${collectionName}`, data);
      
      console.log(`[firebase.js] ${collectionName} 실시간 업데이트: ${data.length}개`);
      callback(data);
    },
    (error) => {
      console.error(`[firebase.js] ${collectionName} 구독 오류:`, error);
      callback([]);
    }
  );
  
  return unsubscribe;
};

// ⭐️ [신규 추가] 학급 구성원 조회 함수 - 핵심 누락 함수 구현
export const getClassmates = async (classCode, forceRefresh = false) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode || classCode === '미지정') {
    console.warn("[firebase.js] getClassmates: 유효하지 않은 학급 코드");
    return [];
  }

  const cacheKey = `classmates_${classCode}`;
  
  // 강제 새로고침이 아닐 때만 캐시 확인
  if (!forceRefresh) {
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[firebase.js] 학급 구성원 캐시 조회 (${classCode}): ${cached.length}명`);
      return cached;
    }
  }

  try {
    console.log(`[firebase.js] 학급 구성원 서버 조회 시작 (${classCode}), forceRefresh: ${forceRefresh}`);
    
    const usersRef = collection(db, "users");
    const q = originalFirebaseQuery(
      usersRef,
      originalFirebaseWhere("classCode", "==", classCode)
    );
    
    const querySnapshot = await getDocs(q);
    const classMembers = querySnapshot.docs.map(doc => ({
      id: doc.id,
      uid: doc.id, // AuthContext에서 uid도 사용하므로 추가
      ...doc.data()
    }));
    
    // 캐시에 저장 (강제 새로고침 시에도 저장)
    setCache(cacheKey, classMembers);
    
    console.log(`[firebase.js] 학급 구성원 조회 완료 (${classCode}): ${classMembers.length}명`);
    return classMembers;
    
  } catch (error) {
    console.error(`[firebase.js] 학급 구성원 조회 오류 (${classCode}):`, error);
    throw error;
  }
};

// 활동 기록을 위한 함수
export const addActivityLog = async (userId, type, description) => {
    if (!db || !userId) {
        console.error("활동 로그 기록 실패: 필수 정보 부족(db, userId)", { userId, type, description });
        return;
    }

    try {
        const userDoc = await getUserDocument(userId);
        if (!userDoc) {
            console.error(`활동 로그 기록 실패: 사용자 문서(${userId})를 찾을 수 없습니다.`);
            return;
        }

        // ⭐️ [수정] 로그 기록 시 classCode가 없는 경우를 방지하여 로그가 누락되지 않도록 함
        if (!userDoc.classCode || userDoc.classCode === '미지정') {
            console.warn(`[Activity Log] 사용자(${userId}, ${userDoc.name})의 classCode가 유효하지 않아 로그 기록을 건너뜁니다: "${description}"`);
            return;
        }

        const logsCollectionRef = collection(db, "activity_logs");
        await originalFirebaseAddDoc(logsCollectionRef, {
            type: type,
            description: description,
            userId: userId,
            userName: userDoc.name || userDoc.nickname || "N/A",
            classCode: userDoc.classCode,
            timestamp: serverTimestamp(),
        });
        console.log(`[Activity Log] 기록 완료: [${type}] ${description}`);
    } catch (error) {
        console.error("활동 로그 기록 중 오류 발생:", error);
    }
};

export const addTransaction = async (userId, amount, description) => {
  if (!db || !userId) {
    console.error("거래 기록 실패: 필수 정보 부족 (db, userId)");
    return false;
  }
  try {
    const txCollectionRef = collection(db, "users", userId, "transactions");
    await originalFirebaseAddDoc(txCollectionRef, {
      amount: amount,
      description: description,
      timestamp: serverTimestamp(),
    });
    console.log(`[Transaction] 사용자(${userId}) 거래 기록 완료: ${description} (${amount})`);
    return true;
  } catch (error) {
    console.error(`[Transaction] 사용자(${userId}) 거래 기록 중 오류 발생:`, error);
    return false;
  }
};

const authStateListener = (callback) => {
  if (!auth) {
    console.error("[firebase.js] Auth 서비스가 초기화되지 않았습니다.");
    setTimeout(() => callback(null), 0);
    return () => {};
  }
  console.log("[firebase.js] Auth 상태 리스너 등록");
  return onAuthStateChanged(auth, (user) => {
    console.log(
      "[firebase.js] Auth 상태 변경:",
      user ? `로그인됨 (${user.uid})` : "로그아웃됨"
    );
    callback(user);
  });
};

const signInWithEmailAndPassword = async (authInstance, email, password) => {
  if (!authInstance) throw new Error("Auth 서비스가 초기화되지 않았습니다.");
  if (typeof email !== "string")
    throw new Error("이메일 형식이 올바르지 않습니다.");
  return fbSignInInternal(authInstance, email, password);
};

const signOut = async () => {
  if (!auth) throw new Error("Auth 서비스가 초기화되지 않았습니다.");
  
  // 🔥 [최적화] 로그아웃 시 사용자 관련 캐시 모두 정리
  invalidateCachePattern('user_');
  invalidateCache('users_all');
  invalidateCachePattern('classmates_');
  
  return fbSignOutInternal(auth);
};

const registerWithEmailAndPassword = async (authInstance, email, password) => {
  if (!authInstance) throw new Error("Auth 서비스가 초기화되지 않았습니다.");
  if (typeof email !== "string")
    throw new Error("이메일 형식이 올바르지 않습니다.");
  return fbCreateUserWithEmailAndPasswordInternal(
    authInstance,
    email,
    password
  );
};

const updateUserProfile = async (user, displayName) => {
  if (!user) throw new Error("사용자 객체가 없습니다.");
  return updateProfile(user, { displayName });
};

// 🔥 [최적화] 캐시 우선 사용자 문서 조회
const getUserDocument = async (userId, forceRefresh = false) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId) return null;

  const cacheKey = `user_${userId}`;
  
  if (!forceRefresh) {
    const cachedUser = getCache(cacheKey);
    if (cachedUser) {
      return cachedUser;
    }
  }

  try {
    const userRef = doc(db, "users", userId);
    
    // 🔥 [최적화] 캐시에서 먼저 시도
    let userSnap;
    try {
      userSnap = await getDocFromCache(userRef);
      console.log(`[firebase.js] getUserDocument(${userId}) - 캐시에서 조회`);
    } catch (cacheError) {
      // 캐시에 없으면 서버에서 조회
      userSnap = await getDoc(userRef);
      console.log(`[firebase.js] getUserDocument(${userId}) - 서버에서 조회`);
    }
    
    const result = userSnap.exists()
      ? { id: userSnap.id, ...userSnap.data() }
      : null;

    if (result) {
      setCache(cacheKey, result);
    }

    return result;
  } catch (error) {
    console.error(`[firebase.js] getUserDocument(${userId}) 오류:`, error);
    throw error;
  }
};

const addUserDocument = async (userId, userData) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId || !userData)
    throw new Error("사용자 ID 또는 데이터가 유효하지 않습니다.");

  try {
    const cleanedUserData = { ...userData };
    Object.keys(cleanedUserData).forEach(
      (key) => cleanedUserData[key] === undefined && delete cleanedUserData[key]
    );

    const userRef = doc(db, "users", userId);
    await setDoc(userRef, {
      ...cleanedUserData,
      createdAt: cleanedUserData.createdAt || serverTimestamp(),
      updatedAt: cleanedUserData.updatedAt || serverTimestamp(),
    });
    
    console.log(`[firebase.js] 사용자 문서 추가 성공: ${userId}`);
    
    // 🔥 [최적화] 새 사용자 추가 시 관련 캐시 무효화
    invalidateCache(`user_${userId}`);
    invalidateCache('users_all');
    if (cleanedUserData.classCode) {
      invalidateCache(`classmates_${cleanedUserData.classCode}`);
    }
    
    await addActivityLog(userId, '시스템', '신규 사용자 계정이 생성되었습니다.');
    return true;
  } catch (error) {
    console.error(`[firebase.js] 사용자 문서 추가 실패: ${userId}`, error);
    throw error;
  }
};

const updateUserDocument = async (userId, updates, maxRetries = 3) => {
  if (!db) {
    console.error(
      "[firebase.js] updateUserDocument: Firestore가 초기화되지 않았습니다."
    );
    throw new Error("Firestore가 초기화되지 않았습니다.");
  }

  if (!userId || !updates || Object.keys(updates).length === 0) {
    console.warn(
      `[firebase.js] updateUserDocument: 사용자 ID가 없거나 업데이트할 내용이 없습니다. userId: ${userId}, updates:`,
      updates
    );
    return false;
  }

  // 🔥 [최적화] 사용자 문서 업데이트 시 캐시를 무효화
  invalidateCache(`user_${userId}`);
  invalidateCache('users_all');
  
  // 학급 코드 변경 시 관련 캐시도 무효화
  if (updates.classCode) {
    invalidateCachePattern('classmates_');
  }

  console.log(
    `[firebase.js] updateUserDocument 시작: userId=${userId}`,
    updates
  );

  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    attempt++;
    console.log(
      `[firebase.js] updateUserDocument 시도 ${attempt}/${maxRetries}`
    );

    try {
      const cleanedUpdates = { ...updates };
      Object.keys(cleanedUpdates).forEach(
        (key) => cleanedUpdates[key] === undefined && delete cleanedUpdates[key]
      );

      if (Object.keys(cleanedUpdates).length === 0) {
        console.warn(
          `[firebase.js] updateUserDocument: 모든 업데이트 필드가 undefined여서 실제 업데이트는 수행되지 않았습니다. (userId: ${userId})`
        );
        return false;
      }

      const userRef = doc(db, "users", userId);
      const finalUpdates = { ...cleanedUpdates, updatedAt: serverTimestamp() };

      console.log(
        `[firebase.js] Firestore updateDoc 호출 중... (시도 ${attempt})`,
        finalUpdates
      );

      const updatePromise = updateDoc(userRef, finalUpdates);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("업데이트 타임아웃 (10초)")), 10000)
      );

      try {
        await Promise.race([updatePromise, timeoutPromise]);
      } catch (error) {
        // Firestore 연결 오류 상세 로깅
        console.error(`[firebase.js] Firestore 업데이트 오류 (시도 ${attempt}):`, error);

        if (error.code === 'unavailable') {
          throw new Error("서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.");
        } else if (error.code === 'permission-denied') {
          throw new Error("권한이 없습니다. 다시 로그인해주세요.");
        } else if (error.code === 'unauthenticated') {
          throw new Error("인증이 만료되었습니다. 다시 로그인해주세요.");
        } else if (error.message.includes('timeout') || error.message.includes('타임아웃')) {
          throw new Error("요청 시간이 초과되었습니다. 다시 시도해주세요.");
        }

        throw error;
      }

      console.log(
        `[firebase.js] 사용자 문서 업데이트 성공: ${userId} (시도 ${attempt})`
      );
      
      // Log specific updates
      if (updates.name || updates.nickname) {
          await addActivityLog(userId, '프로필 변경', `프로필 정보가 업데이트되었습니다.`);
      }

      return true;
    } catch (error) {
      lastError = error;
      console.error(
        `[firebase.js] updateUserDocument 실패 (시도 ${attempt}/${maxRetries}): ${userId}`,
        error
      );

      const retryableErrors = [
        "unavailable",
        "deadline-exceeded",
        "aborted",
        "internal",
        "resource-exhausted",
        "업데이트 타임아웃",
      ];

      const isRetryableError = retryableErrors.some(
        (retryableError) =>
          error.code === retryableError ||
          error.message.includes(retryableError)
      );

      if (!isRetryableError) {
        console.error(
          `[firebase.js] 재시도 불가능한 오류: ${error.code || error.message}`
        );
        break;
      }

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * attempt, 5000);
        console.log(`[firebase.js] ${delay}ms 후 재시도...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(
    `[firebase.js] updateUserDocument 최종 실패 (${maxRetries}번 시도 후): ${userId}`
  );
  throw lastError || new Error("알 수 없는 오류로 업데이트 실패");
};

const deleteUserDocument = async (userId) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId) {
    console.error("[firebase.js] deleteUserDocument: 사용자 ID가 필요합니다.");
    return Promise.reject(new Error("사용자 ID가 필요합니다."));
  }
  
  // 🔥 [최적화] 사용자 문서 삭제 시 캐시도 함께 삭제
  invalidateCache(`user_${userId}`);
  invalidateCache('users_all');
  invalidateCachePattern('classmates_');
  
  console.log(`[firebase.js] 사용자 문서 삭제 시도: ${userId}`);
  
  await addActivityLog(userId, '계정 삭제', '사용자 계정 및 데이터가 삭제되었습니다.');
  const userDocRef = doc(db, "users", userId);
  return deleteDoc(userDocRef);
};

// 🔥 [최적화] 배치 조회로 성능 향상
const getAllUsersDocuments = async (useCache = true) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  
  const cacheKey = 'users_all';
  
  if (useCache) {
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[firebase.js] getAllUsersDocuments: 캐시에서 ${cached.length}명 조회`);
      return cached;
    }
  }
  
  try {
    const usersCollectionRef = collection(db, "users");
    
    // 🔥 [최적화] 캐시에서 먼저 시도
    let usersSnapshot;
    try {
      usersSnapshot = await getDocsFromCache(usersCollectionRef);
      console.log(`[firebase.js] getAllUsersDocuments: 캐시에서 조회`);
    } catch (cacheError) {
      usersSnapshot = await getDocs(usersCollectionRef);
      console.log(`[firebase.js] getAllUsersDocuments: 서버에서 조회`);
    }
    
    const result = usersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    if (useCache) {
      setCache(cacheKey, result);
    }
    
    console.log(`[firebase.js] getAllUsersDocuments: ${result.length}명 조회`);
    return result;
  } catch (error) {
    console.error("[firebase.js] getAllUsersDocuments 오류:", error);
    throw error;
  }
};

// 🔥 [최적화] 현금 업데이트 함수 - 로그 정보 통합
const updateUserCashInFirestore = async (userId, amount, logMessage = '', senderInfo = null, receiverInfo = null, allowNegative = false) => {
  if (!db) throw new Error("[firebase.js] Firestore가 초기화되지 않았습니다.");
  if (!userId) throw new Error("[firebase.js] 사용자 ID가 유효하지 않습니다.");
  if (typeof amount !== "number")
    throw new Error("[firebase.js] 현금 변경액은 숫자여야 합니다.");

  // 🔥 [최적화] 현금 정보는 자주 바뀌므로, 트랜잭션 성공 후 캐시를 바로 무효화
  invalidateCache(`user_${userId}`);

  const userRef = doc(db, "users", userId);
  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error(
          `[firebase.js] 사용자 문서(ID: ${userId})를 찾을 수 없습니다.`
        );
      }
      const currentCash = userSnap.data().cash || 0;
      if (!allowNegative && amount < 0 && currentCash + amount < 0) {
        throw new Error(
          `[firebase.js] 잔액이 부족합니다. (현재: ${currentCash}, 변경 요청: ${amount})`
        );
      }
      transaction.update(userRef, {
        cash: increment(amount),
        updatedAt: serverTimestamp(),
      });
    });

    // 개선된 로그 메시지 생성
    let activityLogMessage = logMessage;
    let logType = amount > 0 ? '현금 입금' : '현금 출금';

    if (senderInfo && receiverInfo) {
      if (amount > 0) {
        logType = '송금 수신';
        activityLogMessage = `${senderInfo.name}님으로부터 ${amount}원을 받았습니다.${senderInfo.message ? ` 메시지: "${senderInfo.message}"` : ''}`;
      } else {
        logType = '송금';
        activityLogMessage = `${receiverInfo.name}님에게 ${Math.abs(amount)}원을 송금했습니다.${senderInfo.message ? ` 메시지: "${senderInfo.message}"` : ''}`;
      }
    } else if (senderInfo && amount > 0) {
      logType = '현금 입금';
      if (senderInfo.isAdmin) {
        activityLogMessage = `관리자 ${senderInfo.name}가 ${amount}원을 입금했습니다.${senderInfo.reason ? ` 사유: ${senderInfo.reason}` : ''}`;
      } else {
        activityLogMessage = `${senderInfo.name || '시스템'}에서 ${amount}원을 입금받았습니다.`;
      }
    } else if (receiverInfo && amount < 0) {
      logType = '현금 출금';
      if (receiverInfo.isAdmin) {
        activityLogMessage = `관리자 ${receiverInfo.name}가 ${Math.abs(amount)}원을 출금했습니다.${receiverInfo.reason ? ` 사유: ${receiverInfo.reason}` : ''}`;
      } else {
        activityLogMessage = `${receiverInfo.name || '외부'}로 ${Math.abs(amount)}원을 출금했습니다.`;
      }
    } else if (logMessage) {
      activityLogMessage = logMessage;
    } else {
      const defaultMessage = `${Math.abs(amount)}원 ${amount > 0 ? '입금' : '출금'} 완료.`;
      activityLogMessage = defaultMessage;
    }

    // 🔥 [최적화] Activity Log를 비동기로 처리 (메인 플로우 블로킹 방지)
    addActivityLog(userId, logType, activityLogMessage).catch(err =>
      console.error('[firebase.js] Activity Log 기록 실패 (무시됨):', err)
    );

    console.log(
      `[firebase.js] 사용자 ${userId} 현금 ${
        amount > 0 ? "+" : ""
      }${amount} 만큼 업데이트 성공.`
    );
    return true;
  } catch (error) {
    console.error(
      `[firebase.js] 사용자 ${userId} 현금 업데이트 트랜잭션 오류:`,
      error
    );
    return false;
  }
};

export const updateUserCouponsInFirestore = async (userId, amount, logMessage) => {
  if (!db) throw new Error("[firebase.js] Firestore가 초기화되지 않았습니다.");
  if (!userId) throw new Error("[firebase.js] 사용자 ID가 유효하지 않습니다.");
  if (typeof amount !== "number") throw new Error("[firebase.js] 쿠폰 변경액은 숫자여야 합니다.");

  // 🔥 [최적화] 쿠폰 정보는 자주 바뀌므로, 트랜잭션 성공 후 캐시를 바로 무효화
  invalidateCache(`user_${userId}`);

  const userRef = doc(db, "users", userId);
  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error(`[firebase.js] 사용자 문서(ID: ${userId})를 찾을 수 없습니다.`);
      }
      const currentCoupons = userSnap.data().coupons || 0;
      if (amount < 0 && currentCoupons + amount < 0) {
        throw new Error(`[firebase.js] 쿠폰이 부족합니다. (현재: ${currentCoupons}, 변경 요청: ${amount})`);
      }
      transaction.update(userRef, {
        coupons: increment(amount),
        updatedAt: serverTimestamp(),
      });
    });

    const logType = amount > 0 ? '획득' : '사용';
    const defaultMessage = `쿠폰 ${Math.abs(amount)}개 ${logType}.`;
    await addActivityLog(userId, `쿠폰 ${logType}`, logMessage || defaultMessage);

    console.log(`[firebase.js] 사용자 ${userId} 쿠폰 ${amount > 0 ? "+" : ""}${amount} 만큼 업데이트 성공.`);
    return true;
  } catch (error) {
    console.error(`[firebase.js] 사용자 ${userId} 쿠폰 업데이트 트랜잭션 오류:`, error);
    return false;
  }
};

// 🔥 [최적화] 송금 함수
export const transferCash = async (senderId, receiverId, amount, message = '', allowNegative = false) => {
  if (!senderId || !receiverId || amount <= 0) {
    throw new Error('유효하지 않은 송금 정보입니다.');
  }

  try {
    // 🔥 [최적화] 배치로 사용자 문서 조회
    const [senderDoc, receiverDoc] = await Promise.all([
      getUserDocument(senderId),
      getUserDocument(receiverId)
    ]);

    if (!allowNegative && (!senderDoc || (senderDoc.cash || 0) < amount)) {
      throw new Error('잔액이 부족합니다.');
    }
    if (!senderDoc) {
      throw new Error('송신자를 찾을 수 없습니다.');
    }
    if (!receiverDoc) {
      throw new Error('수신자를 찾을 수 없습니다.');
    }

    // 🔥 [최적화] 병렬 처리
    await Promise.all([
      updateUserCashInFirestore(
        senderId,
        -amount,
        '',
        { name: senderDoc.name, message },
        { name: receiverDoc.name },
        allowNegative
      ),
      updateUserCashInFirestore(
        receiverId,
        amount,
        '',
        { name: senderDoc.name, message },
        { name: receiverDoc.name },
        false
      )
    ]);

    return { success: true, amount };
  } catch (error) {
    console.error('현금 전송 실패:', error);
    throw error;
  }
};

// ⭐️ [신규] 경찰서 벌금 처리를 위한 트랜잭션 함수 - 수정됨
export const processFineTransaction = async (userId, classCode, amount, reason) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId || !classCode || amount <= 0) {
    throw new Error("벌금 처리를 위한 정보가 유효하지 않습니다.");
  }

  const userRef = doc(db, "users", userId);
  const treasuryRef = doc(db, `classes/${classCode}/treasury/balance`);

  try {
    await runTransaction(db, async (transaction) => {
      // --- 모든 읽기 작업을 먼저 수행 ---
      const userSnap = await transaction.get(userRef);
      const treasurySnap = await transaction.get(treasuryRef);

      // --- 읽은 데이터 기반으로 유효성 검사 ---
      if (!userSnap.exists()) throw new Error("피신고자 정보 없음");

      // 마이너스 잔액 허용 (잔액 부족 체크 제거)
      // const userCash = userSnap.data().cash || 0;
      // if (userCash < amount) throw new Error("피신고자 잔액 부족");

      // --- 모든 쓰기 작업을 나중에 수행 ---
      // 사용자 현금 차감 (마이너스 가능)
      transaction.update(userRef, { cash: increment(-amount) });

      // 국고 잔액 증가
      if (treasurySnap.exists()) {
        transaction.update(treasuryRef, { balance: increment(amount) });
      } else {
        // 국고 문서가 없으면 새로 생성
        transaction.set(treasuryRef, {
            balance: amount,
            createdAt: serverTimestamp(),
            classCode: classCode
        });
      }
    });

    // 🔥 [최적화] 트랜잭션 성공 후 캐시 무효화 및 로그 기록을 병렬 처리
    invalidateCache(`user_${userId}`);

    // 로그 기록은 비동기로 처리 (메인 플로우 블로킹 방지)
    Promise.all([
      addActivityLog(userId, '벌금 납부', reason),
      addTransaction(userId, -amount, reason)
    ]).catch(err => console.error('[Police] 로그 기록 실패 (무시됨):', err));

    console.log(`[Police] 사용자(${userId})에게 벌금 ${amount}원 부과 완료.`);
    return { success: true };
  } catch (error) {
    console.error("[Police] 벌금 처리 트랜잭션 실패:", error);
    throw error; // 오류를 상위로 전파하여 UI에서 처리
  }
};


export const adminDepositCash = async (adminId, targetUserId, amount, reason = '') => {
  try {
    const adminDoc = await getUserDocument(adminId);
    const adminName = adminDoc?.name || '관리자';

    await updateUserCashInFirestore(
      targetUserId,
      amount,
      '',
      { name: adminName, isAdmin: true, reason },
      null
    );

    return { success: true, amount };
  } catch (error) {
    console.error('관리자 입금 실패:', error);
    throw error;
  }
};

export const adminWithdrawCash = async (adminId, targetUserId, amount, reason = '') => {
  try {
    const adminDoc = await getUserDocument(adminId);
    const adminName = adminDoc?.name || '관리자';

    await updateUserCashInFirestore(
      targetUserId,
      -Math.abs(amount),
      '',
      null,
      { name: adminName, isAdmin: true, reason }
    );

    return { success: true, amount: Math.abs(amount) };
  } catch (error) {
    console.error('관리자 출금 실패:', error);
    throw error;
  }
};

export const processStockSaleTransaction = async (userId, classCode, profit, stockName) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (profit <= 0) {
    return { success: true, taxAmount: 0 };
  }

  const nationalTreasuryRef = doc(db, "nationalTreasuries", classCode);

  try {
    const governmentSettings = await getGovernmentSettings(classCode);
    const taxRate = governmentSettings?.taxSettings?.stockTransactionTaxRate || 0;
    const taxAmount = Math.round(profit * taxRate);

    if (taxAmount > 0) {
      await updateDoc(nationalTreasuryRef, {
        totalAmount: increment(taxAmount),
        stockTaxRevenue: increment(taxAmount),
        lastUpdated: serverTimestamp(),
      });
      const logDescription = `${stockName} 주식 판매로 발생한 이익 ${profit}원에 대한 거래세 ${taxAmount}원을 납부했습니다.`;
      await addActivityLog(userId, '세금 납부 (주식)', logDescription);
    }

    console.log(
      `[${classCode}] 주식 거래세 징수 성공: ${taxAmount}원 (이익: ${profit}원)`
    );
    return { success: true, taxAmount };
  } catch (error) {
    console.error(
      `[firebase.js] 주식 거래세 처리 오류 (학급: ${classCode}):`,
      error
    );
    throw error;
  }
};

// 🔥 [최적화] 범용 판매 거래 처리 - 배치 처리 및 캐시 관리 개선
export const processGenericSaleTransaction = async (
  classCode,
  buyerId,
  sellerId,
  transactionPrice,
  taxType,
  inventoryUpdate = null
) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");

  // 🔥 [최적화] 거래 참여자의 캐시를 미리 무효화
  invalidateCache(`user_${buyerId}`);
  invalidateCache(`user_${sellerId}`);

  const nationalTreasuryRef = doc(db, "nationalTreasuries", classCode);
  const buyerRef = doc(db, "users", buyerId);
  const sellerRef = doc(db, "users", sellerId);

  try {
    let taxAmount = 0;
    let sellerProceeds = 0;
    let buyerName = "알수없음";
    let sellerName = "알수없음";

    await runTransaction(db, async (transaction) => {
      // 🔥 [최적화] 배치로 필요한 문서들을 한번에 조회
      const [governmentSettings, buyerSnap, sellerSnap] = await Promise.all([
        getGovernmentSettings(classCode),
        transaction.get(buyerRef),
        transaction.get(sellerRef)
      ]);

      if (!buyerSnap.exists() || !sellerSnap.exists()) {
        throw new Error("구매자 또는 판매자 정보를 찾을 수 없습니다.");
      }

      buyerName = buyerSnap.data().name || "알수없음";
      sellerName = sellerSnap.data().name || "알수없음";

      const taxSettings = governmentSettings ? governmentSettings.taxSettings : {};
      let taxRate = 0;
      let taxRevenueField = "";

      switch (taxType) {
        case "realEstate":
          taxRate = taxSettings?.realEstateTransactionTaxRate || 0;
          taxRevenueField = "realEstateTransactionTaxRevenue";
          break;
        case "auction":
          taxRate = taxSettings?.auctionTransactionTaxRate || 0;
          taxRevenueField = "auctionTaxRevenue";
          break;
        case "itemMarket":
          taxRate = taxSettings?.itemMarketTransactionTaxRate || 0;
          taxRevenueField = "itemMarketTaxRevenue";
          break;
        default:
          throw new Error("유효하지 않은 세금 종류입니다.");
      }

      taxAmount = Math.round(transactionPrice * taxRate);
      sellerProceeds = transactionPrice - taxAmount;

      if ((buyerSnap.data().cash || 0) < transactionPrice) {
        throw new Error("구매자의 현금이 부족합니다.");
      }

      transaction.update(buyerRef, { cash: increment(-transactionPrice) });
      transaction.update(sellerRef, { cash: increment(sellerProceeds) });

      if (taxAmount > 0) {
        transaction.update(nationalTreasuryRef, {
          totalAmount: increment(taxAmount),
          [taxRevenueField]: increment(taxAmount),
          lastUpdated: serverTimestamp(),
        });
      }

      if (taxType === "itemMarket" && inventoryUpdate) {
        const sellerInventoryItemRef = doc(db, "users", sellerId, "inventory", inventoryUpdate.inventoryItemId);
        const sellerItemSnap = await transaction.get(sellerInventoryItemRef);
        if(!sellerItemSnap.exists() || sellerItemSnap.data().quantity < inventoryUpdate.quantity) {
          throw new Error("판매자의 아이템 재고가 부족합니다.");
        }
        transaction.update(sellerInventoryItemRef, { quantity: increment(-inventoryUpdate.quantity) });
      }
    });

    // 아이템 마켓 거래 후 구매자 인벤토리에 아이템 추가
    if (taxType === "itemMarket" && inventoryUpdate) {
       await addItemToInventory(buyerId, inventoryUpdate.originalStoreItemId, inventoryUpdate.quantity, inventoryUpdate.itemDetails);
    }

    // 🔥 [최적화] 로깅을 병렬로 처리
    const itemName = inventoryUpdate?.itemDetails?.name || taxType;
    const buyerLog = `[${sellerName}]님으로부터 ${itemName}을(를) ${transactionPrice}원에 구매했습니다.`;
    const sellerLog = `[${buyerName}]님에게 ${itemName}을(를) ${transactionPrice}원에 판매하여 ${sellerProceeds}원을 얻었습니다. (세금 ${taxAmount}원 제외)`;

    await Promise.all([
      addActivityLog(buyerId, '구매', buyerLog),
      addActivityLog(sellerId, '판매', sellerLog)
    ]);

    console.log(`[${classCode}] ${taxType} 거래 성공. 세금: ${taxAmount}원, 거래액: ${transactionPrice}원`);
    return { success: true, taxAmount };
  } catch (error) {
    console.error(`[firebase.js] ${taxType} 거래 트랜잭션 오류:`, error);
    throw error;
  }
};

// 🔥 [최적화] 부동산 보유세 징수 - 배치 처리
export const collectPropertyHoldingTaxes = async (classCode) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");

  const nationalTreasuryRef = doc(db, "nationalTreasuries", classCode);

  try {
    const governmentSettings = await getGovernmentSettings(classCode);
    const taxRate = governmentSettings?.taxSettings?.propertyHoldingTaxRate || 0;

    if (taxRate === 0) {
      console.log(`[${classCode}] 부동산 보유세율이 0%이므로 징수를 건너뜁니다.`);
      return { success: true, totalCollected: 0, userCount: 0 };
    }

    const usersQuery = originalFirebaseQuery(
      collection(db, "users"),
      originalFirebaseWhere("classCode", "==", classCode)
    );
    const usersSnapshot = await getDocs(usersQuery);

    const batch = writeBatch(db);
    let totalTaxCollected = 0;
    let processedUserCount = 0;
    const logPromises = [];

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userRef = doc(db, "users", userId);
      let userTotalTax = 0;
      let totalPropertyValue = 0;

      const propertiesRef = collection(db, "users", userId, "properties");
      const propertiesSnapshot = await getDocs(propertiesRef);

      if (propertiesSnapshot.empty) {
        continue;
      }

      propertiesSnapshot.forEach((propDoc) => {
        const propertyValue = propDoc.data().value || 0;
        totalPropertyValue += propertyValue;
        userTotalTax += Math.round(propertyValue * taxRate);
      });

      if (userTotalTax > 0) {
        // 🔥 [최적화] 세금 징수로 사용자 정보가 변경되므로 캐시를 무효화
        invalidateCache(`user_${userId}`);
        batch.update(userRef, { cash: increment(-userTotalTax) });
        totalTaxCollected += userTotalTax;
        processedUserCount++;
        const logDescription = `소유 부동산 (총 가치 ${totalPropertyValue}원)에 대한 보유세 ${userTotalTax}원이 징수되었습니다.`;
        logPromises.push(addActivityLog(userId, '세금 납부 (보유세)', logDescription));
      }
    }

    if (totalTaxCollected > 0) {
      batch.update(nationalTreasuryRef, {
        totalAmount: increment(totalTaxCollected),
        propertyHoldingTaxRevenue: increment(totalTaxCollected),
        lastUpdated: serverTimestamp(),
      });
    }

    await batch.commit();
    await Promise.all(logPromises);

    console.log(`[${classCode}] 부동산 보유세 징수 완료. 총 ${totalTaxCollected}원 (${processedUserCount}명)`);
    return {
      success: true,
      totalCollected: totalTaxCollected,
      userCount: processedUserCount,
    };
  } catch (error) {
    console.error(`[firebase.js] 부동산 보유세 징수 오류 (학급: ${classCode}):`, error);
    throw error;
  }
};

// =================================================================
// 🔥 [최적화] 기부 관련 Firestore 함수
// =================================================================

export const addDonationRecord = async (donationData) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!donationData.userId || !donationData.classCode || !donationData.amount) {
    throw new Error("기부 기록에 필수 필드(userId, classCode, amount)가 누락되었습니다.");
  }

  try {
    const donationWithTimestamp = {
      ...donationData,
      goalId: donationData.goalId || "default_goal",
      createdAt: serverTimestamp(),
    };
    const docRef = await originalFirebaseAddDoc(collection(db, "donations"), donationWithTimestamp);
    console.log(`[firebase.js] 기부 기록 추가 성공: ${docRef.id}`);
    return docRef;
  } catch (error) {
    console.error("[firebase.js] 기부 기록 추가 중 오류 발생:", error);
    throw error;
  }
};

export const addSettlementRecord = async (settlementData) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!settlementData.classCode || !settlementData.reportId) {
    throw new Error("합의 기록에 필수 필드(classCode, reportId)가 누락되었습니다.");
  }

  try {
    const settlementWithTimestamp = {
      ...settlementData,
      createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, "settlements"), settlementWithTimestamp);
    console.log(`[firebase.js] 합의 기록 추가 성공: ${docRef.id}`);
    return docRef;
  } catch (error) {
    console.error("[firebase.js] 합의 기록 추가 중 오류 발생:", error);
    throw error;
  }
};

// 🔥 [최적화] 캐시를 활용한 기부 내역 조회
export const getDonationsForClass = async (classCode, goalId = "default_goal", useCache = true) => {
    if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
    if (!classCode) throw new Error("학급 코드가 필요합니다.");

    const cacheKey = `donations_${classCode}_${goalId}`;
    
    if (useCache) {
      const cached = getCache(cacheKey);
      if (cached) {
        console.log(`[firebase.js] 학급(${classCode}) 기부 내역 캐시 조회: ${cached.length}개`);
        return cached;
      }
    }

    try {
        const donationsRef = collection(db, "donations");
        const q = originalFirebaseQuery(
            donationsRef,
            originalFirebaseWhere("classCode", "==", classCode),
            originalFirebaseWhere("goalId", "==", goalId),
            orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const donations = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (useCache) {
          setCache(cacheKey, donations);
        }
        
        console.log(`[firebase.js] 학급(${classCode}) 기부 내역 조회: ${donations.length}개`);
        return donations;
    } catch (error) {
        console.error(`[firebase.js] 학급(${classCode}) 기부 내역 조회 중 오류 발생:`, error);
        throw error;
    }
};

// 🔥 [최적화] 상점 아이템 조회 - 캐시 우선
const getStoreItems = async (classCode, useCache = true) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!classCode)
    throw new Error("[firebase.js] classCode is required to get store items.");
    
  const cacheKey = `store_items_${classCode}`;
  
  if (useCache) {
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[firebase.js] 상점 아이템 캐시 조회 (${classCode}): ${cached.length}개`);
      return cached;
    }
  }
  
  const itemsColRef = collection(db, "storeItems");
  const q = originalFirebaseQuery(
    itemsColRef,
    originalFirebaseWhere("classCode", "==", classCode)
  );
  const itemSnapshot = await getDocs(q);
  const result = itemSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  
  if (useCache) {
    setCache(cacheKey, result);
  }
  
  console.log(`[firebase.js] 상점 아이템 조회 (${classCode}): ${result.length}개`);
  return result;
};

const addStoreItem = async (itemData, classCode) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!classCode)
    throw new Error("[firebase.js] classCode is required to add a store item.");
  if (
    !itemData ||
    !itemData.name ||
    typeof itemData.price !== "number" ||
    typeof itemData.stock !== "number"
  ) {
    throw new Error("유효하지 않은 아이템 데이터 (name, price, stock 필수).");
  }
  
  // 🔥 [최적화] 상점 아이템 추가 시 관련 캐시 무효화
  invalidateCache(`store_items_${classCode}`);
  
  const itemsColRef = collection(db, "storeItems");
  const docRef = await originalFirebaseAddDoc(itemsColRef, {
    ...itemData,
    classCode: classCode,
    initialStock: itemData.initialStock ?? itemData.stock,
    available: itemData.available !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log(`[시스템] 새 상점 아이템 추가: ${itemData.name}`);
  return docRef;
};

const updateStoreItem = async (itemId, updates) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!itemId || !updates || Object.keys(updates).length === 0) {
    throw new Error("아이템 ID 또는 업데이트 데이터가 유효하지 않습니다.");
  }
  
  // 🔥 [최적화] 상점 아이템 업데이트 시 관련 캐시 무효화
  invalidateCachePattern('store_items_');
  
  const itemRef = doc(db, "storeItems", itemId);
  await updateDoc(itemRef, { ...updates, updatedAt: serverTimestamp() });
  console.log(`[firebase.js] 상점 아이템 (${itemId}) 업데이트 성공.`);
  return true;
};

const deleteStoreItem = async (itemId) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!itemId) throw new Error("아이템 ID가 유효하지 않습니다.");
  
  // 🔥 [최적화] 상점 아이템 삭제 시 관련 캐시 무효화
  invalidateCachePattern('store_items_');
  
  const itemRef = doc(db, "storeItems", itemId);
  await deleteDoc(itemRef);
  console.log(`[firebase.js] 상점 아이템 (${itemId}) 삭제 성공.`);
  return true;
};

const addItemToInventory = async (
  userId,
  storeItemId,
  quantity,
  itemDetails = {}
) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (
    !userId ||
    !storeItemId ||
    typeof quantity !== "number" ||
    quantity <= 0
  ) {
    throw new Error("사용자 ID, 아이템 ID 또는 수량이 유효하지 않습니다.");
  }
  
  const inventoryColRef = collection(db, "users", userId, "inventory");
  const q = originalFirebaseQuery(
    inventoryColRef,
    originalFirebaseWhere("itemId", "==", storeItemId)
  );
  const querySnapshot = await getDocs(q);

  const itemName = itemDetails.name || "Unknown Item";

  if (!querySnapshot.empty) {
    const inventoryDoc = querySnapshot.docs[0];
    const inventoryItemRef = doc(
      db,
      "users",
      userId,
      "inventory",
      inventoryDoc.id
    );
    await updateDoc(inventoryItemRef, {
      quantity: increment(quantity),
      updatedAt: serverTimestamp(),
    });
    console.log(
      `[firebase.js] 기존 인벤토리 아이템(${inventoryDoc.id}) 수량 ${quantity} 증가`
    );
  } else {
    const newItemRef = doc(inventoryColRef);
    await setDoc(newItemRef, {
      itemId: storeItemId,
      quantity: quantity,
      name: itemName,
      icon: itemDetails.icon || "❓",
      type: itemDetails.type || "item",
      purchasedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log(
      `[firebase.js] 새 인벤토리 아이템(${newItemRef.id}) 추가: ${quantity}개`
    );
  }

  await addActivityLog(userId, "아이템 획득", `${itemName} ${quantity}개를 획득했습니다.`);
  return true;
};

// 🔥 [최적화] 아이템 구매 트랜잭션 - 배치 처리 개선
export const purchaseItemTransaction = async (
  userId,
  storeItemId,
  userClassCode,
  quantityToPurchase = 1,
  skipCashDeduction = false
) => {
  if (!db) throw new Error("[firebase.js] Firestore가 초기화되지 않았습니다.");
  if (
    !userId ||
    !storeItemId ||
    !userClassCode ||
    typeof quantityToPurchase !== "number" ||
    quantityToPurchase <= 0
  ) {
    throw new Error(
      "[firebase.js] 사용자 ID, 아이템 ID, 학급 코드 또는 구매 수량이 유효하지 않습니다."
    );
  }

  // 🔥 [최적화] 아이템 구매 시 사용자의 현금 정보가 바뀌므로 캐시를 무효화
  invalidateCache(`user_${userId}`);

  const storeItemRef = doc(db, "storeItems", storeItemId);
  const userRef = doc(db, "users", userId);
  const governmentSettingsRef = doc(db, "governmentSettings", userClassCode);
  const nationalTreasuryRef = doc(db, "nationalTreasuries", userClassCode);

  let totalItemPrice = 0;
  let vatAmount = 0;
  let finalPriceWithVAT = 0;
  let autoRestockOccurred = false;
  let purchasedItemName = "알 수 없는 아이템";

  try {
    // 🔥 [최적화] 정부 설정은 자주 바뀌지 않으므로, 캐시된 데이터를 우선 사용
    const governmentSettings = await getGovernmentSettings(userClassCode);

    let itemStoreVATRate = 0.1; // 기본값
    if (governmentSettings && governmentSettings.taxSettings && governmentSettings.taxSettings.itemStoreVATRate !== undefined) {
        itemStoreVATRate = governmentSettings.taxSettings.itemStoreVATRate;
    } else {
        console.warn(
            `[${userClassCode}] 아이템 상점 부가세율 설정을 찾을 수 없어 기본값(10%)을 사용합니다.`
        );
    }

    const inventoryColRef = collection(db, "users", userId, "inventory");
    const inventoryQuery = originalFirebaseQuery(
      inventoryColRef,
      originalFirebaseWhere("itemId", "==", storeItemId)
    );
    const inventoryQuerySnapshot = await getDocs(inventoryQuery);

    await runTransaction(db, async (transaction) => {
      console.log("[firebase.js] 트랜잭션 - 읽기 작업 시작");

      // 🔥 [최적화] 필요한 문서들을 배치로 조회
      const [storeItemSnap, userSnap, treasurySnap] = await Promise.all([
        transaction.get(storeItemRef),
        skipCashDeduction ? Promise.resolve(null) : transaction.get(userRef),
        transaction.get(nationalTreasuryRef)
      ]);

      if (!storeItemSnap.exists()) {
        throw new Error(
          `[firebase.js] 상점 아이템 (ID: ${storeItemId})을 찾을 수 없습니다.`
        );
      }
      const storeItemData = storeItemSnap.data();
      purchasedItemName = storeItemData.name || "알 수 없는 아이템";

      let userData = null;
      if (!skipCashDeduction && userSnap) {
        if (!userSnap.exists()) {
          throw new Error(
            `[firebase.js] 사용자 (ID: ${userId})를 찾을 수 없습니다.`
          );
        }
        userData = userSnap.data();
      }

      console.log("[firebase.js] 트랜잭션 - 모든 읽기 작업 완료");

      if (storeItemData.classCode !== userClassCode) {
        throw new Error(
          `[firebase.js] 아이템 '${storeItemData.name}'(ID: ${storeItemId})은 현재 학급(${userClassCode})의 상품이 아닙니다 (상품 학급: ${storeItemData.classCode}).`
        );
      }

      if (!storeItemData.available) {
        throw new Error(
          `[firebase.js] 아이템 '${storeItemData.name}'은 현재 구매할 수 없습니다.`
        );
      }

      if (storeItemData.stock < quantityToPurchase) {
        throw new Error(
          `[firebase.js] 아이템 '${storeItemData.name}'의 재고가 부족합니다. (요청: ${quantityToPurchase}, 현재: ${storeItemData.stock})`
        );
      }

      const itemPricePerUnit = storeItemData.price;
      totalItemPrice = itemPricePerUnit * quantityToPurchase;
      vatAmount = Math.round(totalItemPrice * itemStoreVATRate);
      finalPriceWithVAT = totalItemPrice + vatAmount;

      if (!skipCashDeduction && userData) {
        if ((userData.cash || 0) < finalPriceWithVAT) {
          throw new Error(
            `[firebase.js] 현금이 부족합니다. (필요: ${finalPriceWithVAT}, 부가세 ${vatAmount} 포함, 현재: ${
              userData.cash || 0
            })`
          );
        }
      }

      console.log("[firebase.js] 트랜잭션 - 재고 관리 시작");
      const currentStock = storeItemData.stock || 0;
      const newStock = currentStock - quantityToPurchase;

      let itemUpdate = { updatedAt: serverTimestamp() };

      if (newStock <= 0 && storeItemData.initialStock > 0) {
        autoRestockOccurred = true;
        const priceIncreaseRate =
          storeItemData.outOfStockPriceIncreaseRate || 10;
        const newPrice = Math.round(
          storeItemData.price * (1 + priceIncreaseRate / 100)
        );
        const restockAmount = storeItemData.initialStock || 10;
        itemUpdate = { ...itemUpdate, stock: restockAmount, price: newPrice };
        console.log(
          `[firebase.js] 자동 재고 채우기 발생: ${storeItemData.name} - 재고: ${restockAmount}, 가격: ${storeItemData.price} → ${newPrice} (${priceIncreaseRate}% 인상)`
        );
      } else {
        itemUpdate = { ...itemUpdate, stock: newStock };
        console.log(
          `[firebase.js] 일반 재고 차감: ${storeItemData.name} - 재고: ${currentStock} → ${newStock}`
        );
      }
      transaction.update(storeItemRef, itemUpdate);

      console.log("[firebase.js] 트랜잭션 - 기타 쓰기 작업 시작");
      if (!skipCashDeduction && userData) {
        transaction.update(userRef, {
          cash: increment(-finalPriceWithVAT),
          updatedAt: serverTimestamp(),
        });
      }

      if (!inventoryQuerySnapshot.empty) {
        const inventoryDoc = inventoryQuerySnapshot.docs[0];
        const inventoryItemRef = doc(inventoryColRef, inventoryDoc.id);
        transaction.update(inventoryItemRef, {
          quantity: increment(quantityToPurchase),
          updatedAt: serverTimestamp(),
        });
      } else {
        const newInventoryItemRef = doc(inventoryColRef);
        transaction.set(newInventoryItemRef, {
          itemId: storeItemId,
          quantity: quantityToPurchase,
          name: storeItemData.name || "Unknown Item",
          icon: storeItemData.icon || "❓",
          type: storeItemData.type || "item",
          purchasedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (vatAmount > 0) {
        if (treasurySnap.exists()) {
          transaction.update(nationalTreasuryRef, {
            totalAmount: increment(vatAmount),
            vatRevenue: increment(vatAmount),
            lastUpdated: serverTimestamp(),
          });
        } else {
          transaction.set(nationalTreasuryRef, {
            totalAmount: vatAmount,
            vatRevenue: vatAmount,
            stockTaxRevenue: 0,
            realEstateTransactionTaxRevenue: 0,
            auctionTaxRevenue: 0,
            propertyHoldingTaxRevenue: 0,
            itemMarketTaxRevenue: 0,
            incomeTaxRevenue: 0,
            corporateTaxRevenue: 0,
            otherTaxRevenue: 0,
            lastUpdated: serverTimestamp(),
          });
        }
      }
      console.log("[firebase.js] 트랜잭션 - 모든 쓰기 작업 완료");
    });

    // 성공적인 구매 로그 기록
    const logDescription = `상점에서 ${purchasedItemName} ${quantityToPurchase}개를 ${finalPriceWithVAT}원에 구매했습니다. (부가세 ${vatAmount}원 포함)`;
    await addActivityLog(userId, '아이템 구매', logDescription);

    console.log(
      `[${userClassCode}] 아이템 구매 성공 (ID: ${storeItemId}), 부가세 ${vatAmount} 납부 완료.${
        autoRestockOccurred ? " 🔄 자동 재고 채우기 및 가격 인상 적용됨!" : ""
      }`
    );

    return {
      success: true,
      itemPrice: totalItemPrice,
      vat: vatAmount,
      autoRestocked: autoRestockOccurred,
    };
  } catch (error) {
    console.error(
      `[firebase.js] purchaseItemTransaction 오류 (사용자: ${userId}, 아이템: ${storeItemId}, 학급: ${userClassCode}):`,
      error
    );
    throw error;
  }
};

export const addMarketListing = async (listingData, classCode) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!classCode)
    throw new Error("[firebase.js] classCode is required for market listing.");
  if (
    !listingData ||
    !listingData.sellerId ||
    !listingData.inventoryItemId ||
    !listingData.originalStoreItemId ||
    !listingData.name ||
    typeof listingData.quantity !== "number" ||
    listingData.quantity <= 0 ||
    typeof listingData.pricePerItem !== "number" ||
    listingData.pricePerItem <= 0
  ) {
    throw new Error("유효하지 않은 시장 등록 데이터입니다.");
  }
  
  // 🔥 [최적화] 마켓 리스팅 추가 시 관련 캐시 무효화
  invalidateCachePattern(`market_${classCode}`);
  
  const marketColRef = collection(db, "marketItems");
  try {
    const docRef = await originalFirebaseAddDoc(marketColRef, {
      ...listingData,
      classCode: classCode,
      status: "active",
      listedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const logDescription = `${listingData.name} ${listingData.quantity}개를 개당 ${listingData.pricePerItem}원에 판매 등록했습니다.`;
    await addActivityLog(listingData.sellerId, '아이템 시장 등록', logDescription);

    console.log(
      `[firebase.js] 아이템 시장 등록 성공: ${docRef.id}`,
      listingData
    );
    return {
      success: true,
      listingId: docRef.id,
      data: { ...listingData, classCode },
    };
  } catch (error) {
    console.error("[firebase.js] 아이템 시장 등록 실패:", error);
    throw error;
  }
};

export const updateUserInventoryItemQuantity = async (
  userId,
  inventoryItemId,
  quantityChange,
  logMessage,
  context = ''
) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!userId || !inventoryItemId || typeof quantityChange !== "number") {
    throw new Error(
      "사용자 ID, 인벤토리 아이템 ID 또는 수량 변경 값이 유효하지 않습니다."
    );
  }

  const itemRef = doc(db, "users", userId, "inventory", inventoryItemId);

  try {
    const itemSnap = await getDoc(itemRef);
    if (!itemSnap.exists()) {
      if (quantityChange > 0) {
        console.warn(
          `[firebase.js] 존재하지 않는 인벤토리 아이템(ID: ${inventoryItemId})에 수량 증가 시도. 무시됨.`
        );
        return {
          success: false,
          error: "아이템을 찾을 수 없습니다.",
          deleted: false,
        };
      }
      return {
        success: true,
        newQuantity: 0,
        deleted: true,
        message: "아이템이 이미 존재하지 않습니다.",
      };
    }

    const itemData = itemSnap.data();
    const currentQuantity = itemData.quantity || 0;
    const newQuantity = currentQuantity + quantityChange;
    const itemName = itemData.name || '알 수 없는 아이템';

    if (newQuantity < 0) {
      throw new Error("아이템 수량이 0보다 작아질 수 없습니다.");
    }

    if (newQuantity === 0) {
      await deleteDoc(itemRef);
      console.log(
        `[firebase.js] 인벤토리 아이템(ID: ${inventoryItemId}) 수량이 0이 되어 삭제됨.`
      );

      // 아이템 사용 로그 기록 (수량이 0이 되어 삭제된 경우)
      if (quantityChange < 0) {
        const usedQuantity = Math.abs(quantityChange);
        const contextText = context ? ` (${context})` : '';
        const effect = itemData.effect || '효과 없음';

        await addActivityLog(userId, '아이템 사용',
          `${itemName} ${usedQuantity}개를 사용했습니다.${contextText} 효과: ${effect}`
        );
      }

      return { success: true, newQuantity: 0, deleted: true };
    } else {
      await updateDoc(itemRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp(),
      });

      // 아이템 사용 로그 기록 (수량 감소 시)
      if (quantityChange < 0) {
        const usedQuantity = Math.abs(quantityChange);
        const contextText = context ? ` (${context})` : '';
        const effect = itemData.effect || '효과 없음';

        await addActivityLog(userId, '아이템 사용',
          `${itemName} ${usedQuantity}개를 사용했습니다.${contextText} 효과: ${effect} (잔여: ${newQuantity}개)`
        );
      } else if (quantityChange > 0) {
        // 아이템 획득 로그
        await addActivityLog(userId, '아이템 획득',
          `${itemName} ${quantityChange}개를 획득했습니다. (총 ${newQuantity}개)`
        );
      }

      console.log(
        `[firebase.js] 인벤토리 아이템(ID: ${inventoryItemId}) 수량 변경: ${currentQuantity} -> ${newQuantity}`
      );
      return { success: true, newQuantity, deleted: false };
    }
  } catch (error) {
    console.error(
      `[firebase.js] 인벤토리 아이템 수량 변경 오류 (ID: ${inventoryItemId}):`,
      error
    );
    throw error;
  }
};

// 🔥 [최적화] 학급 코드 검증 - 캐시 TTL 1시간으로 연장
export const verifyClassCode = async (classCodeToVerify, maxRetries = 2) => {
  console.log(`[firebase.js] verifyClassCode 호출됨: "${classCodeToVerify}"`);

  if (!db) {
    console.error(
      "[firebase.js] verifyClassCode: Firestore가 초기화되지 않았습니다."
    );
    throw new Error("Firestore가 초기화되지 않았습니다.");
  }

  if (
    !classCodeToVerify ||
    typeof classCodeToVerify !== "string" ||
    classCodeToVerify.trim() === ""
  ) {
    console.warn(
      "[firebase.js] verifyClassCode: 학급 코드가 제공되지 않았거나 형식이 잘못되었습니다.",
      { classCodeToVerify, type: typeof classCodeToVerify }
    );
    return false;
  }

  const trimmedCode = classCodeToVerify.trim();
  console.log(`[firebase.js] verifyClassCode: 정제된 코드: "${trimmedCode}"`);

  // 🔥 [최적화] 학급 코드 목록은 거의 바뀌지 않으므로 캐시 TTL을 1시간으로 연장
  const cacheKey = `class_codes_valid_list`;
  const cachedCodes = getCache(cacheKey);
  if (cachedCodes && Array.isArray(cachedCodes)) {
    const isValid = cachedCodes.includes(trimmedCode);
    console.log(`[firebase.js] verifyClassCode (from cache): "${trimmedCode}" 검증 결과: ${isValid}`);
    return isValid;
  }

  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    attempt++;
    console.log(`[firebase.js] verifyClassCode 시도 ${attempt}/${maxRetries}`);

    try {
      const classCodesSettingsRef = doc(db, "settings", "classCodes");
      console.log(
        `[firebase.js] verifyClassCode: settings/classCodes 문서 조회 중... (시도 ${attempt})`
      );

      const getDocPromise = getDoc(classCodesSettingsRef);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("문서 조회 타임아웃")), 8000)
      );
      const docSnap = await Promise.race([getDocPromise, timeoutPromise]);
      console.log(
        `[firebase.js] verifyClassCode: 문서 존재 여부: ${docSnap.exists()} (시도 ${attempt})`
      );

      if (docSnap.exists()) {
        const data = docSnap.data();
        const validCodesArray = data.validCodes;

        if (Array.isArray(validCodesArray)) {
          // 🔥 [최적화] 1시간 캐시 TTL로 설정
          const expiry = Date.now() + 60 * 60 * 1000; // 1시간
          cache.set(cacheKey, { data: validCodesArray, expiry, lastAccessed: Date.now() });
          
          const isValid = validCodesArray.includes(trimmedCode);
          console.log(
            `[firebase.js] verifyClassCode: "${trimmedCode}" 검증 결과: ${isValid} (시도 ${attempt})`
          );
          return isValid;
        } else {
          console.warn(
            `[firebase.js] verifyClassCode: validCodes가 배열이 아닙니다.`,
            { validCodes: validCodesArray, type: typeof validCodesArray }
          );
          return false;
        }
      } else {
        console.warn(
          "[firebase.js] verifyClassCode: 'settings/classCodes' 문서가 존재하지 않습니다."
        );

        if (attempt === 1) {
          console.log(
            "[firebase.js] verifyClassCode: 기본 설정 문서 생성 시도..."
          );
          try {
            const defaultCodes = ["DEMO", "TEST", "CLASS1", "CLASS2", "SCHOOL01"];
            await setDoc(classCodesSettingsRef, {
              validCodes: defaultCodes,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            
            // 🔥 [최적화] 생성 후 바로 캐시에 저장
            const expiry = Date.now() + 60 * 60 * 1000;
            cache.set(cacheKey, { data: defaultCodes, expiry, lastAccessed: Date.now() });
            
            console.log(
              "[firebase.js] verifyClassCode: 기본 설정 문서가 생성되었습니다."
            );
          } catch (createError) {
            console.error(
              "[firebase.js] verifyClassCode: 기본 설정 문서 생성 실패:",
              createError
            );
            throw createError;
          }
        }
      }
    } catch (error) {
      lastError = error;
      console.error(
        `[firebase.js] verifyClassCode 오류 (시도 ${attempt}/${maxRetries}):`,
        error
      );

      const retryableErrors = [
        "unavailable",
        "deadline-exceeded",
        "internal",
        "문서 조회 타임아웃",
      ];
      const isRetryableError = retryableErrors.some(
        (retryableError) =>
          error.code === retryableError ||
          error.message.includes(retryableError)
      );

      if (!isRetryableError) {
        console.error(
          `[firebase.js] verifyClassCode 재시도 불가능한 오류: ${
            error.code || error.message
          }`
        );
        break;
      }

      if (attempt < maxRetries) {
        const delay = 1000 * attempt;
        console.log(`[firebase.js] verifyClassCode ${delay}ms 후 재시도...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(
    `[firebase.js] verifyClassCode 최종 실패 (${maxRetries}번 시도 후)`
  );
  return false;
};

// 🔥 [최적화] 사용자 인벤토리 조회 - 캐시 활용
export const getUserInventory = async (userId, useCache = true) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId) throw new Error("사용자 ID가 필요합니다.");

  const cacheKey = `inventory_${userId}`;
  
  if (useCache) {
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[firebase.js] 사용자 ${userId} 인벤토리 캐시 조회: ${cached.length}개 아이템`);
      return cached;
    }
  }

  try {
    const inventoryRef = collection(db, "users", userId, "inventory");
    const inventorySnapshot = await getDocs(inventoryRef);
    const inventory = inventorySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    if (useCache) {
      setCache(cacheKey, inventory);
    }
    
    console.log(`[firebase.js] 사용자 ${userId} 인벤토리 조회: ${inventory.length}개 아이템`);
    return inventory;
  } catch (error) {
    console.error(`[firebase.js] 인벤토리 조회 오류 (사용자: ${userId}):`, error);
    throw error;
  }
};

// 🔥 [최적화] 마켓 아이템 조회 - 캐시 활용
export const getMarketItems = async (classCode, status = "active", useCache = true) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");

  const cacheKey = `market_${classCode}_${status}`;
  
  if (useCache) {
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[firebase.js] 마켓 아이템 캐시 조회 (${classCode}): ${cached.length}개`);
      return cached;
    }
  }

  try {
    const marketRef = collection(db, "marketItems");
    let q = originalFirebaseQuery(
      marketRef,
      originalFirebaseWhere("classCode", "==", classCode)
    );

    if (status) {
      q = originalFirebaseQuery(
        marketRef,
        originalFirebaseWhere("classCode", "==", classCode),
        originalFirebaseWhere("status", "==", status)
      );
    }

    const marketSnapshot = await getDocs(q);
    const marketItems = marketSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    if (useCache) {
      setCache(cacheKey, marketItems);
    }
    
    console.log(`[firebase.js] 마켓 아이템 조회 (${classCode}): ${marketItems.length}개`);
    return marketItems;
  } catch (error) {
    console.error(`[firebase.js] 마켓 아이템 조회 오류 (학급: ${classCode}):`, error);
    throw error;
  }
};

export const updateMarketListing = async (listingId, updates) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!listingId || !updates) throw new Error("리스팅 ID와 업데이트 데이터가 필요합니다.");

  // 🔥 [최적화] 마켓 리스팅 업데이트 시 관련 캐시 무효화
  invalidateCachePattern('market_');

  try {
    const listingRef = doc(db, "marketItems", listingId);
    await updateDoc(listingRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    console.log(`[firebase.js] 마켓 리스팅 업데이트 성공: ${listingId}`);
    return true;
  } catch (error) {
    console.error(`[firebase.js] 마켓 리스팅 업데이트 오류 (ID: ${listingId}):`, error);
    throw error;
  }
};

// 🔥 [최적화] 정부 설정 조회 - 캐시 TTL 1시간으로 연장
export const getGovernmentSettings = async (classCode, useCache = true) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");

  const cacheKey = `gov_settings_${classCode}`;
  
  if (useCache) {
    const cachedSettings = getCache(cacheKey);
    if (cachedSettings) {
      return cachedSettings;
    }
  }

  try {
    const settingsRef = doc(db, "governmentSettings", classCode);
    
    let settingsSnap;
    try {
      settingsSnap = await getDocFromCache(settingsRef);
      console.log(`[firebase.js] 정부 설정 캐시 조회 (${classCode})`);
    } catch (cacheError) {
      settingsSnap = await getDoc(settingsRef);
      console.log(`[firebase.js] 정부 설정 서버 조회 (${classCode})`);
    }
    
    const result = settingsSnap.exists() ? settingsSnap.data() : null;

    if (result && useCache) {
      // 🔥 [최적화] 정부 설정은 자주 바뀌지 않으므로 1시간 캐시
      const expiry = Date.now() + 60 * 60 * 1000;
      cache.set(cacheKey, { data: result, expiry, lastAccessed: Date.now() });
    }

    console.log(`[firebase.js] 정부 설정 조회 (${classCode}):`, result ? "존재" : "없음");
    return result;
  } catch (error) {
    console.error(`[firebase.js] 정부 설정 조회 오류 (학급: ${classCode}):`, error);
    throw error;
  }
};

export const updateGovernmentSettings = async (classCode, settings) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode || !settings) throw new Error("학급 코드와 설정 데이터가 필요합니다.");

  try {
    // 🔥 [최적화] 정부 설정 업데이트 시 캐시를 무효화
    invalidateCache(`gov_settings_${classCode}`);
    
    const settingsRef = doc(db, "governmentSettings", classCode);
    await setDoc(settingsRef, {
      ...settings,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log(`[firebase.js] 정부 설정 업데이트 성공 (${classCode})`);
    return true;
  } catch (error) {
    console.error(`[firebase.js] 정부 설정 업데이트 오류 (학급: ${classCode}):`, error);
    throw error;
  }
};

// 🔥 [최적화] 국고 정보 조회 - 캐시 활용
export const getNationalTreasury = async (classCode, useCache = true) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");

  const cacheKey = `treasury_${classCode}`;
  
  if (useCache) {
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[firebase.js] 국고 캐시 조회 (${classCode}): 존재`);
      return cached;
    }
  }

  try {
    const treasuryRef = doc(db, "nationalTreasuries", classCode);
    const treasurySnap = await getDoc(treasuryRef);
    const result = treasurySnap.exists() ? treasurySnap.data() : null;
    
    if (result && useCache) {
      setCache(cacheKey, result);
    }
    
    console.log(`[firebase.js] 국고 조회 (${classCode}):`, result ? "존재" : "없음");
    return result;
  } catch (error) {
    console.error(`[firebase.js] 국고 조회 오류 (학급: ${classCode}):`, error);
    throw error;
  }
};

// 🔥 [최적화] 활동 로그 조회 - 제한적 캐시 사용
export const getActivityLogs = async (classCode, limit = 50, useCache = false) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");

  const cacheKey = `activity_logs_${classCode}_${limit}`;
  
  // 🔥 [최적화] 활동 로그는 자주 변경되므로 기본적으로 캐시 비활성화
  if (useCache) {
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[firebase.js] 활동 로그 캐시 조회 (${classCode}): ${cached.length}개`);
      return cached;
    }
  }

  try {
    console.log(`[firebase.js] 활동 로그 조회 시작 (${classCode})`);

    const logsRef = collection(db, "activity_logs");
    const q = originalFirebaseQuery(
      logsRef,
      originalFirebaseWhere("classCode", "==", classCode)
    );

    console.log('쿼리 실행 중...');
    const logsSnapshot = await getDocs(q);
    console.log(`쿼리 결과: ${logsSnapshot.docs.length}개 문서`);

    let logs = logsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp
      };
    });

    // 클라이언트 사이드에서 정렬 (인덱스 필요 없음)
    logs.sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;

      const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
      const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();

      return timeB - timeA; // 최신순 정렬
    });

    // 제한 적용
    if (limit > 0) {
      logs = logs.slice(0, limit);
    }

    // 🔥 [최적화] 활동 로그는 변경이 빈번하므로 짧은 캐시 TTL (5분)
    if (useCache) {
      const shortExpiry = Date.now() + 5 * 60 * 1000; // 5분
      cache.set(cacheKey, { data: logs, expiry: shortExpiry, lastAccessed: Date.now() });
    }

    console.log(`[firebase.js] 활동 로그 조회 완료 (${classCode}): ${logs.length}개`);
    return logs;
  } catch (error) {
    console.error(`[firebase.js] 활동 로그 조회 오류 (학급: ${classCode}):`, error);
    return [];
  }
};

// =================================================================
// 🔥 [최적화] 뱅킹 상품 관리 함수
// =================================================================

// 🔥 [최적화] 뱅킹 상품 조회 - 캐시 활용
export const getBankingProducts = async (classCode, useCache = true) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");

  const cacheKey = `banking_${classCode}`;
  
  if (useCache) {
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[firebase.js] 뱅킹 상품 캐시 조회 (${classCode})`);
      return cached;
    }
  }

  const docRef = doc(db, "bankingSettings", classCode);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    if (useCache) {
      setCache(cacheKey, data);
    }
    return data;
  } else {
    console.log(`[firebase.js] bankingSettings 문서(${classCode})가 없어 기본값으로 생성합니다.`);
    const defaultProducts = {
      deposits: [
        { id: 1, name: "일복리예금 90일", annualRate: 0.01, termInDays: 90, minAmount: 500000 },
        { id: 2, name: "일복리예금 180일", annualRate: 0.012, termInDays: 180, minAmount: 1000000 },
        { id: 3, name: "일복리예금 365일", annualRate: 0.015, termInDays: 365, minAmount: 2000000 },
      ],
      savings: [
         { id: 1, name: "일복리적금 180일", annualRate: 0.011, termInDays: 180, minAmount: 100000 },
         { id: 2, name: "일복리적금 365일", annualRate: 0.014, termInDays: 365, minAmount: 100000 },
         { id: 3, name: "일복리적금 730일", annualRate: 0.018, termInDays: 730, minAmount: 50000 },
      ],
      loans: [
        { id: 1, name: "일복리대출 90일", annualRate: 0.05, termInDays: 90, maxAmount: 3000000 },
        { id: 2, name: "일복리대출 365일", annualRate: 0.08, termInDays: 365, maxAmount: 10000000 },
        { id: 3, name: "일복리대출 730일", annualRate: 0.1, termInDays: 730, maxAmount: 50000000 },
      ]
    };
    await setDoc(docRef, { ...defaultProducts, updatedAt: serverTimestamp() });
    
    if (useCache) {
      setCache(cacheKey, defaultProducts);
    }
    
    return defaultProducts;
  }
};

export const updateBankingProducts = async (classCode, productType, products) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");
  if (!['deposits', 'savings', 'loans'].includes(productType)) {
      throw new Error("유효하지 않은 상품 유형입니다.");
  }

  // 🔥 [최적화] 뱅킹 상품 업데이트 시 캐시 무효화
  invalidateCache(`banking_${classCode}`);

  const docRef = doc(db, "bankingSettings", classCode);
  await setDoc(docRef, {
      [productType]: products,
      updatedAt: serverTimestamp()
  }, { merge: true });
};

// =================================================================
// ⭐️ [신규] 아이템 마켓 요약 데이터 구독 함수
// =================================================================
/**
 * 아이템 마켓의 요약 데이터를 실시간으로 구독합니다.
 * @param {string} classCode 학급 코드
 * @param {function} callback 요약 데이터가 업데이트될 때 호출될 콜백 함수
 * @returns {function} 구독을 해제하는 함수
 */
export const subscribeToMarketSummary = (classCode, callback) => {
  if (!db) {
    console.error("Firestore가 초기화되지 않아 구독할 수 없습니다.");
    return () => {};
  }
  if (!classCode) {
    console.error("학급 코드가 없어 마켓 요약 데이터를 구독할 수 없습니다.");
    return () => {};
  }

  // 경로: /ClassStock/{classCode}/marketSummary/summary
  // Firestore 데이터베이스 구조에 맞게 경로를 수정해야 합니다. 
  // 예를 들어, classes 컬렉션 아래에 있다면 `classes/${classCode}/marketSummary/summary`
  const summaryRef = doc(db, "classes", classCode, "marketSummary", "summary");

  console.log(`[Market] ${classCode} 학급의 마켓 요약 데이터 구독 시작`);

  const unsubscribe = onSnapshot(
    summaryRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const summaryData = docSnap.data();
        console.log("[Market] 마켓 요약 데이터 업데이트:", summaryData);
        callback(summaryData);
      } else {
        console.log("[Market] 마켓 요약 데이터가 아직 없습니다.");
        callback(null);
      }
    },
    (error) => {
      console.error("[Market] 마켓 요약 데이터 구독 중 오류 발생:", error);
      callback(null);
    }
  );

  return unsubscribe;
};

const isFirestoreInitialized = isInitialized;
const query = originalFirebaseQuery;
const where = originalFirebaseWhere;
const addDoc = originalFirebaseAddDoc;
// ⭐️ [수정] 오류 해결을 위해 별칭(alias) 추가

// 🔥 [최적화] 네트워크 상태 관리 함수 추가
export const goOffline = () => disableNetwork(db);
export const goOnline = () => enableNetwork(db);

// 🔥 [최적화] 캐시 관리 유틸리티 함수 추가
export const clearCache = () => {
  cache.clear();
  console.log('[Cache] 모든 캐시가 삭제되었습니다.');
};

export const getCacheStats = () => {
  const stats = {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    items: Array.from(cache.keys())
  };
  console.log('[Cache] 캐시 통계:', stats);
  return stats;
};

export {
  app,
  db,
  auth,
  storage,
  functions,
  httpsCallable, // 👈 [수정] export 목록에 httpsCallable 추가
  isInitialized,
  isFirestoreInitialized,
  authStateListener,
  signInWithEmailAndPassword,
  signOut,
  registerWithEmailAndPassword,
  updateUserProfile,
  getUserDocument,
  addUserDocument,
  updateUserDocument,
  deleteUserDocument,
  getAllUsersDocuments,
  updateUserCashInFirestore,
  getStoreItems,
  addStoreItem,
  updateStoreItem,
  deleteStoreItem,
  addItemToInventory,
  collection,
  collection as firebaseCollection,
  doc,
  doc as firebaseDoc,
  getDoc,
  getDoc as firebaseGetSingleDoc,
  setDoc,
  setDoc as firebaseSetDoc,
  getDocs,
  getDocs as firebaseGetDocs,
  originalFirebaseAddDoc,
  addDoc,
  originalFirebaseAddDoc as firebaseAddDoc,
  updateDoc,
  updateDoc as firebaseUpdateDoc,
  deleteDoc,
  deleteDoc as firebaseDeleteDoc,
  query,
  originalFirebaseQuery as firebaseQuery,
  where,
  originalFirebaseWhere as firebaseWhere,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  runTransaction,
  writeBatch,
  Timestamp,
  updatePassword,
  deleteUser,
  onSnapshot,
  invalidateCache,
};