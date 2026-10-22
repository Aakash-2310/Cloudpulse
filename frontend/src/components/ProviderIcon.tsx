import type { Provider } from '../types/common';
import { PROVIDERS } from '../utils/constants';

const MONOGRAM: Record<Provider, string> = { aws: 'AWS', azure: 'Az', gcp: 'GC' };

/** Neutral provider mark: brand-adjacent colour + monogram (no vendor logos are reproduced). */
export default function ProviderIcon({ provider, size = 28 }: { provider: Provider | 'platform' | string; size?: number }) {
  const meta = PROVIDERS[provider as Provider];
  return (
    <span
      className="provider-icon"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * (provider === 'aws' ? 0.32 : 0.4))),
        background: meta ? meta.color : 'var(--text-4)',
      }}
      aria-hidden
    >
      {meta ? MONOGRAM[provider as Provider] : 'CP'}
    </span>
  );
}

export function ProviderTag({ provider, size = 20 }: { provider: Provider | 'platform' | string; size?: number }) {
  const meta = PROVIDERS[provider as Provider];
  return (
    <span className="provider-tag">
      <ProviderIcon provider={provider} size={size} />
      {meta ? meta.label : 'Platform'}
    </span>
  );
}
