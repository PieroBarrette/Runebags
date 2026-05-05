import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import {
  createInitialState,
  enterShopPhase,
  playTurn,
  resolvePendingBoardChoice,
  restoreState,
  selectRune,
  setShopMode,
  shopSelectBagRune,
  shopSelectOfferRune,
  startRoundFromShop,
  switchShopPlayer,
} from "../js/core/gameState.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_ROOT = ROOT;
const PERSIST_PATH = path.join(__dirname, "rooms.json");
const PORT = Number(process.env.PORT || 8080);
const SHOP_READY_TIMEOUT_MS = 180000;

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

await loadRooms();

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
      send(ws, { type: "error", message: "Invalid JSON message." });
      return;
    }

    handleMessage(ws, message);
  });

  ws.on("close", () => {
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
      player.lastSeen = Date.now();
      broadcastWaitingState(room);
      persistRooms().catch(() => {});
    }
  });

  send(ws, { type: "hello", message: "RuneBags online socket ready." });
});

server.listen(PORT, () => {
  console.log(`RuneBags online server listening on http://127.0.0.1:${PORT}`);
});

setInterval(() => {
  processShopDeadlines();
}, 1000);

async function handleHttp(req, res) {
  const reqPath = decodeURIComponent((req.url || "/").split("?")[0]);
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

function handleMessage(ws, message) {
  if (!message || typeof message.type !== "string") {
    send(ws, { type: "error", message: "Malformed message." });
    return;
  }

  switch (message.type) {
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
    case "reconnect":
      return onReconnect(ws, message);
    case "leave_room":
      return onLeaveRoom(ws);
    case "ping":
      return send(ws, { type: "pong", ts: Date.now() });
    default:
      return send(ws, { type: "error", message: `Unknown message type: ${message.type}` });
  }
}

function onQueueJoin(ws, message) {
  const guestId = normalizeGuestId(message.guestId);
  if (!guestId) {
    send(ws, { type: "error", message: "Invalid guest id for quick play." });
    return;
  }

  const displayName = normalizeDisplayName(message.displayName, `Guest-${guestId.slice(-4).toUpperCase()}`);

  const existing = quickQueue.find((entry) => entry.ws === ws);
  if (!existing) {
    quickQueue.push({ ws, guestId, displayName, joinedAt: Date.now() });
  } else {
    existing.displayName = displayName;
  }

  const position = quickQueue.findIndex((entry) => entry.ws === ws) + 1;
  send(ws, {
    type: "queue_status",
    queued: true,
    position,
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
    message: removed ? "Quick play cancelled." : "Not currently in queue.",
  });
}

function tryMatchQueue() {
  while (quickQueue.length >= 2) {
    const first = quickQueue.shift();
    const second = quickQueue.shift();

    if (!isSocketOpen(first.ws) || !isSocketOpen(second.ws)) {
      if (isSocketOpen(first.ws)) {
        send(first.ws, { type: "queue_status", queued: true, position: 1, message: "Searching for opponent..." });
      }
      if (isSocketOpen(second.ws)) {
        send(second.ws, { type: "queue_status", queued: true, position: 1, message: "Searching for opponent..." });
      }
      continue;
    }

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
    shopSync: createShopSyncState(),
    players: {
      1: createPlayerRecord(token1, normalizeDisplayName(firstEntry?.displayName, "Player 1")),
      2: createPlayerRecord(token2, normalizeDisplayName(secondEntry?.displayName, "Player 2")),
    },
  };

  room.players[1].ready = true;
  room.players[2].ready = true;

  rooms.set(roomCode, room);
  attachSession(firstWs, roomCode, 1, token1);
  attachSession(secondWs, roomCode, 2, token2);

  send(firstWs, { type: "queue_matched", roomCode, playerId: 1 });
  send(secondWs, { type: "queue_matched", roomCode, playerId: 2 });

  sendWaitingSnapshot(firstWs, room, 1, token1);
  sendWaitingSnapshot(secondWs, room, 2, token2);
  broadcastState(room);
  persistRooms().catch(() => {});
}

function onCreateRoom(ws, message) {
  const roomCode = normalizeRoomCode(message.roomCode) || generateRoomCode();
  if (rooms.has(roomCode)) {
    send(ws, { type: "error", message: "Room already exists." });
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
    shopSync: null,
    players: {
      1: createPlayerRecord(token, displayName),
      2: createPlayerRecord(null, "Player 2"),
    },
  };

  rooms.set(roomCode, room);
  attachSession(ws, roomCode, 1, token);
  persistRooms().catch(() => {});

  sendWaitingSnapshot(ws, room, 1, token);
}

function onJoinRoom(ws, message) {
  const roomCode = normalizeRoomCode(message.roomCode);
  const room = roomCode ? rooms.get(roomCode) : null;
  if (!room) {
    send(ws, { type: "error", message: "Room not found." });
    return;
  }

  if (room.started && !message.token) {
    const reclaimPlayerId = [1, 2].find((id) => {
      const player = room.players[id];
      if (!player?.token || player.connected) {
        return false;
      }
      return true;
    });

    if (!reclaimPlayerId) {
      send(ws, { type: "error", message: "Match already started. Reconnect with token." });
      return;
    }

    const newToken = createToken();
    room.players[reclaimPlayerId].token = newToken;
    room.players[reclaimPlayerId].name = normalizeDisplayName(
      message.displayName,
      room.players[reclaimPlayerId].name || `Player ${reclaimPlayerId}`,
    );
    attachSession(ws, room.code, reclaimPlayerId, newToken);
    persistRooms().catch(() => {});

    sendWaitingSnapshot(ws, room, reclaimPlayerId, newToken);
    send(ws, {
      type: "state_snapshot",
      roomCode: room.code,
      seq: room.seq,
      state: room.state,
      playerId: reclaimPlayerId,
      playerNames: getRoomPlayerNames(room),
      shopSync: getShopSyncPayload(room, reclaimPlayerId),
    });
    broadcastWaitingState(room);
    return;
  }

  if (message.token) {
    return onReconnect(ws, message);
  }

  if (room.players[2].token && room.players[2].connected) {
    send(ws, { type: "error", message: "Room is full." });
    return;
  }

  const playerId = room.players[1].token ? 2 : 1;
  const token = createToken();
  const defaultName = playerId === 1 ? "Player 1" : "Player 2";
  room.players[playerId] = createPlayerRecord(token, normalizeDisplayName(message.displayName, defaultName));
  attachSession(ws, room.code, playerId, token);
  persistRooms().catch(() => {});

  sendWaitingSnapshot(ws, room, playerId, token);
  broadcastWaitingState(room);
}

function onReconnect(ws, message) {
  const roomCode = normalizeRoomCode(message.roomCode);
  const token = typeof message.token === "string" ? message.token : "";

  const room = roomCode ? rooms.get(roomCode) : null;
  if (!room || !token) {
    send(ws, { type: "error", message: "Reconnect failed." });
    return;
  }

  const playerId = [1, 2].find((id) => room.players[id].token === token);
  if (!playerId) {
    send(ws, { type: "error", message: "Reconnect token invalid." });
    return;
  }

  room.players[playerId].connected = true;
  room.players[playerId].lastSeen = Date.now();
  room.players[playerId].name = normalizeDisplayName(
    message.displayName,
    room.players[playerId].name || `Player ${playerId}`,
  );

  attachSession(ws, room.code, playerId, token);
  persistRooms().catch(() => {});

  sendWaitingSnapshot(ws, room, playerId, token);
  if (room.started && room.state) {
    send(ws, {
      type: "state_snapshot",
      roomCode: room.code,
      seq: room.seq,
      state: room.state,
      playerId,
      playerNames: getRoomPlayerNames(room),
      shopSync: getShopSyncPayload(room, playerId),
    });
  }

  broadcastWaitingState(room);
}

function onSetReady(ws, message) {
  const session = wsToSession.get(ws);
  if (!session) {
    send(ws, { type: "error", message: "Join a room first." });
    return;
  }

  const room = rooms.get(session.roomCode);
  if (!room || room.started) {
    send(ws, { type: "error", message: "Cannot change readiness now." });
    return;
  }

  room.players[session.playerId].ready = Boolean(message.ready);
  persistRooms().catch(() => {});
  broadcastWaitingState(room);
}

function onStartMatch(ws) {
  const session = wsToSession.get(ws);
  if (!session) {
    send(ws, { type: "error", message: "Join a room first." });
    return;
  }

  const room = rooms.get(session.roomCode);
  if (!room) {
    send(ws, { type: "error", message: "Room not found." });
    return;
  }

  if (room.started) {
    send(ws, { type: "error", message: "Match already started." });
    return;
  }

  if (!room.players[1].token || !room.players[2].token) {
    send(ws, { type: "error", message: "Need two players in room." });
    return;
  }

  if (!room.players[1].ready || !room.players[2].ready) {
    send(ws, { type: "error", message: "Both players must be ready." });
    return;
  }

  room.state = restoreState(createInitialState());
  room.shopSync = createShopSyncState();
  room.started = true;
  room.seq += 1;
  room.players[1].lastClientSeq = 0;
  room.players[2].lastClientSeq = 0;

  persistRooms().catch(() => {});
  broadcastWaitingState(room);
  broadcastState(room);
}

function onAction(ws, message) {
  const session = wsToSession.get(ws);
  if (!session) {
    send(ws, { type: "error", message: "Join a room first." });
    return;
  }

  const room = rooms.get(session.roomCode);
  if (!room || !room.started || !room.state) {
    send(ws, { type: "error", message: "Match is not active." });
    return;
  }

  const actionType = message.actionType;
  const payload = message.payload || {};
  const clientSeq = Number(message.clientSeq);

  if (actionType === "phase_action" && room.state.phase === "shop") {
    send(ws, { type: "action_rejected", message: "Use Shop Ready in online shop phase.", actionType });
    return;
  }

  if (!Number.isInteger(clientSeq)) {
    send(ws, { type: "action_rejected", message: "Missing action sequence number.", actionType });
    return;
  }

  const playerState = room.players[session.playerId];
  const expectedSeq = playerState.lastClientSeq + 1;
  if (clientSeq !== expectedSeq) {
    send(ws, {
      type: "action_rejected",
      message: `Out-of-order action. Expected ${expectedSeq}, received ${clientSeq}.`,
      actionType,
      expectedClientSeq: expectedSeq,
    });
    return;
  }

  const result = applyAction(room.state, session.playerId, actionType, payload);
  const previousPhase = room.state.phase;
  room.state = result.state;

  if (actionType === "shop_ready") {
    const readyValue = payload.ready !== false;
    const syncResult = setShopReady(room, session.playerId, readyValue);
    if (syncResult.error) {
      send(ws, { type: "action_rejected", message: syncResult.error, actionType });
      return;
    }

    if (syncResult.startedRound) {
      playerState.lastClientSeq = clientSeq;
      room.seq += 1;
      persistRooms().catch(() => {});
      broadcastState(room);
      return;
    }

    playerState.lastClientSeq = clientSeq;
    room.seq += 1;
    persistRooms().catch(() => {});
    broadcastState(room);
    return;
  }

  if (result.error) {
    send(ws, { type: "action_rejected", message: result.error, actionType });
    return;
  }

  if (previousPhase !== "shop" && room.state.phase === "shop") {
    room.shopSync = createShopSyncState();
  } else if (room.state.phase !== "shop") {
    room.shopSync = null;
  }

  playerState.lastClientSeq = clientSeq;

  room.seq += 1;
  persistRooms().catch(() => {});
  broadcastState(room);
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

  broadcastWaitingState(room);
  persistRooms().catch(() => {});
}

function applyAction(state, playerId, actionType, payload) {
  if (actionType === "select_rune") {
    return selectRune(state, playerId, payload.runeInstanceId);
  }

  if (actionType === "board_click") {
    if (state.pendingAction) {
      if (!isPendingChooser(state, playerId)) {
        return { state, error: "Only the acting player can resolve this pending action." };
      }
      return resolvePendingBoardChoice(state, {
        row: Number(payload.row),
        col: Number(payload.col),
        column: Number(payload.column),
      });
    }
    if (state.currentPlayer !== playerId) {
      return { state, error: "Not your turn." };
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
    return { state, error: "Phase action is not available." };
  }

  if (actionType === "shop_ready") {
    if (state.phase !== "shop") {
      return { state, error: "Shop ready is only available in shop phase." };
    }
    return { state, error: null };
  }

  if (actionType === "shop_switch_player") {
    if (state.phase !== "shop") {
      return { state, error: "Cannot switch shop player now." };
    }
    const original = state.shop.currentPlayer;
    state.shop.currentPlayer = playerId;
    const result = switchShopPlayer(state);
    state.shop.currentPlayer = original;
    return result;
  }

  if (actionType === "shop_set_mode") {
    if (state.phase !== "shop") {
      return { state, error: "Cannot set shop mode now." };
    }
    const original = state.shop.currentPlayer;
    state.shop.currentPlayer = playerId;
    const result = setShopMode(state, payload.mode ?? null);
    state.shop.currentPlayer = original;
    return result;
  }

  if (actionType === "shop_bag_select") {
    if (state.phase !== "shop") {
      return { state, error: "Cannot pick bag rune now." };
    }
    const original = state.shop.currentPlayer;
    state.shop.currentPlayer = playerId;
    const result = shopSelectBagRune(state, payload.runeInstanceId);
    state.shop.currentPlayer = original;
    return result;
  }

  if (actionType === "shop_offer_select") {
    if (state.phase !== "shop") {
      return { state, error: "Cannot pick offer rune now." };
    }
    const original = state.shop.currentPlayer;
    state.shop.currentPlayer = playerId;
    const result = shopSelectOfferRune(state, payload.runeInstanceId);
    state.shop.currentPlayer = original;
    return result;
  }

  return { state, error: `Unknown action type: ${actionType}` };
}

function isPendingChooser(state, playerId) {
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

function broadcastState(room) {
  forEachPlayerConnection(room, (ws, playerId) => {
    send(ws, {
      type: "state_snapshot",
      roomCode: room.code,
      seq: room.seq,
      state: room.state,
      playerId,
      playerNames: getRoomPlayerNames(room),
      shopSync: getShopSyncPayload(room, playerId),
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

function createPlayerRecord(token, name) {
  return {
    token,
    name: normalizeDisplayName(name, "Player"),
    ready: false,
    connected: Boolean(token),
    lastSeen: Date.now(),
    lastClientSeq: 0,
    ws: null,
  };
}

function createShopSyncState() {
  return {
    ready: { 1: false, 2: false },
    firstReadyPlayerId: null,
    deadlineAt: null,
  };
}

function setShopReady(room, playerId, ready) {
  if (!room.state || room.state.phase !== "shop") {
    return { error: "Shop ready is only available in shop phase.", startedRound: false };
  }

  if (!room.shopSync) {
    room.shopSync = createShopSyncState();
  }

  const opponentId = playerId === 1 ? 2 : 1;
  room.shopSync.ready[playerId] = Boolean(ready);

  if (room.shopSync.ready[1] && room.shopSync.ready[2]) {
    return startRoundAfterShopReady(room);
  }

  if (room.shopSync.ready[playerId] && !room.shopSync.ready[opponentId]) {
    room.shopSync.firstReadyPlayerId = playerId;
    room.shopSync.deadlineAt = Date.now() + SHOP_READY_TIMEOUT_MS;
  }

  if (!room.shopSync.ready[playerId]) {
    room.shopSync.firstReadyPlayerId = room.shopSync.ready[opponentId] ? opponentId : null;
    room.shopSync.deadlineAt = room.shopSync.ready[opponentId] ? Date.now() + SHOP_READY_TIMEOUT_MS : null;
  }

  return { error: null, startedRound: false };
}

function startRoundAfterShopReady(room) {
  if (!room.state || room.state.phase !== "shop") {
    return { error: "Shop phase is not active.", startedRound: false };
  }

  const result = startRoundFromShop(room.state);
  room.state = result.state;
  if (result.error) {
    return { error: result.error, startedRound: false };
  }

  room.shopSync = null;
  return { error: null, startedRound: true };
}

function processShopDeadlines() {
  const now = Date.now();
  let changed = false;

  rooms.forEach((room) => {
    if (!room.started || !room.state || room.state.phase !== "shop" || !room.shopSync?.deadlineAt) {
      return;
    }

    if (now < room.shopSync.deadlineAt) {
      return;
    }

    const sync = room.shopSync;
    if (sync.ready[1] && sync.ready[2]) {
      return;
    }

    const starter = sync.firstReadyPlayerId || (sync.ready[1] ? 1 : sync.ready[2] ? 2 : null);
    if (starter) {
      const starterName = room.players[starter]?.name || `Player ${starter}`;
      room.state.log.unshift(`Shop timer expired. ${starterName} was ready, so round starts automatically.`);
    } else {
      room.state.log.unshift("Shop timer expired. Round starts automatically.");
    }

    const started = startRoundAfterShopReady(room);
    if (started.error) {
      return;
    }

    room.seq += 1;
    broadcastState(room);
    changed = true;
  });

  if (changed) {
    persistRooms().catch(() => {});
  }
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
  const deadlineAt = room.shopSync.deadlineAt || null;
  const secondsRemaining = deadlineAt ? Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)) : 0;

  return {
    youReady: Boolean(room.shopSync.ready[playerId]),
    opponentReady: Boolean(room.shopSync.ready[opponentId]),
    deadlineAt,
    secondsRemaining,
    firstReadyPlayerId: room.shopSync.firstReadyPlayerId,
  };
}

function normalizeDisplayName(value, fallback = "Guest") {
  const text = typeof value === "string" ? value : "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  const clipped = collapsed.slice(0, 14);
  return clipped || fallback;
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
        shopSync: entry.shopSync || null,
        players: {
          1: {
            ...createPlayerRecord(entry.players?.[1]?.token || null, entry.players?.[1]?.name || "Player 1"),
            ready: Boolean(entry.players?.[1]?.ready),
            connected: false,
            lastClientSeq: Number(entry.players?.[1]?.lastClientSeq || 0),
          },
          2: {
            ...createPlayerRecord(entry.players?.[2]?.token || null, entry.players?.[2]?.name || "Player 2"),
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

let persistTimer = null;
function persistRooms() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  return new Promise((resolve, reject) => {
    persistTimer = setTimeout(async () => {
      persistTimer = null;
      try {
        const data = {
          rooms: [...rooms.values()].map((room) => ({
            code: room.code,
            createdAt: room.createdAt,
            started: room.started,
            seq: room.seq,
            state: room.state,
            shopSync: room.shopSync,
            players: {
              1: {
                token: room.players[1].token,
                name: room.players[1].name,
                ready: room.players[1].ready,
                lastSeen: room.players[1].lastSeen,
                lastClientSeq: room.players[1].lastClientSeq,
              },
              2: {
                token: room.players[2].token,
                name: room.players[2].name,
                ready: room.players[2].ready,
                lastSeen: room.players[2].lastSeen,
                lastClientSeq: room.players[2].lastClientSeq,
              },
            },
          })),
        };

        await fs.writeFile(PERSIST_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 100);
  });
}
