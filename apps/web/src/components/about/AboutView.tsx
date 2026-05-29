import { Activity, Database, Gauge, LockKeyhole } from 'lucide-react';
import { SocialLinks } from './SocialLinks';

const aboutHighlights = [
  {
    icon: LockKeyhole,
    label: 'Local-first',
    description: 'Debug logs are parsed in the browser or desktop shell.',
  },
  {
    icon: Activity,
    label: 'Execution flow',
    description: 'Nested Apex, workflow, SOQL, and DML activity stay connected.',
  },
  {
    icon: Gauge,
    label: 'Governor limits',
    description: 'Limit samples are grouped where they matter during analysis.',
  },
  {
    icon: Database,
    label: 'Query insight',
    description: 'Repeated SOQL and DML executions are easier to compare.',
  },
];

export function AboutView() {
  return (
    <section className="about-layout" aria-label="About SFDC Profiler">
      <article className="panel about-panel">
        <header className="about-hero">
          <div className="about-mark">
            <img src="./icon.png" alt="" aria-hidden="true" />
          </div>
          <div className="about-hero-copy">
            <h3>SFDC Profiler</h3>
            <p className="muted">
              Built to make dense Salesforce debug logs easier to reason about
              without uploading customer, org, or production log data anywhere.
            </p>
          </div>
        </header>

        <div className="about-highlight-grid" aria-label="Project focus">
          {aboutHighlights.map(({ icon: Icon, label, description }) => (
            <section className="about-highlight" key={label}>
              <Icon size={18} aria-hidden="true" />
              <div>
                <h4>{label}</h4>
                <p>{description}</p>
              </div>
            </section>
          ))}
        </div>

        <section className="about-author">
          <div>
            <h4>Author</h4>
            <strong>Matthew Swing-McKenzie</strong>
          </div>
          <p className="muted">
            I built this for the kind of log spelunking Salesforce developers do
            when a transaction is too slow, too chatty, or brushing up against
            limits.
          </p>
          <SocialLinks />
        </section>
      </article>
    </section>
  );
}
