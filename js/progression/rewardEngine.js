export function createRewardSnapshot(state, mode) {
  return {
    mode,
    phase: state.phase,
    gameWinner: state.gameWinner || null,
    points1: Number(state.players?.[1]?.points) || 0,
    points2: Number(state.players?.[2]?.points) || 0,
  };
}

export function calculateGameReward(previousSnapshot, currentState, mode, perspectivePlayerId) {
  if (!previousSnapshot) {
    return null;
  }

  const enteredGameOver = previousSnapshot.phase !== "game-over" && currentState.phase === "game-over";
  if (!enteredGameOver) {
    return null;
  }

  const playerId = Number(perspectivePlayerId);
  if (!Number.isInteger(playerId) || (playerId !== 1 && playerId !== 2)) {
    return null;
  }

  const gamePoints = Math.max(0, Number(currentState.players?.[playerId]?.points) || 0);
  let outcome = "draw";
  if (currentState.gameWinner === playerId) {
    outcome = "win";
  } else if (currentState.gameWinner === null) {
    outcome = "draw";
  } else {
    outcome = "loss";
  }

  const multiplier = outcome === "win" ? 3 : outcome === "draw" ? 2 : 1;
  const awardedPoints = gamePoints * multiplier;

  return {
    awardedPoints,
    gamePoints,
    multiplier,
    outcome,
  };
}
