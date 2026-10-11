import type { PiiPattern } from '../../types/anonymisation.types'

/**
 * Miscellaneous identifier detectors: email, vehicle, insurance, bank account,
 * IP address, device id, GPS coordinates and identifier-bearing URLs.
 */

const HS = String.raw`[^\S\n]`
const SEP = String.raw`(?:[:-][^\S\n]*|[^\S\n]+)`
const ID_ATOM = String.raw`(?=[A-Za-z0-9/-]*\d)[A-Za-z0-9/-]+`
const ID_VALUE = String.raw`(?:${ID_ATOM}(?:[^\S\n]+${ID_ATOM})*)`

const OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1?\d?\d)`
/** IPv4 with 0–255 octets. */
const IPV4 = String.raw`(?<![\d.])(?:${OCTET}\.){3}${OCTET}(?!\d)(?!\.\d)`
/** MAC address. */
const MAC = String.raw`\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b`

export const miscPatterns: PiiPattern[] = [
  {
    category: 'email',
    confidence: 0.95,
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g,
    replacement: '[EMAIL]',
  },
  {
    category: 'vehicle-number',
    confidence: 0.85,
    pattern: /\b[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{4}\b/g,
    replacement: '[VEHICLE]',
  },
  {
    category: 'vehicle-number',
    confidence: 0.8,
    pattern: new RegExp(String.raw`\b(?:vehicle|reg(?:istration)?${HS}no\.?|वाहन|ଯାନ)${SEP}[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{0,3}[-\s]?\d{3,4}\b`, 'gi'),
    replacement: '[VEHICLE]',
  },
  {
    category: 'insurance-number',
    confidence: 0.85,
    pattern: new RegExp(
      String.raw`\b(?:insurance|policy${HS}no\.?|policy${HS}number|बीमा|पॉलिसी|ବୀମା)${HS}*(?:no\.?|number|id)?${SEP}?${ID_VALUE}\b`,
      'gi',
    ),
    replacement: '[INSURANCE]',
  },
  {
    category: 'bank-account',
    confidence: 0.85,
    pattern: new RegExp(
      String.raw`\b(?:a\/?c${HS}no\.?|account${HS}(?:no\.?|number)|bank${HS}account|ifsc|खाता|ଖାତା)${HS}*(?:no\.?|number|id)?${SEP}?${ID_VALUE}\b`,
      'gi',
    ),
    replacement: '[BANK]',
  },
  {
    category: 'ip-address',
    confidence: 0.9,
    pattern: new RegExp(IPV4, 'g'),
    replacement: '[IP]',
  },
  {
    category: 'device-id',
    confidence: 0.9,
    pattern: new RegExp(MAC, 'g'),
    replacement: '[DEVICE]',
  },
  {
    category: 'device-id',
    confidence: 0.8,
    pattern: new RegExp(
      String.raw`\b(?:device|imei|serial|device${HS}id|udid|mac${HS}address|उपकरण|ଉପକରଣ)${HS}*(?:no\.?|number|id)?${SEP}?${ID_VALUE}\b`,
      'gi',
    ),
    replacement: '[DEVICE]',
  },
  {
    category: 'gps',
    confidence: 0.85,
    pattern: /(?<!\d)[-+]?\d{1,3}\.\d{3,},\s*[-+]?\d{1,3}\.\d{3,}(?!\d)/g,
    replacement: '[GPS]',
  },
  {
    category: 'gps',
    confidence: 0.8,
    pattern: new RegExp(String.raw`\b(?:lat(?:itude)?|long(?:itude)?|gps|coordinates?)${HS}*[:-]?${HS}*[-+]?\d{1,3}(?:\.\d+)?`, 'gi'),
    replacement: '[GPS]',
  },
  {
    category: 'url-with-id',
    confidence: 0.9,
    pattern: /https?:\/\/[^\s]*[?&](?:id|uid|user|token|key|phone|email|uuid|patient|session|ref)=[^\s]*/gi,
    replacement: '[URL]',
  },
]
