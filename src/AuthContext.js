// src/AuthContext.js
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
  isInitialized,
  authStateListener,
  signInWithEmailAndPassword as fbSignIn,
  signOut as fbSignOut,
  getUserDocument,
  addUserDocument,
  updateUserDocument,
  getAllUsersDocuments,
  updateUserCashInFirestore,
  serverTimestamp,
} from "./firebase"; // firebase.js 경로는 실제 프로젝트 구조에 맞게 확인해주세요.
import { doc, onSnapshot, Timestamp } from "firebase/firestore";

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
      users: [],
      loading: true,
      firebaseReady: false,
      auth: null,
      loginWithEmailPassword: async () => {
        console.error("AuthProvider not ready: loginWithEmailPassword");
        throw new Error("Auth service unavailable.");
      },
      logout: async () => {
        console.error("AuthProvider not ready: logout");
      },
      updateUser: async () => {
        console.error("AuthProvider not ready: updateUser");
        return false;
      },
      fetchUserDocument: async () => {
        console.error("AuthProvider not ready: fetchUserDocument");
        return null;
      },
      fetchAllUsers: async () => {
        console.error("AuthProvider not ready: fetchAllUsers");
        return [];
      },
      loginWithFirebaseUID: async () => {
        console.error("AuthProvider not ready: loginWithFirebaseUID");
        return false;
      },
      isAdmin: () => false,
      isSuperAdmin: () => false,
      deductCashFromUserById: async () => {
        console.error("AuthProvider not ready: deductCashFromUserById");
        return false;
      },
      addCashToUserById: async () => {
        console.error("AuthProvider not ready: addCashToUserById");
        return false;
      },
      deductCash: async () => {
        console.error("AuthProvider not ready: deductCash");
        return false;
      },
      addCash: async () => {
        console.error("AuthProvider not ready: addCash");
        return false;
      },
    };
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [firebaseReady, setFirebaseReady] = useState(false);

  const lastLoginUpdateRef = useRef(new Set());
  const usersFetchTimeRef = useRef(0);
  const initializationCompleteRef = useRef(false);
  const currentUserUidRef = useRef(null);

  useEffect(() => {
    if (initializationCompleteRef.current) return;

    const checkFirebaseInit = () => {
      const initialized = isInitialized();
      if (initialized) {
        console.log("[AuthContext] Firebase 서비스 사용 가능");
        setFirebaseReady(true);
        initializationCompleteRef.current = true;
      } else {
        setTimeout(checkFirebaseInit, 100);
      }
    };
    checkFirebaseInit();
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

  const fetchAllUsersFromFirestore = useCallback(
    async (isCurrentUserAdmin, currentUserIdToExclude = null) => {
      if (!firebaseReady) {
        console.warn(
          "[AuthContext] fetchAllUsersFromFirestore: Firebase 미준비"
        );
        return;
      }

      const now = Date.now();
      if (now - usersFetchTimeRef.current < 5 * 60 * 1000) {
        // 5분 캐시
        console.log("[AuthContext] 사용자 목록 캐시 사용 (5분 이내 조회됨)");
        return;
      }

      console.log("[AuthContext] 모든 사용자 정보 업데이트 시도...");
      try {
        let usersList = await getAllUsersDocuments();
        if (currentUserIdToExclude && !isCurrentUserAdmin) {
          usersList = usersList.filter((u) => u.id !== currentUserIdToExclude);
        }
        setUsers(usersList || []);
        usersFetchTimeRef.current = now;
        console.log(
          `[AuthContext] 모든 사용자 정보 업데이트 완료: ${
            usersList?.length || 0
          }명`
        );
      } catch (error) {
        console.error("[AuthContext] 모든 사용자 정보 가져오기 오류:", error);
        setUsers([]);
      }
    },
    [firebaseReady]
  );

  const updateLastLoginAtSeparately = useCallback(
    async (firebaseUid, currentLastLogin) => {
      if (lastLoginUpdateRef.current.has(firebaseUid)) {
        console.log(
          `[AuthContext] ${firebaseUid} lastLoginAt 이미 업데이트됨, 스킵`
        );
        return;
      }

      const now = Date.now();
      let shouldUpdate = false;

      if (!currentLastLogin) {
        shouldUpdate = true;
      } else if (currentLastLogin instanceof Timestamp) {
        const lastLoginTime = currentLastLogin.toDate().getTime();
        if (now - lastLoginTime > 60 * 60 * 1000) {
          // 1시간 이상 경과 시 업데이트
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
        if (now - lastLoginTime > 60 * 60 * 1000) {
          shouldUpdate = true;
        }
      }

      if (!shouldUpdate) {
        console.log(`[AuthContext] ${firebaseUid} lastLoginAt 업데이트 불필요`);
        return;
      }

      try {
        console.log(
          `[AuthContext] ${firebaseUid} lastLoginAt 업데이트 시도...`
        );
        await updateUserDocument(firebaseUid, {
          lastLoginAt: serverTimestamp(),
        });
        lastLoginUpdateRef.current.add(firebaseUid);
        console.log(`[AuthContext] ${firebaseUid} lastLoginAt 업데이트 완료`);
      } catch (updateError) {
        console.error(
          `[AuthContext] ${firebaseUid} lastLoginAt 업데이트 오류:`,
          updateError
        );
      }
    },
    []
  );

  useEffect(() => {
    if (!firebaseReady || !auth) {
      console.log(
        "[AuthContext] authStateListener 대기: Firebase 또는 auth 미준비"
      );
      setLoading(true);
      return;
    }

    console.log("[AuthContext] authStateListener 설정");
    setLoading(true);

    let firestoreUnsubscribe = null;

    const authUnsubscribe = authStateListener(async (firebaseAuthUser) => {
      console.log(
        "[AuthContext] Auth state changed:",
        firebaseAuthUser ? firebaseAuthUser.uid : "logged out"
      );

      if (firestoreUnsubscribe) {
        console.log("[AuthContext] 기존 onSnapshot 리스너 해제");
        firestoreUnsubscribe();
        firestoreUnsubscribe = null;
      }

      if (firebaseAuthUser) {
        if (currentUserUidRef.current !== firebaseAuthUser.uid) {
          console.log(
            `[AuthContext] 새 사용자 로그인: ${firebaseAuthUser.uid}`
          );
          currentUserUidRef.current = firebaseAuthUser.uid;
          usersFetchTimeRef.current = 0;
        }

        setUser(firebaseAuthUser);
        const userRef = doc(db, "users", firebaseAuthUser.uid);

        firestoreUnsubscribe = onSnapshot(
          userRef,
          async (docSnap) => {
            console.log(
              `[AuthContext] onSnapshot: 데이터 수신 (UID: ${firebaseAuthUser.uid})`
            );

            if (docSnap.exists()) {
              let docData = { id: docSnap.id, ...docSnap.data() };
              console.log(
                `[AuthContext] onSnapshot: 사용자 문서 있음. 현금: ${docData.cash}, 쿠폰: ${docData.coupons}`
              );

              // 🔥 onSnapshot을 통해 Firestore에서 직접 받은 데이터로 userDoc 설정
              setUserDoc(docData);

              const currentIsAdmin =
                docData.isAdmin === true ||
                docData.role === "admin" ||
                docData.isSuperAdmin === true;

              fetchAllUsersFromFirestore(currentIsAdmin, firebaseAuthUser.uid);

              setLoading(false);

              setTimeout(() => {
                updateLastLoginAtSeparately(
                  firebaseAuthUser.uid,
                  docData.lastLoginAt
                );
              }, 1000);
            } else {
              console.log(
                `[AuthContext] onSnapshot: 사용자 문서 없음 (${firebaseAuthUser.uid}), 새로 생성합니다.`
              );
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

              try {
                await addUserDocument(firebaseAuthUser.uid, newUserData);
                console.log(`[AuthContext] onSnapshot: 사용자 문서 생성 완료.`);
                // 새 문서 생성 후 onSnapshot이 자동으로 다시 호출되어 setUserDoc을 업데이트합니다.
              } catch (addError) {
                console.error(
                  "[AuthContext] onSnapshot: 사용자 문서 생성 오류:",
                  addError
                );
                setUser(null);
                setUserDoc(null);
                setUsers([]);
                setLoading(false);
              }
            }
          },
          (error) => {
            console.error("[AuthContext] onSnapshot 오류:", error);
            setUser(null);
            setUserDoc(null);
            setUsers([]);
            setLoading(false);
          }
        );
      } else {
        setUser(null);
        setUserDoc(null);
        setUsers([]);
        localStorage.removeItem("currentUserAuthUID");

        lastLoginUpdateRef.current.clear();
        usersFetchTimeRef.current = 0;
        currentUserUidRef.current = null;

        setLoading(false);
      }
    });

    return () => {
      console.log("[AuthContext] authStateListener 및 onSnapshot 해제");
      authUnsubscribe();
      if (firestoreUnsubscribe) {
        firestoreUnsubscribe();
      }
    };
  }, [
    firebaseReady,
    // auth, // auth 객체 변경은 드물므로, 필요시 주석 해제
    fetchAllUsersFromFirestore,
    updateLastLoginAtSeparately,
  ]);

  const loginWithEmailPassword = useCallback(
    async (email, password) => {
      if (!firebaseReady || !auth) {
        console.error(
          "[AuthContext] loginWithEmailPassword: Firebase 또는 auth 미준비"
        );
        throw new Error("인증 서비스가 준비되지 않았습니다.");
      }

      let emailString = email;
      if (typeof emailString !== "string" || !emailString.includes("@")) {
        console.error(
          "[AuthContext] loginWithEmailPassword: email 파라미터가 유효한 문자열 아님:",
          emailString
        );
        throw new Error("이메일 형식이 올바르지 않습니다.");
      }

      setLoading(true);
      try {
        const userCredential = await fbSignIn(auth, emailString, password);
        return userCredential.user;
      } catch (error) {
        console.error("[AuthContext] 이메일 로그인 오류:", error);
        setLoading(false);
        throw error;
      }
    },
    [firebaseReady, auth]
  );

  const loginWithFirebaseUID = useCallback(
    async (firebaseUid) => {
      if (!firebaseReady || !auth || !firebaseUid) {
        console.warn(
          "[AuthContext] loginWithFirebaseUID: 미준비 또는 UID 없음"
        );
        return false;
      }

      setLoading(true);
      try {
        const docData = await getUserDocument(firebaseUid);
        if (docData) {
          setUser(
            auth.currentUser && auth.currentUser.uid === firebaseUid
              ? auth.currentUser
              : { uid: firebaseUid, email: docData.email }
          );
          // 🔥 여기서도 onSnapshot이 userDoc을 설정하도록 유도할 수 있으나,
          // loginWithFirebaseUID는 authStateListener와 별개로 작동할 수 있으므로 직접 설정
          setUserDoc(docData);
          localStorage.setItem("currentUserAuthUID", firebaseUid);
          currentUserUidRef.current = firebaseUid;

          setTimeout(() => {
            updateLastLoginAtSeparately(firebaseUid, docData.lastLoginAt);
          }, 500);

          const currentIsAdmin =
            docData &&
            (docData.isAdmin === true ||
              docData.role === "admin" ||
              docData.isSuperAdmin === true);

          await fetchAllUsersFromFirestore(currentIsAdmin, firebaseUid);
          return true;
        } else {
          console.warn(
            `[AuthContext] loginWithFirebaseUID: ${firebaseUid}에 대한 사용자 문서 없음`
          );
          return false;
        }
      } catch (error) {
        console.error("[AuthContext] UID 로그인 오류:", error);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [
      firebaseReady,
      auth,
      fetchAllUsersFromFirestore,
      updateLastLoginAtSeparately,
    ]
  );

  const logout = useCallback(async () => {
    if (!firebaseReady || !auth) {
      console.warn("[AuthContext] logout: Firebase 또는 auth 미준비");
      return;
    }
    try {
      await fbSignOut(auth);
    } catch (error) {
      console.error("[AuthContext] 로그아웃 오류:", error);
    }
  }, [firebaseReady, auth]);

  // 🔥 수정된 updateUser 함수: 로컬 낙관적 업데이트 제거, onSnapshot에 의존
  const updateUser = useCallback(
    async (updates) => {
      const currentUserId = userDoc?.id; // 함수 생성 시점의 userDoc.id 캡처

      if (!firebaseReady || !currentUserId) {
        console.warn(
          "[AuthContext] updateUser: Firebase 미준비 또는 사용자 ID 없음",
          { firebaseReady, userId: currentUserId }
        );
        return false;
      }

      console.log(
        `[AuthContext] updateUser 시작 (사용자 ID: ${currentUserId}), Firestore 업데이트 내용:`,
        updates
      );

      const firestoreUpdates = {
        ...updates,
        updatedAt: serverTimestamp(),
      };

      try {
        // Firestore 문서만 업데이트
        const success = await updateUserDocument(
          currentUserId,
          firestoreUpdates
        );

        if (success) {
          console.log(
            `[AuthContext] 사용자 ID(${currentUserId}) Firestore 문서 업데이트 성공. onSnapshot이 로컬 userDoc 상태를 곧 업데이트합니다.`
          );
          // 로컬 setUserDoc 호출을 제거하여 onSnapshot이 상태 업데이트를 담당하도록 함
          // 이렇게 하면 FieldValue 객체가 로컬 상태에 직접 들어가는 것을 방지할 수 있음
          return true;
        } else {
          console.error(
            `[AuthContext] 사용자 ID(${currentUserId}) Firestore 문서 업데이트 실패.`
          );
          return false;
        }
      } catch (error) {
        console.error(
          `[AuthContext] 사용자 ID(${currentUserId}) 데이터 업데이트 중 오류 발생:`,
          error
        );
        return false;
      }
    },
    [firebaseReady, userDoc?.id] // userDoc.id가 변경될 때만 함수가 재생성되도록 함
  );

  const modifyUserCashById = useCallback(
    async (targetUserId, amount, operationType) => {
      if (!firebaseReady || !targetUserId || typeof amount !== "number") {
        console.warn(
          "[AuthContext] modifyUserCashById: 유효하지 않은 인자 또는 Firebase 미준비",
          { firebaseReady, targetUserId, amount }
        );
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
          console.log(
            `[AuthContext] Firestore 현금 업데이트 성공 for ${targetUserId}. 금액: ${effectiveAmount}. onSnapshot이 로컬 상태를 업데이트합니다.`
          );
          // 로컬 상태 업데이트는 onSnapshot에 의해 처리됨
          return true;
        } else {
          console.error(
            `[AuthContext] ${targetUserId}의 현금 ${operationType} 실패 (Firestore 업데이트 실패)`
          );
          return false;
        }
      } catch (error) {
        console.error(
          `[AuthContext] ${targetUserId}의 현금 ${operationType} 중 오류:`,
          error
        );
        return false;
      }
    },
    [firebaseReady]
  );

  const deductCashFromUserById = useCallback(
    (targetUserId, amount) =>
      modifyUserCashById(targetUserId, amount, "deduct"),
    [modifyUserCashById]
  );

  const addCashToUserById = useCallback(
    (targetUserId, amount) => modifyUserCashById(targetUserId, amount, "add"),
    [modifyUserCashById]
  );

  const deductCash = useCallback(
    async (amount) => {
      const currentUserId = userDoc?.id;
      if (!currentUserId) {
        console.warn("[AuthContext] deductCash: 현재 사용자 ID 없음");
        return false;
      }
      return modifyUserCashById(currentUserId, amount, "deduct");
    },
    [userDoc?.id, modifyUserCashById]
  );

  const addCash = useCallback(
    async (amount) => {
      const currentUserId = userDoc?.id;
      if (!currentUserId) {
        console.warn("[AuthContext] addCash: 현재 사용자 ID 없음");
        return false;
      }
      return modifyUserCashById(currentUserId, amount, "add");
    },
    [userDoc?.id, modifyUserCashById]
  );

  const fetchUserDocument = useCallback(
    async (userId) => {
      if (!firebaseReady || !userId) {
        console.warn(
          "[AuthContext] fetchUserDocument: Firebase 미준비 또는 사용자 ID 없음"
        );
        return null;
      }
      try {
        return await getUserDocument(userId);
      } catch (error) {
        console.error(
          `[AuthContext] ${userId}의 사용자 문서 가져오기 오류:`,
          error
        );
        return null;
      }
    },
    [firebaseReady]
  );

  const value = useMemo(
    () => ({
      user,
      userDoc,
      users,
      loading,
      firebaseReady,
      auth,
      loginWithEmailPassword,
      logout,
      updateUser,
      fetchUserDocument,
      fetchAllUsers: fetchAllUsersFromFirestore,
      loginWithFirebaseUID,
      isAdmin: isAdminFn,
      isSuperAdmin: isSuperAdminFn,
      deductCashFromUserById,
      addCashToUserById,
      deductCash,
      addCash,
    }),
    [
      user,
      userDoc,
      users,
      loading,
      firebaseReady,
      auth,
      loginWithEmailPassword,
      logout,
      updateUser,
      fetchUserDocument,
      fetchAllUsersFromFirestore,
      loginWithFirebaseUID,
      isAdminFn,
      isSuperAdminFn,
      deductCashFromUserById,
      addCashToUserById,
      deductCash,
      addCash,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
