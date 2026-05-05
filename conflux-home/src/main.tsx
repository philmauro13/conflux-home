import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles-desktop.css'
import './styles-home.css'
import './styles-family.css'
import './styles-story.css'
import './styles-voice.css'
import './styles-kitchen.css'
import './styles/kitchen-hearth.css'
import './styles-budget.css'
import './styles/budget-pulse.css'
import './styles-feed.css'
import './styles/feed-radar.css'
import './styles/radar-boot.css'
import './styles-life.css'
import './styles-orbit.css'
import './styles/animations.css'
import './styles/horizon-hopes.css'
import './styles/horizon-stellar.css'
import './styles-current.css'
import './styles-games.css'
import './styles-snake.css'
import './styles-pacman.css';
import './styles-solitaire.css';
import './styles-nani-solitaire.css';
import './styles-johnny-solitaire.css';
import './styles-control-room.css';
import './styles-neural-mesh.css';
import './styles/foundation.css'
import './styles/orbit-mission-control.css'
import './styles/orbit-boot.css'

// Error boundary with MAXIMUM detail
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; info: string }
> {
  constructor(props: any) {
    super(props)
    this.state = { error: null, info: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { error, info: error.stack || error.message }
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const info = [
      'ERROR: ' + error.message,
      '',
      'STACK: ' + error.stack,
      '',
      'COMPONENT STACK:' + errorInfo.componentStack,
    ].join('\n')
    this.setState({ info })
    // Also log to console for any debug output
    console.error('CONFLUX CRASH:', error)
    console.error('COMPONENT STACK:', errorInfo.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#0d0d1a', color: '#ff6b6b', padding: '2rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', minHeight: '100vh', fontSize: '13px', lineHeight: 1.6 }}>
          <h1 style={{ color: '#ffd93d', fontSize: '20px' }}>⚠️ CRASH DETECTED</h1>
          <pre style={{ color: '#ff8888' }}>{this.state.error.message}</pre>
          <pre style={{ color: '#aaa', fontSize: '11px' }}>{this.state.info}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

// Global error catch for non-React errors
window.addEventListener('error', (e) => {
  console.error('WINDOW ERROR:', e.error || e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('UNHANDLED REJECTION:', e.reason)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
