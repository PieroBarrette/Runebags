// Per-mode saved games. Local play is AI-only; online keeps its own entry so a
// correspondence match and a solo game never overwrite each other.
const STORAGE_KEYS = {
  ai: "runebags-save-ai-v2",
  online: "runebags-save-online-v2",
};

function getStorageKey(mode) {
  return STORAGE_KEYS[mode] || STORAGE_KEYS.ai;
}

export function saveModeSave(mode, payload) {
  localStorage.setItem(getStorageKey(mode), JSON.stringify(payload));
}

export function loadModeSave(mode) {
  const raw = localStorage.getItem(getStorageKey(mode));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearModeSave(mode) {
  localStorage.removeItem(getStorageKey(mode));
}

// The positions of the game against the AI that the post-game review reads,
// kept under their own key: they are written once per move of the player's,
// where the save above is rewritten on every click.
const GAME_RECORD_KEY = "runebags-ai-record-v1";

export function saveGameRecord(record) {
  try {
    localStorage.setItem(GAME_RECORD_KEY, JSON.stringify(record));
  } catch {
    // Storage full or blocked: the review then covers this session only.
  }
}

export function loadGameRecord() {
  try {
    return JSON.parse(localStorage.getItem(GAME_RECORD_KEY) || "null");
  } catch {
    return null;
  }
}
