/* RealEstateRegistry.js (모든 함수가 포함된 최종본 - Portal 적용 및 관리자 기능 강화) */
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom"; // ⭐ Portal 사용을 위해 ReactDOM 임포트
import "./RealEstateRegistry.css";
import { useAuth } from "./AuthContext";

// firebase.js에서 익스포트하는 함수들
import {
  db,
  functions,
  serverTimestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  runTransaction,
  increment,
} from "./firebase";
import { httpsCallable } from "firebase/functions";

// onSnapshot과 orderBy는 firebase/firestore에서 직접 가져옵니다.
import {
  onSnapshot as firebaseOnSnapshot,
  orderBy as firebaseOrderBy,
} from "firebase/firestore";

const DEFAULT_SETTINGS = {
  totalProperties: 30,
  basePrice: 50000000,
  rentPercentage: 1,
  layoutColumns: 6,
  lastRentCollection: null,
};

const RealEstateRegistry = () => {
  const {
    userDoc: currentUser,
    loading: authLoading,
    isAdmin,
    refreshUserDocument,
    optimisticUpdate,
  } = useAuth();

  const classCode = currentUser?.classCode;

  const [properties, setProperties] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [allUsersData, setAllUsersData] = useState([]);

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [operationLoading, setOperationLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [showQuickAction, setShowQuickAction] = useState(null);
  const [adminInputs, setAdminInputs] = useState({ ...DEFAULT_SETTINGS });

  // 팝업이 열릴 때 body 스크롤 막기/해제하기
  useEffect(() => {
    const isModalOpen = showAdminPanel || selectedProperty || showQuickAction;
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showAdminPanel, selectedProperty, showQuickAction]);

  // Settings 로드 Effect (폴링 방식으로 변경 - 무한 루프 방지)
  useEffect(() => {
    if (!classCode) {
      setSettings(DEFAULT_SETTINGS);
      setAdminInputs({ ...DEFAULT_SETTINGS });
      setSettingsLoading(false);
      return;
    }

    let mounted = true;
    setSettingsLoading(true);

    const settingsRefInstance = doc(
      db,
      "classes",
      classCode,
      "realEstateSettings",
      "settingsDoc"
    );

    const fetchSettings = async () => {
      if (!mounted) return;

      try {
        const docSnap = await getDoc(settingsRefInstance);
        if (!mounted) return;

        if (docSnap.exists()) {
          const fetchedSettings = docSnap.data();
          if (fetchedSettings.lastRentCollection?.toDate) {
            fetchedSettings.lastRentCollection =
              fetchedSettings.lastRentCollection.toDate();
          }
          setSettings(fetchedSettings);
          setAdminInputs({
            totalProperties: fetchedSettings.totalProperties.toString(),
            basePrice: fetchedSettings.basePrice.toString(),
            rentPercentage: fetchedSettings.rentPercentage.toString(),
            layoutColumns: fetchedSettings.layoutColumns.toString(),
          });
        } else {
          // 설정이 없으면 기본값 사용 (관리자만 생성 가능)
          if (mounted) {
            setSettings(DEFAULT_SETTINGS);
            setAdminInputs({ ...DEFAULT_SETTINGS });
          }

          // 관리자인 경우에만 기본 설정 생성 시도
          if (isAdmin && isAdmin()) {
            try {
              await setDoc(settingsRefInstance, {
                ...DEFAULT_SETTINGS,
                createdAt: serverTimestamp(),
                classCode: classCode,
                updatedAt: serverTimestamp(),
              });
            } catch (error) {
              console.warn("[RealEstate] 기본 설정 생성 실패 (관리자만 가능):", error.message);
            }
          }
        }
        if (mounted) {
          setSettingsLoading(false);
        }
      } catch (error) {
        // 학생 계정은 settings 읽기 권한이 없을 수 있으므로 warn으로 처리
        console.warn("[RealEstate] Settings 읽기 실패 (기본값 사용):", error.message);
        if (mounted) {
          setSettings(DEFAULT_SETTINGS);
          setAdminInputs({ ...DEFAULT_SETTINGS });
          setSettingsLoading(false);
        }
      }
    };

    fetchSettings(); // 초기 로드
    const interval = setInterval(fetchSettings, 300000); // 5분마다 폴링

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [classCode]);

  // Properties 로드 Effect (폴링 방식으로 변경 - 무한 루프 방지)
  useEffect(() => {
    if (!classCode) {
      setProperties([]);
      setPropertiesLoading(false);
      return;
    }

    let mounted = true;
    setPropertiesLoading(true);

    const propertiesCollectionRefInstance = collection(
      db,
      "classes",
      classCode,
      "realEstateProperties"
    );
    const q = query(propertiesCollectionRefInstance, firebaseOrderBy("id"));

    const fetchProperties = async () => {
      if (!mounted) return;

      try {
        const querySnapshot = await getDocs(q);
        if (!mounted) return;

        const propsData = querySnapshot.docs.map((doc) => ({
          firestoreDocId: doc.id,
          ...doc.data(),
          lastRentPayment: doc.data().lastRentPayment?.toDate
            ? doc.data().lastRentPayment.toDate()
            : null,
        }));
        propsData.sort((a, b) => parseInt(a.id) - parseInt(b.id));

        if (mounted) {
          setProperties(propsData);
          setPropertiesLoading(false);
        }
      } catch (error) {
        console.error("[RealEstate] Error fetching properties:", error);
        if (mounted) {
          setProperties([]);
          setPropertiesLoading(false);
        }
      }
    };

    fetchProperties(); // 초기 로드
    const interval = setInterval(fetchProperties, 300000); // 5분마다 폴링

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [classCode]);

  // 학급 사용자 목록 로드 Effect
  useEffect(() => {
    if (!classCode) {
      setAllUsersData([]);
      setUsersLoading(false);
      return;
    }
    setUsersLoading(true);
    const usersQuery = query(
      collection(db, "users"),
      where("classCode", "==", classCode)
    );
    getDocs(usersQuery)
      .then((snapshot) => {
        setAllUsersData(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );
      })
      .catch((error) => {
        console.error("[RealEstate] Error fetching users by classCode:", error);
        setAllUsersData([]);
      })
      .finally(() => setUsersLoading(false));
  }, [classCode]);

  const handleInitializeProperties = async () => {
    if (!classCode || !currentUser || !isAdmin()) {
      alert("초기화 권한이 없거나 학급 정보가 없습니다.");
      return;
    }
    if (
      !window.confirm(
        `정말로 학급 [${classCode}]의 모든 부동산을 정부 소유 초기값으로 되돌리시겠습니까? 이 작업은 되돌릴 수 없습니다.`
      )
    )
      return;
    setOperationLoading(true);
    try {
      const currentSettings = settings;
      const basePrice = currentSettings.basePrice;
      const rent = Math.round(
        basePrice * (currentSettings.rentPercentage / 100)
      );
      const batch = writeBatch(db);
      const propCollRef = collection(
        db,
        "classes",
        classCode,
        "realEstateProperties"
      );
      const existingPropsSnapshot = await getDocs(propCollRef);
      existingPropsSnapshot.forEach((doc) => batch.delete(doc.ref));
      for (let i = 1; i <= currentSettings.totalProperties; i++) {
        const propertyIdStr = i.toString();
        const propertyDocRef = doc(propCollRef, propertyIdStr);
        batch.set(propertyDocRef, {
          id: propertyIdStr,
          price: basePrice,
          owner: "government",
          ownerName: "정부",
          rent: rent,
          tenant: null,
          tenantId: null,
          tenantName: null,
          forSale: false,
          salePrice: 0,
          lastRentPayment: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          classCode: classCode,
        });
      }
      await batch.commit();
      alert("부동산이 성공적으로 초기화되었습니다.");
      setShowAdminPanel(false);
    } catch (error) {
      console.error("[RealEstate] Error initializing properties:", error);
      alert("부동산 초기화 중 오류 발생: " + error.message);
    } finally {
      setOperationLoading(false);
    }
  };

  const handlePurchaseProperty = async (propertyId) => {
    if (!currentUser || !classCode) {
      alert("로그인이 필요하거나 학급 정보가 없습니다.");
      return;
    }

    const property = properties.find(p => p.id === propertyId);
    if (!property) {
      alert("부동산 정보를 찾을 수 없습니다.");
      return;
    }

    const purchasePrice = property.salePrice || property.price;

    console.log('[RealEstate] 부동산 구매 시작:', { propertyId, purchasePrice });

    // 🔥 낙관적 업데이트 1: 현금 차감
    if (optimisticUpdate) {
      optimisticUpdate({ cash: -purchasePrice });
    }

    // 🔥 낙관적 업데이트 2: 부동산 소유자 즉시 변경 (UI 업데이트)
    const previousPropertyState = { ...property };
    setProperties(prevProperties =>
      prevProperties.map(p =>
        p.id === propertyId
          ? {
              ...p,
              owner: currentUser.id,
              ownerName: currentUser.name,
              forSale: false,
              salePrice: null
            }
          : p
      )
    );

    setOperationLoading(true);

    try {
      const purchaseRealEstateFunction = httpsCallable(functions, 'purchaseRealEstate');
      const result = await purchaseRealEstateFunction({ propertyId });

      console.log('[RealEstate] 구매 성공:', result.data);

      if (refreshUserDocument) refreshUserDocument();
      setShowQuickAction(null);
      setSelectedProperty(null);
      alert(`부동산 #${propertyId}를 성공적으로 구매했습니다.`);
    } catch (error) {
      console.error('[RealEstate] 구매 실패:', error);

      // 실패 시 롤백 1: 현금 복구
      if (optimisticUpdate) {
        optimisticUpdate({ cash: purchasePrice });
      }

      // 실패 시 롤백 2: 부동산 상태 복구
      setProperties(prevProperties =>
        prevProperties.map(p =>
          p.id === propertyId ? previousPropertyState : p
        )
      );

      alert(error.message || '부동산 구매 중 오류가 발생했습니다.');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleSetForSale = async (propertyId) => {
    const property = properties.find((p) => p.id === propertyId);
    if (
      !property ||
      !currentUser ||
      property.owner !== currentUser.id ||
      !classCode
    ) {
      alert("소유한 부동산만 판매할 수 있거나 정보가 부족합니다.");
      return;
    }
    const salePriceInput = prompt("판매 가격을 입력하세요 (숫자만):");
    if (!salePriceInput) return;
    const salePrice = parseInt(salePriceInput);
    if (isNaN(salePrice) || salePrice <= 0) {
      alert("유효한 판매 가격을 입력하세요.");
      return;
    }

    // 🔥 낙관적 업데이트: 판매 상태 즉시 변경
    const previousPropertyState = { ...property };
    setProperties(prevProperties =>
      prevProperties.map(p =>
        p.id === propertyId
          ? { ...p, forSale: true, salePrice: salePrice }
          : p
      )
    );

    setOperationLoading(true);
    const propertyRef = doc(
      db,
      "classes",
      classCode,
      "realEstateProperties",
      propertyId
    );
    try {
      await updateDoc(propertyRef, {
        forSale: true,
        salePrice: salePrice,
        updatedAt: serverTimestamp(),
      });
      setShowQuickAction(null);
      setSelectedProperty(null);
      alert("판매 설정이 완료되었습니다.");
    } catch (error) {
      console.error("판매 설정 오류:", error);

      // 실패 시 롤백
      setProperties(prevProperties =>
        prevProperties.map(p =>
          p.id === propertyId ? previousPropertyState : p
        )
      );

      alert("판매 설정 중 오류 발생: " + error.message);
    } finally {
      setOperationLoading(false);
    }
  };

    // 관리자가 정부 소유 부동산 판매 설정
    const handleAdminSetForSale = async (propertyId) => {
        if (!isAdmin()) {
            alert("권한이 없습니다.");
            return;
        }
        const salePriceInput = prompt("판매 가격을 입력하세요 (숫자만):");
        if (!salePriceInput) return;
        const salePrice = parseInt(salePriceInput);
        if (isNaN(salePrice) || salePrice <= 0) {
            alert("유효한 판매 가격을 입력하세요.");
            return;
        }

        // 🔥 낙관적 업데이트: 판매 상태 즉시 변경
        const property = properties.find(p => p.id === propertyId);
        const previousPropertyState = property ? { ...property } : null;
        setProperties(prevProperties =>
          prevProperties.map(p =>
            p.id === propertyId
              ? { ...p, forSale: true, salePrice: salePrice }
              : p
          )
        );

        setOperationLoading(true);
        const propertyRef = doc(db, "classes", classCode, "realEstateProperties", propertyId);
        try {
            await updateDoc(propertyRef, {
                forSale: true,
                salePrice: salePrice,
                updatedAt: serverTimestamp(),
            });
            setShowQuickAction(null);
            setSelectedProperty(null);
            alert("정부 소유 부동산 판매 설정이 완료되었습니다.");
        } catch (error) {
            console.error("정부 소유 부동산 판매 설정 오류:", error);

            // 실패 시 롤백
            if (previousPropertyState) {
              setProperties(prevProperties =>
                prevProperties.map(p =>
                  p.id === propertyId ? previousPropertyState : p
                )
              );
            }

            alert("처리 중 오류 발생: " + error.message);
        } finally {
            setOperationLoading(false);
        }
    };

    // 관리자가 정부 소유 부동산 판매 취소
    const handleAdminCancelSale = async (propertyId) => {
        if (!isAdmin()) {
            alert("권한이 없습니다.");
            return;
        }

        // 🔥 낙관적 업데이트: 판매 취소 즉시 반영
        const property = properties.find(p => p.id === propertyId);
        const previousPropertyState = property ? { ...property } : null;
        setProperties(prevProperties =>
          prevProperties.map(p =>
            p.id === propertyId
              ? { ...p, forSale: false, salePrice: null }
              : p
          )
        );

        setOperationLoading(true);
        const propertyRef = doc(db, "classes", classCode, "realEstateProperties", propertyId);
        try {
            await updateDoc(propertyRef, {
                forSale: false,
                salePrice: 0,
                updatedAt: serverTimestamp(),
            });
            setShowQuickAction(null);
            setSelectedProperty(null);
            alert("정부 소유 부동산 판매가 취소되었습니다.");
        } catch (error) {
            console.error("정부 소유 부동산 판매 취소 오류:", error);

            // 실패 시 롤백
            if (previousPropertyState) {
              setProperties(prevProperties =>
                prevProperties.map(p =>
                  p.id === propertyId ? previousPropertyState : p
                )
              );
            }

            alert("처리 중 오류 발생: " + error.message);
        } finally {
            setOperationLoading(false);
        }
    };


  const handleCancelSale = async (propertyId) => {
    if (!classCode) return;

    // 🔥 낙관적 업데이트: 판매 취소 즉시 반영
    const property = properties.find(p => p.id === propertyId);
    const previousPropertyState = property ? { ...property } : null;
    setProperties(prevProperties =>
      prevProperties.map(p =>
        p.id === propertyId
          ? { ...p, forSale: false, salePrice: null }
          : p
      )
    );

    setOperationLoading(true);
    const propertyRef = doc(
      db,
      "classes",
      classCode,
      "realEstateProperties",
      propertyId
    );
    try {
      await updateDoc(propertyRef, {
        forSale: false,
        salePrice: 0,
        updatedAt: serverTimestamp(),
      });
      setShowQuickAction(null);
      setSelectedProperty(null);
      alert("판매가 취소되었습니다.");
    } catch (error) {
      console.error("판매 취소 오류:", error);

      // 실패 시 롤백
      if (previousPropertyState) {
        setProperties(prevProperties =>
          prevProperties.map(p =>
            p.id === propertyId ? previousPropertyState : p
          )
        );
      }

      alert("판매 취소 중 오류 발생: " + error.message);
    } finally {
      setOperationLoading(false);
    }
  };

  const handleTenancy = async (propertyId) => {
    if (!currentUser || !classCode) return;

    const isAlreadyTenantElsewhere = properties.some(
      (p) => p.tenantId === currentUser.id
    );

    setOperationLoading(true);
    const propertyRef = doc(
      db,
      "classes",
      classCode,
      "realEstateProperties",
      propertyId
    );
    const userRef = doc(db, "users", currentUser.id);

    try {
      await runTransaction(db, async (transaction) => {
        const propertyDoc = await transaction.get(propertyRef);
        if (!propertyDoc.exists())
          throw new Error("부동산 정보를 찾을 수 없습니다.");
        const propertyData = propertyDoc.data();

        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists())
          throw new Error("사용자 정보를 찾을 수 없습니다.");
        const userData = userDoc.data();

        if (propertyData.tenantId === currentUser.id) {
          transaction.update(propertyRef, {
            tenant: null,
            tenantId: null,
            tenantName: null,
            lastRentPayment: null,
            updatedAt: serverTimestamp(),
          });
          alert("성공적으로 퇴거했습니다.");
          return;
        }

        if (propertyData.tenantId)
          throw new Error("이미 다른 사람이 입주해 있습니다.");
        if (isAlreadyTenantElsewhere)
          throw new Error(
            "이미 다른 부동산에 입주해 있습니다. 먼저 퇴거해야 합니다."
          );
        if (userData.cash < propertyData.rent)
          throw new Error("첫 월세를 낼 현금이 부족합니다.");

        transaction.update(userRef, {
          cash: increment(-propertyData.rent),
          updatedAt: serverTimestamp(),
        });

        if (propertyData.owner !== "government") {
          const ownerRef = doc(db, "users", propertyData.owner);
          // 자기 땅에 입주하는 경우, 자기 자신에게 월세를 내게 되므로 cash는 변동 없음
          if (propertyData.owner !== currentUser.id) {
            transaction.update(ownerRef, {
              cash: increment(propertyData.rent),
              updatedAt: serverTimestamp(),
            });
          }
        }

        transaction.update(propertyRef, {
          tenant: currentUser.name,
          tenantId: currentUser.id,
          tenantName: currentUser.name,
          lastRentPayment: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        alert("성공적으로 입주했습니다. 첫 월세가 지불되었습니다.");
      });

      if (refreshUserDocument) refreshUserDocument();
      setShowQuickAction(null);
      setSelectedProperty(null);
    } catch (error) {
      console.error("입주/퇴거 처리 오류:", error);
      alert(`처리 중 오류 발생: ${error.message}`);
    } finally {
      setOperationLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!classCode || !isAdmin()) {
      alert("설정 저장 권한이 없거나 학급 정보가 없습니다.");
      return;
    }
    const newTotal = parseInt(adminInputs.totalProperties);
    const newBasePrice = parseInt(adminInputs.basePrice);
    const newRentPercentage = parseFloat(adminInputs.rentPercentage);
    const newLayoutColumns = parseInt(adminInputs.layoutColumns);
    if (
      isNaN(newTotal) ||
      isNaN(newBasePrice) ||
      isNaN(newRentPercentage) ||
      isNaN(newLayoutColumns) ||
      newTotal <= 0 ||
      newBasePrice <= 0 ||
      newRentPercentage < 0 ||
      newLayoutColumns <= 0
    ) {
      alert(
        "유효하지 않은 값이 있습니다. 가격, 부동산 개수, 칸 수는 0보다 커야합니다."
      );
      return;
    }
    setOperationLoading(true);
    const newSettingsData = {
      totalProperties: newTotal,
      basePrice: newBasePrice,
      rentPercentage: newRentPercentage,
      layoutColumns: newLayoutColumns,
      updatedAt: serverTimestamp(),
    };
    try {
      const settingsRefInstance = doc(
        db,
        "classes",
        classCode,
        "realEstateSettings",
        "settingsDoc"
      );
      await updateDoc(settingsRefInstance, newSettingsData);
      alert(
        "설정이 성공적으로 저장되었습니다. 변경된 총 부동산 개수 등은 '부동산 초기화'를 통해 반영해야 할 수 있습니다."
      );
      setShowAdminPanel(false);
    } catch (error) {
      console.error("설정 저장 오류:", error);
      alert("설정 저장 중 오류 발생: " + error.message);
    } finally {
      setOperationLoading(false);
    }
  };

  // ⭐️ [수정된 함수] 월세 징수 로직 개선 (잔액 부족 시 전액 징수)
  const handleCollectRent = async () => {
    if (!classCode || !currentUser || !isAdmin()) {
      alert("월세 징수 권한이 없거나 학급 정보가 없습니다.");
      return;
    }
    if (
      !window.confirm(
        `학급 [${classCode}]의 모든 세입자로부터 월세를 강제 징수하시겠습니까? (잔액 부족 시 가진 현금을 모두 징수)`
      )
    )
      return;

    setOperationLoading(true);
    let successCount = 0;
    let failCount = 0;
    let unpaidUsers = []; // 미납자 명단 (전액 납부 못한 경우)
    const now = serverTimestamp();
    const propCollRef = collection(
      db,
      "classes",
      classCode,
      "realEstateProperties"
    );
    const rentedPropertiesQuery = query(
      propCollRef,
      where("tenantId", "!=", null)
    );

    try {
      const rentedPropertiesSnapshot = await getDocs(rentedPropertiesQuery);
      if (rentedPropertiesSnapshot.empty) {
        alert("월세를 징수할 세입자가 있는 부동산이 없습니다.");
        setOperationLoading(false);
        return;
      }

      for (const propDoc of rentedPropertiesSnapshot.docs) {
        const property = propDoc.data();

        if (property.tenantId && property.rent > 0) {
          try {
            // Firestore 트랜잭션을 사용하여 데이터 일관성 보장
            // 🔥 중요: 트랜잭션 내에서 모든 읽기(get)를 먼저 수행하고, 그 다음 모든 쓰기(update)를 수행해야 함
            const result = await runTransaction(db, async (transaction) => {
              // ===== 1단계: 모든 읽기 작업 수행 =====
              const tenantDocRef = doc(db, "users", property.tenantId);
              const tenantSnap = await transaction.get(tenantDocRef);

              if (!tenantSnap.exists()) {
                // 세입자를 찾을 수 없으면 계약 해지 처리
                console.warn(`세입자 ID ${property.tenantId}를 찾을 수 없습니다. 계약을 자동으로 해지합니다.`);
                transaction.update(propDoc.ref, {
                  tenantId: null,
                  tenant: null,
                  tenantName: null,
                  lastRentPayment: null,
                  updatedAt: now,
                });
                return {
                  status: "tenant_not_found",
                  propertyId: property.id,
                  tenantId: property.tenantId
                };
              }

              const tenantData = tenantSnap.data();
              const rentAmount = property.rent;

              // 집주인 문서 미리 읽기 (쓰기 전에 모든 읽기 완료)
              let ownerSnap = null;
              if (property.owner !== "government" && property.owner !== property.tenantId) {
                const ownerDocRef = doc(db, "users", property.owner);
                ownerSnap = await transaction.get(ownerDocRef);
              }

              // ===== 2단계: 모든 쓰기 작업 수행 =====
              // 돈이 부족한 경우: 있는 돈만 모두 지불하고 미납 처리
              if (tenantData.cash < rentAmount) {
                const amountPaid = tenantData.cash; // 실제 지불할 금액

                // 세입자 돈 0으로 업데이트
                transaction.update(tenantDocRef, {
                  cash: 0,
                  updatedAt: now,
                });

                // 집주인에게 지불 (0원 이상일 때)
                if (amountPaid > 0 && ownerSnap && ownerSnap.exists()) {
                  transaction.update(ownerSnap.ref, {
                    cash: increment(amountPaid),
                    updatedAt: now,
                  });
                }

                // 부동산 납부일 갱신
                transaction.update(propDoc.ref, {
                  lastRentPayment: now,
                  updatedAt: now,
                });

                // 미납으로 결과 반환
                return {
                  status: "unpaid",
                  name: tenantData.name || `ID: ${property.tenantId}`,
                };
              }

              // 돈이 충분한 경우: 정상 납부
              transaction.update(tenantDocRef, {
                cash: increment(-rentAmount),
                updatedAt: now,
              });

              if (ownerSnap && ownerSnap.exists()) {
                transaction.update(ownerSnap.ref, {
                  cash: increment(rentAmount),
                  updatedAt: now,
                });
              }

              transaction.update(propDoc.ref, {
                lastRentPayment: now,
                updatedAt: now,
              });

              return { status: "success" };
            });

            // 트랜잭션 결과에 따라 카운터 및 미납자 명단 처리
            if (result.status === "unpaid") {
              unpaidUsers.push(result.name);
            } else if (result.status === "tenant_not_found") {
              console.log(`부동산 ID ${result.propertyId}의 계약이 해지되었습니다 (세입자 ${result.tenantId} 미존재)`);
              // 계약 해지는 실패로 카운트하지 않음 (자동 처리)
            } else {
              successCount++;
            }
          } catch (transactionError) {
            console.error(
              `부동산 ID ${property.id} 월세 징수 트랜잭션 실패:`,
              transactionError
            );
            failCount++;
          }
        }
      }

      const settingsRefInstance = doc(
        db,
        "classes",
        classCode,
        "realEstateSettings",
        "settingsDoc"
      );
      await updateDoc(settingsRefInstance, {
        lastRentCollection: now,
        updatedAt: now,
      });

      let resultMessage = `월세 징수 완료: 성공 ${successCount}건, 실패 ${failCount}건, 미납(잔액부족) ${unpaidUsers.length}건.`;
      if (unpaidUsers.length > 0) {
        resultMessage += `\n\n[미납 학생 명단]\n${unpaidUsers.join(", ")}`;
      }
      alert(resultMessage);

      if (refreshUserDocument) refreshUserDocument();
    } catch (error) {
      console.error("월세 징수 중 전체 오류:", error);
      alert("월세 징수 중 심각한 오류 발생: " + error.message);
    } finally {
      setOperationLoading(false);
    }
  };

  const renderPropertyLayout = () => {
    const layoutProperties = properties.slice(0, settings.totalProperties);
    return (
      <div className="property-layout">
        <h3>🏢 부동산 배치도 (학급: {classCode || "정보 없음"})</h3>
        <div
          className="layout-grid"
          style={{
            gridTemplateColumns: `repeat(${settings.layoutColumns}, 1fr)`,
          }}
        >
          {Array.from({ length: settings.totalProperties }, (_, index) => {
            const propertyId = (index + 1).toString();
            const property = layoutProperties.find((p) => p.id === propertyId);
            
            let statusClass = "layout-cell empty";
            let title = `#${propertyId}`;

            if (property) {
                const ownerData = allUsersData?.find((u) => u.id === property.owner);
                const ownerName = property.ownerName || (property.owner === "government" ? "정부" : ownerData?.name || "소유주 불명");
                const tenantData = allUsersData?.find((u) => u.id === property.tenantId);
                const tenantDisplayName = property.tenantName || tenantData?.name;

                title = `#${propertyId} - ${ownerName}`;
                if (property.tenantId) {
                    title += ` (임차인: ${tenantDisplayName || '세입자 불명'})`;
                }

                if (property.tenantId === currentUser?.id) {
                    statusClass = "layout-cell rented-by-me";
                    title = `#${propertyId} - ${ownerName} (내가 임차중)`;
                } 
                else if (property.forSale) {
                    statusClass = "layout-cell for-sale";
                } 
                else if (property.owner === currentUser?.id) {
                    statusClass = "layout-cell owned";
                } 
                else if (property.owner === "government") {
                    statusClass = "layout-cell government";
                } 
                else {
                    statusClass = "layout-cell occupied";
                }
            }

            return (
              <div
                key={propertyId}
                className={statusClass}
                onClick={() => property && setShowQuickAction(property)}
                title={title}
              >
                {propertyId}
              </div>
            );
          })}
        </div>
        <div className="layout-legend">
          <div className="legend-item">
            <div className="legend-color government"></div>
            <span>정부 소유</span>
          </div>
          <div className="legend-item">
            <div className="legend-color owned"></div>
            <span>내 소유</span>
          </div>
          <div className="legend-item">
            <div className="legend-color rented-by-me-legend"></div>
            <span>내가 임차중</span>
          </div>
          <div className="legend-item">
            <div className="legend-color for-sale"></div>
            <span>판매중</span>
          </div>
          <div className="legend-item">
            <div className="legend-color occupied"></div>
            <span>타인 소유</span>
          </div>
        </div>
      </div>
    );
  };

  const renderQuickActionModal = () => {
    if (!showQuickAction || !currentUser) return null;
    const property = showQuickAction;
    const isOwner = property.owner === currentUser.id;
    const isTenantOfThisProperty = property.tenantId === currentUser.id;
    const isTenantElsewhere = properties.some(
      (p) => p.tenantId === currentUser.id && p.id !== property.id
    );
    const isGovProperty = property.owner === 'government';


    const ownerData = allUsersData?.find((u) => u.id === property.owner);
    const ownerName =
      property.owner === "government"
        ? "정부"
        : property.ownerName || ownerData?.name || "소유주 불명";
    const tenantData = allUsersData?.find((u) => u.id === property.tenantId);
    const tenantName = property.tenantName || tenantData?.name;

    let tenancyButton;
    if (isTenantOfThisProperty) {
      tenancyButton = (
        <button
          className="quick-action-btn btn-rent"
          onClick={() => handleTenancy(property.id)}
          disabled={operationLoading}
        >
          퇴거하기
        </button>
      );
    } else if (property.tenantId) {
      tenancyButton = (
        <button className="quick-action-btn btn-rent" disabled>
          입주불가
        </button>
      );
    } else if (isTenantElsewhere) {
      tenancyButton = (
        <button
          className="quick-action-btn btn-rent"
          disabled
          title="다른 곳에 입주해 있습니다. 먼저 퇴거하세요."
        >
          입주하기
        </button>
      );
    } else {
      tenancyButton = (
        <button
          className="quick-action-btn btn-rent"
          onClick={() => handleTenancy(property.id)}
          disabled={operationLoading || currentUser.cash < property.rent}
        >
          입주하기
        </button>
      );
    }

    return (
      <div className="modal-overlay" onClick={() => setShowQuickAction(null)}>
        <div
          className="quick-action-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="quick-modal-header">
            <h3>⚡ 빠른 액션 #{property.id}</h3>
            <button
              className="close-btn"
              onClick={() => setShowQuickAction(null)}
            >
              ✕
            </button>
          </div>
          <div className="quick-modal-content">
            <div className="quick-property-info">
              <div className="quick-info-row">
                <span className="detail-label">소유자</span>
                <span className="detail-value">{ownerName}</span>
              </div>
              <div className="quick-info-row">
                <span className="detail-label">부동산 가격</span>
                <span className="detail-value">
                  {(property.price / 10000).toFixed(0)}만원
                </span>
              </div>
              <div className="quick-info-row">
                <span className="detail-label">월세</span>
                <span className="detail-value">
                  {(property.rent / 10000).toFixed(0)}만원
                </span>
              </div>
              {tenantName && (
                <div className="quick-info-row">
                  <span className="detail-label">세입자</span>
                  <span className="detail-value">{tenantName}</span>
                </div>
              )}
              {property.forSale && (
                <div className="quick-info-row">
                  <span className="detail-label">판매가격</span>
                  <span
                    className="detail-value"
                    style={{ color: "#ef4444", fontWeight: "bold" }}
                  >
                    {(property.salePrice / 10000).toFixed(0)}만원
                  </span>
                </div>
              )}
            </div>
            <div className="quick-actions">
              {(isGovProperty || property.forSale) &&
                !isOwner && (
                  <button
                    className="quick-action-btn btn-purchase"
                    onClick={() => handlePurchaseProperty(property.id)}
                    disabled={
                      operationLoading ||
                      currentUser.cash <
                        (property.forSale ? property.salePrice : property.price)
                    }
                  >
                    구매하기
                  </button>
                )}
              {tenancyButton}
              {isOwner && !property.forSale && (
                <button
                  className="quick-action-btn btn-sell"
                  onClick={() => handleSetForSale(property.id)}
                  disabled={operationLoading}
                >
                  판매하기
                </button>
              )}
              {isOwner && property.forSale && (
                <button
                  className="quick-action-btn btn-cancel"
                  onClick={() => handleCancelSale(property.id)}
                  disabled={operationLoading}
                >
                  판매취소
                </button>
              )}
              {isAdmin() && isGovProperty && !property.forSale && (
                <button
                    className="quick-action-btn btn-sell"
                    onClick={() => handleAdminSetForSale(property.id)}
                    disabled={operationLoading}
                >
                    (관리자) 판매설정
                </button>
              )}
              {isAdmin() && isGovProperty && property.forSale && (
                  <button
                      className="quick-action-btn btn-cancel"
                      onClick={() => handleAdminCancelSale(property.id)}
                      disabled={operationLoading}
                  >
                      (관리자) 판매취소
                  </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPropertyGrid = () => {
    const activeProperties = properties.slice(0, settings.totalProperties);
    if (activeProperties.length === 0 && !propertiesLoading)
      return (
        <div className="loading-message">
          부동산 데이터가 없습니다. 관리자가 초기화할 수 있습니다.
        </div>
      );

    const userIsTenantElsewhere = properties.some(
      (p) => p.tenantId === currentUser?.id
    );

    return (
      <div className="property-grid">
        {activeProperties.map((property) => {
          const isOwner = currentUser && property.owner === currentUser.id;
          const isTenantOfThisProperty =
            currentUser && property.tenantId === currentUser.id;
          const isGovProperty = property.owner === 'government';

          const ownerData = allUsersData?.find((u) => u.id === property.owner);
          const ownerName =
            property.owner === "government"
              ? "정부"
              : property.ownerName || ownerData?.name || "소유주 불명";
          const tenantData = allUsersData?.find(
            (u) => u.id === property.tenantId
          );
          const tenantNameDisplay = property.tenantName || tenantData?.name;
          let propertyClass = "property-card";
          if (property.owner === "government") propertyClass += " government";
          else if (isOwner) propertyClass += " owned";
          else if (property.forSale) propertyClass += " for-sale";
          else propertyClass += " other-owned";

          let tenancyButton;
          if (isTenantOfThisProperty) {
            tenancyButton = (
              <button
                className="btn-action btn-rent"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTenancy(property.id);
                }}
                disabled={operationLoading}
              >
                퇴거
              </button>
            );
          } else if (property.tenantId) {
            tenancyButton = (
              <button className="btn-action btn-rent" disabled>
                입주불가
              </button>
            );
          } else if (userIsTenantElsewhere) {
            tenancyButton = (
              <button
                className="btn-action btn-rent"
                disabled
                title="다른 곳에 입주해 있습니다."
              >
                입주
              </button>
            );
          } else {
            tenancyButton = (
              <button
                className="btn-action btn-rent"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTenancy(property.id);
                }}
                disabled={operationLoading || !currentUser || currentUser.cash < property.rent}
              >
                입주
              </button>
            );
          }

          return (
            <div
              key={property.id}
              className={propertyClass}
              onClick={() => setSelectedProperty(property)}
            >
              <div className="property-header">
                <h4>#{property.id}</h4>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {property.forSale && (
                    <span className="sale-badge">판매중</span>
                  )}
                  {property.tenantId && (
                    <span className="rent-badge">임대중</span>
                  )}
                </div>
              </div>
              <div className="property-info">
                <div className="info-row">
                  <span className="label">소유자</span>
                  <span className="value">{ownerName}</span>
                </div>
                <div className="info-row">
                  <span className="label">가격</span>
                  <span className="value">
                    {(property.price / 10000).toFixed(0)}만원
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">월세</span>
                  <span className="value">
                    {(property.rent / 10000).toFixed(0)}만원
                  </span>
                </div>
                {tenantNameDisplay && (
                  <div className="info-row">
                    <span className="label">세입자</span>
                    <span className="value">{tenantNameDisplay}</span>
                  </div>
                )}
                {property.forSale && (
                  <div className="info-row sale-price">
                    <span className="label">판매가</span>
                    <span className="value">
                      {(property.salePrice / 10000).toFixed(0)}만원
                    </span>
                  </div>
                )}
              </div>
              <div className="property-actions">
                {(isGovProperty || property.forSale) &&
                  !isOwner && (
                    <button
                      className="btn-action btn-purchase"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePurchaseProperty(property.id);
                      }}
                      disabled={
                        operationLoading ||
                        !currentUser ||
                        currentUser.cash <
                          (property.forSale
                            ? property.salePrice
                            : property.price)
                      }
                    >
                      구매
                    </button>
                  )}
                {tenancyButton}
                {isOwner && !property.forSale && (
                  <button
                    className="btn-action btn-sell"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetForSale(property.id);
                    }}
                    disabled={operationLoading}
                  >
                    판매설정
                  </button>
                )}
                {isOwner && property.forSale && (
                  <button
                    className="btn-action btn-cancel"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelSale(property.id);
                    }}
                    disabled={operationLoading}
                  >
                    판매취소
                  </button>
                )}
                {isAdmin() && isGovProperty && !property.forSale && (
                    <button
                        className="btn-action btn-sell"
                        onClick={(e) => { e.stopPropagation(); handleAdminSetForSale(property.id); }}
                        disabled={operationLoading}
                    >
                        (관리자)판매
                    </button>
                )}
                {isAdmin() && isGovProperty && property.forSale && (
                    <button
                        className="btn-action btn-cancel"
                        onClick={(e) => { e.stopPropagation(); handleAdminCancelSale(property.id); }}
                        disabled={operationLoading}
                    >
                        (관리자)취소
                    </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  
  const renderAdminPanel = () => {
    if (!showAdminPanel || !isAdmin()) return null;

    const tenantIds = new Set(
      properties.map((p) => p.tenantId).filter(Boolean)
    );
    const nonTenants = allUsersData.filter(
      (user) => !tenantIds.has(user.id) && !user.isAdmin
    );

    const adminPanelContent = (
      <div className="modal-overlay" onClick={() => setShowAdminPanel(false)}>
        <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
          <div className="panel-header">
            <h3>⚙️ 관리자 설정 (학급: {classCode})</h3>
            <button className="close-btn" onClick={() => setShowAdminPanel(false)}>✕</button>
          </div>
          <div className="panel-content">
            <div className="form-group">
              <label>활성화할 부동산 개수 (변경 후 '부동산 초기화' 필요)</label>
              <input type="number" min="1" max="100" value={adminInputs.totalProperties} onChange={(e) => setAdminInputs(prev => ({ ...prev, totalProperties: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>배치도 한 줄당 칸 수</label>
              <select value={adminInputs.layoutColumns} onChange={(e) => setAdminInputs(prev => ({ ...prev, layoutColumns: e.target.value }))}>
                  {[4, 5, 6, 7, 8, 10].map(n => <option key={n} value={n.toString()}>{n}칸</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>기본 부동산 가격 (원) (변경 후 '부동산 초기화' 필요)</label>
              <input type="number" min="1000000" step="1000000" value={adminInputs.basePrice} onChange={(e) => setAdminInputs(prev => ({ ...prev, basePrice: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>월세 비율 (%) (변경 후 '부동산 초기화' 필요)</label>
              <input type="number" min="0" max="20" step="0.1" value={adminInputs.rentPercentage} onChange={(e) => setAdminInputs(prev => ({ ...prev, rentPercentage: e.target.value }))} />
            </div>
            <div className="non-tenant-list">
              <h4>⚠️ 미입주 학생 ({nonTenants.length}명)</h4>
              {nonTenants.length > 0 ? (
                  <ul>
                      {nonTenants.map(user => <li key={user.id}>{user.name}</li>)}
                  </ul>
              ) : (
                  <p>모든 학생이 입주했습니다!</p>
              )}
            </div>
          </div>
          <div className="panel-actions">
            <button className="btn-primary" onClick={handleSaveSettings} disabled={operationLoading}>💾 설정 저장</button>
            <button className="btn-danger" onClick={handleInitializeProperties} disabled={operationLoading}>🔄 부동산 초기화</button>
          </div>
        </div>
      </div>
    );

    return ReactDOM.createPortal(adminPanelContent, document.body);
  };


  if (authLoading || settingsLoading || propertiesLoading || usersLoading) {
    return <div className="loading-message">데이터를 불러오는 중입니다...</div>;
  }

  return (
    <>
      <div className="real-estate-exchange">
        {operationLoading && <div className="loading-overlay">처리 중...</div>}
        <div className="exchange-header">
          <div className="header-content">
            <h1>🏢 부동산 거래소 (학급: {classCode || "정보 없음"})</h1>
          </div>
        </div>
        <div className="stats-container">
          <div className="stats-bar">
            <div className="stat-item">
              <div className="stat-icon">🏘️</div>
              <div className="stat-content">
                <div className="stat-value">{settings.totalProperties}</div>
                <div className="stat-label">전체 부동산</div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">👥</div>
              <div className="stat-content">
                <div className="stat-value">
                  {properties.filter((p) => p.owner !== "government").length}
                </div>
                <div className="stat-label">개인 소유</div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">🏠</div>
              <div className="stat-content">
                <div className="stat-value">
                  {properties.filter((p) => p.tenantId).length}
                </div>
                <div className="stat-label">임대 중</div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <div className="stat-value">
                  {properties.filter((p) => p.forSale).length}
                </div>
                <div className="stat-label">판매 중</div>
              </div>
            </div>
          </div>
        </div>
        <div className="exchange-content">
          {renderPropertyLayout()}
          {isAdmin() && (
            <div className="admin-controls">
                <button
                    className="admin-btn settings"
                    onClick={() => setShowAdminPanel(true)}
                    style={{ textDecoration: "none" }}
                >
                    ⚙️ 관리자 설정
                </button>
              <button
                className="admin-btn collect"
                onClick={handleCollectRent}
                disabled={operationLoading}
              >
                💸 월세 징수
              </button>
            </div>
          )}
          <div className="properties-section">
            <h2>📊 부동산 목록</h2>
            {renderPropertyGrid()}
          </div>
        </div>
        
        {renderQuickActionModal()}
        {selectedProperty && (
          <div
            className="modal-overlay"
            onClick={() => setSelectedProperty(null)}
          >
            <div className="property-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>ℹ️ 부동산 #{selectedProperty.id} 상세정보</h3>
                <button
                  className="close-btn"
                  onClick={() => setSelectedProperty(null)}
                >
                  ✕
                </button>
              </div>
              <div className="modal-content">
                <div className="property-details">
                  <div className="detail-row">
                    <span className="detail-label">소유자</span>
                    <span className="detail-value">
                      {selectedProperty.owner === "government"
                        ? "정부"
                        : selectedProperty.ownerName ||
                          allUsersData?.find(
                            (u) => u.id === selectedProperty.owner
                          )?.name ||
                          "소유주 불명"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">부동산 가격</span>
                    <span className="detail-value">
                      {selectedProperty.price.toLocaleString()}원
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">월세</span>
                    <span className="detail-value">
                      {selectedProperty.rent.toLocaleString()}원
                    </span>
                  </div>
                  {selectedProperty.tenantId && (
                    <div className="detail-row">
                      <span className="detail-label">세입자</span>
                      <span className="detail-value">
                        {selectedProperty.tenantName ||
                          allUsersData?.find(
                            (u) => u.id === selectedProperty.tenantId
                          )?.name ||
                          "세입자 불명"}
                      </span>
                    </div>
                  )}
                  {selectedProperty.forSale && (
                    <div className="detail-row sale-highlight">
                      <span className="detail-label">판매가격</span>
                      <span className="detail-value">
                        {selectedProperty.salePrice.toLocaleString()}원
                      </span>
                    </div>
                  )}
                  {selectedProperty.lastRentPayment && (
                    <div className="detail-row">
                      <span className="detail-label">최근 월세 납부일</span>
                      <span className="detail-value">
                        {selectedProperty.lastRentPayment instanceof Date
                          ? selectedProperty.lastRentPayment.toLocaleDateString()
                          : "정보 없음"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {renderAdminPanel()}
    </>
  );
};

export default RealEstateRegistry;