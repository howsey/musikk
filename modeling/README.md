# Modeling & AI Gesture Recognition

This module contains the computer vision machine learning models, hand landmark definitions, feature extraction routines, and musical gesture classification algorithms powering the **Aether Gesture Synth**.

---

## 1. Architecture Overview

```
[Webcam Stream]
      │
      ▼
[MediaPipe Hands ML Model] ─── (hand_landmark_full.tflite / lite.tflite)
      │
      ▼ (21 3D Hand Landmarks: x, y, z)
[Feature Extractor] ───────── (Inter-joint Euclidean distance & extension ratios)
      │
      ▼ (5-finger boolean states: thumb, index, middle, ring, pinky)
[Heuristic Classifier] ────── (Left hand -> Root note | Right hand -> Chord quality)
      │
      ▼
[Temporal Stabilizer] ─────── (Debouncer / N-frame consensus filter)
      │
      ▼
[Stable Musical Intention] ── (Root: C-B, Quality: Maj/Min/Maj7/Min7/Sharp)
```

---

## 2. Machine Learning Models (`/models`)

- **`hand_landmark_full.tflite`** (5.22 MB): High-accuracy TensorFlow Lite model predicting 21 3D hand landmarks and 2.5D hand contours.
- **`hand_landmark_lite.tflite`** (1.98 MB): Low-latency variant optimized for resource-constrained or mobile environments.
- **`hands.binarypb`**: MediaPipe CalculatorGraph binary protocol buffer defining the palm detector -> landmark subgraph pipeline.

### Landmark Keypoints (21 Points)
- `0`: Wrist
- `1 - 4`: Thumb (`THUMB_CMC`, `THUMB_MCP`, `THUMB_IP`, `THUMB_TIP`)
- `5 - 8`: Index Finger (`INDEX_FINGER_MCP`, `INDEX_FINGER_PIP`, `INDEX_FINGER_DIP`, `INDEX_FINGER_TIP`)
- `9 - 12`: Middle Finger (`MIDDLE_FINGER_MCP`, `MIDDLE_FINGER_PIP`, `MIDDLE_FINGER_DIP`, `MIDDLE_FINGER_TIP`)
- `13 - 16`: Ring Finger (`RING_FINGER_MCP`, `RING_FINGER_PIP`, `RING_FINGER_DIP`, `RING_FINGER_TIP`)
- `17 - 20`: Pinky Finger (`PINKY_MCP`, `PINKY_PIP`, `PINKY_DIP`, `PINKY_TIP`)

---

## 3. Feature Extraction & Classification Logic (`/src`)

### `gestureDetector.js`
- **Spatial Metric Calculation**: Calculates 3D Euclidean distances between joints:
  $$\text{dist}(p_1, p_2) = \sqrt{(x_1 - x_2)^2 + (y_1 - y_2)^2 + (z_1 - z_2)^2}$$
- **Extension Invariance**: Fingers are classified as *Extended* when:
  $$\text{dist}(\text{Wrist}, \text{Tip}) > 1.15 \times \text{dist}(\text{Wrist}, \text{PIP})$$
  $$\text{dist}(\text{MCP}, \text{Tip}) > 1.30 \times \text{dist}(\text{MCP}, \text{PIP})$$
- **Left Hand Classification (Root Note Selection)**:
  - 1 Finger (Index): **C**
  - 2 Fingers (Index + Middle): **D**
  - 3 Fingers (Index + Middle + Ring): **E**
  - 4 Fingers (Index + Middle + Ring + Pinky): **F**
  - 5 Fingers (All): **G**
  - 1 Finger (Thumb only): **A**
  - 2 Fingers (Thumb + Index): **B**
- **Right Hand Classification (Chord Quality / Modifiers)**:
  - 1 Finger (Index): **Major**
  - 2 Fingers (Index + Middle): **# (Sharp Root Modifier)**
  - 3 Fingers (Index + Middle + Ring): **Minor**
  - 4 Fingers (Index + Middle + Ring + Pinky): **Maj7**
  - 5 Fingers (All): **Min7**
- **Temporal Stabilizer (`GestureStabilizer`)**: Debounces raw detections across a configurable frame buffer (default $N=3$ frames) to suppress high-frequency tracking jitter.

### `musicTheory.js`
- Maps discrete gesture classifications into multi-voice chord intervals:
  - **Major**: `[0, 4, 7]` (Root, Major 3rd, Perfect 5th)
  - **Minor**: `[0, 3, 7]` (Root, Minor 3rd, Perfect 5th)
  - **Maj7**: `[0, 4, 7, 11]` (Root, Major 3rd, Perfect 5th, Major 7th)
  - **Min7**: `[0, 3, 7, 10]` (Root, Minor 3rd, Perfect 5th, Minor 7th)
- Accommodates bass note generation and enharmonic sharp transpositions.

