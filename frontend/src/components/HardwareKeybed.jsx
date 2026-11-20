import React from 'react';

const PIANO_KEYS = (() => {
  const notesOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const startOctave = 2;
  const numOctaves = 3;
  const keys = [];
  let whiteIdx = 0;
  const whiteWidthPct = 100 / (numOctaves * 7);

  for (let oct = startOctave; oct < startOctave + numOctaves; oct++) {
    for (const note of notesOrder) {
      const isBlack = note.includes('#');
      const noteName = `${note}${oct}`;
      if (isBlack) {
        keys.push({
          noteName,
          baseRoot: note.replace('#', ''),
          isSharp: true,
          label: '',
          isBlack: true,
          leftPct: (whiteIdx - 0.34) * whiteWidthPct,
          widthPct: whiteWidthPct * 0.68
        });
      } else {
        keys.push({
          noteName,
          baseRoot: note,
          isSharp: false,
          label: note === 'C' ? noteName : note,
          isC: note === 'C',
          isBlack: false
        });
        whiteIdx++;
      }
    }
  }
  return keys;
})();

export default function HardwareKeybed({
  octave,
  activeNotes,
  bassNote,
  onOctaveChange,
  onMuteAll,
  onClickKeyRoot
}) {
  return (
    <section className="hw-module hw-keybed-deck" aria-label="Piano keyboard">
      <div className="hw-keybed-row">
        <div className="hw-lhs-switches">
          <button
            type="button"
            className="hw-mech-btn"
            onClick={() => onOctaveChange(octave - 1)}
            title="Octave down"
          >
            <span>−</span>
            <small>OCT</small>
          </button>
          <button
            type="button"
            className="hw-mech-btn"
            onClick={() => onOctaveChange(octave + 1)}
            title="Octave up"
          >
            <span>+</span>
            <small>OCT</small>
          </button>
          <div className="hw-oct-readout mono-val">
            <span>OCT</span>
            <strong>0{octave}</strong>
          </div>
          <button
            type="button"
            className="hw-mech-btn mute-btn"
            onClick={onMuteAll}
            title="Stop sound (Key 0)"
          >
            <span>STOP</span>
          </button>
        </div>

        {/* 3-Octave Keybed — Clicking any key plays that chord root */}
        <div className="hw-piano-bed" aria-hidden="true">
          {PIANO_KEYS.map((k) => {
            const isActive = activeNotes.includes(k.noteName);
            const isBass = k.noteName === bassNote;
            return (
              <div
                key={k.noteName}
                className={`hw-key ${k.isBlack ? 'black' : 'white'} ${
                  isActive ? (isBass ? 'active-bass' : 'active') : ''
                }`}
                style={
                  k.isBlack
                    ? { left: `${k.leftPct}%`, width: `${k.widthPct}%` }
                    : undefined
                }
                onClick={() => onClickKeyRoot?.(k.baseRoot, k.isSharp)}
                title={`Play ${k.noteName}`}
              >
                <span className="hw-key-led" />
                {!k.isBlack && (
                  <span className={`hw-key-label mono-val ${k.isC ? 'is-c' : ''}`}>
                    {k.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
