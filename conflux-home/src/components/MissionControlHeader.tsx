import React from 'react';
import { MomentumGauge } from './MomentumGauge';

interface MissionControlHeaderProps {
  completedToday: number;
  totalTasksToday: number;
  streakTotal: number;
  taskCount: number;
  trendPct?: number; // Weekly trend percentage (positive = improvement)
}

function calculateMomentumPercentage(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, (completed / total) * 100);
}

function formatTrend(trendPct?: number): string {
  if (trendPct === undefined) return '';
  const direction = trendPct >= 0 ? '↑' : '↓';
  return `${direction}${Math.abs(Math.round(trendPct))}% vs last week`;
}

export function MissionControlHeader({ 
  completedToday, 
  totalTasksToday,
  streakTotal, 
  taskCount,
  trendPct 
}: MissionControlHeaderProps) {
  const percentage = calculateMomentumPercentage(completedToday, totalTasksToday);
  const trendLabel = formatTrend(trendPct);
  
  return (
    <div className="mc-header">
      <div className="mc-header-left">
        <h2 className="mc-title">🌀 LIFE ORBIT</h2>
        <div className="mc-header-stats">
          <span className="mc-stat completed">✅ {completedToday} today</span>
          <span className="mc-stat streak">🔥 {streakTotal} streak</span>
          <span className="mc-stat tasks">📋 {taskCount} tasks</span>
        </div>
      </div>
      <div className="mc-altitude-container">
        <MomentumGauge
          percentage={percentage}
          label="MOMENTUM"
          sublabel={trendLabel}
        />
        <div className="mc-altitude-details">
          <div>
            Daily Momentum:{' '}
            <span>{completedToday}/{totalTasksToday} tasks completed</span>
          </div>
          <div>Streak Strength: <span>{streakTotal} day streak</span></div>
        </div>
      </div>
    </div>
  );
}