import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface FetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  lastUpdated: Date | null;
  reload: () => Promise<void>;
  setData: (updater: (prev: T | null) => T | null) => void;
}

interface Options {
  /** Poll interval in ms (0 = off). Polling pauses while the tab is hidden. */
  refreshInterval?: number;
  enabled?: boolean;
}

/**
 * Data-fetching hook with loading / error / refreshing states, stale-response protection
 * and optional background polling.
 */
export function useFetch<T>(fetcher: () => Promise<T>, deps: DependencyList, options: Options = {}): FetchState<T> {
  const { refreshInterval = 0, enabled = true } = options;
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestId = useRef(0);
  const hasData = useRef(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async (background: boolean) => {
    const id = ++requestId.current;
    if (background) setRefreshing(true);
    else if (!hasData.current) setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (id !== requestId.current) return;
      setDataState(result);
      hasData.current = true;
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    hasData.current = false;
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  useEffect(() => {
    if (!enabled || !refreshInterval) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void run(true);
    }, refreshInterval);
    return () => window.clearInterval(timer);
  }, [enabled, refreshInterval, run]);

  const reload = useCallback(() => run(true), [run]);
  const setData = useCallback((updater: (prev: T | null) => T | null) => setDataState((prev) => updater(prev)), []);

  return { data, error, loading, refreshing, lastUpdated, reload, setData };
}
