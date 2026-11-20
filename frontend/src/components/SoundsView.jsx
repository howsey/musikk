import React, { useState, useEffect, useRef } from 'react';
import { BUILT_IN_SOUNDS, ROOTS, SOUND_COLORS } from '../sounds.js';
import {
  toMono,
  analyzeClip,
  checkQuality,
  normalize,
  trimSamples,
  detectPitch,
  frequencyToNote,
  retune,
  samplesToAudioBuffer,
  drawClipWaveform
} from '../soundLab.js';

const QUALITY_MESSAGES = {
  mic_denied: {
    title: 'We can’t hear your microphone',
    body: 'Allow microphone access in your browser’s address bar, or upload an audio file instead.'
  },
  too_short: {
    title: 'That recording was too short',
    body: 'Hold one steady note for at least 1 second (1–3 seconds works best).'
  },
  too_quiet: {
    title: 'That was very quiet',
    body: 'Move a little closer to your microphone or sing slightly louder.'
  },
  clipping: {
    title: 'Too loud and distorted',
    body: 'Step back slightly from the microphone so the sound stays clean.'
  },
  no_pitch: {
    title: 'No clear musical note detected',
    body: 'Percussive sounds (claps, desk knocks) still work! We mapped it to C4 as-is, or you can record a sung note.'
  }
};

export default function SoundsView({
  active,
  recorderOpenSignal,
  activeSound,
  customSounds,
  onSelectBuiltIn,
  onPreviewBuiltIn,
  onSelectCustomSound,
  onPreviewCustomBuffer,
  onSaveCustomSound,
  onDeleteCustomSound
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1); // 1: Record, 2: Trim, 3: Tune, 4: Save
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [liveLevel, setLiveLevel] = useState(0);
  const [errorCode, setErrorCode] = useState(null);

  // Recorded raw clip state
  const [rawSamples, setRawSamples] = useState(null);
  const [sampleRate, setSampleRate] = useState(44100);
  const [trimStart, setTrimStart] = useState(0.05);
  const [trimEnd, setTrimEnd] = useState(0.95);

  // Pitch detection & autotune state
  const [detectedInfo, setDetectedInfo] = useState({
    hasPitch: false,
    frequency: 261.63,
    note: 'C4',
    cents: 0
  });
  const [tuneMode, setTuneMode] = useState('snap'); // 'snap' | 'natural'
  const [tunedBuffer, setTunedBuffer] = useState(null);
  const [soundName, setSoundName] = useState('');
  const [soundColor, setSoundColor] = useState(SOUND_COLORS[0].value);

  const waveCanvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const levelRafRef = useRef(null);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Open recorder when triggered from PLAY tab
  useEffect(() => {
    if (recorderOpenSignal > 0) {
      openFreshModal();
    }
  }, [recorderOpenSignal]);

  const openFreshModal = () => {
    stopActiveRecording();
    setStep(1);
    setErrorCode(null);
    setRawSamples(null);
    setTunedBuffer(null);
    setSoundName('');
    setTuneMode('snap');
    setModalOpen(true);
  };

  const closeModal = () => {
    stopActiveRecording();
    setModalOpen(false);
  };

  const stopActiveRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  };

  // Start / Stop Microphone Recording
  const handleToggleRecord = async () => {
    if (isRecording) {
      stopActiveRecording();
      return;
    }

    setErrorCode(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      streamRef.current = stream;

      // Live level meter via Web Audio Analyser
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const dataArr = new Float32Array(analyser.fftSize);

      const updateMeter = () => {
        analyser.getFloatTimeDomainData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) sum += dataArr[i] * dataArr[i];
        const rms = Math.sqrt(sum / dataArr.length);
        setLiveLevel(Math.min(1, rms * 4.5));
        levelRafRef.current = requestAnimationFrame(updateMeter);
      };
      levelRafRef.current = requestAnimationFrame(updateMeter);

      const chunks = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        audioCtx.close().catch(() => {});
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        await processAudioBlob(blob);
      };

      recorder.start();
      setIsRecording(true);
      setRecSeconds(0);

      const startTime = performance.now();
      timerRef.current = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        setRecSeconds(elapsed);
        if (elapsed >= 3.5) {
          stopActiveRecording();
        }
      }, 100);
    } catch (err) {
      console.warn('Mic access error:', err);
      setErrorCode('mic_denied');
    }
  };

  const processAudioBlob = async (blob) => {
    try {
      const arrayBuf = await blob.arrayBuffer();
      const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await decodeCtx.decodeAudioData(arrayBuf);
      await decodeCtx.close();

      const mono = toMono(decoded);
      const stats = analyzeClip(mono, decoded.sampleRate);
      const qualityErr = checkQuality(stats);

      if (qualityErr) {
        setErrorCode(qualityErr);
        return;
      }

      const normSamples = normalize(mono, 0.9);
      setRawSamples(normSamples);
      setSampleRate(decoded.sampleRate);
      setTrimStart(0.05);
      setTrimEnd(0.95);
      setErrorCode(null);
      setStep(2);
    } catch (e) {
      console.warn('Decode error:', e);
      setErrorCode('too_short');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processAudioBlob(file);
  };

  // Draw trim waveform whenever rawSamples or trim handles change
  useEffect(() => {
    if (step === 2 && rawSamples && waveCanvasRef.current) {
      drawClipWaveform(waveCanvasRef.current, rawSamples, {
        start: trimStart,
        end: trimEnd,
        color: '#97affd'
      });
    }
  }, [step, rawSamples, trimStart, trimEnd]);

  // Move from Step 2 (Trim) -> Step 3 (Autotune & Pitch Detection)
  const handleProceedToTune = async () => {
    if (!rawSamples) return;
    const totalSec = rawSamples.length / sampleRate;
    const trimmed = trimSamples(
      rawSamples,
      sampleRate,
      trimStart * totalSec,
      trimEnd * totalSec
    );

    const freq = detectPitch(trimmed, sampleRate);
    if (freq) {
      const { note, cents } = frequencyToNote(freq);
      setDetectedInfo({ hasPitch: true, frequency: Math.round(freq), note, cents });
      setErrorCode(null);
      const snapped = await retune(trimmed, sampleRate, cents);
      setTunedBuffer(
        samplesToAudioBuffer(tuneMode === 'snap' ? snapped : trimmed, sampleRate)
      );
    } else {
      setDetectedInfo({ hasPitch: false, frequency: 261, note: 'C4', cents: 0 });
      setErrorCode('no_pitch');
      setTunedBuffer(samplesToAudioBuffer(trimmed, sampleRate));
    }
    setStep(3);
  };

  // Re-compute buffer when toggling Snap vs Natural in Step 3
  const handleChangeTuneMode = async (nextMode) => {
    setTuneMode(nextMode);
    if (!rawSamples) return;
    const totalSec = rawSamples.length / sampleRate;
    const trimmed = trimSamples(
      rawSamples,
      sampleRate,
      trimStart * totalSec,
      trimEnd * totalSec
    );
    const finalSamples =
      nextMode === 'snap' && detectedInfo.hasPitch
        ? await retune(trimmed, sampleRate, detectedInfo.cents)
        : trimmed;
    setTunedBuffer(samplesToAudioBuffer(finalSamples, sampleRate));
  };

  const handlePreviewNote = (noteName) => {
    if (!tunedBuffer) return;
    onPreviewCustomBuffer(
      tunedBuffer,
      detectedInfo.note,
      [`${noteName}4`],
      `rec-${tuneMode}-${detectedInfo.note}`
    );
  };

  const handleSaveSound = async (e) => {
    e.preventDefault();
    if (!tunedBuffer) return;
    const finalName = soundName.trim() || `My Voice (${detectedInfo.note})`;
    const samplesArray = tunedBuffer.getChannelData(0).slice();

    await onSaveCustomSound({
      id: `snd-${Date.now()}`,
      name: finalName,
      color: soundColor,
      rootNote: detectedInfo.note,
      detectedHz: detectedInfo.frequency,
      centsOffset: detectedInfo.cents,
      tuneMode,
      sampleRate: tunedBuffer.sampleRate,
      samples: samplesArray,
      createdAt: Date.now()
    });

    closeModal();
  };

  return (
    <main className={`hw-view ${active ? 'active' : ''}`} aria-label="Sounds library">
      {/* Header Row with Primary Record Action */}
      <section className="hw-module hw-pad sounds-header-bar">
        <div>
          <h2 className="view-heading">SOUNDS LIBRARY</h2>
          <p className="view-subheading">
            Choose a built-in instrument, or record any sound and autotune it across C D E F G A B.
          </p>
        </div>
        <button type="button" className="hw-boot-btn record-cta-btn" onClick={openFreshModal}>
          <span className="rec-dot" aria-hidden="true" />
          <span>Record new sound</span>
        </button>
      </section>

      {/* Built-in Instruments Grid */}
      <section className="hw-module hw-pad">
        <div className="hw-module-header">
          <span className="hw-section-title">BUILT-IN INSTRUMENTS</span>
          <span className="hw-section-tag mono-val">6 VOICES</span>
        </div>

        <div className="sounds-grid" role="radiogroup" aria-label="Built-in instruments">
          {Object.entries(BUILT_IN_SOUNDS).map(([id, s]) => {
            const isSelected = activeSound.type === 'builtin' && activeSound.id === id;
            return (
              <div
                key={id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                className={`sound-tile ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectBuiltIn(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectBuiltIn(id);
                  }
                }}
              >
                <div className="tile-top">
                  <strong className="tile-name">{s.name}</strong>
                  {isSelected && <span className="tile-check mono-val">ACTIVE</span>}
                </div>
                <p className="tile-desc">{s.description}</p>
                <div className="tile-actions">
                  <button
                    type="button"
                    className="tile-test-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreviewBuiltIn(id);
                    }}
                  >
                    ▶ Test C chord
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* User's Recorded & Autotuned Sounds */}
      <section className="hw-module hw-pad">
        <div className="hw-module-header">
          <span className="hw-section-title">MY RECORDED SOUNDS (AUTOTUNED C – B)</span>
          <span className="hw-section-tag mono-val">SAVED IN BROWSER</span>
        </div>

        {customSounds.length === 0 ? (
          <div className="empty-sounds-box">
            <p className="empty-title">No custom sounds recorded yet.</p>
            <p className="empty-desc">
              Hum one note, pluck a guitar string, or tap your desk — we’ll automatically tune it to
              C D E F G A B so you can play chords with your hands.
            </p>
            <button type="button" className="hw-boot-btn" onClick={openFreshModal}>
              Record your first sound
            </button>
          </div>
        ) : (
          <div className="sounds-grid">
            {customSounds.map((snd) => {
              const isSelected = activeSound.type === 'custom' && activeSound.id === snd.id;
              return (
                <div
                  key={snd.id}
                  className={`sound-tile custom-tile ${isSelected ? 'selected' : ''}`}
                  style={{ '--tile-accent': snd.color || '#97affd' }}
                  onClick={() => onSelectCustomSound(snd.id)}
                >
                  <div className="tile-top">
                    <span className="color-dot" style={{ background: snd.color || '#97affd' }} />
                    <strong className="tile-name">{snd.name}</strong>
                    {isSelected && <span className="tile-check mono-val">ACTIVE</span>}
                  </div>
                  <p className="tile-desc mono-val">
                    Root {snd.rootNote} ({snd.centsOffset >= 0 ? `+${snd.centsOffset}` : snd.centsOffset}c
                    {snd.tuneMode === 'snap' ? ' → 0c snapped' : ''})
                  </p>
                  <div className="tile-actions">
                    <button
                      type="button"
                      className="tile-test-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCustomSound(snd.id, true);
                      }}
                    >
                      ▶ Use &amp; test
                    </button>
                    <button
                      type="button"
                      className="tile-del-btn"
                      aria-label={`Delete ${snd.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCustomSound(snd.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ================================================================= */}
      {/* 4-STEP CUSTOM SOUND RECORDER & AUTOTUNE MODAL                     */}
      {/* ================================================================= */}
      {modalOpen && (
        <div className="recorder-modal-backdrop" role="dialog" aria-modal="true" aria-label="Record custom sound">
          <div className="recorder-modal hw-module">
            <div className="rec-modal-header">
              <div className="rec-steps-bar mono-val">
                <span className={step === 1 ? 'active' : step > 1 ? 'done' : ''}>① Record</span>
                <span>──</span>
                <span className={step === 2 ? 'active' : step > 2 ? 'done' : ''}>② Trim</span>
                <span>──</span>
                <span className={step === 3 ? 'active' : step > 3 ? 'done' : ''}>③ Autotune</span>
                <span>──</span>
                <span className={step === 4 ? 'active' : ''}>④ Save</span>
              </div>
              <button type="button" className="rec-close-btn" onClick={closeModal} aria-label="Close recorder">
                ✕
              </button>
            </div>

            {/* Inline Diagnostic Alert for Any Error State */}
            {errorCode && QUALITY_MESSAGES[errorCode] && (
              <div className="hw-error-banner" role="alert">
                <strong>{QUALITY_MESSAGES[errorCode].title}</strong>
                <p>{QUALITY_MESSAGES[errorCode].body}</p>
              </div>
            )}

            {/* STEP 1: RECORD OR UPLOAD */}
            {step === 1 && (
              <div className="rec-step-body">
                <h3>1. Hold one steady note for 1–3 seconds</h3>
                <p className="rec-helper">
                  Sing “laaa”, hum, or play a single note on any acoustic instrument.
                </p>

                <div className="rec-center-control">
                  <button
                    type="button"
                    className={`big-record-btn ${isRecording ? 'recording' : ''}`}
                    onClick={handleToggleRecord}
                  >
                    <span className="big-rec-circle" />
                    <span>
                      {isRecording
                        ? `Stop recording (${recSeconds.toFixed(1)}s)`
                        : 'Click to Start Recording'}
                    </span>
                  </button>

                  <div className="rec-meter-wrap">
                    <span className="mono-val">Mic Level</span>
                    <div className="rec-meter-track">
                      <div
                        className="rec-meter-fill"
                        style={{ width: `${Math.round(liveLevel * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="rec-upload-alt">
                  <span>No microphone handy?</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="sr-only"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    className="hw-secondary-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload audio file (.wav / .mp3)
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: TRIM WAVEFORM */}
            {step === 2 && (
              <div className="rec-step-body">
                <h3>2. Trim start and end</h3>
                <p className="rec-helper">
                  Keep the cleanest middle part of the sound so every chord triggers smoothly.
                </p>

                <div className="trim-canvas-box">
                  <canvas ref={waveCanvasRef} className="trim-wave-canvas" />
                </div>

                <div className="trim-sliders">
                  <label className="trim-label">
                    <span>Start ({Math.round(trimStart * 100)}%)</span>
                    <input
                      type="range"
                      min="0"
                      max="0.7"
                      step="0.01"
                      value={trimStart}
                      onChange={(e) => setTrimStart(Math.min(trimEnd - 0.15, parseFloat(e.target.value)))}
                    />
                  </label>
                  <label className="trim-label">
                    <span>End ({Math.round(trimEnd * 100)}%)</span>
                    <input
                      type="range"
                      min="0.3"
                      max="1"
                      step="0.01"
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(Math.max(trimStart + 0.15, parseFloat(e.target.value)))}
                    />
                  </label>
                </div>

                <div className="rec-modal-footer">
                  <button type="button" className="hw-secondary-btn" onClick={() => setStep(1)}>
                    ← Record again
                  </button>
                  <button type="button" className="hw-boot-btn" onClick={handleProceedToTune}>
                    Detect Pitch &amp; Autotune →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: AUTOTUNE TO C D E F G A B & PREVIEW */}
            {step === 3 && (
              <div className="rec-step-body">
                <h3>3. Autotuned to C D E F G A B</h3>
                <div className="pitch-result-card mono-val">
                  <div>
                    Detected pitch:{' '}
                    <strong>
                      {detectedInfo.note} ({detectedInfo.frequency} Hz,{' '}
                      {detectedInfo.cents >= 0 ? `+${detectedInfo.cents}` : detectedInfo.cents} cents)
                    </strong>
                  </div>
                  <div className="pitch-snap-status">
                    {tuneMode === 'snap'
                      ? `✓ Snapped ${detectedInfo.cents} cents to pure ${detectedInfo.note} and mapped across all 7 notes`
                      : 'Keeping natural un-snapped pitch'}
                  </div>
                </div>

                <div className="tune-mode-radios" role="radiogroup" aria-label="Pitch tuning mode">
                  <label className={`mode-pill ${tuneMode === 'snap' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="tuneMode"
                      checked={tuneMode === 'snap'}
                      onChange={() => handleChangeTuneMode('snap')}
                    />
                    <span>Snap to pitch (Autotune)</span>
                  </label>
                  <label className={`mode-pill ${tuneMode === 'natural' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="tuneMode"
                      checked={tuneMode === 'natural'}
                      onChange={() => handleChangeTuneMode('natural')}
                    />
                    <span>Keep natural pitch</span>
                  </label>
                </div>

                <div className="preview-scale-block">
                  <span className="rec-helper">Click any note to test your autotuned sound:</span>
                  <div className="preview-scale-keys">
                    {ROOTS.map((note) => (
                      <button
                        key={note}
                        type="button"
                        className="scale-preview-btn mono-val"
                        onClick={() => handlePreviewNote(note)}
                      >
                        ▶ {note}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rec-modal-footer">
                  <button type="button" className="hw-secondary-btn" onClick={() => setStep(2)}>
                    ← Back to Trim
                  </button>
                  <button type="button" className="hw-boot-btn" onClick={() => setStep(4)}>
                    Continue to Save →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: NAME & SAVE */}
            {step === 4 && (
              <form className="rec-step-body" onSubmit={handleSaveSound}>
                <h3>4. Name and save your instrument</h3>
                <label className="save-field">
                  <span>Sound Name</span>
                  <input
                    type="text"
                    className="hw-text-input"
                    placeholder={`My Voice (${detectedInfo.note})`}
                    value={soundName}
                    onChange={(e) => setSoundName(e.target.value)}
                    autoFocus
                  />
                </label>

                <div className="save-field">
                  <span>Color Tag</span>
                  <div className="color-swatches">
                    {SOUND_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`color-swatch-btn ${soundColor === c.value ? 'active' : ''}`}
                        style={{ background: c.value }}
                        onClick={() => setSoundColor(c.value)}
                        aria-label={c.label}
                      />
                    ))}
                  </div>
                </div>

                <div className="rec-modal-footer">
                  <button type="button" className="hw-secondary-btn" onClick={() => setStep(3)}>
                    ← Back
                  </button>
                  <button type="submit" className="hw-boot-btn">
                    Save &amp; Use on PLAY Screen
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
