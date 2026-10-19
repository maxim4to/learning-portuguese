import type { Exercise } from '@/content'

/** Short Russian instruction shown above an exercise. */
export function exerciseHeading(ex: Exercise): string {
  switch (ex.type) {
    case 'fill-gap':
      return 'Вставь пропущенное'
    case 'choice':
      return 'Выбери правильный вариант'
    case 'transform':
      return ex.instruction
    case 'order-words':
      return 'Составь предложение'
    case 'translate-ru-pt':
      return 'Переведи на португальский'
    case 'listen-type':
      return 'Послушай и запиши'
    case 'listen-choice':
      return 'Послушай и выбери'
    case 'match':
      return ex.prompt ?? 'Соедини пары'
    case 'speak-shadow':
      return 'Послушай и повтори вслух'
  }
}

/** Accepted answers for display after answering. */
export function exerciseExpected(ex: Exercise): string[] {
  switch (ex.type) {
    case 'fill-gap':
    case 'transform':
    case 'translate-ru-pt':
    case 'listen-type':
      return ex.answer
    case 'order-words':
      return [ex.answer]
    case 'choice':
    case 'listen-choice':
      return [ex.options[ex.correct]]
    case 'match':
      return [ex.pairs.map((p) => `${p.left} — ${p.right}`).join('; ')]
    case 'speak-shadow':
      return [ex.text]
  }
}

/** Front side of an SRS error card (the question, without giving away the answer where possible). */
export function exerciseFront(ex: Exercise): string {
  switch (ex.type) {
    case 'fill-gap':
      return ex.ru ? `${ex.prompt}\n(${ex.ru})` : ex.prompt
    case 'choice':
      return `${ex.prompt}\n[${ex.options.join(' / ')}]`
    case 'transform':
      return `${ex.instruction}\n${ex.prompt}`
    case 'order-words':
      return ex.ru ?? ex.words.join(' · ')
    case 'translate-ru-pt':
      return ex.ru
    case 'listen-type':
      return `Диктант: ${ex.text}`
    case 'listen-choice':
      return `${ex.prompt ?? 'Выбери'} — «${ex.text}»\n[${ex.options.join(' / ')}]`
    case 'match':
      return ex.prompt ?? 'Соедини пары'
    case 'speak-shadow':
      return ex.ru ?? ex.text
  }
}

/** Text to fill the `___` gaps of a fill-gap prompt with (answer variant "a / b" → one per gap). */
export function fillGaps(prompt: string, answer: string): string {
  const parts = answer.split(/\s*\/\s*/)
  let i = 0
  return prompt.replace(/_{3,}/g, () => parts[i++] ?? parts[parts.length - 1])
}
