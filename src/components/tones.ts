/** Shared tone → class maps (kept out of component files for fast refresh). */
export type BadgeTone = 'neutral' | 'brand' | 'azulejo' | 'terracotta' | 'sun' | 'danger' | 'solid'

export const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-azulejo-soft text-ink',
  brand: 'bg-brand-soft text-brand-ink',
  azulejo: 'bg-azulejo-soft text-azulejo-ink',
  terracotta: 'bg-terracotta-soft text-terracotta',
  sun: 'bg-sun-soft text-sun',
  danger: 'bg-danger-soft text-danger',
  solid: 'bg-brand text-on-brand',
}

export type RingTone = 'brand' | 'sun' | 'terracotta' | 'azulejo'

/** Result tone by the app's thresholds (<60 weak, <85 learning, otherwise confident). */
export function toneForPct(pct: number): RingTone {
  return pct >= 85 ? 'brand' : pct >= 60 ? 'sun' : 'terracotta'
}
