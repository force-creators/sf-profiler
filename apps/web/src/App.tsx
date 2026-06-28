import {
  Suspense,
  lazy,
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
import { SummaryView } from './components/summary/SummaryView';
import { useSummaryPaneResize } from './components/summary/useSummaryPaneResize';
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

const AboutView = lazy(() =>
  import('./components/about/AboutView').then((module) => ({
    default: module.AboutView,
  }))
);
const AutomationView = lazy(() =>
  import('./components/automation/AutomationView').then((module) => ({
    default: module.AutomationView,
  }))
);
const InsightsView = lazy(() =>
  import('./components/insights/InsightsView').then((module) => ({
    default: module.InsightsView,
  }))
);
const LimitsView = lazy(() =>
  import('./components/limits/LimitsView').then((module) => ({
    default: module.LimitsView,
  }))
);
const RawLogView = lazy(() =>
  import('./components/rawlog/RawLogView').then((module) => ({
    default: module.RawLogView,
  }))
);
const SettingsView = lazy(() =>
  import('./components/settings/SettingsView').then((module) => ({
    default: module.SettingsView,
  }))
);
const TimelineView = lazy(() =>
  import('./components/timeline/TimelineView').then((module) => ({
    default: module.TimelineView,
  }))
);

type LoadingCopy = {
  title: string;
  message: string;
};

type VsCodeHostMessage =
  | {
      type: 'loadStarted';
      fileName: string;
    }
  | {
      type: 'openLog';
      fileName: string;
      rawText: string;
    }
  | {
      type: 'loadError';
      fileName?: string;
      message: string;
    };

type VsCodeWebviewApi = {
  postMessage: (
    message:
      | {
          type: 'rendererReady';
        }
      | {
          type: 'openLine';
          lineNumber: number;
        }
  ) => void;
};

export function App() {
  const vscodeConfigRef = useRef(window.sfdcVsCode);
  const vscodeApiRef = useRef<VsCodeWebviewApi | undefined>(undefined);
  const isVsCodeHost = Boolean(
    vscodeConfigRef.current?.host || vscodeConfigRef.current?.initialLog
  );

  if (isVsCodeHost && !vscodeApiRef.current) {
    vscodeApiRef.current = window.acquireVsCodeApi?.();
  }

  const [loadedLog, setLoadedLog] = useState<LoadedLog>();
  const [activeView, setActiveView] = useState<ViewId>('summary');
  const [theme, setTheme] = useState<AppTheme>('light');
  const [performanceThresholds, setPerformanceThresholds] =
    useState<PerformanceInsightThresholds>(() => readStoredPerformanceThresholds());
  const performanceThresholdsRef = useRef(performanceThresholds);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isRestoringLog, setIsRestoringLog] = useState(true);
  const [loadingCopy, setLoadingCopy] = useState<LoadingCopy | undefined>(() =>
    isVsCodeHost
      ? getVsCodeLoadingCopy(vscodeConfigRef.current?.initialFileName)
      : undefined
  );
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
        const reopenedLog = {
          fileName,
          rawText: existingLogMatch.storedLog.rawText,
          profile: existingLogMatch.storedLog.profile,
        };

        setLoadedLog(reopenedLog);
        resetViewSelections();
        void reopenStoredLog(
          existingLogMatch.hash,
          existingLogMatch.storedLog,
          fileName
        ).catch((error) => {
          console.warn('Unable to refresh stored Apex log', error);
        });

        return;
      }

      const profile = parseApexLog(rawText, {
        sourceName: fileName,
        performanceThresholds,
      });
      const nextLoadedLog = { fileName, rawText, profile };

      setLoadedLog(nextLoadedLog);
      resetViewSelections();

      persistLoadedLogAfterPaint(nextLoadedLog);
    },
    [isVsCodeHost, performanceThresholds, resetViewSelections]
  );

  useEffect(() => {
    if (isVsCodeHost) {
      setTheme(vscodeConfigRef.current?.initialTheme ?? 'light');
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
    if (isVsCodeHost) {
      const vscodeInitialLog = vscodeConfigRef.current?.initialLog;

      if (vscodeInitialLog) {
        setLoadingCopy({
          title: 'Profiling log',
          message: `Parsing ${vscodeInitialLog.fileName}.`,
        });

        void runAfterPaint(async () => {
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
        });

        return undefined;
      }

      let isCancelled = false;

      function handleVsCodeMessage(event: MessageEvent<VsCodeHostMessage>) {
        const message = event.data;

        if (!isVsCodeHostMessage(message)) {
          return;
        }

        if (message.type === 'loadStarted') {
          setLoadedLog(undefined);
          setIsRestoringLog(true);
          setLoadingCopy({
            title: 'Opening log',
            message: `Reading ${message.fileName} from VS Code.`,
          });
          return;
        }

        if (message.type === 'loadError') {
          setLoadedLog(undefined);
          setIsRestoringLog(true);
          setLoadingCopy({
            title: 'Unable to open log',
            message: message.message,
          });
          return;
        }

        setIsRestoringLog(true);
        setLoadingCopy({
          title: 'Profiling log',
          message: `Parsing ${message.fileName}.`,
        });

        void runAfterPaint(async () => {
          if (isCancelled) {
            return;
          }

          await applyLoadedLog(message.fileName, message.rawText, {
            persist: false,
          });

          if (!isCancelled) {
            setIsRestoringLog(false);
          }
        });
      }

      setLoadedLog(undefined);
      setIsRestoringLog(true);
      setLoadingCopy(getVsCodeLoadingCopy(vscodeConfigRef.current?.initialFileName));
      window.addEventListener('message', handleVsCodeMessage);
      vscodeApiRef.current?.postMessage({ type: 'rendererReady' });

      return () => {
        isCancelled = true;
        window.removeEventListener('message', handleVsCodeMessage);
      };
    }

    let isCancelled = false;

    async function restorePersistedLog() {
      setIsRestoringLog(true);
      setLoadingCopy(undefined);

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
  }, [applyLoadedLog, isVsCodeHost, resetViewSelections]);

  useEffect(() => {
    if (isRestoringLog || loadedLog) {
      return;
    }

    void refreshRecentLogs();
  }, [isRestoringLog, loadedLog, refreshRecentLogs]);

  const handleFileLoad = useCallback(
    async (file: File) => {
      setIsRestoringLog(true);
      setLoadingCopy({
        title: 'Opening log',
        message: `Reading ${file.name}.`,
      });

      try {
        const rawText = await file.text();

        setLoadingCopy({
          title: 'Profiling log',
          message: `Parsing ${file.name}.`,
        });
        await runAfterPaint(() => applyLoadedLog(file.name, rawText));
      } finally {
        setIsRestoringLog(false);
      }
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
      vscodeApiRef.current?.postMessage({
        type: 'openLine',
        lineNumber,
      });
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
            loadingMessage={loadingCopy?.message}
            loadingTitle={loadingCopy?.title}
            onFileChange={handleFileChange}
            recentLogs={recentLogs}
            onOpenRecentLog={handleOpenRecentLog}
            onRemoveRecentLog={handleRemoveRecentLog}
            showFilePicker={!isVsCodeHost}
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
                  <Suspense fallback={<TimelineLoadingFallback />}>
                    <TimelineView
                      isExpanded={isSummaryTimelineExpanded}
                      isActive={activeView === 'summary'}
                      onJumpToRawLogLine={openRawLogAtLine}
                      onCollapseChange={handleSummaryTimelineCollapseChange}
                      onExpandedChange={setIsSummaryTimelineExpanded}
                      onOpenAutomation={openAutomationView}
                      onShowInLimits={openLimitsView}
                      profile={loadedLog.profile}
                      focusRequest={timelineFocusRequest}
                      selectedEntryId={selectedTimelineEntryId}
                    />
                  </Suspense>
                </div>
              </div>
            </div>
            {activeView === 'limits' && (
              <Suspense fallback={<ViewLoadingFallback label="Loading limits..." />}>
                <LimitsView
                  jumpRequest={limitsJumpRequest}
                  onSelectTimelineEntry={focusTimelineEntry}
                  profile={loadedLog.profile}
                  selectedEntryId={selectedLimitEntryId}
                />
              </Suspense>
            )}
            {activeView === 'automation' && (
              <Suspense
                fallback={<ViewLoadingFallback label="Loading automation..." />}
              >
                <AutomationView
                  jumpRequest={automationJumpRequest}
                  onOpenInsight={openInsightsView}
                  onSelectTimelineEntry={focusTimelineEntry}
                  profile={loadedLog.profile}
                />
              </Suspense>
            )}
            {activeView === 'insights' && (
              <Suspense fallback={<ViewLoadingFallback label="Loading insights..." />}>
                <InsightsView
                  jumpRequest={insightJumpRequest}
                  onOpenAutomation={openAutomationView}
                  onSelectTimelineEntry={focusTimelineEntry}
                  profile={loadedLog.profile}
                />
              </Suspense>
            )}
            {activeView === 'rawLog' && (
              <Suspense fallback={<ViewLoadingFallback label="Loading log viewer..." />}>
                <RawLogView
                  jumpRequest={rawLogJumpRequest}
                  rawText={loadedLog.rawText}
                  theme={theme}
                />
              </Suspense>
            )}
            {activeView === 'settings' && (
              <Suspense fallback={<ViewLoadingFallback label="Loading settings..." />}>
                <SettingsView
                  performanceThresholds={performanceThresholds}
                  theme={theme}
                  onClearStorage={handleClearStorage}
                  onPerformanceThresholdsChange={handlePerformanceThresholdsChange}
                  onThemeChange={handleThemeChange}
                />
              </Suspense>
            )}
            {activeView === 'about' && (
              <Suspense fallback={<ViewLoadingFallback label="Loading about..." />}>
                <AboutView />
              </Suspense>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function TimelineLoadingFallback() {
  return (
    <section className="panel timeline-panel">
      <div className="timeline-stage-frame">
        <div
          aria-live="polite"
          className="timeline-rendering-overlay"
          role="status"
        >
          <span className="timeline-rendering-spinner" aria-hidden="true" />
          <span>Rendering timeline...</span>
        </div>
      </div>
    </section>
  );
}

function ViewLoadingFallback({ label }: { label: string }) {
  return (
    <section className="panel view-loading-panel" aria-live="polite" role="status">
      <span className="timeline-rendering-spinner" aria-hidden="true" />
      <span>{label}</span>
    </section>
  );
}

function getVsCodeLoadingCopy(fileName?: string): LoadingCopy {
  return {
    title: 'Opening log',
    message: fileName
      ? `Waiting for ${fileName} from VS Code.`
      : 'Waiting for VS Code to send the log.',
  };
}

function isVsCodeHostMessage(value: unknown): value is VsCodeHostMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }

  const message = value as Partial<VsCodeHostMessage>;

  return (
    (message.type === 'loadStarted' && typeof message.fileName === 'string') ||
    (message.type === 'openLog' &&
      typeof message.fileName === 'string' &&
      typeof message.rawText === 'string') ||
    (message.type === 'loadError' && typeof message.message === 'string')
  );
}

function persistLoadedLogAfterPaint(loadedLog: LoadedLog) {
  window.setTimeout(() => {
    void persistLoadedLog(loadedLog).catch((error) => {
      console.warn('Unable to persist Apex log analysis', error);
    });
  }, 0);
}

function runAfterPaint<T>(task: () => T | Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject);
      }, 0);
    });
  });
}
