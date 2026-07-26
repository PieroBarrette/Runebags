// Small REST surface used by the lobby (leaderboard), the stats screen
// (server-side record, game history) and the replay viewer.
//
// Auth is deliberately minimal: the caller proves who they are by sending
// their own guest id in the `x-guest-id` header. That id is a bearer secret,
// so it is only ever accepted as INPUT — no response ever contains a guest id,
// its own included. Public identity is the numeric player id + name + avatar.
import {
  deletePushSubscription,
  getGameForReplay,
  getGamesForPlayer,
  getLeaderboard,
  getPlayerIdByGuestId,
  getPlayerStatsByGuestId,
  savePushSubscription,
} from "./db.mjs";
import { getVapidPublicKey } from "./push.mjs";

const MAX_BODY_BYTES = 8 * 1024;

export async function handleApiRequest(req, res, context) {
  const url = new URL(req.url || "/", "http://localhost");
  const route = url.pathname;

  if (req.method === "GET" && route === "/api/leaderboard") {
    sendJson(res, 200, { players: getLeaderboard(url.searchParams.get("limit")) });
    return;
  }

  if (req.method === "GET" && route === "/api/push/vapid-public-key") {
    sendJson(res, 200, { key: getVapidPublicKey() });
    return;
  }

  if (req.method === "GET" && route === "/api/me/stats") {
    const guestId = readGuestId(req, url);
    if (!guestId) {
      sendJson(res, 400, { error: "missing_guest_id" });
      return;
    }
    sendJson(res, 200, { stats: getPlayerStatsByGuestId(guestId) });
    return;
  }

  if (req.method === "GET" && route === "/api/me/games") {
    const guestId = readGuestId(req, url);
    if (!guestId) {
      sendJson(res, 400, { error: "missing_guest_id" });
      return;
    }
    const playerRowId = getPlayerIdByGuestId(guestId);
    sendJson(res, 200, {
      games: getGamesForPlayer(playerRowId, url.searchParams.get("limit"), url.searchParams.get("beforeId")),
    });
    return;
  }

  // Games still in progress that this guest holds a seat in, so the home
  // screen can offer to resume days later. Never returns a room token: coming
  // back relies on the stored token or the guest-id seat match on join.
  if (req.method === "GET" && route === "/api/me/rooms") {
    const guestId = readGuestId(req, url);
    if (!guestId) {
      sendJson(res, 400, { error: "missing_guest_id" });
      return;
    }
    sendJson(res, 200, { rooms: collectOngoingRooms(context?.rooms, guestId) });
    return;
  }

  // Public on purpose: replay links are shareable. The payload carries only
  // names, avatars, the initial snapshot and the moves — never the chat.
  if (req.method === "GET" && route.startsWith("/api/games/")) {
    const id = Number(route.slice("/api/games/".length));
    if (!Number.isInteger(id) || id <= 0) {
      sendJson(res, 400, { error: "bad_game_id" });
      return;
    }
    const game = getGameForReplay(id);
    if (!game) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    sendJson(res, 200, { game });
    return;
  }

  if (req.method === "POST" && route === "/api/push/subscribe") {
    const guestId = readGuestId(req, url);
    const body = await readJsonBody(req);
    if (!guestId || !body?.subscription?.endpoint) {
      sendJson(res, 400, { error: "bad_request" });
      return;
    }
    const playerRowId = getPlayerIdByGuestId(guestId);
    if (!playerRowId) {
      // Nothing to attach the subscription to until they've played once.
      sendJson(res, 409, { error: "unknown_player" });
      return;
    }
    sendJson(res, 200, { ok: savePushSubscription(playerRowId, body.subscription, body.lang) });
    return;
  }

  if (req.method === "POST" && route === "/api/push/unsubscribe") {
    const body = await readJsonBody(req);
    if (!body?.endpoint) {
      sendJson(res, 400, { error: "bad_request" });
      return;
    }
    deletePushSubscription(body.endpoint);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

function collectOngoingRooms(rooms, guestId) {
  if (!rooms) {
    return [];
  }

  const ongoing = [];
  for (const room of rooms.values()) {
    if (!room.started || !room.state || room.state.phase === "game-over") {
      continue;
    }
    const seat = [1, 2].find((id) => room.players[id]?.guestId === guestId);
    if (!seat) {
      continue;
    }
    const opponent = room.players[seat === 1 ? 2 : 1];
    ongoing.push({
      roomCode: room.code,
      yourSeat: seat,
      phase: room.state.phase,
      roundNumber: room.state.roundNumber,
      yourTurn: room.state.phase === "round" && room.state.currentPlayer === seat,
      opponent: { name: opponent?.name || null, avatar: opponent?.avatar || null },
      opponentConnected: Boolean(opponent?.connected),
      lastActivityAt: room.lastActivityAt || room.createdAt || null,
    });
  }

  ongoing.sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));
  return ongoing;
}

function readGuestId(req, url) {
  const header = req.headers["x-guest-id"];
  const raw = typeof header === "string" ? header : url.searchParams.get("guestId");
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return /^[a-z0-9-]{6,64}$/i.test(trimmed) ? trimmed : null;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}
