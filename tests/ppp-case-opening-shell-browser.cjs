'use strict';
// Standalone Patrimonial uses the real shell from the pinned atlas checkout. Network transports are synthetic.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {install}=require('./ppp-fixture.js'),fixture=require('./fixtures/patrimonial-native.json');
const session='sy-synthetic-browser-session';
(async()=>{for(const [engineName,engine]of Object.entries({chromium,webkit})){
 const browser=await engine.launch();try{for(const width of [1280,390])for(const scenario of ['loading','error','revoked']){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await install(context,{seed:null});
  let releaseRead,signalHeld,reads=0,corrected=false,shellLoads=0;const held=new Promise(resolve=>signalHeld=resolve),businessPosts=[],errors=[];
  context.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/os/shell.js'))shellLoads++;});
  await context.route('https://script.google.com/**',async route=>{
   const request=route.request(),url=new URL(request.url()),action=url.searchParams.get('recurso');let out={ok:true};
   if(request.method()==='POST'){const payload=request.postDataJSON();if(payload?.tipo!=='bitacora')businessPosts.push(payload);}
   else if(action==='canje')out={ok:true,token:session,boards:'PT',rol:'admin',nombre:'Usuario sintético',correo:'synthetic@example.invalid'};
   else if(action==='caso'){
    reads++;
    if(scenario==='loading'&&reads===1)await new Promise(resolve=>{releaseRead=resolve;signalHeld();});
    if(scenario==='error'&&!corrected)out={ok:false,error:'no_existe'};
    else if(scenario==='revoked'&&!corrected)out={ok:false,error:'revocado'};
    else out={ok:true,caso:{caso_id:fixture.caso_id,nombre_caso:'PPP de prueba',palabra:'ensayo',version:1,calculo_sheet:structuredClone(fixture)}};
   }else if(action==='lista')out={ok:true,casos:[],config:{}};
   else if(action==='sheet-model')out=structuredClone(fixture);
   else out={ok:true,actor:'SESSION',rows:[{system_id:'SYS-POTENCIALES',visible:'SI',titulo_portal:'PPP',orden:1}],known_system_ids:['SYS-POTENCIALES']};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(out)});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('https://ppp.test/potenciales-yod/patrimonial.html?open=synthetic-case',{waitUntil:'load'});
  await page.locator('.yod-shell').waitFor();await page.locator('.yod-canvas').waitFor();
  assert.equal(shellLoads,1,'real shell loaded once, without embed bypass');
  assert.equal(await page.locator('#pppCaseOpening').evaluate(node=>!!node.closest('.yod-canvas')),true);
  if(scenario==='loading'){
   await held;await page.locator('#pppCaseOpening').getByText('Abriendo tu plan de potencial',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Volver a conectar el plan',includeHidden:true}).isVisible(),false);
   assert.equal(await page.locator('main.container').first().isVisible(),false,'old board hidden during verification');
   releaseRead();
  }else{
   await page.locator('#pppCaseOpening').getByText(scenario==='error'?'No se pudo abrir este plan':'Valida el acceso al plan',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Volver a conectar el plan'}).isVisible(),true,'recovery visible inside real shell');
   if(scenario==='revoked')assert.equal(await page.locator('#pppCaseOpening').getByRole('button',{name:'Entrar con Google'}).isVisible(),true);
   assert.equal(await page.locator('main.container').first().isVisible(),false,'data remains hidden after failed read');
   corrected=true;await page.getByRole('button',{name:'Volver a conectar el plan'}).click();
  }
  await page.locator('#patrimonialNative').waitFor();
  assert.equal(await page.locator('#pppCaseOpening').isVisible(),false);assert.equal(await page.locator('.yod-shell').isVisible(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('pyod_clave_v1')),session);
  assert.equal(reads,scenario==='loading'?1:2);assert.equal(businessPosts.length,0);assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await context.close();console.log(engineName+' '+width+' standalone '+scenario+': actual HTML and pinned shell, recovery visible, zero business writes');
 }}finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
