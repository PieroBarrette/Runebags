// Lightweight local play stats (no profiles, no server).
// v2 keeps a per-mode breakdown (ai / online). The v1 key is left
// in place untouched so a rollback to an older build still finds its data.
const STATS_V2_KEY = "runebags-stats-v2";
const STATS_V1_KEY = "runebags-stats-v1";

function recordDefaults() {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    currentStreak: 0,
    bestStreak: 0,
  };
}

function defaults() {
  return {
    version: 2,
    totals: { gamesPlayed: 0 },
    ai: recordDefaults(),
    // Device-local view of online results; the server-side record is separate.
    online: recordDefaults(),
  };
}

function mergeDefaults(data) {
  const base = defaults();
  return {
    ...base,
    ...data,
    totals: { ...base.totals, ...(data.totals || {}) },
    ai: { ...base.ai, ...(data.ai || {}) },
    online: { ...base.online, ...(data.online || {}) },
  };
}

function read() {
  try {
    const raw = localStorage.getItem(STATS_V2_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw);
    return data && typeof data === "object" && data.version === 2 ? mergeDefaults(data) : null;
  } catch (error) {
    return null;
  }
}

function write(data) {
  try {
    localStorage.setItem(STATS_V2_KEY, JSON.stringify(data));
  } catch (error) {
    // Ignore storage failures.
  }
}

// v1 wins/losses/draws/streaks were AI-only by construction (online and
// pass & play recorded outcome "played"), so they seed the ai bucket. The
// non-decisive remainder of gamesPlayed cannot be attributed to a mode.
function migrateFromV1() {
  const stats = defaults();
  try {
    const raw = localStorage.getItem(STATS_V1_KEY);
    if (!raw) {
      return stats;
    }
    const v1 = JSON.parse(raw);
    if (!v1 || typeof v1 !== "object") {
      return stats;
    }
    const wins = Number(v1.wins || 0);
    const losses = Number(v1.losses || 0);
    const draws = Number(v1.draws || 0);
    stats.totals.gamesPlayed = Number(v1.gamesPlayed || 0);
    stats.ai = {
      gamesPlayed: wins + losses + draws,
      wins,
      losses,
      draws,
      currentStreak: Number(v1.currentStreak || 0),
      bestStreak: Number(v1.bestStreak || 0),
    };
  } catch (error) {
    // Corrupt v1 data: start fresh.
  }
  return stats;
}

export function getStats() {
  const existing = read();
  if (existing) {
    return existing;
  }
  const migrated = migrateFromV1();
  write(migrated);
  return migrated;
}

// outcome: "win" | "loss" | "draw" | "played" (played = no personal result)
// mode: "ai" | "online"
export function recordGameResult(outcome, mode) {
  const stats = getStats();
  stats.totals.gamesPlayed += 1;

  const bucket = stats[mode];
  if (bucket) {
    bucket.gamesPlayed = Number(bucket.gamesPlayed || 0) + 1;
    if (typeof bucket.wins === "number") {
      if (outcome === "win") {
        bucket.wins += 1;
        bucket.currentStreak += 1;
        bucket.bestStreak = Math.max(bucket.bestStreak, bucket.currentStreak);
      } else if (outcome === "loss") {
        bucket.losses += 1;
        bucket.currentStreak = 0;
      } else if (outcome === "draw") {
        bucket.draws += 1;
        bucket.currentStreak = 0;
      }
    }
  }

  write(stats);
  return stats;
}

export function resetStreak(mode = "ai") {
  const stats = getStats();
  const bucket = stats[mode];
  if (bucket && typeof bucket.currentStreak === "number") {
    bucket.currentStreak = 0;
  }
  write(stats);
  return stats;
}
