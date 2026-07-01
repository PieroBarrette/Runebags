// Generative ambient music engine — companion to sfxEngine.js.
// Everything is synthesized in real time (no audio files): a low A drone,
// slow modal pad chords, a wind-noise texture, and sparse plucked lyre notes.
// It shares the SFX engine's AudioContext and must NEVER create or resume it
// outside a user gesture (Chrome autoplay policy) — see maybeStart().

import { createTone, createFilteredNoise } from "./sfxEngine.js";

const DEFAULT_MUSIC_VOLUME = 0.5;
// The synth layers below are tuned quiet; scale the 0-1 slider to a usable
// ceiling that still sits behind the SFX (whose boost is 4).
const MUSIC_GAIN_BOOST = 2.6;

const SCHEDULER_INTERVAL_MS = 250;
const LOOKAHEAD_SECONDS = 1.5;
const START_FADE_SECONDS = 3.5;
const STOP_FADE_SECONDS = 0.6;

// Modal palette in A minor over a constant A2 drone. `pad` lists the chord
// voices (Hz), `next` the allowed transitions, `melodic` the pluck notes that
// are chord tones (drawn from the A-minor pentatonic pool so everything stays
// consonant against the drone).
const CHORDS = {
  am: {
    pad: [110, 164.81, 220, 261.63, 329.63],
    next: ["fmaj", "cmaj", "em", "gmaj"],
    melodic: [220, 261.63, 329.63, 440, 523.25, 659.25],
  },
  cmaj: {
    pad: [130.81, 196, 261.63, 329.63],
    next: ["gmaj", "fmaj", "am", "dm"],
    melodic: [261.63, 329.63, 392, 523.25, 659.25],
  },
  gmaj: {
    pad: [98, 146.83, 196, 246.94, 293.66],
    next: ["am", "em", "cmaj"],
    melodic: [293.66, 392, 587.33],
  },
  em: {
    pad: [164.81, 246.94, 329.63, 392],
    next: ["fmaj", "am", "dm"],
    melodic: [329.63, 392, 659.25],
  },
  fmaj: {
    pad: [174.61, 261.63, 349.23, 440],
    next: ["gmaj", "am", "cmaj"],
    melodic: [220, 261.63, 440, 523.25],
  },
  dm: {
    pad: [146.83, 220, 293.66, 349.23],
    next: ["em", "am", "gmaj"],
    melodic: [220, 293.66, 440, 587.33],
  },
};

// A-minor pentatonic across two octaves — the full pluck pool.
const PLUCK_POOL = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];

// menu = calm background behind the landing/settings screens; game = slightly
// fuller and more active. Game-over falls back to "menu" (handled by main.js).
const CONTEXT_PROFILES = {
  menu: { padLevel: 0.55, chordSeconds: [16, 24], pluckSeconds: [5, 11], phraseChance: 0.2 },
  game: { padLevel: 1, chordSeconds: [12, 18], pluckSeconds: [3.5, 8], phraseChance: 0.3 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function createMusicEngine({ getContext }) {
  let enabled = true;
  let volume = DEFAULT_MUSIC_VOLUME;
  let contextName = "menu";
  let session = null;

  function targetGain() {
    return Math.max(0.0001, volume * MUSIC_GAIN_BOOST);
  }

  function profile() {
    return CONTEXT_PROFILES[contextName] || CONTEXT_PROFILES.menu;
  }

  // --- persistent layers -------------------------------------------------

  function buildDrone(ctx, destination, keepAlive) {
    const droneBus = ctx.createGain();
    droneBus.gain.value = 1;
    droneBus.connect(destination);

    // Slow ±15% breathing on the whole drone layer.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.15;
    lfo.connect(lfoDepth);
    lfoDepth.connect(droneBus.gain);
    lfo.start();
    keepAlive.push(lfo);

    const voices = [
      { type: "sine", frequency: 110, detune: 0, gain: 0.05 },
      { type: "triangle", frequency: 110, detune: 3, gain: 0.02 },
      { type: "sine", frequency: 164.81, detune: -2, gain: 0.018 },
    ];
    for (const voice of voices) {
      const osc = ctx.createOscillator();
      osc.type = voice.type;
      osc.frequency.value = voice.frequency;
      osc.detune.value = voice.detune;
      const amp = ctx.createGain();
      amp.gain.value = voice.gain;
      osc.connect(amp);
      amp.connect(droneBus);
      osc.start();
      keepAlive.push(osc);
    }
  }

  function buildWind(ctx, destination, keepAlive) {
    const seconds = 4;
    const sampleCount = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.9;

    // Slow wander of the wind's center frequency (±120 Hz).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.03;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 120;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start();
    keepAlive.push(lfo);

    const amp = ctx.createGain();
    amp.gain.value = 0.014;

    source.connect(filter);
    filter.connect(amp);
    amp.connect(destination);
    source.start();
    keepAlive.push(source);
  }

  // --- scheduled layers ---------------------------------------------------

  function scheduleChord(active, start) {
    const ctx = active.ctx;
    const chord = CHORDS[active.chordName];
    const [minSeconds, maxSeconds] = profile().chordSeconds;
    const duration = randomBetween(minSeconds, maxSeconds);
    const attack = Math.min(4, duration * 0.3);
    const release = 5;

    // Occasionally thin the voicing so consecutive chords breathe differently.
    const voices = chord.pad.filter((_, index) => chord.pad.length <= 3 || index === 0 || Math.random() > 0.25);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(650, start);
    filter.frequency.linearRampToValueAtTime(randomBetween(800, 1000), start + duration * 0.6);
    filter.frequency.linearRampToValueAtTime(700, start + duration + release);
    filter.connect(active.padBus);

    for (const frequency of voices) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = frequency;
      osc.detune.value = randomBetween(-5, 5);

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.linearRampToValueAtTime(0.022, start + attack);
      amp.gain.setValueAtTime(0.022, start + duration);
      amp.gain.linearRampToValueAtTime(0.0001, start + duration + release);

      osc.connect(amp);
      amp.connect(filter);
      osc.start(start);
      osc.stop(start + duration + release + 0.1);
    }

    active.chordName = pick(chord.next);
    // The next chord's attack overlaps this one's release — a built-in crossfade.
    active.nextChordTime = start + duration;
  }

  function pluckNote(active, frequency, start) {
    createTone(active.ctx, active.pluckBus, {
      type: "triangle",
      frequency,
      start,
      duration: 1.9,
      gain: 0.05,
      attack: 0.005,
      release: 0.06,
    });
    createTone(active.ctx, active.pluckBus, {
      type: "sine",
      frequency: frequency * 2,
      start,
      duration: 1,
      gain: 0.014,
      attack: 0.003,
      release: 0.05,
    });
    createFilteredNoise(active.ctx, active.pluckBus, {
      start,
      duration: 0.03,
      gain: 0.006,
      lowpass: 3800,
    });
  }

  function schedulePluck(active, start) {
    const settings = profile();
    const chordTones = CHORDS[active.chordName].melodic;
    // Chord tones twice as likely as the rest of the pentatonic pool.
    const pool = Math.random() < 0.66 ? chordTones : PLUCK_POOL;
    const note = pick(pool);
    pluckNote(active, note, start);

    if (Math.random() < settings.phraseChance) {
      // A short walking phrase: 1-2 extra notes on pool neighbours.
      let index = PLUCK_POOL.indexOf(note);
      if (index === -1) {
        index = Math.floor(PLUCK_POOL.length / 2);
      }
      const extraNotes = 1 + (Math.random() < 0.4 ? 1 : 0);
      let at = start;
      for (let i = 0; i < extraNotes; i += 1) {
        index = clamp(index + (Math.random() < 0.5 ? -1 : 1), 0, PLUCK_POOL.length - 1);
        at += randomBetween(0.3, 0.55);
        pluckNote(active, PLUCK_POOL[index], at);
      }
    }

    const [minGap, maxGap] = settings.pluckSeconds;
    active.nextPluckTime = start + randomBetween(minGap, maxGap);
  }

  // --- session lifecycle ----------------------------------------------------

  function startSession(ctx) {
    const keepAlive = [];

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.linearRampToValueAtTime(targetGain(), ctx.currentTime + START_FADE_SECONDS);
    master.connect(ctx.destination);

    const padBus = ctx.createGain();
    padBus.gain.value = profile().padLevel;
    padBus.connect(master);

    const pluckBus = ctx.createGain();
    pluckBus.gain.value = 1;
    pluckBus.connect(master);

    buildDrone(ctx, master, keepAlive);
    buildWind(ctx, master, keepAlive);

    const active = {
      ctx,
      master,
      padBus,
      pluckBus,
      keepAlive,
      chordName: "am",
      nextChordTime: ctx.currentTime + 0.3,
      nextPluckTime: ctx.currentTime + 2.5,
      schedulerId: 0,
    };

    active.schedulerId = window.setInterval(() => {
      // A suspended context freezes currentTime; skip instead of piling events.
      if (ctx.state !== "running") {
        return;
      }
      const horizon = ctx.currentTime + LOOKAHEAD_SECONDS;
      while (active.nextChordTime < horizon) {
        scheduleChord(active, active.nextChordTime);
      }
      while (active.nextPluckTime < horizon) {
        schedulePluck(active, active.nextPluckTime);
      }
    }, SCHEDULER_INTERVAL_MS);

    session = active;
  }

  function stop() {
    const active = session;
    if (!active) {
      return;
    }
    session = null;
    window.clearInterval(active.schedulerId);

    const ctx = active.ctx;
    try {
      active.master.gain.cancelScheduledValues(ctx.currentTime);
      active.master.gain.setTargetAtTime(0.0001, ctx.currentTime, STOP_FADE_SECONDS / 4);
    } catch {
      // Context may already be closed; teardown below still runs.
    }

    window.setTimeout(() => {
      for (const node of active.keepAlive) {
        try {
          node.stop();
        } catch {
          // Already stopped.
        }
      }
      try {
        active.master.disconnect();
      } catch {
        // Already disconnected.
      }
    }, STOP_FADE_SECONDS * 1000 + 150);
  }

  // Gesture-safe start. Only a call flagged fromGesture may resume a suspended
  // context; all other callers silently wait for the next real user gesture.
  function maybeStart({ fromGesture = false } = {}) {
    if (!enabled || session || document.hidden) {
      return;
    }
    const ctx = typeof getContext === "function" ? getContext() : null;
    if (!ctx) {
      return;
    }
    if (ctx.state === "running") {
      startSession(ctx);
      return;
    }
    if (!fromGesture) {
      return;
    }
    ctx.resume()
      .then(() => {
        if (enabled && !session && !document.hidden && ctx.state === "running") {
          startSession(ctx);
        }
      })
      .catch(() => {});
  }

  // --- public API -----------------------------------------------------------

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    if (!enabled) {
      stop();
    }
  }

  function isEnabled() {
    return enabled;
  }

  function setVolume(nextVolume) {
    volume = clamp(Number(nextVolume), 0, 1);
    if (session) {
      const ctx = session.ctx;
      session.master.gain.cancelScheduledValues(ctx.currentTime);
      session.master.gain.setTargetAtTime(targetGain(), ctx.currentTime, 0.05);
    }
  }

  function getVolume() {
    return volume;
  }

  function setContext(nextContextName) {
    if (!CONTEXT_PROFILES[nextContextName] || contextName === nextContextName) {
      return;
    }
    contextName = nextContextName;
    if (session) {
      // Chord pacing/pluck density pick up the new profile on the next tick;
      // the pad level crossfades smoothly here.
      session.padBus.gain.setTargetAtTime(profile().padLevel, session.ctx.currentTime, 2);
    }
  }

  function isPlaying() {
    return Boolean(session);
  }

  function getContextName() {
    return contextName;
  }

  return {
    setEnabled,
    isEnabled,
    setVolume,
    getVolume,
    setContext,
    getContextName,
    maybeStart,
    stop,
    isPlaying,
  };
}
