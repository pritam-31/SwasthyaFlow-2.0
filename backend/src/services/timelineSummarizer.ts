import type { NormalizedTime, SupportedLanguage, TimePrecision, TimelineEvent } from '../types'

/**
 * Non-diagnostic timeline summary (P0-4).
 *
 * The summary *organises* the patient-reported chronology in their own words —
 * it never diagnoses, never judges severity and never advises treatment. Every
 * line is a fixed, safe template from {@link LABELS}, with the patient's
 * anonymised sentence quoted as-is. Timing is described with the exact phrases
 * the patient used plus a neutral "X before this visit" bucket when only a
 * coarse relative expression was parsed; no calendar date is fabricated here.
 */

export interface TimelineSummary {
  summary: string
  warnings: string[]
}

interface Bucket {
  key: string
  label: string
  events: TimelineEvent[]
}

function bucketOf(
  precision: TimePrecision,
  normalized: NormalizedTime | null,
): { key: 'today' | 'yesterday' | 'recent-hours' | 'recent-days' | 'older' | 'on-date' | 'unknown'; value?: number; iso?: string } {
  if (!normalized) return { key: 'unknown' }

  if (normalized.kind === 'absolute') return { key: 'on-date', iso: normalized.iso }

  const days = normalized.daysFromIntake
  const hours = normalized.hoursFromIntake ?? 0
  if (precision === 'relative') {
    if (hours > 0) return { key: 'recent-hours', value: hours }
    if (days === 0) return { key: 'today' }
    if (days === 1) return { key: 'yesterday' }
    if (days >= 2 && days <= 7) return { key: 'recent-days', value: days }
    return { key: 'older' }
  }
  if (days <= 7) return { key: 'recent-days', value: days }
  return { key: 'older' }
}

const LABELS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    heading: 'Patient-reported event timeline — their words, not a diagnosis',
    today: 'Today — ',
    yesterday: 'Yesterday — ',
    recentHours: 'About {n} hour(s) before this visit — ',
    recentDays: 'About {n} day(s) before this visit — ',
    older: 'More than a week before this visit — ',
    onDate: 'On {d} — ',
    unknown: 'Timing not stated — ',
    empty: 'No patient-reported events are on file yet.',
    warnNoTime: 'No time information could be read from the narrative.',
    warnUnknown: 'Some events have no stated time and are listed afterwards.',
  },
  hi: {
    heading: 'मरीज़ द्वारा बताई गई घटनाओं का क्रम — उनके ही शब्दों में, निदान नहीं',
    today: 'आज — ',
    yesterday: 'कल — ',
    recentHours: 'इस दौरे से करीब {n} घंटे पहले — ',
    recentDays: 'इस दौरे से करीब {n} दिन पहले — ',
    older: 'इस दौरे से एक सप्ताह से अधिक पहले — ',
    onDate: '{d} को — ',
    unknown: 'समय नहीं बताया गया — ',
    empty: 'अभी तक मरीज़ की कोई घटना दर्ज नहीं है।',
    warnNoTime: 'विवरण से समय संबंधी जानकारी नहीं पढ़ी जा सकी।',
    warnUnknown: 'कुछ घटनाओं का समय नहीं बताया गया — उन्हें बाद में सूचीबद्ध किया गया है।',
  },
  or: {
    heading: 'ରୋଗୀଙ୍କ ଦ୍ୱାରା କୁହାଯାଇଥିବା ଘଟଣା କ୍ରମ — ସେମାନଙ୍କ ନିଜ ଶବ୍ଦରେ, ନିଦାନ ନୁହେଁ',
    today: 'ଆଜି — ',
    yesterday: 'ଗତକାଲି — ',
    recentHours: 'ଏହି ଭେଟ ପୂର୍ବରୁ ପ୍ରାୟ {n} ଘଣ୍ଟା — ',
    recentDays: 'ଏହି ଭେଟ ପୂର୍ବରୁ ପ୍ରାୟ {n} ଦିନ — ',
    older: 'ଏହି ଭେଟ ପୂର୍ବରୁ ଏକ ସପ୍ତାହରୁ ଅଧିକ — ',
    onDate: '{d}ରେ — ',
    unknown: 'ସମୟ ଉଲ୍ଲେଖ କରାଯାଇନାହିଁ — ',
    empty: 'ଏପର୍ଯ୍ୟନ୍ତ ରୋଗୀଙ୍କ କୌଣସି ଘଟଣା ଦର୍ଜ ନାହିଁ।',
    warnNoTime: 'ବର୍ଣ୍ଣନାରୁ ସମୟ ସୂଚନା ପଢ଼ିହେଲା ନାହିଁ।',
    warnUnknown: 'କିଛି ଘଟଣାର ସମୟ ଉଲ୍ଲେଖ କରାଯାଇନାହିଁ — ସେଗୁଡ଼ିକୁ ପରେ ସୂଚୀବଦ୍ଧ କରାଯାଇଛି।',
  },
}

function fill(template: string, variables: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(variables[key] ?? ''))
}

export function summarizeTimeline(events: TimelineEvent[], language: SupportedLanguage): TimelineSummary {
  const labels = LABELS[language] ?? LABELS.en
  const warnings: string[] = []

  if (events.length === 0) {
    return { summary: labels.empty, warnings: [fill(labels.warnNoTime, {})] }
  }

  const buckets = new Map<string, Bucket>()
  for (const event of events) {
    const b = bucketOf(event.timePrecision, event.normalizedTime)
    const key = JSON.stringify(b)
    if (!buckets.has(key)) buckets.set(key, { key: b.key, label: b.key, events: [] })
    buckets.get(key)!.events.push(event)
  }

  const hasAnyTime = events.some((e) => e.normalizedTime !== null)
  if (!hasAnyTime) warnings.push(labels.warnNoTime)
  else if (events.some((e) => e.normalizedTime === null)) warnings.push(labels.warnUnknown)

  const lines = [labels.heading]
  for (const bucket of buckets.values()) {
    const first = bucket.events[0]
    const sample = bucket.events.map((e) => e.eventText).slice(0, 2).join('; ')
    let prefix = ''
    switch (bucket.key) {
      case 'today':
        prefix = labels.today
        break
      case 'yesterday':
        prefix = labels.yesterday
        break
      case 'recent-hours':
        prefix = fill(labels.recentHours, { n: first?.normalizedTime?.kind === 'relative' ? first.normalizedTime.hoursFromIntake ?? 0 : 0 })
        break
      case 'recent-days':
        prefix = fill(labels.recentDays, { n: first?.normalizedTime && first.normalizedTime.kind === 'relative' ? first.normalizedTime.daysFromIntake : 0 })
        break
      case 'older':
        prefix = labels.older
        break
      case 'on-date':
        prefix = fill(labels.onDate, { d: first?.normalizedTime?.kind === 'absolute' ? first.normalizedTime.iso : '' })
        break
      case 'unknown':
        prefix = labels.unknown
        break
    }
    lines.push(`${prefix}${sample}`)
  }

  return { summary: lines.join('\n'), warnings }
}