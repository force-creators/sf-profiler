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
    description: 'Nested Apex, Flow, workflow, SOQL, and DML activity stay connected.',
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
    <section className="about-layout" aria-label="About SF Profiler">
      <article className="panel about-panel">
        <header className="about-hero">
          <div className="about-mark">
            <img src="./icon.png" alt="" aria-hidden="true" />
          </div>
          <div className="about-hero-copy">
            <h3>SF Profiler</h3>
            <p className="muted">
              Trace Apex, Flow, automation, and database work through dense
              Salesforce debug logs without sending customer or production data
              anywhere.
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
          <div className="about-author-heading">
            <img
              className="about-author-photo"
              src="./images/matthew-swing-mckenzie.png"
              alt="Matthew Swing-McKenzie"
            />
            <div>
              <h4>Author</h4>
              <strong>Matthew Swing-McKenzie</strong>
            </div>
          </div>
          <p className="muted">
            I am a Southern California-based Salesforce architect who started as
            a .NET engineer and moved into Salesforce more than 10 years ago.
            Since then, I have worked in some of the largest Salesforce orgs,
            where milliseconds matter and small automation choices can compound
            across millions of transactions.
          </p>
          <p className="muted">
            I built the first version of this profiler in 2020 to untangle
            broken automation and clean up complex automation architecture. This
            version is a lighter, faster rebuild that runs in the browser
            without requiring an install.
          </p>
          <SocialLinks />
        </section>
      </article>
    </section>
  );
}
