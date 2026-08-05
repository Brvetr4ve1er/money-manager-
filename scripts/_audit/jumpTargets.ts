/* AUDIT-ONLY: focus rings on the tabindex="-1" jump targets (the app's cards
   and the landing's #spec), which the focusable sweep skips by design. */
import { readFileSync } from 'node:fs'
import { launchChrome } from '../census/chrome.ts'
import { serveProductionBuild } from '../census/serve.ts'
import { CENSUS_EPOCH_MS, CENSUS_LOCALE, CENSUS_TIMEZONE, determinismScript } from '../census/determinism.ts'
import { REPO_ROOT } from '../census/inputs.ts'

const HELP = `
window.__b = (() => {
  const parse=(c)=>{let m=/rgba?\\(([^)]+)\\)/.exec(c); if(m){const p=m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}}
    m=/color\\(\\s*srgb\\s+([^)]+)\\)/.exec(c); if(m){const p=m[1].split(/[\\s\\/]+/).filter(Boolean).map(Number);return {r:p[0]*255,g:p[1]*255,b:p[2]*255,a:p.length>3?p[3]:1}}
    if(c==='transparent')return{r:0,g:0,b:0,a:0}; return null}
  const over=(f,b)=>({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1})
  const lum=(c)=>{const f=(v)=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)}
  const ratio=(a,b)=>{const l1=lum(a),l2=lum(b),hi=Math.max(l1,l2),lo=Math.min(l1,l2);return (hi+0.05)/(lo+0.05)}
  const bgOf=(el)=>{let acc=null,n=el;while(n){const c=parse(getComputedStyle(n).backgroundColor);
    if(c&&c.a>0){acc=acc===null?c:over(acc,c);if(acc.a>=0.999)return acc} n=n.parentElement}
    const c=parse(getComputedStyle(document.documentElement).backgroundColor);return acc&&c?over(acc,c):(acc||c||{r:255,g:255,b:255,a:1})}
  const jumps=()=>[...document.querySelectorAll('[tabindex="-1"]')]
  return {parse,over,lum,ratio,bgOf,jumps}
})();1`

const P = (i: number) => `(() => { try {
  const A=window.__b, el=A.jumps()[${i}]; if(!el) return JSON.stringify(null)
  const cs=getComputedStyle(el), px=(s)=>parseFloat(s)||0
  const own=A.bgOf(el), outside=el.parentElement?A.bgOf(el.parentElement):own
  const oc=A.parse(cs.outlineColor); const w=px(cs.outlineWidth); const off=px(cs.outlineOffset)
  const on = off>=0 ? outside : own
  const eff = oc && oc.a<1 ? A.over(oc,on) : oc
  return JSON.stringify({ tag:el.tagName, id:el.id, cls:String(el.className),
    outlineStyle:cs.outlineStyle, w, off, color:cs.outlineColor,
    onWhat: off>=0?'outside':'own',
    on:'rgb('+Math.round(on.r)+','+Math.round(on.g)+','+Math.round(on.b)+')',
    ratio: eff? Math.round(A.ratio(eff,on)*100)/100 : null })
} catch(e){ return JSON.stringify({err:String(e&&e.message||e)}) } })()`

const FIX=(n:string)=>readFileSync(new URL(`scripts/census/fixtures/${n}.json`,REPO_ROOT),'utf8').trim()

async function main() {
  const served = await serveProductionBuild()
  const b = await launchChrome(); const cdp = b.cdp
  for (const row of [
    {id:'landing.light',w:375,theme:'light' as const,state:null as string|null},
    {id:'landing.dark',w:375,theme:'dark' as const,state:null as string|null},
    {id:'day0.375.light',w:375,theme:'light' as const,state:'day0'},
    {id:'day0.375.dark',w:375,theme:'dark' as const,state:'day0'},
    {id:'day0.1440.light',w:1440,theme:'light' as const,state:'day0'},
    {id:'day0.1440.dark',w:1440,theme:'dark' as const,state:'day0'},
  ]) {
    const {targetId}=await cdp.send<any>('Target.createTarget',{url:'about:blank'})
    const {sessionId}=await cdp.send<any>('Target.attachToTarget',{targetId,flatten:true})
    for (const d of ['Page','DOM','CSS','Runtime']) await cdp.send(d+'.enable',{},sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:row.w,height:812,deviceScaleFactor:1,mobile:row.w<768},sessionId)
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:row.theme},{name:'prefers-reduced-motion',value:'reduce'}]},sessionId)
    await cdp.send('Emulation.setTimezoneOverride',{timezoneId:CENSUS_TIMEZONE},sessionId)
    await cdp.send('Emulation.setLocaleOverride',{locale:CENSUS_LOCALE},sessionId)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:determinismScript({epochMs:CENSUS_EPOCH_MS,storageJson:row.state?FIX(row.state):null})},sessionId)
    const loaded=cdp.once('Page.loadEventFired',sessionId)
    await cdp.send('Page.navigate',{url:served.origin+'/'},sessionId)
    await loaded; await new Promise(r=>setTimeout(r,2500))
    const ev=async(e:string)=>{const r=await cdp.send<any>('Runtime.evaluate',{expression:e,returnByValue:true},sessionId); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0,300)); return JSON.parse(r.result.value??'null')}
    await ev(HELP)
    await cdp.send('DOM.getDocument',{depth:-1,pierce:true},sessionId)
    const n:number = await ev(`JSON.stringify(window.__b.jumps().length)`)
    console.log(`\n=== ${row.id} (${n} jump targets) ===`)
    for (let i=0;i<n;i++) {
      const res=await cdp.send<any>('Runtime.evaluate',{expression:`window.__b.jumps()[${i}]`},sessionId)
      const nodeId=(await cdp.send<any>('DOM.requestNode',{objectId:res.result.objectId},sessionId)).nodeId
      await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['focus','focus-visible']},sessionId)
      const p=await ev(P(i))
      const bad = !p || p.err || p.outlineStyle==='none' || p.w<1 || (p.ratio??0)<3
      console.log(`  ${bad?'FAIL':'ok  '} ${JSON.stringify(p)}`)
      await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]},sessionId)
    }
    await cdp.send('Target.closeTarget',{targetId})
  }
  await b.close(); await served.close()
}
main().catch(e=>{console.error(e);process.exit(1)})
