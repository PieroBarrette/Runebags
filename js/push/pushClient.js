// Web Push opt-in. Every entry point is defensive: unsupported browsers, a
// server with no VAPID keys, and denied permissions must all leave the game
// perfectly usable.
import { fetchVapidPublicKey, subscribePush, unsubscribePush } from "../net/apiClient.js";

export function isPushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

// iOS only exposes Web Push to home-screen installed PWAs (16.4+), so the UI
// needs to tell Safari users to install first rather than silently failing.
export function needsInstallForPush() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  return isIos && !installed;
}

export async function getPushState() {
  if (!isPushSupported()) {
    return { supported: false, enabled: false, permission: "unsupported" };
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return { supported: true, enabled: Boolean(subscription), permission: Notification.permission };
  } catch {
    return { supported: true, enabled: false, permission: Notification.permission };
  }
}

// Must be called from a user gesture — iOS rejects permission prompts otherwise.
export async function enablePush(lang) {
  if (!isPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  const key = await fetchVapidPublicKey();
  if (!key) {
    return { ok: false, reason: "server_unconfigured" };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    const saved = await subscribePush(subscription.toJSON(), lang);
    if (!saved?.ok) {
      // The server has no player row for this guest yet (no online game
      // played): drop the local subscription so the toggle stays honest.
      await subscription.unsubscribe().catch(() => {});
      return { ok: false, reason: "no_player" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function disablePush() {
  if (!isPushSupported()) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return;
    }
    await unsubscribePush(subscription.endpoint);
    await subscription.unsubscribe();
  } catch {
    // Nothing actionable — the toggle simply reverts on the next read.
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
