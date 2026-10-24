// Reviews games the computer plays against itself, to set the post-game
// review's limits (js/ai/review.js). A sound calibration shows the Expert level
// mostly "excellent" and "good", and the Easy level — which declines its best
// move 60% of the time — with clearly more inaccuracies and worse.
//
//   node tools/review-calibration.mjs --games 2 --black 1 --white 5 [--out gaps.json]
import { writeFileSync } from "node:fs";
import { createInitialState, enterShopPhase, restoreState, selectRune, playTurn, startRoundFromShop } from "../js/core/gameState.js";
import { runAiShopForSide, runAiStep, searchOptionsFor } from "../js/ai/aiController.js";
import { chooseRoundMovePimc } from "../js/ai/sampledWorlds.js";
import { reviewGame, summarizeReview } from "../js/ai/review.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]]);
  return pairs;
}, []));
const games = Number(args.games) || 2;
const levels = { 1: Number(args.black) || 1, 2: Number(args.white) || 5 };

const positions = { 1: [], 2: [] };
for (let game = 0; game < games; game += 1) {
  const startedAt = Date.now();
  playGame(1000 + game);
  console.log(`game ${game + 1}/${games} played in ${Math.round((Date.now() - startedAt) / 1000)} s`);
}

const HISTOGRAM = [0, 3, 10, 20, 40, 80, 160, 320, 600, 1200, Infinity];
const report = {};
for (const seat of [1, 2]) {
  const startedAt = Date.now();
  const results = reviewGame(positions[seat]);
  const summary = summarizeReview(results);
  const gaps = results.filter((r) => !r.forced).map((r) => r.gap).sort((a, b) => a - b);
  const pct = (list, p) => list.length ? list[Math.min(list.length - 1, Math.floor(p * list.length))] : 0;
  const buckets = [`0: ${gaps.filter((gap) => gap === 0).length}`].concat(
    HISTOGRAM.slice(1).map((limit, i) => {
      const count = gaps.filter((gap) => gap > HISTOGRAM[i] && gap <= limit).length;
      return `≤${limit}: ${count}`;
    }),
  );
  console.log(`\nlevel ${levels[seat]} (seat ${seat}): ${summary.moves} judged moves, reviewed in ${Math.round((Date.now() - startedAt) / 1000)} s`);
  console.log(`  accuracy ${summary.accuracy}  bands ${JSON.stringify(summary.counts)}`);
  console.log(`  gap p50 ${Math.round(pct(gaps, 0.5))} p75 ${Math.round(pct(gaps, 0.75))} p90 ${Math.round(pct(gaps, 0.9))} max ${Math.round(pct(gaps, 0.999))}`);
  console.log(`  gaps ${buckets.join("  ")}`);
  console.log(`  played the best move ${results.filter((r) => r.playedBest).length}/${results.length}`);
  report[levels[seat]] = gaps;
}
// --out keeps the raw gaps, so new limits can be tried without replaying.
if (args.out) {
  writeFileSync(args.out, JSON.stringify(report));
}

function playGame(seed) {
  const state = restoreState(createInitialState({ seed }));
  let guard = 0;
  while (state.phase !== "game-over" && guard < 4000) {
    guard += 1;
    if (state.phase === "shop") {
      runAiShopForSide(state, 1);
      runAiShopForSide(state, 2);
      if (startRoundFromShop(state).error) break;
      continue;
    }
    if (state.phase === "round-end") {
      enterShopPhase(state);
      continue;
    }

    const actor = state.pendingAction?.playerId ?? state.currentPlayer;
    const config = { enabled: true, playerId: actor, depth: levels[actor], timeBudgetMs: 600000 };
    if (state.pendingAction) {
      runAiStep(state, config);
      continue;
    }

    const move = chooseRoundMovePimc(state, actor, searchOptionsFor(config));
    if (!move) {
      runAiStep(state, config);
      continue;
    }
    const before = JSON.parse(JSON.stringify(state));
    selectRune(state, actor, move.runeInstanceId);
    if (playTurn(state, move.column, { row: move.row, col: move.col }).error) {
      runAiStep(state, config);
      continue;
    }
    positions[actor].push({ state: before, playerId: actor, move });
  }
}
