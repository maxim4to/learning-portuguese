import { useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { cx } from '@/components/cx'
import { Dialog } from '@/components/Dialog'
import { plural } from '@/features/library/format'
import { importRowDefault, importRowInput, parseImportList, resolveImportRows, type ImportRow, type ImportSkip } from './importList.ts'
import { GENDER_LABEL, POS_SHORT_LABEL, useLexicon } from './lexicon.ts'
import { encodeSource, wordHref } from './source.ts'
import { useWordActions, useWordIndex, type WordActionResult } from './useWords.ts'
import { wordPt } from './wordOps.ts'

const EXAMPLE = `o pequeno-almoço — завтрак
levantar-se — вставать
a chávena - чашка
fixe	классный, клёвый`

const SKIP_REASON: Record<ImportSkip['reason'], string> = {
  'no-separator': 'нет разделителя',
  'no-pt': 'нет португальского слова',
  'no-ru': 'нет перевода',
  'too-many': 'больше 300 строк',
}

/**
 * «Импорт списка»: paste lines «palavra — перевод» (also « - », tab, «;»), e.g. the agent's «СЛОВА:» block.
 * Lines are deduplicated and looked up in the app lexicon (lemma, part of speech, gender); the preview marks words
 * already in the dictionary and lines that resolve to the same word. Picked rows are saved in one batch.
 */
export function ImportListDialog({ onClose, onAdded }: { onClose(): void; onAdded(r: WordActionResult, count: number): void }) {
  const { lex, status } = useLexicon()
  const index = useWordIndex()
  const { saveWords } = useWordActions()
  const [text, setText] = useState('')
  const [step, setStep] = useState<'paste' | 'preview'>('paste')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const id = useId()

  const parsed = useMemo(() => parseImportList(text), [text])
  const rows = useMemo(
    () => (step === 'preview' ? resolveImportRows(lex, parsed.items, index.byId) : []),
    [step, lex, parsed.items, index.byId],
  )

  function preview() {
    const next = resolveImportRows(lex, parsed.items, index.byId)
    setPicked(new Set(next.filter(importRowDefault).map((r) => r.item.line)))
    setStep('preview')
  }

  function toggle(line: number, on: boolean) {
    setPicked((s) => {
      const n = new Set(s)
      if (on) n.add(line)
      else n.delete(line)
      return n
    })
  }

  const chosen = rows.filter((r) => picked.has(r.item.line))
  async function save() {
    if (!chosen.length) return
    setBusy(true)
    setFailed(null)
    const src = encodeSource({ kind: 'manual', id: parsed.fromTutor ? 'tutor' : 'import' })
    try {
      const r = await saveWords(chosen.map((row) => importRowInput(row, { src })))
      onAdded(r, chosen.length)
    } catch (e) {
      setFailed(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`)
      setBusy(false)
    }
  }

  const counts = {
    found: rows.filter((r) => r.state === 'found' && r.sameAs === undefined).length,
    own: rows.filter((r) => r.state === 'own' && r.sameAs === undefined).length,
    exists: rows.filter((r) => r.state === 'exists').length,
  }
  const ready = parsed.items.length > 0

  return (
    <Dialog
      open
      onClose={onClose}
      className="max-w-2xl"
      title="Импорт списка"
      description={
        step === 'paste'
          ? 'Вставьте слова по одному на строке: «palavra — перевод». Подойдут « - », табуляция и «;», например блок «СЛОВА:» из беседы с агентом.'
          : 'Проверьте разбор: слова сверены со словарём приложения. Отмеченные будут добавлены одним пакетом.'
      }
      initialFocusRef={step === 'paste' ? textRef : undefined}
      actions={
        step === 'paste' ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button disabled={!ready || status === 'loading'} onClick={preview}>
              {status === 'loading' ? 'Загружаю словарь…' : ready ? `Разобрать (${parsed.items.length})` : 'Разобрать'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" icon={<ArrowLeft />} onClick={() => setStep('paste')} disabled={busy}>
              Назад
            </Button>
            <Button disabled={!chosen.length || busy} onClick={() => void save()}>
              {busy ? 'Сохраняю…' : chosen.length ? `Добавить ${plural(chosen.length, 'слово', 'слова', 'слов')}` : 'Ничего не выбрано'}
            </Button>
          </>
        )
      }
    >
      {step === 'paste' ? (
        <div className="space-y-2">
          <label htmlFor={`${id}-text`} className="text-sm font-semibold">
            Список слов
          </label>
          <textarea
            ref={textRef}
            id={`${id}-text`}
            className="input min-h-48 rounded-sm py-3 leading-6"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            spellCheck={false}
            autoCapitalize="none"
            aria-describedby={`${id}-hint`}
            data-lookup="off"
          />
          <p id={`${id}-hint`} role="status" className="text-sm text-ink-muted">
            {!text.trim()
              ? 'Пустые строки, нумерация и заголовок «СЛОВА:» пропускаются; повторы склеиваются.'
              : `Строк со словами: ${parsed.items.length}` +
                (parsed.items.some((i) => i.duplicates.length) ? ` · повторы склеены` : '') +
                (parsed.skipped.length ? ` · без разделителя или перевода: ${parsed.skipped.length}` : '')}
          </p>
          {status === 'error' && (
            <p className="text-sm text-ink-muted">Словарь приложения не загрузился — слова сохранятся с вашими переводами.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p role="status" className="text-sm text-ink-muted">
            Найдено в словаре приложения: <b className="text-ink">{counts.found}</b> · своих слов: <b className="text-ink">{counts.own}</b> · уже в
            моём словаре: <b className="text-ink">{counts.exists}</b>
          </p>
          <ul className="divide-y divide-line rounded-control ring-1 ring-line" aria-label="Разбор списка">
            {rows.map((r) => (
              <PreviewRow key={r.item.line} row={r} checked={picked.has(r.item.line)} onToggle={(on) => toggle(r.item.line, on)} onOpen={onClose} />
            ))}
          </ul>
          {parsed.skipped.length > 0 && (
            <details className="text-sm text-ink-muted">
              <summary className="min-h-11 cursor-pointer py-2.5 font-semibold">Пропущено строк: {parsed.skipped.length}</summary>
              <ul className="space-y-1 pb-2">
                {parsed.skipped.map((s) => (
                  <li key={s.line}>
                    Строка {s.line}: <span className="text-ink">{s.text}</span> — {SKIP_REASON[s.reason]}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {failed && (
            <p role="alert" className="text-sm text-danger">
              {failed}
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}

function PreviewRow({ row, checked, onToggle, onOpen }: { row: ImportRow; checked: boolean; onToggle(on: boolean): void; onOpen(): void }) {
  const id = useId()
  const pt = wordPt({ lemma: row.lemma, pos: row.pos, gender: row.gender })
  const typed = row.item.pt.trim()
  const meta = [row.pos && POS_SHORT_LABEL[row.pos], row.pos === 'noun' && row.gender ? GENDER_LABEL[row.gender].split(' (')[0] : '', row.entry?.level]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className={cx('flex items-start gap-3 py-2.5 pr-3 pl-3', !checked && 'bg-surface-2/50')}>
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-5 shrink-0 accent-[var(--brand)]"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span lang="pt-PT" className="font-semibold break-words">
            {pt}
          </span>
          {typed.toLowerCase() !== pt.toLowerCase() && typed.toLowerCase() !== row.lemma.toLowerCase() && (
            <span className="text-sm text-ink-muted">
              из «<span lang="pt-PT">{typed}</span>»
            </span>
          )}
        </span>
        <span className="block text-sm text-ink-muted">
          {meta && `${meta} — `}
          <span className="text-ink">{row.item.ru}</span>
        </span>
        {row.alternatives.length > 0 && row.state !== 'exists' && (
          <span className="block text-sm text-ink-muted">
            Другие разборы:{' '}
            <span lang="pt-PT">{row.alternatives.map((e) => `${e.lemma} (${POS_SHORT_LABEL[e.pos] || e.pos})`).join(', ')}</span>
          </span>
        )}
        {row.existing && (
          <span className="block text-sm text-ink-muted">
            Уже в словаре: «{row.existing.ru}». Добавление сохранит перевод и добавит источник.
          </span>
        )}
        {row.sameAs !== undefined && <span className="block text-sm text-ink-muted">То же слово, что в строке {row.sameAs}.</span>}
      </label>
      <span className="shrink-0">
        {row.state === 'exists' ? (
          <Link to={wordHref(row.id)} onClick={onOpen} className="text-sm font-semibold">
            В словаре
          </Link>
        ) : row.sameAs !== undefined ? (
          <Badge tone="neutral">повтор</Badge>
        ) : row.state === 'found' ? (
          <Badge tone="neutral">найдено</Badge>
        ) : (
          <Badge tone="terracotta">своё слово</Badge>
        )}
      </span>
    </li>
  )
}
