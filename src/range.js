/**
 * The vocal range test, expressed as decisions over measurements.
 *
 * This module owns no timer and touches no audio. It is handed the result of
 * one measurement at a time — a frequency, or the absence of one — and
 * returns the next state: which note to try next, or that a boundary has
 * been found. The interface layer (a later change) is responsible for
 * playing the target note, recording a window with the singer alone in it,
 * running that window through `detectPitch`, and feeding the result in here.
 *
 * The walk: sound a comfortable middle note, walk down a semitone at a time
 * until two consecutive notes come back unusable, then return to the middle
 * and walk up the same way. Returning to the middle means singing it again
 * — the up walk's first target is the middle note itself, not a stored
 * result from the down walk, because it is a fresh attempt at a fresh
 * moment.
 */

import { centsBetween, frequencyToMidi } from './pitch.js';
import { VOICE_TYPES } from './patterns.js';

/**
 * How far a sung pitch may sit from the target and still count as that
 * note, rather than a miss. Matches the tuner's in-tune threshold in
 * VocalLines.jsx (verified by reading `IN_TUNE_CENTS` there) so "in tune"
 * means the same thing during practice and during the range test.
 */
export const IN_TUNE_CENTS_TOLERANCE = 20;

/**
 * Classifies one measurement window against the note it was asked to match.
 *
 * `singerOnlyFrequency` must come from a window where only the singer was
 * audible — never a window that overlaps the reference tone, since
 * `detectPitch` cannot tell a piano's fundamental from a voice's. Naming the
 * parameter this way is the module's way of keeping that requirement out in
 * the open rather than leaving it to a comment the interface layer could
 * miss.
 *
 * `detectPitch` returns -1 when it has nothing usable to report — too
 * quiet, too noisy, or outside 60-1400 Hz (verified in `pitch.js`). That is
 * boundary information, not a failure to propagate, so any non-positive
 * frequency is treated as "nothing was sung usably" here, same as a pitch
 * that was audible but too far from the target to be that note.
 */
export function evaluateAttempt(targetMidi, singerOnlyFrequency) {
  if (!(singerOnlyFrequency > 0)) {
    return { targetMidi, midi: null, centsOff: null, usable: false };
  }
  const midi = frequencyToMidi(singerOnlyFrequency);
  const centsOff = centsBetween(midi, targetMidi);
  return { targetMidi, midi, centsOff, usable: Math.abs(centsOff) <= IN_TUNE_CENTS_TOLERANCE };
}

/** Starts a walk anchored on a comfortable middle note, given as a MIDI number. */
export function startRangeTest(middleMidi) {
  return {
    status: 'measuring',
    phase: 'down',
    middleMidi,
    nextTargetMidi: middleMidi,
    consecutiveFailures: 0,
    lowestUsableMidi: null,
    highestUsableMidi: null,
    measurements: [],
  };
}

/**
 * Advances the walk by one measurement. `singerOnlyFrequency` is evaluated
 * against `state.nextTargetMidi`, the note the walk just asked for.
 *
 * Returns the next state: either another `nextTargetMidi` to try, or
 * `status: 'complete'` once both boundaries have been found (or given up
 * on). Calling this after the walk is complete is a caller error and is a
 * no-op, since there is no note left to have measured.
 */
export function recordAttempt(state, singerOnlyFrequency) {
  if (state.status === 'complete') return state;

  const targetMidi = state.nextTargetMidi;
  const attempt = evaluateAttempt(targetMidi, singerOnlyFrequency);
  const measurements = [...state.measurements, attempt];

  if (state.phase === 'down') {
    if (attempt.usable) {
      return {
        ...state,
        measurements,
        lowestUsableMidi: targetMidi,
        consecutiveFailures: 0,
        nextTargetMidi: targetMidi - 1,
      };
    }

    const consecutiveFailures = state.consecutiveFailures + 1;
    if (consecutiveFailures >= 2) {
      // The bottom has been found. Return to the middle and walk up.
      return {
        ...state,
        measurements,
        phase: 'up',
        consecutiveFailures: 0,
        nextTargetMidi: state.middleMidi,
      };
    }
    return { ...state, measurements, consecutiveFailures, nextTargetMidi: targetMidi - 1 };
  }

  // phase === 'up'
  if (attempt.usable) {
    return {
      ...state,
      measurements,
      highestUsableMidi: targetMidi,
      consecutiveFailures: 0,
      nextTargetMidi: targetMidi + 1,
    };
  }

  const consecutiveFailures = state.consecutiveFailures + 1;
  if (consecutiveFailures >= 2) {
    return { ...state, measurements, status: 'complete', consecutiveFailures, nextTargetMidi: null };
  }
  return { ...state, measurements, consecutiveFailures, nextTargetMidi: targetMidi + 1 };
}

/**
 * Picks the `VOICE_TYPES` entry whose comfortable range sits closest to the
 * measured one, by comparing midpoints. This is an assumed heuristic, not a
 * verified vocal-classification standard — `VOICE_TYPES` itself is a table
 * of comfortable starting ranges, not a formal tessitura chart.
 */
export function closestVoiceType(lowestMidi, highestMidi) {
  const midpoint = (lowestMidi + highestMidi) / 2;
  const distanceTo = (voice) => Math.abs((voice.lowest + voice.highest) / 2 - midpoint);
  return VOICE_TYPES.reduce((closest, voice) => (distanceTo(voice) < distanceTo(closest) ? voice : closest));
}

/**
 * Produces the final report once a walk is complete. Returns `null` rather
 * than a guess when either boundary was never established — including the
 * case where even the middle note came back unusable in both directions,
 * which means nothing about the singer's range was actually measured.
 */
export function finalizeRangeTest(state) {
  if (state.status !== 'complete') return null;

  const { lowestUsableMidi, highestUsableMidi } = state;
  if (lowestUsableMidi === null || highestUsableMidi === null) return null;

  return {
    lowestMidi: lowestUsableMidi,
    highestMidi: highestUsableMidi,
    spanOctaves: (highestUsableMidi - lowestUsableMidi) / 12,
    voiceType: closestVoiceType(lowestUsableMidi, highestUsableMidi),
  };
}
