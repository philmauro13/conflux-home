import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Avatar from './Avatar';
import DesktopWidgets from './DesktopWidgets';
import { Agent, AGENT_COLORS, View } from '../types';

interface DesktopProps {
  agents: Agent[];
  wallpaper?: string;
  onNavigate: (view: View) => void;
}

const STATUS_COLORS: Record<string, string> = {
  idle: '#555577',
  working: '#00ff88',
  thinking: '#ffaa00',
  error: '#ff4466',
  offline: '#555577',
};

export default function Desktop({ agents, wallpaper, onNavigate }: DesktopProps) {
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

  // (agent presence bar removed — agents accessible via TopBar)

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

      <DesktopWidgets onNavigate={onNavigate} />
    </div>
  );
}
