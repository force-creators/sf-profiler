import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { parseApexLog } from '@sfdc-profiler/core';
import { AppHeader } from './components/app/AppHeader';
import { EmptyState } from './components/app/EmptyState';
import { LimitsView } from './components/limits/LimitsView';
import { RawLogView } from './components/rawlog/RawLogView';
import { AboutView } from './components/about/AboutView';
import { SettingsView } from './components/settings/SettingsView';
import { SummaryView } from './components/summary/SummaryView';
import { useSummaryPaneResize } from './components/summary/useSummaryPaneResize';
import { TimelineView } from './components/timeline/TimelineView';
import {
  clearBrowserStorage,
  closeStoredLog,
  findStoredLogByRawText,
  getRecentStoredLogs,
  openStoredLogByHash,
  persistLoadedLog,
  persistTheme,
  readStoredLogFromUrl,
  readStoredTheme,
  removeStoredLog,
  reopenStoredLog,
} from './logStorage';
import type {
  AppTheme,
  LimitsSectionId,
  LoadedLog,
  RecentStoredLog,
  ViewId,
} from './types';

export function App() {
  const [loadedLog, setLoadedLog] = useState<LoadedLog>();
  const [activeView, setActiveView] = useState<ViewId>('summary');
  const [theme, setTheme] = useState<AppTheme>('light');
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isRestoringLog, setIsRestoringLog] = useState(true);
  const [selectedTimelineEntryId, setSelectedTimelineEntryId] =
    useState<number>();
  const [selectedLimitEntryId, setSelectedLimitEntryId] = useState<number>();
  const [limitsJumpRequest, setLimitsJumpRequest] = useState<
    { section: LimitsSectionId; nonce: number } | undefined
  >();
  const [rawLogJumpRequest, setRawLogJumpRequest] = useState<
    { lineNumber: number; nonce: number } | undefined
  >();
  const [recentLogs, setRecentLogs] = useState<RecentStoredLog[]>([]);
  const {
    isSummaryTimelineCollapsed,
    setIsSummaryTimelineCollapsed,
    startSummaryResize,
    summaryLayoutClassName,
    summaryLayoutRef,
    summaryLayoutStyle,
  } = useSummaryPaneResize();

  const resetViewSelections = useCallback(() => {
    setActiveView('summary');
    setSelectedTimelineEntryId(undefined);
    setSelectedLimitEntryId(undefined);
    setLimitsJumpRequest(undefined);
    setRawLogJumpRequest(undefined);
  }, []);

  const refreshRecentLogs = useCallback(async () => {
    const logs = await getRecentStoredLogs(10);
    setRecentLogs(logs);
  }, []);

  const applyLoadedLog = useCallback(
    async (fileName: string, rawText: string) => {
      const existingLogMatch = await findStoredLogByRawText(rawText);

      if (existingLogMatch) {
        const reopenedLog = await reopenStoredLog(
          existingLogMatch.hash,
          existingLogMatch.storedLog,
          fileName
        );

        setLoadedLog({
          fileName: reopenedLog.fileName,
          rawText: reopenedLog.rawText,
          profile: reopenedLog.profile,
        });
        resetViewSelections();

        return;
      }

      const profile = parseApexLog(rawText, { sourceName: fileName });
      const nextLoadedLog = { fileName, rawText, profile };

      setLoadedLog(nextLoadedLog);
      resetViewSelections();

      await persistLoadedLog(nextLoadedLog);
    },
    [resetViewSelections]
  );

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.title = loadedLog?.fileName
      ? `${loadedLog.fileName} | SFDC Profiler`
      : 'SFDC Profiler | Salesforce Profiler for Apex Debug Logs';
  }, [loadedLog]);

  useEffect(() => {
    let isCancelled = false;

    async function restorePersistedLog() {
      setIsRestoringLog(true);

      const storedLog = await readStoredLogFromUrl();

      if (isCancelled) {
        return;
      }

      if (storedLog) {
        setLoadedLog({
          fileName: storedLog.fileName,
          rawText: storedLog.rawText,
          profile: storedLog.profile,
        });
      } else {
        setLoadedLog(undefined);
      }

      resetViewSelections();

      setIsRestoringLog(false);
    }

    function handleHashChange() {
      void restorePersistedLog();
    }

    void restorePersistedLog();
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      isCancelled = true;
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [resetViewSelections]);

  useEffect(() => {
    if (isRestoringLog || loadedLog) {
      return;
    }

    void refreshRecentLogs();
  }, [isRestoringLog, loadedLog, refreshRecentLogs]);

  const handleFileLoad = useCallback(
    async (file: File) => {
      const rawText = await file.text();
      await applyLoadedLog(file.name, rawText);
    },
    [applyLoadedLog]
  );

  useEffect(() => {
    const desktopApi = window.sfdcDesktop;

    if (!desktopApi) {
      return;
    }

    const unsubscribe = desktopApi.onOpenLog((payload) => {
      void applyLoadedLog(payload.fileName, payload.rawText);
    });

    desktopApi.notifyRendererReady();

    return () => {
      unsubscribe();
    };
  }, [applyLoadedLog]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    await handleFileLoad(file);
    event.target.value = '';
  }

  function handleDropZoneDragOver(event: DragEvent<HTMLElement>) {
    if (loadedLog) {
      return;
    }

    event.preventDefault();
    setIsDropTargetActive(true);
  }

  function handleDropZoneDragLeave(event: DragEvent<HTMLElement>) {
    if (loadedLog) {
      return;
    }

    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsDropTargetActive(false);
  }

  async function handleDropZoneDrop(event: DragEvent<HTMLElement>) {
    if (loadedLog) {
      return;
    }

    event.preventDefault();
    setIsDropTargetActive(false);

    const file = event.dataTransfer.files?.[0];

    if (!file) {
      return;
    }

    await handleFileLoad(file);
  }

  function openSummaryTimeline(entryId?: number) {
    setSelectedTimelineEntryId(entryId);
    setActiveView('summary');
  }

  function openLimitsView(entryId?: number) {
    setSelectedLimitEntryId(entryId);
    setLimitsJumpRequest(undefined);
    setActiveView('limits');
  }

  function openLimitsSection(section: LimitsSectionId) {
    setLimitsJumpRequest({ section, nonce: Date.now() });
    setActiveView('limits');
  }

  function openRawLogAtLine(lineNumber: number) {
    setRawLogJumpRequest({ lineNumber, nonce: Date.now() });
    setActiveView('rawLog');
  }

  function handleThemeChange(nextTheme: AppTheme) {
    setTheme(nextTheme);
    persistTheme(nextTheme);
  }

  async function handleClearStorage() {
    const confirmed = window.confirm(
      "This will clear the profiler's saved logs, theme, and cached browser storage for this site. The page will reload afterward. Continue?"
    );

    if (!confirmed) {
      return;
    }

    await clearBrowserStorage();
    setRecentLogs([]);
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`
    );
    window.location.reload();
  }

  function handleOpenRecentLog(hash: string) {
    openStoredLogByHash(hash);
  }

  async function handleRemoveRecentLog(hash: string) {
    setRecentLogs((logs) => logs.filter((recentLog) => recentLog.hash !== hash));
    await removeStoredLog(hash);
    await refreshRecentLogs();
  }

  function handleReturnHome() {
    closeStoredLog();
  }

  return (
    <main
      className={`app-shell${isDropTargetActive ? ' app-shell-dragging' : ''}`}
      onDragLeave={handleDropZoneDragLeave}
      onDragOver={handleDropZoneDragOver}
      onDrop={handleDropZoneDrop}
    >
      <section className="workspace">
        {!loadedLog ? (
          <EmptyState
            isRestoring={isRestoringLog}
            isDropTargetActive={isDropTargetActive}
            onFileChange={handleFileChange}
            recentLogs={recentLogs}
            onOpenRecentLog={handleOpenRecentLog}
            onRemoveRecentLog={handleRemoveRecentLog}
          />
        ) : (
          <>
            <AppHeader
              activeView={activeView}
              loadedLog={loadedLog}
              onReturnHome={handleReturnHome}
              onViewChange={setActiveView}
            />

            <div
              aria-hidden={activeView !== 'summary'}
              className={
                activeView === 'summary' ? 'view-pane' : 'view-pane view-pane-hidden'
              }
            >
              <div
                className={summaryLayoutClassName}
                ref={summaryLayoutRef}
                style={summaryLayoutStyle}
              >
                <div className="summary-top-region">
                  <SummaryView
                    loadedLog={loadedLog}
                    onOpenLimitsSection={openLimitsSection}
                    onSelectTimelineEntry={openSummaryTimeline}
                    selectedEntryId={selectedTimelineEntryId}
                  />
                </div>
                {!isSummaryTimelineCollapsed && (
                  <button
                    aria-label="Resize summary sections"
                    className="summary-resizer"
                    onPointerDown={startSummaryResize}
                    type="button"
                  />
                )}
                <div className="summary-bottom-region">
                  <TimelineView
                    isActive={activeView === 'summary'}
                    onJumpToRawLogLine={openRawLogAtLine}
                    onCollapseChange={setIsSummaryTimelineCollapsed}
                    onShowInLimits={openLimitsView}
                    profile={loadedLog.profile}
                    selectedEntryId={selectedTimelineEntryId}
                  />
                </div>
              </div>
            </div>
            {activeView === 'limits' && (
              <LimitsView
                jumpRequest={limitsJumpRequest}
                onSelectTimelineEntry={openSummaryTimeline}
                profile={loadedLog.profile}
                selectedEntryId={selectedLimitEntryId}
              />
            )}
            {activeView === 'rawLog' && (
              <RawLogView
                jumpRequest={rawLogJumpRequest}
                rawText={loadedLog.rawText}
                theme={theme}
              />
            )}
            {activeView === 'settings' && (
              <SettingsView
                theme={theme}
                onClearStorage={handleClearStorage}
                onThemeChange={handleThemeChange}
              />
            )}
            {activeView === 'about' && <AboutView />}
          </>
        )}
      </section>
    </main>
  );
}
