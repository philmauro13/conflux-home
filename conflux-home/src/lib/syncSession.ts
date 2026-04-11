/**
 * Force-sync the current Supabase session to the Rust engine.
 * Call this before every engine_chat/engine_chat_stream invocation
 * to ensure the engine has a fresh JWT.
 */

import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export async function syncSessionToEngine(): Promise<boolean> {
  try {
    console.log('[syncSessionToEngine] ══════════════════════════════════════════');
    console.log('[syncSessionToEngine] 🚀 Starting syncSessionToEngine...');
    
    // Get the current session
    console.log('[syncSessionToEngine] Calling supabase.auth.getSession()...');
    let { data: { session } } = await supabase.auth.getSession();
    console.log('[syncSessionToEngine] Session obtained:', !!session);
    console.log('[syncSessionToEngine] Has access_token:', !!session?.access_token);
    console.log('[syncSessionToEngine] Has user.id:', !!session?.user?.id);

    if (!session?.access_token || !session?.user?.id) {
      console.warn("[syncSessionToEngine] No active session");
      console.log('[syncSessionToEngine] ══════════════════════════════════════════');
      return false;
    }

    // Check if token is still valid (not expired)
    // Only refresh if expiring within 60 seconds
    if (session.expires_at) {
      const expiresAtMs = session.expires_at * 1000;
      const remainingMs = expiresAtMs - Date.now();

      if (remainingMs < 60_000) {
        console.log("[syncSessionToEngine] Token expiring soon, refreshing...");
        const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
        if (error) {
          console.warn("[syncSessionToEngine] Failed to refresh session:", error.message);
          await supabase.auth.signOut();
          return false;
        }
        session = refreshed;
        if (!session?.access_token || !session?.user?.id) {
          console.warn("[syncSessionToEngine] No active session after refresh");
          return false;
        }
      }
    }

    console.log(`[syncSessionToEngine] Syncing token: ${session.access_token.substring(0, 10)}...`);
    console.log(`[syncSessionToEngine] User ID: ${session.user.id}`);
    console.log(`[syncSessionToEngine] Supabase URL: ${SUPABASE_URL}`);
    console.log(`[syncSessionToEngine] Token expires in: ${session.expires_at ? Math.round((session.expires_at * 1000 - Date.now()) / 1000) + 's' : 'unknown'}`);
    console.log(`[syncSessionToEngine] Calling invoke('set_supabase_session')...`);

    await invoke("set_supabase_session", {
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      accessToken: session.access_token,
      userId: session.user.id,
    });

    console.log(`[syncSessionToEngine] ✅ invoke('set_supabase_session') completed`);
    console.log('[syncSessionToEngine] ══════════════════════════════════════════');
    return true;
  } catch (err) {
    console.error("[syncSessionToEngine] ❌ Failed:", err);
    console.log('[syncSessionToEngine] ══════════════════════════════════════════');
    return false;
  }
}
