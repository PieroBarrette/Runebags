// Web Push notifications for correspondence play ("it's your turn" while you
// were away). Entirely optional: with no VAPID keys configured the module
// no-ops, so local development and a key-less deploy behave normally.
//
// Notification text is localized HERE, not in the service worker: the SW can't
// import js/i18n.js (that module touches document/localStorage), so each
// subscription stores the language it was registered with.
import {
  deletePushSubscription,
  getPushSubscriptions,
  touchPushSubscription,
} from "./db.mjs";

let webpush = null;
let configured = false;
let publicKey = "";

const PUSH_TEXT = {
  en: {
    your_turn: { title: "RuneBags", body: "It's your turn against {opponent}." },
    shop_open: { title: "RuneBags", body: "The round is over — time to shop." },
    rematch: { title: "RuneBags", body: "{opponent} wants a rematch." },
    opponent_joined: { title: "RuneBags", body: "{opponent} joined your room." },
  },
  fr: {
    your_turn: { title: "RuneBags", body: "C'est votre tour contre {opponent}." },
    shop_open: { title: "RuneBags", body: "La manche est finie — passez à la boutique." },
    rematch: { title: "RuneBags", body: "{opponent} veut une revanche." },
    opponent_joined: { title: "RuneBags", body: "{opponent} a rejoint votre salle." },
  },
};

// One notification per player per kind per minute, at most.
const THROTTLE_MS = 60 * 1000;
const lastSentAt = new Map();

export async function initPush(env) {
  const publicVapid = String(env.VAPID_PUBLIC_KEY || "").trim();
  const privateVapid = String(env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(env.VAPID_SUBJECT || "").trim();

  if (!publicVapid || !privateVapid || !subject) {
    console.warn("[push] VAPID keys not configured, push notifications disabled");
    return;
  }

  try {
    ({ default: webpush } = await import("web-push"));
    webpush.setVapidDetails(subject, publicVapid, privateVapid);
    publicKey = publicVapid;
    configured = true;
    console.log("[push] web-push ready");
  } catch (error) {
    console.warn(`[push] web-push unavailable, notifications disabled: ${error?.message || error}`);
    webpush = null;
    configured = false;
  }
}

export function getVapidPublicKey() {
  return configured ? publicKey : null;
}

export function sendPush(playerRowId, kind, params = {}) {
  if (!configured || !playerRowId) {
    return;
  }

  const throttleKey = `${playerRowId}:${kind}`;
  const now = Date.now();
  if (now - (lastSentAt.get(throttleKey) || 0) < THROTTLE_MS) {
    return;
  }
  lastSentAt.set(throttleKey, now);

  const subscriptions = getPushSubscriptions(playerRowId);
  for (const row of subscriptions) {
    const dict = PUSH_TEXT[row.lang] || PUSH_TEXT.en;
    const text = dict[kind];
    if (!text) {
      continue;
    }

    const payload = JSON.stringify({
      title: text.title,
      body: text.body.replace("{opponent}", params.opponentName || "?"),
      // Same tag per room+kind so a re-notify replaces rather than stacks.
      tag: `${kind}-${params.roomCode || "x"}`,
      url: params.roomCode ? `/?room=${params.roomCode}` : "/",
    });

    webpush
      .sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      )
      .then(() => touchPushSubscription(row.endpoint))
      .catch((error) => {
        // 404/410 mean the browser dropped the subscription for good.
        const status = error?.statusCode;
        if (status === 404 || status === 410) {
          deletePushSubscription(row.endpoint);
          return;
        }
        console.warn(`[push] send failed (${status || "?"}): ${error?.message || error}`);
      });
  }
}
