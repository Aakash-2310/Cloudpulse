import { env } from '../config/env';
import type { Provider } from '../models/types';
import { MockCloudProvider } from '../mock/mockCloudProvider';
import type { CloudProvider } from './CloudProvider';
import { AWSCloudProvider, AzureCloudProvider, GCPCloudProvider } from './LiveProviders';

const mock = new MockCloudProvider();
const live: Record<Provider, CloudProvider> = {
  aws: new AWSCloudProvider(),
  azure: new AzureCloudProvider(),
  gcp: new GCPCloudProvider(),
};

/** Returns the adapter for a provider based on CLOUD_PROVIDER_MODE (mock | live). */
export function getProvider(provider: Provider): CloudProvider {
  return env.cloudProviderMode === 'live' ? live[provider] : mock;
}

/** Provider used for platform-wide checks (service health) that aren't tied to a single cloud. */
export function getPlatformProvider(): CloudProvider {
  return mock;
}

export type { CloudProvider } from './CloudProvider';
