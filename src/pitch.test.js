import { describe, it, expect } from 'vitest';

import {
  centsBetween,
  detectPitch,
  formatDuration,
  formatNote,
  frequencyToMidi,
  midiToFrequency,
} from './pitch.js';

/** A steady sine, the cleanest signal the detector will ever be handed. */
const sine = (frequency, sampleRate = 44100, sampleCount = 2048, amplitude = 0.5) => {
  const buffer = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    buffer[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return buffer;
};

const centsApart = (a, b) => Math.abs(1200 * Math.log2(a / b));

describe('formatNote', () => {
  it('names the tuning reference and middle C', () => {
    expect(formatNote(69)).toBe('A4');
    expect(formatNote(60)).toBe('C4');
  });

  it('rolls the octave over at B, not at the letter C', () => {
    expect(formatNote(59)).toBe('B3');
    expect(formatNote(61)).toBe('C#4');
  });

  it('uses solfege names when asked', () => {
    expect(formatNote(69, true)).toBe('La4');
    expect(formatNote(60, true)).toBe('Do4');
  });

  it('handles the bottom of the MIDI range', () => {
    expect(formatNote(0)).toBe('C-1');
  });
});

describe('midiToFrequency', () => {
  it('puts A4 at 440 Hz', () => {
    expect(midiToFrequency(69)).toBe(440);
  });

  it('halves the frequency an octave down', () => {
    expect(midiToFrequency(57)).toBeCloseTo(220, 10);
  });

  it('places middle C where the standard says', () => {
    expect(midiToFrequency(60)).toBeCloseTo(261.6255653, 6);
  });
});

describe('frequencyToMidi', () => {
  it('inverts midiToFrequency across the singing range', () => {
    for (let midi = 36; midi <= 84; midi += 1) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 10);
    }
  });

  it('returns a fraction when the pitch sits between two notes', () => {
    const quarterToneSharp = midiToFrequency(60) * Math.pow(2, 0.5 / 12);
    expect(frequencyToMidi(quarterToneSharp)).toBeCloseTo(60.5, 6);
  });
});

describe('centsBetween', () => {
  it('reads a semitone as 100 cents', () => {
    expect(centsBetween(61, 60)).toBe(100);
  });

  it('goes negative when the singer is flat', () => {
    expect(centsBetween(59.8, 60)).toBeCloseTo(-20, 10);
  });

  it('is zero on the note', () => {
    expect(centsBetween(60, 60)).toBe(0);
  });
});

describe('detectPitch', () => {
  it('finds A4 in a clean sine within a cent', () => {
    const frequency = detectPitch(sine(440), 44100);
    expect(centsApart(frequency, 440)).toBeLessThan(1);
  });

  it('tracks pitches across the vocal range', () => {
    [110, 220, 330, 523.25, 880].forEach((target) => {
      const frequency = detectPitch(sine(target), 44100);
      expect(centsApart(frequency, target)).toBeLessThan(5);
    });
  });

  it('gives up on silence', () => {
    expect(detectPitch(new Float32Array(2048), 44100)).toBe(-1);
  });

  it('gives up on a signal too quiet to call', () => {
    expect(detectPitch(sine(440, 44100, 2048, 0.005), 44100)).toBe(-1);
  });

  it('rejects frequencies outside the range a voice can reach', () => {
    expect(detectPitch(sine(3000), 44100)).toBe(-1);
  });
});

describe('formatDuration', () => {
  it('pads the seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('counts whole minutes', () => {
    expect(formatDuration(120)).toBe('2:00');
    expect(formatDuration(599)).toBe('9:59');
  });

  it('never shows sixty seconds when rounding up', () => {
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(119.7)).toBe('2:00');
  });
});
