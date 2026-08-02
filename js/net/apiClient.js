// Thin wrapper over the server's REST endpoints.
//
// Everything here is best-effort: the lobby, stats screen and home screen all
// render fine without the server (offline, cold start, DB unavailable), so a
// failed call resolves to null/[] instead of throwing.
const GUEST_ID_KEY = "runebags-guest-id";
const SESSION_KEY = "runebags-session-v1";

function guestId() {
  try {
    return window.localStorage.getItem(GUEST_ID_KEY) || null;
  } catch {
    return null;
  }
}

export function getSessionToken() {
  try {
    return window.localStorage.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function setSessionToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(SESSION_KEY, token);
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Private mode: the session simply won't survive a reload.
  }
}

function authHeaders(auth) {
  const headers = {};
  if (auth) {
    const id = guestId();
    // The guest id is a bearer secret — send it as a header so it never lands
    // in a URL, a proxy log or a Referer.
    if (id) {
      headers["x-guest-id"] = id;
    }
  }
  const session = getSessionToken();
  if (session) {
    headers["x-session-token"] = session;
  }
  return headers;
}

async function getJson(path, { auth = false } = {}) {
  const headers = authHeaders(auth);
  if (auth && !headers["x-guest-id"]) {
    return null;
  }

  try {
    const response = await fetch(path, { headers, cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

// `raw` keeps the status code, which the account flows need to tell "taken"
// apart from "malformed" — everywhere else a failure is just null.
async function postJson(path, body, { auth = false, raw = false } = {}) {
  const headers = { "Content-Type": "application/json", ...authHeaders(auth) };
  if (auth && !headers["x-guest-id"]) {
    return null;
  }

  try {
    const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (raw) {
      return { ok: response.ok, status: response.status, data };
    }
    return response.ok ? data : null;
  } catch {
    return raw ? { ok: false, status: 0, data: null } : null;
  }
}

export function hasGuestId() {
  return Boolean(guestId());
}

export async function fetchLeaderboard(limit = 10) {
  const data = await getJson(`/api/leaderboard?limit=${encodeURIComponent(limit)}`);
  return data?.players || [];
}

export async function fetchMyServerStats() {
  const data = await getJson("/api/me/stats", { auth: true });
  return data?.stats || null;
}

export async function fetchMyGames(limit = 10) {
  const data = await getJson(`/api/me/games?limit=${encodeURIComponent(limit)}`, { auth: true });
  return data?.games || [];
}

export async function fetchOngoingRooms() {
  const data = await getJson("/api/me/rooms", { auth: true });
  return data?.rooms || [];
}

export async function searchPlayers(query, limit = 8) {
  const text = String(query || "").trim();
  if (text.length < 2) {
    return [];
  }
  const data = await getJson(`/api/players/search?q=${encodeURIComponent(text)}&limit=${limit}`);
  return data?.players || [];
}

export function fetchProfile(handle) {
  return getJson(`/api/profile/${encodeURIComponent(handle)}`);
}

export async function fetchReplay(gameId) {
  const data = await getJson(`/api/games/${encodeURIComponent(gameId)}`);
  return data?.game || null;
}

export async function fetchVapidPublicKey() {
  const data = await getJson("/api/push/vapid-public-key");
  return data?.key || null;
}

// name/avatar let the server create the player row on the spot when someone
// turns notifications on before ever joining an online room.
export function subscribePush(subscription, lang, identity = {}) {
  return postJson(
    "/api/push/subscribe",
    { subscription, lang, name: identity.name || null, avatar: identity.avatar || null },
    { auth: true },
  );
}

export function unsubscribePush(endpoint) {
  return postJson("/api/push/unsubscribe", { endpoint });
}

/* ---------------------------------------------------------------- accounts */

export function requestLoginLink(email, lang) {
  return postJson("/api/auth/request", { email, lang }, { raw: true });
}

// Trades the emailed token for a session, passing the guest identity so the
// account adopts whatever this device has already played.
export async function verifyLogin(token, identity = {}) {
  const result = await postJson(
    "/api/auth/verify",
    { token, name: identity.name || null, avatar: identity.avatar || null },
    { auth: true, raw: true },
  );
  if (result?.ok && result.data?.sessionToken) {
    setSessionToken(result.data.sessionToken);
    return result.data.user || null;
  }
  return null;
}

export async function fetchAccount() {
  if (!getSessionToken()) {
    return null;
  }
  const data = await getJson("/api/auth/me");
  return data?.user || null;
}

export function claimHandle(handle) {
  return postJson("/api/auth/handle", { handle }, { raw: true });
}

/* -------------------------------------------------------------- challenges */

export function sendChallenge(handle, ranked = true) {
  return postJson("/api/challenges", { handle, ranked }, { raw: true });
}

export async function fetchChallenges() {
  if (!getSessionToken()) {
    return [];
  }
  const data = await getJson("/api/me/challenges");
  return data?.challenges || [];
}

export function acceptChallenge(id) {
  return postJson(`/api/challenges/${encodeURIComponent(id)}/accept`, {}, { raw: true });
}

export function declineChallenge(id) {
  return postJson(`/api/challenges/${encodeURIComponent(id)}/decline`, {}, { raw: true });
}

export async function signOut() {
  await postJson("/api/auth/logout", {});
  setSessionToken(null);
}
