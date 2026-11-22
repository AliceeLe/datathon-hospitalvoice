import { Ambulance, BedDouble, Bone, Brain, Baby, Droplet, Droplets, Flame, HeartPulse, type LucideIcon } from 'lucide-react';
import type { Key } from '../../lib/i18n';

export type Need = { key: Key; icon: LucideIcon; query: string };

/** The 9 picture tiles. `query` is the plain-English need sent to the search (Genie). */
export const NEEDS: Need[] = [
  { key: 'need_childbirth', icon: Baby, query: 'Woman in labour (childbirth), may need an emergency C-section' },
  { key: 'need_heart', icon: HeartPulse, query: 'Heart problem needing cardiac care or heart surgery' },
  { key: 'need_accident', icon: Ambulance, query: 'Accident injury needing trauma / emergency care' },
  { key: 'need_burns', icon: Flame, query: 'Severe burns needing a burn unit' },
  { key: 'need_kidney', icon: Droplets, query: 'Kidney failure needing dialysis' },
  { key: 'need_blood', icon: Droplet, query: 'Needs a blood transfusion (blood bank)' },
  { key: 'need_stroke', icon: Brain, query: 'Stroke needing a CT or MRI scan and ICU' },
  { key: 'need_bone', icon: Bone, query: 'Broken bone needing orthopaedics and X-ray' },
  { key: 'need_icu', icon: BedDouble, query: 'Needs an ICU bed' },
];
