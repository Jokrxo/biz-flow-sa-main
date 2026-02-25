export type DashboardCachePayload = {
  metrics: any;
  recentTransactions: any[];
  chartData: any[];
  netProfitTrend: any[];
  incomeBreakdown?: any[];
  expenseBreakdown?: any[];
  arTop10?: any[];
  apTop10?: any[];
  arDonut?: any[];
  apDonut?: any[];
};

type DashboardCacheEntry = {
  companyId: string;
  fetchedAt: number;
  payload: DashboardCachePayload;
};

const CACHE_PREFIX = "rigel_dashboard_cache_v1:";
const INVALIDATE_PREFIX = "rigel_dashboard_invalidate_v1:";

const memoryCache = new Map<string, DashboardCacheEntry>();
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((l) => l());
};

const storageKeyForCache = (cacheKey: string) => `${CACHE_PREFIX}${cacheKey}`;
const storageKeyForInvalidate = (companyId: string) => `${INVALIDATE_PREFIX}${companyId}`;

const readCacheEntry = (cacheKey: string): DashboardCacheEntry | null => {
  const inMem = memoryCache.get(cacheKey);
  if (inMem) return inMem;

  try {
    const raw = localStorage.getItem(storageKeyForCache(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.companyId || !parsed?.fetchedAt || !parsed?.payload) return null;
    const entry: DashboardCacheEntry = {
      companyId: String(parsed.companyId),
      fetchedAt: Number(parsed.fetchedAt),
      payload: parsed.payload as DashboardCachePayload,
    };
    memoryCache.set(cacheKey, entry);
    return entry;
  } catch {
    return null;
  }
};

const writeCacheEntry = (cacheKey: string, entry: DashboardCacheEntry) => {
  memoryCache.set(cacheKey, entry);
  try {
    localStorage.setItem(storageKeyForCache(cacheKey), JSON.stringify(entry));
  } catch {}
  notify();
};

export const dashboardCache = {
  get: (cacheKey: string) => readCacheEntry(cacheKey),
  set: (cacheKey: string, companyId: string, payload: DashboardCachePayload) => {
    writeCacheEntry(cacheKey, { companyId, fetchedAt: Date.now(), payload });
  },
  getInvalidatedAt: (companyId: string): number => {
    try {
      const raw = localStorage.getItem(storageKeyForInvalidate(companyId));
      return raw ? Number(raw) : 0;
    } catch {
      return 0;
    }
  },
  invalidateCompany: (companyId: string) => {
    const ts = Date.now();
    try {
      localStorage.setItem(storageKeyForInvalidate(companyId), String(ts));
    } catch {}
    notify();
  },
  isStale: (cacheKey: string, companyId: string, ttlMs: number) => {
    const entry = readCacheEntry(cacheKey);
    if (!entry) return true;
    if (entry.companyId !== companyId) return true;
    const invalidatedAt = dashboardCache.getInvalidatedAt(companyId);
    if (invalidatedAt > entry.fetchedAt) return true;
    if (ttlMs > 0 && Date.now() - entry.fetchedAt > ttlMs) return true;
    return false;
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const emitDashboardCacheInvalidation = (companyId: string) => {
  dashboardCache.invalidateCompany(companyId);
  try {
    window.dispatchEvent(new CustomEvent("rigel-dashboard-cache-invalidated", { detail: { companyId } }));
  } catch {}
};

