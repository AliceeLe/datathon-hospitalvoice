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
};
export type Key = keyof typeof EN;

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
  },
};

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let s = STRINGS[lang][key] ?? EN[key];
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
