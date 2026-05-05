import React from 'react';
import type { LifeDailyFocus, LifeTask } from '../types';
import { playOrbitTaskComplete } from '../lib/sound';

interface HorizonLineProps {
  focus: LifeDailyFocus[];
  onComplete: (taskId: string) => void;
  onReschedule: (taskId: string) => void;
}

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

function FocusCard({ focus, onComplete, onReschedule }: {
  focus: LifeDailyFocus; onComplete: (id: string) => void; onReschedule: (id: string) => void;
}) {
  const task = focus.task;
  if (!task) return null;
  const pri = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.normal;
  const energy = task.energy_type ? ENERGY_EMOJI[task.energy_type] : null;

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    playOrbitTaskComplete();
    onComplete(task.id);
  };

  const handleReschedule = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReschedule(task.id);
  };

  return (
    <div className="mc-focus-card">
      <div className="mc-focus-priority">
        <span>{pri.emoji}</span>
        <span>Priority {pri.label}</span>
      </div>
      <div className="mc-focus-title">{task.title}</div>
      <div className="mc-focus-meta">
        {energy && (
          <span className={`mc-focus-badge energy-${task.energy_type}`}>
            {energy} {task.energy_type}
          </span>
        )}
        {task.category && (
          <span className="mc-focus-badge">
            {CATEGORY_EMOJI[task.category] ?? '📌'} {task.category}
          </span>
        )}
        {task.due_date && (
          <span
            className="mc-focus-badge"
            style={{ color: dueColor(task.due_date), borderColor: dueColor(task.due_date) }}
          >
            📅 {dueLabel(task.due_date)}
          </span>
        )}
      </div>
      <div className="mc-focus-actions">
        <button className="mc-focus-btn" onClick={handleComplete} title="Mark complete">
          ✓
        </button>
        <button className="mc-focus-btn" onClick={handleReschedule} title="Reschedule">
          ↻
        </button>
      </div>
    </div>
  );
}

export function HorizonLine({ focus, onComplete, onReschedule }: HorizonLineProps) {
  if (focus.length === 0) {
    return (
      <div className="mc-horizon-container">
        <div className="mc-empty">
          No focus items yet. Add tasks and set your daily focus.
        </div>
      </div>
    );
  }

  return (
    <div className="mc-horizon-container">
      {focus.map(f => (
        <FocusCard 
          key={f.id} 
          focus={f} 
          onComplete={onComplete} 
          onReschedule={onReschedule} 
        />
      ))}
    </div>
  );
}