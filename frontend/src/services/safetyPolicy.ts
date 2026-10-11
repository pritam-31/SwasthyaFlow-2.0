/**
 * Responsible-AI safety policy.
 *
 * Single source of truth for:
 *  1. The non-diagnostic copy hardcoded into the UI (banner, consent modal,
 *     action buttons, referral note, PDF footer).
 *  2. The output guard that runs over every model-generated string.
 *
 * Rule: the system may describe, extract, organize and question — it may never
 * diagnose, prescribe, or recommend a treatment.
 *
 * Scope note: guards apply to *model-generated content*. The sanctioned
 * disclaimer constant itself contains the words "does not diagnose" and must be
 * attached to a response AFTER sanitization, never passed through it.
 */

import type { LanguageCode } from '../types/language.types'
import type { ConsentWithdrawalReasonCode, ConsentEventKind } from '../types/consent.types'
import type { RetentionTimelineKind } from '../types/retentionUi.types'
import type {
  ConfidenceBand,
  LowConfidenceItemType,
  LowConfidenceVerdict,
} from '../types/confidence.types'
import type {
  FeedbackReasonCode,
  FeedbackSeverity,
  FeedbackTargetType,
  FeedbackVerdict,
} from '../types/feedback.types'

export const NON_DIAGNOSTIC_STATEMENT =
  'SwasthyaFlow organises patient information and prepares a triage note for a qualified healthcare worker. ' +
  'It does not diagnose, does not prescribe, and does not replace a medical professional. ' +
  'Every AI-prepared note is a draft until a human accepts or edits it.'

export const NON_DIAGNOSTIC_SHORT =
  'Non-diagnostic assistive system — AI drafts, a healthcare worker decides.'

export const NON_DIAGNOSTIC_STATEMENT_HI =
  'स्वास्थ्यप्रवाह मरीज की सूचना को व्यवस्थित करता है और एक योग्य स्वास्थ्यकर्मी के लिए ट्राइएज नोट तैयार करता है। ' +
  'यह निदान नहीं करता, नुस्खा नहीं लिखता, और चिकित्सक की जगह नहीं लेता। ' +
  'हर AI-निर्मित नोट तब तक एक ड्राफ्ट है जब तक कोई स्वास्थ्यकर्मी उसे स्वीकार या संशोधित नहीं करता।'

export const NON_DIAGNOSTIC_STATEMENT_OR =
  'ସ୍ୱାସ୍ଥ୍ୟଫ୍ଲୋ ରୋଗୀର ସୂଚନାକୁ ସଜାଡ଼ିଥାଏ ଏବଂ ଜଣେ ଯୋଗ୍ୟ ସ୍ୱାସ୍ଥ୍ୟକର୍ମୀଙ୍କ ପାଇଁ ଟ୍ରାଇଏଜ ନୋଟ ପ୍ରସ୍ତୁତ କରିଥାଏ। ' +
  'ଏହା ନିଦାନ କରେ ନାହିଁ, ଔଷଧ ଲେଖେ ନାହିଁ, ଏବଂ ଚିକିତ୍ସକଙ୍କ ସ୍ଥାନ ନିଏ ନାହିଁ। ' +
  'ପ୍ରତି AI-ନିର୍ମିତ ନୋଟ ଜଣେ ସ୍ୱାସ୍ଥ୍ୟକର୍ମୀ ଗ୍ରହଣ ବା ସଂଶୋଧନ ନକରିବା ପର୍ଯ୍ୟନ୍ତ ଏକ ଡ୍ରାଫ୍ଟ।'

export const NON_DIAGNOSTIC_SHORT_HI =
  'सहायक प्रणाली (निदान नहीं) — AI ड्राफ्ट, निर्णय स्वास्थ्यकर्मी का।'

export const NON_DIAGNOSTIC_SHORT_OR =
  'ସହାୟକ ପ୍ରଣାଳୀ (ନିଦାନ ନୁହେଁ) — AI ଡ୍ରାଫ୍ଟ, ନିଷ୍ପତ୍ତି ସ୍ୱାସ୍ଥ୍ୟକର୍ମୀଙ୍କର।'

export const NON_DIAGNOSTIC_DISCLAIMER_PDF =
  'NON-DIAGNOSTIC REFERRAL SUMMARY. Prepared with AI assistance for a qualified healthcare worker. ' +
  'This document contains organised observations and open questions only. It is not a diagnosis, ' +
  'not a prescription and not a treatment plan. Clinical decisions remain the responsibility of ' +
  'the receiving qualified healthcare professional.'

export const CONSENT_POLICY_VERSION = 'v1.0-2026'

/** Photo workbench copy — mirrors backend VISUAL_DISCLAIMER. */
export const NON_DIAGNOSTIC_VISUAL_NOTE =
  'Non-diagnostic photo descriptions. An AI assistant looked at the REDACTED version of this photo and wrote ' +
  'descriptive observations for review by a qualified healthcare worker. They are not a diagnosis, not a ' +
  'prescription and not a treatment plan. Faces are detected with a prototype heuristic, so redactions may be ' +
  'broader than needed.'

/**
 * Patient-orienting copy for the timeline section, in the three supported
 * languages. The timeline organises patient-reported events into chronological
 * order; it never diagnoses. The label toggle only relabels the section — the
 * summarised content is rendered verbatim from the backend and is never passed
 * through `enforceNonDiagnostic` (the English headings contain the sanctioned
 * words "not a diagnosis").
 */
export const TIMELINE_SECTION_LABELS: Record<
  'en' | 'hi' | 'or',
  {
    title: string
    subtitle: string
    notBuilt: string
    buildHint: string
    events: string
    unknownTime: string
    statusDraft: string
    statusEdited: string
    statusAccepted: string
    build: string
    regenerate: string
    accept: string
    addEvent: string
    save: string
    cancel: string
    deleteEvent: string
    summary: string
    warnings: string
  }
> = {
  en: {
    title: 'Timeline',
    subtitle:
      'Patient-reported events in chronological order — a non-diagnostic organisation, never a diagnosis.',
    notBuilt: 'Timeline not built yet.',
    buildHint: 'A healthcare worker can build the AI draft on demand.',
    events: 'Events',
    unknownTime: 'Time not stated',
    statusDraft: 'AI draft — not yet reviewed',
    statusEdited: 'Edited by a human',
    statusAccepted: 'Accepted by reviewer',
    build: 'Build timeline',
    regenerate: 'Regenerate',
    accept: 'Accept as reviewed',
    addEvent: 'Add event',
    save: 'Save',
    cancel: 'Cancel',
    deleteEvent: 'Delete',
    summary: 'Summary',
    warnings: 'Build notes',
  },
  hi: {
    title: 'समयरेखा',
    subtitle:
      'रोगी द्वारा बताई गई घटनाएँ क्रम में व्यवस्थित — यह निदान नहीं, केवल एक गैर-नैदानिक आयोजन है।',
    notBuilt: 'समयरेखा अभी तैयार नहीं हुई।',
    buildHint: 'एक स्वास्थ्यकर्मी ड्राफ्ट मांग पर तैयार कर सकता है।',
    events: 'घटनाएँ',
    unknownTime: 'समय नहीं बताया गया',
    statusDraft: 'AI ड्राफ्ट — अभी समीक्षित नहीं',
    statusEdited: 'मानव द्वारा संपादित',
    statusAccepted: 'समीक्षक द्वारा स्वीकृत',
    build: 'समयरेखा बनाएं',
    regenerate: 'पुन उत्पन्न करें',
    accept: 'समीक्षित स्वीकारें',
    addEvent: 'घटना जोड़ें',
    save: 'सहेजें',
    cancel: 'रद्द करें',
    deleteEvent: 'हटाएं',
    summary: 'सारांश',
    warnings: 'निर्माण टिप्पणियाँ',
  },
  or: {
    title: 'ସମୟକ୍ରମ',
    subtitle:
      'ରୋଗୀ ଦ୍ୱାରା କୁହାଯାଇଥିବା ଘଟଣାଗୁଡ଼ିକ କ୍ରମରେ ସଜାଡ଼ିହୋଇଥାଏ — ଏହା ନିଦାନ ନୁହେଁ, କେବଳ ଏକ ଅଣ-ନିଦାନ ଆୟୋଜନ।',
    notBuilt: 'ସମୟକ୍ରମ ଏପର୍ଯ୍ୟନ୍ତ ପ୍ରସ୍ତୁତ ହୋଇନାହିଁ।',
    buildHint: 'ଜଣେ ସ୍ୱାସ୍ଥ୍ୟକର୍ମୀ ଡ୍ରାଫ୍ଟ ଆବଶ୍ୟକ ଅନୁଯାୟୀ ପ୍ରସ୍ତୁତ କରିପାରିବେ।',
    events: 'ଘଟଣାଗୁଡ଼ିକ',
    unknownTime: 'ସମୟ କୁହାଯାଇନାହିଁ',
    statusDraft: 'AI ଡ୍ରାଫ୍ଟ — ଏପର୍ଯ୍ୟନ୍ତ ସମୀକ୍ଷା ନୁହେଁ',
    statusEdited: 'ମାନବ ସମ୍ପାଦିତ',
    statusAccepted: 'ସମୀକ୍ଷକଙ୍କ ଦ୍ୱାରା ଗ୍ରହଣ',
    build: 'ସମୟକ୍ରମ ତିଆରି କରନ୍ତୁ',
    regenerate: 'ପୁନଃ ଉତ୍ପନ୍ନ କରନ୍ତୁ',
    accept: 'ସମୀକ୍ଷା ସ୍ୱୀକାର କରନ୍ତୁ',
    addEvent: 'ଘଟଣା ଯୋଡନ୍ତୁ',
    save: 'ସଞ୍ଚୟ କରନ୍ତୁ',
    cancel: 'ବାତିଲ',
    deleteEvent: 'ଅପସାରଣ',
    summary: 'ସାରାଂଶ',
    warnings: 'ନିର୍ମାଣ ଟିପ୍ପଣୀ',
  },
}

/**
 * Follow-up section copy (P0-5), in the three supported languages. The
 * questions themselves are authored by the backend's per-language plans and
 * rendered verbatim; this copy only labels the section and states the guard
 * the backend enforces (never request identifiers, never diagnose).
 */
export const FOLLOW_UP_SECTION_LABELS: Record<
  'en' | 'hi' | 'or',
  {
    title: string
    subtitle: string
    empty: string
    emptyHint: string
    generate: string
    regenerate: string
    addQuestion: string
    ask: string
    skip: string
    answer: string
    reason: string
    answeredBy: string
    neverAsks: string
    priority: string
  }
> = {
  en: {
    title: 'Follow-up questions',
    subtitle:
      'Context-aware questions a healthcare worker may put to the patient or the clinic team — they never ask for identifiers and never advise treatment.',
    empty: 'No follow-up questions yet.',
    emptyHint: 'A healthcare worker can generate the AI suggestions on demand.',
    generate: 'Generate questions',
    regenerate: 'Regenerate',
    addQuestion: 'Add a question',
    ask: 'Ask',
    skip: 'Skip',
    answer: 'Record answer',
    reason: 'Why this matters',
    answeredBy: 'Answered by',
    neverAsks: 'Suggested questions never request names, phones, addresses or IDs, and never ask for a diagnosis.',
    priority: 'Priority',
  },
  hi: {
    title: 'अनुवर्ती प्रश्न',
    subtitle:
      'स्वास्थ्यकर्मी इन सवालों को रोगी या क्लिनिक टीम से पूछ सकते हैं — ये न तो पहचान के लिए पूछते हैं और न ही इलाज की सलाह देते हैं।',
    empty: 'अभी कोई अनुवर्ती प्रश्न नहीं।',
    emptyHint: 'एक स्वास्थ्यकर्मी AI सुझाव मांग पर उत्पन्न कर सकता है।',
    generate: 'प्रश्न उत्पन्न करें',
    regenerate: 'पुन उत्पन्न करें',
    addQuestion: 'प्रश्न जोड़ें',
    ask: 'पूछें',
    skip: 'छोड़ें',
    answer: 'उत्तर दर्ज करें',
    reason: 'यह क्यों ज़रूरी है',
    answeredBy: 'उत्तर देने वाला',
    neverAsks: 'सुझाये गए प्रश्न कभी नाम, फोन, पता या आईडी नहीं मांगते और न ही निदान पूछते हैं।',
    priority: 'प्राथमिकता',
  },
  or: {
    title: 'ଅନୁସରଣ ପ୍ରଶ୍ନ',
    subtitle:
      'ସ୍ୱାସ୍ଥ୍ୟକର୍ମୀ ଏହି ପ୍ରଶ୍ନଗୁଡ଼ିକ ରୋଗୀ କିମ୍ବା କ୍ଲିନିକ ଦଳଙ୍କୁ ପଚାରିପାରିବେ — ଏହା ପରିଚୟ ମାଗେ ନାହିଁ ଏବଂ ଚିକିତ୍ସା ପରାମର୍ଶ ଦିଏ ନାହିଁ।',
    empty: 'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଅନୁସରଣ ପ୍ରଶ୍ନ ନାହିଁ।',
    emptyHint: 'ଜଣେ ସ୍ୱାସ୍ଥ୍ୟକର୍ମୀ ଆବଶ୍ୟକ ଅନୁଯାୟୀ AI ପରାମର୍ଶ ତିଆରି କରିପାରିବେ।',
    generate: 'ପ୍ରଶ୍ନ ତିଆରି କରନ୍ତୁ',
    regenerate: 'ପୁନଃ ଉତ୍ପନ୍ନ କରନ୍ତୁ',
    addQuestion: 'ପ୍ରଶ୍ନ ଯୋଡନ୍ତୁ',
    ask: 'ପଚାରନ୍ତୁ',
    skip: 'ଏଡ଼ାନ୍ତୁ',
    answer: 'ଉତ୍ତର ରେକର୍ଡ କରନ୍ତୁ',
    reason: 'ଏହା କାହିଁକି ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ',
    answeredBy: 'ଉତ୍ତର ଦେଇଥିବା ବ୍ୟକ୍ତି',
    neverAsks: 'ପରାମର୍ଶିତ ପ୍ରଶ୍ନ କେବେ ନାମ, ଫୋନ, ଠିକଣା କିମ୍ବା ID ମାଗେ ନାହିଁ ଏବଂ ନିଦାନ ମଧ୍ୟ ପଚାରେ ନାହିଁ।',
    priority: 'ପ୍ରାଥମିକତା',
  },
}

/**
 * Data-retention & consent copy (P0-6), in the three supported languages. The
 * retention engine erases data on schedule and on consent withdrawal; this copy
 * only labels the controls and states the guarantees. It is informational and
 * non-diagnostic.
 */
export const RETENTION_SECTION_LABELS: Record<
  'en' | 'hi' | 'or',
  {
    title: string
    subtitle: string
    consentHeading: string
    grantedAt: string
    grantedBy: string
    policyVersion: string
    purposesHeading: string
    revokedAt: string
    revokedBy: string
    revoke: string
    revokeConfirm: string
    revokeReason: string
    revokePlaceholder: string
    cancel: string
    confirmRevoke: string
    noConsent: string
    retentionHeading: string
    days: string
    forever: string
    disabled: string
    deleteData: string
    deleteHint: string
    extend: string
    extendHint: string
    extendDays: string
    exportData: string
    exportHint: string
    dataLifecycle: string
  }
> = {
  en: {
    title: 'Consent & data retention',
    subtitle:
      'Consent is recorded against a published retention policy. Withdrawing consent erases this case immediately; a deletion proof (no patient data) is retained.',
    consentHeading: 'Consent proof',
    grantedAt: 'Granted',
    grantedBy: 'Granted by',
    policyVersion: 'Policy version',
    purposesHeading: 'Agreed purposes',
    revokedAt: 'Withdrawn',
    revokedBy: 'Withdrawn by',
    revoke: 'Withdraw consent',
    revokeConfirm: 'Withdrawing consent permanently erases this case. Continue?',
    revokeReason: 'Reason (optional)',
    revokePlaceholder: 'Why is consent being withdrawn?',
    cancel: 'Cancel',
    confirmRevoke: 'Withdraw & erase',
    noConsent: 'No consent record is held for this case.',
    retentionHeading: 'Retention',
    days: 'days',
    forever: 'Kept indefinitely (rule disabled)',
    disabled: 'Disabled',
    deleteData: 'Delete data now',
    deleteHint: 'Erases every fragment of this case immediately — a non-patient deletion proof is kept.',
    extend: 'Extend retention',
    extendHint: 'Admin only. Pushes this case’s retention window out.',
    extendDays: 'Add days',
    exportData: 'Export a copy',
    exportHint: 'Builds a portable, non-diagnostic JSON copy of everything held about this case.',
    dataLifecycle:
      'Retention runs on a schedule; interim sweeps also erase expired source files and OCR buffers. Nothing here diagnoses.',
  },
  hi: {
    title: 'सहमति और डेटा प्रतिधारण',
    subtitle:
      'सहमति एक प्रकाशित प्रतिधारण नीति के अनुसार दर्ज की जाती है। सहमति वापस लेने पर यह केस तुरंत मिटा दिया जाता है; एक विलोपन प्रमाण (बिना रोगी डेटा) सुरक्षित रखा जाता है।',
    consentHeading: 'सहमति प्रमाण',
    grantedAt: 'दी गई',
    grantedBy: 'देने वाला',
    policyVersion: 'नीति संस्करण',
    purposesHeading: 'सहमत उद्देश्य',
    revokedAt: 'वापस ली गई',
    revokedBy: 'वापस लेने वाला',
    revoke: 'सहमति वापस लें',
    revokeConfirm: 'सहमति वापस लेने पर यह केस स्थायी रूप से मिट जाएगा। जारी रखें?',
    revokeReason: 'कारण (वैकल्पिक)',
    revokePlaceholder: 'सहमति क्यों वापस ली जा रही है?',
    cancel: 'रद्द करें',
    confirmRevoke: 'वापस लें और मिटाएं',
    noConsent: 'इस केस के लिए कोई सहमति रिकॉर्ड नहीं है।',
    retentionHeading: 'प्रतिधारण',
    days: 'दिन',
    forever: 'अनिश्चित काल तक रखा गया (नियम अक्षम)',
    disabled: 'अक्षम',
    deleteData: 'डेटा अभी हटाएं',
    deleteHint: 'इस केस का हर अंश तुरंत मिटाता है — बिना रोगी डेटा का विलोपन प्रमाण रखा जाता है।',
    extend: 'प्रतिधारण बढ़ाएं',
    extendHint: 'केवल एडमिन। इस केस की प्रतिधारण अवधि बढ़ाता है।',
    extendDays: 'दिन जोड़ें',
    exportData: 'प्रतिलिपि निर्यात करें',
    exportHint: 'इस केस के बारे में रखी गई हर जानकारी की एक गैर-नैदानिक JSON प्रतिलिपि बनाता है।',
    dataLifecycle:
      'प्रतिधारण एक अनुसूची पर चलता है; अंतरिम स्वीप समाप्त स्रोत फाइलें और OCR बफ़र भी मिटाते हैं। यहाँ कुछ भी निदान नहीं करता।',
  },
  or: {
    title: 'ସମ୍ମତି ଏବଂ ଡାଟା ଧାରଣ',
    subtitle:
      'ସମ୍ମତି ଏକ ପ୍ରକାଶିତ ଧାରଣ ନୀତି ଅନୁଯାୟୀ ରେକର୍ଡ କରାଯାଏ। ସମ୍ମତି ପ୍ରତ୍ୟାହାର କଲେ ଏହି କେସ ତୁରନ୍ତ ଲିଭାଯାଏ; ଏକ ବିଲୋପ ପ୍ରମାଣ (ରୋଗୀ ଡାଟା ବିନା) ସଂରକ୍ଷିତ ରହେ।',
    consentHeading: 'ସମ୍ମତି ପ୍ରମାଣ',
    grantedAt: 'ପ୍ରଦାନ',
    grantedBy: 'ପ୍ରଦାନକାରୀ',
    policyVersion: 'ନୀତି ସଂସ୍କରଣ',
    purposesHeading: 'ସମ୍ମତ ଉଦ୍ଦେଶ୍ୟ',
    revokedAt: 'ପ୍ରତ୍ୟାହୃତ',
    revokedBy: 'ପ୍ରତ୍ୟାହାରକାରୀ',
    revoke: 'ସମ୍ମତି ପ୍ରତ୍ୟାହାର କରନ୍ତୁ',
    revokeConfirm: 'ସମ୍ମତି ପ୍ରତ୍ୟାହାର କଲେ ଏହି କେସ ସ୍ଥାୟୀ ଭାବରେ ଲିଭିଯିବ। ଜାରି ରଖିବେ?',
    revokeReason: 'କାରଣ (ଇଚ୍ଛାଧୀନ)',
    revokePlaceholder: 'ସମ୍ମତି କାହିଁକି ପ୍ରତ୍ୟାହାର କରାଯାଉଛି?',
    cancel: 'ବାତିଲ',
    confirmRevoke: 'ପ୍ରତ୍ୟାହାର ଏବଂ ଲିଭାନ୍ତୁ',
    noConsent: 'ଏହି କେସ ପାଇଁ କୌଣସି ସମ୍ମତି ରେକର୍ଡ ନାହିଁ।',
    retentionHeading: 'ଧାରଣ',
    days: 'ଦିନ',
    forever: 'ଅନିର୍ଦ୍ଦିଷ୍ଟ କାଳ ପାଇଁ ରଖାଯାଇଛି (ନିୟମ ଅକ୍ଷମ)',
    disabled: 'ଅକ୍ଷମ',
    deleteData: 'ଡାଟା ବର୍ତ୍ତମାନ ଲିଭାନ୍ତୁ',
    deleteHint: 'ଏହି କେସର ପ୍ରତ୍ୟେକ ଅଂଶ ତୁରନ୍ତ ଲିଭାଏ — ରୋଗୀ ଡାଟା ବିନା ବିଲୋପ ପ୍ରମାଣ ରଖାଯାଏ।',
    extend: 'ଧାରଣ ବଢ଼ାନ୍ତୁ',
    extendHint: 'କେବଳ ଆଡମିନ୍। ଏହି କେସର ଧାରଣ ଅବଧି ବଢ଼ାଏ।',
    extendDays: 'ଦିନ ଯୋଡନ୍ତୁ',
    exportData: 'ଏକ ନକଲ ରପ୍ତାନି କରନ୍ତୁ',
    exportHint: 'ଏହି କେସ ବିଷୟରେ ରଖାଯାଇଥିବା ସମସ୍ତ ସୂଚନାର ଏକ ଅଣ-ନିଦାନ JSON ନକଲ ତିଆରି କରେ।',
    dataLifecycle:
      'ଧାରଣ ଏକ କାର୍ଯ୍ୟସୂଚୀ ଅନୁଯାୟୀ ଚାଲେ; ମଧ୍ୟବର୍ତ୍ତୀ ସ୍ୱିପ୍ ମିଆଦି ଉତ୍ସ ଫାଇଲ ଏବଂ OCR ବଫର ମଧ୍ୟ ଲିଭାଏ। ଏଠାରେ କିଛି ନିଦାନ କରେ ନାହିଁ।',
  },
}

/**
 * Unified-anonymisation section copy (P0-7), in the three supported languages.
 * The pipeline strips identifiers across every modality; this copy labels the
 * controls and states the guarantee. It is informational and non-diagnostic.
 * Placeholders themselves are always the backend's English `[X REDACTED]`
 * labels — this copy never re-localises them.
 */
export const ANONYMISATION_SECTION_LABELS: Record<
  'en' | 'hi' | 'or',
  {
    title: string
    subtitle: string
    previewHeading: string
    previewPlaceholder: string
    previewButton: string
    redactedOutput: string
    empty: string
    reportHeading: string
    coverage: string
    matchesHeading: string
    category: string
    replacement: string
    confidence: string
    language: string
    noMatches: string
    feedbackHeading: string
    verdictCorrect: string
    verdictFalsePositive: string
    verdictFalseNegative: string
    submitFeedback: string
    feedbackSaved: string
    metricsHeading: string
    totalRedacted: string
    coverageRatio: string
    falsePositives: string
    falseNegatives: string
    feedbackCount: string
    lastRun: string
    leakTestHeading: string
    runLeakTest: string
    leakTestPassed: string
    leakTestFailed: string
    noLeaks: string
    patternHeading: string
    patternsTotal: string
    disclaimer: string
  }
> = {
  en: {
    title: 'Anonymisation',
    subtitle:
      'Names, phone numbers, government IDs, addresses and every other identifier are stripped before storage, analysis or export — only typed placeholders remain. Anonymisation never changes clinical content.',
    previewHeading: 'Preview redaction',
    previewPlaceholder: 'Paste or type text to see the redacted output…',
    previewButton: 'Preview',
    redactedOutput: 'Redacted output',
    empty: 'Nothing to show yet.',
    reportHeading: 'Coverage report',
    coverage: 'Coverage',
    matchesHeading: 'Detected identifiers',
    category: 'Category',
    replacement: 'Placeholder',
    confidence: 'Confidence',
    language: 'Language',
    noMatches: 'No identifiers detected in this report.',
    feedbackHeading: 'Reviewer feedback',
    verdictCorrect: 'Correct',
    verdictFalsePositive: 'False positive',
    verdictFalseNegative: 'Missed (false negative)',
    submitFeedback: 'Submit verdict',
    feedbackSaved: 'Verdict recorded.',
    metricsHeading: 'Anonymisation metrics',
    totalRedacted: 'Identifiers redacted',
    coverageRatio: 'Coverage ratio',
    falsePositives: 'False positives',
    falseNegatives: 'False negatives',
    feedbackCount: 'Feedback entries',
    lastRun: 'Last run',
    leakTestHeading: 'PII leak test',
    runLeakTest: 'Run leak tests',
    leakTestPassed: 'cases passed',
    leakTestFailed: 'cases failed',
    noLeaks: 'No leaks — every synthetic identifier was stripped.',
    patternHeading: 'Pattern inventory',
    patternsTotal: 'Total patterns',
    disclaimer:
      'Identifiers are removed before storage; raw PII is never persisted, returned or logged. Nothing here diagnoses.',
  },
  hi: {
    title: 'अनामीकरण',
    subtitle:
      'नाम, फ़ोन नंबर, सरकारी आईडी, पते और हर अन्य पहचानकर्ता संग्रहण, विश्लेषण या निर्यात से पहले हटा दिए जाते हैं — केवल टाइप किए गए प्लेसहोल्डर रहते हैं। अनामीकरण नैदानिक सामग्री को कभी नहीं बदलता।',
    previewHeading: 'रिडैक्शन पूर्वावलोकन',
    previewPlaceholder: 'रिडैक्ट किया गया आउटपुट देखने के लिए टेक्स्ट चिपकाएँ या लिखें…',
    previewButton: 'पूर्वावलोकन',
    redactedOutput: 'रिडैक्ट किया गया आउटपुट',
    empty: 'अभी दिखाने के लिए कुछ नहीं।',
    reportHeading: 'कवरेज रिपोर्ट',
    coverage: 'कवरेज',
    matchesHeading: 'पहचाने गए पहचानकर्ता',
    category: 'श्रेणी',
    replacement: 'प्लेसहोल्डर',
    confidence: 'विश्वास',
    language: 'भाषा',
    noMatches: 'इस रिपोर्ट में कोई पहचानकर्ता नहीं मिला।',
    feedbackHeading: 'समीक्षक प्रतिक्रिया',
    verdictCorrect: 'सही',
    verdictFalsePositive: 'झूठा सकारात्मक',
    verdictFalseNegative: 'छूटा (झूठा नकारात्मक)',
    submitFeedback: 'निर्णय भेजें',
    feedbackSaved: 'निर्णय दर्ज किया गया।',
    metricsHeading: 'अनामीकरण मेट्रिक्स',
    totalRedacted: 'रिडैक्ट किए गए पहचानकर्ता',
    coverageRatio: 'कवरेज अनुपात',
    falsePositives: 'झूठे सकारात्मक',
    falseNegatives: 'झूठे नकारात्मक',
    feedbackCount: 'प्रतिक्रिया प्रविष्टियाँ',
    lastRun: 'अंतिम रन',
    leakTestHeading: 'PII लीक परीक्षण',
    runLeakTest: 'लीक परीक्षण चलाएँ',
    leakTestPassed: 'केस पास',
    leakTestFailed: 'केस विफल',
    noLeaks: 'कोई लीक नहीं — हर सिंथेटिक पहचानकर्ता हटा दिया गया।',
    patternHeading: 'पैटर्न सूची',
    patternsTotal: 'कुल पैटर्न',
    disclaimer:
      'संग्रहण से पहले पहचानकर्ता हटा दिए जाते हैं; कच्चा PII कभी संग्रहीत, लौटाया या लॉग नहीं किया जाता। यहाँ कुछ भी निदान नहीं करता।',
  },
  or: {
    title: 'ଅନାମିକରଣ',
    subtitle:
      'ନାମ, ଫୋନ ନମ୍ବର, ସରକାରୀ ID, ଠିକଣା ଏବଂ ଅନ୍ୟ ସମସ୍ତ ପରିଚାୟକ ସଂରକ୍ଷଣ, ବିଶ୍ଳେଷଣ କିମ୍ବା ରପ୍ତାନି ପୂର୍ବରୁ ହଟାଯାଏ — କେବଳ ଟାଇପ୍ କରାଯାଇଥିବା ପ୍ଲେସହୋଲଡର ରହେ। ଅନାମିକରଣ ନୈଦାନିକ ବିଷୟବସ୍ତୁକୁ କେବେ ବଦଳାଏ ନାହିଁ।',
    previewHeading: 'ରିଡ୍ୟାକ୍ସନ ପୂର୍ବାବଲୋକନ',
    previewPlaceholder: 'ରିଡ୍ୟାକ୍ଟ ଆଉଟପୁଟ ଦେଖିବା ପାଇଁ ଟେକ୍ସଟ ଲେଖନ୍ତୁ କିମ୍ବା ପେଷ୍ଟ କରନ୍ତୁ…',
    previewButton: 'ପୂର୍ବାବଲୋକନ',
    redactedOutput: 'ରିଡ୍ୟାକ୍ଟ ଆଉଟପୁଟ',
    empty: 'ଏପର୍ଯ୍ୟନ୍ତ ଦେଖାଇବାକୁ କିଛି ନାହିଁ।',
    reportHeading: 'କଭରେଜ ରିପୋର୍ଟ',
    coverage: 'କଭରେଜ',
    matchesHeading: 'ଚିହ୍ନଟ ପରିଚାୟକ',
    category: 'ବର୍ଗ',
    replacement: 'ପ୍ଲେସହୋଲଡର',
    confidence: 'ବିଶ୍ୱାସ',
    language: 'ଭାଷା',
    noMatches: 'ଏହି ରିପୋର୍ଟରେ କୌଣସି ପରିଚାୟକ ମିଳିଲା ନାହିଁ।',
    feedbackHeading: 'ସମୀକ୍ଷକ ମତାମତ',
    verdictCorrect: 'ସଠିକ',
    verdictFalsePositive: 'ମିଥ୍ୟା ଧନାତ୍ମକ',
    verdictFalseNegative: 'ଛୁଟିଗଲା (ମିଥ୍ୟା ଋଣାତ୍ମକ)',
    submitFeedback: 'ନିର୍ଣ୍ଣୟ ପଠାନ୍ତୁ',
    feedbackSaved: 'ନିର୍ଣ୍ଣୟ ରେକର୍ଡ ହେଲା।',
    metricsHeading: 'ଅନାମିକରଣ ମେଟ୍ରିକ୍ସ',
    totalRedacted: 'ରିଡ୍ୟାକ୍ଟ ପରିଚାୟକ',
    coverageRatio: 'କଭରେଜ ଅନୁପାତ',
    falsePositives: 'ମିଥ୍ୟା ଧନାତ୍ମକ',
    falseNegatives: 'ମିଥ୍ୟା ଋଣାତ୍ମକ',
    feedbackCount: 'ମତାମତ ପ୍ରବେଶ',
    lastRun: 'ଶେଷ ରନ',
    leakTestHeading: 'PII ଲିକ ପରୀକ୍ଷା',
    runLeakTest: 'ଲିକ ପରୀକ୍ଷା ଚଲାନ୍ତୁ',
    leakTestPassed: 'କେସ ପାସ',
    leakTestFailed: 'କେସ ବିଫଳ',
    noLeaks: 'କୌଣସି ଲିକ ନାହିଁ — ପ୍ରତ୍ୟେକ ସିନ୍ଥେଟିକ ପରିଚାୟକ ହଟାଯାଇଛି।',
    patternHeading: 'ପ୍ୟାଟର୍ନ ତାଲିକା',
    patternsTotal: 'ମୋଟ ପ୍ୟାଟର୍ନ',
    disclaimer:
      'ସଂରକ୍ଷଣ ପୂର୍ବରୁ ପରିଚାୟକ ହଟାଯାଏ; କଞ୍ଚା PII କେବେ ସଂରକ୍ଷିତ, ଫେରାଯାଏ କିମ୍ବା ଲଗ ହୁଏ ନାହିଁ। ଏଠାରେ କିଛି ନିଦାନ କରେ ନାହିଁ।',
  },
}

/**
 * Client-side mirror of the backend's PII-request guard. The backend is the
 * source of truth (it rejects 400 with a suggestion); this copy powers the
 * soft hint on the clinician question form before submission.
 */
const PII_REQUEST_PATTERNS: RegExp[] = [  /\b(?:your|the patient'?s|the) (?:name|full name)\b/i,
  /\b(?:patient'?s|your) (?:phone|mobile|number)\b/i,
  /\b(?:your|patient'?s) (?:home |postal |mailing )?address\b/gi,
  /\b(?:aadhaar|adhaar|uidai)\b/i,
  /\b(?:date of birth|dob|जन्म तिथि|ଜନ୍ମ ତାରିଖ)\b/i,
  /\b(?:passport|voter id|ration card|pan card)\b/i,
]

/** Returns the first matched personal-identifier request (or null). */
export function findPiiRequestLanguage(text: string): string | null {
  for (const re of PII_REQUEST_PATTERNS) {
    const hit = text.match(re)
    if (hit) return hit[0]
  }
  return null
}

/**
 * The only labels allowed to appear on a photo. The backend's extraction layer
 * is restricted to this descriptive vocabulary, so a rendering bug can never
 * turn a photo row into advice.
 */
export const VISUAL_SAFE_LABELS = [
  'Stored resolution',
  'Original file',
  'Dominant colour',
  'Colour range',
  'Mean brightness (0-255)',
  'Dark zones (outside redactions)',
  'Texture detail level',
  'OCR text words found',
  'EXIF / GPS / device metadata',
] as const

/** Descriptive image classes a photo may be routed to — never a condition. */
export const VISUAL_TYPE_LABELS: Record<
  'wound' | 'rash' | 'report-photo' | 'xray' | 'scan' | 'swelling' | 'bruise' | 'eye' | 'oral' | 'ear' | 'general' | 'unknown',
  string
> = {
  wound: 'Wound / cut photo',
  rash: 'Skin / rash photo',
  'report-photo': 'Photograph of a document',
  xray: 'Radiograph photo',
  scan: 'Imaging scan photo',
  swelling: 'Swelling photo',
  bruise: 'Bruise / discolouration photo',
  eye: 'Eye photo',
  oral: 'Mouth / oral photo',
  ear: 'Ear photo',
  general: 'General clinical photo',
  unknown: 'Unclassified photo',
}

/**
 * Language that must never appear in model output. Each pattern is paired with
 * a neutral replacement so a violation degrades safely instead of leaking.
 */
const BANNED_PHRASES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bdiagnos(?:is|es|e|ed|ing)\b/gi, replacement: 'non-diagnostic summary' },
  { pattern: /\bprescrib(?:e|es|ed|ing|ption)\b/gi, replacement: 'clinician decision' },
  { pattern: /\btreat(?:ment|ments)\b/gi, replacement: 'clinical management' },
  { pattern: /\byou have\b/gi, replacement: 'the patient reports' },
  { pattern: /\bsuffers? from\b/gi, replacement: 'reports' },
  { pattern: /\bindicative of\b/gi, replacement: 'recorded alongside' },
  { pattern: /\bis likely (?:to be|a|an)\b/gi, replacement: 'was recorded alongside' },
  { pattern: /\btake (?:this |these )?(?:tablet|medicine|drug)s?\b/gi, replacement: 'review current medicines with a healthcare worker' },
]

/** Returns every banned phrase still present in `text` (used by the guard). */
export function findDiagnosticLanguage(text: string): string[] {
  const hits: string[] = []
  for (const { pattern } of BANNED_PHRASES) {
    const re = new RegExp(pattern.source, pattern.flags.replace('g', ''))
    if (re.test(text)) hits.push(pattern.source)
  }
  return hits
}

/** Strips/replaces diagnosis- or prescription-language in free text. */
export function enforceNonDiagnostic(text: string): string {
  return BANNED_PHRASES.reduce((acc, { pattern, replacement }) => acc.replace(pattern, replacement), text)
}

/**
 * Deep-walks model-generated content and passes every string through
 * {@link enforceNonDiagnostic} before it reaches application state.
 */
export function sanitizeForNonDiagnostic<T>(value: T): T {
  if (typeof value === 'string') return enforceNonDiagnostic(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => sanitizeForNonDiagnostic(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeForNonDiagnostic(v)
    }
    return out as T
  }
  return value
}

/**
 * Defence in depth: throws when diagnosis/prescription language survives
 * sanitization. Run against generated content only (never the disclaimer text).
 */
export function assertNonDiagnostic(payload: unknown, contextLabel: string): void {
  const stray = JSON.stringify(payload).match(
    /\b(diagnos(?:is|es|e|ed|ing)|prescrib(?:e|es|ed|ing|ption)|you have|suffers? from|indicative of)\b/gi,
  )
  if (stray) {
    throw new Error(
      `Non-diagnostic guard blocked ${contextLabel}: forbidden phrase(s) ${stray.join(', ')}. ` +
        'The triage service must never emit diagnosis or prescription language.',
    )
  }
}

/**
 * Offline-connectivity copy (P1-8), in the three supported languages. Queued
 * writes are human-in-the-loop drafts until they sync, and a conflict is never
 * resolved automatically — a person must choose which version to keep.
 */
export const OFFLINE_SECTION_LABELS: Record<
  'en' | 'hi' | 'or',
  {
    offlineBanner: string
    backOnline: string
    queuedForSync: (n: number) => string
    syncing: string
    allSynced: string
    pending: string
    failed: string
    needsDecision: string
    requiresConnection: string
    willQueueOffline: string
    queuedToast: string
    unavailable: string
    indicatorOnline: string
    indicatorOffline: string
    indicatorSyncing: string
    indicatorPending: (n: number) => string
    indicatorConflicts: (n: number) => string
    queueTitle: string
    queueEmpty: string
    retry: string
    retryAll: string
    remove: string
    close: string
    conflictTitle: string
    conflictBody: string
    yourVersion: string
    serverVersion: string
    keepMine: string
    keepServer: string
    abandon: string
  }
> = {
  en: {
    offlineBanner:
      'You are offline. New entries are saved on this device and will sync automatically when the connection returns.',
    backOnline: 'Back online — syncing your queued entries.',
    queuedForSync: (n) => `${n} ${n === 1 ? 'entry is' : 'entries are'} queued to sync.`,
    syncing: 'Syncing…',
    allSynced: 'All queued entries synced.',
    pending: 'Pending',
    failed: 'Failed',
    needsDecision: 'Needs your decision',
    requiresConnection: 'This action needs a connection.',
    willQueueOffline: 'Saved offline — it will sync when you reconnect.',
    queuedToast: 'Saved offline. It will sync automatically.',
    unavailable: 'Not available offline yet.',
    indicatorOnline: 'Online',
    indicatorOffline: 'Offline',
    indicatorSyncing: 'Syncing',
    indicatorPending: (n) => `${n} pending`,
    indicatorConflicts: (n) => `${n} conflict${n === 1 ? '' : 's'}`,
    queueTitle: 'Offline queue',
    queueEmpty: 'Nothing waiting to sync.',
    retry: 'Retry',
    retryAll: 'Retry all',
    remove: 'Remove',
    close: 'Close',
    conflictTitle: 'Needs your decision',
    conflictBody:
      'This entry was saved offline but the case has changed on the server. Nothing was overwritten — choose which version to keep.',
    yourVersion: 'Your version',
    serverVersion: 'Server version',
    keepMine: 'Keep mine',
    keepServer: 'Keep server version',
    abandon: 'Discard my change',
  },
  hi: {
    offlineBanner:
      'आप ऑफ़लाइन हैं। नई प्रविष्टियाँ इस डिवाइस पर सहेजी जाती हैं और कनेक्शन लौटने पर स्वतः सिंक हो जाएँगी।',
    backOnline: 'फिर ऑनलाइन — आपकी कतारबद्ध प्रविष्टियाँ सिंक हो रही हैं।',
    queuedForSync: (n) => `${n} प्रविष्टि(याँ) सिंक के लिए कतार में।`,
    syncing: 'सिंक हो रहा है…',
    allSynced: 'सभी कतारबद्ध प्रविष्टियाँ सिंक हो गईं।',
    pending: 'प्रतीक्षारत',
    failed: 'विफल',
    needsDecision: 'आपके निर्णय की आवश्यकता',
    requiresConnection: 'इस क्रिया के लिए कनेक्शन चाहिए।',
    willQueueOffline: 'ऑफ़लाइन सहेजा गया — फिर कनेक्ट होने पर सिंक होगा।',
    queuedToast: 'ऑफ़लाइन सहेजा गया। यह स्वतः सिंक हो जाएगा।',
    unavailable: 'ऑफ़लाइन अभी उपलब्ध नहीं।',
    indicatorOnline: 'ऑनलाइन',
    indicatorOffline: 'ऑफ़लाइन',
    indicatorSyncing: 'सिंक हो रहा है',
    indicatorPending: (n) => `${n} प्रतीक्षारत`,
    indicatorConflicts: (n) => `${n} टकराव`,
    queueTitle: 'ऑफ़लाइन कतार',
    queueEmpty: 'सिंक के लिए कुछ नहीं।',
    retry: 'पुनः प्रयास',
    retryAll: 'सभी पुनः प्रयास',
    remove: 'हटाएँ',
    close: 'बंद करें',
    conflictTitle: 'आपके निर्णय की आवश्यकता',
    conflictBody:
      'यह प्रविष्टि ऑफ़लाइन सहेजी गई थी, पर केस सर्वर पर बदल चुका है। कुछ भी अपने-आप नहीं बदला गया — चुनें कौन सा संस्करण रखना है।',
    yourVersion: 'आपका संस्करण',
    serverVersion: 'सर्वर संस्करण',
    keepMine: 'मेरा रखें',
    keepServer: 'सर्वर संस्करण रखें',
    abandon: 'मेरा बदलाव हटाएँ',
  },
  or: {
    offlineBanner:
      'ଆପଣ ଅଫଲାଇନ ଅଛନ୍ତି। ନୂଆ ପ୍ରବେଶ ଏହି ଡିଭାଇସରେ ସଞ୍ଚୟ ହୁଏ ଏବଂ ସଂଯୋଗ ଫେରିଲେ ସ୍ୱଚାଳିତ ଭାବରେ ସିଙ୍କ ହେବ।',
    backOnline: 'ପୁଣି ଅନଲାଇନ — ଆପଣଙ୍କ ଧାଡ଼ିରେ ଥିବା ପ୍ରବେଶ ସିଙ୍କ ହେଉଛି।',
    queuedForSync: (n) => `${n} ଟି ପ୍ରବେଶ ସିଙ୍କ ପାଇଁ ଧାଡ଼ିରେ ଅଛି।`,
    syncing: 'ସିଙ୍କ ହେଉଛି…',
    allSynced: 'ସମସ୍ତ ଧାଡ଼ି ପ୍ରବେଶ ସିଙ୍କ ହୋଇଗଲା।',
    pending: 'ଅପେକ୍ଷାରତ',
    failed: 'ବିଫଳ',
    needsDecision: 'ଆପଣଙ୍କ ନିଷ୍ପତ୍ତି ଆବଶ୍ୟକ',
    requiresConnection: 'ଏହି କାର୍ଯ୍ୟ ପାଇଁ ସଂଯୋଗ ଆବଶ୍ୟକ।',
    willQueueOffline: 'ଅଫଲାଇନ ସଞ୍ଚୟ — ପୁଣି ସଂଯୁକ୍ତ ହେଲେ ସିଙ୍କ ହେବ।',
    queuedToast: 'ଅଫଲାଇନ ସଞ୍ଚୟ ହେଲା। ଏହା ସ୍ୱଚାଳିତ ଭାବରେ ସିଙ୍କ ହେବ।',
    unavailable: 'ଅଫଲାଇନରେ ଏବେ ଉପଲବ୍ଧ ନାହିଁ।',
    indicatorOnline: 'ଅନଲାଇନ',
    indicatorOffline: 'ଅଫଲାଇନ',
    indicatorSyncing: 'ସିଙ୍କ ହେଉଛି',
    indicatorPending: (n) => `${n} ଅପେକ୍ଷାରତ`,
    indicatorConflicts: (n) => `${n} ଦ୍ୱନ୍ଦ୍ୱ`,
    queueTitle: 'ଅଫଲାଇନ ଧାଡ଼ି',
    queueEmpty: 'ସିଙ୍କ ପାଇଁ କିଛି ନାହିଁ।',
    retry: 'ପୁଣି ଚେଷ୍ଟା',
    retryAll: 'ସମସ୍ତ ପୁଣି ଚେଷ୍ଟା',
    remove: 'ହଟାନ୍ତୁ',
    close: 'ବନ୍ଦ କରନ୍ତୁ',
    conflictTitle: 'ଆପଣଙ୍କ ନିଷ୍ପତ୍ତି ଆବଶ୍ୟକ',
    conflictBody:
      'ଏହି ପ୍ରବେଶ ଅଫଲାଇନ ସଞ୍ଚିତ ହୋଇଥିଲା, କିନ୍ତୁ କେସ ସର୍ଭରରେ ବଦଳିଛି। କିଛି ଆପେ ଆପେ ବଦଳା ଯାଇ ନାହିଁ — କେଉଁ ସଂସ୍କରଣ ରଖିବେ ଚୟନ କରନ୍ତୁ।',
    yourVersion: 'ଆପଣଙ୍କ ସଂସ୍କରଣ',
    serverVersion: 'ସର୍ଭର ସଂସ୍କରଣ',
    keepMine: 'ମୋର ରଖନ୍ତୁ',
    keepServer: 'ସର୍ଭର ସଂସ୍କରଣ ରଖନ୍ତୁ',
    abandon: 'ମୋର ପରିବର୍ତ୍ତନ ହଟାନ୍ତୁ',
  },
}

/**
 * Priority-queue copy (P1-11), in the three supported languages. The score is a
 * transparent, rule-based ordering — every point is explained by an observable
 * input and never diagnoses anything. Labels only; the reason strings come from
 * the backend per-language scoring service.
 */
export const PRIORITY_SECTION_LABELS: Record<
  'en' | 'hi' | 'or',
  {
    title: string
    subtitle: string
    score: string
    band: string
    waiting: string
    sla: string
    slaBreached: string
    slaWithin: string
    assignment: string
    assignedTo: string
    unassigned: string
    pinned: string
    deprioritised: string
    reviewed: string
    override: string
    clearOverride: string
    pin: string
    deprioritise: string
    markReviewed: string
    recompute: string
    refresh: string
    assign: string
    unassign: string
    breakdown: string
    computedBand: string
    reason: string
    overrideReason: string
    overrideScore: string
    overrideBand: string
    submit: string
    cancel: string
    saved: string
    cleared: string
    slaConfig: string
    slaConfigHint: string
    save: string
    minutes: string
    total: string
    summary: string
    critical: string
    high: string
    medium: string
    low: string
    routine: string
    disclaimer: string
    cannotOverride: string
    staffOnly: string
  }
> = {
  en: {
    title: 'Priority queue',
    subtitle:
      'A transparent, rule-based ordering of the review queue. Every point is explained by an observable input and never diagnoses.',
    score: 'Score',
    band: 'Band',
    waiting: 'Waiting',
    sla: 'SLA target',
    slaBreached: 'SLA breached',
    slaWithin: 'Within SLA',
    assignment: 'Assignment',
    assignedTo: 'Assigned to',
    unassigned: 'Unassigned',
    pinned: 'Pinned',
    deprioritised: 'Deprioritised',
    reviewed: 'Reviewed',
    override: 'Override',
    clearOverride: 'Clear override',
    pin: 'Pin to top',
    deprioritise: 'Deprioritise',
    markReviewed: 'Mark reviewed',
    recompute: 'Recompute queue',
    refresh: 'Refresh',
    assign: 'Assign',
    unassign: 'Unassign',
    breakdown: 'Why this score',
    computedBand: 'Computed band',
    reason: 'Reason',
    overrideReason: 'Reason for the override (required)',
    overrideScore: 'Score (0-100)',
    overrideBand: 'Band',
    submit: 'Apply override',
    cancel: 'Cancel',
    saved: 'Override saved.',
    cleared: 'Override cleared.',
    slaConfig: 'SLA thresholds',
    slaConfigHint:
      'Target waiting time per band, in minutes. More urgent bands can never wait longer than less urgent ones.',
    save: 'Save thresholds',
    minutes: 'min',
    total: 'in queue',
    summary: 'Queue summary',
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    routine: 'Routine',
    disclaimer:
      'This priority is a transparent, rule-based ordering for staff workload. It is not a diagnosis, a prescription or a prediction, and a human always decides.',
    cannotOverride: 'Your role cannot change this.',
    staffOnly: 'Clinical staff only.',
  },
  hi: {
    title: 'प्राथमिकता कतार',
    subtitle:
      'समीक्षा कतार का पारदर्शी, नियम-आधारित क्रम — हर अंक किसी देखे गए तथ्य से समझाया जाता है और कोई निदान नहीं करता।',
    score: 'अंक',
    band: 'श्रेणी',
    waiting: 'प्रतीक्षा',
    sla: 'SLA',
    slaBreached: 'SLA उल्लंघन',
    slaWithin: 'SLA के भीतर',
    assignment: 'सौंपना',
    assignedTo: 'सौंपा गया',
    unassigned: 'अनावंटित',
    pinned: 'पिन किया',
    deprioritised: 'कम प्राथमिकता',
    reviewed: 'समीक्षित',
    override: 'ओवरराइड',
    clearOverride: 'ओवरराइड हटाएं',
    pin: 'ऊपर पिन करें',
    deprioritise: 'नीचे करें',
    markReviewed: 'समीक्षित चिह्नित करें',
    recompute: 'कतार पुनर्गणना',
    refresh: 'ताज़ा करें',
    assign: 'सौंपें',
    unassign: 'हटाएं',
    breakdown: 'अंक विवरण',
    computedBand: 'परिकलित श्रेणी',
    reason: 'कारण',
    overrideReason: 'ओवरराइड का कारण',
    overrideScore: 'अंक',
    overrideBand: 'श्रेणी',
    submit: 'ओवरराइड लागू करें',
    cancel: 'रद्द करें',
    saved: 'ओवरराइड सहेजा गया।',
    cleared: 'ओवरराइड हटाया गया।',
    slaConfig: 'SLA सीमाएँ',
    slaConfigHint:
      'प्रत्येक श्रेणी के लिए लक्ष्य प्रतीक्षा समय (मिनट में)। अधिक तात्कालिक श्रेणी कभी कम प्राथमिकता वाली से अधिक प्रतीक्षा नहीं कर सकती।',
    save: 'सीमाएं सहेजें',
    minutes: 'मिनट',
    total: 'कतार में',
    summary: 'कतार सारांश',
    critical: 'गंभीर',
    high: 'उच्च',
    medium: 'मध्यम',
    low: 'निम्न',
    routine: 'सामान्य',
    disclaimer:
      'यह प्राथमिकता कर्मचारियों के कार्यभार के लिए एक पारदर्शी, नियम-आधारित क्रम है। यह निदान, नुस्खा या भविष्यवाणी नहीं है, और निर्णय सदैव मनुष्य करता है।',
    cannotOverride: 'आपकी भूमिका इसे बदल नहीं सकती।',
    staffOnly: 'केवल चिकित्सा कर्मचारी।',
  },
  or: {
    title: 'ପ୍ରାଥମିକତା ଧାଡ଼ି',
    subtitle:
      'ସମୀକ୍ଷା ଧାଡ଼ିର ଏକ ସ୍ୱଚ୍ଛ, ନିୟମ-ଆଧାରିତ କ୍ରମ — ପ୍ରତ୍ୟେକ ପଏଣ୍ଟ ଏକ ଦୃଶ୍ୟମାନ ତଥ୍ୟ ଦ୍ୱାରା ବ୍ୟାଖ୍ୟା କରାଯାଏ ଏବଂ ନିଦାନ କରେ ନାହିଁ।',
    score: 'ସ୍କୋର',
    band: 'ବ୍ୟାଣ୍ଡ',
    waiting: 'ଅପେକ୍ଷା',
    sla: 'SLA',
    slaBreached: 'SLA ଉଲ୍ଲଂଘନ',
    slaWithin: 'SLA ଭିତରେ',
    assignment: 'ନ୍ୟାସ୍',
    assignedTo: 'ନ୍ୟସ୍ତ',
    unassigned: 'ଅଣଆବଣ୍ଟିତ',
    pinned: 'ପିନ୍ କରାଯାଇଛି',
    deprioritised: 'କମ ପ୍ରାଥମିକତା',
    reviewed: 'ସମୀକ୍ଷିତ',
    override: 'ଓଭରରାଇଡ',
    clearOverride: 'ଓଭରରାଇଡ ହଟାନ୍ତୁ',
    pin: 'ଉପରେ ପିନ୍ କରନ୍ତୁ',
    deprioritise: 'ତଳକୁ କରନ୍ତୁ',
    markReviewed: 'ସମୀକ୍ଷିତ ଚିହ୍ନଟ କରନ୍ତୁ',
    recompute: 'ଧାଡ଼ି ପୁନଃଗଣନା',
    refresh: 'ରିଫ୍ରେସ୍',
    assign: 'ଅର୍ପଣ କରନ୍ତୁ',
    unassign: 'ଅର୍ପଣ ହଟାନ୍ତୁ',
    breakdown: 'ଅଙ୍କ ବିବରଣୀ',
    computedBand: 'ଗଣିତ ବର୍ଗ',
    reason: 'କାରଣ',
    overrideReason: 'ଓଭରରାଇଡ କାରଣ',
    overrideScore: 'ଅଙ୍କ',
    overrideBand: 'ବର୍ଗ',
    submit: 'ଓଭରରାଇଡ ଲାଗୁ କରନ୍ତୁ',
    cancel: 'ବାତିଲ',
    saved: 'ଓଭରରାଇଡ ସଞ୍ଚିତ।',
    cleared: 'ଓଭରରାଇଡ ହଟାଗଲା।',
    slaConfig: 'SLA ସୀମା',
    slaConfigHint:
      'ପ୍ରତି ବର୍ଗର ଲକ୍ଷ୍ୟ ଅପେକ୍ଷା ସମୟ (ମିନିଟରେ)। ଅଧିକ ଜରୁରୀ ବର୍ଗ କେବେ କମ ଜରୁରୀ ବର୍ଗଠାରୁ ଅଧିକ ଅପେକ୍ଷା କରିପାରିବ ନାହିଁ।',
    save: 'ସୀମା ସଞ୍ଚୟ କରନ୍ତୁ',
    minutes: 'ମିନିଟ',
    total: 'ଧାଡ଼ିରେ',
    summary: 'ଧାଡ଼ି ସାରାଂଶ',
    critical: 'ଗମ୍ଭୀର',
    high: 'ଉଚ୍ଚ',
    medium: 'ମଧ୍ୟମ',
    low: 'ନିମ୍ନ',
    routine: 'ସାଧାରଣ',
    disclaimer:
      'ଏହି ପ୍ରାଥମିକତା କର୍ମଚାରୀ କାର୍ଯ୍ୟଭାର ପାଇଁ ଏକ ପାରଦର୍ଶୀ, ନିୟମ-ଆଧାରିତ କ୍ରମ। ଏହା ନିଦାନ, ଔଷଧ କିମ୍ବା ପୂର୍ବାନୁମାନ ନୁହେଁ, ଏବଂ ନିଷ୍ପତ୍ତି ସର୍ବଦା ଜଣେ ମାନବ ନେଇଥାଏ।',
    cannotOverride: 'ଆପଣଙ୍କ ଭୂମିକା ଏହାକୁ ବଦଳାଇ ପାରିବ ନାହିଁ।',
    staffOnly: 'କେବଳ ଚିକିତ୍ସା କର୍ମଚାରୀ।',
  },
}

/** Security console copy (P1-12) — personal section for everyone, admin for managers. */
export const SECURITY_SECTION_LABELS: Record<
  'en' | 'hi' | 'or',
  {
    title: string
    subtitle: string
    adminOnly: string
    personalTitle: string
    passwordTitle: string
    passwordChange: string
    currentPassword: string
    newPassword: string
    confirmPassword: string
    passwordMismatch: string
    passwordsDontMatch: string
    updatePassword: string
    passwordUpdated: string
    strength: string
    twoFactorTitle: string
    twoFactorSubtitle: string
    enable: string
    disable: string
    setupTitle: string
    scanQr: string
    enterCode: string
    codePlaceholder: string
    verifyAndEnable: string
    twoFactorEnabled: string
    twoFactorDisabled: string
    sessionsTitle: string
    sessionsSubtitle: string
    current: string
    revoke: string
    sessionRevoked: string
    noSessions: string
    devicesTitle: string
    devicesSubtitle: string
    noDevices: string
    revokeDevice: string
    deviceRevoked: string
    policyTitle: string
    policySubtitle: string
    savePolicy: string
    policySaved: string
    minLength: string
    requireLetter: string
    requireDigit: string
    requireSymbol: string
    blockCommon: string
    blockUsername: string
    expiryDays: string
    maxFailures: string
    baseLockoutMinutes: string
    exponential: string
    maxLockoutMinutes: string
    accessTokenMinutes: string
    refreshTokenDays: string
    concurrentSessionLimit: string
    deviceBinding: string
    twoFactorRequired: string
    allowedRoles: string
    ipAllowlistEnabled: string
    cidrs: string
    globalPerMinute: string
    authPerMinute: string
    sensitivePerMinute: string
    uploadPerMinute: string
    syncPerMinute: string
    eventsTitle: string
    eventsSubtitle: string
    noEvents: string
    lockoutsTitle: string
    lockoutsSubtitle: string
    clearLockout: string
    lockoutCleared: string
    noLockouts: string
    blocklistTitle: string
    blocklistSubtitle: string
    blockIp: string
    blockIpPlaceholder: string
    reasonPlaceholder: string
    durationPlaceholder: string
    unblock: string
    ipBlocked: string
    ipUnblocked: string
    noBlocked: string
    passwordRulesHint: string
  }
> = {
  en: {
    title: 'Security',
    subtitle:
      'Sign-in protection, your sessions and devices, and — for administrators — the facility security policy.',
    adminOnly: 'Administrator',
    personalTitle: 'Your account security',
    passwordTitle: 'Change password',
    passwordChange: 'Uses the strict policy: at least 12 characters with letters, digits and a symbol — and not a common password.',
    currentPassword: 'Current password',
    newPassword: 'New password',
    confirmPassword: 'Confirm new password',
    passwordMismatch: 'New passwords do not match.',
    passwordsDontMatch: 'New passwords do not match.',
    updatePassword: 'Update password',
    passwordUpdated: 'Password updated. Sign-in elsewhere has been revoked.',
    strength: 'Strength',
    twoFactorTitle: 'Two-factor authentication',
    twoFactorSubtitle: 'A time-based one-time password app adds a second factor to sign-in.',
    enable: 'Enable 2FA',
    disable: 'Disable 2FA',
    setupTitle: 'Scan the QR code',
    scanQr: 'Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.',
    enterCode: '6-digit code',
    codePlaceholder: 'e.g. 123456',
    verifyAndEnable: 'Verify and enable',
    twoFactorEnabled: 'Two-factor authentication is enabled.',
    twoFactorDisabled: 'Two-factor authentication is disabled.',
    sessionsTitle: 'Active sessions',
    sessionsSubtitle: 'Every signed-in device. Revoking a session signs that device out.',
    current: 'current',
    revoke: 'Revoke',
    sessionRevoked: 'Session revoked.',
    noSessions: 'No active sessions.',
    devicesTitle: 'Known devices',
    devicesSubtitle: 'Detected signing-in devices. Revoking signs every session from the device out.',
    noDevices: 'No devices recorded yet.',
    revokeDevice: 'Revoke device',
    deviceRevoked: 'Device revoked.',
    policyTitle: 'Security policy',
    policySubtitle: 'These rules are enforced by the backend on every sign-in and every attempt. Changes log an audit event.',
    savePolicy: 'Save policy',
    policySaved: 'Security policy saved.',
    minLength: 'Minimum length',
    requireLetter: 'Require a letter',
    requireDigit: 'Require a digit',
    requireSymbol: 'Require a symbol',
    blockCommon: 'Block common passwords',
    blockUsername: 'Block passwords containing the username',
    expiryDays: 'Expiry (days, 0 = never)',
    maxFailures: 'Failures before lockout',
    baseLockoutMinutes: 'Base lockout (minutes)',
    exponential: 'Exponential lockout',
    maxLockoutMinutes: 'Maximum lockout (minutes)',
    accessTokenMinutes: 'Access window (minutes)',
    refreshTokenDays: 'Refresh token lifetime (days)',
    concurrentSessionLimit: 'Concurrent session limit',
    deviceBinding: 'Soft device binding',
    twoFactorRequired: 'Require 2FA',
    allowedRoles: 'Roles requiring 2FA',
    ipAllowlistEnabled: 'Restrict to allowed IPs',
    cidrs: 'Allowed CIDRs (comma-separated)',
    globalPerMinute: 'Global limit (per minute)',
    authPerMinute: 'Sign-in attempts limit (per minute)',
    sensitivePerMinute: 'Sensitive operations limit (per minute)',
    uploadPerMinute: 'Upload operations limit (per minute)',
    syncPerMinute: 'Sync operations limit (per minute)',
    eventsTitle: 'Security events',
    eventsSubtitle: 'The pseudonymised trail from the security layer. Events never contain identifiers.',
    noEvents: 'No security events recorded yet.',
    lockoutsTitle: 'Active lockouts',
    lockoutsSubtitle: 'Accounts locked after repeated failed sign-ins. Only the hashed key is shown.',
    clearLockout: 'Clear',
    lockoutCleared: 'Lockout cleared.',
    noLockouts: 'No active lockouts.',
    blocklistTitle: 'IP blocklist',
    blocklistSubtitle: 'IPs barred at the network edge. Entries may be temporary.',
    blockIp: 'Block an IP',
    blockIpPlaceholder: 'e.g. 203.0.113.9',
    reasonPlaceholder: 'reason why this IP is blocked',
    durationPlaceholder: 'minutes (blank = permanent)',
    unblock: 'Unblock',
    ipBlocked: 'IP blocked.',
    ipUnblocked: 'IP unblocked.',
    noBlocked: 'No blocked IPs.',
    passwordRulesHint: 'The strict policy applies to self-service password changes and to accounts created by administrators.',
  },
  hi: {
    title: 'सुरक्षा',
    subtitle: 'साइन-इन सुरक्षा, आपके सत्र और डिवाइस — और प्रशासकों के लिए सुविधा सुरक्षा नीति।',
    adminOnly: 'प्रशासक',
    personalTitle: 'आपकी खाता सुरक्षा',
    passwordTitle: 'पासवर्ड बदलें',
    passwordChange: 'सख्त नीति लागू: कम से कम 12 अक्षर, जिसमें अक्षर, अंक और प्रतीक हों — सामान्य पासवर्ड नहीं।',
    currentPassword: 'वर्तमान पासवर्ड',
    newPassword: 'नया पासवर्ड',
    confirmPassword: 'नया पासवर्ड फिर दर्ज करें',
    passwordMismatch: 'नए पासवर्ड मेल नहीं खाते।',
    passwordsDontMatch: 'नए पासवर्ड मेल नहीं खाते।',
    updatePassword: 'पासवर्ड अपडेट करें',
    passwordUpdated: 'पासवर्ड अपडेट हो गया। अन्य साइन-इन समाप्त कर दिए गए।',
    strength: 'मज़बूती',
    twoFactorTitle: 'दो-चरणीय प्रमाणीकरण',
    twoFactorSubtitle: 'समय-आधारित एक-बार पासवर्ड ऐप साइन-इन में दूसरा चरण जोड़ता है।',
    enable: '2FA चालू करें',
    disable: '2FA बंद करें',
    setupTitle: 'QR कोड स्कैन करें',
    scanQr: 'अपने प्रमाणीकरण ऐप से QR कोड स्कैन करें, फिर 6-अंकीय कोड दर्ज करें।',
    enterCode: '6-अंकीय कोड',
    codePlaceholder: 'जैसे 123456',
    verifyAndEnable: 'जांचें और चालू करें',
    twoFactorEnabled: 'दो-चरणीय प्रमाणीकरण चालू है।',
    twoFactorDisabled: 'दो-चरणीय प्रमाणीकरण बंद है।',
    sessionsTitle: 'सक्रिय सत्र',
    sessionsSubtitle: 'हर साइन-इन किया हुआ डिवाइस। सत्र समाप्त करने पर वह डिवाइस साइन-आउट हो जाता है।',
    current: 'वर्तमान',
    revoke: 'समाप्त करें',
    sessionRevoked: 'सत्र समाप्त हो गया।',
    noSessions: 'कोई सक्रिय सत्र नहीं।',
    devicesTitle: 'ज्ञात डिवाइस',
    devicesSubtitle: 'पहचाने गए साइन-इन डिवाइस। समाप्त करने पर उस डिवाइस के सभी सत्र साइन-आउट हो जाते हैं।',
    noDevices: 'अभी कोई डिवाइस दर्ज नहीं।',
    revokeDevice: 'डिवाइस समाप्त करें',
    deviceRevoked: 'डिवाइस समाप्त हो गया।',
    policyTitle: 'सुरक्षा नीति',
    policySubtitle: 'ये नियम प्रत्येक साइन-इन और प्रयास पर सर्वर द्वारा लागू होते हैं। बदलाव एक ऑडिट घटना दर्ज करता है।',
    savePolicy: 'नीति सहेजें',
    policySaved: 'सुरक्षा नीति सहेजी गई।',
    minLength: 'न्यूनतम लंबाई',
    requireLetter: 'अक्षर आवश्यक',
    requireDigit: 'अंक आवश्यक',
    requireSymbol: 'प्रतीक आवश्यक',
    blockCommon: 'सामान्य पासवर्ड ब्लॉक करें',
    blockUsername: 'उपयोगकर्ता-नाम वाले पासवर्ड ब्लॉक करें',
    expiryDays: 'समाप्ति (दिन, 0 = कभी नहीं)',
    maxFailures: 'लॉकआउट से पहले असफल प्रयास',
    baseLockoutMinutes: 'आधार लॉकआउट (मिनट)',
    exponential: 'घातीय लॉकआउट',
    maxLockoutMinutes: 'अधिकतम लॉकआउट (मिनट)',
    accessTokenMinutes: 'पहुंच विंडो (मिनट)',
    refreshTokenDays: 'रिफ्रेश टोकन आयु (दिन)',
    concurrentSessionLimit: 'समवर्ती सत्र सीमा',
    deviceBinding: 'सॉफ्ट डिवाइस बंधन',
    twoFactorRequired: '2FA अनिवार्य',
    allowedRoles: '2FA आवश्यक भूमिकाएँ',
    ipAllowlistEnabled: 'केवल स्वीकृत IP तक सीमित करें',
    cidrs: 'स्वीकृत CIDR (अल्पविराम से अलग)',
    globalPerMinute: 'वैश्विक सीमा (प्रति मिनट)',
    authPerMinute: 'साइन-इन प्रयास सीमा (प्रति मिनट)',
    sensitivePerMinute: 'संवेदनशील कार्यों की सीमा (प्रति मिनट)',
    uploadPerMinute: 'अपलोड कार्यों की सीमा (प्रति मिनट)',
    syncPerMinute: 'सिंक कार्यों की सीमा (प्रति मिनट)',
    eventsTitle: 'सुरक्षा घटनाएँ',
    eventsSubtitle: 'सुरक्षा परत का अनामित ट्रायल। घटनाओं में कभी पहचानकर्ता नहीं होते।',
    noEvents: 'अभी कोई सुरक्षा घटना दर्ज नहीं।',
    lockoutsTitle: 'सक्रिय लॉकआउट',
    lockoutsSubtitle: 'बार-बार असफल साइन-इन के बाद लॉक किए गए खाते। केवल हैश्ड कुंजी दिखती है।',
    clearLockout: 'हटाएँ',
    lockoutCleared: 'लॉकआउट हट गया।',
    noLockouts: 'कोई सक्रिय लॉकआउट नहीं।',
    blocklistTitle: 'IP ब्लॉकलिस्ट',
    blocklistSubtitle: 'नेटवर्क किनारे पर बैर किए गए IP। प्रविष्टियाँ अस्थायी हो सकती हैं।',
    blockIp: 'IP ब्लॉक करें',
    blockIpPlaceholder: 'जैसे 203.0.113.9',
    reasonPlaceholder: 'कारण कि यह IP क्यों ब्लॉक है',
    durationPlaceholder: 'मिनट (खाली = स्थायी)',
    unblock: 'अनब्लॉक',
    ipBlocked: 'IP ब्लॉक हो गया।',
    ipUnblocked: 'IP अनब्लॉक हो गया।',
    noBlocked: 'कोई ब्लॉक किया हुआ IP नहीं।',
    passwordRulesHint: 'सख्त नीति स्व-सेवा पासवर्ड बदलने और प्रशासक द्वारा बनाए गए खातों पर लागू होती है।',
  },
  or: {
    title: 'ନିରାପତ୍ତା',
    subtitle: 'ସାଇନ-ଇନ ସୁରକ୍ଷା, ଆପଣଙ୍କ ସେସନ ଏବଂ ଡିଭାଇସ୍ — ଏବଂ ପ୍ରଶାସକମାନଙ୍କ ପାଇଁ ସୁବିଧା ନିରାପତ୍ତା ନୀତି।',
    adminOnly: 'ପ୍ରଶାସକ',
    personalTitle: 'ଆପଣଙ୍କ ଖାତା ନିରାପତ୍ତା',
    passwordTitle: 'ପାସୱାର୍ଡ ବଦଳାନ୍ତୁ',
    passwordChange: 'କଠୋର ନୀତି ଲାଗୁ: ଅତି କମରେ 12 ଅକ୍ଷର, ଯେଉଁଥିରେ ଅକ୍ଷର, ଅଙ୍କ ଏବଂ ସଙ୍କେତ ଅଛି — ସାଧାରଣ ପାସୱାର୍ଡ ନୁହେଁ।',
    currentPassword: 'ବର୍ତ୍ତମାନର ପାସୱାର୍ଡ',
    newPassword: 'ନୂଆ ପାସୱାର୍ଡ',
    confirmPassword: 'ନୂଆ ପାସୱାର୍ଡ ପୁଣି ଦିଅନ୍ତୁ',
    passwordMismatch: 'ନୂଆ ପାସୱାର୍ଡ ମେଳ ଖାଉ ନାହିଁ।',
    passwordsDontMatch: 'ନୂଆ ପାସୱାର୍ଡ ମେଳ ଖାଉ ନାହିଁ।',
    updatePassword: 'ପାସୱାର୍ଡ ଅପଡେଟ କରନ୍ତୁ',
    passwordUpdated: 'ପାସୱାର୍ଡ ଅପଡେଟ ହେଲା। ଅନ୍ୟ ସାଇନ-ଇନ ସମାପ୍ତ କରାଗଲା।',
    strength: 'ମଜବୁତାଇ',
    twoFactorTitle: 'ଦୁଇ-ପାଦ ପ୍ରମାଣିକରଣ',
    twoFactorSubtitle: 'ସମୟ-ଆଧାରିତ ଏକଥର ପାସୱାର୍ଡ ଆପ ସାଇନ-ଇନରେ ଦ୍ୱିତୀୟ ପାଦ ଯୋଡ଼େ।',
    enable: '2FA ସକ୍ରିୟ କରନ୍ତୁ',
    disable: '2FA ଅସକ୍ରିୟ କରନ୍ତୁ',
    setupTitle: 'QR କୋଡ ସ୍କାନ କରନ୍ତୁ',
    scanQr: 'ଆପଣଙ୍କ ପ୍ରମାଣିକରଣ ଆପରେ QR କୋଡ ସ୍କାନ କରନ୍ତୁ, ତାପରେ 6-ଅଙ୍କିଆ କୋଡ ଦିଅନ୍ତୁ।',
    enterCode: '6-ଅଙ୍କିଆ କୋଡ',
    codePlaceholder: 'ଯଥା 123456',
    verifyAndEnable: 'ଯାଞ୍ଚ କରି ସକ୍ରିୟ କରନ୍ତୁ',
    twoFactorEnabled: 'ଦୁଇ-ପାଦ ପ୍ରମାଣିକରଣ ସକ୍ରିୟ ଅଛି।',
    twoFactorDisabled: 'ଦୁଇ-ପାଦ ପ୍ରମାଣିକରଣ ଅସକ୍ରିୟ ଅଛି।',
    sessionsTitle: 'ସକ୍ରିୟ ସେସନ',
    sessionsSubtitle: 'ପ୍ରତ୍ୟେକ ସାଇନ-କରାବା ଡିଭାଇସ୍। ସେସନ ସମାପ୍ତ କଲେ ସେହି ଡିଭାଇସ୍ ସାଇନ-ଆଉଟ ହୁଏ।',
    current: 'ବର୍ତ୍ତମାନ',
    revoke: 'ସମାପ୍ତ କରନ୍ତୁ',
    sessionRevoked: 'ସେସନ ସମାପ୍ତ ହେଲା।',
    noSessions: 'କୌଣସି ସକ୍ରିୟ ସେସନ ନାହିଁ।',
    devicesTitle: 'ଜଣାଶୁଣା ଡିଭାଇସ୍',
    devicesSubtitle: 'ଚିହ୍ନଟ ସାଇନ-ଇନ ଡିଭାଇସ୍। ସମାପ୍ତ କଲେ ସେହି ଡିଭାଇସ୍ ର ସବୁ ସେସନ ସାଇନ-ଆଉଟ ହୁଏ।',
    noDevices: 'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଡିଭାଇସ୍ ଦର୍ଜ ନାହିଁ।',
    revokeDevice: 'ଡିଭାଇସ୍ ସମାପ୍ତ କରନ୍ତୁ',
    deviceRevoked: 'ଡିଭାଇସ୍ ସମାପ୍ତ ହେଲା।',
    policyTitle: 'ନିରାପତ୍ତା ନୀତି',
    policySubtitle: 'ଏହି ନିୟମ ପ୍ରତ୍ୟେକ ସାଇନ-ଇନ ଏବଂ ପ୍ରୟାସରେ ସର୍ଭର ଦ୍ୱାରା ଲାଗୁ ହୁଏ। ପରିବର୍ତ୍ତନ ଏକ ଅଡିଟ୍ ଘଟଣା ଦର୍ଜ କରେ।',
    savePolicy: 'ନୀତି ସଞ୍ଚୟ କରନ୍ତୁ',
    policySaved: 'ନିରାପତ୍ତା ନୀତି ସଞ୍ଚିତ ହେଲା।',
    minLength: 'ସର୍ବନିମ୍ନ ଦୈର୍ଘ୍ୟ',
    requireLetter: 'ଅକ୍ଷର ଆବଶ୍ୟକ',
    requireDigit: 'ଅଙ୍କ ଆବଶ୍ୟକ',
    requireSymbol: 'ସଙ୍କେତ ଆବଶ୍ୟକ',
    blockCommon: 'ସାଧାରଣ ପାସୱାର୍ଡ ବ୍ଲକ କରନ୍ତୁ',
    blockUsername: 'ଉପଯୋଗକର୍ତ୍ତା-ନାମ ଥିବା ପାସୱାର୍ଡ ବ୍ଲକ କରନ୍ତୁ',
    expiryDays: 'ଅବଧି (ଦିନ, 0 = କେବେ ନୁହେଁ)',
    maxFailures: 'ଲକଆଉଟ ପୂର୍ବରୁ ବିଫଳ ପ୍ରୟାସ',
    baseLockoutMinutes: 'ଆଧାର ଲକଆଉଟ (ମିନିଟ)',
    exponential: 'ଘାତୀୟ ଲକଆଉଟ',
    maxLockoutMinutes: 'ସର୍ବାଧିକ ଲକଆଉଟ (ମିନିଟ)',
    accessTokenMinutes: 'ପ୍ରବେଶ ୱିଣ୍ଡୋ (ମିନିଟ)',
    refreshTokenDays: 'ରିଫ୍ରେସ ଟୋକନ ଆୟୁ (ଦିନ)',
    concurrentSessionLimit: 'ସମକାଳୀନ ସେସନ ସୀମା',
    deviceBinding: 'ସଫ୍ଟ ଡିଭାଇସ୍ ବନ୍ଧନ',
    twoFactorRequired: '2FA ବାଧ୍ୟତାମୂଳକ',
    allowedRoles: '2FA ଆବଶ୍ୟକ ଭୂମିକା',
    ipAllowlistEnabled: 'କେବଳ ଅନୁମତିପ୍ରାପ୍ତ IP ରେ ସୀମିତ କରନ୍ତୁ',
    cidrs: 'ଅନୁମତିପ୍ରାପ୍ତ CIDR (କମା ଦ୍ୱାରା ଅଲଗା)',
    globalPerMinute: 'ବିଶ୍ୱ ସୀମା (ପ୍ରତି ମିନିଟ)',
    authPerMinute: 'ସାଇନ-ଇନ ପ୍ରୟାସ ସୀମା (ପ୍ରତି ମିନିଟ)',
    sensitivePerMinute: 'ସମ୍ବେଦନଶୀଳ କାର୍ଯ୍ୟ ସୀମା (ପ୍ରତି ମିନିଟ)',
    uploadPerMinute: 'ଅପଲୋଡ କାର୍ଯ୍ୟ ସୀମା (ପ୍ରତି ମିନିଟ)',
    syncPerMinute: 'ସିଙ୍କ କାର୍ଯ୍ୟ ସୀମା (ପ୍ରତି ମିନିଟ)',
    eventsTitle: 'ନିରାପତ୍ତା ଘଟଣା',
    eventsSubtitle: 'ନିରାପତ୍ତା ସ୍ତରର ଅଜ୍ଞାତ ରେଖା। ଘଟଣାରେ କେବେ ପରିଚୟ ନଥାଏ।',
    noEvents: 'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ନିରାପତ୍ତା ଘଟଣା ଦର୍ଜ ନାହିଁ।',
    lockoutsTitle: 'ସକ୍ରିୟ ଲକଆଉଟ',
    lockoutsSubtitle: 'ବାରମ୍ବାର ବିଫଳ ସାଇନ-ଇନ ପରେ ଲକ ଖାତା। କେବଳ ହ୍ୟାସ୍ଡ କି ଦେଖାଯାଏ।',
    clearLockout: 'ହଟାନ୍ତୁ',
    lockoutCleared: 'ଲକଆଉଟ ହଟିଲା।',
    noLockouts: 'କୌଣସି ସକ୍ରିୟ ଲକଆଉଟ ନାହିଁ।',
    blocklistTitle: 'IP ବ୍ଲକଲିଷ୍ଟ',
    blocklistSubtitle: 'ନେଟୱର୍କ କିନାରାରେ ବାର କରାଯାଇଥିବା IP। ପ୍ରବେଶ ସାମୟିକ ହୋଇପାରେ।',
    blockIp: 'IP ବ୍ଲକ କରନ୍ତୁ',
    blockIpPlaceholder: 'ଯଥା 203.0.113.9',
    reasonPlaceholder: 'ଏହି IP କାହିଁକି ବ୍ଲକ',
    durationPlaceholder: 'ମିନିଟ (ଖାଲି = ସ୍ଥାୟୀ)',
    unblock: 'ଅନବ୍ଲକ',
    ipBlocked: 'IP ବ୍ଲକ ହେଲା।',
    ipUnblocked: 'IP ଅନବ୍ଲକ ହେଲା।',
    noBlocked: 'କୌଣସି ବ୍ଲକ IP ନାହିଁ।',
    passwordRulesHint: 'କଠୋର ନୀତି ସ୍ୱୟଂ-ସେବା ପାସୱାର୍ଡ ପରିବର୍ତ୍ତନ ଏବଂ ପ୍ରଶାସକଙ୍କ ଦ୍ୱାରା ନିର୍ମିତ ଖାତାରେ ପ୍ରଯୁଜ୍ୟ।',
  },
}

/**
 * Model-card + failure-mode catalogue copy (P2-13). The card bodies themselves
 * are authored in English by the backend (documented: card bodies English-only)
 * — this copy only labels the page chrome and the actions.
 */
export const MODEL_CARD_SECTION_LABELS: Record<
  'en' | 'hi' | 'or',
  {
    title: string
    subtitle: string
    tabCards: string
    tabFailures: string
    searchPlaceholder: string
    noCards: string
    version: string
    status: string
    updated: string
    updatedBy: string
    intendedUse: string
    outOfScope: string
    nonDiagnosticTitle: string
    humanInLoopTitle: string
    trainingData: string
    syntheticOnly: string
    volume: string
    languages: string
    modalities: string
    intendedUsers: string
    risks: string
    versionHistory: string
    changelog: string
    loading: string
    selectCard: string
    edit: string
    save: string
    cancel: string
    readOnly: string
    editingTitle: string
    newVersion: string
    newVersionHint: string
    changelogLabel: string
    changelogPlaceholder: string
    saved: string
    updateFailed: string
    statusLabel: string
    active: string
    deprecated: string
    retired: string
    cardCount: string
    failureCount: string
    layer: string
    summary: string
    description: string
    name: string
    print: string
  }
> = {
  en: {
    title: 'Model cards',
    subtitle:
      'Governance documentation for the eight AI / rule layers. Each card states the layer’s intended use, its out-of-scope uses and its known risks. Cards never diagnose anything.',
    tabCards: 'Cards',
    tabFailures: 'Failure modes',
    searchPlaceholder: 'Search cards…',
    noCards: 'No model cards found.',
    version: 'Version',
    status: 'Status',
    updated: 'Updated',
    updatedBy: 'Updated by',
    intendedUse: 'Intended use',
    outOfScope: 'Out of scope',
    nonDiagnosticTitle: 'Non-diagnostic statement',
    humanInLoopTitle: 'Human in the loop',
    trainingData: 'Training data',
    syntheticOnly: 'Synthetic data only',
    volume: 'Volume',
    languages: 'Languages',
    modalities: 'Modalities',
    intendedUsers: 'Intended users',
    risks: 'Risks & limitations',
    versionHistory: 'Version history',
    changelog: 'Changelog',
    loading: 'Loading model cards…',
    selectCard: 'Select a card to read its full details.',
    edit: 'Edit card',
    save: 'Save new version',
    cancel: 'Cancel',
    readOnly: 'Read-only — a system administrator can update model cards.',
    editingTitle: 'Edit model card',
    newVersion: 'New semantic version',
    newVersionHint: 'Must be strictly greater than the current version (for example 1.1.0). A changelog entry is required.',
    changelogLabel: 'Changelog entry',
    changelogPlaceholder: 'What changed in this version?',
    saved: 'Model card updated.',
    updateFailed: 'Could not update the model card.',
    statusLabel: 'Lifecycle status',
    active: 'Active',
    deprecated: 'Deprecated',
    retired: 'Retired',
    cardCount: 'cards',
    failureCount: 'failure modes',
    layer: 'Layer',
    summary: 'Summary',
    description: 'Description',
    name: 'Name',
    print: 'Print / save as PDF',
  },
  hi: {
    title: 'मॉडल कार्ड',
    subtitle:
      'आठ AI / नियम परतों के लिए शासन दस्तावेज़। प्रत्येक कार्ड परत का उद्देश्य, कार्यक्षेत्र से बाहर के उपयोग और ज्ञात जोखिम बताता है। कार्ड कभी निदान नहीं करते।',
    tabCards: 'कार्ड',
    tabFailures: 'विफलता मोड',
    searchPlaceholder: 'कार्ड खोजें…',
    noCards: 'कोई मॉडल कार्ड नहीं मिला।',
    version: 'संस्करण',
    status: 'स्थिति',
    updated: 'अद्यतन',
    updatedBy: 'द्वारा अद्यतन',
    intendedUse: 'अभीष्ट उपयोग',
    outOfScope: 'कार्यक्षेत्र से बाहर',
    nonDiagnosticTitle: 'गैर-नैदानिक कथन',
    humanInLoopTitle: 'मानव समीक्षा',
    trainingData: 'प्रशिक्षण डेटा',
    syntheticOnly: 'केवल सिंथेटिक डेटा',
    volume: 'मात्रा',
    languages: 'भाषाएँ',
    modalities: 'माध्यम',
    intendedUsers: 'अभीष्ट उपयोगकर्ता',
    risks: 'जोखिम और सीमाएँ',
    versionHistory: 'संस्करण इतिहास',
    changelog: 'परिवर्तन-सूची',
    loading: 'मॉडल कार्ड लोड हो रहे हैं…',
    selectCard: 'पूर्ण विवरण पढ़ने के लिए एक कार्ड चुनें।',
    edit: 'कार्ड संपादित करें',
    save: 'नया संस्करण सहेजें',
    cancel: 'रद्द करें',
    readOnly: 'केवल पढ़ने के लिए — सिस्टम प्रशासक मॉडल कार्ड अपडेट कर सकता है।',
    editingTitle: 'मॉडल कार्ड संपादित करें',
    newVersion: 'नया सिमेंटिक संस्करण',
    newVersionHint: 'वर्तमान संस्करण से बड़ा होना चाहिए (जैसे 1.1.0)। परिवर्तन-सूची प्रविष्टि आवश्यक है।',
    changelogLabel: 'परिवर्तन-सूची प्रविष्टि',
    changelogPlaceholder: 'इस संस्करण में क्या बदला?',
    saved: 'मॉडल कार्ड अद्यतन हुआ।',
    updateFailed: 'मॉडल कार्ड अद्यतन नहीं हो सका।',
    statusLabel: 'जीवनचक्र स्थिति',
    active: 'सक्रिय',
    deprecated: 'अप्रचलित',
    retired: 'सेवानिवृत्त',
    cardCount: 'कार्ड',
    failureCount: 'विफलता मोड',
    layer: 'परत',
    summary: 'सारांश',
    description: 'विवरण',
    name: 'नाम',
    print: 'प्रिंट / PDF के रूप में सहेजें',
  },
  or: {
    title: 'ମଡେଲ କାର୍ଡ',
    subtitle:
      'ଆଠଟି AI / ନିୟମ ସ୍ତର ପାଇଁ ପରିଚାଳନା ଦସ୍ତାବିଜ। ପ୍ରତ୍ୟେକ କାର୍ଡ ସ୍ତରର ଉଦ୍ଦେଶ୍ୟ, ପରିସର ବାହାରର ବ୍ୟବହାର ଏବଂ ଜଣା ବିପଦ କୁହେ। କାର୍ଡ କେବେ ନିଦାନ କରେ ନାହିଁ।',
    tabCards: 'କାର୍ଡ',
    tabFailures: 'ବିଫଳତା ମୋଡ',
    searchPlaceholder: 'କାର୍ଡ ଖୋଜନ୍ତୁ…',
    noCards: 'କୌଣସି ମଡେଲ କାର୍ଡ ମିଳିଲା ନାହିଁ।',
    version: 'ସଂସ୍କରଣ',
    status: 'ସ୍ଥିତି',
    updated: 'ଅଦ୍ୟତନ',
    updatedBy: 'ଦ୍ୱାରା ଅଦ୍ୟତନ',
    intendedUse: 'ଉଦ୍ଦିଷ୍ଟ ବ୍ୟବହାର',
    outOfScope: 'ପରିସର ବାହାରେ',
    nonDiagnosticTitle: 'ଅଣ-ନିଦାନ ବିବୃତ୍ତି',
    humanInLoopTitle: 'ମାନବ ସମୀକ୍ଷା',
    trainingData: 'ପ୍ରଶିକ୍ଷଣ ଡାଟା',
    syntheticOnly: 'କେବଳ ସିନ୍ଥେଟିକ ଡାଟା',
    volume: 'ପରିମାଣ',
    languages: 'ଭାଷା',
    modalities: 'ମାଧ୍ୟମ',
    intendedUsers: 'ଉଦ୍ଦିଷ୍ଟ ବ୍ୟବହାରକାରୀ',
    risks: 'ବିପଦ ଏବଂ ସୀମା',
    versionHistory: 'ସଂସ୍କରଣ ଇତିହାସ',
    changelog: 'ପରିବର୍ତ୍ତନ ତାଲିକା',
    loading: 'ମଡେଲ କାର୍ଡ ଲୋଡ ହେଉଛି…',
    selectCard: 'ସମ୍ପୂର୍ଣ୍ଣ ବିବରଣ ପଢ଼ିବା ପାଇଁ ଏକ କାର୍ଡ ଚୟନ କରନ୍ତୁ।',
    edit: 'କାର୍ଡ ସମ୍ପାଦନ କରନ୍ତୁ',
    save: 'ନୂଆ ସଂସ୍କରଣ ସଞ୍ଚୟ କରନ୍ତୁ',
    cancel: 'ବାତିଲ',
    readOnly: 'କେବଳ ପଠନୀୟ — ସିଷ୍ଟମ ପ୍ରଶାସକ ମଡେଲ କାର୍ଡ ଅପଡେଟ କରିପାରିବେ।',
    editingTitle: 'ମଡେଲ କାର୍ଡ ସମ୍ପାଦନ',
    newVersion: 'ନୂଆ ସିମାଣ୍ଟିକ ସଂସ୍କରଣ',
    newVersionHint: 'ବର୍ତ୍ତମାନ ସଂସ୍କରଣଠାରୁ ବଡ଼ ହେବା ଆବଶ୍ୟକ (ଯଥା 1.1.0)। ପରିବର୍ତ୍ତନ ତାଲିକା ଆବଶ୍ୟକ।',
    changelogLabel: 'ପରିବର୍ତ୍ତନ ତାଲିକା',
    changelogPlaceholder: 'ଏହି ସଂସ୍କରଣରେ କଣ ବଦଳିଲା?',
    saved: 'ମଡେଲ କାର୍ଡ ଅଦ୍ୟତନ ହେଲା।',
    updateFailed: 'ମଡେଲ କାର୍ଡ ଅଦ୍ୟତନ ହୋଇପାରିଲା ନାହିଁ।',
    statusLabel: 'ଜୀବନଚକ୍ର ସ୍ଥିତି',
    active: 'ସକ୍ରିୟ',
    deprecated: 'ଅପ୍ରଚଳିତ',
    retired: 'ଅବସରପ୍ରାପ୍ତ',
    cardCount: 'କାର୍ଡ',
    failureCount: 'ବିଫଳତା ମୋଡ',
    layer: 'ସ୍ତର',
    summary: 'ସାରାଂଶ',
    description: 'ବିବରଣୀ',
    name: 'ନାମ',
    print: 'ପ୍ରିଣ୍ଟ / PDF ଭାବରେ ସଞ୍ଚୟ କରନ୍ତୁ',
  },
}

/** Failure-mode catalogue copy (P2-13). */
export const FAILURE_MODE_SECTION_LABELS: Record<
  'en' | 'hi' | 'or',
  {
    title: string
    subtitle: string
    allLayers: string
    impact: string
    likelihood: string
    status: string
    mitigation: string
    trigger: string
    create: string
    edit: string
    delete: string
    deleteConfirm: string
    noFailures: string
    save: string
    cancel: string
    created: string
    updated: string
    deleted: string
    inherentTitle: string
    filterLayer: string
    impactHigh: string
    impactMedium: string
    impactLow: string
    likelihoodRare: string
    likelihoodUncommon: string
    likelihoodCommon: string
    statusOpen: string
    statusMitigated: string
    statusAccepted: string
    selectToEdit: string
  }
> = {
  en: {
    title: 'Failure modes',
    subtitle:
      'Known ways each layer can fail, with a synthetic trigger example and the mitigation in place. Documentation only — a failure mode is never a diagnosis.',
    allLayers: 'All layers',
    impact: 'Impact',
    likelihood: 'Likelihood',
    status: 'Status',
    mitigation: 'Mitigation',
    trigger: 'Trigger example',
    create: 'Add failure mode',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirm: 'Delete this failure mode? This cannot be undone.',
    noFailures: 'No failure modes recorded.',
    save: 'Save',
    cancel: 'Cancel',
    created: 'Failure mode created.',
    updated: 'Failure mode updated.',
    deleted: 'Failure mode deleted.',
    inherentTitle: 'Inherent to the layer',
    filterLayer: 'Filter by layer',
    impactHigh: 'High',
    impactMedium: 'Medium',
    impactLow: 'Low',
    likelihoodRare: 'Rare',
    likelihoodUncommon: 'Uncommon',
    likelihoodCommon: 'Common',
    statusOpen: 'Open',
    statusMitigated: 'Mitigated',
    statusAccepted: 'Accepted',
    selectToEdit: 'Only a system administrator can add or change failure modes.',
  },
  hi: {
    title: 'विफलता मोड',
    subtitle:
      'प्रत्येक परत कैसे विफल हो सकती है, एक सिंथेटिक उदाहरण और मौजूद उपचार के साथ। केवल दस्तावेज़ीकरण — विफलता मोड कभी निदान नहीं है।',
    allLayers: 'सभी परतें',
    impact: 'प्रभाव',
    likelihood: 'संभावना',
    status: 'स्थिति',
    mitigation: 'उपचार',
    trigger: 'ट्रिगर उदाहरण',
    create: 'विफलता मोड जोड़ें',
    edit: 'संपादित करें',
    delete: 'हटाएं',
    deleteConfirm: 'इस विफलता मोड को हटाएं? इसे वापस नहीं लाया जा सकता।',
    noFailures: 'कोई विफलता मोड दर्ज नहीं।',
    save: 'सहेजें',
    cancel: 'रद्द करें',
    created: 'विफलता मोड बनाया गया।',
    updated: 'विफलता मोड अद्यतन हुआ।',
    deleted: 'विफलता मोड हटाया गया।',
    inherentTitle: 'परत में अंतर्निहित',
    filterLayer: 'परत से फ़िल्टर करें',
    impactHigh: 'उच्च',
    impactMedium: 'मध्यम',
    impactLow: 'निम्न',
    likelihoodRare: 'दुर्लभ',
    likelihoodUncommon: 'असामान्य',
    likelihoodCommon: 'सामान्य',
    statusOpen: 'खुला',
    statusMitigated: 'उपचारित',
    statusAccepted: 'स्वीकृत',
    selectToEdit: 'केवल सिस्टम प्रशासक विफलता मोड जोड़ या बदल सकता है।',
  },
  or: {
    title: 'ବିଫଳତା ମୋଡ',
    subtitle:
      'ପ୍ରତ୍ୟେକ ସ୍ତର କିପରି ବିଫଳ ହୋଇପାରେ, ଏକ ସିନ୍ଥେଟିକ ଉଦାହରଣ ଏବଂ ଉପଲବ୍ଧ ପ୍ରତିକାର ସହିତ। କେବଳ ଦସ୍ତାବିଜ — ବିଫଳତା ମୋଡ କେବେ ନିଦାନ ନୁହେଁ।',
    allLayers: 'ସମସ୍ତ ସ୍ତର',
    impact: 'ପ୍ରଭାବ',
    likelihood: 'ସମ୍ଭାବନା',
    status: 'ସ୍ଥିତି',
    mitigation: 'ପ୍ରତିକାର',
    trigger: 'ଟ୍ରିଗର ଉଦାହରଣ',
    create: 'ବିଫଳତା ମୋଡ ଯୋଡନ୍ତୁ',
    edit: 'ସମ୍ପାଦନ',
    delete: 'ହଟାନ୍ତୁ',
    deleteConfirm: 'ଏହି ବିଫଳତା ମୋଡ ହଟାଇବେ? ଏହା ପୁନଃ ଫେରାଯାଇପାରିବ ନାହିଁ।',
    noFailures: 'କୌଣସି ବିଫଳତା ମୋଡ ଦର୍ଜ ନାହିଁ।',
    save: 'ସଞ୍ଚୟ',
    cancel: 'ବାତିଲ',
    created: 'ବିଫଳତା ମୋଡ ତିଆରି ହେଲା।',
    updated: 'ବିଫଳତା ମୋଡ ଅଦ୍ୟତନ ହେଲା।',
    deleted: 'ବିଫଳତା ମୋଡ ହଟାଗଲା।',
    inherentTitle: 'ସ୍ତରରେ ଅନ୍ତର୍ନିହିତ',
    filterLayer: 'ସ୍ତର ଅନୁଯାୟୀ ଫିଲ୍ଟର',
    impactHigh: 'ଉଚ୍ଚ',
    impactMedium: 'ମଧ୍ୟମ',
    impactLow: 'ନିମ୍ନ',
    likelihoodRare: 'ବିରଳ',
    likelihoodUncommon: 'ଅସାଧାରଣ',
    likelihoodCommon: 'ସାଧାରଣ',
    statusOpen: 'ଖୋଲା',
    statusMitigated: 'ପ୍ରତିକାରିତ',
    statusAccepted: 'ଗ୍ରହଣୀୟ',
    selectToEdit: 'କେବଳ ସିଷ୍ଟମ ପ୍ରଶାସକ ବିଫଳତା ମୋଡ ଯୋଡ଼ି କିମ୍ବା ବଦଳାଇ ପାରିବେ।',
  },
}

/** Fairness flag wording — a flag means "review", never "broken". */
export const FAIRNESS_FLAG_LABELS: Record<
  'en' | 'hi' | 'or',
  {
    green: string
    amber: string
    red: string
    greenTooltip: string
    amberTooltip: string
    redTooltip: string
    review: string
  }
> = {
  en: {
    green: 'Monitor',
    amber: 'Review',
    red: 'Review closely',
    greenTooltip: 'No material disparity detected on this dimension. Continue routine monitoring.',
    amberTooltip: 'Moderate disparity. Review this slice before relying on the layer for that group.',
    redTooltip: 'Large disparity. Review closely before relying on the layer for that group — this is not a claim that the layer is broken.',
    review: 'Review before relying on this layer for that group.',
  },
  hi: {
    green: 'निगरानी',
    amber: 'समीक्षा',
    red: 'ध्यान से समीक्षा',
    greenTooltip: 'इस आयाम पर कोई उल्लेखनीय असमानता नहीं मिली। नियमित निगरानी जारी रखें।',
    amberTooltip: 'मध्यम असमानता। उस समूह के लिए परत पर भरोसा करने से पहले इस स्लाइस की समीक्षा करें।',
    redTooltip: 'बड़ी असमानता। उस समूह के लिए परत पर भरोसा करने से पहले ध्यान से समीक्षा करें — यह नहीं कहा जा रहा कि परत टूटी है।',
    review: 'उस समूह के लिए इस परत पर भरोसा करने से पहले समीक्षा करें।',
  },
  or: {
    green: 'ନିରୀକ୍ଷଣ',
    amber: 'ସମୀକ୍ଷା',
    red: 'ଧ୍ୟାନରେ ସମୀକ୍ଷା',
    greenTooltip: 'ଏହି ଆୟାମରେ କୌଣସି ଉଲ୍ଲେଖନୀୟ ଅସମାନତା ମିଳିଲା ନାହିଁ। ନିୟମିତ ନିରୀକ୍ଷଣ ଜାରି ରଖନ୍ତୁ।',
    amberTooltip: 'ମଧ୍ୟମ ଅସମାନତା। ସେହି ଗୋଷ୍ଠୀ ପାଇଁ ସ୍ତର ଉପରେ ଭରସା କରିବା ପୂର୍ବରୁ ଏହି ସ୍ଲାଇସ ସମୀକ୍ଷା କରନ୍ତୁ।',
    redTooltip: 'ବଡ଼ ଅସମାନତା। ସେହି ଗୋଷ୍ଠୀ ପାଇଁ ସ୍ତର ଉପରେ ଭରସା କରିବା ପୂର୍ବରୁ ଧ୍ୟାନରେ ସମୀକ୍ଷା କରନ୍ତୁ — ଏହା ସ୍ତର ଭଙ୍ଗା ବୋଲି ଦାବି ନୁହେଁ।',
    review: 'ସେହି ଗୋଷ୍ଠୀ ପାଇଁ ଏହି ସ୍ତର ଉପରେ ଭରସା କରିବା ପୂର୍ବରୁ ସମୀକ୍ଷା କରନ୍ତୁ।',
  },
}

/** Bias-evaluation console copy (P2-13) — system administrators only. */
export const BIAS_SECTION_LABELS: Record<
  'en' | 'hi' | 'or',
  {
    title: string
    subtitle: string
    adminOnly: string
    runEvaluation: string
    running: string
    refresh: string
    runComplete: string
    runFailed: string
    loadFailed: string
    latestReport: string
    noReport: string
    noReportHint: string
    overallF1: string
    concerningSlices: string
    missingSlices: string
    none: string
    layerMetrics: string
    fairness: string
    manifest: string
    history: string
    leakTest: string
    runLeak: string
    leakResult: string
    passed: string
    failed: string
    noLeaks: string
    datasetVersion: string
    generatorVersion: string
    engineVersion: string
    generatedAt: string
    seed: string
    checksum: string
    files: string
    records: string
    sliceCounts: string
    reportId: string
    runAt: string
    createdBy: string
    delete: string
    deleteConfirm: string
    deleted: string
    allDimensions: string
    allMetrics: string
    allLayers: string
    dimension: string
    metric: string
    status: string
    spread: string
    interpretation: string
    slice: string
    sampleCount: string
    precision: string
    recall: string
    f1: string
    layer: string
    flag: string
    methodology: string
    fairnessNote: string
    historyTitle: string
    runsTitle: string
    noRuns: string
    statusQueued: string
    statusRunning: string
    statusCompleted: string
    statusPartial: string
    statusFailed: string
    filtered: string
    showAll: string
    of: string
  }
> = {
  en: {
    title: 'Bias evaluation',
    subtitle:
      'A deterministic, synthetic-data evaluation of the eight layers across population slices. A flag means “review before relying on this layer for that group” — never that the layer is broken.',
    adminOnly: 'System administrator',
    runEvaluation: 'Run evaluation',
    running: 'Running…',
    refresh: 'Refresh',
    runComplete: 'Evaluation complete.',
    runFailed: 'Could not run the evaluation.',
    loadFailed: 'Could not load the evaluation.',
    latestReport: 'Latest report',
    noReport: 'No report has been produced yet.',
    noReportHint: 'A system administrator can run the evaluation to generate the first report.',
    overallF1: 'Overall F1',
    concerningSlices: 'Slices flagged for review',
    missingSlices: 'Slices with no data',
    none: 'None',
    layerMetrics: 'Per-layer metrics',
    fairness: 'Fairness across dimensions',
    manifest: 'Dataset manifest',
    history: 'Report history',
    leakTest: 'Anonymiser leak test',
    runLeak: 'Run leak test',
    leakResult: 'Leak test',
    passed: 'passed',
    failed: 'failed',
    noLeaks: 'No leaks — every synthetic identifier was stripped.',
    datasetVersion: 'Dataset version',
    generatorVersion: 'Generator version',
    engineVersion: 'Engine version',
    generatedAt: 'Generated',
    seed: 'Seed',
    checksum: 'Checksum',
    files: 'Files',
    records: 'Records',
    sliceCounts: 'Slice counts',
    reportId: 'Report',
    runAt: 'Run at',
    createdBy: 'Run by',
    delete: 'Delete',
    deleteConfirm: 'Delete this report? The run ledger keeps the record of the attempt.',
    deleted: 'Report deleted.',
    allDimensions: 'All dimensions',
    allMetrics: 'All metrics',
    allLayers: 'All layers',
    dimension: 'Dimension',
    metric: 'Metric',
    status: 'Status',
    spread: 'Max − min',
    interpretation: 'Interpretation',
    slice: 'Slice',
    sampleCount: 'Samples',
    precision: 'Precision',
    recall: 'Recall',
    f1: 'F1',
    layer: 'Layer',
    flag: 'Review',
    methodology: 'Methodology',
    fairnessNote:
      'Disparity is the largest minus the smallest slice metric for each dimension (max − min). It is a screening threshold, not a statistical test.',
    historyTitle: 'Reports',
    runsTitle: 'Run ledger',
    noRuns: 'No runs recorded yet.',
    statusQueued: 'Queued',
    statusRunning: 'Running',
    statusCompleted: 'Completed',
    statusPartial: 'Partial',
    statusFailed: 'Failed',
    filtered: 'Showing',
    showAll: 'Show all',
    of: 'of',
  },
  hi: {
    title: 'पूर्वाग्रह मूल्यांकन',
    subtitle:
      'जनसंख्या स्लाइसों पर आठ परतों का नियतात्मक, सिंथेटिक-डेटा मूल्यांकन। झंडा का अर्थ है “उस समूह के लिए इस परत पर भरोसा करने से पहले समीक्षा करें” — यह कभी नहीं कि परत टूटी है।',
    adminOnly: 'सिस्टम प्रशासक',
    runEvaluation: 'मूल्यांकन चलाएँ',
    running: 'चल रहा है…',
    refresh: 'ताज़ा करें',
    runComplete: 'मूल्यांकन पूर्ण।',
    runFailed: 'मूल्यांकन नहीं चल सका।',
    loadFailed: 'मूल्यांकन लोड नहीं हो सका।',
    latestReport: 'नवीनतम रिपोर्ट',
    noReport: 'अभी तक कोई रिपोर्ट नहीं बनी।',
    noReportHint: 'सिस्टम प्रशासक पहली रिपोर्ट बनाने के लिए मूल्यांकन चला सकता है।',
    overallF1: 'कुल F1',
    concerningSlices: 'समीक्षा हेतु चिह्नित स्लाइस',
    missingSlices: 'डेटा-रहित स्लाइस',
    none: 'कोई नहीं',
    layerMetrics: 'प्रति-परत मेट्रिक्स',
    fairness: 'आयामों में निष्पक्षता',
    manifest: 'डेटासेट मैनिफ़ेस्ट',
    history: 'रिपोर्ट इतिहास',
    leakTest: 'अनामीकरण लीक परीक्षण',
    runLeak: 'लीक परीक्षण चलाएँ',
    leakResult: 'लीक परीक्षण',
    passed: 'पास',
    failed: 'विफल',
    noLeaks: 'कोई लीक नहीं — हर सिंथेटिक पहचानकर्ता हटा दिया गया।',
    datasetVersion: 'डेटासेट संस्करण',
    generatorVersion: 'जनरेटर संस्करण',
    engineVersion: 'इंजन संस्करण',
    generatedAt: 'निर्मित',
    seed: 'सीड',
    checksum: 'चेकसम',
    files: 'फाइलें',
    records: 'रिकॉर्ड',
    sliceCounts: 'स्लाइस गणना',
    reportId: 'रिपोर्ट',
    runAt: 'चलाया',
    createdBy: 'चलाने वाला',
    delete: 'हटाएं',
    deleteConfirm: 'इस रिपोर्ट को हटाएं? रन लेजर प्रयास का रिकॉर्ड रखता है।',
    deleted: 'रिपोर्ट हटाई गई।',
    allDimensions: 'सभी आयाम',
    allMetrics: 'सभी मेट्रिक्स',
    allLayers: 'सभी परतें',
    dimension: 'आयाम',
    metric: 'मेट्रिक',
    status: 'स्थिति',
    spread: 'अधिकतम − न्यूनतम',
    interpretation: 'व्याख्या',
    slice: 'स्लाइस',
    sampleCount: 'नमूने',
    precision: 'प्रिसिज़न',
    recall: 'रिकॉल',
    f1: 'F1',
    layer: 'परत',
    flag: 'समीक्षा',
    methodology: 'कार्यप्रणाली',
    fairnessNote:
      'असमानता = प्रत्येक आयाम के लिए सबसे बड़ा घटा सबसे छोटा स्लाइस मेट्रिक (अधिकतम − न्यूनतम)। यह एक स्क्रीनिंग सीमा है, सांख्यिकीय परीक्षण नहीं।',
    historyTitle: 'रिपोर्टें',
    runsTitle: 'रन लेजर',
    noRuns: 'अभी तक कोई रन दर्ज नहीं।',
    statusQueued: 'कतार में',
    statusRunning: 'चल रहा',
    statusCompleted: 'पूर्ण',
    statusPartial: 'आंशिक',
    statusFailed: 'विफल',
    filtered: 'दिखा रहे हैं',
    showAll: 'सभी दिखाएँ',
    of: 'में से',
  },
  or: {
    title: 'ପକ୍ଷପାତ ମୂଲ୍ୟାଙ୍କନ',
    subtitle:
      'ଜନସଂଖ୍ୟା ସ୍ଲାଇସ ଉପରେ ଆଠଟି ସ୍ତରର ନିର୍ଦ୍ଧାରିତ, ସିନ୍ଥେଟିକ-ଡାଟା ମୂଲ୍ୟାଙ୍କନ। ଫ୍ଲାଗର ଅର୍ଥ “ସେହି ଗୋଷ୍ଠୀ ପାଇଁ ଏହି ସ୍ତର ଉପରେ ଭରସା କରିବା ପୂର୍ବରୁ ସମୀକ୍ଷା କରନ୍ତୁ” — ସ୍ତର ଭଙ୍ଗା ବୋଲି କେବେ ନୁହେଁ।',
    adminOnly: 'ସିଷ୍ଟମ ପ୍ରଶାସକ',
    runEvaluation: 'ମୂଲ୍ୟାଙ୍କନ ଚଲାନ୍ତୁ',
    running: 'ଚାଲୁଛି…',
    refresh: 'ରିଫ୍ରେସ୍',
    runComplete: 'ମୂଲ୍ୟାଙ୍କନ ସମ୍ପୂର୍ଣ୍ଣ।',
    runFailed: 'ମୂଲ୍ୟାଙ୍କନ ଚଲାଯାଇପାରିଲା ନାହିଁ।',
    loadFailed: 'ମୂଲ୍ୟାଙ୍କନ ଲୋଡ ହୋଇପାରିଲା ନାହିଁ।',
    latestReport: 'ସର୍ବଶେଷ ରିପୋର୍ଟ',
    noReport: 'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ରିପୋର୍ଟ ତିଆରି ହୋଇନାହିଁ।',
    noReportHint: 'ପ୍ରଥମ ରିପୋର୍ଟ ତିଆରି କରିବାକୁ ସିଷ୍ଟମ ପ୍ରଶାସକ ମୂଲ୍ୟାଙ୍କନ ଚଲାଇପାରିବେ।',
    overallF1: 'ସାମଗ୍ରିକ F1',
    concerningSlices: 'ସମୀକ୍ଷା ପାଇଁ ଚିହ୍ନିତ ସ୍ଲାଇସ',
    missingSlices: 'ଡାଟା ନଥିବା ସ୍ଲାଇସ',
    none: 'କିଛି ନାହିଁ',
    layerMetrics: 'ପ୍ରତି-ସ୍ତର ମେଟ୍ରିକ୍ସ',
    fairness: 'ଆୟାମ ମଧ୍ୟରେ ନ୍ୟାୟ',
    manifest: 'ଡାଟାସେଟ ମାନିଫେଷ୍ଟ',
    history: 'ରିପୋର୍ଟ ଇତିହାସ',
    leakTest: 'ଅନାମିକରଣ ଲିକ ପରୀକ୍ଷା',
    runLeak: 'ଲିକ ପରୀକ୍ଷା ଚଲାନ୍ତୁ',
    leakResult: 'ଲିକ ପରୀକ୍ଷା',
    passed: 'ପାସ',
    failed: 'ବିଫଳ',
    noLeaks: 'କୌଣସି ଲିକ ନାହିଁ — ପ୍ରତ୍ୟେକ ସିନ୍ଥେଟିକ ପରିଚାୟକ ହଟାଯାଇଛି।',
    datasetVersion: 'ଡାଟାସେଟ ସଂସ୍କରଣ',
    generatorVersion: 'ଜେନେରେଟର ସଂସ୍କରଣ',
    engineVersion: 'ଇଞ୍ଜିନ ସଂସ୍କରଣ',
    generatedAt: 'ତିଆରି',
    seed: 'ସିଡ',
    checksum: 'ଚେକସମ',
    files: 'ଫାଇଲ',
    records: 'ରେକର୍ଡ',
    sliceCounts: 'ସ୍ଲାଇସ ଗଣନା',
    reportId: 'ରିପୋର୍ଟ',
    runAt: 'ଚଲାଯାଇଛି',
    createdBy: 'ଚଲାଇଥିବା',
    delete: 'ହଟାନ୍ତୁ',
    deleteConfirm: 'ଏହି ରିପୋର୍ଟ ହଟାଇବେ? ରନ ଲେଜର ପ୍ରୟାସର ରେକର୍ଡ ରଖେ।',
    deleted: 'ରିପୋର୍ଟ ହଟାଗଲା।',
    allDimensions: 'ସମସ୍ତ ଆୟାମ',
    allMetrics: 'ସମସ୍ତ ମେଟ୍ରିକ୍ସ',
    allLayers: 'ସମସ୍ତ ସ୍ତର',
    dimension: 'ଆୟାମ',
    metric: 'ମେଟ୍ରିକ',
    status: 'ସ୍ଥିତି',
    spread: 'ସର୍ବାଧିକ − ସର୍ବନିମ୍ନ',
    interpretation: 'ବ୍ୟାଖ୍ୟା',
    slice: 'ସ୍ଲାଇସ',
    sampleCount: 'ନମୁନା',
    precision: 'ପ୍ରିସିଜନ',
    recall: 'ରିକଲ',
    f1: 'F1',
    layer: 'ସ୍ତର',
    flag: 'ସମୀକ୍ଷା',
    methodology: 'କାର୍ଯ୍ୟପଦ୍ଧତି',
    fairnessNote:
      'ଅସମାନତା = ପ୍ରତ୍ୟେକ ଆୟାମ ପାଇଁ ସର୍ବାଧିକ ବିୟୋଗ ସର୍ବନିମ୍ନ ସ୍ଲାଇସ ମେଟ୍ରିକ (ସର୍ବାଧିକ − ସର୍ବନିମ୍ନ)। ଏହା ଏକ ସ୍କ୍ରିନିଂ ସୀମା, ପରିସଂଖ୍ୟାନ ପରୀକ୍ଷା ନୁହେଁ।',
    historyTitle: 'ରିପୋର୍ଟ',
    runsTitle: 'ରନ ଲେଜର',
    noRuns: 'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ରନ ଦର୍ଜ ନାହିଁ।',
    statusQueued: 'ଧାଡ଼ିରେ',
    statusRunning: 'ଚାଲୁଛି',
    statusCompleted: 'ସମ୍ପୂର୍ଣ୍ଣ',
    statusPartial: 'ଆଂଶିକ',
    statusFailed: 'ବିଫଳ',
    filtered: 'ଦେଖାଉଛି',
    showAll: 'ସମସ୍ତ ଦେଖାନ୍ତୁ',
    of: 'ମଧ୍ୟରୁ',
  },
}

/** Human labels for the five bias dimensions and three metrics. */
export const BIAS_DIMENSION_LABELS: Record<
  'language' | 'ageBand' | 'sexMarker' | 'facilityType' | 'inputModality',
  string
> = {
  language: 'Language',
  ageBand: 'Age band',
  sexMarker: 'Sex marker',
  facilityType: 'Facility type',
  inputModality: 'Input modality',
}

export const BIAS_METRIC_LABELS: Record<'precision' | 'recall' | 'f1', string> = {
  precision: 'Precision',
  recall: 'Recall',
  f1: 'F1',
}

/**
 * Confidence + explainability UI copy (P2-14) in the three supported languages.
 *
 * Confidence is a WORKFLOW label about how reliably a value was extracted — the
 * copy below must never imply a diagnosis, prognosis or treatment. The band /
 * verdict / item-type maps are display-only; the authoritative values and their
 * explanations are rendered verbatim from the backend (which is non-diagnostic
 * and PII-free by construction).
 */
export interface ConfidenceSectionLabels {
  title: string
  subtitle: string
  aggregateScore: string
  worstScore: string
  limitingFactor: string
  signals: string
  summary: string
  computedAt: string
  recompute: string
  recomputing: string
  refresh: string
  lowTitle: string
  lowSubtitle: string
  noLowItems: string
  reviewItem: string
  reviewTitle: string
  verdict: string
  reason: string
  reasonHint: string
  reasonRequired: string
  submit: string
  cancel: string
  recorded: string
  history: string
  noHistory: string
  policyTitle: string
  policySubtitle: string
  lowThreshold: string
  veryLowThreshold: string
  aggregateThreshold: string
  save: string
  saved: string
  policyInvalid: string
  offline: string
  loadFailed: string
  value: string
  itemType: string
  actor: string
  when: string
  nonDiagnostic: string
  up: string
  down: string
  neutral: string
  bands: Record<ConfidenceBand, string>
  verdicts: Record<LowConfidenceVerdict, string>
  itemTypes: Record<LowConfidenceItemType, string>
}

const CONFIDENCE_SECTION_LABELS_EN: ConfidenceSectionLabels = {
  title: 'Confidence & explainability',
  subtitle: 'How reliably each value was extracted — a workflow label, never a diagnosis.',
  aggregateScore: 'Case aggregate',
  worstScore: 'Weakest signal',
  limitingFactor: 'Limiting factor',
  signals: 'Contributors',
  summary: 'Summary',
  computedAt: 'Computed',
  recompute: 'Recompute',
  recomputing: 'Recomputing…',
  refresh: 'Refresh',
  lowTitle: 'Low-confidence items',
  lowSubtitle: 'Under the facility threshold — needs a human decision.',
  noLowItems: 'Nothing below the threshold for this case.',
  reviewItem: 'Review',
  reviewTitle: 'Review low-confidence item',
  verdict: 'Verdict',
  reason: 'Reason',
  reasonHint: 'Required when you mark it for attention or dismiss it.',
  reasonRequired: 'A reason is required for this verdict.',
  submit: 'Record decision',
  cancel: 'Cancel',
  recorded: 'Decision recorded.',
  history: 'Review history',
  noHistory: 'No decisions recorded yet.',
  policyTitle: 'Confidence policy',
  policySubtitle:
    'Per-facility thresholds that decide what counts as low confidence. A workflow setting, not a clinical one.',
  lowThreshold: 'Low-confidence threshold',
  veryLowThreshold: 'Very-low threshold',
  aggregateThreshold: 'Aggregate alert threshold',
  save: 'Save policy',
  saved: 'Confidence policy updated.',
  policyInvalid: 'Very-low must be below low, and every threshold must be between 5% and 99%.',
  offline: 'Offline — showing the last computed values. Recompute needs a connection.',
  loadFailed: 'Could not load confidence right now.',
  value: 'Score',
  itemType: 'Signal',
  actor: 'Reviewer',
  when: 'When',
  nonDiagnostic:
    'Confidence describes extraction reliability only. It is not a diagnosis, not a prognosis and not a treatment recommendation.',
  up: 'raised',
  down: 'lowered',
  neutral: 'unchanged',
  bands: { high: 'High', medium: 'Medium', low: 'Low', 'very-low': 'Very low' },
  verdicts: { accepted: 'Accepted', 'needs-attention': 'Needs attention', dismissed: 'Dismissed' },
  itemTypes: {
    urgency: 'Urgency flag',
    'missing-info': 'Missing information',
    lab: 'Lab result',
    vital: 'Vital sign',
    visual: 'Photo',
    timeline: 'Timeline',
    'follow-up': 'Follow-up question',
    'priority-component': 'Priority factor',
    anonymisation: 'Anonymisation',
    'report-type': 'Report type',
    language: 'Language',
    ocr: 'OCR',
    'triage-note': 'Triage note',
  },
}

const CONFIDENCE_SECTION_LABELS_HI: ConfidenceSectionLabels = {
  title: 'विश्वास और व्याख्या',
  subtitle: 'प्रत्येक मान कितने भरोसे से निकाला गया — यह कार्यप्रवाह लेबल है, निदान नहीं।',
  aggregateScore: 'केस कुल',
  worstScore: 'सबसे कमज़ोर संकेत',
  limitingFactor: 'सीमित करने वाला कारक',
  signals: 'योगदानकर्ता',
  summary: 'सारांश',
  computedAt: 'गणना',
  recompute: 'पुनर्गणना',
  recomputing: 'पुनर्गणना हो रही है…',
  refresh: 'ताज़ा करें',
  lowTitle: 'कम विश्वास वाली वस्तुएँ',
  lowSubtitle: 'सुविधा सीमा से नीचे — मानव निर्णय आवश्यक।',
  noLowItems: 'इस केस के लिए सीमा से नीचे कुछ नहीं है।',
  reviewItem: 'समीक्षा',
  reviewTitle: 'कम विश्वास वाली वस्तु की समीक्षा',
  verdict: 'निर्णय',
  reason: 'कारण',
  reasonHint: 'ध्यान दें या खारिज करें चुनने पर आवश्यक।',
  reasonRequired: 'इस निर्णय के लिए कारण आवश्यक है।',
  submit: 'निर्णय दर्ज करें',
  cancel: 'रद्द करें',
  recorded: 'निर्णय दर्ज हुआ।',
  history: 'समीक्षा इतिहास',
  noHistory: 'अभी कोई निर्णय दर्ज नहीं।',
  policyTitle: 'विश्वास नीति',
  policySubtitle:
    'प्रति-सुविधा सीमाएँ जो तय करती हैं कि कम विश्वास क्या है। यह कार्यप्रवाह सेटिंग है, नैदानिक नहीं।',
  lowThreshold: 'कम-विश्वास सीमा',
  veryLowThreshold: 'अति-कम सीमा',
  aggregateThreshold: 'कुल अलर्ट सीमा',
  save: 'नीति सहेजें',
  saved: 'विश्वास नीति अपडेट हुई।',
  policyInvalid: 'अति-कम, कम से नीचे होना चाहिए, और हर सीमा 5% से 99% के बीच।',
  offline: 'ऑफ़लाइन — अंतिम गणना दिखा रहे हैं। पुनर्गणना के लिए कनेक्शन चाहिए।',
  loadFailed: 'अभी विश्वास लोड नहीं हो सका।',
  value: 'स्कोर',
  itemType: 'संकेत',
  actor: 'समीक्षक',
  when: 'कब',
  nonDiagnostic:
    'विश्वास केवल निष्कर्षण विश्वसनीयता बताता है। यह निदान, पूर्वानुमान या उपचार सिफ़ारिश नहीं है।',
  up: 'बढ़ाया',
  down: 'घटाया',
  neutral: 'अपरिवर्तित',
  bands: { high: 'उच्च', medium: 'मध्यम', low: 'कम', 'very-low': 'अति कम' },
  verdicts: { accepted: 'स्वीकृत', 'needs-attention': 'ध्यान आवश्यक', dismissed: 'खारिज' },
  itemTypes: {
    urgency: 'तीव्रता संकेत',
    'missing-info': 'अनुपलब्ध सूचना',
    lab: 'प्रयोगशाला परिणाम',
    vital: 'जीवन-चिह्न',
    visual: 'फोटो',
    timeline: 'समयरेखा',
    'follow-up': 'अनुवर्ती प्रश्न',
    'priority-component': 'प्राथमिकता कारक',
    anonymisation: 'अनामीकरण',
    'report-type': 'रिपोर्ट प्रकार',
    language: 'भाषा',
    ocr: 'OCR',
    'triage-note': 'ट्राइएज नोट',
  },
}

const CONFIDENCE_SECTION_LABELS_OR: ConfidenceSectionLabels = {
  title: 'ବିଶ୍ୱାସ ଓ ବ୍ୟାଖ୍ୟା',
  subtitle: 'ପ୍ରତ୍ୟେକ ମୂଲ୍ୟ କେତେ ବିଶ୍ୱାସରେ ବାହାର କରାଯାଇଛି — ଏହା କାର୍ଯ୍ୟପ୍ରବାହ ଲେବଲ, ନିଦାନ ନୁହେଁ।',
  aggregateScore: 'କେସ ସମୁଦାୟ',
  worstScore: 'ସର୍ବନିମ୍ନ ସଙ୍କେତ',
  limitingFactor: 'ସୀମିତ କରୁଥିବା କାରକ',
  signals: 'ଯୋଗଦାନକାରୀ',
  summary: 'ସାରାଂଶ',
  computedAt: 'ଗଣନା',
  recompute: 'ପୁନଃ ଗଣନା',
  recomputing: 'ପୁନଃ ଗଣନା ଚାଲୁଛି…',
  refresh: 'ନବୀକରଣ',
  lowTitle: 'କମ ବିଶ୍ୱାସ ଥିବା ବସ୍ତୁ',
  lowSubtitle: 'ସୁବିଧା ସୀମାରୁ ତଳେ — ମାନବ ନିର୍ଣ୍ଣୟ ଆବଶ୍ୟକ।',
  noLowItems: 'ଏହି କେସ ପାଇଁ ସୀମାରୁ ତଳେ କିଛି ନାହିଁ।',
  reviewItem: 'ସମୀକ୍ଷା',
  reviewTitle: 'କମ ବିଶ୍ୱାସ ବସ୍ତୁ ସମୀକ୍ଷା',
  verdict: 'ନିର୍ଣ୍ଣୟ',
  reason: 'କାରଣ',
  reasonHint: 'ଧ୍ୟାନ ଦିଅନ୍ତୁ ବା ଖାରଜ କରନ୍ତୁ ଚୟନ କଲେ ଆବଶ୍ୟକ।',
  reasonRequired: 'ଏହି ନିର୍ଣ୍ଣୟ ପାଇଁ କାରଣ ଆବଶ୍ୟକ।',
  submit: 'ନିର୍ଣ୍ଣୟ ଦର୍ଜ କରନ୍ତୁ',
  cancel: 'ବାତିଲ',
  recorded: 'ନିର୍ଣ୍ଣୟ ଦର୍ଜ ହେଲା।',
  history: 'ସମୀକ୍ଷା ଇତିହାସ',
  noHistory: 'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ନିର୍ଣ୍ଣୟ ଦର୍ଜ ନାହିଁ।',
  policyTitle: 'ବିଶ୍ୱାସ ନୀତି',
  policySubtitle:
    'ପ୍ରତି-ସୁବିଧା ସୀମା ଯାହା ନିର୍ଣ୍ଣୟ କରେ କମ ବିଶ୍ୱାସ କଣ। ଏହା କାର୍ଯ୍ୟପ୍ରବାହ ସେଟିଂ, କ୍ଲିନିକାଲ ନୁହେଁ।',
  lowThreshold: 'କମ-ବିଶ୍ୱାସ ସୀମା',
  veryLowThreshold: 'ଅତି-କମ ସୀମା',
  aggregateThreshold: 'ସମୁଦାୟ ସତର୍କ ସୀମା',
  save: 'ନୀତି ସଞ୍ଚୟ',
  saved: 'ବିଶ୍ୱାସ ନୀତି ଅଦ୍ୟତନ ହେଲା।',
  policyInvalid: 'ଅତି-କମ, କମରୁ ତଳେ ରହିବ ଏବଂ ପ୍ରତ୍ୟେକ ସୀମା 5%–99% ମଧ୍ୟରେ।',
  offline: 'ଅଫଲାଇନ — ଶେଷ ଗଣନା ଦେଖାଉଛି। ପୁନଃ ଗଣନା ପାଇଁ ସଂଯୋଗ ଆବଶ୍ୟକ।',
  loadFailed: 'ବର୍ତ୍ତମାନ ବିଶ୍ୱାସ ଲୋଡ୍ ହୋଇପାରିଲା ନାହିଁ।',
  value: 'ସ୍କୋର',
  itemType: 'ସଙ୍କେତ',
  actor: 'ସମୀକ୍ଷକ',
  when: 'କେବେ',
  nonDiagnostic:
    'ବିଶ୍ୱାସ କେବଳ ନିଷ୍କର୍ଷଣ ନିର୍ଭରଯୋଗ୍ୟତା କୁହେ। ଏହା ନିଦାନ, ପୂର୍ବାନୁମାନ ବା ଚିକିତ୍ସା ସୁପାରିଶ ନୁହେଁ।',
  up: 'ବଢ଼ାଇଲା',
  down: 'ହ୍ରାସ କଲା',
  neutral: 'ଅପରିବର୍ତ୍ତିତ',
  bands: { high: 'ଉଚ୍ଚ', medium: 'ମଧ୍ୟମ', low: 'କମ', 'very-low': 'ଅତି କମ' },
  verdicts: { accepted: 'ଗ୍ରହଣୀୟ', 'needs-attention': 'ଧ୍ୟାନ ଆବଶ୍ୟକ', dismissed: 'ଖାରଜ' },
  itemTypes: {
    urgency: 'ଆବଶ୍ୟକତା ସଙ୍କେତ',
    'missing-info': 'ଅନୁପସ୍ଥିତ ସୂଚନା',
    lab: 'ଲାବ ଫଳାଫଳ',
    vital: 'ଜୀବନ-ଚିହ୍ନ',
    visual: 'ଫଟୋ',
    timeline: 'ସମୟକ୍ରମ',
    'follow-up': 'ଅନୁସରଣ ପ୍ରଶ୍ନ',
    'priority-component': 'ପ୍ରାଥମିକତା କାରକ',
    anonymisation: 'ଅନାମୀକରଣ',
    'report-type': 'ରିପୋର୍ଟ ପ୍ରକାର',
    language: 'ଭାଷା',
    ocr: 'OCR',
    'triage-note': 'ଟ୍ରାଇଏଜ ନୋଟ',
  },
}

export const CONFIDENCE_SECTION_LABELS: Record<LanguageCode, ConfidenceSectionLabels> = {
  en: CONFIDENCE_SECTION_LABELS_EN,
  hi: CONFIDENCE_SECTION_LABELS_HI,
  or: CONFIDENCE_SECTION_LABELS_OR,
}

/**
 * Patient-orienting copy for the clinician feedback loop (P2-15), in the three
 * supported languages. Feedback is about workflow quality only — never about a
 * patient's clinical condition — and is advisory: it never auto-applies to a
 * rule, threshold or score.
 */
export interface FeedbackSectionLabels {
  title: string
  subtitle: string
  addFeedback: string
  addFeedbackHint: string
  editTitle: string
  targetType: string
  target: string
  targetLabel: string
  targetLabelHint: string
  layer: string
  layerOptional: string
  verdict: string
  reasonCode: string
  severity: string
  reasonText: string
  reasonTextHint: string
  suggestedFix: string
  suggestedFixHint: string
  submit: string
  save: string
  cancel: string
  saving: string
  recorded: string
  updated: string
  deleted: string
  confirmDelete: string
  emptySession: string
  listTitle: string
  listSubtitle: string
  filtersTitle: string
  all: string
  apply: string
  reset: string
  since: string
  until: string
  dashboardTitle: string
  dashboardSubtitle: string
  totalFeedback: string
  active: string
  edited: string
  deletedCount: string
  lastFeedback: string
  byVerdict: string
  bySeverity: string
  byReasonCode: string
  byTargetType: string
  byLayer: string
  topProblematicRules: string
  notUsefulRate: string
  highSeverity: string
  noData: string
  exportTitle: string
  exportSubtitle: string
  export: string
  exporting: string
  exportDone: string
  exportDisclaimer: string
  offline: string
  loadFailed: string
  readOnly: string
  actor: string
  when: string
  status: string
  markedUseful: string
  nonDiagnostic: string
  verdicts: Record<FeedbackVerdict, string>
  reasonCodes: Record<FeedbackReasonCode, string>
  severities: Record<FeedbackSeverity, string>
  targetTypes: Record<FeedbackTargetType, string>
}

const FEEDBACK_SECTION_LABELS_EN: FeedbackSectionLabels = {
  title: 'Clinician feedback',
  subtitle: 'Tell us whether each AI output was useful. Workflow quality only — never a diagnosis.',
  addFeedback: 'Add feedback',
  addFeedbackHint: 'Was this output useful for the review? Your verdict is advisory only.',
  editTitle: 'Edit feedback',
  targetType: 'Output type',
  target: 'Target',
  targetLabel: 'Target label',
  targetLabelHint: 'A short, anonymised description of what you reviewed.',
  layer: 'Model layer',
  layerOptional: 'Optional — which model layer produced this output.',
  verdict: 'Verdict',
  reasonCode: 'Reason',
  severity: 'Severity',
  reasonText: 'Details',
  reasonTextHint: 'Optional note. Anonymised and de-diagnosed before it is stored.',
  suggestedFix: 'Suggested fix',
  suggestedFixHint: 'Optional suggestion for the maintainers. Non-diagnostic only.',
  submit: 'Submit feedback',
  save: 'Save changes',
  cancel: 'Cancel',
  saving: 'Saving…',
  recorded: 'Feedback recorded.',
  updated: 'Feedback updated.',
  deleted: 'Feedback withdrawn.',
  confirmDelete: 'Withdraw this feedback? This cannot be undone.',
  emptySession: 'No feedback recorded for this case yet.',
  listTitle: 'Recorded feedback',
  listSubtitle: 'Every verdict is audited and advisory — nothing changes automatically.',
  filtersTitle: 'Filters',
  all: 'All',
  apply: 'Apply',
  reset: 'Reset',
  since: 'From',
  until: 'To',
  dashboardTitle: 'Feedback dashboard',
  dashboardSubtitle: 'Facility-wide evidence of where the AI outputs help or get in the way.',
  totalFeedback: 'Total feedback',
  active: 'Active',
  edited: 'Edited',
  deletedCount: 'Withdrawn',
  lastFeedback: 'Last feedback',
  byVerdict: 'By verdict',
  bySeverity: 'By severity',
  byReasonCode: 'By reason',
  byTargetType: 'By output type',
  byLayer: 'By model layer',
  topProblematicRules: 'Rules needing attention',
  notUsefulRate: 'Not useful',
  highSeverity: 'High severity',
  noData: 'No feedback recorded yet.',
  exportTitle: 'Export feedback',
  exportSubtitle: 'Build a portable, non-diagnostic copy of the feedback held for this facility.',
  export: 'Export',
  exporting: 'Exporting…',
  exportDone: 'Feedback export ready.',
  exportDisclaimer:
    'This export contains workflow-quality feedback only. It is not a diagnosis, not a prescription and not a treatment plan.',
  offline: 'This view needs a live connection.',
  loadFailed: 'Something went wrong. Please try again.',
  readOnly: 'You can view feedback, but only its author or a facility admin may change it.',
  actor: 'Author',
  when: 'When',
  status: 'Status',
  markedUseful: 'Useful',
  nonDiagnostic: 'Feedback is workflow-quality evidence and never a clinical judgement.',
  verdicts: {
    useful: 'Useful',
    'not-useful': 'Not useful',
    'partially-useful': 'Partly useful',
    unclear: 'Unclear',
  },
  reasonCodes: {
    correct: 'Correct',
    'false-positive': 'False positive',
    'false-negative': 'False negative',
    irrelevant: 'Irrelevant',
    'missing-context': 'Missing context',
    'wrong-language': 'Wrong language',
    'over-redacted': 'Over-redacted',
    'under-redacted': 'Under-redacted',
    misprioritised: 'Mis-prioritised',
    other: 'Other',
  },
  severities: { low: 'Low', medium: 'Medium', high: 'High' },
  targetTypes: {
    'urgency-flag': 'Urgency flag',
    'missing-info': 'Missing information',
    'lab-value': 'Lab value',
    vital: 'Vital',
    visual: 'Photo',
    'timeline-event': 'Timeline event',
    'follow-up-question': 'Follow-up question',
    'priority-component': 'Priority component',
    'anonymisation-match': 'Anonymisation match',
    'report-type': 'Report type',
    'language-detection': 'Language detection',
    'ocr-result': 'OCR result',
    'triage-note': 'Triage note',
    rule: 'Rule',
  },
}

const FEEDBACK_SECTION_LABELS_HI: FeedbackSectionLabels = {
  title: 'चिकित्सक प्रतिक्रिया',
  subtitle: 'बताएँ कि हर AI आउटपुट उपयोगी था या नहीं। केवल कार्यप्रवाह गुणवत्ता — निदान नहीं।',
  addFeedback: 'प्रतिक्रिया जोड़ें',
  addFeedbackHint: 'क्या यह आउटपुट समीक्षा के लिए उपयोगी था? आपका निर्णय केवल सलाहकारी है।',
  editTitle: 'प्रतिक्रिया संपादित करें',
  targetType: 'आउटपुट प्रकार',
  target: 'लक्ष्य',
  targetLabel: 'लक्ष्य लेबल',
  targetLabelHint: 'जो आपने देखा उसका संक्षिप्त, अनाम विवरण।',
  layer: 'मॉडल परत',
  layerOptional: 'वैकल्पिक — किस मॉडल परत ने यह आउटपुट बनाया।',
  verdict: 'निर्णय',
  reasonCode: 'कारण',
  severity: 'गंभीरता',
  reasonText: 'विवरण',
  reasonTextHint: 'वैकल्पिक टिप्पणी। संग्रह से पहले अनाम व निदान-मुक्त की जाती है।',
  suggestedFix: 'सुझाया सुधार',
  suggestedFixHint: 'रखवालों के लिए वैकल्पिक सुझाव। केवल गैर-नैदानिक।',
  submit: 'प्रतिक्रिया भेजें',
  save: 'परिवर्तन सहेजें',
  cancel: 'रद्द करें',
  saving: 'सहेजा जा रहा है…',
  recorded: 'प्रतिक्रिया दर्ज हुई।',
  updated: 'प्रतिक्रिया अपडेट हुई।',
  deleted: 'प्रतिक्रिया वापस ली गई।',
  confirmDelete: 'यह प्रतिक्रिया वापस लें? इसे पूर्ववत नहीं किया जा सकता।',
  emptySession: 'इस केस के लिए अभी कोई प्रतिक्रिया दर्ज नहीं।',
  listTitle: 'दर्ज प्रतिक्रिया',
  listSubtitle: 'हर निर्णय ऑडिट होता है और सलाहकारी है — कुछ भी स्वतः नहीं बदलता।',
  filtersTitle: 'फ़िल्टर',
  all: 'सभी',
  apply: 'लागू करें',
  reset: 'रीसेट',
  since: 'से',
  until: 'तक',
  dashboardTitle: 'प्रतिक्रिया डैशबोर्ड',
  dashboardSubtitle: 'सुविधा-व्यापी प्रमाण कि AI आउटपुट कहाँ मदद करते हैं या बाधा डालते हैं।',
  totalFeedback: 'कुल प्रतिक्रिया',
  active: 'सक्रिय',
  edited: 'संपादित',
  deletedCount: 'वापस ली गई',
  lastFeedback: 'अंतिम प्रतिक्रिया',
  byVerdict: 'निर्णय अनुसार',
  bySeverity: 'गंभीरता अनुसार',
  byReasonCode: 'कारण अनुसार',
  byTargetType: 'आउटपुट प्रकार अनुसार',
  byLayer: 'मॉडल परत अनुसार',
  topProblematicRules: 'ध्यान देने योग्य नियम',
  notUsefulRate: 'उपयोगी नहीं',
  highSeverity: 'उच्च गंभीरता',
  noData: 'अभी कोई प्रतिक्रिया दर्ज नहीं।',
  exportTitle: 'प्रतिक्रिया निर्यात करें',
  exportSubtitle: 'इस सुविधा की प्रतिक्रिया की पोर्टेबल, गैर-नैदानिक प्रति बनाएँ।',
  export: 'निर्यात',
  exporting: 'निर्यात हो रहा है…',
  exportDone: 'प्रतिक्रिया निर्यात तैयार।',
  exportDisclaimer:
    'इस निर्यात में केवल कार्यप्रवाह-गुणवत्ता प्रतिक्रिया है। यह निदान, नुस्खा या उपचार योजना नहीं है।',
  offline: 'इस दृश्य के लिए लाइव कनेक्शन चाहिए।',
  loadFailed: 'कुछ गलत हो गया। कृपया पुन: प्रयास करें।',
  readOnly: 'आप प्रतिक्रिया देख सकते हैं, लेकिन केवल लेखक या सुविधा व्यवस्थापक इसे बदल सकते हैं।',
  actor: 'लेखक',
  when: 'कब',
  status: 'स्थिति',
  markedUseful: 'उपयोगी',
  nonDiagnostic: 'प्रतिक्रिया कार्यप्रवाह-गुणवत्ता प्रमाण है, कभी नैदानिक निर्णय नहीं।',
  verdicts: {
    useful: 'उपयोगी',
    'not-useful': 'उपयोगी नहीं',
    'partially-useful': 'आंशिक रूप से उपयोगी',
    unclear: 'अस्पष्ट',
  },
  reasonCodes: {
    correct: 'सही',
    'false-positive': 'गलत सकारात्मक',
    'false-negative': 'गलत नकारात्मक',
    irrelevant: 'अप्रासंगिक',
    'missing-context': 'संदर्भ अनुपलब्ध',
    'wrong-language': 'गलत भाषा',
    'over-redacted': 'अत्यधिक रेडैक्टेड',
    'under-redacted': 'अल्प रेडैक्टेड',
    misprioritised: 'गलत प्राथमिकता',
    other: 'अन्य',
  },
  severities: { low: 'कम', medium: 'मध्यम', high: 'उच्च' },
  targetTypes: {
    'urgency-flag': 'तीव्रता संकेत',
    'missing-info': 'अनुपलब्ध सूचना',
    'lab-value': 'प्रयोगशाला मान',
    vital: 'जीवन-चिह्न',
    visual: 'फोटो',
    'timeline-event': 'समयरेखा घटना',
    'follow-up-question': 'अनुवर्ती प्रश्न',
    'priority-component': 'प्राथमिकता घटक',
    'anonymisation-match': 'अनामीकरण मिलान',
    'report-type': 'रिपोर्ट प्रकार',
    'language-detection': 'भाषा पहचान',
    'ocr-result': 'OCR परिणाम',
    'triage-note': 'ट्राइएज नोट',
    rule: 'नियम',
  },
}

const FEEDBACK_SECTION_LABELS_OR: FeedbackSectionLabels = {
  title: 'ଚିକିତ୍ସକ ପ୍ରତିକ୍ରିୟା',
  subtitle: 'ପ୍ରତ୍ୟେକ AI ଆଉଟପୁଟ ଉପଯୋଗୀ ଥିଲା କି ନାହିଁ କୁହନ୍ତୁ। କେବଳ କାର୍ଯ୍ୟପ୍ରବାହ ଗୁଣବତ୍ତା — ନିଦାନ ନୁହେଁ।',
  addFeedback: 'ପ୍ରତିକ୍ରିୟା ଯୋଡ଼ନ୍ତୁ',
  addFeedbackHint: 'ଏହି ଆଉଟପୁଟ ସମୀକ୍ଷା ପାଇଁ ଉପଯୋଗୀ ଥିଲା କି? ଆପଣଙ୍କ ନିର୍ଣ୍ଣୟ କେବଳ ପରାମର୍ଶାତ୍ମକ।',
  editTitle: 'ପ୍ରତିକ୍ରିୟା ସମ୍ପାଦନ',
  targetType: 'ଆଉଟପୁଟ ପ୍ରକାର',
  target: 'ଲକ୍ଷ୍ୟ',
  targetLabel: 'ଲକ୍ଷ୍ୟ ଲେବଲ',
  targetLabelHint: 'ଆପଣ ଯାହା ସମୀକ୍ଷା କଲେ ତାହାର ସଂକ୍ଷିପ୍ତ, ଅନାମ ବର୍ଣ୍ଣନା।',
  layer: 'ମଡେଲ ସ୍ତର',
  layerOptional: 'ଇଚ୍ଛାଧୀନ — କେଉଁ ମଡେଲ ସ୍ତର ଏହି ଆଉଟପୁଟ ତିଆରି କଲା।',
  verdict: 'ନିର୍ଣ୍ଣୟ',
  reasonCode: 'କାରଣ',
  severity: 'ଗମ୍ଭୀରତା',
  reasonText: 'ବିବରଣୀ',
  reasonTextHint: 'ଇଚ୍ଛାଧୀନ ଟିପ୍ପଣୀ। ସଞ୍ଚୟ ପୂର୍ବରୁ ଅନାମ ଓ ନିଦାନ-ମୁକ୍ତ କରାଯାଏ।',
  suggestedFix: 'ପ୍ରସ୍ତାବିତ ସମାଧାନ',
  suggestedFixHint: 'ରକ୍ଷଣକାରୀଙ୍କ ପାଇଁ ଇଚ୍ଛାଧୀନ ପ୍ରସ୍ତାବ। କେବଳ ଅଣ-ନିଦାନ।',
  submit: 'ପ୍ରତିକ୍ରିୟା ଦାଖଲ',
  save: 'ପରିବର୍ତ୍ତନ ସଞ୍ଚୟ',
  cancel: 'ବାତିଲ',
  saving: 'ସଞ୍ଚୟ ହେଉଛି…',
  recorded: 'ପ୍ରତିକ୍ରିୟା ଦର୍ଜ ହେଲା।',
  updated: 'ପ୍ରତିକ୍ରିୟା ଅଦ୍ୟତନ ହେଲା।',
  deleted: 'ପ୍ରତିକ୍ରିୟା ପ୍ରତ୍ୟାହାର ହେଲା।',
  confirmDelete: 'ଏହି ପ୍ରତିକ୍ରିୟା ପ୍ରତ୍ୟାହାର କରିବେ? ଏହା ପୂର୍ବାବସ୍ଥାକୁ ଫେରାଯାଏ ନାହିଁ।',
  emptySession: 'ଏହି କେସ ପାଇଁ ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ପ୍ରତିକ୍ରିୟା ଦର୍ଜ ନାହିଁ।',
  listTitle: 'ଦର୍ଜିତ ପ୍ରତିକ୍ରିୟା',
  listSubtitle: 'ପ୍ରତ୍ୟେକ ନିର୍ଣ୍ଣୟ ଅଡିଟ ହୁଏ ଏବଂ ପରାମର୍ଶଦାୟକ — କିଛି ସ୍ୱୟଂ ବଦଳେ ନାହିଁ।',
  filtersTitle: 'ଫିଲ୍ଟର',
  all: 'ସମସ୍ତ',
  apply: 'ଲାଗୁ କରନ୍ତୁ',
  reset: 'ରିସେଟ',
  since: 'ରୁ',
  until: 'ପର୍ଯ୍ୟନ୍ତ',
  dashboardTitle: 'ପ୍ରତିକ୍ରିୟା ଡ୍ୟାସବୋର୍ଡ',
  dashboardSubtitle: 'AI ଆଉଟପୁଟ କେଉଁଠି ସହାୟକ ବା ବାଧକ ସେହି ସୁବିଧା-ବ୍ୟାପୀ ପ୍ରମାଣ।',
  totalFeedback: 'ମୋଟ ପ୍ରତିକ୍ରିୟା',
  active: 'ସକ୍ରିୟ',
  edited: 'ସମ୍ପାଦିତ',
  deletedCount: 'ପ୍ରତ୍ୟାହୃତ',
  lastFeedback: 'ଶେଷ ପ୍ରତିକ୍ରିୟା',
  byVerdict: 'ନିର୍ଣ୍ଣୟ ଅନୁସାରେ',
  bySeverity: 'ଗମ୍ଭୀରତା ଅନୁସାରେ',
  byReasonCode: 'କାରଣ ଅନୁସାରେ',
  byTargetType: 'ଆଉଟପୁଟ ପ୍ରକାର ଅନୁସାରେ',
  byLayer: 'ମଡେଲ ସ୍ତର ଅନୁସାରେ',
  topProblematicRules: 'ଧ୍ୟାନ ଆବଶ୍ୟକ ନିୟମ',
  notUsefulRate: 'ଉପଯୋଗୀ ନୁହେଁ',
  highSeverity: 'ଉଚ୍ଚ ଗମ୍ଭୀରତା',
  noData: 'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ପ୍ରତିକ୍ରିୟା ଦର୍ଜ ନାହିଁ।',
  exportTitle: 'ପ୍ରତିକ୍ରିୟା ରପ୍ତାନି',
  exportSubtitle: 'ଏହି ସୁବିଧାର ପ୍ରତିକ୍ରିୟାର ବହନଯୋଗ୍ୟ, ଅଣ-ନିଦାନ ନକଲ ତିଆରି କରନ୍ତୁ।',
  export: 'ରପ୍ତାନି',
  exporting: 'ରପ୍ତାନି ହେଉଛି…',
  exportDone: 'ପ୍ରତିକ୍ରିୟା ରପ୍ତାନି ପ୍ରସ୍ତୁତ।',
  exportDisclaimer:
    'ଏହି ରପ୍ତାନିରେ କେବଳ କାର୍ଯ୍ୟପ୍ରବାହ-ଗୁଣବତ୍ତା ପ୍ରତିକ୍ରିୟା ଅଛି। ଏହା ନିଦାନ, ଔଷଧ ବା ଚିକିତ୍ସା ଯୋଜନା ନୁହେଁ।',
  offline: 'ଏହି ଦୃଶ୍ୟ ପାଇଁ ଲାଇଭ ସଂଯୋଗ ଆବଶ୍ୟକ।',
  loadFailed: 'କିଛି ଭୁଲ ହେଲା। ଦୟାକରି ପୁନଃ ଚେଷ୍ଟା କରନ୍ତୁ।',
  readOnly: 'ଆପଣ ପ୍ରତିକ୍ରିୟା ଦେଖିପାରିବେ, ମାତ୍ର କେବଳ ଲେଖକ ବା ସୁବିଧା ପ୍ରଶାସକ ଏହା ବଦଳାଇପାରିବେ।',
  actor: 'ଲେଖକ',
  when: 'କେବେ',
  status: 'ସ୍ଥିତି',
  markedUseful: 'ଉପଯୋଗୀ',
  nonDiagnostic: 'ପ୍ରତିକ୍ରିୟା କାର୍ଯ୍ୟପ୍ରବାହ-ଗୁଣବତ୍ତା ପ୍ରମାଣ, କେବେ ନିଦାନିକ ନିର୍ଣ୍ଣୟ ନୁହେଁ।',
  verdicts: {
    useful: 'ଉପଯୋଗୀ',
    'not-useful': 'ଉପଯୋଗୀ ନୁହେଁ',
    'partially-useful': 'ଆଂଶିକ ଉପଯୋଗୀ',
    unclear: 'ଅସ୍ପଷ୍ଟ',
  },
  reasonCodes: {
    correct: 'ସଠିକ',
    'false-positive': 'ଭୁଲ ସକାରାତ୍ମକ',
    'false-negative': 'ଭୁଲ ନକାରାତ୍ମକ',
    irrelevant: 'ଅପ୍ରାସଙ୍ଗିକ',
    'missing-context': 'ପ୍ରସଙ୍ଗ ଅନୁପସ୍ଥିତ',
    'wrong-language': 'ଭୁଲ ଭାଷା',
    'over-redacted': 'ଅଧିକ ରେଡାକ୍ଟେଡ',
    'under-redacted': 'ଅଳ୍ପ ରେଡାକ୍ଟେଡ',
    misprioritised: 'ଭୁଲ ପ୍ରାଥମିକତା',
    other: 'ଅନ୍ୟ',
  },
  severities: { low: 'କମ', medium: 'ମଧ୍ୟମ', high: 'ଉଚ୍ଚ' },
  targetTypes: {
    'urgency-flag': 'ଜରୁରୀ ସଙ୍କେତ',
    'missing-info': 'ଅନୁପସ୍ଥିତ ସୂଚନା',
    'lab-value': 'ପରୀକ୍ଷାଗାର ମୂଲ୍ୟ',
    vital: 'ଜୀବନ-ଚିହ୍ନ',
    visual: 'ଫଟୋ',
    'timeline-event': 'ସମୟରେଖା ଘଟଣା',
    'follow-up-question': 'ଅନୁସରଣ ପ୍ରଶ୍ନ',
    'priority-component': 'ପ୍ରାଥମିକତା ଉପାଦାନ',
    'anonymisation-match': 'ଅନାମୀକରଣ ମେଳ',
    'report-type': 'ରିପୋର୍ଟ ପ୍ରକାର',
    'language-detection': 'ଭାଷା ଚିହ୍ନଟ',
    'ocr-result': 'OCR ଫଳାଫଳ',
    'triage-note': 'ଟ୍ରାଇଏଜ ନୋଟ',
    rule: 'ନିୟମ',
  },
}

export const FEEDBACK_SECTION_LABELS: Record<LanguageCode, FeedbackSectionLabels> = {
  en: FEEDBACK_SECTION_LABELS_EN,
  hi: FEEDBACK_SECTION_LABELS_HI,
  or: FEEDBACK_SECTION_LABELS_OR,
}

/**
 * Audit immutability + export copy (P2-16), in the three supported languages.
 * The audit trail is about workflow accountability only — never a patient's
 * clinical condition — and entries are anonymised before storage.
 */
export interface AuditSectionLabels {
  title: string
  subtitle: string
  refresh: string
  refreshing: string
  verifyChain: string
  verifying: string
  chainValid: string
  chainInvalid: string
  chainVerifiedAt: string
  entriesChecked: string
  firstInvalid: string
  metaTitle: string
  lastSequence: string
  lastHash: string
  entryCount: string
  updatedAt: string
  filterTitle: string
  all: string
  apply: string
  reset: string
  search: string
  searchPlaceholder: string
  since: string
  until: string
  category: string
  action: string
  role: string
  actor: string
  sessionId: string
  sort: string
  newestFirst: string
  oldestFirst: string
  tableTitle: string
  sequence: string
  when: string
  actorRole: string
  detail: string
  hash: string
  pruned: string
  prunedBadge: string
  prunedHint: string
  verifyEntry: string
  entryValid: string
  entryInvalid: string
  exportTitle: string
  exportSubtitle: string
  export: string
  exporting: string
  exportDone: string
  exportDisclaimer: string
  format: string
  language: string
  download: string
  recordCount: string
  offline: string
  loadFailed: string
  readOnly: string
  noEntries: string
  pageLabel: string
  next: string
  previous: string
  total: string
  disclaimer: string
}

const AUDIT_SECTION_LABELS_EN: AuditSectionLabels = {
  title: 'Audit chain',
  subtitle:
    'Every action is chained with a tamper-evident SHA-256 hash so edits to the past are detectable. Entries are anonymised before storage and never contain a diagnosis.',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  verifyChain: 'Verify chain',
  verifying: 'Verifying…',
  chainValid: 'Chain verified — no tampering detected.',
  chainInvalid: 'Chain INVALID — an entry may have been altered.',
  chainVerifiedAt: 'Verified',
  entriesChecked: 'Entries checked',
  firstInvalid: 'First invalid',
  metaTitle: 'Chain head',
  lastSequence: 'Last sequence',
  lastHash: 'Head hash',
  entryCount: 'Entries',
  updatedAt: 'Updated',
  filterTitle: 'Filters',
  all: 'All',
  apply: 'Apply',
  reset: 'Reset',
  search: 'Search',
  searchPlaceholder: 'Search action / detail…',
  since: 'From',
  until: 'To',
  category: 'Category',
  action: 'Action',
  role: 'Role',
  actor: 'Actor',
  sessionId: 'Session',
  sort: 'Sort',
  newestFirst: 'Newest first',
  oldestFirst: 'Oldest first',
  tableTitle: 'Chained entries',
  sequence: '#',
  when: 'When',
  actorRole: 'Actor',
  detail: 'Detail',
  hash: 'Hash',
  pruned: 'Pruned',
  prunedBadge: 'Pruned',
  prunedHint: 'Content removed by the retention sweep; the chain link is preserved.',
  verifyEntry: 'Verify entry',
  entryValid: 'Entry verified.',
  entryInvalid: 'Entry INVALID.',
  exportTitle: 'Export audit trail',
  exportSubtitle: 'Download an anonymised, retention-aware copy of the filtered trail.',
  export: 'Export',
  exporting: 'Building…',
  exportDone: 'Export ready to download.',
  exportDisclaimer:
    'Export contains workflow events only — no diagnosis, no raw identifiers. It expires with the export-files retention bucket.',
  format: 'Format',
  language: 'Language',
  download: 'Download',
  recordCount: 'records',
  offline: 'The chain cannot be verified or exported offline. Reconnect to continue.',
  loadFailed: 'Could not load the audit trail.',
  readOnly: 'Read only',
  noEntries: 'No audit entries match the filters.',
  pageLabel: 'Page',
  next: 'Next',
  previous: 'Previous',
  total: 'Total',
  disclaimer:
    'The audit trail records who did what, when — it is not a clinical record. No diagnosis or prescription is ever stored.',
}

const AUDIT_SECTION_LABELS_HI: AuditSectionLabels = {
  title: 'ऑडिट श्रृंखला',
  subtitle:
    'हर क्रिया को छेड़छाड़-संवेदनशील SHA-256 हैश से जोड़ा जाता है, जिससे अतीत में किए बदलाव पकड़े जा सकें। प्रविष्टियाँ संग्रह से पहले अनाम की जाती हैं और उनमें निदान कभी नहीं होता।',
  refresh: 'रिफ़्रेश',
  refreshing: 'रिफ़्रेश हो रहा है…',
  verifyChain: 'श्रृंखला जाँचें',
  verifying: 'जाँच हो रही है…',
  chainValid: 'श्रृंखला सत्यापित — कोई छेड़छाड़ नहीं मिली।',
  chainInvalid: 'श्रृंखला अमान्य — किसी प्रविष्टि में बदलाव हो सकता है।',
  chainVerifiedAt: 'सत्यापित',
  entriesChecked: 'जाँची गई प्रविष्टियाँ',
  firstInvalid: 'पहली अमान्य',
  metaTitle: 'श्रृंखला शीर्ष',
  lastSequence: 'अंतिम क्रम',
  lastHash: 'शीर्ष हैश',
  entryCount: 'प्रविष्टियाँ',
  updatedAt: 'अद्यतन',
  filterTitle: 'फ़िल्टर',
  all: 'सभी',
  apply: 'लागू करें',
  reset: 'रीसेट',
  search: 'खोजें',
  searchPlaceholder: 'क्रिया / विवरण खोजें…',
  since: 'से',
  until: 'तक',
  category: 'श्रेणी',
  action: 'क्रिया',
  role: 'भूमिका',
  actor: 'कर्ता',
  sessionId: 'सत्र',
  sort: 'क्रम',
  newestFirst: 'नवीनतम पहले',
  oldestFirst: 'पुराना पहले',
  tableTitle: 'श्रृंखलाबद्ध प्रविष्टियाँ',
  sequence: '#',
  when: 'कब',
  actorRole: 'कर्ता',
  detail: 'विवरण',
  hash: 'हैश',
  pruned: 'हटाया गया',
  prunedBadge: 'हटाया गया',
  prunedHint: 'सामग्री अवधारण नियम द्वारा हटाई गई; श्रृंखला लिंक सुरक्षित है।',
  verifyEntry: 'प्रविष्टि जाँचें',
  entryValid: 'प्रविष्टि सत्यापित।',
  entryInvalid: 'प्रविष्टि अमान्य।',
  exportTitle: 'ऑडिट ट्रेल निर्यात करें',
  exportSubtitle: 'फ़िल्टर किए गए ट्रेल की अनाम, अवधारण-जागरूक प्रतिलिपि डाउनलोड करें।',
  export: 'निर्यात',
  exporting: 'बन रहा है…',
  exportDone: 'निर्यात डाउनलोड के लिए तैयार।',
  exportDisclaimer:
    'निर्यात में केवल कार्यप्रवाह घटनाएँ हैं — कोई निदान नहीं, कोई कच्चा पहचानकर्ता नहीं। यह export-files अवधारण बकेट के साथ समाप्त हो जाता है।',
  format: 'प्रारूप',
  language: 'भाषा',
  download: 'डाउनलोड',
  recordCount: 'रिकॉर्ड',
  offline: 'श्रृंखला को ऑफ़लाइन सत्यापित या निर्यात नहीं किया जा सकता। जारी रखने के लिए पुनः कनेक्ट करें।',
  loadFailed: 'ऑडिट ट्रेल लोड नहीं हो सका।',
  readOnly: 'केवल पढ़ें',
  noEntries: 'फ़िल्टर से कोई ऑडिट प्रविष्टि मेल नहीं खाती।',
  pageLabel: 'पृष्ठ',
  next: 'आगे',
  previous: 'पीछे',
  total: 'कुल',
  disclaimer:
    'ऑडिट ट्रेल दर्ज करता है कि किसने क्या और कब किया — यह नैदानिक रिकॉर्ड नहीं है। कोई निदान या पर्चा कभी संग्रह नहीं होता।',
}

const AUDIT_SECTION_LABELS_OR: AuditSectionLabels = {
  title: 'ଅଡିଟ୍ ଶୃଙ୍ଖଳା',
  subtitle:
    'ପ୍ରତ୍ୟେକ କାର୍ଯ୍ୟ ଏକ ଛେଦନ-ସମ୍ବେଦନଶୀଳ SHA-256 ହ୍ୟାସ୍ ସହ ଯୋଡ଼ାଯାଏ, ଯାହା ଦ୍ୱାରା ଅତୀତର ପରିବର୍ତ୍ତନ ଧରାପଡ଼େ। ପ୍ରବେଶଗୁଡ଼ିକ ସଂରକ୍ଷଣ ପୂର୍ବରୁ ଅନାମିକ ହୁଏ ଏବଂ ସେଥିରେ ନିର୍ଣ୍ଣୟ କେବେ ନଥାଏ।',
  refresh: 'ରିଫ୍ରେସ୍',
  refreshing: 'ରିଫ୍ରେସ୍ ହେଉଛି…',
  verifyChain: 'ଶୃଙ୍ଖଳା ଯାଞ୍ଚ କରନ୍ତୁ',
  verifying: 'ଯାଞ୍ଚ ହେଉଛି…',
  chainValid: 'ଶୃଙ୍ଖଳା ସତ୍ୟାପିତ — କୌଣସି ଛେଦନ ମିଳିନାହିଁ।',
  chainInvalid: 'ଶୃଙ୍ଖଳା ଅବୈଧ — କୌଣସି ପ୍ରବେଶ ପରିବର୍ତ୍ତିତ ହୋଇପାରେ।',
  chainVerifiedAt: 'ସତ୍ୟାପିତ',
  entriesChecked: 'ଯାଞ୍ଚିତ ପ୍ରବେଶ',
  firstInvalid: 'ପ୍ରଥମ ଅବୈଧ',
  metaTitle: 'ଶୃଙ୍ଖଳା ଶୀର୍ଷ',
  lastSequence: 'ଶେଷ କ୍ରମ',
  lastHash: 'ଶୀର୍ଷ ହ୍ୟାସ୍',
  entryCount: 'ପ୍ରବେଶ',
  updatedAt: 'ଅଦ୍ୟତନ',
  filterTitle: 'ଫିଲ୍ଟର',
  all: 'ସମସ୍ତ',
  apply: 'ଲାଗୁ କରନ୍ତୁ',
  reset: 'ରିସେଟ୍',
  search: 'ଖୋଜନ୍ତୁ',
  searchPlaceholder: 'କାର୍ଯ୍ୟ / ବିବରଣୀ ଖୋଜନ୍ତୁ…',
  since: 'ଠାରୁ',
  until: 'ପର୍ଯ୍ୟନ୍ତ',
  category: 'ଶ୍ରେଣୀ',
  action: 'କାର୍ଯ୍ୟ',
  role: 'ଭୂମିକା',
  actor: 'କର୍ତ୍ତା',
  sessionId: 'ଅଧିବେଶନ',
  sort: 'କ୍ରମ',
  newestFirst: 'ନୂତନ ପ୍ରଥମେ',
  oldestFirst: 'ପୁରୁଣା ପ୍ରଥମେ',
  tableTitle: 'ଶୃଙ୍ଖଳିତ ପ୍ରବେଶ',
  sequence: '#',
  when: 'କେବେ',
  actorRole: 'କର୍ତ୍ତା',
  detail: 'ବିବରଣୀ',
  hash: 'ହ୍ୟାସ୍',
  pruned: 'କାଟି ଦିଆଯାଇଛି',
  prunedBadge: 'କାଟି ଦିଆଯାଇଛି',
  prunedHint: 'ଅବଧାରଣ ନିୟମ ଦ୍ୱାରା ବିଷୟବସ୍ତୁ ହଟାଯାଇଛି; ଶୃଙ୍ଖଳା ଲିଙ୍କ ସଂରକ୍ଷିତ।',
  verifyEntry: 'ପ୍ରବେଶ ଯାଞ୍ଚ କରନ୍ତୁ',
  entryValid: 'ପ୍ରବେଶ ସତ୍ୟାପିତ।',
  entryInvalid: 'ପ୍ରବେଶ ଅବୈଧ।',
  exportTitle: 'ଅଡିଟ୍ ଟ୍ରେଲ୍ ରପ୍ତାନି',
  exportSubtitle: 'ଫିଲ୍ଟର ହୋଇଥିବା ଟ୍ରେଲ୍ର ଅନାମିକ, ଅବଧାରଣ-ସଚେତନ ପ୍ରତିଲିପି ଡାଉନଲୋଡ୍ କରନ୍ତୁ।',
  export: 'ରପ୍ତାନି',
  exporting: 'ତିଆରି ହେଉଛି…',
  exportDone: 'ରପ୍ତାନି ଡାଉନଲୋଡ୍ ପାଇଁ ପ୍ରସ୍ତୁତ।',
  exportDisclaimer:
    'ରପ୍ତାନିରେ କେବଳ କାର୍ଯ୍ୟପ୍ରବାହ ଘଟଣା ଅଛି — ନିର୍ଣ୍ଣୟ ନାହିଁ, କଞ୍ଚା ପରିଚାୟକ ନାହିଁ। ଏହା export-files ଅବଧାରଣ ବାଲଟି ସହ ଅବସାନ ହୁଏ।',
  format: 'ଫର୍ମାଟ୍',
  language: 'ଭାଷା',
  download: 'ଡାଉନଲୋଡ୍',
  recordCount: 'ରେକର୍ଡ',
  offline: 'ଶୃଙ୍ଖଳା ଅଫଲାଇନ୍ ଯାଞ୍ଚ କିମ୍ବା ରପ୍ତାନି ହୋଇପାରିବ ନାହିଁ। ଜାରି ରଖିବାକୁ ପୁନଃ ସଂଯୋଗ କରନ୍ତୁ।',
  loadFailed: 'ଅଡିଟ୍ ଟ୍ରେଲ୍ ଲୋଡ୍ ହୋଇପାରିଲା ନାହିଁ।',
  readOnly: 'କେବଳ ପଠନୀୟ',
  noEntries: 'ଫିଲ୍ଟର ସହ କୌଣସି ଅଡିଟ୍ ପ୍ରବେଶ ମେଳ ଖାଉନାହିଁ।',
  pageLabel: 'ପୃଷ୍ଠା',
  next: 'ପରବର୍ତ୍ତୀ',
  previous: 'ପୂର୍ବବର୍ତ୍ତୀ',
  total: 'ମୋଟ',
  disclaimer:
    'ଅଡିଟ୍ ଟ୍ରେଲ୍ ରେକର୍ଡ କରେ କିଏ କଣ ଏବଂ କେବେ କଲା — ଏହା ଏକ ନୈଦାନିକ ରେକର୍ଡ ନୁହେଁ। କୌଣସି ନିର୍ଣ୍ଣୟ କିମ୍ବା ପ୍ରେସ୍କ୍ରିପ୍ସନ୍ କେବେ ସଂରକ୍ଷିତ ହୁଏ ନାହିଁ।',
}

export const AUDIT_SECTION_LABELS: Record<LanguageCode, AuditSectionLabels> = {
  en: AUDIT_SECTION_LABELS_EN,
  hi: AUDIT_SECTION_LABELS_HI,
  or: AUDIT_SECTION_LABELS_OR,
}


/* ------------------------------------------------------------------ */
/*  Consent & data-privacy console copy (P2-17)                        */
/* ------------------------------------------------------------------ */

export type ConsentReasonLabels = Record<ConsentWithdrawalReasonCode, string>

export const CONSENT_REASON_LABELS: Record<LanguageCode, ConsentReasonLabels> = {
  en: {
    'no-longer-needed': 'No longer needed',
    'privacy-concern': 'Privacy concern',
    'moved-facility': 'Moved to another facility',
    'data-error': 'The data was wrong',
    other: 'Other reason',
  },
  hi: {
    'no-longer-needed': '?? ?????? ????',
    'privacy-concern': '????? ?? ?????',
    'moved-facility': '????? ?????? ??? ???????????',
    'data-error': '???? ??? ??',
    other: '???? ????',
  },
  or: {
    'no-longer-needed': '?? ?????? ?????',
    'privacy-concern': '???????? ??????',
    'moved-facility': '???? ???????? ????????????',
    'data-error': '???? ??? ????',
    other: '???? ????',
  },
}

export interface ConsentSectionLabels {
  title: string
  subtitle: string
  statusHeading: string
  active: string
  withdrawn: string
  none: string
  grantedAt: string
  grantedBy: string
  policyVersion: string
  purposesHeading: string
  withdrawnAt: string
  withdrawnBy: string
  reason: string
  historyHeading: string
  historyEmpty: string
  withdraw: string
  reGrant: string
  upgrade: string
  upgradeHint: string
  receipt: string
  receiptHint: string
  canWithdraw: string
  patientOnly: string
  impactHeading: string
  impactIntro: string
  impactWipe: string
  impactRetain: string
  reasonHeading: string
  reasonPlaceholder: string
  cancel: string
  confirmWithdraw: string
  withdrawing: string
  coverageHeading: string
  coverageHint: string
  coverageTotal: string
  inventoryHeading: string
  inventoryHint: string
  category: string
  records: string
  eligible: string
  whyRetained: string
  expiresAt: string
  timelineHeading: string
  timelineEmpty: string
  disclaimer: string
}

export type ConsentEventLabels = Record<ConsentEventKind, string>

export const CONSENT_EVENT_LABELS: Record<LanguageCode, ConsentEventLabels> = {
  en: { granted: 'Consent granted', revoked: 'Consent withdrawn', 're-granted': 'Consent re-granted', 'version-upgraded': 'Consent version upgraded' },
  hi: { granted: '????? ?? ??', revoked: '????? ???? ?? ??', 're-granted': '????? ???? ?? ??', 'version-upgraded': '????? ??????? ???????' },
  or: { granted: '?????? ??????', revoked: '?????? ??????????', 're-granted': '?????? ???? ??????', 'version-upgraded': '?????? ??????? ???????' },
}

const CONSENT_SECTION_LABELS_EN: ConsentSectionLabels = {
  title: 'Consent',
  subtitle:
    'Consent is the patient-controlled permission to process this case. Withdrawal is always the patient�s own choice, is audited, and erases the case immediately while a non-patient proof is kept.',
  statusHeading: 'Consent status',
  active: 'Active',
  withdrawn: 'Withdrawn',
  none: 'No consent record',
  grantedAt: 'Granted',
  grantedBy: 'Granted by',
  policyVersion: 'Policy version',
  purposesHeading: 'Agreed purposes',
  withdrawnAt: 'Withdrawn',
  withdrawnBy: 'Withdrawn by',
  reason: 'Reason',
  historyHeading: 'Consent history',
  historyEmpty: 'No consent events recorded yet.',
  withdraw: 'Withdraw consent',
  reGrant: 'Re-grant consent',
  upgrade: 'Upgrade to current version',
  upgradeHint: 'The consent on this case was given against an older policy version.',
  receipt: 'Download receipt',
  receiptHint: 'Generate a short-lived proof-of-consent receipt (JSON or PDF).',
  canWithdraw: 'You may withdraw your own consent for this case.',
  patientOnly: 'Only the patient may withdraw, re-grant or upgrade consent.',
  impactHeading: 'What withdrawal will do',
  impactIntro: 'Review exactly what is erased and what is kept before you confirm.',
  impactWipe: 'Erased immediately',
  impactRetain: 'Kept as proof',
  reasonHeading: 'Why are you withdrawing consent?',
  reasonPlaceholder: 'Optional � a short reason (identifiers are removed automatically).',
  cancel: 'Cancel',
  confirmWithdraw: 'Withdraw & erase',
  withdrawing: 'Withdrawing�',
  coverageHeading: 'Facility consent coverage',
  coverageHint: 'Every case in this facility and whether consent is active, withdrawn or missing.',
  coverageTotal: 'Cases',
  inventoryHeading: 'What is held about this case',
  inventoryHint: 'Every category of data attached to this case, how much there is and why it is retained.',
  category: 'Category',
  records: 'Records',
  eligible: 'Due',
  whyRetained: 'Why retained',
  expiresAt: 'Becomes due',
  timelineHeading: 'Retention timeline',
  timelineEmpty: 'No retention or consent events yet.',
  disclaimer:
    'Consent and retention are administrative records, not clinical artifacts. Nothing here diagnoses, prescribes or advises treatment.',
}

const CONSENT_SECTION_LABELS_HI: ConsentSectionLabels = {
  title: '?????',
  subtitle:
    '????? ?? ??? ?? ??????? ???? ?? ????-????????? ?????? ??? ????? ???? ???? ?? ????? ?? ?????? ??, ???? ?? ???? ??, ?? ??? ?? ????? ???? ???? ?? ???? ?? ???-???? ?????? ??? ???? ???',
  statusHeading: '????? ??????',
  active: '??????',
  withdrawn: '???? ?? ??',
  none: '??? ????? ??????? ????',
  grantedAt: '?? ??',
  grantedBy: '???? ????',
  policyVersion: '???? ???????',
  purposesHeading: '???? ????????',
  withdrawnAt: '???? ?? ??',
  withdrawnBy: '???? ???? ????',
  reason: '????',
  historyHeading: '????? ??????',
  historyEmpty: '??? ??? ????? ???? ???? ?????',
  withdraw: '????? ???? ???',
  reGrant: '????? ???? ???',
  upgrade: '??????? ??????? ??? ??????? ????',
  upgradeHint: '?? ??? ?? ????? ?????? ???? ??????? ?? ?? ?? ???',
  receipt: '???? ??????? ????',
  receiptHint: '?? ????????? ?????-?????? ???? ????? (JSON ?? PDF)?',
  canWithdraw: '?? ?? ??? ?? ??? ???? ????? ???? ?? ???? ????',
  patientOnly: '???? ???? ?? ????? ???? ??, ???? ?? ?? ??????? ?? ???? ???',
  impactHeading: '????? ???? ?????',
  impactIntro: '?????? ?? ???? ????? ?? ???? ?????? ????? ?? ???? ??? ??????',
  impactWipe: '????? ?????? ???',
  impactRetain: '?????? ?? ??? ??? ??? ???',
  reasonHeading: '?? ????? ????? ???? ?? ??? ????',
  reasonPlaceholder: '???????? � ?? ????????? ???? (?????????? ????? ??? ??? ???? ???)?',
  cancel: '???? ????',
  confirmWithdraw: '???? ??? ?? ??????',
  withdrawing: '???? ???? ?? ??? ??�',
  coverageHeading: '?????? ????? ?????',
  coverageHint: '?? ?????? ?? ?? ??? ?? ???? ????? ??????, ???? ?? ?? ?? ????????? ???',
  coverageTotal: '???',
  inventoryHeading: '?? ??? ?? ???? ??? ???? ??? ??',
  inventoryHint: '?? ??? ?? ????? ???? ?? ?? ??????, ????? ?? ?? ????? ??? ?? ???',
  category: '??????',
  records: '???????',
  eligible: '???',
  whyRetained: '????? ??? ???',
  expiresAt: '??? ????',
  timelineHeading: '????????? ???????',
  timelineEmpty: '??? ??? ????????? ?? ????? ???? ?????',
  disclaimer:
    '????? ?? ????????? ????????? ??????? ???, ??????? ?????????? ????? ???? ??? ?? ?????, ?????? ?? ????? ?? ???? ???? ?????',
}

const CONSENT_SECTION_LABELS_OR: ConsentSectionLabels = {
  title: '??????',
  subtitle:
    '?????? ????? ??? ??? ???????????? ???? ????-?????????? ??????? ?????????? ?????? ????? ??? ?????????, ?????? ??????, ??? ????? ?????? ????? ???????? ?? ??-???? ?????? ???????',
  statusHeading: '?????? ??????',
  active: '??????',
  withdrawn: '??????????',
  none: '????? ?????? ?????? ?????',
  grantedAt: '??????',
  grantedBy: '???????',
  policyVersion: '???? ???????',
  purposesHeading: '????? ????????',
  withdrawnAt: '??????????',
  withdrawnBy: '?????????? ???????',
  reason: '????',
  historyHeading: '?????? ??????',
  historyEmpty: '?????????? ????? ?????? ???? ?????? ??????',
  withdraw: '?????? ?????????? ??????',
  reGrant: '?????? ???? ???????',
  upgrade: '????????? ????????? ??????? ??????',
  upgradeHint: '??? ???? ?????? ?????? ???? ??????? ??????? ???????????',
  receipt: '???? ??????? ??????',
  receiptHint: '?? ??????????? ??????-?????? ???? ????? ?????? (JSON ?????? PDF)?',
  canWithdraw: '??? ??? ??? ???? ??? ?????? ?????????? ??????????',
  patientOnly: '???? ???? ??? ?????? ??????????, ???? ??? ?????? ??????? ??????????',
  impactHeading: '?????????? ?? ????',
  impactIntro: '??????? ????? ??????? ?? ??????? ??? ?? ?????? ????????',
  impactWipe: '?????? ???????',
  impactRetain: '?????? ????? ??????',
  reasonHeading: '??? ?????? ??????? ?????????? ?????????',
  reasonPlaceholder: '???????? � ?? ????????? ???? (??????? ???????? ????? ??????)?',
  cancel: '?????',
  confirmWithdraw: '?????????? ??? ????????',
  withdrawing: '?????????? ?????�',
  coverageHeading: '?????? ?????? ?????',
  coverageHint: '??? ??????? ???????? ??? ??? ?????? ??????, ?????????? ?????? ??????????',
  coverageTotal: '???',
  inventoryHeading: '??? ??? ?????? ?? ????????',
  inventoryHint: '??? ??? ?? ??????? ???????? ???? ??????, ???? ??? ??????? ?????????',
  category: '??????',
  records: '??????',
  eligible: '???',
  whyRetained: '??????? ????????',
  expiresAt: '??? ???',
  timelineHeading: '???? ???????',
  timelineEmpty: '?????????? ????? ???? ?????? ?????? ???? ??????',
  disclaimer:
    '?????? ??? ???? ????????? ??????, ??????? ??????? ?????? ????? ???? ?????, ??? ?????? ???????? ??????? ??? ??????',
}

export const CONSENT_SECTION_LABELS: Record<LanguageCode, ConsentSectionLabels> = {
  en: CONSENT_SECTION_LABELS_EN,
  hi: CONSENT_SECTION_LABELS_HI,
  or: CONSENT_SECTION_LABELS_OR,
}

export type TimelineKindLabels = Record<RetentionTimelineKind, string>

export const RETENTION_TIMELINE_LABELS: Record<LanguageCode, Record<RetentionTimelineKind, string>> = {
  en: {
    'consent.granted': 'Consent granted',
    'consent.revoked': 'Consent withdrawn',
    'consent.re-granted': 'Consent re-granted',
    'consent.version-upgraded': 'Consent version upgraded',
    'retention.extended': 'Retention extended',
    'session.deleted': 'Case deleted',
    'session.exported': 'Case exported',
    'retention.job_run': 'Retention sweep ran',
  },
  hi: {
    'consent.granted': '????? ?? ??',
    'consent.revoked': '????? ???? ?? ??',
    'consent.re-granted': '????? ???? ?? ??',
    'consent.version-upgraded': '????? ??????? ???????',
    'retention.extended': '????????? ?????? ???',
    'session.deleted': '??? ????? ???',
    'session.exported': '??? ??????? ???? ???',
    'retention.job_run': '????????? ????? ???',
  },
  or: {
    'consent.granted': '?????? ??????',
    'consent.revoked': '?????? ??????????',
    'consent.re-granted': '?????? ???? ??????',
    'consent.version-upgraded': '?????? ??????? ???????',
    'retention.extended': '???? ???????',
    'session.deleted': '??? ???????',
    'session.exported': '??? ???????',
    'retention.job_run': '???? ????? ??????',
  },
}
