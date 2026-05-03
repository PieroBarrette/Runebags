export function beforeDrop(state, rune) {
  return {
    notes: [],
  };
}

export function afterDrop(state, rune, move) {
  return {
    placements: [],
    notes: [],
  };
}

export function endTurn(state, rune) {
  return {
    drawBonus: 0,
    notes: [],
  };
}
