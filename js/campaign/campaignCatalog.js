const CYCLE_COUNT = 5;

const STEP_DEFS = [
  { key: "combat", label: "Normal Combat", type: "combat", roundPointPool: 3, rewardPoints: 35 },
  { key: "shop-a", label: "Shop", type: "shop", roundPointPool: 0, rewardPoints: 0 },
  { key: "elite", label: "Elite Combat", type: "elite", roundPointPool: 5, rewardPoints: 65 },
  { key: "shop-b", label: "Shop", type: "shop", roundPointPool: 0, rewardPoints: 0 },
  { key: "boss", label: "Boss Combat", type: "boss", roundPointPool: 7, rewardPoints: 110 },
];

const INTER_CYCLE_SHOP_STEP = {
  key: "shop-c",
  label: "Inter-Cycle Shop",
  type: "shop",
  roundPointPool: 0,
  rewardPoints: 0,
};

function createStartShopNode() {
  return {
    id: "start-shop",
    title: "Opening Shop",
    type: "shop",
    cycle: 0,
    step: "start-shop",
    description: "Open your run by tuning your bag before cycle 1.",
    roundPointPool: 0,
    rewardPoints: 0,
    nextIds: ["cycle-01-combat"],
  };
}

function createCycleNode(cycle, stepIndex, stepDef, nextId) {
  const isFinalBoss = cycle === CYCLE_COUNT && stepDef.key === "boss";
  const type = isFinalBoss ? "final-boss" : stepDef.type;
  const id = `cycle-${String(cycle).padStart(2, "0")}-${stepDef.key}`;
  const title = isFinalBoss ? "Final Boss" : `Cycle ${cycle} ${stepDef.label}`;
  const pool = type === "final-boss" ? 10 : stepDef.roundPointPool;

  return {
    id,
    title,
    type,
    cycle,
    step: stepDef.key,
    stepIndex,
    description: isFinalBoss
      ? "Final showdown. Hard constraints and 10-point supply."
      : `${stepDef.label} for cycle ${cycle}.`,
    roundPointPool: pool,
    rewardPoints: type === "final-boss" ? 220 : stepDef.rewardPoints,
    nextIds: nextId ? [nextId] : [],
  };
}

function buildLinearNodes() {
  const nodes = [createStartShopNode()];

  for (let cycle = 1; cycle <= CYCLE_COUNT; cycle += 1) {
    const cycleSteps = cycle < CYCLE_COUNT
      ? [...STEP_DEFS, INTER_CYCLE_SHOP_STEP]
      : STEP_DEFS;

    for (let i = 0; i < cycleSteps.length; i += 1) {
      const stepDef = cycleSteps[i];
      const nextInCycle = cycleSteps[i + 1];
      const nextId = nextInCycle
        ? `cycle-${String(cycle).padStart(2, "0")}-${nextInCycle.key}`
        : cycle < CYCLE_COUNT
          ? `cycle-${String(cycle + 1).padStart(2, "0")}-${STEP_DEFS[0].key}`
          : null;

      nodes.push(createCycleNode(cycle, i, stepDef, nextId));
    }
  }

  return nodes;
}

export const CAMPAIGN_NODES = buildLinearNodes();
export const CAMPAIGN_START_NODE_ID = "start-shop";

export function getCampaignNodeById(id) {
  return CAMPAIGN_NODES.find((node) => node.id === id) || null;
}
