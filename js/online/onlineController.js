const STORAGE_PREFIX = "runebags-online-token:";
const GUEST_ID_KEY = "runebags-guest-id";
const DISPLAY_NAME_KEY = "runebags-display-name";
const AVATAR_KEY = "runebags-avatar-v1";

// Kept in sync with the server's allowlists (server.mjs). The picker UI is
// built from these same sets.
export const AVATAR_GLYPHS = [
  "algiz", "ansuz", "dagaz", "ehwaz", "fehu", "gebo",
  "kenaz", "odal", "raido", "sowelu", "teiwaz", "wunjo",
];
export const AVATAR_COLORS = ["gold", "ember", "moss", "fjord", "amethyst", "frost"];

export const QUICK_CHAT_KEYS = [
  "qc.hello", "qc.goodLuck", "qc.wellPlayed", "qc.wow", "qc.thinking", "qc.goodGame",
];
const QUICK_CHAT_MIN_INTERVAL_MS = 1200;

// A first WS request to a sleeping Render free instance can hang for the
// whole cold start (~30-50 s). Surface a "waking up" hint quickly, keep the
// attempt alive long enough to survive the spin-up, and retry on failure.
const WAKE_HINT_DELAY_MS = 2500;
const CONNECT_ATTEMPT_TIMEOUT_MS = 45000;
const RETRY_DELAYS_MS = [2000, 5000, 9000];
const KEEPALIVE_INTERVAL_MS = 30000;

export function createOnlineController() {
  const listeners = {
    waiting: () => {},
    queue: () => {},
    state: () => {},
    chat: () => {},
    error: () => {},
    status: () => {},
    rematch: () => {},
    presence: () => {},
    wake: () => {},
  };

  const session = {
    socket: null,
    roomCode: null,
    playerId: null,
    token: null,
    seq: 0,
    clientSeq: 0,
    queued: false,
    guestId: loadOrCreateGuestId(),
    displayName: loadOrCreateDisplayName(),
    avatar: loadOrCreateAvatar(),
    started: false,
  };

  let connectPromise = null;
  let keepaliveTimer = null;
  let lastQuickChatAt = 0;

  function setListeners(next) {
    Object.assign(listeners, next || {});
  }

  function connect() {
    if (session.socket && session.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (connectPromise) {
      return connectPromise;
    }

    connectPromise = (async () => {
      const startedAt = Date.now();
      let attempt = 0;
      let wakeShown = false;

      const wakeTimer = window.setTimeout(() => {
        wakeShown = true;
        listeners.wake({ waking: true, attempt: 1 });
      }, WAKE_HINT_DELAY_MS);

      try {
        for (;;) {
          attempt += 1;
          try {
            await connectOnce();
            return;
          } catch (error) {
            if (attempt > RETRY_DELAYS_MS.length) {
              throw error;
            }
            wakeShown = true;
            listeners.wake({ waking: true, attempt: attempt + 1 });
            await sleep(RETRY_DELAYS_MS[attempt - 1]);
          }
        }
      } finally {
        window.clearTimeout(wakeTimer);
        if (wakeShown) {
          listeners.wake({ waking: false, attempt, elapsedMs: Date.now() - startedAt });
        }
        connectPromise = null;
      }
    })();

    return connectPromise;
  }

  function connectOnce() {
    return new Promise((resolve, reject) => {
      let socketUrl;
      try {
        socketUrl = resolveSocketUrl();
      } catch (error) {
        reject(error);
        return;
      }

      let settled = false;
      const ws = new WebSocket(socketUrl);
      session.socket = ws;

      const attemptTimeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            ws.close();
          } catch {
            // Already closing.
          }
          reject(new Error("socket_timeout"));
        }
      }, CONNECT_ATTEMPT_TIMEOUT_MS);

      ws.addEventListener("open", () => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(attemptTimeout);
        startKeepalive(ws);
        listeners.status({ key: "online.statusConnected" });
        resolve();
      });

      ws.addEventListener("error", () => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(attemptTimeout);
        reject(new Error("socket_error"));
      });

      ws.addEventListener("close", () => {
        stopKeepalive();
        listeners.status({ key: "online.statusDisconnected" });
        if (!settled) {
          settled = true;
          window.clearTimeout(attemptTimeout);
          reject(new Error("socket_closed"));
        }
      });

      ws.addEventListener("message", (event) => {
        let msg;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        handleServerMessage(msg);
      });
    });
  }

  // Periodic pings keep proxies from dropping an idle lobby socket while a
  // player waits for a friend to click the invite link.
  function startKeepalive(ws) {
    stopKeepalive();
    keepaliveTimer = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          // Socket is going away; the close handler cleans up.
        }
      } else {
        stopKeepalive();
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  function stopKeepalive() {
    if (keepaliveTimer) {
      window.clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  }

  async function createRoom(roomCode, displayName = session.displayName) {
    try {
      await connect();
      const normalizedName = normalizeDisplayName(displayName);
      session.displayName = normalizedName;
      saveDisplayName(normalizedName);
      send({ type: "create_room", roomCode, displayName: normalizedName, avatar: session.avatar, guestId: session.guestId });
      return true;
    } catch {
      listeners.error({ code: "client_connect_failed", message: "Failed to create room." });
      return false;
    }
  }

  async function joinRoom(roomCode, options = {}) {
    try {
      await connect();
      session.roomCode = roomCode;
      const allowReconnect = options.allowReconnect !== false;
      const normalizedName = normalizeDisplayName(options.displayName || session.displayName);
      session.displayName = normalizedName;
      saveDisplayName(normalizedName);
      const token = loadToken(roomCode);
      if (allowReconnect && token) {
        send({ type: "reconnect", roomCode, token, displayName: normalizedName, avatar: session.avatar, guestId: session.guestId });
        return true;
      }
      send({ type: "join_room", roomCode, displayName: normalizedName, avatar: session.avatar, guestId: session.guestId });
      return true;
    } catch {
      listeners.error({ code: "client_connect_failed", message: "Failed to join room." });
      return false;
    }
  }

  function setReady(ready) {
    send({ type: "set_ready", ready: Boolean(ready) });
  }

  function startMatch() {
    send({ type: "start_match" });
  }

  function leaveRoom() {
    cancelQueue();
    if (session.socket && session.socket.readyState === WebSocket.OPEN) {
      send({ type: "leave_room" });
      session.socket.close();
    }
    session.roomCode = null;
    session.playerId = null;
    session.token = null;
    session.started = false;
    session.seq = 0;
    session.clientSeq = 0;
  }

  function clearRoomToken(roomCode) {
    if (!roomCode) {
      return;
    }

    const key = `${STORAGE_PREFIX}${roomCode}`;
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
  }

  async function joinQueue(displayName = session.displayName) {
    try {
      await connect();
      const normalizedName = normalizeDisplayName(displayName);
      session.displayName = normalizedName;
      saveDisplayName(normalizedName);
      send({ type: "queue_join", guestId: session.guestId, displayName: normalizedName, avatar: session.avatar });
      return true;
    } catch {
      listeners.error({ code: "client_connect_failed", message: "Failed to join quick play queue." });
      return false;
    }
  }

  function setDisplayName(displayName) {
    const normalizedName = normalizeDisplayName(displayName);
    session.displayName = normalizedName;
    saveDisplayName(normalizedName);
  }

  function setAvatar(avatar) {
    const normalized = normalizeAvatar(avatar);
    if (!normalized) {
      return;
    }
    session.avatar = normalized;
    saveAvatar(normalized);
  }

  function getAvatar() {
    return { ...session.avatar };
  }

  function cancelQueue() {
    if (session.socket && session.socket.readyState === WebSocket.OPEN && session.queued) {
      send({ type: "queue_cancel" });
    }
    session.queued = false;
  }

  function sendAction(actionType, payload = {}) {
    session.clientSeq += 1;
    send({ type: "action", actionType, payload, clientSeq: session.clientSeq });
  }

  function sendChat(text) {
    const message = String(text || "").trim();
    if (!message) {
      return;
    }
    send({ type: "chat_send", text: message.slice(0, 180) });
  }

  function sendQuickChat(key) {
    if (!QUICK_CHAT_KEYS.includes(key)) {
      return false;
    }
    const now = Date.now();
    if (now - lastQuickChatAt < QUICK_CHAT_MIN_INTERVAL_MS) {
      return false;
    }
    lastQuickChatAt = now;
    send({ type: "chat_send", kind: "quick", key });
    return true;
  }

  function sendRematch() {
    send({ type: "rematch_request" });
  }

  function isOnlineActive() {
    return session.started;
  }

  function getSession() {
    return { ...session };
  }

  function send(payload) {
    if (!session.socket || session.socket.readyState !== WebSocket.OPEN) {
      listeners.error({ code: "client_not_connected", message: "Online server is not connected." });
      return;
    }
    session.socket.send(JSON.stringify(payload));
  }

  function handleServerMessage(msg) {
    if (msg.type === "error") {
      listeners.error({ code: msg.code || null, message: msg.message || "Server error." });
      return;
    }

    if (msg.type === "presence") {
      listeners.presence({ count: Number(msg.count) || 0 });
      return;
    }

    if (msg.type === "rematch_status") {
      listeners.rematch({
        youRequested: Boolean(msg.youRequested),
        opponentRequested: Boolean(msg.opponentRequested),
      });
      return;
    }

    if (msg.type === "hello") {
      if (typeof msg.online === "number") {
        listeners.presence({ count: msg.online });
      }
      return;
    }

    if (msg.type === "action_rejected") {
      if (typeof msg.expectedClientSeq === "number") {
        session.clientSeq = Math.max(0, msg.expectedClientSeq - 1);
      }
      listeners.error({
        code: msg.code || null,
        message: msg.message || "Action rejected by server.",
        reasonKey: msg.reasonKey || null,
        reasonParams: msg.reasonParams || null,
      });
      return;
    }

    if (msg.type === "waiting_snapshot") {
      session.roomCode = msg.roomCode;
      session.playerId = msg.playerId;
      session.token = msg.token || session.token;
      session.started = Boolean(msg.started);
      session.queued = false;
      if (typeof msg.nextClientSeq === "number") {
        session.clientSeq = Math.max(0, msg.nextClientSeq - 1);
      }

      if (session.roomCode && session.token) {
        saveToken(session.roomCode, session.token);
      }

      listeners.waiting({
        roomCode: msg.roomCode,
        playerId: msg.playerId,
        youName: msg.youName || session.displayName,
        opponentName: msg.opponentName || "Opponent",
        playerNames: msg.playerNames || null,
        playerAvatars: msg.playerAvatars || null,
        youReady: Boolean(msg.youReady),
        opponentJoined: Boolean(msg.opponentJoined),
        opponentReady: Boolean(msg.opponentReady),
        bothReady: Boolean(msg.bothReady),
        canStart: Boolean(msg.canStart),
        started: Boolean(msg.started),
        opponentConnected: Boolean(msg.opponentConnected),
        nextClientSeq: Number(msg.nextClientSeq || 1),
      });
      return;
    }

    if (msg.type === "state_snapshot") {
      if (typeof msg.seq === "number" && msg.seq < session.seq) {
        return;
      }

      session.seq = msg.seq;
      session.started = true;
      session.queued = false;
      session.playerId = msg.playerId;
      listeners.state({
        state: msg.state,
        seq: msg.seq,
        playerId: msg.playerId,
        roomCode: msg.roomCode,
        playerNames: msg.playerNames || null,
        playerAvatars: msg.playerAvatars || null,
        shopSync: msg.shopSync || null,
        chat: Array.isArray(msg.chat) ? msg.chat : [],
      });
      return;
    }

    if (msg.type === "chat_message") {
      listeners.chat(msg.message || null);
      return;
    }

    if (msg.type === "queue_status") {
      session.queued = Boolean(msg.queued);
      listeners.queue({
        queued: session.queued,
        position: Number(msg.position || 0),
        code: msg.code || null,
        message: msg.message || "",
      });
      return;
    }

    if (msg.type === "queue_matched") {
      session.roomCode = msg.roomCode;
      session.playerId = msg.playerId;
      session.queued = false;
      listeners.status({ key: "online.statusOpponentFound" });
    }
  }

  return {
    createRoom,
    joinRoom,
    setReady,
    startMatch,
    leaveRoom,
    joinQueue,
    cancelQueue,
    sendAction,
    sendChat,
    sendQuickChat,
    sendRematch,
    isOnlineActive,
    getSession,
    setDisplayName,
    setAvatar,
    getAvatar,
    clearRoomToken,
    setListeners,
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeDisplayName(value) {
  const safe = String(value || "").replace(/\s+/g, " ").trim();
  return safe.slice(0, 14) || "Guest";
}

function normalizeAvatar(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const glyph = typeof value.glyph === "string" ? value.glyph.toLowerCase() : "";
  const color = typeof value.color === "string" ? value.color.toLowerCase() : "";
  if (!AVATAR_GLYPHS.includes(glyph) || !AVATAR_COLORS.includes(color)) {
    return null;
  }
  return { glyph, color };
}

function loadOrCreateAvatar() {
  try {
    const raw = window.localStorage.getItem(AVATAR_KEY);
    if (raw) {
      const parsed = normalizeAvatar(JSON.parse(raw));
      if (parsed) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage failures.
  }

  const generated = {
    glyph: AVATAR_GLYPHS[Math.floor(Math.random() * AVATAR_GLYPHS.length)],
    color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  };
  saveAvatar(generated);
  return generated;
}

function saveAvatar(avatar) {
  try {
    window.localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar));
  } catch {
    // Ignore storage failures.
  }
}

function loadOrCreateDisplayName() {
  try {
    const existing = window.localStorage.getItem(DISPLAY_NAME_KEY);
    if (existing) {
      return normalizeDisplayName(existing);
    }
  } catch {
    // Ignore storage failures.
  }

  return `Guest-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function saveDisplayName(name) {
  try {
    window.localStorage.setItem(DISPLAY_NAME_KEY, normalizeDisplayName(name));
  } catch {
    // Ignore storage failures.
  }
}

function loadOrCreateGuestId() {
  try {
    const existing = window.localStorage.getItem(GUEST_ID_KEY);
    if (existing && /^[a-z0-9-]{6,64}$/i.test(existing)) {
      return existing;
    }

    const generated = (window.crypto?.randomUUID?.() || `guest-${Math.random().toString(36).slice(2, 11)}`).toLowerCase();
    window.localStorage.setItem(GUEST_ID_KEY, generated);
    return generated;
  } catch {
    return `guest-${Math.random().toString(36).slice(2, 11)}`;
  }
}

function resolveSocketUrl() {
  const configured = String(window.RUNEBAGS_ONLINE_SERVER || "").trim();
  if (configured) {
    const lower = configured.toLowerCase();
    if (lower.includes("your-real-render-url") || lower.includes("your-service") || lower.includes("example")) {
      throw new Error("RUNEBAGS_ONLINE_SERVER is still a placeholder. Set your real Render URL.");
    }

    const parsed = new URL(configured);
    if (parsed.protocol === "http:") {
      parsed.protocol = "ws:";
    } else if (parsed.protocol === "https:") {
      parsed.protocol = "wss:";
    }

    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/ws";
    }

    return parsed.toString();
  }

  const current = new URL(window.location.href);
  const protocol = current.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${current.host}/ws`;
}

function loadToken(roomCode) {
  try {
    const key = `${STORAGE_PREFIX}${roomCode}`;
    return window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Written to BOTH stores on purpose: sessionStorage dies with the tab, and a
// correspondence game may be resumed days later from a fresh browser session.
function saveToken(roomCode, token) {
  const key = `${STORAGE_PREFIX}${roomCode}`;
  try {
    window.sessionStorage.setItem(key, token);
  } catch {
    // Ignore storage failures.
  }
  try {
    window.localStorage.setItem(key, token);
  } catch {
    // Ignore storage failures.
  }
}
