import { CAMPAIGN_NODES, CAMPAIGN_START_NODE_ID, getCampaignNodeById } from "../campaign/campaignCatalog.js";

const SCHEMA_VERSION = 1;

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
    return node?.type === "boss" ? count + 1 : count;
  }, 0);

  return {
    schemaVersion: SCHEMA_VERSION,
    started: Boolean(source.started),
    currentNodeId,
    unlockedNodeIds,
    completedNodeIds,
    completedBossCount,
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
    return entry?.type === "boss" ? count + 1 : count;
  }, 0);

  if (!next.startedAt) {
    next.startedAt = Date.now();
  }

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
