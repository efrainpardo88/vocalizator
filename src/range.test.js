import { describe, it, expect } from 'vitest';

import { midiToFrequency } from './pitch.js';
import {
  BOUNDARY_CENTS_TOLERANCE,
  MAX_TEST_MIDI,
  MIN_TEST_MIDI,
  closestVoiceType,
  evaluateAttempt,
  finalizeRangeTest,
  recordAttempt,
  startRangeTest,
} from './range.js';

const MIDDLE_MIDI = 60; // C4

/** Runs a walk to completion, driving each attempt with a stub singer. */
const runWalk = (middleMidi, singFrequencyFor) => {
  let state = startRangeTest(middleMidi);
  while (state.status !== 'complete') {
    state = recordAttempt(state, singFrequencyFor(state.nextTargetMidi));
  }
  return state;
};

describe('evaluateAttempt', () => {
  it('is usable when the sung frequency lands on the target', () => {
    const attempt = evaluateAttempt(60, midiToFrequency(60));
    expect(attempt.usable).toBe(true);
    expect(attempt.centsOff).toBeCloseTo(0, 6);
  });

  it('is unusable when detectPitch found nothing (-1)', () => {
    const attempt = evaluateAttempt(60, -1);
    expect(attempt.usable).toBe(false);
    expect(attempt.midi).toBeNull();
  });

  it('is unusable when the pitch is too far from the target to be that note', () => {
    // A whole tone away is well outside the boundary tolerance.
    const attempt = evaluateAttempt(60, midiToFrequency(62));
    expect(attempt.usable).toBe(false);
  });

  it('stays usable right at the edge of the boundary tolerance', () => {
    const centsFrequency = (midi, cents) => midiToFrequency(midi) * Math.pow(2, cents / 1200);
    const justInside = evaluateAttempt(60, centsFrequency(60, BOUNDARY_CENTS_TOLERANCE - 1));
    const justOutside = evaluateAttempt(60, centsFrequency(60, BOUNDARY_CENTS_TOLERANCE + 1));
    expect(justInside.usable).toBe(true);
    expect(justOutside.usable).toBe(false);
  });

  it('is usable but not in tune between the in-tune and boundary tolerances', () => {
    const centsFrequency = (midi, cents) => midiToFrequency(midi) * Math.pow(2, cents / 1200);
    // 35 cents sits past IN_TUNE_CENTS (20) but inside BOUNDARY_CENTS_TOLERANCE (50).
    const attempt = evaluateAttempt(60, centsFrequency(60, 35));
    expect(attempt.usable).toBe(true);
    expect(attempt.inTune).toBe(false);
  });
});

describe('startRangeTest', () => {
  it('starts measuring at the middle note, walking down first', () => {
    const state = startRangeTest(MIDDLE_MIDI);
    expect(state.status).toBe('measuring');
    expect(state.phase).toBe('down');
    expect(state.nextTargetMidi).toBe(MIDDLE_MIDI);
    expect(state.lowestUsableMidi).toBeNull();
    expect(state.highestUsableMidi).toBeNull();
  });
});

describe('recordAttempt', () => {
  it('walks a singer who matches every note down to a known floor', () => {
    const floor = MIDDLE_MIDI - 5;
    const singFrequencyFor = (midi) => (midi >= floor ? midiToFrequency(midi) : -1);

    let state = startRangeTest(MIDDLE_MIDI);
    // Walk all the way down, past the floor, until the boundary is found.
    while (state.phase === 'down') {
      state = recordAttempt(state, singFrequencyFor(state.nextTargetMidi));
    }

    expect(state.lowestUsableMidi).toBe(floor);
    expect(state.phase).toBe('up');
    expect(state.nextTargetMidi).toBe(MIDDLE_MIDI); // returns to the middle to walk up
  });

  it('does not end the walk on a single missed note', () => {
    let state = startRangeTest(MIDDLE_MIDI);
    // Middle succeeds.
    state = recordAttempt(state, midiToFrequency(MIDDLE_MIDI));
    expect(state.nextTargetMidi).toBe(MIDDLE_MIDI - 1);

    // One miss, a semitone down.
    state = recordAttempt(state, -1);
    expect(state.phase).toBe('down'); // still walking, not a boundary yet
    expect(state.consecutiveFailures).toBe(1);
    expect(state.nextTargetMidi).toBe(MIDDLE_MIDI - 2);

    // Recovers on the next note.
    state = recordAttempt(state, midiToFrequency(MIDDLE_MIDI - 2));
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lowestUsableMidi).toBe(MIDDLE_MIDI - 2);
    expect(state.phase).toBe('down');
  });

  it('ends the walk on two consecutive misses', () => {
    let state = startRangeTest(MIDDLE_MIDI);
    state = recordAttempt(state, midiToFrequency(MIDDLE_MIDI));
    state = recordAttempt(state, -1);
    state = recordAttempt(state, -1);

    expect(state.phase).toBe('up'); // down boundary found, now walking up
    expect(state.lowestUsableMidi).toBe(MIDDLE_MIDI);
    expect(state.nextTargetMidi).toBe(MIDDLE_MIDI);
  });

  it('completes the test once the up walk also finds its boundary', () => {
    const singFrequencyFor = (midi) => (midi === MIDDLE_MIDI ? midiToFrequency(midi) : -1);
    const finalState = runWalk(MIDDLE_MIDI, singFrequencyFor);

    expect(finalState.status).toBe('complete');
    expect(finalState.lowestUsableMidi).toBe(MIDDLE_MIDI);
    expect(finalState.highestUsableMidi).toBe(MIDDLE_MIDI);
  });

  it('is a no-op once the test is already complete', () => {
    const singFrequencyFor = (midi) => (midi === MIDDLE_MIDI ? midiToFrequency(midi) : -1);
    const finalState = runWalk(MIDDLE_MIDI, singFrequencyFor);

    const afterExtraCall = recordAttempt(finalState, midiToFrequency(MIDDLE_MIDI));
    expect(afterExtraCall).toEqual(finalState);
  });

  it('re-sings the middle note on the way up rather than reusing the down measurement', () => {
    // Fails once going down (so the down walk needs a second try to end),
    // then succeeds at the middle again on the way up.
    let state = startRangeTest(MIDDLE_MIDI);
    state = recordAttempt(state, -1); // middle fails on the way down
    state = recordAttempt(state, -1); // and again a semitone down: boundary found
    expect(state.phase).toBe('up');
    expect(state.lowestUsableMidi).toBeNull(); // never measured usable going down

    state = recordAttempt(state, midiToFrequency(MIDDLE_MIDI)); // middle succeeds this time
    expect(state.highestUsableMidi).toBe(MIDDLE_MIDI);
  });
});

describe('self-terminating floor and ceiling', () => {
  it('does not wait for a second miss at the floor - there is nowhere lower to try', () => {
    let state = startRangeTest(MIN_TEST_MIDI);
    state = recordAttempt(state, -1); // a single miss, right at the floor itself
    expect(state.phase).toBe('up');
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lowestUsableMidi).toBeNull();
  });

  it('stops going down at the floor even when every note is sung perfectly', () => {
    let state = startRangeTest(MIN_TEST_MIDI + 1);
    state = recordAttempt(state, midiToFrequency(MIN_TEST_MIDI + 1)); // succeeds, next target is the floor
    expect(state.nextTargetMidi).toBe(MIN_TEST_MIDI);
    state = recordAttempt(state, midiToFrequency(MIN_TEST_MIDI)); // succeeds at the floor itself
    expect(state.lowestUsableMidi).toBe(MIN_TEST_MIDI);
    expect(state.phase).toBe('up'); // moves on regardless of detectPitch's own limits
    expect(state.nextTargetMidi).toBe(MIN_TEST_MIDI + 1);
  });

  it('does not wait for a second miss at the ceiling - there is nowhere higher to try', () => {
    let state = startRangeTest(MAX_TEST_MIDI, 'up');
    state = recordAttempt(state, -1); // a single miss, right at the ceiling itself
    expect(state.status).toBe('complete');
    expect(state.consecutiveFailures).toBe(1);
    expect(state.highestUsableMidi).toBeNull();
  });

  it('stops going up at the ceiling even when every note is sung perfectly', () => {
    let state = startRangeTest(MAX_TEST_MIDI - 1, 'up');
    state = recordAttempt(state, midiToFrequency(MAX_TEST_MIDI - 1)); // succeeds, next target is the ceiling
    expect(state.nextTargetMidi).toBe(MAX_TEST_MIDI);
    state = recordAttempt(state, midiToFrequency(MAX_TEST_MIDI)); // succeeds at the ceiling itself
    expect(state.status).toBe('complete'); // completes on its own, not because detectPitch refused a frequency
    expect(state.highestUsableMidi).toBe(MAX_TEST_MIDI);
  });
});

describe('startRangeTest with a starting phase', () => {
  it('walks only up when started in the up phase, for retrying a failed direction', () => {
    const singFrequencyFor = (midi) => (midi <= MIDDLE_MIDI + 3 ? midiToFrequency(midi) : -1);
    let state = startRangeTest(MIDDLE_MIDI, 'up');
    expect(state.phase).toBe('up');
    expect(state.lowestUsableMidi).toBeNull();

    while (state.status !== 'complete') {
      state = recordAttempt(state, singFrequencyFor(state.nextTargetMidi));
    }

    expect(state.highestUsableMidi).toBe(MIDDLE_MIDI + 3);
    expect(state.lowestUsableMidi).toBeNull(); // the down side was never walked
  });
});

describe('finalizeRangeTest', () => {
  it('reports the lowest note, highest note and span for a full walk', () => {
    const low = MIDDLE_MIDI - 7;
    const high = MIDDLE_MIDI + 5;
    const singFrequencyFor = (midi) => (midi >= low && midi <= high ? midiToFrequency(midi) : -1);

    const finalState = runWalk(MIDDLE_MIDI, singFrequencyFor);
    const result = finalizeRangeTest(finalState);

    expect(result.lowestMidi).toBe(low);
    expect(result.highestMidi).toBe(high);
    expect(result.spanOctaves).toBeCloseTo((high - low) / 12, 10);
    expect(result.voiceType).toBe(closestVoiceType(low, high));
  });

  it('reports no range when nothing was ever detected', () => {
    const finalState = runWalk(MIDDLE_MIDI, () => -1);
    expect(finalState.lowestUsableMidi).toBeNull();
    expect(finalState.highestUsableMidi).toBeNull();
    expect(finalizeRangeTest(finalState)).toBeNull();
  });

  it('refuses to guess a boundary that was never reliably measured', () => {
    // The middle fails twice on the way down, so no lower boundary is ever
    // established, even though the up walk (a fresh attempt at the middle)
    // succeeds and finds a ceiling.
    let state = startRangeTest(MIDDLE_MIDI);
    state = recordAttempt(state, -1); // middle, down attempt: fails
    state = recordAttempt(state, -1); // a semitone down: fails again, boundary found
    expect(state.phase).toBe('up');
    expect(state.lowestUsableMidi).toBeNull();

    state = recordAttempt(state, midiToFrequency(MIDDLE_MIDI)); // middle, up attempt: succeeds
    state = recordAttempt(state, midiToFrequency(MIDDLE_MIDI + 1));
    state = recordAttempt(state, -1);
    state = recordAttempt(state, -1); // boundary found going up too, test complete

    expect(state.status).toBe('complete');
    expect(state.lowestUsableMidi).toBeNull();
    expect(state.highestUsableMidi).toBe(MIDDLE_MIDI + 1);
    expect(finalizeRangeTest(state)).toBeNull();
  });

  it('returns null before the walk is complete', () => {
    const state = startRangeTest(MIDDLE_MIDI);
    expect(finalizeRangeTest(state)).toBeNull();
  });
});

describe('closestVoiceType', () => {
  it('matches a soprano-shaped range to soprano', () => {
    expect(closestVoiceType(60, 79).id).toBe('soprano');
  });

  it('matches a bass-shaped range to bass', () => {
    expect(closestVoiceType(43, 60).id).toBe('bass');
  });
});
