/** Joins class names, skipping falsy values. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** 'smooth' unless the user asked for reduced motion (audit §4.7). */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/** Short haptic tick on devices that support it (no-op elsewhere / with reduced motion). */
export function haptic(pattern: number | number[] = 10) {
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  navigator.vibrate?.(pattern)
}
