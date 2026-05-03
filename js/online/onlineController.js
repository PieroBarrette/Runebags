const STORAGE_PREFIX = "runebags-online-token:";
const GUEST_ID_KEY = "runebags-guest-id";

export function createOnlineController() {
  const listeners = {
    waiting: () => {},
    queue: () => {},
    state: () => {},
    error: () => {},
    status: () => {},
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
    started: false,
  };

  function setListeners(next) {
    Object.assign(listeners, next || {});
  }

  function connect() {
    if (session.socket && session.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    const socketUrl = resolveSocketUrl();

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(socketUrl);
      session.socket = ws;

      ws.addEventListener("open", () => {
        listeners.status("Connected to online server.");
        resolve();
      });

      ws.addEventListener("error", () => {
        listeners.error("Could not connect to online server.");
        reject(new Error("socket_error"));
      });

      ws.addEventListener("close", () => {
        listeners.status("Disconnected from online server.");
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

  async function createRoom(roomCode) {
    try {
      await connect();
      send({ type: "create_room", roomCode });
      return true;
    } catch {
      listeners.error("Failed to create room.");
      return false;
    }
  }

  async function joinRoom(roomCode) {
    try {
      await connect();
      session.roomCode = roomCode;
      const token = loadToken(roomCode);
      if (token) {
        send({ type: "reconnect", roomCode, token });
        return true;
      }
      send({ type: "join_room", roomCode });
      return true;
    } catch {
      listeners.error("Failed to join room.");
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
    session.started = false;
    session.seq = 0;
    session.clientSeq = 0;
  }

  async function joinQueue() {
    try {
      await connect();
      send({ type: "queue_join", guestId: session.guestId });
      return true;
    } catch {
      listeners.error("Failed to join quick play queue.");
      return false;
    }
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

  function isOnlineActive() {
    return session.started;
  }

  function getSession() {
    return { ...session };
  }

  function send(payload) {
    if (!session.socket || session.socket.readyState !== WebSocket.OPEN) {
      listeners.error("Online server is not connected.");
      return;
    }
    session.socket.send(JSON.stringify(payload));
  }

  function handleServerMessage(msg) {
    if (msg.type === "error") {
      listeners.error(msg.message || "Server error.");
      return;
    }

    if (msg.type === "action_rejected") {
      if (typeof msg.expectedClientSeq === "number") {
        session.clientSeq = Math.max(0, msg.expectedClientSeq - 1);
      }
      listeners.error(msg.message || "Action rejected by server.");
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
      listeners.state({ state: msg.state, seq: msg.seq, playerId: msg.playerId, roomCode: msg.roomCode });
      return;
    }

    if (msg.type === "queue_status") {
      session.queued = Boolean(msg.queued);
      listeners.queue({
        queued: session.queued,
        position: Number(msg.position || 0),
        message: msg.message || "",
      });
      return;
    }

    if (msg.type === "queue_matched") {
      session.roomCode = msg.roomCode;
      session.playerId = msg.playerId;
      session.queued = false;
      listeners.status("Opponent found. Starting match...");
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
    isOnlineActive,
    getSession,
    setListeners,
  };
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
    return window.localStorage.getItem(`${STORAGE_PREFIX}${roomCode}`);
  } catch {
    return null;
  }
}

function saveToken(roomCode, token) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${roomCode}`, token);
  } catch {
    // Ignore storage failures.
  }
}
