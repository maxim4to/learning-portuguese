import type { Level } from '@/content'

/**
 * Caldera poster illustrations (generated in Figma, see public/illustrations/).
 * Each one is a self-contained flat tile with its own background, so it reads as a card in both themes;
 * in dark mode `.illus` dims it slightly (index.css).
 * Files are `<name>-<width>.webp`: squares come from the 1024 px originals (1024/512/256), the hero from its
 * 1264 px original (800/1264 plus Lanczos-upscaled 1600/2560 for wide Hi-DPI covers). `src` is the fallback width.
 * Encoded with `cwebp -q 88 -m 6 -sharp_yuv` (sharp_yuv keeps the ember/basalt halftone edges clean; the violet fields were recoloured to Basalt #3a3530 in the polish pass).
 */
const SQUARE = { w: 1024, h: 1024, widths: [256, 512, 1024], src: 512 } as const

export const ART = {
  hero: { w: 1264, h: 848, widths: [800, 1264, 1600, 2560], src: 1264 },
  'level-a1': SQUARE,
  'level-a2': SQUARE,
  'level-b1': SQUARE,
  'level-b2': SQUARE,
  'sit-home': SQUARE,
  'sit-documents': SQUARE,
  'sit-health': SQUARE,
  'sit-food': SQUARE,
  'sit-transport': SQUARE,
  'sit-work': SQUARE,
  'empty-review': SQUARE,
  'empty-errors': SQUARE,
  'not-found': SQUARE,
} as const

export type IllustrationName = keyof typeof ART

export const levelArt = (level: Level) => `level-${level.toLowerCase()}` as IllustrationName

/** Situation → one of six group covers, by id keyword (content has no group field); city culture (fado, festas) goes with «transport & city», small talk falls back to café. */
const GROUPS: [RegExp, IllustrationName][] = [
  [/arrendar|casa|vizinhos|condominio|mudanca|utilities/, 'sit-home'],
  [/saude|medico|farmacia|ginasio/, 'sit-health'],
  [/transportes|viagem|oficina|automovel|carro|fado|festas/, 'sit-transport'],
  [/emprego|entrevista|banco|compras|loja/, 'sit-work'],
  [/aima|documentos|camara|financas|email|telefonema|marcacao|escola|creche|reclamacao/, 'sit-documents'],
  [/cafe|restaurante|cozinha|supermercado|mercado/, 'sit-food'],
]

export function situationArt(id: string): IllustrationName {
  return GROUPS.find(([re]) => re.test(id))?.[1] ?? 'sit-food'
}

/**
 * 29 situations share six covers. So the list doesn't repeat one picture row after row, each situation in a
 * group gets its own detail crop of the group's drawing (the first keeps the whole tile, the next zoom in on a
 * different part of it). Order follows the id list passed in, so the crop is stable for a given content set.
 */
const CROPS: { scale: number; origin: string }[] = [
  { scale: 1, origin: '50% 50%' },
  { scale: 1.9, origin: '28% 70%' },
  { scale: 1.9, origin: '72% 32%' },
  { scale: 2.2, origin: '50% 82%' },
  { scale: 1.7, origin: '20% 25%' },
  { scale: 2.1, origin: '80% 72%' },
  { scale: 1.6, origin: '55% 45%' },
]

export function situationCrops(ids: readonly string[]): Map<string, { transform: string; transformOrigin: string }> {
  const seen = new Map<IllustrationName, number>()
  const out = new Map<string, { transform: string; transformOrigin: string }>()
  for (const id of ids) {
    const art = situationArt(id)
    const i = seen.get(art) ?? 0
    seen.set(art, i + 1)
    const c = CROPS[i % CROPS.length]
    out.set(id, { transform: `scale(${c.scale})`, transformOrigin: c.origin })
  }
  return out
}
