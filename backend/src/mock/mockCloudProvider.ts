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
} from '../providers/CloudProvider';
import type { Environment, Provider, ResourceType } from '../models/types';
import { generateMetricSeries, nextLiveSample } from './mockMetrics';
import { generateDailyCosts, profileFor } from './mockCosts';
import { createRng, digits, hashString, hex } from './random';

interface Template {
  name: string;
  type: ResourceType;
  service: string;
  sku: string;
  region: string;
  env?: Environment;
  state?: 'running' | 'stopped';
  cpu: number;
  memory: number;
  network: number;
  cost: number;
  storage?: [number, number]; // usedGB, totalGB
  netCap?: number;
  ageDays: number;
  team: string;
}

export const PROVIDER_REGIONS: Record<Provider, string[]> = {
  aws: [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1',
    'eu-north-1', 'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'sa-east-1',
  ],
  azure: ['eastus', 'eastus2', 'westus2', 'westeurope', 'northeurope', 'uksouth', 'centralindia', 'southeastasia'],
  gcp: ['us-central1', 'us-east1', 'us-west1', 'europe-west1', 'asia-south1', 'asia-southeast1'],
};

/** Realistic inventories for the demo accounts, keyed by account id. */
const CATALOG: Record<string, Template[]> = {
  // AWS – acme-production
  '482916305417': [
    { name: 'prod-api-server-01', type: 'virtual-machine', service: 'EC2', sku: 'm6i.xlarge', region: 'us-east-1', cpu: 58, memory: 64, network: 220, cost: 312, storage: [62, 100], ageDays: 410, team: 'platform' },
    { name: 'prod-api-server-02', type: 'virtual-machine', service: 'EC2', sku: 'm6i.xlarge', region: 'us-east-1', cpu: 54, memory: 61, network: 205, cost: 312, storage: [58, 100], ageDays: 410, team: 'platform' },
    { name: 'prod-api-server-03', type: 'virtual-machine', service: 'EC2', sku: 'm6i.xlarge', region: 'eu-west-1', cpu: 47, memory: 57, network: 160, cost: 334, storage: [51, 100], ageDays: 220, team: 'platform' },
    { name: 'prod-api-server-04', type: 'virtual-machine', service: 'EC2', sku: 'm6i.xlarge', region: 'eu-west-1', cpu: 79, memory: 76, network: 240, cost: 334, storage: [70, 100], ageDays: 6, team: 'platform' },
    { name: 'auth-service-01', type: 'virtual-machine', service: 'EC2', sku: 'c6i.large', region: 'us-east-1', cpu: 36, memory: 48, network: 90, cost: 124, storage: [22, 50], ageDays: 530, team: 'identity' },
    { name: 'batch-worker-01', type: 'virtual-machine', service: 'EC2', sku: 'c6i.2xlarge', region: 'us-east-1', cpu: 6, memory: 18, network: 8, cost: 248, storage: [40, 200], ageDays: 300, team: 'data' },
    { name: 'batch-worker-02', type: 'virtual-machine', service: 'EC2', sku: 'c6i.2xlarge', region: 'us-east-1', state: 'stopped', cpu: 0, memory: 0, network: 0, cost: 18, storage: [35, 200], ageDays: 300, team: 'data' },
    { name: 'legacy-reporting-01', type: 'virtual-machine', service: 'EC2', sku: 't3.large', region: 'us-east-1', cpu: 4, memory: 22, network: 3, cost: 61, storage: [80, 120], ageDays: 940, team: 'finance' },
    { name: 'payment-db-primary', type: 'database', service: 'RDS', sku: 'db.r6g.2xlarge', region: 'us-east-1', cpu: 86, memory: 83, network: 310, cost: 1180, storage: [690, 1000], ageDays: 620, team: 'payments' },
    { name: 'payment-db-replica', type: 'database', service: 'RDS', sku: 'db.r6g.xlarge', region: 'us-east-1', cpu: 41, memory: 66, network: 140, cost: 590, storage: [688, 1000], ageDays: 620, team: 'payments' },
    { name: 'orders-aurora-cluster', type: 'database', service: 'RDS', sku: 'db.r6g.large', region: 'eu-west-1', cpu: 44, memory: 59, network: 120, cost: 640, storage: [410, 1000], ageDays: 380, team: 'commerce' },
    { name: 'prod-eks-cluster', type: 'kubernetes-cluster', service: 'EKS', sku: '18 × m6i.xlarge', region: 'us-east-1', cpu: 63, memory: 71, network: 880, cost: 1310, storage: [1450, 3600], netCap: 10000, ageDays: 450, team: 'platform' },
    { name: 'web-load-balancer', type: 'load-balancer', service: 'Data Transfer', sku: 'ALB', region: 'us-east-1', cpu: 22, memory: 15, network: 1250, cost: 210, netCap: 5000, ageDays: 700, team: 'platform' },
    { name: 'customer-storage', type: 'object-storage', service: 'S3', sku: 'S3 Standard', region: 'us-east-1', cpu: 3, memory: 2, network: 340, cost: 420, storage: [15800, 20000], ageDays: 900, team: 'platform' },
    { name: 'media-assets', type: 'object-storage', service: 'S3', sku: 'S3 Intelligent-Tiering', region: 'us-east-1', cpu: 2, memory: 2, network: 510, cost: 286, storage: [9200, 20000], ageDays: 640, team: 'web' },
    { name: 'logs-archive', type: 'object-storage', service: 'S3', sku: 'S3 Glacier IR', region: 'eu-west-1', cpu: 1, memory: 1, network: 12, cost: 96, storage: [42000, 50000], ageDays: 1100, team: 'security' },
    { name: 'checkout-service', type: 'container', service: 'EKS', sku: 'Fargate 2 vCPU / 4 GiB', region: 'us-east-1', cpu: 52, memory: 63, network: 180, cost: 168, ageDays: 150, team: 'commerce' },
    { name: 'notification-worker', type: 'container', service: 'EKS', sku: 'Fargate 1 vCPU / 2 GiB', region: 'us-east-1', cpu: 28, memory: 44, network: 40, cost: 74, ageDays: 210, team: 'growth' },
    { name: 'image-resize-fn', type: 'serverless-function', service: 'Lambda', sku: '1024 MB', region: 'us-east-1', cpu: 18, memory: 35, network: 60, cost: 92, ageDays: 330, team: 'web' },
    { name: 'invoice-generator-fn', type: 'serverless-function', service: 'Lambda', sku: '512 MB', region: 'eu-west-1', cpu: 12, memory: 28, network: 14, cost: 38, ageDays: 260, team: 'finance' },
    { name: 'prod-vpc-main', type: 'virtual-network', service: 'Data Transfer', sku: '10.0.0.0/16', region: 'us-east-1', cpu: 0, memory: 0, network: 2100, cost: 145, netCap: 10000, ageDays: 1200, team: 'network' },
  ],
  // AWS – acme-staging
  '715203948861': [
    { name: 'staging-api-server-01', type: 'virtual-machine', service: 'EC2', sku: 't3.xlarge', region: 'us-west-2', env: 'staging', cpu: 21, memory: 39, network: 35, cost: 121, storage: [28, 80], ageDays: 200, team: 'platform' },
    { name: 'staging-api-server-02', type: 'virtual-machine', service: 'EC2', sku: 't3.xlarge', region: 'us-west-2', env: 'staging', cpu: 7, memory: 24, network: 9, cost: 121, storage: [25, 80], ageDays: 200, team: 'platform' },
    { name: 'staging-db', type: 'database', service: 'RDS', sku: 'db.t4g.large', region: 'us-west-2', env: 'staging', cpu: 17, memory: 46, network: 22, cost: 188, storage: [96, 200], ageDays: 340, team: 'platform' },
    { name: 'staging-eks-cluster', type: 'kubernetes-cluster', service: 'EKS', sku: '4 × t3.xlarge', region: 'us-west-2', env: 'staging', cpu: 29, memory: 52, network: 70, cost: 226, storage: [210, 640], ageDays: 260, team: 'platform' },
    { name: 'staging-artifacts', type: 'object-storage', service: 'S3', sku: 'S3 Standard', region: 'us-west-2', env: 'staging', cpu: 1, memory: 1, network: 18, cost: 31, storage: [880, 2000], ageDays: 480, team: 'platform' },
    { name: 'qa-test-runner', type: 'virtual-machine', service: 'EC2', sku: 'c6i.xlarge', region: 'us-west-2', env: 'development', state: 'stopped', cpu: 0, memory: 0, network: 0, cost: 9, storage: [30, 100], ageDays: 90, team: 'qa' },
  ],
  // Azure – acme-enterprise
  'b7c41e2a-9f3d-4c18-8e6a-2d5f0a71c934': [
    { name: 'erp-app-vm-01', type: 'virtual-machine', service: 'Virtual Machines', sku: 'Standard_D4s_v5', region: 'eastus', cpu: 49, memory: 68, network: 110, cost: 286, storage: [180, 256], ageDays: 520, team: 'erp' },
    { name: 'erp-app-vm-02', type: 'virtual-machine', service: 'Virtual Machines', sku: 'Standard_D4s_v5', region: 'eastus', cpu: 46, memory: 66, network: 104, cost: 286, storage: [176, 256], ageDays: 520, team: 'erp' },
    { name: 'reporting-vm-01', type: 'virtual-machine', service: 'Virtual Machines', sku: 'Standard_E8s_v5', region: 'westeurope', cpu: 9, memory: 31, network: 14, cost: 412, storage: [210, 512], ageDays: 370, team: 'finance' },
    { name: 'dev-sandbox-vm', type: 'virtual-machine', service: 'Virtual Machines', sku: 'Standard_B2ms', region: 'eastus', env: 'development', state: 'stopped', cpu: 0, memory: 0, network: 0, cost: 12, storage: [40, 128], ageDays: 60, team: 'engineering' },
    { name: 'crm-sql-primary', type: 'database', service: 'SQL Database', sku: 'GP_Gen5_8', region: 'eastus', cpu: 67, memory: 74, network: 160, cost: 920, storage: [610, 1024], ageDays: 690, team: 'crm' },
    { name: 'catalog-cosmos', type: 'database', service: 'Cosmos DB', sku: '12,000 RU/s', region: 'westeurope', cpu: 38, memory: 52, network: 210, cost: 780, storage: [240, 500], ageDays: 300, team: 'commerce' },
    { name: 'aks-platform-cluster', type: 'kubernetes-cluster', service: 'AKS', sku: '12 × Standard_D8s_v5', region: 'eastus', cpu: 71, memory: 82, network: 640, cost: 1090, storage: [980, 2400], netCap: 10000, ageDays: 410, team: 'platform' },
    { name: 'app-gateway-prod', type: 'load-balancer', service: 'Bandwidth', sku: 'WAF_v2', region: 'eastus', cpu: 31, memory: 22, network: 820, cost: 260, netCap: 4000, ageDays: 600, team: 'network' },
    { name: 'blob-backups', type: 'object-storage', service: 'Blob Storage', sku: 'Cool LRS', region: 'eastus', cpu: 2, memory: 1, network: 65, cost: 540, storage: [44200, 50000], ageDays: 800, team: 'infra' },
    { name: 'blob-documents', type: 'object-storage', service: 'Blob Storage', sku: 'Hot ZRS', region: 'westeurope', cpu: 2, memory: 1, network: 140, cost: 310, storage: [6100, 10000], ageDays: 540, team: 'legal' },
    { name: 'hr-portal-container', type: 'container', service: 'AKS', sku: 'Container Apps 1 vCPU', region: 'westeurope', cpu: 23, memory: 41, network: 30, cost: 64, ageDays: 180, team: 'hr' },
    { name: 'event-processor-func', type: 'serverless-function', service: 'Functions', sku: 'Premium EP1', region: 'eastus', cpu: 33, memory: 47, network: 75, cost: 142, ageDays: 240, team: 'integration' },
    { name: 'hub-vnet', type: 'virtual-network', service: 'Bandwidth', sku: '10.20.0.0/16', region: 'eastus', cpu: 0, memory: 0, network: 1500, cost: 88, netCap: 10000, ageDays: 900, team: 'network' },
  ],
  // GCP – acme-analytics
  'acme-analytics-prod': [
    { name: 'analytics-cluster', type: 'kubernetes-cluster', service: 'GKE', sku: '10 × n2-standard-8', region: 'us-central1', cpu: 74, memory: 69, network: 720, cost: 690, storage: [1300, 3000], netCap: 10000, ageDays: 330, team: 'data' },
    { name: 'etl-runner-vm', type: 'virtual-machine', service: 'Compute Engine', sku: 'n2-standard-4', region: 'us-central1', cpu: 55, memory: 60, network: 95, cost: 198, storage: [120, 200], ageDays: 280, team: 'data' },
    { name: 'ml-training-node-01', type: 'virtual-machine', service: 'Compute Engine', sku: 'a2-highgpu-1g', region: 'us-central1', cpu: 91, memory: 84, network: 260, cost: 640, storage: [380, 500], ageDays: 45, team: 'ml' },
    { name: 'ml-training-node-02', type: 'virtual-machine', service: 'Compute Engine', sku: 'a2-highgpu-1g', region: 'us-central1', cpu: 88, memory: 80, network: 240, cost: 640, storage: [352, 500], ageDays: 45, team: 'ml' },
    { name: 'jupyter-workbench', type: 'virtual-machine', service: 'Compute Engine', sku: 'e2-standard-4', region: 'europe-west1', env: 'development', cpu: 5, memory: 26, network: 4, cost: 97, storage: [60, 100], ageDays: 120, team: 'ml' },
    { name: 'warehouse-cloudsql', type: 'database', service: 'Cloud SQL', sku: 'db-custom-8-32768', region: 'us-central1', cpu: 52, memory: 70, network: 130, cost: 520, storage: [770, 1000], ageDays: 400, team: 'data' },
    { name: 'data-lake-raw', type: 'object-storage', service: 'Cloud Storage', sku: 'Standard', region: 'us-central1', cpu: 1, memory: 1, network: 290, cost: 330, storage: [27000, 40000], ageDays: 500, team: 'data' },
    { name: 'data-lake-curated', type: 'object-storage', service: 'Cloud Storage', sku: 'Nearline', region: 'europe-west1', cpu: 1, memory: 1, network: 60, cost: 118, storage: [8400, 20000], ageDays: 460, team: 'data' },
    { name: 'recommendation-api', type: 'container', service: 'Cloud Run', sku: '2 vCPU / 4 GiB', region: 'us-central1', cpu: 44, memory: 51, network: 150, cost: 140, ageDays: 160, team: 'ml' },
    { name: 'ingest-pubsub-fn', type: 'serverless-function', service: 'Cloud Run', sku: 'Cloud Functions 2nd gen', region: 'us-central1', cpu: 26, memory: 33, network: 85, cost: 46, ageDays: 210, team: 'data' },
    { name: 'analytics-lb', type: 'load-balancer', service: 'Compute Engine', sku: 'Global HTTPS LB', region: 'us-central1', cpu: 19, memory: 12, network: 430, cost: 72, netCap: 4000, ageDays: 330, team: 'network' },
    { name: 'analytics-vpc', type: 'virtual-network', service: 'Compute Engine', sku: 'custom-mode', region: 'us-central1', cpu: 0, memory: 0, network: 980, cost: 41, netCap: 10000, ageDays: 520, team: 'network' },
  ],
};

/** Templates for accounts connected through the "Add Cloud Provider" wizard. */
const GENERIC: Record<Provider, Array<Omit<Template, 'region' | 'name'> & { suffix: string }>> = {
  aws: [
    { suffix: 'web-01', type: 'virtual-machine', service: 'EC2', sku: 't3.large', cpu: 34, memory: 48, network: 60, cost: 68, storage: [30, 80], ageDays: 120, team: 'web' },
    { suffix: 'web-02', type: 'virtual-machine', service: 'EC2', sku: 't3.large', cpu: 31, memory: 45, network: 55, cost: 68, storage: [28, 80], ageDays: 120, team: 'web' },
    { suffix: 'db', type: 'database', service: 'RDS', sku: 'db.t4g.medium', cpu: 27, memory: 52, network: 30, cost: 96, storage: [60, 200], ageDays: 200, team: 'web' },
    { suffix: 'assets', type: 'object-storage', service: 'S3', sku: 'S3 Standard', cpu: 1, memory: 1, network: 40, cost: 22, storage: [400, 2000], ageDays: 300, team: 'web' },
    { suffix: 'alb', type: 'load-balancer', service: 'EC2', sku: 'ALB', cpu: 12, memory: 9, network: 140, cost: 24, netCap: 2000, ageDays: 120, team: 'web' },
    { suffix: 'cron-fn', type: 'serverless-function', service: 'Lambda', sku: '256 MB', cpu: 9, memory: 20, network: 3, cost: 4, ageDays: 90, team: 'web' },
  ],
  azure: [
    { suffix: 'app-vm-01', type: 'virtual-machine', service: 'Virtual Machines', sku: 'Standard_D2s_v5', cpu: 37, memory: 52, network: 45, cost: 140, storage: [50, 128], ageDays: 150, team: 'apps' },
    { suffix: 'sql', type: 'database', service: 'SQL Database', sku: 'GP_Gen5_2', cpu: 29, memory: 49, network: 25, cost: 230, storage: [90, 250], ageDays: 210, team: 'apps' },
    { suffix: 'storage', type: 'object-storage', service: 'Blob Storage', sku: 'Hot LRS', cpu: 1, memory: 1, network: 30, cost: 35, storage: [700, 2000], ageDays: 260, team: 'apps' },
    { suffix: 'func', type: 'serverless-function', service: 'Virtual Machines', sku: 'Consumption', cpu: 11, memory: 22, network: 8, cost: 6, ageDays: 100, team: 'apps' },
    { suffix: 'vnet', type: 'virtual-network', service: 'Virtual Machines', sku: '10.40.0.0/16', cpu: 0, memory: 0, network: 120, cost: 10, netCap: 5000, ageDays: 260, team: 'network' },
  ],
  gcp: [
    { suffix: 'vm-01', type: 'virtual-machine', service: 'Compute Engine', sku: 'e2-standard-2', cpu: 33, memory: 44, network: 40, cost: 52, storage: [24, 50], ageDays: 130, team: 'apps' },
    { suffix: 'sql', type: 'database', service: 'Cloud SQL', sku: 'db-custom-2-7680', cpu: 24, memory: 51, network: 20, cost: 110, storage: [40, 100], ageDays: 180, team: 'apps' },
    { suffix: 'bucket', type: 'object-storage', service: 'Cloud Storage', sku: 'Standard', cpu: 1, memory: 1, network: 25, cost: 14, storage: [300, 1000], ageDays: 220, team: 'apps' },
    { suffix: 'run-api', type: 'container', service: 'Compute Engine', sku: 'Cloud Run 1 vCPU', cpu: 21, memory: 30, network: 35, cost: 18, ageDays: 90, team: 'apps' },
  ],
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'account';
}

function buildResourceId(provider: Provider, account: AccountRef, t: Template): string {
  const rng = createRng(`${account.accountId}|${t.name}`);
  if (provider === 'aws') {
    const kind: Record<ResourceType, string> = {
      'virtual-machine': `i-0${hex(rng, 16)}`,
      'kubernetes-cluster': `arn:aws:eks:${t.region}:${account.accountId}:cluster/${t.name}`,
      database: `arn:aws:rds:${t.region}:${account.accountId}:db:${t.name}`,
      'object-storage': `arn:aws:s3:::acme-${t.name}`,
      'load-balancer': `arn:aws:elasticloadbalancing:${t.region}:${account.accountId}:loadbalancer/app/${t.name}/${hex(rng, 16)}`,
      'virtual-network': `vpc-0${hex(rng, 16)}`,
      container: `arn:aws:ecs:${t.region}:${account.accountId}:service/${t.name}`,
      'serverless-function': `arn:aws:lambda:${t.region}:${account.accountId}:function:${t.name}`,
    };
    return kind[t.type];
  }
  if (provider === 'azure') {
    const rp: Record<ResourceType, string> = {
      'virtual-machine': 'Microsoft.Compute/virtualMachines',
      'kubernetes-cluster': 'Microsoft.ContainerService/managedClusters',
      database: t.service === 'Cosmos DB' ? 'Microsoft.DocumentDB/databaseAccounts' : 'Microsoft.Sql/servers',
      'object-storage': 'Microsoft.Storage/storageAccounts',
      'load-balancer': 'Microsoft.Network/applicationGateways',
      'virtual-network': 'Microsoft.Network/virtualNetworks',
      container: 'Microsoft.App/containerApps',
      'serverless-function': 'Microsoft.Web/sites',
    };
    const rg = t.env === 'development' ? 'rg-dev' : `rg-${t.team}-prod`;
    return `/subscriptions/${account.accountId}/resourceGroups/${rg}/providers/${rp[t.type]}/${t.name}`;
  }
  return `projects/${account.accountId}/${t.region}/${t.type}/${t.name}-${digits(rng, 6)}`;
}

function toResource(account: AccountRef, t: Template, now: Date): DiscoveredResource {
  const provider = account.provider;
  const stopped = t.state === 'stopped';
  const [usedGB, totalGB] = t.storage ?? [0, 0];
  return {
    name: t.name,
    resourceId: buildResourceId(provider, account, t),
    provider,
    type: t.type,
    service: t.service,
    sku: t.sku,
    region: t.region,
    environment: t.env ?? (account.environment as Environment) ?? 'production',
    state: stopped ? 'stopped' : 'running',
    cpu: t.cpu,
    memory: t.memory,
    network: t.network,
    networkCapacity: t.netCap ?? 1000,
    storage: { usedGB, totalGB },
    cost: t.cost,
    tags: { team: t.team, 'managed-by': 'terraform', 'cost-center': `cc-${(hashString(t.team) % 900) + 100}` },
    baseline: { cpu: t.cpu, memory: t.memory, network: t.network },
    createdAt: new Date(now.getTime() - t.ageDays * 86_400_000),
  };
}

/** Simulated network latency for a provider API call. */
function latency(min = 120, max = 420): Promise<number> {
  const ms = Math.round(min + Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(() => resolve(ms), ms));
}

const SERVICE_CATALOG: Array<ServiceHealthSample & { profile: 'stable' | 'degraded' | 'down' | 'flaky'; baseRt: number }> = [
  { name: 'AWS EC2', category: 'cloud', provider: 'aws', description: 'Compute instances – us-east-1, eu-west-1', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'stable', baseRt: 85 },
  { name: 'AWS RDS', category: 'cloud', provider: 'aws', description: 'Managed relational databases', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'stable', baseRt: 40 },
  { name: 'AWS S3', category: 'cloud', provider: 'aws', description: 'Object storage APIs', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'stable', baseRt: 60 },
  { name: 'Azure VM', category: 'cloud', provider: 'azure', description: 'Virtual machines – East US, West Europe', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'stable', baseRt: 95 },
  { name: 'Azure SQL Database', category: 'cloud', provider: 'azure', description: 'CRM primary database service', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'flaky', baseRt: 55 },
  { name: 'Google Kubernetes Engine', category: 'cloud', provider: 'gcp', description: 'Analytics GKE control plane', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'stable', baseRt: 110 },
  { name: 'Google Cloud Storage', category: 'cloud', provider: 'gcp', description: 'Data lake buckets', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'stable', baseRt: 70 },
  { name: 'API Gateway', category: 'platform', provider: 'platform', description: 'Public API edge (api.acme.io)', endpoint: 'https://api.acme.io/healthz', status: 'warning', responseTime: 0, errorRate: 0, profile: 'degraded', baseRt: 180 },
  { name: 'Auth Service', category: 'application', provider: 'platform', description: 'OAuth2 / SSO identity service', endpoint: 'https://auth.acme.io/health', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'stable', baseRt: 75 },
  { name: 'Payment Service', category: 'application', provider: 'platform', description: 'Card processing and payouts', endpoint: 'https://pay.acme.io/health', status: 'critical', responseTime: 0, errorRate: 0, profile: 'down', baseRt: 240 },
  { name: 'Checkout Service', category: 'application', provider: 'platform', description: 'Cart and checkout orchestration', endpoint: 'https://shop.acme.io/checkout/health', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'stable', baseRt: 130 },
  { name: 'Notification Service', category: 'application', provider: 'platform', description: 'Email, SMS and push delivery', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'flaky', baseRt: 150 },
  { name: 'Search Service', category: 'application', provider: 'platform', description: 'Product and content search', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'stable', baseRt: 95 },
  { name: 'Reporting Service', category: 'application', provider: 'platform', description: 'Scheduled financial reports', status: 'healthy', responseTime: 0, errorRate: 0, profile: 'stable', baseRt: 320 },
];

export class MockCloudProvider implements CloudProvider {
  readonly id = 'mock';

  async validateConnection(input: ConnectionInput): Promise<ConnectionResult> {
    const latencyMs = await latency(400, 900);
    const creds = input.credentials;
    const required: Record<Provider, string[]> = {
      aws: ['accessKeyId', 'secretAccessKey'],
      azure: ['tenantId', 'clientId', 'clientSecret'],
      gcp: ['serviceAccountEmail', 'privateKey'],
    };
    const missing = required[input.provider].filter((k) => !creds[k] || creds[k].trim().length < 4);
    if (missing.length) {
      return { ok: false, message: `Missing or invalid credential fields: ${missing.join(', ')}`, regions: [], latencyMs };
    }
    // Simulated rejection so the error path of the wizard can be demonstrated.
    if (Object.values(creds).some((v) => /invalid|expired|denied/i.test(v))) {
      return { ok: false, message: 'Provider rejected the credentials (AccessDenied). Check the key and its permissions.', regions: [], latencyMs };
    }
    const all = PROVIDER_REGIONS[input.provider];
    const rng = createRng(`${input.provider}|${input.accountId}`);
    const count = Math.max(2, Math.min(all.length, 2 + Math.floor(rng() * (all.length - 1))));
    return {
      ok: true,
      message: `Connected to ${input.provider.toUpperCase()} account ${input.accountId}`,
      regions: all.slice(0, count),
      latencyMs,
    };
  }

  async getResources(account: AccountRef): Promise<DiscoveredResource[]> {
    await latency();
    const now = new Date();
    const known = CATALOG[account.accountId];
    if (known) return known.map((t) => toResource(account, t, now));

    const regions = account.regions.length ? account.regions : PROVIDER_REGIONS[account.provider].slice(0, 2);
    const prefix = slug(account.accountName);
    return GENERIC[account.provider].map((g, i) => {
      const { suffix, ...rest } = g;
      return toResource(account, { ...rest, name: `${prefix}-${suffix}`, region: regions[i % regions.length] }, now);
    });
  }

  async getMetrics(resource: MetricContext, from: Date, to: Date, stepMinutes: number): Promise<MetricSample[]> {
    return generateMetricSeries(resource, from, to, stepMinutes);
  }

  async getCurrentMetrics(resource: MetricContext): Promise<MetricSample> {
    return nextLiveSample(resource);
  }

  async getCosts(account: AccountRef, from: Date, to: Date): Promise<DailyCost[]> {
    const profile = profileFor(account.provider, account.accountId, account.regions);
    return generateDailyCosts(profile, from, to);
  }

  async getServiceHealth(): Promise<ServiceHealthSample[]> {
    return SERVICE_CATALOG.map(({ profile, baseRt, ...svc }) => {
      const r = Math.random();
      let status = svc.status;
      let rt = baseRt * (0.85 + Math.random() * 0.35);
      let errorRate = 0.05 + Math.random() * 0.25;
      if (profile === 'degraded') {
        status = r < 0.8 ? 'warning' : 'healthy';
        rt = baseRt * (3.5 + Math.random() * 1.5);
        errorRate = 2 + Math.random() * 2.5;
      } else if (profile === 'down') {
        status = r < 0.85 ? 'critical' : 'warning';
        rt = baseRt * (8 + Math.random() * 4);
        errorRate = 9 + Math.random() * 7;
      } else if (profile === 'flaky') {
        status = r < 0.12 ? 'warning' : 'healthy';
        if (status === 'warning') {
          rt *= 2.6;
          errorRate = 1.5 + Math.random() * 1.5;
        }
      } else {
        status = r < 0.015 ? 'warning' : 'healthy';
      }
      return { ...svc, status, responseTime: Math.round(rt), errorRate: Math.round(errorRate * 100) / 100 };
    });
  }
}
