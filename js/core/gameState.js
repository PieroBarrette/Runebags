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
const SHOP_REMOVE_LIMIT = 1;
const NON_COMBINABLE_RUNES = new Set(["basic", "inguz", "jera", "neutral", "berkana", "dagaz", "hagalz", "isa", "kenaz", "laguz", "wunjo", "nauthiz", "eihwaz"]);
const DAGAZ_ON_PLAY_COPYABLE = new Set(["raido", "sowelu", "teiwaz", "thurisa", "perth", "odal", "mannaz", "gebo", "ansuz", "fehu"]);
const DAGAZ_PASSIVE_COPYABLE = new Set(["laguz", "berkana", "ehwaz", "hagalz", "isa", "uruz", "wunjo", "eihwaz"]);

export function createInitialState(options = {}) {
  const black = createPlayer(BLACK, options);
  const white = createPlayer(WHITE, options);

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
    nextShopBonuses: createEmptyShopBonuses(),
    players: {
      1: black,
      2: white,
    },
    shop: createShopState(playerFromPointPool(POINT_POOL_TOTAL), createEmptyShopBonuses()),
    log: [{ k: "log.newGameStarted", p: { player: WHITE }, shop: false }],
  };

  initializeShopOffers(state);
  return state;
}

export function restoreState(candidate, options = {}) {
  if (!candidate || candidate.schemaVersion !== 5 || !candidate.boardRunes) {
    return createInitialState(options);
  }

  if (!candidate.shop) {
    candidate.shop = createShopState(candidate.currentPlayer || WHITE, createEmptyShopBonuses());
    initializeShopOffers(candidate);
  }

  if (!candidate.nextShopBonuses) {
    candidate.nextShopBonuses = createEmptyShopBonuses();
  }

  for (const playerId of [BLACK, WHITE]) {
    if (!candidate.shop.players?.[playerId]) {
      continue;
    }
    const data = candidate.shop.players[playerId];
    if (typeof data.ready !== "boolean") {
      data.ready = false;
    }
    if (typeof data.addLimit !== "number") {
      data.addLimit = SHOP_ADD_LIMIT;
    }
    if (typeof data.removeLimit !== "number") {
      data.removeLimit = SHOP_REMOVE_LIMIT;
    }
    if (typeof data.removeCount !== "number") {
      data.removeCount = data.removeUsed ? 1 : 0;
    }
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

export function playTurn(state, column, options = {}) {
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

  let move;
  if (selectedRune.id === "nauthiz") {
    const targetRow = Number(options.row);
    const targetCol = Number(options.col);
    if (
      !Number.isInteger(targetRow)
      || !Number.isInteger(targetCol)
      || !isInside(state, targetRow, targetCol)
      || state.board[targetRow][targetCol] !== EMPTY
    ) {
      return { state, error: "Choose an empty target cell for Nauthiz." };
    }

    move = placeFloatingRune(state, targetRow, targetCol, state.currentPlayer, selectedRune);
  } else if (selectedRune.id === "algiz") {
    const legalColumns = getLegalColumnsForRune(state, state.currentPlayer, selectedRune);
    if (!legalColumns.includes(column)) {
      return { state, error: `${selectedRune.name} cannot be played in column ${column + 1}.` };
    }

    move = insertRuneFromBottom(state, column, state.currentPlayer, selectedRune);
    if (!move) {
      return { state, error: "Algiz cannot be played in a full column." };
    }
  } else {
    const legalColumns = getLegalColumnsForRune(state, state.currentPlayer, selectedRune);
    if (!legalColumns.includes(column)) {
      return { state, error: `${selectedRune.name} cannot be played in column ${column + 1}.` };
    }

    move = dropTokenWithColumnPhysics(state, column, getOwnerForRune(selectedRune, state.currentPlayer));
    if (!move) {
      return { state, error: "That column is full." };
    }
    setRuneOnBoard(state, move, selectedRune);
  }

  consumeSelectedRune(state, player, selectedRune.instanceId);
  state.nextTurnConstraints[state.currentPlayer] = null;
  pushLog(state, "log.played", {
    turn: state.turnNumber,
    player: state.currentPlayer,
    rune: selectedRune.name,
    level: selectedRune.level,
    col: column + 1,
  });

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

  if (action.type === "fehu-recover") {
    if (!action.validAwayIndexes.includes(choice.awayIndex)) {
      return { state, error: "Choose one highlighted discarded rune for Fehu." };
    }

    const recoveredRune = recoverAwayRuneForFehu(state, action.playerId, choice.awayIndex);
    if (!recoveredRune) {
      return { state, error: "Selected discarded rune is no longer available." };
    }

    const recoveredCount = (action.recoveredCount || 0) + 1;
    const remaining = action.remainingRecovers - 1;
    const validAwayIndexes = getFehuSelectableAwayIndexes(state.roundAwayRunes);

    if (remaining > 0 && validAwayIndexes.length > 0) {
      state.pendingAction = {
        ...action,
        remainingRecovers: remaining,
        recoveredCount,
        validAwayIndexes,
      };
      state.log.unshift(getPendingActionPrompt(state));
      return { state, error: null };
    }

    pushLog(state, "log.fehuRecovered", { n: recoveredCount, player: action.playerId });
    const turnContext = action.turnContext;
    state.pendingAction = null;
    return finalizeTurn(state, turnContext.playerId, turnContext.extraTurn);
  }

  if (action.type === "gebo-l2-target") {
    const key = cellKey(choice.row, choice.col);
    const valid = new Set(action.validCells.map((cell) => cellKey(cell.row, cell.col)));
    if (!valid.has(key)) {
      return { state, error: "Choose an adjacent occupied rune for Gebo." };
    }

    const removed = removeRuneAt(state, choice.row, choice.col, "gebo", "round");
    if (removed) {
      pushLog(state, "log.geboRemovedChosen");
    }

    const turnContext = action.turnContext;
    state.pendingAction = null;
    return finalizeTurn(state, turnContext.playerId, turnContext.extraTurn);
  }

  if (action.type === "kenaz-destroy-target") {
    const key = cellKey(choice.row, choice.col);
    const valid = new Set(action.validCells.map((cell) => cellKey(cell.row, cell.col)));
    if (!valid.has(key)) {
      return { state, error: "Choose an occupied rune to destroy with Kenaz." };
    }

    const destroyed = removeRuneAt(state, choice.row, choice.col, "kenaz", "destroy");
    if (destroyed) {
      pushLog(state, "log.kenazDestroyed");
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
    pushLog(state, "log.perthForces", { player: action.opponentId, col: choice.column + 1 });

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

    pushLog(state, "log.teiwazMoved", { from: action.sourceCol + 1, to: choice.column + 1 });

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

    const placement = dropTokenWithColumnPhysics(state, choice.column, NEUTRAL_OWNER);
    if (!placement) {
      return { state, error: "That column is full for Thurisa placement." };
    }

    setRuneOnBoard(state, placement, createRuneInstance("neutral", 1));
    state.neutralSupply -= 1;
    pushLog(state, "log.thurisaPlaced", { col: choice.column + 1 });

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
  if (!state.pendingAction && state.phase === "round" && !state.gameWinner) {
    const selectedRune = getSelectedRuneForCurrentPlayer(state);
    if (selectedRune?.id === "nauthiz") {
      return {
        pending: true,
        mode: "cells",
        columns: [],
        cells: getFreeCells(state),
      };
    }
  }

  if (!state.pendingAction || state.phase !== "round") {
    return { pending: false, mode: null, columns: [], cells: [] };
  }

  const action = state.pendingAction;

  if (action.type === "gebo-l2-target" || action.type === "kenaz-destroy-target") {
    return { pending: true, mode: "cells", columns: [], cells: action.validCells };
  }

  if (action.type === "fehu-recover") {
    return { pending: true, mode: "away", columns: [], cells: [] };
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
  if (action.type === "gebo-l2-target" || action.type === "kenaz-destroy-target") {
    return action.validCells.map((cell) => ({ row: cell.row, col: cell.col, column: cell.col }));
  }

  if (action.type === "fehu-recover") {
    return action.validAwayIndexes.map((awayIndex) => ({ awayIndex }));
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
    if (rune.id === "nauthiz") {
      const cells = getFreeCells(state);
      cells.forEach((cell) => {
        moves.push({
          runeInstanceId: rune.instanceId,
          column: cell.col,
          row: cell.row,
          col: cell.col,
          runeId: rune.id,
          level: rune.level,
        });
      });
      return;
    }

    const legalColumns = getLegalColumnsForRune(state, playerId, rune);
    legalColumns.forEach((column) => {
      moves.push({ runeInstanceId: rune.instanceId, column, runeId: rune.id, level: rune.level });
    });
  });

  return moves;
}

export function getPendingActionPrompt(state) {
  if (!state.pendingAction) {
    return { k: "", p: null, shop: false };
  }

  const action = state.pendingAction;
  if (action.type === "gebo-l2-target") {
    return { k: "prompt.geboL2", p: null, shop: false };
  }
  if (action.type === "kenaz-destroy-target") {
    return { k: "prompt.kenaz", p: null, shop: false };
  }
  if (action.type === "fehu-recover") {
    return { k: "prompt.fehu", p: { remaining: action.remainingRecovers }, shop: false };
  }
  if (action.type === "perth-l2-column") {
    return { k: "prompt.perthL2", p: null, shop: false };
  }
  if (action.type === "teiwaz-source") {
    return { k: "prompt.teiwazSource", p: null, shop: false };
  }
  if (action.type === "teiwaz-target") {
    return { k: "prompt.teiwazTarget", p: null, shop: false };
  }
  if (action.type === "thurisa-drop") {
    return { k: "prompt.thurisa", p: { remaining: action.remainingDrops }, shop: false };
  }

  return { k: "prompt.fallback", p: null, shop: false };
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
  state.shop = createShopState(state.currentPlayer, state.nextShopBonuses);
  state.nextShopBonuses = createEmptyShopBonuses();
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

  // Shuffle bag contents after shop edits so round draws are randomized.
  state.players[BLACK].bag = shuffle([...state.players[BLACK].bag]);
  state.players[WHITE].bag = shuffle([...state.players[WHITE].bag]);

  state.shop = createShopState(playerFromPointPool(state.pointPoolRemaining), createEmptyShopBonuses());
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

  pushLog(
    state,
    state.pointPoolRemaining % 2 === 0 ? "log.roundBeginsEven" : "log.roundBeginsOdd",
    { round: state.roundNumber, player: state.currentPlayer },
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

  if (mode === "remove" && data.removeCount >= data.removeLimit) {
    return { state, error: "Remove limit already reached this shop phase." };
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
    if (data.removeCount >= data.removeLimit) {
      return { state, error: "Remove limit already reached this shop phase." };
    }

    removeRuneFromBag(state, playerId, rune.instanceId);
    data.removeCount += 1;
    data.mode = null;

    if ((rune.capturedOwner === BLACK || rune.capturedOwner === WHITE) && rune.capturedOwner !== playerId) {
      pushLog(state, "log.shopRemovedCaptured", { player: playerId, rune: rune.name, owner: rune.capturedOwner }, true);
      return { state, error: null };
    }

    if (rune.id === "neutral") {
      state.neutralSupply += 1;
      state.log.unshift(`${playerName(playerId)} removed a Neutral rune. It returned to supply.`);
    } else if (rune.id === "basic") {
      state.log.unshift(`${playerName(playerId)} removed a Basic rune permanently.`);
    } else if (rune.id === "inguz" || rune.id === "jera") {
      player.shopSupply.push(createRuneInstance(rune.id, rune.level));
      state.log.unshift(
        `${playerName(playerId)} removed ${rune.name} and returned it to their shop supply.`,
      );
    } else {
      pushLog(state, "log.shopRemovedPermanently", { player: playerId, rune: rune.name }, true);
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

  if (data.addedCount >= data.addLimit) {
    return { state, error: `You can only add up to ${data.addLimit} runes from shop offer.` };
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
    offerHighlightIds: data.addedCount >= data.addLimit ? [] : data.offer.map((rune) => rune.instanceId),
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
    removeVisible: data.removeCount < data.removeLimit,
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

      if (cellHasPassiveRuneId(state, row, col, "uruz")) {
        forced[getOpponent(owner)] = true;
      }
    }
  }

  return forced;
}

export function getPlayerName(playerId) {
  return playerName(playerId);
}

function createPlayer(id, options = {}) {
  const allowedSpecialRuneIds = Array.isArray(options.allowedSpecialRuneIds)
    ? options.allowedSpecialRuneIds
    : null;

  return {
    id,
    points: 0,
    bag: shuffle(createStarterBag(allowedSpecialRuneIds)),
    hand: [],
    discard: [],
    selectedRuneInstanceId: null,
    shopSupply: createInitialShopSupply(allowedSpecialRuneIds),
  };
}

function createInitialShopSupply(allowedSpecialRuneIds = null) {
  const allowedSet = allowedSpecialRuneIds ? new Set(allowedSpecialRuneIds) : null;
  const supply = [];
  Object.entries(INITIAL_SHOP_COUNTS).forEach(([runeId, count]) => {
    if (allowedSet && !allowedSet.has(runeId)) {
      return;
    }
    for (let i = 0; i < count; i += 1) {
      supply.push(createRuneInstance(runeId, 1));
    }
  });
  return supply;
}

function createShopState(currentPlayer, nextShopBonuses) {
  const bonuses = nextShopBonuses || createEmptyShopBonuses();
  const p1Bonus = bonuses[1] || { extraAdds: 0, extraRemoves: 0 };
  const p2Bonus = bonuses[2] || { extraAdds: 0, extraRemoves: 0 };

  return {
    currentPlayer,
    view: "bag",
    players: {
      1: {
        offer: [],
        addedCount: 0,
        addLimit: SHOP_ADD_LIMIT + Math.max(0, Number(p1Bonus.extraAdds) || 0),
        removeCount: 0,
        removeLimit: SHOP_REMOVE_LIMIT + Math.max(0, Number(p1Bonus.extraRemoves) || 0),
        ready: false,
        mode: null,
        combineSelection: [],
      },
      2: {
        offer: [],
        addedCount: 0,
        addLimit: SHOP_ADD_LIMIT + Math.max(0, Number(p2Bonus.extraAdds) || 0),
        removeCount: 0,
        removeLimit: SHOP_REMOVE_LIMIT + Math.max(0, Number(p2Bonus.extraRemoves) || 0),
        ready: false,
        mode: null,
        combineSelection: [],
      },
    },
  };
}

function createEmptyShopBonuses() {
  return {
    1: { extraAdds: 0, extraRemoves: 0 },
    2: { extraAdds: 0, extraRemoves: 0 },
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
  if (!["algiz", "gebo", "raido", "teiwaz", "nauthiz"].includes(rune.id)) {
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
  if (rune.id === "neutral") {
    return NEUTRAL_OWNER;
  }

  if (rune.capturedOwner === BLACK || rune.capturedOwner === WHITE) {
    return rune.capturedOwner;
  }

  return playerId;
}

function consumeSelectedRune(state, player, runeInstanceId) {
  const index = player.hand.findIndex((rune) => rune.instanceId === runeInstanceId);
  if (index < 0) {
    return;
  }

  const [usedRune] = player.hand.splice(index, 1);
  player.selectedRuneInstanceId = null;

  if (isRuneEthereal(usedRune)) {
    pushLog(state, "log.etherealReturns", { rune: usedRune.name });
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
      const copiedEhwaz = getPassiveRuneAt(state, row, col, "ehwaz");
      if (!rune || owner !== playerId || !copiedEhwaz) {
        continue;
      }

      maxSize = Math.max(maxSize, copiedEhwaz.level >= 2 ? 4 : 3);
    }
  }

  return maxSize;
}

function getLegalColumnsForRune(state, playerId, rune) {
  const availableColumns = rune.id === "algiz"
    ? getAlgizAvailableColumns(state)
    : getAvailableColumns(state.board);
  const allowedColumns = getAllowedColumns(rune, state.columns);
  const constrainedColumns = getConstrainedColumns(state, playerId, availableColumns);
  return availableColumns.filter(
    (col) => allowedColumns.includes(col)
      && constrainedColumns.includes(col),
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
  pushLog(state, "log.mustPass", { player: current });

  if (!opponentCanPlay) {
    finishRoundAsDraw(state, "Both players cannot play any rune. Round is a draw.");
    return { state, error: null };
  }

  state.currentPlayer = opponent;
  state.turnNumber += 1;
  pushLog(state, "log.toPlay", { player: opponent });
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
  const startRow = getLowestLaguzBarrierRow(state, column) + 1;
  if (startRow >= state.rows) {
    return null;
  }

  let hasEmptyInSegment = false;
  for (let row = startRow; row < state.rows; row += 1) {
    if (state.board[row][column] === EMPTY) {
      hasEmptyInSegment = true;
      break;
    }
  }

  if (!hasEmptyInSegment) {
    return null;
  }

  for (let row = startRow; row < state.rows - 1; row += 1) {
    state.board[row][column] = state.board[row + 1][column];
    state.boardRunes[row][column] = state.boardRunes[row + 1][column];
  }

  const move = { row: state.rows - 1, col: column };
  state.board[move.row][move.col] = getOwnerForRune(rune, playerId);
  setRuneOnBoard(state, move, rune);
  return move;
}

function placeFloatingRune(state, row, col, playerId, rune) {
  if (state.board[row][col] !== EMPTY) {
    return null;
  }

  state.board[row][col] = getOwnerForRune(rune, playerId);
  const move = { row, col };
  setRuneOnBoard(state, move, rune);
  return move;
}

function applyRuneEffect(state, rune, move, playerId) {
  const notes = [];
  let extraTurn = false;
  let pendingAction = null;

  if (rune.id === "dagaz") {
    if (state.neutralSupply > 0) {
      state.players[playerId].bag.push(createRuneInstance("neutral", 1));
      state.neutralSupply -= 1;
      notes.push({ k: "log.dagazAdded", p: null });
    } else {
      notes.push({ k: "log.dagazNoAdd", p: null });
    }
  }

  const copiedOnPlayRune = resolveDagazOnPlayRune(state, rune, move);
  const effectRune = copiedOnPlayRune || rune;

  if (rune.id === "dagaz" && copiedOnPlayRune) {
    notes.push({ k: "log.dagazCopied", p: { rune: copiedOnPlayRune.name } });
  }

  if (effectRune.id === "fehu") {
    const recoverCount = effectRune.level >= 2 ? 2 : 1;
    const validAwayIndexes = getFehuSelectableAwayIndexes(state.roundAwayRunes);
    if (validAwayIndexes.length > 0) {
      pendingAction = {
        type: "fehu-recover",
        playerId,
        remainingRecovers: Math.min(recoverCount, validAwayIndexes.length),
        recoveredCount: 0,
        validAwayIndexes,
      };
    }
  }

  if (effectRune.id === "odal" && move.row === 0) {
    const gained = awardPointAndCheckGameEnd(state, playerId, "reason.odalTop");
    if (gained) {
      notes.push({ k: "log.odalPoint", p: null });
    } else {
      notes.push({ k: "log.odalNoPoint", p: null });
    }
  }

  if (effectRune.id === "ansuz") {
    const targetRow = move.row + 1;
    const targetCol = move.col;
    if (isInside(state, targetRow, targetCol) && state.board[targetRow][targetCol] !== NEUTRAL_OWNER) {
      const removed = removeRuneAt(state, targetRow, targetCol, "ansuz", "immediate");
      if (removed) {
        notes.push({ k: "log.ansuzReturned", p: null });
      }
    }
  }

  if (effectRune.id === "gebo") {
    if (effectRune.level >= 2) {
      const validCells = getAdjacentOccupiedCells(state, move.row, move.col)
        .filter((cell) => !cellHasPassiveRuneId(state, cell.row, cell.col, "laguz"));
      if (validCells.length > 0) {
        pendingAction = {
          type: "gebo-l2-target",
          playerId,
          validCells,
        };
      }
    } else {
      const targetRow = findFirstOccupiedBelow(state, move.row, move.col);
      const removed = targetRow === null
        ? null
        : removeRuneAt(state, targetRow, move.col, "gebo", "round");
      if (removed) {
        notes.push({ k: "log.geboRemovedBelow", p: null });
      }
    }
  }

  if (effectRune.id === "kenaz") {
    const ownedKenazCount = countOwnedRuneOnBoard(state, playerId, "kenaz");
    if (ownedKenazCount === 2) {
      const validCells = getOccupiedCells(state);
      if (validCells.length > 0) {
        pendingAction = {
          type: "kenaz-destroy-target",
          playerId,
          validCells,
        };
      }
    }
  }

  if (effectRune.id === "mannaz") {
    const addCount = effectRune.level >= 2 ? 2 : 1;
    let added = 0;

    for (let i = 0; i < addCount; i += 1) {
      if (state.neutralSupply <= 0) {
        break;
      }
      state.players[getOpponent(playerId)].bag.push(createRuneInstance("neutral", 1));
      state.neutralSupply -= 1;
      added += 1;
    }

    if (added > 0) {
      notes.push({ k: "log.mannazAdded", p: { n: added } });
    }
  }

  if (effectRune.id === "perth") {
    const opponentId = getOpponent(playerId);
    const adjacent = getAdjacentColumns(move.col, state.columns);

    if (effectRune.level >= 2) {
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
      notes.push({ k: "log.perthForcesAdjacent", p: null });
    }
  }

  if (effectRune.id === "raido") {
    extraTurn = true;
    notes.push({ k: "log.raidoExtra", p: null });
  }

  if (effectRune.id === "sowelu") {
    const discardCount = effectRune.level >= 2 ? 2 : 1;
    const opponent = state.players[getOpponent(playerId)];
    let discarded = 0;

    for (let i = 0; i < discardCount; i += 1) {
      if (opponent.bag.length === 0) {
        break;
      }
      const index = Math.floor(Math.random() * opponent.bag.length);
      const [removed] = opponent.bag.splice(index, 1);
      sendRuneAwayForRound(state, opponent.id, removed.id, removed.level, "sowelu");
      discarded += 1;
    }

    if (discarded > 0) {
      notes.push({ k: "log.soweluRemoved", p: { n: discarded } });
    }
  }

  if (effectRune.id === "teiwaz") {
    const mode = effectRune.level >= 2 ? "any" : "adjacent";
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

  if (effectRune.id === "thurisa") {
    const remainingDrops = Math.min(effectRune.level >= 2 ? 2 : 1, state.neutralSupply);
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

function getOccupiedCells(state) {
  const cells = [];
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      if (state.board[row][col] !== EMPTY && state.boardRunes[row][col]) {
        cells.push({ row, col });
      }
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

  if (returnMode !== "destroy" && cellHasPassiveRuneId(state, row, col, "laguz")) {
    return null;
  }

  const removedAsEihwaz = cellHasPassiveRuneId(state, row, col, "eihwaz");

  state.board[row][col] = EMPTY;
  state.boardRunes[row][col] = null;
  compactColumn(state, col);

  if (returnMode === "destroy") {
    if (owner === NEUTRAL_OWNER) {
      state.neutralSupply += 1;
    }
    return { owner, rune };
  }

  if (returnMode === "immediate") {
    if (owner !== NEUTRAL_OWNER) {
      state.players[owner].bag.push(createRuneInstance(rune.id, rune.level));
    }
    return { owner, rune };
  }

  sendRuneAwayForRound(state, owner, rune.id, rune.level, source);
  if (removedAsEihwaz && rune.id !== "eihwaz" && (owner === BLACK || owner === WHITE)) {
    awardPointAndCheckGameEnd(state, owner, "reason.eihwaz");
  }

  return { owner, rune };
}

function sendRuneAwayForRound(state, owner, runeId, level, source) {
  state.roundAwayRunes.push({
    owner,
    runeId,
    level,
    source,
  });

  if ((owner === BLACK || owner === WHITE) && runeId === "eihwaz") {
    awardPointAndCheckGameEnd(state, owner, "reason.eihwaz");
  }
}

function recoverAwayRuneForFehu(state, playerId, awayIndex) {
  if (!Array.isArray(state.roundAwayRunes) || state.roundAwayRunes.length === 0) {
    return null;
  }

  if (!Number.isInteger(awayIndex) || awayIndex < 0 || awayIndex >= state.roundAwayRunes.length) {
    return null;
  }

  const [away] = state.roundAwayRunes.splice(awayIndex, 1);
  const restored = createRuneInstance(away.runeId, away.level);
  if (!restored) {
    return null;
  }

  if ((away.owner === BLACK || away.owner === WHITE) && away.owner !== playerId) {
    restored.capturedOwner = away.owner;
  }

  state.players[playerId].bag.push(restored);
  return restored;
}

function getFehuSelectableAwayIndexes(roundAwayRunes) {
  if (!Array.isArray(roundAwayRunes)) {
    return [];
  }

  const indexes = [];
  roundAwayRunes.forEach((entry, index) => {
    if (entry.owner === NEUTRAL_OWNER || entry.owner === BLACK || entry.owner === WHITE) {
      indexes.push(index);
    }
  });
  return indexes;
}

function compactColumn(state, column) {
  const nauthizFloor = getNauthizFloorRow(state, column);
  const compactStart = nauthizFloor + 1;
  if (compactStart >= state.rows) {
    return;
  }

  const pieces = [];

  for (let row = state.rows - 1; row >= compactStart; row -= 1) {
    const owner = state.board[row][column];
    const rune = state.boardRunes[row][column];
    if (owner !== EMPTY && rune) {
      pieces.push({ owner, rune });
    }
  }

  for (let row = state.rows - 1; row >= compactStart; row -= 1) {
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

    if (cellHasPassiveRuneId(state, sourceRow, col, "laguz")) {
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

  if (cellHasPassiveRuneId(state, sourceRow, sourceCol, "laguz")) {
    return false;
  }

  state.board[sourceRow][sourceCol] = EMPTY;
  state.boardRunes[sourceRow][sourceCol] = null;
  compactColumn(state, sourceCol);

  const placement = dropTokenWithColumnPhysics(state, targetCol, owner);
  if (!placement) {
    return false;
  }

  state.boardRunes[placement.row][placement.col] = rune;
  return true;
}

function getAlgizAvailableColumns(state) {
  const columns = [];
  for (let col = 0; col < state.columns; col += 1) {
    if (canInsertAlgizInColumn(state, col)) {
      columns.push(col);
    }
  }

  return columns;
}

function canInsertAlgizInColumn(state, column) {
  const laguzBarrierRow = getLowestLaguzBarrierRow(state, column);
  for (let row = laguzBarrierRow + 1; row < state.rows; row += 1) {
    if (state.board[row][column] === EMPTY) {
      return true;
    }
  }

  return false;
}

function getLowestLaguzBarrierRow(state, column) {
  let barrierRow = -1;
  for (let row = 0; row < state.rows; row += 1) {
    if (cellHasPassiveRuneId(state, row, column, "laguz")) {
      barrierRow = row;
    }
  }

  return barrierRow;
}

function getNauthizFloorRow(state, column) {
  let floor = -1;
  for (let row = 0; row < state.rows; row += 1) {
    const rune = state.boardRunes[row][column];
    if (rune?.id === "nauthiz") {
      floor = row;
    }
  }
  return floor;
}

function dropTokenWithColumnPhysics(state, column, playerId) {
  if (column < 0 || column >= state.columns) {
    return null;
  }

  if (state.board[0][column] !== EMPTY) {
    return null;
  }

  for (let row = 1; row < state.rows; row += 1) {
    if (state.board[row][column] !== EMPTY) {
      const landingRow = row - 1;
      state.board[landingRow][column] = playerId;
      return { row: landingRow, col: column };
    }
  }

  const landingRow = state.rows - 1;
  state.board[landingRow][column] = playerId;
  return { row: landingRow, col: column };
}

function findTopOccupiedRow(state, column) {
  for (let row = 0; row < state.rows; row += 1) {
    if (state.board[row][column] !== EMPTY) {
      return row;
    }
  }

  return null;
}

function findFirstOccupiedBelow(state, row, column) {
  for (let nextRow = row + 1; nextRow < state.rows; nextRow += 1) {
    if (state.board[nextRow][column] !== EMPTY) {
      return nextRow;
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
  if (state.phase === "game-over") {
    return { state, error: null };
  }

  const winningLinesByPlayer = getWinningLinesByPlayer(state);
  const winners = Object.keys(winningLinesByPlayer).map((playerId) => Number(playerId));

  if (winners.length === 1) {
    const winnerId = winners[0];
    finishRoundWithWinner(state, winnerId, winningLinesByPlayer[winnerId]);
    return { state, error: null };
  }

  if (winners.length > 1) {
    const highlightedLines = winners.flatMap((winnerId) => winningLinesByPlayer[winnerId]);
    finishRoundAsDraw(state, { k: "log.drawBothWin", p: null, shop: false }, highlightedLines);
    return { state, error: null };
  }

  if (isBoardFull(state.board)) {
    finishRoundAsDraw(state, { k: "log.drawBoardFull", p: null, shop: false });
    return { state, error: null };
  }

  ensureHand(state.players[activePlayerId], getMaxHandSize(state, activePlayerId));
  state.currentPlayer = extraTurn ? activePlayerId : getOpponent(activePlayerId);
  state.turnNumber += 1;

  const passResult = forcePassIfNeeded(state);
  if (passResult.error) {
    return passResult;
  }

  pushLog(
    state,
    extraTurn ? "log.extraTurn" : "log.toPlay",
    { player: state.currentPlayer },
  );

  return { state, error: null };
}

function getWinningLinesByPlayer(state) {
  const linesByPlayer = {};

  for (const playerId of [BLACK, WHITE]) {
    const lines = findWinningLines(state, playerId);
    if (lines.length > 0) {
      linesByPlayer[playerId] = lines;
    }
  }

  return linesByPlayer;
}

function findWinningLines(state, playerId) {
  const windows = [];
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
          windows.push({ cells, dr, dc });
        }
      }
    }
  }

  return mergeWinningWindows(windows);
}

function mergeWinningWindows(windows) {
  const groups = new Map();

  for (const window of windows) {
    const [startRow, startCol] = window.cells[0];
    const lineId = getWinningLineId(window.dr, window.dc, startRow, startCol);
    const group = groups.get(lineId) || {
      dr: window.dr,
      dc: window.dc,
      cellsByKey: new Map(),
    };

    for (const [row, col] of window.cells) {
      group.cellsByKey.set(cellKey(row, col), [row, col]);
    }

    groups.set(lineId, group);
  }

  const merged = [];
  const seenSegments = new Set();

  for (const group of groups.values()) {
    const orderedCells = [...group.cellsByKey.values()].sort((a, b) => {
      const aProjection = a[0] * group.dr + a[1] * group.dc;
      const bProjection = b[0] * group.dr + b[1] * group.dc;
      return aProjection - bProjection;
    });

    let segment = [];
    for (const cell of orderedCells) {
      if (segment.length === 0) {
        segment.push(cell);
        continue;
      }

      const [prevRow, prevCol] = segment[segment.length - 1];
      if (cell[0] - prevRow === group.dr && cell[1] - prevCol === group.dc) {
        segment.push(cell);
        continue;
      }

      addWinningSegmentIfNeeded(segment, merged, seenSegments);
      segment = [cell];
    }

    addWinningSegmentIfNeeded(segment, merged, seenSegments);
  }

  return merged;
}

function addWinningSegmentIfNeeded(segment, merged, seenSegments) {
  if (segment.length < 4) {
    return;
  }

  const segmentKey = segment.map(([row, col]) => `${row}:${col}`).join("|");
  if (seenSegments.has(segmentKey)) {
    return;
  }

  seenSegments.add(segmentKey);
  merged.push(segment);
}

function getWinningLineId(dr, dc, row, col) {
  if (dr === 0 && dc === 1) {
    return `h:${row}`;
  }

  if (dr === 1 && dc === 0) {
    return `v:${col}`;
  }

  if (dr === 1 && dc === 1) {
    return `d1:${row - col}`;
  }

  return `d2:${row + col}`;
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

      if (cellHasPassiveRuneId(state, nextRow, nextCol, "hagalz")) {
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

function finishRoundWithWinner(state, winnerId, winningLines) {
  state.winner = winnerId;
  state.phase = "round-end";
  state.winningLine = getUniqueWinningCells(winningLines);

  awardPointIfAvailable(state, winnerId, "reason.roundWin");

  const hasBerkanaInWin = winningLines.some((line) =>
    line.some(([row, col]) => {
      const owner = state.board[row][col];
      return owner === winnerId && cellHasPassiveRuneId(state, row, col, "berkana");
    }),
  );

  if (hasBerkanaInWin) {
    awardPointIfAvailable(state, winnerId, "reason.berkana");
  }

  pushLog(state, "log.winsRound", { player: winnerId, round: state.roundNumber });
  evaluateMajorityWinner(state);
}

function finishRoundAsDraw(state, message, highlightedLines = []) {
  state.winner = null;
  state.winningLine = highlightedLines.length > 0 ? getUniqueWinningCells(highlightedLines) : null;
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
  pushLog(state, "log.pointGain", { reasonKey: reason, player: playerId });
}

function awardPointAndCheckGameEnd(state, playerId, reason) {
  if (state.pointPoolRemaining <= 0) {
    evaluateMajorityWinner(state);
    if (!state.gameWinner && state.pointPoolRemaining <= 0) {
      finalizeGameAtZeroPoints(state);
      state.phase = "game-over";
    }
    return false;
  }

  awardPointIfAvailable(state, playerId, reason);
  evaluateMajorityWinner(state);
  if (!state.gameWinner && state.pointPoolRemaining <= 0) {
    finalizeGameAtZeroPoints(state);
    state.phase = "game-over";
  }
  return true;
}

function getUniqueWinningCells(lines) {
  const cellsByKey = new Map();

  for (const line of lines || []) {
    for (const [row, col] of line) {
      cellsByKey.set(cellKey(row, col), [row, col]);
    }
  }

  return [...cellsByKey.values()];
}

function evaluateMajorityWinner(state) {
  const majorityThreshold = Math.floor((POINT_POOL_TOTAL - state.tieRemovedPoints) / 2) + 1;

  if (state.players[BLACK].points >= majorityThreshold) {
    state.gameWinner = BLACK;
    state.gameWinnerReason = "majority";
    state.phase = "game-over";
    pushLog(state, "log.gameMajority", { player: BLACK, points: state.players[BLACK].points });
  } else if (state.players[WHITE].points >= majorityThreshold) {
    state.gameWinner = WHITE;
    state.gameWinnerReason = "majority";
    state.phase = "game-over";
    pushLog(state, "log.gameMajority", { player: WHITE, points: state.players[WHITE].points });
  }
}

function settleRound(state) {
  applyWunjoShopBonuses(state);

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

      if (owner !== NEUTRAL_OWNER && cellHasPassiveRuneId(state, row, col, "isa")) {
        preservedIsa.push({ owner, runeId: rune.id, level: rune.level, col });
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
        id: isa.runeId,
        level: isa.level,
        ethereal: false,
        neutral: false,
      };
    }
  }
}

function countOwnedRuneOnBoard(state, ownerId, runeId) {
  let count = 0;
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      if (state.board[row][col] === ownerId && state.boardRunes[row][col]?.id === runeId) {
        count += 1;
      }
    }
  }
  return count;
}

function finalizeGameAtZeroPoints(state) {
  const blackPoints = state.players[BLACK].points;
  const whitePoints = state.players[WHITE].points;

  if (blackPoints > whitePoints) {
    state.gameWinner = BLACK;
    state.gameWinnerReason = "points-supply-empty";
    pushLog(state, "log.supplyEmptyWins", { player: BLACK });
    return;
  }

  if (whitePoints > blackPoints) {
    state.gameWinner = WHITE;
    state.gameWinnerReason = "points-supply-empty";
    pushLog(state, "log.supplyEmptyWins", { player: WHITE });
    return;
  }

  const blackBag = state.players[BLACK].bag.length;
  const whiteBag = state.players[WHITE].bag.length;

  if (blackBag < whiteBag) {
    state.gameWinner = BLACK;
    state.gameWinnerReason = "fewest-bag-runes";
    pushLog(state, "log.supplyTieFewerBag", { player: BLACK });
    return;
  }

  if (whiteBag < blackBag) {
    state.gameWinner = WHITE;
    state.gameWinnerReason = "fewest-bag-runes";
    pushLog(state, "log.supplyTieFewerBag", { player: WHITE });
    return;
  }

  state.gameWinner = null;
  state.gameWinnerReason = "full-tie";
  pushLog(state, "log.fullTie");
}

function applyWunjoShopBonuses(state) {
  if (!state.nextShopBonuses) {
    state.nextShopBonuses = createEmptyShopBonuses();
  }

  const granted = new Set();

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      const owner = state.board[row][col];
      if ((owner !== BLACK && owner !== WHITE) || !cellHasPassiveRuneId(state, row, col, "wunjo")) {
        continue;
      }

      if (hasAdjacentAlliedRune(state, row, col, owner)) {
        continue;
      }

      const bonus = ensureShopBonusEntry(state, owner);
      bonus.extraAdds += 1;
      bonus.extraRemoves += 1;
      granted.add(owner);
    }
  }

  for (const playerId of granted) {
    pushLog(state, "log.wunjoBonus", { player: playerId });
  }
}

function hasAdjacentAlliedRune(state, row, col, owner) {
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

      if (state.board[nextRow][nextCol] === owner) {
        return true;
      }
    }
  }

  return false;
}

function getSelectedRuneForCurrentPlayer(state) {
  if (state.phase !== "round") {
    return null;
  }

  const player = state.players[state.currentPlayer];
  if (!player || !player.selectedRuneInstanceId) {
    return null;
  }

  return player.hand.find((rune) => rune.instanceId === player.selectedRuneInstanceId) || null;
}

function getFreeCells(state) {
  const cells = [];
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      if (state.board[row][col] === EMPTY) {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

function ensureShopBonusEntry(state, playerId) {
  if (!state.nextShopBonuses[playerId]) {
    state.nextShopBonuses[playerId] = { extraAdds: 0, extraRemoves: 0 };
  }
  return state.nextShopBonuses[playerId];
}

function resolveDagazCopiedRuneAt(state, row, col) {
  if (!isInside(state, row, col)) {
    return null;
  }

  let scanRow = row + 1;
  while (scanRow < state.rows) {
    const nextRune = state.boardRunes[scanRow]?.[col] || null;
    if (!nextRune) {
      return null;
    }
    if (nextRune.id !== "dagaz") {
      return nextRune;
    }
    scanRow += 1;
  }

  return null;
}

function resolveDagazOnPlayRune(state, placedRune, move) {
  if (!placedRune || placedRune.id !== "dagaz") {
    return null;
  }

  const copied = resolveDagazCopiedRuneAt(state, move.row, move.col);
  if (!copied || !DAGAZ_ON_PLAY_COPYABLE.has(copied.id)) {
    return null;
  }

  return copied;
}

function cellHasPassiveRuneId(state, row, col, targetId) {
  return Boolean(getPassiveRuneAt(state, row, col, targetId));
}

function getPassiveRuneAt(state, row, col, targetId) {
  const rune = state.boardRunes[row]?.[col] || null;
  if (!rune) {
    return null;
  }

  if (rune.id === targetId) {
    return rune;
  }

  if (rune.id !== "dagaz") {
    return null;
  }

  const copied = resolveDagazCopiedRuneAt(state, row, col);
  return copied && DAGAZ_PASSIVE_COPYABLE.has(copied.id) && copied.id === targetId
    ? copied
    : null;
}

function playerFromPointPool(pointPoolRemaining) {
  return pointPoolRemaining % 2 === 0 ? WHITE : BLACK;
}

function playerName(playerId) {
  return playerId === BLACK ? "Black" : "White";
}

// Push a structured, translatable log entry. Kept as plain data (no i18n
// import) so this engine stays usable by the Node server. The client
// formats entries via formatLogEntry(); shop entries are filtered from the
// turn log. Legacy string entries remain supported by the client formatter.
function pushLog(state, k, p = null, shop = false) {
  state.log.unshift({ k, p, shop });
}

function cellKey(row, col) {
  return `${row}:${col}`;
}

function isInside(state, row, col) {
  return row >= 0 && row < state.rows && col >= 0 && col < state.columns;
}
