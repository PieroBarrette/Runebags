export function renderBoard(state, elements, pendingTargets, winningLine, forcedColumns = []) {
  const { boardEl } = elements;
  boardEl.innerHTML = "";

  const targetColumns = new Set(pendingTargets.columns || []);
  const targetCells = new Set((pendingTargets.cells || []).map((cell) => `${cell.row}:${cell.col}`));
  const winningCells = new Set((winningLine || []).map(([row, col]) => `${row}:${col}`));
  const forcedColumnSet = new Set(forcedColumns);

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      const value = state.board[row][col];
      const rune = state.boardRunes[row][col];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.dataset.row = String(row);
      button.dataset.column = String(col);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `Row ${row + 1} Column ${col + 1}`);

      if (value !== 0) {
        button.classList.add("has-piece");
      }

      if (winningCells.has(`${row}:${col}`)) {
        button.classList.add("winning-cell");
      }

      if (forcedColumnSet.has(col) && state.phase === "round" && !state.pendingAction) {
        button.classList.add("forced-column");
      }

      if (value === 1) {
        button.classList.add("p1");
      }

      if (value === 2) {
        button.classList.add("p2");
      }

      if (value === 3) {
        button.classList.add("neutral");
      }

      if (rune && rune.ethereal) {
        button.classList.add("ethereal-piece");
      }

      if (value !== 0 && rune && rune.id !== "basic" && rune.id !== "neutral") {
        const runeSymbol = document.createElement("img");
        runeSymbol.src = `./assets/runes/${rune.id}.svg`;
        runeSymbol.alt = rune.id;
        runeSymbol.className = "rune-symbol";
        if (rune.level >= 2) {
          runeSymbol.classList.add("level-2-rune");
        }
        if (rune.ethereal) {
          runeSymbol.classList.add("ethereal-rune");
        }
        button.appendChild(runeSymbol);
      }

      const isTargetColumn = targetColumns.has(col);
      const isTargetCell = targetCells.has(`${row}:${col}`);
      const isInteractiveTarget =
        pendingTargets.pending &&
        ((pendingTargets.mode === "columns" && isTargetColumn) ||
          (pendingTargets.mode === "cells" && isTargetCell));

      if (isInteractiveTarget) {
        button.classList.add("target-cell");
        button.disabled = false;
      } else if (state.phase !== "round") {
        button.disabled = true;
      } else if (state.pendingAction) {
        button.disabled = true;
      } else if (state.gameWinner || value !== 0) {
        button.disabled = true;
      }

      boardEl.appendChild(button);
    }
  }
}
