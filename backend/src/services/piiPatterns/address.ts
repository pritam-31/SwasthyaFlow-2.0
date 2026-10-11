import type { PiiPattern } from '../../types/anonymisation.types'

/**
 * Address detectors for English, Hindi and Odia.
 *
 * Address components are marker-led (`address`, `village`, `pincode`, `पता`,
 * `ठिकणा`, …) and read one same-line value; the marker list covers the labels
 * printed on Indian report forms and intake sheets.
 */

const HS = String.raw`[^\S\n]`
const EN_VALUE = String.raw`[A-Za-z0-9][A-Za-z0-9 ,./()#'-]{1,60}`
const HI_VALUE = String.raw`[\u0900-\u097F0-9][\u0900-\u097F0-9 ,./()-]{1,60}`
const OR_VALUE = String.raw`[\u0B00-\u0B7F0-9][\u0B00-\u0B7F0-9 ,./()-]{1,60}`

const EN_MARKERS = [
  'address',
  'residence',
  'village',
  'post office',
  'po',
  'district',
  'state',
  'pincode',
  'pin code',
  'house no',
  'street',
  'locality',
  'colony',
  'ward no',
  'tehsil',
  'block',
]
  .map((w) => w.replace(/[a-z]/g, (ch) => `[${ch}${ch.toUpperCase()}]`))
  .join('|')

export const addressPatterns: PiiPattern[] = [
  {
    category: 'address',
    confidence: 0.85,
    pattern: new RegExp(String.raw`\b(?:${EN_MARKERS})${HS}*[:-]?${HS}*${EN_VALUE}`, 'g'),
    replacement: '[ADDRESS]',
  },
  {
    category: 'address',
    confidence: 0.85,
    pattern: new RegExp(String.raw`(?:पता|मकान|गली|गांव|गाँव|नगर|शहर|जिला|जिले|राज्य|पिन${HS}कोड|वार्ड|मोहल्ला)${HS}*[:-]?${HS}*${HI_VALUE}`, 'g'),
    replacement: '[ADDRESS]',
  },
  {
    category: 'address',
    confidence: 0.85,
    pattern: new RegExp(String.raw`(?:ଠିକଣା|ମକାନ|ଗାଁ|ଗ୍ରାମ|ସହର|ଜିଲ୍ଲା|ରାଜ୍ୟ|ପିନ|ୱାର୍ଡ)${HS}*[:-]?${HS}*${OR_VALUE}`, 'g'),
    replacement: '[ADDRESS]',
  },
  {
    // Romanised Hinglish / Odlish address markers.
    category: 'address',
    confidence: 0.8,
    pattern: new RegExp(
      String.raw`\b(?:pata|makan|gali|gaon|gaun|sahar|shahar|jila|jilla|rajya|pincode|thikana|gadhi)${HS}*[:-]?${HS}*${EN_VALUE}`,
      'gi',
    ),
    replacement: '[ADDRESS]',
  },
]
