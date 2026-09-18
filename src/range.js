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

import { IN_TUNE_CENTS, centsBetween, frequencyToMidi } from './pitch.js';
import { VOICE_TYPES } from './patterns.js';

/**
 * Outer bound on the walk itself, independent of whatever frequency range
 * `detectPitch` happens to accept. Without this, the walk only terminates
 * because that collaborator refuses anything outside 60-1400 Hz — a property
 * of `pitch.js`, not a guarantee this module should lean on. Chosen wide
 * enough to sit outside any voice this test will plausibly meet (roughly C0
 * to C8); assumed, not verified against real singers, and only meant as a
 * safety rail so the walk is self-terminating on its own terms.
 */
export const MIN_TEST_MIDI = 12;
export const MAX_TEST_MIDI = 108;

/**
 * How far a sung pitch may sit from the target and still count as "reached
 * this note", for the purpose of deciding whether the walk should keep
 * going. This is deliberately wider than `IN_TUNE_CENTS` (imported from
 * `pitch.js`, used for the practice tuner and for judging the comfortable
 * middle note): at the edges of a range a singer reaches a note without
 * centering it, and holding the boundary to the same standard as "in tune"
 * would report a range narrower than the singer's real one.
 *
 * 50 cents is a quarter of a semitone: forgiving of a note sung under or
 * over pitch, while still closer to the target than to its neighbor. This
 * is an assumed starting point, not a verified constant — it needs tuning
 * against real voices once this ships.
 */
export const BOUNDARY_CENTS_TOLERANCE = 50;

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
 *
 * `usable` decides whether the walk continues past this note, judged
 * against `BOUNDARY_CENTS_TOLERANCE`. `inTune` is the stricter, informational
 * read against `IN_TUNE_CENTS` — the same standard the practice tuner uses —
 * for an interface that wants to show precise tuning feedback without it
 * affecting where the boundary is drawn.
 */
export function evaluateAttempt(targetMidi, singerOnlyFrequency) {
  if (!(singerOnlyFrequency > 0)) {
    return { targetMidi, midi: null, centsOff: null, usable: false, inTune: false };
  }
  const midi = frequencyToMidi(singerOnlyFrequency);
  const centsOff = centsBetween(midi, targetMidi);
  return {
    targetMidi,
    midi,
    centsOff,
    usable: Math.abs(centsOff) <= BOUNDARY_CENTS_TOLERANCE,
    inTune: Math.abs(centsOff) <= IN_TUNE_CENTS,
  };
}

/**
 * Starts a walk anchored on a comfortable middle note, given as a MIDI
 * number. `phase` defaults to 'down', the normal start of a fresh test; the
 * interface layer may pass 'up' to retry only the direction that failed to
 * resolve last time, without re-walking the side that already succeeded.
 */
export function startRangeTest(middleMidi, phase = 'down') {
  return {
    status: 'measuring',
    phase,
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
 *
 * A phase also ends the moment its next step would cross `MIN_TEST_MIDI` or
 * `MAX_TEST_MIDI`, even on a single miss or a lone success right at the
 * edge: there is nowhere further to try, so waiting for a second failure
 * would only stall the walk against its own bound.
 */
export function recordAttempt(state, singerOnlyFrequency) {
  if (state.status === 'complete') return state;

  const targetMidi = state.nextTargetMidi;
  const attempt = evaluateAttempt(targetMidi, singerOnlyFrequency);
  const measurements = [...state.measurements, attempt];

  if (state.phase === 'down') {
    const nextDown = targetMidi - 1;
    const atFloor = nextDown < MIN_TEST_MIDI;

    if (attempt.usable) {
      const lowestUsableMidi = targetMidi;
      if (atFloor) {
        return {
          ...state,
          measurements,
          lowestUsableMidi,
          phase: 'up',
          consecutiveFailures: 0,
          nextTargetMidi: state.middleMidi,
        };
      }
      return { ...state, measurements, lowestUsableMidi, consecutiveFailures: 0, nextTargetMidi: nextDown };
    }

    const consecutiveFailures = state.consecutiveFailures + 1;
    if (consecutiveFailures >= 2 || atFloor) {
      // The bottom has been found. Return to the middle and walk up.
      return {
        ...state,
        measurements,
        phase: 'up',
        consecutiveFailures: 0,
        nextTargetMidi: state.middleMidi,
      };
    }
    return { ...state, measurements, consecutiveFailures, nextTargetMidi: nextDown };
  }

  // phase === 'up'
  const nextUp = targetMidi + 1;
  const atCeiling = nextUp > MAX_TEST_MIDI;

  if (attempt.usable) {
    const highestUsableMidi = targetMidi;
    if (atCeiling) {
      return { ...state, measurements, highestUsableMidi, status: 'complete', consecutiveFailures: 0, nextTargetMidi: null };
    }
    return { ...state, measurements, highestUsableMidi, consecutiveFailures: 0, nextTargetMidi: nextUp };
  }

  const consecutiveFailures = state.consecutiveFailures + 1;
  if (consecutiveFailures >= 2 || atCeiling) {
    return { ...state, measurements, status: 'complete', consecutiveFailures, nextTargetMidi: null };
  }
  return { ...state, measurements, consecutiveFailures, nextTargetMidi: nextUp };
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
