import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type ImportType = 'customer' | 'invoice' | 'quote';

interface CSVImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  type: ImportType;
}

export function CSVImportDialog({ isOpen, onClose, type }: CSVImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

  const getTitle = () => {
    switch (type) {
      case 'invoice': return 'Invoices';
      case 'quote': return 'Quotes';
      case 'customer': return 'Customers';
      default: return 'Data';
    }
  };

  const handleDownloadTemplate = () => {
    let headers = "";
    let example = "";
    let filename = "";

    switch (type) {
      case 'customer':
        headers = "Name,Email,Phone,Address,City,State,Zip,Country,VAT Number,Contact Person";
        example = "Acme Corp,contact@acme.com,1234567890,123 Business Rd,Cape Town,WC,8001,South Africa,4000123456,John Doe";
        filename = "customer_import_template.csv";
        break;
      case 'invoice':
        headers = "Customer Name,Invoice Date,Due Date,Reference,Items (JSON),Total Amount,Status";
        example = "Acme Corp,2024-03-20,2024-04-20,INV-001,\"[{'item':'Widget','qty':10,'price':100}]\",1000.00,draft";
        filename = "invoice_import_template.csv";
        break;
      case 'quote':
        headers = "Customer Name,Date,Expiry Date,Reference,Items (JSON),Total Amount,Status";
        example = "Acme Corp,2024-03-20,2024-03-30,Q-001,\"[{'item':'Widget','qty':10,'price':100}]\",1000.00,draft";
        filename = "quote_import_template.csv";
        break;
    }

    const csvContent = `${headers}\n${example}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleImport = () => {
    if (!file) return;

    // Here you would implement the actual parsing and uploading logic
    // For now, we'll just simulate a successful import
    setTimeout(() => {
      toast({
        title: "Import Successful",
        description: `Successfully imported ${file.name}. Processed 1 record.`,
      });
      onClose();
      setFile(null);
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import {getTitle()}</DialogTitle>
          <DialogDescription>
            Download the template, fill it with your data, and upload the CSV file.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-2">
            <Label>Step 1: Download Template</Label>
            <p className="text-xs text-muted-foreground">Use this template to format your data correctly.</p>
            <Button variant="outline" className="w-full justify-start border-dashed" onClick={handleDownloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download CSV Template
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Step 2: Upload CSV File</Label>
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Input 
                id="csv-file" 
                type="file" 
                accept=".csv" 
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="cursor-pointer"
              />
            </div>
            {file && (
              <p className="text-xs text-muted-foreground">
                Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleImport} disabled={!file}>
            <Upload className="mr-2 h-4 w-4" />
            Import Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
