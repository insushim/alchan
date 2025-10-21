// src/AuthContext.js - Firestore 읽기 최적화 및 무한루프 수정 버전 (학급 명단 로딩 문제 해결)

import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  auth,
  db,
  functions,
  isInitialized,
  authStateListener,
  signInWithEmailAndPassword as fbSignIn,
  signOut as fbSignOut,
  updatePassword as fbUpdatePassword,
  deleteUser as fbDeleteUser,
  getUserDocument,
  addUserDocument,
  updateUserDocument,
  deleteUserDocument,
  getClassmates, // 수정: 이제 실제 학급별 조회 함수
  updateUserCashInFirestore,
  updateUserCouponsInFirestore,
  addTransaction,
  serverTimestamp,
} from "./firebase";
import { doc, onSnapshot, Timestamp, getDoc } from "firebase/firestore";

export const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    console.warn(
      "useAuth was called outside of the AuthProvider, or AuthProvider is not fully initialized yet. Returning default/loading state."
    );
    return {
      user: null,
      userDoc: null,
      setUserDoc: () => {},
      users: [],
      classmates: [],
      allClassMembers: [],
      setAllClassMembers: () => {},
      loading: true,
      firebaseReady: false,
    };
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [users, setUsers] = useState([]);
  const [classmates, setClassmates] = useState([]);
  const [allClassMembers, setAllClassMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [firebaseReady, setFirebaseReady] = useState(false);

  // 최적화: 캐시와 요청 관리를 위한 ref들
  const lastLoginUpdateRef = useRef(new Set());
  const classmatesFetchTimeRef = useRef(0);
  const userDocCacheRef = useRef(new Map());
  const initializationCompleteRef = useRef(false);
  const currentUserUidRef = useRef(null);
  const firestoreUnsubscribeRef = useRef(null);
  const pendingClassmatesFetchRef = useRef(false);
  const userDocFetchTimeRef = useRef(new Map());
  const currentClassCodeRef = useRef(null);
  const authListenerSetupRef = useRef(false);

  // 최적화: 캐시 TTL 설정
  const isMobile = useCallback(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }, []);

  const CLASSMATES_CACHE_TTL = 5 * 60 * 1000; // 학급 구성원 캐시 5분으로 단축 (더 자주 업데이트)
  const USER_DOC_CACHE_TTL = 30 * 60 * 1000;
  const LASTLOGIN_UPDATE_COOLDOWN = 6 * 60 * 60 * 1000;

  // Firebase 초기화 확인 (한 번만 실행)
  useEffect(() => {
    if (initializationCompleteRef.current) return;

    const checkFirebaseInit = () => {
      const initialized = isInitialized();
      if (initialized) {
        setFirebaseReady(true);
        initializationCompleteRef.current = true;
      } else {
        setTimeout(checkFirebaseInit, 100);
      }
    };
    checkFirebaseInit();
  }, []);

  // 대폭 간소화된 학급 구성원만 계산하는 함수
  const calculateClassMembers = useCallback((classMembers, currentUserId) => {
    if (!classMembers || classMembers.length === 0) {
      return { allMembers: [], classmates: [] };
    }

    // 전체 학급 구성원
    const allMembers = classMembers;

    // 나를 제외한 학급 친구들 (가나다순 정렬)
    const classmates = allMembers
      .filter((u) => {
        const uid = u.id || u.uid;
        return uid !== currentUserId;
      })
      .sort((a, b) => {
        const nameA = a.name || a.nickname || "";
        const nameB = b.name || b.nickname || "";
        return nameA.localeCompare(nameB, "ko");
      });

    return { allMembers, classmates };
  }, []);

  const isAdminFn = useCallback(() => {
    return !!(
      userDoc &&
      (userDoc.isAdmin === true ||
        userDoc.role === "admin" ||
        userDoc.isSuperAdmin === true)
    );
  }, [userDoc]);

  const isSuperAdminFn = useCallback(() => {
    return !!(userDoc && userDoc.isSuperAdmin === true);
  }, [userDoc]);

  // 핵심 수정: 학급 구성원 조회 함수 개선
  const fetchClassmatesFromFirestore = useCallback(
    async (classCode, currentUserId = null, forceRefresh = false) => {
      if (!firebaseReady || !classCode || classCode === '미지정') {
        setUsers([]);
        setAllClassMembers([]);
        setClassmates([]);
        return [];
      }

      // 중복 요청 방지 (단, 강제 새로고침일 때는 허용)
      if (pendingClassmatesFetchRef.current && !forceRefresh) {
        return users;
      }

      const now = Date.now();
      
      // 캐시 확인 - 강제 새로고침이 아니고, 같은 학급이고, 캐시가 유효한 경우만 캐시 사용
      if (!forceRefresh && 
          users.length > 0 && 
          currentClassCodeRef.current === classCode && 
          now - classmatesFetchTimeRef.current < CLASSMATES_CACHE_TTL) {
        
        // 캐시 사용 시에도 계산된 데이터가 없으면 다시 계산
        if (classmates.length === 0 && allClassMembers.length === 0) {
          const { allMembers, classmates: newClassmates } = calculateClassMembers(users, currentUserId);
          setAllClassMembers(allMembers);
          setClassmates(newClassmates);
        }
        
        return users;
      }

      pendingClassmatesFetchRef.current = true;

      try {
        // 핵심: 해당 학급의 구성원만 직접 쿼리 (강제 새로고침 시 캐시 무효화)
        const classMembers = await getClassmates(classCode, forceRefresh);
        
        if (!classMembers || classMembers.length === 0) {
          setUsers([]);
          setAllClassMembers([]);
          setClassmates([]);
          currentClassCodeRef.current = classCode; // 빈 결과도 캐시
          classmatesFetchTimeRef.current = now;
          return [];
        }

        // 상태 업데이트
        setUsers(classMembers);
        currentClassCodeRef.current = classCode;
        classmatesFetchTimeRef.current = now;
        
        // 학급 구성원 계산 및 설정
        const { allMembers, classmates } = calculateClassMembers(classMembers, currentUserId);
        setAllClassMembers(allMembers);
        setClassmates(classmates);
        
        return classMembers;
        
      } catch (error) {
        setUsers([]);
        setAllClassMembers([]);
        setClassmates([]);
        return [];
      } finally {
        pendingClassmatesFetchRef.current = false;
      }
    },
    [firebaseReady, calculateClassMembers]
  );

  // 최적화: lastLogin 업데이트 - 더 긴 간격으로 업데이트
  const updateLastLoginAtSeparately = useCallback(
    async (firebaseUid, currentLastLogin) => {
      if (lastLoginUpdateRef.current.has(firebaseUid)) {
        return;
      }

      const now = Date.now();
      let shouldUpdate = false;

      if (!currentLastLogin) {
        shouldUpdate = true;
      } else if (currentLastLogin instanceof Timestamp) {
        const lastLoginTime = currentLastLogin.toDate().getTime();
        if (now - lastLoginTime > LASTLOGIN_UPDATE_COOLDOWN) {
          shouldUpdate = true;
        }
      } else if (
        typeof currentLastLogin === "object" &&
        currentLastLogin.seconds
      ) {
        const lastLoginTime = new Timestamp(
          currentLastLogin.seconds,
          currentLastLogin.nanoseconds
        )
          .toDate()
          .getTime();
        if (now - lastLoginTime > LASTLOGIN_UPDATE_COOLDOWN) {
          shouldUpdate = true;
        }
      }

      if (!shouldUpdate) {
        return;
      }

      try {
        await updateUserDocument(firebaseUid, {
          lastLoginAt: serverTimestamp(),
        });
        lastLoginUpdateRef.current.add(firebaseUid);
      } catch (updateError) {
        if (updateError.code !== 'unavailable') {
        } else {
        }
      }
    },
    []
  );

  // 최적화: 사용자 문서 캐시 관리
  const getCachedUserDoc = useCallback((uid) => {
    const cached = userDocCacheRef.current.get(uid);
    if (!cached) return null;

    const now = Date.now();
    const lastFetch = userDocFetchTimeRef.current.get(uid) || 0;
    
    if (now - lastFetch > USER_DOC_CACHE_TTL) {
      userDocCacheRef.current.delete(uid);
      userDocFetchTimeRef.current.delete(uid);
      return null;
    }

    return cached;
  }, []);

  const setCachedUserDoc = useCallback((uid, docData) => {
    userDocCacheRef.current.set(uid, docData);
    userDocFetchTimeRef.current.set(uid, Date.now());
  }, []);

  // 핵심 최적화: Auth 상태 리스너 - 학급 구성원만 조회 (수정된 부분)
  useEffect(() => {
    // 중복 실행 방지
    if (!firebaseReady || authListenerSetupRef.current) {
      if (!firebaseReady) {
        setLoading(true);
      }
      return;
    }

    authListenerSetupRef.current = true;
    setLoading(true);

    const authUnsubscribe = authStateListener(async (firebaseAuthUser) => {
      // 기존 실시간 리스너 정리
      if (firestoreUnsubscribeRef.current) {
        firestoreUnsubscribeRef.current();
        firestoreUnsubscribeRef.current = null;
      }
      
      if (firebaseAuthUser) {
        // 새로운 사용자 로그인 시 캐시 및 상태 초기화
        if (currentUserUidRef.current !== firebaseAuthUser.uid) {
          currentUserUidRef.current = firebaseAuthUser.uid;
          classmatesFetchTimeRef.current = 0;
          currentClassCodeRef.current = null;
          setUserDoc(null); 
          setUsers([]);
          setAllClassMembers([]);
          setClassmates([]);
          
          // 캐시 초기화
          userDocCacheRef.current.clear();
          userDocFetchTimeRef.current.clear();
        }

        setUser(firebaseAuthUser);
        setLoading(true);

        try {
          // 최적화: 캐시된 데이터 먼저 확인
          let docData = getCachedUserDoc(firebaseAuthUser.uid);
          
          if (!docData) {
            // 캐시가 없으면 직접 조회 (한 번만)
            const userRef = doc(db, "users", firebaseAuthUser.uid);
            const directDoc = await getDoc(userRef);
            
            if (directDoc.exists()) {
              docData = { id: directDoc.id, uid: directDoc.id, ...directDoc.data() };
              setCachedUserDoc(firebaseAuthUser.uid, docData);
            } else {
              // 새 사용자 문서 생성
              const displayName =
                firebaseAuthUser.displayName ||
                firebaseAuthUser.email?.split("@")[0] ||
                `User_${firebaseAuthUser.uid.substring(0, 5)}`;

              const newUserData = {
                name: displayName,
                nickname: displayName,
                email: firebaseAuthUser.email || "",
                classCode: "미지정",
                isAdmin: false,
                isSuperAdmin: false,
                cash: 0,
                coupons: 0,
                selectedJobIds: [],
                myContribution: 0,
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
              };

              await addUserDocument(firebaseAuthUser.uid, newUserData);
              docData = { id: firebaseAuthUser.uid, uid: firebaseAuthUser.uid, ...newUserData };
              setCachedUserDoc(firebaseAuthUser.uid, docData);
            }
          }

          if (docData) {
            setUserDoc(docData);

            // 핵심: 학급 구성원만 조회 (전체 사용자 대신)
            if (docData.classCode && docData.classCode !== '미지정') {
              // 🔥 [수정] forceRefresh=false로 변경하여 캐시 활용
              await fetchClassmatesFromFirestore(docData.classCode, firebaseAuthUser.uid, false);
            } else {
              setUsers([]);
              setAllClassMembers([]);
              setClassmates([]);
            }

            // lastLogin 업데이트는 더 긴 간격으로
            setTimeout(() => {
              updateLastLoginAtSeparately(
                firebaseAuthUser.uid,
                docData.lastLoginAt
              );
            }, 10000); // 10초 후에 실행

            // 🔥 [최적화] 실시간 리스너 대신 주기적 폴링으로 변경 (10분마다)
            const startUserDocPolling = () => {
              const pollUserDoc = async () => {
                try {
                  const userRef = doc(db, "users", firebaseAuthUser.uid);
                  const docSnap = await getDoc(userRef);

                  if (docSnap.exists()) {
                    const newDocData = { id: docSnap.id, uid: docSnap.id, ...docSnap.data() };

                    // 중요한 필드만 확인하여 불필요한 업데이트 방지
                    const currentData = userDocCacheRef.current.get(firebaseAuthUser.uid);

                    // 캐시가 없으면 무조건 업데이트 (첫 폴링)
                    if (!currentData) {
                      setUserDoc(newDocData);
                      setCachedUserDoc(firebaseAuthUser.uid, newDocData);
                      return;
                    }

                    // 중요 필드 변경 확인
                    const cashChanged = currentData.cash !== newDocData.cash;
                    const couponsChanged = currentData.coupons !== newDocData.coupons;
                    const classCodeChanged = currentData.classCode !== newDocData.classCode;
                    const isAdminChanged = currentData.isAdmin !== newDocData.isAdmin;

                    if (cashChanged || couponsChanged || classCodeChanged || isAdminChanged) {
                      // 학급 변경 감지
                      if (classCodeChanged) {
                        if (newDocData.classCode && newDocData.classCode !== '미지정') {
                          // 🔥 [수정] 학급 변경 시만 forceRefresh=true
                          await fetchClassmatesFromFirestore(newDocData.classCode, firebaseAuthUser.uid, true);
                        } else {
                          setUsers([]);
                          setAllClassMembers([]);
                          setClassmates([]);
                        }
                      }

                      setUserDoc(newDocData);
                      setCachedUserDoc(firebaseAuthUser.uid, newDocData);
                    }
                  }
                } catch (error) {
                }
              };

              // 초기 한 번 실행 후 10분마다 폴링 (5분에서 10분으로 변경 - Firebase 읽기 최적화)
              const interval = setInterval(pollUserDoc, 600000); // 10분마다 폴링 (5분에서 10분으로 변경)

              firestoreUnsubscribeRef.current = () => clearInterval(interval);
            };

            startUserDocPolling();
          }
          
          setLoading(false);

        } catch (error) {
          setUser(null);
          setUserDoc(null);
          setUsers([]);
          setLoading(false);
        }
      } else {
        // 로그아웃
        setUser(null);
        setUserDoc(null);
        setUsers([]);
        setClassmates([]);
        setAllClassMembers([]);
        localStorage.removeItem("currentUserAuthUID");

        // 캐시 및 참조 초기화
        lastLoginUpdateRef.current.clear();
        classmatesFetchTimeRef.current = 0;
        currentUserUidRef.current = null;
        currentClassCodeRef.current = null;
        userDocCacheRef.current.clear();
        userDocFetchTimeRef.current.clear();
        pendingClassmatesFetchRef.current = false;

        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (firestoreUnsubscribeRef.current) {
        firestoreUnsubscribeRef.current();
        firestoreUnsubscribeRef.current = null;
      }
      authListenerSetupRef.current = false;
    };
  }, [firebaseReady]); // firebaseReady만 의존성으로 사용
  
  const loginWithEmailPassword = useCallback(
    async (email, password, isReauth = false) => {
      if (!firebaseReady || !auth) {
        throw new Error("인증 서비스가 준비되지 않았습니다.");
      }

      let emailString = email;
      if (typeof emailString !== "string" || !emailString.includes("@")) {
        throw new Error("이메일 형식이 올바르지 않습니다.");
      }
      
      if (!isReauth) {
        setLoading(true);
      }
      
      try {
        const userCredential = await fbSignIn(auth, emailString, password);
        return userCredential.user;
      } catch (error) {
        if (!isReauth) {
          setLoading(false);
        }
        throw error;
      }
    },
    [firebaseReady]
  );

  const loginWithFirebaseUID = useCallback(
    async (firebaseUid) => {
      if (!firebaseReady || !auth || !firebaseUid) {
        return false;
      }

      setLoading(true);
      try {
        // 최적화: 캐시된 데이터 먼저 확인
        let docData = getCachedUserDoc(firebaseUid);
        
        if (!docData) {
          docData = await getUserDocument(firebaseUid);
          if (docData) {
            setCachedUserDoc(firebaseUid, docData);
          }
        }
        
        if (docData) {
          setUser(
            auth.currentUser && auth.currentUser.uid === firebaseUid
              ? auth.currentUser
              : { uid: firebaseUid, email: docData.email }
          );
          setUserDoc(docData);
          localStorage.setItem("currentUserAuthUID", firebaseUid);
          currentUserUidRef.current = firebaseUid;

          setTimeout(() => {
            updateLastLoginAtSeparately(firebaseUid, docData.lastLoginAt);
          }, 5000);

          // 핵심: 학급 구성원만 조회
          if (docData.classCode && docData.classCode !== '미지정') {
            // 🔥 [수정] forceRefresh=false로 변경
            await fetchClassmatesFromFirestore(docData.classCode, firebaseUid, false);
          }
          
          return true;
        } else {
          return false;
        }
      } catch (error) {
        return false;
      } finally {
        setLoading(false);
      }
    },
    [
      firebaseReady,
      fetchClassmatesFromFirestore,
      updateLastLoginAtSeparately,
      getCachedUserDoc,
      setCachedUserDoc,
    ]
  );

  const logout = useCallback(async () => {
    if (!firebaseReady || !auth) {
      return;
    }
    try {
      await fbSignOut(auth);
    } catch (error) {
    }
  }, [firebaseReady]);

  const updateUser = useCallback(
    async (updates) => {
      const currentUserId = userDoc?.id || userDoc?.uid;

      if (!firebaseReady || !currentUserId) {
        return false;
      }

      const firestoreUpdates = {
        ...updates,
        updatedAt: serverTimestamp(),
      };

      try {
        const success = await updateUserDocument(
          currentUserId,
          firestoreUpdates
        );

        if (success) {
          // 🔥 [수정] 로컬 캐시 무효화 및 강제 새로고침
          const cacheKey = `firestore_cache_user_${currentUserId}`;
          localStorage.removeItem(cacheKey);

          // userDoc 상태도 즉시 업데이트 (increment 처리 포함)
          const currentCached = getCachedUserDoc(currentUserId);
          if (currentCached) {
            const updatedCached = { ...currentCached };

            // increment() 연산 결과를 로컬에서 계산하여 반영
            Object.keys(updates).forEach(key => {
              const value = updates[key];

              // 🔥 [디버깅] increment 객체 구조 확인
              // Firebase increment() 객체 감지 (다양한 구조 지원)
              let incrementValue = null;
              if (value && typeof value === 'object') {
                // Firestore v9+ increment 객체 구조 확인
                if (value._delegate && value._delegate._operand !== undefined) {
                  incrementValue = value._delegate._operand;
                } else if (value._operand !== undefined) {
                  incrementValue = value._operand;
                } else if (value.operand !== undefined) {
                  incrementValue = value.operand;
                } else if (value._methodName === 'FieldValue.increment' && value._operand !== undefined) {
                  incrementValue = value._operand;
                } else if (value.constructor && value.constructor.name === 'NumericIncrementTransform') {
                  // 새로운 Firestore v9+ 구조 확인
                  incrementValue = value.operand || value._operand;
                } else {
                  // 모든 프로퍼티를 확인해서 숫자 값 찾기
                  for (const prop of Object.getOwnPropertyNames(value)) {
                    if (typeof value[prop] === 'number') {
                      incrementValue = value[prop];
                      break;
                    }
                  }
                }
              }

              if (incrementValue !== null) {
                // Firebase increment() 객체인 경우
                const currentValue = Number(currentCached[key]) || 0;
                const newValue = currentValue + incrementValue;
                updatedCached[key] = newValue;
              } else {
                // 일반 값인 경우
                updatedCached[key] = value;
              }
            });

            setCachedUserDoc(currentUserId, updatedCached);
            setUserDoc(updatedCached);
          }
          
          return true;
        } else {
          return false;
        }
      } catch (error) {
        return false;
      }
    },
    [firebaseReady, userDoc, getCachedUserDoc, setCachedUserDoc]
  );

  const changePassword = useCallback(
    async (newPassword) => {
      if (!firebaseReady || !auth?.currentUser) {
        throw new Error("인증 서비스가 준비되지 않았거나 로그인 상태가 아닙니다.");
      }
      try {
        await fbUpdatePassword(auth.currentUser, newPassword);
        return true;
      } catch (error) {
        throw error;
      }
    },
    [firebaseReady]
  );

  const deleteCurrentUserAccount = useCallback(async () => {
    if (!firebaseReady || !auth?.currentUser) {
      throw new Error("인증 서비스가 준비되지 않았거나 로그인 상태가 아닙니다.");
    }

    const currentUser = auth.currentUser;
    const currentUserId = currentUser.uid;

    try {
      await deleteUserDocument(currentUserId);

      await fbDeleteUser(currentUser);
      
      return true;

    } catch (error) {
      if (error.code === 'auth/requires-recent-login') {
        alert("계정 삭제는 보안을 위해 최근에 로그인한 사용자만 가능합니다. 다시 로그인한 후 시도해 주세요.");
      }
      throw error;
    }
  }, [firebaseReady]);

  const modifyUserCashById = useCallback(
    async (targetUserId, amount, operationType, logDescription = null) => {
      if (!firebaseReady || !targetUserId || typeof amount !== "number") {
        return false;
      }

      const effectiveAmount =
        operationType === "deduct" ? -Math.abs(amount) : Math.abs(amount);

      try {
        const success = await updateUserCashInFirestore(
          targetUserId,
          effectiveAmount
        );

        if (success) {
          // Optimistically update userDoc and cache
          const currentCachedUserDoc = getCachedUserDoc(targetUserId);
          if (currentCachedUserDoc) {
            const newCash = (currentCachedUserDoc.cash || 0) + effectiveAmount;
            const updatedUserDoc = { ...currentCachedUserDoc, cash: newCash };
            setCachedUserDoc(targetUserId, updatedUserDoc);

            // If the targetUserId is the currently logged-in user, update the userDoc state
            if (targetUserId === (userDoc?.id || userDoc?.uid)) {
              setUserDoc(updatedUserDoc);
            }
          }

          if (logDescription) {
            try {
              const txSuccess = await addTransaction(targetUserId, effectiveAmount, logDescription);
              if (!txSuccess) {
              }
            } catch (txError) {
            }
          }
          
          return true;
        } else {
          return false;
        }
      } catch (error) {
        console.error("Error in modifyUserCashById:", error);
        return false;
      }
    },
    [firebaseReady, userDoc, getCachedUserDoc, setCachedUserDoc, setUserDoc]
  );

  const deductCashFromUserById = useCallback(
    (targetUserId, amount, logDescription = null) =>
      modifyUserCashById(targetUserId, amount, "deduct", logDescription),
    [modifyUserCashById]
  );

  const addCashToUserById = useCallback(
    (targetUserId, amount, logDescription = null) => 
      modifyUserCashById(targetUserId, amount, "add", logDescription),
    [modifyUserCashById]
  );

  const deductCash = useCallback(
    async (amount, logDescription = null) => {
      const currentUserId = userDoc?.id || userDoc?.uid;
      if (!currentUserId) {
        return false;
      }
      return modifyUserCashById(currentUserId, amount, "deduct", logDescription);
    },
    [userDoc, modifyUserCashById]
  );

  const addCash = useCallback(
    async (amount, logDescription = null) => {
      const currentUserId = userDoc?.id || userDoc?.uid;
      if (!currentUserId) {
        return false;
      }
      return modifyUserCashById(currentUserId, amount, "add", logDescription);
    },
    [userDoc, modifyUserCashById]
  );

  const modifyUserCouponsById = useCallback(
    async (targetUserId, amount, operationType) => {
      if (!firebaseReady || !targetUserId || typeof amount !== "number") {
        return false;
      }

      const effectiveAmount =
        operationType === "deduct" ? -Math.abs(amount) : Math.abs(amount);

      try {
        const success = await updateUserCouponsInFirestore(
          targetUserId,
          effectiveAmount
        );

        if (success) {
          // 수정: 현금과 마찬가지로, 쿠폰도 로컬에서 미리 계산하지 않고 
          // onSnapshot 리스너가 서버의 정확한 데이터를 받아오도록 합니다.
          
          return true;
        } else {
          return false;
        }
      } catch (error) {
        return false;
      }
    },
    [firebaseReady, userDoc]
  );

  const deductCouponsFromUserById = useCallback(
    (targetUserId, amount) =>
      modifyUserCouponsById(targetUserId, amount, "deduct"),
    [modifyUserCouponsById]
  );

  const addCouponsToUserById = useCallback(
    (targetUserId, amount) => modifyUserCouponsById(targetUserId, amount, "add"),
    [modifyUserCouponsById]
  );

  const fetchUserDocument = useCallback(
    async (userId) => {
      if (!firebaseReady || !userId) {
        return null;
      }
      
      try {
        // 최적화: 캐시된 데이터 먼저 확인
        let cachedDoc = getCachedUserDoc(userId);
        if (cachedDoc) {
          return cachedDoc;
        }
        
        // 캐시가 없으면 서버에서 가져오기
        const doc = await getUserDocument(userId);
        if (doc) {
          setCachedUserDoc(userId, doc);
        }
        return doc;
      } catch (error) {
        return null;
      }
    },
    [firebaseReady, getCachedUserDoc, setCachedUserDoc]
  );

  // 핵심 변경: 학급 구성원 강제 새로고침 함수
  const refreshClassmates = useCallback(
    async () => {
      const currentClassCode = userDoc?.classCode;
      const currentUserId = userDoc?.id || userDoc?.uid;
      
      if (!currentClassCode || currentClassCode === '미지정') {
        return;
      }
      
      return fetchClassmatesFromFirestore(currentClassCode, currentUserId, true);
    },
    [fetchClassmatesFromFirestore, userDoc]
  );

  // 최적화: 특정 사용자 문서만 새로고침
  const refreshUserDocument = useCallback(
    async (userId) => {
      // userId가 없으면 현재 사용자 ID 사용
      const targetUserId = userId || userDoc?.id || userDoc?.uid;
      if (!targetUserId) return null;

      console.log("[AuthContext] refreshUserDocument 호출:", targetUserId);

      // 캐시 무효화
      userDocCacheRef.current.delete(targetUserId);
      userDocFetchTimeRef.current.delete(targetUserId);

      // 서버에서 새로 가져오기
      const freshDoc = await fetchUserDocument(targetUserId);

      // 현재 로그인한 사용자의 문서라면 즉시 상태 업데이트
      if (freshDoc && targetUserId === (userDoc?.id || userDoc?.uid)) {
        console.log("[AuthContext] userDoc 즉시 업데이트:", freshDoc.cash);
        setUserDoc(freshDoc);
      }

      return freshDoc;
    },
    [fetchUserDocument, userDoc]
  );

  // 🔥 낙관적 업데이트 함수 (Cloud Function 호출 시 즉시 UI 업데이트)
  const optimisticUpdate = useCallback(
    (updates) => {
      if (!userDoc?.id) {
        console.warn('[AuthContext] optimisticUpdate: userDoc가 없습니다');
        return;
      }

      const updatedUserDoc = { ...userDoc };

      Object.keys(updates).forEach(key => {
        const value = updates[key];

        // 숫자 증감 처리 (예: cash: -1000, coupons: +5)
        if (typeof value === 'number') {
          const currentValue = Number(userDoc[key]) || 0;
          updatedUserDoc[key] = currentValue + value;
        } else {
          // 직접 값 설정
          updatedUserDoc[key] = value;
        }
      });

      // 즉시 상태 업데이트 (Firebase 응답 기다리지 않음)
      setUserDoc(updatedUserDoc);

      // 캐시도 업데이트
      userDocCacheRef.current.set(userDoc.id, updatedUserDoc);

      console.log('[AuthContext] 낙관적 업데이트 완료:', {
        updates,
        newCash: updatedUserDoc.cash,
        newCoupons: updatedUserDoc.coupons
      });
    },
    [userDoc]
  );

  // Context value를 useMemo로 메모이제이션하여 불필요한 리렌더링 방지
  const value = useMemo(
    () => ({
      user,
      userDoc,
      setUserDoc,
      users,
      classmates,
      allClassMembers,
      setAllClassMembers,
      loading,
      firebaseReady,
      auth: auth,
      functions: functions,
      loginWithEmailPassword,
      logout,
      updateUser,
      optimisticUpdate,
      changePassword,
      deleteCurrentUserAccount,
      fetchUserDocument,
      fetchAllUsers: fetchClassmatesFromFirestore, // 변경: 이름은 유지하되 학급 구성원만 조회
      refreshAllUsers: refreshClassmates, // 변경: 학급 구성원 새로고침
      refreshUserDocument,
      loginWithFirebaseUID,
      isAdmin: isAdminFn,
      isSuperAdmin: isSuperAdminFn,
      deductCashFromUserById,
      addCashToUserById,
      deductCash,
      addCash,
      deductCouponsFromUserById,
      addCouponsToUserById,
    }),
    [
      user,
      userDoc,
      users,
      classmates,
      allClassMembers,
      loading,
      firebaseReady,
      loginWithEmailPassword,
      logout,
      updateUser,
      optimisticUpdate,
      changePassword,
      deleteCurrentUserAccount,
      fetchUserDocument,
      fetchClassmatesFromFirestore,
      refreshClassmates,
      refreshUserDocument,
      loginWithFirebaseUID,
      isAdminFn,
      isSuperAdminFn,
      deductCashFromUserById,
      addCashToUserById,
      deductCash,
      addCash,
      deductCouponsFromUserById,
      addCouponsToUserById,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};