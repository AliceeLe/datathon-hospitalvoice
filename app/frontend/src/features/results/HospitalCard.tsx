import { AlertTriangle, Check, MapPin, Phone } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import type { Hospital } from '../../lib/api';
import type { Lang } from '../../lib/i18n';
import { isMissing, trService } from '../../lib/services';
import type { ReactNode } from 'react';

type Props = {
  h: Hospital; lang: Lang; t: (k: string, v?: Record<string, string | number>) => string;
  canContact: boolean; onContact?: () => void; contact?: ReactNode; compact?: boolean;
};

export function HospitalCard({ h, lang, t, canContact, onContact, contact, compact }: Props) {
  const refused = h.refusals?.n ?? 0;
  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-lg font-semibold">{h.name}</h3>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        {h.km != null && <span className="font-mono text-ink">{h.km} km</span>}
        {h.address && <span>{h.address}</span>}
      </p>
      {refused > 0 && (
        <div className="mt-2"><Badge tone="warn" icon={<AlertTriangle className="size-3" />}>
          {t('card_refused', { n: refused, reason: h.refusals?.top_reason ? t(`reason_${h.refusals.top_reason}`) : '' })}
        </Badge></div>
      )}
      {h.bullets?.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {h.bullets.map((b) => (
            <li key={b} className="flex items-center gap-2">
              {isMissing(b)
                ? <><Badge tone="warn">{t('incomplete')}</Badge><span className="text-ink-muted">{trService(b, lang)}</span></>
                : <><Check className="size-4 text-ok" aria-hidden="true" /><span>{trService(b, lang)}</span></>}
            </li>
          ))}
        </ul>
      )}
      {!contact && !compact && (
        <div className="mt-4">
          <Button variant="primary" icon={<Phone className="size-4" aria-hidden="true" />} disabled={!canContact} onClick={onContact}>
            {t('contact')}
          </Button>
        </div>
      )}
      {contact}
    </Card>
  );
}
