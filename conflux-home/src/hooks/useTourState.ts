import { useState, useCallback } from 'react';

const TOUR_COMPLETED_KEY = 'conflux-tour-completed';
const TOUR_STEP_KEY = 'conflux-tour-step';

export interface TourState {
  isActive: boolean;
  currentStep: number;
  hasCompletedTour: boolean;
}

export function useTourState() {
  const [state, setState] = useState<TourState>(() => ({
    isActive: false,
    currentStep: 0,
    hasCompletedTour: localStorage.getItem(TOUR_COMPLETED_KEY) === 'true',
  }));

  const startTour = useCallback(() => {
    setState({ isActive: true, currentStep: 0, hasCompletedTour: false });
  }, []);

  const nextStep = useCallback(() => {
    setState(prev => ({ ...prev, currentStep: prev.currentStep + 1 }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setState(prev => ({ ...prev, currentStep: step }));
  }, []);

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    localStorage.removeItem(TOUR_STEP_KEY);
    setState({ isActive: false, currentStep: 0, hasCompletedTour: true });
  }, []);

  const skipTour = useCallback(() => {
    completeTour();
  }, [completeTour]);

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_COMPLETED_KEY);
    localStorage.removeItem(TOUR_STEP_KEY);
    setState({ isActive: false, currentStep: 0, hasCompletedTour: false });
  }, []);

  return {
    ...state,
    startTour,
    nextStep,
    goToStep,
    completeTour,
    skipTour,
    resetTour,
  };
}

export function shouldAutoStartTour(): boolean {
  return localStorage.getItem(TOUR_COMPLETED_KEY) !== 'true';
}
