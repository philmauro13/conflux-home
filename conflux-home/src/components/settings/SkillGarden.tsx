// Conflux Home — Skill Garden UI (Phase 6)
// Three-section skill visualization: 🌱 Sprouting / 🌿 Growing / 🌳 Mature

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSkills } from '../../hooks/useSkills';

interface SkillFragment {
  id: number;
  category: string;
  lesson: string;
  created_at: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  icon?: string;
  active: boolean;
  agents: string[];
  installed_at: string;
  skill_type?: string;
  version?: string;
}

export default function SkillGarden() {
  const [fragments, setFragments] = useState<SkillFragment[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [bloomingId, setBloomingId] = useState<string | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [frags, allSkills] = await Promise.all([
        invoke<SkillFragment[]>('engine_get_skill_fragments'),
        invoke<Skill[]>('engine_get_skills', { activeOnly: null }),
      ]);
      setFragments(frags);
      setSkills(allSkills);
    } catch (err) {
      console.error('[SkillGarden] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // Listen for skill-created events to trigger bloom
    const unlisten = listen<{ skill_name: string; skill_id: string }>('conflux:skill-created', (event) => {
      setBloomingId(event.payload.skill_id);
      setTimeout(() => setBloomingId(null), 2000);
      refresh();
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const learned = skills.filter(s =>
    (s as any).skill_type === 'learned'
    || (s as any).skill_type === 'mined'
    || (s as any).skill_type === 'synthesized'
  );
  const domain = skills.filter(s => (s as any).skill_type === 'domain');

  if (loading) {
    return <div className="skill-garden-loading">
      <div className="spinner" />
      <span>Growing your garden…</span>
    </div>;
  }

  return (
    <div className="skill-garden">
      {showBrowser && (
        <div className="skill-browser-overlay" onClick={() => setShowBrowser(false)}>
          <div className="skill-browser-panel" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowBrowser(false)}>✕</button>
            <SkillsBrowser />
          </div>
        </div>
      )}

      {/* 🌱 Sprouting */}
      <div className="garden-section">
        <div className="garden-section-header">
          <span className="garden-emoji">🌱</span>
          <span className="garden-section-title">Sprouting</span>
          <span className="garden-count-badge">{fragments.length}</span>
        </div>
        {fragments.length === 0 ? (
          <div className="garden-empty-state">
            <p>No skill fragments yet. Fragments grow as you use tools frequently.</p>
          </div>
        ) : (
          <div className="garden-cards">
            {fragments.map(frag => (
              <div key={frag.id} className="skill-card fragment-card">
                <div className="skill-card-emoji">🌰</div>
                <div className="skill-card-body">
                  <div className="skill-card-name">{frag.category}</div>
                  <div className="skill-card-description">{frag.lesson.slice(0, 80)}{frag.lesson.length > 80 ? '…' : ''}</div>
                  <span className="skill-type-badge fragment-badge">fragment</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 🌿 Growing */}
      <div className="garden-section">
        <div className="garden-section-header">
          <span className="garden-emoji">🌿</span>
          <span className="garden-section-title">Growing</span>
          <span className="garden-count-badge">{learned.length}</span>
        </div>
        {learned.length === 0 ? (
          <div className="garden-empty-state">
            <p>No learned skills yet. After 5+ tool calls, Conflux will ask to remember what it learned.</p>
          </div>
        ) : (
          <div className="garden-cards">
            {learned.map(skill => (
              <div key={skill.id} className={`skill-card ${bloomingId === skill.id ? 'blooming' : ''}`}>
                <div className="skill-card-emoji">{skill.icon || '🧩'}</div>
                <div className="skill-card-body">
                  <div className="skill-card-name">{skill.name}</div>
                  <div className="skill-card-description">{skill.description?.slice(0, 80)}{skill.description?.length > 80 ? '…' : ''}</div>
                  <div className="skill-card-footer">
                    <span className="skill-type-badge learned-badge">learned</span>
                    {(skill as any).version && (
                      <span className="skill-version-badge">v{(skill as any).version}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 🌳 Mature */}
      <div className="garden-section">
        <div className="garden-section-header">
          <span className="garden-emoji">🌳</span>
          <span className="garden-section-title">Mature</span>
          <span className="garden-count-badge">{domain.length}</span>
          <button className="garden-browse-link" onClick={() => setShowBrowser(true)}>Browse all →</button>
        </div>
        {domain.length === 0 ? (
          <div className="garden-empty-state">
            <p>No domain skills installed yet.</p>
          </div>
        ) : (
          <div className="garden-cards">
            {domain.map(skill => (
              <div key={skill.id} className="skill-card">
                <div className="skill-card-emoji">{skill.icon || '🏛️'}</div>
                <div className="skill-card-body">
                  <div className="skill-card-name">{skill.name}</div>
                  <div className="skill-card-description">{skill.description?.slice(0, 80)}{skill.description?.length > 80 ? '…' : ''}</div>
                  <div className="skill-card-footer">
                    <span className="skill-type-badge domain-badge">domain</span>
                    {(skill as any).version && (
                      <span className="skill-version-badge">v{(skill as any).version}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Inline SkillsBrowser (simplified version for the modal)
function SkillsBrowser() {
  const { skills, loading, toggle } = useSkills();
  if (loading) return <div className="spinner" />;
  return (
    <div className="skills-browser-panel">
      <h3>All Skills</h3>
      <div className="skills-list">
        {skills.map(skill => (
          <div key={skill.id} className="skills-list-row">
            <span>{skill.icon || '🔌'} {skill.name}</span>
            <label className="toggle-switch-wrap">
              <input type="checkbox" checked={skill.active} onChange={e => toggle(skill.id, e.target.checked)} />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// Re-export useSkills for the inline browser (noop — already imported above)
void useSkills;
