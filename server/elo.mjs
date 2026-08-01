// Standard Elo, with a larger K while a player is still finding their level.
//
// Everyone starts at 1200. A newcomer's first games move their rating fast so
// they reach roughly the right band quickly; once settled, ratings drift slowly
// enough that a single bad evening doesn't undo a season.
export const START_RATING = 1200;
export const PROVISIONAL_GAMES = 10;

const K_NEW = 32;
const K_SETTLED = 16;
const SETTLED_AFTER_GAMES = 20;

function kFactor(rankedGames) {
  return rankedGames < SETTLED_AFTER_GAMES ? K_NEW : K_SETTLED;
}

function expectedScore(rating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

// score: 1 win, 0.5 draw, 0 loss. Returns whole ratings — fractional Elo would
// only ever be shown rounded anyway.
export function nextRating(rating, opponentRating, score, rankedGames) {
  const delta = kFactor(rankedGames) * (score - expectedScore(rating, opponentRating));
  return Math.max(100, Math.round(rating + delta));
}

// winner: 1, 2, or null for a draw.
export function computeRatingChange(p1, p2, winner) {
  const p1Score = winner === null ? 0.5 : (winner === 1 ? 1 : 0);
  return {
    p1After: nextRating(p1.rating, p2.rating, p1Score, p1.rankedGames),
    p2After: nextRating(p2.rating, p1.rating, 1 - p1Score, p2.rankedGames),
  };
}

export function isProvisional(rankedGames) {
  return Number(rankedGames || 0) < PROVISIONAL_GAMES;
}
