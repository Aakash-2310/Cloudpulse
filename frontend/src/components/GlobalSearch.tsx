import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Cloud, HeartPulse, Search, Server } from 'lucide-react';
import { systemService, type SearchResults } from '../services/dashboardService';
import { useDebounce } from '../hooks/useDebounce';
import StatusBadge, { SeverityPill } from './StatusBadge';
import ProviderIcon from './ProviderIcon';
import LoadingSpinner from './LoadingSpinner';
import type { Severity } from '../types/common';

interface Hit {
  key: string;
  group: string;
  title: string;
  sub: string;
  to: string;
  icon: ReactNode;
  right?: ReactNode;
}

function flatten(r: SearchResults): Hit[] {
  return [
    ...r.resources.map((x) => ({
      key: `r-${x._id}`,
      group: 'Resources',
      title: x.name,
      sub: `${x.service} · ${x.region}`,
      to: `/resources/${x._id}`,
      icon: <ProviderIcon provider={x.provider} size={22} />,
      right: <StatusBadge status={x.status} />,
    })),
    ...r.accounts.map((x) => ({
      key: `a-${x._id}`,
      group: 'Cloud accounts',
      title: x.accountName,
      sub: x.accountId,
      to: '/accounts',
      icon: <Cloud size={16} className="muted" />,
      right: <StatusBadge status={x.status} />,
    })),
    ...r.services.map((x) => ({
      key: `s-${x._id}`,
      group: 'Services',
      title: x.name,
      sub: x.category,
      to: '/service-health',
      icon: <HeartPulse size={16} className="muted" />,
      right: <StatusBadge status={x.status} />,
    })),
    ...r.alerts.map((x) => ({
      key: `al-${x._id}`,
      group: 'Alerts',
      title: x.title,
      sub: x.status,
      to: `/alerts?focus=${x._id}`,
      icon: <Bell size={16} className="muted" />,
      right: <SeverityPill severity={x.severity as Severity} />,
    })),
  ];
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounce(query.trim(), 250);
  const navigate = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    systemService
      .search(debounced)
      .then((r) => !cancelled && (setResults(r), setActive(0)))
      .catch(() => !cancelled && setResults({ resources: [], accounts: [], services: [], alerts: [] }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // "/" or Ctrl/Cmd+K focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);

  const hits = useMemo(() => (results ? flatten(results) : []), [results]);

  const go = (hit: Hit) => {
    setOpen(false);
    setQuery('');
    input.current?.blur();
    navigate(hit.to);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && hits[active]) {
      go(hits[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
    }
  };

  const showPanel = open && query.trim().length >= 2;
  let lastGroup = '';

  return (
    <div className="global-search" ref={wrap}>
      <Search size={15} className="search-icon" />
      <input
        ref={input}
        className="input"
        placeholder="Search resources, services…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-label="Global search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-autocomplete="list"
      />
      <span className="kbd">Ctrl K</span>
      {showPanel && (
        <div className="popover search-results" id="global-search-results" role="listbox">
          {loading && !results ? (
            <div className="state compact">
              <LoadingSpinner />
            </div>
          ) : !hits.length ? (
            <div className="state compact">
              <Server size={18} />
              <div className="state-text">No matches for “{query.trim()}”.</div>
            </div>
          ) : (
            hits.map((hit, i) => {
              const header = hit.group !== lastGroup ? hit.group : null;
              lastGroup = hit.group;
              return (
                <div key={hit.key}>
                  {header && <div className="search-group-title">{header}</div>}
                  <button className={`search-item ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(hit)} role="option" aria-selected={i === active}>
                    {hit.icon}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="truncate" style={{ display: 'block', fontWeight: 500 }}>
                        {hit.title}
                      </span>
                      <span className="search-item-sub truncate" style={{ display: 'block' }}>
                        {hit.sub}
                      </span>
                    </span>
                    {hit.right}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
