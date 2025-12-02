// src/utils/dbOptimizer.js
// Firestore 읽기/쓰기 최적화 유틸리티

import { db } from '../firebase';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, startAfter,
  writeBatch, onSnapshot, serverTimestamp
} from 'firebase/firestore';

// ============================================
// 캐시 관리
// ============================================

class MemoryCache {
  constructor(defaultTTL = 5 * 60 * 1000) { // 기본 5분
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  set(key, value, ttl = this.defaultTTL) {
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { value, expiresAt });
    return value;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  // 패턴으로 삭제
  deleteByPattern(pattern) {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  // 만료된 항목 정리
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

export const memoryCache = new MemoryCache();

// 주기적 정리 (5분마다)
setInterval(() => memoryCache.cleanup(), 5 * 60 * 1000);

// ============================================
// 배치 쓰기 관리자
// ============================================

class BatchWriteManager {
  constructor(options = {}) {
    this.queue = [];
    this.batchSize = options.batchSize || 500; // Firestore 최대 500
    this.flushInterval = options.flushInterval || 1000; // 1초
    this.isProcessing = false;
    this.flushTimer = null;
  }

  add(operation) {
    this.queue.push(operation);

    // 배치 크기에 도달하면 즉시 플러시
    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      // 타이머 설정
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  async flush() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;

    const operations = this.queue.splice(0, this.batchSize);

    try {
      const batch = writeBatch(db);

      for (const op of operations) {
        switch (op.type) {
          case 'set':
            batch.set(op.ref, op.data, op.options || {});
            break;
          case 'update':
            batch.update(op.ref, op.data);
            break;
          case 'delete':
            batch.delete(op.ref);
            break;
        }
      }

      await batch.commit();
      console.log(`[BatchWrite] ${operations.length}개 작업 완료`);
    } catch (error) {
      console.error('[BatchWrite] 오류:', error);
      // 실패한 작업 다시 큐에 추가
      this.queue.unshift(...operations);
    } finally {
      this.isProcessing = false;

      // 남은 작업이 있으면 계속 처리
      if (this.queue.length > 0) {
        this.flush();
      }
    }
  }

  getQueueSize() {
    return this.queue.length;
  }
}

export const batchWriter = new BatchWriteManager();

// ============================================
// 최적화된 읽기 함수
// ============================================

// 캐시된 문서 가져오기
export async function getCachedDoc(path, options = {}) {
  const { ttl = 5 * 60 * 1000, forceRefresh = false } = options;
  const cacheKey = `doc:${path}`;

  if (!forceRefresh) {
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${path}`);
      return cached;
    }
  }

  console.log(`[Cache MISS] ${path}`);
  const docRef = doc(db, ...path.split('/'));
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = { id: docSnap.id, ...docSnap.data() };
    memoryCache.set(cacheKey, data, ttl);
    return data;
  }

  return null;
}

// 캐시된 컬렉션 가져오기
export async function getCachedCollection(path, queryConstraints = [], options = {}) {
  const { ttl = 3 * 60 * 1000, forceRefresh = false } = options;
  const cacheKey = `col:${path}:${JSON.stringify(queryConstraints.map(c => c.toString()))}`;

  if (!forceRefresh) {
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${path} (${cached.length} items)`);
      return cached;
    }
  }

  console.log(`[Cache MISS] ${path}`);
  const colRef = collection(db, ...path.split('/'));
  const q = query(colRef, ...queryConstraints);
  const querySnap = await getDocs(q);

  const data = querySnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  memoryCache.set(cacheKey, data, ttl);
  return data;
}

// 페이지네이션 가져오기
export async function getPaginatedDocs(path, queryConstraints = [], pageSize = 20, lastDoc = null) {
  const colRef = collection(db, ...path.split('/'));

  const constraints = [...queryConstraints, limit(pageSize)];
  if (lastDoc) {
    constraints.push(startAfter(lastDoc));
  }

  const q = query(colRef, ...constraints);
  const querySnap = await getDocs(q);

  const docs = querySnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    _doc: doc // 다음 페이지 쿼리용
  }));

  return {
    docs,
    hasMore: docs.length === pageSize,
    lastDoc: querySnap.docs[querySnap.docs.length - 1] || null
  };
}

// ============================================
// 최적화된 쓰기 함수
// ============================================

// 디바운스된 업데이트
const updateDebounceMap = new Map();

export function debouncedUpdate(path, data, delay = 1000) {
  const existingTimer = updateDebounceMap.get(path);
  if (existingTimer) {
    clearTimeout(existingTimer.timer);
    existingTimer.data = { ...existingTimer.data, ...data };
  } else {
    updateDebounceMap.set(path, { data, timer: null });
  }

  const entry = updateDebounceMap.get(path);
  entry.timer = setTimeout(async () => {
    try {
      const docRef = doc(db, ...path.split('/'));
      await updateDoc(docRef, {
        ...entry.data,
        updatedAt: serverTimestamp()
      });
      console.log(`[Debounced Update] ${path}`);
      memoryCache.delete(`doc:${path}`);
    } catch (error) {
      console.error('[Debounced Update Error]', error);
    } finally {
      updateDebounceMap.delete(path);
    }
  }, delay);
}

// 배치 세트
export function batchSet(path, data, options = {}) {
  const docRef = doc(db, ...path.split('/'));
  batchWriter.add({
    type: 'set',
    ref: docRef,
    data: { ...data, updatedAt: serverTimestamp() },
    options
  });
  memoryCache.delete(`doc:${path}`);
}

// 배치 업데이트
export function batchUpdate(path, data) {
  const docRef = doc(db, ...path.split('/'));
  batchWriter.add({
    type: 'update',
    ref: docRef,
    data: { ...data, updatedAt: serverTimestamp() }
  });
  memoryCache.delete(`doc:${path}`);
}

// 배치 삭제
export function batchDelete(path) {
  const docRef = doc(db, ...path.split('/'));
  batchWriter.add({
    type: 'delete',
    ref: docRef
  });
  memoryCache.delete(`doc:${path}`);
}

// ============================================
// 실시간 리스너 관리
// ============================================

class ListenerManager {
  constructor() {
    this.listeners = new Map();
  }

  // 리스너 등록
  subscribe(key, path, callback, queryConstraints = []) {
    // 기존 리스너 정리
    this.unsubscribe(key);

    const ref = path.includes('/') && path.split('/').length > 1
      ? doc(db, ...path.split('/'))
      : collection(db, path);

    let unsubscribe;

    if (queryConstraints.length > 0) {
      const q = query(ref, ...queryConstraints);
      unsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.docs) {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          callback(data);
        } else if (snapshot.exists?.()) {
          callback({ id: snapshot.id, ...snapshot.data() });
        } else {
          callback(null);
        }
      });
    } else {
      unsubscribe = onSnapshot(ref, (snapshot) => {
        if (snapshot.docs) {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          callback(data);
        } else if (snapshot.exists?.()) {
          callback({ id: snapshot.id, ...snapshot.data() });
        } else {
          callback(null);
        }
      });
    }

    this.listeners.set(key, unsubscribe);
    console.log(`[Listener] 등록: ${key}`);

    return () => this.unsubscribe(key);
  }

  // 리스너 해제
  unsubscribe(key) {
    const unsubscribe = this.listeners.get(key);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(key);
      console.log(`[Listener] 해제: ${key}`);
    }
  }

  // 모든 리스너 해제
  unsubscribeAll() {
    for (const [key, unsubscribe] of this.listeners) {
      unsubscribe();
      console.log(`[Listener] 해제: ${key}`);
    }
    this.listeners.clear();
  }

  getActiveCount() {
    return this.listeners.size;
  }
}

export const listenerManager = new ListenerManager();

// ============================================
// 유틸리티
// ============================================

// 캐시 무효화
export function invalidateCache(pattern) {
  if (pattern) {
    memoryCache.deleteByPattern(pattern);
  } else {
    memoryCache.clear();
  }
}

// 통계 가져오기
export function getDBStats() {
  return {
    cache: memoryCache.getStats(),
    pendingWrites: batchWriter.getQueueSize(),
    activeListeners: listenerManager.getActiveCount()
  };
}

// 전역 객체에 등록 (디버깅용)
if (typeof window !== 'undefined') {
  window.dbOptimizer = {
    cache: memoryCache,
    batchWriter,
    listenerManager,
    getStats: getDBStats,
    invalidateCache
  };
}

export default {
  memoryCache,
  batchWriter,
  listenerManager,
  getCachedDoc,
  getCachedCollection,
  getPaginatedDocs,
  debouncedUpdate,
  batchSet,
  batchUpdate,
  batchDelete,
  invalidateCache,
  getDBStats
};
