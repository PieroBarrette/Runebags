export const ACHIEVEMENT_CATALOG = [
  {
    id: "first_game_finished",
    title: "First Chronicle",
    description: "Finish your first game.",
    metricKey: "gamesFinished",
    required: 1,
    rewardPoints: 30,
  },
  {
    id: "first_victory",
    title: "Runic Victor",
    description: "Win a game.",
    metricKey: "wins",
    required: 1,
    rewardPoints: 60,
  },
  {
    id: "captured_rune_purge",
    title: "Rune Purger",
    description: "Permanently remove a captured opponent rune in shop.",
    metricKey: "capturedRemovals",
    required: 1,
    rewardPoints: 75,
  },
  {
    id: "first_turn_round_win",
    title: "Lightning Setup",
    description: "Win a round on turn 1.",
    metricKey: "firstTurnRoundWins",
    required: 1,
    rewardPoints: 90,
  },
  {
    id: "full_tie_game",
    title: "Perfect Deadlock",
    description: "Finish a game in a full tie.",
    metricKey: "fullTies",
    required: 1,
    rewardPoints: 80,
  },
  {
    id: "veteran_10_games",
    title: "Seasoned Traveler",
    description: "Finish 10 games.",
    metricKey: "gamesFinished",
    required: 10,
    rewardPoints: 180,
  },
];

export function getAchievementById(id) {
  return ACHIEVEMENT_CATALOG.find((item) => item.id === id) || null;
}