// src/hooks/useFirestoreData.js
// 통합 Firestore 데이터 훅 - 캐싱 및 최적화

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db } from '../firebase';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

// ============================================
// 전역 캐시 관리 - 🔥 최적화: 크기 제한 및 LRU 정책 추가
// ============================================
const MAX_CACHE_SIZE = 200; // 🔥 최대 캐시 항목 수

class GlobalCache {
  constructor() {
    this.cache = new Map();
    this.subscribers = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  generateKey(path, queryParams = null) {
    if (queryParams) {
      return `${path}:${JSON.stringify(queryParams)}`;
    }
    return path;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // TTL 체크
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // 🔥 LRU: 접근 시간 업데이트
    entry.lastAccessed = Date.now();
    this.hits++;
    return entry.data;
  }

  set(key, data, ttl = 5 * 60 * 1000) {
    // 🔥 캐시 용량 관리 - LRU 정책
    if (this.cache.size >= MAX_CACHE_SIZE) {
      this._evictOldest();
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      updatedAt: Date.now(),
      lastAccessed: Date.now(),
    });

    // 구독자에게 알림
    const subs = this.subscribers.get(key);
    if (subs) {
      subs.forEach(callback => callback(data));
    }
  }

  // 🔥 LRU: 가장 오래된 항목 제거
  _evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key).add(callback);

    return () => {
      this.subscribers.get(key)?.delete(callback);
    };
  }

  invalidate(pattern) {
    if (typeof pattern === 'string') {
      // 패턴 매칭으로 삭제
      const regex = new RegExp(pattern);
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
        }
      }
    }
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    const hitRate = this.hits + this.misses > 0
      ? ((this.hits / (this.hits + this.misses)) * 100).toFixed(1)
      : 0;
    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_SIZE,
      hits: this.hits,
      misses: this.misses,
      hitRate: `${hitRate}%`,
      keys: Array.from(this.cache.keys()),
    };
  }

  // 🔥 통계 리셋
  resetStats() {
    this.hits = 0;
    this.misses = 0;
  }
}

export const globalCache = new GlobalCache();

// 전역 접근 (디버깅용)
if (typeof window !== 'undefined') {
  window.__firestoreCache = globalCache;
}

// ============================================
// 단일 문서 훅
// ============================================
export function useDocument(path, options = {}) {
  const {
    enabled = true,
    ttl = 5 * 60 * 1000, // 5분
    realtime = false,
    onError,
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const unsubscribeRef = useRef(null);

  const cacheKey = globalCache.generateKey(path);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!path || !enabled) {
      setLoading(false);
      return;
    }

    // 캐시 확인
    if (!forceRefresh) {
      const cached = globalCache.get(cacheKey);
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const docRef = doc(db, ...path.split('/'));
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const docData = { id: docSnap.id, ...docSnap.data() };
        globalCache.set(cacheKey, docData, ttl);
        setData(docData);
      } else {
        setData(null);
      }
      setError(null);
    } catch (err) {
      console.error(`[useDocument] Error fetching ${path}:`, err);
      setError(err);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [path, enabled, cacheKey, ttl, onError]);

  // 실시간 리스너 설정
  useEffect(() => {
    if (!path || !enabled) {
      setLoading(false);
      return;
    }

    if (realtime) {
      const docRef = doc(db, ...path.split('/'));
      unsubscribeRef.current = onSnapshot(
        docRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const docData = { id: docSnap.id, ...docSnap.data() };
            globalCache.set(cacheKey, docData, ttl);
            setData(docData);
          } else {
            setData(null);
          }
          setLoading(false);
        },
        (err) => {
          console.error(`[useDocument] Realtime error:`, err);
          setError(err);
          setLoading(false);
        }
      );

      return () => {
        unsubscribeRef.current?.();
      };
    } else {
      fetchData();
    }
  }, [path, enabled, realtime, fetchData, cacheKey, ttl]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, error, refetch };
}

// ============================================
// 컬렉션 훅
// ============================================
export function useCollection(path, queryConstraints = [], options = {}) {
  const {
    enabled = true,
    ttl = 3 * 60 * 1000, // 3분
    realtime = false,
    onError,
  } = options;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const unsubscribeRef = useRef(null);

  // 쿼리 파라미터를 문자열로 직렬화
  const queryKey = useMemo(() => {
    try {
      return JSON.stringify(queryConstraints.map(c => c?.toString?.() || ''));
    } catch {
      return '';
    }
  }, [queryConstraints]);

  const cacheKey = globalCache.generateKey(path, queryKey);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!path || !enabled) {
      setLoading(false);
      return;
    }

    // 캐시 확인
    if (!forceRefresh) {
      const cached = globalCache.get(cacheKey);
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const colRef = collection(db, ...path.split('/'));
      const q = queryConstraints.length > 0
        ? query(colRef, ...queryConstraints)
        : colRef;

      const querySnap = await getDocs(q);
      const docs = querySnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      globalCache.set(cacheKey, docs, ttl);
      setData(docs);
      setError(null);
    } catch (err) {
      console.error(`[useCollection] Error fetching ${path}:`, err);
      setError(err);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [path, enabled, cacheKey, queryConstraints, ttl, onError]);

  useEffect(() => {
    if (!path || !enabled) {
      setLoading(false);
      return;
    }

    if (realtime) {
      const colRef = collection(db, ...path.split('/'));
      const q = queryConstraints.length > 0
        ? query(colRef, ...queryConstraints)
        : colRef;

      unsubscribeRef.current = onSnapshot(
        q,
        (querySnap) => {
          const docs = querySnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          }));
          globalCache.set(cacheKey, docs, ttl);
          setData(docs);
          setLoading(false);
        },
        (err) => {
          console.error(`[useCollection] Realtime error:`, err);
          setError(err);
          setLoading(false);
        }
      );

      return () => {
        unsubscribeRef.current?.();
      };
    } else {
      fetchData();
    }
  }, [path, enabled, realtime, queryKey]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, error, refetch };
}

// ============================================
// 학급 데이터 통합 훅 - 🔥 TTL 최적화
// ============================================
export function useClassData(classCode, options = {}) {
  const { enabled = true } = options;

  // 🔥 학급 정보 - 거의 변경 안됨 (30분 TTL)
  const classInfo = useDocument(
    classCode ? `classes/${classCode}` : null,
    { enabled: !!classCode && enabled, ttl: 30 * 60 * 1000 }
  );

  // 🔥 학급 구성원 - 가끔 변경 (10분 TTL)
  const members = useCollection(
    'users',
    classCode ? [where('classCode', '==', classCode)] : [],
    { enabled: !!classCode && enabled, ttl: 10 * 60 * 1000 }
  );

  // 🔥 직업 목록 - 거의 변경 안됨 (30분 TTL)
  const jobs = useCollection(
    'jobs',
    classCode ? [where('classCode', '==', classCode)] : [],
    { enabled: !!classCode && enabled, ttl: 30 * 60 * 1000 }
  );

  // 🔥 국고 잔액 - 자주 변경됨 (3분 TTL)
  const treasury = useDocument(
    classCode ? `nationalTreasuries/${classCode}` : null,
    { enabled: !!classCode && enabled, ttl: 3 * 60 * 1000 }
  );

  const loading = classInfo.loading || members.loading || jobs.loading || treasury.loading;

  const refetchAll = useCallback(() => {
    classInfo.refetch();
    members.refetch();
    jobs.refetch();
    treasury.refetch();
  }, [classInfo, members, jobs, treasury]);

  return {
    classInfo: classInfo.data,
    members: members.data,
    jobs: jobs.data,
    treasury: treasury.data,
    loading,
    refetchAll,
  };
}

// ============================================
// 사용자 데이터 훅
// ============================================
export function useUserData(userId, options = {}) {
  const { enabled = true, realtime = false } = options;

  // 기본 사용자 정보
  const userInfo = useDocument(
    userId ? `users/${userId}` : null,
    { enabled: !!userId && enabled, realtime, ttl: 5 * 60 * 1000 }
  );

  // 사용자 아이템
  const items = useCollection(
    userId ? `user_items/${userId}/items` : null,
    [],
    { enabled: !!userId && enabled, ttl: 3 * 60 * 1000 }
  );

  // 거래 내역 (최근 20개)
  const transactions = useCollection(
    'transactions',
    userId ? [
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(20)
    ] : [],
    { enabled: !!userId && enabled, ttl: 2 * 60 * 1000 }
  );

  const loading = userInfo.loading || items.loading || transactions.loading;

  return {
    user: userInfo.data,
    items: items.data,
    transactions: transactions.data,
    loading,
    refetch: userInfo.refetch,
  };
}

// ============================================
// 페이지네이션 훅
// ============================================
export function usePaginatedCollection(path, queryConstraints = [], pageSize = 20) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !path) return;

    setLoading(true);
    try {
      const colRef = collection(db, ...path.split('/'));
      const constraints = [...queryConstraints, limit(pageSize)];

      if (lastDoc) {
        constraints.push(startAfter(lastDoc));
      }

      const q = query(colRef, ...constraints);
      const querySnap = await getDocs(q);

      const newDocs = querySnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      setData(prev => [...prev, ...newDocs]);
      setLastDoc(querySnap.docs[querySnap.docs.length - 1] || null);
      setHasMore(newDocs.length === pageSize);
    } catch (err) {
      console.error('[usePaginatedCollection] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [path, queryConstraints, pageSize, loading, hasMore, lastDoc]);

  const reset = useCallback(() => {
    setData([]);
    setLastDoc(null);
    setHasMore(true);
  }, []);

  // 초기 로드
  useEffect(() => {
    if (path) {
      reset();
      loadMore();
    }
  }, [path]);

  return { data, loading, hasMore, loadMore, reset };
}

// ============================================
// 캐시 무효화 유틸리티
// ============================================
export function invalidateCache(pattern) {
  globalCache.invalidate(pattern);
}

export function clearCache() {
  globalCache.clear();
}

export default {
  useDocument,
  useCollection,
  useClassData,
  useUserData,
  usePaginatedCollection,
  globalCache,
  invalidateCache,
  clearCache,
};
