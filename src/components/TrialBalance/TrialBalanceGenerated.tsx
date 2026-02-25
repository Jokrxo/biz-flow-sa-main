import React, { useState, useEffect, useCallback } from 'react';
import { Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { exportToExcel, exportToPDF } from '@/lib/export-utils';
import { supabase } from '@/integrations/supabase/client';
import { TrialBalanceStats } from './TrialBalanceStats';

interface TrialBalanceEntry {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

export const TrialBalanceGenerated: React.FC = () => {
  const [entries, setEntries] = useState<TrialBalanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalDebits: 0,
    totalCredits: 0,
    isBalanced: true,
    difference: 0,
  });
  const { toast } = useToast();

  const generateTrialBalance = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.company_id) return;

      // Get all accounts with their transaction entries
      const { data: accounts, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          account_code,
          account_name,
          account_type,
          transaction_entries (
            debit,
            credit
          )
        `)
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('account_code');

      if (error) throw error;

      // Calculate balances for each account
      const trialBalanceData: TrialBalanceEntry[] = [];
      let totalDebits = 0;
      let totalCredits = 0;

      (accounts || []).forEach((account: any) => {
        const entries = account.transaction_entries || [];
        const debitSum = entries.reduce((sum: number, e: any) => sum + (e.debit || 0), 0);
        const creditSum = entries.reduce((sum: number, e: any) => sum + (e.credit || 0), 0);

        // Only include accounts with activity
        if (debitSum > 0 || creditSum > 0) {
          trialBalanceData.push({
            account_code: account.account_code,
            account_name: account.account_name,
            debit: debitSum,
            credit: creditSum
          });
          totalDebits += debitSum;
          totalCredits += creditSum;
        }
      });

      setEntries(trialBalanceData);
      setSummary({
        totalDebits,
        totalCredits,
        isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
        difference: totalDebits - totalCredits
      });

      toast({
        title: 'Success',
        description: 'Trial balance generated from transactions',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to generate trial balance: ' + error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    generateTrialBalance();
  }, [generateTrialBalance]);

  const handleExportExcel = () => {
    const exportData = entries.map(e => ({
      id: e.account_code,
      account_code: e.account_code,
      account_name: e.account_name,
      debit: e.debit,
      credit: e.credit,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: '',
      company_id: '',
      period_start: null,
      period_end: null
    }));
    exportToExcel(exportData, `trial_balance_${new Date().toISOString().split('T')[0]}`);
    toast({
      title: 'Success',
      description: 'Trial balance exported to Excel',
    });
  };

  const handleExportPDF = () => {
    const exportData = entries.map(e => ({
      id: e.account_code,
      account_code: e.account_code,
      account_name: e.account_name,
      debit: e.debit,
      credit: e.credit,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: '',
      company_id: '',
      period_start: null,
      period_end: null
    }));
    exportToPDF(exportData, `trial_balance_${new Date().toISOString().split('T')[0]}`);
    toast({
      title: 'Success',
      description: 'Trial balance exported to PDF',
    });
  };

  if (loading) {
    return <div className="p-6">Loading trial balance...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Trial Balance</h1>
          <p className="text-muted-foreground">Auto-generated from system transactions</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={generateTrialBalance}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={entries.length === 0}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
          <Button
            variant="outline"
            onClick={handleExportPDF}
            disabled={entries.length === 0}
          >
            <FileText className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      <TrialBalanceStats summary={summary} />

      <Card>
        <CardHeader>
          <CardTitle>Trial Balance Report</CardTitle>
          <CardDescription>
            Generated from all transactions in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No transaction data available</p>
              <p className="text-sm text-muted-foreground mt-2">
                Create transactions to generate a trial balance
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-700 border-b border-slate-800">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="text-xs font-semibold text-white h-9 min-w-[140px] border-r border-slate-600">
                    Account Code
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-white h-9 min-w-[260px] border-r border-slate-600">
                    Account Name
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-white h-9 text-right min-w-[140px] border-l border-slate-600">
                    Debit
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-white h-9 text-right min-w-[140px]">
                    Credit
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono">{entry.account_code}</TableCell>
                    <TableCell>{entry.account_name}</TableCell>
                    <TableCell className="text-right border-l">
                      {entry.debit > 0 ? entry.debit.toFixed(2) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.credit > 0 ? entry.credit.toFixed(2) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={2}>TOTALS</TableCell>
                  <TableCell className="text-right border-l">
                    {summary.totalDebits.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {summary.totalCredits.toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
