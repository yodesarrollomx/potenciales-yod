'use strict';
// The checked-in Patrimonial HTML, opener, Store and bridge run together. All requests are intercepted.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {install}=require('./ppp-fixture.js'),fixture=require('./fixtures/patrimonial-native.json');
const session='sy-synthetic-browser-session';
const parent='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><iframe title="PPP" src="/potenciales-yod/patrimonial.html?open=synthetic-case&agent=1&embed=1" style="width:100%;height:100vh;border:0"></iframe><script>window.board=null;addEventListener("message",e=>{if(e.origin===location.origin&&e.source===document.querySelector("iframe").contentWindow&&e.data?.type==="yod:ppp:state"&&e.data.nonce==="opening-test-140")window.board=e.data.board;});setInterval(()=>document.querySelector("iframe").contentWindow.postMessage({type:"yod:ppp:hello",version:1,nonce:"opening-test-140",case_id:"synthetic-case"},location.origin),100);</script>';
(async()=>{for(const [engineName,engine] of Object.entries({chromium,webkit})){
 const browser=await engine.launch();try{for(const width of [1280,390])for(const scenario of ['catalog-independent','transient','wrong-case','revoked']){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await install(context,{seed:null});
  const reads=[],businessPosts=[],errors=[];let caseReads=0,corrected=false;
  await context.route('https://script.google.com/**',async route=>{
   const request=route.request(),url=new URL(request.url()),action=url.searchParams.get('recurso');let out={ok:true};
   if(request.method()==='POST'){const payload=request.postDataJSON();if(payload?.tipo!=='bitacora')businessPosts.push(payload);}
   else {
    reads.push(action);
    if(action==='canje')out={ok:true,token:session,boards:'PT',rol:'admin'};
    else if(action==='lista')out={ok:false,error:'lock_busy'};
    else if(action==='caso'){
     caseReads++;
     if(scenario==='transient'&&caseReads===1)out={ok:false,error:'lock_busy'};
     else if(scenario==='revoked')out={ok:false,error:'revocado'};
     else {const model=structuredClone(fixture),id=scenario==='wrong-case'&&!corrected?'other-case':model.caso_id;model.caso_id=id;out={ok:true,caso:{caso_id:id,nombre_caso:'PPP de prueba',palabra:'ensayo',version:1,calculo_sheet:model}};}
    }else if(action==='sheet-model')out=structuredClone(fixture);
   }
   return route.fulfill({contentType:'application/json',body:JSON.stringify(out)});
  });
  await context.route('https://ppp.test/yod-portal/despacho3d/__opening',route=>route.fulfill({contentType:'text/html',body:parent}));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('https://ppp.test/yod-portal/despacho3d/__opening');const frame=page.frameLocator('iframe[title=PPP]');
  if(scenario==='wrong-case'){
   await frame.locator('#pppCaseOpening').getByText('La respuesta no corresponde a este caso. No se aplicó.').waitFor();
   assert.equal(await frame.locator('#patrimonialNative').count(),0,'foreign model was not mounted');
   assert.equal(await page.frames().find(f=>f.url().includes('patrimonial.html')).evaluate(()=>localStorage.getItem('pyod_clave_v1')),session);
   corrected=true;await frame.getByRole('button',{name:'Volver a conectar el plan'}).click();
  }else if(scenario==='revoked'){
   await frame.locator('#pppCaseOpening').getByText('Valida el acceso al plan').waitFor();
   assert.equal(await frame.locator('#patrimonialNative').count(),0);assert.equal(caseReads,1);
  }
  if(scenario!=='revoked'){
   await frame.locator('#patrimonialNative').waitFor();await page.waitForFunction(()=>window.board?.confirmed===true);
   assert.equal(await frame.locator('#pppCaseOpening').isVisible(),false);
   assert.equal(await frame.locator('.pn-data-card[open]').count(),0,'native cards stay closed');
   if(scenario==='transient')assert.equal(caseReads,2);else if(scenario==='catalog-independent')assert.equal(caseReads,1);else assert.equal(caseReads,2);
  }
  const inner=page.frames().find(f=>f.url().includes('patrimonial.html'));
  assert.equal(await inner.evaluate(()=>localStorage.getItem('pyod_clave_v1')),session,'PPP must not erase OS credential');
  assert.ok(!reads.includes('lista'),'exact opening does not await or load the full catalog');
  assert.equal(businessPosts.length,0);assert.deepEqual(errors,[]);
  assert.equal(await inner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'viewport overflow');
  await context.close();
  console.log(engineName+' '+width+' '+scenario+': real HTML and bridge, isolated transport, zero business writes');
 }}finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
