import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="space-y-3">
      <h1>Страница не найдена</h1>
      <Link to="/">На главную</Link>
    </div>
  )
}
