import express from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { supabase } from '../supabase.js';

const router = express.Router();

export const SESSION_INACTIVITY_TIMEOUT_MINUTES = Number(
  process.env.SESSION_INACTIVITY_TIMEOUT_MINUTES || 15
);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

function parseBeaconBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * POST /api/tracking/session/start
 * Memulai sesi baru (Guest atau Registered, berdasarkan token Authorization jika ada).
 * UserID TIDAK pernah diambil dari body request — selalu dari JWT yang terverifikasi.
 * Body: { visitor_id, session_id? }
 */
router.post('/session/start', optionalAuth, async (req, res) => {
  try {
    const visitorId = req.body?.visitor_id ?? req.headers['x-visitor-id'];
    const existingSessionId = req.body?.session_id ?? req.headers['x-session-id'] ?? null;

    if (!isValidUuid(visitorId)) {
      return res.status(400).json({
        error: 'visitor_id wajib berupa UUID yang valid.'
      });
    }

    if (existingSessionId && !isValidUuid(existingSessionId)) {
      return res.status(400).json({
        error: 'session_id harus berupa UUID yang valid.'
      });
    }

    const { data, error } = await req.supabase.rpc('track_start_session', {
      p_visitor_id: visitorId.trim(),
      p_existing_session_id: existingSessionId ? existingSessionId.trim() : null,
      p_timeout_minutes: SESSION_INACTIVITY_TIMEOUT_MINUTES
    });

    if (error) {
      console.error('[Tracking] start session error:', error.message);
      return res.status(500).json({
        error: 'Gagal memulai tracking sesi.',
        details: error.message
      });
    }

    return res.status(data?.reused ? 200 : 201).json({
      tracking: data,
      inactivity_timeout_minutes: SESSION_INACTIVITY_TIMEOUT_MINUTES
    });
  } catch (err) {
    console.error('[Tracking] POST /session/start error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

/**
 * POST /api/tracking/session/heartbeat
 * Memperbarui last_activity_at dan durasi sesi secara ringan.
 * Body: { visitor_id, session_id }
 */
router.post('/session/heartbeat', optionalAuth, async (req, res) => {
  try {
    const visitorId = req.body?.visitor_id ?? req.headers['x-visitor-id'];
    const sessionId = req.body?.session_id ?? req.headers['x-session-id'];

    if (!isValidUuid(visitorId) || !isValidUuid(sessionId)) {
      return res.status(400).json({
        error: 'visitor_id dan session_id wajib berupa UUID yang valid.'
      });
    }

    const { data, error } = await req.supabase.rpc('track_heartbeat', {
      p_visitor_id: visitorId.trim(),
      p_session_id: sessionId.trim(),
      p_timeout_minutes: SESSION_INACTIVITY_TIMEOUT_MINUTES
    });

    if (error) {
      console.error('[Tracking] heartbeat error:', error.message);
      return res.status(500).json({ error: 'Gagal memperbarui heartbeat sesi.' });
    }

    return res.json({ tracking: data });
  } catch (err) {
    console.error('[Tracking] POST /session/heartbeat error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

/**
 * POST /api/tracking/session/end
 * Mengakhiri sesi (mendukung fetch JSON maupun navigator.sendBeacon saat tab ditutup).
 * Body: { visitor_id, session_id, reason? }
 */
router.post('/session/end', optionalAuth, async (req, res) => {
  try {
    const body = parseBeaconBody(req);
    const visitorId = body.visitor_id ?? req.headers['x-visitor-id'];
    const sessionId = body.session_id ?? req.headers['x-session-id'] ?? null;
    const rawReason = typeof body.reason === 'string' ? body.reason : 'page_unload';
    const allowedReasons = new Set(['page_unload', 'manual_end', 'logout']);
    const reason = allowedReasons.has(rawReason) ? rawReason : 'page_unload';

    if (!isValidUuid(visitorId)) {
      return res.status(400).json({ error: 'visitor_id wajib berupa UUID yang valid.' });
    }

    if (sessionId && !isValidUuid(sessionId)) {
      return res.status(400).json({ error: 'session_id harus berupa UUID yang valid.' });
    }

    const { data, error } = await req.supabase.rpc('track_end_session', {
      p_visitor_id: visitorId.trim(),
      p_session_id: sessionId ? sessionId.trim() : null,
      p_reason: reason
    });

    if (error) {
      console.error('[Tracking] end session error:', error.message);
      return res.status(500).json({ error: 'Gagal mengakhiri sesi.' });
    }

    return res.json({ tracking: data });
  } catch (err) {
    console.error('[Tracking] POST /session/end error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

/**
 * Background sweeper: menandai sesi yang tidak aktif melebihi batas timeout menjadi 'Expired'
 */
export function startSessionExpirationSweeper(intervalMs = 5 * 60 * 1000) {
  const runSweep = async () => {
    try {
      const { data, error } = await supabase.rpc('expire_inactive_sessions', {
        p_timeout_minutes: SESSION_INACTIVITY_TIMEOUT_MINUTES
      });
      if (!error && Number(data) > 0) {
        console.log(`[Tracking] Auto-expired ${data} inactive session(s).`);
      }
    } catch {
      // Abaikan jika SQL tracking belum dijalankan
    }
  };

  // Jalankan sekali saat startup, lalu berkala setiap 5 menit
  runSweep();
  return setInterval(runSweep, intervalMs);
}

export default router;
