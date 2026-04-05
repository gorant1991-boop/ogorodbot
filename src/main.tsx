import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import bridge from '@vkontakte/vk-bridge'
import './index.css'
import App from './App.tsx'
import { detectEmbeddedBrowser } from './utils/browser'
import { initWebAnalytics } from './utils/webAnalytics'

declare global {
  interface Window {
    __ogorodbotMounted?: () => void
  }
}

async function initVkBridge() {
  try {
    await bridge.send('VKWebAppInit')
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error('bridge init error', e)
    }
  }
}

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    const textEl = document.getElementById('startup-status-text')
    const statusEl = document.getElementById('startup-status')
    if (textEl && statusEl) {
      statusEl.style.display = 'flex'
      textEl.textContent = 'Ошибка запуска: ' + error.message
    }
  }

  render() {
    if (this.state.error) return null
    return this.props.children
  }
}

void initVkBridge()
initWebAnalytics()

if ('serviceWorker' in navigator && !detectEmbeddedBrowser()) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(error => {
      if (import.meta.env.DEV) {
        console.error('service worker register error', error)
      }
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
