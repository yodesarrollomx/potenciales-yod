'use strict';
// Regression of the real HTML and view. Every request is intercepted by the
// existing synthetic fixture; no business service or authenticated data is used.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {install,native,inputs}=require('./ppp-fixture.js');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport}),model=native(),net=await install(context,{seed:null,native:true,model});
  await context.route('https://ppp.test/yod-portal/despacho3d/navigation-test.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe src="/potenciales-yod/mixto.html?open=synthetic-case&agent=1&embed=1"></iframe><script>window.receipts=[];window.boards=[];addEventListener("message",e=>{if(e.source!==document.querySelector("iframe").contentWindow||e.origin!==location.origin)return;if(e.data.type==="yod:ppp:navigation")receipts.push(e.data);if(e.data.type==="yod:ppp:state")boards.push(e.data)});setInterval(()=>document.querySelector("iframe").contentWindow.postMessage({type:"yod:ppp:hello",version:1,nonce:"navigation-synthetic",case_id:"synthetic-case",board_case_id:"synthetic-case",agent_case_id:"synthetic-agent",scenario_id:"test-base",presentation:{volume_draft:true}},location.origin),100)</script>'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://ppp.test/yod-portal/despacho3d/navigation-test.html');
  await page.waitForFunction(()=>boards.some(x=>x.board?.confirmed&&x.capabilities?.navigate),{},{timeout:20000});
  const frame=page.frames().find(f=>f.url().includes('/potenciales-yod/mixto.html'));
  const before=await frame.evaluate(()=>({inputs:Object.fromEntries([...document.querySelectorAll('input[type=range]')].map(n=>[n.id,n.value])),draft:localStorage.getItem('pyod_draft_v1')}));
  let count=0;
  async function navigation(target,patch={}){
   const request_id='navigation-'+(++count);
   await page.evaluate(message=>document.querySelector('iframe').contentWindow.postMessage(message,location.origin),{type:'yod:ppp:navigate',version:1,nonce:'navigation-synthetic',case_id:'synthetic-case',board_case_id:'synthetic-case',scenario_id:'test-base',revision:model.revision,request_id,target,...patch});
   await page.waitForFunction(id=>receipts.some(r=>r.request_id===id),request_id);
   return page.evaluate(id=>receipts.find(r=>r.request_id===id),request_id);
  }
  for(const [target,section]of [['terreno','dArq'],['ventas','dVentas'],['costos','dCostos'],['calendario','dCostos'],['dMacro','dMacro'],['dDota','dDota'],['plan','plan']]){
   const receipt=await navigation(target);assert.equal(receipt.status,'confirmed',target+': '+JSON.stringify(receipt));
   assert.equal(receipt.observed.case_id,'synthetic-agent');assert.equal(receipt.observed.board_case_id,'synthetic-case');assert.equal(receipt.observed.scenario_id,'test-base');assert.equal(receipt.observed.revision,model.revision);assert.equal(receipt.observed.section_id,section);
   assert.equal(await frame.evaluate(()=>document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')),false);
  }
  const input=frame.locator('#inTerreno');await frame.evaluate(()=>{PPPView.toggle('dArq',true);PPPView.adjust('dArq');document.getElementById('inTerreno').focus();});
  const editing=await navigation('ventas');assert.equal(editing.status,'unavailable');assert.equal(editing.code,'editing_in_progress');assert.equal(await input.evaluate(n=>document.activeElement===n),true);
  await frame.evaluate(()=>document.activeElement.blur());
  const stale=await navigation('terreno',{revision:'stale'});assert.equal(stale.status,'unavailable');assert.equal(stale.code,'revision_changed');
  const other=await navigation('terreno',{scenario_id:'different'});assert.equal(other.status,'unavailable');assert.equal(other.code,'scenario_changed');
  const missing=await navigation('arbitrary');assert.equal(missing.status,'unsupported');
  const volumes=await navigation('dVolumenes');assert.equal(volumes.status,'unsupported','a nonpilot case has no volume editor');
  const after=await frame.evaluate(()=>({inputs:Object.fromEntries([...document.querySelectorAll('input[type=range]')].map(n=>[n.id,n.value])),draft:localStorage.getItem('pyod_draft_v1')}));
  assert.deepEqual(after,before);assert.equal(net.posts.length,0);assert.deepEqual(errors,[]);assert.equal(Number(after.inputs.inTerreno),inputs.inTerreno);
  await context.close();console.log(viewport.width+'px: exact navigation receipts, no focus/value/scenario changes and zero business writes');
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
