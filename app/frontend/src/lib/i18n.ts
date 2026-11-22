import { useEffect, useState } from 'react';

export type Lang = 'en' | 'hi' | 'ta' | 'te';
export const LANGS: { code: Lang; native: string; speech: string }[] = [
  { code: 'en', native: 'EN', speech: 'en-IN' },
  { code: 'hi', native: 'हिन्दी', speech: 'hi-IN' },
  { code: 'ta', native: 'தமிழ்', speech: 'ta-IN' },
  { code: 'te', native: 'తెలుగు', speech: 'te-IN' },
];
const LANG_KEY = 'hospitalvoice_lang';      // shared with the legacy page

const EN = {
  findFacility: 'Find facility', planner: 'Planner dashboard', readAloud: 'Read aloud', newChat: 'New chat',
  search: 'Search', tracker: 'Referral tracker', recentChats: 'Recent chats', noChats: 'No chats yet', menu: 'Menu',
  closeMenu: 'Close menu', language: 'Language', back: 'Back', speak: 'Read this aloud', progress: 'Step {n} of 3',
  qNeed: 'What does the patient need?', qWhere: 'Where is the patient?', qUrgent: 'How urgent is it?',
  sayNeed: 'Say what the patient needs', useLocation: 'Use my location', myLocation: 'My location',
  sayPlace: 'Say the village or town', typePlace: 'Or type village, town or PIN', go: 'Continue',
  emergency: 'Emergency', notUrgent: 'Not urgent', listening: 'Listening…', finding: 'Finding hospitals…',
  noSpeech: 'Voice is not available in this browser', noLocation: 'Location is not available',
  failed: 'Could not search. Try again.', tryAgain: 'Try again', change: 'Change',
  need_childbirth: 'Childbirth', need_heart: 'Heart', need_accident: 'Accident', need_burns: 'Burns',
  need_kidney: 'Kidney', need_blood: 'Blood needed', need_stroke: 'Stroke', need_bone: 'Broken bone', need_icu: 'ICU bed',
  ambulance: 'Ambulance 108 · Emergency 112', results: '{n} hospitals', resultsOne: '1 hospital', noHospitals: 'No hospitals found',
  callResult: 'What did they say?', today: 'Today', tomorrow: 'Tomorrow', dayAfter: 'Day after', morning: 'Morning',
  afternoon: 'Afternoon', evening: 'Evening', exactTime: 'Exact date and time', whenTitle: 'When?', bringTitle: 'What to bring?',
  patientTitle: 'Patient', continue: 'Continue', done: 'Referred', ask: 'Ask', askPh: 'Ask about these hospitals',
  thinking: 'Looking…', chatMissing: 'This chat is not on this device', urgentBadge: 'Emergency', notUrgentBadge: 'Not urgent',
  needsAttention: 'Needs attention', totals: 'Totals', population: 'Population and health', nfhs: 'Health survey (NFHS-5)',
  detail: 'Detail', incomplete: 'incomplete', est: 'est.', notRecorded: '0 may mean not recorded', vsIndia: 'India {v}',
  better: 'better than India', worse: 'worse than India', source: 'Source', selectState: 'Choose a state',
  allDistricts: 'Whole state', districtsTable: 'Districts', facilitiesTable: 'Facilities', far: 'far', noGaps: 'No large gaps found',
  kmTo: '{km} km to {service}', zeroHospitals: 'no hospital recorded', people: 'people', perYear: 'per year',
  micAnswer: 'Speak your answer', hospitals: 'Hospitals', svc_csection: 'Emergency C-section', svc_trauma: 'Trauma care', svc_icu: 'ICU', svc_blood: 'Blood bank', svc_nicu: 'Newborn ICU', svc_dialysis: 'Dialysis', svc_ct: 'CT scan', svc_mri: 'MRI', svc_cardiac: 'Heart surgery', svc_burns: 'Burn care', nf_anc: '4+ pregnancy check-ups', pooled: 'pooled', lowerBetter: 'lower is better', higherBetter: 'higher is better', gapNote: 'Districts where the nearest facility listing a service is far away (by straight-line distance), or where no hospital is recorded. Distances come from facility locations in the dataset, so a missing listing can look like a gap.', srcFacilities: 'Virtue Foundation facilities dataset (cleaned). Counts are facilities that list the service; 0 may mean not recorded.', srcNfhs: 'National Family Health Survey 2019-21 (NFHS-5), district fact sheets. State values are the average of its districts (est.).', close: 'Close', searchChats: 'Search chats', openChat: 'Open chat', demoOnly: 'Demo data only',
};
export type Key = keyof typeof EN | (string & {});   // any key from static/i18n.js is also accepted

// static/i18n.js (shared with the legacy page) is loaded before the bundle and defines the global I18N.
declare const I18N: Record<string, Record<string, string>> | undefined;
function legacy(lang: string, key: string): string | undefined {
  try { return typeof I18N !== 'undefined' ? I18N[lang]?.[key] : undefined; } catch { return undefined; }
}
/** Legacy strings may contain emoji or <strong>; the new UI shows neither. */
function clean(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/^[\s+]+/, '').trim();
}

const STRINGS: Record<Lang, Partial<Record<Key, string>>> = {
  en: EN,
  hi: {
    findFacility: 'अस्पताल खोजें', planner: 'योजनाकार डैशबोर्ड', readAloud: 'पढ़कर सुनाएँ', newChat: 'नई चैट',
    search: 'खोजें', tracker: 'रेफ़रल ट्रैकर', recentChats: 'हाल की चैट', noChats: 'अभी कोई चैट नहीं', menu: 'मेनू',
    closeMenu: 'मेनू बंद करें', language: 'भाषा', back: 'वापस', speak: 'पढ़कर सुनाएँ', progress: 'चरण {n} / 3',
    qNeed: 'मरीज़ को क्या चाहिए?', qWhere: 'मरीज़ कहाँ है?', qUrgent: 'कितना ज़रूरी है?',
    sayNeed: 'बोलकर बताएँ मरीज़ को क्या चाहिए', useLocation: 'मेरी लोकेशन लें', myLocation: 'मेरी लोकेशन',
    sayPlace: 'गाँव या शहर बोलें', typePlace: 'या गाँव, शहर या पिन लिखें', go: 'आगे',
    emergency: 'आपातकाल', notUrgent: 'ज़रूरी नहीं', listening: 'सुन रहे हैं…', finding: 'अस्पताल खोजे जा रहे हैं…',
    noSpeech: 'इस ब्राउज़र में आवाज़ उपलब्ध नहीं', noLocation: 'लोकेशन उपलब्ध नहीं',
    failed: 'खोज नहीं हो सकी। फिर कोशिश करें।', tryAgain: 'फिर कोशिश करें', change: 'बदलें',
    need_childbirth: 'प्रसव', need_heart: 'दिल', need_accident: 'दुर्घटना', need_burns: 'जलना',
    need_kidney: 'किडनी', need_blood: 'खून चाहिए', need_stroke: 'लकवा', need_bone: 'हड्डी टूटी', need_icu: 'ICU बेड',
    ambulance: 'एम्बुलेंस 108 · आपातकाल 112', results: '{n} अस्पताल', resultsOne: '1 अस्पताल', noHospitals: 'कोई अस्पताल नहीं मिला', callResult: 'उन्होंने क्या कहा?', today: 'आज', tomorrow: 'कल', dayAfter: 'परसों', morning: 'सुबह', afternoon: 'दोपहर', evening: 'शाम', exactTime: 'सही तारीख और समय', whenTitle: 'कब?', bringTitle: 'क्या लाना है?', patientTitle: 'मरीज़', continue: 'आगे', done: 'भेजा गया', ask: 'पूछें', askPh: 'इन अस्पतालों के बारे में पूछें', thinking: 'देख रहे हैं…', chatMissing: 'यह चैट इस डिवाइस पर नहीं है', urgentBadge: 'आपातकाल', notUrgentBadge: 'ज़रूरी नहीं', needsAttention: 'ध्यान देने योग्य', totals: 'कुल', population: 'जनसंख्या और स्वास्थ्य', nfhs: 'स्वास्थ्य सर्वेक्षण (NFHS-5)', detail: 'विवरण', incomplete: 'अधूरा', est: 'अनुमान', notRecorded: '0 का मतलब दर्ज नहीं भी हो सकता है', vsIndia: 'भारत {v}', better: 'भारत से बेहतर', worse: 'भारत से खराब', source: 'स्रोत', selectState: 'राज्य चुनें', allDistricts: 'पूरा राज्य', districtsTable: 'ज़िले', facilitiesTable: 'केंद्र', far: 'दूर', noGaps: 'कोई बड़ी कमी नहीं मिली', kmTo: '{service} तक {km} कि.मी.', zeroHospitals: 'कोई अस्पताल दर्ज नहीं', people: 'लोग', perYear: 'प्रति वर्ष', micAnswer: 'बोलकर बताएँ', hospitals: 'अस्पताल', svc_csection: 'आपात सी-सेक्शन', svc_trauma: 'ट्रॉमा देखभाल', svc_icu: 'ICU', svc_blood: 'ब्लड बैंक', svc_nicu: 'नवजात ICU', svc_dialysis: 'डायलिसिस', svc_ct: 'CT स्कैन', svc_mri: 'MRI', svc_cardiac: 'हृदय सर्जरी', svc_burns: 'जलने का इलाज', nf_anc: 'गर्भावस्था में 4+ जाँच', pooled: 'संयुक्त', lowerBetter: 'कम बेहतर है', higherBetter: 'अधिक बेहतर है', gapNote: 'वे ज़िले जहाँ यह सेवा देने वाला निकटतम केंद्र दूर है (सीधी दूरी), या जहाँ कोई अस्पताल दर्ज नहीं है। दूरी डेटा में केंद्रों के स्थान से है, इसलिए दर्ज न होना भी कमी जैसा दिख सकता है।', srcFacilities: 'वर्चू फ़ाउंडेशन केंद्र डेटा (साफ़ किया गया)। गिनती उन केंद्रों की है जो सेवा दर्ज करते हैं; 0 का मतलब दर्ज नहीं भी हो सकता है।', srcNfhs: 'राष्ट्रीय परिवार स्वास्थ्य सर्वेक्षण 2019-21 (NFHS-5), ज़िला फ़ैक्ट शीट। राज्य का मान ज़िलों का औसत है (अनुमान)।', close: 'बंद करें', searchChats: 'चैट खोजें', openChat: 'चैट खोलें', demoOnly: 'केवल डेमो डेटा',
  },
  ta: {
    findFacility: 'மருத்துவமனை தேடல்', planner: 'திட்டமிடுபவர் டாஷ்போர்டு', readAloud: 'சத்தமாக படி', newChat: 'புதிய உரையாடல்',
    search: 'தேடு', tracker: 'பரிந்துரை கண்காணிப்பு', recentChats: 'சமீபத்திய உரையாடல்கள்', noChats: 'இன்னும் உரையாடல்கள் இல்லை',
    menu: 'பட்டி', closeMenu: 'பட்டியை மூடு', language: 'மொழி', back: 'பின்', speak: 'சத்தமாக படி', progress: 'படி {n} / 3',
    qNeed: 'நோயாளிக்கு என்ன தேவை?', qWhere: 'நோயாளி எங்கே இருக்கிறார்?', qUrgent: 'எவ்வளவு அவசரம்?',
    sayNeed: 'நோயாளியின் தேவையைச் சொல்லுங்கள்', useLocation: 'என் இருப்பிடம்', myLocation: 'என் இருப்பிடம்',
    sayPlace: 'கிராமம் அல்லது நகரத்தைச் சொல்லுங்கள்', typePlace: 'அல்லது கிராமம், நகரம் அல்லது பின் எழுதுங்கள்', go: 'தொடர்',
    emergency: 'அவசரம்', notUrgent: 'அவசரமில்லை', listening: 'கேட்கிறது…', finding: 'மருத்துவமனைகள் தேடப்படுகின்றன…',
    noSpeech: 'இந்த உலாவியில் குரல் இல்லை', noLocation: 'இருப்பிடம் கிடைக்கவில்லை',
    failed: 'தேட முடியவில்லை. மீண்டும் முயலவும்.', tryAgain: 'மீண்டும் முயல்', change: 'மாற்று',
    need_childbirth: 'பிரசவம்', need_heart: 'இதயம்', need_accident: 'விபத்து', need_burns: 'தீக்காயம்',
    need_kidney: 'சிறுநீரகம்', need_blood: 'இரத்தம் தேவை', need_stroke: 'பக்கவாதம்', need_bone: 'எலும்பு முறிவு', need_icu: 'ICU படுக்கை',
    ambulance: 'ஆம்புலன்ஸ் 108 · அவசரம் 112', results: '{n} மருத்துவமனைகள்', resultsOne: '1 மருத்துவமனை', noHospitals: 'மருத்துவமனைகள் இல்லை', callResult: 'அவர்கள் என்ன சொன்னார்கள்?', today: 'இன்று', tomorrow: 'நாளை', dayAfter: 'நாளை மறுநாள்', morning: 'காலை', afternoon: 'மதியம்', evening: 'மாலை', exactTime: 'சரியான தேதி மற்றும் நேரம்', whenTitle: 'எப்போது?', bringTitle: 'என்ன கொண்டு வர வேண்டும்?', patientTitle: 'நோயாளி', continue: 'தொடர்', done: 'அனுப்பப்பட்டது', ask: 'கேள்', askPh: 'இந்த மருத்துவமனைகள் பற்றி கேளுங்கள்', thinking: 'பார்க்கிறது…', chatMissing: 'இந்த உரையாடல் இந்தச் சாதனத்தில் இல்லை', urgentBadge: 'அவசரம்', notUrgentBadge: 'அவசரமில்லை', needsAttention: 'கவனிக்க வேண்டியவை', totals: 'மொத்தம்', population: 'மக்கள்தொகை மற்றும் சுகாதாரம்', nfhs: 'சுகாதார ஆய்வு (NFHS-5)', detail: 'விவரம்', incomplete: 'முழுமையற்றது', est: 'மதிப்பீடு', notRecorded: '0 என்பது பதிவாகவில்லை என்றும் இருக்கலாம்', vsIndia: 'இந்தியா {v}', better: 'இந்தியாவை விட சிறந்தது', worse: 'இந்தியாவை விட மோசம்', source: 'ஆதாரம்', selectState: 'மாநிலத்தைத் தேர்ந்தெடுக்கவும்', allDistricts: 'முழு மாநிலம்', districtsTable: 'மாவட்டங்கள்', facilitiesTable: 'மையங்கள்', far: 'தொலைவு', noGaps: 'பெரிய இடைவெளிகள் இல்லை', kmTo: '{service} க்கு {km} கி.மீ.', zeroHospitals: 'மருத்துவமனை பதிவாகவில்லை', people: 'பேர்', perYear: 'ஆண்டுக்கு', micAnswer: 'பேசிச் சொல்லுங்கள்', hospitals: 'மருத்துவமனைகள்', svc_csection: 'அவசர சிசேரியன்', svc_trauma: 'விபத்து சிகிச்சை', svc_icu: 'ICU', svc_blood: 'இரத்த வங்கி', svc_nicu: 'பச்சிளம் குழந்தை ICU', svc_dialysis: 'டயாலிசிஸ்', svc_ct: 'CT ஸ்கேன்', svc_mri: 'MRI', svc_cardiac: 'இதய அறுவை சிகிச்சை', svc_burns: 'தீக்காய சிகிச்சை', nf_anc: '4+ கர்ப்பகால பரிசோதனைகள்', pooled: 'தொகுக்கப்பட்டது', lowerBetter: 'குறைவு சிறந்தது', higherBetter: 'அதிகம் சிறந்தது', gapNote: 'இந்தச் சேவையை வழங்கும் அருகிலுள்ள மையம் தொலைவில் உள்ள (நேர்கோட்டுத் தூரம்) அல்லது மருத்துவமனை பதிவாகாத மாவட்டங்கள். தூரம் தரவிலுள்ள மைய இருப்பிடங்களிலிருந்து கணக்கிடப்படுகிறது; பதிவு இல்லாததும் இடைவெளியாகத் தோன்றலாம்.', srcFacilities: 'வெர்ச்சு ஃபவுண்டேஷன் மையத் தரவு (சுத்திகரிக்கப்பட்டது). சேவையைப் பதிவு செய்த மையங்களின் எண்ணிக்கை; 0 என்பது பதிவாகவில்லை என்றும் இருக்கலாம்.', srcNfhs: 'தேசிய குடும்ப சுகாதார ஆய்வு 2019-21 (NFHS-5), மாவட்டத் தகவல் தாள்கள். மாநில மதிப்பு மாவட்டங்களின் சராசரி (மதிப்பீடு).', close: 'மூடு', searchChats: 'உரையாடல்களைத் தேடு', openChat: 'உரையாடலைத் திற', demoOnly: 'டெமோ தரவு மட்டும்',
  },
  te: {
    findFacility: 'ఆసుపత్రి శోధన', planner: 'ప్లానర్ డాష్‌బోర్డ్', readAloud: 'చదివి వినిపించు', newChat: 'కొత్త చాట్',
    search: 'వెతకండి', tracker: 'రిఫరల్ ట్రాకర్', recentChats: 'ఇటీవలి చాట్‌లు', noChats: 'ఇంకా చాట్‌లు లేవు', menu: 'మెను',
    closeMenu: 'మెను మూసివేయి', language: 'భాష', back: 'వెనక్కి', speak: 'చదివి వినిపించు', progress: 'దశ {n} / 3',
    qNeed: 'రోగికి ఏమి కావాలి?', qWhere: 'రోగి ఎక్కడ ఉన్నారు?', qUrgent: 'ఎంత అత్యవసరం?',
    sayNeed: 'రోగికి ఏమి కావాలో చెప్పండి', useLocation: 'నా లొకేషన్ వాడండి', myLocation: 'నా లొకేషన్',
    sayPlace: 'గ్రామం లేదా పట్టణం చెప్పండి', typePlace: 'లేదా గ్రామం, పట్టణం లేదా పిన్ రాయండి', go: 'కొనసాగించు',
    emergency: 'అత్యవసరం', notUrgent: 'అత్యవసరం కాదు', listening: 'వింటోంది…', finding: 'ఆసుపత్రుల కోసం వెతుకుతోంది…',
    noSpeech: 'ఈ బ్రౌజర్‌లో వాయిస్ అందుబాటులో లేదు', noLocation: 'లొకేషన్ అందుబాటులో లేదు',
    failed: 'వెతకలేకపోయాము. మళ్ళీ ప్రయత్నించండి.', tryAgain: 'మళ్ళీ ప్రయత్నించండి', change: 'మార్చు',
    need_childbirth: 'ప్రసవం', need_heart: 'గుండె', need_accident: 'ప్రమాదం', need_burns: 'కాలిన గాయాలు',
    need_kidney: 'కిడ్నీ', need_blood: 'రక్తం కావాలి', need_stroke: 'పక్షవాతం', need_bone: 'ఎముక విరిగింది', need_icu: 'ICU బెడ్',
    ambulance: 'అంబులెన్స్ 108 · అత్యవసరం 112', results: '{n} ఆసుపత్రులు', resultsOne: '1 ఆసుపత్రి', noHospitals: 'ఆసుపత్రులు కనబడలేదు', callResult: 'వారు ఏమి చెప్పారు?', today: 'ఈరోజు', tomorrow: 'రేపు', dayAfter: 'ఎల్లుండి', morning: 'ఉదయం', afternoon: 'మధ్యాహ్నం', evening: 'సాయంత్రం', exactTime: 'ఖచ్చితమైన తేదీ, సమయం', whenTitle: 'ఎప్పుడు?', bringTitle: 'ఏమి తీసుకురావాలి?', patientTitle: 'రోగి', continue: 'కొనసాగించు', done: 'పంపబడింది', ask: 'అడగండి', askPh: 'ఈ ఆసుపత్రుల గురించి అడగండి', thinking: 'చూస్తోంది…', chatMissing: 'ఈ చాట్ ఈ పరికరంలో లేదు', urgentBadge: 'అత్యవసరం', notUrgentBadge: 'అత్యవసరం కాదు', needsAttention: 'శ్రద్ధ అవసరం', totals: 'మొత్తం', population: 'జనాభా మరియు ఆరోగ్యం', nfhs: 'ఆరోగ్య సర్వే (NFHS-5)', detail: 'వివరాలు', incomplete: 'అసంపూర్ణం', est: 'అంచనా', notRecorded: '0 అంటే నమోదు కాలేదని కూడా కావచ్చు', vsIndia: 'భారత్ {v}', better: 'భారత్ కంటే మెరుగు', worse: 'భారత్ కంటే అధ్వాన్నం', source: 'మూలం', selectState: 'రాష్ట్రాన్ని ఎంచుకోండి', allDistricts: 'మొత్తం రాష్ట్రం', districtsTable: 'జిల్లాలు', facilitiesTable: 'కేంద్రాలు', far: 'దూరం', noGaps: 'పెద్ద లోపాలు కనబడలేదు', kmTo: '{service} కు {km} కి.మీ.', zeroHospitals: 'ఆసుపత్రి నమోదు కాలేదు', people: 'మంది', perYear: 'సంవత్సరానికి', micAnswer: 'మాట్లాడి చెప్పండి', hospitals: 'ఆసుపత్రులు', svc_csection: 'అత్యవసర సిజేరియన్', svc_trauma: 'ప్రమాద చికిత్స', svc_icu: 'ICU', svc_blood: 'బ్లడ్ బ్యాంక్', svc_nicu: 'నవజాత ICU', svc_dialysis: 'డయాలసిస్', svc_ct: 'CT స్కాన్', svc_mri: 'MRI', svc_cardiac: 'గుండె శస్త్రచికిత్స', svc_burns: 'కాలిన గాయాల చికిత్స', nf_anc: '4+ గర్భ పరీక్షలు', pooled: 'కలిపిన', lowerBetter: 'తక్కువ మెరుగు', higherBetter: 'ఎక్కువ మెరుగు', gapNote: 'ఈ సేవ అందించే దగ్గరి కేంద్రం దూరంగా ఉన్న (సరళ రేఖ దూరం) లేదా ఆసుపత్రి నమోదు కాని జిల్లాలు. దూరాలు డేటాలోని కేంద్రాల స్థానాల నుండి; నమోదు లేకపోవడం కూడా లోపంలా కనిపించవచ్చు.', srcFacilities: 'వర్చ్యూ ఫౌండేషన్ కేంద్రాల డేటా (శుభ్రపరచినది). సేవను నమోదు చేసిన కేంద్రాల సంఖ్య; 0 అంటే నమోదు కాలేదని కూడా కావచ్చు.', srcNfhs: 'జాతీయ కుటుంబ ఆరోగ్య సర్వే 2019-21 (NFHS-5), జిల్లా ఫ్యాక్ట్ షీట్లు. రాష్ట్ర విలువ జిల్లాల సగటు (అంచనా).', close: 'మూసివేయి', searchChats: 'చాట్‌లను వెతకండి', openChat: 'చాట్ తెరవండి', demoOnly: 'డెమో డేటా మాత్రమే',
  },
};

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const k = key as keyof typeof EN;
  const own = STRINGS[lang][k];
  const leg = own === undefined ? legacy(lang, key) : undefined;
  let s = own ?? (leg !== undefined ? clean(leg) : undefined) ?? EN[k] ?? (legacy('en', key) !== undefined ? clean(legacy('en', key)!) : key);
  for (const [k, v] of Object.entries(vars ?? {})) s = s.split(`{${k}}`).join(String(v));
  return s;
}

function readLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'en' || v === 'hi' || v === 'ta' || v === 'te') return v;
  } catch { /* storage unavailable */ }
  return 'en';
}

export function useLang() {
  const [lang, setLangState] = useState<Lang>(readLang);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
  }, [lang]);
  const t = (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars);
  return { lang, setLang: setLangState, t };
}

export function speechLang(lang: Lang): string {
  return LANGS.find((l) => l.code === lang)?.speech ?? 'en-IN';
}
