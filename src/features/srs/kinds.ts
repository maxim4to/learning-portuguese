import type { CardKind } from '@/data/types.ts'

export const KIND_LABEL: Record<CardKind, string> = {
  word: 'Слово',
  phrase: 'Фраза',
  grammar: 'Грамматика',
  error: 'Ошибка',
}

export const KIND_CHIP: Record<CardKind, string> = {
  word: 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  phrase: 'bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
  grammar: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  error: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
}
