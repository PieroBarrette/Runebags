const PROFILE_STORAGE_KEY = "runebags-profiles-v1";
const PROFILE_SCHEMA_VERSION = 1;
const MAX_PROFILE_SLOTS = 3;

function createEmptyProgress() {
  return {
    campaignNodesCompleted: 0,
    campaignNodesTotal: 0,
    puzzlesSolved: 0,
    puzzlesTotal: 0,
    achievementsUnlocked: 0,
    achievementsTotal: 0,
  };
}

function createDefaultSlot(slot) {
  return {
    slot,
    name: `Profile ${slot}`,
    createdAt: null,
    lastPlayedAt: null,
    tutorialSeen: false,
    walletPoints: 0,
    progression: createEmptyProgress(),
  };
}

function createDefaultPayload() {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    activeSlot: 1,
    slots: [createDefaultSlot(1), createDefaultSlot(2), createDefaultSlot(3)],
  };
}

function sanitizeSlot(rawSlot, fallbackSlot) {
  const slot = Number(rawSlot);
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_PROFILE_SLOTS) {
    return fallbackSlot;
  }
  return slot;
}

function sanitizeName(rawName, slot) {
  const text = String(rawName || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return `Profile ${slot}`;
  }
  return text.slice(0, 20);
}

function sanitizeProgress(rawProgress) {
  const source = rawProgress && typeof rawProgress === "object" ? rawProgress : {};
  return {
    campaignNodesCompleted: Math.max(0, Number(source.campaignNodesCompleted) || 0),
    campaignNodesTotal: Math.max(0, Number(source.campaignNodesTotal) || 0),
    puzzlesSolved: Math.max(0, Number(source.puzzlesSolved) || 0),
    puzzlesTotal: Math.max(0, Number(source.puzzlesTotal) || 0),
    achievementsUnlocked: Math.max(0, Number(source.achievementsUnlocked) || 0),
    achievementsTotal: Math.max(0, Number(source.achievementsTotal) || 0),
  };
}

function sanitizeSlotPayload(rawSlot, slot) {
  const source = rawSlot && typeof rawSlot === "object" ? rawSlot : {};
  return {
    slot,
    name: sanitizeName(source.name, slot),
    createdAt: Number(source.createdAt) || null,
    lastPlayedAt: Number(source.lastPlayedAt) || null,
    tutorialSeen: Boolean(source.tutorialSeen),
    walletPoints: Math.max(0, Math.floor(Number(source.walletPoints) || 0)),
    progression: sanitizeProgress(source.progression),
  };
}

function sanitizePayload(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const slotsByNumber = new Map();
  const sourceSlots = Array.isArray(source.slots) ? source.slots : [];

  sourceSlots.forEach((entry, index) => {
    const slot = sanitizeSlot(entry?.slot, index + 1);
    if (!slotsByNumber.has(slot)) {
      slotsByNumber.set(slot, sanitizeSlotPayload(entry, slot));
    }
  });

  const slots = [];
  for (let slot = 1; slot <= MAX_PROFILE_SLOTS; slot += 1) {
    slots.push(slotsByNumber.get(slot) || createDefaultSlot(slot));
  }

  const activeSlot = sanitizeSlot(source.activeSlot, 1);
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    activeSlot,
    slots,
  };
}

function readPayload() {
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) {
    return createDefaultPayload();
  }

  try {
    return sanitizePayload(JSON.parse(raw));
  } catch {
    return createDefaultPayload();
  }
}

function writePayload(payload) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(sanitizePayload(payload)));
}

export function loadProfileState() {
  const payload = readPayload();
  writePayload(payload);
  return payload;
}

export function saveProfileState(payload) {
  writePayload(payload);
}

export function getActiveProfileSlot() {
  return loadProfileState().activeSlot;
}

export function setActiveProfileSlot(slot) {
  const payload = loadProfileState();
  payload.activeSlot = sanitizeSlot(slot, payload.activeSlot);
  saveProfileState(payload);
  return payload.activeSlot;
}

export function getProfileSlots() {
  return loadProfileState().slots;
}

export function getProfileBySlot(slot) {
  const safeSlot = sanitizeSlot(slot, 1);
  const payload = loadProfileState();
  return payload.slots.find((item) => item.slot === safeSlot) || createDefaultSlot(safeSlot);
}

export function updateProfileName(slot, name) {
  const safeSlot = sanitizeSlot(slot, 1);
  const payload = loadProfileState();
  const profile = payload.slots.find((item) => item.slot === safeSlot);
  if (!profile) {
    return null;
  }
  profile.name = sanitizeName(name, safeSlot);
  if (!profile.createdAt) {
    profile.createdAt = Date.now();
  }
  profile.lastPlayedAt = Date.now();
  saveProfileState(payload);
  return profile;
}

export function touchProfileSlot(slot) {
  const safeSlot = sanitizeSlot(slot, 1);
  const payload = loadProfileState();
  const profile = payload.slots.find((item) => item.slot === safeSlot);
  if (!profile) {
    return;
  }
  if (!profile.createdAt) {
    profile.createdAt = Date.now();
  }
  profile.lastPlayedAt = Date.now();
  saveProfileState(payload);
}

export function setProfileAchievementProgress(slot, unlockedCount, totalCount) {
  const safeSlot = sanitizeSlot(slot, 1);
  const payload = loadProfileState();
  const profile = payload.slots.find((item) => item.slot === safeSlot);
  if (!profile) {
    return;
  }

  profile.progression = sanitizeProgress({
    ...profile.progression,
    achievementsUnlocked: Math.max(0, Number(unlockedCount) || 0),
    achievementsTotal: Math.max(0, Number(totalCount) || 0),
  });
  profile.lastPlayedAt = Date.now();
  saveProfileState(payload);
}

export function calculateProfileProgressPercent(profile) {
  if (!profile || typeof profile !== "object") {
    return 0;
  }

  const progression = sanitizeProgress(profile.progression);
  const campaignRatio = progression.campaignNodesTotal > 0
    ? progression.campaignNodesCompleted / progression.campaignNodesTotal
    : 0;
  const puzzleRatio = progression.puzzlesTotal > 0
    ? progression.puzzlesSolved / progression.puzzlesTotal
    : 0;
  const achievementRatio = progression.achievementsTotal > 0
    ? progression.achievementsUnlocked / progression.achievementsTotal
    : 0;

  const weighted = campaignRatio * 0.5 + puzzleRatio * 0.3 + achievementRatio * 0.2;
  const clamped = Math.max(0, Math.min(1, weighted));
  return Math.round(clamped * 100);
}