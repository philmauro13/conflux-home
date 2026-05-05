import React, { useState } from 'react';
import type { LifeTask, LifeHabit } from '../types';
import { playOrbitTaskComplete, playOrbitStreakMilestone } from '../lib/sound';

interface TelemetryGridProps {
  tasks: LifeTask[];
  habits: LifeHabit[];
  onComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onLogHabit: (habitId: string) => void;
  onAddTask: (title: string, category?: string, priority?: string, dueDate?: string, energyType?: string) => Promise<void>;
  onAddHabit: (name: string, category?: string, frequency?: string) => Promise<void>;
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

const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
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

function TaskRow({ task, onComplete, onDelete }: {
  task: LifeTask; onComplete: (id: string) => void; onDelete: (id: string) => void;
}) {
  const pri = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.normal;
  const [completed, setCompleted] = useState(false);
  
  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCompleted(true);
    playOrbitTaskComplete();
    setTimeout(() => onComplete(task.id), 200);
  };
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(task.id);
  };
  
  return (
    <div className={`mc-task-row ${completed ? 'completed' : ''}`}>
      <div className={`mc-task-check ${completed ? 'completed' : ''}`} onClick={handleComplete}>
        {completed && <span style={{ color: '#0b0f14', fontSize: '12px' }}>✓</span>}
      </div>
      <div className="mc-task-title">{task.title}</div>
      <div className={`mc-task-priority ${task.priority}`} style={{ background: pri.color }} />
      {task.due_date && (
        <span className={`mc-task-due ${daysUntil(task.due_date) < 0 ? 'overdue' : daysUntil(task.due_date) === 0 ? 'today' : ''}`}>
          {dueLabel(task.due_date)}
        </span>
      )}
      <button
        className="mc-task-delete"
        onClick={handleDelete}
        title="Delete task"
        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px', fontSize: '14px' }}
      >
        🗑️
      </button>
    </div>
  );
}

function HabitCard({ habit, onLog }: { habit: LifeHabit; onLog: (id: string) => void }) {
  const emoji = habit.category ? (CATEGORY_EMOJI[habit.category] ?? '📌') : '📌';
  const [justLogged, setJustLogged] = useState(false);
  
  const handleLog = () => {
    setJustLogged(true);
    // Play streak milestone sound if this reaches a significant number
    const newStreak = habit.streak + 1;
    playOrbitStreakMilestone(newStreak);
    onLog(habit.id);
    // Reset animation state
    setTimeout(() => setJustLogged(false), 500);
  };
  
  return (
    <div className="mc-habit-card" onClick={handleLog}>
      <div className="mc-habit-header">
        <span className="mc-habit-emoji">{emoji}</span>
        <div>
          <div className="mc-habit-name">{habit.name}</div>
          <div className={`mc-habit-streak${justLogged ? ' pulse' : ''}`}>
            <span>🔥 {habit.streak}</span>
            <span style={{ color: '#94a3b8' }}>• {FREQUENCY_LABEL[habit.frequency] ?? habit.frequency}</span>
          </div>
        </div>
      </div>
      <button className="mc-habit-log" onClick={(e) => { e.stopPropagation(); handleLog(); }}>
        ✓ LOG TODAY
      </button>
    </div>
  );
}

export function TelemetryGrid({ tasks, habits, onComplete, onDelete, onLogHabit, onAddTask, onAddHabit }: TelemetryGridProps) {
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showHabitForm, setShowHabitForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState('');
  const [taskPriority, setTaskPriority] = useState('normal');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskEnergy, setTaskEnergy] = useState('');
  const [habitName, setHabitName] = useState('');
  const [habitCategory, setHabitCategory] = useState('');
  const [habitFrequency, setHabitFrequency] = useState('daily');

  const handleAddTask = async () => {
    if (!taskTitle.trim()) return;
    await onAddTask(taskTitle.trim(), taskCategory || undefined, taskPriority, taskDueDate || undefined, taskEnergy || undefined);
    setTaskTitle('');
    setTaskCategory('');
    setTaskPriority('normal');
    setTaskDueDate('');
    setTaskEnergy('');
    setShowTaskForm(false);
  };

  const handleAddHabit = async () => {
    if (!habitName.trim()) return;
    await onAddHabit(habitName.trim(), habitCategory || undefined, habitFrequency);
    setHabitName('');
    setHabitCategory('');
    setHabitFrequency('daily');
    setShowHabitForm(false);
  };

  return (
    <div className="mc-telemetry-grid">
      {/* Tasks Panel */}
      <div className="mc-panel">
        <div className="mc-panel-header">
          <h3 className="mc-panel-title">📋 Mission Manifest</h3>
          <div className="mc-flex mc-gap-8">
            <span className="mc-panel-count">{tasks.length} pending</span>
            <button 
              className="mc-btn-secondary" 
              onClick={() => setShowTaskForm(!showTaskForm)}
              style={{ padding: '4px 12px', fontSize: '11px' }}
            >
              {showTaskForm ? '✕' : '+ Add'}
          </button>
          </div>
        </div>
        
        {showTaskForm && (
          <div className="mc-flex mc-gap-8" style={{ marginBottom: '12px' }}>
            <input
              type="text"
              className="mc-nl-input"
              style={{ flex: 1 }}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title..."
              autoFocus
            />
            <select 
              className="mc-btn-secondary" 
              style={{ padding: '6px 10px', fontSize: '11px' }}
              value={taskCategory} 
              onChange={(e) => setTaskCategory(e.target.value)}
            >
              <option value="">Cat</option>
              <option value="health">💪 Health</option>
              <option value="work">💼 Work</option>
              <option value="personal">🧑 Personal</option>
              <option value="family">👨‍👩‍👧‍👦 Family</option>
              <option value="finance">💰 Finance</option>
              <option value="learning">📚 Learning</option>
              <option value="creative">🎨 Creative</option>
              <option value="home">🏠 Home</option>
            </select>
            <select 
              className="mc-btn-secondary" 
              style={{ padding: '6px 10px', fontSize: '11px' }}
              value={taskPriority} 
              onChange={(e) => setTaskPriority(e.target.value)}
            >
              <option value="urgent">🔴 Urgent</option>
              <option value="high">🟠 High</option>
              <option value="normal">🟡 Normal</option>
              <option value="low">🟢 Low</option>
            </select>
            <input 
              type="date" 
              className="mc-btn-secondary" 
              style={{ padding: '6px 10px', fontSize: '11px' }}
              value={taskDueDate} 
              onChange={(e) => setTaskDueDate(e.target.value)}
            />
            <select 
              className="mc-btn-secondary" 
              style={{ padding: '6px 10px', fontSize: '11px' }}
              value={taskEnergy} 
              onChange={(e) => setTaskEnergy(e.target.value)}
            >
              <option value="">⚡</option>
              <option value="high">⚡ High</option>
              <option value="medium">🔋 Med</option>
              <option value="low">🌙 Low</option>
            </select>
            <button 
              className="mc-btn-primary" 
              style={{ padding: '6px 12px', fontSize: '11px' }}
              onClick={handleAddTask}
              disabled={!taskTitle.trim()}
            >
              Add
            </button>
          </div>
        )}
        
        {tasks.length === 0 ? (
          <div className="mc-empty">All caught up! No pending tasks.</div>
        ) : (
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {tasks.map(task => (
              <TaskRow 
                key={task.id} 
                task={task} 
                onComplete={onComplete} 
                onDelete={onDelete} 
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Habits Panel */}
      <div className="mc-panel">
        <div className="mc-panel-header">
          <h3 className="mc-panel-title">🔄 Habit Telemetry</h3>
          <div className="mc-flex mc-gap-8">
            <span className="mc-panel-count">{habits.length} active</span>
            <button
              className="mc-btn-secondary"
              onClick={() => setShowHabitForm(!showHabitForm)}
              style={{ padding: '4px 12px', fontSize: '11px' }}
            >
              {showHabitForm ? '✕' : '+ Habit'}
            </button>
          </div>
        </div>

        {showHabitForm && (
          <div className="mc-flex mc-gap-8" style={{ marginBottom: '12px' }}>
            <input
              type="text"
              className="mc-nl-input"
              style={{ flex: 1 }}
              value={habitName}
              onChange={(e) => setHabitName(e.target.value)}
              placeholder="Habit name (e.g. Drink 8 glasses of water)"
              autoFocus
            />
            <select
              className="mc-btn-secondary"
              style={{ padding: '6px 10px', fontSize: '11px' }}
              value={habitCategory}
              onChange={(e) => setHabitCategory(e.target.value)}
            >
              <option value="">Cat</option>
              <option value="health">💪 Health</option>
              <option value="work">💼 Work</option>
              <option value="personal">🧑 Personal</option>
              <option value="finance">💰 Finance</option>
              <option value="learning">📚 Learning</option>
              <option value="creative">🎨 Creative</option>
              <option value="home">🏠 Home</option>
            </select>
            <select
              className="mc-btn-secondary"
              style={{ padding: '6px 10px', fontSize: '11px' }}
              value={habitFrequency}
              onChange={(e) => setHabitFrequency(e.target.value)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <button
              className="mc-btn-primary"
              style={{ padding: '6px 12px', fontSize: '11px' }}
              onClick={handleAddHabit}
              disabled={!habitName.trim()}
            >
              Add
            </button>
          </div>
        )}
        
        {habits.length === 0 ? (
          <div className="mc-empty">No habits tracked yet. Add one above to start building streaks! 🔥</div>
        ) : (
          <div className="mc-habit-grid">
            {habits.map(habit => (
              <HabitCard key={habit.id} habit={habit} onLog={onLogHabit} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}