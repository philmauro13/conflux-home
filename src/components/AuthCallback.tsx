import { useEffect, useState } from 'react'

/**
 * AuthCallback — handles Supabase magic link / OAuth redirects.
 * Supabase redirects to /auth/callback#access_token=...&refresh_token=...
 * We extract the tokens from the URL hash and set the session.
 */
export default function AuthCallback({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<'processing' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase puts tokens in the URL hash fragment
        // Format: #access_token=xxx&refresh_token=yyy&expires_in=3600&token_type=bearer
        const hash = window.location.hash
        if (!hash) {
          setErrorMsg('No authentication tokens found in URL.')
          setStatus('error')
          return
        }

        const params = new URLSearchParams(hash.slice(1)) // strip leading #
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')

        if (!access_token || !refresh_token) {
          setErrorMsg('Missing access_token or refresh_token in callback.')
          setStatus('error')
          return
        }

        const { supabase } = await import('../lib/supabase')
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        })

        if (error) {
          console.error('[AuthCallback] Session error:', error.message)
          setErrorMsg(error.message)
          setStatus('error')
          return
        }

        // Clean the URL (remove hash) and redirect to app root
        window.history.replaceState(null, '', window.location.pathname)
        onComplete()
      } catch (err: any) {
        console.error('[AuthCallback] Error:', err)
        setErrorMsg(err?.message ?? 'Authentication failed.')
        setStatus('error')
      }
    }

    handleCallback()
  }, [onComplete])

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {status === 'processing' ? (
          <>
            <div style={styles.emoji}>🔐</div>
            <h2 style={styles.title}>Signing you in...</h2>
            <p style={styles.text}>Completing authentication, please wait.</p>
            <div style={styles.spinner} />
          </>
        ) : (
          <>
            <div style={styles.emoji}>❌</div>
            <h2 style={styles.title}>Authentication Failed</h2>
            <p style={styles.text}>{errorMsg}</p>
            <button
              onClick={() => {
                window.history.replaceState(null, '', window.location.pathname)
                onComplete()
              }}
              style={styles.button}
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100vw',
    background: 'linear-gradient(160deg, #0a0a1a 0%, #0d0b24 40%, #110e2a 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: 'rgba(18, 18, 42, 0.75)',
    backdropFilter: 'blur(24px)',
    border: '1px solid rgba(139, 92, 246, 0.15)',
    borderRadius: 24,
    padding: '52px 44px',
    maxWidth: 440,
    width: '100%',
    textAlign: 'center',
  },
  emoji: {
    fontSize: 52,
    marginBottom: 16,
    display: 'block',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 12px',
  },
  text: {
    fontSize: 14,
    color: '#aaaacc',
    lineHeight: 1.7,
    margin: '0 0 24px',
  },
  button: {
    padding: '12px 24px',
    borderRadius: 12,
    border: '1px solid rgba(139, 92, 246, 0.3)',
    background: 'rgba(139, 92, 246, 0.1)',
    color: '#ffffff',
    fontSize: 14,
    cursor: 'pointer',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid rgba(139, 92, 246, 0.2)',
    borderTopColor: '#8b5cf6',
    borderRadius: '50%',
    margin: '0 auto',
    animation: 'spin 1s linear infinite',
  },
}
