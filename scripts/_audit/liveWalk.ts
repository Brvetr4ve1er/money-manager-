/* AUDIT-ONLY: record every live-region mutation across a real first session. */
import { launchChrome } from '../census/chrome.ts'
import { serveProductionBuild } from '../census/serve.ts'
import { CENSUS_EPOCH_MS, CENSUS_LOCALE, CENSUS_TIMEZONE, determinismScript } from '../census/determinism.ts'

const OBSERVE = `
window.__log = []
window.__regions = () => [...document.querySelectorAll('[role="status"],[role="alert"],[aria-live]')]
window.__snapshot = () => window.__regions().map(r => ({
  label: r.getAttribute('aria-label') || r.getAttribute('id') || r.className,
  role: r.getAttribute('role'), text: (r.textContent||'').trim(),
  hidden: !!r.closest('[aria-hidden="true"]'), inTree: !!r.offsetParent || r.className.includes('sr-only'),
}))
window.__obs = new MutationObserver((muts) => {
  for (const m of muts) {
    const host = (m.target.nodeType === 1 ? m.target : m.target.parentElement)
    if (!host) continue
    const region = host.closest('[role="status"],[role="alert"],[aria-live]')
    if (!region) continue
    window.__log.push({ t: Date.now(), label: region.getAttribute('aria-label')||region.className,
      role: region.getAttribute('role'), text: (region.textContent||'').trim() })
  }
})
window.__obs.observe(document.body, { childList: true, subtree: true, characterData: true })
1`

const step = (js: string) => `(() => { ${js}; return JSON.stringify(true) })()`

async function main() {
  const served = await serveProductionBuild()
  const b = await launchChrome(); const cdp = b.cdp
  for (const theme of ['light'] as const) {
    const {targetId}=await cdp.send<any>('Target.createTarget',{url:'about:blank'})
    const {sessionId}=await cdp.send<any>('Target.attachToTarget',{targetId,flatten:true})
    for (const d of ['Page','Runtime']) await cdp.send(d+'.enable',{},sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true},sessionId)
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:'reduce'}]},sessionId)
    await cdp.send('Emulation.setTimezoneOverride',{timezoneId:CENSUS_TIMEZONE},sessionId)
    await cdp.send('Emulation.setLocaleOverride',{locale:CENSUS_LOCALE},sessionId)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:determinismScript({epochMs:CENSUS_EPOCH_MS,storageJson:null})},sessionId)
    const loaded=cdp.once('Page.loadEventFired',sessionId)
    await cdp.send('Page.navigate',{url:served.origin+'/'},sessionId)
    await loaded; await new Promise(r=>setTimeout(r,1500))
    const ev=async(e:string)=>{const r=await cdp.send<any>('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true},sessionId); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0,400)); return JSON.parse(r.result.value??'null')}
    await ev(OBSERVE)
    console.log('LANDING regions:', JSON.stringify(await ev('JSON.stringify(window.__snapshot())')))
    // cross the gate
    await ev(step(`[...document.querySelectorAll('button')].find(b=>/Start logging/.test(b.textContent)).click()`))
    await new Promise(r=>setTimeout(r,600))
    await ev(OBSERVE)
    console.log('\nDAY0 regions at mount:', JSON.stringify(await ev('JSON.stringify(window.__snapshot())'), null, 1))
    console.log('active element after gate:', await ev('JSON.stringify(document.activeElement.tagName + "." + document.activeElement.className)'))
    const acts: Array<[string,string]> = [
      ['type 1200', `const i=document.querySelector('#log input.field.mono'); const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i,'1200'); i.dispatchEvent(new Event('input',{bubbles:true}))`],
      ['log purchase', `[...document.querySelectorAll('#log button')].find(b=>/Log purchase/.test(b.textContent)).click()`],
      ['submit empty (error)', `[...document.querySelectorAll('#log button')].find(b=>/Log purchase/.test(b.textContent)).click()`],
      ['note key 500', `[...document.querySelectorAll('.note-key')].find(b=>/500/.test(b.getAttribute('aria-label'))).click()`],
      ['clear', `[...document.querySelectorAll('#log button')].find(b=>/^Clear$/.test(b.textContent.trim())).click()`],
      ['lesson got it', `[...document.querySelectorAll('button')].find(b=>/^Got it:/.test(b.getAttribute('aria-label')||'')).click()`],
      ['sim amount', `const i=document.querySelector('#simulator input.field.mono'); const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i,'5000'); i.dispatchEvent(new Event('input',{bubbles:true}))`],
      ['run sim', `[...document.querySelectorAll('#simulator button')].find(b=>/Run simulation/.test(b.textContent)).click()`],
      ['profile income', `const i=document.querySelector('#numbers input'); const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i,'60000'); i.dispatchEvent(new Event('input',{bubbles:true}))`],
      ['profile essentials', `const i=document.querySelectorAll('#numbers input')[1]; const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i,'30000'); i.dispatchEvent(new Event('input',{bubbles:true}))`],
      ['save numbers', `[...document.querySelectorAll('#numbers button')].find(b=>/Save my numbers/.test(b.textContent)).click()`],
      ['export', `[...document.querySelectorAll('.foot button')].find(b=>/Export my data/.test(b.textContent)).click()`],
    ]
    for (const [name, js] of acts) {
      await ev(`(() => { window.__log = []; return JSON.stringify(true) })()`)
      try { await ev(step(js)) } catch (e) { console.log(`  !! ${name}: ${String(e).slice(0,120)}`); continue }
      await new Promise(r=>setTimeout(r,900))
      const log = await ev('JSON.stringify(window.__log)')
      const uniq: string[] = []
      for (const e of log) { const k = `${e.role}|${e.label}|${e.text}`; if (!uniq.includes(k)) uniq.push(k) }
      console.log(`\n[${name}] ${log.length} mutations ->`)
      for (const u of uniq) console.log('   ', u)
      console.log('    focus:', await ev('JSON.stringify(document.activeElement.tagName+"."+document.activeElement.className)'))
    }
    console.log('\nFINAL regions:', JSON.stringify(await ev('JSON.stringify(window.__snapshot())'),null,1))
    await cdp.send('Target.closeTarget',{targetId})
  }
  await b.close(); await served.close()
}
main().catch(e=>{console.error(e);process.exit(1)})
