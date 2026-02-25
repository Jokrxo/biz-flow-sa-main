import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Download, FileSpreadsheet, FileText, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { trialBalanceApi } from '@/lib/trial-balance-api';
import { exportToExcel, exportToPDF } from '@/lib/export-utils';
import type { TrialBalance } from '@/types/trial-balance';
import { TrialBalanceForm } from './TrialBalanceForm';
import { TrialBalanceStats } from './TrialBalanceStats';

export const TrialBalanceManager: React.FC = () => {
  const [entries, setEntries] = useState<TrialBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TrialBalance | null>(null);
  const [summary, setSummary] = useState({
    totalDebits: 0,
    totalCredits: 0,
    isBalanced: true,
    difference: 0,
  });
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const summaryData = await trialBalanceApi.getSummary();
      setEntries(summaryData.entries);
      setSummary({
        totalDebits: summaryData.totalDebits,
        totalCredits: summaryData.totalCredits,
        isBalanced: summaryData.isBalanced,
        difference: summaryData.difference,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load trial balance data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (data: any) => {
    try {
      await trialBalanceApi.create(data);
      await loadData();
      setShowForm(false);
      toast({
        title: 'Success',
        description: 'Trial balance entry created successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create entry',
        variant: 'destructive',
      });
    }
  };

  const handleUpdate = async (data: any) => {
    if (!editingEntry) return;
    
    try {
      await trialBalanceApi.update(editingEntry.id, data);
      await loadData();
      setEditingEntry(null);
      toast({
        title: 'Success',
        description: 'Trial balance entry updated successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update entry',
        variant: 'destructive',
      });
    }
  };

  const handleExportExcel = () => {
    exportToExcel(entries, `trial_balance_${new Date().toISOString().split('T')[0]}`);
    toast({
      title: 'Success',
      description: 'Trial balance exported to Excel',
    });
  };

  const handleExportPDF = () => {
    exportToPDF(entries, `trial_balance_${new Date().toISOString().split('T')[0]}`);
    toast({
      title: 'Success',
      description: 'Trial balance exported to PDF',
    });
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Trial Balance</h1>
          <p className="text-muted-foreground">Manage your trial balance entries</p>
        </div>
        <div className="flex gap-2">
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
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Entry
          </Button>
        </div>
      </div>

      <TrialBalanceStats summary={summary} />

      <Card>
        <CardHeader>
          <CardTitle>Trial Balance Entries</CardTitle>
          <CardDescription>
            Manage your chart of accounts and balances
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No entries found</p>
              <Button 
                className="mt-4" 
                onClick={() => setShowForm(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Entry
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono">{entry.account_code}</TableCell>
                    <TableCell>{entry.account_name}</TableCell>
                    <TableCell className="text-right">
                      {entry.debit > 0 ? entry.debit.toFixed(2) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.credit > 0 ? entry.credit.toFixed(2) : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingEntry(entry)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={2}>TOTALS</TableCell>
                  <TableCell className="text-right">
                    {summary.totalDebits.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {summary.totalCredits.toFixed(2)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TrialBalanceForm
        open={showForm}
        onOpenChange={setShowForm}
        onSubmit={handleCreate}
        onCancel={() => setShowForm(false)}
      />

      {editingEntry && (
        <TrialBalanceForm
          entry={editingEntry}
          open={!!editingEntry}
          onOpenChange={(open) => !open && setEditingEntry(null)}
          onSubmit={handleUpdate}
          onCancel={() => setEditingEntry(null)}
        />
      )}
    </div>
  );
};
