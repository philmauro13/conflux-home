// Conflux Home — Dream Builder View (Horizon) — Stellar Navigation Redesign
// Deep Space Constellation aesthetic with interactive stellar maps

import { useState, useCallback, useEffect } from 'react';
import { useDreams } from '../hooks/useDreams';
import {
  StellarHeader,
  StellarMap,
  OrbitalVelocity,
  MissionLog,
  StarMilestone,
  StarFieldBackground,
} from './horizon';
import HorizonBoot from './HorizonBoot';
import HorizonOnboarding, { hasCompletedHorizonOnboarding } from './HorizonOnboarding';
import HorizonTour, { hasCompletedHorizonTour } from './HorizonTour';
import { MicButton } from './voice';
import type { Dream, DreamVelocity, DreamMilestone, DreamTask, DreamProgress } from '../types';
import '../styles/horizon-onboarding.css';

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
    addDream, deleteDream, updateDream, prependDream,
    completeMilestone, completeTask,
    addProgress, addMilestone, addTask, getMilestones,
    getVelocity, updateProgressManual, narrate, aiPlan,
  } = useDreams();

  const [selectedDream, setSelectedDream] = useState<Dream | null>(null);
  const [selectedVelocity, setSelectedVelocity] = useState<DreamVelocity | null>(null);
  const [selectedMilestones, setSelectedMilestones] = useState<DreamMilestone[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<DreamTask[]>([]);
  const [selectedProgress, setSelectedProgress] = useState<DreamProgress[]>([]);
  const [velocities, setVelocities] = useState<Record<string, DreamVelocity>>({});
  const [isEditingDream, setIsEditingDream] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDesc, setNewMilestoneDesc] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiInput, setAiInput] = useState('');
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

  // Boot → Onboarding → Tour → Main view
  // Persisted so boot doesn't replay on every navigation back to Dreams
  const [bootDone, setBootDone] = useState(() => localStorage.getItem('horizon-boot-done') === 'true');
  const hasOnboarded = hasCompletedHorizonOnboarding();
  const hasTakenTour = hasCompletedHorizonTour();
  const [showOnboarding, setShowOnboarding] = useState(!bootDone && !hasOnboarded);
  const [showTour, setShowTour] = useState(!bootDone ? false : !hasTakenTour);
  // Dreams that were just created — show glowing star animation
  const [newlyLitDreams, setNewlyLitDreams] = useState<Set<string>>(new Set());

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
    setSelectedTasks(dashboard.upcoming_tasks.filter(t => t.dream_id === selectedDream.id));
    setSelectedProgress(dashboard.recent_progress.filter(p => p.dream_id === selectedDream.id));
    setNarrative(null);
    setSelectedMilestoneId(null);
    setIsEditingDream(false);
    setShowAddMilestone(false);
    // Load milestones from DB
    getMilestones(selectedDream.id).then(ms => setSelectedMilestones(ms)).catch(() => setSelectedMilestones([]));
    setAiInput('');
  }, [selectedDream, dashboard, velocities, getMilestones]);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    await addDream(crypto.randomUUID(), newTitle, newDesc || null, newCategory, newTarget || null);
    setNewTitle(''); setNewDesc(''); setNewTarget('');
    setShowNewForm(false);
  }, [newTitle, newCategory, newDesc, newTarget, addDream]);

  const handleEditDream = useCallback(() => {
    if (!selectedDream) return;
    setEditTitle(selectedDream.title);
    setEditDesc(selectedDream.description || '');
    setEditCategory(selectedDream.category);
    setEditTarget(selectedDream.target_date || '');
    setIsEditingDream(true);
  }, [selectedDream]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedDream || !editTitle.trim()) return;
    await updateDream(selectedDream.id, editTitle, editDesc || null, editCategory, editTarget || null);
    setIsEditingDream(false);
  }, [selectedDream, editTitle, editDesc, editCategory, editTarget, updateDream]);

  const handleAddMilestone = useCallback(async () => {
    if (!selectedDream || !newMilestoneTitle.trim()) return;
    await addMilestone(selectedDream.id, newMilestoneTitle, newMilestoneDesc || null, newMilestoneDate || null, selectedMilestones.length);
    const ms = await getMilestones(selectedDream.id);
    setSelectedMilestones(ms);
    setNewMilestoneTitle(''); setNewMilestoneDesc(''); setNewMilestoneDate('');
    setShowAddMilestone(false);
  }, [selectedDream, newMilestoneTitle, newMilestoneDesc, newMilestoneDate, selectedMilestones.length, addMilestone, getMilestones]);

  const handleAiPlan = useCallback(async () => {
    if (!selectedDream || !aiInput.trim()) return;
    setAiPlanning(true);
    try {
      await aiPlan(selectedDream.id, aiInput, null, selectedDream.category, selectedDream.target_date);
      const ms = await getMilestones(selectedDream.id);
      setSelectedMilestones(ms);
      setAiInput('');
    } catch (e) {
      console.error('AI plan failed:', e);
    } finally {
      setAiPlanning(false);
    }
  }, [selectedDream, aiInput, aiPlan, getMilestones]);

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
    const pct = parseFloat(progressPct) || null;
    await addProgress(selectedDream.id, progressNote, pct, null);
    setProgressNote('');
    setProgressPct('');
  }, [selectedDream, progressNote, addProgress]);

  const handleSelectMilestone = useCallback((milestoneId: string | null) => {
    setSelectedMilestoneId(milestoneId);
  }, []);

  // Calculate overall velocity for header
  const overallVelocity = dashboard && dashboard.dreams.length > 0
    ? dashboard.dreams.reduce((sum, d) => sum + d.progress, 0) / dashboard.dreams.length
    : 0;

  const activeDreams = dashboard?.dreams.filter(d => d.status === 'active') ?? [];

  // After onboarding completes, prepend the created dream directly and highlight it
  const handleOnboardingComplete = useCallback((createdDream?: Dream) => {
    if (createdDream) {
      prependDream(createdDream);
      setNewlyLitDreams(new Set([createdDream.id]));
      setTimeout(() => setNewlyLitDreams(new Set()), 8000);
    }
    setShowOnboarding(false);
    if (!hasTakenTour) setShowTour(true);
  }, [prependDream, hasTakenTour]);
  if (!bootDone) {
    return <HorizonBoot onComplete={() => { localStorage.setItem('horizon-boot-done', 'true'); setBootDone(true); }} />;
  }

  if (showOnboarding) {
    return <HorizonOnboarding onComplete={handleOnboardingComplete} />;
  }

  if (showTour) {
    return <HorizonTour onComplete={() => setShowTour(false)} />;
  }

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

          {/* AI Planning — "Break it down" */}
          <div className="stellar-ai-section" style={{ padding: '0 2rem 1.5rem', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 10 }}>
            <div className="stellar-ai-card">
              <div className="stellar-ai-card-header">
                <span className="stellar-ai-icon">✨</span>
                <h3 className="stellar-ai-title">Break It Down</h3>
              </div>
              <p className="stellar-ai-desc">Describe what you want to achieve and AI will generate milestones and tasks.</p>
              <div className="input-with-mic">
                <input
                  type="text"
                  className="stellar-input stellar-input-ai"
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && aiInput.trim()) handleAiPlan(); }}
                  placeholder="e.g. I want to run a marathon in 6 months"
                />
                <MicButton
                  onTranscription={(text) => setAiInput(text)}
                  variant="inline"
                  size="sm"
                  className="mic-button-inline"
                />
              </div>
              <button
                className="stellar-btn stellar-btn-ai"
                onClick={handleAiPlan}
                disabled={aiPlanning || !aiInput.trim()}
              >
                {aiPlanning ? '✨ Charting course...' : '🚀 Break it down'}
              </button>
            </div>
          </div>

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

            {/* Add Milestone */}
            <div className="stellar-section">
              <h3 className="stellar-section-title">🏔️ Milestones</h3>
              {!showAddMilestone ? (
                <button className="stellar-btn" onClick={() => setShowAddMilestone(true)}>+ Add Milestone</button>
              ) : (
                <div className="stellar-edit-form">
                  <input className="stellar-input" value={newMilestoneTitle} onChange={e => setNewMilestoneTitle(e.target.value)} placeholder="Milestone title" />
                  <textarea className="stellar-textarea" value={newMilestoneDesc} onChange={e => setNewMilestoneDesc(e.target.value)} placeholder="Description (optional)" rows={2} />
                  <div className="stellar-form-row">
                    <input type="date" className="stellar-input" value={newMilestoneDate} onChange={e => setNewMilestoneDate(e.target.value)} />
                    <button className="stellar-btn" onClick={handleAddMilestone} disabled={!newMilestoneTitle.trim()}>Create</button>
                    <button className="stellar-btn" onClick={() => setShowAddMilestone(false)}>Cancel</button>
                  </div>
                </div>
              )}
              {/* Milestone list */}
              {selectedMilestones.length > 0 && (
                <div className="horizon-milestone-list" style={{ marginTop: '1rem' }}>
                  {selectedMilestones.map(m => (
                    <div key={m.id} className={`horizon-milestone ${m.is_completed ? 'completed' : ''}`} onClick={() => handleSelectMilestone(m.id)}>
                      <span className="horizon-milestone-check">{m.is_completed ? '☑' : '☐'}</span>
                      <span className="horizon-milestone-title">{m.title}</span>
                      {m.target_date && <span className="horizon-milestone-date">{m.target_date}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Progress & Tasks Section */}
            <div className="stellar-section">
              <h3 className="stellar-section-title">📈 Log Progress</h3>
              <div className="stellar-progress-form">
                <div className="input-with-mic">
                  <input
                    type="text"
                    value={progressNote}
                    onChange={e => setProgressNote(e.target.value)}
                    placeholder="What did you do today? (optional % update)"
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
                    placeholder="+%"
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

          {/* Recent Progress — all entries */}
          {selectedProgress.length > 0 && (
            <div className="stellar-section" style={{ padding: '0 2rem 2rem', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 10 }}>
              <h3 className="stellar-section-title">📋 Activity Log</h3>
              {selectedProgress.map(p => (
                <div key={p.id} className="stellar-insight-card">
                  <p className="stellar-insight-text">{p.note}</p>
                  {p.progress_change !== null && (
                    <span className="stellar-insight-date" style={{ color: '#10b981' }}>
                      {p.progress_change > 0 ? '+' : ''}{(p.progress_change).toFixed(0)}% progress
                    </span>
                  )}
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

          {/* Edit & Delete */}
          <div className="stellar-detail-actions">
            {!isEditingDream ? (
              <button className="stellar-btn" onClick={handleEditDream}>✏️ Edit Dream</button>
            ) : (
              <div className="stellar-edit-form">
                <input className="stellar-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Dream title" />
                <textarea className="stellar-textarea" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" rows={2} />
                <div className="stellar-form-row">
                  <select className="stellar-select" value={editCategory} onChange={e => setEditCategory(e.target.value)}>
                    {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.emoji} {v.label}</option>
                    ))}
                  </select>
                  <input type="date" className="stellar-input" value={editTarget} onChange={e => setEditTarget(e.target.value)} />
                </div>
                <div className="stellar-form-row">
                  <button className="stellar-btn" onClick={handleSaveEdit}>💾 Save</button>
                  <button className="stellar-btn" onClick={() => setIsEditingDream(false)}>Cancel</button>
                </div>
              </div>
            )}
            <button className="stellar-delete-btn" onClick={() => { deleteDream(selectedDream.id); setSelectedDream(null); }}>🗑️ Delete Dream</button>
          </div>
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

          {/* Hero Banner */}
          <div className="horizon-hero-banner" style={{ padding: '1.5rem 2rem', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 10 }}>
            <div className="horizon-hero-left">
              <div className="horizon-hero-velocity-ring">
                <svg viewBox="0 0 80 80" className="velocity-ring-svg">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(6,182,212,0.15)" strokeWidth="6"/>
                  <circle cx="40" cy="40" r="34" fill="none" stroke="url(#velocityGrad)" strokeWidth="6"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - (overallVelocity / 100))}`}
                    strokeLinecap="round"
                    transform="rotate(-90 40 40)"
                    className="velocity-ring-arc"
                  />
                  <defs>
                    <linearGradient id="velocityGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#06b6d4"/>
                      <stop offset="100%" stopColor="#8b5cf6"/>
                    </linearGradient>
                  </defs>
                </svg>
                <div className="velocity-ring-inner">
                  <span className="velocity-ring-pct">{overallVelocity.toFixed(0)}%</span>
                  <span className="velocity-ring-label">velocity</span>
                </div>
              </div>
              <div className="horizon-hero-stats">
                <div className="horizon-hero-stat">
                  <span className="horizon-hero-stat-value">{dashboard?.active_dreams ?? 0}</span>
                  <span className="horizon-hero-stat-label">Active Dreams</span>
                </div>
                <div className="horizon-hero-stat">
                  <span className="horizon-hero-stat-value">{dashboard?.completed_milestones ?? 0}/{dashboard?.total_milestones ?? 0}</span>
                  <span className="horizon-hero-stat-label">Milestones</span>
                </div>
                <div className="horizon-hero-stat">
                  <span className="horizon-hero-stat-value">{dashboard?.upcoming_tasks.length ?? 0}</span>
                  <span className="horizon-hero-stat-label">Upcoming</span>
                </div>
              </div>
            </div>
            <div className="horizon-hero-right">
              {!showNewForm ? (
                <button className="horizon-new-btn" onClick={() => setShowNewForm(true)}>
                  <span className="horizon-new-btn-glow"/>
                  <span className="horizon-new-btn-content">
                    <span className="horizon-new-btn-icon">✨</span>
                    <span className="horizon-new-btn-text">New Constellation</span>
                  </span>
                </button>
              ) : (
                <div className="horizon-new-form">
                  <div className="input-with-mic">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="What's your dream?"
                      className="stellar-input"
                      autoFocus
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
                    <button className="stellar-btn" onClick={handleCreate} disabled={!newTitle.trim()}>Create</button>
                    <button className="stellar-btn" onClick={() => setShowNewForm(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section Label */}
          <div className="horizon-section-label" style={{ padding: '0 2rem', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 10 }}>
            <span className="horizon-section-label-line"/>
            <span className="horizon-section-label-text">Your Constellations</span>
            <span className="horizon-section-label-line"/>
          </div>

          {/* Dream Grid */}
          <div className="stellar-dream-grid" style={{ padding: '1rem 2rem 3rem', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 10 }}>
            {activeDreams.length === 0 ? (
              <div className="stellar-empty">
                <div className="stellar-empty-icon">🌌</div>
                <p className="stellar-empty-text">No constellations yet. What star will you illuminate first?</p>
              </div>
            ) : (
              <div className="stellar-dream-grid-inner">
                {activeDreams.map((dream, i) => {
                  const isNewlyLit = newlyLitDreams.has(dream.id);
                  const cat = CATEGORY_CONFIG[dream.category];
                  return (
                    <div
                      key={dream.id}
                      className={`stellar-dream-card ${isNewlyLit ? 'newly-lit' : ''}`}
                      onClick={() => setSelectedDream(dream)}
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      {isNewlyLit && <div className="stellar-dream-card-star-glow" />}
                      <div className="stellar-dream-card-top">
                        <div className="stellar-dream-card-emoji">{cat?.emoji || '✨'}</div>
                        <div className="stellar-dream-card-category" style={{ color: cat?.color }}>{cat?.label}</div>
                      </div>
                      <h3 className="stellar-dream-card-title">{dream.title}</h3>
                      {dream.description && (
                        <p className="stellar-dream-card-desc">{dream.description}</p>
                      )}
                      <div className="stellar-dream-card-footer">
                        <div className="stellar-dream-card-progress">
                          <div className="stellar-dream-card-progress-fill"
                            style={{ width: `${dream.progress}%`, background: cat?.color || '#06b6d4' }}
                          />
                        </div>
                        <span className="stellar-dream-card-pct" style={{ color: cat?.color }}>{dream.progress.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
