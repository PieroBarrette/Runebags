// Anonymous audience counts (server/metrics.mjs says what is kept). An event is
// a name and at most one short value — a level, a result, the host name of the
// site a visit came from — and nothing that could tell two visitors apart. A
// browser that asks not to be tracked (Global Privacy Control, Do Not Track) is
// not counted at all.
const ENDPOINT = "/api/metrics";
const FLUSH_DELAY_MS = 1500;
const MAX_EVENTS_PER_REQUEST = 5;
// Set for the rest of the tab's life once a visit is counted, so a reload or a
// trip to the privacy page and back is not counted as another visit.
const VISIT_COUNTED_KEY = "runebags-visit-counted";

// Read before the app stores anything: this module is the first one main.js
// imports, so a browser with no RuneBags data yet is on its first visit.
const firstVisit = !hasStoredData();

const queue = [];
let flushTimer = null;

window.addEventListener("pagehide", flush);

export function track(event, dim = "") {
  if (isOptedOut()) {
    return;
  }
  queue.push([event, String(dim)]);
  if (queue.length >= MAX_EVENTS_PER_REQUEST) {
    flush();
    return;
  }
  if (!flushTimer) {
    flushTimer = window.setTimeout(flush, FLUSH_DELAY_MS);
  }
}

// Once per tab: where the visit came from, its language, and whether this
// browser has been here before.
export function trackVisit(lang) {
  try {
    if (window.sessionStorage.getItem(VISIT_COUNTED_KEY)) {
      return;
    }
    window.sessionStorage.setItem(VISIT_COUNTED_KEY, "1");
  } catch {
    // Storage blocked: count the visit anyway.
  }

  const source = visitSource();
  track("visit", source);
  if (firstVisit) {
    track("first_visit", source);
  }
  track("lang", lang === "fr" ? "fr" : "en");
}

function flush() {
  if (flushTimer) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  while (queue.length > 0) {
    send(JSON.stringify({ events: queue.splice(0, MAX_EVENTS_PER_REQUEST) }));
  }
}

function send(body) {
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }))) {
      return;
    }
  } catch {
    // Fall back to fetch below.
  }
  fetch(ENDPOINT, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => {});
}

// A campaign link names itself (?utm_source=reddit); otherwise the referring
// site's host name, or "direct" when there is none.
function visitSource() {
  try {
    const campaign = new URLSearchParams(window.location.search).get("utm_source");
    if (campaign && /^[a-z0-9_-]{1,30}$/i.test(campaign)) {
      return `utm:${campaign.toLowerCase()}`;
    }
    if (!document.referrer) {
      return "direct";
    }
    const host = new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, "");
    const ownHost = window.location.hostname.toLowerCase().replace(/^www\./, "");
    return host && host !== ownHost && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : "direct";
  } catch {
    return "direct";
  }
}

function isOptedOut() {
  return navigator.globalPrivacyControl === true
    || navigator.doNotTrack === "1"
    || window.doNotTrack === "1";
}

function hasStoredData() {
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      if (String(window.localStorage.key(i)).startsWith("runebags-")) {
        return true;
      }
    }
  } catch {
    // Storage blocked: treat it as a returning visit rather than guess.
    return true;
  }
  return false;
}
