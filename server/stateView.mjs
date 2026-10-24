// What each player is sent of a game in progress. The server keeps the whole
// state; a player's copy leaves out the opponent's hand (unless Uruz lays it
// open), what the opponent's bag holds, the order of the player's own bag,
// and the random stream. Any of those, read off the socket or out of the
// developer tools, would show hidden runes or predict the next draws. A
// finished game is sent whole: the end card shows both bags.
import { createHash, randomBytes } from "node:crypto";
import { getForcedVisiblePlayers } from "../js/core/gameState.js";

// Hidden runes keep an id of their own, stable from one snapshot to the next
// (so the client sees a rune leave the hand and another arrive) but opaque:
// an engine id names its rune ("raido-12"). The key survives a restart when
// DATA_SECRET is set; otherwise ids change once, which only costs an
// animation.
const SECRET = String(process.env.DATA_SECRET || "") || randomBytes(32).toString("hex");

export function stateViewFor(state, playerId, roomCode = "") {
  if (!state || !playerId || state.phase === "game-over") {
    return state;
  }

  const view = structuredClone(state);
  const opponentId = playerId === 1 ? 2 : 1;
  const opponent = view.players[opponentId];
  const hiddenId = (instanceId) => `hidden-${createHash("sha256").update(`${SECRET}:${roomCode}:${instanceId}`).digest("base64url").slice(0, 12)}`;

  if (!getForcedVisiblePlayers(state)[opponentId]) {
    opponent.hand = opponent.hand.map((rune) => hiddenRune(hiddenId(rune.instanceId)));
    if (opponent.selectedRuneInstanceId) {
      opponent.selectedRuneInstanceId = hiddenId(opponent.selectedRuneInstanceId);
    }
  }
  // Only the count of the opponent's bag shows, and only the contents of
  // one's own: sorted, so the order of the draws stays unknown.
  opponent.bag = opponent.bag.map(() => hiddenRune(""));
  view.players[playerId].bag.sort((a, b) => `${a.id}:${a.level}:${a.instanceId}`.localeCompare(`${b.id}:${b.level}:${b.instanceId}`));
  view.rngState = 0;
  return view;
}

function hiddenRune(instanceId) {
  return { id: "hidden", name: "", level: 1, instanceId, hidden: true };
}
