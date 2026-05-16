import { createInitialState } from "../core/gameState.js";
import { createRuneInstance } from "../runes/runeCatalog.js";

const CAMPAIGN_ENCOUNTERS = {
  "node-001": { objective: "Win this opener with a horizontal connect.", recommendedColumn: 3, columns: { 0: [1], 1: [1], 2: [1], 5: [2] } },
  "node-002": { objective: "Secure a quick lane finish in the crypt.", recommendedColumn: 2, columns: { 2: [1, 1, 1], 4: [2, 2] } },
  "node-004": { objective: "Elite duel: convert pressure into a vertical finish.", recommendedColumn: 4, columns: { 2: [1, 1], 3: [2, 2, 1], 4: [2, 1] } },
  "node-006": { objective: "Single-round precision clash before the boss.", recommendedColumn: 3, columns: { 0: [1], 1: [1], 2: [1], 5: [2, 2] } },
  "node-008": { objective: "Defeat The Binder through sustained rounds.", recommendedColumn: 4, columns: { 0: [1], 1: [2, 1], 2: [2, 2, 1], 3: [2, 2, 2], 5: [1] } },
  "node-009": { objective: "Act II opens with a fast center race.", recommendedColumn: 3, columns: { 1: [1], 2: [1], 4: [1], 0: [2, 2] } },
  "node-010": { objective: "Elite vault clash: maintain a stable lane.", recommendedColumn: 5, columns: { 5: [1, 1], 4: [2, 2, 1], 3: [2, 1] } },
  "node-012": { objective: "Single-round drift duel.", recommendedColumn: 2, columns: { 0: [1], 1: [1], 3: [1], 5: [2] } },
  "node-013": { objective: "Defeat The Echo Seer over multiple rounds.", recommendedColumn: 1, columns: { 4: [1], 3: [2, 1], 2: [2, 2, 1], 1: [2, 2, 2], 6: [1] } },
  "node-015": { objective: "Final elite guard before the Crown.", recommendedColumn: 4, columns: { 2: [1, 1], 3: [2, 2, 1], 4: [2, 1], 5: [2] } },
  "node-017": { objective: "Defeat The Hollow Crown in a long attrition battle.", recommendedColumn: 2, columns: { 0: [1], 1: [2, 1], 2: [2, 2, 1], 3: [2, 2, 2], 4: [1], 6: [2] } },
};

export function getCampaignEncounterByNodeId(nodeId) {
  return CAMPAIGN_ENCOUNTERS[nodeId] || null;
}

function applyColumnStacks(state, columns) {
  for (const [colKey, stack] of Object.entries(columns || {})) {
    const col = Number(colKey);
    if (!Number.isInteger(col) || col < 0 || col >= state.columns || !Array.isArray(stack)) {
      continue;
    }

    stack.forEach((owner, depth) => {
      const row = state.rows - 1 - depth;
      if (row < 0) {
        return;
      }
      state.board[row][col] = owner === 2 ? 2 : owner === 3 ? 3 : 1;
    });
  }
}

function buildCampaignBag(loadoutRunes) {
  const bag = [];
  for (let i = 0; i < 4; i += 1) {
    const basic = createRuneInstance("basic", 1);
    if (basic) {
      bag.push(basic);
    }
  }

  (Array.isArray(loadoutRunes) ? loadoutRunes : []).forEach((entry) => {
    const rune = createRuneInstance(entry.runeId, entry.level);
    if (rune) {
      bag.push(rune);
    }
  });

  return bag;
}

export function buildCampaignEncounterState(node, campaignState, options = {}) {
  const encounter = getCampaignEncounterByNodeId(node?.id);
  const state = createInitialState(options);

  state.phase = "round";
  state.roundNumber = 1;
  state.turnNumber = 1;
  state.pointPoolRemaining = Math.max(1, Number(node?.roundPointPool) || 1);
  state.tieRemovedPoints = 0;
  state.winner = null;
  state.winningLine = null;
  state.gameWinner = null;
  state.gameWinnerReason = null;
  state.isDraw = false;
  state.pendingAction = null;
  state.roundAwayRunes = [];
  state.nextTurnConstraints = { 1: null, 2: null };

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      state.board[row][col] = 0;
      state.boardRunes[row][col] = null;
    }
  }

  applyColumnStacks(state, encounter?.columns || {});

  const activeRune = createRuneInstance("basic", 1);
  const opponentRune = createRuneInstance("basic", 1);

  state.players[1].hand = activeRune ? [activeRune] : [];
  state.players[1].bag = buildCampaignBag(campaignState?.loadoutRunes || []);
  state.players[1].discard = [];
  state.players[1].selectedRuneInstanceId = null;

  state.players[2].hand = opponentRune ? [opponentRune] : [];
  state.players[2].bag = [];
  state.players[2].discard = [];
  state.players[2].selectedRuneInstanceId = null;

  state.players[1].points = 0;
  state.players[2].points = 0;
  state.currentPlayer = 1;

  const objective = encounter?.objective || node?.description || `Clear encounter: ${node?.title || "Unknown node"}`;
  const recommendedColumn = Number.isInteger(encounter?.recommendedColumn) ? encounter.recommendedColumn : 3;

  state.log = [
    `Campaign encounter: ${node?.title || "Unknown node"}`,
    objective,
    `Round pool: ${state.pointPoolRemaining}`,
    `Hint: column ${recommendedColumn + 1}`,
  ];

  return {
    state,
    objective,
    recommendedColumn,
    currentPlayer: 1,
  };
}
