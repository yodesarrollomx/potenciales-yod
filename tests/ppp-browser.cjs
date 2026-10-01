'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {install,draft,native}=require('./ppp-fixture.js');
const pause=p=>p.waitForTimeout(480), root=path.resolve(__dirname,'..');
(async()=>{
 for(const [name,engine] of Object.entries({chromium,webkit})){
  if(process.env.PPP_ENGINE&&process.env.PPP_ENGINE!==name)continue;
  const launch={headless:true};if(name==='chromium'&&process.env.PPP_SINGLE_PROCESS==='1')launch.args=['--single-process','--no-zygote'];
  const browser=await engine.launch(launch);
  try{
   // Summary -> detail -> adjustments, original controls and formulas, save and versions.
   const c=await browser.newContext({viewport:{width:430,height:932},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),transport=await install(c),p=await c.newPage(),errors=[];
   p.on('pageerror',e=>errors.push(e.message));
   await p.goto('https://ppp.test/potenciales-yod/mixto.html');await p.locator('.ppp-card').first().waitFor();await pause(p);
   assert.equal(await p.locator('.ppp-card').count(),5);assert.equal(await p.locator('.ppp-open').count(),0);
   assert.equal(await p.locator('input[type=range]').count(),81);assert.equal(await p.locator('.ppp-all .kpi-box').count(),40);
   assert.equal(await p.locator('#pppModelos').count(),0);assert.equal(await p.locator('.yod-topbrand img').getAttribute('alt'),'YoDesarrollo');
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
   const bottom=await p.locator('.ppp-card').last().evaluate(e=>e.getBoundingClientRect().bottom);assert.ok(bottom<1040,'Five summaries fit <=1.2 mobile viewports: '+bottom);
   if(process.env.PPP_SCREENSHOTS){fs.mkdirSync(process.env.PPP_SCREENSHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-summary.png'),fullPage:true});}
   for(const id of ['dArq','dVentas','dCostos','dMacro','dDota']){
    await p.locator('#pppToggle'+id).click();await pause(p);assert.equal(await p.locator('.ppp-open').count(),1);assert.equal(await p.locator('.ppp-muted').count(),4);
    assert.equal(await p.locator('#'+id).isVisible(),false,'Adjustments are not exposed until requested');
    await p.locator('[data-card='+id+'] .ppp-adjust').click();assert.equal(await p.locator('#'+id).isVisible(),true);
    const field=p.locator('#'+id+' input[type=range]').first();const before=await field.inputValue();await field.evaluate(e=>{e.value=Number(e.value)+Number(e.step||1);e.dispatchEvent(new Event('input',{bubbles:true}));});assert.notEqual(await field.inputValue(),before);assert.match(await p.locator('#syncDot').innerText(),/Cambios locales/);
    await p.locator('#'+id+' button').last().click();assert.equal(await p.locator('#'+id).isVisible(),false);
   }
   await p.locator('#pppBack').click();await pause(p);assert.equal(await p.locator('.ppp-open').count(),0);
   await p.locator('#pppToggle'+'dArq').click();await pause(p);
   if(process.env.PPP_SCREENSHOTS)await p.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-detail.png'),fullPage:false});
   await p.locator('#pppToggle'+'dArq').press('Escape');await pause(p);assert.equal(await p.locator('.ppp-open').count(),0);
   assert.equal(await p.locator('.ppp-graphic').first().evaluate(e=>getComputedStyle(e).animationName),'none');
   await p.locator('#pppVersiones>summary').click();p.once('dialog',d=>d.accept('Alternativa de prueba'));await p.locator('#escAdd').click();assert.match(await p.locator('#pppVersiones>summary').innerText(),/Alternativa de prueba/);
   await p.locator('[data-esc]').first().click();assert.match(await p.locator('#pppVersiones>summary').innerText(),/Base de prueba/);
   await p.locator('.ppp-footer button').filter({hasText:'Guardar'}).click();await p.locator('#gGuardarSolo').click();await pause(p);assert.ok(transport.posts.some(b=>b.tipo==='guardar'&&b.sendEmail===false&&Object.keys(b.inputs).length===81));assert.match(await p.locator('#syncDot').innerText(),/v2/);
   // Formula chips reveal the original input, including nested advanced controls.
   await p.locator('.ppp-shortcuts button').filter({hasText:'Herramientas'}).click();await p.locator('[data-formula]').first().click();await p.locator('.chip[data-jump]').first().click();assert.equal(await p.locator('.ppp-adjusting').count(),1);
   assert.deepEqual(errors,[]);assert.equal(transport.posts.filter(b=>b.sendEmail).length,0);
   console.log('PASS '+name+': 81 controls, 40 KPI cells, five cards, adjustments, versions, save, formula jumps, mobile, reduced motion.');
   await c.close();
   // Native mode: retain confirmed results until synthetic server confirms quantities.
   const seed=draft();seed.sheetModel=native();
   const n=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),net=await install(n,{seed,native:true}),q=await n.newPage(),ne=[];q.on('pageerror',e=>ne.push(e.message));
   await q.goto('https://ppp.test/potenciales-yod/mixto.html');await pause(q);assert.ok(net.gets.includes('sheet-model'));assert.equal(net.posts.length,0);
   const prev=await q.locator('[data-card=dVentas] .ppp-main').innerText();await q.locator('#pppToggledVentas').click();await q.locator('[data-card=dVentas] .ppp-adjust').click();
   await q.locator('#inPreViv').evaluate(e=>{e.value=Number(e.value)+1000;e.dispatchEvent(new Event('input',{bubbles:true}));});
   assert.equal(await q.locator('[data-card=dVentas] .ppp-main').innerText(),prev,'Pending edits keep confirmed results');
   await q.waitForFunction(()=>document.getElementById('syncDot').textContent.includes('Sheets · revisión'));assert.notEqual(await q.locator('[data-card=dVentas] .ppp-main').innerText(),prev);assert.equal(net.posts[0].revision_esperada,'revision-synthetic-1');
   net.conflict=true;const confirmed=await q.locator('[data-card=dVentas] .ppp-main').innerText();await q.locator('#inPreViv').evaluate(e=>{e.value=Number(e.value)+1000;e.dispatchEvent(new Event('input',{bubbles:true}));});await q.waitForFunction(()=>document.getElementById('syncDot').textContent.includes('Conflicto'));assert.equal(await q.locator('[data-card=dVentas] .ppp-main').innerText(),confirmed);assert.deepEqual(ne,[]);
   const postCount=net.posts.length;await q.reload();await pause(q);assert.equal(net.posts.length,postCount,'A restored conflict does not silently retry a write');assert.equal(await q.locator('[data-card=dVentas] .ppp-main').innerText(),confirmed);assert.equal(await q.locator('#inPreViv').inputValue(),String(Number(seed.inputs.inPreViv)+2000));
   console.log('PASS '+name+': native confirmed revision, read-only resume, confirmed graphics, quantity POST contract, conflict and pending inputs survive reload.');await n.close();
   const f=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true}),ft=await install(f,{seed:null,cases:[draft().caso]}),v=await f.newPage();await v.goto('https://ppp.test/potenciales-yod/mixto.html');await v.locator('#ovCasos.on').waitFor();await v.locator('#listaCasos [data-id]').first().click();await v.locator('#ovCasos.on').waitFor({state:'hidden'});assert.match(await v.locator('#casoNombreBar').innerText(),/Torre de prueba/);
   for(const width of [320,390,430,1280]){await v.setViewportSize({width,height:932});await pause(v);assert.ok(await v.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Viewport '+width+' has no horizontal overflow');}
   await v.setViewportSize({width:430,height:932});await v.evaluate(()=>scrollTo(0,100));await v.locator('#pppToggledArq').click();await pause(v);await v.locator('#pppToggledDota').click();await v.waitForTimeout(1100);await v.waitForFunction(()=>{const t=document.getElementById('pppToggledDota').getBoundingClientRect().top;return t>=55&&t<160;},{},{timeout:5000});const top=await v.locator('#pppToggledDota').evaluate(e=>e.getBoundingClientRect().top);assert.ok(top>=55&&top<160,'Switching animated cards retains focus position: '+top);await v.locator('#pppBack').click();await pause(v);assert.equal(await v.locator('.ppp-open').count(),0,'Back closes the active card');assert.equal(ft.posts.length,0,'Entry and disclosure do not write: '+ft.posts.map(b=>b.tipo));
   const light=await v.locator('body').evaluate(e=>getComputedStyle(e).getPropertyValue('--bg'));await v.locator('#temaBtn').click();assert.notEqual(await v.locator('body').evaluate(e=>getComputedStyle(e).getPropertyValue('--bg')),light);assert.equal(await v.locator('html').getAttribute('data-tema'),'oscuro');
   console.log('PASS '+name+': first entry offers saved cases, 320/390/430/1280 px, animated switch/close, theme, zero business writes.');await f.close();
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
