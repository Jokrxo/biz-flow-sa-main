import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Calculator, 
  Calendar,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Receipt
} from "lucide-react";

const vatPeriods = [
  {
    period: "January 2024",
    status: "Current",
    dueDate: "2024-02-07",
    salesVAT: 45680.75,
    purchaseVAT: 12340.50,
    netVAT: 33340.25,
    submitted: false,
    daysLeft: 7
  },
  {
    period: "December 2023", 
    status: "Submitted",
    dueDate: "2024-01-07",
    salesVAT: 52100.00,
    purchaseVAT: 15230.75,
    netVAT: 36869.25,
    submitted: true,
    daysLeft: 0
  },
  {
    period: "November 2023",
    status: "Paid",
    dueDate: "2023-12-07", 
    salesVAT: 48250.50,
    purchaseVAT: 13890.25,
    netVAT: 34360.25,
    submitted: true,
    daysLeft: 0
  }
];

const vatTransactions = [
  { description: "Sales Invoice - Acme Corp", type: "Output VAT", amount: 3750.00, rate: "15%", date: "2024-01-15" },
  { description: "Equipment Purchase", type: "Input VAT", amount: 1312.50, rate: "15%", date: "2024-01-14" },
  { description: "Office Rent", type: "Input VAT", amount: 2325.00, rate: "15%", date: "2024-01-14" },
  { description: "Consulting Services", type: "Output VAT", amount: 4800.00, rate: "15%", date: "2024-01-13" },
];

export const VATManagement = () => {
  const currentPeriod = vatPeriods[0];
  const vatCompliance = 95;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">VAT Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage your South African VAT obligations and submissions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export VAT Return
          </Button>
          <Button className="bg-gradient-primary hover:opacity-90 gap-2">
            <FileText className="h-4 w-4" />
            Submit VAT Return
          </Button>
        </div>
      </div>

      {/* VAT Status Alert */}
      <Card className="card-professional border-l-4 border-l-accent bg-accent/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20">
              <AlertTriangle className="h-6 w-6 text-accent" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">VAT Return Due Soon</h3>
              <p className="text-muted-foreground">
                Your VAT return for {currentPeriod.period} is due in {currentPeriod.daysLeft} days 
                ({currentPeriod.dueDate}). Total VAT due: R {currentPeriod.netVAT.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <Button className="bg-accent hover:opacity-90">
              Prepare Return
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* VAT Summary */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card className="card-professional">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Output VAT (Sales)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              R {currentPeriod.salesVAT.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span className="text-xs text-muted-foreground">Current period</span>
            </div>
          </CardContent>
        </Card>

        <Card className="card-professional">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Input VAT (Purchases)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">
              R {currentPeriod.purchaseVAT.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Receipt className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Claimable VAT</span>
            </div>
          </CardContent>
        </Card>

        <Card className="card-professional">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net VAT Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">
              R {currentPeriod.netVAT.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Calculator className="h-3 w-3 text-accent" />
              <span className="text-xs text-muted-foreground">Due {currentPeriod.dueDate}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="card-professional">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Compliance Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {vatCompliance}%
            </div>
            <Progress value={vatCompliance} className="mt-2" />
            <span className="text-xs text-muted-foreground">Excellent</span>
          </CardContent>
        </Card>
      </div>

      {/* VAT Periods */}
      <Card className="card-professional">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            VAT Periods
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {vatPeriods.map((period) => (
              <div key={period.period} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${
                    period.status === 'Current' ? 'bg-accent animate-pulse' :
                    period.status === 'Submitted' ? 'bg-primary' : 'bg-muted-foreground'
                  }`} />
                  <div>
                    <h4 className="font-medium text-foreground">{period.period}</h4>
                    <p className="text-sm text-muted-foreground">Due: {period.dueDate}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm font-medium">Output: R {period.salesVAT.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
                    <p className="text-sm text-muted-foreground">Input: R {period.purchaseVAT.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
                  </div>
                  
                  <div className="text-right">
                    <p className="font-bold text-accent">R {period.netVAT.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-muted-foreground">Net VAT</p>
                  </div>
                  
                  <Badge 
                    variant={period.submitted ? "default" : "outline"}
                    className={`${period.status === 'Current' ? 'bg-accent' : period.submitted ? 'bg-primary' : ''} min-w-20 justify-center`}
                  >
                    {period.status === 'Current' && <AlertTriangle className="h-3 w-3 mr-1" />}
                    {period.status === 'Submitted' && <CheckCircle className="h-3 w-3 mr-1" />}
                    {period.status === 'Paid' && <CheckCircle className="h-3 w-3 mr-1" />}
                    {period.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent VAT Transactions */}
      <Card className="card-professional">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Recent VAT Transactions - {currentPeriod.period}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {vatTransactions.map((transaction, index) => (
              <div key={index} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-8 rounded-full ${
                    transaction.type === 'Output VAT' ? 'bg-primary' : 'bg-muted-foreground'
                  }`} />
                  <div>
                    <p className="font-medium text-foreground">{transaction.description}</p>
                    <p className="text-sm text-muted-foreground">{transaction.type} • {transaction.date}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className="text-xs">
                    {transaction.rate}
                  </Badge>
                  <div className={`font-bold ${
                    transaction.type === 'Output VAT' ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    R {transaction.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 flex justify-center">
            <Button variant="outline">
              View All VAT Transactions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};