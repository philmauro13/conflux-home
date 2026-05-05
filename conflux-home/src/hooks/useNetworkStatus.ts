// Auto-detect internet connectivity with lightweight ping
// Falls back gracefully — no false negatives from browser offline events

import { useState, useEffect, useCallback, useRef } from 'react';

const PING_URL = 'https://www.google.com/generate_204'; // Fast 204 response
const PING_INTERVAL_MS = 15_000; // Check every 15s
const PING_TIMEOUT_MS = 5_000;

export interface NetworkStatus {
  online: boolean;
  checking: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    // Cancel previous ping
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setChecking(true);
    try {
      const res = await fetch(PING_URL, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
        cache: 'no-store',
      });
      // no-cors hides response status, but if we get here without throwing,
      // the network layer succeeded
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, PING_INTERVAL_MS);

    // Also listen for browser online/offline as a hint to check immediately
    const onOnline = () => check();
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [check]);

  return { online, checking };
}
