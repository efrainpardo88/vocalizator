/**
 * The exercise library.
 *
 * `degrees` holds semitone offsets from the tonic: 0 is the tonic, 4 a major
 * third, 7 a fifth, 12 an octave. Negative values dip below the tonic.
 *
 * `beats` is optional and parallel to `degrees`. It sets how many beats each
 * note lasts, so a sustained note is one long note instead of several attacks.
 * When omitted, every note lasts one beat.
 */
export const PATTERN_LIBRARY = [
  // Basics
  { id: 'basic-five', category: 'Basics', name: '1-2-3-4-5-4-3-2-1', degrees: [0, 2, 4, 5, 7, 5, 4, 2, 0], syllable: 'mee / nay / mah' },
  { id: 'basic-three', category: 'Basics', name: '1-2-3-2-1', degrees: [0, 2, 4, 2, 0], syllable: 'mum / nay' },
  { id: 'basic-descending', category: 'Basics', name: '5-4-3-2-1 descending', degrees: [7, 5, 4, 2, 0], syllable: 'mah / mee' },
  { id: 'basic-triad', category: 'Basics', name: '1-3-5-3-1', degrees: [0, 4, 7, 4, 0], syllable: 'lip trill' },
  { id: 'basic-fifth', category: 'Basics', name: '1-5-1', degrees: [0, 7, 0], syllable: 'noo' },
  { id: 'basic-third', category: 'Basics', name: '1-3-1', degrees: [0, 4, 0], syllable: 'mee' },
  { id: 'basic-octave', category: 'Basics', name: '1-8-1 octave', degrees: [0, 12, 0], syllable: 'woh' },
  { id: 'basic-single', category: 'Basics', name: 'Single note', degrees: [0], syllable: 'ah, held' },

  // Scales
  { id: 'scale-major-full', category: 'Scales', name: 'Major scale, up and down', degrees: [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0], syllable: 'nah' },
  { id: 'scale-major-up', category: 'Scales', name: 'Major scale, ascending', degrees: [0, 2, 4, 5, 7, 9, 11, 12], syllable: 'ah' },
  { id: 'scale-major-down', category: 'Scales', name: 'Major scale, descending', degrees: [12, 11, 9, 7, 5, 4, 2, 0], syllable: 'oh' },
  { id: 'scale-major-sixth', category: 'Scales', name: 'Major up to the sixth', degrees: [0, 2, 4, 5, 7, 9, 7, 5, 4, 2, 0], syllable: 'nay' },
  { id: 'scale-minor-natural', category: 'Scales', name: 'Natural minor, up and down', degrees: [0, 2, 3, 5, 7, 8, 10, 12, 10, 8, 7, 5, 3, 2, 0], syllable: 'moh' },
  { id: 'scale-minor-harmonic', category: 'Scales', name: 'Harmonic minor, up and down', degrees: [0, 2, 3, 5, 7, 8, 11, 12, 11, 8, 7, 5, 3, 2, 0], syllable: 'noh' },
  { id: 'scale-minor-melodic', category: 'Scales', name: 'Melodic minor, ascending', degrees: [0, 2, 3, 5, 7, 9, 11, 12], syllable: 'ah' },
  { id: 'scale-minor-five', category: 'Scales', name: 'Minor, first five notes', degrees: [0, 2, 3, 5, 7, 5, 3, 2, 0], syllable: 'mee' },
  { id: 'scale-major-thirds', category: 'Scales', name: 'Major scale in thirds', degrees: [0, 4, 2, 5, 4, 7, 5, 9, 7, 5, 4, 2, 0], syllable: 'lah' },

  // Pentatonics
  { id: 'penta-major-octave', category: 'Pentatonics', name: 'Major pentatonic, up and down', degrees: [0, 2, 4, 7, 9, 12, 9, 7, 4, 2, 0], syllable: 'yah' },
  { id: 'penta-major-five', category: 'Pentatonics', name: 'Major pentatonic, five notes', degrees: [0, 2, 4, 7, 9, 7, 4, 2, 0], syllable: 'yah' },
  { id: 'penta-minor-octave', category: 'Pentatonics', name: 'Minor pentatonic, up and down', degrees: [0, 3, 5, 7, 10, 12, 10, 7, 5, 3, 0], syllable: 'yeah' },
  { id: 'penta-minor-five', category: 'Pentatonics', name: 'Minor pentatonic, five notes', degrees: [0, 3, 5, 7, 10, 7, 5, 3, 0], syllable: 'yeah' },
  { id: 'penta-major-down', category: 'Pentatonics', name: 'Major pentatonic, descending', degrees: [12, 9, 7, 4, 2, 0], syllable: 'dah' },
  { id: 'penta-minor-down', category: 'Pentatonics', name: 'Minor pentatonic, descending', degrees: [12, 10, 7, 5, 3, 0], syllable: 'dah' },
  { id: 'penta-blues', category: 'Pentatonics', name: 'Blues scale, with the flat fifth', degrees: [0, 3, 5, 6, 7, 10, 12, 10, 7, 6, 5, 3, 0], syllable: 'yeah' },
  { id: 'penta-in-sen', category: 'Pentatonics', name: 'In sen, Japanese', degrees: [0, 1, 5, 7, 10, 12, 10, 7, 5, 1, 0], syllable: 'ah' },
  { id: 'penta-egyptian', category: 'Pentatonics', name: 'Egyptian, suspended', degrees: [0, 2, 5, 7, 10, 12, 10, 7, 5, 2, 0], syllable: 'ah' },

  // Arpeggios
  { id: 'arp-major', category: 'Arpeggios', name: 'Major 1-3-5-8-5-3-1', degrees: [0, 4, 7, 12, 7, 4, 0], syllable: 'noh' },
  { id: 'arp-minor', category: 'Arpeggios', name: 'Minor 1-b3-5-8-5-b3-1', degrees: [0, 3, 7, 12, 7, 3, 0], syllable: 'noh' },
  { id: 'arp-dominant-seventh', category: 'Arpeggios', name: 'Dominant seventh', degrees: [0, 4, 7, 10, 12, 10, 7, 4, 0], syllable: 'nay' },
  { id: 'arp-major-seventh', category: 'Arpeggios', name: 'Major seventh', degrees: [0, 4, 7, 11, 12, 11, 7, 4, 0], syllable: 'nay' },
  { id: 'arp-minor-seventh', category: 'Arpeggios', name: 'Minor seventh', degrees: [0, 3, 7, 10, 12, 10, 7, 3, 0], syllable: 'nay' },
  { id: 'arp-diminished', category: 'Arpeggios', name: 'Diminished', degrees: [0, 3, 6, 9, 12, 9, 6, 3, 0], syllable: 'mee' },
  { id: 'arp-augmented', category: 'Arpeggios', name: 'Augmented', degrees: [0, 4, 8, 12, 8, 4, 0], syllable: 'mee' },
  { id: 'arp-wide', category: 'Arpeggios', name: 'Wide 1-5-8-10-8-5-1', degrees: [0, 7, 12, 16, 12, 7, 0], syllable: 'woh' },
  { id: 'arp-ninth', category: 'Arpeggios', name: 'Ninth 1-3-5-7-9', degrees: [0, 4, 7, 11, 14, 11, 7, 4, 0], syllable: 'nay' },
  { id: 'arp-minor-short', category: 'Arpeggios', name: 'Minor 1-b3-5-b3-1', degrees: [0, 3, 7, 3, 0], syllable: 'mum' },

  // Intervals
  { id: 'int-octaves', category: 'Intervals', name: 'Octaves 1-8-1-8-1', degrees: [0, 12, 0, 12, 0], syllable: 'woh' },
  { id: 'int-fifths', category: 'Intervals', name: 'Fifths 1-5-1-5-1', degrees: [0, 7, 0, 7, 0], syllable: 'noo' },
  { id: 'int-leaps', category: 'Intervals', name: 'Leaps 1-5-2-6-3-7-4-8', degrees: [0, 7, 2, 9, 4, 11, 5, 12], syllable: 'lah' },
  { id: 'int-fall', category: 'Intervals', name: 'Fall 1-8-5-3-1', degrees: [0, 12, 7, 4, 0], syllable: 'oh' },
  { id: 'int-sixth', category: 'Intervals', name: 'Sixth 1-6-1', degrees: [0, 9, 0], syllable: 'mee' },
  { id: 'int-minor-seventh', category: 'Intervals', name: 'Minor seventh 1-b7-1', degrees: [0, 10, 0], syllable: 'mee' },
  { id: 'int-tritone', category: 'Intervals', name: 'Tritone 1-b5-1', degrees: [0, 6, 0], syllable: 'mee' },

  // Agility
  { id: 'agility-weave', category: 'Agility', name: '1-3-2-4-3-5-4-2-1', degrees: [0, 4, 2, 5, 4, 7, 5, 2, 0], syllable: 'lah' },
  { id: 'agility-turn', category: 'Agility', name: 'Turn 5-3-1-3-5', degrees: [7, 4, 0, 4, 7], syllable: 'dah' },
  { id: 'agility-gruppetto', category: 'Agility', name: 'Gruppetto 1-2-1-7-1', degrees: [0, 2, 0, -1, 0], syllable: 'lah' },
  { id: 'agility-riff', category: 'Agility', name: 'Riff 1-b3-4-5-4-b3-1', degrees: [0, 3, 5, 7, 5, 3, 0], syllable: 'yeah' },
  { id: 'agility-melisma', category: 'Agility', name: 'Melisma 8-7-6-5-6-7-8', degrees: [12, 11, 9, 7, 9, 11, 12], syllable: 'ah' },
  { id: 'agility-zigzag', category: 'Agility', name: 'Zigzag 1-5-3-7-5-8', degrees: [0, 7, 4, 11, 7, 12], syllable: 'dah' },

  // Modes
  { id: 'mode-dorian', category: 'Modes', name: 'Dorian', degrees: [0, 2, 3, 5, 7, 9, 10, 12, 10, 9, 7, 5, 3, 2, 0], syllable: 'ah' },
  { id: 'mode-phrygian', category: 'Modes', name: 'Phrygian', degrees: [0, 1, 3, 5, 7, 8, 10, 12, 10, 8, 7, 5, 3, 1, 0], syllable: 'ah' },
  { id: 'mode-lydian', category: 'Modes', name: 'Lydian', degrees: [0, 2, 4, 6, 7, 9, 11, 12, 11, 9, 7, 6, 4, 2, 0], syllable: 'ah' },
  { id: 'mode-mixolydian', category: 'Modes', name: 'Mixolydian', degrees: [0, 2, 4, 5, 7, 9, 10, 12, 10, 9, 7, 5, 4, 2, 0], syllable: 'ah' },
  { id: 'mode-locrian', category: 'Modes', name: 'Locrian', degrees: [0, 1, 3, 5, 6, 8, 10, 12, 10, 8, 6, 5, 3, 1, 0], syllable: 'ah' },
  { id: 'mode-phrygian-dominant', category: 'Modes', name: 'Phrygian dominant', degrees: [0, 1, 4, 5, 7, 8, 10, 12, 10, 8, 7, 5, 4, 1, 0], syllable: 'ah' },
  { id: 'mode-hungarian-minor', category: 'Modes', name: 'Hungarian minor', degrees: [0, 2, 3, 6, 7, 8, 11, 12, 11, 8, 7, 6, 3, 2, 0], syllable: 'ah' },

  // Chromatic
  { id: 'chromatic-five', category: 'Chromatic', name: 'Chromatic, five notes', degrees: [0, 1, 2, 3, 4, 3, 2, 1, 0], syllable: 'mee' },
  { id: 'chromatic-fifth', category: 'Chromatic', name: 'Chromatic up to the fifth', degrees: [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0], syllable: 'mee' },
  { id: 'chromatic-octave', category: 'Chromatic', name: 'Chromatic octave, ascending', degrees: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], syllable: 'ah' },

  // Classic vocalises
  /*
   * The most familiar exercise in vocal pedagogy, attributed to Rossini by
   * Heinrich Panofka in L'Art de Chanter (1853). Thirteen notes reaching a
   * twelfth above the tonic — the "octave and a half" it is usually called.
   * It climbs the tonic arpeggio and comes back down by steps and thirds, so
   * the descent is not the ascent reversed.
   *
   * Scale degrees 1 3 5 8 10 12 11 9 7 5 4 2 1 over the major scale, which is
   * the sequence below in semitones.
   */
  { id: 'rossini-scale', category: 'Arpeggios', name: 'Rossini scale, an octave and a half', degrees: [0, 4, 7, 12, 16, 19, 17, 14, 11, 7, 5, 2, 0], syllable: 'ah, legato' },

  // Sustains
  { id: 'sustain-fifth', category: 'Sustains', name: '1-2-3-4-5 with the fifth held', degrees: [0, 2, 4, 5, 7, 5, 4, 2, 0], beats: [1, 1, 1, 1, 5, 1, 1, 1, 1], syllable: 'nay' },
  { id: 'sustain-fifth-long', category: 'Sustains', name: '1-2-3-4-5 with a long fifth', degrees: [0, 2, 4, 5, 7, 5, 4, 2, 0], beats: [1, 1, 1, 1, 8, 1, 1, 1, 2], syllable: 'ah' },
  { id: 'sustain-landing', category: 'Sustains', name: '5-4-3-2-1 landing on a held tonic', degrees: [7, 5, 4, 2, 0], beats: [1, 1, 1, 1, 6], syllable: 'mee' },
  { id: 'sustain-arpeggio', category: 'Sustains', name: 'Arpeggio 1-3-5-8 with the octave held', degrees: [0, 4, 7, 12], beats: [1, 1, 1, 6], syllable: 'woh' },
  { id: 'sustain-octave', category: 'Sustains', name: 'Octave 1-8-1 with the top held', degrees: [0, 12, 0], beats: [1, 6, 2], syllable: 'woh' },
  { id: 'sustain-pentatonic', category: 'Sustains', name: 'Pentatonic with both ends held', degrees: [0, 2, 4, 7, 9, 7, 4, 2, 0], beats: [2, 1, 1, 1, 4, 1, 1, 1, 4], syllable: 'yah' },
  { id: 'sustain-messa-di-voce', category: 'Sustains', name: 'Messa di voce, one note', degrees: [0], beats: [12], syllable: 'ah, swell and fade' },
  { id: 'sustain-onset', category: 'Sustains', name: 'Clean onset 1 · 1 · 1 held', degrees: [0, 0, 0], beats: [1, 1, 6], syllable: 'hah / ah' },
];

export const PATTERN_CATEGORIES = [...new Set(PATTERN_LIBRARY.map((pattern) => pattern.category))];

/** Flattens a pattern into steps that always carry an explicit length. */
export const toSteps = (pattern) =>
  pattern.degrees.map((degree, index) => ({
    degree,
    beats: (pattern.beats && pattern.beats[index]) || 1,
  }));

/**
 * The highest root a pattern can be transposed to without its top note rising
 * above `highestNote`.
 *
 * A pattern wider than the singer's range returns a root below their lowest,
 * which is how "this exercise does not fit" is expressed: there is no root
 * that works, not merely a lower one. The Rossini scale reaches nineteen
 * semitones, so it does not fit every voice.
 */
export const highestUsableRoot = (pattern, highestNote) =>
  highestNote - Math.max(...pattern.degrees);

/** Total length of a pattern, counted in beats. */
export const countBeats = (steps) => steps.reduce((total, step) => total + step.beats, 0);

/** Comfortable starting ranges by voice type, as MIDI note numbers. */
export const VOICE_TYPES = [
  { id: 'soprano', name: 'Soprano', lowest: 60, highest: 79 },
  { id: 'mezzo-soprano', name: 'Mezzo-soprano', lowest: 57, highest: 76 },
  { id: 'alto', name: 'Alto', lowest: 55, highest: 72 },
  { id: 'tenor', name: 'Tenor', lowest: 48, highest: 67 },
  { id: 'baritone', name: 'Baritone', lowest: 45, highest: 64 },
  { id: 'bass', name: 'Bass', lowest: 43, highest: 60 },
];

export const PLAYBACK_MODES = [
  { id: 'guide', name: 'Guide', hint: 'The piano plays the whole pattern along with you.' },
  { id: 'echo', name: 'Echo', hint: 'The piano plays, then leaves you the same space to sing it back.' },
  { id: 'reference', name: 'Reference', hint: 'Only the tonic sounds. The pattern is yours to sing.' },
];

export const TRAVEL_DIRECTIONS = [
  { id: 'up', name: 'Up' },
  { id: 'down', name: 'Down' },
  { id: 'up-and-down', name: 'Up, then down' },
  { id: 'down-and-up', name: 'Down, then up' },
];
