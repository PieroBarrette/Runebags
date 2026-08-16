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
import { createInitialState, enterShopPhase, restoreState, startRoundFromShop } from "../core/gameState.js";
import { runAiShopForSide, runAiStep } from "./aiController.js";
import { setEvaluationMode } from "./minimax.js";

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
        setEvaluationMode(configs[seat].legacyEval);
        runAiShopForSide(state, seat);
      }
      if (startRoundFromShop(state).error) {
        break;
      }
      continue;
    }

    const actor = state.pendingAction?.playerId ?? state.currentPlayer;
    const config = configs[actor] || configA;
    setEvaluationMode(config.legacyEval);

    const before = `${state.turnNumber}:${state.phase}:${Boolean(state.pendingAction)}`;
    runAiStep(state, { enabled: true, playerId: actor, depth: config.depth ?? 2 });

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

export function runMatches(configA, configB, games = 20) {
  const tally = { aWins: 0, bWins: 0, draws: 0, unfinished: 0 };
  const startedAt = Date.now();

  for (let i = 0; i < games; i += 1) {
    // Swap seats every other game so neither configuration keeps the side that
    // moves first.
    const swap = i % 2 === 1;
    const final = playGame(swap ? configB : configA, swap ? configA : configB, 1000 + i);

    if (final.phase !== "game-over") {
      tally.unfinished += 1;
      continue;
    }
    if (!final.gameWinner) {
      tally.draws += 1;
      continue;
    }
    const aIsBlack = !swap;
    const aWon = (final.gameWinner === 1) === aIsBlack;
    if (aWon) {
      tally.aWins += 1;
    } else {
      tally.bWins += 1;
    }
  }

  const decided = tally.aWins + tally.bWins;
  return {
    ...tally,
    games,
    aWinRate: decided > 0 ? Math.round((tally.aWins / decided) * 100) : null,
    seconds: Math.round((Date.now() - startedAt) / 100) / 10,
  };
}
