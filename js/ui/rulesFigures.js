import { t } from "../i18n.js";

// Static mini-board diagrams. Cells reuse the in-game .cell classes so the
// figures inherit the exact board visuals (pieces, neutral dashes, winning
// glow, forced-column tint) in both themes, and rune art comes from the same
// SVGs the board uses.
//
// Coordinates: r0 is the top row of the figure. Every figure is 7 columns wide
// because .cell:nth-child(7n + 1) hardcodes the board width.
const FIGURE_COLUMNS = 7;

// Keyed by rune id: the Rules screen appends these under each rune's line, and
// the home gallery's detail popup shows the same diagram.
const RUNE_FIGURES = {
  algiz: {
    rows: 3,
    cells: [
      { r: 0, c: 3, owner: 1 },
      { r: 1, c: 3, owner: 2 },
      { r: 2, c: 3, owner: 1, runeId: "algiz" },
      { r: 2, c: 2, owner: 2 },
      { r: 2, c: 4, owner: 1 },
    ],
    captionKey: "rules.fig.algiz",
  },
  ansuz: {
    rows: 3,
    cells: [
      { r: 1, c: 3, owner: 1, runeId: "ansuz" },
      { r: 2, c: 3, owner: 2, fading: true },
      { r: 2, c: 2, owner: 1 },
      { r: 2, c: 4, owner: 2 },
    ],
    captionKey: "rules.fig.ansuz",
  },
  berkana: {
    rows: 3,
    cells: [
      { r: 2, c: 1, owner: 1, win: true },
      { r: 2, c: 2, owner: 1, runeId: "berkana", win: true },
      { r: 2, c: 3, owner: 1, win: true },
      { r: 2, c: 4, owner: 1, win: true },
    ],
    captionKey: "rules.fig.berkana",
  },
  dagaz: {
    rows: 3,
    cells: [
      { r: 1, c: 3, owner: 1, runeId: "dagaz" },
      { r: 2, c: 3, owner: 1, runeId: "gebo" },
      { r: 2, c: 2, owner: 2 },
      { r: 2, c: 4, owner: 2 },
    ],
    captionKey: "rules.fig.dagaz",
  },
  eihwaz: {
    rows: 3,
    cells: [
      { r: 2, c: 3, owner: 1, runeId: "eihwaz", fading: true },
      { r: 2, c: 2, owner: 2 },
      { r: 2, c: 4, owner: 1 },
    ],
    captionKey: "rules.fig.eihwaz",
  },
  gebo: {
    rows: 3,
    cells: [
      { r: 1, c: 3, owner: 1, runeId: "gebo" },
      { r: 2, c: 3, owner: 2, fading: true },
      { r: 2, c: 2, owner: 1 },
      { r: 2, c: 4, owner: 2 },
    ],
    captionKey: "rules.fig.gebo",
  },
  hagalz: {
    rows: 3,
    cells: [
      { r: 2, c: 1, owner: 1, win: true },
      { r: 2, c: 2, owner: 1, win: true },
      { r: 2, c: 3, owner: 3, win: true },
      { r: 2, c: 4, owner: 1, runeId: "hagalz", win: true },
      { r: 1, c: 1, owner: 2 },
      { r: 2, c: 5, owner: 2 },
    ],
    captionKey: "rules.fig.hagalz",
  },
  inguz: {
    rows: 3,
    cells: [
      { r: 2, c: 3, owner: 1, runeId: "inguz" },
    ],
    forcedColumns: [3],
    captionKey: "rules.fig.inguz",
  },
  isa: {
    rows: 3,
    cells: [
      { r: 2, c: 3, owner: 1, runeId: "isa", win: true },
    ],
    captionKey: "rules.fig.isa",
  },
  jera: {
    rows: 3,
    cells: [
      { r: 2, c: 0, owner: 1, runeId: "jera" },
      { r: 2, c: 6, owner: 1, runeId: "jera" },
    ],
    forcedColumns: [0, 6],
    captionKey: "rules.fig.jera",
  },
  kenaz: {
    rows: 3,
    cells: [
      { r: 2, c: 1, owner: 1, runeId: "kenaz" },
      { r: 2, c: 3, owner: 1, runeId: "kenaz" },
      { r: 2, c: 5, owner: 2, fading: true },
    ],
    captionKey: "rules.fig.kenaz",
  },
  laguz: {
    rows: 3,
    cells: [
      { r: 2, c: 3, owner: 1, runeId: "laguz", win: true },
      { r: 2, c: 2, owner: 2 },
      { r: 2, c: 4, owner: 2 },
    ],
    captionKey: "rules.fig.laguz",
  },
  nauthiz: {
    rows: 3,
    cells: [
      { r: 0, c: 4, owner: 1, runeId: "nauthiz", ethereal: true },
      { r: 2, c: 1, owner: 2 },
      { r: 2, c: 2, owner: 1 },
    ],
    captionKey: "rules.fig.nauthiz",
  },
  odal: {
    rows: 3,
    cells: [
      { r: 0, c: 3, owner: 1, runeId: "odal", win: true },
      { r: 1, c: 3, owner: 2 },
      { r: 2, c: 3, owner: 1 },
    ],
    captionKey: "rules.fig.odal",
  },
  perth: {
    rows: 3,
    cells: [
      { r: 2, c: 3, owner: 2, runeId: "perth" },
      { r: 2, c: 1, owner: 1 },
      { r: 1, c: 3, owner: 1 },
    ],
    forcedColumns: [2, 4],
    captionKey: "rules.fig.perth",
  },
  teiwaz: {
    rows: 3,
    cells: [
      { r: 2, c: 2, owner: 2, fading: true },
      { r: 2, c: 3, owner: 1, runeId: "teiwaz" },
      { r: 2, c: 1, owner: 2 },
    ],
    forcedColumns: [1, 3],
    captionKey: "rules.fig.teiwaz",
  },
  thurisa: {
    rows: 3,
    cells: [
      { r: 2, c: 3, owner: 1, runeId: "thurisa" },
      { r: 2, c: 4, owner: 3 },
      { r: 2, c: 2, owner: 2 },
    ],
    captionKey: "rules.fig.thurisa",
  },
  wunjo: {
    rows: 3,
    cells: [
      { r: 2, c: 3, owner: 1, runeId: "wunjo" },
      { r: 2, c: 1, owner: 2 },
      { r: 2, c: 5, owner: 2 },
    ],
    captionKey: "rules.fig.wunjo",
  },
};

// Diagrams that illustrate a rule rather than a rune; placed by an explicit
// [data-figure] anchor in the Rules markup.
const NAMED_FIGURES = {
  "win-line": {
    rows: 3,
    cells: [
      { r: 2, c: 1, owner: 1, win: true },
      { r: 2, c: 2, owner: 1, win: true },
      { r: 2, c: 3, owner: 1, win: true },
      { r: 2, c: 4, owner: 1, win: true },
      { r: 2, c: 0, owner: 2 },
      { r: 1, c: 2, owner: 2 },
      { r: 1, c: 3, owner: 2 },
    ],
    captionKey: "rules.fig.winLine",
  },
};

export function hasRuneFigure(runeId) {
  return Boolean(RUNE_FIGURES[runeId]);
}

// Used by the home gallery's rune popup. Returns false when that rune has no
// diagram, so the caller can hide its container.
export function renderRuneFigure(container, runeId) {
  if (!container) {
    return false;
  }
  container.innerHTML = "";
  const spec = RUNE_FIGURES[runeId];
  if (!spec) {
    return false;
  }
  container.appendChild(buildFigure(spec));
  return true;
}

// Fills the Rules screen: one diagram under every rune line that has one, plus
// any explicit [data-figure] anchors. Deriving the rune from the line's icon
// keeps the markup free of per-rune wiring.
export function renderRulesFigures() {
  document.querySelectorAll(".rules-figure[data-figure]").forEach((anchor) => {
    const spec = NAMED_FIGURES[anchor.dataset.figure];
    anchor.innerHTML = "";
    if (spec) {
      anchor.appendChild(buildFigure(spec));
    }
  });

  document.querySelectorAll(".rules-rune-line").forEach((line) => {
    const src = line.querySelector("img")?.getAttribute("src") || "";
    const runeId = src.split("/").pop()?.replace(".svg", "") || "";
    const spec = RUNE_FIGURES[runeId];

    const existing = line.nextElementSibling;
    if (existing?.classList.contains("rules-rune-figure")) {
      existing.remove();
    }
    if (!spec) {
      return;
    }

    const holder = document.createElement("div");
    holder.className = "rules-figure rules-rune-figure";
    holder.appendChild(buildFigure(spec));
    line.insertAdjacentElement("afterend", holder);
  });
}

function buildFigure(spec) {
  const figure = document.createElement("figure");
  figure.className = "rules-figure-inner";

  const board = document.createElement("div");
  board.className = "board rules-mini-board";
  board.setAttribute("aria-hidden", "true");

  const byPos = new Map(spec.cells.map((cell) => [`${cell.r}:${cell.c}`, cell]));
  const forcedColumns = new Set(spec.forcedColumns || []);

  for (let row = 0; row < spec.rows; row += 1) {
    for (let col = 0; col < FIGURE_COLUMNS; col += 1) {
      const cell = document.createElement("span");
      cell.className = "cell";

      const piece = byPos.get(`${row}:${col}`);
      if (piece) {
        cell.classList.add("has-piece");
        if (piece.owner === 1) {
          cell.classList.add("p1");
        } else if (piece.owner === 2) {
          cell.classList.add("p2");
        } else if (piece.owner === 3) {
          cell.classList.add("neutral");
        }
        if (piece.ethereal) {
          cell.classList.add("ethereal-piece");
        }
        if (piece.win) {
          cell.classList.add("winning-cell");
        }
        // Marks the rune this effect is about to remove or move away.
        if (piece.fading) {
          cell.classList.add("rules-fading-cell");
        }
        if (piece.runeId) {
          const symbol = document.createElement("img");
          symbol.src = `./assets/runes/${piece.runeId}.svg`;
          symbol.alt = "";
          symbol.className = "rune-symbol";
          cell.appendChild(symbol);
        }
      }

      if (forcedColumns.has(col)) {
        cell.classList.add("forced-column");
      }

      board.appendChild(cell);
    }
  }

  const caption = document.createElement("figcaption");
  caption.className = "rules-figure-caption";
  caption.dataset.i18n = spec.captionKey;
  caption.textContent = t(spec.captionKey);

  figure.appendChild(board);
  figure.appendChild(caption);
  return figure;
}
