// Standalone tutorial persistence (no profile system). Mirrors the shape the
// tutorial controller's loadProfileTutorialState() expects.
const TUTORIAL_STORAGE_KEY = "runebags-tutorial-v1";

function defaults() {
  return {
    enabled: false,
    completed: false,
    introPromptSeen: false,
    shopSequenceSeen: false,
    roundSequenceSeen: false,
    shownTriggerIds: [],
  };
}

function read() {
  try {
    const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
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
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

export function getTutorialState() {
  const stored = read() || {};
  const merged = { ...defaults(), ...stored };
  merged.shownTriggerIds = Array.isArray(stored.shownTriggerIds)
    ? stored.shownTriggerIds.filter((id) => typeof id === "string")
    : [];
  return merged;
}

export function setTutorialEnabled(enabled) {
  const state = getTutorialState();
  state.enabled = Boolean(enabled);
  write(state);
}

export function markTutorialPromptSeen() {
  const state = getTutorialState();
  state.introPromptSeen = true;
  write(state);
}

export function markTutorialSequenceSeen(sequenceKey) {
  const state = getTutorialState();
  if (sequenceKey === "shop") {
    state.shopSequenceSeen = true;
  } else if (sequenceKey === "round") {
    state.roundSequenceSeen = true;
  }
  write(state);
}

export function markTutorialTriggerShown(triggerId) {
  if (typeof triggerId !== "string") {
    return;
  }
  const state = getTutorialState();
  if (!state.shownTriggerIds.includes(triggerId)) {
    state.shownTriggerIds.push(triggerId);
  }
  write(state);
}

export function markTutorialCompleted() {
  const state = getTutorialState();
  state.completed = true;
  state.enabled = false;
  write(state);
}
