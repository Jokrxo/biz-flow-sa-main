ALTER TABLE bank_accounts
ADD COLUMN IF NOT EXISTS mono_account_id TEXT,
ADD COLUMN IF NOT EXISTS auth_method TEXT,
ADD COLUMN IF NOT EXISTS data_status TEXT,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_mono_account_id ON bank_accounts(mono_account_id);
