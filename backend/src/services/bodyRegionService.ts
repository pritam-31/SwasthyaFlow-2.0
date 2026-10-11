import type { BodyRegion, SupportedLanguage } from '../types'

/**
 * Visual body-region diagram (P2-18 item J).
 *
 * A fixed, translation-ready map of body regions so a captured photo can be
 * labelled with where it points. Coordinates are normalised 0..1 against a
 * schematic front/back figure, so any client renders the same hotspot. Labels
 * are non-diagnostic location words only.
 */

export const BODY_REGIONS: BodyRegion[] = [
  { id: 'head', label: { en: 'Head', hi: 'सिर', or: 'ମୁଣ୍ଡ' }, front: true, back: true, x: 0.5, y: 0.08, radius: 0.07 },
  { id: 'face', label: { en: 'Face', hi: 'चेहरा', or: 'ମୁହଁ' }, front: true, back: false, x: 0.5, y: 0.12, radius: 0.05 },
  { id: 'neck', label: { en: 'Neck', hi: 'गर्दन', or: 'ବେକ' }, front: true, back: true, x: 0.5, y: 0.19, radius: 0.04 },
  { id: 'chest', label: { en: 'Chest', hi: 'छाती', or: 'ଛାତି' }, front: true, back: false, x: 0.5, y: 0.3, radius: 0.09 },
  { id: 'upper-back', label: { en: 'Upper back', hi: 'ऊपरी पीठ', or: 'ଉପର ପିଠି' }, front: false, back: true, x: 0.5, y: 0.3, radius: 0.09 },
  { id: 'abdomen', label: { en: 'Abdomen', hi: 'पेट', or: 'ପେଟ' }, front: true, back: false, x: 0.5, y: 0.45, radius: 0.09 },
  { id: 'lower-back', label: { en: 'Lower back', hi: 'कमर', or: 'କଟି' }, front: false, back: true, x: 0.5, y: 0.45, radius: 0.08 },
  { id: 'left-arm', label: { en: 'Left arm', hi: 'बायाँ हाथ', or: 'ବାମ ହାତ' }, front: true, back: true, x: 0.28, y: 0.38, radius: 0.06 },
  { id: 'right-arm', label: { en: 'Right arm', hi: 'दायाँ हाथ', or: 'ଡାହାଣ ହାତ' }, front: true, back: true, x: 0.72, y: 0.38, radius: 0.06 },
  { id: 'left-leg', label: { en: 'Left leg', hi: 'बायाँ पैर', or: 'ବାମ ଗୋଡ଼' }, front: true, back: true, x: 0.4, y: 0.72, radius: 0.08 },
  { id: 'right-leg', label: { en: 'Right leg', hi: 'दायाँ पैर', or: 'ଡାହାଣ ଗୋଡ଼' }, front: true, back: true, x: 0.6, y: 0.72, radius: 0.08 },
  { id: 'genitalia', label: { en: 'Groin', hi: 'जघन क्षेत्र', or: 'ଗୁହ୍ୟ ଅଞ୍ଚଳ' }, front: true, back: false, x: 0.5, y: 0.58, radius: 0.04 },
]

export function listBodyRegions(view?: 'front' | 'back'): BodyRegion[] {
  if (!view) return [...BODY_REGIONS]
  return BODY_REGIONS.filter((region) => (view === 'front' ? region.front : region.back))
}

export function findBodyRegion(id: string): BodyRegion | undefined {
  return BODY_REGIONS.find((region) => region.id === id)
}

export function bodyRegionLabel(id: string, language: SupportedLanguage): string | undefined {
  return findBodyRegion(id)?.label[language]
}
