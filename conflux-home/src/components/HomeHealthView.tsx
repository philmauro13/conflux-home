// Conflux Home — Foundation View
// Your Home's Nerve Center: diagnosis, predictions, seasonal care, warranties, AI chat

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useHomeHealth } from '../hooks/useHomeHealth';
import { useHomeDiagnosis, usePredictions, useSeasonalTasks, useWarrantyAlerts, useHomeChat } from '../hooks/foundation-hooks';
import { FoundationHero, FoundationDiagnosisCard, FoundationPredictionsGrid, FoundationSeasonalCalendar, FoundationChat, FoundationVault } from './foundation';
import FoundationBoot from './FoundationBoot';
import FoundationOnboarding, { hasCompletedFoundationOnboarding } from './FoundationOnboarding';
import FoundationTour, { hasCompletedFoundationTour } from './FoundationTour';
import type { HomeProfile } from '../types';
import '../styles/foundation.css';
import '../styles/foundation-onboarding.css';

type Tab = 'overview' | 'diagnose' | 'calendar' | 'vault' | 'chat';

export default function HomeHealthView() {
  const { dashboard, loading, load, setProfileData } = useHomeHealth();
  const { diagnosis, loading: diagnosing, error: diagnoseError, diagnose } = useHomeDiagnosis();
  const { predictions, load: loadPredictions } = usePredictions();
  const { tasks, load: loadSeasonalTasks, complete } = useSeasonalTasks();
  const { alerts, load: loadWarrantyAlerts } = useWarrantyAlerts();
  const { messages, loading: chatLoading, send } = useHomeChat();

  const [tab, setTab] = useState<Tab>('overview');
  const [symptomInput, setSymptomInput] = useState('');
  const [vaultLoaded, setVaultLoaded] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth() + 1);
  const [recentDiagnoses, setRecentDiagnoses] = useState<string[]>([]);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // Boot → Onboarding → Tour → Main view
  // bootDone persists so boot only plays once per session
  const [bootDone, setBootDone] = useState(() => localStorage.getItem('foundation-boot-done') === 'true');
  const hasOnboarded = hasCompletedFoundationOnboarding();
  const hasTakenTour = hasCompletedFoundationTour();
  const [showOnboarding, setShowOnboarding] = useState(!bootDone && !hasOnboarded);
  const [showTour, setShowTour] = useState(!bootDone ? false : !hasTakenTour);

  // Load dashboard on mount
  useEffect(() => { load(); }, [load]);

  // Load predictions on mount
  useEffect(() => { loadPredictions(); }, [loadPredictions]);

  // Load seasonal tasks on mount and when month changes
  useEffect(() => { loadSeasonalTasks(currentMonth); }, [currentMonth, loadSeasonalTasks]);

  // Load warranty alerts when Vault tab opens
  useEffect(() => {
    if (tab === 'vault' && !vaultLoaded) {
      loadWarrantyAlerts();
      setVaultLoaded(true);
    }
  }, [tab, vaultLoaded, loadWarrantyAlerts]);

  const handleDiagnose = useCallback(async () => {
    const trimmed = symptomInput.trim();
    if (!trimmed || diagnosing) return;
    await diagnose(trimmed);
    setRecentDiagnoses(prev => [trimmed, ...prev].slice(0, 5));
    setSymptomInput('');
  }, [symptomInput, diagnosing, diagnose]);

  const handleDiagnoseKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleDiagnose();
    }
  }, [handleDiagnose]);

  const handleMonthChange = useCallback((m: number) => {
    setCurrentMonth(m);
  }, []);

  // Bill trend sparkline path
  const billTrend = dashboard?.bill_trend ?? [];
  const sparklineSvg = useMemo(() => {
    if (billTrend.length < 2) return null;
    const w = 80, h = 24;
    const vals = billTrend.map(b => b.total);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const points = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    });
    const path = `M${points.join(' L')}`;
    const areaPath = `${path} L${w},${h} L0,${h} Z`;
    return { path, areaPath, w, h };
  }, [billTrend]);

  // Boot → Onboarding → Tour → Main
  if (!bootDone) {
    return <FoundationBoot onComplete={() => { localStorage.setItem('foundation-boot-done', 'true'); setBootDone(true); }} />;
  }

  if (showOnboarding) {
    return <FoundationOnboarding onComplete={(createdProfile?: HomeProfile) => { if (createdProfile) setProfileData(createdProfile); setShowOnboarding(false); if (!hasTakenTour) setShowTour(true); }} />;
  }

  if (showTour) {
    return <FoundationTour onComplete={() => setShowTour(false)} />;
  }

  if (loading) {
    return (
      <div className="foundation-view">
        <div className="foundation-header">
          <h2 className="foundation-title">🏗️ Foundation</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  const healthScore = dashboard?.health_score ?? 0;
  const totalMonthly = dashboard?.total_monthly_utilities ?? 0;
  const overdueCount = dashboard?.overdue_maintenance?.length ?? 0;
  const upcomingCount = dashboard?.upcoming_maintenance?.length ?? 0;
  const appliancesAtRisk = dashboard?.appliances_needing_service?.length ?? 0;
  const systems = dashboard?.systems ?? [];
  const alertsCount = (dashboard?.ai_alerts?.length ?? 0) + overdueCount;

  return (
    <div className="foundation-view">
      <div className="foundation-header">
        <h2 className="foundation-title">🏗️ Foundation</h2>
        <div className="foundation-tabs">
          {(['overview', 'diagnose', 'calendar', 'vault', 'chat'] as const).map(t => (
            <button
              key={t}
              className={`foundation-tab ${tab === t ? 'foundation-tab--active' : ''} ${t === 'vault' ? 'foundation-vault-tab' : ''} ${t === 'diagnose' ? 'foundation-diagnose-tab' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'overview' ? '📊 Overview' : t === 'diagnose' ? '🩺 Diagnose' : t === 'calendar' ? '📅 Calendar' : t === 'vault' ? '🛡️ Vault' : '💬 Chat'}
            </button>
          ))}
        </div>
      </div>

      {/* -- Overview Tab -- */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Nudge Banner */}
          {!nudgeDismissed && overdueCount > 0 && (
            <div className="foundation-nudge foundation-nudge--critical">
              <span className="foundation-nudge-icon">🚨</span>
              <div className="foundation-nudge-body">
                <p className="foundation-nudge-title">{overdueCount} overdue maintenance {overdueCount === 1 ? 'task' : 'tasks'}</p>
                <p className="foundation-nudge-detail">
                  {dashboard?.overdue_maintenance.slice(0, 2).map(m => m.task).join(' · ')}
                  {overdueCount > 2 && ` + ${overdueCount - 2} more`}
                </p>
              </div>
              <button className="foundation-nudge-dismiss" onClick={() => setNudgeDismissed(true)}>✕</button>
            </div>
          )}
          {!nudgeDismissed && overdueCount === 0 && appliancesAtRisk > 0 && (
            <div className="foundation-nudge foundation-nudge--warning">
              <span className="foundation-nudge-icon">⚠️</span>
              <div className="foundation-nudge-body">
                <p className="foundation-nudge-title">{appliancesAtRisk} appliance{appliancesAtRisk === 1 ? '' : 's'} need attention</p>
                <p className="foundation-nudge-detail">
                  {dashboard?.appliances_needing_service.slice(0, 2).map(a => a.name).join(' · ')}
                </p>
              </div>
              <button className="foundation-nudge-dismiss" onClick={() => setNudgeDismissed(true)}>✕</button>
            </div>
          )}

          <FoundationHero
            healthScore={healthScore}
            systems={systems}
            alertsCount={alertsCount}
          />

          <FoundationPredictionsGrid predictions={predictions} />

          {/* Stat Cards */}
          <div className="foundation-stat-grid">
            <div className="foundation-stat-card foundation-stat-card--blue">
              <span className="foundation-stat-card-emoji">💰</span>
              <span className="foundation-stat-card-label">Monthly Utilities</span>
              <span className="foundation-stat-card-value">${totalMonthly.toFixed(2)}</span>
              {sparklineSvg && (
                <svg
                  width={sparklineSvg.w}
                  height={sparklineSvg.h}
                  viewBox={`0 0 ${sparklineSvg.w} ${sparklineSvg.h}`}
                  style={{ marginTop: 8, display: 'block', opacity: 0.6 }}
                >
                  <defs>
                    <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={sparklineSvg.areaPath} fill="url(#sparkline-grad)" />
                  <path d={sparklineSvg.path} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <div className="foundation-stat-card foundation-stat-card--red">
              <span className="foundation-stat-card-emoji">🔴</span>
              <span className="foundation-stat-card-label">Overdue</span>
              <span className="foundation-stat-card-value">{overdueCount}</span>
            </div>
            <div className="foundation-stat-card foundation-stat-card--amber">
              <span className="foundation-stat-card-emoji">🔔</span>
              <span className="foundation-stat-card-label">Upcoming</span>
              <span className="foundation-stat-card-value">{upcomingCount}</span>
            </div>
            <div className="foundation-stat-card foundation-stat-card--purple">
              <span className="foundation-stat-card-emoji">⚠️</span>
              <span className="foundation-stat-card-label">At Risk</span>
              <span className="foundation-stat-card-value">{appliancesAtRisk}</span>
            </div>
          </div>

          {/* Upcoming Maintenance Preview */}
          {(dashboard?.overdue_maintenance?.length ?? 0) + (dashboard?.upcoming_maintenance?.length ?? 0) > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--foundation-text-muted)', margin: '0 0 10px' }}>
                📋 Maintenance Schedule
              </h3>
              <div className="foundation-maintenance-list">
                {[...(dashboard?.overdue_maintenance ?? []).map(m => ({ ...m, _kind: 'overdue' as const })),
                  ...(dashboard?.upcoming_maintenance ?? []).slice(0, 3).map(m => ({ ...m, _kind: 'upcoming' as const }))]
                .slice(0, 5)
                .map((m, i) => {
                  const now = new Date();
                  let dueLabel = 'Scheduled';
                  let dueClass = 'foundation-maintenance-item-due--ok';
                  if (m._kind === 'overdue') {
                    dueLabel = 'Overdue';
                    dueClass = 'foundation-maintenance-item-due--overdue';
                  } else if (m.next_due) {
                    const d = new Date(m.next_due);
                    const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
                    if (days <= 7) { dueLabel = `${days}d`; dueClass = 'foundation-maintenance-item-due--soon'; }
                    else if (days <= 30) { dueLabel = `${days}d`; }
                    else { dueLabel = `${days}d`; }
                  }
                  return (
                    <div key={m.id} className="foundation-maintenance-item">
                      <span className="foundation-maintenance-item-label">{m.task}</span>
                      <span className={`foundation-maintenance-item-due ${dueClass}`}>{dueLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* -- Diagnose Tab -- */}
      {tab === 'diagnose' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Natural Language Input */}
          <div style={{ display: 'flex', gap: 12 }}>
            <textarea
              className="foundation-nl-input foundation-diagnose-input"
              value={symptomInput}
              onChange={e => setSymptomInput(e.target.value)}
              onKeyDown={handleDiagnoseKeyDown}
              placeholder="Describe what's wrong with your home..."
              rows={3}
            />
          </div>
          <button
            className="btn-primary"
            onClick={handleDiagnose}
            disabled={!symptomInput.trim() || diagnosing}
            style={{ alignSelf: 'flex-start' }}
          >
            {diagnosing ? '🔍 Diagnosing...' : '🔍 Diagnose Problem'}
          </button>

          {diagnoseError && (
            <div style={{ color: '#ef4444', fontSize: 13 }}>⚠️ {diagnoseError}</div>
          )}

          {/* Diagnosis Result */}
          {diagnosis && <FoundationDiagnosisCard diagnosis={diagnosis} />}

          {/* Recent Problems */}
          {recentDiagnoses.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.75)', margin: '0 0 10px 0' }}>
                🕒 Recent Problems
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentDiagnoses.map((problem, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.7)',
                    }}
                  >
                    {problem}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* -- Calendar Tab -- */}
      {tab === 'calendar' && (
        <FoundationSeasonalCalendar
          tasks={tasks}
          currentMonth={currentMonth}
          onMonthChange={handleMonthChange}
          onComplete={complete}
        />
      )}

      {/* -- Vault Tab -- */}
      {tab === 'vault' && (
        <FoundationVault alerts={alerts} />
      )}

      {/* -- Chat Tab -- */}
      {tab === 'chat' && (
        <FoundationChat
          messages={messages}
          onSend={send}
          loading={chatLoading}
        />
      )}
    </div>
  );
}
