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
