/** Copies text to the clipboard: async Clipboard API, then the legacy textarea + execCommand fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path (e.g. permission denied, unfocused document)
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.opacity = '0'
  ta.style.fontSize = '16px' // avoids iOS zoom on focus
  document.body.appendChild(ta)
  const sel = document.getSelection()
  const prevRange = sel && sel.rangeCount ? sel.getRangeAt(0) : null
  ta.focus()
  ta.select()
  ta.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  if (prevRange && sel) {
    sel.removeAllRanges()
    sel.addRange(prevRange)
  }
  return ok
}
