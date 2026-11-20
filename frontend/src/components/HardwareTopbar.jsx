import React, { useState, useRef } from 'react';
import { APP_NAME, APP_TAGLINE } from '../config.js';

const TABS = [
  { id: 'play', label: 'PLAY' },
  { id: 'sounds', label: 'SOUNDS' },
  { id: 'tune', label: 'TUNE' },
  { id: 'learn', label: 'LEARN' }
];

export default function HardwareTopbar({
  activeTab,
  onSelectTab,
  isRunning,
  isStarting,
  midiName,
  customSoundCount = 0,
  settings,
  onUpdateSettings,
  onToggleEngine
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tabRefs = useRef([]);

  const handleTabKeyDown = (e, idx) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const nextIdx = (idx + dir + TABS.length) % TABS.length;
      onSelectTab(TABS[nextIdx].id);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  return (
    <header className="hw-topbar">
      <div className="hw-brand">
        <span className="hw-screw" aria-hidden="true" />
        <div className="hw-brand-titles">
          <span className="hw-model-name">{APP_NAME}</span>
          <span className="hw-model-sub">{APP_TAGLINE}</span>
        </div>
      </div>

      {/* Task-Based Navigation Tabs (WCAG Tablist) */}
      <nav className="hw-mode-switches" role="tablist" aria-label="Main navigation">
        {TABS.map((tab, idx) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => (tabRefs.current[idx] = el)}
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={`hw-keycap-tab ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
            >
              <span>{tab.label}</span>
              {tab.id === 'sounds' && customSoundCount > 0 && (
                <span className="tab-count-badge mono-val">{customSoundCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Status LEDs, Settings Popover & Power Toggle */}
      <div className="hw-power-cluster">
        <div className="hw-led-group mono-val" aria-label="Hardware status">
          <div className="hw-led-item" title={isRunning ? 'Camera active' : 'Camera standby'}>
            <span>CAM</span>
            <span className={`hw-led-dot ${isRunning ? 'on-periwinkle' : 'standby'}`} />
          </div>
          <div className="hw-led-item" title={isRunning ? 'Audio active' : 'Audio standby'}>
            <span>AUDIO</span>
            <span className={`hw-led-dot ${isRunning ? 'on-periwinkle' : ''}`} />
          </div>
          <div className="hw-led-item" title={`MIDI: ${midiName}`}>
            <span>MIDI</span>
            <span
              className={`hw-led-dot ${
                midiName && !midiName.startsWith('No') && isRunning ? 'on-amber' : ''
              }`}
            />
          </div>
        </div>

        {/* Settings Menu Button */}
        <div className="hw-settings-wrap">
          <button
            type="button"
            className={`hw-icon-btn ${settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            aria-label="Accessibility and input settings"
            title="Settings (Swap hands, Keyboard mode, Reduced motion)"
          >
            ⚙
          </button>

          {settingsOpen && (
            <div className="hw-settings-popover" role="dialog" aria-label="Settings">
              <div className="popover-title">INPUT &amp; ACCESSIBILITY</div>

              <label className="popover-toggle">
                <input
                  type="checkbox"
                  checked={settings.swapHands}
                  onChange={(e) => onUpdateSettings({ swapHands: e.target.checked })}
                />
                <span>Swap hands (Left-handed mode)</span>
              </label>

              <label className="popover-toggle">
                <input
                  type="checkbox"
                  checked={settings.keyboardMode}
                  onChange={(e) => onUpdateSettings({ keyboardMode: e.target.checked })}
                />
                <span>Keyboard play mode (Keys 1–7 &amp; Q–T)</span>
              </label>

              <label className="popover-toggle">
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(e) => onUpdateSettings({ reducedMotion: e.target.checked })}
                />
                <span>Reduced motion (Pause bird walk)</span>
              </label>

              <label className="popover-toggle">
                <input
                  type="checkbox"
                  checked={settings.showDebug}
                  onChange={(e) => onUpdateSettings({ showDebug: e.target.checked })}
                />
                <span>Show developer telemetry (Shift+D)</span>
              </label>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`hw-power-toggle ${isRunning ? 'is-on' : ''}`}
          onClick={onToggleEngine}
          disabled={isStarting}
        >
          <span className="hw-toggle-track" aria-hidden="true">
            <span className="hw-toggle-thumb" />
          </span>
          <span className="hw-toggle-label mono-val">
            {isStarting ? 'STARTING...' : isRunning ? 'ON' : 'START'}
          </span>
        </button>
      </div>
    </header>
  );
}
