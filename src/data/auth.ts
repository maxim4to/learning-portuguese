/**
 * Thin wrappers over firebase/auth (Google sign-in). This module is imported lazily.
 * Always signs in with a popup: the site (GitHub Pages, mi-crafts.com) and authDomain
 * (<project>.firebaseapp.com) are different origins, so signInWithRedirect breaks in Safari /
 * iOS PWAs due to third-party storage blocking. Redirect is only a fallback when the popup is blocked.
 */
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
} from 'firebase/auth'
import { getFirebaseApp } from './firebase.ts'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

let authPromise: Promise<Auth> | null = null

function getAuthInstance(): Promise<Auth> {
  authPromise ??= getFirebaseApp().then((app) =>
    initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    }),
  )
  return authPromise
}

function errorCode(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : ''
}

/** Human-readable Russian message for a Firebase Auth error, or null if it should be ignored. */
export function describeAuthError(e: unknown): string | null {
  const code = errorCode(e)
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null
    case 'auth/unauthorized-domain':
      return `Домен ${window.location.hostname} не разрешён для входа: добавьте домен mi-crafts.com в Firebase → Authentication → Settings → Authorized domains.`
    case 'auth/operation-not-allowed':
      return 'Вход через Google не включён. Firebase console → Authentication → Sign-in method → Google → Enable.'
    case 'auth/network-request-failed':
      return 'Нет сети. Проверьте подключение и попробуйте ещё раз.'
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'Неверный VITE_FIREBASE_API_KEY в .env.'
    default:
      return `Не удалось войти${code ? ` (${code})` : ''}: ${e instanceof Error ? e.message : String(e)}`
  }
}

export async function signInWithGoogle(): Promise<void> {
  const auth = await getAuthInstance()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    if (errorCode(e) === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider)
      return
    }
    throw e
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(await getAuthInstance())
}

/**
 * Subscribes to auth state; returns unsubscribe. Also completes a pending redirect sign-in
 * (popup-blocked fallback) and reports its error (if any) via onError.
 */
export async function subscribeAuth(
  cb: (user: AuthUser | null) => void,
  onError?: (message: string) => void,
): Promise<() => void> {
  const auth = await getAuthInstance()
  getRedirectResult(auth).catch((e: unknown) => {
    const msg = describeAuthError(e)
    if (msg) onError?.(msg)
  })
  return onAuthStateChanged(auth, (u) =>
    cb(u ? { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL } : null),
  )
}
