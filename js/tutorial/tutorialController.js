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
    if (elements.rulesTutorialToggle) {
      elements.rulesTutorialToggle.checked = Boolean(state.enabled);
      elements.rulesTutorialToggle.disabled = Boolean(state.completed);
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

    const allSeen = [...ALL_TRIGGER_IDS].every((id) => state.shownTriggerIds.has(id));
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
    if (!state.enabled || state.completed || !state.gameScreenVisible || !isEligibleMode()) {
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
    if (!state.enabled || state.completed || !isEligibleMode()) {
      return;
    }

    if (phase === "shop" && !state.shopSequenceSeen) {
      enqueueSequence("shop");
    }

    if (phase === "round" && !state.roundSequenceSeen) {
      enqueueSequence("round");
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
    } else if (state.enabled && !state.completed) {
      maybeQueueForPhase(state.phase);
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

  if (elements.rulesTutorialToggle) {
    elements.rulesTutorialToggle.addEventListener("change", (event) => {
      const nextEnabled = Boolean(event.target.checked);
      state.enabled = nextEnabled;
      onSetEnabled(nextEnabled);
      if (!nextEnabled) {
        hideBubble(true);
      } else {
        maybeQueueForPhase(state.phase);
      }
      syncToggle();
    });
  }

  function loadProfileTutorialState(profileState) {
    state.enabled = Boolean(profileState?.enabled);
    state.completed = Boolean(profileState?.completed);
    state.introPromptSeen = Boolean(profileState?.introPromptSeen);
    state.shopSequenceSeen = Boolean(profileState?.shopSequenceSeen);
    state.roundSequenceSeen = Boolean(profileState?.roundSequenceSeen);
    state.shownTriggerIds = asSet(profileState?.shownTriggerIds);

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
  }

  return {
    loadProfileTutorialState,
    onGameEntered,
    maybeQueueForPhase,
    hideAll,
    syncToggle,
  };
}
