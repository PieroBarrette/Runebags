const RUNE_CATALOG = [
  {
    id: "basic",
    name: "Basic",
    type: "basic",
    description: "No special effect.",
    icon: null,
    columnRule: "any",
    supportsLevels: false,
    maxLevel: 1,
    neutral: false,
  },
  {
    id: "neutral",
    name: "Neutral",
    type: "neutral",
    description: "Blocks both players and cannot create wins by itself.",
    icon: null,
    columnRule: "any",
    supportsLevels: false,
    maxLevel: 1,
    neutral: true,
  },
  {
    id: "inguz",
    name: "Inguz",
    type: "special",
    description: "Can only be played in the center column.",
    icon: "./assets/runes/inguz.svg",
    columnRule: "center-only",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "jera",
    name: "Jera",
    type: "special",
    description: "Can only be played in the leftmost or rightmost column.",
    icon: "./assets/runes/jera.svg",
    columnRule: "edge-only",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "algiz",
    name: "Algiz",
    type: "special",
    description: "Inserted at the bottom of a column, pushing runes upward.",
    icon: "./assets/runes/algiz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "ansuz",
    name: "Ansuz",
    type: "special",
    description: "Returns the rune directly beneath to its owner bag.",
    icon: "./assets/runes/ansuz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "berkana",
    name: "Berkana",
    type: "special",
    description: "If inside an owner winning line (4+), grants +1 bonus point once per round.",
    icon: "./assets/runes/berkana.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "ehwaz",
    name: "Ehwaz",
    type: "special",
    description: "Raises owner hand limit while present on the board.",
    icon: "./assets/runes/ehwaz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "gebo",
    name: "Gebo",
    type: "special",
    description: "Removes runes from the board for the round.",
    icon: "./assets/runes/gebo.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
    shopEffect: "When picked from shop, add a neutral rune to owner bag.",
  },
  {
    id: "hagalz",
    name: "Hagalz",
    type: "special",
    description: "Adjacent neutral runes can count toward your winning lines.",
    icon: "./assets/runes/hagalz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "isa",
    name: "Isa",
    type: "special",
    description: "Remains on the board between rounds.",
    icon: "./assets/runes/isa.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "mannaz",
    name: "Mannaz",
    type: "special",
    description: "Adds a neutral rune to opponent bag.",
    icon: "./assets/runes/mannaz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
    etherealAtLevels: [1],
  },
  {
    id: "perth",
    name: "Perth",
    type: "special",
    description: "Restricts opponent next turn to adjacent columns.",
    icon: "./assets/runes/perth.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "raido",
    name: "Raido",
    type: "special",
    description: "Grants an immediate extra turn.",
    icon: "./assets/runes/raido.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
    etherealAtLevels: [1],
    shopEffect: "When picked from shop, add a neutral rune to owner bag.",
  },
  {
    id: "sowelu",
    name: "Sowelu",
    type: "special",
    description: "Opponent loses random bag runes for the round.",
    icon: "./assets/runes/sowelu.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "teiwaz",
    name: "Teiwaz",
    type: "special",
    description: "Moves top runes between columns.",
    icon: "./assets/runes/teiwaz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
    shopEffect: "When picked from shop, add a neutral rune to owner bag.",
  },
  {
    id: "thurisa",
    name: "Thurisa",
    type: "special",
    description: "Adds extra neutral runes from supply to the board.",
    icon: "./assets/runes/thurisa.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "uruz",
    name: "Uruz",
    type: "special",
    description: "Opponent can no longer hide their hand while this rune is on board.",
    icon: "./assets/runes/uruz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
];

export { RUNE_CATALOG };

const runeById = Object.fromEntries(RUNE_CATALOG.map((rune) => [rune.id, rune]));

export const INITIAL_SHOP_COUNTS = {
  algiz: 1,
  ansuz: 1,
  berkana: 2,
  ehwaz: 2,
  gebo: 2,
  hagalz: 2,
  isa: 2,
  mannaz: 2,
  perth: 2,
  raido: 2,
  sowelu: 2,
  teiwaz: 2,
  thurisa: 2,
  uruz: 1,
};

export function getRuneById(runeId) {
  return runeById[runeId] || null;
}

let runeInstanceCounter = 1;

export function createRuneInstance(runeId, level = 1) {
  const rune = getRuneById(runeId);
  if (!rune) {
    return null;
  }

  return {
    ...rune,
    level,
    instanceId: `${runeId}-${runeInstanceCounter++}`,
  };
}

export function createStarterBag(allowedSpecialRuneIds = null) {
  const allowedSet = allowedSpecialRuneIds
    ? new Set(allowedSpecialRuneIds)
    : null;

  return [
    ...Array.from({ length: 6 }, () => createRuneInstance("basic", 1)),
    ...(allowedSet === null || allowedSet.has("inguz")
      ? Array.from({ length: 2 }, () => createRuneInstance("inguz", 1))
      : []),
    ...(allowedSet === null || allowedSet.has("jera")
      ? Array.from({ length: 2 }, () => createRuneInstance("jera", 1))
      : []),
  ];
}

export function getAllowedColumns(rune, totalColumns) {
  if (!rune || rune.columnRule === "any") {
    return Array.from({ length: totalColumns }, (_, i) => i);
  }

  if (rune.columnRule === "center-only") {
    return [Math.floor(totalColumns / 2)];
  }

  if (rune.columnRule === "edge-only") {
    return [0, totalColumns - 1];
  }

  return Array.from({ length: totalColumns }, (_, i) => i);
}
