# Backend Service

This directory houses the backend server and API endpoints for the **Aether Gesture Synth** architecture.

---

## 1. Overview & Capabilities

While the core synthesizer and gesture inference operate client-side in the browser via WebGL and Web Audio, this backend service provides:

- **Centralized API Endpoints**:
  - `GET /api/health`: Health monitoring and server uptime.
  - `GET /api/presets`: Sound design presets (Ambient Pad, Cyberpunk Lead, Dreamy Keys, Deep Bass).
  - `GET /api/chords`: Music theory interval definitions and gesture mapping dictionary.
- **Production Static Serving**: Hosts the bundled `frontend/dist` assets on a unified HTTP port.
- **Extensibility**:
  - **WebSocket / OSC / MIDI Bridge**: Can be expanded to broadcast recognized chords via WebSockets or WebMIDI to external Digital Audio Workstations (Ableton Live, FL Studio, Logic Pro).
  - **User Session & Progression Recording**: Storage for custom chord progressions, custom synthesizer patches, or recording logs.

---

## 2. Getting Started

### Installation
```bash
npm install
```

### Running the Server
```bash
# Start server
npm start

# Development with hot reload
npm run dev
```

Server starts on `http://localhost:3000`.

