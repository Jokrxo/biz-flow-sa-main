import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Download, Upload, ArrowRight, Save, FileText, Calendar, Filter, CreditCard, Wallet, BookOpen, Percent, CheckCircle, SlidersHorizontal, Check, ChevronsUpDown, RefreshCw, Undo2, Ban, ChevronLeft, ChevronRight, FileSpreadsheet, Pencil, MoreHorizontal, Info, Search, Briefcase, ChevronDown, Lock, History, Plus, Users } from "lucide-react";
import { format } from "date-fns";
import { CSVImport } from "./CSVImport";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FinancialYearLockDialog } from "@/components/FinancialYearLockDialog";

interface AccountComboboxProps {
  accounts: any[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const AccountCombobox = ({ accounts, value, onChange, placeholder = "Select Account...", disabled = false }: AccountComboboxProps) => {
  const [open, setOpen] = useState(false);
  const selectedAccount = accounts.find((account) => String(account.id) === String(value));

  
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal pl-3 h-10 text-left bg-background hover:bg-muted/50"
        >
          {selectedAccount ? (
             <span className="truncate flex items-center gap-2">
                <span className="font-mono font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs">{selectedAccount.account_code}</span>
                <span className="truncate">{selectedAccount.account_name}</span>
             </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 z-[1100]" align="start">
        <Command>
          <CommandInput placeholder="Search account code or name..." />
          <CommandList className="max-h-[300px] overflow-y-auto custom-scrollbar">
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
              {accounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={`${account.account_code} ${account.account_name}`}
                  onSelect={() => {
                    onChange(String(account.id));
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      String(value) === String(account.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="font-mono text-muted-foreground mr-2 w-16">{account.account_code}</span>
                  <span className="flex-1 truncate">{account.account_name}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-2 capitalize">{account.account_type || account.type}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  total_amount: number;
  transaction_type: string;
  category: string; // Account ID
  vat_rate: number;
  vat_amount?: number;
  base_amount?: number;
  status: string;
  reference_number: string;
  payee?: string;
  bank_account_id?: string;
  debit_account_id?: string;
  credit_account_id?: string;
  company_id?: string;
  user_id?: string;
}

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  current_balance: number;
  currency: string;
}

export const BankingInterface = () => {
  const { toast } = useToast();
  const { isDateLocked } = useFiscalYear();
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);
  const [showDateWarning, setShowDateWarning] = useState(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("new");
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpStep, setHelpStep] = useState(1);
  const totalHelpSteps = 10;
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;
  
  // COA Categories
  const [coaIncome, setCoaIncome] = useState<any[]>([]);
  const [coaExpense, setCoaExpense] = useState<any[]>([]);
  const [coaReceivable, setCoaReceivable] = useState<any[]>([]);
  const [coaPayable, setCoaPayable] = useState<any[]>([]);
  const [coaAssets, setCoaAssets] = useState<any[]>([]);
  const [coaLiabilities, setCoaLiabilities] = useState<any[]>([]);
  const [coaEquity, setCoaEquity] = useState<any[]>([]);
  const [coaOther, setCoaOther] = useState<any[]>([]);

  // Allocation State
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocationTx, setAllocationTx] = useState<Transaction | null>(null);
  const [isInsertMode, setIsInsertMode] = useState(false);
  const [allocAmount, setAllocAmount] = useState<string>('');
  const [posting, setPosting] = useState<Record<string, boolean>>({});
  
  const [allocDate, setAllocDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [allocType, setAllocType] = useState<string>('income');
  const [allocPayment, setAllocPayment] = useState<'cash'|'accrual'>('cash');
  const [allocBankId, setAllocBankId] = useState<string>('');
  const [allocVatOn, setAllocVatOn] = useState<'yes'|'no'>('yes');
  const [allocVatRate, setAllocVatRate] = useState<string>('15');
  const [allocAccountId, setAllocAccountId] = useState<string>('');
  const [allocSettlement, setAllocSettlement] = useState<'receivable'|'payable'|'other'>('receivable');
  const [allocSettlementAccountId, setAllocSettlementAccountId] = useState<string>('');
  const [allocDesc, setAllocDesc] = useState<string>('');
  const [loans, setLoans] = useState<any[]>([]);
  const [allocLoanId, setAllocLoanId] = useState<string>('');

  // Supplier & Customer Allocation State
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [openInvoices, setOpenInvoices] = useState<any[]>([]);
  const [openBills, setOpenBills] = useState<any[]>([]);
  const [allocEntityId, setAllocEntityId] = useState<string>('');
  const [allocDocId, setAllocDocId] = useState<string>('');
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Employee Allocation State
  const [employees, setEmployees] = useState<any[]>([]);
  const [allocEmployeeId, setAllocEmployeeId] = useState<string>('');

  // Edit State
  const [editOpen, setEditOpen] = useState(false);
  const [showEditRestrictionDialog, setShowEditRestrictionDialog] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');
  const [editRef, setEditRef] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('0');


  const executeTransaction = async () => {
    let currentAllocationTx = allocationTx;
    let txId = currentAllocationTx?.id;

    if (isInsertMode) {
       if (!allocAmount || Number(allocAmount) <= 0) {
          toast({ title: "Amount Required", description: "Please enter a valid amount.", variant: "destructive" });
          return;
       }
       if (!allocBankId) {
          toast({ title: "Bank Required", description: "Please select a bank account.", variant: "destructive" });
          return;
       }
       
       const incomeTypes = ['income', 'asset_disposal', 'loan_received', 'equity', 'receivable_collection', 'customer_receipt'];
       const isIncome = incomeTypes.includes(allocType);
       const amount = Number(allocAmount);
       const signedAmount = isIncome ? amount : -amount;

       const { data: user } = await supabase.auth.getUser();
       if (!user.user) {
           toast({ title: "Error", description: "User not authenticated", variant: "destructive" });
           return;
       }
       
       const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.user.id).single();
       if (!profile?.company_id) {
           toast({ title: "Error", description: "Company context not found", variant: "destructive" });
           return;
       }

       try {
           const { data: newTx, error: insertError } = await supabase.from('transactions').insert({
              company_id: profile.company_id,
              user_id: user.user.id,
              transaction_date: allocDate,
              description: allocDesc || 'New Transaction',
              total_amount: signedAmount,
              base_amount: amount,
              transaction_type: isIncome ? 'receipt' : 'payment',
              status: 'pending',
              bank_account_id: allocBankId,
              reference_number: isIncome ? 'DEP' : 'PMT'
           } as any).select().single();

           if (insertError) throw insertError;
           currentAllocationTx = newTx;
           txId = newTx.id;
       } catch (e: any) {
           console.error(e);
           toast({ title: "Creation Failed", description: e.message, variant: "destructive" });
           return;
       }
    }

    if (!currentAllocationTx || !txId) return;
    
    if (allocPayment === 'cash' && !allocBankId) { toast({ title: "Bank Required", description: "Please select a bank account.", variant: "destructive" }); return; }
    if (!allocAccountId) { toast({ title: "Account Required", description: "Please select an account for this transaction.", variant: "destructive" }); return; }
    if (allocType === 'employee_salary' && !allocEmployeeId) { toast({ title: "Employee Required", description: "Please select an employee for this salary payment.", variant: "destructive" }); return; }
    if (allocPayment === 'accrual' && !allocSettlementAccountId) { toast({ title: "Settlement Account Required", description: "Please select a settlement account.", variant: "destructive" }); return; }
    if ((allocType === 'loan_interest' || allocType === 'loan_repayment') && !allocLoanId) { toast({ title: "Loan Required", description: "Please select a loan.", variant: "destructive" }); return; }
    if ((allocType === 'supplier_payment' || allocType === 'customer_receipt') && !allocDocId && Object.keys(allocations).length === 0) { toast({ title: "Document Required", description: "Please select an invoice or bill.", variant: "destructive" }); return; }

    // Date Validation for Supplier Payments
    if (allocType === 'supplier_payment') {
      const paymentDate = new Date(allocDate);
      let hasDateError = false;

      // Check single selection
      if (allocDocId) {
          const doc = openBills.find(b => b.id === allocDocId);
          if (doc && doc.bill_date) {
              if (paymentDate < new Date(doc.bill_date)) {
                  hasDateError = true;
              }
          }
      }

      // Check multiple selections
      const allocatedIds = Object.keys(allocations);
      for (const id of allocatedIds) {
           const doc = openBills.find(b => b.id === id);
           if (doc && doc.bill_date) {
              if (paymentDate < new Date(doc.bill_date)) {
                  hasDateError = true;
              }
           }
      }

      if (hasDateError) {
          setShowDateWarning(true);
          return;
      }
    }

    // Optimistic UI updates
    setPosting(prev => ({ ...prev, [txId]: true }));
    setAllocationOpen(false);
    setAllocationModalOpen(false);
    toast({ title: "Posting Started", description: "Allocation is being processed in the background. You can continue working." });

    // Process Transaction
    const processTransaction = async () => {
      if (isDateLocked(allocDate)) {
        setIsLockDialogOpen(true);
        setPosting(prev => ({ ...prev, [txId]: false }));
        return;
      }

      try {
        const isReceipt = ['income', 'asset_disposal', 'loan_received', 'equity', 'receivable_collection', 'customer_receipt'].includes(allocType);
        const total = Math.abs(Number(currentAllocationTx?.total_amount || 0));
        let debitAccount = '';
        let creditAccount = '';
        
        if (allocPayment === 'cash') {
          // Find GL Account for Bank
          const bankName = bankAccounts.find(b => String(b.id) === String(allocBankId))?.account_name;
          let bankGL = accounts.find(a => a.account_name === bankName);
          if (!bankGL) {
             bankGL = accounts.find(a => (a.account_type === 'asset' || a.account_type === 'bank' || a.account_type === 'cash') && a.account_name.toLowerCase().includes('bank'));
          }
          
          const bankGLId = bankGL?.id;
          if (!bankGLId) {
             throw new Error("Could not find a GL Account for the selected Bank. Please check Chart of Accounts.");
          }

          if (isReceipt) { debitAccount = bankGLId; creditAccount = allocAccountId; }
          else { debitAccount = allocAccountId; creditAccount = bankGLId; }
        } else {
          const settleId = allocSettlementAccountId;
          if (isReceipt) { debitAccount = settleId; creditAccount = allocAccountId; }
          else { debitAccount = allocAccountId; creditAccount = settleId; }
        }

        if (allocType === 'supplier_payment') {
             const entriesList = Object.entries(allocations);
             if (entriesList.length === 0 && allocDocId) entriesList.push([allocDocId, total]);

             let lastSupplierId: string | null = allocEntityId || null;

             for (let i = 0; i < entriesList.length; i++) {
                 const [billId, amount] = entriesList[i];
                 const doc = openBills.find(b => b.id === billId);
                 let bill: any = null;
                 let docType = 'bill';

                 if (doc && doc.doc_type === 'po') {
                    docType = 'po';
                    const { data } = await supabase.from('purchase_orders').select('*').eq('id', billId).single();
                    if (data) {
                        bill = { ...data, bill_number: data.po_number };
                    }
                 } else {
                    const { data } = await supabase.from('bills').select('*').eq('id', billId).single();
                    bill = data;
                 }
                 
                 if (!bill) continue;
                 lastSupplierId = bill.supplier_id;

                 // IMPORTANT: Use PO Number as reference if available, to ensure Creditors Control (which tracks POs) picks it up.
                 // We still mention the Bill Number in description.
                 const effectiveRef = bill.po_number || bill.bill_number;
                 const description = bill.po_number && bill.po_number !== bill.bill_number 
                    ? `Payment for ${bill.bill_number} (Ref: ${bill.po_number})`
                    : `Payment for ${bill.bill_number}`;

                 let currentTxId = txId;
                 if (i > 0) {
                     const { data: newTx } = await supabase.from('transactions').insert({
                      company_id: currentAllocationTx.company_id,
                      transaction_date: allocDate,
                      description: description,
                      total_amount: -Math.abs(amount),
                      base_amount: Math.abs(amount),
                      reference_number: effectiveRef,
                      status: 'approved',
                         transaction_type: 'payment',
                      bank_account_id: allocBankId,
                       debit_account_id: debitAccount,
                       credit_account_id: creditAccount,
                       user_id: currentAllocationTx.user_id,
                       supplier_id: bill.supplier_id
                    } as any).select().single();
                     if (newTx) currentTxId = newTx.id;
                 } else {
                     await supabase.from('transactions').update({
                        transaction_date: allocDate,
                        description: description,
                        base_amount: Math.abs(amount),
                        total_amount: -Math.abs(amount),
                        reference_number: effectiveRef,
                        status: 'posted',
                        transaction_type: 'payment',
                        bank_account_id: allocBankId,
                         debit_account_id: debitAccount,
                         credit_account_id: creditAccount,
                         supplier_id: bill.supplier_id
                     } as any).eq('id', txId);
                 }

                 await supabase.from('transaction_entries').delete().eq('transaction_id', currentTxId);
                 await supabase.from('ledger_entries').delete().eq('transaction_id', currentTxId);

                 const entries = [
                    {
                        transaction_id: currentTxId,
                        account_id: debitAccount,
                        debit: amount,
                        credit: 0,
                        description: description,
                       status: 'approved'
                   },
                   {
                       transaction_id: currentTxId,
                       account_id: creditAccount,
                       debit: 0,
                       credit: amount,
                       description: description,
                       status: 'approved'
                   }
                ];
                
                await supabase.from('transaction_entries').insert(entries as any);

                const ledgerRows = entries.map(entry => ({
                    company_id: currentAllocationTx.company_id,
                    transaction_id: currentTxId,
                    account_id: entry.account_id,
                    debit: entry.debit,
                    credit: entry.credit,
                    entry_date: allocDate,
                    description: entry.description,
                    is_reversed: false,
                    reference_id: currentTxId
                }));

                const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
                if (leErr) throw leErr;

                await supabase.from('transactions').update({ status: 'posted' }).eq('id', currentTxId);

                const { data: relTxs } = await supabase.from('transactions')
                   .select('base_amount')
                   .eq('reference_number', effectiveRef)
                   .eq('transaction_type', 'payment')
                   .in('status', ['posted', 'approved'])
                   .neq('id', currentTxId);
                
                const priorPaid = (relTxs || []).reduce((sum, t) => sum + (Number(t.base_amount) || 0), 0);
                const totalPaidNow = priorPaid + amount;

                console.log(`Updating Bill/PO Status. Ref: ${effectiveRef}, Prior: ${priorPaid}, Current: ${amount}, Total: ${totalPaidNow}, Bill Total: ${bill.total_amount}`);
                
                if (docType === 'po') {
                    const newStatus = totalPaidNow >= (bill.total_amount - 1) ? 'paid' : 'partially_paid';
                    await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', billId);
                    
                    // Also update any linked Bills/Supplier Invoices
                    const searchPoNum = bill.po_number || bill.bill_number;
                    const { data: linkedBills } = await supabase
                      .from('bills')
                      .select('id, total_amount')
                      .eq('po_number', searchPoNum);
                    
                    if (linkedBills && linkedBills.length > 0) {
                       for (const lb of linkedBills) {
                          const amountDue = Math.max(0, lb.total_amount - totalPaidNow);
                          const billStatus = amountDue <= 0.01 ? 'paid' : 'partially_paid';
                          
                          console.log(`Updating Linked Bill ${lb.id} for PO ${searchPoNum}. Due: ${amountDue}, Status: ${billStatus}`);
                          
                          await supabase.from('bills').update({ 
                              status: billStatus,
                              amount_due: amountDue 
                          }).eq('id', lb.id);
                       }
                    } else {
                         console.warn(`No linked bills found for PO: ${searchPoNum}`);
                    }
                } else {
                    // It is a Bill
                    // 1. Update the Bill itself
                    const newStatus = totalPaidNow >= (bill.total_amount - 1) ? 'paid' : 'partially_paid';
                    const amountDue = Math.max(0, bill.total_amount - totalPaidNow);
                    await supabase.from('bills').update({ 
                        status: newStatus,
                        amount_due: amountDue
                    }).eq('id', billId);

                    // 2. Update the Linked PO (if any)
                    if (bill.po_number) {
                       const { data: linkedPO } = await supabase.from('purchase_orders').select('id, total_amount').eq('po_number', bill.po_number).maybeSingle();
                       if (linkedPO) {
                          const poStatus = totalPaidNow >= (linkedPO.total_amount - 1) ? 'paid' : 'partially_paid';
                          await supabase.from('purchase_orders').update({ status: poStatus }).eq('id', linkedPO.id);
                       }
                    }
                }
                
                await setTransactionStatus(currentTxId, 'approved');
            }

             // Handle Overpayment / Remainder
             const totalAllocated = entriesList.reduce((sum, [_, amt]) => sum + (Number(amt) || 0), 0);
             const remainder = total - totalAllocated;
             
             if (remainder > 0.01) {
                // Find a Receivable / Prepayment account
                let receivableAccount = accounts.find(a => 
                    a.account_name.toLowerCase().includes('supplier prepayment') || 
                    a.account_name.toLowerCase().includes('accounts receivable')
                );
                
                // For supplier payments, keep it in the AP account (Creditors Control)
                // so it shows up on the Creditors Control Report.
                if (allocType === 'supplier_payment' && debitAccount) {
                   receivableAccount = { id: debitAccount };
                } else if (!receivableAccount) {
                   // Fallback to any current asset
                   receivableAccount = accounts.find(a => a.account_type === 'asset' || a.account_type === 'current_asset');
                }

                if (receivableAccount) {
                      if (entriesList.length === 0) {
                          // Update existing transaction since no bills were allocated
                          await supabase.from('transactions').update({
                            description: `Prepayment for ${currentAllocationTx.reference_number || 'Supplier'}`,
                            debit_account_id: receivableAccount.id,
                            credit_account_id: creditAccount,
                            status: 'posted',
                            supplier_id: lastSupplierId
                          } as any).eq('id', txId);

                          await supabase.from('transaction_entries').delete().eq('transaction_id', txId);
                          
                          const entries = [
                             {
                                 transaction_id: txId,
                                 account_id: receivableAccount.id,
                                 debit: remainder,
                                 credit: 0,
                                 description: `Prepayment Balance`,
                                status: 'approved'
                            },
                            {
                                transaction_id: txId,
                                account_id: creditAccount,
                                debit: 0,
                                credit: remainder,
                                description: `Prepayment Balance`,
                                status: 'approved'
                            }
                        ];
                        const { error: prepEntriesError } = await supabase.from('transaction_entries').insert(entries as any);
                        if (prepEntriesError) throw prepEntriesError;
                        await setTransactionStatus(txId, 'posted');

                      } else {
                          // Insert new transaction for remainder (Original Tx used for first bill)
                          const { data: remTx } = await supabase.from('transactions').insert({
                            company_id: currentAllocationTx.company_id,
                            transaction_date: allocDate,
                            description: `Overpayment / Prepayment for ${currentAllocationTx.reference_number || 'Supplier'}`,
                            total_amount: -Math.abs(remainder),
                            base_amount: Math.abs(remainder),
                            reference_number: (currentAllocationTx.reference_number || '') + '-BAL',
                            status: 'posted',
                            transaction_type: 'payment',
                            bank_account_id: allocBankId,
                            debit_account_id: receivableAccount.id,
                            credit_account_id: creditAccount,
                            user_id: currentAllocationTx.user_id,
                            supplier_id: lastSupplierId
                         } as any).select().single();

                         if (remTx) {
                              const entries = [
                                {
                                    transaction_id: remTx.id,
                                    account_id: receivableAccount.id,
                                    debit: remainder,
                                    credit: 0,
                                    description: `Overpayment Balance`,
                                   status: 'approved'
                               },
                               {
                                   transaction_id: remTx.id,
                                   account_id: creditAccount,
                                   debit: 0,
                                   credit: remainder,
                                   description: `Overpayment Balance`,
                                   status: 'approved'
                               }
                           ];
                           const { error: remEntriesError } = await supabase.from('transaction_entries').insert(entries as any);
                            if (remEntriesError) throw remEntriesError;
                            await setTransactionStatus(remTx.id, 'posted');
                         }
                      }
                  }
             }

             toast({
                title: "Allocation Complete",
                description: remainder > 0.01 
                    ? `Allocated to bills. Overpayment of ${remainder.toFixed(2)} recorded as Prepayment.`
                    : "Transaction allocated to bills successfully.",
             });
        } else {
            const rate = allocVatOn === 'yes' ? Number(allocVatRate || '0') : 0;
            const vatAmount = rate > 0 ? ((total * rate) / (100 + rate)) : 0;
            const netAmount = rate > 0 ? (total - vatAmount) : total;

            let txType = '';
            if (allocPayment === 'accrual') {
              txType = isReceipt ? 'sales' : 'purchase';
            } else {
              txType = isReceipt ? 'receipt' : 'payment';
            }

            let txReference = currentAllocationTx.reference_number || null;
           let docTotal = 0;
            let docTable = '';

            if (allocType === 'customer_receipt' && allocDocId) {
                 const { data: inv } = await supabase.from('invoices').select('invoice_number, total_amount').eq('id', allocDocId).single();
                 if (inv) {
                    txReference = inv.invoice_number;
                    docTotal = inv.total_amount;
                    docTable = 'invoices';
                 }
            }

            let currentOutstanding = 0;
            let priorPaid = 0;
            
            if (txReference) {
                const { data: relTxs } = await supabase.from('transactions')
                   .select('base_amount')
                   .eq('reference_number', txReference)
                   .eq('transaction_type', isReceipt ? 'receipt' : 'payment')
                   .in('status', ['posted', 'approved'])
                   .neq('id', txId);
                
                if (relTxs) priorPaid = relTxs.reduce((sum, t) => sum + (Number(t.base_amount) || 0), 0);
                currentOutstanding = Math.max(0, docTotal - priorPaid);
            }

            const { error: upErr } = await supabase
              .from('transactions')
            .update({
              transaction_date: allocDate,
              description: String(allocDesc || '').trim() || (currentAllocationTx?.description || null),
              bank_account_id: allocPayment === 'cash' ? allocBankId : null,
              debit_account_id: debitAccount || null,
              credit_account_id: creditAccount || null,
              vat_rate: rate > 0 ? rate : null,
              vat_amount: vatAmount > 0 ? vatAmount : null,
              base_amount: netAmount,
              vat_inclusive: (allocVatOn === 'yes'),
              transaction_type: txType,
              reference_number: txReference
            })
            .eq('id', txId);
            
            if (upErr) throw upErr;

            if (rate === 0) {
                await supabase.from('transaction_entries').delete().eq('transaction_id', txId);

                const entries = [
                    {
                        transaction_id: txId,
                        account_id: debitAccount,
                        debit: netAmount,
                        credit: 0,
                        description: currentAllocationTx.description || `Payment for ${txReference || ''}`,
                        status: 'approved'
                    },
                    {
                        transaction_id: txId,
                        account_id: creditAccount,
                        debit: 0,
                        credit: netAmount,
                        description: allocationTx?.description || `Payment for ${txReference || ''}`,
                        status: 'approved'
                    }
                ];

                const { error: entryErr } = await supabase.from('transaction_entries').insert(entries as any);
                if (entryErr) throw entryErr;
            }

            if (allocType === 'loan_interest' && allocLoanId) {
               const interestAmount = netAmount; 
               await supabase.from('loan_payments').insert({
                  loan_id: allocLoanId,
                  payment_date: allocDate,
                  amount: interestAmount,
                  principal_component: 0,
                  interest_component: interestAmount
               });
            } else if (allocType === 'loan_repayment' && allocLoanId) {
               await supabase.from('loan_payments').insert({
                  loan_id: allocLoanId,
                  payment_date: allocDate,
                  amount: netAmount,
                  principal_component: netAmount, 
                  interest_component: 0
               });
               
               const { data: loan } = await supabase.from('loans').select('outstanding_balance').eq('id', allocLoanId).single();
               if (loan) {
                  await supabase.from('loans').update({
                     outstanding_balance: Math.max(0, loan.outstanding_balance - netAmount)
                  }).eq('id', allocLoanId);
               }
            }

            const totalPaidNow = priorPaid + netAmount;
            
            if (docTable === 'invoices') {
                const newStatus = totalPaidNow >= (docTotal - 1) ? 'paid' : 'partial';
                await supabase.from('invoices').update({ status: newStatus }).eq('id', allocDocId);
            }

            await setTransactionStatus(txId, 'posted');
        }
      } catch (e: any) {
        console.error(e);
        toast({ title: 'Allocation Failed', description: e.message || 'Failed to allocate transaction', variant: 'destructive' });
      } finally {
        setPosting(prev => ({ ...prev, [txId]: false }));
      }
    };

    // Fire and forget (or await if we wanted to block UI, but we already closed it)
    processTransaction();
  };

  const nextHelpStep = () => {
    setHelpStep((prev) => (prev < totalHelpSteps ? prev + 1 : prev));
  };

  const prevHelpStep = () => {
    setHelpStep((prev) => (prev > 1 ? prev - 1 : prev));
  };

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      // Fetch Bank Accounts
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
        
      const companyId = (profile as any)?.company_id;
      if (!companyId) return;
      setCompanyId(companyId);

      const { data: banks } = await supabase.from('bank_accounts')
        .select('*')
        .eq('company_id', companyId);
        
      if (banks) {
        setBankAccounts(banks);
        if (banks.length > 0 && !selectedBankId) {
          setSelectedBankId(banks[0].id);
        }
      }

      // Fetch Chart of Accounts
      const { data: coa } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('account_code');
        
      if (coa) {
        setAccounts(coa);
        setCoaIncome(coa.filter(a => {
           const t = String(a.account_type || '').toLowerCase();
           return t === 'income' || t === 'revenue' || t === 'other_income';
        }));
        setCoaExpense(coa.filter(a => {
           const t = String(a.account_type || '').toLowerCase();
           return t === 'expense' || t === 'cost_of_sales' || t === 'other_expense';
        }));
        setCoaReceivable(coa.filter(a => {
           const t = String(a.account_type || '').toLowerCase();
           const n = String(a.account_name || '').toLowerCase();
           return t === 'asset' && (n.includes('receivable') || n.includes('debtors') || n.includes('customer'));
        }));
        setCoaPayable(coa.filter(a => {
           const t = String(a.account_type || '').toLowerCase();
           const n = String(a.account_name || '').toLowerCase();
           return t === 'liability' && (n.includes('payable') || n.includes('creditors') || n.includes('supplier'));
        }));
        setCoaAssets(coa.filter(a => {
           const t = String(a.account_type || '').toLowerCase();
           return t === 'asset' || t === 'fixed_asset' || t === 'current_asset' || t === 'non_current_asset';
        }));
        setCoaLiabilities(coa.filter(a => {
           const t = String(a.account_type || '').toLowerCase();
           return t === 'liability' || t === 'long_term_liability' || t === 'current_liability' || t === 'non_current_liability';
        }));
        setCoaEquity(coa.filter(a => {
           const t = String(a.account_type || '').toLowerCase();
           return t === 'equity' || t === 'capital';
        }));
        setCoaOther(coa);
      }

      // Fetch Loans
      const { data: loansData } = await supabase
        .from('loans')
        .select('id, reference, principal, outstanding_balance, status')
        .eq('company_id', companyId)
        .eq('status', 'active');
        
      if (loansData) setLoans(loansData);

      // Fetch Suppliers
      const { data: supps } = await supabase.from('suppliers').select('id, name').eq('company_id', companyId);
      if (supps) setSuppliers(supps);

      // Fetch Customers
      const { data: custs } = await supabase.from('customers').select('id, customer_name').eq('company_id', companyId);
      if (custs) setCustomers(custs);

      // Fetch Employees
      const { data: emps } = await supabase
        .from('employees' as any)
        .select('id, first_name, last_name, employee_number')
        .eq('company_id', companyId)
        .order('first_name');
      if (emps) setEmployees(emps as any);
    };

    fetchData();
  }, []);

  // Auto-select Interest / Liability / Net Salary / Control Accounts
  useEffect(() => {
    if (allocType === 'loan_interest') {
      // Find an expense account with "interest" in the name
      const interestAccount = coaExpense.find(a => 
        (a.account_name || '').toLowerCase().includes('interest') || 
        (a.account_name || '').toLowerCase().includes('finance cost')
      );
      
      if (interestAccount) {
        setAllocAccountId(interestAccount.id);
      }
    } else if (allocType === 'loan_repayment') {
      let loanAccount = null;
      
      // 1. Try to find account matching selected loan reference
      if (allocLoanId) {
         const selectedLoan = loans.find(l => l.id === allocLoanId);
         if (selectedLoan) {
             loanAccount = coaLiabilities.find(a => 
                (a.account_name || '').toLowerCase().includes((selectedLoan.reference || '').toLowerCase())
             );
         }
      }
      
      // 2. Fallback to generic "loan" account
      if (!loanAccount) {
         loanAccount = coaLiabilities.find(a => 
           (a.account_name || '').toLowerCase().includes('loan')
         );
      }
      
      if (loanAccount) {
        setAllocAccountId(loanAccount.id);
      }
    } else if (allocType === 'supplier_payment') {
      // Auto-select Accounts Payable
      const apAccount = coaPayable.find(a => 
        (a.account_name || '').toLowerCase().includes('payable') || 
        (a.account_name || '').toLowerCase().includes('creditor') ||
        (a.account_name || '').toLowerCase().includes('supplier')
      );
      if (apAccount) setAllocAccountId(apAccount.id);
    } else if (allocType === 'customer_receipt') {
      // Auto-select Accounts Receivable
      const arAccount = coaReceivable.find(a => 
        (a.account_name || '').toLowerCase().includes('receivable') || 
        (a.account_name || '').toLowerCase().includes('debtor') ||
        (a.account_name || '').toLowerCase().includes('customer')
      );
      if (arAccount) setAllocAccountId(arAccount.id);
    } else if (allocType === 'employee_salary') {
      // Auto-select Net Salary / Wages Payable style account and lock it
      const findMatch = (name: string | undefined | null, term: string) =>
        (name || '').toLowerCase().includes(term);

      let netAccount =
        coaPayable.find(a =>
          findMatch(a.account_name, 'net salary') ||
          findMatch(a.account_name, 'net salaries') ||
          findMatch(a.account_name, 'salary payable') ||
          findMatch(a.account_name, 'salaries payable') ||
          findMatch(a.account_name, 'wages payable') ||
          findMatch(a.account_name, 'wages accrual') ||
          findMatch(a.account_name, 'payroll clearing')
        ) || null;

      if (!netAccount && coaPayable.length > 0) {
        netAccount = coaPayable[0];
      }

      if (netAccount) {
        setAllocAccountId(netAccount.id);
      }
    }
  }, [allocType, allocLoanId, coaExpense, coaLiabilities, coaPayable, coaReceivable, loans]);

  // Fetch Open Invoices/Bills when Entity changes
  useEffect(() => {
    const fetchDocs = async () => {
      if (!allocEntityId) {
          setOpenBills([]);
          setOpenInvoices([]);
          return;
      }
      setLoadingDocs(true);

      if (allocType === 'supplier_payment') {
        console.log('Fetching docs for supplier:', allocEntityId, 'Company:', companyId);
        
        // Fetch Bills with broader status check
        let query = supabase
          .from('bills')
          .select('*')
          .eq('supplier_id', allocEntityId);
        
        if (companyId) {
            query = query.eq('company_id', companyId);
        }

        const { data: bills, error: billsError } = await query;
        
        if (billsError) console.error('Error fetching bills:', billsError);

        // Fetch Purchase Orders
        let poQuery = supabase
          .from('purchase_orders')
          .select('*')
          .eq('supplier_id', allocEntityId);

        if (companyId) {
            poQuery = poQuery.eq('company_id', companyId);
        }

        const { data: pos, error: poError } = await poQuery;
        if (poError) console.error('Error fetching POs:', poError);

        // Filter locally to be safe about status casing
        const validBills = (bills || []).filter(b => {
             const status = (b.status || '').toLowerCase();
             return status !== 'draft';
        }).map(b => ({ ...b, doc_type: 'bill' }));

        const validPOs = (pos || []).filter(p => {
             const status = (p.status || '').toLowerCase();
             // Include sent, processed, partially_paid, paid. Exclude draft, cancelled.
             return ['sent', 'processed', 'partially_paid', 'paid'].includes(status);
        }).map(p => ({ 
            ...p, 
            bill_number: p.po_number, // Map po_number to bill_number for consistency
            bill_date: p.po_date,
            doc_type: 'po' 
        }));

        // --- Calculate Amount Due (Outstanding) ---
        const allRefs = [
            ...validBills.map(b => b.bill_number),
            ...validPOs.map(p => p.po_number)
        ].filter(Boolean);

        const paymentsMap: Record<string, number> = {};
        const refundsMap: Record<string, number> = {};

        if (allRefs.length > 0) {
            const { data: refTx } = await supabase
                .from('transactions')
                .select('reference_number, total_amount, transaction_type')
                .eq('company_id', companyId)
                .in('transaction_type', ['payment', 'refund'])
                .in('status', ['posted', 'approved']) // Count both posted and approved transactions
                .in('reference_number', allRefs);
            
            if (refTx) {
                refTx.forEach((p: any) => {
                    const ref = p.reference_number || '';
                    const amt = Number(p.total_amount || 0);
                    if (ref) {
                        if (p.transaction_type === 'refund') {
                             refundsMap[ref] = (refundsMap[ref] || 0) + amt;
                        } else {
                             paymentsMap[ref] = (paymentsMap[ref] || 0) + amt;
                        }
                    }
                });
            }
        }

        const getAmountDue = (item: any, type: 'bill' | 'po') => {
             const ref = type === 'bill' ? item.bill_number : item.po_number;
             const total = Number(item.total_amount || 0);
             let paid = paymentsMap[ref] || 0;
             
             // Check for payments on linked PO if bill
             if (type === 'bill' && item.po_number) {
                 paid += paymentsMap[item.po_number] || 0;
             }

             const refunded = refundsMap[ref] || 0;
             return Math.max(0, total - paid - refunded);
        };

        const calculateStatus = (item: any, type: 'bill' | 'po') => {
          const ref = type === 'bill' ? item.bill_number : item.po_number;
          const total = Number(item.total_amount || 0);
          let paid = paymentsMap[ref] || 0;
          
          // Check for payments on linked PO
          if (type === 'bill' && item.po_number) {
             paid += paymentsMap[item.po_number] || 0;
          }
          
          const refunded = refundsMap[ref] || 0;
          const totalPaid = paid + refunded;
          
          // Check for full return first
          if (total > 0 && refunded >= total - 0.01) return 'Returned';

          // Due date logic
          let dueDate: Date | null = null;
          if (type === 'bill' && item.due_date) {
            dueDate = new Date(item.due_date);
          } else if (type === 'po' && item.po_date) {
            // Fallback for PO: assume 30 days if no explicit due date
            dueDate = new Date(item.po_date);
            dueDate.setDate(dueDate.getDate() + 30);
          }

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (dueDate) dueDate.setHours(0, 0, 0, 0);
          
          if (total > 0 && totalPaid >= total - 0.01) return 'Paid';
          if (totalPaid > 0 && totalPaid < total) return 'Partially Paid';
          if (dueDate && dueDate < today && totalPaid < total) return 'Overdue';
          
          // If not paid at all
          return 'Unpaid';
        };

        const finalBills = validBills.map(b => ({
            ...b,
            amount_due: getAmountDue(b, 'bill'),
            status: calculateStatus(b, 'bill')
        }));

        const finalPOs = validPOs.map(p => ({
            ...p,
            amount_due: getAmountDue(p, 'po'),
            status: calculateStatus(p, 'po')
        }));

        // Combine and sort by date ascending for allocation (logic borrowed from SupplierInvoice)
        let combined = [...finalBills, ...finalPOs].sort((a, b) => 
          new Date(a.bill_date).getTime() - new Date(b.bill_date).getTime()
        );

        // Fetch deposits by supplier (unallocated credits) - needed to match SupplierInvoice balance logic
        const { data: depositTx } = await supabase
          .from('transactions')
          .select<string, any>('supplier_id, reference_number, total_amount, transaction_type')
          .eq('company_id', companyId)
          .in('status', ['posted', 'approved'])
          .eq('transaction_type', 'deposit');
        
        const depositsBySupplier: Record<string, number> = {};
        if (depositTx && depositTx.length > 0) {
          const refSet = new Set(allRefs);
          (depositTx as any[]).forEach(d => {
            const supplierId = String(d.supplier_id || '');
            const ref = d.reference_number || '';
            if (!supplierId) return;
            // Only count deposits not explicitly linked to a bill/po reference
            if (ref && refSet.has(ref)) return;
            const amt = Number(d.total_amount || 0);
            depositsBySupplier[supplierId] = (depositsBySupplier[supplierId] || 0) + amt;
          });
        }

        // Apply supplier deposits to reduce amount_due, and update status
        const creditRemaining: Record<string, number> = { ...depositsBySupplier };
        combined = combined.map(item => {
          const supplierId = item.supplier_id;
          const outstanding = Math.max(0, Number(item.amount_due || 0));
          const available = creditRemaining[supplierId] || 0;
          if (available > 0 && outstanding > 0) {
            const allocate = Math.min(available, outstanding);
            const newDue = Math.max(0, outstanding - allocate);
            creditRemaining[supplierId] = Math.max(0, available - allocate);
            const newStatus = newDue <= 0 ? 'Paid' : (item.status.toLowerCase() === 'overdue' ? 'Overdue' : 'Partially Paid');
            return { ...item, amount_due: newDue, status: newStatus };
          }
          return item;
        });

        // Re-sort by date descending for display (as typically expected in list, though SupplierInvoice uses desc)
        // However, allocation might prefer oldest first? SupplierInvoice sorts by date DESC for display.
        // Let's stick to descending for display consistency.
        combined = combined.sort((a, b) => 
          new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime()
        );

        setOpenBills(combined);
      } else if (allocType === 'customer_receipt') {
        // Get customer name from ID
        const customer = customers.find(c => c.id === allocEntityId);
        if (customer) {
            let invQuery = supabase
              .from('invoices')
              .select('*')
              .eq('customer_name', customer.customer_name); // Use name as ID not present
            
            if (companyId) {
                invQuery = invQuery.eq('company_id', companyId);
            }

            const { data } = await invQuery;
              
            if (data) {
                // Include paid invoices for customers too
                const validInvoices = data;
                setOpenInvoices(validInvoices);
            }
        }
      }
      setLoadingDocs(false);
    };

    fetchDocs();
  }, [allocType, allocEntityId, companyId]);

  // Fetch Transactions when bank changes
  useEffect(() => {
    if (!selectedBankId) return;

    const fetchTransactions = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('bank_account_id', selectedBankId)
        .order('transaction_date', { ascending: false });
      
      if (data) {
        // Map to interface
        const mapped: Transaction[] = data.map((t: any) => ({
          id: t.id,
          transaction_date: t.transaction_date,
          description: t.description,
          total_amount: t.total_amount || t.amount,
          transaction_type: t.transaction_type || (t.total_amount > 0 ? 'receipt' : 'payment'),
          category: t.category,
          vat_rate: t.vat_rate || 0,
          vat_amount: t.vat_amount,
          base_amount: t.base_amount,
          status: t.status || 'pending',
          reference_number: t.reference_number || '',
          payee: t.payee || '', 
          bank_account_id: t.bank_account_id,
          debit_account_id: t.debit_account_id,
          credit_account_id: t.credit_account_id,
          company_id: t.company_id,
          user_id: t.user_id
        }));
        setTransactions(mapped);
      }
      setLoading(false);
    };

    fetchTransactions();
  }, [selectedBankId, refreshKey]);

  // Calculate Real-time Balance from Ledger
  useEffect(() => {
    const fetchBalance = async () => {
      if (!selectedBankId || accounts.length === 0) return;
      
      const bank = bankAccounts.find(b => b.id === selectedBankId);
      if (!bank) return;

      // Find GL Account linked to this bank
      // Heuristic: Match by exact name, then by "Bank - Name" pattern
      let bankGL = accounts.find(a => a.account_name === bank.account_name);
      if (!bankGL) {
         bankGL = accounts.find(a => a.account_name === `Bank - ${bank.account_name}`);
      }
      
      if (bankGL) {
         // Try fetching from trial_balance_live first (efficient)
         const { data: tb, error: tbError } = await supabase
           .from('trial_balance_live' as any)
           .select('balance')
           .eq('account_id', bankGL.id)
           .maybeSingle();

         if (!tbError && tb) {
            setCurrentBalance(Number((tb as any).balance || 0));
         } else {
            // Fallback: Sum ledger entries manually
            const { data: entries } = await supabase
              .from('ledger_entries')
              .select('debit, credit')
              .eq('account_id', bankGL.id);
              
            if (entries) {
              const totalDebit = entries.reduce((sum, e) => sum + Number(e.debit || 0), 0);
              const totalCredit = entries.reduce((sum, e) => sum + Number(e.credit || 0), 0);
              // Asset: Debit - Credit
              setCurrentBalance(totalDebit - totalCredit);
            } else {
              setCurrentBalance(bank.current_balance || 0);
            }
         }
      } else {
         setCurrentBalance(bank.current_balance || 0);
      }
    };
    
    fetchBalance();
  }, [selectedBankId, accounts, refreshKey, bankAccounts]);

  const handleEditClick = (transaction: Transaction) => {
    // Check if transaction is from bank import (manual or otherwise)
    // We use category 'Bank Import' as the flag for imported transactions
    if (transaction.category === 'Bank Import') {
      setShowEditRestrictionDialog(true);
      return;
    }

    setEditTx(transaction);
    setEditDate(transaction.transaction_date);
    setEditDesc(transaction.description);
    setEditRef(transaction.reference_number || '');
    setEditAmount(String(transaction.total_amount));
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editTx) return;

    if (isDateLocked(editDate)) {
      setIsLockDialogOpen(true);
      return;
    }

    try {
      const { error } = await supabase
        .from('transactions')
        .update({
          transaction_date: editDate,
          description: editDesc,
          reference_number: editRef,
          total_amount: Number(editAmount),
          // We update amount too if it exists in schema, but total_amount is the main one used in mapped type
        })
        .eq('id', editTx.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Transaction updated successfully' });
      setEditOpen(false);
      setRefreshKey(prev => prev + 1);
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Error', description: error.message || 'Failed to update transaction', variant: 'destructive' });
    }
  };

  const handleAllocateClick = (transaction: Transaction) => {
    setIsInsertMode(false);
    setAllocationTx(transaction);
    setAllocDate(transaction.transaction_date);
    setAllocDesc(transaction.description);
    setAllocAmount(String(Math.abs(transaction.total_amount)));
    setAllocType(transaction.total_amount >= 0 ? 'income' : 'expense');
    setAllocPayment('cash');
    // Ensure bank account is locked to the transaction's bank or currently selected bank
    setAllocBankId(transaction.bank_account_id || selectedBankId);
    setAllocVatOn('no');
    setAllocVatRate('0');
    setAllocAccountId('');
    setAllocSettlementAccountId('');
    setAllocationOpen(true);
  };

  const handleInsertClick = () => {
    setIsInsertMode(true);
    setAllocationTx(null);
    setAllocDate(new Date().toISOString().split('T')[0]);
    setAllocDesc('');
    setAllocAmount('');
    setAllocType('expense');
    setAllocPayment('cash');
    setAllocBankId(selectedBankId);
    setAllocVatOn('no');
    setAllocVatRate('0');
    setAllocAccountId('');
    setAllocSettlementAccountId('');
    setAllocationOpen(true);
  };

  const setTransactionStatus = async (id: string, status: 'approved' | 'posted' | 'pending' | 'rejected' | 'unposted') => {
    // Lock check for approval
    if (status === 'approved' || status === 'posted') {
      const tx = transactions.find(t => t.id === id);
      if (tx && isDateLocked(tx.transaction_date)) {
        setIsLockDialogOpen(true);
        return;
      }
    }

    setPosting(prev => ({ ...prev, [id]: true }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated.");

      // Handle approval workflow: ensure double-entry exists, post to ledger, then mark approved/posted
      if (status === 'approved' || status === 'posted') {
        const { data: transaction, error: txFetchError } = await supabase
          .from("transactions")
          .select("*")
          .eq("id", id)
          .single();
        if (txFetchError) throw txFetchError;
        if (!transaction) throw new Error("Transaction not found");

        // Fetch company_id for ledger entries
        const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
        const companyId = (profile as any)?.company_id;
        if (!companyId) throw new Error("Company context not found.");

        // Load existing entries
        const { data: entries, error: entriesError } = await supabase
          .from("transaction_entries")
          .select("account_id, debit, credit, description")
          .eq("transaction_id", id);
        if (entriesError) throw entriesError;
        
        let finalEntries = entries || [];

        // If no entries exist, try to auto-create from header debit/credit accounts.
        if (!entries || entries.length === 0) {
          let debitAccountId = (transaction as any).debit_account_id;
          let creditAccountId = (transaction as any).credit_account_id;
          const amount = Math.abs(transaction.total_amount || 0);

          if (!debitAccountId || !creditAccountId) {
            throw new Error("Missing debit/credit accounts. Please allocate first.");
          }

          let vatAmount = 0;
          let netAmount = amount;
          
          if ((transaction as any).vat_rate > 0 && (transaction as any).vat_amount > 0) {
            vatAmount = (transaction as any).vat_amount;
            netAmount = (transaction as any).base_amount || (amount - vatAmount);
          }

          const newEntries = [];
          
          // 1. Net Amount Entry
          newEntries.push({
             transaction_id: id,
             account_id: debitAccountId,
             debit: netAmount,
             credit: 0,
             description: transaction.description,
             status: 'approved'
          });
          newEntries.push({
             transaction_id: id,
             account_id: creditAccountId,
             debit: 0,
             credit: netAmount,
             description: transaction.description,
             status: 'approved'
          });

          // 2. VAT Entry if applicable
          if (vatAmount > 0) {
             if (companyId) {
                const isIncome = (transaction as any).transaction_type === 'receipt' || (transaction as any).transaction_type === 'sales' || (transaction as any).transaction_type === 'income';
                let vatAccountId = null;
                
                if (isIncome) {
                   const { data: vOut } = await supabase.from('chart_of_accounts').select('id').eq('company_id', companyId).ilike('account_name', '%VAT Output%').maybeSingle();
                   vatAccountId = vOut?.id;
                } else {
                   const { data: vIn } = await supabase.from('chart_of_accounts').select('id').eq('company_id', companyId).ilike('account_name', '%VAT Input%').maybeSingle();
                   vatAccountId = vIn?.id;
                }

                if (vatAccountId) {
                    // For VAT entries, we need to balance the journal.
                    // The simplified logic above added Net Debit and Net Credit.
                    // We need to add the VAT portion.
                    // Ideally:
                    // Income: Dr Bank (Total), Cr Income (Net), Cr VAT (Tax)
                    // Expense: Dr Expense (Net), Dr VAT (Tax), Cr Bank (Total)
                    
                    // But we already pushed Net/Net above.
                    // We need to adjust.
                    // Let's clear newEntries and rebuild correctly.
                    newEntries.length = 0;

                    if (isIncome) {
                        // Income: Debit Bank (Total), Credit Income (Net), Credit VAT (Tax)
                        newEntries.push({
                            transaction_id: id,
                            account_id: debitAccountId, // Bank
                            debit: amount,
                            credit: 0,
                            description: transaction.description,
                            status: 'approved'
                        });
                        newEntries.push({
                            transaction_id: id,
                            account_id: creditAccountId, // Income
                            debit: 0,
                            credit: netAmount,
                            description: transaction.description,
                            status: 'approved'
                        });
                        newEntries.push({
                            transaction_id: id,
                            account_id: vatAccountId, // VAT
                            debit: 0,
                            credit: vatAmount,
                            description: 'VAT Output',
                            status: 'approved'
                        });
                    } else {
                        // Expense: Debit Expense (Net), Debit VAT (Tax), Credit Bank (Total)
                        newEntries.push({
                            transaction_id: id,
                            account_id: debitAccountId, // Expense
                            debit: netAmount,
                            credit: 0,
                            description: transaction.description,
                            status: 'approved'
                        });
                        newEntries.push({
                            transaction_id: id,
                            account_id: vatAccountId, // VAT
                            debit: vatAmount,
                            credit: 0,
                            description: 'VAT Input',
                            status: 'approved'
                        });
                        newEntries.push({
                            transaction_id: id,
                            account_id: creditAccountId, // Bank
                            debit: 0,
                            credit: amount,
                            description: transaction.description,
                            status: 'approved'
                        });
                    }
                }
             }
          }

          const { error: insErr } = await supabase.from('transaction_entries').insert(newEntries);
          if (insErr) throw insErr;
          
          finalEntries = newEntries;
        }

        // MANUALLY POST TO LEDGER (Bypassing Trigger Issues)
        // Idempotency: remove previous ledger entries
        await supabase.from("ledger_entries").delete().eq("reference_id", id);
        await supabase.from("ledger_entries").delete().eq("transaction_id", id);

        const ledgerEntries = finalEntries.map((e: any) => ({
            company_id: companyId,
            account_id: e.account_id,
            entry_date: transaction.transaction_date,
            description: e.description || transaction.description,
            debit: e.debit,
            credit: e.credit,
            reference_id: id,
            transaction_id: id,
            entry_type: 'standard' // Explicitly set to allowed type
        }));

        if (ledgerEntries.length > 0) {
            const { error: ledgerError } = await supabase.from("ledger_entries").insert(ledgerEntries);
            if (ledgerError) throw ledgerError;
        }

      } else if (status === 'pending') {
         // If reversing (approved -> pending/unallocated), clean up ledger entries
         await supabase.from("ledger_entries").delete().eq("reference_id", id);
         
         // Also update transaction_entries status
         await supabase
           .from('transaction_entries')
           .update({ status: 'pending' })
           .eq('transaction_id', id);
      }

      const { error: updateError } = await supabase
        .from('transactions')
        .update({ status: status })
        .eq('id', id);

      if (updateError) throw updateError;

      toast({ title: "Success", description: `Transaction marked as ${status}` });
      setRefreshKey(prev => prev + 1);
    } catch (error: any) {
      console.error("Status update error:", error);
      toast({ title: "Error", description: error.message || "Failed to update status", variant: "destructive" });
    } finally {
      setPosting(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleReverse = async (transaction: Transaction) => {
     if (isDateLocked(transaction.transaction_date)) {
        setIsLockDialogOpen(true);
        return;
     }
     if (confirm("Are you sure you want to reverse this transaction? It will be moved back to 'New Transactions'.")) {
        await setTransactionStatus(transaction.id, 'pending');
     }
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesBank = !selectedBankId || t.bank_account_id === selectedBankId;
    const matchesTab =
      activeTab === 'new'
        ? t.status !== 'approved' && t.status !== 'posted'
        : t.status === 'approved' || t.status === 'posted';
    const matchesSearch =
      searchQuery === '' ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.payee && t.payee.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.reference_number && t.reference_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.total_amount.toString().includes(searchQuery);

    return matchesBank && matchesTab && matchesSearch;
  });

  // Reset pagination when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, selectedBankId]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage, 
    currentPage * itemsPerPage
  );

  const selectedBank = bankAccounts.find(b => b.id === selectedBankId);

  const getSmartAccount = (t: Transaction) => {
    // 0. Resolve Bank GL ID to exclude it from display
    const bank = bankAccounts.find(b => b.id === t.bank_account_id || b.id === selectedBankId);
    let bankGLId = '';
    if (bank) {
       const bankGL = accounts.find(a => a.account_name === bank.account_name) || 
                      accounts.find(a => a.account_name === `Bank - ${bank.account_name}`);
       bankGLId = bankGL?.id;
    }

    // 1. If allocated or Pre-Allocated (from Import), show account
    if (t.debit_account_id && t.debit_account_id !== bankGLId) {
       const acc = accounts.find(a => a.id === t.debit_account_id);
       if (acc) return acc.account_name;
    }
    if (t.credit_account_id && t.credit_account_id !== bankGLId) {
       const acc = accounts.find(a => a.id === t.credit_account_id);
       if (acc) return acc.account_name;
    }
    
    // Fallback for legacy allocated transactions
    if ((t.status === 'approved' || t.status === 'posted') && t.category) {
       const acc = accounts.find(a => a.id === t.category);
       if (acc) return acc.account_name;
    }
    
    // 2. Smart Suggestion for Pending (if no pre-allocation found above)
    const text = (t.description + ' ' + (t.payee || '') + ' ' + t.transaction_type).toLowerCase();
    
    // Check for exact account name matches in description first
    const sortedAccounts = [...accounts].sort((a, b) => b.account_name.length - a.account_name.length);
    const exactMatch = sortedAccounts.find(a => text.includes(a.account_name.toLowerCase()));
    if (exactMatch) return exactMatch.account_name;

    const keywords: Record<string, string[]> = {
       'bank charges': ['fee', 'charge', 'service fee', 'admin fee', 'handle', 'monthly acc', 'bank'],
       'interest': ['interest'],
       'rent': ['rent', 'lease', 'rental', 'premises'],
       'salary': ['salary', 'wage', 'payroll', 'staff', 'employee'],
       'sales': ['sale', 'invoice', 'deposit', 'revenue', 'receipt', 'income'],
       'telephone': ['tel', 'phone', 'vodacom', 'mtn', 'cell c', 'telkom', 'mobile', 'data', 'airtime', 'fiber', 'voip'],
       'insurance': ['insure', 'policy', 'premium', 'outsurance', 'santam', 'old mutual', 'discovery', 'momentum', 'avbob'],
       'fuel': ['fuel', 'petrol', 'diesel', 'engen', 'shell', 'caltex', 'bp', 'sasol', 'total'],
       'repairs': ['repair', 'maint', 'service', 'fix', 'parts', 'tyres', 'wheel', 'exhaust'],
       'groceries': ['spar', 'checkers', 'pnp', 'pick n pay', 'woolworths', 'shoprite', 'boxer', 'food lovers', 'clicks', 'dischem'],
       'entertainment': ['restaurant', 'cafe', 'coffee', 'food', 'kfc', 'mcdonalds', 'nandos', 'steers', 'debonairs', 'spur', 'wimpy', 'burger', 'pizza', 'entertainment'],
       'utilities': ['water', 'electricity', 'power', 'eskom', 'municipality', 'rates', 'city of', 'utility'],
       'internet': ['internet', 'fiber', 'adsl', 'lte', 'wifi', 'web', 'hosting', 'domain', 'afrihost', 'webafrica', 'mweb', 'host'],
       'consulting': ['consult', 'service', 'advice', 'professional', 'agency'],
       'travel': ['travel', 'uber', 'bolt', 'flight', 'hotel', 'accommodation', 'airbnb', 'lodge', 'bnb', 'car hire', 'avis', 'budget'],
       'computer': ['software', 'hardware', 'adobe', 'microsoft', 'apple', 'google', 'it support', 'tech', 'cloud'],
       'stationery': ['stationery', 'paper', 'ink', 'toner', 'print', 'makro', 'waltons', 'office', 'supplies'],
       'legal': ['attorney', 'law', 'legal', 'lawyer', 'legal aid'],
       'accounting': ['accountant', 'audit', 'tax', 'sars', 'bookkeep', 'accounting'],
       'marketing': ['facebook', 'instagram', 'linkedin', 'ads', 'promo', 'market', 'advert', 'branding'],
       'security': ['adt', 'security', 'alarm', 'armed', 'response'],
       'cleaning': ['cleaning', 'hygiene', 'pest', 'clean', 'wash'],
       'courier': ['courier', 'delivery', 'postnet', 'dhl', 'fedex', 'aramex', 'fastway', 'paxi'],
       'subscriptions': ['netflix', 'spotify', 'dstv', 'showmax', 'youtube', 'subscription'],
       'vehicle': ['vehicle', 'motor', 'license', 'licence', 'traffic', 'fine', 'toll', 'etoll'],
       'medical': ['doctor', 'dr ', 'medical', 'pharmacy', 'health', 'clinic', 'hospital'],
       'donations': ['donate', 'charity', 'foundation', 'welfare', 'gift'],
       'loans': ['loan', 'repay', 'bond', 'finance'],
       'tax': ['sars', 'vat', 'paye', 'uif', 'sdl', 'tax']
    };

    for (const [accKey, words] of Object.entries(keywords)) {
       if (words.some(w => text.includes(w))) {
          const match = accounts.find(a => a.account_name.toLowerCase().includes(accKey));
          if (match) return match.account_name;
       }
    }

    return '-';
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen font-sans">
      <FinancialYearLockDialog open={isLockDialogOpen} onOpenChange={setIsLockDialogOpen} />
      
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Banking</h1>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 text-xs"
              aria-label="Bank transactions help"
              onClick={() => setHelpOpen(true)}
            >
              !
            </button>
          </div>
          <p className="text-slate-500 text-sm mt-1">Manage and allocate your bank transactions</p>
        </div>
        <div className="flex gap-3">
           <div className="relative">
             <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
             <Input
               type="text"
               placeholder="Search transactions..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="pl-9 w-[250px] bg-white border-slate-200 focus:ring-blue-500"
             />
           </div>
           <CSVImport 
             bankAccounts={bankAccounts}
             onImportComplete={() => setRefreshKey(prev => prev + 1)}
           />
        </div>
      </div>

      <Dialog
        open={helpOpen}
        onOpenChange={(open) => {
          setHelpOpen(open);
          if (!open) setHelpStep(1);
        }}
      >
        <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>How to use the Bank Transactions module</DialogTitle>
              <div className="flex items-center gap-2">
                <img
                  src="/logo.png"
                  alt="System logo"
                  className="h-7 w-auto rounded-sm shadow-sm"
                />
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>
                Step {helpStep} of {totalHelpSteps}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: totalHelpSteps }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-4 rounded-full ${i + 1 === helpStep ? "bg-blue-600" : "bg-slate-200"}`}
                  />
                ))}
              </div>
            </div>

            {helpStep === 1 && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                      Overview
                    </div>
                    <ul className="list-disc list-inside space-y-1">
                      <li>View bank transactions by account and status.</li>
                      <li>Allocate deposits and payments to income, expenses, customers, suppliers or loans.</li>
                      <li>Import new transactions from CSV or bank feeds.</li>
                      <li>Keep your bank, VAT and general ledger aligned.</li>
                    </ul>
                  </div>
                  <div className="rounded-md border bg-white p-3 shadow-sm">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Screen layout (preview)
                    </div>
                    <div className="space-y-2 text-[10px]">
                      <div className="h-6 rounded bg-slate-100 flex items-center px-2 text-slate-500">
                        Banking – Manage and allocate your bank transactions
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[9px] text-slate-500">
                            !
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Tutorial
                          </span>
                        </div>
                        <div className="h-6 px-2 rounded border bg-white flex items-center text-[10px]">
                          Import CSV ▾
                        </div>
                      </div>
                      <div className="h-12 rounded bg-slate-50 border border-dashed flex items-center justify-center mt-2">
                        Bank account selector, balance and status card
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {helpStep === 2 && (
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Choose the correct bank account
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Use the Bank Account dropdown to pick which bank you are working on.</li>
                      <li>The balance on the right shows the current ledger balance for that account.</li>
                      <li>Make sure this matches your real bank statement before you start reconciling.</li>
                      <li>You can switch between accounts at any time while keeping your allocations.</li>
                    </ul>
                  </div>
                  <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Bank selector (preview)
                    </div>
                    <div className="space-y-1">
                      <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                        Bank Account: ABSA - Business Cheque
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-slate-500 uppercase tracking-wide">Current Balance</span>
                        <span className="font-mono font-semibold text-slate-800">R 125 430.00</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {helpStep === 3 && (
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Import bank transactions
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Use the Import CSV button to bring in transactions from your bank.</li>
                      <li>Your CSV normally includes date, description, reference and amount.</li>
                      <li>Once imported, new transactions appear under the “New Transactions” tab.</li>
                      <li>Each line can then be allocated to the correct account and VAT code.</li>
                    </ul>
                  </div>
                  <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Import (preview)
                    </div>
                    <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                      Drag & drop or select CSV file from bank
                    </div>
                  </div>
                </div>
              </div>
            )}

            {helpStep === 4 && (
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  New vs Reviewed transactions
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Use the tabs to switch between “New Transactions” and “Reviewed Transactions”.</li>
                      <li>New transactions are unallocated or not yet posted to the ledger.</li>
                      <li>Reviewed transactions have been allocated and posted, but can still be reversed.</li>
                      <li>The “To Review” card shows how many items still need your attention.</li>
                    </ul>
                  </div>
                  <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Tabs (preview)
                    </div>
                    <div className="flex gap-3">
                      <div className="px-3 py-1.5 rounded border-b-2 border-blue-600 text-blue-700 text-[11px]">
                        New Transactions
                      </div>
                      <div className="px-3 py-1.5 rounded border-b-2 border-transparent text-slate-500 text-[11px]">
                        Reviewed Transactions
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {helpStep === 5 && (
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Understanding the transaction table
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Date and description come from your bank statement or manual captures.</li>
                      <li>The Type pill shows whether a line is Unallocated, a Receipt or a Payment.</li>
                      <li>Account shows the linked ledger account once the transaction is allocated.</li>
                      <li>VAT, Excl and Incl columns help you confirm tax treatment before posting.</li>
                    </ul>
                  </div>
                  <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Table (preview)
                    </div>
                    <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                      Date • Description • Type • Account • VAT • Amount
                    </div>
                  </div>
                </div>
              </div>
            )}

            {helpStep === 6 && (
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Allocating a transaction
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Use the Action menu on a line and choose Allocate.</li>
                      <li>Select whether it is income, expense, customer receipt, supplier payment or salary.</li>
                      <li>Pick the correct ledger account, VAT rate and description.</li>
                      <li>When you save, the transaction is posted and moves to Reviewed if fully allocated.</li>
                    </ul>
                  </div>
                  <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Allocate (preview)
                    </div>
                    <div className="space-y-1">
                      <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                        Type: Income • Account: Sales • VAT: 15%
                      </div>
                      <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                        Description: Customer EFT – Invoice 123
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {helpStep === 7 && (
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Linking to customers and suppliers
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <ul className="list-disc list-inside space-y-1">
                      <li>You can allocate directly against open customer invoices and supplier bills.</li>
                      <li>Select the customer or supplier and then pick the invoice or bill from the list.</li>
                      <li>This marks the document as paid and keeps your age analysis up to date.</li>
                      <li>Use this instead of manual journals for clean audit trails.</li>
                    </ul>
                  </div>
                  <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Customer / supplier allocation (preview)
                    </div>
                    <div className="space-y-1">
                      <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                        Customer: ABC Trading • Invoice: INV-1023
                      </div>
                      <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                        Supplier: Office World • Bill: BILL-55
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {helpStep === 8 && (
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Salary payments and loans
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Salary payments captured here should be linked to payroll runs, not expensed twice.</li>
                      <li>Use the employee allocation options to match payments to employees.</li>
                      <li>Loan receipts and repayments can be linked to specific loan records for tracking.</li>
                      <li>This keeps your payroll and loan balances in sync with your bank.</li>
                    </ul>
                  </div>
                  <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Payroll / loans (preview)
                    </div>
                    <div className="space-y-1">
                      <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                        Employee: J Smith • August Salary
                      </div>
                      <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                        Loan: Shareholder Loan • Repayment
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {helpStep === 9 && (
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Reversals and date locks
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Use the Reverse button on reviewed transactions to correct mistakes.</li>
                      <li>Reversals create proper accounting entries instead of editing history.</li>
                      <li>If a financial year is locked, you will not be able to post into that period.</li>
                      <li>Use this to protect signed-off periods from accidental changes.</li>
                    </ul>
                  </div>
                  <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Reverse and locks (preview)
                    </div>
                    <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                      Reverse button • Year lock warning banner
                    </div>
                  </div>
                </div>
              </div>
            )}

            {helpStep === 10 && (
              <div className="space-y-6">
                <div className="flex flex-col items-center justify-center text-center space-y-3 py-4">
                  <img
                    src="/logo.png"
                    alt="System logo"
                    className="h-12 w-auto rounded-md shadow-sm mb-1"
                  />
                  <div className="text-lg font-semibold text-slate-900">
                    Thank you
                  </div>
                  <p className="max-w-md text-sm text-slate-600">
                    This Bank Transactions tutorial is designed to help you allocate and reconcile your bank quickly and accurately.
                    We look forward to supporting your cash and bank control over the next couple of years.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-700 disabled:opacity-40"
                onClick={prevHelpStep}
                disabled={helpStep === 1}
              >
                Previous
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-700"
                  onClick={() => setHelpOpen(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-40"
                  onClick={helpStep === totalHelpSteps ? () => setHelpOpen(false) : nextHelpStep}
                >
                  {helpStep === totalHelpSteps
                    ? "Close"
                    : helpStep === totalHelpSteps - 1
                    ? "Finish"
                    : "Next"}
                </button>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-slate-400 text-right">
              stella-lumen
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Control Row */}
      <Card className="border border-slate-200 shadow-sm bg-white rounded-xl">
        <CardContent className="p-0">
          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {/* Left: Bank Selector */}
            <div className="p-4 w-full md:w-1/3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Bank Account</label>
              <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                <SelectTrigger className="h-9 bg-slate-50 border-slate-200 focus:ring-blue-500 text-slate-700 font-medium text-sm">
                  <SelectValue placeholder="Select Bank Account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.bank_name} - {b.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Center: Balance */}
            <div className="p-4 flex-1 flex flex-col justify-center">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Current Balance</span>
              <div className="text-2xl font-bold text-slate-800 tracking-tight">
                {selectedBank?.currency || 'R'} {currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Right: Status Card */}
            <div className="p-4 w-full md:w-auto min-w-[240px] flex items-center gap-4 bg-slate-50/50">
              <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <FileText className="h-4.5 w-4.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">To Review</span>
                <div className="text-lg font-bold text-slate-800">
                  {transactions.filter(t => t.status !== 'approved' && t.status !== 'posted').length} <span className="text-xs font-normal text-slate-400">transactions</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Navigation & Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="bg-transparent p-0 h-auto w-full justify-start border-b border-slate-200 rounded-none gap-8">
          <TabsTrigger 
            value="new" 
            className="h-11 px-1 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none text-slate-500 hover:text-slate-700 transition-all font-medium text-sm"
          >
            New Transactions
          </TabsTrigger>
          <TabsTrigger 
            value="reviewed" 
            className="h-11 px-1 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none text-slate-500 hover:text-slate-700 transition-all font-medium text-sm"
          >
            Reviewed Transactions
          </TabsTrigger>
        </TabsList>

        <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white rounded-xl">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-700 border-b border-slate-800 sticky top-0 z-10">
                <TableRow className="border-none hover:bg-transparent">
                  <TableHead className="w-8 pl-3 p-2 text-white"><Checkbox /></TableHead>
                  <TableHead className="w-24 font-semibold text-white p-2">Date</TableHead>
                  <TableHead className="min-w-[200px] font-semibold text-white p-2">Description</TableHead>
                  <TableHead className="w-24 font-semibold text-white p-2">Type</TableHead>
                  <TableHead className="min-w-[150px] font-semibold text-white p-2">Account</TableHead>
                  <TableHead className="text-right w-20 font-semibold text-white p-2">VAT</TableHead>
                  {activeTab !== 'new' && <TableHead className="text-right w-24 font-semibold text-white p-2">Excl</TableHead>}
                  <TableHead className="text-right w-24 font-semibold text-white p-2">Incl</TableHead>
                  <TableHead className="w-24 text-center font-semibold text-white p-2">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-slate-100">
                      <TableCell className="pl-3 p-2"><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell className="p-2"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="p-2"><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell className="p-2"><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                      <TableCell className="p-2"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="text-right p-2"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      {activeTab !== 'new' && <TableCell className="text-right p-2"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>}
                      <TableCell className="text-right p-2"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell className="p-2"><Skeleton className="h-8 w-16 mx-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={activeTab === 'new' ? 8 : 9} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                          <FileText className="h-6 w-6 text-slate-300" />
                        </div>
                        <p className="text-base font-medium text-slate-600">No transactions found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTransactions.map((t, index) => (
                    <TableRow
                      key={t.id}
                      className={cn(
                        "group hover:bg-slate-50 transition-colors border-slate-100",
                        index % 2 === 0 ? "bg-white" : "bg-slate-100"
                      )}
                    >
                      <TableCell className="pl-3 p-2"><Checkbox className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" /></TableCell>
                      <TableCell className="text-slate-600 font-medium text-xs p-2">{format(new Date(t.transaction_date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="p-2">
                        <div className="flex flex-col py-0.5">
                          <span className="font-medium text-slate-800 text-xs truncate max-w-[200px]" title={t.description}>{t.description}</span>
                          {t.payee && <span className="text-[10px] text-slate-500">{t.payee}</span>}
                          {(t.status === 'approved' || t.status === 'posted') && (
                             <span className="text-[10px] text-emerald-600 flex items-center mt-0.5"><CheckCircle className="h-2.5 w-2.5 mr-1" /> Reviewed</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="p-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize
                          ${(t.status === 'pending' || !t.transaction_type)
                            ? 'bg-amber-50 text-amber-700 border border-amber-100'
                            : t.total_amount > 0 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                          {(t.status === 'pending' || !t.transaction_type) ? 'Unallocated' : t.transaction_type.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs p-2">
                      {(() => {
                         const acc = getSmartAccount(t);
                         // Only show the account if it's explicitly allocated or approved/posted
                         const showAccount = t.status === 'approved' || t.status === 'posted';
                         
                         return (
                            <span className={cn(
                               "font-medium truncate block max-w-[150px]",
                               showAccount ? "text-slate-800" : "text-slate-400 italic"
                            )}>
                               {showAccount ? acc : 'No Account'}
                            </span>
                         );
                      })()}
                    </TableCell>
                    <TableCell className="text-right font-medium font-mono text-xs text-slate-600 p-2">
                        {(() => {
                           const val = t.vat_amount || (t.vat_rate > 0 ? (Math.abs(t.total_amount) * t.vat_rate / (100 + t.vat_rate)) : 0);
                           return val > 0 ? val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
                        })()}
                      </TableCell>
                      {activeTab !== 'new' && (
                        <TableCell className="text-right font-medium font-mono text-xs text-slate-600 p-2">
                          {(() => {
                             const vat = t.vat_amount || (t.vat_rate > 0 ? (Math.abs(t.total_amount) * t.vat_rate / (100 + t.vat_rate)) : 0);
                             const base = t.base_amount || (Math.abs(t.total_amount) - vat);
                             return base.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                          })()}
                        </TableCell>
                      )}
                      <TableCell className={cn("text-right font-medium font-mono text-xs p-2", t.total_amount < 0 ? "text-red-600" : "text-emerald-600")}>
                        {Math.abs(t.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center p-2">
                        {activeTab === 'new' ? (
                          <div className="flex items-center justify-end gap-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-medium text-slate-700">
                                  Action <ChevronDown className="ml-1 h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleAllocateClick(t)}>
                                  <FileText className="mr-2 h-4 w-4" /> Allocate
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditClick(t)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <Button 
                               size="sm" 
                               className="h-6 w-6 rounded-full bg-red-600 hover:bg-red-700 text-white p-0 shadow-sm flex items-center justify-center border-none"
                               onClick={handleInsertClick}
                               title="Insert Transaction"
                             >
                               <Plus className="h-4 w-4" />
                             </Button>
                          </div>
                        ) : (
                           <Button 
                             size="sm" 
                             variant="ghost" 
                             className="h-8 w-full text-slate-500 hover:text-amber-600 hover:bg-amber-50"
                             onClick={() => handleReverse(t)}
                           >
                             <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Reverse
                           </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            
            {/* Pagination Footer */}
            {filteredTransactions.length > 0 && (
               <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/50">
                  <div className="text-xs text-slate-500 font-medium">
                     Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} results
                  </div>
                  <div className="flex items-center gap-2">
                     <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="h-8 w-8 p-0"
                     >
                        <ChevronLeft className="h-4 w-4" />
                     </Button>
                     <div className="text-xs font-medium text-slate-700">
                        Page {currentPage} of {totalPages}
                     </div>
                     <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="h-8 w-8 p-0"
                     >
                        <ChevronRight className="h-4 w-4" />
                     </Button>
                  </div>
               </div>
            )}
          </div>
        </Card>
      </Tabs>

      {/* Allocation Dialog */}
      <Dialog open={allocationOpen} onOpenChange={setAllocationOpen}>
          <DialogContent className="sm:max-w-[900px] border-none shadow-2xl p-0 overflow-hidden gap-0">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
            
            <div className="grid md:grid-cols-5 h-full">
              {/* Left Side: Summary & Basics */}
              <div className="md:col-span-2 bg-muted/30 p-6 border-r flex flex-col gap-6">
                 <div className="flex items-center gap-3 pb-4 border-b border-primary/10">
                    <img src="/logo.png" alt="Rigel" className="h-10 w-auto object-contain" />
                    <span className="font-bold text-xl tracking-tight text-primary">Rigel Business</span>
                 </div>

                 <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary shadow-sm border border-primary/20">
                      <SlidersHorizontal className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-lg leading-tight">{isInsertMode ? 'New Transaction' : 'Allocation'}</h2>
                      <p className="text-xs text-muted-foreground">{isInsertMode ? 'Create a new transaction' : 'Categorize this transaction'}</p>
                    </div>
                 </div>

                 <Card className="shadow-sm border-primary/20 bg-background/50">
                    <CardHeader className="p-4 pb-2">
                       <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Amount</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                       {isInsertMode ? (
                          <Input 
                            type="number" 
                            value={allocAmount} 
                            onChange={(e) => setAllocAmount(e.target.value)} 
                            className="text-2xl font-bold text-primary h-12 bg-white" 
                            placeholder="0.00"
                            step="0.01"
                          />
                       ) : (
                          <div className="text-3xl font-bold text-primary tabular-nums tracking-tight">
                            R {Number(allocationTx?.total_amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                          </div>
                       )}
                    </CardContent>
                 </Card>

                 <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase text-muted-foreground">Allocation Date</Label>
                      <div className="relative">
                         <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                         <Input type="date" value={allocDate} onChange={(e) => setAllocDate(e.target.value)} className="pl-9 bg-background" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase text-muted-foreground">Description</Label>
                      <Textarea 
                        value={allocDesc} 
                        onChange={(e) => setAllocDesc(e.target.value)} 
                        placeholder="Enter description..." 
                        className="bg-background resize-none min-h-[80px]" 
                      />
                    </div>
                 </div>
              </div>

              {/* Right Side: Allocation Logic */}
              <div className="md:col-span-3 p-6 space-y-6 bg-background">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <Label className="flex items-center gap-2">
                          <Filter className="h-3.5 w-3.5 text-primary" />
                          Allocation Type
                       </Label>
                       <Select value={allocType} onValueChange={(v: any) => {
                          setAllocType(v);
                          setAllocEntityId('');
                          setAllocDocId('');
                          setOpenBills([]);
                          setOpenInvoices([]);
                          setAllocations({});
                          setAllocEmployeeId('');
                       }}>
                        <SelectTrigger className="bg-muted/10 border-muted-foreground/20 h-10">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          <SelectItem value="income">Income Received</SelectItem>
                          <SelectItem value="expense">Expense Payment</SelectItem>
                          <SelectItem value="loan_repayment">Loan Repayment</SelectItem>
                          <SelectItem value="supplier_payment">Supplier</SelectItem>
                          <SelectItem value="customer_receipt">Customer</SelectItem>
                          <SelectItem value="loan_interest">Loan Interest</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                       <Label className="flex items-center gap-2">
                          <CreditCard className="h-3.5 w-3.5 text-primary" />
                          Payment Method
                       </Label>
                       <Select value="cash" disabled>
                        <SelectTrigger className="bg-muted/10 border-muted-foreground/20 h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash / Bank</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                 </div>

                 {allocPayment === 'cash' && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <Label className="flex items-center gap-2">
                         <Wallet className="h-3.5 w-3.5 text-primary" />
                         Bank Account (Locked)
                      </Label>
                      <Select value={allocBankId} disabled>
                        <SelectTrigger className="bg-muted/10 border-muted-foreground/20 h-10 opacity-70 cursor-not-allowed">
                          <SelectValue placeholder="Select Bank Account" />
                          <Lock className="h-3 w-3 ml-2 text-muted-foreground" />
                        </SelectTrigger>
                        <SelectContent>
                          {bankAccounts.map(b => (
                            <SelectItem key={b.id} value={String(b.id)}>{b.bank_name} ({b.account_number})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                 )}

                 {(allocType === 'loan_interest' || allocType === 'loan_repayment' || allocType === 'loan_received') && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                       <Label className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          Select Loan
                       </Label>
                       <Select value={allocLoanId} onValueChange={(v: any) => setAllocLoanId(v)}>
                          <SelectTrigger className="bg-muted/10 border-muted-foreground/20 h-10"><SelectValue placeholder="Select Loan..." /></SelectTrigger>
                          <SelectContent>
                             {loans.map(loan => (
                                <SelectItem key={loan.id} value={loan.id}>
                                   {loan.reference} - Bal: {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(loan.outstanding_balance)}
                                </SelectItem>
                             ))}
                          </SelectContent>
                       </Select>
                    </div>
                 )}

                 {(allocType === 'supplier_payment' || allocType === 'customer_receipt') && (
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                       <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                             <Briefcase className="h-3.5 w-3.5 text-primary" />
                             {allocType === 'supplier_payment' ? 'Select Supplier' : 'Select Customer'}
                          </Label>
                          <AccountCombobox 
                             accounts={allocType === 'supplier_payment' ? 
                                suppliers.map(s => ({ id: s.id, account_code: '', account_name: s.name, account_type: 'supplier' })) : 
                                customers.map(c => ({ id: c.id, account_code: '', account_name: c.customer_name, account_type: 'customer' }))
                             }
                             value={allocEntityId}
                             onChange={(v) => {
                                setAllocEntityId(v);
                                setAllocations({});
                                setAllocDocId('');
                             }}
                             placeholder={allocType === 'supplier_payment' ? "Search Supplier..." : "Search Customer..."}
                          />
                       </div>

                       <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                             <FileText className="h-3.5 w-3.5 text-primary" />
                             {allocType === 'supplier_payment' ? 'Select Supplier Invoices' : 'Select Invoice'}
                          </Label>
                          {allocType === 'supplier_payment' ? (
                             <div className="flex gap-2">
                                <Button 
                                   variant="outline" 
                                   className="w-full justify-between bg-muted/10 border-muted-foreground/20 h-10"
                                   onClick={() => setAllocationModalOpen(true)}
                                   disabled={!allocEntityId || loadingDocs}
                                >
                                   {Object.keys(allocations).length > 0 
                                      ? `${Object.keys(allocations).length} Invoices Selected (${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Object.values(allocations).reduce((a, b) => a + b, 0))})`
                                      : "Select Invoices..."}
                                   <FileText className="h-4 w-4 opacity-50" />
                                </Button>
                             </div>
                          ) : (
                             <Select value={allocDocId} onValueChange={setAllocDocId} disabled={!allocEntityId || loadingDocs}>
                               <SelectTrigger className="bg-muted/10 border-muted-foreground/20 h-10">
                                  <SelectValue placeholder={loadingDocs ? "Loading..." : "Select Invoice..."} />
                               </SelectTrigger>
                               <SelectContent>
                                   {openInvoices.length === 0 ? <SelectItem value="none" disabled>No open invoices</SelectItem> :
                                   openInvoices.map(i => (
                                      <SelectItem key={i.id} value={i.id}>
                                         {i.invoice_number} - Total: {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(i.total_amount)}
                                      </SelectItem>
                                   ))}
                               </SelectContent>
                             </Select>
                          )}
                      </div>
                    </div>
                 )}

                 {allocType === 'employee_salary' && (
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-primary" />
                          Select Employee
                        </Label>
                        <AccountCombobox
                          accounts={employees.map(e => ({
                            id: e.id,
                            account_code: e.employee_number || 'EMP',
                            account_name: `${e.first_name || ''} ${e.last_name || ''}`.trim() || e.employee_number || 'Employee',
                            account_type: 'employee',
                          }))}
                          value={allocEmployeeId}
                          onChange={setAllocEmployeeId}
                          placeholder="Search Employee..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          Net Salary Allocation
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Use this to allocate the payment against the employee net salary (wages payable).
                        </p>
                      </div>
                    </div>
                 )}

                 <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                       <BookOpen className="h-3.5 w-3.5 text-primary" />
                       {allocType === 'income' ? 'Income Account' : 
                        allocType === 'expense' ? 'Expense Account' :
                        allocType === 'asset_purchase' ? 'Asset Account' :
                        allocType === 'asset_disposal' ? 'Asset Account' :
                        allocType === 'loan_received' ? 'Liability Account' :
                        allocType === 'loan_repayment' ? 'Liability Account' :
                        allocType === 'loan_interest' ? 'Interest Expense Account' :
                        allocType === 'equity' ? 'Equity Account' :
                        allocType === 'receivable_collection' ? 'Receivable Account' :
                        allocType === 'liability_payment' ? 'Liability Account' :
                        allocType === 'employee_salary' ? 'Employee Net Salary Account' :
                        'Account'}
                    </Label>
                    <AccountCombobox 
                       accounts={
                         allocType === 'income' ? coaIncome : 
                         allocType === 'expense' ? coaExpense :
                         allocType === 'asset_purchase' ? coaAssets :
                         allocType === 'asset_disposal' ? coaAssets :
                         allocType === 'loan_received' ? coaLiabilities :
                         allocType === 'loan_repayment' ? coaLiabilities :
                         allocType === 'loan_interest' ? coaExpense :
                         allocType === 'equity' ? coaEquity :
                         allocType === 'receivable_collection' ? coaReceivable :
                         allocType === 'liability_payment' ? coaPayable :
                         allocType === 'employee_salary' ? coaPayable :
                         coaOther
                       }
                       value={allocAccountId}
                       onChange={setAllocAccountId}
                       placeholder="Select Account..."
                       disabled={allocType === 'loan_interest' || allocType === 'loan_repayment' || allocType === 'employee_salary'}
                    />
                 </div>

                 <div className="p-4 rounded-lg bg-muted/20 border border-dashed border-muted-foreground/20 space-y-3">
                    <Label className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                      <Percent className="h-3.5 w-3.5 text-primary" />
                      VAT Selection
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button 
                        type="button" 
                        variant={allocVatOn === 'yes' && Number(allocVatRate) === 15 ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => { setAllocVatOn('yes'); setAllocVatRate('15'); }}
                        className={cn("h-9 text-xs", allocVatOn === 'yes' && Number(allocVatRate) === 15 ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
                      >
                        Standard (15%)
                      </Button>
                      <Button 
                        type="button" 
                        variant={allocVatOn === 'yes' && Number(allocVatRate) === 0 ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => { setAllocVatOn('yes'); setAllocVatRate('0'); }}
                        className={cn("h-9 text-xs", allocVatOn === 'yes' && Number(allocVatRate) === 0 ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
                      >
                        Zero (0%)
                      </Button>
                      <Button 
                        type="button" 
                        variant={allocVatOn === 'no' ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => { setAllocVatOn('no'); setAllocVatRate('0'); }}
                        className={cn("h-9 text-xs", allocVatOn === 'no' ? "bg-slate-700 text-white hover:bg-slate-800" : "bg-background hover:bg-muted")}
                      >
                        No VAT / Exempt
                      </Button>
                    </div>
                    
                    {allocVatOn === 'yes' && Number(allocVatRate) > 0 && (
                       <div className="flex items-center justify-between p-3 rounded-md bg-background border shadow-sm animate-in fade-in zoom-in-95 duration-200">
                          <span className="text-xs text-muted-foreground font-medium">VAT Amount ({allocVatRate}%):</span>
                          <span className="font-mono text-sm font-bold text-primary">
                             R {((Number(allocationTx?.total_amount || 0) * Number(allocVatRate || 0)) / (100 + Number(allocVatRate || 0))).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                       </div>
                    )}
                 </div>

                 {allocPayment === 'accrual' && (
                    <div className="space-y-4 pt-2 border-t animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <Label>Settlement Type</Label>
                           <Select value={allocSettlement} onValueChange={(v: any) => setAllocSettlement(v)}>
                            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="receivable">Receivable</SelectItem>
                              <SelectItem value="payable">Payable</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                         </div>
                         <div className="space-y-2">
                            <Label>{allocSettlement === 'receivable' ? 'Receivable Account' : allocSettlement === 'payable' ? 'Payable Account' : 'Other Account'}</Label>
                            <AccountCombobox 
                               accounts={allocSettlement === 'receivable' ? coaReceivable : allocSettlement === 'payable' ? coaPayable : coaOther}
                               value={allocSettlementAccountId}
                               onChange={setAllocSettlementAccountId}
                               placeholder="Select Settlement Account..."
                            />
                         </div>
                      </div>
                    </div>
                 )}
              </div>
            </div>

            <DialogFooter className="p-4 bg-muted/10 border-t flex-col gap-2 sm:gap-0">
              <div className="flex w-full items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setAllocationOpen(false)} disabled={allocationTx && posting[allocationTx.id]}>Cancel</Button>
                <Button onClick={async () => {
                // Capture all necessary state variables in local scope
                let currentAllocationTx = allocationTx;
                let txId = currentAllocationTx?.id;

                if (isInsertMode) {
                   if (!allocAmount || Number(allocAmount) <= 0) {
                      toast({ title: "Amount Required", description: "Please enter a valid amount.", variant: "destructive" });
                      return;
                   }
                   if (!allocBankId) {
                      toast({ title: "Bank Required", description: "Please select a bank account.", variant: "destructive" });
                      return;
                   }
                   
                   const incomeTypes = ['income', 'asset_disposal', 'loan_received', 'equity', 'receivable_collection', 'customer_receipt'];
                   const isIncome = incomeTypes.includes(allocType);
                   const amount = Number(allocAmount);
                   const signedAmount = isIncome ? amount : -amount;

                   const { data: user } = await supabase.auth.getUser();
                   if (!user.user) {
                       toast({ title: "Error", description: "User not authenticated", variant: "destructive" });
                       return;
                   }
                   
                   const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.user.id).single();
                   if (!profile?.company_id) {
                       toast({ title: "Error", description: "Company context not found", variant: "destructive" });
                       return;
                   }

                   try {
                       const { data: newTx, error: insertError } = await supabase.from('transactions').insert({
                          company_id: profile.company_id,
                          user_id: user.user.id,
                          transaction_date: allocDate,
                          description: allocDesc || 'New Transaction',
                          total_amount: signedAmount,
                          base_amount: amount,
                          transaction_type: isIncome ? 'receipt' : 'payment',
                          status: 'pending',
                          bank_account_id: allocBankId,
                          reference_number: isIncome ? 'DEP' : 'PMT'
                       } as any).select().single();

                       if (insertError) throw insertError;
                       currentAllocationTx = newTx;
                       txId = newTx.id;
                   } catch (e: any) {
                       console.error(e);
                       toast({ title: "Creation Failed", description: e.message, variant: "destructive" });
                       return;
                   }
                }

                if (!currentAllocationTx || !txId) return;
                
                if (allocPayment === 'cash' && !allocBankId) { toast({ title: "Bank Required", description: "Please select a bank account.", variant: "destructive" }); return; }
                if (!allocAccountId) { toast({ title: "Account Required", description: "Please select an account for this transaction.", variant: "destructive" }); return; }
                if (allocPayment === 'accrual' && !allocSettlementAccountId) { toast({ title: "Settlement Account Required", description: "Please select a settlement account.", variant: "destructive" }); return; }
                if ((allocType === 'loan_interest' || allocType === 'loan_repayment') && !allocLoanId) { toast({ title: "Loan Required", description: "Please select a loan.", variant: "destructive" }); return; }
                if ((allocType === 'supplier_payment' || allocType === 'customer_receipt') && !allocDocId && Object.keys(allocations).length === 0) { toast({ title: "Document Required", description: "Please select an invoice or bill.", variant: "destructive" }); return; }

                // Date Validation for Supplier Payments
                if (allocType === 'supplier_payment') {
                  const paymentDate = new Date(allocDate);
                  let hasDateError = false;
          
                  // Check single selection
                  if (allocDocId) {
                      const doc = openBills.find(b => b.id === allocDocId);
                      if (doc && doc.bill_date) {
                          if (paymentDate < new Date(doc.bill_date)) {
                              hasDateError = true;
                          }
                      }
                  }
          
                  // Check multiple selections
                  const allocatedIds = Object.keys(allocations);
                  for (const id of allocatedIds) {
                       const doc = openBills.find(b => b.id === id);
                       if (doc && doc.bill_date) {
                          if (paymentDate < new Date(doc.bill_date)) {
                              hasDateError = true;
                          }
                       }
                  }
          
                  if (hasDateError) {
                      setShowDateWarning(true);
                      return;
                  }
                }

                // Optimistic UI updates
                setPosting(prev => ({ ...prev, [txId]: true }));
                setAllocationOpen(false);
                toast({ title: "Posting Started", description: "Allocation is being processed in the background. You can continue working." });

                // Define the async operation
                const processTransaction = async () => {
                  if (isDateLocked(allocDate)) {
                    setIsLockDialogOpen(true);
                    setPosting(prev => ({ ...prev, [txId]: false }));
                    setAllocationOpen(false);
                    return;
                  }

                  try {
                    const isReceipt = ['income', 'asset_disposal', 'loan_received', 'equity', 'receivable_collection', 'customer_receipt'].includes(allocType);
                    const total = Math.abs(Number(currentAllocationTx?.total_amount || 0));
                    let debitAccount = '';
                    let creditAccount = '';
                    
                    if (allocPayment === 'cash') {
                      // Find GL Account for Bank
                      const bankName = bankAccounts.find(b => String(b.id) === String(allocBankId))?.account_name;
                      let bankGL = accounts.find(a => a.account_name === bankName);
                      if (!bankGL) {
                         bankGL = accounts.find(a => (a.account_type === 'asset' || a.account_type === 'bank' || a.account_type === 'cash') && a.account_name.toLowerCase().includes('bank'));
                      }
                      
                      const bankGLId = bankGL?.id;
                      if (!bankGLId) {
                         throw new Error("Could not find a GL Account for the selected Bank. Please check Chart of Accounts.");
                      }

                      if (isReceipt) { debitAccount = bankGLId; creditAccount = allocAccountId; }
                      else { debitAccount = allocAccountId; creditAccount = bankGLId; }
                    } else {
                      const settleId = allocSettlementAccountId;
                      if (isReceipt) { debitAccount = settleId; creditAccount = allocAccountId; }
                      else { debitAccount = allocAccountId; creditAccount = settleId; }
                    }

                    if (allocType === 'supplier_payment') {
                         const entriesList = Object.entries(allocations);
                         if (entriesList.length === 0 && allocDocId) entriesList.push([allocDocId, total]);

                         let lastSupplierId: string | null = allocEntityId || null;

                         for (let i = 0; i < entriesList.length; i++) {
                             const [billId, amount] = entriesList[i];
                             const doc = openBills.find(b => b.id === billId);
                             let bill: any = null;
                             let docType = 'bill';

                             if (doc && doc.doc_type === 'po') {
                                docType = 'po';
                                const { data } = await supabase.from('purchase_orders').select('*').eq('id', billId).single();
                                if (data) {
                                    bill = { ...data, bill_number: data.po_number };
                                }
                             } else {
                                const { data } = await supabase.from('bills').select('*').eq('id', billId).single();
                                bill = data;
                             }
                             
                             if (!bill) continue;
                             lastSupplierId = bill.supplier_id;

                             // IMPORTANT: Use PO Number as reference if available, to ensure Creditors Control (which tracks POs) picks it up.
                             // We still mention the Bill Number in description.
                             const effectiveRef = bill.po_number || bill.bill_number;
                             const description = bill.po_number && bill.po_number !== bill.bill_number 
                                ? `Payment for ${bill.bill_number} (Ref: ${bill.po_number})`
                                : `Payment for ${bill.bill_number}`;

                             let currentTxId = txId;
                             if (i > 0) {
                                 const { data: newTx } = await supabase.from('transactions').insert({
                                  company_id: currentAllocationTx.company_id,
                                  transaction_date: allocDate,
                                  description: description,
                                  total_amount: -Math.abs(amount),
                                  base_amount: Math.abs(amount),
                                  reference_number: effectiveRef,
                                  status: 'approved',
                                     transaction_type: 'payment',
                                  bank_account_id: allocBankId,
                                   debit_account_id: debitAccount,
                                   credit_account_id: creditAccount,
                                   user_id: currentAllocationTx.user_id,
                                   supplier_id: bill.supplier_id
                                } as any).select().single();
                                 if (newTx) currentTxId = newTx.id;
                             } else {
                                 await supabase.from('transactions').update({
                                    transaction_date: allocDate,
                                    description: description,
                                    base_amount: Math.abs(amount),
                                    total_amount: -Math.abs(amount),
                                    reference_number: effectiveRef,
                                    status: 'posted',
                                    transaction_type: 'payment',
                                    bank_account_id: allocBankId,
                                     debit_account_id: debitAccount,
                                     credit_account_id: creditAccount,
                                     supplier_id: bill.supplier_id
                                 } as any).eq('id', txId);
                             }

                             await supabase.from('transaction_entries').delete().eq('transaction_id', currentTxId);

                             const entries = [
                                {
                                    transaction_id: currentTxId,
                                    account_id: debitAccount,
                                    debit: amount,
                                    credit: 0,
                                    description: description,
                                   status: 'approved'
                               },
                               {
                                   transaction_id: currentTxId,
                                   account_id: creditAccount,
                                   debit: 0,
                                   credit: amount,
                                   description: description,
                                   status: 'approved'
                               }
                            ];
                            
                            await supabase.from('transaction_entries').insert(entries);

                            const { data: relTxs } = await supabase.from('transactions')
                               .select('base_amount, total_amount')
                               .eq('reference_number', effectiveRef)
                               .eq('transaction_type', 'payment')
                               .in('status', ['posted', 'approved'])
                               .neq('id', currentTxId);
                            
                            const priorPaid = (relTxs || []).reduce((sum, t) => sum + (Number(t.base_amount) || Math.abs(Number(t.total_amount)) || 0), 0);
                            const totalPaidNow = priorPaid + amount;

                            console.log(`Updating Bill/PO Status. Ref: ${effectiveRef}, Prior: ${priorPaid}, Current: ${amount}, Total: ${totalPaidNow}, Bill Total: ${bill.total_amount}`);
                            
                            if (docType === 'po') {
                                const newStatus = totalPaidNow >= (bill.total_amount - 1) ? 'paid' : 'partially_paid';
                                await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', billId);
                                
                                // Also update any linked Bills/Supplier Invoices
                                const searchPoNum = bill.po_number || bill.bill_number;
                                const { data: linkedBills } = await supabase
                                  .from('bills')
                                  .select('id, total_amount')
                                  .eq('po_number', searchPoNum);
                                
                                if (linkedBills && linkedBills.length > 0) {
                                   for (const lb of linkedBills) {
                                      const amountDue = Math.max(0, lb.total_amount - totalPaidNow);
                                      const billStatus = amountDue <= 0.01 ? 'paid' : 'partially_paid';
                                      
                                      console.log(`Updating Linked Bill ${lb.id} for PO ${searchPoNum}. Due: ${amountDue}, Status: ${billStatus}`);
                                      
                                      await supabase.from('bills').update({ 
                                          status: billStatus,
                                          amount_due: amountDue 
                                      }).eq('id', lb.id);
                                   }
                                } else {
                                     console.warn(`No linked bills found for PO: ${searchPoNum}`);
                                }
                            } else {
                                // It is a Bill
                                // 1. Update the Bill itself
                                const newStatus = totalPaidNow >= (bill.total_amount - 1) ? 'paid' : 'partially_paid';
                                const amountDue = Math.max(0, bill.total_amount - totalPaidNow);
                                await supabase.from('bills').update({ 
                                    status: newStatus,
                                    amount_due: amountDue
                                }).eq('id', billId);

                                // 2. Update the Linked PO (if any)
                                if (bill.po_number) {
                                   const { data: linkedPO } = await supabase.from('purchase_orders').select('id, total_amount').eq('po_number', bill.po_number).maybeSingle();
                                   if (linkedPO) {
                                      const poStatus = totalPaidNow >= (linkedPO.total_amount - 1) ? 'paid' : 'partially_paid';
                                      await supabase.from('purchase_orders').update({ status: poStatus }).eq('id', linkedPO.id);
                                   }
                                }
                            }
                            
                            await setTransactionStatus(currentTxId, 'posted');
                        }

                         // Handle Overpayment / Remainder
                         const totalAllocated = entriesList.reduce((sum, [_, amt]) => sum + (Number(amt) || 0), 0);
                         const remainder = total - totalAllocated;
                         
                         if (remainder > 0.01) {
                            // Find a Receivable / Prepayment account
                            let receivableAccount = accounts.find(a => 
                                a.account_name.toLowerCase().includes('supplier prepayment') || 
                                a.account_name.toLowerCase().includes('accounts receivable')
                            );
                            
                            // For supplier payments, keep it in the AP account (Creditors Control)
                            // so it shows up on the Creditors Control Report.
                            if (allocType === 'supplier_payment' && debitAccount) {
                               receivableAccount = { id: debitAccount };
                            } else if (!receivableAccount) {
                                // Fallback to any current asset
                                receivableAccount = accounts.find(a => a.account_type === 'asset' || a.account_type === 'current_asset');
                            }

                            if (receivableAccount) {
                                  if (entriesList.length === 0) {
                                      // Update existing transaction since no bills were allocated
                                      await supabase.from('transactions').update({
                                        description: `Prepayment for ${currentAllocationTx.reference_number || 'Supplier'}`,
                                        debit_account_id: receivableAccount.id,
                                        credit_account_id: creditAccount,
                                        status: 'posted',
                                        supplier_id: lastSupplierId
                                      } as any).eq('id', txId);

                                      await supabase.from('transaction_entries').delete().eq('transaction_id', txId);
                                      
                                      const entries = [
                                         {
                                             transaction_id: txId,
                                             account_id: receivableAccount.id,
                                             debit: remainder,
                                             credit: 0,
                                             description: `Prepayment Balance`,
                                            status: 'approved'
                                        },
                                        {
                                            transaction_id: txId,
                                            account_id: creditAccount,
                                            debit: 0,
                                            credit: remainder,
                                            description: `Prepayment Balance`,
                                            status: 'approved'
                                        }
                                    ];
                                    const { error: prepEntriesError } = await supabase.from('transaction_entries').insert(entries);
                                    if (prepEntriesError) throw prepEntriesError;
                                    await setTransactionStatus(txId, 'posted');

                                  } else {
                                      // Insert new transaction for remainder (Original Tx used for first bill)
                                      const { data: remTx } = await supabase.from('transactions').insert({
                                        company_id: currentAllocationTx.company_id,
                                        transaction_date: allocDate,
                                        description: `Overpayment / Prepayment for ${currentAllocationTx.reference_number || 'Supplier'}`,
                                        total_amount: -Math.abs(remainder),
                                        base_amount: Math.abs(remainder),
                                        reference_number: (currentAllocationTx.reference_number || '') + '-BAL',
                                        status: 'posted',
                                        transaction_type: 'payment',
                                        bank_account_id: allocBankId,
                                        debit_account_id: receivableAccount.id,
                                        credit_account_id: creditAccount,
                                        user_id: currentAllocationTx.user_id,
                                        supplier_id: lastSupplierId
                                     } as any).select().single();
     
                                     if (remTx) {
                                          const entries = [
                                            {
                                                transaction_id: remTx.id,
                                                account_id: receivableAccount.id,
                                                debit: remainder,
                                                credit: 0,
                                                description: `Overpayment Balance`,
                                               status: 'approved'
                                           },
                                           {
                                               transaction_id: remTx.id,
                                               account_id: creditAccount,
                                               debit: 0,
                                               credit: remainder,
                                               description: `Overpayment Balance`,
                                               status: 'approved'
                                           }
                                       ];
                                       const { error: remEntriesError } = await supabase.from('transaction_entries').insert(entries);
                                        if (remEntriesError) throw remEntriesError;
                                        await setTransactionStatus(remTx.id, 'posted');
                                     }
                                  }
                              }
                         }

                         toast({
                            title: "Allocation Complete",
                            description: remainder > 0.01 
                                ? `Allocated to bills. Overpayment of ${remainder.toFixed(2)} recorded as Prepayment.`
                                : "Transaction allocated to bills successfully.",
                         });
                    } else {
                        const rate = allocVatOn === 'yes' ? Number(allocVatRate || '0') : 0;
                        const vatAmount = rate > 0 ? ((total * rate) / (100 + rate)) : 0;
                        const netAmount = rate > 0 ? (total - vatAmount) : total;

                        let txType = '';
                        if (allocPayment === 'accrual') {
                          txType = isReceipt ? 'sales' : 'purchase';
                        } else {
                          txType = isReceipt ? 'receipt' : 'payment';
                        }

                        let txReference = currentAllocationTx.reference_number || null;
                       let docTotal = 0;
                        let docTable = '';

                        if (allocType === 'customer_receipt' && allocDocId) {
                             const { data: inv } = await supabase.from('invoices').select('invoice_number, total_amount').eq('id', allocDocId).single();
                             if (inv) {
                                txReference = inv.invoice_number;
                                docTotal = inv.total_amount;
                                docTable = 'invoices';
                             }
                        }

                        let currentOutstanding = 0;
                        let priorPaid = 0;
                        
                        if (txReference) {
                            const { data: relTxs } = await supabase.from('transactions')
                               .select('base_amount')
                               .eq('reference_number', txReference)
                               .eq('transaction_type', isReceipt ? 'receipt' : 'payment')
                               .in('status', ['posted', 'approved'])
                               .neq('id', txId);
                            
                            if (relTxs) priorPaid = relTxs.reduce((sum, t) => sum + (Number(t.base_amount) || 0), 0);
                            currentOutstanding = Math.max(0, docTotal - priorPaid);
                        }

                        const { error: upErr } = await supabase
                          .from('transactions')
                        .update({
                          transaction_date: allocDate,
                          description: String(allocDesc || '').trim() || (currentAllocationTx?.description || null),
                          bank_account_id: allocPayment === 'cash' ? allocBankId : null,
                          debit_account_id: debitAccount || null,
                          credit_account_id: creditAccount || null,
                          vat_rate: rate > 0 ? rate : null,
                          vat_amount: vatAmount > 0 ? vatAmount : null,
                          base_amount: netAmount,
                          vat_inclusive: (allocVatOn === 'yes'),
                          transaction_type: txType,
                          reference_number: txReference
                        })
                        .eq('id', txId);
                        
                        if (upErr) throw upErr;

                        if (rate === 0) {
                            await supabase.from('transaction_entries').delete().eq('transaction_id', txId);

                            const entries = [
                                {
                                    transaction_id: txId,
                                    account_id: debitAccount,
                                    debit: netAmount,
                                    credit: 0,
                                    description: currentAllocationTx.description || `Payment for ${txReference || ''}`,
                                    status: 'approved'
                                },
                                {
                                    transaction_id: txId,
                                    account_id: creditAccount,
                                    debit: 0,
                                    credit: netAmount,
                                    description: allocationTx?.description || `Payment for ${txReference || ''}`,
                                    status: 'approved'
                                }
                            ];

                            const { error: entryErr } = await supabase.from('transaction_entries').insert(entries);
                            if (entryErr) throw entryErr;
                        }

                        if (allocType === 'loan_interest' && allocLoanId) {
                           const interestAmount = netAmount; 
                           await supabase.from('loan_payments').insert({
                              loan_id: allocLoanId,
                              payment_date: allocDate,
                              amount: interestAmount,
                              principal_component: 0,
                              interest_component: interestAmount
                           });
                        } else if (allocType === 'loan_repayment' && allocLoanId) {
                           await supabase.from('loan_payments').insert({
                              loan_id: allocLoanId,
                              payment_date: allocDate,
                              amount: netAmount,
                              principal_component: netAmount, 
                              interest_component: 0
                           });
                           
                           const { data: loan } = await supabase.from('loans').select('outstanding_balance').eq('id', allocLoanId).single();
                           if (loan) {
                              await supabase.from('loans').update({
                                 outstanding_balance: Math.max(0, loan.outstanding_balance - netAmount)
                              }).eq('id', allocLoanId);
                           }
                        }

                        const totalPaidNow = priorPaid + netAmount;
                        
                        if (docTable === 'invoices') {
                            const newStatus = totalPaidNow >= (docTotal - 1) ? 'paid' : 'partial';
                            await supabase.from('invoices').update({ status: newStatus }).eq('id', allocDocId);
                        }

                        await setTransactionStatus(txId, 'posted');
                    }
                  } catch (e: any) {
                    console.error(e);
                    toast({ title: 'Allocation Failed', description: e.message || 'Failed to allocate transaction', variant: 'destructive' });
                  } finally {
                    setPosting(prev => ({ ...prev, [txId]: false }));
                  }
                };

                // Fire and forget
                processTransaction();
              }} disabled={allocationTx && posting[allocationTx.id]} className="min-w-[140px] shadow-md bg-green-600 hover:bg-green-700 text-white">
                {allocationTx && posting[allocationTx.id] ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>) : (<><CheckCircle className="mr-2 h-4 w-4" /> Allocate & Process</>)}
              </Button>
              </div>
              <div className="w-full text-center mt-4 border-t border-primary/10 pt-4">
                 <p className="text-xs text-muted-foreground font-medium flex items-center justify-center gap-1">
                    © {new Date().getFullYear()} Rigel Business. All rights reserved.
                 </p>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              Update transaction details before allocation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={editDesc} 
                onChange={(e) => setEditDesc(e.target.value)} 
                placeholder="Transaction description"
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input value={editRef} onChange={(e) => setEditRef(e.target.value)} placeholder="Reference number" />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
              <p className="text-xs text-muted-foreground">Modify amount only if necessary.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Restriction Dialog */}
      <Dialog open={showEditRestrictionDialog} onOpenChange={setShowEditRestrictionDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="h-5 w-5" />
              Edit Restricted
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              You cannot edit a transaction from the bank statement. 
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>
              Please check your date. If it does not match, insert a new transaction.
            </p>
            <p className="font-medium text-foreground">
              This restriction is in place to ensure accurate bank reconciliation status.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowEditRestrictionDialog(false)}>
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Allocation Modal */}
      <Dialog open={allocationModalOpen} onOpenChange={setAllocationModalOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Allocate Payment to {suppliers.find(s => s.id === allocEntityId)?.name || "Supplier"}</DialogTitle>
            <DialogDescription>
              Select invoices to pay and specify amounts. 
              Total Transaction: {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Math.abs(Number(allocationTx?.total_amount || 0)))}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-md border overflow-hidden">
               <Table>
                   <TableHeader className="bg-slate-700 border-b border-slate-800">
                      <TableRow className="hover:bg-transparent border-none">
                         <TableHead className="w-[40px] pl-4 text-white h-10">Select</TableHead>
                         <TableHead className="text-white font-semibold h-10">Document No</TableHead>
                         <TableHead className="text-white font-semibold h-10">Date</TableHead>
                         <TableHead className="text-white font-semibold h-10">Due Date</TableHead>
                         <TableHead className="text-white font-semibold h-10 text-right">Total</TableHead>
                         <TableHead className="text-white font-semibold h-10 text-right">Amount Due</TableHead>
                         <TableHead className="text-white font-semibold h-10 text-center">Status</TableHead>
                         <TableHead className="w-[150px] text-right text-white font-semibold h-10">Payment</TableHead>
                      </TableRow>
                   </TableHeader>
                   <TableBody>
                      {openBills.length === 0 ? (
                         <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No open invoices found for this supplier.</TableCell></TableRow>
                      ) : (
                         openBills.map((bill, index) => {
                            const isSelected = !!allocations[bill.id];
                            const allocatedAmount = allocations[bill.id] || 0;
                            const status = (bill.status || '').toLowerCase();
                            const isPaid = status === 'paid';
                            // Use calculated amount_due
                            const due = typeof bill.amount_due === 'number' ? bill.amount_due : bill.total_amount; 

                            return (
                               <TableRow key={bill.id} className={cn(
                                   "hover:bg-blue-50/50 transition-colors",
                                   isSelected ? "bg-blue-50/50" : (index % 2 === 0 ? "bg-white" : "bg-gray-50/30")
                               )}>
                                  <TableCell className="pl-4 py-3">
                                     <Checkbox 
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                           setAllocations(prev => {
                                              const next = { ...prev };
                                              if (checked) {
                                                 const totalTx = Math.abs(Number(allocationTx?.total_amount || 0));
                                                 const currentAllocated = Object.values(next).reduce((a, b) => a + b, 0);
                                                 const remaining = Math.max(0, totalTx - currentAllocated);
                                                 const toPay = Math.min(due, remaining);
                                                 next[bill.id] = toPay > 0 ? toPay : due; 
                                              } else {
                                                 delete next[bill.id];
                                              }
                                              return next;
                                           });
                                        }}
                                        disabled={isPaid}
                                        className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                     />
                                  </TableCell>
                                  <TableCell className="font-medium text-slate-700 py-3">{bill.bill_number}</TableCell>
                                  <TableCell className="text-slate-600 py-3">{new Date(bill.bill_date).toLocaleDateString()}</TableCell>
                                  <TableCell className="text-slate-600 py-3">{bill.due_date ? new Date(bill.due_date).toLocaleDateString() : '-'}</TableCell>
                                  <TableCell className="text-right font-medium text-slate-700 py-3">{new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(bill.total_amount)}</TableCell>
                                  <TableCell className="text-right font-medium text-red-600 py-3">{new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(due)}</TableCell>
                                  <TableCell className="text-center py-3">
                                     <span className={cn(
                                        "inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium",
                                        status === 'paid' ? "bg-[#d1fae5] text-[#065f46]" :
                                        status === 'processed' ? "bg-[#dbeafe] text-[#1e40af]" :
                                        status === 'partially_paid' ? "bg-[#fef3c7] text-[#92400e]" :
                                        status === 'overdue' ? "bg-[#fee2e2] text-[#991b1b]" :
                                        "bg-[#fee2e2] text-[#991b1b]" // Default/Unpaid
                                     )}>
                                        {status === 'paid' ? 'PAID' : status.replace(/_/g, ' ').toUpperCase()}
                                     </span>
                                  </TableCell>
                                  <TableCell className="py-3">
                                     <Input 
                                        type="number" 
                                        className="text-right h-8 bg-white"
                                        value={allocatedAmount}
                                        onChange={(e) => {
                                           const val = parseFloat(e.target.value) || 0;
                                           setAllocations(prev => ({ ...prev, [bill.id]: val }));
                                        }}
                                        disabled={!isSelected || isPaid}
                                     />
                                  </TableCell>
                               </TableRow>
                            );
                         })
                      )}
                   </TableBody>
                </Table>
             </div>
             <div className="flex justify-end gap-6 text-sm font-medium pt-2">
                <div className="flex flex-col items-end">
                    <span className="text-muted-foreground text-xs">Total Allocated</span>
                    <span className={cn("text-lg", Math.abs(Number(allocationTx?.total_amount || 0)) < Object.values(allocations).reduce((a, b) => a + b, 0) ? "text-destructive" : "text-primary")}>
                       {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Object.values(allocations).reduce((a, b) => a + b, 0))}
                    </span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-muted-foreground text-xs">Remaining</span>
                    <span className="text-lg">
                       {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Math.max(0, Math.abs(Number(allocationTx?.total_amount || 0)) - Object.values(allocations).reduce((a, b) => a + b, 0)))}
                    </span>
                </div>
             </div>
             
             {Math.max(0, Math.abs(Number(allocationTx?.total_amount || 0)) - Object.values(allocations).reduce((a, b) => a + b, 0)) > 0.01 && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700 flex items-start gap-2">
                   <Info className="h-4 w-4 mt-0.5 shrink-0" />
                   <div>
                      <strong>Overpayment:</strong> The remaining amount will be automatically recorded as a <strong>Prepayment/Receivable</strong> for this supplier.
                   </div>
                </div>
             )}
          </div>
          <DialogFooter className="flex justify-between sm:justify-end gap-2 bg-gray-50/50 p-4 border-t">
             <Button variant="outline" onClick={() => setAllocationModalOpen(false)}>Back</Button>
             <Button 
               onClick={executeTransaction}
               disabled={allocationTx && posting[allocationTx.id]}
               className="bg-green-600 hover:bg-green-700 text-white min-w-[140px]"
             >
               {allocationTx && posting[allocationTx.id] ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
               ) : (
                  <><CheckCircle className="mr-2 h-4 w-4" /> Allocate & Process</>
               )}
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Date Warning Dialog */}
      <Dialog open={showDateWarning} onOpenChange={setShowDateWarning}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <History className="h-5 w-5" />
              Check the dates
            </DialogTitle>
            <DialogDescription className="pt-2 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              It looks like the payment date you selected is <strong>before</strong> the invoice date.
              <br /><br />
              Usually, a payment happens after or on the same day as the invoice. Please double-check the dates to make sure everything is accurate.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button onClick={() => setShowDateWarning(false)} className="w-full sm:w-auto">
              Okay, let me fix that
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
