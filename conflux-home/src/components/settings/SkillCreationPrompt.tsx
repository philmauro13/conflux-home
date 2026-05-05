// Conflux Home — Skill Creation Prompt Modal (Phase 4)
// Shown when Conflux learns a new skill pattern after 5+ tool calls.

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';

interface SkillDraft {
  skill_name: string;
  description: string;
  triggers: string;
  procedure: string;
  tool_sequence: string;
  total_tool_calls: number;
}

interface Props {
  draft: SkillDraft;
  onClose: () => void;
}

export default function SkillCreationPrompt({ draft, onClose }: Props) {
  const [saving, setSaving] = useState(false);

  const handleAccept = async () => {
    setSaving(true);
    try {
      const skillId = await invoke<string>('engine_accept_skill_prompt', {
        skillName: draft.skill_name,
        description: draft.description,
        triggers: draft.triggers,
        procedure: draft.procedure,
      });
      window.dispatchEvent(new CustomEvent('conflux:toast', {
        detail: { message: `🧩 New skill learned: ${draft.skill_name}`, type: 'success' },
      }));
      onClose();
    } catch (err) {
      window.dispatchEvent(new CustomEvent('conflux:toast', {
        detail: { message: `Failed to save skill: ${err}`, type: 'error' },
      }));
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await invoke('engine_dismiss_skill_prompt');
    } catch (_) {}
    onClose();
  };

  return (
    <div className="skill-prompt-overlay">
      <div className="skill-prompt-card">
        <div className="skill-prompt-emoji">🧩</div>
        <h2 className="skill-prompt-title">New Skill Learned</h2>
        <p className="skill-prompt-subtitle">
          After {draft.total_tool_calls} tool calls, Conflux noticed a pattern it wants to remember.
        </p>

        <div className="skill-prompt-details">
          <div className="skill-prompt-detail-row">
            <span className="skill-prompt-detail-label">Name</span>
            <span className="skill-prompt-detail-value">{draft.skill_name}</span>
          </div>
          <div className="skill-prompt-detail-row">
            <span className="skill-prompt-detail-label">Sequence</span>
            <span className="skill-prompt-detail-value">{draft.tool_sequence}</span>
          </div>
          <div className="skill-prompt-detail-row">
            <span className="skill-prompt-detail-label">Triggers</span>
            <span className="skill-prompt-detail-value">{draft.triggers}</span>
          </div>
        </div>

        <div className="skill-prompt-actions">
          <button className="skill-prompt-btn primary" onClick={handleAccept} disabled={saving}>
            {saving ? '💾 Saving…' : '✅ Yes, remember this'}
          </button>
          <button className="skill-prompt-btn secondary" onClick={handleDismiss} disabled={saving}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
