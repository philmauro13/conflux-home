import { useState } from 'react';
import { STUDIO_MODULES, StudioModule } from '../types';

interface ToolPaletteProps {
  activeModule: StudioModule;
  onSelect: (module: StudioModule) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const MODULE_ORDER: StudioModule[] = ['image', 'video', 'music', 'voice', 'code', 'design'];

export default function ToolPalette({ activeModule, onSelect, isCollapsed, onToggleCollapse }: ToolPaletteProps) {
  return (
    <div className={`studio-toolpalette ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="toolpalette-header">
        {!isCollapsed && <span className="toolpalette-title">Modules</span>}
        <button
          className="toolpalette-collapse-btn"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand tools' : 'Collapse tools'}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>
      <div className="toolpalette-items">
        {MODULE_ORDER.map((key) => {
          const mod = STUDIO_MODULES[key];
          const isActive = key === activeModule;
          return (
            <button
              key={key}
              className={`toolpalette-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(key)}
              title={mod.description}
            >
              <span className="toolpalette-icon">{mod.icon}</span>
              {!isCollapsed && (
                <>
                  <span className="toolpalette-label">{mod.label}</span>
                  <span className="toolpalette-desc">{mod.description}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
