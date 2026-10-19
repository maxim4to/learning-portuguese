# Тестирование

Как устроены тесты, как их запускать, что уже покрыто и план покрытия для пяти параллельных потоков работ.
Найденные тестами дефекты — в [testing-bugs.md](testing-bugs.md).

## 1. Стек

| Слой | Инструмент | Где | Окружение |
|---|---|---|---|
| Unit / логика | Vitest 5.0.5 (`--project unit`) | `tests/unit/**/*.test.ts`, `scripts/*.test.ts` | node |
| Компоненты | Vitest 5.0.5 (`--project component`) + jsdom 30.1.3 + @testing-library/react 16.3.3, user-event 14.6.8, jest-dom 7.0.1 | `tests/component/**/*.test.tsx` | jsdom |
| Покрытие | @vitest/coverage-v8 5.0.5 | `coverage/` (html, json-summary) | — |
| E2E, локальный режим | @playwright/test 1.64.1 (Chromium + WebKit) | `tests/e2e/local/**/*.spec.ts` | собранное приложение, `vite preview`, без Firebase |
| E2E, эмуляторы | @playwright/test + Firebase Auth/Firestore emulators | `tests/e2e/emulator/**/*.spec.ts` | сборка с demo-конфигом Firebase |
| Доступность | @axe-core/playwright 4.14.0 | спеки с тегом `@a11y` | — |
| Правила Firestore | node:test + @firebase/rules-unit-testing | `scripts/rules.test.ts` | эмулятор Firestore |
| Контент | `scripts/validate.ts` (zod) | `content/**` | node |

Существующие тесты на `node:test` (words, lexicon, brazilianisms, store, integrations, reset) переведены на
Vitest без переноса файлов: поменялся только импорт (`from 'vitest'`), `t.assert.snapshot` → `toMatchSnapshot()`
(снапшот промпта теперь в `scripts/__snapshots__/integrations.test.ts.snap`, содержимое то же), `t.diagnostic` → `console.info`.
`scripts/rules.test.ts` остался на `node:test` (ему нужен эмулятор, запускается `npm run test:rules`).

### Команды

```bash
npm test                    # Vitest: unit + component, один прогон
npm run test:watch          # Vitest в watch-режиме
npm run test:unit           # только unit (то же, что раньше, но через Vitest; включает reset.test.ts)
npm run test:component      # только компонентные
npm run test:coverage       # Vitest + покрытие src/ → coverage/index.html
npm run test:types          # tsc по tests/ (tsconfig.test.json; в `npm run build` не входит)
npm run test:e2e            # Playwright, локальный режим, 3 проекта (см. ниже)
npm run test:a11y           # только спеки с тегом @a11y
npm run test:e2e:emulator   # firebase emulators:exec (auth+firestore) → Playwright по tests/e2e/emulator
npm run test:rules          # правила Firestore на эмуляторе (как раньше)
npm run test:lint           # линтер бразилизмов (Vitest)
npm run test:all            # types → vitest → validate → e2e → rules → e2e:emulator
```

Полезное: `npx playwright test --project desktop-chromium tests/e2e/local/smoke.spec.ts`, `--ui`, `--debug`,
`npx playwright show-report playwright-report/local`, трейс упавшего теста — `npx playwright show-trace test-results/…/trace.zip`.
Нужна Java 11+ для эмуляторов (есть `openjdk@21`). Браузеры Playwright: `npx playwright install chromium webkit`.

### Как устроен e2e

- **Локальный режим** (`playwright.config.ts`): `webServer` собирает приложение `vite build` в `.e2e/local-dist`
  (≈2 с) с пустыми `VITE_FIREBASE_*` (→ `LocalRepository`, без входа) и поднимает `vite preview` на `:4317`,
  base `/learning-portuguese/`. Локально уже запущенный сервер переиспользуется (`reuseExistingServer`) —
  **после правок в `src/` его надо перезапустить** (или убить процесс на 4317), иначе тесты пойдут по старой сборке.
  Проекты: `desktop-chromium` (1280×900), `mobile-webkit` (iPhone 15), `mobile-chromium` (Pixel 7).
  Service worker заблокирован (`serviceWorkers: 'block'`); PWA-спеки включают его сами: `test.use({ serviceWorkers: 'allow' })`.
  Трейс и скриншот — только для упавших тестов. Локаль `ru-RU`, часовой пояс `Europe/Lisbon`.
- **Эмуляторы** (`playwright.emulator.config.ts`): сборка в `.e2e/emu-dist` с demo-конфигом (`demo-ptpt`) и
  `VITE_FIREBASE_EMULATOR_HOST=127.0.0.1`, preview на `:4318`. В этом режиме `src/data/auth.ts` выставляет
  `window.__emuSignIn(email)` — вход без Google-попапа. `globalSetup` очищает эмуляторы и загружает настоящий
  `firestore.rules`, подставив в строку `ALLOWED_EMAILS` пул тестовых адресов. Почты только тестовые
  (`e2e-w<N>-a|b@example.test`, `e2e-denied@example.test` — не в списке).
- **Сеть**: общий фикстур `networkGuard` (tests/helpers/test.ts) обрывает любой запрос не на localhost/127.0.0.1
  и роняет тест — e2e никогда не ходит в прод (Firebase, Google и т. п.). Второй `fixture` роняет тест на
  необработанном исключении в странице (`pageerror`); `console.error` собираются в `consoleErrors`.

### Вспомогательный код

| Файл | Что даёт |
|---|---|
| `tests/fixtures/seed.ts` | Строители данных (`progress`, `card`, `fsrs`, `fsrsNew`, `word`, `wordCard`, `errorEntry`, `NOW`, `DAY`) и раскладка хранилища: `localEntries(seed)` — ключи локального режима (`ptpt:v1:progress/cards/words/errors/settings/theme`), `snapshotEntries(user, seed)` — снапшот устройства `ptpt:v1:snap:<uid>` + `ptpt:v1:auth-user`. Общий для Vitest и Playwright. |
| `tests/helpers/test.ts` | `test`/`expect` для всех e2e: `seed(seed, {mode})` (пишет localStorage до старта приложения, один раз — перезагрузка не затирает данные), `app` (page objects), `networkGuard`, `consoleErrors`. |
| `tests/helpers/pages.ts` | Page objects: `App` (goto, main, heading, storage), `Nav`, `ExerciseRunner` (поле ответа, «Проверить», «Не знаю», «Дальше» с учётом 250 мс защиты от дребезга Enter), `LookupCard`, `ReviewSession`. Только role/label-селекторы. |
| `tests/helpers/emulator.ts` | REST к эмуляторам (`fsSet/fsGet/fsList/wipeUser`, владелец `Bearer owner` в обход правил), `installRules`, `workerUsers(testInfo)`, `signIn`, `signInFresh`, `syncStatus`. |
| `tests/helpers/render.tsx` | `renderWithProviders(ui, {route, path, seed, capture})` — MemoryRouter + AuthProvider + **свежий** локальный `DataStore` поверх засеянного localStorage + WordsProvider + ToastProvider (+ WordCaptureProvider). `renderApp(path, {seed})` — всё `<App/>` целиком (со сбросом модулей: в приложении модульный синглтон локального стора). |
| `tests/helpers/setup-dom.ts` | jest-dom, cleanup, очистка local/sessionStorage перед каждым тестом, заглушки: matchMedia, Intersection/ResizeObserver, `CSS.highlights` + `Highlight`, speechSynthesis + `SpeechSynthesisUtterance`, play/pause у media, clipboard, scrollIntoView, `<dialog>`, requestIdleCallback, caret*FromPoint, vibrate. |
| `tests/helpers/pwa-register-stub.ts` | Заглушка `virtual:pwa-register/react`; `pwaStub.needRefresh = true` до рендера включает UpdatePrompt. |

### Smoke-тесты (проверяют, что каждый слой работает)

| Слой | Файл | Что делает | Результат |
|---|---|---|---|
| component | `tests/component/ProgressBar.test.tsx` | ProgressBar (aria, сегменты), Button (type, onClick) | ✅ 3 теста |
| component (всё приложение) | `tests/component/App.smoke.test.tsx` | `renderApp('/syllabus')` с засеянным прогрессом 90% | ✅ |
| e2e local | `tests/e2e/local/smoke.spec.ts` | Главная → «Курс» → тема «Ser и estar» → «Упражнения» → ответ `sou` с клавиатуры → «Верно!» → Enter → следующее задание; прогон переживает перезагрузку | ✅ ×3 проекта |
| a11y | `tests/e2e/local/a11y-smoke.spec.ts` | axe (WCAG 2.1 A/AA) на главной, светлая и тёмная тема | ✅ ×3 проекта, 0 нарушений |
| e2e emulator | `tests/e2e/emulator/smoke.spec.ts` | Вход тестового пользователя → переключатель в Настройках → значение в Firestore → после перезагрузки → на «новом устройстве» (чистый контекст) | ✅ |

## 2. Текущее покрытие

`npm run test:coverage` (unit + component smoke): **строки 32.9 %**, ветви 21.7 %, функции 23.1 %.
Только unit-тесты (до этой работы): **строки 22.3 %**, ветви 18.4 %, функции 15.9 %.

Покрытие строк по каталогам (unit + smoke):

| Каталог | Строк | Покрытие |
|---|---:|---:|
| src/engine (fsrs, grading, lexicon/*) | 740 | 86.5 % |
| src/data (store, snapshot, localBackend, LocalRepository, firestoreBackend) | 721 | 66.2 % |
| src/content | 176 | 79.5 % |
| src/features/words | 2109 | 32.1 % |
| src/features/tutor | 387 | 16.8 % |
| src/features/srs | 410 | 8.3 % |
| src/features/exercises | 596 | 2.3 % |
| src/features/lessons | 237 | 4.6 % |
| src/features/diagnostic | 188 | 6.4 % |
| src/features/situations | 226 | 5.8 % |
| src/features/library | 211 | 3.3 % |
| src/features/settings | 198 | 1.5 % |
| src/features/dashboard | 141 | 17.7 % |
| src/components | 729 | 26.1 % |

Чистая логика без единого теста (0 % в unit): `dashboard/stats.ts`, `diagnostic/plan.ts`, `diagnostic/persist.ts`,
`exercises/{grade,describe,feedbackText,keyboard,runPersist}.ts`, `lessons/{nextSteps,persist}.ts`,
`library/{cheatsheets,highlight,format}.ts`, `practice/{levels,paths}.ts`, `situations/persist.ts`,
`srs/{cardContent,cardOps,kinds,newCardCounter,useReviewPicker}.ts`, `tutor/{items,modes,persist,clipboard}.ts`
(`text.ts` 7 %, `prompts.ts` 54 %), `words/{learn,source,draft,lexicon,wordReview,useWords}.ts`,
`words/capture/{hitTest,highlights,anchor,store}.ts`, `content/build.ts` (проверяется только `npm run validate`),
`engine/audio.ts`, `engine/audioHash.ts`, `app/{nav,theme}.ts`, `data/firestoreBackend.ts`. Хорошо покрыты:
store (86 %), lexicon (93–98 %), grading (97 %), wordOps (93 %), importList (95 %), cloze/status/savedMatch (98–100 %).

## 3. Инвентарь функциональности

Маршруты (`src/app/App.tsx`, base `/learning-portuguese/`). «Сейчас» — покрытие до потоков A–E.

| Маршрут / поток | Файлы | Сейчас |
|---|---|---|
| `/` Главная: «Сегодня», онбординг (диагностика / первая тема), следующий шаг, виджет «Мои слова», серия, карточки к повторению | `features/dashboard/*`, `features/words/WordsWidget.tsx`, `lessons/nextSteps.ts` | smoke (заголовок), a11y |
| `/syllabus` Курс: модули A1–B2, статусы тем (красн/жёлт/зел), сегментный прогресс | `features/syllabus/*` | smoke |
| `/topic/:id` Тема: вкладки Теория / Примеры / Упражнения / Мини-тест / С агентом (`?tab=`), шапка с прогрессом, «в повторение» у примеров, экран результата, следующие шаги, неизвестная тема | `features/lessons/*` | smoke (1 упражнение) |
| Раннер упражнений: 8 видов — fill-gap, choice / listen-choice, transform, translate-ru-pt, listen-type, order-words, match, speak-shadow; клавиатура (Enter/Shift+Enter/1–9/стрелки/Ctrl+Enter), акценты, «Не знаю», мягкие акценты, сохранение прогона в sessionStorage, журнал ошибок, error-карточки | `features/exercises/*`, `engine/grading.ts` | grading unit; e2e 1 fill-gap |
| `/diagnostic` Диагностика: прогон, сохранение/возобновление, результат и план | `features/diagnostic/*` | нет |
| `/review` Повторение: «Сессия» / «Все карточки», выбор режима (ReviewPicker), сессия FSRS, оценки, лимит новых в день, пустые состояния, бейдж «к повторению» в навигации | `features/srs/*`, `engine/fsrs.ts` | dueCards/fsrs unit |
| `/words` Мой словарь: список, фильтры/статусы, поиск, «Добавить слово», «Импорт списка», «Учить новые» (LearnNewSession), вкладки повторения | `features/words/*` | логика unit (wordOps, status, importList) |
| `/words/:id` Карточка слова: редактор, режимы карточек, источники, пауза/знаю, удаление | `features/words/WordPage.tsx`, `WordEditor.tsx` | нет |
| Захват слова везде: тап/двойной клик/выделение/«/» и «Найти слово», LookupCard (popover/sheet), блокировка в упражнениях до ответа, добавить/убрать/отменить, подсветка сохранённых (CSS Highlights) | `features/words/capture/*` | text/options/savedMatch unit |
| `/practice/situations[/:id]` Ситуации: диалог (показ RU), фразы, словарь, письмо (черновик), практика | `features/situations/*` | нет |
| `/practice/cheatsheets[/:id]` Шпаргалки (markdown, печать) | `features/library/CheatsheetPage.tsx`, `cheatsheets.ts` | нет |
| `/practice/vocab[/:id]` Тематические словари + VocabQuiz | `features/library/VocabThemePage.tsx`, `VocabQuiz.tsx` | нет |
| `/practice/reading[/:id]` Чтение + вопросы, подсветка | `features/library/ReadingPage.tsx`, `ReadingQuestions.tsx`, `highlight.ts` | нет |
| `/practice/tutor` Агент: режимы промптов, копирование, самооценка/итог «Итог: N/M» | `features/tutor/*` | prompts/«Мои слова» unit |
| Старые URL → редиректы (`/situations`, `/situation/:id`, `/library/*`, `/tutor`), `*` → 404 | `practice/redirects.tsx`, `app/NotFoundPage.tsx` | нет |
| `/settings` Тема, голос/скорость, мягкие акценты, новых в день, словарь (тап, ввод ответа, подсветка, виды карточек), синхронизация, экспорт/импорт, сброс прогресса, выход | `features/settings/SettingsPage.tsx`, `features/sync/*` | e2e emulator: один переключатель |
| Навигация: верхняя панель / нижний таб-бар (скрывается при прокрутке), активный пункт, «К содержанию», SubNav практики | `app/Layout.tsx`, `app/nav.ts`, `components/SubNav.tsx` | smoke |
| Данные: local-first стор, снапшот по uid, оптимистичные записи и откат, конфликты, мульти-вкладки, офлайн, сброс, экспорт/импорт, изоляция пользователей, AccessDenied, legacy-cleanup | `src/data/*` | store/reset unit; правила; 1 e2e emulator |
| PWA: манифест, SW precache, офлайн-запуск, «Доступна новая версия» (UpdatePrompt), офлайн-баннер | `vite.config.ts`, `components/AppStatus.tsx` | нет |
| Тема светлая/тёмная, без вспышки (inline-скрипт в index.html) | `app/theme.ts`, `index.html` | a11y smoke в обеих темах |

Модули движка: `engine/fsrs.ts` (createSrsCard, schedule, dueCards), `engine/grading.ts`, `engine/lexicon/*`
(normalize, lookup, guess, morph, conjugate, endings, irregular), `engine/audio.ts` + `audioHash.ts`,
`content/build.ts` + `schema.ts`.

## 4. План: пять непересекающихся потоков

### Общие правила для всех потоков

1. **Только тесты.** `src/`, `content/`, конфиги приложения не менять. Если без `data-testid` никак — не добавлять,
   а перечислить нужные атрибуты в отчёте (файл:строка, зачем). Селекторы: `getByRole` / `getByLabel` / `getByText`.
2. **Владение файлами строгое** (таблица ниже). Общие файлы — `tests/helpers/{test.ts,pages.ts,emulator.ts,render.tsx,setup-dom.ts,pwa-register-stub.ts}`,
   `tests/fixtures/seed.ts`, `vitest.config.ts`, `playwright*.config.ts`, `package.json` — **заморожены**. Нужен
   новый хелпер — в свой файл (`tests/helpers/<поток>-*.ts`, `tests/fixtures/<поток>-*.ts`), можно наследовать
   классы из `pages.ts`. Если общий файл реально мешает — опишите правку в отчёте, не делайте её.
3. **Баг найден** → запись в своей секции `docs/testing-bugs.md` (формат там же), тест остаётся и помечается
   `test.fails` (Vitest) / `test.fail(true, 'BUG X-NN …')` или `test.fixme` (Playwright). Красных тестов в итоге нет.
4. Перед сдачей: `npm run test:types`, `npm run lint`, свой набор зелёный 2 раза подряд (на флейки), e2e — во всех трёх проектах
   (или явный `test.skip(isMobile, 'причина')`). Без `waitForTimeout` для синхронизации — только web-first `expect`
   (исключение: задокументированные таймеры приложения, как 250 мс у «Дальше»).
5. Детерминизм: время — `NOW` из `seed.ts` и `vi.useFakeTimers()/vi.setSystemTime()` в Vitest, `page.clock.install({ time })` в Playwright;
   данные — через `seed()` / REST эмулятора, не прокликиванием.

### A · Движок и логика (unit, Vitest node)

**Владеет:** `tests/unit/**`, существующие `scripts/{words,lexicon,store,integrations,reset,brazilianisms}.test.ts`
и `scripts/__snapshots__/**`.

| Приоритет | Что | Файлы тестов |
|---|---|---|
| P0 | FSRS: `createSrsCard`, `schedule` по всем оценкам и состояниям, `dueCards` (границы due, suspended, лимит новых, сиблинги) | `tests/unit/fsrs.test.ts` |
| P0 | Грейдинг упражнений: `exercises/grade.ts` для всех 8 видов, мягкие акценты, регистр/пунктуация/апострофы, множественные пропуски, варианты ответа | `tests/unit/exercise-grade.test.ts` |
| P0 | Store: оставшиеся ветки store.ts/snapshot.ts (квота, MAX_CHARS, forgetUser во время записи, dispose, markReady/boot), firestoreBackend через фейковый SDK (по возможности) | `tests/unit/store-extra.test.ts`, `tests/unit/snapshot.test.ts` |
| P0 | Прогресс темы: `applyResult`, `statusFromPct` (пороги 0.6/0.85), история ≤20, `parseExportBundle` на мусоре | `tests/unit/progress.test.ts` |
| P1 | `lessons/nextSteps.ts`, `lessons/persist.ts` (журнал ошибок, дедупликация за сессию), `exercises/runPersist.ts` | `tests/unit/lessons.test.ts` |
| P1 | `diagnostic/plan.ts` + `persist.ts`, `dashboard/stats.ts` (серия, счётчики, часовые пояса/полночь) | `tests/unit/diagnostic.test.ts`, `tests/unit/stats.test.ts` |
| P1 | Словарь: `words/{learn,source,draft,lexicon,wordReview}.ts`, `useWords.ts` (WordsStore без React), `srs/{cardContent,cardOps,kinds,newCardCounter}.ts` | `tests/unit/words-*.test.ts`, `tests/unit/srs-*.test.ts` |
| P1 | Тьютор: `tutor/{text,items,modes,persist,prompts}.ts` — разбор «Итог: N/M · Оценка …», все режимы промптов (снапшоты), лимиты | `tests/unit/tutor.test.ts` |
| P2 | Контент-инварианты: `content/build.ts` (ошибки/предупреждения на сломанных фикстурах), для всего `content/`: уникальность id, ответы проходят собственный грейдер, у `listen-*` есть mp3 (`audioHash`), ссылки `requires` существуют, нет бразилизмов | `tests/unit/content-invariants.test.ts` |
| P2 | `practice/{paths,levels}.ts`, `library/{cheatsheets,highlight,format}.ts`, `app/nav.ts` (isNavActive), `engine/audioHash.ts`, `features/exercises/{describe,feedbackText,keyboard}.ts` (чистые части) | `tests/unit/misc.test.ts` |

Цель: `src/engine`, `src/data` (кроме firebase/auth), все `*.ts` в `src/features` ≥ 85 % строк.

### B · Компоненты (Vitest + jsdom + RTL)

**Владеет:** `tests/component/**` (включая smoke-файлы), `tests/fixtures/b-*.ts`, `tests/helpers/b-*.tsx`.

| Приоритет | Что | Файлы |
|---|---|---|
| P0 | Каждый вид упражнения отдельно (`kinds/*.tsx`) + `ExerciseRunner`: ввод, Enter/Shift+Enter, 1–9, стрелки, Ctrl+Enter в order-words, match (выбор пар, ошибка), «Не знаю», фидбек, защита «Дальше» 250 мс, возобновление прогона из sessionStorage, «Завершить» → onDone | `tests/component/exercises/*.test.tsx` |
| P0 | `ReviewSession` + `CardFace`/`WordCardFace`: показ, переворот, ввод ответа (typeWordAnswers), оценки, конец сессии; `ReviewPicker` (режимы, счётчики) | `tests/component/srs/*.test.tsx` |
| P0 | `LookupCard` (lemma, формы, значения, «Добавить»/«Убрать»/отмена, блокировка в упражнении), `ImportListDialog`, `WordEditor` | `tests/component/words/*.test.tsx` |
| P1 | `WordsPage` фильтры/поиск/сортировка/пустые состояния, `WordList`, `LearnNewSession`, `WordsWidget` | `tests/component/words/*.test.tsx` |
| P1 | `SettingsPage`: все переключатели/слайдеры пишут в стор, экспорт (Blob), импорт (валидный/битый файл), диалог сброса с вводом «СБРОСИТЬ» | `tests/component/settings.test.tsx` |
| P1 | Базовые: `Dialog` (фокус-ловушка, Esc, возврат фокуса), `Tabs`/`SubNav` (стрелки, Home/End, aria), `SegmentedControl`, `Switch`, `ProgressBar`, `ProgressRing`, `Toast`, `UpdatePrompt`/`OfflineBanner` (через `pwaStub`, событие offline), `SpeakButton`, `Markdown` | `tests/component/ui/*.test.tsx` |
| P2 | Страницы целиком через `renderApp`: Dashboard (онбординг vs. с прогрессом), Syllabus статусы, ResultScreen, DiagnosticResult, TutorPanel (копирование в clipboard) | `tests/component/pages/*.test.tsx` |

### C · E2E локально: курс и практика (Playwright)

**Владеет:** `tests/e2e/local/course/**`, `tests/e2e/local/practice/**`, `tests/e2e/local/navigation/**`,
`tests/e2e/local/smoke.spec.ts`, `tests/helpers/c-*.ts`.

| Приоритет | Сценарий | Файл |
|---|---|---|
| P0 | Полный урок темы: все виды упражнений в одном прогоне, **только клавиатура** на desktop, тач на mobile; ошибки → журнал/карточки ошибок; экран результата; статус темы на «Курсе» меняется | `course/lesson-full.spec.ts` |
| P0 | Мини-тест: прохождение, процент, история попыток, повторная попытка | `course/mini-test.spec.ts` |
| P0 | Диагностика: старт, прерывание и возобновление после перезагрузки, результат, план, `lastDiagnosticAt` | `course/diagnostic.spec.ts` |
| P1 | Вкладки темы: `?tab=` в URL, назад/вперёд, прогон переживает переключение вкладок, неизвестная тема (MissingTopicPage), «в повторение» у примеров | `course/topic-tabs.spec.ts` |
| P1 | Главная: онбординг → после прогресса «следующий шаг», серия, карточки к повторению | `course/dashboard.spec.ts` |
| P1 | Ситуации: диалог (показ RU, аудио-кнопки), фразы, письмо (черновик сохраняется), практика | `practice/situations.spec.ts` |
| P1 | Чтение (вопросы), тематические словари (VocabQuiz), шпаргалки (рендер markdown, print CSS) | `practice/reading.spec.ts`, `practice/vocab.spec.ts`, `practice/cheatsheets.spec.ts` |
| P1 | Навигация: каждый пункт меню, активное состояние на вложенных путях, все старые URL редиректят, 404, «К содержанию», таб-бар на телефоне прячется при прокрутке вниз и возвращается | `navigation/routes.spec.ts`, `navigation/tab-bar.spec.ts` |
| P2 | Агент (`/practice/tutor`, вкладка «С агентом»): выбор режима, копирование промпта (clipboard permission в Chromium), ввод итога | `practice/tutor.spec.ts` |

### D · E2E локально: словарь (Playwright)

**Владеет:** `tests/e2e/local/dictionary/**`, `tests/helpers/d-*.ts`, `tests/fixtures/d-*.ts`.

| Приоритет | Сценарий | Файл |
|---|---|---|
| P0 | Захват: тап по слову (настройка lookupOnTap вкл/выкл), двойной клик, выделение фразы (≤6 слов), «/» и «Найти слово»; popover на desktop, sheet на телефоне; Esc и возврат фокуса | `dictionary/capture.spec.ts` |
| P0 | Блокировка: в упражнении слово нельзя посмотреть до ответа, после ответа — можно; Enter не уходит в раннер, пока карточка открыта | `dictionary/lock.spec.ts` |
| P0 | Добавить → в списке «Мой словарь» и карточка в повторении; убрать; отмена (тост); повторное добавление той же леммы из другой формы (`levanto-me` → `levantar-se`) | `dictionary/add-remove.spec.ts` |
| P1 | `/words`: фильтры по статусу, поиск, счётчики в боковой панели; `/words/:id`: редактирование, пауза, «знаю», удаление, источники со ссылками | `dictionary/words-page.spec.ts`, `dictionary/word-page.spec.ts` |
| P1 | «Учить новые», режимы повторения и поэтапное открытие (recognize → produce → cloze/listen) с засеянным FSRS-состоянием и `page.clock` | `dictionary/learn-review.spec.ts` |
| P1 | Подсветка сохранённых слов (CSS Highlights) в диалоге/тексте/теории, выключение в настройках, без подсветки в упражнении до ответа | `dictionary/highlights.spec.ts` |
| P2 | Импорт списка (вставка «palavra — перевод», неизвестные слова, дубликаты), промпт «Мои слова» — копирование | `dictionary/import.spec.ts`, `dictionary/tutor-words.spec.ts` |

### E · Данные и платформа

**Владеет:** `tests/e2e/emulator/**` (включая smoke), `tests/e2e/local/platform/**`, `tests/e2e/local/a11y-smoke.spec.ts`,
`tests/helpers/e-*.ts`. `tests/helpers/emulator*.ts` — заморожены (расширять в `e-*.ts`).

| Приоритет | Сценарий | Файл |
|---|---|---|
| P0 | Эмулятор: офлайн-запись в очереди → синхронизация; перезагрузка офлайн из снапшота; две вкладки видят изменения друг друга; два пользователя изолированы (выход стирает снапшот); `e2e-denied@` → AccessDenied; конфликт: сервер меняет документ во время локальной записи | `emulator/sync.spec.ts`, `emulator/isolation.spec.ts`, `emulator/offline.spec.ts` |
| P0 | Сброс прогресса (эмулятор и локально): что удаляется/остаётся (тема, settings, снапшоты), бейджи обнуляются; экспорт → импорт (round-trip, старый файл без `words`, битый файл) | `emulator/reset-export.spec.ts`, `platform/local-data.spec.ts` |
| P1 | Персистентность локального режима: каждая запись (прогресс, карточки, слова, настройки, ошибки) переживает перезагрузку и видна во второй вкладке (`storage` event); legacy-ключи/карточки чистятся | `platform/local-persistence.spec.ts` |
| P1 | PWA (preview + SW): манифест, установка SW, офлайн-запуск и навигация по закэшированным маршрутам, аудио из runtime-кэша, обновление: новая сборка → «Обновить» → новая версия без потери прогона | `platform/pwa.spec.ts` (`test.use({ serviceWorkers: 'allow' })`, только chromium) |
| P1 | a11y: axe на **каждом** маршруте (включая детальные страницы, открытые диалоги, LookupCard) в обеих темах; видимый фокус; `prefers-reduced-motion` | `platform/a11y.spec.ts` (тег `@a11y`) |
| P2 | Визуальная устойчивость: нет горизонтального скролла на 360/390/768/1440 на всех маршрутах; длинные слова; таб-бар не перекрывает «Дальше» | `platform/overflow.spec.ts` |
| P2 | Бюджеты: размеры чанков `.e2e/local-dist/assets` (сейчас `content` ≈ 1.54 MB raw / 406 kB gzip, главный чанк, lazy-словарь), precache ≤ 5 MB (сейчас 66 файлов, 4.94 MB), LCP/TTI главной на mobile-chromium с троттлингом | `platform/budgets.spec.ts` |

## 5. Наблюдения при настройке (не баги приложения, но стоит знать)

- `vite build` выводит предупреждение Lightning CSS о `::highlight(...)` («not recognized as a valid pseudo-element») —
  правило всё равно попадает в CSS и работает в браузерах; проверить в потоке D (подсветка), что стиль применяется.
- Precache PWA 4.94 MB при лимите `maximumFileSizeToCacheInBytes` 5 MB на файл; чанк `content` 1.54 MB — кандидат
  в бюджет (поток E).
- Раннер намеренно не забирает фокус при открытии вкладки «Упражнения» (только по Tab/первой клавише) и игнорирует
  Enter на «Дальше» в течение 250 мс после ответа — page object это учитывает.
