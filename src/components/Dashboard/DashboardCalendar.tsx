import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

export const DashboardCalendar = () => {
  const { user } = useAuth();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (user) {
      const fetchProfile = async () => {
        const { data } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
        if (data) setCompanyId(data.company_id);
      }
      fetchProfile();
    }
  }, [user]);

  useEffect(() => {
    if (!companyId) return;
    const fetchEvents = async () => {
      setLoading(true);
      
      const [invRes, billsRes, poRes] = await Promise.all([
        supabase.from('invoices').select('id, invoice_number, customer_name, total_amount, due_date, status').eq('company_id', companyId).not('due_date', 'is', null),
        supabase.from('bills').select('id, bill_number, supplier_name, total_amount, due_date, status').eq('company_id', companyId).not('due_date', 'is', null),
        supabase.from('purchase_orders').select('id, po_number, supplier_name, total_amount, due_date, status').eq('company_id', companyId).not('due_date', 'is', null)
      ]);

      const newEvents: any[] = [];
      
      invRes.data?.forEach(inv => {
        if (!inv.due_date) return;
        newEvents.push({
          id: inv.id,
          title: `Inv: ${inv.invoice_number} - ${inv.customer_name}`,
          date: parseISO(inv.due_date),
          amount: inv.total_amount,
          type: 'invoice',
          status: inv.status
        });
      });

      billsRes.data?.forEach(bill => {
        if (!bill.due_date) return;
         newEvents.push({
          id: bill.id,
          title: `Bill: ${bill.bill_number} - ${bill.supplier_name}`,
          date: parseISO(bill.due_date),
          amount: bill.total_amount,
          type: 'bill',
          status: bill.status
        });
      });

      poRes.data?.forEach(po => {
        if (!po.due_date) return;
        newEvents.push({
          id: po.id,
          title: `PO: ${po.po_number} - ${po.supplier_name}`,
          date: parseISO(po.due_date),
          amount: po.total_amount,
          type: 'po',
          status: po.status
        });
      });

      setEvents(newEvents);
      setLoading(false);
    };
    fetchEvents();
  }, [companyId]);

  const selectedDateEvents = events.filter(e => date && isSameDay(e.date, date));

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" title="Calendar">
          <CalendarIcon className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-md w-full">
        <SheetHeader>
          <SheetTitle>Financial Calendar</SheetTitle>
          <SheetDescription>View due dates for invoices and bills</SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-6 h-[calc(100vh-120px)]">
          <div className="border rounded-md p-4 flex justify-center bg-card">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md"
              modifiers={{
                hasEvent: (d) => events.some(e => isSameDay(e.date, d))
              }}
              modifiersClassNames={{
                hasEvent: "font-bold text-primary underline decoration-wavy"
              }}
            />
          </div>
          
          <div className="flex-1 overflow-hidden flex flex-col">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              {date ? format(date, "MMMM d, yyyy") : "Select a date"}
            </h3>
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-3">
                {selectedDateEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>No events for this date.</p>
                  </div>
                ) : (
                  selectedDateEvents.map((event, i) => (
                    <Card key={i} className={cn(
                      "border-l-4 transition-all hover:shadow-md",
                      event.type === 'invoice' ? "border-l-blue-500" : 
                      event.type === 'po' ? "border-l-emerald-500" : "border-l-amber-500"
                    )}>
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <p className="font-medium text-sm line-clamp-1" title={event.title}>{event.title}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className={cn(
                                "text-[10px] px-1 py-0 h-5",
                                event.type === 'invoice' ? "bg-blue-50 text-blue-700 border-blue-200" : 
                                event.type === 'po' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                "bg-amber-50 text-amber-700 border-amber-200"
                              )}>
                                {event.type === 'invoice' ? 'Receivable' : event.type === 'po' ? 'Purchase Order' : 'Payable'}
                              </Badge>
                              <span className="capitalize">{event.status}</span>
                            </div>
                          </div>
                          <div className="font-bold text-sm whitespace-nowrap">
                            R {Number(event.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
