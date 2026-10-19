import { useDeferredValue, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, Plus, Search } from 'lucide-react'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import type { LexEntry } from '@/engine/lexicon/lookup'
import { validateDraft, type DraftErrors, type WordDraft } from './draft.ts'
import { lexEntryInput, POS_SHORT_LABEL, useLexicon } from './lexicon.ts'
import { wordHref } from './source.ts'
import { useWordActions, useWordIndex, type WordActionResult } from './useWords.ts'
import { WordFields } from './WordEditor.tsx'
import { normalizeLemma, wordIdFor, wordPt } from './wordOps.ts'

const CYRILLIC = /\p{Script=Cyrillic}/u
const EMPTY_DRAFT: WordDraft = { lemma: '', ru: '', pos: '', gender: '', note: '', modes: [] }

/** External pt-PT dictionaries (plain links, no runtime AI). */
export function DictionaryLinks({ lemma, className }: { lemma: string; className?: string }) {
  const q = encodeURIComponent(lemma.trim().toLowerCase())
  if (!q) return null
  const link = 'inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold'
  return (
    <p className={className}>
      <span className="text-sm text-ink-muted">Проверить: </span>
      <a className={link} href={`https://www.infopedia.pt/dicionarios/portugues-russo/${q}`} target="_blank" rel="noreferrer">
        Infopédia PT–RU <ExternalLink aria-hidden className="size-3.5" />
        <span className="sr-only">(откроется в новой вкладке)</span>
      </a>
      <span aria-hidden className="mx-2 text-ink-subtle">
        ·
      </span>
      <a className={link} href={`https://dicionario.priberam.org/${q}`} target="_blank" rel="noreferrer">
        Priberam <ExternalLink aria-hidden className="size-3.5" />
        <span className="sr-only">(откроется в новой вкладке)</span>
      </a>
    </p>
  )
}

/**
 * «Добавить слово»: search the app lexicon (pt prefix without accents, or Russian); if the word is
 * not there — save it with your own translation. Calls `onAdded` with the result (the caller closes
 * the dialog and shows the «Отменить» toast — a toast under a modal dialog can't be clicked).
 */
export function WordSearchDialog({ onClose, onAdded }: { onClose(): void; onAdded(r: WordActionResult): void }) {
  const { lex, status } = useLexicon()
  const index = useWordIndex()
  const { saveWord } = useWordActions()
  const [q, setQ] = useState('')
  const query = useDeferredValue(q)
  const [manual, setManual] = useState(false)
  const [draft, setDraft] = useState<WordDraft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const lemmaRef = useRef<HTMLInputElement>(null)
  const id = useId()

  const results = useMemo(() => (lex && query.trim() ? lex.search(query, 8) : []), [lex, query])
  const notFound = status !== 'loading' && query.trim() !== '' && results.length === 0
  const showForm = manual || notFound || status === 'error'

  function openManual() {
    const t = q.trim()
    setDraft((d) => ({ ...d, lemma: d.lemma || (CYRILLIC.test(t) ? '' : t.toLowerCase()), ru: d.ru || (CYRILLIC.test(t) ? t : '') }))
    setManual(true)
    setTimeout(() => lemmaRef.current?.focus(), 0)
  }

  async function add(entry: LexEntry) {
    setBusy(entry.id)
    setFailed(null)
    try {
      onAdded(await saveWord(lexEntryInput(entry)))
    } catch (e) {
      setFailed(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`)
      setBusy(null)
    }
  }

  // The «not found» form is prefilled from the query on the fly until the learner types in it.
  const effective: WordDraft =
    notFound && !manual ? { ...draft, lemma: CYRILLIC.test(query) ? '' : query.trim().toLowerCase(), ru: CYRILLIC.test(query) ? query.trim() : '' } : draft

  async function submitManual(e: FormEvent) {
    e.preventDefault()
    const d = effective
    const errs = validateDraft(d)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy('manual')
    setFailed(null)
    try {
      onAdded(
        await saveWord({
          lemma: d.lemma.trim(),
          ru: d.ru.trim(),
          pos: d.pos || undefined,
          gender: d.gender || undefined,
          note: d.note.trim() || undefined,
          source: { src: 'manual', form: d.lemma.trim() },
        }),
      )
    } catch (err) {
      setFailed(`Не удалось сохранить: ${err instanceof Error ? err.message : String(err)}`)
      setBusy(null)
    }
  }

  const sameLemma = effective.lemma.trim() ? (index.byLemma.get(normalizeLemma(effective.lemma)) ?? []) : []
  const manualExists = effective.lemma.trim() ? index.byId.get(wordIdFor({ lemma: effective.lemma })) : undefined

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title="Добавить слово"
      description="Найдите слово в словаре приложения или добавьте своё с переводом."
      initialFocusRef={searchRef}
      className="max-w-xl"
      actions={
        showForm ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={!!busy}>
              Отмена
            </Button>
            <Button type="submit" form={`${id}-manual`} disabled={!!busy}>
              {busy === 'manual' ? 'Сохраняю…' : manualExists ? 'Дополнить слово' : 'Сохранить в словарь'}
            </Button>
          </>
        ) : undefined
      }
    >
      <div role="search" className="space-y-2">
        <label htmlFor={`${id}-q`} className="block text-sm font-semibold">
          Слово на португальском или русском
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-muted" />
          <input
            ref={searchRef}
            id={`${id}-q`}
            type="search"
            className="input pl-11"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setFailed(null)
            }}
            placeholder="saúde, levantar-se, здоровье…"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={`${id}-status`}
          />
        </div>
        <p id={`${id}-status`} role="status" className="text-sm text-ink-muted">
          {status === 'loading'
            ? 'Загружаю словарь приложения…'
            : status === 'error'
              ? 'Словарь приложения не загрузился — слово можно добавить вручную.'
              : !query.trim()
                ? `В словаре приложения ${lex?.size.entries ?? 0} слов и выражений. Поиск без учёта акцентов.`
                : results.length
                  ? `Найдено: ${results.length}${results.length === 8 ? ' (первые 8)' : ''}`
                  : 'Нет в словаре приложения'}
        </p>
      </div>

      {results.length > 0 && (
        <ul className="divide-y divide-line rounded-control ring-1 ring-line" aria-label="Результаты поиска">
          {results.map((e) => {
            const saved = index.byLexId.get(e.id)
            const pt = wordPt({ lemma: e.lemma, pos: e.pos, gender: e.gender })
            return (
              <li key={e.id} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
                <div className="min-w-0 flex-1">
                  <p lang="pt-PT" className="font-semibold break-words">
                    {pt}
                  </p>
                  <p className="line-clamp-2 text-sm text-ink-muted">
                    {[POS_SHORT_LABEL[e.pos], e.level].filter(Boolean).join(' · ')}
                    {' — '}
                    <span lang="ru">{e.ru.join('; ')}</span>
                  </p>
                </div>
                {saved ? (
                  <Link to={wordHref(saved.id)} onClick={onClose} className="btn-ghost btn-sm shrink-0 text-brand-ink max-sm:btn-icon" aria-label={`«${pt}» уже в словаре — открыть`}>
                    <Check aria-hidden /> <span className="max-sm:sr-only">В словаре</span>
                  </Link>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus />}
                    className="shrink-0 max-sm:btn-icon"
                    disabled={!!busy}
                    aria-label={`Добавить «${pt}» в словарь`}
                    onClick={() => void add(e)}
                  >
                    <span className="max-sm:sr-only">{busy === e.id ? '…' : 'Добавить'}</span>
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!showForm && status === 'ready' && (
        <p className="text-sm text-ink-muted">
          {query.trim() ? 'Нет нужного значения?' : 'Слова нет в приложении?'}{' '}
          <button type="button" className="btn-ghost btn-sm -ml-2 text-ink" onClick={openManual}>
            Добавить своё слово
          </button>
        </p>
      )}

      {showForm && (
        <form id={`${id}-manual`} noValidate onSubmit={(e) => void submitManual(e)} className="space-y-4 border-t border-line pt-4">
          <h3>{notFound && !manual ? 'Добавить своё слово' : 'Своё слово'}</h3>
          <WordFields
            value={effective}
            onChange={(d) => {
              setDraft(d)
              setManual(true)
            }}
            errors={errors}
            showNote={false}
            lemmaRef={lemmaRef}
          />
          {sameLemma.length > 0 && (
            <p className="text-sm text-ink-muted" role="status">
              Уже в словаре:{' '}
              {sameLemma.map((w, i) => (
                <span key={w.id}>
                  {i > 0 && ', '}
                  <Link to={wordHref(w.id)} onClick={onClose} lang="pt-PT">
                    {wordPt(w)}
                  </Link>
                </span>
              ))}
              {manualExists ? '. Сохранение добавит к нему этот источник.' : ''}
            </p>
          )}
          <DictionaryLinks lemma={effective.lemma} />
        </form>
      )}

      {failed && (
        <p role="alert" className="text-sm text-danger">
          {failed}
        </p>
      )}
    </Dialog>
  )
}
