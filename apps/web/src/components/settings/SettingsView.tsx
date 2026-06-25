import {
  Activity,
  Database,
  Moon,
  Rows3,
  Sun,
  Trash2,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  PerformanceInsightCategory,
  PerformanceInsightThresholds,
} from '@sfdc-profiler/core';
import { getBrowserStorageEstimate } from '../../logStorage';
import type { AppTheme } from '../../types';

type SettingsViewProps = {
  performanceThresholds: PerformanceInsightThresholds;
  theme: AppTheme;
  onClearStorage: () => Promise<void>;
  onPerformanceThresholdsChange: (
    thresholds: PerformanceInsightThresholds
  ) => void;
  onThemeChange: (theme: AppTheme) => void;
};

type StorageEstimateState = {
  usageBytes?: number;
  quotaBytes?: number;
};

export function SettingsView({
  performanceThresholds,
  theme,
  onClearStorage,
  onPerformanceThresholdsChange,
  onThemeChange,
}: SettingsViewProps) {
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateState>();
  const [thresholdDrafts, setThresholdDrafts] = useState<
    Record<PerformanceInsightCategory, string>
  >(() => formatThresholdDrafts(performanceThresholds));

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

  useEffect(() => {
    setThresholdDrafts(formatThresholdDrafts(performanceThresholds));
  }, [performanceThresholds]);

  function updateThresholdDraft(category: PerformanceInsightCategory, value: string) {
    setThresholdDrafts((drafts) => ({
      ...drafts,
      [category]: value,
    }));
  }

  function commitPerformanceThreshold(category: PerformanceInsightCategory) {
    const parsedValue = parseThresholdDraft(thresholdDrafts[category]);

    if (parsedValue === undefined) {
      setThresholdDrafts((drafts) => ({
        ...drafts,
        [category]: String(performanceThresholds[category]),
      }));
      return;
    }

    if (parsedValue === performanceThresholds[category]) {
      setThresholdDrafts((drafts) => ({
        ...drafts,
        [category]: String(parsedValue),
      }));
      return;
    }

    onPerformanceThresholdsChange({
      ...performanceThresholds,
      [category]: parsedValue,
    });
  }

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
          <h3>Insights</h3>
          <p className="muted">
            Set warning thresholds for performance insights.
          </p>
        </header>
        <div className="insight-threshold-grid">
          {performanceThresholdSettings.map((setting) => {
            const Icon = setting.icon;

            return (
              <label className="insight-threshold-control" key={setting.category}>
                <span>
                  <Icon size={16} aria-hidden="true" />
                  {setting.label}
                </span>
                <div className="threshold-input-wrap">
                  <input
                    inputMode="numeric"
                    onBlur={() => commitPerformanceThreshold(setting.category)}
                    onChange={(event) =>
                      updateThresholdDraft(setting.category, event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }

                      if (event.key === 'Escape') {
                        setThresholdDrafts((drafts) => ({
                          ...drafts,
                          [setting.category]: String(
                            performanceThresholds[setting.category]
                          ),
                        }));
                        event.currentTarget.blur();
                      }
                    }}
                    type="text"
                    value={thresholdDrafts[setting.category]}
                  />
                  <small>ms</small>
                </div>
              </label>
            );
          })}
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
            saved log, theme, insight settings, and cached app data from this
            browser.
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

const performanceThresholdSettings: Array<{
  category: PerformanceInsightCategory;
  label: string;
  icon: LucideIcon;
}> = [
  { category: 'dml', label: 'DML', icon: Rows3 },
  { category: 'soql', label: 'SOQL', icon: Database },
  { category: 'apex', label: 'Apex', icon: Activity },
  { category: 'flow', label: 'Flow', icon: Workflow },
];

function formatThresholdDrafts(
  thresholds: PerformanceInsightThresholds
): Record<PerformanceInsightCategory, string> {
  return {
    dml: String(thresholds.dml),
    soql: String(thresholds.soql),
    apex: String(thresholds.apex),
    flow: String(thresholds.flow),
  };
}

function parseThresholdDraft(value: string): number | undefined {
  const normalizedValue = value.trim().replace(/,/g, '');
  const parsedValue = Number.parseInt(normalizedValue, 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return undefined;
  }

  return parsedValue;
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
