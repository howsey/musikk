import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import presetsRoutes from './routes/presets.js';
import trackingRoutes, { startSessionExpirationSweeper } from './routes/tracking.js';
import { generalApiLimiter, trackingRateLimiter } from './middleware/rateLimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security HTTP headers (CSP dimatikan agar asset static MediaPipe/WASM frontend tidak terblokir)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(cors());
app.use(express.json({ limit: '100kb' }));
// Mendukung navigator.sendBeacon dengan Content-Type: text/plain saat tab ditutup
app.use(express.text({ type: 'text/plain', limit: '10kb' }));

// Rate limit umum untuk seluruh API
app.use('/api', generalApiLimiter);

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Aether Gesture Synth Backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Auth, Custom Presets & User Access/Session Tracking APIs (Supabase-backed)
app.use('/api/auth', authRoutes);
app.use('/api/presets', presetsRoutes);
app.use('/api/tracking', trackingRateLimiter, trackingRoutes);

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
  // Jalankan pengecekan otomatis untuk sesi tidak aktif (Expired)
  startSessionExpirationSweeper();
});
