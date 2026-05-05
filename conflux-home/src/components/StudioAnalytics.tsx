import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { StudioGeneration, StudioUsageStats, STUDIO_MODULES, StudioModule } from '../types';

interface StudioAnalyticsProps {
  generations: StudioGeneration[];
  onClose: () => void;
}

export default function StudioAnalytics({ generations, onClose }: StudioAnalyticsProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<StudioUsageStats[]>([]);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Compute current month as YYYY-MM
  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        // Get user ID
        const uid = await invoke<string>('get_studio_user_id');
        setUserId(uid);

        // Fetch usage stats for current month
        const usage = await invoke<StudioUsageStats[]>('studio_get_usage', { userId: uid, month: currentMonth });
        setUsageStats(usage);

        // Fetch credit balance
        const balanceResult = await invoke<{ balance: number }>('get_credit_balance', { userId: uid });
        setCreditBalance(balanceResult.balance);
      } catch (e) {
        console.error('Failed to load analytics:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [currentMonth]);

  // Derived: total monthly spend (dollars)
  const monthlySpend = useMemo(() => {
    const totalCents = usageStats.reduce((sum, stat) => sum + stat.total_cost_cents, 0);
    return (totalCents / 100).toFixed(2);
  }, [usageStats]);

  // Derived: max cost for bar chart scaling
  const maxModuleCost = useMemo(() => {
    if (usageStats.length === 0) return 1;
    return Math.max(...usageStats.map((s) => s.total_cost_cents));
  }, [usageStats]);

  // Derived: top prompts (aggregate by prompt text, count, sort desc)
  const topPrompts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const gen of generations) {
      const prompt = gen.prompt.trim();
      if (prompt) {
        counts[prompt] = (counts[prompt] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([prompt, count]) => ({ prompt, count }));
  }, [generations]);

  // Derived: speed stats (mock values — real latency tracking not yet implemented)
  // Using typical generation times per module (seconds)
  const speedStats = useMemo(() => {
    const moduleIcons = STUDIO_MODULES;
    // Placeholder averages — replace with real timestamp diff when available
    const mockSpeeds: Record<string, number> = {
      image: 4.2,
      voice: 2.8,
      video: 8.5,
      music: 12.3,
      code: 3.1,
      design: 4.7,
    };
    return (Object.keys(moduleIcons) as StudioModule[]).map((module) => ({
      module,
      icon: moduleIcons[module].icon,
      avgSeconds: mockSpeeds[module] || 0,
    }));
  }, []);

  // Derived: success rate per model (from generations with status complete/failed)
  // Not rendered in 2x2 layout above, but could be added as a tooltip or detail view later.
  // For now, kept internal.

  // Ring geometry: 70% fill (as spec) — ring circumference ~ 2πr, r=28 → ~176
  const ringRadius = 28;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * 0.7; // 70%

  if (loading) {
    return (
      <div className="analytics-loading" style={{ padding: '40px', textAlign: 'center', color: 'var(--studio-text-dim)' }}>
        Loading analytics...
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className="studio-analytics-content"
      >
        {/* Close button */}
        <button className="analytics-close-btn" onClick={onClose} title="Close analytics">
          ✕
        </button>

        <div className="analytics-grid">
          {/* Card 1: Credits */}
          <div className="analytics-card">
            <div className="analytics-card-title">Credits</div>
            <div className="analytics-credits-ring">
              <div style={{ position: 'relative' }}>
                <svg className="credits-ring-svg" viewBox="0 0 64 64">
                  <circle className="credits-ring-bg" cx="32" cy="32" r={ringRadius} />
                  <circle
                    className="credits-ring-progress"
                    cx="32"
                    cy="32"
                    r={ringRadius}
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringOffset}
                  />
                </svg>
                <div className="credits-ring-center">
                  <span>{creditBalance ?? '--'}</span>
                  <span className="credits-ring-label">remaining</span>
                </div>
              </div>
              <div className="credits-info">
                <div className="credits-current">${monthlySpend} spent</div>
                <div className="credits-monthly">this month</div>
              </div>
            </div>
          </div>

          {/* Card 2: Cost by Module */}
          <div className="analytics-card">
            <div className="analytics-card-title">Cost by Module</div>
            <div className="analytics-cost-bars">
              {usageStats.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--studio-text-dim)', padding: '8px 0' }}>
                  No usage data yet
                </div>
              ) : (
                usageStats
                  .sort((a, b) => b.total_cost_cents - a.total_cost_cents)
                  .slice(0, 6)
                  .map((stat) => {
                    const module = stat.module as StudioModule;
                    const icon = STUDIO_MODULES[module]?.icon || '•';
                    const percent = (stat.total_cost_cents / maxModuleCost) * 100;
                    return (
                      <div key={stat.module} className="cost-bar-item">
                        <div className="cost-bar-header">
                          <span className="cost-bar-label">
                            <span className="cost-module-icon">{icon}</span>
                            {module}
                          </span>
                          <span className="cost-bar-value">${(stat.total_cost_cents / 100).toFixed(2)}</span>
                        </div>
                        <div className="cost-bar-track">
                          <div
                            className="cost-bar-fill"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Card 3: Speed Stats */}
          <div className="analytics-card">
            <div className="analytics-card-title">Generation Speed</div>
            <div className="analytics-speed-list">
              {speedStats.map(({ module, icon, avgSeconds }) => (
                <div key={module} className="speed-item">
                  <span className="speed-module">
                    <span>{icon}</span>
                    {module}
                  </span>
                  <span className="speed-value">{avgSeconds.toFixed(1)}s avg</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 4: Top Prompts */}
          <div className="analytics-card">
            <div className="analytics-card-title">Top Prompts</div>
            <div className="analytics-prompts-list">
              {topPrompts.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--studio-text-dim)', padding: '8px 0' }}>
                  No prompts yet
                </div>
              ) : (
                topPrompts.map(({ prompt, count }) => (
                  <div key={prompt} className="prompt-item">
                    <span className="prompt-text" title={prompt}>
                      {prompt}
                    </span>
                    <span className="prompt-count">×{count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
