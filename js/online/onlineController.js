const STORAGE_PREFIX = "runebags-online-token:";

export function createOnlineController() {
  const listeners = {
    waiting: () => {},
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
    if (session.socket && session.socket.readyState === WebSocket.OPEN) {
      send({ type: "leave_room" });
      session.socket.close();
    }
    session.started = false;
    session.seq = 0;
    session.clientSeq = 0;
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
      session.playerId = msg.playerId;
      listeners.state({ state: msg.state, seq: msg.seq, playerId: msg.playerId, roomCode: msg.roomCode });
    }
  }

  return {
    createRoom,
    joinRoom,
    setReady,
    startMatch,
    leaveRoom,
    sendAction,
    isOnlineActive,
    getSession,
    setListeners,
  };
}

function resolveSocketUrl() {
  const configured = String(window.RUNEBAGS_ONLINE_SERVER || "").trim();
  if (configured) {
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
