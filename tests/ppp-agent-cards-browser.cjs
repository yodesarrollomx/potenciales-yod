'use strict';
// Actual PPP HTML/Store/bridge, synthetic transport only. Never reaches a business endpoint.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {install}=require('./ppp-fixture.js'),fixture=require('./fixtures/patrimonial-native.json');
(async()=>{for(const [name,engine] of Object.entries({chromium,webkit})){
 const browser=await engine.launch();try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await install(context,{seed:null});
  let model=structuredClone(fixture),posts=[],loseReceipt=false;const receipts=new Map();model.escenarios.find(e=>e.id===model.activo).inputs.inTerrenoM2=500;
  await context.route('https://script.google.com/**',async route=>{
   const req=route.request(),u=new URL(req.url());let out={ok:true};
   if(req.method()==='POST'){const b=req.postDataJSON();if(b.tipo==='sheet-cantidades'){
    posts.push(b);assert.equal(b.caso_id,model.caso_id);if(receipts.has(b.request_id))out=receipts.get(b.request_id);else{assert.equal(b.revision_esperada,model.revision);
    Object.assign(model.escenarios.find(e=>e.id===model.activo).inputs,b.inputs);model.revision+='x';receipts.set(b.request_id,structuredClone(model));out=loseReceipt?{ok:false,error:'sin_confirmacion'}:model;}
   }}else if(u.searchParams.get('recurso')==='caso')out={ok:true,caso:{caso_id:model.caso_id,nombre_caso:'Proyecto de prueba',palabra:'ensayo',version:1,calculo_sheet:model}};
   else if(u.searchParams.get('recurso')==='sheet-model')out=model;
   else if(u.searchParams.get('recurso')==='canje')out={ok:true,token:'sy-synthetic-browser-session',boards:'PT',rol:'admin'};
   else if(u.searchParams.get('recurso')==='lista')out={ok:true,casos:[],config:{}};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(out)});
  });
  await context.route('https://ppp.test/yod-portal/despacho3d/__cards',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><iframe src="/potenciales-yod/patrimonial.html?open=synthetic-case&agent=1&embed=1" style="width:100%;height:100vh;border:0"></iframe><script>window.messages=[];window.send=(type,extra={})=>document.querySelector("iframe").contentWindow.postMessage({type,version:1,nonce:"test-cards-102",case_id:"synthetic-case",...extra},location.origin);addEventListener("message",e=>{if(e.source===document.querySelector("iframe").contentWindow&&e.origin===location.origin){messages.push(e.data);if(e.data.board)window.board=e.data.board;}});document.querySelector("iframe").onload=()=>send("yod:ppp:hello");</script>'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://ppp.test/yod-portal/despacho3d/__cards');
  const frame=page.frameLocator('iframe');await frame.locator('.pn-data-card').first().waitFor();
  await page.evaluate(()=>send('yod:ppp:hello'));
  await page.waitForFunction(()=>window.board?.confirmed);
  assert.equal(await frame.locator('.pn-data-card').count(),6);assert.equal(await frame.locator('.pn-data-card[open]').count(),0);
  assert.equal(await frame.locator('#patrimonialNative input').count(),0);
  await frame.locator('[data-card=terreno] summary').click();
  assert.equal(await frame.locator('[data-input=inTerrenoM2] strong').innerText(),'500');
  await page.waitForFunction(()=>window.board?.focus?.card==='terreno');
  assert.equal(await page.evaluate(()=>board.fields.length),269);
  await page.evaluate(()=>send('yod:ppp:apply',{proposal:{request_id:'board-synthetic-cards',case_id:board.case_id,scenario_id:board.scenario_id,revision:board.revision,motivo:'Corrección solicitada',cambios:[{campo:'inTerrenoM2',valor:644}]}}));
  await page.waitForFunction(()=>messages.some(m=>m.receipt?.ok));
  assert.equal(posts.length,1);assert.deepEqual(posts[0].inputs,{inTerrenoM2:644});
  assert.equal(await frame.locator('[data-input=inTerrenoM2] strong').innerText(),'644');
  assert.equal(await frame.locator('.pn-data-card[open]').count(),1);
  assert.equal(await page.evaluate(()=>board.inputs.inTerrenoM2),644);
  await frame.locator('[data-card=ingresos] summary').click();
  assert.equal(await frame.locator('.pn-data-card[open]').count(),1);
  await frame.locator('[data-card=ingresos] summary').press('Enter');
  assert.equal(await frame.locator('.pn-data-card[open]').count(),0);
  assert.ok(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(process.env.PPP_SCREENSHOTS){fs.mkdirSync(process.env.PPP_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-agent-cards-'+width+'.png')});if(name==='chromium')console.log('PPP_CARDS_'+width+'='+ (await page.screenshot({type:'jpeg',quality:65})).toString('base64'));}
  // Lost ACK: same request, no duplicate write, recovered without manual data entry.
  loseReceipt=true;
  await page.evaluate(()=>send('yod:ppp:apply',{proposal:{request_id:'board-synthetic-lost',case_id:board.case_id,scenario_id:board.scenario_id,revision:board.revision,motivo:'Corrección solicitada',cambios:[{campo:'inTerrenoM2',valor:700}]}}));
  await page.waitForFunction(()=>messages.some(m=>m.receipt?.request_id==='board-synthetic-lost'&&!m.receipt.ok));
  await frame.getByRole('button',{name:'Comprobar guardado'}).click();
  await page.waitForFunction(()=>messages.some(m=>m.receipt?.request_id==='board-synthetic-lost'&&m.receipt.ok));
  assert.equal(posts.length,3);assert.equal(posts[1].request_id,posts[2].request_id);assert.equal(receipts.size,2);
  // Reload the canonical, non-embedded PPP against the same synthetic book.
  const canonical=await context.newPage();await canonical.goto('https://ppp.test/potenciales-yod/patrimonial.html?open=synthetic-case');
  await canonical.locator('#patrimonialNative').waitFor();
  assert.equal(await canonical.locator('[data-native-field=inTerrenoM2]').inputValue(),'700');
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS '+name+' '+width+': original cards/Store/bridge, 500→644 receipt, focus, keyboard, canonical reload; synthetic book.');
 }}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
