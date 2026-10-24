// Post-game review: how each of the player's moves compared with the best one
// the engine finds. A move is judged the way the computer judges its own: the
// opponent's hand is not known, so every position is searched in a few sampled
// worlds (js/ai/sampledWorlds.js) and the scores are pooled. A move is measured
// against what the player could have known, never against the hidden hand.
//
// Only rune placements are reviewed; the shop and the answers to rune effects
// are left out.
import { getLegalMovesForPlayer } from "../core/gameState.js";
import { scoreRootMoves } from "./minimax.js";
import { determinize } from "./sampledWorlds.js";

// The Expert level's own search: four worlds at depth 2. The review is the
// Expert's opinion of the game, no more and no less.
const REVIEW_WORLDS = 4;
const REVIEW_DEPTH = 2;
// The AI's own pooling truncates each world the same way, so that one world's
// round win cannot carry the verdict alone.
const WORLD_SCORE_CLAMP = 2000;
// A move is judged by how far its score falls short of the best move's, in the
// evaluation's own units: an open three is worth about 20, a rune in hand up to
// 36, and a round 2000 once clamped. The score itself includes the points
// already won, which nothing played during a round can change, so only the gap
// says what a move gave away. The limits were set by reviewing games the
// computer played against itself (see tools/review-calibration.mjs), where the
// gaps fall in clusters: small positional ones up to about 40, then almost
// nothing until about 500 — a round lost in one sampled world out of four —
// and the next cluster from 1000, the round lost in most of them.
export const BANDS = [
  ["excellent", 3],
  ["good", 10],
  ["inaccuracy", 80],
  ["mistake", 600],
  ["blunder", Infinity],
];
// Per-move accuracy is 100·e^(−gap/ACCURACY_SCALE), averaged over the moves
// that were a real choice. At 30, three games per level of the computer
// against itself read Easy 80, Medium 87, Hard 92, Harder 96 and Expert 100;
// the Expert is the review's own judge, so it cannot score less.
const ACCURACY_SCALE = 30;
// The move that cost the most, when it cost at least a mistake's worth.
const TURNING_POINT_GAP = BANDS[2][1];

export function bandFor(gap) {
  return BANDS.find(([, limit]) => gap < limit)[0];
}

export function moveAccuracy(gap) {
  return 100 * Math.exp(-gap / ACCURACY_SCALE);
}

// position: { state, playerId, move: { runeInstanceId, column, row, col } },
// with `state` taken just before the move.
export function reviewPosition(position, { worlds = REVIEW_WORLDS, depth = REVIEW_DEPTH } = {}) {
  const { state, playerId, move } = position;
  const legal = getLegalMovesForPlayer(state, playerId);
  const played = legal.find((candidate) => sameMove(candidate, move));
  if (!played) {
    return null;
  }
  if (legal.length < 2) {
    return { move: played, forced: true, gap: 0, band: "excellent" };
  }

  const pooled = new Map();
  for (let world = 0; world < worlds; world += 1) {
    const sampled = determinize(state, playerId, world);
    for (const { move: candidate, score } of scoreRootMoves(sampled, playerId, depth)) {
      const key = moveKey(candidate);
      const entry = pooled.get(key) || { move: candidate, total: 0, count: 0, wins: 0, losses: 0 };
      const clamped = Math.max(-WORLD_SCORE_CLAMP, Math.min(WORLD_SCORE_CLAMP, score));
      entry.total += clamped;
      entry.count += 1;
      // Only a decided round reaches the clamp: two points ahead is worth 600.
      if (clamped >= WORLD_SCORE_CLAMP) {
        entry.wins += 1;
      } else if (clamped <= -WORLD_SCORE_CLAMP) {
        entry.losses += 1;
      }
      pooled.set(key, entry);
    }
  }

  const ranked = [...pooled.values()]
    .map((entry) => ({ ...entry, score: entry.total / entry.count }))
    .sort((a, b) => b.score - a.score);
  const playedEntry = ranked.find((entry) => moveKey(entry.move) === moveKey(played));
  if (!playedEntry) {
    return null;
  }

  const best = ranked[0];
  const gap = Math.max(0, best.score - playedEntry.score);
  return {
    move: played,
    bestMove: best.move,
    // Several moves can tie for best (two basic runes in hand, say): playing
    // any of them is playing the best move.
    playedBest: gap === 0,
    score: playedEntry.score,
    bestScore: best.score,
    gap,
    band: bandFor(gap),
    reason: gap > 0 ? reasonFor(best, playedEntry) : null,
    forced: false,
  };
}

// What the gap was made of, in words a player can act on. Each world either
// decided the round within the two plies searched or did not.
function reasonFor(best, played) {
  if (best.wins === best.count && played.wins < played.count) {
    return "missed-win";
  }
  if (played.losses > best.losses) {
    return played.losses * 2 > played.count ? "allowed-win" : "risky";
  }
  return "position";
}

// One move of a game, labelled with where it sits in it.
export function reviewMove(positions, index, options = {}) {
  const position = positions[index];
  const result = reviewPosition(position, options);
  return result && { ...result, index, round: position.state.roundNumber, turn: position.state.turnNumber };
}

// Reviews positions one by one; onProgress(done, total) lets a caller show
// progress between positions.
export function reviewGame(positions, options = {}) {
  const results = [];
  positions.forEach((_, index) => {
    const result = reviewMove(positions, index, options);
    if (result) {
      results.push(result);
    }
    options.onProgress?.(index + 1, positions.length);
  });
  return results;
}

export function summarizeReview(results) {
  const judged = results.filter((result) => !result.forced);
  const counts = Object.fromEntries(BANDS.map(([band]) => [band, 0]));
  judged.forEach((result) => {
    counts[result.band] += 1;
  });

  const accuracy = judged.length > 0
    ? Math.round(judged.reduce((sum, result) => sum + moveAccuracy(result.gap), 0) / judged.length)
    : null;

  const worst = judged.reduce((top, result) => (!top || result.gap > top.gap ? result : top), null);
  return {
    moves: judged.length,
    accuracy,
    counts,
    turningPoint: worst && worst.gap >= TURNING_POINT_GAP ? worst : null,
  };
}

export function sameMove(candidate, move) {
  if (candidate.runeInstanceId !== move.runeInstanceId || candidate.column !== move.column) {
    return false;
  }
  // Only Nauthiz is placed on a chosen cell; every other rune drops down its
  // column, whatever cell of the column was tapped.
  return candidate.runeId !== "nauthiz" || (candidate.row === move.row && candidate.col === move.col);
}

function moveKey(move) {
  return `${move.runeInstanceId}|${move.column}|${move.row ?? ""}|${move.col ?? ""}`;
}
