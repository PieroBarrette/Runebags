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
import { getRuneById, RUNE_CATALOG, getAllowedColumns } from "./runes/runeCatalog.js";
import { createSfxEngine } from "./audio/sfxEngine.js";
import { createTutorialController } from "./tutorial/tutorialController.js";
import {
  getTutorialState,
  markTutorialCompleted,
  markTutorialPromptSeen,
  markTutorialSequenceSeen,
  markTutorialTriggerShown,
  setTutorialEnabled,
} from "./persistence/tutorialStore.js";
import { getStats, recordGameResult, resetStreak } from "./persistence/statsStore.js";
import { t, getLang, setLang, applyTranslations, runeDescription } from "./i18n.js";

const THEME_STORAGE_KEY = "runebags-theme-v1";
const ANIMATION_STORAGE_KEY = "runebags-animations-v1";
const SOUND_STORAGE_KEY = "runebags-sound-v1";
const SOUND_VOLUME_STORAGE_KEY = "runebags-sound-volume-v1";
const ONLINE_NAME_MAX = 14;
const MODE_PASSPLAY = "passplay";
const MODE_AI = "ai";
const MODE_ONLINE = "online";
const DEFAULT_SFX_VOLUME = 0.18;
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
  homeRuneGallery: document.getElementById("home-rune-gallery"),
  homeStats: document.getElementById("home-stats"),
  homeResume: document.getElementById("home-resume"),
  homeResumeText: document.getElementById("home-resume-text"),
  homeResumeBtn: document.getElementById("home-resume-btn"),
  homeInstallBtn: document.getElementById("home-install"),
  runeDetailOverlay: document.getElementById("rune-detail-overlay"),
  runeDetailIcon: document.getElementById("rune-detail-icon"),
  runeDetailName: document.getElementById("rune-detail-name"),
  runeDetailDesc: document.getElementById("rune-detail-desc"),
  runeDetailClose: document.getElementById("rune-detail-close"),
  settingsPanel: document.getElementById("settings-panel"),
  themeSelect: document.getElementById("theme-select"),
  languageSelect: document.getElementById("language-select"),
  animationToggle: document.getElementById("animation-toggle"),
  soundToggle: document.getElementById("sound-toggle"),
  soundVolume: document.getElementById("sound-volume"),
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
  onlinePresence: document.getElementById("online-presence"),
  onlinePresenceText: document.getElementById("online-presence-text"),
  onlineDisconnectBanner: document.getElementById("online-disconnect-banner"),
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
  boardPanel: document.getElementById("board-panel"),
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
  passDeviceOverlay: document.getElementById("pass-device-overlay"),
  passDeviceText: document.getElementById("pass-device-text"),
  passDeviceRevealBtn: document.getElementById("pass-device-reveal-btn"),
  tutorialToggle: document.getElementById("tutorial-toggle"),
  tutorialDialog: document.getElementById("tutorial-dialog"),
  tutorialDialogText: document.getElementById("tutorial-dialog-text"),
  tutorialPrompt: document.getElementById("tutorial-prompt"),
  tutorialPromptSureBtn: document.getElementById("tutorial-prompt-sure-btn"),
  tutorialPromptSkipBtn: document.getElementById("tutorial-prompt-skip-btn"),
  p1Bag: document.getElementById("p1-bag"),
  p2Bag: document.getElementById("p2-bag"),
  p1Points: document.getElementById("p1-points"),
  p2Points: document.getElementById("p2-points"),
  pointPool: document.getElementById("point-pool"),
  neutralSupply: document.getElementById("neutral-supply"),
  roundDiscards: document.getElementById("round-discards"),
  roundAwayList: document.getElementById("round-away-list"),
  logTabs: document.getElementById("log-tabs"),
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
  endgameBagBlackLabel: document.getElementById("endgame-bag-black-label"),
  endgameBagWhiteLabel: document.getElementById("endgame-bag-white-label"),
  endgameOverlay: document.getElementById("endgame-overlay"),
  endgameTitle: document.getElementById("endgame-title"),
  endgameReason: document.getElementById("endgame-reason"),
  endgameScore1: document.getElementById("endgame-score-1"),
  endgameScore2: document.getElementById("endgame-score-2"),
  endgameP1Name: document.getElementById("endgame-p1-name"),
  endgameP1Points: document.getElementById("endgame-p1-points"),
  endgameP1Bag: document.getElementById("endgame-p1-bag"),
  endgameP2Name: document.getElementById("endgame-p2-name"),
  endgameP2Points: document.getElementById("endgame-p2-points"),
  endgameP2Bag: document.getElementById("endgame-p2-bag"),
  endgameStats: document.getElementById("endgame-stats"),
  endgameRematchStatus: document.getElementById("endgame-rematch-status"),
  endgameRematchBtn: document.getElementById("endgame-rematch-btn"),
  endgameShareBtn: document.getElementById("endgame-share-btn"),
  endgameMenuBtn: document.getElementById("endgame-menu-btn"),
  endgameDismissBtn: document.getElementById("endgame-dismiss-btn"),
  shopInstruction: document.getElementById("shop-instruction"),
  shopSwitchPlayer: document.getElementById("shop-switch-player"),
  shopRemoveBtn: document.getElementById("shop-remove-btn"),
  shopCombineBtn: document.getElementById("shop-combine-btn"),
  confirmDialogOverlay: document.getElementById("confirm-dialog-overlay"),
  confirmDialogText: document.getElementById("confirm-dialog-text"),
  confirmDialogConfirmBtn: document.getElementById("confirm-dialog-confirm-btn"),
  confirmDialogCancelBtn: document.getElementById("confirm-dialog-cancel-btn"),
};

let state = restoreState(
  getSavedStateForMode(MODE_PASSPLAY) || createInitialState(getLocalGameOptions()),
  getLocalGameOptions(),
);
let currentLocalMode = MODE_PASSPLAY;
let handVisibility = {
  1: state.currentPlayer === 1,
  2: state.currentPlayer === 2,
};
// Pass & Play: true while waiting for the next player to reveal their hand after a handoff.
let awaitingHandReveal = false;
// True once the player dismisses the end-game summary to inspect the final board.
let endgameOverlayDismissed = false;
// Guards against recording the same finished game's stats more than once.
let gameResultRecorded = false;
// Which local mode the landing "Resume game" card will continue, if any.
let homeResumeMode = null;
// Track overlay show-transitions so we move focus into them only once.
let passDeviceFocused = false;
let endgameFocused = false;
// Last rendered phase, used to play a soft fade when the phase changes.
let previousRenderPhase = null;
// Stashed beforeinstallprompt event so we can offer an "Install app" button.
let deferredInstallPrompt = null;
let activeRoomCode = null;
let waitingRoomState = createWaitingRoomState();
let onlinePresenceCount = 0;
let rematchStatus = { youRequested: false, opponentRequested: false };
const aiConfig = createAiConfig();
const online = createOnlineController();
const sfx = createSfxEngine();
let aiBusy = false;
let aiTimer = null;
let animationsEnabled = true;
let soundEnabled = true;
let sfxVolume = DEFAULT_SFX_VOLUME;
let previousBoardSnapshot = null;
let ghostCleanupTimer = null;
let previousPendingActionSnapshot = null;
let previousAudioSnapshot = null;
let suppressBoardClickOnce = false;
let activeFeedTab = "turn";
let onlineChatMessages = [];
let hasUnreadChat = false;

const tutorialController = createTutorialController({
  elements,
  onPromptSeen: () => markTutorialPromptSeen(),
  onSetEnabled: (enabled) => setTutorialEnabled(enabled),
  onSequenceSeen: (sequenceKey) => markTutorialSequenceSeen(sequenceKey),
  onTriggerShown: (triggerId) => markTutorialTriggerShown(triggerId),
  onCompleted: () => markTutorialCompleted(),
  onPromptResolved: () => render(),
});
tutorialController.loadProfileTutorialState(getTutorialState());

registerServiceWorker();

wireOnlineEvents();
bindEvents();
initializeLanguage();
initializeTheme();
initializeAnimations();
initializeSound();
renderHomeRuneGallery();
renderHomeStats();
renderHomeResume();
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
        setStatus(t("status.roomConnected", { room: activeRoomCode, player: getDisplayPlayerName(snapshot.playerId) }));
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
    presence: (info) => {
      onlinePresenceCount = Math.max(0, Number(info?.count) || 0);
      updatePresenceUI();
    },
    rematch: (info) => {
      rematchStatus = {
        youRequested: Boolean(info?.youRequested),
        opponentRequested: Boolean(info?.opponentRequested),
      };
      if (!elements.endgameOverlay.hidden) {
        renderEndgameOverlay();
      }
    },
  });
}

function bindEvents() {
  bindButtonSoundEvents();
  bindButtonHoverEvents();

  elements.menuAiBtn.addEventListener("click", () => {
    showAiPanel();
  });

  elements.menuPassplayBtn.addEventListener("click", () => {
    persistState();
    if (online.isOnlineActive()) {
      online.leaveRoom();
    }

    currentLocalMode = MODE_PASSPLAY;
    const savedPassplay = getSavedStateForMode(MODE_PASSPLAY);
    const resuming = isResumableSave(savedPassplay);
    state = restoreState(
      resuming ? savedPassplay : createInitialState(getLocalGameOptions()),
      getLocalGameOptions(),
    );
    setAiSettings(aiConfig, false, aiConfig.playerId, aiConfig.depth);
    handVisibility = {
      1: state.currentPlayer === 1,
      2: state.currentPlayer === 2,
    };
    awaitingHandReveal = state.phase === "round";
    persistState();
    enterGameScreen("passplay");
    setStatus(resuming ? t("status.passplayResumed") : t("status.passplayNew"));
    render();
  });

  elements.aiContinueBtn.addEventListener("click", () => {
    persistState();
    if (online.isOnlineActive()) {
      online.leaveRoom();
    }

    const savedAi = loadModeSave(MODE_AI);
    if (!savedAi?.state) {
      setStatus(t("status.noSavedAi"));
      return;
    }
    if (!isResumableSave(savedAi.state)) {
      setStatus(t("status.aiFinished"));
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
    setStatus(t("status.aiResumed", { player: getDisplayPlayerName(aiConfig.playerId), depth: aiConfig.depth }));

    persistState();
    enterGameScreen("passplay");
    render();
  });

  elements.aiStartBtn.addEventListener("click", async () => {
    const savedAi = loadModeSave(MODE_AI);
    if (isResumableSave(savedAi?.state)) {
      const confirmed = await showConfirmDialog("confirm.newGameOverwriteStreak");
      if (!confirmed) {
        return;
      }
      resetStreak();
      renderHomeStats();
    }

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
    setStatus(t("status.aiStarted", { player: getDisplayPlayerName(aiConfig.playerId), depth: aiConfig.depth }));

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
    setStatus(t("online.searching"));
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
      window.alert(t("online.invalidCode"));
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
        elements.waitingSummary.textContent = t("online.shareSent");
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
        elements.waitingSummary.textContent = t("online.linkCopied");
      } else {
        elements.waitingSummary.textContent = t("online.shareUnavailable");
      }
    } catch {
      elements.waitingSummary.textContent = t("online.copyFailed");
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
      setStatus(t("status.chatOnlineOnly"));
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

    const prevPlayer = state.currentPlayer;
    const result = state.pendingAction
      ? resolvePendingBoardChoice(state, { row, col: column, column })
      : playTurn(state, column, { row, col: column });

    state = result.state;
    if (result.error) {
      setStatus(result.error);
    }

    maybeQueuePassDevice(prevPlayer);
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

    const prevPlayer = state.currentPlayer;
    const result = resolvePendingBoardChoice(state, { awayIndex });
    state = result.state;
    if (result.error) {
      setStatus(result.error);
    }

    maybeQueuePassDevice(prevPlayer);
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
        setStatus(t("status.runeSelected", { player: getDisplayPlayerName(playerId) }));
      }

      persistState();
      render();
      scheduleAiTurnIfNeeded();
    });
  });

  elements.passDeviceRevealBtn.addEventListener("click", () => {
    awaitingHandReveal = false;
    render();
  });

  elements.endgameRematchBtn.addEventListener("click", () => {
    if (online.isOnlineActive()) {
      // Online: keep the room, ask the server for a rematch. The fresh game state
      // arrives as a normal state_snapshot and re-renders over this overlay.
      if (rematchStatus.youRequested) {
        return;
      }
      rematchStatus = { ...rematchStatus, youRequested: true };
      online.sendRematch();
      renderEndgameOverlay();
      return;
    }
    endgameOverlayDismissed = false;
    elements.newGameBtn.click();
  });

  elements.endgameMenuBtn.addEventListener("click", () => {
    endgameOverlayDismissed = false;
    elements.menuBtn.click();
  });

  elements.endgameDismissBtn.addEventListener("click", () => {
    endgameOverlayDismissed = true;
    render();
  });

  elements.endgameShareBtn.addEventListener("click", () => {
    const text = buildShareText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        elements.endgameShareBtn.textContent = t("endgame.copied");
        window.setTimeout(() => {
          elements.endgameShareBtn.textContent = t("endgame.share");
        }, 1600);
      }).catch(() => {
        window.prompt(t("endgame.copyPrompt"), text);
      });
    } else {
      window.prompt(t("endgame.copyPrompt"), text);
    }
  });

  elements.homeResumeBtn.addEventListener("click", () => {
    if (homeResumeMode === MODE_AI) {
      elements.aiContinueBtn.click();
    } else if (homeResumeMode === MODE_ONLINE) {
      resumeOnlineSave();
    } else {
      elements.menuPassplayBtn.click();
    }
  });

  elements.homeInstallBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch (error) {
      // ignore dismissal
    }
    deferredInstallPrompt = null;
    elements.homeInstallBtn.hidden = true;
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.homeInstallBtn.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.homeInstallBtn.hidden = true;
  });

  elements.languageSelect.addEventListener("change", () => {
    setLang(elements.languageSelect.value);
    applyTranslations();
    tutorialController.refreshActiveText();
    renderHomeStats();
    renderHomeResume();
    render();
  });

  elements.homeRuneGallery.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-rune-id]");
    if (chip) {
      openRuneDetail(chip.dataset.runeId);
    }
  });

  elements.runeDetailClose.addEventListener("click", closeRuneDetail);
  elements.runeDetailOverlay.addEventListener("click", (event) => {
    if (event.target === elements.runeDetailOverlay) {
      closeRuneDetail();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!elements.runeDetailOverlay.hidden) {
        closeRuneDetail();
      } else if (!elements.endgameOverlay.hidden) {
        endgameOverlayDismissed = true;
        render();
      }
      return;
    }

    if (event.key === "Tab") {
      const overlay = getActiveOverlay();
      if (!overlay) {
        return;
      }
      const focusables = [...overlay.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.getClientRects().length > 0);
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!overlay.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    // Column hotkeys (1-7): drop into a column during an active round.
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
      return;
    }
    if (elements.gameScreen.hidden || getActiveOverlay()) {
      return;
    }
    if (state.phase !== "round" || state.pendingAction) {
      return;
    }
    const columnNumber = Number(event.key);
    if (!Number.isInteger(columnNumber) || columnNumber < 1 || columnNumber > state.columns) {
      return;
    }
    const col = columnNumber - 1;
    let targetCell = null;
    for (let row = state.rows - 1; row >= 0; row -= 1) {
      const cell = elements.boardEl.querySelector(`.cell[data-column="${col}"][data-row="${row}"]`);
      if (cell && !cell.disabled) {
        targetCell = cell;
        break;
      }
    }
    if (targetCell) {
      event.preventDefault();
      targetCell.click();
    }
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
          state.log.unshift({ k: data.ready ? "log.markedReady" : "log.markedNotReady", p: { player: playerId }, shop: true });

          if (state.shop.players[1].ready && state.shop.players[2].ready) {
            result = startRoundFromShop(state);
            if (!result.error) {
              awaitingHandReveal = true;
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

  elements.newGameBtn.addEventListener("click", async () => {
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

    const isAiGame = aiConfig.enabled || currentLocalMode === MODE_AI;
    if (isResumableSave(state)) {
      const confirmKey = isAiGame ? "confirm.newGameOverwriteStreak" : "confirm.newGameOverwrite";
      const confirmed = await showConfirmDialog(confirmKey);
      if (!confirmed) {
        return;
      }
      if (isAiGame) {
        resetStreak();
        renderHomeStats();
      }
    }

    state = createInitialState(getLocalGameOptions());
    if (aiConfig.enabled && state.phase === "shop" && state.shop.currentPlayer !== aiConfig.playerId) {
      switchShopPlayer(state);
    }
    handVisibility = { 1: false, 2: true };
    if (isAiGame) {
      clearModeSave(MODE_AI);
    } else {
      clearModeSave(MODE_PASSPLAY);
    }
    persistState();
    setStatus(t("status.newGameCreated"));
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
      setStatus(t("status.markedReady"));
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
      setStatus(t("status.markedReady"));
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
      setStatus(t("status.markedReady"));
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
      setStatus(t("status.markedReady"));
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

  const levelLabel = runeMeta.supportsLevels && rune.level >= 2 ? ` ${t("game.levelPrefix")}${rune.level}` : "";
  const etherealLabel = rune.ethereal ? ` (${t("game.ethereal")})` : "";
  elements.boardRuneInfoTitle.textContent = `${runeMeta.name}${levelLabel}${etherealLabel}`;
  elements.boardRuneInfoDescription.textContent = runeDescription(runeMeta);

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
  playHapticTransitions(previousAudioSnapshot, audioSnapshot);
  previousAudioSnapshot = audioSnapshot;

  const forcedVisible = getForcedVisiblePlayers(state);
  const pendingTargets = getPendingBoardTargets(state);
  const pendingSnapshot = snapshotPendingAction(state.pendingAction);
  const winningLine = getWinningLine(state);
  let forcedColumns = [];

  if (state.phase === "round" && !state.pendingAction) {
    const constraints = state.nextTurnConstraints?.[state.currentPlayer] || [];
    const perthColumns = constraints.length > 0
      ? constraints.filter((col) => state.board[0][col] === 0)
      : null;

    // Jera/Inguz: when selected in hand, highlight the columns they may be played in (item 11).
    const selectedRuneId = state.players[state.currentPlayer]?.selectedRuneInstanceId;
    const selectedHandRune = selectedRuneId
      ? state.players[state.currentPlayer].hand.find((rune) => rune.instanceId === selectedRuneId)
      : null;
    const catalogRune = selectedHandRune ? getRuneById(selectedHandRune.id) : null;
    const runeAllowedColumns = catalogRune && catalogRune.columnRule && catalogRune.columnRule !== "any"
      ? getAllowedColumns(catalogRune, state.columns).filter((col) => state.board[0][col] === 0)
      : null;

    if (runeAllowedColumns) {
      forcedColumns = perthColumns
        ? runeAllowedColumns.filter((col) => perthColumns.includes(col))
        : runeAllowedColumns;
    } else if (perthColumns) {
      forcedColumns = perthColumns;
    }
  }

  // The Pass & Play handoff gate only applies during an active local round.
  if (!isPassPlayMode() || state.phase !== "round") {
    awaitingHandReveal = false;
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
    } else if (awaitingHandReveal) {
      // Pass & Play: keep both hands hidden until the incoming player reveals.
      handVisibility = { 1: false, 2: false };
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

  // Pass & Play: show the "pass the device" overlay between turns.
  elements.passDeviceOverlay.hidden = !awaitingHandReveal;
  if (awaitingHandReveal) {
    elements.passDeviceText.textContent =
      t("passDevice.handOver", { player: getDisplayPlayerName(state.currentPlayer) });
    if (!passDeviceFocused) {
      elements.passDeviceRevealBtn.focus();
      passDeviceFocused = true;
    }
  } else {
    passDeviceFocused = false;
  }

  const animationFrame = buildBoardAnimationFrame(
    state,
    animationsEnabled,
    previousBoardSnapshot,
    pendingTargets,
    previousPendingActionSnapshot,
    pendingSnapshot,
  );
  if (animationsEnabled && state.phase !== previousRenderPhase && !elements.gameScreen.hidden) {
    elements.boardPanel.classList.remove("phase-enter");
    void elements.boardPanel.offsetWidth;
    elements.boardPanel.classList.add("phase-enter");
  }
  previousRenderPhase = state.phase;

  renderBoard(state, elements, pendingTargets, winningLine, forcedColumns, animationFrame);
  previousBoardSnapshot = boardSnapshot;
  scheduleGhostCleanup(animationFrame);
  previousPendingActionSnapshot = pendingSnapshot;
  renderHands(state, elements, handVisibility, forcedVisible);
  applyOnlinePlayerNames();

  renderLog(state, elements, formatLogEntry);
  renderChatPanel();
  renderShopPanel();
  renderEndgameBags();
  renderEndgameOverlay();
  updateMeta();
  updateTopStatus();
  updateTopButtons();
  updateOnlineConnectionStatus();
  tutorialController.onGameStateUpdated(state);

  scheduleAiTurnIfNeeded();
}

function updateTopStatus() {
  if (state.pendingAction) {
    elements.turnPill.textContent = t("status.choice", { round: state.roundNumber, player: getDisplayPlayerName(state.currentPlayer) });
    elements.status.textContent = formatLogEntry(getPendingActionPrompt(state));
    return;
  }

  if (state.phase === "game-over") {
    elements.turnPill.textContent = state.gameWinner
      ? t("status.gameWinner", { player: getDisplayPlayerName(state.gameWinner) })
      : t("status.gameDraw");
    elements.status.textContent = state.gameWinner
      ? t("status.winsGame", { player: getDisplayPlayerName(state.gameWinner) })
      : t("status.fullTie");
    return;
  }

  if (state.phase === "round-end") {
    if (state.winner) {
      elements.turnPill.textContent = t("status.roundWinner", { player: getDisplayPlayerName(state.winner) });
      elements.status.textContent = t("status.roundWonBy", { round: state.roundNumber, player: getDisplayPlayerName(state.winner) });
    } else {
      elements.turnPill.textContent = t("status.roundDrawPill", { round: state.roundNumber });
      elements.status.textContent = t("status.roundDraw");
    }
    return;
  }

  if (state.phase === "shop") {
    elements.turnPill.textContent = online.isOnlineActive()
      ? t("status.shopSimultaneous")
      : t("status.shopPlayer", { player: getDisplayPlayerName(state.shop.currentPlayer) });
    elements.status.textContent = t("status.shopPhase");
    return;
  }

  elements.turnPill.textContent = t("status.turnPill", { round: state.roundNumber, player: getDisplayPlayerName(state.currentPlayer) });
  const selectedRuneId = state.players[state.currentPlayer]?.selectedRuneInstanceId;
  const selectedRune = selectedRuneId
    ? state.players[state.currentPlayer].hand.find((rune) => rune.instanceId === selectedRuneId)
    : null;
  if (selectedRune?.id === "nauthiz") {
    elements.status.textContent = t("status.nauthiz", { player: getDisplayPlayerName(state.currentPlayer) });
    return;
  }

  const forcedColumns = state.nextTurnConstraints?.[state.currentPlayer] || [];
  if (forcedColumns.length > 0) {
    elements.status.textContent = t("status.forced", { player: getDisplayPlayerName(state.currentPlayer), cols: forcedColumns.map((col) => col + 1).join(", ") });
    return;
  }

  elements.status.textContent = t("status.chooseRune", { player: getDisplayPlayerName(state.currentPlayer) });
}

function renderShopPanel() {
  const inShop = state.phase === "shop";
  elements.shopPanel.hidden = !inShop;
  elements.boardEl.hidden = inShop;
  elements.shopInstruction.hidden = !inShop;
  elements.shopSwitchPlayer.hidden = !inShop || online.isOnlineActive() || aiConfig.enabled;

  elements.phaseBtn.hidden = state.phase === "round" || state.phase === "game-over";
  if (online.isOnlineActive() && state.phase === "shop") {
    elements.phaseBtn.textContent = waitingRoomState.shopReadyYou ? t("shop.cancelReady") : t("shop.ready");
  } else if (isPassPlayMode() && state.phase === "shop") {
    const playerReady = Boolean(state.shop.players[state.shop.currentPlayer]?.ready);
    elements.phaseBtn.textContent = playerReady ? t("shop.cancelReady") : t("shop.ready");
  } else {
    elements.phaseBtn.textContent = state.phase === "shop" ? t("shop.startNextRound") : t("shop.startShop");
  }

  if (!inShop) {
    return;
  }

  if (online.isOnlineActive()) {
    const opponentId = waitingRoomState.playerId === 1 ? 2 : 1;
    const opponentPseudo = opponentId ? getDisplayPlayerName(opponentId) : (waitingRoomState.opponentName || "Opponent");
    const opponentStatus = waitingRoomState.shopReadyOpponent ? t("common.ready") : t("common.notReady");
    elements.shopInstruction.textContent = waitingRoomState.shopReadyYou
      ? t("shop.instrReady", { opp: opponentPseudo, status: opponentStatus })
      : t("shop.instrOnline", { opp: opponentPseudo, status: opponentStatus });
  } else if (isPassPlayMode()) {
    const blackReady = state.shop.players[1]?.ready ? t("common.ready") : t("common.notReady");
    const whiteReady = state.shop.players[2]?.ready ? t("common.ready") : t("common.notReady");
    elements.shopInstruction.textContent = t("shop.instrPassplay", { black: blackReady, white: whiteReady });
  } else {
    elements.shopInstruction.textContent = t("shop.instrAi");
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
    ? t("shop.titleYour", { player: getDisplayPlayerName(playerId) })
    : t("shop.title", { player: getDisplayPlayerName(playerId) });
  elements.shopModeLabel.textContent = t("shop.mode", {
    mode: data.mode || t("shop.modeNone"),
    added: data.addedCount,
    addLimit: data.addLimit,
    removed: data.removeCount,
    removeLimit: data.removeLimit,
    ready: playerReady ? t("common.yes") : t("common.no"),
  });

  renderRuneList(elements.shopOffer, data.offer, playerId, highlights.offerHighlightIds);
  renderRuneList(elements.shopBag, state.players[playerId].bag, playerId, highlights.bagHighlightIds);

  elements.shopRemoveBtn.hidden = !actions.removeVisible;
  elements.shopCombineBtn.hidden = !actions.combineVisible;
  elements.shopRemoveBtn.disabled = playerReady && isPassPlayMode();
  elements.shopCombineBtn.disabled = playerReady && isPassPlayMode();

  tutorialController.onShopAvailabilityChanged(playerId, Boolean(actions.combineVisible));

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

  elements.endgameBagBlackLabel.textContent = t("endgame.bagLabel", { player: getDisplayPlayerName(1) });
  elements.endgameBagWhiteLabel.textContent = t("endgame.bagLabel", { player: getDisplayPlayerName(2) });
  renderRuneList(elements.endgameBagBlack, state.players[1].bag, 1, [], { readOnly: true });
  renderRuneList(elements.endgameBagWhite, state.players[2].bag, 2, [], { readOnly: true });
}

const GAME_END_REASON_KEYS = {
  majority: "reason.majority",
  "points-supply-empty": "reason.supplyEmpty",
  "fewest-bag-runes": "reason.fewestBag",
  "full-tie": "reason.fullTie",
};

function renderEndgameOverlay() {
  if (state.phase !== "game-over") {
    endgameOverlayDismissed = false;
    gameResultRecorded = false;
    endgameFocused = false;
    rematchStatus = { youRequested: false, opponentRequested: false };
    if (elements.endgameRematchStatus) {
      elements.endgameRematchStatus.hidden = true;
      elements.endgameRematchStatus.textContent = "";
    }
    elements.endgameOverlay.hidden = true;
    return;
  }

  if (!gameResultRecorded) {
    recordGameResult(getHumanOutcome());
    gameResultRecorded = true;
    renderHomeStats();
  }

  const winner = state.gameWinner;
  elements.endgameTitle.textContent = winner
    ? t("endgame.wins", { player: getDisplayPlayerName(winner) })
    : t("endgame.draw");
  const reasonKey = GAME_END_REASON_KEYS[state.gameWinnerReason];
  elements.endgameReason.textContent = reasonKey ? t(reasonKey) : (winner ? "" : t("endgame.endedLevel"));

  elements.endgameP1Name.textContent = getDisplayPlayerName(1);
  elements.endgameP2Name.textContent = getDisplayPlayerName(2);
  elements.endgameP1Points.textContent = String(state.players[1].points);
  elements.endgameP2Points.textContent = String(state.players[2].points);
  elements.endgameP1Bag.textContent = t("endgame.bag", { n: state.players[1].bag.length });
  elements.endgameP2Bag.textContent = t("endgame.bag", { n: state.players[2].bag.length });
  elements.endgameScore1.classList.toggle("winner", winner === 1);
  elements.endgameScore2.classList.toggle("winner", winner === 2);

  const stats = getStats();
  const decisive = stats.wins + stats.losses + stats.draws;
  elements.endgameStats.textContent = decisive > 0
    ? t("endgame.record", { w: stats.wins, l: stats.losses, d: stats.draws, s: stats.currentStreak })
    : t("stats.gamesPlayed", { n: stats.gamesPlayed });

  updateEndgameRematchUI();

  elements.endgameOverlay.hidden = endgameOverlayDismissed;
  if (!endgameOverlayDismissed) {
    if (!endgameFocused) {
      elements.endgameRematchBtn.focus();
      endgameFocused = true;
    }
  } else {
    endgameFocused = false;
  }
}

// In online play the "Play again" button becomes a true rematch: it shows pending
// state once you opt in and surfaces when the opponent has asked. Local play keeps
// the plain restart label.
function updateEndgameRematchUI() {
  if (!online.isOnlineActive()) {
    elements.endgameRematchBtn.disabled = false;
    elements.endgameRematchBtn.textContent = t("endgame.playAgain");
    if (elements.endgameRematchStatus) {
      elements.endgameRematchStatus.hidden = true;
      elements.endgameRematchStatus.textContent = "";
    }
    return;
  }

  elements.endgameRematchBtn.textContent = rematchStatus.youRequested
    ? t("endgame.rematchPending")
    : t("endgame.rematch");
  elements.endgameRematchBtn.disabled = rematchStatus.youRequested;

  if (elements.endgameRematchStatus) {
    let statusText = "";
    if (rematchStatus.opponentRequested && !rematchStatus.youRequested) {
      statusText = t("endgame.rematchOffered");
    } else if (rematchStatus.youRequested && !rematchStatus.opponentRequested) {
      statusText = t("endgame.rematchPending");
    }
    elements.endgameRematchStatus.textContent = statusText;
    elements.endgameRematchStatus.hidden = !statusText;
  }
}

function getHumanOutcome() {
  const winner = state.gameWinner;
  if (online.isOnlineActive()) {
    // Online results don't affect the local win streak (AI-only for now;
    // online may get its own lobby streak later).
    return "played";
  }
  if (aiConfig.enabled) {
    const human = aiConfig.playerId === 1 ? 2 : 1;
    if (!winner) {
      return "draw";
    }
    return winner === human ? "win" : "loss";
  }
  return "played";
}

function renderHomeStats() {
  if (!elements.homeStats) {
    return;
  }
  const stats = getStats();
  if (stats.gamesPlayed === 0) {
    elements.homeStats.hidden = true;
    return;
  }
  let text = t("stats.gamesPlayed", { n: stats.gamesPlayed });
  const decisive = stats.wins + stats.losses + stats.draws;
  if (decisive > 0) {
    text += t("stats.recordSuffix", { w: stats.wins, l: stats.losses, d: stats.draws, s: stats.currentStreak, b: stats.bestStreak });
  }
  elements.homeStats.hidden = false;
  elements.homeStats.textContent = text;
}

function buildShareText() {
  const winner = state.gameWinner;
  const title = winner ? t("share.wins", { player: getDisplayPlayerName(winner) }) : t("share.draw");
  const grid = state.board
    .map((row) => row
      .map((v) => (v === 1 ? "\u{1F535}" : v === 2 ? "⚪" : v === 3 ? "\u{1F7EB}" : "⬛"))
      .join(""))
    .join("\n");
  return `RuneBags — ${title}\n${t("share.line", { round: state.roundNumber, b: state.players[1].points, w: state.players[2].points })}\n${t("share.legend")}\n${grid}\nhttps://runebags.onrender.com`;
}

function renderRuneList(container, runes, playerId, highlightIds, options = {}) {
  const readOnly = Boolean(options.readOnly);
  container.innerHTML = "";
  const highlightSet = new Set(highlightIds || []);

  if (!runes.length) {
    const empty = document.createElement("p");
    empty.className = "bag-meta";
    empty.textContent = t("bag.empty");
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
      ? `${t("game.levelPrefix")}${rune.level} - ${runeDescription(rune)}`
      : runeDescription(rune);

    if (rune.shopEffect) {
      const effect = document.createElement("small");
      effect.className = "shop-effect";
      effect.textContent = t("rune.shopEffect");
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
  const pointsLabel = t("game.points");
  renderPointRunes(elements.p1Points, pointsLabel, state.players[1].points);
  renderPointRunes(elements.p2Points, pointsLabel, state.players[2].points);
  elements.p1Bag.textContent = t("game.bag", { n: state.players[1].bag.length });
  elements.p2Bag.textContent = t("game.bag", { n: state.players[2].bag.length });
  renderPointRunes(elements.pointPool, pointsLabel, state.pointPoolRemaining);
  elements.neutralSupply.textContent = t("game.neutralSupply", { n: state.neutralSupply });
  const visibleAway = state.roundAwayRunes.map((entry, awayIndex) => ({ ...entry, awayIndex }));
  const shouldShowAway = state.phase !== "shop" && visibleAway.length > 0;
  elements.roundDiscards.hidden = !shouldShowAway;
  elements.roundAwayList.hidden = !shouldShowAway;
  if (shouldShowAway) {
    elements.roundDiscards.textContent = t("game.discardedThisRound", { n: visibleAway.length });
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
    title.textContent = `${rune.name} ${t("game.levelPrefix")}${entry.level}`;
    const subtitle = document.createElement("small");
    const ownerLabel = entry.owner === 1 ? t("side.black") : entry.owner === 2 ? t("side.white") : t("common.neutral");
    subtitle.textContent = t("endgame.discarded", { source: entry.source, owner: ownerLabel });

    textWrap.appendChild(title);
    textWrap.appendChild(subtitle);
    card.appendChild(icon);
    card.appendChild(textWrap);
    elements.roundAwayList.appendChild(card);
  });
}

function renderChatPanel() {
  const isOnline = online.isOnlineActive();

  // Offline (AI / Pass & Play): no chat, no tabs — just the plain turn log.
  if (!isOnline) {
    activeFeedTab = "turn";
    hasUnreadChat = false;
    elements.logTabs.hidden = true;
    elements.turnLog.hidden = false;
    elements.chatPanel.hidden = true;
    return;
  }

  elements.logTabs.hidden = false;
  const showChat = activeFeedTab === "chat";

  if (showChat) {
    hasUnreadChat = false;
  }

  elements.logTabTurn.classList.toggle("active", !showChat);
  elements.logTabChat.classList.toggle("active", showChat);
  elements.logTabChat.classList.toggle("has-notification", hasUnreadChat && !showChat);
  elements.logTabTurn.setAttribute("aria-selected", String(!showChat));
  elements.logTabChat.setAttribute("aria-selected", String(showChat));

  elements.turnLog.hidden = showChat;
  elements.chatPanel.hidden = !showChat;
  elements.logTabChat.disabled = false;
  elements.chatInput.disabled = false;

  if (!showChat) {
    return;
  }

  elements.chatLog.innerHTML = "";
  if (!onlineChatMessages.length) {
    const row = document.createElement("div");
    row.className = "chat-row";
    row.textContent = t("chat.empty");
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
    author.textContent = `${entry.name || t("common.player")}:`;

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

// Pass & Play: after a turn hands control to the other player, hide both hands
// behind the "pass the device" overlay until the incoming player reveals.
function maybeQueuePassDevice(prevPlayerId) {
  if (
    isPassPlayMode()
    && state.phase === "round"
    && !state.pendingAction
    && state.currentPlayer !== prevPlayerId
  ) {
    awaitingHandReveal = true;
  }
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

function showConfirmDialog(messageKey) {
  return new Promise((resolve) => {
    elements.confirmDialogText.textContent = t(messageKey);
    elements.confirmDialogOverlay.hidden = false;

    const cleanup = (result) => {
      elements.confirmDialogOverlay.hidden = true;
      elements.confirmDialogConfirmBtn.removeEventListener("click", onConfirm);
      elements.confirmDialogCancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);

    elements.confirmDialogConfirmBtn.addEventListener("click", onConfirm);
    elements.confirmDialogCancelBtn.addEventListener("click", onCancel);
  });
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
  tutorialController.hideAll();
  renderHomeResume();
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
  elements.aiContinueBtn.disabled = !isResumableSave(savedAi?.state);
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
    setStatus(t("status.onlineRoomShare", { room: roomCode }));
  } else {
    clearRoomQuery();
  }

  tutorialController.onGameEntered(mode, state.phase);
  render();
}

function updateOnlineRoomUI(roomCode) {
  const isFriendMode = waitingRoomState.mode === "friend";
  const isQueueMode = waitingRoomState.mode === "queue";
  const showQueueStatus = isQueueMode && waitingRoomState.queued;
  const hasRoomCode = isFriendMode && typeof roomCode === "string" && /^[A-Z2-9]{6}$/.test(roomCode);
  const roomLink = hasRoomCode ? buildRoomLink(roomCode) : "";

  elements.onlineRoomCode.hidden = !hasRoomCode;
  elements.onlineRoomCode.textContent = t("online.room", { code: hasRoomCode ? roomCode : "-" });
  if (elements.onlineQueueStatus) {
    elements.onlineQueueStatus.hidden = !showQueueStatus;
  }
  if (elements.onlineQueueText) {
    elements.onlineQueueText.textContent = showQueueStatus
      ? waitingRoomState.queuePosition > 1
        ? t("online.searchingQueue", { n: waitingRoomState.queuePosition })
        : t("online.searching")
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
    elements.waitingRole.textContent = t("online.youAre", { name: waitingRoomState.yourName || getDisplayPlayerName(waitingRoomState.playerId) });
  }

  elements.onlineReadyBtn.hidden = !isFriendMode || !waitingRoomState.opponentJoined;
  elements.onlineSendLinkBtn.hidden = !isFriendMode;
  elements.onlineReadyBtn.disabled = !isFriendMode || !waitingRoomState.opponentJoined;

  elements.waitingYouStatus.textContent = isFriendMode
    ? t("online.youStatus", {
        name: waitingRoomState.yourName || t("online.you"),
        status: waitingRoomState.youReady ? t("common.ready") : t("common.notReady"),
      })
    : t("online.youStatus", {
        name: t("online.you"),
        status: waitingRoomState.queued ? t("online.inQueue") : t("online.notQueued"),
      });

  if (isQueueMode) {
    elements.waitingOpponentStatus.textContent = waitingRoomState.queued
      ? t("online.queuePosition", { n: waitingRoomState.queuePosition > 1 ? waitingRoomState.queuePosition : 1 })
      : t("online.queueInactive");
  } else {
    elements.waitingOpponentStatus.textContent = waitingRoomState.opponentJoined
      ? t("online.youStatus", {
          name: waitingRoomState.opponentName || t("online.opponent"),
          status: waitingRoomState.opponentReady ? t("common.ready") : t("online.opponentJoinedNotReady"),
        }) + (waitingRoomState.opponentConnected ? "" : t("online.offlineSuffix"))
      : t("online.opponentWaiting");
  }

  if (waitingRoomState.started) {
    elements.waitingSummary.textContent = t("online.matchStarted");
    return;
  }

  if (isQueueMode) {
    elements.waitingSummary.textContent = waitingRoomState.queued
      ? t("online.searching")
      : "";
    return;
  }

  if (isFriendMode) {
    if (waitingRoomState.canStart) {
      elements.waitingSummary.textContent = t("online.bothReady");
      return;
    }
    if (!waitingRoomState.opponentJoined) {
      elements.waitingSummary.textContent = t("online.shareInvite");
      return;
    }
    elements.waitingSummary.textContent = waitingRoomState.youReady
      ? t("online.youReadyWaiting")
      : t("online.opponentJoinedSetReady");
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
    elements.onlineServerText.textContent = serverConnected ? t("online.serverConnected") : t("online.serverDisconnected");
  }

  updatePresenceUI();
  updateOpponentDisconnectBanner();

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

function updatePresenceUI() {
  if (!elements.onlinePresence || !elements.onlinePresenceText) {
    return;
  }
  const show = onlinePresenceCount > 0 && isOnlineServerConnected();
  elements.onlinePresence.hidden = !show;
  if (show) {
    elements.onlinePresenceText.textContent = t("online.presence", { n: onlinePresenceCount });
  }
}

function updateOpponentDisconnectBanner() {
  if (!elements.onlineDisconnectBanner) {
    return;
  }
  const inGame = online.isOnlineActive() && !elements.gameScreen.hidden;
  const opponentGone = inGame
    && waitingRoomState.opponentJoined
    && !waitingRoomState.opponentConnected;
  elements.onlineDisconnectBanner.hidden = !opponentGone;
  if (opponentGone) {
    elements.onlineDisconnectBanner.textContent = t("online.opponentDisconnected");
  }
}

function updateTopButtons() {
  const onlineGame = online.isOnlineActive();
  elements.newGameBtn.hidden = false;
  elements.newGameBtn.textContent = onlineGame ? t("topbar.leaveGame") : t("topbar.newGame");
}

function getValidatedOnlinePseudo() {
  const pseudo = normalizePseudo(elements.onlinePseudo.value || "");
  if (!pseudo) {
    window.alert(t("online.enterName"));
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
  return t(playerId === 1 ? "side.black" : "side.white");
}

// Turn-log entries are structured { k, p } from the engine (legacy strings
// still supported). Resolve player-id params to display names and translate.
function formatLogEntry(entry) {
  if (!entry) {
    return "";
  }
  if (typeof entry === "string") {
    return entry;
  }
  if (!entry.k) {
    return "";
  }
  const params = { ...(entry.p || {}) };
  ["player", "opponent", "winner", "owner"].forEach((key) => {
    if (typeof params[key] === "number") {
      params[key] = getDisplayPlayerName(params[key]);
    }
  });
  if (params.reasonKey) {
    params.reason = t(params.reasonKey);
  }
  return t(entry.k, params);
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

// A saved game can only be continued if it exists and is not already finished.
function isResumableSave(savedState) {
  return Boolean(
    savedState
    && typeof savedState === "object"
    && savedState.phase !== "game-over"
    && !savedState.gameWinner,
  );
}

function getLocalGameOptions() {
  return {};
}

function renderHomeRuneGallery() {
  const gallery = elements.homeRuneGallery;
  if (!gallery) {
    return;
  }
  gallery.innerHTML = "";
  RUNE_CATALOG
    .filter((rune) => rune.icon && rune.id !== "basic" && rune.id !== "neutral")
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((rune) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "home-rune";
      chip.dataset.runeId = rune.id;
      chip.title = `${rune.name}: ${runeDescription(rune)}`;

      const icon = document.createElement("img");
      icon.className = "home-rune-icon";
      icon.src = rune.icon;
      icon.alt = rune.name;
      icon.loading = "lazy";

      const name = document.createElement("span");
      name.className = "home-rune-name";
      name.textContent = rune.name;

      chip.appendChild(icon);
      chip.appendChild(name);
      gallery.appendChild(chip);
    });
}

function renderHomeResume() {
  if (!elements.homeResume) {
    return;
  }
  const aiSave = loadModeSave(MODE_AI);
  const passSave = loadModeSave(MODE_PASSPLAY);
  const onlineSave = loadModeSave(MODE_ONLINE);
  const candidates = [];
  if (isResumableSave(aiSave?.state)) {
    candidates.push({ mode: MODE_AI, updatedAt: aiSave.updatedAt || 0, round: aiSave.state.roundNumber || 1 });
  }
  if (isResumableSave(passSave?.state)) {
    candidates.push({ mode: MODE_PASSPLAY, updatedAt: passSave.updatedAt || 0, round: passSave.state.roundNumber || 1 });
  }
  if (isResumableSave(onlineSave?.state) && /^[A-Z2-9]{6}$/.test(String(onlineSave?.roomCode || "").toUpperCase())) {
    candidates.push({ mode: MODE_ONLINE, updatedAt: onlineSave.updatedAt || 0, round: onlineSave.state.roundNumber || 1 });
  }

  if (candidates.length === 0) {
    homeResumeMode = null;
    elements.homeResume.hidden = true;
    return;
  }

  candidates.sort((a, b) => b.updatedAt - a.updatedAt);
  const best = candidates[0];
  homeResumeMode = best.mode;
  const label = best.mode === MODE_AI ? t("home.playAi") : (best.mode === MODE_ONLINE ? t("home.online") : t("home.passplay"));
  elements.homeResumeText.textContent = t("home.resumeText", { mode: label, round: best.round });
  elements.homeResume.hidden = false;
}

function resumeOnlineSave() {
  const savedOnline = loadModeSave(MODE_ONLINE);
  const roomCode = String(savedOnline?.roomCode || "").toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(roomCode)) {
    return;
  }

  const pseudo = normalizePseudo(online.getSession().displayName || "");
  online.setDisplayName(pseudo);
  online.leaveRoom();
  activeRoomCode = roomCode;
  waitingRoomState = {
    ...createWaitingRoomState(),
    mode: "friend",
  };
  showOnlinePanel();
  updateOnlineRoomUI(activeRoomCode);
  online.joinRoom(roomCode, { displayName: pseudo }).then((ok) => {
    if (!ok) {
      waitingRoomState = createWaitingRoomState();
      activeRoomCode = null;
      updateOnlineRoomUI("-");
    }
  });
}

function openRuneDetail(runeId) {
  const rune = getRuneById(runeId);
  if (!rune) {
    return;
  }
  elements.runeDetailIcon.src = rune.icon || "";
  elements.runeDetailIcon.alt = rune.name;
  elements.runeDetailName.textContent = rune.name;
  elements.runeDetailDesc.textContent = runeDescription(rune);
  elements.runeDetailOverlay.hidden = false;
  elements.runeDetailClose.focus();
}

function closeRuneDetail() {
  elements.runeDetailOverlay.hidden = true;
}

function getActiveOverlay() {
  const overlays = [
    elements.runeDetailOverlay,
    elements.endgameOverlay,
    elements.passDeviceOverlay,
    elements.tutorialPrompt,
  ];
  return overlays.find((el) => el && !el.hidden && el.getClientRects().length > 0) || null;
}

function initializeLanguage() {
  setLang(getLang());
  if (elements.languageSelect) {
    elements.languageSelect.value = getLang();
  }
  applyTranslations();
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const theme = savedTheme === "light" ? "light" : "dark";
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
  window.addEventListener("touchend", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

function bindButtonSoundEvents() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) {
      return;
    }
    sfx.unlockFromGesture();
    sfx.play(resolveClickSound(button));
  });
}

// Give the recurring shop gestures their own voice instead of the generic click.
function resolveClickSound(button) {
  if (button.id === "shop-remove-btn") {
    return "shop-remove";
  }
  if (button.id === "shop-combine-btn") {
    return "shop-combine";
  }
  if (button.classList.contains("rune-card") && button.closest("#shop-offer")) {
    return "shop-add";
  }
  return "ui-click";
}

function bindButtonHoverEvents() {
  let lastHoverTarget = null;
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") {
      return;
    }
    // Every interactive control + the home info cards get a hover tick, but board
    // cells are excluded so sweeping the grid mid-game doesn't machine-gun.
    const target = event.target.closest("button:not(.cell), a[href], .home-pillar");
    if (target === lastHoverTarget) {
      return;
    }
    lastHoverTarget = target;
    if (!target || target.disabled) {
      return;
    }
    sfx.play("ui-hover");
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

  // Logs are newest-first, so the head holds this turn's freshly pushed entries.
  const log = Array.isArray(currentState.log) ? currentState.log : [];
  const logKeysHead = log
    .slice(0, 8)
    .map((entry) => (entry && typeof entry === "object" ? entry.k : null));

  return {
    phase: currentState.phase,
    winner: currentState.winner,
    gameWinner: currentState.gameWinner,
    boardSignature,
    logLength: log.length,
    logKeysHead,
  };
}

// Maps the structured turn-log keys produced by the engine to an effect sound,
// in descending salience. The first matching category among a turn's new log
// entries wins, so a play that both relocates and scores plays the score cue.
const SFX_EFFECT_BY_LOG_KEY = [
  { sound: "capture", keys: ["log.pointGain", "log.odalPoint", "log.wunjoBonus"] },
  {
    sound: "rune-destroy",
    keys: ["log.geboRemovedBelow", "log.geboRemovedChosen", "log.kenazDestroyed", "log.soweluRemoved"],
  },
  { sound: "rune-return", keys: ["log.ansuzReturned", "log.fehuRecovered", "log.etherealReturns"] },
  { sound: "rune-move", keys: ["log.teiwazMoved"] },
  { sound: "rune-summon", keys: ["log.thurisaPlaced", "log.mannazAdded", "log.dagazAdded", "log.dagazCopied"] },
];

function pickEffectSound(newLogKeys) {
  const present = new Set(newLogKeys.filter(Boolean));
  for (const entry of SFX_EFFECT_BY_LOG_KEY) {
    if (entry.keys.some((key) => present.has(key))) {
      return entry.sound;
    }
  }
  return null;
}

function playSoundTransitions(previousSnapshot, currentSnapshot) {
  if (!previousSnapshot || !soundEnabled) {
    return;
  }

  const enteredRound = previousSnapshot.phase !== "round" && currentSnapshot.phase === "round";
  if (enteredRound) {
    sfx.play("round-start");
  }

  // Pick a per-effect cue from this turn's new log entries; fall back to the
  // generic placement thunk. Gated to an ongoing round so a scoring/ending play
  // doesn't double up with the round-end / game-over fanfare below.
  const newLogCount = currentSnapshot.logLength - previousSnapshot.logLength;
  const effectSound = newLogCount > 0 && newLogCount <= 8
    ? pickEffectSound(currentSnapshot.logKeysHead.slice(0, newLogCount))
    : null;
  const moved = previousSnapshot.boardSignature !== currentSnapshot.boardSignature;
  if (currentSnapshot.phase === "round" && !enteredRound) {
    if (effectSound) {
      sfx.play(effectSound);
    } else if (moved) {
      sfx.play("move");
    }
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

function playHapticTransitions(previousSnapshot, currentSnapshot) {
  if (!previousSnapshot || typeof navigator.vibrate !== "function") {
    return;
  }

  if (previousSnapshot.phase !== "game-over" && currentSnapshot.phase === "game-over") {
    navigator.vibrate(currentSnapshot.gameWinner ? [0, 40, 50, 40, 50, 60] : 20);
    return;
  }

  if (previousSnapshot.phase !== "round-end" && currentSnapshot.phase === "round-end") {
    navigator.vibrate(currentSnapshot.winner ? [0, 25, 35, 25] : 15);
    return;
  }

  const enteredRound = previousSnapshot.phase !== "round" && currentSnapshot.phase === "round";
  const moved = previousSnapshot.boardSignature !== currentSnapshot.boardSignature;
  if (moved && currentSnapshot.phase !== "shop" && !enteredRound) {
    navigator.vibrate(8);
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

// Transient effect ghosts (a destroyed/returned/moved rune fading out) are drawn
// for one render only. Because render() is interaction-driven, schedule a single
// follow-up render once the animation has finished so the ghost node is dropped
// even if the player never clicks. previousBoardSnapshot is already advanced, so
// this cleanup render diffs empty and re-triggers no animation.
function scheduleGhostCleanup(animationFrame) {
  if (ghostCleanupTimer !== null) {
    window.clearTimeout(ghostCleanupTimer);
    ghostCleanupTimer = null;
  }

  if (!animationFrame || !animationFrame.enabled) {
    return;
  }

  const hasGhosts =
    (animationFrame.geboGhostByCell && animationFrame.geboGhostByCell.size > 0) ||
    (animationFrame.ansuzGhostByCell && animationFrame.ansuzGhostByCell.size > 0) ||
    (animationFrame.teiwazLiftGhostByCell && animationFrame.teiwazLiftGhostByCell.size > 0);
  if (!hasGhosts) {
    return;
  }

  ghostCleanupTimer = window.setTimeout(() => {
    ghostCleanupTimer = null;
    render();
  }, 900);
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
