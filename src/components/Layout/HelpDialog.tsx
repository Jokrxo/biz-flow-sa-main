import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, BookOpen, Video, MessageSquare, Play } from "lucide-react";

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDocs: () => void;
  onStartTutorial?: () => void;
}

export const HelpDialog = ({ open, onOpenChange, onOpenDocs, onStartTutorial }: HelpDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Help & Support
          </DialogTitle>
          <DialogDescription>
            Get assistance with Rigel Business
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {onStartTutorial && (
            <Button variant="outline" className="h-auto py-4 justify-start gap-4" onClick={() => { onOpenChange(false); onStartTutorial(); }}>
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <Play className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="font-semibold">Interactive Tutorial</div>
                <div className="text-xs text-muted-foreground">Restart the step-by-step guide</div>
              </div>
            </Button>
          )}

          <Button variant="outline" className="h-auto py-4 justify-start gap-4" onClick={() => { onOpenChange(false); onOpenDocs(); }}>
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="font-semibold">Documentation</div>
              <div className="text-xs text-muted-foreground">Read guides and API docs</div>
            </div>
          </Button>
          
          <Button variant="outline" className="h-auto py-4 justify-start gap-4" onClick={() => { onOpenChange(false); onOpenDocs(); }}>
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <Video className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="font-semibold">Video Tutorials</div>
              <div className="text-xs text-muted-foreground">Watch how-to videos</div>
            </div>
          </Button>

          <Button variant="outline" className="h-auto py-4 justify-start gap-4">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="font-semibold">Contact Support</div>
              <div className="text-xs text-muted-foreground">Chat with our team</div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
