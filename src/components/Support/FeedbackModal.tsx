import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackModal = ({ isOpen, onClose }: FeedbackModalProps) => {
  const [type, setType] = useState("feedback");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = () => {
    // Simulate sending
    setTimeout(() => {
      setSent(true);
      setTimeout(() => {
        onClose();
        setSent(false);
        setMessage("");
        setType("feedback");
      }, 2000);
    }, 800);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-orange-500" />
            Send Feedback
          </DialogTitle>
          <DialogDescription>
            Help us improve Rigel Business. Report a bug or suggest a feature.
          </DialogDescription>
        </DialogHeader>

        {!sent ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>I want to...</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feedback">Give General Feedback</SelectItem>
                  <SelectItem value="bug">Report a Bug</SelectItem>
                  <SelectItem value="feature">Request a Feature</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea 
                placeholder="Tell us more..." 
                className="min-h-[120px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in zoom-in-95">
            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center text-green-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold">Thank You!</h3>
            <p className="text-muted-foreground text-sm max-w-[250px]">
              Your feedback has been received. We appreciate your input.
            </p>
          </div>
        )}

        {!sent && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!message.trim()} className="gap-2">
              <Send className="h-4 w-4" /> Send
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
