import React, { useRef } from 'react';

/**
 * Accessible Tactile Rotary Knob (WCAG 2.1.1 Keyboard + Pointer + Wheel)
 * - ArrowUp / ArrowRight: +1 step
 * - ArrowDown / ArrowLeft: -1 step
 * - PageUp / PageDown: +/- 10% of range
 * - Home / End: min / max
 * - Double-click: reset to defaultValue
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
  const range = max - min;
  const normalized = Math.max(0, Math.min(1, (value - min) / (range || 1)));
  const angleDeg = -135 + normalized * 270;

  const clampAndEmit = (rawVal) => {
    const stepped = Math.round(rawVal / step) * step;
    const clamped = Math.max(min, Math.min(max, Number(stepped.toFixed(4))));
    onChange?.(clamped);
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.focus();
    dragStartRef.current = { startY: e.clientY, startVal: value };

    const handlePointerMove = (moveEvent) => {
      if (!dragStartRef.current) return;
      const dy = dragStartRef.current.startY - moveEvent.clientY;
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
    clampAndEmit(value + dir * Math.max(step, range * 0.04));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      clampAndEmit(value + step);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      clampAndEmit(value - step);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      clampAndEmit(value + range * 0.1);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      clampAndEmit(value - range * 0.1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      clampAndEmit(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      clampAndEmit(max);
    }
  };

  const handleDoubleClick = () => {
    if (defaultValue !== undefined) {
      clampAndEmit(defaultValue);
    }
  };

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
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={displayValue}
      tabIndex={0}
    >
      <svg className="hw-knob-svg" viewBox="0 0 64 64" aria-hidden="true">
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
        <circle cx="32" cy="33.5" r="18" fill="#05070b" />
        <circle cx="32" cy="32" r="18" fill="#131724" stroke="#5d6e94" strokeWidth="1.6" />
        <circle cx="32" cy="32" r="14.5" fill="#191e2e" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
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
          <circle cx="32" cy="19" r="1.5" fill={accentColor} />
        </g>
      </svg>
      <div className="hw-knob-label">{label}</div>
      <div className="hw-knob-val mono-val">{displayValue}</div>
    </div>
  );
}
