// Crypto helpers for accounts.
//
// There are no passwords anywhere in this system: magic links remove the whole
// category, so there is nothing to hash, leak or reset. What is protected here:
//   - login and session tokens are stored ONLY as SHA-256 digests, so a stolen
//     database cannot be used to sign in;
//   - email addresses are encrypted at rest (AES-256-GCM) and looked up through
//     a blind index, so the .db file on its own reveals no addresses.
//
// Honest limit: the key lives in an environment variable on the same host, so
// this protects a leaked database file (backup, disk) — not a full compromise
// of the machine.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

let secret = null;

export function initCrypto(env) {
  const raw = String(env.DATA_SECRET || "").trim();
  if (!raw) {
    console.warn("[crypto] DATA_SECRET not set — accounts disabled");
    secret = null;
    return false;
  }
  if (raw.length < 32) {
    console.warn("[crypto] DATA_SECRET is too short (need 32+ chars) — accounts disabled");
    secret = null;
    return false;
  }
  // One master secret, two independent derived keys.
  secret = {
    encryption: createHash("sha256").update(`enc:${raw}`).digest(),
    index: createHash("sha256").update(`idx:${raw}`).digest(),
  };
  console.log("[crypto] account encryption ready");
  return true;
}

export function isCryptoReady() {
  return secret !== null;
}

export function createToken() {
  return randomBytes(32).toString("base64url");
}

// Tokens are only ever persisted as their digest.
export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function normalizeEmail(value) {
  const text = String(value || "").trim().toLowerCase();
  // Deliberately permissive: the real proof an address exists is that the link
  // it receives gets clicked.
  if (text.length < 6 || text.length > 254 || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(text)) {
    return null;
  }
  return text;
}

// Deterministic keyed digest, so an address can be found (and kept unique)
// without ever storing or scanning it in the clear.
export function emailIndex(email) {
  if (!secret) {
    return null;
  }
  return createHmac("sha256", secret.index).update(normalizeEmail(email) || "").digest("hex");
}

export function encryptEmail(email) {
  if (!secret) {
    return null;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret.encryption, iv);
  const encrypted = Buffer.concat([cipher.update(String(email), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptEmail(payload) {
  if (!secret || typeof payload !== "string") {
    return null;
  }
  try {
    const [ivPart, tagPart, dataPart] = payload.split(".");
    const decipher = createDecipheriv("aes-256-gcm", secret.encryption, Buffer.from(ivPart, "base64"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

// Shown back to the player so they can tell which address they used, without
// putting the full address on screen.
export function maskEmail(email) {
  const text = String(email || "");
  const at = text.indexOf("@");
  if (at < 1) {
    return "";
  }
  const name = text.slice(0, at);
  const domain = text.slice(at);
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"•".repeat(Math.max(1, name.length - visible.length))}${domain}`;
}
