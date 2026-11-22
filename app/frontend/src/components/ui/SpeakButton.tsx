import { Volume2 } from 'lucide-react';
import { IconButton } from './IconButton';
import { canSpeak, speak } from '../../lib/speech';

type Props = { text: string; lang: string; label: string };

/** Reads a question aloud in the chosen language. */
export function SpeakButton({ text, lang, label }: Props) {
  return (
    <IconButton label={label} icon={<Volume2 className="size-5" aria-hidden="true" />}
                disabled={!canSpeak()} onClick={() => speak(text, lang)} />
  );
}
