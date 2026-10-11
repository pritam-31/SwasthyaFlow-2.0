import type { LanguageRuleSet } from '../../types'
import { NON_DIAGNOSTIC_DISCLAIMER } from '../nonDiagnostic'

/**
 * English rule set (P0-3).
 *
 * Same signals as the classic English triage rules, moved into the registry so
 * every language runs through one pipeline. Pattern lists are intentionally
 * conservative: a single hit fires a workflow flag, never a diagnosis.
 */
export const englishRuleSet: LanguageRuleSet = {
  language: 'en',
  urgencyRules: [
    { id: 'URG-01', label: 'Chest pain reported', severity: 'red', patterns: [/\b(?:chest pain|chest discomfort|chest tightness)\b/i], reason: 'Reported chest discomfort needs immediate clinician assessment.' },
    { id: 'URG-02', label: 'Breathing difficulty reported', severity: 'red', patterns: [/\b(?:breathless|breathing difficulty|shortness of breath|dyspnea|dyspnoea)\b/i], reason: 'Reported breathing difficulty needs immediate clinician assessment.' },
    { id: 'URG-03', label: 'Reduced consciousness / fits', severity: 'red', patterns: [/\b(?:unconscious|fainted|fainting|seizure|seizures|fits|convulsion)\b/i], reason: 'Altered consciousness or seizures need emergency escalation.' },
    { id: 'URG-04', label: 'Heavy bleeding reported', severity: 'red', patterns: [/\b(?:bleeding heavily|uncontrolled bleeding|haemorrhag|hemorrhag|excessive bleeding)\b/i], reason: 'Uncontrolled bleeding needs emergency escalation.' },
    { id: 'URG-05', label: 'High fever with stiffness', severity: 'amber', patterns: [/\b(?:high fever|fever)\b.{0,40}\b(?:stiff neck|rash)\b|\b(?:stiff neck|rash)\b.{0,40}\b(?:high fever|fever)\b/i], reason: 'Fever combined with stiffness or rash warrants prompt review.' },
    { id: 'URG-06', label: 'Persistent vomiting / dehydration', severity: 'amber', patterns: [/\b(?:vomit|vomiting|dehydration|dehydrated|not able to keep (?:food|water) down)\b/i], reason: 'Risk of dehydration needs prompt assessment.' },
    { id: 'URG-07', label: 'Reported high BP / sugar reading', severity: 'amber', patterns: [/\b(?:bp|blood pressure|sugar|glucose)\b[^.]{0,40}\b\d{2,3}\b/i], reason: 'A reported out-of-range reading needs clinician verification.' },
    { id: 'URG-08', label: 'Symptoms in a young infant', severity: 'amber', patterns: [/\b(?:newborn|infant)\b/i, /\b\d{1,2}\s+(?:months?|weeks?)\s+old\b/i], reason: 'Young infants can deteriorate quickly — prompt review advised.' },
  ],
  missingInfoChecks: [
    { id: 'CHK-01', label: 'Vital signs (BP, pulse, temperature, SpO2)', whyItMatters: 'Vitals anchor triage priority and escalation decisions.', patterns: [/\b(?:bp|pulse|temperature|spo2|vital)\s*[:\-]?\s*\d/i] },
    { id: 'CHK-02', label: 'Symptom duration / timeline', whyItMatters: 'Onset and duration change the urgency of the review.', patterns: [/\b(?:day|days|hour|hours|week|weeks|since|for)\b/i] },
    { id: 'CHK-03', label: 'Current medications and allergies', whyItMatters: 'Needed before any clinician decision; this system never advises medication.', patterns: [/\b(?:medicat|allerg|tablet|dose|dosage)\b/i] },
    { id: 'CHK-04', label: 'Relevant past history', whyItMatters: 'Existing conditions shape how urgently the patient should be seen.', patterns: [/\b(?:history|diabet|hyperten|asthma|surgery|previous)\b/i] },
  ],
  followUpQuestions: [
    { id: 'EN-FU-01', category: 'timeline', text: 'When did the symptoms start, and have they got worse, better or stayed the same?', target: 'patient', priority: 1 },
    { id: 'EN-FU-02', category: 'hydration', text: 'Is the patient able to drink water and keep it down?', target: 'patient', priority: 2 },
    { id: 'EN-FU-03', category: 'medication', text: 'Has the patient taken any medicine for this problem already? Which one and when?', target: 'patient', priority: 2 },
    { id: 'EN-FU-04', category: 'responsiveness', text: 'Is the patient able to walk, talk and respond normally right now?', target: 'patient', priority: 1 },
  ],
  bannedPhrases: [
    { pattern: /(?:the patient (?:has|is suffering from|is stricken with)|patient (?:has|is suffering from)|diagnosed with|suffers from|diagnosis(?: is)?)\s+\w/i, replacement: '[condition described by patient]' },
    { pattern: /(?:prescribed|prescription|medication recommended|should take|take\s+\w+\s+(?:tablet|pill|dose)|give\s+(?:him|her|the patient)\s+\w+)\b/i, replacement: '[medication mention removed — no drug advice is given]' },
    { pattern: /(?:it is|this is|this could be|probably is|looks like)\s+\w+(?:itis|osis|algia|emia|cancer|tumor)\b/i, replacement: '[provisional term removed]' },
  ],
  sectionLabels: {
    chiefComplaint: 'Chief complaint',
    history: 'History',
    vitals: 'Vital signs',
    timeline: 'Timeline',
    missingInfo: 'Missing information',
    followUps: 'Follow-up questions',
  },
  disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
}