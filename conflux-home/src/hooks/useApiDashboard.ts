
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth'; // Assuming useAuth is in the same hooks directory or similar path

// --- Type Definitions ---
export interface CreditBalance {
  amount: number; // User's current credit balance
  // Add other relevant fields if available from API, e.g., lastUpdated, currencyUnit
}

export interface UsageEntry {
  id: string;
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  creditsCharged: number;
  latency: number; // in ms
  status: 'success' | 'failed' | 'pending';
  timestamp: string; // ISO date string
}

export interface UsageStats {
  requestsThisMonth: number;
  successRate: number; // e.g., 0.95 for 95%
  avgLatency: number; // in ms
  creditsUsed: number;
  usageSparkline: { date: string; requests: number }[]; // For last 7 days chart
  recentActivity: UsageEntry[]; // Last 5 requests
  topModels: { model: string; usage: number }[];
}

export interface CreditPack {
  id: string; // e.g., "starter", "pro"
  name: string;
  credits: number;
  price: number; // in USD (e.g., 10.00)
  pricePerCredit: number;
  description?: string;
}

export interface PurchaseHistoryEntry {
  id: string;
  date: string; // ISO date string
  packName: string;
  credits: number;
  amount: number; // amount paid
  status: 'completed' | 'failed' | 'pending';
}

export interface ApiKey {
  id: string;
  prefix: string; // First 8 chars
  maskedKey: string; // Full key with middle masked, e.g., 'sk-xxxx...xxxx'
  created: string; // ISO date string
  lastUsed: string | null; // ISO date string or null
  status: 'active' | 'revoked';
}

// --- API Base URLs ---
const CONFLUX_ROUTER_BASE_URL = 'https://zcvhozqrssotirabdlzr.supabase.co/functions/v1/conflux-router';
const API_BILLING_BASE_URL = 'https://zcvhozqrssotirabdlzr.supabase.co/functions/v1/api-billing';

export const useApiDashboard = () => {
  const { session } = useAuth(); // Get session object which contains access_token
  const jwt = session?.access_token;

  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [usageHistory, setUsageHistory] = useState<UsageEntry[]>([]);
  const [models, setModels] = useState<string[]>([]); // Assuming models API returns an array of model names/ids
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryEntry[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!jwt) {
      setError('Authentication token not available.');
      setLoading(false);
      return null;
    }
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText} (${response.status})`);
      }
      return await response.json();
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data.');
      return null;
    }
  }, [jwt]);

  const fetchPublic = useCallback(async (url: string, options: RequestInit = {}) => {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText} (${response.status})`);
      }
      return await response.json();
    } catch (err: any) {
      setError(err.message || 'Failed to fetch public data.');
      return null;
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Fetch credit packs (no auth needed)
    const packsData = await fetchPublic(`${API_BILLING_BASE_URL}/v1/billing/packs`);
    if (packsData && Array.isArray(packsData)) {
      setCreditPacks(packsData);
    } else {
        setCreditPacks([]); // Ensure it's an array even if empty or invalid
    }

    if (!jwt) {
      setLoading(false);
      return; // Stop if no JWT for authenticated calls
    }

    // Authenticated calls
    const [
      balanceData,
      usageData,
      modelsData,
      purchaseHistoryData,
      // apiKeysData, // Temporarily disable API keys until endpoint exists
    ] = await Promise.all([
      fetchWithAuth(`${CONFLUX_ROUTER_BASE_URL}/v1/credits`),
      fetchWithAuth(`${CONFLUX_ROUTER_BASE_URL}/v1/usage?limit=50`),
      fetchWithAuth(`${CONFLUX_ROUTER_BASE_URL}/v1/models`),
      fetchWithAuth(`${API_BILLING_BASE_URL}/v1/billing/history`),
      // fetchWithAuth(`${CONFLUX_ROUTER_BASE_URL}/v1/api-keys`), // Placeholder for API keys
    ]);

    if (balanceData) {
      setCreditBalance(balanceData);
    }
    if (usageData && Array.isArray(usageData)) {
      setUsageHistory(usageData);
    } else {
        setUsageHistory([]);
    }
    if (modelsData && Array.isArray(modelsData)) {
        // Assuming modelsData is an array of strings directly, transform if needed
        setModels(modelsData);
    } else {
        setModels([]);
    }
    if (purchaseHistoryData && Array.isArray(purchaseHistoryData)) {
      setPurchaseHistory(purchaseHistoryData);
    } else {
        setPurchaseHistory([]);
    }
    // if (apiKeysData && Array.isArray(apiKeysData)) {
    //   setApiKeys(apiKeysData);
    // } else {
    //    setApiKeys([]);
    // }

    setLoading(false);
  }, [jwt, fetchWithAuth, fetchPublic]);

  useEffect(() => {
    if (jwt) {
      fetchAllData();
    } else if (!session && !loading) {
        // If no session and not loading, it means user is logged out or session expired
        // Clear data and potentially set an error, or redirect to login.
        // For now, we'll just clear data.
        setCreditBalance(null);
        setUsageHistory([]);
        setModels([]);
        setCreditPacks([]);
        setPurchaseHistory([]);
        setApiKeys([]);
        setError('Please log in to view API Dashboard.');
        setLoading(false);
    }
  }, [jwt, session, loading, fetchAllData]);

  // Helper to derive usage stats for Overview tab
  const getUsageStats = useCallback((): UsageStats => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const requestsThisMonth = usageHistory.filter(
      (entry) => new Date(entry.timestamp) > thirtyDaysAgo
    ).length;

    const successfulRequests = usageHistory.filter(
      (entry) => new Date(entry.timestamp) > thirtyDaysAgo && entry.status === 'success'
    ).length;
    const successRate = requestsThisMonth > 0 ? successfulRequests / requestsThisMonth : 0;

    const totalLatency = usageHistory.reduce(
      (sum, entry) => sum + (new Date(entry.timestamp) > thirtyDaysAgo ? entry.latency : 0),
      0
    );
    const avgLatency = requestsThisMonth > 0 ? totalLatency / requestsThisMonth : 0;

    const creditsUsed = usageHistory.reduce(
      (sum, entry) => sum + (new Date(entry.timestamp) > thirtyDaysAgo ? entry.creditsCharged : 0),
      0
    );

    // Usage sparkline (last 7 days)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const dailyRequests: { [key: string]: number } = {};
    usageHistory.forEach(entry => {
      const entryDate = new Date(entry.timestamp);
      if (entryDate > sevenDaysAgo && entryDate <= today) {
        const dateKey = entryDate.toISOString().split('T')[0];
        dailyRequests[dateKey] = (dailyRequests[dateKey] || 0) + 1;
      }
    });
    const usageSparkline: { date: string; requests: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      usageSparkline.push({ date: dateKey, requests: dailyRequests[dateKey] || 0 });
    }

    // Recent activity (last 5)
    const recentActivity = usageHistory
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    // Top models by usage
    const modelUsage: { [key: string]: number } = {};
    usageHistory.forEach(entry => {
      modelUsage[entry.model] = (modelUsage[entry.model] || 0) + entry.creditsCharged;
    });
    const topModels = Object.entries(modelUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5) // Limit to top 5 models
      .map(([model, usage]) => ({ model, usage }));


    return {
      requestsThisMonth,
      successRate,
      avgLatency,
      creditsUsed,
      usageSparkline,
      recentActivity,
      topModels,
    };
  }, [usageHistory]);

  const handleCheckout = useCallback(async (packId: string) => {
    if (!jwt) {
      setError('Authentication token not available.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BILLING_BASE_URL}/v1/billing/checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pack: packId }),
      });
      if (!response.ok) {
        throw new Error(`Checkout error: ${response.statusText} (${response.status})`);
      }
      const data = await response.json();
      if (data && data.checkoutUrl) {
        window.location.href = data.checkoutUrl; // Redirect to Stripe
      } else {
        throw new Error('Invalid checkout response.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initiate checkout.');
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  const createApiKey = useCallback(async () => {
    console.log('API Key creation not yet implemented on backend.');
    setError('API Key creation is not yet supported by the backend.');
    // Placeholder for actual API call when endpoint exists
    // if (!jwt) { /* handle error */ }
    // try {
    //   const response = await fetchWithAuth(`${CONFLUX_ROUTER_BASE_URL}/v1/api-keys`, { method: 'POST' });
    //   if (response) {
    //     // Update API keys list, maybe show the full key once
    //     fetchAllData();
    //   }
    // } catch (err) { /* handle error */ }
  }, []);

  const revokeApiKey = useCallback(async (keyId: string) => {
    console.log(`API Key revocation not yet implemented for key: ${keyId}`);
    setError('API Key revocation is not yet supported by the backend.');
    // Placeholder for actual API call when endpoint exists
    // if (!jwt) { /* handle error */ }
    // try {
    //   const response = await fetchWithAuth(`${CONFLUX_ROUTER_BASE_URL}/v1/api-keys/${keyId}`, { method: 'DELETE' });
    //   if (response) {
    //     // Update API keys after revocation
    //     fetchAllData();
    //   }
    // } catch (err) { /* handle error */ }
  }, []);


  return {
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
    refreshData: fetchAllData, // Expose a refresh function
  };
};
