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
    maxLevel: 1,
  },
  {
    id: "jera",
    name: "Jera",
    type: "special",
    description: "Can only be played in the leftmost or rightmost column.",
    icon: "./assets/runes/jera.svg",
    columnRule: "edge-only",
    supportsLevels: true,
    maxLevel: 1,
  },
  {
    id: "kenaz",
    name: "Kenaz",
    type: "special",
    description: "One Kenaz does nothing. When your second Kenaz enters play, destroy 1 board rune permanently.",
    icon: "./assets/runes/kenaz.svg",
    columnRule: "any",
    supportsLevels: false,
    maxLevel: 1,
  },
  {
    id: "laguz",
    name: "Laguz",
    type: "special",
    description: "Cannot be moved or removed.",
    icon: "./assets/runes/laguz.svg",
    columnRule: "any",
    supportsLevels: false,
    maxLevel: 1,
  },
  {
    id: "wunjo",
    name: "Wunjo",
    type: "special",
    description: "If isolated from allied runes at round end, grants +1 add and +1 remove in next shop.",
    icon: "./assets/runes/wunjo.svg",
    columnRule: "any",
    supportsLevels: false,
    maxLevel: 1,
  },
  {
    id: "algiz",
    name: "Algiz",
    type: "special",
    description: "Inserted at the bottom of a column, pushing runes upward.",
    icon: "./assets/runes/algiz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 1,
    shopEffect: "When picked from shop, add a neutral rune to owner bag.",
  },
  {
    id: "ansuz",
    name: "Ansuz",
    type: "special",
    description: "Returns the rune directly beneath to its owner bag.",
    icon: "./assets/runes/ansuz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 1,
  },
  {
    id: "berkana",
    name: "Berkana",
    type: "special",
    description: "If inside an owner winning line, grants +1 bonus point once per round.",
    icon: "./assets/runes/berkana.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 1,
  },
  {
    id: "dagaz",
    name: "Dagaz",
    type: "special",
    description: "Copies the rune effect directly below it (except Kenaz). Whenever played, add 1 neutral rune to owner bag.",
    icon: "./assets/runes/dagaz.svg",
    columnRule: "any",
    supportsLevels: false,
    maxLevel: 1,
  },
  {
    id: "ehwaz",
    name: "Ehwaz",
    type: "special",
    description: "Raises its owner's hand limit to 3 while on the board, or 4 at level 2.",
    icon: "./assets/runes/ehwaz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "eihwaz",
    name: "Eihwaz",
    type: "special",
    description: "If discarded or removed for the round, its owner gains 1 point.",
    icon: "./assets/runes/eihwaz.svg",
    columnRule: "any",
    supportsLevels: false,
    maxLevel: 1,
  },
  {
    id: "fehu",
    name: "Fehu",
    type: "special",
    description: "Recovers 1 discarded rune to your bag, or 2 at level 2. Recovered runes can include opponent runes.",
    icon: "./assets/runes/fehu.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "gebo",
    name: "Gebo",
    type: "special",
    description: "Removes the rune beneath it from the board for the round, or an adjacent rune at level 2.",
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
    description: "One adjacent neutral rune can count towards your winning line.",
    icon: "./assets/runes/hagalz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 1,
  },
  {
    id: "isa",
    name: "Isa",
    type: "special",
    description: "Remains on the board between rounds.",
    icon: "./assets/runes/isa.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 1,
  },
  {
    id: "mannaz",
    name: "Mannaz",
    type: "special",
    description: "Adds 1 neutral rune to the opponent's bag, or 2 at level 2.",
    icon: "./assets/runes/mannaz.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "nauthiz",
    name: "Nauthiz",
    type: "special",
    description: "Floats on any free space. Ethereal.",
    icon: "./assets/runes/nauthiz.svg",
    columnRule: "any",
    supportsLevels: false,
    maxLevel: 1,
    etherealAtLevels: [1],
    shopEffect: "When picked from shop, add a neutral rune to owner bag.",
  },
  {
    id: "odal",
    name: "Odal",
    type: "special",
    description: "If played on the top row, gain 1 point without ending the round.",
    icon: "./assets/runes/odal.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 1,
  },
  {
    id: "perth",
    name: "Perth",
    type: "special",
    description: "Restricts the opponent's next turn to adjacent columns. At level 2, you choose which adjacent column.",
    icon: "./assets/runes/perth.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "raido",
    name: "Raido",
    type: "special",
    description: "Grants an immediate extra turn. Ethereal at level 1 only.",
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
    description: "The opponent loses 1 random bag rune for the round, or 2 at level 2.",
    icon: "./assets/runes/sowelu.svg",
    columnRule: "any",
    supportsLevels: true,
    maxLevel: 2,
  },
  {
    id: "teiwaz",
    name: "Teiwaz",
    type: "special",
    description: "Moves the top rune of a column to an adjacent column, or to any column at level 2.",
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
    description: "Places 1 extra neutral rune from the supply onto the board, or 2 at level 2.",
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
    maxLevel: 1,
  },
];

export { RUNE_CATALOG };

const runeById = Object.fromEntries(RUNE_CATALOG.map((rune) => [rune.id, rune]));

export const INITIAL_SHOP_COUNTS = {
  algiz: 1,
  ansuz: 1,
  berkana: 2,
  dagaz: 1,
  ehwaz: 2,
  eihwaz: 1,
  fehu: 2,
  gebo: 2,
  hagalz: 2,
  isa: 2,
  kenaz: 2,
  laguz: 2,
  mannaz: 2,
  nauthiz: 1,
  odal: 1,
  perth: 2,
  raido: 2,
  sowelu: 2,
  teiwaz: 2,
  thurisa: 2,
  uruz: 1,
  wunjo: 1,
};

export function getRuneById(runeId) {
  return runeById[runeId] || null;
}

let runeInstanceCounter = 1;

// `state` makes the id deterministic per game (`<rune>-g<n>`), which replays
// depend on: the module-level counter is shared by every room on the server,
// so concurrent games interleave it and it can never be reproduced. Callers
// that run before a state exists (starter bags, initial shop supply) may omit
// it — those ids are captured in the recorded initial snapshot anyway.
export function createRuneInstance(runeId, level = 1, state = null) {
  const rune = getRuneById(runeId);
  if (!rune) {
    return null;
  }

  const instanceId = state && Number.isInteger(state.runeSeq)
    ? `${runeId}-g${state.runeSeq++}`
    : `${runeId}-${runeInstanceCounter++}`;

  return {
    ...rune,
    level,
    instanceId,
  };
}

export function createStarterBag(allowedSpecialRuneIds = null) {
  return [
    ...Array.from({ length: 6 }, () => createRuneInstance("basic", 1)),
    ...Array.from({ length: 2 }, () => createRuneInstance("inguz", 1)),
    ...Array.from({ length: 2 }, () => createRuneInstance("jera", 1)),
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
