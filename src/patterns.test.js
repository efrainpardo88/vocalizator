import { describe, it, expect } from 'vitest';

import {
  PATTERN_CATEGORIES,
  PATTERN_LIBRARY,
  PLAYBACK_MODES,
  TRAVEL_DIRECTIONS,
  VOICE_TYPES,
  countBeats,
  toSteps,
} from './patterns.js';

describe('PATTERN_LIBRARY integrity', () => {
  it('has no duplicate ids', () => {
    const ids = PATTERN_LIBRARY.map((pattern) => pattern.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every pattern the fields the UI reads', () => {
    PATTERN_LIBRARY.forEach((pattern) => {
      expect(pattern.id, `${pattern.name} has no id`).toBeTruthy();
      expect(pattern.name, `${pattern.id} has no name`).toBeTruthy();
      expect(pattern.category, `${pattern.id} has no category`).toBeTruthy();
      expect(pattern.syllable, `${pattern.id} has no syllable`).toBeTruthy();
      expect(pattern.degrees.length, `${pattern.id} has no degrees`).toBeGreaterThan(0);
    });
  });

  /*
   * The invariant CLAUDE.md warns about: mismatched lengths do not throw,
   * toSteps quietly falls back to one beat and the exercise plays wrong.
   */
  it('keeps beats parallel to degrees wherever beats is present', () => {
    PATTERN_LIBRARY.filter((pattern) => pattern.beats).forEach((pattern) => {
      expect(pattern.beats.length, `${pattern.id} has mismatched beats and degrees`)
        .toBe(pattern.degrees.length);
    });
  });

  it('holds every note for at least one beat', () => {
    PATTERN_LIBRARY.filter((pattern) => pattern.beats).forEach((pattern) => {
      pattern.beats.forEach((beat) => {
        expect(beat, `${pattern.id} has a non-positive beat`).toBeGreaterThan(0);
      });
    });
  });

  it('keeps every degree inside a range a voice can transpose', () => {
    PATTERN_LIBRARY.forEach((pattern) => {
      pattern.degrees.forEach((degree) => {
        expect(degree, `${pattern.id} leaps out of range`).toBeGreaterThanOrEqual(-12);
        expect(degree, `${pattern.id} leaps out of range`).toBeLessThanOrEqual(24);
      });
    });
  });

  it('starts every Sustains pattern with an explicit beats array', () => {
    PATTERN_LIBRARY.filter((pattern) => pattern.category === 'Sustains').forEach((pattern) => {
      expect(pattern.beats, `${pattern.id} is a sustain without beats`).toBeDefined();
    });
  });
});

describe('PATTERN_CATEGORIES', () => {
  it('is derived from the library, with no category invented or lost', () => {
    expect([...PATTERN_CATEGORIES].sort())
      .toEqual([...new Set(PATTERN_LIBRARY.map((pattern) => pattern.category))].sort());
  });

  it('lists each category once', () => {
    expect(new Set(PATTERN_CATEGORIES).size).toBe(PATTERN_CATEGORIES.length);
  });
});

describe('toSteps', () => {
  it('gives every note one beat when the pattern omits beats', () => {
    const steps = toSteps({ degrees: [0, 4, 7] });
    expect(steps).toEqual([
      { degree: 0, beats: 1 },
      { degree: 4, beats: 1 },
      { degree: 7, beats: 1 },
    ]);
  });

  it('carries the declared length of each note', () => {
    const steps = toSteps({ degrees: [0, 12, 0], beats: [1, 6, 2] });
    expect(steps.map((step) => step.beats)).toEqual([1, 6, 2]);
  });

  it('produces one step per degree for every pattern in the library', () => {
    PATTERN_LIBRARY.forEach((pattern) => {
      expect(toSteps(pattern).length, `${pattern.id} lost or gained a step`)
        .toBe(pattern.degrees.length);
    });
  });

  it('keeps degrees below the tonic intact', () => {
    expect(toSteps({ degrees: [0, -1, 0] }).map((step) => step.degree)).toEqual([0, -1, 0]);
  });
});

describe('countBeats', () => {
  it('totals a plain pattern as one beat per note', () => {
    expect(countBeats(toSteps({ degrees: [0, 2, 4, 2, 0] }))).toBe(5);
  });

  it('counts a sustain as its full length', () => {
    expect(countBeats(toSteps({ degrees: [0], beats: [12] }))).toBe(12);
  });

  it('is zero for an empty pattern', () => {
    expect(countBeats([])).toBe(0);
  });
});

describe('VOICE_TYPES', () => {
  it('puts every lowest note below its highest', () => {
    VOICE_TYPES.forEach((voice) => {
      expect(voice.lowest, `${voice.id} is inverted`).toBeLessThan(voice.highest);
    });
  });

  it('keeps every range inside the keyboard the UI draws', () => {
    VOICE_TYPES.forEach((voice) => {
      expect(voice.lowest, `${voice.id} starts below the keyboard`).toBeGreaterThanOrEqual(36);
      expect(voice.highest, `${voice.id} ends above the keyboard`).toBeLessThanOrEqual(84);
    });
  });

  it('descends from soprano to bass', () => {
    const lowest = VOICE_TYPES.map((voice) => voice.lowest);
    expect([...lowest].sort((a, b) => b - a)).toEqual(lowest);
  });
});

describe('option lists', () => {
  it('gives every playback mode an id, a name and a hint', () => {
    PLAYBACK_MODES.forEach((mode) => {
      expect(mode.id).toBeTruthy();
      expect(mode.name).toBeTruthy();
      expect(mode.hint).toBeTruthy();
    });
  });

  it('keeps ids unique across every option list', () => {
    [PLAYBACK_MODES, TRAVEL_DIRECTIONS, VOICE_TYPES].forEach((list) => {
      const ids = list.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
