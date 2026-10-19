import { Navigate, useLocation, useParams, type Params } from 'react-router-dom'

/**
 * Old «Практика» / «Библиотека» URLs → their /practice/… homes. Query and hash are carried over, so a saved
 * word's source link (`/library/reading/x#p-2`, `/situation/y?tab=vocab#voc-3`) still lands on the element.
 */
export function RedirectTo({ to }: { to: (params: Readonly<Params>) => string }) {
  const params = useParams()
  const { search, hash } = useLocation()
  return <Navigate replace to={`${to(params)}${search}${hash}`} />
}
