import rateLimit from 'express-rate-limit';

/**
 * Rate limiter ketat untuk endpoint autentikasi (anti brute-force & spam akun)
 * Maksimal 15 request per 15 menit.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Terlalu banyak percobaan autentikasi. Silakan coba lagi dalam 15 menit.'
  }
});

/**
 * Rate limiter untuk endpoint tracking sesi & heartbeat
 * Maksimal 120 request per 15 menit (cukup untuk heartbeat tiap menit + buka/tutup tab).
 */
export const trackingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Terlalu banyak request tracking. Silakan coba lagi beberapa saat lagi.'
  }
});

/**
 * Rate limiter umum untuk seluruh endpoint /api
 * Maksimal 300 request per 15 menit.
 */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Terlalu banyak request ke API. Silakan coba lagi beberapa saat lagi.'
  }
});
