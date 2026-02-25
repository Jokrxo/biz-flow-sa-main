import React from 'react';
import { Loader2 } from 'lucide-react';
import { Progress } from "@/components/ui/progress";

interface SageLoadingOverlayProps {
  message?: string;
  progress?: number;
}

export const SageLoadingOverlay: React.FC<SageLoadingOverlayProps> = ({ 
  message = "Please Wait...", 
  progress 
}) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
      <div className="bg-white border shadow-xl rounded-sm p-6 w-[300px] flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
        <h3 className="text-lg font-semibold text-slate-800">{message}</h3>
        <Progress value={progress} className="w-full h-2 bg-slate-100" indicatorClassName="bg-[#0070ad]" />
        <div className="text-xs text-muted-foreground flex items-center gap-2">
           <Loader2 className="h-3 w-3 animate-spin text-[#0070ad]" />
           <span>Processing request...</span>
        </div>
      </div>
    </div>
  );
};
