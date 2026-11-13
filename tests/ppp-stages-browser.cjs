'use strict';
// Existing vertical board, real event handlers, isolated synthetic Sheets transport.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {install,native,draft}=require('./ppp-fixture.js'),contract=require('../ppp-stages.js');
const copy=v=>JSON.parse(JSON.stringify(v));
const capability={schema:1,read:true,write:true,max_stages:24,max_months:1200,modes:['sequential'],allocation_modes:['preserve'],assumption:'Etapas consecutivas; se conservan las distribuciones existentes.'};
function collection(count=1,duration=12){return{schema:1,count,duration_months:duration,mode:'sequential',allocation:'preserve',stages:Array.from({length:count},(_,i)=>({id:'stage-'+(i+1),order:i+1,start_month:1+i*duration,duration_months:duration,end_month:(i+1)*duration}))};}
function stageModel(id='synthetic-case'){const m=native();m.caso_id=id;m.capabilities={stages:copy(capability)};m.stages_by_scenario={[m.activo]:collection()};return m;}
async function fixture(context,{uncertain=false,hold=false,available=true}={}){
 const model=stageModel(),other=stageModel('synthetic-other');if(!available)delete model.capabilities;
 const net=await install(context,{seed:null,native:true,model,cases:[{...draft().caso},{...draft().caso,caso_id:'synthetic-other',nombre_caso:'Other synthetic project'}]}),writes=[],reads=[];let lastReceipt=null,release=null;
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(!/script\.google/.test(url.hostname))return route.fallback();
  if(request.method()==='POST'&&request.postDataJSON()?.tipo==='sheet-stages'){
   const payload=request.postDataJSON();writes.push(copy(payload));assert.equal(payload.caso_id,'synthetic-case');assert.equal(payload.escenario_id,model.activo);assert.equal(payload.revision_esperada,model.revision);assert.deepEqual(Object.keys(payload.stages).sort(),['allocation','count','duration_months','mode','schema']);assert.equal(Object.hasOwn(payload,'inputs'),false);assert.equal(Object.hasOwn(payload,'formulas'),false);assert.equal(Object.hasOwn(payload,'volumes'),false);
   model.revision='stage-synthetic-r2';model.stages_by_scenario[payload.escenario_id]=collection(payload.stages.count,payload.stages.duration_months);
   // Distinctive declared mock output: this test does not recalculate finance.
   model.estados[payload.escenario_id].profit=123456789;
   model.stage_receipt={request_id:payload.request_id,caso_id:payload.caso_id,escenario_id:payload.escenario_id,base_revision:payload.revision_esperada,result_revision:model.revision,stages:copy(model.stages_by_scenario[payload.escenario_id]),calculated:true,checks:Object.fromEntries(contract.CHECKS.map(k=>[k,true]))};lastReceipt=copy(model);
   if(hold)await new Promise(resolve=>{release=resolve;});
   if(uncertain)return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"synthetic_uncertain"}'});
   return route.fulfill({contentType:'application/json',body:JSON.stringify(model)});
  }
  if(request.method()==='GET'&&url.searchParams.get('recurso')==='sheet-stages-receipt'){reads.push({request_id:url.searchParams.get('request_id'),caso_id:url.searchParams.get('caso_id'),escenario_id:url.searchParams.get('escenario_id')});return route.fulfill({contentType:'application/json',body:JSON.stringify(lastReceipt||{ok:false,error:'not_found'})});}
  if(request.method()==='GET'&&url.searchParams.get('recurso')==='caso'&&url.searchParams.get('id')==='synthetic-other')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,caso:{...draft().caso,caso_id:'synthetic-other',nombre_caso:'Other synthetic project',escenarios_json:JSON.stringify(other.escenarios),calculo_sheet:other}})});
  return route.fallback();
 });return{model,net,writes,reads,release:()=>release?.()};
}
async function open(page){const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://ppp.test/potenciales-yod/mixto.html?open=synthetic-case');const editor=page.locator('#pppStages');await page.waitForFunction(()=>document.querySelector('#pppStages textarea')?.disabled===false,{},{timeout:10000}).catch(async e=>{console.error({errors,sync:await page.locator('#syncDot').textContent(),stages:await editor.textContent()});throw e;});return editor;}
async function review(editor,writes,{caseId,version,revision}={}){
 const before=writes.length;
 await editor.getByRole('button',{name:'Revisar cambio',exact:true}).click();
 assert.equal(writes.length,before,'review cannot POST');
 const preview=await editor.locator('.ppp-stages-preview').textContent();
 assert.match(preview,/Entendí:/);assert.match(preview,/Cambio:/);assert.match(preview,/No se propone reparto financiero/);
 if(caseId)assert.ok(preview.includes('Caso: '+caseId));if(version)assert.ok(preview.includes('versión: '+version));if(revision)assert.ok(preview.includes('revisión: '+revision));
 await editor.getByRole('button',{name:'Consecutivas',exact:true}).click();
 assert.equal(writes.length,before,'clarification cannot POST');assert.match(await editor.locator('.ppp-stages-preview').textContent(),/Consecutivas:/);
 await editor.getByRole('button',{name:'Guardar',exact:true}).click();
}
(async()=>{
 const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9'},...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 try{
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
   const context=await browser.newContext({viewport}),net=await fixture(context),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const editor=await open(page);
   assert.equal(await editor.locator('.ppp-stages-list li').count(),1);const hero=await page.locator('#heroUtil').textContent();
   for(const text of ['no serán tres etapas de 12 meses','3 etapas de 12 meses y 24 meses en total','3.5 etapas de 12 meses','3 a 4 etapas de 12 meses']){await editor.getByRole('textbox',{name:'Instrucción para etapas'}).fill(text);await editor.getByRole('button',{name:'Revisar cambio',exact:true}).click();assert.equal(await editor.getAttribute('data-stage-state'),'invalid');assert.equal(net.writes.length,0);}
   const longInstruction='3 etapas consecutivas de 12 meses'+' '.repeat(300)+' no';await editor.getByRole('textbox',{name:'Instrucción para etapas'}).fill(longInstruction);assert.equal(await editor.getByRole('textbox',{name:'Instrucción para etapas'}).inputValue(),longInstruction,'never truncate an instruction into a valid prefix');await editor.getByRole('button',{name:'Revisar cambio',exact:true}).click();assert.equal(await editor.getAttribute('data-stage-state'),'invalid');assert.equal(net.writes.length,0);
   await editor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('3 etapas de 12 meses');await editor.getByRole('button',{name:'Revisar cambio',exact:true}).click();assert.equal(await editor.getAttribute('data-stage-state'),'clarify');assert.equal(net.writes.length,0);await editor.getByRole('button',{name:'En paralelo',exact:true}).click();assert.equal(await editor.getAttribute('data-stage-state'),'unsupported');assert.equal(await editor.getByRole('button',{name:'Guardar',exact:true}).isVisible(),false);assert.equal(net.writes.length,0);
   await editor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('3 etapas de 12 meses en paralelo');await editor.getByRole('button',{name:'Revisar cambio',exact:true}).click();assert.equal(await editor.getAttribute('data-stage-state'),'unsupported');assert.equal(await editor.getByRole('button',{name:'Guardar',exact:true}).isVisible(),false);assert.equal(net.writes.length,0);
   await editor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('3 etapas consecutivas de 12 meses');await editor.getByRole('button',{name:'Revisar cambio',exact:true}).click();assert.equal(await editor.getAttribute('data-stage-state'),'preview');assert.match(await editor.locator('.ppp-stages-preview').textContent(),/Consecutivas: 36 meses/);assert.equal(net.writes.length,0);
   await editor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('van a ser 3 etapas de 12 meses');assert.equal(await page.locator('#heroUtil').textContent(),hero);assert.equal(net.writes.length,0);
   await review(editor,net.writes,{caseId:'synthetic-case',version:net.model.activo,revision:net.model.revision});await page.waitForFunction(()=>document.querySelector('#pppStages')?.dataset.stageState==='saved');
   assert.equal(net.writes.length,1);assert.equal(net.reads.length,0);assert.equal(await editor.locator('.ppp-stages-list li').count(),3);assert.match(await editor.locator('.ppp-stages-list').textContent(),/mes 25 a 36/);assert.equal(await editor.locator('.ppp-check-ok').count(),9);assert.notEqual(await page.locator('#heroUtil').textContent(),hero);assert.match(await page.locator('#heroUtil').textContent(),/123/);assert.equal(net.net.posts.length,0);assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no viewport overflow');
   await page.reload();await page.waitForFunction(()=>document.querySelector('#pppStages textarea')?.disabled===false);assert.equal(await editor.locator('.ppp-stages-list li').count(),3);assert.equal(net.writes.length,1,'reload never sends a command');
   if(process.env.PPP_STAGES_SCREENSHOTS){await editor.scrollIntoViewIfNeeded();await page.screenshot({path:process.env.PPP_STAGES_SCREENSHOTS+'/stages-'+viewport.width+'.png'});}
   await context.close();console.log(viewport.width+'px: typed3x12, canonical1→3,9checks, whole-board readback and reload PASS');
  }
  {
   const context=await browser.newContext(),net=await fixture(context,{uncertain:true}),page=await context.newPage(),editor=await open(page);await editor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('tres etapas de doce meses');await review(editor,net.writes,{caseId:'synthetic-case',version:net.model.activo,revision:net.model.revision});await page.waitForFunction(()=>document.querySelector('#pppStages')?.dataset.stageState==='unconfirmed');assert.equal(net.writes.length,1);await editor.getByRole('button',{name:'Comprobar guardado',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#pppStages')?.dataset.stageState==='saved');assert.equal(net.writes.length,1);assert.deepEqual(net.reads,[{request_id:net.writes[0].request_id,caso_id:net.writes[0].caso_id,escenario_id:net.writes[0].escenario_id}]);await context.close();console.log('uncertain result: exact GET receipt and no duplicate POST PASS');
  }
  {
   const context=await browser.newContext(),net=await fixture(context,{hold:true}),page=await context.newPage(),editor=await open(page);await editor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('3 etapas de 12 meses');await review(editor,net.writes,{caseId:'synthetic-case',version:net.model.activo,revision:net.model.revision});await page.waitForFunction(()=>document.querySelector('#pppStages')?.dataset.stageState==='saving');
   await page.locator('.ppp-footer').getByRole('button',{name:'Mis casos',exact:true}).click();await page.locator('#listaCasos [data-id="synthetic-other"]').click();await page.waitForFunction(()=>document.querySelector('#pppStages .ppp-stages-current')?.textContent.includes('1 etapa actual'));net.release();await page.waitForFunction(()=>document.querySelector('#pppStages textarea')?.disabled===false);
   assert.equal(await editor.getByRole('textbox',{name:'Instrucción para etapas'}).inputValue(),'');assert.equal(await editor.locator('.ppp-stages-list li').count(),1);assert.equal(await editor.locator('.ppp-check-ok').count(),0);assert.equal(net.writes.length,1);assert.equal(net.reads.length,0);assert.notEqual(await page.locator('#heroUtil').textContent(),'123.46 M');await context.close();console.log('case switch: late write callback cannot change the next case or preserve private command PASS');
  }
  {
   const context=await browser.newContext(),net=await fixture(context,{available:false}),page=await context.newPage();await page.goto('https://ppp.test/potenciales-yod/mixto.html?open=synthetic-case');await page.getByText('La edición de etapas aún no está habilitada en este libro.',{exact:true}).waitFor();assert.equal(await page.locator('#pppStages textarea').isDisabled(),true);assert.equal(net.writes.length,0);await context.close();console.log('missing capability: visible status, disabled command, zero mutations PASS');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

