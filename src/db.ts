import Dexie, { Table } from 'dexie';

export interface DashboardCacheEntry {
  key: string;
  companyId: string;
  timestamp: number;
  payload: any; // Storing the full DashboardData object
}

export class RigelDB extends Dexie {
  dashboardCache!: Table<DashboardCacheEntry>;

  constructor() {
    super('RigelDB');
    
    this.version(1).stores({
      dashboardCache: 'key, companyId, timestamp' // Primary key and indexes
    });
  }
}

export const db = new RigelDB();
