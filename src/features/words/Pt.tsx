import type { ComponentPropsWithoutRef, ElementType } from 'react'
import { lookupAttrs, type PtSource } from './source.ts'

type PtOwnProps<T extends ElementType> = {
  /** Element to render (default `span`): `p`, `li`, `dd`, `h3`… */
  as?: T
  /** Where this text comes from — saved words record it (and link back to it). */
  src?: PtSource
  /** Russian translation of this sentence / line (shown in the card, hint for unknown words). */
  ru?: string
  /**
   * Lookup off (`data-lookup="off"`): use while the text would give an answer away (exercise before
   * «Проверить», flashcard front). Same as `lookup={false}`.
   */
  locked?: boolean
  /** `false` → `data-lookup="off"`. */
  lookup?: boolean
}

export type PtProps<T extends ElementType = 'span'> = PtOwnProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof PtOwnProps<T>>

/**
 * Marks text as European Portuguese for word capture: `lang="pt-PT"` (tap / double-click / select a word
 * opens the lookup card), plus optional context — `src` (source of saved words) and `ru` (translation).
 *
 *   <Pt as="p" src={{ kind: 'situation', id, part: 'dialogue', index: i }} ru={line.ru}>{line.pt}</Pt>
 *   <Pt locked={!checked}>{prompt}</Pt>
 */
export function Pt<T extends ElementType = 'span'>({ as, src, ru, locked, lookup = true, ...rest }: PtProps<T>) {
  const Tag: ElementType = as ?? 'span'
  return <Tag lang="pt-PT" {...lookupAttrs({ src, ru, locked: locked || !lookup ? true : undefined })} {...rest} />
}
