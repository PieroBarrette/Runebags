// Anonymous audience counts: how many visits, where they came from, and how far
// a visit gets (a game started, a first round finished, a game finished). Each
// event is a name and at most one short value, added to a per-day total.
// Nothing kept here can tell two visitors apart: no cookie, no identifier, and
// the caller's address is held in memory for a minute only, so that one script
// cannot inflate the numbers.
import { getMetricsSince, incrementMetric } from "./db.mjs";

const LEVEL = (dim) => (/^[1-5]$/.test(dim) ? dim : null);
const NONE = (dim) => (dim === "" ? "" : null);
const oneOf = (...values) => (dim) => (values.includes(dim) ? dim : null);
// A referring site is kept to its host name ("boardgamegeek.com"), a campaign
// link to its utm_source ("utm:reddit").
const SOURCE = (dim) => (
  dim.length <= 64 && /^(direct|utm:[a-z0-9_-]{1,30}|[a-z0-9-]+(\.[a-z0-9-]+)+)$/.test(dim) ? dim : null
);

// Every event the client may send, with the shape its value must have.
const EVENTS = new Map([
  ["visit", SOURCE],
  ["first_visit", SOURCE],
  ["lang", oneOf("fr", "en")],
  ["rules_open", NONE],
  ["ai_start", LEVEL],
  ["ai_round1", LEVEL],
  ["ai_end", oneOf("win", "loss", "draw")],
  ["online_open", NONE],
  ["online_game", oneOf("ranked", "friendly")],
  ["online_end", NONE],
  ["share", oneOf("result", "invite")],
]);

const MAX_EVENTS_PER_REQUEST = 5;
const RATE_WINDOW_MS = 60 * 1000;
const MAX_EVENTS_PER_WINDOW = 40;
const BOT_AGENT = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor/i;
const DAY_MS = 24 * 60 * 60 * 1000;

const eventsByAddress = new Map();
setInterval(() => eventsByAddress.clear(), RATE_WINDOW_MS).unref();

// Days are counted in Quebec time, where the game is made.
const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function metricsDay(date = new Date()) {
  return DAY_FORMAT.format(date);
}

// Counts what passes the checks and silently drops the rest: a beacon gets no
// answer worth reading, so there is nothing to report back.
export function recordMetrics(events, { address, userAgent }) {
  if (!Array.isArray(events) || BOT_AGENT.test(String(userAgent || ""))) {
    return 0;
  }

  const used = eventsByAddress.get(address) || 0;
  const allowed = Math.max(0, Math.min(MAX_EVENTS_PER_REQUEST, MAX_EVENTS_PER_WINDOW - used));
  const accepted = events.slice(0, allowed);
  eventsByAddress.set(address, used + accepted.length);

  const day = metricsDay();
  let counted = 0;
  for (const entry of accepted) {
    const [event, rawDim = ""] = Array.isArray(entry) ? entry : [];
    const check = EVENTS.get(event);
    const dim = check ? check(String(rawDim)) : null;
    if (dim !== null && incrementMetric(day, event, dim)) {
      counted += 1;
    }
  }
  return counted;
}

// The counts are readable by the accounts named in ADMIN_HANDLES (comma
// separated, e.g. "Piero"). Unset means nobody.
export function isMetricsAdmin(user, env = process.env) {
  if (!user?.handle) {
    return false;
  }
  const allowed = String(env.ADMIN_HANDLES || "")
    .split(",")
    .map((handle) => handle.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(String(user.handle).toLowerCase());
}

export function readMetrics(days) {
  const span = Math.min(Math.max(Math.floor(Number(days)) || 30, 1), 366);
  const since = metricsDay(new Date(Date.now() - (span - 1) * DAY_MS));
  return { since, until: metricsDay(), rows: getMetricsSince(since) };
}
