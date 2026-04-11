// Conflux Home — Dream Builder View (Horizon) — Stellar Navigation Redesign
// Deep Space Constellation aesthetic with interactive stellar maps

import { useState, useCallback, useEffect } from 'react';
import { useDreams } from '../hooks/useDreams';
import {
  StellarHeader,
  ConstellationSelector,
  StellarMap,
  OrbitalVelocity,
  MissionLog,
  StarMilestone,
  StarFieldBackground,
} from './horizon';
import { MicButton } from './voice';
import type { Dream, DreamVelocity, DreamMilestone, DreamTask, DreamProgress } from '../types';

const CATEGORY_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  housing:      { emoji: '🏠', color: '#3b82f6', label: 'Housing' },
  education:    { emoji: '🎓', color: '#8b5cf6', label: 'Education' },
  health:       { emoji: '💪', color: '#10b981', label: 'Health' },
  career:       { emoji: '💼', color: '#f59e0b', label: 'Career' },
  travel:       { emoji: '✈️', color: '#06b6d4', label: 'Travel' },
  family:       { emoji: '👨‍👩‍👧‍👦', color: '#ec4899', label: 'Family' },
  personal:     { emoji: '🌟', color: '#f97316', label: 'Personal' },
  financial:    { emoji: '💰', color: '#14b8a6', label: 'Financial' },
  creative:     { emoji: '🎨', color: '#a855f7', label: 'Creative' },
};

export default function DreamBuilderView() {
  const {
    dashboard, loading, load,
    addDream, deleteDream,
    completeMilestone, completeTask,
    addProgress, addMilestone, addTask,
    getVelocity, updateProgressManual, narrate,
  } = useDreams();

  const [selectedDream, setSelectedDream] = useState<Dream | null>(null);
  const [selectedVelocity, setSelectedVelocity] = useState<DreamVelocity | null>(null);
  const [selectedMilestones, setSelectedMilestones] = useState<DreamMilestone[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<DreamTask[]>([]);
  const [selectedProgress, setSelectedProgress] = useState<DreamProgress[]>([]);
  const [velocities, setVelocities] = useState<Record<string, DreamVelocity>>({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('personal');
  const [newDesc, setNewDesc] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [narrating, setNarrating] = useState(false);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [progressNote, setProgressNote] = useState('');
  const [progressPct, setProgressPct] = useState('5');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);

  // Load velocities for all dreams when dashboard changes
  useEffect(() => {
    if (!dashboard?.dreams) return;
    dashboard.dreams.forEach(async (dream) => {
      try {
        const v = await getVelocity(dream.id);
        setVelocities(prev => ({ ...prev, [dream.id]: v }));
      } catch { /* velocity may not be available yet */ }
    });
  }, [dashboard, getVelocity]);

  // Load detail when selecting a dream
  useEffect(() => {
    if (!selectedDream || !dashboard) return;
    setSelectedVelocity(velocities[selectedDream.id] ?? null);
    setSelectedMilestones(dashboard.dreams.find(d => d.id === selectedDream.id)
      ? [] // milestones come from separate invoke in real app
      : []);
    setSelectedTasks(dashboard.upcoming_tasks.filter(t => t.dream_id === selectedDream.id));
    setSelectedProgress(dashboard.recent_progress.filter(p => p.dream_id === selectedDream.id));
    setNarrative(null);
    setSelectedMilestoneId(null);
  }, [selectedDream, dashboard, velocities]);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    await addDream(crypto.randomUUID(), newTitle, newDesc || null, newCategory, newTarget || null);
    setNewTitle(''); setNewDesc(''); setNewTarget('');
    setShowNewForm(false);
  }, [newTitle, newCategory, newDesc, newTarget, addDream]);

  const handleNarrate = useCallback(async () => {
    if (!selectedDream) return;
    setNarrating(true);
    try {
      const result = await narrate(selectedDream.id);
      setNarrative(result);
    } catch (e) {
      console.error('Narrate failed:', e);
    } finally {
      setNarrating(false);
    }
  }, [selectedDream, narrate]);

  const handleCompleteMilestone = useCallback(async (id: string) => {
    await completeMilestone(id);
  }, [completeMilestone]);

  const handleCompleteTask = useCallback(async (id: string) => {
    await completeTask(id);
  }, [completeTask]);

  const handleAddProgress = useCallback(async () => {
    if (!selectedDream || !progressNote.trim()) return;
    await addProgress(selectedDream.id, progressNote, parseFloat(progressPct) || 0, null);
    setProgressNote('');
  }, [selectedDream, progressNote, progressPct, addProgress]);

  const handleSelectMilestone = useCallback((milestoneId: string | null) => {
    setSelectedMilestoneId(milestoneId);
  }, []);

  // Calculate overall velocity for header
  const overallVelocity = dashboard && dashboard.dreams.length > 0
    ? dashboard.dreams.reduce((sum, d) => sum + d.progress, 0) / dashboard.dreams.length
    : 0;

  const activeDreams = dashboard?.dreams.filter(d => d.status === 'active') ?? [];

  if (loading) return (
    <div className="stellar-view">
      <StarFieldBackground />
      <div className="stellar-loading">
        <div className="stellar-loading-icon">🌌</div>
        <p className="stellar-loading-text">Initializing stellar navigation...</p>
      </div>
    </div>
  );

  return (
    <div className="stellar-view">
      <StarFieldBackground />

      {selectedDream ? (
        /* ── Selected Dream Detail View (Stellar) ── */
        <div className="stellar-detail">
          <button className="stellar-back-btn" onClick={() => setSelectedDream(null)}>
            ← Back to Constellations
          </button>

          {/* Stellar Header */}
          <StellarHeader
            dreamCount={1}
            activeCount={1}
            velocity={selectedVelocity?.progress_pct ?? 0}
          />

          {/* Main Content: Stellar Map + Velocity/Mission panels */}
          <div className="stellar-main">
            {/* Stellar Map (Constellation View) */}
            <StellarMap
              milestones={selectedMilestones}
              selectedMilestoneId={selectedMilestoneId}
              onSelectMilestone={handleSelectMilestone}
            />

            {/* Right panel: Orbital Velocity */}
            {selectedVelocity && (
              <OrbitalVelocity velocity={selectedVelocity} />
            )}
          </div>

          {/* Mission Control Panel */}
          <div className="stellar-panel">
            {/* Mission Log (AI Narrative) */}
            <MissionLog
              narrative={narrative}
              narrating={narrating}
              onNarrate={handleNarrate}
            />

            {/* Progress & Tasks Section */}
            <div className="stellar-section">
              <h3 className="stellar-section-title">📈 Log Progress</h3>
              <div className="stellar-progress-form">
                <div className="input-with-mic">
                  <input
                    type="text"
                    value={progressNote}
                    onChange={e => setProgressNote(e.target.value)}
                    placeholder="What did you do today?"
                    className="stellar-input"
                  />
                  <MicButton
                    onTranscription={(text) => setProgressNote(text)}
                    variant="inline"
                    size="sm"
                    className="mic-button-inline"
                  />
                </div>
                <div className="stellar-progress-row">
                  <input
                    type="number"
                    value={progressPct}
                    onChange={e => setProgressPct(e.target.value)}
                    className="stellar-input stellar-input-sm"
                    min="0"
                    max="100"
                  />
                  <span className="stellar-pct-label">%</span>
                  <button
                    className="stellar-btn"
                    onClick={handleAddProgress}
                    disabled={!progressNote.trim()}
                  >
                    Log
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* AI Insights */}
          {selectedProgress.filter(p => p.ai_insight).length > 0 && (
            <div className="stellar-section" style={{ padding: '0 2rem 2rem', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 10 }}>
              <h3 className="stellar-section-title">💡 Insights</h3>
              {selectedProgress.filter(p => p.ai_insight).map(p => (
                <div key={p.id} className="stellar-insight-card">
                  <p className="stellar-insight-text">{p.ai_insight}</p>
                  <span className="stellar-insight-date">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tasks Section */}
          {selectedTasks.length > 0 && (
            <div className="stellar-section" style={{ padding: '0 2rem 2rem', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 10 }}>
              <h3 className="stellar-section-title">📋 Tasks</h3>
              <div className="horizon-task-list">
                {selectedTasks.map(t => (
                  <div key={t.id} className={`horizon-task ${t.is_completed ? 'completed' : ''}`}>
                    <button
                      className="horizon-task-check"
                      onClick={() => handleCompleteTask(t.id)}
                    >
                      {t.is_completed ? '☑' : '☐'}
                    </button>
                    <div className="horizon-task-content">
                      <span className="horizon-task-title">{t.title}</span>
                      {t.due_date && <span className="horizon-task-date">{t.due_date}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delete */}
          <button
            className="stellar-delete-btn"
            onClick={() => { deleteDream(selectedDream.id); setSelectedDream(null); }}
          >
            🗑️ Delete Dream
          </button>
        </div>
      ) : (
        /* ── Dream List View (Stellar) ── */
        <div className="stellar-list">
          {/* Stellar Header */}
          <StellarHeader
            dreamCount={dashboard?.dreams.length ?? 0}
            activeCount={dashboard?.active_dreams ?? 0}
            velocity={overallVelocity}
          />

          {/* Stats Bar */}
          <div className="stellar-stats-bar" style={{ padding: '1.5rem 2rem', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 10 }}>
            <div className="stellar-stat-card">
              <span className="stellar-stat-emoji">🎯</span>
              <span className="stellar-stat-value">{dashboard?.active_dreams ?? 0}</span>
              <span className="stellar-stat-label">Active Dreams</span>
            </div>
            <div className="stellar-stat-card">
              <span className="stellar-stat-emoji">🏆</span>
              <span className="stellar-stat-value">{dashboard?.completed_milestones ?? 0}/{dashboard?.total_milestones ?? 0}</span>
              <span className="stellar-stat-label">Milestones</span>
            </div>
            <div className="stellar-stat-card">
              <span className="stellar-stat-emoji">📋</span>
              <span className="stellar-stat-value">{dashboard?.upcoming_tasks.length ?? 0}</span>
              <span className="stellar-stat-label">Upcoming</span>
            </div>
          </div>

          {/* New Dream Form */}
          {showNewForm && (
            <div className="stellar-new-form" style={{ padding: '0 2rem', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 10 }}>
              <div className="stellar-new-form-header">
                <span>✨</span>
                <h3 className="stellar-new-form-title">New Dream</h3>
              </div>
              <div className="input-with-mic">
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="What's your dream?"
                  className="stellar-input"
                />
                <MicButton
                  onTranscription={(text) => setNewTitle(text)}
                  variant="inline"
                  size="sm"
                  className="mic-button-inline"
                />
              </div>
              <textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Describe it..."
                className="stellar-textarea"
                rows={2}
              />
              <div className="stellar-form-row">
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="stellar-select">
                  {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.emoji} {v.label}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={newTarget}
                  onChange={e => setNewTarget(e.target.value)}
                  className="stellar-input"
                />
                <button
                  className="stellar-btn"
                  onClick={handleCreate}
                  disabled={!newTitle.trim()}
                >
                  Create
                </button>
              </div>
            </div>
          )}

          {/* Constellation Selector */}
          {activeDreams.length > 0 && (
            <ConstellationSelector
              dreams={activeDreams}
              selectedDreamId={null}
              onSelect={(id) => setSelectedDream(activeDreams.find(d => d.id === id) ?? null)}
            />
          )}

          {/* Dream Grid */}
          <div className="stellar-dream-grid" style={{ padding: '0 2rem 2rem', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 10 }}>
            {activeDreams.length === 0 ? (
              <div className="stellar-empty">
                <div className="stellar-empty-icon">🌌</div>
                <p className="stellar-empty-text">No constellations yet. What star will you illuminate first?</p>
              </div>
            ) : (
              <>
                <button
                  className="stellar-btn"
                  onClick={() => setShowNewForm(!showNewForm)}
                  style={{ marginBottom: '1.5rem' }}
                >
                  {showNewForm ? 'Cancel' : '+ New Constellation'}
                </button>
                <div className="stellar-dream-grid-inner">
                  {activeDreams.map(dream => (
                    <div
                      key={dream.id}
                      className="stellar-dream-card"
                      onClick={() => setSelectedDream(dream)}
                    >
                      <div className="stellar-dream-card-emoji">
                        {CATEGORY_CONFIG[dream.category]?.emoji || '✨'}
                      </div>
                      <h3 className="stellar-dream-card-title">{dream.title}</h3>
                      <div className="stellar-dream-card-progress">
                        <div
                          className="stellar-dream-card-progress-fill"
                          style={{ width: `${dream.progress}%` }}
                        />
                      </div>
                      <span className="stellar-dream-card-pct">{dream.progress.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Star Milestone Modal */}
      {selectedMilestoneId && selectedMilestones.find(m => m.id === selectedMilestoneId) && (
        <>
          <div className="stellar-overlay" onClick={() => setSelectedMilestoneId(null)} />
          <StarMilestone
            milestone={selectedMilestones.find(m => m.id === selectedMilestoneId)!}
            tasks={selectedTasks.filter(t => t.milestone_id === selectedMilestoneId)}
            onCompleteMilestone={handleCompleteMilestone}
            onCompleteTask={handleCompleteTask}
            onClose={() => setSelectedMilestoneId(null)}
          />
        </>
      )}
    </div>
  );
}
