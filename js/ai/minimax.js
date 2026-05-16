import {
  getLegalMovesForPlayer,
  getPendingChoices,
  getPendingBoardTargets,
  getPlayerName,
  playTurn,
  resolvePendingBoardChoice,
  selectRune,
} from "../core/gameState.js";

const WIN_SCORE = 100000;

export function chooseRoundMove(state, aiPlayerId, depth = 2) {
  const legalMoves = getLegalMovesForPlayer(state, state.currentPlayer);
  if (legalMoves.length === 0) {
    return null;
  }

  const search = {
    nodes: 0,
    maxNodes: depth >= 3 ? 12000 : 28000,
  };

  let bestMove = legalMoves[0];
  let bestScore = -Infinity;

  const orderedMoves = orderMoves(legalMoves);
  for (const move of orderedMoves) {
    const nextState = structuredClone(state);
    if (!applyMove(nextState, move, nextState.currentPlayer)) {
      continue;
    }

    const score = minimax(nextState, depth - 1, -Infinity, Infinity, aiPlayerId, search);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

export function applyRoundMoveOnLiveState(state, move) {
  const currentPlayer = state.currentPlayer;
  const selected = selectRune(state, currentPlayer, move.runeInstanceId);
  if (selected.error) {
    return selected;
  }

  const played = playTurn(state, move.column, {
    row: move.row,
    col: move.col,
  });
  return played;
}

export function autoResolvePending(state, aiPlayerId) {
  let iterations = 0;
  while (state.pendingAction && iterations < 24) {
    iterations += 1;
    const choices = orderPendingChoices(state, getPendingChoices(state), aiPlayerId);
    if (choices.length === 0) {
      break;
    }

    const chooserId = getPendingChooserId(state);
    const chooserIsAi = chooserId === aiPlayerId;
    let bestChoice = null;
    let bestScore = chooserIsAi ? -Infinity : Infinity;

    for (const choice of choices) {
      const branch = structuredClone(state);
      const resolved = resolvePendingBoardChoice(branch, normalizeChoice(choice));
      if (resolved.error) {
        continue;
      }

      const search = { nodes: 0, maxNodes: 1200 };
      const score = minimax(branch, 1, -Infinity, Infinity, aiPlayerId, search);
      if (chooserIsAi) {
        if (score > bestScore) {
          bestScore = score;
          bestChoice = choice;
        }
      } else if (score < bestScore) {
        bestScore = score;
        bestChoice = choice;
      }
    }

    if (!bestChoice) {
      let applied = false;
      for (const choice of choices) {
        const fallback = resolvePendingBoardChoice(state, normalizeChoice(choice));
        if (!fallback.error) {
          applied = true;
          break;
        }
      }
      if (!applied) {
        break;
      }
      continue;
    }

    const resolved = resolvePendingBoardChoice(state, normalizeChoice(bestChoice));
    if (resolved.error) {
      let applied = false;
      for (const choice of choices) {
        const fallback = resolvePendingBoardChoice(state, normalizeChoice(choice));
        if (!fallback.error) {
          applied = true;
          break;
        }
      }
      if (!applied) {
        break;
      }
    }
  }

  return !state.pendingAction;
}

function minimax(state, depth, alpha, beta, aiPlayerId, search) {
  search.nodes += 1;
  if (search.nodes >= search.maxNodes) {
    return evaluateState(state, aiPlayerId);
  }

  if (isTerminal(state)) {
    return evaluateState(state, aiPlayerId);
  }

  if (state.pendingAction) {
    const choices = orderPendingChoices(state, getPendingChoices(state), aiPlayerId);
    if (choices.length === 0) {
      return evaluateState(state, aiPlayerId);
    }

    const chooserId = getPendingChooserId(state);
    if (chooserId === aiPlayerId) {
      let maxScore = -Infinity;
      for (const choice of choices) {
        const branch = structuredClone(state);
        const resolved = resolvePendingBoardChoice(branch, normalizeChoice(choice));
        if (resolved.error) {
          continue;
        }
        maxScore = Math.max(maxScore, minimax(branch, depth - 1, alpha, beta, aiPlayerId, search));
        alpha = Math.max(alpha, maxScore);
        if (beta <= alpha) {
          break;
        }
      }
      return maxScore;
    }

    let minScore = Infinity;
    for (const choice of choices) {
      const branch = structuredClone(state);
      const resolved = resolvePendingBoardChoice(branch, normalizeChoice(choice));
      if (resolved.error) {
        continue;
      }
      minScore = Math.min(minScore, minimax(branch, depth - 1, alpha, beta, aiPlayerId, search));
      beta = Math.min(beta, minScore);
      if (beta <= alpha) {
        break;
      }
    }
    return minScore;
  }

  if (depth <= 0) {
    return evaluateState(state, aiPlayerId);
  }

  const moves = getLegalMovesForPlayer(state, state.currentPlayer);
  if (moves.length === 0) {
    return evaluateState(state, aiPlayerId);
  }

  const orderedMoves = orderMoves(moves);

  if (state.currentPlayer === aiPlayerId) {
    let maxScore = -Infinity;
    for (const move of orderedMoves) {
      const branch = structuredClone(state);
      if (!applyMove(branch, move, branch.currentPlayer)) {
        continue;
      }

      maxScore = Math.max(maxScore, minimax(branch, depth - 1, alpha, beta, aiPlayerId, search));
      alpha = Math.max(alpha, maxScore);
      if (beta <= alpha) {
        break;
      }
    }
    return maxScore;
  }

  let minScore = Infinity;
  for (const move of orderedMoves) {
    const branch = structuredClone(state);
    if (!applyMove(branch, move, branch.currentPlayer)) {
      continue;
    }

    minScore = Math.min(minScore, minimax(branch, depth - 1, alpha, beta, aiPlayerId, search));
    beta = Math.min(beta, minScore);
    if (beta <= alpha) {
      break;
    }
  }
  return minScore;
}

function applyMove(state, move, playerId) {
  const selected = selectRune(state, playerId, move.runeInstanceId);
  if (selected.error) {
    return false;
  }

  const played = playTurn(state, move.column, {
    row: move.row,
    col: move.col,
  });
  return !played.error;
}

function isTerminal(state) {
  return state.phase === "game-over" || state.phase === "round-end";
}

function evaluateState(state, aiPlayerId) {
  const opponentId = aiPlayerId === 1 ? 2 : 1;

  if (state.phase === "game-over") {
    if (state.gameWinner === aiPlayerId) {
      return WIN_SCORE;
    }
    if (state.gameWinner === opponentId) {
      return -WIN_SCORE;
    }
    return 0;
  }

  if (state.phase === "round-end") {
    if (state.winner === aiPlayerId) {
      return 5000;
    }
    if (state.winner === opponentId) {
      return -5000;
    }
  }

  const pointDelta = (state.players[aiPlayerId].points - state.players[opponentId].points) * 300;
  const bagDelta = (state.players[aiPlayerId].bag.length - state.players[opponentId].bag.length) * 3;
  const handDelta = (state.players[aiPlayerId].hand.length - state.players[opponentId].hand.length) * 5;
  const centerControl = evaluateCenterControl(state, aiPlayerId) - evaluateCenterControl(state, opponentId);
  const boardPatterns = evaluateBoardWindows(state, aiPlayerId, opponentId);
  const threatPressure = evaluateThreatPressure(state, aiPlayerId, opponentId);

  return pointDelta + bagDelta + handDelta + centerControl + boardPatterns + threatPressure;
}

function evaluateCenterControl(state, playerId) {
  const center = Math.floor(state.columns / 2);
  let score = 0;
  for (let row = 0; row < state.rows; row += 1) {
    if (state.board[row][center] === playerId) {
      score += 6;
    }
  }
  return score;
}

function evaluateBoardWindows(state, aiPlayerId, opponentId) {
  let score = 0;
  const board = state.board;
  const rows = state.rows;
  const cols = state.columns;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols - 3; col += 1) {
      const window = [board[row][col], board[row][col + 1], board[row][col + 2], board[row][col + 3]];
      score += evaluateWindow(window, aiPlayerId, opponentId);
    }
  }

  for (let row = 0; row < rows - 3; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const window = [board[row][col], board[row + 1][col], board[row + 2][col], board[row + 3][col]];
      score += evaluateWindow(window, aiPlayerId, opponentId);
    }
  }

  for (let row = 0; row < rows - 3; row += 1) {
    for (let col = 0; col < cols - 3; col += 1) {
      const window = [
        board[row][col],
        board[row + 1][col + 1],
        board[row + 2][col + 2],
        board[row + 3][col + 3],
      ];
      score += evaluateWindow(window, aiPlayerId, opponentId);
    }
  }

  for (let row = 3; row < rows; row += 1) {
    for (let col = 0; col < cols - 3; col += 1) {
      const window = [
        board[row][col],
        board[row - 1][col + 1],
        board[row - 2][col + 2],
        board[row - 3][col + 3],
      ];
      score += evaluateWindow(window, aiPlayerId, opponentId);
    }
  }

  return score;
}

function evaluateThreatPressure(state, aiPlayerId, opponentId) {
  let score = 0;
  const board = state.board;
  const rows = state.rows;
  const cols = state.columns;

  const scoreThreatWindow = (window) => {
    const aiCount = window.filter((cell) => cell === aiPlayerId).length;
    const oppCount = window.filter((cell) => cell === opponentId).length;
    const emptyCount = window.filter((cell) => cell === 0).length;
    const neutralCount = window.filter((cell) => cell === 3).length;
    if (neutralCount > 0) {
      return;
    }

    if (aiCount === 3 && emptyCount === 1 && oppCount === 0) {
      score += 12;
    }
    if (oppCount === 3 && emptyCount === 1 && aiCount === 0) {
      score -= 14;
    }
  };

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols - 3; col += 1) {
      scoreThreatWindow([board[row][col], board[row][col + 1], board[row][col + 2], board[row][col + 3]]);
    }
  }

  for (let row = 0; row < rows - 3; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      scoreThreatWindow([board[row][col], board[row + 1][col], board[row + 2][col], board[row + 3][col]]);
    }
  }

  for (let row = 0; row < rows - 3; row += 1) {
    for (let col = 0; col < cols - 3; col += 1) {
      scoreThreatWindow([
        board[row][col],
        board[row + 1][col + 1],
        board[row + 2][col + 2],
        board[row + 3][col + 3],
      ]);
    }
  }

  for (let row = 3; row < rows; row += 1) {
    for (let col = 0; col < cols - 3; col += 1) {
      scoreThreatWindow([
        board[row][col],
        board[row - 1][col + 1],
        board[row - 2][col + 2],
        board[row - 3][col + 3],
      ]);
    }
  }

  return score;
}

function evaluateWindow(window, aiPlayerId, opponentId) {
  const aiCount = window.filter((cell) => cell === aiPlayerId).length;
  const oppCount = window.filter((cell) => cell === opponentId).length;
  const emptyCount = window.filter((cell) => cell === 0).length;
  const neutralCount = window.filter((cell) => cell === 3).length;

  // Neutral runes are blockers in classic pattern scoring.
  if (neutralCount > 0) {
    return 0;
  }

  let score = 0;

  if (aiCount === 4) {
    score += 100;
  } else if (aiCount === 3 && emptyCount === 1) {
    score += 8;
  } else if (aiCount === 2 && emptyCount === 2) {
    score += 3;
  }

  if (oppCount === 4) {
    score -= 120;
  } else if (oppCount === 3 && emptyCount === 1) {
    score -= 10;
  } else if (oppCount === 2 && emptyCount === 2) {
    score -= 3;
  }

  return score;
}

function orderMoves(moves) {
  return [...moves].sort((a, b) => {
    const pendingA = createsPendingChoice(a);
    const pendingB = createsPendingChoice(b);
    if (pendingA !== pendingB) {
      return pendingA ? -1 : 1;
    }

    if (a.runeId === "raido" && b.runeId !== "raido") {
      return -1;
    }
    if (b.runeId === "raido" && a.runeId !== "raido") {
      return 1;
    }

    const centerBiasA = Math.abs(3 - a.column);
    const centerBiasB = Math.abs(3 - b.column);
    return centerBiasA - centerBiasB;
  });
}

function createsPendingChoice(move) {
  if (move.runeId === "kenaz") {
    return true;
  }

  if (move.runeId === "gebo" && move.level >= 2) {
    return true;
  }

  if (move.runeId === "teiwaz") {
    return true;
  }

  if (move.runeId === "thurisa") {
    return true;
  }

  if (move.runeId === "fehu") {
    return true;
  }

  if (move.runeId === "perth" && move.level >= 2) {
    return true;
  }

  return false;
}

function orderPendingChoices(state, choices, aiPlayerId) {
  if (!state?.pendingAction || !Array.isArray(choices) || choices.length <= 1) {
    return choices;
  }

  if (state.pendingAction.type !== "kenaz-destroy-target") {
    return choices;
  }

  const chooserId = getPendingChooserId(state);
  const opponentId = aiPlayerId === 1 ? 2 : 1;

  return [...choices].sort((a, b) => {
    const scoreA = scoreKenazDestroyChoice(state, a, chooserId, aiPlayerId, opponentId);
    const scoreB = scoreKenazDestroyChoice(state, b, chooserId, aiPlayerId, opponentId);
    return scoreB - scoreA;
  });
}

function scoreKenazDestroyChoice(state, choice, chooserId, aiPlayerId, opponentId) {
  const row = typeof choice.row === "number" ? choice.row : null;
  const col = typeof choice.col === "number" ? choice.col : null;
  if (row === null || col === null) {
    return -999;
  }

  const owner = state.board?.[row]?.[col];
  const rune = state.boardRunes?.[row]?.[col] || null;
  if (!rune || !owner) {
    return -999;
  }

  let score = 0;

  if (owner === 3) {
    score += 6;
  } else if (owner === chooserId) {
    score -= 14;
  } else {
    score += 12;
  }

  if (rune.id === "eihwaz") {
    score += owner === chooserId ? -8 : 8;
  }

  if (rune.id === "berkana") {
    score += owner === chooserId ? -4 : 5;
  }

  if (rune.id === "laguz") {
    score += owner === chooserId ? -5 : 4;
  }

  if (rune.id === "kenaz") {
    score += owner === chooserId ? -4 : 4;
  }

  if (owner === opponentId && chooserId === aiPlayerId) {
    score += 2;
  }

  return score;
}

function normalizeChoice(choice) {
  return {
    row: typeof choice.row === "number" ? choice.row : 0,
    col: typeof choice.col === "number" ? choice.col : choice.column,
    column: choice.column,
    awayIndex: choice.awayIndex,
  };
}

function getPendingChooserId(state) {
  const action = state.pendingAction;
  if (!action) {
    return state.currentPlayer;
  }

  if (typeof action.playerId === "number") {
    return action.playerId;
  }

  if (action.turnContext && typeof action.turnContext.playerId === "number") {
    return action.turnContext.playerId;
  }

  return state.currentPlayer;
}

export function describeAiMove(move) {
  if (!move) {
    return "No legal move found.";
  }

  if (move.runeId === "nauthiz" && Number.isInteger(move.row) && Number.isInteger(move.col)) {
    return `Rune ${move.runeId} at row ${move.row + 1}, column ${move.col + 1}`;
  }

  return `Rune ${move.runeId} in column ${move.column + 1}`;
}

export function aiThinkingLabel(playerId) {
  return `${getPlayerName(playerId)} AI is thinking...`;
}
