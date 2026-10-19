/**
 * Exercise shortcuts listen on `window`, but lesson/situation pages keep every tab panel mounted
 * (hidden) so runs survive tab switches. A runner inside a hidden panel must ignore the keys.
 */
export function isInHiddenPanel(el: Element | null): boolean {
  return !el || el.closest('[hidden]') !== null
}
