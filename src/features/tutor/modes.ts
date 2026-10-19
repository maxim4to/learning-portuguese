/** «Практика с агентом»: prompt modes per content kind (pure data). */
import { Drama, Dumbbell, GraduationCap, Layers, MessagesSquare, Newspaper, ScanSearch, Sun, type LucideIcon } from 'lucide-react'

export type TutorKind = 'topic' | 'situation' | 'reading' | 'vocab' | 'daily'

export type TopicMode = 'explain' | 'drill' | 'conversation'
export type SituationMode = 'roleplay' | 'dialogue'
export type ReadingMode = 'discuss'
export type VocabMode = 'words'
export type DailyMode = 'daily'
export type TutorModeId = TopicMode | SituationMode | ReadingMode | VocabMode | DailyMode

export interface TutorModeDef<M extends TutorModeId = TutorModeId> {
  id: M
  title: string
  /** One line for the mode card. */
  description: string
  /** Estimated duration, e.g. «20–30 мин». */
  minutes: string
  /** Outline icon from the app's single icon set (no emoji — audit §2.1). */
  icon: LucideIcon
}

export const TOPIC_MODES: TutorModeDef<TopicMode>[] = [
  {
    id: 'explain',
    title: 'Разобрать тему',
    description: 'Агент объясняет тему по шагам, проверяет понимание вопросами и завершает квизом из 10 заданий.',
    minutes: '25–35 мин',
    icon: GraduationCap,
  },
  {
    id: 'drill',
    title: 'Тренировка',
    description: '15–20 заданий разных типов по одному, с разбором ошибок, счётом и подстройкой сложности.',
    minutes: '20–30 мин',
    icon: Dumbbell,
  },
  {
    id: 'conversation',
    title: 'Разговор с темой',
    description: 'Беседа на простом pt-PT, где конструкция нужна естественно; мягкие исправления после каждой реплики.',
    minutes: '15–20 мин',
    icon: MessagesSquare,
  },
]

export const SITUATION_MODES: TutorModeDef<SituationMode>[] = [
  {
    id: 'roleplay',
    title: 'Сценка',
    description: 'Агент играет собеседника A, вы — B. После 6–8 реплик — разбор и улучшенная версия каждой вашей фразы.',
    minutes: '15–25 мин',
    icon: Drama,
  },
  {
    id: 'dialogue',
    title: 'Разбор диалога',
    description: 'Диалог по частям: фразы, регистр, особенности pt-PT, затем проверка — сможете ли сказать сами.',
    minutes: '20–30 мин',
    icon: ScanSearch,
  },
]

export const READING_MODES: TutorModeDef<ReadingMode>[] = [
  {
    id: 'discuss',
    title: 'Обсудить текст',
    description: 'Пересказ, вопросы на понимание и на мнение по-португальски, расширение словаря из глоссария.',
    minutes: '15–25 мин',
    icon: Newspaper,
  },
]

export const VOCAB_MODES: TutorModeDef<VocabMode>[] = [
  {
    id: 'words',
    title: 'Отработать слова',
    description: 'Квиз pt→ru и ru→pt с возвратом ошибок, фразы-примеры и мини-история с пропусками.',
    minutes: '15–20 мин',
    icon: Layers,
  },
]

export const DAILY_MODES: TutorModeDef<DailyMode>[] = [
  {
    id: 'daily',
    title: 'Свободная беседа дня',
    description: 'Разговор + сценка, в которых естественно нужны ваши слабые темы, и короткая прицельная тренировка.',
    minutes: '20–30 мин',
    icon: Sun,
  },
]

const ALL: TutorModeDef[] = [...TOPIC_MODES, ...SITUATION_MODES, ...READING_MODES, ...VOCAB_MODES, ...DAILY_MODES]

export function modeTitle(id: string | undefined): string {
  return ALL.find((m) => m.id === id)?.title ?? 'Сессия с агентом'
}

/** «Открыть Claude» — a plain link to a new chat (no API). */
export const CLAUDE_URL = 'https://claude.ai/new'
