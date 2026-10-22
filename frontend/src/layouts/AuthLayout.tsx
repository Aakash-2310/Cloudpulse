import type { ReactNode } from 'react';
import { Activity, BellRing, DollarSign, Layers } from 'lucide-react';
import { TAGLINE } from '../utils/constants';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="row" style={{ gap: 10 }}>
          <span className="brand-mark">
            <Activity size={17} strokeWidth={2.6} />
          </span>
          <span className="brand-name" style={{ color: '#fff' }}>
            CloudPulse
          </span>
        </div>
        <div>
          <h1 className="auth-headline">{TAGLINE}</h1>
          <p className="auth-lead">One operations console for AWS, Azure and Google Cloud — health, utilization, alerts and spend, side by side.</p>
          <div className="auth-features">
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <Layers size={16} />
              </span>
              <span>Unified inventory of compute, storage, databases and networks across every account and region.</span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <BellRing size={16} />
              </span>
              <span>Threshold rules, alert triage and service health checks with real-time updates.</span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <DollarSign size={16} />
              </span>
              <span>FinOps views with forecasts, anomaly detection and rightsizing recommendations.</span>
            </div>
          </div>
          <div className="auth-preview" aria-hidden>
            <div className="auth-preview-card">
              <div className="auth-preview-label">Providers</div>
              <div className="auth-preview-value">3</div>
            </div>
            <div className="auth-preview-card">
              <div className="auth-preview-label">Health score</div>
              <div className="auth-preview-value">92</div>
            </div>
            <div className="auth-preview-card">
              <div className="auth-preview-label">Spend (30d)</div>
              <div className="auth-preview-value">$24.7k</div>
            </div>
          </div>
        </div>
        <div className="xs" style={{ color: '#64748b' }}>
          © {new Date().getFullYear()} CloudPulse · Multi-Cloud Monitoring & Operations Platform
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="mobile-brand">
            <span className="brand-mark">
              <Activity size={17} strokeWidth={2.6} />
            </span>
            <span className="brand-name">CloudPulse</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
