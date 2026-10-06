'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {install}=require('./ppp-fixture.js');const fixture=require('./fixtures/patrimonial-native.json'),pendingFixture=require('./fixtures/patrimonial-pending.json');const copy=x=>JSON.parse(JSON.stringify(x));
(async()=>{for(const [name,engine] of Object.entries({chromium,webkit})){
 if(process.env.PPP_ENGINE&&process.env.PPP_ENGINE!==name)continue;
 const browser=await engine.launch({headless:true});try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await install(context,{seed:null});
  let model=copy(fixture),posts=[],fail=false,hold=false,release;const errors=[];
  await context.route('https://script.google.com/**',async route=>{
   const req=route.request(),url=new URL(req.url());let out={ok:true};
   if(req.method()==='POST'){const b=req.postDataJSON();if(!b)return route.abort();if(b.tipo!=='bitacora')posts.push(b);
    if(b.tipo==='sheet-cantidades'){if(hold)await new Promise(r=>release=r);if(fail)out={ok:false,error:'conflicto_revision'};else if(b.inputs.inCus===null){model=copy(pendingFixture);out=model;}else{model.revision+='x';Object.assign(model.escenarios[0].inputs,b.inputs);out=model;}}
   }else if(url.searchParams.get('recurso')==='caso')out={ok:true,caso:{caso_id:'synthetic-case',nombre_caso:'Patrimonial sintético',palabra:'ensayo',version:1,calculo_sheet:model}};
   else if(url.searchParams.get('recurso')==='sheet-model')out=model;
   else if(url.searchParams.get('recurso')==='canje')out={ok:true,token:'sy-synthetic-browser-session',boards:'PT',rol:'admin'};
   else if(url.searchParams.get('recurso')==='lista')out={ok:true,casos:[],config:{}};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(out)});
  });
  const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.goto('https://ppp.test/potenciales-yod/patrimonial.html?open=synthetic-case',{waitUntil:'domcontentloaded',timeout:90000});await page.locator('#patrimonialNative').waitFor();
  assert.match(await page.locator('[data-native-result=noi]').innerText(),/1,387,700/);assert.equal(await page.locator('#inM2Rentable').isVisible(),false);assert.equal(await page.locator('.sticky-header').isVisible(),false);
  await page.locator('#pnCaseName').fill('Nombre pendiente');await page.locator('#pnCaseNotes').fill('Notas conservadas al repintar');
  const edit=page.locator('[data-native-field=unidad01_renta]');hold=true;const sent=page.waitForRequest(r=>r.method()==='POST'&&r.postDataJSON()?.tipo==='sheet-cantidades');await edit.fill('0');await edit.dispatchEvent('change');const request=await sent;assert.deepEqual(request.postDataJSON().inputs,{unidad01_renta:0});assert.equal(await page.locator('#pnCaseName').inputValue(),'Nombre pendiente');assert.equal(await page.locator('#pnCaseNotes').inputValue(),'Notas conservadas al repintar');assert.equal(await page.locator('[data-native-result=noi]').innerText(),'1,387,700');while(!release)await new Promise(r=>setTimeout(r,10));release();hold=false;await page.waitForFunction(()=>document.querySelector('.pn-status').textContent==='Lectura confirmada de Sheets');
  await page.locator('[data-native-field=inCus]').fill('');await page.locator('[data-native-field=inCus]').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('[data-native-result=noi]').textContent==='—');assert.equal(posts[1].inputs.inCus,null);assert.equal(await page.locator('[data-native-field=inCus]').inputValue(),'');
  fail=true;await page.locator('[data-native-field=inCus]').fill('3');await page.locator('[data-native-field=inCus]').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('.pn-status').textContent.includes('Otra edición'));assert.equal(await page.locator('[data-native-field=inCus]').inputValue(),'3');assert.equal(await page.locator('[data-native-result=noi]').innerText(),'—');assert.equal(await page.locator('[data-operation=duplicar]').isDisabled(),true);
  // A page reload retains quantities/results while fresh GET detects a revision conflict.
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#patrimonialNative').waitFor();assert.equal(await page.locator('[data-native-field=inCus]').inputValue(),'3');assert.equal(await page.locator('[data-native-result=noi]').innerText(),'—');assert.equal(posts.length,3);assert.equal(await page.locator('#pnCaseName').inputValue(),'Nombre pendiente');assert.equal(await page.locator('#pnCaseNotes').inputValue(),'Notas conservadas al repintar');
  for(const width of [320,390,430,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  if(process.env.PPP_SCREENSHOTS){fs.mkdirSync(process.env.PPP_SCREENSHOTS,{recursive:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-patrimonial-native.png')});}
  assert.deepEqual(errors,[]);assert.ok(posts.every(b=>b.tipo==='sheet-cantidades'&&b.caso_id==='synthetic-case'&&b.revision_esperada&&b.request_id));
  await context.close();console.log('PASS '+name+': native confirmed/pending/CAS/zero rents/cache/mobile; all transport intercepted.');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
