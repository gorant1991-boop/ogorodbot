import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import bridge from '@vkontakte/vk-bridge'
import './index.css'
import App from './App.tsx'

declare global {
  interface Window {
    __ogorodbotMounted?: () => void
  }
}

async function initVkBridge() {
  try {
    await bridge.send('VKWebAppInit')
  } catch (e) {
    console.log('bridge error', e)
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
