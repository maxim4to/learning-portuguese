# Скрипты

Офлайн-скрипты для контента и проверки правил Firebase. В сайт ничего из этого не попадает — результат лежит
в `content/` и `public/audio/` и коммитится в git.

Сам учебный контент (JSON в `content/`) пишется вручную или Claude-сабагентами прямо в сессии Claude Code
(без вызовов Anthropic API и без API-ключей) по правилам из `content/README.md`. После любого изменения контента:
`npm run validate`, затем `npm run tts`.

## validate.ts — проверка контента

```bash
npm run validate                    # схемы Zod + перекрёстные ссылки + линтер «бразилизмов»
npm run validate -- --check-audio   # плюс: у каких `audio: true` нет mp3 в public/audio/
```

- Загружает все `content/**/*.json` и валидирует тем же кодом, что и приложение (`src/content/build.ts`).
- Линтер ищет бразильские формы в португальских строках (предупреждения).
- Код выхода 1 при любой ошибке.

## tts.ts — озвучка через edge-tts

```bash
python3 -m pip install --user edge-tts   # один раз
npm run tts -- --dry-run                 # сколько текстов и сколько mp3 не хватает
npm run tts                              # сгенерировать недостающие
npm run tts -- --limit 5                 # пробный запуск на 5 файлах
```

Что озвучивается:
- грамматика: `examples[].pt` с `audio: true`;
- любые упражнения `listen-type` / `listen-choice` (`text`) во всех файлах, включая `diagnostic.json`;
- ситуации: реплики диалога (A — `pt-PT-RaquelNeural`, B — `pt-PT-DuarteNeural`), `phrases[].pt`, `vocab[].pt`;
- словари: `words[].pt` с `audio: true`;
- тексты для чтения: каждый абзац.

Файл: `public/audio/<audioHash(text)>.mp3`, где `audioHash` импортируется из `src/engine/audioHash.ts`
(sha1 hex от `text.trim().normalize("NFC")`) — тот же код, что в приложении. Уже существующие файлы не перегенерируются;
если текст поменялся — появится новый файл (старый можно удалить вручную). Одинаковый текст озвучивается один раз
(голос из диалога имеет приоритет). `public/audio/manifest.json` — `{ hash: { text, voice } }` для отладки.

Лимиты: 2 параллельных запроса, пауза 400 мс, до 4 попыток с экспоненциальной задержкой.

Своя команда TTS вместо `python3 -m edge_tts` (плейсхолдеры `{voice}`, `{text}`, `{out}`; запускается без shell):

```bash
TTS_CMD='edge-tts --voice {voice} --text {text} --write-media {out}' npm run tts
```

## rules.test.ts — тест правил Firestore

```bash
npm run test:rules
```

Поднимает эмулятор Firestore (`firebase emulators:exec`, нужна Java 11+, логин в Firebase не нужен — используется
demo-проект) и проверяет `firestore.rules`: строка `ALLOWED_EMAIL` подменяется тестовым email, проверяется доступ
владельца, отказ чужому аккаунту, неавторизованному, неподтверждённому email и запись в чужой `users/{uid}`,
а также что с плейсхолдером `REPLACE_WITH_YOUR_EMAIL` доступа нет ни у кого.
