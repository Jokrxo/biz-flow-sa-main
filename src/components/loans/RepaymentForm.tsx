/**
 * Repayment Form Component
 * Form for recording loan repayments with principal/interest allocation
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  DollarSign, 
  Calendar,
  Calculator,
  CheckCircle2,
  AlertCircle,
  Save,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Loan, LoanPayment } from '@/types/loans';
import { 
  calculateMonthlyPayment,
  calculateIPMT,
  calculatePPMT 
} from '@/utils/loanUtils';
import { supabase } from '@/integrations/supabase/client';
import { postLoanRepaymentTransaction } from '@/services/loanApi';

interface RepaymentFormProps {
  loan: Loan | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (payment: LoanPayment) => void;
  mode?: 'repayment' | 'interest' | 'balloon';
}

export function RepaymentForm({ 
  loan, 
  isOpen, 
  onClose, 
  onSuccess,
  mode = 'repayment' 
}: RepaymentFormProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postToLedger, setPostToLedger] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    amount: '',
    principal_amount: '',
    interest_amount: '',
    payment_type: 'scheduled' as 'scheduled' | 'early' | 'additional' | 'balloon',
    notes: '',
    auto_allocate: true
  });

  // Calculate payment breakdown when loan or amount changes
  useEffect(() => {
    if (!loan || !formData.auto_allocate) return;
    
    const amount = parseFloat(formData.amount) || 0;
    if (amount <= 0) return;
    
    const monthlyRate = loan.interest_rate / 100 / 12;
    const period = 1; // Next payment period
    
    // Calculate interest and principal components
    const interestComponent = calculateIPMT(
      loan.outstanding_balance || loan.principal,
      monthlyRate,
      period
    );
    
    const principalComponent = Math.max(0, amount - interestComponent);
    
    setFormData(prev => ({
      ...prev,
      interest_amount: interestComponent.toFixed(2),
      principal_amount: principalComponent.toFixed(2)
    }));
  }, [loan, formData.amount, formData.auto_allocate]);

  // Update amount when loan changes
  useEffect(() => {
    if (!loan) return;
    
    if (mode === 'interest') {
      // Calculate just interest for the period
      const monthlyRate = loan.interest_rate / 100 / 12;
      const interest = calculateIPMT(
        loan.outstanding_balance || loan.principal,
        monthlyRate,
        1
      );
      setFormData(prev => ({
        ...prev,
        amount: interest.toFixed(2),
        payment_type: 'scheduled'
      }));
    } else if (loan.monthly_repayment) {
      setFormData(prev => ({
        ...prev,
        amount: loan.monthly_repayment?.toString() || ''
      }));
    }
  }, [loan, mode]);

  const handleSubmit = async () => {
    if (!loan) return;
    
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid payment amount',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const principalComponent = parseFloat(formData.principal_amount) || 0;
      const interestComponent = parseFloat(formData.interest_amount) || 0;
      const balanceAfter = Math.max(0, (loan.outstanding_balance || loan.principal) - principalComponent);
      
      const paymentData = {
        loan_id: loan.id,
        payment_date: formData.payment_date,
        amount: amount,
        principal_component: principalComponent,
        interest_component: interestComponent,
        balance_after: balanceAfter,
        payment_type: formData.payment_type,
        notes: formData.notes || null,
        created_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('loan_payments')
        .insert(paymentData)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update loan outstanding balance
      await supabase
        .from('loans')
        .update({ 
          outstanding_balance: balanceAfter,
          status: balanceAfter <= 0 ? 'completed' : loan.status
        })
        .eq('id', loan.id);
      
      // Post to ledger if checkbox is checked
      if (postToLedger) {
        if (!loan.bank_account_id) {
          toast({
            title: 'Bank Account Not Set',
            description: 'This loan does not have a bank account configured for ledger posting.',
            variant: 'destructive'
          });
        } else {
          try {
            await postLoanRepaymentTransaction(
              loan.id,
              loan.bank_account_id,
              formData.payment_date,
              amount
            );
            toast({
              title: 'Payment posted to ledger',
              description: 'The repayment has been recorded in the financial statements.',
            });
          } catch (ledgerError: any) {
            console.error('Error posting to ledger:', ledgerError);
            toast({
              title: 'Ledger Posting Warning',
              description: 'Payment recorded but could not post to ledger: ' + ledgerError.message,
              variant: 'destructive'
            });
          }
        }
      }
      
      toast({
        title: 'Payment Recorded',
        description: `Payment of R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })} recorded successfully`,
      });
      
      if (onSuccess && data) {
        onSuccess(data as LoanPayment);
      }
      
      onClose();
      setFormData({
        payment_date: new Date().toISOString().split('T')[0],
        amount: '',
        principal_amount: '',
        interest_amount: '',
        payment_type: 'scheduled',
        notes: '',
        auto_allocate: true
      });
      
    } catch (error: any) {
      console.error('Error recording payment:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to record payment',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!loan) return null;

  const outstanding = loan.outstanding_balance || loan.principal;
  const monthlyRate = loan.interest_rate / 100 / 12;
  const nextInterest = calculateIPMT(outstanding, monthlyRate, 1);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'interest' ? 'Record Interest Payment' : 
             mode === 'balloon' ? 'Record Balloon Payment' : 
             'Record Loan Repayment'}
          </DialogTitle>
          <DialogDescription>
            Record a payment for loan: {loan.reference}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Loan Summary */}
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Outstanding Balance:</span>
                  <p className="font-semibold">R {outstanding.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Interest Rate:</span>
                  <p className="font-semibold">{loan.interest_rate}% p.a.</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Monthly Payment:</span>
                  <p className="font-semibold">R {(loan.monthly_repayment || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Next Interest:</span>
                  <p className="font-semibold">R {nextInterest.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Date */}
          <div className="space-y-2">
            <Label htmlFor="payment_date">Payment Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                className="pl-10"
              />
            </div>
          </div>

          {/* Payment Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Payment Amount (R)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="pl-10"
              />
            </div>
          </div>

          {/* Payment Type */}
          <div className="space-y-2">
            <Label htmlFor="payment_type">Payment Type</Label>
            <Select 
              value={formData.payment_type}
              onValueChange={(v) => setFormData({ ...formData, payment_type: v as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled Payment</SelectItem>
                <SelectItem value="early">Early Repayment</SelectItem>
                <SelectItem value="additional">Additional Payment</SelectItem>
                <SelectItem value="balloon">Balloon Payment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Principal/Interest Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Payment Breakdown</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFormData({ ...formData, auto_allocate: !formData.auto_allocate })}
                className="h-8 px-2 text-xs"
              >
                {formData.auto_allocate ? 'Auto-allocate' : 'Manual'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Principal (R)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.principal_amount}
                  onChange={(e) => {
                    setFormData({ 
                      ...formData, 
                      principal_amount: e.target.value,
                      auto_allocate: false 
                    });
                  }}
                  disabled={formData.auto_allocate}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Interest (R)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.interest_amount}
                  onChange={(e) => {
                    setFormData({ 
                      ...formData, 
                      interest_amount: e.target.value,
                      auto_allocate: false 
                    });
                  }}
                  disabled={formData.auto_allocate}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Input
              id="notes"
              placeholder="Payment notes..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          {/* Summary */}
          {formData.amount && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Payment Summary</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Payment:</span>
                    <span className="font-semibold">
                      R {parseFloat(formData.amount || '0').toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Balance After:</span>
                    <span className="font-semibold">
                      R {Math.max(0, outstanding - parseFloat(formData.principal_amount || '0')).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Recording...' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RepaymentForm;
