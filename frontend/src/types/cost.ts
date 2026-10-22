import type { Provider, Severity } from './common';
import type { CostBreakdownItem, DailyCostPoint } from './metrics';

export type { CostBreakdownItem, DailyCostPoint };

export interface MonthlyCostPoint {
  month: string;
  label: string;
  aws: number;
  azure: number;
  gcp: number;
  total: number;
  partial: number;
}

export interface CostSummary {
  currency: string;
  currentMonth: number;
  previousMonth: number;
  previousMonthToDate: number;
  monthToDateChangePct: number;
  forecast: number;
  forecastChangePct: number;
  dailyCost: number;
  dailyAverage: number;
  last30Days: number;
  last30DaysChangePct: number;
  daysElapsed: number;
  daysInMonth: number;
  monthly: MonthlyCostPoint[];
  daily: DailyCostPoint[];
}

export interface CostAnomaly {
  id: string;
  type: 'week-over-week' | 'daily-spike' | 'new-service' | 'resource-creation';
  date: string;
  provider: Provider;
  service: string;
  expected: number;
  actual: number;
  difference: number;
  differencePct: number;
  severity: Severity;
  message: string;
}

export interface CostRecord {
  _id: string;
  provider: Provider;
  service: string;
  region: string;
  amount: number;
  currency: string;
  date: string;
}
