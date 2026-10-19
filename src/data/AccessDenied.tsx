import type { AuthUser } from './auth.ts'

/** Shown when Firestore rejects the signed-in user with permission-denied. */
export function AccessDenied({
  user,
  onRetry,
  onSignOut,
}: {
  user: AuthUser | null
  onRetry: () => void
  onSignOut: () => void
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-4" role="alert">
        <h1>Нет доступа к данным</h1>
        <p>
          Firestore отклонил запрос (permission-denied) для аккаунта <b>{user?.email ?? '—'}</b>.
        </p>
        <p className="text-ink-muted">
          Проверьте, что ваш email есть в списке <code>ALLOWED_EMAILS</code> в <code>.env</code> и правила
          задеплоены: <code>npm run deploy</code>. Если вошли не тем аккаунтом — выйдите и войдите нужным.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={onRetry}>
            Повторить
          </button>
          <button className="btn-secondary" onClick={onSignOut}>
            Выйти
          </button>
        </div>
      </div>
    </div>
  )
}
