import { ACHIEVEMENT_CATALOG } from "./achievementCatalog.js";

function sanitizePlayerId(value) {
  const id = Number(value);
  return id === 1 || id === 2 ? id : null;
}

export function createAchievementSnapshot(state, mode, context = {}) {
  const trackedPlayerId = sanitizePlayerId(context.trackedPlayerId);
  return {
    mode,
    trackedPlayerId,
    phase: state.phase,
    roundNumber: Number(state.roundNumber) || 0,
    turnNumber: Number(state.turnNumber) || 0,
    winner: state.winner || null,
    gameWinner: state.gameWinner || null,
    gameWinnerReason: state.gameWinnerReason || null,
    playerPoints: {
      1: Number(state.players?.[1]?.points) || 0,
      2: Number(state.players?.[2]?.points) || 0,
    },
    playerBagSizes: {
      1: Array.isArray(state.players?.[1]?.bag) ? state.players[1].bag.length : 0,
      2: Array.isArray(state.players?.[2]?.bag) ? state.players[2].bag.length : 0,
    },
    lastKenazDestroyStamp: Number(state.lastKenazDestroy?.stamp) || 0,
    lastKenazDestroyActorId: sanitizePlayerId(state.lastKenazDestroy?.actorId),
    lastKenazDestroyTargetOwnerId: sanitizePlayerId(state.lastKenazDestroy?.targetOwnerId),
    logLength: Array.isArray(state.log) ? state.log.length : 0,
  };
}

function getNewLogEntries(previousSnapshot, currentState) {
  const logs = Array.isArray(currentState.log) ? currentState.log : [];
  if (!previousSnapshot) {
    return [];
  }

  const previousLength = Number(previousSnapshot.logLength) || 0;
  if (logs.length <= previousLength) {
    return [];
  }

  const delta = logs.length - previousLength;
  if (delta > 8) {
    // Prevent historical backfill when loading an old save or joining a mid-game room.
    return [];
  }

  return logs.slice(0, delta);
}

function unlockAchievement(nextState, achievementId, unlockedAt) {
  const set = new Set(nextState.unlockedIds);
  if (set.has(achievementId)) {
    return false;
  }
  set.add(achievementId);
  nextState.unlockedIds = [...set];
  return true;
}

export function evaluateAchievementProgress(currentAchievementState, previousSnapshot, currentState, mode, context = {}) {
  const sourceMetrics = currentAchievementState.metrics || {};
  const nextState = {
    ...currentAchievementState,
    metrics: {
      gamesFinished: Math.max(0, Number(sourceMetrics.gamesFinished) || 0),
      wins: Math.max(0, Number(sourceMetrics.wins) || 0),
      aiWins: Math.max(0, Number(sourceMetrics.aiWins) || 0),
      capturedRemovals: Math.max(0, Number(sourceMetrics.capturedRemovals) || 0),
      firstTurnRoundWins: Math.max(0, Number(sourceMetrics.firstTurnRoundWins) || 0),
      fullTies: Math.max(0, Number(sourceMetrics.fullTies) || 0),
      bagSize30Plus: Math.max(0, Number(sourceMetrics.bagSize30Plus) || 0),
      campaignWins: Math.max(0, Number(sourceMetrics.campaignWins) || 0),
      kenazSelfDestroys: Math.max(0, Number(sourceMetrics.kenazSelfDestroys) || 0),
      triplePointRounds: Math.max(0, Number(sourceMetrics.triplePointRounds) || 0),
    },
    unlockedIds: Array.isArray(currentAchievementState.unlockedIds)
      ? [...currentAchievementState.unlockedIds]
      : [],
  };

  const unlockedNow = [];
  const gameEndedNow = Boolean(previousSnapshot && previousSnapshot.phase !== "game-over" && currentState.phase === "game-over");
  const roundEndedNow = Boolean(previousSnapshot && previousSnapshot.phase === "round" && currentState.phase === "round-end");
  const newLogEntries = getNewLogEntries(previousSnapshot, currentState);
  const trackedPlayerId = sanitizePlayerId(context.trackedPlayerId);

  if (gameEndedNow) {
    nextState.metrics.gamesFinished += 1;
    if (currentState.gameWinner) {
      nextState.metrics.wins += 1;
    }
    if (mode === "ai" && trackedPlayerId && currentState.gameWinner === trackedPlayerId) {
      nextState.metrics.aiWins += 1;
    }
    if (currentState.gameWinnerReason === "full-tie") {
      nextState.metrics.fullTies += 1;
    }
  }

  if (roundEndedNow && currentState.winner && Number(currentState.turnNumber) === 1) {
    nextState.metrics.firstTurnRoundWins += 1;
  }

  if (newLogEntries.some((line) => /permanently removed captured/i.test(String(line)))) {
    nextState.metrics.capturedRemovals += 1;
  }

  if (mode === "campaign" && newLogEntries.some((line) => /campaign run cleared/i.test(String(line)))) {
    nextState.metrics.campaignWins += 1;
  }

  if (trackedPlayerId) {
    const bagSize = Array.isArray(currentState.players?.[trackedPlayerId]?.bag)
      ? currentState.players[trackedPlayerId].bag.length
      : 0;
    if (bagSize >= 30) {
      nextState.metrics.bagSize30Plus = Math.max(1, Number(nextState.metrics.bagSize30Plus) || 0);
    }

    const previousPoints = Number(previousSnapshot?.playerPoints?.[trackedPlayerId]) || 0;
    const currentPoints = Number(currentState.players?.[trackedPlayerId]?.points) || 0;
    if (roundEndedNow && currentPoints - previousPoints >= 3) {
      nextState.metrics.triplePointRounds += 1;
    }

    const previousKenazStamp = Number(previousSnapshot?.lastKenazDestroyStamp) || 0;
    const currentKenazStamp = Number(currentState.lastKenazDestroy?.stamp) || 0;
    if (
      currentKenazStamp > 0
      && currentKenazStamp !== previousKenazStamp
      && sanitizePlayerId(currentState.lastKenazDestroy?.actorId) === trackedPlayerId
      && sanitizePlayerId(currentState.lastKenazDestroy?.targetOwnerId) === trackedPlayerId
    ) {
      nextState.metrics.kenazSelfDestroys += 1;
    }
  }

  ACHIEVEMENT_CATALOG.forEach((achievement) => {
    const metricValue = Number(nextState.metrics[achievement.metricKey]) || 0;
    if (metricValue >= achievement.required) {
      const justUnlocked = unlockAchievement(nextState, achievement.id, Date.now());
      if (justUnlocked) {
        unlockedNow.push(achievement.id);
      }
    }
  });

  return {
    nextState,
    unlockedNow,
    nextSnapshot: createAchievementSnapshot(currentState, mode, context),
  };
}