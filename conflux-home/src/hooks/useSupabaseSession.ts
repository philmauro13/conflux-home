"use client";

import { supabase } from "@/lib/supabase";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";

/**
 * Hook that syncs the current Supabase session to the Rust engine.
 * The engine needs a fresh JWT for cloud API calls (theconflux.com/v1/chat/completions).
 *
 * Token expiration flow:
 * - Supabase access tokens expire after 1 hour
 * - Supabase SDK auto-refreshes the token in the background
 * - We listen for session changes and immediately re-sync to the engine
 * - Engine uses the fresh token for authenticated cloud calls
 */
export function useSupabaseSession() {
  const [isLoading, setIsLoading] = useState(true);
  const lastTokenRef = useRef<string | null>(null);

  // Sync session to engine whenever it changes
  useEffect(() => {
    const syncToEngine = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.access_token && session?.user?.id) {
          // Check if token actually changed (avoid redundant syncs)
          const token = session.access_token;
          if (token !== lastTokenRef.current) {
            lastTokenRef.current = token;

            await invoke("set_supabase_session", {
              supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
              supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              accessToken: token,
              userId: session.user.id,
            });
          }
        }
      } catch (err) {
        console.warn("[useSupabaseSession] Failed to sync to engine:", err);
      } finally {
        setIsLoading(false);
      }
    };

    // Initial sync
    syncToEngine();

    // Listen for auth changes (including token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string, session: any) => {
        console.log("[useSupabaseSession] Auth event:", event);
        // Re-sync on every auth state change (login, logout, token refresh)
        syncToEngine();
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return { isLoading };
}

/**
 * Helper to get the current Supabase access token.
 * Useful before making engine calls to ensure we're using a fresh token.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}
