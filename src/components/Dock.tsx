import { hrefFor, type Route } from '../routes/router.ts'

const ITEMS: Array<{ route: Route; label: string; icon: string }> = [
  { route: 'home', label: 'Home', icon: 'M12 3c-4 6-7 9-7 13a7 7 0 0 0 14 0c0-4-3-7-7-13z' },
  { route: 'runway', label: 'Runway', icon: 'M3 17c4-9 6 1 9-4s5 1 9-7' },
  { route: 'jars', label: 'Jars', icon: 'M7 4h10M8 4v2a4 4 0 0 1-2 3.5V19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9.5A4 4 0 0 1 16 6V4' },
  { route: 'learn', label: 'Learn', icon: 'M4 6l8-3 8 3-8 3zM6 8v6c3 2 9 2 12 0V8' },
  { route: 'me', label: 'Me', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6' },
]

/**
 * The room switcher: a floating glass dock on phones, a left rail at desktop
 * widths (app.css). Plain links, so it works with keyboard, middle-click and
 * no JS routing quirks; aria-current names the room you are in.
 */
export function Dock({ route, badges }: { route: Route; badges?: Partial<Record<Route, number>> }) {
  return (
    <nav className="dock" aria-label="Rooms">
      {ITEMS.map((it) => {
        const n = badges?.[it.route] ?? 0
        return (
          <a
            key={it.route}
            href={hrefFor(it.route)}
            className={`dock-btn${route === it.route ? ' is-on' : ''}`}
            aria-current={route === it.route ? 'page' : undefined}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={it.icon} />
            </svg>
            <span className="dock-label">{it.label}</span>
            {n > 0 && (
              <span className="dock-badge" aria-label={`${n} waiting`}>
                {n}
              </span>
            )}
          </a>
        )
      })}
    </nav>
  )
}
