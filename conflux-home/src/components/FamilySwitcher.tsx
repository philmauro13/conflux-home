// Conflux Home — Family Switcher
// Top bar component showing family member avatars. Click to switch active member.

import { useState } from 'react';
import type { FamilyMember, AgeGroup } from '../types';
import { AGE_GROUP_CONFIG } from '../types';

interface FamilySwitcherProps {
  members: FamilyMember[];
  activeMemberId: string | null;
  onSelect: (member: FamilyMember | null) => void;
  onAddClick: () => void;
  onProgressClick: (memberId: string) => void;
}

export default function FamilySwitcher({ members, activeMemberId, onSelect, onAddClick, onProgressClick }: FamilySwitcherProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const activeMember = members.find(m => m.id === activeMemberId);

  return (
    <div className="family-switcher">
      <div className="family-switcher-label">Family</div>
      <div className="family-avatars">
        {/* "All" button */}
        <button
          className={`family-avatar ${!activeMemberId ? 'active' : ''}`}
          onClick={() => onSelect(null)}
          title="All Agents"
          style={{ background: !activeMemberId ? '#6366f1' : '#2a2a3e' }}
        >
          👥
        </button>

        {/* Family member avatars */}
        {members.map(member => {
          const config = AGE_GROUP_CONFIG[member.age_group];
          const isActive = member.id === activeMemberId;
          const isHovered = member.id === hoveredId;
          return (
            <button
              key={member.id}
              className={`family-avatar ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(member)}
              onMouseEnter={() => setHoveredId(member.id)}
              onMouseLeave={() => setHoveredId(null)}
              title={`${member.name} (${config.label}, ${config.ageRange})`}
              style={{
                background: isActive ? member.color : isHovered ? member.color + '40' : '#2a2a3e',
                borderColor: isActive ? member.color : 'transparent',
              }}
            >
              {member.avatar || config.emoji}
            </button>
          );
        })}

        {/* Add member button */}
        <button
          className="family-avatar add"
          onClick={onAddClick}
          title="Add Family Member"
        >
          +
        </button>
      </div>

      {/* Active member label */}
      {activeMember && (
        <div className="family-active-label" style={{ color: activeMember.color }}>
          {activeMember.name}
          <span className="family-age-badge">
            {AGE_GROUP_CONFIG[activeMember.age_group].emoji} {AGE_GROUP_CONFIG[activeMember.age_group].ageRange}
          </span>
          <button
            className="family-progress-btn"
            onClick={() => onProgressClick(activeMember.id)}
            title={`${activeMember.name}'s Progress`}
          >
            📊
          </button>
        </div>
      )}
    </div>
  );
}
