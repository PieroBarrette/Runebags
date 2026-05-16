export const COSMETIC_CATALOG = [
  {
    id: "board-classic",
    type: "board",
    title: "Classic Stone",
    description: "Balanced neutral board skin.",
    price: 0,
  },
  {
    id: "board-frost",
    type: "board",
    title: "Frost Veil",
    description: "Cool icy board glow.",
    price: 220,
  },
  {
    id: "board-ember",
    type: "board",
    title: "Ember Forge",
    description: "Warm high-contrast board accents.",
    price: 260,
  },
  {
    id: "rune-classic",
    type: "rune",
    title: "Classic Rune Chips",
    description: "Default rune card look.",
    price: 0,
  },
  {
    id: "rune-gilded",
    type: "rune",
    title: "Gilded Script",
    description: "Golden highlights around rune chips.",
    price: 180,
  },
  {
    id: "rune-obsidian",
    type: "rune",
    title: "Obsidian Ink",
    description: "Sharper dark rune engraving style.",
    price: 210,
  },
];

export function getCosmeticsByType(type) {
  return COSMETIC_CATALOG.filter((item) => item.type === type);
}

export function getCosmeticById(id) {
  return COSMETIC_CATALOG.find((item) => item.id === id) || null;
}
