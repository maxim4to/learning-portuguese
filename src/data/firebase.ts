/**
 * Firebase configuration from VITE_FIREBASE_* env vars.
 * When they are absent the app runs fully locally (LocalRepository, no auth).
 * Firebase SDK modules are loaded lazily, so local mode doesn't download them.
 */
import type { FirebaseApp } from 'firebase/app'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const isFirebaseConfigured: boolean = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
)

let appPromise: Promise<FirebaseApp> | null = null

export function getFirebaseApp(): Promise<FirebaseApp> {
  if (!isFirebaseConfigured) return Promise.reject(new Error('Firebase is not configured (VITE_FIREBASE_* env vars missing)'))
  appPromise ??= import('firebase/app').then(({ initializeApp, getApps }) => getApps()[0] ?? initializeApp(firebaseConfig))
  return appPromise
}
