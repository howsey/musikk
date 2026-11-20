// Custom sound processing: quality checks, pitch detection, trimming and retuning.
// Everything runs in the browser.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const MIN_DURATION_SEC = 1;
export const MAX_DURATION_SEC = 4;

export function toMono(audioBuffer) {
  const { numberOfChannels, length } = audioBuffer;
  if (numberOfChannels === 1) return audioBuffer.getChannelData(0).slice();
  const out = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) out[i] += data[i] / numberOfChannels;
  }
  return out;
}

export function analyzeClip(samples, sampleRate) {
  let sumSq = 0;
  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    sumSq += a * a;
    if (a > peak) peak = a;
    if (a >= 0.99) clipped++;
  }
  return {
    duration: samples.length / sampleRate,
    rms: Math.sqrt(sumSq / Math.max(1, samples.length)),
    peak,
    clipRatio: clipped / Math.max(1, samples.length)
  };
}

// Returns null when the clip is usable, otherwise an error code the UI can explain.
export function checkQuality(stats) {
  if (stats.duration < MIN_DURATION_SEC) return 'too_short';
  if (stats.rms < 0.008) return 'too_quiet';
  if (stats.clipRatio > 0.002) return 'clipping';
  return null;
}

export function normalize(samples, target = 0.9) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < 1e-4) return samples;
  const gain = target / peak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

// Slice with short fades so the edges don't click.
export function trimSamples(samples, sampleRate, startSec, endSec) {
  const start = Math.max(0, Math.floor(startSec * sampleRate));
  const end = Math.min(samples.length, Math.floor(endSec * sampleRate));
  const out = samples.slice(start, Math.max(start + 1, end));
  const fade = Math.min(Math.floor(sampleRate * 0.01), Math.floor(out.length / 4));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}

// Autocorrelation pitch estimate (ACF2+) for one analysis window.
function autoCorrelate(window, sampleRate) {
  let size = window.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += window[i] * window[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return null;

  let r1 = 0;
  let r2 = size - 1;
  const thres = 0.2;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(window[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(window[size - i]) < thres) {
      r2 = size - i;
      break;
    }
  }
  const buf = window.slice(r1, r2);
  size = buf.length;
  if (size < 64) return null;

  const c = new Float32Array(size);
  for (let lag = 0; lag < size; lag++) {
    let sum = 0;
    for (let j = 0; j < size - lag; j++) sum += buf[j] * buf[j + lag];
    c[lag] = sum;
  }

  let d = 0;
  while (d < size - 1 && c[d] > c[d + 1]) d++;
  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < size; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }
  if (maxPos <= 0 || maxPos >= size - 1) return null;

  const clarity = c[0] > 0 ? maxVal / c[0] : 0;
  let t0 = maxPos;
  const x1 = c[t0 - 1];
  const x2 = c[t0];
  const x3 = c[t0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) t0 -= b / (2 * a);

  const frequency = sampleRate / t0;
  if (frequency < 50 || frequency > 1500) return null;
  return { frequency, clarity };
}

// Median of several windows across the middle of the clip, for stability.
export function detectPitch(samples, sampleRate) {
  const windowSize = 4096;
  if (samples.length < windowSize) return null;
  const startRegion = Math.floor(samples.length * 0.2);
  const endRegion = Math.floor(samples.length * 0.8) - windowSize;
  const count = 7;
  const results = [];
  for (let k = 0; k < count; k++) {
    const pos = endRegion > startRegion
      ? Math.floor(startRegion + ((endRegion - startRegion) * k) / (count - 1))
      : 0;
    const res = autoCorrelate(samples.subarray(pos, pos + windowSize), sampleRate);
    if (res && res.clarity > 0.6) results.push(res.frequency);
  }
  if (results.length < 3) return null;
  results.sort((x, y) => x - y);
  return results[Math.floor(results.length / 2)];
}

export function frequencyToNote(frequency) {
  const midiFloat = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const note = `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  return { note, midi, cents };
}

// Shift pitch by -cents so the clip lands exactly on its nearest semitone.
export async function retune(samples, sampleRate, cents) {
  if (!cents) return samples;
  const rate = Math.pow(2, -cents / 1200);
  const length = Math.ceil(samples.length / rate);
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const buf = ctx.createBuffer(1, samples.length, sampleRate);
  buf.copyToChannel(samples, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(ctx.destination);
  src.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

export function samplesToAudioBuffer(samples, sampleRate) {
  const buffer = new AudioBuffer({ length: samples.length, sampleRate, numberOfChannels: 1 });
  buffer.copyToChannel(samples, 0);
  return buffer;
}

export function drawClipWaveform(canvas, samples, { start = 0, end = 1, color = '#97affd' } = {}) {
  if (!canvas || !samples) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;
  const mid = h / 2;
  ctx.clearRect(0, 0, w, h);

  const step = Math.max(1, Math.floor(samples.length / w));
  for (let x = 0; x < w; x++) {
    let min = 1;
    let max = -1;
    const base = x * step;
    for (let j = 0; j < step && base + j < samples.length; j++) {
      const v = samples[base + j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const inside = x / w >= start && x / w <= end;
    ctx.fillStyle = inside ? color : 'rgba(133, 146, 171, 0.35)';
    ctx.fillRect(x, mid + min * mid * 0.95, 1, Math.max(1, (max - min) * mid * 0.95));
  }
}
