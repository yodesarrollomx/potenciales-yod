'use strict';
// Actual Portal createWorkspace and PPP HTML/Store/bridge. Only auth/book/cloud are synthetic.
// No 3D-office renderer, real microphone, private credentials or business endpoint.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {install}=require('./ppp-fixture.js'),fixture=require('./fixtures/patrimonial-native.json');
const ORIGIN='https://yodesarrollomx.github.io',BASE=ORIGIN+'/yod-portal/despacho3d/',CLOUD='https://synthetic-cloud.onrender.com';
const parentHTML='<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1">'+
'<link rel="stylesheet" href="'+BASE+'agent-workspace.css"><body style="margin:0;background:#f4f3ee"><main id="host"></main><script type="module">'+
'import {createWorkspace} from "./agent-workspace.mjs";'+
'const selection={case_id:"synthetic-case",name:"Proyecto de prueba",can_enqueue:true,goals:{ready:false},ppp:{case_id:"synthetic-case",url:"'+ORIGIN+'/potenciales-yod/patrimonial.html?open=synthetic-case"}};'+
'const transport={mintFastSession:async()=>({ok:true,case_id:selection.case_id,token:"A".repeat(40)+"."+"a".repeat(64),endpoint:"'+CLOUD+'",expires_at:Date.now()+600000}),read:async()=>({ok:true,case_id:selection.case_id,source_revision:"test-source-1",context:{identity:{name:selection.name,case_id:selection.case_id},documents:[["source-ppp","PPP registrado",selection.ppp.url,"PPP"]]},state:{updated_at:new Date().toISOString()},conversation:[],jobs:[],events:[]})};'+
'window.workspace=createWorkspace({container:document.getElementById("host"),getSelection:()=>selection,transport});workspace.open(selection,"ppp");</script></html>';
(async()=>{for(const [name,engine] of Object.entries({chromium,webkit})){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport:{width:name==='webkit'?390:1280,height:900}});await install(context,{seed:null});
  const root=path.resolve(__dirname,'..'),atlas=path.resolve(process.env.YOD_ATLAS_DIR||path.join(root,'../yod-atlas'));
  await context.route(ORIGIN+'/**',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/yod-portal/despacho3d/__receipt')return route.fulfill({contentType:'text/html',body:parentHTML});
   const prefix=u.pathname.startsWith('/yod-portal/')?'/yod-portal/':u.pathname.startsWith('/potenciales-yod/')?'/potenciales-yod/':null;
   if(!prefix)return route.abort();
   const base=prefix==='/yod-portal/'?atlas:root,file=path.resolve(base,u.pathname.slice(prefix.length));
   if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   const type=/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html; charset=utf-8';
   return route.fulfill({contentType:type,body:fs.readFileSync(file)});
  });
  let model=structuredClone(fixture),writes=[],reads=0,resolveCalls=[],fail=true,board=null,proposals=[],historicalMode=false,expectedRequest='board-reload-104',expectedValue=644;const resolved=new Map();
  model.escenarios.find(e=>e.id===model.activo).inputs.inTerrenoM2=500;
  await context.route('https://script.google.com/**',async route=>{
   const req=route.request(),u=new URL(req.url());let out={ok:true};
   if(req.method()==='POST'){
    const p=req.postDataJSON();if(!p){console.log('Rejected empty synthetic Apps Script POST in '+name);return route.fulfill({status:400,contentType:'application/json',body:'{"ok":false,"error":"empty_request"}'});}if(p.tipo==='sheet-cantidades'){
     assert.equal(writes.filter(w=>w.request_id===p.request_id).length,0,'receipt delivery must never replay a quantity write');assert.equal(p.request_id,expectedRequest);writes.push(p);assert.equal(p.revision_esperada,model.revision);
     Object.assign(model.escenarios.find(e=>e.id===model.activo).inputs,p.inputs);model.revision='receipt-revision-104-'+writes.length;out=model;
    }
   }else if(u.searchParams.get('recurso')==='caso'){reads++;out={ok:true,caso:{caso_id:model.caso_id,nombre_caso:'Proyecto de prueba',palabra:'ensayo',version:1,calculo_sheet:model}};}
   else if(u.searchParams.get('recurso')==='sheet-model'){reads++;out=model;}
   else if(u.searchParams.get('recurso')==='canje')out={ok:true,token:'sy-synthetic-browser-session',boards:'PT',rol:'admin'};
   else if(u.searchParams.get('recurso')==='lista')out={ok:true,casos:[],config:{}};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(out)});
  });
  await context.route(CLOUD+'/**',async route=>{
   const req=route.request(),pathname=new URL(req.url()).pathname;
   const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   const payload=req.postDataJSON();let out;
   if(pathname==='/board/snapshot'){board=payload;out={ok:true,tablero:board};}
   else if(pathname==='/board/state')out={ok:true,tablero:board,proposals};
   else if(pathname==='/board/resolve'){
    resolveCalls.push(payload);
    if(historicalMode&&payload.request_id.startsWith('board-old-')){
     const prior=resolved.get(payload.request_id);
     if(!prior||prior.revision!==payload.revision)return route.fulfill({status:400,headers,contentType:'application/json',body:'{"ok":false,"error":"invalid_board"}'});
     assert.equal(payload.status,'applied');return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({ok:true,request_id:payload.request_id,status:'applied'})});
    }
    assert.deepEqual(Object.keys(payload).sort(),['request_id','revision','status']);
    assert.equal(payload.request_id,expectedRequest);assert.equal(payload.status,'applied');assert.equal(payload.revision,model.revision);
    assert.equal(board?.confirmed,true);assert.equal(board.pending,false);assert.equal(board.revision,payload.revision);assert.equal(board.scenario_id,model.activo);
    assert.equal(board.inputs.inTerrenoM2,expectedValue);
    if(fail){fail=false;return route.fulfill({status:503,headers,contentType:'application/json',body:'{"ok":false}'});}
    const prior=resolved.get(payload.request_id);if(prior)assert.deepEqual(payload,prior);else resolved.set(payload.request_id,payload);
    proposals=[];out={ok:true,request_id:payload.request_id,status:'applied'};
   }else if(pathname==='/board/clear'){board=null;out={ok:true};}
   else throw Error('Unexpected synthetic-cloud route: '+pathname);
   return route.fulfill({headers,contentType:'application/json',body:JSON.stringify(out)});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(BASE+'__receipt');await page.bringToFront();
   const frame=page.frameLocator('iframe');await frame.locator('.pn-data-card').first().waitFor();
   await page.waitForFunction(()=>document.querySelector('.workspace-ppp-summary')?.textContent.includes('Lectura confirmada'));
   assert.equal(await frame.locator('.pn-data-card').count(),6);
   proposals=[{request_id:'board-reload-104',case_id:model.caso_id,scenario_id:model.activo,revision:model.revision,motivo:'Corrección explícita de prueba',cambios:[{campo:'inTerrenoM2',label:'Terreno',antes:500,valor:644}],apply_requested_at:new Date().toISOString(),apply_expires_at:new Date(Date.now()+120000).toISOString()}];
   await page.getByText('Conexión y variantes',{exact:true}).click();await page.getByRole('button',{name:'Actualizar conexión',exact:true}).click();
   await page.getByRole('button',{name:'Comprobar confirmación',exact:true}).waitFor();
   const cached=await page.evaluate(()=>JSON.parse(localStorage.getItem('pyod_patrimonial_native_v1:synthetic-case')));
   assert.equal(cached.job,null);assert.equal(cached.receipts.length,1);assert.equal(writes.length,1);
   assert.equal(resolveCalls.length,1);const firstReceipt=structuredClone(resolveCalls[0]),priorReads=reads;
   assert.deepEqual(Object.keys(cached.receipts[0]).sort(),['acknowledged_at','case_id','request_id','revision','scenario_id']);
   await page.reload();await page.bringToFront();
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('pyod_patrimonial_native_v1:synthetic-case'))?.receipts?.length===0);
   await page.waitForFunction(()=>document.querySelector('.workspace-apply-status')?.textContent.includes('guardado y confirmado'));
   assert.ok(reads>priorReads,'full reload must obtain a new server read before receipt replay');
   assert.equal(writes.length,1);assert.equal(resolved.size,1);assert.deepEqual(resolveCalls.at(-1),firstReceipt);
   await frame.locator('[data-card=terreno] summary').click();assert.equal(await frame.locator('[data-input=inTerrenoM2] strong').innerText(),'644');
   assert.deepEqual(errors,[]);
   if(process.env.PPP_SCREENSHOTS){fs.mkdirSync(process.env.PPP_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-receipt-workspace.png'),fullPage:true});}
   if(name==='chromium')console.log('RECEIPT_WORKSPACE_PREVIEW='+(await page.screenshot({type:'jpeg',quality:60})).toString('base64'));
   console.log('PASS '+name+': actual createWorkspace + actual PPP HTML/Store/bridge; one quantity write, validated ACK, resolve503, full reload, fresh book read, exact durable receipt, parent receipt-ack removal. Synthetic services only.');
   // Seed only synthetic minimal ACK metadata for historical reconciliation. Existing quantities remain untouched.
   historicalMode=true;
   const oldReceipts=Array.from({length:8},(_,i)=>({request_id:'board-old-'+i,case_id:model.caso_id,scenario_id:model.activo,revision:'old-revision-'+i,acknowledged_at:'2026-10-07T06:00:00.000Z'}));
   for(const r of oldReceipts.slice(0,7))resolved.set(r.request_id,{request_id:r.request_id,status:'applied',revision:r.revision});
   await page.evaluate(receipts=>{const key='pyod_patrimonial_native_v1:synthetic-case',cache=JSON.parse(localStorage.getItem(key));cache.receipts=receipts;localStorage.setItem(key,JSON.stringify(cache));},oldReceipts);
   const historyReads=reads;await page.reload();await page.bringToFront();
   await page.waitForFunction(()=>{const r=JSON.parse(localStorage.getItem('pyod_patrimonial_native_v1:synthetic-case'))?.receipts;return r?.length===1&&r[0].request_id==='board-old-7';});
   assert.ok(reads>historyReads);assert.equal(writes.length,1);
   const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('pyod_patrimonial_native_v1:synthetic-case')).receipts);
   assert.deepEqual(pending,[oldReceipts[7]],'unconfirmed history must remain even when current quantities match');
   assert.equal(resolved.size,8);assert.deepEqual(errors,[]);
   console.log('PASS '+name+': eight historical ACK candidates after fresh read; seven previously registered server receipts drain, unknown historical receipt remains, no quantity rewrite. Synthetic history/service.');
   // An unconfirmed historical receipt does not consume another proposal's identity or block the seven free slots.
   expectedRequest='board-next-104';expectedValue=700;
   proposals=[{request_id:expectedRequest,case_id:model.caso_id,scenario_id:model.activo,revision:model.revision,motivo:'Otro cambio explícito de prueba',cambios:[{campo:'inTerrenoM2',label:'Terreno',antes:644,valor:700}],apply_requested_at:new Date().toISOString(),apply_expires_at:new Date(Date.now()+120000).toISOString()}];
   await page.getByText('Conexión y variantes',{exact:true}).click();await page.getByRole('button',{name:'Actualizar conexión',exact:true}).click();
   await page.waitForFunction(()=>{const c=JSON.parse(localStorage.getItem('pyod_patrimonial_native_v1:synthetic-case'));return c?.model?.revision==='receipt-revision-104-2'&&c?.receipts?.length===1&&c.receipts[0].request_id==='board-old-7';});
   assert.equal(writes.length,2);assert.deepEqual(writes.map(w=>w.request_id),['board-reload-104','board-next-104']);
   assert.equal(resolved.size,9);assert.deepEqual(errors,[]);
   console.log('PASS '+name+': retained historical receipt does not block a different explicitly requested adjustment; one write per distinct request, exact acknowledgements only.');


  }catch(e){console.error('receipt workspace diagnostic',JSON.stringify({browser:name,reads,writes:writes.length,resolveCalls:resolveCalls.length,errors,text:await page.locator('body').innerText().catch(()=>''),frames:page.frames().map(f=>f.url())}));throw e;}
  await context.close();
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
