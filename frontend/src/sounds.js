// Built-in instrument definitions + shared music vocabulary used by the UI.

export const BUILT_IN_SOUNDS = {
  ambient_pad: {
    name: 'Silk Pad',
    description: 'Warm, slow pad',
    glyph: 'pad',
    synth: {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 25 },
      envelope: { attack: 0.15, decay: 0.4, sustain: 0.88, release: 2.2 }
    },
    cutoff: 2800,
    reverb: 0.42
  },
  electric_piano: {
    name: 'Soft Keys',
    description: 'Mellow electric piano',
    glyph: 'keys',
    synth: {
      oscillator: { type: 'fattriangle', count: 2, spread: 15 },
      envelope: { attack: 0.04, decay: 1.2, sustain: 0.5, release: 1.4 }
    },
    cutoff: 4500,
    reverb: 0.25
  },
  nylon_guitar: {
    name: 'Guitar',
    description: 'Plucked nylon strings',
    glyph: 'guitar',
    synth: {
      oscillator: { type: 'fattriangle', count: 2, spread: 8 },
      envelope: { attack: 0.005, decay: 1.4, sustain: 0.04, release: 1.1 }
    },
    cutoff: 3600,
    reverb: 0.22,
    strum: true
  },
  sub_bass: {
    name: 'Bass',
    description: 'Deep round bass',
    glyph: 'bass',
    synth: {
      oscillator: { type: 'fatsquare', count: 2, spread: 6 },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.5 }
    },
    cutoff: 900,
    reverb: 0.1,
    transpose: -12,
    voicing: 'roots'
  },
  cyber_brass: {
    name: 'Brass',
    description: 'Bright analog brass',
    glyph: 'brass',
    synth: {
      oscillator: { type: 'fmsawtooth', modulationType: 'sine', modulationIndex: 1.5 },
      envelope: { attack: 0.08, decay: 0.6, sustain: 0.75, release: 1.2 }
    },
    cutoff: 3800,
    reverb: 0.3
  },
  celestial_bells: {
    name: 'Bell',
    description: 'Clear chime with echo',
    glyph: 'bell',
    synth: {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 2.0, sustain: 0.4, release: 2.5 }
    },
    cutoff: 6000,
    reverb: 0.55
  }
};

export const DEFAULT_SOUND = { type: 'builtin', id: 'ambient_pad' };

export const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Keyboard play mode: Q W E R T map to the same chord types as the right hand.
export const QUALITY_KEYS = {
  q: { quality: 'Major', isSharp: false },
  w: { quality: 'Major', isSharp: true },
  e: { quality: 'Minor', isSharp: false },
  r: { quality: 'Maj7', isSharp: false },
  t: { quality: 'Min7', isSharp: false }
};

export const QUALITY_LABELS = {
  Major: 'maj',
  Minor: 'min',
  Maj7: 'maj7',
  Min7: 'min7'
};

export const QUALITY_WORDS = {
  Major: 'major',
  Minor: 'minor',
  Maj7: 'major 7',
  Min7: 'minor 7'
};

export const SOUND_COLORS = [
  { id: 'periwinkle', label: 'Periwinkle', value: '#97affd' },
  { id: 'amber', label: 'Amber', value: '#ff9f43' },
  { id: 'ivory', label: 'Ivory', value: '#f4f1ea' },
  { id: 'steel', label: 'Steel', value: '#8592ab' }
];

export function cutoffToNorm(hz) {
  return Math.log(hz / 400) / Math.log(9000 / 400);
}

export function normToCutoff(norm) {
  return Math.round(400 * Math.pow(9000 / 400, Math.max(0, Math.min(1, norm))));
}
