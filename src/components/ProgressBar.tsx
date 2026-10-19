/** Thin horizontal progress bar; `value` in 0..1. */
export function ProgressBar({ value, label, className = '' }: { value: number; label?: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={`h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800 ${className}`}
    >
      <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  )
}
