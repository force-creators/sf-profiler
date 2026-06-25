import {
  limitTypes,
  type ApexLogProfile,
  type LimitType,
} from '@sfdc-profiler/core';
import { limitLabels } from '../limitLabels';
import { LimitMetricSection } from '../LimitMetricSection';

const systemLimitTypes: LimitType[] = [
  limitTypes.cpuTime,
  limitTypes.heapSize,
  limitTypes.callouts,
];

export function SystemLimitsSection({ profile }: { profile: ApexLogProfile }) {
  return (
    <section className="panel limit-domain-section" id="limits-section-system">
      <header className="limit-domain-header">
        <h3>System</h3>
      </header>
      <div className="limit-domain-grid limit-domain-grid-3">
        {systemLimitTypes.map((limitType) => (
          <LimitMetricSection
            executionTime={profile.executionTime}
            inputs={profile.limits[limitType] ?? []}
            key={limitType}
            label={limitLabels[limitType]}
          />
        ))}
      </div>
    </section>
  );
}
