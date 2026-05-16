const SCHEMA_VERSION = 1;

function getKey(profileSlot) {
  const slot = Number(profileSlot);
  const safe = Number.isInteger(slot) && slot >= 1 && slot <= 3 ? slot : 1;
  return `runebags-profile-${safe}-puzzles-v1`;
}

function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    solvedIds: [],
    attemptsById: {},
    updatedAt: Date.now(),
  };
}

function sanitizeState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const solvedSet = new Set(Array.isArray(source.solvedIds) ? source.solvedIds.map((id) => String(id)) : []);
  const attemptsSource = source.attemptsById && typeof source.attemptsById === "object"
    ? source.attemptsById
    : {};

  const attemptsById = {};
  Object.entries(attemptsSource).forEach(([id, value]) => {
    const safeId = String(id || "").trim();
    if (!safeId) {
      return;
    }
    attemptsById[safeId] = Math.max(0, Number(value) || 0);
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    solvedIds: [...solvedSet],
    attemptsById,
    updatedAt: Number(source.updatedAt) || Date.now(),
  };
}

export function loadPuzzleState(profileSlot) {
  const raw = localStorage.getItem(getKey(profileSlot));
  if (!raw) {
    const initial = createDefaultState();
    savePuzzleState(profileSlot, initial);
    return initial;
  }

  try {
    const parsed = sanitizeState(JSON.parse(raw));
    savePuzzleState(profileSlot, parsed);
    return parsed;
  } catch {
    const fallback = createDefaultState();
    savePuzzleState(profileSlot, fallback);
    return fallback;
  }
}

export function savePuzzleState(profileSlot, state) {
  const next = sanitizeState(state);
  next.updatedAt = Date.now();
  localStorage.setItem(getKey(profileSlot), JSON.stringify(next));
}

export function markPuzzleAttempt(state, puzzleId) {
  const next = sanitizeState(state);
  const id = String(puzzleId || "").trim();
  if (!id) {
    return next;
  }

  next.attemptsById[id] = Math.max(0, Number(next.attemptsById[id]) || 0) + 1;
  return next;
}

export function markPuzzleSolved(state, puzzleId) {
  const next = sanitizeState(state);
  const id = String(puzzleId || "").trim();
  if (!id) {
    return next;
  }

  const solvedSet = new Set(next.solvedIds);
  solvedSet.add(id);
  next.solvedIds = [...solvedSet];
  return next;
}

export function isPuzzleSolved(state, puzzleId) {
  const safe = sanitizeState(state);
  const id = String(puzzleId || "").trim();
  if (!id) {
    return false;
  }
  return new Set(safe.solvedIds).has(id);
}
