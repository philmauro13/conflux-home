import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import DesktopQuadrants from './DesktopQuadrants';
import { Agent, View } from '../types';

interface DesktopV2Props {
  agents: Agent[];
  wallpaper?: string;
  onNavigate: (view: View) => void;
}

export default function DesktopV2({ agents, wallpaper, onNavigate }: DesktopV2Props) {
  const [liveStats, setLiveStats] = useState({
    activeAgents: 0,
  });

  // Fetch live stats from engine
  useEffect(() => {
    async function fetchStats() {
      try {
        const engineAgents = await invoke<any[]>('engine_get_agents');
        const active = engineAgents.filter((a: any) => a.status !== 'offline').length;
        setLiveStats(prev => ({ ...prev, activeAgents: active }));
      } catch {
        // silently fail, show defaults
      }
    }
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="desktop-area"
      style={wallpaper ? {
        backgroundImage: `url('${wallpaper}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : undefined}
    >
      <div className="desktop-bg-pattern" />

      <DesktopQuadrants onNavigate={onNavigate} agents={agents} />
    </div>
  );
}
