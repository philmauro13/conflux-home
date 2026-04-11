import React, { useState } from 'react';
import type { SeasonalTask } from '../../types';

interface FoundationSeasonalCalendarProps {
  tasks: SeasonalTask[];
  currentMonth: number;
  onMonthChange: (m: number) => void;
  onComplete: (id: string) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CATEGORY_COLORS: Record<string, string> = {
  hvac: '#3b82f6', plumbing: '#06b6d4', roof: '#f59e0b',
  yard: '#10b981', interior: '#8b5cf6', general: '#94a3b8',
  electrical: '#f97316', safety: '#ef4444',
};

const PRIORITY_ICONS: Record<string, string> = {
  high: '🔴', medium: '🟡', low: '🟢',
};

const FoundationSeasonalCalendar: React.FC<FoundationSeasonalCalendarProps> = ({
  tasks, currentMonth, onMonthChange, onComplete,
}) => {
  const [completing, setCompleting] = useState<string | null>(null);

  const handleCheck = (id: string) => {
    setCompleting(id);
    setTimeout(() => {
      onComplete(id);
      setCompleting(null);
    }, 300);
  };

  const prevMonth = currentMonth <= 0 ? 11 : currentMonth - 1;
  const nextMonth = currentMonth >= 11 ? 0 : currentMonth + 1;

  const monthTasks = tasks.filter(t => t.month === currentMonth);
  const completedCount = monthTasks.filter(t => t.completed).length;
  const streak = tasks.filter(t => t.completed).length;

  return (
    <div className="foundation-seasonal-card">
      {/* Month header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, padding: '0 4px',
      }}>
        <button onClick={() => onMonthChange(prevMonth)} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
          cursor: 'pointer', fontSize: 18, padding: '4px 8px',
        }}>
          ◀
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{MONTH_NAMES[currentMonth]}</div>
          {streak > 0 && (
            <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 2 }}>
              🔥 {streak} task streak
            </div>
          )}
        </div>
        <button onClick={() => onMonthChange(nextMonth)} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
          cursor: 'pointer', fontSize: 18, padding: '4px 8px',
        }}>
          ▶
        </button>
      </div>

      {/* Progress */}
      {monthTasks.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
          padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
        }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${(completedCount / monthTasks.length) * 100}%`,
              background: '#10b981', transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
            {completedCount}/{monthTasks.length}
          </span>
        </div>
      )}

      {/* Task list */}
      {monthTasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
          📋 No tasks scheduled for {MONTH_NAMES[currentMonth]}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {monthTasks.map((task) => {
            const catColor = CATEGORY_COLORS[task.category] || '#94a3b8';
            const isCompleting = completing === task.id;

            return (
              <div key={task.id} className="foundation-seasonal-card" style={{
                display: 'flex', gap: 10, padding: 12, borderRadius: 10,
                background: task.completed ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${task.completed ? '#10b98120' : 'rgba(255,255,255,0.06)'}`,
                opacity: task.completed ? 0.7 : 1,
                transition: 'all 0.3s ease',
                transform: isCompleting ? 'scale(0.98)' : 'scale(1)',
              }}>
                {/* Checkbox */}
                <button
                  onClick={() => !task.completed && handleCheck(task.id)}
                  disabled={task.completed}
                  style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 2,
                    background: task.completed ? '#10b981' : 'transparent',
                    border: `2px solid ${task.completed ? '#10b981' : 'rgba(255,255,255,0.2)'}`,
                    cursor: task.completed ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 12, fontWeight: 700,
                  }}
                >
                  {task.completed && '✓'}
                </button>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 600, fontSize: 14,
                    textDecoration: task.completed ? 'line-through' : 'none',
                  }}>
                    {task.task}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
                    {/* Category badge */}
                    <span className="foundation-status-badge" style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                      background: `${catColor}20`, color: catColor,
                    }}>
                      {task.category}
                    </span>
                    {/* Priority */}
                    <span style={{ fontSize: 11 }}>{PRIORITY_ICONS[task.priority] || '⚪'}</span>
                    {/* Time estimate */}
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                      ⏱ {task.estimated_time_minutes}min
                    </span>
                    {/* Cost */}
                    {task.estimated_cost > 0 && (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                        💰 ${task.estimated_cost.toFixed(0)}
                      </span>
                    )}
                    {/* DIY badge */}
                    {task.diy_possible && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 100,
                        background: '#10b98115', color: '#10b981',
                      }}>
                        DIY
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
                    {task.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FoundationSeasonalCalendar;
