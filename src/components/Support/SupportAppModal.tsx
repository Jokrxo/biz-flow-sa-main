import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StickyNote, DollarSign, CheckSquare, Keyboard, MessageCircle, Grip } from "lucide-react";

interface SupportAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNotes: () => void;
  onOpenCurrency: () => void;
  onOpenTasks: () => void;
  onOpenShortcuts: () => void;
  onOpenFeedback: () => void;
}

export const SupportAppModal = ({
  isOpen,
  onClose,
  onOpenNotes,
  onOpenCurrency,
  onOpenTasks,
  onOpenShortcuts,
  onOpenFeedback,
}: SupportAppModalProps) => {
  const apps = [
    { label: "Sticky Notes", icon: StickyNote, color: "text-yellow-500", bg: "bg-yellow-50", onClick: onOpenNotes },
    { label: "Currency Converter", icon: DollarSign, color: "text-green-600", bg: "bg-green-50", onClick: onOpenCurrency },
    { label: "Task Checklist", icon: CheckSquare, color: "text-blue-600", bg: "bg-blue-50", onClick: onOpenTasks },
    { label: "Shortcuts", icon: Keyboard, color: "text-purple-500", bg: "bg-purple-50", onClick: onOpenShortcuts },
    { label: "Feedback", icon: MessageCircle, color: "text-orange-500", bg: "bg-orange-50", onClick: onOpenFeedback },
  ];

  const handleAppClick = (action: () => void) => {
    onClose();
    setTimeout(action, 100); // Small delay for smooth transition
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Grip className="h-5 w-5 text-muted-foreground" />
            Support Apps
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4">
          {apps.map((app) => (
            <Button
              key={app.label}
              variant="outline"
              className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-muted/50 border-muted-foreground/20"
              onClick={() => handleAppClick(app.onClick)}
            >
              <div className={`h-10 w-10 rounded-full ${app.bg} flex items-center justify-center`}>
                <app.icon className={`h-5 w-5 ${app.color}`} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{app.label}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
