// Canvas renderers: live waveform, ADSR envelope, low-pass filter response.

function prepare(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, w: rect.width, h: rect.height };
}

function grid(ctx, w, h, cols = 8, rows = 4) {
  ctx.strokeStyle = 'rgba(133, 146, 171, 0.12)';
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

export function drawWaveformLine(canvas, data, isPlaying) {
  const c = prepare(canvas);
  if (!c) return;
  const { ctx, w, h } = c;
  const mid = h / 2;
  ctx.strokeStyle = 'rgba(133, 146, 171, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
  if (!data || !isPlaying) return;

  ctx.beginPath();
  const slice = w / data.length;
  for (let i = 0; i < data.length; i++) {
    const y = mid + data[i] * h * 0.42;
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(i * slice, y);
  }
  ctx.strokeStyle = '#97affd';
  ctx.lineWidth = 1.8;
  ctx.stroke();
}

export function drawADSRGraph(canvas, env) {
  const c = prepare(canvas);
  if (!c || !env) return;
  const { ctx, w, h } = c;
  grid(ctx, w, h);
  const padX = 14;
  const padTop = 16;
  const padBot = 14;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBot;
  const atkX = padX + Math.max(0.06, Math.min(0.24, env.attack * 0.9)) * innerW;
  const decX = atkX + Math.max(0.14, Math.min(0.28, env.decay * 0.16)) * innerW;
  const susEndX = Math.min(w - padX - innerW * 0.24, decX + innerW * 0.28);
  const relEndX = w - padX;
  const baseY = h - padBot;
  const susY = baseY - env.sustain * innerH;

  const path = () => {
    ctx.beginPath();
    ctx.moveTo(padX, baseY);
    ctx.lineTo(atkX, padTop);
    ctx.quadraticCurveTo(atkX + (decX - atkX) * 0.35, susY, decX, susY);
    ctx.lineTo(susEndX, susY);
    ctx.quadraticCurveTo(susEndX + (relEndX - susEndX) * 0.45, susY, relEndX, baseY);
  };
  path();
  ctx.closePath();
  ctx.fillStyle = 'rgba(151, 175, 253, 0.14)';
  ctx.fill();
  path();
  ctx.strokeStyle = '#97affd';
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function drawFilterGraph(canvas, cutoffHz = 3200) {
  const c = prepare(canvas);
  if (!c) return;
  const { ctx, w, h } = c;
  grid(ctx, w, h);
  const padTop = 16;
  const baseY = h - 14;
  const passY = padTop + (baseY - padTop) * 0.22;
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  const cutoffX = ((Math.log10(cutoffHz) - minLog) / (maxLog - minLog)) * w;

  const pts = [];
  for (let i = 0; i <= 80; i++) {
    const freq = Math.pow(10, minLog + (i / 80) * (maxLog - minLog));
    const mag = 1 / Math.sqrt(1 + Math.pow(freq / Math.max(100, cutoffHz), 4));
    pts.push([(i / 80) * w, baseY - mag * (baseY - passY)]);
  }
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(w, baseY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 159, 67, 0.14)';
  ctx.fill();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.strokeStyle = '#ff9f43';
  ctx.lineWidth = 2;
  ctx.stroke();

  const cutoffY = baseY - (1 / Math.sqrt(2)) * (baseY - passY);
  ctx.beginPath();
  ctx.arc(cutoffX, cutoffY, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ff9f43';
  ctx.fill();
  ctx.strokeStyle = '#f4f1ea';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
