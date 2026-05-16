export const CAMPAIGN_NODES = [
  {
    id: "node-001",
    title: "Whispering Gate",
    type: "battle",
    description: "Entry skirmish on fractured stone.",
    rewardPoints: 35,
    nextIds: ["node-002", "node-003"],
  },
  {
    id: "node-002",
    title: "Shallow Crypt",
    type: "battle",
    description: "Tight lane duel among old runes.",
    rewardPoints: 40,
    nextIds: ["node-004"],
  },
  {
    id: "node-003",
    title: "Frost Span",
    type: "battle",
    description: "Wide board pressure and quick pivots.",
    rewardPoints: 40,
    nextIds: ["node-004"],
  },
  {
    id: "node-004",
    title: "The Binder",
    type: "boss",
    description: "Boss 1: lock pressure and constrained turns.",
    rewardPoints: 95,
    nextIds: ["node-005", "node-006"],
  },
  {
    id: "node-005",
    title: "Hollow Drift",
    type: "battle",
    description: "Unstable lines and delayed setups.",
    rewardPoints: 50,
    nextIds: ["node-007"],
  },
  {
    id: "node-006",
    title: "Cinder Path",
    type: "battle",
    description: "Aggressive tempo race toward center.",
    rewardPoints: 50,
    nextIds: ["node-007"],
  },
  {
    id: "node-007",
    title: "The Echo Seer",
    type: "boss",
    description: "Boss 2: repeated effects and mirror timing.",
    rewardPoints: 115,
    nextIds: ["node-008"],
  },
  {
    id: "node-008",
    title: "Ash Crown Approach",
    type: "battle",
    description: "Final approach through volatile stacks.",
    rewardPoints: 60,
    nextIds: ["node-009"],
  },
  {
    id: "node-009",
    title: "The Hollow Crown",
    type: "boss",
    description: "Boss 3: end-run pressure and attrition.",
    rewardPoints: 150,
    nextIds: [],
  },
];

export const CAMPAIGN_START_NODE_ID = "node-001";

export function getCampaignNodeById(id) {
  return CAMPAIGN_NODES.find((node) => node.id === id) || null;
}
