/**
 * Firestore security rules tests (run against the Firestore emulator):
 *   npm run test:rules
 * The real firestore.rules is loaded with the ALLOWED_EMAIL line rewritten to a test email.
 */
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const PLACEHOLDER = 'REPLACE_WITH_YOUR_EMAIL'
const OWNER_EMAIL = 'owner@example.com'
const OWNER = 'ownerUid1234567890abcdefghij'
const OTHER = 'otherUid1234567890abcdefghij'
const PROJECT_ID = 'demo-rules-test'

const ownerToken = { email: OWNER_EMAIL, email_verified: true }

const rawRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

function hostPort(): { host: string; port: number } {
  const [host = '127.0.0.1', port = '8080'] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  return { host, port: Number(port) }
}

describe('firestore.rules with the owner email filled in', () => {
  let env: RulesTestEnvironment

  before(async () => {
    // Works whether or not the real email has already been filled in: the ALLOWED_EMAIL line is rewritten.
    const rules = rawRules.replace(/return\s+['"][^'"]*['"];\s*\/\/\s*ALLOWED_EMAIL/, `return '${OWNER_EMAIL}'; // ALLOWED_EMAIL`)
    if (!rules.includes(OWNER_EMAIL)) throw new Error('Could not find the ALLOWED_EMAIL line in firestore.rules')
    env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules, ...hostPort() } })
  })
  beforeEach(async () => {
    await env.clearFirestore()
  })
  after(async () => {
    await env?.cleanup()
  })

  test('owner can write and read own documents', async () => {
    const db = env.authenticatedContext(OWNER, ownerToken).firestore()
    await assertSucceeds(setDoc(doc(db, 'users', OWNER, 'progress', 'a1-ser-estar'), { stars: 3 }))
    await assertSucceeds(getDoc(doc(db, 'users', OWNER, 'progress', 'a1-ser-estar')))
    await assertSucceeds(setDoc(doc(db, 'users', OWNER, 'meta', 'settings'), { dailyGoal: 20 }))
  })

  test('another signed-in user is denied, even on their own path', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER, 'progress', 'x'), { stars: 1 })
    })
    const db = env.authenticatedContext(OTHER, { email: 'other@example.com', email_verified: true }).firestore()
    await assertFails(getDoc(doc(db, 'users', OWNER, 'progress', 'x')))
    await assertFails(setDoc(doc(db, 'users', OWNER, 'progress', 'x'), { stars: 0 }))
    await assertFails(setDoc(doc(db, 'users', OTHER, 'progress', 'x'), { stars: 3 }))
    await assertFails(getDoc(doc(db, 'users', OTHER, 'progress', 'x')))
  })

  test('unauthenticated access is denied', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER, 'progress', 'x'), { stars: 1 })
    })
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'users', OWNER, 'progress', 'x')))
    await assertFails(setDoc(doc(db, 'users', OWNER, 'progress', 'y'), { stars: 1 }))
  })

  test('owner email but unverified is denied', async () => {
    const db = env.authenticatedContext(OWNER, { email: OWNER_EMAIL, email_verified: false }).firestore()
    await assertFails(getDoc(doc(db, 'users', OWNER, 'progress', 'x')))
  })

  test('owner email under a different uid cannot access the owner path', async () => {
    const db = env.authenticatedContext(OTHER, ownerToken).firestore()
    await assertFails(getDoc(doc(db, 'users', OWNER, 'progress', 'x')))
    await assertFails(setDoc(doc(db, 'users', OWNER, 'progress', 'x'), { stars: 3 }))
  })

  test("owner cannot write to another uid's path or outside users/", async () => {
    const db = env.authenticatedContext(OWNER, ownerToken).firestore()
    await assertFails(setDoc(doc(db, 'users', OTHER, 'progress', 'x'), { stars: 3 }))
    await assertFails(getDoc(doc(db, 'users', OTHER, 'progress', 'x')))
    await assertFails(setDoc(doc(db, 'public', 'x'), { a: 1 }))
  })
})

describe('firestore.rules with the placeholder still in place', () => {
  let env: RulesTestEnvironment

  before(async () => {
    const rules = rawRules.replace(/return\s+['"][^'"]*['"];\s*\/\/\s*ALLOWED_EMAIL/, `return '${PLACEHOLDER}'; // ALLOWED_EMAIL`)
    env = await initializeTestEnvironment({ projectId: `${PROJECT_ID}-placeholder`, firestore: { rules, ...hostPort() } })
  })
  after(async () => {
    await env?.cleanup()
  })

  test('nobody has access', async () => {
    const db = env.authenticatedContext(OWNER, ownerToken).firestore()
    await assertFails(setDoc(doc(db, 'users', OWNER, 'progress', 'x'), { stars: 3 }))
    await assertFails(getDoc(doc(db, 'users', OWNER, 'meta', 'settings')))
  })
})
