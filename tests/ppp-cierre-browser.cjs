'use strict';
// Full pages with isolated transport: no business writes or mail requests leave the browser.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {root,install,native}=require('./ppp-fixture.js');
(async()=>{for(const [name,engine] of Object.entries({chromium,webkit})){
 if(process.env.PPP_ENGINE&&process.env.PPP_ENGINE!==name)continue;
 const b=await engine.launch({headless:true});try{
  const c=await b.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const transport=await install(c,{seed:null,native:true}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('https://ppp.test/potenciales-yod/mixto.html?open=synthetic-case');await p.locator('#pppCaseStatus').waitFor({state:'hidden'});
  assert.equal(await p.locator('.ppp-summary-measure').count(),10);
  const before=await p.locator('[data-card=dArq] .ppp-measure-fill').first().getAttribute('style');
  const model=native(),r=model.estados[model.activo];r.floorPlate=r.p.terrain*.85;r.height=r.p.altMax*.85;
  await p.evaluate(r=>PPPView.update(r,{native:true,revision:'confirmed-85',caseId:'synthetic-case',scenario:'test-base'}),r);
  assert.match(await p.locator('[data-card=dArq] .ppp-summary-measure').first().innerText(),/85%/);
  assert.match(await p.locator('[data-card=dArq] .ppp-measure-fill').first().getAttribute('style'),/85%/);assert.notEqual(before,await p.locator('[data-card=dArq] .ppp-measure-fill').first().getAttribute('style'));
  await p.evaluate(()=>PPPView.update({p:{}},{native:true,revision:'incomplete',caseId:'synthetic-case',scenario:'test-base'}));
  assert.equal(await p.locator('.ppp-measure-pending').count(),10);assert.match(await p.locator('.ppp-summary-measure').first().innerText(),/—/);
  await p.evaluate(r=>PPPView.update(r,{native:true,revision:'confirmed',caseId:'synthetic-case',scenario:'test-base'}),model.estados[model.activo]);
  for(const width of [320,390,430,1280]){await p.setViewportSize({width,height:932});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  assert.equal(transport.posts.length,0);await c.close();
  const html=fs.readFileSync(path.join(root,'macrolotes.html'),'utf8'),inputs=Object.fromEntries([...html.matchAll(/<input\b[^>]*type="range"[^>]*>/g)].map(([tag])=>[tag.match(/id="([^"]+)"/)[1],Number(tag.match(/value="([^"]+)"/)[1])]));
  const scenarios=Array.from({length:8},(_,i)=>({id:'s-'+i,nombre:'Alternativa '+(i+1)+' · nombre completo para distinguir el programa de renta',esBase:i===0,inputs:{...inputs,inTerreno:30000+i*100}}));
  const seed={inputs:scenarios[4].inputs,caso:{caso_id:'synthetic-macro',nombre_caso:'Parque de prueba',palabra:'ensayo',version:1},escenarios:scenarios,escActivo:'s-4'};
  const mc=await b.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),mt=await install(mc,{seed:null});
  await mc.addInitScript(seed=>localStorage.setItem('pyodm_draft_v1',JSON.stringify(seed)),seed);
  const q=await mc.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto('https://ppp.test/potenciales-yod/macrolotes.html');
  await q.waitForFunction(()=>document.querySelectorAll('.esc-version').length===8);
  assert.equal(await q.locator('.esc-chip[aria-pressed=true]').getAttribute('data-esc'),'s-4');assert.match(await q.locator('[data-esc=s-0]').innerText(),/Base/);
  assert.equal(await q.locator('.esc-name').last().innerText(),scenarios[7].nombre,'Long existing names survive load');
  await q.locator('[data-esc=s-7]').click();assert.equal(await q.locator('.esc-chip[aria-pressed=true]').getAttribute('data-esc'),'s-7');
  for(const width of [320,390,430,1280]){await q.setViewportSize({width,height:932});assert.ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  const saved=await q.evaluate(()=>JSON.parse(localStorage.getItem('pyodm_draft_v1')));assert.equal(saved.escenarios.length,8);assert.deepEqual(saved.escenarios.map(s=>s.id),scenarios.map(s=>s.id));assert.equal(saved.escActivo,'s-7');
  assert.equal(mt.posts.length,0);assert.deepEqual(errors,[]);
  if(process.env.PPP_SCREENSHOTS){fs.mkdirSync(process.env.PPP_SCREENSHOTS,{recursive:true});await q.setViewportSize({width:430,height:932});await q.locator('#escBar').scrollIntoViewIfNeeded();await q.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-macro-versions.png')});}
  await mc.close();console.log('PASS '+name+': all five cards show confirmed proportions, 85% and missing values, eight macro versions retain full names/IDs/base/active and local edits, responsive, no business writes.');
 }finally{await b.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
