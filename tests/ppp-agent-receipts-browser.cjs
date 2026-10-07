'use strict';
// Real PPP HTML, Store and bridge. Browser-local synthetic book/receipt service only.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {install}=require('./ppp-fixture.js'),fixture=require('./fixtures/patrimonial-native.json');
const parentHTML='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><iframe src="/potenciales-yod/patrimonial.html?open=synthetic-case&agent=1&embed=1" style="width:100%;height:90vh"></iframe><script>'+
'window.messages=[];window.acks=0;window.resolveFailure=false;let queue=Promise.resolve();'+
'window.send=(type,extra={})=>document.querySelector("iframe").contentWindow.postMessage({type,version:1,nonce:"receipt-reload-104",case_id:"synthetic-case",...extra},location.origin);'+
'addEventListener("message",e=>{if(e.origin!==location.origin||e.source!==document.querySelector("iframe").contentWindow)return;messages.push(e.data);queue=queue.then(async()=>{if(e.data.board)window.board=e.data.board;if(e.data.receipt?.ok){const r=e.data.receipt;const response=await fetch("/__receipt-resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:r.request_id,revision:r.revision,case_id:r.case_id,scenario_id:r.scenario_id,acknowledged_at:r.acknowledged_at})});if(!response.ok){window.resolveFailure=true;return;}send("yod:ppp:receipt-ack",{request_id:r.request_id,revision:r.revision});window.acks++;}});});'+
'document.querySelector("iframe").onload=()=>send("yod:ppp:hello");</script>';
(async()=>{for(const [name,engine] of Object.entries({chromium,webkit})){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport:{width:name==='webkit'?390:1280,height:900}});await install(context,{seed:null});
  let model=structuredClone(fixture),writes=[],reads=0,resolveCalls=[],fail=true;const resolved=new Map();
  model.escenarios.find(e=>e.id===model.activo).inputs.inTerrenoM2=500;
  await context.route('https://script.google.com/**',async route=>{
   const req=route.request(),u=new URL(req.url());let out={ok:true};
   if(req.method()==='POST'){
    const p=req.postDataJSON();if(p.tipo==='sheet-cantidades'){
     writes.push(p);assert.equal(writes.length,1,'receipt delivery must never replay the quantity write');assert.equal(p.revision_esperada,model.revision);
     Object.assign(model.escenarios.find(e=>e.id===model.activo).inputs,p.inputs);model.revision='receipt-revision-104';out=model;
    }
   }else if(u.searchParams.get('recurso')==='caso'){reads++;out={ok:true,caso:{caso_id:model.caso_id,nombre_caso:'Proyecto de prueba',palabra:'ensayo',version:1,calculo_sheet:model}};}
   else if(u.searchParams.get('recurso')==='sheet-model'){reads++;out=model;}
   else if(u.searchParams.get('recurso')==='canje')out={ok:true,token:'sy-synthetic-browser-session',boards:'PT',rol:'admin'};
   else if(u.searchParams.get('recurso')==='lista')out={ok:true,casos:[],config:{}};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(out)});
  });
  await context.route('https://ppp.test/__receipt-resolve',async route=>{
   const r=route.request().postDataJSON();resolveCalls.push(r);
   assert.deepEqual(Object.keys(r).sort(),['acknowledged_at','case_id','request_id','revision','scenario_id']);
   assert.equal(r.request_id,'board-reload-104');assert.equal(r.case_id,model.caso_id);assert.equal(r.scenario_id,model.activo);assert.equal(r.revision,model.revision);
   if(fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});}
   const prior=resolved.get(r.request_id);if(prior)assert.deepEqual(r,prior);else resolved.set(r.request_id,r);
   return route.fulfill({contentType:'application/json',body:'{"ok":true}'});
  });
  await context.route('https://ppp.test/yod-portal/despacho3d/__receipt',route=>route.fulfill({contentType:'text/html',body:parentHTML}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://ppp.test/yod-portal/despacho3d/__receipt');await page.waitForFunction(()=>window.board?.confirmed);
  await page.evaluate(()=>send('yod:ppp:apply',{proposal:{request_id:'board-reload-104',case_id:board.case_id,scenario_id:board.scenario_id,revision:board.revision,cambios:[{campo:'inTerrenoM2',valor:644}]}}));
  await page.waitForFunction(()=>window.resolveFailure);
  const cached=await page.evaluate(()=>JSON.parse(localStorage.getItem('pyod_patrimonial_native_v1:synthetic-case')));
  assert.equal(cached.job,null);assert.equal(cached.receipts.length,1);assert.equal(writes.length,1);
  const firstReceipt=structuredClone(resolveCalls[0]),priorReads=reads;
  await page.reload();await page.waitForFunction(()=>window.acks>0);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('pyod_patrimonial_native_v1:synthetic-case')).receipts.length===0);
  assert.ok(reads>priorReads,'full reload must obtain a new server read before receipt replay');
  assert.equal(writes.length,1);assert.equal(resolved.size,1);assert.deepEqual(resolveCalls.at(-1),firstReceipt);
  assert.equal(await page.evaluate(()=>board.inputs.inTerrenoM2),644);assert.equal(await page.evaluate(()=>board.confirmed),true);
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS '+name+': one quantity write, validated ACK, resolve503, full reload, fresh book read, exact durable receipt and receipt-ack removal; synthetic services.');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
