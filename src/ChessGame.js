// src/ChessGame.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { usePolling } from './hooks/usePolling';
import {
    db,
    doc,
    setDoc,
    getDoc,
    runTransaction,
    increment,
    serverTimestamp,
    collection,
    query,
    where,
    getDocs,
    deleteDoc,
    // ✨ updateUserChessResult import 구문을 여기서 제거했습니다.
} from './firebase';
import { logActivity, ACTIVITY_TYPES } from './utils/firestoreHelpers';
import './ChessGame.css';
import { AlchanLoading } from './components/AlchanLayout';

const PIECES = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟'
};

const RANKS = [
    { name: 'Unranked', minPoints: 0 },
    { name: 'C', minPoints: 800 },
    { name: 'B', minPoints: 1000 },
    { name: 'A', minPoints: 1200 },
    { name: 'S', minPoints: 1400 },
    { name: 'SS', minPoints: 1600 },
];

const RATING_CHANGE = { WIN: 15, LOSS: -10, MIN_RATING: 800 };

const getRankInfo = (points = 0) => {
    let currentRank = RANKS[0];
    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (points >= RANKS[i].minPoints) {
            currentRank = RANKS[i];
            break;
        }
    }
    const nextRankIndex = RANKS.findIndex(r => r.name === currentRank.name) + 1;
    const nextRank = nextRankIndex < RANKS.length ? RANKS[nextRankIndex] : null;
    const pointsForNextRank = nextRank ? nextRank.minPoints - points : 0;

    return {
        rank: currentRank.name,
        nextRank: nextRank?.name,
        pointsForNextRank: pointsForNextRank,
    };
};


const getInitialBoard = () => {
    return [
        ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
        ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
        ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR']
    ];
};

const serializeBoard = (board) => {
    const serialized = {};
    board.forEach((row, rIndex) => {
        row.forEach((cell, cIndex) => {
            if (cell) {
                serialized[`${rIndex}-${cIndex}`] = cell;
            }
        });
    });
    return serialized;
};

const deserializeBoard = (serializedBoard) => {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    for (const key in serializedBoard) {
        const [r, c] = key.split('-').map(Number);
        board[r][c] = serializedBoard[key];
    }
    return board;
};

// ===== AI 엔진 =====
const PIECE_VALUES = {
    'P': 100,
    'N': 320,
    'B': 330,
    'R': 500,
    'Q': 900,
    'K': 20000
};

// 위치 가중치 테이블 (폰의 중앙 진출 선호)
const PAWN_POSITION_BONUS = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0]
];

const KNIGHT_POSITION_BONUS = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50]
];

// 보드 평가 함수
const evaluateBoard = (board, color) => {
    let score = 0;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (!piece) continue;

            const pieceColor = piece[0];
            const pieceType = piece[1];
            const pieceValue = PIECE_VALUES[pieceType] || 0;

            let positionBonus = 0;
            if (pieceType === 'P') {
                const row = pieceColor === 'w' ? r : 7 - r;
                positionBonus = PAWN_POSITION_BONUS[row][c];
            } else if (pieceType === 'N') {
                positionBonus = KNIGHT_POSITION_BONUS[r][c];
            }

            const totalValue = pieceValue + positionBonus;

            if (pieceColor === color) {
                score += totalValue;
            } else {
                score -= totalValue;
            }
        }
    }

    return score;
};

// Minimax 알고리즘
const minimax = (board, depth, isMaximizing, alpha, beta, color, getValidMovesFunc) => {
    if (depth === 0) {
        return evaluateBoard(board, color);
    }

    const currentColor = isMaximizing ? color : (color === 'w' ? 'b' : 'w');

    // 모든 가능한 수 찾기
    const allMoves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece[0] === currentColor) {
                const moves = getValidMovesFunc(board, r, c, piece, true);
                moves.forEach(([toR, toC]) => {
                    allMoves.push({ from: [r, c], to: [toR, toC], piece });
                });
            }
        }
    }

    if (allMoves.length === 0) {
        return isMaximizing ? -999999 : 999999;
    }

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of allMoves) {
            const newBoard = board.map(row => [...row]);
            newBoard[move.to[0]][move.to[1]] = move.piece;
            newBoard[move.from[0]][move.from[1]] = null;

            const evaluation = minimax(newBoard, depth - 1, false, alpha, beta, color, getValidMovesFunc);
            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of allMoves) {
            const newBoard = board.map(row => [...row]);
            newBoard[move.to[0]][move.to[1]] = move.piece;
            newBoard[move.from[0]][move.from[1]] = null;

            const evaluation = minimax(newBoard, depth - 1, true, alpha, beta, color, getValidMovesFunc);
            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) break;
        }
        return minEval;
    }
};

// AI가 최적의 수 찾기
const findBestMove = (board, color, difficulty, getValidMovesFunc) => {
    const allMoves = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece[0] === color) {
                const moves = getValidMovesFunc(board, r, c, piece, true);
                moves.forEach(([toR, toC]) => {
                    allMoves.push({ from: [r, c], to: [toR, toC], piece });
                });
            }
        }
    }

    if (allMoves.length === 0) return null;

    // 초급: 랜덤 선택
    if (difficulty === 'beginner') {
        return allMoves[Math.floor(Math.random() * allMoves.length)];
    }

    // 중급: Depth 2
    // 고급: Depth 3
    const depth = difficulty === 'intermediate' ? 2 : 3;

    let bestMove = null;
    let bestValue = -Infinity;

    for (const move of allMoves) {
        const newBoard = board.map(row => [...row]);
        newBoard[move.to[0]][move.to[1]] = move.piece;
        newBoard[move.from[0]][move.from[1]] = null;

        const moveValue = minimax(newBoard, depth - 1, false, -Infinity, Infinity, color, getValidMovesFunc);

        if (moveValue > bestValue) {
            bestValue = moveValue;
            bestMove = move;
        }
    }

    return bestMove;
};


const ChessGame = () => {
    const { user, userDoc } = useAuth();
    const [gameId, setGameId] = useState(null);
    const [gameData, setGameData] = useState(null);
    const [showCreateRoom, setShowCreateRoom] = useState(true);
    const [newRoomId, setNewRoomId] = useState('');
    const [feedback, setFeedback] = useState({ message: '', type: '' });
    const [selectedPiece, setSelectedPiece] = useState(null);
    const [possibleMoves, setPossibleMoves] = useState([]);
    const [availableRooms, setAvailableRooms] = useState([]);
    const [timeControl, setTimeControl] = useState(600);
    const [whiteTime, setWhiteTime] = useState(600);
    const [blackTime, setBlackTime] = useState(600);
    const [showPromotion, setShowPromotion] = useState(null);
    const [moveHistory, setMoveHistory] = useState([]);
    const intervalRef = useRef(null);
    const refetchRef = useRef(null);
    const aiTimeoutRef = useRef(null);
    const lastAiMoveCountRef = useRef(0);

    // AI 모드 관련 state
    const [gameMode, setGameMode] = useState('player'); // 'player' or 'ai'
    const [aiDifficulty, setAiDifficulty] = useState('intermediate'); // 'beginner', 'intermediate', 'advanced'
    const [isAiThinking, setIsAiThinking] = useState(false);
    const [isMoving, setIsMoving] = useState(false);

    // 보상 관련 state
    const [showRewardSelection, setShowRewardSelection] = useState(false);
    const [rewardCards, setRewardCards] = useState([]);

    // 일일 플레이 횟수
    const [dailyPlayCount, setDailyPlayCount] = useState(0);

    const myColor = gameData && user && (
        gameData.aiMode
            ? gameData.playerColor
            : (gameData.players.white === user.uid ? 'w' : 'b')
    );
    const isMyTurn = gameData && gameData.turn === myColor;

    const { rank: userRank, nextRank, pointsForNextRank } = getRankInfo(userDoc?.chessRating);

    const gameIdRef = useRef(gameId);
    useEffect(() => { gameIdRef.current = gameId; }, [gameId]);
    const gameDataRef = useRef(gameData);
    useEffect(() => { gameDataRef.current = gameData; }, [gameData]);
    const userRef = useRef(user);
    useEffect(() => { userRef.current = user; }, [user]);
    
    useEffect(() => {
        const cleanup = () => {
            const currentGameId = gameIdRef.current;
            const currentGameData = gameDataRef.current;
            const currentUser = userRef.current;
            if (
                currentGameId &&
                currentGameData &&
                currentUser &&
                currentGameData.status === 'waiting' &&
                currentGameData.players.white === currentUser.uid
            ) {
                deleteDoc(doc(db, 'chessGames', currentGameId));
            }
        };

        window.addEventListener('beforeunload', cleanup);

        return () => {
            window.removeEventListener('beforeunload', cleanup);
        };
    }, []);

    const handleTimeout = useCallback(async (loserColor) => {
        if (!gameId) return;
        const gameRef = doc(db, 'chessGames', gameId);
        const winnerColor = loserColor === 'w' ? 'b' : 'w';

        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists() || gameDoc.data().status !== 'active') {
                return;
            }

            const winnerId = gameDoc.data().players[winnerColor === 'w' ? 'white' : 'black'];
            const loserId = gameDoc.data().players[loserColor === 'w' ? 'white' : 'black'];

            transaction.update(gameRef, {
                status: 'finished',
                winner: winnerColor,
                endReason: 'timeout',
                ratingChange: {
                    [winnerColor === 'w' ? 'white' : 'black']: RATING_CHANGE.WIN,
                    [loserColor === 'w' ? 'white' : 'black']: RATING_CHANGE.LOSS
                }
            });

            // ✨ updateUserChessResult 함수 호출을 여기서 제거했습니다.
        });
        if (refetchRef.current) await refetchRef.current();
    }, [gameId]);

    useEffect(() => {
        if (gameData && gameData.status === 'active' && isMyTurn) {
            intervalRef.current = setInterval(async () => {
                const gameDocRef = doc(db, 'chessGames', gameId);
                const currentTurn = gameData.turn;
                if (currentTurn === 'w') {
                    const newTime = Math.max(0, whiteTime - 1);
                    setWhiteTime(newTime);
                    if (newTime <= 0) {
                        await handleTimeout('w');
                    }
                } else {
                    const newTime = Math.max(0, blackTime - 1);
                    setBlackTime(newTime);
                     if (newTime <= 0) {
                        await handleTimeout('b');
                    }
                }
            }, 1000);
        }
        return () => clearInterval(intervalRef.current);
    }, [gameData, isMyTurn, whiteTime, blackTime, gameId, handleTimeout]);

    const fetchAvailableRooms = useCallback(async () => {
        if (!user) return;
        
        try {
            const q = query(
                collection(db, 'chessGames'),
                where('status', '==', 'waiting')
            );
            const querySnapshot = await getDocs(q);
            const rooms = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.players.white !== user.uid) {
                    rooms.push({
                        id: doc.id,
                        ...data
                    });
                }
            });
            setAvailableRooms(rooms);
        } catch (error) {
            console.error("Error fetching rooms:", error);
        }
    }, [user]);

    useEffect(() => {
        if (showCreateRoom && user) {
            fetchAvailableRooms();
            // 🔥 [최적화] 5초 → 60초로 변경 (읽기 비용 절감)
            const interval = setInterval(fetchAvailableRooms, 60000);
            return () => clearInterval(interval);
        }
    }, [showCreateRoom, user, fetchAvailableRooms]);

    const fetchGameData = useCallback(async () => {
        if (!gameId) return;

        const gameRef = doc(db, 'chessGames', gameId);
        const docSnap = await getDoc(gameRef);

        if (docSnap.exists()) {
            const rawData = docSnap.data();
            const deserializedData = {
                ...rawData,
                board: deserializeBoard(rawData.board),
            };
            setGameData(deserializedData);
            setShowCreateRoom(false);

            if (rawData.whiteTime !== undefined) setWhiteTime(rawData.whiteTime);
            if (rawData.blackTime !== undefined) setBlackTime(rawData.blackTime);
            if (rawData.moveHistory) setMoveHistory(rawData.moveHistory);

        } else {
            setFeedback({ message: '게임을 찾을 수 없습니다.', type: 'error' });
            setGameId(null);
            setGameData(null);
            setShowCreateRoom(true);
        }
    }, [gameId]);

    // 🔥 [최적화] 30초 → 60초로 변경 (읽기 비용 절감)
    const { refetch } = usePolling(fetchGameData, { interval: 60000, enabled: !!gameId });

    useEffect(() => {
        refetchRef.current = refetch;
    }, [refetch]);

    // 일일 플레이 횟수 로드
    useEffect(() => {
        const loadDailyPlayCount = () => {
            if (!user) return;

            const today = new Date().toDateString();
            const storageKey = `chessPlayCount_${user.uid}_${today}`;
            const count = parseInt(localStorage.getItem(storageKey) || '0', 10);
            setDailyPlayCount(count);
        };

        loadDailyPlayCount();
    }, [user]);

    useEffect(() => {
        if (feedback.message) {
            const timer = setTimeout(() => setFeedback({ message: '', type: '' }), 3000);
            return () => clearTimeout(timer);
        }
    }, [feedback.message]);

    const getValidMoves = useCallback((board, row, col, piece, checkForCheck = true) => {
        const moves = [];
        const color = piece[0];
        const type = piece[1];
        
        const addMove = (r, c) => {
            if (r >= 0 && r < 8 && c >= 0 && c < 8) {
                const target = board[r][c];
                if (!target || target[0] !== color) {
                    if (checkForCheck) {
                        const testBoard = board.map(row => [...row]);
                        testBoard[r][c] = piece;
                        testBoard[row][col] = null;
                        if (!isInCheck(testBoard, color)) {
                            moves.push([r, c]);
                        }
                    } else {
                        moves.push([r, c]);
                    }
                }
            }
        };

        switch (type) {
            case 'P':
                const direction = color === 'w' ? -1 : 1;
                const startRow = color === 'w' ? 6 : 1;
                
                if (row + direction >= 0 && row + direction < 8 && !board[row + direction][col]) {
                    addMove(row + direction, col);
                    if (row === startRow && !board[row + 2 * direction][col]) {
                        addMove(row + 2 * direction, col);
                    }
                }
                
                [-1, 1].forEach(dc => {
                    if (row + direction >=0 && row+direction < 8 && col + dc >=0 && col + dc < 8) {
                        const target = board[row + direction][col + dc];
                        if (target && target[0] !== color) {
                            addMove(row + direction, col + dc);
                        }
                    }
                });
                
                if (gameData?.enPassant) {
                    const [epRow, epCol] = gameData.enPassant;
                    if (row + direction === epRow && Math.abs(col - epCol) === 1) {
                         addMove(epRow, epCol);
                    }
                }
                break;

            case 'N':
                [[-2,-1], [-2,1], [-1,-2], [-1,2], [1,-2], [1,2], [2,-1], [2,1]].forEach(([dr, dc]) => {
                    addMove(row + dr, col + dc);
                });
                break;

            case 'B': case 'R': case 'Q':
                const directions = {
                    'B': [[1,1], [1,-1], [-1,1], [-1,-1]],
                    'R': [[0,1], [0,-1], [1,0], [-1,0]],
                    'Q': [[0,1], [0,-1], [1,0], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]]
                }[type];

                directions.forEach(([dr, dc]) => {
                    for (let i = 1; i < 8; i++) {
                        const r = row + dr * i;
                        const c = col + dc * i;
                        if (r >= 0 && r < 8 && c >= 0 && c < 8) {
                            if (!board[r][c]) {
                                addMove(r, c);
                            } else {
                                if (board[r][c][0] !== color) addMove(r, c);
                                break;
                            }
                        } else break;
                    }
                });
                break;

            case 'K':
                [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]].forEach(([dr, dc]) => {
                    addMove(row + dr, col + dc);
                });
                
                if (checkForCheck && gameData?.castling) {
                    const kingRow = color === 'w' ? 7 : 0;
                    if (row === kingRow && col === 4) {
                        if (gameData.castling[color + 'K'] && 
                            !board[kingRow][5] && !board[kingRow][6] &&
                            board[kingRow][7] === color + 'R') {
                            if (!isSquareUnderAttack(board, kingRow, 4, color) &&
                                !isSquareUnderAttack(board, kingRow, 5, color) &&
                                !isSquareUnderAttack(board, kingRow, 6, color)) {
                                addMove(kingRow, 6);
                            }
                        }
                        if (gameData.castling[color + 'Q'] && 
                            !board[kingRow][3] && !board[kingRow][2] && !board[kingRow][1] &&
                            board[kingRow][0] === color + 'R') {
                            if (!isSquareUnderAttack(board, kingRow, 4, color) &&
                                !isSquareUnderAttack(board, kingRow, 3, color) &&
                                !isSquareUnderAttack(board, kingRow, 2, color)) {
                                addMove(kingRow, 2);
                            }
                        }
                    }
                }
                break;
            default: break;
        }
        
        return moves;
    }, [gameData]);

    const isSquareUnderAttack = useCallback((board, row, col, color) => {
        const opponentColor = color === 'w' ? 'b' : 'w';
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece[0] === opponentColor) {
                    const moves = getValidMoves(board, r, c, piece, false);
                    if (moves.some(([mr, mc]) => mr === row && mc === col)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }, [getValidMoves]);
    
    const isInCheck = useCallback((board, color) => {
        let kingPos = null;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (board[r][c] === color + 'K') {
                    kingPos = [r, c];
                    break;
                }
            }
            if (kingPos) break;
        }
        
        if (!kingPos) return false;
        
        return isSquareUnderAttack(board, kingPos[0], kingPos[1], color);
    }, [isSquareUnderAttack]);

    const checkGameEnd = useCallback((board, color) => {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece[0] === color) {
                    const moves = getValidMoves(board, r, c, piece, true);
                    if (moves.length > 0) return null;
                }
            }
        }
        if (isInCheck(board, color)) {
            return 'checkmate';
        } else {
            return 'stalemate';
        }
    }, [getValidMoves, isInCheck]);

    // 보상 카드 생성
    const generateRewardCards = () => {
        const cashRewards = [
            { amount: 50000, weight: 5 },
            { amount: 30000, weight: 10 },
            { amount: 20000, weight: 15 },
            { amount: 10000, weight: 20 },
            { amount: 5000, weight: 18 },
            { amount: 3000, weight: 12 },
            { amount: 1000, weight: 10 },
            { amount: 500, weight: 7 },
            { amount: 100, weight: 3 }
        ];

        const couponRewards = [
            { amount: 20, weight: 10 },
            { amount: 10, weight: 20 },
            { amount: 5, weight: 20 },
            { amount: 3, weight: 20 },
            { amount: 1, weight: 30 }
        ];

        const weightedRandom = (items) => {
            const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
            let random = Math.random() * totalWeight;

            for (const item of items) {
                random -= item.weight;
                if (random <= 0) {
                    return item.amount;
                }
            }

            return items[items.length - 1].amount;
        };

        return [
            { type: 'cash', amount: weightedRandom(cashRewards) },
            { type: 'coupon', amount: weightedRandom(couponRewards) }
        ];
    };

    // 보상 선택 처리
    const handleRewardSelection = async (selectedCard) => {
        if (!user || !gameId) return;

        try {
            const userRef = doc(db, 'users', user.uid);
            const today = new Date().toDateString();
            const storageKey = `chessPlayCount_${user.uid}_${today}`;

            await runTransaction(db, async (transaction) => {
                const userDocSnap = await transaction.get(userRef);
                if (!userDocSnap.exists()) return;

                const updateData = {};

                if (selectedCard.type === 'cash') {
                    updateData.balance = increment(selectedCard.amount);
                } else if (selectedCard.type === 'coupon') {
                    updateData.couponBalance = increment(selectedCard.amount);
                }

                transaction.update(userRef, updateData);
            });

            // 일일 플레이 횟수 증가
            const newCount = dailyPlayCount + 1;
            localStorage.setItem(storageKey, newCount.toString());
            setDailyPlayCount(newCount);

            setShowRewardSelection(false);
            setFeedback({
                message: selectedCard.type === 'cash'
                    ? `현금 ${selectedCard.amount.toLocaleString()}원을 획득했습니다!`
                    : `쿠폰 ${selectedCard.amount}개를 획득했습니다!`,
                type: 'success'
            });

            // 🔥 활동 로그 기록 (AI 체스 승리 보상)
            logActivity(db, {
                classCode: userDoc?.classCode,
                userId: user.uid,
                userName: userDoc?.name || '사용자',
                type: ACTIVITY_TYPES.GAME_WIN,
                description: `체스 AI(${aiDifficulty}) 승리 - ${selectedCard.type === 'cash' ? `현금 ${selectedCard.amount.toLocaleString()}원` : `쿠폰 ${selectedCard.amount}개`} 획득`,
                amount: selectedCard.type === 'cash' ? selectedCard.amount : 0,
                couponAmount: selectedCard.type === 'coupon' ? selectedCard.amount : 0,
                metadata: {
                    gameType: 'chess',
                    opponent: 'AI',
                    difficulty: aiDifficulty,
                    rewardType: selectedCard.type,
                    rewardAmount: selectedCard.amount
                }
            });

            // 게임 나가기
            setTimeout(() => {
                handleLeaveGame();
            }, 2000);

        } catch (error) {
            console.error("Error applying reward:", error);
            setFeedback({ message: '보상 지급에 실패했습니다.', type: 'error' });
        }
    };


    const handleCreateRoom = async () => {
        if (!user) {
            setFeedback({ message: '로그인이 필요합니다.', type: 'error' });
            return;
        }

        // AI 모드일 때 일일 플레이 횟수 체크 (localStorage에서 직접 확인)
        if (gameMode === 'ai') {
            const today = new Date().toDateString();
            const storageKey = `chessPlayCount_${user.uid}_${today}`;
            const currentCount = parseInt(localStorage.getItem(storageKey) || '0', 10);

            if (currentCount >= 3) {
                setFeedback({ message: '오늘의 AI 대전 횟수를 모두 사용했습니다. (3/3)', type: 'error' });
                return;
            }
        }

        const newGameId = Math.random().toString(36).substring(2, 8);
        const gameRef = doc(db, 'chessGames', newGameId);

        const isAiMode = gameMode === 'ai';
        const playerColor = Math.random() > 0.5 ? 'w' : 'b'; // AI 모드에서 랜덤 색상
        const aiColor = playerColor === 'w' ? 'b' : 'w';

        const initialGameData = {
            board: serializeBoard(getInitialBoard()),
            players: isAiMode
                ? (playerColor === 'w'
                    ? { white: user.uid, black: 'AI' }
                    : { white: 'AI', black: user.uid })
                : { white: user.uid, black: null },
            playerNames: isAiMode
                ? (playerColor === 'w'
                    ? { white: userDoc.name, black: `AI (${aiDifficulty === 'beginner' ? '초급' : aiDifficulty === 'intermediate' ? '중급' : '고급'})` }
                    : { white: `AI (${aiDifficulty === 'beginner' ? '초급' : aiDifficulty === 'intermediate' ? '중급' : '고급'})`, black: userDoc.name })
                : { white: userDoc.name, black: null },
            playerRanks: isAiMode
                ? (playerColor === 'w'
                    ? { white: userRank, black: 'AI' }
                    : { white: 'AI', black: userRank })
                : { white: userRank, black: 'Unranked' },
            playerRatings: isAiMode
                ? (playerColor === 'w'
                    ? { white: userDoc.chessRating || 0, black: 0 }
                    : { white: 0, black: userDoc.chessRating || 0 })
                : { white: userDoc.chessRating || 0, black: null },
            turn: 'w',
            status: isAiMode ? 'active' : 'waiting',
            winner: null,
            timeControl: timeControl,
            whiteTime: timeControl,
            blackTime: timeControl,
            castling: { wK: true, wQ: true, bK: true, bQ: true },
            enPassant: null,
            moveHistory: [],
            createdAt: serverTimestamp(),
            ratingChange: null,
            aiMode: isAiMode,
            aiDifficulty: isAiMode ? aiDifficulty : null,
            aiColor: isAiMode ? aiColor : null,
            playerColor: isAiMode ? playerColor : null,
        };

        try {
            await setDoc(gameRef, initialGameData);
            setGameId(newGameId);
            setFeedback({ message: isAiMode ? `AI 대전 시작!` : `체스 방 생성 완료! 코드: ${newGameId}`, type: 'success' });
            if (refetchRef.current) await refetchRef.current();
        } catch (error) {
            console.error("Error creating room:", error);
            setFeedback({ message: '방 생성에 실패했습니다.', type: 'error' });
        }
    };

    const handleJoinRoom = async (roomId = null) => {
        const targetRoomId = roomId || newRoomId.trim();
        
        if (!targetRoomId) {
            setFeedback({ message: '참가할 방 코드를 입력하세요.', type: 'error' });
            return;
        }
        if (!user) {
            setFeedback({ message: '로그인이 필요합니다.', type: 'error' });
            return;
        }

        const gameRef = doc(db, 'chessGames', targetRoomId);

        try {
            await runTransaction(db, async (transaction) => {
                const gameDoc = await transaction.get(gameRef);
                if (!gameDoc.exists()) throw new Error("방을 찾을 수 없습니다.");

                const data = gameDoc.data();
                if (data.players.black) throw new Error("방이 가득 찼습니다.");
                if (data.players.white === user.uid) throw new Error("자신이 만든 방에는 참가할 수 없습니다.");

                transaction.update(gameRef, {
                    'players.black': user.uid,
                    'playerNames.black': userDoc.name,
                    'playerRanks.black': userRank,
                    'playerRatings.black': userDoc.chessRating || 0,
                    status: 'active',
                });
            });
            setGameId(targetRoomId);
            if (refetchRef.current) await refetchRef.current();
        } catch (error) {
            console.error("Error joining room: ", error);
            setFeedback({ message: `참가 실패: ${error.message}`, type: 'error' });
        }
    };
    
    const handleAdminDeleteRoom = async (roomId) => {
        if (!userDoc?.isAdmin) {
            setFeedback({ message: '삭제 권한이 없습니다.', type: 'error' });
            return;
        }
        try {
            await deleteDoc(doc(db, 'chessGames', roomId));
            setFeedback({ message: `방 ${roomId}가 삭제되었습니다.`, type: 'success' });
            fetchAvailableRooms();
        } catch (error) {
            console.error("Error deleting room by admin:", error);
            setFeedback({ message: '방 삭제에 실패했습니다.', type: 'error' });
        }
    };

    const handlePieceClick = (row, col) => {
        if (!isMyTurn || gameData.status !== 'active' || isMoving) return;
        
        const piece = gameData.board[row][col];
        
        if (selectedPiece && possibleMoves.some(([r, c]) => r === row && c === col)) {
            handleMove(row, col);
        } else if (piece && piece[0] === myColor) {
            setSelectedPiece({ row, col, piece });
            const moves = getValidMoves(gameData.board, row, col, piece);
            setPossibleMoves(moves);
        } else {
            setSelectedPiece(null);
            setPossibleMoves([]);
        }
    };

    const handleMove = async (toRow, toCol) => {
        if (!selectedPiece || !gameData) return;

        const { row: fromRow, col: fromCol, piece } = selectedPiece;
        
        if (piece[1] === 'P' && (toRow === 0 || toRow === 7)) {
            setShowPromotion({ toRow, toCol, fromRow, fromCol });
            return;
        }

        await executeMove(fromRow, fromCol, toRow, toCol, piece);
    };

    const handlePromotion = async (promoteTo) => {
        if (!showPromotion) return;
        const { fromRow, fromCol, toRow, toCol } = showPromotion;
        const piece = gameData.board[fromRow][fromCol];

        await executeMove(fromRow, fromCol, toRow, toCol, piece, promoteTo);
        setShowPromotion(null);
    };



    const handleLeaveGame = useCallback(async () => {
        if (gameData && gameData.status === 'waiting' && gameId && gameData.players.white === user.uid) {
            try {
                await deleteDoc(doc(db, 'chessGames', gameId));
            } catch (error) {
                console.error("Error deleting room:", error);
            }
        }

        setGameId(null);
        setGameData(null);
        setShowCreateRoom(true);
        setSelectedPiece(null);
        setPossibleMoves([]);
    }, [gameData, gameId, user]);

    const executeMove = useCallback(async (fromRow, fromCol, toRow, toCol, piece, promotionPiece = null) => {
        if (!gameId || isMoving) return;
        setIsMoving(true);
        const gameRef = doc(db, 'chessGames', gameId);

        try {
            const result = await runTransaction(db, async (transaction) => {
                const gameDoc = await transaction.get(gameRef);
                if (!gameDoc.exists()) {
                    throw new Error("게임을 찾을 수 없습니다.");
                }

                const currentData = gameDoc.data();
                if (currentData.status !== 'active') {
                    return { status: currentData.status, winner: currentData.winner, aiMode: currentData.aiMode, moveMade: false };
                }

                const color = piece[0];
                if (currentData.turn !== color) {
                    throw new Error("상대방의 턴입니다.");
                }
                
                const board = deserializeBoard(currentData.board);

                let newBoard = board.map(r => [...r]);
                newBoard[fromRow][fromCol] = null;
                newBoard[toRow][toCol] = promotionPiece ? color + promotionPiece : piece;
                
                const newCastling = { ...currentData.castling };
                let newEnPassant = null;
                
                if (piece === 'wK') { newCastling.wK = false; newCastling.wQ = false; }
                if (piece === 'bK') { newCastling.bK = false; newCastling.bQ = false; }
                if (piece === 'wR' && fromRow === 7 && fromCol === 0) newCastling.wQ = false;
                if (piece === 'wR' && fromRow === 7 && fromCol === 7) newCastling.wK = false;
                if (piece === 'bR' && fromRow === 0 && fromCol === 0) newCastling.bQ = false;
                if (piece === 'bR' && fromRow === 0 && fromCol === 7) newCastling.bK = false;

                if (piece[1] === 'K' && Math.abs(fromCol - toCol) === 2) {
                    if (toCol === 6) {
                        newBoard[fromRow][5] = newBoard[fromRow][7];
                        newBoard[fromRow][7] = null;
                    } else {
                        newBoard[fromRow][3] = newBoard[fromRow][0];
                        newBoard[fromRow][0] = null;
                    }
                }
                
                if (piece[1] === 'P' && currentData.enPassant) {
                    const [epRow, epCol] = currentData.enPassant;
                    if (toRow === epRow && toCol === epCol) {
                        newBoard[fromRow][toCol] = null;
                    }
                }
                
                if (piece[1] === 'P' && Math.abs(fromRow - toRow) === 2) {
                    newEnPassant = [ (fromRow + toRow) / 2, fromCol ];
                }
                
                const files = 'abcdefgh';
                const moveNotation = `${piece[1] !== 'P' ? piece[1] : ''}${files[fromCol]}${8-fromRow} -> ${files[toCol]}${8-toRow}`;
                const newMoveHistory = [...currentData.moveHistory, moveNotation];

                const nextTurn = color === 'w' ? 'b' : 'w';
                let newStatus = currentData.status;
                let newWinner = null;
                let endReason = null;
                let newRatingChange = null;
                
                const gameEndState = checkGameEnd(newBoard, nextTurn);
                if (gameEndState) {
                    newStatus = 'finished';
                    endReason = gameEndState;
                    if (gameEndState === 'checkmate') {
                        newWinner = color;
                    } else {
                        newWinner = 'draw';
                    }
                }
                
                if (newStatus === 'finished' && newWinner !== 'draw') {
                    newRatingChange = {
                        [newWinner === 'w' ? 'white' : 'black']: RATING_CHANGE.WIN,
                        [newWinner === 'w' ? 'black' : 'white']: RATING_CHANGE.LOSS,
                    };
                }

                const updateData = {
                    board: serializeBoard(newBoard),
                    turn: nextTurn,
                    castling: newCastling,
                    enPassant: newEnPassant,
                    moveHistory: newMoveHistory,
                    status: newStatus,
                    winner: newWinner,
                    endReason: endReason,
                    ratingChange: newRatingChange,
                };

                transaction.update(gameRef, updateData);

                return {
                    status: newStatus,
                    winner: newWinner,
                    aiMode: currentData.aiMode,
                    moveMade: true,
                };
            });

            if (result.moveMade && result.status === 'finished' && result.aiMode) {
                const playerIsWinner = result.winner === myColor;
                const isDraw = result.winner === 'draw';

                if (playerIsWinner || (isDraw && Math.random() < 0.5)) {
                    const cards = generateRewardCards();
                    setRewardCards(cards);
                    setShowRewardSelection(true);
                } else {
                    const today = new Date().toDateString();
                    const storageKey = `chessPlayCount_${user.uid}_${today}`;
                    const newCount = dailyPlayCount + 1;
                    localStorage.setItem(storageKey, newCount.toString());
                    setDailyPlayCount(newCount);
                    
                    if (isDraw) {
                        setFeedback({ message: '무승부! 아쉽지만 보상은 다음 기회에!', type: 'info' });
                    }
                    setTimeout(() => handleLeaveGame(), 2000);
                }
            }

            setSelectedPiece(null);
            setPossibleMoves([]);

            if (refetchRef.current) {
                await refetchRef.current();
            }

        } catch (error) {
            console.error("Error making move: ", error);
            setFeedback({ message: `이동 중 오류 발생: ${error.message}`, type: 'error' });
            if (refetchRef.current) {
                await refetchRef.current();
            }
        } finally {
            setIsMoving(false);
        }
    }, [gameId, isMoving, myColor, dailyPlayCount, user, checkGameEnd, setRewardCards, setShowRewardSelection, setDailyPlayCount, setFeedback, handleLeaveGame, setSelectedPiece, setPossibleMoves]);

    // AI 턴 처리 (모든 함수가 정의된 후 실행)
    useEffect(() => {
        // Cleanup 이전 timeout
        return () => {
            if (aiTimeoutRef.current) {
                clearTimeout(aiTimeoutRef.current);
                aiTimeoutRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const makeAiMove = async () => {
            if (!gameData || !gameId || gameData.status !== 'active') return;
            if (!gameData.aiMode) return;
            if (isAiThinking || isMoving) return;

            const aiColor = gameData.aiColor;
            if (gameData.turn !== aiColor) return;

            // 같은 턴에 이미 처리했는지 확인 (moveHistory 길이로 체크)
            const currentMoveCount = gameData.moveHistory?.length || 0;
            if (currentMoveCount === lastAiMoveCountRef.current && currentMoveCount > 0) {
                return;
            }

            setIsAiThinking(true);
            lastAiMoveCountRef.current = currentMoveCount + 1; // 다음 수를 예상

            // AI 사고 시간 시뮬레이션 (500ms ~ 1500ms)
            const thinkingTime = 500 + Math.random() * 1000;

            aiTimeoutRef.current = setTimeout(async () => {
                try {
                    // 최신 게임 데이터를 다시 가져옴
                    const gameRef = doc(db, 'chessGames', gameId);
                    const gameSnap = await getDoc(gameRef);

                    if (!gameSnap.exists()) {
                        setIsAiThinking(false);
                        return;
                    }

                    const currentGameData = gameSnap.data();

                    // 여전히 AI 턴인지 확인
                    if (currentGameData.status !== 'active' || currentGameData.turn !== aiColor) {
                        setIsAiThinking(false);
                        return;
                    }

                    const currentBoard = deserializeBoard(currentGameData.board);
                    const bestMove = findBestMove(currentBoard, aiColor, aiDifficulty, getValidMoves);

                    if (bestMove) {
                        const { from, to, piece } = bestMove;
                        await executeMove(from[0], from[1], to[0], to[1], piece);
                    }
                } catch (error) {
                    console.error("AI move error:", error);
                    setIsAiThinking(false);
                }

                setIsAiThinking(false);
                aiTimeoutRef.current = null;
            }, thinkingTime);
        };

        makeAiMove();
    }, [gameData?.turn, gameData?.status, gameData?.moveHistory?.length, gameId, aiDifficulty, executeMove, getValidMoves, isMoving]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (showCreateRoom) {
        const canPlayAi = dailyPlayCount < 3;

        return (
            <div className="chess-container">
                <div className="room-creation">
                    <h2>♚ 체스 게임 ♔</h2>
                    <p>전략적 사고력을 기르는 최고의 두뇌 게임!</p>

                    <div className="user-rank-info">
                        <p>내 등급: <strong>{userRank}</strong> ({userDoc?.chessRating || 0}점)</p>
                        {nextRank && (
                            <p className="next-rank-guide">
                                다음 등급 ({nextRank})까지 <strong>{pointsForNextRank}점</strong> 남았습니다.
                            </p>
                        )}
                    </div>

                    {/* 게임 모드 선택 */}
                    <div className="game-mode-selector">
                        <h3>게임 모드 선택</h3>
                        <div className="mode-options">
                            <button
                                className={gameMode === 'player' ? 'selected' : ''}
                                onClick={() => setGameMode('player')}
                            >
                                👥 플레이어 대전
                            </button>
                            <button
                                className={gameMode === 'ai' ? 'selected' : ''}
                                onClick={() => setGameMode('ai')}
                            >
                                🤖 AI 대전 ({dailyPlayCount}/3)
                            </button>
                        </div>
                    </div>

                    {/* AI 난이도 선택 (AI 모드일 때만 표시) */}
                    {gameMode === 'ai' && (
                        <div className="ai-difficulty-selector">
                            <h3>AI 난이도</h3>
                            <div className="difficulty-options">
                                <button
                                    className={aiDifficulty === 'beginner' ? 'selected' : ''}
                                    onClick={() => setAiDifficulty('beginner')}
                                >
                                    😊 초급
                                </button>
                                <button
                                    className={aiDifficulty === 'intermediate' ? 'selected' : ''}
                                    onClick={() => setAiDifficulty('intermediate')}
                                >
                                    🤔 중급
                                </button>
                                <button
                                    className={aiDifficulty === 'advanced' ? 'selected' : ''}
                                    onClick={() => setAiDifficulty('advanced')}
                                >
                                    🔥 고급
                                </button>
                            </div>
                        </div>
                    )}

                    {feedback.message && (
                        <div className={`feedback ${feedback.type}`}>{feedback.message}</div>
                    )}

                    <div className="time-control-selector">
                        <h3>시간 제한 선택</h3>
                        <div className="time-options">
                            {[180, 300, 600, 900].map(time => (
                                <button
                                    key={time}
                                    className={timeControl === time ? 'selected' : ''}
                                    onClick={() => setTimeControl(time)}
                                >
                                    {time/60}분
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="room-actions">
                        <button onClick={handleCreateRoom} className="create-room-btn">
                            {gameMode === 'ai' ? '🤖 AI 대전 시작' : '새로운 방 만들기'}
                        </button>

                        {/* 플레이어 대전 모드일 때만 방 참가 기능 표시 */}
                        {gameMode === 'player' && (
                            <div className="join-room">
                                <input
                                    type="text"
                                    value={newRoomId}
                                    onChange={(e) => setNewRoomId(e.target.value)}
                                    placeholder="방 코드 입력"
                                    maxLength="6"
                                />
                                <button onClick={() => handleJoinRoom()}>코드로 참가</button>
                            </div>
                        )}
                    </div>
                    
                    {availableRooms.length > 0 && (
                        <div className="available-rooms">
                            <h3>📋 대기 중인 방 목록</h3>
                            <div className="rooms-list">
                                {availableRooms.map((room) => (
                                    <div key={room.id} className="room-item">
                                        <div className="room-info">
                                            <span className="room-host">
                                                호스트: {room.playerNames.white} ({room.playerRanks?.white || 'Unranked'}, {room.playerRatings?.white || 0}점)
                                            </span>
                                            <span className="room-time">⏱ {formatTime(room.timeControl)}</span>
                                            <span className="room-code">코드: {room.id}</span>
                                        </div>
                                        <div className="room-item-buttons">
                                            <button 
                                                onClick={() => handleJoinRoom(room.id)}
                                                className="join-btn"
                                            >
                                                참가
                                            </button>
                                            {userDoc?.isAdmin && (
                                                <button
                                                    onClick={() => handleAdminDeleteRoom(room.id)}
                                                    className="delete-btn"
                                                >
                                                    삭제
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="chess-rules">
                        <h3>체스 기본 규칙</h3>
                        <ul>
                            <li>백(White)이 먼저 시작합니다.</li>
                            <li>상대방의 킹을 체크메이트하면 승리합니다.</li>
                            <li>플레이어 대전: 승리 시 <strong>점수(+15)</strong>와 쿠폰 3개, 패배 시 <strong>점수(-10)</strong></li>
                            <li>AI 대전: 승리 시 <strong>카드 보상</strong> 선택 (현금 또는 쿠폰), 하루 3회 제한</li>
                        </ul>
                    </div>
                </div>
            </div>
        );
    }
    
    if (!gameData) {
        return <AlchanLoading />;
    }

    const whitePlayerId = gameData.players.white;
    const blackPlayerId = gameData.players.black;

    return (
        <div className="chess-container">
            <div className="game-info">
                 <div className={`player black ${gameData.turn === 'b' ? 'active' : ''} ${user?.uid === blackPlayerId ? 'my-player' : 'opponent-player'}`}>
                    <span className="player-name">
                        ♛ {gameData.playerNames.black || '대기중...'}
                        <span className="player-rank">[{gameData.playerRanks?.black || 'Unranked'}] ({gameData.playerRatings?.black || 0}점)</span>
                    </span>
                    <span className="player-time">{formatTime(blackTime)}</span>
                </div>
                
                <div className="game-status">
                    {gameData.status === 'finished' ? (
                        gameData.winner === 'draw' ? (
                            <span>무승부!</span>
                        ) : gameData.winner === myColor ? (
                            <span className="winner">🎉 승리! ({gameData.ratingChange[myColor === 'w' ? 'white' : 'black'] > 0 ? '+' : ''}{gameData.ratingChange[myColor === 'w' ? 'white' : 'black']}점) 쿠폰 3개 획득!</span>
                        ) : (
                            <span className="loser">패배! ({gameData.ratingChange[myColor === 'w' ? 'white' : 'black']}점)</span>
                        )
                    ) : gameData.status === 'waiting' ? (
                        <span>상대방을 기다리는 중... (코드: {gameId})</span>
                    ) : (
                        <span>{isMyTurn ? '당신의 차례' : '상대방 차례'}</span>
                    )}
                </div>
                
                <div className={`player white ${gameData.turn === 'w' ? 'active' : ''} ${user?.uid === whitePlayerId ? 'my-player' : 'opponent-player'}`}>
                    <span className="player-name">
                        ♕ {gameData.playerNames.white}
                        <span className="player-rank">[{gameData.playerRanks?.white || 'Unranked'}] ({gameData.playerRatings?.white || 0}점)</span>
                    </span>
                    <span className="player-time">{formatTime(whiteTime)}</span>
                </div>
            </div>
            
            <div className="board-container">
                <div className={`chess-board ${myColor === 'b' ? 'flipped' : ''}`}>
                    {gameData.board.map((row, rIndex) => (
                        row.map((piece, cIndex) => {
                            const isSelected = selectedPiece?.row === rIndex && selectedPiece?.col === cIndex;
                            const isPossibleMove = possibleMoves.some(([r, c]) => r === rIndex && c === cIndex);
                            const isLight = (rIndex + cIndex) % 2 === 0;
                            const isCheck = piece && piece[1] === 'K' && isInCheck(gameData.board, piece[0]);
                            
                            return (
                                <div
                                    key={`${rIndex}-${cIndex}`}
                                    className={`square ${isLight ? 'light' : 'dark'} 
                                               ${isSelected ? 'selected' : ''} 
                                               ${isPossibleMove ? 'possible' : ''}
                                               ${isCheck ? 'check' : ''}`}
                                    onClick={() => handlePieceClick(rIndex, cIndex)}
                                >
                                    {piece && (
                                        <div className={`piece ${piece[0] === 'w' ? 'white-piece' : 'black-piece'}`}>
                                            {PIECES[piece]}
                                        </div>
                                    )}
                                    {isPossibleMove && !piece && <div className="move-dot" />}
                                    {isPossibleMove && piece && <div className="capture-hint" />}
                                </div>
                            );
                        })
                    ))}
                </div>
                
                {showPromotion && (
                    <div className="promotion-modal">
                        <div className="promotion-content">
                            <h3>프로모션 선택</h3>
                            <div className="promotion-pieces">
                                {['Q', 'R', 'B', 'N'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => handlePromotion(type)}
                                        className="promotion-piece"
                                    >
                                        {PIECES[myColor + type]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* AI 사고 중 표시 */}
                {isAiThinking && (
                    <div className="ai-thinking">
                        <div className="thinking-content">
                            <div className="spinner"></div>
                            <p>AI가 수를 고민하는 중...</p>
                        </div>
                    </div>
                )}

                {/* 보상 카드 선택 모달 */}
                {showRewardSelection && rewardCards.length === 2 && (
                    <div className="reward-modal">
                        <div className="reward-content">
                            <h3>🎉 승리 보상!</h3>
                            <p>하나의 카드를 선택하세요</p>
                            <div className="reward-cards">
                                {rewardCards.map((card, index) => (
                                    <div
                                        key={index}
                                        className="reward-card"
                                        onClick={() => handleRewardSelection(card)}
                                    >
                                        <div className="card-icon">
                                            {card.type === 'cash' ? '💵' : '🎫'}
                                        </div>
                                        <div className="card-title">
                                            {card.type === 'cash' ? '현금' : '쿠폰'}
                                        </div>
                                        <div className="card-amount">
                                            {card.type === 'cash'
                                                ? `${card.amount.toLocaleString()}원`
                                                : `${card.amount}개`}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            {feedback.message && (
                <div className={`feedback ${feedback.type}`}>{feedback.message}</div>
            )}
            
            <div className="game-controls">
                <button onClick={handleLeaveGame} className="leave-button">
                    게임 나가기
                </button>
            </div>
            
            {moveHistory.length > 0 && (
                <div className="move-history">
                    <h4>이동 기록</h4>
                    <div className="moves-list">
                        {moveHistory.map((move, idx) => (
                             <span key={idx} className="move">
                                {idx % 2 === 0 ? `${Math.floor(idx/2) + 1}. ` : ''}{move}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChessGame;