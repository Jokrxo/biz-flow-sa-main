import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface LoadingSpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export const LoadingSpinner = ({ className, size = "md" }: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="relative">
        {/* Transformer-inspired loader */}
        <div className={cn("relative", sizeClasses[size])}>
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-spin" 
               style={{ animationDuration: "2s" }} />
          
          {/* Middle ring */}
          <div className="absolute inset-2 rounded-full border-4 border-accent/40 animate-spin" 
               style={{ animationDuration: "1.5s", animationDirection: "reverse" }} />
          
          {/* Inner core */}
          <div className="absolute inset-4 rounded-full bg-gradient-primary animate-pulse" />
          
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Rigel Business"
              className="w-2/3 h-2/3 rounded-full object-cover"
              onError={(e) => { (e.currentTarget.style.display = 'none'); }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const PageLoader = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        // Random increment between 5 and 15
        const increment = Math.floor(Math.random() * 10) + 5;
        return Math.min(prev + increment, 100);
      });
    }, 200);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="fixed top-0 left-0 w-full h-1 bg-muted">
        <div className="h-1 bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="fixed bottom-4 right-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/80 backdrop-blur shadow">
          <LoadingSpinner size="sm" />
          <span className="text-xs text-muted-foreground">Loading…</span>
        </div>
      </div>
    </div>
  );
};
