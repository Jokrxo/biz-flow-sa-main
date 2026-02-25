import { useEffect, useMemo, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useNavigate } from "react-router-dom";
import { Activity, Link as LinkIcon, ShieldCheck, MessageCircle } from "lucide-react";
import { systemOverview, accountingPrimer, plainEnglishGuide, taxQuickTips } from "./knowledge";

interface FeedItem { id: string; title: string; description: string; ts: string }
interface ChatMsg { role: 'bot' | 'user'; text: string; ts: string }

interface StellaBotModalProps { open: boolean; onOpenChange: (v: boolean) => void }

export const StellaBotModal = ({ open, onOpenChange }: StellaBotModalProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("chat");
  const [companyId, setCompanyId] = useState<string>("");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [metrics, setMetrics] = useState<{ tx: number; inv: number; po: number; bills: number; budgets: number; bank: number; customers: number; items: number }>({ tx: 0, inv: 0, po: 0, bills: 0, budgets: 0, bank: 0, customers: 0, items: 0 });
  const [messages, setMessages] = useState<ChatMsg[]>([{ role: 'bot', text: 'Hi, I am Stella. How can I help you today?', ts: new Date().toISOString() }]);
  const [chatInput, setChatInput] = useState("");
  const [aiEnabled, setAiEnabled] = useState<boolean>(true);
  const [openaiKey, setOpenaiKey] = useState<string>("");
  const [model, setModel] = useState<string>("gpt-4o-mini");
  const whatsappNumber = (import.meta as any).env?.VITE_SUPPORT_WHATSAPP || "";
  const userInitial = useMemo(() => {
    const name = (user as any)?.user_metadata?.full_name || user?.email || "";
    const trimmed = (name || "").trim();
    return trimmed ? trimmed[0].toUpperCase() : "U";
  }, [user]);
  useEffect(() => {
    if (!open) return;
    const hash = window.location.hash;
    if (hash === '#problems_and_diagnostics') setActiveTab('diagnostics');
    const onHashChange = () => {
      if (window.location.hash === '#problems_and_diagnostics') setActiveTab('diagnostics');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => { window.removeEventListener('hashchange', onHashChange); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    const init = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .maybeSingle();
      if (!profile?.company_id) return;
      setCompanyId(profile.company_id);
      await loadMetrics(profile.company_id, ac.signal);
      wireRealtime(profile.company_id);
      const savedEnabled = localStorage.getItem("stella_ai_enabled");
      const savedKey = localStorage.getItem("stella_openai_key");
      const savedModel = localStorage.getItem("stella_openai_model");
      const envKey = (import.meta as any).env?.VITE_OPENAI_API_KEY || "";
      setAiEnabled(savedEnabled ? (savedEnabled === "true") : true);
      const useKey = savedKey || envKey || "";
      setOpenaiKey(useKey);
      if (useKey) localStorage.setItem("stella_openai_key", useKey);
      setModel(savedModel || "gpt-4o-mini");
    };
    init();
    return () => { ac.abort(); };
  }, [open, user?.id]);

  const loadMetrics = useCallback(async (cid: string, signal?: AbortSignal) => {
    try {
      const [tx, inv, po, bills, budgets, bank, customers, items] = await Promise.all([
        supabase.from("transactions").select("id", { count: "exact" }).eq("company_id", cid).limit(1).abortSignal(signal as any),
        supabase.from("invoices").select("id", { count: "exact" }).eq("company_id", cid).limit(1).abortSignal(signal as any),
        supabase.from("purchase_orders").select("id", { count: "exact" }).eq("company_id", cid).limit(1).abortSignal(signal as any),
        supabase.from("bills").select("id", { count: "exact" }).eq("company_id", cid).limit(1).abortSignal(signal as any),
        supabase.from("budgets").select("id", { count: "exact" }).eq("company_id", cid).limit(1).abortSignal(signal as any),
        supabase.from("bank_accounts").select("id", { count: "exact" }).eq("company_id", cid).limit(1).abortSignal(signal as any),
        supabase.from("customers").select("id", { count: "exact" }).eq("company_id", cid).limit(1).abortSignal(signal as any),
        supabase.from("items").select("id", { count: "exact" }).eq("company_id", cid).limit(1).abortSignal(signal as any)
      ]);
      setMetrics({
        tx: (tx.count as number) || 0,
        inv: (inv.count as number) || 0,
        po: (po.count as number) || 0,
        bills: (bills.count as number) || 0,
        budgets: (budgets.count as number) || 0,
        bank: (bank.count as number) || 0,
        customers: (customers.count as number) || 0,
        items: (items.count as number) || 0
      });
    } catch {}
  }, []);

  const wireRealtime = useCallback((cid: string) => {
    const channel = (supabase as any)
      .channel("stella")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `company_id=eq.${cid}` }, (payload: any) => pushFeed("Transaction", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "transaction_entries" }, (payload: any) => pushFeed("Entry", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `company_id=eq.${cid}` }, (payload: any) => pushFeed("Invoice", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "bills", filter: `company_id=eq.${cid}` }, (payload: any) => pushFeed("Bill", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders", filter: `company_id=eq.${cid}` }, (payload: any) => pushFeed("PO", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "budgets", filter: `company_id=eq.${cid}` }, (payload: any) => pushFeed("Budget", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "bank_accounts", filter: `company_id=eq.${cid}` }, (payload: any) => pushFeed("Bank", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, (payload: any) => pushFeed("Item", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `company_id=eq.${cid}` }, (payload: any) => pushFeed("Customer", payload))
      .subscribe();
    return () => { (supabase as any).removeChannel(channel) };
  }, [companyId]);

  const pushFeed = useCallback((kind: string, payload: any) => {
    const row: any = payload?.new || payload?.old || {};
    if (row.company_id && companyId && row.company_id !== companyId) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const title = `${kind} ${payload.eventType || payload.event || "update"}`;
    const description = row.description || row.invoice_number || row.reference_number || row.account_name || row.name || String(row.id || "");
    setFeed(prev => [{ id, title, description, ts: new Date().toISOString() }, ...prev].slice(0, 50));
  }, [companyId]);

  const respond = (q: string) => {
    const lower = q.trim().toLowerCase();
    const isGreeting = ["hi","hello","hey","hy","good morning","good afternoon","good evening"]
      .some(g => lower === g || lower.startsWith(g));

    if (isGreeting) {
      return "Hi, I'm Stella, your Rigel assistant. You can just talk to me in normal English, for example: “how do I see my unpaid invoices?”, “what is my bank balance?”, or “explain VAT in simple terms”.";
    }

    const res: string[] = [];

    if (lower.includes("budget") && lower.includes("actual")) {
      res.push("Budget actuals come from posted entries for that month. Go to Budget, pick the month, then open “Actual vs Budget” to compare plan vs actual.");
    }
    if (lower.includes("unpaid") && lower.includes("invoice")) {
      res.push("To see unpaid invoices, open Sales → Invoices and filter where Status is not paid. That gives you who still owes you money.");
    }
    if (lower.includes("bank") && lower.includes("balance")) {
      res.push("Bank balances update as you capture receipts and payments. Open Bank → Accounts to see each account and reconcile to your statements.");
    }
    if (lower.includes("purchase") || lower.includes("ap")) {
      res.push("For payables (AP), go to Purchase → Bills. There you record supplier bills, see what is unpaid and when it is due.");
    }
    if (lower.includes("cash flow")) {
      res.push("Cash flow has three parts: Operating (day‑to‑day business), Investing (buying and selling assets) and Financing (loans and shares). Positive net cash flow means closing cash is higher than opening cash.");
    }
    if (lower.includes("vat")) {
      res.push("VAT works as Output VAT on sales and Input VAT on purchases. In the app, go to Tax → VAT for totals and VAT201. Example at 15%: Net R100 → VAT R15 → Total R115.");
    }
    if (lower === "tax" || lower.includes("tax")) {
      res.push("For tax, start from accounting profit, then adjust for non‑deductible expenses and tax allowances. The VAT201 is Output VAT minus Input VAT for the period.");
    }
    if (lower.includes("transactions")) {
      res.push("Use the Transactions module to record income and expenses. Filter by date or type, and drill into the ledger entries if you want detail.");
    }
    if (lower.includes("sales")) {
      res.push("Sales lets you create quotes and invoices, track accounts receivable and record customer payments so AR stays up to date.");
    }

    if (res.length === 0) {
      return "I might not understand every question yet, but I can help with Sales, Purchase, Bank, VAT, Budgets and Transactions. Try something like “how do I see unpaid invoices”, “where do I check my bank balance”, or “explain cash flow in simple language”.";
    }

    res.push("In plain English: revenue is money in, expenses are costs, receivables mean customers owe you, payables mean you owe suppliers, and VAT Input is what you claim back while VAT Output is what you pay.");
    return res.join(" ");
  };

  const sendChat = async () => {
    const q = chatInput.trim();
    if (!q) return;
    const now = new Date().toISOString();
    setMessages(prev => [...prev, { role: 'user', text: q, ts: now }]);
    const lower = q.toLowerCase();
    let answer: string | null = null;
    // Quick smart answers with live data where useful
    const wantsDebtors = ["debtors","receivable","receiv","ar"].some(k => lower.includes(k));
    const wantsVat = lower.includes("vat");
    const wantsUnpaidInvoices = lower.includes('unpaid') && lower.includes('invoice');
    if (companyId && (wantsDebtors || wantsVat || wantsUnpaidInvoices)) {
      try {
        if (wantsDebtors) {
          const { data } = await supabase
            .from('invoices')
            .select('total_amount, amount_paid, status')
            .eq('company_id', companyId)
            .in('status', ['sent','approved','posted','partial','unpaid']);
          const outstanding = (data || []).reduce((s: number, r: any) => {
            const total = Number(r.total_amount || 0);
            const paid = Number(r.amount_paid || 0);
            return s + Math.max(0, total - paid);
          }, 0);
          answer = `Debtors (accounts receivable) outstanding: R ${Number(outstanding).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}. Plain-English: customers owe you this amount. To collect: Sales → Invoices → filter unpaid → record receipts.`;
        }
        if (!answer && wantsVat) {
          const { data: tx } = await supabase
            .from('transactions')
            .select('transaction_type, vat_rate, vat_inclusive, total_amount, vat_amount, base_amount, status')
            .eq('company_id', companyId)
            .in('status', ['approved','posted','pending']);
          let out = 0, inn = 0;
          (tx || []).forEach((t: any) => {
            const type = String(t.transaction_type || '').toLowerCase();
            const isIncome = ['income','sales','receipt'].includes(type);
            const isPurchase = ['expense','purchase','bill','product_purchase'].includes(type);
            const rate = Number(t.vat_rate || 0);
            const total = Number(t.total_amount || 0);
            const base = Number(t.base_amount || 0);
            const inclusive = Boolean(t.vat_inclusive);
            let vat = Number(t.vat_amount || 0);
            if (vat === 0 && rate > 0) {
              if (inclusive) {
                const net = base > 0 ? base : total / (1 + rate / 100);
                vat = total - net;
              } else {
                vat = total - (base > 0 ? base : total);
              }
            }
            if (isIncome) out += Math.max(0, vat);
            if (isPurchase) inn += Math.max(0, vat);
          });
          const net = out - inn;
          const pos = net >= 0 ? 'payable' : 'receivable';
          answer = `VAT position: R ${Math.abs(net).toLocaleString('en-ZA', { minimumFractionDigits: 2 })} ${pos}. Plain-English: ${pos === 'payable' ? 'you owe SARS this VAT' : 'SARS owes you a refund'}. Steps: Tax → VAT → prepare VAT201.`;
        }
        if (!answer && wantsUnpaidInvoices) {
          const { count } = await supabase.from('invoices').select('id', { count: 'exact' }).eq('company_id', companyId).neq('status', 'paid').limit(1);
          answer = `Unpaid invoices: ${count || 0}. Steps: Sales → Invoices → filter Status ≠ paid → follow up.`;
        }
      } catch {}
    }
    if (!answer && companyId && !aiEnabled) {
      if (lower.includes('unpaid') && lower.includes('invoice')) {
        const { count } = await supabase.from('invoices').select('id', { count: 'exact' }).eq('company_id', companyId).neq('status', 'paid').limit(1);
        answer = `Unpaid invoices: ${count || 0}`;
      } else if (lower.includes('recent') && lower.includes('transaction')) {
        const { data } = await supabase.from('transactions').select('description, transaction_date, total_amount').eq('company_id', companyId).order('transaction_date', { ascending: false }).limit(5);
        const list = (data || []).map((r: any) => `${r.transaction_date} • ${r.description || ''} • R ${(Number(r.total_amount || 0)).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`).join('\n');
        answer = list ? `Recent transactions:\n${list}` : 'No recent transactions found';
      } else if (lower.includes('unpaid') && lower.includes('bill')) {
        const { count } = await supabase.from('bills').select('id', { count: 'exact' }).eq('company_id', companyId).neq('status', 'paid').limit(1);
        answer = `Unpaid bills: ${count || 0}`;
      }
    }
    if (!answer && aiEnabled && openaiKey) {
      try {
        const context = [
          `CompanyId: ${companyId}`,
          `Metrics: tx=${metrics.tx}, inv=${metrics.inv}, po=${metrics.po}, bills=${metrics.bills}, budgets=${metrics.budgets}, bank=${metrics.bank}, customers=${metrics.customers}, items=${metrics.items}`
        ].join(" | ");
        const sys = [
          "You are Stella, an assistant for a finance manager web app.",
          "Answer actionable accounting and tax questions with concise, accurate guidance.",
          "If the user mentions modules (Transactions, Sales, Purchase, Bank, Budget, VAT), explain where in the app to perform the task and add practical steps.",
          "Always include a short Plain-English explanation suitable for non-accountants.",
          "When possible, provide brief calculations and IFRS/US GAAP classification notes.",
          `Context: ${context}`,
          systemOverview,
          accountingPrimer,
          plainEnglishGuide,
          taxQuickTips
        ].join("\n\n");
        const history = messages.map(m => ({ role: m.role === 'bot' ? 'assistant' as const : 'user' as const, content: m.text }));
        const body = { model, messages: [{ role: 'system', content: sys }, ...history, { role: 'user', content: q }], temperature: 0.3 };
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify(body)
        });
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content || null;
        answer = text || null;
      } catch {}
    }
    if (!answer) answer = respond(q);
    setMessages(prev => [...prev, { role: 'bot', text: answer!, ts: new Date().toISOString() }]);
    setChatInput("");
  };

  const metricBadges = useMemo(
    () => [
      { label: "Transactions", value: metrics.tx },
      { label: "Invoices", value: metrics.inv },
      { label: "Purchase Orders", value: metrics.po },
      { label: "Bills", value: metrics.bills },
      { label: "Budgets", value: metrics.budgets },
      { label: "Bank Accounts", value: metrics.bank },
      { label: "Customers", value: metrics.customers },
      { label: "Items", value: metrics.items }
    ].filter(m => m.value > 0),
    [metrics]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-w-sm p-0 overflow-hidden rounded-xl">
        <div className="flex flex-col h-[460px] bg-white">
          <DialogHeader className="px-4 pt-3 pb-2 border-b border-slate-200 bg-white">
            <DialogTitle className="flex items-center justify-between gap-3 text-sm text-slate-900">
              <span className="inline-flex items-center gap-2">
                <img src="/logo.png" alt="Rigel Business" className="h-6 w-auto rounded-sm shadow-sm" />
                <span>Stella Assistant</span>
              </span>
              <span className="text-[11px] rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                Online
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex flex-col bg-slate-50">
            {metricBadges.length > 0 && (
              <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
                <div className="flex flex-wrap gap-1.5">
                  {metricBadges.map(m => (
                    <Badge key={m.label} variant="secondary" className="bg-white text-[10px] font-normal border border-slate-200">
                      {m.label}: {m.value}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="mx-3 mt-2 mb-1 grid grid-cols-1 bg-white border border-slate-200 rounded-md">
                <TabsTrigger value="chat" className="text-xs py-1">Chat</TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="flex-1 flex flex-col px-3 pb-3 pt-1">
                <div className="flex-1 max-h-[260px] overflow-y-auto space-y-2 py-1 pr-1">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.role === 'bot' ? 'justify-start' : 'justify-end'}`}
                    >
                      {m.role === 'bot' && (
                        <div className="mr-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 border border-emerald-200">
                          <img src="/logo.png" alt="Rigel Business" className="h-5 w-5 rounded-sm" />
                        </div>
                      )}
                      <div
                        className={`max-w-[72%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm border ${
                          m.role === 'bot'
                            ? 'bg-emerald-50 text-slate-900 border-emerald-100'
                            : 'bg-white text-slate-900 border-slate-200'
                        }`}
                      >
                        {m.text}
                      </div>
                      {m.role === 'user' && (
                        <div className="ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 border border-slate-300 text-[11px] font-semibold text-slate-700">
                          {userInitial}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 border-t border-slate-200 pt-2 bg-white">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Ask your question here…"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                      className="h-9 text-sm"
                    />
                    <Button onClick={sendChat} size="sm" className="h-9 px-3 text-sm">
                      Send
                    </Button>
                  </div>
                  {whatsappNumber && (
                    <div className="mt-2 flex items-center justify-between rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] text-slate-800">
                      <span>Prefer WhatsApp to talk to a human?</span>
                      <a
                        href={`https://wa.me/${whatsappNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                      >
                        <MessageCircle className="h-3 w-3" />
                        <span>Chat on WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              </TabsContent>
            <TabsContent value="feed">
              <div className="space-y-2 max-h-64 overflow-y-auto px-3 pb-3 pt-1 hidden">
                {feed.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No activity yet</div>
                ) : feed.map(item => (
                  <Card key={item.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <Activity className="h-4 w-4" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{item.title}</div>
                        <div className="text-xs text-muted-foreground">{item.description}</div>
                      </div>
                      <div className="text-[10px] text-muted-foreground">{new Date(item.ts).toLocaleString()}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="diagnostics" className="px-3 pb-3 pt-2 hidden">
              <div id="problems_and_diagnostics" className="space-y-2">
                <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><span className="text-sm">Company-scoped realtime enabled</span></div>
                <div className="text-xs text-muted-foreground">Live updates bound to your company only.</div>
              <div className="mt-4 p-3 border rounded-md space-y-3">
                <div className="flex items-center gap-2">
                  <Switch checked={aiEnabled} onCheckedChange={(v) => { setAiEnabled(v); localStorage.setItem('stella_ai_enabled', v ? 'true' : 'false'); }} />
                  <span className="text-sm">Enable OpenAI</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Input type="password" placeholder="OpenAI API Key" value={openaiKey} onChange={(e) => { setOpenaiKey(e.target.value); localStorage.setItem('stella_openai_key', e.target.value); }} />
                  </div>
                  <div>
                    <Select value={model} onValueChange={(v) => { setModel(v); localStorage.setItem('stella_openai_model', v); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                        <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                        <SelectItem value="gpt-3.5-turbo">gpt-3.5-turbo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Your key is stored locally. The assistant uses system context and accounting rules to answer.
                </div>
              </div>
            </div>
          </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
