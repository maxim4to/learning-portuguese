/**
 * Audio file naming shared by the browser (src/engine/audio.ts) and Node scripts (scripts/tts.ts).
 * File: public/audio/<audioHash(text)>.mp3, where audioHash = sha1 hex of audioKey(text).
 * Pure and Node-safe (no import.meta.env): uses WebCrypto (`globalThis.crypto.subtle`), available
 * in browsers and Node ≥ 20. The browser URL (with Vite's base path) is built in ./audio.ts.
 */

/** Canonical text used for hashing: trimmed + Unicode NFC. */
export function audioKey(text: string): string {
  return text.trim().normalize('NFC')
}

export async function audioHash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(audioKey(text))
  const digest = await globalThis.crypto.subtle.digest('SHA-1', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
