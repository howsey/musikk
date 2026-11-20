import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getFingerStates, classifyLeftHand, classifyRightHand, GestureStabilizer } from './gestureDetector.js';
import { HandLandmarkSmoother, OneEuroFilter } from './oneEuroFilter.js';
import { getChordNotes } from './musicTheory.js';
import { AudioEngine } from './audioEngine.js';
import { Visualizer } from './visualizer.js';
import {
  BUILT_IN_SOUNDS,
  DEFAULT_SOUND,
  ROOTS,
  QUALITY_KEYS,
  cutoffToNorm,
  normToCutoff
} from './sounds.js';
import { samplesToAudioBuffer } from './soundLab.js';
import { listSounds, saveSound, deleteSound } from './soundStore.js';
import {
  drawWaveformLine,
  drawADSRGraph,
  drawFilterGraph
} from './soundRackCanvas.js';

import HardwareTopbar from './components/HardwareTopbar.jsx';
import CameraViewfinder from './components/CameraViewfinder.jsx';
import OledCompanionDeck from './components/OledCompanionDeck.jsx';
import HardwareKeybed from './components/HardwareKeybed.jsx';
import SoundsView from './components/SoundsView.jsx';
import DspMatrixView from './components/DspMatrixView.jsx';
import GestureLabView from './components/GestureLabView.jsx';

function formatBinaryVec(fs) {
  if (!fs) return '[0,0,0,0,0]';
  return `[${fs.thumb ? 1 : 0},${fs.index ? 1 : 0},${fs.middle ? 1 : 0},${fs.ring ? 1 : 0},${fs.pinky ? 1 : 0}]`;
}

export default function App() {
  // Navigation & Engine Status
  const [activeTab, setActiveTab] = useState('play'); // 'play' | 'sounds' | 'tune' | 'learn'
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [lightingWarning, setLightingWarning] = useState(false);
  const [recorderOpenSignal, setRecorderOpenSignal] = useState(0);

  // Accessibility & Input Settings
  const [settings, setSettings] = useState(() => ({
    swapHands: false,
    keyboardMode: false,
    reducedMotion:
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    showDebug: false
  }));

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  // Musical & Gesture State
  const [rootNote, setRootNote] = useState(null);
  const [chordQuality, setChordQuality] = useState('Major');
  const [isSharp, setIsSharp] = useState(false);
  const [chordData, setChordData] = useState(null);
  const [octave, setOctave] = useState(3);

  // Sound Library State (Built-in + User Recorded Custom Sounds from IndexedDB)
  const [activeSound, setActiveSound] = useState(DEFAULT_SOUND);
  const [customSounds, setCustomSounds] = useState([]);

  // Hand Telemetry State
  const [leftHandInfo, setLeftHandInfo] = useState({
    detected: false,
    fingers: null,
    vecStr: '[0,0,0,0,0]',
    gestureName: 'Stopped',
    stabCount: 0
  });
  const [rightHandInfo, setRightHandInfo] = useState({
    detected: false,
    fingers: null,
    vecStr: '[0,0,0,0,0]',
    gestureName: 'Major'
  });

  // Synth Parameters State
  const [cutoffNorm, setCutoffNorm] = useState(0.65);
  const [cutoffHz, setCutoffHz] = useState(3200);
  const [chorusWet, setChorusWet] = useState(0.3);
  const [delayWet, setDelayWet] = useState(0.18);
  const [reverbWet, setReverbWet] = useState(0.35);
  const [volumeDb, setVolumeDb] = useState(-2);
  const [activeBank, setActiveBank] = useState(0);
  const [midiName, setMidiName] = useState('No MIDI device');

  // Mutable Engine & DOM Refs
  const videoRef = useRef(null);
  const visionCanvasRef = useRef(null);
  const oledWaveCanvasRef = useRef(null);
  const adsrCanvasRef = useRef(null);
  const filterCanvasRef = useRef(null);
  const vuLeftRef = useRef(null);
  const vuRightRef = useRef(null);

  const audioEngineRef = useRef(null);
  const visualizerRef = useRef(null);
  const handsInstanceRef = useRef(null);
  const isRunningRef = useRef(false);

  // Deduplication & Dropout Tracking Refs
  const lastTelemetryRef = useRef({
    leftKey: '',
    rightKey: '',
    chordKey: '',
    lastCutoffUiUpdateMs: 0,
    liveCutoffHz: 3200,
    liveCutoffNorm: 0.65,
    wasHandPresent: false,
    dropoutTimes: []
  });

  // 1-Euro Kinematic Smoothers & Consensus Stabilizers
  const leftSmootherRef = useRef(new HandLandmarkSmoother(21));
  const rightSmootherRef = useRef(new HandLandmarkSmoother(21));
  const yCutoffFilterRef = useRef(new OneEuroFilter(60, 1.2, 0.04, 1.0));
  const leftStabilizerRef = useRef(new GestureStabilizer(3));
  const rightStabilizerRef = useRef(new GestureStabilizer(3));

  const stateRef = useRef({
    rootNote: null,
    chordQuality: 'Major',
    isSharp: false,
    octave: 3,
    cutoffNorm: 0.65,
    cutoffHz: 3200,
    swapHands: false
  });

  useEffect(() => {
    stateRef.current = {
      rootNote,
      chordQuality,
      isSharp,
      octave,
      cutoffNorm,
      cutoffHz,
      swapHands: settings.swapHands
    };
  }, [rootNote, chordQuality, isSharp, octave, cutoffNorm, cutoffHz, settings.swapHands]);

  // Initialize singleton AudioEngine, Visualizer & Load Custom Sounds from IndexedDB
  useEffect(() => {
    audioEngineRef.current = new AudioEngine();
    visualizerRef.current = new Visualizer(visionCanvasRef.current);

    listSounds()
      .then((saved) => setCustomSounds(saved))
      .catch((err) => console.warn('IndexedDB sound store notice:', err));
  }, []);

  useEffect(() => {
    if (visualizerRef.current && visionCanvasRef.current) {
      visualizerRef.current.setCanvas(visionCanvasRef.current);
    }
  }, [activeTab]);

  // Ensure AudioEngine is initialized on any user interaction
  const ensureAudioReady = useCallback(async () => {
    const engine = audioEngineRef.current;
    if (engine && !engine.isStarted) {
      await engine.init();
      setMidiName(engine.getMidiStatus());
    }
    return engine;
  }, []);

  // Fast-path Cutoff Updater
  const applyCutoff = useCallback((normVal, updateAudio = true, forceUi = false) => {
    const clamped = Math.max(0, Math.min(1, normVal));
    const engine = audioEngineRef.current;
    const hz =
      updateAudio && engine
        ? engine.setFilterModulation(clamped) || normToCutoff(clamped)
        : normToCutoff(clamped);

    lastTelemetryRef.current.liveCutoffHz = hz;
    lastTelemetryRef.current.liveCutoffNorm = clamped;

    const now = performance.now();
    const hzDiff = Math.abs(hz - stateRef.current.cutoffHz);
    if (forceUi || (hzDiff >= 35 && now - lastTelemetryRef.current.lastCutoffUiUpdateMs > 75)) {
      lastTelemetryRef.current.lastCutoffUiUpdateMs = now;
      setCutoffNorm(Number(clamped.toFixed(2)));
      setCutoffHz(hz);
    }
  }, []);

  // Trigger or Stop Chord Helper (Shared by Hand Tracking, Keyboard Mode & Practice Mode)
  const triggerChordState = useCallback((nextRoot, nextQuality, nextSharp, nextOctave) => {
    const engine = audioEngineRef.current;
    const nextChordKey = `${nextRoot || 'REST'}|${nextQuality}|${nextSharp}|${nextOctave}`;

    if (lastTelemetryRef.current.chordKey !== nextChordKey) {
      lastTelemetryRef.current.chordKey = nextChordKey;
      setRootNote(nextRoot);
      setChordQuality(nextQuality);
      setIsSharp(nextSharp);

      if (nextRoot && engine) {
        const info = getChordNotes(nextRoot, nextSharp, nextQuality, nextOctave);
        setChordData(info);
        engine.playChord(info);
        setActiveBank(engine.getActiveBank());
      } else if (engine) {
        setChordData(null);
        engine.stopChord();
      }
    }
  }, []);

  // MediaPipe Hand Tracking Callback
  const onHandResults = useCallback(
    (results) => {
      const video = videoRef.current;
      const visualizer = visualizerRef.current;
      const nowMs = performance.now();

      if (video && visualizer) {
        visualizer.resize(video.videoWidth || 640, video.videoHeight || 480);
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

      // Apply Swap Hands if user enabled Left-Handed Mode
      const rootRaw = stateRef.current.swapHands ? rawRight : rawLeft;
      const chordRaw = stateRef.current.swapHands ? rawLeft : rawRight;

      const smoothRoot = rootRaw ? leftSmootherRef.current.smooth(rootRaw, nowMs) : null;
      const smoothChord = chordRaw ? rightSmootherRef.current.smooth(chordRaw, nowMs) : null;

      // Track hand drop-outs for lighting help
      const anyHandNow = Boolean(smoothRoot || smoothChord);
      if (lastTelemetryRef.current.wasHandPresent && !anyHandNow) {
        const recent = lastTelemetryRef.current.dropoutTimes.filter((t) => nowMs - t < 10000);
        recent.push(nowMs);
        lastTelemetryRef.current.dropoutTimes = recent;
        if (recent.length >= 4) {
          setLightingWarning(true);
        }
      }
      lastTelemetryRef.current.wasHandPresent = anyHandNow;

      // Draw lightweight vector skeletons (Root = circle joints, Chord = square joints)
      if (visualizer) {
        const handsToDraw = [];
        if (smoothRoot) handsToDraw.push({ role: 'root', landmarks: smoothRoot });
        if (smoothChord) handsToDraw.push({ role: 'chord', landmarks: smoothChord });
        visualizer.render(handsToDraw);
      }

      // --- 1. ROOT HAND ---
      let nextRoot = stateRef.current.rootNote;
      if (smoothRoot) {
        const fs = getFingerStates(smoothRoot, false);
        const cls = classifyLeftHand(fs);
        const stableRoot = leftStabilizerRef.current.update(cls.root);

        if (stableRoot === 'REST') nextRoot = null;
        else if (stableRoot !== null) nextRoot = stableRoot;

        const vecStr = formatBinaryVec(fs);
        const stabCount = Math.min(leftStabilizerRef.current.candidateCount, 3);
        const leftKey = `1|${vecStr}|${cls.gestureName}|${stabCount}`;

        if (lastTelemetryRef.current.leftKey !== leftKey) {
          lastTelemetryRef.current.leftKey = leftKey;
          setLeftHandInfo({
            detected: true,
            fingers: fs,
            vecStr,
            gestureName: cls.gestureName,
            stabCount
          });
        }
      } else {
        leftSmootherRef.current.reset();
        leftStabilizerRef.current.reset();
        nextRoot = null;

        if (lastTelemetryRef.current.leftKey !== '0') {
          lastTelemetryRef.current.leftKey = '0';
          setLeftHandInfo({
            detected: false,
            fingers: null,
            vecStr: '[0,0,0,0,0]',
            gestureName: 'No Hand',
            stabCount: 0
          });
        }
      }

      // --- 2. CHORD & TONE HAND ---
      let nextQuality = stateRef.current.chordQuality;
      let nextSharp = stateRef.current.isSharp;

      if (smoothChord) {
        const fs = getFingerStates(smoothChord, true);
        const cls = classifyRightHand(fs);
        const gName = cls ? cls.gestureName : nextQuality;

        if (cls) {
          const stableKey = rightStabilizerRef.current.update(`${cls.quality}|${cls.isSharp}`);
          if (stableKey) {
            const [q, sh] = stableKey.split('|');
            nextQuality = q;
            nextSharp = sh === 'true';
          }
        }

        const rawNormY = Math.max(0, Math.min(1, 1.0 - smoothChord[0].y));
        const smoothedNormY = Math.max(
          0,
          Math.min(1, yCutoffFilterRef.current.filter(rawNormY, nowMs))
        );
        applyCutoff(smoothedNormY, true, false);

        const vecStr = formatBinaryVec(fs);
        const rightKey = `1|${vecStr}|${gName}`;
        if (lastTelemetryRef.current.rightKey !== rightKey) {
          lastTelemetryRef.current.rightKey = rightKey;
          setRightHandInfo({
            detected: true,
            fingers: fs,
            vecStr,
            gestureName: gName
          });
        }
      } else {
        rightSmootherRef.current.reset();
        rightStabilizerRef.current.reset();
        if (lastTelemetryRef.current.rightKey !== '0') {
          lastTelemetryRef.current.rightKey = '0';
          setRightHandInfo((prev) => ({
            ...prev,
            detected: false,
            fingers: null,
            vecStr: '[0,0,0,0,0]'
          }));
        }
      }

      triggerChordState(nextRoot, nextQuality, nextSharp, stateRef.current.octave);
    },
    [applyCutoff, triggerChordState]
  );

  useEffect(() => {
    if (handsInstanceRef.current) {
      handsInstanceRef.current.onResults(onHandResults);
    }
  }, [onHandResults]);

  // Global Keyboard Shortcuts (1-7 = C-B, 0 = Stop, Q-T = Quality, Shift+D = Debug)
  useEffect(() => {
    const handleKeyDown = async (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        updateSettings({ showDebug: !settings.showDebug });
        return;
      }

      // Number keys 1..7 play C..B; 0 stops
      if (e.key >= '1' && e.key <= '7') {
        e.preventDefault();
        await ensureAudioReady();
        updateSettings({ keyboardMode: true });
        const root = ROOTS[parseInt(e.key, 10) - 1];
        triggerChordState(
          root,
          stateRef.current.chordQuality,
          stateRef.current.isSharp,
          stateRef.current.octave
        );
      } else if (e.key === '0' || e.key === 'Escape') {
        triggerChordState(
          null,
          stateRef.current.chordQuality,
          stateRef.current.isSharp,
          stateRef.current.octave
        );
      } else {
        const qMatch = QUALITY_KEYS[e.key.toLowerCase()];
        if (qMatch) {
          e.preventDefault();
          await ensureAudioReady();
          updateSettings({ keyboardMode: true });
          triggerChordState(
            stateRef.current.rootNote || 'C',
            qMatch.quality,
            qMatch.isSharp,
            stateRef.current.octave
          );
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ensureAudioReady, triggerChordState, settings.showDebug, updateSettings]);

  // Direct DOM Stereo VU Updater
  const updateDirectVuDom = (container, dbVal) => {
    if (!container) return;
    const segs = container.children;
    const total = segs.length;
    const norm = Math.max(0, Math.min(1, (dbVal + 48) / 48));
    const lit = Math.round(norm * total);

    for (let i = 0; i < total; i++) {
      const colorClass =
        i >= 14 ? 'seg-coral' : i >= 11 ? 'seg-amber' : 'seg-periwinkle';
      segs[i].className = i < lit ? `hw-vu-seg ${colorClass}` : 'hw-vu-seg';
    }
  };

  // Lightweight Canvas & Direct DOM Loop
  useEffect(() => {
    let rafId;
    const tick = () => {
      const engine = audioEngineRef.current;
      const playing = Boolean(stateRef.current.rootNote);

      if (oledWaveCanvasRef.current && engine && activeTab === 'play') {
        drawWaveformLine(oledWaveCanvasRef.current, engine.getWaveformData(), playing);
      }

      if (activeTab === 'tune') {
        if (adsrCanvasRef.current) {
          const builtIn =
            BUILT_IN_SOUNDS[activeSound.id] || BUILT_IN_SOUNDS.ambient_pad;
          drawADSRGraph(adsrCanvasRef.current, builtIn.synth.envelope);
        }
        if (filterCanvasRef.current) {
          drawFilterGraph(filterCanvasRef.current, lastTelemetryRef.current.liveCutoffHz);
        }
        if (engine && engine.isStarted && typeof engine.getMeterLevels === 'function') {
          const [lDb, rDb] = engine.getMeterLevels();
          updateDirectVuDom(vuLeftRef.current, lDb);
          updateDirectVuDom(vuRightRef.current, rDb);
        }
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [activeSound, activeTab]);

  // Start / Stop Camera & Audio Engine (Inline error recovery instead of alert())
  const handleToggleEngine = async () => {
    const engine = audioEngineRef.current;
    const video = videoRef.current;

    if (!isRunning) {
      setIsStarting(true);
      setCameraError(null);
      try {
        await ensureAudioReady();

        if (!window.Hands) {
          throw new Error('The local MediaPipe hand-tracking model could not be loaded.');
        }

        if (!handsInstanceRef.current) {
          const hands = new window.Hands({
            locateFile: (file) => `/@mediapipe/hands/${file}`
          });
          hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.65,
            minTrackingConfidence: 0.6
          });
          hands.onResults(onHandResults);
          handsInstanceRef.current = hands;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 30 },
            facingMode: 'user'
          },
          audio: false
        });

        video.srcObject = stream;
        await video.play();

        isRunningRef.current = true;
        setIsRunning(true);
        setIsStarting(false);

        let busy = false;
        let lastInferenceMs = 0;
        const INFERENCE_INTERVAL_MS = 32;

        const pumpFrame = async (nowMs) => {
          if (!isRunningRef.current) return;
          if (
            !busy &&
            nowMs - lastInferenceMs >= INFERENCE_INTERVAL_MS &&
            video.readyState >= 2 &&
            handsInstanceRef.current
          ) {
            busy = true;
            lastInferenceMs = nowMs;
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
        console.warn('Camera start error:', err);
        setCameraError(
          err?.message ||
            'Camera permission was denied or another app is using the webcam.'
        );
        setIsStarting(false);
      }
    } else {
      isRunningRef.current = false;
      setIsRunning(false);
      engine?.stopChord();
      setRootNote(null);
      setChordData(null);
      lastTelemetryRef.current.chordKey = '';

      if (visualizerRef.current) {
        visualizerRef.current.clear();
      }

      if (video && video.srcObject) {
        video.srcObject.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    }
  };

  // Switch to Keyboard Play Mode without needing a webcam
  const handleEnableKeyboardMode = async () => {
    await ensureAudioReady();
    updateSettings({ keyboardMode: true });
    setCameraError(null);
    triggerChordState('C', chordQuality, isSharp, octave);
  };

  // Built-in & Custom Sound Handlers
  const handleSelectBuiltIn = async (presetId) => {
    const engine = await ensureAudioReady();
    setActiveSound({ type: 'builtin', id: presetId });
    engine.setPreset(presetId);

    const sound = BUILT_IN_SOUNDS[presetId];
    if (sound) {
      applyCutoff(cutoffToNorm(sound.cutoff), false, true);
      setReverbWet(sound.reverb);
    }

    if (rootNote) {
      lastTelemetryRef.current.chordKey = '';
      triggerChordState(rootNote, chordQuality, isSharp, octave);
    }
  };

  const handlePreviewBuiltIn = async (presetId) => {
    const engine = await ensureAudioReady();
    engine.previewBuiltIn(presetId);
  };

  const handleSelectCustomSound = async (soundId, previewAfterLoad = false) => {
    const snd = customSounds.find((s) => s.id === soundId);
    if (!snd) return;
    const engine = await ensureAudioReady();
    const audioBuf = samplesToAudioBuffer(
      new Float32Array(snd.samples),
      snd.sampleRate || 44100
    );
    await engine.loadCustomSound({ buffer: audioBuf, rootNote: snd.rootNote });
    setActiveSound({ type: 'custom', id: snd.id });

    if (previewAfterLoad) {
      engine.previewBuffer(audioBuf, snd.rootNote, ['C4', 'E4', 'G4'], snd.id);
    } else if (rootNote) {
      lastTelemetryRef.current.chordKey = '';
      triggerChordState(rootNote, chordQuality, isSharp, octave);
    }
  };

  const handlePreviewCustomBuffer = async (buffer, detectedRoot, notes, cacheKey) => {
    const engine = await ensureAudioReady();
    engine.previewBuffer(buffer, detectedRoot, notes, cacheKey);
  };

  const handleSaveCustomSound = async (newSoundObj) => {
    await saveSound(newSoundObj);
    const updated = await listSounds();
    setCustomSounds(updated);

    const engine = await ensureAudioReady();
    const audioBuf = samplesToAudioBuffer(
      new Float32Array(newSoundObj.samples),
      newSoundObj.sampleRate || 44100
    );
    await engine.loadCustomSound({ buffer: audioBuf, rootNote: newSoundObj.rootNote });
    setActiveSound({ type: 'custom', id: newSoundObj.id });
    setActiveTab('play');
  };

  const handleDeleteCustomSound = async (id) => {
    await deleteSound(id);
    const updated = await listSounds();
    setCustomSounds(updated);
    if (activeSound.type === 'custom' && activeSound.id === id) {
      handleSelectBuiltIn('ambient_pad');
    }
  };

  // Parameter Handlers
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
      triggerChordState(rootNote, chordQuality, isSharp, clamped);
    }
  };

  const handleMuteAll = () => {
    triggerChordState(null, chordQuality, isSharp, octave);
  };

  const handleClickKeyRoot = async (clickedRoot, clickedSharp) => {
    await ensureAudioReady();
    updateSettings({ keyboardMode: true });
    triggerChordState(clickedRoot, chordQuality, clickedSharp, octave);
  };

  const handleTriggerPracticeChord = async (practiceRoot, practiceQualityKey) => {
    await ensureAudioReady();
    const nextR = practiceRoot === undefined ? rootNote || 'C' : practiceRoot;
    let nextQ = chordQuality;
    let nextS = isSharp;
    if (practiceQualityKey !== undefined) {
      if (practiceQualityKey === 'Sharp') {
        nextS = true;
      } else {
        nextQ = practiceQualityKey;
        nextS = false;
      }
    }
    triggerChordState(nextR, nextQ, nextS, octave);
  };

  const birdMode =
    !isRunning && !settings.keyboardMode
      ? 'standby'
      : rootNote
        ? 'playing'
        : 'rest';
  const activeNotes = chordData ? chordData.notes : [];
  const bassNote = activeNotes[0] || '';
  const activeQualityKey = isSharp ? 'Sharp' : chordQuality;

  return (
    <div className="hw-chassis">
      <HardwareTopbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isRunning={isRunning}
        isStarting={isStarting}
        midiName={midiName}
        customSoundCount={customSounds.length}
        settings={settings}
        onUpdateSettings={updateSettings}
        onToggleEngine={handleToggleEngine}
      />

      {/* VIEW 1: PLAY */}
      <main className={`hw-view ${activeTab === 'play' ? 'active' : ''}`}>
        <div className="hw-studio-upper">
          <CameraViewfinder
            videoRef={videoRef}
            visionCanvasRef={visionCanvasRef}
            isRunning={isRunning}
            isStarting={isStarting}
            cameraError={cameraError}
            lightingWarning={lightingWarning}
            onDismissLightingWarning={() => setLightingWarning(false)}
            leftHandInfo={leftHandInfo}
            rightHandInfo={rightHandInfo}
            rootNote={rootNote}
            isSharp={isSharp}
            chordQuality={chordQuality}
            cutoffHz={cutoffHz}
            activeBank={activeBank}
            octave={octave}
            settings={settings}
            onEnableKeyboardMode={handleEnableKeyboardMode}
            onToggleEngine={handleToggleEngine}
          />

          <OledCompanionDeck
            isRunning={isRunning}
            keyboardMode={settings.keyboardMode}
            reducedMotion={settings.reducedMotion}
            rootNote={rootNote}
            chordData={chordData}
            activeNotes={activeNotes}
            oledWaveCanvasRef={oledWaveCanvasRef}
            birdMode={birdMode}
            chordQuality={chordQuality}
            isSharp={isSharp}
            cutoffNorm={cutoffNorm}
            cutoffHz={cutoffHz}
            octave={octave}
            activeSound={activeSound}
            customSounds={customSounds}
            onSelectBuiltIn={handleSelectBuiltIn}
            onSelectCustomSound={(id) => handleSelectCustomSound(id, false)}
            onOpenRecorder={() => {
              setActiveTab('sounds');
              setRecorderOpenSignal((n) => n + 1);
            }}
            onCutoffChange={(v) => applyCutoff(v, true, true)}
            reverbWet={reverbWet}
            onReverbChange={handleReverbChange}
            volumeDb={volumeDb}
            onVolumeChange={handleVolumeChange}
            onOctaveChange={handleOctaveChange}
          />
        </div>

        <HardwareKeybed
          octave={octave}
          activeNotes={activeNotes}
          bassNote={bassNote}
          onOctaveChange={handleOctaveChange}
          onMuteAll={handleMuteAll}
          onClickKeyRoot={handleClickKeyRoot}
        />
      </main>

      {/* VIEW 2: SOUNDS (Built-in Instruments + Record & Autotune C-B) */}
      <SoundsView
        active={activeTab === 'sounds'}
        recorderOpenSignal={recorderOpenSignal}
        activeSound={activeSound}
        customSounds={customSounds}
        onSelectBuiltIn={handleSelectBuiltIn}
        onPreviewBuiltIn={handlePreviewBuiltIn}
        onSelectCustomSound={handleSelectCustomSound}
        onPreviewCustomBuffer={handlePreviewCustomBuffer}
        onSaveCustomSound={handleSaveCustomSound}
        onDeleteCustomSound={handleDeleteCustomSound}
      />

      {/* VIEW 3: TUNE */}
      <DspMatrixView
        active={activeTab === 'tune'}
        activeSound={activeSound}
        cutoffNorm={cutoffNorm}
        cutoffHz={cutoffHz}
        onCutoffChange={(v) => applyCutoff(v, true, true)}
        chorusWet={chorusWet}
        onChorusChange={handleChorusChange}
        delayWet={delayWet}
        onDelayChange={handleDelayChange}
        reverbWet={reverbWet}
        onReverbChange={handleReverbChange}
        volumeDb={volumeDb}
        onVolumeChange={handleVolumeChange}
        octave={octave}
        onOctaveChange={handleOctaveChange}
        adsrCanvasRef={adsrCanvasRef}
        filterCanvasRef={filterCanvasRef}
        vuLeftRef={vuLeftRef}
        vuRightRef={vuRightRef}
        activeBank={activeBank}
        midiName={midiName}
      />

      {/* VIEW 4: LEARN */}
      <GestureLabView
        active={activeTab === 'learn'}
        rootNote={rootNote}
        activeQualityKey={activeQualityKey}
        swapHands={settings.swapHands}
        onTriggerPracticeChord={handleTriggerPracticeChord}
      />
    </div>
  );
}
