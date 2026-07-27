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
} from "./core/gameState.js";
import {
  createAiConfig,
  getAiThinkingText,
  runAiShopForSide,
  runAiStep,
  setAiSettings,
  shouldAiAct,
} from "./ai/aiController.js";
import { renderBoard } from "./ui/boardView.js";
import { renderHands } from "./ui/handView.js";
import { renderLog } from "./ui/logView.js";
import { clearModeSave, loadModeSave, saveModeSave } from "./persistence/localStore.js";
import { createOnlineController, AVATAR_GLYPHS, AVATAR_COLORS, QUICK_CHAT_KEYS } from "./online/onlineController.js";
import { getRuneById, RUNE_CATALOG, getAllowedColumns } from "./runes/runeCatalog.js";
import { createSfxEngine } from "./audio/sfxEngine.js";
import { createMusicEngine } from "./audio/musicEngine.js";
import { getStats, recordGameResult, resetStreak } from "./persistence/statsStore.js";
import { renderRuneFigure, renderRulesFigures } from "./ui/rulesFigures.js";
import { fetchLeaderboard, fetchMyGames, fetchMyServerStats, fetchOngoingRooms } from "./net/apiClient.js";
import { createReplayController } from "./replay/replayController.js";
import { disablePush, enablePush, getPushState, isPushSupported, needsInstallForPush } from "./push/pushClient.js";
import { t, tp, getLang, setLang, applyTranslations, runeDescription } from "./i18n.js";

const THEME_STORAGE_KEY = "runebags-theme-v1";
const ANIMATION_STORAGE_KEY = "runebags-animations-v1";
const SOUND_STORAGE_KEY = "runebags-sound-v1";
const SOUND_VOLUME_STORAGE_KEY = "runebags-sound-volume-v1";
const MUSIC_STORAGE_KEY = "runebags-music-v1";
const MUSIC_VOLUME_STORAGE_KEY = "runebags-music-volume-v1";
const ONLINE_NAME_MAX = 14;
const MODE_AI = "ai";
const MODE_ONLINE = "online";
const DEFAULT_SFX_VOLUME = 0.18;
const DEFAULT_MUSIC_VOLUME = 0.5;

// Quick-chat: emoji shown on the buttons/bubbles; the text comes from i18n
// so each player reads the message in their own language.
const QC_EMOJI = {
  "qc.hello": "\u{1F44B}",
  "qc.goodLuck": "\u{1F340}",
  "qc.wellPlayed": "\u{1F44F}",
  "qc.wow": "\u{1F62E}",
  "qc.thinking": "\u{1F914}",
  "qc.goodGame": "\u{1F91D}",
};

// Server error codes → localized messages. Unknown codes fall back to the
// server's raw English message rather than silence.
const ONLINE_ERROR_KEY_BY_CODE = {
  room_not_found: "online.error.roomNotFound",
  room_exists: "online.error.roomExists",
  room_full: "online.error.roomFull",
  match_started_reconnect: "online.error.matchStartedReconnect",
  reconnect_failed: "online.error.reconnectFailed",
  reconnect_token_invalid: "online.error.reconnectFailed",
  join_room_first: "online.error.joinRoomFirst",
  cannot_change_ready: "online.error.cannotChangeReady",
  match_already_started: "online.error.matchAlreadyStarted",
  need_two_players: "online.error.needTwoPlayers",
  both_ready_required: "online.error.bothReadyRequired",
  no_finished_match: "online.error.rematchUnavailable",
  rematch_only_game_over: "online.error.rematchUnavailable",
  rematch_need_both: "online.error.rematchNeedBoth",
  match_not_active: "online.error.matchNotActive",
  shop_ready_online: "online.error.shopReadyOnline",
  seq_missing: "online.error.desync",
  seq_out_of_order: "online.error.desync",
  invalid_json: "online.error.generic",
  malformed: "online.error.generic",
  unknown_type: "online.error.generic",
  invalid_guest: "online.error.generic",
  client_connect_failed: "online.error.connectFailed",
  client_not_connected: "online.error.notConnected",
};
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
  homeInstallBtn: document.getElementById("home-install"),
  runeDetailOverlay: document.getElementById("rune-detail-overlay"),
  runeDetailIcon: document.getElementById("rune-detail-icon"),
  runeDetailName: document.getElementById("rune-detail-name"),
  runeDetailDesc: document.getElementById("rune-detail-desc"),
  runeDetailFigure: document.getElementById("rune-detail-figure"),
  runeDetailClose: document.getElementById("rune-detail-close"),
  settingsPanel: document.getElementById("settings-panel"),
  statsPanel: document.getElementById("stats-panel"),
  menuStatsBtn: document.getElementById("menu-stats-btn"),
  statsContent: document.getElementById("stats-content"),
  statsOnlineServer: document.getElementById("stats-online-server"),
  statsHistory: document.getElementById("stats-history"),
  statsBackBtn: document.getElementById("stats-back-btn"),
  onlineOngoing: document.getElementById("online-ongoing"),
  onlineOngoingList: document.getElementById("online-ongoing-list"),
  onlineLeaderboard: document.getElementById("online-leaderboard"),
  onlineLeaderboardList: document.getElementById("online-leaderboard-list"),
  onlineMyStats: document.getElementById("online-my-stats"),
  pushLabel: document.getElementById("push-label"),
  pushToggle: document.getElementById("push-toggle"),
  pushHint: document.getElementById("push-hint"),
  replayPanel: document.getElementById("replay-panel"),
  replayBoard: document.getElementById("replay-board"),
  replayMeta: document.getElementById("replay-meta"),
  replayWarning: document.getElementById("replay-warning"),
  replayScore: document.getElementById("replay-score"),
  replayStepLabel: document.getElementById("replay-step-label"),
  replayRange: document.getElementById("replay-range"),
  replayFirstBtn: document.getElementById("replay-first-btn"),
  replayPrevBtn: document.getElementById("replay-prev-btn"),
  replayNextBtn: document.getElementById("replay-next-btn"),
  replayLastBtn: document.getElementById("replay-last-btn"),
  replayBackBtn: document.getElementById("replay-back-btn"),
  themeSelect: document.getElementById("theme-select"),
  languageSelect: document.getElementById("language-select"),
  animationToggle: document.getElementById("animation-toggle"),
  soundToggle: document.getElementById("sound-toggle"),
  soundVolume: document.getElementById("sound-volume"),
  musicToggle: document.getElementById("music-toggle"),
  musicVolume: document.getElementById("music-volume"),
  settingsBackBtn: document.getElementById("settings-back-btn"),
  onlinePanel: document.getElementById("online-panel"),
  onlineServerDot: document.getElementById("online-server-dot"),
  onlineServerText: document.getElementById("online-server-text"),
  onlineWakeBanner: document.getElementById("online-wake-banner"),
  onlineWakeText: document.getElementById("online-wake-text"),
  onlineStepHome: document.getElementById("online-step-home"),
  onlineStepSearching: document.getElementById("online-step-searching"),
  onlineStepRoom: document.getElementById("online-step-room"),
  onlineAvatarBtn: document.getElementById("online-avatar-btn"),
  onlineAvatarPicker: document.getElementById("online-avatar-picker"),
  onlineAvatarGlyphs: document.getElementById("online-avatar-glyphs"),
  onlineAvatarColors: document.getElementById("online-avatar-colors"),
  onlineQueueCancelBtn: document.getElementById("online-queue-cancel-btn"),
  onlineInviteBlock: document.getElementById("online-invite-block"),
  onlineRoomCodeLink: document.getElementById("online-room-code-link"),
  onlinePlayerYou: document.getElementById("online-player-you"),
  onlinePlayerOpp: document.getElementById("online-player-opp"),
  onlineYouAvatar: document.getElementById("online-you-avatar"),
  onlineYouName: document.getElementById("online-you-name"),
  onlineYouState: document.getElementById("online-you-state"),
  onlineOppAvatar: document.getElementById("online-opp-avatar"),
  onlineOppName: document.getElementById("online-opp-name"),
  onlineOppState: document.getElementById("online-opp-state"),
  appToast: document.getElementById("app-toast"),
  quickChatBar: document.getElementById("quick-chat-bar"),
  qcBubbles: document.getElementById("qc-bubbles"),
  p1Avatar: document.getElementById("p1-avatar"),
  p2Avatar: document.getElementById("p2-avatar"),
  onlineQueueText: document.getElementById("online-queue-text"),
  onlineInviteBanner: document.getElementById("online-invite-banner"),
  onlineInviteCode: document.getElementById("online-invite-code"),
  onlineInviteActions: document.getElementById("online-invite-actions"),
  onlineInviteJoinBtn: document.getElementById("online-invite-join-btn"),
  onlineNormalActions: document.getElementById("online-normal-actions"),
  onlineJoinRow: document.getElementById("online-join-row"),
  onlineConnecting: document.getElementById("online-connecting"),
  onlineConnectingText: document.getElementById("online-connecting-text"),
  onlinePlayers: document.getElementById("online-players"),
  onlineRoomQr: document.getElementById("online-room-qr"),
  onlinePresence: document.getElementById("online-presence"),
  onlinePresenceText: document.getElementById("online-presence-text"),
  onlineDisconnectBanner: document.getElementById("online-disconnect-banner"),
  waitingSummary: document.getElementById("waiting-summary"),
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
  shopRemoveBtn: document.getElementById("shop-remove-btn"),
  shopCombineBtn: document.getElementById("shop-combine-btn"),
  confirmDialogOverlay: document.getElementById("confirm-dialog-overlay"),
  confirmDialogText: document.getElementById("confirm-dialog-text"),
  confirmDialogConfirmBtn: document.getElementById("confirm-dialog-confirm-btn"),
  confirmDialogCancelBtn: document.getElementById("confirm-dialog-cancel-btn"),
};

let state = restoreState(
  getSavedStateForMode(MODE_AI) || createInitialState(getLocalGameOptions()),
  getLocalGameOptions(),
);
let currentLocalMode = MODE_AI;
let handVisibility = {
  1: state.currentPlayer === 1,
  2: state.currentPlayer === 2,
};
// True once the player dismisses the end-game summary to inspect the final board.
let endgameOverlayDismissed = false;
// Guards against recording the same finished game's stats more than once.
let gameResultRecorded = false;
// Track overlay show-transitions so we move focus into them only once.
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
const music = createMusicEngine({ getContext: () => sfx.getAudioContext() });
// Console handle for diagnosing audio on real devices (state, volume, restart).
window.__rbMusic = music;
const replay = createReplayController({ elements, onClose: () => showStatsPanel() });
let aiBusy = false;
let aiTimer = null;
let animationsEnabled = true;
let soundEnabled = true;
let sfxVolume = DEFAULT_SFX_VOLUME;
let previousBoardSnapshot = null;
let previousRenderRound = null;
// When each effect ghost first appeared, so a board rebuild can resume its
// fade instead of restarting it. Keyed by "row:col".
const ghostStartedAt = new Map();
let ghostCleanupTimer = null;
let previousPendingActionSnapshot = null;
let previousAudioSnapshot = null;
let suppressBoardClickOnce = false;
let activeFeedTab = "turn";
let onlineChatMessages = [];
let hasUnreadChat = false;
let toastShowTimer = null;
let toastHideTimer = null;
let quickChatCooldownTimer = null;
// Set when the page is opened via an invite link (?room=). The invitee lands
// on the home step so they can pick a name/avatar before actually joining.
let pendingInviteCode = null;
// Online async shop entry: when a round ends, each player enters the shop on
// their own click instead of being yanked in when the opponent opens it.
// `hasEnteredShop` is this client's per-round gate; `pendingShopSnapshot` holds
// the opponent-triggered shop state we deferred applying while lingering on the
// finished board.
let hasEnteredShop = false;
let pendingShopSnapshot = null;

registerServiceWorker();

wireOnlineEvents();
bindEvents();
initializeLanguage();
initializeTheme();
initializeAnimations();
initializeSound();
initializeMusic();
initializePush();
replay.bind();
renderHomeRuneGallery();
renderRulesFigures();
renderHomeStats();
bindSoundUnlockHandlers();
render();
dismissSplash();
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
      // First snapshot for this room: we're connected and now know who's here,
      // so leave the connecting state and drop any pending invite.
      pendingInviteCode = null;
      waitingRoomState = {
        mode: "friend",
        queued: false,
        queuePosition: 0,
        playerNames: snapshot.playerNames || waitingRoomState.playerNames,
        playerAvatars: snapshot.playerAvatars || waitingRoomState.playerAvatars,
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
        connecting: false,
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
      // Async shop entry: if the opponent opened the shop while we're still
      // looking at the just-finished board, defer applying the shop snapshot.
      // We keep the round-end view until we tap "enter shop" ourselves; the
      // round can't start without both players' shop-ready, so nothing is lost.
      if (
        !hasEnteredShop
        && snapshot.state?.phase === "shop"
        && state?.phase === "round-end"
        && !elements.gameScreen.hidden
      ) {
        pendingShopSnapshot = snapshot;
        waitingRoomState.shopReadyOpponent = Boolean(snapshot.shopSync?.opponentReady);
        onlineChatMessages = Array.isArray(snapshot.chat) ? snapshot.chat.slice(-100) : onlineChatMessages;
        render();
        updateOnlineConnectionStatus();
        return;
      }
      applyOnlineStateSnapshot(snapshot);
    },
    queue: (snapshot) => {
      waitingRoomState = {
        ...waitingRoomState,
        mode: "queue",
        queued: snapshot.queued,
        queuePosition: snapshot.position,
      };
      updateOnlineRoomUI(activeRoomCode || "-");
      setStatus(formatQueueStatus(snapshot));
    },
    chat: (message) => {
      const isQuick = message && message.kind === "quick" && typeof message.key === "string";
      if (!message || (!isQuick && typeof message.text !== "string")) {
        return;
      }
      onlineChatMessages.push(message);
      if (onlineChatMessages.length > 100) {
        onlineChatMessages = onlineChatMessages.slice(-100);
      }
      if (activeFeedTab === "turn") {
        hasUnreadChat = true;
      }
      if (isQuick) {
        spawnQuickBubble(message);
      }
      if (!elements.gameScreen.hidden) {
        renderChatPanel();
      }
    },
    error: (info) => {
      const message = resolveOnlineErrorMessage(info);
      // A create/join attempt that reached the server but was rejected (room
      // not found, full, already started…) leaves the lobby stuck on the
      // connecting spinner, since joinRoom() itself succeeded. Recover to the
      // home step so the toast isn't the only feedback.
      if (waitingRoomState.connecting && !online.isOnlineActive()) {
        activeRoomCode = null;
        pendingInviteCode = null;
        waitingRoomState = createWaitingRoomState();
        updateWakeBanner({ waking: false });
        if (!elements.onlinePanel.hidden) {
          updateOnlineRoomUI("-");
        }
      }
      if (!message) {
        return;
      }
      setStatus(message);
      showToast(message);
    },
    status: (info) => {
      const message = info && typeof info === "object" && info.key ? t(info.key) : String(info || "");
      if (message && !elements.gameScreen.hidden) {
        setStatus(message);
      }
      updateOnlineConnectionStatus();
    },
    wake: (info) => {
      updateWakeBanner(info);
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
    // The shop always belongs to the player; the AI shops its own side on its
    // own, so the board never hands the opponent's bag over by mistake.
    if (state.phase === "shop") {
      state.shop.currentPlayer = getHumanPlayerId();
    }
    handVisibility = { 1: aiSide !== 1, 2: aiSide !== 2 };
    elements.aiSideSelect.value = String(aiConfig.playerId);
    elements.aiDepthSelect.value = String(aiConfig.depth);
    setStatus(t("status.aiResumed", { player: getDisplayPlayerName(aiConfig.playerId), depth: aiConfig.depth }));

    persistState();
    enterGameScreen("local");
    render();
  });

  elements.aiStartBtn.addEventListener("click", async () => {
    const savedAi = loadModeSave(MODE_AI);
    if (isResumableSave(savedAi?.state)) {
      const confirmed = await showConfirmDialog("confirm.newGameOverwriteStreak");
      if (!confirmed) {
        return;
      }
      resetStreak("ai");
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
    // The shop always belongs to the player; the AI shops its own side on its
    // own, so the board never hands the opponent's bag over by mistake.
    if (state.phase === "shop") {
      state.shop.currentPlayer = getHumanPlayerId();
    }
    handVisibility = { 1: aiSide !== 1, 2: aiSide !== 2 };
    setStatus(t("status.aiStarted", { player: getDisplayPlayerName(aiConfig.playerId), depth: aiConfig.depth }));

    persistState();
    enterGameScreen("local");
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
        // Stale save, no live socket: stay on the home step with the code
        // prefilled — the room step only makes sense once connected.
        activeRoomCode = savedRoomCode;
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
      connecting: true,
    };
    updateOnlineRoomUI(activeRoomCode);
    const ok = await online.createRoom(activeRoomCode, pseudo);
    if (!ok) {
      waitingRoomState = createWaitingRoomState();
      activeRoomCode = null;
      updateOnlineRoomUI("-");
    }
  });

  elements.onlineJoinBtn.addEventListener("click", () => {
    joinRoomByCode(elements.onlineJoinCode.value);
  });

  elements.onlineInviteJoinBtn.addEventListener("click", () => {
    joinRoomByCode(pendingInviteCode || elements.onlineJoinCode.value);
  });

  elements.menuRulesBtn.addEventListener("click", () => {
    showRulesPanel();
  });

  elements.menuSettingsBtn.addEventListener("click", () => {
    showSettingsPanel();
  });

  elements.menuStatsBtn.addEventListener("click", () => {
    showStatsPanel();
  });

  elements.statsBackBtn.addEventListener("click", () => {
    showMainMenu();
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

  elements.musicToggle.addEventListener("change", () => {
    const enabled = Boolean(elements.musicToggle.checked);
    applyMusicSetting(enabled);
    saveMusicPreference(enabled);
    if (enabled) {
      // The change event follows a real click/keydown, so audio is unlockable here.
      music.maybeStart({ fromGesture: true });
    }
  });

  elements.musicVolume.addEventListener("input", () => {
    const value = Number(elements.musicVolume.value);
    applyMusicVolumeSetting(value / 100);
  });

  elements.musicVolume.addEventListener("change", () => {
    const value = Number(elements.musicVolume.value);
    const nextVolume = value / 100;
    applyMusicVolumeSetting(nextVolume);
    saveMusicVolumePreference(nextVolume);
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
    pendingInviteCode = null;
    waitingRoomState = createWaitingRoomState();
    onlineChatMessages = [];
    updateWakeBanner({ waking: false });
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

  // Following your own invite link would seat you as your own opponent in a
  // second tab — intercept the click and copy the link instead. Right-click
  // and long-press share flows keep working through the real href.
  elements.onlineRoomCodeLink.addEventListener("click", async (event) => {
    event.preventDefault();
    const link = elements.onlineRoomCodeLink.href;
    if (!link) {
      return;
    }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(link);
        showToast(t("online.linkCopied"));
      } else {
        showToast(t("online.shareUnavailable"));
      }
    } catch {
      showToast(t("online.copyFailed"));
    }
  });

  elements.onlineAvatarBtn.addEventListener("click", () => {
    elements.onlineAvatarPicker.hidden = !elements.onlineAvatarPicker.hidden;
    if (!elements.onlineAvatarPicker.hidden) {
      refreshAvatarPickerSelection();
    }
  });

  elements.onlineQueueCancelBtn.addEventListener("click", () => {
    online.cancelQueue();
    waitingRoomState = createWaitingRoomState();
    // A background connect may still be retrying; the user asked out, so
    // drop the wake banner now rather than when those retries give up.
    updateWakeBanner({ waking: false });
    updateOnlineRoomUI("-");
  });

  buildAvatarPicker();
  buildQuickChatBar();

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

    const result = state.pendingAction
      ? resolvePendingBoardChoice(state, { row, col: column, column })
      : playTurn(state, column, { row, col: column });

    state = result.state;
    if (result.error) {
      setStatus(formatEngineError(result));
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
      setStatus(formatEngineError(result));
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
        setStatus(formatEngineError(result));
      } else {
        setStatus(t("status.runeSelected", { player: getDisplayPlayerName(playerId) }));
      }

      persistState();
      render();
      scheduleAiTurnIfNeeded();
    });
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
    renderHomeStats();
    refreshQuickChatBar();
    if (!elements.onlinePanel.hidden) {
      updateOnlineRoomUI(activeRoomCode || "-");
      updateOnlineConnectionStatus();
    }
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
      if (state.phase === "round-end") {
        if (pendingShopSnapshot) {
          // The opponent already opened the shop; enter it locally instead of
          // re-sending phase_action (which the server would reject anyway).
          enterPendingShop();
        } else {
          // First to leave the board: mark ourselves entered so the shop
          // snapshot the server sends back is applied rather than deferred.
          hasEnteredShop = true;
          online.sendAction("phase_action", {});
        }
        return;
      }
      online.sendAction("phase_action", {});
      return;
    }

    let result = { state, error: null };

    if (state.phase === "round-end") {
      result = enterShopPhase(state);
      if (!result.error && aiConfig.enabled) {
        // The shop used to be handed to the AI first and switched back once it
        // had played. Its move runs on a timer, so anyone clicking in that
        // window was shopping out of the opponent's bag. The human now stays
        // on their own side and the AI shops its own, independently.
        result.state.shop.currentPlayer = getHumanPlayerId();
      }
    } else if (state.phase === "shop") {
      // Never let the round start on a shop the AI hasn't taken yet: its turn
      // is on a timer, and the player can click faster than that.
      if (aiConfig.enabled) {
        runAiShopForSide(state, aiConfig.playerId);
      }
      result = startRoundFromShop(state);
      if (!result.error) {
        handVisibility = {
          1: result.state.currentPlayer === 1,
          2: result.state.currentPlayer === 2,
        };
      }
    }

    state = result.state;
    if (result.error) {
      setStatus(formatEngineError(result));
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
        resetStreak("ai");
        renderHomeStats();
      }
    }

    state = createInitialState(getLocalGameOptions());
    if (aiConfig.enabled && state.phase === "shop") {
      state.shop.currentPlayer = getHumanPlayerId();
    }
    handVisibility = { 1: false, 2: true };
    clearModeSave(MODE_AI);
    persistState();
    setStatus(t("status.newGameCreated"));
    render();
  });

  elements.shopRemoveBtn.addEventListener("click", () => {
    if (online.isOnlineActive()) {
      const mode = getCurrentShopMode();
      online.sendAction("shop_set_mode", { mode: mode === "remove" ? null : "remove" });
      return;
    }
    const mode = getCurrentShopMode();
    const result = setShopMode(state, mode === "remove" ? null : "remove");
    state = result.state;
    if (result.error) {
      setStatus(formatEngineError(result));
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
    const mode = getCurrentShopMode();
    const result = setShopMode(state, mode === "combine" ? null : "combine");
    state = result.state;
    if (result.error) {
      setStatus(formatEngineError(result));
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
    const result = shopSelectBagRune(state, runeInstanceId);
    state = result.state;
    if (result.error) {
      setStatus(formatEngineError(result));
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
    const result = shopSelectOfferRune(state, runeInstanceId);
    state = result.state;
    if (result.error) {
      setStatus(formatEngineError(result));
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
    // The board is off-screen but the state keeps moving (AI turns run on a
    // timer, online snapshots keep arriving). Advance the diff baselines
    // anyway: otherwise the next visible render diffs against a board from
    // before the player left and paints effect ghosts — floating, in cells
    // nothing just happened in — for every rune that vanished meanwhile.
    previousBoardSnapshot = snapshotBoard(state);
    previousPendingActionSnapshot = snapshotPendingAction(state.pendingAction);
    previousAudioSnapshot = snapshotAudioState(state, previousBoardSnapshot);
    previousRenderRound = state.roundNumber;
    return;
  }

  hideBoardRuneInfo();

  const boardSnapshot = snapshotBoard(state);
  const audioSnapshot = snapshotAudioState(state, boardSnapshot);
  playSoundTransitions(previousAudioSnapshot, audioSnapshot);
  playHapticTransitions(previousAudioSnapshot, audioSnapshot);
  previousAudioSnapshot = audioSnapshot;

  // Fuller ambient layer during play; ease back to the calm menu profile
  // once the endgame overlay is up.
  music.setContext(state.phase === "game-over" ? "menu" : "game");

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

  if (state.phase === "round") {
    if (online.isOnlineActive()) {
      handVisibility = {
        1: false,
        2: false,
      };

      if (waitingRoomState.playerId) {
        handVisibility[waitingRoomState.playerId] = true;
      }
    } else {
      const humanPlayerId = getHumanPlayerId();
      handVisibility = {
        1: false,
        2: false,
      };
      handVisibility[humanPlayerId] = state.currentPlayer === humanPlayerId;
    }
  }

  handVisibility[1] = forcedVisible[1] ? true : handVisibility[1];
  handVisibility[2] = forcedVisible[2] ? true : handVisibility[2];

  if (aiConfig.enabled && !forcedVisible[aiConfig.playerId]) {
    handVisibility[aiConfig.playerId] = false;
  }

  // A new round wipes the board, so diffing across it would read as "every
  // rune from last round was destroyed" and paint a ghost in each of their
  // cells. Skip effect animations for that one render.
  const roundChanged = previousRenderRound !== null && state.roundNumber !== previousRenderRound;
  previousRenderRound = state.roundNumber;

  const animationFrame = buildBoardAnimationFrame(
    state,
    animationsEnabled && !roundChanged,
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

  applyGhostTiming(animationFrame);
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
  // Online only: the opponent has opened the shop but we're still viewing the
  // finished board. Show a hint + an inviting "enter shop" label.
  const lingering = online.isOnlineActive() && state.phase === "round-end" && Boolean(pendingShopSnapshot);
  elements.shopPanel.hidden = !inShop;
  elements.boardEl.hidden = inShop;
  elements.shopInstruction.hidden = !inShop && !lingering;

  elements.phaseBtn.hidden = state.phase === "round" || state.phase === "game-over";
  if (online.isOnlineActive() && state.phase === "shop") {
    elements.phaseBtn.textContent = waitingRoomState.shopReadyYou ? t("shop.cancelReady") : t("shop.ready");
  } else if (lingering) {
    elements.phaseBtn.textContent = t("shop.enterShop");
  } else {
    elements.phaseBtn.textContent = state.phase === "shop" ? t("shop.startNextRound") : t("shop.startShop");
  }

  if (lingering) {
    const opponentId = waitingRoomState.playerId === 1 ? 2 : 1;
    const opponentPseudo = opponentId ? getDisplayPlayerName(opponentId) : (waitingRoomState.opponentName || t("online.opponent"));
    elements.shopInstruction.textContent = t("shop.opponentInShop", { opp: opponentPseudo });
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
  } else {
    elements.shopInstruction.textContent = t("shop.instrAi");
  }

  // Whose shop the player is allowed to touch. Online it is their seat; against
  // the AI it is always their own side — rendering shop.currentPlayer blindly is
  // what let a player shop out of the AI's bag.
  let playerId = state.shop.currentPlayer;
  if (online.isOnlineActive() && waitingRoomState.playerId) {
    playerId = waitingRoomState.playerId;
  } else if (aiConfig.enabled) {
    playerId = getHumanPlayerId();
  }

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
    recordGameResult(getHumanOutcome(), currentStatsMode());
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
  const bucket = stats[currentStatsMode()];
  const decisive = typeof bucket?.wins === "number" ? bucket.wins + bucket.losses + bucket.draws : 0;
  elements.endgameStats.textContent = decisive > 0
    ? t("endgame.record", { w: bucket.wins, l: bucket.losses, d: bucket.draws, s: bucket.currentStreak })
    : tp("stats.gamesPlayed", stats.totals.gamesPlayed);

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

// The side the local player sits on in an AI game (the AI takes the other).
function getHumanPlayerId() {
  return aiConfig.playerId === 1 ? 2 : 1;
}

// Which per-mode stats bucket the game being played (or just finished) belongs to.
function currentStatsMode() {
  if (online.isOnlineActive()) {
    return "online";
  }
  return "ai";
}

function getHumanOutcome() {
  const winner = state.gameWinner;
  if (online.isOnlineActive()) {
    // Device-local view of the online record; kept in its own bucket so the
    // AI streak stays AI-only. The authoritative record lives on the server.
    const seat = waitingRoomState.playerId;
    if (!seat) {
      return "played";
    }
    if (!winner) {
      return "draw";
    }
    return winner === seat ? "win" : "loss";
  }
  if (aiConfig.enabled) {
    const human = getHumanPlayerId();
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
  if (stats.totals.gamesPlayed === 0) {
    elements.homeStats.hidden = true;
    return;
  }
  let text = tp("stats.gamesPlayed", stats.totals.gamesPlayed);
  const ai = stats.ai;
  const decisive = ai.wins + ai.losses + ai.draws;
  if (decisive > 0) {
    text += t("stats.recordSuffix", { w: ai.wins, l: ai.losses, d: ai.draws, s: ai.currentStreak, b: ai.bestStreak });
  }
  elements.homeStats.hidden = false;
  elements.homeStats.textContent = text;
}

// The lobby and the stats screen both surface the server-side record. Both
// calls are fire-and-forget: an offline or cold-starting server just leaves
// the sections hidden rather than blocking the UI.
async function refreshLobbySocial() {
  const [players, myStats] = await Promise.all([fetchLeaderboard(10), fetchMyServerStats()]);

  if (elements.onlineMyStats) {
    const show = Boolean(myStats && myStats.games > 0);
    elements.onlineMyStats.hidden = !show;
    if (show) {
      elements.onlineMyStats.textContent = t("lb.you", {
        w: myStats.wins,
        l: myStats.losses,
        d: myStats.draws,
        s: myStats.currentStreak,
      });
    }
  }

  if (!elements.onlineLeaderboard || !elements.onlineLeaderboardList) {
    return;
  }

  elements.onlineLeaderboardList.innerHTML = "";
  if (players.length === 0) {
    elements.onlineLeaderboard.hidden = true;
    return;
  }

  players.forEach((player) => {
    const item = document.createElement("li");
    item.className = "online-leaderboard-row";

    const chip = document.createElement("span");
    chip.className = "online-avatar-chip";
    renderAvatarChip(chip, player.avatar);
    item.appendChild(chip);

    const name = document.createElement("span");
    name.className = "online-leaderboard-name";
    name.textContent = player.name;
    item.appendChild(name);

    const score = document.createElement("span");
    score.className = "online-leaderboard-score";
    score.textContent = `${tp("count.wins", player.wins)} / ${tp("count.games", player.games)}`;
    item.appendChild(score);

    elements.onlineLeaderboardList.appendChild(item);
  });
  elements.onlineLeaderboard.hidden = false;
}

// Online games this device still holds a seat in, listed inside the online
// lobby so a correspondence game can be picked back up days later.
async function renderOnlineOngoing() {
  if (!elements.onlineOngoing || !elements.onlineOngoingList) {
    return;
  }

  const rooms = await fetchOngoingRooms();
  elements.onlineOngoingList.innerHTML = "";

  // The room this device is still attached to. The lobby always opens on its
  // home step now, so this card is the way back into it.
  const currentCode = activeRoomCode && /^[A-Z2-9]{6}$/.test(activeRoomCode)
    ? activeRoomCode
    : getResumableOnlineRoomCode();
  if (currentCode && !rooms.some((room) => room.roomCode === currentCode)) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "home-ongoing-card";

    const label = document.createElement("span");
    label.className = "home-ongoing-opponent";
    label.textContent = t("online.ongoingRoom", { code: currentCode });
    card.appendChild(label);

    const status = document.createElement("span");
    status.className = "home-ongoing-status your-turn";
    status.textContent = t("online.ongoingRejoin");
    card.appendChild(status);

    card.addEventListener("click", () => {
      if (online.isOnlineActive() && activeRoomCode === currentCode) {
        updateOnlineRoomUI(currentCode);
        return;
      }
      resumeOnlineRoom(currentCode);
    });
    elements.onlineOngoingList.appendChild(card);
  }

  if (rooms.length === 0 && !currentCode) {
    elements.onlineOngoing.hidden = true;
    return;
  }

  rooms.forEach((room) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "home-ongoing-card";

    const opponent = document.createElement("span");
    opponent.className = "home-ongoing-opponent";
    opponent.textContent = room.opponent?.name || t("online.waitingOpponent");
    card.appendChild(opponent);

    const status = document.createElement("span");
    status.className = "home-ongoing-status";
    if (room.yourTurn) {
      status.classList.add("your-turn");
      status.textContent = t("home.ongoing.yourTurn");
    } else if (room.phase === "shop") {
      status.textContent = t("home.ongoing.shopPhase");
    } else {
      status.textContent = t("home.ongoing.waiting");
    }
    card.appendChild(status);

    const meta = document.createElement("span");
    meta.className = "home-ongoing-meta";
    meta.textContent = t("home.ongoing.round", { n: room.roundNumber });
    card.appendChild(meta);

    card.addEventListener("click", () => {
      resumeOnlineRoom(room.roomCode);
    });
    elements.onlineOngoingList.appendChild(card);
  });
  elements.onlineOngoing.hidden = false;
}

// Finished online games, newest first; each row opens the replay viewer.
async function renderStatsHistory() {
  if (!elements.statsHistory) {
    return;
  }

  const games = await fetchMyGames(10);
  elements.statsHistory.innerHTML = "";
  if (games.length === 0) {
    elements.statsHistory.hidden = true;
    return;
  }

  const heading = document.createElement("h3");
  heading.className = "stats-mode-title";
  heading.textContent = t("history.title");
  elements.statsHistory.appendChild(heading);

  games.forEach((game) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "stats-history-row";

    const outcome = document.createElement("span");
    outcome.className = "stats-history-outcome";
    if (game.youWon === null) {
      outcome.textContent = t("history.draw");
    } else if (game.youWon) {
      outcome.classList.add("win");
      outcome.textContent = t("history.win");
    } else {
      outcome.classList.add("loss");
      outcome.textContent = t("history.loss");
    }
    row.appendChild(outcome);

    const versus = document.createElement("span");
    versus.className = "stats-history-versus";
    versus.textContent = t("history.vs", { player: game.opponent?.name || "?" });
    row.appendChild(versus);

    const score = document.createElement("span");
    score.className = "stats-history-score";
    score.textContent = `${game.points[1]} – ${game.points[2]}`;
    row.appendChild(score);

    row.addEventListener("click", () => {
      showReplayPanel(game.id);
    });
    elements.statsHistory.appendChild(row);
  });
  elements.statsHistory.hidden = false;
}

async function renderStatsServerRecord() {
  if (!elements.statsOnlineServer) {
    return;
  }
  const stats = await fetchMyServerStats();
  if (!stats || stats.games === 0) {
    elements.statsOnlineServer.hidden = true;
    return;
  }

  elements.statsOnlineServer.innerHTML = "";
  const heading = document.createElement("h3");
  heading.className = "stats-mode-title";
  heading.textContent = t("stats.server.title");
  elements.statsOnlineServer.appendChild(heading);

  const line = document.createElement("p");
  line.className = "stats-line";
  line.textContent = formatRecord(stats.wins, stats.losses, stats.draws);
  elements.statsOnlineServer.appendChild(line);

  const streak = document.createElement("p");
  streak.className = "stats-line stats-streak";
  streak.textContent = t("statsScreen.streak", { s: stats.currentStreak, b: stats.bestStreak });
  elements.statsOnlineServer.appendChild(streak);

  elements.statsOnlineServer.hidden = false;
}

// Built from separately pluralized fragments so "1 défaite" doesn't come out
// as "1 défaites" — a single template string can't agree on three counts.
function formatRecord(wins, losses, draws) {
  return [
    tp("count.wins", wins),
    tp("count.losses", losses),
    tp("count.draws", draws),
  ].join(" · ");
}

function renderStatsPanel() {
  if (!elements.statsContent) {
    return;
  }
  const stats = getStats();
  const container = elements.statsContent;
  container.innerHTML = "";

  const total = document.createElement("p");
  total.className = "stats-total";
  total.textContent = tp("statsScreen.totalGames", stats.totals.gamesPlayed);
  container.appendChild(total);

  const grid = document.createElement("div");
  grid.className = "stats-mode-grid";
  grid.appendChild(buildStatsModeCard(t("statsScreen.modeAi"), stats.ai));
  grid.appendChild(buildStatsModeCard(t("statsScreen.modeOnline"), stats.online));
  container.appendChild(grid);
}

function buildStatsModeCard(title, bucket) {
  const card = document.createElement("article");
  card.className = "stats-mode-card";

  const heading = document.createElement("h3");
  heading.className = "stats-mode-title";
  heading.textContent = title;
  card.appendChild(heading);

  const gamesPlayed = Number(bucket?.gamesPlayed || 0);
  if (gamesPlayed === 0) {
    const empty = document.createElement("p");
    empty.className = "stats-line stats-empty";
    empty.textContent = t("statsScreen.empty");
    card.appendChild(empty);
    return card;
  }

  const games = document.createElement("p");
  games.className = "stats-line";
  games.textContent = tp("count.games", gamesPlayed);
  card.appendChild(games);

  if (typeof bucket.wins === "number") {
    const decisive = bucket.wins + bucket.losses + bucket.draws;
    if (decisive > 0) {
      const record = document.createElement("p");
      record.className = "stats-line";
      record.textContent = formatRecord(bucket.wins, bucket.losses, bucket.draws);
      card.appendChild(record);

      const rate = document.createElement("p");
      rate.className = "stats-line";
      rate.textContent = t("statsScreen.winRate", { pct: Math.round((bucket.wins / decisive) * 100) });
      card.appendChild(rate);

      const streak = document.createElement("p");
      streak.className = "stats-line stats-streak";
      streak.textContent = t("statsScreen.streak", { s: bucket.currentStreak, b: bucket.bestStreak });
      card.appendChild(streak);
    }
  }

  return card;
}

function buildShareText() {
  const winner = state.gameWinner;
  const title = winner ? t("share.wins", { player: getDisplayPlayerName(winner) }) : t("share.draw");
  const grid = state.board
    .map((row) => row
      .map((v) => (v === 1 ? "\u{1F535}" : v === 2 ? "⚪" : v === 3 ? "\u{1F7EB}" : "⬛"))
      .join(""))
    .join("\n");
  return `RuneBags — ${title}\n${t("share.line", { round: state.roundNumber, b: state.players[1].points, w: state.players[2].points })}\n${t("share.legend")}\n${grid}\nhttps://runebags.ca`;
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
  elements.quickChatBar.hidden = !isOnline;

  // Offline (vs the AI): no chat, no tabs — just the plain turn log.
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
    text.textContent = entry.kind === "quick" && entry.key
      ? ` ${formatQuickChatText(entry)}`
      : ` ${entry.text || ""}`;

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
      setStatus(formatEngineError(result));
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

  if (mode === "online" && room && /^[A-Z2-9]{6}$/i.test(room)) {
    // Opened an invite link. Land on the home step (identity + a prominent
    // "Join room" button) so the invitee can pick a name/avatar BEFORE
    // connecting — they only actually join when they tap Join, which then
    // shows the host who's already waiting.
    const inviteCode = room.toUpperCase();
    pendingInviteCode = inviteCode;
    activeRoomCode = null;
    waitingRoomState = createWaitingRoomState();
    elements.onlineJoinCode.value = inviteCode;
    const pseudo = normalizePseudo(elements.onlinePseudo.value || online.getSession().displayName || "");
    elements.onlinePseudo.value = pseudo;
    online.setDisplayName(pseudo);
    showOnlinePanel();
    return;
  }

  const savedOnline = loadModeSave(MODE_ONLINE);
  const savedRoomCode = String(savedOnline?.roomCode || "").toUpperCase();
  if (/^[A-Z2-9]{6}$/.test(savedRoomCode)) {
    activeRoomCode = savedRoomCode;
    elements.onlineJoinCode.value = savedRoomCode;
  }

  showMainMenu();
}

function showMainMenu() {
  elements.mainMenu.hidden = false;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.statsPanel.hidden = true;
  elements.replayPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  music.setContext("menu");
}

function showAiPanel() {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = false;
  elements.settingsPanel.hidden = true;
  elements.statsPanel.hidden = true;
  elements.replayPanel.hidden = true;
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
  // The AI menu is now the only way back into a solo game, so make the button
  // read as the primary action whenever there is something to continue.
  const canContinue = isResumableSave(savedAi?.state);
  elements.aiContinueBtn.disabled = !canContinue;
  elements.aiContinueBtn.classList.toggle("primary", canContinue);
}

function showOnlinePanel() {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.statsPanel.hidden = true;
  elements.onlinePanel.hidden = false;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  elements.onlinePseudo.value = normalizePseudo(elements.onlinePseudo.value || online.getSession().displayName || "");
  if (activeRoomCode && /^[A-Z2-9]{6}$/.test(activeRoomCode)) {
    elements.onlineJoinCode.value = activeRoomCode;
  }
  renderOnlineIdentity();
  updateOnlineRoomUI(activeRoomCode || "-");
  // Always land on the lobby, even when a room is still attached: otherwise a
  // previous room locks the panel and quick play or another code is out of
  // reach. Getting back into that room is a card in the list below.
  showOnlineLobbyStep();
  updateOnlineConnectionStatus();
  refreshLobbySocial();
  renderOnlineOngoing();
}

function showOnlineLobbyStep() {
  elements.onlineStepHome.hidden = false;
  elements.onlineStepSearching.hidden = true;
  elements.onlineStepRoom.hidden = true;
  renderInviteBanner();
}

function showRulesPanel() {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.statsPanel.hidden = true;
  elements.replayPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = false;
  elements.gameScreen.hidden = true;
}

function showSettingsPanel() {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = false;
  elements.statsPanel.hidden = true;
  elements.replayPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
}

function showStatsPanel() {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.statsPanel.hidden = false;
  elements.replayPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  renderStatsPanel();
  renderStatsServerRecord();
  renderStatsHistory();
}

function showReplayPanel(gameId) {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.statsPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  // open() reveals the panel itself once the recording has loaded.
  replay.open(gameId);
}

function enterGameScreen(mode, roomCode = null) {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.statsPanel.hidden = true;
  elements.replayPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = false;

  if (mode === "online" && roomCode) {
    applyRoomQuery(roomCode);
    setStatus(t("status.onlineRoomShare", { room: roomCode }));
  } else {
    clearRoomQuery();
  }

  render();
}

// The lobby is a small state machine: "home" (identity + primary actions),
// "searching" (quick-play queue) and "room" (invite + waiting room). Exactly
// one step is visible at a time.
function updateOnlineRoomUI(roomCode) {
  const isFriendMode = waitingRoomState.mode === "friend";
  const searching = waitingRoomState.mode === "queue" && waitingRoomState.queued;
  const hasRoomCode = isFriendMode && typeof roomCode === "string" && /^[A-Z2-9]{6}$/.test(roomCode);
  const step = searching ? "searching" : (hasRoomCode ? "room" : "home");

  elements.onlineStepHome.hidden = step !== "home";
  elements.onlineStepSearching.hidden = step !== "searching";
  elements.onlineStepRoom.hidden = step !== "room";

  if (step === "home") {
    renderOnlineIdentity();
    renderInviteBanner();
    return;
  }

  if (step === "searching") {
    elements.onlineQueueText.textContent = waitingRoomState.queuePosition > 1
      ? t("online.searchingQueue", { n: waitingRoomState.queuePosition })
      : t("online.searching");
    return;
  }

  renderOnlineRoomStep(roomCode);
}

function renderOnlineRoomStep(roomCode) {
  // Before the first waiting_snapshot arrives, we don't yet know who is in the
  // room. Show a plain "connecting…" spinner instead of the invite/QR block,
  // which otherwise flashes "share your code" at someone who is joining (and
  // lingers for the whole Render cold start).
  const connecting = Boolean(waitingRoomState.connecting);
  elements.onlineConnecting.hidden = !connecting;
  elements.onlineInviteBlock.hidden = connecting;
  elements.onlinePlayers.hidden = connecting;
  elements.waitingSummary.hidden = connecting;
  elements.onlineReadyBtn.hidden = connecting;
  if (connecting) {
    elements.onlineConnectingText.textContent = t("online.connectingTo", { code: roomCode });
    return;
  }

  const roomLink = buildRoomLink(roomCode);
  const showInvite = !waitingRoomState.opponentJoined;

  elements.onlineRoomCodeLink.textContent = roomCode;
  elements.onlineRoomCodeLink.href = roomLink;

  // The whole invite block (code + QR + share) earns its space only while the
  // opponent's seat is empty; once they're in, collapse it to the player cards.
  elements.onlineInviteBlock.hidden = !showInvite;
  if (showInvite) {
    elements.onlineRoomQr.src = buildRoomQrUrl(roomLink);
    elements.onlineRoomQr.hidden = false;
  } else {
    elements.onlineRoomQr.removeAttribute("src");
    elements.onlineRoomQr.hidden = true;
  }
  elements.onlineSendLinkBtn.hidden = !showInvite;

  const yourId = waitingRoomState.playerId;
  const oppId = yourId === 1 ? 2 : 1;
  const avatars = waitingRoomState.playerAvatars || {};

  renderAvatarChip(elements.onlineYouAvatar, (yourId && avatars[yourId]) || online.getAvatar());
  elements.onlineYouName.textContent = waitingRoomState.yourName || t("online.you");
  elements.onlineYouState.textContent = waitingRoomState.youReady ? t("common.ready") : t("common.notReady");
  elements.onlineYouState.classList.toggle("ready", Boolean(waitingRoomState.youReady));

  elements.onlinePlayerOpp.classList.toggle("waiting", !waitingRoomState.opponentJoined);
  if (waitingRoomState.opponentJoined) {
    renderAvatarChip(elements.onlineOppAvatar, (yourId && avatars[oppId]) || null);
    elements.onlineOppName.textContent = waitingRoomState.opponentName || t("online.opponent");
    elements.onlineOppState.textContent = waitingRoomState.opponentConnected
      ? (waitingRoomState.opponentReady ? t("common.ready") : t("common.notReady"))
      : t("online.offline");
    elements.onlineOppState.classList.toggle("ready", Boolean(waitingRoomState.opponentReady && waitingRoomState.opponentConnected));
  } else {
    renderAvatarChip(elements.onlineOppAvatar, null);
    elements.onlineOppName.textContent = t("online.waitingForOpponent");
    elements.onlineOppState.textContent = "";
    elements.onlineOppState.classList.remove("ready");
  }

  elements.onlineReadyBtn.hidden = !waitingRoomState.opponentJoined;
  elements.onlineReadyBtn.disabled = !waitingRoomState.opponentJoined;
  elements.onlineReadyBtn.textContent = waitingRoomState.youReady ? t("online.cancelReady") : t("online.setReady");

  if (waitingRoomState.started) {
    elements.waitingSummary.textContent = t("online.matchStarted");
    return;
  }
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
}

function createWaitingRoomState() {
  return {
    mode: "none",
    queued: false,
    queuePosition: 0,
    playerNames: null,
    playerAvatars: null,
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
    connecting: false,
  };
}

// Applies an authoritative online state snapshot. Extracted from the `state`
// listener so the deferred shop snapshot can be applied later, on demand, when
// the player taps "enter shop".
function applyOnlineStateSnapshot(snapshot) {
  // Any non-shop authoritative state closes the per-round shop-entry gate, so
  // the next round-end requires a fresh "enter shop" click again.
  if (snapshot.state?.phase !== "shop") {
    hasEnteredShop = false;
    pendingShopSnapshot = null;
  }
  state = restoreState(snapshot.state);
  currentLocalMode = MODE_ONLINE;
  onlineChatMessages = Array.isArray(snapshot.chat) ? snapshot.chat.slice(-100) : [];
  waitingRoomState = {
    ...waitingRoomState,
    playerNames: snapshot.playerNames || waitingRoomState.playerNames,
    playerAvatars: snapshot.playerAvatars || waitingRoomState.playerAvatars,
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
}

// The player chose to leave the finished board and join the shop the opponent
// already opened. Apply the deferred snapshot now (bypassing the seq guard is
// fine — we always stash the latest).
function enterPendingShop() {
  if (!pendingShopSnapshot) {
    return;
  }
  const snapshot = pendingShopSnapshot;
  pendingShopSnapshot = null;
  hasEnteredShop = true;
  applyOnlineStateSnapshot(snapshot);
}

// Shared entry point for both the join-code button and the invite-link "Join
// room" button: validate identity + code, then actually connect. Until the
// server's first waiting_snapshot lands, the room step shows a connecting
// spinner (see renderOnlineRoomStep) rather than a misleading invite screen.
async function joinRoomByCode(rawCode) {
  const pseudo = getValidatedOnlinePseudo();
  if (!pseudo) {
    return;
  }
  const code = String(rawCode || "").trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    showToast(t("online.invalidCode"));
    elements.onlineJoinCode.focus();
    return;
  }

  online.setDisplayName(pseudo);
  online.leaveRoom();
  activeRoomCode = code;
  pendingInviteCode = null;
  waitingRoomState = {
    ...createWaitingRoomState(),
    mode: "friend",
    connecting: true,
  };
  updateOnlineRoomUI(activeRoomCode);
  const ok = await online.joinRoom(code, { displayName: pseudo });
  if (!ok) {
    waitingRoomState = createWaitingRoomState();
    activeRoomCode = null;
    updateOnlineRoomUI("-");
  }
}

// Invite-link entry: show the invite banner and swap the normal Quick/Friend
// actions for a single prominent "Join room" button, so the invitee's obvious
// next step is to pick a name/avatar and join the room they were invited to.
function renderInviteBanner() {
  const hasInvite = Boolean(pendingInviteCode);
  elements.onlineInviteBanner.hidden = !hasInvite;
  elements.onlineInviteActions.hidden = !hasInvite;
  elements.onlineNormalActions.hidden = hasInvite;
  elements.onlineJoinRow.hidden = hasInvite;
  if (hasInvite) {
    elements.onlineInviteCode.textContent = pendingInviteCode;
  }
}

// --- Lobby avatars, wake banner, toast and quick-chat helpers --------------

function renderAvatarChip(el, avatar) {
  if (!el) {
    return;
  }
  el.innerHTML = "";
  if (avatar && avatar.glyph && avatar.color) {
    el.dataset.color = avatar.color;
    const img = document.createElement("img");
    img.src = `./assets/runes/${avatar.glyph}.svg`;
    img.alt = "";
    el.appendChild(img);
  } else {
    delete el.dataset.color;
    el.textContent = "?";
  }
}

function renderOnlineIdentity() {
  renderAvatarChip(elements.onlineAvatarBtn, online.getAvatar());
}

function buildAvatarPicker() {
  elements.onlineAvatarGlyphs.innerHTML = "";
  AVATAR_GLYPHS.forEach((glyph) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "online-avatar-option";
    button.dataset.glyph = glyph;
    const img = document.createElement("img");
    img.src = `./assets/runes/${glyph}.svg`;
    img.alt = glyph;
    button.appendChild(img);
    button.addEventListener("click", () => {
      online.setAvatar({ ...online.getAvatar(), glyph });
      renderOnlineIdentity();
      refreshAvatarPickerSelection();
    });
    elements.onlineAvatarGlyphs.appendChild(button);
  });

  elements.onlineAvatarColors.innerHTML = "";
  AVATAR_COLORS.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "online-avatar-swatch";
    button.dataset.color = color;
    button.setAttribute("aria-label", color);
    button.addEventListener("click", () => {
      online.setAvatar({ ...online.getAvatar(), color });
      renderOnlineIdentity();
      refreshAvatarPickerSelection();
    });
    elements.onlineAvatarColors.appendChild(button);
  });
}

function refreshAvatarPickerSelection() {
  const avatar = online.getAvatar();
  elements.onlineAvatarGlyphs.querySelectorAll(".online-avatar-option").forEach((button) => {
    button.classList.toggle("selected", button.dataset.glyph === avatar.glyph);
  });
  elements.onlineAvatarColors.querySelectorAll(".online-avatar-swatch").forEach((button) => {
    button.classList.toggle("selected", button.dataset.color === avatar.color);
  });
}

// Non-blocking replacement for the old window.alert() on online errors.
function showToast(message) {
  if (!message || !elements.appToast) {
    return;
  }
  window.clearTimeout(toastShowTimer);
  window.clearTimeout(toastHideTimer);
  elements.appToast.textContent = message;
  elements.appToast.hidden = false;
  // Force a restyle so re-showing the same toast replays the transition.
  elements.appToast.classList.remove("visible");
  void elements.appToast.offsetWidth;
  elements.appToast.classList.add("visible");
  toastShowTimer = window.setTimeout(() => {
    elements.appToast.classList.remove("visible");
    toastHideTimer = window.setTimeout(() => {
      elements.appToast.hidden = true;
    }, 350);
  }, 4200);
}

function resolveOnlineErrorMessage(info) {
  if (!info) {
    return "";
  }
  if (typeof info === "string") {
    return info;
  }
  // Engine rejections carry a structured reasonKey (err.*); resolve it in the
  // local language before falling back to transport codes, then raw English.
  if (info.reasonKey) {
    const translated = t(info.reasonKey, resolveErrorParams(info.reasonParams));
    if (translated !== info.reasonKey) {
      return translated;
    }
  }
  const key = info.code ? ONLINE_ERROR_KEY_BY_CODE[info.code] : null;
  if (key) {
    return t(key);
  }
  return String(info.message || "");
}

// Engine mutators return { error, errorKey, errorParams }: prefer the key so
// local play surfaces localized messages, with the raw English string as the
// fallback for keys this build doesn't know.
function formatEngineError(result) {
  if (result?.errorKey) {
    const translated = t(result.errorKey, resolveErrorParams(result.errorParams));
    if (translated !== result.errorKey) {
      return translated;
    }
  }
  return String(result?.error || "");
}

function resolveErrorParams(params) {
  if (!params || typeof params !== "object") {
    return {};
  }
  const resolved = { ...params };
  if (resolved.player === 1 || resolved.player === 2) {
    resolved.player = getDisplayPlayerName(resolved.player);
  }
  return resolved;
}

function formatQueueStatus(snapshot) {
  if (!snapshot || !snapshot.code) {
    return String(snapshot?.message || "");
  }
  if (snapshot.code === "queue_searching") {
    return t("online.searching");
  }
  if (snapshot.code === "queue_position") {
    return t("online.searchingQueue", { n: snapshot.position || 1 });
  }
  if (snapshot.code === "queue_cancelled") {
    return t("online.queueCancelled");
  }
  return "";
}

function updateWakeBanner(info) {
  if (!elements.onlineWakeBanner) {
    return;
  }
  const waking = Boolean(info?.waking);
  elements.onlineWakeBanner.hidden = !waking;
  if (waking) {
    elements.onlineWakeText.textContent = info.attempt > 1
      ? t("online.wakeRetry", { n: info.attempt })
      : t("online.wakeBanner");
  }
}

function buildQuickChatBar() {
  elements.quickChatBar.innerHTML = "";
  QUICK_CHAT_KEYS.forEach((key) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "qc-btn";
    button.dataset.qcKey = key;
    button.textContent = QC_EMOJI[key] || "\u{1F4AC}";
    button.addEventListener("click", () => {
      if (!online.isOnlineActive()) {
        return;
      }
      const sent = online.sendQuickChat(key);
      if (sent) {
        elements.quickChatBar.classList.add("cooldown");
        window.clearTimeout(quickChatCooldownTimer);
        quickChatCooldownTimer = window.setTimeout(() => {
          elements.quickChatBar.classList.remove("cooldown");
        }, 1200);
      }
    });
    elements.quickChatBar.appendChild(button);
  });
  refreshQuickChatBar();
}

// Tooltips/aria carry the localized text; re-resolved on language change.
function refreshQuickChatBar() {
  elements.quickChatBar.querySelectorAll(".qc-btn").forEach((button) => {
    const label = t(button.dataset.qcKey);
    button.title = label;
    button.setAttribute("aria-label", label);
  });
}

function formatQuickChatText(entry) {
  return `${QC_EMOJI[entry.key] || "\u{1F4AC}"} ${t(entry.key)}`;
}

function spawnQuickBubble(entry) {
  if (elements.gameScreen.hidden || !elements.qcBubbles) {
    return;
  }
  const bubble = document.createElement("div");
  bubble.className = "qc-bubble";
  bubble.dataset.side = entry.playerId === waitingRoomState.playerId ? "you" : "opp";
  bubble.textContent = formatQuickChatText(entry);
  elements.qcBubbles.appendChild(bubble);
  window.setTimeout(() => {
    bubble.classList.add("out");
  }, 2600);
  window.setTimeout(() => {
    bubble.remove();
  }, 3100);
}

function updateInGameAvatars() {
  const avatars = online.isOnlineActive() ? waitingRoomState.playerAvatars : null;
  [[1, elements.p1Avatar], [2, elements.p2Avatar]].forEach(([playerId, el]) => {
    if (!el) {
      return;
    }
    const avatar = avatars?.[playerId];
    el.hidden = !avatar;
    if (avatar) {
      renderAvatarChip(el, avatar);
    }
  });
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
    elements.onlinePresenceText.textContent = onlinePresenceCount === 1
      ? t("online.presenceOne")
      : t("online.presence", { n: onlinePresenceCount });
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
    showToast(t("online.enterName"));
    elements.onlinePseudo.focus();
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
  updateInGameAvatars();
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

  saveModeSave(MODE_AI, {
    state,
    ai: { playerId: aiConfig.playerId, depth: aiConfig.depth },
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

// Is there an online game worth rejoining? Used to decide whether opening the
// online panel should reconnect on its own.
function getResumableOnlineRoomCode() {
  const savedOnline = loadModeSave(MODE_ONLINE);
  const roomCode = String(savedOnline?.roomCode || "").toUpperCase();
  if (!isResumableSave(savedOnline?.state) || !/^[A-Z2-9]{6}$/.test(roomCode)) {
    return null;
  }
  return roomCode;
}

function resumeOnlineSave() {
  const savedOnline = loadModeSave(MODE_ONLINE);
  resumeOnlineRoom(String(savedOnline?.roomCode || "").toUpperCase());
}

// Shared by the local save card and the server-driven "games in progress"
// list: both just need to reconnect to a room code.
function resumeOnlineRoom(rawRoomCode) {
  const roomCode = String(rawRoomCode || "").toUpperCase();
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
  // Runes whose effect is spatial get the same mini-board the Rules screen uses.
  elements.runeDetailFigure.hidden = !renderRuneFigure(elements.runeDetailFigure, runeId);
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

// Push is opt-in and gesture-gated: the permission prompt only ever fires from
// the toggle itself, which iOS requires and which keeps the first visit quiet.
async function initializePush() {
  if (!elements.pushToggle || !elements.pushLabel) {
    return;
  }

  if (!isPushSupported()) {
    elements.pushToggle.hidden = true;
    elements.pushLabel.hidden = true;
    return;
  }

  elements.pushToggle.hidden = false;
  elements.pushLabel.hidden = false;

  if (needsInstallForPush() && elements.pushHint) {
    elements.pushHint.textContent = t("settings.pushIosHint");
    elements.pushHint.hidden = false;
  }

  const state = await getPushState();
  elements.pushToggle.checked = state.enabled;

  elements.pushToggle.addEventListener("change", async () => {
    if (!elements.pushToggle.checked) {
      await disablePush();
      return;
    }

    const result = await enablePush(getLang(), {
      name: online.getSession().displayName || null,
      avatar: online.getAvatar() || null,
    });
    if (result.ok) {
      showToast(t("settings.pushEnabled"));
      return;
    }

    // Never leave the toggle claiming something that isn't true.
    elements.pushToggle.checked = false;
    if (result.reason === "denied") {
      showToast(t("settings.pushDenied"));
    } else {
      showToast(t("settings.pushError"));
    }
  });
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

function initializeMusic() {
  const savedMusic = localStorage.getItem(MUSIC_STORAGE_KEY);
  const enabled = savedMusic !== "off";
  const rawVolume = localStorage.getItem(MUSIC_VOLUME_STORAGE_KEY);
  const parsedVolume = rawVolume === null ? NaN : Number(rawVolume);
  const initialVolume = Number.isFinite(parsedVolume)
    ? Math.max(0, Math.min(1, parsedVolume))
    : DEFAULT_MUSIC_VOLUME;

  applyMusicSetting(enabled);
  applyMusicVolumeSetting(initialVolume);
}

function applyMusicSetting(enabled) {
  music.setEnabled(Boolean(enabled));
  elements.musicToggle.checked = Boolean(enabled);
}

function saveMusicPreference(enabled) {
  localStorage.setItem(MUSIC_STORAGE_KEY, enabled ? "on" : "off");
}

function applyMusicVolumeSetting(volume) {
  const safe = Math.max(0, Math.min(1, Number(volume)));
  music.setVolume(safe);
  elements.musicVolume.value = String(Math.round(safe * 100));
}

function saveMusicVolumePreference(volume) {
  const safe = Math.max(0, Math.min(1, Number(volume)));
  localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, String(safe));
}

function initializeSound() {
  const savedSound = localStorage.getItem(SOUND_STORAGE_KEY);
  const enabled = savedSound !== "off";
  // getItem() returns null when unset and Number(null) is 0, which would
  // silently zero the volume for first-time visitors — parse only real values.
  const rawVolume = localStorage.getItem(SOUND_VOLUME_STORAGE_KEY);
  const parsedVolume = rawVolume === null ? NaN : Number(rawVolume);
  const initialVolume = Number.isFinite(parsedVolume)
    ? Math.max(0, Math.min(1, parsedVolume))
    : DEFAULT_SFX_VOLUME;

  applySoundSetting(enabled);
  applySoundVolumeSetting(initialVolume);
}

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  // Keep <html> in step: the inlined splash styles key off it, and it is what
  // the pre-paint script in index.html sets on a cold load.
  document.documentElement.setAttribute("data-theme", theme);
}

// Called once the first render has painted, so players never see the bare
// page between the HTML arriving and the app being interactive.
function dismissSplash() {
  const splash = document.getElementById("app-splash");
  if (!splash || splash.hidden) {
    return;
  }
  splash.style.opacity = "0";
  window.setTimeout(() => {
    splash.hidden = true;
  }, 420);
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
    music.maybeStart({ fromGesture: true });
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("touchend", unlock, { passive: true });
  window.addEventListener("keydown", unlock);

  // Silence the music while the tab is in the background; resume on return
  // only if the context is already running (never resumes outside a gesture).
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      music.stop();
    } else {
      music.maybeStart();
    }
  });
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

// Give the recurring shop gestures their own voice instead of the generic
// click. These are LOCAL button presses, so they only ever sound for the
// player who actually clicked — never the opponent.
function resolveClickSound(button) {
  if (button.id === "shop-remove-btn") {
    return "shop-remove";
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
  const logHeadText = typeof log[0] === "string" ? log[0] : null;

  return {
    phase: currentState.phase,
    winner: currentState.winner,
    gameWinner: currentState.gameWinner,
    boardSignature,
    logLength: log.length,
    logKeysHead,
    logHeadText,
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

// The shop combine log is a raw English string that begins with the acting
// player's side name (engine playerName(): "Black" for seat 1, "White" for
// seat 2). Lets us tell our own combine from the opponent's for sound gating.
function isLocalPlayerLogEntry(logText) {
  if (typeof logText !== "string") {
    return false;
  }
  const localSide = waitingRoomState.playerId === 2 ? "White" : "Black";
  return logText.startsWith(`${localSide} `);
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

  // Shop combine has no dedicated button sound (it resolves from a rune pick),
  // so it's cued here from the freshly pushed " combined " log entry. Online,
  // only play OUR OWN combine — the opponent shops on another client, and their
  // add/remove already make no sound here (those are local button clicks), so
  // gating combine keeps the shop free of the opponent's noise. Offline it's a
  // single device, so always play.
  if (
    currentSnapshot.phase === "shop"
    && newLogCount > 0
    && currentSnapshot.logHeadText
    && currentSnapshot.logHeadText.includes(" combined ")
    && (!online.isOnlineActive() || isLocalPlayerLogEntry(currentSnapshot.logHeadText))
  ) {
    sfx.play("shop-combine");
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
// Effect ghosts used to be re-derived from the board diff on every render, so
// they behaved badly in two opposite ways: a render during the fade rebuilt the
// element and restarted it at full opacity, and a render after the diff had
// moved on removed it mid-fade, making it pop. They are now owned here — once a
// ghost appears it lives for exactly its fade, whatever the render cadence.
const GHOST_FADE_MS = 380;
const GHOST_LIFT_MS = 240;

function applyGhostTiming(animationFrame) {
  const now = Date.now();

  if (!animationFrame.enabled && ghostStartedAt.size === 0) {
    return;
  }

  // Adopt ghosts the diff just produced, keeping the original start time for
  // any that were already on screen.
  const incoming = [
    ["fade", animationFrame.ansuzGhostByCell],
    ["fade", animationFrame.geboGhostByCell],
    ["lift", animationFrame.teiwazLiftGhostByCell],
  ];
  for (const [kind, map] of incoming) {
    if (!map) {
      continue;
    }
    for (const [key, rune] of map) {
      if (!ghostStartedAt.has(key)) {
        ghostStartedAt.set(key, { kind, rune, startedAt: now });
      }
    }
  }

  // Rebuild the frame's maps from what is actually still fading, so a ghost
  // survives renders whose diff no longer mentions it.
  const fadeGhosts = new Map();
  const liftGhosts = new Map();
  const elapsedByCell = new Map();

  for (const [key, entry] of [...ghostStartedAt]) {
    const elapsed = now - entry.startedAt;
    const duration = entry.kind === "lift" ? GHOST_LIFT_MS : GHOST_FADE_MS;
    if (elapsed >= duration) {
      ghostStartedAt.delete(key);
      continue;
    }
    elapsedByCell.set(key, elapsed);
    (entry.kind === "lift" ? liftGhosts : fadeGhosts).set(key, entry.rune);
  }

  animationFrame.ansuzGhostByCell = new Map();
  animationFrame.geboGhostByCell = fadeGhosts;
  animationFrame.teiwazLiftGhostByCell = liftGhosts;
  animationFrame.ghostElapsedByCell = elapsedByCell;

  // Ghosts render on their own; keep the frame alive for them even when the
  // diff itself found nothing else to animate.
  if (fadeGhosts.size > 0 || liftGhosts.size > 0) {
    animationFrame.enabled = true;
  }
}

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

  // Fire just after the fade ends so the node leaves the DOM the moment it
  // becomes invisible, instead of lingering until the next interaction.
  ghostCleanupTimer = window.setTimeout(() => {
    ghostCleanupTimer = null;
    ghostStartedAt.clear();
    // Drop the nodes outright rather than trusting the follow-up render: if
    // the player left the game screen meanwhile, render() bails out early and
    // would strand them in the DOM until the next board rebuild.
    elements.boardEl
      .querySelectorAll(".effect-fade-ghost, .effect-lift-ghost")
      .forEach((node) => node.remove());
    render();
  }, GHOST_FADE_MS + 60);
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
