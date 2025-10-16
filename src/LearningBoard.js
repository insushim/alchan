// src/LearningBoard.js
import React, { useState, useEffect, useMemo, useCallback } from "react";
import "./LearningBoard.css";
import { useAuth } from "./AuthContext";
import {
  db, // db는 firebase.js에서 가져옵니다.
} from "./firebase";

// Firestore v9 모듈식 API에서 필요한 함수들을 직접 가져옵니다.
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
  setDoc,
  runTransaction, // runTransaction 임포트 추가
} from "firebase/firestore";

import { usePolling } from "./hooks/usePolling";

// formatDate 함수 (컴포넌트 외부에 정의하거나 유틸리티 파일로 분리 가능)
const formatDate = (isoString) => {
  if (!isoString) return "날짜 정보 없음";
  try {
    const date = new Date(isoString);
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "날짜 형식 오류";
  }
};

const LearningBoard = () => {
  const {
    userDoc: currentUser,
    isAdmin,
    addCouponsToUser,
    loading: authLoading,
  } = useAuth();

  const currentUserId = currentUser?.id;
  const classCode = currentUser?.classCode;

  const [selectedBoard, setSelectedBoard] = useState(null);

  const [isWriting, setIsWriting] = useState(false);
  const [showBoardSelection, setShowBoardSelection] = useState(false);
  const [newPost, setNewPost] = useState({ title: "", content: "" });
  const [customCouponAmount, setCustomCouponAmount] = useState(0);
  const [newBoardName, setNewBoardName] = useState("");

  // 관리자 패널 초기값을 명시적으로 false로 설정
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const [showHiddenBoardsView, setShowHiddenBoardsView] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState(null);
  const [editingBoardName, setEditingBoardName] = useState("");
  const [isFullScreenMode, setIsFullScreenMode] = useState(false);

  // boardsCollectionRef 정의
  const boardsCollectionRef = useMemo(() => {
    if (classCode) {
      return collection(db, "classes", classCode, "learningBoards");
    }
    return null;
  }, [classCode]);

  // 게시판 목록 로드 - usePolling으로 변환
  const {
    data: boards = [],
    loading: boardsLoading,
    refetch: refetchBoards,
  } = usePolling(
    async () => {
      if (!classCode) {
        console.log(
          "[LearningBoard Debug] No classCode. Returning empty boards."
        );
        return [];
      }
      console.log(
        "[LearningBoard Debug] Fetching boards for classCode:",
        classCode
      );
      const boardsPathRef = collection(
        db,
        "classes",
        classCode,
        "learningBoards"
      );
      const q = query(boardsPathRef, orderBy("name"));
      const snapshot = await getDocs(q);
      console.log(
        "[LearningBoard Debug] Boards fetched. Docs count:",
        snapshot.docs.length
      );
      const loadedBoards = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        isHidden:
          typeof doc.data().isHidden === "boolean"
            ? doc.data().isHidden
            : false,
      }));
      return loadedBoards;
    },
    { interval: 30000, enabled: !!classCode, deps: [classCode] }
  );

  // 선택된 게시판의 게시글 로드 - usePolling으로 변환
  const {
    data: selectedBoardPosts = [],
    loading: postsLoading,
    refetch: refetchPosts,
  } = usePolling(
    async () => {
      if (!selectedBoard || !classCode) {
        return [];
      }
      console.log(
        `[LearningBoard Debug] Fetching posts for board: ${selectedBoard.name} (${selectedBoard.id})`
      );
      const postsCollectionRef = collection(
        db,
        "classes",
        classCode,
        "learningBoards",
        selectedBoard.id,
        "posts"
      );
      const q = query(postsCollectionRef, orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      console.log(
        `[LearningBoard Debug] Posts fetched for board ${selectedBoard.id}. Docs count:`,
        snapshot.docs.length
      );
      const loadedPosts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        adminCouponGiven:
          typeof doc.data().adminCouponGiven === "boolean"
            ? doc.data().adminCouponGiven
            : false,
        coupons: Number(doc.data().coupons) || 0,
        likes: Number(doc.data().likes) || 0,
        dislikes: Number(doc.data().dislikes) || 0,
        likedBy: Array.isArray(doc.data().likedBy) ? doc.data().likedBy : [],
        dislikedBy: Array.isArray(doc.data().dislikedBy)
          ? doc.data().dislikedBy
          : [],
        timestamp: doc.data().timestamp?.toDate
          ? doc.data().timestamp.toDate().toISOString()
          : new Date().toISOString(),
      }));
      return loadedPosts;
    },
    {
      interval: 30000,
      enabled: !!selectedBoard && !!classCode,
      deps: [selectedBoard?.id, classCode],
    }
  );

  // 전체 화면 모드 관리 useEffect 수정 - 관리자 패널 자동 열림 방지
  useEffect(() => {
    const currentUserIsAdmin =
      isAdmin && typeof isAdmin === "function"
        ? isAdmin()
        : currentUser?.isAdmin || false;

    const writingActive =
      isWriting &&
      selectedBoard &&
      (!selectedBoard.isHidden || (currentUserIsAdmin && showHiddenBoardsView));

    const viewingBoardActive =
      !isWriting &&
      selectedBoard &&
      (!selectedBoard.isHidden || (currentUserIsAdmin && showHiddenBoardsView));

    const hiddenBoardManagementActive =
      showHiddenBoardsView && currentUserIsAdmin;

    // 관리자 패널 상태는 수동으로만 변경되도록 수정
    if (
      writingActive ||
      viewingBoardActive ||
      hiddenBoardManagementActive
    ) {
      setIsFullScreenMode(true);
    } else if (
      !isWriting &&
      !selectedBoard &&
      !showHiddenBoardsView &&
      !showAdminPanel &&
      !showBoardSelection
    ) {
      setIsFullScreenMode(false);
    } else if (showBoardSelection) {
      setIsFullScreenMode(false);
    }
  }, [
    isWriting,
    selectedBoard,
    showHiddenBoardsView,
    isAdmin,
    currentUser,
    showAdminPanel,
    showBoardSelection,
  ]);

  if (authLoading) {
    return (
      <div className="info-message">학습 게시판 사용자 정보 로딩 중...</div>
    );
  }
  if (!currentUser) {
    return (
      <div className="info-message">
        게시판을 이용하려면 로그인이 필요합니다.
      </div>
    );
  }

  const currentUserIsAdmin =
    isAdmin && typeof isAdmin === "function"
      ? isAdmin()
      : currentUser?.isAdmin || false;

  if (!classCode && !currentUserIsAdmin) {
    return (
      <div className="info-message">
        게시판을 이용하려면 학급 코드가 설정되어야 합니다.
      </div>
    );
  }

  if (classCode && boardsLoading) {
    return (
      <div className="info-message">
        게시판 목록 로딩 중... (학급: {classCode})
      </div>
    );
  }

  if (selectedBoard && postsLoading) {
    return (
      <div className="info-message">
        '{selectedBoard.name}' 게시글 로딩 중... (학급: {classCode})
      </div>
    );
  }

  if (currentUserIsAdmin && !classCode) {
    return (
      <div className="info-message">
        관리자님, 현재 학급 코드가 설정되지 않아 게시판 내용을 볼 수 없습니다.
        프로필에서 학급 코드를 설정해주세요.
      </div>
    );
  }

  const handleBoardSelect = (boardId, fromHiddenView = false) => {
    const board = boards.find((b) => b.id === boardId);
    const adminAccess =
      currentUserIsAdmin && typeof currentUserIsAdmin === "boolean"
        ? currentUserIsAdmin
        : false;
    if (board && (fromHiddenView || !board.isHidden || adminAccess)) {
      setSelectedBoard(board);
      setShowBoardSelection(false);
      if (!fromHiddenView) {
        setShowHiddenBoardsView(false);
      }
    } else if (board && board.isHidden && !adminAccess && !fromHiddenView) {
      alert("이 게시판은 현재 접근할 수 없습니다.");
      setSelectedBoard(null);
    } else {
      setSelectedBoard(null);
    }
  };

  const handleWriteClick = () => {
    if (!classCode && !currentUserIsAdmin) {
      alert("글을 작성할 학급이 설정되지 않았습니다.");
      return;
    }
    setIsWriting(true);
    setShowBoardSelection(true);
    setSelectedBoard(null);
    setShowHiddenBoardsView(false);
  };

  const handleViewClick = () => {
    if (!classCode && !currentUserIsAdmin) {
      alert("글을 조회할 학급이 설정되지 않았습니다.");
      return;
    }
    setIsWriting(false);
    setShowBoardSelection(true);
    setSelectedBoard(null);
    setShowHiddenBoardsView(false);
  };

  // 관리자 패널 토글 함수 수정 - 명시적 제어
  const toggleAdminPanel = () => {
    if (!currentUserIsAdmin) return;
    setShowAdminPanel((prev) => {
      console.log("[Debug] Admin panel toggle:", !prev);
      return !prev;
    });
  };

  const toggleHiddenBoardView = () => {
    if (!currentUserIsAdmin) return;
    const nextShowHiddenBoardsView = !showHiddenBoardsView;
    setShowHiddenBoardsView(nextShowHiddenBoardsView);
    if (nextShowHiddenBoardsView) {
      setShowBoardSelection(false);
      setSelectedBoard(null);
      setIsWriting(false);
    }
  };

  const handlePostSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBoard || !classCode || !currentUserId) {
      alert("글을 작성할 게시판을 선택하거나 로그인 정보를 확인해주세요.");
      return;
    }
    if (selectedBoard.isHidden && !currentUserIsAdmin) {
      alert("숨겨진 게시판에는 글을 작성할 수 없습니다.");
      return;
    }
    if (!newPost.title.trim() || !newPost.content.trim()) {
      alert("제목과 내용을 모두 입력해주세요.");
      return;
    }

    const postData = {
      title: newPost.title,
      content: newPost.content,
      author: currentUser?.name || currentUser?.nickname || "익명",
      authorId: currentUserId,
      likes: 0,
      dislikes: 0,
      likedBy: [],
      dislikedBy: [],
      coupons: 0,
      timestamp: serverTimestamp(),
      adminCouponGiven: false,
      classCode: classCode,
    };

    try {
      const postsCollectionRef = collection(
        db,
        "classes",
        classCode,
        "learningBoards",
        selectedBoard.id,
        "posts"
      );
      await addDoc(postsCollectionRef, postData);
      refetchPosts();
      setNewPost({ title: "", content: "" });
      alert("게시글이 성공적으로 등록되었습니다!");
      // 게시글 작성 후에도 현재 상태 유지 (글쓰기 모드와 선택된 게시판 유지)
    } catch (error) {
      console.error("Error submitting post:", error);
      alert(`게시글 제출 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  const updatePostInteraction = async (
    boardId,
    postId,
    updateType,
    interactionValue = null
  ) => {
    if (!classCode || !currentUserId) return;
    const postRef = doc(
      db,
      "classes",
      classCode,
      "learningBoards",
      boardId,
      "posts",
      postId
    );

    try {
      await runTransaction(db, async (transaction) => {
        const postDoc = await transaction.get(postRef);
        if (!postDoc.exists()) throw "게시글을 찾을 수 없습니다.";

        const postData = postDoc.data();
        let updates = {};
        let couponChangeForAuthor = 0;
        let giveCouponToAuthor = false;

        if (updateType === "like") {
          if (postData.likedBy?.includes(currentUserId)) return;
          updates.likedBy = arrayUnion(currentUserId);
          updates.likes = increment(1);
          if (postData.dislikedBy?.includes(currentUserId)) {
            updates.dislikedBy = arrayRemove(currentUserId);
            updates.dislikes = increment(-1);
          }
          const oldEffectiveLikes =
            (postData.likes || 0) -
            (postData.dislikedBy?.includes(currentUserId)
              ? (postData.dislikes || 0) - 1
              : postData.dislikes || 0);
          const newEffectiveLikes =
            (postData.likes || 0) +
            1 -
            (postData.dislikedBy?.includes(currentUserId)
              ? (postData.dislikes || 0) - 1
              : postData.dislikes || 0);
          const prevThreshold = Math.max(0, Math.floor(oldEffectiveLikes / 3));
          const currThreshold = Math.max(0, Math.floor(newEffectiveLikes / 3));
          if (currThreshold > prevThreshold) {
            couponChangeForAuthor = currThreshold - prevThreshold;
            updates.coupons = increment(couponChangeForAuthor);
            giveCouponToAuthor = true;
          }
        } else if (updateType === "dislike") {
          if (postData.dislikedBy?.includes(currentUserId)) return;
          updates.dislikedBy = arrayUnion(currentUserId);
          updates.dislikes = increment(1);
          if (postData.likedBy?.includes(currentUserId)) {
            updates.likedBy = arrayRemove(currentUserId);
            updates.likes = increment(-1);
          }
          const oldEffectiveLikes =
            (postData.likedBy?.includes(currentUserId)
              ? (postData.likes || 0) - 1
              : postData.likes || 0) - (postData.dislikes || 0);
          const newEffectiveLikes =
            (postData.likedBy?.includes(currentUserId)
              ? (postData.likes || 0) - 1
              : postData.likes || 0) -
            ((postData.dislikes || 0) + 1);
          const prevThreshold = Math.max(0, Math.floor(oldEffectiveLikes / 3));
          const currThreshold = Math.max(0, Math.floor(newEffectiveLikes / 3));

          if (currThreshold < prevThreshold) {
            couponChangeForAuthor = -(prevThreshold - currThreshold);
            updates.coupons = increment(couponChangeForAuthor);
            giveCouponToAuthor = true;
          }
        } else if (
          updateType === "adminCoupon" &&
          currentUserIsAdmin &&
          typeof interactionValue === "number" &&
          interactionValue > 0
        ) {
          if (postData.adminCouponGiven) {
            alert("이 게시글에는 이미 관리자 쿠폰이 지급되었습니다.");
            return;
          }
          updates.coupons = increment(interactionValue);
          updates.adminCouponGiven = true;
          couponChangeForAuthor = interactionValue;
          giveCouponToAuthor = true;
        } else {
          return;
        }

        updates.updatedAt = serverTimestamp();
        transaction.update(postRef, updates);

        if (
          giveCouponToAuthor &&
          postData.authorId &&
          postData.authorId !== currentUserId &&
          addCouponsToUser &&
          couponChangeForAuthor !== 0 // 쿠폰 변경량이 0이 아닐 때만 호출
        ) {
          addCouponsToUser(postData.authorId, couponChangeForAuthor);
        }
      });
      refetchPosts();
      if (updateType === "adminCoupon" && currentUserIsAdmin) {
        alert(
          `게시글(ID: ${postId.slice(
            -6
          )})에 관리자 쿠폰 ${interactionValue}개가 지급 처리되었습니다.`
        );
        setCustomCouponAmount(0);
      }
    } catch (error) {
      console.error(`Error updating post ${updateType}:`, error);
      alert(`게시글 ${updateType} 처리 중 오류: ${error.message}`);
    }
  };

  const handleLike = (boardId, postId) =>
    updatePostInteraction(boardId, postId, "like");
  const handleDislike = (boardId, postId) =>
    updatePostInteraction(boardId, postId, "dislike");
  const handleGiveCoupons = (boardId, postId, amount) =>
    updatePostInteraction(boardId, postId, "adminCoupon", amount);

  const handleAddBoard = async (e) => {
    e.preventDefault();
    // boardsCollectionRef가 null일 수 있으므로 유효성 검사 추가
    if (!currentUserIsAdmin || !classCode || !boardsCollectionRef) {
      alert(
        "게시판을 추가할 수 있는 조건이 충족되지 않았습니다. (관리자, 학급코드, 게시판 참조 확인)"
      );
      return;
    }
    const trimmedName = newBoardName.trim();
    if (!trimmedName) return alert("게시판 이름을 입력해주세요.");
    if (boards.some((board) => board.name === trimmedName))
      return alert("이미 존재하는 게시판 이름입니다.");
    try {
      await addDoc(boardsCollectionRef, {
        // 이제 boardsCollectionRef는 올바르게 참조됩니다.
        name: trimmedName,
        isHidden: false,
        createdAt: serverTimestamp(),
        classCode: classCode,
      });
      refetchBoards();
      setNewBoardName("");
    } catch (error) {
      console.error("Error adding board:", error);
      alert("게시판 추가 오류.");
    }
  };

  const handleStartEditBoard = (board) => {
    setEditingBoardId(board.id);
    setEditingBoardName(board.name);
  };
  const handleCancelEditBoard = () => {
    setEditingBoardId(null);
    setEditingBoardName("");
  };
  const handleUpdateBoardNameInput = (e) => {
    setEditingBoardName(e.target.value);
  };

  const handleSaveEditBoard = async (e) => {
    e.preventDefault();
    if (!editingBoardId || !classCode || !currentUserIsAdmin) return;
    const trimmedName = editingBoardName.trim();
    if (!trimmedName) return alert("게시판 이름은 비워둘 수 없습니다.");
    if (
      boards.some(
        (board) => board.id !== editingBoardId && board.name === trimmedName
      )
    )
      return alert("이미 존재하는 이름입니다.");
    const boardRef = doc(
      db,
      "classes",
      classCode,
      "learningBoards",
      editingBoardId
    );
    try {
      await updateDoc(boardRef, {
        name: trimmedName,
        updatedAt: serverTimestamp(),
      });
      refetchBoards();
      handleCancelEditBoard();
    } catch (error) {
      console.error("Error updating board name:", error);
      alert("게시판 이름 수정 오류.");
    }
  };

  const handleHideBoard = async (boardId) => {
    if (!currentUserIsAdmin || !classCode) return;
    const boardRef = doc(db, "classes", classCode, "learningBoards", boardId);
    try {
      await updateDoc(boardRef, {
        isHidden: true,
        updatedAt: serverTimestamp(),
      });
      refetchBoards();
      if (selectedBoard && selectedBoard.id === boardId) setSelectedBoard(null);
    } catch (error) {
      console.error("Error hiding board:", error);
    }
  };

  const handleRestoreBoard = async (boardId) => {
    if (!currentUserIsAdmin || !classCode) return;
    const boardRef = doc(db, "classes", classCode, "learningBoards", boardId);
    try {
      await updateDoc(boardRef, {
        isHidden: false,
        updatedAt: serverTimestamp(),
      });
      refetchBoards();
    } catch (error) {
      console.error("Error restoring board:", error);
    }
  };

  const handleDeleteBoard = async (boardId) => {
    if (!currentUserIsAdmin || !classCode) return;
    const boardToDelete = boards.find((b) => b.id === boardId);
    if (
      window.confirm(
        `'${boardToDelete?.name}' 게시판과 모든 게시글을 영구 삭제하시겠습니까?`
      )
    ) {
      try {
        const boardRef = doc(
          db,
          "classes",
          classCode,
          "learningBoards",
          boardId
        );
        const postsRef = collection(boardRef, "posts");
        const postsSnapshot = await getDocs(postsRef);
        const batch = writeBatch(db);
        postsSnapshot.docs.forEach((postDoc) => batch.delete(postDoc.ref));
        batch.delete(boardRef);
        await batch.commit();
        refetchBoards();
        if (selectedBoard && selectedBoard.id === boardId)
          setSelectedBoard(null);
      } catch (error) {
        console.error("Error deleting board:", error);
        alert("게시판 삭제 오류.");
      }
    }
  };

  const boardsForGeneralSelection = boards.filter(
    (board) => !board.isHidden || currentUserIsAdmin
  );
  const allBoardsForHiddenViewSelection = boards;

  // 컨테이너 클래스 설정 수정
  const containerClasses = `learning-board-container ${
    isFullScreenMode ? "full-width-mode" : ""
  } ${showAdminPanel && currentUserIsAdmin ? "admin-panel-active" : ""}`;

  return (
    <div className={containerClasses}>
      <div className="main-board">
        {currentUserIsAdmin && (
          <button className="admin-panel-toggle-btn" onClick={toggleAdminPanel}>
            {showAdminPanel ? "관리자 닫기" : "관리자 열기"}
          </button>
        )}

        <h1>학습 게시판 {classCode && `(학급: ${classCode})`}</h1>

        <div className="board-actions">
          <button
            className={`write-btn ${
              isWriting && showBoardSelection ? "active" : ""
            }`}
            onClick={handleWriteClick}
          >
            글쓰기
          </button>
          <button
            className={`view-btn ${
              !isWriting && showBoardSelection ? "active" : ""
            }`}
            onClick={handleViewClick}
          >
            글보기
          </button>
          {currentUserIsAdmin && (
            <button
              className={`hidden-boards-toggle-btn ${
                showHiddenBoardsView ? "active" : ""
              }`}
              onClick={toggleHiddenBoardView}
            >
              숨김 관리 ({boards.filter((b) => b.isHidden).length})
            </button>
          )}
        </div>

        <div className="board-content-area">
          {showBoardSelection && !showHiddenBoardsView && (
            <div className="board-selection">
              <h2>
                {isWriting ? "글 작성할 게시판 선택" : "조회할 게시판 선택"}
              </h2>
              <div className="board-buttons-container">
                {boardsForGeneralSelection.length > 0 ? (
                  boardsForGeneralSelection.map((board) => (
                    <div key={board.id} className="board-button-item">
                      <button
                        className={`board-btn ${
                          selectedBoard?.id === board.id ? "selected" : ""
                        }`}
                        onClick={() => handleBoardSelect(board.id, false)}
                        title={
                          board.isHidden ? `${board.name} (숨김)` : board.name
                        }
                      >
                        <span className="board-name">{board.name}</span>
                        {currentUserIsAdmin && board.isHidden && (
                          <span className="hidden-icon" title="숨겨진 게시판">
                            👁️
                          </span>
                        )}
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="info-message small">
                    {boardsLoading
                      ? "게시판 목록 로딩 중..."
                      : "표시할 게시판이 없습니다."}
                  </p>
                )}
              </div>
            </div>
          )}
          {showHiddenBoardsView && currentUserIsAdmin && (
            <div className="hidden-boards-list admin-section">
              <h2>숨김 게시판 관리 및 보기/쓰기</h2>
              {allBoardsForHiddenViewSelection.length === 0 && (
                <p className="info-message small">
                  {boardsLoading
                    ? "게시판 목록 로딩 중..."
                    : "생성된 게시판이 없습니다."}
                </p>
              )}
              <div className="board-buttons-container">
                {allBoardsForHiddenViewSelection.map((board) => (
                  <div
                    key={`hidden-view-${board.id}`}
                    className="board-button-item"
                  >
                    <button
                      className={`board-btn ${
                        selectedBoard?.id === board.id ? "selected" : ""
                      } ${board.isHidden ? "hidden-board-for-admin" : ""}`}
                      onClick={() => handleBoardSelect(board.id, true)}
                      title={
                        board.isHidden
                          ? `${board.name} (숨겨진 게시판)`
                          : board.name
                      }
                    >
                      {board.isHidden ? "🔒" : "📂"} {board.name}
                    </button>
                  </div>
                ))}
              </div>
              {selectedBoard && (
                <div
                  className="board-actions"
                  style={{ marginTop: "1rem", marginBottom: "1rem" }}
                >
                  <button
                    className="write-btn"
                    onClick={() => setIsWriting(true)}
                  >
                    '{selectedBoard.name}'에 글쓰기
                  </button>
                  <button
                    className="view-btn"
                    onClick={() => setIsWriting(false)}
                  >
                    '{selectedBoard.name}' 글보기
                  </button>
                </div>
              )}
              <h3>숨김/복구/삭제 처리:</h3>
              {boards.length === 0 ? (
                <p className="info-message small">관리할 게시판이 없습니다.</p>
              ) : (
                <ul>
                  {boards
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((board) => (
                      <li
                        key={`manage-${board.id}`}
                        className={`hidden-board-item ${
                          board.isHidden ? "item-is-hidden" : "item-is-visible"
                        }`}
                      >
                        <span>
                          {board.name} (
                          {board.isHidden ? "숨김 상태" : "공개 상태"})
                        </span>
                        <div className="hidden-board-actions">
                          {board.isHidden ? (
                            <button
                              className="restore-board-btn action-btn"
                              title={`${board.name} 복구`}
                              onClick={() => handleRestoreBoard(board.id)}
                            >
                              ✅ 공개로
                            </button>
                          ) : (
                            <button
                              className="hide-board-btn action-btn"
                              title={`${board.name} 숨기기`}
                              onClick={() => handleHideBoard(board.id)}
                            >
                              👁️‍🗨️ 숨기기
                            </button>
                          )}
                          <button
                            className="delete-board-btn action-btn"
                            title={`${board.name} 영구 삭제`}
                            onClick={() => handleDeleteBoard(board.id)}
                          >
                            ❌ 삭제
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
          {isWriting &&
            selectedBoard &&
            (!selectedBoard.isHidden ||
              (currentUserIsAdmin && showHiddenBoardsView)) && (
              <div className="post-form-container">
                <h2>
                  {selectedBoard.name}에 글쓰기{" "}
                  {selectedBoard.isHidden ? "(숨김 게시판)" : ""}
                </h2>
                <form onSubmit={handlePostSubmit} className="post-form">
                  <div className="form-group">
                    <label>제목</label>
                    <input
                      type="text"
                      value={newPost.title}
                      onChange={(e) =>
                        setNewPost({ ...newPost, title: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>내용</label>
                    <textarea
                      value={newPost.content}
                      onChange={(e) =>
                        setNewPost({ ...newPost, content: e.target.value })
                      }
                      required
                      rows="8"
                    />
                  </div>
                  <button type="submit" className="submit-btn">
                    게시하기
                  </button>
                </form>
              </div>
            )}
          {isWriting &&
            selectedBoard &&
            selectedBoard.isHidden &&
            !currentUserIsAdmin &&
            !showHiddenBoardsView && (
              <p className="info-message">
                선택한 게시판은 숨겨져 있어 글을 작성할 수 없습니다.
              </p>
            )}
          {isWriting && !selectedBoard && (
            <p className="info-message">
              글을 작성할 게시판을 선택해주세요. (상단 목록에서 선택)
            </p>
          )}
          {!isWriting &&
            selectedBoard &&
            (!selectedBoard.isHidden ||
              (currentUserIsAdmin && showHiddenBoardsView)) && (
              <div className="posts-container">
                <h2>
                  {selectedBoard.name} 글 목록{" "}
                  {selectedBoard.isHidden ? "(숨김 게시판 - 관리자 뷰)" : ""}
                </h2>
                {postsLoading ? (
                  <p className="info-message small">게시글 로딩 중...</p>
                ) : (selectedBoardPosts?.length || 0) === 0 ? (
                  <p className="no-posts">아직 작성된 글이 없습니다.</p>
                ) : (
                  <div className="posts-list">
                    {selectedBoardPosts.map((post) => (
                      <div key={post.id} className="post-card">
                        <h3>{post.title}</h3>
                        <div className="post-meta">
                          <span>작성자: {post.author || "알 수 없음"}</span>
                          <span>작성일: {formatDate(post.timestamp)}</span>
                        </div>
                        <p className="post-content">{post.content}</p>
                        <div className="post-stats">
                          <div className="likes-container">
                            <button
                              className={`like-btn ${
                                post.likedBy?.includes(currentUserId)
                                  ? "active"
                                  : ""
                              } ${
                                post.authorId === currentUserId
                                  ? "disabled"
                                  : ""
                              }`}
                              onClick={() =>
                                handleLike(selectedBoard.id, post.id)
                              }
                              disabled={
                                post.likedBy?.includes(currentUserId) ||
                                post.dislikedBy?.includes(currentUserId) ||
                                post.authorId === currentUserId
                              }
                            >
                              👍 좋아요 {post.likes || 0}
                            </button>
                            <button
                              className={`dislike-btn ${
                                post.dislikedBy?.includes(currentUserId)
                                  ? "active"
                                  : ""
                              } ${
                                post.authorId === currentUserId
                                  ? "disabled"
                                  : ""
                              }`}
                              onClick={() =>
                                handleDislike(selectedBoard.id, post.id)
                              }
                              disabled={
                                post.likedBy?.includes(currentUserId) ||
                                post.dislikedBy?.includes(currentUserId) ||
                                post.authorId === currentUserId
                              }
                            >
                              👎 싫어요 {post.dislikes || 0}
                            </button>
                          </div>
                          <div className="coupon-info">
                            <span>획득 쿠폰: {post.coupons || 0}개</span>
                            <span>
                              실효 좋아요:{" "}
                              {(post.likes || 0) - (post.dislikes || 0)}
                            </span>
                            {post.adminCouponGiven && !currentUserIsAdmin && (
                              <span
                                className="admin-verified-badge"
                                title="관리자가 확인하고 쿠폰을 지급한 글입니다."
                              >
                                ✨ 관리자 확인 완료
                              </span>
                            )}
                          </div>
                          {currentUserIsAdmin && (
                            <div className="admin-coupon-controls">
                              <h4>
                                관리자 쿠폰 지급 (글 ID: {post.id.slice(-4)})
                              </h4>
                              {post.adminCouponGiven ? (
                                <p className="coupon-given-message">
                                  ✅ 이 글에는 관리자 쿠폰이 이미
                                  지급되었습니다.
                                </p>
                              ) : (
                                <>
                                  <div className="coupon-buttons">
                                    {[1, 3, 5].map((amount) => (
                                      <button
                                        key={amount}
                                        onClick={() =>
                                          handleGiveCoupons(
                                            selectedBoard.id,
                                            post.id,
                                            amount
                                          )
                                        }
                                      >
                                        +{amount} 쿠폰
                                      </button>
                                    ))}
                                  </div>
                                  <div className="custom-coupon">
                                    <input
                                      type="number"
                                      min="1"
                                      value={
                                        customCouponAmount === 0
                                          ? ""
                                          : customCouponAmount
                                      }
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setCustomCouponAmount(
                                          Number.isNaN(val) ? 0 : val
                                        );
                                      }}
                                      placeholder="직접 입력"
                                    />
                                    <button
                                      onClick={() =>
                                        handleGiveCoupons(
                                          selectedBoard.id,
                                          post.id,
                                          customCouponAmount
                                        )
                                      }
                                      disabled={customCouponAmount <= 0}
                                    >
                                      지급
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          {!isWriting &&
            selectedBoard &&
            selectedBoard.isHidden &&
            !currentUserIsAdmin &&
            !showHiddenBoardsView && (
              <p className="info-message">
                이 게시판은 현재 접근할 수 없습니다.
              </p>
            )}
          {!isWriting &&
            !selectedBoard &&
            !showHiddenBoardsView &&
            !showBoardSelection && (
              <p className="info-message">
                게시판 기능을 사용하려면 상단의 '글쓰기' 또는 '글보기' 버튼을
                클릭하여 게시판을 선택해주세요.
              </p>
            )}
        </div>
      </div>

      {currentUserIsAdmin && (
        <div
          className={`admin-panel ${showAdminPanel ? "visible" : ""}`}
          style={{
            // 더 강력한 숨김 처리
            right: showAdminPanel ? "0px" : "-100vw",
            transition: "right 0.4s ease-in-out",
            display: showAdminPanel ? "block" : "none",
            visibility: showAdminPanel ? "visible" : "hidden",
            opacity: showAdminPanel ? 1 : 0,
          }}
        >
          <button className="admin-panel-close-btn" onClick={toggleAdminPanel}>
            ×
          </button>
          <h2>관리자 기능</h2>
          <div className="admin-section board-management">
            <h3>게시판 관리 (생성/이름변경)</h3>
            <form onSubmit={handleAddBoard} className="add-board-form">
              <input
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="새 게시판 이름"
                required
              />
              <button type="submit" className="add-board-btn">
                추가
              </button>
            </form>
            <ul className="admin-board-list">
              {[...boards]
                .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                .map((board) => (
                  <li
                    key={board.id}
                    className={`admin-board-manage-item ${
                      board.isHidden ? "hidden" : ""
                    }`}
                  >
                    {editingBoardId === board.id ? (
                      <form
                        onSubmit={handleSaveEditBoard}
                        className="edit-board-form"
                      >
                        <input
                          type="text"
                          value={editingBoardName}
                          onChange={handleUpdateBoardNameInput}
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="save-board-btn action-btn"
                        >
                          💾
                        </button>
                        <button
                          type="button"
                          className="cancel-edit-btn action-btn"
                          onClick={handleCancelEditBoard}
                        >
                          ↩️
                        </button>
                      </form>
                    ) : (
                      <>
                        <span>
                          {board.name} {board.isHidden ? "(숨김)" : ""}
                        </span>
                        <div className="admin-board-item-actions">
                          <button
                            className="edit-board-btn action-btn"
                            title={`${board.name} 이름 수정`}
                            onClick={() => handleStartEditBoard(board)}
                          >
                            ✏️
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
            </ul>
          </div>
          <div className="admin-section admin-stats">
            <h3>통계</h3>
            <ul>
              <li>
                총 게시판 (공개): {boards.filter((b) => !b.isHidden).length}개
              </li>
              <li>
                총 게시판 (숨김): {boards.filter((b) => b.isHidden).length}개
              </li>
              <li>(선택된 게시판) 총 게시글: {selectedBoardPosts?.length || 0} 개</li>
              <li>
                (선택된 게시판) 총 획득 쿠폰:{" "}
                {(selectedBoardPosts || []).reduce(
                  (sum, post) => sum + (post.coupons || 0),
                  0
                )}{" "}
                개
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default LearningBoard;