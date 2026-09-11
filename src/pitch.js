/** Note naming, frequency math and monophonic pitch detection. */

export const LETTER_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const SOLFEGE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
export const BLACK_KEY_CLASSES = [1, 3, 6, 8, 10];

/** Turns a MIDI note number into a readable name, e.g. 60 becomes C4. */
export const formatNote = (midi, useSolfege) => {
  const names = useSolfege ? SOLFEGE_NAMES : LETTER_NAMES;
  const pitchClass = ((midi % 12) + 12) % 12;
  return names[pitchClass] + (Math.floor(midi / 12) - 1);
};

export const midiToFrequency = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** Returns a fractional MIDI number, so the decimals carry the tuning error. */
export const frequencyToMidi = (frequency) => 69 + 12 * Math.log2(frequency / 440);

export const centsBetween = (sungMidi, targetMidi) => (sungMidi - targetMidi) * 100;

/**
 * Estimates the fundamental frequency of a time-domain buffer by
 * autocorrelation. Returns -1 when the signal is too quiet or too noisy to
 * call, which is the common case between notes.
 */
export function detectPitch(buffer, sampleRate) {
  const sampleCount = buffer.length;

  let rootMeanSquare = 0;
  for (let i = 0; i < sampleCount; i += 1) rootMeanSquare += buffer[i] * buffer[i];
  rootMeanSquare = Math.sqrt(rootMeanSquare / sampleCount);
  if (rootMeanSquare < 0.012) return -1;

  // Trim the quiet head and tail so the correlation sees only the steady part.
  const silenceThreshold = 0.2;
  let head = 0;
  let tail = sampleCount - 1;
  for (let i = 0; i < sampleCount / 2; i += 1) {
    if (Math.abs(buffer[i]) < silenceThreshold) { head = i; break; }
  }
  for (let i = 1; i < sampleCount / 2; i += 1) {
    if (Math.abs(buffer[sampleCount - i]) < silenceThreshold) { tail = sampleCount - i; break; }
  }

  const trimmed = buffer.slice(head, tail);
  const trimmedCount = trimmed.length;
  if (trimmedCount < 256) return -1;

  const correlation = new Float32Array(trimmedCount);
  for (let lag = 0; lag < trimmedCount; lag += 1) {
    let sum = 0;
    for (let i = 0; i < trimmedCount - lag; i += 1) sum += trimmed[i] * trimmed[i + lag];
    correlation[lag] = sum;
  }

  // Walk past the initial downward slope, then take the tallest peak.
  let lag = 0;
  while (lag < trimmedCount - 1 && correlation[lag] > correlation[lag + 1]) lag += 1;

  let peakValue = -1;
  let peakLag = -1;
  for (let i = lag; i < trimmedCount; i += 1) {
    if (correlation[i] > peakValue) { peakValue = correlation[i]; peakLag = i; }
  }
  if (peakLag <= 0) return -1;

  // Parabolic interpolation around the peak, for sub-sample resolution.
  const before = correlation[peakLag - 1];
  const at = correlation[peakLag];
  const after = correlation[peakLag + 1] ?? 0;
  const curvature = (before + after - 2 * at) / 2;
  const slope = (after - before) / 2;
  const refinedLag = curvature ? peakLag - slope / (2 * curvature) : peakLag;

  const frequency = sampleRate / refinedLag;
  if (frequency < 60 || frequency > 1400) return -1;
  return frequency;
}

/**
 * Formats seconds as m:ss. Rounds before splitting, because rounding the
 * remainder on its own turns 59.6 seconds into "0:60".
 */
export const formatDuration = (seconds) => {
  const wholeSeconds = Math.round(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
};
