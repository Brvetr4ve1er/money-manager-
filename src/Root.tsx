/**
 * THE COLD-START GATE.
 *
 * A first-time visitor gets the marketing surface; everyone who has run Ember
 * before gets straight into the app. One page, one bundle, no router, no
 * second entry point — and no new dependency, which a router would have been.
 *
 * WHY THIS IS A GATE AND NOT A LANDING PAGE THE APP LINKS TO.
 * The thing that used to greet a stranger was the app shell showing a live
 * health readout of the DEMO profile. A fabricated score presented as fact is
 * exactly what Trust Rule 5 (honest cold start) forbids, and it was also weak
 * marketing: the number means nothing to someone who has logged nothing. Gating
 * on "has this browser ever run Ember" fixes both at once — a stranger never
 * sees a demo score, and a returning user never sees the pitch again.
 *
 * THREE INVARIANTS THIS FILE EXISTS TO HOLD:
 *
 *   MUTUALLY EXCLUSIVE RENDERS. Landing and App are never both mounted. Each
 *   owns the page's single h1 while it is the one on screen (App.test asserts
 *   exactly one level-1 heading reading 'Ember'), and both take it from the
 *   same <Wordmark>. An overlay stacked above the app shell would have put two
 *   h1s in the tree.
 *
 *   THE APP MOUNTS ONCE AND STAYS. App's two role="status" live regions must be
 *   permanently mounted — most screen readers only announce text CHANGES inside
 *   an existing region. So the gate dismisses INTO the app and there is no path
 *   back out: `entered` only ever goes false → true. A "back to the landing"
 *   link would unmount those regions and silence every subsequent announcement,
 *   which is why this surface has no such link (Trust Rule 8).
 *
 *   ONE-WAY, AND PERSISTED BY THE APP ITSELF. Nothing here writes storage.
 *   App's save effect writes the state key on mount, so entering once is what
 *   makes hasSavedState() true on the next load. The gate needs no flag of its
 *   own, and a user who never entered has nothing written about them.
 *
 * NOT tested via App.test: every test in that file renders <App /> directly and
 * clears localStorage first, so the gate cannot change their behaviour. Root's
 * own behaviour is covered in Root.test.tsx.
 */

import { useEffect, useRef, useState } from 'react'
import App from './App.tsx'
import { Landing } from './components/Landing.tsx'
import { hasSavedState } from './state/store.ts'
import './styles/tokens.css'
import './styles/landing.css'

export function Root() {
  // Read once, in the initialiser: re-reading storage on every render would
  // let a peer tab's write flip this mid-session and remount the app.
  const [entered, setEntered] = useState(hasSavedState)
  // Distinguishes "arrived already entered" (a returning user, focus belongs
  // wherever the browser put it) from "just crossed the gate" (focus has to be
  // moved, because the element that had it no longer exists).
  const crossed = useRef(false)
  const main = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!crossed.current) return
    crossed.current = false
    // The button the user pressed was unmounted with the landing, so focus
    // fell to <body> and a keyboard user would be tabbing from the top of the
    // document with no idea the page changed. Move it to the app's <main>,
    // which carries tabIndex={-1} for exactly this (see App.tsx). preventScroll
    // keeps the app at its natural top instead of jumping to the landmark.
    main.current?.focus({ preventScroll: true })
  }, [entered])

  if (!entered) {
    return (
      <Landing
        onEnter={() => {
          crossed.current = true
          setEntered(true)
        }}
      />
    )
  }
  return <App mainRef={main} />
}
