const TUTORIAL_MESSAGES = {
  shop: [
    {
      id: "shop-add",
      position: "shop",
      text: "Here is the shop, try adding new runes to your bag!",
    },
    {
      id: "shop-remove",
      position: "shop",
      text: "You can also remove bad runes from your bag, try it!",
    },
    {
      id: "shop-combine",
      position: "shop",
      text: "If you have 2 runes of the same symbol, you can combine them into a single powered up rune!",
    },
    {
      id: "shop-next",
      position: "shop",
      text: "When you are ready, go next!",
    },
  ],
  round: [
    {
      id: "round-play",
      position: "board",
      text: "On your turn, select a rune in your hand and select a column to play it in!",
    },
    {
      id: "round-hover",
      position: "board",
      text: "You can hover a rune on the board to see its effect!",
    },
    {
      id: "round-connect-four",
      position: "status",
      text: "To win the round and a point, you must connect a line of 4 of your runes! (vertically, horizontally or diagonally)",
    },
    {
      id: "round-pass",
      position: "status",
      text: "When a player has an empty bag and hand or cannot play, they must pass and the opponent plays again!",
    },
    {
      id: "round-tie-remove-point",
      position: "status",
      text: "At the end of the round, if all players pass and no lines of 4 have been made, a point is removed from the supply.",
    },
    {
      id: "round-majority-win",
      position: "status",
      text: "Gain a majority of the points remaining in the game to win it!",
    },
    {
      id: "round-bag-tiebreak",
      position: "status",
      text: "If there are no points remaining in the supply and both players have an equal amount of points, the player with the fewest runes in the bag wins!",
    },
  ],
};

const ALL_TRIGGER_IDS = new Set(
  Object.values(TUTORIAL_MESSAGES)
    .flat()
    .map((entry) => entry.id),
);

const MESSAGE_BY_ID = new Map(
  Object.values(TUTORIAL_MESSAGES)
    .flat()
    .map((entry) => [entry.id, entry]),
);

const MESSAGE_OBJECTIVE_LABELS = {
  "shop-add": "Add runes from the shop offer.",
  "shop-remove": "Remove one rune from your bag.",
  "shop-combine": "Watch for the first combine opportunity.",
  "shop-next": "Start the next round when shopping is done.",
  "round-play": "Select a rune in hand, then pick a column.",
  "round-connect-four": "Goal: make a line of four runes.",
  "round-hover": "Hover a board rune to read its effect.",
  "round-pass": "Learn the forced-pass rule.",
  "round-tie-remove-point": "Learn tied-round point removal.",
  "round-majority-win": "Learn majority point victory.",
  "round-bag-tiebreak": "Learn the final bag-size tiebreak.",
};

const OPTIONAL_TRIGGER_IDS = new Set([
  "round-pass",
  "round-tie-remove-point",
  "round-bag-tiebreak",
]);

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
    shopAddActionSeen: false,
    lastShopAddedCountByPlayer: {
      1: 0,
      2: 0,
    },
    lastShopAddLimitByPlayer: {
      1: 2,
      2: 2,
    },
    lastCombineVisibleByPlayer: {
      1: false,
      2: false,
    },
    shopAddLimitReachedSeen: false,
    currentShopAddCount: 0,
    currentShopAddLimit: 2,
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
    state.typedLength = state.active.text.length;
    elements.tutorialDialogText.textContent = state.active.text;
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
    state.typedLength = 0;
    elements.tutorialDialogText.textContent = "";

    const tickMs = 14;
    state.typingTimer = window.setInterval(() => {
      if (!state.active) {
        stopTyping();
        return;
      }

      state.typedLength += 1;
      if (state.typedLength >= message.text.length) {
        state.typedLength = message.text.length;
        elements.tutorialDialogText.textContent = message.text;
        stopTyping();
        return;
      }

      elements.tutorialDialogText.textContent = message.text.slice(0, state.typedLength);
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

  function enqueueMessageById(id) {
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

    const sequenceKey = message.id.startsWith("shop-") ? "shop" : "round";
    state.queue.push({ ...message, sequenceKey });
  }

  function enqueueMessages(ids) {
    ids.forEach((id) => enqueueMessageById(id));
    showNextMessage();
  }

  function enqueueSequence(sequenceKey) {
    if (!state.enabled || state.completed) {
      return;
    }

    const sequence = TUTORIAL_MESSAGES[sequenceKey] || [];
    if (sequence.length === 0) {
      return;
    }

    const queuedIds = new Set(state.queue.map((entry) => entry.id));
    if (state.active?.id) {
      queuedIds.add(state.active.id);
    }

    sequence.forEach((entry) => {
      if (state.shownTriggerIds.has(entry.id) || queuedIds.has(entry.id)) {
        return;
      }
      state.queue.push({ ...entry, sequenceKey });
      queuedIds.add(entry.id);
    });

    showNextMessage();
  }

  function maybeQueueForPhase(phase) {
    state.phase = phase;
    if (!state.enabled || state.completed || !state.introPromptSeen || !isEligibleMode()) {
      return;
    }

    if (phase === "shop") {
      enqueueMessages(["shop-add"]);
    }
  }

  function syncShopAddProgress(gameState) {
    const shopPlayers = gameState?.shop?.players;
    const shopCurrentPlayerId = Number(gameState?.shop?.currentPlayer) || 1;
    const currentShopData = shopPlayers?.[shopCurrentPlayerId];
    state.currentShopAddCount = Math.max(0, Number(currentShopData?.addedCount) || 0);
    state.currentShopAddLimit = Math.max(1, Number(currentShopData?.addLimit) || 2);

    [1, 2].forEach((playerId) => {
      const addedCount = Math.max(0, Number(shopPlayers?.[playerId]?.addedCount) || 0);
      const addLimit = Math.max(1, Number(shopPlayers?.[playerId]?.addLimit) || 2);
      if (addedCount > 0 || addedCount > state.lastShopAddedCountByPlayer[playerId]) {
        state.shopAddActionSeen = true;
      }
      if (addedCount >= addLimit) {
        state.shopAddLimitReachedSeen = true;
      }
      state.lastShopAddedCountByPlayer[playerId] = addedCount;
      state.lastShopAddLimitByPlayer[playerId] = addLimit;
    });
  }

  function getPlayerIdFromLogPrefix(logLine) {
    if (typeof logLine !== "string") {
      return null;
    }

    if (logLine.startsWith("Black ")) {
      return 1;
    }

    if (logLine.startsWith("White ")) {
      return 2;
    }

    return null;
  }

  function inspectRecentLogEvents(gameState) {
    const logEntries = Array.isArray(gameState?.log) ? gameState.log : [];
    const currentCount = logEntries.length;

    if (state.lastObservedLogCount === null) {
      state.lastObservedLogCount = currentCount;
      return;
    }

    if (currentCount < state.lastObservedLogCount) {
      state.lastObservedLogCount = currentCount;
      return;
    }

    if (currentCount === state.lastObservedLogCount) {
      return;
    }

    const newCount = currentCount - state.lastObservedLogCount;
    const newEntries = logEntries.slice(0, newCount);
    state.lastObservedLogCount = currentCount;

    if (state.shownTriggerIds.has("round-pass")) {
      return;
    }

    newEntries.forEach((entry) => {
      let playerId = null;
      if (entry && typeof entry === "object") {
        if (entry.k !== "log.mustPass") {
          return;
        }
        playerId = Number(entry.p?.player);
      } else if (typeof entry === "string") {
        if (!/cannot play and must pass\.$/.test(entry)) {
          return;
        }
        playerId = getPlayerIdFromLogPrefix(entry);
      } else {
        return;
      }

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
    syncShopAddProgress(gameState);
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
      if (!state.shownTriggerIds.has("shop-add")) {
        enqueueMessageById("shop-add");
      }
      if (state.shopAddLimitReachedSeen) {
        enqueueMessageById("shop-remove");
      }
      if (state.shownTriggerIds.has("shop-remove")) {
        enqueueMessageById("shop-next");
      }
      showNextMessage();
      return;
    }

    if (gameState.phase === "round" && gameState.roundNumber === 1) {
      if (gameState.turnNumber === 1) {
        enqueueMessageById("round-play");
      }
      if (gameState.turnNumber >= 2) {
        enqueueMessageById("round-connect-four");
      }
      if (gameState.turnNumber >= 3) {
        enqueueMessageById("round-hover");
      }
      showNextMessage();
      return;
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

    if (isVisible && !wasVisible) {
      enqueueMessages(["shop-combine"]);
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
    state.shopAddActionSeen = state.shownTriggerIds.has("shop-remove") || state.shownTriggerIds.has("shop-next");
    state.shopAddLimitReachedSeen = state.shownTriggerIds.has("shop-remove") || state.shownTriggerIds.has("shop-next");
    state.roundOneEnded = state.shownTriggerIds.has("round-majority-win") || state.shownTriggerIds.has("round-tie-remove-point");
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

  function getCueTargetsForActiveMessage() {
    const messageId = state.active?.id;
    if (!messageId) {
      return [];
    }

    if (messageId === "shop-add") {
      return ["shop-offer"];
    }

    if (messageId === "shop-remove") {
      return ["shop-bag", "shop-remove-btn"];
    }

    if (messageId === "shop-combine") {
      return ["shop-bag", "shop-combine-btn"];
    }

    if (messageId === "shop-next") {
      return ["phase-btn"];
    }

    if (messageId === "round-play") {
      return ["active-hand", "board"];
    }

    if (messageId === "round-connect-four") {
      return ["board"];
    }

    if (messageId === "round-hover") {
      return ["board"];
    }

    if (
      messageId === "round-pass"
      || messageId === "round-tie-remove-point"
      || messageId === "round-majority-win"
      || messageId === "round-bag-tiebreak"
    ) {
      return ["point-pool", "turn-pill"];
    }

    return [];
  }

  function getUiState() {
    const showOverlay = Boolean(
      state.gameScreenVisible
        && state.introPromptSeen
        && state.enabled
        && !state.completed
        && isEligibleMode(),
    );

    if (!showOverlay) {
      return {
        showChecklist: false,
        objectiveText: "",
        checklistItems: [],
        cueTargets: [],
      };
    }

    const addProgress = Math.min(state.currentShopAddCount, state.currentShopAddLimit);
    const pointsExplained = state.shownTriggerIds.has("round-majority-win")
      && (!state.roundOneWasDraw || state.shownTriggerIds.has("round-tie-remove-point"))
      && (!state.roundOneBagTiebreakRelevant || state.shownTriggerIds.has("round-bag-tiebreak"));

    const checklistItems = [
      {
        key: "add",
        label: `Add runes from the offer (${addProgress}/${state.currentShopAddLimit})`,
        done: state.shopAddLimitReachedSeen || state.shownTriggerIds.has("shop-remove"),
      },
      {
        key: "remove",
        label: "Remove one rune in shop",
        done: state.shownTriggerIds.has("shop-remove"),
      },
      {
        key: "combine",
        label: "See first combine opportunity",
        done: state.shownTriggerIds.has("shop-combine"),
      },
      {
        key: "round-play",
        label: "Play your first turn",
        done: state.shownTriggerIds.has("round-play"),
      },
      {
        key: "round-goal",
        label: "Read the round goal (line of 4)",
        done: state.shownTriggerIds.has("round-connect-four"),
      },
      {
        key: "round-hover",
        label: "Read the hover explanation",
        done: state.shownTriggerIds.has("round-hover"),
      },
      {
        key: "pass-rule",
        label: "See forced pass tip when a player has no bag and hand",
        done: state.shownTriggerIds.has("round-pass"),
      },
      {
        key: "points",
        label: "Read first-round point supply explanations",
        done: pointsExplained,
      },
    ];

    let objectiveText = "Tutorial complete.";
    if (state.active?.id) {
      objectiveText = MESSAGE_OBJECTIVE_LABELS[state.active.id] || state.active.text;
    } else {
      const nextItem = checklistItems.find((item) => !item.done);
      if (nextItem) {
        objectiveText = nextItem.label;
      }
    }

    return {
      showChecklist: true,
      objectiveText,
      checklistItems,
      cueTargets: getCueTargetsForActiveMessage(),
    };
  }

  return {
    loadProfileTutorialState,
    onGameEntered,
    maybeQueueForPhase,
    onGameStateUpdated,
    onShopAvailabilityChanged,
    setEnabled,
    getUiState,
    hideAll,
    syncToggle,
  };
}
