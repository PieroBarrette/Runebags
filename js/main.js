import {
  createInitialState,
  enterShopPhase,
  getForcedVisiblePlayers,
  getPendingActionPrompt,
  getPendingBoardTargets,
  getPlayerName,
  getShopActionAvailability,
  getShopHighlights,
  getWinningLine,
  playTurn,
  resolvePendingBoardChoice,
  restoreState,
  selectRune,
  setShopMode,
  shopSelectBagRune,
  shopSelectOfferRune,
  startRoundFromShop,
  switchShopPlayer,
} from "./core/gameState.js";
import {
  createAiConfig,
  getAiThinkingText,
  runAiStep,
  setAiSettings,
  shouldAiAct,
} from "./ai/aiController.js";
import { renderBoard } from "./ui/boardView.js";
import { renderHands } from "./ui/handView.js";
import { renderLog } from "./ui/logView.js";
import { clearModeSave, loadModeSave, saveModeSave } from "./persistence/localStore.js";
import { createOnlineController } from "./online/onlineController.js";
import { getRuneById, RUNE_CATALOG } from "./runes/runeCatalog.js";
import { createSfxEngine } from "./audio/sfxEngine.js";

const THEME_STORAGE_KEY = "runebags-theme-v1";
const ANIMATION_STORAGE_KEY = "runebags-animations-v1";
const SOUND_STORAGE_KEY = "runebags-sound-v1";
const SOUND_VOLUME_STORAGE_KEY = "runebags-sound-volume-v1";
const RUNE_SELECTION_STORAGE_KEY = "runebags-rune-selection-v1";
const ONLINE_NAME_MAX = 14;
const MODE_PASSPLAY = "passplay";
const MODE_AI = "ai";
const MODE_ONLINE = "online";
const DEFAULT_SFX_VOLUME = 0.18;
const SELECTABLE_RUNES = RUNE_CATALOG.filter(
  (rune) => rune.type === "special" && rune.id !== "inguz" && rune.id !== "jera",
);
const SELECTABLE_RUNE_IDS = SELECTABLE_RUNES.map((rune) => rune.id);
const RUNES_WITH_LEVEL_PREFIX = new Set([
  "ehwaz",
  "fehu",
  "gebo",
  "mannaz",
  "perth",
  "raido",
  "sowelu",
  "teiwaz",
  "thurisa",
]);

const elements = {
  mainMenu: document.getElementById("main-menu"),
  menuAiBtn: document.getElementById("menu-ai-btn"),
  menuPassplayBtn: document.getElementById("menu-passplay-btn"),
  aiSideSelect: document.getElementById("ai-side-select"),
  aiDepthSelect: document.getElementById("ai-depth-select"),
  aiPanel: document.getElementById("ai-panel"),
  aiContinueBtn: document.getElementById("ai-continue-btn"),
  aiStartBtn: document.getElementById("ai-start-btn"),
  aiBackBtn: document.getElementById("ai-back-btn"),
  menuOnlineBtn: document.getElementById("menu-online-btn"),
  menuRulesBtn: document.getElementById("menu-rules-btn"),
  menuSettingsBtn: document.getElementById("menu-settings-btn"),
  settingsPanel: document.getElementById("settings-panel"),
  themeSelect: document.getElementById("theme-select"),
  animationToggle: document.getElementById("animation-toggle"),
  soundToggle: document.getElementById("sound-toggle"),
  soundVolume: document.getElementById("sound-volume"),
  runeList: document.getElementById("settings-rune-list"),
  settingsBackBtn: document.getElementById("settings-back-btn"),
  onlinePanel: document.getElementById("online-panel"),
  onlineServerDot: document.getElementById("online-server-dot"),
  onlineServerText: document.getElementById("online-server-text"),
  onlineQueueStatus: document.getElementById("online-queue-status"),
  onlineQueueText: document.getElementById("online-queue-text"),
  onlineRoomCode: document.getElementById("online-room-code"),
  onlineRoomLinkWrap: document.getElementById("online-room-link-wrap"),
  onlineRoomLink: document.getElementById("online-room-link"),
  onlineRoomQr: document.getElementById("online-room-qr"),
  onlineWaitingRoom: document.getElementById("online-waiting-room"),
  waitingRole: document.getElementById("waiting-role"),
  waitingSummary: document.getElementById("waiting-summary"),
  waitingYouStatus: document.getElementById("waiting-you-status"),
  waitingOpponentStatus: document.getElementById("waiting-opponent-status"),
  onlineQuickBtn: document.getElementById("online-quick-btn"),
  onlineFriendBtn: document.getElementById("online-friend-btn"),
  onlinePseudo: document.getElementById("online-pseudo"),
  onlineJoinCode: document.getElementById("online-join-code"),
  onlineJoinBtn: document.getElementById("online-join-btn"),
  onlineSendLinkBtn: document.getElementById("online-copy-link-btn"),
  onlineReadyBtn: document.getElementById("online-ready-btn"),
  onlineBackBtn: document.getElementById("online-back-btn"),
  rulesPanel: document.getElementById("rules-panel"),
  rulesBackBtn: document.getElementById("rules-back-btn"),
  gameScreen: document.getElementById("game-screen"),
  status: document.getElementById("game-status"),
  turnPill: document.getElementById("turn-pill"),
  boardPanel: document.getElementById("board-panel"),
  boardEl: document.getElementById("board"),
  boardRuneInfo: document.getElementById("board-rune-info"),
  boardRuneInfoTitle: document.getElementById("board-rune-info-title"),
  boardRuneInfoDescription: document.getElementById("board-rune-info-description"),
  menuBtn: document.getElementById("menu-btn"),
  phaseBtn: document.getElementById("phase-btn"),
  newGameBtn: document.getElementById("new-game-btn"),
  player1Panel: document.getElementById("player-1-panel"),
  player2Panel: document.getElementById("player-2-panel"),
  p1Name: document.getElementById("p1-name"),
  p2Name: document.getElementById("p2-name"),
  p1OnlineDot: document.getElementById("p1-online-dot"),
  p2OnlineDot: document.getElementById("p2-online-dot"),
  player1Hand: document.getElementById("p1-hand"),
  player2Hand: document.getElementById("p2-hand"),
  player1Toggle: document.getElementById("p1-hand-toggle"),
  player2Toggle: document.getElementById("p2-hand-toggle"),
  p1Bag: document.getElementById("p1-bag"),
  p2Bag: document.getElementById("p2-bag"),
  p1Discard: document.getElementById("p1-discard"),
  p2Discard: document.getElementById("p2-discard"),
  p1Points: document.getElementById("p1-points"),
  p2Points: document.getElementById("p2-points"),
  pointPool: document.getElementById("point-pool"),
  neutralSupply: document.getElementById("neutral-supply"),
  roundDiscards: document.getElementById("round-discards"),
  roundAwayList: document.getElementById("round-away-list"),
  logTabTurn: document.getElementById("log-tab-turn"),
  logTabChat: document.getElementById("log-tab-chat"),
  turnLog: document.getElementById("turn-log"),
  chatPanel: document.getElementById("chat-panel"),
  chatLog: document.getElementById("chat-log"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  shopPanel: document.getElementById("shop-panel"),
  shopPlayerTitle: document.getElementById("shop-player-title"),
  shopModeLabel: document.getElementById("shop-mode-label"),
  shopOffer: document.getElementById("shop-offer"),
  shopBag: document.getElementById("shop-bag"),
  endgameBagsPanel: document.getElementById("endgame-bags-panel"),
  endgameBagBlack: document.getElementById("endgame-bag-black"),
  endgameBagWhite: document.getElementById("endgame-bag-white"),
  shopInstruction: document.getElementById("shop-instruction"),
  shopSwitchPlayer: document.getElementById("shop-switch-player"),
  shopRemoveBtn: document.getElementById("shop-remove-btn"),
  shopCombineBtn: document.getElementById("shop-combine-btn"),
};

let selectedLocalRuneIds = loadRuneSelectionPreference();
let state = restoreState(
  getSavedStateForMode(MODE_PASSPLAY) || createInitialState(getLocalGameOptions()),
  getLocalGameOptions(),
);
let currentLocalMode = MODE_PASSPLAY;
let handVisibility = {
  1: state.currentPlayer === 1,
  2: state.currentPlayer === 2,
};
let activeRoomCode = null;
let waitingRoomState = createWaitingRoomState();
const aiConfig = createAiConfig();
const online = createOnlineController();
const sfx = createSfxEngine();
let aiBusy = false;
let aiTimer = null;
let animationsEnabled = true;
let soundEnabled = true;
let sfxVolume = DEFAULT_SFX_VOLUME;
let previousBoardSnapshot = null;
let previousPendingActionSnapshot = null;
let previousAudioSnapshot = null;
let suppressBoardClickOnce = false;
let activeFeedTab = "turn";
let onlineChatMessages = [];
let hasUnreadChat = false;

registerServiceWorker();

wireOnlineEvents();
bindEvents();
initializeTheme();
initializeAnimations();
initializeSound();
renderRuneSelectionSettings();
bindSoundUnlockHandlers();
render();
initializeEntryMode();

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // Service worker support is optional; app works normally if registration fails.
    });
  });
}

function wireOnlineEvents() {
  online.setListeners({
    waiting: (snapshot) => {
      if (snapshot.roomCode !== activeRoomCode) {
        onlineChatMessages = [];
      }
      const shouldAutoStart = Boolean(
        snapshot.canStart &&
        snapshot.youReady &&
        snapshot.opponentReady &&
        !snapshot.started
      );
      const previousAutoStartRequested = waitingRoomState.autoStartRequested;
      activeRoomCode = snapshot.roomCode;
      waitingRoomState = {
        mode: waitingRoomState.mode === "queue" ? "queue" : "friend",
        queued: false,
        queuePosition: 0,
        playerNames: snapshot.playerNames || waitingRoomState.playerNames,
        yourName: snapshot.youName || waitingRoomState.yourName,
        opponentName: snapshot.opponentName || waitingRoomState.opponentName,
        youReady: snapshot.youReady,
        opponentJoined: snapshot.opponentJoined,
        opponentReady: snapshot.opponentReady,
        canStart: snapshot.canStart,
        started: snapshot.started,
        playerId: snapshot.playerId,
        opponentConnected: snapshot.opponentConnected,
        shopReadyYou: false,
        shopReadyOpponent: false,
        autoStartRequested: shouldAutoStart ? previousAutoStartRequested : false,
      };

      applyOnlinePlayerNames();
      updateOnlineRoomUI(activeRoomCode);
      saveModeSave(MODE_ONLINE, {
        roomCode: activeRoomCode,
        playerId: snapshot.playerId,
        playerNames: snapshot.playerNames || null,
        updatedAt: Date.now(),
      });
      if (!elements.onlinePanel.hidden) {
        setStatus(`Room ${activeRoomCode}: ${getDisplayPlayerName(snapshot.playerId)} connected.`);
      }
      updateOnlineConnectionStatus();

      if (shouldAutoStart && !waitingRoomState.autoStartRequested) {
        waitingRoomState.autoStartRequested = true;
        online.startMatch();
      }
    },
    state: (snapshot) => {
      state = restoreState(snapshot.state);
      currentLocalMode = MODE_ONLINE;
      onlineChatMessages = Array.isArray(snapshot.chat) ? snapshot.chat.slice(-100) : [];
      waitingRoomState = {
        ...waitingRoomState,
        playerNames: snapshot.playerNames || waitingRoomState.playerNames,
        shopReadyYou: Boolean(snapshot.shopSync?.youReady),
        shopReadyOpponent: Boolean(snapshot.shopSync?.opponentReady),
      };
      applyOnlinePlayerNames();
      if (elements.gameScreen.hidden) {
        enterGameScreen("online", snapshot.roomCode);
      } else {
        render();
      }
      saveModeSave(MODE_ONLINE, {
        roomCode: snapshot.roomCode,
        playerId: snapshot.playerId,
        playerNames: snapshot.playerNames || null,
        state: snapshot.state,
        updatedAt: Date.now(),
      });
      updateOnlineConnectionStatus();
    },
    queue: (snapshot) => {
      waitingRoomState = {
        ...waitingRoomState,
        mode: "queue",
        queued: snapshot.queued,
        queuePosition: snapshot.position,
      };
      updateOnlineRoomUI(activeRoomCode || "-");
      if (snapshot.message) {
        setStatus(snapshot.message);
      }
    },
    chat: (message) => {
      if (!message || typeof message.text !== "string") {
        return;
      }
      onlineChatMessages.push(message);
      if (onlineChatMessages.length > 100) {
        onlineChatMessages = onlineChatMessages.slice(-100);
      }
      if (activeFeedTab === "turn") {
        hasUnreadChat = true;
      }
      if (!elements.gameScreen.hidden) {
        renderChatPanel();
      }
    },
    error: (message) => {
      setStatus(message);
      if (!elements.gameScreen.hidden) {
        window.alert(message);
      }
    },
    status: (message) => {
      if (!elements.gameScreen.hidden) {
        setStatus(message);
      }
      updateOnlineConnectionStatus();
    },
  });
}

function bindEvents() {
  bindButtonSoundEvents();

  elements.menuAiBtn.addEventListener("click", () => {
    showAiPanel();
  });

  elements.menuPassplayBtn.addEventListener("click", () => {
    persistState();
    if (online.isOnlineActive()) {
      online.leaveRoom();
    }

    currentLocalMode = MODE_PASSPLAY;
    state = restoreState(
      getSavedStateForMode(MODE_PASSPLAY) || createInitialState(getLocalGameOptions()),
      getLocalGameOptions(),
    );
    setAiSettings(aiConfig, false, aiConfig.playerId, aiConfig.depth);
    handVisibility = {
      1: state.currentPlayer === 1,
      2: state.currentPlayer === 2,
    };
    persistState();
    enterGameScreen("passplay");
    setStatus("Pass & Play resumed.");
    render();
  });

  elements.aiContinueBtn.addEventListener("click", () => {
    persistState();
    if (online.isOnlineActive()) {
      online.leaveRoom();
    }

    const savedAi = loadModeSave(MODE_AI);
    const canResumeAi = Boolean(savedAi?.state);
    if (!canResumeAi) {
      setStatus("No saved AI game found. Start a new game instead.");
      return;
    }

    const aiSide = Number(savedAi?.ai?.playerId || elements.aiSideSelect.value);
    const aiDepth = Number(savedAi?.ai?.depth || elements.aiDepthSelect.value);
    state = restoreState(savedAi.state, getLocalGameOptions());
    setAiSettings(aiConfig, true, aiSide, aiDepth);
    currentLocalMode = MODE_AI;
    if (state.phase === "shop" && state.shop.currentPlayer !== aiConfig.playerId) {
      switchShopPlayer(state);
    }
    handVisibility = { 1: aiSide !== 1, 2: aiSide !== 2 };
    elements.aiSideSelect.value = String(aiConfig.playerId);
    elements.aiDepthSelect.value = String(aiConfig.depth);
    setStatus(`AI game resumed. ${getPlayerName(aiConfig.playerId)} is AI (depth ${aiConfig.depth}).`);

    persistState();
    enterGameScreen("passplay");
    render();
  });

  elements.aiStartBtn.addEventListener("click", () => {
    persistState();
    if (online.isOnlineActive()) {
      online.leaveRoom();
    }

    const aiSide = Number(elements.aiSideSelect.value);
    const aiDepth = Number(elements.aiDepthSelect.value);
    state = restoreState(createInitialState(getLocalGameOptions()), getLocalGameOptions());
    setAiSettings(aiConfig, true, aiSide, aiDepth);
    currentLocalMode = MODE_AI;
    if (state.phase === "shop" && state.shop.currentPlayer !== aiConfig.playerId) {
      switchShopPlayer(state);
    }
    handVisibility = { 1: aiSide !== 1, 2: aiSide !== 2 };
    setStatus(`AI mode started. ${getPlayerName(aiConfig.playerId)} is AI (depth ${aiConfig.depth}).`);

    persistState();
    enterGameScreen("passplay");
    render();
  });

  elements.aiBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.menuOnlineBtn.addEventListener("click", async () => {
    persistState();
    setAiSettings(aiConfig, false, aiConfig.playerId, aiConfig.depth);
    const session = online.getSession();
    if (online.isOnlineActive() && session.roomCode) {
      enterGameScreen("online", session.roomCode);
      return;
    }

    if (session.roomCode) {
      activeRoomCode = session.roomCode;
      updateOnlineRoomUI(activeRoomCode);
    } else {
      const savedOnline = loadModeSave(MODE_ONLINE);
      const savedRoomCode = String(savedOnline?.roomCode || "").toUpperCase();
      activeRoomCode = null;
      waitingRoomState = createWaitingRoomState();
      if (/^[A-Z2-9]{6}$/.test(savedRoomCode)) {
        activeRoomCode = savedRoomCode;
        waitingRoomState.mode = "friend";
        elements.onlineJoinCode.value = savedRoomCode;
      }
      updateOnlineRoomUI(activeRoomCode || "-");
    }

    elements.onlinePseudo.value = normalizePseudo(elements.onlinePseudo.value || online.getSession().displayName || "");
    showOnlinePanel();
  });

  elements.onlineQuickBtn.addEventListener("click", async () => {
    const pseudo = getValidatedOnlinePseudo();
    if (!pseudo) {
      return;
    }
    online.setDisplayName(pseudo);
    online.leaveRoom();
    activeRoomCode = null;
    waitingRoomState = {
      ...createWaitingRoomState(),
      mode: "queue",
      queued: true,
      queuePosition: 1,
    };
    updateOnlineRoomUI("-");
    setStatus("Searching for opponent...");
    const ok = await online.joinQueue(pseudo);
    if (!ok) {
      waitingRoomState = createWaitingRoomState();
      updateOnlineRoomUI("-");
    }
  });

  elements.onlineFriendBtn.addEventListener("click", async () => {
    const pseudo = getValidatedOnlinePseudo();
    if (!pseudo) {
      return;
    }
    online.setDisplayName(pseudo);
    online.leaveRoom();
    activeRoomCode = createRoomCode();
    waitingRoomState = {
      ...createWaitingRoomState(),
      mode: "friend",
    };
    updateOnlineRoomUI(activeRoomCode);
    const ok = await online.createRoom(activeRoomCode, pseudo);
    if (!ok) {
      waitingRoomState = createWaitingRoomState();
      activeRoomCode = null;
      updateOnlineRoomUI("-");
    }
  });

  elements.onlineJoinBtn.addEventListener("click", async () => {
    const pseudo = getValidatedOnlinePseudo();
    if (!pseudo) {
      return;
    }
    online.setDisplayName(pseudo);
    const code = elements.onlineJoinCode.value.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) {
      window.alert("Enter a valid 6-character room code.");
      return;
    }

    online.leaveRoom();
    activeRoomCode = code;
    waitingRoomState = {
      ...createWaitingRoomState(),
      mode: "friend",
    };
    updateOnlineRoomUI(activeRoomCode);
    const ok = await online.joinRoom(code, { displayName: pseudo });
    if (!ok) {
      waitingRoomState = createWaitingRoomState();
      activeRoomCode = null;
      updateOnlineRoomUI("-");
    }
  });

  elements.menuRulesBtn.addEventListener("click", () => {
    showRulesPanel();
  });

  elements.menuSettingsBtn.addEventListener("click", () => {
    showSettingsPanel();
  });

  elements.settingsBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.themeSelect.addEventListener("change", () => {
    const selectedTheme = elements.themeSelect.value === "dark" ? "dark" : "light";
    applyTheme(selectedTheme);
    saveThemePreference(selectedTheme);
  });

  elements.animationToggle.addEventListener("change", () => {
    const enabled = Boolean(elements.animationToggle.checked);
    applyAnimationsSetting(enabled);
    saveAnimationsPreference(enabled);
  });

  elements.soundToggle.addEventListener("change", () => {
    const enabled = Boolean(elements.soundToggle.checked);
    applySoundSetting(enabled);
    saveSoundPreference(enabled);
  });

  elements.soundVolume.addEventListener("input", () => {
    const value = Number(elements.soundVolume.value);
    applySoundVolumeSetting(value / 100);
  });

  elements.soundVolume.addEventListener("change", () => {
    const value = Number(elements.soundVolume.value);
    const nextVolume = value / 100;
    applySoundVolumeSetting(nextVolume);
    saveSoundVolumePreference(nextVolume);
  });

  elements.runeList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[type=checkbox][data-rune-id]");
    if (!checkbox) {
      return;
    }

    const runeId = String(checkbox.dataset.runeId || "");
    if (!SELECTABLE_RUNE_IDS.includes(runeId)) {
      return;
    }

    const selectedSet = new Set(selectedLocalRuneIds);
    if (checkbox.checked) {
      selectedSet.add(runeId);
    } else {
      selectedSet.delete(runeId);
    }

    selectedLocalRuneIds = normalizeRuneSelection([...selectedSet]);
    saveRuneSelectionPreference(selectedLocalRuneIds);
    setStatus("Local rune set updated. Starts from your next new AI or Pass & Play game.");
  });

  elements.onlineBackBtn.addEventListener("click", () => {
    saveModeSave(MODE_ONLINE, {
      roomCode: activeRoomCode || online.getSession().roomCode || null,
      playerId: waitingRoomState.playerId || null,
      playerNames: waitingRoomState.playerNames || null,
      state,
      updatedAt: Date.now(),
    });
    online.leaveRoom();
    activeRoomCode = null;
    waitingRoomState = createWaitingRoomState();
    onlineChatMessages = [];
    showMainMenu();
  });

  elements.rulesBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.onlineSendLinkBtn.addEventListener("click", async () => {
    const link = activeRoomCode && activeRoomCode !== "-" ? buildRoomLink(activeRoomCode) : "";
    if (!link) {
      return;
    }

    const sharePayload = {
      title: "RuneBags Online Match",
      text: `Join my RuneBags room (${activeRoomCode}).`,
      url: link,
    };

    const canUseNativeShare = typeof navigator.share === "function"
      && (typeof navigator.canShare !== "function" || navigator.canShare({ url: link }));

    if (canUseNativeShare) {
      try {
        await navigator.share(sharePayload);
        elements.waitingSummary.textContent = "Share sent.";
        return;
      } catch (error) {
        if (error && error.name === "AbortError") {
          return;
        }
      }
    }

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(link);
        elements.waitingSummary.textContent = "Link copied. Paste it in your messaging app to send.";
      } else {
        elements.waitingSummary.textContent = "Share is not available on this device. Use the invite code above to send.";
      }
    } catch {
      elements.waitingSummary.textContent = "Could not copy automatically. Use the invite code above to send.";
    }
  });

  elements.onlineReadyBtn.addEventListener("click", () => {
    online.setReady(!waitingRoomState.youReady);
  });

  elements.logTabTurn.addEventListener("click", () => {
    activeFeedTab = "turn";
    renderChatPanel();
  });

  elements.logTabChat.addEventListener("click", () => {
    activeFeedTab = "chat";
    hasUnreadChat = false;
    renderChatPanel();
    elements.chatInput.focus();
  });

  elements.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!online.isOnlineActive()) {
      setStatus("Chat is available during online matches.");
      return;
    }

    const text = String(elements.chatInput.value || "").trim();
    if (!text) {
      return;
    }

    online.sendChat(text);
    elements.chatInput.value = "";
    elements.chatInput.focus();
  });

  elements.menuBtn.addEventListener("click", () => {
    cancelAiTimer();
    showMainMenu();
    if (!online.isOnlineActive()) {
      clearRoomQuery();
    }
  });

  elements.boardEl.addEventListener("click", (event) => {
    if (suppressBoardClickOnce) {
      suppressBoardClickOnce = false;
      return;
    }

    hideBoardRuneInfo();
    const cell = event.target.closest(".cell");
    if (!cell) {
      return;
    }

    const column = Number(cell.dataset.column);
    const row = Number(cell.dataset.row);

    if (online.isOnlineActive()) {
      online.sendAction("board_click", { row, col: column, column });
      return;
    }

    const result = state.pendingAction
      ? resolvePendingBoardChoice(state, { row, col: column, column })
      : playTurn(state, column, { row, col: column });

    state = result.state;
    if (result.error) {
      setStatus(result.error);
    }

    persistState();
    render();
    scheduleAiTurnIfNeeded();
  });

  elements.roundAwayList.addEventListener("click", (event) => {
    const runeCard = event.target.closest(".away-rune");
    if (!runeCard) {
      return;
    }

    const awayIndex = Number(runeCard.dataset.awayIndex);
    if (!Number.isInteger(awayIndex)) {
      return;
    }

    const action = state.pendingAction;
    if (!action || action.type !== "fehu-recover") {
      return;
    }

    if (online.isOnlineActive()) {
      if (waitingRoomState.playerId !== action.playerId) {
        return;
      }
      online.sendAction("board_click", { awayIndex });
      return;
    }

    const result = resolvePendingBoardChoice(state, { awayIndex });
    state = result.state;
    if (result.error) {
      setStatus(result.error);
    }

    persistState();
    render();
    scheduleAiTurnIfNeeded();
  });

  bindBoardRuneInfoEvents();

  [elements.player1Hand, elements.player2Hand].forEach((handEl) => {
    handEl.addEventListener("click", (event) => {
      const runeCard = event.target.closest(".rune-card");
      if (!runeCard) {
        return;
      }

      const playerId = Number(runeCard.dataset.playerId);
      const runeInstanceId = runeCard.dataset.runeInstanceId;

      if (online.isOnlineActive()) {
        if (playerId !== waitingRoomState.playerId) {
          return;
        }
        online.sendAction("select_rune", { runeInstanceId });
        return;
      }

      const result = selectRune(state, playerId, runeInstanceId);
      state = result.state;

      if (result.error) {
        setStatus(result.error);
      } else {
        setStatus(`${getPlayerName(playerId)} selected a rune.`);
      }

      persistState();
      render();
      scheduleAiTurnIfNeeded();
    });
  });

  elements.player1Toggle.addEventListener("click", () => {
    if (aiConfig.enabled && aiConfig.playerId === 1) {
      return;
    }
    if (getForcedVisiblePlayers(state)[1]) {
      return;
    }
    handVisibility[1] = !handVisibility[1];
    render();
  });

  elements.player2Toggle.addEventListener("click", () => {
    if (aiConfig.enabled && aiConfig.playerId === 2) {
      return;
    }
    if (getForcedVisiblePlayers(state)[2]) {
      return;
    }
    handVisibility[2] = !handVisibility[2];
    render();
  });

  elements.phaseBtn.addEventListener("click", () => {
    if (online.isOnlineActive()) {
      if (state.phase === "shop") {
        online.sendAction("shop_ready", { ready: !waitingRoomState.shopReadyYou });
        return;
      }
      online.sendAction("phase_action", {});
      return;
    }

    let result = { state, error: null };

    if (state.phase === "round-end") {
      result = enterShopPhase(state);
      if (!result.error && aiConfig.enabled) {
        const currentShopPlayer = result.state.shop.currentPlayer;
        if (currentShopPlayer !== aiConfig.playerId) {
          const switched = switchShopPlayer(result.state);
          result = switched;
        }
      }
    } else if (state.phase === "shop") {
      if (isPassPlayMode()) {
        const playerId = state.shop.currentPlayer;
        const data = state.shop.players[playerId];

        if (data) {
          if (!data.ready) {
            setShopMode(state, null);
          }
          data.ready = !data.ready;
          state.log.unshift(`${getDisplayPlayerName(playerId)} marked ${data.ready ? "ready" : "not ready"} in shop.`);

          if (state.shop.players[1].ready && state.shop.players[2].ready) {
            result = startRoundFromShop(state);
            if (!result.error) {
              handVisibility = {
                1: result.state.currentPlayer === 1,
                2: result.state.currentPlayer === 2,
              };
            }
          }
        }
      } else {
        result = startRoundFromShop(state);
        if (!result.error) {
          handVisibility = {
            1: result.state.currentPlayer === 1,
            2: result.state.currentPlayer === 2,
          };
        }
      }
    }

    state = result.state;
    if (result.error) {
      setStatus(result.error);
    }

    persistState();
    render();
    scheduleAiTurnIfNeeded();
  });

  elements.newGameBtn.addEventListener("click", () => {
    if (online.isOnlineActive()) {
      saveModeSave(MODE_ONLINE, {
        roomCode: activeRoomCode || online.getSession().roomCode || null,
        playerId: waitingRoomState.playerId || null,
        playerNames: waitingRoomState.playerNames || null,
        state,
        updatedAt: Date.now(),
      });
      online.leaveRoom();
      activeRoomCode = null;
      waitingRoomState = createWaitingRoomState();
      onlineChatMessages = [];
      clearRoomQuery();
      showMainMenu();
      return;
    }

    state = createInitialState(getLocalGameOptions());
    if (aiConfig.enabled && state.phase === "shop" && state.shop.currentPlayer !== aiConfig.playerId) {
      switchShopPlayer(state);
    }
    handVisibility = { 1: false, 2: true };
    if (aiConfig.enabled || currentLocalMode === MODE_AI) {
      clearModeSave(MODE_AI);
    } else {
      clearModeSave(MODE_PASSPLAY);
    }
    persistState();
    setStatus("New game created.");
    render();
  });

  elements.shopSwitchPlayer.addEventListener("click", () => {
    if (online.isOnlineActive()) {
      online.sendAction("shop_switch_player", {});
      return;
    }

    const result = switchShopPlayer(state);
    state = result.state;
    if (result.error) {
      setStatus(result.error);
      return;
    }

    persistState();
    render();
    scheduleAiTurnIfNeeded();
  });

  elements.shopRemoveBtn.addEventListener("click", () => {
    if (online.isOnlineActive()) {
      const mode = getCurrentShopMode();
      online.sendAction("shop_set_mode", { mode: mode === "remove" ? null : "remove" });
      return;
    }

    if (isCurrentLocalShopPlayerReady()) {
      setStatus("This player is marked ready. Click Cancel Ready to continue shopping.");
      return;
    }

    const mode = getCurrentShopMode();
    const result = setShopMode(state, mode === "remove" ? null : "remove");
    state = result.state;
    if (result.error) {
      setStatus(result.error);
    }
    persistState();
    render();
    scheduleAiTurnIfNeeded();
  });

  elements.shopCombineBtn.addEventListener("click", () => {
    if (online.isOnlineActive()) {
      const mode = getCurrentShopMode();
      online.sendAction("shop_set_mode", { mode: mode === "combine" ? null : "combine" });
      return;
    }

    if (isCurrentLocalShopPlayerReady()) {
      setStatus("This player is marked ready. Click Cancel Ready to continue shopping.");
      return;
    }

    const mode = getCurrentShopMode();
    const result = setShopMode(state, mode === "combine" ? null : "combine");
    state = result.state;
    if (result.error) {
      setStatus(result.error);
    }
    persistState();
    render();
    scheduleAiTurnIfNeeded();
  });

  elements.shopBag.addEventListener("click", (event) => {
    const runeCard = event.target.closest(".rune-card");
    if (!runeCard) {
      return;
    }

    const runeInstanceId = runeCard.dataset.runeInstanceId;

    if (online.isOnlineActive()) {
      online.sendAction("shop_bag_select", { runeInstanceId });
      return;
    }

    if (isCurrentLocalShopPlayerReady()) {
      setStatus("This player is marked ready. Click Cancel Ready to continue shopping.");
      return;
    }

    const result = shopSelectBagRune(state, runeInstanceId);
    state = result.state;
    if (result.error) {
      setStatus(result.error);
    }
    persistState();
    render();
  });

  elements.shopOffer.addEventListener("click", (event) => {
    const runeCard = event.target.closest(".rune-card");
    if (!runeCard) {
      return;
    }

    const runeInstanceId = runeCard.dataset.runeInstanceId;

    if (online.isOnlineActive()) {
      online.sendAction("shop_offer_select", { runeInstanceId });
      return;
    }

    if (isCurrentLocalShopPlayerReady()) {
      setStatus("This player is marked ready. Click Cancel Ready to continue shopping.");
      return;
    }

    const result = shopSelectOfferRune(state, runeInstanceId);
    state = result.state;
    if (result.error) {
      setStatus(result.error);
    }
    persistState();
    render();
    scheduleAiTurnIfNeeded();
  });
}

function bindBoardRuneInfoEvents() {
  elements.boardEl.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") {
      return;
    }

    const cell = event.target.closest(".cell");
    if (!cell) {
      return;
    }

    showBoardRuneInfoForCell(cell, false);
  });

  elements.boardEl.addEventListener("pointerout", (event) => {
    if (event.pointerType !== "mouse") {
      return;
    }

    if (event.relatedTarget && event.relatedTarget.closest(".cell")) {
      return;
    }

    hideBoardRuneInfo();
  });

  elements.boardEl.addEventListener("mouseleave", () => {
    hideBoardRuneInfo();
  });

  elements.boardEl.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch") {
      return;
    }

    const cell = event.target.closest(".cell");
    if (!cell) {
      hideBoardRuneInfo();
      return;
    }

    if (cell.classList.contains("target-cell")) {
      hideBoardRuneInfo();
      return;
    }

    const shown = showBoardRuneInfoForCell(cell, true);
    suppressBoardClickOnce = shown;
  });

  elements.boardEl.addEventListener("pointercancel", (event) => {
    if (event.pointerType !== "touch") {
      return;
    }

    suppressBoardClickOnce = false;
    hideBoardRuneInfo();
  });
}

function showBoardRuneInfoForCell(cell, fromTouch) {
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.column);
  const value = state.board[row]?.[col] || 0;
  const rune = state.boardRunes[row]?.[col] || null;

  if (!rune || value === 0) {
    hideBoardRuneInfo();
    return false;
  }

  const runeMeta = getRuneById(rune.id) || rune;
  if (!runeMeta?.name || !runeMeta?.description) {
    hideBoardRuneInfo();
    return false;
  }

  const levelLabel = runeMeta.supportsLevels && rune.level >= 2 ? ` Lv${rune.level}` : "";
  const etherealLabel = rune.ethereal ? " (Ethereal)" : "";
  elements.boardRuneInfoTitle.textContent = `${runeMeta.name}${levelLabel}${etherealLabel}`;
  elements.boardRuneInfoDescription.textContent = runeMeta.description;

  const panelRect = elements.boardPanel.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  const tooltipMargin = 8;
  elements.boardRuneInfo.hidden = false;
  elements.boardRuneInfo.style.visibility = "hidden";

  const tooltipRect = elements.boardRuneInfo.getBoundingClientRect();
  const tooltipWidth = Math.max(tooltipRect.width, 120);
  const tooltipHeight = Math.max(tooltipRect.height, 42);
  const cellCenterX = cellRect.left - panelRect.left + cellRect.width / 2;

  const minLeft = tooltipMargin;
  const maxLeft = Math.max(minLeft, panelRect.width - tooltipWidth - tooltipMargin);
  const left = Math.min(maxLeft, Math.max(minLeft, cellCenterX - tooltipWidth / 2));

  const preferredTop = cellRect.top - panelRect.top - tooltipHeight - tooltipMargin;
  const fallbackTop = cellRect.bottom - panelRect.top + tooltipMargin;
  const minTop = tooltipMargin;
  const maxTop = Math.max(minTop, panelRect.height - tooltipHeight - tooltipMargin);
  const useTopPlacement = preferredTop < minTop;
  const top = !useTopPlacement
    ? preferredTop
    : Math.min(maxTop, Math.max(minTop, fallbackTop));
  const arrowInset = 12;
  const arrowX = Math.min(tooltipWidth - arrowInset, Math.max(arrowInset, cellCenterX - left));

  elements.boardRuneInfo.style.left = `${left}px`;
  elements.boardRuneInfo.style.top = `${top}px`;
  elements.boardRuneInfo.style.setProperty("--arrow-x", `${arrowX}px`);
  elements.boardRuneInfo.style.visibility = "";
  elements.boardRuneInfo.hidden = false;
  elements.boardRuneInfo.dataset.side = useTopPlacement ? "top" : "bottom";
  elements.boardRuneInfo.dataset.touch = fromTouch ? "yes" : "no";
  return true;
}

function hideBoardRuneInfo() {
  suppressBoardClickOnce = false;
  elements.boardRuneInfo.hidden = true;
  elements.boardRuneInfo.style.removeProperty("--arrow-x");
  delete elements.boardRuneInfo.dataset.side;
  delete elements.boardRuneInfo.dataset.touch;
}

function render() {
  if (elements.gameScreen.hidden) {
    return;
  }

  hideBoardRuneInfo();

  const boardSnapshot = snapshotBoard(state);
  const audioSnapshot = snapshotAudioState(state, boardSnapshot);
  playSoundTransitions(previousAudioSnapshot, audioSnapshot);
  previousAudioSnapshot = audioSnapshot;

  const forcedVisible = getForcedVisiblePlayers(state);
  const pendingTargets = getPendingBoardTargets(state);
  const pendingSnapshot = snapshotPendingAction(state.pendingAction);
  const winningLine = getWinningLine(state);
  let forcedColumns = [];

  if (state.phase === "round" && !state.pendingAction) {
    const constraints = state.nextTurnConstraints?.[state.currentPlayer] || [];
    if (constraints.length > 0) {
      forcedColumns = constraints.filter((col) => state.board[0][col] === 0);
    }
  }

  if (state.phase === "round") {
    if (online.isOnlineActive()) {
      handVisibility = {
        1: false,
        2: false,
      };

      if (waitingRoomState.playerId) {
        handVisibility[waitingRoomState.playerId] = true;
      }
    } else if (aiConfig.enabled) {
      const humanPlayerId = aiConfig.playerId === 1 ? 2 : 1;
      handVisibility = {
        1: false,
        2: false,
      };
      handVisibility[humanPlayerId] = state.currentPlayer === humanPlayerId;
    } else {
      handVisibility = {
        1: state.currentPlayer === 1,
        2: state.currentPlayer === 2,
      };
    }
  }

  handVisibility[1] = forcedVisible[1] ? true : handVisibility[1];
  handVisibility[2] = forcedVisible[2] ? true : handVisibility[2];

  if (aiConfig.enabled && !forcedVisible[aiConfig.playerId]) {
    handVisibility[aiConfig.playerId] = false;
  }

  if (state.phase === "shop") {
    elements.player1Toggle.hidden = true;
    elements.player2Toggle.hidden = true;
  } else if (online.isOnlineActive()) {
    elements.player1Toggle.hidden = true;
    elements.player2Toggle.hidden = true;
    const yourId = waitingRoomState.playerId;
    const opponentId = yourId === 1 ? 2 : 1;

    if (opponentId) {
      const oppToggle = opponentId === 1 ? elements.player1Toggle : elements.player2Toggle;
      if (!forcedVisible[opponentId]) {
        oppToggle.textContent = "Hidden online";
      }
      oppToggle.disabled = true;
    }

    if (yourId) {
      const yourToggle = yourId === 1 ? elements.player1Toggle : elements.player2Toggle;
      if (!forcedVisible[yourId]) {
        yourToggle.textContent = "Your Hand";
        yourToggle.disabled = true;
      }
    }
  } else if (aiConfig.enabled) {
    elements.player1Toggle.hidden = true;
    elements.player2Toggle.hidden = true;
  } else {
    elements.player1Toggle.hidden = false;
    elements.player2Toggle.hidden = false;
  }

  const animationFrame = buildBoardAnimationFrame(
    state,
    animationsEnabled,
    previousBoardSnapshot,
    pendingTargets,
    previousPendingActionSnapshot,
    pendingSnapshot,
  );
  renderBoard(state, elements, pendingTargets, winningLine, forcedColumns, animationFrame);
  previousBoardSnapshot = boardSnapshot;
  previousPendingActionSnapshot = pendingSnapshot;
  renderHands(state, elements, handVisibility, forcedVisible);
  applyOnlinePlayerNames();

  renderLog(state, elements);
  renderChatPanel();
  renderShopPanel();
  renderEndgameBags();
  updateMeta();
  updateTopStatus();
  updateTopButtons();
  updateOnlineConnectionStatus();

  scheduleAiTurnIfNeeded();
}

function updateTopStatus() {
  if (state.pendingAction) {
    elements.turnPill.textContent = `Round ${state.roundNumber} - ${getDisplayPlayerName(state.currentPlayer)} choice`;
    elements.status.textContent = getPendingActionPrompt(state);
    return;
  }

  if (state.phase === "game-over") {
    elements.turnPill.textContent = state.gameWinner
      ? `Game Winner: ${getDisplayPlayerName(state.gameWinner)}`
      : "Game End: Draw";
    elements.status.textContent = state.gameWinner
      ? `${getDisplayPlayerName(state.gameWinner)} wins the game.`
      : "Game ended in a full tie.";
    return;
  }

  if (state.phase === "round-end") {
    if (state.winner) {
      elements.turnPill.textContent = `Round Winner: ${getDisplayPlayerName(state.winner)}`;
      elements.status.textContent = `Round ${state.roundNumber} won by ${getDisplayPlayerName(state.winner)}. Click Phase Action for shop.`;
    } else {
      elements.turnPill.textContent = `Round ${state.roundNumber}: Draw`;
      elements.status.textContent = "Round draw. Click Phase Action for shop.";
    }
    return;
  }

  if (state.phase === "shop") {
    elements.turnPill.textContent = online.isOnlineActive()
      ? "Shop Phase - Simultaneous"
      : `Shop Phase - ${getDisplayPlayerName(state.shop.currentPlayer)}`;
    elements.status.textContent = "Shop phase.";
    return;
  }

  elements.turnPill.textContent = `Round ${state.roundNumber} - Turn: ${getDisplayPlayerName(state.currentPlayer)}`;
  const selectedRuneId = state.players[state.currentPlayer]?.selectedRuneInstanceId;
  const selectedRune = selectedRuneId
    ? state.players[state.currentPlayer].hand.find((rune) => rune.instanceId === selectedRuneId)
    : null;
  if (selectedRune?.id === "nauthiz") {
    elements.status.textContent = `${getDisplayPlayerName(state.currentPlayer)}: choose any highlighted empty cell for Nauthiz.`;
    return;
  }

  const forcedColumns = state.nextTurnConstraints?.[state.currentPlayer] || [];
  if (forcedColumns.length > 0) {
    elements.status.textContent = `${getDisplayPlayerName(state.currentPlayer)}: forced to play adjacent columns (${forcedColumns.map((col) => col + 1).join(", ")}).`;
    return;
  }

  elements.status.textContent = `${getDisplayPlayerName(state.currentPlayer)}: choose a rune, then click a column.`;
}

function renderShopPanel() {
  const inShop = state.phase === "shop";
  elements.shopPanel.hidden = !inShop;
  elements.boardEl.hidden = inShop;
  elements.shopInstruction.hidden = !inShop;
  elements.shopSwitchPlayer.hidden = !inShop || online.isOnlineActive() || aiConfig.enabled;

  elements.phaseBtn.hidden = state.phase === "round" || state.phase === "game-over";
  if (online.isOnlineActive() && state.phase === "shop") {
    elements.phaseBtn.textContent = waitingRoomState.shopReadyYou ? "Cancel Ready" : "Shop Ready";
  } else if (isPassPlayMode() && state.phase === "shop") {
    const playerReady = Boolean(state.shop.players[state.shop.currentPlayer]?.ready);
    elements.phaseBtn.textContent = playerReady ? "Cancel Ready" : "Shop Ready";
  } else {
    elements.phaseBtn.textContent = state.phase === "shop" ? "Start Next Round" : "Start Shop Phase";
  }

  if (!inShop) {
    return;
  }

  if (online.isOnlineActive()) {
    const opponentId = waitingRoomState.playerId === 1 ? 2 : 1;
    const opponentPseudo = opponentId ? getDisplayPlayerName(opponentId) : (waitingRoomState.opponentName || "Opponent");
    const opponentStatus = waitingRoomState.shopReadyOpponent ? "ready" : "not ready";
    elements.shopInstruction.textContent = waitingRoomState.shopReadyYou
      ? `You are ready. ${opponentPseudo} is ${opponentStatus}.`
      : `Shop your own bag and offer, then click Shop Ready. ${opponentPseudo} is ${opponentStatus}.`;
  } else if (isPassPlayMode()) {
    const blackReady = state.shop.players[1]?.ready ? "ready" : "not ready";
    const whiteReady = state.shop.players[2]?.ready ? "ready" : "not ready";
    elements.shopInstruction.textContent = `Shop your own bag and offer, then click Shop Ready. Black is ${blackReady}, White is ${whiteReady}.`;
  } else {
    elements.shopInstruction.textContent = "Shop: remove once, combine pair, add up to 2 from offer.";
  }

  const playerId = online.isOnlineActive() && waitingRoomState.playerId
    ? waitingRoomState.playerId
    : state.shop.currentPlayer;

  const previousShopPlayer = state.shop.currentPlayer;
  if (previousShopPlayer !== playerId) {
    state.shop.currentPlayer = playerId;
  }

  const data = state.shop.players[playerId];
  const highlights = getShopHighlights(state);
  const actions = getShopActionAvailability(state);
  const playerReady = Boolean(data.ready);

  elements.shopPlayerTitle.textContent = online.isOnlineActive()
    ? `Your Shop - ${getDisplayPlayerName(playerId)}`
    : `Shop - ${getDisplayPlayerName(playerId)}`;
  elements.shopModeLabel.textContent = `Mode: ${data.mode || "none"} | Added: ${data.addedCount}/${data.addLimit} | Removes: ${data.removeCount}/${data.removeLimit} | Ready: ${playerReady ? "yes" : "no"}`;

  renderRuneList(elements.shopOffer, data.offer, playerId, highlights.offerHighlightIds);
  renderRuneList(elements.shopBag, state.players[playerId].bag, playerId, highlights.bagHighlightIds);

  elements.shopRemoveBtn.hidden = !actions.removeVisible;
  elements.shopCombineBtn.hidden = !actions.combineVisible;
  elements.shopRemoveBtn.disabled = playerReady && isPassPlayMode();
  elements.shopCombineBtn.disabled = playerReady && isPassPlayMode();

  if (previousShopPlayer !== playerId) {
    state.shop.currentPlayer = previousShopPlayer;
  }
}

function renderEndgameBags() {
  const inGameOver = state.phase === "game-over";
  elements.endgameBagsPanel.hidden = !inGameOver;

  if (!inGameOver) {
    return;
  }

  renderRuneList(elements.endgameBagBlack, state.players[1].bag, 1, [], { readOnly: true });
  renderRuneList(elements.endgameBagWhite, state.players[2].bag, 2, [], { readOnly: true });
}

function renderRuneList(container, runes, playerId, highlightIds, options = {}) {
  const readOnly = Boolean(options.readOnly);
  container.innerHTML = "";
  const highlightSet = new Set(highlightIds || []);

  if (!runes.length) {
    const empty = document.createElement("p");
    empty.className = "bag-meta";
    empty.textContent = "No runes in bag.";
    container.appendChild(empty);
    return;
  }

  runes.forEach((rune) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "rune-card";
    card.dataset.runeInstanceId = rune.instanceId;
    card.classList.add(playerId === 1 ? "player-1" : "player-2");

    if (readOnly) {
      card.classList.add("read-only");
      card.tabIndex = -1;
    }

    if (highlightSet.has(rune.instanceId)) {
      card.classList.add("shop-highlight");
    }

    if ((rune.etherealAtLevels || []).includes(rune.level)) {
      card.classList.add("ethereal");
    }

    if (rune.level >= 2) {
      card.classList.add("level-2");
    }

    const icon = document.createElement("div");
    icon.className = "rune-chip";
    const displayOwner = getRuneDisplayOwner(playerId, rune);
    if (displayOwner === 3) {
      icon.classList.add("neutral");
    } else {
      icon.classList.add(displayOwner === 1 ? "black" : "white");
    }

    if (rune.icon) {
      const symbol = document.createElement("img");
      symbol.src = rune.icon;
      symbol.alt = rune.name;
      symbol.className = "rune-chip-symbol";
      icon.appendChild(symbol);
    }

    const textWrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = rune.name;

    const subtitle = document.createElement("small");
    const shouldShowLevelPrefix = RUNES_WITH_LEVEL_PREFIX.has(rune.id) && (rune.maxLevel || 1) >= 2;
    subtitle.textContent = shouldShowLevelPrefix
      ? `L${rune.level} - ${rune.description}`
      : rune.description;

    if (rune.shopEffect) {
      const effect = document.createElement("small");
      effect.className = "shop-effect";
      effect.textContent = rune.shopEffect;
      textWrap.appendChild(title);
      textWrap.appendChild(subtitle);
      textWrap.appendChild(effect);
    } else {
      textWrap.appendChild(title);
      textWrap.appendChild(subtitle);
    }

    card.appendChild(icon);
    card.appendChild(textWrap);
    container.appendChild(card);
  });
}

function getRuneDisplayOwner(playerId, rune) {
  if (rune.id === "neutral") {
    return 3;
  }

  if (rune.capturedOwner === 1 || rune.capturedOwner === 2) {
    return rune.capturedOwner;
  }

  return playerId;
}

function updateMeta() {
  renderPointRunes(elements.p1Points, "Points", state.players[1].points);
  renderPointRunes(elements.p2Points, "Points", state.players[2].points);
  elements.p1Bag.textContent = `Bag: ${state.players[1].bag.length}`;
  elements.p1Discard.textContent = `Discard: ${state.players[1].discard.length}`;
  elements.p2Bag.textContent = `Bag: ${state.players[2].bag.length}`;
  elements.p2Discard.textContent = `Discard: ${state.players[2].discard.length}`;
  renderPointRunes(elements.pointPool, "Points", state.pointPoolRemaining);
  elements.neutralSupply.textContent = `Neutral Supply: ${state.neutralSupply}`;
  const visibleAway = state.roundAwayRunes.map((entry, awayIndex) => ({ ...entry, awayIndex }));
  const shouldShowAway = state.phase !== "shop" && visibleAway.length > 0;
  elements.roundDiscards.hidden = !shouldShowAway;
  elements.roundAwayList.hidden = !shouldShowAway;
  if (shouldShowAway) {
    elements.roundDiscards.textContent = `Away this round: ${visibleAway.length}`;
    renderRoundAwayRunes(visibleAway);
  } else {
    renderRoundAwayRunes([]);
  }
}

function renderPointRunes(target, label, count) {
  target.innerHTML = "";

  const labelEl = document.createElement("span");
  labelEl.className = "point-rune-label";
  labelEl.textContent = `${label}:`;

  const trackEl = document.createElement("span");
  trackEl.className = "point-rune-track";
  trackEl.setAttribute("aria-hidden", "true");

  const safeCount = Math.max(0, Number(count) || 0);
  for (let index = 0; index < safeCount; index += 1) {
    const runeEl = document.createElement("span");
    runeEl.className = "point-rune";
    trackEl.appendChild(runeEl);
  }

  const srText = document.createElement("span");
  srText.className = "sr-only";
  srText.textContent = `${label}: ${safeCount}`;

  target.appendChild(labelEl);
  target.appendChild(trackEl);
  target.appendChild(srText);
}

function renderRoundAwayRunes(entries) {
  elements.roundAwayList.innerHTML = "";

  const pendingFehu = state.pendingAction?.type === "fehu-recover"
    ? state.pendingAction
    : null;
  const canActOnFehu = pendingFehu && (!online.isOnlineActive() || waitingRoomState.playerId === pendingFehu.playerId);
  const selectableAwayIndexes = new Set(canActOnFehu ? pendingFehu.validAwayIndexes : []);

  entries.forEach((entry) => {
    const rune = getRuneById(entry.runeId);
    if (!rune) {
      return;
    }

    const isSelectable = selectableAwayIndexes.has(entry.awayIndex);
    const card = document.createElement(isSelectable ? "button" : "div");
    if (isSelectable) {
      card.type = "button";
    }
    card.className = "rune-card away-rune";
    if (entry.owner === 1 || entry.owner === 2) {
      card.classList.add(entry.owner === 1 ? "player-1" : "player-2");
    }
    if (isSelectable) {
      card.classList.add("selectable-away-rune");
      card.dataset.awayIndex = String(entry.awayIndex);
    }

    const icon = document.createElement("div");
    icon.className = "rune-chip";
    if (entry.owner === 1 || entry.owner === 2) {
      icon.classList.add(entry.owner === 1 ? "black" : "white");
    } else {
      icon.classList.add("neutral");
    }

    if (rune.icon) {
      const symbol = document.createElement("img");
      symbol.src = rune.icon;
      symbol.alt = rune.name;
      symbol.className = "rune-chip-symbol";
      icon.appendChild(symbol);
    }

    const textWrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${rune.name} L${entry.level}`;
    const subtitle = document.createElement("small");
    const ownerLabel = entry.owner === 1 ? "Black" : entry.owner === 2 ? "White" : "Neutral";
    subtitle.textContent = `Away (${entry.source}, ${ownerLabel})`;

    textWrap.appendChild(title);
    textWrap.appendChild(subtitle);
    card.appendChild(icon);
    card.appendChild(textWrap);
    elements.roundAwayList.appendChild(card);
  });
}

function renderChatPanel() {
  const isOnline = online.isOnlineActive();
  const showChat = activeFeedTab === "chat";

  if (!isOnline) {
    hasUnreadChat = false;
  }

  if (showChat) {
    hasUnreadChat = false;
  }

  elements.logTabTurn.classList.toggle("active", !showChat);
  elements.logTabChat.classList.toggle("active", showChat);
  elements.logTabChat.classList.toggle("has-notification", isOnline && hasUnreadChat && !showChat);
  elements.logTabTurn.setAttribute("aria-selected", String(!showChat));
  elements.logTabChat.setAttribute("aria-selected", String(showChat));

  elements.turnLog.hidden = showChat;
  elements.chatPanel.hidden = !showChat;
  elements.logTabChat.disabled = !isOnline;
  elements.chatInput.disabled = !isOnline;

  if (!showChat) {
    return;
  }

  elements.chatLog.innerHTML = "";
  if (!isOnline) {
    const row = document.createElement("div");
    row.className = "chat-row";
    row.textContent = "Chat is available only in online matches.";
    elements.chatLog.appendChild(row);
    return;
  }

  if (!onlineChatMessages.length) {
    const row = document.createElement("div");
    row.className = "chat-row";
    row.textContent = "No messages yet.";
    elements.chatLog.appendChild(row);
    return;
  }

  const yourId = waitingRoomState.playerId;
  onlineChatMessages.slice(-80).forEach((entry) => {
    const row = document.createElement("div");
    row.className = "chat-row";
    if (yourId && entry.playerId === yourId) {
      row.classList.add("you");
    }

    const author = document.createElement("span");
    author.className = "chat-author";
    author.textContent = `${entry.name || "Player"}:`;

    const text = document.createElement("span");
    text.textContent = ` ${entry.text || ""}`;

    row.appendChild(author);
    row.appendChild(text);
    elements.chatLog.appendChild(row);
  });

  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function getCurrentShopMode() {
  if (state.phase !== "shop") {
    return null;
  }

  const playerId = online.isOnlineActive() && waitingRoomState.playerId
    ? waitingRoomState.playerId
    : state.shop.currentPlayer;
  return state.shop.players[playerId].mode;
}

function isPassPlayMode() {
  return !online.isOnlineActive() && !aiConfig.enabled;
}

function isCurrentLocalShopPlayerReady() {
  if (!isPassPlayMode() || state.phase !== "shop") {
    return false;
  }

  const data = state.shop.players[state.shop.currentPlayer];
  return Boolean(data?.ready);
}

function setStatus(text) {
  elements.status.textContent = text;
}

function scheduleAiTurnIfNeeded() {
  if (online.isOnlineActive() || elements.gameScreen.hidden || aiBusy || !shouldAiAct(state, aiConfig)) {
    return;
  }

  cancelAiTimer();
  const thinkingText = getAiThinkingText(state, aiConfig);
  if (thinkingText) {
    setStatus(thinkingText);
  }

  aiBusy = true;
  aiTimer = window.setTimeout(() => {
    const result = runAiStep(state, aiConfig);
    state = result.state;
    aiBusy = false;
    aiTimer = null;

    if (result.error) {
      setStatus(result.error);
    } else if (result.note) {
      setStatus(result.note);
    }

    persistState();
    render();
  }, 220);
}

function cancelAiTimer() {
  if (aiTimer !== null) {
    window.clearTimeout(aiTimer);
    aiTimer = null;
  }
  aiBusy = false;
}

function initializeEntryMode() {
  const url = new URL(window.location.href);
  const mode = url.searchParams.get("mode");
  const room = url.searchParams.get("room");

  if (mode === "online" && room) {
    activeRoomCode = room.toUpperCase();
    waitingRoomState = {
      ...createWaitingRoomState(),
      mode: "friend",
    };
    elements.onlineJoinCode.value = activeRoomCode;
    updateOnlineRoomUI(activeRoomCode);
    showOnlinePanel();
    const pseudo = normalizePseudo(elements.onlinePseudo.value || online.getSession().displayName || "");
    elements.onlinePseudo.value = pseudo;
    online.setDisplayName(pseudo);
    return;
  }

  const savedOnline = loadModeSave(MODE_ONLINE);
  const savedRoomCode = String(savedOnline?.roomCode || "").toUpperCase();
  if (/^[A-Z2-9]{6}$/.test(savedRoomCode)) {
    activeRoomCode = savedRoomCode;
    waitingRoomState.mode = "friend";
    elements.onlineJoinCode.value = savedRoomCode;
  }

  showMainMenu();
}

function showMainMenu() {
  elements.mainMenu.hidden = false;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
}

function showAiPanel() {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = false;
  elements.settingsPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;

  const savedAi = loadModeSave(MODE_AI);
  if (savedAi?.ai?.playerId) {
    elements.aiSideSelect.value = String(savedAi.ai.playerId);
  }
  if (savedAi?.ai?.depth) {
    elements.aiDepthSelect.value = String(savedAi.ai.depth);
  }
  elements.aiContinueBtn.disabled = !savedAi?.state;
}

function showOnlinePanel() {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.onlinePanel.hidden = false;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  elements.onlinePseudo.value = normalizePseudo(elements.onlinePseudo.value || online.getSession().displayName || "");
  if (activeRoomCode && /^[A-Z2-9]{6}$/.test(activeRoomCode)) {
    elements.onlineJoinCode.value = activeRoomCode;
    waitingRoomState.mode = "friend";
  }
  updateOnlineConnectionStatus();
}

function showRulesPanel() {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = false;
  elements.gameScreen.hidden = true;
}

function showSettingsPanel() {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = false;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
}

function enterGameScreen(mode, roomCode = null) {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = false;

  if (mode === "online" && roomCode) {
    applyRoomQuery(roomCode);
    setStatus(`Online room ${roomCode}. Share your link with your opponent.`);
  } else {
    clearRoomQuery();
  }

  render();
}

function updateOnlineRoomUI(roomCode) {
  const isFriendMode = waitingRoomState.mode === "friend";
  const isQueueMode = waitingRoomState.mode === "queue";
  const showQueueStatus = isQueueMode && waitingRoomState.queued;
  const hasRoomCode = isFriendMode && typeof roomCode === "string" && /^[A-Z2-9]{6}$/.test(roomCode);
  const roomLink = hasRoomCode ? buildRoomLink(roomCode) : "";

  elements.onlineRoomCode.hidden = !hasRoomCode;
  elements.onlineRoomCode.textContent = hasRoomCode ? `Room: ${roomCode}` : "Room: -";
  if (elements.onlineQueueStatus) {
    elements.onlineQueueStatus.hidden = !showQueueStatus;
  }
  if (elements.onlineQueueText) {
    elements.onlineQueueText.textContent = showQueueStatus
      ? waitingRoomState.queuePosition > 1
        ? `Searching for opponent (queue #${waitingRoomState.queuePosition})...`
        : "Searching for opponent..."
      : "";
  }
  if (elements.onlineRoomLinkWrap) {
    elements.onlineRoomLinkWrap.hidden = !hasRoomCode;
  }
  if (elements.onlineRoomLink) {
    elements.onlineRoomLink.textContent = hasRoomCode ? roomCode : "-";
  }
  if (elements.onlineRoomQr) {
    if (hasRoomCode) {
      elements.onlineRoomQr.src = buildRoomQrUrl(roomLink);
      elements.onlineRoomQr.hidden = false;
    } else {
      elements.onlineRoomQr.removeAttribute("src");
      elements.onlineRoomQr.hidden = true;
    }
  }
  if (elements.onlineWaitingRoom) {
    elements.onlineWaitingRoom.hidden = !isFriendMode;
  }
  elements.waitingRole.hidden = !isFriendMode || !waitingRoomState.playerId;
  if (waitingRoomState.playerId) {
    elements.waitingRole.textContent = `You are: ${waitingRoomState.yourName || getDisplayPlayerName(waitingRoomState.playerId)}`;
  }

  elements.onlineReadyBtn.hidden = !isFriendMode || !waitingRoomState.opponentJoined;
  elements.onlineSendLinkBtn.hidden = !isFriendMode;
  elements.onlineReadyBtn.disabled = !isFriendMode || !waitingRoomState.opponentJoined;

  elements.waitingYouStatus.textContent = isFriendMode
    ? `${waitingRoomState.yourName || "You"}: ${waitingRoomState.youReady ? "Ready" : "Not ready"}`
    : `You: ${waitingRoomState.queued ? "In queue" : "Not queued"}`;

  if (isQueueMode) {
    elements.waitingOpponentStatus.textContent = waitingRoomState.queued
      ? waitingRoomState.queuePosition > 1
        ? `Queue position: ${waitingRoomState.queuePosition}`
        : "Queue position: 1"
      : "Queue: not active";
  } else {
    elements.waitingOpponentStatus.textContent = waitingRoomState.opponentJoined
      ? `${waitingRoomState.opponentName || "Opponent"}: ${waitingRoomState.opponentReady ? "Ready" : "Joined (not ready)"}${waitingRoomState.opponentConnected ? "" : " - offline"}`
      : "Opponent: Waiting to join...";
  }

  if (waitingRoomState.started) {
    elements.waitingSummary.textContent = "Match started. Entering game...";
    return;
  }

  if (isQueueMode) {
    elements.waitingSummary.textContent = waitingRoomState.queued
      ? "Searching for opponent..."
      : "";
    return;
  }

  if (isFriendMode) {
    if (waitingRoomState.canStart) {
      elements.waitingSummary.textContent = "Both players are ready. Starting match...";
      return;
    }
    if (!waitingRoomState.opponentJoined) {
      elements.waitingSummary.textContent = "Share your invite code. Waiting for opponent to join.";
      return;
    }
    elements.waitingSummary.textContent = waitingRoomState.youReady
      ? "You are ready. Waiting for opponent to be ready."
      : "Opponent joined. Set Ready when you are ready to start.";
    return;
  }

  elements.waitingSummary.textContent = "";
}

function createWaitingRoomState() {
  return {
    mode: "none",
    queued: false,
    queuePosition: 0,
    playerNames: null,
    yourName: "",
    opponentName: "",
    youReady: false,
    opponentJoined: false,
    opponentReady: false,
    canStart: false,
    started: false,
    playerId: null,
    opponentConnected: false,
    shopReadyYou: false,
    shopReadyOpponent: false,
    autoStartRequested: false,
  };
}

function updateOnlineConnectionStatus() {
  const serverConnected = isOnlineServerConnected();

  if (elements.onlineServerDot) {
    elements.onlineServerDot.classList.toggle("connected", serverConnected);
  }
  if (elements.onlineServerText) {
    elements.onlineServerText.textContent = serverConnected ? "Server: Connected" : "Server: Disconnected";
  }

  if (!online.isOnlineActive()) {
    elements.p1OnlineDot.hidden = true;
    elements.p2OnlineDot.hidden = true;
    elements.p1OnlineDot.classList.remove("connected");
    elements.p2OnlineDot.classList.remove("connected");
    return;
  }

  elements.p1OnlineDot.hidden = false;
  elements.p2OnlineDot.hidden = false;

  const yourId = waitingRoomState.playerId;
  const opponentId = yourId === 1 ? 2 : 1;

  const isP1Connected = yourId === 1
    ? true
    : opponentId === 1
      ? waitingRoomState.opponentConnected
      : false;
  const isP2Connected = yourId === 2
    ? true
    : opponentId === 2
      ? waitingRoomState.opponentConnected
      : false;

  elements.p1OnlineDot.classList.toggle("connected", isP1Connected);
  elements.p2OnlineDot.classList.toggle("connected", isP2Connected);
}

function isOnlineServerConnected() {
  const session = online.getSession();
  return Boolean(session.socket && session.socket.readyState === WebSocket.OPEN);
}

function updateTopButtons() {
  const onlineGame = online.isOnlineActive();
  elements.newGameBtn.hidden = false;
  elements.newGameBtn.textContent = onlineGame ? "Leave Game" : "New Game";
}

function getValidatedOnlinePseudo() {
  const pseudo = normalizePseudo(elements.onlinePseudo.value || "");
  if (!pseudo) {
    window.alert("Enter a temporary name (1-14 characters) before joining online.");
    return null;
  }

  elements.onlinePseudo.value = pseudo;
  return pseudo;
}

function normalizePseudo(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.slice(0, ONLINE_NAME_MAX);
}

function getDisplayPlayerName(playerId) {
  const mapped = waitingRoomState.playerNames?.[playerId];
  if (online.isOnlineActive() && mapped) {
    return mapped;
  }
  return getPlayerName(playerId);
}

function applyOnlinePlayerNames() {
  elements.p1Name.textContent = getDisplayPlayerName(1);
  elements.p2Name.textContent = getDisplayPlayerName(2);
}

function buildRoomLink(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("mode", "online");
  url.searchParams.set("room", roomCode);
  return url.toString();
}

function buildRoomQrUrl(link) {
  const base = "https://api.qrserver.com/v1/create-qr-code/";
  return `${base}?size=240x240&margin=0&data=${encodeURIComponent(link)}`;
}

function applyRoomQuery(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("mode", "online");
  url.searchParams.set("room", roomCode);
  history.replaceState(null, "", url);
}

function clearRoomQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete("mode");
  url.searchParams.delete("room");
  history.replaceState(null, "", url);
}

function createRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function persistState() {
  if (online.isOnlineActive()) {
    saveModeSave(MODE_ONLINE, {
      roomCode: activeRoomCode || online.getSession().roomCode || null,
      playerId: waitingRoomState.playerId || null,
      playerNames: waitingRoomState.playerNames || null,
      state,
      updatedAt: Date.now(),
    });
    return;
  }

  if (aiConfig.enabled || currentLocalMode === MODE_AI) {
    saveModeSave(MODE_AI, {
      state,
      ai: {
        playerId: aiConfig.playerId,
        depth: aiConfig.depth,
      },
      updatedAt: Date.now(),
    });
    return;
  }

  saveModeSave(MODE_PASSPLAY, {
    state,
    updatedAt: Date.now(),
  });
}

function getSavedStateForMode(mode) {
  const saved = loadModeSave(mode);
  if (!saved || typeof saved !== "object") {
    return null;
  }
  return saved.state || null;
}

function getLocalGameOptions() {
  return {
    allowedSpecialRuneIds: selectedLocalRuneIds,
  };
}

function normalizeRuneSelection(candidate) {
  const requested = Array.isArray(candidate) ? candidate : [];
  const requestedSet = new Set(requested.filter((id) => SELECTABLE_RUNE_IDS.includes(id)));
  return SELECTABLE_RUNE_IDS.filter((id) => requestedSet.has(id));
}

function loadRuneSelectionPreference() {
  const raw = localStorage.getItem(RUNE_SELECTION_STORAGE_KEY);
  if (!raw) {
    return [...SELECTABLE_RUNE_IDS];
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeRuneSelection(parsed);
    return normalized.length > 0 ? normalized : [];
  } catch {
    return [...SELECTABLE_RUNE_IDS];
  }
}

function saveRuneSelectionPreference(runeIds) {
  localStorage.setItem(RUNE_SELECTION_STORAGE_KEY, JSON.stringify(normalizeRuneSelection(runeIds)));
}

function renderRuneSelectionSettings() {
  elements.runeList.innerHTML = "";
  const selected = new Set(selectedLocalRuneIds);

  SELECTABLE_RUNES.forEach((rune) => {
    const row = document.createElement("label");
    row.className = "settings-rune-item";

    const main = document.createElement("span");
    main.className = "settings-rune-main";

    const chip = document.createElement("span");
    chip.className = "rune-chip neutral";

    if (rune.icon) {
      const symbol = document.createElement("img");
      symbol.src = rune.icon;
      symbol.alt = `${rune.name} symbol`;
      symbol.className = "rune-chip-symbol";
      chip.appendChild(symbol);
    }

    const textWrap = document.createElement("span");
    textWrap.className = "settings-rune-text";

    const title = document.createElement("strong");
    title.textContent = rune.name;

    const effect = document.createElement("small");
    effect.textContent = rune.description;

    textWrap.appendChild(title);
    textWrap.appendChild(effect);
    main.appendChild(chip);
    main.appendChild(textWrap);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "settings-rune-checkbox";
    checkbox.dataset.runeId = rune.id;
    checkbox.checked = selected.has(rune.id);
    checkbox.setAttribute("aria-label", `Include ${rune.name}`);

    row.appendChild(main);
    row.appendChild(checkbox);
    elements.runeList.appendChild(row);
  });
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const theme = savedTheme === "dark" ? "dark" : "light";
  applyTheme(theme);
  elements.themeSelect.value = theme;
}

function initializeAnimations() {
  const saved = localStorage.getItem(ANIMATION_STORAGE_KEY);
  const enabled = saved !== "off";
  applyAnimationsSetting(enabled);
}

function initializeSound() {
  const savedSound = localStorage.getItem(SOUND_STORAGE_KEY);
  const enabled = savedSound !== "off";
  const rawVolume = Number(localStorage.getItem(SOUND_VOLUME_STORAGE_KEY));
  const initialVolume = Number.isFinite(rawVolume)
    ? Math.max(0, Math.min(1, rawVolume))
    : DEFAULT_SFX_VOLUME;

  applySoundSetting(enabled);
  applySoundVolumeSetting(initialVolume);
}

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
}

function saveThemePreference(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function applyAnimationsSetting(enabled) {
  animationsEnabled = Boolean(enabled);
  document.body.setAttribute("data-animations", animationsEnabled ? "on" : "off");
  elements.animationToggle.checked = animationsEnabled;
  if (!animationsEnabled) {
    previousBoardSnapshot = snapshotBoard(state);
  }
  previousPendingActionSnapshot = snapshotPendingAction(state.pendingAction);
}

function saveAnimationsPreference(enabled) {
  localStorage.setItem(ANIMATION_STORAGE_KEY, enabled ? "on" : "off");
}

function applySoundSetting(enabled) {
  soundEnabled = Boolean(enabled);
  sfx.setEnabled(soundEnabled);
  elements.soundToggle.checked = soundEnabled;
  document.body.setAttribute("data-sound", soundEnabled ? "on" : "off");
}

function saveSoundPreference(enabled) {
  localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "on" : "off");
}

function applySoundVolumeSetting(volume) {
  sfxVolume = Math.max(0, Math.min(1, Number(volume)));
  sfx.setVolume(sfxVolume);
  elements.soundVolume.value = String(Math.round(sfxVolume * 100));
}

function saveSoundVolumePreference(volume) {
  const safe = Math.max(0, Math.min(1, Number(volume)));
  localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(safe));
}

function bindSoundUnlockHandlers() {
  const unlock = () => {
    sfx.unlockFromGesture();
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

function bindButtonSoundEvents() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) {
      return;
    }
    sfx.unlockFromGesture();
    sfx.play("ui-click");
  });
}

function snapshotAudioState(currentState, boardSnapshot) {
  const boardSignature = boardSnapshot
    .flat()
    .map((cell) => {
      if (!cell) {
        return "_";
      }
      return `${cell.instanceId || "x"}:${cell.owner}`;
    })
    .join("|");

  return {
    phase: currentState.phase,
    winner: currentState.winner,
    gameWinner: currentState.gameWinner,
    boardSignature,
  };
}

function playSoundTransitions(previousSnapshot, currentSnapshot) {
  if (!previousSnapshot || !soundEnabled) {
    return;
  }

  const moved = previousSnapshot.boardSignature !== currentSnapshot.boardSignature;
  if (moved && currentSnapshot.phase !== "shop") {
    sfx.play("move");
  }

  const enteredGameOver = previousSnapshot.phase !== "game-over" && currentSnapshot.phase === "game-over";
  if (enteredGameOver) {
    if (currentSnapshot.gameWinner) {
      sfx.play("game-win");
    } else {
      sfx.play("round-draw");
    }
    return;
  }

  const enteredRoundEnd = previousSnapshot.phase !== "round-end" && currentSnapshot.phase === "round-end";
  if (enteredRoundEnd) {
    if (currentSnapshot.winner) {
      sfx.play("round-win");
    } else {
      sfx.play("round-draw");
    }
  }
}

function snapshotBoard(currentState) {
  return currentState.boardRunes.map((row, rowIndex) => row.map((rune, colIndex) => {
    if (!rune) {
      return null;
    }
    return {
      instanceId: rune.instanceId || null,
      id: rune.id,
      owner: currentState.board[rowIndex][colIndex],
    };
  }));
}

function snapshotPendingAction(action) {
  if (!action) {
    return null;
  }

  const serializeCells = (cells = []) => cells
    .map((cell) => `${cell.row}:${cell.col}`)
    .sort()
    .join("|");
  const serializeColumns = (columns = []) => [...columns].sort((a, b) => a - b).join("|");
  const serializeAwayIndexes = (indexes = []) => [...indexes].sort((a, b) => a - b).join("|");

  return [
    action.type || "",
    serializeCells(action.validCells),
    serializeColumns(action.validColumns),
    serializeColumns(action.validSourceColumns),
    serializeColumns(action.validTargetColumns),
    serializeAwayIndexes(action.validAwayIndexes),
    action.sourceCol ?? "",
    action.remainingRecovers ?? "",
    action.remainingDrops ?? "",
  ].join(";");
}

function buildBoardAnimationFrame(
  currentState,
  enabled,
  previousSnapshot,
  pendingTargets,
  previousPendingSnapshot,
  currentPendingSnapshot,
) {
  const none = {
    enabled: false,
    placed: new Set(),
    placedFromBottom: new Set(),
    shiftedUp: new Set(),
    ansuzAfterFadeDrop: new Set(),
    ansuzGhostByCell: new Map(),
    geboAfterFadeDrop: new Set(),
    geboGhostByCell: new Map(),
    teiwazAfterLiftDrop: new Set(),
    teiwazLiftGhostByCell: new Map(),
    thurisaDrops: new Set(),
  };

  if (!enabled || currentState.phase !== "round" || !previousSnapshot) {
    return none;
  }

  const prevByInstance = new Map();
  const currByInstance = new Map();
  const prevCells = new Map();
  const currCells = new Map();

  for (let row = 0; row < currentState.rows; row += 1) {
    for (let col = 0; col < currentState.columns; col += 1) {
      const key = `${row}:${col}`;
      const prevRune = previousSnapshot[row]?.[col] || null;
      const currRune = currentState.boardRunes[row][col] || null;

      if (prevRune) {
        prevCells.set(key, prevRune);
        if (prevRune.instanceId) {
          prevByInstance.set(prevRune.instanceId, key);
        }
      }

      if (currRune) {
        currCells.set(key, currRune);
        if (currRune.instanceId) {
          currByInstance.set(currRune.instanceId, key);
        }
      }
    }
  }

  const placed = new Set();
  const placedFromBottom = new Set();
  const shiftedUp = new Set();
  const ansuzAfterFadeDrop = new Set();
  const ansuzGhostByCell = new Map();
  const geboAfterFadeDrop = new Set();
  const geboGhostByCell = new Map();
  const teiwazAfterLiftDrop = new Set();
  const teiwazLiftGhostByCell = new Map();
  const thurisaDrops = new Set();

  currCells.forEach((rune, key) => {
    const instanceId = rune.instanceId || null;
    if (!instanceId) {
      if (!prevCells.has(key)) {
        placed.add(key);
      }
      return;
    }

    const previousCell = prevByInstance.get(instanceId);
    if (!previousCell) {
      placed.add(key);
    }
  });

  const isThurisaResolution = (previousPendingSnapshot || "").startsWith("thurisa-drop;");
  if (isThurisaResolution) {
    placed.forEach((key) => {
      const rune = currCells.get(key);
      if (rune?.id === "neutral") {
        thurisaDrops.add(key);
      }
    });
  }

  const algizPlacements = [];
  placed.forEach((key) => {
    const rune = currCells.get(key);
    const previousCell = prevCells.get(key);

    if (rune?.id !== "algiz") {
      if (
        rune?.id === "ansuz" &&
        previousCell &&
        typeof previousCell.owner === "number" &&
        previousCell.owner !== 3
      ) {
        ansuzAfterFadeDrop.add(key);
        ansuzGhostByCell.set(key, previousCell);
      }
      return;
    }

    const [rowText, colText] = key.split(":");
    const row = Number(rowText);
    const col = Number(colText);
    if (Number.isNaN(row) || Number.isNaN(col)) {
      return;
    }

    if (row === currentState.rows - 1) {
      algizPlacements.push({ row, col, key });
      placedFromBottom.add(key);
    }
  });

  if (algizPlacements.length > 0) {
    currByInstance.forEach((currentKey, instanceId) => {
      const previousKey = prevByInstance.get(instanceId);
      if (!previousKey || previousKey === currentKey) {
        return;
      }

      const [prevRowText, prevColText] = previousKey.split(":");
      const [currRowText, currColText] = currentKey.split(":");
      const prevRow = Number(prevRowText);
      const prevCol = Number(prevColText);
      const currRow = Number(currRowText);
      const currCol = Number(currColText);

      if (
        Number.isNaN(prevRow) ||
        Number.isNaN(prevCol) ||
        Number.isNaN(currRow) ||
        Number.isNaN(currCol)
      ) {
        return;
      }

      const isAlgizColumnShift = algizPlacements.some(
        (entry) => entry.col === currCol && prevCol === currCol && prevRow === currRow + 1,
      );

      if (isAlgizColumnShift) {
        shiftedUp.add(currentKey);
      }
    });
  }

  const removedCellsByColumn = new Map();
  prevByInstance.forEach((previousKey, instanceId) => {
    if (currByInstance.has(instanceId)) {
      return;
    }

    const [rowText, colText] = previousKey.split(":");
    const row = Number(rowText);
    const col = Number(colText);
    if (Number.isNaN(row) || Number.isNaN(col)) {
      return;
    }

    if (!removedCellsByColumn.has(col)) {
      removedCellsByColumn.set(col, []);
    }
    removedCellsByColumn.get(col).push({ row, key: previousKey });

    const previousCell = prevCells.get(previousKey);
    if (previousCell && typeof previousCell.owner === "number") {
      geboGhostByCell.set(previousKey, previousCell);
    }
  });

  if (removedCellsByColumn.size > 0) {
    currByInstance.forEach((currentKey, instanceId) => {
      const previousKey = prevByInstance.get(instanceId);
      if (!previousKey || previousKey === currentKey) {
        return;
      }

      const [prevRowText, prevColText] = previousKey.split(":");
      const [currRowText, currColText] = currentKey.split(":");
      const prevRow = Number(prevRowText);
      const prevCol = Number(prevColText);
      const currRow = Number(currRowText);
      const currCol = Number(currColText);

      if (
        Number.isNaN(prevRow) ||
        Number.isNaN(prevCol) ||
        Number.isNaN(currRow) ||
        Number.isNaN(currCol)
      ) {
        return;
      }

      const hasRemovalInColumn = removedCellsByColumn.has(currCol);
      const movedDownOneCell = prevCol === currCol && currRow === prevRow + 1;

      if (hasRemovalInColumn && movedDownOneCell) {
        geboAfterFadeDrop.add(currentKey);
      }
    });
  }

  currByInstance.forEach((currentKey, instanceId) => {
    const previousKey = prevByInstance.get(instanceId);
    if (!previousKey || previousKey === currentKey) {
      return;
    }

    const [prevRowText, prevColText] = previousKey.split(":");
    const [currRowText, currColText] = currentKey.split(":");
    const prevRow = Number(prevRowText);
    const prevCol = Number(prevColText);
    const currRow = Number(currRowText);
    const currCol = Number(currColText);

    if (
      Number.isNaN(prevRow) ||
      Number.isNaN(prevCol) ||
      Number.isNaN(currRow) ||
      Number.isNaN(currCol)
    ) {
      return;
    }

    // Teiwaz moves the same top rune instance across columns.
    if (prevCol !== currCol) {
      const previousCell = prevCells.get(previousKey);
      if (previousCell && typeof previousCell.owner === "number") {
        teiwazLiftGhostByCell.set(previousKey, previousCell);
        teiwazAfterLiftDrop.add(currentKey);
      }
    }
  });

  const hasBoardChanges =
    (placed.size > 0 ||
      shiftedUp.size > 0 ||
      ansuzGhostByCell.size > 0 ||
      geboGhostByCell.size > 0 ||
      geboAfterFadeDrop.size > 0 ||
      teiwazLiftGhostByCell.size > 0 ||
      teiwazAfterLiftDrop.size > 0 ||
      thurisaDrops.size > 0) &&
    placed.size <= 8;

  if (!hasBoardChanges) {
    return none;
  }

  return {
    enabled: true,
    placed,
    placedFromBottom,
    shiftedUp,
    ansuzAfterFadeDrop,
    ansuzGhostByCell,
    geboAfterFadeDrop,
    geboGhostByCell,
    teiwazAfterLiftDrop,
    teiwazLiftGhostByCell,
    thurisaDrops,
  };
}
