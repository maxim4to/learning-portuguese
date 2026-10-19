import type { CardKind } from '@/data/types.ts'
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
