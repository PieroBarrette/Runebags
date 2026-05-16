import { createInitialState } from "../core/gameState.js";
import { createRuneInstance } from "../runes/runeCatalog.js";

export const PUZZLE_CATALOG = [
  {
    id: "puzzle-001",
    title: "Straight Finish",
    difficulty: "easy",
    objective: "Black to play. Build a horizontal line of 4.",
    recommendedColumn: 3,
    rewardPoints: 25,
    currentPlayer: 1,
    columns: {
      1: [1],
      2: [1],
      0: [1],
      5: [2],
    },
  },
  {
    id: "puzzle-002",
    title: "White Mirror",
    difficulty: "easy",
    objective: "White to play. Complete the horizontal line.",
    recommendedColumn: 4,
    rewardPoints: 25,
    currentPlayer: 2,
    columns: {
      0: [1],
      2: [2],
      3: [2],
      1: [2],
      6: [1],
    },
  },
  {
    id: "puzzle-003",
    title: "Pillar Strike",
    difficulty: "easy",
    objective: "Black to play. Complete the vertical stack.",
    recommendedColumn: 2,
    rewardPoints: 28,
    currentPlayer: 1,
    columns: {
      2: [1, 1, 1],
      4: [2, 2],
    },
  },
  {
    id: "puzzle-004",
    title: "Silent Ladder",
    difficulty: "easy",
    objective: "White to play. Finish the vertical line.",
    recommendedColumn: 5,
    rewardPoints: 28,
    currentPlayer: 2,
    columns: {
      5: [2, 2, 2],
      0: [1, 1],
    },
  },
  {
    id: "puzzle-005",
    title: "Diagonal Spark",
    difficulty: "easy",
    objective: "Black to play. Form a rising diagonal of 4.",
    recommendedColumn: 4,
    rewardPoints: 30,
    currentPlayer: 1,
    columns: {
      0: [1],
      1: [2, 1],
      2: [2, 2, 1],
      3: [2, 2, 2],
      5: [1],
    },
  },
  {
    id: "puzzle-006",
    title: "Diagonal Echo",
    difficulty: "easy",
    objective: "White to play. Build the rising diagonal.",
    recommendedColumn: 5,
    rewardPoints: 30,
    currentPlayer: 2,
    columns: {
      1: [2],
      2: [1, 2],
      3: [1, 1, 2],
      4: [1, 1, 1],
      0: [2],
    },
  },
  {
    id: "puzzle-007",
    title: "Edge Pressure",
    difficulty: "easy",
    objective: "Black to play. Win on the left edge.",
    recommendedColumn: 0,
    rewardPoints: 22,
    currentPlayer: 1,
    columns: {
      1: [1],
      2: [1],
      3: [1],
      5: [2, 2],
    },
  },
  {
    id: "puzzle-008",
    title: "Rim Counter",
    difficulty: "easy",
    objective: "White to play. Complete a right-edge line.",
    recommendedColumn: 6,
    rewardPoints: 22,
    currentPlayer: 2,
    columns: {
      3: [2],
      4: [2],
      5: [2],
      0: [1, 1],
    },
  },
  {
    id: "puzzle-009",
    title: "Forked Run",
    difficulty: "medium",
    objective: "Black to play. Take the center to finish horizontally.",
    recommendedColumn: 3,
    rewardPoints: 48,
    currentPlayer: 1,
    columns: {
      1: [1],
      2: [1],
      4: [1],
      0: [2, 2],
      6: [2],
    },
  },
  {
    id: "puzzle-010",
    title: "Mirror Fork",
    difficulty: "medium",
    objective: "White to play. Finish the center lane.",
    recommendedColumn: 3,
    rewardPoints: 48,
    currentPlayer: 2,
    columns: {
      1: [2],
      2: [2],
      4: [2],
      0: [1],
      5: [1, 1],
    },
  },
  {
    id: "puzzle-011",
    title: "Tower Bend",
    difficulty: "medium",
    objective: "Black to play. Finish a top-side vertical stack.",
    recommendedColumn: 4,
    rewardPoints: 52,
    currentPlayer: 1,
    columns: {
      4: [1, 1, 1],
      3: [2, 2, 2],
      2: [1],
    },
  },
  {
    id: "puzzle-012",
    title: "White Tower",
    difficulty: "medium",
    objective: "White to play. Close the high column stack.",
    recommendedColumn: 2,
    rewardPoints: 52,
    currentPlayer: 2,
    columns: {
      2: [2, 2, 2],
      1: [1, 1],
      5: [2],
    },
  },
  {
    id: "puzzle-013",
    title: "Step Diagonal",
    difficulty: "medium",
    objective: "Black to play. Complete the slanted chain.",
    recommendedColumn: 5,
    rewardPoints: 56,
    currentPlayer: 1,
    columns: {
      2: [1],
      3: [2, 1],
      4: [2, 2, 1],
      5: [2, 2, 2],
      0: [2],
    },
  },
  {
    id: "puzzle-014",
    title: "Echo Diagonal",
    difficulty: "medium",
    objective: "White to play. Finish the mirrored diagonal.",
    recommendedColumn: 1,
    rewardPoints: 56,
    currentPlayer: 2,
    columns: {
      4: [2],
      3: [1, 2],
      2: [1, 1, 2],
      1: [1, 1, 1],
      6: [2],
    },
  },
  {
    id: "puzzle-015",
    title: "Split Horizon",
    difficulty: "medium",
    objective: "Black to play. Use the gap to finish the row.",
    recommendedColumn: 2,
    rewardPoints: 60,
    currentPlayer: 1,
    columns: {
      0: [1],
      1: [1],
      3: [1],
      4: [2, 2],
      5: [2],
    },
  },
  {
    id: "puzzle-016",
    title: "Pressure Valve",
    difficulty: "hard",
    objective: "Black to play. Solve the deep diagonal under pressure.",
    recommendedColumn: 3,
    rewardPoints: 95,
    currentPlayer: 1,
    columns: {
      0: [1, 2],
      1: [2, 1, 2],
      2: [2, 2, 1, 2],
      3: [2, 2, 2, 2],
      5: [1, 1],
    },
  },
  {
    id: "puzzle-017",
    title: "White Valve",
    difficulty: "hard",
    objective: "White to play. Break through with a deep diagonal.",
    recommendedColumn: 4,
    rewardPoints: 95,
    currentPlayer: 2,
    columns: {
      6: [2, 1],
      5: [1, 2, 1],
      4: [1, 1, 2, 1],
      3: [1, 1, 1, 1],
      0: [2, 2],
    },
  },
  {
    id: "puzzle-018",
    title: "Anvil Gate",
    difficulty: "hard",
    objective: "Black to play. Vertical finish in a crowded board.",
    recommendedColumn: 6,
    rewardPoints: 105,
    currentPlayer: 1,
    columns: {
      6: [1, 1, 1],
      5: [2, 2, 1, 2],
      4: [2, 1, 2],
      3: [1, 2],
    },
  },
  {
    id: "puzzle-019",
    title: "Crimson Gate",
    difficulty: "hard",
    objective: "White to play. Secure the winning vertical lane.",
    recommendedColumn: 0,
    rewardPoints: 105,
    currentPlayer: 2,
    columns: {
      0: [2, 2, 2],
      1: [1, 1, 2, 1],
      2: [1, 2, 1],
      3: [2, 1],
    },
  },
  {
    id: "puzzle-020",
    title: "Final Weave",
    difficulty: "hard",
    objective: "Black to play. Resolve the final weave with one move.",
    recommendedColumn: 2,
    rewardPoints: 120,
    currentPlayer: 1,
    columns: {
      0: [2, 1, 2],
      1: [1, 2, 1],
      2: [2, 2, 2],
      3: [1, 1],
      4: [2, 1, 2],
      5: [1, 2],
    },
  },
];

export function getPuzzleById(id) {
  return PUZZLE_CATALOG.find((puzzle) => puzzle.id === id) || null;
}

export function getPuzzleCount() {
  return PUZZLE_CATALOG.length;
}

export function buildPuzzleState(puzzle, options = {}) {
  const state = createInitialState(options);

  state.phase = "round";
  state.roundNumber = 1;
  state.turnNumber = 1;
  state.pointPoolRemaining = 1;
  state.tieRemovedPoints = 0;
  state.winner = null;
  state.winningLine = null;
  state.gameWinner = null;
  state.gameWinnerReason = null;
  state.isDraw = false;
  state.pendingAction = null;
  state.roundAwayRunes = [];
  state.nextTurnConstraints = { 1: null, 2: null };

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      state.board[row][col] = 0;
      state.boardRunes[row][col] = null;
    }
  }

  for (const [colKey, stack] of Object.entries(puzzle.columns || {})) {
    const col = Number(colKey);
    if (!Number.isInteger(col) || col < 0 || col >= state.columns || !Array.isArray(stack)) {
      continue;
    }

    stack.forEach((owner, depth) => {
      const row = state.rows - 1 - depth;
      if (row < 0) {
        return;
      }
      state.board[row][col] = owner === 2 ? 2 : owner === 3 ? 3 : 1;
    });
  }

  const activePlayer = puzzle.currentPlayer === 2 ? 2 : 1;
  const opponent = activePlayer === 1 ? 2 : 1;

  const activeRune = createRuneInstance("basic", 1);
  const opponentRune = createRuneInstance("basic", 1);

  state.players[activePlayer].hand = activeRune ? [activeRune] : [];
  state.players[activePlayer].bag = [];
  state.players[activePlayer].discard = [];
  state.players[activePlayer].selectedRuneInstanceId = null;

  state.players[opponent].hand = opponentRune ? [opponentRune] : [];
  state.players[opponent].bag = [];
  state.players[opponent].discard = [];
  state.players[opponent].selectedRuneInstanceId = null;

  state.players[1].points = 0;
  state.players[2].points = 0;
  state.currentPlayer = activePlayer;
  state.log = [
    `Puzzle loaded: ${puzzle.title}`,
    puzzle.objective,
    `Hint: column ${Number(puzzle.recommendedColumn) + 1}`,
  ];

  return state;
}
