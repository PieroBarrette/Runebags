// One-time tips for a new player. Each says one thing, the first time it
// matters in the player's own game, and is not shown again once dismissed.
// This is not the step-by-step tutorial that was removed: nothing waits on a
// tip, and they can be switched off in Settings (switching them back on shows
// them all again).
const STORAGE_KEY = "runebags-tips-v1";
// Kept apart from the tips: re-enabling tips must not start another
// discovery game.
const PERMANENT_IDS = new Set(["discovery"]);

export function createTips({ card, text, okButton, translate }) {
  const stored = load();
  // True until this browser has stored anything here: lets the caller turn
  // tips off for someone who was already playing before they existed.
  const fresh = stored === null;
  let data = stored || { off: false, seen: {} };
  let current = null;
  const queue = [];

  okButton.addEventListener("click", () => {
    if (current) {
      markSeen(current.id);
    }
    next();
  });

  function show(id, key, params = {}) {
    if (data.off || data.seen[id] || current?.id === id || queue.some((tip) => tip.id === id)) {
      return;
    }
    queue.push({ id, key, params });
    if (!current) {
      next();
    }
  }

  function next() {
    current = queue.shift() || null;
    card.hidden = !current;
    if (current) {
      text.textContent = translate(current.key, current.params);
    }
  }

  // After a language change.
  function refreshText() {
    if (current) {
      text.textContent = translate(current.key, current.params);
    }
  }

  function hasSeen(id) {
    return Boolean(data.seen[id]);
  }

  function markSeen(id) {
    data.seen[id] = 1;
    save();
  }

  function isEnabled() {
    return !data.off;
  }

  function setEnabled(enabled) {
    data.off = !enabled;
    if (enabled) {
      data.seen = Object.fromEntries(Object.entries(data.seen).filter(([id]) => PERMANENT_IDS.has(id)));
    } else {
      queue.length = 0;
      current = null;
      card.hidden = true;
    }
    save();
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Private mode: tips simply come back next visit.
    }
  }

  function isFresh() {
    return fresh;
  }

  return { show, refreshText, hasSeen, markSeen, isEnabled, setEnabled, isFresh };
}

function load() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed && typeof parsed === "object") {
      return { off: Boolean(parsed.off), seen: { ...(parsed.seen || {}) } };
    }
  } catch {
    // Unreadable: start over.
  }
  return null;
}
