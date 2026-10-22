import type { DailyCost } from '../providers/CloudProvider';
import type { Provider } from '../models/types';
import { DAY_MS, clamp, createRng, gaussian, hashString, startOfUtcDay } from './random';

export interface CostProfile {
  provider: Provider;
  /** Approximate 30-day spend in USD for this account. */
  monthly: number;
  services: Record<string, number>; // weights summing to ~1
  regions: Record<string, number>; // weights summing to 1
}

/** Billing profiles keyed by account id. Unknown accounts get a generic profile for their provider. */
export const COST_PROFILES: Record<string, CostProfile> = {
  '482916305417': {
    provider: 'aws',
    monthly: 10900,
    services: { EC2: 0.42, RDS: 0.22, S3: 0.09, EKS: 0.12, Lambda: 0.04, 'Data Transfer': 0.11 },
    regions: { 'us-east-1': 0.75, 'eu-west-1': 0.25 },
  },
  '715203948861': {
    provider: 'aws',
    monthly: 1520,
    services: { EC2: 0.5, RDS: 0.25, S3: 0.1, EKS: 0.15 },
    regions: { 'us-west-2': 1 },
  },
  'b7c41e2a-9f3d-4c18-8e6a-2d5f0a71c934': {
    provider: 'azure',
    monthly: 7850,
    services: {
      'Virtual Machines': 0.4,
      'SQL Database': 0.18,
      'Cosmos DB': 0.1,
      'Blob Storage': 0.12,
      AKS: 0.14,
      Functions: 0.02,
      Bandwidth: 0.04,
    },
    regions: { eastus: 0.7, westeurope: 0.3 },
  },
  'acme-analytics-prod': {
    provider: 'gcp',
    monthly: 4410,
    services: { 'Compute Engine': 0.38, BigQuery: 0.2, 'Cloud SQL': 0.12, 'Cloud Storage': 0.1, GKE: 0.15, 'Cloud Run': 0.05 },
    regions: { 'us-central1': 0.8, 'europe-west1': 0.2 },
  },
};

const GENERIC_PROFILES: Record<Provider, Omit<CostProfile, 'regions'>> = {
  aws: { provider: 'aws', monthly: 1800, services: { EC2: 0.5, S3: 0.15, RDS: 0.25, Lambda: 0.1 } },
  azure: { provider: 'azure', monthly: 1500, services: { 'Virtual Machines': 0.55, 'Blob Storage': 0.2, 'SQL Database': 0.25 } },
  gcp: { provider: 'gcp', monthly: 1200, services: { 'Compute Engine': 0.55, 'Cloud Storage': 0.2, 'Cloud SQL': 0.25 } },
};

export function profileFor(provider: Provider, accountId: string, regions: string[]): CostProfile {
  const known = COST_PROFILES[accountId];
  if (known) return known;
  const generic = GENERIC_PROFILES[provider];
  const used = regions.slice(0, 2);
  const regionWeights: Record<string, number> = {};
  used.forEach((r, i) => {
    regionWeights[r] = used.length === 1 ? 1 : i === 0 ? 0.7 : 0.3;
  });
  if (!used.length) regionWeights.global = 1;
  return { ...generic, regions: regionWeights };
}

/**
 * Injected spend anomalies so the anomaly detector has something realistic to find:
 *  - AWS EC2 spend up ~34% over the last 7 days (new autoscaling group left running)
 *  - GCP BigQuery one-day spike (ad-hoc full table scans) 3 days ago
 *  - Azure Blob Storage gradually rising this month (backup retention change)
 */
function anomalyMultiplier(provider: Provider, service: string, daysAgo: number, date: Date, now: Date): number {
  if (provider === 'aws' && service === 'EC2' && daysAgo >= 1 && daysAgo <= 7) return 1.34;
  if (provider === 'gcp' && service === 'BigQuery' && daysAgo === 3) return 2.8;
  if (provider === 'azure' && service === 'Blob Storage') {
    const sameMonth = date.getUTCMonth() === now.getUTCMonth() && date.getUTCFullYear() === now.getUTCFullYear();
    if (sameMonth) return 1.18;
  }
  return 1;
}

/** Generates one record per service × region × day for [from, to] (whole UTC days). */
export function generateDailyCosts(profile: CostProfile, from: Date, to: Date, now = new Date()): DailyCost[] {
  const out: DailyCost[] = [];
  const today = startOfUtcDay(now).getTime();
  const dailyBase = profile.monthly / 30;
  for (let day = startOfUtcDay(from).getTime(); day <= startOfUtcDay(to).getTime(); day += DAY_MS) {
    const date = new Date(day);
    const daysAgo = Math.round((today - day) / DAY_MS);
    const weekday = [0, 6].includes(date.getUTCDay()) ? 0.88 : 1.04;
    // ~3.5% month-over-month organic growth.
    const growth = 1 - daysAgo * 0.0012;
    for (const [service, sWeight] of Object.entries(profile.services)) {
      for (const [region, rWeight] of Object.entries(profile.regions)) {
        const rng = createRng(hashString(`${profile.provider}|${service}|${region}|${day}`));
        const noise = clamp(1 + gaussian(rng) * 0.04, 0.85, 1.15);
        const amount =
          dailyBase * sWeight * rWeight * weekday * growth * noise * anomalyMultiplier(profile.provider, service, daysAgo, date, now);
        out.push({
          provider: profile.provider,
          service,
          region,
          amount: Math.round(amount * 100) / 100,
          currency: 'USD',
          date,
        });
      }
    }
  }
  return out;
}
