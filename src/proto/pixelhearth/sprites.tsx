/**
 * Pixel sprites for PIXELHEARTH. Every sprite is a string "bitmap": one char
 * per pixel, mapped to a CSS variable so the same rects recolor for day/night.
 * Rendered as SVG <rect>s with crispEdges — no images, no blur.
 */
import type { ReactNode } from 'react'

type Palette = Record<string, string>

const PAL: Palette = {
  y: 'var(--candle)', o: 'var(--ember)', r: 'var(--flame)', w: 'var(--wood)', W: 'var(--wood2)',
  g: 'var(--sage)', G: 'var(--sage2)', p: 'var(--rose)', k: 'var(--ink)', d: 'var(--bg2)',
  b: 'var(--brick)', c: 'var(--hi)', s: 'var(--sky)', m: 'var(--mail)', n: 'var(--wall2)',
}

/** Turn rows of chars into rects. '.' is transparent. */
export function px(rows: string[], x = 0, y = 0, pal: Palette = PAL): ReactNode[] {
  const out: ReactNode[] = []
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx]
      if (ch === '.') continue
      out.push(<rect key={`${rx}-${ry}`} x={x + rx} y={y + ry} width={1} height={1} fill={pal[ch] ?? pal.k} />)
    }
  })
  return out
}

/* ---------- sprites ---------- */

const FLAME: string[][] = [
  ['...y....', '..yy....', '..yyo...', '.yooo...', '.yoooo..', 'yoorro..', 'yorrrro.', '.orrro..'],
  ['....y...', '...yy...', '..yyy...', '..yooo..', '.yoooo..', '.yorro..', 'yorrrro.', '.orrro..'],
  ['..y.....', '..yy..y.', '.yyoo.y.', '.yooooo.', 'yooooo..', 'yoorro..', '.orrrro.', '.orrro..'],
  ['.....y..', '..y.yy..', '..yyyo..', '.yyooo..', '.yoooo..', 'yooorr..', 'yorrrro.', '.orrro..'],
]

const CAT: string[][] = [
  ['.k...k..', '.kk.kk..', '.kkkkk..', '.kckck..', '.kkkkk..', 'kkkkkk.k', 'kkkkkkkk', '.k.kk.k.'],
  ['.k...k..', '.kk.kk..', '.kkkkk..', '.kckck..', '.kkkkk..', 'kkkkkkk.', 'kkkkkk.k', 'k.kk..k.'],
]

const PLANT = ['..g.g...', '.ggGgg..', 'gGgGgGg.', '.gGgGg..', '...G....', '.ppppp..', '.pppp...', '..ppp...']
const WILTED = ['........', '........', '.G.....G', '..G...G.', '...GGG..', '.ppppp..', '.pppp...', '..ppp...']
const PIGGY = ['..pppp..', '.pppppp.', 'ppkpppp.', 'pppppppp', '.pppppp.', '..p..p..', '........', '........']
const FRAME = ['wwwwwwww', 'wssssssw', 'wsgGGgsw', 'wsGGGGsw', 'wyGGGGyw', 'wssssssw', 'wwwwwwww', '...ww...']
const MAILBOX = ['..mmmm..', '.mmmmmm.', '.mckkcm.', '.mmmmmm.', '....w...', '....w...', '....w...', '...www..']
const SPARKLE = [['..c..', '.....', 'c.c.c', '.....', '..c..'], ['.....', '..c..', '.ccc.', '..c..', '.....']]
const ENVELOPE = ['cccccccccc', 'ck......kc', 'c.k....k.c', 'c..k..k..c', 'c.k.kk.k.c', 'ck......kc', 'cccccccccc']
const CHEST = ['.wwwwwwww.', 'wWWWWWWWWw', 'wwwwwwwwww', 'wWWWyyWWWw', 'wWWWyyWWWw', 'wwwwwwwwww']

export const ICONS: Record<string, string[]> = {
  house: ['...kk...', '..kkkk..', '.kkkkkk.', 'kkkkkkkk', '.kk..kk.', '.kk.kkk.', '.kk.kkk.', '.kkkkkk.'],
  map: ['kkkkkkkk', 'k.k....k', 'k.kk...k', 'k..kk..k', 'k...kk.k', 'k....k.k', 'k......k', 'kkkkkkkk'],
  mail: ['........', 'kkkkkkkk', 'kk....kk', 'k.k..k.k', 'k..kk..k', 'k......k', 'kkkkkkkk', '........'],
  bag: ['..kkkk..', '.k....k.', 'kkkkkkkk', 'k......k', 'k.k..k.k', 'k......k', 'k......k', 'kkkkkkkk'],
}

/** Small standalone sprite (icons, envelopes, chest). */
export function Sprite({ rows, size = 8, className }: { rows: string[]; size?: number; className?: string }) {
  const w = rows[0].length
  const h = rows.length
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} width={size * (w / h)} height={size} aria-hidden="true" shapeRendering="crispEdges">
      {px(rows)}
    </svg>
  )
}
export const Envelope = ({ size = 40, className }: { size?: number; className?: string }) => <Sprite rows={ENVELOPE} size={size} className={className} />
export const Chest = ({ size = 32 }: { size?: number }) => <Sprite rows={CHEST} size={size} />

/* ---------- the room ---------- */

export interface RoomObject {
  id: string
  kind: 'plant' | 'wilted' | 'piggy' | 'frame' | 'mailbox'
  x: number
  y: number
  state: 'paid' | 'due_soon' | 'upcoming' | 'late' | 'estimated'
  bubble?: string
}

/** Speech bubble that bobs in 2 frames. Text is ~1 pixel-unit per char. */
/* The bobbing animation sets a CSS transform, which would override an SVG
 * transform attribute on the same element — so position on an outer group
 * and animate the inner one. x is clamped so the bubble stays in the room. */
function Bubble({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 3.2 + 4
  const bx = Math.max(1, Math.min(x, 160 - w - 1))
  const tail = Math.max(2, Math.min(x - bx + 2, w - 4))
  return (
    <g transform={`translate(${bx} ${Math.max(1, y)})`}>
      <g className="ph-bubble">
        <rect x={0} y={0} width={w} height={8} fill="var(--hi)" />
        <rect x={0} y={0} width={w} height={8} fill="none" stroke="var(--bg2)" strokeWidth={1} />
        <rect x={tail} y={8} width={2} height={2} fill="var(--hi)" />
        <text x={2} y={6.3} fontSize={6.2} fontFamily="'VT323', monospace" fill="var(--bg2)">{text}</text>
      </g>
    </g>
  )
}

function Twinkle({ x, y }: { x: number; y: number }) {
  return (
    <g className="ph-twinkle" transform={`translate(${x} ${y})`}>
      <g className="ph-f0">{px(SPARKLE[0])}</g>
      <g className="ph-f1">{px(SPARKLE[1])}</g>
    </g>
  )
}

/** level 0..1 → the 8×8 sprite is scaled to fill the 24×30 firebox: ~0 is a
 *  low ember on the grate, ~0.6 a warm fire, 1.0 roaring to the lintel. */
function Flame({ level }: { level: number }) {
  const sx = 1.2 + 1.8 * level // 1.2 → 3.0 (width 10 → 24)
  const sy = (5 + 23 * level) / 8 // height 5 → 28
  return (
    <g className="ph-flame" transform={`translate(${80 - 4 * sx} ${74 - 8 * sy}) scale(${sx} ${sy})`}>
      {FLAME.map((f, i) => (
        <g key={i} className={`ph-fl ph-fl${i}`}>{px(f)}</g>
      ))}
    </g>
  )
}

function Cat() {
  return (
    <g className="ph-cat">
      <g className="ph-cat-body">
        <g className="ph-f0">{px(CAT[0])}</g>
        <g className="ph-f1">{px(CAT[1])}</g>
      </g>
    </g>
  )
}

export function Room({ level, objects, mailCount, night }: { level: number; objects: RoomObject[]; mailCount: number; night: boolean }) {
  return (
    <svg className="ph-room" viewBox="0 0 160 128" shapeRendering="crispEdges" role="img" aria-label="Your room: a fireplace whose flame shows your breathing room, and your bills as furniture.">
      <defs>
        <pattern id="phDither" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill="var(--wall2)" />
          <rect x="1" y="1" width="1" height="1" fill="var(--wall2)" />
        </pattern>
        <pattern id="phPlank" width="16" height="8" patternUnits="userSpaceOnUse">
          <rect width="16" height="8" fill="var(--floor)" />
          <rect width="16" height="1" fill="var(--floor2)" />
          <rect x="7" y="1" width="1" height="7" fill="var(--floor2)" />
        </pattern>
        <pattern id="phSkyDither" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect x="1" y="1" width="1" height="1" fill="var(--hi)" fillOpacity="0.18" />
        </pattern>
      </defs>
      {/* wall + floor */}
      <rect width="160" height="80" fill="var(--wall)" />
      <rect y="40" width="160" height="40" fill="url(#phDither)" />
      <rect y="80" width="160" height="48" fill="url(#phPlank)" />
      <rect y="78" width="160" height="2" fill="var(--wood)" />
      {/* window */}
      <g transform="translate(16 14)">
        <rect x="-2" y="-2" width="36" height="32" fill="var(--wood)" />
        <rect width="32" height="28" fill="var(--sky)" />
        <rect y="14" width="32" height="14" fill="url(#phSkyDither)" />
        {night ? px(['..c.....c.......', '......c.....c...', '.c.........c....', '....c..c........'], 2, 2) : px(['....cccc....', '...cccccc...', '....cccc....'], 4, 3)}
        <rect x="15" width="2" height="28" fill="var(--wood)" />
        <rect y="13" width="32" height="2" fill="var(--wood)" />
      </g>
      {/* fireplace */}
      <g transform="translate(60 30)">
        <rect width="40" height="50" fill="var(--brick)" />
        <rect x="2" y="2" width="36" height="46" fill="url(#phDither)" opacity="0.5" />
        <rect x="-2" y="-2" width="44" height="4" fill="var(--wood)" />
        <rect x="8" y="14" width="24" height="34" fill="var(--bg2)" />
        <rect x="10" y="44" width="20" height="3" fill="var(--wood2)" />
      </g>
      <Flame level={level} />
      {/* shelf */}
      <rect x="112" y="46" width="40" height="2" fill="var(--wood2)" />
      {/* furniture objects */}
      {objects.map((o) => {
        const rows = o.kind === 'plant' ? PLANT : o.kind === 'wilted' ? WILTED : o.kind === 'piggy' ? PIGGY : o.kind === 'frame' ? FRAME : MAILBOX
        return (
          <g key={o.id} className={`ph-obj ph-obj-${o.state}`}>
            <g className={o.state === 'estimated' ? 'ph-ghost' : undefined}>{px(rows, o.x, o.y)}</g>
            {o.state === 'paid' && <Twinkle x={o.x + 6} y={o.y - 5} />}
            {o.bubble && <Bubble x={o.x + 4} y={o.y - 12} text={o.bubble} />}
            {o.kind === 'mailbox' && mailCount > 0 && (
              <g transform={`translate(${o.x + 7} ${o.y - 3})`}>
                <rect width="5" height="5" fill="var(--candle)" />
                <text x={1} y={4.4} fontSize={5} fontFamily="'VT323', monospace" fill="var(--bg2)">{mailCount}</text>
              </g>
            )}
          </g>
        )
      })}
      {/* rug */}
      <rect x="56" y="100" width="48" height="16" fill="var(--rose)" />
      <rect x="58" y="102" width="44" height="12" fill="url(#phDither)" opacity="0.4" />
      <Cat />
    </svg>
  )
}
