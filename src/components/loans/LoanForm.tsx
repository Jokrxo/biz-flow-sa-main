/**
 * Loan Form Component
 * Reusable form for creating and editing loans
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Calculator, 
  Save, 
  ArrowLeft, 
  Building2, 
  User, 
  AlertCircle,
  CheckCircle2,
  Eye
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { LoanFormData, LoanType, LoanCategory, PaymentFrequency, InterestType } from '@/types/loans';
import { createLoan, updateLoan, fetchLoanById, postLoanReceivedTransaction } from '@/services/loanApi';
import { calculateMonthlyPayment, formatCurrency } from '@/utils/loanUtils';
import { AmortizationScheduleView } from './AmortizationSchedule';

interface LoanFormProps {
  isModal?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

const initialFormData: LoanFormData = {
  reference: '',
  loan_type: 'short',
  category: 'external',
  lender_name: '',
  principal: 0,
  interest_rate: 0,
  interest_type: 'fixed',
  start_date: new Date().toISOString().split('T')[0],
  term_months: 12,
  payment_frequency: 'monthly',
  monthly_repayment: undefined,
  bank_account_id: '',
  loan_account_id: '',
  collateral: '',
  notes: '',
};

export function LoanForm({ isModal = false, onClose, onSuccess }: LoanFormProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [loadingLoan, setLoadingLoan] = useState(!!id);
  const [formData, setFormData] = useState<LoanFormData>(initialFormData);
  const [showAmortization, setShowAmortization] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [postToLedger, setPostToLedger] = useState(false);
  
  const isEditing = !!id;

  // Load existing loan if editing
  useEffect(() => {
    if (id) {
      loadLoan(id);
    } else {
      // Generate reference for new loan
      generateReference();
    }
  }, [id]);

  const loadLoan = async (loanId: string) => {
    try {
      setLoadingLoan(true);
      const loan = await fetchLoanById(loanId);
      if (loan) {
        setFormData({
          reference: loan.reference,
          loan_type: loan.loan_type,
          category: loan.category,
          lender_name: loan.lender_name,
          principal: loan.principal,
          interest_rate: loan.interest_rate,
          interest_type: loan.interest_type || 'fixed',
          start_date: loan.start_date,
          term_months: loan.term_months,
          payment_frequency: loan.payment_frequency || 'monthly',
          monthly_repayment: loan.monthly_repayment || undefined,
          bank_account_id: loan.bank_account_id || '',
          loan_account_id: loan.loan_account_id || '',
          collateral: loan.collateral || '',
          notes: loan.notes || '',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error loading loan',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingLoan(false);
    }
  };

  const generateReference = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const ref = `LN-${today}-${Date.now().toString().slice(-4)}`;
    setFormData(prev => ({ ...prev, reference: ref }));
  };

  // Calculate monthly repayment preview
  const calculatePreview = () => {
    if (formData.principal <= 0 || formData.term_months <= 0) return null;
    
    const monthlyPayment = calculateMonthlyPayment(
      formData.principal,
      formData.interest_rate / 100,
      formData.term_months
    );
    
    const totalInterest = (monthlyPayment * formData.term_months) - formData.principal;
    
    return {
      monthlyPayment,
      totalInterest,
      totalPayment: monthlyPayment * formData.term_months,
    };
  };

  const preview = calculatePreview();

  // Validate form
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.reference.trim()) {
      newErrors.reference = 'Reference is required';
    }
    
    if (formData.principal <= 0) {
      newErrors.principal = 'Principal must be greater than 0';
    }
    
    if (formData.interest_rate < 0) {
      newErrors.interest_rate = 'Interest rate cannot be negative';
    }
    
    if (formData.term_months <= 0) {
      newErrors.term_months = 'Term must be greater than 0';
    }
    
    if (!formData.start_date) {
      newErrors.start_date = 'Start date is required';
    }
    
    if (!formData.lender_name.trim()) {
      newErrors.lender_name = 'Lender name is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!validate()) return;
    
    try {
      setLoading(true);
      
      // Get company ID
      const { data: { user } } = await import('@supabase/supabase-js').then(m => 
        m.supabase.auth.getUser()
      );
      
      if (!user) throw new Error('Not authenticated');
      
      const { data: profile } = await import('@supabase/supabase-js').then(m =>
        m.supabase.from('profiles').select('company_id').eq('user_id', user.id).single()
      );
      
      if (!profile?.company_id) throw new Error('Company not found');
      
      const companyId = profile.company_id;
      
      if (isEditing && id) {
        await updateLoan(id, {
          ...formData,
          monthly_repayment: preview?.monthlyPayment,
        });
        
        toast({
          title: 'Loan updated',
          description: 'Loan has been updated successfully',
        });
      } else {
        // Create the loan
        const newLoan = await createLoan(formData, companyId);
        
        // If postToLedger is checked, create the transaction
        if (postToLedger && newLoan?.id) {
          if (!formData.bank_account_id) {
            toast({
              title: 'Bank Account Required',
              description: 'Please select a bank account to post the loan transaction',
              variant: 'destructive',
            });
            setLoading(false);
            return;
          }
          
          await postLoanReceivedTransaction(
            newLoan.id,
            formData.bank_account_id,
            formData.start_date,
            formData.reference
          );
          
          toast({
            title: 'Loan posted to ledger',
            description: 'The loan has been recorded in the financial statements',
          });
        }
        
        toast({
          title: 'Loan created',
          description: 'New loan has been created successfully',
        });
      }
      
      if (onSuccess) {
        onSuccess();
      } else if (!isModal) {
        navigate('/loans');
      } else if (onClose) {
        onClose();
      }
    } catch (error: any) {
      toast({
        title: 'Error saving loan',
        description: error.message,
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof LoanFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when field is modified
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const content = (
    <div className="space-y-6">
      {/* Loan Type Selection */}
      <Tabs 
        value={formData.category} 
        onValueChange={(v) => handleInputChange('category', v as LoanCategory)}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="external" className="gap-2">
            <Building2 className="h-4 w-4" />
            External Loan
          </TabsTrigger>
          <TabsTrigger value="internal_director" className="gap-2">
            <User className="h-4 w-4" />
            Director's Loan
          </TabsTrigger>
          <TabsTrigger value="internal_member" className="gap-2">
            <User className="h-4 w-4" />
            Member's Loan
          </TabsTrigger>
        </TabsList>

        {/* Basic Information */}
        <TabsContent value={formData.category} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Loan Details</CardTitle>
              <CardDescription>Enter the basic loan information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference *</Label>
                  <Input
                    id="reference"
                    value={formData.reference}
                    onChange={(e) => handleInputChange('reference', e.target.value)}
                    placeholder="LN-20240101-0001"
                  />
                  {errors.reference && (
                    <p className="text-sm text-red-500">{errors.reference}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => handleInputChange('start_date', e.target.value)}
                  />
                  {errors.start_date && (
                    <p className="text-sm text-red-500">{errors.start_date}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lender_name">Lender Name *</Label>
                  <Input
                    id="lender_name"
                    value={formData.lender_name}
                    onChange={(e) => handleInputChange('lender_name', e.target.value)}
                    placeholder="Bank name or director name"
                  />
                  {errors.lender_name && (
                    <p className="text-sm text-red-500">{errors.lender_name}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="loan_type">Loan Type *</Label>
                  <Select
                    value={formData.loan_type}
                    onValueChange={(v) => handleInputChange('loan_type', v as LoanType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short-term (≤12 months)</SelectItem>
                      <SelectItem value="long">Long-term (&gt;12 months)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Financial Details */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Details</CardTitle>
              <CardDescription>Enter the loan amount and terms</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="principal">Principal Amount (R) *</Label>
                  <Input
                    id="principal"
                    type="number"
                    value={formData.principal || ''}
                    onChange={(e) => handleInputChange('principal', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                  {errors.principal && (
                    <p className="text-sm text-red-500">{errors.principal}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="interest_rate">Interest Rate (%) *</Label>
                  <Input
                    id="interest_rate"
                    type="number"
                    step="0.01"
                    value={formData.interest_rate || ''}
                    onChange={(e) => handleInputChange('interest_rate', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                  {errors.interest_rate && (
                    <p className="text-sm text-red-500">{errors.interest_rate}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="term_months">Term (Months) *</Label>
                  <Input
                    id="term_months"
                    type="number"
                    value={formData.term_months || ''}
                    onChange={(e) => handleInputChange('term_months', parseInt(e.target.value) || 0)}
                    placeholder="12"
                  />
                  {errors.term_months && (
                    <p className="text-sm text-red-500">{errors.term_months}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="payment_frequency">Payment Frequency</Label>
                  <Select
                    value={formData.payment_frequency}
                    onValueChange={(v) => handleInputChange('payment_frequency', v as PaymentFrequency)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                      <SelectItem value="bullet">Bullet (Interest Only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="interest_type">Interest Type</Label>
                  <Select
                    value={formData.interest_type}
                    onValueChange={(v) => handleInputChange('interest_type', v as InterestType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed Rate</SelectItem>
                      <SelectItem value="variable">Variable Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="collateral">Collateral (Optional)</Label>
                  <Input
                    id="collateral"
                    value={formData.collateral || ''}
                    onChange={(e) => handleInputChange('collateral', e.target.value)}
                    placeholder="Property, equipment, etc."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ''}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Additional notes or comments..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Amortization Preview */}
      {preview && (
        <Card className="border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Payment Preview
              </CardTitle>
              <CardDescription>Calculated based on current values</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowAmortization(!showAmortization)}
            >
              <Eye className="h-4 w-4 mr-2" />
              {showAmortization ? 'Hide' : 'View'} Schedule
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground">Monthly Payment</div>
                <div className="text-2xl font-bold">{formatCurrency(preview.monthlyPayment)}</div>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground">Total Interest</div>
                <div className="text-2xl font-bold text-red-600">{formatCurrency(preview.totalInterest)}</div>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground">Total Payment</div>
                <div className="text-2xl font-bold">{formatCurrency(preview.totalPayment)}</div>
              </div>
            </div>

            {showAmortization && (
              <div className="mt-4">
                <Separator className="my-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  Full amortization schedule will be generated upon saving
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!isEditing && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="postToLedger"
                checked={postToLedger}
                onCheckedChange={(checked) => setPostToLedger(checked === true)}
              />
              <Label htmlFor="postToLedger" className="text-sm font-normal cursor-pointer">
                Post loan to ledger (create journal entry)
              </Label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
        {isModal && onClose && (
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        {!isModal && (
          <Button variant="outline" onClick={() => navigate('/loans')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        )}
        <Button onClick={handleSubmit} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? 'Saving...' : isEditing ? 'Update Loan' : 'Create Loan'}
        </Button>
      </div>
    </div>
  );

  // Wrap in modal if needed
  if (isModal) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Loan' : 'Add New Loan'}</DialogTitle>
            <DialogDescription>
              {isEditing 
                ? 'Update the loan details below' 
                : 'Enter the details of the new loan agreement'}
            </DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/loans')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{isEditing ? 'Edit Loan' : 'Add New Loan'}</h1>
          <p className="text-muted-foreground">
            {isEditing ? 'Update loan details' : 'Create a new loan agreement'}
          </p>
        </div>
      </div>
      {content}
    </div>
  );
}

export default LoanForm;
