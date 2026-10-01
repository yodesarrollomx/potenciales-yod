'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {install,draft,native}=require('./ppp-fixture.js');
(async()=>{
 for(const [name,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch({headless:true});
  try{
   const c=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),t=await install(c,{seed:null,native:true,listError:true,caseDelay:800}),p=await c.newPage(),errors=[];
   p.on('pageerror',e=>errors.push(e.message));await p.goto('https://ppp.test/potenciales-yod/mixto.html?open=synthetic-case');
   await p.locator('#pppCaseStatus:not([hidden])').waitFor();assert.equal(await p.locator('#pppDeck').isVisible(),false);assert.equal(await p.locator('.ppp-hud').isVisible(),false);assert.equal(await p.locator('#advBoard').isVisible(),false);assert.equal(await p.locator('#btnGuardar').isEnabled(),false);
   await p.locator('#pppCaseStatus').waitFor({state:'hidden'});assert.ok(t.gets.includes('caso'));assert.match(await p.locator('#casoNombreBar').innerText(),/Torre de prueba/);assert.equal(await p.locator('#pppBookLink').getAttribute('href'),t.model.libro_url);assert.equal(await p.locator('.ppp-card').count(),5);assert.equal(await p.locator('.ppp-open').count(),0);
   for(const id of ['dArq','dVentas','dCostos','dMacro','dDota']){await p.locator('#pppToggle'+id).click();assert.match(await p.locator('[data-card='+id+'] .ppp-caption').first().innerText(),/escala|MXN|cisterna|conceptual/i);assert.equal(await p.locator('[data-card='+id+'] .ppp-detail .ppp-graphic').getAttribute('data-revision'),t.model.revision);}
   await p.locator('#pppToggledArq').click();await p.getByRole('button',{name:'Cuerpos, etapas y rentas',exact:true}).click();assert.equal(await p.locator('#pppEtapas').getAttribute('open'),'');
   await p.locator('#pppToggledMacro').click();await p.getByRole('button',{name:'Ver flujo mensual',exact:true}).last().click();assert.equal(await p.locator('#advBoard').getAttribute('open'),'');
   assert.deepEqual(errors,[]);assert.equal(t.posts.length,0);
   if(process.env.PPP_SCREENSHOTS){fs.mkdirSync(process.env.PPP_SCREENSHOTS,{recursive:true});await p.locator('#pppBack').click();await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-identity-summary.png'),fullPage:false});for(const id of ['dArq','dVentas','dCostos','dMacro','dDota']){await p.locator('#pppToggle'+id).click();await p.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-graphic-'+id+'.png'),fullPage:false});}}
   await c.close();
   const f=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),ft=await install(f,{seed:null,caseError:true}),q=await f.newPage();await q.goto('https://ppp.test/potenciales-yod/mixto.html?open=synthetic-case');await q.getByRole('button',{name:'Reintentar',exact:true}).waitFor();assert.equal(await q.locator('#pppDeck').isVisible(),false);assert.match(await q.locator('#casoNombreBar').innerText(),/sin confirmar/);
   ft.caseError=false;await q.getByRole('button',{name:'Reintentar',exact:true}).click();await q.waitForFunction(()=>document.getElementById('pppCaseStatus').textContent.includes('No se confirmaron resultados'));assert.equal(await q.locator('#pppDeck').isVisible(),false);assert.match(await q.locator('#casoNombreBar').innerText(),/Torre de prueba/);
   ft.native=true;await q.getByRole('button',{name:'Reintentar',exact:true}).click();await q.locator('#pppCaseStatus').waitFor({state:'hidden'});assert.equal(await q.locator('#pppDeck').isVisible(),true);assert.equal(ft.posts.length,0);await f.close();
   const seed=draft();seed.sheetModel=native();seed.sheetPending={scenario:seed.escActivo,inputs:{inPreViv:48000}};seed.inputs.inPreViv=48000;
   const k=await browser.newContext({viewport:{width:430,height:932}}),kt=await install(k,{seed,native:true}),v=await k.newPage();await v.goto('https://ppp.test/potenciales-yod/mixto.html?open=synthetic-case');await v.locator('.ppp-card').first().waitFor();assert.equal(kt.gets.includes('caso'),false);assert.match(await v.locator('#syncDot').innerText(),/pendientes/);assert.equal(kt.posts.length,0);await k.close();
   console.log('PASS '+name+': direct case despite failed catalog, truthful loading/error, native-only results, retry, source identity, five distinct graphs, chapter links, preserved pending copy; zero business writes.');
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
