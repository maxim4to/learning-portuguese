/**
 * Where a dictionary word was met: `WordSource.src` = `kind:id[:part[:index]]`, or `manual[:tutor]`.
 * Phase 1 writes `vocab:<themeId>`, `situation:<id>:vocab:<i>` and `manual`; Phase 2 (word capture)
 * adds dialogue lines, reading paragraphs, examples and exercises with the same encoding.
 */
import { getReadingText, getSituation, getTopic, getVocabTheme } from '@/content'

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
}

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
  const part = s.part && PART_LABEL[s.part] ? ` · ${PART_LABEL[s.part]}${s.part === 'dialogue' && s.index !== undefined ? ` ${s.index + 1}` : ''}` : ''
  return `${kind} «${title}»${part}`
}

/** Link back to the material (undefined when there is nothing to open). */
export function sourceHref(src: string): string | undefined {
  const s = decodeSource(src)
  switch (s.kind) {
    case 'vocab':
      return getVocabTheme(s.id) ? `/library/vocab/${s.id}` : undefined
    case 'situation': {
      if (!getSituation(s.id)) return undefined
      const tab = s.part === 'dialogue' ? '' : s.part === 'phrases' || s.part === 'vocab' || s.part === 'writing' ? `?tab=${s.part}` : ''
      return `/situation/${s.id}${tab}${s.part === 'dialogue' && s.index !== undefined ? `#dlg-line-${s.index}` : ''}`
    }
    case 'reading':
      return getReadingText(s.id) ? `/library/reading/${s.id}${s.part === 'paragraph' && s.index !== undefined ? `#p-${s.index}` : ''}` : undefined
    case 'topic':
      return getTopic(s.id) ? `/topic/${s.id}${s.part === 'examples' ? '?tab=examples' : ''}` : undefined
    default:
      return undefined
  }
}

/** Route of a dictionary word (ids contain «#», so they are encoded). */
export const wordHref = (id: string) => `/words/${encodeURIComponent(id)}`
