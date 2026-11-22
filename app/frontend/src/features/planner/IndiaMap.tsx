import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

const STATES_URL = 'https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson';
const DISTRICTS_URL = 'https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson';
// Map files use some older or longer names than our data.
const ALIASES: Record<string, string> = { orissa: 'odisha', uttaranchal: 'uttarakhand', pondicherry: 'puducherry', nctofdelhi: 'delhi',
  andamanandnicobar: 'andamanandnicobarislands', dadraandnagarhaveli: 'dadraandnagarhavelianddamananddiu', damananddiu: 'dadraandnagarhavelianddamananddiu' };
export const nk = (s: unknown) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
export function resolveName(raw: string, list: string[]): string | null {
  const k = ALIASES[nk(raw)] ?? nk(raw);
  return list.find((s) => nk(s) === k) ?? list.find((s) => nk(s).startsWith(k) || k.startsWith(nk(s))) ?? null;
}

type GJ = GeoJSON.FeatureCollection;
const cache: Record<string, Promise<GJ | null>> = {};
const load = (url: string) => (cache[url] ??= fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
const tok = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();

type Props = {
  states: string[]; districts: string[]; state: string | null; district: string | null;
  onState: (s: string) => void; onDistrict: (d: string) => void; label: string;
};

/** Leaflet map of India: click a state, then a district. Colours come from the design tokens. */
export function IndiaMap({ states, districts, state, district, onState, onDistrict, label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const stateLayer = useRef<L.GeoJSON | null>(null);
  const districtLayer = useRef<L.GeoJSON | null>(null);
  const cb = useRef({ onState, onDistrict });
  cb.current = { onState, onDistrict };

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = L.map(box.current, { maxBounds: [[5, 60], [40, 100]], minZoom: 4, scrollWheelZoom: false }).setView([22, 80], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  // State outlines (re-styled when the selection changes)
  useEffect(() => {
    let live = true;
    load(STATES_URL).then((gj) => {
      if (!live || !gj || !map.current || !states.length) return;
      stateLayer.current?.remove();
      const brand = tok('brand'), line = tok('line-strong');
      stateLayer.current = L.geoJSON(gj, {
        style: (f) => {
          const name = resolveName(f?.properties?.NAME_1 ?? f?.properties?.name ?? '', states);
          const on = name !== null && name === state;
          return { color: on ? brand : line, weight: on ? 2 : 1, fillColor: brand, fillOpacity: on ? 0.08 : state ? 0.02 : 0.12 };
        },
        onEachFeature: (f, layer) => {
          const name = resolveName(f.properties?.NAME_1 ?? f.properties?.name ?? '', states);
          if (!name) return;
          layer.bindTooltip(name, { sticky: true, direction: 'top' });
          layer.on('click', () => cb.current.onState(name));
        },
      }).addTo(map.current);
      districtLayer.current?.bringToFront();
    });
    return () => { live = false; };
  }, [states, state]);

  // District outlines for the chosen state
  useEffect(() => {
    let live = true;
    districtLayer.current?.remove(); districtLayer.current = null;
    if (!state) { map.current?.setView([22, 80], 4); return; }
    load(DISTRICTS_URL).then((gj) => {
      if (!live || !gj || !map.current) return;
      const feats = gj.features.filter((f) => resolveName(f.properties?.NAME_1 ?? '', [state]) === state);
      if (!feats.length) return;
      const brand = tok('brand'), ink = tok('ink');
      districtLayer.current = L.geoJSON({ type: 'FeatureCollection', features: feats } as GJ, {
        style: (f) => {
          const on = resolveName(f?.properties?.NAME_2 ?? '', districts) === district && district !== null;
          return { color: on ? ink : brand, weight: on ? 2 : 1, fillColor: brand, fillOpacity: on ? 0.35 : 0.12 };
        },
        onEachFeature: (f, layer) => {
          const name = resolveName(f.properties?.NAME_2 ?? '', districts) ?? f.properties?.NAME_2;
          layer.bindTooltip(String(name ?? ''), { sticky: true, direction: 'top' });
          layer.on('click', () => name && cb.current.onDistrict(String(name)));
        },
      }).addTo(map.current);
      map.current.fitBounds(districtLayer.current.getBounds(), { padding: [16, 16] });
    });
    return () => { live = false; };
  }, [state, district, districts]);

  return <div ref={box} role="application" aria-label={label} className="h-80 w-full rounded-lg border border-line lg:h-120" />;
}
