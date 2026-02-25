export interface TrialBalance {
  id: string;
  user_id: string;
  account_name: string;
  account_code: string;
  debit: number;
  credit: number;
  created_at: string;
  updated_at: string;
}

export interface TrialBalanceCreate {
  account_name: string;
  account_code: string;
  debit?: number;
  credit?: number;
}

export interface TrialBalanceUpdate {
  account_name?: string;
  account_code?: string;
  debit?: number;
  credit?: number;
}