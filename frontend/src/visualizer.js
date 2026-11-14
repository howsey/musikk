// Futuristic Cyberpunk Canvas Visualizer for Gesture Synth

// MediaPipe standard hand connections
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],// Ring
  [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [0, 17]                               // Palm base
];

export class Visualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render(video, handResults, currentChord, audioEngine) {
    const { ctx, canvas } = this;
    const width = canvas.width;
    const height = canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Mirrored Camera Video with subtle cyberpunk dark grade
    if (video && video.readyState >= 2) {
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, width, height);
      // Dark vignette overlay
      ctx.fillStyle = 'rgba(10, 15, 30, 0.45)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else {
      ctx.fillStyle = '#0a0d1a';
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Render Audio Waveform Oscilloscope
    if (audioEngine) {
      this.drawWaveform(audioEngine.getWaveformData(), width, height);
    }

    // 3. Render Hand Skeletons and HUD
    if (handResults && handResults.multiHandLandmarks && handResults.multiHandLandmarks.length > 0) {
      for (let i = 0; i < handResults.multiHandLandmarks.length; i++) {
        const rawLandmarks = handResults.multiHandLandmarks[i];
        const handedness = handResults.multiHandedness[i];
        
        // When video is mirrored horizontally, MediaPipe's 'Left' label appears on camera screen left,
        // which physically matches user's actual Left Hand!
        const isLeftHand = handedness.label === 'Left';
        
        // Transform landmarks for mirrored video (x' = 1 - x)
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
    const colorPrimary = isLeftHand ? '#00f3ff' : '#ff0077';
    const colorSecondary = isLeftHand ? '#0088ff' : '#ff77aa';
    const glowColor = isLeftHand ? 'rgba(0, 243, 255, 0.6)' : 'rgba(255, 0, 119, 0.6)';

    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = glowColor;

    // Draw connecting bones
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = colorPrimary;
    ctx.beginPath();
    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const p1 = landmarks[startIdx];
      const p2 = landmarks[endIdx];
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // Draw landmark joints
    for (let idx = 0; idx < landmarks.length; idx++) {
      const p = landmarks[idx];
      const isTip = [4, 8, 12, 16, 20].includes(idx);
      const radius = isTip ? 6.5 : (idx === 0 ? 8 : 4);

      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? '#ffffff' : colorSecondary;
      ctx.fill();

      // Outer ring on fingertips
      if (isTip) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = colorPrimary;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    }

    // Floating Hand Role Badge
    const wrist = landmarks[0];
    const roleText = isLeftHand ? 'TANGAN KIRI (ROOT)' : 'TANGAN KANAN (TYPE)';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = colorPrimary;
    ctx.shadowBlur = 8;
    ctx.fillText(roleText, wrist.x - 45, Math.min(this.canvas.height - 20, wrist.y + 35));

    ctx.restore();
  }

  drawWaveform(waveformData, width, height) {
    if (!waveformData) return;
    const { ctx } = this;

    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.45)';
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(0, 243, 255, 0.8)';
    ctx.beginPath();

    const sliceWidth = width / waveformData.length;
    let x = 0;
    const centerY = height * 0.88;

    for (let i = 0; i < waveformData.length; i++) {
      const v = waveformData[i];
      const y = centerY + v * (height * 0.08);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();
    ctx.restore();
  }
}
