import { useState, useEffect, useCallback, useRef } from 'react';

interface CacheData<T> {
  data: T;
  timestamp: number;
}

interface UseTablePersistenceOptions {
  ttl?: number; // Time to live in milliseconds
  enabled?: boolean;
}

export function useTablePersistence<T>(
  key: string,
  fetcher: () => Promise<T>,
  initialState: T,
  options: UseTablePersistenceOptions = {}
) {
  const { ttl = 5 * 60 * 1000, enabled = true } = options; // Default 5 minutes
  const [data, setData] = useState<T>(initialState);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const mounted = useRef(false);
  const activeKey = useRef(key);
  const [prevKey, setPrevKey] = useState(key);

  // Update active key whenever key changes
  useEffect(() => {
    activeKey.current = key;
  }, [key]);

  // Derived state: Reset immediately if key changes (Handled via useEffect to avoid render interrupts)
  useEffect(() => {
    if (key !== prevKey) {
      setPrevKey(key);
      setData(initialState);
      setLoading(true);
      setLastUpdated(null);
    }
  }, [key, prevKey, initialState]);

  // Helper to safely write to localStorage with quota handling
  const safeSetItem = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e: any) {
      if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
        // Simple eviction: clear oldest items starting with 'table_cache_'
        try {
          const keys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('table_cache_')) {
              keys.push(k);
            }
          }
          // Sort keys roughly? We don't have access times easily unless we store them.
          // For now, just clear 20% of random cache keys to free space
          const countToRemove = Math.max(1, Math.floor(keys.length * 0.2));
          for (let i = 0; i < countToRemove; i++) {
            localStorage.removeItem(keys[i]);
          }
          // Retry set
          localStorage.setItem(key, value);
        } catch (retryError) {
          console.warn('Failed to free space for cache', retryError);
        }
      }
    }
  };

  // Load from cache on mount
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    
    const cached = localStorage.getItem(`table_cache_${key}`);
    if (cached) {
      try {
        const parsed: CacheData<T> = JSON.parse(cached);
        const now = Date.now();
        const isExpired = now - parsed.timestamp > ttl;
        
        if (!isExpired) {
          setData(parsed.data);
          setLastUpdated(parsed.timestamp);
          setLoading(false);
        } else {
          setData(parsed.data);
          setLastUpdated(parsed.timestamp);
          setLoading(false);
        }
      } catch (e) {
        console.error(`Failed to parse cache for ${key}`, e);
        setData(initialState);
        setLastUpdated(null);
        setLoading(true);
      }
    } else {
      setData(initialState);
      setLastUpdated(null);
      setLoading(true);
    }
    mounted.current = true;
  }, [key, enabled, ttl]);

  // Background sync function
  const refresh = useCallback(async (force = false) => {
    if (!enabled) return;

    // Check TTL if not forced
    if (!force && lastUpdated) {
      const now = Date.now();
      if (now - lastUpdated < ttl) {
        // Cache is fresh, skip fetch
        return;
      }
    }

    setIsSyncing(true);
    // If we don't have data yet, we are loading
    if (!lastUpdated && loading) {
       // keep loading true
    }

    try {
      const newData = await fetcher();
      
      // RACE CONDITION FIX: Verify that the key hasn't changed during the fetch
      if (activeKey.current !== key) {
        console.log(`Aborted stale fetch for ${key} (current: ${activeKey.current})`);
        return;
      }

      setData(newData);
      const timestamp = Date.now();
      setLastUpdated(timestamp);
      safeSetItem(`table_cache_${key}`, JSON.stringify({
        data: newData,
        timestamp
      }));
    } catch (error) {
      if (activeKey.current === key) {
         console.error(`Background sync failed for ${key}`, error);
      }
    } finally {
      if (activeKey.current === key) {
        setIsSyncing(false);
        setLoading(false);
      }
    }
  }, [fetcher, key, enabled, lastUpdated, loading]);

  // Trigger sync on mount or when key changes
  useEffect(() => {
    if (!enabled) return;
    
    // Check if cache is stale
    const isStale = !lastUpdated || (Date.now() - lastUpdated > ttl);
    
    if (isStale) {
      refresh();
    }
  }, [refresh, lastUpdated, ttl, enabled]);

  return { 
    data, 
    loading, 
    isSyncing, 
    refresh, 
    setData,
    lastUpdated 
  };
}

export function usePersistedState<T>(key: string, initialState: T) {
  // Hardening: usePersistedState should also use safeSetItem logic
  // But we can't easily access safeSetItem here without duplication or extraction
  // For now, duplicate basic try-catch protection
  
  const [state, setState] = useState<T>(() => {
    try {
      const cached = localStorage.getItem(`table_state_${key}`);
      return cached ? JSON.parse(cached) : initialState;
    } catch (e) {
      return initialState;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`table_state_${key}`, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state persistence', e);
    }
  }, [key, state]);

  return [state, setState] as const;
}
