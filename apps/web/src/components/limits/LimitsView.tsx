import { useEffect } from 'react';
import type { ApexLogProfile } from '@sfdc-profiler/core';
import { AsyncLimitsSection } from './async/AsyncLimitsSection';
import { DmlLimitsSection } from './dml/DmlLimitsSection';
import { SoqlLimitsSection } from './soql/SoqlLimitsSection';
import { SystemLimitsSection } from './system/SystemLimitsSection';

const LIMITS_JUMP_GAP = 8;

export function LimitsView({
  jumpRequest,
  onSelectTimelineEntry,
  profile,
  selectedEntryId,
}: {
  jumpRequest?: { section: 'soql' | 'dml'; nonce: number };
  onSelectTimelineEntry: (entryId: number) => void;
  profile: ApexLogProfile;
  selectedEntryId?: number;
}) {
  useEffect(() => {
    if (!jumpRequest) {
      return;
    }

    const sectionElement = document.getElementById(
      `limits-section-${jumpRequest.section}`
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
  }, [jumpRequest]);

  return (
    <div className="limits-layout">
      <SoqlLimitsSection
        onSelectTimelineEntry={onSelectTimelineEntry}
        profile={profile}
        selectedEntryId={selectedEntryId}
      />
      <DmlLimitsSection
        onSelectTimelineEntry={onSelectTimelineEntry}
        profile={profile}
        selectedEntryId={selectedEntryId}
      />
      <AsyncLimitsSection profile={profile} />
      <SystemLimitsSection profile={profile} />
    </div>
  );
}
