export function NavButtons({ onBack, onNext, onSkip, nextLabel = 'Далее →', nextDisabled = false, showSkip = true }:
  { onBack?: () => void; onNext: () => void; onSkip?: () => void; nextLabel?: string; nextDisabled?: boolean; showSkip?: boolean }) {
  return (
    <div className="ob-nav">
      {onBack ? <button className="btn-back" onClick={onBack}>← Назад</button> : <div />}
      <div className="ob-nav-right">
        {showSkip && onSkip && <button className="btn-skip" onClick={onSkip}>Пропустить</button>}
        <button className="btn-primary" onClick={onNext} disabled={nextDisabled}>{nextLabel}</button>
      </div>
    </div>
  )
}
