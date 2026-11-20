import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getFingerStates, classifyLeftHand, classifyRightHand, GestureStabilizer } from './gestureDetector.js';
import { HandLandmarkSmoother, OneEuroFilter } from './oneEuroFilter.js';
import { getChordNotes } from './musicTheory.js';
import { AudioEngine } from './audioEngine.js';
import { Visualizer } from './visualizer.js';
import {
  PRESET_METADATA,
  drawOledWaveform,
  drawADSRGraph,
  drawFilterGraph
} from './soundRackCanvas.js';
import SynthBirdAvatar from './components/SynthBirdAvatar.jsx';
import RotaryKnob from './components/RotaryKnob.jsx';

const LEFT_GESTURE_ROWS = [
  { key: 'REST', desc: 'Closed Fist (Kepalan)', vec: '[0, 0, 0, 0, 0]', label: 'REST (Mute)', isRest: true },
  { key: 'C', desc: '1 Finger (Index)', vec: '[0, 1, 0, 0, 0]', label: 'Root C' },
  { key: 'D', desc: '2 Fingers (Index + Mid)', vec: '[0, 1, 1, 0, 0]', label: 'Root D' },
  { key: 'E', desc: '3 Fingers (Idx + Mid + Ring)', vec: '[0, 1, 1, 1, 0]', label: 'Root E' },
  { key: 'F', desc: '4 Fingers (No Thumb)', vec: '[0, 1, 1, 1, 1]', label: 'Root F' },
  { key: 'G', desc: '5 Fingers (Open Hand)', vec: '[1, 1, 1, 1, 1]', label: 'Root G' },
  { key: 'A', desc: 'Thumb Only (Ibu Jari)', vec: '[1, 0, 0, 0, 0]', label: 'Root A' },
  { key: 'B', desc: 'Thumb + Index', vec: '[1, 1, 0, 0, 0]', label: 'Root B' }
];

const RIGHT_GESTURE_ROWS = [
  { key: 'Major', desc: '1 Finger (Index)', vec: '[0, 1, 0, 0, 0]', label: 'Major (0, 4, 7)' },
  { key: 'Sharp', desc: '2 Fingers (Index + Mid)', vec: '[0, 1, 1, 0, 0]', label: '# Sharp Root' },
  { key: 'Minor', desc: '3 Fingers', vec: '[0, 1, 1, 1, 0]', label: 'Minor (0, 3, 7)' },
  { key: 'Maj7', desc: '4 Fingers (No Thumb)', vec: '[0, 1, 1, 1, 1]', label: 'Maj7 (0, 4, 7, 11)' },
  { key: 'Min7', desc: '5 Fingers (Open Hand)', vec: '[1, 1, 1, 1, 1]', label: 'Min7 (0, 3, 7, 10)' }
];

// Build 3-octave piano key metadata (C2 .. B4)
const PIANO_KEYS = (() => {
  const notesOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const startOctave = 2;
  const numOctaves = 3;
  const keys = [];
  let whiteIdx = 0;
  const whiteWidthPct = 100 / (numOctaves * 7);

  for (let oct = startOctave; oct < startOctave + numOctaves; oct++) {
    for (const note of notesOrder) {
      const isBlack = note.includes('#');
      const noteName = `${note}${oct}`;
      if (isBlack) {
        keys.push({
          noteName,
          label: '',
          isBlack: true,
          leftPct: (whiteIdx - 0.34) * whiteWidthPct,
          widthPct: whiteWidthPct * 0.68
        });
      } else {
        keys.push({
          noteName,
          label: note === 'C' ? noteName : note,
          isC: note === 'C',
          isBlack: false
        });
        whiteIdx++;
      }
    }
  }
  return keys;
})();

function formatBinaryVec(fs) {
  if (!fs) return '[0,0,0,0,0]';
  return `[${fs.thumb ? 1 : 0},${fs.index ? 1 : 0},${fs.middle ? 1 : 0},${fs.ring ? 1 : 0},${fs.pinky ? 1 : 0}]`;
}

export default function App() {
  // Navigation & Engine Status
  const [activeTab, setActiveTab] = useState('studio'); // 'studio' | 'dsp' | 'lab'
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Musical & Gesture State
  const [rootNote, setRootNote] = useState(null);
  const [chordQuality, setChordQuality] = useState('Major');
  const [isSharp, setIsSharp] = useState(false);
  const [chordData, setChordData] = useState(null);
  const [octave, setOctave] = useState(3);

  // Hand Telemetry State
  const [leftHandInfo, setLeftHandInfo] = useState({
    detected: false,
    fingers: null,
    gestureName: 'Rest (Kepalan)',
    stabCount: 0
  });
  const [rightHandInfo, setRightHandInfo] = useState({
    detected: false,
    fingers: null,
    gestureName: 'Major (Default)'
  });

  // Synth Parameters State
  const [presetKey, setPresetKey] = useState('ambient_pad');
  const [cutoffNorm, setCutoffNorm] = useState(0.65);
  const [cutoffHz, setCutoffHz] = useState(3200);
  const [chorusWet, setChorusWet] = useState(0.3);
  const [delayWet, setDelayWet] = useState(0.18);
  const [reverbWet, setReverbWet] = useState(0.35);
  const [volumeDb, setVolumeDb] = useState(-2);
  const [activeBank, setActiveBank] = useState(0);
  const [midiName, setMidiName] = useState('None');
  const [vuLevels, setVuLevels] = useState([-60, -60]);

  // Mutable Engine & DOM Refs
  const videoRef = useRef(null);
  const visionCanvasRef = useRef(null);
  const oledWaveCanvasRef = useRef(null);
  const adsrCanvasRef = useRef(null);
  const filterCanvasRef = useRef(null);

  const audioEngineRef = useRef(null);
  const visualizerRef = useRef(null);
  const handsInstanceRef = useRef(null);
  const isRunningRef = useRef(false);

  // 1-Euro Kinematic Smoothers & Consensus Stabilizers
  const leftSmootherRef = useRef(new HandLandmarkSmoother(21));
  const rightSmootherRef = useRef(new HandLandmarkSmoother(21));
  const yCutoffFilterRef = useRef(new OneEuroFilter(60, 1.2, 0.04, 1.0));
  const leftStabilizerRef = useRef(new GestureStabilizer(3));
  const rightStabilizerRef = useRef(new GestureStabilizer(3));

  // Keep latest state accessible in MediaPipe callback
  const stateRef = useRef({
    rootNote: null,
    chordQuality: 'Major',
    isSharp: false,
    octave: 3,
    cutoffNorm: 0.65,
    cutoffHz: 3200
  });

  useEffect(() => {
    stateRef.current = { rootNote, chordQuality, isSharp, octave, cutoffNorm, cutoffHz };
  }, [rootNote, chordQuality, isSharp, octave, cutoffNorm, cutoffHz]);

  // Initialize singleton AudioEngine & Visualizer
  useEffect(() => {
    audioEngineRef.current = new AudioEngine();
    visualizerRef.current = new Visualizer(visionCanvasRef.current);
  }, []);

  useEffect(() => {
    if (visualizerRef.current && visionCanvasRef.current) {
      visualizerRef.current.setCanvas(visionCanvasRef.current);
    }
  }, [activeTab]);

  // ApplyCutoff Helper
  const applyCutoff = useCallback((normVal, updateAudio = true) => {
    const clamped = Math.max(0, Math.min(1, normVal));
    const engine = audioEngineRef.current;
    const hz =
      updateAudio && engine
        ? engine.setFilterModulation(clamped) || Math.round(400 * Math.pow(9000 / 400, clamped))
        : Math.round(400 * Math.pow(9000 / 400, clamped));
    setCutoffNorm(Number(clamped.toFixed(2)));
    setCutoffHz(hz);
  }, []);

  // MediaPipe Hand Tracking Callback with 1-Euro Kinematic Smoothing
  const onHandResults = useCallback((results) => {
    const video = videoRef.current;
    const visualizer = visualizerRef.current;
    const engine = audioEngineRef.current;
    const nowMs = performance.now();

    if (video && visualizer) {
      visualizer.resize(video.videoWidth || 1280, video.videoHeight || 720);
    }

    let rawLeft = null;
    let rawRight = null;

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const lm = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i];
        if (handedness.label === 'Left') rawLeft = lm;
        else rawRight = lm;
      }
    }

    // Apply 1-Euro Filter to 21 3D landmarks
    const smoothLeft = rawLeft ? leftSmootherRef.current.smooth(rawLeft, nowMs) : null;
    const smoothRight = rawRight ? rightSmootherRef.current.smooth(rawRight, nowMs) : null;

    // Draw smoothed landmarks on camera viewfinder canvas
    if (visualizer) {
      const smoothedResults = {
        multiHandLandmarks: [smoothLeft, smoothRight].filter(Boolean),
        multiHandedness: [
          ...(smoothLeft ? [{ label: 'Left' }] : []),
          ...(smoothRight ? [{ label: 'Right' }] : [])
        ]
      };
      visualizer.render(video, smoothedResults);
    }

    // --- 1. LEFT HAND (Root Note & [0,0,0,0,0] REST/Mute) ---
    let nextRoot = stateRef.current.rootNote;
    if (smoothLeft) {
      const fs = getFingerStates(smoothLeft, false);
      const cls = classifyLeftHand(fs);
      const stableRoot = leftStabilizerRef.current.update(cls.root);

      if (stableRoot === 'REST') {
        nextRoot = null;
      } else if (stableRoot !== null) {
        nextRoot = stableRoot;
      }

      setLeftHandInfo({
        detected: true,
        fingers: fs,
        gestureName: cls.gestureName,
        stabCount: Math.min(leftStabilizerRef.current.candidateCount, 3)
      });
    } else {
      leftSmootherRef.current.reset();
      leftStabilizerRef.current.reset();
      nextRoot = null;
      setLeftHandInfo({
        detected: false,
        fingers: null,
        gestureName: 'Rest (No Hand)',
        stabCount: 0
      });
    }

    // --- 2. RIGHT HAND (Chord Quality & 1-Euro Y-Axis Filter Sweep) ---
    let nextQuality = stateRef.current.chordQuality;
    let nextSharp = stateRef.current.isSharp;

    if (smoothRight) {
      const fs = getFingerStates(smoothRight, true);
      const cls = classifyRightHand(fs);
      let gName = cls ? cls.gestureName : nextQuality;

      if (cls) {
        const stableKey = rightStabilizerRef.current.update(`${cls.quality}|${cls.isSharp}`);
        if (stableKey) {
          const [q, sh] = stableKey.split('|');
          nextQuality = q;
          nextSharp = sh === 'true';
        }
      }

      // Smooth Y-axis height with 1-Euro Filter
      const rawNormY = Math.max(0, Math.min(1, 1.0 - smoothRight[0].y));
      const smoothedNormY = Math.max(0, Math.min(1, yCutoffFilterRef.current.filter(rawNormY, nowMs)));
      applyCutoff(smoothedNormY, true);

      setRightHandInfo({
        detected: true,
        fingers: fs,
        gestureName: gName
      });
    } else {
      rightSmootherRef.current.reset();
      rightStabilizerRef.current.reset();
      setRightHandInfo((prev) => ({
        ...prev,
        detected: false,
        fingers: null
      }));
    }

    setRootNote(nextRoot);
    setChordQuality(nextQuality);
    setIsSharp(nextSharp);

    // --- 3. TRIGGER OR STOP SYNTHESIZER ---
    if (nextRoot && engine) {
      const info = getChordNotes(nextRoot, nextSharp, nextQuality, stateRef.current.octave);
      setChordData(info);
      engine.playChord(info);
      setActiveBank(engine.getActiveBank());
    } else if (engine) {
      setChordData(null);
      engine.stopChord();
    }
  }, [applyCutoff]);

  // Keep latest callback wired to MediaPipe
  useEffect(() => {
    if (handsInstanceRef.current) {
      handsInstanceRef.current.onResults(onHandResults);
    }
  }, [onHandResults]);

  // Continuous 60 FPS Animation Loop for OLED Waveform, DSP Graphs & Stereo VU Meters
  useEffect(() => {
    let rafId;
    const tick = () => {
      const engine = audioEngineRef.current;
      const playing = isRunningRef.current && Boolean(stateRef.current.rootNote);

      if (oledWaveCanvasRef.current && engine) {
        drawOledWaveform(oledWaveCanvasRef.current, engine.getWaveformData(), playing);
      }

      if (adsrCanvasRef.current) {
        const meta = PRESET_METADATA[presetKey] || PRESET_METADATA.ambient_pad;
        drawADSRGraph(adsrCanvasRef.current, meta.env);
      }

      if (filterCanvasRef.current) {
        drawFilterGraph(filterCanvasRef.current, stateRef.current.cutoffHz);
      }

      if (engine && isRunningRef.current) {
        setVuLevels(engine.getMeterLevels());
        setMidiName(engine.getMidiStatus());
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [presetKey, activeTab]);

  // Start / Stop Hardware Engine
  const handleToggleEngine = async () => {
    const engine = audioEngineRef.current;
    const video = videoRef.current;

    if (!isRunning) {
      setIsStarting(true);
      try {
        await engine.init();

        if (!window.Hands) {
          throw new Error('Library MediaPipe Hands lokal gagal dimuat.');
        }

        if (!handsInstanceRef.current) {
          const hands = new window.Hands({
            locateFile: (file) => `/@mediapipe/hands/${file}`
          });
          hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.6
          });
          hands.onResults(onHandResults);
          handsInstanceRef.current = hands;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false
        });

        video.srcObject = stream;
        await video.play();

        isRunningRef.current = true;
        setIsRunning(true);
        setIsStarting(false);

        let busy = false;
        const pumpFrame = async () => {
          if (!isRunningRef.current) return;
          if (!busy && video.readyState >= 2 && handsInstanceRef.current) {
            busy = true;
            try {
              await handsInstanceRef.current.send({ image: video });
            } catch (e) {
              console.warn('Frame tracking notice:', e);
            } finally {
              busy = false;
            }
          }
          if (isRunningRef.current) {
            requestAnimationFrame(pumpFrame);
          }
        };
        requestAnimationFrame(pumpFrame);
      } catch (err) {
        console.error('Engine start error:', err);
        alert('Gagal menyalakan kamera atau audio: ' + err.message);
        setIsStarting(false);
      }
    } else {
      isRunningRef.current = false;
      setIsRunning(false);
      engine?.stopChord();
      setRootNote(null);
      setChordData(null);

      if (video && video.srcObject) {
        video.srcObject.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    }
  };

  // Preset & Parameter Handlers
  const handleSelectPreset = (key) => {
    setPresetKey(key);
    audioEngineRef.current?.setPreset(key);
    const meta = PRESET_METADATA[key];
    if (meta) {
      const norm = Math.log(meta.defaultCutoff / 400) / Math.log(9000 / 400);
      applyCutoff(norm, false);
      setReverbWet(meta.defaultReverb);
    }
  };

  const handleChorusChange = (val) => {
    setChorusWet(val);
    audioEngineRef.current?.setChorusWet(val);
  };

  const handleDelayChange = (val) => {
    setDelayWet(val);
    audioEngineRef.current?.setDelayWet(val);
  };

  const handleReverbChange = (val) => {
    setReverbWet(val);
    audioEngineRef.current?.setReverbWet(val);
  };

  const handleVolumeChange = (val) => {
    setVolumeDb(val);
    audioEngineRef.current?.setVolume(val);
  };

  const handleOctaveChange = (nextOct) => {
    const clamped = Math.max(2, Math.min(4, nextOct));
    setOctave(clamped);
    audioEngineRef.current?.setOctave(clamped);
    if (rootNote) {
      const info = getChordNotes(rootNote, isSharp, chordQuality, clamped);
      setChordData(info);
      audioEngineRef.current?.playChord(info);
    }
  };

  // Determine 3D Bird Avatar state
  const birdMode = !isRunning ? 'standby' : rootNote ? 'playing' : 'rest';
  const activeNotes = chordData ? chordData.notes : [];
  const bassNote = activeNotes[0] || '';
  const currentPresetMeta = PRESET_METADATA[presetKey] || PRESET_METADATA.ambient_pad;
  const activeQualityKey = isSharp ? 'Sharp' : chordQuality;

  return (
    <div className="hw-chassis">
      {/* ================================================================= */}
      {/* TOP HARDWARE CONTROL STRIP                                        */}
      {/* ================================================================= */}
      <header className="hw-topbar">
        <div className="hw-brand">
          <span className="hw-screw" aria-hidden="true" />
          <div className="hw-brand-titles">
            <span className="hw-model-name">AETHER // MK-II GESTURE SYNTH</span>
            <span className="hw-model-sub mono-val">1€ KINEMATIC VISION · DUAL-BANK POLY ENGINE</span>
          </div>
        </div>

        {/* Mechanical View Keycaps */}
        <nav className="hw-mode-switches" aria-label="Synthesizer modes">
          <button
            className={`hw-keycap-tab ${activeTab === 'studio' ? 'active' : ''}`}
            onClick={() => setActiveTab('studio')}
          >
            [1] STUDIO DECK
          </button>
          <button
            className={`hw-keycap-tab ${activeTab === 'dsp' ? 'active' : ''}`}
            onClick={() => setActiveTab('dsp')}
          >
            [2] DSP MATRIX
          </button>
          <button
            className={`hw-keycap-tab ${activeTab === 'lab' ? 'active' : ''}`}
            onClick={() => setActiveTab('lab')}
          >
            [3] GESTURE LAB
          </button>
        </nav>

        {/* Hardware Status LEDs & Tactile Power Toggle */}
        <div className="hw-power-cluster">
          <div className="hw-led-group mono-val">
            <div className="hw-led-item">
              <span>CAM</span>
              <span className={`hw-led-dot ${isRunning ? 'on-periwinkle' : 'standby'}`} />
            </div>
            <div className="hw-led-item">
              <span>DSP</span>
              <span className={`hw-led-dot ${isRunning ? 'on-periwinkle' : ''}`} />
            </div>
            <div className="hw-led-item">
              <span>MIDI</span>
              <span className={`hw-led-dot ${midiName !== 'None (No MIDI Device)' && isRunning ? 'on-amber' : ''}`} />
            </div>
          </div>

          <button
            className={`hw-power-toggle ${isRunning ? 'is-on' : ''}`}
            onClick={handleToggleEngine}
            disabled={isStarting}
          >
            <span className="hw-toggle-track">
              <span className="hw-toggle-thumb" />
            </span>
            <span className="hw-toggle-label mono-val">
              {isStarting ? 'BOOTING...' : isRunning ? 'ENGINE ON' : 'ENGINE OFF'}
            </span>
          </button>
        </div>
      </header>

      {/* ================================================================= */}
      {/* MODE [1]: STUDIO DECK (Main Hardware Workspace)                   */}
      {/* ================================================================= */}
      <main className={`hw-view ${activeTab === 'studio' ? 'active' : ''}`}>
        <div className="hw-studio-upper">
          {/* LEFT 63%: Recessed Camera Viewfinder Stage */}
          <section className="hw-module hw-camera-bezel">
            <div className="hw-viewport">
              <video ref={videoRef} id="webcam-video" playsInline muted />
              <canvas ref={visionCanvasRef} id="vision-canvas" />

              {/* Technical Viewfinder Corner Brackets & Telemetry Readouts */}
              <div className="vf-hud">
                <div className="vf-corner tl periwinkle">
                  <span className="vf-readout mono-val">
                    L-HAND {formatBinaryVec(leftHandInfo.fingers)} →{' '}
                    <strong>{rootNote ? `ROOT ${rootNote}` : 'REST · MUTE'}</strong>
                  </span>
                </div>
                <div className="vf-corner tr amber">
                  <span className="vf-readout mono-val">
                    R-HAND {formatBinaryVec(rightHandInfo.fingers)} →{' '}
                    <strong>{isSharp ? '# SHARP' : chordQuality.toUpperCase()}</strong> · Y-CUTOFF{' '}
                    {(cutoffHz / 1000).toFixed(1)}kHz
                  </span>
                </div>
                <div className="vf-corner bl">
                  <span className="vf-meta mono-val">
                    STABILIZER: {leftHandInfo.stabCount}/3 FRAMES · 1€ FILTER ACTIVE
                  </span>
                </div>
                <div className="vf-corner br">
                  <span className="vf-meta mono-val">
                    BANK {activeBank === 0 ? 'A' : 'B'} · OCTAVE {octave}
                  </span>
                </div>
              </div>

              {/* Standby & Calibration Overlay (When Engine is OFF) */}
              {!isRunning && (
                <div className="hw-standby-overlay">
                  <div className="hw-standby-zones">
                    <div className="hw-zone-box left">
                      <span className="hw-zone-tag mono-val">L-HAND ZONE · PERIWINKLE</span>
                      <div className="hw-zone-title">ROOT NOTE (C – B)</div>
                      <div className="hw-zone-sub mono-val">[0,0,0,0,0] Kepalan = REST / Mute</div>
                    </div>

                    {/* 3D Bird Avatar as Interactive Standby Mascot Guide */}
                    <div className="hw-standby-mascot">
                      <SynthBirdAvatar mode="standby" scale={0.68} />
                      <span className="hw-mascot-caption mono-val">AETHER CROW · READY</span>
                    </div>

                    <div className="hw-zone-box right">
                      <span className="hw-zone-tag mono-val">R-HAND ZONE · AMBER</span>
                      <div className="hw-zone-title">CHORD TYPE &amp; FILTER</div>
                      <div className="hw-zone-sub mono-val">1-5 Jari = Maj/Min/7th · Tinggi Y = Cutoff</div>
                    </div>
                  </div>

                  <div className="hw-preflight-bar mono-val">
                    <span className="pf-chip ok">✓ 01. WEBCAM FEED</span>
                    <span className="pf-chip warn">● 02. TONE.JS AUDIOLOCK</span>
                    <span className="pf-chip ok">✓ 03. MEDIAPIPE + 1€ FILTER</span>
                  </div>

                  <button
                    className="hw-boot-btn"
                    onClick={handleToggleEngine}
                    disabled={isStarting}
                  >
                    {isStarting ? 'INITIALIZING ENGINE...' : 'INITIALIZE AUDIO & CAMERA'}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* RIGHT 37%: OLED Companion & Synth Module */}
          <aside className="hw-module hw-right-deck">
            <div className="hw-module-header">
              <span className="hw-section-title">OLED COMPANION &amp; SYNTH MODULE</span>
              <span className="hw-section-tag mono-val">48kHz · GAPLESS</span>
            </div>

            {/* Recessed Pitch-Black OLED Screen with 3D Bird Avatar */}
            <div className="hw-oled-screen">
              <span className="oled-screw tl" />
              <span className="oled-screw tr" />
              <span className="oled-screw bl" />
              <span className="oled-screw br" />

              <div className="oled-left-info">
                <div className="oled-status-line mono-val">
                  <span className={`oled-dot ${rootNote ? 'live' : 'mute'}`} />
                  <span>
                    {!isRunning
                      ? 'STANDBY · PRESS ENGINE ON'
                      : rootNote
                        ? `ACTIVE VOICING · ${currentPresetMeta.shortName}`
                        : 'REST · MUTE [0,0,0,0,0]'}
                  </span>
                </div>

                <div className={`oled-chord-huge ${!rootNote && isRunning ? 'is-muted' : ''}`}>
                  {!isRunning ? 'STANDBY' : chordData ? chordData.chordName.toUpperCase() : 'REST · MUTE'}
                </div>

                <div className="oled-notes-line mono-val">
                  {activeNotes.length > 0
                    ? activeNotes.join(' · ')
                    : 'TUNJUKKAN 1–5 JARI KIRI UNTUK BERMAIN'}
                </div>

                <canvas ref={oledWaveCanvasRef} className="oled-wave-canvas" />
              </div>

              {/* 3D Reactive Bird Companion inside OLED Screen */}
              <div className="oled-bird-bay">
                <SynthBirdAvatar
                  mode={birdMode}
                  rootNote={rootNote}
                  chordQuality={chordQuality}
                  isSharp={isSharp}
                  cutoffNormalized={cutoffNorm}
                  octave={octave}
                  scale={0.58}
                />
              </div>
            </div>

            {/* Mechanical Preset Keys (1x4 Tactile Switches) */}
            <div className="hw-sub-divider">
              <span>MECHANICAL PRESET KEYS</span>
            </div>
            <div className="hw-preset-keys">
              {Object.entries(PRESET_METADATA).map(([key, meta]) => {
                const isAct = presetKey === key;
                return (
                  <button
                    key={key}
                    className={`hw-keycap-preset ${isAct ? 'active' : ''}`}
                    onClick={() => handleSelectPreset(key)}
                  >
                    <div className="keycap-top-row">
                      <span className="keycap-num mono-val">{meta.code}</span>
                      <span className={`keycap-led ${isAct ? 'lit' : ''}`} />
                    </div>
                    <div className="keycap-title">{meta.shortName}</div>
                  </button>
                );
              })}
            </div>

            {/* Rotary Encoder Rack (5 Tactile SVG Knobs) */}
            <div className="hw-sub-divider">
              <span>ROTARY ENCODER RACK (DRAG OR SCROLL)</span>
            </div>
            <div className="hw-knobs-row">
              <RotaryKnob
                label="CUTOFF"
                displayValue={`${(cutoffHz / 1000).toFixed(1)}kHz`}
                value={cutoffNorm}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.65}
                accentColor="#ff9f43"
                onChange={(v) => applyCutoff(v, true)}
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
                onChange={handleChorusChange}
              />
              <RotaryKnob
                label="DELAY"
                displayValue={`${Math.round(delayWet * 100)}%`}
                value={delayWet}
                min={0}
                max={0.7}
                step={0.02}
                defaultValue={0.18}
                accentColor="#97affd"
                onChange={handleDelayChange}
              />
              <RotaryKnob
                label="REVERB"
                displayValue={`${Math.round(reverbWet * 100)}%`}
                value={reverbWet}
                min={0}
                max={0.85}
                step={0.02}
                defaultValue={0.35}
                accentColor="#97affd"
                onChange={handleReverbChange}
              />
              <RotaryKnob
                label="MASTER"
                displayValue={`${volumeDb}dB`}
                value={volumeDb}
                min={-30}
                max={4}
                step={1}
                defaultValue={-2}
                accentColor="#f4f1ea"
                onChange={handleVolumeChange}
              />
            </div>
          </aside>
        </div>

        {/* BOTTOM FULL-WIDTH DECK: 3-Octave Hardware Synth Keybed */}
        <section className="hw-module hw-keybed-deck">
          <div className="hw-keybed-row">
            {/* Left Physical Octave Transpose Switches */}
            <div className="hw-lhs-switches">
              <button
                className="hw-mech-btn"
                onClick={() => handleOctaveChange(octave - 1)}
                title="Octave Down"
              >
                <span>−</span>
                <small>OCT</small>
              </button>
              <button
                className="hw-mech-btn"
                onClick={() => handleOctaveChange(octave + 1)}
                title="Octave Up"
              >
                <span>+</span>
                <small>OCT</small>
              </button>
              <div className="hw-oct-readout mono-val">
                <span>OCTAVE</span>
                <strong>0{octave}</strong>
              </div>
              <button
                className="hw-mech-btn mute-btn"
                onClick={() => {
                  setRootNote(null);
                  setChordData(null);
                  audioEngineRef.current?.stopChord();
                }}
                title="Panic / Mute All Voices"
              >
                <span>MUTE</span>
              </button>
            </div>

            {/* 3-Octave Matte Charcoal Hardware Keybed */}
            <div className="hw-piano-bed">
              {PIANO_KEYS.map((k) => {
                const isActive = activeNotes.includes(k.noteName);
                const isBass = k.noteName === bassNote;
                return (
                  <div
                    key={k.noteName}
                    className={`hw-key ${k.isBlack ? 'black' : 'white'} ${
                      isActive ? (isBass ? 'active-bass' : 'active') : ''
                    }`}
                    style={
                      k.isBlack
                        ? { left: `${k.leftPct}%`, width: `${k.widthPct}%` }
                        : undefined
                    }
                  >
                    <span className="hw-key-led" />
                    {!k.isBlack && (
                      <span className={`hw-key-label mono-val ${k.isC ? 'is-c' : ''}`}>
                        {k.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Engraved Bottom Hardware Reference Strip */}
          <div className="hw-engraved-strip mono-val">
            <span>
              GESTURE MAP // L-HAND: <strong>[0,0,0,0,0] MUTE</strong> · 1J=C · 2J=D · 3J=E · 4J=F · 5J=G · THUMB=A · THUMB+IDX=B
            </span>
            <span>|</span>
            <span>
              R-HAND: 1J=MAJ · 2J=# SHARP · 3J=MIN · 4J=MAJ7 · 5J=MIN7
            </span>
            <span>|</span>
            <span>Y-AXIS: FILTER CUTOFF ({cutoffHz} Hz)</span>
          </div>
        </section>
      </main>

      {/* ================================================================= */}
      {/* MODE [2]: DSP MATRIX (Expanded Sound Design & Signal Flow)        */}
      {/* ================================================================= */}
      <main className={`hw-view ${activeTab === 'dsp' ? 'active' : ''}`}>
        <div className="hw-dsp-grid">
          {/* Module 1: Preset Engine Selector + Bird Filter Sweep Monitor */}
          <section className="hw-module hw-pad">
            <div className="hw-module-header">
              <span className="hw-section-title">SYNTH ENGINE &amp; AVATAR MONITOR</span>
              <span className="hw-section-tag mono-val">STATE 03 · Y-MOD</span>
            </div>
            <div className="dsp-preset-split">
              <div className="dsp-preset-cards">
                {Object.entries(PRESET_METADATA).map(([key, meta]) => (
                  <button
                    key={key}
                    className={`dsp-preset-btn ${presetKey === key ? 'active' : ''}`}
                    onClick={() => handleSelectPreset(key)}
                  >
                    <div className="dsp-p-head">
                      <span className="mono-val">{meta.code}</span>
                      <strong>{meta.name}</strong>
                    </div>
                    <div className="dsp-p-tag mono-val">{meta.tag}</div>
                  </button>
                ))}
              </div>

              <div className="dsp-bird-monitor">
                <SynthBirdAvatar
                  mode={birdMode}
                  rootNote={rootNote || 'C'}
                  chordQuality={chordQuality}
                  isSharp={isSharp}
                  cutoffNormalized={cutoffNorm}
                  octave={octave}
                  scale={0.56}
                />
                <div className="dsp-bird-readout mono-val">
                  <div>HEAD PITCH: {Math.round((0.5 - cutoffNorm) * 26)}°</div>
                  <div>Y-MOD: {Math.round(cutoffNorm * 100)}% ({cutoffHz} Hz)</div>
                </div>
              </div>
            </div>
          </section>

          {/* Module 2: ADSR Envelope & -24dB/oct Lowpass Filter Graphs */}
          <section className="hw-module hw-pad">
            <div className="hw-module-header">
              <span className="hw-section-title">ENVELOPE (ADSR) &amp; -24dB/OCT FILTER RESPONSE</span>
              <span className="hw-amber-badge mono-val">R-HAND Y-MOD · {cutoffHz} Hz</span>
            </div>
            <div className="dsp-graphs-row">
              <div className="dsp-graph-frame">
                <canvas ref={adsrCanvasRef} className="dsp-canvas" />
                <div className="dsp-graph-foot mono-val">
                  ATK {currentPresetMeta.env.attack}s | DEC {currentPresetMeta.env.decay}s | SUS{' '}
                  {currentPresetMeta.env.sustain} | REL {currentPresetMeta.env.release}s
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
          </section>

          {/* Module 3: Master DSP FX Chain */}
          <section className="hw-module hw-pad">
            <div className="hw-module-header">
              <span className="hw-section-title">MASTER DSP SIGNAL CHAIN</span>
              <span className="hw-section-tag mono-val">TONE.JS PIPELINE</span>
            </div>
            <div className="dsp-chain-row">
              <div className="dsp-node">
                <span className="dsp-node-title">01. FILTER</span>
                <span className="dsp-node-sub mono-val">Lowpass -24dB</span>
                <RotaryKnob
                  label="FREQ"
                  displayValue={`${cutoffHz} Hz`}
                  value={cutoffNorm}
                  min={0}
                  max={1}
                  step={0.01}
                  accentColor="#ff9f43"
                  onChange={(v) => applyCutoff(v, true)}
                />
              </div>
              <span className="dsp-chain-arrow mono-val">→</span>
              <div className="dsp-node">
                <span className="dsp-node-title">02. CHORUS</span>
                <span className="dsp-node-sub mono-val">1.5 Hz Stereo</span>
                <RotaryKnob
                  label="WET"
                  displayValue={`${Math.round(chorusWet * 100)}%`}
                  value={chorusWet}
                  min={0}
                  max={1}
                  step={0.02}
                  accentColor="#97affd"
                  onChange={handleChorusChange}
                />
              </div>
              <span className="dsp-chain-arrow mono-val">→</span>
              <div className="dsp-node">
                <span className="dsp-node-title">03. DELAY</span>
                <span className="dsp-node-sub mono-val">8n. Feedback</span>
                <RotaryKnob
                  label="WET"
                  displayValue={`${Math.round(delayWet * 100)}%`}
                  value={delayWet}
                  min={0}
                  max={0.7}
                  step={0.02}
                  accentColor="#97affd"
                  onChange={handleDelayChange}
                />
              </div>
              <span className="dsp-chain-arrow mono-val">→</span>
              <div className="dsp-node">
                <span className="dsp-node-title">04. REVERB</span>
                <span className="dsp-node-sub mono-val">Decay 3.5s</span>
                <RotaryKnob
                  label="SPACE"
                  displayValue={`${Math.round(reverbWet * 100)}%`}
                  value={reverbWet}
                  min={0}
                  max={0.85}
                  step={0.02}
                  accentColor="#97affd"
                  onChange={handleReverbChange}
                />
              </div>
              <span className="dsp-chain-arrow mono-val">→</span>
              <div className="dsp-node">
                <span className="dsp-node-title">05. LIMITER</span>
                <span className="dsp-node-sub mono-val">Ceiling -1.0dB</span>
                <RotaryKnob
                  label="GAIN"
                  displayValue={`${volumeDb} dB`}
                  value={volumeDb}
                  min={-30}
                  max={4}
                  step={1}
                  accentColor="#f4f1ea"
                  onChange={handleVolumeChange}
                />
              </div>
            </div>
          </section>

          {/* Module 4: Stereo VU Meter, Dual-Bank Crossfade & WebMIDI Bus */}
          <section className="hw-module hw-pad">
            <div className="hw-module-header">
              <span className="hw-section-title">MASTER BUS, STEREO VU &amp; WEBMIDI</span>
              <span className="hw-section-tag mono-val">OUTPUT STAGE</span>
            </div>
            <div className="dsp-output-bus">
              {/* 16-Segment Stereo L/R VU Meter */}
              <div className="hw-vu-box">
                {['L', 'R'].map((ch, idx) => {
                  const db = vuLevels[idx] ?? -60;
                  const norm = Math.max(0, Math.min(1, (db + 48) / 48));
                  const lit = Math.round(norm * 16);
                  return (
                    <div key={ch} className="hw-vu-col">
                      <div className="hw-vu-segments">
                        {Array.from({ length: 16 }, (_, sIdx) => {
                          const isLit = sIdx < lit;
                          const colorClass =
                            sIdx >= 14 ? 'seg-coral' : sIdx >= 11 ? 'seg-amber' : 'seg-periwinkle';
                          return (
                            <span
                              key={sIdx}
                              className={`hw-vu-seg ${isLit ? colorClass : ''}`}
                            />
                          );
                        })}
                      </div>
                      <span className="mono-val">{ch}</span>
                    </div>
                  );
                })}
              </div>

              <div className="dsp-bus-details mono-val">
                <div className="bus-row">
                  <span>DUAL-BANK CROSSFADE</span>
                  <strong>
                    BANK A {activeBank === 0 ? '●' : '○'} / BANK B {activeBank === 1 ? '●' : '○'}
                  </strong>
                </div>
                <div className="bus-row">
                  <span>ACTIVE OCTAVE</span>
                  <strong>OCTAVE 0{octave}</strong>
                </div>
                <div className="bus-row">
                  <span>WEBMIDI PORT</span>
                  <strong>{midiName}</strong>
                </div>
                <div className="bus-row">
                  <span>SMOOTHER ENGINE</span>
                  <strong>1€ FILTER (60Hz · β=0.05)</strong>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ================================================================= */}
      {/* MODE [3]: GESTURE LAB (Live Binary Debugger & Bird States Sheet)  */}
      {/* ================================================================= */}
      <main className={`hw-view ${activeTab === 'lab' ? 'active' : ''}`}>
        {/* Top Live Binary Telemetry Strip */}
        <section className="hw-module hw-tele-strip mono-val">
          <div className="tele-block">
            <span className="tele-tag periwinkle">LIVE LEFT HAND</span>
            <div className="tele-pills">
              {['thumb', 'index', 'middle', 'ring', 'pinky'].map((f) => {
                const on = Boolean(leftHandInfo.fingers && leftHandInfo.fingers[f]);
                return (
                  <span key={f} className={`tele-pill ${on ? 'on-periwinkle' : ''}`}>
                    {f.toUpperCase()}: {on ? 1 : 0}
                  </span>
                );
              })}
            </div>
            <span className="tele-out">
              → {rootNote ? `ROOT ${rootNote}` : 'REST · MUTE'} ({leftHandInfo.stabCount}/3)
            </span>
          </div>

          <div className="tele-block">
            <span className="tele-tag amber">LIVE RIGHT HAND</span>
            <div className="tele-pills">
              {['thumb', 'index', 'middle', 'ring', 'pinky'].map((f) => {
                const on = Boolean(rightHandInfo.fingers && rightHandInfo.fingers[f]);
                return (
                  <span key={f} className={`tele-pill ${on ? 'on-amber' : ''}`}>
                    {f.toUpperCase()}: {on ? 1 : 0}
                  </span>
                );
              })}
            </div>
            <span className="tele-out">
              → {isSharp ? '# SHARP' : chordQuality.toUpperCase()}
            </span>
          </div>
        </section>

        {/* 2-Column Reference Matrix */}
        <div className="hw-lab-grid">
          {/* Left Hand 8-Row Mapping Table */}
          <section className="hw-module hw-pad">
            <div className="hw-module-header">
              <span className="hw-section-title">LEFT HAND · ROOT NOTE MAPPING</span>
              <span className="hw-section-tag mono-val">[THUMB, INDEX, MID, RING, PINKY]</span>
            </div>
            <div className="hw-map-list">
              {LEFT_GESTURE_ROWS.map((row) => {
                const isMatched =
                  (!rootNote && row.key === 'REST') || (rootNote && row.key === rootNote);
                return (
                  <div
                    key={row.key}
                    className={`hw-map-row ${
                      isMatched ? (row.isRest ? 'matched-rest' : 'matched-left') : ''
                    }`}
                  >
                    <span className="map-name">{row.desc}</span>
                    <span className="map-vec mono-val">{row.vec}</span>
                    <span className={`map-target mono-val ${row.isRest ? 'rest' : ''}`}>
                      {row.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Right Hand 5-Row Mapping Table + Bird Reactive State Preview */}
          <section className="hw-module hw-pad">
            <div className="hw-module-header">
              <span className="hw-section-title">RIGHT HAND · CHORD QUALITY &amp; Y-AXIS</span>
              <span className="hw-section-tag mono-val">INTERVALS</span>
            </div>
            <div className="hw-map-list">
              {RIGHT_GESTURE_ROWS.map((row) => {
                const isMatched = activeQualityKey === row.key;
                return (
                  <div
                    key={row.key}
                    className={`hw-map-row ${isMatched ? 'matched-right' : ''}`}
                  >
                    <span className="map-name">{row.desc}</span>
                    <span className="map-vec mono-val">{row.vec}</span>
                    <span className="map-target mono-val">{row.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Live Y-Axis Expression + Bird Avatar Preview */}
            <div className="hw-lab-bird-card">
              <SynthBirdAvatar
                mode={birdMode}
                rootNote={rootNote}
                chordQuality={chordQuality}
                isSharp={isSharp}
                cutoffNormalized={cutoffNorm}
                octave={octave}
                scale={0.52}
              />
              <div className="lab-bird-info mono-val">
                <div className="lab-bird-title">3D BIRD COMPANION REACTIVITY</div>
                <div>• [0,0,0,0,0] Kepalan → Bird rests &amp; closes eyes (Mute)</div>
                <div>• Root C–B Active → Bird walks &amp; grooves on soundwave</div>
                <div>• R-Hand Y-Axis ({cutoffHz} Hz) → Bird tilts head up/down</div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
