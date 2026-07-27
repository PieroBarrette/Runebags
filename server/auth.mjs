// Sign-in by emailed one-time link. No passwords exist anywhere in this flow.
//
// Threat notes:
//   - /auth/request always answers 200 with the same body, so it cannot be used
//     to discover which addresses have an account;
//   - links are single use, expire in 20 minutes, and only their SHA-256 digest
//     is stored, so a stolen database grants no access;
//   - both the address and the caller's IP are rate limited.
import {
  consumeLoginToken,
  countRecentLoginTokens,
  createLoginToken,
  createSession,
  createUser,
  deleteSession,
  getPlayerIdByGuestId,
  getSessionUser,
  getUserByEmailIndex,
  isHandleTaken,
  linkGuestToUser,
  setUserHandle,
  setUserPlayerId,
  touchUserLogin,
  upsertPlayer,
} from "./db.mjs";
import {
  createToken,
  decryptEmail,
  emailIndex,
  encryptEmail,
  hashToken,
  isCryptoReady,
  maskEmail,
  normalizeEmail,
} from "./crypto.mjs";
import { sendLoginLink } from "./mailer.mjs";

const TOKEN_TTL_MS = 20 * 60 * 1000;
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_PER_EMAIL_PER_HOUR = 5;
const MAX_PER_IP_PER_HOUR = 20;
const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,18}[a-z0-9])$/i;

const ipHits = new Map();

function ipAllowed(ip) {
  if (!ip) {
    return true;
  }
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter((at) => now - at < 60 * 60 * 1000);
  if (hits.length >= MAX_PER_IP_PER_HOUR) {
    ipHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return true;
}

export async function requestLoginLink({ email, lang, ip }) {
  if (!isCryptoReady()) {
    return { status: 503, body: { error: "accounts_unavailable" } };
  }

  const normalized = normalizeEmail(email);
  // Same answer whether the address is malformed, brand new or already known.
  const generic = { status: 200, body: { ok: true } };
  if (!normalized || !ipAllowed(ip)) {
    return generic;
  }

  const index = emailIndex(normalized);
  if (countRecentLoginTokens(index, 60 * 60 * 1000) >= MAX_PER_EMAIL_PER_HOUR) {
    return generic;
  }

  const token = createToken();
  const stored = createLoginToken({
    tokenHash: hashToken(token),
    emailIndex: index,
    emailEnc: encryptEmail(normalized),
    lang,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });
  if (!stored) {
    return generic;
  }

  await sendLoginLink(normalized, token, lang);
  return generic;
}

// Exchanges a link token for a session, creating the account on first use and
// adopting whatever profile this device has already built as a guest.
export function verifyLoginToken({ token, guestId, displayName, avatar }) {
  if (!isCryptoReady()) {
    return { status: 503, body: { error: "accounts_unavailable" } };
  }

  const row = consumeLoginToken(hashToken(String(token || "")));
  if (!row) {
    return { status: 400, body: { error: "invalid_or_expired" } };
  }

  let user = getUserByEmailIndex(row.email_index);
  const devicePlayerId = guestId ? (getPlayerIdByGuestId(guestId) || upsertPlayer(guestId, displayName, avatar)) : null;

  if (!user) {
    // First sign-in: keep the stats this device already accumulated by making
    // its player row the account's canonical profile.
    const userId = createUser({
      emailIndex: row.email_index,
      emailEnc: row.email_enc,
      playerId: devicePlayerId,
    });
    if (!userId) {
      return { status: 503, body: { error: "accounts_unavailable" } };
    }
    user = { id: userId, handle: null, player_id: devicePlayerId, email_enc: row.email_enc };
  } else {
    if (!user.player_id && devicePlayerId) {
      setUserPlayerId(user.id, devicePlayerId);
      user.player_id = devicePlayerId;
    }
    touchUserLogin(user.id);
  }

  // From now on this device's games count for the account's profile.
  if (guestId && user.player_id) {
    linkGuestToUser(guestId, user.id, user.player_id);
  }

  const sessionToken = createToken();
  createSession({
    tokenHash: hashToken(sessionToken),
    userId: user.id,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  return { status: 200, body: { sessionToken, user: publicUser(user) } };
}

export function getUserFromSession(sessionToken) {
  if (!sessionToken || !isCryptoReady()) {
    return null;
  }
  return getSessionUser(hashToken(String(sessionToken)));
}

export function logout(sessionToken) {
  if (sessionToken) {
    deleteSession(hashToken(String(sessionToken)));
  }
  return { status: 200, body: { ok: true } };
}

export function claimHandle(user, rawHandle) {
  const handle = String(rawHandle || "").trim();
  if (!HANDLE_PATTERN.test(handle)) {
    return { status: 400, body: { error: "bad_handle" } };
  }
  if (isHandleTaken(handle)) {
    return { status: 409, body: { error: "handle_taken" } };
  }
  if (!setUserHandle(user.id, handle)) {
    return { status: 409, body: { error: "handle_taken" } };
  }
  return { status: 200, body: { user: publicUser({ ...user, handle }) } };
}

// Never leaks the address itself, only a masked hint so the player recognises
// which one they used.
export function publicUser(user) {
  return {
    id: user.id,
    handle: user.handle || null,
    playerId: user.player_id || null,
    emailHint: maskEmail(decryptEmail(user.email_enc) || ""),
  };
}
