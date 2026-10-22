import type { Severity } from '../types/common';

const LABELS: Record<string, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
  connected: 'Connected',
  syncing: 'Syncing',
  error: 'Error',
  disconnected: 'Disconnected',
  'not-connected': 'Not connected',
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  running: 'Running',
  stopped: 'Stopped',
  provisioning: 'Provisioning',
  info: 'Info',
  success: 'Success',
};

interface Props {
  status: string;
  label?: string;
  dot?: boolean;
}

/** Status is always conveyed by text + colour (never colour alone). */
export default function StatusBadge({ status, label, dot = true }: Props) {
  return (
    <span className={`badge ${status}`}>
      {dot && <span className="badge-dot" aria-hidden />}
      {label ?? LABELS[status] ?? status}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  return <span className={`sev-pill ${severity}`}>{severity}</span>;
}
