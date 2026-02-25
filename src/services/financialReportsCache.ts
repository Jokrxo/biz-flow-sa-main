
interface CacheEntry {
  data: any;
  timestamp: number;
}

interface FinancialCache {
  [key: string]: CacheEntry;
}

// Global in-memory cache
// This persists as long as the application tab is open (SPA navigation)
const globalCache: FinancialCache = {};
let lastCompanyId: string | null = null;

// 5 minutes cache validity for "fresh" data, but we always return cached data first
// regardless of age to ensure "instant" loading, then background refresh.
const CACHE_TTL = 5 * 60 * 1000; 

export const financialReportsCache = {
  get: (companyId: string, reportType: string, start: string, end: string, forceRefresh: boolean = false) => {
    // If forceRefresh is true, always return null to bypass cache
    if (forceRefresh) return null;
    const key = `${companyId}:${reportType}:${start}:${end}`;
    const entry = globalCache[key];
    // Check if cache is stale (older than TTL)
    if (entry && Date.now() - entry.timestamp > CACHE_TTL) {
      // Cache is stale, remove it and return null
      delete globalCache[key];
      return null;
    }
    return entry?.data || null;
  },

  set: (companyId: string, reportType: string, start: string, end: string, data: any) => {
    const key = `${companyId}:${reportType}:${start}:${end}`;
    globalCache[key] = {
      data,
      timestamp: Date.now()
    };
    lastCompanyId = companyId;
  },

  getLastCompanyId: () => lastCompanyId,

  clear: () => {
    Object.keys(globalCache).forEach(key => delete globalCache[key]);
    lastCompanyId = null;
  },
  
  has: (companyId: string, reportType: string, start: string, end: string) => {
    const key = `${companyId}:${reportType}:${start}:${end}`;
    return !!globalCache[key];
  },

  // View Settings Cache (Separate from Data Cache)
  saveViewSettings: (settings: {
    companyId?: string | null;
    activeTab?: string;
    periodMode?: 'monthly' | 'annual';
    selectedMonth?: string;
    selectedYear?: number;
    comparativeYearA?: number;
    comparativeYearB?: number;
    periodStart?: string | null;
    periodEnd?: string | null;
  }) => {
    globalCache['view_settings'] = {
      data: settings,
      timestamp: Date.now()
    };
    if (settings.companyId) lastCompanyId = settings.companyId;
  },

  getViewSettings: () => {
    return globalCache['view_settings']?.data || null;
  }
};
