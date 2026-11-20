import React from 'react';
import SynthBirdAvatar from './SynthBirdAvatar.jsx';
import RotaryKnob from './RotaryKnob.jsx';
import { BUILT_IN_SOUNDS, QUALITY_WORDS } from '../sounds.js';

export default function OledCompanionDeck({
  isRunning,
  keyboardMode,
  reducedMotion,
  rootNote,
  chordData,
  activeNotes,
  oledWaveCanvasRef,
  birdMode,
  chordQuality,
  isSharp,
  cutoffNorm,
  cutoffHz,
  octave,
  activeSound,
  customSounds,
  onSelectBuiltIn,
  onSelectCustomSound,
  onOpenRecorder,
  onCutoffChange,
  reverbWet,
  onReverbChange,
  volumeDb,
  onVolumeChange,
  onOctaveChange
}) {
  const activeSoundLabel =
    activeSound.type === 'custom'
      ? customSounds.find((s) => s.id === activeSound.id)?.name || 'Custom Sound'
      : BUILT_IN_SOUNDS[activeSound.id]?.name || 'Silk Pad';

  const liveAnnouncement =
    rootNote && chordData
      ? `${chordData.actualRoot} ${QUALITY_WORDS[chordQuality] || chordQuality}`
      : '';

  return (
    <aside className="hw-module hw-right-deck" aria-label="Now playing and quick controls">
      {/* Screen-reader polite chord announcement */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <div className="hw-module-header">
        <span className="hw-section-title">NOW PLAYING</span>
        <span className="hw-section-tag mono-val">{activeSoundLabel}</span>
      </div>

      {/* Recessed OLED Screen — Single Dedicated Home for the Bird Avatar */}
      <div className="hw-oled-screen">
        <span className="oled-screw tl" aria-hidden="true" />
        <span className="oled-screw tr" aria-hidden="true" />
        <span className="oled-screw bl" aria-hidden="true" />
        <span className="oled-screw br" aria-hidden="true" />

        <div className="oled-left-info">
          <div className="oled-status-line mono-val">
            <span className={`oled-dot ${rootNote ? 'live' : 'mute'}`} aria-hidden="true" />
            <span>
              {!isRunning && !keyboardMode
                ? 'READY TO START'
                : rootNote
                  ? activeSound.type === 'custom'
                    ? `MY SOUND · ${activeSoundLabel.toUpperCase()}`
                    : `PLAYING · ${activeSoundLabel.toUpperCase()}`
                  : 'STOPPED · MAKE A FIST OR PRESS 0'}
            </span>
          </div>

          <div className={`oled-chord-huge ${!rootNote && (isRunning || keyboardMode) ? 'is-muted' : ''}`}>
            {!isRunning && !keyboardMode
              ? 'READY'
              : chordData
                ? chordData.chordName
                : 'Stopped'}
          </div>

          <div className="oled-notes-line mono-val">
            {activeNotes.length > 0
              ? activeNotes.join(' · ')
              : 'Raise 1–5 fingers or press keys 1–7'}
          </div>

          <canvas ref={oledWaveCanvasRef} className="oled-wave-canvas" aria-hidden="true" />
        </div>

        {/* 3D Bird Companion */}
        <div className="oled-bird-bay" aria-hidden="true">
          <SynthBirdAvatar
            mode={birdMode}
            rootNote={rootNote}
            chordQuality={chordQuality}
            isSharp={isSharp}
            cutoffNormalized={cutoffNorm}
            octave={octave}
            scale={0.58}
            reducedMotion={reducedMotion}
          />
        </div>
      </div>

      {/* Quick Sound Switcher + Record New Sound Button */}
      <div className="hw-sub-divider">
        <span>SOUND</span>
      </div>
      <div className="quick-sound-bar">
        <select
          className="hw-sound-select"
          aria-label="Select instrument sound"
          value={`${activeSound.type}:${activeSound.id}`}
          onChange={(e) => {
            const [type, id] = e.target.value.split(':');
            if (type === 'custom') onSelectCustomSound(id);
            else onSelectBuiltIn(id);
          }}
        >
          <optgroup label="Built-in Instruments">
            {Object.entries(BUILT_IN_SOUNDS).map(([id, s]) => (
              <option key={id} value={`builtin:${id}`}>
                {s.name} — {s.description}
              </option>
            ))}
          </optgroup>
          {customSounds.length > 0 && (
            <optgroup label="My Recorded Sounds (Autotuned C–B)">
              {customSounds.map((s) => (
                <option key={s.id} value={`custom:${s.id}`}>
                  ★ {s.name} (tuned from {s.rootNote})
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <button
          type="button"
          className="hw-record-pill-btn"
          onClick={onOpenRecorder}
          title="Record your voice or any sound and autotune it to C D E F G A B"
        >
          <span className="rec-dot" aria-hidden="true" />
          <span>Record sound</span>
        </button>
      </div>

      {/* 3 Plain-Language Quick Controls + Octave */}
      <div className="hw-sub-divider">
        <span>QUICK CONTROLS</span>
      </div>
      <div className="hw-quick-controls-row">
        <RotaryKnob
          label="TONE"
          displayValue={`${(cutoffHz / 1000).toFixed(1)}kHz`}
          value={cutoffNorm}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.65}
          accentColor="#ff9f43"
          onChange={onCutoffChange}
        />
        <RotaryKnob
          label="SPACE"
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
          label="VOLUME"
          displayValue={`${volumeDb}dB`}
          value={volumeDb}
          min={-30}
          max={4}
          step={1}
          defaultValue={-2}
          accentColor="#f4f1ea"
          onChange={onVolumeChange}
        />

        <div className="quick-octave-box">
          <span className="hw-knob-label">OCTAVE</span>
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
    </aside>
  );
}
