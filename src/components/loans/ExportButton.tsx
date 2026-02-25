/**
 * Export Button Component
 * Dropdown button for exporting loan data in various formats
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  FileSpreadsheet, 
  FileText, 
  Download, 
  Printer,
  Mail,
  ChevronDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { exportLoansToCSV, exportAmortizationToCSV, exportLoansToExcel, exportAmortizationToExcel } from '@/services/loanApi';
import type { Loan } from '@/types/loans';

interface ExportButtonProps {
  loanId?: string;
  companyId: string;
  loan?: Loan;
  disabled?: boolean;
}

export function ExportButton({ loanId, companyId, loan, disabled }: ExportButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  // Export loans list to CSV
  const handleExportLoansCSV = async () => {
    try {
      setLoading('csv');
      const csv = await exportLoansToCSV(companyId);
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loans_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Export successful',
        description: 'Loans data exported to CSV',
      });
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  // Export loans list to Excel
  const handleExportLoansExcel = async () => {
    try {
      setLoading('excel');
      const data = await exportLoansToExcel(companyId);
      
      // Simple Excel XML format
      const xmlContent = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>' +
        '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
        'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
        '<Worksheet ss:Name="Loans"><Table>' +
        data.slice(1).map((row: any) => '<Row>' + 
          Object.values(row).map((val: any) => `<Cell><Data ss:Type="${typeof val === 'number' ? 'Number' : 'String'}">${val}</Data></Cell>`).join('') +
        '</Row>').join('') +
        '</Table></Worksheet></Workbook>';
      
      const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loans_export_${new Date().toISOString().split('T')[0]}.xls`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Export successful',
        description: 'Loans data exported to Excel',
      });
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  // Export amortization schedule
  const handleExportAmortization = async (format: 'csv' | 'excel') => {
    if (!loanId) return;
    
    try {
      setLoading(format);
      
      if (format === 'csv') {
        const csv = await exportAmortizationToCSV(loanId);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `amortization_${loan?.reference || loanId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast({
          title: 'Export successful',
          description: 'Amortization schedule exported to CSV',
        });
      } else if (format === 'excel') {
        const data = await exportAmortizationToExcel(loanId);
        
        // Simple Excel XML format
        const xmlContent = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>' +
          '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
          'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
          '<Worksheet ss:Name="Amortization"><Table>' +
          data.slice(1).map((row: any) => '<Row>' + 
            Object.values(row).map((val: any) => `<Cell><Data ss:Type="${typeof val === 'number' ? 'Number' : 'String'}">${val}</Data></Cell>`).join('') +
          '</Row>').join('') +
          '</Table></Worksheet></Workbook>';
        
        const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `amortization_${loan?.reference || loanId}.xls`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast({
          title: 'Export successful',
          description: 'Amortization schedule exported to Excel',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  // Print loan details
  const handlePrint = () => {
    window.print();
    toast({
      title: 'Print ready',
      description: 'Print dialog opened',
    });
  };

  // Email loan details (placeholder)
  const handleEmail = () => {
    toast({
      title: 'Email feature',
      description: 'Email export coming soon',
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Download className="h-4 w-4 mr-2" />
          Export
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {loanId ? (
          // Export options for single loan
          <>
            <DropdownMenuItem 
              onClick={() => handleExportAmortization('csv')}
              disabled={!!loading}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              {loading === 'csv' ? 'Exporting...' : 'Export Schedule (CSV)'}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleExportAmortization('excel')}
              disabled={!!loading}
            >
              <FileText className="h-4 w-4 mr-2" />
              {loading === 'excel' ? 'Exporting...' : 'Export Schedule (Excel)'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={handlePrint}
              disabled={!!loading}
            >
              <Printer className="h-4 w-4 mr-2" />
              Print Details
            </DropdownMenuItem>
          </>
        ) : (
          // Export options for loan list
          <>
            <DropdownMenuItem 
              onClick={handleExportLoansCSV}
              disabled={!!loading}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              {loading === 'csv' ? 'Exporting...' : 'Export All Loans (CSV)'}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={handleExportLoansExcel}
              disabled={!!loading}
            >
              <FileText className="h-4 w-4 mr-2" />
              {loading === 'excel' ? 'Exporting...' : 'Export All Loans (Excel)'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ExportButton;
