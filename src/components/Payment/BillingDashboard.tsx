import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CreditCard, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Download, 
  Calendar,
  DollarSign,
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  Settings
} from 'lucide-react';
import { formatPrice } from '@/utils/subscriptionPlans';

interface BillingHistoryItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  invoiceUrl?: string;
}

interface PaymentMethod {
  id: string;
  type: 'card' | 'paypal';
  last4?: string;
  brand?: string;
  email?: string;
  isDefault: boolean;
}

interface SubscriptionData {
  id: string;
  plan: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
}

// Mock data
const mockBillingHistory: BillingHistoryItem[] = [
  {
    id: '1',
    date: '2024-01-15',
    description: 'Pro Plan - Monthly',
    amount: 79,
    status: 'paid',
    invoiceUrl: '/invoices/INV-001.pdf'
  },
  {
    id: '2',
    date: '2023-12-15',
    description: 'Pro Plan - Monthly',
    amount: 79,
    status: 'paid',
    invoiceUrl: '/invoices/INV-002.pdf'
  },
  {
    id: '3',
    date: '2023-11-15',
    description: 'Basic Plan - Monthly',
    amount: 29,
    status: 'paid',
    invoiceUrl: '/invoices/INV-003.pdf'
  }
];

const mockPaymentMethods: PaymentMethod[] = [
  {
    id: '1',
    type: 'card',
    last4: '4242',
    brand: 'Visa',
    isDefault: true
  },
  {
    id: '2',
    type: 'paypal',
    email: 'user@example.com',
    isDefault: false
  }
];

const mockSubscription: SubscriptionData = {
  id: 'sub_123',
  plan: 'Pro',
  status: 'active',
  currentPeriodEnd: '2024-02-15',
  cancelAtPeriodEnd: false
};

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
    case 'paid':
      return <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>;
    case 'canceled':
      return <Badge variant="destructive">Canceled</Badge>;
    case 'past_due':
      return <Badge className="bg-yellow-500 hover:bg-yellow-600">Past Due</Badge>;
    case 'trialing':
      return <Badge variant="secondary">Trial</Badge>;
    case 'pending':
      return <Badge variant="outline">Pending</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'refunded':
      return <Badge variant="secondary">Refunded</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'paid':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'refunded':
      return <RefreshCw className="h-4 w-4 text-blue-500" />;
    default:
      return <DollarSign className="h-4 w-4 text-gray-500" />;
  }
}

const BillingDashboard = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'payment-methods' | 'history'>('overview');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCancelSubscription = async () => {
    setIsProcessing(true);
    // Simulate API call
    setTimeout(() => {
      setIsProcessing(false);
      alert('Subscription cancellation initiated. You will not be charged for the next billing cycle.');
    }, 2000);
  };

  const handleUpdatePaymentMethod = async () => {
    setIsProcessing(true);
    // Simulate API call
    setTimeout(() => {
      setIsProcessing(false);
      alert('Payment method updated successfully.');
    }, 2000);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Billing & Subscription</h1>
        <p className="text-muted-foreground">
          Manage your subscription, payment methods, and billing history
        </p>
      </div>

      {/* Subscription Status Alert */}
      {mockSubscription.status === 'past_due' && (
        <Alert className="mb-6 border-yellow-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Your subscription is past due. Please update your payment method to avoid service interruption.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-muted p-1 rounded-lg">
        <Button
          variant={activeTab === 'overview' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('overview')}
          className="flex-1"
        >
          Overview
        </Button>
        <Button
          variant={activeTab === 'payment-methods' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('payment-methods')}
          className="flex-1"
        >
          Payment Methods
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('history')}
          className="flex-1"
        >
          Billing History
        </Button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Current Subscription */}
          <Card>
            <CardHeader>
              <CardTitle>Current Subscription</CardTitle>
              <CardDescription>Your current plan and billing details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Plan</span>
                <Badge variant="secondary">{mockSubscription.plan}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Status</span>
                {getStatusBadge(mockSubscription.status)}
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Next Billing Date</span>
                <span>{new Date(mockSubscription.currentPeriodEnd).toLocaleDateString()}</span>
              </div>
              
              <div className="pt-4 space-y-2">
                <Button className="w-full" variant="outline">
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                  Upgrade Plan
                </Button>
                <Button 
                  className="w-full" 
                  variant="outline" 
                  disabled={isProcessing}
                  onClick={handleCancelSubscription}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel Subscription
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Payment Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
              <CardDescription>Your recent payment activity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Last Payment</span>
                <span className="text-green-600 font-semibold">$79.00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Payment Date</span>
                <span>January 15, 2024</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Payment Method</span>
                <span>Visa ending in 4242</span>
              </div>
              <div className="pt-4">
                <Button className="w-full" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download Last Invoice
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment Methods Tab */}
      {activeTab === 'payment-methods' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Payment Methods</h2>
            <Button>
              <CreditCard className="h-4 w-4 mr-2" />
              Add Payment Method
            </Button>
          </div>

          <div className="grid gap-4">
            {mockPaymentMethods.map((method) => (
              <Card key={method.id}>
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      {method.type === 'card' ? (
                        <CreditCard className="h-6 w-6 text-primary" />
                      ) : (
                        <DollarSign className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div>
                      {method.type === 'card' ? (
                        <>
                          <p className="font-medium">
                            {method.brand} ending in {method.last4}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {method.isDefault ? 'Default payment method' : 'Backup payment method'}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium">PayPal</p>
                          <p className="text-sm text-muted-foreground">{method.email}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {method.isDefault && (
                      <Badge variant="secondary">Default</Badge>
                    )}
                    <Button variant="ghost" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Billing History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Billing History</h2>
          
          <div className="space-y-4">
            {mockBillingHistory.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex items-center space-x-4">
                    {getStatusIcon(item.status)}
                    <div>
                      <p className="font-medium">{item.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(item.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="font-semibold">{formatPrice(item.amount)}</p>
                      {getStatusBadge(item.status)}
                    </div>
                    {item.invoiceUrl && (
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BillingDashboard;