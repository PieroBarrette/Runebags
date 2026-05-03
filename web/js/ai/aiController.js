import {
  getLegalMovesForPlayer,
  getPendingChoices,
  getPendingBoardTargets,
  getPlayerName,
  resolvePendingBoardChoice,
  switchShopPlayer,
} from "../core/gameState.js";
import { aiThinkingLabel, applyRoundMoveOnLiveState, autoResolvePending, chooseRoundMove } from "./minimax.js";
import { runAiShopTurn } from "./shopPolicy.js";

export function createAiConfig() {
  return {
    enabled: false,
    playerId: 2,
    depth: 2,
  };
}

export function shouldAiAct(state, config) {
  if (!config.enabled || state.phase === "game-over") {
    return false;
  }

  if (state.phase === "round") {
    return state.currentPlayer === config.playerId;
  }

  if (state.phase === "shop") {
    return state.shop.currentPlayer === config.playerId;
  }

  return false;
}

export function runAiStep(state, config) {
  if (!shouldAiAct(state, config)) {
    return { state, error: null, note: null };
  }

  if (state.phase === "round") {
    if (state.pendingAction) {
      const fullyResolved = autoResolvePending(state, config.playerId);
      if (!fullyResolved) {
        const fallback = resolveOnePendingChoice(state);
        if (!fallback) {
          return { state, error: "AI could not resolve pending rune choice.", note: null };
        }
      }
      return { state, error: null, note: `${getPlayerName(config.playerId)} AI resolved rune effect choice.` };
    }

    const depth = getEffectiveDepth(state, config);
    const move = chooseRoundMove(state, config.playerId, depth);
    if (!move) {
      return { state, error: "AI found no legal move.", note: null };
    }

    const played = applyRoundMoveOnLiveState(state, move);
    if (played.error) {
      return { state, error: played.error, note: null };
    }

    if (state.pendingAction) {
      autoResolvePending(state, config.playerId);
    }

    return {
      state,
      error: null,
      note: `${getPlayerName(config.playerId)} AI played column ${move.column + 1}.`,
    };
  }

  if (state.phase === "shop") {
    runAiShopTurn(state, config.playerId);

    if (state.shop.currentPlayer === config.playerId) {
      const switched = switchShopPlayer(state);
      if (switched.error) {
        return { state, error: switched.error, note: null };
      }
    }

    return { state, error: null, note: `${getPlayerName(config.playerId)} AI completed shop actions.` };
  }

  return { state, error: null, note: null };
}

function getEffectiveDepth(state, config) {
  const legalCount = getLegalMovesForPlayer(state, config.playerId).length;
  const hand = state.players[config.playerId]?.hand || [];
  const hasPendingHeavyRune = hand.some(
    (rune) =>
      rune.id === "teiwaz" ||
      rune.id === "thurisa" ||
      (rune.id === "gebo" && rune.level >= 2) ||
      (rune.id === "perth" && rune.level >= 2),
  );

  if (config.depth >= 3 && (hasPendingHeavyRune || legalCount > 5)) {
    return config.depth - 1;
  }

  return config.depth;
}

function resolveOnePendingChoice(state) {
  const choices = getPendingChoices(state);
  for (const choice of choices) {
    const result = resolvePendingBoardChoice(state, {
      row: typeof choice.row === "number" ? choice.row : 0,
      col: typeof choice.col === "number" ? choice.col : choice.column,
      column: choice.column,
    });
    if (!result.error) {
      return true;
    }
  }

  return false;
}

export function getAiThinkingText(state, config) {
  if (!config.enabled) {
    return "";
  }

  if (state.phase === "round" && state.currentPlayer === config.playerId) {
    if (state.pendingAction) {
      const targets = getPendingBoardTargets(state);
      return `${aiThinkingLabel(config.playerId)} Resolving ${targets.mode || "effect"} choices...`;
    }
    return aiThinkingLabel(config.playerId);
  }

  if (state.phase === "shop" && state.shop.currentPlayer === config.playerId) {
    return `${getPlayerName(config.playerId)} AI is planning shop choices...`;
  }

  return "";
}

export function setAiSettings(config, enabled, playerId, depth) {
  config.enabled = enabled;
  config.playerId = playerId;
  config.depth = depth;
  return config;
}

export function listPendingChoices(state) {
  return getPendingChoices(state);
}
