import React, { useRef } from 'react';

/**
 * Tactile Studio Hardware Rotary Encoder Knob (SVG)
 * Supports vertical mouse drag, scroll wheel, and double-click reset.
 */
export default function RotaryKnob({
  label,
  displayValue,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  defaultValue,
  accentColor = '#97affd',
  onChange
}) {
  const dragStartRef = useRef(null);

  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Sweep from -135 deg to +135 deg (total 270 deg)
  const angleDeg = -135 + normalized * 270;

  const clampAndEmit = (rawVal) => {
    const stepped = Math.round(rawVal / step) * step;
    const clamped = Math.max(min, Math.min(max, Number(stepped.toFixed(4))));
    onChange?.(clamped);
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    dragStartRef.current = { startY: e.clientY, startVal: value };

    const handlePointerMove = (moveEvent) => {
      if (!dragStartRef.current) return;
      const dy = dragStartRef.current.startY - moveEvent.clientY;
      const range = max - min;
      const delta = (dy / 130) * range;
      clampAndEmit(dragStartRef.current.startVal + delta);
    };

    const handlePointerUp = () => {
      dragStartRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const range = max - min;
    clampAndEmit(value + dir * Math.max(step, range * 0.04));
  };

  const handleDoubleClick = () => {
    if (defaultValue !== undefined) {
      clampAndEmit(defaultValue);
    }
  };

  // Generate 19 radial degree ticks around the encoder
  const ticks = Array.from({ length: 19 }, (_, idx) => {
    const tNorm = idx / 18;
    const tAngle = (-135 + tNorm * 270) * (Math.PI / 180) - Math.PI / 2;
    const rInner = 23;
    const rOuter = 26.5;
    const x1 = 32 + Math.cos(tAngle) * rInner;
    const y1 = 32 + Math.sin(tAngle) * rInner;
    const x2 = 32 + Math.cos(tAngle) * rOuter;
    const y2 = 32 + Math.sin(tAngle) * rOuter;
    const isLit = tNorm <= normalized + 0.01;
    return { x1, y1, x2, y2, isLit };
  });

  return (
    <div
      className="hw-knob-unit"
      onPointerDown={handlePointerDown}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
    >
      <svg className="hw-knob-svg" viewBox="0 0 64 64">
        {/* Outer degree ticks */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.isLit ? accentColor : '#2f3a50'}
            strokeWidth={t.isLit ? '1.8' : '1.3'}
            strokeLinecap="round"
          />
        ))}

        {/* Knob physical base shadow & cap */}
        <circle cx="32" cy="33.5" r="18" fill="#05070b" />
        <circle cx="32" cy="32" r="18" fill="#131724" stroke="#2f3a50" strokeWidth="1.6" />
        <circle cx="32" cy="32" r="14.5" fill="#191e2e" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />

        {/* Rotating pointer indicator */}
        <g transform={`rotate(${angleDeg} 32 32)`}>
          <line
            x1="32"
            y1="19"
            x2="32"
            y2="27"
            stroke="#f4f1ea"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="32" cy="19" r="1.4" fill={accentColor} />
        </g>
      </svg>
      <div className="hw-knob-label">{label}</div>
      <div className="hw-knob-val mono-val">{displayValue}</div>
    </div>
  );
}
