// SQLite persistence for player stats, game history/replays and push
// subscriptions. Rooms stay in rooms.json — the DB is the domain store only.
//
// better-sqlite3 is a native module and cannot be exercised on the dev machine
// (no Node locally). If it ever fails to install or load on the host, the game
// itself must keep working, so the import is optional and every helper below
// degrades to a no-op / empty result when the DB is unavailable.
import path from "node:path";

let Database = null;
try {
  ({ default: Database } = await import("better-sqlite3"));
} catch (error) {
  console.warn(`[db] better-sqlite3 unavailable, stats/history disabled: ${error?.message || error}`);
}

let db = null;

// One entry per schema version; PRAGMA user_version tracks how many have run.
// Never edit a shipped migration — append a new one.
const MIGRATIONS = [
  `
  CREATE TABLE players (
    id INTEGER PRIMARY KEY,
    guest_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT 'Guest',
    avatar_glyph TEXT,
    avatar_color TEXT,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );

  CREATE TABLE games (
    id INTEGER PRIMARY KEY,
    room_code TEXT NOT NULL,
    engine_version INTEGER NOT NULL,
    schema_version INTEGER NOT NULL,
    initial_state TEXT NOT NULL,
    p1_player_id INTEGER REFERENCES players(id),
    p2_player_id INTEGER REFERENCES players(id),
    p1_name TEXT,
    p2_name TEXT,
    p1_avatar TEXT,
    p2_avatar TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    winner INTEGER,
    winner_reason TEXT,
    p1_points INTEGER,
    p2_points INTEGER,
    rounds INTEGER,
    final_check TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  );
  CREATE INDEX idx_games_p1 ON games(p1_player_id, id DESC);
  CREATE INDEX idx_games_p2 ON games(p2_player_id, id DESC);

  CREATE TABLE game_actions (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    at INTEGER NOT NULL,
    PRIMARY KEY (game_id, idx)
  ) WITHOUT ROWID;
  `,
  `
  CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'en',
    created_at INTEGER NOT NULL,
    last_ok_at INTEGER
  );
  CREATE INDEX idx_push_player ON push_subscriptions(player_id);
  `,
];

export function openDb(dataDir) {
  if (!Database) {
    return null;
  }

  const file = path.join(dataDir, "runebags.db");
  try {
    db = new Database(file);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    migrate(db);
    console.log(`[db] SQLite ready at ${file}`);
    return db;
  } catch (error) {
    console.warn(`[db] failed to open database, stats/history disabled: ${error?.message || error}`);
    db = null;
    return null;
  }
}

function migrate(database) {
  const applied = Number(database.pragma("user_version", { simple: true }) || 0);
  for (let version = applied; version < MIGRATIONS.length; version += 1) {
    const apply = database.transaction(() => {
      database.exec(MIGRATIONS[version]);
      database.pragma(`user_version = ${version + 1}`);
    });
    apply();
    console.log(`[db] applied migration ${version + 1}`);
  }
}

export function isDbAvailable() {
  return db !== null;
}

export function closeDb() {
  if (!db) {
    return;
  }
  try {
    db.close();
  } catch {
    // Closing on shutdown is best-effort.
  }
  db = null;
}

// Every helper funnels through this so a mid-flight SQLite error can never take
// a game down: the worst case is a missing stat line.
function guard(fallback, fn) {
  if (!db) {
    return fallback;
  }
  try {
    return fn(db);
  } catch (error) {
    console.warn(`[db] query failed: ${error?.message || error}`);
    return fallback;
  }
}

/* ---------------------------------------------------------------- players */

// The guest id is a bearer secret: it identifies its holder, so it must never
// leave the server. Callers get the numeric row id, which is safe to publish.
export function upsertPlayer(guestId, name, avatar) {
  if (!guestId) {
    return null;
  }
  return guard(null, (database) => {
    const now = Date.now();
    database
      .prepare(`
        INSERT INTO players (guest_id, name, avatar_glyph, avatar_color, created_at, last_seen_at)
        VALUES (@guestId, @name, @glyph, @color, @now, @now)
        ON CONFLICT(guest_id) DO UPDATE SET
          name = excluded.name,
          avatar_glyph = COALESCE(excluded.avatar_glyph, players.avatar_glyph),
          avatar_color = COALESCE(excluded.avatar_color, players.avatar_color),
          last_seen_at = excluded.last_seen_at
      `)
      .run({
        guestId,
        name: name || "Guest",
        glyph: avatar?.glyph || null,
        color: avatar?.color || null,
        now,
      });
    const row = database.prepare("SELECT id FROM players WHERE guest_id = ?").get(guestId);
    return row ? row.id : null;
  });
}

export function getPlayerIdByGuestId(guestId) {
  if (!guestId) {
    return null;
  }
  return guard(null, (database) => {
    const row = database.prepare("SELECT id FROM players WHERE guest_id = ?").get(guestId);
    return row ? row.id : null;
  });
}

function publicPlayer(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar_glyph && row.avatar_color
      ? { glyph: row.avatar_glyph, color: row.avatar_color }
      : null,
    games: row.games,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
  };
}

export function getPlayerStatsByGuestId(guestId) {
  if (!guestId) {
    return null;
  }
  return guard(null, (database) =>
    publicPlayer(database.prepare("SELECT * FROM players WHERE guest_id = ?").get(guestId)));
}

// Ordered by wins, then by fewest games so a high win rate breaks ties.
export function getLeaderboard(limit = 20) {
  return guard([], (database) =>
    database
      .prepare("SELECT * FROM players WHERE games > 0 ORDER BY wins DESC, games ASC, best_streak DESC LIMIT ?")
      .all(Math.min(Math.max(Number(limit) || 20, 1), 50))
      .map(publicPlayer));
}

// outcome per player id: "win" | "loss" | "draw".
export function recordPlayerOutcome(playerRowId, outcome) {
  if (!playerRowId) {
    return;
  }
  guard(null, (database) => {
    if (outcome === "win") {
      database
        .prepare(`
          UPDATE players
          SET games = games + 1,
              wins = wins + 1,
              current_streak = current_streak + 1,
              best_streak = MAX(best_streak, current_streak + 1)
          WHERE id = ?
        `)
        .run(playerRowId);
      return null;
    }
    const column = outcome === "draw" ? "draws" : "losses";
    database
      .prepare(`UPDATE players SET games = games + 1, ${column} = ${column} + 1, current_streak = 0 WHERE id = ?`)
      .run(playerRowId);
    return null;
  });
}

/* ------------------------------------------------------------------ games */

export function insertGame(entry) {
  return guard(null, (database) => {
    const info = database
      .prepare(`
        INSERT INTO games (
          room_code, engine_version, schema_version, initial_state,
          p1_player_id, p2_player_id, p1_name, p2_name, p1_avatar, p2_avatar,
          status, started_at
        ) VALUES (
          @roomCode, @engineVersion, @schemaVersion, @initialState,
          @p1PlayerId, @p2PlayerId, @p1Name, @p2Name, @p1Avatar, @p2Avatar,
          'active', @startedAt
        )
      `)
      .run({
        roomCode: entry.roomCode,
        engineVersion: entry.engineVersion,
        schemaVersion: entry.schemaVersion,
        initialState: JSON.stringify(entry.initialState),
        p1PlayerId: entry.p1PlayerId || null,
        p2PlayerId: entry.p2PlayerId || null,
        p1Name: entry.p1Name || null,
        p2Name: entry.p2Name || null,
        p1Avatar: entry.p1Avatar ? JSON.stringify(entry.p1Avatar) : null,
        p2Avatar: entry.p2Avatar ? JSON.stringify(entry.p2Avatar) : null,
        startedAt: Date.now(),
      });
    return Number(info.lastInsertRowid);
  });
}

export function insertGameAction(gameId, idx, playerId, actionType, payload) {
  if (!gameId) {
    return;
  }
  guard(null, (database) => {
    database
      .prepare(`
        INSERT OR IGNORE INTO game_actions (game_id, idx, player_id, action_type, payload, at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(gameId, idx, playerId, actionType, JSON.stringify(payload || {}), Date.now());
    return null;
  });
}

export function finishGame(gameId, result) {
  if (!gameId) {
    return;
  }
  guard(null, (database) => {
    database
      .prepare(`
        UPDATE games
        SET status = 'finished', winner = @winner, winner_reason = @reason,
            p1_points = @p1Points, p2_points = @p2Points, rounds = @rounds,
            final_check = @finalCheck, ended_at = @endedAt
        WHERE id = @id AND status = 'active'
      `)
      .run({
        id: gameId,
        winner: result.winner ?? null,
        reason: result.reason || null,
        p1Points: result.p1Points ?? null,
        p2Points: result.p2Points ?? null,
        rounds: result.rounds ?? null,
        finalCheck: JSON.stringify(result.finalCheck || {}),
        endedAt: Date.now(),
      });
    return null;
  });
}

// Used by the room TTL sweep: a swept in-progress room orphans its recording.
export function markGameAbandonedIfActive(gameId) {
  if (!gameId) {
    return;
  }
  guard(null, (database) => {
    database
      .prepare("UPDATE games SET status = 'abandoned', ended_at = ? WHERE id = ? AND status = 'active'")
      .run(Date.now(), gameId);
    return null;
  });
}

function parseAvatar(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// History rows for the requesting player. Seat-aware so the client can say
// "you won" without knowing which colour the player sat on.
export function getGamesForPlayer(playerRowId, limit = 20, beforeId = null) {
  if (!playerRowId) {
    return [];
  }
  return guard([], (database) => {
    const rows = database
      .prepare(`
        SELECT g.*, p1.name AS p1_current, p2.name AS p2_current
        FROM games g
        LEFT JOIN players p1 ON p1.id = g.p1_player_id
        LEFT JOIN players p2 ON p2.id = g.p2_player_id
        WHERE (g.p1_player_id = @id OR g.p2_player_id = @id)
          AND g.status = 'finished'
          AND (@beforeId IS NULL OR g.id < @beforeId)
        ORDER BY g.id DESC
        LIMIT @limit
      `)
      .all({
        id: playerRowId,
        limit: Math.min(Math.max(Number(limit) || 20, 1), 50),
        beforeId: beforeId ? Number(beforeId) : null,
      });

    return rows.map((row) => {
      const yourSeat = row.p1_player_id === playerRowId ? 1 : 2;
      const opponentSeat = yourSeat === 1 ? 2 : 1;
      return {
        id: row.id,
        endedAt: row.ended_at,
        rounds: row.rounds,
        yourSeat,
        youWon: row.winner === null ? null : row.winner === yourSeat,
        reason: row.winner_reason,
        points: { 1: row.p1_points, 2: row.p2_points },
        opponent: {
          name: opponentSeat === 1 ? (row.p1_name || row.p1_current) : (row.p2_name || row.p2_current),
          avatar: parseAvatar(opponentSeat === 1 ? row.p1_avatar : row.p2_avatar),
        },
      };
    });
  });
}

// Public replay payload: names, avatars, the initial snapshot and the ordered
// action list. Chat is deliberately excluded — replays are shareable.
export function getGameForReplay(gameId) {
  return guard(null, (database) => {
    const row = database.prepare("SELECT * FROM games WHERE id = ?").get(Number(gameId));
    if (!row || row.status === "active") {
      return null;
    }
    const actions = database
      .prepare("SELECT idx, player_id, action_type, payload FROM game_actions WHERE game_id = ? ORDER BY idx ASC")
      .all(row.id)
      .map((action) => ({
        playerId: action.player_id,
        actionType: action.action_type,
        payload: JSON.parse(action.payload || "{}"),
      }));

    let finalCheck = null;
    try {
      finalCheck = row.final_check ? JSON.parse(row.final_check) : null;
    } catch {
      finalCheck = null;
    }

    return {
      id: row.id,
      engineVersion: row.engine_version,
      schemaVersion: row.schema_version,
      initialState: JSON.parse(row.initial_state),
      actions,
      players: {
        1: { name: row.p1_name, avatar: parseAvatar(row.p1_avatar) },
        2: { name: row.p2_name, avatar: parseAvatar(row.p2_avatar) },
      },
      winner: row.winner,
      reason: row.winner_reason,
      points: { 1: row.p1_points, 2: row.p2_points },
      rounds: row.rounds,
      finalCheck,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    };
  });
}

/* ------------------------------------------------------- push subscriptions */

export function savePushSubscription(playerRowId, subscription, lang) {
  if (!playerRowId || !subscription?.endpoint) {
    return false;
  }
  return guard(false, (database) => {
    database
      .prepare(`
        INSERT INTO push_subscriptions (player_id, endpoint, p256dh, auth, lang, created_at)
        VALUES (@playerId, @endpoint, @p256dh, @auth, @lang, @now)
        ON CONFLICT(endpoint) DO UPDATE SET
          player_id = excluded.player_id,
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          lang = excluded.lang
      `)
      .run({
        playerId: playerRowId,
        endpoint: String(subscription.endpoint),
        p256dh: String(subscription.keys?.p256dh || ""),
        auth: String(subscription.keys?.auth || ""),
        lang: lang === "fr" ? "fr" : "en",
        now: Date.now(),
      });
    return true;
  });
}

export function deletePushSubscription(endpoint) {
  if (!endpoint) {
    return;
  }
  guard(null, (database) => {
    database.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(String(endpoint));
    return null;
  });
}

export function getPushSubscriptions(playerRowId) {
  if (!playerRowId) {
    return [];
  }
  return guard([], (database) =>
    database.prepare("SELECT * FROM push_subscriptions WHERE player_id = ?").all(playerRowId));
}

export function touchPushSubscription(endpoint) {
  guard(null, (database) => {
    database.prepare("UPDATE push_subscriptions SET last_ok_at = ? WHERE endpoint = ?").run(Date.now(), endpoint);
    return null;
  });
}
