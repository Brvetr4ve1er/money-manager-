/**
 * The page's single h1, stacked (§1 trait 03: wordmarks compress vertically
 * into bricks, never horizontally into lines). Split 3/2 and set to a common
 * measure so the two rows carry equal optical mass — the §4 row rule, applied
 * to the display lockup.
 *
 * WHY THIS IS A COMPONENT AND NOT MARKUP IN TWO PLACES. The app shell
 * (HeroShell) and the cold-start landing (Landing) are MUTUALLY EXCLUSIVE
 * renders — see Root.tsx — and each has to own the page's one and only h1
 * (App.test "page heading structure": exactly one level-1 heading whose
 * textContent is 'Ember'). Two hand-written copies of that markup is two
 * chances for one of them to drift; one component means the assertion holds
 * for whichever surface is on screen.
 *
 * Split once at module scope: the word never changes, and re-splitting per
 * render would remount the spans and restart the entrance on every state
 * change. The rows concatenate to exactly "Ember" — the uppercase is a
 * text-transform, never a different string.
 */

const WORDMARK_ROWS = [
  ['E', 'm', 'b'],
  ['e', 'r'],
]

export function Wordmark({
  className,
  /**
   * THE STACK (§9 move 1), row half: each row drops in 70ms after the one
   * above it, starting at this offset. Omit it entirely and the rows carry no
   * animation at all — a surface that does not run the entrance must not be
   * forced to declare a delay for one.
   */
  riseFrom,
}: {
  className?: string
  riseFrom?: number
}) {
  return (
    /* aria-label carries the name whole; the rows and letters are aria-hidden
       so a screen reader never spells E-m-b / e-r. */
    <h1 className={className === undefined ? 'wordmark' : `wordmark ${className}`} aria-label="Ember">
      {WORDMARK_ROWS.map((row, r) => (
        <span
          className={riseFrom === undefined ? 'wm-row' : 'wm-row hero-rise'}
          key={r}
          aria-hidden="true"
          // Per-element data, not style — which is why it is inline.
          style={riseFrom === undefined ? undefined : { animationDelay: `${riseFrom + r * 70}ms` }}
        >
          {row.map((ch, i) => (
            <span className="wm-letter" key={i}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </h1>
  )
}
