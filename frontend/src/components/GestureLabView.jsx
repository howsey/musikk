import React, { useState } from 'react';

const LEFT_GESTURE_ROWS = [
  { key: 'REST', fingers: 'Fist (0 fingers)', keyHint: '0', label: 'Stop sound', isRest: true },
  { key: 'C', fingers: '1 finger (Index)', keyHint: '1', label: 'C' },
  { key: 'D', fingers: '2 fingers (Index + Middle)', keyHint: '2', label: 'D' },
  { key: 'E', fingers: '3 fingers (Index + Mid + Ring)', keyHint: '3', label: 'E' },
  { key: 'F', fingers: '4 fingers (All except Thumb)', keyHint: '4', label: 'F' },
  { key: 'G', fingers: '5 fingers (Open hand)', keyHint: '5', label: 'G' },
  { key: 'A', fingers: 'Thumb only', keyHint: '6', label: 'A' },
  { key: 'B', fingers: 'Thumb + Index', keyHint: '7', label: 'B' }
];

const RIGHT_GESTURE_ROWS = [
  { key: 'Major', fingers: '1 finger (Index)', keyHint: 'Q', label: 'Major (bright, happy)' },
  { key: 'Sharp', fingers: '2 fingers (Index + Middle)', keyHint: 'W', label: 'Sharp # (raise root +1 semitone)' },
  { key: 'Minor', fingers: '3 fingers', keyHint: 'E', label: 'Minor (warm, moody)' },
  { key: 'Maj7', fingers: '4 fingers (No thumb)', keyHint: 'R', label: 'Major 7 (jazzy, dreamy)' },
  { key: 'Min7', fingers: '5 fingers (Open hand)', keyHint: 'T', label: 'Minor 7 (neo-soul, smooth)' }
];

const CHALLENGES = [
  { title: 'Play C Major', root: 'C', qualityKey: 'Major', leftHint: '1 finger (Index)', rightHint: '1 finger (Index)' },
  { title: 'Play D Minor', root: 'D', qualityKey: 'Minor', leftHint: '2 fingers (Index + Mid)', rightHint: '3 fingers' },
  { title: 'Play F Major 7', root: 'F', qualityKey: 'Maj7', leftHint: '4 fingers (no thumb)', rightHint: '4 fingers' },
  { title: 'Play A Minor 7', root: 'A', qualityKey: 'Min7', leftHint: 'Thumb only', rightHint: '5 fingers (open hand)' },
  { title: 'Stop the sound', root: null, qualityKey: null, leftHint: 'Make a closed fist', rightHint: 'Any' }
];

export default function GestureLabView({
  active,
  rootNote,
  activeQualityKey,
  swapHands,
  onTriggerPracticeChord
}) {
  const [challengeIdx, setChallengeIdx] = useState(0);
  const challenge = CHALLENGES[challengeIdx];

  const rootMatch = challenge.root === null ? rootNote === null : rootNote === challenge.root;
  const qualityMatch = challenge.qualityKey === null ? true : activeQualityKey === challenge.qualityKey;
  const challengeDone = rootMatch && qualityMatch;

  return (
    <main className={`hw-view ${active ? 'active' : ''}`} aria-label="Learn gestures">
      {/* Interactive Practice Challenge Banner */}
      <section className="hw-module hw-pad practice-banner">
        <div className="practice-left">
          <span className="practice-tag mono-val">
            INTERACTIVE PRACTICE ({challengeIdx + 1}/{CHALLENGES.length})
          </span>
          <h2 className="practice-title">{challenge.title}</h2>
          <div className="practice-checks">
            <span className={`p-check ${rootMatch ? 'ok' : ''}`}>
              {rootMatch ? '✓' : '○'} {swapHands ? 'Right' : 'Left'} hand: {challenge.leftHint}
            </span>
            <span className={`p-check ${qualityMatch ? 'ok' : ''}`}>
              {qualityMatch ? '✓' : '○'} {swapHands ? 'Left' : 'Right'} hand: {challenge.rightHint}
            </span>
          </div>
        </div>

        <div className="practice-actions">
          {challengeDone && <span className="practice-success mono-val">✓ Nailed it!</span>}
          <button
            type="button"
            className="hw-boot-btn"
            onClick={() => setChallengeIdx((i) => (i + 1) % CHALLENGES.length)}
          >
            Next challenge →
          </button>
        </div>
      </section>

      {/* 2-Column Gesture Guide (Click any row to audition it) */}
      <div className="hw-lab-grid">
        <section className="hw-module hw-pad">
          <div className="hw-module-header">
            <span className="hw-section-title">
              <span className="joint-shape circle" aria-hidden="true" />{' '}
              {swapHands ? 'RIGHT' : 'LEFT'} HAND · ROOT NOTE
            </span>
            <span className="hw-section-tag mono-val">CLICK OR PRESS 0–7</span>
          </div>
          <div className="hw-map-list">
            {LEFT_GESTURE_ROWS.map((row) => {
              const isMatched =
                (!rootNote && row.key === 'REST') || (rootNote && row.key === rootNote);
              return (
                <button
                  key={row.key}
                  type="button"
                  className={`hw-map-row clickable-row ${
                    isMatched ? (row.isRest ? 'matched-rest' : 'matched-left') : ''
                  }`}
                  onClick={() => onTriggerPracticeChord(row.key === 'REST' ? null : row.key, undefined)}
                >
                  <span className="map-name">{row.fingers}</span>
                  <span className="map-vec mono-val">Key {row.keyHint}</span>
                  <span className={`map-target mono-val ${row.isRest ? 'rest' : ''}`}>
                    {row.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="hw-module hw-pad">
          <div className="hw-module-header">
            <span className="hw-section-title">
              <span className="joint-shape square" aria-hidden="true" />{' '}
              {swapHands ? 'LEFT' : 'RIGHT'} HAND · CHORD TYPE
            </span>
            <span className="hw-section-tag mono-val">CLICK OR PRESS Q–T</span>
          </div>
          <div className="hw-map-list">
            {RIGHT_GESTURE_ROWS.map((row) => {
              const isMatched = activeQualityKey === row.key;
              return (
                <button
                  key={row.key}
                  type="button"
                  className={`hw-map-row clickable-row ${isMatched ? 'matched-right' : ''}`}
                  onClick={() => onTriggerPracticeChord(undefined, row.key)}
                >
                  <span className="map-name">{row.fingers}</span>
                  <span className="map-vec mono-val">Key {row.keyHint}</span>
                  <span className="map-target mono-val">{row.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
