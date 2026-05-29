import { limitTypes, type ApexLogProfile } from '@sfdc-profiler/core';
import { limitLabels } from '../limitLabels';
import { LimitMetricSection } from '../LimitMetricSection';
import { SoqlQueryList } from './SoqlQueryList';

export function SoqlLimitsSection({
  onSelectTimelineEntry,
  profile,
  selectedEntryId,
}: {
  onSelectTimelineEntry: (entryId: number) => void;
  profile: ApexLogProfile;
  selectedEntryId?: number;
}) {
  return (
    <section className="panel limit-domain-section" id="limits-section-soql">
      <header className="limit-domain-header">
        <h3>SOQL</h3>
      </header>
      <div className="limit-domain-grid">
        <LimitMetricSection
          executionTime={profile.executionTime}
          inputs={profile.limits[limitTypes.soqlQueries] ?? []}
          label={limitLabels[limitTypes.soqlQueries]}
        />
        <LimitMetricSection
          executionTime={profile.executionTime}
          inputs={profile.limits[limitTypes.soqlQueryRows] ?? []}
          label={limitLabels[limitTypes.soqlQueryRows]}
        />
      </div>
      <section className="limit-domain-detail">
        <h4>Executed Queries</h4>
        <SoqlQueryList
          executions={profile.soqlExecutions ?? []}
          onSelectTimelineEntry={onSelectTimelineEntry}
          selectedEntryId={selectedEntryId}
        />
      </section>
    </section>
  );
}
