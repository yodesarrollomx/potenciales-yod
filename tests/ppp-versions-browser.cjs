'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {native,compute,install}=require('./ppp-fixture.js');
const copy=v=>JSON.parse(JSON.stringify(v));
function eight(active='version-8'){
 const m=native(),input=copy(m.escenarios[0].inputs),results={};
 m.escenarios=Array.from({length:8},(_,i)=>({id:'version-'+(i+1),nombre:'Alternativa '+(i+1)+' · nombre completo de una versión guardada',esBase:i===0,activo:'version-'+(i+1)===active,inputs:{...input,inTerreno:1800+i*100.125}}));
 m.activo=active;m.estados={};m.escenarios.forEach(e=>{results[e.id]=compute(e.inputs);m.estados[e.id]=copy(results[e.id]);if(e.id!==active)delete m.estados[e.id].flows;});return {m,results};
}
(async()=>{for(const [name,engine] of Object.entries({chromium,webkit})){
 const browser=await engine.launch({headless:true});try{
 const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),source=eight(),net=await install(context,{seed:null,native:true,model:source.m}),p=await context.newPage(),errors=[],operations=[];let incomplete=false;
 p.on('pageerror',e=>errors.push(e.message));
 await context.route('https://script.google.com/**',route=>{
  const request=route.request();if(request.method()!=='POST')return route.fallback();const b=request.postDataJSON();if(b.tipo==='bitacora')return route.fallback();
  operations.push(b);if(b.tipo==='sheet-version'){
   if(incomplete)return route.fulfill({contentType:'application/json',body:JSON.stringify({...net.model,estados:{}})});
   assert.equal(b.accion,'activar');assert.equal(b.revision_esperada,net.model.revision);const next=copy(net.model);next.activo=b.escenario_id;next.revision+='x';next.escenarios.forEach(e=>{e.activo=e.id===next.activo;next.estados[e.id]=copy(source.results[e.id]);if(!e.activo)delete next.estados[e.id].flows;});net.model=next;return route.fulfill({contentType:'application/json',body:JSON.stringify(next)});
  }
  if(b.tipo==='sheet-cantidades')return route.fulfill({contentType:'application/json',body:JSON.stringify({...net.model,estados:{}})});
  throw Error('Unexpected synthetic operation '+b.tipo);
 });
 await p.goto('https://ppp.test/potenciales-yod/mixto.html?open=synthetic-case');await p.waitForFunction(()=>document.getElementById('pppCaseStatus').hidden);assert.match(await p.locator('#pppVersiones>summary').innerText(),/Versiones · 8/);await p.locator('#pppVersiones>summary').click();assert.equal(await p.locator('[data-esc]').count(),8);assert.deepEqual(await p.locator('.esc-name').allTextContents(),source.m.escenarios.map(e=>e.nombre));assert.equal(await p.locator('#compTable thead th').count(),9);assert.equal(operations.length,0);
 const names=source.m.escenarios.map(e=>e.nombre),inputSnapshots=JSON.stringify(source.m.escenarios.map(e=>e.inputs));
 await p.locator('[data-esc="version-3"]').click();await p.waitForFunction(()=>document.querySelector('[data-esc="version-3"]').getAttribute('aria-pressed')==='true');
 assert.equal(await p.locator('#inTerreno').evaluate(e=>Number(e.value)),source.m.escenarios[2].inputs.inTerreno);assert.equal(JSON.stringify(net.model.escenarios.map(e=>e.inputs)),inputSnapshots);assert.deepEqual(await p.locator('.esc-name').allTextContents(),names);
 incomplete=true;await p.locator('[data-esc="version-4"]').click();await p.waitForFunction(()=>document.getElementById('syncDot').textContent.includes('incompleta'));assert.equal(await p.locator('[data-esc][aria-pressed=true]').getAttribute('data-esc'),'version-3');assert.equal(await p.locator('[data-esc]').count(),8);
 incomplete=false;const external=eight('version-5');external.m.revision='external-confirmed';net.model=external.m;await p.locator('#pppEtapas>summary').click();await p.locator('#sheetRecargar').click();await p.waitForFunction(()=>document.querySelector('[data-esc="version-5"]').getAttribute('aria-pressed')==='true');assert.equal(await p.locator('#inTerreno').evaluate(e=>Number(e.value)),net.model.escenarios[4].inputs.inTerreno);
 for(const width of [320,390,430,1280]){await p.setViewportSize({width,height:932});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No overflow at '+width);}
 await p.setViewportSize({width:430,height:932});if(process.env.PPP_SCREENSHOTS){fs.mkdirSync(process.env.PPP_SCREENSHOTS,{recursive:true});await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-8-versions.png')});}
 // An incomplete response to quantities cannot erase pending inputs or saved versions.
 await p.locator('#pppToggledArq').click();await p.locator('[data-card=dArq] .ppp-adjust').click();await p.locator('#inTerreno').evaluate(e=>{e.value='2600.375';e.dispatchEvent(new Event('input',{bubbles:true}));});await p.waitForFunction(()=>document.getElementById('syncDot').textContent.includes('incompleta'));const draft=await p.evaluate(()=>JSON.parse(localStorage.getItem('pyod_draft_v1')));assert.equal(draft.sheetPending.inputs.inTerreno,2600.375);assert.equal(draft.sheetModel.revision,'external-confirmed');assert.equal(draft.sheetModel.escenarios.length,8);assert.deepEqual(draft.sheetModel.escenarios.map(e=>e.nombre),names);
 assert.deepEqual(errors,[]);assert.equal(operations.filter(x=>x.tipo==='sheet-version').length,2);assert.equal(operations.filter(x=>x.tipo==='sheet-cantidades').length,1);console.log('PASS '+name+': 8 versions with active-only flow; complete comparison/names, exact quantities, activation, incomplete response preserves model, external active reload, pending inputs preserved, responsive; only synthetic writes.');await context.close();
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
