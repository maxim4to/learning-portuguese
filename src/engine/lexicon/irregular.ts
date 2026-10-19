/**
 * pt-PT irregular verbs for the offline conjugator (./conjugate.ts). Content authored by hand (no API, no
 * Wiktionary). Only what differs from the regular paradigm is listed; everything else is derived:
 *
 * - presente do conjuntivo ← stem of PI 1s (faç-o → faça), unless `PC` is given;
 * - mais-que-perfeito, imperfeito / futuro do conjuntivo ← PPS 3p minus «-ram» (fize-ram → fizera, fizesse, fizer);
 * - imperativo: 2s ← PI 3s, 2p ← PI 2p minus «-s», 3s/1p/3p ← PC; `IMP` overrides single slots (sê, sede);
 * - futuro / condicional ← infinitive, or `fut` (far-ei, dir-ia);
 * - gerúndio ← infinitive (pondo), particípio ← class ending, or `pp`.
 *
 * Row = 6 slots [eu, tu, ele, nós, vós, eles]; `undefined` = derive regularly, an array = variants (ouço / oiço).
 *
 * Verb families are conjugated as prefix + base (manter = man + ter: mantenho, mantém, mantive …).
 */
import type { VerbClass } from './endings.ts'

export type Slot = string | readonly string[]
export type Row = readonly (Slot | undefined)[]

export interface IrregularSpec {
  /** Regular class for whatever is not listed (default: by the infinitive ending; pôr → 'er'). */
  cls?: VerbClass
  PI?: Row
  PPS?: Row
  II?: Row
  PC?: Row
  IMP?: Row
  /** Future / conditional stem: 'far' → farei, faria. */
  fut?: string
  /** Particípio (one or several: aceitado / aceite). */
  pp?: Slot
  /** Strong preterite with a closed «e» (lêramos, crêssemos) instead of «é» (fizéramos). */
  closedE?: boolean
}

const u = undefined

export const IRREGULAR: Record<string, IrregularSpec> = {
  ser: {
    PI: ['sou', 'és', 'é', 'somos', 'sois', 'são'],
    PPS: ['fui', 'foste', 'foi', 'fomos', 'fostes', 'foram'],
    II: ['era', 'eras', 'era', 'éramos', 'éreis', 'eram'],
    PC: ['seja', 'sejas', 'seja', 'sejamos', 'sejais', 'sejam'],
    IMP: [u, 'sê', u, u, 'sede', u],
    pp: 'sido',
  },
  estar: {
    PI: ['estou', 'estás', 'está', 'estamos', 'estais', 'estão'],
    PPS: ['estive', 'estiveste', 'esteve', 'estivemos', 'estivestes', 'estiveram'],
    PC: ['esteja', 'estejas', 'esteja', 'estejamos', 'estejais', 'estejam'],
  },
  ter: {
    PI: ['tenho', 'tens', 'tem', 'temos', 'tendes', 'têm'],
    PPS: ['tive', 'tiveste', 'teve', 'tivemos', 'tivestes', 'tiveram'],
    II: ['tinha', 'tinhas', 'tinha', 'tínhamos', 'tínheis', 'tinham'],
  },
  haver: {
    PI: ['hei', 'hás', 'há', 'havemos', 'haveis', 'hão'],
    PPS: ['houve', 'houveste', 'houve', 'houvemos', 'houvestes', 'houveram'],
    PC: ['haja', 'hajas', 'haja', 'hajamos', 'hajais', 'hajam'],
  },
  ir: {
    PI: ['vou', 'vais', 'vai', 'vamos', 'ides', 'vão'],
    PPS: ['fui', 'foste', 'foi', 'fomos', 'fostes', 'foram'],
    PC: ['vá', 'vás', 'vá', 'vamos', 'vades', 'vão'],
  },
  vir: {
    PI: ['venho', 'vens', 'vem', 'vimos', 'vindes', 'vêm'],
    PPS: ['vim', 'vieste', 'veio', 'viemos', 'viestes', 'vieram'],
    II: ['vinha', 'vinhas', 'vinha', 'vínhamos', 'vínheis', 'vinham'],
    pp: 'vindo',
  },
  fazer: {
    PI: ['faço', 'fazes', 'faz', 'fazemos', 'fazeis', 'fazem'],
    PPS: ['fiz', 'fizeste', 'fez', 'fizemos', 'fizestes', 'fizeram'],
    IMP: [u, ['faz', 'faze'], u, u, u, u],
    fut: 'far',
    pp: 'feito',
  },
  dizer: {
    PI: ['digo', 'dizes', 'diz', 'dizemos', 'dizeis', 'dizem'],
    PPS: ['disse', 'disseste', 'disse', 'dissemos', 'dissestes', 'disseram'],
    IMP: [u, ['diz', 'dize'], u, u, u, u],
    fut: 'dir',
    pp: 'dito',
  },
  trazer: {
    PI: ['trago', 'trazes', 'traz', 'trazemos', 'trazeis', 'trazem'],
    PPS: ['trouxe', 'trouxeste', 'trouxe', 'trouxemos', 'trouxestes', 'trouxeram'],
    IMP: [u, ['traz', 'traze'], u, u, u, u],
    fut: 'trar',
  },
  poder: {
    PI: ['posso', 'podes', 'pode', 'podemos', 'podeis', 'podem'],
    PPS: ['pude', 'pudeste', 'pôde', 'pudemos', 'pudestes', 'puderam'],
  },
  querer: {
    PI: ['quero', 'queres', 'quer', 'queremos', 'quereis', 'querem'],
    PPS: ['quis', 'quiseste', 'quis', 'quisemos', 'quisestes', 'quiseram'],
    PC: ['queira', 'queiras', 'queira', 'queiramos', 'queirais', 'queiram'],
    IMP: [u, ['quer', 'quere'], u, u, u, u],
  },
  requerer: {
    PI: ['requeiro', 'requeres', 'requer', 'requeremos', 'requereis', 'requerem'],
    IMP: [u, ['requer', 'requere'], u, u, u, u],
  },
  saber: {
    PI: ['sei', 'sabes', 'sabe', 'sabemos', 'sabeis', 'sabem'],
    PPS: ['soube', 'soubeste', 'soube', 'soubemos', 'soubestes', 'souberam'],
    PC: ['saiba', 'saibas', 'saiba', 'saibamos', 'saibais', 'saibam'],
  },
  caber: {
    PI: ['caibo', 'cabes', 'cabe', 'cabemos', 'cabeis', 'cabem'],
    PPS: ['coube', 'coubeste', 'coube', 'coubemos', 'coubestes', 'couberam'],
  },
  ver: {
    PI: ['vejo', 'vês', 'vê', 'vemos', 'vedes', 'veem'],
    PPS: ['vi', 'viste', 'viu', 'vimos', 'vistes', 'viram'],
    pp: 'visto',
  },
  prover: {
    PI: ['provejo', 'provês', 'provê', 'provemos', 'provedes', 'proveem'],
  },
  dar: {
    PI: ['dou', 'dás', 'dá', 'damos', 'dais', 'dão'],
    PPS: ['dei', 'deste', 'deu', 'demos', 'destes', 'deram'],
    PC: ['dê', 'dês', 'dê', ['demos', 'dêmos'], 'deis', 'deem'],
  },
  pôr: {
    cls: 'er',
    PI: ['ponho', 'pões', 'põe', 'pomos', 'pondes', 'põem'],
    PPS: ['pus', 'puseste', 'pôs', 'pusemos', 'pusestes', 'puseram'],
    II: ['punha', 'punhas', 'punha', 'púnhamos', 'púnheis', 'punham'],
    fut: 'por',
    pp: 'posto',
  },
  ler: { PI: ['leio', 'lês', 'lê', 'lemos', 'ledes', 'leem'] },
  crer: { PI: ['creio', 'crês', 'crê', 'cremos', 'credes', 'creem'] },
  ouvir: { PI: [['ouço', 'oiço'], 'ouves', 'ouve', 'ouvimos', 'ouvis', 'ouvem'] },
  pedir: { PI: ['peço'] },
  medir: { PI: ['meço'] },
  valer: { PI: ['valho'] },
  perder: { PI: ['perco'] },
  rir: {
    PI: ['rio', 'ris', 'ri', 'rimos', 'rides', 'riem'],
  },
  construir: { PI: [u, ['constróis', 'construis'], 'constrói', u, u, ['constroem', 'construem']] },
  destruir: { PI: [u, ['destróis', 'destruis'], 'destrói', u, u, ['destroem', 'destruem']] },
  reconstruir: { PI: [u, ['reconstróis', 'reconstruis'], 'reconstrói', u, u, ['reconstroem', 'reconstruem']] },
  // Verbs with a stressed hiatus vowel (accent in the stressed forms)
  reunir: {
    PI: ['reúno', 'reúnes', 'reúne', u, u, 'reúnem'],
    PC: ['reúna', 'reúnas', 'reúna', 'reunamos', 'reunais', 'reúnam'],
  },
  proibir: {
    PI: ['proíbo', 'proíbes', 'proíbe', u, u, 'proíbem'],
    PC: ['proíba', 'proíbas', 'proíba', 'proibamos', 'proibais', 'proíbam'],
  },
  saudar: {
    PI: ['saúdo', 'saúdas', 'saúda', u, u, 'saúdam'],
    PC: ['saúde', 'saúdes', 'saúde', 'saudemos', 'saudeis', 'saúdem'],
  },
  enraizar: {
    PI: ['enraízo', 'enraízas', 'enraíza', u, u, 'enraízam'],
    PC: ['enraíze', 'enraízes', 'enraíze', 'enraizemos', 'enraizeis', 'enraízem'],
  },
}

/**
 * Explicit family members: lemma → base table (prefix + base). Accents are adjusted
 * (mantém, convéns; propor without ^). Any verb ending in -por, -fazer, -dizer, -trazer, -pedir
 * is derived automatically (see SUFFIX_FAMILIES).
 */
export const FAMILIES: Record<string, readonly string[]> = {
  ter: ['manter', 'conter', 'deter', 'obter', 'reter', 'entreter', 'ater', 'suster', 'abster'],
  vir: ['convir', 'intervir', 'provir', 'advir', 'sobrevir', 'avir'],
  ver: ['prever', 'rever', 'antever', 'entrever'],
  rir: ['sorrir'],
}

/** Infinitive endings that always belong to a family: propor, satisfazer, contradizer, despedir … */
export const SUFFIX_FAMILIES: readonly string[] = ['por', 'fazer', 'dizer', 'trazer', 'pedir']

/** -iar verbs conjugated like odiar (odeio, odeie). Mnemonic MARIO: mediar, ansiar, remediar, incendiar, odiar. */
export const ODIAR: ReadonlySet<string> = new Set(['odiar', 'ansiar', 'remediar', 'incendiar', 'mediar', 'intermediar'])

/** -ir verbs with u → o in PI 2s/3s/3p (sobes, sobe, sobem; imperativo sobe). */
export const SUBIR: ReadonlySet<string> = new Set([
  'subir', 'fugir', 'sacudir', 'acudir', 'cuspir', 'consumir', 'sumir', 'entupir', 'desentupir', 'bulir', 'escapulir',
])

/** -ir verbs with e → i in all stressed PI forms and the whole PC (agrido, agrides, agrida). */
export const AGREDIR: ReadonlySet<string> = new Set(['agredir', 'prevenir', 'progredir', 'transgredir', 'regredir', 'cerzir', 'denegrir'])

/**
 * -ir verbs whose last stem vowel is e / o but that do NOT alternate (e → i, o → u) in PI 1s / PC.
 * (Most -ir verbs with e/o alternate: sentir → sinto, dormir → durmo, seguir → sigo, cobrir → cubro.)
 */
export const NO_ALTERNATION: ReadonlySet<string> = new Set(['ouvir', 'ocorrer', 'abolir', 'explodir', 'colorir', 'demolir', 'emergir', 'imergir', 'submergir'])

/**
 * Particípios: double (regular + short) or irregular-only. Keyed by lemma; the suffix map covers families
 * (descrever → descrito, descobrir → descoberto, reabrir → reaberto).
 */
export const PARTICIPLES: Record<string, readonly string[]> = {
  aceitar: ['aceitado', 'aceite'],
  entregar: ['entregado', 'entregue'],
  ganhar: ['ganho'],
  gastar: ['gasto'],
  pagar: ['pago'],
  limpar: ['limpo', 'limpado'],
  matar: ['matado', 'morto'],
  morrer: ['morrido', 'morto'],
  salvar: ['salvado', 'salvo'],
  soltar: ['soltado', 'solto'],
  secar: ['secado', 'seco'],
  juntar: ['juntado', 'junto'],
  fritar: ['fritado', 'frito'],
  enxugar: ['enxugado', 'enxuto'],
  expulsar: ['expulsado', 'expulso'],
  isentar: ['isentado', 'isento'],
  anexar: ['anexado', 'anexo'],
  acender: ['acendido', 'aceso'],
  prender: ['prendido', 'preso'],
  suspender: ['suspendido', 'suspenso'],
  eleger: ['elegido', 'eleito'],
  encher: ['enchido', 'cheio'],
  envolver: ['envolvido', 'envolto'],
  romper: ['rompido', 'roto'],
  benzer: ['benzido', 'bento'],
  imprimir: ['imprimido', 'impresso'],
  extinguir: ['extinguido', 'extinto'],
  omitir: ['omitido', 'omisso'],
  incluir: ['incluído', 'incluso'],
  frigir: ['frito'],
  bendizer: ['bendito'],
  maldizer: ['maldito'],
}

/** Participle by infinitive suffix (whole family): escrever → escrito, descobrir → descoberto. */
export const PARTICIPLE_SUFFIX: Record<string, string> = {
  screver: 'scrito',
  cobrir: 'coberto',
  abrir: 'aberto',
}
