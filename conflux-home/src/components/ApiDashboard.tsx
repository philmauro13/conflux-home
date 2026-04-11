
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './../styles/api-dashboard.css';
import { useApiDashboard, CreditBalance, UsageEntry, CreditPack, PurchaseHistoryEntry, ApiKey } from './../hooks/useApiDashboard';
import { useAuth } from './../hooks/useAuth';

// Date formatting helpers (replaces date-fns)
function formatShortDay(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}
function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}
function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatFullDateTime(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}


// Helper to format currency
const formatCurrency = (amount: number) => {
  return amount.toFixed(2);
};

// Helper to format large numbers
const formatLargeNumber = (num: number): string => {
    if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(1) + 'M';
    }
    if (num >= 1_000) {
        return (num / 1_000).toFixed(1) + 'K';
    }
    return num.toString();
};


const ApiDashboard: React.FC = () => {
  const {
    creditBalance,
    usageHistory,
    models,
    creditPacks,
    purchaseHistory,
    apiKeys,
    loading,
    error,
    getUsageStats,
    handleCheckout,
    createApiKey,
    revokeApiKey,
    refreshData,
  } = useApiDashboard();
  const { session } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'usage' | 'api-keys' | 'buy-credits'>('overview');

  const usageStats = useMemo(() => getUsageStats(), [getUsageStats]);

  useEffect(() => {
    // Optionally trigger data refresh when component mounts or session changes
    if (session?.access_token) {
      refreshData();
    }
  }, [session?.access_token, refreshData]);

  if (!session?.access_token) {
    return (
      <div className="api-dashboard-container">
        <h2 className="api-dashboard-title">API Dashboard</h2>
        <div className="api-dashboard-card text-center text-error">
          Please log in to view your API Dashboard.
        </div>
      </div>
    );
  }

  if (loading && !creditBalance && !error) {
    return (
      <div className="api-dashboard-container">
        <h2 className="api-dashboard-title">API Dashboard</h2>
        <div className="api-dashboard-card text-center">Loading dashboard data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="api-dashboard-container">
        <h2 className="api-dashboard-title">API Dashboard</h2>
        <div className="api-dashboard-card text-center text-error">Error: {error}</div>
      </div>
    );
  }

  // Helper for time ago
  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
  };


  const renderOverviewTab = () => (
    <>
      <div className="api-dashboard-card credits-hero-card">
        <div className="credits-hero-number">{creditBalance?.amount.toLocaleString() || '0'}</div>
        <div className="credits-hero-label">Credits Available</div>
      </div>

      <div className="api-dashboard-card mb-6">
        <h3 className="card-title">Quick Stats (Last 30 Days)</h3>
        <div className="stats-row">
          <div className="stat-item">
            <div className="stat-value">{formatLargeNumber(usageStats.requestsThisMonth)}</div>
            <div className="stat-label">Requests</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{(usageStats.successRate * 100).toFixed(0)}%</div>
            <div className="stat-label">Success Rate</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{usageStats.avgLatency.toFixed(0)}ms</div>
            <div className="stat-label">Avg Latency</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{formatLargeNumber(usageStats.creditsUsed)}</div>
            <div className="stat-label">Credits Used</div>
          </div>
        </div>
      </div>

      <div className="grid-cols-2">
        <div className="api-dashboard-card">
          <h3 className="card-title">Usage Sparkline (Last 7 Days)</h3>
          <div className="usage-sparkline">
            {usageStats.usageSparkline.map((day, index) => (
              <div key={index} className="sparkline-bar-wrapper">
                <div
                  className="sparkline-bar"
                  style={{ height: `${(day.requests / Math.max(1, ...usageStats.usageSparkline.map(d => d.requests))) * 100}%` }}
                >
                    <span className="sparkline-bar-value">{day.requests} requests</span>
                </div>
                <div className="sparkline-bar-label">{formatShortDay(new Date(day.date))}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="api-dashboard-card">
          <h3 className="card-title">Recent Activity</h3>
          <div className="recent-activity-list">
            {usageStats.recentActivity.length > 0 ? (
              usageStats.recentActivity.map((entry) => (
                <div key={entry.id} className="activity-item">
                  <div className="activity-item-details">
                    <span className="text-white">{entry.model}</span>
                    <span className="activity-item-meta">
                      <span>Credits: {entry.creditsCharged.toFixed(2)}</span>
                      <span className={entry.status === 'success' ? 'text-success' : 'text-error'}>{entry.status}</span>
                    </span>
                  </div>
                  <span className="text-secondary">{timeAgo(entry.timestamp)}</span>
                </div>
              ))
            ) : (
                <div className="text-secondary text-center">No recent activity.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  const renderUsageTab = () => {
    // Group usage history by day
    const groupedUsage: { [key: string]: UsageEntry[] } = usageHistory.reduce((acc: Record<string, UsageEntry[]>, entry) => {
      const dateKey = formatDateKey(new Date(entry.timestamp));
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(entry);
      return acc;
    }, {} as Record<string, UsageEntry[]>);

    const dailySummaries = Object.entries(groupedUsage).map(([date, entries]) => {
      const totalCredits = entries.reduce((sum, e) => sum + e.creditsCharged, 0);
      const totalRequests = entries.length;
      return { date, totalCredits, totalRequests };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());


    const totalModelUsage = usageStats.topModels.reduce((sum, model) => sum + model.usage, 0);

    return (
      <>
        <div className="api-dashboard-card mb-6">
          <h3 className="card-title">Usage History</h3>
          {usageHistory.length > 0 ? (
            <div className="usage-table-container">
              <table className="api-dashboard-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Model</th>
                    <th>Provider</th>
                    <th>Tokens In/Out</th>
                    <th>Credits Used</th>
                    <th>Latency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {usageHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatFullDateTime(new Date(entry.timestamp))}</td>
                      <td>{entry.model}</td>
                      <td>{entry.provider}</td>
                      <td>{entry.tokensIn}/{entry.tokensOut}</td>
                      <td>{entry.creditsCharged.toFixed(2)}</td>
                      <td>{entry.latency.toFixed(0)}ms</td>
                      <td className={entry.status === 'success' ? 'text-success' : 'text-error'}>
                        {entry.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-secondary text-center">No usage history available.</div>
          )}
        </div>

        <div className="grid-cols-2">
            <div className="api-dashboard-card">
                <h3 className="card-title">Daily Usage Summaries</h3>
                {dailySummaries.length > 0 ? (
                    <div className="flex-col gap-4">
                        {dailySummaries.map(summary => (
                            <div key={summary.date} className="daily-summary-card flex-row justify-between items-center">
                                <span className="font-semibold text-white">{formatLongDate(new Date(summary.date))}</span>
                                <span className="text-secondary">{summary.totalRequests} Requests</span>
                                <span className="font-bold text-accent">{summary.totalCredits.toFixed(2)} Credits</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-secondary text-center">No daily summaries.</div>
                )}
            </div>
            <div className="api-dashboard-card">
                <h3 className="card-title">Top Models by Credits Used</h3>
                {usageStats.topModels.length > 0 ? (
                    <div className="top-models-chart">
                        {usageStats.topModels.map((model, index) => (
                            <div key={index} className="top-model-bar-wrapper">
                                <span className="top-model-label">{model.model}</span>
                                <div className="top-model-bar-background">
                                    <div
                                        className="top-model-bar-fill"
                                        style={{ width: `${(model.usage / totalModelUsage) * 100}%` }}
                                    >
                                        {model.usage.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-secondary text-center">No model usage data.</div>
                )}
            </div>
        </div>
      </>
    );
  };

  const renderApiKeysTab = () => (
    <>
      <div className="api-dashboard-card mb-6">
        <h3 className="card-title">Your API Keys</h3>
        <p className="text-secondary mb-4">
          API key management features are coming soon! You'll be able to create, view, and revoke your API keys here.
        </p>
        <button onClick={createApiKey} className="api-dashboard-button" disabled>Create New Key</button>
      </div>

      <div className="api-dashboard-card">
        <h3 className="card-title">Key List (Coming Soon)</h3>
        {apiKeys.length === 0 ? (
          <div className="coming-soon">
            <p>API Key management is Coming Soon!</p>
            <p>Check back later to manage your keys.</p>
          </div>
        ) : (
          <div className="api-key-list">
            {/* Placeholder for future API key display */}
            {apiKeys.map(key => (
              <div key={key.id} className="api-key-item">
                <div>
                  <span className="text-white font-mono">{key.maskedKey}</span>
                  <span className="text-secondary ml-4">Created: {formatFullDate(new Date(key.created))}</span>
                  {key.lastUsed && <span className="text-secondary ml-4">Last Used: {timeAgo(key.lastUsed)}</span>}
                  <span className={`ml-4 ${key.status === 'active' ? 'text-success' : 'text-error'}`}>{key.status}</span>
                </div>
                <button onClick={() => revokeApiKey(key.id)} className="api-dashboard-button outline" disabled={key.status === 'revoked'}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const renderBuyCreditsTab = () => (
    <>
      <div className="api-dashboard-card mb-6">
        <h3 className="card-title">Available Credit Packs</h3>
        <div className="credit-pack-grid">
          {creditPacks.length > 0 ? (
            creditPacks.map((pack) => (
              <div key={pack.id} className="credit-pack-card">
                <div className="credit-pack-name">{pack.name}</div>
                <div className="credit-pack-credits">{pack.credits.toLocaleString()}</div>
                <div className="text-secondary mb-2">Credits</div>
                <div className="credit-pack-price">${formatCurrency(pack.price)}</div>
                <div className="credit-pack-price-per-credit">(${formatCurrency(pack.pricePerCredit)} / Credit)</div>
                <button onClick={() => handleCheckout(pack.id)} className="api-dashboard-button">Buy Now</button>
              </div>
            ))
          ) : (
            <div className="text-secondary text-center col-span-full">No credit packs available.</div>
          )}
        </div>
      </div>

      <div className="api-dashboard-card">
        <h3 className="card-title">Purchase History</h3>
        {purchaseHistory.length > 0 ? (
          <div className="usage-table-container">
            <table className="api-dashboard-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Pack Name</th>
                  <th>Credits</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {purchaseHistory.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatFullDateTime(new Date(entry.date))}</td>
                    <td>{entry.packName}</td>
                    <td>{entry.credits.toLocaleString()}</td>
                    <td>${formatCurrency(entry.amount)}</td>
                    <td className={entry.status === 'completed' ? 'text-success' : entry.status === 'failed' ? 'text-error' : ''}>
                      {entry.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-secondary text-center">No purchase history available.</div>
        )}
      </div>
    </>
  );

  return (
    <div className="api-dashboard-container">
      <div className="api-dashboard-header">
        <h2 className="api-dashboard-title">API Dashboard</h2>
        {/* Potentially add global actions here, e.g., "Refresh Data" */}
      </div>

      <div className="api-dashboard-tabs">
        <button
          className={`api-dashboard-tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`api-dashboard-tab-button ${activeTab === 'usage' ? 'active' : ''}`}
          onClick={() => setActiveTab('usage')}
        >
          Usage
        </button>
        <button
          className={`api-dashboard-tab-button ${activeTab === 'api-keys' ? 'active' : ''}`}
          onClick={() => setActiveTab('api-keys')}
        >
          API Keys
        </button>
        <button
          className={`api-dashboard-tab-button ${activeTab === 'buy-credits' ? 'active' : ''}`}
          onClick={() => setActiveTab('buy-credits')}
        >
          Buy Credits
        </button>
      </div>

      <div className="api-dashboard-content">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'usage' && renderUsageTab()}
        {activeTab === 'api-keys' && renderApiKeysTab()}
        {activeTab === 'buy-credits' && renderBuyCreditsTab()}
      </div>
    </div>
  );
};

export default ApiDashboard;
