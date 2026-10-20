'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {install,native,draft,compute}=require('./ppp-fixture.js');
async function installHost(context){
 await context.route('https://ppp.test/outer.html',route=>route.fulfill({contentType:'text/html',body:'<iframe referrerpolicy="no-referrer" src="/yod-portal/despacho3d/restored-test.html"></iframe>'}));
 await context.route('https://ppp.test/yod-portal/despacho3d/restored-test.html',route=>route.fulfill({contentType:'text/html',body:`<iframe referrerpolicy="same-origin" src="/potenciales-yod/mixto.html?open=synthetic-case&agent=1&embed=1&view=board"></iframe><script>window.snapshots=[];window.hellos=0;addEventListener('message',e=>{if(e.data.type==='yod:ppp:state')snapshots.push(e.data)});setInterval(()=>{hellos++;document.querySelector('iframe').contentWindow.postMessage({type:'yod:ppp:hello',version:1,nonce:'restored-test',case_id:'agent-case',board_case_id:'synthetic-case',scenario_id:'v8'},location.origin)},100)</script>`}));
}

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 try{
  const context=await browser.newContext(),model=native(),first=model.escenarios[0];
  model.escenarios=Array.from({length:9},(_,i)=>({...first,id:'v'+i,nombre:'Versión '+i,inputs:{...first.inputs}}));
  model.activo='v8';model.estados=Object.fromEntries(model.escenarios.map(v=>[v.id,structuredClone(model.estados[first.id])]));
  const seed={...draft(),sheetModel:structuredClone(model),escenarios:structuredClone(model.escenarios),escActivo:'v8',
   inputs:{...first.inputs,inTerreno:1811},sheetPending:{scenario:'v8',inputs:{inTerreno:1811}}};
  const net=await install(context,{seed,native:true,model});
  await installHost(context);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://ppp.test/outer.html');
  const host=page.frames().find(f=>f.url().includes('/despacho3d/'));
  assert.ok(host);await host.waitForFunction(()=>snapshots.some(s=>s.board?.scenario_id==='v8'),{},{timeout:5000});
  const frame=page.frames().find(f=>f.url().includes('/potenciales-yod/mixto.html'));
  let shared=await host.evaluate(()=>snapshots.at(-1).board);
  assert.equal(shared.version_context.versions.length,9);assert.equal(shared.confirmed,false);assert.equal(shared.pending,true);
  assert.equal(shared.inputs.inTerreno,1800);assert.equal(shared.version_context.viewed_inputs.inTerreno,1811);
  assert.equal(shared.results.profit,model.estados.v8.profit);assert.equal(await frame.locator('#inTerreno').inputValue(),'1811');
  assert.equal(net.gets.includes('caso'),false);assert.equal(net.posts.length,0);
  const saved=await frame.evaluate(()=>JSON.parse(localStorage.getItem('pyod_draft_v1')));
  assert.equal(saved.inputs.inTerreno,1811);assert.equal(saved.sheetPending.inputs.inTerreno,1811);
  assert.equal(await host.evaluate(()=>snapshots.every(s=>s.board?.confirmed===false&&s.board?.pending===true)),true);

  // Cancel preserves the pending quantities; accepting the existing dialog adopts only a fresh native response.
  await frame.locator('#pppEtapas>summary').click();
  const canceled=new Promise(resolve=>page.once('dialog',async dialog=>{await dialog.dismiss();resolve();}));
  await frame.locator('#sheetRecargar').click();await canceled;
  await host.waitForFunction(()=>snapshots.at(-1).board.pending===true);
  assert.equal(await frame.locator('#inTerreno').inputValue(),'1811');assert.equal(net.posts.length,0);
  assert.equal(await host.evaluate(()=>snapshots.every(s=>s.board?.confirmed===false&&s.board?.pending===true)),true);
  model.revision='revision-fresh';model.escenarios[8].inputs.inTerreno=1900;
  model.estados.v8=compute(model.escenarios[8].inputs);
  const accepted=new Promise(resolve=>page.once('dialog',async dialog=>{await dialog.accept();resolve();}));
  await frame.locator('#sheetRecargar').click();await accepted;
  await host.waitForFunction(()=>snapshots.at(-1).board.revision==='revision-fresh'&&snapshots.at(-1).board.confirmed===true);
  shared=await host.evaluate(()=>snapshots.at(-1).board);
  assert.equal(shared.pending,false);assert.equal(shared.inputs.inTerreno,1900);assert.equal(await frame.locator('#inTerreno').inputValue(),'1900');
  assert.equal(shared.results.profit,model.estados.v8.profit);
  assert.equal(net.posts.length,0);assert.deepEqual(errors,[]);
  await context.close();console.log('restored native bridge: nine versions, unconfirmed copy, preserved draft, explicit refresh, zero writes');

  const invalidContext=await browser.newContext(),invalidSeed=structuredClone(seed);invalidSeed.sheetModel.ok=false;
  const invalidNet=await install(invalidContext,{seed:invalidSeed,native:true,model});await installHost(invalidContext);
  const invalidPage=await invalidContext.newPage();await invalidPage.goto('https://ppp.test/outer.html');
  const invalidHost=invalidPage.frames().find(f=>f.url().includes('/despacho3d/'));
  await invalidHost.waitForFunction(()=>hellos>=5);assert.equal(await invalidHost.evaluate(()=>snapshots.length),0);
  assert.equal(invalidNet.posts.length,0);assert.equal(invalidNet.gets.includes('caso'),false);
  await invalidContext.close();console.log('invalid cached native model: never shared or promoted, zero writes');

  const cleanContext=await browser.newContext(),cleanSeed=structuredClone(seed);
  cleanSeed.sheetPending=null;cleanSeed.inputs={...first.inputs};
  const cleanNet=await install(cleanContext,{seed:cleanSeed,native:true,caseError:true,model});await installHost(cleanContext);
  const cleanPage=await cleanContext.newPage();await cleanPage.goto('https://ppp.test/outer.html');
  const cleanHost=cleanPage.frames().find(f=>f.url().includes('/despacho3d/'));
  await cleanHost.waitForFunction(()=>snapshots.some(s=>s.board?.scenario_id==='v8'));
  const copy=await cleanHost.evaluate(()=>snapshots.at(-1).board);
  assert.equal(copy.confirmed,false);assert.equal(copy.pending,true);assert.equal(copy.inputs.inTerreno,1800);assert.equal(copy.version_context.viewed_inputs.inTerreno,1800);
  assert.equal(cleanNet.posts.length,0);await cleanContext.close();console.log('unchanged cached quantities: refresh still required, copy remains unconfirmed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
