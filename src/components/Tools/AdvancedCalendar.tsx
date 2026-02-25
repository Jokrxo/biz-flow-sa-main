import { useState, useMemo } from "react";
import { DayPicker } from "react-day-picker";
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar as CalendarIcon, Plus, Trash2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import "react-day-picker/dist/style.css";

interface CalendarEvent {
  id: string;
  date: Date;
  title: string;
  type: 'tax' | 'meeting' | 'reminder' | 'custom';
}

interface AdvancedCalendarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdvancedCalendar = ({ isOpen, onClose }: AdvancedCalendarProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [newEventTitle, setNewEventTitle] = useState("");
  
  // Initialize with some tax dates and saved events
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    const saved = localStorage.getItem("rigel_calendar_events");
    const customEvents = saved ? JSON.parse(saved).map((e: any) => ({ ...e, date: new Date(e.date) })) : [];
    
    // Generate Tax Dates for current and next year
    const taxEvents: CalendarEvent[] = [];
    const today = new Date();
    const start = startOfMonth(addMonths(today, -1));
    const end = endOfMonth(addMonths(today, 12));
    const days = eachDayOfInterval({ start, end });

    days.forEach(day => {
      const d = day.getDate();
      const m = day.getMonth(); // 0-11
      
      // VAT (25th)
      if (d === 25) {
        taxEvents.push({ id: `vat-${day.toISOString()}`, date: day, title: "VAT Submission Due", type: 'tax' });
      }
      // PAYE (7th)
      if (d === 7) {
        taxEvents.push({ id: `paye-${day.toISOString()}`, date: day, title: "PAYE / UIF Due", type: 'tax' });
      }
      // Provisional Tax (Aug & Feb)
      if (d === 31 && m === 7) { // Aug
        taxEvents.push({ id: `prov-1-${day.toISOString()}`, date: day, title: "Provisional Tax (1st)", type: 'tax' });
      }
      if (d === 28 && m === 1) { // Feb (approx, handle leap year logic if strict but 28 is safe marker)
         taxEvents.push({ id: `prov-2-${day.toISOString()}`, date: day, title: "Provisional Tax (2nd)", type: 'tax' });
      }
    });

    return [...taxEvents, ...customEvents];
  });

  // Save custom events only
  const saveEvents = (currentEvents: CalendarEvent[]) => {
    const custom = currentEvents.filter(e => e.type !== 'tax');
    localStorage.setItem("rigel_calendar_events", JSON.stringify(custom));
  };

  const handleAddEvent = () => {
    if (!selectedDate || !newEventTitle.trim()) return;
    const newEvent: CalendarEvent = {
      id: Date.now().toString(),
      date: selectedDate,
      title: newEventTitle,
      type: 'custom'
    };
    const updated = [...events, newEvent];
    setEvents(updated);
    saveEvents(updated);
    setNewEventTitle("");
  };

  const handleDeleteEvent = (id: string) => {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated);
    saveEvents(updated);
  };

  const selectedDayEvents = useMemo(() => {
    return events.filter(e => selectedDate && isSameDay(e.date, selectedDate));
  }, [events, selectedDate]);

  const upcomingEvents = useMemo(() => {
    const today = new Date();
    return events
      .filter(e => e.date >= today)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 5);
  }, [events]);

  // Custom modifiers for day picker
  const modifiers = {
    tax: events.filter(e => e.type === 'tax').map(e => e.date),
    custom: events.filter(e => e.type === 'custom').map(e => e.date),
  };

  const modifiersStyles = {
    tax: { color: '#ef4444', fontWeight: 'bold' },
    custom: { color: '#3b82f6', fontWeight: 'bold' },
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl h-[700px] p-0 flex flex-col md:flex-row gap-0 overflow-hidden">
        
        {/* Left Side: Calendar */}
        <div className="flex-1 p-6 bg-background border-r flex flex-col items-center justify-start overflow-y-auto">
          <div className="flex items-center gap-2 mb-6 w-full">
            <CalendarIcon className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Tax & Events Calendar</h2>
          </div>

          <div className="bg-muted/30 p-4 rounded-xl border shadow-sm">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              modifiers={modifiers}
              modifiersStyles={modifiersStyles}
              className="p-0 m-0"
              classNames={{
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground font-bold",
              }}
            />
          </div>

          <div className="mt-8 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Legend</h3>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>SARS Deadlines</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span>My Events</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Details & Actions */}
        <div className="w-full md:w-96 bg-muted/10 flex flex-col h-full">
          <div className="p-6 border-b bg-background">
            <h3 className="font-semibold text-lg mb-1">
              {selectedDate ? format(selectedDate, 'EEEE, d MMMM yyyy') : 'Select a date'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {selectedDayEvents.length} events scheduled
            </p>
          </div>

          <ScrollArea className="flex-1 p-6">
            <div className="space-y-6">
              {/* Events for selected day */}
              <div className="space-y-3">
                {selectedDayEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                    <p>No events for this day</p>
                  </div>
                ) : (
                  selectedDayEvents.map(event => (
                    <div key={event.id} className={cn(
                      "p-3 rounded-lg border shadow-sm flex items-start justify-between group",
                      event.type === 'tax' ? "bg-red-50 border-red-100" : "bg-white"
                    )}>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {event.type === 'tax' && <AlertCircle className="h-4 w-4 text-red-500" />}
                          {event.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 capitalize">{event.type} Event</div>
                      </div>
                      {event.type !== 'tax' && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteEvent(event.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add New Event */}
              {selectedDate && (
                <div className="pt-4 border-t">
                  <label className="text-xs font-semibold text-muted-foreground mb-2 block">Add Event</label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="e.g. Client Meeting" 
                      value={newEventTitle}
                      onChange={(e) => setNewEventTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddEvent()}
                    />
                    <Button size="icon" onClick={handleAddEvent} disabled={!newEventTitle.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Upcoming Summary */}
              <div className="pt-6">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Coming Up Soon
                </h4>
                <div className="space-y-2">
                  {upcomingEvents.map(event => (
                    <div key={event.id} className="text-sm flex justify-between items-center py-2 border-b last:border-0">
                      <span className={cn("truncate max-w-[180px]", event.type === 'tax' ? "text-red-600 font-medium" : "")}>
                        {event.title}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {format(event.date, 'MMM d')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
