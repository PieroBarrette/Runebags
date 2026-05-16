import { COSMETIC_CATALOG } from "../cosmetics/cosmeticCatalog.js";

const SCHEMA_VERSION = 1;

function getKey(profileSlot) {
  const slot = Number(profileSlot);
  const safe = Number.isInteger(slot) && slot >= 1 && slot <= 3 ? slot : 1;
  return `runebags-profile-${safe}-cosmetics-v1`;
}

function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    ownedIds: ["board-classic", "rune-classic", "sfx-classic"],
    selected: {
      board: "board-classic",
      rune: "rune-classic",
      sfx: "sfx-classic",
    },
    updatedAt: Date.now(),
  };
}

function sanitizeState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const ownedSet = new Set(Array.isArray(source.ownedIds) ? source.ownedIds : []);

  // Ensure baseline cosmetics are always available.
  ownedSet.add("board-classic");
  ownedSet.add("rune-classic");
  ownedSet.add("sfx-classic");

  const selected = source.selected && typeof source.selected === "object" ? source.selected : {};
  const selectedBoard = ownedSet.has(selected.board) ? selected.board : "board-classic";
  const selectedRune = ownedSet.has(selected.rune) ? selected.rune : "rune-classic";
  const selectedSfx = ownedSet.has(selected.sfx) ? selected.sfx : "sfx-classic";

  return {
    schemaVersion: SCHEMA_VERSION,
    ownedIds: [...ownedSet],
    selected: {
      board: selectedBoard,
      rune: selectedRune,
      sfx: selectedSfx,
    },
    updatedAt: Number(source.updatedAt) || Date.now(),
  };
}

export function loadCosmeticState(profileSlot) {
  const raw = localStorage.getItem(getKey(profileSlot));
  if (!raw) {
    const initial = createDefaultState();
    saveCosmeticState(profileSlot, initial);
    return initial;
  }

  try {
    const parsed = sanitizeState(JSON.parse(raw));
    saveCosmeticState(profileSlot, parsed);
    return parsed;
  } catch {
    const fallback = createDefaultState();
    saveCosmeticState(profileSlot, fallback);
    return fallback;
  }
}

export function saveCosmeticState(profileSlot, state) {
  const next = sanitizeState(state);
  next.updatedAt = Date.now();
  localStorage.setItem(getKey(profileSlot), JSON.stringify(next));
}

export function ownCosmetic(cosmeticState, cosmeticId) {
  const next = sanitizeState(cosmeticState);
  const ownedSet = new Set(next.ownedIds);
  ownedSet.add(cosmeticId);
  next.ownedIds = [...ownedSet];
  return next;
}

export function selectCosmetic(cosmeticState, cosmetic) {
  const next = sanitizeState(cosmeticState);
  const ownedSet = new Set(next.ownedIds);
  if (!ownedSet.has(cosmetic.id)) {
    return next;
  }

  if (cosmetic.type === "board") {
    next.selected.board = cosmetic.id;
  } else if (cosmetic.type === "rune") {
    next.selected.rune = cosmetic.id;
  } else if (cosmetic.type === "sfx") {
    next.selected.sfx = cosmetic.id;
  }

  return next;
}

export function isOwned(cosmeticState, cosmeticId) {
  const state = sanitizeState(cosmeticState);
  return new Set(state.ownedIds).has(cosmeticId);
}

export function canPurchase(cosmeticState, cosmeticId) {
  const cosmetic = COSMETIC_CATALOG.find((item) => item.id === cosmeticId);
  if (!cosmetic) {
    return false;
  }
  if (cosmetic.price <= 0) {
    return false;
  }
  return !isOwned(cosmeticState, cosmeticId);
}
