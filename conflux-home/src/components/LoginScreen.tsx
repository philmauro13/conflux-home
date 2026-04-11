import { useState, useCallback, useEffect, useRef } from 'react'
import { onOpenUrl, getCurrent } from '@tauri-apps/plugin-deep-link'

interface LoginScreenProps {
  onAuthSuccess: () => void
}

/** Parse a conflux://auth/callback URL into tokens.
 *  Format: conflux://auth/callback#access_token=xxx&refresh_token=yyy
 *  Also handles: conflux://auth/callback?access_token=xxx&refresh_token=yyy  */
function parseAuthTokens(url: string): { access_token: string; refresh_token: string } | null {
  try {
    const hashIdx = url.indexOf('#')
    const queryIdx = url.indexOf('?')
    const sepIdx = hashIdx !== -1 ? hashIdx : queryIdx
    if (sepIdx === -1) return null

    const fragment = url.slice(sepIdx + 1)
    const params = new URLSearchParams(fragment)
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (!access_token || !refresh_token) return null
    return { access_token, refresh_token }
  } catch {
    return null
  }
}

export default function LoginScreen({ onAuthSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const processedUrls = useRef<Set<string>>(new Set())

  /** Handle a deep link URL: extract tokens and set the Supabase session. */
  const handleDeepLink = useCallback(async (url: string) => {
    if (!url.includes('conflux://')) return
    if (processedUrls.current.has(url)) return
    processedUrls.current.add(url)

    const tokens = parseAuthTokens(url)
    if (!tokens) return

    try {
      const { supabase } = await import('../lib/supabase')
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      })
      if (sessionError) {
        console.error('Deep link auth error:', sessionError.message)
        setError(sessionError.message)
      }
      // onAuthStateChange in useAuth will trigger onAuthSuccess automatically
    } catch (err: any) {
      console.error('Deep link session error:', err)
      setError(err?.message ?? 'Failed to complete sign-in.')
    }
  }, [])

  // ── Listen for deep link URLs ──
  // 1. onOpenUrl — works on macOS, iOS, Android (emitted when app is already running).
  //    On Windows/Linux with single-instance plugin, second instances forward via this event.
  useEffect(() => {
    const unlistenPromise = onOpenUrl((urls) => {
      if (urls && urls.length > 0) {
        handleDeepLink(urls[0])
      }
    })
    return () => { unlistenPromise.then(fn => fn()) }
  }, [handleDeepLink])

  // 2. getCurrent — checks if the app was LAUNCHED by a deep link (all platforms).
  //    On Windows/Linux, the OS passes the URL as a CLI argument when spawning.
  useEffect(() => {
    getCurrent().then((urls) => {
      if (urls && urls.length > 0) {
        handleDeepLink(urls[0])
      }
    }).catch((err) => {
      // getCurrent may fail in web dev mode (no Tauri runtime)
      console.debug('getCurrent deep link check:', err)
    })
  }, [handleDeepLink])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }

    setLoading(true)
    try {
      const { supabase } = await import('../lib/supabase')
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: 'conflux://auth/callback',
        },
      })
      if (authError) {
        setError(authError.message)
      } else {
        setSent(true)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [email])

  // Listen for auth state change while on login screen — once session appears, call onAuthSuccess
  // Note: This is intentionally a one-time listener that's only set up when LoginScreen is first mounted
  // The actual auth state management is handled by useAuth in App.tsx
  useEffect(() => {
    let mounted = true
    const w = window as any
    let subscription: { unsubscribe: () => void } | null = null
    
    if (!w.__confluxAuthListener) {
      w.__confluxAuthListener = true
      import('../lib/supabase').then(({ supabase }) => {
        if (!mounted) return
        const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
          console.log('[LoginScreen] Auth state changed:', _event, 'session:', !!session)
          if (session) {
            onAuthSuccess()
          }
        })
        subscription = sub
      })
    }
    return () => {
      mounted = false
      if (subscription) subscription.unsubscribe()
      w.__confluxAuthListener = false
    }
  }, [])

  return (
    <div style={styles.container}>
      {/* Subtle radial glow behind the card */}
      <div style={{
        position: 'absolute',
        width: 500,
        height: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124, 58, 237, 0.08) 0%, transparent 70%)',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <style>{`
        .login-input:focus {
          border-color: rgba(124, 58, 237, 0.5) !important;
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15);
        }
        .login-button:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(124, 58, 237, 0.4);
        }
        .login-button:active:not(:disabled) {
          transform: translateY(0);
        }
        .login-resend:hover {
          background: rgba(255, 255, 255, 0.08) !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
        }
      `}</style>
      <div style={styles.card}>
        {/* Logo / Title */}
        <div style={styles.logoArea}>
          <div style={styles.logoEmoji}>🤖</div>
          <h1 style={styles.title}>Conflux Home</h1>
          <p style={styles.subtitle}>A home for your AI family</p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null) }}
              placeholder="you@example.com"
              style={styles.input}
              className="login-input"
              autoFocus
              disabled={loading}
            />
            {error && <p style={styles.error}>{error}</p>}
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="login-button"
              style={{
                ...styles.button,
                opacity: loading || !email.trim() ? 0.5 : 1,
              }}
            >
              {loading ? (
                <span style={styles.spinner}>⏳</span>
              ) : (
                'Send Magic Link'
              )}
            </button>
          </form>
        ) : (
          <div style={styles.checkEmail}>
            <div style={styles.checkEmoji}>✉️</div>
            <h2 style={styles.checkTitle}>Check your email</h2>
            <p style={styles.checkText}>
              We sent a magic link to <strong>{email}</strong>.<br />
              Click the link to sign in.
            </p>
            <button
              onClick={() => { setSent(false); setError(null) }}
              className="login-resend"
              style={styles.resendButton}
            >
              Use a different email
            </button>
          </div>
        )}

        <p style={styles.footer}>
          No password required — we use magic links for secure, passwordless sign-in.
        </p>
      </div>
    </div>
  )
}

// ── Styles (dark theme, matches Conflux Home aesthetic) ──

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100vw',
    background: 'linear-gradient(160deg, #0a0a1a 0%, #0d0b24 40%, #110e2a 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
    padding: 24,
    boxSizing: 'border-box' as const,
    position: 'relative',
    overflow: 'hidden',
  },
  card: {
    background: 'rgba(18, 18, 42, 0.75)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(139, 92, 246, 0.15)',
    borderRadius: 24,
    padding: '52px 44px',
    maxWidth: 440,
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 1px 0 rgba(255,255,255,0.06) inset',
    position: 'relative',
    zIndex: 1,
  },
  logoArea: {
    marginBottom: 40,
  },
  logoEmoji: {
    fontSize: 52,
    marginBottom: 16,
    display: 'block',
    filter: 'drop-shadow(0 4px 12px rgba(139, 92, 246, 0.3))',
  },
  title: {
    fontSize: 30,
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 8px',
    letterSpacing: '-0.6px',
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 15,
    color: '#8b8baa',
    margin: 0,
    fontWeight: 400,
    letterSpacing: '0.2px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    textAlign: 'left',
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#b0b0cc',
    letterSpacing: '0.4px',
    textTransform: 'uppercase' as const,
  },
  input: {
    width: '100%',
    padding: '16px 18px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(13, 13, 34, 0.8)',
    color: '#ffffff',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.25s, box-shadow 0.25s',
  },
  error: {
    color: '#ff6b6b',
    fontSize: 13,
    margin: 0,
    padding: '8px 12px',
    background: 'rgba(255, 107, 107, 0.08)',
    borderRadius: 10,
    border: '1px solid rgba(255, 107, 107, 0.15)',
  },
  button: {
    padding: '16px 24px',
    borderRadius: 14,
    border: 'none',
    background: 'linear-gradient(135deg, #7C3AED, #8b5cf6, #6366f1)',
    backgroundSize: '200% 200%',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
    transition: 'opacity 0.25s, transform 0.15s, box-shadow 0.25s',
    boxShadow: '0 4px 16px rgba(124, 58, 237, 0.3)',
    letterSpacing: '0.2px',
  },
  spinner: {
    fontSize: 16,
  },
  checkEmail: {
    textAlign: 'center',
    padding: '24px 0',
  },
  checkEmoji: {
    fontSize: 52,
    marginBottom: 16,
    display: 'block',
  },
  checkTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 12px',
    letterSpacing: '-0.3px',
  },
  checkText: {
    fontSize: 14,
    color: '#aaaacc',
    lineHeight: 1.7,
    margin: '0 0 24px',
  },
  resendButton: {
    padding: '12px 24px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255, 255, 255, 0.04)',
    color: '#9999bb',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'background 0.2s, border-color 0.2s',
  },
  footer: {
    fontSize: 12,
    color: '#555577',
    marginTop: 32,
    lineHeight: 1.6,
  },
}
