import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createInitialState, ENGINE_VERSION, restoreState, startRoundFromShop } from "../js/core/gameState.js";
import { applyAction, applyForfeit } from "../js/core/onlineActions.js";
import {
  applyRating,
  closeDb,
  finishGame,
  getPlayerIdByGuestId,
  getRatingSnapshot,
  insertGame,
  insertGameAction,
  isAccountPlayer,
  markGameAbandonedIfActive,
  openDb,
  purgeExpiredAuthRows,
  recordGameRatings,
  recordPlayerOutcome,
  upsertPlayer,
} from "./db.mjs";
import { computeRatingChange, START_RATING } from "./elo.mjs";
import { handleApiRequest } from "./api.mjs";
import { initPush, sendPush } from "./push.mjs";
import { initCrypto } from "./crypto.mjs";
import { initMailer } from "./mailer.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_ROOT = ROOT;
// On Render, DATA_DIR points at the persistent disk (/var/data) so rooms and
// the SQLite DB survive deploys; locally it falls back to server/ as before.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const PERSIST_PATH = path.join(DATA_DIR, "rooms.json");
const PORT = Number(process.env.PORT || 8080);

// Room lifetime once rooms persist across deploys (TTL sweep, once an hour).
const ROOM_TTL_NEVER_STARTED_MS = 24 * 60 * 60 * 1000;
const ROOM_TTL_FINISHED_MS = 48 * 60 * 60 * 1000;
const ROOM_TTL_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
const ROOM_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

// Ranked games are timed. Friendly rooms are not: those are played over days,
// where a clock would only ever run out on someone living their life.
const CLOCK_BUDGET_MS = 10 * 60 * 1000;
const CLOCK_TICK_MS = 1000;

// Quick play pairs on rating, with a window that opens as someone waits.
const QUEUE_WINDOW_START = 100;
const QUEUE_WINDOW_UNRATED = 400;
const QUEUE_WINDOW_MAX = 800;
const QUEUE_WINDOW_FULL_MS = 60 * 1000;
const QUEUE_OPEN_AFTER_MS = 120 * 1000;
// Windows widen with time, so waiting players have to be re-examined even when
// nobody joins or leaves the queue.
const QUEUE_RETRY_INTERVAL_MS = 5 * 1000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** @type {Map<string, any>} */
const rooms = new Map();
const wsToSession = new Map();
const quickQueue = [];

// Avatar payloads are client-chosen but validated against fixed sets so a
// tampered client can't inject arbitrary strings into other players' UI.
const AVATAR_GLYPHS = new Set([
  "algiz", "ansuz", "berkana", "dagaz", "ehwaz", "eihwaz", "fehu", "gebo",
  "hagalz", "inguz", "isa", "jera", "kenaz", "laguz", "mannaz", "nauthiz",
  "odal", "perth", "raido", "sowelu", "teiwaz", "thurisa", "uruz", "wunjo",
]);
const AVATAR_COLORS = new Set(["gold", "ember", "moss", "fjord", "amethyst", "frost"]);

// Quick-chat travels as i18n KEYS, never free text, so each client renders
// the message in its own language. Only these keys are relayed.
const QUICK_CHAT_KEYS = new Set([
  "qc.hello", "qc.goodLuck", "qc.wellPlayed", "qc.wow", "qc.thinking", "qc.goodGame",
]);
const QUICK_CHAT_MIN_INTERVAL_MS = 1200;

await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {});
openDb(DATA_DIR);
initCrypto(process.env);
initMailer(process.env);
await initPush(process.env);
await loadRooms();
sweepRooms();
setInterval(sweepRooms, ROOM_SWEEP_INTERVAL_MS).unref();
setInterval(() => {
  if (quickQueue.length >= 2) {
    tryMatchQueue();
  }
}, QUEUE_RETRY_INTERVAL_MS).unref();
setInterval(sweepClocks, CLOCK_TICK_MS).unref();

const server = createServer(handleHttp);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  if (!request.url || !request.url.startsWith("/ws")) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws);
  });
});

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      send(ws, { type: "error", code: "invalid_json", message: "Invalid JSON message." });
      return;
    }

    handleMessage(ws, message);
  });

  ws.on("close", () => {
    removeFromQueueBySocket(ws);
    broadcastPresence();
    const session = wsToSession.get(ws);
    if (!session) {
      return;
    }

    wsToSession.delete(ws);
    const room = rooms.get(session.roomCode);
    if (!room) {
      return;
    }

    const player = room.players[session.playerId];
    if (player && player.token === session.token) {
      player.connected = false;
      player.lastSeen = Date.now();
      broadcastWaitingState(room);
      schedulePersistRooms().catch(() => {});
    }
  });

  send(ws, { type: "hello", message: "RuneBags online socket ready.", online: connectedCount() });
  broadcastPresence();
});

server.listen(PORT, () => {
  console.log(`RuneBags online server listening on http://127.0.0.1:${PORT}`);
});

// Render sends SIGTERM on every deploy/restart (~30 s grace): flush the
// debounced rooms write and close the DB so nothing on the disk is lost.
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  try {
    await flushRoomsNow();
  } catch {
    // Best-effort — the debounced copy may already be on disk.
  }
  try {
    closeDb();
  } catch {
    // Best-effort.
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function handleHttp(req, res) {
  const reqPath = decodeURIComponent((req.url || "/").split("?")[0]);

  if (reqPath === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (reqPath === "/api" || reqPath.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }

  let target = reqPath === "/" ? "/index.html" : reqPath;
  if (!isAllowedPublicPath(target)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  target = target.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(PUBLIC_ROOT, target));
  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error("Not a file");
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    const body = await fs.readFile(filePath);

    res.writeHead(200, { "Content-Type": mime });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function isAllowedPublicPath(target) {
  return target === "/index.html"
    || target === "/"
    || target === "/manifest.webmanifest"
    || target === "/service-worker.js"
    || target.startsWith("/js/")
    || target.startsWith("/styles/")
    || target.startsWith("/assets/");
}

// An accepted challenge needs a room before either player has a socket in it,
// so it is created empty here; both sides then join by code through the normal
// path, which assigns the seats.
function createRoomForChallenge(ranked) {
  const roomCode = generateRoomCode();
  rooms.set(roomCode, {
    code: roomCode,
    createdAt: Date.now(),
    started: false,
    seq: 0,
    state: null,
    chat: [],
    shopSync: null,
    ranked: Boolean(ranked),
    lastActivityAt: Date.now(),
    players: {
      1: createPlayerRecord(null, "Player 1"),
      2: createPlayerRecord(null, "Player 2"),
    },
  });
  schedulePersistRooms().catch(() => {});
  return roomCode;
}

// Tells a challenged player about it right away when they are connected, so a
// challenge doesn't wait on a page refresh. Offline players get a push instead.
function notifyChallenge(toPlayerRowId, fromHandle) {
  let delivered = false;
  for (const ws of wss.clients) {
    if (ws.readyState !== 1 || !ws.guestId) {
      continue;
    }
    if (getPlayerIdByGuestId(ws.guestId) === toPlayerRowId) {
      send(ws, { type: "challenge_received", from: fromHandle });
      delivered = true;
    }
  }

  // Only fall back to a push when nobody is watching: someone already looking
  // at the lobby does not need their phone to buzz.
  if (!delivered) {
    sendPush(toPlayerRowId, "challenge", { opponentName: fromHandle });
  }
}

function handleApi(req, res) {
  handleApiRequest(req, res, { rooms, createRoomForChallenge, notifyChallenge }).catch((error) => {
    console.warn(`[api] request failed: ${error?.message || error}`);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "internal_error" });
    }
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function roomLastActivity(room) {
  return Math.max(
    Number(room.lastActivityAt || 0),
    Number(room.players?.[1]?.lastSeen || 0),
    Number(room.players?.[2]?.lastSeen || 0),
    Number(room.createdAt || 0),
  );
}

// Rooms now survive deploys (persistent disk), so without a TTL they would
// accumulate forever. Finished games live on in the DB history, not the room.
function sweepRooms() {
  const now = Date.now();
  let removed = 0;
  for (const [code, room] of rooms) {
    if (room.players?.[1]?.connected || room.players?.[2]?.connected) {
      continue;
    }

    let expired = false;
    if (!room.started) {
      expired = now - Number(room.createdAt || 0) > ROOM_TTL_NEVER_STARTED_MS;
    } else if (room.state?.phase === "game-over") {
      expired = now - roomLastActivity(room) > ROOM_TTL_FINISHED_MS;
    } else {
      expired = now - roomLastActivity(room) > ROOM_TTL_IDLE_MS;
    }

    if (!expired) {
      continue;
    }

    if (room.gameId) {
      markGameAbandonedIfActive(room.gameId);
    }
    rooms.delete(code);
    removed += 1;
  }

  if (removed > 0) {
    console.log(`[sweep] removed ${removed} expired room(s), ${rooms.size} remaining`);
    schedulePersistRooms().catch(() => {});
  }

  purgeExpiredAuthRows();
}

function handleMessage(ws, message) {
  if (!message || typeof message.type !== "string") {
    send(ws, { type: "error", code: "malformed", message: "Malformed message." });
    return;
  }

  // Remember who this socket belongs to, whatever it is doing. Sessions only
  // exist for players sitting in a room, so without this a challenge could not
  // reach the very people most able to accept it: those idle in the lobby.
  const guestId = normalizeGuestId(message.guestId);
  if (guestId) {
    ws.guestId = guestId;
  }

  switch (message.type) {
    case "identify":
      // Sent on connect so the lobby is reachable before joining anything.
      return;
    case "create_room":
      return onCreateRoom(ws, message);
    case "join_room":
      return onJoinRoom(ws, message);
    case "queue_join":
      return onQueueJoin(ws, message);
    case "queue_cancel":
      return onQueueCancel(ws, message);
    case "set_ready":
      return onSetReady(ws, message);
    case "start_match":
      return onStartMatch(ws);
    case "action":
      return onAction(ws, message);
    case "chat_send":
      return onChatSend(ws, message);
    case "reconnect":
      return onReconnect(ws, message);
    case "rematch_request":
      return onRematchRequest(ws);
    case "leave_room":
      return onLeaveRoom(ws);
    case "ping":
      return send(ws, { type: "pong", ts: Date.now() });
    default:
      return send(ws, { type: "error", code: "unknown_type", message: `Unknown message type: ${message.type}` });
  }
}

function onQueueJoin(ws, message) {
  const guestId = normalizeGuestId(message.guestId);
  if (!guestId) {
    send(ws, { type: "error", code: "invalid_guest", message: "Invalid guest id for quick play." });
    return;
  }

  const displayName = normalizeDisplayName(message.displayName, `Guest-${guestId.slice(-4).toUpperCase()}`);

  const avatar = normalizeAvatar(message.avatar);
  const existing = quickQueue.find((entry) => entry.ws === ws);
  if (!existing) {
    // Rating is read once on entry: pairing has to compare something, and a
    // player's rating cannot change while they sit in the queue anyway.
    const playerId = getPlayerIdByGuestId(guestId);
    const snapshot = playerId ? getRatingSnapshot(playerId) : null;
    quickQueue.push({
      ws,
      guestId,
      displayName,
      avatar,
      joinedAt: Date.now(),
      rating: snapshot?.rating ?? START_RATING,
      // Unrated players get a wider opening window: we have no idea what
      // level they are, so insisting on a close match just makes them wait.
      provisional: !snapshot || snapshot.rankedGames === 0,
    });
  } else {
    existing.displayName = displayName;
    existing.avatar = avatar || existing.avatar;
  }

  const position = quickQueue.findIndex((entry) => entry.ws === ws) + 1;
  send(ws, {
    type: "queue_status",
    queued: true,
    position,
    code: position === 1 ? "queue_searching" : "queue_position",
    message: position === 1 ? "Searching for opponent..." : `In queue: #${position}`,
  });

  tryMatchQueue();
}

function onQueueCancel(ws) {
  const removed = removeFromQueueBySocket(ws);
  send(ws, {
    type: "queue_status",
    queued: false,
    position: 0,
    code: removed ? "queue_cancelled" : "queue_not_in",
    message: removed ? "Quick play cancelled." : "Not currently in queue.",
  });
}

// How far apart two ratings may be for this player to accept a match. It opens
// with the waiting time so that a close game is tried first, but nobody is left
// waiting forever — which matters far more than precision with a small player
// base, where an exact match may simply not exist.
function searchWindow(entry, now) {
  const waited = now - entry.joinedAt;
  if (waited >= QUEUE_OPEN_AFTER_MS) {
    return Infinity;
  }
  const base = entry.provisional ? QUEUE_WINDOW_UNRATED : QUEUE_WINDOW_START;
  const progress = Math.min(1, waited / QUEUE_WINDOW_FULL_MS);
  return base + (QUEUE_WINDOW_MAX - base) * progress;
}

function tryMatchQueue() {
  // Sockets that closed while queued would otherwise be paired into a room
  // nobody is sitting in.
  for (let i = quickQueue.length - 1; i >= 0; i -= 1) {
    if (!isSocketOpen(quickQueue[i].ws)) {
      quickQueue.splice(i, 1);
    }
  }

  // Repeatedly take the closest pair that both sides currently accept. The
  // queue is small, so comparing every pair is cheaper than maintaining an
  // index — and it gives the best available match rather than the first one.
  for (;;) {
    const now = Date.now();
    let best = null;

    for (let i = 0; i < quickQueue.length; i += 1) {
      for (let j = i + 1; j < quickQueue.length; j += 1) {
        const a = quickQueue[i];
        const b = quickQueue[j];
        const gap = Math.abs(a.rating - b.rating);
        // The more patient of the two decides: one player having waited long
        // enough is what unlocks a wider match.
        const limit = Math.max(searchWindow(a, now), searchWindow(b, now));
        if (gap <= limit && (!best || gap < best.gap)) {
          best = { i, j, gap };
        }
      }
    }

    if (!best) {
      break;
    }

    // Splice the higher index first so the lower one stays valid.
    const second = quickQueue.splice(best.j, 1)[0];
    const first = quickQueue.splice(best.i, 1)[0];
    createInstantMatch(first, second);
  }

  // Refresh queue positions for remaining players.
  quickQueue.forEach((entry, index) => {
    if (!isSocketOpen(entry.ws)) {
      return;
    }

    send(entry.ws, {
      type: "queue_status",
      queued: true,
      position: index + 1,
      code: index === 0 ? "queue_searching" : "queue_position",
      message: index === 0 ? "Searching for opponent..." : `In queue: #${index + 1}`,
    });
  });
}

function createInstantMatch(firstEntry, secondEntry) {
  const firstWs = firstEntry.ws;
  const secondWs = secondEntry.ws;
  const roomCode = generateRoomCode();
  const token1 = createToken();
  const token2 = createToken();

  const room = {
    code: roomCode,
    createdAt: Date.now(),
    started: true,
    seq: 1,
    state: restoreState(createInitialState()),
    chat: [],
    shopSync: createShopSyncState(),
    lastActivityAt: Date.now(),
    // Quick play is the ranked ladder.
    ranked: true,
    players: {
      1: createPlayerRecord(token1, normalizeDisplayName(firstEntry?.displayName, "Player 1"), firstEntry?.avatar, firstEntry?.guestId),
      2: createPlayerRecord(token2, normalizeDisplayName(secondEntry?.displayName, "Player 2"), secondEntry?.avatar, secondEntry?.guestId),
    },
  };

  room.players[1].ready = true;
  room.players[2].ready = true;

  rooms.set(roomCode, room);
  registerSeatIdentity(room, 1, firstEntry?.guestId);
  registerSeatIdentity(room, 2, secondEntry?.guestId);
  beginGameRecording(room);
  startClock(room);
  attachSession(firstWs, roomCode, 1, token1);
  attachSession(secondWs, roomCode, 2, token2);

  send(firstWs, { type: "queue_matched", roomCode, playerId: 1 });
  send(secondWs, { type: "queue_matched", roomCode, playerId: 2 });

  sendWaitingSnapshot(firstWs, room, 1, token1);
  sendWaitingSnapshot(secondWs, room, 2, token2);
  broadcastState(room);
  schedulePersistRooms().catch(() => {});
}

function onCreateRoom(ws, message) {
  const roomCode = normalizeRoomCode(message.roomCode) || generateRoomCode();
  if (rooms.has(roomCode)) {
    send(ws, { type: "error", code: "room_exists", message: "Room already exists." });
    return;
  }

  const token = createToken();
  const displayName = normalizeDisplayName(message.displayName, "Player 1");
  const room = {
    code: roomCode,
    createdAt: Date.now(),
    started: false,
    seq: 0,
    state: null,
    chat: [],
    shopSync: null,
    lastActivityAt: Date.now(),
    players: {
      1: createPlayerRecord(token, displayName, message.avatar, message.guestId),
      2: createPlayerRecord(null, "Player 2"),
    },
  };

  rooms.set(roomCode, room);
  registerSeatIdentity(room, 1, message.guestId);
  attachSession(ws, roomCode, 1, token);
  schedulePersistRooms().catch(() => {});

  sendWaitingSnapshot(ws, room, 1, token);
}

function onJoinRoom(ws, message) {
  const roomCode = normalizeRoomCode(message.roomCode);
  const room = roomCode ? rooms.get(roomCode) : null;
  if (!room) {
    send(ws, { type: "error", code: "room_not_found", message: "Room not found." });
    return;
  }

  if (room.started && !message.token) {
    // Prefer the seat this guest already holds: reconnect tokens live in
    // session storage and rarely survive a browser restart, and the old
    // "first disconnected seat" heuristic could hand you your OPPONENT's seat.
    // A guest-id match also allows taking over from a second device.
    const guestId = normalizeGuestId(message.guestId);
    const ownSeatId = guestId ? [1, 2].find((id) => room.players[id]?.guestId === guestId) : null;
    const reclaimPlayerId = ownSeatId || [1, 2].find((id) => {
      const player = room.players[id];
      if (!player?.token || player.connected) {
        return false;
      }
      return true;
    });

    if (!reclaimPlayerId) {
      send(ws, { type: "error", code: "match_started_reconnect", message: "Match already started. Reconnect with token." });
      return;
    }

    const newToken = createToken();
    room.players[reclaimPlayerId].token = newToken;
    room.players[reclaimPlayerId].name = normalizeDisplayName(
      message.displayName,
      room.players[reclaimPlayerId].name || `Player ${reclaimPlayerId}`,
    );
    room.players[reclaimPlayerId].avatar = normalizeAvatar(message.avatar) || room.players[reclaimPlayerId].avatar;
    registerSeatIdentity(room, reclaimPlayerId, message.guestId);
    room.lastActivityAt = Date.now();
    attachSession(ws, room.code, reclaimPlayerId, newToken);
    schedulePersistRooms().catch(() => {});

    sendWaitingSnapshot(ws, room, reclaimPlayerId, newToken);
    send(ws, {
      type: "state_snapshot",
      roomCode: room.code,
      seq: room.seq,
      state: room.state,
      chat: Array.isArray(room.chat) ? room.chat : [],
      playerId: reclaimPlayerId,
      playerNames: getRoomPlayerNames(room),
      playerAvatars: getRoomPlayerAvatars(room),
      shopSync: getShopSyncPayload(room, reclaimPlayerId),
    });
    broadcastWaitingState(room);
    return;
  }

  if (message.token) {
    return onReconnect(ws, message);
  }

  if (room.players[2].token && room.players[2].connected) {
    send(ws, { type: "error", code: "room_full", message: "Room is full." });
    return;
  }

  // A host returning to their own not-yet-started room keeps seat 1 instead of
  // landing in the opponent's chair (which is what happens when they follow
  // their own invite link).
  const joinGuestId = normalizeGuestId(message.guestId);
  const ownSeatId = joinGuestId ? [1, 2].find((id) => room.players[id]?.guestId === joinGuestId) : null;
  const playerId = ownSeatId || (room.players[1].token ? 2 : 1);
  const token = createToken();
  const defaultName = playerId === 1 ? "Player 1" : "Player 2";
  room.players[playerId] = createPlayerRecord(
    token,
    normalizeDisplayName(message.displayName, defaultName),
    message.avatar,
    message.guestId,
  );
  registerSeatIdentity(room, playerId, message.guestId);
  room.lastActivityAt = Date.now();
  attachSession(ws, room.code, playerId, token);
  schedulePersistRooms().catch(() => {});

  sendWaitingSnapshot(ws, room, playerId, token);
  broadcastWaitingState(room);
  notifyOpponentJoined(room, playerId);
}

function onReconnect(ws, message) {
  const roomCode = normalizeRoomCode(message.roomCode);
  const token = typeof message.token === "string" ? message.token : "";

  const room = roomCode ? rooms.get(roomCode) : null;
  if (!room || !token) {
    send(ws, { type: "error", code: "reconnect_failed", message: "Reconnect failed." });
    return;
  }

  const playerId = [1, 2].find((id) => room.players[id].token === token);
  if (!playerId) {
    send(ws, { type: "error", code: "reconnect_token_invalid", message: "Reconnect token invalid." });
    return;
  }

  room.players[playerId].connected = true;
  room.players[playerId].lastSeen = Date.now();
  room.players[playerId].name = normalizeDisplayName(
    message.displayName,
    room.players[playerId].name || `Player ${playerId}`,
  );
  room.players[playerId].avatar = normalizeAvatar(message.avatar) || room.players[playerId].avatar;
  registerSeatIdentity(room, playerId, message.guestId);
  room.lastActivityAt = Date.now();

  attachSession(ws, room.code, playerId, token);
  schedulePersistRooms().catch(() => {});

  sendWaitingSnapshot(ws, room, playerId, token);
  if (room.started && room.state) {
    send(ws, {
      type: "state_snapshot",
      roomCode: room.code,
      seq: room.seq,
      state: room.state,
      chat: Array.isArray(room.chat) ? room.chat : [],
      playerId,
      playerNames: getRoomPlayerNames(room),
      playerAvatars: getRoomPlayerAvatars(room),
      shopSync: getShopSyncPayload(room, playerId),
    });
  }

  broadcastWaitingState(room);
}

function onSetReady(ws, message) {
  const session = wsToSession.get(ws);
  if (!session) {
    send(ws, { type: "error", code: "join_room_first", message: "Join a room first." });
    return;
  }

  const room = rooms.get(session.roomCode);
  if (!room || room.started) {
    send(ws, { type: "error", code: "cannot_change_ready", message: "Cannot change readiness now." });
    return;
  }

  room.players[session.playerId].ready = Boolean(message.ready);
  schedulePersistRooms().catch(() => {});
  broadcastWaitingState(room);
}

function onStartMatch(ws) {
  const session = wsToSession.get(ws);
  if (!session) {
    send(ws, { type: "error", code: "join_room_first", message: "Join a room first." });
    return;
  }

  const room = rooms.get(session.roomCode);
  if (!room) {
    send(ws, { type: "error", code: "room_not_found", message: "Room not found." });
    return;
  }

  if (room.started) {
    send(ws, { type: "error", code: "match_already_started", message: "Match already started." });
    return;
  }

  if (!room.players[1].token || !room.players[2].token) {
    send(ws, { type: "error", code: "need_two_players", message: "Need two players in room." });
    return;
  }

  if (!room.players[1].ready || !room.players[2].ready) {
    send(ws, { type: "error", code: "both_ready_required", message: "Both players must be ready." });
    return;
  }

  room.state = restoreState(createInitialState());
  room.chat = [];
  room.shopSync = createShopSyncState();
  room.rematch = { 1: false, 2: false };
  room.started = true;
  room.seq += 1;
  room.lastActivityAt = Date.now();
  room.players[1].lastClientSeq = 0;
  room.players[2].lastClientSeq = 0;
  beginGameRecording(room);
  startClock(room);

  schedulePersistRooms().catch(() => {});
  broadcastWaitingState(room);
  broadcastState(room);
}

// A one-click rematch reuses the same room: once both players opt in, the room's
// state is reset to a fresh game and re-broadcast, so neither player re-does the
// lobby. Mirrors the reset performed by onStartMatch.
function onRematchRequest(ws) {
  const session = wsToSession.get(ws);
  if (!session) {
    send(ws, { type: "error", code: "join_room_first", message: "Join a room first." });
    return;
  }

  const room = rooms.get(session.roomCode);
  if (!room || !room.started || !room.state) {
    send(ws, { type: "error", code: "no_finished_match", message: "No finished match to rematch." });
    return;
  }

  if (room.state.phase !== "game-over") {
    send(ws, { type: "error", code: "rematch_only_game_over", message: "Rematch is only available once the game is over." });
    return;
  }

  if (!room.players[1].token || !room.players[2].token) {
    send(ws, { type: "error", code: "rematch_need_both", message: "Both players must be present to rematch." });
    return;
  }

  if (!room.rematch) {
    room.rematch = { 1: false, 2: false };
  }
  room.rematch[session.playerId] = true;
  broadcastRematchStatus(room);
  notifyRematchRequested(room, session.playerId);

  if (room.rematch[1] && room.rematch[2]) {
    room.state = restoreState(createInitialState());
    room.chat = [];
    room.shopSync = createShopSyncState();
    room.rematch = { 1: false, 2: false };
    room.players[1].lastClientSeq = 0;
    room.players[2].lastClientSeq = 0;
    room.seq += 1;
    room.lastActivityAt = Date.now();
    // The previous game is already finished in the DB; start a new recording.
    beginGameRecording(room);
  startClock(room);
    schedulePersistRooms().catch(() => {});
    broadcastState(room);
  }
}

function broadcastRematchStatus(room) {
  const rematch = room.rematch || { 1: false, 2: false };
  forEachPlayerConnection(room, (ws, playerId) => {
    const opponentId = playerId === 1 ? 2 : 1;
    send(ws, {
      type: "rematch_status",
      youRequested: Boolean(rematch[playerId]),
      opponentRequested: Boolean(rematch[opponentId]),
    });
  });
}

function onAction(ws, message) {
  const session = wsToSession.get(ws);
  if (!session) {
    send(ws, { type: "error", code: "join_room_first", message: "Join a room first." });
    return;
  }

  const room = rooms.get(session.roomCode);
  if (!room || !room.started || !room.state) {
    send(ws, { type: "error", code: "match_not_active", message: "Match is not active." });
    return;
  }

  const actionType = message.actionType;
  const payload = message.payload || {};
  const clientSeq = Number(message.clientSeq);

  if (actionType === "phase_action" && room.state.phase === "shop") {
    send(ws, { type: "action_rejected", code: "shop_ready_online", message: "Use Shop Ready in online shop phase.", actionType });
    return;
  }

  if (!Number.isInteger(clientSeq)) {
    send(ws, { type: "action_rejected", code: "seq_missing", message: "Missing action sequence number.", actionType });
    return;
  }

  const playerState = room.players[session.playerId];
  const expectedSeq = playerState.lastClientSeq + 1;
  if (clientSeq !== expectedSeq) {
    send(ws, {
      type: "action_rejected",
      code: "seq_out_of_order",
      message: `Out-of-order action. Expected ${expectedSeq}, received ${clientSeq}.`,
      actionType,
      expectedClientSeq: expectedSeq,
    });
    return;
  }

  // Captured BEFORE applyAction: the engine mutates state in place and returns
  // the same reference, so reading room.state.phase afterwards would already
  // show the post-action phase and never detect a transition.
  const phaseBefore = room.state.phase;
  const turnPlayerBefore = room.state.currentPlayer;

  const result = applyAction(room.state, session.playerId, actionType, payload);
  const previousPhase = room.state.phase;
  room.state = result.state;

  if (actionType === "shop_ready") {
    const readyValue = payload.ready !== false;
    const syncResult = setShopReady(room, session.playerId, readyValue);
    if (syncResult.error) {
      send(ws, { type: "action_rejected", message: syncResult.error, reasonKey: syncResult.errorKey || null, actionType });
      return;
    }

    recordGameAction(room, session.playerId, "shop_ready", { ready: readyValue });
    syncClock(room);
    if (syncResult.startedRound) {
      // The only state transition the server initiates on its own; recorded
      // under playerId 0 so a replay can reproduce it.
      recordGameAction(room, 0, "shop_round_start", {});
    }

    playerState.lastClientSeq = clientSeq;
    room.seq += 1;
    room.lastActivityAt = Date.now();
    schedulePersistRooms().catch(() => {});
    broadcastState(room);
    notifyTurnIfOffline(room, turnPlayerBefore, phaseBefore);
    return;
  }

  if (result.error) {
    send(ws, {
      type: "action_rejected",
      message: result.error,
      reasonKey: result.errorKey || null,
      reasonParams: result.errorParams || null,
      actionType,
    });
    return;
  }

  if (previousPhase !== "shop" && room.state.phase === "shop") {
    room.shopSync = createShopSyncState();
  } else if (room.state.phase !== "shop") {
    room.shopSync = null;
  }

  playerState.lastClientSeq = clientSeq;
  recordGameAction(room, session.playerId, actionType, payload);
  syncClock(room);

  room.seq += 1;
  room.lastActivityAt = Date.now();
  schedulePersistRooms().catch(() => {});
  broadcastState(room);

  if (phaseBefore !== "game-over" && room.state.phase === "game-over") {
    onGameOver(room);
  } else {
    notifyTurnIfOffline(room, turnPlayerBefore, phaseBefore);
  }
}

function onChatSend(ws, message) {
  const session = wsToSession.get(ws);
  if (!session) {
    send(ws, { type: "error", code: "join_room_first", message: "Join a room first." });
    return;
  }

  const room = rooms.get(session.roomCode);
  if (!room || !room.started) {
    send(ws, { type: "error", code: "match_not_active", message: "Match is not active." });
    return;
  }

  if (!Array.isArray(room.chat)) {
    room.chat = [];
  }

  const name = room.players?.[session.playerId]?.name || `Player ${session.playerId}`;
  let chatMessage = null;

  if (message.kind === "quick") {
    // Quick-chat: a whitelisted i18n key, rate-limited, no free text.
    const key = typeof message.key === "string" ? message.key : "";
    if (!QUICK_CHAT_KEYS.has(key)) {
      return;
    }
    const now = Date.now();
    if (now - (session.lastQuickChatAt || 0) < QUICK_CHAT_MIN_INTERVAL_MS) {
      return;
    }
    session.lastQuickChatAt = now;
    chatMessage = {
      id: createToken().slice(0, 12),
      playerId: session.playerId,
      name,
      kind: "quick",
      key,
      at: now,
    };
  } else {
    const text = normalizeChatText(message.text);
    if (!text) {
      return;
    }
    chatMessage = {
      id: createToken().slice(0, 12),
      playerId: session.playerId,
      name,
      text,
      at: Date.now(),
    };
  }

  room.chat.push(chatMessage);
  if (room.chat.length > 100) {
    room.chat = room.chat.slice(-100);
  }

  forEachPlayerConnection(room, (peerWs) => {
    send(peerWs, {
      type: "chat_message",
      roomCode: room.code,
      message: chatMessage,
    });
  });

  schedulePersistRooms().catch(() => {});
}

function onLeaveRoom(ws) {
  removeFromQueueBySocket(ws);
  const session = wsToSession.get(ws);
  if (!session) {
    return;
  }

  wsToSession.delete(ws);
  const room = rooms.get(session.roomCode);
  if (!room) {
    return;
  }

  const player = room.players[session.playerId];
  if (player && player.token === session.token) {
    player.connected = false;
    player.ready = false;
    player.lastSeen = Date.now();
  }

  room.lastActivityAt = Date.now();
  broadcastWaitingState(room);
  schedulePersistRooms().catch(() => {});
}

/* ------------------------------------------------------------ push triggers */

// Correspondence play only works if the absent player learns it's their move,
// so pushes go out exactly when the recipient is NOT connected.
function notifyTurnIfOffline(room, turnPlayerBefore, phaseBefore) {
  const state = room.state;
  if (!state) {
    return;
  }

  const opponentOf = (seat) => (seat === 1 ? 2 : 1);

  if (state.phase === "round" && state.currentPlayer !== turnPlayerBefore) {
    pushToSeatIfOffline(room, state.currentPlayer, "your_turn");
    return;
  }

  // A round ending parks both players in the shop; nudge whoever is away.
  if (phaseBefore !== "shop" && state.phase === "shop") {
    for (const seat of [1, 2]) {
      pushToSeatIfOffline(room, seat, "shop_open");
    }
    return;
  }

  void opponentOf;
}

function notifyRematchRequested(room, requesterSeat) {
  pushToSeatIfOffline(room, requesterSeat === 1 ? 2 : 1, "rematch");
}

function notifyOpponentJoined(room, joinerSeat) {
  pushToSeatIfOffline(room, joinerSeat === 1 ? 2 : 1, "opponent_joined");
}

function pushToSeatIfOffline(room, seat, kind) {
  const player = room.players[seat];
  if (!player || player.connected || !player.guestId) {
    return;
  }
  const opponent = room.players[seat === 1 ? 2 : 1];
  sendPush(getPlayerIdByGuestId(player.guestId), kind, {
    roomCode: room.code,
    opponentName: opponent?.name || "",
  });
}

/* ------------------------------------------------------------------ clock */
//
// The clock is deliberately NOT part of the game state: the state is recorded
// and replayed move by move, and baking wall-clock times into it would make
// every replay disagree with itself. It lives on the room, the server owns it,
// and clients only ever receive a snapshot to count down from.

function startClock(room) {
  if (!room.ranked) {
    return;
  }
  room.clock = { 1: CLOCK_BUDGET_MS, 2: CLOCK_BUDGET_MS, running: null, since: 0 };
  syncClock(room);
}

// Charges the player whose time was running, then starts whoever is on move.
// Only the round phase is timed — both players shop at once, and thinking there
// is part of the game rather than a race.
function syncClock(room) {
  const clock = room.clock;
  if (!clock) {
    return;
  }

  const now = Date.now();
  if (clock.running && clock.since) {
    clock[clock.running] = Math.max(0, clock[clock.running] - (now - clock.since));
  }

  const shouldRun = room.state?.phase === "round" && !room.state.gameWinner;
  clock.running = shouldRun ? room.state.currentPlayer : null;
  clock.since = shouldRun ? now : 0;
}

function clockPayload(room) {
  const clock = room.clock;
  if (!clock) {
    return null;
  }
  // `since` lets a client show a smooth countdown between snapshots without
  // trusting its own idea of what time it is.
  const elapsed = clock.running && clock.since ? Date.now() - clock.since : 0;
  return {
    1: Math.max(0, clock[1] - (clock.running === 1 ? elapsed : 0)),
    2: Math.max(0, clock[2] - (clock.running === 2 ? elapsed : 0)),
    running: clock.running,
    budget: CLOCK_BUDGET_MS,
  };
}

// Nobody sends an action when they stall, so expiry has to be looked for.
function sweepClocks() {
  for (const room of rooms.values()) {
    const clock = room.clock;
    if (!clock?.running || !room.started || room.state?.phase !== "round" || room.state.gameWinner) {
      continue;
    }
    if (clock[clock.running] - (Date.now() - clock.since) > 0) {
      continue;
    }

    const loser = clock.running;
    clock[loser] = 0;
    clock.running = null;
    clock.since = 0;

    applyForfeit(room.state, loser);
    recordGameAction(room, loser, "forfeit", {});
    room.seq += 1;
    room.lastActivityAt = Date.now();
    schedulePersistRooms().catch(() => {});
    broadcastState(room);
    onGameOver(room);
  }
}

function broadcastState(room) {
  forEachPlayerConnection(room, (ws, playerId) => {
    send(ws, {
      type: "state_snapshot",
      roomCode: room.code,
      seq: room.seq,
      state: room.state,
      chat: Array.isArray(room.chat) ? room.chat : [],
      playerId,
      playerNames: getRoomPlayerNames(room),
      playerAvatars: getRoomPlayerAvatars(room),
      shopSync: getShopSyncPayload(room, playerId),
      clock: clockPayload(room),
    });
  });
}

function broadcastWaitingState(room) {
  forEachPlayerConnection(room, (ws, playerId) => {
    sendWaitingSnapshot(ws, room, playerId, room.players[playerId].token);
  });
}

function sendWaitingSnapshot(ws, room, playerId, token) {
  const you = room.players[playerId];
  const opp = room.players[playerId === 1 ? 2 : 1];
  send(ws, {
    type: "waiting_snapshot",
    roomCode: room.code,
    playerId,
    token,
    youName: you.name || `Player ${playerId}`,
    opponentName: opp.name || `Player ${playerId === 1 ? 2 : 1}`,
    playerNames: getRoomPlayerNames(room),
    playerAvatars: getRoomPlayerAvatars(room),
    started: room.started,
    youReady: you.ready,
    opponentJoined: Boolean(opp.token),
    opponentReady: opp.ready,
    bothReady: you.ready && opp.ready,
    canStart: Boolean(opp.token) && you.ready && opp.ready,
    yourConnected: you.connected,
    opponentConnected: opp.connected,
    nextClientSeq: you.lastClientSeq + 1,
  });
}

function forEachPlayerConnection(room, visitor) {
  [1, 2].forEach((playerId) => {
    const player = room.players[playerId];
    if (!player.ws || player.ws.readyState !== 1) {
      return;
    }
    visitor(player.ws, playerId);
  });
}

function connectedCount() {
  let count = 0;
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      count += 1;
    }
  }
  return count;
}

function broadcastPresence() {
  const count = connectedCount();
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      send(client, { type: "presence", count });
    }
  }
}

function attachSession(ws, roomCode, playerId, token) {
  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }

  if (room.players[playerId].ws && room.players[playerId].ws !== ws) {
    try {
      room.players[playerId].ws.close();
    } catch {}
  }

  room.players[playerId].ws = ws;
  room.players[playerId].connected = true;
  room.players[playerId].lastSeen = Date.now();

  wsToSession.set(ws, { roomCode, playerId, token });
}

function createPlayerRecord(token, name, avatar = null, guestId = null) {
  return {
    token,
    name: normalizeDisplayName(name, "Player"),
    avatar: normalizeAvatar(avatar),
    guestId: normalizeGuestId(guestId),
    ready: false,
    connected: Boolean(token),
    lastSeen: Date.now(),
    lastClientSeq: 0,
    ws: null,
  };
}

// Called whenever a seat is claimed or reclaimed: keeps the DB row's name and
// avatar in step with what the player is currently using.
function registerSeatIdentity(room, playerId, guestId) {
  const player = room.players[playerId];
  if (!player) {
    return;
  }
  const normalized = normalizeGuestId(guestId);
  if (normalized) {
    player.guestId = normalized;
  }
  if (player.guestId) {
    upsertPlayer(player.guestId, player.name, player.avatar);
  }
}

/* ------------------------------------------------- game recording (replays) */

// One games row per match, created at the three places a fresh state is dealt:
// onStartMatch, createInstantMatch and a completed rematch.
function beginGameRecording(room) {
  room.resultRecorded = false;
  room.actionCount = 0;
  room.gameId = insertGame({
    roomCode: room.code,
    engineVersion: ENGINE_VERSION,
    schemaVersion: room.state?.schemaVersion ?? 5,
    initialState: room.state,
    p1PlayerId: getPlayerIdByGuestId(room.players[1]?.guestId),
    p2PlayerId: getPlayerIdByGuestId(room.players[2]?.guestId),
    p1Name: room.players[1]?.name || null,
    p2Name: room.players[2]?.name || null,
    p1Avatar: room.players[1]?.avatar || null,
    p2Avatar: room.players[2]?.avatar || null,
  });
}

function recordGameAction(room, playerId, actionType, payload) {
  if (!room.gameId) {
    return;
  }
  room.actionCount = Number(room.actionCount || 0);
  insertGameAction(room.gameId, room.actionCount, playerId, actionType, payload);
  room.actionCount += 1;
}

// The engine flips phase to "game-over" on its own, so there is no server-side
// end-of-game event: onAction detects the transition and calls this.
function onGameOver(room) {
  if (room.resultRecorded) {
    return;
  }
  room.resultRecorded = true;

  const state = room.state;
  const winner = state.gameWinner || null;

  finishGame(room.gameId, {
    winner,
    reason: state.gameWinnerReason || null,
    p1Points: state.players[1].points,
    p2Points: state.players[2].points,
    rounds: state.roundNumber,
    finalCheck: {
      winner,
      p1: state.players[1].points,
      p2: state.players[2].points,
      rounds: state.roundNumber,
      turnNumber: state.turnNumber,
    },
  });

  const seatPlayerIds = {
    1: getPlayerIdByGuestId(room.players[1]?.guestId),
    2: getPlayerIdByGuestId(room.players[2]?.guestId),
  };

  for (const seat of [1, 2]) {
    const rowId = seatPlayerIds[seat];
    if (!rowId) {
      continue;
    }
    const outcome = !winner ? "draw" : (winner === seat ? "win" : "loss");
    recordPlayerOutcome(rowId, outcome);
  }

  applyRatingsIfRanked(room, seatPlayerIds, winner);
}

// Rated only when both seats belong to an account: a guest has no identity that
// survives a cleared browser, so letting one move ratings would be farmable.
function applyRatingsIfRanked(room, seatPlayerIds, winner) {
  const p1Id = seatPlayerIds[1];
  const p2Id = seatPlayerIds[2];
  if (!p1Id || !p2Id || p1Id === p2Id) {
    return;
  }
  if (!isAccountPlayer(p1Id) || !isAccountPlayer(p2Id)) {
    return;
  }
  // Only quick play and accepted ranked challenges count. A room joined by
  // code is a friendly game even between two accounts — otherwise two friends
  // could trade wins to inflate each other.
  if (!room.ranked) {
    return;
  }

  const p1 = getRatingSnapshot(p1Id);
  const p2 = getRatingSnapshot(p2Id);
  if (!p1 || !p2) {
    return;
  }

  const { p1After, p2After } = computeRatingChange(p1, p2, winner);
  applyRating(p1Id, p1After);
  applyRating(p2Id, p2After);
  recordGameRatings(room.gameId, {
    p1Before: p1.rating,
    p2Before: p2.rating,
    p1After,
    p2After,
  });
}

function normalizeAvatar(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const glyph = typeof value.glyph === "string" ? value.glyph.toLowerCase() : "";
  const color = typeof value.color === "string" ? value.color.toLowerCase() : "";
  if (!AVATAR_GLYPHS.has(glyph) || !AVATAR_COLORS.has(color)) {
    return null;
  }
  return { glyph, color };
}

function getRoomPlayerAvatars(room) {
  return {
    1: room.players[1]?.avatar || null,
    2: room.players[2]?.avatar || null,
  };
}

function createShopSyncState() {
  return {
    ready: { 1: false, 2: false },
    firstReadyPlayerId: null,
  };
}

function setShopReady(room, playerId, ready) {
  if (!room.state || room.state.phase !== "shop") {
    return { error: "Shop ready is only available in shop phase.", errorKey: "err.shopReadyOnly", startedRound: false };
  }

  if (!room.shopSync) {
    room.shopSync = createShopSyncState();
  }

  const opponentId = playerId === 1 ? 2 : 1;
  room.shopSync.ready[playerId] = Boolean(ready);

  if (room.shopSync.ready[1] && room.shopSync.ready[2]) {
    return startRoundAfterShopReady(room);
  }

  room.shopSync.firstReadyPlayerId = room.shopSync.ready[playerId]
    ? playerId
    : (room.shopSync.ready[opponentId] ? opponentId : null);

  return { error: null, startedRound: false };
}

function startRoundAfterShopReady(room) {
  if (!room.state || room.state.phase !== "shop") {
    return { error: "Shop phase is not active.", errorKey: "err.shopNotActive", startedRound: false };
  }

  const result = startRoundFromShop(room.state);
  room.state = result.state;
  if (result.error) {
    return { error: result.error, startedRound: false };
  }

  room.shopSync = null;
  return { error: null, startedRound: true };
}

function getRoomPlayerNames(room) {
  return {
    1: room.players[1]?.name || "Player 1",
    2: room.players[2]?.name || "Player 2",
  };
}

function getShopSyncPayload(room, playerId) {
  if (!room.shopSync || !room.state || room.state.phase !== "shop") {
    return null;
  }

  const opponentId = playerId === 1 ? 2 : 1;

  return {
    youReady: Boolean(room.shopSync.ready[playerId]),
    opponentReady: Boolean(room.shopSync.ready[opponentId]),
    firstReadyPlayerId: room.shopSync.firstReadyPlayerId,
  };
}

function normalizeDisplayName(value, fallback = "Guest") {
  const text = typeof value === "string" ? value : "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  const clipped = collapsed.slice(0, 14);
  return clipped || fallback;
}

function normalizeChatText(value) {
  if (typeof value !== "string") {
    return "";
  }
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, 180);
}

function removeFromQueueBySocket(ws) {
  const index = quickQueue.findIndex((entry) => entry.ws === ws);
  if (index < 0) {
    return false;
  }

  quickQueue.splice(index, 1);
  return true;
}

function normalizeGuestId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const id = value.trim();
  return /^[a-z0-9-]{6,64}$/i.test(id) ? id : null;
}

function isSocketOpen(ws) {
  return ws && ws.readyState === 1;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 6; i += 1) {
      const idx = Math.floor(Math.random() * chars.length);
      code += chars[idx];
    }
  } while (rooms.has(code));
  return code;
}

function normalizeRoomCode(value) {
  if (typeof value !== "string") {
    return null;
  }

  const code = value.trim().toUpperCase();
  return /^[A-Z2-9]{6}$/.test(code) ? code : null;
}

function createToken() {
  return randomBytes(24).toString("hex");
}

function send(ws, payload) {
  if (ws.readyState !== 1) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

async function loadRooms() {
  try {
    const raw = await fs.readFile(PERSIST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.rooms)) {
      return;
    }

    parsed.rooms.forEach((entry) => {
      if (!entry || typeof entry.code !== "string") {
        return;
      }

      rooms.set(entry.code, {
        code: entry.code,
        createdAt: entry.createdAt || Date.now(),
        started: Boolean(entry.started),
        seq: Number(entry.seq || 0),
        state: entry.state ? restoreState(entry.state) : null,
        chat: Array.isArray(entry.chat) ? entry.chat.slice(-100) : [],
        shopSync: entry.shopSync || null,
        ranked: Boolean(entry.ranked),
        gameId: Number.isInteger(entry.gameId) ? entry.gameId : null,
        actionCount: Number(entry.actionCount || 0),
        resultRecorded: Boolean(entry.resultRecorded),
        lastActivityAt: Number(entry.lastActivityAt || 0) || null,
        players: {
          1: {
            ...createPlayerRecord(entry.players?.[1]?.token || null, entry.players?.[1]?.name || "Player 1", entry.players?.[1]?.avatar),
            guestId: entry.players?.[1]?.guestId || null,
            ready: Boolean(entry.players?.[1]?.ready),
            connected: false,
            lastClientSeq: Number(entry.players?.[1]?.lastClientSeq || 0),
          },
          2: {
            ...createPlayerRecord(entry.players?.[2]?.token || null, entry.players?.[2]?.name || "Player 2", entry.players?.[2]?.avatar),
            guestId: entry.players?.[2]?.guestId || null,
            ready: Boolean(entry.players?.[2]?.ready),
            connected: false,
            lastClientSeq: Number(entry.players?.[2]?.lastClientSeq || 0),
          },
        },
      });
    });
  } catch {
    // No persisted rooms yet.
  }
}

function serializeRooms() {
  return {
    rooms: [...rooms.values()].map((room) => ({
      code: room.code,
      createdAt: room.createdAt,
      started: room.started,
      seq: room.seq,
      state: room.state,
      chat: Array.isArray(room.chat) ? room.chat.slice(-100) : [],
      shopSync: room.shopSync,
      ranked: Boolean(room.ranked),
      gameId: room.gameId || null,
      actionCount: room.actionCount || 0,
      resultRecorded: Boolean(room.resultRecorded),
      lastActivityAt: room.lastActivityAt || null,
      players: {
        1: serializePlayer(room.players[1]),
        2: serializePlayer(room.players[2]),
      },
    })),
  };
}

function serializePlayer(player) {
  return {
    token: player.token,
    name: player.name,
    avatar: player.avatar,
    guestId: player.guestId || null,
    ready: player.ready,
    lastSeen: player.lastSeen,
    lastClientSeq: player.lastClientSeq,
  };
}

let persistTimer = null;
function schedulePersistRooms() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  return new Promise((resolve, reject) => {
    persistTimer = setTimeout(async () => {
      persistTimer = null;
      try {
        await fs.writeFile(PERSIST_PATH, `${JSON.stringify(serializeRooms(), null, 2)}\n`, "utf8");
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 100);
  });
}

// Immediate write for shutdown — cancels any pending debounced write.
async function flushRoomsNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await fs.writeFile(PERSIST_PATH, `${JSON.stringify(serializeRooms(), null, 2)}\n`, "utf8");
}
