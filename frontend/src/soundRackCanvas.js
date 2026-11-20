// Precision Studio Canvas Renderers for AETHER // MK-II
// Styled in Matte Midnight Hardware Palette (#97affd Periwinkle, #ff9f43 Warm Amber, #05070b OLED)

export const PRESET_METADATA = {
  ambient_pad: {
    code: '01',
    shortName: 'SILK PAD',
    name: 'Ambient Silk Pad',
    tag: 'FatSawtooth · Warm Sustain',
    env: { attack: 0.15, decay: 0.4, sustain: 0.88, release: 2.2 },
    defaultCutoff: 2800,
    defaultReverb: 0.42
  },
  electric_piano: {
    code: '02',
    shortName: 'RHODES EP',
    name: 'Neo-Soul Rhodes',
    tag: 'FatTriangle · Bell Chime',
    env: { attack: 0.04, decay: 1.2, sustain: 0.5, release: 1.4 },
    defaultCutoff: 4500,
    defaultReverb: 0.25
  },
  cyber_brass: {
    code: '03',
    shortName: 'FM BRASS',
    name: 'Cyberpunk Brass',
    tag: 'FMSawtooth · Analog Punch',
    env: { attack: 0.08, decay: 0.6, sustain: 0.75, release: 1.2 },
    defaultCutoff: 3800,
    defaultReverb: 0.3
  },
  celestial_bells: {
    code: '04',
    shortName: 'PLUCK BELL',
    name: 'Celestial Pluck',
    tag: 'Sine · Stereo Delay',
    env: { attack: 0.02, decay: 2.0, sustain: 0.4, release: 2.5 },
    defaultCutoff: 6000,
    defaultReverb: 0.55
  }
};

function drawSubtleGrid(ctx, w, h, cols = 8, rows = 4) {
  ctx.strokeStyle = 'rgba(151, 175, 253, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < cols; i++) {
    const x = Math.round((w / cols) * i) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let j = 1; j < rows; j++) {
    const y = Math.round((h / rows) * j) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

export function drawOledWaveform(canvas, waveformData, isPlaying) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const midY = h * 0.5;

  // Baseline
  ctx.strokeStyle = 'rgba(47, 58, 80, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();

  if (!waveformData || !isPlaying) {
    ctx.restore();
    return;
  }

  ctx.beginPath();
  const slice = w / waveformData.length;
  let x = 0;
  for (let i = 0; i < waveformData.length; i++) {
    const v = waveformData[i];
    const y = midY + v * (h * 0.42);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += slice;
  }
  ctx.strokeStyle = '#97affd';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
}

export function drawADSRGraph(canvas, env) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padX = 14;
  const padTop = 18;
  const padBot = 14;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBot;

  ctx.clearRect(0, 0, w, h);
  drawSubtleGrid(ctx, w, h, 8, 4);

  const atkX = padX + Math.max(0.06, Math.min(0.24, env.attack * 0.9)) * innerW;
  const decX = atkX + Math.max(0.14, Math.min(0.28, env.decay * 0.16)) * innerW;
  const susEndX = Math.min(w - padX - innerW * 0.24, decX + innerW * 0.28);
  const relEndX = w - padX;

  const baseY = h - padBot;
  const peakY = padTop;
  const susY = baseY - env.sustain * innerH;

  const grad = ctx.createLinearGradient(0, peakY, 0, baseY);
  grad.addColorStop(0, 'rgba(151, 175, 253, 0.22)');
  grad.addColorStop(1, 'rgba(151, 175, 253, 0.01)');

  ctx.beginPath();
  ctx.moveTo(padX, baseY);
  ctx.lineTo(atkX, peakY);
  ctx.quadraticCurveTo(atkX + (decX - atkX) * 0.35, susY, decX, susY);
  ctx.lineTo(susEndX, susY);
  ctx.quadraticCurveTo(susEndX + (relEndX - susEndX) * 0.45, susY, relEndX, baseY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(padX, baseY);
  ctx.lineTo(atkX, peakY);
  ctx.quadraticCurveTo(atkX + (decX - atkX) * 0.35, susY, decX, susY);
  ctx.lineTo(susEndX, susY);
  ctx.quadraticCurveTo(susEndX + (relEndX - susEndX) * 0.45, susY, relEndX, baseY);
  ctx.strokeStyle = '#97affd';
  ctx.lineWidth = 2;
  ctx.stroke();

  const points = [
    [padX, baseY],
    [atkX, peakY],
    [decX, susY],
    [susEndX, susY],
    [relEndX, baseY]
  ];
  for (const [px, py] of points) {
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#05070b';
    ctx.fill();
    ctx.strokeStyle = '#97affd';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  ctx.restore();
}

export function drawFilterGraph(canvas, cutoffHz = 3200) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padTop = 26;
  const padBot = 14;
  const baseY = h - padBot;
  const passY = padTop + (baseY - padTop) * 0.22;

  ctx.clearRect(0, 0, w, h);
  drawSubtleGrid(ctx, w, h, 8, 4);

  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  const freqToX = (f) => ((Math.log10(Math.max(20, Math.min(20000, f))) - minLog) / (maxLog - minLog)) * w;
  const cutoffX = freqToX(cutoffHz);

  const curvePoints = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const freq = Math.pow(10, minLog + (i / steps) * (maxLog - minLog));
    const ratio = freq / Math.max(100, cutoffHz);
    const mag = 1 / Math.sqrt(1 + Math.pow(ratio, 4));
    const y = baseY - mag * (baseY - passY);
    curvePoints.push([x, y]);
  }

  const grad = ctx.createLinearGradient(0, passY, 0, baseY);
  grad.addColorStop(0, 'rgba(255, 159, 67, 0.22)');
  grad.addColorStop(1, 'rgba(255, 159, 67, 0.01)');

  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (const [x, y] of curvePoints) ctx.lineTo(x, y);
  ctx.lineTo(w, baseY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < curvePoints.length; i++) {
    const [x, y] = curvePoints[i];
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#ff9f43';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(255, 159, 67, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cutoffX, padTop);
  ctx.lineTo(cutoffX, baseY);
  ctx.stroke();
  ctx.setLineDash([]);

  const cutoffY = baseY - (1 / Math.sqrt(2)) * (baseY - passY);
  ctx.beginPath();
  ctx.arc(cutoffX, cutoffY, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ff9f43';
  ctx.fill();
  ctx.strokeStyle = '#f4f1ea';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}
