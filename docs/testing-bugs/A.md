# Поток A · Движок и логика — найденные баги

Каждый баг воспроизводится unit-тестом, помеченным `test.fails(… [BUG A-NN])`: тест «проходит», пока баг есть;
после исправления он упадёт — пометку `.fails` надо снять. Серьёзность: P0 — потеря/порча данных, приложение
не работает; P1 — ломает основной сценарий без обхода; P2 — неверное поведение с обходом / неверные данные для
ученика; P3 — редкий крайний случай, косметика.

### A-01 · Сбой HEAD-запроса к mp3 кэшируется как «файла нет» до перезагрузки
- **Серьёзность:** P3
- **Где:** src/engine/audio.ts:35-40 (`hasAudioFile`: `.catch(() => false)` кладётся в `existsCache` навсегда)
- **Тест:** tests/unit/audio.test.ts › «a failed HEAD (offline) is retried later instead of being cached as «missing» [BUG A-01]»
- **Шаги / входные данные:** 1) первый `hasAudioFile(h)` — сеть недоступна (fetch rejects); 2) сеть вернулась; 3) снова `hasAudioFile(h)`.
- **Ожидается:** повторная проверка (кэшировать только определённый ответ сервера), затем `true` → играет mp3.
- **Фактически:** `false` до перезагрузки страницы → вместо записанного mp3 звучит синтез речи (или ничего, если pt-PT голоса нет).

### A-02 · Два быстрых `speak()` подряд играют одновременно
- **Серьёзность:** P3
- **Где:** src/engine/audio.ts:56-63 (`stopSpeaking()` вызывается до `await audioHash()/hasAudioFile()`, новый `Audio` создаётся позже без повторной остановки)
- **Тест:** tests/unit/audio.test.ts › «a second speak() while the first is still resolving stops the first [BUG A-02]»
- **Шаги:** `speak('primeiro'); speak('segundo')` без ожидания (двойной тап по разным кнопкам «прослушать»).
- **Ожидается:** звучит только последняя фраза (первая остановлена).
- **Фактически:** оба `Audio` в состоянии play — две фразы накладываются.

### A-03 · Предлог в стяжении «àquele» / «ao» совпадает с артиклем «a» → лишний кандидат «o» выше «aquele»
- **Серьёзность:** P3
- **Где:** src/engine/lexicon/lookup.ts:165 (`hitsFor` для `via: 'contraction'` с ключом `prep` берёт все хиты формы «a», включая `o#det` / `o#pron` с тегом F)
- **Тест:** tests/unit/lexicon.test.ts › ««àquele» = a + aquele: no spurious article «o» before «aquele» [BUG A-03]»
- **Шаги:** `lexicon.resolve('àquele')`.
- **Ожидается:** `a#prep`, `aquele#det`.
- **Фактически:** `a#prep`, `o#det (F)`, `o#pron (F)`, `aquele#det` — в карточке слова артикль «o», которого в «àquele» нет; то же для «ao», «à», «às».

### A-04 · Элизия «d'» (copo d'água, caixa d'óculos) не разбирается как de + слово
- **Серьёзность:** P3
- **Где:** src/engine/lexicon/normalize.ts:94-130 (`buildContractions` знает только do/dum/deste…; токенизатор держит «d'água» одним словом — normalize.ts:17)
- **Тест:** tests/unit/lexicon.test.ts › ««d'água» resolves to água (de + água) [BUG A-04]»
- **Шаги:** `resolve('d’água')`.
- **Ожидается:** кандидаты `de#prep` / `água#noun` (via contraction).
- **Фактически:** пусто — «нет в словаре».

### A-05 · В словаре нет существительного «sede» (жажда): в «Tenho muita sede» показывается только «ser, imperativo vós»
- **Серьёзность:** P2
- **Где:** content/lexicon/nouns-q-z.json (нет записи `sede#noun`; ср. `fome` в nouns-d-i.json:289); используется в content/grammar/a1-ter-haver.json и a2-haver-ter-expressoes.json
- **Тест:** tests/unit/lexicon.test.ts › ««tenho sede»: the noun «sede» (жажда) is offered [BUG A-05]»
- **Шаги:** тема «Ter и haver» → тап по «sede» в «Sim, ___ muita sede» / в теории.
- **Ожидается:** `sede#noun` (ж. р., «жажда; ter sede — хотеть пить»), омоним `ser IMP2p` — вторым.
- **Фактически:** единственный кандидат `ser#verb` (IMP2p «sede!» — «будьте!») — ученику A1 показывается неверный перевод.

### A-06 · `tokenize()` даёт неверные смещения для текста в NFD
- **Серьёзность:** P3
- **Где:** src/engine/lexicon/normalize.ts:39 (`unify(text)` нормализует в NFC до поиска совпадений; `start/end` считаются по нормализованной строке, а `text` — не «как в тексте»)
- **Тест:** tests/unit/lexicon.test.ts › «tokenize: offsets stay valid for NFD text … [BUG A-06]»
- **Шаги:** `tokenize('Está bem, café.'.normalize('NFD'))`, затем `text.slice(start, end)`.
- **Ожидается:** «Está», «bem», «café».
- **Фактически:** «Esta», « be», « caf» — смещение на 1 за каждый составной символ. Затрагивает hitTest/highlights (capture) для пользовательского текста в NFD (вставка из macOS/PDF); контент сейчас весь в NFC.

### A-07 · Снапшот устройства с битой коллекцией (`null`) роняет стор при каждой загрузке
- **Серьёзность:** P2
- **Где:** src/data/snapshot.ts:44 (проверяются только `v === 1` и наличие `docs`), src/data/store.ts:197 (`{...EMPTY_DOCS, ...snap.docs}` без проверки каждой коллекции)
- **Тест:** tests/unit/snapshot.test.ts › «wrong shapes: a snapshot with a null collection does not crash the store»
- **Шаги:** `localStorage['ptpt:v1:snap:<uid>'] = {"v":1,"savedAt":1,"lastSyncedAt":null,"docs":{"progress":null,"meta":null}}` → `new DataStore({kind:'firestore', snapshot})` → `progressMap()` / `settings()`.
- **Ожидается:** битая коллекция считается пустой (или снапшот игнорируется, как при битом JSON).
- **Фактически:** `TypeError: Cannot convert undefined or null to object`; снапшот остаётся в хранилище → белый экран на каждой перезагрузке, пока не очистить данные сайта.

### A-08 · `revalidate()` / повторный attach снова делает «не готовым» стор, открытый без снапшота
- **Серьёзность:** P3
- **Где:** src/data/store.ts:274 (revalidate сбрасывает serverSynced), :238 (attach), :294 (`isReady` опирается на `hydrated`, который ставится только в конструкторе)
- **Тест:** tests/unit/store-extra.test.ts › «revalidate() after the first full sync keeps a store (opened without a snapshot) ready»
- **Шаги:** первый вход на устройстве (снапшота нет) → дождаться полной синхронизации (`isReady() === true`) → `revalidate()` (вкладка вернулась через 10+ мин, «Повторить» в AccessDenied).
- **Ожидается:** остаётся готовым (`useDataReady` false только при самом первом открытии).
- **Фактически:** `isReady()` = false до повторного подтверждения сервером всех коллекций → скелетоны, `saveTopicResult`/`saveSettings` ждут `whenReady()` до 10 с.

### A-09 · Импорт: `parseExportBundle` не проверяет элементы progress / cards / errors и тип settings
- **Серьёзность:** P2
- **Где:** src/data/types.ts:313-317 (только `Array.isArray`; `settings: {...DEFAULT_SETTINGS, ...(b.settings ?? {})}`); далее src/data/LocalRepository.ts:170 и `importAll` в src/data/store.ts
- **Тесты:** tests/unit/progress.test.ts › parseExportBundle › «progress / cards / errors entries that are not objects with an id are rejected or dropped», «non-object settings fall back to defaults»; tests/unit/store-extra.test.ts › «importAll skips (or rejects) malformed progress / cards / errors entries»
- **Шаги:** импортировать `{app:'portugues-pt', version:1, progress:[{}], cards:[{front:'no id'}], errors:[{given:'x'}]}`; либо `progress:[null]`; либо `settings:'abc'`.
- **Ожидается:** некорректные записи отбрасываются (как уже делается для `words`) или файл отклоняется с понятной ошибкой «Неверный файл…».
- **Фактически:** документы с ключом `"undefined"` пишутся в progress/cards/errors (и в Firestore); `null` → сырой TypeError посреди импорта; запись прогресса без `history` затем роняет главную (`activityDays`, dashboard/stats.ts:28) и `diagnostic/plan.ts`; строка `settings` раскладывается в `{0:'a',1:'b',…}`.

### A-10 · Локальный режим: запись, частично упёршаяся в квоту, рассинхронизирует localStorage и память
- **Серьёзность:** P3
- **Где:** src/data/localBackend.ts:92 (`commit` пишет коллекции по очереди без отката уже записанных)
- **Тест:** tests/unit/store-extra.test.ts › «a word bundle that only partly fits leaves memory and localStorage consistent»
- **Шаги:** локальный режим, `saveWordBundle({words:[w], cards:[c]})`, запись `ptpt:v1:cards` бросает QuotaExceededError.
- **Ожидается:** всё или ничего.
- **Фактически:** `ptpt:v1:words` уже записан, в памяти откатаны оба → после перезагрузки / storage-события слово без SRS-карточки.

### A-11 · Локальный режим: распарсенные, но неверной формы данные ломают `LocalBackend.connect`
- **Серьёзность:** P3
- **Где:** src/data/localBackend.ts:22-35 (`read`/`readCol` защищают только `JSON.parse`), src/data/LocalRepository.ts:34
- **Тест:** tests/unit/local-repo.test.ts › «wrong shapes (errors as an object, progress as null) do not break connect»
- **Шаги:** `localStorage['ptpt:v1:errors'] = '{"a":1}'` или `localStorage['ptpt:v1:progress'] = 'null'` → старт приложения без Firebase.
- **Ожидается:** считается пустым, как битый JSON.
- **Фактически:** `.map` на не-массиве / `Object.entries(null)` → `connect()` бросает, локальный режим не стартует.

### A-12 · «Сбросить весь прогресс» стирает настройку «показывать перевод» в диалогах
- **Серьёзность:** P3
- **Где:** src/data/deviceProgress.ts:18 (`KEEP` = только theme и auth-user); ключ — src/features/situations/DialogueSection.tsx:15
- **Тест:** tests/unit/device-progress.test.ts › «a progress reset keeps the dialogue «show translation» preference»
- **Шаги:** выключить русский перевод в диалоге ситуации (`ptpt:v1:dialogue-show-ru = '0'`) → сброс прогресса.
- **Ожидается:** предпочтения переживают сброс (так написано в шапке deviceProgress.ts; тема сохраняется).
- **Фактически:** ключ удалён, перевод снова показывается.

### A-13 · Контент: тема требует тему, стоящую позже в программе курса
- **Серьёзность:** P3 (контент)
- **Где:** content/syllabus.json:95-97; content/grammar/b1-conjuntivo-conjuncoes.json:9 (`requires: […, "b1-futuro-conjuntivo"]`)
- **Тест:** tests/unit/content-invariants.test.ts › «prerequisites come earlier in the syllabus order (course order never points forward)»
- **Шаги:** «Курс» → модуль B1 «Conjuntivo»: `b1-conjuntivo-conjuncoes` стоит на две темы раньше `b1-futuro-conjuntivo`.
- **Ожидается:** порядок курса никогда не ведёт к теме с ещё не пройденным пререквизитом.
- **Фактически:** «Лучше сначала: Futuro do conjuntivo» указывает вперёд; `nextSteps.unmetPrereqs` гоняет ученика вперёд-назад. Либо поменять порядок тем, либо убрать require (теория действительно использует «se + futuro do conjuntivo»).

### A-14 · Проверка ответа: тире-пауза с пробелами склеивает соседние слова
- **Серьёзность:** P3
- **Где:** src/engine/grading.ts:19 и :22 (`DASHES → '-'`, затем `\s*-\s*` → `-`)
- **Тест:** tests/unit/exercises-grade.test.ts › «a spaced dash used as a pause (instead of a comma) is sentence punctuation, not a hyphen»
- **Шаги:** `gradeTyped('Olá — tudo bem?', ['Olá, tudo bem?'])` (также « - », « – »).
- **Ожидается:** верно — тире между словами с пробелами это пунктуация.
- **Фактически:** «olá-tudo bem» ≠ «olá tudo bem» → «неверно». Контент обходит это вариантами (a2-no-mercado-da-ribeira-q-06). Исправление не должно ломать «chama - se» → «chama-se» (дефис у клитики без пробела с одной стороны).

### A-15 · Диагностика: жадная починка перемешивания оставляет соседние вопросы одной темы, хотя разнести можно
- **Серьёзность:** P3 (латентный, зависит от контента)
- **Где:** src/features/diagnostic/plan.ts:31-40
- **Тест:** tests/unit/diagnostic.test.ts › «greedy repair finds the spread when one exists (a a a b b → a b a b a)»
- **Шаги:** темы вопросов `a a a b b`, генератор `() => 0.999` (все 200 попыток неудачны → работает починка).
- **Ожидается:** `a b a b a`.
- **Фактически:** `a a b a b`. С текущим diagnostic.json (≤ 2 вопроса на тему в уровне) не проявляется; при 5+4 вопросах двух тем — в ~20 % запусков.

### A-16 · Глоссарий чтения: слово с двойным пробелом внутри никогда не подсвечивается
- **Серьёзность:** P3
- **Где:** src/features/library/highlight.ts:19 (ключ без схлопывания пробелов) vs :32 (совпадение со схлопыванием)
- **Тест:** tests/unit/misc.test.ts › «a glossary entry with a double space still highlights»
- **Шаги:** `makeSegmenter([{word:'de  manhã'}])('Saio de manhã.')`.
- **Ожидается:** «de manhã» подсвечено.
- **Фактически:** регулярка совпадает, но ключ не находится → без подсветки.

### A-17 · Шпаргалка: вступление, начинающееся с жирного/курсива, принимается за список
- **Серьёзность:** P3
- **Где:** src/features/library/cheatsheets.ts:58 (`^\s*(#|\||>|-|\*|\d+\.)` — любой ведущий `*`)
- **Тест:** tests/unit/misc.test.ts › «intro may start with bold / italic text»
- **Шаги:** `parseCheatsheet({id:'b', markdown:'# T\n\n**Ser** e *estar*: resumo.\n\n## A'})`.
- **Ожидается:** `intro === 'Ser e estar: resumo.'`.
- **Фактически:** `intro === undefined`. Сейчас все шпаргалки начинаются с обычного текста.

### A-18 · Источник слова неизвестного вида подписывается «undefined «id»»
- **Серьёзность:** P3
- **Где:** src/features/words/source.ts:104 (нет fallback в карте вид → подпись)
- **Тест:** tests/unit/words-source.test.ts › «unknown kind never renders the word «undefined»»
- **Шаги:** `sourceLabel('podcast:ep1')` (данные от другой версии, импорт).
- **Ожидается:** нейтральная подпись («Источник «ep1»» или сырой src).
- **Фактически:** «undefined «ep1»» на странице слова.

### A-19 · Фразы контента с предлогом «a» сохраняются как существительные ж. р. («a pé» → «pé», ж. р.)
- **Серьёзность:** P2
- **Где:** src/features/words/lexicon.ts:75 (`ARTICLE_RE` считает любое ведущее «a »/«o » артиклем), :78-84 (`bareLemma`), :121 (`pos = 'noun'`); то же при сборке словаря — scripts/lexicon.ts `parseVocabItem` (≈ :155) → в src/generated/lexicon.json запись `pé#noun … 'пешком','f'`
- **Тесты:** tests/unit/words-lexicon.test.ts › «prepositional «a …» phrases are not turned into feminine nouns»; «… «a pé» from transportes-e-cidade is not saved as the feminine noun «pé»»
- **Шаги:** словарь темы «transportes-e-cidade» → сохранить «a pé — пешком» (content/vocab/transportes-e-cidade.json:324); без лексикона — «a partir de».
- **Ожидается:** наречное выражение «a pé» сохраняется как есть, без рода и части речи «сущ.».
- **Фактически:** `lexId 'pé#noun'`, ж. р. (а «pé» — м. р.); совпадает по id с «o pé» (нога) → при сохранении «o pé» два слова сливаются с переводом «пешком». «a partir de» без лексикона → сущ. «partir de», ж. р.

### A-20 · Правка режимов карточек слова снимает паузу с карточек, приостановленных вручную
- **Серьёзность:** P2
- **Где:** src/features/words/wordOps.ts:351-357 (любой патч `modes` пересчитывает `suspended` у всех карточек слова)
- **Тест:** tests/unit/words-ops.test.ts › «changing one mode leaves a hand-paused card of another mode paused»
- **Шаги:** слово с карточками recognize/produce/listen → «Приостановить» produce в списке карточек → в редакторе снять только «На слух» (`planUpdateWord(state, id, {modes:['recognize','produce','cloze']})`).
- **Ожидается:** listen приостановлена, produce остаётся на паузе (как в `planApplyEnabledModes`).
- **Фактически:** produce снова активна и возвращается в повторение.

### A-21 · `splitByMask` неверно делит подсветку, если многословная форма повторяется подряд
- **Серьёзность:** P3
- **Где:** src/features/words/cloze.ts:102 (`full.indexOf(next, pos)` находит разделитель внутри формы)
- **Тест:** tests/unit/words-cloze-status.test.ts › «multi-word form repeated back to back is highlighted whole»
- **Шаги:** `splitByMask('bom dia bom dia', maskForm('bom dia bom dia', 'bom dia'))`.
- **Ожидается:** `bom dia` | ` ` | `bom dia` (обе формы выделены целиком).
- **Фактически:** выделены «bom» и «dia bom dia».

### A-22 · Импорт списка: строка «palavra = перевод; другой перевод» пропускается как «no-pt»
- **Серьёзность:** P3
- **Где:** src/features/words/importList.ts:45 (`;` пробуется раньше `=`)
- **Тест:** tests/unit/words-import.test.ts › ««=» with several «;»-separated meanings keeps the word»
- **Шаги:** «Импорт списка» → `sumo = сок; нектар`.
- **Ожидается:** `{pt:'sumo', ru:'сок; нектар'}`.
- **Фактически:** `{pt:'sumo = сок', ru:'нектар'}` → строка пропущена (в pt кириллица). Пользователь видит её в пропущенных.

### A-23 · Импорт списка: перевод в кавычках с точкой в конце сохраняется с лишней кавычкой
- **Серьёзность:** P3
- **Где:** src/features/words/importList.ts:49 (`tidy`: кавычки снимаются до хвостовой пунктуации)
- **Тест:** tests/unit/words-import.test.ts › «quoted translation followed by a period»
- **Шаги:** `splitImportLine('"pão" — "хлеб".')` / `'«pão» — «хлеб».'`.
- **Ожидается:** `{pt:'pão', ru:'хлеб'}`.
- **Фактически:** `ru: 'хлеб"'` / `'хлеб»'`.
