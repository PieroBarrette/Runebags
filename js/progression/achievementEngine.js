import { ACHIEVEMENT_CATALOG } from "./achievementCatalog.js";

export function createAchievementSnapshot(state, mode) {
  return {
    mode,
    phase: state.phase,
    roundNumber: Number(state.roundNumber) || 0,
    turnNumber: Number(state.turnNumber) || 0,
    winner: state.winner || null,
    gameWinner: state.gameWinner || null,
    gameWinnerReason: state.gameWinnerReason || null,
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

export function evaluateAchievementProgress(currentAchievementState, previousSnapshot, currentState, mode) {
  const nextState = {
    ...currentAchievementState,
    metrics: {
      ...currentAchievementState.metrics,
    },
    unlockedIds: Array.isArray(currentAchievementState.unlockedIds)
      ? [...currentAchievementState.unlockedIds]
      : [],
  };

  const unlockedNow = [];
  const gameEndedNow = Boolean(previousSnapshot && previousSnapshot.phase !== "game-over" && currentState.phase === "game-over");
  const roundEndedNow = Boolean(previousSnapshot && previousSnapshot.phase === "round" && currentState.phase === "round-end");
  const newLogEntries = getNewLogEntries(previousSnapshot, currentState);

  if (gameEndedNow) {
    nextState.metrics.gamesFinished += 1;
    if (currentState.gameWinner) {
      nextState.metrics.wins += 1;
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
    nextSnapshot: createAchievementSnapshot(currentState, mode),
  };
}