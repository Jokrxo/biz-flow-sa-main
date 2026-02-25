import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard, Command } from "lucide-react";

interface KeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcuts = ({ isOpen, onClose }: KeyboardShortcutsProps) => {
  const shortcuts = [
    { key: "Ctrl + K", desc: "Open Search / Command Palette" },
    { key: "Ctrl + /", desc: "Open this Shortcuts Guide" },
    { key: "Esc", desc: "Close Modals / Clear Selection" },
    { key: "Enter", desc: "Confirm / Submit Forms" },
    { key: "Ctrl + S", desc: "Save Current Record (where supported)" },
    { key: "Ctrl + P", desc: "Print Report / Invoice" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-purple-600" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
              <span className="text-sm text-muted-foreground">{s.desc}</span>
              <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded border bg-muted px-2 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
