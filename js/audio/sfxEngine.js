const DEFAULT_VOLUME = 0.18;
const MIN_VOLUME = 0;
const MAX_VOLUME = 1;
// The individual event gains below were tuned conservatively and stayed
// too quiet even at 100% volume (especially on phone speakers). Boost the
// master gain curve so the same 0-1 slider range reaches a louder ceiling.
const VOLUME_GAIN_BOOST = 4;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function now(context) {
  return context.currentTime;
}

function createTone(context, destination, options = {}) {
  const {
    type = "sine",
    frequency = 220,
    start = now(context),
    duration = 0.12,
    gain = 0.1,
    attack = 0.005,
    release = 0.08,
    endFrequency = null,
  } = options;

  const oscillator = context.createOscillator();
  const amp = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (typeof endFrequency === "number") {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), start + duration);
  }

  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(attack + 0.001, duration - release));

  oscillator.connect(amp);
  amp.connect(destination);

  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function createFilteredNoise(context, destination, options = {}) {
  const {
    start = now(context),
    duration = 0.08,
    gain = 0.04,
    attack = 0.002,
    release = 0.06,
    lowpass = 1600,
  } = options;

  const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
  }

  const source = context.createBufferSource();
  source.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(lowpass, start);

  const amp = context.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(attack + 0.001, duration - release));

  source.connect(filter);
  filter.connect(amp);
  amp.connect(destination);

  source.start(start);
  source.stop(start + duration + 0.03);
}

function createWoodFeltProfile(context, destination, eventName) {
  const t0 = now(context);

  if (eventName === "ui-click") {
    createTone(context, destination, {
      type: "triangle",
      frequency: 280,
      endFrequency: 220,
      start: t0,
      duration: 0.08,
      gain: 0.045,
      attack: 0.002,
      release: 0.05,
    });
    createFilteredNoise(context, destination, {
      start: t0,
      duration: 0.045,
      gain: 0.012,
      lowpass: 1200,
    });
    return;
  }

  if (eventName === "ui-hover") {
    createTone(context, destination, {
      type: "triangle",
      frequency: 660,
      start: t0,
      duration: 0.04,
      gain: 0.016,
      attack: 0.002,
      release: 0.03,
    });
    return;
  }

  // A point is scored — the rewarding "line of four" moment. A quick major triad up.
  if (eventName === "capture") {
    createTone(context, destination, {
      type: "triangle",
      frequency: 523.25,
      start: t0,
      duration: 0.12,
      gain: 0.05,
      release: 0.08,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 659.25,
      start: t0 + 0.06,
      duration: 0.13,
      gain: 0.05,
      release: 0.09,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 783.99,
      start: t0 + 0.12,
      duration: 0.18,
      gain: 0.055,
      release: 0.12,
    });
    createFilteredNoise(context, destination, {
      start: t0,
      duration: 0.05,
      gain: 0.01,
      lowpass: 3200,
    });
    return;
  }

  // A rune is destroyed (Gebo / Kenaz / Sowelu): a muffled thud sinking in pitch.
  if (eventName === "rune-destroy") {
    createTone(context, destination, {
      type: "sine",
      frequency: 200,
      endFrequency: 70,
      start: t0,
      duration: 0.26,
      gain: 0.09,
      attack: 0.002,
      release: 0.16,
    });
    createFilteredNoise(context, destination, {
      start: t0,
      duration: 0.18,
      gain: 0.03,
      lowpass: 720,
    });
    return;
  }

  // A rune is recalled to a bag (Ansuz / Fehu / Ethereal): an upward shimmer.
  if (eventName === "rune-return") {
    createTone(context, destination, {
      type: "sine",
      frequency: 240,
      endFrequency: 520,
      start: t0,
      duration: 0.2,
      gain: 0.05,
      attack: 0.004,
      release: 0.12,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 494,
      start: t0 + 0.08,
      duration: 0.14,
      gain: 0.03,
      release: 0.1,
    });
    return;
  }

  // A rune slides across the board (Teiwaz): a short swish.
  if (eventName === "rune-move") {
    createTone(context, destination, {
      type: "sine",
      frequency: 320,
      endFrequency: 430,
      start: t0,
      duration: 0.16,
      gain: 0.05,
      attack: 0.003,
      release: 0.1,
    });
    createFilteredNoise(context, destination, {
      start: t0,
      duration: 0.12,
      gain: 0.02,
      lowpass: 1900,
    });
    return;
  }

  // A rune is conjured onto the board (Thurisa / Mannaz / Dagaz): a soft sparkle.
  if (eventName === "rune-summon") {
    createTone(context, destination, {
      type: "triangle",
      frequency: 660,
      start: t0,
      duration: 0.1,
      gain: 0.035,
      release: 0.07,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 880,
      start: t0 + 0.05,
      duration: 0.12,
      gain: 0.03,
      release: 0.09,
    });
    createFilteredNoise(context, destination, {
      start: t0,
      duration: 0.04,
      gain: 0.008,
      lowpass: 4200,
    });
    return;
  }

  // Shop: add a rune to the bag — a light two-note lift.
  if (eventName === "shop-add") {
    createTone(context, destination, {
      type: "triangle",
      frequency: 440,
      start: t0,
      duration: 0.08,
      gain: 0.04,
      release: 0.06,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 660,
      start: t0 + 0.05,
      duration: 0.11,
      gain: 0.045,
      release: 0.08,
    });
    return;
  }

  // Shop: remove a rune — a soft descending discard.
  if (eventName === "shop-remove") {
    createTone(context, destination, {
      type: "sine",
      frequency: 340,
      endFrequency: 200,
      start: t0,
      duration: 0.14,
      gain: 0.04,
      release: 0.1,
    });
    createFilteredNoise(context, destination, {
      start: t0,
      duration: 0.06,
      gain: 0.012,
      lowpass: 1000,
    });
    return;
  }

  // Shop: combine two runes into a stronger one — an ascending power-up.
  if (eventName === "shop-combine") {
    createTone(context, destination, {
      type: "triangle",
      frequency: 392,
      start: t0,
      duration: 0.1,
      gain: 0.045,
      release: 0.07,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 523.25,
      start: t0 + 0.07,
      duration: 0.11,
      gain: 0.045,
      release: 0.08,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 659.25,
      start: t0 + 0.14,
      duration: 0.16,
      gain: 0.05,
      release: 0.11,
    });
    return;
  }

  if (eventName === "move") {
    createTone(context, destination, {
      type: "sine",
      frequency: 190,
      endFrequency: 140,
      start: t0,
      duration: 0.12,
      gain: 0.08,
      attack: 0.002,
      release: 0.08,
    });
    createFilteredNoise(context, destination, {
      start: t0,
      duration: 0.07,
      gain: 0.018,
      lowpass: 1100,
    });
    return;
  }

  if (eventName === "round-start") {
    createTone(context, destination, {
      type: "sine",
      frequency: 196,
      endFrequency: 262,
      start: t0,
      duration: 0.16,
      gain: 0.04,
      attack: 0.004,
      release: 0.11,
    });
    return;
  }

  if (eventName === "round-win") {
    createTone(context, destination, {
      type: "triangle",
      frequency: 220,
      endFrequency: 246,
      start: t0,
      duration: 0.13,
      gain: 0.05,
      release: 0.09,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 277,
      start: t0 + 0.075,
      duration: 0.15,
      gain: 0.05,
      release: 0.1,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 330,
      start: t0 + 0.15,
      duration: 0.17,
      gain: 0.05,
      release: 0.11,
    });
    return;
  }

  if (eventName === "round-draw") {
    createTone(context, destination, {
      type: "sine",
      frequency: 196,
      start: t0,
      duration: 0.11,
      gain: 0.04,
      release: 0.08,
    });
    createTone(context, destination, {
      type: "sine",
      frequency: 175,
      start: t0 + 0.09,
      duration: 0.14,
      gain: 0.04,
      release: 0.09,
    });
    return;
  }

  if (eventName === "game-win") {
    createTone(context, destination, {
      type: "triangle",
      frequency: 247,
      start: t0,
      duration: 0.16,
      gain: 0.055,
      release: 0.1,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 294,
      start: t0 + 0.11,
      duration: 0.18,
      gain: 0.055,
      release: 0.11,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 392,
      start: t0 + 0.22,
      duration: 0.24,
      gain: 0.06,
      release: 0.14,
    });
  }
}

export function createSfxEngine() {
  let audioContext = null;
  let masterGain = null;
  let enabled = true;
  let volume = DEFAULT_VOLUME;
  let lastUiClickAt = 0;
  let lastHoverAt = 0;
  let resumePromise = null;

  function ensureContext() {
    if (audioContext && masterGain) {
      return true;
    }

    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      return false;
    }

    try {
      // Older iOS Safari versions can reject constructor options.
      try {
        audioContext = new Ctor({ latencyHint: "interactive" });
      } catch {
        audioContext = new Ctor();
      }
      masterGain = audioContext.createGain();
      masterGain.gain.value = volume * VOLUME_GAIN_BOOST;
      masterGain.connect(audioContext.destination);
      return true;
    } catch {
      audioContext = null;
      masterGain = null;
      return false;
    }
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
  }

  function isEnabled() {
    return enabled;
  }

  function setVolume(nextVolume) {
    volume = clamp(Number(nextVolume), MIN_VOLUME, MAX_VOLUME);
    if (masterGain) {
      masterGain.gain.setTargetAtTime(volume * VOLUME_GAIN_BOOST, masterGain.context.currentTime, 0.015);
    }
  }

  function getVolume() {
    return volume;
  }

  function ensureRunningContext() {
    if (!ensureContext()) {
      return Promise.resolve(false);
    }

    if (audioContext.state === "running") {
      return Promise.resolve(true);
    }

    if (!resumePromise) {
      resumePromise = audioContext.resume()
        .then(() => audioContext.state === "running")
        .catch(() => false)
        .finally(() => {
          resumePromise = null;
        });
    }

    return resumePromise;
  }

  function unlockFromGesture() {
    ensureRunningContext();
    return Boolean(audioContext && audioContext.state === "running");
  }

  function play(eventName) {
    if (!enabled) {
      return;
    }

    // Hover cues fire on pointerover, which is NOT a user gesture. They must never
    // create or resume the AudioContext — doing so trips Chrome's autoplay policy
    // ("AudioContext was not allowed to start"). Play them only once audio is
    // already unlocked by a real gesture (click/keydown); otherwise stay silent.
    if (eventName === "ui-hover") {
      if (!audioContext || !masterGain || audioContext.state !== "running") {
        return;
      }
      const tHover = performance.now();
      if (tHover - lastHoverAt < 70) {
        return;
      }
      lastHoverAt = tHover;
      createWoodFeltProfile(audioContext, masterGain, eventName);
      return;
    }

    if (!ensureContext()) {
      return;
    }

    if (eventName === "ui-click") {
      const t = performance.now();
      if (t - lastUiClickAt < 45) {
        return;
      }
      lastUiClickAt = t;
    }

    if (audioContext.state === "running") {
      createWoodFeltProfile(audioContext, masterGain, eventName);
      return;
    }

    ensureRunningContext().then((running) => {
      if (!running || !enabled || !audioContext || !masterGain) {
        return;
      }
      createWoodFeltProfile(audioContext, masterGain, eventName);
    });
  }

  return {
    setEnabled,
    isEnabled,
    setVolume,
    getVolume,
    unlockFromGesture,
    play,
  };
}
