// Audio engine (Tone.js)
// - Built-in instruments: dual PolySynth banks for gapless chord changes
// - Custom sounds: a single recorded clip loaded into a Tone.Sampler, which re-pitches it to every note

import * as Tone from 'tone';
import { noteToMidi } from './musicTheory.js';
import { BUILT_IN_SOUNDS } from './sounds.js';

export class AudioEngine {
  constructor() {
    this.isStarted = false;
    this.currentChordNotes = [];
    this.currentChordName = 'None';
    this.activeSynthBank = 0;
    this.octave = 3;
    this.midiOutput = null;

    this.currentPreset = 'ambient_pad';
    this.sourceType = 'builtin';
    this.customSampler = null;
    this.previewCache = { key: null, sampler: null };

    this.currentCutoffHz = 3200;
    this.currentReverbWet = 0.35;
    this.currentChorusWet = 0.3;
    this.currentDelayWet = 0.18;
    this.currentVolumeDb = -2;
  }

  async init() {
    if (this.isStarted) return;
    await Tone.start();

    // Synths -> Filter -> Chorus -> Delay -> Reverb -> Limiter -> Destination
    this.limiter = new Tone.Limiter(-1).toDestination();

    this.reverb = new Tone.Reverb({ decay: 3.5, preDelay: 0.03, wet: this.currentReverbWet }).connect(this.limiter);
    this.reverb.generate().catch((err) => console.warn('Reverb buffer notice:', err));

    this.delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.22, wet: this.currentDelayWet }).connect(this.reverb);
    this.chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.6, wet: this.currentChorusWet })
      .connect(this.delay)
      .start();
    this.filter = new Tone.Filter({ frequency: this.currentCutoffHz, type: 'lowpass', rolloff: -24 }).connect(this.chorus);

    this.analyser = new Tone.Analyser('waveform', 256);
    this.meter = new Tone.Meter({ channels: 2, smoothing: 0.75 });
    this.limiter.connect(this.analyser);
    this.limiter.connect(this.meter);

    this.synthA = this.createPolySynth();
    this.synthB = this.createPolySynth();
    this.synthA.connect(this.filter);
    this.synthB.connect(this.filter);

    Tone.Destination.volume.value = this.currentVolumeDb;

    this.isStarted = true;
    this.applyBuiltInVoice(this.currentPreset);
    this.initMidi();
  }

  createPolySynth(config = BUILT_IN_SOUNDS.ambient_pad.synth) {
    return new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 16,
      options: config
    });
  }

  applyBuiltInVoice(presetKey) {
    const sound = BUILT_IN_SOUNDS[presetKey];
    if (!sound || !this.synthA) return;
    this.synthA.set(sound.synth);
    this.synthB.set(sound.synth);
  }

  // ---------------------------------------------------------------------------
  // Sound source selection
  // ---------------------------------------------------------------------------
  setPreset(presetKey) {
    const sound = BUILT_IN_SOUNDS[presetKey];
    if (!sound) return;
    this.currentPreset = presetKey;
    this.sourceType = 'builtin';
    this.currentCutoffHz = sound.cutoff;
    this.currentReverbWet = sound.reverb;
    if (!this.isStarted) return;

    this.releaseAllVoices();
    this.applyBuiltInVoice(presetKey);
    this.filter.frequency.rampTo(sound.cutoff, 0.4);
    this.reverb.wet.rampTo(sound.reverb, 0.4);
  }

  async loadCustomSound({ buffer, rootNote }) {
    if (!this.isStarted) throw new Error('Audio is not running yet.');
    this.releaseAllVoices();
    if (this.customSampler) {
      this.customSampler.dispose();
      this.customSampler = null;
    }
    this.customSampler = new Tone.Sampler({
      urls: { [rootNote]: new Tone.ToneAudioBuffer(buffer) },
      attack: 0.01,
      release: 1.2
    }).connect(this.filter);
    await Tone.loaded();
    this.sourceType = 'custom';
  }

  releaseAllVoices() {
    try {
      this.synthA?.releaseAll();
      this.synthB?.releaseAll();
      this.customSampler?.releaseAll();
    } catch (e) {
      // ignore voice release race conditions
    }
    this.currentChordNotes = [];
  }

  // Built-in instruments can transpose (bass) or thin out the voicing.
  getVoicedNotes(notes) {
    if (this.sourceType !== 'builtin') return notes;
    const sound = BUILT_IN_SOUNDS[this.currentPreset];
    let voiced = notes;
    if (sound?.voicing === 'roots') voiced = notes.slice(0, 2);
    if (sound?.transpose) {
      voiced = voiced.map((n) => Tone.Frequency(n).transpose(sound.transpose).toNote());
    }
    return voiced;
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------
  playChord(chordInfo) {
    if (!this.isStarted) return;
    if (!chordInfo || !chordInfo.notes || chordInfo.notes.length === 0) return;

    const notes = this.getVoicedNotes(chordInfo.notes);
    if (this.currentChordNotes.length > 0 && this.arraysEqual(this.currentChordNotes, notes)) return;

    const now = Tone.now();

    if (this.sourceType === 'custom' && this.customSampler) {
      try {
        this.customSampler.releaseAll(now);
        this.customSampler.triggerAttack(notes, now + 0.01, 0.8);
      } catch (e) {
        console.warn('Sampler trigger error:', e);
      }
    } else {
      const prevSynth = this.activeSynthBank === 0 ? this.synthA : this.synthB;
      const nextSynth = this.activeSynthBank === 0 ? this.synthB : this.synthA;
      try {
        if (this.currentChordNotes.length > 0) prevSynth.releaseAll();
        const sound = BUILT_IN_SOUNDS[this.currentPreset];
        if (sound?.strum) {
          notes.forEach((n, i) => nextSynth.triggerAttack(n, now + i * 0.028, 0.75));
        } else {
          nextSynth.triggerAttack(notes, now, 0.75);
        }
      } catch (e) {
        console.warn('Note trigger error:', e);
      }
      this.activeSynthBank = this.activeSynthBank === 0 ? 1 : 0;
    }

    this.sendMidiChord(this.currentChordNotes, notes);
    this.currentChordNotes = [...notes];
    this.currentChordName = chordInfo.chordName;
  }

  stopChord() {
    if (!this.isStarted) return;
    const playing = this.currentChordNotes;
    this.releaseAllVoices();
    if (this.midiOutput && playing.length > 0) {
      playing.forEach((note) => this.midiOutput.send([0x80, noteToMidi(note), 0]));
    }
    this.currentChordName = 'Rest';
  }

  // Short audition of a built-in sound without changing the selection.
  previewBuiltIn(presetKey) {
    if (!this.isStarted) return;
    const sound = BUILT_IN_SOUNDS[presetKey];
    if (!sound) return;
    const synth = this.createPolySynth(sound.synth).connect(this.filter);
    let notes = ['C4', 'E4', 'G4'];
    if (sound.voicing === 'roots') notes = ['C3', 'C4'];
    if (sound.transpose) notes = notes.map((n) => Tone.Frequency(n).transpose(sound.transpose).toNote());
    const now = Tone.now();
    notes.forEach((n, i) => synth.triggerAttackRelease(n, 0.9, now + (sound.strum ? i * 0.028 : 0), 0.7));
    setTimeout(() => synth.dispose(), 4500);
  }

  // Audition a recorded clip at the given notes (used by the recorder and the sound library).
  previewBuffer(buffer, rootNote, notes, cacheKey) {
    if (!this.isStarted) return;
    if (this.previewCache.key !== cacheKey || !this.previewCache.sampler) {
      this.previewCache.sampler?.dispose();
      this.previewCache = {
        key: cacheKey,
        sampler: new Tone.Sampler({
          urls: { [rootNote]: new Tone.ToneAudioBuffer(buffer) },
          release: 0.8
        }).connect(this.filter)
      };
    }
    try {
      this.previewCache.sampler.triggerAttackRelease(notes, 0.9, Tone.now(), 0.8);
    } catch (e) {
      console.warn('Preview error:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Parameters
  // ---------------------------------------------------------------------------
  setFilterModulation(normalizedVal) {
    const clamped = Math.max(0, Math.min(1, normalizedVal));
    const targetFreq = 400 * Math.pow(9000 / 400, clamped);
    this.currentCutoffHz = Math.round(targetFreq);
    if (this.filter) this.filter.frequency.rampTo(targetFreq, 0.08);
    return this.currentCutoffHz;
  }

  setReverbWet(val) {
    this.currentReverbWet = Math.max(0, Math.min(1, val));
    if (this.reverb) this.reverb.wet.rampTo(this.currentReverbWet, 0.1);
  }

  setChorusWet(val) {
    this.currentChorusWet = Math.max(0, Math.min(1, val));
    if (this.chorus) this.chorus.wet.rampTo(this.currentChorusWet, 0.1);
  }

  setDelayWet(val) {
    this.currentDelayWet = Math.max(0, Math.min(1, val));
    if (this.delay) this.delay.wet.rampTo(this.currentDelayWet, 0.1);
  }

  setVolume(volumeDb) {
    this.currentVolumeDb = volumeDb;
    if (this.isStarted) Tone.Destination.volume.rampTo(volumeDb, 0.05);
  }

  setOctave(oct) {
    this.octave = Math.max(1, Math.min(5, oct));
  }

  // ---------------------------------------------------------------------------
  // Read-outs
  // ---------------------------------------------------------------------------
  getWaveformData() {
    if (!this.analyser) return null;
    return this.analyser.getValue();
  }

  getMeterLevels() {
    if (!this.meter || !this.isStarted) return [-60, -60];
    const val = this.meter.getValue();
    if (Array.isArray(val) && val.length >= 2) {
      return [Number.isFinite(val[0]) ? val[0] : -60, Number.isFinite(val[1]) ? val[1] : -60];
    }
    const mono = Number.isFinite(val) ? val : -60;
    return [mono, mono];
  }

  getMidiStatus() {
    return this.midiOutput ? `${this.midiOutput.name} (channel 1)` : 'No MIDI device';
  }

  getActiveBank() {
    return this.activeSynthBank;
  }

  // ---------------------------------------------------------------------------
  // Web MIDI output
  // ---------------------------------------------------------------------------
  async initMidi() {
    if (!navigator.requestMIDIAccess) return;
    try {
      const midiAccess = await navigator.requestMIDIAccess();
      const outputs = Array.from(midiAccess.outputs.values());
      if (outputs.length > 0) this.midiOutput = outputs[0];
    } catch (err) {
      console.warn('Web MIDI not available or permission denied', err);
    }
  }

  sendMidiChord(oldNotes, newNotes) {
    if (!this.midiOutput) return;
    oldNotes.forEach((note) => this.midiOutput.send([0x80, noteToMidi(note), 0]));
    newNotes.forEach((note) => this.midiOutput.send([0x90, noteToMidi(note), 90]));
  }

  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
}
