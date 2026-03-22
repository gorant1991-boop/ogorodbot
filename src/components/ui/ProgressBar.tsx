export function ProgressBar({ step, total }: { step: number; total: number }) {
  return <div className="ob-progress"><div className="ob-progress-fill" style={{ width: `${(step / total) * 100}%` }} /></div>
}
