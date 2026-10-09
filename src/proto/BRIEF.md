# Ember UI prototypes — shared brief

Four prototypes, four art directions, **one fixture**. They are compared on
feel and clarity, so every one of them shows the same data and the same four
screens. Read this whole file before writing a line.

## What the product is

A local-first money app for Algeria that answers one question: **"what is
actually free to spend before payday?"** We call that number **breathing
room**. It is a forecast, never a verdict — the UI must never say "you can
afford it". Two accounts: cash/CCP in **DA** (balance typed by hand) and a
**RedotPay** USD card whose balance is *estimated* (last typed anchor minus
spend parsed from emails since). A user-set FX rate converts USD to DA.
Spending arrives two ways: fast manual logging, and an **inbox review tray**
of email-parsed candidates that the user confirms or rejects — never
auto-committed. Recurring **obligations** (rent, internet, subscriptions,
installments, variable bills) have a lifecycle: upcoming → due soon → paid |
late; variable bills are "estimated" until the real amount lands.

Brand roots to keep: the **ember / hearth-fire** motif (a flame that reflects
your financial state), warmth, honesty, no shame. Trust rules: nothing is
purchasable, no pay-to-win, every number is explainable.

## Fixture

Import everything from `../data.ts`. Do not invent amounts, merchants or
dates. Key values: `BREATHING_ROOM_DA`, `PER_DAY_DA`, `DAYS_TO_PAYDAY`,
`ACCOUNTS`, `OBLIGATIONS`, `CANDIDATES`, `TRANSACTIONS`, `REPEAT_CHIPS`,
`FX_DA_PER_USD`, and the `fmt*` helpers. Local `useState` on top of the
fixture is fine for interactions (mark paid, confirm candidate, add a log).

## The four screens (all required)

1. **Home** — breathing room as the hero number with "per day until payday"
   and days remaining; both accounts (DA manual with "confirmed today";
   RedotPay USD with the DA conversion, "estimated · last confirmed 3 days
   ago", and a **Confirm balance** affordance); the next 3 obligations; the
   ember/hearth motif reflecting state; entry points to the other screens.
   The **late gym bill** must be visible and handled gently (a nudge, not a
   red alarm).
2. **Runway** — the month as a timeline from today to payday: every
   obligation on its due date with status, the paid rent behind us, the
   variable Sonelgaz as an estimate with its history, the installment with
   its 3/12 progress, USD items shown with DA equivalent. Tapping an
   obligation toggles paid (local state) and the breathing-room number
   should react.
3. **Review tray** — the 5 inbox candidates. Each shows merchant, amount,
   date, its source email(s), confidence, and the parser's flag when present
   (the Steam one is a **duplicate** from two emails — show both sources and
   that it will be stored once; Netflix is **not a charge**; Spotify is a
   **promo** false-positive). Confirm / reject per item with motion; the
   confirmed ones leave the tray. Make the honesty visible: this is a claim
   with evidence, you decide.
4. **Quick log** — a sheet/panel: amount, category, account; the four
   `REPEAT_CHIPS` as one-tap buttons; adding one prepends to a recent list.
   Fast is the whole point — the daily coffee is one tap.

Navigation between the four lives inside your prototype (tabs, a dock, a
map, a menu — whatever fits the direction). A small way back to `#/proto`
somewhere unobtrusive.

## Hard constraints

- Files: `src/proto/<id>/index.tsx` (default-export a component) plus any
  `.css`/`.tsx` files **inside that folder only**. Touch nothing else.
- **Scope all CSS** under a root class on your outermost element
  (`.proto-<id>`). Your root element sets its own background, color and
  min-height: 100dvh; the app's stylesheets are NOT loaded on this route,
  the body is unstyled. Include a small reset inside your scope.
- No new dependencies. React 18 + plain CSS. Inline SVG is encouraged;
  canvas is fine for ambient effects. Google Fonts are allowed: inject one
  `<link>` in a `useEffect` and remove it on unmount.
- Must pass `npm run build` (tsc with `noUnusedLocals`/`noUnusedParameters`,
  strict). Run it before you finish. `npm test` must still pass (you are
  not touching tested code, but check).
- Mobile-first at **390px**, and it must also look intentional at 1280px —
  not a phone column floating in a void.
- Light and dark: either respect `prefers-color-scheme` or ship your own
  toggle; both modes must be legible. Respect `prefers-reduced-motion`.
- Keyboard-reachable controls, real `<button>`s, visible focus, text
  contrast ≥ 4.5:1 for body text.
- Keep it to roughly 600–1100 lines total. Prototype, not product.

## Art direction fidelity

Your direction is specified in your task. Commit to it hard. The failure
mode is "the same card UI with a different palette" — if a screenshot of
your prototype could be mistaken for any of the other three directions, it
has failed. Layout, shapes, type, motion and metaphor must all carry it.
