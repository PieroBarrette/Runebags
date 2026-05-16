const SCHEMA_VERSION = 1;

function getKey(profileSlot) {
  const slot = Number(profileSlot);
  const safe = Number.isInteger(slot) && slot >= 1 && slot <= 3 ? slot : 1;
  return `runebags-profile-${safe}-achievements-v1`;
}

function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    unlockedIds: [],
    metrics: {
      gamesFinished: 0,
      wins: 0,
      capturedRemovals: 0,
      firstTurnRoundWins: 0,
      fullTies: 0,
    },
    updatedAt: Date.now(),
  };
}

function sanitizeState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const metrics = source.metrics && typeof source.metrics === "object" ? source.metrics : {};
  const unlockedSet = new Set(Array.isArray(source.unlockedIds) ? source.unlockedIds : []);

  return {
    schemaVersion: SCHEMA_VERSION,
    unlockedIds: [...unlockedSet],
    metrics: {
      gamesFinished: Math.max(0, Number(metrics.gamesFinished) || 0),
      wins: Math.max(0, Number(metrics.wins) || 0),
      capturedRemovals: Math.max(0, Number(metrics.capturedRemovals) || 0),
      firstTurnRoundWins: Math.max(0, Number(metrics.firstTurnRoundWins) || 0),
      fullTies: Math.max(0, Number(metrics.fullTies) || 0),
    },
    updatedAt: Number(source.updatedAt) || Date.now(),
  };
}

export function loadAchievementState(profileSlot) {
  const raw = localStorage.getItem(getKey(profileSlot));
  if (!raw) {
    const initial = createDefaultState();
    saveAchievementState(profileSlot, initial);
    return initial;
  }

  try {
    const parsed = sanitizeState(JSON.parse(raw));
    saveAchievementState(profileSlot, parsed);
    return parsed;
  } catch {
    const fallback = createDefaultState();
    saveAchievementState(profileSlot, fallback);
    return fallback;
  }
}

export function saveAchievementState(profileSlot, state) {
  const next = sanitizeState(state);
  next.updatedAt = Date.now();
  localStorage.setItem(getKey(profileSlot), JSON.stringify(next));
}