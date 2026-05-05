const LEGACY_STORAGE_KEY = "runebags-save-v1";
const STORAGE_KEYS = {
  passplay: "runebags-save-passplay-v2",
  ai: "runebags-save-ai-v2",
  online: "runebags-save-online-v2",
};

function getStorageKey(mode) {
  return STORAGE_KEYS[mode] || STORAGE_KEYS.passplay;
}

export function saveModeSave(mode, payload) {
  localStorage.setItem(getStorageKey(mode), JSON.stringify(payload));
}

export function loadModeSave(mode) {
  const raw = localStorage.getItem(getStorageKey(mode));
  if (!raw) {
    if (mode === "passplay") {
      return loadLegacyPassPlaySave();
    }
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

function loadLegacyPassPlaySave() {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const state = JSON.parse(raw);
    return { state };
  } catch {
    return null;
  }
}

export function saveGame(state) {
  saveModeSave("passplay", { state });
}

export function loadGame() {
  const saved = loadModeSave("passplay");
  return saved?.state || null;
}

export function clearSave() {
  clearModeSave("passplay");
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
