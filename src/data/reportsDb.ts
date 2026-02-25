import Dexie, { Table } from "dexie";

export interface TrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: string;
  total_debits: number;
  total_credits: number;
  balance: number;
}

export interface ReportSnapshot {
  company_id: string;
  report_type: string; // e.g. 'balance-sheet' | 'income-statement' | 'cash-flow' | 'comparative' | 'monthly-afs'
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
  computed_at: number;  // epoch millis
  data: any;            // computed result for fast rendering
}

class ReportsDB extends Dexie {
  trialBalancePeriod!: Table<{ company_id: string; period_start: string; period_end: string; rows: TrialBalanceRow[]; saved_at: number }, [string, string, string]>;
  trialBalanceAsOf!: Table<{ company_id: string; as_of: string; rows: TrialBalanceRow[]; saved_at: number }, [string, string]>;
  reportSnapshots!: Table<ReportSnapshot, [string, string, string, string]>;

  constructor() {
    super("rigel_reports_db");
    
    // Version 1 (legacy)
    this.version(1).stores({
      trialBalancePeriod: "++id, company_id, period_start, period_end",
      trialBalanceAsOf: "++id, company_id, as_of",
      reportSnapshots: "++id, company_id, report_type, period_start, period_end, computed_at",
    });

    // Version 2: Drop tables to allow PK change
    this.version(2).stores({
      trialBalancePeriod: null,
      trialBalanceAsOf: null,
      reportSnapshots: null
    });

    // Version 3: Use compound primary keys for automatic upserts and uniqueness
    this.version(3).stores({
      trialBalancePeriod: "[company_id+period_start+period_end]",
      trialBalanceAsOf: "[company_id+as_of]",
      reportSnapshots: "[company_id+report_type+period_start+period_end]",
    });
  }
}

export const reportsDB = new ReportsDB();

export async function saveTrialBalancePeriod(companyId: string, start: string, end: string, rows: TrialBalanceRow[]) {
  await reportsDB.trialBalancePeriod.put({ 
    company_id: companyId, 
    period_start: start, 
    period_end: end, 
    rows, 
    saved_at: Date.now() 
  });
}

export async function loadTrialBalancePeriod(companyId: string, start: string, end: string) {
  const entry = await reportsDB.trialBalancePeriod.get([companyId, start, end]);
  return entry?.rows || null;
}

export async function saveTrialBalanceAsOf(companyId: string, asOf: string, rows: TrialBalanceRow[]) {
  await reportsDB.trialBalanceAsOf.put({ 
    company_id: companyId, 
    as_of: asOf, 
    rows, 
    saved_at: Date.now() 
  });
}

export async function loadTrialBalanceAsOf(companyId: string, asOf: string) {
  const entry = await reportsDB.trialBalanceAsOf.get([companyId, asOf]);
  return entry?.rows || null;
}

export async function saveReportSnapshot(s: ReportSnapshot) {
  await reportsDB.reportSnapshots.put({ ...s, computed_at: Date.now() });
}

export async function loadReportSnapshot(companyId: string, type: string, start: string, end: string) {
  const entry = await reportsDB.reportSnapshots.get([companyId, type, start, end]);
  return entry || null;
}
