import { createInitialState } from "../core/gameState.js";
import { createRuneInstance } from "../runes/runeCatalog.js";

const ENCOUNTER_RUNE_BUDGETS = {
  "1-combat": { points: 4, runes: 6 },
  "1-elite": { points: 8, runes: 8 },
  "1-boss": { points: 12, runes: 10 },
  "2-combat": { points: 12, runes: 10 },
  "2-elite": { points: 16, runes: 12 },
  "2-boss": { points: 20, runes: 14 },
  "3-combat": { points: 20, runes: 14 },
  "3-elite": { points: 24, runes: 16 },
  "3-boss": { points: 28, runes: 18 },
  "4-combat": { points: 28, runes: 18 },
  "4-elite": { points: 32, runes: 20 },
  "4-boss": { points: 36, runes: 22 },
  "5-combat": { points: 36, runes: 22 },
  "5-elite": { points: 40, runes: 24 },
  "5-final-boss": { points: 50, runes: 25 },
};

const ENEMY_RUNE_OPTIONS = [
  { key: "laguz-l1", runeId: "laguz", level: 1, points: 1, runeCount: 1, maxPicks: 2 },
  { key: "berkana-l1", runeId: "berkana", level: 1, points: 1, runeCount: 1, maxPicks: 2 },
  { key: "ehwaz-l1", runeId: "ehwaz", level: 1, points: 1, runeCount: 1, maxPicks: 1 },
  { key: "eihwaz-l1", runeId: "eihwaz", level: 1, points: 1, runeCount: 1, maxPicks: 2 },
  { key: "fehu-l1", runeId: "fehu", level: 1, points: 1, runeCount: 1, maxPicks: 2 },
  { key: "hagalz-l1", runeId: "hagalz", level: 1, points: 1, runeCount: 1, maxPicks: 2 },
  { key: "odal-l1", runeId: "odal", level: 1, points: 1, runeCount: 1, maxPicks: 1 },
  { key: "uruz-l1", runeId: "uruz", level: 1, points: 1, runeCount: 1, maxPicks: 1 },

  { key: "dagaz-l1", runeId: "dagaz", level: 1, points: 2, runeCount: 1, maxPicks: 1 },
  { key: "isa-l1", runeId: "isa", level: 1, points: 2, runeCount: 1, maxPicks: 2 },
  { key: "mannaz-l1", runeId: "mannaz", level: 1, points: 2, runeCount: 1, maxPicks: 2 },
  { key: "nauthiz-l1", runeId: "nauthiz", level: 1, points: 2, runeCount: 1, maxPicks: 1 },
  { key: "sowelu-l1", runeId: "sowelu", level: 1, points: 2, runeCount: 1, maxPicks: 2 },
  { key: "thurisa-l1", runeId: "thurisa", level: 1, points: 2, runeCount: 1, maxPicks: 2 },
  { key: "fehu-l2", runeId: "fehu", level: 2, points: 2, runeCount: 1, maxPicks: 1 },
  { key: "ehwaz-l2", runeId: "ehwaz", level: 2, points: 2, runeCount: 1, maxPicks: 1 },

  { key: "algiz-l1", runeId: "algiz", level: 1, points: 3, runeCount: 1, maxPicks: 1 },
  { key: "ansuz-l1", runeId: "ansuz", level: 1, points: 3, runeCount: 1, maxPicks: 1 },
  { key: "gebo-l1", runeId: "gebo", level: 1, points: 3, runeCount: 1, maxPicks: 2 },
  { key: "perth-l1", runeId: "perth", level: 1, points: 3, runeCount: 1, maxPicks: 2 },
  { key: "raido-l1", runeId: "raido", level: 1, points: 3, runeCount: 1, maxPicks: 2 },
  { key: "teiwaz-l1", runeId: "teiwaz", level: 1, points: 3, runeCount: 1, maxPicks: 2 },
  { key: "thurisa-l2", runeId: "thurisa", level: 2, points: 3, runeCount: 1, maxPicks: 1 },
  { key: "sowelu-l2", runeId: "sowelu", level: 2, points: 3, runeCount: 1, maxPicks: 1 },
  { key: "mannaz-l2", runeId: "mannaz", level: 2, points: 3, runeCount: 1, maxPicks: 1 },

  { key: "gebo-l2", runeId: "gebo", level: 2, points: 4, runeCount: 1, maxPicks: 1 },
  { key: "perth-l2", runeId: "perth", level: 2, points: 4, runeCount: 1, maxPicks: 1 },
  { key: "raido-l2", runeId: "raido", level: 2, points: 4, runeCount: 1, maxPicks: 1 },
  { key: "teiwaz-l2", runeId: "teiwaz", level: 2, points: 4, runeCount: 1, maxPicks: 1 },
  { key: "kenaz-pair", runeId: "kenaz", level: 1, points: 4, runeCount: 2, maxPicks: 1 },
];

const DEFAULT_ENEMY_BUDGET = { points: 4, runes: 6 };

const DEFAULT_ENEMY_BAG = [
  { runeId: "basic", level: 1 },
  { runeId: "basic", level: 1 },
  { runeId: "basic", level: 1 },
  { runeId: "basic", level: 1 },
  { runeId: "basic", level: 1 },
  { runeId: "basic", level: 1 },
];

const MAX_BACKTRACK_ATTEMPTS = 128;

const ENEMY_RUNE_OPTIONS_SORTED = [...ENEMY_RUNE_OPTIONS].sort((a, b) => b.points - a.points);

const ENEMY_OPTION_INDEX_BY_KEY = ENEMY_RUNE_OPTIONS_SORTED.reduce((acc, option, index) => {
  acc[option.key] = index;
  return acc;
}, {});

const ENEMY_LOOKUP = ENEMY_RUNE_OPTIONS_SORTED.map((option) => ({
  runeId: option.runeId,
  level: option.level,
  runeCount: option.runeCount,
}));

const ENEMY_MAX_PICK_COUNTS = ENEMY_RUNE_OPTIONS_SORTED.map((option) => option.maxPicks);

const ENEMY_POINTS = ENEMY_RUNE_OPTIONS_SORTED.map((option) => option.points);

const ENEMY_RUNE_COUNTS = ENEMY_RUNE_OPTIONS_SORTED.map((option) => option.runeCount);

const KENAZ_PAIR_INDEX = ENEMY_OPTION_INDEX_BY_KEY["kenaz-pair"];

function createSeededRng(seed) {
  let state = Number(seed) >>> 0;
  if (!state) {
    state = 0x6d2b79f5;
  }

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(values, rng) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temp = values[i];
    values[i] = values[j];
    values[j] = temp;
  }
}

function computeBudget(node) {
  const ante = Math.max(1, Number(node?.ante) || 1);
  const nodeType = getEncounterType(node);
  const key = `${ante}-${nodeType}`;
  return ENCOUNTER_RUNE_BUDGETS[key] || DEFAULT_ENEMY_BUDGET;
}

function canStillReachTarget(remainingPoints, remainingSlots, pickCounts) {
  let maxPoints = 0;
  let maxSlots = 0;

  for (let i = 0; i < ENEMY_RUNE_OPTIONS_SORTED.length; i += 1) {
    const available = ENEMY_MAX_PICK_COUNTS[i] - pickCounts[i];
    if (available <= 0) {
      continue;
    }
    maxPoints += available * ENEMY_POINTS[i];
    maxSlots += available * ENEMY_RUNE_COUNTS[i];
  }

  if (remainingPoints > maxPoints) {
    return false;
  }

  if (remainingSlots > maxSlots) {
    return false;
  }

  if (remainingPoints > remainingSlots * 4) {
    return false;
  }

  return true;
}

function extractRunesFromPickCounts(pickCounts) {
  const runes = [];
  for (let i = 0; i < pickCounts.length; i += 1) {
    const count = pickCounts[i];
    if (count <= 0) {
      continue;
    }

    const entry = ENEMY_LOOKUP[i];
    for (let pick = 0; pick < count; pick += 1) {
      for (let rune = 0; rune < entry.runeCount; rune += 1) {
        runes.push({ runeId: entry.runeId, level: entry.level });
      }
    }
  }
  return runes;
}

function buildEnemySpecialRunesForBudget(points, runeSlots, rng) {
  if (points <= 0) {
    return [];
  }

  const order = Array.from({ length: ENEMY_RUNE_OPTIONS_SORTED.length }, (_, index) => index);
  const memo = new Set();
  const pickCounts = new Array(ENEMY_RUNE_OPTIONS_SORTED.length).fill(0);

  function solve(remainingPoints, remainingSlots) {
    if (remainingPoints === 0) {
      return true;
    }

    if (remainingPoints < 0 || remainingSlots <= 0) {
      return false;
    }

    if (!canStillReachTarget(remainingPoints, remainingSlots, pickCounts)) {
      return false;
    }

    const stateKey = `${remainingPoints}|${remainingSlots}|${pickCounts.join(",")}`;
    if (memo.has(stateKey)) {
      return false;
    }

    const candidates = [...order];
    shuffleInPlace(candidates, rng);

    for (let i = 0; i < candidates.length; i += 1) {
      const optionIndex = candidates[i];
      const nextCount = pickCounts[optionIndex] + 1;
      if (nextCount > ENEMY_MAX_PICK_COUNTS[optionIndex]) {
        continue;
      }

      const optionPoints = ENEMY_POINTS[optionIndex];
      const optionRunes = ENEMY_RUNE_COUNTS[optionIndex];
      if (optionPoints > remainingPoints || optionRunes > remainingSlots) {
        continue;
      }

      pickCounts[optionIndex] = nextCount;
      if (solve(remainingPoints - optionPoints, remainingSlots - optionRunes)) {
        return true;
      }
      pickCounts[optionIndex] -= 1;
    }

    memo.add(stateKey);
    return false;
  }

  if (!solve(points, runeSlots)) {
    return null;
  }

  return extractRunesFromPickCounts(pickCounts);
}

function buildEnemyBagEntriesForNode(node, campaignState) {
  const seedBase = Number(campaignState?.startedAt) || Date.now();
  const nodeId = String(node?.id || "node");
  const budget = computeBudget(node);
  const maxRuneSlots = Math.max(1, Number(budget.runes) || 1);
  const targetPoints = Math.max(0, Number(budget.points) || 0);

  for (let attempt = 0; attempt < MAX_BACKTRACK_ATTEMPTS; attempt += 1) {
    const rngSeed = hashString(`${seedBase}-${nodeId}-enemy-bag-${attempt}`);
    const rng = createSeededRng(rngSeed);
    const specialRunes = buildEnemySpecialRunesForBudget(targetPoints, maxRuneSlots, rng);
    if (!specialRunes) {
      continue;
    }

    const bag = [...specialRunes];
    while (bag.length < maxRuneSlots) {
      bag.push({ runeId: "basic", level: 1 });
    }

    shuffleInPlace(bag, rng);
    return {
      pointBudget: targetPoints,
      runeBudget: maxRuneSlots,
      runeEntries: bag,
      seed: rngSeed,
      includesKenazPair: KENAZ_PAIR_INDEX >= 0
        ? specialRunes.filter((entry) => entry.runeId === "kenaz").length === 2
        : false,
    };
  }

  return {
    pointBudget: targetPoints,
    runeBudget: maxRuneSlots,
    runeEntries: [...DEFAULT_ENEMY_BAG],
    seed: hashString(`${seedBase}-${nodeId}-enemy-bag-fallback`),
    includesKenazPair: false,
  };
}

export function buildCampaignEnemyBagsForRun(nodes, campaignState) {
  const mapping = {};
  const sourceNodes = Array.isArray(nodes) ? nodes : [];

  sourceNodes.forEach((node) => {
    if (!node || !node.id) {
      return;
    }

    const type = getEncounterType(node);
    if (type !== "combat" && type !== "elite" && type !== "boss" && type !== "final-boss") {
      return;
    }

    mapping[node.id] = buildEnemyBagEntriesForNode(node, campaignState);
  });

  return mapping;
};

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createBagFromEntries(entries) {
  return entries
    .map((entry) => createRuneInstance(entry?.runeId, Number(entry?.level) || 1))
    .filter(Boolean);
}

function buildPlayerCampaignBag(loadoutRunes) {
  const source = Array.isArray(loadoutRunes) && loadoutRunes.length > 0
    ? loadoutRunes
    : [
      { runeId: "basic", level: 1 },
      { runeId: "basic", level: 1 },
      { runeId: "basic", level: 1 },
      { runeId: "basic", level: 1 },
      { runeId: "basic", level: 1 },
      { runeId: "basic", level: 1 },
      { runeId: "jera", level: 1 },
      { runeId: "jera", level: 1 },
      { runeId: "inguz", level: 1 },
      { runeId: "inguz", level: 1 },
    ];

  const bag = [];
  source.forEach((entry) => {
    const rune = createRuneInstance(entry?.runeId, Number(entry?.level) || 1);
    if (rune) {
      bag.push(rune);
    }
  });

  return bag;
}

function getEncounterType(node) {
  if (!node) {
    return "combat";
  }
  if (node.type === "elite" || node.type === "boss" || node.type === "final-boss") {
    return node.type;
  }
  return "combat";
}

function getEnemyPoolSelection(node, campaignState) {
  const nodeType = getEncounterType(node);
  const mapped = campaignState?.enemyBagByNode?.[node?.id];
  const generated = mapped?.runeEntries
    ? mapped
    : buildEnemyBagEntriesForNode(node, campaignState);

  const runeEntries = Array.isArray(generated?.runeEntries) ? generated.runeEntries : DEFAULT_ENEMY_BAG;
  const pointBudget = Math.max(0, Number(generated?.pointBudget) || 0);
  const runeBudget = Math.max(1, Number(generated?.runeBudget) || runeEntries.length || 1);

  return {
    nodeType,
    runeEntries,
    pointBudget,
    runeBudget,
  };
}

function getObjective(nodeType, ante) {
  if (nodeType === "elite") {
    return `Elite encounter (Ante ${ante}): win over 5 supply points.`;
  }
  if (nodeType === "boss") {
    return `Boss encounter (Ante ${ante}): harder constraints over 7 supply points.`;
  }
  if (nodeType === "final-boss") {
    return "Final boss: severe constraints over 10 supply points.";
  }
  return `Normal encounter (Ante ${ante}): win over 3 supply points.`;
}

function applyOpeningPressure(state, nodeType) {
  if (nodeType === "final-boss") {
    // Slight opening disadvantage for the player in the final boss.
    state.board[state.rows - 1][3] = 2;
  }
}

export function getCampaignEncounterByNodeId(nodeId) {
  return nodeId ? { id: nodeId } : null;
}

export function getCampaignOpponentPreview(node, campaignState) {
  const selection = getEnemyPoolSelection(node, campaignState);
  return {
    nodeType: selection.nodeType,
    pointBudget: selection.pointBudget,
    runeBudget: selection.runeBudget,
    runeEntries: selection.runeEntries.map((entry) => ({
      runeId: String(entry?.runeId || "basic"),
      level: Math.max(1, Number(entry?.level) || 1),
    })),
    runeIds: selection.runeEntries.map((entry) => String(entry?.runeId || "basic")),
  };
}

export function buildCampaignEncounterState(node, campaignState, options = {}) {
  const state = createInitialState(options);
  const selection = getEnemyPoolSelection(node, campaignState);
  const nodeType = selection.nodeType;
  const ante = Math.max(1, Number(node?.ante) || 1);

  state.phase = "round";
  state.roundNumber = 1;
  state.turnNumber = 1;
  state.pointPoolTotal = Math.max(1, Number(node?.roundPointPool) || 3);
  state.pointPoolRemaining = Math.max(1, Number(node?.roundPointPool) || 3);
  state.tieRemovedPoints = 0;
  state.winner = null;
  state.winningLine = null;
  state.gameWinner = null;
  state.gameWinnerReason = null;
  state.isDraw = false;
  state.pendingAction = null;
  state.roundAwayRunes = [];
  state.nextTurnConstraints = { 1: null, 2: null };

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      state.board[row][col] = 0;
      state.boardRunes[row][col] = null;
    }
  }

  const enemyBagEntries = selection.runeEntries;

  const playerBasic = createRuneInstance("basic", 1);
  const enemyBasic = createRuneInstance("basic", 1);

  state.players[1].hand = playerBasic ? [playerBasic] : [];
  state.players[1].bag = buildPlayerCampaignBag(campaignState?.loadoutRunes || []);
  state.players[1].discard = [];
  state.players[1].selectedRuneInstanceId = null;

  state.players[2].hand = enemyBasic ? [enemyBasic] : [];
  state.players[2].bag = createBagFromEntries(enemyBagEntries);
  state.players[2].discard = [];
  state.players[2].selectedRuneInstanceId = null;

  state.players[1].points = 0;
  state.players[2].points = 0;
  state.currentPlayer = 1;

  applyOpeningPressure(state, nodeType);

  const bossName = nodeType === "boss" || nodeType === "final-boss"
    ? String(campaignState?.bossNameByNode?.[node?.id] || "Unnamed Boss").trim()
    : "";

  const objective = getObjective(nodeType, ante);
  const recommendedColumn = nodeType === "combat" ? 3 : 4;

  state.log = [
    `Campaign encounter: ${node?.title || "Encounter"}${bossName ? ` vs ${bossName}` : ""}`,
    objective,
    `Supply points: ${state.pointPoolRemaining}`,
    `Opponent bag budget: ${selection.pointBudget} rune points over ${selection.runeBudget} runes.`,
  ];

  if (nodeType === "boss" || nodeType === "final-boss") {
    state.log.unshift(`Boss pressure active: ${bossName} constrains your opening turn.`);
  }

  return {
    state,
    objective,
    recommendedColumn,
    currentPlayer: 1,
  };
}
