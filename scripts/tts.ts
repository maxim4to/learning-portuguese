/**
 * Озвучка контента через edge-tts (голоса pt-PT).
 *
 *   npm run tts                 # сгенерировать недостающие mp3 в public/audio/<sha1>.mp3
 *   npm run tts -- --dry-run    # только посчитать
 *
 * Хэш = audioHash() из src/engine/audioHash.ts (sha1 hex от text.trim().normalize("NFC")) — тот же, что в приложении.
 * Установка: python3 -m pip install --user edge-tts
 * Переопределение команды: TTS_CMD='edge-tts --voice {voice} --text {text} --write-media {out}'
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// единый источник правды для имени файла — тот же модуль, что использует приложение
import { audioHash } from "../src/engine/audioHash.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content");
const AUDIO = path.join(ROOT, "public", "audio");
const MANIFEST = path.join(AUDIO, "manifest.json");

const FEMALE = "pt-PT-RaquelNeural";
const MALE = "pt-PT-DuarteNeural";
const CONCURRENCY = 2;
const DELAY_MS = 400;

type Item = { text: string; voice: string; source: string };

// ---------------------------------------------------------------------------
// Сбор текстов
// ---------------------------------------------------------------------------
function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJson(p));
    else if (e.isFile() && e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function collect(): Item[] {
  const items: Item[] = [];
  const add = (text: unknown, voice: string, source: string) => {
    if (str(text)) items.push({ text, voice, source });
  };

  for (const file of listJson(CONTENT)) {
    const rel = path.relative(CONTENT, file);
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      console.warn(`⚠ пропускаю ${rel}: невалидный JSON (${(e as Error).message})`);
      continue;
    }
    const top = rel.split(path.sep)[0];

    // listen-* упражнения в любом файле (темы, ситуации, чтение, диагностика)
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!isObj(node)) return;
      if ((node.type === "listen-type" || node.type === "listen-choice") && str(node.text)) {
        add(node.text, FEMALE, `${rel}#${node.id ?? "?"}`);
      }
      Object.values(node).forEach(walk);
    };
    walk(data);

    if (!isObj(data)) continue;
    if (top === "grammar") {
      for (const ex of arr(data.examples)) if (isObj(ex) && ex.audio === true) add(ex.pt, FEMALE, `${rel}#examples`);
    } else if (top === "situations") {
      for (const line of arr(data.dialogue))
        if (isObj(line)) add(line.pt, line.speaker === "B" ? MALE : FEMALE, `${rel}#dialogue`);
      for (const ph of arr(data.phrases)) if (isObj(ph)) add(ph.pt, FEMALE, `${rel}#phrases`);
      for (const w of arr(data.vocab)) if (isObj(w)) add(w.pt, FEMALE, `${rel}#vocab`);
    } else if (top === "vocab") {
      for (const w of arr(data.words)) if (isObj(w) && w.audio === true) add(w.pt, FEMALE, `${rel}#words`);
    } else if (top === "reading") {
      for (const p of arr(data.paragraphs)) add(p, FEMALE, `${rel}#paragraphs`);
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Синтез
// ---------------------------------------------------------------------------
/** Текст для диктора: убираем markdown-разметку (хэш при этом считается от исходного текста). */
function speakable(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)[*_](\S)/g, "$1$2")
    .replace(/(\S)[*_](?=\s|$|[.,!?;:])/g, "$1")
    .replace(/_{2,}/g, "…")
    .trim();
}

function buildCommand(voice: string, text: string, out: string): [string, string[]] {
  const tpl = process.env.TTS_CMD;
  if (tpl) {
    const parts = tpl.trim().split(/\s+/);
    const sub = (s: string) => s.replaceAll("{voice}", voice).replaceAll("{text}", text).replaceAll("{out}", out);
    return [parts[0], parts.slice(1).map(sub)];
  }
  // --text=... чтобы текст, начинающийся с «-», не принимался за флаг
  return ["python3", ["-m", "edge_tts", "--voice", voice, `--text=${text}`, "--write-media", out]];
}

function checkEngine(): boolean {
  if (process.env.TTS_CMD) return true;
  const r = spawnSync("python3", ["-c", "import edge_tts"], { stdio: "ignore" });
  return r.status === 0;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.trim().split("\n").slice(-3).join(" | ")}`)),
    );
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function synth(item: Item, out: string): Promise<void> {
  const tmp = `${out}.${process.pid}.tmp.mp3`;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const [cmd, args] = buildCommand(item.voice, speakable(item.text), tmp);
      await run(cmd, args);
      const st = fs.statSync(tmp);
      if (st.size === 0) throw new Error("пустой файл");
      fs.renameSync(tmp, out);
      return;
    } catch (e) {
      lastErr = e;
      fs.rmSync(tmp, { force: true });
      await sleep(1500 * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`npm run tts [-- --dry-run] [--limit N]
  Озвучивает весь контент из content/ в public/audio/<sha1(trim+NFC(text))>.mp3 через edge-tts.
  Голоса: ${FEMALE} (по умолчанию, реплики A), ${MALE} (реплики B).
  --dry-run   только посчитать, сколько файлов есть/нужно
  --limit N   сгенерировать не больше N файлов (для пробы)
  TTS_CMD     своя команда, плейсхолдеры {voice} {text} {out}`);
    return;
  }
  const dryRun = argv.includes("--dry-run");
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Infinity;

  const all = collect();
  // уникальность по хэшу (хэш не зависит от голоса)
  const unique = new Map<string, Item>();
  for (const it of all) {
    const h = await audioHash(it.text);
    const prev = unique.get(h);
    // реплики диалога задают голос явно — они приоритетнее
    if (!prev || (!prev.source.includes("#dialogue") && it.source.includes("#dialogue"))) unique.set(h, it);
  }
  fs.mkdirSync(AUDIO, { recursive: true });
  const missing = [...unique.entries()].filter(([h]) => !fs.existsSync(path.join(AUDIO, `${h}.mp3`)));

  const bySource = new Map<string, number>();
  for (const it of all) {
    const k = it.source.split(path.sep)[0].split("#")[0];
    bySource.set(k, (bySource.get(k) ?? 0) + 1);
  }
  console.log(`Текстов: ${all.length} (уникальных ${unique.size}); уже есть mp3: ${unique.size - missing.length}; нужно сгенерировать: ${missing.length}`);
  for (const [k, n] of [...bySource].sort()) console.log(`  ${k}: ${n}`);
  const voices = missing.reduce<Record<string, number>>((acc, [, it]) => ((acc[it.voice] = (acc[it.voice] ?? 0) + 1), acc), {});
  if (missing.length) console.log(`  по голосам: ${Object.entries(voices).map(([v, n]) => `${v}=${n}`).join(", ")}`);

  // манифест (для отладки) — сохраняем старые записи, добавляем текущие
  let manifest: Record<string, { text: string; voice: string }> = {};
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch {
    /* нет манифеста */
  }
  const writeManifest = () => {
    const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
  };

  if (dryRun) return;

  for (const [h, it] of unique) {
    if (fs.existsSync(path.join(AUDIO, `${h}.mp3`)) && !manifest[h]) manifest[h] = { text: it.text, voice: it.voice };
  }
  if (!missing.length) {
    writeManifest();
    console.log("Всё озвучено.");
    return;
  }
  if (!checkEngine()) {
    console.error(
      `\nedge-tts не найден. Установите:\n  python3 -m pip install --user edge-tts\n` +
        `или задайте свою команду, например:\n  TTS_CMD='edge-tts --voice {voice} --text {text} --write-media {out}' npm run tts`,
    );
    process.exit(1);
  }

  const queue = missing.slice(0, limit);
  let next = 0;
  let ok = 0;
  let fail = 0;
  const started = Date.now();
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (next < queue.length) {
        const [h, it] = queue[next++];
        try {
          await synth(it, path.join(AUDIO, `${h}.mp3`));
          manifest[h] = { text: it.text, voice: it.voice };
          ok++;
        } catch (e) {
          fail++;
          console.error(`✗ ${h} (${it.source}): ${(e as Error).message}`);
        }
        const n = ok + fail;
        if (n % 10 === 0 || n === queue.length) {
          console.log(`  [${n}/${queue.length}] ok=${ok} fail=${fail} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
          writeManifest();
        }
        await sleep(DELAY_MS);
      }
    }),
  );
  writeManifest();
  console.log(`Готово: ${ok} сгенерировано, ${fail} ошибок.`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
