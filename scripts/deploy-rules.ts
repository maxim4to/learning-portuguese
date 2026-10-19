/**
 * Deploys Firestore rules + indexes with the owner's email filled in:
 *   npm run deploy
 * The committed firestore.rules keeps the REPLACE_WITH_YOUR_EMAIL placeholder (the repo is public);
 * the real email comes from ALLOWED_EMAIL in .env. A filled-in copy and a matching firebase.json are
 * generated under .firebase/ (git-ignored) and deployed from there.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outDir = join(root, '.firebase')

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
const email = process.env.ALLOWED_EMAIL?.trim()
if (!email || !/^[^\s'"@]+@[^\s'"@]+\.[^\s'"@]+$/.test(email)) {
  console.error('ALLOWED_EMAIL is missing or invalid in .env (e.g. ALLOWED_EMAIL=you@gmail.com)')
  process.exit(1)
}

const marker = /return\s+['"][^'"]*['"];\s*\/\/\s*ALLOWED_EMAIL/
const rawRules = readFileSync(join(root, 'firestore.rules'), 'utf8')
if (!marker.test(rawRules)) {
  console.error('Could not find the "// ALLOWED_EMAIL" line in firestore.rules')
  process.exit(1)
}
const rules = rawRules.replace(marker, `return '${email}'; // ALLOWED_EMAIL`)

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
