import React, { useState } from 'react';
import SynthBirdAvatar from './SynthBirdAvatar.jsx';
import { QUALITY_LABELS } from '../sounds.js';

function ConfidenceRing({ count = 0, total = 3, color = '#97affd' }) {
  const radius = 11;
  const circ = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, count / total));
  const dashOffset = circ * (1 - progress);

  return (
    <svg className="conf-ring-svg" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r={radius} fill="none" stroke="rgba(133,146,171,0.25)" strokeWidth="2.5" />
      <circle
        cx="14"
        cy="14"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={circ}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
      />
    </svg>
  );
}

export default function CameraViewfinder({
  videoRef,
  visionCanvasRef,
  isRunning,
  isStarting,
  cameraError,
  lightingWarning,
  onDismissLightingWarning,
  leftHandInfo,
  rightHandInfo,
  rootNote,
  isSharp,
  chordQuality,
  cutoffHz,
  activeBank,
  octave,
  settings,
  onEnableKeyboardMode,
  onToggleEngine
}) {
  const [hideHints, setHideHints] = useState(false);

  const rootHandTag = settings.swapHands ? 'R · ROOT' : 'L · ROOT';
  const chordHandTag = settings.swapHands ? 'L · CHORD' : 'R · CHORD';
  const qualityDisplay = isSharp
    ? `${rootNote || ''}# ${QUALITY_LABELS[chordQuality] || 'maj'}`
    : QUALITY_LABELS[chordQuality] || 'maj';

  const rootLocked = Boolean(rootNote) && leftHandInfo.stabCount >= 3;
  const rootStatusText = !leftHandInfo.detected
    ? 'Show hand'
    : !rootNote
      ? 'Stopped (Fist)'
      : rootLocked
        ? 'Locked'
        : `Confirming ${leftHandInfo.stabCount}/3`;

  return (
    <section className="hw-module hw-camera-bezel" aria-label="Camera hand tracking stage">
      <div className="hw-viewport">
        {/* Native GPU-Composited Video Layer */}
        <video ref={videoRef} id="webcam-video" playsInline muted />
        {/* Transparent Skeleton Wireframe Overlay Canvas */}
        <canvas ref={visionCanvasRef} id="vision-canvas" />

        {/* Clean Hand Readout Badges with 3-Frame Confidence Rings */}
        <div className="vf-hud">
          {/* Root Hand Readout (Periwinkle + Round Joint Icon) */}
          <div className={`hand-readout-pill root-pill ${leftHandInfo.detected ? 'is-seen' : ''}`}>
            <ConfidenceRing
              count={leftHandInfo.detected ? leftHandInfo.stabCount : 0}
              total={3}
              color={rootNote ? '#97affd' : '#ff5e57'}
            />
            <div className="hr-body">
              <div className="hr-tag">
                <span className="joint-shape circle" aria-hidden="true" />
                <span>{rootHandTag}</span>
              </div>
              <div className="hr-main">
                <strong className="hr-value mono-val">{rootNote || 'STOP'}</strong>
                <span className="hr-state">{rootStatusText}</span>
              </div>
            </div>
          </div>

          {/* Chord Hand Readout (Amber + Square Joint Icon) */}
          <div className={`hand-readout-pill chord-pill ${rightHandInfo.detected ? 'is-seen' : ''}`}>
            <div className="hr-body">
              <div className="hr-tag">
                <span className="joint-shape square" aria-hidden="true" />
                <span>{chordHandTag}</span>
              </div>
              <div className="hr-main">
                <strong className="hr-value mono-val">{qualityDisplay}</strong>
                <span className="hr-state">
                  {rightHandInfo.detected ? `Tone ${(cutoffHz / 1000).toFixed(1)}kHz` : 'Held in memory'}
                </span>
              </div>
            </div>
          </div>

          {/* Right-hand height = Tone vertical indicator */}
          {isRunning && (
            <div className="vf-tone-rail" aria-hidden="true">
              <span className="rail-cap">▲ Brighter</span>
              <span className="rail-mid">Hand height = Tone</span>
              <span className="rail-cap">▼ Warmer</span>
            </div>
          )}

          {/* Optional Developer Debug Overlay (Shift+D or Settings toggle) */}
          {settings.showDebug && (
            <div className="vf-debug-overlay mono-val">
              <div>L-VEC: {leftHandInfo.vecStr} · STAB {leftHandInfo.stabCount}/3</div>
              <div>R-VEC: {rightHandInfo.vecStr} · CUTOFF {cutoffHz}Hz</div>
              <div>1€ FILTER: 60Hz · BANK {activeBank === 0 ? 'A' : 'B'} · OCT {octave}</div>
            </div>
          )}
        </div>

        {/* Lighting / Tracking Drop-out Inline Tip */}
        {lightingWarning && isRunning && (
          <div className="hw-inline-toast warning" role="status">
            <span>Hands dropped out several times. Try adding light or moving slightly back.</span>
            <button type="button" className="toast-dismiss" onClick={onDismissLightingWarning}>
              Got it
            </button>
          </div>
        )}

        {/* First-Run Setup & Inline Error Recovery Overlay (When Engine is OFF) */}
        {!isRunning && (
          <div className="hw-standby-overlay">
            {cameraError ? (
              <div className="hw-error-card" role="alert">
                <div className="err-title">We couldn’t start your camera</div>
                <p className="err-desc">{cameraError}</p>
                <ul className="err-steps">
                  <li>Allow camera access in your browser’s address bar, then click Try again.</li>
                  <li>Or play right now using your computer keyboard (keys 1–7 for C–B).</li>
                </ul>
                <div className="err-actions">
                  <button type="button" className="hw-boot-btn" onClick={onToggleEngine}>
                    Try camera again
                  </button>
                  <button
                    type="button"
                    className="hw-secondary-btn"
                    onClick={onEnableKeyboardMode}
                  >
                    Play with keyboard instead
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="hw-standby-zones">
                  <div className="hw-zone-box left">
                    <span className="hw-zone-tag">
                      <span className="joint-shape circle" aria-hidden="true" />{' '}
                      {settings.swapHands ? 'RIGHT HAND' : 'LEFT HAND'} · ROOT NOTE
                    </span>
                    <div className="hw-zone-title">Raise 1–5 fingers for C – G</div>
                    <div className="hw-zone-sub">Thumb = A · Thumb+Index = B · Fist = Stop</div>
                  </div>

                  <div className="hw-standby-mascot">
                    <SynthBirdAvatar
                      mode="standby"
                      scale={0.68}
                      reducedMotion={settings.reducedMotion}
                    />
                  </div>

                  <div className="hw-zone-box right">
                    <span className="hw-zone-tag">
                      <span className="joint-shape square" aria-hidden="true" />{' '}
                      {settings.swapHands ? 'LEFT HAND' : 'RIGHT HAND'} · CHORD &amp; TONE
                    </span>
                    <div className="hw-zone-title">1 = Major · 3 = Minor · 4 = Maj7</div>
                    <div className="hw-zone-sub">Move hand higher or lower to shape tone</div>
                  </div>
                </div>

                <div className="hw-start-actions">
                  <button
                    type="button"
                    className="hw-boot-btn"
                    onClick={onToggleEngine}
                    disabled={isStarting}
                  >
                    {isStarting ? 'Starting camera & audio...' : 'Start Camera & Audio'}
                  </button>
                  <button
                    type="button"
                    className="hw-secondary-btn"
                    onClick={onEnableKeyboardMode}
                  >
                    Or play with keyboard (no camera)
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Dismissible Contextual Hint Bar */}
      {!hideHints && (
        <div className="hw-hint-bar">
          <span>
            <strong>Tip:</strong> Make a fist with your {settings.swapHands ? 'right' : 'left'} hand to
            stop sound · Press <kbd>1</kbd>–<kbd>7</kbd> on your keyboard anytime to play C–B.
          </span>
          <button
            type="button"
            className="hint-close-btn"
            onClick={() => setHideHints(true)}
            aria-label="Hide tip"
          >
            Hide tip
          </button>
        </div>
      )}
    </section>
  );
}
