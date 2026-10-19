import {
  Baby,
  Briefcase,
  Bus,
  CalendarHeart,
  Car,
  Coffee,
  Dumbbell,
  FileText,
  Home,
  Landmark,
  Mail,
  MessageCircle,
  Music,
  Package,
  Phone,
  Pill,
  Plane,
  ShoppingBasket,
  Stethoscope,
  Store,
  Sun,
  Users,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/** Scene pictogram for a situation (by id keywords; content has no icon field yet — audit P2-9). */
const RULES: [RegExp, LucideIcon][] = [
  [/cafe|futebol/, Coffee],
  [/restaurante|cozinha/, UtensilsCrossed],
  [/farmacia/, Pill],
  [/saude|medico/, Stethoscope],
  [/banco|financas/, Landmark],
  [/camara|aima|documentos/, FileText],
  [/arrendar|casa|vizinhos|condominio/, Home],
  [/mudanca|utilities|oficina/, Wrench],
  [/automovel|carro/, Car],
  [/compras-online|devolucao/, Package],
  [/reclamacao-loja|loja/, Store],
  [/supermercado|mercado/, ShoppingBasket],
  [/email/, Mail],
  [/telefonema|marcacao/, Phone],
  [/entrevista|emprego/, Briefcase],
  [/escola|creche/, Baby],
  [/fado|cultura/, Music],
  [/festas|santos/, CalendarHeart],
  [/ginasio/, Dumbbell],
  [/transportes/, Bus],
  [/viagem/, Plane],
  [/tempo|small-talk/, Sun],
  [/amigos|encontro/, Users],
]

export function sceneIcon(id: string): LucideIcon {
  return RULES.find(([re]) => re.test(id))?.[1] ?? MessageCircle
}

const TINTS = ['bg-azulejo-soft text-azulejo', 'bg-terracotta-soft text-terracotta', 'bg-sun-soft text-sun', 'bg-brand-soft text-brand-ink']

export function sceneTint(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return TINTS[Math.abs(h) % TINTS.length]
}
