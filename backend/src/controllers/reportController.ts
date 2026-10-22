import type { Request, Response } from 'express';
import { Resource } from '../models/Resource';
import { Alert } from '../models/Alert';
import { ServiceHealth } from '../models/ServiceHealth';
import { CostRecord } from '../models/CostRecord';
import { AppError, asyncHandler } from '../utils/http';
import { buildResourceFilter } from './resourceController';
import { getDashboardSummary, getInsights } from '../services/monitoringService';
import { getCostSummary, getCostBreakdown, detectAnomalies } from '../services/costService';

type Row = Record<string, string | number | boolean | null | undefined | Date>;

function csvCell(value: Row[string]): string {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  // Prevent CSV/formula injection when opened in spreadsheet software.
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(rows: Row[], columns: string[]): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n');
}

function sendCsv(res: Response, name: string, csv: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cloudpulse-${name}-${stamp}.csv"`);
  res.send(csv);
}

const REPORTS = ['resources', 'alerts', 'costs', 'service-health', 'summary'] as const;

/** GET /api/reports/:type – CSV exports (summary is JSON). */
export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const type = req.params.type as (typeof REPORTS)[number];
  if (!REPORTS.includes(type)) throw new AppError(404, `Unknown report. Available: ${REPORTS.join(', ')}`);

  if (type === 'resources') {
    const items = await Resource.find(buildResourceFilter(req.query as Record<string, unknown>)).sort({ provider: 1, name: 1 }).limit(10000).lean();
    const rows = items.map((r) => ({
      name: r.name,
      resourceId: r.resourceId,
      provider: r.provider,
      type: r.type,
      service: r.service,
      sku: r.sku,
      region: r.region,
      environment: r.environment,
      status: r.status,
      state: r.state,
      cpuPct: r.cpu,
      memoryPct: r.memory,
      networkMbps: r.network,
      storageUsedGB: Math.round(r.storage?.usedGB ?? 0),
      storageTotalGB: r.storage?.totalGB ?? 0,
      monthlyCostUsd: r.cost,
      lastUpdated: r.updatedAt,
    }));
    return sendCsv(res, 'resources', toCsv(rows, Object.keys(rows[0] ?? { name: '' })));
  }

  if (type === 'alerts') {
    const filter: Record<string, unknown> = {};
    if (typeof req.query.status === 'string' && req.query.status !== 'all') filter.status = req.query.status;
    const items = await Alert.find(filter).sort({ createdAt: -1 }).limit(10000).lean();
    const rows = items.map((a) => ({
      title: a.title,
      severity: a.severity,
      status: a.status,
      type: a.type,
      provider: a.provider,
      resource: a.resourceName,
      rule: a.ruleName,
      createdAt: a.createdAt,
      acknowledgedAt: a.acknowledgedAt,
      resolvedAt: a.resolvedAt,
      description: a.description,
    }));
    return sendCsv(res, 'alerts', toCsv(rows, ['title', 'severity', 'status', 'type', 'provider', 'resource', 'rule', 'createdAt', 'acknowledgedAt', 'resolvedAt', 'description']));
  }

  if (type === 'costs') {
    const days = Math.min(185, Math.max(1, Number(req.query.days) || 30));
    const from = new Date(Date.now() - days * 86_400_000);
    const items = await CostRecord.find({ date: { $gte: from } }).sort({ date: -1, provider: 1, service: 1 }).lean();
    const rows = items.map((c) => ({ date: c.date.toISOString().slice(0, 10), provider: c.provider, service: c.service, region: c.region, amount: c.amount, currency: c.currency }));
    return sendCsv(res, 'costs', toCsv(rows, ['date', 'provider', 'service', 'region', 'amount', 'currency']));
  }

  if (type === 'service-health') {
    const items = await ServiceHealth.find().sort({ name: 1 }).lean();
    const rows = items.map((s) => ({
      service: s.name,
      category: s.category,
      provider: s.provider,
      status: s.status,
      uptimePct: s.uptime,
      responseTimeMs: s.responseTime,
      errorRatePct: s.errorRate,
      lastChecked: s.lastChecked,
    }));
    return sendCsv(res, 'service-health', toCsv(rows, ['service', 'category', 'provider', 'status', 'uptimePct', 'responseTimeMs', 'errorRatePct', 'lastChecked']));
  }

  // Executive summary (JSON) – used by the "Export report" button for a full snapshot.
  const [dashboard, insights, costs, byProvider, byService, anomalies] = await Promise.all([
    getDashboardSummary(),
    getInsights(),
    getCostSummary(),
    getCostBreakdown('provider', 30),
    getCostBreakdown('service', 30),
    detectAnomalies(20),
  ]);
  res.setHeader('Content-Disposition', `attachment; filename="cloudpulse-summary-${new Date().toISOString().slice(0, 10)}.json"`);
  return res.json({
    generatedAt: new Date().toISOString(),
    kpis: dashboard.kpis,
    healthScore: dashboard.healthScore,
    providers: dashboard.providers,
    insights: insights.insights,
    recommendations: insights.recommendations,
    costs: { ...costs, byProvider, byService },
    anomalies,
  });
});
