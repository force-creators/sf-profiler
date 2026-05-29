import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

const MIN_SUMMARY_TOP_HEIGHT = 240;
const MIN_SUMMARY_BOTTOM_HEIGHT = 320;
const SUMMARY_SPLITTER_HEIGHT = 10;

export function useSummaryPaneResize() {
  const [summaryTopHeight, setSummaryTopHeight] = useState<number>();
  const [isSummaryTimelineCollapsed, setIsSummaryTimelineCollapsed] =
    useState(false);
  const summaryLayoutRef = useRef<HTMLDivElement | null>(null);
  const isResizingSummaryRef = useRef(false);

  useEffect(() => {
    function stopSummaryResize() {
      if (!isResizingSummaryRef.current) {
        return;
      }

      isResizingSummaryRef.current = false;
      document.body.classList.remove('is-resizing-summary');
    }

    function resizeSummaryPanels(event: PointerEvent) {
      if (!isResizingSummaryRef.current || !summaryLayoutRef.current) {
        return;
      }

      const layoutRect = summaryLayoutRef.current.getBoundingClientRect();
      const maxTopHeight = Math.max(
        MIN_SUMMARY_TOP_HEIGHT,
        layoutRect.height - SUMMARY_SPLITTER_HEIGHT - MIN_SUMMARY_BOTTOM_HEIGHT
      );
      const nextTopHeight = Math.min(
        Math.max(event.clientY - layoutRect.top, MIN_SUMMARY_TOP_HEIGHT),
        maxTopHeight
      );

      setSummaryTopHeight(nextTopHeight);
    }

    window.addEventListener('pointermove', resizeSummaryPanels);
    window.addEventListener('pointerup', stopSummaryResize);

    return () => {
      window.removeEventListener('pointermove', resizeSummaryPanels);
      window.removeEventListener('pointerup', stopSummaryResize);
      document.body.classList.remove('is-resizing-summary');
    };
  }, []);

  function startSummaryResize() {
    isResizingSummaryRef.current = true;
    document.body.classList.add('is-resizing-summary');
  }

  const summaryLayoutStyle = {
    '--summary-top-height':
      summaryTopHeight !== undefined ? `${summaryTopHeight}px` : undefined,
  } as CSSProperties;
  const summaryLayoutClassName = isSummaryTimelineCollapsed
    ? 'summary-layout summary-layout-timeline-collapsed'
    : 'summary-layout';

  return {
    isSummaryTimelineCollapsed,
    setIsSummaryTimelineCollapsed,
    startSummaryResize,
    summaryLayoutClassName,
    summaryLayoutRef,
    summaryLayoutStyle,
  };
}
