export function renderBoard(
  state,
  elements,
  pendingTargets,
  winningLine,
  forcedColumns = [],
  animationFrame = { enabled: false }
) {
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

      const animationKey = `${row}:${col}`;
      const fadeGhost = animationFrame.enabled
        ? animationFrame.ansuzGhostByCell?.get(animationKey) ||
          animationFrame.geboGhostByCell?.get(animationKey)
        : null;
      const teiwazLiftGhost = animationFrame.enabled
        ? animationFrame.teiwazLiftGhostByCell?.get(animationKey)
        : null;

      if (fadeGhost) {
        const ghost = document.createElement("span");
        ghost.className = "effect-fade-ghost";
        if (fadeGhost.owner === 1) {
          ghost.classList.add("p1");
        } else if (fadeGhost.owner === 2) {
          ghost.classList.add("p2");
        } else if (fadeGhost.owner === 3) {
          ghost.classList.add("neutral");
        }

        if (fadeGhost.id && fadeGhost.id !== "basic" && fadeGhost.id !== "neutral") {
          const ghostSymbol = document.createElement("img");
          ghostSymbol.src = `./assets/runes/${fadeGhost.id}.svg`;
          ghostSymbol.alt = fadeGhost.id;
          ghostSymbol.className = "effect-fade-ghost-symbol";
          ghost.appendChild(ghostSymbol);
        }

        button.appendChild(ghost);
      }

      if (teiwazLiftGhost) {
        const ghost = document.createElement("span");
        ghost.className = "effect-lift-ghost";
        if (teiwazLiftGhost.owner === 1) {
          ghost.classList.add("p1");
        } else if (teiwazLiftGhost.owner === 2) {
          ghost.classList.add("p2");
        } else if (teiwazLiftGhost.owner === 3) {
          ghost.classList.add("neutral");
        }

        if (teiwazLiftGhost.id && teiwazLiftGhost.id !== "basic" && teiwazLiftGhost.id !== "neutral") {
          const ghostSymbol = document.createElement("img");
          ghostSymbol.src = `./assets/runes/${teiwazLiftGhost.id}.svg`;
          ghostSymbol.alt = teiwazLiftGhost.id;
          ghostSymbol.className = "effect-lift-ghost-symbol";
          ghost.appendChild(ghostSymbol);
        }

        button.appendChild(ghost);
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

      if (animationFrame.enabled) {
        const isAnsuzStaged = animationFrame.ansuzAfterFadeDrop?.has(animationKey);
        const isGeboStagedDrop = animationFrame.geboAfterFadeDrop?.has(animationKey);
        const isGeboSourceFade = animationFrame.geboGhostByCell?.has(animationKey);
        const isTeiwazStagedDrop = animationFrame.teiwazAfterLiftDrop?.has(animationKey);
        const isThurisaDrop = animationFrame.thurisaDrops?.has(animationKey);
        if (animationFrame.placed?.has(animationKey)) {
          button.classList.add("anim-cell-arrive");
          if (isAnsuzStaged) {
            button.classList.add("anim-ansuz-drop");
          } else if (isThurisaDrop) {
            button.classList.add("anim-thurisa-drop");
          } else if (rune?.id === "nauthiz") {
            button.classList.add("anim-nauthiz-place");
          } else if (animationFrame.placedFromBottom?.has(animationKey)) {
            button.classList.add("anim-place-bottom");
          } else {
            button.classList.add("anim-place");
          }
        }

        if (isGeboStagedDrop || isGeboSourceFade) {
          button.classList.add("anim-gebo-drop");
        }

        if (isTeiwazStagedDrop) {
          button.classList.add("anim-teiwaz-drop");
        }

        if (animationFrame.shiftedUp?.has(animationKey)) {
          button.classList.add("anim-shift-up");
        }
      }

      if (isInteractiveTarget) {
        button.classList.add("target-cell");
        button.disabled = false;
      } else if (pendingTargets.pending) {
        button.disabled = true;
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
