import { useState, useEffect, useCallback, useRef } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { invoke } from '@tauri-apps/api/core'
import { supabase } from '../lib/supabase'
import { trackEvent, registerDevice } from '../lib/telemetry'

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

function getOsInfo(): string {
  const ua = navigator.userAgent
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Mac')) return 'macOS'
  if (ua.includes('Linux')) return 'Linux'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('iOS') || ua.includes('iPhone')) return 'iOS'
  return 'Unknown'
}

export interface UseAuthReturn {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithEmail: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const hasTrackedOpen = useRef(false)
  const hasTrackedSignup = useRef(false)

  useEffect(() => {
    // Check existing session and refresh if needed
    const checkSession = async () => {
      try {
        // First, try to get a fresh session by refreshing
        // This handles expired tokens from reinstall or long idle
        const { data: { session: freshSession }, error: refreshError } = await supabase.auth.refreshSession()
        
        if (refreshError) {
          console.log('[useAuth] Refresh failed, trying to get stored session...')
          // Fallback to stored session
          const { data: { session: s }, error: getSessionError } = await supabase.auth.getSession()
          if (getSessionError) {
            console.error('[useAuth] Failed to get session:', getSessionError.message)
          }
          
          // If we have a stored session but can't refresh it, it's likely expired
          // Clear it so the user can re-authenticate
          if (s?.access_token) {
            console.log('[useAuth] Stored session found but refresh failed - likely expired')
            console.log('[useAuth] Clearing stale session to force re-authentication')
            await supabase.auth.signOut()
            setSession(null)
            setUser(null)
            setLoading(false)
          } else {
            setSession(s)
            setUser(s?.user ?? null)
            setLoading(false)
          }
        } else {
          // Successfully refreshed
          console.log('[useAuth] Session refreshed successfully')
          setSession(freshSession)
          setUser(freshSession?.user ?? null)
          setLoading(false)
        }
      } catch (err) {
        console.error('[useAuth] Session check error:', err)
        setSession(null)
        setUser(null)
        setLoading(false)
      }
    }

    checkSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        console.log('[useAuth] ══════════════════════════════════════════');
        console.log('[useAuth] 🚀 Auth state changed:', _event);
        console.log('[useAuth] Has session:', !!s);
        if (s) {
          console.log('[useAuth] User ID:', s.user?.id);
          console.log('[useAuth] Token preview:', s.access_token?.substring(0, 10));
        }
        setSession(s)
        setUser(s?.user ?? null)
        setLoading(false)
        console.log('[useAuth] ✅ Session state updated');
      },
    )

    return () => subscription.unsubscribe()
  }, [])

  // Pass Supabase credentials to Rust backend when session changes
  // Also sync before each chat request to ensure we have a fresh token
  useEffect(() => {
    console.log('[useAuth] useAuth useEffect triggered');
    console.log('[useAuth] session?.access_token:', !!session?.access_token);
    console.log('[useAuth] session?.user?.id:', !!session?.user?.id);
    if (!session?.access_token || !session?.user?.id) {
      console.log('[useAuth] ❌ Skipping sync: no session or missing data');
      return
    }
    console.log('[useAuth] 🚀 Syncing to engine...');
    invoke('set_supabase_session', {
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      accessToken: session.access_token,
      userId: session.user.id,
    }).then(() => {
      console.log('[useAuth] ✅ Synced to engine successfully');
    }).catch((err) => console.warn('[useAuth] ❌ Failed to sync Supabase session to backend:', err))
  }, [session?.access_token, session?.user?.id, SUPABASE_URL, SUPABASE_ANON_KEY])

  // Fire telemetry on confirmed session
  useEffect(() => {
    if (!user || hasTrackedOpen.current) return
    hasTrackedOpen.current = true

    const osInfo = getOsInfo()
    const deviceId = crypto.randomUUID()

    // Register device then track events (fire-and-forget)
    registerDevice(user.id, 'desktop', 'Conflux Home', osInfo, APP_VERSION).then((id) => {
      const devId = id ?? deviceId
      trackEvent(user.id, devId, 'app_opened', { os: osInfo, version: APP_VERSION })

      // Track signup_completed only on first session (check created_at)
      const createdAt = new Date(user.created_at).getTime()
      const now = Date.now()
      const isNewUser = now - createdAt < 60_000 // created within last minute
      if (isNewUser && !hasTrackedSignup.current) {
        hasTrackedSignup.current = true
        trackEvent(user.id, devId, 'signup_completed', {})
      }
    })
  }, [user])

  const signInWithEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) return { error: error.message }
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return { user, session, loading, signInWithEmail, signOut }
}
