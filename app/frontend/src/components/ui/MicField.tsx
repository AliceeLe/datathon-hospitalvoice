import { Mic } from 'lucide-react';
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { canListen, listenOnce } from '../../lib/speech';
import { IconButton } from './IconButton';
import { TextField } from './TextField';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: string; value: string; onValue: (v: string) => void; speechLang: string; micLabel: string; icon?: ReactNode;
};

/** Text field with a mic button: voice is always an alternative to typing. */
export function MicField({ label, value, onValue, speechLang, micLabel, icon, ...rest }: Props) {
  const [listening, setListening] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <TextField label={label} icon={icon} value={value} onChange={(e) => onValue(e.target.value)} {...rest} />
      <IconButton label={micLabel} disabled={!canListen() || listening} aria-busy={listening || undefined}
                  icon={<Mic className="size-5" aria-hidden="true" />}
                  onClick={async () => { setListening(true); try { const t = await listenOnce(speechLang); if (t) onValue(t); } finally { setListening(false); } }} />
    </div>
  );
}
