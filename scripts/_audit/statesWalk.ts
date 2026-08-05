/* AUDIT-ONLY. Forces :hover / :focus-visible / :active and measures the
   resulting non-text indicators against what they are drawn on. */
import { readFileSync } from 'node:fs'
import { launchChrome } from '../census/chrome.ts'
import { serveProductionBuild } from '../census/serve.ts'
import { CENSUS_EPOCH_MS, CENSUS_LOCALE, CENSUS_TIMEZONE, determinismScript } from '../census/determinism.ts'
import { REPO_ROOT } from '../census/inputs.ts'

const HELPERS = `
window.__a = (() => {
  const parse = (c) => {
    let m = /rgba?\\(([^)]+)\\)/.exec(c)
    if (m) { const p = m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number)
      return { r:p[0], g:p[1], b:p[2], a: p.length>3 ? p[3] : 1 } }
    m = /color\\(\\s*srgb\\s+([^)]+)\\)/.exec(c)
    if (m) { const p = m[1].split(/[\\s\\/]+/).filter(Boolean).map(Number)
      return { r:p[0]*255, g:p[1]*255, b:p[2]*255, a: p.length>3 ? p[3] : 1 } }
    if (c === 'transparent') return { r:0,g:0,b:0,a:0 }
    return null }
  const over = (f,b) => ({ r:f.r*f.a+b.r*(1-f.a), g:f.g*f.a+b.g*(1-f.a), b:f.b*f.a+b.b*(1-f.a), a:1 })
  const lum = (c) => { const f=(v)=>{v/=255; return v<=0.04045? v/12.92 : Math.pow((v+0.055)/1.055,2.4)};
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b) }
  const ratio=(a,b)=>{const l1=lum(a),l2=lum(b),hi=Math.max(l1,l2),lo=Math.min(l1,l2);return (hi+0.05)/(lo+0.05)}
  const bgOf=(el)=>{let acc=null,n=el;while(n){const c=parse(getComputedStyle(n).backgroundColor);
    if(c&&c.a>0){acc=acc===null?c:over(acc,c); if(acc.a>=0.999) return acc}
    n=n.parentElement}
    const c=parse(getComputedStyle(document.documentElement).backgroundColor); return acc&&c?over(acc,c):(acc||c||{r:255,g:255,b:255,a:1})}
  const focusables=()=>[...document.querySelectorAll('a[href],button,input,select,textarea')]
    .filter(e=>{const cs=getComputedStyle(e); if(cs.visibility==='hidden')return false; if(e.getClientRects().length===0)return false; if(e.closest('.sr-only'))return false; if(e.closest('[aria-hidden="true"]'))return false; let n=e; while(n){if(getComputedStyle(n).display==='none')return false; n=n.parentElement} return true})
  return { parse, over, lum, ratio, bgOf, focusables }
})()
`

// For the element currently forced into a state, report ring/outline/border vs
// (a) the element's own fill and (b) the fill of what is OUTSIDE it.
const PROBE = (idx: number) => `(() => { try {
  const A = window.__a
  const el = A.focusables()[${idx}]
  if (!el) return JSON.stringify(null)
  const cs = getComputedStyle(el)
  const own = A.bgOf(el)
  const outside = el.parentElement ? A.bgOf(el.parentElement) : own
  const px = (s) => parseFloat(s) || 0
  const out = { tag: el.tagName, cls: String(el.className), text: (el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,28),
    rect: (() => { const r = el.getBoundingClientRect(); const lab = el.closest('label'); const lr = lab && lab !== el ? lab.getBoundingClientRect() : null;
      return { w: Math.round(r.width), h: Math.round(r.height), lw: lr?Math.round(lr.width):0, lh: lr?Math.round(lr.height):0 } })(),
    fg: cs.color, bgOwn: own, bgOutside: outside,
    outlineW: px(cs.outlineWidth), outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, outlineOffset: px(cs.outlineOffset),
    borderColor: cs.borderTopColor, borderW: px(cs.borderTopWidth), borderStyle: cs.borderTopStyle, bgColor: cs.backgroundColor,
    textRatio: Math.round(A.ratio(A.parse(cs.color).a<1 ? A.over(A.parse(cs.color), own) : A.parse(cs.color), own)*100)/100,
    fontSize: px(cs.fontSize), fontWeight: Number(cs.fontWeight)||400 }
  if (out.outlineW > 0 && out.outlineStyle !== 'none') {
    const oc = A.parse(out.outlineColor)
    const eff = oc.a < 1 ? A.over(oc, outside) : oc
    // With a positive offset the ring is drawn over what is OUTSIDE the box;
    // with a negative one, over the element's own fill.
    const on = out.outlineOffset >= 0 ? outside : own
    out.ringRatio = Math.round(A.ratio(eff, on)*100)/100
    out.ringOn = out.outlineOffset >= 0 ? 'outside' : 'own'
  }
  if (out.borderW > 0 && out.borderStyle !== 'none') {
    const bc = A.parse(out.borderColor)
    out.borderVsOwn = Math.round(A.ratio(bc, own)*100)/100
    out.borderVsOutside = Math.round(A.ratio(bc, outside)*100)/100
  }
  out.bgOwn = 'rgb('+Math.round(own.r)+','+Math.round(own.g)+','+Math.round(own.b)+')'
  out.bgOutside = 'rgb('+Math.round(outside.r)+','+Math.round(outside.g)+','+Math.round(outside.b)+')'
  return JSON.stringify(out)
} catch (e) { return JSON.stringify({ err: String(e && e.message || e) }) } })()`

const COUNT = `JSON.stringify(window.__a.focusables().length)`
const NODEIDS = `(() => JSON.stringify(window.__a.focusables().map((e,i)=>i)))()`

const FIX = (n: string) => readFileSync(new URL(`scripts/census/fixtures/${n}.json`, REPO_ROOT), 'utf8').trim()

async function main() {
  const served = await serveProductionBuild()
  const browser = await launchChrome()
  const cdp = browser.cdp
  const rows = [
    { id: 'landing.375.light', w: 375, theme: 'light' as const, state: null as string | null },
    { id: 'landing.375.dark', w: 375, theme: 'dark' as const, state: null as string | null },
    { id: 'landing.1440.light', w: 1440, theme: 'light' as const, state: null as string | null },
    { id: 'landing.1440.dark', w: 1440, theme: 'dark' as const, state: null as string | null },
    { id: 'day0.375.light', w: 375, theme: 'light' as const, state: 'day0' },
    { id: 'day0.375.dark', w: 375, theme: 'dark' as const, state: 'day0' },
    { id: 'day0.1440.light', w: 1440, theme: 'light' as const, state: 'day0' },
    { id: 'day0.1440.dark', w: 1440, theme: 'dark' as const, state: 'day0' },
    { id: 'seeded.375.light', w: 375, theme: 'light' as const, state: 'seeded' },
    { id: 'seeded.375.dark', w: 375, theme: 'dark' as const, state: 'seeded' },
  ]
  for (const row of rows) {
    const { targetId } = await cdp.send<{targetId:string}>('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send<{sessionId:string}>('Target.attachToTarget', { targetId, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('DOM.enable', {}, sessionId)
    await cdp.send('CSS.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: row.w, height: 812, deviceScaleFactor: 1, mobile: row.w < 768 }, sessionId)
    await cdp.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-color-scheme', value: row.theme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]}, sessionId)
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: CENSUS_TIMEZONE }, sessionId)
    await cdp.send('Emulation.setLocaleOverride', { locale: CENSUS_LOCALE }, sessionId)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: determinismScript({ epochMs: CENSUS_EPOCH_MS, storageJson: row.state ? FIX(row.state) : null }) }, sessionId)
    const loaded = cdp.once('Page.loadEventFired', sessionId)
    await cdp.send('Page.navigate', { url: `${served.origin}/` }, sessionId)
    await loaded
    await new Promise(r => setTimeout(r, 3000))
    const ev = async (expr: string) => {
      const res = await cdp.send<any>('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)
      if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0,400))
      return JSON.parse(res.result.value ?? 'null')
    }
    await ev(HELPERS + ';1')
    const n: number = await ev(COUNT)
    console.log(`\n=== ${row.id}  (${n} focusables) ===`)
    const { root } = await cdp.send<any>('DOM.getDocument', { depth: -1, pierce: true }, sessionId)
    // Map index -> backendNodeId via a JS handle round trip
    for (let i = 0; i < n; i++) {
      // resolve the node
      const res = await cdp.send<any>('Runtime.evaluate', { expression: `window.__a.focusables()[${i}]` }, sessionId)
      const objectId = res.result.objectId
      const { node } = await cdp.send<any>('DOM.describeNode', { objectId }, sessionId)
      const nodeId = (await cdp.send<any>('DOM.requestNode', { objectId }, sessionId)).nodeId
      for (const states of [[], ['hover'], ['focus', 'focus-visible'], ['active']]) {
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: states }, sessionId)
        const p = await ev(PROBE(i))
        if (!p) continue
        if (p.err) { console.log('  probe error', i, p.err); continue }
        const label = states.length ? states.join('+') : 'rest'
        const problems: string[] = []
        if (p.textRatio && p.text) {
          const large = p.fontSize >= 24 || (p.fontSize >= 18.66 && p.fontWeight >= 700)
          const need = large ? 3 : 4.5
          if (p.textRatio < need) problems.push(`TEXT ${p.textRatio} < ${need}`)
        }
        if (label.includes('focus') && (!p.ringRatio || p.ringRatio < 3)) problems.push(`FOCUS RING ${p.ringRatio ?? 'none'} on ${p.ringOn ?? '-'}`)
        if (label === 'hover' && p.outlineW > 0 && p.ringRatio !== undefined && p.ringRatio < 3) problems.push(`HOVER RING ${p.ringRatio}`)
        if (label === 'rest' && p.borderW > 0 && Math.max(p.borderVsOwn ?? 0, p.borderVsOutside ?? 0) < 3 && Number(p.bgColor && 0) === 0) {
          // only flag when the fill itself also has no offset
          problems.push(`BORDER ${p.borderVsOwn}/${p.borderVsOutside}`)
        }
        if (problems.length) console.log(`  [${label}] ${p.tag}.${p.cls} "${p.text}" -> ${problems.join(' | ')}  fg=${p.fg} own=${p.bgOwn} out=${p.bgOutside} outline=${p.outlineColor}@${p.outlineOffset}`)
      }
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }, sessionId)
    }
    await cdp.send('Target.closeTarget', { targetId })
  }
  await browser.close()
  await served.close()
}
main().catch(e => { console.error(e); process.exit(1) })
