// The canonical online action dispatcher, shared by the authoritative server
// and the replay viewer. It lived in server.mjs; it was moved here verbatim so
// a recorded game re-simulates through exactly the same code that produced it.
// Any divergence between the two would desync replays silently.
import {
  enterShopPhase,
  playTurn,
  resolvePendingBoardChoice,
  selectRune,
  setShopMode,
  shopSelectBagRune,
  shopSelectOfferRune,
  startRoundFromShop,
  switchShopPlayer,
} from "./gameState.js";

export function applyAction(state, playerId, actionType, payload) {
  if (actionType === "select_rune") {
    return selectRune(state, playerId, payload.runeInstanceId);
  }

  if (actionType === "board_click") {
    if (state.pendingAction) {
      if (!isPendingChooser(state, playerId)) {
        return { state, error: "Only the acting player can resolve this pending action.", errorKey: "err.notPendingChooser" };
      }
      return resolvePendingBoardChoice(state, {
        row: Number(payload.row),
        col: Number(payload.col),
        column: Number(payload.column),
        awayIndex: Number(payload.awayIndex),
      });
    }
    if (state.currentPlayer !== playerId) {
      return { state, error: "Not your turn.", errorKey: "err.notYourTurn" };
    }
    return playTurn(state, Number(payload.column));
  }

  if (actionType === "phase_action") {
    if (state.phase === "round-end") {
      return enterShopPhase(state);
    }
    if (state.phase === "shop") {
      return startRoundFromShop(state);
    }
    return { state, error: "Phase action is not available.", errorKey: "err.phaseActionUnavailable" };
  }

  if (actionType === "shop_ready") {
    if (state.phase !== "shop") {
      return { state, error: "Shop ready is only available in shop phase.", errorKey: "err.shopReadyOnly" };
    }
    return { state, error: null };
  }

  if (actionType === "shop_switch_player") {
    if (state.phase !== "shop") {
      return { state, error: "Cannot switch shop player now.", errorKey: "err.cannotSwitchShopPlayer" };
    }
    const original = state.shop.currentPlayer;
    state.shop.currentPlayer = playerId;
    const result = switchShopPlayer(state);
    state.shop.currentPlayer = original;
    return result;
  }

  if (actionType === "shop_set_mode") {
    if (state.phase !== "shop") {
      return { state, error: "Cannot set shop mode now.", errorKey: "err.cannotSetShopMode" };
    }
    const original = state.shop.currentPlayer;
    state.shop.currentPlayer = playerId;
    const result = setShopMode(state, payload.mode ?? null);
    state.shop.currentPlayer = original;
    return result;
  }

  if (actionType === "shop_bag_select") {
    if (state.phase !== "shop") {
      return { state, error: "Cannot pick bag rune now.", errorKey: "err.cannotPickBagRune" };
    }
    const original = state.shop.currentPlayer;
    state.shop.currentPlayer = playerId;
    const result = shopSelectBagRune(state, payload.runeInstanceId);
    state.shop.currentPlayer = original;
    return result;
  }

  if (actionType === "shop_offer_select") {
    if (state.phase !== "shop") {
      return { state, error: "Cannot pick offer rune now.", errorKey: "err.cannotPickOfferRune" };
    }
    const original = state.shop.currentPlayer;
    state.shop.currentPlayer = playerId;
    const result = shopSelectOfferRune(state, payload.runeInstanceId);
    state.shop.currentPlayer = original;
    return result;
  }

  return { state, error: `Unknown action type: ${actionType}`, errorKey: "err.unknownActionType", errorParams: { type: actionType } };
}

export function isPendingChooser(state, playerId) {
  const action = state.pendingAction;
  if (!action) {
    return state.currentPlayer === playerId;
  }
  if (typeof action.playerId === "number") {
    return action.playerId === playerId;
  }
  if (action.turnContext && typeof action.turnContext.playerId === "number") {
    return action.turnContext.playerId === playerId;
  }
  return state.currentPlayer === playerId;
}

// Running out of time ends the game outside the rules engine, so it is applied
// through one shared helper: the server calls it live, and a recorded "forfeit"
// entry replays it identically rather than leaving a replay that disagrees with
// the stored result.
export function applyForfeit(state, losingPlayerId) {
  state.gameWinner = losingPlayerId === 1 ? 2 : 1;
  state.gameWinnerReason = "timeout";
  state.winner = null;
  state.phase = "game-over";
  state.pendingAction = null;
  return { state, error: null };
}

// Replay-side counterpart. Two recorded entries need special handling:
// `shop_round_start` is the server-initiated transition once both players are
// ready (playerId 0), and `shop_ready` is room bookkeeping that never touches
// the game state.
export function applyRecordedAction(state, entry) {
  if (entry.actionType === "shop_round_start") {
    return startRoundFromShop(state);
  }
  if (entry.actionType === "shop_ready") {
    return { state, error: null };
  }
  if (entry.actionType === "forfeit") {
    return applyForfeit(state, entry.playerId);
  }
  return applyAction(state, entry.playerId, entry.actionType, entry.payload || {});
}
