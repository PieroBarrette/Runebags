const LEGACY_STORAGE_KEY = "runebags-save-v1";
const STORAGE_KEYS = {
  passplay: "runebags-save-passplay-v2",
  ai: "runebags-save-ai-v2",
  campaign: "runebags-save-campaign-v1",
  online: "runebags-save-online-v2",
};

function getStorageKey(mode, profileSlot = null) {
  if (profileSlot !== null && profileSlot !== undefined) {
    const slot = Number(profileSlot);
    if (Number.isInteger(slot) && slot >= 1 && slot <= 3) {
      return `runebags-profile-${slot}-save-${mode}-v3`;
    }
  }

  return STORAGE_KEYS[mode] || STORAGE_KEYS.passplay;
}

export function saveModeSave(mode, payload, profileSlot = null) {
  localStorage.setItem(getStorageKey(mode, profileSlot), JSON.stringify(payload));
}

export function loadModeSave(mode, profileSlot = null) {
  let raw = localStorage.getItem(getStorageKey(mode, profileSlot));

  if (!raw && profileSlot !== null && profileSlot !== undefined) {
    raw = localStorage.getItem(getStorageKey(mode));
  }

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

export function clearModeSave(mode, profileSlot = null) {
  localStorage.removeItem(getStorageKey(mode, profileSlot));
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
