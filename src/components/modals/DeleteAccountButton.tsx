import { useState } from 'react'

export function DeleteAccountButton({ vkUserId }: { vkUserId: number }) {
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (deleting) return (
    <div style={{ textAlign: 'center', padding: '16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
      Удаление данных...
    </div>
  )

  if (confirm) return (
    <div style={{ margin: '8px 16px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#fca5a5', marginBottom: 6 }}>Удалить аккаунт?</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
        Все ваши данные (огород, дневник, история сезонов) будут удалены безвозвратно.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={async () => {
          setDeleting(true)
          try {
            await fetch('https://garden-agent.gorant1991.workers.dev/delete-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vk_user_id: vkUserId }),
            })
          } catch {
            // ignore delete errors before reload
          }
          window.location.reload()
        }} style={{ flex: 1, background: 'rgba(239,68,68,0.7)', border: 'none', borderRadius: 10, padding: '10px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
          Да, удалить всё
        </button>
        <button onClick={() => setConfirm(false)}
          style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
          Отмена
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '0 16px 24px', textAlign: 'center' }}>
      <button onClick={() => setConfirm(true)}
        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Nunito, sans-serif' }}>
        Удалить аккаунт
      </button>
    </div>
  )
}
