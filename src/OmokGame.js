// src/OmokGame.js - 랭킹 포인트 시스템 수정 및 UI 개선 (재대결 기능 추가)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    getDoc,
    runTransaction,
    serverTimestamp,
    deleteDoc,
    query,
    where,
    getDocs,
    orderBy
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { usePolling } from './hooks/usePolling';
import './OmokGame.css';
import './GamePage.css';

// [랭크 시스템] 랭크 포인트(RP) 기준 정의
const RANKS = [
    { title: 'LEGEND', color: '#ff0066', minRP: 2000, icon: '👑' },
    { title: 'MASTER', color: '#ff4500', minRP: 1500, icon: '💎' },
    { title: 'DIAMOND', color: '#00bfff', minRP: 1300, icon: '💠' },
    { title: 'PLATINUM', color: '#4169e1', minRP: 1150, icon: '⭐' },
    { title: 'GOLD', color: '#ffd700', minRP: 1050, icon: '🏆' },
    { title: 'SILVER', color: '#c0c0c0', minRP: 950, icon: '🥈' },
    { title: 'BRONZE', color: '#cd7f32', minRP: 0, icon: '🥉' },
];

const RP_ON_WIN = 15;
const RP_ON_LOSS = 8;
const BASE_RP = 1000;

// [랭크 시스템] RP 기반으로 랭크 정보를 계산하는 헬퍼 함수
const getOmokRankDetails = (omokStats) => {
    const wins = omokStats?.wins || 0;
    const losses = omokStats?.losses || 0;
    const totalRP = omokStats?.totalRP;

    const currentRP = totalRP !== undefined ? totalRP : 
        Math.max(0, BASE_RP + (wins * RP_ON_WIN) - (losses * RP_ON_LOSS));

    const currentRank = RANKS.find(rank => currentRP >= rank.minRP);
    const currentRankIndex = RANKS.findIndex(rank => rank.title === currentRank.title);

    let nextRank = null;
    let pointsForNextRank = 0;

    if (currentRankIndex > 0) {
        nextRank = RANKS[currentRankIndex - 1];
        pointsForNextRank = nextRank.minRP - currentRP;
    }

    return {
        currentRank,
        nextRank,
        currentRP,
        pointsForNextRank,
        wins,
        losses,
    };
};

// [랭크 시스템] 사용자 오목 기록 업데이트 함수 (RP 포함)
const updateUserOmokRecord = async (userId, result) => {
    try {
        const userDocRef = doc(db, 'users', userId);
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userDocRef);
            if (!userDoc.exists()) {
                console.error(`사용자 ${userId}를 찾을 수 없습니다.`);
                return;
            }

            const userData = userDoc.data();
            const currentOmok = userData.omok || { wins: 0, losses: 0, totalRP: BASE_RP };
            
            let newWins = currentOmok.wins || 0;
            let newLosses = currentOmok.losses || 0;
            let newTotalRP = currentOmok.totalRP !== undefined ? currentOmok.totalRP : BASE_RP;

            if (result === 'win') {
                newWins += 1;
                newTotalRP += RP_ON_WIN;
            } else if (result === 'loss') {
                newLosses += 1;
                newTotalRP = Math.max(0, newTotalRP - RP_ON_LOSS);
            }

            const updatedOmok = {
                wins: newWins,
                losses: newLosses,
                totalRP: newTotalRP,
            };

            transaction.update(userDocRef, { omok: updatedOmok });
            console.log(`사용자 ${userId} 오목 기록 업데이트:`, updatedOmok);
        });
    } catch (error) {
        console.error('사용자 오목 기록 업데이트 중 오류:', error);
    }
};

// [UI 컴포넌트] 랭크 표시 컴포넌트
const RankDisplay = ({ rankDetails, showProgress = false, size = 'normal' }) => {
    if (!rankDetails) return null;
    
    const { currentRank, currentRP, nextRank, pointsForNextRank, wins, losses } = rankDetails;
    const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
    
    const sizeClass = size === 'small' ? 'rank-display-small' : 'rank-display';
    
    return (
        <div className={sizeClass}>
            <div className="rank-badge" style={{ backgroundColor: currentRank.color }}>
                <span className="rank-icon">{currentRank.icon}</span>
                <span className="rank-title">{currentRank.title}</span>
            </div>
            <div className="rp-info">
                <span className="rp-value">{currentRP} RP</span>
                {showProgress && (
                    <div className="rank-stats">
                        <span className="win-loss">{wins}승 {losses}패 ({winRate}%)</span>
                        {nextRank && (
                            <div className="next-rank-progress">
                                <span className="next-rank-text">
                                    {nextRank.icon} {nextRank.title}까지 {pointsForNextRank} RP
                                </span>
                                <div className="progress-bar">
                                    <div 
                                        className="progress-fill" 
                                        style={{ 
                                            width: `${Math.max(10, (currentRP - currentRank.minRP) / (nextRank.minRP - currentRank.minRP) * 100)}%`,
                                            backgroundColor: nextRank.color 
                                        }}
                                    ></div>
                                </div>
                            </div>
                        )}
                        {!nextRank && (
                            <div className="max-rank">🏆 최고 랭크!</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const OmokGame = () => {
    const { user, userDoc, addCouponsToUserById, isAdmin } = useAuth();
    const [gameId, setGameId] = useState(null);
    const [game, setGame] = useState(null);
    const [error, setError] = useState('');
    const [createdGameId, setCreatedGameId] = useState(null);
    const [timeLeft, setTimeLeft] = useState(30);
    const [isThinking, setIsThinking] = useState(false);
    const [lastMove, setLastMove] = useState(null);
    const [showWinAnimation, setShowWinAnimation] = useState(false);
    const [availableGames, setAvailableGames] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedCell, setSelectedCell] = useState(null);
    const [gameResult, setGameResult] = useState(null);
    const refetchGameDataRef = useRef(null);

    const TURN_TIME_LIMIT = 30;
    const BOARD_SIZE = 19;

    const gameIdRef = useRef(gameId);
    useEffect(() => { gameIdRef.current = gameId; }, [gameId]);
    const gameRef = useRef(game);
    useEffect(() => { gameRef.current = game; }, [game]);
    const userRef = useRef(user);
    useEffect(() => { userRef.current = user; }, [user]);

    useEffect(() => {
        const cleanup = () => {
            const currentGameId = gameIdRef.current;
            const currentGame = gameRef.current;
            const currentUser = userRef.current;
            if (
                currentGameId &&
                currentGame &&
                currentUser &&
                currentGame.gameStatus === 'waiting' &&
                currentGame.host === currentUser.uid
            ) {
                deleteDoc(doc(db, 'omokGames', currentGameId));
            }
        };
        window.addEventListener('beforeunload', cleanup);
        return () => {
            window.removeEventListener('beforeunload', cleanup);
        };
    }, []);

    const getIndex = (row, col) => row * BOARD_SIZE + col;
    const getBoardValue = (board, row, col) => {
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
            return undefined;
        }
        return board[getIndex(row, col)];
    };
    const createEmptyBoard = () => new Array(BOARD_SIZE * BOARD_SIZE).fill(null);

    const fetchAvailableGames = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const gamesRef = collection(db, 'omokGames');
            const q = query(
                gamesRef,
                where('gameStatus', '==', 'waiting'),
                orderBy('createdAt', 'desc')
            );

            const querySnapshot = await getDocs(q);
            const games = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAvailableGames(games);
        } catch (err) {
            console.error('게임 목록 불러오기 오류:', err);
            setError('게임 목록을 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    }, [user]);

    const deleteGameRoom = async (roomId, e) => {
        e.stopPropagation();
        if (!isAdmin()) {
            console.error('관리자 권한이 필요합니다.');
            return;
        }
        if (!window.confirm('이 게임방을 삭제하시겠습니까?')) return;
        try {
            await deleteDoc(doc(db, 'omokGames', roomId));
            console.log(`[관리자] 게임방 ${roomId} 삭제 완료`);
            fetchAvailableGames();
        } catch (err) {
            console.error('게임방 삭제 오류:', err);
            setError('게임방 삭제 중 오류가 발생했습니다.');
        }
    };

    const createGame = async () => {
        if (!user || !userDoc) {
            setError('사용자 정보가 로딩 중입니다. 잠시 후 다시 시도해주세요.');
            return;
        }
        setLoading(true);
        const myName = userDoc.name || userDoc.nickname || user.displayName || '익명';
        const myClass = userDoc.classCode || '미설정';
        const myRankDetails = getOmokRankDetails(userDoc.omok);

        try {
            const newGame = {
                board: createEmptyBoard(),
                players: { [user.uid]: 'black' },
                playerNames: { [user.uid]: myName },
                playerClasses: { [user.uid]: myClass },
                playerRanks: { [user.uid]: myRankDetails },
                currentPlayer: user.uid,
                winner: null,
                createdAt: serverTimestamp(),
                host: user.uid,
                hostName: myName,
                hostClass: myClass,
                hostRank: myRankDetails.currentRank,
                turnStartTime: serverTimestamp(),
                history: [],
                gameStatus: 'waiting',
                statsUpdated: false,
                rematch: {}, 
            };

            const gameDocRef = await addDoc(collection(db, 'omokGames'), newGame);
            setGameId(gameDocRef.id);
            setCreatedGameId(gameDocRef.id);
            setError('');
            if (refetchGameDataRef.current) refetchGameDataRef.current();
        } catch (err) {
            console.error('게임 생성 오류:', err);
            setError('게임 생성 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const joinGame = async (id) => {
        if (!user || !userDoc || !id) return;
        setLoading(true);
        setError('');
        const myName = userDoc.name || userDoc.nickname || user.displayName || '익명';
        const myClass = userDoc.classCode || '미설정';
        const myRankDetails = getOmokRankDetails(userDoc.omok);

        try {
            const gameDocRef = doc(db, 'omokGames', id);
            await runTransaction(db, async (transaction) => {
                const gameDoc = await transaction.get(gameDocRef);
                if (!gameDoc.exists()) throw new Error('존재하지 않는 게임입니다.');
                const gameData = gameDoc.data();
                if (Object.keys(gameData.players).length >= 2 && !gameData.players[user.uid]) throw new Error('이미 가득 찬 방입니다.');
                if (!gameData.players[user.uid]) {
                    transaction.update(gameDocRef, {
                        players: { ...gameData.players, [user.uid]: 'white' },
                        playerNames: { ...gameData.playerNames, [user.uid]: myName },
                        playerClasses: { ...gameData.playerClasses, [user.uid]: myClass },
                        playerRanks: { ...gameData.playerRanks, [user.uid]: myRankDetails },
                        gameStatus: 'playing',
                        turnStartTime: serverTimestamp()
                    });
                }
                setGameId(id);
            });
        } catch (err) {
            console.error('게임 참가 오류:', err);
            setError(err.message);
            fetchAvailableGames();
        } finally {
            setLoading(false);
        }
    };    
    
    const leaveGame = useCallback(async () => {
        if (!gameId || !game || !user) return;

        const gameDocRef = doc(db, 'omokGames', gameId);
        try {
            if (game.gameStatus === 'waiting' && game.host === user.uid) {
                await deleteDoc(gameDocRef);
            } else if (game.gameStatus === 'playing' && game.players[user.uid] && !game.winner) {
                const opponentId = Object.keys(game.players).find(p => p !== user.uid);
                if (opponentId) {
                    const gameStartTime = game.createdAt?.toDate().getTime();
                    const shouldAwardCoupon = gameStartTime && (Date.now() - gameStartTime > 15000);
                    
                    const finalUpdate = { winner: opponentId, gameStatus: 'finished', statsUpdated: true };
                    if (shouldAwardCoupon) finalUpdate.couponAwardedTo = opponentId;
                    await updateDoc(gameDocRef, finalUpdate);
                    
                    await updateUserOmokRecord(user.uid, 'loss');
                    await updateUserOmokRecord(opponentId, 'win');

                    if (shouldAwardCoupon && addCouponsToUserById) await addCouponsToUserById(opponentId, 1);
                }
            }
        } catch (error) {
            console.error("게임 나가기 처리 중 오류 발생:", error);
        } finally {
            setGameId(null); setGame(null); setError(''); setCreatedGameId(null);
            setShowWinAnimation(false); setSelectedCell(null); setGameResult(null);
            fetchAvailableGames();
        }
    }, [game, gameId, user, fetchAvailableGames, addCouponsToUserById]);

    const checkForbiddenMove = (board, row, col, player) => false;

    const placeStone = async (row, col) => {
        setIsThinking(false);
        const boardWithNewStone = [...game.board];
        boardWithNewStone[getIndex(row, col)] = game.players[user.uid];

        if (game.players[user.uid] === 'black') {
          const forbiddenMove = checkForbiddenMove(boardWithNewStone, row, col, 'black');
          if (forbiddenMove) {
              setError(`금수입니다: ${forbiddenMove}. 다른 곳에 두세요.`);
              setIsThinking(true); setSelectedCell(null); return;
          }
        }

        const winner = checkWinner(boardWithNewStone, row, col, game.players[user.uid]);
        const nextPlayer = Object.keys(game.players).find((p) => p !== user.uid);
        const moveData = { row, col, player: game.players[user.uid], timestamp: new Date() };
        const newHistory = [...(game.history || []), moveData];

        try {
            const gameDocRef = doc(db, 'omokGames', gameId);
            const updateData = {
                board: boardWithNewStone,
                currentPlayer: winner ? null : nextPlayer,
                winner: winner ? user.uid : null,
                history: newHistory,
                turnStartTime: serverTimestamp(),
                gameStatus: winner ? 'finished' : 'playing'
            };

            let shouldAwardCoupon = false;
            if (winner) {
                const gameStartTime = game.createdAt?.toDate().getTime();
                if (gameStartTime) shouldAwardCoupon = (Date.now() - gameStartTime > 15000);
                if (shouldAwardCoupon) updateData.couponAwardedTo = user.uid;
            }
            
            await updateDoc(gameDocRef, updateData);
            setLastMove({ row, col });
            setError('');

            if (winner) {
                setShowWinAnimation(true);
                if (shouldAwardCoupon && addCouponsToUserById) await addCouponsToUserById(user.uid, 1);
            }
        } catch (err) {
            console.error('움직임 처리 오류:', err);
            setError('움직임을 처리하는 중 오류가 발생했습니다.');
        } finally {
          setSelectedCell(null);
        }
    };

    const handleCellClick = async (row, col) => {
        if (!game || game.winner || getBoardValue(game.board, row, col) ||
            game.currentPlayer !== user.uid ||
            Object.keys(game.players).length < 2 || !isThinking) return;

        if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
            await placeStone(row, col);
            setSelectedCell(null);
        } else {
            setSelectedCell({ row, col });
        }
    };

    const checkWinner = (board, row, col, player) => {
        const directions = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: -1 }];
        for (const dir of directions) {
            let count = 1;
            for (let i = 1; i < 5; i++) {
                if (getBoardValue(board, row + i * dir.y, col + i * dir.x) !== player) break;
                count++;
            }
            for (let i = 1; i < 5; i++) {
                if (getBoardValue(board, row - i * dir.y, col - i * dir.x) !== player) break;
                count++;
            }
            if (count === 5) return player;
        }
        return null;
    };

    const handleTimeOut = useCallback(async () => {
        if (!game || game.winner || game.currentPlayer !== user.uid) return;
        const nextPlayer = Object.keys(game.players).find((p) => p !== user.uid);
        try {
            const gameDocRef = doc(db, 'omokGames', gameId);
            await updateDoc(gameDocRef, { currentPlayer: nextPlayer, turnStartTime: serverTimestamp() });
            setError('시간 초과! 차례가 넘어갑니다.');
        } catch (err) {
            console.error('시간 초과 처리 오류:', err);
        } finally {
            setIsThinking(false); setSelectedCell(null);
        }
    }, [game, user, gameId]);

    useEffect(() => { if (user) fetchAvailableGames(); }, [user, fetchAvailableGames]);

    const fetchGameData = useCallback(async () => {
        if (!gameId) return;

        try {
            const gameDocRef = doc(db, 'omokGames', gameId);
            const docSnap = await getDoc(gameDocRef);

            if (docSnap.exists()) {
                const gameData = docSnap.data();
                setGame(gameData);

                if (gameData.winner && !gameData.statsUpdated) {
                    const winnerId = gameData.winner;
                    const loserId = Object.keys(gameData.players).find(p => p !== winnerId);

                    if (loserId) {
                        await updateUserOmokRecord(winnerId, 'win');
                        await updateUserOmokRecord(loserId, 'loss');
                        await updateDoc(gameDocRef, { statsUpdated: true });

                        if (user.uid === winnerId) setGameResult({ outcome: 'win', rpChange: RP_ON_WIN });
                        else if (user.uid === loserId) setGameResult({ outcome: 'loss', rpChange: -RP_ON_LOSS });
                    }
                }

                const history = gameData.history || [];
                if (history.length > 0) setLastMove({ row: history[history.length - 1].row, col: history[history.length - 1].col });
                
                if (gameData.currentPlayer === user.uid && gameData.gameStatus === 'playing') {
                    setIsThinking(true);
                    if (gameData.turnStartTime) {
                        const serverTimeOffset = (serverTimestamp().seconds - Math.floor(Date.now() / 1000)) * 1000;
                        const startTime = gameData.turnStartTime.toDate().getTime() - serverTimeOffset;
                        const elapsed = Date.now() - startTime;
                        const newTimeLeft = Math.max(0, TURN_TIME_LIMIT - Math.floor(elapsed / 1000));
                        setTimeLeft(newTimeLeft);
                    } else {
                        setTimeLeft(TURN_TIME_LIMIT);
                    }
                } else {
                    setIsThinking(false); setSelectedCell(null);
                }
            } else {
                setGameId(null); setGame(null); setError('게임이 종료되었거나 찾을 수 없습니다.');
            }
        } catch (error) {
            console.error('게임 데이터 로드 오류:', error);
            setError('게임 연결 중 오류가 발생했습니다.');
        }
    }, [gameId, user]);

    const { refetch: refetchGameData } = usePolling(fetchGameData, 30000, !!gameId);
    useEffect(() => { refetchGameDataRef.current = refetchGameData; }, [refetchGameData]);

    useEffect(() => {
        if (!isThinking || !game || game.winner) return;
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) { clearInterval(timer); handleTimeOut(); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [isThinking, handleTimeOut, game]);

    useEffect(() => { if (showWinAnimation) { const timer = setTimeout(() => setShowWinAnimation(false), 3000); return () => clearTimeout(timer); } }, [showWinAnimation]);

    const handleRematchRequest = async () => {
        if (!gameId || !user) return;
        try {
            await updateDoc(doc(db, 'omokGames', gameId), { [`rematch.${user.uid}`]: true });
        } catch (err) {
            console.error("재대결 요청 오류:", err);
            setError("재대결을 요청하는 중 오류가 발생했습니다.");
        }
    };

    const resetGameForRematch = useCallback(async () => {
        if (!game || !game.winner || !gameId) return;

        const playerIds = Object.keys(game.players);
        if (playerIds.length < 2) return;

        const winnerId = game.winner, loserId = playerIds.find(p => p !== winnerId);
        if (!loserId) { console.error("재대결을 위한 패자를 결정할 수 없습니다."); return; }

        const newPlayers = { [loserId]: 'black', [winnerId]: 'white' };
        const newCurrentPlayer = loserId;

        try {
            await updateDoc(doc(db, 'omokGames', gameId), {
                board: createEmptyBoard(),
                currentPlayer: newCurrentPlayer,
                players: newPlayers,
                winner: null, history: [], gameStatus: 'playing', statsUpdated: false,
                turnStartTime: serverTimestamp(), couponAwardedTo: null, rematch: {}
            });
            
            setGameResult(null); setShowWinAnimation(false); setLastMove(null); setSelectedCell(null); setError('');
        } catch (error) {
            console.error("재대결 리셋 오류:", error);
            setError("재대결 시작에 실패했습니다.");
        }
    }, [game, gameId]);

    useEffect(() => {
        if (game && game.gameStatus === 'finished' && game.rematch && user?.uid === game.host) {
            const playerIds = Object.keys(game.players);
            if (playerIds.length === 2 && game.rematch[playerIds[0]] && game.rematch[playerIds[1]]) {
                resetGameForRematch();
            }
        }
    }, [game, user, resetGameForRematch]);

    const renderBoard = () => {
        const isMyTurn = game.currentPlayer === user.uid;
        const cells = [];
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                const cellValue = getBoardValue(game.board, i, j);
                const isSelected = selectedCell && selectedCell.row === i && selectedCell.col === j;
                cells.push(
                    <div
                        key={`${i}-${j}`}
                        className={`omok-cell ${isThinking && isMyTurn ? 'clickable' : ''} ${lastMove && lastMove.row === i && lastMove.col === j ? 'last-move' : ''} ${isSelected ? 'preview' : ''}`}
                        onClick={() => handleCellClick(i, j)}
                    >
                        {cellValue && <div className={`omok-stone ${cellValue}`}></div>}
                        <div className="board-lines">
                            {(i < 18) && <div className="line vertical"></div>}
                            {(j < 18) && <div className="line horizontal"></div>}
                        </div>
                        {((i === 3 && (j === 3 || j === 9 || j === 15)) || (i === 9 && (j === 3 || j === 9 || j === 15)) || (i === 15 && (j === 3 || j === 9 || j === 15))) && <div className="star-point"></div>}
                    </div>
                );
            }
        }
        return cells;
    };

    if (!gameId || !game) {
        const myRankDetails = getOmokRankDetails(userDoc?.omok);
        return (
            <div className="game-page-container">
                <div className="omok-header">
                    <h2>🌍 글로벌 오목 게임</h2>
                    <p>전 세계 모든 플레이어와 함께 두뇌 대결을 펼치고 쿠폰을 획득하세요!</p>
                    <div className="my-profile">
                        <RankDisplay rankDetails={myRankDetails} showProgress={true} />
                        <div className="player-info">
                            <strong>{userDoc?.name || userDoc?.nickname || '익명'}</strong>
                            {userDoc?.classCode && ` (${userDoc.classCode})`}
                            {isAdmin() && <span className="admin-badge">[관리자]</span>}
                        </div>
                    </div>
                </div>

                <div className="omok-lobby">
                    <div className="lobby-section">
                        <h3>게임 참여하기</h3>
                        <div className="lobby-actions">
                            <button onClick={createGame} className="omok-button primary" disabled={loading}>
                                {loading ? '생성 중...' : '새 게임 만들기'}
                            </button>
                            {createdGameId && !error && (
                                <div className="omok-success">
                                    게임방이 생성되었습니다! <strong>게임 ID: {createdGameId.slice(-6)}</strong><br />
                                    다른 플레이어가 참가하기를 기다리고 있습니다.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="lobby-section">
                        <div className="section-header">
                            <h3>🌍 전체 공개방({availableGames.length})</h3>
                            <button onClick={fetchAvailableGames} className="omok-button small" disabled={loading}>
                                {loading ? '...' : '새로고침'}
                            </button>
                        </div>
                        {availableGames.length > 0 ? (
                            <div className="game-rooms">
                                {availableGames.map((gameRoom) => {
                                    const hostRankDetails = getOmokRankDetails({ 
                                        wins: gameRoom.hostRank?.wins || 0, 
                                        losses: gameRoom.hostRank?.losses || 0,
                                        totalRP: gameRoom.hostRank?.currentRP || BASE_RP
                                    });
                                    return (
                                        <div key={gameRoom.id} className="game-room-card" onClick={() => joinGame(gameRoom.id)}>
                                            {isAdmin() && <button className="admin-delete-btn" onClick={(e) => deleteGameRoom(gameRoom.id, e)} title="게임방 삭제">✕</button>}
                                            <div className="room-header">
                                                <div className="room-host">
                                                    <RankDisplay rankDetails={hostRankDetails} size="small" />
                                                    <span className="host-name">{gameRoom.hostName}님의 방</span>
                                                    <span className="host-class">({gameRoom.hostClass || '미설정'})</span>
                                                </div>
                                                <div className="room-id">#{gameRoom.id.slice(-6)}</div>
                                            </div>
                                            <div className="room-info">
                                                <span className="player-count">👥{Object.keys(gameRoom.players).length}/2</span>
                                                <span className="room-status global-status">대기중</span>
                                            </div>
                                            <div className="room-time">
                                                {gameRoom.createdAt?.toDate ? gameRoom.createdAt.toDate().toLocaleTimeString('ko-KR') : '방금 전'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="no-games">
                                {loading ? '게임 목록을 불러오는 중...' : '현재 참가 가능한 게임이 없습니다. 새 게임을 만들어보세요!'}
                            </div>
                        )}
                    </div>
                    {error && <div className="omok-error">{error}</div>}
                </div>
            </div>
        );
    }

    const myColor = game.players[user.uid];
    const opponentId = Object.keys(game.players).find(p => p !== user.uid);
    const opponentColor = opponentId ? game.players[opponentId] : null;
    const opponentName = opponentId ? (game.playerNames?.[opponentId] || '상대') : '대기 중...';

    const myRankDetails = game.playerRanks?.[user.uid];
    const opponentRankDetails = opponentId ? game.playerRanks?.[opponentId] : null;

    const isMyTurn = game.currentPlayer === user.uid;

    const iRequestedRematch = game.rematch && game.rematch[user.uid];
    const opponentRequestedRematch = opponentId && game.rematch && game.rematch[opponentId];

    return (
        <div className="omok-container">
            {showWinAnimation && <div className="win-animation">승리!</div>}

            <div className="omok-header">
                <h2>🌍 글로벌 오목 게임</h2>
                <div className="game-info">
                    <span className="game-id">ID: {gameId.slice(-6)}</span>
                    <span className="game-rules">규칙: 렌주룰</span>
                    <span className="global-match">전세계 매칭</span>
                </div>
            </div>

            <div className="player-status">
                <div className={`player-card ${myColor} ${isMyTurn && !game.winner ? 'active' : ''}`}>
                    <div className="player-info">
                        <RankDisplay rankDetails={myRankDetails} size="small" />
                        <span className="player-name">{game.playerNames?.[user.uid] || '나'}</span>
                        <div className={`stone-indicator ${myColor}`}></div>
                    </div>
                    {isMyTurn && isThinking && !game.winner && (
                        <div className="timer">
                            <span className="time-left">{timeLeft}s</span>
                            <div className="timer-bar">
                                <div className="timer-fill" style={{ width: `${(timeLeft / TURN_TIME_LIMIT) * 100}%` }}></div>
                            </div>
                        </div>
                    )}
                </div>

                <div className={`player-card ${opponentColor || ''} ${!isMyTurn && !game.winner && opponentId ? 'active' : ''}`}>
                    <div className="player-info">
                        <RankDisplay rankDetails={opponentRankDetails} size="small" />
                        <span className="player-name">{opponentName}</span>
                        {opponentColor && <div className={`stone-indicator ${opponentColor}`}></div>}
                    </div>
                    {!isMyTurn && opponentId && !game.winner && <div className="opponent-thinking">생각 중...</div>}
                </div>
            </div>

            <div className="omok-board-container">
                <div className="omok-board">{renderBoard()}</div>
            </div>

            <div className="omok-status">
                {game.winner ? (
                    <div className="winner-announcement">
                        {game.playerNames?.[game.winner] || '승자'} 님의 승리!
                        {gameResult && <span className={`rp-change ${gameResult.outcome}`}>({gameResult.rpChange > 0 ? '+' : ''}{gameResult.rpChange} RP)</span>}
                        <br />
                        {game.winner === user.uid && game.couponAwardedTo === user.uid && '🎉 쿠폰 1개를 획득했습니다!'}
                        {game.winner === user.uid && game.couponAwardedTo !== user.uid && '(게임 시간이 15초 미만이라 쿠폰이 지급되지 않았습니다.)'}
                    </div>
                ) : (
                    <div className="turn-info">
                        현재 차례: {isMyTurn ? '당신' : (game.playerNames?.[game.currentPlayer] || '상대')}
                        {Object.keys(game.players).length < 2 && <div className="waiting-player">상대방을 기다리고 있습니다...</div>}
                    </div>
                )}
            </div>

            {error && <div className="omok-error">{error}</div>}

            <div className="game-controls">
                {game.gameStatus === 'finished' ? (
                    <>
                        {!iRequestedRematch && <button onClick={handleRematchRequest} className="omok-button primary">다시 하기</button>}
                        <button onClick={leaveGame} className="omok-button secondary">로비로 돌아가기</button>
                    </> 
                ) : (
                    <button onClick={leaveGame} className="omok-button secondary">기권하고 나가기</button>
                )}
            </div>
            
            {game.gameStatus === 'finished' && (
                <div className="rematch-info" style={{ textAlign: 'center', marginTop: '1rem', color: 'white', fontWeight: 600 }}>
                    {iRequestedRematch && !opponentRequestedRematch && <p>재대결을 요청했습니다. 상대방을 기다립니다...</p>}
                    {opponentRequestedRematch && !iRequestedRematch && <p>상대방이 재대결을 원합니다!</p>}
                    {iRequestedRematch && opponentRequestedRematch && <p>양쪽 모두 재대결을 원합니다. 잠시 후 게임이 다시 시작됩니다!</p>}
                </div>
            )}
        </div>
    );
};

export default OmokGame;
