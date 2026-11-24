import express from 'express';
import { supabase, createUserClient } from '../supabase.js';
import { requireAuth, formatUser } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimit.js';
import { formatWIB } from '../utils/time.js';
import { isValidUuid } from './tracking.js';

const router = express.Router();

// Validasi:
// 1. Email wajib berdomain @gmail.com
const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
// 2. Nomor telepon wajib berawalan 0, hanya angka, tanpa spasi/strip (10-15 digit)
const PHONE_ID_REGEX = /^0[0-9]{9,14}$/;
// 3. Password standar: minimal 8 karakter, ada huruf besar, huruf kecil, dan angka
const PASSWORD_UPPER_REGEX = /[A-Z]/;
const PASSWORD_LOWER_REGEX = /[a-z]/;
const PASSWORD_DIGIT_REGEX = /[0-9]/;

function validateEmail(email) {
  if (!GMAIL_REGEX.test(email)) {
    return 'Email tidak valid. Wajib menggunakan domain @gmail.com (contoh: nama@gmail.com).';
  }
  return null;
}

function validatePhone(phone) {
  if (phone.startsWith('+62') || phone.startsWith('62')) {
    return 'Nomor telepon harus diawali angka 0, bukan +62 atau 62 (contoh: 081234567890).';
  }
  if (/[\s-]/.test(phone) || /[^0-9]/.test(phone)) {
    return 'Nomor telepon hanya boleh berisi angka saja, tanpa spasi, strip, atau simbol lainnya.';
  }
  if (!phone.startsWith('0')) {
    return 'Nomor telepon harus diawali dengan angka 0.';
  }
  if (!PHONE_ID_REGEX.test(phone)) {
    return 'Nomor telepon harus terdiri dari 10 sampai 15 digit angka dan diawali angka 0.';
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password minimal harus 8 karakter.';
  }
  if (
    !PASSWORD_UPPER_REGEX.test(password) ||
    !PASSWORD_LOWER_REGEX.test(password) ||
    !PASSWORD_DIGIT_REGEX.test(password)
  ) {
    return 'Password harus mengandung minimal 1 huruf besar, 1 huruf kecil, dan 1 angka.';
  }
  return null;
}

function extractTrackingIds(req) {
  const rawVisitorId = req.body?.visitor_id ?? req.headers['x-visitor-id'] ?? null;
  const rawSessionId = req.body?.session_id ?? req.headers['x-session-id'] ?? null;
  return {
    visitorId: isValidUuid(rawVisitorId) ? rawVisitorId.trim() : null,
    sessionId: isValidUuid(rawSessionId) ? rawSessionId.trim() : null
  };
}

async function syncUserProfile(client, user, timestampWib) {
  if (!client || !user) return;
  const formatted = formatUser(user);
  const { error } = await client.from('profiles').upsert(
    {
      id: formatted.id,
      full_name: formatted.full_name,
      email: formatted.email,
      phone: formatted.phone,
      created_at_wib: timestampWib,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  );
  if (error) {
    console.warn('[Auth] Gagal menyimpan ke tabel profiles:', error.message);
  }
}

async function recordAuthTracking(client, req, user, eventType, registrationMethod = 'email_password') {
  if (!client || !user) return null;
  const formatted = formatUser(user);
  const { visitorId, sessionId } = extractTrackingIds(req);

  const { data, error } = await client.rpc('track_auth_event', {
    p_event_type: eventType,
    p_visitor_id: visitorId,
    p_guest_session_id: sessionId,
    p_registration_method: registrationMethod,
    p_email: formatted.email,
    p_full_name: formatted.full_name,
    p_phone: formatted.phone
  });

  if (error) {
    console.warn(
      `[Auth] Gagal mencatat tracking ${eventType} (pastikan supabase_user_access_tracking.sql sudah dijalankan):`,
      error.message
    );
    return null;
  }

  return data;
}

/**
 * POST /api/auth/signup
 * Body: { full_name, email, password, phone, visitor_id?, session_id? }
 */
router.post('/signup', authRateLimiter, async (req, res) => {
  try {
    const fullName = String(req.body.full_name ?? req.body.nama_lengkap ?? '').trim();
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = req.body.password ?? '';
    const phone = String(req.body.phone ?? req.body.no_telpon ?? '');

    if (!fullName || !email || !password || !phone) {
      return res.status(400).json({
        error: 'Semua field wajib diisi: full_name (nama lengkap), email, password, dan phone (no telpon).'
      });
    }

    const emailError = validateEmail(email);
    if (emailError) {
      return res.status(400).json({ error: emailError });
    }

    const phoneError = validatePhone(phone);
    if (phoneError) {
      return res.status(400).json({ error: phoneError });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone
        }
      }
    });

    if (error) {
      const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 400;
      return res.status(status).json({ error: error.message });
    }

    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return res.status(409).json({
        error: 'Email sudah terdaftar. Silakan gunakan email lain atau langsung login.'
      });
    }

    const timestampWib = formatWIB();
    let tracking = null;

    // Jika auto-login aktif (data.session ada): simpan profile, transisi guest->registered, catat 1x signup + sesi login
    if (data.session?.access_token && data.user) {
      const userClient = createUserClient(data.session.access_token);
      await syncUserProfile(userClient, data.user, timestampWib);
      tracking = await recordAuthTracking(userClient, req, data.user, 'signup', 'email_password');
    }

    const needsEmailConfirmation = !data.session;

    return res.status(201).json({
      message: needsEmailConfirmation
        ? 'Registrasi berhasil. Silakan cek email untuk verifikasi akun sebelum login.'
        : 'Registrasi berhasil!',
      timestamp_wib: timestampWib,
      user: formatUser(data.user),
      tracking,
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at
          }
        : null
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server saat registrasi.' });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password, visitor_id?, session_id? }
 */
router.post('/login', authRateLimiter, async (req, res) => {
  try {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = req.body.password ?? '';

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email dan password wajib diisi.'
      });
    }

    const emailError = validateEmail(email);
    if (emailError) {
      return res.status(400).json({ error: emailError });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({
        error: 'Email atau password salah.',
        details: error.message
      });
    }

    const timestampWib = formatWIB();
    const userClient = createUserClient(data.session.access_token);

    // Pastikan profile tersimpan, transisi guest->registered jika perlu, dan catat sesi login (WIB)
    await syncUserProfile(userClient, data.user, timestampWib);
    const tracking = await recordAuthTracking(userClient, req, data.user, 'login', null);

    return res.json({
      message: 'Login berhasil!',
      timestamp_wib: timestampWib,
      user: formatUser(data.user),
      tracking,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server saat login.' });
  }
});

/**
 * POST /api/auth/refresh
 * Memperbarui access_token yang kedaluwarsa menggunakan refresh_token
 * Body: { refresh_token }
 */
router.post('/refresh', authRateLimiter, async (req, res) => {
  try {
    const refreshToken = typeof req.body?.refresh_token === 'string'
      ? req.body.refresh_token.trim()
      : '';

    if (!refreshToken) {
      return res.status(400).json({
        error: 'refresh_token wajib diisi.'
      });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error || !data?.session) {
      return res.status(401).json({
        error: 'Refresh token tidak valid atau sudah kedaluwarsa. Silakan login ulang.'
      });
    }

    return res.json({
      message: 'Token berhasil diperbarui!',
      timestamp_wib: formatWIB(),
      user: formatUser(data.user),
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server saat memperbarui token.' });
  }
});

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <access_token>
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await req.supabase
      .from('profiles')
      .select('id, full_name, email, phone, created_at_wib, created_at')
      .eq('id', req.user.id)
      .maybeSingle();

    return res.json({
      user: profile || formatUser(req.user)
    });
  } catch {
    return res.json({
      user: formatUser(req.user)
    });
  }
});

/**
 * GET /api/auth/logs
 * Melihat riwayat aktivitas (signup, login, logout, guest_to_registered) dalam format WIB
 * Header: Authorization: Bearer <access_token>
 */
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('user_activity_logs')
      .select('id, event_type, access_type, visitor_id, session_id, registration_method, email, full_name, phone, event_at_wib, event_at')
      .eq('user_id', req.user.id)
      .order('event_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({
        error: 'Gagal mengambil riwayat aktivitas.',
        details: error.message
      });
    }

    return res.json({
      count: data.length,
      logs: data
    });
  } catch (err) {
    console.error('GET /api/auth/logs error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

/**
 * GET /api/auth/sessions
 * Melihat riwayat sesi login milik user yang sedang login (beserta durasi & waktu WIB)
 * Header: Authorization: Bearer <access_token>
 */
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('user_sessions')
      .select(
        'session_id, visitor_id, access_type, started_as_guest, login_at_wib, session_started_at_wib, session_ended_at_wib, last_activity_at_wib, duration_seconds, session_status, end_reason'
      )
      .eq('user_id', req.user.id)
      .order('session_started_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({
        error: 'Gagal mengambil riwayat sesi.',
        details: error.message
      });
    }

    return res.json({
      count: data.length,
      sessions: data
    });
  } catch (err) {
    console.error('GET /api/auth/sessions error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

/**
 * POST /api/auth/logout
 * Header: Authorization: Bearer <access_token>
 * Body (opsional): { visitor_id?, session_id? }
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const timestampWib = formatWIB();

    // Tutup sesi aktif & catat tracking logout (WIB) SEBELUM token di-signOut
    await recordAuthTracking(req.supabase, req, req.user, 'logout', null);
    await req.supabase.auth.signOut();

    return res.json({
      message: 'Logout berhasil.',
      timestamp_wib: timestampWib
    });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Gagal melakukan logout.' });
  }
});

export default router;
