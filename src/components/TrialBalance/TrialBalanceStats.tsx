import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, CheckCircle, AlertCircle } from 'lucide-react';

interface TrialBalanceStatsProps {
  summary: {
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
    difference: number;
  };
}

export const TrialBalanceStats: React.FC<TrialBalanceStatsProps> = ({ summary }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Debits</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            ${summary.totalDebits.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            ${summary.totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Difference</CardTitle>
          {summary.isBalanced ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${
            summary.difference === 0 
              ? 'text-green-600' 
              : summary.difference > 0 
                ? 'text-orange-600' 
                : 'text-red-600'
          }`}>
            ${Math.abs(summary.difference).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Balance Status</CardTitle>
          {summary.isBalanced ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
        </CardHeader>
        <CardContent>
          <Badge 
            variant={summary.isBalanced ? "default" : "destructive"}
            className="text-sm font-medium"
          >
            {summary.isBalanced ? 'Balanced' : 'Out of Balance'}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
};