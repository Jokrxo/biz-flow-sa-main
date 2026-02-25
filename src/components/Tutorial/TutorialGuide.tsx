import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { TutorialOverlay } from './TutorialOverlay';
import { TutorialStep } from '@/data/purchaseTutorialSteps';

interface TutorialContextType {
  startTutorial: (moduleName: string, steps: TutorialStep[]) => void;
  restartTutorial: (moduleName: string, steps: TutorialStep[]) => void;
  stopTutorial: () => void;
  isActive: boolean;
  currentStepIndex: number;
  moduleName: string | null;
  isCompleted: (moduleName: string) => boolean;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const useTutorial = (steps?: TutorialStep[]) => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};

export const TutorialProvider = ({ children }: { children: ReactNode }) => {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [moduleName, setModuleName] = useState<string | null>(null);
  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const [completedModules, setCompletedModules] = useState<string[]>([]);

  // Load completed modules from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('rigel_completed_tutorials');
      if (stored) {
        setCompletedModules(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load completed tutorials", error);
    }
  }, []);

  const isCompleted = useCallback((module: string) => {
    return completedModules.includes(module);
  }, [completedModules]);

  const startTutorial = useCallback((module: string, tutorialSteps: TutorialStep[]) => {
    if (isCompleted(module)) {
      return; // Don't auto-start if already done
    }
    
    setModuleName(module);
    setSteps(tutorialSteps);
    setCurrentStepIndex(0);
    setIsActive(true);
  }, [isCompleted]);

  const restartTutorial = useCallback((module: string, tutorialSteps: TutorialStep[]) => {
    // Force start even if completed
    setModuleName(module);
    setSteps(tutorialSteps);
    setCurrentStepIndex(0);
    setIsActive(true);
  }, []);

  const stopTutorial = useCallback(() => {
    setIsActive(false);
    setModuleName(null);
    setSteps([]);
    setCurrentStepIndex(0);
  }, []);

  const completeTutorial = useCallback(() => {
    if (moduleName) {
      const newCompleted = [...completedModules, moduleName];
      // Remove duplicates just in case
      const uniqueCompleted = Array.from(new Set(newCompleted));
      setCompletedModules(uniqueCompleted);
      localStorage.setItem('rigel_completed_tutorials', JSON.stringify(uniqueCompleted));
    }
    stopTutorial();
  }, [moduleName, completedModules, stopTutorial]);

  const nextStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      // Final step completed
      completeTutorial();
    }
  }, [currentStepIndex, steps.length, completeTutorial]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);

  const skipTutorial = useCallback(() => {
    completeTutorial();
  }, [completeTutorial]);

  return (
    <TutorialContext.Provider value={{ 
      startTutorial, 
      restartTutorial,
      stopTutorial, 
      isActive, 
      currentStepIndex, 
      moduleName, 
      isCompleted, 
      nextStep, 
      prevStep, 
      skipTutorial 
    }}>
      {children}
      
      {isActive && steps.length > 0 && (
        <TutorialOverlay 
           steps={steps}
           currentStepIndex={currentStepIndex}
           isOpen={isActive}
           onNext={nextStep}
           onBack={prevStep}
           onSkip={skipTutorial}
        />
      )}
    </TutorialContext.Provider>
  );
};
