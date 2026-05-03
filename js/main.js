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
import { clearSave, loadGame, saveGame } from "./persistence/localStore.js";
import { createOnlineController } from "./online/onlineController.js";
import { getRuneById } from "./runes/runeCatalog.js";

const THEME_STORAGE_KEY = "runebags-theme-v1";
const ANIMATION_STORAGE_KEY = "runebags-animations-v1";
const ONLINE_NAME_MAX = 14;

const elements = {
  mainMenu: document.getElementById("main-menu"),
  menuAiBtn: document.getElementById("menu-ai-btn"),
  menuPassplayBtn: document.getElementById("menu-passplay-btn"),
  aiSideSelect: document.getElementById("ai-side-select"),
  aiDepthSelect: document.getElementById("ai-depth-select"),
  aiPanel: document.getElementById("ai-panel"),
  aiStartBtn: document.getElementById("ai-start-btn"),
  aiBackBtn: document.getElementById("ai-back-btn"),
  menuOnlineBtn: document.getElementById("menu-online-btn"),
  menuRulesBtn: document.getElementById("menu-rules-btn"),
  menuSettingsBtn: document.getElementById("menu-settings-btn"),
  settingsPanel: document.getElementById("settings-panel"),
  themeSelect: document.getElementById("theme-select"),
  animationToggle: document.getElementById("animation-toggle"),
  settingsBackBtn: document.getElementById("settings-back-btn"),
  onlinePanel: document.getElementById("online-panel"),
  onlineServerDot: document.getElementById("online-server-dot"),
  onlineServerText: document.getElementById("online-server-text"),
  onlineRoomCode: document.getElementById("online-room-code"),
  onlineRoomLinkWrap: document.getElementById("online-room-link-wrap"),
  onlineRoomLink: document.getElementById("online-room-link"),
  onlineRoomQr: document.getElementById("online-room-qr"),
  waitingRole: document.getElementById("waiting-role"),
  waitingSummary: document.getElementById("waiting-summary"),
  waitingYouStatus: document.getElementById("waiting-you-status"),
  waitingOpponentStatus: document.getElementById("waiting-opponent-status"),
  onlineQuickBtn: document.getElementById("online-quick-btn"),
  onlineFriendBtn: document.getElementById("online-friend-btn"),
  onlinePseudo: document.getElementById("online-pseudo"),
  onlineJoinCode: document.getElementById("online-join-code"),
  onlineJoinBtn: document.getElementById("online-join-btn"),
  onlineCopyLinkBtn: document.getElementById("online-copy-link-btn"),
  onlineReadyBtn: document.getElementById("online-ready-btn"),
  onlineStartBtn: document.getElementById("online-start-btn"),
  onlineBackBtn: document.getElementById("online-back-btn"),
  rulesPanel: document.getElementById("rules-panel"),
  rulesBackBtn: document.getElementById("rules-back-btn"),
  gameScreen: document.getElementById("game-screen"),
  status: document.getElementById("game-status"),
  turnPill: document.getElementById("turn-pill"),
  boardEl: document.getElementById("board"),
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
  turnLog: document.getElementById("turn-log"),
  shopPanel: document.getElementById("shop-panel"),
  shopPlayerTitle: document.getElementById("shop-player-title"),
  shopModeLabel: document.getElementById("shop-mode-label"),
  shopOffer: document.getElementById("shop-offer"),
  shopBag: document.getElementById("shop-bag"),
  shopInstruction: document.getElementById("shop-instruction"),
  shopSwitchPlayer: document.getElementById("shop-switch-player"),
  shopRemoveBtn: document.getElementById("shop-remove-btn"),
  shopCombineBtn: document.getElementById("shop-combine-btn"),
  shopCancelBtn: document.getElementById("shop-cancel-btn"),
};

let state = restoreState(loadGame() || createInitialState());
let handVisibility = {
  1: state.currentPlayer === 1,
  2: state.currentPlayer === 2,
};
let activeRoomCode = null;
let waitingRoomState = createWaitingRoomState();
const aiConfig = createAiConfig();
const online = createOnlineController();
let aiBusy = false;
let aiTimer = null;
let animationsEnabled = true;
let previousBoardSnapshot = null;

wireOnlineEvents();
bindEvents();
initializeTheme();
initializeAnimations();
render();
initializeEntryMode();
window.setInterval(tickOnlineShopTimer, 1000);

function wireOnlineEvents() {
  online.setListeners({
    waiting: (snapshot) => {
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
        shopDeadlineAt: null,
        shopSecondsRemaining: 0,
      };

      applyOnlinePlayerNames();
      updateOnlineRoomUI(activeRoomCode);
      if (!elements.onlinePanel.hidden) {
        setStatus(`Room ${activeRoomCode}: ${getDisplayPlayerName(snapshot.playerId)} connected.`);
      }
      updateOnlineConnectionStatus();
    },
    state: (snapshot) => {
      state = restoreState(snapshot.state);
      waitingRoomState = {
        ...waitingRoomState,
        playerNames: snapshot.playerNames || waitingRoomState.playerNames,
        shopReadyYou: Boolean(snapshot.shopSync?.youReady),
        shopReadyOpponent: Boolean(snapshot.shopSync?.opponentReady),
        shopDeadlineAt: snapshot.shopSync?.deadlineAt || null,
        shopSecondsRemaining: Number(snapshot.shopSync?.secondsRemaining || 0),
      };
      applyOnlinePlayerNames();
      if (elements.gameScreen.hidden) {
        enterGameScreen("online", snapshot.roomCode);
      }
      updateOnlineConnectionStatus();
      render();
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
  elements.menuAiBtn.addEventListener("click", () => {
    showAiPanel();
  });

  elements.menuPassplayBtn.addEventListener("click", () => {
    if (online.isOnlineActive()) {
      online.leaveRoom();
    }
    setAiSettings(aiConfig, false, aiConfig.playerId, aiConfig.depth);
    enterGameScreen("passplay");
  });

  elements.aiStartBtn.addEventListener("click", () => {
    if (online.isOnlineActive()) {
      online.leaveRoom();
    }

    state = createInitialState();
    const aiSide = Number(elements.aiSideSelect.value);
    const aiDepth = Number(elements.aiDepthSelect.value);
    setAiSettings(aiConfig, true, aiSide, aiDepth);
    if (state.phase === "shop" && state.shop.currentPlayer !== aiConfig.playerId) {
      switchShopPlayer(state);
    }
    handVisibility = { 1: aiSide !== 1, 2: aiSide !== 2 };
    setStatus(`AI mode started. ${getPlayerName(aiConfig.playerId)} is AI (depth ${aiConfig.depth}).`);

    clearSave();
    saveGame(state);
    enterGameScreen("passplay");
    render();
  });

  elements.aiBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.menuOnlineBtn.addEventListener("click", async () => {
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
      activeRoomCode = null;
      waitingRoomState = createWaitingRoomState();
      updateOnlineRoomUI("-");
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
    const ok = await online.joinRoom(code, { allowReconnect: false, displayName: pseudo });
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

  elements.onlineBackBtn.addEventListener("click", () => {
    online.leaveRoom();
    online.clearRoomToken(activeRoomCode || online.getSession().roomCode);
    activeRoomCode = null;
    waitingRoomState = createWaitingRoomState();
    showMainMenu();
  });

  elements.rulesBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.onlineCopyLinkBtn.addEventListener("click", async () => {
    const link = activeRoomCode && activeRoomCode !== "-" ? buildRoomLink(activeRoomCode) : "";
    if (!link) {
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      window.alert("Room link copied.");
    } catch {
      window.alert("Could not copy automatically. Copy the link manually.");
    }
  });

  elements.onlineStartBtn.addEventListener("click", () => {
    if (!waitingRoomState.canStart) {
      window.alert("Both players must be ready to start.");
      return;
    }

    online.startMatch();
  });

  elements.onlineReadyBtn.addEventListener("click", () => {
    online.setReady(!waitingRoomState.youReady);
  });

  elements.menuBtn.addEventListener("click", () => {
    cancelAiTimer();
    showMainMenu();
    if (!online.isOnlineActive()) {
      clearRoomQuery();
    }
  });

  elements.boardEl.addEventListener("click", (event) => {
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
      : playTurn(state, column);

    state = result.state;
    if (result.error) {
      setStatus(result.error);
    }

    persistState();
    render();
    scheduleAiTurnIfNeeded();
  });

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
      const roomToLeave = activeRoomCode || online.getSession().roomCode;
      online.leaveRoom();
      online.clearRoomToken(roomToLeave);
      activeRoomCode = null;
      waitingRoomState = createWaitingRoomState();
      clearRoomQuery();
      showMainMenu();
      return;
    }

    state = createInitialState();
    if (aiConfig.enabled && state.phase === "shop" && state.shop.currentPlayer !== aiConfig.playerId) {
      switchShopPlayer(state);
    }
    handVisibility = { 1: false, 2: true };
    clearSave();
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

  elements.shopCancelBtn.addEventListener("click", () => {
    if (online.isOnlineActive()) {
      online.sendAction("shop_set_mode", { mode: null });
      return;
    }

    if (isCurrentLocalShopPlayerReady()) {
      setStatus("This player is marked ready. Click Cancel Ready to continue shopping.");
      return;
    }

    const result = setShopMode(state, null);
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

function render() {
  if (elements.gameScreen.hidden) {
    return;
  }

  const forcedVisible = getForcedVisiblePlayers(state);
  const pendingTargets = getPendingBoardTargets(state);
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

  if (online.isOnlineActive()) {
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

  const animationFrame = buildBoardAnimationFrame(state, animationsEnabled, previousBoardSnapshot);
  renderBoard(state, elements, pendingTargets, winningLine, forcedColumns, animationFrame);
  previousBoardSnapshot = snapshotBoard(state.boardRunes);
  renderHands(state, elements, handVisibility, forcedVisible);
  applyOnlinePlayerNames();

  renderLog(state, elements);
  renderShopPanel();
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
  elements.boardEl.hidden = false;
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
    const timerText = waitingRoomState.shopSecondsRemaining > 0
      ? ` Timer: ${waitingRoomState.shopSecondsRemaining}s.`
      : "";
    elements.shopInstruction.textContent = waitingRoomState.shopReadyYou
      ? `You are ready. Waiting for opponent.${timerText}`
      : `Shop your own bag and offer, then click Shop Ready.${timerText}`;
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
  elements.shopModeLabel.textContent = `Mode: ${data.mode || "none"} | Added: ${data.addedCount}/2 | Remove used: ${data.removeUsed ? "yes" : "no"} | Ready: ${playerReady ? "yes" : "no"}`;

  renderRuneList(elements.shopOffer, data.offer, playerId, highlights.offerHighlightIds);
  renderRuneList(elements.shopBag, state.players[playerId].bag, playerId, highlights.bagHighlightIds);

  elements.shopRemoveBtn.hidden = !actions.removeVisible;
  elements.shopCombineBtn.hidden = !actions.combineVisible;
  elements.shopRemoveBtn.disabled = playerReady && isPassPlayMode();
  elements.shopCombineBtn.disabled = playerReady && isPassPlayMode();
  elements.shopCancelBtn.disabled = playerReady && isPassPlayMode();

  if (previousShopPlayer !== playerId) {
    state.shop.currentPlayer = previousShopPlayer;
  }
}

function renderRuneList(container, runes, playerId, highlightIds) {
  container.innerHTML = "";
  const highlightSet = new Set(highlightIds || []);

  runes.forEach((rune) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "rune-card";
    card.dataset.runeInstanceId = rune.instanceId;
    card.classList.add(playerId === 1 ? "player-1" : "player-2");

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
    if (rune.id === "neutral") {
      icon.classList.add("neutral");
    } else {
      icon.classList.add(playerId === 1 ? "black" : "white");
    }

    if (rune.icon) {
      const symbol = document.createElement("img");
      symbol.src = rune.icon;
      symbol.alt = rune.name;
      symbol.className = "rune-chip-symbol";
      icon.appendChild(symbol);
    } else {
      const dot = document.createElement("span");
      dot.className = "rune-chip-dot";
      dot.textContent = "•";
      icon.appendChild(dot);
    }

    const textWrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = rune.name;

    const subtitle = document.createElement("small");
    subtitle.textContent = `L${rune.level} - ${rune.description}`;

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

function updateMeta() {
  elements.p1Points.textContent = `${getDisplayPlayerName(1)} points: ${state.players[1].points}`;
  elements.p2Points.textContent = `${getDisplayPlayerName(2)} points: ${state.players[2].points}`;
  elements.p1Bag.textContent = `Bag: ${state.players[1].bag.length}`;
  elements.p1Discard.textContent = `Discard: ${state.players[1].discard.length}`;
  elements.p2Bag.textContent = `Bag: ${state.players[2].bag.length}`;
  elements.p2Discard.textContent = `Discard: ${state.players[2].discard.length}`;
  elements.pointPool.textContent = `Point Supply: ${state.pointPoolRemaining}`;
  elements.neutralSupply.textContent = `Neutral Supply: ${state.neutralSupply}`;
  const visibleAway = state.roundAwayRunes.filter((entry) => entry.owner === 1 || entry.owner === 2);
  elements.roundDiscards.textContent = visibleAway.length > 0 ? `Away this round: ${visibleAway.length}` : "Away this round: none";
  renderRoundAwayRunes(visibleAway);
}

function renderRoundAwayRunes(entries) {
  elements.roundAwayList.innerHTML = "";

  entries.forEach((entry) => {
    const rune = getRuneById(entry.runeId);
    if (!rune) {
      return;
    }

    const card = document.createElement("div");
    card.className = "rune-card away-rune";
    card.classList.add(entry.owner === 1 ? "player-1" : "player-2");

    const icon = document.createElement("div");
    icon.className = "rune-chip";
    icon.classList.add(entry.owner === 1 ? "black" : "white");

    if (rune.icon) {
      const symbol = document.createElement("img");
      symbol.src = rune.icon;
      symbol.alt = rune.name;
      symbol.className = "rune-chip-symbol";
      icon.appendChild(symbol);
    } else {
      const dot = document.createElement("span");
      dot.className = "rune-chip-dot";
      dot.textContent = "•";
      icon.appendChild(dot);
    }

    const textWrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${rune.name} L${entry.level}`;
    const subtitle = document.createElement("small");
    subtitle.textContent = `Away (${entry.source})`;

    textWrap.appendChild(title);
    textWrap.appendChild(subtitle);
    card.appendChild(icon);
    card.appendChild(textWrap);
    elements.roundAwayList.appendChild(card);
  });
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
}

function showOnlinePanel() {
  elements.mainMenu.hidden = true;
  elements.aiPanel.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.onlinePanel.hidden = false;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  elements.onlinePseudo.value = normalizePseudo(elements.onlinePseudo.value || online.getSession().displayName || "");
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
  const hasRoomCode = isFriendMode && typeof roomCode === "string" && /^[A-Z2-9]{6}$/.test(roomCode);
  const roomLink = hasRoomCode ? buildRoomLink(roomCode) : "";

  elements.onlineRoomCode.textContent = isFriendMode ? `Room: ${roomCode}` : "Room: Auto-match";
  if (elements.onlineRoomLinkWrap) {
    elements.onlineRoomLinkWrap.hidden = !hasRoomCode;
  }
  if (elements.onlineRoomLink) {
    elements.onlineRoomLink.value = roomLink;
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
  elements.waitingRole.textContent = waitingRoomState.playerId
    ? `You are: ${waitingRoomState.yourName || getDisplayPlayerName(waitingRoomState.playerId)}`
    : "You are: -";

  elements.onlineReadyBtn.hidden = !isFriendMode;
  elements.onlineStartBtn.hidden = !isFriendMode;
  elements.onlineCopyLinkBtn.hidden = !isFriendMode;
  elements.onlineReadyBtn.disabled = !isFriendMode;
  elements.onlineStartBtn.disabled = !isFriendMode || !waitingRoomState.canStart;

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
      : "Click Quick Play to enter matchmaking.";
    return;
  }

  if (isFriendMode) {
    elements.waitingSummary.textContent = waitingRoomState.youReady
      ? "You are ready. Start when your opponent is ready."
      : "Share your link, then set Ready.";
    return;
  }

  elements.waitingSummary.textContent = "Choose Quick Play or create/join a friend room.";
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
    shopDeadlineAt: null,
    shopSecondsRemaining: 0,
  };
}

function tickOnlineShopTimer() {
  if (!online.isOnlineActive() || state.phase !== "shop" || !waitingRoomState.shopDeadlineAt) {
    return;
  }

  const seconds = Math.max(0, Math.ceil((waitingRoomState.shopDeadlineAt - Date.now()) / 1000));
  if (seconds === waitingRoomState.shopSecondsRemaining) {
    return;
  }

  waitingRoomState.shopSecondsRemaining = seconds;
  if (!elements.gameScreen.hidden) {
    updateTopStatus();
  }
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
  if (!online.isOnlineActive()) {
    saveGame(state);
  }
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
    previousBoardSnapshot = snapshotBoard(state.boardRunes);
  }
}

function saveAnimationsPreference(enabled) {
  localStorage.setItem(ANIMATION_STORAGE_KEY, enabled ? "on" : "off");
}

function snapshotBoard(boardRunes) {
  return boardRunes.map((row) => row.map((rune) => {
    if (!rune) {
      return null;
    }
    return {
      instanceId: rune.instanceId || null,
      id: rune.id,
    };
  }));
}

function buildBoardAnimationFrame(currentState, enabled, previousSnapshot) {
  const none = {
    enabled: false,
    placed: new Set(),
    movedTo: new Set(),
    removedFrom: new Set(),
    effectPulse: new Set(),
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
  const movedTo = new Set();
  const removedFrom = new Set();
  const effectPulse = new Set();

  currCells.forEach((rune, key) => {
    const instanceId = rune.instanceId || null;
    if (!instanceId) {
      if (!prevCells.has(key)) {
        placed.add(key);
      }
      if (rune.id !== "basic" && rune.id !== "neutral") {
        effectPulse.add(key);
      }
      return;
    }

    const previousCell = prevByInstance.get(instanceId);
    if (!previousCell) {
      placed.add(key);
      if (rune.id !== "basic" && rune.id !== "neutral") {
        effectPulse.add(key);
      }
      return;
    }

    if (previousCell !== key) {
      movedTo.add(key);
      removedFrom.add(previousCell);
      if (rune.id !== "basic" && rune.id !== "neutral") {
        effectPulse.add(key);
      }
      return;
    }

    const previousRune = prevCells.get(key);
    if (previousRune && previousRune.id !== rune.id && rune.id !== "basic" && rune.id !== "neutral") {
      effectPulse.add(key);
    }
  });

  prevCells.forEach((prevRune, key) => {
    const instanceId = prevRune.instanceId || null;
    if (!instanceId) {
      if (!currCells.has(key)) {
        removedFrom.add(key);
      }
      return;
    }

    if (!currByInstance.has(instanceId)) {
      removedFrom.add(key);
    }
  });

  const totalChanges = placed.size + movedTo.size + removedFrom.size;
  if (totalChanges === 0 || totalChanges > 8) {
    return none;
  }

  return {
    enabled: true,
    placed,
    movedTo,
    removedFrom,
    effectPulse,
  };
}
