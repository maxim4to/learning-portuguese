/**
 * «Практика» routes. Every sub-section has its own index page and its detail pages nested under it:
 *   /practice/situations[/:id] · /practice/cheatsheets[/:id] · /practice/vocab[/:id] · /practice/reading[/:id] · /practice/tutor
 * The old URLs (/situations, /situation/:id, /library…, /tutor) redirect here (see `redirects.tsx`):
 * saved words and SRS cards stored links to them.
 */
export const PRACTICE = '/practice'

export type PracticeSection = 'situations' | 'cheatsheets' | 'vocab' | 'reading' | 'tutor'

export const practicePath = (section: PracticeSection) => `${PRACTICE}/${section}`

export const situationHref = (id: string) => `${PRACTICE}/situations/${id}`
export const cheatsheetHref = (id: string) => `${PRACTICE}/cheatsheets/${id}`
export const vocabHref = (id: string) => `${PRACTICE}/vocab/${id}`
export const readingHref = (id: string) => `${PRACTICE}/reading/${id}`
export const TUTOR_HREF = practicePath('tutor')

export const PRACTICE_LABEL: Record<PracticeSection, string> = {
  situations: 'Ситуации',
  cheatsheets: 'Шпаргалки',
  vocab: 'Словари',
  reading: 'Чтение',
  tutor: 'С агентом',
}
