import type { Lang } from '../types.js';
import type { KitRec, MachineRec, AssemblyRec } from '../services/fitment.js';
import type { TicketReason } from '../models/ReviewTicket.js';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
export const DEMO_NOTE = {
  en: '⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering.',
  hi: '⚠️ केवल डेमो डेटा — JCB से सत्यापित फिटमेंट नहीं है। ऑर्डर से पहले कृपया पुष्टि करें।',
};

interface Strings {
  welcome(): string;
  langSet(): string;
  yes: string;
  no: string;
  quote: string;
  human: string;
  startOver: string;
  sendClearer: string;
  confirmSerial(serial: string, uncertain: boolean): string;
  pickSerial(serials: string[]): string;
  readFailed(reason: 'no_serial' | 'low_confidence' | 'error'): string;
  typedNotSerial(example: string): string;
  retype(): string;
  badImage(reason: 'too_large' | 'bad_type' | 'empty', maxMb: number): string;
  unsupported(): string;
  machineFound(m: MachineRec): string;
  askAssembly: { body: string; button: string; section: string; unsure: string; unsureDesc: string };
  assemblyUnclear(): string;
  recommend(m: MachineRec, a: AssemblyRec, k: KitRec, evidence: string): string;
  outOfStock(m: MachineRec, a: AssemblyRec, k: KitRec, ref: string): string;
  ticket(reason: TicketReason, ref: string): string;
  multipleKits(skus: string[], ref: string): string;
  leadName(): string;
  leadPhone(canUseWa: boolean): string;
  leadBadPhone(): string;
  leadCity(): string;
  leadConsent(): string;
  consentYes: string;
  consentNo: string;
  useThisNumber: string;
  leadDone(name: string, ref: string, phone: string): string;
  leadCancelled(): string;
  handoff(ref: string): string;
  humanAck(): string;
  repeatedFailure(ref: string): string;
}

const en: Strings = {
  welcome: () =>
    "Hi! I'm the Seal-Kit Advisor (DEMO). 🔧\nSend a clear photo of your machine identification plate, or type the serial number (e.g. DEMO-BHL-0001).\n\nType *reset* anytime to start over, or *human* to talk to our team.\n" +
    DEMO_NOTE.en,
  langSet: () => 'Language set to English. Send a plate photo or type the serial number.',
  yes: 'Yes, correct',
  no: 'No, retry',
  quote: 'Request quote',
  human: 'Talk to human',
  startOver: 'Start over',
  sendClearer: 'Send clearer photo',
  confirmSerial: (s, u) =>
    `I read the serial number as:\n*${s}*\n\n${u ? '⚠️ I am not fully sure — please check every character carefully.\n\n' : ''}Is this correct?`,
  pickSerial: (list) =>
    `I found more than one possible serial number: ${list.map((s) => `*${s}*`).join(', ')}.\nPlease tap the correct one, or type the serial number.`,
  readFailed: (r) =>
    r === 'low_confidence'
      ? "The photo is too blurry for me to read the serial number reliably. Please send a clearer, well-lit, straight-on photo of the plate — or type the serial number."
      : "I couldn't find a serial number in that photo. Please send a clear photo that shows the full plate and the serial number, or type the serial (e.g. DEMO-BHL-0001).",
  typedNotSerial: (ex) => `That doesn't look like a serial number. Serial numbers look like *${ex}*. Please type it again or send a photo of the plate.`,
  retype: () => 'No problem. Please type the serial number, or send another (clearer) photo of the plate.',
  badImage: (r, mb) =>
    r === 'too_large'
      ? `That image is too large. Please send a JPEG, PNG or WEBP photo under ${mb} MB.`
      : 'I can only read JPEG, PNG or WEBP photos. Please resend the plate photo in one of these formats, or type the serial number.',
  unsupported: () => 'I can only read text messages and photos. Please send a photo of the plate or type the serial number.',
  machineFound: (m) => `✅ Serial confirmed: *${m.serial}*\nMachine: *${m.model}* (${m.family} / variant ${m.variant}, ${m.year}) — demo record`,
  askAssembly: {
    body: 'Which hydraulic assembly is leaking?',
    button: 'Choose assembly',
    section: 'Assemblies',
    unsure: 'Not sure',
    unsureDesc: 'Our team will help identify it',
  },
  assemblyUnclear: () => 'Sorry, I did not understand which assembly. Please tap one of the options or type: boom, dipper, bucket, stabilizer or "not sure".',
  recommend: (m, a, k, ev) =>
    `✅ Demo match for *${m.serial}* — ${a.label}\n\nKit: *${k.name}*\nSKU: ${k.sku}\nPrice: ${inr(k.demoPriceINR)} (demo)\nAvailability: In stock (${k.stock} available)\nFitment basis: verified exact serial + assembly record (${ev || 'demo seed'})\n\n${DEMO_NOTE.en}`,
  outOfStock: (m, a, k, ref) =>
    `ℹ️ Demo match for *${m.serial}* — ${a.label}\n\nKit: *${k.name}*\nSKU: ${k.sku}\nPrice: ${inr(k.demoPriceINR)} (demo)\nAvailability: *Currently out of stock* — I can't promise delivery. Our team will confirm the lead time (ticket ${ref}).\nFitment basis: verified exact serial + assembly record\n\n${DEMO_NOTE.en}`,
  ticket: (reason, ref) => {
    const why: Record<TicketReason, string> = {
      unknown_serial: "I can't find that serial number in my demo catalogue",
      no_fitment: "I don't have a verified kit for that exact serial and assembly",
      multiple_kits: 'More than one kit is linked to this serial and assembly',
      inactive_kit: 'The matching kit is currently not available in the catalogue',
      unknown_assembly: "We couldn't pin down which assembly is leaking",
      no_stock: 'That kit is out of stock',
      ambiguous_ocr: "I couldn't read the serial number reliably",
      unreadable_photo: "I couldn't read the serial number from the photos",
      customer_requested: 'You asked to talk to our team',
    };
    return `${why[reason]}, so I've created a review ticket for our staff (ref *${ref}*). They will check it and reply here. I won't guess a part for you.\n\nType *reset* to start over.`;
  },
  multipleKits: (skus, ref) =>
    `More than one kit matches this serial and assembly (${skus.join(', ')}). To avoid a wrong part, our staff will confirm it (ticket *${ref}*). If you have the component part number, please type it now.\n\nType *reset* to start over.`,
  leadName: () => 'Great — let me take your details for the quote. What is your *name*?',
  leadPhone: (wa) => `Thanks! What *phone number* should we call you on?${wa ? ' (or tap "Use this number")' : ''}`,
  leadBadPhone: () => "That phone number doesn't look right. Please type 8–15 digits (you can include +country code).",
  leadCity: () => 'Which *city* are you in?',
  leadConsent: () => 'May we store your name, phone number and city so our team can contact you about this quote? You can ask us to delete it anytime.',
  consentYes: 'I agree',
  consentNo: 'No thanks',
  useThisNumber: 'Use this number',
  leadDone: (n, ref, p) => `Thank you, ${n}! ✅ Your quote request *${ref}* is recorded. Our team will contact you on ${p}.\n\nType *reset* to look up another machine.\n${DEMO_NOTE.en}`,
  leadCancelled: () => "No problem — I haven't saved any of your details. You can still request a quote later or talk to our team.",
  handoff: (ref) => `Okay — I've passed this to our team (ref *${ref}*). A person will reply here soon.\n\nType *reset* to start over.`,
  humanAck: () => 'Our team has your message and will reply here. Type *reset* to start a new search.',
  repeatedFailure: (ref) => `I'm still having trouble reading the serial number, so I've created a ticket for our team (ref *${ref}*). They will reply here. Type *reset* to try again.`,
};

const hi: Strings = {
  welcome: () =>
    'नमस्ते! मैं सील-किट एडवाइज़र (डेमो) हूँ। 🔧\nकृपया अपनी मशीन की पहचान प्लेट की साफ़ फ़ोटो भेजें, या सीरियल नंबर टाइप करें (जैसे DEMO-BHL-0001)।\n\nकभी भी दोबारा शुरू करने के लिए *reset* लिखें, या हमारी टीम से बात करने के लिए *human* लिखें।\n' +
    DEMO_NOTE.hi,
  langSet: () => 'भाषा हिन्दी पर सेट हो गई। प्लेट की फ़ोटो भेजें या सीरियल नंबर टाइप करें।',
  yes: 'हाँ, सही है',
  no: 'नहीं, फिर से',
  quote: 'कोटेशन माँगें',
  human: 'इंसान से बात करें',
  startOver: 'फिर से शुरू करें',
  sendClearer: 'साफ़ फ़ोटो भेजें',
  confirmSerial: (s, u) => `मैंने सीरियल नंबर ऐसा पढ़ा:\n*${s}*\n\n${u ? '⚠️ मुझे पूरा यकीन नहीं है — कृपया हर अक्षर ध्यान से जाँचें।\n\n' : ''}क्या यह सही है?`,
  pickSerial: (list) => `मुझे एक से ज़्यादा संभावित सीरियल नंबर मिले: ${list.map((s) => `*${s}*`).join(', ')}।\nकृपया सही वाला चुनें, या सीरियल नंबर टाइप करें।`,
  readFailed: (r) =>
    r === 'low_confidence'
      ? 'फ़ोटो इतनी धुँधली है कि मैं सीरियल नंबर भरोसे से नहीं पढ़ पा रहा। कृपया प्लेट की साफ़, रोशनी वाली, सीधी फ़ोटो भेजें — या सीरियल नंबर टाइप करें।'
      : 'इस फ़ोटो में मुझे सीरियल नंबर नहीं मिला। कृपया पूरी प्लेट और सीरियल नंबर दिखाती साफ़ फ़ोटो भेजें, या सीरियल टाइप करें (जैसे DEMO-BHL-0001)।',
  typedNotSerial: (ex) => `यह सीरियल नंबर जैसा नहीं लगता। सीरियल नंबर ऐसा दिखता है: *${ex}*। कृपया दोबारा टाइप करें या प्लेट की फ़ोटो भेजें।`,
  retype: () => 'ठीक है। कृपया सीरियल नंबर टाइप करें, या प्लेट की दूसरी (साफ़) फ़ोटो भेजें।',
  badImage: (r, mb) =>
    r === 'too_large'
      ? `यह फ़ोटो बहुत बड़ी है। कृपया ${mb} MB से छोटी JPEG, PNG या WEBP फ़ोटो भेजें।`
      : 'मैं केवल JPEG, PNG या WEBP फ़ोटो पढ़ सकता हूँ। कृपया इन में से किसी फ़ॉर्मैट में फ़ोटो भेजें, या सीरियल नंबर टाइप करें।',
  unsupported: () => 'मैं केवल टेक्स्ट और फ़ोटो पढ़ सकता हूँ। कृपया प्लेट की फ़ोटो भेजें या सीरियल नंबर टाइप करें।',
  machineFound: (m) => `✅ सीरियल की पुष्टि हुई: *${m.serial}*\nमशीन: *${m.model}* (${m.family} / वेरिएंट ${m.variant}, ${m.year}) — डेमो रिकॉर्ड`,
  askAssembly: { body: 'कौन-सा हाइड्रॉलिक असेंबली लीक कर रहा है?', button: 'असेंबली चुनें', section: 'असेंबली', unsure: 'पक्का नहीं पता', unsureDesc: 'हमारी टीम पहचानने में मदद करेगी' },
  assemblyUnclear: () => 'माफ़ कीजिए, मैं समझ नहीं पाया कि कौन-सा असेंबली है। कृपया किसी विकल्प पर टैप करें या लिखें: boom, dipper, bucket, stabilizer या "not sure"।',
  recommend: (m, a, k, ev) =>
    `✅ *${m.serial}* के लिए डेमो मैच — ${a.labelHi || a.label}\n\nकिट: *${k.name}*\nSKU: ${k.sku}\nकीमत: ${inr(k.demoPriceINR)} (डेमो)\nउपलब्धता: स्टॉक में (${k.stock} उपलब्ध)\nफिटमेंट आधार: सत्यापित सटीक सीरियल + असेंबली रिकॉर्ड (${ev || 'डेमो सीड'})\n\n${DEMO_NOTE.hi}`,
  outOfStock: (m, a, k, ref) =>
    `ℹ️ *${m.serial}* के लिए डेमो मैच — ${a.labelHi || a.label}\n\nकिट: *${k.name}*\nSKU: ${k.sku}\nकीमत: ${inr(k.demoPriceINR)} (डेमो)\nउपलब्धता: *अभी स्टॉक में नहीं है* — मैं डिलीवरी का वादा नहीं कर सकता। हमारी टीम समय की पुष्टि करेगी (टिकट ${ref})।\n\n${DEMO_NOTE.hi}`,
  ticket: (reason, ref) => {
    const why: Record<TicketReason, string> = {
      unknown_serial: 'यह सीरियल नंबर मेरे डेमो कैटलॉग में नहीं मिला',
      no_fitment: 'इस सटीक सीरियल और असेंबली के लिए मेरे पास सत्यापित किट नहीं है',
      multiple_kits: 'इस सीरियल और असेंबली से एक से ज़्यादा किट जुड़ी हैं',
      inactive_kit: 'मिलती-जुलती किट अभी कैटलॉग में उपलब्ध नहीं है',
      unknown_assembly: 'यह तय नहीं हो पाया कि कौन-सा असेंबली लीक कर रहा है',
      no_stock: 'यह किट स्टॉक में नहीं है',
      ambiguous_ocr: 'मैं सीरियल नंबर भरोसे से नहीं पढ़ पाया',
      unreadable_photo: 'मैं फ़ोटो से सीरियल नंबर नहीं पढ़ पाया',
      customer_requested: 'आपने हमारी टीम से बात करने को कहा',
    };
    return `${why[reason]}, इसलिए मैंने हमारे स्टाफ के लिए रिव्यू टिकट बनाया है (संदर्भ *${ref}*)। वे जाँचकर यहीं जवाब देंगे। मैं अंदाज़े से कोई पार्ट नहीं बताऊँगा।\n\nदोबारा शुरू करने के लिए *reset* लिखें।`;
  },
  multipleKits: (skus, ref) =>
    `इस सीरियल और असेंबली से एक से ज़्यादा किट मेल खाती हैं (${skus.join(', ')})। गलत पार्ट से बचने के लिए हमारा स्टाफ पुष्टि करेगा (टिकट *${ref}*)। अगर आपके पास कंपोनेंट पार्ट नंबर है तो अभी टाइप करें।\n\nदोबारा शुरू करने के लिए *reset* लिखें।`,
  leadName: () => 'ठीक है — कोटेशन के लिए आपकी जानकारी लेता हूँ। आपका *नाम* क्या है?',
  leadPhone: (wa) => `धन्यवाद! हम आपको किस *फ़ोन नंबर* पर कॉल करें?${wa ? ' (या "यही नंबर" पर टैप करें)' : ''}`,
  leadBadPhone: () => 'यह फ़ोन नंबर सही नहीं लगता। कृपया 8–15 अंक लिखें (+देश कोड सहित भी चलेगा)।',
  leadCity: () => 'आप किस *शहर* में हैं?',
  leadConsent: () => 'क्या हम इस कोटेशन के बारे में संपर्क करने के लिए आपका नाम, फ़ोन नंबर और शहर सहेज सकते हैं? आप कभी भी इसे हटवाने को कह सकते हैं।',
  consentYes: 'मैं सहमत हूँ',
  consentNo: 'नहीं, धन्यवाद',
  useThisNumber: 'यही नंबर',
  leadDone: (n, ref, p) => `धन्यवाद, ${n}! ✅ आपकी कोटेशन रिक्वेस्ट *${ref}* दर्ज हो गई। हमारी टीम ${p} पर संपर्क करेगी।\n\nदूसरी मशीन देखने के लिए *reset* लिखें।\n${DEMO_NOTE.hi}`,
  leadCancelled: () => 'कोई बात नहीं — मैंने आपकी कोई जानकारी सहेजी नहीं है। आप बाद में कोटेशन माँग सकते हैं या हमारी टीम से बात कर सकते हैं।',
  handoff: (ref) => `ठीक है — मैंने यह हमारी टीम को सौंप दिया है (संदर्भ *${ref}*)। कोई व्यक्ति जल्द यहीं जवाब देगा।\n\nदोबारा शुरू करने के लिए *reset* लिखें।`,
  humanAck: () => 'हमारी टीम को आपका संदेश मिल गया है और वे यहीं जवाब देंगे। नई खोज के लिए *reset* लिखें।',
  repeatedFailure: (ref) => `मुझे अब भी सीरियल नंबर पढ़ने में दिक्कत हो रही है, इसलिए मैंने हमारी टीम के लिए टिकट बनाया है (संदर्भ *${ref}*)। वे यहीं जवाब देंगे। फिर कोशिश के लिए *reset* लिखें।`,
};

export const strings = (lang: Lang): Strings => (lang === 'hi' ? hi : en);
