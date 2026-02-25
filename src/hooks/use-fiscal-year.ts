import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";

export const useFiscalYear = () => {
  const { user } = useAuth();
  const [fiscalStartMonth, setFiscalStartMonth] = useState<number>(1);
  const [defaultFiscalYear, setDefaultFiscalYear] = useState<number | null>(null);
  const [lockFiscalYear, setLockFiscalYear] = useState<boolean>(false);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<number>(new Date().getFullYear());
  const [closedDate, setClosedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel: any;

    const fetchFiscalYearSettings = async () => {
      if (!user) return;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        const companyId = profile?.company_id;
        if (companyId) {
          const { data: app } = await supabase
            .from('app_settings')
            .select('fiscal_year_start, fiscal_default_year, fiscal_lock_year, financial_year_closed_date')
            .eq('company_id', companyId)
            .maybeSingle();
          
          const m = Number(app?.fiscal_year_start || 1);
          setFiscalStartMonth(m >= 1 && m <= 12 ? m : 1);
          const defY = app?.fiscal_default_year ? Number(app.fiscal_default_year) : null;
          const locked = !!app?.fiscal_lock_year;
          setDefaultFiscalYear(defY);
          setLockFiscalYear(locked);
          setClosedDate(app?.financial_year_closed_date ? new Date(app.financial_year_closed_date) : null);
          const initialFY = locked && defY ? defY : getCurrentFiscalYearFromMonth(m >= 1 && m <= 12 ? m : 1);
          setSelectedFiscalYear(initialFY);

          // Subscribe to changes
          channel = supabase.channel('fiscal-settings-changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_settings', filter: `company_id=eq.${companyId}` }, (payload: any) => {
              const newStart = Number(payload.new.fiscal_year_start || 1);
              const defYNew = payload.new.fiscal_default_year ? Number(payload.new.fiscal_default_year) : null;
              const lockedNew = !!payload.new.fiscal_lock_year;
              setFiscalStartMonth(newStart >= 1 && newStart <= 12 ? newStart : 1);
              setDefaultFiscalYear(defYNew);
              setLockFiscalYear(lockedNew);
              setClosedDate(payload.new.financial_year_closed_date ? new Date(payload.new.financial_year_closed_date) : null);
              const fy = lockedNew && defYNew ? defYNew : getCurrentFiscalYearFromMonth(newStart >= 1 && newStart <= 12 ? newStart : 1);
              setSelectedFiscalYear(fy);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings', filter: `company_id=eq.${companyId}` }, (payload: any) => {
              const newStart = Number(payload.new.fiscal_year_start || 1);
              const defYNew = payload.new.fiscal_default_year ? Number(payload.new.fiscal_default_year) : null;
              const lockedNew = !!payload.new.fiscal_lock_year;
              setFiscalStartMonth(newStart >= 1 && newStart <= 12 ? newStart : 1);
              setDefaultFiscalYear(defYNew);
              setLockFiscalYear(lockedNew);
              setClosedDate(payload.new.financial_year_closed_date ? new Date(payload.new.financial_year_closed_date) : null);
              const fy = lockedNew && defYNew ? defYNew : getCurrentFiscalYearFromMonth(newStart >= 1 && newStart <= 12 ? newStart : 1);
              setSelectedFiscalYear(fy);
            })
            .subscribe();
        }
      } catch (error) {
        console.error("Failed to fetch fiscal year settings", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFiscalYearSettings();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user]);

  /** Returns the start and end dates for a given fiscal year reference. */
  const getFiscalYearDates = (year: number) => {
    const start = new Date(year, fiscalStartMonth - 1, 1);
    // End date is 12 months later, minus 1 day
    const end = new Date(year + 1, fiscalStartMonth - 1, 0); 
    
    // If fiscal year starts in Jan, it ends in Dec of the SAME year.
    // The logic above: year + 1, month (start-1), day 0 -> Last day of previous month.
    // Example: Start Jan (0). Start: 2024-01-01. End: 2025-01-00 -> 2024-12-31. Correct.
    // Example: Start Mar (2). Start: 2024-03-01. End: 2025-03-00 -> 2025-02-28. Correct.
    
    return {
      startDate: start,
      endDate: end,
      startStr: start.toISOString().split('T')[0],
      endStr: end.toISOString().split('T')[0]
    };
  };

  /** Determines the current fiscal year based on today's date and start month. */
  const getCurrentFiscalYearFromMonth = (startMonth: number) => {
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentYear = today.getFullYear();

    // If today is before the fiscal start month, we are in the fiscal year that started the PREVIOUS calendar year.
    // Example: Fiscal starts March (3). Today is Feb 2025.
    // This belongs to the fiscal year starting March 2024.
    if (currentMonth < startMonth) {
      return currentYear - 1;
    }
    
    // Otherwise, we are in the fiscal year that started THIS calendar year.
    // Example: Fiscal starts March (3). Today is April 2025.
    // This belongs to the fiscal year starting March 2025.
    return currentYear;
  };

  const getCurrentFiscalYear = () => getCurrentFiscalYearFromMonth(fiscalStartMonth);

  /**
   * Calculates the actual calendar year for a given month within a fiscal year.
   * @param fiscalYear The fiscal year (e.g., 2024 for the year starting June 2024)
   * @param month The calendar month number (1-12)
   */
  const getCalendarYearForFiscalPeriod = (fiscalYear: number, month: number) => {
    // If the month is before the fiscal start month, it belongs to the NEXT calendar year.
    // Example: Start June (6). FY 2024.
    // Month June (6) -> 2024.
    // Month Jan (1) -> 2025.
    if (month < fiscalStartMonth) {
      return fiscalYear + 1;
    }
    return fiscalYear;
  };

  /**
   * Checks if a given date is within a locked period.
   * @param date Date object or string
   */
  const isDateLocked = (date: Date | string): boolean => {
    // Normalize input date to YYYY-MM-DD
    const d = new Date(date);
    const dStr = d.toISOString().split('T')[0];
    
    // 1. Check against Manual Closed Date
    if (closedDate) {
      const cStr = closedDate.toISOString().split('T')[0];
      if (dStr <= cStr) return true;
    }

    // 2. Check against Auto-Calculated Previous Fiscal Year
    // Current logic: Lock anything BEFORE the start of the CURRENT fiscal year.
    const currentFY = getCurrentFiscalYearFromMonth(fiscalStartMonth);
    const { startDate: currentFYStart } = getFiscalYearDates(currentFY);
    const currentFYStartStr = currentFYStart.toISOString().split('T')[0];

    // If date is strictly BEFORE the current FY start, it is locked.
    // Example: Current FY starts 2025-03-01.
    // Date 2025-02-28 -> Locked.
    // Date 2025-03-01 -> Open.
    if (dStr < currentFYStartStr) {
      return true;
    }

    return false;
  };

  return {
    fiscalStartMonth,
    defaultFiscalYear,
    lockFiscalYear,
    selectedFiscalYear,
    loading,
    closedDate,
    getFiscalYearDates,
    getCurrentFiscalYear,
    getCalendarYearForFiscalPeriod,
    setSelectedFiscalYear,
    isDateLocked
  };
};

export const fiscalDatesFrom = (startMonth: number, year: number) => {
  const start = new Date(year, startMonth - 1, 1);
  const end = new Date(year + 1, startMonth - 1, 0);
  return {
    startDate: start,
    endDate: end,
    startStr: start.toISOString().split('T')[0],
    endStr: end.toISOString().split('T')[0]
  };
};

export const calendarYearForFiscalPeriodFrom = (startMonth: number, fiscalYear: number, month: number) => {
  if (month < startMonth) {
    return fiscalYear + 1;
  }
  return fiscalYear;
};
