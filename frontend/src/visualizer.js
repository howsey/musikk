// Precision Technical Camera Viewfinder & Hand Wireframe Renderer
// Styled in Matte Midnight Hardware Palette (#97affd Periwinkle Left Hand, #ff9f43 Warm Amber Right Hand)

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // Index
  [5, 9], [9, 10], [10, 11], [11, 12],    // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],  // Ring
  [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0, 17]                                 // Palm base
];

export class Visualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
  }

  setCanvas(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
  }

  resize(width, height) {
    if (!this.canvas) return;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render(video, handResults) {
    if (!this.canvas || !this.ctx) return;
    const { ctx, canvas } = this;
    const width = canvas.width;
    const height = canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Mirrored Camera Feed with matte dark studio grade
    if (video && video.readyState >= 2) {
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, width, height);
      ctx.fillStyle = 'rgba(11, 13, 20, 0.42)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else {
      ctx.fillStyle = '#070910';
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Render Technical 21-Point Hand Skeletons (No blurry neon slop)
    if (handResults && handResults.multiHandLandmarks && handResults.multiHandLandmarks.length > 0) {
      for (let i = 0; i < handResults.multiHandLandmarks.length; i++) {
        const rawLandmarks = handResults.multiHandLandmarks[i];
        const handedness = handResults.multiHandedness[i];
        const isLeftHand = handedness.label === 'Left';

        const mirroredLandmarks = rawLandmarks.map(p => ({
          x: (1 - p.x) * width,
          y: p.y * height,
          z: p.z
        }));

        this.drawHandSkeleton(mirroredLandmarks, isLeftHand);
      }
    }

    ctx.restore();
  }

  drawHandSkeleton(landmarks, isLeftHand) {
    const { ctx } = this;
    // Periwinkle (#97affd) for Left Hand, Warm Analog Amber (#ff9f43) for Right Hand
    const strokePrimary = isLeftHand ? '#97affd' : '#ff9f43';
    const jointFill = isLeftHand ? '#191e2e' : '#1f1812';

    ctx.save();

    // Crisp vector bone lines
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = strokePrimary;
    ctx.beginPath();
    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const p1 = landmarks[startIdx];
      const p2 = landmarks[endIdx];
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // Precision technical joints
    for (let idx = 0; idx < landmarks.length; idx++) {
      const p = landmarks[idx];
      const isTip = [4, 8, 12, 16, 20].includes(idx);
      const radius = isTip ? 5.2 : idx === 0 ? 6.5 : 3.6;

      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? '#f4f1ea' : jointFill;
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = strokePrimary;
      ctx.stroke();
    }

    ctx.restore();
  }
}
