import { useEffect, useState } from 'react';
import type { ApexLogProfile } from '@sfdc-profiler/core';
import type { LimitsSectionId } from '../../types';
import { AsyncLimitsSection } from './async/AsyncLimitsSection';
import { DmlLimitsSection } from './dml/DmlLimitsSection';
import { SoqlLimitsSection } from './soql/SoqlLimitsSection';
import { SystemLimitsSection } from './system/SystemLimitsSection';

const LIMITS_JUMP_GAP = 8;

type LimitTab = {
  id: LimitsSectionId;
  label: string;
};

const limitTabs: LimitTab[] = [
  { id: 'soql', label: 'SOQL' },
  { id: 'dml', label: 'DML' },
  { id: 'async', label: 'Async' },
  { id: 'system', label: 'System' },
];

export function LimitsView({
  jumpRequest,
  onSelectTimelineEntry,
  profile,
  selectedEntryId,
}: {
  jumpRequest?: { section: LimitsSectionId; nonce: number };
  onSelectTimelineEntry: (entryId: number) => void;
  profile: ApexLogProfile;
  selectedEntryId?: number;
}) {
  const [activeLimitSection, setActiveLimitSection] = useState<LimitsSectionId>(
    () => getSelectedEntryLimitSection(profile, selectedEntryId) ?? 'soql'
  );

  useEffect(() => {
    if (!jumpRequest) {
      return;
    }

    setActiveLimitSection(jumpRequest.section);
  }, [jumpRequest]);

  useEffect(() => {
    const selectedEntrySection = getSelectedEntryLimitSection(
      profile,
      selectedEntryId
    );

    if (selectedEntrySection) {
      setActiveLimitSection(selectedEntrySection);
    }
  }, [profile, selectedEntryId]);

  useEffect(() => {
    const sectionElement = document.getElementById(
      `limits-section-${activeLimitSection}`
    );

    if (!sectionElement) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const stickyHeader = document.querySelector<HTMLElement>('.summary-band');
      const headerHeight = stickyHeader?.getBoundingClientRect().height ?? 0;
      const targetTop =
        window.scrollY +
        sectionElement.getBoundingClientRect().top -
        headerHeight -
        LIMITS_JUMP_GAP;
      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      window.scrollTo({
        top: Math.max(targetTop, 0),
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [activeLimitSection, jumpRequest]);

  const activeTabPanelId = getLimitTabPanelId(activeLimitSection);

  return (
    <div className="limits-layout">
      <nav className="limits-tabs" aria-label="Limit types" role="tablist">
        {limitTabs.map((tab) => {
          const isActive = activeLimitSection === tab.id;

          return (
            <button
              aria-controls={getLimitTabPanelId(tab.id)}
              aria-selected={isActive}
              className={isActive ? 'active' : ''}
              id={getLimitTabId(tab.id)}
              key={tab.id}
              onClick={() => setActiveLimitSection(tab.id)}
              role="tab"
              type="button"
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div
        aria-labelledby={getLimitTabId(activeLimitSection)}
        className="limits-tab-panel"
        id={activeTabPanelId}
        role="tabpanel"
      >
        {activeLimitSection === 'soql' && (
          <SoqlLimitsSection
            onSelectTimelineEntry={onSelectTimelineEntry}
            profile={profile}
            selectedEntryId={selectedEntryId}
          />
        )}
        {activeLimitSection === 'dml' && (
          <DmlLimitsSection
            onSelectTimelineEntry={onSelectTimelineEntry}
            profile={profile}
            selectedEntryId={selectedEntryId}
          />
        )}
        {activeLimitSection === 'async' && <AsyncLimitsSection profile={profile} />}
        {activeLimitSection === 'system' && (
          <SystemLimitsSection profile={profile} />
        )}
      </div>
    </div>
  );
}

function getSelectedEntryLimitSection(
  profile: ApexLogProfile,
  selectedEntryId?: number
): LimitsSectionId | undefined {
  if (selectedEntryId === undefined) {
    return undefined;
  }

  if (
    profile.soqlExecutions?.some(
      (execution) => execution.entryId === selectedEntryId
    )
  ) {
    return 'soql';
  }

  if (
    profile.dmlExecutions?.some(
      (execution) => execution.entryId === selectedEntryId
    )
  ) {
    return 'dml';
  }

  return undefined;
}

function getLimitTabId(section: LimitsSectionId): string {
  return `limit-tab-${section}`;
}

function getLimitTabPanelId(section: LimitsSectionId): string {
  return `limit-tab-panel-${section}`;
}
