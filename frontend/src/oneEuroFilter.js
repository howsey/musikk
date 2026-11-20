// 1-Euro Filter (Casiez et al., CHI 2012) for high-precision real-time 3D Hand Landmark & Y-Axis smoothing
// Eliminates low-speed tracking jitter while preserving zero-lag responsiveness during fast hand movements.

class LowPassFilter {
  constructor(alpha, initVal = 0) {
    this.y = initVal;
    this.s = initVal;
    this.initialized = false;
    this.setAlpha(alpha);
  }

  setAlpha(alpha) {
    this.alpha = Math.max(0.0001, Math.min(1.0, alpha));
  }

  filter(value, alpha) {
    if (alpha !== undefined) this.setAlpha(alpha);
    if (!this.initialized) {
      this.y = value;
      this.s = value;
      this.initialized = true;
      return value;
    }
    this.s = this.alpha * value + (1.0 - this.alpha) * this.s;
    this.y = value;
    return this.s;
  }

  lastValue() {
    return this.y;
  }
}

export class OneEuroFilter {
  constructor(freq = 60, minCutoff = 1.4, beta = 0.04, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPassFilter(this.alpha(minCutoff));
    this.dx = new LowPassFilter(this.alpha(dCutoff));
    this.lastTime = null;
  }

  alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(value, timestampMs = performance.now()) {
    if (this.lastTime !== null && timestampMs > this.lastTime) {
      const dt = (timestampMs - this.lastTime) / 1000.0;
      if (dt > 0 && dt < 1.0) {
        this.freq = 1.0 / dt;
      }
    }
    this.lastTime = timestampMs;

    const dValue = this.x.initialized ? (value - this.x.lastValue()) * this.freq : 0.0;
    const edValue = this.dx.filter(dValue, this.alpha(this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    return this.x.filter(value, this.alpha(cutoff));
  }
}

export class HandLandmarkSmoother {
  constructor(numPoints = 21) {
    this.numPoints = numPoints;
    this.filters = [];
    this.reset();
  }

  reset() {
    this.filters = Array.from({ length: this.numPoints }, () => ({
      x: new OneEuroFilter(60, 1.5, 0.05, 1.0),
      y: new OneEuroFilter(60, 1.5, 0.05, 1.0),
      z: new OneEuroFilter(60, 1.2, 0.03, 1.0)
    }));
  }

  smooth(landmarks, nowMs = performance.now()) {
    if (!landmarks || landmarks.length === 0) return landmarks;
    return landmarks.map((pt, idx) => {
      const f = this.filters[idx];
      if (!f) return pt;
      return {
        x: f.x.filter(pt.x, nowMs),
        y: f.y.filter(pt.y, nowMs),
        z: f.z.filter(pt.z || 0, nowMs)
      };
    });
  }
}
