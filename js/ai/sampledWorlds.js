// Search over sampled worlds — the level 5 opponent.
//
// The alpha-beta levels cheat, and not on purpose. The search runs on a clone of
// the true state, so it reads the opponent's hand; and since the RNG stream
// lives inside the state, the clone carries the real stream, so the AI also
// knows the exact order its own bag will come out in. It plays around cards it
// has no business knowing.
//
// Determinization is the standard answer for a game with hidden information:
// instead of searching the one true world, sample several worlds that are
// consistent with what the AI can legitimately see — the opponent's hand put
// back and redealt, both bags reshuffled onto a fresh random stream — search
// each one, and play the move the samples agree on. The AI stops being
// clairvoyant, and gains something for it, because a move that only works
// against one specific opponent hand loses the vote to a move that works
// against most of them.
//
// That much held up. The choice of search inside each world did not: this began
// as MCTS, and MCTS measured worse than the alpha-beta it was meant to replace —
// level for level, and at a hundred times the thinking time. Both engines are
// here, `chooseRoundMovePimc` (used) and `chooseRoundMoveMcts` (kept so the
// comparison can be re-run), with the numbers recorded at each one.
import { getLegalMovesForPlayer, getPendingChoices, playTurn, resolvePendingBoardChoice, selectRune } from "../core/gameState.js";
import { rngFor } from "../core/rng.js";
import { shuffle } from "../runes/bagEngine.js";
import {
  cloneForSearch,
  evaluateState,
  getPendingChooserId,
  normalizeChoice,
  orderMoves,
  orderPendingChoices,
  scoreRootMoves,
} from "./minimax.js";

export const SEARCH_DEFAULTS = {
  // Enough worlds for a vote to mean something, few enough that a move still
  // lands in a couple of seconds. Per-world search quality matters more than
  // sample count, so the budget goes into depth before it goes into opinions.
  // aiController's LEVEL_PROFILES override this per difficulty.
  determinizations: 3,
  // 0 = let minimax pick its own cap from the depth.
  maxNodes: 0,
  // 0 = always play the best move found. See pickWithBlunderRate.
  blunderRate: 0,
  timeBudgetMs: 2000,
  // Depth of the per-world alpha-beta search (determinized engine only).
  searchDepth: 4,
  // A safety stop, not a budget: time is what governs, and a low cap here
  // silently throttles the search long before the clock runs out.
  maxIterations: 200000,
  // Values live in [-1, 1], so the usual sqrt(2) is far too keen to explore.
  // Tuned down from 0.9, which spent the budget confirming one move it already
  // liked: root visits came out 16957/55/54/53 instead of a real distribution.
  exploration: 0.35,
  // Progressive widening: a node earns its next child rather than being handed
  // all thirty at once. Without it a budget this size never gets past ply two;
  // too generous and the tree is a wide, shallow fan. These values reach depth
  // 8 where base 2 / exponent 0.5 stalled at 5.
  wideningBase: 1,
  wideningExponent: 0.3,
  // When every path from here is terminal the tree cannot grow, and iterations
  // become free no-ops that walk to a decided leaf and re-count it — 200k of
  // them in a budget that should have bought a few thousand real ones. Give up
  // on a saturated world and spend what is left on the next sample instead.
  barrenIterationLimit: 512,
};

const POINT_POOL_TOTAL = 10;
// Keeps ordinary positions inside the responsive part of tanh instead of
// saturating everything to ±1.
const POSITION_SCALE = 900;
// A round win is worth more than any board position and less than a game win,
// and the leaf values have to keep that order for the search to respect it.
const ROUND_RESULT_VALUE = 0.6;

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function opponentOf(playerId) {
  return playerId === 1 ? 2 : 1;
}

function majorityThreshold(state) {
  return Math.floor((POINT_POOL_TOTAL - (state.tieRemovedPoints || 0)) / 2) + 1;
}

// Sample one world consistent with what the AI is entitled to know.
//
// Its own hand is real and stays untouched. The opponent's hand goes back in
// with their bag and is redealt, so this world's opponent holds a plausible hand
// rather than the actual one. Both bags are reshuffled on a stream salted per
// world, which is what stops the AI from knowing its own next draw.
export function determinize(state, aiPlayerId, salt) {
  const world = cloneForSearch(state);
  world.rngState = (world.rngState ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  const random = rngFor(world);

  const opponentId = opponentOf(aiPlayerId);
  const opponent = world.players[opponentId];
  const handSize = opponent.hand.length;
  const pool = shuffle([...opponent.bag, ...opponent.hand], random);
  opponent.hand = pool.slice(0, handSize);
  opponent.bag = pool.slice(handSize);
  // The rune they had selected almost certainly is not in the redealt hand.
  opponent.selectedRuneInstanceId = null;

  const self = world.players[aiPlayerId];
  self.bag = shuffle([...self.bag], random);

  return world;
}

// A turn is either "play a rune" or "answer a rune effect", and the search has
// to treat both as decisions — several effects hand the choice to the opponent.
function listActions(state, aiPlayerId) {
  if (state.pendingAction) {
    const choices = orderPendingChoices(state, getPendingChoices(state), aiPlayerId);
    return choices.map((choice) => ({ kind: "choice", choice }));
  }
  return orderMoves(getLegalMovesForPlayer(state, state.currentPlayer)).map((move) => ({ kind: "move", move }));
}

function applyAction(state, action) {
  if (action.kind === "choice") {
    return !resolvePendingBoardChoice(state, normalizeChoice(action.choice)).error;
  }

  const move = action.move;
  if (selectRune(state, state.currentPlayer, move.runeInstanceId).error) {
    return false;
  }
  return !playTurn(state, move.column, { row: move.row, col: move.col }).error;
}

// Stable across worlds because the AI's own hand is never redealt — which is
// what lets separate determinizations vote on the same move.
function moveKey(move) {
  return `${move.runeInstanceId}|${move.column}|${move.row ?? ""}|${move.col ?? ""}`;
}

function isTerminal(state) {
  return state.phase === "game-over" || state.phase === "round-end";
}

// Ordered so the search can never prefer a board position to winning the round,
// or winning the round to winning the game.
function leafValue(state, aiPlayerId) {
  const opponentId = opponentOf(aiPlayerId);

  if (state.phase === "game-over") {
    if (!state.gameWinner) {
      return 0;
    }
    return state.gameWinner === aiPlayerId ? 1 : -1;
  }

  if (state.phase === "round-end") {
    // Points are already awarded by the time the phase flips, so the race is
    // readable straight off the state.
    const need = majorityThreshold(state);
    const lead = (state.players[aiPlayerId].points - state.players[opponentId].points) / need;
    const round = state.winner === aiPlayerId ? 1 : state.winner === opponentId ? -1 : 0;
    return clamp(ROUND_RESULT_VALUE * round + 0.3 * lead, -0.95, 0.95);
  }

  return 0.5 * Math.tanh(evaluateState(state, aiPlayerId) / POSITION_SCALE);
}

function createNode(state, parent, action, aiPlayerId) {
  const terminal = isTerminal(state);
  return {
    state,
    parent,
    action,
    terminal,
    actor: terminal ? null : state.pendingAction ? getPendingChooserId(state) : state.currentPlayer,
    untried: terminal ? [] : listActions(state, aiPlayerId),
    children: [],
    visits: 0,
    total: 0,
    leaf: leafValue(state, aiPlayerId),
  };
}

function canWiden(node, options, isRoot) {
  if (node.untried.length === 0) {
    return false;
  }
  // Every legal move at the root gets looked at at least once. Widening is for
  // depth, where the budget genuinely has to be rationed; applying it to the
  // root just means never considering some of your own moves.
  if (isRoot) {
    return true;
  }
  const allowed = Math.ceil(options.wideningBase * node.visits ** options.wideningExponent);
  return node.children.length < Math.max(1, allowed);
}

function selectChild(node, aiPlayerId, options) {
  // Values are stored from the AI's point of view throughout, so a node where
  // the opponent chooses simply picks the child that minimises them.
  const sign = node.actor === aiPlayerId ? 1 : -1;
  const logVisits = Math.log(Math.max(2, node.visits));

  let best = null;
  let bestScore = -Infinity;
  for (const child of node.children) {
    const score = sign * (child.total / child.visits) + options.exploration * Math.sqrt(logVisits / child.visits);
    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }
  return best;
}

function expand(node, aiPlayerId) {
  // untried is heuristically ordered, so the earliest expansions are the moves
  // most worth looking at first.
  while (node.untried.length > 0) {
    const action = node.untried.shift();
    const child = cloneForSearch(node.state);
    if (!applyAction(child, action)) {
      continue; // Illegal once actually applied; drop it and try the next.
    }
    const childNode = createNode(child, node, action, aiPlayerId);
    node.children.push(childNode);
    return childNode;
  }
  return null;
}

function runSearch(rootState, aiPlayerId, options, deadline) {
  const root = createNode(rootState, null, null, aiPlayerId);
  let barren = 0;

  for (let iteration = 0; iteration < options.maxIterations; iteration += 1) {
    // Checking the clock every iteration is affordable next to a clone.
    if (Date.now() >= deadline || barren >= options.barrenIterationLimit) {
      break;
    }

    let node = root;
    const path = [root];
    let grew = false;

    while (!node.terminal) {
      if (canWiden(node, options, node === root)) {
        const child = expand(node, aiPlayerId);
        if (!child) {
          break; // Every remaining action was illegal once applied.
        }
        node = child;
        path.push(node);
        grew = true;
        break;
      }

      const child = selectChild(node, aiPlayerId, options);
      if (!child) {
        break;
      }
      node = child;
      path.push(node);
    }

    // Only an iteration that ends on a decided leaf without growing the tree is
    // wasted. Ending on a live node that is merely not allowed another child
    // yet is normal — widening deliberately makes a node wait, and counting
    // that as waste stopped whole searches after a couple of hundred passes.
    barren = grew || !node.terminal ? 0 : barren + 1;

    for (const visited of path) {
      visited.visits += 1;
      visited.total += node.leaf;
    }
  }

  return root;
}

// Determinized alpha-beta: the same sampled worlds, searched with the engine
// that suits this game.
//
// Benched at two seconds a move — a hundred times what level 2 spends — MCTS
// drew level with depth 2 (9-11 over 20 games, p = 0.82) and was buried by
// depth 4 (1-12). That is the known shape of the problem rather than a
// surprise: RuneBags is won on four in a row, so the tactics are sharp and
// shallow, and a full-width search that scores every move two plies deep does
// not miss the move that ends the round — while a sampling search spreading a
// few thousand iterations over a branching factor of thirty regularly does.
// MCTS earns its keep when a learned policy tells it where to look; with a
// handcrafted evaluation and no policy it is a worse use of the same
// milliseconds.
//
// So keep what was load-bearing — sampling worlds the AI is entitled to believe
// in, and pooling their verdicts — and search each one with alpha-beta.
//
// Per-world scores are CLAMPED before they are added, not squashed through a
// tanh. Both stop one world's forced win from carrying the vote on its own —
// PIMC's classic failure, where a move that beats one possible hand and loses to
// the other three still wins the ballot. But tanh also flattened everything
// above a round win to the same 1.0, so several round-winning moves became
// indistinguishable and the tie-break fell to move order. Clamping keeps the
// full resolution of ordinary positional scores, which is where alpha-beta's
// judgement actually lives, and truncates only the jackpots.
const WORLD_SCORE_CLAMP = 2000;

function poolScore(score) {
  return Math.max(-WORLD_SCORE_CLAMP, Math.min(WORLD_SCORE_CLAMP, score));
}

export function chooseRoundMovePimc(state, aiPlayerId, config = {}) {
  const options = { ...SEARCH_DEFAULTS, ...config };
  const depth = Number(options.searchDepth) || SEARCH_DEFAULTS.searchDepth;
  const legalMoves = getLegalMovesForPlayer(state, state.currentPlayer);
  if (legalMoves.length === 0) {
    return null;
  }
  if (legalMoves.length === 1) {
    return legalMoves[0];
  }

  const endsAt = Date.now() + options.timeBudgetMs;
  const votes = new Map();
  let worldsSearched = 0;

  for (let world = 0; world < options.determinizations; world += 1) {
    const sampled = determinize(state, aiPlayerId, world);
    for (const { move, score } of scoreRootMoves(sampled, aiPlayerId, depth, options.maxNodes)) {
      const key = moveKey(move);
      const entry = votes.get(key) || { move, score: 0 };
      entry.score += poolScore(score);
      votes.set(key, entry);
    }
    worldsSearched += 1;
    // Always finish at least one world, however slow the machine — a move
    // chosen from no search at all would be worse than a late one.
    if (Date.now() >= endsAt) {
      break;
    }
  }

  if (worldsSearched === 0 || votes.size === 0) {
    return orderMoves(legalMoves)[0];
  }

  const ranked = [...votes.values()].sort((a, b) => b.score - a.score);
  return pickWithBlunderRate(ranked, state, options).move;
}

// Difficulty comes from imperfection, because it cannot come from search.
//
// Every attempt to make the engine stronger by searching harder measured flat:
// depth 3 vs depth 2 (45-53 over 100), depth 4 vs depth 3 (15-15), a node cap
// nearly quadrupled (11-9), sixteen sampled worlds against five (16-12). Only
// depth 1 -> depth 2 is a real step, and a decisive one (72-26, p ~ 0). The
// evaluation's useful signal is spent after about two plies; past that the
// search is just finding more positions it misjudges.
//
// So the top level is the engine at full strength, and the levels below it are
// the same engine told to pick a worse move some of the time. That ladder is
// monotonic by construction rather than by hope — a player who blunders less
// wins more, and no amount of retuning can make that untrue.
//
// The roll is derived from the position rather than Math.random: a given
// position always draws the same way, so games stay reproducible and the bench
// keeps measuring the AI instead of the weather.
function pickWithBlunderRate(ranked, state, options) {
  const rate = Number(options.blunderRate) || 0;
  if (rate <= 0 || ranked.length < 2) {
    return ranked[0];
  }

  if (positionRoll(state, 0x9e3779b1) >= rate) {
    return ranked[0];
  }
  // Not the worst move available — a level that hangs a line every time reads
  // as broken rather than as easy. Pick somewhere in the better half of what is
  // left, so the mistake is a missed opportunity more often than a catastrophe.
  const worstConsidered = Math.max(1, Math.ceil((ranked.length - 1) / 2));
  const index = 1 + Math.floor(positionRoll(state, 0x85ebca6b) * worstConsidered);
  return ranked[Math.min(index, ranked.length - 1)];
}

// A stable hash of the position, in [0, 1). Does not touch state.rngState —
// consuming the real stream here would change the game's own draws.
function positionRoll(state, salt) {
  let h = (state.rngState ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 15), h | 1) >>> 0;
  h = (h + Math.imul(state.turnNumber | 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Several runes hand their owner a follow-up choice — which piece Kenaz burns,
// what Teiwaz swaps, which rune Fehu takes back. Deciding those against the true
// state would undo the whole point: the AI would be honest about its move and
// then peek to pick the target. Same treatment, then — score each choice across
// the same sampled worlds and pool the verdicts.
//
// Only the AI's own choices come through here. When an effect hands the choice
// to the opponent, the caller is modelling what they would do rather than
// deciding anything, and that stays where it was.
export function choosePendingWithSampledWorlds(state, aiPlayerId, config = {}) {
  const options = { ...SEARCH_DEFAULTS, ...config };
  const choices = orderPendingChoices(state, getPendingChoices(state), aiPlayerId);
  if (choices.length <= 1) {
    return choices[0] ?? null;
  }

  const endsAt = Date.now() + options.timeBudgetMs;
  const scores = new Map();

  for (let world = 0; world < options.determinizations; world += 1) {
    const sampled = determinize(state, aiPlayerId, world);

    for (let i = 0; i < choices.length; i += 1) {
      const branch = cloneForSearch(sampled);
      if (resolvePendingBoardChoice(branch, normalizeChoice(choices[i])).error) {
        continue;
      }
      // Judge the position the choice leads to, averaged across worlds.
      // Deliberately no deeper search: there can be thirty targets, and a ply of
      // lookahead per target per world would cost more than choosing the move
      // did. The choices arrive already ranked by the domain heuristics in
      // orderPendingChoices, which is what that ordering is for.
      const entry = scores.get(i) ?? { choice: choices[i], score: 0 };
      entry.score += poolScore(evaluateState(branch, aiPlayerId));
      scores.set(i, entry);
    }

    if (Date.now() >= endsAt) {
      break;
    }
  }

  let best = null;
  for (const entry of scores.values()) {
    if (!best || entry.score > best.score) {
      best = entry;
    }
  }
  return best ? best.choice : choices[0];
}

// Tree shape for one world — how many iterations the budget actually buys, how
// deep the tree gets, and how the root visits are spread. Never used in play;
// it exists because the knobs above are only tunable if their effect is visible.
export function inspectSearch(state, aiPlayerId, config = {}) {
  const options = { ...SEARCH_DEFAULTS, ...config };
  const perWorld = options.timeBudgetMs / options.determinizations;
  const root = runSearch(determinize(state, aiPlayerId, 0), aiPlayerId, options, Date.now() + perWorld);

  let nodes = 0;
  let maxDepth = 0;
  const walk = (node, depth) => {
    nodes += 1;
    maxDepth = Math.max(maxDepth, depth);
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  };
  walk(root, 0);

  const rootVisits = root.children.map((child) => child.visits).sort((a, b) => b - a);
  return {
    msPerWorld: Math.round(perWorld),
    iterations: root.visits,
    nodes,
    maxDepth,
    rootChildren: root.children.length,
    topRootVisits: rootVisits.slice(0, 6),
    visitsInBestChild: rootVisits[0] ?? 0,
  };
}

// The MCTS engine, kept only so the claim above stays checkable:
//   node tools/bench.mjs --games 20 --a "depth=5,engine=mcts" --b "depth=2"
// Nothing selects it in play. If it is still losing the next time someone looks,
// delete it.
export function chooseRoundMoveMcts(state, aiPlayerId, config = {}) {
  const options = { ...SEARCH_DEFAULTS, ...config };
  const legalMoves = getLegalMovesForPlayer(state, state.currentPlayer);
  if (legalMoves.length === 0) {
    return null;
  }
  if (legalMoves.length === 1) {
    return legalMoves[0];
  }

  const startedAt = Date.now();
  const endsAt = startedAt + options.timeBudgetMs;
  const votes = new Map();

  for (let world = 0; world < options.determinizations; world += 1) {
    // Share out what is left rather than a fixed slice each: a world that
    // saturates early hands its remaining time to the samples after it instead
    // of throwing it away.
    const remainingMs = endsAt - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    const deadline = Date.now() + remainingMs / (options.determinizations - world);
    const root = runSearch(determinize(state, aiPlayerId, world), aiPlayerId, options, deadline);

    for (const child of root.children) {
      if (child.action?.kind !== "move") {
        continue;
      }
      const key = moveKey(child.action.move);
      const entry = votes.get(key) || { move: child.action.move, visits: 0, total: 0 };
      // Visit count rather than mean value: the most-searched child is the
      // robust choice, and a move tried twice with a lucky result should not
      // outrank one the search kept coming back to.
      entry.visits += child.visits;
      entry.total += child.total;
      votes.set(key, entry);
    }
  }

  let best = null;
  for (const entry of votes.values()) {
    if (!best || entry.visits > best.visits || (entry.visits === best.visits && entry.total > best.total)) {
      best = entry;
    }
  }

  // A budget too small to expand even one child leaves nothing to vote on;
  // the heuristic move order is a better fallback than an arbitrary one.
  return best ? best.move : orderMoves(legalMoves)[0];
}
