const PROFILE_STORAGE_KEY = "runebags-profiles-v1";
const PROFILE_SCHEMA_VERSION = 1;
const MAX_PROFILE_SLOTS = 3;

function createEmptyProgress() {
  return {
    campaignNodesCompleted: 0,
    campaignNodesTotal: 0,
    achievementsUnlocked: 0,
    achievementsTotal: 0,
  };
}

function createDefaultTutorialProgress() {
  return {
    introPromptSeen: false,
    completed: false,
    shopSequenceSeen: false,
    roundSequenceSeen: false,
    shownTriggerIds: [],
  };
}

function sanitizeTutorialProgress(rawProgress, legacyTutorialSeen = false) {
  const source = rawProgress && typeof rawProgress === "object" ? rawProgress : {};
  const shown = Array.isArray(source.shownTriggerIds)
    ? source.shownTriggerIds.filter((id) => typeof id === "string" && id.trim().length > 0)
    : [];

  return {
    introPromptSeen: Boolean(source.introPromptSeen) || Boolean(legacyTutorialSeen),
    completed: Boolean(source.completed),
    shopSequenceSeen: Boolean(source.shopSequenceSeen),
    roundSequenceSeen: Boolean(source.roundSequenceSeen),
    shownTriggerIds: [...new Set(shown)],
  };
}

function createDefaultSlot(slot) {
  return {
    slot,
    name: `Profile ${slot}`,
    createdAt: null,
    lastPlayedAt: null,
    tutorialSeen: false,
    tutorialEnabled: true,
    tutorialProgress: createDefaultTutorialProgress(),
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
    achievementsUnlocked: Math.max(0, Number(source.achievementsUnlocked) || 0),
    achievementsTotal: Math.max(0, Number(source.achievementsTotal) || 0),
  };
}

function sanitizeSlotPayload(rawSlot, slot) {
  const source = rawSlot && typeof rawSlot === "object" ? rawSlot : {};
  const legacyTutorialSeen = Boolean(source.tutorialSeen);
  const tutorialProgress = sanitizeTutorialProgress(source.tutorialProgress, legacyTutorialSeen);
  const tutorialEnabled = typeof source.tutorialEnabled === "boolean"
    ? source.tutorialEnabled
    : !legacyTutorialSeen;

  return {
    slot,
    name: sanitizeName(source.name, slot),
    createdAt: Number(source.createdAt) || null,
    lastPlayedAt: Number(source.lastPlayedAt) || null,
    tutorialSeen: tutorialProgress.introPromptSeen,
    tutorialEnabled: Boolean(tutorialEnabled),
    tutorialProgress,
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

export function hasProfileSeenTutorial(slot) {
  const safeSlot = sanitizeSlot(slot, 1);
  const profile = getProfileBySlot(safeSlot);
  return Boolean(profile?.tutorialProgress?.introPromptSeen || profile?.tutorialSeen);
}

export function markProfileTutorialSeen(slot) {
  const safeSlot = sanitizeSlot(slot, 1);
  const payload = loadProfileState();
  const profile = payload.slots.find((item) => item.slot === safeSlot);
  if (!profile) {
    return false;
  }

  profile.tutorialSeen = true;
  profile.tutorialProgress = sanitizeTutorialProgress({
    ...(profile.tutorialProgress || createDefaultTutorialProgress()),
    introPromptSeen: true,
  }, true);
  profile.lastPlayedAt = Date.now();
  saveProfileState(payload);
  return true;
}

export function getProfileTutorialState(slot) {
  const safeSlot = sanitizeSlot(slot, 1);
  const profile = getProfileBySlot(safeSlot);
  const progress = sanitizeTutorialProgress(profile?.tutorialProgress, profile?.tutorialSeen);
  const enabled = typeof profile?.tutorialEnabled === "boolean"
    ? profile.tutorialEnabled
    : false;

  return {
    enabled: Boolean(enabled),
    ...progress,
  };
}

export function setProfileTutorialEnabled(slot, enabled) {
  const safeSlot = sanitizeSlot(slot, 1);
  const payload = loadProfileState();
  const profile = payload.slots.find((item) => item.slot === safeSlot);
  if (!profile) {
    return false;
  }

  profile.tutorialEnabled = Boolean(enabled);
  profile.lastPlayedAt = Date.now();
  saveProfileState(payload);
  return true;
}

export function markProfileTutorialPromptSeen(slot) {
  return markProfileTutorialSeen(slot);
}

export function markProfileTutorialSequenceSeen(slot, sequenceKey) {
  const safeSlot = sanitizeSlot(slot, 1);
  const key = String(sequenceKey || "").trim().toLowerCase();
  if (!key) {
    return false;
  }

  const payload = loadProfileState();
  const profile = payload.slots.find((item) => item.slot === safeSlot);
  if (!profile) {
    return false;
  }

  const progress = sanitizeTutorialProgress(profile.tutorialProgress, profile.tutorialSeen);
  if (key === "shop") {
    progress.shopSequenceSeen = true;
  } else if (key === "round") {
    progress.roundSequenceSeen = true;
  } else {
    return false;
  }

  profile.tutorialProgress = progress;
  profile.tutorialSeen = progress.introPromptSeen;
  profile.lastPlayedAt = Date.now();
  saveProfileState(payload);
  return true;
}

export function markProfileTutorialTriggerShown(slot, triggerId) {
  const safeSlot = sanitizeSlot(slot, 1);
  const id = String(triggerId || "").trim();
  if (!id) {
    return false;
  }

  const payload = loadProfileState();
  const profile = payload.slots.find((item) => item.slot === safeSlot);
  if (!profile) {
    return false;
  }

  const progress = sanitizeTutorialProgress(profile.tutorialProgress, profile.tutorialSeen);
  if (!progress.shownTriggerIds.includes(id)) {
    progress.shownTriggerIds.push(id);
  }

  profile.tutorialProgress = progress;
  profile.tutorialSeen = progress.introPromptSeen;
  profile.lastPlayedAt = Date.now();
  saveProfileState(payload);
  return true;
}

export function markProfileTutorialCompleted(slot) {
  const safeSlot = sanitizeSlot(slot, 1);
  const payload = loadProfileState();
  const profile = payload.slots.find((item) => item.slot === safeSlot);
  if (!profile) {
    return false;
  }

  const progress = sanitizeTutorialProgress(profile.tutorialProgress, profile.tutorialSeen);
  progress.completed = true;
  profile.tutorialProgress = progress;
  profile.tutorialSeen = progress.introPromptSeen;
  profile.tutorialEnabled = false;
  profile.lastPlayedAt = Date.now();
  saveProfileState(payload);
  return true;
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

export function setProfileCampaignProgress(slot, completedCount, totalCount) {
  const safeSlot = sanitizeSlot(slot, 1);
  const payload = loadProfileState();
  const profile = payload.slots.find((item) => item.slot === safeSlot);
  if (!profile) {
    return;
  }

  profile.progression = sanitizeProgress({
    ...profile.progression,
    campaignNodesCompleted: Math.max(0, Number(completedCount) || 0),
    campaignNodesTotal: Math.max(0, Number(totalCount) || 0),
  });
  profile.lastPlayedAt = Date.now();
  saveProfileState(payload);
}

export function addProfileWalletPoints(slot, points) {
  const safeSlot = sanitizeSlot(slot, 1);
  const amount = Math.max(0, Math.floor(Number(points) || 0));
  if (amount <= 0) {
    return 0;
  }

  const payload = loadProfileState();
  const profile = payload.slots.find((item) => item.slot === safeSlot);
  if (!profile) {
    return 0;
  }

  profile.walletPoints = Math.max(0, Math.floor(Number(profile.walletPoints) || 0)) + amount;
  profile.lastPlayedAt = Date.now();
  saveProfileState(payload);
  return amount;
}

export function getProfileWalletPoints(slot) {
  const safeSlot = sanitizeSlot(slot, 1);
  const profile = getProfileBySlot(safeSlot);
  return Math.max(0, Math.floor(Number(profile.walletPoints) || 0));
}

export function spendProfileWalletPoints(slot, points) {
  const safeSlot = sanitizeSlot(slot, 1);
  const amount = Math.max(0, Math.floor(Number(points) || 0));
  if (amount <= 0) {
    return false;
  }

  const payload = loadProfileState();
  const profile = payload.slots.find((item) => item.slot === safeSlot);
  if (!profile) {
    return false;
  }

  const current = Math.max(0, Math.floor(Number(profile.walletPoints) || 0));
  if (current < amount) {
    return false;
  }

  profile.walletPoints = current - amount;
  profile.lastPlayedAt = Date.now();
  saveProfileState(payload);
  return true;
}

export function calculateProfileProgressPercent(profile) {
  if (!profile || typeof profile !== "object") {
    return 0;
  }

  const progression = sanitizeProgress(profile.progression);
  const campaignRatio = progression.campaignNodesTotal > 0
    ? progression.campaignNodesCompleted / progression.campaignNodesTotal
    : 0;
  const achievementRatio = progression.achievementsTotal > 0
    ? progression.achievementsUnlocked / progression.achievementsTotal
    : 0;

  const weighted = campaignRatio * 0.7 + achievementRatio * 0.3;
  const clamped = Math.max(0, Math.min(1, weighted));
  return Math.round(clamped * 100);
}