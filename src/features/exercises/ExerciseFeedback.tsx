import type { ReactNode } from 'react'
import { CircleAlert, CircleHelp } from 'lucide-react'
import type { Exercise } from '@/content'
import { Markdown } from '@/components/Markdown'
import { cx } from '@/components/cx'
import { exerciseExpected } from './describe'
import { feedbackTone } from './feedbackText'
import type { AnswerRecord } from './types'

const TYPED = new Set(['fill-gap', 'transform', 'translate-ru-pt', 'listen-type', 'order-words'])

/** Animated check mark (stroke draws in; static under reduced motion). */
function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <circle cx="12" cy="12" r="11" className="fill-success" />
      <path
        d="M7 12.5l3.2 3.2L17 9"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="draw-check stroke-surface"
        style={{ ['--dash' as string]: 16 }}
      />
    </svg>
  )
}
function CrossGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <circle cx="12" cy="12" r="11" className="fill-danger-fill" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function Row({ label, children, tone }: { label: string; children: ReactNode; tone?: 'wrong' | 'right' }) {
  return (
    <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[8.5rem_1fr]">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd
        lang="pt-PT"
        className={cx(
          'min-w-0 break-words',
          tone === 'wrong' && 'text-danger line-through decoration-danger/50 decoration-2',
          tone === 'right' && 'font-semibold text-ink',
        )}
      >
        {children}
      </dd>
    </div>
  )
}

/**
 * Result of one answer: tone (correct / accents / wrong / skipped), icon, «Ваш ответ / Верно / Также принимается»,
 * explanation. Distinguishable without colour (icon + heading); enters with a short motion.
 */
export function ExerciseFeedback({ ex, rec, lenient }: { ex: Exercise; rec: AnswerRecord; lenient: boolean }) {
  const tone = feedbackTone(rec)
  const accepted = exerciseExpected(ex)
  const others = accepted.filter((a) => a !== rec.expected)
  const isShadow = ex.type === 'speak-shadow'
  const isTyped = TYPED.has(ex.type)

  const head = isShadow
    ? rec.ok
      ? 'Отлично!'
      : 'Потренируйтесь ещё'
    : tone === 'correct'
      ? 'Верно!'
      : tone === 'accents'
        ? lenient
          ? 'Верно, но проверьте акценты'
          : 'Почти: ошибка только в акцентах'
        : tone === 'skipped'
          ? 'Ничего страшного — вот ответ'
          : 'Неверно'

  const box = {
    correct: 'border-success-line bg-success-soft',
    accents: 'border-warning-line bg-warning-soft',
    wrong: 'border-danger-line bg-danger-soft',
    skipped: 'border-line-strong bg-surface-2',
  }[isShadow ? (rec.ok ? 'correct' : 'skipped') : tone]

  const icon =
    isShadow || tone === 'correct' ? (
      rec.ok ? <CheckGlyph /> : <CircleHelp aria-hidden className="size-6 text-ink-muted" />
    ) : tone === 'accents' ? (
      <CircleAlert aria-hidden className="size-6 text-warning" />
    ) : tone === 'skipped' ? (
      <CircleHelp aria-hidden className="size-6 text-ink-muted" />
    ) : (
      <CrossGlyph />
    )

  return (
    <div className={cx('animate-enter space-y-3 rounded-card border p-4', box)}>
      <p className="flex items-center gap-3 font-display text-h2 leading-none">
        {icon}
        {head}
      </p>
      {!isShadow && ex.type !== 'match' && (tone !== 'correct' || others.length > 0) && (
        <dl className="space-y-1.5">
          {isTyped && tone === 'wrong' && <Row label="Ваш ответ" tone="wrong">{rec.given || '—'}</Row>}
          {isTyped && tone === 'accents' && <Row label="Ваш ответ">{rec.given}</Row>}
          {tone !== 'correct' && <Row label="Верно" tone="right">{rec.expected}</Row>}
          {isTyped && others.length > 0 && <Row label="Также принимается">{others.join(' · ')}</Row>}
        </dl>
      )}
      {ex.type === 'match' && (
        <div className="space-y-1.5">
          {rec.verdict === 'wrong' && rec.given && (
            <p className="text-sm text-ink-muted">
              {rec.given.replace(/^ошибки: /, 'Ошибочные пары: ')}
            </p>
          )}
          <ul className="grid gap-1 sm:grid-cols-2" lang="pt-PT">
            {ex.pairs.map((p, i) => (
              <li key={i} className="rounded-pill bg-surface/70 px-3 py-1.5 text-sm">
                <b className="font-semibold">{p.left}</b> <span className="text-ink-muted">—</span> {p.right}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ex.explanation && <Markdown className="text-sm text-ink-muted">{ex.explanation}</Markdown>}
    </div>
  )
}
