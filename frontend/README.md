# Frontend Client Application

The client-side web application for **Aether Gesture Synth**, built with Vite, HTML5 Canvas, and Tone.js.

---

## 1. Responsibilities

- **Presentation & HUD**:
  - Cyberpunk-styled real-time telemetry HUD displaying left/right hand status, detected notes, and active chord.
  - Interactive virtual 3-octave piano keyboard with animated key highlighting.
  - Sidebar audio parameter controls (preset selector, filter cutoff, reverb wetness, master volume, octave transposer).
- **Vision Feed & Visualizer (`src/visualizer.js`)**:
  - Mirrored webcam rendering.
  - 21-point hand skeleton joints and glowing bone connections.
  - Real-time oscilloscope audio waveform visualizer powered by `Tone.Analyser`.
- **Audio Synthesis Engine (`src/audioEngine.js`)**:
  - Dual PolySynth banks (`Tone.PolySynth`) cross-fading for 100% gapless sustained chord transitions.
  - Master DSP FX chain: Limiter, Reverb, Delay, Chorus, Lowpass Filter.
- **Client Controller (`src/main.js`)**:
  - MediaPipe Hands camera stream pipeline initialization.
  - State management tying gestures to audio synthesis and visual feedback.

---

## 2. Getting Started

### Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
```
The output will be placed in `dist/`.

