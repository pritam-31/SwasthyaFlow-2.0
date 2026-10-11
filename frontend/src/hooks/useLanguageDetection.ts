/**
 * Debounced script-language detection for the intake form.
 *
 * Runs against the backend detector and degrades to a local script fallback
 * when the backend is unreachable. Detection is only a UI label — the backend
 * re-detects authoritative languages when a session is processed.
 */

import { useEffect, useRef, useState } from 'react'
import { detectScriptLanguageFallback, detectTextLanguage } from '../services/languageApi'
import type { DetectedLanguageInfo } from '../types/language.types'

export function useLanguageDetection(
  text: string,
  enabled: boolean,
  debounceMs = 400,
): { detected: DetectedLanguageInfo | null; detecting: boolean } {
  const [detected, setDetected] = useState<DetectedLanguageInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!enabled || !text.trim()) {
      seq.current += 1
      setDetected(null)
      setDetecting(false)
      return
    }

    const timer = window.setTimeout(async () => {
      const my = ++seq.current
      setDetecting(true)
      try {
        const { detectedLanguage } = await detectTextLanguage(text)
        if (my === seq.current) setDetected(detectedLanguage)
      } catch {
        if (my === seq.current) setDetected(detectScriptLanguageFallback(text))
      } finally {
        if (my === seq.current) setDetecting(false)
      }
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [text, enabled, debounceMs])

  return { detected, detecting }
}