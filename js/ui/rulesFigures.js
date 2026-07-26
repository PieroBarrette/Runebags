import { t } from "../i18n.js";

// Static mini-board diagrams for the Rules screen. Cells reuse the in-game
// .cell classes so the figures inherit the exact board visuals (pieces,
// neutral dashes, winning glow, forced-column tint) in both themes.
// Coordinates: r0 is the top row of the figure; every figure is 7 columns
// wide because .cell:nth-child(7n + 1) hardcodes the board width.
const FIGURE_COLUMNS = 7;

const FIGURES = [
  {
    id: "win-line",
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
  {
    id: "algiz-push",
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
  {
    id: "hagalz-line",
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
  {
    id: "nauthiz-float",
    rows: 3,
    cells: [
      { r: 0, c: 4, owner: 1, runeId: "nauthiz", ethereal: true },
      { r: 2, c: 1, owner: 2 },
      { r: 2, c: 2, owner: 1 },
    ],
    captionKey: "rules.fig.nauthiz",
  },
  {
    id: "perth-constraint",
    rows: 3,
    cells: [
      { r: 2, c: 3, owner: 2, runeId: "perth" },
      { r: 2, c: 1, owner: 1 },
      { r: 1, c: 3, owner: 1 },
    ],
    forcedColumns: [2, 4],
    captionKey: "rules.fig.perth",
  },
];

// Fills every <div class="rules-figure" data-figure="..."> anchor found in
// the document. Captions carry data-i18n, so applyTranslations() keeps them
// localized after a language switch without re-rendering the figures.
export function renderRulesFigures() {
  document.querySelectorAll(".rules-figure[data-figure]").forEach((anchor) => {
    const spec = FIGURES.find((figure) => figure.id === anchor.dataset.figure);
    if (!spec) {
      return;
    }
    anchor.innerHTML = "";
    anchor.appendChild(buildFigure(spec));
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
