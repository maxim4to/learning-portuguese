# Личный словарь: захват слов на всём сайте и полный цикл их изучения (проект)

Документ для репозитория `/Users/m.ivanov/Projects/learning-portuguese`. Предлагаемое место хранения: `docs/personal-dictionary.md`.

---

## 0. Что уже есть в коде (на это опирается проект)

**Карточки повторения (SRS).**
- `SrsCard` в `src/data/types.ts` имеет `kind: 'word' | 'phrase' | 'grammar' | 'error'`.
- У карточек `word`, `phrase` и `grammar` сторона `front` всегда на русском, `back` на pt-PT. `CardFace.tsx` показывает их как переворачиваемую карточку.
- Карточки `error` проверяются через исходное упражнение (`ReviewExercise`), а оценка предлагается по ответу (`suggestRating`).

**Как сейчас работает «Добавить в повторение».** Есть три независимые копии одной логики:
- `src/features/library/cards.ts`: функции `useLibraryCards` и `addLibraryCards`. Id карточек `w:<themeId>:<index>` для тем и `g:<readingId>:<index>` для глоссария текстов.
- `src/features/situations/persist.ts` и `useSituationCards.ts`: id `w:<situationId>:<i>` и `ph:<situationId>:<i>`.
- `src/features/lessons/persist.ts`: карточки `grammar` из примеров темы.

Id построены на **индексе** в массиве. Если вставить слово в середину темы, привязка всех следующих карточек сдвигается.

**Расписание и лимиты.**
- `src/engine/fsrs.ts` → `dueCards()`: сначала просроченные повторения, затем новые карточки (самые старые первыми) в пределах `newPerDay − newSeenToday`. Новые вставляются примерно каждой четвёртой позицией.
- Счётчик новых за день хранится на устройстве в `localStorage` (`src/features/srs/newCardCounter.ts`).

**Глоссарий.**
- `ReadingPage.tsx` вместе с `highlight.ts` (`makeSegmenter`) подчёркивает слова глоссария. Нажатие открывает `GlossaryPopover.tsx`: pt, аудио, ru и кнопка «+ в повторение».
- Позиционирование и закрытие поповера (Esc, клик снаружи, прокрутка, уход фокуса) уже решены — их стоит переиспользовать.

**Готовые словарные данные с переводами.** Около 561 слова в `content/vocab/*.json` (`pt` с артиклем, `ru`, `gender`, `example`). Плюс `situations[].vocab` и `phrases`, `reading[].glossary`. Общий корпус pt-текстов: около 66 тыс. словоупотреблений и **около 7 тыс. уникальных словоформ** (без markdown-теории).

**Разметка `lang="pt-PT"` уже стоит почти везде:** диалоги, фразы, лексика, примеры, задания (`FillGap`, `Choice`, `Transform`, `OrderWords`, `Match`, `ListenType`, `SpeakShadow`, `TextAnswer`), `ExerciseFeedback`, `CardFace`, `CardList`, `ResultScreen`, `WritingSection`, `PageHeader titleLang`. Её нет в markdown (теория, шпаргалки, `explanation`): там pt-примеры стоят внутри русского текста.

**Данные пользователя.**
- `ProgressRepository` с двумя реализациями: `FirestoreRepository` (`users/{uid}/{progress|cards|errors}`, `meta/settings`; запись через `fire()` без ожидания) и `LocalRepository` (ключи `ptpt:v1:*`).
- `firestore.rules` разрешает всё под `users/{uid}/{document=**}` владельцу (проверка по email).
- Тесты правил: `scripts/rules.test.ts`.

**Контент и аудио.**
- `src/content/index.ts` подключает **eager glob** `'/content/**/*.json'`. Любой JSON в `content/` попадёт в основной бандл.
- Аудио: `public/audio/<sha1>.mp3` (2385 файлов, 51 МБ), запасной вариант — Web Speech только с голосом pt-PT. Сервис-воркер кэширует mp3 при первом запросе.

**Ограничения, которые нельзя сломать.**
- `ReviewSession`, `ExerciseRunner` и `DialogueSection` вешают глобальные обработчики клавиатуры (Space, Enter, 1–4, 1–9).
- Строка диалога целиком — это `<button>`, переключающий перевод.
- `Layout.useDueCount` и все `use*Cards` вызывают `repo.getCards()`. В Firestore это оплачиваемые чтения, а на тарифе Spark лимит 50 тыс. чтений в сутки.

---

## 1. Захват слова (UX)

### 1.1 Общий принцип: перехват на уровне документа, а не обёртка каждого слова

Не нужно резать тексты на `<span>` для каждого слова. Один глобальный `WordCaptureProvider` (монтируется в `Layout`) слушает `pointerup`, `selectionchange` и `keydown` на `document`. Порядок работы:

1. По точке касания или выделению находит текстовый узел и смещение. Используется `document.caretPositionFromPoint` с запасным вариантом `caretRangeFromPoint` для Safari.
2. Проверяет, можно ли здесь искать слово. Ближайший предок должен иметь `[lang^="pt"]`, а не должен иметь `[data-lookup="off"]`. Отдельные правила для интерактивных элементов описаны в п. 1.3.
3. Границы слова определяет `Intl.Segmenter('pt-PT', { granularity: 'word' })`. Через дефис склеиваются формы с местоимениями (`levanto-me`, `dá-lo`, `dir-lhe-ei`) и составные слова (`pequeno-almoço`).
4. Контекст: ближайший `[data-pt-src]` (источник) и `[data-pt-ru]` (перевод предложения). Предложение вырезается через `Intl.Segmenter(..., { granularity: 'sentence' })`, не длиннее 300 символов.
5. Подсветка выбранного слова — через CSS Custom Highlight API (`CSS.highlights.set('lookup-active', new Highlight(range))`). DOM не меняется. Поддержка: Chrome 105+, Safari 17.2+, Firefox 140+. Без поддержки просто нет подсветки.

Поэтому почти все поверхности получают функцию бесплатно: `lang="pt-PT"` уже стоит. Компонент `<Pt>` нужен только для **контекста** (источник и перевод) и для мест, где атрибута нет.

### 1.2 Жесты

| Платформа | Жест | Результат |
|---|---|---|
| Любая | Клик или тап по слову в **неинтерактивном** pt-тексте (движение < 8 px, < 500 мс, нет выделения) | Открывается карточка слова |
| Десктоп | Двойной клик (нативно выделяет слово) | Карточка слова сразу |
| Десктоп | Выделение мышью нескольких слов | Рядом с концом выделения плавающая кнопка «Перевести · В словарь» (`SelectionChip`). Копирование не ломается: карточка открывается только по нажатию кнопки |
| Мобильный | Долгое нажатие (нативное выделение с «ручками») | Через 400 мс после стабилизации `selectionchange` снизу появляется полоса «Перевести «…»». Системное меню iOS остаётся у выделения, конфликта нет. Тап по полосе открывает шторку |
| Любая | Выделение внутри русского текста или markdown (теория, шпаргалки) | Работает, если в выделении нет кириллицы и оно ≤ 6 слов. Тап по одиночному слову там не работает, потому что нет `lang` |
| Клавиатура | `/` или `Ctrl/⌘+K` (не в поле ввода) | Глобальный поиск слова: шторка с полем, поиск по лексикону, добавление |
| Клавиатура | Выделение `Shift+стрелками` (режим каретки F7) | То же, что выделение мышью. Esc закрывает карточку и возвращает фокус |
| Карточка слова | Кнопка «Все слова фразы» | Слова предложения как список кнопок: доступный с клавиатуры и экранного диктора способ разобрать любую фразу без мыши |

Настройка «Перевод по нажатию на слово» (`lookupOnTap`, по умолчанию включена) отключает одиночный тап. Выделение и поиск работают всегда.

Первое использование: однократная подсказка в `DialogueSection` и `ReadingPage`: «Нажмите на любое слово — перевод и „в словарь“». Флаг хранится в localStorage.

### 1.3 Интерактивные элементы и упражнения (защита ответа)

- Тап **не** перехватывается, если цель внутри `button, a, input, textarea, select, label, summary, [role=button], [contenteditable]`. Выделение внутри таких элементов тоже игнорируется.
- **Диалог.** Сейчас `DialogueSection.tsx` делает всю реплику кнопкой. Предлагается: pt-текст реплики — обычный `<p>`, по нему работает тап по слову. Перевод показывается и скрывается отдельной кнопкой-иконкой `Languages` у реплики (`aria-expanded`, `aria-controls`) или общим тумблером в тулбаре, который уже есть. Подпись «Нажмите на реплику…» меняется на «Нажмите на слово — перевод; значок 文A — перевод реплики». **Это изменение UX: см. вопрос 1 в разделе 7.**
- **Ответ упражнения не раскрываем.** `ExerciseRunner`, `ReviewExercise` и `DiagnosticPage` ставят на контейнер задания `data-lookup={locked ? 'on' : 'off'}`. До ответа поиск выключен (иначе перевод вариантов в `Choice` или `Match` подсказывает ответ). После ответа работает на промпте, вариантах, строке «Верно» в `ExerciseFeedback` и `explanation`. Это главное место, откуда пользователь будет сохранять незнакомые слова.
- **Диагностика:** `data-lookup="off"` всегда.
- **Повторение:** лицевая сторона карточки получает `data-lookup="off"` до «Показать ответ».
- **Глобальные горячие клавиши.** `WordCaptureProvider` отдаёт `useLookupOpen()`, а также ставит `document.body.dataset.lookupOpen`. Обработчики в `ReviewSession.tsx`, `ExerciseRunner.tsx`, `DialogueSection.tsx`, `VocabQuiz.tsx` и `TextAnswer` первой строкой делают `if (document.body.dataset.lookupOpen) return`. Это нужно, чтобы «1» не ставила оценку, пока открыта карточка слова.

### 1.4 Карточка слова (`LookupCard`)

На экранах шире 640 px с `pointer: fine` это поповер (`LookupPopover`, логика позиционирования из `GlossaryPopover`). На узких и сенсорных — шторка снизу (`LookupSheet`, выше таб-бара, `<dialog>` с `showModal()`, ручка, свайп вниз закрывает).

Содержимое сверху вниз:

1. **Заголовок.** Увиденная форма → лемма: `levanto-me → levantar-se`. Кнопка `SpeakButton` для леммы, `lang="pt-PT"`. Чипы: часть речи (`глагол`), род с артиклем через существующий `GenderBadge` (`м · o`), `LevelBadge`.
2. **Строка формы.** «presente do indicativo, eu + me (возвратный)», «стяжение: em + a», «мн. ч. от o pão → os pães», «ж. р. от cansado».
3. **Значения.** Список `ru[]` из лексикона; переключаемые чипы выбирают, какие значения сохранить (первое выбрано). Если слово пришло из глоссария, темы или лексики ситуации, контекстный перевод идёт первым и помечен «в этом тексте». Под списком поле «Свой перевод».
4. **Контекст.** Предложение источника, форма выделена жирным. `sentenceRu`, если есть (реплика диалога, пример, лексика с примером). Маленькая `SpeakButton` для предложения (у реплик и примеров уже есть mp3).
5. **Ссылки.** «Есть в теме «Здоровье» →» (`/library/vocab/saude`) и в ситуациях. Внешние ссылки: «Infopédia PT–RU» (`https://www.infopedia.pt/dicionarios/portugues-russo/<lemma>`), «Priberam» (толковый pt-PT). Это не runtime-AI, а просто ссылки; `rel="noreferrer"`.
6. **Другие разборы** (если форма неоднозначна: `como` — «comer, eu» / «как»; `era` — «ser» / «эра»). Ссылки «Другой вариант: …» переключают карточку.
7. **Действия.**
   - Слово не сохранено: основная кнопка «Добавить в словарь». Вторичная: «Знаю — не учить», которая сохраняет запись с `mark: 'known'` без карточек, нужно для подсветки «знакомых».
   - Слово уже сохранено: чип статуса («Учу · 2 карточки», «Знаю»), кнопки «Открыть в словаре», «Сохранить этот пример» (добавляет источник к записи), «Изменить».
   - Выделено целое предложение или реплика: «Сохранить как фразу» (`pos: 'phrase'`), перевод из `data-pt-ru`.
8. **Слово не найдено в лексиконе.** Заголовок «Нет в словаре приложения». Поля: лемма (предзаполнена формой в нижнем регистре), часть речи (необязательно), род, перевод (пустой; рядом серым перевод предложения как подсказка, если он есть). Ссылки Infopédia и Priberam. Кнопка «Сохранить».

После сохранения: тост через существующий `useToast` («Добавлено в словарь: levantar-se») и кнопка «Отменить», которая удаляет запись и карточки.

**Доступность.**
- `role="dialog"` с `aria-labelledby` на заголовок.
- Если карточка открыта с клавиатуры, фокус уходит на первую кнопку; Esc возвращает фокус к источнику.
- В шторке фокус заперт внутри (`<dialog>`).
- Подсветка через Highlight API дублируется текстом: для экранного диктора «Выбрано слово «…»» через `aria-live="polite"`.
- Всё доступно без жестов через поиск `/` и «Все слова фразы».
- Высота целей не меньше 44 px; учитывается `prefers-reduced-motion`.

### 1.5 Общий компонент `<Pt>`

Файл `src/features/words/Pt.tsx`:

```tsx
export interface PtSource {
  kind: 'situation' | 'reading' | 'topic' | 'vocab' | 'exercise' | 'cheatsheet' | 'review' | 'writing'
  id: string                 // id контента (situation/reading/topic/theme/exercise)
  part?: string              // 'dialogue' | 'phrases' | 'vocab' | 'examples' | 'paragraph' | 'feedback' …
  index?: number             // номер реплики/абзаца/примера
}
type PtProps<T extends ElementType = 'span'> = {
  as?: T; src?: PtSource; ru?: string; lookup?: boolean /* false → data-lookup="off" */
} & ComponentPropsWithoutRef<T>

export function Pt({ as, src, ru, lookup = true, ...rest }: PtProps) {
  const Tag = as ?? 'span'
  return <Tag lang="pt-PT" data-pt-src={src ? encodeSource(src) : undefined}
              data-pt-ru={ru} data-lookup={lookup ? undefined : 'off'} {...rest} />
}
```

Рядом `src/features/words/source.ts`:
- `encodeSource` / `decodeSource` в формате `kind:id:part:index`;
- `sourceHref(src)`: например `/situation/<id>?tab=dialogue#dlg-line-<i>`, `/library/reading/<id>#p-<i>`, `/topic/<id>?tab=examples`; для упражнения — через `findExercise`: тема → `/topic/<ownerId>?tab=exercises`, ситуация → `?tab=exercises`;
- `sourceLabel(src)`: «Ситуация «В кафе», реплика 3».

**Поверхности, где существующий `lang="pt-PT"` заменяется на `<Pt>` (добавляются `src` и `ru`):**

| Файл | Что |
|---|---|
| `src/features/situations/DialogueSection.tsx` | Реплика: `src={kind:'situation',part:'dialogue',index:i}`, `ru={line.ru}`. Плюс переделка кнопки (п. 1.3) и `id="dlg-line-i"` для ссылки-якоря |
| `src/features/situations/StudySections.tsx` | `PhrasesSection` (`ru=p.ru`); `VocabSection`: слово и пример (`ru=w.ru`) |
| `src/features/situations/WritingSection.tsx` | Образец ответа (`part:'writing'`). У `textarea` `data-lookup="off"` (это ввод) |
| `src/features/library/ReadingPage.tsx` | Абзацы (`part:'paragraph'`, `index`, `id="p-i"`); список глоссария |
| `src/features/library/VocabThemePage.tsx` | Слово (`ru=w.ru`), пример |
| `src/features/library/VocabQuiz.tsx` | Сторона карточки после переворота (до переворота `lookup={false}`) |
| `src/features/library/LibraryPage.tsx`, `src/features/situations/SituationsPage.tsx`, `src/features/syllabus/SyllabusPage.tsx`, `src/features/tutor/TutorHubPage.tsx` | pt-подзаголовки внутри ссылок: тап не срабатывает (это `a`), выделение тоже. Менять не нужно |
| `src/features/lessons/ExamplesSection.tsx` | Примеры (`kind:'topic',part:'examples'`, `ru=ex.ru`) |
| `src/features/lessons/TopicHeader.tsx`, `src/components/PageHeader.tsx` (`titleLang`) | Заголовки: работает как есть |
| `src/features/lessons/ResultScreen.tsx` | Разбор ошибок (`kind:'exercise'`) |
| `src/features/exercises/kinds/*.tsx` (`FillGap`, `Choice`, `Transform`, `OrderWords`, `Match`, `ListenType`, `SpeakShadow`, `TranslateRuPt`) | Без изменений разметки. Источник задаёт контейнер `ExerciseRunner` / `ReviewExercise` (`data-pt-src="exercise:<id>"`, `data-lookup`). `SpeakShadow` и `FillGap`: `ru` передаётся через `data-pt-ru` на промпте |
| `src/features/exercises/ExerciseFeedback.tsx` | Строки `Row` и пары `Match` наследуют источник от контейнера |
| `src/features/exercises/TextAnswer.tsx` | У `input`: `data-lookup="off"` (уже исключено правилом для `input`) |
| `src/features/srs/CardFace.tsx` | Обратная сторона и пример (`kind:'review'`); лицевая сторона `lookup={false}` |
| `src/features/srs/CardList.tsx` | pt-строки списка (работает как есть) |
| `src/components/Markdown.tsx` | Добавить проп `pt?: boolean`. Для теории, шпаргалок и explanation (`CheatsheetPage.tsx`, `TopicPage`, `ExerciseFeedback`) ставить `data-pt-src` контейнера. Работает только выделение (без кириллицы) |
| `src/features/dashboard/DashboardPage.tsx` | Блок «Последние ошибки» (`dd lang`): работает как есть |

---

## 2. Данные: переводы и леммы без runtime-AI

### 2.1 Ключевой факт

Весь pt-текст приложения статичен и лежит в `content/`. Значит, **каждую словоформу корпуса (около 7 тыс.) можно разобрать заранее**, офлайн, и проверить покрытие на 100 % в `npm run validate`. Подбирать лемму во время работы нужно только для markdown-теории и ручного поиска.

### 2.2 Источник истины для авторов: `content/lexicon/`

Важно: каталог должен быть **исключён** из eager glob `src/content/index.ts`:

```ts
import.meta.glob(['/content/**/*.json', '!/content/lexicon/**'], { eager: true, import: 'default' })
```

Иначе лексикон попадёт в основной бандл. В `scripts/validate.ts` и `scripts/tts.ts` этот каталог тоже нужно пропускать или обрабатывать отдельно.

Файлы `content/lexicon/<буква>.json`. Новая схема в `src/content/schema.ts`, раздел «Lexicon», объекты строгие:

```ts
export const LexPosSchema = z.enum(['noun','verb','adj','adv','prep','pron','det','conj','num','interj','phrase'])
export const LexEntrySchema = z.strictObject({
  lemma: nonEmpty,                       // 'autocarro', 'levantar-se', 'ter de', 'pequeno-almoço'
  pos: LexPosSchema,
  /** Разведение омографов: id = lemma#pos[#n] */
  sense: z.number().int().min(2).optional(),
  ru: z.array(nonEmpty).min(1),          // значения, частотное первым
  gender: z.enum(['m','f','mf']).optional(),
  plural: nonEmpty.optional(),           // только нерегулярное
  fem: nonEmpty.optional(),              // adj/noun: ж. р., если нерегулярный
  /** Глагол: парадигма. 'reg' (по окончанию) или имя таблицы из scripts/lexicon/irregular.ts */
  conj: nonEmpty.optional(),
  reflexive: z.boolean().optional(),
  /** Явные доп. формы (формы, которые не генерируются правилами). */
  forms: z.array(nonEmpty).optional(),
  level: LevelSchema.optional(),
  /** pt-BR вариант, если отличается (для подсказки «в Бразилии: ônibus»). */
  br: nonEmpty.optional(),
  note: nonEmpty.optional(),             // ru, коротко: «только pt-PT», «разг.»
})
export const LexiconFileSchema = z.strictObject({ entries: z.array(LexEntrySchema) })
```

### 2.3 Офлайн-скрипт `scripts/lexicon.ts` (`npm run lexicon -- <cmd>`)

**`seed`** (однократно, затем по необходимости). Импортирует уже проверенные данные:
- `vocab/*.json`: лемма без артикля (`a saúde` → `saúde`, `gender` берётся из контента; `o utente / a utente` → `utente` с `mf`);
- `situations[].vocab`, `reading[].glossary`;
- `phrases` с `pos:'phrase'`.

Переводы `ru` берутся из контента. Это около 1 500 лемм с качественными переводами и без новых затрат.

**`extract`.** Токенизирует весь pt-корпус, используя тот же `src/engine/lexicon/normalize.ts`, что и приложение. Разбирает каждую форму:
- стяжения;
- местоимения через дефис;
- генерацию форм из лемм (спряжение и склонение, п. 2.4).

Неразобранные формы записываются в `content/lexicon/_todo.json` в виде `{ form, count, examples: [предложение + источник] }`.

Авторы (тот же офлайн-процесс, которым сейчас готовится контент, плюс ручная проверка) добавляют недостающие леммы. Сгенерированные записи помечаются для проверки линтером бразилизмов: `scripts/brazilianisms.ts` нужно прогнать по `lemma`, `forms` и `ru`.

**`build`.** Собирает компактный рантайм-артефакт `src/generated/lexicon.json`. Файл генерируется и коммитится, так же как `public/audio`:

```ts
interface LexiconBundle {
  v: 1
  /** entries[i] = [id, lemma, pos, ru(«; »-joined), gender|'' , level|'', flags, themes?] */
  entries: [string, string, string, string, string, string, number, string[]?][]
  /** нормализованная форма → [[entryIndex, morphTag], …] (только формы, встреченные в корпусе + леммы) */
  forms: Record<string, [number, string][]>
  /** id словарной темы/ситуации → индексы лемм (обратные ссылки на темы) */
  themes: Record<string, number[]>
  /** id леммы, для которых есть pre-generated mp3 */
  audio?: number[]
}
```

- `morphTag` — компактный код: `PI1s` (presente indicativo, 1 л. ед. ч.), `PPS3p`, `IMP2s`, `GER`, `PP`, `PL` (мн. ч.), `F` (ж. р.), `C:de+o` (стяжение), `+me` (местоимение).
- Русские подписи кодов: `src/engine/lexicon/morph.ts`.

**`report`.** Покрытие по уровням, число неоднозначных форм, форм без леммы.

**Интеграция в `scripts/validate.ts`.**
- Новая проверка «каждая форма корпуса разобрана». Пока лексикон наполняется — предупреждение; после фазы 4 — ошибка.
- Проверка «бандл не устарел»: хэш входных файлов записывается в `src/generated/lexicon.json`. Если он не совпадает, ошибка «запустите npm run lexicon -- build».

### 2.4 Словоформа → лемма для pt-PT

Общий модуль без DOM и без `import.meta`, с относительными импортами, как `audioHash.ts`: `src/engine/lexicon/normalize.ts`. Его используют и скрипт, и приложение.

- `normalizeForm`: NFC, нижний регистр, апострофы и типографские дефисы приводятся к одному виду, пунктуация по краям отрезается.
- **Стяжения** (фиксированная таблица): `do/da/dos/das` = de+артикль; `no/na/nos/nas` = em+артикль; `ao/aos/à/às`; `pelo/pela/pelos/pelas`; `num/numa/nuns/numas`; `dum/duma`; `deste/desta/disto`, `neste…`, `nesse…`, `naquele…`, `daquele…`, `àquele…`; `dele/dela/deles/delas`, `nele…`; `donde`, `daí`, `daqui`.
- **Местоимения через дефис.**
  - Энклиза: `levanto-me`, `chama-se`, `dá-me`, `diz-lhe`, `vê-los`. Если от глагола отделились `-lo/-la/-los/-las`, восстанавливается окончание: `fazê-lo` → `fazer`, `comprá-lo` → `comprar`, `parti-lo` → `partir`, `pô-lo` → `pôr`.
  - Мезоклиза: `dir-lhe-ei` → `direi` (futuro от `dizer`), `far-se-ia` → `faria`.
  - Местоимения: `me, te, se, nos, vos, lhe, lhes, o, a, os, as, lo, la, no, na, mo, ma, to, lho, lha…`.
  - Если отделено `-se/-me/-te/-nos/-vos`, сначала ищется лемма с `-se` (`levantar-se`), затем без него.
- **Генерация форм (только в скрипте):**
  - `scripts/lexicon/conjugate.ts`: правильные `-ar`, `-er`, `-ir` по всем временам, включая pt-PT-специфичное: pretérito perfeito 1-го л. мн. ч. `-ámos`, futuro do conjuntivo, infinitivo pessoal, imperativo, gerúndio, particípio. Орфографические чередования: `-car` → `-qu-`, `-gar` → `-gu-`, `-çar` → `-c-`, `-cer` → `-ç-`, `-ger/-gir` → `-j-`, `-guir` → `-g-`.
  - `scripts/lexicon/irregular.ts`: таблицы для около 60 глаголов (`ser, estar, ter, haver, ir, vir, fazer, dizer, poder, querer, saber, dar, ver, pôr, trazer, ler, crer, ouvir, pedir, medir, dormir, sair, cair, valer, perder, caber, rir, sorrir, seguir, servir, sentir, preferir, subir, fugir, construir, destruir, odiar, passear, recear, frear…`) и производных (`propor`, `compor`; `manter`, `conter`; `convir`; `desfazer`; `prever`).
  - Существительные и прилагательные: правила множественного числа (`-ão` → `-ões/-ães/-ãos`: по умолчанию `-ões`, остальное через `plural`; `-l` → `-is`, `-m` → `-ns`, `-r/-z/-s` → `-es`) и женского рода (`-o` → `-a`, `-or` → `-ora`, `-ês` → `-esa`, `-ão` → `-ã/-ona`). Диминутивы `-inho/-zinho` указываются в `forms`.
  - В индекс попадают только формы, **встреченные в корпусе**, плюс сами леммы. Генерация полной парадигмы нужна для поиска, но в бандл не идёт.
- **Подбор леммы в рантайме** для теории и ручного поиска: `src/engine/lexicon/guess.ts`. Обратные правила по окончаниям (`-aram` → `-ar`, `-ámos` → `-ar`, `-ões` → `-ão`, `-as` → `-a`, `-ou` → `-ar`…) порождают кандидатов, которые проверяются по множеству лемм. Результат помечается «предположительно».
- **Неоднозначность.** У формы есть массив кандидатов. Ранжирование:
  1. Контекстные правила по соседним токенам: после артикля, предлога или притяжательного — существительное; после `eu`, `não`, `se` — глагол.
  2. Уровень (ниже — выше в списке).
  3. Частота в корпусе.

  Остальные кандидаты показываются как «Другие разборы».
- **Устойчивые выражения (MWE)** (`ter de`, `estar a`, `de vez em quando`, `pequeno-almoço`, `fazer anos`): префиксный словарь в бандле. При тапе ищется самое длинное совпадение вокруг токена, и в карточке появляется чип «Часть выражения «de vez em quando»».

### 2.5 Объём и загрузка

- Оценка: около 4 000 записей (около 70 Б каждая, 280 КБ), около 8 000 форм с тегами (около 140 КБ), темы и MWE (около 20 КБ). Итого **около 450 КБ исходного JSON, около 110–130 КБ в gzip**.
- Загрузка: `src/engine/lexicon/lookup.ts` → `loadLexicon()` = `import('@/generated/lexicon.json')`. Vite выносит его в отдельный JS-чанк с хэшем, а сервис-воркер precache кладёт его в кэш (попадает в `globPatterns '**/*.js'`), значит словарь работает офлайн.
- Предзагрузка: `requestIdleCallback` через 3 с после старта на страницах с pt-текстом, или при первом `pointerdown` по pt-тексту. Пока чанк грузится, карточка показывает скелетон (на кэше это меньше 50 мс).
- Разбивка по уровням **не нужна** при таком объёме. Порог для пересмотра — больше 1 МБ исходного JSON; тогда делить на `entries` (лениво по первой букве) и `forms`.
- **Аудио лемм.** `scripts/tts.ts` с флагом `--lexicon` генерирует mp3 для лемм уровней A1–B1 из `src/generated/lexicon.json`. Это около 3 000 коротких файлов, примерно 15–25 МБ (у одного слова mp3 около 5–8 КБ), идут в runtime-кэш `audio-mp3`. Его лимит `maxEntries: 5000` нужно поднять до 10 000 в `vite.config.ts`. Остальное озвучивается через запасной вариант Web Speech pt-PT, который уже есть в `speak()`.

### 2.6 Неизвестное слово

Сначала лексикон, потом подбор леммы. Если ничего не найдено, пользователь вводит перевод сам. Подсказки: перевод из `data-pt-ru` (перевод предложения) и ссылки Infopédia и Priberam. Записи без `lexId` получают id `u:<normalized lemma>`. В `content/lexicon/_user-requests.md` ничего не пишется: данных пользователя в контенте нет. Но в «Моём словаре» есть фильтр «Нет в словаре приложения», чтобы автор контента видел, чего не хватает.

---

## 3. Модель данных

### 3.1 Типы (`src/data/types.ts`)

```ts
export type WordPos = 'noun'|'verb'|'adj'|'adv'|'prep'|'pron'|'det'|'conj'|'num'|'interj'|'phrase'|'other'
export type WordCardMode = 'recognize' | 'produce' | 'listen' | 'cloze'
export type WordStatus = 'new' | 'learning' | 'known' | 'paused'   // вычисляется, не хранится

export interface WordSource {
  /** encodeSource(PtSource), например 'situation:no-cafe:dialogue:3'; 'manual' для ручного ввода */
  src: string
  /** Форма, как встретилась: 'levanto-me' */
  form: string
  sentence?: string        // pt, ≤ 300
  sentenceRu?: string
  at: number
}

export interface WordEntry {
  /** Детерминированный: lexId ('levantar-se#verb') или 'u:<lemma>' — одно слово = один документ на всех устройствах */
  id: string
  lexId?: string
  lemma: string
  pos?: WordPos
  gender?: 'm' | 'f' | 'mf'
  /** Выбранные/свои значения, через «; » */
  ru: string
  note?: string
  tags?: string[]
  /** Новейший последним, максимум 5 */
  sources: WordSource[]
  level?: Level            // из лексикона
  /** Пользователь отметил «Знаю» (карточки приостановлены / не созданы) */
  mark?: 'known'
  /** Какие карточки созданы/разрешены для слова (staged unlock — см. 4.3) */
  modes: WordCardMode[]
  createdAt: number
  updatedAt: number
}
```

`Level` импортируется из `@/content/schema` как тип; `data` уже зависит от контента в `cardOps`.

**`SrsCard`: добавочные необязательные поля** (с обратной совместимостью, старые карточки не меняются):

```ts
  /** Карточка личного словаря: id записи WordEntry */
  wordId?: string
  /** Режим карточки слова (только при wordId) */
  mode?: WordCardMode
```

Id карточки: `lex:<wordId>:<mode>`. `kind` остаётся `'word'`, так что `KIND_LABEL`, `KIND_CHIP`, фильтры `CardList` и `cardsFromErrors` продолжают работать.

Поля `front` и `back` по-прежнему заполняются: для поиска в `CardList` и для отрисовки, если запись удалена.

| mode | front | back |
|---|---|---|
| recognize | pt-лемма (с артиклем для сущ.) | ru |
| produce | ru (+ подсказка «сущ., ж. р.») | pt с артиклем |
| listen | pt-лемма (аудио) | pt + ru |
| cloze | предложение с `___` | предложение целиком |

**`Settings`: новые поля и значения по умолчанию в `DEFAULT_SETTINGS`:**

```ts
  lookupOnTap: boolean            // true
  highlightSavedWords: boolean    // true
  wordModes: WordCardMode[]       // ['recognize','produce','cloze','listen']
  typeWordAnswers: boolean        // true — RU→PT и аудирование с вводом (оценка с акцентами)
```

**`ExportBundle`.** Добавить `words?: WordEntry[]`, `version` оставить `1`. `parseExportBundle` подставляет `[]`, поэтому старые файлы импортируются.

### 3.2 API репозитория (`ProgressRepository`)

```ts
  getWords(): Promise<WordEntry[]>
  /** Insert or replace by id. Batched. */
  upsertWords(words: WordEntry[]): Promise<void>
  /** Hard delete (unknown ids ignored). Карточки удаляет вызывающий (wordOps). */
  deleteWords(ids: string[]): Promise<void>
```

- **`FirestoreRepository.ts`**: `col('words')` → `users/{uid}/words/{encodeURIComponent(id)}`; `batchSet` и `batchDelete`; `exportAll` и `importAll` включают слова. Обновить комментарий о схеме хранения.
- **`LocalRepository.ts`**: ключ `ptpt:v1:words` с `Record<string, WordEntry>`; `importAll` объединяет записи по id.
- Атомарность записи и карточек: в Firestore для «сохранить слово» одна `writeBatch` на запись и карточки. Добавить приватный метод `commitWordWithCards(word, cards, deleteIds)` нельзя: интерфейс общий. Поэтому в интерфейс добавляется ещё **`saveWordBundle(input: { words?: WordEntry[]; cards?: SrsCard[]; deleteWordIds?: string[]; deleteCardIds?: string[] }): Promise<void>`**: один батч в Firestore, одна последовательность записей в LocalRepository. Им пользуется `wordOps`.

### 3.3 Правила Firestore

Wildcard `users/{uid}/{document=**}` уже пускает `users/{uid}/words/*`, **менять доступ не нужно**. Рекомендуется (по желанию) лёгкая проверка формы данных против мусора:

```
match /users/{uid}/words/{wordId} {
  allow read, delete: if isOwner(uid);
  allow create, update: if isOwner(uid)
    && request.resource.data.keys().hasAll(['id','lemma','ru','sources','modes','createdAt','updatedAt'])
    && request.resource.data.lemma is string && request.resource.data.lemma.size() <= 120
    && request.resource.data.ru is string && request.resource.data.ru.size() <= 500
    && request.resource.data.sources is list && request.resource.data.sources.size() <= 5;
}
```

Блок ставится **до** общего `match /users/{uid}/{document=**}`. В Firestore разрешения складываются через OR, поэтому общий wildcard всё равно разрешит запись. Значит, валидация реально работает, только если сузить wildcard до перечня коллекций: `progress`, `cards`, `errors`, `meta`. Это решение для фазы 1 (см. раздел 7, п. 4). По умолчанию правила не меняются.

**Тесты в `scripts/rules.test.ts`:**
- владелец пишет и читает `users/OWNER/words/x`;
- чужой и неавторизованный пользователь получают отказ на `words`.

### 3.4 Кэш и стоимость чтений

Сейчас `getCards()` вызывают `Layout` и каждая страница. С ростом словаря (1 000 слов × 2–4 карточки) каждый вызов стоит тысячи чтений, а лимит Spark — 50 тыс. в сутки. Поэтому в фазе 1:

- `src/features/words/WordsProvider.tsx`: одна загрузка `getWords()` за сессию, хранилище в памяти (`useSyncExternalStore`), оптимистичные мутации через `wordOps`. Хуки: `useWords()`, `useWord(id)`, `useWordByLemma(lexId)`, `useWordIndex()` (Map лемм для подсветки).
- Рекомендация: так же кэшировать карточки (`CardsProvider`) и перевести `useLibraryCards`, `useSituationCards`, `Layout.useDueCount` и `useProgressData` на него. Это отдельная задача; без неё словарь работает, но дороже. В фазе 1 сделать минимум: `WordsProvider` хранит и `cards` для `lex:*`, а при сохранении слова заодно обновляет локальный кэш.

### 3.5 Миграция существующих word-карточек

Однократное действие с подтверждением в «Моём словаре»: «В повторении 120 слов из тем и ситуаций. Перенести в словарь? Прогресс сохранится».

`wordOps.migrateLegacyWordCards(repo, cards)`:
- для карточек с `kind:'word'` и id `w:*` или `g:*` по контенту восстанавливается pt и ru, лемма определяется через лексикон;
- создаётся `WordEntry` с источником `vocab:<themeId>` / `situation:<id>:vocab` / `reading:<id>:glossary`;
- старая карточка ru→pt **копируется в `lex:<wordId>:produce` с тем же `fsrs`**, старый id удаляется;
- карточка `recognize` создаётся новой: **при `state ≥ 2` — сразу в состоянии Review с той же стабильностью**, чтобы не нагружать лимит новых.

Миграция идемпотентна (записи с детерминированными id). Карточки фраз (`ph:`) и грамматики не трогаются.

Пока миграция не выполнена, `VocabThemePage` и `VocabSection` считают слово «в словаре», если есть **либо** `WordEntry` с этим `lexId`, **либо** старая карточка.

---

## 4. Механизм изучения

### 4.1 Раздел «Мой словарь»: маршрут `/words`

- **Навигация.** Нижняя панель остаётся из 5 пунктов: `NAV_ITEMS['/review'].match = ['/words']`. На `/review` и `/words` сверху переключатель `ReviewTabs` «Повторение | Мой словарь» (по образцу `MaterialsTabs`). Плюс карточка в `LibraryPage` (раздел «Словари» → «Мой словарь, N слов») и виджет на главной.
- `src/app/App.tsx`: `<Route path="words" element={<WordsPage />} />` и `<Route path="words/:id" element={<WordPage />} />`. Страницы лениво загружаются через `lazy()`, чтобы не раздувать основной чанк.

**`WordsPage`:**
- `PageHeader` «Мой словарь» и счётчики: всего, новые, учу, знаю.
- Кнопки: **«Учить новые (N)»**, **«Повторить слова (N к повторению)»**, «Проверить себя», «Практика с агентом», «Добавить слово» (поиск по лексикону), меню «Импорт списка» и «Перенести из повторения» (п. 3.5).
- Поиск по pt (без учёта акцентов, через `stripAccents` из `engine/grading`) и ru.
- Фильтры `ChipGroup`: статус (новые / учу / знаю / на паузе); уровень A1–B2 и «без уровня»; источник (ситуации / тексты / темы / упражнения / вручную); часть речи; «нет в словаре приложения»; теги.
- Сортировка: недавние / по алфавиту / трудные (сумма `lapses`, затем наименьшая стабильность).
- Строка списка: `SpeakButton`, лемма с артиклем и `GenderBadge`, ru, чип статуса, мини-индикатор силы (стабильность самой слабой карточки), «из: Ситуация «В кафе»».
- Действия строки: изменить / «Знаю» / пауза / удалить. Удаление с тостом «Отменить», как в `CardList`.

**`WordPage` (`/words/:id`):**
- все поля и редактор `WordEditor` (перевод, заметка, теги, род, часть речи, режимы карточек);
- список источников со ссылками `sourceHref` («Открыть в контексте» ведёт на реплику или абзац с подсветкой);
- карточки слова с интервалами (`formatInterval`);
- «Есть в темах» → `/library/vocab/<id>`;
- «Другие слова темы, которых нет в словаре» — до 5, с кнопкой «+».

### 4.2 Режимы изучения

1. **Знакомство с новыми** (`LearnNewSession.tsx`, `/words?learn=1`). Серия до `min(5, остаток дневного лимита)` новых слов.
   - Экран слова: лемма, аудио, значения, род, пример из источника.
   - Затем мини-проверка: выбор перевода из 4 вариантов (дистракторы из словаря пользователя и лексикона той же части речи) и сборка слова по буквам или ввод.
   - Итог: карточке `recognize` ставится оценка `good` (или `again`, если ошиблись) через `schedule()`, вызывается `bumpNewSeenToday`. Слово переходит в `learning`, дальше его ведёт FSRS.
2. **Повторение слов.** `/review?deck=words`: `ReviewPage` фильтрует `dueCards` по `c.wordId`. Сессия та же, `ReviewSession`.
3. **Проверить себя.** `VocabQuiz` обобщается: проп `items: QuizItem[]` (`{ key, pt, ru, gender?, example? }`) вместо `theme`. `VocabThemePage` передаёт `theme.words`, словарь — выбранные или отфильтрованные записи. «Не знаю» → `again` для карточки `recognize`, если она уже есть.
4. **Практика с агентом** (раздел 4.6).

### 4.3 Карточки слова и общая очередь

**Режимы:**
- **`recognize`** (pt → ru). Лицевая сторона: лемма с артиклем и аудио (у листов `lookup off` не нужен, это pt). Задача «Что это значит?». Обратная сторона: значения, пример из источника с переводом, ссылка на контекст.
- **`produce`** (ru → pt). Если включено `typeWordAnswers`: поле ввода `TextAnswer` с проверкой `gradeAnswer` (артикль необязателен для засчитывания, но показывается). Вердикт `accents` предлагает оценку «Трудно» — механизм `suggestRating`, как у карточек ошибок. Иначе — переворачиваемая карточка.
- **`listen`**: проигрывается лемма (mp3 или Web Speech); ввод того, что услышано. Создаётся, только если есть mp3 (`bundle.audio`) или доступен голос pt-PT (`pickPtPtVoice`).
- **`cloze`**: предложение источника, в котором словоформа заменена на `___`, и подсказка ru значения. Ввод **увиденной формы** (не леммы). Принимаются форма из источника и, для существительных, форма с артиклем. Создаётся, только если есть `sources[].sentence`.

**Поэтапное открытие** (`wordOps.unlockNext`), чтобы не давать сразу 4 новые карточки на слово:
- при сохранении создаётся только `recognize`;
- `produce` — когда `recognize` впервые перешла в `state = 2` (Review);
- `cloze` и `listen` — когда стабильность `recognize` ≥ 4 дней (и режим включён в `settings.wordModes` и `entry.modes`).

Открытие вызывается в `ReviewSession.rate()` через проп `onCardUpdated`, который сейчас `noop` в `ReviewPage`: туда передаётся `(card) => card.wordId && words.onCardReviewed(card)`. Также вызывается из `LearnNewSession`.

**Изменения в `dueCards()` (`src/engine/fsrs.ts`), обратно совместимые:**
- `DueOptions.burySiblings?: boolean` (по умолчанию `true`). Из карточек с одинаковым `wordId` в сессию попадает одна: просроченная — с наибольшей просрочкой, новые — только если у слова нет карточки к повторению. Так `recognize` и `produce` одного слова не идут подряд.
- `DueOptions.preferPersonal?: boolean` (по умолчанию `true`). Среди новых карточек личные (`wordId`) идут **раньше** карточек тем и примеров. Дневной лимит `newCardsPerDay` общий.
- `DueOptions.filter?: (c: SrsCard) => boolean` для режима `deck=words`.

**`CardFace.tsx`.** Если у карточки `card.mode` есть, используется `WordCardFace` (`src/features/words/WordCardFace.tsx`), иначе всё как сейчас. Отдельный `FRONT_TASK` по режиму. `CardHeader`: для `wordId` вместо названия темы — «Мой словарь · из «В кафе»».

**`ReviewSession.tsx`.** Для `produce`, `listen` и `cloze` с вводом используется режим упражнения: задание сначала, «Проверить», затем оценки с предложенной. Существующий флаг `exerciseMode` обобщается до `answerMode = loc || isTypedWordCard(card)`.

**`ReviewPage.tsx`.**
- `cardLevel()`: при `c.wordId` уровень берётся из `words.get(c.wordId)?.level`.
- В `DeckPanel` строка «Из словаря: N».
- Поддержка `?deck=words`.
- Пустое состояние упоминает «Мой словарь».

**`CardList.tsx`.** Фильтр «Источник: Мой словарь»; у карточки слова ссылка «Открыть слово».

### 4.4 Жизненный цикл статуса

Статус вычисляется в `src/features/words/status.ts` → `wordStatus(entry, cards)`:
- `known`, если `entry.mark === 'known'` **или** все незамороженные карточки слова в `state = 2` со стабильностью ≥ 21 дня и создано не меньше двух режимов;
- `paused`, если все карточки замороженные (`suspended`) и `mark` не задан;
- `new`, если ни одна карточка ещё не оценивалась (все `state = 0`);
- иначе `learning`.

Переходы:
- после ошибки по «знакомому» слову (`lapse`) статус сам возвращается в `learning`;
- «Знаю» вручную: `mark = 'known'`, все карточки слова `suspended = true`;
- «Учить снова»: `mark` снимается, карточки размораживаются, а если их не было, создаётся `recognize`.

Статус в базе не хранится, поэтому рассинхронизации не бывает. `WordsProvider` держит Map `id → status`, пересчитываемую при изменении карточек.

### 4.5 Подсветка сохранённых слов в текстах

Файл `src/features/words/capture/highlights.ts`, хук `useSavedWordHighlights()` в `WordCaptureProvider`:
- При смене маршрута и через `MutationObserver` (с debounce 150 мс) обходит текстовые узлы внутри `[lang^="pt"]` в `<main>`.
- Токенизирует их и сравнивает нормализованную форму через `lexicon.forms` с `lexId` из словаря пользователя.
- Строит `Highlight('lex-learning')` для статусов new/learning и `Highlight('lex-known')` для known.
- CSS в `src/index.css`:

```css
::highlight(lex-learning) { text-decoration: underline dotted 2px var(--color-terracotta); text-underline-offset: 3px; }
::highlight(lex-known)    { text-decoration: underline dotted 1px var(--color-line-strong); }
::highlight(lookup-active){ background-color: var(--color-azulejo-soft); }
```

- Включается настройкой `highlightSavedWords`. Не работает внутри `[data-lookup="off"]`, чтобы не подсказывать ответ.
- Существующее подчёркивание глоссария в `ReadingPage` остаётся (синее): это «слова текста». Подсветка словаря — терракотовая, это «ваши слова». Легенда под кнопкой чтения.
- Производительность: корпус одной страницы — меньше 5 тыс. токенов, обход меньше 10 мс. Без Highlight API подсветки нет, функциональность не страдает.

### 4.6 Главная, агент, темы

**Виджет `WordsWidget`** (`src/features/words/WordsWidget.tsx`) в `DashboardPage.tsx`, в блоке «Ещё на сегодня»:
- «Мой словарь: 42 слова · учу 18 · знаю 20»;
- полоса статусов (`ProgressBar` с тремя сегментами);
- «Новых ждут: 4» → «Учить новые»; «К повторению: 7» → `/review?deck=words`;
- три последних добавленных слова со ссылками;
- пустое состояние: «Нажмите на любое слово в диалоге или тексте…».

**Агент** (`src/features/tutor/`):
- `modes.ts`: `TutorKind` дополняется `'words'`, `WORDS_MODES = [{ id: 'mywords', title: 'Мои слова', … }]`.
- `prompts.ts` → `buildWordsPrompt(words: WordEntry[], opts)`:
  - до 30 слов; приоритет — статус learning, затем наибольшее число `lapses`, затем самые новые;
  - формат `lemma (род, часть речи) — ru; пример: «предложение»`;
  - план: быстрый прогон pt→ru и ru→pt, затем мини-диалог, где слова нужны естественно, затем 5 предложений на перевод;
  - в конце агент выдаёт блок `СЛОВА:` со строками `pt — ru` для новых слов из беседы.
- `buildDailyPrompt` дополняется строкой «МОИ СЛОВА В РАБОТЕ: …» (до 12 слов learning) с просьбой использовать их в разминке.
- `TutorPanel` в `WordsPage`: `targetIds=['my-words']`. В `items.ts` → `resolveTutorItem('my-words')` возвращает `{ kind: 'words', title: 'Мой словарь', to: '/words#tutor' }`.
- **Импорт ответа агента:** `ImportListDialog` в `WordsPage`. Вставка строк `pt — ru` или `pt - ru` или с табуляцией. Каждая строка разбирается через лексикон и показывается предпросмотр: найдено / не найдено / уже в словаре, с галочками. Источник `manual:tutor`.

**Связь со словарными темами:**
- `VocabThemePage.tsx`: кнопки «+ в повторение» становятся «+ в словарь». Они создают `WordEntry` (лемма без артикля, источник `vocab:<themeId>`, `ru` из темы) через `wordOps.saveWords`. Состояние «в словаре» берётся из `useWords()` по `lexId`. Чип статуса у слова. «Добавить все в словарь» — пакетно, одним батчем.
- `StudySections.tsx` (`VocabSection`) и `ReadingPage.tsx` (глоссарий): то же самое. `PhrasesSection` остаётся с карточками `ph:` («в повторение»): фразы — отдельная сущность. Но в карточке слова можно сохранить фразу как запись `phrase`.
- `GlossaryPopover.tsx` удаляется, его заменяет `LookupPopover`. Подчёркнутые слова глоссария открывают общую карточку, а контекстный перевод глоссария идёт первым значением.
- `LibraryPage.tsx`: на плитке темы «в словаре 12 / 60».

**Ошибки → словарь.** В `ResultScreen.tsx` (разбор ошибок урока) подсказка «Незнакомые слова можно нажать и добавить в словарь». Строки уже pt и уже работают через перехват.

---

## 5. Точки интеграции (все затрагиваемые файлы)

**Новые файлы**

| Файл | Назначение |
|---|---|
| `src/engine/lexicon/normalize.ts` | Токенизация, стяжения, местоимения через дефис, восстановление окончаний, отрезание артикля (общий для приложения и Node) |
| `src/engine/lexicon/morph.ts` | Коды тегов форм → подписи на русском |
| `src/engine/lexicon/guess.ts` | Подбор леммы по окончаниям |
| `src/engine/lexicon/lookup.ts` | `loadLexicon()`, `resolve(form, ctx) → LexCandidate[]`, `matchMwe(tokens, i)`, `entryById`, `themesOf(lexId)` |
| `src/engine/lexicon/types.ts` | `LexiconBundle`, `LexCandidate` |
| `src/generated/lexicon.json` | Артефакт сборки (коммитится) |
| `content/lexicon/*.json` | Источник лексикона для авторов |
| `scripts/lexicon.ts`, `scripts/lexicon/conjugate.ts`, `scripts/lexicon/irregular.ts`, `scripts/lexicon/inflect.ts` | Офлайн-пайплайн |
| `scripts/lexicon.test.ts`, `scripts/words.test.ts` | Юнит-тесты (`node:test`) |
| `src/features/words/Pt.tsx`, `source.ts` | Общий pt-компонент и источники |
| `src/features/words/WordsProvider.tsx`, `useWords.ts` | Хранилище |
| `src/features/words/wordOps.ts` | `saveWord`, `saveWords`, `updateWord`, `addSource`, `deleteWord`, `markKnown`, `unmarkKnown`, `buildCards`, `unlockNext`, `onCardReviewed`, `migrateLegacyWordCards`, `importList` |
| `src/features/words/status.ts` | Вычисление статуса |
| `src/features/words/capture/WordCaptureProvider.tsx`, `hitTest.ts`, `highlights.ts` | Глобальный перехват и подсветка |
| `src/features/words/capture/LookupCard.tsx`, `LookupPopover.tsx`, `LookupSheet.tsx`, `SelectionChip.tsx`, `WordSearchDialog.tsx` | Интерфейс захвата |
| `src/features/words/WordsPage.tsx`, `WordPage.tsx`, `WordList.tsx`, `WordEditor.tsx`, `LearnNewSession.tsx`, `ImportListDialog.tsx`, `WordsWidget.tsx`, `WordCardFace.tsx`, `ReviewTabs.tsx` | Раздел словаря и обучение |

**Изменяемые файлы**

| Файл | Изменение |
|---|---|
| `src/data/types.ts` | `WordEntry`, `WordSource`, `WordCardMode`, `WordPos`; поля `wordId` и `mode` в `SrsCard`; новые `Settings` и значения по умолчанию; `ExportBundle.words`; методы репозитория; `parseExportBundle` |
| `src/data/FirestoreRepository.ts`, `src/data/LocalRepository.ts` | Коллекция `words`, `saveWordBundle`, экспорт и импорт |
| `firestore.rules` (по желанию), `scripts/rules.test.ts` | Тесты пути `words` |
| `src/content/index.ts` | Исключить `content/lexicon/**` из glob |
| `src/content/schema.ts` | `LexEntrySchema`, `LexiconFileSchema` |
| `scripts/validate.ts` | Покрытие лексикона, актуальность бандла, пропуск `content/lexicon` в общей проверке |
| `scripts/tts.ts` | `--lexicon`: аудио лемм |
| `scripts/brazilianisms.ts` (вызов) | Проверка лексикона |
| `package.json` | Скрипты `lexicon`, `test:unit` (`tsx --test scripts/lexicon.test.ts scripts/words.test.ts`) |
| `vite.config.ts` | `audio-mp3.maxEntries` до 10 000 |
| `src/index.css` | Стили `::highlight(...)`, шторка |
| `src/app/App.tsx` | Маршруты `words` и `words/:id`, `WordsProvider` внутри `RepositoryProvider` |
| `src/app/Layout.tsx` | `WordCaptureProvider` вокруг `<Outlet/>`; кнопка поиска слова в шапке (иконка `BookA` или `Search`, `/`) |
| `src/app/nav.ts` | `match: ['/words']` у «Повторения» |
| `src/engine/fsrs.ts` | `burySiblings`, `preferPersonal`, `filter` в `dueCards`; поля `wordId` и `mode` в `NewCardInput` и `createSrsCard` |
| `src/features/srs/ReviewPage.tsx` | `ReviewTabs`, `?deck=words`, `onCardUpdated` → открытие карточек, уровень личных карточек |
| `src/features/srs/ReviewSession.tsx` | `answerMode` для вводимых карточек слова; проверка `lookupOpen` в обработчике клавиш; `data-lookup` на лицевой стороне |
| `src/features/srs/CardFace.tsx` | Делегирование в `WordCardFace`; `lookup` off на лицевой стороне |
| `src/features/srs/CardList.tsx` | Фильтр «Мой словарь», ссылка на слово |
| `src/features/srs/kinds.ts` | `WORD_MODE_LABEL` |
| `src/features/situations/DialogueSection.tsx` | Реплика как `<Pt as="p">` и отдельная кнопка перевода; `id` и якорь; проверка `lookupOpen` |
| `src/features/situations/StudySections.tsx` | `<Pt>`; «в словарь» для лексики |
| `src/features/situations/WritingSection.tsx`, `src/features/lessons/ExamplesSection.tsx`, `src/features/lessons/ResultScreen.tsx` | `<Pt src ru>` |
| `src/features/library/ReadingPage.tsx` | `<Pt>` в абзацах, `id="p-i"`; глоссарий открывает `LookupPopover`; «в словарь» |
| `src/features/library/GlossaryPopover.tsx` | Удаляется (заменён) |
| `src/features/library/VocabThemePage.tsx`, `src/features/library/cards.ts` | «в словарь» через `wordOps`; `useLibraryCards` остаётся для обратной совместимости и миграции |
| `src/features/library/VocabQuiz.tsx` | Обобщение на `items`; `lookup` off до переворота; проверка `lookupOpen` |
| `src/features/library/LibraryPage.tsx` | Плитка «Мой словарь», счётчик на темах |
| `src/features/exercises/ExerciseRunner.tsx`, `src/features/exercises/ReviewExercise.tsx` | `data-pt-src="exercise:<id>"`, `data-lookup` по `locked`; проверка `lookupOpen` в клавиатуре |
| `src/features/exercises/kinds/*` | Только `data-pt-ru` у промптов с `ru` (`FillGap`, `SpeakShadow`, `OrderWords`) |
| `src/features/diagnostic/DiagnosticPage.tsx` | `data-lookup="off"` |
| `src/components/Markdown.tsx` | Проп `src` → `data-pt-src` контейнера |
| `src/features/library/CheatsheetPage.tsx`, `src/features/lessons/TopicPage.tsx` | Передают `src` в `Markdown` |
| `src/features/dashboard/DashboardPage.tsx` | `WordsWidget` |
| `src/features/tutor/modes.ts`, `prompts.ts`, `items.ts`, `panels.tsx` | Режим «Мои слова», слова в «Беседе дня», `resolveTutorItem('my-words')`, панель `WordsTutor` |
| `src/features/settings/SettingsPage.tsx` | Блок «Словарь»: тап по слову, подсветка, режимы карточек, ввод ответа. Экспорт уже включает слова через репозиторий |

---

## 6. План по фазам

Каждая фаза выпускается отдельно. Владение файлами указано так, чтобы фазы могли делать разные агенты. Фазы 2 и 4 можно вести параллельно после фазы 1.

### Фаза 1. Модель данных, хранилище и «Мой словарь» с ручным добавлением

Результат: пользователь может добавить слово вручную (поиск по лексикону-seed) или из тем, смотреть, искать, править и удалять. Слова попадают в повторение как `recognize`.

- **Агент A (данные).**
  - `src/data/types.ts`, `FirestoreRepository.ts`, `LocalRepository.ts`, `scripts/rules.test.ts`, `firestore.rules`.
  - `src/engine/fsrs.ts`: только поля `wordId` и `mode` в `createSrsCard`.
  - `src/features/words/WordsProvider.tsx`, `useWords.ts`, `wordOps.ts` (без открытия карточек и миграции), `status.ts`.
  - `scripts/words.test.ts`: статусы, `buildCards`, детерминированные id, `parseExportBundle` со словами и без.
- **Агент B (лексикон-seed).**
  - `content/lexicon/` (только `seed` из vocab, situations и glossary), `src/content/schema.ts` (Lex*), `src/content/index.ts` (исключение из glob).
  - `scripts/lexicon.ts` (`seed`, `build`), `src/engine/lexicon/{normalize,lookup,types}.ts`, `src/generated/lexicon.json`.
  - `scripts/lexicon.test.ts`: стяжения, местоимения (`levanto-me`, `fazê-lo`, `dir-lhe-ei`), отрезание артикля.
  - `package.json`.
- **Агент C (интерфейс).**
  - `src/features/words/{WordsPage,WordPage,WordList,WordEditor,WordSearchDialog,ReviewTabs}.tsx`, `src/app/App.tsx`, `src/app/nav.ts`.
  - `src/features/library/VocabThemePage.tsx`, `src/features/situations/StudySections.tsx` (кнопки «в словарь»), `src/features/settings/SettingsPage.tsx` (только переключатели).
- Проверки: `npm run build`, `npm run lint`, `npm run validate`, `npm run test:rules`, `npm run test:unit`. Ручная проверка в обоих режимах (Local и Firestore-эмулятор).

### Фаза 2. Захват слов по всему сайту

Результат: тап, выделение и поиск работают в диалогах, текстах, примерах, упражнениях после ответа, повторении и теории.

- **Агент D (ядро захвата).** `src/features/words/capture/*`, `src/features/words/Pt.tsx`, `source.ts`, `src/app/Layout.tsx` (провайдер и кнопка поиска), `src/index.css` (стили highlight и шторки), `src/components/Markdown.tsx`.
- **Агент E (разметка поверхностей).** Это файлы, которые сейчас правит другой агент дизайна: **начинать после того, как его изменения слиты**.
  - `DialogueSection.tsx`, `StudySections.tsx`, `WritingSection.tsx`, `ReadingPage.tsx` (и удаление `GlossaryPopover.tsx`), `ExamplesSection.tsx`, `ResultScreen.tsx`, `CheatsheetPage.tsx`, `TopicPage.tsx`, `VocabQuiz.tsx`;
  - `ExerciseRunner.tsx`, `ReviewExercise.tsx`, `kinds/{FillGap,SpeakShadow,OrderWords}.tsx`, `DiagnosticPage.tsx`, `ReviewSession.tsx` и `CardFace.tsx` (только `data-lookup` и проверка `lookupOpen`).
- Тесты: `scripts/words.test.ts` дополняется чистыми функциями `hitTest` (границы слова через Segmenter, вырезание предложения, кириллический фильтр, правило интерактивных элементов на jsdom-подобных заглушках или чистых строках).
- Ручная проверка: iOS Safari (долгое нажатие и шторка), Android Chrome, десктоп (двойной клик, выделение, `/`, Esc и возврат фокуса), VoiceOver: «Все слова фразы».

#### Фаза 2 — как подключить поверхность

Ядро захвата готово (агент D): `src/features/words/capture/*`, `Pt.tsx`, `source.ts` (`lookupAttrs`), провайдер в `Layout`, `/` и `Ctrl/⌘+K` — поиск слова (плюс кнопка-лупа в шапке), переключатель «Перевод по нажатию на слово» в настройках. Эталонная поверхность — `src/features/situations/DialogueSection.tsx` (решение 1). Остальные поверхности подключает агент E по правилам ниже.

**Как работает перехват (что получает поверхность бесплатно).** `WordCaptureProvider` слушает `document`: клик/тап (`lookupOnTap`), двойной клик, выделение (≤ 6 слов, без кириллицы → кнопка «Перевести · В словарь» на десктопе, полоса «Перевести «…»» на телефоне), `Alt+L` или `Enter` на выделении / на сфокусированной pt-строке, `/`. Режим определяется предками узла, ближайший побеждает:

| Атрибут на предке | Что разрешено |
|---|---|
| `lang="pt…"` | тап, двойной клик, выделение |
| `data-lookup="select"` (`<Markdown pt>`) | только выделение (русский текст с pt-примерами) |
| `data-lookup="off"` | ничего (и выделение тоже) |
| `data-lookup="on"` | снимает `off` выше (сам по себе не делает текст португальским) |
| `data-lookup-ui` | карточка поиска сама себя не ловит |
| `button, a[href], input, textarea, select, label, summary, [role=button…], [contenteditable]` | никогда не перехватываются (тап и выделение внутри них игнорируются) |

Контекст сохраняемого слова: ближайший `[data-pt-src]` (источник, `encodeSource`) и `[data-pt-ru]` (перевод фразы). Предложение вырезается из текста ближайшего блока (`p, li, dd, td, h1–h6, [lang], [data-pt-src]…`), ≤ 300 символов. Поэтому `<Pt>` лучше ставить на **блок** (реплика, абзац, пример), а не на отдельные слова.

**API.**

```tsx
import { Pt } from '@/features/words/Pt'
import { lookupAttrs, type PtSource } from '@/features/words/source'
import { isLookupOpen, useLookupOpen, useWordCapture } from '@/features/words/capture'

// pt-блок с источником и переводом (as — любой тег; остальные пропсы прокидываются)
<Pt as="p" id={`p-${i}`} src={{ kind: 'reading', id: text.id, part: 'paragraph', index: i }} ru={para.ru}>{para.pt}</Pt>
// заблокировать (ответ упражнения ещё не проверен; лицевая сторона карточки)
<Pt locked={!checked}>{prompt}</Pt>                 // = data-lookup="off"; lookup={false} — то же
// контейнер без lang (раннер упражнения, карточка): источник + замок
<div {...lookupAttrs({ src: { kind: 'exercise', id: ex.id }, locked: !checked })}>…</div>
//   locked: true → data-lookup="off", false → "on" (включает внутри «off»), undefined → наследует
// markdown с pt-примерами внутри русского текста: только выделение
<Markdown pt={{ kind: 'cheatsheet', id }}>{md}</Markdown>   // или pt (без источника)
// глобальные клавиши страницы — первой строкой обработчика
if (isLookupOpen()) return                             // синхронно, безопасно в keydown
const open = useLookupOpen()                           // если нужно перерисоваться
// открыть карточку программно (например, кнопка «Слова фразы» у элемента)
useWordCapture()?.openForElement(el, { viaKey: true })
```

`PtSource.kind`: `situation | reading | topic | vocab | exercise | cheatsheet | review | writing`; `part`: `dialogue | phrases | vocab | paragraph | glossary | examples | writing | theory | feedback`; `index` — номер строки/абзаца. `sourceHref` умеет ссылки на реплику (`#dlg-line-i`), абзац (`#p-i`), примеры темы и шпаргалку — давайте элементам эти `id`.

**Правило замка (обязательно).** Поиск не должен подсказывать ответ:
- `ExerciseRunner`, `ReviewExercise`: контейнер задания `{...lookupAttrs({ src: { kind: 'exercise', id }, locked: !checked })}`; после «Проверить» поиск работает на промпте, вариантах, `ExerciseFeedback`, `explanation`.
- `DiagnosticPage`: `data-lookup="off"` всегда. `VocabQuiz`, `CardFace`: лицевая сторона `locked` до переворота / «Показать ответ».
- `TextAnswer` и любые поля ввода исключены правилом интерактивных элементов; `textarea` в `WritingSection` — тоже.
- В `ReviewSession`, `ExerciseRunner`, `VocabQuiz`, `TextAnswer` обработчики клавиш начинаются с `if (isLookupOpen()) return` (иначе «1» поставит оценку, пока открыта карточка).

**Чек-лист поверхности.** (1) `lang` уже есть — заменить на `<Pt>` и добавить `src`/`ru`; (2) кнопка вокруг pt-текста ломает тап (интерактивный элемент) — вынести действие в отдельную иконку, как в диалоге; (3) замок для упражнений и лицевых сторон; (4) `isLookupOpen()` в клавиатурных обработчиках; (5) `id` для якорей источника; (6) фокусируемая строка (`tabIndex={0}`) даёт путь с клавиатуры: Enter → карточка со «Все слова фразы».

**Пример — диалог (сделано).** Реплика — `<Pt as="p" id="dlg-line-i" tabIndex={0} src={{ kind: 'situation', id, part: 'dialogue', index: i }} ru={line.ru}>`; перевод реплики — отдельная кнопка `Languages` (`aria-expanded`, `aria-controls="dlg-ru-i"`); общий тумблер «Переводы» (`aria-label="Показывать переводы"`) запоминается на устройстве (`localStorage ptpt:v1:dialogue-show-ru`); обработчик Enter/Space ролевой игры начинается с `isLookupOpen()`.

**Подключённые поверхности (агент E).** Диалог, фразы и лексика ситуаций (`#ph-i`, `#voc-i`), образец письма (`#writing-sample`), тексты (абзацы `#p-i`, глоссарий `#gl-i`; слова глоссария только подчёркнуты, тап → та же карточка, «в словарь» вместо `g:*`-карточек, `GlossaryPopover` удалён), теория / PT vs BR / частые ошибки и шпаргалки (`<Markdown pt>`, только выделение), примеры темы (`#ex-i`), лексика темы и `VocabQuiz` (замок до переворота), упражнения (`ExerciseRunner`, `ReviewExercise`, диагностика — замок до проверки), разбор ошибок `ResultScreen`, карточки повторения (`CardFace`: замок до «Показать ответ», источник по id карточки — `ex:`/`ph:`/`w:`), примеры на странице слова, промпт агента (только выделение). `sourceHref` даёт якоря; `useSourceAnchor` (capture/anchor.ts) прокручивает к элементу и подсвечивает его (`.anchor-flash`). Карточка и поиск грузятся лениво (свой чанк); контент — отдельный чанк `content`.

**Чего нет (следующие фазы / известные ограничения).** Подсветка сохранённых слов (`highlights.ts`, фаза 5); одноразовая подсказка «Нажмите на любое слово…» (сейчас постоянная строка в диалоге и тексте); поле «Свой перевод» для найденных слов (значения выбираются чипами, править — в `WordPage`); морфологические подписи (`morph.ts`, фаза 4). Варианты `Choice`, плитки `Match` и слова `OrderWords` — кнопки, поэтому по ним тап не работает и после ответа; слова доступны через строку «Верно» в разборе и «Все слова фразы». Перед закрытием шторки тост «Отменить» лежит под модальным `<dialog>` — поэтому «Отменить» продублирован в самой карточке; полоса выделения на телефоне поднимается над тостом (`--toast-offset`).

### Фаза 3. Механизм изучения

Результат: четыре режима карточек, поэтапное открытие, отсев карточек одного слова, личные слова первыми, «Учить новые», повторение только слов, статусы.

- **Агент F.**
  - `src/engine/fsrs.ts` (`dueCards`: `burySiblings`, `preferPersonal`, `filter`);
  - `src/features/words/{WordCardFace,LearnNewSession}.tsx`, `wordOps.ts` (`unlockNext`, `onCardReviewed`);
  - `src/features/srs/{ReviewPage,ReviewSession,CardFace,CardList,kinds}.tsx`;
  - `src/features/library/VocabQuiz.tsx` (обобщение на `items`, если не сделано в фазе 2: согласовать с агентом E);
  - `src/features/settings/SettingsPage.tsx` (режимы, ввод ответа).
- Тесты в `scripts/words.test.ts`:
  - `dueCards` с отсевом и приоритетом при дневном лимите (несколько сценариев);
  - открытие `produce` после Review, `cloze` и `listen` после стабильности ≥ 4 дней;
  - переходы статусов, включая `lapse` знакомого слова;
  - маска для `cloze` (форма с местоимением, регистр, несколько вхождений).

### Фаза 4. Полный лексикон (контент, параллельно фазам 2–3)

Результат: 100 % форм корпуса разобраны, морфологические подписи, омографы, устойчивые выражения, аудио лемм.

- **Агент G (контент и скрипты).**
  - `scripts/lexicon.ts` (`extract`, `report`), `scripts/lexicon/{conjugate,irregular,inflect}.ts`;
  - `src/engine/lexicon/{morph,guess}.ts`;
  - `content/lexicon/*.json` (наполнение по `_todo.json`), `src/generated/lexicon.json`;
  - `scripts/validate.ts` (покрытие: сначала предупреждение, в конце фазы ошибка), `scripts/tts.ts --lexicon`, `vite.config.ts` (`maxEntries`).
- Тесты в `scripts/lexicon.test.ts`:
  - эталонные парадигмы `falar`, `comer`, `partir` плюс 10 неправильных (`ser`, `ir`, `ter`, `fazer`, `pôr`, `dizer`, `vir`, `ver`, `dar`, `haver`);
  - `-ámos` для pt-PT; чередования `-car`, `-gar`, `-çar`; множественное число на `-ão`;
  - `resolve('como', ['eu', …])` даёт `comer` первым.
- Линтер бразилизмов по лексикону; проверка размера бандла (ошибка при > 1 МБ).

### Фаза 5. Интеграции и миграция

Результат: подсветка слов в текстах, виджет на главной, агент, импорт списка, обратные ссылки на темы, перенос старых word-карточек.

- **Агент H.**
  - `src/features/words/capture/highlights.ts` (подсветка сохранённых);
  - `WordsWidget.tsx` + `src/features/dashboard/DashboardPage.tsx`;
  - `src/features/tutor/{modes,prompts,items,panels}.ts(x)`;
  - `ImportListDialog.tsx`, `wordOps.migrateLegacyWordCards`, `importList`;
  - `src/features/library/LibraryPage.tsx` (счётчики), `WordPage.tsx` (темы и «другие слова темы»).
- Тесты:
  - миграция: идемпотентность, сохранение `fsrs`, корректный `produce`;
  - разбор `importList` (`—`, `-`, табуляция, пустые строки, дубликаты);
  - `buildWordsPrompt`: лимит 30 и приоритеты (снимок через `node:test`).
- Документация: `docs/tutor-prompt-examples.md` (пример «Мои слова»), `content/README.md` (как пополнять лексикон), `scripts/README.md` (`npm run lexicon`).

---

## 7. Риски и вопросы, блокирующие решение

**Риски (с мерами):**
- **Стоимость чтений Firestore** при росте числа карточек: `getCards()` вызывается на многих страницах. Меры: `WordsProvider`, кэш карточек, отсев одного слова на сессию. Отдельной задачей рекомендован общий `CardsProvider`.
- **Конфликт жестов на мобильных** (тап, двойной тап с зумом, долгое нажатие и системное меню): нужна ручная проверка на iOS и Android. Запасные варианты: настройка `lookupOnTap` и поиск `/`.
- **Подсказка ответа в упражнениях:** снимается правилом `data-lookup` по `locked`. Нужно не пропустить ни одного контейнера (`ExerciseRunner`, `ReviewExercise`, `DiagnosticPage`, `VocabQuiz`).
- **Качество лемм и переводов** в сгенерированной части лексикона: обязательная ручная проверка `_todo.json`, линтер бразилизмов, контекстный перевод из контента в приоритете.
- **Параллельная работа над интерфейсом:** фаза 2 правит те же файлы, что сейчас редактирует агент дизайна. Её нужно начинать после слияния его изменений.
- **Лицензия:** если в фазе 4 для форм подключать дампы Wiktionary (kaikki.org), понадобится атрибуция CC BY-SA. Базовый вариант с собственным спряжением её не требует.

**Вопросы пользователю:**
1. **Диалог:** можно ли изменить поведение реплики — тап по слову открывает перевод слова, а перевод реплики переключается отдельной иконкой (и общим тумблером)? Без этого в диалоге останется только долгое нажатие или выделение.
2. **Старые word-карточки:** переносить их в «Мой словарь» с сохранением прогресса (однократное действие с подтверждением, п. 3.5)? Или оставить в повторении как есть, а словарь вести только для новых слов?
3. **Нагрузка:** включать ли RU→PT, аудирование и пропуск в предложении по умолчанию (с поэтапным открытием, до 4 карточек на слово)? Или по умолчанию только PT→RU и RU→PT?
4. **Правила Firestore:** сузить wildcard до перечня коллекций и добавить проверку формы данных для `words` (строже, но это повторный деплой правил через `npm run deploy`)? Или оставить текущие широкие правила?

---

### Критичные файлы
- /Users/m.ivanov/Projects/learning-portuguese/src/data/types.ts
- /Users/m.ivanov/Projects/learning-portuguese/src/engine/fsrs.ts
- /Users/m.ivanov/Projects/learning-portuguese/src/features/srs/ReviewSession.tsx
- /Users/m.ivanov/Projects/learning-portuguese/src/features/situations/DialogueSection.tsx
- /Users/m.ivanov/Projects/learning-portuguese/src/content/index.ts
- /Users/m.ivanov/Projects/learning-portuguese/src/features/library/GlossaryPopover.tsx
- /Users/m.ivanov/Projects/learning-portuguese/src/data/FirestoreRepository.ts

---

## 8. Решения пользователя (2026-10-19)

1. **Диалог:** тап по слову открывает карточку слова; перевод реплики — отдельной иконкой и общим тумблером «показывать переводы».
2. **Старые word-карточки:** миграция не нужна, их можно удалить. Вместо `migrateLegacyWordCards` (фаза 5) — однократная очистка word-карточек из тем, ситуаций и глоссария текстов (id `w:*`, `g:*`; фразы `ph:*` и grammar остаются), а кнопки «в повторение» для слов заменяются на «в словарь».
3. **Нагрузка:** до 4 карточек на слово, с поэтапным открытием (PT→RU сразу; RU→PT после первого успешного повтора; аудирование и пропуск — при стабильности ≥ 4 дней); режимы отключаются в настройках.
4. **Firestore:** правила остаются широкими, без сужения и без повторного деплоя; `scripts/rules.test.ts` дополняется только проверкой доступа к новой коллекции.
