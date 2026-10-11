import type { LanguageRuleSet } from '../../types'

/**
 * Hindi rule set (P0-3).
 *
 * Devanagari patterns cover script Hindi; romanised patterns cover Hinglish.
 * The triage pipeline runs these rules over both the original text and its
 * Latin transliteration, so the two forms unify.
 */
const HI_DISCLAIMER =
  'यह एक सहायक प्रणाली है, निदान नहीं। अंतिम निर्णय योग्य स्वास्थ्यकर्मी का है। ' +
  '(This is an assistive system, not a diagnosis. Final decision belongs to the qualified healthcare worker.)'

export const hindiRuleSet: LanguageRuleSet = {
  language: 'hi',
  urgencyRules: [
    {
      id: 'URG-HI-01',
      label: 'सीने में दर्द (chest pain)',
      severity: 'red',
      patterns: [
        /(?:सीने में दर्द|छाती में दर्द|सीना जलना)/,
        /\b(?:seene me(?:n)? dard|chhati me(?:n)? dard|sina jalna)\b/i,
      ],
      reason: 'छाती की तकलीफ के लिए तुरंत चिकित्सकीय जांच आवश्यक है।',
    },
    {
      id: 'URG-HI-02',
      label: 'सांस लेने में तकलीफ (breathing difficulty)',
      severity: 'red',
      patterns: [
        /(?:सांस लेने में तकलीफ|सांस फूलना|दम घुटना)/,
        /\b(?:saans lene me(?:n)? taklif|saans phoolna|dam ghutna|saans na aana)\b/i,
      ],
      reason: 'सांस की तकलीफ के लिए तुरंत चिकित्सकीय जांच आवश्यक है।',
    },
    {
      id: 'URG-HI-03',
      label: 'बेहोशी / मिर्गी / दौरा',
      severity: 'red',
      patterns: [
        /(?:बेहोश|मिर्गी|दौरा|चक्कर)/,
        /\b(?:behosh|mirgi|daura|chakkar)\b/i,
      ],
      reason: 'बेहोशी या दौरे के लिए आपातकालीन सहायता आवश्यक है।',
    },
    {
      id: 'URG-HI-04',
      label: 'खून बहना (bleeding)',
      severity: 'red',
      patterns: [
        /(?:खून बहना|खून बहुत|रक्तस्राव)/,
        /\b(?:khun bahna|khun bahut|raktstrav|bleeding)\b/i,
      ],
      reason: 'अनियंत्रित रक्तस्राव के लिए आपातकालीन सहायता आवश्यक है।',
    },
    {
      id: 'URG-HI-05',
      label: 'तेज़ बुखार के साथ अकड़न',
      severity: 'amber',
      patterns: [
        /(?:तेज़ बुखार|बुखार और अकड़न|बुखार और गर्दन अकड़न|बुखार के साथ रूखापन)/,
        /\b(?:taiz bukhar|bukhar aur akad|bukhar aur gurudan akad|high fever)\b/i,
      ],
      reason: 'अकड़न या चकत्ते के साथ बुखार का शीघ्र पुनरीक्षण आवश्यक है।',
    },
    {
      id: 'URG-HI-06',
      label: 'लगातार उल्टी / पानी की कमी',
      severity: 'amber',
      patterns: [
        /(?:उल्टी|बार-बार उल्टी|पानी की कमी|निर्जलीकरण)/,
        /\b(?:ulti|baar-baar ulti|pani ki kami|nirjalikaran|dehydration)\b/i,
      ],
      reason: 'पानी की कमी (निर्जलीकरण) का जोखिम शीघ्र जांच की मांग करता है।',
    },
    {
      id: 'URG-HI-07',
      label: 'बीपी / शुगर अधिक',
      severity: 'amber',
      patterns: [
        /(?:बीपी हाई|शुगर हाई|ब्लड प्रेशर|मधुमेह)/,
        /\b(?:bp high|sugar high|blood pressure|madhumay)\b/i,
      ],
      reason: 'बताया गया असामान्य रीडिंग चिकित्सक सत्यापन की मांग करता है।',
    },
    {
      id: 'URG-HI-08',
      label: 'छोटे शिशु में लक्षण',
      severity: 'amber',
      patterns: [
        /(?:नवजात|शिशु|बच्चा)/,
        /\b(?:navjaat|shishu|bachcha|bacha)\b/i,
      ],
      reason: 'छोटे शिशुओं में लक्षण तेज़ी से बिगड़ सकते हैं — शीघ्र जांच सुझाई जाती है।',
    },
  ],
  missingInfoChecks: [
    { id: 'CHK-HI-01', label: 'महत्वपूर्ण संकेत (बीपी, नाड़ी, तापमान, ऑक्सीजन, वजन)', whyItMatters: 'महत्वपूर्ण संकेत त्रैज प्राथमिकता निर्णयों को आधार देते हैं।', patterns: [/(?:बीपी|नाड़ी|तापमान|ऑक्सीजन|वजन)/, /\b(?:bp|nadi|tapman|oxygen|vajan)\b[:\-]?\s*\d/i, /\b(?:bp|temperature|spo2|pulse)\s*[:\-]?\s*\d/i] },
    { id: 'CHK-HI-02', label: 'लक्षण की शुरुआत / अवधि', whyItMatters: 'शुरुआत और अवधि से जांच की तात्कालिकता बदलती है।', patterns: [/(?:कब से|कितने दिन|कल से|आज|पहले)/, /\b(?:kab se|kitne din|kal se|aaj|pal|since|days)\b/i] },
    { id: 'CHK-HI-03', label: 'वर्तमान दवाएं और एलर्जी', whyItMatters: 'किसी भी चिकित्सकीय निर्णय से पहले आवश्यक; यह प्रणाली कभी दवा की सलाह नहीं देती।', patterns: [/(?:दवा|दवाई|एलर्जी|दवाएं)/, /\b(?:dawa|dawai|allergy|medicine|tablet)\b/i] },
    { id: 'CHK-HI-04', label: 'पिछली बीमारी का इतिहास', whyItMatters: 'मौजूदा स्थितियां तय करती हैं कि मरीज़ को कितनी शीघ्र देखा जाए।', patterns: [/(?:पहले|इतिहास|पुरानी बीमारी|सर्जरी)/, /\b(?:pal|itihas|purani bimari|surgery|history)\b/i] },
  ],
  followUpQuestions: [
    { id: 'HI-FU-01', category: 'timeline', text: 'लक्षण कब से शुरू हुए? कितनी देर हो गई?', target: 'patient', priority: 1 },
    { id: 'HI-FU-02', category: 'severity', text: 'दर्द कितना तेज़ है? क्या इससे सामान्य काम करने में दिक्कत आ रही है?', target: 'patient', priority: 1 },
    { id: 'HI-FU-03', category: 'medication', text: 'कोई दवा ले रहे हैं? कौन सी और कब ली?', target: 'patient', priority: 2 },
    { id: 'HI-FU-04', category: 'allergies', text: 'किसी चीज़ से एलर्जी है?', target: 'patient', priority: 2 },
    { id: 'HI-FU-05', category: 'history', text: 'पहले कोई बीमारी रही है? अभी कोई पुरानी बीमारी है?', target: 'patient', priority: 2 },
    { id: 'HI-FU-06', category: 'vitals', text: 'बुखार कितना है? किसी थर्मामीटर से नापा है?', target: 'patient', priority: 1 },
  ],
  bannedPhrases: [
    { pattern: /(?:निदान|रोग निदान)/, replacement: '[चिकित्सीय शब्द हटाया गया]' },
    { pattern: /(?:इलाज|दवा दें|दवा दे)/, replacement: '[उपचार सलाह हटाई गई — कोई दवा सलाह नहीं दी जाती]' },
    { pattern: /(?:गोली लें|टैबलेट लें|गोली दें|टैबलेट दें)/, replacement: '[दवा संबंधी सलाह हटाई गई]' },
    { pattern: /(?:आपको है|पीड़ित है|संकेत देता है)/, replacement: '[निदान जैसा शब्द हटाया गया]' },
    { pattern: /\b(?:nidan|ilaj|dawa de?n?|goli le|tablet le)\b/i, replacement: '[दवा संबंधी सलाह हटाई गई]' },
  ],
  sectionLabels: {
    chiefComplaint: 'मुख्य शिकायत',
    history: 'इतिहास',
    vitals: 'महत्वपूर्ण संकेत',
    timeline: 'समयरेखा',
    missingInfo: 'अनुपलब्ध जानकारी',
    followUps: 'अनुवर्ती प्रश्न',
  },
  disclaimer: HI_DISCLAIMER,
}