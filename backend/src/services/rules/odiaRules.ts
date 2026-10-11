import type { LanguageRuleSet } from '../../types'

/**
 * Odia rule set (P0-3).
 *
 * Odia-script patterns cover script Odia; romanised patterns cover Odlish
 * (Latin-majority Odia). The triage pipeline runs these rules over both the
 * original text and its Latin transliteration.
 */
const OR_DISCLAIMER =
  'ଏହା ଏକ ସହାୟକ ପ୍ରଣାଳୀ, ନିଦାନ ନୁହେଁ। ଅନ୍ତିମ ନିଷ୍ପତ୍ତି ଯୋଗ୍ୟ ସ୍ୱାସ୍ଥ୍ୟକର୍ମୀଙ୍କର। ' +
  '(This is an assistive system, not a diagnosis. Final decision belongs to the qualified healthcare worker.)'

export const odiaRuleSet: LanguageRuleSet = {
  language: 'or',
  urgencyRules: [
    {
      id: 'URG-OR-01',
      label: 'ଛାତି ଯନ୍ତ୍ରଣା (chest pain)',
      severity: 'red',
      patterns: [
        /(?:ଛାତି ଯନ୍ତ୍ରଣା|ଛାତିରେ ଦରଜ|ଛାତି ଜଳିବା)/,
        /\b(?:chhati yantrana|chhatire daraj|chhati jaliba)\b/i,
      ],
      reason: 'ଛାତି ଯନ୍ତ୍ରଣା ପାଇଁ ତୁରନ୍ତ ଚିକିତ୍ସକ ଯାଞ୍ଚ ଆବଶ୍ୟକ।',
    },
    {
      id: 'URG-OR-02',
      label: 'ନିଶ୍ୱାସ ନେବାରେ ଅସୁବିଧା',
      severity: 'red',
      patterns: [
        /(?:ନିଶ୍ୱାସ ନେବାରେ ଅସୁବିଧା|ନିଶ୍ୱାସ ଫୁଲିବା|ଦମ୍ ଘୁଟିବା)/,
        /\b(?:niswas nebare asubidha|niswas fuliba|dam ghutiba)\b/i,
      ],
      reason: 'ନିଶ୍ୱାସ ଅସୁବିଧା ପାଇଁ ତୁରନ୍ତ ଚିକିତ୍ସକ ଯାଞ୍ଚ ଆବଶ୍ୟକ।',
    },
    {
      id: 'URG-OR-03',
      label: 'ଅଚେତା / ମୂର୍ଚ୍ଛା / ଝଟକା',
      severity: 'red',
      patterns: [
        /(?:ଅଚେତ|ମୂର୍ଚ୍ଛା|ଝଟକା|ଚକ୍କର)/,
        /\b(?:achet|murchha|jhatka|chakkar)\b/i,
      ],
      reason: 'ଅଚେତା କିମ୍ବା ଝଟକା ପାଇଁ ଜରୁରୀକାଳୀନ ସହାୟତା ଆବଶ୍ୟକ।',
    },
    {
      id: 'URG-OR-04',
      label: 'ରକ୍ତସ୍ରାବ / ଅଧିକ ରକ୍ତ',
      severity: 'red',
      patterns: [
        /(?:ରକ୍ତସ୍ରାବ|ରକ୍ତ ବହିବା|ଅଧିକ ରକ୍ତ)/,
        /\b(?:raktrasraba|rakta bahiba|adhika rakta)\b/i,
      ],
      reason: 'ଅନିୟନ୍ତ୍ରିତ ରକ୍ତସ୍ରାବ ପାଇଁ ଜରୁରୀକାଳୀନ ସହାୟତା ଆବଶ୍ୟକ।',
    },
    {
      id: 'URG-OR-05',
      label: 'ଅଧିକ ଜ୍ୱର ସହ କଠିନତା',
      severity: 'amber',
      patterns: [
        /(?:ଅଧିକ ଜ୍ୱର|ଜ୍ୱର ଓ ଗର୍ଦ୍ଦନ କଠିନତା|ଜ୍ୱର ସହ ଚକ୍ତି)/,
        /\b(?:adhika jwara|juara o gurdankathinta|high fever)\b/i,
      ],
      reason: 'କଠିନତା କିମ୍ବା ଚକ୍ତି ସହ ଜ୍ୱର ଶୀଘ୍ର ପୁନଃଯାଞ୍ଚ ଆବଶ୍ୟକ।',
    },
    {
      id: 'URG-OR-06',
      label: 'ବାରମ୍ବାର ବାନ୍ତି / ଜଳ ଅଭାବ',
      severity: 'amber',
      patterns: [
        /(?:ବାନ୍ତି|ବାରମ୍ବାର ବାନ୍ତି|ଜଳ ଅଭାବ|ପାଣି ଅଭାବ)/,
        /\b(?:banti|barambara banti|jala abhawa|pani abhawa)\b/i,
      ],
      reason: 'ଜଳ ଅଭାବ (ନିର୍ଜଳୀକରଣ) ର ବିପଦ ଶୀଘ୍ର ଯାଞ୍ଚ ମାଗିଥାଏ।',
    },
    {
      id: 'URG-OR-07',
      label: 'ବି.ପି. / ସୁଗାର ଅଧିକ',
      severity: 'amber',
      patterns: [
        /(?:ବିପି ଅଧିକ|ସୁଗାର ଅଧିକ|ରକ୍ତଚାପ|ମଧୁମେହ)/,
        /\b(?:bp adhika|sugar adhika|raktachapa|madhumeha)\b/i,
      ],
      reason: 'ରିପୋର୍ଟ ହୋଇଥିବା ଅସାଧାରଣ ରିଡିଂ ଚିକିତ୍ସକ ଯାଞ୍ଚ ମାଗିଥାଏ।',
    },
    {
      id: 'URG-OR-08',
      label: 'ନବଜାତ ଶିଶୁରେ ଲକ୍ଷଣ',
      severity: 'amber',
      patterns: [
        /(?:ନବଜାତ|ଶିଶୁ|ଛୁଆ)/,
        /\b(?:nabajata|sisu|chhua)\b/i,
      ],
      reason: 'ନବଜାତ ଶିଶୁଙ୍କ ଅବସ୍ଥା ଶୀଘ୍ର ବିଗିଡ଼ିପାରେ — ଶୀଘ୍ର ଯାଞ୍ଚ ସୁପାରିଶ।',
    },
  ],
  missingInfoChecks: [
    { id: 'CHK-OR-01', label: 'ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ସଙ୍କେତ (ବିପି, ନାଡ଼ି, ତାପମାତ୍ରା, ଅମ୍ଳଜାନ, ଓଜନ)', whyItMatters: 'ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ସଙ୍କେତ ଟ୍ରାଏଜ ପ୍ରାଥମିକତା ନିର୍ଣ୍ଣୟର ଆଧାର।', patterns: [/(?:ବିପି|ନାଡ଼ି|ତାପମାତ୍ରା|ଅମ୍ଳଜାନ|ଓଜନ)/, /\b(?:bp|nada|tapmatra|amalajana|ojana)\b[:\-]?\s*\d/i, /\b(?:bp|temperature|spo2|pulse)\s*[:\-]?\s*\d/i] },
    { id: 'CHK-OR-02', label: 'ଲକ୍ଷଣ ଆରମ୍ଭ / ଅବଧି', whyItMatters: 'ଆରମ୍ଭ ଓ ଅବଧି ଯାଞ୍ଚର ତୁରନ୍ତତା ବଦଳାଇଥାଏ।', patterns: [/(?:କେବେ ଠାରୁ|କେତେ ଦିନ|କାଲି|ଆଜି|ପୂର୍ବରୁ)/, /\b(?:kebetharu|kete dina|kali|aji|purbaru|since|days)\b/i] },
    { id: 'CHK-OR-03', label: 'ଔଷଧ ଏବଂ ଆଲର୍ଜି', whyItMatters: 'କୌଣସି ଚିକିତ୍ସକ ନିଷ୍ପତ୍ତି ପୂର୍ବରୁ ଆବଶ୍ୟକ; ଏହି ପ୍ରଣାଳୀ ଔଷଧ ସୁପାରିଶ କରେ ନାହିଁ।', patterns: [/(?:ଔଷଧ|ଦବା|ଆଲର୍ଜି)/, /\b(?:ausadha|daba|allergy|medicine|tablet)\b/i] },
    { id: 'CHK-OR-04', label: 'ପୂର୍ବ ରୋଗ ଇତିହାସ', whyItMatters: 'ମଜୁଦା ରୋଗ ନିର୍ଣ୍ଣୟ କରେ ରୋଗୀକୁ କେତେ ଶୀଘ୍ର ଦେଖାଯିବ।', patterns: [/(?:ପୂର୍ବରୁ|ଇତିହାସ|ପୁରୁଣା ରୋଗ|ଅସ୍ତ୍ରୋପଚାର)/, /\b(?:purbaru|itihasa|puruna roga|astraopacara|surgery|history)\b/i] },
  ],
  followUpQuestions: [
    { id: 'OR-FU-01', category: 'timeline', text: 'ଲକ୍ଷଣ କେବେ ଆରମ୍ଭ ହେଲା? କେତେ ସମୟ ହେଲାଣି?', target: 'patient', priority: 1 },
    { id: 'OR-FU-02', category: 'severity', text: 'ଯନ୍ତ୍ରଣା କେତେ ପ୍ରବଳ? ସାଧାରଣ କାମ କରିବାରେ ଅସୁବିଧା ହେଉଛି କି?', target: 'patient', priority: 1 },
    { id: 'OR-FU-03', category: 'medication', text: 'କୌଣସି ଔଷଧ ନେଉଛନ୍ତି? କେଉଁ ଥରୁବେଳା?', target: 'patient', priority: 2 },
    { id: 'OR-FU-04', category: 'allergies', text: 'କୌଣସି ଆଲର୍ଜି ଅଛି କି?', target: 'patient', priority: 2 },
    { id: 'OR-FU-05', category: 'history', text: 'ପୂର୍ବରୁ କୌଣସି ରୋଗ ଥିଲା? ବର୍ତ୍ତମାନ କୌଣସି ପୁରୁଣା ରୋଗ ଅଛି?', target: 'patient', priority: 2 },
    { id: 'OR-FU-06', category: 'vitals', text: 'ଜ୍ୱର କେତେ ଅଛି? ଥର୍ମାମିଟରରେ ମପାଯାଇଛି କି?', target: 'patient', priority: 1 },
  ],
  bannedPhrases: [
    { pattern: /(?:ନିଦାନ)/, replacement: '[ଚିକିତ୍ସକ ଶବ୍ଦ ହଟାଯାଇଛି]' },
    { pattern: /(?:ଚିକିତ୍ସ|ଔଷଧ ଦିଆ|ଔଷଧ ଭିତରେ)/, replacement: '[ଚିକିତ୍ସା ସୁପାରିଶ ହଟାଯାଇଛି — କୌଣସି ଔଷଧ ସୁପାରିଶ ନାହିଁ]' },
    { pattern: /(?:ଗୁଳି ଖାଅ|ଟାବଲେଟ ଖାଅ|ଗୁଳି ଦିଆ|ଟାବଲେଟ ଦିଆ)/, replacement: '[ଔଷଧ ସମ୍ବନ୍ଧିତ ସୁପାରିଶ ହଟାଯାଇଛି]' },
    { pattern: /(?:ତୁମକୁ ଅଛି|ପୀଡ଼ିତ ଅଛି|ସଙ୍କେତ ଦିଏ)/, replacement: '[ନିଦାନ ପରି ଶବ୍ଦ ହଟାଯାଇଛି]' },
    { pattern: /\b(?:nidan|chikitsa|daba dia|guli kha|tablet kha)\b/i, replacement: '[ଔଷଧ ସମ୍ବନ୍ଧିତ ସୁପାରିଶ ହଟାଯାଇଛି]' },
  ],
  sectionLabels: {
    chiefComplaint: 'ମୁଖ୍ୟ ଅଭିଯୋଗ',
    history: 'ଇତିହାସ',
    vitals: 'ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ସଙ୍କେତ',
    timeline: 'ସମୟରେଖା',
    missingInfo: 'ଅନୁପସ୍ଥିତ ସୂଚନା',
    followUps: 'ଅନୁସରଣ ପ୍ରଶ୍ନ',
  },
  disclaimer: OR_DISCLAIMER,
}