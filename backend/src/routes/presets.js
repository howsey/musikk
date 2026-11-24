import express from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

const ALLOWED_OSCILLATOR_TYPES = new Set([
  'sine',
  'square',
  'sawtooth',
  'triangle',
  'fatsine',
  'fatsquare',
  'fatsawtooth',
  'fattriangle',
  'fmsine',
  'fmsquare',
  'fmsawtooth',
  'fmtriangle',
  'amsine',
  'amsquare',
  'amsawtooth',
  'amtriangle'
]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validatePresetPayload(body, isPartial = false) {
  const errors = [];
  const data = {};

  if (!isPartial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 80) {
      errors.push('name wajib berupa teks (1-80 karakter).');
    } else {
      data.name = name;
    }
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      errors.push('description harus berupa teks.');
    } else {
      data.description = body.description ? body.description.trim().slice(0, 300) : null;
    }
  }

  if (body.is_public !== undefined) {
    if (typeof body.is_public !== 'boolean') {
      errors.push('is_public harus berupa boolean (true/false).');
    } else {
      data.is_public = body.is_public;
    }
  }

  if (!isPartial || body.oscillator !== undefined) {
    const osc = body.oscillator;
    if (!osc || typeof osc !== 'object' || Array.isArray(osc)) {
      errors.push('oscillator wajib berupa object (contoh: {"type": "fatsawtooth", "count": 3, "spread": 25}).');
    } else if (!ALLOWED_OSCILLATOR_TYPES.has(osc.type)) {
      errors.push(`oscillator.type tidak valid. Pilihan: ${Array.from(ALLOWED_OSCILLATOR_TYPES).join(', ')}`);
    } else {
      const cleanOsc = { type: osc.type };
      if (osc.count !== undefined) {
        const count = Number(osc.count);
        if (!Number.isInteger(count) || count < 1 || count > 8) {
          errors.push('oscillator.count harus bilangan bulat antara 1 sampai 8.');
        } else {
          cleanOsc.count = count;
        }
      }
      if (osc.spread !== undefined) {
        const spread = Number(osc.spread);
        if (Number.isNaN(spread) || spread < 0 || spread > 100) {
          errors.push('oscillator.spread harus angka antara 0 sampai 100.');
        } else {
          cleanOsc.spread = spread;
        }
      }
      if (osc.modulationType !== undefined) {
        if (!['sine', 'square', 'sawtooth', 'triangle'].includes(osc.modulationType)) {
          errors.push('oscillator.modulationType harus salah satu dari: sine, square, sawtooth, triangle.');
        } else {
          cleanOsc.modulationType = osc.modulationType;
        }
      }
      if (osc.modulationIndex !== undefined) {
        const modIdx = Number(osc.modulationIndex);
        if (Number.isNaN(modIdx) || modIdx < 0 || modIdx > 20) {
          errors.push('oscillator.modulationIndex harus angka antara 0 sampai 20.');
        } else {
          cleanOsc.modulationIndex = modIdx;
        }
      }
      data.oscillator = cleanOsc;
    }
  }

  if (!isPartial || body.envelope !== undefined) {
    const env = body.envelope;
    if (!env || typeof env !== 'object' || Array.isArray(env)) {
      errors.push('envelope wajib berupa object { attack, decay, sustain, release }.');
    } else {
      const attack = Number(env.attack);
      const decay = Number(env.decay);
      const sustain = Number(env.sustain);
      const release = Number(env.release);

      if (Number.isNaN(attack) || attack < 0.001 || attack > 5) {
        errors.push('envelope.attack harus antara 0.001 sampai 5 detik.');
      }
      if (Number.isNaN(decay) || decay < 0.01 || decay > 5) {
        errors.push('envelope.decay harus antara 0.01 sampai 5 detik.');
      }
      if (Number.isNaN(sustain) || sustain < 0 || sustain > 1) {
        errors.push('envelope.sustain harus antara 0 sampai 1.');
      }
      if (Number.isNaN(release) || release < 0.01 || release > 10) {
        errors.push('envelope.release harus antara 0.01 sampai 10 detik.');
      }

      if (errors.length === 0) {
        data.envelope = { attack, decay, sustain, release };
      }
    }
  }

  const rawCutoff = body.filter_cutoff ?? body.filterCutoff;
  if (!isPartial || rawCutoff !== undefined) {
    const cutoff = rawCutoff !== undefined ? Number(rawCutoff) : 2800;
    if (Number.isNaN(cutoff) || cutoff < 100 || cutoff > 15000) {
      errors.push('filter_cutoff harus antara 100 sampai 15000 Hz.');
    } else {
      data.filter_cutoff = Math.round(cutoff);
    }
  }

  const rawReverb = body.reverb_wet ?? body.reverbWet;
  if (!isPartial || rawReverb !== undefined) {
    const reverb = rawReverb !== undefined ? Number(rawReverb) : 0.35;
    if (Number.isNaN(reverb) || reverb < 0 || reverb > 1) {
      errors.push('reverb_wet harus antara 0 sampai 1.');
    } else {
      data.reverb_wet = reverb;
    }
  }

  return { errors, data };
}

/**
 * GET /api/presets
 * Query opsional:
 * - ?mine=true (hanya ambil preset buatan user yang sedang login)
 * - ?search=nama (cari preset berdasarkan nama)
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { mine, search } = req.query;

    if (mine === 'true' && !req.user) {
      return res.status(401).json({
        error: 'Silakan login terlebih dahulu untuk melihat preset milik Anda.'
      });
    }

    let query = req.supabase
      .from('presets')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (mine === 'true' && req.user) {
      query = query.eq('user_id', req.user.id);
    }

    if (search && typeof search === 'string' && search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Fetch presets error:', error);
      return res.status(500).json({ error: 'Gagal mengambil data preset.', details: error.message });
    }

    return res.json({
      count: data.length,
      presets: data
    });
  } catch (err) {
    console.error('GET /api/presets error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

/**
 * GET /api/presets/:id
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Format ID preset tidak valid (harus UUID).' });
    }

    const { data, error } = await req.supabase
      .from('presets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: 'Gagal mengambil detail preset.', details: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Preset tidak ditemukan.' });
    }

    return res.json({ preset: data });
  } catch (err) {
    console.error('GET /api/presets/:id error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

/**
 * POST /api/presets (Wajib Login)
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { errors, data } = validatePresetPayload(req.body, false);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validasi gagal.', details: errors });
    }

    const insertPayload = {
      ...data,
      user_id: req.user.id,
      is_default: false,
      is_public: data.is_public ?? true
    };

    const { data: created, error } = await req.supabase
      .from('presets')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      console.error('Create preset error:', error);
      return res.status(500).json({ error: 'Gagal menyimpan preset.', details: error.message });
    }

    return res.status(201).json({
      message: 'Custom preset berhasil disimpan!',
      preset: created
    });
  } catch (err) {
    console.error('POST /api/presets error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

/**
 * PUT /api/presets/:id (Wajib Login & hanya pemilik preset)
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Format ID preset tidak valid (harus UUID).' });
    }

    const { errors, data } = validatePresetPayload(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validasi gagal.', details: errors });
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Tidak ada field yang diubah.' });
    }

    const updatePayload = {
      ...data,
      updated_at: new Date().toISOString()
    };

    const { data: updated, error } = await req.supabase
      .from('presets')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('Update preset error:', error);
      return res.status(500).json({ error: 'Gagal mengupdate preset.', details: error.message });
    }

    if (!updated) {
      return res.status(404).json({
        error: 'Preset tidak ditemukan atau Anda tidak memiliki izin untuk mengeditnya.'
      });
    }

    return res.json({
      message: 'Preset berhasil diperbarui!',
      preset: updated
    });
  } catch (err) {
    console.error('PUT /api/presets/:id error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

/**
 * DELETE /api/presets/:id (Wajib Login & hanya pemilik preset)
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Format ID preset tidak valid (harus UUID).' });
    }

    const { data: deleted, error } = await req.supabase
      .from('presets')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select('id, name')
      .maybeSingle();

    if (error) {
      console.error('Delete preset error:', error);
      return res.status(500).json({ error: 'Gagal menghapus preset.', details: error.message });
    }

    if (!deleted) {
      return res.status(404).json({
        error: 'Preset tidak ditemukan atau Anda tidak memiliki izin untuk menghapusnya.'
      });
    }

    return res.json({
      message: `Preset "${deleted.name}" berhasil dihapus.`,
      deleted
    });
  } catch (err) {
    console.error('DELETE /api/presets/:id error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

export default router;
