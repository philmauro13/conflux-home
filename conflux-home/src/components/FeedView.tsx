// Conflux Home — Feed View (Ripple Radar Redesign)
// Tactical Intelligence aesthetic: Radar view, Signal Cards, Cognitive Sidebar, Briefing Overlay.

import { useState, useCallback } from 'react';
import { useBriefing } from '../hooks/useBriefing';
import { useRipples } from '../hooks/useRipples';
import { useSignalThreads } from '../hooks/useSignalThreads';
import { useCognitivePatterns } from '../hooks/useCognitivePatterns';
import { useContentFeed } from '../hooks/useFeed';
import RadarView from './RadarView';
import SignalCard from './SignalCard';
import CognitiveSidebar from './CognitiveSidebar';
import BriefingOverlay from './BriefingOverlay';
import GridBackground from './GridBackground';
import RadarBoot from './RadarBoot';
import RadarOnboarding, { hasCompletedRadarOnboarding } from './RadarOnboarding';
import type { RippleSignal } from '../types';

export default function FeedView() {
  // Hooks
  const { briefing, loading: briefingLoading, generating, generate } = useBriefing();
  const { ripples, loading: ripplesLoading, detect } = useRipples();
  const { threads, loading: threadsLoading, create } = useSignalThreads();
  const { pattern, loading: patternLoading, analyze } = useCognitivePatterns();
  const { items, loading: feedLoading, unreadCount } = useContentFeed();

  // State
  const [selectedSignal, setSelectedSignal] = useState<RippleSignal | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Boot → Onboarding state
  const [bootDone, setBootDone] = useState(() => localStorage.getItem('radar-boot-done') === 'true');
  const hasOnboarded = hasCompletedRadarOnboarding();
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Filter out dismissed signals
  const visibleRipples = ripples.filter(r => !dismissedIds.has(r.id));

  // Detect ripples handler
  const handleDetect = useCallback(async () => {
    await detect();
  }, [detect]);

  // Signal card handlers
  const handleSave = useCallback((signal: RippleSignal) => {
    // Remove from visible radar
    setDismissedIds(prev => new Set(prev).add(signal.id));
    // Clear selected so card disappears
    setSelectedSignal(null);
  }, []);

  const handleDismiss = useCallback((signal: RippleSignal) => {
    // Just close the card — leave the ripple on the radar
    setSelectedSignal(null);
  }, []);

  const handleSignalExpand = useCallback((signal: RippleSignal) => {
    console.log('Expanded signal:', signal.id);
  }, []);

  // Create signal thread from a ripple
  const handleCreateThread = useCallback(async (topic: string) => {
    await create(topic, '');
  }, [create]);

  // Generate briefing
  const handleGenerateBriefing = useCallback(async () => {
    await generate();
  }, [generate]);

  return (
    <>
      {/* ── Boot Sequence ── */}
      {!bootDone && (
        <RadarBoot
          onComplete={() => {
            localStorage.setItem('radar-boot-done', 'true');
            setBootDone(true);
          }}
        />
      )}

      {/* ── Onboarding Intelligence Briefing ── */}
      {bootDone && !hasOnboarded && !onboardingComplete && (
        <RadarOnboarding
          onComplete={() => setOnboardingComplete(true)}
        />
      )}

      {/* Grid Background */}
      <GridBackground />

      <div className="feed-radar-view">
        {/* ═══ Main Area ═══ */}
        <div className="feed-radar-main">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div>
              <h2 style={{
                fontFamily: 'var(--radar-font-header)',
                fontSize: '1.3rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                margin: 0,
                color: 'var(--radar-text-primary)',
              }}>
                Ripple Radar
              </h2>
              <p style={{
                fontFamily: 'var(--radar-font-mono)',
                fontSize: '0.7rem',
                color: 'var(--radar-text-muted)',
                margin: '4px 0 0 0',
              }}>
                {visibleRipples.length} active signal{visibleRipples.length !== 1 ? 's' : ''} · {unreadCount} unread
              </p>
            </div>

            <button
              className="briefing-trigger-btn"
              onClick={() => setBriefingOpen(true)}
            >
              🎯 Briefing
            </button>
          </div>

          {/* Radar View */}
          <div className="radar-header">
            <RadarView
              ripples={visibleRipples}
              loading={ripplesLoading}
              onBlipClick={(ripple) => setSelectedSignal(ripple)}
            />
          </div>

          {/* Detect button */}
          <div style={{ textAlign: 'center', margin: '16px 0' }}>
            <button
              className="briefing-trigger-btn"
              onClick={handleDetect}
              disabled={ripplesLoading}
            >
              {ripplesLoading ? '🔍 Scanning...' : '🌊 Scan for Signals'}
            </button>
          </div>

          {/* Selected Signal Card */}
          {selectedSignal && (
            <SignalCard
              signal={selectedSignal}
              onSave={handleSave}
              onDismiss={handleDismiss}
              onExpand={handleSignalExpand}
            />
          )}

          {/* Threads (below radar) */}
          {threads && threads.length > 0 && (
            <div style={{
              marginTop: '20px',
              padding: '16px',
              background: 'var(--radar-glass-bg)',
              border: '1px solid var(--radar-glass-border)',
              borderRadius: 'var(--radar-radius)',
            }}>
              <h4 style={{
                fontFamily: 'var(--radar-font-mono)',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--radar-text-muted)',
                margin: '0 0 12px 0',
              }}>
                Active Threads ({threads.length})
              </h4>
              {threads.slice(0, 3).map(thread => (
                <div
                  key={thread.id}
                  style={{
                    padding: '10px',
                    marginBottom: '8px',
                    background: 'var(--radar-surface)',
                    border: '1px solid var(--radar-border)',
                    borderRadius: 'var(--radar-radius-sm)',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--radar-font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--radar-text-primary)',
                    marginBottom: '4px',
                  }}>
                    {thread.topic}
                  </div>
                  <div style={{
                    fontSize: '0.7rem',
                    color: 'var(--radar-text-secondary)',
                  }}>
                    {thread.summary}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ Cognitive Sidebar ═══ */}
        <aside className="feed-radar-sidebar">
          <CognitiveSidebar
            pattern={pattern}
            loading={patternLoading}
            onAnalyze={analyze}
          />
        </aside>
      </div>

      {/* ═══ Briefing Overlay ═══ */}
      {briefingOpen && (
        <BriefingOverlay
          briefing={briefing}
          loading={briefingLoading}
          generating={generating}
          onClose={() => setBriefingOpen(false)}
          onGenerate={handleGenerateBriefing}
        />
      )}
    </>
  );
}
