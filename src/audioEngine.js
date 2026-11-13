// Seamless Audio Engine powered by Tone.js
// Designed for gapless, smooth chord transitions and lush sustained synthesis

import * as Tone from 'tone';
import { noteToMidi } from './musicTheory.js';

export class AudioEngine {
  constructor() {
    this.isStarted = false;
    this.currentChordNotes = [];
    this.currentChordName = 'None';
    this.activeSynthBank = 0; // Alternates between 0 (Synth A) and 1 (Synth B)
    this.octave = 3;
    this.isMuted = false;
    this.midiOutput = null;

    // Presets configuration
    this.currentPreset = 'ambient_pad';
  }

  async init() {
    if (this.isStarted) return;
    await Tone.start();

    // Master Output Chain: Synths -> Filter -> Chorus -> Delay -> Reverb -> Limiter -> Destination
    this.limiter = new Tone.Limiter(-1).toDestination();
    
    this.reverb = new Tone.Reverb({
      decay: 3.5,
      preDelay: 0.03,
      wet: 0.35
    }).connect(this.limiter);
    // Prepare impulse response in background without blocking start
    this.reverb.generate().catch(err => console.warn('Reverb buffer notice:', err));

    this.delay = new Tone.FeedbackDelay({
      delayTime: '8n.',
      feedback: 0.22,
      wet: 0.18
    }).connect(this.reverb);

    this.chorus = new Tone.Chorus({
      frequency: 1.5,
      delayTime: 3.5,
      depth: 0.6,
      wet: 0.3
    }).connect(this.delay).start();

    this.filter = new Tone.Filter({
      frequency: 3200,
      type: 'lowpass',
      rolloff: -24
    }).connect(this.chorus);

    // Audio Analyser for visualizer
    this.analyser = new Tone.Analyser('waveform', 256);
    this.limiter.connect(this.analyser);

    // Create Dual PolySynth banks for 100% gapless cross-fade transitions
    this.synthA = this.createPolySynth();
    this.synthB = this.createPolySynth();

    this.synthA.connect(this.filter);
    this.synthB.connect(this.filter);

    this.isStarted = true;
    this.initMidi();
  }

  createPolySynth() {
    // Warm, lush polyphonic synth configured for smooth release & zero clicking
    return new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 16,
      options: {
        oscillator: {
          type: 'fatsawtooth',
          count: 3,
          spread: 20
        },
        envelope: {
          attack: 0.12,   // Gentle swell
          decay: 0.5,
          sustain: 0.85,  // Holds strong so music doesn't stop
          release: 1.8    // Long organic release tail to blend chords seamlessly
        }
      }
    });
  }

  setPreset(presetKey) {
    this.currentPreset = presetKey;
    if (!this.synthA || !this.synthB) return;

    const applyConfig = (synth) => {
      if (presetKey === 'ambient_pad') {
        synth.set({
          oscillator: { type: 'fatsawtooth', count: 3, spread: 25 },
          envelope: { attack: 0.15, decay: 0.4, sustain: 0.88, release: 2.2 }
        });
        this.filter.frequency.rampTo(2800, 0.5);
        this.reverb.wet.rampTo(0.42, 0.5);
      } else if (presetKey === 'electric_piano') {
        synth.set({
          oscillator: { type: 'fattriangle', count: 2, spread: 15 },
          envelope: { attack: 0.04, decay: 1.2, sustain: 0.5, release: 1.4 }
        });
        this.filter.frequency.rampTo(4500, 0.5);
        this.reverb.wet.rampTo(0.25, 0.5);
      } else if (presetKey === 'cyber_brass') {
        synth.set({
          oscillator: { type: 'fmsawtooth', modulationType: 'sine', modulationIndex: 1.5 },
          envelope: { attack: 0.08, decay: 0.6, sustain: 0.75, release: 1.2 }
        });
        this.filter.frequency.rampTo(3800, 0.5);
        this.reverb.wet.rampTo(0.3, 0.5);
      } else if (presetKey === 'celestial_bells') {
        synth.set({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.02, decay: 2.0, sustain: 0.4, release: 2.5 }
        });
        this.filter.frequency.rampTo(6000, 0.5);
        this.reverb.wet.rampTo(0.55, 0.5);
      }
    };

    applyConfig(this.synthA);
    applyConfig(this.synthB);
  }

  /**
   * Seamlessly transitions from old chord to new chord without cutting off sound.
   * Uses alternating PolySynth banks and overlapping release tails.
   */
  playChord(chordInfo) {
    if (!this.isStarted || this.isMuted) return;
    if (!chordInfo || !chordInfo.notes || chordInfo.notes.length === 0) return;

    const newChordNotes = chordInfo.notes;

    // Check if chord is already actively playing to prevent retrigger stutter
    if (this.currentChordNotes.length > 0 &&
        this.arraysEqual(this.currentChordNotes, newChordNotes)) {
      return;
    }

    const prevSynth = this.activeSynthBank === 0 ? this.synthA : this.synthB;
    const nextSynth = this.activeSynthBank === 0 ? this.synthB : this.synthA;

    // 1. Release previous chord notes gracefully into the reverb tail (no sudden stop!)
    if (this.currentChordNotes.length > 0) {
      try {
        prevSynth.releaseAll();
      } catch (e) {
        // Safe catch for Tone.js voice release
      }
    }

    // 2. Trigger new chord on the alternative synth bank
    try {
      nextSynth.triggerAttack(newChordNotes, Tone.now(), 0.75);
    } catch (e) {
      console.warn('Note trigger error:', e);
    }

    // 3. Switch active bank
    this.activeSynthBank = this.activeSynthBank === 0 ? 1 : 0;
    this.sendMidiChord(this.currentChordNotes, newChordNotes);
    this.currentChordNotes = [...newChordNotes];
    this.currentChordName = chordInfo.chordName;
  }

  stopChord() {
    if (!this.isStarted) return;
    if (this.synthA) this.synthA.releaseAll();
    if (this.synthB) this.synthB.releaseAll();
    if (this.midiOutput && this.currentChordNotes.length > 0) {
      this.currentChordNotes.forEach(note => {
        const midiNum = noteToMidi(note);
        this.midiOutput.send([0x80, midiNum, 0]);
      });
    }
    this.currentChordNotes = [];
    this.currentChordName = 'Rest';
  }

  /**
   * Modulate filter cutoff (e.g. from hand height or distance)
   * Normalized value 0.0 .. 1.0
   */
  setFilterModulation(normalizedVal) {
    if (!this.filter) return;
    // Map 0..1 to 400Hz .. 8000Hz logarithmically
    const minFreq = 400;
    const maxFreq = 9000;
    const targetFreq = minFreq * Math.pow(maxFreq / minFreq, Math.max(0, Math.min(1, normalizedVal)));
    this.filter.frequency.rampTo(targetFreq, 0.08);
  }

  setVolume(volumeDb) {
    if (this.limiter) {
      Tone.Destination.volume.rampTo(volumeDb, 0.05);
    }
  }

  setOctave(oct) {
    this.octave = Math.max(1, Math.min(5, oct));
  }

  getWaveformData() {
    if (!this.analyser) return new Float32Array(256);
    return this.analyser.getValue();
  }

  // Web MIDI Output Integration
  async initMidi() {
    if (navigator.requestMIDIAccess) {
      try {
        const midiAccess = await navigator.requestMIDIAccess();
        const outputs = Array.from(midiAccess.outputs.values());
        if (outputs.length > 0) {
          this.midiOutput = outputs[0];
          console.log('Connected to MIDI device:', this.midiOutput.name);
        }
      } catch (err) {
        console.warn('Web MIDI not available or permission denied', err);
      }
    }
  }

  sendMidiChord(oldNotes, newNotes) {
    if (!this.midiOutput) return;
    // Note Off for old notes
    oldNotes.forEach(note => {
      const midi = noteToMidi(note);
      this.midiOutput.send([0x80, midi, 0]); // Note off, channel 1
    });
    // Note On for new notes
    newNotes.forEach(note => {
      const midi = noteToMidi(note);
      this.midiOutput.send([0x90, midi, 90]); // Note on, channel 1, vel 90
    });
  }

  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}
