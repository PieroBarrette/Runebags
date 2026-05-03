import { createEmptyBoard, dropToken, getAvailableColumns } from "./connect4Engine.js";
import { isBoardFull } from "./winChecker.js";
import { ensureHand, shuffle } from "../runes/bagEngine.js";
import {
  createRuneInstance,
  createStarterBag,
  getAllowedColumns,
  getRuneById,
  INITIAL_SHOP_COUNTS,
} from "../runes/runeCatalog.js";

const DEFAULT_ROWS = 6;
const DEFAULT_COLUMNS = 7;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const NEUTRAL_OWNER = 3;
const POINT_POOL_TOTAL = 10;
const BASE_HAND_SIZE = 2;
const STARTING_NEUTRAL_SUPPLY = 20;
const SHOP_OFFER_SIZE = 5;
const SHOP_ADD_LIMIT = 2;
const NON_COMBINABLE_RUNES = new Set(["basic", "inguz", "jera", "neutral", "berkana", "hagalz", "isa"]);

export function createInitialState() {
  const black = createPlayer(BLACK);
  const white = createPlayer(WHITE);

  const state = {
    schemaVersion: 5,
    rows: DEFAULT_ROWS,
    columns: DEFAULT_COLUMNS,
    board: createEmptyBoard(DEFAULT_ROWS, DEFAULT_COLUMNS),
    boardRunes: createRuneBoard(DEFAULT_ROWS, DEFAULT_COLUMNS),
    currentPlayer: playerFromPointPool(POINT_POOL_TOTAL),
    winner: null,
    winningLine: null,
    gameWinner: null,
    gameWinnerReason: null,
    isDraw: false,
    phase: "shop",
    turnNumber: 1,
    roundNumber: 0,
    pointPoolRemaining: POINT_POOL_TOTAL,
    tieRemovedPoints: 0,
    neutralSupply: STARTING_NEUTRAL_SUPPLY,
    roundAwayRunes: [],
    pendingAction: null,
    nextTurnConstraints: {
      1: null,
      2: null,
    },
    players: {
      1: black,
      2: white,
    },
    shop: createShopState(playerFromPointPool(POINT_POOL_TOTAL)),
    log: ["New game started in Shop Phase. White starts because point supply is even."],
  };

  initializeShopOffers(state);
  return state;
}

export function restoreState(candidate) {
  if (!candidate || candidate.schemaVersion !== 5 || !candidate.boardRunes) {
    return createInitialState();
  }

  if (!candidate.shop) {
    candidate.shop = createShopState(candidate.currentPlayer || WHITE);
    initializeShopOffers(candidate);
  }

  if (!Array.isArray(candidate.roundAwayRunes)) {
    candidate.roundAwayRunes = [];
  }

  if (!candidate.phase) {
    candidate.phase = "shop";
  }

  return candidate;
}

export function selectRune(state, playerId, runeInstanceId) {
  if (state.phase !== "round") {
    return { state, error: "You can only select runes during the round." };
  }

  if (state.currentPlayer !== playerId || state.pendingAction || state.gameWinner) {
    return { state, error: "You cannot select a rune right now." };
  }

  const player = state.players[playerId];
  const found = player.hand.find((rune) => rune.instanceId === runeInstanceId);

  if (!found) {
    return { state, error: "Rune not found in hand." };
  }

  player.selectedRuneInstanceId = runeInstanceId;
  return { state, error: null };
}

export function playTurn(state, column) {
  if (state.phase !== "round") {
    return { state, error: "Board play is only available during rounds." };
  }

  if (state.gameWinner) {
    return { state, error: "The game is over." };
  }

  if (state.pendingAction) {
    return { state, error: "Resolve the active rune choice first." };
  }

  if (!canPlayerPlay(state, state.currentPlayer)) {
    return forcePassIfNeeded(state);
  }

  const player = state.players[state.currentPlayer];
  const selectedRune = player.hand.find((rune) => rune.instanceId === player.selectedRuneInstanceId);

  if (!selectedRune) {
    return { state, error: "Select a rune before dropping a rune on the board." };
  }

  const legalColumns = getLegalColumnsForRune(state, state.currentPlayer, selectedRune);
  if (!legalColumns.includes(column)) {
    return { state, error: `${selectedRune.name} cannot be played in column ${column + 1}.` };
  }

  let move;
  if (selectedRune.id === "algiz") {
    move = insertRuneFromBottom(state, column, state.currentPlayer, selectedRune);
    if (!move) {
      return { state, error: "Algiz cannot be played in a full column." };
    }
  } else {
    move = dropToken(state.board, column, getOwnerForRune(selectedRune, state.currentPlayer));
    if (!move) {
      return { state, error: "That column is full." };
    }
    setRuneOnBoard(state, move, selectedRune);
  }

  consumeSelectedRune(state, player, selectedRune.instanceId);
  state.nextTurnConstraints[state.currentPlayer] = null;
  state.log.unshift(
    `Turn ${state.turnNumber}: ${playerName(state.currentPlayer)} played ${selectedRune.name} (L${selectedRune.level}) in column ${column + 1}.`,
  );

  const effectResult = applyRuneEffect(state, selectedRune, move, state.currentPlayer);
  effectResult.notes.forEach((note) => state.log.unshift(note));

  if (effectResult.pendingAction) {
    state.pendingAction = {
      ...effectResult.pendingAction,
      turnContext: {
        playerId: state.currentPlayer,
        extraTurn: effectResult.extraTurn,
      },
    };
    state.log.unshift(getPendingActionPrompt(state));
    return { state, error: null };
  }

  return finalizeTurn(state, state.currentPlayer, effectResult.extraTurn);
}

export function resolvePendingBoardChoice(state, choice) {
  if (state.phase !== "round") {
    return { state, error: "No board interaction is active." };
  }

  if (!state.pendingAction) {
    return { state, error: "No interactive rune choice is pending." };
  }

  const action = state.pendingAction;

  if (action.type === "gebo-l2-target") {
    const key = cellKey(choice.row, choice.col);
    const valid = new Set(action.validCells.map((cell) => cellKey(cell.row, cell.col)));
    if (!valid.has(key)) {
      return { state, error: "Choose an adjacent occupied rune for Gebo." };
    }

    const removed = removeRuneAt(state, choice.row, choice.col, "gebo", "round");
    if (removed) {
      state.log.unshift("Gebo removed the chosen adjacent rune for this round.");
    }

    const turnContext = action.turnContext;
    state.pendingAction = null;
    return finalizeTurn(state, turnContext.playerId, turnContext.extraTurn);
  }

  if (action.type === "perth-l2-column") {
    if (!action.validColumns.includes(choice.column)) {
      return { state, error: "Choose one highlighted adjacent column for Perth." };
    }

    state.nextTurnConstraints[action.opponentId] = [choice.column];
    state.log.unshift(
      `Perth L2 forces ${playerName(action.opponentId)} to play in column ${choice.column + 1} next turn.`,
    );

    const turnContext = action.turnContext;
    state.pendingAction = null;
    return finalizeTurn(state, turnContext.playerId, turnContext.extraTurn);
  }

  if (action.type === "teiwaz-source") {
    if (!action.validSourceColumns.includes(choice.column)) {
      return { state, error: "Choose a valid source column for Teiwaz." };
    }

    const sourceRow = findTopOccupiedRow(state, choice.column);
    if (sourceRow === null) {
      return { state, error: "Selected source column has no movable top rune." };
    }

    const validTargetColumns = getTeiwazTargetColumns(state, choice.column, action.mode);
    if (validTargetColumns.length === 0) {
      return { state, error: "No valid destination columns from that source." };
    }

    state.pendingAction = {
      type: "teiwaz-target",
      playerId: action.playerId,
      sourceCol: choice.column,
      validTargetColumns,
      turnContext: action.turnContext,
    };
    state.log.unshift(getPendingActionPrompt(state));
    return { state, error: null };
  }

  if (action.type === "teiwaz-target") {
    if (!action.validTargetColumns.includes(choice.column)) {
      return { state, error: "Choose a valid destination column for Teiwaz." };
    }

    const moved = moveTopRuneFromColumnToColumn(state, action.sourceCol, choice.column);
    if (!moved) {
      return { state, error: "Could not move Teiwaz target rune." };
    }

    state.log.unshift(
      `Teiwaz moved the top rune from column ${action.sourceCol + 1} to column ${choice.column + 1}.`,
    );

    const turnContext = action.turnContext;
    state.pendingAction = null;
    return finalizeTurn(state, turnContext.playerId, turnContext.extraTurn);
  }

  if (action.type === "thurisa-drop") {
    if (!action.validColumns.includes(choice.column)) {
      return { state, error: "Choose a valid column to drop a neutral rune." };
    }

    if (state.neutralSupply <= 0) {
      const turnContext = action.turnContext;
      state.pendingAction = null;
      return finalizeTurn(state, turnContext.playerId, turnContext.extraTurn);
    }

    const placement = dropToken(state.board, choice.column, NEUTRAL_OWNER);
    if (!placement) {
      return { state, error: "That column is full for Thurisa placement." };
    }

    setRuneOnBoard(state, placement, createRuneInstance("neutral", 1));
    state.neutralSupply -= 1;
    state.log.unshift(`Thurisa placed a neutral rune in column ${choice.column + 1}.`);

    const remaining = action.remainingDrops - 1;
    if (remaining <= 0 || state.neutralSupply <= 0 || getAvailableColumns(state.board).length === 0) {
      const turnContext = action.turnContext;
      state.pendingAction = null;
      return finalizeTurn(state, turnContext.playerId, turnContext.extraTurn);
    }

    state.pendingAction = {
      ...action,
      remainingDrops: remaining,
      validColumns: getAvailableColumns(state.board),
    };
    state.log.unshift(getPendingActionPrompt(state));
    return { state, error: null };
  }

  return { state, error: "Unknown pending action type." };
}

export function getPendingBoardTargets(state) {
  if (!state.pendingAction || state.phase !== "round") {
    return { pending: false, mode: null, columns: [], cells: [] };
  }

  const action = state.pendingAction;

  if (action.type === "gebo-l2-target") {
    return { pending: true, mode: "cells", columns: [], cells: action.validCells };
  }

  if (action.type === "teiwaz-source") {
    return { pending: true, mode: "columns", columns: action.validSourceColumns, cells: [] };
  }

  if (action.type === "teiwaz-target") {
    return { pending: true, mode: "columns", columns: action.validTargetColumns, cells: [] };
  }

  if (action.type === "perth-l2-column" || action.type === "thurisa-drop") {
    return { pending: true, mode: "columns", columns: action.validColumns, cells: [] };
  }

  return { pending: false, mode: null, columns: [], cells: [] };
}

export function getPendingChoices(state) {
  if (!state.pendingAction || state.phase !== "round") {
    return [];
  }

  const action = state.pendingAction;
  if (action.type === "gebo-l2-target") {
    return action.validCells.map((cell) => ({ row: cell.row, col: cell.col, column: cell.col }));
  }

  if (action.type === "teiwaz-source") {
    return action.validSourceColumns.map((column) => ({ column }));
  }

  if (action.type === "teiwaz-target") {
    return action.validTargetColumns.map((column) => ({ column }));
  }

  if (action.type === "perth-l2-column" || action.type === "thurisa-drop") {
    return action.validColumns.map((column) => ({ column }));
  }

  return [];
}

export function getLegalMovesForPlayer(state, playerId) {
  if (state.phase !== "round" || state.pendingAction || state.currentPlayer !== playerId) {
    return [];
  }

  const player = state.players[playerId];
  if (!player || !player.hand) {
    return [];
  }

  const moves = [];
  player.hand.forEach((rune) => {
    const legalColumns = getLegalColumnsForRune(state, playerId, rune);
    legalColumns.forEach((column) => {
      moves.push({ runeInstanceId: rune.instanceId, column, runeId: rune.id, level: rune.level });
    });
  });

  return moves;
}

export function getPendingActionPrompt(state) {
  if (!state.pendingAction) {
    return "";
  }

  const action = state.pendingAction;
  if (action.type === "gebo-l2-target") {
    return "Gebo L2: choose one adjacent occupied rune to remove for this round.";
  }
  if (action.type === "perth-l2-column") {
    return "Perth L2: choose the adjacent column the opponent must play next turn.";
  }
  if (action.type === "teiwaz-source") {
    return "Teiwaz: choose a source column with a movable top rune.";
  }
  if (action.type === "teiwaz-target") {
    return "Teiwaz: choose a destination column for the moved top rune.";
  }
  if (action.type === "thurisa-drop") {
    return `Thurisa: choose a column for neutral drop (${action.remainingDrops} remaining).`;
  }

  return "Resolve the pending rune choice.";
}

export function enterShopPhase(state) {
  if (state.phase !== "round-end") {
    return { state, error: "Shop phase can only start after a round ends." };
  }

  settleRound(state);

  if (state.pointPoolRemaining <= 0) {
    finalizeGameAtZeroPoints(state);
    state.phase = "game-over";
    return { state, error: null };
  }

  state.phase = "shop";
  state.pendingAction = null;
  state.shop = createShopState(state.currentPlayer);
  initializeShopOffers(state);
  state.log.unshift("Shop phase started.");
  return { state, error: null };
}

export function startRoundFromShop(state) {
  if (state.phase !== "shop") {
    return { state, error: "Not currently in shop phase." };
  }

  returnUnpickedOfferRunes(state, BLACK);
  returnUnpickedOfferRunes(state, WHITE);

  state.shop = createShopState(playerFromPointPool(state.pointPoolRemaining));
  state.phase = "round";
  state.roundNumber += 1;
  state.turnNumber = 1;
  state.currentPlayer = playerFromPointPool(state.pointPoolRemaining);
  state.winner = null;
  state.winningLine = null;
  state.isDraw = false;
  state.pendingAction = null;
  state.nextTurnConstraints = { 1: null, 2: null };

  ensureHand(state.players[BLACK], getMaxHandSize(state, BLACK));
  ensureHand(state.players[WHITE], getMaxHandSize(state, WHITE));
  clearHandSelections(state);

  state.log.unshift(
    `Round ${state.roundNumber} begins. ${playerName(state.currentPlayer)} starts because point supply is ${state.pointPoolRemaining % 2 === 0 ? "even" : "odd"}.`,
  );

  const passResult = forcePassIfNeeded(state);
  if (passResult.error) {
    return passResult;
  }

  return { state, error: null };
}

export function toggleShopView(state) {
  if (state.phase !== "shop") {
    return { state, error: "View toggle only works in shop phase." };
  }

  state.shop.view = state.shop.view === "board" ? "bag" : "board";
  return { state, error: null };
}

export function switchShopPlayer(state) {
  if (state.phase !== "shop") {
    return { state, error: "Switching player is only available in shop phase." };
  }

  state.shop.currentPlayer = getOpponent(state.shop.currentPlayer);
  state.log.unshift(`Shop turn passed to ${playerName(state.shop.currentPlayer)}.`);
  resetShopMode(state, state.shop.currentPlayer);
  return { state, error: null };
}

export function setShopMode(state, mode) {
  if (state.phase !== "shop") {
    return { state, error: "Shop mode only works in shop phase." };
  }

  const playerId = state.shop.currentPlayer;
  const data = state.shop.players[playerId];

  if (mode === null) {
    resetShopMode(state, playerId);
    return { state, error: null };
  }

  if (mode === "remove" && data.removeUsed) {
    return { state, error: "Remove has already been used this shop phase." };
  }

  if (mode === "combine" && !hasCombinablePair(state, playerId)) {
    return { state, error: "No combinable pair is currently available in bag." };
  }

  data.mode = mode;
  data.combineSelection = [];
  return { state, error: null };
}

export function shopSelectBagRune(state, runeInstanceId) {
  if (state.phase !== "shop") {
    return { state, error: "Bag selection is only available in shop phase." };
  }

  const playerId = state.shop.currentPlayer;
  const player = state.players[playerId];
  const data = state.shop.players[playerId];
  const rune = player.bag.find((entry) => entry.instanceId === runeInstanceId);

  if (!rune) {
    return { state, error: "Rune not found in active player bag." };
  }

  if (data.mode === "remove") {
    if (data.removeUsed) {
      return { state, error: "Remove already used this shop phase." };
    }

    removeRuneFromBag(state, playerId, rune.instanceId);
    data.removeUsed = true;
    data.mode = null;

    if (rune.id === "neutral") {
      state.neutralSupply += 1;
      state.log.unshift(`${playerName(playerId)} removed a Neutral rune. It returned to supply.`);
    } else if (rune.id === "basic") {
      state.log.unshift(`${playerName(playerId)} removed a Basic rune permanently.`);
    } else {
      player.shopSupply.push(createRuneInstance(rune.id, rune.level));
      state.log.unshift(
        `${playerName(playerId)} removed ${rune.name} and returned it to their shop supply.`,
      );
    }

    return { state, error: null };
  }

  if (data.mode === "combine") {
    if (rune.level !== 1 || NON_COMBINABLE_RUNES.has(rune.id)) {
      return { state, error: "This rune cannot be combined." };
    }

    if (data.combineSelection.length === 0) {
      if (!hasPairInBag(player.bag, rune.id)) {
        return { state, error: "No matching pair for that rune in bag." };
      }
      data.combineSelection = [rune.instanceId];
      return { state, error: null };
    }

    const first = player.bag.find((entry) => entry.instanceId === data.combineSelection[0]);
    if (!first) {
      data.combineSelection = [];
      return { state, error: "First combine selection is no longer valid." };
    }

    if (first.instanceId === rune.instanceId) {
      return { state, error: "Select a second copy of the same rune." };
    }

    if (first.id !== rune.id || rune.level !== 1) {
      return { state, error: "Second rune must match the first rune symbol." };
    }

    removeRuneFromBag(state, playerId, first.instanceId);
    removeRuneFromBag(state, playerId, rune.instanceId);
    player.bag.push(createRuneInstance(rune.id, 2));
    data.combineSelection = [];
    data.mode = null;

    state.log.unshift(`${playerName(playerId)} combined two ${rune.name} runes into Level 2.`);
    return { state, error: null };
  }

  return { state, error: "Select a shop option first (Remove or Combine)." };
}

export function shopSelectOfferRune(state, runeInstanceId) {
  if (state.phase !== "shop") {
    return { state, error: "Offer selection is only available in shop phase." };
  }

  const playerId = state.shop.currentPlayer;
  const data = state.shop.players[playerId];

  if (data.addedCount >= SHOP_ADD_LIMIT) {
    return { state, error: "You can only add up to 2 runes from shop offer." };
  }

  const offerIndex = data.offer.findIndex((rune) => rune.instanceId === runeInstanceId);
  if (offerIndex < 0) {
    return { state, error: "Rune not found in active shop offer." };
  }

  const [pickedRune] = data.offer.splice(offerIndex, 1);
  state.players[playerId].bag.push(pickedRune);
  data.addedCount += 1;

  state.log.unshift(`${playerName(playerId)} added ${pickedRune.name} from shop offer.`);
  applyShopEffectIfAny(state, playerId, pickedRune);

  return { state, error: null };
}

export function getShopHighlights(state) {
  if (state.phase !== "shop") {
    return { bagHighlightIds: [], offerHighlightIds: [] };
  }

  const playerId = state.shop.currentPlayer;
  const data = state.shop.players[playerId];
  const bag = state.players[playerId].bag;

  if (data.mode === "remove") {
    return { bagHighlightIds: bag.map((rune) => rune.instanceId), offerHighlightIds: [] };
  }

  if (data.mode === "combine") {
    if (data.combineSelection.length === 0) {
      const combinable = bag
        .filter((rune) => rune.level === 1 && !NON_COMBINABLE_RUNES.has(rune.id) && hasPairInBag(bag, rune.id))
        .map((rune) => rune.instanceId);
      return { bagHighlightIds: combinable, offerHighlightIds: [] };
    }

    const selected = bag.find((rune) => rune.instanceId === data.combineSelection[0]);
    const matches = selected
      ? bag
          .filter((rune) => rune.instanceId !== selected.instanceId && rune.id === selected.id && rune.level === 1)
          .map((rune) => rune.instanceId)
      : [];
    return { bagHighlightIds: matches, offerHighlightIds: [] };
  }

  return {
    bagHighlightIds: [],
    offerHighlightIds: data.addedCount >= SHOP_ADD_LIMIT ? [] : data.offer.map((rune) => rune.instanceId),
  };
}

export function getShopActionAvailability(state) {
  if (state.phase !== "shop") {
    return {
      removeVisible: false,
      combineVisible: false,
    };
  }

  const playerId = state.shop.currentPlayer;
  const data = state.shop.players[playerId];

  return {
    removeVisible: !data.removeUsed,
    combineVisible: hasCombinablePair(state, playerId),
  };
}

export function getWinningLine(state) {
  return state.winningLine || [];
}

export function getForcedVisiblePlayers(state) {
  const forced = { 1: false, 2: false };

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      const rune = state.boardRunes[row][col];
      const owner = state.board[row][col];
      if (!rune || owner === EMPTY || owner === NEUTRAL_OWNER) {
        continue;
      }

      if (rune.id === "uruz") {
        forced[getOpponent(owner)] = true;
      }
    }
  }

  return forced;
}

export function getPlayerName(playerId) {
  return playerName(playerId);
}

function createPlayer(id) {
  return {
    id,
    points: 0,
    bag: shuffle(createStarterBag()),
    hand: [],
    discard: [],
    selectedRuneInstanceId: null,
    shopSupply: createInitialShopSupply(),
  };
}

function createInitialShopSupply() {
  const supply = [];
  Object.entries(INITIAL_SHOP_COUNTS).forEach(([runeId, count]) => {
    for (let i = 0; i < count; i += 1) {
      supply.push(createRuneInstance(runeId, 1));
    }
  });
  return supply;
}

function createShopState(currentPlayer) {
  return {
    currentPlayer,
    view: "bag",
    players: {
      1: {
        offer: [],
        addedCount: 0,
        removeUsed: false,
        mode: null,
        combineSelection: [],
      },
      2: {
        offer: [],
        addedCount: 0,
        removeUsed: false,
        mode: null,
        combineSelection: [],
      },
    },
  };
}

function initializeShopOffers(state) {
  for (const playerId of [BLACK, WHITE]) {
    const player = state.players[playerId];
    const data = state.shop.players[playerId];

    for (let i = 0; i < SHOP_OFFER_SIZE && player.shopSupply.length > 0; i += 1) {
      const index = Math.floor(Math.random() * player.shopSupply.length);
      const [drawn] = player.shopSupply.splice(index, 1);
      data.offer.push(drawn);
    }
  }
}

function returnUnpickedOfferRunes(state, playerId) {
  const player = state.players[playerId];
  const data = state.shop.players[playerId];
  if (!data) {
    return;
  }

  data.offer.forEach((rune) => player.shopSupply.push(rune));
  data.offer = [];
}

function resetShopMode(state, playerId) {
  const data = state.shop.players[playerId];
  data.mode = null;
  data.combineSelection = [];
}

function removeRuneFromBag(state, playerId, runeInstanceId) {
  const player = state.players[playerId];
  const index = player.bag.findIndex((rune) => rune.instanceId === runeInstanceId);
  if (index >= 0) {
    player.bag.splice(index, 1);
  }
}

function hasPairInBag(bag, runeId) {
  return bag.filter((rune) => rune.id === runeId && rune.level === 1).length >= 2;
}

function hasCombinablePair(state, playerId) {
  const bag = state.players[playerId].bag;
  const ids = [...new Set(bag.map((rune) => rune.id))];
  return ids.some((id) => !NON_COMBINABLE_RUNES.has(id) && hasPairInBag(bag, id));
}

function applyShopEffectIfAny(state, playerId, rune) {
  if (!["gebo", "raido", "teiwaz"].includes(rune.id)) {
    return;
  }

  if (state.neutralSupply <= 0) {
    state.log.unshift(`${rune.name} shop effect could not add neutral rune (supply empty).`);
    return;
  }

  state.players[playerId].bag.push(createRuneInstance("neutral", 1));
  state.neutralSupply -= 1;
  state.log.unshift(`${rune.name} shop effect added 1 Neutral rune to ${playerName(playerId)} bag.`);
}

function createRuneBoard(rows, columns) {
  return Array.from({ length: rows }, () => Array(columns).fill(null));
}

function clearHandSelections(state) {
  state.players[BLACK].selectedRuneInstanceId = null;
  state.players[WHITE].selectedRuneInstanceId = null;
}

function setRuneOnBoard(state, placement, rune) {
  state.boardRunes[placement.row][placement.col] = {
    id: rune.id,
    level: rune.level,
    ethereal: isRuneEthereal(rune),
    neutral: rune.id === "neutral",
  };
}

function getOwnerForRune(rune, playerId) {
  return rune.id === "neutral" ? NEUTRAL_OWNER : playerId;
}

function consumeSelectedRune(state, player, runeInstanceId) {
  const index = player.hand.findIndex((rune) => rune.instanceId === runeInstanceId);
  if (index < 0) {
    return;
  }

  const [usedRune] = player.hand.splice(index, 1);
  player.selectedRuneInstanceId = null;

  if (isRuneEthereal(usedRune)) {
    state.log.unshift(`${usedRune.name} is ethereal and returns to shop after this round.`);
    return;
  }
}

function isRuneEthereal(rune) {
  const levels = rune.etherealAtLevels || [];
  return levels.includes(rune.level);
}

function getOpponent(playerId) {
  return playerId === BLACK ? WHITE : BLACK;
}

function getMaxHandSize(state, playerId) {
  let maxSize = BASE_HAND_SIZE;

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      const rune = state.boardRunes[row][col];
      const owner = state.board[row][col];
      if (!rune || owner !== playerId || rune.id !== "ehwaz") {
        continue;
      }

      maxSize = Math.max(maxSize, rune.level >= 2 ? 4 : 3);
    }
  }

  return maxSize;
}

function getLegalColumnsForRune(state, playerId, rune) {
  const availableColumns = getAvailableColumns(state.board);
  const allowedColumns = getAllowedColumns(rune, state.columns);
  const constrainedColumns = getConstrainedColumns(state, playerId, availableColumns);
  return availableColumns.filter(
    (col) => allowedColumns.includes(col) && constrainedColumns.includes(col),
  );
}

function canPlayerPlay(state, playerId) {
  if (state.phase !== "round") {
    return false;
  }

  const player = state.players[playerId];
  if (!player || player.hand.length === 0) {
    return false;
  }

  return player.hand.some((rune) => getLegalColumnsForRune(state, playerId, rune).length > 0);
}

function forcePassIfNeeded(state) {
  if (state.phase !== "round") {
    return { state, error: null };
  }

  const current = state.currentPlayer;
  const opponent = getOpponent(current);

  const currentCanPlay = canPlayerPlay(state, current);
  if (currentCanPlay) {
    return { state, error: null };
  }

  const opponentCanPlay = canPlayerPlay(state, opponent);
  state.log.unshift(`${playerName(current)} cannot play and must pass.`);

  if (!opponentCanPlay) {
    finishRoundAsDraw(state, "Both players cannot play any rune. Round is a draw.");
    return { state, error: null };
  }

  state.currentPlayer = opponent;
  state.turnNumber += 1;
  state.log.unshift(`${playerName(opponent)} to play.`);
  return { state, error: `${playerName(current)} had to pass.` };
}

function getConstrainedColumns(state, playerId, availableColumns) {
  const constraints = state.nextTurnConstraints[playerId];
  if (!constraints || constraints.length === 0) {
    return availableColumns;
  }

  const legal = constraints.filter((col) => availableColumns.includes(col));
  return legal.length > 0 ? legal : availableColumns;
}

function insertRuneFromBottom(state, column, playerId, rune) {
  if (state.board[0][column] !== EMPTY) {
    return null;
  }

  for (let row = 0; row < state.rows - 1; row += 1) {
    state.board[row][column] = state.board[row + 1][column];
    state.boardRunes[row][column] = state.boardRunes[row + 1][column];
  }

  const move = { row: state.rows - 1, col: column };
  state.board[move.row][move.col] = getOwnerForRune(rune, playerId);
  setRuneOnBoard(state, move, rune);
  return move;
}

function applyRuneEffect(state, rune, move, playerId) {
  const notes = [];
  let extraTurn = false;
  let pendingAction = null;

  if (rune.id === "ansuz") {
    const targetRow = move.row + 1;
    const targetCol = move.col;
    if (isInside(state, targetRow, targetCol) && state.board[targetRow][targetCol] !== NEUTRAL_OWNER) {
      const removed = removeRuneAt(state, targetRow, targetCol, "ansuz", "immediate");
      if (removed) {
        notes.push("Ansuz returned the rune below to its owner bag.");
      }
    }
  }

  if (rune.id === "gebo") {
    if (rune.level >= 2) {
      const validCells = getAdjacentOccupiedCells(state, move.row, move.col);
      if (validCells.length > 0) {
        pendingAction = {
          type: "gebo-l2-target",
          playerId,
          validCells,
        };
      }
    } else {
      const removed = removeRuneAt(state, move.row + 1, move.col, "gebo", "round");
      if (removed) {
        notes.push("Gebo removed the rune below for this round.");
      }
    }
  }

  if (rune.id === "mannaz") {
    if (state.neutralSupply > 0) {
      state.players[getOpponent(playerId)].bag.push(createRuneInstance("neutral", 1));
      state.neutralSupply -= 1;
      notes.push("Mannaz added a neutral rune to opponent bag.");
    }
  }

  if (rune.id === "perth") {
    const opponentId = getOpponent(playerId);
    const adjacent = getAdjacentColumns(move.col, state.columns);

    if (rune.level >= 2) {
      const validColumns = adjacent.filter((col) => state.board[0][col] === EMPTY);
      if (validColumns.length > 0) {
        pendingAction = {
          type: "perth-l2-column",
          playerId,
          opponentId,
          validColumns,
        };
      }
    } else {
      state.nextTurnConstraints[opponentId] = adjacent;
      notes.push("Perth forces opponent next turn into adjacent columns.");
    }
  }

  if (rune.id === "raido") {
    extraTurn = true;
    notes.push("Raido grants an extra turn.");
  }

  if (rune.id === "sowelu") {
    const discardCount = rune.level >= 2 ? 2 : 1;
    const opponent = state.players[getOpponent(playerId)];
    let discarded = 0;

    for (let i = 0; i < discardCount; i += 1) {
      if (opponent.bag.length === 0) {
        break;
      }
      const index = Math.floor(Math.random() * opponent.bag.length);
      const [removed] = opponent.bag.splice(index, 1);
      state.roundAwayRunes.push({
        owner: opponent.id,
        runeId: removed.id,
        level: removed.level,
        source: "sowelu",
      });
      discarded += 1;
    }

    if (discarded > 0) {
      notes.push(`Sowelu removed ${discarded} random rune(s) from opponent bag for this round.`);
    }
  }

  if (rune.id === "teiwaz") {
    const mode = rune.level >= 2 ? "any" : "adjacent";
    const validSourceColumns = getTeiwazSourceColumns(state, mode);
    if (validSourceColumns.length > 0) {
      pendingAction = {
        type: "teiwaz-source",
        playerId,
        mode,
        validSourceColumns,
      };
    }
  }

  if (rune.id === "thurisa") {
    const remainingDrops = Math.min(rune.level >= 2 ? 2 : 1, state.neutralSupply);
    const validColumns = getAvailableColumns(state.board);
    if (remainingDrops > 0 && validColumns.length > 0) {
      pendingAction = {
        type: "thurisa-drop",
        playerId,
        remainingDrops,
        validColumns,
      };
    }
  }

  return { notes, extraTurn, pendingAction };
}

function getAdjacentOccupiedCells(state, row, col) {
  const offsets = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];

  const cells = [];
  for (const [dr, dc] of offsets) {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (!isInside(state, nextRow, nextCol)) {
      continue;
    }

    if (state.board[nextRow][nextCol] !== EMPTY) {
      cells.push({ row: nextRow, col: nextCol });
    }
  }

  return cells;
}

function removeRuneAt(state, row, col, source, returnMode) {
  if (!isInside(state, row, col)) {
    return null;
  }

  const owner = state.board[row][col];
  const rune = state.boardRunes[row][col];
  if (owner === EMPTY || !rune) {
    return null;
  }

  state.board[row][col] = EMPTY;
  state.boardRunes[row][col] = null;
  compactColumn(state, col);

  if (returnMode === "immediate") {
    if (owner !== NEUTRAL_OWNER) {
      state.players[owner].bag.push(createRuneInstance(rune.id, rune.level));
    }
    return { owner, rune };
  }

  state.roundAwayRunes.push({
    owner,
    runeId: rune.id,
    level: rune.level,
    source,
  });

  return { owner, rune };
}

function compactColumn(state, column) {
  const pieces = [];

  for (let row = state.rows - 1; row >= 0; row -= 1) {
    const owner = state.board[row][column];
    const rune = state.boardRunes[row][column];
    if (owner !== EMPTY && rune) {
      pieces.push({ owner, rune });
    }
  }

  for (let row = state.rows - 1; row >= 0; row -= 1) {
    const index = state.rows - 1 - row;
    if (index < pieces.length) {
      state.board[row][column] = pieces[index].owner;
      state.boardRunes[row][column] = pieces[index].rune;
    } else {
      state.board[row][column] = EMPTY;
      state.boardRunes[row][column] = null;
    }
  }
}

function getTeiwazSourceColumns(state, mode) {
  const columns = [];

  for (let col = 0; col < state.columns; col += 1) {
    const sourceRow = findTopOccupiedRow(state, col);
    if (sourceRow === null) {
      continue;
    }

    const targets = getTeiwazTargetColumns(state, col, mode);
    if (targets.length > 0) {
      columns.push(col);
    }
  }

  return columns;
}

function getTeiwazTargetColumns(state, sourceCol, mode) {
  const candidates = mode === "adjacent" ? getAdjacentColumns(sourceCol, state.columns) : allColumns(state.columns);
  return candidates.filter((targetCol) => targetCol !== sourceCol && state.board[0][targetCol] === EMPTY);
}

function moveTopRuneFromColumnToColumn(state, sourceCol, targetCol) {
  const sourceRow = findTopOccupiedRow(state, sourceCol);
  if (sourceRow === null) {
    return false;
  }

  const owner = state.board[sourceRow][sourceCol];
  const rune = state.boardRunes[sourceRow][sourceCol];
  if (owner === EMPTY || !rune || state.board[0][targetCol] !== EMPTY) {
    return false;
  }

  state.board[sourceRow][sourceCol] = EMPTY;
  state.boardRunes[sourceRow][sourceCol] = null;
  compactColumn(state, sourceCol);

  const placement = dropToken(state.board, targetCol, owner);
  if (!placement) {
    return false;
  }

  state.boardRunes[placement.row][placement.col] = rune;
  return true;
}

function findTopOccupiedRow(state, column) {
  for (let row = 0; row < state.rows; row += 1) {
    if (state.board[row][column] !== EMPTY) {
      return row;
    }
  }

  return null;
}

function allColumns(columnCount) {
  return Array.from({ length: columnCount }, (_, index) => index);
}

function getAdjacentColumns(column, columnCount) {
  const columns = [];
  if (column - 1 >= 0) {
    columns.push(column - 1);
  }
  if (column + 1 < columnCount) {
    columns.push(column + 1);
  }
  return columns;
}

function finalizeTurn(state, activePlayerId, extraTurn) {
  const winners = getWinningPlayers(state);

  if (winners.length === 1) {
    finishRoundWithWinner(state, winners[0]);
    return { state, error: null };
  }

  if (winners.length > 1) {
    finishRoundAsDraw(state, "Both Black and White formed winning lines. Round is a draw.");
    return { state, error: null };
  }

  if (isBoardFull(state.board)) {
    finishRoundAsDraw(state, "The board is full. Round is a draw.");
    return { state, error: null };
  }

  ensureHand(state.players[activePlayerId], getMaxHandSize(state, activePlayerId));
  state.currentPlayer = extraTurn ? activePlayerId : getOpponent(activePlayerId);
  state.turnNumber += 1;

  const passResult = forcePassIfNeeded(state);
  if (passResult.error) {
    return passResult;
  }

  state.log.unshift(
    extraTurn
      ? `${playerName(state.currentPlayer)} takes an extra turn.`
      : `${playerName(state.currentPlayer)} to play.`,
  );

  return { state, error: null };
}

function getWinningPlayers(state) {
  const winners = [];

  for (const playerId of [BLACK, WHITE]) {
    if (findWinningLines(state, playerId).length > 0) {
      winners.push(playerId);
    }
  }

  return winners;
}

function findWinningLines(state, playerId) {
  const lines = [];
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      for (const [dr, dc] of directions) {
        const cells = [
          [row, col],
          [row + dr, col + dc],
          [row + dr * 2, col + dc * 2],
          [row + dr * 3, col + dc * 3],
        ];

        if (!cells.every(([r, c]) => isInside(state, r, c))) {
          continue;
        }

        if (cellsFormWinningLineForPlayer(state, cells, playerId)) {
          lines.push(cells);
        }
      }
    }
  }

  return lines;
}

function cellsFormWinningLineForPlayer(state, cells, playerId) {
  const neutralCandidates = [];

  for (const [row, col] of cells) {
    const owner = state.board[row][col];
    if (owner === playerId) {
      continue;
    }

    if (owner !== NEUTRAL_OWNER) {
      return false;
    }

    const adjacentHagalz = getAdjacentHagalzKeys(state, row, col, playerId);
    if (adjacentHagalz.length === 0) {
      return false;
    }

    neutralCandidates.push(adjacentHagalz);
  }

  if (neutralCandidates.length === 0) {
    return true;
  }

  // Each converted neutral needs its own adjacent Hagalz rune.
  return canAssignDistinctHagalz(neutralCandidates, 0, new Set());
}

function getAdjacentHagalzKeys(state, row, col, playerId) {
  const keys = [];

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) {
        continue;
      }

      const nextRow = row + dr;
      const nextCol = col + dc;
      if (!isInside(state, nextRow, nextCol)) {
        continue;
      }

      if (state.board[nextRow][nextCol] !== playerId) {
        continue;
      }

      const rune = state.boardRunes[nextRow][nextCol];
      if (rune && rune.id === "hagalz") {
        keys.push(`${nextRow}:${nextCol}`);
      }
    }
  }

  return keys;
}

function canAssignDistinctHagalz(neutralCandidates, index, usedHagalz) {
  if (index >= neutralCandidates.length) {
    return true;
  }

  const options = neutralCandidates[index];
  for (const option of options) {
    if (usedHagalz.has(option)) {
      continue;
    }

    usedHagalz.add(option);
    if (canAssignDistinctHagalz(neutralCandidates, index + 1, usedHagalz)) {
      return true;
    }
    usedHagalz.delete(option);
  }

  return false;
}

function finishRoundWithWinner(state, winnerId) {
  state.winner = winnerId;
  state.phase = "round-end";

  const winningLines = findWinningLines(state, winnerId);
  state.winningLine = winningLines[0] || null;

  awardPointIfAvailable(state, winnerId, "Round win");

  const hasBerkanaInWin = winningLines.some((line) =>
    line.some(([row, col]) => {
      const rune = state.boardRunes[row][col];
      return rune && rune.id === "berkana" && state.board[row][col] === winnerId;
    }),
  );

  if (hasBerkanaInWin) {
    awardPointIfAvailable(state, winnerId, "Berkana bonus");
  }

  state.log.unshift(`${playerName(winnerId)} wins Round ${state.roundNumber}.`);
  evaluateMajorityWinner(state);
}

function finishRoundAsDraw(state, message) {
  state.winner = null;
  state.winningLine = null;
  state.isDraw = true;
  state.phase = "round-end";

  if (state.pointPoolRemaining > 0) {
    state.pointPoolRemaining -= 1;
    state.tieRemovedPoints += 1;
  }

  state.log.unshift(message);
  evaluateMajorityWinner(state);
}

function awardPointIfAvailable(state, playerId, reason) {
  if (state.pointPoolRemaining <= 0) {
    return;
  }

  state.players[playerId].points += 1;
  state.pointPoolRemaining -= 1;
  state.log.unshift(`${reason}: ${playerName(playerId)} gains 1 point.`);
}

function evaluateMajorityWinner(state) {
  const majorityThreshold = Math.floor((POINT_POOL_TOTAL - state.tieRemovedPoints) / 2) + 1;

  if (state.players[BLACK].points >= majorityThreshold) {
    state.gameWinner = BLACK;
    state.gameWinnerReason = "majority";
    state.phase = "game-over";
    state.log.unshift(`Black wins the game with majority points (${state.players[BLACK].points}).`);
  } else if (state.players[WHITE].points >= majorityThreshold) {
    state.gameWinner = WHITE;
    state.gameWinnerReason = "majority";
    state.phase = "game-over";
    state.log.unshift(`White wins the game with majority points (${state.players[WHITE].points}).`);
  }
}

function settleRound(state) {
  const preservedIsa = [];

  for (const playerId of [BLACK, WHITE]) {
    const player = state.players[playerId];
    player.bag.push(...player.hand);
    player.hand = [];
    player.selectedRuneInstanceId = null;
  }

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      const owner = state.board[row][col];
      const rune = state.boardRunes[row][col];

      if (owner === EMPTY || !rune) {
        continue;
      }

      if (rune.id === "isa" && owner !== NEUTRAL_OWNER) {
        preservedIsa.push({ owner, level: rune.level, col });
        continue;
      }

      if (owner === NEUTRAL_OWNER) {
        state.neutralSupply += 1;
        continue;
      }

      if (!rune.ethereal) {
        state.players[owner].bag.push(createRuneInstance(rune.id, rune.level));
      } else {
        state.players[owner].shopSupply.push(createRuneInstance(rune.id, rune.level));
      }
    }
  }

  for (const away of state.roundAwayRunes) {
    if (away.owner === NEUTRAL_OWNER) {
      state.neutralSupply += 1;
    } else {
      state.players[away.owner].bag.push(createRuneInstance(away.runeId, away.level));
    }
  }

  state.roundAwayRunes = [];
  state.board = createEmptyBoard(state.rows, state.columns);
  state.boardRunes = createRuneBoard(state.rows, state.columns);

  for (const isa of preservedIsa) {
    const placement = dropToken(state.board, isa.col, isa.owner);
    if (placement) {
      state.boardRunes[placement.row][placement.col] = {
        id: "isa",
        level: isa.level,
        ethereal: false,
        neutral: false,
      };
    }
  }
}

function finalizeGameAtZeroPoints(state) {
  const blackPoints = state.players[BLACK].points;
  const whitePoints = state.players[WHITE].points;

  if (blackPoints > whitePoints) {
    state.gameWinner = BLACK;
    state.gameWinnerReason = "points-supply-empty";
    state.log.unshift("Point supply is empty. Black wins on points.");
    return;
  }

  if (whitePoints > blackPoints) {
    state.gameWinner = WHITE;
    state.gameWinnerReason = "points-supply-empty";
    state.log.unshift("Point supply is empty. White wins on points.");
    return;
  }

  const blackBag = state.players[BLACK].bag.length;
  const whiteBag = state.players[WHITE].bag.length;

  if (blackBag < whiteBag) {
    state.gameWinner = BLACK;
    state.gameWinnerReason = "fewest-bag-runes";
    state.log.unshift("Point supply is empty and points are tied. Black wins with fewer bag runes.");
    return;
  }

  if (whiteBag < blackBag) {
    state.gameWinner = WHITE;
    state.gameWinnerReason = "fewest-bag-runes";
    state.log.unshift("Point supply is empty and points are tied. White wins with fewer bag runes.");
    return;
  }

  state.gameWinner = null;
  state.gameWinnerReason = "full-tie";
  state.log.unshift("Point supply is empty and all tie-breakers are equal. Game ends in full tie.");
}

function playerFromPointPool(pointPoolRemaining) {
  return pointPoolRemaining % 2 === 0 ? WHITE : BLACK;
}

function playerName(playerId) {
  return playerId === BLACK ? "Black" : "White";
}

function cellKey(row, col) {
  return `${row}:${col}`;
}

function isInside(state, row, col) {
  return row >= 0 && row < state.rows && col >= 0 && col < state.columns;
}
