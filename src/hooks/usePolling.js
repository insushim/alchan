// src/hooks/usePolling.js - onSnapshot 대체용 Polling Hook (최적화 버전)
import { useState, useEffect, useCallback, useRef } from 'react';

// 페이지별 폴링 간격 상수
export const POLLING_INTERVALS = {
  REALTIME: 60000,      // 1분 - 실시간성이 중요한 페이지 (주식거래소, 경매)
  NORMAL: 300000,       // 5분 - 일반 페이지 (대시보드, 자산)
  LOW: 600000,          // 10분 - 거의 변화없는 페이지 (학습자료)
  MANUAL: null          // 수동 새로고침만
};

// 🔥 [최적화] 전역 초기 로드 디바운싱 - 여러 폴링이 동시에 실행되지 않도록
let globalInitialLoadQueue = [];
let isProcessingQueue = false;

const processInitialLoadQueue = async () => {
  if (isProcessingQueue || globalInitialLoadQueue.length === 0) return;
  isProcessingQueue = true;

  while (globalInitialLoadQueue.length > 0) {
    const fetchFn = globalInitialLoadQueue.shift();
    await fetchFn();
    // 각 요청 사이에 100ms 간격 추가
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  isProcessingQueue = false;
};

/**
 * Firestore 실시간 리스너(onSnapshot)를 Polling으로 대체하는 Hook
 *
 * @param {Function} queryFn - Firestore 조회 함수 (getDocs 사용)
 * @param {Object} options - 옵션
 * @param {number} options.interval - Polling 간격 (ms, 기본 5분)
 * @param {boolean} options.enabled - Polling 활성화 여부
 * @param {Array} options.deps - 의존성 배열
 *
 * @returns {Object} { data, loading, error, refetch }
 */
export const usePolling = (queryFn, options = {}) => {
  const {
    interval = POLLING_INTERVALS.NORMAL, // 기본값을 5분으로 변경
    enabled = true,
    deps = []
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);
  const queryFnRef = useRef(queryFn);

  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const result = await queryFnRef.current();

      if (mountedRef.current) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      console.error('[usePolling] 데이터 조회 오류:', err);
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
      }
    }
  }, [enabled]);

  const refetch = useCallback(() => {
    setLoading(true);
    return fetchData();
  }, [fetchData]);

  useEffect(() => {
    mountedRef.current = true;

    // 기존 interval 정리
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // enabled가 false이거나 수동 모드면 폴링 중지
    if (!enabled || interval === POLLING_INTERVALS.MANUAL) {
      setLoading(false);
      return;
    }

    // 🔥 [최적화] 초기 로드를 큐에 추가하여 순차 실행
    globalInitialLoadQueue.push(fetchData);
    processInitialLoadQueue();

    // Polling 시작 (interval이 null이면 수동 모드)
    if (interval && interval > 0) {
      intervalRef.current = setInterval(fetchData, interval);
    }

    return () => {
      console.log('[usePolling] cleanup - interval ID:', intervalRef.current);
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchData, interval, enabled, ...deps]);

  return { data, loading, error, refetch };
};

/**
 * 여러 쿼리를 동시에 Polling하는 Hook
 *
 * @param {Array<{key: string, queryFn: Function}>} queries - 쿼리 배열
 * @param {Object} options - 옵션
 *
 * @returns {Object} { data: {key: data}, loading, errors, refetchAll }
 */
export const useMultiPolling = (queries, options = {}) => {
  const {
    interval = POLLING_INTERVALS.NORMAL, // 기본값을 5분으로 변경
    enabled = true,
    deps = []
  } = options;

  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchAllData = useCallback(async () => {
    if (!enabled || queries.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const results = await Promise.allSettled(
        queries.map(({ key, queryFn }) =>
          queryFn().then(result => ({ key, result }))
        )
      );

      if (mountedRef.current) {
        const newData = {};
        const newErrors = {};

        results.forEach((result, index) => {
          const { key } = queries[index];

          if (result.status === 'fulfilled') {
            newData[key] = result.value.result;
          } else {
            newErrors[key] = result.reason;
            console.error(`[useMultiPolling] ${key} 조회 오류:`, result.reason);
          }
        });

        setData(newData);
        setErrors(newErrors);
        setLoading(false);
      }
    } catch (err) {
      console.error('[useMultiPolling] 전체 조회 오류:', err);
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [queries, enabled]);

  const refetchAll = useCallback(() => {
    setLoading(true);
    return fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    mountedRef.current = true;

    // 기존 interval 정리
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // enabled가 false이거나 쿼리가 없거나 수동 모드면 폴링 중지
    if (!enabled || queries.length === 0 || interval === POLLING_INTERVALS.MANUAL) {
      setLoading(false);
      console.log('[useMultiPolling] 폴링 비활성화 - enabled:', enabled, 'queries:', queries.length);
      return;
    }

    console.log('[useMultiPolling] 폴링 시작 - interval:', interval);

    // 즉시 한 번 실행
    fetchAllData();

    // Polling 시작 (interval이 null이면 수동 모드)
    if (interval && interval > 0) {
      intervalRef.current = setInterval(fetchAllData, interval);
      console.log('[useMultiPolling] setInterval 생성 - ID:', intervalRef.current);
    }

    return () => {
      console.log('[useMultiPolling] cleanup - interval ID:', intervalRef.current);
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchAllData, interval, enabled, ...deps]);

  return { data, loading, errors, refetchAll };
};

export default usePolling;
