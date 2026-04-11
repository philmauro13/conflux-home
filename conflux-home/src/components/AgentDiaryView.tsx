// Conflux Home — Agent Diary View
// Read your agents' journals. Watch them grow. See their emotions.

import { useState, useEffect, useCallback } from 'react';
import { useDiary } from '../hooks/useDiary';
import { invoke } from '@tauri-apps/api/core';
import type { DiaryEntry, DiaryDashboard, AgentTemplate } from '../types';

const MOOD_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  happy:       { emoji: '😊', color: '#f59e0b', label: 'Happy' },
  thoughtful:  { emoji: '🤔', color: '#8b5cf6', label: 'Thoughtful' },
  frustrated:  { emoji: '😤', color: '#ef4444', label: 'Frustrated' },
  proud:       { emoji: '💪', color: '#10b981', label: 'Proud' },
  worried:     { emoji: '😟', color: '#f97316', label: 'Worried' },
  grateful:    { emoji: '🥰', color: '#ec4899', label: 'Grateful' },
  excited:     { emoji: '🤩', color: '#06b6d4', label: 'Excited' },
  calm:        { emoji: '😌', color: '#14b8a6', label: 'Calm' },
  confused:    { emoji: '😵‍💫', color: '#a855f7', label: 'Confused' },
  motivated:   { emoji: '🔥', color: '#dc2626', label: 'Motivated' },
};

export default function AgentDiaryView() {
  const { dashboard, entries, loading, loadDashboard, loadEntries, loadAllEntries, generateEntry } = useDiary();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentTemplate[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'feed' | 'agent'>('feed');

  useEffect(() => {
    loadDashboard();
    invoke<AgentTemplate[]>('agent_templates_list', { ageGroup: null })
      .then(setAgents).catch(console.error);
  }, [loadDashboard]);

  const handleSelectAgent = useCallback(async (agentId: string) => {
    setSelectedAgent(agentId);
    setViewMode('agent');
    await loadEntries(agentId);
  }, [loadEntries]);

  const handleGenerate = useCallback(async (agentId: string) => {
    setGenerating(agentId);
    try {
      await generateEntry(agentId);
      if (selectedAgent === agentId) {
        await loadEntries(agentId);
      }
      await loadDashboard();
    } finally {
      setGenerating(null);
    }
  }, [selectedAgent, generateEntry, loadEntries, loadDashboard]);

  const handleBackToFeed = useCallback(() => {
    setViewMode('feed');
    setSelectedAgent(null);
    loadAllEntries();
  }, [loadAllEntries]);

  if (loading) return (
    <div className="diary-view">
      <div className="diary-header"><h2 className="diary-title">📖 Agent Diary</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>Loading...</p></div>
    </div>
  );

  return (
    <div className="diary-view">
      {/* Header */}
      <div className="diary-header">
        {viewMode === 'agent' && selectedAgent ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
            <button onClick={handleBackToFeed} className="diary-back-btn">← All Entries</button>
            <div className="diary-title">
              {agents.find(a => a.id === selectedAgent)?.emoji} {agents.find(a => a.id === selectedAgent)?.name}'s Journal
            </div>
          </div>
        ) : (
          <>
            <h2 className="diary-title">📖 Agent Diary</h2>
            <div className="diary-stats">
              <span className="diary-stat">📝 {dashboard?.total_entries ?? 0} entries</span>
              <span className="diary-stat">📅 {dashboard?.entries_this_week ?? 0} this week</span>
            </div>
          </>
        )}
      </div>

      {viewMode === 'feed' ? (
        <>
          {/* Mood Distribution */}
          {dashboard && dashboard.mood_distribution.length > 0 && (
            <div className="diary-mood-strip">
              {dashboard.mood_distribution.slice(0, 6).map(m => {
                const mc = MOOD_CONFIG[m.mood] ?? { emoji: '❓', color: '#6b7280', label: m.mood };
                return (
                  <div key={m.mood} className="mood-badge" style={{ borderColor: mc.color + '40' }}>
                    <span>{mc.emoji}</span>
                    <span className="mood-count">{m.count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Agent Shelf */}
          <div className="diary-section">
            <h3 className="section-title">📚 Agent Shelf</h3>
            <div className="agent-shelf">
              {agents.map(agent => (
                <div key={agent.id} className="agent-book" onClick={() => handleSelectAgent(agent.id)}>
                  <span className="agent-book-emoji">{agent.emoji}</span>
                  <span className="agent-book-name">{agent.name}</span>
                  <button className="agent-book-write" onClick={e => { e.stopPropagation(); handleGenerate(agent.id); }}
                    disabled={generating === agent.id}>
                    {generating === agent.id ? '✏️...' : '✏️ Write'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Entries */}
          <div className="diary-section">
            <h3 className="section-title">📖 Recent Entries</h3>
            <div className="diary-entries-feed">
              {dashboard?.latest_entries.map(entry => (
                <DiaryEntryCard key={entry.id} entry={entry} agentName={agents.find(a => a.id === entry.agent_id)?.name ?? 'Unknown'} agentEmoji={agents.find(a => a.id === entry.agent_id)?.emoji ?? '🤖'} />
              ))}
              {(!dashboard || dashboard.latest_entries.length === 0) && (
                <div className="diary-empty">
                  <div className="diary-empty-icon">📖</div>
                  <p>No diary entries yet.</p>
                  <p className="diary-empty-hint">Click "Write" on an agent above to generate their first entry.</p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Agent's Journal */
        <div className="diary-entries-feed">
          <button className="btn-primary" onClick={() => handleGenerate(selectedAgent!)}
            disabled={generating === selectedAgent} style={{ marginBottom: 16, alignSelf: 'flex-start' }}>
            {generating === selectedAgent ? '✏️ Writing...' : `✏️ Write Today's Entry`}
          </button>
          {entries.map(entry => (
            <DiaryEntryCard key={entry.id} entry={entry} agentName={agents.find(a => a.id === entry.agent_id)?.name ?? 'Unknown'} agentEmoji={agents.find(a => a.id === entry.agent_id)?.emoji ?? '🤖'} />
          ))}
          {entries.length === 0 && (
            <div className="diary-empty">
              <div className="diary-empty-icon">📖</div>
              <p>This agent hasn't written any entries yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiaryEntryCard({ entry, agentName, agentEmoji }: { entry: DiaryEntry; agentName: string; agentEmoji: string }) {
  const [expanded, setExpanded] = useState(false);
  const mood = MOOD_CONFIG[entry.mood] ?? { emoji: '❓', color: '#6b7280', label: entry.mood };
  const topics = entry.topics_discussed ? JSON.parse(entry.topics_discussed) as string[] : [];
  const moment = entry.memorable_moment ? JSON.parse(entry.memorable_moment) as { moment: string; feeling: string } : null;
  const date = new Date(entry.entry_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="diary-entry-card" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
      {/* Entry Header */}
      <div className="diary-entry-header">
        <div className="diary-entry-avatar">
          <span>{agentEmoji}</span>
        </div>
        <div className="diary-entry-meta">
          <div className="diary-entry-title">{entry.title || `${agentName}'s Entry`}</div>
          <div className="diary-entry-date">{date}</div>
        </div>
        <div className="diary-entry-mood" style={{ background: mood.color + '20', color: mood.color }}>
          {mood.emoji} {mood.label}
        </div>
      </div>

      {/* Entry Content */}
      <div className={`diary-entry-content ${expanded ? 'expanded' : ''}`}>
        <p className="diary-entry-text">
          {expanded ? entry.content : entry.content.slice(0, 200) + (entry.content.length > 200 ? '...' : '')}
        </p>

        {/* Topics */}
        {topics.length > 0 && (
          <div className="diary-entry-topics">
            {topics.map((t: string, i: number) => (
              <span key={i} className="diary-topic-badge">{t}</span>
            ))}
          </div>
        )}

        {/* Memorable Moment */}
        {moment && expanded && (
          <div className="diary-memorable-moment">
            <div className="moment-label">💭 Memorable Moment</div>
            <div className="moment-text">"{moment.moment}"</div>
            <div className="moment-feeling">— {moment.feeling}</div>
          </div>
        )}
      </div>

      {/* Expand hint */}
      {!expanded && entry.content.length > 200 && (
        <div className="diary-expand-hint">tap to read more</div>
      )}
    </div>
  );
}
