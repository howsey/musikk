// Gesture Detection Engine based on MediaPipe Hands 21 3D Landmarks

/**
 * Calculates Euclidean distance between two 2D/3D points
 */
function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Analyzes finger extension state for all 5 fingers.
 * Returns { thumb: boolean, index: boolean, middle: boolean, ring: boolean, pinky: boolean }
 * Uses orientation-invariant distance metrics from wrist (0) and MCP joints.
 */
export function getFingerStates(landmarks, isRightHand) {
  const wrist = landmarks[0];
  
  // Landmark indices
  // Thumb: 1..4
  // Index: 5..8
  // Middle: 9..12
  // Ring: 13..16
  // Pinky: 17..20

  // Index finger
  const indexTip = landmarks[8];
  const indexPip = landmarks[6];
  const indexMcp = landmarks[5];
  const indexExtended = distance(wrist, indexTip) > distance(wrist, indexPip) * 1.15 &&
                        distance(indexMcp, indexTip) > distance(indexMcp, indexPip) * 1.3;

  // Middle finger
  const middleTip = landmarks[12];
  const middlePip = landmarks[10];
  const middleMcp = landmarks[9];
  const middleExtended = distance(wrist, middleTip) > distance(wrist, middlePip) * 1.15 &&
                         distance(middleMcp, middleTip) > distance(middleMcp, middlePip) * 1.3;

  // Ring finger
  const ringTip = landmarks[16];
  const ringPip = landmarks[14];
  const ringMcp = landmarks[13];
  const ringExtended = distance(wrist, ringTip) > distance(wrist, ringPip) * 1.15 &&
                       distance(ringMcp, ringTip) > distance(ringMcp, ringPip) * 1.3;

  // Pinky finger
  const pinkyTip = landmarks[20];
  const pinkyPip = landmarks[18];
  const pinkyMcp = landmarks[17];
  const pinkyExtended = distance(wrist, pinkyTip) > distance(wrist, pinkyPip) * 1.15 &&
                        distance(pinkyMcp, pinkyTip) > distance(pinkyMcp, pinkyPip) * 1.3;

  // Thumb finger
  // Thumb extends outward away from pinky MCP base
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const thumbMcp = landmarks[2];
  const thumbExtended = distance(thumbTip, pinkyMcp) > distance(thumbIp, pinkyMcp) * 1.18 &&
                        distance(wrist, thumbTip) > distance(wrist, thumbMcp) * 1.25;

  return {
    thumb: thumbExtended,
    index: indexExtended,
    middle: middleExtended,
    ring: ringExtended,
    pinky: pinkyExtended,
    count: [thumbExtended, indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length
  };
}

/**
 * Classifies Left Hand Root Note Gesture according to user's specification:
 * 1. 1 finger (Index only): C
 * 2. 2 fingers (Index + Middle): D
 * 3. 3 fingers (Index + Middle + Ring): E
 * 4. 4 fingers (Index + Middle + Ring + Pinky): F
 * 5. 5 fingers (All 5): G
 * 6. 1 finger (Thumb only): A
 * 7. 2 fingers (Thumb + Index): B
 */
export function classifyLeftHand(fingerStates) {
  const { thumb, index, middle, ring, pinky, count } = fingerStates;

  if (count === 0) {
    return { root: null, gestureName: 'Rest (Kepalan/Diam)', fingersDesc: '0 Jari' };
  }

  // 1. 1 Jari Telunjuk -> C
  if (index && !thumb && !middle && !ring && !pinky) {
    return { root: 'C', gestureName: 'Telunjuk (1 Jari)', fingersDesc: '☝️ Telunjuk' };
  }

  // 2. 2 Jari (Telunjuk & Tengah) -> D
  if (index && middle && !thumb && !ring && !pinky) {
    return { root: 'D', gestureName: 'Telunjuk + Tengah (2 Jari)', fingersDesc: '✌️ Telunjuk + Tengah' };
  }

  // 3. 3 Jari (Telunjuk, Tengah, Manis) -> E
  if (index && middle && ring && !thumb && !pinky) {
    return { root: 'E', gestureName: 'Telunjuk + Tengah + Manis (3 Jari)', fingersDesc: '🤟 3 Jari' };
  }

  // 4. 4 Jari (Telunjuk, Tengah, Manis, Kelingking) -> F
  if (index && middle && ring && pinky && !thumb) {
    return { root: 'F', gestureName: '4 Jari (Tanpa Jempol)', fingersDesc: '🖖 4 Jari' };
  }

  // 5. 5 Jari (Seluruh Jari) -> G
  if (thumb && index && middle && ring && pinky) {
    return { root: 'G', gestureName: 'Seluruh Jari (5 Jari)', fingersDesc: '🖐️ 5 Jari Terbuka' };
  }

  // 6. 1 Jari Ibu Jari -> A
  if (thumb && !index && !middle && !ring && !pinky) {
    return { root: 'A', gestureName: 'Ibu Jari Saja (1 Jari)', fingersDesc: '👍 Ibu Jari' };
  }

  // 7. 2 Jari (Ibu Jari & Telunjuk) -> B
  if (thumb && index && !middle && !ring && !pinky) {
    return { root: 'B', gestureName: 'Ibu Jari + Telunjuk (2 Jari)', fingersDesc: '👆👍 Ibu Jari + Telunjuk' };
  }

  // Fallback if partial fingers match count
  if (count === 1 && index) return { root: 'C', gestureName: 'Telunjuk (C)', fingersDesc: '1 Jari' };
  if (count === 2 && index && middle) return { root: 'D', gestureName: '2 Jari (D)', fingersDesc: '2 Jari' };
  if (count === 3 && index && middle && ring) return { root: 'E', gestureName: '3 Jari (E)', fingersDesc: '3 Jari' };
  if (count === 4 && !thumb) return { root: 'F', gestureName: '4 Jari (F)', fingersDesc: '4 Jari' };
  if (count === 5) return { root: 'G', gestureName: '5 Jari (G)', fingersDesc: '5 Jari' };
  if (count === 1 && thumb) return { root: 'A', gestureName: 'Ibu Jari (A)', fingersDesc: '1 Jari' };
  if (count === 2 && thumb && index) return { root: 'B', gestureName: 'Ibu Jari + Telunjuk (B)', fingersDesc: '2 Jari' };

  return { root: null, gestureName: 'Gestur Transisi...', fingersDesc: `${count} Jari` };
}

/**
 * Classifies Right Hand Chord Quality / Modifier Gesture:
 * 1. 1 finger (Index only): Major
 * 2. 2 fingers (Index + Middle): # (Sharp root note)
 * 3. 3 fingers (Index + Middle + Ring): Minor
 * 4. 4 fingers (Index + Middle + Ring + Pinky): Maj7
 * 5. 5 fingers (All 5): Min7
 */
export function classifyRightHand(fingerStates) {
  const { thumb, index, middle, ring, pinky, count } = fingerStates;

  if (count === 0) {
    return null; // Hold previous quality
  }

  // 1. 1 Jari Telunjuk -> Major
  if (index && !thumb && !middle && !ring && !pinky) {
    return { quality: 'Major', isSharp: false, gestureName: 'Major', fingersDesc: '☝️ Telunjuk' };
  }

  // 2. 2 Jari (Telunjuk & Tengah) -> # (Sharp Root)
  if (index && middle && !thumb && !ring && !pinky) {
    return { quality: 'Major', isSharp: true, gestureName: '# (Sharp)', fingersDesc: '✌️ Telunjuk + Tengah' };
  }

  // 3. 3 Jari (Telunjuk, Tengah, Manis) -> Minor
  if (index && middle && ring && !thumb && !pinky) {
    return { quality: 'Minor', isSharp: false, gestureName: 'Minor', fingersDesc: '🤟 3 Jari' };
  }

  // 4. 4 Jari (Telunjuk, Tengah, Manis, Kelingking) -> Maj7
  if (index && middle && ring && pinky && !thumb) {
    return { quality: 'Maj7', isSharp: false, gestureName: 'Maj7', fingersDesc: '🖖 4 Jari' };
  }

  // 5. 5 Jari (Seluruh Jari) -> Min7
  if (thumb && index && middle && ring && pinky) {
    return { quality: 'Min7', isSharp: false, gestureName: 'Min7', fingersDesc: '🖐️ 5 Jari Terbuka' };
  }

  // Fallback by finger count
  if (count === 1) return { quality: 'Major', isSharp: false, gestureName: 'Major', fingersDesc: '1 Jari' };
  if (count === 2) return { quality: 'Major', isSharp: true, gestureName: '# (Sharp)', fingersDesc: '2 Jari' };
  if (count === 3) return { quality: 'Minor', isSharp: false, gestureName: 'Minor', fingersDesc: '3 Jari' };
  if (count === 4) return { quality: 'Maj7', isSharp: false, gestureName: 'Maj7', fingersDesc: '4 Jari' };
  if (count === 5) return { quality: 'Min7', isSharp: false, gestureName: 'Min7', fingersDesc: '5 Jari' };

  return null;
}

/**
 * Gesture Stabilizer / Debouncer
 * Prevents audio stuttering and glitching caused by single-frame hand tracking noise.
 */
export class GestureStabilizer {
  constructor(thresholdFrames = 3) {
    this.thresholdFrames = thresholdFrames;
    this.candidateGesture = null;
    this.candidateCount = 0;
    this.confirmedGesture = null;
  }

  update(rawGestureKey) {
    if (rawGestureKey === this.candidateGesture) {
      this.candidateCount++;
    } else {
      this.candidateGesture = rawGestureKey;
      this.candidateCount = 1;
    }

    if (this.candidateCount >= this.thresholdFrames) {
      this.confirmedGesture = this.candidateGesture;
    }

    return this.confirmedGesture;
  }

  reset() {
    this.candidateGesture = null;
    this.candidateCount = 0;
    this.confirmedGesture = null;
  }
}
