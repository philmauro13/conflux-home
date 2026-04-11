import { STUDIO_MODULES, StudioModule } from '../types';

interface StudioTabsProps {
  activeModule: StudioModule;
  onSelect: (module: StudioModule) => void;
}

const MODULE_ORDER: StudioModule[] = ['image', 'video', 'music', 'voice', 'code', 'design'];

export default function StudioTabs({ activeModule, onSelect }: StudioTabsProps) {
  return (
    <div className="studio-tabs">
      {MODULE_ORDER.map((key) => {
        const mod = STUDIO_MODULES[key];
        const isActive = key === activeModule;
        return (
          <button
            key={key}
            className={`studio-tab ${isActive ? 'studio-tab-active' : ''}`}
            onClick={() => onSelect(key)}
            title={mod.description}
          >
            <span className="studio-tab-icon">{mod.icon}</span>
            <span className="studio-tab-label">{mod.label}</span>
          </button>
        );
      })}
    </div>
  );
}
