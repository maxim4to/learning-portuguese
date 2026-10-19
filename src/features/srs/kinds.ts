import type { CardKind, WordCardMode } from '@/data/types.ts'
import { BADGE_TONE } from '@/components/tones'

export const KIND_LABEL: Record<CardKind, string> = {
  word: 'Слово',
  phrase: 'Фраза',
  grammar: 'Грамматика',
  error: 'Работа над ошибкой',
}

/** Short label for filters. */
export const KIND_SHORT: Record<CardKind, string> = {
  word: 'Слова',
  phrase: 'Фразы',
  grammar: 'Грамматика',
  error: 'Ошибки',
}

export const KIND_CHIP: Record<CardKind, string> = {
  word: BADGE_TONE.azulejo,
  phrase: BADGE_TONE.brand,
  grammar: BADGE_TONE.sun,
  error: BADGE_TONE.terracotta,
}

/** Stored prefix of dictation error cards (kept for existing data; the UI shows a headphones icon instead). */
export const LISTEN_MARK = String.fromCodePoint(0x1f3a7)

/**
 * Personal-dictionary cards (`wordId` + `mode`): the task, and which side is Portuguese.
 * recognize: pt front → ru back; produce: ru → pt; listen: audio → pt; cloze: pt gap sentence → pt sentence.
 */
export const WORD_TASK: Record<WordCardMode, { task: string; frontPt: boolean; backPt: boolean }> = {
  recognize: { task: 'Что это значит?', frontPt: true, backPt: false },
  produce: { task: 'Как это по-португальски?', frontPt: false, backPt: true },
  listen: { task: 'Прослушайте: что это за слово?', frontPt: true, backPt: true },
  cloze: { task: 'Какое слово пропущено?', frontPt: true, backPt: true },
}
