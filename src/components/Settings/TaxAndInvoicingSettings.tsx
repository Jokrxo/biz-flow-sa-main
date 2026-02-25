import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Percent, FileText, Landmark, Receipt, BadgePercent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export const TaxAndInvoicingSettings = () => {
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [defaultTaxRate, setDefaultTaxRate] = useState("15");
  const [taxName, setTaxName] = useState("VAT");
  const [invoicePrefix, setInvoicePrefix] = useState("INV-");
  const [quotePrefix, setQuotePrefix] = useState("QTE-");
  const [nextInvNumber, setNextInvNumber] = useState("1001");
  const [currency, setCurrency] = useState("ZAR");

  return (
    <div className="space-y-6">
      {/* Tax Configuration */}
      <Card className="card-professional border-l-4 border-l-emerald-500">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Percent className="h-5 w-5 text-emerald-600" />
            </div>
            <CardTitle>Tax Configuration</CardTitle>
          </div>
          <CardDescription>Manage VAT/GST rates and calculation rules</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Enable Tax Calculation</Label>
              <p className="text-sm text-muted-foreground">Apply tax to line items by default</p>
            </div>
            <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
          </div>
          
          {taxEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-2">
                <Label>Tax Name</Label>
                <Input value={taxName} onChange={(e) => setTaxName(e.target.value)} placeholder="VAT, GST, Sales Tax" />
              </div>
              <div className="space-y-2">
                <Label>Default Rate (%)</Label>
                <Input type="number" value={defaultTaxRate} onChange={(e) => setDefaultTaxRate(e.target.value)} placeholder="15" />
              </div>
              <div className="space-y-2">
                <Label>Tax ID / Reg Number</Label>
                <Input placeholder="4000123456" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Numbering */}
      <Card className="card-professional border-l-4 border-l-blue-500">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <CardTitle>Document Sequences</CardTitle>
          </div>
          <CardDescription>Set prefixes and starting numbers for financial documents</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 border rounded-xl bg-slate-50/50">
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-semibold">Invoices</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">Prefix</Label>
                  <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">Next Number</Label>
                  <Input value={nextInvNumber} onChange={(e) => setNextInvNumber(e.target.value)} className="font-mono" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Next invoice will be: <span className="font-mono font-medium text-foreground">{invoicePrefix}{nextInvNumber}</span></p>
            </div>

            <div className="p-4 border rounded-xl bg-slate-50/50">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-semibold">Quotes</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">Prefix</Label>
                  <Input value={quotePrefix} onChange={(e) => setQuotePrefix(e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">Next Number</Label>
                  <Input defaultValue="1001" className="font-mono" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Next quote will be: <span className="font-mono font-medium text-foreground">{quotePrefix}1001</span></p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Currency & Units */}
      <Card className="card-professional border-l-4 border-l-purple-500">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Landmark className="h-5 w-5 text-purple-600" />
            </div>
            <CardTitle>Currency & Banking</CardTitle>
          </div>
          <CardDescription>Set your base currency and banking preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Base Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZAR">South African Rand (ZAR)</SelectItem>
                  <SelectItem value="USD">US Dollar (USD)</SelectItem>
                  <SelectItem value="EUR">Euro (EUR)</SelectItem>
                  <SelectItem value="GBP">British Pound (GBP)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Used for all financial reporting and primary transactions.</p>
            </div>
            
            <div className="space-y-2">
              <Label>Payment Terms Default</Label>
              <Select defaultValue="net30">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                  <SelectItem value="net15">Net 15 Days</SelectItem>
                  <SelectItem value="net30">Net 30 Days</SelectItem>
                  <SelectItem value="net60">Net 60 Days</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Default due date applied to new invoices.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button className="bg-gradient-primary shadow-lg hover:shadow-xl transition-all px-8">Save Configuration</Button>
      </div>
    </div>
  );
};
