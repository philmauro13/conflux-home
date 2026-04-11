// Conflux Home — Parent Dashboard
// Shows learning progress for a child. Makes parents NEED this product.

import { useState, useMemo } from 'react';
import type { FamilyMember, LearningProgress, LearningGoal, ActivityType } from '../types';
import { ACTIVITY_CONFIG, AGE_GROUP_CONFIG } from '../types';

interface ParentDashboardProps {
  member: FamilyMember;
  progress: LearningProgress | null;
  goals: LearningGoal[];
  onCreateGoal: (req: {
    member_id: string; goal_type: string; activity_type?: string;
    title: string; target_value: number; unit?: string; deadline?: string;
  }) => Promise<void>;
  onClose: () => void;
}

export default function ParentDashboard({ member, progress, goals, onCreateGoal, onClose }: ParentDashboardProps) {
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState(5);
  const [goalUnit, setGoalUnit] = useState('sessions');

  const ageConfig = AGE_GROUP_CONFIG[member.age_group];

  // Compute week dates for heat map
  const weekDates = useMemo(() => {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }, []);

  // Build heat map data
  const heatMap = useMemo(() => {
    if (!progress) return weekDates.map(d => ({ date: d, count: 0, minutes: 0 }));
    return weekDates.map(d => {
      const day = progress.weekly_summary.find(w => w.date === d);
      return { date: d, count: day?.count ?? 0, minutes: day?.minutes ?? 0 };
    });
  }, [progress, weekDates]);

  const maxCount = Math.max(...heatMap.map(h => h.count), 1);

  const handleCreateGoal = async () => {
    if (!goalTitle.trim()) return;
    await onCreateGoal({
      member_id: member.id,
      goal_type: 'streak',
      title: goalTitle.trim(),
      target_value: goalTarget,
      unit: goalUnit,
    });
    setShowGoalForm(false);
    setGoalTitle('');
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content parent-dashboard" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="dashboard-header">
          <div className="dashboard-header-left">
            <span className="dashboard-avatar" style={{ background: member.color }}>
              {member.avatar || ageConfig.emoji}
            </span>
            <div>
              <h2>{member.name}'s Progress</h2>
              <span className="dashboard-age-badge">
                {ageConfig.emoji} {ageConfig.label} · Ages {ageConfig.ageRange}
              </span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Stats Row */}
        <div className="dashboard-stats">
          <div className="stat-card streak">
            <div className="stat-emoji">🔥</div>
            <div className="stat-value">{progress?.current_streak_days ?? 0}</div>
            <div className="stat-label">Day Streak</div>
          </div>
          <div className="stat-card">
            <div className="stat-emoji">📚</div>
            <div className="stat-value">{progress?.total_activities ?? 0}</div>
            <div className="stat-label">Activities</div>
          </div>
          <div className="stat-card">
            <div className="stat-emoji">⏱️</div>
            <div className="stat-value">{progress?.total_minutes ?? 0}</div>
            <div className="stat-label">Minutes</div>
          </div>
          <div className="stat-card">
            <div className="stat-emoji">⭐</div>
            <div className="stat-value">
              {progress?.average_score != null ? `${Math.round(progress.average_score * 100)}%` : '—'}
            </div>
            <div className="stat-label">Avg Score</div>
          </div>
        </div>

        {/* Weekly Heat Map */}
        <div className="dashboard-section">
          <h3 className="section-title">📅 This Week</h3>
          <div className="heat-map">
            {heatMap.map((day, i) => {
              const intensity = day.count > 0 ? Math.min(day.count / maxCount, 1) : 0;
              const date = new Date(day.date + 'T12:00:00');
              return (
                <div key={day.date} className="heat-map-day">
                  <div className="heat-map-label">{dayNames[date.getDay()]}</div>
                  <div
                    className="heat-map-block"
                    style={{
                      background: intensity > 0
                        ? `rgba(99, 102, 241, ${0.2 + intensity * 0.8})`
                        : 'var(--bg-primary)',
                    }}
                    title={`${day.count} activities, ${day.minutes} min`}
                  />
                  <div className="heat-map-count">{day.count > 0 ? day.count : ''}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity Breakdown */}
        {progress && progress.activities_by_type.length > 0 && (
          <div className="dashboard-section">
            <h3 className="section-title">📊 Activity Breakdown</h3>
            <div className="activity-bars">
              {progress.activities_by_type.slice(0, 6).map(ac => {
                const config = ACTIVITY_CONFIG[ac.activity_type as ActivityType];
                const pct = progress.total_activities > 0
                  ? (ac.count / progress.total_activities) * 100
                  : 0;
                return (
                  <div key={ac.activity_type} className="activity-bar-row">
                    <span className="activity-bar-label">
                      {config?.emoji ?? '📋'} {config?.label ?? ac.activity_type}
                    </span>
                    <div className="activity-bar-track">
                      <div
                        className="activity-bar-fill"
                        style={{
                          width: `${Math.max(pct, 5)}%`,
                          background: config?.color ?? '#6366f1',
                        }}
                      />
                    </div>
                    <span className="activity-bar-count">{ac.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Topics */}
        {progress && progress.recent_topics.length > 0 && (
          <div className="dashboard-section">
            <h3 className="section-title">🏷️ Recent Topics</h3>
            <div className="topic-tags">
              {progress.recent_topics.map((topic, i) => (
                <span key={i} className="topic-tag">{topic}</span>
              ))}
            </div>
          </div>
        )}

        {/* Goals */}
        <div className="dashboard-section">
          <div className="section-header">
            <h3 className="section-title">🎯 Goals</h3>
            <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setShowGoalForm(!showGoalForm)}>
              + New Goal
            </button>
          </div>

          {showGoalForm && (
            <div className="goal-form">
              <input
                type="text"
                value={goalTitle}
                onChange={e => setGoalTitle(e.target.value)}
                placeholder="e.g., Complete 5 reading sessions"
                className="goal-form-input"
              />
              <div className="goal-form-row">
                <input
                  type="number"
                  value={goalTarget}
                  onChange={e => setGoalTarget(Number(e.target.value))}
                  min={1}
                  className="goal-form-input"
                  style={{ width: 80 }}
                />
                <select value={goalUnit} onChange={e => setGoalUnit(e.target.value)} className="goal-form-input" style={{ width: 120 }}>
                  <option value="sessions">sessions</option>
                  <option value="days">days</option>
                  <option value="topics">topics</option>
                  <option value="books">books</option>
                  <option value="minutes">minutes</option>
                </select>
                <button className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={handleCreateGoal}>
                  Create
                </button>
              </div>
            </div>
          )}

          {goals.length === 0 && !showGoalForm ? (
            <p className="no-goals-text">No goals yet. Create one to track {member.name}'s progress!</p>
          ) : (
            <div className="goals-list">
              {goals.map(goal => {
                const pct = goal.target_value > 0 ? Math.min((goal.current_value / goal.target_value) * 100, 100) : 0;
                return (
                  <div key={goal.id} className={`goal-card ${goal.is_complete ? 'complete' : ''}`}>
                    <div className="goal-title-row">
                      <span className="goal-check">{goal.is_complete ? '✅' : '⬜'}</span>
                      <span className="goal-name">{goal.title}</span>
                    </div>
                    <div className="goal-progress-row">
                      <div className="goal-progress-bar">
                        <div
                          className="goal-progress-fill"
                          style={{ width: `${pct}%`, background: goal.is_complete ? 'var(--accent-success)' : 'var(--accent-primary)' }}
                        />
                      </div>
                      <span className="goal-progress-text">
                        {Math.round(goal.current_value)} / {Math.round(goal.target_value)} {goal.unit ?? ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
