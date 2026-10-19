/**
 * Firestore security rules tests (run against the Firestore emulator):
 *   npm run test:rules
 * The real firestore.rules is loaded with the ALLOWED_EMAILS line rewritten to a list of test emails.
 */
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'

const PLACEHOLDER = 'REPLACE_WITH_YOUR_EMAIL'
const OWNER_EMAIL = 'owner@example.com'
const SECOND_EMAIL = 'second@example.com'
const OWNER = 'ownerUid1234567890abcdefghij'
const SECOND = 'secondUid234567890abcdefghij'
const OTHER = 'otherUid1234567890abcdefghij'
const PROJECT_ID = 'demo-rules-test'

const ownerToken = { email: OWNER_EMAIL, email_verified: true }
const secondToken = { email: SECOND_EMAIL, email_verified: true }

const MARKER = /return\s+\[[^\]]*\];\s*\/\/\s*ALLOWED_EMAILS/
function withEmails(rules: string, emails: string[]): string {
  if (!MARKER.test(rules)) throw new Error('Could not find the ALLOWED_EMAILS line in firestore.rules')
  const literal = `[${emails.map((e) => `'${e}'`).join(', ')}]`
  return rules.replace(MARKER, () => `return ${literal}; // ALLOWED_EMAILS`)
}

const rawRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

function hostPort(): { host: string; port: number } {
  const [host = '127.0.0.1', port = '8080'] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  return { host, port: Number(port) }
}

describe('firestore.rules with two allowed emails filled in', () => {
  let env: RulesTestEnvironment

  before(async () => {
    // Works whether or not real emails have already been filled in: the ALLOWED_EMAILS line is rewritten.
    const rules = withEmails(rawRules, [OWNER_EMAIL, SECOND_EMAIL])
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

  // Personal dictionary: users/{uid}/words/* is covered by the owner wildcard (no rules change / redeploy).
  test('owner can create, read, update and delete words', async () => {
    const db = env.authenticatedContext(OWNER, ownerToken).firestore()
    const ref = doc(db, 'users', OWNER, 'words', encodeURIComponent('levantar-se#verb'))
    const word = { id: 'levantar-se#verb', lemma: 'levantar-se', ru: 'вставать', sources: [], modes: ['recognize'], createdAt: 1, updatedAt: 1 }
    await assertSucceeds(setDoc(ref, word))
    await assertSucceeds(getDoc(ref))
    await assertSucceeds(setDoc(ref, { ...word, ru: 'вставать; подниматься', updatedAt: 2 }))
    await assertSucceeds(deleteDoc(ref))
  })

  // SRS cards: the newer review wins — an update with an older fsrs.last_review than the stored one is denied.
  test('cards: create / newer or same review / delete succeed; an older review cannot overwrite a newer one', async () => {
    const db = env.authenticatedContext(OWNER, ownerToken).firestore()
    const ref = doc(db, 'users', OWNER, 'cards', 'err-1')
    const fsrs = { due: 10, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 3, lapses: 0, state: 2 }
    const card = { id: 'err-1', kind: 'error', front: 'f', back: 'b', createdAt: 1, updatedAt: 1, fsrs: { ...fsrs, last_review: 100 } }
    await assertSucceeds(setDoc(ref, card))
    await assertSucceeds(setDoc(ref, { ...card, fsrs: { ...card.fsrs, last_review: 200, reps: 4 }, updatedAt: 200 }))
    await assertSucceeds(setDoc(ref, { ...card, fsrs: { ...card.fsrs, last_review: 200, reps: 4 }, suspended: true, updatedAt: 300 }))
    await assertFails(setDoc(ref, { ...card, fsrs: { ...card.fsrs, last_review: 150, reps: 9 }, updatedAt: 400 }))
    await assertFails(setDoc(ref, { ...card, fsrs, updatedAt: 400 })) // a never-reviewed state over a reviewed card
    await assertSucceeds(getDoc(ref))
    await assertSucceeds(deleteDoc(ref))
    await assertSucceeds(setDoc(ref, { ...card, fsrs })) // re-created after the delete
    // Other collections are not affected by the card rule.
    await assertSucceeds(setDoc(doc(db, 'users', OWNER, 'errors', 'e1'), { fsrs: { last_review: 1 } }))
    await assertSucceeds(setDoc(doc(db, 'users', OWNER, 'errors', 'e1'), { fsrs: { last_review: 0 } }))
    const other = env.authenticatedContext(OTHER, { email: 'other@example.com', email_verified: true }).firestore()
    await assertFails(getDoc(doc(other, 'users', OWNER, 'cards', 'err-1')))
    await assertFails(setDoc(doc(other, 'users', OWNER, 'cards', 'x'), card))
  })

  test('words are denied to other users and unauthenticated clients', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER, 'words', 'u%3Acasa'), { id: 'u:casa', lemma: 'casa', ru: 'дом' })
    })
    const other = env.authenticatedContext(OTHER, { email: 'other@example.com', email_verified: true }).firestore()
    await assertFails(getDoc(doc(other, 'users', OWNER, 'words', 'u%3Acasa')))
    await assertFails(setDoc(doc(other, 'users', OWNER, 'words', 'u%3Acasa'), { lemma: 'x' }))
    await assertFails(deleteDoc(doc(other, 'users', OWNER, 'words', 'u%3Acasa')))
    await assertFails(setDoc(doc(other, 'users', OTHER, 'words', 'u%3Acasa'), { lemma: 'x' }))
    const anon = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anon, 'users', OWNER, 'words', 'u%3Acasa')))
    await assertFails(setDoc(doc(anon, 'users', OWNER, 'words', 'u%3Amesa'), { lemma: 'mesa' }))
  })

  test('second allowed user can read and write only their own documents', async () => {
    const db = env.authenticatedContext(SECOND, secondToken).firestore()
    await assertSucceeds(setDoc(doc(db, 'users', SECOND, 'progress', 'a1-ser-estar'), { stars: 2 }))
    await assertSucceeds(getDoc(doc(db, 'users', SECOND, 'progress', 'a1-ser-estar')))
    await assertSucceeds(setDoc(doc(db, 'users', SECOND, 'meta', 'settings'), { dailyGoal: 10 }))
    await assertSucceeds(setDoc(doc(db, 'users', SECOND, 'words', 'u%3Acasa'), { lemma: 'casa' }))
    await assertSucceeds(deleteDoc(doc(db, 'users', SECOND, 'words', 'u%3Acasa')))
  })

  test('two allowed users cannot access each other\'s data', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER, 'progress', 'x'), { stars: 1 })
      await setDoc(doc(ctx.firestore(), 'users', SECOND, 'progress', 'x'), { stars: 2 })
    })
    const owner = env.authenticatedContext(OWNER, ownerToken).firestore()
    const second = env.authenticatedContext(SECOND, secondToken).firestore()
    await assertFails(getDoc(doc(owner, 'users', SECOND, 'progress', 'x')))
    await assertFails(setDoc(doc(owner, 'users', SECOND, 'progress', 'x'), { stars: 0 }))
    await assertFails(deleteDoc(doc(owner, 'users', SECOND, 'progress', 'x')))
    await assertFails(getDoc(doc(second, 'users', OWNER, 'progress', 'x')))
    await assertFails(setDoc(doc(second, 'users', OWNER, 'progress', 'x'), { stars: 0 }))
    await assertFails(setDoc(doc(second, 'users', OWNER, 'words', 'u%3Acasa'), { lemma: 'casa' }))
  })

  test('allowed emails match case-insensitively', async () => {
    const db = env.authenticatedContext(SECOND, { email: 'Second@Example.com', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(db, 'users', SECOND, 'progress', 'x')))
  })

  test('second allowed email but unverified is denied', async () => {
    const db = env.authenticatedContext(SECOND, { email: SECOND_EMAIL, email_verified: false }).firestore()
    await assertFails(getDoc(doc(db, 'users', SECOND, 'progress', 'x')))
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
    const rules = withEmails(rawRules, [PLACEHOLDER])
    env = await initializeTestEnvironment({ projectId: `${PROJECT_ID}-placeholder`, firestore: { rules, ...hostPort() } })
  })
  after(async () => {
    await env?.cleanup()
  })

  test('nobody has access', async () => {
    const db = env.authenticatedContext(OWNER, ownerToken).firestore()
    await assertFails(setDoc(doc(db, 'users', OWNER, 'progress', 'x'), { stars: 3 }))
    await assertFails(getDoc(doc(db, 'users', OWNER, 'meta', 'settings')))
    await assertFails(setDoc(doc(db, 'users', OWNER, 'words', 'u%3Acasa'), { lemma: 'casa' }))
  })
})
