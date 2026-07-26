// Thin wrapper over the server's REST endpoints.
//
// Everything here is best-effort: the lobby, stats screen and home screen all
// render fine without the server (offline, cold start, DB unavailable), so a
// failed call resolves to null/[] instead of throwing.
const GUEST_ID_KEY = "runebags-guest-id";

function guestId() {
  try {
    return window.localStorage.getItem(GUEST_ID_KEY) || null;
  } catch {
    return null;
  }
}

async function getJson(path, { auth = false } = {}) {
  const headers = {};
  if (auth) {
    const id = guestId();
    // The guest id is a bearer secret — send it as a header so it never lands
    // in a URL, a proxy log or a Referer.
    if (!id) {
      return null;
    }
    headers["x-guest-id"] = id;
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

async function postJson(path, body, { auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const id = guestId();
    if (!id) {
      return null;
    }
    headers["x-guest-id"] = id;
  }

  try {
    const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
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

export async function fetchReplay(gameId) {
  const data = await getJson(`/api/games/${encodeURIComponent(gameId)}`);
  return data?.game || null;
}

export async function fetchVapidPublicKey() {
  const data = await getJson("/api/push/vapid-public-key");
  return data?.key || null;
}

export function subscribePush(subscription, lang) {
  return postJson("/api/push/subscribe", { subscription, lang }, { auth: true });
}

export function unsubscribePush(endpoint) {
  return postJson("/api/push/unsubscribe", { endpoint });
}
