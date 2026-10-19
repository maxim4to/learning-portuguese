import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BookCheck, Check, ListTree, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { cx } from '@/components/cx'
import { Skeleton } from '@/components/EmptyState'
import { SpeakButton } from '@/components/SpeakButton'
import { LevelBadge } from '@/components/StatusBadge'
import { useToast } from '@/components/toastContext'
import type { WordEntry, WordSource } from '@/data'
import type { LexEntry } from '@/engine/lexicon/lookup'
import { normalizeForm, splitContraction } from '@/engine/lexicon/normalize'
import { GenderBadge } from '@/features/library/ui'
import { useCanSpeak } from '../audio.ts'
import { POS_LABEL, useLexicon } from '../lexicon.ts'
import { wordHref } from '../source.ts'
import { useWordActions, useWordIndex, useWordStatus, type WordActionResult } from '../useWords.ts'
import { WordStatusBadge } from '../WordList.tsx'
import { DictionaryLinks } from '../WordSearchDialog.tsx'
import { normalizeLemma, wordIdFor, wordPt, type NewWordInput } from '../wordOps.ts'
import type { CaptureTarget } from './hitTest.ts'
import { lookupOptions, type LookupOption } from './options.ts'
import { wordsOf } from './text.ts'

const TAG_LABEL: Record<string, string> = { PL: 'мн. ч.', F: 'ж. р.', FPL: 'ж. р., мн. ч.' }

/** «do = de + o», «levanto-me = levanto + me», «мн. ч. от o pão». */
function formNote(form: string, o: LookupOption | undefined): string | undefined {
  const n = normalizeForm(form)
  const c = o?.cand
  if (o?.mwe) return `выражение со словом «${form}»`
  const contraction = c?.contraction ?? (!c ? splitContraction(n) : null)
  if (contraction) return `стяжение: ${n} = ${contraction.prep} + ${contraction.rest}`
  if (c?.clitics?.length) {
    const host = n.split('-')[0]
    return `${n} = ${host} + ${c.clitics.join(' + ')}${c.mesoclitic ? ' (мезоклиза)' : ''}`
  }
  if (c?.article) return `с артиклем «${c.article}»`
  if (c && TAG_LABEL[c.tag]) return `${TAG_LABEL[c.tag]} от «${wordPt({ lemma: c.entry.lemma, pos: c.entry.pos, gender: c.entry.gender })}»`
  return undefined
}

const cleanSentence = (s?: string) => s?.replace(/^…|…$/g, '').trim() || undefined

function sourceOf(t: CaptureTarget): NonNullable<NewWordInput['source']> {
  return { src: t.src ?? 'manual', form: t.form, sentence: cleanSentence(t.sentence), sentenceRu: t.sentenceRu }
}

function inputFor(entry: LexEntry, t: CaptureTarget, ru: string[] = entry.ru): NewWordInput {
  return { lexId: entry.id, lemma: entry.lemma, ru, pos: entry.pos, gender: entry.gender, level: entry.level, source: sourceOf(t) }
}

const hasExample = (w: WordEntry, s: Omit<WordSource, 'at'>) => w.sources.some((x) => x.src === s.src && x.form === s.form)

/**
 * Content of the lookup card (popover on desktop, sheet on phones): form → lemma, part of speech, gender,
 * meanings, contraction / clitic breakdown, the sentence with the word, audio, saved state, actions
 * («В словарь» / «Знаю» / «Открыть в словаре»), the «not in the app dictionary» form, «Все слова фразы».
 */
export function LookupCard({
  target,
  titleId,
  initialWords = false,
  onClose,
  onPickWord,
}: {
  target: CaptureTarget
  titleId: string
  /** Open with «Все слова фразы» expanded (keyboard open on a whole line). */
  initialWords?: boolean
  onClose(): void
  /** A word of the sentence was picked from «Все слова фразы» (offsets in `target.block` text). */
  onPickWord(start: number, end: number): void
}) {
  const { lex, status } = useLexicon()
  const options = useMemo(() => (lex ? lookupOptions(lex, target) : []), [lex, target])
  const [picked, setPicked] = useState(0)
  const [showWords, setShowWords] = useState(initialWords)
  const option = options[Math.min(picked, options.length - 1)] as LookupOption | undefined
  const listId = useId()

  return (
    <div data-lookup-ui="" className="space-y-4">
      {status === 'loading' ? (
        <div role="status" aria-label="Загружаю словарь" className="space-y-3">
          <div className="flex items-start gap-3">
            <h2 id={titleId} className="min-w-0 flex-1 break-words" lang="pt-PT">
              {target.form}
            </h2>
            <CloseButton onClose={onClose} />
          </div>
          <Skeleton className="h-5 w-40 rounded-pill" />
          <Skeleton className="h-5 w-56 rounded-pill" />
          <Skeleton className="h-11 w-full rounded-pill" />
        </div>
      ) : option ? (
        <Known
          key={option.entry.id}
          target={target}
          option={option}
          titleId={titleId}
          onClose={onClose}
          others={options.length > 1 ? options : []}
          picked={options.indexOf(option)}
          onPick={setPicked}
        />
      ) : (
        <Unknown key={target.form} target={target} titleId={titleId} onClose={onClose} />
      )}

      {target.sentence && status !== 'loading' && (
        <div className="border-t border-line pt-3">
          <button
            type="button"
            className="btn-ghost btn-sm -ml-3"
            aria-expanded={showWords}
            aria-controls={listId}
            onClick={() => setShowWords((v) => !v)}
          >
            <ListTree aria-hidden className="size-4" /> Все слова фразы
          </button>
          {showWords && (
            <ul id={listId} aria-label="Слова фразы" className="mt-2 flex flex-wrap gap-1.5" lang="pt-PT">
              {wordsOf(target.sentence).map((w, i) => {
                const current = target.wordStart !== undefined && w.start === target.wordStart && !target.multi
                return (
                  <li key={`${w.start}-${i}`}>
                    <button
                      type="button"
                      aria-current={current ? 'true' : undefined}
                      className={cx(
                        'btn btn-sm border-[1.5px]',
                        current ? 'border-ink bg-ink text-bg' : 'border-line-strong bg-surface text-ink hover:border-ink',
                      )}
                      onClick={() => {
                        const off = target.sentenceOffset ?? 0
                        onPickWord(off + w.start, off + w.end)
                      }}
                    >
                      {w.text}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function CloseButton({ onClose }: { onClose(): void }) {
  return (
    <button type="button" className="btn-ghost btn-sm btn-icon -mt-1 -mr-2 shrink-0" aria-label="Закрыть" onClick={onClose}>
      <X aria-hidden />
    </button>
  )
}

/** The sentence with the word in bold, its translation and a play button. */
function Context({ target }: { target: CaptureTarget }) {
  const s = target.sentence
  const canSpeak = useCanSpeak(cleanSentence(s))
  if (!s) return null
  const marked = target.wordStart !== undefined && target.wordEnd !== undefined
  return (
    <div className="flex items-start gap-2 rounded-control bg-surface-2 py-2.5 pr-2 pl-3.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm text-ink" lang="pt-PT">
          {marked ? (
            <>
              {s.slice(0, target.wordStart)}
              <b className="font-bold">{s.slice(target.wordStart, target.wordEnd)}</b>
              {s.slice(target.wordEnd)}
            </>
          ) : (
            s
          )}
        </p>
        {target.sentenceRu && <p className="text-sm text-ink-muted">{target.sentenceRu}</p>}
      </div>
      {canSpeak && <SpeakButton text={cleanSentence(s)!} size="sm" ariaLabel="Прослушать фразу" />}
    </div>
  )
}

function Title({
  id,
  form,
  lemma,
  display = lemma,
  onClose,
  speak,
}: {
  id: string
  form: string
  lemma: string
  /** Lemma as shown (with the article for nouns). */
  display?: string
  onClose(): void
  speak?: ReactNode
}) {
  const same = normalizeForm(form) === normalizeForm(lemma)
  return (
    <div className="flex items-start gap-2">
      {speak}
      <h2 id={id} className="min-w-0 flex-1 pt-1.5 break-words" lang="pt-PT">
        {!same && (
          <>
            <span className="text-ink-muted">{form}</span>
            <span aria-hidden className="text-ink-subtle">
              {' → '}
            </span>
            <span className="sr-only"> — </span>
          </>
        )}
        {display}
      </h2>
      <CloseButton onClose={onClose} />
    </div>
  )
}

/** Undo kept in the card too: a toast under a modal sheet can't be reached. */
function useSaved() {
  const toast = useToast()
  const [last, setLast] = useState<WordActionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function run(p: () => Promise<WordActionResult>, text: (w: WordEntry | undefined) => string) {
    setBusy(true)
    setError(null)
    try {
      const r = await p()
      setLast(r)
      toast({ text: text(r.words[0]), tone: 'success', action: { label: 'Отменить', onClick: () => void r.undo() } })
    } catch (e) {
      setError(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }
  async function undo() {
    const r = last
    setLast(null)
    await r?.undo()
  }
  return { run, undo, last, busy, error }
}

function Known({
  target,
  option,
  titleId,
  onClose,
  others,
  picked,
  onPick,
}: {
  target: CaptureTarget
  option: LookupOption
  titleId: string
  onClose(): void
  others: LookupOption[]
  picked: number
  onPick(i: number): void
}) {
  const { entry, cand } = option
  const index = useWordIndex()
  const saved = index.byLexId.get(entry.id)
  const status = useWordStatus(saved?.id)
  const { saveWord, addSource } = useWordActions()
  const s = useSaved()
  const pt = wordPt({ lemma: entry.lemma, pos: entry.pos, gender: entry.gender })
  const canSpeak = useCanSpeak(pt)
  const note = formNote(target.form, option)
  const source = sourceOf(target)
  // Which meanings go into the dictionary (chips, all on by default; only when there is a choice).
  const [keep, setKeep] = useState<boolean[]>(() => entry.ru.map(() => true))
  const choose = !saved && entry.ru.length > 1
  const kept = entry.ru.filter((_, i) => keep[i])
  const noneKept = choose && kept.length === 0
  const meaningsId = useId()

  return (
    <div className="space-y-3">
      <Title id={titleId} form={option.mwe ? entry.lemma : target.form} lemma={entry.lemma} display={pt} onClose={onClose} speak={canSpeak ? <SpeakButton text={pt} size="sm" /> : undefined} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-pill bg-surface-2 px-2 py-px text-xs font-semibold text-ink-muted">{POS_LABEL[entry.pos]}</span>
        {entry.pos === 'noun' && <GenderBadge gender={entry.gender} />}
        {entry.level && <LevelBadge level={entry.level} />}
        {cand?.approximate && (
          <span className="inline-flex items-center rounded-pill bg-warning-soft px-2 py-px text-xs font-semibold text-ink">возможно</span>
        )}
      </div>
      {note && <p className="text-sm text-ink-muted">{note}</p>}
      {choose ? (
        <div className="space-y-1.5">
          <p id={meaningsId} className="text-sm font-semibold text-ink-muted">
            Значения в словарь:
          </p>
          <ul aria-labelledby={meaningsId} className="flex flex-wrap gap-1.5">
            {entry.ru.map((m, i) => (
              <li key={i}>
                <button
                  type="button"
                  aria-pressed={keep[i]}
                  onClick={() => setKeep((k) => k.map((v, j) => (j === i ? !v : v)))}
                  className={cx(
                    'btn btn-sm border-[1.5px] text-left',
                    keep[i] ? 'border-ink bg-ink text-bg' : 'border-line-strong bg-surface text-ink-muted hover:border-ink',
                  )}
                >
                  {keep[i] && <Check aria-hidden className="size-4" />}
                  {m}
                </button>
              </li>
            ))}
          </ul>
          {noneKept && <p className="text-sm text-ink-muted">Выберите хотя бы одно значение.</p>}
        </div>
      ) : (
        <p className="text-base">
          {entry.ru.length > 1 ? (
            entry.ru.map((m, i) => (
              <span key={i}>
                {i > 0 && <span className="text-ink-subtle">; </span>}
                {m}
              </span>
            ))
          ) : (
            entry.ru[0]
          )}
        </p>
      )}
      <Context target={target} />

      {others.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink-muted">{option.mwe || others[0]?.mwe ? 'Выражение или слово:' : 'Другие разборы:'}</p>
          <ul className="flex flex-wrap gap-1.5">
            {others.map((o, i) => (
              <li key={o.entry.id}>
                <button
                  type="button"
                  aria-pressed={i === picked}
                  onClick={() => onPick(i)}
                  className={cx(
                    'btn btn-sm border-[1.5px]',
                    i === picked ? 'border-ink bg-ink text-bg' : 'border-line-strong bg-surface text-ink hover:border-ink',
                  )}
                >
                  <span lang="pt-PT">{o.entry.lemma}</span>
                  <span className={cx('text-xs', i === picked ? 'opacity-80' : 'text-ink-muted')}>
                    {o.mwe ? 'выражение' : POS_LABEL[o.entry.pos]}
                    {o.cand?.approximate ? ', возможно' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {saved && status ? (
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <WordStatusBadge status={status} />
            <span className="text-ink-muted">в вашем словаре</span>
            {s.last && (
              <button type="button" className="btn-ghost btn-sm -ml-2 text-ink" onClick={() => void s.undo()}>
                <RotateCcw aria-hidden className="size-4" /> Отменить
              </button>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to={wordHref(saved.id)} className="btn-secondary btn-sm" onClick={onClose}>
              Открыть в словаре
            </Link>
            {target.src && !hasExample(saved, source) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={s.busy}
                onClick={() => void s.run(() => addSource(saved.id, { ...source, at: Date.now() }), () => 'Пример сохранён')}
              >
                Сохранить этот пример
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Plus />}
            disabled={s.busy || noneKept}
            onClick={() => void s.run(() => saveWord(inputFor(entry, target, kept)), (w) => `Добавлено в словарь: ${w ? wordPt(w) : pt}`)}
          >
            В словарь
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<BookCheck />}
            disabled={s.busy || noneKept}
            onClick={() => void s.run(() => saveWord({ ...inputFor(entry, target, kept), mark: 'known' }), (w) => `Отмечено «Знаю»: ${w ? wordPt(w) : pt}`)}
          >
            Знаю
          </Button>
        </div>
      )}
      {s.error && (
        <p role="alert" className="text-sm text-danger">
          {s.error}
        </p>
      )}
    </div>
  )
}

/** Not in the app lexicon: «В словарь» opens a short form (lemma from the form, translation typed by the learner). */
function Unknown({ target, titleId, onClose }: { target: CaptureTarget; titleId: string; onClose(): void }) {
  const index = useWordIndex()
  const { saveWord } = useWordActions()
  const s = useSaved()
  const [form, setForm] = useState(false)
  const [lemma, setLemma] = useState(() => normalizeForm(target.form))
  const [ru, setRu] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const id = useId()
  const existing = index.byId.get(wordIdFor({ lemma: lemma || target.form }))
  const status = useWordStatus(existing?.id)
  const note = formNote(target.form, undefined)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!lemma.trim()) return setErr('Введите слово на португальском')
    if (!ru.trim()) return setErr('Введите перевод')
    setErr(null)
    await s.run(
      () => saveWord({ lemma: normalizeLemma(lemma), ru: ru.trim(), source: sourceOf(target) }),
      (w) => `Добавлено в словарь: ${w ? wordPt(w) : lemma}`,
    )
    setForm(false)
  }

  return (
    <div className="space-y-3">
      <Title id={titleId} form={target.form} lemma={target.form} onClose={onClose} />
      <p className="text-sm text-ink-muted">Нет в словаре приложения{note ? ` · ${note}` : ''}</p>
      <Context target={target} />
      {existing && status ? (
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <WordStatusBadge status={status} />
            <span className="text-ink-muted">в вашем словаре: {existing.ru}</span>
            {s.last && (
              <button type="button" className="btn-ghost btn-sm -ml-2 text-ink" onClick={() => void s.undo()}>
                <RotateCcw aria-hidden className="size-4" /> Отменить
              </button>
            )}
          </p>
          <Link to={wordHref(existing.id)} className="btn-secondary btn-sm" onClick={onClose}>
            Открыть в словаре
          </Link>
        </div>
      ) : form ? (
        <form noValidate onSubmit={(e) => void submit(e)} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor={`${id}-l`} className="block text-sm font-semibold">
              Слово (начальная форма)
            </label>
            <input id={`${id}-l`} className="input" lang="pt-PT" value={lemma} onChange={(e) => setLemma(e.target.value)} autoCapitalize="none" spellCheck={false} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-r`} className="block text-sm font-semibold">
              Перевод
            </label>
            <input
              id={`${id}-r`}
              className="input"
              value={ru}
              onChange={(e) => setRu(e.target.value)}
              placeholder="ваш перевод"
              autoFocus
              aria-describedby={target.sentenceRu ? `${id}-hint` : undefined}
            />
            {target.sentenceRu && (
              <p id={`${id}-hint`} className="text-sm text-ink-muted">
                Подсказка — перевод фразы: {target.sentenceRu}
              </p>
            )}
          </div>
          {(err || s.error) && (
            <p role="alert" className="text-sm text-danger">
              {err ?? s.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" icon={<Check />} disabled={s.busy}>
              Сохранить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setForm(false)}>
              Отмена
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" icon={<Plus />} onClick={() => setForm(true)}>
          В словарь
        </Button>
      )}
      <DictionaryLinks lemma={lemma || target.form} />
    </div>
  )
}
