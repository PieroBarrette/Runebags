// Two signed-in accounts, driven end to end against a real server.
//
// Everything the online ladder is made of — magic-link sign-in, quick-play
// matchmaking, the ranked clock, Elo, direct challenges, push — had only ever
// been verified a piece at a time, in a browser, against stubs. This runs the
// whole thing: it starts a server, signs in two accounts by reading the
// sign-in links the mailer logs when no mail provider is configured, plays a
// complete ranked game over WebSockets, and checks the ratings actually moved.
//
//   node tools/e2e-online.mjs                 spawns its own throwaway server
//   node tools/e2e-online.mjs --url https://runebags.ca --external
//
// --external skips sign-in (there is no readable mail log on a real deploy) and
// runs only the checks that work with guest identities.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { getLegalMovesForPlayer, getPendingChoices } from "../js/core/gameState.js";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : "true";
};
const external = flag("external") === "true";
const PORT = Number(flag("port", "8099"));
const BASE = flag("url", `http://localhost:${PORT}`);
const WS_BASE = BASE.replace(/^http/, "ws");

let failures = 0;
let checks = 0;
function check(name, ok, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? `   ${detail}` : ""}`);
}
function section(title) {
  console.log(`\n=== ${title} ===`);
}

/* ------------------------------------------------------------------ server */

let child = null;
let dataDir = null;
const serverLog = [];

async function startServer() {
  dataDir = mkdtempSync(join(tmpdir(), "runebags-e2e-"));
  const serverPath = fileURLToPath(new URL("../server/server.mjs", import.meta.url));

  child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(PORT),
      // Test-only, and the instance is torn down at the end of the run.
      DATA_SECRET: "e2e-test-secret-not-for-production-0123456789",
      APP_BASE_URL: BASE,
      RESEND_API_KEY: "",
      MAIL_FROM: "",
      // Throwaway keypair so the push endpoints are exercised rather than
      // silently disabled. Real keys live in Render's environment.
      VAPID_PUBLIC_KEY: "BKtfz-ZwH_bJ9RYdub0amVteLRQyRYy_aEOqji42INY737QRlFf6NuSvs5G_m4wwW7_hx7YHvayAqssHzBjMuSM",
      VAPID_PRIVATE_KEY: "JdrEQOmISKtQldi3Z5TIiwLE-55NQT6PoONdytXrDw0",
      VAPID_SUBJECT: "mailto:e2e@localhost",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const capture = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) serverLog.push(line);
    }
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);

  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  throw new Error("server did not start");
}

function stopServer() {
  child?.kill();
  if (dataDir) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* the OS can clean it up */
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* --------------------------------------------------------------- http api */

async function api(path, { method = "GET", body = null, guestId = null, session = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (guestId) headers["x-guest-id"] = guestId;
  if (session) headers["x-session-token"] = session;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON bodies are a failure the caller will notice */
  }
  return { status: res.status, body: json, text };
}

// The mailer logs the link instead of sending it when no provider is configured,
// which is the only reason this test can sign anyone in.
async function waitForLoginLink(email) {
  for (let i = 0; i < 60; i += 1) {
    const line = serverLog.find((l) => l.includes("[mail] would send to") && l.includes(email));
    if (line) {
      const match = line.match(/login=([^\s]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    await sleep(100);
  }
  return null;
}

async function signIn(email, handle, guestId) {
  const requested = await api("/api/auth/request", { method: "POST", body: { email, lang: "fr" } });
  check(`${handle}: sign-in link requested`, requested.status === 200, `status ${requested.status}`);

  const token = await waitForLoginLink(email);
  check(`${handle}: magic link issued`, Boolean(token), token ? `${token.slice(0, 10)}...` : "none found");
  if (!token) return null;

  const verified = await api("/api/auth/verify", {
    method: "POST",
    body: { token, name: handle },
    guestId,
  });
  check(`${handle}: link verified`, verified.status === 200 && Boolean(verified.body?.sessionToken), `status ${verified.status}`);
  const session = verified.body?.sessionToken;
  if (!session) return null;

  const reused = await api("/api/auth/verify", { method: "POST", body: { token }, guestId });
  check(`${handle}: link is single-use`, reused.status !== 200 || !reused.body?.sessionToken, `status ${reused.status}`);

  const claimed = await api("/api/auth/handle", { method: "POST", body: { handle }, session });
  check(`${handle}: handle claimed`, claimed.status === 200, `status ${claimed.status}`);

  const me = await api("/api/auth/me", { session });
  check(`${handle}: session resolves to the account`, me.body?.user?.handle === handle, `handle ${me.body?.user?.handle}`);

  return { email, handle, guestId, session };
}

/* ----------------------------------------------------------------- client */

class Client {
  constructor(name, guestId) {
    this.name = name;
    this.guestId = guestId;
    this.messages = [];
    this.waiters = [];
    this.clientSeq = 0;
    this.playerId = null;
    this.state = null;
    this.clock = null;
    this.shopSync = null;
    this.seq = -1;
    this.rejections = [];
  }

  async connect() {
    this.ws = new WebSocket(`${WS_BASE}/ws`);
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (raw) => {
      let message = null;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (message.type === "state_snapshot") {
        this.state = message.state;
        this.clock = message.clock;
        this.shopSync = message.shopSync;
        this.seq = message.seq ?? 0;
        if (message.playerId) this.playerId = message.playerId;
      }
      if (message.type === "queue_matched") this.playerId = message.playerId;
      this.messages.push(message);
      this.waiters = this.waiters.filter((waiter) => !waiter(message));
    });
    this.send({ type: "identify", guestId: this.guestId });
  }

  send(message) {
    this.ws.send(JSON.stringify(message));
  }

  // Matches against messages received from `from` onwards. Actions must pass
  // the count taken before sending, or the wait resolves instantly against the
  // previous snapshot and every subsequent action races the server.
  waitFor(predicate, timeoutMs = 15000, from = 0) {
    const existing = this.messages.slice(from).find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name}: timed out waiting for a message`)), timeoutMs);
      this.waiters.push((message) => {
        if (!predicate(message)) return false;
        clearTimeout(timer);
        resolve(message);
        return true;
      });
    });
  }

  async act(actionType, payload = {}) {
    this.clientSeq += 1;
    const from = this.messages.length;
    this.send({ type: "action", actionType, payload, clientSeq: this.clientSeq, guestId: this.guestId });
    await this.waitFor(
      (message) => ["state_snapshot", "action_rejected", "error"].includes(message.type),
      15000,
      from,
    );
    // A rejection is sent only to the acting socket, but a broadcast caused by
    // the opponent can arrive first — so settle a tick and then look for a
    // rejection that names this action rather than trusting whatever landed
    // first. Getting this wrong silently attributes one action's rejection to
    // the next one.
    await sleep(5);
    const seen = this.messages.slice(from);
    const reply = seen.find((m) => m.type === "action_rejected" && m.actionType === actionType)
      ?? seen.find((m) => m.type === "state_snapshot")
      ?? seen[0];

    if (reply?.type === "action_rejected") {
      // The server only advances lastClientSeq on an accepted action, so a
      // rejection has to roll the local counter back or every later action is
      // out of order — which is what the sequence check is there to catch.
      this.clientSeq = Number.isInteger(reply.expectedClientSeq)
        ? reply.expectedClientSeq - 1
        : this.clientSeq - 1;
      this.rejections.push(`${actionType}: ${reply.code || reply.reasonKey || reply.message}`);
    }
    return reply;
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* already gone */
    }
  }
}

// Plays whatever is legal. The point is to reach game-over through the real
// server, not to play well.
//
// Both clients receive every broadcast, but not necessarily in the same tick,
// so the freshest snapshot is whichever carries the higher room seq.
function latestState(clients) {
  return clients.reduce((best, client) => (client.seq > (best?.seq ?? -1) ? client : best), null);
}

async function playGame(clients, { maxActions = 4000 } = {}) {
  let actions = 0;
  const clockSamples = [];

  while (actions < maxActions) {
    const freshest = latestState(clients);
    const any = freshest?.state;
    if (!any) return { error: "no state" };
    if (any.phase === "game-over") return { state: any, actions, clockSamples };

    actions += 1;

    if (any.phase === "shop") {
      // Readiness is server-side (room.shopSync), not in the game state, so
      // each client reads its own flag off its last snapshot. One client per
      // pass, so the second never acts on a snapshot the first already made
      // stale — readying twice is rejected, and the rejection desynchronises
      // the action sequence.
      const pending = clients.find((client) => client.state?.phase === "shop" && !client.shopSync?.youReady);
      if (!pending) return { error: "shop stalled with both sides ready", state: any };
      await pending.act("shop_ready", { ready: true });
      continue;
    }

    if (any.phase === "round-end") {
      await clients[0].act("phase_action", {});
      continue;
    }

    if (any.pendingAction) {
      const chooser = any.pendingAction.playerId
        ?? any.pendingAction.turnContext?.playerId
        ?? any.currentPlayer;
      const client = clients.find((c) => c.playerId === chooser) || clients[0];
      const choices = getPendingChoices(any);
      if (choices.length === 0) return { error: "pending action with no choices", state: any };
      const choice = choices[0];
      await client.act("board_click", {
        row: choice.row,
        col: typeof choice.col === "number" ? choice.col : choice.column,
        column: choice.column,
        awayIndex: choice.awayIndex,
      });
      continue;
    }

    const client = clients.find((c) => c.playerId === any.currentPlayer);
    if (!client) return { error: "no client for current player", state: any };

    const moves = getLegalMovesForPlayer(any, any.currentPlayer);
    if (moves.length === 0) return { error: "no legal moves", state: any };
    // A plain column drop is what board_click carries; targeted placements
    // (Nauthiz) need a row/col the action shape does not take.
    const move = moves.find((m) => !Number.isInteger(m.row)) || moves[0];

    await client.act("select_rune", { runeInstanceId: move.runeInstanceId });
    const reply = await client.act("board_click", { column: move.column });
    if (reply.type === "action_rejected") {
      return { error: `rejected: ${reply.message}`, state: any };
    }

    if (client.clock) clockSamples.push({ ...client.clock, phase: any.phase });
  }

  return { error: "action limit reached", actions };
}

/* ------------------------------------------------------------------- main */

async function main() {
  if (!external) {
    await startServer();
    console.log(`server up on ${BASE}`);
  } else {
    console.log(`testing external server at ${BASE} (sign-in checks skipped)`);
  }

  const guestA = "e2e-guest-aaaaaaaaaaaaaaaaaaaaaaaa";
  const guestB = "e2e-guest-bbbbbbbbbbbbbbbbbbbbbbbb";
  let accountA = null;
  let accountB = null;

  if (!external) {
    section("Magic-link sign-in, two accounts");
    accountA = await signIn("alice@e2e.local", "AliceE2E", guestA);
    accountB = await signIn("bob@e2e.local", "BobE2E", guestB);
    if (!accountA || !accountB) {
      console.log("\nsign-in failed; cannot continue");
      return;
    }

    const enumeration = await api("/api/auth/request", { method: "POST", body: { email: "nobody@e2e.local" } });
    check("unknown address answers like a known one", enumeration.status === 200, `status ${enumeration.status}`);
  }

  section("Ratings before the game");
  const ratingBefore = {};
  if (accountA) {
    for (const account of [accountA, accountB]) {
      const profile = await api(`/api/profile/${account.handle}`);
      ratingBefore[account.handle] = profile.body?.player?.rating ?? null;
      check(`${account.handle}: profile readable`, profile.status === 200, `rating ${ratingBefore[account.handle]}`);
    }
  }

  section("Quick-play matchmaking");
  const clientA = new Client("A", guestA);
  const clientB = new Client("B", guestB);
  await clientA.connect();
  await clientB.connect();

  clientA.send({ type: "queue_join", guestId: guestA, displayName: accountA?.handle || "GuestA" });
  await sleep(200);
  clientB.send({ type: "queue_join", guestId: guestB, displayName: accountB?.handle || "GuestB" });

  const matchedA = await clientA.waitFor((m) => m.type === "queue_matched");
  const matchedB = await clientB.waitFor((m) => m.type === "queue_matched");
  check("both players matched", Boolean(matchedA && matchedB));
  check("matched into the same room", matchedA.roomCode === matchedB.roomCode, matchedA.roomCode);
  check("seats are distinct", matchedA.playerId !== matchedB.playerId, `${matchedA.playerId} vs ${matchedB.playerId}`);

  await clientA.waitFor((m) => m.type === "state_snapshot");
  await clientB.waitFor((m) => m.type === "state_snapshot");

  section("Clock on a ranked game");
  const firstClock = clientA.messages.filter((m) => m.type === "state_snapshot").pop()?.clock;
  check("clock present on a quick-play game", Boolean(firstClock), JSON.stringify(firstClock));
  check("clock starts at the full budget", firstClock?.budget === 600000, `budget ${firstClock?.budget}`);
  check(
    "both sides start with the full budget",
    firstClock && firstClock[1] <= 600000 && firstClock[2] <= 600000 && firstClock[1] > 599000 && firstClock[2] > 599000,
    `p1 ${firstClock?.[1]} p2 ${firstClock?.[2]}`,
  );

  section("A full ranked game over WebSockets");
  const started = Date.now();
  const outcome = await playGame([clientA, clientB]);
  const allRejections = [...clientA.rejections, ...clientB.rejections];
  if (allRejections.length > 0) {
    console.log(`  (${allRejections.length} rejected actions: ${[...new Set(allRejections)].slice(0, 6).join(" | ")})`);
  }
  if (outcome.error) {
    check("game played to completion", false, outcome.error);
  } else {
    check("game played to completion", true, `${outcome.actions} actions in ${Math.round((Date.now() - started) / 1000)}s`);
    check("a winner was decided", Boolean(outcome.state.gameWinner), `winner ${outcome.state.gameWinner}`);

    const running = outcome.clockSamples.filter((s) => s.running);
    check("clock ran during the round", running.length > 0, `${running.length} samples with a side on move`);
    const spent = outcome.clockSamples.at(-1);
    check(
      "clock actually charged someone",
      spent && (spent[1] < 600000 || spent[2] < 600000),
      `p1 ${spent?.[1]} p2 ${spent?.[2]}`,
    );
  }

  if (accountA) {
    section("Elo applied");
    // onGameOver runs after the final broadcast; give it a moment to land.
    await sleep(500);
    for (const account of [accountA, accountB]) {
      const profile = await api(`/api/profile/${account.handle}`);
      const after = profile.body?.player?.rating ?? null;
      const games = profile.body?.player?.rankedGames ?? 0;
      check(
        `${account.handle}: rating moved`,
        after !== null && after !== ratingBefore[account.handle],
        `${ratingBefore[account.handle]} -> ${after}`,
      );
      check(`${account.handle}: ranked game counted`, games >= 1, `${games} ranked`);
      check(`${account.handle}: game history recorded`, (profile.body?.games?.length ?? 0) >= 1, `${profile.body?.games?.length} games`);
    }

    const leaderboard = await api("/api/leaderboard");
    const listed = (leaderboard.body?.players || []).map((p) => p.handle);
    check("both accounts on the leaderboard", listed.includes("AliceE2E") && listed.includes("BobE2E"), listed.join(", "));
  }

  if (accountA) {
    section("Direct challenge");
    // B stays connected but idle in the lobby — the case the last fix was for.
    const lobbyB = new Client("B-lobby", guestB);
    await lobbyB.connect();
    await sleep(200);

    const created = await api("/api/challenges", {
      method: "POST",
      body: { handle: accountB.handle, ranked: true },
      session: accountA.session,
    });
    check("challenge created", created.status === 200 && created.body?.ok, `status ${created.status}`);

    let delivered = null;
    try {
      delivered = await lobbyB.waitFor((m) => m.type === "challenge_received", 5000);
    } catch {
      delivered = null;
    }
    check("challenge pushed over the socket to an idle lobby client", Boolean(delivered), JSON.stringify(delivered || {}));

    const duplicate = await api("/api/challenges", {
      method: "POST",
      body: { handle: accountB.handle },
      session: accountA.session,
    });
    check("a second live challenge to the same player is refused", duplicate.status === 409, `status ${duplicate.status}`);

    const listedForB = await api("/api/me/challenges", { session: accountB.session });
    const pending = (listedForB.body?.challenges || []).filter((c) => c.status === "pending");
    check("challenge visible to the recipient", pending.length >= 1, `${pending.length} pending`);

    if (pending.length > 0) {
      const accepted = await api(`/api/challenges/${pending[0].id}/accept`, { method: "POST", session: accountB.session });
      check("challenge accepted and a room created", accepted.status === 200 && Boolean(accepted.body?.roomCode), `room ${accepted.body?.roomCode}`);

      if (accepted.body?.roomCode) {
        const chalA = new Client("chal-A", guestA);
        const chalB = new Client("chal-B", guestB);
        await chalA.connect();
        await chalB.connect();
        chalA.send({ type: "join_room", roomCode: accepted.body.roomCode, guestId: guestA, displayName: accountA.handle });
        await chalA.waitFor((m) => m.type === "waiting_snapshot");
        chalB.send({ type: "join_room", roomCode: accepted.body.roomCode, guestId: guestB, displayName: accountB.handle });
        const joinedB = await chalB.waitFor((m) => m.type === "waiting_snapshot");
        check("both sides can join the challenge room", Boolean(joinedB?.roomCode), `room ${joinedB?.roomCode}`);
        check("challenge room seats two different players", joinedB?.opponentJoined === true, `opponentJoined ${joinedB?.opponentJoined}`);
        chalA.close();
        chalB.close();
      }

      const acceptAgain = await api(`/api/challenges/${pending[0].id}/accept`, { method: "POST", session: accountB.session });
      check("an already-accepted challenge cannot be accepted twice", acceptAgain.status !== 200, `status ${acceptAgain.status}`);
    }

    lobbyB.close();
  }

  section("Push subscription");
  const vapid = await api("/api/push/vapid-public-key");
  check("VAPID public key served", vapid.status === 200 && Boolean(vapid.body?.key), `status ${vapid.status}`);

  const subscribed = await api("/api/push/subscribe", {
    method: "POST",
    guestId: guestA,
    session: accountA?.session,
    body: {
      name: "AliceE2E",
      subscription: {
        endpoint: "https://push.example.invalid/e2e-endpoint",
        keys: { p256dh: "BOrNQyMgBSRqxrbTgLBjBQKQ0YQaZlnMYPtNlPnLM6BZ0dVYlEs2vT9Uh8kZfRuIiFOAcMuA4mFQrPFXqVCsxAI", auth: "k8JV6sjdbhAi5ZoAQ8LSJg" },
      },
    },
  });
  check("push subscription accepted", subscribed.status === 200, `status ${subscribed.status}`);

  section("Guest-id is never echoed back");
  const leaderboardRaw = (await api("/api/leaderboard")).text;
  check("leaderboard does not leak guest ids", !leaderboardRaw.includes(guestA) && !leaderboardRaw.includes(guestB));
  if (accountA) {
    const profileRaw = (await api(`/api/profile/${accountA.handle}`)).text;
    check("profile does not leak guest ids or email", !profileRaw.includes(guestA) && !profileRaw.includes("alice@e2e.local"));
  }

  clientA.close();
  clientB.close();
}

try {
  await main();
} catch (error) {
  console.error("\nharness error:", error?.stack || error);
  failures += 1;
} finally {
  stopServer();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`${failures} FAILED`);
}
process.exit(failures > 0 ? 1 : 0);
