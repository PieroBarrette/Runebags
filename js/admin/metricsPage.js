// The audience counts kept by server/metrics.mjs, readable by the accounts
// named in the server's ADMIN_HANDLES. It uses the session the game itself
// stored, so sign in to the game on this browser first.
const SESSION_KEY = "runebags-session-v1";
const DAY_MS = 24 * 60 * 60 * 1000;

const FUNNEL = [
  ["visit", "Visites"],
  ["first_visit", "Premières visites"],
  ["ai_start", "Parties contre l'IA commencées"],
  ["ai_round1", "Première manche terminée"],
  ["ai_end", "Parties contre l'IA terminées"],
  ["rules_open", "Règles ouvertes"],
  ["online_open", "Jeu en ligne ouvert"],
  ["online_game", "Parties en ligne commencées"],
  ["online_end", "Parties en ligne terminées"],
  ["share", "Partages"],
];
// What each funnel step is a share of, shown under its total.
const SHARE_OF = {
  first_visit: "visit",
  ai_start: "visit",
  ai_round1: "ai_start",
  ai_end: "ai_start",
  online_game: "online_open",
};
const DAILY_COLUMNS = ["visit", "first_visit", "ai_start", "ai_round1", "ai_end", "online_game", "share"];
const LEVELS = ["1", "2", "3", "4", "5"];
const LEVEL_NAMES = { 1: "Facile", 2: "Moyen", 3: "Difficile", 4: "Très difficile", 5: "Expert" };
const LABELS = Object.fromEntries(FUNNEL);
const OTHER_ROWS = [
  ["ai_end", "win", "Victoires contre l'IA"],
  ["ai_end", "loss", "Défaites contre l'IA"],
  ["ai_end", "draw", "Nulles contre l'IA"],
  ["online_game", "ranked", "Parties en ligne classées"],
  ["online_game", "friendly", "Parties en ligne amicales"],
  ["share", "result", "Résultats partagés"],
  ["share", "invite", "Invitations envoyées"],
  ["lang", "fr", "Visites en français"],
  ["lang", "en", "Visites en anglais"],
];

const elements = {
  days: document.getElementById("metrics-days"),
  message: document.getElementById("metrics-message"),
  content: document.getElementById("metrics-content"),
  tiles: document.getElementById("metrics-tiles"),
  daily: document.getElementById("metrics-daily"),
  sources: document.getElementById("metrics-sources"),
  levels: document.getElementById("metrics-levels"),
  other: document.getElementById("metrics-other"),
};

elements.days.addEventListener("change", load);
load();

async function load() {
  showMessage("Chargement…");
  let token = null;
  try {
    token = window.localStorage.getItem(SESSION_KEY);
  } catch {
    // Storage blocked: handled as signed out below.
  }
  if (!token) {
    showMessage("Connectez-vous d'abord au jeu, sur ce navigateur, avec un compte autorisé.");
    return;
  }

  let response;
  try {
    response = await fetch(`/api/admin/metrics?days=${encodeURIComponent(elements.days.value)}`, {
      headers: { "x-session-token": token },
      cache: "no-store",
    });
  } catch {
    showMessage("Le serveur ne répond pas.");
    return;
  }
  if (response.status === 403) {
    showMessage("Ce compte n'a pas accès à la mesure d'audience : son pseudo doit figurer dans la variable ADMIN_HANDLES du serveur.");
    return;
  }
  if (!response.ok) {
    showMessage(`Le serveur a répondu ${response.status}.`);
    return;
  }

  render(await response.json());
}

function showMessage(text) {
  elements.message.textContent = text;
  elements.message.hidden = !text;
  elements.content.hidden = true;
}

function render({ since, until, rows }) {
  const total = new Map();
  const byDim = new Map();
  const byDay = new Map();
  for (const { day, event, dim, count } of rows) {
    total.set(event, (total.get(event) || 0) + count);
    byDim.set(`${event}|${dim}`, (byDim.get(`${event}|${dim}`) || 0) + count);
    byDay.set(`${day}|${event}`, (byDay.get(`${day}|${event}`) || 0) + count);
  }

  renderTiles(total);
  renderDaily(byDay, daysBetween(since, until));
  renderSources(rows);
  renderLevels(byDim);
  renderTable(elements.other, ["", "Total"], OTHER_ROWS.map(([event, dim, label]) => [
    label,
    byDim.get(`${event}|${dim}`) || 0,
  ]));

  elements.message.hidden = true;
  elements.content.hidden = false;
}

function renderTiles(total) {
  elements.tiles.replaceChildren(...FUNNEL.map(([event, label]) => {
    const tile = document.createElement("div");
    tile.className = "metrics-tile";
    const value = document.createElement("strong");
    value.textContent = String(total.get(event) || 0);
    const caption = document.createElement("span");
    caption.textContent = label;
    tile.append(value, caption);

    const base = SHARE_OF[event] ? total.get(SHARE_OF[event]) || 0 : 0;
    if (base > 0) {
      const share = document.createElement("span");
      share.textContent = ` · ${Math.round(((total.get(event) || 0) * 100) / base)} % de « ${LABELS[SHARE_OF[event]]} »`;
      tile.append(share);
    }
    return tile;
  }));
}

function renderDaily(byDay, days) {
  renderTable(
    elements.daily,
    ["Jour", ...DAILY_COLUMNS.map((event) => LABELS[event])],
    days.map((day) => [day, ...DAILY_COLUMNS.map((event) => byDay.get(`${day}|${event}`) || 0)]),
  );
}

function renderSources(rows) {
  const bySource = new Map();
  for (const { event, dim, count } of rows) {
    if (event === "visit") {
      bySource.set(dim, (bySource.get(dim) || 0) + count);
    }
  }
  const sorted = [...bySource.entries()].sort((a, b) => b[1] - a[1]);
  renderTable(
    elements.sources,
    ["Source", "Visites"],
    sorted.length > 0
      ? sorted.map(([source, count]) => [source === "direct" ? "Accès direct ou inconnu" : source, count])
      : [["Aucune visite sur la période", 0]],
  );
}

function renderLevels(byDim) {
  renderTable(
    elements.levels,
    ["Niveau", "Commencées", "1re manche finie", "Taux"],
    LEVELS.map((level) => {
      const started = byDim.get(`ai_start|${level}`) || 0;
      const finished = byDim.get(`ai_round1|${level}`) || 0;
      return [LEVEL_NAMES[level], started, finished, started > 0 ? `${Math.round((finished * 100) / started)} %` : "—"];
    }),
  );
}

function renderTable(table, headings, rows) {
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const heading of headings) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = heading;
    headRow.append(cell);
  }
  head.append(headRow);

  const body = document.createElement("tbody");
  for (const values of rows) {
    const row = document.createElement("tr");
    values.forEach((value, index) => {
      const cell = document.createElement(index === 0 ? "th" : "td");
      if (index === 0) {
        cell.scope = "row";
      }
      cell.textContent = String(value);
      row.append(cell);
    });
    body.append(row);
  }
  table.replaceChildren(head, body);
}

// Newest first, every day of the period, so a quiet day shows as a row of zeros.
function daysBetween(since, until) {
  const days = [];
  const first = Date.parse(`${since}T12:00:00Z`);
  for (let at = Date.parse(`${until}T12:00:00Z`); at >= first; at -= DAY_MS) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}
