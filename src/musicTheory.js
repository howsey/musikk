// Music Theory & Chord Generator for Gesture Synth

// Semitone offsets from C
const NOTE_SEMITONES = {
  'C': 0, 'C#': 1, 'Db': 1,
  'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4,
  'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8,
  'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11
};

const SEMITONE_TO_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Chord Intervals relative to root
export const CHORD_INTERVALS = {
  'Major': [0, 4, 7],           // Root, Maj3rd, 5th
  'Minor': [0, 3, 7],           // Root, Min3rd, 5th
  'Maj7':  [0, 4, 7, 11],       // Root, Maj3rd, 5th, Maj7th
  'Min7':  [0, 3, 7, 10],       // Root, Min3rd, 5th, Min7th
};

/**
 * Returns the sharp version of a root note
 */
export function getSharpRoot(root) {
  const sharps = {
    'C': 'C#',
    'D': 'D#',
    'E': 'F',   // E# is enharmonically F
    'F': 'F#',
    'G': 'G#',
    'A': 'A#',
    'B': 'C'    // B# is enharmonically C
  };
  return sharps[root] || root;
}

/**
 * Given root note, sharp modifier, chord quality, and base octave,
 * returns array of note names with octaves (e.g., ["C3", "C4", "E4", "G4"])
 */
export function getChordNotes(root, isSharp, quality, baseOctave = 3) {
  if (!root) return [];

  const actualRoot = isSharp ? getSharpRoot(root) : root;
  const intervals = CHORD_INTERVALS[quality] || CHORD_INTERVALS['Major'];
  const rootSemitone = NOTE_SEMITONES[actualRoot];

  if (rootSemitone === undefined) return [];

  const chordNotes = [];

  // Add rich root bass note (one octave below baseOctave)
  const bassOctave = baseOctave;
  chordNotes.push(`${actualRoot}${bassOctave}`);

  // Add chord voicing notes in (baseOctave + 1)
  const chordOctave = baseOctave + 1;
  for (const interval of intervals) {
    const totalSemitone = rootSemitone + interval;
    const noteIndex = totalSemitone % 12;
    const noteName = SEMITONE_TO_NOTE[noteIndex];
    const octaveOffset = Math.floor(totalSemitone / 12);
    chordNotes.push(`${noteName}${chordOctave + octaveOffset}`);
  }

  return {
    chordName: `${actualRoot} ${quality}`,
    actualRoot,
    quality,
    notes: chordNotes
  };
}

/**
 * Convert note name (e.g. "C4") to MIDI note number (60)
 */
export function noteToMidi(noteStr) {
  const match = noteStr.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!match) return 60;
  const noteName = match[1];
  const octave = parseInt(match[2], 10);
  const semitone = NOTE_SEMITONES[noteName] || 0;
  return (octave + 1) * 12 + semitone;
}
