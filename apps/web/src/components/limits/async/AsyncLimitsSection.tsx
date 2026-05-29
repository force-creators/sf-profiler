import {
  limitTypes,
  type ApexLogProfile,
  type LimitType,
} from '@sfdc-profiler/core';
import { limitLabels } from '../limitLabels';
import { LimitMetricSection } from '../LimitMetricSection';

const asyncLimitTypes: LimitType[] = [limitTypes.queueable, limitTypes.future];

export function AsyncLimitsSection({ profile }: { profile: ApexLogProfile }) {
  return (
    <section className="panel limit-domain-section">
      <header className="limit-domain-header">
        <h3>Async</h3>
      </header>
      <div className="limit-domain-grid">
        {asyncLimitTypes.map((limitType) => (
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
