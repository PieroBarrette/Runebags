// The post-game review panel: the player's accuracy, how their moves fell into
// the five bands, the turning point on a small board, and every move in a list
// that brings its position up when picked.
//
// The board is drawn with renderBoard() directly, as the replay viewer does:
// main.js's render() drives the live game, and none of that belongs here.
import { playTurn, selectRune } from "../core/gameState.js";
import { BANDS, summarizeReview } from "../ai/review.js";
import { cancelReview, runReview } from "../ai/reviewRunner.js";
import { getRuneById } from "../runes/runeCatalog.js";
import { renderBoard } from "../ui/boardView.js";
import { t, tp, runeName } from "../i18n.js";

const NO_TARGETS = { pending: false, mode: null, columns: [], cells: [] };
const NO_ANIMATION = { enabled: false };
// The marks chess players already read, for the three bands that cost something.
const BAND_MARKS = { excellent: "", good: "", inaccuracy: "?!", mistake: "?", blunder: "??" };

export function createReviewController({ elements, onPlayAgain, onClose }) {
  // record: { key, positions, undos } — the game being reviewed.
  let record = null;
  let results = null;
  let summary = null;
  let running = null;
  let failed = false;
  let selected = 0;

  function open(nextRecord) {
    if (!record || record.key !== nextRecord.key) {
      reset();
      record = nextRecord;
    }
    elements.reviewOverlay.hidden = false;
    if (results) {
      renderResults();
    } else {
      renderProgress(running?.done || 0, record.positions.length);
      if (!running) {
        start();
      }
    }
    elements.reviewBackBtn.focus();
  }

  function start() {
    const key = record.key;
    failed = false;
    running = { key, done: 0 };
    runReview(record.positions, (done, total) => {
      if (running?.key !== key) {
        return;
      }
      running.done = done;
      if (isOpen()) {
        renderProgress(done, total);
      }
    }).then((reviewed) => {
      if (running?.key !== key) {
        return;
      }
      running = null;
      if (!reviewed) {
        failed = true;
      } else {
        results = reviewed;
        summary = summarizeReview(results);
        selected = defaultSelection();
      }
      if (isOpen()) {
        renderResults();
      }
    });
  }

  // The turning point when there is one, otherwise the costliest move, so
  // the board always opens on the move most worth looking at.
  function defaultSelection() {
    if (summary.turningPoint) {
      return results.indexOf(summary.turningPoint);
    }
    let worst = 0;
    results.forEach((result, index) => {
      if (result.gap > results[worst].gap) {
        worst = index;
      }
    });
    return worst;
  }

  function isOpen() {
    return !elements.reviewOverlay.hidden;
  }

  function renderProgress(done, total) {
    elements.reviewProgress.hidden = false;
    elements.reviewBody.hidden = true;
    elements.reviewProgressText.textContent = t("review.progress", { done, total });
    elements.reviewProgressFill.style.width = `${total > 0 ? Math.round((100 * done) / total) : 0}%`;
  }

  function renderResults() {
    if (failed || !results || results.length === 0) {
      elements.reviewProgress.hidden = false;
      elements.reviewBody.hidden = true;
      elements.reviewProgressText.textContent = t(failed ? "review.failed" : "review.empty");
      elements.reviewProgressFill.style.width = "0%";
      return;
    }

    elements.reviewProgress.hidden = true;
    elements.reviewBody.hidden = false;
    elements.reviewAccuracy.textContent = summary.accuracy === null
      ? "–"
      : t("review.accuracyValue", { n: summary.accuracy });

    elements.reviewBands.replaceChildren(...BANDS.map(([band]) => {
      const item = document.createElement("li");
      item.className = `review-band band-${band}`;
      const name = document.createElement("span");
      name.className = "review-band-name";
      name.textContent = t(`review.band.${band}`);
      const count = document.createElement("span");
      count.className = "review-band-count";
      count.textContent = String(summary.counts[band]);
      item.append(markElement(band), name, count);
      return item;
    }));

    renderFocus();
    renderMoveList();

    const notes = [t("review.howJudged")];
    if (record.undos > 0) {
      notes.push(tp("review.undos", record.undos));
    }
    elements.reviewNote.textContent = notes.join(" ");
  }

  function renderFocus() {
    const result = results[selected];
    const position = record.positions[result.index];
    const isTurningPoint = result === summary.turningPoint;
    elements.reviewFocusTitle.textContent = t(isTurningPoint ? "review.turningPoint" : "review.moveAt", {
      round: result.round,
      turn: result.turn,
    });

    renderBoard(position.state, { boardEl: elements.reviewBoard }, NO_TARGETS, [], [], NO_ANIMATION);
    const showBest = !result.forced && !result.playedBest && result.bestMove;
    const playedCell = markLanding(position, result.move, ["review-played", `band-${result.band}`]);
    if (showBest) {
      markLanding(position, result.bestMove, ["review-best"], playedCell);
    }
    elements.reviewLegendPlayed.className = `review-legend-item played band-${result.band}`;
    elements.reviewLegendBest.hidden = !showBest;

    elements.reviewFocusPlayed.replaceChildren(
      markElement(result.band),
      document.createTextNode(` ${t("review.played", { move: describeMove(result.move) })} — ${t(`review.band.${result.band}`)}`),
    );
    elements.reviewFocusPlayed.className = `review-focus-move band-${result.band}`;
    elements.reviewFocusBest.hidden = !showBest;
    elements.reviewFocusBest.textContent = showBest ? t("review.best", { move: describeMove(result.bestMove) }) : "";
    elements.reviewFocusWhy.textContent = t(whyKey(result));
  }

  function renderMoveList() {
    const rounds = new Map();
    results.forEach((result, index) => {
      if (!rounds.has(result.round)) {
        rounds.set(result.round, []);
      }
      rounds.get(result.round).push({ result, index });
    });

    elements.reviewMoves.replaceChildren(...[...rounds].map(([round, entries]) => {
      const row = document.createElement("div");
      row.className = "review-round";
      const label = document.createElement("span");
      label.className = "review-round-label";
      label.textContent = t("review.round", { round });
      const moves = document.createElement("div");
      moves.className = "review-round-moves";
      entries.forEach(({ result, index }) => {
        moves.appendChild(moveChip(result, index));
      });
      row.append(label, moves);
      return row;
    }));
  }

  function moveChip(result, index) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `review-chip band-${result.band}${result.forced ? " forced" : ""}`;
    chip.dataset.resultIndex = String(index);
    chip.setAttribute("aria-pressed", String(index === selected));
    const band = result.forced ? t("review.forced") : t(`review.band.${result.band}`);
    chip.setAttribute("aria-label", t("review.chipLabel", { turn: result.turn, move: describeMove(result.move), band }));
    chip.title = chip.getAttribute("aria-label");

    if (result.move.runeId && result.move.runeId !== "basic" && result.move.runeId !== "neutral") {
      const icon = document.createElement("img");
      icon.src = `./assets/runes/${result.move.runeId}.svg`;
      icon.alt = "";
      icon.className = "review-chip-rune";
      chip.appendChild(icon);
    } else {
      const disc = document.createElement("span");
      disc.className = `review-chip-disc p${record.positions[result.index].playerId}`;
      chip.appendChild(disc);
    }
    if (BAND_MARKS[result.band]) {
      chip.appendChild(markElement(result.band));
    }
    return chip;
  }

  // Where a move's rune ends up, found by playing it on a copy: the engine
  // already knows how each rune falls, floats or pushes in from the bottom.
  function markLanding(position, move, classNames, takenCell = null) {
    const copy = structuredClone(position.state);
    copy.log = [];
    selectRune(copy, copy.currentPlayer, move.runeInstanceId);
    playTurn(copy, move.column, { row: move.row, col: move.col });

    let landing = null;
    for (let row = 0; row < copy.rows && !landing; row += 1) {
      for (let col = 0; col < copy.columns; col += 1) {
        if (copy.boardRunes[row][col]?.instanceId === move.runeInstanceId) {
          landing = { row, col, owner: copy.board[row][col], rune: copy.boardRunes[row][col] };
          break;
        }
      }
    }
    if (!landing) {
      return null;
    }

    const cell = elements.reviewBoard.querySelector(`.cell[data-row="${landing.row}"][data-column="${landing.col}"]`);
    if (!cell) {
      return null;
    }
    cell.classList.add(...classNames);
    const sameCell = takenCell && takenCell.row === landing.row && takenCell.col === landing.col;
    // A ghost of the rune, unless the cell is already taken in the position
    // shown (Algiz pushes the column up from below) or holds the other ghost.
    if (position.state.board[landing.row][landing.col] === 0 && !sameCell) {
      const ghost = document.createElement("span");
      ghost.className = `review-ghost owner-${landing.owner}`;
      if (landing.rune.id !== "basic" && landing.rune.id !== "neutral") {
        const symbol = document.createElement("img");
        symbol.src = `./assets/runes/${landing.rune.id}.svg`;
        symbol.alt = "";
        symbol.className = "review-ghost-symbol";
        ghost.appendChild(symbol);
      }
      cell.appendChild(ghost);
    }
    return landing;
  }

  function describeMove(move) {
    // The two plain pieces read as common nouns, the others by their name.
    const name = move.runeId === "basic" || move.runeId === "neutral"
      ? t(`review.${move.runeId}Rune`)
      : runeName(getRuneById(move.runeId) || { id: move.runeId, name: move.runeId });
    const rune = move.level >= 2 ? t("review.runeLevel2", { rune: name }) : name;
    if (move.runeId === "nauthiz") {
      return t("review.moveCell", { rune, column: move.column + 1, row: move.row + 1 });
    }
    return t("review.moveColumn", { rune, column: move.column + 1 });
  }

  function whyKey(result) {
    if (result.forced) {
      return "review.why.forced";
    }
    if (result.playedBest) {
      return "review.why.best";
    }
    if (result.band === "excellent") {
      return "review.why.nearlyBest";
    }
    return {
      "missed-win": "review.why.missedWin",
      "allowed-win": "review.why.allowedWin",
      risky: "review.why.risky",
    }[result.reason] || "review.why.position";
  }

  function markElement(band) {
    const mark = document.createElement("span");
    mark.className = "review-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = BAND_MARKS[band] || "";
    return mark;
  }

  function close() {
    elements.reviewOverlay.hidden = true;
    onClose?.();
  }

  // A new game: whatever was being reviewed no longer matters.
  function reset() {
    cancelReview();
    record = null;
    results = null;
    summary = null;
    running = null;
    failed = false;
    selected = 0;
    elements.reviewOverlay.hidden = true;
  }

  function refreshText() {
    if (!record || !isOpen()) {
      return;
    }
    if (results || failed) {
      renderResults();
    } else {
      renderProgress(running?.done || 0, record.positions.length);
    }
  }

  function bind() {
    elements.reviewMoves.addEventListener("click", (event) => {
      const chip = event.target.closest(".review-chip");
      if (!chip || !results) {
        return;
      }
      selected = Number(chip.dataset.resultIndex);
      renderFocus();
      elements.reviewMoves.querySelectorAll(".review-chip").forEach((other) => {
        other.setAttribute("aria-pressed", String(other === chip));
      });
    });
    elements.reviewBackBtn.addEventListener("click", close);
    elements.reviewAgainBtn.addEventListener("click", () => {
      elements.reviewOverlay.hidden = true;
      onPlayAgain?.();
    });
  }

  return { open, close, reset, bind, refreshText, isOpen };
}
