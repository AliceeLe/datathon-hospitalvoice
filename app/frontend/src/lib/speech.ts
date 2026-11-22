/** Read aloud (speechSynthesis) and voice answers (SpeechRecognition). */

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, lang: string): void {
  if (!canSpeak() || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void;
};

function recognitionCtor(): (new () => Recognition) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
}

export function canListen(): boolean {
  return typeof window !== 'undefined' && recognitionCtor() !== null;
}

/** Listen once; resolves with the transcript, or '' if nothing was heard. */
export function listenOnce(lang: string): Promise<string> {
  const Ctor = recognitionCtor();
  if (!Ctor) return Promise.reject(new Error('no-speech'));
  return new Promise((resolve) => {
    const rec = new Ctor();
    let text = '';
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => { text = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim(); };
    rec.onerror = () => resolve(text);
    rec.onend = () => resolve(text);
    rec.start();
  });
}
