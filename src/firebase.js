// firebase.js

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
  serverTimestamp, // Firestore의 serverTimestamp 직접 사용
  increment,
  arrayUnion,
  arrayRemove,
  runTransaction,
  query as originalFirebaseQuery,
  where as originalFirebaseWhere,
  addDoc as originalFirebaseAddDoc,
  connectFirestoreEmulator,
  Timestamp, // ← Timestamp 추가
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword as fbSignInInternal,
  signOut as fbSignOutInternal,
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPasswordInternal,
  updateProfile,
  connectAuthEmulator,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBym1FtGjHWM5JdZ7GWRIkYGOftQGdUDgc",
  authDomain: "inconomysu-class.firebaseapp.com",
  databaseURL: "https://inconomysu-class-default-rtdb.firebaseio.com",
  projectId: "inconomysu-class",
  storageBucket: "inconomysu-class.firebasestorage.app",
  messagingSenderId: "244696722605",
  appId: "1:244696722605:web:5fcc744923422b091b6a24",
  measurementId: "G-QXND3N8942",
};

// 🔥 Firebase 앱 초기화
console.log("[firebase.js] Firebase 앱 초기화 시작...");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
console.log("[firebase.js] Firebase 앱 초기화 완료");

// 🔥 연결 상태 확인 함수 개선
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

// 🔥 Auth 상태 리스너 개선
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

const getUserDocument = async (userId) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId) return null;

  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    const result = userSnap.exists()
      ? { id: userSnap.id, ...userSnap.data() }
      : null;
    console.log(
      `[firebase.js] getUserDocument(${userId}):`,
      result ? "문서 존재" : "문서 없음"
    );
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
    return true;
  } catch (error) {
    console.error(`[firebase.js] 사용자 문서 추가 실패: ${userId}`, error);
    throw error;
  }
};

// 🔥 재시도 로직이 포함된 개선된 updateUserDocument 함수
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

  console.log(
    `[firebase.js] updateUserDocument 시작: userId=${userId}`,
    updates
  );

  // 🔥 재시도 로직 추가
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

      // 🔥 타임아웃 추가
      const updatePromise = updateDoc(userRef, finalUpdates);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("업데이트 타임아웃")), 10000)
      );

      await Promise.race([updatePromise, timeoutPromise]);

      console.log(
        `[firebase.js] 사용자 문서 업데이트 성공: ${userId} (시도 ${attempt})`
      );
      return true;
    } catch (error) {
      lastError = error;
      console.error(
        `[firebase.js] updateUserDocument 실패 (시도 ${attempt}/${maxRetries}): ${userId}`,
        error
      );

      // 🔥 더 자세한 에러 정보 로깅
      if (error.code) {
        console.error(`[firebase.js] Firebase 에러 코드: ${error.code}`);
      }
      if (error.message) {
        console.error(`[firebase.js] Firebase 에러 메시지: ${error.message}`);
      }

      // 🔥 재시도 가능한 에러인지 확인
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
          `[firebase.js] 재시도 불가능한 에러: ${error.code || error.message}`
        );
        break;
      }

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * attempt, 5000); // 최대 5초 대기
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

const getAllUsersDocuments = async () => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  try {
    const usersCollectionRef = collection(db, "users");
    const usersSnapshot = await getDocs(usersCollectionRef);
    const result = usersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    console.log(`[firebase.js] getAllUsersDocuments: ${result.length}명 조회`);
    return result;
  } catch (error) {
    console.error("[firebase.js] getAllUsersDocuments 오류:", error);
    throw error;
  }
};

const updateUserCashInFirestore = async (userId, amount) => {
  if (!db) throw new Error("[firebase.js] Firestore가 초기화되지 않았습니다.");
  if (!userId) throw new Error("[firebase.js] 사용자 ID가 유효하지 않습니다.");
  if (typeof amount !== "number")
    throw new Error("[firebase.js] 현금 변경액은 숫자여야 합니다.");

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
      if (amount < 0 && currentCash + amount < 0) {
        throw new Error(
          `[firebase.js] 잔액이 부족합니다. (현재: ${currentCash}, 변경 요청: ${amount})`
        );
      }
      transaction.update(userRef, {
        cash: increment(amount),
        updatedAt: serverTimestamp(),
      });
    });
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

const getStoreItems = async (classCode) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!classCode)
    throw new Error("[firebase.js] classCode is required to get store items.");
  const itemsColRef = collection(db, "storeItems");
  const q = originalFirebaseQuery(
    itemsColRef,
    originalFirebaseWhere("classCode", "==", classCode)
  );
  const itemSnapshot = await getDocs(q);
  return itemSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  const itemsColRef = collection(db, "storeItems");
  return originalFirebaseAddDoc(itemsColRef, {
    ...itemData,
    classCode: classCode,
    initialStock: itemData.initialStock ?? itemData.stock,
    available: itemData.available !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

const updateStoreItem = async (itemId, updates) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!itemId || !updates || Object.keys(updates).length === 0) {
    throw new Error("아이템 ID 또는 업데이트 데이터가 유효하지 않습니다.");
  }
  const itemRef = doc(db, "storeItems", itemId);
  await updateDoc(itemRef, { ...updates, updatedAt: serverTimestamp() });
  console.log(`[firebase.js] 상점 아이템 (${itemId}) 업데이트 성공.`);
  return true;
};

const deleteStoreItem = async (itemId) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!itemId) throw new Error("아이템 ID가 유효하지 않습니다.");
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
      name: itemDetails.name || "Unknown Item",
      icon: itemDetails.icon || "❓",
      type: itemDetails.type || "item",
      purchasedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log(
      `[firebase.js] 새 인벤토리 아이템(${newItemRef.id}) 추가: ${quantity}개`
    );
  }
  return true;
};

// 🔥 수정 및 확장된 purchaseItemTransaction 함수
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

  const storeItemRef = doc(db, "storeItems", storeItemId);
  const userRef = doc(db, "users", userId);
  const governmentSettingsRef = doc(db, "governmentSettings", userClassCode);
  const nationalTreasuryRef = doc(db, "nationalTreasuries", userClassCode);

  let totalItemPrice = 0;
  let vatAmount = 0;
  let finalPriceWithVAT = 0;
  let autoRestockOccurred = false;

  try {
    let itemStoreVATRate = 0.1;

    const settingsSnap = await getDoc(governmentSettingsRef);
    if (
      settingsSnap.exists() &&
      settingsSnap.data().taxSettings &&
      settingsSnap.data().taxSettings.itemStoreVATRate !== undefined
    ) {
      itemStoreVATRate = settingsSnap.data().taxSettings.itemStoreVATRate;
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

      const storeItemSnap = await transaction.get(storeItemRef);
      if (!storeItemSnap.exists()) {
        throw new Error(
          `[firebase.js] 상점 아이템 (ID: ${storeItemId})을 찾을 수 없습니다.`
        );
      }
      const storeItemData = storeItemSnap.data();

      let userData = null;
      if (!skipCashDeduction) {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) {
          throw new Error(
            `[firebase.js] 사용자 (ID: ${userId})를 찾을 수 없습니다.`
          );
        }
        userData = userSnap.data();
      }

      const treasurySnap = await transaction.get(nationalTreasuryRef);
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

      if (newStock <= 0) {
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
      if (!skipCashDeduction) {
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
          // 🔥 [수정됨] 국고 문서가 없을 때 모든 세수 필드를 0으로 초기화
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

// =================================================================
// 🔥 신규 추가된 세금 징수 함수들
// =================================================================

/**
 * 주식 판매 시 발생하는 이익에 대해 거래세를 징수하고 국고에 납부합니다.
 * 이 함수는 주식 판매 로직 내에서 호출되어야 합니다.
 * @param {string} classCode - 거래가 발생한 학급의 코드
 * @param {number} profit - 주식 판매로 발생한 순수익 (매도가 - 매수가)
 * @returns {Promise<{success: boolean, taxAmount: number}>} 세금 처리 결과
 */
export const processStockSaleTransaction = async (classCode, profit) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (profit <= 0) {
    // 이익이 없으면 세금도 없음
    return { success: true, taxAmount: 0 };
  }

  const governmentSettingsRef = doc(db, "governmentSettings", classCode);
  const nationalTreasuryRef = doc(db, "nationalTreasuries", classCode);

  try {
    const settingsSnap = await getDoc(governmentSettingsRef);
    const taxRate = settingsSnap.exists()
      ? settingsSnap.data().taxSettings?.stockTransactionTaxRate || 0
      : 0;
    const taxAmount = Math.round(profit * taxRate);

    if (taxAmount > 0) {
      await updateDoc(nationalTreasuryRef, {
        totalAmount: increment(taxAmount),
        stockTaxRevenue: increment(taxAmount),
        lastUpdated: serverTimestamp(),
      });
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

/**
 * 부동산 또는 경매/시장 거래 시 세금을 계산하고 자금을 이전하는 통합 트랜잭션 함수.
 * 세금은 판매자의 수령액에서 제합니다.
 * @param {string} classCode - 거래가 발생한 학급의 코드
 * @param {string} buyerId - 구매자 ID
 * @param {string} sellerId - 판매자 ID
 * @param {number} transactionPrice - 총 거래 금액
 * @param {'realEstate' | 'auction' | 'itemMarket'} taxType - 세금 종류
 * @param {object} [inventoryUpdate] - (아이템 시장 거래 시) 인벤토리 업데이트 정보
 * @param {string} inventoryUpdate.inventoryItemId - 판매자가 판매한 인벤토리 아이템의 문서 ID
 * @param {string} inventoryUpdate.originalStoreItemId - 아이템의 원본 상점 ID
 * @param {object} inventoryUpdate.itemDetails - 아이템 상세 정보 (name, icon, type)
 * @param {number} inventoryUpdate.quantity - 거래 수량
 * @returns {Promise<{success: boolean, taxAmount: number}>} 트랜잭션 결과
 */
export const processGenericSaleTransaction = async (
  classCode,
  buyerId,
  sellerId,
  transactionPrice,
  taxType,
  inventoryUpdate = null
) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");

  const governmentSettingsRef = doc(db, "governmentSettings", classCode);
  const nationalTreasuryRef = doc(db, "nationalTreasuries", classCode);
  const buyerRef = doc(db, "users", buyerId);
  const sellerRef = doc(db, "users", sellerId);

  try {
    let taxAmount = 0;

    await runTransaction(db, async (transaction) => {
      // 1. 모든 문서 읽기
      const settingsSnap = await transaction.get(governmentSettingsRef);
      const buyerSnap = await transaction.get(buyerRef);
      const sellerSnap = await transaction.get(sellerRef);

      if (!buyerSnap.exists() || !sellerSnap.exists()) {
        throw new Error("구매자 또는 판매자 정보를 찾을 수 없습니다.");
      }

      // 2. 세율 및 세액 계산
      const taxSettings = settingsSnap.exists()
        ? settingsSnap.data().taxSettings
        : {};
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
      const sellerProceeds = transactionPrice - taxAmount;

      // 3. 유효성 검사 (구매자 잔액)
      if ((buyerSnap.data().cash || 0) < transactionPrice) {
        throw new Error("구매자의 현금이 부족합니다.");
      }

      // 4. 쓰기 작업 예약
      // 자금 이동
      transaction.update(buyerRef, { cash: increment(-transactionPrice) });
      transaction.update(sellerRef, { cash: increment(sellerProceeds) });

      // 국고 업데이트
      if (taxAmount > 0) {
        transaction.update(nationalTreasuryRef, {
          totalAmount: increment(taxAmount),
          [taxRevenueField]: increment(taxAmount),
          lastUpdated: serverTimestamp(),
        });
      }

      // 아이템 시장 거래의 경우 인벤토리 처리
      if (taxType === "itemMarket" && inventoryUpdate) {
        // 판매자 인벤토리에서 아이템 제거
        const sellerInventoryItemRef = doc(
          db,
          "users",
          sellerId,
          "inventory",
          inventoryUpdate.inventoryItemId
        );
        transaction.update(sellerInventoryItemRef, {
          quantity: increment(-inventoryUpdate.quantity),
        });

        // 구매자 인벤토리에 아이템 추가/수량 증가
        // (addItemToInventory 로직을 트랜잭션 내에 간소화하여 구현)
        // 이 부분은 실제 인벤토리 구조에 맞춰 조정이 필요할 수 있습니다.
        // 여기서는 간단히 로그만 남기고, 실제 구현 시에는 구매자의 인벤토리를 조회하여
        // 기존 아이템이 있으면 수량을 늘리고, 없으면 새로 추가하는 로직이 필요합니다.
        console.log(
          `[Transaction] 구매자(${buyerId})에게 아이템(${inventoryUpdate.originalStoreItemId}) ${inventoryUpdate.quantity}개 추가 필요.`
        );
      }
    });

    console.log(
      `[${classCode}] ${taxType} 거래 성공. 세금: ${taxAmount}원, 거래액: ${transactionPrice}원`
    );
    return { success: true, taxAmount };
  } catch (error) {
    console.error(`[firebase.js] ${taxType} 거래 트랜잭션 오류:`, error);
    throw error;
  }
};

/**
 * 주기적으로 모든 사용자의 부동산 보유세를 징수합니다.
 * Cloud Functions의 스케줄러 등을 통해 정기적으로 호출되어야 합니다.
 * @param {string} classCode - 세금을 징수할 학급의 코드
 * @returns {Promise<{success: boolean, totalCollected: number, userCount: number}>} 징수 결과
 */
export const collectPropertyHoldingTaxes = async (classCode) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");

  const governmentSettingsRef = doc(db, "governmentSettings", classCode);
  const nationalTreasuryRef = doc(db, "nationalTreasuries", classCode);

  try {
    // 1. 세율 가져오기
    const settingsSnap = await getDoc(governmentSettingsRef);
    const taxRate = settingsSnap.exists()
      ? settingsSnap.data().taxSettings?.propertyHoldingTaxRate || 0
      : 0;

    if (taxRate === 0) {
      console.log(
        `[${classCode}] 부동산 보유세율이 0%이므로 징수를 건너뜁니다.`
      );
      return { success: true, totalCollected: 0, userCount: 0 };
    }

    // 2. 학급의 모든 사용자 조회
    const usersQuery = originalFirebaseQuery(
      collection(db, "users"),
      originalFirebaseWhere("classCode", "==", classCode)
    );
    const usersSnapshot = await getDocs(usersQuery);

    const batch = writeBatch(db);
    let totalTaxCollected = 0;
    let processedUserCount = 0;

    // 3. 각 사용자에 대해 부동산 조회 및 세금 계산
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userRef = doc(db, "users", userId);
      let userTotalTax = 0;

      // 가정: 사용자의 부동산은 'users/{userId}/properties' 컬렉션에 저장되어 있음
      // 각 부동산 문서에는 'value' 필드가 있어야 함
      const propertiesRef = collection(db, "users", userId, "properties");
      const propertiesSnapshot = await getDocs(propertiesRef);

      if (propertiesSnapshot.empty) {
        continue; // 부동산 없으면 다음 사용자로
      }

      propertiesSnapshot.forEach((propDoc) => {
        const propertyValue = propDoc.data().value || 0;
        userTotalTax += Math.round(propertyValue * taxRate);
      });

      if (userTotalTax > 0) {
        // 배치에 사용자 현금 차감 작업 추가
        batch.update(userRef, { cash: increment(-userTotalTax) });
        totalTaxCollected += userTotalTax;
        processedUserCount++;
      }
    }

    // 4. 국고에 총 징수액 업데이트
    if (totalTaxCollected > 0) {
      batch.update(nationalTreasuryRef, {
        totalAmount: increment(totalTaxCollected),
        propertyHoldingTaxRevenue: increment(totalTaxCollected),
        lastUpdated: serverTimestamp(),
      });
    }

    // 5. 배치 작업 실행
    await batch.commit();

    console.log(
      `[${classCode}] 부동산 보유세 징수 완료. 총 ${totalTaxCollected}원 (${processedUserCount}명)`
    );
    return {
      success: true,
      totalCollected: totalTaxCollected,
      userCount: processedUserCount,
    };
  } catch (error) {
    console.error(
      `[firebase.js] 부동산 보유세 징수 오류 (학급: ${classCode}):`,
      error
    );
    throw error;
  }
};

// =================================================================
// 🔥 기존 함수들 (변경 없음)
// =================================================================

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
  const marketColRef = collection(db, "marketItems");
  try {
    const docRef = await originalFirebaseAddDoc(marketColRef, {
      ...listingData,
      classCode: classCode,
      status: "active", // 기본 상태는 'active' (판매중)
      listedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log(
      `[firebase.js] 아이템 시장 등록 성공: ${docRef.id}`,
      listingData
    );
    return {
      success: true,
      listingId: docRef.id,
      data: { ...listingData, classCode }, // 등록된 전체 데이터 반환
    };
  } catch (error) {
    console.error("[firebase.js] 아이템 시장 등록 실패:", error);
    throw error;
  }
};

export const updateUserInventoryItemQuantity = async (
  userId,
  inventoryItemId,
  quantityChange // 양수면 증가, 음수면 감소
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

    const currentQuantity = itemSnap.data().quantity || 0;
    const newQuantity = currentQuantity + quantityChange;

    if (newQuantity < 0) {
      throw new Error("아이템 수량이 0보다 작아질 수 없습니다.");
    }

    if (newQuantity === 0) {
      await deleteDoc(itemRef);
      console.log(
        `[firebase.js] 인벤토리 아이템(ID: ${inventoryItemId}) 수량이 0이 되어 삭제됨.`
      );
      return { success: true, newQuantity: 0, deleted: true };
    } else {
      await updateDoc(itemRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp(),
      });
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
        console.log(`[firebase.js] verifyClassCode: 문서 데이터:`, data);

        const validCodesArray = data.validCodes;
        console.log(
          `[firebase.js] verifyClassCode: validCodes 배열:`,
          validCodesArray
        );

        if (Array.isArray(validCodesArray)) {
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
            await setDoc(classCodesSettingsRef, {
              validCodes: ["DEMO", "TEST", "CLASS1", "CLASS2", "SCHOOL01"],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            console.log(
              "[firebase.js] verifyClassCode: 기본 설정 문서가 생성되었습니다."
            );
            if (
              ["DEMO", "TEST", "CLASS1", "CLASS2", "SCHOOL01"].includes(
                trimmedCode
              )
            ) {
              console.log(
                `[firebase.js] 학급 코드 "${trimmedCode}"가 기본 코드로 유효합니다.`
              );
              return true;
            }
          } catch (createError) {
            console.error(
              "[firebase.js] verifyClassCode: 기본 설정 문서 생성 실패:",
              createError
            );
          }
        }
        return false;
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
          `[firebase.js] verifyClassCode 재시도 불가능한 에러: ${
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

const isFirestoreInitialized = isInitialized;

export {
  app,
  db,
  auth,
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
  originalFirebaseAddDoc as addDoc,
  originalFirebaseAddDoc as firebaseAddDoc,
  updateDoc,
  updateDoc as firebaseUpdateDoc,
  deleteDoc,
  deleteDoc as firebaseDeleteDoc,
  originalFirebaseQuery,
  originalFirebaseQuery as query,
  originalFirebaseQuery as firebaseQuery,
  originalFirebaseWhere,
  originalFirebaseWhere as where,
  originalFirebaseWhere as firebaseWhere,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  runTransaction,
  writeBatch,
  Timestamp,
};
