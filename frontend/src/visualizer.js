// Hand wireframe overlay. The <video> is drawn by the browser compositor;
// this canvas only draws the 21-point skeletons.
// Root hand: periwinkle, round joints. Chord hand: amber, square joints (not color-only).

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
];

const TIPS = new Set([4, 8, 12, 16, 20]);

export class Visualizer {
  constructor(canvas) {
    this.setCanvas(canvas);
  }

  setCanvas(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d', { alpha: true }) : null;
  }

  resize(width, height) {
    if (!this.canvas) return;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  clear() {
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // hands: [{ role: 'root' | 'chord', landmarks }]
  render(hands) {
    if (!this.ctx) return;
    this.clear();
    if (!hands) return;
    const { width, height } = this.canvas;
    for (const hand of hands) {
      const pts = hand.landmarks.map((p) => ({ x: (1 - p.x) * width, y: p.y * height }));
      this.drawHand(pts, hand.role === 'root');
    }
  }

  drawHand(pts, isRoot) {
    const { ctx } = this;
    const stroke = isRoot ? '#97affd' : '#ff9f43';
    ctx.save();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = stroke;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
    }
    ctx.stroke();

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const r = TIPS.has(i) ? 5 : i === 0 ? 6.5 : 3.5;
      ctx.fillStyle = TIPS.has(i) ? '#f4f1ea' : '#131724';
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      if (isRoot) ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      else ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
