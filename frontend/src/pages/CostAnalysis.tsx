
import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import { BreakdownBars, ServiceDonut } from '../components/CostChart';
import { Segmented } from '../components/TimeRangePicker';
import Pagination from '../components/Pagination';
import { ProviderTag } from '../components/ProviderIcon';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { RoleGate } from '../components/ProtectedRoute';
import { useFetch } from '../hooks/useFetch';
import { costService } from '../services/costService';
import type { CostBreakdownItem } from '../types/cost';
import { PROVIDER_FILTER } from '../utils/constants';
import { formatChange, formatCurrency, formatDate } from '../utils/formatters';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

function BreakdownTable({
  rows,
  label,
}: {
  rows: CostBreakdownItem[];
  label: string;
}) {
  const safeRows = Array.isArray(rows) ? rows : [];

  if (safeRows.length === 0) {
    return <EmptyState compact title="No spend" />;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{label}</th>
            <th className="num">Spend</th>
            <th className="num">Share</th>
            <th className="num">Previous period</th>
            <th className="num">Change</th>
          </tr>
        </thead>
        <tbody>
          {safeRows.map((r, index) => (
            <tr key={`${r.name ?? r.label ?? label}-${index}`}>
              <td>
                <div className="row">
                  {r.provider && label !== 'Provider' && (
                    <ProviderTag provider={r.provider} size={16} />
                  )}
                  <span className="cell-title">
                    {label === 'Provider' ? (
                      <ProviderTag provider={r.name} size={18} />
                    ) : (
                      r.label
                    )}
                  </span>
                </div>
              </td>
              <td className="num bold">
                {formatCurrency(r.amount)}
              </td>
              <td className="num">
                {Number(r.share ?? 0).toFixed(1)}%
              </td>
              <td className="num muted">
                {formatCurrency(r.previous)}
              </td>
              <td
                className={`num ${
                  r.changePct !== null && r.changePct !== undefined &&
                  r.changePct > 20
                    ? 'text-critical'
                    : r.changePct !== null && r.changePct !== undefined &&
                      r.changePct < 0
                    ? 'text-healthy'
                    : ''
                }`}
              >
                {formatChange(r.changePct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CostAnalysisContent() {
  const [days, setDays] = useState('30');
  const [provider, setProvider] = useState('all');
  const [page, setPage] = useState(1);

  const d = Number(days);

  const providers = useFetch(
    () => costService.byProvider(d),
    [d],
  );

  const services = useFetch(
    () => costService.byService(d, provider),
    [d, provider],
  );

  const regions = useFetch(
    () => costService.byRegion(d, provider),
    [d, provider],
  );

  const records = useFetch(
    () => costService.records({ page, limit: 15, provider }),
    [page, provider],
  );

  // Normalize API responses so missing arrays do not crash the UI.
  const providerRows = Array.isArray(providers.data)
    ? providers.data
    : [];

  const serviceRows = Array.isArray(services.data)
    ? services.data
    : [];

  const regionRows = Array.isArray(regions.data)
    ? regions.data
    : [];

  const recordResponse = records.data;
  const recordItems = Array.isArray(recordResponse?.items)
    ? recordResponse.items
    : [];

  const recordMeta = recordResponse?.meta;

  return (
    <>
      <PageHeader
        eyebrow="FinOps"
        title="Cost Analysis"
        subtitle="Break spend down by provider, service and region and compare with the previous period."
      />

      <div className="row wrap mb-16" style={{ gap: 10 }}>
        <Segmented
          label="Period"
          value={days}
          onChange={setDays}
          options={PERIODS}
        />

        <Segmented
          label="Provider"
          value={provider}
          onChange={(value) => {
            setProvider(value);
            setPage(1);
          }}
          options={PROVIDER_FILTER}
        />
      </div>

      <div className="grid grid-2 mb-16">
        <Card
          title="By provider"
          subtitle={`Last ${days} days vs previous ${days} days`}
          flush
        >
          {providers.error ? (
            <ErrorState
              compact
              message={providers.error}
              onRetry={providers.reload}
            />
          ) : !providers.data ? (
            <CardSkeleton rows={3} />
          ) : (
            <BreakdownTable
              rows={providerRows}
              label="Provider"
            />
          )}
        </Card>

        <Card
          title="Service mix"
          subtitle={`Last ${days} days`}
        >
          {services.error ? (
            <ErrorState
              compact
              message={services.error}
              onRetry={services.reload}
            />
          ) : !services.data ? (
            <CardSkeleton chart />
          ) : (
            <ServiceDonut
              data={serviceRows}
              height={220}
            />
          )}
        </Card>

        <Card title="By service" flush>
          {services.error ? (
            <ErrorState
              compact
              message={services.error}
              onRetry={services.reload}
            />
          ) : !services.data ? (
            <CardSkeleton rows={6} />
          ) : serviceRows.length === 0 ? (
            <EmptyState compact title="No spend" />
          ) : (
            <BreakdownTable
              rows={serviceRows}
              label="Service"
            />
          )}
        </Card>

        <Card title="By region">
          {regions.error ? (
            <ErrorState
              compact
              message={regions.error}
              onRetry={regions.reload}
            />
          ) : !regions.data ? (
            <CardSkeleton rows={6} />
          ) : (
            <BreakdownBars
              data={regionRows}
              max={12}
            />
          )}
        </Card>
      </div>

      <Card
        title="Billing records"
        subtitle="Daily line items from provider billing exports"
        flush
        actions={<BarChart3 size={16} className="muted" />}
      >
        {records.error ? (
          <ErrorState
            compact
            message={records.error}
            onRetry={records.reload}
          />
        ) : !recordResponse ? (
          <CardSkeleton rows={8} />
        ) : recordItems.length === 0 ? (
          <EmptyState
            compact
            title="No billing records"
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Provider</th>
                    <th>Service</th>
                    <th>Region</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recordItems.map((r, index) => (
                    <tr key={r._id ?? `${r.date}-${index}`}>
                      <td>{formatDate(r.date)}</td>
                      <td>
                        <ProviderTag
                          provider={r.provider}
                          size={16}
                        />
                      </td>
                      <td>{r.service}</td>
                      <td className="mono">{r.region}</td>
                      <td className="num">
                        {formatCurrency(r.amount, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {recordMeta && (
              <Pagination
                meta={recordMeta}
                onPage={setPage}
                label="records"
              />
            )}
          </>
        )}
      </Card>
    </>
  );
}

export default function CostAnalysis() {
  return (
    <RoleGate roles={['admin', 'operator']}>
      <CostAnalysisContent />
    </RoleGate>
  );
}

