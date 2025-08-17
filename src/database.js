// This is a mock database utility that simulates database initialization and operations
// In a real application, this would connect to a real database

/**
 * Initialize the database with default values if not already set
 */
export const initializeDatabase = () => {
  console.log("Initializing database...");

  // Check if the database is already initialized
  if (!localStorage.getItem("dbInitialized")) {
    console.log("First time initialization...");

    // Initialize items
    const defaultItems = [
      {
        id: 1,
        name: "연필",
        description: "과제 제출 시 사용할 수 있는 기본 아이템",
        icon: "✏️",
        price: 100,
        effect: "과제 제출 시 사용",
        available: true,
      },
      {
        id: 2,
        name: "지우개",
        description: "실수를 지울 수 있는 필수 아이템",
        icon: "🧽",
        price: 50,
        effect: "실수 하나 지우기",
        available: true,
      },
      {
        id: 3,
        name: "노트",
        description: "학습 내용을 기록할 수 있는 아이템",
        icon: "📓",
        price: 200,
        effect: "학습 기록",
        available: true,
      },
      {
        id: 4,
        name: "계산기",
        description: "복잡한 계산을 도와주는 아이템",
        icon: "🧮",
        price: 500,
        effect: "계산 도움",
        available: true,
      },
      {
        id: 5,
        name: "고급 펜",
        description: "과제 제출 시 추가 점수를 얻을 수 있는 아이템",
        icon: "🖋️",
        price: 1000,
        effect: "과제 제출 시 추가 점수",
        available: true,
      },
    ];

    localStorage.setItem("items", JSON.stringify(defaultItems));

    // Initialize tasks
    const defaultTasks = [
      {
        id: 1,
        title: "기본 경제 개념 학습",
        description: "기본적인 경제 용어와 개념을 학습하세요.",
        reward: 100,
        completed: false,
        deadline: addDays(new Date(), 3), // 3일 후 마감
      },
      {
        id: 2,
        title: "예산 계획 세우기",
        description: "한 달 예산 계획을 세워보세요.",
        reward: 200,
        completed: false,
        deadline: addDays(new Date(), 5), // 5일 후 마감
      },
      {
        id: 3,
        title: "저축 목표 설정",
        description: "저축 목표와 전략을 수립하세요.",
        reward: 150,
        completed: false,
        deadline: addDays(new Date(), 7), // 7일 후 마감
      },
    ];

    localStorage.setItem("tasks", JSON.stringify(defaultTasks));

    // Initialize transactions
    const defaultTransactions = [
      {
        id: 1,
        date: new Date().toISOString(),
        type: "income",
        amount: 1000,
        description: "초기 지급금",
        category: "system",
      },
    ];

    localStorage.setItem("transactions", JSON.stringify(defaultTransactions));

    // Mark database as initialized
    localStorage.setItem("dbInitialized", "true");

    console.log("Database initialization complete.");
  } else {
    console.log("Database already initialized.");
  }
};

/**
 * Helper function to add days to a date
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString();
}

/**
 * Add a new transaction to the database
 */
export const addTransaction = (transaction) => {
  try {
    // Get existing transactions
    const transactionsJson = localStorage.getItem("transactions");
    const transactions = transactionsJson ? JSON.parse(transactionsJson) : [];

    // Add new transaction with ID
    const newTransaction = {
      ...transaction,
      id:
        transactions.length > 0
          ? Math.max(...transactions.map((t) => t.id)) + 1
          : 1,
      date: new Date().toISOString(),
    };

    transactions.push(newTransaction);

    // Save back to localStorage
    localStorage.setItem("transactions", JSON.stringify(transactions));

    return newTransaction;
  } catch (error) {
    console.error("Error adding transaction:", error);
    return null;
  }
};

/**
 * Get user transactions
 */
export const getUserTransactions = (userId, limit = null) => {
  try {
    // Get all transactions
    const transactionsJson = localStorage.getItem("transactions");
    const transactions = transactionsJson ? JSON.parse(transactionsJson) : [];

    // Filter by user ID if specified
    // In this mock version, we don't filter by user ID as we don't have that field

    // Sort by date (newest first)
    const sortedTransactions = transactions.sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    // Limit if specified
    if (limit && limit > 0) {
      return sortedTransactions.slice(0, limit);
    }

    return sortedTransactions;
  } catch (error) {
    console.error("Error getting transactions:", error);
    return [];
  }
};

/**
 * Get user tasks
 */
export const getUserTasks = (userId, completed = null) => {
  try {
    // Get all tasks
    const tasksJson = localStorage.getItem("tasks");
    const tasks = tasksJson ? JSON.parse(tasksJson) : [];

    // Filter by completion status if specified
    if (completed !== null) {
      return tasks.filter((task) => task.completed === completed);
    }

    return tasks;
  } catch (error) {
    console.error("Error getting tasks:", error);
    return [];
  }
};

/**
 * Complete a task
 */
export const completeTask = (taskId) => {
  try {
    // Get all tasks
    const tasksJson = localStorage.getItem("tasks");
    const tasks = tasksJson ? JSON.parse(tasksJson) : [];

    // Find the task
    const taskIndex = tasks.findIndex((task) => task.id === taskId);
    if (taskIndex === -1) return false;

    // Mark as completed
    tasks[taskIndex].completed = true;

    // Save back to localStorage
    localStorage.setItem("tasks", JSON.stringify(tasks));

    return true;
  } catch (error) {
    console.error("Error completing task:", error);
    return false;
  }
};
