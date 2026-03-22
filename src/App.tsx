import { useEffect, useRef, useState } from 'react'
import './App.css'
import { loadLastNotification, loadSubscriptionNotif, loadUserData, saveUserData } from './supabase'
import { CROPS, empty, getEffectivePlan } from './utils/constants'
import {
  DiaryScreen as AppDiaryScreen,
  MoonScreen as AppMoonScreen,
  Onboarding as AppOnboarding,
  PlantsScreen as AppPlantsScreen,
  ProfileScreen as AppProfileScreen,
} from './components/screens'
import { LunarBadge as AppLunarBadge } from './components/ui'
import type { CropEntry, OnboardingData, Plan, Screen, Tab } from './utils/types'

interface NotificationPreview {
  title: string
  body: string
  type?: string
}

interface BridgeUserInfo {
  id?: number
}

interface VkBridgeLike {
  send(method: 'VKWebAppGetUserInfo'): Promise<BridgeUserInfo>
}

export default function App() {
  useEffect(() => {
    window.__ogorodbotMounted?.()
  }, [])

  const [screen, setScreen] = useState<Screen>('onboarding')
  const [tab, setTab] = useState<Tab>('main')
  const [chatReturnTab, setChatReturnTab] = useState<Tab>('main')
  const [plan, setPlan] = useState<Plan>('free')
  const [gardenData, setGardenData] = useState<OnboardingData>(empty)
  const [vkUserId, setVkUserId] = useState<number>(1)

  useEffect(() => {
    try {
      const bridgeWindow = window as Window & { vkBridge?: VkBridgeLike; VKBridge?: VkBridgeLike }
      const vkBridge = bridgeWindow.vkBridge ?? bridgeWindow.VKBridge
      if (vkBridge) {
        vkBridge.send('VKWebAppGetUserInfo').then(u => {
          if (u?.id) setVkUserId(u.id)
        }).catch(() => {
          // ignore bridge errors
        })
      }
    } catch {
      // ignore bridge errors
    }
  }, [])

  const [messages, setMessages] = useState<{ role: string; text: string }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [dbLoading, setDbLoading] = useState(true)
  const [lastNotif, setLastNotif] = useState<NotificationPreview | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadUserData(vkUserId).then(row => {
      if (row) {
        const onboarding = { ...empty, ...(row.onboarding as Partial<OnboardingData>) }
        setGardenData(onboarding)
        setPlan(getEffectivePlan(row.plan as Plan, onboarding.subscription))
        setScreen('main')
      }
      setDbLoading(false)
    })
  }, [vkUserId])

  useEffect(() => {
    if (screen === 'main') {
      Promise.all([
        loadLastNotification(vkUserId),
        loadSubscriptionNotif(vkUserId),
      ]).then(([daily, sub]) => {
        if (sub) setLastNotif(sub)
        else if (daily) setLastNotif(daily)
      })
    }
  }, [screen, vkUserId])

  useEffect(() => {
    if (screen !== 'main') return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveUserData(vkUserId, gardenData, plan)
    }, 1000)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [gardenData, plan, screen, vkUserId])

  if (dbLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🌱</div>
        <div style={{ color: '#666', fontSize: 14 }}>Загрузка огорода...</div>
      </div>
    )
  }

  const updateEntry = (id: string, patch: Partial<CropEntry>) =>
    setGardenData(prev => ({ ...prev, cropEntries: prev.cropEntries.map(e => e.id === id ? { ...e, ...patch } : e) }))
  const addEntry = (entry: CropEntry) =>
    setGardenData(prev => ({ ...prev, cropEntries: [...prev.cropEntries, entry] }))
  const deleteEntry = (id: string) =>
    setGardenData(prev => ({ ...prev, cropEntries: prev.cropEntries.filter(e => e.id !== id) }))
  const updateData = (patch: Partial<OnboardingData>) =>
    setGardenData(prev => ({ ...prev, ...patch }))

  function handleOnboardingDone(d: OnboardingData) {
    setGardenData(d)
    saveUserData(vkUserId, d, plan)
    const cropNames = d.cropEntries.slice(0, 3).map(e => CROPS.find(c => c.id === e.id)?.name).filter(Boolean).join(', ')
    const greeting = `Привет! 🌱 Я знаю ваш огород в ${d.city}.

Вот что я умею:
• 🌤️ Каждое утро в ${d.notifMorning} — совет с учётом погоды
• 🌿 Слежу за ростом ваших культур${cropNames ? ` (${cropNames}${d.cropEntries.length > 3 ? ' и др.' : ''})` : ''}
• ⚠️ Предупреждаю о заморозках, болезнях и вредителях
• 💧 Напоминаю о поливе, подкормке и других операциях

Просто спрашивайте — отвечу с учётом вашей почвы, климата и сортов. Удачного сезона! 🥕`
    setMessages([{ role: 'bot', text: greeting }])
    setScreen('main')
  }

  async function askAgronomist(question: string) {
    setMessages(m => [...m, { role: 'user', text: question }])
    setLoading(true)
    try {
      const res = await fetch('https://garden-agent.gorant1991.workers.dev/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vk_user_id: vkUserId, question }),
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'bot', text: data.answer }])
    } catch {
      setMessages(m => [...m, { role: 'bot', text: 'Ошибка соединения. Попробуйте ещё раз.' }])
    }
    setLoading(false)
  }

  async function sendMessage() {
    if (!input.trim()) return
    const question = input
    setInput('')
    await askAgronomist(question)
  }

  function openChat(targetTab: Tab = tab) {
    setChatReturnTab(targetTab)
    setScreen('chat')
  }

  function requestCropAdvice(question: string, sourceTab: Tab = 'plants') {
    setChatReturnTab(sourceTab)
    setScreen('chat')
    void askAgronomist(question)
  }

  if (screen === 'onboarding') return <AppOnboarding onDone={handleOnboardingDone} />

  if (screen === 'chat') {
    return (
      <div className="screen chat">
        <div className="chat-header">
          <button className="back-btn" onClick={() => { setTab(chatReturnTab); setScreen('main') }}>←</button>
          <div><div className="chat-title">🤖 AI Агроном</div><div className="chat-sub">Знает ваш огород</div></div>
        </div>
        <div className="chat-messages">
          {messages.map((m, i) => <div key={i} className={`msg msg-${m.role}`}>{m.text}</div>)}
          {loading && <div className="msg msg-bot loading">Думаю...</div>}
        </div>
        <div className="chat-input">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void sendMessage()}
            placeholder="Задать вопрос..."
          />
          <button onClick={() => void sendMessage()}>➤</button>
        </div>
      </div>
    )
  }

  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'main', icon: '🏠', label: 'Главная' },
    { id: 'plants', icon: '🌱', label: 'Растения' },
    { id: 'diary', icon: '📖', label: 'Дневник' },
    { id: 'moon', icon: '🌙', label: 'Луна' },
    { id: 'profile', icon: '👤', label: 'Профиль' },
  ]

  return (
    <div className="screen main">
      <div className="main-header">
        <div>
          <div className="greeting">{(() => {
            const h = new Date().getHours()
            return h >= 5 && h < 12 ? 'Доброе утро' : h >= 12 && h < 17 ? 'Добрый день' : h >= 17 && h < 22 ? 'Добрый вечер' : 'Доброй ночи'
          })()}</div>
          <div className="date">{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <AppLunarBadge />
      </div>
      <div className="tab-scroll">
        {tab === 'main' && (
          <div className="tab-content">
            {lastNotif ? (
              <div className="advice-card advice-greeting" onClick={() => openChat('main')}>
                <div className="card-label">🤖 Агроном · Совет дня</div>
                <div className="card-title">{lastNotif.title}</div>
                <div className="card-body">{lastNotif.body}</div>
              </div>
            ) : messages.length > 0 ? (
              <div className="advice-card advice-greeting" onClick={() => openChat('main')}>
                <div className="card-label">🤖 Агроном</div>
                <div className="card-body" style={{ whiteSpace: 'pre-line' }}>{messages[0].text}</div>
              </div>
            ) : (
              <div className="advice-card advice-placeholder">
                <div className="card-label">🌅 Первый совет</div>
                <div className="card-title">Агроном готовится...</div>
                <div className="card-body">
                  Первый персональный совет придёт в {gardenData.notifMorning || '06:00'} 🌅<br />
                  Агроном изучает ваш огород и погоду в регионе.
                </div>
              </div>
            )}
            {lastNotif?.type === 'subscription' && (
              <div className="sub-alert-card">
                <div className="sub-alert-title">{lastNotif.title}</div>
                <div className="sub-alert-body">{lastNotif.body}</div>
              </div>
            )}
            <button className="btn-chat" onClick={() => openChat('main')}>🤖 Спросить агронома</button>
          </div>
        )}
        {tab === 'plants' && <AppPlantsScreen data={gardenData} plan={plan} onUpdateEntry={updateEntry} onAddEntry={addEntry} onDeleteEntry={deleteEntry} vkUserId={vkUserId} onAskAi={requestCropAdvice} />}
        {tab === 'diary' && <AppDiaryScreen vkUserId={vkUserId} cropEntries={gardenData.cropEntries} />}
        {tab === 'moon' && <AppMoonScreen plan={plan} city={gardenData.city} vkUserId={vkUserId} cropEntries={gardenData.cropEntries} />}
        {tab === 'profile' && <AppProfileScreen data={gardenData} plan={plan} onChangePlan={setPlan} onUpdateData={updateData} vkUserId={vkUserId} />}
      </div>
      <div className="navbar">
        {TABS.map(n => (
          <button key={n.id} className={`nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
            <span className="nav-icon">{n.icon}</span>
            <span className="nav-label">{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
