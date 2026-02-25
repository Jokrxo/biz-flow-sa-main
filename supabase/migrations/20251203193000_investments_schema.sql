-- Investments schema
CREATE TABLE IF NOT EXISTS public.investment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  broker_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.investment_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.investment_accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  avg_cost NUMERIC NOT NULL DEFAULT 0,
  current_price NUMERIC,
  market_value NUMERIC,
  unrealized_gain NUMERIC,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.investment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.investment_accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('buy','sell','dividend','interest','fee','transfer')),
  trade_date DATE NOT NULL,
  settle_date DATE,
  symbol TEXT,
  quantity NUMERIC,
  price NUMERIC,
  total_amount NUMERIC NOT NULL,
  currency TEXT,
  fx_rate NUMERIC,
  fees NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prices_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  date DATE NOT NULL,
  close_price NUMERIC NOT NULL,
  currency TEXT DEFAULT 'ZAR'
);

CREATE INDEX IF NOT EXISTS idx_investment_accounts_company ON public.investment_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_investment_positions_account ON public.investment_positions(account_id);
CREATE INDEX IF NOT EXISTS idx_investment_transactions_account ON public.investment_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_prices_history_symbol_date ON public.prices_history(symbol, date);

ALTER TABLE public.investment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prices_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company can read investment_accounts" ON public.investment_accounts FOR SELECT USING (company_id = get_user_company(auth.uid()));
CREATE POLICY "company can manage investment_accounts" ON public.investment_accounts FOR ALL USING (company_id = get_user_company(auth.uid())) WITH CHECK (company_id = get_user_company(auth.uid()));

CREATE POLICY "company can read positions" ON public.investment_positions FOR SELECT USING (
  (SELECT company_id FROM public.investment_accounts ia WHERE ia.id = investment_positions.account_id) = get_user_company(auth.uid())
);
CREATE POLICY "company can manage positions" ON public.investment_positions FOR ALL USING (
  (SELECT company_id FROM public.investment_accounts ia WHERE ia.id = investment_positions.account_id) = get_user_company(auth.uid())
) WITH CHECK (
  (SELECT company_id FROM public.investment_accounts ia WHERE ia.id = investment_positions.account_id) = get_user_company(auth.uid())
);

CREATE POLICY "company can read transactions" ON public.investment_transactions FOR SELECT USING (
  (SELECT company_id FROM public.investment_accounts ia WHERE ia.id = investment_transactions.account_id) = get_user_company(auth.uid())
);
CREATE POLICY "company can manage transactions" ON public.investment_transactions FOR ALL USING (
  (SELECT company_id FROM public.investment_accounts ia WHERE ia.id = investment_transactions.account_id) = get_user_company(auth.uid())
) WITH CHECK (
  (SELECT company_id FROM public.investment_accounts ia WHERE ia.id = investment_transactions.account_id) = get_user_company(auth.uid())
);

CREATE POLICY "company can read prices_history" ON public.prices_history FOR SELECT USING (true);
CREATE POLICY "company can manage prices_history" ON public.prices_history FOR ALL USING (true) WITH CHECK (true);

-- Trigger to recalc positions on transaction insert
CREATE OR REPLACE FUNCTION public.recalc_position_after_tx()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type IN ('buy','sell') THEN
    UPDATE public.investment_positions p
    SET quantity = COALESCE(p.quantity,0) + CASE WHEN NEW.type='buy' THEN COALESCE(NEW.quantity,0) ELSE -COALESCE(NEW.quantity,0) END,
        avg_cost = CASE WHEN NEW.type='buy' THEN COALESCE(((COALESCE(p.quantity,0) * COALESCE(p.avg_cost,0)) + COALESCE(NEW.total_amount,0)) / NULLIF((COALESCE(p.quantity,0) + COALESCE(NEW.quantity,0)),0), COALESCE(p.avg_cost,0)) ELSE COALESCE(p.avg_cost,0) END,
        market_value = COALESCE(p.quantity,0) * COALESCE(p.current_price, COALESCE(p.avg_cost,0)),
        unrealized_gain = COALESCE(p.market_value,0) - (COALESCE(p.quantity,0) * COALESCE(p.avg_cost,0)),
        updated_at = NOW()
    WHERE p.account_id = NEW.account_id AND p.symbol = NEW.symbol;
    IF NOT FOUND AND NEW.type='buy' THEN
      INSERT INTO public.investment_positions(account_id, symbol, instrument_type, quantity, avg_cost, market_value, unrealized_gain)
      VALUES(NEW.account_id, COALESCE(NEW.symbol,''), 'equity', COALESCE(NEW.quantity,0), COALESCE(NEW.price,0), COALESCE(NEW.total_amount,0), 0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recalc_position_after_tx ON public.investment_transactions;
CREATE TRIGGER trg_recalc_position_after_tx AFTER INSERT ON public.investment_transactions FOR EACH ROW EXECUTE FUNCTION public.recalc_position_after_tx();
