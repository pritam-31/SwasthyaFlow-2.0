import { useCallback, useEffect, useRef, useState } from 'react'
import type { IntakeLanguage } from '../types/triage'

/**
 * Web Speech API wrapper for symptom capture.
 *
 * - Degrades gracefully: `supported` is false when the browser has no
 *   SpeechRecognition (then the intake form offers file upload / typing).
 * - Nothing is sent anywhere: transcripts stay in component state.
 */

const LANG_TAG: Record<IntakeLanguage, string> = {
  English: 'en-IN',
  Hindi: 'hi-IN',
  Odia: 'or-IN',
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0?: { transcript?: string }
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionErrorLike {
  error?: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getConstructor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface UseSpeechToTextResult {
  supported: boolean
  listening: boolean
  interim: string
  error: string | null
  start: (language: IntakeLanguage) => void
  stop: () => void
  reset: () => void
}

export function useSpeechToText(onFinalTranscript: (text: string) => void): UseSpeechToTextResult {
  const [supported] = useState(() => typeof window !== 'undefined' && getConstructor() !== null)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const finalisedRef = useRef('')
  const callbackRef = useRef(onFinalTranscript)

  useEffect(() => {
    callbackRef.current = onFinalTranscript
  }, [onFinalTranscript])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
    setInterim('')
  }, [])

  const reset = useCallback(() => {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    finalisedRef.current = ''
    setListening(false)
    setInterim('')
    setError(null)
  }, [])

  const start = useCallback(
    (language: IntakeLanguage) => {
      const Ctor = getConstructor()
      if (!Ctor) {
        setError('Live transcription is not available in this browser — upload a recording or type instead.')
        return
      }
      setError(null)
      finalisedRef.current = ''

      const recognition = new Ctor()
      recognition.lang = LANG_TAG[language]
      recognition.continuous = false
      recognition.interimResults = true

      recognition.onresult = (event) => {
        let interimText = ''
        for (let i = 0; i < event.results.length; i += 1) {
          const result = event.results[i]
          if (!result) continue
          const piece = result[0]?.transcript ?? ''
          if (result.isFinal) finalisedRef.current = `${finalisedRef.current}${piece} `.trim()
          else interimText += piece
        }
        setInterim(interimText)
        if (finalisedRef.current) callbackRef.current(finalisedRef.current)
      }

      recognition.onerror = (event) => {
        const map: Record<string, string> = {
          'not-allowed': 'Microphone permission was denied. Allow the microphone or type the symptoms instead.',
          'no-speech': 'No speech detected. Please try again and speak clearly.',
          network: 'Speech service is unreachable. Type the symptoms instead.',
          'audio-capture': 'No microphone was found. Upload a recording or type instead.',
        }
        setError(map[event.error ?? ''] ?? 'Transcription stopped unexpectedly. Please try again.')
        setListening(false)
      }

      recognition.onend = () => {
        setListening(false)
        setInterim('')
        recognitionRef.current = null
      }

      recognitionRef.current = recognition
      try {
        recognition.start()
        setListening(true)
      } catch {
        setListening(false)
        setError('Could not start the microphone. Check that no other app is using it.')
      }
    },
    [],
  )

  useEffect(() => () => recognitionRef.current?.abort(), [])

  return { supported, listening, interim, error, start, stop, reset }
}
