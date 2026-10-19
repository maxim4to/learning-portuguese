import { useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { useToast } from '@/components/toastContext'
import { WORD_CARD_MODES, type WordCardMode, type WordEntry, type WordPos } from '@/data'
import { draftOf, patchOf, validateDraft, type DraftErrors, type WordDraft } from './draft.ts'
import { useSettings } from '@/features/exercises/useSettings'
import { GENDER_LABEL, POS_LABEL } from './lexicon.ts'
import { MODE_UNLOCK_HINT, WORD_MODE_LABEL } from './status.ts'
import { useWordActions } from './useWords.ts'
import { wordPt } from './wordOps.ts'

const POS_ORDER: WordPos[] = ['noun', 'verb', 'adj', 'adv', 'prep', 'pron', 'det', 'conj', 'num', 'interj', 'phrase', 'other']

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-e`} className="text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-h`} className="text-sm text-ink-muted">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/**
 * Lemma, translation, part of speech, gender, note and (optionally) card modes.
 * `lemmaRef` receives the first field (initial focus in dialogs).
 */
export function WordFields({
  value,
  onChange,
  errors = {},
  showModes,
  showNote = true,
  ruHint,
  lemmaRef,
  disabledModes,
}: {
  value: WordDraft
  onChange(d: WordDraft): void
  errors?: DraftErrors
  showModes?: boolean
  showNote?: boolean
  ruHint?: ReactNode
  lemmaRef?: Ref<HTMLInputElement>
  /** Modes switched off globally in settings (shown as such). */
  disabledModes?: readonly WordCardMode[]
}) {
  const id = useId()
  const set = <K extends keyof WordDraft>(k: K, v: WordDraft[K]) => onChange({ ...value, [k]: v })
  const describedBy = (k: string, err?: string, hint?: unknown) => (err ? `${id}-${k}-e` : hint ? `${id}-${k}-h` : undefined)
  return (
    <div className="space-y-4">
      <Field id={`${id}-lemma`} label="Слово (pt-PT)" error={errors.lemma} hint="Без артикля: «saúde», «levantar-se»">
        <input
          ref={lemmaRef}
          id={`${id}-lemma`}
          className="input"
          lang="pt-PT"
          value={value.lemma}
          onChange={(e) => set('lemma', e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={errors.lemma ? true : undefined}
          aria-describedby={describedBy('lemma', errors.lemma, true)}
          maxLength={120}
        />
      </Field>
      <Field id={`${id}-ru`} label="Перевод" error={errors.ru} hint={ruHint ?? 'Несколько значений — через точку с запятой'}>
        <input
          id={`${id}-ru`}
          className="input"
          lang="ru"
          value={value.ru}
          onChange={(e) => set('ru', e.target.value)}
          autoComplete="off"
          aria-invalid={errors.ru ? true : undefined}
          aria-describedby={describedBy('ru', errors.ru, true)}
          maxLength={500}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-pos`} label="Часть речи">
          <select id={`${id}-pos`} className="input" value={value.pos} onChange={(e) => set('pos', e.target.value as WordPos | '')}>
            <option value="">Не указана</option>
            {POS_ORDER.map((p) => (
              <option key={p} value={p}>
                {POS_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-gender`} label="Род">
          <select
            id={`${id}-gender`}
            className="input"
            value={value.gender}
            onChange={(e) => set('gender', e.target.value as WordDraft['gender'])}
          >
            <option value="">Не указан</option>
            {(['m', 'f', 'mf'] as const).map((g) => (
              <option key={g} value={g}>
                {GENDER_LABEL[g]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {showNote && (
        <Field id={`${id}-note`} label="Заметка" hint="Необязательно: контекст, похожие слова, ассоциация">
          <textarea
            id={`${id}-note`}
            className="input min-h-20 resize-y"
            rows={2}
            value={value.note}
            onChange={(e) => set('note', e.target.value)}
            aria-describedby={`${id}-note-h`}
            maxLength={500}
          />
        </Field>
      )}
      {showModes && (
        <fieldset className="space-y-1" aria-describedby={errors.modes ? `${id}-modes-e` : undefined}>
          <legend className="mb-1 text-sm font-semibold">Карточки для этого слова</legend>
          {WORD_CARD_MODES.map((m) => {
            const off = disabledModes?.includes(m)
            return (
              <label key={m} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control px-2 py-2 hover:bg-surface-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
                  checked={value.modes.includes(m)}
                  onChange={(e) =>
                    set('modes', e.target.checked ? WORD_CARD_MODES.filter((x) => x === m || value.modes.includes(x)) : value.modes.filter((x) => x !== m))
                  }
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{WORD_MODE_LABEL[m]}</span>
                  <span className="block text-sm text-ink-muted">{off ? 'выключено в настройках для всех слов' : MODE_UNLOCK_HINT[m]}</span>
                </span>
              </label>
            )
          })}
          {errors.modes && (
            <p id={`${id}-modes-e`} className="text-sm text-danger">
              {errors.modes}
            </p>
          )}
        </fieldset>
      )}
    </div>
  )
}

/** «Изменить слово» dialog: saves only changed fields, toast with «Отменить». Mount while open. */
export function WordEditor({ word, onClose }: { word: WordEntry; onClose(): void }) {
  const { updateWord } = useWordActions()
  const toast = useToast()
  const settings = useSettings()
  const [draft, setDraft] = useState(() => draftOf(word))
  const [errors, setErrors] = useState<DraftErrors>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const lemmaRef = useRef<HTMLInputElement>(null)
  const formId = useId()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validateDraft(draft, { modes: true })
    setErrors(errs)
    if (Object.keys(errs).length) return
    const patch = patchOf(word, draft)
    if (!Object.keys(patch).length) return onClose()
    setBusy(true)
    setFailed(null)
    try {
      const { undo, words } = await updateWord(word.id, patch)
      onClose()
      toast({
        text: `Сохранено: ${words[0] ? wordPt(words[0]) : word.lemma}`,
        tone: 'success',
        action: { label: 'Отменить', onClick: () => void undo() },
      })
    } catch (err) {
      setFailed(`Не удалось сохранить: ${err instanceof Error ? err.message : String(err)}`)
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title="Изменить слово"
      description={<span lang="pt-PT">{wordPt(word)}</span>}
      initialFocusRef={lemmaRef}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" form={formId} disabled={busy}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(e) => void submit(e)} className="space-y-4">
        <WordFields value={draft} onChange={setDraft} errors={errors} showModes lemmaRef={lemmaRef} disabledModes={WORD_CARD_MODES.filter((m) => !settings.wordModes.includes(m))} />
        {failed && (
          <p role="alert" className="text-sm text-danger">
            {failed}
          </p>
        )}
      </form>
    </Dialog>
  )
}
