import './style.css';
import { getFingerStates, classifyLeftHand, classifyRightHand, GestureStabilizer } from './gestureDetector.js';
import { getChordNotes } from './musicTheory.js';
import { AudioEngine } from './audioEngine.js';
import { Visualizer } from './visualizer.js';

// DOM Elements
const videoElement = document.getElementById('webcam-video');
const canvasElement = document.getElementById('vision-canvas');
const btnToggleEngine = document.getElementById('btn-toggle-engine');
const cameraStatusBadge = document.getElementById('camera-status');
const audioStatusBadge = document.getElementById('audio-status');

// HUD Elements
const leftHandCard = document.getElementById('card-left-hand');
const leftHandStatus = document.getElementById('left-hand-status');
const leftNoteDisplay = document.getElementById('left-note-display');
const leftGestureName = document.getElementById('left-gesture-name');
const leftFingersDetail = document.getElementById('left-fingers-detail');
const leftFingersBar = document.getElementById('left-fingers-bar');

const rightHandCard = document.getElementById('card-right-hand');
const rightHandStatus = document.getElementById('right-hand-status');
const rightTypeDisplay = document.getElementById('right-type-display');
const rightGestureName = document.getElementById('right-gesture-name');
const rightFingersDetail = document.getElementById('right-fingers-detail');
const rightFingersBar = document.getElementById('right-fingers-bar');

const currentChordNameElem = document.getElementById('current-chord-name');
const currentChordNotesElem = document.getElementById('current-chord-notes');
const soundIndicator = document.getElementById('sound-indicator');
const pianoStrip = document.getElementById('piano-strip');

// Sidebar controls
const presetButtons = document.querySelectorAll('.preset-btn');
const sliderCutoff = document.getElementById('slider-cutoff');
const sliderReverb = document.getElementById('slider-reverb');
const sliderVolume = document.getElementById('slider-volume');
const cutoffValElem = document.getElementById('cutoff-val');
const reverbValElem = document.getElementById('reverb-val');
const volValElem = document.getElementById('vol-val');

const btnOctDown = document.getElementById('btn-oct-down');
const btnOctUp = document.getElementById('btn-oct-up');
const octDisplay = document.getElementById('oct-display');

const tabLeftBtn = document.getElementById('tab-left-btn');
const tabRightBtn = document.getElementById('tab-right-btn');
const tabLeftContent = document.getElementById('tab-left-content');
const tabRightContent = document.getElementById('tab-right-content');

// Instances
const audioEngine = new AudioEngine();
const visualizer = new Visualizer(canvasElement);

const leftStabilizer = new GestureStabilizer(3);   // 3 stable frames to switch
const rightStabilizer = new GestureStabilizer(3);

let isRunning = false;
let cameraInstance = null;
let handsInstance = null;

// State
let currentRoot = null;
let currentQuality = 'Major';
let currentIsSharp = false;
let currentChordData = null;
let baseOctave = 3;

// Initialize Virtual Piano Keyboard (3 Octaves: Octave 2, 3, 4)
function buildPianoKeyboard() {
  pianoStrip.innerHTML = '';
  const notesOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const startOctave = 2;
  const numOctaves = 3;

  let whiteKeyIndex = 0;
  const whiteKeyWidthPercent = 100 / (numOctaves * 7);

  for (let oct = startOctave; oct < startOctave + numOctaves; oct++) {
    for (const note of notesOrder) {
      const isBlack = note.includes('#');
      const noteName = `${note}${oct}`;
      const keyElem = document.createElement('div');
      keyElem.classList.add('piano-key');
      keyElem.dataset.note = noteName;

      if (isBlack) {
        keyElem.classList.add('black');
        // Position black key between corresponding white keys
        const leftPos = (whiteKeyIndex - 0.35) * whiteKeyWidthPercent;
        keyElem.style.left = `${leftPos}%`;
        keyElem.style.width = `${whiteKeyWidthPercent * 0.7}%`;
      } else {
        keyElem.classList.add('white');
        whiteKeyIndex++;
      }

      pianoStrip.appendChild(keyElem);
    }
  }
}

// Update illuminated keys on the piano keyboard
function updatePianoKeys(activeNotes = [], bassNote = '') {
  const allKeys = pianoStrip.querySelectorAll('.piano-key');
  allKeys.forEach(k => {
    k.classList.remove('active-note', 'active-root');
  });

  activeNotes.forEach(note => {
    const key = pianoStrip.querySelector(`[data-note="${note}"]`);
    if (key) {
      if (note === bassNote) {
        key.classList.add('active-root');
      } else {
        key.classList.add('active-note');
      }
    }
  });
}

// Setup MediaPipe Hands
async function setupMediaPipe() {
  let HandsClass = window.Hands;
  if (!HandsClass) {
    const mp = await import('@mediapipe/hands');
    HandsClass = mp.Hands || mp.default?.Hands || mp.default;
  }

  if (!HandsClass) {
    throw new Error('Pustaka MediaPipe Hands tidak ditemukan. Pastikan file script termuat.');
  }

  handsInstance = new HandsClass({
    locateFile: (file) => `/@mediapipe/hands/${file}`
  });

  handsInstance.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });

  handsInstance.onResults(onHandResults);

  // Setup camera stream via native getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Browser tidak mengizinkan akses kamera atau protokol tidak aman (gunakan http://localhost).');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user'
    },
    audio: false
  });

  videoElement.srcObject = stream;
  
  // Safe video play without promise hanging
  try {
    await videoElement.play();
  } catch (err) {
    console.warn('Video play warning:', err);
  }

  // Size canvas to video dimensions
  canvasElement.width = videoElement.videoWidth || 1280;
  canvasElement.height = videoElement.videoHeight || 720;

  // Process frames loop with concurrency lock
  let isProcessingFrame = false;
  async function processVideoFrame() {
    if (!isRunning) return;
    if (!isProcessingFrame && videoElement.readyState >= 2 && handsInstance) {
      isProcessingFrame = true;
      try {
        await handsInstance.send({ image: videoElement });
      } catch (err) {
        console.warn('Tracking frame warning:', err);
      } finally {
        isProcessingFrame = false;
      }
    }
    if (isRunning) {
      requestAnimationFrame(processVideoFrame);
    }
  }
  requestAnimationFrame(processVideoFrame);
}


// Update finger status pills in HUD
function updateFingerPills(container, fingerStates) {
  const pills = container.querySelectorAll('.f-pill');
  pills.forEach(pill => {
    const fingerName = pill.dataset.finger;
    if (fingerStates && fingerStates[fingerName]) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });
}

// Highlight active item in Cheat Sheet
function updateCheatSheetHighlight(root, quality, isSharp) {
  document.querySelectorAll('#tab-left-content .gesture-item').forEach(item => {
    if (root && item.dataset.gesture === root) {
      item.classList.add('highlighted');
    } else {
      item.classList.remove('highlighted');
    }
  });

  const qualityKey = isSharp ? 'Sharp' : quality;
  document.querySelectorAll('#tab-right-content .gesture-item').forEach(item => {
    if (item.dataset.gesture === qualityKey) {
      item.classList.add('highlighted');
    } else {
      item.classList.remove('highlighted');
    }
  });
}

// Main Hand Tracking Callback
function onHandResults(results) {
  visualizer.resize(videoElement.videoWidth, videoElement.videoHeight);
  visualizer.render(videoElement, results, currentChordData, audioEngine);

  let leftHandLandmarks = null;
  let rightHandLandmarks = null;

  if (results.multiHandLandmarks && results.multiHandedness) {
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const landmarks = results.multiHandLandmarks[i];
      const handedness = results.multiHandedness[i];
      // MediaPipe label 'Left' matches user's physical left hand in mirror mode
      if (handedness.label === 'Left') {
        leftHandLandmarks = landmarks;
      } else {
        rightHandLandmarks = landmarks;
      }
    }
  }

  // --- 1. PROCESS LEFT HAND (Root Note) ---
  if (leftHandLandmarks) {
    leftHandCard.classList.add('detected');
    leftHandStatus.textContent = 'Terdeteksi ✓';

    const fingerStates = getFingerStates(leftHandLandmarks, false);
    updateFingerPills(leftFingersBar, fingerStates);

    const classification = classifyLeftHand(fingerStates);
    const stableRoot = leftStabilizer.update(classification.root);

    leftNoteDisplay.textContent = classification.root || '-';
    leftGestureName.textContent = classification.gestureName;
    leftFingersDetail.textContent = classification.fingersDesc;

    if (stableRoot !== null) {
      currentRoot = stableRoot;
    }
  } else {
    leftHandCard.classList.remove('detected');
    leftHandStatus.textContent = 'Mencari tangan...';
    updateFingerPills(leftFingersBar, null);
    leftStabilizer.reset();
  }

  // --- 2. PROCESS RIGHT HAND (Chord Quality & Expression) ---
  if (rightHandLandmarks) {
    rightHandCard.classList.add('detected');
    rightHandStatus.textContent = 'Terdeteksi ✓';

    const fingerStates = getFingerStates(rightHandLandmarks, true);
    updateFingerPills(rightFingersBar, fingerStates);

    const classification = classifyRightHand(fingerStates);
    if (classification) {
      const stableKey = rightStabilizer.update(`${classification.quality}|${classification.isSharp}`);
      if (stableKey) {
        const [q, sharp] = stableKey.split('|');
        currentQuality = q;
        currentIsSharp = sharp === 'true';

        rightTypeDisplay.textContent = currentIsSharp ? '# Sharp' : currentQuality;
        rightGestureName.textContent = classification.gestureName;
        rightFingersDetail.textContent = classification.fingersDesc;
      }
    }

    // Hand Y position continuous modulation for filter cutoff (high hand = brighter)
    const wristY = rightHandLandmarks[0].y;
    const normalizedMod = Math.max(0, Math.min(1, 1.0 - wristY));
    audioEngine.setFilterModulation(normalizedMod);
    sliderCutoff.value = normalizedMod.toFixed(2);
    cutoffValElem.textContent = `${Math.round(400 + normalizedMod * 8000)} Hz`;

  } else {
    rightHandCard.classList.remove('detected');
    rightHandStatus.textContent = 'Tersimpan (Memory)';
    updateFingerPills(rightFingersBar, null);
    rightStabilizer.reset();
  }

  // --- 3. TRIGGER MUSIC ENGINE SEAMLESSLY ---
  if (currentRoot) {
    const chordInfo = getChordNotes(currentRoot, currentIsSharp, currentQuality, baseOctave);
    currentChordData = chordInfo;

    currentChordNameElem.textContent = chordInfo.chordName;
    
    // Render note chips
    currentChordNotesElem.innerHTML = chordInfo.notes.map((note, idx) => {
      const isBass = idx === 0;
      return `<span class="note-chip ${isBass ? 'bass' : ''}">${note}</span>`;
    }).join('');

    soundIndicator.classList.add('playing');
    updatePianoKeys(chordInfo.notes, chordInfo.notes[0]);
    updateCheatSheetHighlight(currentRoot, currentQuality, currentIsSharp);

    // Play chord with smooth crossfade
    audioEngine.playChord(chordInfo);
  } else {
    currentChordNameElem.textContent = 'TIDAK ADA GESTUR';
    currentChordNotesElem.innerHTML = `<span class="note-chip empty">Tunjukkan jari tangan kiri</span>`;
    soundIndicator.classList.remove('playing');
    updatePianoKeys([], '');
    updateCheatSheetHighlight(null, null, false);
  }
}

// Toggle Engine Button
btnToggleEngine.addEventListener('click', async () => {
  if (!isRunning) {
    btnToggleEngine.innerHTML = `<span class="btn-icon">⏳</span><span class="btn-text">Mengaktifkan...</span>`;
    try {
      await audioEngine.init();
      audioStatusBadge.innerHTML = `<span class="dot green"></span><span>Audio: Aktif</span>`;

      await setupMediaPipe();
      cameraStatusBadge.innerHTML = `<span class="dot green"></span><span>Kamera: Aktif</span>`;

      isRunning = true;
      btnToggleEngine.classList.add('active');
      btnToggleEngine.innerHTML = `<span class="btn-icon">⏹</span><span class="btn-text">Hentikan Synth</span>`;
    } catch (err) {
      console.error('Failed to start synth:', err);
      alert('Gagal menyalakan kamera atau audio: ' + err.message);
      btnToggleEngine.innerHTML = `<span class="btn-icon">⚡</span><span class="btn-text">Mulai Gesture Synth</span>`;
    }
  } else {
    isRunning = false;
    audioEngine.stopChord();
    btnToggleEngine.classList.remove('active');
    btnToggleEngine.innerHTML = `<span class="btn-icon">⚡</span><span class="btn-text">Mulai Gesture Synth</span>`;
    cameraStatusBadge.innerHTML = `<span class="dot yellow"></span><span>Kamera: Standby</span>`;
    audioStatusBadge.innerHTML = `<span class="dot red"></span><span>Audio: Nonaktif</span>`;
  }
});

// Preset switcher
presetButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    presetButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const preset = btn.dataset.preset;
    audioEngine.setPreset(preset);
  });
});

// Slider events
sliderCutoff.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  audioEngine.setFilterModulation(val);
  cutoffValElem.textContent = `${Math.round(400 + val * 8000)} Hz`;
});

sliderReverb.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (audioEngine.reverb) audioEngine.reverb.wet.rampTo(val, 0.1);
  reverbValElem.textContent = `${Math.round(val * 100)}%`;
});

sliderVolume.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  audioEngine.setVolume(val);
  volValElem.textContent = `${val} dB`;
});

// Octave controls
btnOctDown.addEventListener('click', () => {
  if (baseOctave > 2) {
    baseOctave--;
    octDisplay.textContent = `Octave: ${baseOctave}`;
    audioEngine.setOctave(baseOctave);
    if (currentRoot) onHandResults({ multiHandLandmarks: [], multiHandedness: [] });
  }
});

btnOctUp.addEventListener('click', () => {
  if (baseOctave < 4) {
    baseOctave++;
    octDisplay.textContent = `Octave: ${baseOctave}`;
    audioEngine.setOctave(baseOctave);
    if (currentRoot) onHandResults({ multiHandLandmarks: [], multiHandedness: [] });
  }
});

// Cheat sheet tab switcher
tabLeftBtn.addEventListener('click', () => {
  tabLeftBtn.classList.add('active');
  tabRightBtn.classList.remove('active');
  tabLeftContent.classList.remove('hidden');
  tabRightContent.classList.add('hidden');
});

tabRightBtn.addEventListener('click', () => {
  tabRightBtn.classList.add('active');
  tabLeftBtn.classList.remove('active');
  tabRightContent.classList.remove('hidden');
  tabLeftContent.classList.add('hidden');
});

// Build initial keyboard
buildPianoKeyboard();
