/**
 * Hash router for the app's five rooms. `#/proto…` is handled before the app
 * mounts (main.tsx); anything else that is not a known route — including a
 * bare `#` or an old in-page anchor like `#log` — lands on Home, so no link
 * can strand the user on a blank screen.
 */

import { useEffect, useState } from 'react'

export const ROUTES = ['home', 'runway', 'jars', 'learn', 'me'] as const
export type Route = (typeof ROUTES)[number]

export function parseRoute(hash: string): Route {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return (ROUTES as ReadonlyArray<string>).includes(id) ? (id as Route) : 'home'
}

export function hrefFor(route: Route): string {
  return `#/${route}`
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  // A room change starts at the top of the new room — keeping the old scroll
  // offset lands the user mid-page in a screen they have not seen yet.
  useEffect(() => {
    window.scrollTo?.(0, 0)
  }, [route])
  return route
}
