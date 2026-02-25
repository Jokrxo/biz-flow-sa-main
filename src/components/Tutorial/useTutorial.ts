
import { useState, useEffect } from 'react';
import { TutorialStep } from '@/data/purchaseTutorialSteps';

export const useTutorial = (steps: TutorialStep[]) => {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem('purchase_tutorial_completed');
    if (completed === 'true') {
      setIsCompleted(true);
    } else {
      // Start tutorial automatically
      setIsActive(true);
    }
  }, []);

  const nextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      completeTutorial();
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const skipTutorial = () => {
    completeTutorial();
  };

  const completeTutorial = () => {
    setIsActive(false);
    setIsCompleted(true);
    localStorage.setItem('purchase_tutorial_completed', 'true');
  };

  const restartTutorial = () => {
    setIsActive(true);
    setCurrentStepIndex(0);
    setIsCompleted(false);
    localStorage.removeItem('purchase_tutorial_completed');
  };

  return {
    isActive,
    currentStepIndex,
    isCompleted,
    nextStep,
    prevStep,
    skipTutorial,
    restartTutorial
  };
};
