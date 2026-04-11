import { useMemo } from 'react';
import { useUsageHistory, useUsageStats } from '../../hooks/useCredits';

function formatTime(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Today Summary ──

function TodaySummary({ entries }: { entries: ReturnType<typeof useUsageHistory>['entries'] }) {
  const todayEntries = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return entries.filter(e => new Date(e.created_at).getTime() >= todayStart);
  }, [entries]);

  const calls = todayEntries.length;
  const creditsUsed = todayEntries.reduce((sum, e) => sum + e.credits_charged, 0);
  const successCount = todayEntries.filter(e => e.status === 'success' || e.status === 'ok').length;
  const successRate = calls > 0 ? Math.round((successCount / calls) * 100) : 100;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 12,
      marginBottom: 20,
    }}>
      <div style={{
        background: 'var(--bg-surface, rgba(255,255,255,0.03))',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        padding: 14,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent, #0071e3)' }}>{calls}</div>
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Calls Today</div>
      </div>
      <div style={{
        background: 'var(--bg-surface, rgba(255,255,255,0.03))',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        padding: 14,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent, #0071e3)' }}>
          {creditsUsed.toLocaleString()}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Credits Used</div>
      </div>
      <div style={{
        background: 'var(--bg-surface, rgba(255,255,255,0.03))',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        padding: 14,
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 22,
          fontWeight: 700,
          color: successRate >= 95 ? '#22c55e' : successRate >= 80 ? '#f59e0b' : '#ef4444',
        }}>
          {successRate}%
        </div>
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Success Rate</div>
      </div>
    </div>
  );
}

// ── Stats Cards ──

function StatsCards({ stats }: { stats: ReturnType<typeof useUsageStats>['stats'] }) {
  if (!stats) return null;

  const topProvider = stats.by_provider.length > 0
    ? stats.by_provider.reduce((a, b) => a.call_count > b.call_count ? a : b)
    : null;

  const topModel = stats.by_model.length > 0
    ? stats.by_model.reduce((a, b) => a.call_count > b.call_count ? a : b)
    : null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12,
      marginBottom: 20,
    }}>
      <div style={{
        background: 'var(--bg-surface, rgba(255,255,255,0.03))',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        padding: 14,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.total_calls}</div>
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Total Calls (7d)</div>
      </div>
      <div style={{
        background: 'var(--bg-surface, rgba(255,255,255,0.03))',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        padding: 14,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.total_credits.toLocaleString()}</div>
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Credits Used (7d)</div>
      </div>
      <div style={{
        background: 'var(--bg-surface, rgba(255,255,255,0.03))',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        padding: 14,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#00cc88' }}>
          {topProvider?.provider_id ?? '—'}
        </div>
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Top Provider</div>
      </div>
      <div style={{
        background: 'var(--bg-surface, rgba(255,255,255,0.03))',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        padding: 14,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#ff8844', wordBreak: 'break-all' }}>
          {topModel?.model ?? '—'}
        </div>
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Top Model</div>
      </div>
    </div>
  );
}

// ── Main Component ──

export default function UsageSection() {
  const { entries, loading: entriesLoading } = useUsageHistory(20);
  const { stats, loading: statsLoading } = useUsageStats(7);

  return (
    <div className="settings-section">
      <div className="settings-section-title">📊 Usage</div>

      {(entriesLoading || statsLoading) ? (
        <div style={{ padding: 16, textAlign: 'center', opacity: 0.6 }}>
          Loading usage data…
        </div>
      ) : (
        <>
          {/* Today Summary */}
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, opacity: 0.8 }}>
            Today
          </div>
          <TodaySummary entries={entries} />

          {/* 7-Day Stats */}
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, opacity: 0.8 }}>
            Last 7 Days
          </div>
          <StatsCards stats={stats} />

          {/* Usage History Table */}
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, opacity: 0.8 }}>
            Recent Activity
          </div>
          {entries.length === 0 ? (
            <div style={{
              padding: 24,
              textAlign: 'center',
              opacity: 0.5,
              fontSize: 13,
              border: '1px dashed var(--border, rgba(255,255,255,0.1))',
              borderRadius: 10,
            }}>
              No usage yet. Start chatting with an agent to see your activity here.
            </div>
          ) : (
            <div style={{
              border: '1px solid var(--border, rgba(255,255,255,0.1))',
              borderRadius: 10,
              overflow: 'hidden',
            }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}>
                <thead>
                  <tr style={{
                    background: 'var(--bg-surface, rgba(255,255,255,0.03))',
                    borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))',
                  }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, opacity: 0.7 }}>Time</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, opacity: 0.7 }}>Model</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, opacity: 0.7 }}>Provider</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11, opacity: 0.7 }}>Tokens</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11, opacity: 0.7 }}>Credits</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: 11, opacity: 0.7 }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11, opacity: 0.7 }}>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => {
                    const isSuccess = entry.status === 'success' || entry.status === 'ok';
                    return (
                      <tr
                        key={entry.id}
                        style={{
                          borderBottom: i < entries.length - 1 ? '1px solid var(--border, rgba(255,255,255,0.06))' : 'none',
                        }}
                      >
                        <td style={{ padding: '8px 12px', opacity: 0.8, whiteSpace: 'nowrap' }}>
                          {formatTime(entry.created_at)}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{entry.model}</td>
                        <td style={{ padding: '8px 12px', opacity: 0.7 }}>{entry.provider_id}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {entry.tokens_used.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {entry.credits_charged}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 16 }}>
                          {isSuccess ? '✅' : '❌'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                          {formatMs(entry.latency_ms)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
