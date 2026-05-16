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
import {
  addProfileWalletPoints,
  calculateProfileProgressPercent,
  getActiveProfileSlot,
  getProfileBySlot,
  getProfileSlots,
  getProfileWalletPoints,
  hasProfileSeenTutorial,
  markProfileTutorialSeen,
  setProfileAchievementProgress,
  setProfileCampaignProgress,
  setProfilePuzzleProgress,
  setActiveProfileSlot,
  spendProfileWalletPoints,
  touchProfileSlot,
  updateProfileName,
} from "./persistence/profileStore.js";
import { ACHIEVEMENT_CATALOG } from "./progression/achievementCatalog.js";
import { evaluateAchievementProgress } from "./progression/achievementEngine.js";
import { loadAchievementState, saveAchievementState } from "./persistence/achievementStore.js";
import { calculateGameReward, createRewardSnapshot } from "./progression/rewardEngine.js";
import { COSMETIC_CATALOG, getCosmeticById } from "./cosmetics/cosmeticCatalog.js";
import {
  canPurchase,
  isOwned,
  loadCosmeticState,
  ownCosmetic,
  saveCosmeticState,
  selectCosmetic,
} from "./persistence/cosmeticStore.js";
import { buildPuzzleState, getPuzzleById, getPuzzleCount, PUZZLE_CATALOG } from "./puzzles/puzzleCatalog.js";
import {
  isPuzzleSolved,
  loadPuzzleState,
  markPuzzleAttempt,
  markPuzzleSolved,
  savePuzzleState,
} from "./persistence/puzzleStore.js";
import { CAMPAIGN_NODES, getCampaignNodeById } from "./campaign/campaignCatalog.js";
import {
  addCampaignCombatPoints,
  addCampaignPerformancePoints,
  completeCampaignNode,
  getCampaignCompletion,
  loadCampaignState,
  resetCampaignRun,
  saveCampaignState,
  setCampaignBossName,
  spendCampaignReroll,
  startCampaignRun,
} from "./persistence/campaignStore.js";
import { buildCampaignEncounterState, getCampaignEncounterByNodeId } from "./campaign/campaignEncounterBuilder.js";
import { createOnlineController } from "./online/onlineController.js";
import { createRuneInstance, getRuneById, RUNE_CATALOG } from "./runes/runeCatalog.js";
import { createSfxEngine } from "./audio/sfxEngine.js";

const THEME_STORAGE_KEY = "runebags-theme-v1";
const ANIMATION_STORAGE_KEY = "runebags-animations-v1";
const SOUND_STORAGE_KEY = "runebags-sound-v1";
const SOUND_VOLUME_STORAGE_KEY = "runebags-sound-volume-v1";
const RUNE_SELECTION_STORAGE_KEY = "runebags-rune-selection-v1";
const ONLINE_NAME_MAX = 14;
const MODE_PASSPLAY = "passplay";
const MODE_AI = "ai";
const MODE_CAMPAIGN = "campaign";
const MODE_PUZZLE = "puzzle";
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
const CAMPAIGN_BOSS_NAME_POOL = [
  "The Glass Regent",
  "Ash Bishop",
  "The Wire Saint",
  "Crow-King Eidar",
  "Ivory Usurper",
  "The Hollow Marshal",
  "Nettle Tyrant",
  "The Seventh Seal",
];
const CAMPAIGN_FINAL_BOSS_NAME_POOL = ["The Last Crown", "The Void Arbiter", "The Pale Monarch"];
const CAMPAIGN_BOSS_CONSTRAINT_POOL = [
  "center-only",
  "center-flanks",
  "left-half",
  "right-half",
  "even-columns",
  "odd-columns",
  "no-center",
  "edges-only",
];

const elements = {
  profileEntryScreen: document.getElementById("profile-entry-screen"),
  profileEntryList: document.getElementById("profile-entry-list"),
  mainMenu: document.getElementById("main-menu"),
  menuCampaignBtn: document.getElementById("menu-campaign-btn"),
  menuAiBtn: document.getElementById("menu-ai-btn"),
  menuPassplayBtn: document.getElementById("menu-passplay-btn"),
  menuPuzzleBtn: document.getElementById("menu-puzzle-btn"),
  puzzlePanel: document.getElementById("puzzle-panel"),
  puzzleSummary: document.getElementById("puzzle-summary"),
  puzzleDifficultyFilter: document.getElementById("puzzle-difficulty-filter"),
  puzzleStatusFilter: document.getElementById("puzzle-status-filter"),
  puzzleList: document.getElementById("puzzle-list"),
  puzzleBackBtn: document.getElementById("puzzle-back-btn"),
  campaignPanel: document.getElementById("campaign-panel"),
  campaignSummary: document.getElementById("campaign-summary"),
  campaignMap: document.getElementById("campaign-map"),
  campaignLoadoutSummary: document.getElementById("campaign-loadout-summary"),
  campaignLoadoutList: document.getElementById("campaign-loadout-list"),
  campaignActionPanel: document.getElementById("campaign-action-panel"),
  campaignActionTitle: document.getElementById("campaign-action-title"),
  campaignActionBody: document.getElementById("campaign-action-body"),
  campaignStartBtn: document.getElementById("campaign-start-btn"),
  campaignResetBtn: document.getElementById("campaign-reset-btn"),
  campaignBackBtn: document.getElementById("campaign-back-btn"),
  aiSideSelect: document.getElementById("ai-side-select"),
  aiDepthSelect: document.getElementById("ai-depth-select"),
  aiPanel: document.getElementById("ai-panel"),
  aiContinueBtn: document.getElementById("ai-continue-btn"),
  aiStartBtn: document.getElementById("ai-start-btn"),
  aiBackBtn: document.getElementById("ai-back-btn"),
  menuOnlineBtn: document.getElementById("menu-online-btn"),
  menuShopBtn: document.getElementById("menu-shop-btn"),
  menuAchievementsBtn: document.getElementById("menu-achievements-btn"),
  menuProfileSwitchBtn: document.getElementById("menu-profile-switch-btn"),
  menuRulesBtn: document.getElementById("menu-rules-btn"),
  menuSettingsBtn: document.getElementById("menu-settings-btn"),
  settingsPanel: document.getElementById("settings-panel"),
  themeSelect: document.getElementById("theme-select"),
  animationToggle: document.getElementById("animation-toggle"),
  soundToggle: document.getElementById("sound-toggle"),
  soundVolume: document.getElementById("sound-volume"),
  runeList: document.getElementById("settings-rune-list"),
  settingsBackBtn: document.getElementById("settings-back-btn"),
  profilesPanel: document.getElementById("profiles-panel"),
  profilesList: document.getElementById("profiles-list"),
  profilesBackBtn: document.getElementById("profiles-back-btn"),
  achievementsPanel: document.getElementById("achievements-panel"),
  achievementsList: document.getElementById("achievements-list"),
  achievementsSummary: document.getElementById("achievements-summary"),
  achievementsBackBtn: document.getElementById("achievements-back-btn"),
  shopPanelMenu: document.getElementById("shop-panel-menu"),
  shopWalletSummary: document.getElementById("shop-wallet-summary"),
  shopCosmeticsList: document.getElementById("shop-cosmetics-list"),
  shopBackBtn: document.getElementById("shop-back-btn"),
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
  rewardPopup: document.getElementById("reward-popup"),
  rewardPopupBody: document.getElementById("reward-popup-body"),
  rewardPopupClose: document.getElementById("reward-popup-close"),
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
  shopRerollBtn: document.getElementById("shop-reroll-btn"),
  fxToastLayer: document.getElementById("fx-toast-layer"),
};

let selectedLocalRuneIds = loadRuneSelectionPreference();
let activeProfileSlot = getActiveProfileSlot();
let achievementState = loadAchievementState(activeProfileSlot);
let cosmeticState = loadCosmeticState(activeProfileSlot);
let puzzleState = loadPuzzleState(activeProfileSlot);
let campaignState = loadCampaignState(activeProfileSlot);
let state = restoreState(
  getSavedStateForMode(MODE_PASSPLAY, activeProfileSlot) || createInitialState(getLocalGameOptions()),
  getLocalGameOptions(),
);
let currentLocalMode = MODE_PASSPLAY;
let previousAchievementSnapshot = createAchievementSnapshot(state, currentLocalMode);
let previousRewardSnapshot = createRewardSnapshot(state, currentLocalMode);
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
let previousTurnPillText = "";
let previousStatusText = "";
let previousShopStateKey = "";
let suppressBoardClickOnce = false;
let activeFeedTab = "turn";
let onlineChatMessages = [];
let hasUnreadChat = false;
let pendingEntryRoute = null;
let rewardPopupShownForGame = false;
let activePuzzleId = null;
let puzzleOutcomeHandled = false;
let activeCampaignNodeId = null;
let campaignOutcomeHandled = false;
let campaignActiveActionNodeId = null;
let campaignActiveActionType = null;
let campaignSelectedShopAddIndexes = new Set();
let campaignInShopNode = false;
let puzzleDifficultyFilter = "all";
let puzzleStatusFilter = "all";

registerServiceWorker();

wireOnlineEvents();
bindEvents();
initializeTheme();
initializeAnimations();
initializeSound();
renderRuneSelectionSettings();
bindSoundUnlockHandlers();
applySelectedCosmetics();
refreshProfileHeader();
syncAchievementSummaryToProfile();
syncPuzzleSummaryToProfile();
syncCampaignSummaryToProfile();
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
      }, activeProfileSlot);
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
      if (elements.gameScreen.hidden) {
        resetAchievementTracking();
        resetRewardTracking();
      }
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
      }, activeProfileSlot);
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

  elements.profileEntryList.addEventListener("click", (event) => {
    const selectButton = event.target.closest("button[data-entry-profile-select]");
    if (selectButton) {
      const slot = Number(selectButton.dataset.entryProfileSelect);
      activateProfileSlot(slot, { force: true });
      continueAfterProfileEntry();
      return;
    }

    const renameButton = event.target.closest("button[data-entry-profile-rename]");
    if (renameButton) {
      const slot = Number(renameButton.dataset.entryProfileRename);
      const input = elements.profileEntryList.querySelector(`input[data-entry-profile-name=\"${slot}\"]`);
      if (!input) {
        return;
      }

      const nextName = String(input.value || "").trim();
      if (!nextName) {
        window.alert("Profile name cannot be empty.");
        input.focus();
        return;
      }

      updateProfileName(slot, nextName);
      refreshProfileHeader();
      renderProfileEntryScreen();
    }
  });

  elements.menuAiBtn.addEventListener("click", () => {
    showAiPanel();
  });

  elements.menuCampaignBtn.addEventListener("click", () => {
    showCampaignPanel();
  });

  elements.menuPassplayBtn.addEventListener("click", () => {
    persistState();
    touchProfileSlot(activeProfileSlot);
    if (online.isOnlineActive()) {
      online.leaveRoom();
    }

    currentLocalMode = MODE_PASSPLAY;
    state = restoreState(
      getSavedStateForMode(MODE_PASSPLAY, activeProfileSlot) || createInitialState(getLocalGameOptions()),
      getLocalGameOptions(),
    );
    setAiSettings(aiConfig, false, aiConfig.playerId, aiConfig.depth);
    handVisibility = {
      1: state.currentPlayer === 1,
      2: state.currentPlayer === 2,
    };
    resetAchievementTracking();
    resetRewardTracking();
    persistState();
    enterGameScreen("passplay");
    setStatus("Pass & Play resumed.");
    render();
  });

  elements.menuPuzzleBtn.addEventListener("click", () => {
    showPuzzlePanel();
  });

  elements.aiContinueBtn.addEventListener("click", () => {
    persistState();
    touchProfileSlot(activeProfileSlot);
    if (online.isOnlineActive()) {
      online.leaveRoom();
    }

    const savedAi = loadModeSave(MODE_AI, activeProfileSlot);
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
    resetAchievementTracking();
    resetRewardTracking();

    persistState();
    enterGameScreen("passplay");
    render();
  });

  elements.aiStartBtn.addEventListener("click", () => {
    persistState();
    touchProfileSlot(activeProfileSlot);
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
    resetAchievementTracking();
    resetRewardTracking();

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
      const savedOnline = loadModeSave(MODE_ONLINE, activeProfileSlot);
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

  elements.menuShopBtn.addEventListener("click", () => {
    showShopPanelMenu();
  });

  elements.menuAchievementsBtn.addEventListener("click", () => {
    showAchievementsPanel();
  });

  elements.menuProfileSwitchBtn.addEventListener("click", () => {
    showProfilesPanel();
  });

  elements.settingsBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.profilesBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.achievementsBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.puzzleBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.campaignBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.campaignStartBtn.addEventListener("click", () => {
    campaignState = startCampaignRun(campaignState);
    saveCampaignState(activeProfileSlot, campaignState);
    syncCampaignSummaryToProfile();
    const nextNode = getNextCampaignPlayableNode();
    if (nextNode) {
      resolveCampaignNode(nextNode.id);
      return;
    }
    renderCampaignPanel();
    showToast("Campaign run ready.", "info");
  });

  elements.campaignResetBtn.addEventListener("click", () => {
    campaignState = resetCampaignRun();
    saveCampaignState(activeProfileSlot, campaignState);
    syncCampaignSummaryToProfile();
    renderCampaignPanel();
    showToast("Campaign run reset.", "warn");
  });

  elements.puzzleDifficultyFilter.addEventListener("change", () => {
    const selected = String(elements.puzzleDifficultyFilter.value || "all").toLowerCase();
    puzzleDifficultyFilter = selected === "easy" || selected === "medium" || selected === "hard"
      ? selected
      : "all";
    renderPuzzlePanel();
  });

  elements.puzzleStatusFilter.addEventListener("change", () => {
    const selected = String(elements.puzzleStatusFilter.value || "all").toLowerCase();
    puzzleStatusFilter = selected === "solved" || selected === "unsolved" ? selected : "all";
    renderPuzzlePanel();
  });

  elements.shopBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.shopCosmeticsList.addEventListener("click", (event) => {
    const buyBtn = event.target.closest("button[data-cosmetic-buy]");
    if (buyBtn) {
      const id = String(buyBtn.dataset.cosmeticBuy || "");
      const cosmetic = getCosmeticById(id);
      if (!cosmetic) {
        return;
      }

      if (!canPurchase(cosmeticState, id)) {
        showToast("Item already owned or unavailable.", "warn");
        return;
      }

      const spent = spendProfileWalletPoints(activeProfileSlot, cosmetic.price);
      if (!spent) {
        showToast("Not enough profile points.", "warn");
        return;
      }

      cosmeticState = ownCosmetic(cosmeticState, id);
      saveCosmeticState(activeProfileSlot, cosmeticState);
      refreshProfileHeader();
      renderShopPanelMenu();
      showToast(`Purchased ${cosmetic.title} (-${cosmetic.price} pts).`, "reward");
      return;
    }

    const equipBtn = event.target.closest("button[data-cosmetic-equip]");
    if (equipBtn) {
      const id = String(equipBtn.dataset.cosmeticEquip || "");
      const cosmetic = getCosmeticById(id);
      if (!cosmetic) {
        return;
      }

      if (!isOwned(cosmeticState, id)) {
        showToast("Purchase this item before equipping.", "warn");
        return;
      }

      cosmeticState = selectCosmetic(cosmeticState, cosmetic);
      saveCosmeticState(activeProfileSlot, cosmeticState);
      applySelectedCosmetics();
      renderShopPanelMenu();
      showToast(`Equipped ${cosmetic.title}.`, "reward");
    }
  });

  elements.puzzleList.addEventListener("click", (event) => {
    const startBtn = event.target.closest("button[data-puzzle-start]");
    if (!startBtn) {
      return;
    }

    const puzzleId = String(startBtn.dataset.puzzleStart || "");
    startPuzzleById(puzzleId);
  });

  const handleCampaignPanelClick = (event) => {
    const startBtn = event.target.closest("button[data-campaign-node-start]");
    if (startBtn) {
      const nodeId = String(startBtn.dataset.campaignNodeStart || "");
      resolveCampaignNode(nodeId);
      return;
    }
  };

  elements.campaignMap.addEventListener("click", handleCampaignPanelClick);
  elements.campaignActionBody.addEventListener("click", handleCampaignPanelClick);
  elements.campaignLoadoutList.addEventListener("click", handleCampaignPanelClick);

  elements.rewardPopupClose.addEventListener("click", () => {
    elements.rewardPopup.hidden = true;
  });

  elements.profilesList.addEventListener("click", (event) => {
    const selectButton = event.target.closest("button[data-profile-select]");
    if (selectButton) {
      const slot = Number(selectButton.dataset.profileSelect);
      activateProfileSlot(slot);
      showMainMenu();
      return;
    }

    const renameButton = event.target.closest("button[data-profile-rename]");
    if (renameButton) {
      const slot = Number(renameButton.dataset.profileRename);
      const input = elements.profilesList.querySelector(`input[data-profile-name=\"${slot}\"]`);
      if (!input) {
        return;
      }

      const nextName = String(input.value || "").trim();
      if (!nextName) {
        window.alert("Profile name cannot be empty.");
        input.focus();
        return;
      }

      updateProfileName(slot, nextName);
      refreshProfileHeader();
      renderProfilesPanel();
    }
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
    }, activeProfileSlot);
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
    if (currentLocalMode === MODE_PUZZLE) {
      showPuzzlePanel();
      setStatus("Choose another puzzle.");
      return;
    }

    if (currentLocalMode === MODE_CAMPAIGN && activeCampaignNodeId && !campaignInShopNode) {
      showCampaignPanel();
      setStatus("Choose your next campaign node.");
      return;
    }

    if (currentLocalMode === MODE_CAMPAIGN && campaignInShopNode && state.phase === "shop") {
      completeCampaignShopNodeFromState();
      return;
    }

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
    if (currentLocalMode === MODE_PUZZLE && activePuzzleId) {
      startPuzzleById(activePuzzleId, { restart: true });
      return;
    }

    if (currentLocalMode === MODE_CAMPAIGN && activeCampaignNodeId) {
      if (campaignInShopNode) {
        const node = getCampaignNodeById(activeCampaignNodeId);
        if (node?.type === "shop") {
          openCampaignShopNode(node);
          return;
        }
      }
      startCampaignEncounterByNode(activeCampaignNodeId, { restart: true });
      return;
    }

    if (online.isOnlineActive()) {
      saveModeSave(MODE_ONLINE, {
        roomCode: activeRoomCode || online.getSession().roomCode || null,
        playerId: waitingRoomState.playerId || null,
        playerNames: waitingRoomState.playerNames || null,
        state,
        updatedAt: Date.now(),
      }, activeProfileSlot);
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
    resetAchievementTracking();
    resetRewardTracking();
    if (aiConfig.enabled || currentLocalMode === MODE_AI) {
      clearModeSave(MODE_AI, activeProfileSlot);
    } else {
      clearModeSave(MODE_PASSPLAY, activeProfileSlot);
    }
    persistState();
    touchProfileSlot(activeProfileSlot);
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

  elements.shopRerollBtn.addEventListener("click", () => {
    if (!campaignInShopNode || currentLocalMode !== MODE_CAMPAIGN || state.phase !== "shop") {
      return;
    }

    const campaignShopData = state.shop?.players?.[1];
    if (campaignShopData && campaignShopData.addedCount >= campaignShopData.addLimit) {
      setStatus("Cannot reroll after reaching max adds for this shop.");
      return;
    }

    const available = getCampaignAvailableRerolls();
    if (available <= 0) {
      setStatus("No rerolls left for this run.");
      return;
    }

    rerollCampaignShopOffer();
    campaignState = spendCampaignReroll(campaignState, 1);
    saveCampaignState(activeProfileSlot, campaignState);
    syncCampaignSummaryToProfile();
    persistState();
    render();
    showToast(`Shop rerolled (${getCampaignAvailableRerolls()} left).`, "info");
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
  normalizePuzzleEndStateIfNeeded();
  normalizeCampaignEndStateIfNeeded();

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
  evaluateAchievementsIfNeeded();
  evaluateRewardsIfNeeded();
  evaluatePuzzleProgressIfNeeded();
  evaluateCampaignProgressIfNeeded();

  renderLog(state, elements);
  renderChatPanel();
  renderShopPanel();
  renderEndgameBags();
  updateMeta();
  updateTopStatus();
  applyUiPulseTransitions();
  updateTopButtons();
  updateOnlineConnectionStatus();

  scheduleAiTurnIfNeeded();
}

function startCampaignEncounterByNode(nodeId, options = {}) {
  const restart = Boolean(options.restart);
  const node = getCampaignNodeById(nodeId);
  if (!node) {
    showToast("Campaign node not found.", "warn");
    return;
  }

  if (!getCampaignEncounterByNodeId(node.id)) {
    showToast("Encounter scaffold not configured for this node yet.", "warn");
    return;
  }

  const unlocked = new Set(campaignState.unlockedNodeIds || []);
  if (!unlocked.has(node.id)) {
    showToast("This node is still locked.", "warn");
    return;
  }

  if (online.isOnlineActive()) {
    online.leaveRoom();
  }

  campaignState = startCampaignRun(campaignState);
  const bossName = ensureCampaignBossName(node);
  saveCampaignState(activeProfileSlot, campaignState);

  const encounter = buildCampaignEncounterState(node, campaignState, getLocalGameOptions());
  setAiSettings(aiConfig, true, 2, Math.max(1, aiConfig.depth || 2));
  currentLocalMode = MODE_CAMPAIGN;
  activeCampaignNodeId = node.id;
  campaignOutcomeHandled = false;
  campaignInShopNode = false;
  campaignActiveActionNodeId = null;
  campaignActiveActionType = null;
  campaignSelectedShopAddIndexes = new Set();
  state = restoreState(encounter.state, getLocalGameOptions());
  handVisibility = {
    1: encounter.currentPlayer === 1,
    2: encounter.currentPlayer === 2,
  };
  resetAchievementTracking();
  resetRewardTracking();
  applyCampaignBossConstraintForActiveNode();
  persistState();
  enterGameScreen("campaign");

  const restartPrefix = restart ? "Encounter restarted. " : "Encounter started. ";
  setStatus(`${restartPrefix}${encounter.objective} Hint: column ${encounter.recommendedColumn + 1}.`);
  showToast(`${bossName ? `${bossName} - ` : ""}${node.title}: ${encounter.objective}`, "info");
  render();
}

function normalizeCampaignEndStateIfNeeded() {
  if (currentLocalMode !== MODE_CAMPAIGN || state.phase !== "round-end") {
    return;
  }

  const node = getCampaignNodeById(activeCampaignNodeId);
  if (campaignInShopNode || !node) {
    return;
  }

  applyCampaignBossConstraintForActiveNode();

  if ((state.pointPoolRemaining || 0) > 0) {
    const shopStep = enterShopPhase(state);
    if (!shopStep.error && state.phase === "shop") {
      startRoundFromShop(state);
      applyCampaignBossConstraintForActiveNode();
      state.log.unshift("Campaign continues immediately: no between-round shop.");
      return;
    }
  }

  state.phase = "game-over";
  if (state.winner === 1 || state.winner === 2) {
    state.gameWinner = state.winner;
    state.gameWinnerReason = "campaign-encounter";
    state.log.unshift(`${getDisplayPlayerName(state.winner)} cleared the campaign encounter.`);
  } else {
    state.gameWinner = null;
    state.gameWinnerReason = "campaign-encounter-failed";
    state.log.unshift("Campaign encounter ended without a clear winner.");
  }
}

function evaluateCampaignProgressIfNeeded() {
  if (currentLocalMode !== MODE_CAMPAIGN || !activeCampaignNodeId || campaignOutcomeHandled || state.phase !== "game-over") {
    return;
  }

  campaignOutcomeHandled = true;
  const node = getCampaignNodeById(activeCampaignNodeId);
  if (!node) {
    return;
  }

  const completedSet = new Set(campaignState.completedNodeIds || []);
  const solved = state.gameWinner === 1;
  if (!solved) {
    const defeatPayout = getCampaignRunPayout("defeat", campaignState);
    if (defeatPayout > 0) {
      addProfileWalletPoints(activeProfileSlot, defeatPayout);
      refreshProfileHeader();
    }

    const failedTitle = node.type === "final-boss" ? "final boss" : node.title;
    campaignState = resetCampaignRun();
    saveCampaignState(activeProfileSlot, campaignState);
    syncCampaignSummaryToProfile();
    clearModeSave(MODE_CAMPAIGN, activeProfileSlot);
    campaignInShopNode = false;
    activeCampaignNodeId = null;
    showToast(`Run lost at ${failedTitle}. End payout: +${defeatPayout}.`, "warn");
    setStatus(`Run failed. End payout: +${defeatPayout}. Start again from opening shop.`);
    showCampaignPanel();
    return;
  }

  const wasCompleted = completedSet.has(node.id);
  campaignState = completeCampaignNode(campaignState, node.id);
  const earnedCombatPoints = Math.max(0, Number(state.players?.[1]?.points) || 0);
  if (!wasCompleted && (node.type === "combat" || node.type === "elite" || node.type === "boss" || node.type === "final-boss")) {
    campaignState = addCampaignCombatPoints(campaignState, earnedCombatPoints);
    campaignState = addCampaignPerformancePoints(campaignState, Math.max(0, Number(node.rewardPoints) || 0));
  }

  saveCampaignState(activeProfileSlot, campaignState);
  syncCampaignSummaryToProfile();

  if (!wasCompleted) {
    showToast(`Campaign cleared: ${node.title}`, "reward");

    if (node.type === "final-boss") {
      const victoryPayout = getCampaignRunPayout("victory", campaignState);
      addProfileWalletPoints(activeProfileSlot, victoryPayout);
      refreshProfileHeader();
      pulseElement(elements.menuProfileSwitchBtn, "ui-pulse");
      elements.rewardPopupBody.textContent = `Run Cleared! Final boss defeated. End payout: +${victoryPayout} wallet points. Reroll points earned: ${campaignState.runCombatPoints}.`;
      elements.rewardPopup.hidden = false;
      rewardPopupShownForGame = true;

      campaignState = resetCampaignRun();
      saveCampaignState(activeProfileSlot, campaignState);
      syncCampaignSummaryToProfile();
      clearModeSave(MODE_CAMPAIGN, activeProfileSlot);
      campaignInShopNode = false;
      activeCampaignNodeId = null;
      showToast("Run victory! Campaign reset for a fresh run.", "reward");
    }
  } else {
    showToast(`Encounter replay cleared: ${node.title}`, "info");
  }

  renderCampaignPanel();
}

function normalizePuzzleEndStateIfNeeded() {
  if (currentLocalMode !== MODE_PUZZLE || state.phase !== "round-end") {
    return;
  }

  state.phase = "game-over";
  if (state.winner === 1 || state.winner === 2) {
    state.gameWinner = state.winner;
    state.gameWinnerReason = "puzzle-solved";
    state.log.unshift(`${getDisplayPlayerName(state.winner)} solved the puzzle.`);
  } else {
    state.gameWinner = null;
    state.gameWinnerReason = "puzzle-failed";
    state.log.unshift("Puzzle ended without a valid solution.");
  }
}

function startPuzzleById(puzzleId, options = {}) {
  const restart = Boolean(options.restart);
  const puzzle = getPuzzleById(puzzleId);
  if (!puzzle) {
    showToast("Puzzle not found.", "warn");
    return;
  }

  if (online.isOnlineActive()) {
    online.leaveRoom();
  }

  setAiSettings(aiConfig, false, aiConfig.playerId, aiConfig.depth);
  currentLocalMode = MODE_PUZZLE;
  activePuzzleId = puzzle.id;
  puzzleOutcomeHandled = false;
  state = restoreState(buildPuzzleState(puzzle, getLocalGameOptions()), getLocalGameOptions());
  handVisibility = {
    1: puzzle.currentPlayer === 1,
    2: puzzle.currentPlayer === 2,
  };
  resetAchievementTracking();
  resetRewardTracking();

  puzzleState = markPuzzleAttempt(puzzleState, puzzle.id);
  savePuzzleState(activeProfileSlot, puzzleState);
  syncPuzzleSummaryToProfile();
  persistState();
  enterGameScreen("puzzle");

  const restartPrefix = restart ? "Puzzle restarted. " : "Puzzle started. ";
  setStatus(`${restartPrefix}${puzzle.objective} Hint: column ${Number(puzzle.recommendedColumn) + 1}.`);
  showToast(`${puzzle.title}: ${puzzle.objective}`, "info");
  render();
}

function evaluatePuzzleProgressIfNeeded() {
  if (currentLocalMode !== MODE_PUZZLE || !activePuzzleId || puzzleOutcomeHandled || state.phase !== "game-over") {
    return;
  }

  puzzleOutcomeHandled = true;
  const puzzle = getPuzzleById(activePuzzleId);
  if (!puzzle) {
    return;
  }

  const solved = state.gameWinner === puzzle.currentPlayer;
  if (!solved) {
    showToast(`Puzzle failed: ${puzzle.title}. Try again.`, "warn");
    setStatus(`Puzzle failed. Use Restart Puzzle or More Puzzles.`);
    return;
  }

  const wasAlreadySolved = isPuzzleSolved(puzzleState, puzzle.id);
  puzzleState = markPuzzleSolved(puzzleState, puzzle.id);
  savePuzzleState(activeProfileSlot, puzzleState);
  syncPuzzleSummaryToProfile();

  if (!wasAlreadySolved) {
    const reward = Math.max(0, Number(puzzle.rewardPoints) || 0);
    if (reward > 0) {
      addProfileWalletPoints(activeProfileSlot, reward);
      refreshProfileHeader();
      pulseElement(elements.menuProfileSwitchBtn, "ui-pulse");
      showToast(`Puzzle solved: ${puzzle.title} (+${reward} pts)`, "reward");
    } else {
      showToast(`Puzzle solved: ${puzzle.title}`, "reward");
    }
  } else {
    showToast(`Puzzle solved again: ${puzzle.title}`, "reward");
  }
}

function pulseElement(el, className) {
  if (!el) {
    return;
  }
  el.classList.remove(className);
  // Force reflow so restarting animation class is reliable.
  void el.offsetWidth;
  el.classList.add(className);
}

function applyUiPulseTransitions() {
  if (animationsEnabled) {
    const currentTurnText = String(elements.turnPill.textContent || "");
    if (currentTurnText !== previousTurnPillText) {
      pulseElement(elements.turnPill, "ui-pulse");
      previousTurnPillText = currentTurnText;
    }

    const currentStatusText = String(elements.status.textContent || "");
    if (currentStatusText !== previousStatusText) {
      pulseElement(elements.status, "ui-fade-swap");
      previousStatusText = currentStatusText;
    }

    const shopKey = `${state.phase}|${state.shop?.currentPlayer || 0}|${state.shop?.players?.[1]?.ready ? 1 : 0}|${state.shop?.players?.[2]?.ready ? 1 : 0}`;
    if (shopKey !== previousShopStateKey) {
      previousShopStateKey = shopKey;
      if (!elements.shopPanel.hidden) {
        pulseElement(elements.shopPanel, "ui-panel-shift");
      }
    }
  }

  elements.boardPanel.classList.toggle("board-in-shop", state.phase === "shop");
  elements.boardPanel.classList.toggle("board-in-round", state.phase === "round");
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
  if (currentLocalMode === MODE_CAMPAIGN && !campaignInShopNode) {
    const inEncounterEnd = state.phase === "game-over";
    elements.shopPanel.hidden = true;
    elements.boardEl.hidden = false;
    elements.shopInstruction.hidden = true;
    elements.shopSwitchPlayer.hidden = true;
    elements.shopRemoveBtn.hidden = true;
    elements.shopCombineBtn.hidden = true;
    elements.shopRerollBtn.hidden = true;
    elements.phaseBtn.hidden = !inEncounterEnd;
    elements.phaseBtn.textContent = "Back to Campaign";
    return;
  }

  if (currentLocalMode === MODE_PUZZLE) {
    const inPuzzleEnd = state.phase === "game-over";
    elements.shopPanel.hidden = true;
    elements.boardEl.hidden = false;
    elements.shopInstruction.hidden = true;
    elements.shopSwitchPlayer.hidden = true;
    elements.shopRemoveBtn.hidden = true;
    elements.shopCombineBtn.hidden = true;
    elements.phaseBtn.hidden = !inPuzzleEnd;
    elements.phaseBtn.textContent = "More Puzzles";
    return;
  }

  const inShop = state.phase === "shop";
  elements.shopPanel.hidden = !inShop;
  elements.boardEl.hidden = inShop;
  elements.shopInstruction.hidden = !inShop;
  elements.shopSwitchPlayer.hidden = !inShop || online.isOnlineActive() || aiConfig.enabled;
  elements.shopRerollBtn.hidden = !inShop || !campaignInShopNode;

  elements.phaseBtn.hidden = state.phase === "round" || state.phase === "game-over";
  if (online.isOnlineActive() && state.phase === "shop") {
    elements.phaseBtn.textContent = waitingRoomState.shopReadyYou ? "Cancel Ready" : "Shop Ready";
  } else if (isPassPlayMode() && state.phase === "shop") {
    const playerReady = Boolean(state.shop.players[state.shop.currentPlayer]?.ready);
    elements.phaseBtn.textContent = playerReady ? "Cancel Ready" : "Shop Ready";
  } else {
    elements.phaseBtn.textContent = state.phase === "shop" ? "Start Next Round" : "Start Shop Phase";
  }

  if (campaignInShopNode && state.phase === "shop") {
    elements.phaseBtn.textContent = "Finish Campaign Shop";
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

  if (campaignInShopNode) {
    const available = getCampaignAvailableRerolls();
    const campaignShopData = state.shop?.players?.[1];
    const addLimitReached = Boolean(campaignShopData && campaignShopData.addedCount >= campaignShopData.addLimit);
    elements.shopInstruction.textContent = `Campaign shop: normal rules apply. Rerolls left: ${available}.`;
    elements.shopSwitchPlayer.hidden = true;
    elements.shopRerollBtn.disabled = available <= 0 || addLimitReached;
    elements.shopRerollBtn.textContent = `Reroll Offer (${available})`;
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
    elements.rewardPopup.hidden = true;
    rewardPopupShownForGame = false;
  }

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
    const roomCode = room.toUpperCase();
    pendingEntryRoute = {
      mode: "online",
      roomCode,
    };
  } else {
    const savedOnline = loadModeSave(MODE_ONLINE, activeProfileSlot);
    const savedRoomCode = String(savedOnline?.roomCode || "").toUpperCase();
    if (/^[A-Z2-9]{6}$/.test(savedRoomCode)) {
      activeRoomCode = savedRoomCode;
      waitingRoomState.mode = "friend";
      elements.onlineJoinCode.value = savedRoomCode;
    }
  }

  showProfileEntryScreen();
}

function showProfileEntryScreen() {
  elements.profileEntryScreen.hidden = false;
  elements.mainMenu.hidden = true;
  elements.puzzlePanel.hidden = true;
  elements.campaignPanel.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.profilesPanel.hidden = true;
  elements.achievementsPanel.hidden = true;
  elements.shopPanelMenu.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  renderProfileEntryScreen();
}

function continueAfterProfileEntry() {
  if (pendingEntryRoute?.mode === "online" && pendingEntryRoute.roomCode) {
    activeRoomCode = pendingEntryRoute.roomCode;
    waitingRoomState = {
      ...createWaitingRoomState(),
      mode: "friend",
    };
    elements.onlineJoinCode.value = activeRoomCode;
    updateOnlineRoomUI(activeRoomCode);
    pendingEntryRoute = null;
    showOnlinePanel();
    const pseudo = normalizePseudo(elements.onlinePseudo.value || online.getSession().displayName || "");
    elements.onlinePseudo.value = pseudo;
    online.setDisplayName(pseudo);
    return;
  }

  pendingEntryRoute = null;
  if (tryResumeCampaignEncounter()) {
    return;
  }
  showMainMenu();
}

function showMainMenu() {
  elements.profileEntryScreen.hidden = true;
  elements.mainMenu.hidden = false;
  elements.puzzlePanel.hidden = true;
  elements.campaignPanel.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.profilesPanel.hidden = true;
  elements.achievementsPanel.hidden = true;
  elements.shopPanelMenu.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  refreshProfileHeader();
}

function showAiPanel() {
  elements.profileEntryScreen.hidden = true;
  elements.mainMenu.hidden = true;
  elements.puzzlePanel.hidden = true;
  elements.campaignPanel.hidden = true;
  elements.aiPanel.hidden = false;
  elements.settingsPanel.hidden = true;
  elements.profilesPanel.hidden = true;
  elements.achievementsPanel.hidden = true;
  elements.shopPanelMenu.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;

  const savedAi = loadModeSave(MODE_AI, activeProfileSlot);
  if (savedAi?.ai?.playerId) {
    elements.aiSideSelect.value = String(savedAi.ai.playerId);
  }
  if (savedAi?.ai?.depth) {
    elements.aiDepthSelect.value = String(savedAi.ai.depth);
  }
  elements.aiContinueBtn.disabled = !savedAi?.state;
}

function showOnlinePanel() {
  elements.profileEntryScreen.hidden = true;
  elements.mainMenu.hidden = true;
  elements.puzzlePanel.hidden = true;
  elements.campaignPanel.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.profilesPanel.hidden = true;
  elements.achievementsPanel.hidden = true;
  elements.shopPanelMenu.hidden = true;
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
  elements.profileEntryScreen.hidden = true;
  elements.mainMenu.hidden = true;
  elements.puzzlePanel.hidden = true;
  elements.campaignPanel.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.profilesPanel.hidden = true;
  elements.achievementsPanel.hidden = true;
  elements.shopPanelMenu.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = false;
  elements.gameScreen.hidden = true;
}

function showSettingsPanel() {
  elements.profileEntryScreen.hidden = true;
  elements.mainMenu.hidden = true;
  elements.puzzlePanel.hidden = true;
  elements.campaignPanel.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = false;
  elements.profilesPanel.hidden = true;
  elements.achievementsPanel.hidden = true;
  elements.shopPanelMenu.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
}

function showProfilesPanel() {
  elements.profileEntryScreen.hidden = true;
  elements.mainMenu.hidden = true;
  elements.puzzlePanel.hidden = true;
  elements.campaignPanel.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.profilesPanel.hidden = false;
  elements.achievementsPanel.hidden = true;
  elements.shopPanelMenu.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  renderProfilesPanel();
}

function showAchievementsPanel() {
  elements.profileEntryScreen.hidden = true;
  elements.mainMenu.hidden = true;
  elements.puzzlePanel.hidden = true;
  elements.campaignPanel.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.profilesPanel.hidden = true;
  elements.achievementsPanel.hidden = false;
  elements.shopPanelMenu.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  renderAchievementsPanel();
}

function showShopPanelMenu() {
  elements.profileEntryScreen.hidden = true;
  elements.mainMenu.hidden = true;
  elements.puzzlePanel.hidden = true;
  elements.campaignPanel.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.profilesPanel.hidden = true;
  elements.achievementsPanel.hidden = true;
  elements.shopPanelMenu.hidden = false;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  renderShopPanelMenu();
}

function showPuzzlePanel() {
  elements.profileEntryScreen.hidden = true;
  elements.mainMenu.hidden = true;
  elements.puzzlePanel.hidden = false;
  elements.campaignPanel.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.profilesPanel.hidden = true;
  elements.achievementsPanel.hidden = true;
  elements.shopPanelMenu.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  renderPuzzlePanel();
}

function showCampaignPanel() {
  elements.profileEntryScreen.hidden = true;
  elements.mainMenu.hidden = true;
  elements.puzzlePanel.hidden = true;
  elements.campaignPanel.hidden = false;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.profilesPanel.hidden = true;
  elements.achievementsPanel.hidden = true;
  elements.shopPanelMenu.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  renderCampaignPanel();
}

function enterGameScreen(mode, roomCode = null) {
  elements.profileEntryScreen.hidden = true;
  elements.mainMenu.hidden = true;
  elements.puzzlePanel.hidden = true;
  elements.campaignPanel.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.profilesPanel.hidden = true;
  elements.achievementsPanel.hidden = true;
  elements.shopPanelMenu.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = false;
  maybeSuggestTutorialOnFirstGame();

  if (mode === "online" && roomCode) {
    applyRoomQuery(roomCode);
    setStatus(`Online room ${roomCode}. Share your link with your opponent.`);
  } else {
    clearRoomQuery();
  }

  render();
}

function maybeSuggestTutorialOnFirstGame() {
  if (hasProfileSeenTutorial(activeProfileSlot)) {
    return;
  }

  markProfileTutorialSeen(activeProfileSlot);
  showToast("New to RuneBags? Open Rules from the menu for a quick primer.", "info");
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
  if (onlineGame) {
    elements.newGameBtn.textContent = "Leave Game";
    return;
  }

  if (currentLocalMode === MODE_CAMPAIGN && activeCampaignNodeId) {
    elements.newGameBtn.textContent = campaignInShopNode ? "Restart Shop" : "Restart Encounter";
    return;
  }

  if (currentLocalMode === MODE_PUZZLE && activePuzzleId) {
    elements.newGameBtn.textContent = "Restart Puzzle";
    return;
  }

  elements.newGameBtn.textContent = "New Game";
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
    }, activeProfileSlot);
    return;
  }

  if (currentLocalMode === MODE_PUZZLE && activePuzzleId) {
    saveModeSave(MODE_PUZZLE, {
      state,
      puzzleId: activePuzzleId,
      updatedAt: Date.now(),
    }, activeProfileSlot);
    return;
  }

  if (currentLocalMode === MODE_CAMPAIGN && activeCampaignNodeId) {
    saveModeSave(MODE_CAMPAIGN, {
      state,
      nodeId: activeCampaignNodeId,
      campaignInShopNode,
      updatedAt: Date.now(),
    }, activeProfileSlot);
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
    }, activeProfileSlot);
    return;
  }

  saveModeSave(MODE_PASSPLAY, {
    state,
    updatedAt: Date.now(),
  }, activeProfileSlot);
}

function getSavedStateForMode(mode, profileSlot = activeProfileSlot) {
  const saved = loadModeSave(mode, profileSlot);
  if (!saved || typeof saved !== "object") {
    return null;
  }
  return saved.state || null;
}

function tryResumeCampaignEncounter() {
  const saved = loadModeSave(MODE_CAMPAIGN, activeProfileSlot);
  if (!saved?.state || !saved?.nodeId) {
    return false;
  }

  const node = getCampaignNodeById(String(saved.nodeId));
  if (!node) {
    return false;
  }

  currentLocalMode = MODE_CAMPAIGN;
  activeCampaignNodeId = node.id;
  campaignOutcomeHandled = false;
  campaignInShopNode = Boolean(saved?.campaignInShopNode);
  campaignActiveActionNodeId = null;
  campaignActiveActionType = null;
  campaignSelectedShopAddIndexes = new Set();
  state = restoreState(saved.state, getLocalGameOptions());
  handVisibility = {
    1: state.currentPlayer === 1,
    2: state.currentPlayer === 2,
  };
  resetAchievementTracking();
  resetRewardTracking();
  enterGameScreen("campaign");
  setStatus(campaignInShopNode ? `Campaign shop resumed: ${node.title}.` : `Campaign resumed: ${node.title}.`);
  return true;
}

function refreshProfileHeader() {
  const profile = getProfileBySlot(activeProfileSlot);
  elements.menuProfileSwitchBtn.textContent = `Profile ${activeProfileSlot}: ${profile.name} (${getProfileWalletPoints(activeProfileSlot)} pts)`;
}

function applySelectedCosmetics() {
  const boardSkin = cosmeticState?.selected?.board || "board-classic";
  const runeSkin = cosmeticState?.selected?.rune || "rune-classic";
  const sfxSkin = cosmeticState?.selected?.sfx || "sfx-classic";
  document.body.dataset.boardSkin = boardSkin;
  document.body.dataset.runeSkin = runeSkin;

  const profile = sfxSkin === "sfx-arcane"
    ? "arcane"
    : sfxSkin === "sfx-anvil"
      ? "anvil"
      : "classic";
  sfx.setProfile(profile);
}

function showToast(message, type = "info") {
  const layer = elements.fxToastLayer;
  if (!layer) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `fx-toast ${type}`;
  toast.textContent = message;
  layer.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("fade-out");
    window.setTimeout(() => {
      toast.remove();
    }, 260);
  }, 2200);
}

function createAchievementSnapshot(currentState, mode) {
  return {
    mode,
    phase: currentState.phase,
    roundNumber: Number(currentState.roundNumber) || 0,
    turnNumber: Number(currentState.turnNumber) || 0,
    winner: currentState.winner || null,
    gameWinner: currentState.gameWinner || null,
    gameWinnerReason: currentState.gameWinnerReason || null,
    logLength: Array.isArray(currentState.log) ? currentState.log.length : 0,
  };
}

function resetAchievementTracking() {
  previousAchievementSnapshot = createAchievementSnapshot(state, currentLocalMode);
}

function resetRewardTracking() {
  previousRewardSnapshot = createRewardSnapshot(state, currentLocalMode);
  rewardPopupShownForGame = false;
  elements.rewardPopup.hidden = true;
}

function getRewardPerspectivePlayerId() {
  if (currentLocalMode === MODE_ONLINE) {
    if (waitingRoomState.playerId === 1 || waitingRoomState.playerId === 2) {
      return waitingRoomState.playerId;
    }
    return null;
  }

  if (aiConfig.enabled || currentLocalMode === MODE_AI) {
    return aiConfig.playerId === 1 ? 2 : 1;
  }

  // For pass & play on one profile slot, rewards are tracked from Black side.
  return 1;
}

function evaluateRewardsIfNeeded() {
  if (currentLocalMode === MODE_PUZZLE || currentLocalMode === MODE_CAMPAIGN) {
    previousRewardSnapshot = createRewardSnapshot(state, currentLocalMode);
    return;
  }

  const perspectivePlayerId = getRewardPerspectivePlayerId();
  const payout = calculateGameReward(previousRewardSnapshot, state, currentLocalMode, perspectivePlayerId);
  previousRewardSnapshot = createRewardSnapshot(state, currentLocalMode);
  if (!payout || payout.awardedPoints <= 0) {
    return;
  }

  const credited = addProfileWalletPoints(activeProfileSlot, payout.awardedPoints);
  if (credited <= 0) {
    return;
  }

  const outcomeLabel = payout.outcome === "win"
    ? "Victory"
    : payout.outcome === "draw"
      ? "Draw"
      : "Defeat";
  setStatus(`${outcomeLabel}: +${credited} profile points (${payout.gamePoints} x${payout.multiplier}).`);
  showToast(`${outcomeLabel}! +${credited} profile points`, "reward");
  pulseElement(elements.menuProfileSwitchBtn, "ui-pulse");
  const rewardLines = [`Match result: ${outcomeLabel}`, `Game points: ${payout.gamePoints}`, `Multiplier: x${payout.multiplier}`, `Awarded: +${credited} profile points`];
  if (!rewardPopupShownForGame && !elements.rewardPopup.hidden) {
    // no-op; popup already visible and populated for this game transition.
  }
  if (!rewardPopupShownForGame && state.phase === "game-over") {
    elements.rewardPopupBody.textContent = rewardLines.join(" | ");
    elements.rewardPopup.hidden = false;
    rewardPopupShownForGame = true;
  }
  refreshProfileHeader();
  if (!elements.profilesPanel.hidden) {
    renderProfilesPanel();
  }
  if (!elements.profileEntryScreen.hidden) {
    renderProfileEntryScreen();
  }
}

function syncAchievementSummaryToProfile() {
  const unlockedCount = Array.isArray(achievementState.unlockedIds)
    ? achievementState.unlockedIds.length
    : 0;
  setProfileAchievementProgress(activeProfileSlot, unlockedCount, ACHIEVEMENT_CATALOG.length);
}

function evaluateAchievementsIfNeeded() {
  if (currentLocalMode === MODE_PUZZLE) {
    previousAchievementSnapshot = createAchievementSnapshot(state, currentLocalMode);
    return;
  }

  const result = evaluateAchievementProgress(
    achievementState,
    previousAchievementSnapshot,
    state,
    currentLocalMode,
  );

  const previousUnlockedCount = Array.isArray(achievementState.unlockedIds)
    ? achievementState.unlockedIds.length
    : 0;
  const nextUnlockedCount = Array.isArray(result.nextState.unlockedIds)
    ? result.nextState.unlockedIds.length
    : 0;
  const metricsChanged = JSON.stringify(result.nextState.metrics) !== JSON.stringify(achievementState.metrics);

  previousAchievementSnapshot = result.nextSnapshot;
  if (!metricsChanged && previousUnlockedCount === nextUnlockedCount) {
    return;
  }

  achievementState = result.nextState;
  saveAchievementState(activeProfileSlot, achievementState);

  if (result.unlockedNow.length > 0) {
    let achievementBonusTotal = 0;
    const unlockedNames = [];
    result.unlockedNow.forEach((id) => {
      const item = ACHIEVEMENT_CATALOG.find((entry) => entry.id === id);
      achievementBonusTotal += Math.max(0, Number(item?.rewardPoints) || 0);
      if (item?.title) {
        unlockedNames.push(item.title);
      }
    });
    if (achievementBonusTotal > 0) {
      addProfileWalletPoints(activeProfileSlot, achievementBonusTotal);
      setStatus(`Achievement reward: +${achievementBonusTotal} profile points.`);
      const unlockPrefix = state.phase === "game-over" ? "Game finished - " : "";
      showToast(`${unlockPrefix}Unlocked: ${unlockedNames.join(", ")} (+${achievementBonusTotal} pts)`, "reward");
      pulseElement(elements.menuProfileSwitchBtn, "ui-pulse");
      refreshProfileHeader();
    }
  }

  syncAchievementSummaryToProfile();
  if (!elements.achievementsPanel.hidden) {
    renderAchievementsPanel();
  }
}

function renderAchievementsPanel() {
  const unlockedSet = new Set(achievementState.unlockedIds || []);
  const unlockedCount = unlockedSet.size;
  const wallet = getProfileWalletPoints(activeProfileSlot);
  elements.achievementsSummary.textContent = `${unlockedCount}/${ACHIEVEMENT_CATALOG.length} unlocked | Wallet: ${wallet} pts`;
  elements.achievementsList.innerHTML = "";

  ACHIEVEMENT_CATALOG.forEach((achievement) => {
    const card = document.createElement("article");
    const unlocked = unlockedSet.has(achievement.id);
    card.className = `achievement-card ${unlocked ? "unlocked" : "locked"}`;

    const title = document.createElement("h3");
    title.textContent = achievement.title;
    card.appendChild(title);

    const desc = document.createElement("p");
    const rewardPoints = Math.max(0, Number(achievement.rewardPoints) || 0);
    desc.textContent = `${achievement.description} Reward: ${rewardPoints} pts.`;
    card.appendChild(desc);

    const metricValue = Number(achievementState.metrics?.[achievement.metricKey]) || 0;
    const progress = document.createElement("p");
    progress.className = "achievement-progress";
    progress.textContent = unlocked
      ? "Unlocked"
      : `Progress: ${Math.min(metricValue, achievement.required)}/${achievement.required}`;
    card.appendChild(progress);

    elements.achievementsList.appendChild(card);
  });
}

function renderShopPanelMenu() {
  const wallet = getProfileWalletPoints(activeProfileSlot);
  elements.shopWalletSummary.textContent = `Wallet: ${wallet} pts`;
  elements.shopCosmeticsList.innerHTML = "";

  COSMETIC_CATALOG.forEach((cosmetic) => {
    const card = document.createElement("article");
    card.className = "achievement-card unlocked";

    const title = document.createElement("h3");
    title.textContent = cosmetic.title;
    card.appendChild(title);

    const desc = document.createElement("p");
    desc.textContent = `${cosmetic.description} Price: ${cosmetic.price} pts.`;
    card.appendChild(desc);

    const isItemOwned = isOwned(cosmeticState, cosmetic.id);
    const isEquipped = isCosmeticEquipped(cosmetic);

    const actionWrap = document.createElement("div");
    actionWrap.className = "menu-actions compact";

    if (!isItemOwned && cosmetic.price > 0) {
      const buyBtn = document.createElement("button");
      buyBtn.type = "button";
      buyBtn.className = "menu-btn";
      buyBtn.dataset.cosmeticBuy = cosmetic.id;
      buyBtn.disabled = wallet < cosmetic.price;
      buyBtn.textContent = wallet < cosmetic.price ? "Not Enough Points" : `Buy (${cosmetic.price})`;
      actionWrap.appendChild(buyBtn);
    } else {
      const equipBtn = document.createElement("button");
      equipBtn.type = "button";
      equipBtn.className = "menu-btn secondary";
      equipBtn.dataset.cosmeticEquip = cosmetic.id;
      equipBtn.disabled = isEquipped;
      equipBtn.textContent = isEquipped ? "Equipped" : "Equip";
      actionWrap.appendChild(equipBtn);
    }

    card.appendChild(actionWrap);
    elements.shopCosmeticsList.appendChild(card);
  });
}

function renderPuzzlePanel() {
  const solvedSet = new Set(puzzleState?.solvedIds || []);
  const totalCount = getPuzzleCount();
  const filtered = PUZZLE_CATALOG.filter((puzzle) => matchesPuzzleFilters(puzzle, solvedSet));
  const solvedInFilter = filtered.filter((puzzle) => solvedSet.has(puzzle.id)).length;
  elements.puzzleSummary.textContent = `${solvedSet.size}/${totalCount} solved | Showing ${filtered.length} (${solvedInFilter} solved)`;
  elements.puzzleList.innerHTML = "";

  filtered.forEach((puzzle) => {
    const solved = solvedSet.has(puzzle.id);
    const attempts = Math.max(0, Number(puzzleState?.attemptsById?.[puzzle.id]) || 0);

    const card = document.createElement("article");
    card.className = `achievement-card ${solved ? "unlocked" : "locked"}`;

    const difficulty = String(puzzle.difficulty || "medium").toLowerCase();
    const tag = document.createElement("span");
    tag.className = `puzzle-difficulty-tag ${difficulty}`;
    tag.textContent = difficulty;
    card.appendChild(tag);

    const title = document.createElement("h3");
    title.textContent = puzzle.title;
    card.appendChild(title);

    const desc = document.createElement("p");
    desc.textContent = `${puzzle.objective} Reward: ${puzzle.rewardPoints} pts.`;
    card.appendChild(desc);

    const detail = document.createElement("p");
    detail.className = "achievement-progress";
    detail.textContent = `${solved ? "Solved" : "Unsolved"} | Attempts: ${attempts} | Hint: column ${Number(puzzle.recommendedColumn) + 1}`;
    card.appendChild(detail);

    const actionWrap = document.createElement("div");
    actionWrap.className = "menu-actions compact";

    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "menu-btn";
    startBtn.dataset.puzzleStart = puzzle.id;
    startBtn.textContent = solved ? "Play Again" : "Start Puzzle";
    actionWrap.appendChild(startBtn);

    card.appendChild(actionWrap);
    elements.puzzleList.appendChild(card);
  });

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "settings-note";
    empty.textContent = "No puzzles match the selected filters.";
    elements.puzzleList.appendChild(empty);
  }
}

function resolveCampaignNode(nodeId) {
  const node = getCampaignNodeById(nodeId);
  if (!node) {
    showToast("Campaign node not found.", "warn");
    return;
  }

  const unlocked = new Set(campaignState.unlockedNodeIds || []);
  if (!unlocked.has(node.id)) {
    showToast("This node is still locked.", "warn");
    return;
  }

  const nextNode = getNextCampaignPlayableNode();
  if (nextNode && nextNode.id !== node.id) {
    showToast("Follow the campaign sequence in order.", "warn");
    return;
  }

  if (node.type === "shop") {
    openCampaignShopNode(node);
    return;
  }

  startCampaignEncounterByNode(node.id);
}

function renderCampaignPanel() {
  const completion = getCampaignCompletion(campaignState);
  const unlocked = new Set(campaignState.unlockedNodeIds || []);
  const completed = new Set(campaignState.completedNodeIds || []);
  const nextNode = getNextCampaignPlayableNode();
  const ante = Math.max(1, Number(nextNode?.ante) || 1);
  const bossClears = CAMPAIGN_NODES.reduce((count, node) => {
    if (!completed.has(node.id)) {
      return count;
    }
    if (node.type === "boss" || node.type === "final-boss") {
      return count + 1;
    }
    return count;
  }, 0);

  const rerolls = getCampaignAvailableRerolls();
  elements.campaignSummary.textContent = `Completed ${completion.completed}/${completion.total} (${completion.percent}%) | Ante ${Math.min(ante, 8)}/8 | Bosses defeated: ${bossClears}/8 | Rerolls: ${rerolls}`;

  renderCampaignLoadout();
  renderCampaignNodeActionPanel();

  elements.campaignMap.innerHTML = "";
  const displayNodes = CAMPAIGN_NODES.filter((node) => {
    if (node.id === "start-shop" && !completed.has(node.id)) {
      return true;
    }
    return Number(node.ante) === ante;
  });

  displayNodes.forEach((node) => {
    const isUnlocked = unlocked.has(node.id);
    const isCompleted = completed.has(node.id);
    const isNext = nextNode?.id === node.id;

    const card = document.createElement("article");
    card.className = `campaign-node ${node.type} ${isCompleted ? "completed" : ""} ${isUnlocked ? "unlocked" : "locked"}`.trim();

    const title = document.createElement("h4");
    const antePrefix = node.ante > 0 ? `Ante ${node.ante} - ` : "";
    const bossName = (node.type === "boss" || node.type === "final-boss")
      ? String(campaignState.bossNameByNode?.[node.id] || "")
      : "";
    title.textContent = `${antePrefix}${node.title}${bossName ? ` (${bossName})` : ""}`;
    card.appendChild(title);

    const detail = document.createElement("small");
    const status = isCompleted ? "Cleared" : isNext ? "Current" : isUnlocked ? "Unlocked" : "Locked";
    detail.textContent = `${getCampaignNodeTypeLabel(node.type)} | Supply ${Math.max(0, Number(node.roundPointPool) || 0)} | ${status}`;
    card.appendChild(detail);

    const resolveBtn = document.createElement("button");
    resolveBtn.type = "button";
    resolveBtn.className = "menu-btn";
    resolveBtn.dataset.campaignNodeStart = node.id;
    resolveBtn.disabled = !isUnlocked || !isNext;
    resolveBtn.textContent = getCampaignNodeActionLabel(node, isCompleted);
    card.appendChild(resolveBtn);

    elements.campaignMap.appendChild(card);
  });
}

function getCampaignNodeTypeLabel(type) {
  if (type === "final-boss") {
    return "Final Boss";
  }
  if (type === "boss") {
    return "Boss";
  }
  if (type === "elite") {
    return "Elite";
  }
  if (type === "shop") {
    return "Shop";
  }
  if (type === "remove") {
    return "Remove";
  }
  return "Combat";
}

function getCampaignNodeActionLabel(node, isCompleted) {
  if (node.type === "shop") {
    return isCompleted ? "Completed" : "Open Shop";
  }
  return isCompleted ? "Completed" : "Start Encounter";
}

function getCampaignAvailableRerolls() {
  const combatPoints = Math.max(0, Number(campaignState.runCombatPoints) || 0);
  const spent = Math.max(0, Number(campaignState.runRerollsSpent) || 0);
  return Math.max(0, combatPoints - spent);
}

function getCampaignRunPayout(outcome, stateSnapshot = campaignState) {
  const base = Math.max(0, Number(stateSnapshot?.runPerformancePoints) || 0);
  const rerollPoints = Math.max(0, Number(stateSnapshot?.runCombatPoints) || 0);
  if (outcome === "victory") {
    return base + rerollPoints * 8 + 250;
  }
  return Math.max(0, Math.round(base * 0.35 + rerollPoints * 4));
}

function getNextCampaignPlayableNode() {
  const unlocked = new Set(campaignState.unlockedNodeIds || []);
  const completed = new Set(campaignState.completedNodeIds || []);
  return CAMPAIGN_NODES.find((node) => unlocked.has(node.id) && !completed.has(node.id)) || null;
}

function renderCampaignLoadout() {
  const loadout = Array.isArray(campaignState.loadoutRunes) ? campaignState.loadoutRunes : [];
  elements.campaignLoadoutSummary.textContent = loadout.length
    ? `${loadout.length} bonus rune${loadout.length > 1 ? "s" : ""} in loadout.`
    : "No bonus runes yet.";
  elements.campaignLoadoutList.innerHTML = "";

  if (!loadout.length) {
    const empty = document.createElement("p");
    empty.className = "settings-note";
    empty.textContent = "Run starts with a normal bag. Use shops to tune it.";
    elements.campaignLoadoutList.appendChild(empty);
    return;
  }

  loadout.forEach((entry) => {
    const rune = getRuneById(entry.runeId);
    const card = document.createElement("article");
    card.className = "achievement-card unlocked";

    const title = document.createElement("h3");
    title.textContent = rune ? `${rune.name} L${entry.level}` : `${entry.runeId} L${entry.level}`;
    card.appendChild(title);

    const desc = document.createElement("p");
    desc.textContent = rune?.description || "Campaign loadout rune.";
    card.appendChild(desc);

    elements.campaignLoadoutList.appendChild(card);
  });
}

function renderCampaignNodeActionPanel() {
  elements.campaignActionPanel.hidden = true;
  elements.campaignActionBody.innerHTML = "";
}

function openCampaignShopNode(node) {
  if (online.isOnlineActive()) {
    online.leaveRoom();
  }

  campaignState = startCampaignRun(campaignState);
  saveCampaignState(activeProfileSlot, campaignState);

  setAiSettings(aiConfig, false, aiConfig.playerId, aiConfig.depth);
  currentLocalMode = MODE_CAMPAIGN;
  activeCampaignNodeId = node.id;
  campaignOutcomeHandled = false;
  campaignInShopNode = true;
  campaignActiveActionNodeId = null;
  campaignActiveActionType = null;
  campaignSelectedShopAddIndexes = new Set();

  const shopState = createInitialState(getLocalGameOptions());
  shopState.phase = "shop";
  shopState.roundNumber = 1;
  shopState.currentPlayer = 1;
  shopState.shop.currentPlayer = 1;
  shopState.shop.players[1].ready = false;
  shopState.shop.players[2].ready = false;
  shopState.players[1].bag = buildCampaignPlayerBag(campaignState.loadoutRunes || []);
  shopState.players[1].discard = [];
  shopState.players[1].hand = [];

  state = restoreState(shopState, getLocalGameOptions());
  handVisibility = { 1: true, 2: false };
  resetAchievementTracking();
  resetRewardTracking();
  persistState();
  enterGameScreen("campaign");
  setStatus(`Campaign shop: ${node.title}`);
  showToast("Campaign shop started.", "info");
  render();
}

function completeCampaignShopNodeFromState() {
  if (!campaignInShopNode || currentLocalMode !== MODE_CAMPAIGN || state.phase !== "shop" || !activeCampaignNodeId) {
    return;
  }

  const node = getCampaignNodeById(activeCampaignNodeId);
  if (!node || node.type !== "shop") {
    return;
  }

  campaignState = {
    ...campaignState,
    loadoutRunes: extractCampaignLoadoutFromBag(state.players?.[1]?.bag || []),
  };
  campaignState = completeCampaignNode(campaignState, node.id);
  saveCampaignState(activeProfileSlot, campaignState);
  syncCampaignSummaryToProfile();
  campaignInShopNode = false;
  clearModeSave(MODE_CAMPAIGN, activeProfileSlot);
  showToast(`${node.title} complete.`, "reward");
  showCampaignPanel();
}

function extractCampaignLoadoutFromBag(bag) {
  return (Array.isArray(bag) ? bag : [])
    .map((rune) => ({
      runeId: rune.id,
      level: Math.max(1, Number(rune.level) || 1),
    }));
}

function buildCampaignPlayerBag(loadoutRunes) {
  const source = Array.isArray(loadoutRunes) && loadoutRunes.length > 0
    ? loadoutRunes
    : [
      { runeId: "basic", level: 1 },
      { runeId: "basic", level: 1 },
      { runeId: "basic", level: 1 },
      { runeId: "basic", level: 1 },
      { runeId: "basic", level: 1 },
      { runeId: "basic", level: 1 },
      { runeId: "jera", level: 1 },
      { runeId: "jera", level: 1 },
      { runeId: "inguz", level: 1 },
      { runeId: "inguz", level: 1 },
    ];

  const bag = [];
  source.forEach((entry) => {
    const rune = createRuneInstance(entry?.runeId, entry?.level);
    if (rune) {
      bag.push(rune);
    }
  });

  return bag;
}

function rerollCampaignShopOffer() {
  const playerId = 1;
  const data = state.shop?.players?.[playerId];
  const player = state.players?.[playerId];
  if (!data || !player) {
    return;
  }

  data.offer.forEach((rune) => player.shopSupply.push(rune));
  data.offer = [];
  const drawCount = 5;
  for (let i = 0; i < drawCount && player.shopSupply.length > 0; i += 1) {
    const index = Math.floor(Math.random() * player.shopSupply.length);
    const [drawn] = player.shopSupply.splice(index, 1);
    if (drawn) {
      data.offer.push(drawn);
    }
  }
}

function ensureCampaignBossName(node) {
  if (!node || (node.type !== "boss" && node.type !== "final-boss")) {
    return "";
  }

  const existing = String(campaignState.bossNameByNode?.[node.id] || "").trim();
  if (existing) {
    return existing;
  }

  const pool = node.type === "final-boss" ? CAMPAIGN_FINAL_BOSS_NAME_POOL : CAMPAIGN_BOSS_NAME_POOL;
  const used = new Set(Object.values(campaignState.bossNameByNode || {}));
  const available = pool.filter((name) => !used.has(name));
  const source = available.length ? available : pool;
  const picked = source[Math.floor(Math.random() * source.length)] || "Unknown Boss";
  campaignState = setCampaignBossName(campaignState, node.id, picked);
  saveCampaignState(activeProfileSlot, campaignState);
  return picked;
}

function applyCampaignBossConstraintForActiveNode() {
  const node = getCampaignNodeById(activeCampaignNodeId);
  if (!node || (node.type !== "boss" && node.type !== "final-boss")) {
    return;
  }

  const ruleId = getCampaignBossConstraintId(node);
  if (ruleId === "center-only") {
    state.nextTurnConstraints[1] = [3];
    state.log.unshift("Boss constraint: first turn must be center column.");
    return;
  }
  if (ruleId === "center-flanks") {
    state.nextTurnConstraints[1] = [2, 4];
    state.log.unshift("Boss constraint: first turn must be a central flank.");
    return;
  }
  if (ruleId === "left-half") {
    state.nextTurnConstraints[1] = [0, 1, 2, 3];
    state.log.unshift("Boss constraint: first turn must be on the left half.");
    return;
  }
  if (ruleId === "right-half") {
    state.nextTurnConstraints[1] = [3, 4, 5, 6];
    state.log.unshift("Boss constraint: first turn must be on the right half.");
    return;
  }
  if (ruleId === "even-columns") {
    state.nextTurnConstraints[1] = [0, 2, 4, 6];
    state.log.unshift("Boss constraint: first turn must use an even column.");
    return;
  }
  if (ruleId === "odd-columns") {
    state.nextTurnConstraints[1] = [1, 3, 5];
    state.log.unshift("Boss constraint: first turn must use an odd column.");
    return;
  }
  if (ruleId === "no-center") {
    state.nextTurnConstraints[1] = [0, 1, 2, 4, 5, 6];
    state.log.unshift("Boss constraint: center column is sealed for your opener.");
    return;
  }
  state.nextTurnConstraints[1] = [0, 6];
  state.log.unshift("Final boss constraint: opener must be on an edge.");
}

function getCampaignBossConstraintId(node) {
  const seed = Number(campaignState.startedAt) || Date.now();
  const raw = `${seed}-${node.id}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = Math.abs(hash >>> 0) % CAMPAIGN_BOSS_CONSTRAINT_POOL.length;
  return CAMPAIGN_BOSS_CONSTRAINT_POOL[index];
}

function matchesPuzzleFilters(puzzle, solvedSet) {
  const difficulty = String(puzzle?.difficulty || "medium").toLowerCase();
  const solved = solvedSet.has(puzzle.id);

  const difficultyOk = puzzleDifficultyFilter === "all" || difficulty === puzzleDifficultyFilter;
  const solvedOk = puzzleStatusFilter === "all"
    || (puzzleStatusFilter === "solved" && solved)
    || (puzzleStatusFilter === "unsolved" && !solved);

  return difficultyOk && solvedOk;
}

function syncPuzzleSummaryToProfile() {
  const solved = Array.isArray(puzzleState?.solvedIds) ? puzzleState.solvedIds.length : 0;
  setProfilePuzzleProgress(activeProfileSlot, solved, getPuzzleCount());
}

function syncCampaignSummaryToProfile() {
  const completion = getCampaignCompletion(campaignState);
  setProfileCampaignProgress(activeProfileSlot, completion.completed, completion.total);
}

function isCosmeticEquipped(cosmetic) {
  if (!cosmetic || !cosmeticState?.selected) {
    return false;
  }

  if (cosmetic.type === "board") {
    return cosmeticState.selected.board === cosmetic.id;
  }

  if (cosmetic.type === "rune") {
    return cosmeticState.selected.rune === cosmetic.id;
  }

  if (cosmetic.type === "sfx") {
    return cosmeticState.selected.sfx === cosmetic.id;
  }

  return false;
}

function renderProfileEntryScreen() {
  const profiles = getProfileSlots();
  elements.profileEntryList.innerHTML = "";

  profiles.forEach((profile) => {
    const card = document.createElement("article");
    card.className = "profile-slot-card";
    if (profile.slot === activeProfileSlot) {
      card.classList.add("active");
    }

    const title = document.createElement("h3");
    title.textContent = `Slot ${profile.slot}`;
    card.appendChild(title);

    const progress = document.createElement("p");
    progress.className = "bag-meta";
    progress.textContent = `Progress: ${calculateProfileProgressPercent(profile)}% | Wallet: ${profile.walletPoints || 0} pts`;
    card.appendChild(progress);

    const nameWrap = document.createElement("div");
    nameWrap.className = "profile-slot-name";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 20;
    nameInput.dataset.entryProfileName = String(profile.slot);
    nameInput.value = profile.name;
    nameWrap.appendChild(nameInput);

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "menu-btn secondary";
    renameBtn.dataset.entryProfileRename = String(profile.slot);
    renameBtn.textContent = "Save Name";
    nameWrap.appendChild(renameBtn);
    card.appendChild(nameWrap);

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "menu-btn";
    selectBtn.dataset.entryProfileSelect = String(profile.slot);
    selectBtn.textContent = profile.slot === activeProfileSlot ? "Enter with this profile" : "Enter with this slot";
    card.appendChild(selectBtn);

    elements.profileEntryList.appendChild(card);
  });
}

function renderProfilesPanel() {
  const profiles = getProfileSlots();
  elements.profilesList.innerHTML = "";

  profiles.forEach((profile) => {
    const card = document.createElement("article");
    card.className = "profile-slot-card";
    if (profile.slot === activeProfileSlot) {
      card.classList.add("active");
    }

    const title = document.createElement("h3");
    title.textContent = `Slot ${profile.slot}`;
    card.appendChild(title);

    const progress = document.createElement("p");
    progress.className = "bag-meta";
    progress.textContent = `Progress: ${calculateProfileProgressPercent(profile)}% | Wallet: ${profile.walletPoints || 0} pts`;
    card.appendChild(progress);

    const nameWrap = document.createElement("div");
    nameWrap.className = "profile-slot-name";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 20;
    nameInput.dataset.profileName = String(profile.slot);
    nameInput.value = profile.name;
    nameWrap.appendChild(nameInput);

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "menu-btn secondary";
    renameBtn.dataset.profileRename = String(profile.slot);
    renameBtn.textContent = "Save Name";
    nameWrap.appendChild(renameBtn);
    card.appendChild(nameWrap);

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "menu-btn";
    selectBtn.dataset.profileSelect = String(profile.slot);
    selectBtn.disabled = profile.slot === activeProfileSlot;
    selectBtn.textContent = profile.slot === activeProfileSlot ? "Active" : "Select Slot";
    card.appendChild(selectBtn);

    elements.profilesList.appendChild(card);
  });
}

function activateProfileSlot(slot, options = {}) {
  const force = Boolean(options.force);
  const targetSlot = setActiveProfileSlot(slot);
  if (!force && targetSlot === activeProfileSlot) {
    return;
  }

  persistState();
  activeProfileSlot = targetSlot;
  touchProfileSlot(activeProfileSlot);
  achievementState = loadAchievementState(activeProfileSlot);
  cosmeticState = loadCosmeticState(activeProfileSlot);
  puzzleState = loadPuzzleState(activeProfileSlot);
  campaignState = loadCampaignState(activeProfileSlot);
  activePuzzleId = null;
  puzzleOutcomeHandled = false;
  activeCampaignNodeId = null;
  campaignOutcomeHandled = false;
  campaignInShopNode = false;
  applySelectedCosmetics();

  const passplayState = getSavedStateForMode(MODE_PASSPLAY, activeProfileSlot);
  state = restoreState(passplayState || createInitialState(getLocalGameOptions()), getLocalGameOptions());
  currentLocalMode = MODE_PASSPLAY;
  setAiSettings(aiConfig, false, aiConfig.playerId, aiConfig.depth);
  handVisibility = {
    1: state.currentPlayer === 1,
    2: state.currentPlayer === 2,
  };
  resetAchievementTracking();
  resetRewardTracking();
  syncAchievementSummaryToProfile();
  syncPuzzleSummaryToProfile();
  syncCampaignSummaryToProfile();

  refreshProfileHeader();
  if (tryResumeCampaignEncounter()) {
    return;
  }
  render();
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
