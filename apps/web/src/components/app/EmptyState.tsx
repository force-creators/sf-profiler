import { Upload, X } from 'lucide-react';
import type { ChangeEvent, MouseEvent } from 'react';
import type { RecentStoredLog } from '../../types';
import { SocialLinks } from '../about/SocialLinks';

export function EmptyState({
  isRestoring,
  isDropTargetActive,
  onFileChange,
  recentLogs,
  onOpenRecentLog,
  onRemoveRecentLog,
}: {
  isRestoring: boolean;
  isDropTargetActive: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  recentLogs: RecentStoredLog[];
  onOpenRecentLog: (hash: string) => void;
  onRemoveRecentLog: (hash: string) => void;
}) {
  const hasRecentLogs = !isRestoring && recentLogs.length > 0;

  return (
    <div
      className={`empty-state${isDropTargetActive ? ' empty-state-dragging' : ''}${
        hasRecentLogs ? ' empty-state-with-recents' : ''
      }`}
    >
      <img className="empty-state-icon" src="./icon.png" alt="SF Profiler" />
      <div className="empty-state-main panel">
        <h2>{isRestoring ? 'Restoring saved log' : 'Open a Salesforce debug log'}</h2>
        <p>
          {isRestoring
            ? 'Loading the log from browser storage.'
            : 'An effective Salesforce profiler for Apex, Flow, SOQL, DML, and governor limits. Drag and drop a log file, or choose one manually. All parsing stays on-device in your browser.'}
        </p>
        {!isRestoring && (
          <label className="upload-target">
            <Upload size={18} aria-hidden="true" />
            <span>Open Log</span>
            <input type="file" accept=".log,.txt" onChange={onFileChange} />
          </label>
        )}
      </div>
      {hasRecentLogs && (
        <aside className="empty-state-recent panel" aria-label="Recent logs">
          <div className="panel-title">
            <h3>Recent Logs</h3>
          </div>
          <ol className="empty-state-recent-list">
            {recentLogs.map((recentLog) => (
              <li key={recentLog.hash}>
                <div className="empty-state-recent-item">
                  <button
                    className="empty-state-recent-open"
                    onClick={() => onOpenRecentLog(recentLog.hash)}
                    type="button"
                  >
                    <strong title={recentLog.fileName}>
                      {recentLog.fileName}
                    </strong>
                    <span>{formatStoredAt(recentLog.storedAt)}</span>
                  </button>
                  <button
                    aria-label={`Remove ${recentLog.fileName} from recent logs`}
                    className="empty-state-recent-remove"
                    onClick={(event) => {
                      stopOpeningRecentLog(event);
                      onRemoveRecentLog(recentLog.hash);
                    }}
                    title="Remove from recent logs"
                    type="button"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      )}
      <SocialLinks className="empty-state-social-links" />
      <p className="empty-state-rank">
        SF Profiler is a Salesforce debug log profiler for Web and VS Code that
        finds slow Apex, duplicate SOQL, DML cost, recursion, automation
        loops, CPU time, and governor limit pressure locally on your device.
      </p>
      <p className="empty-state-copyright">
        Powered by SF Profiler. Copyright 2026 Matthew Swing-McKenzie &amp; Force
        Creators.
      </p>
    </div>
  );
}

function stopOpeningRecentLog(event: MouseEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

function formatStoredAt(storedAt: string): string {
  const date = new Date(storedAt);

  if (Number.isNaN(date.getTime())) {
    return 'Last opened recently';
  }

  return `Last opened ${date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
}
