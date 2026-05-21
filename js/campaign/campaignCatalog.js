const ANTE_COUNT = 5;

const STEP_DEFS = [
  { key: "combat", label: "Normal Combat", type: "combat", roundPointPool: 3, rewardPoints: 35 },
  { key: "shop-a", label: "Shop", type: "shop", roundPointPool: 0, rewardPoints: 0 },
  { key: "elite", label: "Elite Combat", type: "elite", roundPointPool: 5, rewardPoints: 65 },
  { key: "shop-b", label: "Shop", type: "shop", roundPointPool: 0, rewardPoints: 0 },
  { key: "boss", label: "Boss Combat", type: "boss", roundPointPool: 7, rewardPoints: 110 },
];

const INTER_ANTE_SHOP_STEP = {
  key: "shop-c",
  label: "Inter-Ante Shop",
  type: "shop",
  roundPointPool: 0,
  rewardPoints: 0,
};

function createStartShopNode() {
  return {
    id: "start-shop",
    title: "Opening Shop",
    type: "shop",
    ante: 0,
    step: "start-shop",
    description: "Open your run by tuning your bag before ante 1.",
    roundPointPool: 0,
    rewardPoints: 0,
    nextIds: ["ante-01-combat"],
  };
}

function createAnteNode(ante, stepIndex, stepDef, nextId) {
  const isFinalBoss = ante === ANTE_COUNT && stepDef.key === "boss";
  const type = isFinalBoss ? "final-boss" : stepDef.type;
  const id = `ante-${String(ante).padStart(2, "0")}-${stepDef.key}`;
  const title = isFinalBoss ? "Final Boss" : `Ante ${ante} ${stepDef.label}`;
  const pool = type === "final-boss" ? 10 : stepDef.roundPointPool;

  return {
    id,
    title,
    type,
    ante,
    step: stepDef.key,
    stepIndex,
    description: isFinalBoss
      ? "Final showdown. Hard constraints and 10-point supply."
      : `${stepDef.label} for ante ${ante}.`,
    roundPointPool: pool,
    rewardPoints: type === "final-boss" ? 220 : stepDef.rewardPoints,
    nextIds: nextId ? [nextId] : [],
  };
}

function buildLinearNodes() {
  const nodes = [createStartShopNode()];

  for (let ante = 1; ante <= ANTE_COUNT; ante += 1) {
    const anteSteps = ante < ANTE_COUNT
      ? [...STEP_DEFS, INTER_ANTE_SHOP_STEP]
      : STEP_DEFS;

    for (let i = 0; i < anteSteps.length; i += 1) {
      const stepDef = anteSteps[i];
      const nextInAnte = anteSteps[i + 1];
      const nextId = nextInAnte
        ? `ante-${String(ante).padStart(2, "0")}-${nextInAnte.key}`
        : ante < ANTE_COUNT
          ? `ante-${String(ante + 1).padStart(2, "0")}-${STEP_DEFS[0].key}`
          : null;

      nodes.push(createAnteNode(ante, i, stepDef, nextId));
    }
  }

  return nodes;
}

export const CAMPAIGN_NODES = buildLinearNodes();
export const CAMPAIGN_START_NODE_ID = "start-shop";

export function getCampaignNodeById(id) {
  return CAMPAIGN_NODES.find((node) => node.id === id) || null;
}
