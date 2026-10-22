import type {
  AccountRef,
  CloudProvider,
  ConnectionInput,
  ConnectionResult,
  DailyCost,
  DiscoveredResource,
  MetricContext,
  MetricSample,
  ServiceHealthSample,
} from './CloudProvider';
import { ProviderNotConfiguredError } from './CloudProvider';

/**
 * Adapters for real cloud APIs.
 *
 * These are intentionally thin: the demo build ships only the MockCloudProvider (per the project brief),
 * and these classes fail loudly with ProviderNotConfiguredError instead of returning fake data.
 * To go live, install the vendor SDK and implement each method, e.g.:
 *   - AWS:   @aws-sdk/client-ec2 (DescribeInstances), @aws-sdk/client-cloudwatch (GetMetricData),
 *            @aws-sdk/client-cost-explorer (GetCostAndUsage), @aws-sdk/client-health
 *   - Azure: @azure/arm-resources, @azure/monitor-query (MetricsQueryClient), @azure/arm-costmanagement
 *   - GCP:   @google-cloud/asset, @google-cloud/monitoring, BigQuery billing export
 * No frontend changes are needed – the service layer only talks to the CloudProvider interface.
 */
abstract class LiveProviderBase implements CloudProvider {
  abstract readonly id: string;
  protected abstract readonly label: string;

  protected fail(): never {
    throw new ProviderNotConfiguredError(this.label);
  }

  async validateConnection(_input: ConnectionInput): Promise<ConnectionResult> {
    return this.fail();
  }
  async getResources(_account: AccountRef): Promise<DiscoveredResource[]> {
    return this.fail();
  }
  async getMetrics(_r: MetricContext, _from: Date, _to: Date, _step: number): Promise<MetricSample[]> {
    return this.fail();
  }
  async getCurrentMetrics(_r: MetricContext): Promise<MetricSample> {
    return this.fail();
  }
  async getCosts(_account: AccountRef, _from: Date, _to: Date): Promise<DailyCost[]> {
    return this.fail();
  }
  async getServiceHealth(): Promise<ServiceHealthSample[]> {
    return this.fail();
  }
}

export class AWSCloudProvider extends LiveProviderBase {
  readonly id = 'aws';
  protected readonly label = 'AWS';
}

export class AzureCloudProvider extends LiveProviderBase {
  readonly id = 'azure';
  protected readonly label = 'Azure';
}

export class GCPCloudProvider extends LiveProviderBase {
  readonly id = 'gcp';
  protected readonly label = 'GCP';
}
