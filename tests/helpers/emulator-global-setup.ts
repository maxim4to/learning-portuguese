/** globalSetup of playwright.emulator.config.ts: fresh emulator state + rules with the test email pool. */
import { AUTH_HOST, FS_HOST, clearAuth, clearFirestore, installRules } from './emulator'

export default async function globalSetup() {
  for (const host of [FS_HOST, AUTH_HOST]) {
    try {
      await fetch(`http://${host}/`)
    } catch {
      throw new Error(`Firebase emulator not reachable at ${host}. Run via \`npm run test:e2e:emulator\` (firebase emulators:exec) or start \`npm run emulators\`.`)
    }
  }
  await clearFirestore()
  await clearAuth()
  await installRules()
}
