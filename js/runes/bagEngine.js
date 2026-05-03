export function shuffle(array, random = Math.random) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

export function drawRunes(player, count, random = Math.random) {
  for (let i = 0; i < count; i += 1) {
    refillBagIfNeeded(player, random);
    if (player.bag.length === 0) {
      return;
    }
    player.hand.push(player.bag.pop());
  }
}

export function ensureHand(player, targetSize = 2, random = Math.random) {
  const missing = Math.max(0, targetSize - player.hand.length);
  drawRunes(player, missing, random);
}

export function refillBagIfNeeded(player, random = Math.random) {
  if (player.bag.length === 0 && player.discard.length > 0) {
    player.bag = shuffle([...player.discard], random);
    player.discard = [];
  }
}
