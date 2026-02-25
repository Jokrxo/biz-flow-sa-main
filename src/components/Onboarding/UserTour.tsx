import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface TourStep {
  title: string;
  description: string;
  actionLabel?: string;
  navigateTo?: string;
}

interface UserTourProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
}

export const UserTour = ({ open, onOpenChange, userId }: UserTourProps) => {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);

  const steps: TourStep[] = [
    {
      title: "Welcome to Rigel Business",
      description: "This quick tour highlights core actions. You can skip any time.",
    },
    {
      title: "Add a Transaction",
      description: "Go to Transactions to add income or expense entries, with VAT handled correctly.",
      actionLabel: "Open Transactions",
      navigateTo: "/transactions",
    },
    {
      title: "Create an Invoice",
      description: "Use Sales → Invoices to issue invoices and track payments.",
      actionLabel: "Open Invoices",
      navigateTo: "/invoices",
    },
    {
      title: "Manage Purchases",
      description: "Record supplier bills and product purchases under Purchase.",
      actionLabel: "Open Purchase",
      navigateTo: "/purchase",
    },
    {
      title: "Bank & Reconcile",
      description: "Add bank accounts and keep balances in sync.",
      actionLabel: "Open Bank",
      navigateTo: "/bank",
    },
    {
      title: "That’s it",
      description: "You’re set. Access Help anytime from the Dashboard.",
    },
  ];

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
  }, [open]);

  const markCompleted = () => {
    try {
      const uid = userId ? String(userId) : "anonymous";
      localStorage.setItem(`user_tour_completed_${uid}`, "true");
      localStorage.removeItem("just_logged_in");
    } catch {}
  };

  const closeTour = () => {
    markCompleted();
    onOpenChange(false);
  };

  const next = () => {
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
    else closeTour();
  };

  const prev = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  const action = () => {
    const step = steps[stepIndex];
    if (step.navigateTo) {
      navigate(step.navigateTo);
    }
  };

  const step = steps[stepIndex];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeTour(); else onOpenChange(o); }}>
      <DialogContent className={cn("sm:max-w-[560px] p-4")}> 
        <DialogHeader>
          <DialogTitle>{step.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>{step.description}</p>
          <div className="flex items-center gap-3 mt-3">
            <img src="/logo.png" alt="Rigel Business" className="h-10 w-10 rounded-full object-cover" />
            <span className="text-base font-semibold">Rigel Business</span>
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={prev} disabled={stepIndex === 0}>Back</Button>
            <Button variant="outline" onClick={closeTour}>Skip</Button>
          </div>
          <div className="flex items-center gap-2">
            {step.actionLabel && (
              <Button variant="outline" onClick={action}>{step.actionLabel}</Button>
            )}
            <Button onClick={next}>{stepIndex < steps.length - 1 ? "Next" : "Finish"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

