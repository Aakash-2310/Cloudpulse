import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '../types/common';

interface Props {
  meta: PaginationMeta;
  onPage: (page: number) => void;
  onLimit?: (limit: number) => void;
  label?: string;
}

function pages(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | '…'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('…');
  for (let p = start; p <= end; p += 1) out.push(p);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

export default function Pagination({ meta, onPage, onLimit, label = 'results' }: Props) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.total, meta.page * meta.limit);
  return (
    <div className="pagination">
      <div className="row">
        <span className="tabular">
          {from}–{to} of {meta.total} {label}
        </span>
        {onLimit && (
          <select className="select" style={{ width: 'auto', height: 30 }} value={meta.limit} onChange={(e) => onLimit(Number(e.target.value))} aria-label="Rows per page">
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
      </div>
      <nav className="pagination-controls" aria-label="Pagination">
        <button className="page-btn" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page">
          <ChevronLeft size={15} />
        </button>
        {pages(meta.page, meta.totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="muted" style={{ padding: '0 4px' }}>
              …
            </span>
          ) : (
            <button key={p} className={`page-btn ${p === meta.page ? 'active' : ''}`} onClick={() => onPage(p)} aria-current={p === meta.page ? 'page' : undefined}>
              {p}
            </button>
          ),
        )}
        <button className="page-btn" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} aria-label="Next page">
          <ChevronRight size={15} />
        </button>
      </nav>
    </div>
  );
}
