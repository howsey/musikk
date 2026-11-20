import React, { useState } from 'react';
import RotaryKnob from './RotaryKnob.jsx';
import { BUILT_IN_SOUNDS } from '../sounds.js';

export default function DspMatrixView({
  active,
  activeSound,
  cutoffNorm,
  cutoffHz,
  onCutoffChange,
  chorusWet,
  onChorusChange,
  delayWet,
  onDelayChange,
  reverbWet,
  onReverbChange,
  volumeDb,
  onVolumeChange,
  octave,
  onOctaveChange,
  adsrCanvasRef,
  filterCanvasRef,
  vuLeftRef,
  vuRightRef,
  activeBank,
  midiName
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const builtInMeta =
    BUILT_IN_SOUNDS[activeSound.id] || BUILT_IN_SOUNDS.ambient_pad;
  const env = builtInMeta.synth.envelope;

  return (
    <main className={`hw-view ${active ? 'active' : ''}`} aria-label="Tune sound">
      {/* Primary Simple Sound-Shaping Rack */}
      <section className="hw-module hw-pad">
        <div className="hw-module-header">
          <span className="hw-section-title">TONE &amp; EFFECTS</span>
          <span className="hw-section-tag mono-val">DRAG, SCROLL OR USE ARROW KEYS</span>
        </div>

        <div className="tune-knobs-bar">
          <RotaryKnob
            label="TONE (CUTOFF)"
            displayValue={`${cutoffHz} Hz`}
            value={cutoffNorm}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.65}
            accentColor="#ff9f43"
            onChange={onCutoffChange}
          />
          <RotaryKnob
            label="CHORUS"
            displayValue={`${Math.round(chorusWet * 100)}%`}
            value={chorusWet}
            min={0}
            max={1}
            step={0.02}
            defaultValue={0.3}
            accentColor="#97affd"
            onChange={onChorusChange}
          />
          <RotaryKnob
            label="ECHO (DELAY)"
            displayValue={`${Math.round(delayWet * 100)}%`}
            value={delayWet}
            min={0}
            max={0.7}
            step={0.02}
            defaultValue={0.18}
            accentColor="#97affd"
            onChange={onDelayChange}
          />
          <RotaryKnob
            label="SPACE (REVERB)"
            displayValue={`${Math.round(reverbWet * 100)}%`}
            value={reverbWet}
            min={0}
            max={0.85}
            step={0.02}
            defaultValue={0.35}
            accentColor="#97affd"
            onChange={onReverbChange}
          />
          <RotaryKnob
            label="MASTER VOLUME"
            displayValue={`${volumeDb} dB`}
            value={volumeDb}
            min={-30}
            max={4}
            step={1}
            defaultValue={-2}
            accentColor="#f4f1ea"
            onChange={onVolumeChange}
          />

          <div className="quick-octave-box">
            <span className="hw-knob-label">BASE OCTAVE</span>
            <div className="quick-octave-btns">
              <button
                type="button"
                className="hw-mini-oct-btn"
                onClick={() => onOctaveChange(octave - 1)}
                aria-label="Decrease octave"
              >
                −
              </button>
              <strong className="mono-val">{octave}</strong>
              <button
                type="button"
                className="hw-mini-oct-btn"
                onClick={() => onOctaveChange(octave + 1)}
                aria-label="Increase octave"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Progressive Disclosure: Advanced Envelope, Filter Response & Output Bus */}
      <section className="hw-module hw-pad">
        <div className="hw-module-header">
          <span className="hw-section-title">ADVANCED STUDIO DIAGNOSTICS (ENVELOPE, FILTER &amp; MIDI)</span>
          <button
            type="button"
            className="hw-secondary-btn"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? 'Hide advanced details' : 'Show envelope, filter curve & VU meters'}
          </button>
        </div>

        {showAdvanced && (
          <div className="hw-dsp-grid">
            <div className="dsp-graphs-row">
              <div className="dsp-graph-frame">
                <canvas ref={adsrCanvasRef} className="dsp-canvas" />
                <div className="dsp-graph-foot mono-val">
                  Envelope — ATK {env.attack}s · DEC {env.decay}s · SUS {env.sustain} · REL{' '}
                  {env.release}s
                </div>
              </div>
              <div className="dsp-graph-frame">
                <canvas ref={filterCanvasRef} className="dsp-canvas" />
                <div className="dsp-graph-foot mono-val freq-row">
                  <span>20Hz</span>
                  <span>200Hz</span>
                  <span>1kHz</span>
                  <span>10kHz</span>
                  <span>20kHz</span>
                </div>
              </div>
            </div>

            <div className="dsp-output-bus">
              <div className="hw-vu-box" aria-label="Stereo output level meter">
                <div className="hw-vu-col">
                  <div className="hw-vu-segments" ref={vuLeftRef}>
                    {Array.from({ length: 16 }, (_, sIdx) => (
                      <span key={sIdx} className="hw-vu-seg" />
                    ))}
                  </div>
                  <span className="mono-val">L</span>
                </div>
                <div className="hw-vu-col">
                  <div className="hw-vu-segments" ref={vuRightRef}>
                    {Array.from({ length: 16 }, (_, sIdx) => (
                      <span key={sIdx} className="hw-vu-seg" />
                    ))}
                  </div>
                  <span className="mono-val">R</span>
                </div>
              </div>

              <div className="dsp-bus-details mono-val">
                <div className="bus-row">
                  <span>ACTIVE VOICE ENGINE</span>
                  <strong>
                    {activeSound.type === 'custom'
                      ? 'CHROMATIC SAMPLER'
                      : `POLY BANK ${activeBank === 0 ? 'A' : 'B'}`}
                  </strong>
                </div>
                <div className="bus-row">
                  <span>MIDI OUTPUT</span>
                  <strong>{midiName}</strong>
                </div>
                <div className="bus-row">
                  <span>SIGNAL CHAIN</span>
                  <strong>Voice → Lowpass → Chorus → Delay → Reverb → Limiter</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
