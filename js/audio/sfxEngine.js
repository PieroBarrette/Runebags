const DEFAULT_VOLUME = 0.18;
const MIN_VOLUME = 0;
const MAX_VOLUME = 1;

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

function createArcaneProfile(context, destination, eventName) {
  const t0 = now(context);

  if (eventName === "ui-click") {
    createTone(context, destination, {
      type: "sine",
      frequency: 560,
      endFrequency: 480,
      start: t0,
      duration: 0.085,
      gain: 0.03,
      attack: 0.003,
      release: 0.06,
    });
    return;
  }

  if (eventName === "move") {
    createTone(context, destination, {
      type: "triangle",
      frequency: 360,
      endFrequency: 260,
      start: t0,
      duration: 0.12,
      gain: 0.055,
      attack: 0.004,
      release: 0.08,
    });
    return;
  }

  if (eventName === "round-win") {
    createTone(context, destination, {
      type: "sine",
      frequency: 392,
      start: t0,
      duration: 0.12,
      gain: 0.045,
      release: 0.08,
    });
    createTone(context, destination, {
      type: "sine",
      frequency: 494,
      start: t0 + 0.08,
      duration: 0.14,
      gain: 0.047,
      release: 0.09,
    });
    createTone(context, destination, {
      type: "sine",
      frequency: 587,
      start: t0 + 0.16,
      duration: 0.16,
      gain: 0.05,
      release: 0.1,
    });
    return;
  }

  if (eventName === "round-draw") {
    createTone(context, destination, {
      type: "sine",
      frequency: 330,
      start: t0,
      duration: 0.11,
      gain: 0.032,
      release: 0.08,
    });
    createTone(context, destination, {
      type: "sine",
      frequency: 294,
      start: t0 + 0.08,
      duration: 0.14,
      gain: 0.032,
      release: 0.09,
    });
    return;
  }

  if (eventName === "game-win") {
    createTone(context, destination, {
      type: "triangle",
      frequency: 392,
      start: t0,
      duration: 0.15,
      gain: 0.05,
      release: 0.1,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 523,
      start: t0 + 0.12,
      duration: 0.18,
      gain: 0.053,
      release: 0.11,
    });
    createTone(context, destination, {
      type: "triangle",
      frequency: 659,
      start: t0 + 0.24,
      duration: 0.23,
      gain: 0.055,
      release: 0.13,
    });
  }
}

function createAnvilProfile(context, destination, eventName) {
  const t0 = now(context);

  if (eventName === "ui-click") {
    createTone(context, destination, {
      type: "square",
      frequency: 180,
      endFrequency: 140,
      start: t0,
      duration: 0.06,
      gain: 0.028,
      attack: 0.001,
      release: 0.045,
    });
    return;
  }

  if (eventName === "move") {
    createTone(context, destination, {
      type: "square",
      frequency: 145,
      endFrequency: 115,
      start: t0,
      duration: 0.11,
      gain: 0.07,
      attack: 0.001,
      release: 0.08,
    });
    createFilteredNoise(context, destination, {
      start: t0,
      duration: 0.06,
      gain: 0.014,
      lowpass: 1000,
    });
    return;
  }

  if (eventName === "round-win") {
    createTone(context, destination, {
      type: "square",
      frequency: 185,
      start: t0,
      duration: 0.12,
      gain: 0.05,
      release: 0.08,
    });
    createTone(context, destination, {
      type: "square",
      frequency: 220,
      start: t0 + 0.08,
      duration: 0.14,
      gain: 0.052,
      release: 0.09,
    });
    createTone(context, destination, {
      type: "square",
      frequency: 277,
      start: t0 + 0.17,
      duration: 0.16,
      gain: 0.054,
      release: 0.1,
    });
    return;
  }

  if (eventName === "round-draw") {
    createTone(context, destination, {
      type: "square",
      frequency: 165,
      start: t0,
      duration: 0.09,
      gain: 0.035,
      release: 0.07,
    });
    return;
  }

  if (eventName === "game-win") {
    createTone(context, destination, {
      type: "square",
      frequency: 196,
      start: t0,
      duration: 0.14,
      gain: 0.052,
      release: 0.1,
    });
    createTone(context, destination, {
      type: "square",
      frequency: 262,
      start: t0 + 0.13,
      duration: 0.18,
      gain: 0.054,
      release: 0.11,
    });
    createTone(context, destination, {
      type: "square",
      frequency: 330,
      start: t0 + 0.28,
      duration: 0.21,
      gain: 0.056,
      release: 0.12,
    });
  }
}

export function createSfxEngine() {
  let audioContext = null;
  let masterGain = null;
  let enabled = true;
  let volume = DEFAULT_VOLUME;
  let profile = "classic";
  let lastUiClickAt = 0;
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
      masterGain.gain.value = volume;
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
      masterGain.gain.setTargetAtTime(volume, masterGain.context.currentTime, 0.015);
    }
  }

  function getVolume() {
    return volume;
  }

  function setProfile(nextProfile) {
    const safe = String(nextProfile || "classic").toLowerCase();
    profile = safe === "arcane" || safe === "anvil" ? safe : "classic";
  }

  function getProfile() {
    return profile;
  }

  function playWithProfile(eventName) {
    if (profile === "arcane") {
      createArcaneProfile(audioContext, masterGain, eventName);
      return;
    }

    if (profile === "anvil") {
      createAnvilProfile(audioContext, masterGain, eventName);
      return;
    }

    createWoodFeltProfile(audioContext, masterGain, eventName);
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
      playWithProfile(eventName);
      return;
    }

    ensureRunningContext().then((running) => {
      if (!running || !enabled || !audioContext || !masterGain) {
        return;
      }
      playWithProfile(eventName);
    });
  }

  return {
    setEnabled,
    isEnabled,
    setVolume,
    getVolume,
    setProfile,
    getProfile,
    unlockFromGesture,
    play,
  };
}
