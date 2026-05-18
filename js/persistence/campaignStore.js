import { CAMPAIGN_NODES, CAMPAIGN_START_NODE_ID, getCampaignNodeById } from "../campaign/campaignCatalog.js";
import { getRuneById, INITIAL_SHOP_COUNTS } from "../runes/runeCatalog.js";

const SCHEMA_VERSION = 2;

function sanitizeLoadoutRunes(candidate) {
  const list = Array.isArray(candidate) ? candidate : [];
  return list
    .map((entry) => {
      const runeId = String(entry?.runeId || "").trim();
      const rune = getRuneById(runeId);
      if (!rune) {
        return null;
      }

      const level = Math.max(1, Math.min(Number(entry?.level) || 1, Number(rune.maxLevel) || 1));
      return { runeId, level };
    })
    .filter(Boolean);
}

function createDefaultRunBag() {
  return [
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
}

function createDefaultCampaignShopSupply() {
  const supply = [];
  Object.entries(INITIAL_SHOP_COUNTS).forEach(([runeId, count]) => {
    for (let i = 0; i < count; i += 1) {
      supply.push({ runeId, level: 1 });
    }
  });
  return supply;
}

function getKey(profileSlot) {
  const slot = Number(profileSlot);
  const safe = Number.isInteger(slot) && slot >= 1 && slot <= 3 ? slot : 1;
  return `runebags-profile-${safe}-campaign-v1`;
}

function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    started: false,
    currentNodeId: null,
    unlockedNodeIds: [CAMPAIGN_START_NODE_ID],
    completedNodeIds: [],
    completedBossCount: 0,
    loadoutRunes: createDefaultRunBag(),
    pendingRewardNodeId: null,
    pendingRewardChoices: [],
    campaignShopSupply: createDefaultCampaignShopSupply(),
    shopOfferByNode: {},
    bossNameByNode: {},
    runCombatPoints: 0,
    runPerformancePoints: 0,
    runRerollsSpent: 0,
    startedAt: null,
    updatedAt: Date.now(),
  };
}

function sanitizeState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const unlockedSet = new Set(Array.isArray(source.unlockedNodeIds) ? source.unlockedNodeIds.map((id) => String(id)) : []);
  const completedSet = new Set(Array.isArray(source.completedNodeIds) ? source.completedNodeIds.map((id) => String(id)) : []);

  unlockedSet.add(CAMPAIGN_START_NODE_ID);

  const unlockedNodeIds = [...unlockedSet].filter((id) => getCampaignNodeById(id));
  const completedNodeIds = [...completedSet].filter((id) => getCampaignNodeById(id));
  const currentNodeId = getCampaignNodeById(source.currentNodeId) ? String(source.currentNodeId) : null;

  const completedBossCount = completedNodeIds.reduce((count, id) => {
    const node = getCampaignNodeById(id);
    return node?.type === "boss" || node?.type === "final-boss" ? count + 1 : count;
  }, 0);

  const shopOfferByNode = source.shopOfferByNode && typeof source.shopOfferByNode === "object"
    ? source.shopOfferByNode
    : {};
  const sanitizedShopOffers = {};
  Object.entries(shopOfferByNode).forEach(([nodeId, offer]) => {
    if (!getCampaignNodeById(nodeId)) {
      return;
    }
    sanitizedShopOffers[nodeId] = sanitizeLoadoutRunes(offer).slice(0, 5);
  });

  const campaignShopSupply = Array.isArray(source.campaignShopSupply)
    ? sanitizeLoadoutRunes(source.campaignShopSupply)
    : createDefaultCampaignShopSupply();

  const bossNameByNode = source.bossNameByNode && typeof source.bossNameByNode === "object"
    ? source.bossNameByNode
    : {};
  const sanitizedBossNames = {};
  Object.entries(bossNameByNode).forEach(([nodeId, name]) => {
    const node = getCampaignNodeById(nodeId);
    if (!node || (node.type !== "boss" && node.type !== "final-boss")) {
      return;
    }
    const safeName = String(name || "").trim();
    if (!safeName) {
      return;
    }
    sanitizedBossNames[nodeId] = safeName.slice(0, 36);
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    started: Boolean(source.started),
    currentNodeId,
    unlockedNodeIds,
    completedNodeIds,
    completedBossCount,
    loadoutRunes: sanitizeLoadoutRunes(source.loadoutRunes),
    pendingRewardNodeId: getCampaignNodeById(source.pendingRewardNodeId)
      ? String(source.pendingRewardNodeId)
      : null,
    pendingRewardChoices: sanitizeLoadoutRunes(source.pendingRewardChoices).slice(0, 3),
    campaignShopSupply,
    shopOfferByNode: sanitizedShopOffers,
    bossNameByNode: sanitizedBossNames,
    runCombatPoints: Math.max(0, Number(source.runCombatPoints) || 0),
    runPerformancePoints: Math.max(0, Number(source.runPerformancePoints) || 0),
    runRerollsSpent: Math.max(0, Number(source.runRerollsSpent) || 0),
    startedAt: Number(source.startedAt) || null,
    updatedAt: Number(source.updatedAt) || Date.now(),
  };
}

export function loadCampaignState(profileSlot) {
  const raw = localStorage.getItem(getKey(profileSlot));
  if (!raw) {
    const initial = createDefaultState();
    saveCampaignState(profileSlot, initial);
    return initial;
  }

  try {
    const parsed = sanitizeState(JSON.parse(raw));
    saveCampaignState(profileSlot, parsed);
    return parsed;
  } catch {
    const fallback = createDefaultState();
    saveCampaignState(profileSlot, fallback);
    return fallback;
  }
}

export function saveCampaignState(profileSlot, state) {
  const next = sanitizeState(state);
  next.updatedAt = Date.now();
  localStorage.setItem(getKey(profileSlot), JSON.stringify(next));
}

export function startCampaignRun(state) {
  const next = sanitizeState(state);
  next.started = true;
  if (!next.currentNodeId) {
    next.currentNodeId = CAMPAIGN_START_NODE_ID;
  }
  next.unlockedNodeIds = Array.from(new Set([...next.unlockedNodeIds, CAMPAIGN_START_NODE_ID]));
  if (!Array.isArray(next.loadoutRunes) || next.loadoutRunes.length === 0) {
    next.loadoutRunes = createDefaultRunBag();
  }
  if (!next.startedAt) {
    next.startedAt = Date.now();
  }
  return next;
}

export function resetCampaignRun() {
  return createDefaultState();
}

export function completeCampaignNode(state, nodeId) {
  const next = sanitizeState(state);
  const node = getCampaignNodeById(nodeId);
  if (!node) {
    return next;
  }

  next.started = true;
  next.currentNodeId = node.id;
  next.completedNodeIds = Array.from(new Set([...next.completedNodeIds, node.id]));

  const unlockedSet = new Set(next.unlockedNodeIds);
  node.nextIds.forEach((id) => {
    if (getCampaignNodeById(id)) {
      unlockedSet.add(id);
    }
  });
  next.unlockedNodeIds = [...unlockedSet];

  next.completedBossCount = next.completedNodeIds.reduce((count, id) => {
    const entry = getCampaignNodeById(id);
    return entry?.type === "boss" || entry?.type === "final-boss" ? count + 1 : count;
  }, 0);

  if (!next.startedAt) {
    next.startedAt = Date.now();
  }

  if (next.pendingRewardNodeId === node.id) {
    next.pendingRewardNodeId = null;
    next.pendingRewardChoices = [];
  }

  return next;
}

export function setCampaignPendingReward(state, nodeId, choices) {
  const next = sanitizeState(state);
  if (!getCampaignNodeById(nodeId)) {
    return next;
  }

  next.pendingRewardNodeId = nodeId;
  next.pendingRewardChoices = sanitizeLoadoutRunes(choices).slice(0, 3);
  return next;
}

export function claimCampaignRewardChoice(state, nodeId, rewardIndex) {
  const next = sanitizeState(state);
  if (next.pendingRewardNodeId !== nodeId) {
    return next;
  }

  const index = Number(rewardIndex);
  if (!Number.isInteger(index) || index < 0 || index >= next.pendingRewardChoices.length) {
    return next;
  }

  const picked = next.pendingRewardChoices[index];
  next.loadoutRunes = [...next.loadoutRunes, picked];
  next.pendingRewardNodeId = null;
  next.pendingRewardChoices = [];
  return next;
}

export function setCampaignShopOffer(state, nodeId, offerRunes) {
  const next = sanitizeState(state);
  if (!getCampaignNodeById(nodeId)) {
    return next;
  }

  next.shopOfferByNode[nodeId] = sanitizeLoadoutRunes(offerRunes).slice(0, 5);
  return next;
}

export function setCampaignBossName(state, nodeId, bossName) {
  const next = sanitizeState(state);
  const node = getCampaignNodeById(nodeId);
  if (!node || (node.type !== "boss" && node.type !== "final-boss")) {
    return next;
  }

  const safeName = String(bossName || "").trim();
  if (!safeName) {
    return next;
  }

  next.bossNameByNode[nodeId] = safeName.slice(0, 36);
  return next;
}

export function addCampaignCombatPoints(state, amount) {
  const next = sanitizeState(state);
  const gain = Math.max(0, Number(amount) || 0);
  next.runCombatPoints += gain;
  return next;
}

export function addCampaignPerformancePoints(state, amount) {
  const next = sanitizeState(state);
  const gain = Math.max(0, Number(amount) || 0);
  next.runPerformancePoints += gain;
  return next;
}

export function spendCampaignReroll(state, amount = 1) {
  const next = sanitizeState(state);
  const spend = Math.max(0, Number(amount) || 0);
  next.runRerollsSpent += spend;
  return next;
}

export function addCampaignLoadoutRune(state, runeEntry) {
  const next = sanitizeState(state);
  const additions = sanitizeLoadoutRunes([runeEntry]);
  if (!additions.length) {
    return next;
  }
  next.loadoutRunes = [...next.loadoutRunes, additions[0]];
  return next;
}

export function removeCampaignLoadoutRune(state, index) {
  const next = sanitizeState(state);
  const target = Number(index);
  if (!Number.isInteger(target) || target < 0 || target >= next.loadoutRunes.length) {
    return next;
  }

  next.loadoutRunes = next.loadoutRunes.filter((_, i) => i !== target);
  return next;
}

export function combineCampaignLoadoutRune(state, runeId) {
  const next = sanitizeState(state);
  const id = String(runeId || "").trim();
  const runeMeta = getRuneById(id);
  if (!runeMeta || !runeMeta.supportsLevels || (runeMeta.maxLevel || 1) < 2) {
    return next;
  }

  const levelOneIndexes = [];
  next.loadoutRunes.forEach((entry, index) => {
    if (entry.runeId === id && entry.level === 1) {
      levelOneIndexes.push(index);
    }
  });
  if (levelOneIndexes.length < 2) {
    return next;
  }

  const removeSet = new Set(levelOneIndexes.slice(0, 2));
  const remaining = next.loadoutRunes.filter((_, index) => !removeSet.has(index));
  next.loadoutRunes = [...remaining, { runeId: id, level: 2 }];
  return next;
}

export function getCampaignCompletion(state) {
  const safe = sanitizeState(state);
  const total = CAMPAIGN_NODES.length;
  const completed = safe.completedNodeIds.length;
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    bosses: safe.completedBossCount,
  };
}
