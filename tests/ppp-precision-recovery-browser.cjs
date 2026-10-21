'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {install,native,draft}=require('./ppp-fixture.js'),contract=require('../ppp-volumes-native.js');
function model(){
 const m=native();Object.assign(m.escenarios[0].inputs,{inCOS:61.123456789012345,inCUS:3.123456789012345});
 m.capabilities={volumes:{schema:2,read:true,write:true,max_volumes:16,fields:structuredClone(contract.fields),allocation_modes:['preserve','built_area'],shared_resources:[{id:'shared',label:'Shared synthetic resource'}]}};
 m.volumes_by_scenario={[m.activo]:{schema:2,count:3,shared_allocation_mode:'preserve',volumes:[1,2,3].map(i=>({id:'body-'+i,values:Object.fromEntries(contract.fields.map(f=>[f.id,f.id==='name'?'Synthetic body '+i:null]))}))}};return m;
}
(async()=>{
 const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9'},...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 try{
  const m=model(),seed={...draft(),sheetModel:m,escenarios:m.escenarios,inputs:{...m.escenarios[0].inputs},sheetPending:null};
  // A prior browser serialized these controls to 15 significant digits.
  seed.inputs.inCOS=Number(m.escenarios[0].inputs.inCOS.toPrecision(15));
  const context=await browser.newContext(),net=await install(context,{seed,native:true,model:m}),page=await context.newPage();
  page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://ppp.test/potenciales-yod/mixto.html?open=synthetic-case');
  const editor=page.locator('#pppVolumes[data-verified="true"]');await editor.waitFor({state:'visible'});
  assert.equal(await editor.locator('.pppv-card:visible').count(),3);assert.equal(net.posts.length,0);assert.ok(net.gets.includes('caso'));
  await page.reload();await editor.waitFor({state:'visible'});
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pyod_draft_v1')));
  assert.equal(saved.sheetPending,null);assert.equal(saved.inputs.inCOS,m.escenarios[0].inputs.inCOS);
  // A real change must still be transmitted; unrelated precise values must not be.
  await page.locator('#inTerreno').evaluate(el=>{el.value='1811';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('pyod_draft_v1'));return d.sheetModel.revision==='revision-synthetic-1x'&&!d.sheetPending;});
  assert.equal(net.posts.length,1);assert.deepEqual(net.posts[0].inputs,{inTerreno:1811});assert.deepEqual(errors,[]);
  await context.close();console.log('precision: canonical decimals survive reload; zero phantom writes; one real field changed PASS');

  const pendingModel=model(),pendingSeed={...draft(),sheetModel:pendingModel,escenarios:pendingModel.escenarios,inputs:{...pendingModel.escenarios[0].inputs,inTerreno:1811},sheetPending:{scenario:pendingModel.activo,inputs:{inTerreno:1811}}};
  const recovery=await browser.newContext(),recoveryNet=await install(recovery,{seed:pendingSeed,native:true,model:pendingModel}),p=await recovery.newPage();
  p.setDefaultTimeout(60000);p.setDefaultNavigationTimeout(90000);
  let reads=0,release;
  await recovery.route('**/*',async route=>{const url=new URL(route.request().url());if(url.searchParams.get('recurso')!=='sheet-model')return route.fallback();reads++;await new Promise(resolve=>{release=resolve;});return route.fulfill({contentType:'application/json',body:JSON.stringify(pendingModel)});});
  await p.goto('https://ppp.test/potenciales-yod/mixto.html?open=synthetic-case');await p.locator('#pppEtapas>summary').click();
  await p.locator('#sheetRecargar').click();await p.locator('#sheetRecargar').click();
  await p.waitForFunction(()=>document.querySelector('#syncDot').textContent.includes('Leyendo Sheets'));
  assert.equal(reads,1);assert.equal(recoveryNet.posts.length,0);
  const canceled=new Promise(resolve=>p.once('dialog',async d=>{await d.dismiss();resolve();}));release();await canceled;await p.waitForFunction(()=>document.querySelector('#syncDot').textContent.includes('copia conservada')); 
  assert.equal(await p.locator('#inTerreno').inputValue(),'1811');assert.equal(await p.locator('#pppVolumes[data-verified="true"]').count(),0);
  await p.locator('#sheetRecargar').click();const accepted=new Promise(resolve=>p.once('dialog',async d=>{await d.accept();resolve();}));
  for(let i=0;reads<2&&i<300;i++)await new Promise(r=>setTimeout(r,10));assert.equal(reads,2);release();await accepted;
  await p.locator('#pppVolumes[data-verified="true"]').waitFor({state:'visible'});
  assert.equal(await p.locator('#pppVolumes .pppv-card:visible').count(),3);
  assert.equal(await p.locator('#inTerreno').inputValue(),'1800');assert.equal(recoveryNet.posts.length,0);
  await p.reload();await p.locator('#pppVolumes[data-verified="true"]').waitFor({state:'visible'});
  saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('pyod_draft_v1')));assert.equal(saved.sheetPending,null);
  assert.equal(recoveryNet.posts.length,0);await recovery.close();console.log('recovery: coalesced read, cancel preserves draft, accept restores three bodies, clean reload, zero writes PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
