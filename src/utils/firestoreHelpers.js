// src/utils/firestoreHelpers.js
// 공통 Firestore 헬퍼: 페이지네이션, 배치 조회(where __name__ in), 유틸
import {
  getDocs,
  query as q,
  limit as qLimit,
  startAfter as qStartAfter,
  where,
  doc,
  getDoc,
  writeBatch,
  runTransaction,
  collection,
} from "../firebase";

/**
 * startAfter 기반 페이지네이션 로더를 만들어 줍니다.
 * @param {import('firebase/firestore').Query} baseQuery   orderBy 포함 필수
 * @param {number} pageSize
 * @returns {{loadFirst: function(): Promise<{items: any[], lastDoc: any}>, loadMore: function(lastDoc:any): Promise<{items:any[], lastDoc:any}>}}
 */
export function createPaginator(baseQuery, pageSize = 20) {
  if (!baseQuery) throw new Error("createPaginator: baseQuery가 필요합니다.");
  if (pageSize <= 0) pageSize = 20;

  const loadFirst = async () => {
    const pageQ = q(baseQuery, qLimit(pageSize));
    const snap = await getDocs(pageQ);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const lastDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    return { items, lastDoc };
  };

  const loadMore = async (last) => {
    if (!last) return { items: [], lastDoc: null };
    const pageQ = q(baseQuery, qStartAfter(last), qLimit(pageSize));
    const snap = await getDocs(pageQ);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const newLast = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    return { items, lastDoc: newLast };
  };

  return { loadFirst, loadMore };
}

/**
 * where("__name__", "in", [...]) 기반 배치 조회. Firestore는 in 배열이 최대 10개.
 * 10개씩 청크로 나누어 병렬 조회 후 합칩니다.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} collectionPath
 * @param {string[]} ids
 * @returns {Promise<Record<string, any>>}  // id -> data
 */
export async function batchGetByIds(db, collectionPath, ids) {
  if (!ids || ids.length === 0) return {};
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

  const colRef = collection(db, collectionPath);
  const results = await Promise.all(chunks.map(async (chunk) => {
    const snap = await getDocs(q(colRef, where("__name__", "in", chunk)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }));

  const flat = results.flat();
  const map = {};
  flat.forEach(doc => { map[doc.id] = doc; });
  return map;
}

/**
 * 집계 문서(예: stats/{classCode})를 배치/트랜잭션으로 업데이트하는 헬퍼
 * - 서버사이드(Functions) 권장. 클라이언트 대안으로 제공.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} statsDocPath  예: `stats/${classCode}`
 * @param {(prev:any)=>any} reducer   이전 값을 받아 업데이트할 객체 반환
 */
export async function updateAggregateDoc(db, statsDocPath, reducer) {
  const ref = doc(db, statsDocPath);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists() ? snap.data() : {};
    const next = reducer(prev || {});
    tx.set(ref, next, { merge: true });
  });
}
