/**
 * Deploys Firestore rules + indexes with the allowed emails filled in:
 *   npm run deploy
 * The committed firestore.rules keeps the REPLACE_WITH_YOUR_EMAIL placeholder (the repo is public);
 * the real emails come from ALLOWED_EMAILS in .env (comma-separated; legacy ALLOWED_EMAIL still works),
 * validated, lowercased and de-duplicated. A filled-in copy and a matching firebase.json are
 * generated under .firebase/ (git-ignored) and deployed from there.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outDir = join(root, '.firebase')

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))

// ALLOWED_EMAILS (comma-separated) wins; a lone legacy ALLOWED_EMAIL is still accepted.
const rawList = process.env.ALLOWED_EMAILS?.trim() ? process.env.ALLOWED_EMAILS : (process.env.ALLOWED_EMAIL ?? '')
const emailRe = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/
const emails: string[] = []
const invalid: string[] = []
for (const part of rawList.split(',')) {
  const email = part.trim().toLowerCase()
  if (!email) continue
  if (!emailRe.test(email)) invalid.push(email)
  else if (!emails.includes(email)) emails.push(email)
}
if (invalid.length) {
  console.error(`Invalid email(s) in ALLOWED_EMAILS: ${invalid.join(', ')}`)
  process.exit(1)
}
if (emails.length === 0) {
  console.error('ALLOWED_EMAILS is missing or empty in .env (e.g. ALLOWED_EMAILS=you@gmail.com,partner@gmail.com)')
  process.exit(1)
}

const marker = /return\s+\[[^\]]*\];\s*\/\/\s*ALLOWED_EMAILS/
const rawRules = readFileSync(join(root, 'firestore.rules'), 'utf8')
if (!marker.test(rawRules)) {
  console.error('Could not find the "// ALLOWED_EMAILS" line in firestore.rules')
  process.exit(1)
}
// Emails are validated above (no quotes/backslashes possible), so the literal is safe to inline.
const listLiteral = `[${emails.map((e) => `'${e}'`).join(', ')}]`
const rules = rawRules.replace(marker, () => `return ${listLiteral}; // ALLOWED_EMAILS`)
console.log(`Allowed accounts: ${emails.length}`)

const projectId = JSON.parse(readFileSync(join(root, '.firebaserc'), 'utf8')).projects?.default
if (!projectId) {
  console.error('No default project in .firebaserc')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'firestore.rules.generated'), rules)
copyFileSync(join(root, 'firestore.indexes.json'), join(outDir, 'firestore.indexes.json'))
writeFileSync(
  join(outDir, 'firebase.deploy.json'),
  JSON.stringify({ firestore: { rules: 'firestore.rules.generated', indexes: 'firestore.indexes.json' } }, null, 2),
)

const result = spawnSync(
  'npx',
  ['firebase', 'deploy', '--only', 'firestore', '--project', projectId, '--config', join(outDir, 'firebase.deploy.json')],
  { cwd: root, stdio: 'inherit' },
)
process.exit(result.status ?? 1)
