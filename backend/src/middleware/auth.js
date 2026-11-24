import { supabase, createUserClient } from '../supabase.js';

function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
}

export function formatUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || '',
    phone: user.user_metadata?.phone || user.phone || '',
    created_at: user.created_at
  };
}

/**
 * Wajib login: memverifikasi JWT token dari header Authorization: Bearer <token>
 */
export async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({
        error: 'Akses ditolak. Silakan login terlebih dahulu (Bearer token tidak ditemukan).'
      });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({
        error: 'Token tidak valid atau sudah kedaluwarsa. Silakan login ulang.'
      });
    }

    req.user = data.user;
    req.accessToken = token;
    req.supabase = createUserClient(token);
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan saat verifikasi autentikasi.' });
  }
}

/**
 * Opsional login: jika ada token valid, user & authenticated client dipasang;
 * jika tidak ada token, tetap lanjut sebagai guest menggunakan public client.
 */
export async function optionalAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      req.user = null;
      req.supabase = supabase;
      return next();
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) {
      req.user = data.user;
      req.accessToken = token;
      req.supabase = createUserClient(token);
    } else {
      req.user = null;
      req.supabase = supabase;
    }

    next();
  } catch (err) {
    req.user = null;
    req.supabase = supabase;
    next();
  }
}
