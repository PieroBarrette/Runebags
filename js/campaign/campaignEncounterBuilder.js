import { createInitialState } from "../core/gameState.js";
import { createRuneInstance } from "../runes/runeCatalog.js";

const ENEMY_BAG_POOLS = {
  combat: [
    ["uruz", "ansuz", "ehwaz", "basic", "basic", "basic"],
    ["raido", "mannaz", "sowelu", "basic", "basic", "basic"],
    ["fehu", "gebo", "perth", "basic", "basic", "basic"],
    ["teiwaz", "raido", "ansuz", "basic", "basic", "basic"],
  ],
  elite: [
    ["ehwaz", "ehwaz", "mannaz", "perth", "basic", "basic", "basic"],
    ["teiwaz", "thurisa", "sowelu", "raido", "basic", "basic", "basic"],
    ["fehu", "fehu", "ansuz", "mannaz", "basic", "basic", "basic"],
  ],
  boss: [
    ["thurisa", "teiwaz", "mannaz", "perth", "sowelu", "basic", "basic", "basic"],
    ["ehwaz", "ehwaz", "raido", "teiwaz", "ansuz", "basic", "basic", "basic"],
    ["fehu", "fehu", "gebo", "thurisa", "perth", "basic", "basic", "basic"],
  ],
  "final-boss": [
    ["thurisa", "thurisa", "teiwaz", "teiwaz", "mannaz", "perth", "sowelu", "basic", "basic"],
    ["ehwaz", "ehwaz", "fehu", "fehu", "raido", "thurisa", "perth", "basic", "basic"],
  ],
};

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededPickIndex(seed, length) {
  if (length <= 1) {
    return 0;
  }
  const value = Math.abs(Number(seed) || 0) % length;
  return value;
}

function createBagFromIds(ids) {
  return ids
    .map((id) => createRuneInstance(id, 1))
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

function getObjective(nodeType, ante) {
  if (nodeType === "elite") {
    return `Elite encounter (Ante ${ante}): survive pressure over 5 supply points.`;
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
  if (nodeType === "elite") {
    state.nextTurnConstraints[1] = [2, 3, 4];
    return;
  }
  if (nodeType === "boss") {
    state.nextTurnConstraints[1] = [3];
    return;
  }
  if (nodeType === "final-boss") {
    state.nextTurnConstraints[1] = [2, 3, 4];
    // Slight opening disadvantage for the player in the final boss.
    state.board[state.rows - 1][3] = 2;
  }
}

export function getCampaignEncounterByNodeId(nodeId) {
  return nodeId ? { id: nodeId } : null;
}

export function buildCampaignEncounterState(node, campaignState, options = {}) {
  const state = createInitialState(options);
  const nodeType = getEncounterType(node);
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

  const seedBase = Number(campaignState?.startedAt) || Date.now();
  const pools = ENEMY_BAG_POOLS[nodeType] || ENEMY_BAG_POOLS.combat;
  const poolIndex = seededPickIndex(hashString(`${seedBase}-${node?.id || "node"}`), pools.length);
  const enemyBagIds = pools[poolIndex] || pools[0] || [];

  const playerBasic = createRuneInstance("basic", 1);
  const enemyBasic = createRuneInstance("basic", 1);

  state.players[1].hand = playerBasic ? [playerBasic] : [];
  state.players[1].bag = buildPlayerCampaignBag(campaignState?.loadoutRunes || []);
  state.players[1].discard = [];
  state.players[1].selectedRuneInstanceId = null;

  state.players[2].hand = enemyBasic ? [enemyBasic] : [];
  state.players[2].bag = createBagFromIds(enemyBagIds);
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
    `Opponent template: ${poolIndex + 1}/${pools.length}`,
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
