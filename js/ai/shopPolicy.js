import {
  getShopActionAvailability,
  setShopMode,
  shopSelectBagRune,
  shopSelectOfferRune,
} from "../core/gameState.js";

const RUNE_WEIGHTS = {
  raido: 95,
  perth: 90,
  teiwaz: 88,
  gebo: 86,
  thurisa: 82,
  dagaz: 81,
  nauthiz: 80,
  algiz: 78,
  ansuz: 76,
  mannaz: 74,
  eihwaz: 73,
  fehu: 75,
  kenaz: 71,
  sowelu: 72,
  uruz: 68,
  ehwaz: 66,
  berkana: 62,
  hagalz: 61,
  isa: 60,
  inguz: 40,
  jera: 40,
  neutral: 20,
  basic: 10,
};

const NON_COMBINABLE = new Set(["basic", "inguz", "jera", "neutral", "berkana", "dagaz", "hagalz", "isa", "kenaz", "laguz", "wunjo", "nauthiz", "eihwaz"]);

export function runAiShopTurn(state, aiPlayerId) {
  if (state.phase !== "shop" || state.shop.currentPlayer !== aiPlayerId) {
    return;
  }

  const player = state.players[aiPlayerId];
  const data = state.shop.players[aiPlayerId];

  while (data.addedCount < 2 && data.offer.length > 0) {
    const bestOffer = chooseBestOffer(data.offer);
    if (!bestOffer) {
      break;
    }
    shopSelectOfferRune(state, bestOffer.instanceId);
  }

  const combinePair = findBestCombinePair(player.bag, aiPlayerId);
  if (combinePair) {
    setShopMode(state, "combine");
    shopSelectBagRune(state, combinePair[0].instanceId);
    shopSelectBagRune(state, combinePair[1].instanceId);
  }

  const availability = getShopActionAvailability(state);
  if (availability.removeVisible) {
    const removeCandidate = chooseRemoveCandidate(player.bag);
    if (removeCandidate) {
      setShopMode(state, "remove");
      shopSelectBagRune(state, removeCandidate.instanceId);
    }
  }
}

function findBestCombinePair(bag, aiPlayerId) {
  const byId = new Map();
  bag.forEach((rune) => {
    if (rune.level !== 1 || NON_COMBINABLE.has(rune.id)) {
      return;
    }
    const combineOwner = getRuneCombineOwner(rune, aiPlayerId);
    const key = `${rune.id}:${combineOwner}`;
    if (!byId.has(key)) {
      byId.set(key, []);
    }
    byId.get(key).push(rune);
  });

  let best = null;
  byId.forEach((runes, key) => {
    if (runes.length < 2) {
      return;
    }

    const [id] = key.split(":");
    const score = RUNE_WEIGHTS[id] || 0;
    if (!best || score > best.score) {
      best = { pair: [runes[0], runes[1]], score };
    }
  });

  return best ? best.pair : null;
}

function getRuneCombineOwner(rune, playerId) {
  if (rune.capturedOwner === 1 || rune.capturedOwner === 2) {
    return rune.capturedOwner;
  }
  return playerId;
}

function chooseRemoveCandidate(bag) {
  return (
    bag.find((rune) => (rune.capturedOwner === 1 || rune.capturedOwner === 2)) ||
    bag.find((rune) => rune.id === "inguz") ||
    bag.find((rune) => rune.id === "jera") ||
    bag.find((rune) => rune.id === "basic") ||
    bag.find((rune) => rune.id === "neutral") ||
    null
  );
}

function chooseBestOffer(offer) {
  if (offer.length === 0) {
    return null;
  }

  return [...offer].sort((a, b) => scoreRune(b) - scoreRune(a))[0];
}

function scoreRune(rune) {
  const base = RUNE_WEIGHTS[rune.id] || 0;
  return base + (rune.level >= 2 ? 30 : 0);
}
