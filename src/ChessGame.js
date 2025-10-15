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
import './ChessGame.css';

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

    const myColor = gameData && user && (gameData.players.white === user.uid ? 'w' : 'b');
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
            const interval = setInterval(fetchAvailableRooms, 5000);
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

    const { refetch } = usePolling(fetchGameData, 3000, !!gameId);

    useEffect(() => {
        refetchRef.current = refetch;
    }, [refetch]);

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


    const handleCreateRoom = async () => {
        if (!user) {
            setFeedback({ message: '로그인이 필요합니다.', type: 'error' });
            return;
        }
        
        const newGameId = Math.random().toString(36).substring(2, 8);
        const gameRef = doc(db, 'chessGames', newGameId);
        
        const initialGameData = {
            board: serializeBoard(getInitialBoard()),
            players: { white: user.uid, black: null },
            playerNames: { white: userDoc.name, black: null },
            playerRanks: { white: userRank, black: 'Unranked' },
            playerRatings: { white: userDoc.chessRating || 0, black: null },
            turn: 'w',
            status: 'waiting',
            winner: null,
            timeControl: timeControl,
            whiteTime: timeControl,
            blackTime: timeControl,
            castling: { wK: true, wQ: true, bK: true, bQ: true },
            enPassant: null,
            moveHistory: [],
            createdAt: serverTimestamp(),
            ratingChange: null,
        };

        try {
            await setDoc(gameRef, initialGameData);
            setGameId(newGameId);
            setFeedback({ message: `체스 방 생성 완료! 코드: ${newGameId}`, type: 'success' });
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
        if (!isMyTurn || gameData.status !== 'active') return;
        
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

    const executeMove = async (fromRow, fromCol, toRow, toCol, piece, promotionPiece = null) => {
        if (!gameId) return;
        const gameRef = doc(db, 'chessGames', gameId);

        try {
            await runTransaction(db, async (transaction) => {
                const gameDoc = await transaction.get(gameRef);
                if (!gameDoc.exists()) throw new Error("Game not found");
                
                const currentData = gameDoc.data();
                if (currentData.status !== 'active') return;
                
                const board = deserializeBoard(currentData.board);
                const color = piece[0];

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
                    const winnerId = currentData.players[newWinner === 'w' ? 'white' : 'black'];
                    const loserId = currentData.players[newWinner === 'w' ? 'black' : 'white'];
                    
                    newRatingChange = {
                        [newWinner === 'w' ? 'white' : 'black']: RATING_CHANGE.WIN,
                        [newWinner === 'w' ? 'black' : 'white']: RATING_CHANGE.LOSS,
                    };

                    // ✨ updateUserChessResult 함수 호출을 여기서 제거했습니다.
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
            });
            
            setSelectedPiece(null);
            setPossibleMoves([]);

        } catch (error) {
            console.error("Error making move: ", error);
            setFeedback({ message: `이동 중 오류 발생: ${error.message}`, type: 'error' });
        }
    };

    const handleLeaveGame = async () => {
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
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (showCreateRoom) {
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
                            새로운 방 만들기
                        </button>
                        
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
                            <li>승리 시 <strong>점수(+15)</strong>와 쿠폰 3개를, 패배 시 <strong>점수(-10)</strong>가 변동됩니다.</li>
                        </ul>
                    </div>
                </div>
            </div>
        );
    }
    
    if (!gameData) {
        return <div className="chess-container"><h2>로딩중...</h2></div>;
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