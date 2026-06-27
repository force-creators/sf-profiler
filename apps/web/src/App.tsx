import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  parseApexLog,
  type PerformanceInsightThresholds,
} from '@sfdc-profiler/core';
import { AnnouncementBanner } from './components/app/AnnouncementBanner';
import { AppHeader } from './components/app/AppHeader';
import { EmptyState } from './components/app/EmptyState';
import { AutomationView } from './components/automation/AutomationView';
import { InsightsView } from './components/insights/InsightsView';
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
  persistPerformanceThresholds,
  persistTheme,
  readStoredPerformanceThresholds,
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
  const vscodeInitialLogRef = useRef(window.sfdcVsCode?.initialLog);
  const vscodeInitialThemeRef = useRef(window.sfdcVsCode?.initialTheme);
  const isVsCodeHost = vscodeInitialLogRef.current !== undefined;
  const [loadedLog, setLoadedLog] = useState<LoadedLog>();
  const [activeView, setActiveView] = useState<ViewId>('summary');
  const [theme, setTheme] = useState<AppTheme>('light');
  const [performanceThresholds, setPerformanceThresholds] =
    useState<PerformanceInsightThresholds>(() => readStoredPerformanceThresholds());
  const performanceThresholdsRef = useRef(performanceThresholds);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isRestoringLog, setIsRestoringLog] = useState(true);
  const [selectedTimelineEntryId, setSelectedTimelineEntryId] =
    useState<number>();
  const [timelineFocusRequest, setTimelineFocusRequest] = useState<
    { entryId: number; nonce: number } | undefined
  >();
  const [selectedLimitEntryId, setSelectedLimitEntryId] = useState<number>();
  const [limitsJumpRequest, setLimitsJumpRequest] = useState<
    { section: LimitsSectionId; nonce: number } | undefined
  >();
  const [insightJumpRequest, setInsightJumpRequest] = useState<
    { insightId: string; nonce: number } | undefined
  >();
  const [automationJumpRequest, setAutomationJumpRequest] = useState<
    { unitId?: string; nonce: number } | undefined
  >();
  const [rawLogJumpRequest, setRawLogJumpRequest] = useState<
    { lineNumber: number; nonce: number } | undefined
  >();
  const [recentLogs, setRecentLogs] = useState<RecentStoredLog[]>([]);
  const {
    isSummaryTimelineCollapsed,
    isSummaryTimelineExpanded,
    setIsSummaryTopCollapsed,
    setIsSummaryTimelineCollapsed,
    setIsSummaryTimelineExpanded,
    startSummaryResize,
    summaryLayoutClassName,
    summaryLayoutRef,
    summaryLayoutStyle,
  } = useSummaryPaneResize();

  const resetViewSelections = useCallback(() => {
    setActiveView('summary');
    setSelectedTimelineEntryId(undefined);
    setTimelineFocusRequest(undefined);
    setSelectedLimitEntryId(undefined);
    setLimitsJumpRequest(undefined);
    setInsightJumpRequest(undefined);
    setAutomationJumpRequest(undefined);
    setRawLogJumpRequest(undefined);
    setIsSummaryTimelineExpanded(false);
  }, [setIsSummaryTimelineExpanded]);

  const refreshRecentLogs = useCallback(async () => {
    const logs = await getRecentStoredLogs(10);
    setRecentLogs(logs);
  }, []);

  const applyLoadedLog = useCallback(
    async (
      fileName: string,
      rawText: string,
      options: { persist?: boolean } = {}
    ) => {
      const shouldPersist = options.persist ?? !isVsCodeHost;

      if (!shouldPersist) {
        const profile = parseApexLog(rawText, {
          sourceName: fileName,
          performanceThresholds,
        });

        setLoadedLog({ fileName, rawText, profile });
        resetViewSelections();

        return;
      }

      const existingLogMatch = await findStoredLogByRawText(rawText);

      if (existingLogMatch) {
        const reopenedLog = await reopenStoredLog(
          existingLogMatch.hash,
          existingLogMatch.storedLog,
          fileName
        );
        const profile = parseApexLog(reopenedLog.rawText, {
          sourceName: reopenedLog.fileName,
          performanceThresholds,
        });

        setLoadedLog({
          fileName: reopenedLog.fileName,
          rawText: reopenedLog.rawText,
          profile,
        });
        resetViewSelections();

        return;
      }

      const profile = parseApexLog(rawText, {
        sourceName: fileName,
        performanceThresholds,
      });
      const nextLoadedLog = { fileName, rawText, profile };

      setLoadedLog(nextLoadedLog);
      resetViewSelections();

      await persistLoadedLog(nextLoadedLog);
    },
    [isVsCodeHost, performanceThresholds, resetViewSelections]
  );

  useEffect(() => {
    if (isVsCodeHost) {
      setTheme(vscodeInitialThemeRef.current ?? 'light');
      return;
    }

    setTheme(readStoredTheme());
  }, [isVsCodeHost]);

  useEffect(() => {
    performanceThresholdsRef.current = performanceThresholds;
  }, [performanceThresholds]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.title = loadedLog?.fileName
      ? `${loadedLog.fileName} | SF Profiler`
      : 'SF Profiler | Salesforce Debug Log Analyzer';
  }, [loadedLog]);

  useEffect(() => {
    const vscodeInitialLog = vscodeInitialLogRef.current;

    if (vscodeInitialLog) {
      const profile = parseApexLog(vscodeInitialLog.rawText, {
        sourceName: vscodeInitialLog.fileName,
        performanceThresholds: performanceThresholdsRef.current,
      });

      setLoadedLog({
        fileName: vscodeInitialLog.fileName,
        rawText: vscodeInitialLog.rawText,
        profile,
      });
      resetViewSelections();
      setIsRestoringLog(false);

      return undefined;
    }

    let isCancelled = false;

    async function restorePersistedLog() {
      setIsRestoringLog(true);

      const storedLog = await readStoredLogFromUrl();

      if (isCancelled) {
        return;
      }

      if (storedLog) {
        const profile = parseApexLog(storedLog.rawText, {
          sourceName: storedLog.fileName,
          performanceThresholds: performanceThresholdsRef.current,
        });

        setLoadedLog({
          fileName: storedLog.fileName,
          rawText: storedLog.rawText,
          profile,
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

  function focusTimelineEntry(entryId?: number) {
    setSelectedTimelineEntryId(entryId);

    if (entryId !== undefined) {
      setTimelineFocusRequest({ entryId, nonce: Date.now() });
      setIsSummaryTimelineCollapsed(false);
      setIsSummaryTimelineExpanded(true);
    }

    setActiveView('summary');
  }

  const handleSummaryTimelineCollapseChange = useCallback(
    (isCollapsed: boolean) => {
      setIsSummaryTimelineCollapsed(isCollapsed);

      if (isCollapsed) {
        setIsSummaryTimelineExpanded(false);
      }
    },
    [setIsSummaryTimelineCollapsed, setIsSummaryTimelineExpanded]
  );

  function openLimitsView(entryId?: number) {
    setSelectedLimitEntryId(entryId);
    setLimitsJumpRequest(undefined);
    setActiveView('limits');
  }

  function openLimitsSection(section: LimitsSectionId) {
    setLimitsJumpRequest({ section, nonce: Date.now() });
    setActiveView('limits');
  }

  function openInsightsView(insightId?: string) {
    setInsightJumpRequest(
      insightId ? { insightId, nonce: Date.now() } : undefined
    );
    setActiveView('insights');
  }

  function openAutomationView(unitId?: string) {
    setAutomationJumpRequest({ unitId, nonce: Date.now() });
    setActiveView('automation');
  }

  function openRawLogAtLine(lineNumber: number) {
    if (isVsCodeHost) {
      return;
    }

    setRawLogJumpRequest({ lineNumber, nonce: Date.now() });
    setActiveView('rawLog');
  }

  function handleThemeChange(nextTheme: AppTheme) {
    setTheme(nextTheme);
    persistTheme(nextTheme);
  }

  function handlePerformanceThresholdsChange(
    nextThresholds: PerformanceInsightThresholds
  ) {
    setPerformanceThresholds(nextThresholds);
    persistPerformanceThresholds(nextThresholds);

    setLoadedLog((currentLog) => {
      if (!currentLog) {
        return currentLog;
      }

      return {
        ...currentLog,
        profile: parseApexLog(currentLog.rawText, {
          sourceName: currentLog.fileName,
          performanceThresholds: nextThresholds,
        }),
      };
    });
  }

  async function handleClearStorage() {
    const confirmed = window.confirm(
      "This will clear the profiler's saved logs, theme, insight settings, and cached browser storage for this site. The page will reload afterward. Continue?"
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
      {!loadedLog && !isVsCodeHost && <AnnouncementBanner />}
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
              hideRawLog={isVsCodeHost}
              loadedLog={loadedLog}
              onReturnHome={handleReturnHome}
              showHomeButton={!isVsCodeHost}
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
                    onOpenAutomation={openAutomationView}
                    onOpenInsights={openInsightsView}
                    onOpenLimitsSection={openLimitsSection}
                    onSelectTimelineEntry={focusTimelineEntry}
                    onTopCollapseChange={setIsSummaryTopCollapsed}
                    selectedEntryId={selectedTimelineEntryId}
                  />
                </div>
                {!isSummaryTimelineCollapsed && !isSummaryTimelineExpanded && (
                  <button
                    aria-label="Resize summary sections"
                    className="summary-resizer"
                    onPointerDown={startSummaryResize}
                    type="button"
                  />
                )}
                <div className="summary-bottom-region">
                  <TimelineView
                    isExpanded={isSummaryTimelineExpanded}
                    isActive={activeView === 'summary'}
                    onJumpToRawLogLine={
                      isVsCodeHost ? undefined : openRawLogAtLine
                    }
                    onCollapseChange={handleSummaryTimelineCollapseChange}
                    onExpandedChange={setIsSummaryTimelineExpanded}
                    onOpenAutomation={openAutomationView}
                    onShowInLimits={openLimitsView}
                    profile={loadedLog.profile}
                    focusRequest={timelineFocusRequest}
                    selectedEntryId={selectedTimelineEntryId}
                  />
                </div>
              </div>
            </div>
            {activeView === 'limits' && (
              <LimitsView
                jumpRequest={limitsJumpRequest}
                onSelectTimelineEntry={focusTimelineEntry}
                profile={loadedLog.profile}
                selectedEntryId={selectedLimitEntryId}
              />
            )}
            {activeView === 'automation' && (
              <AutomationView
                jumpRequest={automationJumpRequest}
                onOpenInsight={openInsightsView}
                onSelectTimelineEntry={focusTimelineEntry}
                profile={loadedLog.profile}
              />
            )}
            {activeView === 'insights' && (
              <InsightsView
                jumpRequest={insightJumpRequest}
                onOpenAutomation={openAutomationView}
                onSelectTimelineEntry={focusTimelineEntry}
                profile={loadedLog.profile}
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
                performanceThresholds={performanceThresholds}
                theme={theme}
                onClearStorage={handleClearStorage}
                onPerformanceThresholdsChange={handlePerformanceThresholdsChange}
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
