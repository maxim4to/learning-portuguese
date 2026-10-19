/** Form state of the word editor and the «add manually» form (pure helpers). */
import type { WordCardMode, WordEntry, WordPos } from '@/data'
import type { WordPatch } from './wordOps.ts'

/** Editable fields shared by the editor and the «add manually» form. */
export interface WordDraft {
  lemma: string
  ru: string
  pos: WordPos | ''
  gender: 'm' | 'f' | 'mf' | ''
  note: string
  modes: WordCardMode[]
}

export const draftOf = (w: WordEntry): WordDraft => ({
  lemma: w.lemma,
  ru: w.ru,
  pos: w.pos ?? '',
  gender: w.gender ?? '',
  note: w.note ?? '',
  modes: [...w.modes],
})

export type DraftErrors = Partial<Record<'lemma' | 'ru' | 'modes', string>>

export function validateDraft(d: WordDraft, opts: { modes?: boolean } = {}): DraftErrors {
  const e: DraftErrors = {}
  if (!d.lemma.trim()) e.lemma = 'Введите слово на португальском'
  else if (d.lemma.trim().length > 120) e.lemma = 'Не длиннее 120 символов'
  if (!d.ru.trim()) e.ru = 'Введите перевод'
  else if (d.ru.trim().length > 500) e.ru = 'Не длиннее 500 символов'
  if (opts.modes && d.modes.length === 0) e.modes = 'Оставьте хотя бы один вид карточек'
  return e
}

/** Changed fields only (empty patch = nothing to save). */
export function patchOf(prev: WordEntry, d: WordDraft): WordPatch {
  const patch: WordPatch = {}
  if (d.lemma.trim() !== prev.lemma) patch.lemma = d.lemma.trim()
  if (d.ru.trim() !== prev.ru) patch.ru = d.ru.trim()
  if ((d.pos || undefined) !== prev.pos) patch.pos = d.pos || undefined
  if ((d.gender || undefined) !== prev.gender) patch.gender = d.gender || undefined
  if ((d.note.trim() || undefined) !== prev.note) patch.note = d.note.trim() || undefined
  if (d.modes.join() !== prev.modes.join()) patch.modes = d.modes
  return patch
}

