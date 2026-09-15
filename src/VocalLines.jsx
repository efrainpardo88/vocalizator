import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as Tone from 'tone';

import {
  PATTERN_LIBRARY,
  PATTERN_CATEGORIES,
  PLAYBACK_MODES,
  TRAVEL_DIRECTIONS,
  VOICE_TYPES,
  countBeats,
  toSteps,
} from './patterns.js';

import {
  BLACK_KEY_CLASSES,
  IN_TUNE_CENTS,
  centsBetween,
  detectPitch,
  formatDuration,
  formatNote,
  frequencyToMidi,
  midiToFrequency,
} from './pitch.js';

import {
  closestVoiceType,
  finalizeRangeTest,
  recordAttempt,
  startRangeTest,
} from './range.js';

const KEYBOARD_LOWEST = 36;
const KEYBOARD_HIGHEST = 84;
const STORAGE_KEY = 'vocal-lines:preferences';
const RANGE_STORAGE_KEY = 'vocal-lines:range-result';

/**
 * C4: a broadly comfortable starting note for most voices to anchor the
 * range test walk on. Assumed, not tuned against real singers yet.
 */
const RANGE_TEST_MIDDLE_MIDI = 60;
const RANGE_TEST_TONE_SECONDS = 1.1;
/** Lets the reference tone's release tail clear before checking for bleed. */
const RANGE_TEST_SILENCE_GAP_SECONDS = 0.35;
const RANGE_TEST_BLEED_CHECK_SECONDS = 0.3;
/** A lingering tone this close to the target is read as the piano, not the singer. */
const RANGE_TEST_BLEED_CENTS = 50;
const RANGE_TEST_LISTEN_SECONDS = 2.2;
/** Matches the practice tuner's polling interval. */
const RANGE_TEST_SAMPLE_INTERVAL_MS = 90;

/** Tone.js exposes these as getters in v15 and as properties in v14. */
const getTransport = () => (Tone.getTransport ? Tone.getTransport() : Tone.Transport);
const getDraw = () => (Tone.getDraw ? Tone.getDraw() : Tone.Draw);

/**
 * iOS Safari runs Web Audio in the "ambient" audio session, which the hardware
 * ring/silent switch mutes. "playback" is the category for audio the user asked
 * for and ignores that switch; "play-and-record" is the one iOS demands while a
 * microphone stream is open. Set this from a user gesture, next to Tone.start()
 * or the microphone toggle. Available from iOS 16.4, a no-op everywhere else.
 *
 * Verified on the deployed build: on iPhone with the microphone off nothing is
 * audible, and turning the microphone on makes playback audible but very quiet,
 * which is the documented behaviour of these two sessions. That the property
 * below corrects it is assumed, not verified on a device.
 */
const setAudioSession = (type) => {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch (error) {
    // Older WebKit exposes no settable audio session; the silent switch wins.
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Picks a representative pitch from a listening window: the median of the
 * settled second half, so the singer's reaction time at the start of the
 * window doesn't skew the reading. Returns -1 when nothing was detected,
 * the same "nothing usable" signal `detectPitch` itself returns.
 */
function pickSingerFrequency(readings) {
  if (readings.length === 0) return -1;
  const settled = readings.slice(Math.floor(readings.length / 2));
  const sorted = [...settled].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Parses the custom pattern field.
 * Each token is a semitone offset, optionally followed by `xN` to hold the
 * note for N beats: `0 2 4 5 7x5 5 4 2 0`.
 */
function parseCustomPattern(input) {
  const degrees = [];
  const beats = [];

  input.split(/[,\s]+/).filter(Boolean).forEach((token) => {
    const match = /^(-?\d+)(?:[xX*](\d+))?$/.exec(token);
    if (!match) return;

    const degree = parseInt(match[1], 10);
    const length = match[2] ? parseInt(match[2], 10) : 1;
    if (degree < -24 || degree > 24 || length < 1 || length > 16) return;

    degrees.push(degree);
    beats.push(length);
  });

  return { degrees, beats };
}

export default function VocalLines() {
  // Pattern selection
  const [useSolfege, setUseSolfege] = useState(false);
  const [category, setCategory] = useState('Basics');
  const [patternId, setPatternId] = useState('basic-five');
  const [customInput, setCustomInput] = useState('');
  const [useCustomPattern, setUseCustomPattern] = useState(false);

  // Range
  const [lowestRoot, setLowestRoot] = useState(48);
  const [highestNote, setHighestNote] = useState(67);
  const [limitByTopNote, setLimitByTopNote] = useState(true);

  // Playback
  const [tempo, setTempo] = useState(100);
  const [notesPerBeat, setNotesPerBeat] = useState(2);
  const [restBeats, setRestBeats] = useState(1);
  const [repeatsPerRoot, setRepeatsPerRoot] = useState(1);
  const [stepSize, setStepSize] = useState(1);
  const [direction, setDirection] = useState('up-and-down');
  const [playbackMode, setPlaybackMode] = useState('guide');
  const [volume, setVolume] = useState(-8);

  // Runtime
  const [playState, setPlayState] = useState('idle'); // idle | playing | paused
  const [cursor, setCursor] = useState(null); // { repeatIndex, stepIndex, root, midi, isYourTurn, totalRepeats }
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [microphoneError, setMicrophoneError] = useState('');
  const [detectedPitch, setDetectedPitch] = useState(null); // { midi, frequency }

  // Vocal range test
  const [rangeTestOpen, setRangeTestOpen] = useState(false);
  const [rangeTestStage, setRangeTestStage] = useState('idle'); // idle | sounding | listening | analyzing | bleed-warning | stopped | incomplete | result
  const [rangeTestState, setRangeTestState] = useState(null); // the range.js walk state
  const [rangeTestResult, setRangeTestResult] = useState(null); // { lowestMidi, highestMidi, spanOctaves, voiceType }
  const [rangeTestIncomplete, setRangeTestIncomplete] = useState(null); // 'down' | 'up' | 'both'
  const [rangeTestError, setRangeTestError] = useState('');
  const [rangeTestPianoWarning, setRangeTestPianoWarning] = useState(false);
  const [savedRangeResult, setSavedRangeResult] = useState(null); // { lowestMidi, highestMidi, voiceType } from localStorage

  const synthRef = useRef(null);
  const microphoneRef = useRef(null);

  const rangeMicRef = useRef(null);
  const rangeSynthRef = useRef(null);
  const rangeSessionIdRef = useRef(0);
  const rangeRetryCarryOverRef = useRef(null); // the bound already established, while retrying the other direction
  const pendingRetryRef = useRef(null); // { sessionId, run } — resumes after a piano-bleed warning

  /* ---------------------------- active pattern ---------------------------- */
  const customPattern = useMemo(() => parseCustomPattern(customInput), [customInput]);

  const pattern = useMemo(() => {
    if (useCustomPattern && customPattern.degrees.length > 0) {
      return {
        id: 'custom',
        category: 'Custom',
        name: 'Custom pattern',
        degrees: customPattern.degrees,
        beats: customPattern.beats,
        syllable: '—',
      };
    }
    return PATTERN_LIBRARY.find((item) => item.id === patternId) || PATTERN_LIBRARY[0];
  }, [useCustomPattern, customPattern, patternId]);

  const steps = useMemo(() => toSteps(pattern), [pattern]);
  const totalBeats = useMemo(() => countBeats(steps), [steps]);
  const highestOffset = Math.max(...pattern.degrees);
  const lowestOffset = Math.min(...pattern.degrees);

  /* ------------------------------- roots -------------------------------- */
  const roots = useMemo(() => {
    const ceiling = limitByTopNote ? highestNote - highestOffset : highestNote;

    const ascending = [];
    for (let root = lowestRoot; root <= ceiling; root += stepSize) ascending.push(root);
    if (ascending.length === 0) ascending.push(lowestRoot);

    let ordered = ascending;
    if (direction === 'down') {
      ordered = [...ascending].reverse();
    } else if (direction === 'up-and-down') {
      ordered = [...ascending, ...[...ascending].reverse().slice(1)];
    } else if (direction === 'down-and-up') {
      const descending = [...ascending].reverse();
      ordered = [...descending, ...ascending.slice(1)];
    }

    const repeated = [];
    ordered.forEach((root) => {
      for (let time = 0; time < repeatsPerRoot; time += 1) repeated.push(root);
    });
    return repeated;
  }, [lowestRoot, highestNote, stepSize, direction, limitByTopNote, highestOffset, repeatsPerRoot]);

  const beatDuration = 60 / tempo / notesPerBeat;

  const sessionLength = useMemo(() => {
    const patternLength = totalBeats * beatDuration;
    const repeatLength =
      playbackMode === 'guide'
        ? patternLength
        : playbackMode === 'echo'
          ? patternLength * 2
          : beatDuration * 1.5 + patternLength;
    return roots.length * (repeatLength + restBeats * (60 / tempo));
  }, [roots.length, totalBeats, beatDuration, playbackMode, restBeats, tempo]);

  /* -------------------------------- audio -------------------------------- */
  useEffect(() => {
    const reverb = new Tone.Reverb({ decay: 1.6, wet: 0.16 }).toDestination();
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.008, decay: 0.22, sustain: 0.28, release: 0.5 },
    }).connect(reverb);
    synth.volume.value = -8;
    synthRef.current = synth;

    return () => {
      try {
        getTransport().stop();
        getTransport().cancel(0);
        synth.dispose();
        reverb.dispose();
      } catch (error) {
        // The context may already be gone on unmount; nothing to clean up.
      }
    };
  }, []);

  useEffect(() => {
    if (synthRef.current) synthRef.current.volume.value = volume;
  }, [volume]);

  const stop = useCallback(() => {
    const transport = getTransport();
    transport.stop();
    transport.cancel(0);
    transport.seconds = 0;
    try {
      synthRef.current?.releaseAll();
    } catch (error) {
      // Nothing was sounding.
    }
    setPlayState('idle');
    setCursor(null);
  }, []);

  const play = useCallback(async () => {
    setAudioSession(microphoneOn ? 'play-and-record' : 'playback');
    await Tone.start(); // Browsers only allow audio after a user gesture.

    const transport = getTransport();
    const draw = getDraw();
    transport.stop();
    transport.cancel(0);
    transport.seconds = 0;

    const synth = synthRef.current;
    const totalRepeats = roots.length;

    // Where each step starts inside the pattern, in seconds.
    const stepOffsets = [];
    let elapsed = 0;
    steps.forEach((step) => {
      stepOffsets.push(elapsed);
      elapsed += step.beats * beatDuration;
    });
    const patternLength = elapsed;

    let timeline = 0.35; // A short lead-in before the first note.

    const highlight = (time, payload) => {
      transport.scheduleOnce((scheduledTime) => {
        draw.schedule(() => setCursor(payload), scheduledTime);
      }, time);
    };

    roots.forEach((root, repeatIndex) => {
      const notes = steps.map((step) => root + step.degree);

      if (playbackMode === 'reference') {
        // Sound the tonic only, then leave the pattern to the singer.
        transport.scheduleOnce((scheduledTime) => {
          synth.triggerAttackRelease(midiToFrequency(root), beatDuration * 1.2, scheduledTime);
        }, timeline);
        highlight(timeline, { repeatIndex, stepIndex: -1, root, midi: root, isYourTurn: false, totalRepeats });
        timeline += beatDuration * 1.5;

        notes.forEach((midi, stepIndex) => {
          highlight(timeline + stepOffsets[stepIndex], { repeatIndex, stepIndex, root, midi, isYourTurn: true, totalRepeats });
        });
        timeline += patternLength;
      } else {
        notes.forEach((midi, stepIndex) => {
          const time = timeline + stepOffsets[stepIndex];
          const duration = steps[stepIndex].beats * beatDuration;
          transport.scheduleOnce((scheduledTime) => {
            synth.triggerAttackRelease(midiToFrequency(midi), duration * 0.94, scheduledTime);
          }, time);
          highlight(time, { repeatIndex, stepIndex, root, midi, isYourTurn: false, totalRepeats });
        });
        timeline += patternLength;

        if (playbackMode === 'echo') {
          notes.forEach((midi, stepIndex) => {
            highlight(timeline + stepOffsets[stepIndex], { repeatIndex, stepIndex, root, midi, isYourTurn: true, totalRepeats });
          });
          timeline += patternLength;
        }
      }

      timeline += restBeats * (60 / tempo);
    });

    transport.scheduleOnce((scheduledTime) => {
      draw.schedule(() => stop(), scheduledTime);
    }, timeline + 0.2);

    transport.start();
    setPlayState('playing');
  }, [steps, roots, beatDuration, playbackMode, restBeats, tempo, stop, microphoneOn]);

  const pause = () => {
    getTransport().pause();
    try {
      synthRef.current?.releaseAll();
    } catch (error) {
      // Nothing was sounding.
    }
    setPlayState('paused');
  };

  const resume = () => {
    getTransport().start();
    setPlayState('playing');
  };

  /* ----------------------------- microphone ------------------------------ */
  const closeMicrophone = useCallback(() => {
    try {
      microphoneRef.current?.stream?.getTracks().forEach((track) => track.stop());
      clearInterval(microphoneRef.current?.timer);
      microphoneRef.current?.context?.close();
    } catch (error) {
      // Already closed.
    }
    microphoneRef.current = null;
  }, []);

  const toggleMicrophone = async () => {
    if (microphoneOn) {
      closeMicrophone();
      setAudioSession('playback');
      setMicrophoneOn(false);
      setDetectedPitch(null);
      return;
    }

    setMicrophoneError('');
    setAudioSession('play-and-record');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });

      const context = new (window.AudioContext || window.webkitAudioContext)();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);
      const readings = [];

      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buffer);
        const frequency = detectPitch(buffer, context.sampleRate);

        if (frequency < 0) {
          readings.length = 0;
          setDetectedPitch(null);
          return;
        }

        // A short median filter keeps octave glitches from jumping the needle.
        readings.push(frequency);
        if (readings.length > 3) readings.shift();
        const sorted = [...readings].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];

        setDetectedPitch({ midi: frequencyToMidi(median), frequency: median });
      }, 90);

      microphoneRef.current = { stream, context, timer };
      setMicrophoneOn(true);
    } catch (error) {
      setMicrophoneError('Could not open the microphone. Check the browser permissions.');
    }
  };

  useEffect(() => closeMicrophone, [closeMicrophone]);

  /* ---------------------------- preferences ------------------------------ */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const saved = JSON.parse(stored);
      if (saved.lowestRoot) setLowestRoot(saved.lowestRoot);
      if (saved.highestNote) setHighestNote(saved.highestNote);
      if (saved.tempo) setTempo(saved.tempo);
      if (saved.customInput) setCustomInput(saved.customInput);
      if (typeof saved.useSolfege === 'boolean') setUseSolfege(saved.useSolfege);
      if (saved.patternId) {
        setPatternId(saved.patternId);
        const found = PATTERN_LIBRARY.find((item) => item.id === saved.patternId);
        if (found) setCategory(found.category);
      }
    } catch (error) {
      // No storage available, or malformed data. Defaults are fine.
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ lowestRoot, highestNote, tempo, patternId, useSolfege, customInput }),
        );
      } catch (error) {
        // Storage disabled; preferences simply do not persist.
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [lowestRoot, highestNote, tempo, patternId, useSolfege, customInput]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RANGE_STORAGE_KEY);
      if (!stored) return;
      const saved = JSON.parse(stored);
      if (typeof saved.lowestMidi !== 'number' || typeof saved.highestMidi !== 'number') return;
      const voiceType = VOICE_TYPES.find((voice) => voice.id === saved.voiceTypeId) || null;
      setSavedRangeResult({ lowestMidi: saved.lowestMidi, highestMidi: saved.highestMidi, voiceType });
    } catch (error) {
      // No storage available, or malformed data. No saved result to show.
    }
  }, []);

  /* ------------------------------ range test ------------------------------ */
  const closeRangeMicrophone = useCallback(() => {
    try {
      rangeMicRef.current?.stream?.getTracks().forEach((track) => track.stop());
      rangeMicRef.current?.context?.close();
    } catch (error) {
      // Already closed.
    }
    rangeMicRef.current = null;
  }, []);

  useEffect(() => closeRangeMicrophone, [closeRangeMicrophone]);

  useEffect(() => () => {
    try {
      rangeSynthRef.current?.dispose();
    } catch (error) {
      // Already gone.
    }
  }, []);

  const openRangeMicrophone = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    rangeMicRef.current = { stream, context, analyser };
  };

  /** Collects detected frequencies for `durationMs`, discarding unusable readings. */
  const sampleRangeWindow = (durationMs) => new Promise((resolve) => {
    const mic = rangeMicRef.current;
    if (!mic) { resolve([]); return; }
    const buffer = new Float32Array(mic.analyser.fftSize);
    const readings = [];
    const timer = setInterval(() => {
      try {
        mic.analyser.getFloatTimeDomainData(buffer);
        const frequency = detectPitch(buffer, mic.context.sampleRate);
        if (frequency > 0) readings.push(frequency);
      } catch (error) {
        // Stopping the test mid-window closes the stream from under this timer.
      }
    }, RANGE_TEST_SAMPLE_INTERVAL_MS);
    setTimeout(() => {
      clearInterval(timer);
      resolve(readings);
    }, durationMs);
  });

  const persistRangeResult = (result) => {
    try {
      localStorage.setItem(
        RANGE_STORAGE_KEY,
        JSON.stringify({ lowestMidi: result.lowestMidi, highestMidi: result.highestMidi, voiceTypeId: result.voiceType.id }),
      );
    } catch (error) {
      // Storage disabled; the result simply is not remembered next time.
    }
    setSavedRangeResult({ lowestMidi: result.lowestMidi, highestMidi: result.highestMidi, voiceType: result.voiceType });
  };

  const applyMeasuredRange = (lowestMidi, highestMidi) => {
    setLowestRoot(lowestMidi);
    setHighestNote(highestMidi);
  };

  const closeRangeTestOverlay = () => {
    setRangeTestOpen(false);
    setRangeTestStage('idle');
  };

  /**
   * Runs one target note end to end: sound it, let the reference tone's tail
   * clear, confirm the microphone is no longer hearing the piano, then
   * sample a window with (as far as this can tell) only the singer in it.
   * Only that last window is ever handed to `recordAttempt` — never a window
   * that overlaps the reference tone.
   *
   * Returns the next walk state, `'bleed'` if the piano was still audible
   * (the caller should let the singer retry the same note), or `null` if the
   * test was interrupted mid-step.
   */
  const measureOneNote = async (state, sessionId) => {
    const targetMidi = state.nextTargetMidi;
    setRangeTestStage('sounding');
    rangeSynthRef.current.triggerAttackRelease(midiToFrequency(targetMidi), RANGE_TEST_TONE_SECONDS);

    await wait((RANGE_TEST_TONE_SECONDS + RANGE_TEST_SILENCE_GAP_SECONDS) * 1000);
    if (rangeSessionIdRef.current !== sessionId) return null;

    const bleedReadings = await sampleRangeWindow(RANGE_TEST_BLEED_CHECK_SECONDS * 1000);
    if (rangeSessionIdRef.current !== sessionId) return null;
    const isBleeding = bleedReadings.some(
      (frequency) => Math.abs(centsBetween(frequencyToMidi(frequency), targetMidi)) <= RANGE_TEST_BLEED_CENTS,
    );
    if (isBleeding) {
      setRangeTestPianoWarning(true);
      setRangeTestStage('bleed-warning');
      return 'bleed';
    }
    setRangeTestPianoWarning(false);

    setRangeTestStage('listening');
    const readings = await sampleRangeWindow(RANGE_TEST_LISTEN_SECONDS * 1000);
    if (rangeSessionIdRef.current !== sessionId) return null;

    setRangeTestStage('analyzing');
    return recordAttempt(state, pickSingerFrequency(readings));
  };

  const finishRangeTest = (finalState) => {
    closeRangeMicrophone();
    setAudioSession(microphoneOn ? 'play-and-record' : 'playback');

    const result = finalizeRangeTest(finalState);
    if (result) {
      setRangeTestResult(result);
      setRangeTestIncomplete(null);
      setRangeTestStage('result');
      persistRangeResult(result);
      return;
    }

    // One or both boundaries were never established. Remember whichever was,
    // so a directional retry can carry it forward instead of re-measuring it.
    rangeRetryCarryOverRef.current = {
      lowestMidi: finalState.lowestUsableMidi,
      highestMidi: finalState.highestUsableMidi,
    };
    if (finalState.lowestUsableMidi === null && finalState.highestUsableMidi === null) {
      setRangeTestIncomplete('both');
    } else {
      setRangeTestIncomplete(finalState.lowestUsableMidi === null ? 'down' : 'up');
    }
    setRangeTestStage('incomplete');
  };

  const runMainWalk = async (initialState, sessionId) => {
    let state = initialState;
    while (state.status !== 'complete') {
      const result = await measureOneNote(state, sessionId);
      if (rangeSessionIdRef.current !== sessionId || result === null) return;
      if (result === 'bleed') {
        pendingRetryRef.current = { sessionId, run: () => runMainWalk(state, sessionId) };
        return;
      }
      state = result;
      setRangeTestState(state);
    }
    finishRangeTest(state);
  };

  /** Re-walks only `direction`, carrying the other, already-established boundary forward. */
  const runDirectionRetry = async (direction, initialState, sessionId) => {
    let state = initialState;
    const isResolved = () => (direction === 'down' ? state.phase === 'up' : state.status === 'complete');

    while (!isResolved()) {
      const result = await measureOneNote(state, sessionId);
      if (rangeSessionIdRef.current !== sessionId || result === null) return;
      if (result === 'bleed') {
        pendingRetryRef.current = { sessionId, run: () => runDirectionRetry(direction, state, sessionId) };
        return;
      }
      state = result;
      setRangeTestState(state);
    }

    closeRangeMicrophone();
    setAudioSession(microphoneOn ? 'play-and-record' : 'playback');

    const carryOver = rangeRetryCarryOverRef.current || {};
    const lowestMidi = direction === 'down' ? state.lowestUsableMidi : carryOver.lowestMidi;
    const highestMidi = direction === 'up' ? state.highestUsableMidi : carryOver.highestMidi;

    if (lowestMidi !== null && highestMidi !== null) {
      const result = {
        lowestMidi,
        highestMidi,
        spanOctaves: (highestMidi - lowestMidi) / 12,
        voiceType: closestVoiceType(lowestMidi, highestMidi),
      };
      setRangeTestResult(result);
      setRangeTestIncomplete(null);
      setRangeTestStage('result');
      persistRangeResult(result);
    } else {
      rangeRetryCarryOverRef.current = { lowestMidi, highestMidi };
      setRangeTestIncomplete(lowestMidi === null ? 'down' : 'up');
      setRangeTestStage('incomplete');
    }
  };

  const retryAfterBleedWarning = () => {
    const pending = pendingRetryRef.current;
    if (!pending || rangeSessionIdRef.current !== pending.sessionId) return;
    pendingRetryRef.current = null;
    setRangeTestPianoWarning(false);
    pending.run();
  };

  const startVocalRangeTest = async () => {
    setRangeTestError('');
    setRangeTestResult(null);
    setRangeTestIncomplete(null);
    setRangeTestPianoWarning(false);
    pendingRetryRef.current = null;
    rangeRetryCarryOverRef.current = null;

    // Tone.start() must be the first await in this handler, not after the
    // microphone permission prompt: iOS Safari only credits the click's user
    // gesture to whatever runs before the gesture's window lapses, and an
    // awaited permission dialog can outlast it.
    setAudioSession('play-and-record');
    await Tone.start();

    if (!rangeSynthRef.current) {
      rangeSynthRef.current = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.08, sustain: 0.7, release: 0.12 },
      }).toDestination();
    }

    try {
      await openRangeMicrophone();
    } catch (error) {
      setRangeTestError('Could not open the microphone. Check the browser permissions.');
      return;
    }

    const sessionId = rangeSessionIdRef.current + 1;
    rangeSessionIdRef.current = sessionId;

    const initialState = startRangeTest(RANGE_TEST_MIDDLE_MIDI);
    setRangeTestState(initialState);
    setRangeTestStage('sounding');
    setRangeTestOpen(true);
    runMainWalk(initialState, sessionId);
  };

  const retryRangeDirection = async (direction) => {
    setRangeTestError('');
    pendingRetryRef.current = null;

    // See startVocalRangeTest: Tone.start() goes first, before the microphone prompt.
    setAudioSession('play-and-record');
    await Tone.start();

    try {
      await openRangeMicrophone();
    } catch (error) {
      setRangeTestError('Could not open the microphone. Check the browser permissions.');
      return;
    }

    const sessionId = rangeSessionIdRef.current + 1;
    rangeSessionIdRef.current = sessionId;

    const state = startRangeTest(RANGE_TEST_MIDDLE_MIDI, direction);
    setRangeTestState(state);
    setRangeTestStage('sounding');
    runDirectionRetry(direction, state, sessionId);
  };

  const stopRangeTest = () => {
    rangeSessionIdRef.current += 1; // invalidates any step still in flight
    pendingRetryRef.current = null;
    closeRangeMicrophone();
    setAudioSession(microphoneOn ? 'play-and-record' : 'playback');
    setRangeTestPianoWarning(false);
    setRangeTestStage('stopped');
  };

  /* ------------------------------ derived UI ----------------------------- */
  const activeRoot = cursor ? cursor.root : roots[0];
  const activeNotes = steps.map((step) => activeRoot + step.degree);
  const offsetSpan = highestOffset - lowestOffset || 1;

  const centsOff =
    cursor && detectedPitch && cursor.stepIndex >= 0
      ? centsBetween(detectedPitch.midi, cursor.midi)
      : null;
  const isInTune = centsOff !== null && Math.abs(centsOff) < IN_TUNE_CENTS;

  // Bar geometry for the contour: width follows how long each note lasts.
  const bars = useMemo(() => {
    const output = [];
    let consumed = 0;
    steps.forEach((step) => {
      output.push({ x: (consumed / totalBeats) * 100, width: (step.beats / totalBeats) * 100 });
      consumed += step.beats;
    });
    return output;
  }, [steps, totalBeats]);

  const visiblePatterns = PATTERN_LIBRARY.filter((item) => item.category === category);
  const activeMode = PLAYBACK_MODES.find((item) => item.id === playbackMode);

  const applyVoiceType = (voice) => {
    setLowestRoot(voice.lowest);
    setHighestNote(voice.highest);
  };

  return (
    <div className="app">
      <div className="shell">
        <header className="masthead">
          <div>
            <div className="wordmark">Vocal<span>Lines</span></div>
            <p className="tagline">
              Pick a pattern, mark your range, and sing it back. The piano moves up a semitone on its own.
            </p>
          </div>
          <button className="chip" aria-pressed={useSolfege} onClick={() => setUseSolfege((value) => !value)}>
            {useSolfege ? 'Do Re Mi' : 'C D E'}
          </button>
        </header>

        {/* ------------------------------ stage ------------------------------ */}
        <section className="stage">
          <div className="readout">
            <div
              className={`root-note ${playState === 'idle' ? 'is-idle' : ''} ${cursor?.isYourTurn ? 'is-your-turn' : ''}`}
            >
              {formatNote(activeRoot, useSolfege)}
            </div>

            <div className="caption">
              {playState === 'idle'
                ? `Starting tonic · ${pattern.name}`
                : cursor?.isYourTurn
                  ? `Your turn · sing ${formatNote(cursor.midi, useSolfege)}`
                  : `Playing ${cursor ? formatNote(cursor.midi, useSolfege) : ''} · pass ${(cursor?.repeatIndex ?? 0) + 1} of ${roots.length}`}
            </div>

            <svg className="contour" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
              {steps.map((step, index) => {
                const height = 4 + ((step.degree - lowestOffset) / offsetSpan) * 32;
                const isActive = cursor && cursor.stepIndex === index;
                const gap = Math.min(bars[index].width * 0.2, 0.7);
                return (
                  <rect
                    key={index}
                    x={bars[index].x + gap}
                    y={40 - height}
                    width={Math.max(0.4, bars[index].width - gap * 2)}
                    height={height}
                    rx={0.7}
                    fill={isActive ? (cursor.isYourTurn ? '#5FD6A4' : '#E9A53F') : '#2F4F4B'}
                  />
                );
              })}
            </svg>
          </div>

          <div className="meta">
            <div className="meta-row">
              <span>Pattern</span>
              <b>
                {activeNotes.length} {activeNotes.length === 1 ? 'note' : 'notes'}
                {totalBeats !== activeNotes.length ? ` · ${totalBeats} beats` : ''}
              </b>
            </div>
            <div className="meta-row">
              <span>Span</span>
              <b>
                {formatNote(activeRoot + lowestOffset, useSolfege)}–{formatNote(activeRoot + highestOffset, useSolfege)}
              </b>
            </div>
            <div className="meta-row"><span>Passes</span><b>{roots.length}</b></div>
            <div className="meta-row"><span>Length</span><b>{formatDuration(sessionLength)}</b></div>
            <div className="meta-row"><span>Suggested syllable</span><b>{pattern.syllable}</b></div>

            <div className="transport">
              {playState === 'playing' ? (
                <button className="button" onClick={pause}>Pause</button>
              ) : playState === 'paused' ? (
                <button className="button" onClick={resume}>Resume</button>
              ) : (
                <button className="button" onClick={play}>Start</button>
              )}
              {playState !== 'idle' && (
                <button className="button is-secondary" onClick={stop}>Stop</button>
              )}
            </div>
          </div>
        </section>

        {/* ----------------------------- panels ----------------------------- */}
        <div className="panels">
          <section className="panel">
            <h2 className="panel-title">Pattern</h2>

            <div className="chips">
              {PATTERN_CATEGORIES.map((name) => (
                <button
                  key={name}
                  className="chip"
                  aria-pressed={!useCustomPattern && category === name}
                  onClick={() => { setCategory(name); setUseCustomPattern(false); }}
                >
                  {name}
                </button>
              ))}
              <button className="chip" aria-pressed={useCustomPattern} onClick={() => setUseCustomPattern(true)}>
                Custom
              </button>
            </div>

            {useCustomPattern ? (
              <>
                <input
                  type="text"
                  value={customInput}
                  placeholder="0 2 4 5 7 5 4 2 0"
                  onChange={(event) => setCustomInput(event.target.value)}
                  aria-label="Semitone offsets from the tonic"
                />
                <p className="hint">
                  Semitone offsets from the tonic, separated by spaces. 0 is the tonic, 4 a major third,
                  7 a fifth, 12 an octave. Negative numbers dip below the tonic.
                </p>
                <p className="hint">
                  To hold a note, append <code>xN</code> with the number of beats:
                  <code> 0 2 4 5 7x5 5 4 2 0</code> sustains the fifth for five beats instead of repeating it.
                  {customPattern.degrees.length === 0 && ' No valid notes yet.'}
                </p>
              </>
            ) : (
              <div className="pattern-list">
                {visiblePatterns.map((item) => (
                  <button
                    key={item.id}
                    className="pattern-item"
                    aria-pressed={patternId === item.id}
                    onClick={() => setPatternId(item.id)}
                  >
                    <span>{item.name}</span>
                    <small>
                      {item.beats
                        ? `${item.degrees.length} notes · ${item.beats.reduce((a, b) => a + b, 0)} beats`
                        : `${item.degrees.length} notes`}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">Your range</h2>

            <div className="chips">
              {VOICE_TYPES.map((voice) => (
                <button
                  key={voice.id}
                  className="chip"
                  aria-pressed={lowestRoot === voice.lowest && highestNote === voice.highest}
                  onClick={() => applyVoiceType(voice)}
                >
                  {voice.name}
                </button>
              ))}
            </div>

            <div className="keyboard" aria-hidden="true">
              {Array.from({ length: KEYBOARD_HIGHEST - KEYBOARD_LOWEST + 1 }, (unused, index) => {
                const midi = KEYBOARD_LOWEST + index;
                const isBlack = BLACK_KEY_CLASSES.includes(midi % 12);
                const isSelected = midi >= lowestRoot && midi <= highestNote;
                const isSounding = playState !== 'idle' && cursor && midi === cursor.midi;
                return (
                  <div
                    key={midi}
                    className={`key ${isBlack ? 'is-black' : 'is-white'} ${isSelected ? 'is-selected' : ''} ${isSounding ? 'is-sounding' : ''}`}
                  />
                );
              })}
            </div>

            <div className="field-row">
              <label htmlFor="lowest-root">Lowest tonic</label>
              <output>{formatNote(lowestRoot, useSolfege)}</output>
              <input
                id="lowest-root"
                type="range"
                min={KEYBOARD_LOWEST}
                max={KEYBOARD_HIGHEST}
                value={lowestRoot}
                onChange={(event) => setLowestRoot(Math.min(Number(event.target.value), highestNote))}
              />
            </div>

            <div className="field-row">
              <label htmlFor="highest-note">Highest note</label>
              <output>{formatNote(highestNote, useSolfege)}</output>
              <input
                id="highest-note"
                type="range"
                min={KEYBOARD_LOWEST}
                max={KEYBOARD_HIGHEST}
                value={highestNote}
                onChange={(event) => setHighestNote(Math.max(Number(event.target.value), lowestRoot))}
              />
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={limitByTopNote}
                onChange={(event) => setLimitByTopNote(event.target.checked)}
              />
              Stop at the pattern&rsquo;s highest note, not its tonic
            </label>

            <p className="hint">
              With this on, the session ends once the top note would pass {formatNote(highestNote, useSolfege)}.
            </p>
          </section>

          <section className="panel">
            <h2 className="panel-title">Find your range</h2>

            <p className="hint" style={{ marginTop: 0 }}>
              A guided, two-minute test: match a note, then follow the piano down and back up
              until it reaches where your voice runs out. No music reading needed — the piano
              tells you when it&rsquo;s your turn.
            </p>

            {savedRangeResult && (
              <div className="meta-row">
                <span>Last measured</span>
                <b>
                  {formatNote(savedRangeResult.lowestMidi, useSolfege)}–{formatNote(savedRangeResult.highestMidi, useSolfege)}
                  {savedRangeResult.voiceType ? ` · ${savedRangeResult.voiceType.name}` : ''}
                </b>
              </div>
            )}

            <div className="transport" style={{ marginTop: 12 }}>
              <button className="button" onClick={startVocalRangeTest}>
                {savedRangeResult ? 'Measure again' : 'Find my vocal range'}
              </button>
              {savedRangeResult && (
                <button
                  className="button is-secondary"
                  onClick={() => applyMeasuredRange(savedRangeResult.lowestMidi, savedRangeResult.highestMidi)}
                >
                  Apply last result
                </button>
              )}
            </div>

            {rangeTestError && <p className="error">{rangeTestError}</p>}
          </section>

          <section className="panel">
            <h2 className="panel-title">Playback</h2>

            <div className="chips">
              {PLAYBACK_MODES.map((mode) => (
                <button
                  key={mode.id}
                  className="chip"
                  aria-pressed={playbackMode === mode.id}
                  onClick={() => setPlaybackMode(mode.id)}
                >
                  {mode.name}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>{activeMode.hint}</p>

            <div className="field-row">
              <label htmlFor="tempo">Tempo</label>
              <output>{tempo} bpm</output>
              <input id="tempo" type="range" min={40} max={200} value={tempo}
                onChange={(event) => setTempo(Number(event.target.value))} />
            </div>

            <div className="field-row">
              <label htmlFor="notes-per-beat">Notes per beat</label>
              <output>{notesPerBeat}</output>
              <input id="notes-per-beat" type="range" min={1} max={4} value={notesPerBeat}
                onChange={(event) => setNotesPerBeat(Number(event.target.value))} />
            </div>

            <div className="field-row">
              <label htmlFor="repeats">Times per key</label>
              <output>{repeatsPerRoot}</output>
              <input id="repeats" type="range" min={1} max={4} value={repeatsPerRoot}
                onChange={(event) => setRepeatsPerRoot(Number(event.target.value))} />
            </div>

            <div className="field-row">
              <label htmlFor="rest">Breath between passes</label>
              <output>{restBeats} {restBeats === 1 ? 'beat' : 'beats'}</output>
              <input id="rest" type="range" min={0} max={6} value={restBeats}
                onChange={(event) => setRestBeats(Number(event.target.value))} />
            </div>

            <div className="field-row">
              <label htmlFor="step-size">Each pass moves</label>
              <output>
                {stepSize === 1 ? 'a semitone' : stepSize === 2 ? 'a whole tone' : `${stepSize} semitones`}
              </output>
              <input id="step-size" type="range" min={1} max={4} value={stepSize}
                onChange={(event) => setStepSize(Number(event.target.value))} />
            </div>

            <div className="field-row">
              <label htmlFor="direction">Travel</label>
              <select id="direction" value={direction} onChange={(event) => setDirection(event.target.value)}>
                {TRAVEL_DIRECTIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>

            <div className="field-row">
              <label htmlFor="volume">Piano volume</label>
              <output>{volume} dB</output>
              <input id="volume" type="range" min={-30} max={0} value={volume}
                onChange={(event) => setVolume(Number(event.target.value))} />
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Live tuning</h2>

            <div className="tuner">
              <div className="tuner-center" />
              {centsOff !== null && (
                <div
                  className="tuner-needle"
                  style={{
                    left: `calc(${50 + Math.max(-50, Math.min(50, centsOff))}% - 2px)`,
                    background: isInTune ? 'var(--mint)' : 'var(--coral)',
                  }}
                />
              )}
              <div className="tuner-label">
                {!microphoneOn
                  ? 'Microphone off'
                  : centsOff === null
                    ? 'Sing a note...'
                    : `${formatNote(Math.round(detectedPitch.midi), useSolfege)} · ${centsOff > 0 ? '+' : ''}${Math.round(centsOff)} cents`}
              </div>
            </div>

            <div className="transport" style={{ marginTop: 12 }}>
              <button className="button is-secondary" onClick={toggleMicrophone}>
                {microphoneOn ? 'Turn off microphone' : 'Listen to my voice'}
              </button>
            </div>

            {microphoneError && <p className="error">{microphoneError}</p>}

            <p className="hint">
              Use headphones: with the piano coming out of the speakers, the microphone mistakes it for your
              voice. The needle compares what you sing against the note highlighted in the pattern, so it is
              most useful in Echo and Reference mode.
            </p>
          </section>
        </div>

        <p className="hint" style={{ maxWidth: '70ch', margin: '20px auto 0' }}>
          Start comfortable and climb slowly. A note that asks for force is the signal to stop the session and
          come back down, not to push through.
        </p>

        {rangeTestOpen && (
          <div className="range-test-overlay" role="dialog" aria-modal="true" aria-label="Vocal range test">
            <div className="range-test-card">
              <button className="range-test-close" onClick={stopRangeTest} aria-label="Stop the test">×</button>

              {(rangeTestStage === 'sounding'
                || rangeTestStage === 'listening'
                || rangeTestStage === 'analyzing'
                || rangeTestStage === 'bleed-warning') && (
                <div aria-live="polite">
                  <div
                    className={`range-test-indicator ${
                      rangeTestStage === 'listening'
                        ? 'is-your-turn'
                        : rangeTestStage === 'bleed-warning'
                          ? 'is-warning'
                          : 'is-piano'
                    }`}
                  >
                    {rangeTestStage === 'sounding' && 'Listen…'}
                    {rangeTestStage === 'listening' && 'Now you'}
                    {rangeTestStage === 'analyzing' && 'Checking…'}
                    {rangeTestStage === 'bleed-warning' && 'Still hearing the piano'}
                  </div>

                  <p className="hint">
                    {rangeTestStage === 'sounding' && 'A note is about to play. Match it once it stops.'}
                    {rangeTestStage === 'listening' && 'Sing "ah" on the note you just heard, and hold it.'}
                    {rangeTestStage === 'analyzing' && 'One moment.'}
                    {rangeTestStage === 'bleed-warning'
                      && 'The microphone can still hear the piano. Turn its volume down or switch to headphones, then try again.'}
                  </p>

                  {rangeTestStage === 'bleed-warning' && (
                    <div className="transport" style={{ justifyContent: 'center' }}>
                      <button className="button" onClick={retryAfterBleedWarning}>Try this note again</button>
                    </div>
                  )}

                  <p className="hint" style={{ marginTop: 16 }}>
                    {rangeTestState?.phase === 'down' ? 'Walking down' : 'Walking up'} from the middle note.
                  </p>
                </div>
              )}

              {rangeTestStage === 'stopped' && (() => {
                const lowestMidi = rangeTestState?.lowestUsableMidi ?? null;
                const highestMidi = rangeTestState?.highestUsableMidi ?? null;
                const hasAny = lowestMidi !== null || highestMidi !== null;
                return (
                  <>
                    <p className="hint" style={{ marginTop: 0 }}>Test stopped.</p>
                    {hasAny ? (
                      <p>
                        So far: {lowestMidi !== null ? formatNote(lowestMidi, useSolfege) : 'not yet found'}
                        {' – '}
                        {highestMidi !== null ? formatNote(highestMidi, useSolfege) : 'not yet found'}
                      </p>
                    ) : (
                      <p className="hint">Nothing was measured yet.</p>
                    )}
                    <div className="transport" style={{ justifyContent: 'center' }}>
                      {hasAny && (
                        <button
                          className="button"
                          onClick={() => {
                            if (lowestMidi !== null) setLowestRoot(lowestMidi);
                            if (highestMidi !== null) setHighestNote(highestMidi);
                            closeRangeTestOverlay();
                          }}
                        >
                          Apply what we found
                        </button>
                      )}
                      <button className="button is-secondary" onClick={closeRangeTestOverlay}>Close</button>
                    </div>
                  </>
                );
              })()}

              {rangeTestStage === 'incomplete' && (
                <>
                  <p className="hint" style={{ marginTop: 0 }}>
                    {rangeTestIncomplete === 'both'
                      ? "We couldn't get a reliable reading. Let's try from the start."
                      : `We found your ${rangeTestIncomplete === 'down' ? 'highest' : 'lowest'} note, but not the ${
                          rangeTestIncomplete === 'down' ? 'lowest' : 'highest'
                        } one.`}
                  </p>
                  <div className="transport" style={{ justifyContent: 'center' }}>
                    {rangeTestIncomplete === 'both' ? (
                      <button className="button" onClick={startVocalRangeTest}>Try again</button>
                    ) : (
                      <button className="button" onClick={() => retryRangeDirection(rangeTestIncomplete)}>
                        Retry the {rangeTestIncomplete === 'down' ? 'low' : 'high'} notes
                      </button>
                    )}
                    <button className="button is-secondary" onClick={closeRangeTestOverlay}>Close</button>
                  </div>
                </>
              )}

              {rangeTestStage === 'result' && rangeTestResult && (
                <>
                  <div className="range-test-indicator is-your-turn">
                    {formatNote(rangeTestResult.lowestMidi, useSolfege)}–{formatNote(rangeTestResult.highestMidi, useSolfege)}
                  </div>
                  <p className="hint">
                    A span of {rangeTestResult.spanOctaves.toFixed(1)} octaves · closest to {rangeTestResult.voiceType.name}
                  </p>
                  <div className="transport" style={{ justifyContent: 'center' }}>
                    <button
                      className="button"
                      onClick={() => {
                        applyMeasuredRange(rangeTestResult.lowestMidi, rangeTestResult.highestMidi);
                        closeRangeTestOverlay();
                      }}
                    >
                      Use this range
                    </button>
                    <button className="button is-secondary" onClick={closeRangeTestOverlay}>Close</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
