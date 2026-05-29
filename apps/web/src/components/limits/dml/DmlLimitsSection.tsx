import { limitTypes, type ApexLogProfile } from '@sfdc-profiler/core';
import { limitLabels } from '../limitLabels';
import { LimitMetricSection } from '../LimitMetricSection';
import { DmlExecutionList } from './DmlExecutionList';

export function DmlLimitsSection({
  onSelectTimelineEntry,
  profile,
  selectedEntryId,
}: {
  onSelectTimelineEntry: (entryId: number) => void;
  profile: ApexLogProfile;
  selectedEntryId?: number;
}) {
  return (
    <section className="panel limit-domain-section" id="limits-section-dml">
      <header className="limit-domain-header">
        <h3>DML</h3>
      </header>
      <div className="limit-domain-grid limit-domain-grid-3">
        <LimitMetricSection
          executionTime={profile.executionTime}
          inputs={profile.limits[limitTypes.dmlStatements] ?? []}
          label={limitLabels[limitTypes.dmlStatements]}
        />
        <LimitMetricSection
          executionTime={profile.executionTime}
          inputs={profile.limits[limitTypes.dmlRows] ?? []}
          label={limitLabels[limitTypes.dmlRows]}
        />
        <LimitMetricSection
          executionTime={profile.executionTime}
          inputs={profile.limits[limitTypes.dmlPublishImmediate] ?? []}
          label={limitLabels[limitTypes.dmlPublishImmediate]}
        />
      </div>
      <section className="limit-domain-detail">
        <h4>DML Executions</h4>
        <DmlExecutionList
          executions={profile.dmlExecutions ?? []}
          onSelectTimelineEntry={onSelectTimelineEntry}
          selectedEntryId={selectedEntryId}
        />
      </section>
    </section>
  );
}
