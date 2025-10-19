// src/services/globalCacheService.js - 전역 캐싱 시스템으로 Firestore 사용량 최적화 (IndexedDB 통합)

import { db } from '../firebase';
import {
  doc,
  getDoc,
  getDocs,
  query,
  where,
  collection,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import indexedDBCache from './indexedDBCache';

export const cacheStats = {
  hits: 0,
  misses: 0,
  savings: 0,
};

class GlobalCacheService {
  constructor() {
    this.cache = new Map();
    this.timestamps = new Map();
    this.subscribers = new Map();
    this.pendingRequests = new Map();

    // 🔥 [최적화] 캐시 TTL 설정 (대폭 증가)
    this.DEFAULT_TTL = 10 * 60 * 1000; // 10분
    this.USER_TTL = 60 * 60 * 1000; // 60분 (사용자 데이터)
    this.ACTIVITY_LOG_TTL = 5 * 60 * 1000; // 5분 (활동 로그)
    this.ITEMS_TTL = 30 * 60 * 1000; // 30분 (아이템 데이터 - 자주 변경되지 않음)
    this.CLASS_DATA_TTL = 60 * 60 * 1000; // 60분 (학급 데이터 - 거의 변경되지 않음)
    this.SETTINGS_TTL = 2 * 60 * 60 * 1000; // 2시간 (설정 데이터)

    // 재시도 설정
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 1000; // 1초
    this.retryCount = new Map();

    // 🔥 [최적화] localStorage 영구 캐싱 활성화
    this.useLocalStorage = true;
    this.localStoragePrefix = 'gc_'; // globalCache prefix

    // 캐시 정리 타이머
    this.startCleanupTimer();
    this.startLocalStorageSync();
  }

  // 캐시 키 생성
  generateKey(type, params = {}) {
    const sortedParams = Object.keys(params).sort().reduce((result, key) => {
      result[key] = params[key];
      return result;
    }, {});

    return `${type}_${JSON.stringify(sortedParams)}`;
  }

  // 🔥 [최적화] IndexedDB → 메모리 캐시 순서로 확인 (동기 버전)
  get(key) {
    // 1. 메모리 캐시 확인
    if (this.cache.has(key)) {
      const expiry = this.timestamps.get(key);
      if (Date.now() <= expiry) {
        cacheStats.hits++;
        cacheStats.savings++;
        return this.cache.get(key);
      }
      this.invalidate(key);
    }

    // 2. localStorage 폴백 (IndexedDB 비동기라서 동기 메서드에서는 localStorage 사용)
    if (this.useLocalStorage) {
      try {
        const lsKey = this.localStoragePrefix + key;
        const cached = localStorage.getItem(lsKey);
        if (cached) {
          const {data, expiry} = JSON.parse(cached);
          if (Date.now() <= expiry) {
            // localStorage에서 복원하여 메모리 캐시에 저장
            this.cache.set(key, data);
            this.timestamps.set(key, expiry);
            console.log(`[GlobalCache] ✅ localStorage에서 복원: ${key}`);
            cacheStats.hits++;
            cacheStats.savings++;
            return data;
          } else {
            localStorage.removeItem(lsKey);
          }
        }
      } catch (error) {
        console.warn('[GlobalCache] localStorage 읽기 오류:', error);
      }
    }

    cacheStats.misses++;
    return null;
  }

  // 🔥 [신규] IndexedDB 사용 비동기 get (추천)
  async getAsync(key) {
    // 1. 메모리 캐시 확인
    if (this.cache.has(key)) {
      const expiry = this.timestamps.get(key);
      if (Date.now() <= expiry) {
        cacheStats.hits++;
        cacheStats.savings++;
        return this.cache.get(key);
      }
      this.invalidate(key);
    }

    // 2. IndexedDB 캐시 확인
    try {
      const cachedData = await indexedDBCache.get(key);
      if (cachedData) {
        // IndexedDB에서 복원하여 메모리 캐시에 저장
        this.cache.set(key, cachedData);
        this.timestamps.set(key, Date.now() + this.DEFAULT_TTL);
        console.log(`[GlobalCache] ✅ IndexedDB에서 복원: ${key}`);
        cacheStats.hits++;
        cacheStats.savings++;
        return cachedData;
      }
    } catch (error) {
      console.warn('[GlobalCache] IndexedDB 읽기 오류:', error);
    }

    // 3. localStorage 폴백
    if (this.useLocalStorage) {
      try {
        const lsKey = this.localStoragePrefix + key;
        const cached = localStorage.getItem(lsKey);
        if (cached) {
          const {data, expiry} = JSON.parse(cached);
          if (Date.now() <= expiry) {
            this.cache.set(key, data);
            this.timestamps.set(key, expiry);
            console.log(`[GlobalCache] ✅ localStorage에서 복원: ${key}`);
            cacheStats.hits++;
            cacheStats.savings++;
            return data;
          } else {
            localStorage.removeItem(lsKey);
          }
        }
      } catch (error) {
        console.warn('[GlobalCache] localStorage 읽기 오류:', error);
      }
    }

    cacheStats.misses++;
    return null;
  }

  // 🔥 [최적화] 메모리, IndexedDB, localStorage 동시 저장
  set(key, data, ttl = this.DEFAULT_TTL) {
    const expiry = Date.now() + ttl;

    // 메모리 캐시 저장
    this.cache.set(key, data);
    this.timestamps.set(key, expiry);

    // IndexedDB 저장 (비동기, 실패해도 무시)
    indexedDBCache.set(key, data, ttl / 1000).catch(err => {
      console.warn('[GlobalCache] IndexedDB 저장 실패:', err);
    });

    // localStorage 저장 (폴백)
    if (this.useLocalStorage) {
      try {
        const lsKey = this.localStoragePrefix + key;
        localStorage.setItem(lsKey, JSON.stringify({data, expiry}));
      } catch (error) {
        console.warn('[GlobalCache] localStorage 쓰기 오류 (용량 초과 가능):', error);
        // localStorage 용량 초과 시 가장 오래된 항목 삭제
        this.cleanupOldestLocalStorageItems(5);
      }
    }

    // 구독자들에게 알림
    if (this.subscribers.has(key)) {
      this.subscribers.get(key).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('구독자 콜백 오류:', error);
        }
      });
    }
  }

  // 🔥 [추가] localStorage 용량 초과 시 오래된 항목 삭제
  cleanupOldestLocalStorageItems(count = 10) {
    try {
      const items = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.localStoragePrefix)) {
          const cached = localStorage.getItem(key);
          if (cached) {
            const {expiry} = JSON.parse(cached);
            items.push({key, expiry});
          }
        }
      }

      // 만료 시간이 가까운 순서로 정렬
      items.sort((a, b) => a.expiry - b.expiry);

      // 가장 오래된 항목 삭제
      for (let i = 0; i < Math.min(count, items.length); i++) {
        localStorage.removeItem(items[i].key);
        console.log(`[GlobalCache] 오래된 캐시 삭제: ${items[i].key}`);
      }
    } catch (error) {
      console.warn('[GlobalCache] 캐시 정리 오류:', error);
    }
  }

  // 🔥 [최적화] 메모리와 localStorage 동시 무효화
  invalidate(key) {
    this.cache.delete(key);
    this.timestamps.delete(key);
    this.pendingRequests.delete(key);

    // localStorage에서도 삭제
    if (this.useLocalStorage) {
      try {
        const lsKey = this.localStoragePrefix + key;
        localStorage.removeItem(lsKey);
      } catch (error) {
        // 무시
      }
    }
  }

  // 패턴 기반 캐시 무효화
  invalidatePattern(pattern) {
    const keysToInvalidate = [];
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToInvalidate.push(key);
      }
    }
    keysToInvalidate.forEach(key => this.invalidate(key));
  }

  // 구독 추가
  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key).add(callback);

    // 언구독 함수 반환
    return () => {
      if (this.subscribers.has(key)) {
        this.subscribers.get(key).delete(callback);
        if (this.subscribers.get(key).size === 0) {
          this.subscribers.delete(key);
        }
      }
    };
  }

  // 지수 백오프를 사용한 재시도 로직
  async retryWithBackoff(operation, retryCount = 0) {
    try {
      return await operation();
    } catch (error) {
      // Firestore 네트워크 오류인 경우에만 재시도
      const isNetworkError =
        error.code === 'unavailable' ||
        error.code === 'deadline-exceeded' ||
        error.message?.includes('Failed to get document') ||
        error.message?.includes('network error') ||
        error.name === 'FirebaseError';

      if (isNetworkError && retryCount < this.MAX_RETRIES) {
        const delay = this.RETRY_DELAY * Math.pow(2, retryCount);
        console.warn(`[GlobalCache] 재시도 중... (${retryCount + 1}/${this.MAX_RETRIES}) - ${delay}ms 대기`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryWithBackoff(operation, retryCount + 1);
      }

      // 재시도 횟수 초과 또는 재시도 불가능한 에러
      if (retryCount >= this.MAX_RETRIES) {
        console.error('[GlobalCache] 최대 재시도 횟수 초과:', error);
      }
      throw error;
    }
  }

  // 중복 요청 방지를 위한 래퍼
  async executeOrWait(key, operation) {
    // 이미 진행 중인 요청이 있으면 대기
    if (this.pendingRequests.has(key)) {
      console.log('[GlobalCache] 이미 진행 중인 요청 대기:', key);
      return await this.pendingRequests.get(key);
    }

    // 새 요청 실행 (재시도 로직 포함)
    console.log('[GlobalCache] 새 요청 실행:', key);
    const promise = this.retryWithBackoff(operation);
    this.pendingRequests.set(key, promise);

    try {
      const result = await promise;
      console.log('[GlobalCache] 요청 성공:', key, '결과 타입:', Array.isArray(result) ? `배열(${result.length}개)` : typeof result);
      this.pendingRequests.delete(key);
      this.retryCount.delete(key);
      return result;
    } catch (error) {
      console.error('[GlobalCache] executeOrWait 최종 실패:', key, error);
      this.pendingRequests.delete(key);
      throw error;
    }
  }

  // 사용자 문서 가져오기 (캐시됨)
  async getUserDoc(uid, forceRefresh = false) {
    const key = this.generateKey('user', { uid });

    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) return cached;
    }

    return await this.executeOrWait(key, async () => {
      try {
        const userRef = doc(db, 'users', uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
          const userData = { id: docSnap.id, uid: docSnap.id, ...docSnap.data() };
          this.set(key, userData, this.USER_TTL);
          return userData;
        }
        return null;
      } catch (error) {
        console.error('[GlobalCache] 사용자 문서 조회 오류:', error);
        // 캐시된 데이터가 있으면 반환 (오프라인 모드 대응)
        const cached = this.cache.get(key);
        if (cached) {
          console.warn('[GlobalCache] 네트워크 오류 - 만료된 캐시 반환:', uid);
          return cached;
        }
        throw error;
      }
    });
  }

  async getDoc(collectionPath, docId, forceRefresh = false) {
    const key = this.generateKey(collectionPath, { docId });

    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) return cached;
    }

    return await this.executeOrWait(key, async () => {
      try {
        const docRef = doc(db, collectionPath, docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const docData = { id: docSnap.id, ...docSnap.data() };
          this.set(key, docData, this.DEFAULT_TTL);
          return docData;
        }
        return null;
      } catch (error) {
        console.error(`[GlobalCache] ${collectionPath}/${docId} 문서 조회 오류:`, error);
        const cached = this.cache.get(key);
        if (cached) {
          return cached;
        }
        throw error;
      }
    });
  }

  // 학급 구성원 가져오기 (캐시됨)
  async getClassMembers(classCode, forceRefresh = false) {
    const key = this.generateKey('classMembers', { classCode });

    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) return cached;
    }

    return await this.executeOrWait(key, async () => {
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('classCode', '==', classCode));
        const querySnapshot = await getDocs(q);

        const members = querySnapshot.docs.map(doc => ({
          id: doc.id,
          uid: doc.id,
          ...doc.data()
        }));

        this.set(key, members, this.USER_TTL);
        return members;
      } catch (error) {
        console.error('[GlobalCache] 학급 구성원 조회 오류:', error);
        // 캐시된 데이터가 있으면 반환
        const cached = this.cache.get(key);
        if (cached) {
          console.warn('[GlobalCache] 네트워크 오류 - 만료된 캐시 반환:', classCode);
          return cached;
        }
        throw error;
      }
    });
  }

  // 활동 로그 가져오기 (캐시됨)
  async getActivityLogs(classCode, filters = {}, forceRefresh = false) {
    const { lastVisible, ...restFilters } = filters;
    const key = this.generateKey('activityLogs', { classCode, ...restFilters });
    console.log('[GlobalCache] getActivityLogs 호출:', { classCode, filters, forceRefresh, key });

    if (!forceRefresh && !lastVisible) { // lastVisible이 있으면 항상 새로 가져옴
      const cached = this.get(key);
      if (cached) {
        console.log('[GlobalCache] 활동 로그 캐시 히트:', cached.logs.length, '개');
        return cached;
      }
    }

    console.log('[GlobalCache] Firestore 활동 로그 조회 시작:', classCode);
    const operation = async () => {
      try {
        const logsRef = collection(db, 'activity_logs');
        let q = query(logsRef, where('classCode', '==', classCode));

        if (filters.dateFilter && filters.dateFilter !== 'all') {
          const now = new Date();
          let startDate = new Date();
          switch (filters.dateFilter) {
            case 'today': startDate.setHours(0, 0, 0, 0); break;
            case 'week': startDate.setDate(now.getDate() - 7); break;
            case 'month': startDate.setMonth(now.getMonth() - 1); break;
          }
          q = query(q, where('timestamp', '>=', startDate));
        }

        q = query(q, orderBy('timestamp', 'desc'));

        if (lastVisible) {
          q = query(q, startAfter(lastVisible));
        }

        q = query(q, limit(filters.limit || 20)); // 페이지당 20개로 기본값 변경

        const querySnapshot = await getDocs(q);
        const logs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];

        const result = { logs, lastVisible: newLastVisible };

        if (!lastVisible) { // 첫 페이지일 때만 캐시 저장
            this.set(key, result, this.ACTIVITY_LOG_TTL);
        }

        return result;
      } catch (error) {
        console.error('[GlobalCache] 활동 로그 조회 오류:', error);
        const cached = this.cache.get(key);
        if (cached) {
          return cached;
        }
        return { logs: [], lastVisible: null };
      }
    };

    // 페이지네이션은 중복 요청 방지를 사용하지 않음 (항상 새 요청)
    return await this.retryWithBackoff(operation);
  }

  // 아이템 데이터 가져오기 (캐시됨)
  async getItems(forceRefresh = false) {
    const key = this.generateKey('items', {});

    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) {
        console.log('[GlobalCache] ✅ getItems - 캐시 히트 (Firestore 읽기 0건):', cached?.length, '개');
        return cached;
      }
    }

    return await this.executeOrWait(key, async () => {
      try {
        console.log('[GlobalCache] 🔥 getItems - Firestore 조회 시작 (19건 읽기 예상)');
        const itemsRef = collection(db, 'storeItems');
        const querySnapshot = await getDocs(itemsRef);

        const items = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        console.log('[GlobalCache] ✅ getItems - Firestore 조회 완료 (' + items.length + '건 읽음)');
        this.set(key, items, this.ITEMS_TTL);
        return items;
      } catch (error) {
        console.error('[GlobalCache] ❌ getItems - 조회 오류:', error.message);
        const cached = this.cache.get(key);
        if (cached) {
          console.warn('[GlobalCache] ⚠️ 네트워크 오류 - 만료된 캐시 반환 (Firestore 읽기 0건)');
          return cached.data;
        }
        throw error;
      }
    });
  }

  // 사용자 아이템 가져오기 (캐시됨)
  async getUserItems(userId, forceRefresh = false) {
    const key = this.generateKey('userItems', { userId });

    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) {
        console.log('[GlobalCache] ✅ getUserItems - 캐시 히트 (Firestore 읽기 0건):', cached?.length, '개');
        return cached;
      }
    }

    return await this.executeOrWait(key, async () => {
      try {
        console.log('[GlobalCache] 🔥 getUserItems - Firestore 조회 시작 (' + userId + '/inventory)');
        const userInventoryRef = collection(db, 'users', userId, 'inventory');
        const querySnapshot = await getDocs(userInventoryRef);

        const userItems = querySnapshot.docs.map(doc => ({
          id: doc.id,
          source: 'inventory',
          ...doc.data()
        }));

        console.log('[GlobalCache] ✅ getUserItems - Firestore 조회 완료 (' + userItems.length + '건 읽음)');
        this.set(key, userItems, this.ITEMS_TTL);
        return userItems;
      } catch (error) {
        console.error('[GlobalCache] ❌ getUserItems - 조회 오류:', error.message);
        const cached = this.cache.get(key);
        if (cached) {
          console.warn('[GlobalCache] ⚠️ 네트워크 오류 - 만료된 캐시 반환 (Firestore 읽기 0건)');
          return cached.data;
        }
        throw error;
      }
    });
  }

  // 🔥 [최적화] localStorage 동기화 타이머 추가
  startLocalStorageSync() {
    // 30분마다 localStorage의 만료된 항목 정리
    setInterval(() => {
      if (!this.useLocalStorage) return;

      try {
        const now = Date.now();
        const keysToDelete = [];

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.localStoragePrefix)) {
            const cached = localStorage.getItem(key);
            if (cached) {
              const {expiry} = JSON.parse(cached);
              if (now > expiry) {
                keysToDelete.push(key);
              }
            }
          }
        }

        keysToDelete.forEach(key => localStorage.removeItem(key));

        if (keysToDelete.length > 0) {
          console.log(`[GlobalCache] localStorage 정리: ${keysToDelete.length}개 만료된 항목 제거`);
        }
      } catch (error) {
        console.warn('[GlobalCache] localStorage 정리 오류:', error);
      }
    }, 30 * 60 * 1000); // 30분마다
  }

  // 캐시 정리 타이머
  startCleanupTimer() {
    setInterval(() => {
      const now = Date.now();
      const expiredKeys = [];

      for (const [key, expiry] of this.timestamps.entries()) {
        if (now > expiry) {
          expiredKeys.push(key);
        }
      }

      expiredKeys.forEach(key => this.invalidate(key));

      if (expiredKeys.length > 0) {
        console.log(`[GlobalCache] 메모리 캐시 정리: ${expiredKeys.length}개 만료된 항목 제거`);
      }
    }, 60000); // 1분마다 정리
  }

  // 사용자 로그아웃 시 캐시 정리
  clearUserData(userId) {
    this.invalidatePattern(`user_${userId}`);
    this.invalidatePattern(`userItems_${userId}`);
  }

  // 학급 변경 시 캐시 정리
  clearClassData(classCode) {
    this.invalidatePattern(`classMembers_${classCode}`);
    this.invalidatePattern(`activityLogs_${classCode}`);
  }

  // 전체 캐시 정리
  clearAll() {
    this.cache.clear();
    this.timestamps.clear();
    this.subscribers.clear();
    this.pendingRequests.clear();
  }

  // 캐시 상태 정보
  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      subscribers: this.subscribers.size,
      memoryUsage: JSON.stringify([...this.cache.entries()]).length
    };
  }
}

// 전역 인스턴스 생성
export const globalCache = new GlobalCacheService();

// React Hook
export const useGlobalCache = () => {
  return globalCache;
};

export default globalCache;