/**
 * Hash router for the UI prototypes. `#/proto` lists them, `#/proto/<id>`
 * renders one. Lives beside the real app, never inside it: main.tsx picks
 * this shell only when the hash starts with #/proto, so the app's global
 * styles are not loaded and each prototype owns the whole viewport.
 */

import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from 'react'

export interface ProtoEntry {
  id: string
  name: string
  blurb: string
  Component: LazyExoticComponent<ComponentType>
}

export const PROTOS: ProtoEntry[] = [
  { id: 'hearth', name: 'Hearth', blurb: 'Warm futurism — your home at dusk; obligations are lanterns that glow when paid.', Component: lazy(() => import('./hearth/index.tsx')) },
  { id: 'pixelhearth', name: 'Pixelhearth', blurb: '16-bit cozy game — a tile room, a pet, a chunky dialog box for a UI.', Component: lazy(() => import('./pixelhearth/index.tsx')) },
  { id: 'obsidian', name: 'Obsidian', blurb: 'Dark sci-fi HUD — a ship console; breathing room is a reactor gauge.', Component: lazy(() => import('./obsidian/index.tsx')) },
  { id: 'clay', name: 'Clay', blurb: 'Soft 3D toy — a shelf of squishy objects; coins are physical, bills are boxes.', Component: lazy(() => import('./clay/index.tsx')) },
]

export function isProtoHash(hash = window.location.hash): boolean {
  return hash.startsWith('#/proto')
}

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

const pickerStyle: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  maxWidth: 560,
  margin: '0 auto',
  padding: '32px 16px',
  lineHeight: 1.5,
}

export function ProtoShell() {
  const hash = useHash()
  const id = hash.replace(/^#\/proto\/?/, '').split(/[/?]/)[0]
  const entry = PROTOS.find((p) => p.id === id)

  if (!entry) {
    return (
      <main style={pickerStyle}>
        <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Ember — UI prototypes</h1>
        <p style={{ margin: '0 0 24px', opacity: 0.7 }}>
          Four art directions, one fixture. Pick one; the app itself is at <a href="#">/</a>.
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {PROTOS.map((p) => (
            <li key={p.id}>
              <a
                href={`#/proto/${p.id}`}
                style={{
                  display: 'block',
                  padding: '14px 16px',
                  border: '1px solid currentColor',
                  borderRadius: 10,
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <strong>{p.name}</strong>
                <div style={{ fontSize: 14, opacity: 0.75 }}>{p.blurb}</div>
              </a>
            </li>
          ))}
        </ul>
      </main>
    )
  }

  const { Component } = entry
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'system-ui' }}>Loading {entry.name}…</div>}>
      <Component />
    </Suspense>
  )
}
