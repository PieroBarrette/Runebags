// Headless AI-vs-AI bench.
//
// Heuristics tuned by intuition are the classic way to make an engine merely
// different rather than better, so every change to the search or the evaluation
// should be run through this first. Play two configurations against each other,
// swapping colours each game so the first-move advantage cancels out.
//
// Run it from the browser console:
//   const b = await import("/js/ai/benchmark.js");
//   await b.runMatches({ depth: 2 }, { depth: 2, legacyEval: true }, 40);
//
// Or, far faster, headless and across every core:
//   node tools/bench.mjs --games 100
import { createInitialState, enterShopPhase, restoreState, startRoundFromShop } from "../core/gameState.js";
import { runAiShopForSide, runAiStep } from "./aiController.js";
import { setEvaluationMode, setHagalzAwareness } from "./minimax.js";

// Both sides share one module, so every switch has to be flipped before each
// side moves rather than once per run.
function applyEvaluationFlags(config) {
  setEvaluationMode(config.legacyEval);
  setHagalzAwareness(!config.noHagalz);
}

function playGame(configA, configB, seed) {
  // Same seed for both sides of a pairing: identical bags and shop offers, so
  // the only difference measured is the decision-making.
  const state = restoreState(createInitialState({ seed }));
  // A plays Black, B plays White.
  const configs = { 1: configA, 2: configB };

  let guard = 0;
  while (state.phase !== "game-over" && guard < 4000) {
    guard += 1;

    if (state.phase === "shop") {
      for (const seat of [1, 2]) {
        applyEvaluationFlags(configs[seat]);
        runAiShopForSide(state, seat);
      }
      if (startRoundFromShop(state).error) {
        break;
      }
      continue;
    }

    const actor = state.pendingAction?.playerId ?? state.currentPlayer;
    const config = configs[actor] || configA;
    applyEvaluationFlags(config);

    const before = `${state.turnNumber}:${state.phase}:${Boolean(state.pendingAction)}`;
    // Spread the whole config so engine-specific knobs (timeBudgetMs,
    // determinizations, ...) reach the search instead of being dropped.
    runAiStep(state, { depth: 2, ...config, enabled: true, playerId: actor });

    if (state.phase === "round-end") {
      // Nobody drives phase transitions in a headless game, so do it here.
      enterShopPhase(state);
      continue;
    }

    if (`${state.turnNumber}:${state.phase}:${Boolean(state.pendingAction)}` === before) {
      break; // No progress: stop rather than spin.
    }
  }

  return state;
}

// Games are played in pairs: the same seed twice, with the colours swapped, so
// both configurations face the identical bags and shop offers from both sides.
// Whatever luck a seed carries then cancels out inside its own pair instead of
// showing up as noise in the total, which is what lets a hundred games say
// something a hundred unpaired games could not.
//
// Both sides are deterministic, so game `index` is always the same game — that
// is what makes it safe to split a run across workers and merge the tallies.
export function playMatch(configA, configB, index) {
  const swap = index % 2 === 1;
  const seed = 1000 + Math.floor(index / 2);
  const final = playGame(swap ? configB : configA, swap ? configA : configB, seed);

  if (final.phase !== "game-over") {
    return "unfinished";
  }
  if (!final.gameWinner) {
    return "draw";
  }
  // A had Black (player 1) on the unswapped half of the pair.
  const aIsBlack = !swap;
  return (final.gameWinner === 1) === aIsBlack ? "a" : "b";
}

// A full game costs roughly 15-30 seconds of search, so a twenty-game run takes
// minutes. Pass onProgress to watch it rather than staring at a black box, and
// prefer running it in a worker — on the main thread it locks the page for the
// whole run.
export function runMatches(configA, configB, games = 20, onProgress = null) {
  const tally = { aWins: 0, bWins: 0, draws: 0, unfinished: 0 };
  const startedAt = Date.now();
  const bucket = { a: "aWins", b: "bWins", draw: "draws", unfinished: "unfinished" };

  for (let i = 0; i < games; i += 1) {
    tally[bucket[playMatch(configA, configB, i)]] += 1;

    if (onProgress) {
      onProgress({ played: i + 1, games, ...tally });
    }
  }

  return summarize(tally, games, Math.round((Date.now() - startedAt) / 100) / 10);
}

// Win rate alone cannot tell "the new evaluation is better" from "the new
// evaluation got lucky", so report the two-sided exact binomial p as well and
// let the number decide.
export function summarize(tally, games, seconds) {
  const decided = tally.aWins + tally.bWins;
  return {
    ...tally,
    games,
    aWinRate: decided > 0 ? Math.round((tally.aWins / decided) * 1000) / 10 : null,
    pValue: decided > 0 ? Math.round(twoSidedBinomialP(tally.aWins, decided) * 1000) / 1000 : null,
    seconds,
  };
}

// Probability of a split at least this lopsided if the two configurations were
// actually equal. Exact rather than normal-approximated, because these runs are
// small enough for the approximation to mislead.
function twoSidedBinomialP(wins, trials) {
  const logFactorial = (n) => {
    let sum = 0;
    for (let i = 2; i <= n; i += 1) {
      sum += Math.log(i);
    }
    return sum;
  };

  const tail = Math.min(wins, trials - wins);
  let cumulative = 0;
  for (let k = 0; k <= tail; k += 1) {
    cumulative += Math.exp(
      logFactorial(trials) - logFactorial(k) - logFactorial(trials - k) - trials * Math.LN2,
    );
  }
  return Math.min(1, 2 * cumulative);
}
