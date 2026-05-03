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

const elements = {
  mainMenu: document.getElementById("main-menu"),
  menuAiBtn: document.getElementById("menu-ai-btn"),
  aiSideSelect: document.getElementById("ai-side-select"),
  aiDepthSelect: document.getElementById("ai-depth-select"),
  menuPassplayBtn: document.getElementById("menu-passplay-btn"),
  menuOnlineBtn: document.getElementById("menu-online-btn"),
  menuRulesBtn: document.getElementById("menu-rules-btn"),
  menuSettingsBtn: document.getElementById("menu-settings-btn"),
  settingsPanel: document.getElementById("settings-panel"),
  themeSelect: document.getElementById("theme-select"),
  settingsBackBtn: document.getElementById("settings-back-btn"),
  onlinePanel: document.getElementById("online-panel"),
  onlineRoomCode: document.getElementById("online-room-code"),
  onlineRoomLink: document.getElementById("online-room-link"),
  waitingRole: document.getElementById("waiting-role"),
  waitingSummary: document.getElementById("waiting-summary"),
  waitingYouStatus: document.getElementById("waiting-you-status"),
  waitingOpponentStatus: document.getElementById("waiting-opponent-status"),
  onlineCopyLinkBtn: document.getElementById("online-copy-link-btn"),
  onlineReadyBtn: document.getElementById("online-ready-btn"),
  onlineStartBtn: document.getElementById("online-start-btn"),
  onlineBackBtn: document.getElementById("online-back-btn"),
  rulesPanel: document.getElementById("rules-panel"),
  rulesBackBtn: document.getElementById("rules-back-btn"),
  gameScreen: document.getElementById("game-screen"),
  status: document.getElementById("game-status"),
  onlineConnection: document.getElementById("online-connection"),
  turnPill: document.getElementById("turn-pill"),
  boardEl: document.getElementById("board"),
  menuBtn: document.getElementById("menu-btn"),
  phaseBtn: document.getElementById("phase-btn"),
  newGameBtn: document.getElementById("new-game-btn"),
  player1Panel: document.getElementById("player-1-panel"),
  player2Panel: document.getElementById("player-2-panel"),
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
let waitingRoomState = {
  youReady: false,
  opponentJoined: false,
  opponentReady: false,
  canStart: false,
  started: false,
  playerId: null,
  opponentConnected: false,
};
const aiConfig = createAiConfig();
const online = createOnlineController();
let aiBusy = false;
let aiTimer = null;

wireOnlineEvents();
bindEvents();
initializeTheme();
render();
initializeEntryMode();

function wireOnlineEvents() {
  online.setListeners({
    waiting: (snapshot) => {
      activeRoomCode = snapshot.roomCode;
      waitingRoomState = {
        youReady: snapshot.youReady,
        opponentJoined: snapshot.opponentJoined,
        opponentReady: snapshot.opponentReady,
        canStart: snapshot.canStart,
        started: snapshot.started,
        playerId: snapshot.playerId,
        opponentConnected: snapshot.opponentConnected,
      };

      updateOnlineRoomUI(activeRoomCode);
      if (!elements.onlinePanel.hidden) {
        setStatus(`Room ${activeRoomCode}: ${getPlayerName(snapshot.playerId)} connected.`);
      }
      updateOnlineConnectionStatus();
    },
    state: (snapshot) => {
      state = restoreState(snapshot.state);
      if (elements.gameScreen.hidden) {
        enterGameScreen("online", snapshot.roomCode);
      }
      updateOnlineConnectionStatus();
      render();
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
    online.leaveRoom();
    const aiSide = Number(elements.aiSideSelect.value);
    const aiDepth = Number(elements.aiDepthSelect.value);
    setAiSettings(aiConfig, true, aiSide, aiDepth);

    state = createInitialState();
    if (state.phase === "shop" && state.shop.currentPlayer !== aiConfig.playerId) {
      switchShopPlayer(state);
    }
    handVisibility = { 1: aiSide !== 1, 2: aiSide !== 2 };
    clearSave();
    saveGame(state);

    enterGameScreen("passplay");
    setStatus(`AI mode started. ${getPlayerName(aiConfig.playerId)} is AI (depth ${aiConfig.depth}).`);
    render();
  });

  elements.menuPassplayBtn.addEventListener("click", () => {
    online.leaveRoom();
    setAiSettings(aiConfig, false, aiConfig.playerId, aiConfig.depth);
    enterGameScreen("passplay");
    setStatus("Pass & Play mode: continuing local game state.");
  });

  elements.menuOnlineBtn.addEventListener("click", async () => {
    setAiSettings(aiConfig, false, aiConfig.playerId, aiConfig.depth);
    activeRoomCode = createRoomCode();
    waitingRoomState = {
      youReady: false,
      opponentJoined: false,
      opponentReady: false,
      canStart: false,
      started: false,
      playerId: null,
      opponentConnected: false,
    };
    updateOnlineRoomUI(activeRoomCode);
    showOnlinePanel();

    const ok = await online.createRoom(activeRoomCode);
    if (!ok) {
      showMainMenu();
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

  elements.onlineBackBtn.addEventListener("click", () => {
    online.leaveRoom();
    showMainMenu();
  });

  elements.rulesBackBtn.addEventListener("click", () => {
    showMainMenu();
  });

  elements.onlineCopyLinkBtn.addEventListener("click", async () => {
    const link = elements.onlineRoomLink.value;
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
    online.leaveRoom();
    showMainMenu();
    clearRoomQuery();
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
      setStatus(result.error);
    }

    persistState();
    render();
    scheduleAiTurnIfNeeded();
  });

  elements.newGameBtn.addEventListener("click", () => {
    if (online.isOnlineActive()) {
      setStatus("New Game is disabled in online mode. Return to menu to create a room.");
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
  }

  renderBoard(state, elements, pendingTargets, winningLine, forcedColumns);
  renderHands(state, elements, handVisibility, forcedVisible);

  if (aiConfig.enabled) {
    const aiToggle = aiConfig.playerId === 1 ? elements.player1Toggle : elements.player2Toggle;
    if (forcedVisible[aiConfig.playerId]) {
      aiToggle.textContent = "Forced Visible (Uruz)";
      aiToggle.disabled = true;
    } else {
      aiToggle.textContent = "Hidden in AI mode";
      aiToggle.disabled = true;
    }
  }

  renderLog(state, elements);
  renderShopPanel();
  updateMeta();
  updateTopStatus();
  updateOnlineConnectionStatus();

  scheduleAiTurnIfNeeded();
}

function updateTopStatus() {
  if (state.pendingAction) {
    elements.turnPill.textContent = `Round ${state.roundNumber} - ${getPlayerName(state.currentPlayer)} choice`;
    elements.status.textContent = getPendingActionPrompt(state);
    return;
  }

  if (state.phase === "game-over") {
    elements.turnPill.textContent = state.gameWinner
      ? `Game Winner: ${getPlayerName(state.gameWinner)}`
      : "Game End: Draw";
    elements.status.textContent = state.gameWinner
      ? `${getPlayerName(state.gameWinner)} wins the game.`
      : "Game ended in a full tie.";
    return;
  }

  if (state.phase === "round-end") {
    if (state.winner) {
      elements.turnPill.textContent = `Round Winner: ${getPlayerName(state.winner)}`;
      elements.status.textContent = `Round ${state.roundNumber} won by ${getPlayerName(state.winner)}. Click Phase Action for shop.`;
    } else {
      elements.turnPill.textContent = `Round ${state.roundNumber}: Draw`;
      elements.status.textContent = "Round draw. Click Phase Action for shop.";
    }
    return;
  }

  if (state.phase === "shop") {
    elements.turnPill.textContent = `Shop Phase - ${getPlayerName(state.shop.currentPlayer)}`;
    elements.status.textContent = "Shop: remove once, combine pair, add up to 2 from offer. Switch player to pass device.";
    return;
  }

  elements.turnPill.textContent = `Round ${state.roundNumber} - Turn: ${getPlayerName(state.currentPlayer)}`;
  const forcedColumns = state.nextTurnConstraints?.[state.currentPlayer] || [];
  if (forcedColumns.length > 0) {
    elements.status.textContent = `${getPlayerName(state.currentPlayer)}: forced to play adjacent columns (${forcedColumns.map((col) => col + 1).join(", ")}).`;
    return;
  }

  elements.status.textContent = `${getPlayerName(state.currentPlayer)}: choose a rune, then click a column.`;
}

function renderShopPanel() {
  const inShop = state.phase === "shop";
  elements.shopPanel.hidden = !inShop;
  elements.boardEl.hidden = false;
  elements.shopSwitchPlayer.hidden = !inShop;

  elements.phaseBtn.hidden = state.phase === "round" || state.phase === "game-over";
  elements.phaseBtn.textContent = state.phase === "shop" ? "Start Next Round" : "Start Shop Phase";

  if (!inShop) {
    return;
  }

  const playerId = state.shop.currentPlayer;
  const data = state.shop.players[playerId];
  const highlights = getShopHighlights(state);
  const actions = getShopActionAvailability(state);

  elements.shopPlayerTitle.textContent = `Shop - ${getPlayerName(playerId)}`;
  elements.shopModeLabel.textContent = `Mode: ${data.mode || "none"} | Added: ${data.addedCount}/2 | Remove used: ${data.removeUsed ? "yes" : "no"}`;

  renderRuneList(elements.shopOffer, data.offer, playerId, highlights.offerHighlightIds);
  renderRuneList(elements.shopBag, state.players[playerId].bag, playerId, highlights.bagHighlightIds);

  elements.shopRemoveBtn.hidden = !actions.removeVisible;
  elements.shopCombineBtn.hidden = !actions.combineVisible;
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
  elements.p1Points.textContent = `Black points: ${state.players[1].points}`;
  elements.p2Points.textContent = `White points: ${state.players[2].points}`;
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

  return state.shop.players[state.shop.currentPlayer].mode;
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
    activeRoomCode = room;
    waitingRoomState = {
      youReady: false,
      opponentJoined: true,
      opponentReady: false,
      canStart: false,
      started: false,
      playerId: null,
      opponentConnected: false,
    };
    updateOnlineRoomUI(room);
    showOnlinePanel();
    online.joinRoom(room).then((ok) => {
      if (!ok) {
        showMainMenu();
      }
    });
    return;
  }

  showMainMenu();
}

function showMainMenu() {
  elements.mainMenu.hidden = false;
  elements.settingsPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
  elements.onlineConnection.hidden = true;
}

function showOnlinePanel() {
  elements.mainMenu.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.onlinePanel.hidden = false;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
}

function showRulesPanel() {
  elements.mainMenu.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = false;
  elements.gameScreen.hidden = true;
}

function showSettingsPanel() {
  elements.mainMenu.hidden = true;
  elements.settingsPanel.hidden = false;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = true;
}

function enterGameScreen(mode, roomCode = null) {
  elements.mainMenu.hidden = true;
  elements.settingsPanel.hidden = true;
  elements.onlinePanel.hidden = true;
  elements.rulesPanel.hidden = true;
  elements.gameScreen.hidden = false;

  if (mode === "online" && roomCode) {
    applyRoomQuery(roomCode);
    setStatus(`Online room ${roomCode}. Share your link with your opponent.`);
    elements.onlineConnection.hidden = false;
  } else {
    clearRoomQuery();
    elements.onlineConnection.hidden = true;
  }

  render();
}

function updateOnlineRoomUI(roomCode) {
  elements.onlineRoomCode.textContent = `Room: ${roomCode}`;
  elements.onlineRoomLink.value = buildRoomLink(roomCode);
  elements.waitingRole.textContent = waitingRoomState.playerId
    ? `You are: ${getPlayerName(waitingRoomState.playerId)}`
    : "You are: -";

  elements.onlineReadyBtn.textContent = waitingRoomState.youReady ? "Set Not Ready" : "Set Ready";
  elements.waitingYouStatus.textContent = `You: ${waitingRoomState.youReady ? "Ready" : "Not ready"}`;
  elements.waitingOpponentStatus.textContent = waitingRoomState.opponentJoined
    ? `Opponent: ${waitingRoomState.opponentReady ? "Ready" : "Joined (not ready)"}${waitingRoomState.opponentConnected ? "" : " - offline"}`
    : "Opponent: Waiting to join...";
  elements.onlineStartBtn.disabled = !waitingRoomState.canStart;

  if (waitingRoomState.started) {
    elements.waitingSummary.textContent = "Match started. Entering game...";
  } else {
    elements.waitingSummary.textContent = waitingRoomState.youReady
      ? "You are ready. Start when your opponent is ready."
      : "Share your link, then set Ready.";
  }
}

function updateOnlineConnectionStatus() {
  if (!online.isOnlineActive()) {
    elements.onlineConnection.hidden = true;
    return;
  }

  elements.onlineConnection.hidden = false;
  const role = waitingRoomState.playerId ? getPlayerName(waitingRoomState.playerId) : "-";
  const oppStatus = waitingRoomState.opponentConnected ? "connected" : "disconnected";
  elements.onlineConnection.textContent = `Online: You are ${role}. Opponent ${oppStatus}.`;
}

function buildRoomLink(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("mode", "online");
  url.searchParams.set("room", roomCode);
  return url.toString();
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

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
}

function saveThemePreference(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}
