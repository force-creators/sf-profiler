import {
  BarChart3,
  FileText,
  Gauge,
  Info,
  Lightbulb,
  Settings,
} from 'lucide-react';
import { limitTypes } from '@sfdc-profiler/core';
import type { LoadedLog, ViewId } from '../../types';

export function AppHeader({
  activeView,
  loadedLog,
  onReturnHome,
  onViewChange,
}: {
  activeView: ViewId;
  loadedLog: LoadedLog;
  onReturnHome: () => void;
  onViewChange: (viewId: ViewId) => void;
}) {
  const latestCpuSample = loadedLog.profile.limits[limitTypes.cpuTime]?.at(-1);
  const cpuTimeLabel = latestCpuSample ? `${latestCpuSample.current} ms` : '-';

  return (
    <header className="summary-band">
      <div className="summary-band-heading">
        <button
          aria-label="Return to home"
          className="summary-band-home-button"
          onClick={onReturnHome}
          title="Return to home"
          type="button"
        >
          <img
            className="summary-band-icon"
            src="./icon.png"
            alt="SF Profiler"
          />
        </button>
        <div className="summary-band-heading-copy">
          <h2>{getActiveViewTitle(activeView)}</h2>
          <span className="eyebrow summary-band-log-name">
            {loadedLog.fileName}
          </span>
        </div>
      </div>
      <nav className="view-pill-nav" aria-label="Views">
        <button
          className={activeView === 'summary' ? 'active' : ''}
          type="button"
          onClick={() => onViewChange('summary')}
        >
          <BarChart3 size={16} aria-hidden="true" />
          Summary
        </button>
        <button
          className={activeView === 'insights' ? 'active' : ''}
          type="button"
          onClick={() => onViewChange('insights')}
        >
          <Lightbulb size={16} aria-hidden="true" />
          Insights
        </button>
        <button
          className={activeView === 'limits' ? 'active' : ''}
          type="button"
          onClick={() => onViewChange('limits')}
        >
          <Gauge size={16} aria-hidden="true" />
          Limits
        </button>
        <button
          className={activeView === 'rawLog' ? 'active' : ''}
          type="button"
          onClick={() => onViewChange('rawLog')}
        >
          <FileText size={16} aria-hidden="true" />
          Raw Log
        </button>
        <button
          className={`icon-only${activeView === 'settings' ? ' active' : ''}`}
          type="button"
          onClick={() => onViewChange('settings')}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={16} aria-hidden="true" />
        </button>
        <button
          className={`icon-only${activeView === 'about' ? ' active' : ''}`}
          type="button"
          onClick={() => onViewChange('about')}
          aria-label="About"
          title="About"
        >
          <Info size={16} aria-hidden="true" />
        </button>
      </nav>
      <div className="summary-band-metrics">
        <Metric
          label="Execution Time"
          value={`${loadedLog.profile.executionTime} ms`}
        />
        <Metric label="CPU Time" value={cpuTimeLabel} />
      </div>
    </header>
  );
}

function getActiveViewTitle(activeView: ViewId): string {
  if (activeView === 'summary') {
    return 'Profile Summary';
  }

  if (activeView === 'limits') {
    return 'Limits';
  }

  if (activeView === 'insights') {
    return 'Insights';
  }

  if (activeView === 'rawLog') {
    return 'Raw Log';
  }

  if (activeView === 'settings') {
    return 'Settings';
  }

  return 'About';
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
