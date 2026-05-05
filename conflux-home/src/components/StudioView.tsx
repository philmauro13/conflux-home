import { useEffect, useState } from 'react';
import StudioDashboard from './StudioDashboard';
import StudioOnboarding from './StudioOnboarding';

export default function StudioView() {
  const [showOnboarding, setShowOnboarding] = useState(true);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  return (
    <>
      <StudioDashboard />
      {showOnboarding && <StudioOnboarding onComplete={handleOnboardingComplete} />}
    </>
  );
}
