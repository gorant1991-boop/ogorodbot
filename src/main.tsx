import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

try {
  const bridge = await import('@vkontakte/vk-bridge')
  bridge.default.send('VKWebAppInit')
} catch(e) {
  console.log('bridge error', e)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
