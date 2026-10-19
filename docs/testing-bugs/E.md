# Баги потока E (данные и платформа)

Формат записи — как в [../testing-bugs.md](../testing-bugs.md); серьёзность здесь — P0–P3
(P0 — потеря данных / приложение не открывается у всех, P1 — ломает основной сценарий или открытие приложения при
определённых данных, P2 — ошибка с обходом / редкий сценарий с потерей данных, P3 — косметика, a11y-мелочи).
Тесты, воспроизводящие баги, остаются в наборе с `test.fail(true, 'BUG E-NN …')`.

Прогон: `E2E_PORT=4323 E2E_OUT_DIR=.e2e/E-dist npx playwright test tests/e2e/local/platform`,
`E2E_EMU_PORT=4324 npm run test:e2e:emulator`. Трейсы упавших тестов — `test-results/…/trace.zip`
(для `test.fail` трейс не сохраняется: снимите пометку и запустите один тест).

### E-01 · Старое офлайн-повторение карточки затирает более новое с другого устройства
- **Серьёзность:** P2 (потеря прогресса повторения; нужен офлайн + повторение той же карточки на двух устройствах)
- **Где:** src/data/store.ts:343–356 (`applyRemote` кладёт в `shadow` только то, что пришло, пока запись в полёте) и :444–454 (`onAck`: «newer review wins»)
- **Тест:** tests/e2e/emulator/sync.spec.ts › convergence › «card conflict: the newer review wins over a later-acknowledged older one»
- **Шаги:** 1) устройство A: карточка `err-1` к повторению; запись в Firestore задержана (офлайн); оценка «Хорошо» (last_review = T, reps 4).
  2) Устройство B за это время повторило ту же карточку позже (last_review = T+1 ч, reps 9) — сервер уже хранит её; слушатель A эту версию получил.
  3) A снова онлайн, запись подтверждается.
- **Ожидается:** по политике store.ts («for SRS cards the newer review wins») на сервере и на A остаётся версия B (reps 9).
- **Фактически:** на сервере и в снапшоте A — reps 4 (версия A). Воспроизводится 10/10.
- **Заметки:** Firestore SDK с latency compensation отдаёт в `onSnapshot` документ с наложенной локальной мутацией
  (`hasPendingWrites`), поэтому удалённая версия B никогда не доходит до `shadow`, и проверка `newerCard` в `onAck`
  сравнивает запись саму с собой. Варианты: в `onAck` для `cards` дочитать серверную версию (`getDocFromServer`) или
  писать карточки транзакцией с проверкой `fsrs.last_review`; либо отдельное правило в firestore.rules.

### E-02 · Предложение «Удалить старые карточки слов» не появляется, если карточки пришли после открытия Настроек
- **Серьёзность:** P3
- **Где:** src/features/settings/SettingsPage.tsx:509–519 (`LegacyWordCards`: счётчик считается один раз при монтировании, deps `[words]`)
- **Тест:** tests/e2e/emulator/reset-export.spec.ts › legacy word cards › «the cleanup offer appears when the cards arrive after Settings was opened»
- **Шаги:** 1) новое устройство, сразу открыть /settings и войти; 2) с сервера приходят карточки `w:*` / `g:*`.
- **Ожидается:** блок «Удалить старые карточки слов» появляется.
- **Фактически:** не появляется, пока не уйти со страницы и не вернуться (счётчик остался 0).
- **Заметки:** считать из `useCards()` (как ResetDialog), а не через `countLegacyWordCards()` в эффекте.

### E-03 · Испорченные данные в localStorage (локальный режим) роняют приложение
- **Серьёзность:** P1 (приложение не открывается совсем, пока пользователь сам не почистит хранилище; обхода в UI нет)
- **Где:** src/data/localBackend.ts:22–40 (`read`/`readCol`: защищён только от невалидного JSON, не от неверной формы);
  далее падают потребители: `dashboard/stats.ts` (`p.history` не итерируемо), `engine/fsrs.ts` (`c.fsrs.state`),
  словарь (`normalize` у `undefined`), `errorList` (`[null]` / объект вместо массива → React #520), SettingsPage (`rate: null`).
- **Тест:** tests/e2e/local/platform/local-persistence.spec.ts › corrupted storage › 8 случаев из `KNOWN_CRASH`
- **Шаги:** записать в localStorage, например, `ptpt:v1:progress = [1,2,3]` или `ptpt:v1:cards = {"c1":{"id":"c1"}}`,
  `ptpt:v1:errors = {"x":1}`, `ptpt:v1:settings = {"rate":null,…}`; открыть приложение.
- **Ожидается:** приложение открывается; битые записи пропускаются (как уже сделано для невалидного JSON и `words` при импорте — `isWordEntryLike`).
- **Фактически:** белый экран, `TypeError: t.history is not iterable` / `Cannot read properties of undefined (reading 'state')` / React error #520.
- **Заметки:** невалидный JSON, `null`-документы, неизвестная тема — обрабатываются нормально (тесты зелёные). Нужна
  валидация формы при чтении (zod-схемы уже есть в content/schema — можно лёгкие guard’ы как `isWordEntryLike`).
  Тот же класс проблемы — E-05 (импорт).

### E-04 · Переполнение хранилища (QuotaExceededError) в локальном режиме: необработанное исключение, переключатель врёт
- **Серьёзность:** P2
- **Где:** src/features/settings/SettingsPage.tsx:73 (`void repo.saveSettings(patch).then(…)` без `catch`; `draft` не откатывается);
  src/data/store.ts:429 (в локальном режиме `write` возвращает отклонённый промис вызывающему)
- **Тест:** tests/e2e/local/platform/local-persistence.spec.ts › storage quota › «a settings write that hits the quota is rolled back and reported…»
- **Шаги:** локальный режим; localStorage заполнен (setItem бросает QuotaExceededError); переключить «Не учитывать ошибки в акцентах».
- **Ожидается:** тост «Не удалось сохранить…», переключатель возвращается в «выкл».
- **Фактически:** тост есть (SyncToasts), но в странице необработанное `QuotaExceededError` (unhandledrejection), а переключатель
  остаётся «вкл» (значение из `draft`), хотя ничего не сохранено; после перезагрузки — «выкл».
- **Заметки:** повторение карточки при переполнении не падает (тест зелёный). Тема при недоступном хранилище работает до перезагрузки (задумано).

### E-05 · Импорт резервной копии пропускает документы без обязательных полей — после импорта приложение падает
- **Серьёзность:** P2 (пользователь сам ломает себе данные файлом; в Firebase-режиме испорченные документы уходят и на сервер)
- **Где:** src/data/types.ts:313–316 (`parseExportBundle`: `progress`/`cards`/`errors` принимаются как есть, проверяется только `Array.isArray`)
- **Тест:** tests/e2e/local/platform/local-data.spec.ts › «a backup with malformed documents is rejected or sanitized…»
- **Шаги:** Настройки → «Восстановить из файла» → файл `{"app":"portugues-pt","version":1,"progress":[{"topicId":"a1-ser-estar"}],"cards":[{"id":"c1"}],"errors":[{"id":"e1"}],"settings":{}}` → «Восстановить».
- **Ожидается:** «Ошибка импорта…» или битые записи отброшены; приложение работает.
- **Фактически:** сразу после импорта `TypeError: Cannot read properties of undefined (reading 'state')`, белый экран; после перезагрузки — то же (E-03).
- **Заметки:** для `words` фильтр уже есть (`isWordEntryLike`) — нужен такой же для остальных коллекций.

### E-06 · a11y: у кнопки «Роль B» доступное имя не содержит видимый текст (WCAG 2.5.3 Label in Name)
- **Серьёзность:** P3
- **Где:** src/features/situations/DialogueSection.tsx:190 (`aria-label="Ролевая игра: вы — B"`, видимый текст «Роль B» от 420 px)
- **Тест:** tests/e2e/local/platform/a11y.spec.ts › light/dark theme › «situation (/practice/situations/no-cafe) has no axe violations» (desktop-chromium; на телефонах <420 px текст скрыт — нарушения нет)
- **Шаги:** открыть /practice/situations/no-cafe на ширине ≥ 420 px; axe `label-content-name-mismatch`.
- **Ожидается:** доступное имя начинается с видимого текста, напр. «Роль B — ролевая игра, вы — B».
- **Фактически:** «Ролевая игра: вы — B» (голосовое управление «нажми Роль B» не сработает).

### E-07 · Горизонтальная прокрутка на «С агентом» (/practice/tutor) при ширине 360 px
- **Серьёзность:** P3
- **Где:** src/features/tutor/TutorHubPage.tsx:116 и :148 (`grid … sm:grid-cols-2` без `grid-cols-1`/`minmax(0,1fr)`; карточки `linkCard` с `shrink-0` бейджами)
- **Тест:** tests/e2e/local/platform/overflow.spec.ts › no horizontal overflow › «/practice/tutor at 360px [E-07]»
- **Шаги:** ширина 360 px, данные с прогрессом (RICH_SEED в tests/helpers/e-routes.ts), открыть /practice/tutor.
- **Ожидается:** `scrollWidth` = 360.
- **Фактически:** `scrollWidth` 370: `li` / `a.card…` в списках «Темы для занятия» и «Ситуации для сценок» шириной до 370 px. На 390+ всё в порядке.
- **Заметки:** неявная колонка грида получает min-content самой длинной строки; `grid-cols-1` или `min-w-0` на `li` решает.

## Нужные seam’ы / testid (src/ не менялся)

- Не нужны: всё покрыто role/label-селекторами и REST эмулятора. Удобно было бы (необязательно):
  `data-store-ready` на `<main>` (src/app/Layout.tsx:145) — вместо ожидания по тексту при проверке «нет вспышки пустого состояния»;
  счётчик `pendingWrites` в DOM вне Настроек (сейчас `[data-sync-status]` есть только в src/features/sync/SyncStatusLine.tsx).

## Наблюдения (не баги)

- Firestore SDK при обрыве сети пингует `https://www.google.com/images/cleardot.gif` (проверка связи WebChannel) — в e2e
  этот запрос отвечается локально (`answerConnectivityProbe` в tests/helpers/e-emu.ts), иначе общий networkGuard роняет тест.
- Эмулятор Firestore игнорирует resume token и при любом изменении пересылает слушателю всю коллекцию — сырые счётчики
  трафика эмулятора завышены; оценка стоимости в reads.spec.ts считает только новые версии документов.
- На холодном старте «/» в локальном режиме грузится `Dialog-*.js` (216 kB raw / 69 kB gzip) — кандидат в lazy.
