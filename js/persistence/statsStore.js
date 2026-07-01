// Lightweight local play stats (no profiles, no server).
const STATS_STORAGE_KEY = "runebags-stats-v1";

function defaults() {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    currentStreak: 0,
    bestStreak: 0,
  };
}

function read() {
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch (error) {
    return null;
  }
}

function write(data) {
  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // Ignore storage failures.
  }
}

export function getStats() {
  return { ...defaults(), ...(read() || {}) };
}

// outcome: "win" | "loss" | "draw" | "played" (played = local pass & play, no personal result)
export function recordGameResult(outcome) {
  const stats = getStats();
  stats.gamesPlayed += 1;

  if (outcome === "win") {
    stats.wins += 1;
    stats.currentStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else if (outcome === "loss") {
    stats.losses += 1;
    stats.currentStreak = 0;
  } else if (outcome === "draw") {
    stats.draws += 1;
    stats.currentStreak = 0;
  }

  write(stats);
  return stats;
}

export function resetStreak() {
  const stats = getStats();
  stats.currentStreak = 0;
  write(stats);
  return stats;
}
