
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { TutorialStep } from '@/data/purchaseTutorialSteps';
import { cn } from "@/lib/utils";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";

interface TutorialOverlayProps {
  steps: TutorialStep[];
  currentStepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  isOpen: boolean;
}

export const TutorialOverlay = ({ steps, currentStepIndex, onNext, onBack, onSkip, isOpen }: TutorialOverlayProps) => {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const step = steps[currentStepIndex];
  const observerRef = useRef<ResizeObserver | null>(null);

  // Find target element logic
  useEffect(() => {
    if (!isOpen || !step) return;

    // Reset rect when step changes to avoid showing wrong highlight
    setTargetRect(null);

    let retries = 0;
    const maxRetries = 50; // 5 seconds approx
    const intervalId = setInterval(() => {
      const el = document.getElementById(step.targetId);
      if (el) {
        setTargetElement(el);
        updateRect(el);
        clearInterval(intervalId);
        
        // Scroll to element with a slight delay to allow for animations (like Dialog opening)
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          // Force update rect after scroll finishes
          setTimeout(() => updateRect(el), 500);
        }, 300);
      } else {
        retries++;
        if (retries >= maxRetries) {
          clearInterval(intervalId);
          console.warn(`Tutorial target not found: ${step.targetId}`);
        }
      }
    }, 100);

    return () => clearInterval(intervalId);
  }, [step, isOpen]);

  // Update rect on resize/scroll
  const updateRect = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    
    // Safety check for zero-size elements (e.g. hidden or not yet layouted)
    if (rect.width === 0 || rect.height === 0) {
      setTargetRect(null);
      return;
    }

    // Add some padding
    const padding = 4;
    setTargetRect(new DOMRect(
      rect.left - padding,
      rect.top - padding,
      rect.width + padding * 2,
      rect.height + padding * 2
    ));
  }, []);

  useEffect(() => {
    if (!targetElement) return;

    let animationFrameId: number;

    const updateLoop = () => {
      updateRect(targetElement);
      animationFrameId = requestAnimationFrame(updateLoop);
    };

    // Start loop
    updateLoop();

    // Listener for scroll/resize as backup
    window.addEventListener('scroll', () => updateRect(targetElement), true);
    window.addEventListener('resize', () => updateRect(targetElement));

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('scroll', () => updateRect(targetElement), true);
      window.removeEventListener('resize', () => updateRect(targetElement));
    };
  }, [targetElement, updateRect]);

  // Handle user interaction with the target
  useEffect(() => {
    if (!targetElement || !step) return;

    const handleInteraction = (e: Event) => {
      // For click actions, we want to allow the event to propagate to the app
      // but also advance the tutorial.
      // We use a small timeout to let the app react first (e.g. open dialog)
      if (step.action === 'click' && e.type === 'click') {
        setTimeout(onNext, 100); 
      }
      if (step.action === 'input' && (e.type === 'input' || e.type === 'change')) {
        // For input, we don't auto-advance immediately, we just enable the Next button?
        // Or user instructions say "Next (only enabled when step condition is met)"
        // But for "Action: input", usually we wait for user to finish?
        // The prompt says "Action: input", "Text: Enter ...".
        // Let's assume we enable the 'Next' button when they type.
        // Actually, for simplicity and flow, let's just listen for 'blur' or just let them click 'Next'.
        // Wait, "Next (only enabled when step condition is met)".
        // I'll make the Next button enabled if action is 'view'.
        // If action is 'click', the user MUST click the target to advance (Next button disabled or hidden).
        // If action is 'input', the user types, then clicks Next.
      }
    };

    if (step.action === 'click') {
      targetElement.addEventListener('click', handleInteraction);
    }
    
    // For inputs, we might want to detect if they typed something to enable the button
    // But for now, let's rely on the manual Next button for inputs, 
    // and auto-advance for clicks on buttons/tabs.

    return () => {
      if (step.action === 'click') {
        targetElement.removeEventListener('click', handleInteraction);
      }
    };
  }, [targetElement, step, onNext]);

  if (!isOpen || !step || !targetRect) return null;

  // Calculate overlay paths
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  // Tooltip position
  let tooltipStyle: React.CSSProperties = {};
  const tooltipWidth = 320;
  const gap = 12;

  if (step.position === 'right') {
    tooltipStyle = { top: targetRect.top, left: targetRect.right + gap };
  } else if (step.position === 'left') {
    tooltipStyle = { top: targetRect.top, left: targetRect.left - tooltipWidth - gap };
  } else if (step.position === 'top') {
    tooltipStyle = { top: targetRect.top - gap - 150, left: targetRect.left }; // approximate height
  } else {
    // Default bottom
    tooltipStyle = { top: targetRect.bottom + gap, left: targetRect.left };
  }

  // Adjust if off screen
  if ((tooltipStyle.left as number) + tooltipWidth > windowWidth) {
    tooltipStyle.left = windowWidth - tooltipWidth - 20;
  }
  if ((tooltipStyle.left as number) < 0) {
    tooltipStyle.left = 20;
  }

  // Helper to determine if Next is enabled
  // For 'click' actions, the user should click the element itself, so disable Next?
  // Or just let them click Next to skip the action?
  // The prompt says "Next (only enabled when step condition is met)".
  // If action is 'click', the condition is "clicked".
  // If action is 'input', the condition is "inputted".
  // To simplify: I'll always enable Next for 'view' and 'input'.
  // For 'click', I'll hide Next or disable it, telling them to "Click the highlighted element".
  const isNextEnabled = step.action !== 'click';

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Overlay: 4 divs around the target to create a hole */}
      {/* Top */}
      <div className="absolute bg-black/50 pointer-events-auto transition-all duration-300"
        style={{ top: 0, left: 0, right: 0, height: targetRect.top }} />
      {/* Bottom */}
      <div className="absolute bg-black/50 pointer-events-auto transition-all duration-300"
        style={{ top: targetRect.bottom, left: 0, right: 0, bottom: 0 }} />
      {/* Left */}
      <div className="absolute bg-black/50 pointer-events-auto transition-all duration-300"
        style={{ top: targetRect.top, left: 0, width: targetRect.left, height: targetRect.height }} />
      {/* Right */}
      <div className="absolute bg-black/50 pointer-events-auto transition-all duration-300"
        style={{ top: targetRect.top, left: targetRect.right, right: 0, height: targetRect.height }} />

      {/* Highlight Border */}
      <div 
        className="absolute border-2 border-white shadow-[0_0_0_4px_rgba(0,0,0,0.3)] rounded-md pointer-events-none transition-all duration-300"
        style={{
          top: targetRect.top,
          left: targetRect.left,
          width: targetRect.width,
          height: targetRect.height,
        }}
      />

      {/* Tooltip */}
      <div 
        className="absolute pointer-events-auto bg-white dark:bg-slate-900 rounded-lg shadow-xl p-4 w-[320px] transition-all duration-300 flex flex-col gap-3 border border-slate-200 dark:border-slate-800"
        style={tooltipStyle}
      >
        <div className="flex justify-between items-start">
          <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">{step.title}</h3>
          <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 -mt-2" onClick={onSkip}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {step.content}
        </p>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-400 font-medium">
            Step {currentStepIndex + 1} of {steps.length}
          </span>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onBack} 
              disabled={currentStepIndex === 0}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            {step.action === 'click' ? (
               // For click actions, guide them to click the element
               <div className="text-xs text-amber-600 font-medium flex items-center px-2">
                 Click highlighted element
               </div>
            ) : (
              <Button 
                size="sm" 
                onClick={onNext}
                className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {currentStepIndex === steps.length - 1 ? 'Finish' : 'Next'}
                {currentStepIndex !== steps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
