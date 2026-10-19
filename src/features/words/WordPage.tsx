import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, BookCheck, Pencil, RotateCcw, SearchX, Trash2 } from 'lucide-react'
import { getVocabTheme, type VocabTheme } from '@/content'
import { Button, ButtonLink } from '@/components/Button'
import { cx } from '@/components/cx'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { SpeakButton } from '@/components/SpeakButton'
import { LevelBadge } from '@/components/StatusBadge'
import { useToast } from '@/components/toastContext'
import { WORD_CARD_MODES, type SrsCard, type WordCardMode, type WordEntry, type WordSource } from '@/data'
import { formatInterval, isNewCard } from '@/engine/fsrs'
import { useSettings } from '@/features/exercises/useSettings'
import { plural } from '@/features/library/format'
import { AddCardButton, GenderBadge } from '@/features/library/ui'
import { vocabHref } from '@/features/practice/paths'
import { useContentWords } from './useContentWords.ts'
import { useCanSpeak } from './audio.ts'
import { GENDER_LABEL, POS_LABEL, useLexicon } from './lexicon.ts'
import { Pt } from './Pt.tsx'
import { decodeSource, sourceHref, sourceLabel } from './source.ts'
import { MODE_UNLOCK_HINT, WORD_MODE_LABEL, modeStates, type ModeState } from './status.ts'
import { useWordActions, useWordCards, useWords, useWordStatus, type WordActionResult } from './useWords.ts'
import { WordEditor } from './WordEditor.tsx'
import { WordStatusBadge } from './WordList.tsx'
import { DictionaryLinks } from './WordSearchDialog.tsx'
import { wordPt } from './wordOps.ts'

const fmtDate = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

/** /words/:id — one dictionary word: meanings, where it was met, its cards and the staged unlock. */
export function WordPage() {
  const { id = '' } = useParams()
  const dict = useWords()
  const word = dict.index.byId.get(id)
  const cards = useWordCards(word?.id)
  const status = useWordStatus(word?.id)
  const actions = useWordActions()
  const toast = useToast()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const pt = word ? wordPt(word) : ''
  const canSpeak = useCanSpeak(pt || undefined)
  const themes = useWordThemes(word?.lexId)

  if (dict.status === 'loading') return <PageSkeleton cards={3} />
  if (dict.status === 'error') return <ErrorState text="Не удалось загрузить словарь" detail={dict.error ?? undefined} onRetry={() => void actions.reload()} />
  if (!word || !status) {
    return (
      <div className="page">
        <PageHeader back={{ to: '/words', label: 'Мой словарь' }} title="Слово не найдено" />
        <div className="card">
          <EmptyState
            icon={<SearchX className="size-7" />}
            tone="neutral"
            title="Этого слова нет в словаре"
            text="Возможно, его удалили — на этом или другом устройстве."
            action={<ButtonLink to="/words">Открыть словарь</ButtonLink>}
          />
        </div>
      </div>
    )
  }

  async function run(fn: () => Promise<WordActionResult>, text: string, after?: () => void) {
    setBusy(true)
    try {
      const { undo } = await fn()
      after?.()
      toast({ text, action: { label: 'Отменить', onClick: () => void undo() } })
    } catch (e) {
      toast({ text: `Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`, tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const w = word
  const known = w.mark === 'known'
  const toggleKnown = () =>
    known
      ? void run(() => actions.unmarkKnown(w.id), `Снова учу: ${pt}`)
      : void run(() => actions.markKnown(w.id), `Отмечено как известное: ${pt}`)
  const remove = () => void run(() => actions.deleteWords([w.id]), `Удалено из словаря: ${pt}`, () => navigate('/words', { replace: true }))

  const meta = [w.pos && POS_LABEL[w.pos], w.gender && GENDER_LABEL[w.gender]].filter(Boolean).join(' · ')
  const headerActions = (
    <>
      {canSpeak && <SpeakButton text={pt} label="Слушать" />}
      <Button variant="secondary" icon={<Pencil />} onClick={() => setEditing(true)} disabled={busy}>
        Изменить
      </Button>
    </>
  )

  return (
    <article className="page">
      <PageHeader
        back={{ to: '/words', label: 'Мой словарь' }}
        meta={
          <>
            <WordStatusBadge status={status} />
            {w.level && <LevelBadge level={w.level} />}
            {meta && <span>{meta}</span>}
          </>
        }
        title={pt}
        titleLang="pt-PT"
        actions={<div className="flex gap-2 max-sm:hidden">{headerActions}</div>}
      >
        {/* Phones: the actions get their own row so the badges keep the full width. */}
        <div className="flex flex-wrap gap-2 sm:hidden">{headerActions}</div>
      </PageHeader>

      <div className="page-grid">
        <div className="min-w-0 space-y-(--gutter)">
          <Meanings word={w} />
          <Sources sources={w.sources} />
          <Cards word={w} cards={cards} />
          <ThemeWords theme={themes[0]} self={w.id} />
        </div>

        <aside aria-labelledby="word-panel-title" className="card flex flex-col gap-4">
          <h2 id="word-panel-title">О слове</h2>
          <WordFacts word={w} cards={cards} statusLabel={<WordStatusBadge status={status} />} />
          <Themes lexId={w.lexId} themes={themes} />
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="secondary" size="sm" icon={known ? <RotateCcw /> : <BookCheck />} onClick={toggleKnown} disabled={busy}>
              {known ? 'Учить снова' : 'Знаю — не учить'}
            </Button>
            <Button variant="ghost" size="sm" icon={<Trash2 />} className="text-danger hover:bg-danger-soft hover:text-danger" onClick={remove} disabled={busy}>
              Удалить из словаря
            </Button>
          </div>
        </aside>
      </div>

      {editing && <WordEditor word={w} onClose={() => setEditing(false)} />}
    </article>
  )
}

function Meanings({ word }: { word: WordEntry }) {
  const meanings = word.ru.split(/\s*;\s*/).filter(Boolean)
  return (
    <section aria-labelledby="word-meanings" className="card space-y-4">
      <h2 id="word-meanings">{meanings.length > 1 ? 'Значения' : 'Перевод'}</h2>
      {meanings.length > 1 ? (
        <ol className="measure list-decimal space-y-1 pl-6 marker:text-ink-muted" lang="ru">
          {meanings.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ol>
      ) : (
        <p className="measure" lang="ru">
          {word.ru}
        </p>
      )}
      {word.note && <p className="measure rounded-control bg-surface-2 p-4 text-sm">{word.note}</p>}
      {!word.lexId && (
        <div className="space-y-1">
          <p className="text-sm text-ink-muted">Этого слова нет в словаре приложения — перевод ваш.</p>
          <DictionaryLinks lemma={word.lemma} />
        </div>
      )}
    </section>
  )
}

function Sources({ sources }: { sources: readonly WordSource[] }) {
  const list = [...sources].reverse()
  return (
    <section aria-labelledby="word-sources" className="card space-y-4">
      <h2 id="word-sources">Где встретилось</h2>
      {list.length === 0 ? (
        <p className="text-sm text-ink-muted">Источник не сохранён.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((s, i) => (
            <SourceItem key={`${s.src}:${s.form}:${i}`} source={s} />
          ))}
        </ul>
      )}
    </section>
  )
}

function SourceItem({ source: s }: { source: WordSource }) {
  const href = sourceHref(s.src)
  const label = sourceLabel(s.src)
  const canSpeak = useCanSpeak(s.sentence)
  return (
    <li className="space-y-1 py-3 first:pt-0 last:pb-0">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        {href ? (
          <Link to={href} className="font-semibold">
            {label}
          </Link>
        ) : (
          <span className="font-semibold">{label}</span>
        )}
        <span className="text-sm text-ink-muted tabular-nums">{fmtDate(s.at)}</span>
      </p>
      {s.sentence && (
        <div className="flex items-start gap-2">
          <Pt as="p" src={decodeSource(s.src)} ru={s.sentenceRu} className="measure min-w-0 flex-1 pt-1.5 font-pt">
            {s.sentence}
          </Pt>
          {canSpeak && <SpeakButton text={s.sentence} size="sm" variant="ghost" ariaLabel="Прослушать пример" />}
        </div>
      )}
      {s.sentenceRu && (
        <p className="measure text-sm text-ink-muted" lang="ru">
          {s.sentenceRu}
        </p>
      )}
    </li>
  )
}

/** What a mode row says for each state (the unlock hint is shown until the card exists). */
function modeNote(mode: WordCardMode, state: ModeState, word: WordEntry, enabled: readonly WordCardMode[]): string {
  switch (state) {
    case 'ready':
      return 'Условие выполнено — карточка появится после следующего повторения'
    case 'locked':
      return `Откроется${MODE_UNLOCK_HINT[mode].startsWith('когда') ? ',' : ''} ${MODE_UNLOCK_HINT[mode]}`
    case 'unavailable':
      return mode === 'cloze' ? 'Нужен пример из источника' : 'Нет записи и голоса pt-PT на этом устройстве'
    case 'disabled':
      if (word.mark === 'known') return 'Слово отмечено как известное'
      if (!enabled.includes(mode)) return 'Выключено в настройках для всех слов'
      return 'Выключено для этого слова'
    default:
      return ''
  }
}

function cardLine(c: SrsCard, now: number): { main: string; sub: string } {
  if (c.suspended) return { main: 'Приостановлена', sub: `повторений ${c.fsrs.reps}` }
  if (isNewCard(c)) return { main: 'Ждёт первого повторения', sub: 'новая карточка' }
  const due = c.fsrs.due - now
  return {
    main: due <= 0 ? 'Пора повторить' : `Повтор через ${formatInterval(due)}`,
    sub: [`держится ≈ ${formatInterval(c.fsrs.stability * 86_400_000)}`, `повторений ${c.fsrs.reps}`, c.fsrs.lapses ? `ошибок ${c.fsrs.lapses}` : '']
      .filter(Boolean)
      .join(' · '),
  }
}

const DOT: Record<ModeState, string> = {
  active: 'bg-brand',
  ready: 'bg-sun-fill ring-1 ring-inset ring-ink/35',
  locked: 'bg-surface ring-[1.5px] ring-inset ring-line-strong',
  unavailable: 'bg-surface-2',
  disabled: 'bg-surface-2',
}

function Cards({ word, cards }: { word: WordEntry; cards: readonly SrsCard[] }) {
  const settings = useSettings()
  const canListen = useCanSpeak(wordPt(word))
  const [now] = useState(() => Date.now())
  const states = useMemo(
    () => modeStates(word, cards, { enabledModes: settings.wordModes, canListen }),
    [word, cards, settings.wordModes, canListen],
  )
  const byMode = new Map(cards.map((c) => [c.mode, c]))
  return (
    <section aria-labelledby="word-cards" className="card space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="word-cards">Карточки</h2>
        <span className="text-sm text-ink-muted">
          {cards.length} из {WORD_CARD_MODES.length} · открываются по очереди
        </span>
      </div>
      <ol className="divide-y divide-line">
        {WORD_CARD_MODES.map((m, i) => {
          const state = states[m]
          const card = byMode.get(m)
          const line = card ? cardLine(card, now) : null
          return (
            <li key={m} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span aria-hidden className={cx('mt-1.5 size-2.5 shrink-0 rounded-full', DOT[state])} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  <span className="sr-only">Шаг {i + 1}: </span>
                  {WORD_MODE_LABEL[m]}
                </p>
                <p className="text-sm text-ink-muted">{line ? line.sub : modeNote(m, state, word, settings.wordModes)}</p>
              </div>
              <p className={cx('shrink-0 text-right text-sm tabular-nums', line ? 'font-semibold text-ink' : 'text-ink-muted')}>
                {line ? line.main : state === 'ready' ? 'скоро' : state === 'locked' ? 'закрыта' : '—'}
              </p>
            </li>
          )
        })}
      </ol>
      {cards.length > 0 && (
        <ButtonLink to="/review" variant="secondary" size="sm">
          К повторению
        </ButtonLink>
      )}
    </section>
  )
}

function WordFacts({ word, cards, statusLabel }: { word: WordEntry; cards: readonly SrsCard[]; statusLabel: ReactNode }) {
  const row = 'flex items-baseline justify-between gap-3 py-1.5'
  const val = 'text-right font-semibold text-ink'
  const dash = <span className="font-normal text-ink-muted">—</span>
  return (
    <dl className="text-sm text-ink-muted">
      <div className={cx(row, 'items-center')}>
        <dt>Статус</dt>
        <dd>{statusLabel}</dd>
      </div>
      <div className={row}>
        <dt>Уровень</dt>
        <dd className={val}>{word.level ?? dash}</dd>
      </div>
      <div className={row}>
        <dt>Часть речи</dt>
        <dd className={val}>{word.pos ? POS_LABEL[word.pos] : dash}</dd>
      </div>
      <div className={row}>
        <dt>Род</dt>
        <dd className={val}>{word.gender ? GENDER_LABEL[word.gender] : dash}</dd>
      </div>
      <div className={row}>
        <dt>Карточек</dt>
        <dd className={cx(val, 'tabular-nums')}>{cards.length}</dd>
      </div>
      <div className={row}>
        <dt>Добавлено</dt>
        <dd className={cx(val, 'tabular-nums')}>{fmtDate(word.createdAt)}</dd>
      </div>
      <div className={row}>
        <dt>В словаре приложения</dt>
        <dd className={val}>{word.lexId ? 'есть' : 'нет'}</dd>
      </div>
    </dl>
  )
}

/** Vocab themes of a lemma (from the lexicon), in course order of level. */
function useWordThemes(lexId?: string): VocabTheme[] {
  const { lex } = useLexicon()
  return useMemo(() => {
    if (!lexId || !lex) return []
    return lex
      .themesOf(lexId)
      .filter((k) => k.startsWith('vocab:'))
      .map((k) => getVocabTheme(k.slice('vocab:'.length)))
      .filter((t): t is VocabTheme => !!t)
  }, [lex, lexId])
}

/** «Есть в темах» (vocab themes) and «Ещё встречается» (situations, texts) — where the lexicon has this lemma. */
function Themes({ lexId, themes }: { lexId?: string; themes: readonly VocabTheme[] }) {
  const { lex } = useLexicon()
  const keys = lexId && lex ? lex.themesOf(lexId).filter((k) => !k.startsWith('vocab:')) : []
  const other = keys.map((k) => ({ k, href: sourceHref(k), label: sourceLabel(k) })).filter((x) => x.href)
  if (!themes.length && !other.length) return null
  return (
    <>
      {themes.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-ink-muted">Есть в темах</h3>
          <ul className="space-y-2 text-sm">
            {themes.map((t) => (
              <li key={t.id} className="flex items-baseline justify-between gap-3">
                <Link to={vocabHref(t.id)} className="leading-6">
                  {t.title}
                </Link>
                {t.level && <LevelBadge level={t.level} />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {other.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-ink-muted">Ещё встречается</h3>
          <ul className="space-y-2 text-sm">
            {other.slice(0, 6).map((x) => (
              <li key={x.k}>
                <Link to={x.href!} className="leading-6">
                  {x.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

const THEME_WORDS = 5
const NO_WORDS: never[] = []

/**
 * «Другие слова темы»: up to 5 words of the word's first vocab theme that are not in the dictionary yet, each with
 * «+ в словарь». The list is fixed when it first appears, so a saved word turns into ✓ instead of vanishing.
 */
function ThemeWords({ theme, self }: { theme: VocabTheme | undefined; self: string }) {
  const dict = useContentWords(theme?.words ?? NO_WORDS, {
    themeKey: `vocab:${theme?.id ?? ''}`,
    src: `vocab:${theme?.id ?? ''}`,
    level: theme?.level,
  })
  const [picked, setPicked] = useState<{ theme: string; idx: number[] } | null>(null)
  if (theme && dict.ready && dict.ids && picked?.theme !== theme.id) {
    const idx = dict.missing.filter((i) => dict.ids![i] !== self).slice(0, THEME_WORDS)
    setPicked({ theme: theme.id, idx })
  }
  if (!theme || !picked || picked.theme !== theme.id) return null
  const total = theme.words.length
  const inDict = total - dict.missing.length
  return (
    <section aria-labelledby="word-theme-words" className="card space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="word-theme-words">Другие слова темы</h2>
        <Link to={vocabHref(theme.id)} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold">
          {theme.title} <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      {picked.idx.length === 0 ? (
        <p className="text-sm text-ink-muted">Все слова темы уже в словаре ({inDict} из {total}).</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {picked.idx.map((i) => {
              const w = theme.words[i]
              return (
                <li key={i} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                  <p className="min-w-0 flex-1 pt-2.5">
                    <Pt src={{ kind: 'vocab', id: theme.id, part: 'examples', index: i }} ru={w.ru} className="font-semibold">
                      {w.pt}
                    </Pt>{' '}
                    <GenderBadge gender={w.gender} />
                    <span aria-hidden className="text-ink-subtle">
                      {' — '}
                    </span>
                    <span lang="ru">{w.ru}</span>
                  </p>
                  <AddCardButton
                    variant="text"
                    target="words"
                    name={w.pt}
                    added={!!dict.saved?.[i]}
                    disabled={dict.busy || !dict.ready}
                    onClick={() => void dict.add([i])}
                  />
                </li>
              )
            })}
          </ul>
          <p className="text-sm text-ink-muted">
            В словаре {inDict} из {plural(total, 'слова', 'слов', 'слов')} темы.
          </p>
        </>
      )}
    </section>
  )
}
