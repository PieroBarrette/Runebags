import { t } from "../i18n.js";

// Tutorial copy lives in i18n.js under tutorial.step.*; each step stores the key
// and is resolved through t() at display time, so bubbles follow the active
// language (and re-resolve when it changes via refreshActiveText()).
const TUTORIAL_MESSAGES = {
  shop: [
    { id: "shop-add", position: "shop", textKey: "tutorial.step.shopAdd" },
    { id: "shop-remove", position: "shop", textKey: "tutorial.step.shopRemove" },
    { id: "shop-combine", position: "shop", textKey: "tutorial.step.shopCombine" },
    { id: "shop-next", position: "shop", textKey: "tutorial.step.shopNext" },
  ],
  round: [
    { id: "round-play", position: "board", textKey: "tutorial.step.roundPlay" },
    { id: "round-connect-four", position: "status", textKey: "tutorial.step.roundConnectFour" },
    { id: "round-hover", position: "board", textKey: "tutorial.step.roundHover" },
    { id: "round-pass", position: "status", textKey: "tutorial.step.roundPass" },
    { id: "round-tie-remove-point", position: "status", textKey: "tutorial.step.roundTieRemovePoint" },
    { id: "round-majority-win", position: "status", textKey: "tutorial.step.roundMajorityWin" },
    { id: "round-bag-tiebreak", position: "status", textKey: "tutorial.step.roundBagTiebreak" },
  ],
};

const MESSAGE_BY_ID = new Map(
  Object.values(TUTORIAL_MESSAGES)
    .flat()
    .map((entry) => [entry.id, entry]),
);

const ALL_TRIGGER_IDS = new Set(MESSAGE_BY_ID.keys());

// The linear shop flow. Combine is contextual (event-driven) and intentionally
// excluded so it only appears when a real combine becomes available.
const SHOP_SEQUENCE_IDS = ["shop-add", "shop-remove", "shop-next"];

// Contextual tips that may never occur in a given game; they must not block the
// tutorial from auto-completing.
const OPTIONAL_TRIGGER_IDS = new Set([
  "shop-combine",
  "round-pass",
  "round-tie-remove-point",
  "round-bag-tiebreak",
]);

function messageText(message) {
  return message ? t(message.textKey) : "";
}

function asSet(value) {
  if (!Array.isArray(value)) {
    return new Set();
  }
  return new Set(value.filter((entry) => typeof entry === "string"));
}

export function createTutorialController(options) {
  const {
    elements,
    onPromptSeen,
    onSetEnabled,
    onSequenceSeen,
    onTriggerShown,
    onCompleted,
    onPromptResolved,
  } = options;

  const state = {
    mode: null,
    phase: null,
    gameScreenVisible: false,
    enabled: false,
    completed: false,
    introPromptSeen: false,
    shopSequenceSeen: false,
    roundSequenceSeen: false,
    shownTriggerIds: new Set(),
    queue: [],
    active: null,
    typedLength: 0,
    typingTimer: null,
    lastCombineVisibleByPlayer: {
      1: false,
      2: false,
    },
    lastObservedLogCount: null,
    roundOneEnded: false,
    roundOneWasDraw: false,
    roundOneBagTiebreakRelevant: false,
  };

  function stopTyping() {
    if (state.typingTimer !== null) {
      window.clearInterval(state.typingTimer);
      state.typingTimer = null;
    }
  }

  function hideBubble(clearQueue = false) {
    stopTyping();
    state.active = null;
    state.typedLength = 0;
    elements.tutorialDialog.hidden = true;
    elements.tutorialDialog.removeAttribute("data-position");
    elements.tutorialDialogText.textContent = "";
    if (clearQueue) {
      state.queue = [];
    }
  }

  function hidePrompt() {
    elements.tutorialPrompt.hidden = true;
  }

  function syncToggle() {
    if (elements.tutorialToggle) {
      elements.tutorialToggle.checked = state.enabled;
    }
  }

  function isEligibleMode() {
    return state.mode !== "online";
  }

  function flushTyping() {
    if (!state.active) {
      return;
    }
    stopTyping();
    const fullText = messageText(state.active);
    state.typedLength = fullText.length;
    elements.tutorialDialogText.textContent = fullText;
  }

  // Re-resolve the visible bubble in the current language (called when the player
  // switches language mid-tutorial). The text is shown in full rather than
  // restarting the typewriter to avoid a stale half-typed line.
  function refreshActiveText() {
    if (!state.active) {
      return;
    }
    flushTyping();
  }

  function maybeCompleteTutorial() {
    if (state.completed) {
      return;
    }

    const allSeen = [...ALL_TRIGGER_IDS]
      .filter((id) => !OPTIONAL_TRIGGER_IDS.has(id))
      .every((id) => state.shownTriggerIds.has(id));
    if (!allSeen) {
      return;
    }

    state.completed = true;
    onCompleted();
    if (state.enabled) {
      state.enabled = false;
      onSetEnabled(false);
      syncToggle();
    }
  }

  function markTriggerShown(id) {
    if (!id || state.shownTriggerIds.has(id)) {
      return;
    }

    state.shownTriggerIds.add(id);
    onTriggerShown(id);
    maybeCompleteTutorial();
  }

  function startTyping(message) {
    stopTyping();
    const fullText = messageText(message);
    state.typedLength = 0;
    elements.tutorialDialogText.textContent = "";

    const tickMs = 14;
    state.typingTimer = window.setInterval(() => {
      if (!state.active) {
        stopTyping();
        return;
      }

      state.typedLength += 1;
      if (state.typedLength >= fullText.length) {
        state.typedLength = fullText.length;
        elements.tutorialDialogText.textContent = fullText;
        stopTyping();
        return;
      }

      elements.tutorialDialogText.textContent = fullText.slice(0, state.typedLength);
    }, tickMs);
  }

  function showNextMessage() {
    if (!state.enabled || state.completed || !state.introPromptSeen || !state.gameScreenVisible || !isEligibleMode()) {
      hideBubble(true);
      return;
    }

    if (state.active || state.queue.length === 0) {
      return;
    }

    const next = state.queue.shift();
    if (!next || state.shownTriggerIds.has(next.id)) {
      showNextMessage();
      return;
    }

    if (next.sequenceKey === "shop" && !state.shopSequenceSeen) {
      state.shopSequenceSeen = true;
      onSequenceSeen("shop");
    }

    if (next.sequenceKey === "round" && !state.roundSequenceSeen) {
      state.roundSequenceSeen = true;
      onSequenceSeen("round");
    }

    state.active = next;
    elements.tutorialDialog.hidden = false;
    elements.tutorialDialog.setAttribute("data-position", next.position);
    startTyping(next);
  }

  function enqueueMessageById(id, { front = false } = {}) {
    if (!id || state.shownTriggerIds.has(id)) {
      return;
    }

    const message = MESSAGE_BY_ID.get(id);
    if (!message) {
      return;
    }

    const alreadyQueued = state.queue.some((entry) => entry.id === id) || state.active?.id === id;
    if (alreadyQueued) {
      return;
    }

    const sequenceKey = id.startsWith("shop-") ? "shop" : "round";
    const entry = { ...message, sequenceKey };
    if (front) {
      state.queue.unshift(entry);
    } else {
      state.queue.push(entry);
    }
  }

  function enqueueMessages(ids) {
    ids.forEach((id) => enqueueMessageById(id));
    showNextMessage();
  }

  function maybeQueueForPhase(phase) {
    state.phase = phase;
    if (!state.enabled || state.completed || !state.introPromptSeen || !isEligibleMode()) {
      return;
    }

    if (phase === "shop") {
      enqueueMessages(SHOP_SEQUENCE_IDS);
    }
  }

  // The forced-pass tip fires off the structured "log.mustPass" entry (logs are
  // newest-first), only when the passing player truly has no bag and no hand.
  function inspectRecentLogEvents(gameState) {
    const logEntries = Array.isArray(gameState?.log) ? gameState.log : [];
    const currentCount = logEntries.length;

    if (state.lastObservedLogCount === null || currentCount <= state.lastObservedLogCount) {
      state.lastObservedLogCount = currentCount;
      return;
    }

    const newCount = currentCount - state.lastObservedLogCount;
    const newEntries = logEntries.slice(0, newCount);
    state.lastObservedLogCount = currentCount;

    if (state.shownTriggerIds.has("round-pass")) {
      return;
    }

    newEntries.forEach((entry) => {
      if (!entry || typeof entry !== "object" || entry.k !== "log.mustPass") {
        return;
      }

      const playerId = Number(entry.p?.player);
      if (playerId !== 1 && playerId !== 2) {
        return;
      }

      const player = gameState.players?.[playerId];
      const handCount = Math.max(0, Number(player?.hand?.length) || 0);
      const bagCount = Math.max(0, Number(player?.bag?.length) || 0);
      if (handCount === 0 && bagCount === 0) {
        enqueueMessageById("round-pass");
      }
    });
  }

  function queueFirstRoundPointSupplyMessages() {
    const ids = ["round-majority-win"];

    if (state.roundOneWasDraw) {
      ids.push("round-tie-remove-point");
    }

    if (state.roundOneBagTiebreakRelevant) {
      ids.push("round-bag-tiebreak");
    }

    enqueueMessages(ids);
  }

  function onGameStateUpdated(gameState) {
    if (!gameState || typeof gameState !== "object") {
      return;
    }

    state.phase = gameState.phase;
    inspectRecentLogEvents(gameState);

    if (!state.roundOneEnded && gameState.roundNumber === 1) {
      if (gameState.phase === "round-end") {
        state.roundOneEnded = true;
        state.roundOneWasDraw = gameState.winner === null;
        queueFirstRoundPointSupplyMessages();
      } else if (gameState.phase === "game-over") {
        state.roundOneEnded = true;
        state.roundOneWasDraw = gameState.winner === null;
        state.roundOneBagTiebreakRelevant =
          gameState.gameWinnerReason === "fewest-bag-runes" || gameState.gameWinnerReason === "full-tie";
        queueFirstRoundPointSupplyMessages();
      }
    }

    if (!state.enabled || state.completed || !state.introPromptSeen || !state.gameScreenVisible || !isEligibleMode()) {
      return;
    }

    if (gameState.phase === "shop") {
      SHOP_SEQUENCE_IDS.forEach((id) => enqueueMessageById(id));
    } else if (gameState.phase === "round" && gameState.roundNumber === 1) {
      if (gameState.turnNumber >= 1) {
        enqueueMessageById("round-play");
      }
      if (gameState.turnNumber >= 2) {
        enqueueMessageById("round-connect-four");
      }
      if (gameState.turnNumber >= 3) {
        enqueueMessageById("round-hover");
      }
    }

    showNextMessage();
  }

  function onShopAvailabilityChanged(playerId, combineVisible) {
    const normalizedPlayerId = Number(playerId);
    if (normalizedPlayerId !== 1 && normalizedPlayerId !== 2) {
      return;
    }

    const wasVisible = Boolean(state.lastCombineVisibleByPlayer[normalizedPlayerId]);
    const isVisible = Boolean(combineVisible);
    state.lastCombineVisibleByPlayer[normalizedPlayerId] = isVisible;

    if (!state.enabled || state.completed || !state.introPromptSeen || !state.gameScreenVisible || !isEligibleMode()) {
      return;
    }

    if (state.phase !== "shop") {
      return;
    }

    // Surface the combine tip as soon as a combine becomes possible, ahead of the
    // remaining linear shop tips.
    if (isVisible && !wasVisible) {
      enqueueMessageById("shop-combine", { front: true });
      showNextMessage();
    }
  }

  function onDialogClick() {
    if (!state.active) {
      return;
    }

    const stillTyping = state.typingTimer !== null;
    if (stillTyping) {
      flushTyping();
      return;
    }

    const shownId = state.active.id;
    hideBubble(false);
    markTriggerShown(shownId);
    showNextMessage();
  }

  function resolvePrompt(accepted) {
    if (!state.introPromptSeen) {
      state.introPromptSeen = true;
      onPromptSeen();
    }

    hidePrompt();
    if (!accepted) {
      state.enabled = false;
      onSetEnabled(false);
      syncToggle();
      hideBubble(true);
    } else {
      if (!state.completed && !state.enabled) {
        state.enabled = true;
        onSetEnabled(true);
        syncToggle();
      }

      if (state.enabled && !state.completed) {
        maybeQueueForPhase(state.phase);
      }
    }

    onPromptResolved();
  }

  elements.tutorialDialog.addEventListener("click", onDialogClick);

  elements.tutorialPromptSureBtn.addEventListener("click", () => {
    resolvePrompt(true);
  });

  elements.tutorialPromptSkipBtn.addEventListener("click", () => {
    resolvePrompt(false);
  });

  // Enabling/disabling is driven by a checkbox whose checked state is the single
  // source of truth, so repeated/rapid toggles simply re-apply idempotently.
  function setEnabled(nextEnabled) {
    const enabled = Boolean(nextEnabled);
    state.enabled = enabled;
    onSetEnabled(enabled);
    if (!enabled) {
      hideBubble(true);
    } else if (!state.completed) {
      maybeQueueForPhase(state.phase);
    }
    syncToggle();
  }

  if (elements.tutorialToggle) {
    elements.tutorialToggle.addEventListener("change", () => {
      setEnabled(elements.tutorialToggle.checked);
    });
  }

  function loadProfileTutorialState(profileState) {
    state.enabled = Boolean(profileState?.enabled);
    state.completed = Boolean(profileState?.completed);
    state.introPromptSeen = Boolean(profileState?.introPromptSeen);
    state.shopSequenceSeen = Boolean(profileState?.shopSequenceSeen);
    state.roundSequenceSeen = Boolean(profileState?.roundSequenceSeen);
    state.shownTriggerIds = asSet(profileState?.shownTriggerIds);
    state.roundOneEnded =
      state.shownTriggerIds.has("round-majority-win") || state.shownTriggerIds.has("round-tie-remove-point");
    state.roundOneWasDraw = state.shownTriggerIds.has("round-tie-remove-point");
    state.roundOneBagTiebreakRelevant = state.shownTriggerIds.has("round-bag-tiebreak");
    state.lastObservedLogCount = null;

    if (state.completed && state.enabled) {
      state.enabled = false;
      onSetEnabled(false);
    }

    syncToggle();
  }

  function onGameEntered(mode, phase) {
    state.mode = mode;
    state.phase = phase;
    state.gameScreenVisible = true;
    state.lastObservedLogCount = null;

    if (!isEligibleMode()) {
      hidePrompt();
      hideBubble(true);
      return;
    }

    if (!state.introPromptSeen) {
      elements.tutorialPrompt.hidden = false;
      hideBubble(true);
      return;
    }

    hidePrompt();
    maybeQueueForPhase(phase);
  }

  function hideAll() {
    state.gameScreenVisible = false;
    hidePrompt();
    hideBubble(true);
    state.lastObservedLogCount = null;
  }

  return {
    loadProfileTutorialState,
    onGameEntered,
    maybeQueueForPhase,
    onGameStateUpdated,
    onShopAvailabilityChanged,
    setEnabled,
    hideAll,
    syncToggle,
    refreshActiveText,
  };
}
