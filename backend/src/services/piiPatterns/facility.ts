import type { PiiPattern } from '../../types/anonymisation.types'

/**
 * Facility and doctor-name detectors.
 *
 * Letterhead-style organisation names are matched by clinical-location keywords
 * (`PathLabs`, `Diagnostics`, `Hospital`, `Clinic`, `अस्पताल`, `ଡାକ୍ତରଖାନା`)
 * rather than any capitalised run, so test names like "Complete Blood Count"
 * are untouched. Doctor names are matched by title only.
 */

const HS = String.raw`[^\S\n]`
const SEP = String.raw`(?:[:-][^\S\n]*|[^\S\n]+)`
const ANY_NAME = String.raw`(?:[A-Z][A-Za-z.'-]*(?:${HS}[A-Z][A-Za-z.'-]*){0,3}|[\u0900-\u097F][\u0900-\u097F .'-]{1,40}|[\u0B00-\u0B7F][\u0B00-\u0B7F .'-]{1,40})`

const ORG_KEYWORD = String.raw`(?:PathLabs|(?:[A-Za-z]{2,}${HS}+)?Labs|Laborator(?:y|ies)|Diagnostics|Diagnostic${HS}+Cent(?:re|er)|Pathology|Hospitals?|Clinic|Medical${HS}+Cent(?:re|er)|Polyclinics?|Health${HS}+Cent(?:re|er)|Nursing${HS}+Home)`
const ORG_NAME = String.raw`\b(?:[A-Z][A-Za-z&.'-]*${HS}+){0,4}${ORG_KEYWORD}\b(?:${HS}+(?:Ltd|Limited|Pvt\.?|Inc\.?|LLP))?`

export const facilityPatterns: PiiPattern[] = [
  {
    category: 'lab-name',
    confidence: 0.9,
    pattern: new RegExp(String.raw`\b(?:lab${HS}name|laboratory${HS}name|lab|प्रयोगशाला|ପରୀକ୍ଷାଗାର)${SEP}[^\n,;]+`, 'gi'),
    replacement: '[FACILITY]',
  },
  {
    category: 'hospital-name',
    confidence: 0.9,
    pattern: new RegExp(String.raw`\b(?:hospital${HS}name|अस्पताल${HS}का${HS}नाम|अस्पताल|ଡାକ୍ତରଖାନା)${SEP}[^\n,;]+`, 'gi'),
    replacement: '[FACILITY]',
  },
  {
    category: 'hospital-name',
    confidence: 0.75,
    pattern: new RegExp(ORG_NAME, 'g'),
    replacement: '[FACILITY]',
  },
  {
    category: 'doctor-name',
    confidence: 0.9,
    pattern: new RegExp(String.raw`\b(?:[Dd]r|[Dd]octor|[Dd]ietician)\.?${HS}+${ANY_NAME}`, 'g'),
    replacement: '[NAME]',
  },
  {
    category: 'doctor-name',
    confidence: 0.9,
    pattern: new RegExp(String.raw`(?:डॉक्टर|डॉ|ଡାକ୍ତର)${HS}*\.?${HS}*${ANY_NAME}`, 'g'),
    replacement: '[NAME]',
  },
]
