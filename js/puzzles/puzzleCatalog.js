import { createInitialState } from "../core/gameState.js";
import { createRuneInstance } from "../runes/runeCatalog.js";

export const PUZZLE_CATALOG = [
  {
    id: "puzzle-001",
    title: "Straight Finish",
    objective: "Black to play. Build a horizontal line of 4.",
    recommendedColumn: 4,
    rewardPoints: 40,
    currentPlayer: 1,
    columns: {
      0: [2],
      1: [1],
      2: [1],
      3: [1],
      5: [2],
    },
  },
  {
    id: "puzzle-002",
    title: "White Mirror",
    objective: "White to play. Complete the horizontal line.",
    recommendedColumn: 5,
    rewardPoints: 45,
    currentPlayer: 2,
    columns: {
      1: [1],
      2: [2],
      3: [2],
      4: [2],
      6: [1],
    },
  },
  {
    id: "puzzle-003",
    title: "Pillar Strike",
    objective: "Black to play. Complete the vertical stack.",
    recommendedColumn: 3,
    rewardPoints: 45,
    currentPlayer: 1,
    columns: {
      2: [1, 1, 1],
      4: [2, 2],
    },
  },
  {
    id: "puzzle-004",
    title: "Silent Ladder",
    objective: "White to play. Finish the vertical line.",
    recommendedColumn: 6,
    rewardPoints: 50,
    currentPlayer: 2,
    columns: {
      5: [2, 2, 2],
      0: [1, 1],
    },
  },
  {
    id: "puzzle-005",
    title: "Diagonal Spark",
    objective: "Black to play. Form a rising diagonal of 4.",
    recommendedColumn: 4,
    rewardPoints: 55,
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
    objective: "White to play. Build the rising diagonal.",
    recommendedColumn: 5,
    rewardPoints: 60,
    currentPlayer: 2,
    columns: {
      1: [2],
      2: [1, 2],
      3: [1, 1, 2],
      4: [1, 1, 1],
      0: [2],
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
