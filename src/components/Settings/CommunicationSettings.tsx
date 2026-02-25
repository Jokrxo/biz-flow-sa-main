import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Bell, Send, MessageSquare, FileText, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const CommunicationSettings = () => {
  const [activeTemplate, setActiveTemplate] = useState("invoice");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const { toast } = useToast();

  const [templates, setTemplates] = useState({
    invoice: {
      subject: "Invoice {{InvoiceNumber}} from {{CompanyName}}",
      body: "Dear {{CustomerName}},\n\nPlease find attached invoice {{InvoiceNumber}} for {{Amount}}.\n\nPayment is due by {{DueDate}}.\n\nThank you for your business,\n{{CompanyName}}"
    },
    quote: {
      subject: "Quote {{QuoteNumber}} from {{CompanyName}}",
      body: "Dear {{CustomerName}},\n\nHere is the quote you requested. This offer is valid until {{ExpiryDate}}.\n\nRegards,\n{{CompanyName}}"
    },
    reminder: {
      subject: "Overdue: Invoice {{InvoiceNumber}}",
      body: "Dear {{CustomerName}},\n\nThis is a friendly reminder that invoice {{InvoiceNumber}} for {{Amount}} was due on {{DueDate}}.\n\nPlease arrange for payment at your earliest convenience.\n\nRegards,\n{{CompanyName}}"
    }
  });

  const handleSave = () => {
    // In a real app, save to Supabase here
    toast({ title: "Settings Saved", description: "Email templates and automation rules updated." });
  };

  const updateTemplate = (field: 'subject' | 'body', value: string) => {
    setTemplates(prev => ({
      ...prev,
      [activeTemplate]: {
        ...prev[activeTemplate as keyof typeof prev],
        [field]: value
      }
    }));
  };

  const currentTemplate = templates[activeTemplate as keyof typeof templates];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Automation Card */}
        <Card className="card-professional lg:col-span-1">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <CardTitle>Automation</CardTitle>
            </div>
            <CardDescription>Automatic follow-ups</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Payment Reminders</Label>
                <p className="text-xs text-muted-foreground">Auto-send emails for overdue invoices</p>
              </div>
              <Switch checked={remindersEnabled} onCheckedChange={setRemindersEnabled} />
            </div>
            
            {remindersEnabled && (
              <div className="space-y-4 pt-4 border-t animate-in fade-in slide-in-from-top-2">
                <div className="space-y-2">
                  <Label className="text-xs">Send first reminder</Label>
                  <select className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                    <option>3 days after due date</option>
                    <option>7 days after due date</option>
                    <option>14 days after due date</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Send second reminder</Label>
                  <select className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                    <option>14 days after due date</option>
                    <option>30 days after due date</option>
                  </select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Templates Card */}
        <Card className="card-professional lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <CardTitle>Email Templates</CardTitle>
            </div>
            <CardDescription>Customize the messages sent to your clients</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTemplate} onValueChange={setActiveTemplate} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="invoice">Invoice</TabsTrigger>
                <TabsTrigger value="quote">Quote</TabsTrigger>
                <TabsTrigger value="reminder">Reminder</TabsTrigger>
              </TabsList>
              
              {currentTemplate && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email Subject</Label>
                    <Input 
                      value={currentTemplate.subject}
                      onChange={(e) => updateTemplate('subject', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email Body</Label>
                    <Textarea 
                      className="min-h-[200px] font-sans"
                      value={currentTemplate.body}
                      onChange={(e) => updateTemplate('body', e.target.value)}
                    />
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                    <span className="font-semibold">Available Variables:</span> {' '}
                    <code className="bg-background px-1 rounded">{`{{CustomerName}}`}</code>, {' '}
                    <code className="bg-background px-1 rounded">{`{{InvoiceNumber}}`}</code>, {' '}
                    <code className="bg-background px-1 rounded">{`{{Amount}}`}</code>, {' '}
                    <code className="bg-background px-1 rounded">{`{{DueDate}}`}</code>, {' '}
                    <code className="bg-background px-1 rounded">{`{{CompanyName}}`}</code>
                  </div>
                </div>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="bg-gradient-primary shadow-lg hover:shadow-xl transition-all px-8">
          <Send className="h-4 w-4 mr-2" />
          Save Configuration
        </Button>
      </div>
    </div>
  );
};
