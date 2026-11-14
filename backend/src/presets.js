// Synthesizer preset profiles
export const SYNTH_PRESETS = {
  ambient_pad: {
    id: 'ambient_pad',
    name: 'Ambient Pad',
    oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
    envelope: { attack: 0.6, decay: 0.8, sustain: 0.85, release: 1.4 },
    filterCutoff: 2200,
    reverbWet: 0.55
  },
  cyber_lead: {
    id: 'cyber_lead',
    name: 'Cyberpunk Lead',
    oscillator: { type: 'fatsquare', count: 2, spread: 15 },
    envelope: { attack: 0.08, decay: 0.3, sustain: 0.6, release: 0.8 },
    filterCutoff: 4500,
    reverbWet: 0.25
  },
  dreamy_keys: {
    id: 'dreamy_keys',
    name: 'Dreamy Keys',
    oscillator: { type: 'fattriangle', count: 2, spread: 20 },
    envelope: { attack: 0.02, decay: 0.9, sustain: 0.3, release: 1.2 },
    filterCutoff: 3000,
    reverbWet: 0.4
  },
  deep_bass: {
    id: 'deep_bass',
    name: 'Deep Bass & Organ',
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.05, decay: 0.2, sustain: 0.9, release: 0.6 },
    filterCutoff: 1200,
    reverbWet: 0.15
  }
};

