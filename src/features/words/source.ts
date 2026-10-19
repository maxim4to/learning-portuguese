/**
 * Where a dictionary word was met: `WordSource.src` = `kind:id[:part[:index]]`, or `manual[:tutor]`.
 * Phase 1 writes `vocab:<themeId>`, `situation:<id>:vocab:<i>` and `manual`; Phase 2 (word capture)
 * adds dialogue lines, reading paragraphs, examples and exercises with the same encoding.
 */
import { findExercise, getCheatsheet, getReadingText, getSituation, getTopic, getVocabTheme } from '@/content'

export type SourceKind = 'situation' | 'reading' | 'topic' | 'vocab' | 'exercise' | 'cheatsheet' | 'review' | 'writing' | 'manual'

export interface PtSource {
  kind: SourceKind
  /** Content id (situation / reading / topic / theme / exercise); '' or 'tutor' for manual. */
  id: string
  part?: string
  index?: number
}

export function encodeSource(s: PtSource): string {
  if (s.kind === 'manual') return s.id ? `manual:${s.id}` : 'manual'
  const parts: (string | number)[] = [s.kind, s.id]
  if (s.part !== undefined || s.index !== undefined) parts.push(s.part ?? '')
  if (s.index !== undefined) parts.push(s.index)
  return parts.join(':')
}

export function decodeSource(src: string): PtSource {
  const [kind, id = '', part, index] = src.split(':')
  const n = index !== undefined && index !== '' ? Number(index) : undefined
  return {
    kind: (kind || 'manual') as SourceKind,
    id,
    part: part || undefined,
    index: n !== undefined && Number.isFinite(n) ? n : undefined,
  }
}

/** Filter groups of the dictionary list (by `src` kind). */
export type SourceGroup = 'vocab' | 'situation' | 'reading' | 'other' | 'manual'

export const SOURCE_GROUP_LABEL: Record<SourceGroup, string> = {
  vocab: 'Темы библиотеки',
  situation: 'Ситуации',
  reading: 'Тексты',
  other: 'Уроки и упражнения',
  manual: 'Вручную',
}

export function sourceGroup(src: string): SourceGroup {
  const { kind } = decodeSource(src)
  if (kind === 'vocab' || kind === 'situation' || kind === 'reading' || kind === 'manual') return kind
  return 'other'
}

const PART_LABEL: Record<string, string> = {
  vocab: 'лексика',
  phrases: 'фразы',
  dialogue: 'реплика',
  paragraph: 'абзац',
  glossary: 'глоссарий',
  examples: 'пример',
  writing: 'письмо',
  theory: 'теория',
  feedback: 'разбор ответа',
  question: 'вопрос',
  sample: 'образец',
}

/** Parts whose index is worth printing («абзац 3», «пример 2»). */
const NUMBERED = new Set(['dialogue', 'paragraph', 'examples', 'phrases'])

/** Short title of the source material: «Здоровье», «В кафе»; undefined for manual input. */
export function sourceTitle(src: string): string | undefined {
  const s = decodeSource(src)
  switch (s.kind) {
    case 'vocab':
      return getVocabTheme(s.id)?.title
    case 'situation':
      return getSituation(s.id)?.title
    case 'reading':
      return getReadingText(s.id)?.title
    case 'topic':
      return getTopic(s.id)?.title
    case 'cheatsheet':
      return getCheatsheet(s.id)?.markdown.match(/^#\s+(.+)$/m)?.[1].trim()
    case 'exercise': {
      const loc = findExercise(s.id)
      if (!loc) return undefined
      if (loc.ownerKind === 'diagnostic') return 'Диагностика'
      if (loc.ownerKind === 'situation') return getSituation(loc.ownerId)?.title
      if (loc.ownerKind === 'reading') return getReadingText(loc.ownerId)?.title
      return getTopic(loc.ownerId)?.title
    }
    default:
      return undefined
  }
}

/** «Тема «Здоровье»», «Ситуация «В кафе» · лексика», «Добавлено вручную». */
export function sourceLabel(src: string): string {
  const s = decodeSource(src)
  if (s.kind === 'manual') return s.id === 'tutor' ? 'Из беседы с агентом' : 'Добавлено вручную'
  const title = sourceTitle(src) ?? s.id
  const kind = { vocab: 'Тема', situation: 'Ситуация', reading: 'Текст', topic: 'Урок', exercise: 'Упражнение', cheatsheet: 'Шпаргалка', review: 'Повторение', writing: 'Письмо' }[s.kind]
  const part = s.part && PART_LABEL[s.part] ? ` · ${PART_LABEL[s.part]}${NUMBERED.has(s.part) && s.index !== undefined ? ` ${s.index + 1}` : ''}` : ''
  return `${kind} «${title}»${part}`
}

/**
 * Link back to the material (undefined when there is nothing to open). The hash names the element to scroll to
 * and flash (`useSourceAnchor` in the capture provider): `#dlg-line-i`, `#p-i`, `#ph-i`, `#voc-i`, `#ex-i`…
 */
export function sourceHref(src: string): string | undefined {
  const s = decodeSource(src)
  const at = (prefix: string) => (s.index !== undefined ? `#${prefix}-${s.index}` : '')
  switch (s.kind) {
    case 'vocab':
      return getVocabTheme(s.id) ? `/library/vocab/${s.id}${s.part === 'examples' ? at('w') : ''}` : undefined
    case 'situation': {
      if (!getSituation(s.id)) return undefined
      const base = `/situation/${s.id}`
      switch (s.part) {
        case 'dialogue':
          return `${base}${at('dlg-line')}`
        case 'phrases':
          return `${base}?tab=phrases${at('ph')}`
        case 'vocab':
          return `${base}?tab=vocab${at('voc')}`
        case 'writing':
          return `${base}?tab=writing#writing-sample`
        default:
          return base
      }
    }
    case 'reading': {
      if (!getReadingText(s.id)) return undefined
      const hash = s.part === 'paragraph' ? at('p') : s.part === 'glossary' ? at('gl') : ''
      return `/library/reading/${s.id}${hash}`
    }
    case 'topic':
      return getTopic(s.id) ? `/topic/${s.id}${s.part === 'examples' ? `?tab=examples${at('ex')}` : ''}` : undefined
    case 'cheatsheet':
      return getCheatsheet(s.id) ? `/library/cheatsheet/${s.id}` : undefined
    case 'exercise': {
      const loc = findExercise(s.id)
      if (!loc) return undefined
      switch (loc.ownerKind) {
        case 'topic':
          return `/topic/${loc.ownerId}?tab=exercises`
        case 'topic-minitest':
          return `/topic/${loc.ownerId}?tab=mini-test`
        case 'situation':
          return `/situation/${loc.ownerId}?tab=exercises`
        case 'reading':
          return `/library/reading/${loc.ownerId}#questions`
        case 'diagnostic':
          return '/diagnostic'
      }
      return undefined
    }
    default:
      return undefined
  }
}

/** Route of a dictionary word (ids contain «#», so they are encoded). */
export const wordHref = (id: string) => `/words/${encodeURIComponent(id)}`

// ─── Lookup containers (word capture, see Pt.tsx) ───────────────────────────────

/** Data attributes of a lookup container. `data-lookup` is set only when `locked` is a boolean. */
export interface LookupAttrs {
  'data-pt-src'?: string
  'data-pt-ru'?: string
  'data-lookup'?: 'off' | 'on'
}

/**
 * The same context and lock for any container (no `lang`): exercise runners, cards, markdown wrappers.
 * `locked: true` → `data-lookup="off"` (no lookups inside, not even selection); `locked: false` →
 * `data-lookup="on"` (re-enables inside an «off» ancestor); omitted → no attribute (inherit).
 *
 *   <div {...lookupAttrs({ src: { kind: 'exercise', id: ex.id }, locked: !checked })}>…</div>
 */
export function lookupAttrs({ src, ru, locked }: { src?: PtSource; ru?: string; locked?: boolean }): LookupAttrs {
  const a: LookupAttrs = {}
  if (src) a['data-pt-src'] = encodeSource(src)
  if (ru) a['data-pt-ru'] = ru
  if (locked === true) a['data-lookup'] = 'off'
  else if (locked === false) a['data-lookup'] = 'on'
  return a
}
