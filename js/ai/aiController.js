import {
  getLegalMovesForPlayer,
  getPendingChoices,
  getPendingBoardTargets,
  getPlayerName,
  resolvePendingBoardChoice,
} from "../core/gameState.js";
import {
  aiThinkingLabel,
  applyRoundMoveOnLiveState,
  autoResolvePending,
  getPendingChooserId,
  normalizeChoice,
} from "./minimax.js";
import { choosePendingWithSampledWorlds, chooseRoundMoveMcts, chooseRoundMovePimc } from "./sampledWorlds.js";
import { runAiShopTurn } from "./shopPolicy.js";

export const EXPERT_LEVEL = 5;

// Every level now plays without seeing your hand.
//
// The search used to run on a clone of the true state, so it read the
// opponent's hand; and because the RNG stream lives inside the state, it also
// knew the order its own bag would come out in. That was never a difficulty
// setting, it was an accident — and it meant the ladder measured "how much does
// it cheat" as much as "how well does it play".
//
// So the whole ladder samples worlds it is entitled to believe in and pools the
// verdicts. Which leaves two dials — how deep it looks in each world, and how
// many worlds it consults — and the bench was blunt about which one works.
//
// Difficulty could not be built out of search, and the bench was emphatic about
// it. Depth 1 -> 2 is a real step and a big one (72-26, p ~ 0). Nothing above it
// is: depth 3 vs depth 2 measured 45-53 over 100 games, depth 4 vs depth 3
// 15-15, a node cap raised from 12000 to 45000 gave 11-9, and sixteen sampled
// worlds against five gave 16-12. The evaluation's useful signal runs out after
// about two plies; searching past that only finds more positions it misjudges.
//
// So every level searches at the depth that actually works, and the ladder is
// built from how often the AI declines to play its best move. That is monotonic
// by construction — a player who blunders less wins more — instead of resting on
// a depth difference the engine cannot cash in.
//
// Worlds are about honesty, not strength: one sampled world already hides your
// hand, and more of them measured no stronger. The top levels sample a few
// anyway because it costs little at this depth and steadies their play.
const LEVEL_PROFILES = {
  1: { determinizations: 1, searchDepth: 2, timeBudgetMs: 800, blunderRate: 0.6 },
  2: { determinizations: 1, searchDepth: 2, timeBudgetMs: 800, blunderRate: 0.38 },
  3: { determinizations: 2, searchDepth: 2, timeBudgetMs: 1200, blunderRate: 0.22 },
  4: { determinizations: 3, searchDepth: 2, timeBudgetMs: 1600, blunderRate: 0.1 },
  5: { determinizations: 4, searchDepth: 2, timeBudgetMs: 2000, blunderRate: 0 },
};

// An explicit config (the bench passes these) always wins over the profile.
export function searchOptionsFor(config) {
  const level = Math.min(EXPERT_LEVEL, Math.max(1, Number(config?.depth) || 2));
  return { ...LEVEL_PROFILES[level], ...config };
}

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
    // Not tied to shop.currentPlayer any more: the human stays pinned to their
    // own side of the shop, so the AI decides purely from whether it has done
    // its own shopping yet this phase.
    return !state.shop.players[config.playerId]?.ready;
  }

  return false;
}

// The shop mutators all act on state.shop.currentPlayer, so borrow it for the
// AI's turn and hand it straight back. Returns true when it actually shopped.
export function runAiShopForSide(state, aiPlayerId) {
  if (state.phase !== "shop" || !state.shop?.players?.[aiPlayerId] || state.shop.players[aiPlayerId].ready) {
    return false;
  }

  const humanPlayerId = aiPlayerId === 1 ? 2 : 1;
  state.shop.currentPlayer = aiPlayerId;
  runAiShopTurn(state, aiPlayerId);
  state.shop.players[aiPlayerId].mode = null;
  state.shop.players[aiPlayerId].combineSelection = [];
  state.shop.players[aiPlayerId].ready = true;
  state.shop.currentPlayer = humanPlayerId;
  return true;
}

export function runAiStep(state, config) {
  if (!shouldAiAct(state, config)) {
    return { state, error: null, note: null };
  }

  if (state.phase === "round") {
    if (state.pendingAction) {
      const fullyResolved = resolvePendingForConfig(state, config);
      if (!fullyResolved) {
        const fallback = resolveOnePendingChoice(state);
        if (!fallback) {
          return { state, error: "AI could not resolve pending rune choice.", note: null };
        }
      }
      return { state, error: null, note: `${getPlayerName(config.playerId)} AI resolved rune effect choice.` };
    }

    const options = searchOptionsFor(config);
    // "mcts" stays selectable so the bench can keep re-testing the claim that it
    // is the weaker engine. Nothing in play selects it.
    const search = config.engine === "mcts" ? chooseRoundMoveMcts : chooseRoundMovePimc;
    const move = search(state, config.playerId, { ...options, searchDepth: getEffectiveDepth(state, options) });
    if (!move) {
      return { state, error: "AI found no legal move.", note: null };
    }

    const played = applyRoundMoveOnLiveState(state, move);
    if (played.error) {
      return { state, error: played.error, note: null };
    }

    if (state.pendingAction) {
      resolvePendingForConfig(state, config);
    }

    const placementNote = move.runeId === "nauthiz" && Number.isInteger(move.row) && Number.isInteger(move.col)
      ? `${getPlayerName(config.playerId)} AI placed Nauthiz at row ${move.row + 1}, column ${move.col + 1}.`
      : `${getPlayerName(config.playerId)} AI played column ${move.column + 1}.`;

    return {
      state,
      error: null,
      note: placementNote,
    };
  }

  if (state.phase === "shop") {
    runAiShopForSide(state, config.playerId);
    return { state, error: null, note: `${getPlayerName(config.playerId)} AI completed shop actions.` };
  }

  return { state, error: null, note: null };
}

// Several runes hand their owner a follow-up choice — which piece Kenaz burns,
// what Teiwaz swaps, which rune Fehu takes back. Resolving those against the
// true state would undo the whole point: the AI would be honest about its move
// and then peek to pick the target. So its own choices go through the same
// sampled worlds. Choices that belong to the OPPONENT still fall through to
// autoResolvePending: there the AI is modelling their decision, not making one.
function resolvePendingForConfig(state, config) {
  const options = searchOptionsFor(config);
  let iterations = 0;
  while (state.pendingAction && iterations < 24) {
    iterations += 1;

    if (getPendingChooserId(state) !== config.playerId) {
      // Not the AI's decision to make honestly or otherwise; let the existing
      // opponent model handle it and stop if it cannot.
      if (!autoResolvePending(state, config.playerId)) {
        return false;
      }
      continue;
    }

    const choice = choosePendingWithSampledWorlds(state, config.playerId, options);
    if (!choice) {
      return false;
    }
    if (resolvePendingBoardChoice(state, normalizeChoice(choice)).error && !resolveOnePendingChoice(state)) {
      return false;
    }
  }

  return !state.pendingAction;
}

// Positions with a wide choice, or a rune that will branch into a follow-up
// choice, cost far more per ply. Giving one of those a ply less keeps a turn
// from stalling — and it matters more now that every ply is paid for once per
// sampled world.
function getEffectiveDepth(state, options) {
  const depth = Number(options.searchDepth) || 2;
  if (depth < 3) {
    return depth;
  }

  const legalCount = getLegalMovesForPlayer(state, options.playerId).length;
  const hand = state.players[options.playerId]?.hand || [];
  const hasPendingHeavyRune = hand.some(
    (rune) =>
      rune.id === "teiwaz" ||
      rune.id === "thurisa" ||
      (rune.id === "gebo" && rune.level >= 2) ||
      (rune.id === "perth" && rune.level >= 2),
  );

  return hasPendingHeavyRune || legalCount > 5 ? depth - 1 : depth;
}

function resolveOnePendingChoice(state) {
  const choices = getPendingChoices(state);
  for (const choice of choices) {
    const result = resolvePendingBoardChoice(state, {
      row: typeof choice.row === "number" ? choice.row : 0,
      col: typeof choice.col === "number" ? choice.col : choice.column,
      column: choice.column,
      awayIndex: choice.awayIndex,
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
