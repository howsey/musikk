import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { SYNTH_PRESETS } from './presets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Aether Gesture Synth Backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// API Synth Presets
app.get('/api/presets', (req, res) => {
  res.json({
    presets: SYNTH_PRESETS
  });
});

// API Gesture & Chord Theory Reference
app.get('/api/chords', (req, res) => {
  res.json({
    roots: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    qualities: {
      Major: [0, 4, 7],
      Minor: [0, 3, 7],
      Maj7: [0, 4, 7, 11],
      Min7: [0, 3, 7, 10]
    },
    leftHandGestures: {
      '1_index': 'C',
      '2_index_middle': 'D',
      '3_index_middle_ring': 'E',
      '4_all_except_thumb': 'F',
      '5_all': 'G',
      '1_thumb': 'A',
      '2_thumb_index': 'B'
    },
    rightHandGestures: {
      '1_index': 'Major',
      '2_index_middle': '# (Sharp Modifier)',
      '3_index_middle_ring': 'Minor',
      '4_all_except_thumb': 'Maj7',
      '5_all': 'Min7'
    }
  });
});

// Serve frontend static build if built
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

app.get('*', (req, res) => {
  const indexPath = path.join(frontendDist, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).send('Frontend build not found. Run `npm run build` in frontend/ first.');
    }
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

