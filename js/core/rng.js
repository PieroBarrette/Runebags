// Seeded RNG so a game can be replayed move by move from its initial snapshot.
//
// The generator state is a single uint32 stored INSIDE the game state
// (`state.rngState`), which matters for two reasons: it survives the JSON
// round-trip through rooms.json and localStorage saves, and the AI's
// structuredClone-based search gets an isolated copy for free — its simulated
// draws never advance the real game's sequence.

// mulberry32 — small, fast, and good enough for shuffles and random picks.
export function nextRandom(state) {
  let z = (state.rngState = (state.rngState + 0x6d2b79f5) >>> 0);
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
}

export function createRngSeed() {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    return cryptoObj.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

// Convenience for the many call sites that need a plain `() => number`.
export function rngFor(state) {
  return () => nextRandom(state);
}
