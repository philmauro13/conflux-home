// Conflux Home — Life Autopilot View (Orbit)
// Focus engine, morning brief, habits, smart reschedule, nudges, heatmap.

import { triggerFairyNudge } from '../lib/triggerFairyNudge';
import { useState, useCallback, useEffect } from 'react';
import { useOrbit } from '../hooks/useOrbit';
import { playOrbitMorningBrief } from '../lib/sound';
import type { LifeTask, LifeHabit, LifeNudge, LifeDailyFocus } from '../types';
import { MicButton } from './voice';
import { MissionControlHeader } from './MissionControlHeader';
import OrbitBoot from './OrbitBoot';
import OrbitOnboarding, { hasCompletedOrbitOnboarding } from './OrbitOnboarding';
import { HorizonLine } from './HorizonLine';
import { TelemetryGrid } from './TelemetryGrid';
import { AlertConsole } from './AlertConsole';
import { QuickLogModal } from './QuickLogModal';
import { InsightCards } from './InsightCards';

/* ── Config ──────────────────────────────────── */

const PRIORITY_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  urgent: { emoji: '🔴', color: '#ef4444', label: 'Urgent' },
  high:   { emoji: '🟠', color: '#f97316', label: 'High' },
  medium: { emoji: '🟡', color: '#f59e0b', label: 'Medium' },
  normal: { emoji: '🟡', color: '#f59e0b', label: 'Normal' },
  low:    { emoji: '🟢', color: '#10b981', label: 'Low' },
};

const ENERGY_EMOJI: Record<string, string> = {
  high: '⚡', medium: '🔋', low: '🌙',
};

const CATEGORY_EMOJI: Record<string, string> = {
  health: '💪', work: '💼', personal: '🧑', family: '👨‍👩‍👧‍👦',
  finance: '💰', learning: '📚', creative: '🎨', home: '🏠',
};

const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
};

/* ── Helpers ─────────────────────────────────── */

function daysUntil(date: string): number {
  return Math.ceil((new Date(date + 'T23:59:59').getTime() - Date.now()) / 86400000);
}

function dueLabel(date: string): string {
  const d = daysUntil(date);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d <= 7) return `${d}d`;
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dueColor(date: string): string {
  const d = daysUntil(date);
  if (d < 0) return '#ef4444';
  if (d <= 1) return '#f97316';
  if (d <= 3) return '#f59e0b';
  return '#6b7280';
}

/* ── Heatmap ─────────────────────────────────── */

function HeatmapRow({ completedToday }: { completedToday: number }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return { label: d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0), isToday: i === 6 };
  });
  return (
    <div className="mc-heatmap">
      <div className="mc-heatmap-label">Activity Telemetry</div>
      <div className="mc-heatmap-cells">
        {days.map((d, i) => (
          <div key={i} className={`mc-heatmap-cell ${d.isToday ? 'today' : ''} ${d.isToday && completedToday > 0 ? 'active' : ''}`}
            title={d.isToday ? `${completedToday} completed today` : ''}>
            <span>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main View ───────────────────────────────── */

export default function LifeAutopilotView() {
  const {
    dashboard, loading, addTask, completeTask, deleteTask,
    addHabit, logHabit, addFocus, morningBrief, smartReschedule,
    parseInput, dismissNudge,
  } = useOrbit();

  /* Quick Log Modal State */
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);

  /* Boot → Onboarding state */
  const [bootDone, setBootDone] = useState(() => localStorage.getItem('orbit-boot-done') === 'true');
  const hasOnboarded = hasCompletedOrbitOnboarding();
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  /* Keyboard shortcut for Quick Log (Cmd/Ctrl + L) */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        setIsQuickLogOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* Morning brief */
  const [briefText, setBriefText] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);

  /* Natural language input */
  const [nlInput, setNlInput] = useState('');
  const [nlParsing, setNlParsing] = useState(false);
  const [parseFeedback, setParseFeedback] = useState<string | null>(null);

  /* Reschedule toast */
  const [rescheduleResult, setRescheduleResult] = useState<string | null>(null);

  const handleMorningBrief = useCallback(async () => {
    if (briefLoading) return;
    setBriefLoading(true); setBriefText('');
    try {
      const brief = await morningBrief();
      setBriefText(brief);
      // Play startup sound when brief is generated
      playOrbitMorningBrief();
    }
    catch { setBriefText('Failed to generate brief. Try again.'); }
    finally { setBriefLoading(false); }
  }, [briefLoading, morningBrief]);

  const handleParseInput = useCallback(async (input: string) => {
    if (!input.trim() || nlParsing) return;
    setNlParsing(true);
    try {
      const result = await parseInput(input);
      if (result.action === 'habit') {
        // Pass to habit handler if available
        setParseFeedback('✓ Added habit');
      } else {
        await addTask(
          result.title || input,
          result.category,
          result.priority,
          result.due_date,
          result.energy_type,
        );
        const extras: string[] = [];
        if (result.due_date) extras.push(`📅 ${result.due_date}`);
        if (result.priority) extras.push(`${result.priority} priority`);
        if (result.category) extras.push(`${result.category}`);
        const extraStr = extras.length > 0 ? ` (${extras.join(', ')})` : '';
        setParseFeedback(`✓ Added${extraStr}`);
      }
      setTimeout(() => setParseFeedback(null), 2000);
    } catch {
      await addTask(input);
    } finally {
      setNlInput('');
      setNlParsing(false);
    }
  }, [nlParsing, parseInput, addTask]);

  const handleAddTask = useCallback(async (title: string, category?: string, priority?: string, dueDate?: string, energyType?: string) => {
    await addTask(title, category, priority, dueDate, energyType);
  }, [addTask]);

  const handleReschedule = useCallback(async (taskId: string) => {
    try {
      const s = await smartReschedule(taskId);
      setRescheduleResult(s.suggested_time ? `Suggested: ${s.suggested_time}${s.reason ? ` — ${s.reason}` : ''}` : 'No better time found.');
    } catch { setRescheduleResult('Reschedule failed.'); }
    setTimeout(() => setRescheduleResult(null), 5000);
  }, [smartReschedule]);

  /* Derived data */
  const focus = dashboard?.today_focus ?? [];
  const tasks = dashboard?.pending_tasks ?? [];
  const completedTasks = dashboard?.completed_tasks ?? [];
  const habits = dashboard?.active_habits ?? [];
  const nudges = dashboard?.nudges ?? [];
  const streakTotal = dashboard?.streak_total ?? 0;
  const completedToday = dashboard?.completed_today ?? 0;
  
  // Calculate total tasks scheduled for today (completed + pending)
  const pendingToday = tasks.filter(t => {
    if (!t.due_date) return false;
    const today = new Date().toISOString().split('T')[0];
    return t.due_date === today;
  }).length;
  const totalTasksToday = completedToday + pendingToday;
  
  // Calculate weekly trend (placeholder - would need historical data for real trend)
  // For now, using a simple heuristic: compare today's completion against a baseline
  // TODO: Pull 7-day historical data from backend for accurate trend
  const trendPct = totalTasksToday > 0 
    ? ((completedToday / totalTasksToday) * 100) - 60 // Assume 60% baseline
    : 0;
  
  // Ensure trend is never undefined
  const safeTrendPct = trendPct ?? 0;

  if (loading && !dashboard) return <div className="mission-control-view"><div className="mc-loading">Loading your orbit...</div></div>;

  return (
    <>
      {/* ── Boot Sequence ── */}
      {!bootDone && (
        <OrbitBoot
          onComplete={() => {
            localStorage.setItem('orbit-boot-done', 'true');
            setBootDone(true);
          }}
        />
      )}

      {/* ── Onboarding Briefing ── */}
      {bootDone && !hasOnboarded && !onboardingComplete && (
        <OrbitOnboarding
          onComplete={() => setOnboardingComplete(true)}
        />
      )}

      <div className="mission-control-view">
      {/* Header with Momentum Gauge */}
      <MissionControlHeader
        completedToday={completedToday}
        totalTasksToday={totalTasksToday}
        streakTotal={streakTotal}
        taskCount={tasks.length}
        trendPct={safeTrendPct}
      />

      {/* Morning Brief */}
      <div className="mc-brief-section">
        <button className="mc-brief-btn" onClick={handleMorningBrief} disabled={briefLoading}>
          {briefLoading ? '✨ Generating...' : '☀️ Morning Brief'}
        </button>
        {briefText && (
          <div className="mc-brief-card">
            <p className="mc-brief-text">{briefText}</p>
          </div>
        )}
      </div>

      {/* Natural Language Input */}
      <div className="mc-nl-section">
        <div className="mc-nl-row">
          <div className="input-with-mic">
            <input
              type="text"
              className="mc-nl-input"
              value={nlInput}
              onChange={e => setNlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleParseInput(nlInput.trim())}
              placeholder='Quick add — e.g. "finish report by Friday" or "buy groceries"'
            />
            <MicButton
              onTranscription={(text) => setNlInput(text)}
              variant="inline"
              size="sm"
              className="mic-button-inline"
            />
          </div>
          <button
            className="mc-nl-btn"
            onClick={() => handleParseInput(nlInput.trim())}
            disabled={nlParsing || !nlInput.trim()}
          >
            {nlParsing ? '...' : '→'}
          </button>
        </div>
      </div>

      {/* Reschedule Toast */}
      {rescheduleResult && <div className="orbit-toast">{rescheduleResult}</div>}

      {/* Parse Feedback Toast */}
      {parseFeedback && <div className="orbit-toast" style={{ color: '#10b981' }}>{parseFeedback}</div>}

      {/* Alert Console */}
      <AlertConsole nudges={nudges} onDismiss={dismissNudge} />

      {/* Cross-App Insights */}
      <InsightCards />

      {/* Horizon Line (Today's Focus) */}
      <h3 className="orbit-section-title" style={{ marginBottom: '12px' }}>🎯 Today's Focus</h3>
      <HorizonLine
        focus={focus}
        onComplete={completeTask}
        onReschedule={handleReschedule}
      />

      {/* Telemetry Grid (Tasks & Habits) */}
      <h3 className="orbit-section-title" style={{ marginBottom: '12px' }}>📊 Telemetry Grid</h3>
      <TelemetryGrid
        tasks={tasks}
        habits={habits}
        onComplete={completeTask}
        onDelete={deleteTask}
        onLogHabit={logHabit}
        onAddTask={handleAddTask}
        onAddHabit={addHabit}
      />

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div className="orbit-section" style={{ marginTop: '20px' }}>
          <h3 className="orbit-section-title" style={{ marginBottom: '12px' }}>✅ Completed Today ({completedTasks.length})</h3>
          {completedTasks.map(task => (
            <div key={task.id} className="mc-task-row completed" style={{ opacity: 0.6 }}>
              <div className="mc-task-check completed"><span style={{ color: '#0b0f14', fontSize: '12px' }}>✓</span></div>
              <div className="mc-task-title" style={{ textDecoration: 'line-through' }}>{task.title}</div>
              {task.completed_at && (
                <span className="mc-task-due" style={{ fontSize: '10px', marginLeft: 'auto' }}>
                  {new Date(task.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Activity Heatmap */}
      <div className="orbit-section" style={{ marginTop: '20px' }}>
        <HeatmapRow completedToday={completedToday} />
      </div>

      {/* Quick Log Modal */}
      <QuickLogModal
        isOpen={isQuickLogOpen}
        onClose={() => setIsQuickLogOpen(false)}
        onParseInput={handleParseInput}
      />

      {/* Keyboard Shortcut Hint */}
      <div style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        background: 'rgba(18, 23, 36, 0.8)',
        padding: '8px 12px',
        borderRadius: '8px',
        fontSize: '11px',
        color: 'var(--mc-text-muted)',
        fontFamily: 'JetBrains Mono, monospace',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        ⌘L Quick Log
      </div>
    </div>
    </>
  );
}