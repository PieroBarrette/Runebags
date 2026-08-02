// Small REST surface used by the lobby (leaderboard), the stats screen
// (server-side record, game history) and the replay viewer.
//
// Auth is deliberately minimal: the caller proves who they are by sending
// their own guest id in the `x-guest-id` header. That id is a bearer secret,
// so it is only ever accepted as INPUT — no response ever contains a guest id,
// its own included. Public identity is the numeric player id + name + avatar.
import {
  acceptChallenge,
  countPendingChallengesFrom,
  createChallenge,
  declineChallenge,
  deletePushSubscription,
  getChallengeById,
  getChallengesForUser,
  getGameForReplay,
  getUserByHandle,
  hasPendingChallengeBetween,
  getGamesForPlayer,
  getLeaderboard,
  getPlayerIdByGuestId,
  getPlayerRank,
  getPlayerStatsByGuestId,
  getProfileByHandle,
  savePushSubscription,
  searchPlayersByHandle,
  upsertPlayer,
} from "./db.mjs";
import { getVapidPublicKey } from "./push.mjs";
import {
  claimHandle,
  getUserFromSession,
  logout,
  publicUser,
  requestLoginLink,
  verifyLoginToken,
} from "./auth.mjs";

const MAX_BODY_BYTES = 8 * 1024;
const CHALLENGE_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 5;

export async function handleApiRequest(req, res, context) {
  const url = new URL(req.url || "/", "http://localhost");
  const route = url.pathname;

  /* -------------------------------------------------------------- accounts */

  if (req.method === "POST" && route === "/api/auth/request") {
    const body = await readJsonBody(req);
    const result = await requestLoginLink({
      email: body?.email,
      lang: body?.lang,
      ip: readClientIp(req),
    });
    sendJson(res, result.status, result.body);
    return;
  }

  if (req.method === "POST" && route === "/api/auth/verify") {
    const body = await readJsonBody(req);
    const result = verifyLoginToken({
      token: body?.token,
      guestId: readGuestId(req, url),
      displayName: body?.name,
      avatar: body?.avatar,
    });
    sendJson(res, result.status, result.body);
    return;
  }

  if (req.method === "GET" && route === "/api/auth/me") {
    const user = getUserFromSession(readSessionToken(req));
    sendJson(res, 200, { user: user ? publicUser(user) : null });
    return;
  }

  if (req.method === "POST" && route === "/api/auth/handle") {
    const user = getUserFromSession(readSessionToken(req));
    if (!user) {
      sendJson(res, 401, { error: "not_signed_in" });
      return;
    }
    const body = await readJsonBody(req);
    const result = claimHandle(user, body?.handle);
    sendJson(res, result.status, result.body);
    return;
  }

  if (req.method === "POST" && route === "/api/auth/logout") {
    sendJson(res, 200, logout(readSessionToken(req)).body);
    return;
  }

  /* ------------------------------------------------------------ challenges */

  if (req.method === "GET" && route === "/api/me/challenges") {
    const user = getUserFromSession(readSessionToken(req));
    sendJson(res, 200, { challenges: user ? getChallengesForUser(user.id) : [] });
    return;
  }

  if (req.method === "POST" && route === "/api/challenges") {
    const user = getUserFromSession(readSessionToken(req));
    if (!user) {
      sendJson(res, 401, { error: "not_signed_in" });
      return;
    }
    if (!user.handle) {
      sendJson(res, 409, { error: "handle_required" });
      return;
    }

    const body = await readJsonBody(req);
    const target = getUserByHandle(body?.handle);
    if (!target || target.id === user.id) {
      sendJson(res, 404, { error: "player_not_found" });
      return;
    }
    // One live challenge per pair, and a cap per sender: a challenge is a
    // notification someone else receives, so it has to be hard to spam.
    if (hasPendingChallengeBetween(user.id, target.id)) {
      sendJson(res, 409, { error: "already_pending" });
      return;
    }
    if (countPendingChallengesFrom(user.id) >= MAX_PENDING_CHALLENGES) {
      sendJson(res, 429, { error: "too_many_pending" });
      return;
    }

    const id = createChallenge({
      fromUserId: user.id,
      toUserId: target.id,
      ranked: body?.ranked !== false,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
    if (!id) {
      sendJson(res, 503, { error: "storage_unavailable" });
      return;
    }

    context?.notifyChallenge?.(target.player_id, user.handle);
    sendJson(res, 200, { ok: true, id });
    return;
  }

  if (req.method === "POST" && route.startsWith("/api/challenges/")) {
    const user = getUserFromSession(readSessionToken(req));
    if (!user) {
      sendJson(res, 401, { error: "not_signed_in" });
      return;
    }

    const [rawId, action] = route.slice("/api/challenges/".length).split("/");
    const id = Number(rawId);
    if (!Number.isInteger(id)) {
      sendJson(res, 400, { error: "bad_id" });
      return;
    }

    if (action === "decline") {
      sendJson(res, 200, { ok: declineChallenge(id, user.id) });
      return;
    }

    if (action === "accept") {
      const challenge = getChallengeById(id);
      if (!challenge || challenge.to_user_id !== user.id) {
        sendJson(res, 404, { error: "not_found" });
        return;
      }
      // The room is created first: if claiming the challenge then fails (a
      // double tap, an expiry), an unused empty room is harmless, whereas a
      // claimed challenge without a room would be a dead end.
      const roomCode = context?.createRoomForChallenge?.(Boolean(challenge.ranked));
      if (!roomCode || !acceptChallenge(id, user.id, roomCode)) {
        sendJson(res, 409, { error: "cannot_accept" });
        return;
      }
      sendJson(res, 200, { ok: true, roomCode });
      return;
    }

    sendJson(res, 404, { error: "not_found" });
    return;
  }

  if (req.method === "GET" && route === "/api/leaderboard") {
    sendJson(res, 200, { players: getLeaderboard(url.searchParams.get("limit")) });
    return;
  }

  if (req.method === "GET" && route === "/api/players/search") {
    sendJson(res, 200, {
      players: searchPlayersByHandle(url.searchParams.get("q"), url.searchParams.get("limit")),
    });
    return;
  }

  // Public on purpose: a profile is the point of a ladder. It carries only what
  // is already visible on the leaderboard plus a finished-game history, never
  // an email, a guest id or anything said in chat.
  if (req.method === "GET" && route.startsWith("/api/profile/")) {
    const handle = decodeURIComponent(route.slice("/api/profile/".length));
    const player = getProfileByHandle(handle);
    if (!player) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    sendJson(res, 200, {
      player,
      rank: getPlayerRank(player.id),
      games: getGamesForPlayer(player.id, 20),
    });
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
    // Player rows are normally created when a seat is claimed in a room, but
    // notifications can legitimately be switched on before ever playing online.
    // Create the row on demand rather than rejecting the subscription.
    const playerRowId = getPlayerIdByGuestId(guestId)
      || upsertPlayer(guestId, body.name, body.avatar);
    if (!playerRowId) {
      sendJson(res, 503, { error: "storage_unavailable" });
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

function readSessionToken(req) {
  const header = req.headers["x-session-token"];
  return typeof header === "string" && header.trim() ? header.trim() : null;
}

// Render sits behind a proxy, so the direct socket address is the load
// balancer; the first hop in X-Forwarded-For is the real caller.
function readClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || null;
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
