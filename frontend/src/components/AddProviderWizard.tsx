import { useState } from 'react';
import { Check, CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import Modal from './Modal';
import ProviderIcon from './ProviderIcon';
import { cloudService } from '../services/cloudService';
import type { Environment, Provider } from '../types/common';
import type { SyncResult, ValidationResult } from '../types/cloud';
import { PROVIDERS, PROVIDER_KEYS } from '../utils/constants';
import { formatDuration } from '../utils/formatters';

const STEPS = ['Provider', 'Account', 'Validate', 'Synchronize', 'Done'];

const CREDENTIAL_FIELDS: Record<Provider, Array<{ key: string; label: string; placeholder: string; secret?: boolean; multiline?: boolean }>> = {
  aws: [
    { key: 'accessKeyId', label: 'Access key ID', placeholder: 'AKIA…' },
    { key: 'secretAccessKey', label: 'Secret access key', placeholder: '••••••••', secret: true },
    { key: 'roleArn', label: 'IAM role ARN (optional)', placeholder: 'arn:aws:iam::123456789012:role/CloudPulseReadOnly' },
  ],
  azure: [
    { key: 'tenantId', label: 'Tenant (directory) ID', placeholder: '00000000-0000-0000-0000-000000000000' },
    { key: 'clientId', label: 'Client (application) ID', placeholder: '00000000-0000-0000-0000-000000000000' },
    { key: 'clientSecret', label: 'Client secret', placeholder: '••••••••', secret: true },
  ],
  gcp: [
    { key: 'serviceAccountEmail', label: 'Service account email', placeholder: 'cloudpulse@project.iam.gserviceaccount.com' },
    { key: 'privateKey', label: 'Private key (JSON key file contents)', placeholder: '-----BEGIN PRIVATE KEY-----', secret: true, multiline: true },
  ],
};

const ACCOUNT_ID_LABEL: Record<Provider, { label: string; placeholder: string }> = {
  aws: { label: 'AWS account ID', placeholder: '123456789012' },
  azure: { label: 'Subscription ID', placeholder: '00000000-0000-0000-0000-000000000000' },
  gcp: { label: 'Project ID', placeholder: 'my-project-prod' },
};

interface Props {
  open: boolean;
  initialProvider?: Provider;
  onClose: () => void;
  onConnected: () => void;
}

export default function AddProviderWizard({ open, initialProvider, onClose, onConnected }: Props) {
  const [step, setStep] = useState(initialProvider ? 1 : 0);
  const [provider, setProvider] = useState<Provider>(initialProvider ?? 'aws');
  const [accountName, setAccountName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [environment, setEnvironment] = useState<Environment>('production');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  const payload = () => ({ provider, accountName: accountName.trim(), accountId: accountId.trim(), environment, credentials });

  const reset = () => {
    setStep(0);
    setAccountName('');
    setAccountId('');
    setCredentials({});
    setValidation(null);
    setValidationError(null);
    setSyncError(null);
    setResult(null);
    setFormError(null);
  };

  const close = () => {
    if (validating || syncing) return;
    reset();
    onClose();
  };

  const runValidation = async () => {
    setValidating(true);
    setValidation(null);
    setValidationError(null);
    try {
      setValidation(await cloudService.validate(payload()));
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await cloudService.connect(payload());
      setResult(res.sync);
      setCredentials({}); // drop secrets from memory as soon as they're no longer needed
      setStep(4);
      onConnected();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Synchronization failed');
    } finally {
      setSyncing(false);
    }
  };

  const next = () => {
    setFormError(null);
    if (step === 1) {
      if (accountName.trim().length < 2) return setFormError('Enter an account name.');
      if (accountId.trim().length < 3) return setFormError(`Enter the ${ACCOUNT_ID_LABEL[provider].label.toLowerCase()}.`);
      const missing = CREDENTIAL_FIELDS[provider].filter((f) => !f.label.includes('optional') && !credentials[f.key]?.trim());
      if (missing.length) return setFormError(`Missing: ${missing.map((m) => m.label).join(', ')}`);
      setStep(2);
      void runValidation();
      return;
    }
    if (step === 2) {
      setStep(3);
      void runSync();
      return;
    }
    setStep((s) => s + 1);
  };

  const footer = (
    <>
      {step > 0 && step < 3 && (
        <button className="btn" onClick={() => setStep((s) => s - 1)} disabled={validating}>
          Back
        </button>
      )}
      {step < 4 && (
        <button className="btn" onClick={close} disabled={validating || syncing}>
          Cancel
        </button>
      )}
      {step === 0 && (
        <button className="btn btn-primary" onClick={next}>
          Continue
        </button>
      )}
      {step === 1 && (
        <button className="btn btn-primary" onClick={next}>
          Validate connection
        </button>
      )}
      {step === 2 && (
        <button className="btn btn-primary" onClick={next} disabled={!validation?.ok || validating}>
          Synchronize resources
        </button>
      )}
      {step === 3 && syncError && (
        <button className="btn btn-primary" onClick={() => void runSync()} disabled={syncing}>
          Retry
        </button>
      )}
      {step === 4 && (
        <button className="btn btn-primary" onClick={close}>
          Done
        </button>
      )}
    </>
  );

  return (
    <Modal open={open} title="Add cloud provider" subtitle="Connect an account with read-only monitoring access." onClose={close} footer={footer} size="lg" closeOnBackdrop={false}>
      <div className="stepper" aria-label="Progress">
        {STEPS.map((label, i) => (
          <div key={label} className="row" style={{ flex: i < STEPS.length - 1 ? 1 : 'none', gap: 8 }}>
            <div className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <span className="step-num">{i < step ? <Check size={13} /> : i + 1}</span>
              <span className="step-label">{label}</span>
            </div>
            {i < STEPS.length - 1 && <span className="step-line" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="choice-grid">
          {PROVIDER_KEYS.map((p) => (
            <button key={p} className={`choice ${provider === p ? 'selected' : ''}`} onClick={() => setProvider(p)} aria-pressed={provider === p}>
              <ProviderIcon provider={p} size={36} />
              <span className="choice-title">{PROVIDERS[p].label}</span>
              <span className="choice-sub">{PROVIDERS[p].name}</span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div>
          {formError && <div className="callout error mb-16">{formError}</div>}
          <div className="field-row">
            <div className="field">
              <label className="label" htmlFor="w-name">Account name</label>
              <input id="w-name" className="input" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="acme-production" />
            </div>
            <div className="field">
              <label className="label" htmlFor="w-id">{ACCOUNT_ID_LABEL[provider].label}</label>
              <input id="w-id" className="input mono" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder={ACCOUNT_ID_LABEL[provider].placeholder} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="w-env">Environment</label>
            <select id="w-env" className="select" value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </div>
          <div className="divider" />
          {CREDENTIAL_FIELDS[provider].map((f) => (
            <div className="field" key={f.key}>
              <label className="label" htmlFor={`w-${f.key}`}>{f.label}</label>
              {f.multiline ? (
                <textarea id={`w-${f.key}`} className="textarea mono" value={credentials[f.key] ?? ''} onChange={(e) => setCredentials((c) => ({ ...c, [f.key]: e.target.value }))} placeholder={f.placeholder} autoComplete="off" spellCheck={false} />
              ) : (
                <input id={`w-${f.key}`} className="input mono" type={f.secret ? 'password' : 'text'} value={credentials[f.key] ?? ''} onChange={(e) => setCredentials((c) => ({ ...c, [f.key]: e.target.value }))} placeholder={f.placeholder} autoComplete="off" spellCheck={false} />
              )}
            </div>
          ))}
          <div className="callout info">
            <ShieldCheck size={16} />
            <div>
              Credentials are sent once over the API to validate the connection and are never stored or returned to the browser. Demo mode
              accepts any values; include the word <code>invalid</code> to simulate a rejected key.
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="progress-steps">
          {validating && (
            <div className="progress-step">
              <Loader2 size={18} className="spin" /> Contacting {PROVIDERS[provider].label} and checking permissions…
            </div>
          )}
          {validation?.ok && (
            <>
              <div className="callout success">
                <CheckCircle2 size={16} />
                <div>
                  <b>{validation.message}</b>
                  <div className="small">
                    Responded in {validation.latencyMs} ms · {validation.regions.length} regions available
                  </div>
                </div>
              </div>
              <div className="tag-list">
                {validation.regions.map((r) => (
                  <span className="tag" key={r}>{r}</span>
                ))}
              </div>
            </>
          )}
          {validationError && (
            <div className="callout error">
              <XCircle size={16} />
              <div>
                <b>Connection failed</b>
                <div className="small">{validationError}</div>
                <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setStep(1)}>
                  Edit credentials
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="progress-steps">
          <div className="progress-step">
            <CheckCircle2 size={18} className="text-healthy" /> Connection validated
          </div>
          <div className="progress-step">
            {syncing ? <Loader2 size={18} className="spin" /> : syncError ? <XCircle size={18} className="text-critical" /> : <CheckCircle2 size={18} className="text-healthy" />}
            Discovering resources, loading metrics and billing history…
          </div>
          {syncError && <div className="callout error">{syncError}</div>}
        </div>
      )}

      {step === 4 && result && (
        <div className="state" style={{ padding: '12px 0' }}>
          <div className="state-icon" style={{ background: 'var(--status-healthy-soft)', color: 'var(--status-healthy)' }}>
            <CheckCircle2 size={22} />
          </div>
          <div className="state-title">{accountName} is connected</div>
          <div className="state-text">
            Discovered {result.discovered} resources and {result.costRecords.toLocaleString()} billing records in {formatDuration(result.durationMs)}.
            Monitoring starts immediately.
          </div>
        </div>
      )}
    </Modal>
  );
}
