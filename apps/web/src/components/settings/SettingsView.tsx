import { Moon, Sun, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getBrowserStorageEstimate } from '../../logStorage';
import type { AppTheme } from '../../types';

type SettingsViewProps = {
  theme: AppTheme;
  onClearStorage: () => Promise<void>;
  onThemeChange: (theme: AppTheme) => void;
};

type StorageEstimateState = {
  usageBytes?: number;
  quotaBytes?: number;
};

export function SettingsView({
  theme,
  onClearStorage,
  onThemeChange,
}: SettingsViewProps) {
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateState>();

  useEffect(() => {
    let isCancelled = false;

    async function loadStorageEstimate() {
      const estimate = await getBrowserStorageEstimate();

      if (!isCancelled) {
        setStorageEstimate(estimate);
      }
    }

    void loadStorageEstimate();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <section className="settings-layout" aria-label="Application settings">
      <article className="panel settings-panel">
        <header className="panel-title settings-title">
          <h3>Appearance</h3>
          <p className="muted">Choose how the profiler UI is displayed.</p>
        </header>
        <div className="theme-toggle" role="group" aria-label="Theme mode">
          <button
            className={theme === 'light' ? 'active' : ''}
            type="button"
            onClick={() => onThemeChange('light')}
          >
            <Sun size={16} aria-hidden="true" />
            Light
          </button>
          <button
            className={theme === 'dark' ? 'active' : ''}
            type="button"
            onClick={() => onThemeChange('dark')}
          >
            <Moon size={16} aria-hidden="true" />
            Dark
          </button>
        </div>
      </article>
      <article className="panel settings-panel">
        <header className="panel-title settings-title">
          <h3>Storage</h3>
          <p className="muted">
            See how much space this site is using and clear it when needed.
          </p>
        </header>
        <div className="storage-usage">
          <div className="storage-usage-header">
            <strong>
              {storageEstimate?.usageBytes !== undefined
                ? formatBytes(storageEstimate.usageBytes)
                : 'Unavailable'}
            </strong>
            <span>
              {storageEstimate?.quotaBytes !== undefined
                ? `of ${formatBytes(storageEstimate.quotaBytes)}`
                : 'browser storage estimate'}
            </span>
          </div>
          {storageEstimate?.usageBytes !== undefined &&
          storageEstimate?.quotaBytes ? (
            <div
              className="storage-meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(
                (storageEstimate.usageBytes / storageEstimate.quotaBytes) * 100
              )}
            >
              <span
                className="storage-meter-fill"
                style={{
                  width: `${Math.min(
                    100,
                    (storageEstimate.usageBytes / storageEstimate.quotaBytes) * 100
                  )}%`,
                }}
              />
            </div>
          ) : null}
          <p className="muted storage-usage-note">
            This shows the browser origin estimate. Clearing storage removes the
            saved log, theme, and cached app data from this browser.
          </p>
          <button
            className="storage-clear-button"
            type="button"
            onClick={() => void onClearStorage()}
          >
            <Trash2 size={16} aria-hidden="true" />
            Clear Browser Storage
          </button>
        </div>
      </article>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
