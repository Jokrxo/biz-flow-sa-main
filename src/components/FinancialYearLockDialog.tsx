import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lock } from "lucide-react";

interface FinancialYearLockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FinancialYearLockDialog: React.FC<FinancialYearLockDialogProps> = ({
  open,
  onOpenChange,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[500px]">
        <AlertDialogHeader className="flex flex-col items-center gap-2">
          <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-2">
            <Lock className="h-6 w-6 text-red-600" />
          </div>
          <AlertDialogTitle className="text-xl text-center text-red-600 dark:text-red-400">
            Financial Period Closed
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-base font-medium text-foreground mt-2">
            This transaction was processed outside of the financial year setup. Please make sure the financial year has been set up correctly. To do this go to Settings.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center mt-4">
          <AlertDialogAction 
            onClick={() => onOpenChange(false)}
            className="bg-red-600 hover:bg-red-700 text-white min-w-[120px]"
          >
            Understood
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
