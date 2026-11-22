# HospitalVoice UI rules

Users: healthcare coordinators and field workers, many with low literacy, often on a phone, often under time pressure.
The UI must be calm, picture-first and obvious. Planners also use the dashboard on desktop.

## Stack
- React + TypeScript + Tailwind v4 + shadcn-style components (`src/components/ui/*`), `lucide-react` icons only.
- Never hand-write inline SVG for standard UI icons. Never use emoji as icons or decoration.
- Reuse existing components before creating new ones. New reusable UI goes in `src/components/ui/` (primitives) or a feature folder.

## Design tokens (single source of truth: `src/index.css` `@theme`)
- Use token classes only: `bg-canvas bg-surface bg-sunken border-line text-ink text-ink-muted text-ink-subtle bg-brand bg-brand-soft`.
- Status colours carry clinical meaning only: `ok` (good), `warn` (caution / incomplete data), `crit` (emergency / worst gap). Never use them decoratively.
- No raw hex values, no arbitrary colours, no one-off inline styles (exception: computed widths/positions for charts).
- No gradients, glows, or purple/pink. One accent colour (pine `brand`).
- Spacing on an 8px grid (use Tailwind steps 2, 4, 6, 8, 12, 16). Borders are 1px `border-line`; prefer borders to shadows. Radii: 6, 8, 12px.
- Fonts: IBM Plex Sans for text, IBM Plex Mono for numbers/data (`font-mono`).

## Patient-facing flow (Find facility)
- One question per screen. One tap answers and advances. No long forms, no required typing.
- Every choice is a big tile: icon + 1–2 word label, minimum 96px high, 48px minimum touch target everywhere else.
- Voice is a first-class path: every question has a speaker (read aloud) button and a mic answer option.
- Show previous answers as tappable chips; always show a back arrow and a 3-step progress bar.
- Keep copy short, plain words, no jargon. Do not add instructional paragraphs; use an icon or audio instead.
- Emergency is red and Not urgent is green, always paired with an icon and a word (never colour alone).

## Planner dashboard
- Lead with what needs attention (gaps), then totals, then detail. Group related numbers; do not show a wall of identical cards.
- Every number shows its unit and, where possible, a comparison (e.g. vs India) with direction-aware colour (lower-is-better vs higher-is-better).
- Mark calculated values `est.` and incomplete data with an amber "incomplete" badge. Say that 0 may mean "not recorded".
- Use Indian digit grouping via `num()` in `src/lib/format.ts`. Tables are sortable and have `scope`/`aria-sort`.
- Sources go in an info tooltip (`Section` `source` prop), not in a paragraph.

## Accessibility (non-negotiable)
- Text contrast WCAG AA. Visible `:focus-visible` ring (already in `index.css`).
- Every icon-only button has `aria-label`. Meters use `role="meter"`. Groups of toggles use `aria-pressed` or `radiogroup`.
- Respect `prefers-reduced-motion`. Don't convey state by colour alone.
- Language buttons use native names (हिन्दी, தமிழ், తెలుగు) with `lang` attributes.

## Before finishing any UI change
1. `npx tsc --noEmit` passes and `npx vite build` succeeds.
2. Look at a screenshot at 1440px and at ~390px wide. Check nothing overlaps or truncates.
3. Confirm you used tokens, lucide icons and existing components, and added no emoji.

## Data
- `src/data/uttarakhand.ts` has real figures plus rows marked `SAMPLE`. Never present SAMPLE values as real; replace them with API data when available.
