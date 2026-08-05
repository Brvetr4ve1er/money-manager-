/**
 * THE MECHANICAL ACCESSIBILITY WALK, shared by the app suite and the poster
 * suite.
 *
 * It lived inside src/App.test.tsx, which meant it ran at thirteen stations of
 * the app and zero stations of the landing — the first screen a stranger meets.
 * The eight checks below all pass on the landing today; that is the reason to
 * commit the guard rather than a reason not to. Nothing failed when a second h1
 * arrived in `.lp-object`, when the poster and the aria-hidden product shot
 * collided on an id, when a renamed heading stranded an aria-labelledby, or
 * when a control landed inside `.lp-shot-frame`, because nothing was looking.
 *
 * WHY IT IS NOT IN src/. `scripts/census/inputs.ts` hashes ALL of src/ (minus
 * `*.test.ts(x)` and ambient declarations) as a pixel input, on the sentence
 * "every file that can change a pixel". This file changes none, and putting it
 * in src/ would make every edit to a test walker read as a visual change and
 * demand a census re-run — the exact failure that header names when it keeps
 * chrome.ts, serve.ts, png.ts and run.ts out. Test-only, zero runtime
 * dependencies, jsdom `document` and nothing else.
 *
 * WHAT `audit()` CHECKS AND WHY EACH ONE IS A REAL FAILURE, NOT A LINT:
 *
 *  · one h1. Two page titles, or none, and the outline has no root.
 *  · no duplicate id. getElementById returns the first, so a duplicate silently
 *    re-points every aria-labelledby, every label[for] and every fragment link
 *    that names it at whichever copy rendered first.
 *  · every aria-labelledby / aria-describedby IDREF resolves. A dangling one is
 *    not a degraded name, it is NO name: the attribute suppresses the fallback.
 *  · every aria-controls resolves OR its owner reports aria-expanded="false".
 *    That is the rule this app actually holds rather than an exemption carved
 *    for it: a collapsed disclosure\'s target is legitimately unmounted (see
 *    HeroCard\'s drawer), and anything else pointing at nothing is the failure
 *    HeroShell\'s nav comment names — an anchor left behind by a deleted card.
 *  · every in-page href="#…" resolves AND its target can take focus. A fragment
 *    link to a node with no tabindex scrolls and leaves focus on <body>, so the
 *    next Tab restarts at the top of the document. Chrome papers over it with
 *    the sequential-focus navigation starting point; Safari/VoiceOver do not.
 *  · nothing tabbable inside aria-hidden. That is a keyboard trap with no
 *    accessible name — the constraint Landing.tsx\'s product shot is built
 *    around, and now checked on the poster that states it.
 *  · every tabbable control has a non-empty accessible name.
 *  · heading levels never skip on the way down.
 */

export const TABBABLE_SEL = 'a[href], button, input, select, textarea, [tabindex]'

/** Elements a Tab press can reach. tabindex="-1" is excluded deliberately: it
    is the app's own focus-handoff mechanism (<main>, the card sections), not a
    tab stop, and aria-hidden over one is not a trap. */
export const tabbable = (): HTMLElement[] =>
  ([...document.querySelectorAll(TABBABLE_SEL)] as HTMLElement[]).filter(
    (el) => el.getAttribute('tabindex') !== '-1' && !el.hasAttribute('disabled'),
  )

/**
 * A deliberately CONSERVATIVE accessible-name computation — aria-label, then
 * aria-labelledby, then the native label association, then the element's own
 * text. It is not the full accname algorithm (no dependency exists for that
 * here, and adding one is a dependency change), so it can only ever be wrong in
 * the safe direction: it may name something a browser would not, never the
 * reverse. An empty return is therefore evidence, not a guess.
 */
export function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label')
  if (label !== null && label.trim() !== '') return label.trim()
  const by = el.getAttribute('aria-labelledby')
  if (by !== null) {
    const text = by
      .trim()
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim()
    if (text !== '') return text
  }
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    const wrapping = el.closest('label')
    if (wrapping !== null && (wrapping.textContent ?? '').trim() !== '') {
      return wrapping.textContent!.trim()
    }
    if (el.id !== '') {
      const associated = document.querySelector(`label[for="${el.id}"]`)
      if (associated !== null) return (associated.textContent ?? '').trim()
    }
    return ''
  }
  return (el.textContent ?? '').trim()
}

/** Every mechanical failure the document currently holds, each stamped with the
    station it was found at. An empty array is the passing state. */
export function audit(station: string): string[] {
  const found: string[] = []
  const fail = (what: string) => found.push(`${station}: ${what}`)

  const h1s = document.querySelectorAll('h1')
  if (h1s.length !== 1) fail(`${h1s.length} h1 elements, expected 1`)

  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id)
  for (const dup of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
    fail(`duplicate id "${dup}"`)
  }

  for (const attr of ['aria-labelledby', 'aria-describedby']) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      for (const ref of el.getAttribute(attr)!.trim().split(/\s+/)) {
        if (document.getElementById(ref) === null) {
          fail(`${attr}="${ref}" resolves to nothing (<${el.tagName.toLowerCase()}>)`)
        }
      }
    }
  }
  for (const el of document.querySelectorAll('[aria-controls]')) {
    const ref = el.getAttribute('aria-controls')!
    if (document.getElementById(ref) === null && el.getAttribute('aria-expanded') !== 'false') {
      fail(`aria-controls="${ref}" resolves to nothing and is not collapsed`)
    }
  }
  for (const a of document.querySelectorAll('a[href^="#"]')) {
    const id = a.getAttribute('href')!.slice(1)
    if (id === '') continue
    const target = document.getElementById(id)
    if (target === null) {
      fail(`in-page link #${id} points at nothing`)
      continue
    }
    const nativelyFocusable = /^(a|button|input|select|textarea)$/i.test(target.tagName)
    if (!nativelyFocusable && target.getAttribute('tabindex') === null) {
      fail(`in-page link #${id} points at a node that cannot take focus`)
    }
  }
  for (const el of tabbable()) {
    if (el.closest('[aria-hidden="true"]') !== null) {
      fail(`tabbable <${el.tagName.toLowerCase()}> inside aria-hidden`)
    }
    if (accessibleName(el) === '') {
      fail(`unnamed tabbable <${el.tagName.toLowerCase()} class="${el.className}">`)
    }
  }
  let previous = 0
  for (const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const level = Number(h.tagName[1])
    if (previous !== 0 && level > previous + 1) {
      fail(`heading skips h${previous} -> h${level} ("${h.textContent?.slice(0, 30)}")`)
    }
    previous = level
  }
  return found
}
