export function TermsCheckbox({ accepted, onChange }: { accepted: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '12px 0 4px', cursor: 'pointer' }}
      onClick={() => onChange(!accepted)}>
      <div style={{
        width: 20, height: 20, borderRadius: 6, border: '2px solid',
        borderColor: accepted ? '#4ade80' : 'rgba(255,255,255,0.3)',
        background: accepted ? 'rgba(74,222,128,0.2)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1, transition: 'all .2s',
      }}>
        {accepted && <span style={{ color: '#4ade80', fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✓</span>}
      </div>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
        Я принимаю{' '}
        <a href="https://ogorod-ai.ru/terms-privacy.html" target="_blank" rel="noopener noreferrer"
          style={{ color: '#4ade80', textDecoration: 'underline' }}
          onClick={e => e.stopPropagation()}>
          пользовательское соглашение и политику конфиденциальности
        </a>
      </span>
    </div>
  )
}
