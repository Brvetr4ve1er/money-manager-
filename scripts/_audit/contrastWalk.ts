/* AUDIT-ONLY, not part of the tree's product or tooling. Read-only measurement. */
import { readFileSync } from 'node:fs'
import { launchChrome } from '../census/chrome.ts'
import { serveProductionBuild } from '../census/serve.ts'
import {
  CENSUS_EPOCH_MS, CENSUS_LOCALE, CENSUS_TIMEZONE, determinismScript,
} from '../census/determinism.ts'
import { REPO_ROOT } from '../census/inputs.ts'

const WALK = `(() => {
  const px = (s) => parseFloat(s) || 0
  const parse = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c); if (!m) return null
    const p = m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.b * 0 + fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  })
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1,l2), lo = Math.min(l1,l2); return (hi + 0.05) / (lo + 0.05) }
  // Effective background: walk ancestors compositing until opaque.
  const bgOf = (el) => {
    let acc = null
    let node = el
    while (node) {
      const cs = getComputedStyle(node)
      const c = parse(cs.backgroundColor)
      if (c && c.a > 0) {
        acc = acc === null ? c : over(acc, c)
        if (acc.a >= 0.999) return acc
      }
      node = node.parentElement
    }
    const c = parse(getComputedStyle(document.documentElement).backgroundColor)
    return acc && c ? over(acc, c) : (acc || c || { r:255,g:255,b:255,a:1 })
  }
  const visible = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || px(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    if (el.closest('.sr-only')) return false
    return true
  }
  const out = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set()
  let n
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || '').trim()
    if (!t) continue
    const el = n.parentElement
    if (!el || !visible(el)) continue
    const cs = getComputedStyle(el)
    const fg = parse(cs.color)
    if (!fg) continue
    const bg = bgOf(el)
    const eff = fg.a < 1 ? over(fg, bg) : fg
    const size = px(cs.fontSize)
    const weight = Number(cs.fontWeight) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const need = large ? 3 : 4.5
    const cr = ratio(eff, bg)
    const key = el.className + '|' + cs.color + '|' + Math.round(size) + '|' + t.slice(0, 20)
    if (seen.has(key)) continue
    seen.add(key)
    if (cr < need && !el.closest('[aria-hidden="true"]')) {
      out.push({ text: t.slice(0, 48), sel: el.tagName + '.' + (typeof el.className === 'string' ? el.className : ''),
        color: cs.color, bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')',
        size, weight, ratio: Math.round(cr * 100) / 100, need, hidden: !!el.closest('[aria-hidden="true"]') })
    }
  }
  return JSON.stringify(out)
})()`

const TARGETS = `(() => {
  const out = []
  const sel = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
  for (const el of document.querySelectorAll(sel)) {
    if (el.getAttribute('tabindex') === '-1') continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 && r.height < 1) continue
    // the label wrapping an input can supply the target
    const lab = el.closest('label')
    const lr = lab ? lab.getBoundingClientRect() : null
    const h = Math.max(r.height, lr ? lr.height : 0)
    const w = Math.max(r.width, lr ? lr.width : 0)
    out.push({ tag: el.tagName, cls: String(el.className), w: Math.round(w), h: Math.round(h), small: (h < 48 || w < 24), text: (el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,30) })
  }
  return JSON.stringify(out)
})()`

const OVERFLOW = `(() => {
  const de = document.documentElement
  const out = { scrollW: de.scrollWidth, clientW: de.clientWidth, offenders: [] }
  if (de.scrollWidth > de.clientWidth + 1) {
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.right > de.clientWidth + 1 || r.left < -1) {
        out.offenders.push({ tag: el.tagName, cls: String(el.className).slice(0,50), left: Math.round(r.left), right: Math.round(r.right) })
      }
    }
    out.offenders = out.offenders.slice(0, 12)
  }
  return JSON.stringify(out)
})()`

const FIX = (n: string) => readFileSync(new URL(`scripts/census/fixtures/${n}.json`, REPO_ROOT), 'utf8').trim()

async function main() {
  const served = await serveProductionBuild()
  const browser = await launchChrome()
  const cdp = browser.cdp
  const rows: Array<{ id: string; w: number; h: number; theme: 'light'|'dark'; state: string|null; motion: 'reduce'|'no-preference' }> = []
  for (const theme of ['light','dark'] as const) {
    for (const [w,h] of [[320,812],[375,812],[1440,900]] as const) {
      rows.push({ id: `landing.${w}x${h}.${theme}`, w, h, theme, state: null, motion: 'reduce' })
      rows.push({ id: `day0.${w}x${h}.${theme}`, w, h, theme, state: 'day0', motion: 'reduce' })
    }
    rows.push({ id: `seeded.375x812.${theme}`, w:375, h:812, theme, state: 'seeded', motion: 'reduce' })
    rows.push({ id: `driven.320x812.${theme}`, w:320, h:812, theme, state: 'day0', motion: 'reduce' })
    rows.push({ id: `driven.375x812.${theme}`, w:375, h:812, theme, state: 'day0', motion: 'reduce' })
    rows.push({ id: `driven.1440x900.${theme}`, w:1440, h:900, theme, state: 'day0', motion: 'reduce' })
    rows.push({ id: `cold.375x812.${theme}`, w:375, h:812, theme, state: 'cold', motion: 'reduce' })
  }
  for (const row of rows) {
    const { targetId } = await cdp.send<{targetId:string}>('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send<{sessionId:string}>('Target.attachToTarget', { targetId, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: row.w, height: row.h, deviceScaleFactor: 1, mobile: row.w < 768 }, sessionId)
    await cdp.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-color-scheme', value: row.theme },
      { name: 'prefers-reduced-motion', value: row.motion },
    ]}, sessionId)
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: CENSUS_TIMEZONE }, sessionId)
    await cdp.send('Emulation.setLocaleOverride', { locale: CENSUS_LOCALE }, sessionId)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: determinismScript({ epochMs: CENSUS_EPOCH_MS, storageJson: row.state ? FIX(row.state) : null }) }, sessionId)
    const loaded = cdp.once('Page.loadEventFired', sessionId)
    await cdp.send('Page.navigate', { url: `${served.origin}/` }, sessionId)
    await loaded
    await new Promise((r) => setTimeout(r, 3200))
    const ev = async (expr: string) => {
      const res = await cdp.send<{ result: { value?: string }, exceptionDetails?: any }>('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId)
      if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 400))
      return JSON.parse(res.result.value ?? 'null')
    }
    if (row.id.startsWith('driven')) {
      await ev(`(() => { const i=document.querySelector('#log input.field.mono'); const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i,'1200'); i.dispatchEvent(new Event('input',{bubbles:true})); return JSON.stringify(true) })()`)
      await ev(`(() => { [...document.querySelectorAll('#log button')].find(b=>/Log purchase/.test(b.textContent)).click(); return JSON.stringify(true) })()`)
      await new Promise((r) => setTimeout(r, 300))
      await ev(`(() => { [...document.querySelectorAll('#log button')].find(b=>/Log purchase/.test(b.textContent)).click(); return JSON.stringify(true) })()`)
      await new Promise((r) => setTimeout(r, 400))
    }
    const fails = await ev(WALK)
    const targets = await ev(TARGETS)
    const overflow = await ev(OVERFLOW)
    console.log('\n=== ' + row.id + ' ===')
    if (fails.length) { console.log('  CONTRAST:'); for (const f of fails) console.log('   ', JSON.stringify(f)) }
    const small = targets.filter((t:any)=>t.small)
    console.log('  targets measured:', targets.length, ' under 48:', small.length)
    for (const t of small) console.log('    SMALL', JSON.stringify(t))
    if (overflow.scrollW > overflow.clientW + 1) console.log('  OVERFLOW:', JSON.stringify(overflow))

    await cdp.send('Target.closeTarget', { targetId })
  }
  await browser.close()
  await served.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
