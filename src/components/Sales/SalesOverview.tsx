import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertCircle, CheckCircle, Clock } from "lucide-react";

export const SalesOverview = () => {
  const stats = [
    { title: "Unpaid Invoices", value: "R 189,450", count: 15, icon: AlertCircle, color: "text-amber-500" },
    { title: "Overdue Invoices", value: "R 45,230", count: 3, icon: Clock, color: "text-destructive" },
    { title: "Paid Invoices", value: "R 2,847,390", count: 142, icon: CheckCircle, color: "text-primary" },
    { title: "Total Outstanding", value: "R 234,680", count: 18, icon: FileText, color: "text-accent" },
  ];

  return (
    <div className="space-y-6 mt-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="card-professional">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.count} invoices</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="card-professional">
        <CardHeader>
          <CardTitle>Age Analysis Report (Accounts Receivable)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded">
              <span className="font-medium">Current (0-30 days)</span>
              <span className="font-bold text-primary">R 98,450</span>
            </div>
            <div className="flex items-center justify-between p-3 border rounded">
              <span className="font-medium">31-60 days</span>
              <span className="font-bold text-amber-500">R 56,200</span>
            </div>
            <div className="flex items-center justify-between p-3 border rounded">
              <span className="font-medium">61-90 days</span>
              <span className="font-bold text-amber-600">R 35,000</span>
            </div>
            <div className="flex items-center justify-between p-3 border rounded">
              <span className="font-medium">90+ days (Overdue)</span>
              <span className="font-bold text-destructive">R 45,030</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
