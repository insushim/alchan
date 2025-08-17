import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";

// Mock auth context for demonstration
const useAuth = () => ({
  userDoc: {
    uid: "demo",
    currentGameLevel: 1,
    maxClearedLevel: 0,
    powerUpHints: 3,
    powerUpTime: 2,
    coupons: 0,
  },
  updateUser: async (updates) => console.log("Update user:", updates),
});

const increment = (value) => value;

// 게임 설정 값
const BOARD_SIZE = 9;
const STUDENT_ROW = Math.floor(BOARD_SIZE / 2) - 1; // 학생은 항상 이 행에 위치
const CELL_SIZE = 45;
const TOTAL_LEVEL_TARGET = 50;

// 스타일 객체
const styles = {
  gameContainer: {
    maxWidth: "900px",
    margin: "20px auto",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: "'Arial', sans-serif",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    borderRadius: "15px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
    userSelect: "none",
    minHeight: "90vh",
  },
  gameTitle: {
    fontSize: "2.5em",
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: "30px",
    textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
    textAlign: "center",
  },
  introContainer: {
    background: "rgba(255,255,255,0.95)",
    padding: "40px",
    borderRadius: "12px",
    boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
    textAlign: "center",
    marginBottom: "30px",
    backdropFilter: "blur(10px)",
  },
  introText: {
    fontSize: "1.1em",
    marginBottom: "20px",
    color: "#4a4a4a",
    lineHeight: "1.6",
  },
  startButton: {
    background: "linear-gradient(135deg, #5e72e4 0%, #825ee4 100%)",
    color: "white",
    border: "none",
    padding: "15px 30px",
    fontSize: "1.2em",
    fontWeight: "bold",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(94,114,228,0.4)",
    transition: "all 0.3s ease",
  },
  gameplayContainer: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  gameStats: {
    display: "flex",
    justifyContent: "space-around",
    marginBottom: "25px",
    width: "100%",
    maxWidth: "520px",
    padding: "15px",
    background: "rgba(255,255,255,0.9)",
    borderRadius: "10px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    backdropFilter: "blur(10px)",
  },
  statBox: {
    fontSize: "1em",
    color: "#2c3e50",
    textAlign: "center",
    animation: "fadeInStats 0.5s ease-out",
  },
  statLabel: {
    color: "#8898aa",
    fontSize: "0.9em",
    display: "block",
    marginBottom: "3px",
  },
  statValue: { fontWeight: "bold", color: "#5e72e4", fontSize: "1.3em" },
  boardPerspectiveContainer: {
    perspective: "1400px",
    marginBottom: "25px",
    filter: "drop-shadow(0 20px 30px rgba(0,0,0,0.3))",
  },
  boardContainer: {
    position: "relative",
    width: `${CELL_SIZE * BOARD_SIZE + 10}px`,
    height: `${CELL_SIZE * BOARD_SIZE + 10}px`,
    background: "linear-gradient(135deg, #dde1e7 0%, #f8f9fc 100%)",
    border: "5px solid #525f7f",
    borderRadius: "15px",
    transform: "rotateX(25deg) rotateY(0deg) scale(0.85)",
    transformStyle: "preserve-3d",
    boxShadow: "0 25px 50px rgba(0,0,0,0.4), inset 0 0 25px rgba(0,0,0,0.1)",
    transition: "transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  },
  gameBoardGrid: {
    display: "grid",
    gridTemplateColumns: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
    gridTemplateRows: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  boardCell: {
    width: `${CELL_SIZE}px`,
    height: `${CELL_SIZE}px`,
    borderRight: "1px solid rgba(255,255,255,0.3)",
    borderBottom: "1px solid rgba(255,255,255,0.3)",
    boxSizing: "border-box",
    background: "rgba(255,255,255,0.05)",
  },
  exitDoor: (position) => {
    const baseStyle = {
      position: "absolute",
      width: "20px",
      height: `${CELL_SIZE}px`,
      background: "linear-gradient(to right, #ffd700, #f39c12)",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(243,156,18,0.6)",
      zIndex: 1,
      transform: "translateZ(5px)",
      top: `${CELL_SIZE * STUDENT_ROW}px`,
    };

    if (position === "right") {
      return { ...baseStyle, right: "-20px", borderRadius: "0 8px 8px 0" };
    } else if (position === "left") {
      return {
        ...baseStyle,
        left: "-20px",
        borderRadius: "8px 0 0 8px",
        background: "linear-gradient(to left, #ffd700, #f39c12)",
      };
    }
    return {};
  },
  itemStyle: (item, isSelected) => {
    return {
      position: "absolute",
      width:
        item.type === "h" ? `${item.length * CELL_SIZE}px` : `${CELL_SIZE}px`,
      height:
        item.type === "v" ? `${item.length * CELL_SIZE}px` : `${CELL_SIZE}px`,
      left: `${item.col * CELL_SIZE}px`,
      top: `${item.row * CELL_SIZE}px`,
      backgroundColor: item.color || "#3498db",
      backgroundImage: item.isPlayer
        ? "linear-gradient(45deg, #e74c3c, #c0392b)"
        : "linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent)",
      backgroundSize: item.isPlayer ? "auto" : "20px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "6px",
      cursor: "grab",
      border: `2px solid ${isSelected ? "#4CAF50" : "rgba(0,0,0,0.2)"}`,
      boxShadow: isSelected
        ? "0 0 25px rgba(76, 175, 80, 0.8), 0 8px 15px rgba(0,0,0,0.3)"
        : "0 6px 12px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.3)",
      transition: "all 0.2s ease-out",
      transform: `translateZ(${isSelected ? "40px" : "30px"}) scale(${
        isSelected ? 1.05 : 1
      })`,
      fontSize: item.isPlayer
        ? `${CELL_SIZE * 0.6}px`
        : `${CELL_SIZE * 0.25}px`,
      color: item.isPlayer ? "#ffffff" : "rgba(255,255,255,0.9)",
      fontWeight: "bold",
      textAlign: "center",
      overflow: "hidden",
      textShadow: "1px 1px 2px rgba(0,0,0,0.7)",
    };
  },
  deskLabel: { transform: "translateZ(3px)" },
  studentFace: {
    transform: "translateZ(8px) scale(1.2)",
    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
  },
  iconContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    width: "100%",
  },
  messageContainer: {
    background: "rgba(255,255,255,0.95)",
    padding: "30px 40px",
    borderRadius: "15px",
    boxShadow: "0 10px 20px rgba(0,0,0,0.2)",
    textAlign: "center",
    animation:
      "popInMessage 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards",
    width: "85%",
    maxWidth: "450px",
    backdropFilter: "blur(15px)",
  },
  messageTitle: { fontSize: "1.8em", fontWeight: "bold", marginBottom: "15px" },
  messageText: { fontSize: "1.1em", marginBottom: "20px", color: "#555" },
  couponText: {
    fontSize: "1.1em",
    color: "#e67e22",
    fontWeight: "bold",
    marginBottom: "25px",
  },
  actionButton: {
    color: "white",
    border: "none",
    padding: "12px 25px",
    fontSize: "1.1em",
    fontWeight: "bold",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
    transition: "all 0.3s ease",
    margin: "5px",
  },
  skipButton: {
    background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  },
  previousButton: {
    background: "linear-gradient(135deg, #6B73FF 0%, #000DFF 100%)",
  },
  tutorialBox: {
    position: "fixed",
    padding: "12px 20px",
    background: "rgba(0, 0, 0, 0.85)",
    color: "white",
    borderRadius: "8px",
    fontSize: "1em",
    zIndex: 1000,
    maxWidth: "250px",
    textAlign: "center",
    animation: "fadeIn 0.4s ease-out",
    backdropFilter: "blur(10px)",
  },
  levelBadge: {
    position: "absolute",
    top: "-30px",
    right: "-30px",
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)",
    color: "white",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    fontSize: "1.2em",
    boxShadow: "0 6px 12px rgba(0,0,0,0.4)",
    transform: "translateZ(50px)",
    animation: "pulseBadge 2s infinite",
  },
  difficultyIndicator: {
    marginBottom: "15px",
    padding: "8px 16px",
    borderRadius: "25px",
    fontSize: "0.9em",
    fontWeight: "bold",
    color: "white",
    boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
  },
  getDifficultyBackground: (level) => {
    if (level <= 10) return "linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)";
    if (level <= 25) return "linear-gradient(135deg, #f39c12 0%, #d35400 100%)";
    return "linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)";
  },
  powerUpContainer: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "15px",
    gap: "15px",
  },
  powerUpButton: {
    padding: "10px 18px",
    borderRadius: "30px",
    background: "rgba(255,255,255,0.9)",
    border: "2px solid #bdc3c7",
    cursor: "pointer",
    fontSize: "0.95em",
    transition: "all 0.3s ease",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: "bold",
    boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
  },
  powerUpIcon: { fontSize: "1.3em" },
  movesGraph: {
    width: "100%",
    height: "6px",
    background: "#ecf0f1",
    borderRadius: "3px",
    marginTop: "8px",
    position: "relative",
    overflow: "hidden",
  },
  movesProgress: (moves, idealMoves) => ({
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    width: `${Math.min(100, (moves / (idealMoves * 1.5)) * 100)}%`,
    background:
      moves <= idealMoves
        ? "linear-gradient(to right, #2ecc71, #27ae60)"
        : moves <= idealMoves * 1.3
        ? "linear-gradient(to right, #f39c12, #d35400)"
        : "linear-gradient(to right, #e74c3c, #c0392b)",
    borderRadius: "3px",
    transition: "width 0.3s ease",
  }),
};

// CSS animations
const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = `
  @keyframes fadeInStats { 
    from { opacity: 0; transform: translateY(10px); } 
    to { opacity: 1; transform: translateY(0); } 
  }
  @keyframes popInMessage { 
    from { opacity: 0; transform: scale(0.8) translateY(20px); } 
    to { opacity: 1; transform: scale(1) translateY(0); } 
  }
  @keyframes pulseBadge { 
    0% { transform: translateZ(50px) scale(0.95); } 
    50% { transform: translateZ(50px) scale(1.05); } 
    100% { transform: translateZ(50px) scale(0.95); } 
  }
  @keyframes fadeIn { 
    from { opacity: 0; transform: translateY(-10px); } 
    to { opacity: 1; transform: translateY(0); } 
  }
  button:hover { 
    transform: translateY(-3px); 
    box-shadow: 0 8px 16px rgba(0,0,0,0.25); 
  }
  button:active { 
    transform: translateY(-1px); 
    box-shadow: 0 4px 8px rgba(0,0,0,0.2); 
  }
  .power-up-button:hover {
    background: rgba(255,255,255,1);
    transform: scale(1.05);
    box-shadow: 0 6px 12px rgba(0,0,0,0.2);
  }
`;
if (!document.head.querySelector("style[data-game-styles]")) {
  styleSheet.setAttribute("data-game-styles", "true");
  document.head.appendChild(styleSheet);
}

const DIFFICULTY = {
  EASY: { label: "쉬움", valueFactor: 1, obstacleFactor: 0.7 },
  MEDIUM: { label: "보통", valueFactor: 1.5, obstacleFactor: 1 },
  HARD: { label: "어려움", valueFactor: 2, obstacleFactor: 1.3 },
  EXPERT: { label: "전문가", valueFactor: 3, obstacleFactor: 1.6 },
  MASTER: { label: "마스터", valueFactor: 4, obstacleFactor: 2.0 },
};

const getDifficultyForLevel = (level) => {
  if (level <= 10) return DIFFICULTY.EASY;
  if (level <= 25) return DIFFICULTY.MEDIUM;
  if (level <= 35) return DIFFICULTY.HARD;
  if (level <= 45) return DIFFICULTY.EXPERT;
  return DIFFICULTY.MASTER;
};

const generateRandomLevel = (levelNum) => {
  console.log(`Generating level: ${levelNum}`);
  const difficulty = getDifficultyForLevel(levelNum);

  if (levelNum === 1) {
    const student = {
      id: "student_intro",
      type: "h",
      length: 2,
      color: "#e74c3c",
      row: STUDENT_ROW,
      col: 1,
      isPlayer: true,
    };
    const desk1 = {
      id: "desk_intro_1",
      type: "v",
      length: 2,
      color: "#3498db",
      row: STUDENT_ROW - 1,
      col: 4,
    };
    return {
      time: 120,
      items: [student, desk1],
      exitPosition: "right",
      difficulty: DIFFICULTY.EASY.label,
      idealMoves: 3,
      studentSpawnRow: STUDENT_ROW,
      studentSpawnCol: 1,
    };
  }

  // Generate level
  let attempts = 0;
  while (attempts < 20) {
    attempts++;
    let currentGeneratedItems = [];
    const occupied = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(false));
    const exitPosition = Math.random() < 0.5 ? "right" : "left";
    const studentLength = 2;

    let studentStartCol;
    if (exitPosition === "right") {
      studentStartCol = Math.floor(
        Math.random() * (BOARD_SIZE / 2 - studentLength)
      );
    } else {
      studentStartCol =
        BOARD_SIZE -
        studentLength -
        Math.floor(Math.random() * (BOARD_SIZE / 2 - studentLength));
    }
    studentStartCol = Math.max(
      0,
      Math.min(BOARD_SIZE - studentLength, studentStartCol)
    );

    const student = {
      id: "student",
      type: "h",
      length: studentLength,
      color: "#e74c3c",
      row: STUDENT_ROW,
      col: studentStartCol,
      isPlayer: true,
    };
    currentGeneratedItems.push(student);

    for (let i = 0; i < student.length; i++) {
      occupied[STUDENT_ROW][studentStartCol + i] = true;
    }

    const baseObstacles = 2;
    const extraObstacles = Math.floor(levelNum / 2.0);
    const numObstacles = Math.min(
      Math.floor((baseObstacles + extraObstacles) * difficulty.obstacleFactor),
      Math.floor((BOARD_SIZE * BOARD_SIZE) / 3)
    );

    const deskColors = [
      "#3498db",
      "#2ecc71",
      "#f1c40f",
      "#9b59b6",
      "#e67e22",
      "#1abc9c",
    ];
    let obstacleIdCounter = 0;

    for (let i = 0; i < numObstacles; i++) {
      let placed = false;
      let placementAttempts = 0;

      while (!placed && placementAttempts < 30) {
        placementAttempts++;
        const type = Math.random() < 0.5 ? "h" : "v";
        const length = Math.random() < 0.3 + levelNum * 0.006 ? 3 : 2;
        const color = deskColors[Math.floor(Math.random() * deskColors.length)];
        let r = Math.floor(Math.random() * BOARD_SIZE);
        let c = Math.floor(Math.random() * BOARD_SIZE);

        let canPlace = true;
        const cellsToOccupy = [];

        if (type === "h") {
          if (c + length > BOARD_SIZE) continue;
          for (let k = 0; k < length; k++) {
            if (occupied[r][c + k]) {
              canPlace = false;
              break;
            }
            cellsToOccupy.push({ r, c: c + k });
          }
        } else {
          if (r + length > BOARD_SIZE) continue;
          for (let k = 0; k < length; k++) {
            if (occupied[r + k][c]) {
              canPlace = false;
              break;
            }
            cellsToOccupy.push({ r: r + k, c });
          }
        }

        if (canPlace) {
          currentGeneratedItems.push({
            id: `desk_auto_${levelNum}_${obstacleIdCounter++}`,
            type,
            length,
            color,
            row: r,
            col: c,
          });
          cellsToOccupy.forEach((cell) => (occupied[cell.r][cell.c] = true));
          placed = true;
        }
      }
    }

    if (currentGeneratedItems.filter((item) => !item.isPlayer).length >= 1) {
      const baseTime = Math.max(45, 150 - levelNum * 2);
      const adjustedTime = Math.round(baseTime * difficulty.valueFactor);
      const idealMoves =
        4 +
        Math.floor(
          levelNum * 0.5 * difficulty.valueFactor +
            currentGeneratedItems.length * 0.3
        );

      return {
        time: adjustedTime,
        items: currentGeneratedItems,
        exitPosition,
        difficulty: difficulty.label,
        idealMoves,
        studentSpawnRow: STUDENT_ROW,
        studentSpawnCol: studentStartCol,
      };
    }
  }

  // Fallback
  const fallbackStudent = {
    id: "student_fallback",
    type: "h",
    length: 2,
    color: "#e74c3c",
    row: STUDENT_ROW,
    col: 1,
    isPlayer: true,
  };
  const fallbackDesk = {
    id: "desk_fallback_1",
    type: "v",
    length: 2,
    color: "#3498db",
    row: STUDENT_ROW - 1,
    col: 4,
  };
  return {
    time: 80,
    items: [fallbackStudent, fallbackDesk],
    exitPosition: "right",
    difficulty: DIFFICULTY.EASY.label,
    idealMoves: 2,
    studentSpawnRow: STUDENT_ROW,
    studentSpawnCol: 1,
  };
};

const ClassroomEscapeUltra = () => {
  const [level, setLevel] = useState(1);
  const [moves, setMoves] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [boardItems, setBoardItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [gameState, setGameState] = useState("intro");
  const [earnedCoupons, setEarnedCoupons] = useState(0);
  const [exitPosition, setExitPosition] = useState("right");
  const [idealMoves, setIdealMoves] = useState(5);
  const [levelDifficulty, setLevelDifficulty] = useState("쉬움");
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialMessage, setTutorialMessage] = useState("");
  const [powerUpHints, setPowerUpHints] = useState(3);
  const [powerUpTime, setPowerUpTime] = useState(2);

  const { userDoc, updateUser } = useAuth();
  const dragStartCoords = useRef(null);
  const draggingItemRef = useRef(null);
  const boardContainerRef = useRef(null);

  const allLevelData = useMemo(() => {
    const generated = {};
    for (let i = 1; i <= TOTAL_LEVEL_TARGET; i++) {
      generated[i] = generateRandomLevel(i);
    }
    return generated;
  }, []);

  const maxLevel = useMemo(
    () => Object.keys(allLevelData).length,
    [allLevelData]
  );

  const initializeLevel = useCallback(
    (levelNum) => {
      const currentLevelData = allLevelData[levelNum];
      if (!currentLevelData || !currentLevelData.items) {
        setLevel(1);
        const firstLevelData = allLevelData[1];
        setBoardItems(
          firstLevelData
            ? firstLevelData.items.map((item) => ({ ...item }))
            : []
        );
        setTimeLeft(firstLevelData ? firstLevelData.time : 60);
        setExitPosition(firstLevelData ? firstLevelData.exitPosition : "right");
        setIdealMoves(firstLevelData ? firstLevelData.idealMoves : 5);
        setLevelDifficulty(firstLevelData ? firstLevelData.difficulty : "쉬움");
      } else {
        setBoardItems(currentLevelData.items.map((item) => ({ ...item })));
        setTimeLeft(currentLevelData.time);
        setExitPosition(currentLevelData.exitPosition || "right");
        setIdealMoves(currentLevelData.idealMoves || 5);
        setLevelDifficulty(currentLevelData.difficulty || "쉬움");
      }
      setMoves(0);
      setSelectedItemId(null);
      setEarnedCoupons(0);
      setGameState("playing");

      if (levelNum === 1) {
        setTimeout(() => {
          setTutorialMessage(
            "학생(🧑‍🎓)을 드래그해서 황금 출구로 옮겨주세요! 책상들은 모양대로만 움직여요."
          );
          setShowTutorial(true);
        }, 800);
      }
    },
    [allLevelData]
  );

  const startGame = useCallback(async () => {
    let initialLevel = 1;
    if (userDoc?.currentGameLevel && allLevelData[userDoc.currentGameLevel]) {
      initialLevel = userDoc.currentGameLevel;
    } else if (
      userDoc?.maxClearedLevel &&
      allLevelData[userDoc.maxClearedLevel + 1] &&
      userDoc.maxClearedLevel < maxLevel
    ) {
      initialLevel = userDoc.maxClearedLevel + 1;
    }
    if (initialLevel > maxLevel && maxLevel > 0) initialLevel = 1;

    setLevel(initialLevel);
    initializeLevel(initialLevel);
    setPowerUpHints(userDoc?.powerUpHints || 3);
    setPowerUpTime(userDoc?.powerUpTime || 2);

    if (
      updateUser &&
      userDoc?.uid &&
      (!userDoc.currentGameLevel || userDoc.currentGameLevel !== initialLevel)
    ) {
      try {
        await updateUser({ currentGameLevel: initialLevel });
      } catch (error) {
        console.error("Error saving initial currentGameLevel:", error);
      }
    }
  }, [userDoc, updateUser, allLevelData, maxLevel, initializeLevel]);

  useEffect(() => {
    if (timeLeft === 0 && gameState === "playing") {
      setGameState("gameOver");
    }
  }, [timeLeft, gameState]);

  useEffect(() => {
    if (gameState !== "playing" || timeLeft <= 0) return;
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [gameState, timeLeft]);

  useEffect(() => {
    if (showTutorial) {
      const timer = setTimeout(() => setShowTutorial(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [showTutorial]);

  const canMoveItem = useCallback((item, newRow, newCol, currentBoardItems) => {
    if (!item) return false;
    if (item.isPlayer && newRow !== STUDENT_ROW) return false;
    if (item.type === "h" && newRow !== item.row) return false;
    if (item.type === "v" && newCol !== item.col) return false;

    if (newRow < 0 || newCol < 0) return false;
    if (
      item.type === "h" &&
      (newCol + item.length > BOARD_SIZE || newRow >= BOARD_SIZE)
    )
      return false;
    if (
      item.type === "v" &&
      (newRow + item.length > BOARD_SIZE || newCol >= BOARD_SIZE)
    )
      return false;

    for (const otherItem of currentBoardItems) {
      if (otherItem.id === item.id) continue;
      for (let i = 0; i < item.length; i++) {
        const currentPartRow = item.type === "h" ? newRow : newRow + i;
        const currentPartCol = item.type === "h" ? newCol + i : newCol;
        for (let j = 0; j < otherItem.length; j++) {
          const otherPartRow =
            otherItem.type === "h" ? otherItem.row : otherItem.row + j;
          const otherPartCol =
            otherItem.type === "h" ? otherItem.col + j : otherItem.col;
          if (
            currentPartRow === otherPartRow &&
            currentPartCol === otherPartCol
          )
            return false;
        }
      }
    }
    return true;
  }, []);

  const handleLevelComplete = useCallback(async () => {
    if (gameState !== "playing") return;
    setGameState("complete");
    const calculatedCoupons = Math.floor((level - 1) / 10) + 1;
    setEarnedCoupons(calculatedCoupons);
    if (updateUser && userDoc) {
      const updates = { coupons: increment(calculatedCoupons) };
      if (!userDoc.maxClearedLevel || level > userDoc.maxClearedLevel) {
        updates.maxClearedLevel = level;
      }
      updates.currentGameLevel =
        level < maxLevel && allLevelData[level + 1] ? level + 1 : 1;
      try {
        await updateUser(updates);
      } catch (error) {
        console.error("Error updating user on level complete:", error);
      }
    }
  }, [level, updateUser, userDoc, maxLevel, gameState, allLevelData]);

  const checkWinCondition = useCallback(
    (item) => {
      if (!item || !item.isPlayer || item.row !== STUDENT_ROW) return false;
      if (exitPosition === "right")
        return item.col + item.length === BOARD_SIZE;
      if (exitPosition === "left") return item.col === 0;
      return false;
    },
    [exitPosition]
  );

  const moveItem = useCallback(
    (itemId, newRow, newCol, countAsMove = true) => {
      let itemActuallyMoved = false;
      let winConditionMet = false;
      setBoardItems((prevItems) => {
        const itemToMove = prevItems.find((item) => item.id === itemId);
        if (!itemToMove) return prevItems;

        let R = newRow,
          C = newCol;
        if (itemToMove.isPlayer) R = STUDENT_ROW;
        else if (itemToMove.type === "h") R = itemToMove.row;
        else if (itemToMove.type === "v") C = itemToMove.col;

        if (!canMoveItem(itemToMove, R, C, prevItems)) return prevItems;
        if (itemToMove.row === R && itemToMove.col === C) return prevItems;

        itemActuallyMoved = true;
        const updatedItems = prevItems.map((item) =>
          item.id === itemId ? { ...item, row: R, col: C } : item
        );
        const movedItem = updatedItems.find((item) => item.id === itemId);
        if (movedItem && movedItem.isPlayer && checkWinCondition(movedItem)) {
          winConditionMet = true;
        }
        return updatedItems;
      });
      if (itemActuallyMoved && countAsMove) setMoves((m) => m + 1);
      if (winConditionMet) setTimeout(() => handleLevelComplete(), 100);
      return itemActuallyMoved;
    },
    [canMoveItem, checkWinCondition, handleLevelComplete]
  );

  const useHintPowerUp = useCallback(() => {
    if (powerUpHints <= 0 || gameState !== "playing") return;
    setPowerUpHints((prev) => prev - 1);
    if (updateUser && userDoc) updateUser({ powerUpHints: increment(-1) });
    setTutorialMessage(
      "어떤 책상을 움직여야 길이 보일까요? 책상은 모양대로만 움직여요!"
    );
    setShowTutorial(true);
  }, [powerUpHints, gameState, updateUser, userDoc]);

  const useTimePowerUp = useCallback(() => {
    if (powerUpTime <= 0 || gameState !== "playing") return;
    setPowerUpTime((prev) => prev - 1);
    if (updateUser && userDoc) updateUser({ powerUpTime: increment(-1) });
    setTimeLeft((prev) => prev + 30);
    setTutorialMessage("시간 +30초! 서두르세요!");
    setShowTutorial(true);
  }, [powerUpTime, gameState, updateUser, userDoc]);

  const goToNextLevel = useCallback(
    async (skipped = false) => {
      const nextLvl =
        level < maxLevel && allLevelData[level + 1] ? level + 1 : 1;
      setLevel(nextLvl);
      initializeLevel(nextLvl);
      if (updateUser && userDoc?.currentGameLevel !== nextLvl) {
        try {
          await updateUser({ currentGameLevel: nextLvl });
        } catch (e) {
          console.error("Error next level:", e);
        }
      }
    },
    [level, maxLevel, initializeLevel, updateUser, userDoc, allLevelData]
  );

  const goToPreviousLevel = useCallback(async () => {
    if (level <= 1) return;
    const prevLvl = level - 1;
    setLevel(prevLvl);
    initializeLevel(prevLvl);
    if (updateUser && userDoc?.currentGameLevel !== prevLvl) {
      try {
        await updateUser({ currentGameLevel: prevLvl });
      } catch (e) {
        console.error("Error prev level:", e);
      }
    }
  }, [level, initializeLevel, updateUser, userDoc]);

  const handleSkipLevel = () => {
    if (gameState === "playing" && level < maxLevel) goToNextLevel(true);
  };

  const restartCurrentLevel = useCallback(
    () => initializeLevel(level),
    [level, initializeLevel]
  );

  const handleItemClick = (itemId) => {
    if (gameState === "playing") {
      setSelectedItemId((prevId) => (prevId === itemId ? null : itemId));
    }
  };

  const handleDragStart = (e, item) => {
    if (gameState !== "playing" || !item) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedItemId(item.id);
    draggingItemRef.current = item;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStartCoords.current = {
      x: clientX,
      y: clientY,
      itemStartRow: item.row,
      itemStartCol: item.col,
    };
  };

  const handleDragging = useCallback(
    (e) => {
      if (
        !draggingItemRef.current ||
        !dragStartCoords.current ||
        gameState !== "playing"
      )
        return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const deltaX = clientX - dragStartCoords.current.x;
      const deltaY = clientY - dragStartCoords.current.y;
      const itemBeingDragged = draggingItemRef.current;

      let targetRow = dragStartCoords.current.itemStartRow;
      let targetCol = dragStartCoords.current.itemStartCol;

      const dragSensitivity = 0.65;
      const colOffset = Math.round(deltaX / (CELL_SIZE * dragSensitivity));
      const rowOffset = Math.round(deltaY / (CELL_SIZE * dragSensitivity));

      if (itemBeingDragged.isPlayer) {
        targetCol = dragStartCoords.current.itemStartCol + colOffset;
        targetRow = STUDENT_ROW;
      } else if (itemBeingDragged.type === "h") {
        targetCol = dragStartCoords.current.itemStartCol + colOffset;
        targetRow = dragStartCoords.current.itemStartRow;
      } else {
        targetRow = dragStartCoords.current.itemStartRow + rowOffset;
        targetCol = dragStartCoords.current.itemStartCol;
      }

      const currentItemState = boardItems.find(
        (i) => i.id === itemBeingDragged.id
      );
      if (!currentItemState) return;

      if (
        targetRow !== currentItemState.row ||
        targetCol !== currentItemState.col
      ) {
        moveItem(itemBeingDragged.id, targetRow, targetCol);
      }
    },
    [gameState, moveItem, boardItems]
  );

  const handleDragEnd = useCallback(
    (e) => {
      if (!draggingItemRef.current || gameState !== "playing") return;
      dragStartCoords.current = null;
      draggingItemRef.current = null;
    },
    [gameState]
  );

  useEffect(() => {
    const opts = { passive: false };
    window.addEventListener("mousemove", handleDragging);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchmove", handleDragging, opts);
    window.addEventListener("touchend", handleDragEnd);
    return () => {
      window.removeEventListener("mousemove", handleDragging);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragging, opts);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [handleDragging, handleDragEnd]);

  const renderBoard = () => (
    <div style={styles.boardPerspectiveContainer}>
      <div style={styles.boardContainer} ref={boardContainerRef}>
        <div style={styles.levelBadge}>{level}</div>
        <div style={styles.gameBoardGrid}>
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, idx) => (
            <div key={idx} style={styles.boardCell}></div>
          ))}
        </div>
        {boardItems.map((item) => (
          <div
            key={item.id}
            style={styles.itemStyle(item, item.id === selectedItemId)}
            onClick={() => handleItemClick(item.id)}
            onMouseDown={(e) => handleDragStart(e, item)}
            onTouchStart={(e) => handleDragStart(e, item)}
          >
            <div style={styles.iconContainer}>
              {item.isPlayer ? (
                <span style={styles.studentFace}>🧑‍🎓</span>
              ) : (
                <span style={styles.deskLabel}>책상</span>
              )}
            </div>
          </div>
        ))}
        <div style={styles.exitDoor(exitPosition)}></div>
      </div>
    </div>
  );

  if (gameState === "intro") {
    return (
      <div style={styles.gameContainer}>
        <h1 style={styles.gameTitle}>교실 탈출 Ultra 2.3</h1>
        <div style={styles.introContainer}>
          <p style={styles.introText}>학생(🧑‍🎓)을 출구로 탈출시키세요!</p>
          <p style={styles.introText}>
            가로 책상은 좌우로, 세로 책상은 위아래로만 움직입니다.
          </p>
          <button style={styles.startButton} onClick={startGame}>
            게임 시작 (총 {maxLevel} 레벨)
          </button>
        </div>
      </div>
    );
  }

  if (gameState === "complete") {
    return (
      <div style={styles.gameContainer}>
        <h1 style={styles.gameTitle}>레벨 {level} 완료!</h1>
        <div style={styles.messageContainer}>
          <h2 style={{ ...styles.messageTitle, color: "#27ae60" }}>
            CLEAR! 🎉
          </h2>
          <p style={styles.messageText}>
            이동 횟수: {moves} (목표: {idealMoves})
          </p>
          <p style={styles.couponText}>💰 획득 쿠폰: {earnedCoupons}개</p>
          <button
            style={{
              ...styles.actionButton,
              background: "linear-gradient(135deg, #5e72e4 0%, #825ee4 100%)",
            }}
            onClick={() => goToNextLevel(false)}
          >
            {level < maxLevel && allLevelData[level + 1]
              ? `레벨 ${level + 1} 도전`
              : "처음부터 (Lv.1)"}
          </button>
        </div>
      </div>
    );
  }

  if (gameState === "gameOver") {
    return (
      <div style={styles.gameContainer}>
        <h1 style={styles.gameTitle}>타임 오버!</h1>
        <div style={styles.messageContainer}>
          <h2 style={{ ...styles.messageTitle, color: "#c0392b" }}>
            GAME OVER ⏱️
          </h2>
          <button
            style={{
              ...styles.actionButton,
              background: "linear-gradient(135deg, #f39c12 0%, #d35400 100%)",
            }}
            onClick={restartCurrentLevel}
          >
            현재 레벨 재시도
          </button>
          <button
            style={{
              ...styles.actionButton,
              background: "linear-gradient(135deg, #3498db 0%, #2980b9 100%)",
            }}
            onClick={startGame}
          >
            처음부터 (저장된 레벨)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.gameContainer}>
      <h1 style={styles.gameTitle}>
        교실 탈출 Ultra - LV.{level} / {maxLevel}
      </h1>
      <div
        style={{
          ...styles.difficultyIndicator,
          background: styles.getDifficultyBackground(level),
        }}
      >
        난이도: {levelDifficulty}
      </div>
      <div style={styles.gameStats}>
        <div style={styles.statBox}>
          <span style={styles.statLabel}>LEVEL</span>{" "}
          <span style={styles.statValue}>{level}</span>
        </div>
        <div style={styles.statBox}>
          <span style={styles.statLabel}>MOVES</span>{" "}
          <span style={styles.statValue}>{moves}</span>
          <div style={styles.movesGraph}>
            <div style={styles.movesProgress(moves, idealMoves)}></div>
          </div>
        </div>
        <div style={styles.statBox}>
          <span style={styles.statLabel}>TIME</span>{" "}
          <span style={styles.statValue}>{timeLeft}</span>
        </div>
      </div>
      {(powerUpHints > 0 || powerUpTime > 0) && (
        <div style={styles.powerUpContainer}>
          {powerUpHints > 0 && (
            <button
              style={{ ...styles.powerUpButton, className: "power-up-button" }}
              onClick={useHintPowerUp}
              title="힌트"
            >
              <span style={styles.powerUpIcon}>💡</span> 힌트 ({powerUpHints})
            </button>
          )}
          {powerUpTime > 0 && (
            <button
              style={{ ...styles.powerUpButton, className: "power-up-button" }}
              onClick={useTimePowerUp}
              title="시간추가"
            >
              <span style={styles.powerUpIcon}>⏱️</span> 시간 ({powerUpTime})
            </button>
          )}
        </div>
      )}
      {gameState === "playing" && boardItems.length > 0 ? (
        renderBoard()
      ) : (
        <p>레벨 로딩중...</p>
      )}
      {showTutorial && tutorialMessage && (
        <div style={styles.tutorialBox}>{tutorialMessage}</div>
      )}
      <div
        style={{
          display: "flex",
          marginTop: "20px",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "10px",
        }}
      >
        {level > 1 && gameState === "playing" && (
          <button
            style={{ ...styles.actionButton, ...styles.previousButton }}
            onClick={goToPreviousLevel}
          >
            이전 레벨
          </button>
        )}
        <button
          style={{ ...styles.actionButton, background: "#7f8c8d" }}
          onClick={restartCurrentLevel}
        >
          재시작
        </button>
        {level < maxLevel && gameState === "playing" && (
          <button
            style={{ ...styles.actionButton, ...styles.skipButton }}
            onClick={handleSkipLevel}
          >
            다음 레벨 스킵
          </button>
        )}
      </div>
    </div>
  );
};

export default ClassroomEscapeUltra;
