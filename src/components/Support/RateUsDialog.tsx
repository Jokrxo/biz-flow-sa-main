import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

type RateUsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { rating: number; comment: string }) => Promise<void> | void;
  onSkip: () => Promise<void> | void;
};

export const RateUsDialog = ({ open, onOpenChange, onSubmit, onSkip }: RateUsDialogProps) => {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = rating !== null && rating >= 1 && rating <= 5;

  const stars = useMemo(() => [1, 2, 3, 4, 5], []);

  const close = () => {
    onOpenChange(false);
    setRating(null);
    setComment("");
    setSubmitting(false);
  };

  const handleSkip = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSkip();
    } finally {
      close();
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ rating: rating as number, comment: comment.trim() });
    } finally {
      close();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Rate Rigel Business</DialogTitle>
          <DialogDescription>
            If you have 10 seconds, please rate your experience. This will only show once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-center gap-1">
            {stars.map((value) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "rounded-md p-2 transition-colors",
                  submitting ? "opacity-60" : "hover:bg-accent",
                )}
                onClick={() => setRating(value)}
                disabled={submitting}
                aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
              >
                <Star
                  className={cn(
                    "h-6 w-6 transition-colors",
                    rating !== null && value <= rating
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground",
                  )}
                />
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional: tell us what to improve..."
              className="min-h-[100px]"
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleSkip} disabled={submitting}>
            Not now
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

