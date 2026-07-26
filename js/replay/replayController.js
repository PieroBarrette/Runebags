// Read-only replay viewer.
//
// A recording is an initial state snapshot plus the ordered list of accepted
// actions. Because the engine's RNG lives inside the state (see js/core/rng.js),
// re-applying those actions from the snapshot reproduces the game exactly.
//
// The board is drawn with renderBoard() directly rather than main.js's render():
// that function also drives audio, hand visibility, AI scheduling and the
// endgame overlay off module globals, none of which belong in a replay.
import { ENGINE_VERSION, getWinningLine, restoreState } from "../core/gameState.js";
import { applyRecordedAction } from "../core/onlineActions.js";
import { renderBoard } from "../ui/boardView.js";
import { fetchReplay } from "../net/apiClient.js";
import { t } from "../i18n.js";

const NO_TARGETS = { pending: false, mode: null, columns: [], cells: [] };
const NO_ANIMATION = { enabled: false };

export function createReplayController({ elements, onClose }) {
  let game = null;
  let step = 0;
  // Recomputing from the snapshot each time keeps the viewer stateless; a game
  // is only a few hundred cheap mutator calls, so scrubbing stays instant.
  let cache = new Map();

  function stateAtStep(index) {
    if (cache.has(index)) {
      return cache.get(index);
    }
    const state = restoreState(structuredClone(game.initialState));
    for (let i = 0; i < index; i += 1) {
      applyRecordedAction(state, game.actions[i]);
    }
    cache.set(index, state);
    return state;
  }

  function totalSteps() {
    return game ? game.actions.length : 0;
  }

  function render() {
    if (!game) {
      return;
    }

    const state = stateAtStep(step);
    renderBoard(state, { boardEl: elements.replayBoard }, NO_TARGETS, getWinningLine(state), [], NO_ANIMATION);

    elements.replayStepLabel.textContent = t("replay.step", { n: step, total: totalSteps() });
    elements.replayRange.max = String(totalSteps());
    elements.replayRange.value = String(step);
    elements.replayScore.textContent = t("replay.score", {
      p1: game.players[1].name || t("side.black"),
      s1: state.players[1].points,
      p2: game.players[2].name || t("side.white"),
      s2: state.players[2].points,
      round: state.roundNumber,
    });

    elements.replayFirstBtn.disabled = step === 0;
    elements.replayPrevBtn.disabled = step === 0;
    elements.replayNextBtn.disabled = step >= totalSteps();
    elements.replayLastBtn.disabled = step >= totalSteps();

    updateIntegrityBadge(state);
  }

  // A recording made by an older engine — or one whose final position doesn't
  // match what the server stored — is flagged rather than silently trusted.
  function updateIntegrityBadge(state) {
    let message = "";
    if (game.engineVersion !== ENGINE_VERSION) {
      message = t("replay.versionMismatch");
    } else if (step === totalSteps() && game.finalCheck) {
      const check = game.finalCheck;
      const matches = (check.winner ?? null) === (state.gameWinner ?? null)
        && check.p1 === state.players[1].points
        && check.p2 === state.players[2].points;
      if (!matches) {
        message = t("replay.desync");
      }
    }
    elements.replayWarning.textContent = message;
    elements.replayWarning.hidden = !message;
  }

  function goTo(index) {
    step = Math.min(Math.max(index, 0), totalSteps());
    render();
  }

  async function open(gameId) {
    elements.replayPanel.hidden = false;
    elements.replayMeta.textContent = t("replay.loading");
    elements.replayWarning.hidden = true;
    elements.replayBoard.innerHTML = "";

    const loaded = await fetchReplay(gameId);
    if (!loaded) {
      elements.replayMeta.textContent = t("replay.loadFailed");
      return;
    }

    game = loaded;
    cache = new Map();
    step = 0;

    const p1 = game.players[1].name || t("side.black");
    const p2 = game.players[2].name || t("side.white");
    const outcome = game.winner
      ? t("replay.winner", { player: game.winner === 1 ? p1 : p2 })
      : t("replay.draw");
    elements.replayMeta.textContent = `${p1} vs ${p2} — ${outcome}`;

    render();
  }

  function close() {
    elements.replayPanel.hidden = true;
    game = null;
    cache = new Map();
    if (typeof onClose === "function") {
      onClose();
    }
  }

  function bind() {
    elements.replayFirstBtn.addEventListener("click", () => goTo(0));
    elements.replayPrevBtn.addEventListener("click", () => goTo(step - 1));
    elements.replayNextBtn.addEventListener("click", () => goTo(step + 1));
    elements.replayLastBtn.addEventListener("click", () => goTo(totalSteps()));
    elements.replayRange.addEventListener("input", () => goTo(Number(elements.replayRange.value)));
    elements.replayBackBtn.addEventListener("click", close);
  }

  return { open, close, bind, refreshText: render };
}
