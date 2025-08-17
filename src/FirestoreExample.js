// src/FirestoreExample.js
import React, { useState, useEffect } from "react";
import {
  db,
  addData,
  updateData,
  deleteData,
  subscribeToCollection,
} from "./firebase";

function FirestoreExample() {
  const [users, setUsers] = useState([]);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  // 컬렉션 이름
  const COLLECTION_NAME = "users";

  // 실시간 데이터 구독
  useEffect(() => {
    // db가 초기화되지 않았을 경우 처리
    if (!db) {
      setLoading(false);
      setError(
        "Firestore가 초기화되지 않았습니다. Firebase 콘솔에서 Firestore를 활성화했는지 확인해주세요."
      );
      return;
    }

    const unsubscribe = subscribeToCollection(COLLECTION_NAME, (data) => {
      setUsers(data);
      setLoading(false);
    });

    // 컴포넌트 언마운트 시 구독 취소
    return () => unsubscribe();
  }, []);

  // 새 사용자 추가
  const handleAddUser = async (e) => {
    e.preventDefault();

    if (!db) {
      setError("Firestore가 초기화되지 않았습니다.");
      return;
    }

    if (!name || !email) {
      setError("이름과 이메일을 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    const userData = {
      name,
      age: age ? parseInt(age) : null,
      email,
    };

    try {
      await addData(COLLECTION_NAME, userData);
      setName("");
      setAge("");
      setEmail("");
    } catch (err) {
      setError("사용자 추가 중 오류가 발생했습니다: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 사용자 정보 업데이트
  const handleUpdateUser = async (e) => {
    e.preventDefault();

    if (!db) {
      setError("Firestore가 초기화되지 않았습니다.");
      return;
    }

    if (!editing || !editing.name || !editing.email) {
      setError("이름과 이메일을 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await updateData(COLLECTION_NAME, editing.id, {
        name: editing.name,
        email: editing.email,
        age: editing.age ? parseInt(editing.age) : null,
      });
      setEditing(null);
    } catch (err) {
      setError("사용자 업데이트 중 오류가 발생했습니다: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 사용자 삭제
  const handleDeleteUser = async (userId) => {
    if (!db) {
      setError("Firestore가 초기화되지 않았습니다.");
      return;
    }

    if (!window.confirm("정말 이 사용자를 삭제하시겠습니까?")) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await deleteData(COLLECTION_NAME, userId);
    } catch (err) {
      setError("사용자 삭제 중 오류가 발생했습니다: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="firestore-example">
      <h1>Firebase Firestore CRUD 예제</h1>

      {/* 오류 메시지 */}
      {error && (
        <div
          className="error-message"
          style={{
            color: "white",
            backgroundColor: "#e53e3e",
            padding: "12px",
            borderRadius: "4px",
            margin: "16px 0",
          }}
        >
          {error}
        </div>
      )}

      <div
        className="firestore-container"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "20px",
          marginTop: "20px",
        }}
      >
        {/* 새 사용자 추가 폼 */}
        <div
          className="form-container"
          style={{
            backgroundColor: "#f0f9ff",
            padding: "16px",
            borderRadius: "8px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          <h2 style={{ marginBottom: "16px" }}>새 사용자 추가</h2>
          <form
            onSubmit={handleAddUser}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div className="form-group">
              <label style={{ display: "block", marginBottom: "4px" }}>
                이름:
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름 입력"
                required
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #cbd5e0",
                  borderRadius: "4px",
                }}
              />
            </div>

            <div className="form-group">
              <label style={{ display: "block", marginBottom: "4px" }}>
                나이:
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="나이 입력 (선택사항)"
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #cbd5e0",
                  borderRadius: "4px",
                }}
              />
            </div>

            <div className="form-group">
              <label style={{ display: "block", marginBottom: "4px" }}>
                이메일:
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일 입력"
                required
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #cbd5e0",
                  borderRadius: "4px",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: "#4299e1",
                color: "white",
                padding: "8px 16px",
                borderRadius: "4px",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                marginTop: "8px",
              }}
            >
              {loading ? "처리 중..." : "사용자 추가"}
            </button>
          </form>
        </div>

        {/* 사용자 수정 폼 */}
        {editing && (
          <div
            className="form-container editing-form"
            style={{
              backgroundColor: "#fffbeb",
              padding: "16px",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            <h2 style={{ marginBottom: "16px" }}>사용자 정보 수정</h2>
            <form
              onSubmit={handleUpdateUser}
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <div className="form-group">
                <label style={{ display: "block", marginBottom: "4px" }}>
                  이름:
                </label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  required
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #cbd5e0",
                    borderRadius: "4px",
                  }}
                />
              </div>

              <div className="form-group">
                <label style={{ display: "block", marginBottom: "4px" }}>
                  나이:
                </label>
                <input
                  type="number"
                  value={editing.age || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, age: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #cbd5e0",
                    borderRadius: "4px",
                  }}
                />
              </div>

              <div className="form-group">
                <label style={{ display: "block", marginBottom: "4px" }}>
                  이메일:
                </label>
                <input
                  type="email"
                  value={editing.email}
                  onChange={(e) =>
                    setEditing({ ...editing, email: e.target.value })
                  }
                  required
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #cbd5e0",
                    borderRadius: "4px",
                  }}
                />
              </div>

              <div
                className="form-buttons"
                style={{ display: "flex", gap: "8px" }}
              >
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    backgroundColor: "#38a169",
                    color: "white",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    border: "none",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.7 : 1,
                    flex: 1,
                  }}
                >
                  {loading ? "처리 중..." : "저장"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="cancel-button"
                  style={{
                    backgroundColor: "#e2e8f0",
                    color: "#4a5568",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    border: "none",
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 사용자 목록 */}
        <div
          className="users-list"
          style={{
            backgroundColor: "#f7fafc",
            padding: "16px",
            borderRadius: "8px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            gridColumn: editing ? "span 2" : "span 1",
          }}
        >
          <h2 style={{ marginBottom: "16px" }}>사용자 목록</h2>

          {loading && !users.length ? (
            <p
              className="loading-message"
              style={{ textAlign: "center", padding: "16px" }}
            >
              데이터를 불러오는 중...
            </p>
          ) : users.length === 0 ? (
            <p
              className="empty-message"
              style={{ textAlign: "center", padding: "16px", color: "#718096" }}
            >
              등록된 사용자가 없습니다.
            </p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gap: "12px",
              }}
            >
              {users.map((user) => (
                <li
                  key={user.id}
                  className="user-card"
                  style={{
                    backgroundColor: "white",
                    padding: "16px",
                    borderRadius: "6px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div className="user-info">
                    <h3 style={{ margin: "0 0 8px 0", fontSize: "18px" }}>
                      {user.name}
                    </h3>
                    {user.age && (
                      <p style={{ margin: "4px 0", color: "#4a5568" }}>
                        나이: {user.age}세
                      </p>
                    )}
                    <p style={{ margin: "4px 0", color: "#4a5568" }}>
                      이메일: {user.email}
                    </p>
                    <p
                      className="user-id"
                      style={{
                        margin: "4px 0",
                        fontSize: "12px",
                        color: "#718096",
                      }}
                    >
                      ID: {user.id}
                    </p>
                    {user.createdAt && (
                      <p
                        className="timestamp"
                        style={{
                          margin: "4px 0",
                          fontSize: "12px",
                          color: "#718096",
                        }}
                      >
                        가입일:{" "}
                        {new Date(user.createdAt.toDate()).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div
                    className="user-actions"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <button
                      onClick={() => setEditing(user)}
                      className="edit-button"
                      style={{
                        backgroundColor: "#4299e1",
                        color: "white",
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="delete-button"
                      style={{
                        backgroundColor: "#f56565",
                        color: "white",
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default FirestoreExample;
