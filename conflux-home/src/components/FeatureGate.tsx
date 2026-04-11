import { useSubscription } from '../hooks/useSubscription';

type Plan = 'free' | 'power' | 'pro' | 'enterprise';

const FEATURE_REQUIREMENTS: Record<string, Plan[]> = {
  cloud_agents: ['power', 'pro', 'enterprise'],
  image_gen: ['power', 'pro', 'enterprise'],
  tts: ['power', 'pro', 'enterprise'],
  premium_models: ['pro', 'enterprise'],
};

const FEATURE_LABELS: Record<string, string> = {
  cloud_agents: 'Cloud Agents',
  image_gen: 'Image Generation',
  tts: 'Text-to-Speech',
  premium_models: 'Premium Models',
};

const MIN_PLAN_LABEL: Record<string, string> = {
  cloud_agents: 'Power',
  image_gen: 'Power',
  tts: 'Power',
  premium_models: 'Pro',
};

interface FeatureGateProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { plan, loading } = useSubscription();

  if (loading) return null;

  const allowedPlans = FEATURE_REQUIREMENTS[feature];
  if (!allowedPlans) {
    // Unknown feature — allow by default
    return <>{children}</>;
  }

  if (allowedPlans.includes(plan as Plan)) {
    return <>{children}</>;
  }

  if (fallback) return <>{fallback}</>;

  const requiredPlan = MIN_PLAN_LABEL[feature] ?? 'Power';
  const featureName = FEATURE_LABELS[feature] ?? feature;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 12,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 32 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
        Upgrade to {requiredPlan} to unlock {featureName}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320 }}>
        This feature requires a {requiredPlan} plan or higher.
      </div>
      <button
        onClick={() => {
          window.dispatchEvent(new CustomEvent('conflux:navigate', { detail: 'settings' }));
        }}
        style={{
          marginTop: 8,
          padding: '8px 20px',
          borderRadius: 8,
          border: 'none',
          background: 'var(--accent-primary, #6366f1)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Upgrade Now
      </button>
    </div>
  );
}
