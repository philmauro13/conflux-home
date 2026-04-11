import { useState, useEffect, useCallback, useRef } from 'react';
import { getAgentIntroConfig, AgentIntroConfig } from '../data/agent-intro-data';
import { useIntroductions } from '../hooks/useIntroductions';
import { playAgentWake } from '../lib/sound';
import '../styles-agent-introductions.css';

// Map app view IDs to agent intro config IDs
const VIEW_TO_AGENT: Record<string, string> = {
  kitchen: 'hearth',
  budget: 'pulse',
  dreams: 'horizon',
  life: 'orbit',
  feed: 'current',
  home: 'foundation',
  games: 'games',
  marketplace: 'marketplace',
  agents: 'agents',
  studio: 'studio',
  vault: 'vault',
  echo: 'echo',
  settings: 'settings',
};

interface AgentIntroductionsProps {
  userName: string;
  selectedAgentIds: string[];
  userId: string;
  familyMemberId?: string;
  onComplete: () => void;
}

export default function AgentIntroductions({
  userName,
  selectedAgentIds,
  userId,
  familyMemberId,
  onComplete,
}: AgentIntroductionsProps) {
  const [entering, setEntering] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [cardAnim, setCardAnim] = useState<'enter' | 'exit'>('enter');

  // Determine agent order: selected agents first, then Conflux last
  const orderedAgentIds = useCallback(() => {
    const agentIds = selectedAgentIds
      .map(id => VIEW_TO_AGENT[id] ?? id)
      .filter(id => id !== 'conflux');
    const validIds = agentIds.filter(id => getAgentIntroConfig(id));
    // Don't add conflux as a separate card — just complete with conflux intro
    if (!validIds.includes('conflux')) validIds.push('conflux');
    return validIds;
  }, [selectedAgentIds]);

  const agentIds = orderedAgentIds();

  if (agentIds.length === 0) {
    onComplete();
    return null;
  }

  const {
    currentStep,
    inputs,
    completed,
    nextStep,
    skipRemaining,
    setInput,
    saveInputs,
  } = useIntroductions(userId, familyMemberId, agentIds, onComplete);

  const currentAgentId = agentIds[currentStep];
  const currentConfig = getAgentIntroConfig(currentAgentId);

  // Play agent wake sound when agent changes
  useEffect(() => {
    if (currentAgentId) {
      playAgentWake(currentAgentId);
    }
  }, [currentAgentId]);

  // Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setEntering(false), 50);
    return () => clearTimeout(timer);
  }, []);

  // Handle skip
  const handleSkip = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      skipRemaining();
    }, 300);
  }, [skipRemaining]);

  // Handle "Next" with card transition
  const handleNext = useCallback(() => {
    if (!currentConfig) return;
    if (currentConfig.id === 'conflux') {
      setExiting(true);
      setTimeout(() => {
        saveInputs();
        onComplete();
      }, 300);
    } else {
      // Animate card out, then advance
      setCardAnim('exit');
      // After card exit animation completes, advance step and animate card in
      setTimeout(() => {
        nextStep();
        setCardAnim('enter');
      }, 300);
    }
  }, [currentConfig, nextStep, saveInputs, onComplete]);

  if (!currentConfig) return null;

  // Build badge items from starter config
  const badges: string[] = [];
  if (currentConfig.starterConfig.defaultPantryItems) {
    badges.push(`🥘 ${currentConfig.starterConfig.defaultPantryItems.length} pantry staples pre-loaded`);
  }
  if (currentConfig.starterConfig.defaultBudgetCategories) {
    badges.push(`📊 ${currentConfig.starterConfig.defaultBudgetCategories.length} budget categories ready`);
  }
  if (currentConfig.starterConfig.dreamTemplates) {
    badges.push(`🎯 ${currentConfig.starterConfig.dreamTemplates.length} dream templates`);
  }
  if (currentConfig.starterConfig.focusAreas) {
    badges.push(`🪐 ${currentConfig.starterConfig.focusAreas.length} focus areas`);
  }

  // Progress dots
  const progressDots = agentIds.map((_, index) => {
    let dotClass = 'ai-dot';
    if (index === currentStep) dotClass += ' active';
    else if (index < currentStep) dotClass += ' done';
    return <div key={index} className={dotClass} />;
  });

  // Build starter badge list
  const isConflux = currentConfig.id === 'conflux';

  return (
    <div
      className={`ai-overlay ${entering ? 'entering' : ''} ${exiting ? 'exiting' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Skip button */}
      <button className="ai-skip" onClick={handleSkip}>
        Skip
      </button>

      {/* Content layer — single card centered */}
      <div className="ai-content" data-agent={currentConfig.id}>
        <div className={`ai-card ${cardAnim === 'enter' ? 'entering' : 'exiting'}`}>
          {/* Animated agent emblem */}
          <div className="ai-emblem">
            {currentConfig.emoji}
          </div>

          {/* Agent name */}
          <div className="ai-name">{currentConfig.name}</div>

          {/* Intro text */}
          <div className="ai-intro">{currentConfig.introText}</div>

          {/* Starter badges */}
          {badges.length > 0 && (
            <div className="ai-badges">
              {badges.map((b, i) => (
                <div key={i} className="ai-badge">{b}</div>
              ))}
            </div>
          )}

          {/* Input field (except for Conflux) */}
          {!isConflux && currentConfig.placeholder && (
            <div className="ai-input-wrap">
              <label className="ai-input-label">{currentConfig.inputLabel}</label>
              <input
                type="text"
                className="ai-input"
                placeholder={currentConfig.placeholder}
                value={inputs[currentConfig.id] || ''}
                onChange={(e) => setInput(currentConfig.id, e.target.value)}
                autoFocus
              />
            </div>
          )}

          {/* Action button */}
          <button className="ai-action" onClick={handleNext}>
            {isConflux ? "Let's go! →" : "Next →"}
          </button>
        </div>

        {/* Progress dots */}
        <div className="ai-progress">
          {progressDots}
        </div>
      </div>
    </div>
  );
}
