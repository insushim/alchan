// src/services/indexedDBCache.js - IndexedDB를 사용한 영구 캐시 서비스

const DB_NAME = 'EconomyClassCache';
const DB_VERSION = 1;
const STORE_NAME = 'dataCache';

class IndexedDBCacheService {
  constructor() {
    this.db = null;
    this.isSupported = this.checkSupport();
    this.initPromise = null;
  }

  checkSupport() {
    return typeof indexedDB !== 'undefined';
  }

  async init() {
    if (!this.isSupported) {
      console.warn('[IndexedDBCache] IndexedDB가 지원되지 않는 환경입니다.');
      return null;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[IndexedDBCache] DB 열기 실패:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDBCache] DB 초기화 완료');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 기존 store가 있으면 삭제
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }

        // 새로운 object store 생성
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        objectStore.createIndex('expiry', 'expiry', { unique: false });

        console.log('[IndexedDBCache] Object Store 생성 완료');
      };
    });

    return this.initPromise;
  }

  async set(key, data, ttlSeconds = 1200) { // 기본 20분
    if (!this.isSupported) return false;

    try {
      await this.init();

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const cacheItem = {
        key,
        data,
        expiry: Date.now() + (ttlSeconds * 1000),
        createdAt: Date.now()
      };

      await new Promise((resolve, reject) => {
        const request = store.put(cacheItem);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      return true;
    } catch (error) {
      console.error('[IndexedDBCache] 저장 오류:', error);
      return false;
    }
  }

  async get(key) {
    if (!this.isSupported) return null;

    try {
      await this.init();

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const cacheItem = await new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!cacheItem) {
        return null;
      }

      // TTL 체크
      if (Date.now() > cacheItem.expiry) {
        // 만료된 항목 삭제
        await this.delete(key);
        return null;
      }

      return cacheItem.data;
    } catch (error) {
      console.error('[IndexedDBCache] 조회 오류:', error);
      return null;
    }
  }

  async delete(key) {
    if (!this.isSupported) return false;

    try {
      await this.init();

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      await new Promise((resolve, reject) => {
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      return true;
    } catch (error) {
      console.error('[IndexedDBCache] 삭제 오류:', error);
      return false;
    }
  }

  async clear() {
    if (!this.isSupported) return false;

    try {
      await this.init();

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      await new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log('[IndexedDBCache] 전체 캐시 삭제 완료');
      return true;
    } catch (error) {
      console.error('[IndexedDBCache] 전체 삭제 오류:', error);
      return false;
    }
  }

  async cleanupExpired() {
    if (!this.isSupported) return 0;

    try {
      await this.init();

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('expiry');

      const now = Date.now();
      let deletedCount = 0;

      const cursorRequest = index.openCursor();

      await new Promise((resolve, reject) => {
        cursorRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            if (cursor.value.expiry < now) {
              cursor.delete();
              deletedCount++;
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      });

      if (deletedCount > 0) {
        console.log(`[IndexedDBCache] 만료된 항목 ${deletedCount}개 삭제 완료`);
      }

      return deletedCount;
    } catch (error) {
      console.error('[IndexedDBCache] 만료 항목 정리 오류:', error);
      return 0;
    }
  }

  async getSize() {
    if (!this.isSupported) return 0;

    try {
      await this.init();

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const count = await new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      return count;
    } catch (error) {
      console.error('[IndexedDBCache] 크기 조회 오류:', error);
      return 0;
    }
  }
}

// 싱글톤 인스턴스 생성
const indexedDBCache = new IndexedDBCacheService();

// 초기화 (앱 시작 시)
indexedDBCache.init().catch(err => {
  console.error('[IndexedDBCache] 초기화 실패:', err);
});

// 주기적으로 만료된 항목 정리 (10분마다)
setInterval(() => {
  indexedDBCache.cleanupExpired();
}, 10 * 60 * 1000);

export default indexedDBCache;
