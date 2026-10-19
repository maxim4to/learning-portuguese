import type { Level } from '@/content'

/**
 * Caldera poster illustrations (generated in Figma, see public/illustrations/).
 * Each one is a self-contained flat tile with its own background, so it reads as a card in both themes;
 * in dark mode `.illus` dims it slightly (index.css). Square art ships at 320/640 px, the hero at 640/1264 px.
 */
export const ART = {
  hero: { w: 1264, h: 848, small: 640 },
  'level-a1': { w: 640, h: 640, small: 320 },
  'level-a2': { w: 640, h: 640, small: 320 },
  'level-b1': { w: 640, h: 640, small: 320 },
  'level-b2': { w: 640, h: 640, small: 320 },
  'sit-home': { w: 640, h: 640, small: 320 },
  'sit-documents': { w: 640, h: 640, small: 320 },
  'sit-health': { w: 640, h: 640, small: 320 },
  'sit-food': { w: 640, h: 640, small: 320 },
  'sit-transport': { w: 640, h: 640, small: 320 },
  'sit-work': { w: 640, h: 640, small: 320 },
  'empty-review': { w: 640, h: 640, small: 320 },
  'empty-errors': { w: 640, h: 640, small: 320 },
  'not-found': { w: 640, h: 640, small: 320 },
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
