'use strict';
// Real HTML, normal controls, synthetic transport. No business endpoint is reachable.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),{install}=require('./ppp-fixture.js'),intake=require('../ppp-intake.js'),stages=require('../ppp-stages.js');
const keys={vertical:'pyod_draft_v1',macrolotes:'pyodm_draft_v1',residencial:'pyodr_draft_v1',unifamiliar:'pyodu_draft_v1',patrimonial:'pyodp_draft_v1'};
const copy=value=>JSON.parse(JSON.stringify(value));

async function reviewStages(editor,writes,model){
 const before=writes.length;await editor.getByRole('button',{name:'Revisar cambio',exact:true}).click();assert.equal(writes.length,before,'review cannot POST');
 const preview=await editor.locator('.ppp-stages-preview').textContent();assert.match(preview,/Entendí:/);assert.match(preview,/Cambio:/);assert.ok(preview.includes('Caso: '+model.caso_id));assert.ok(preview.includes('versión: '+(model.activo||'base')));assert.ok(preview.includes('revisión: '+model.revision));assert.match(preview,/No se propone reparto financiero/);
 await editor.getByRole('button',{name:'Consecutivas',exact:true}).click();assert.equal(writes.length,before,'clarification cannot POST');await editor.getByRole('button',{name:'Guardar',exact:true}).click();
}
(async()=>{
 const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9'},...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 try{for(const width of [1280,390])for(const [type,oldKey] of Object.entries(keys)){
  if(process.env.PPP_INTAKE_TYPE&&process.env.PPP_INTAKE_TYPE!==type)continue;if(process.env.PPP_INTAKE_WIDTH&&Number(process.env.PPP_INTAKE_WIDTH)!==width)continue;
  const context=await browser.newContext({viewport:{width,height:900}}),net=await install(context,{seed:null}),page=await context.newPage(),errors=[],writes=[],stageWrites=[],receiptReads=[],stageReceiptReads=[],receipts=new Map();let model=null,uncertainNext=false,stageReceipt=null,blockedNext=false,failFreshNext=false,stageBlockedNext=false,stageConfirmNext=false,freshReads=0,holdCaseRead=false,caseReadHeld,releaseCaseRead;
  async function noLegacySummary(){
    for(const node of await page.locator('.sticky-header,.ppp-hud,#escBar,#pppVersiones').all())assert.equal(await node.isVisible(),false,type+': legacy financial header and versions hidden');
    assert.equal(await page.locator('#escChips').textContent(),'');
    assert.doesNotMatch(await page.locator('body').innerText(),/OLD_CASE_SENTINEL|OLD_VERSION_SENTINEL/);
  }
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());if(!/script\.google/.test(url.hostname))return route.fallback();
    const payload=request.method()==='POST'?request.postDataJSON():null;
    if(payload?.tipo==='sheet-intake'){
      writes.push(copy(payload));
      if(blockedNext){const error=blockedNext===true?'intake_case_operation_pending':blockedNext;blockedNext=false;if(error==='revision_conflict')model.revision='r-external-'+writes.length;return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:false,error,persisted:false,request_id:payload.request_id})});}
      if(!model){model={ok:true,status:'confirmed',persisted:true,pending:true,calculated:false,model_status:'MODELO_PENDIENTE',caso_id:'intake-synthetic-'+type,revision:'r1',request_id:payload.request_id,intake:copy(payload.intake),activo:'base',escenarios:[{id:'base',nombre:'Base',activo:true,esBase:true}],capabilities:{intake:{schema:1,read:true,write:true},stages:{schema:1,read:true,write:true,max_stages:24,max_months:1200,modes:['sequential'],allocation_modes:['preserve'],initial_pending:true,assumption:'Calendario relativo desde el mes 1; resultados financieros pendientes.'}},stages_by_scenario:{}};if(['macrolotes','residencial'].includes(type))Object.assign(model.intake.inputs,{inEtapas:1,inMesesUrbEtapa:null});}
      else{assert.equal(payload.caso_id,model.caso_id);assert.equal(payload.revision_esperada,model.revision);model={...model,revision:'r'+writes.length,request_id:payload.request_id,intake:{...model.intake,...payload.intake,inputs:{...model.intake.inputs,...payload.intake.inputs}}};}
      if(['macrolotes','residencial'].includes(type))model.campos=[{id:'inMesesUrbEtapa',min:type==='macrolotes'?4:3,max:24,step:1,editable:true,nullable:true,kind:'number'}];
      receipts.set(payload.request_id,copy(model));if(uncertainNext){uncertainNext=false;return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"synthetic_uncertain"}'});}return route.fulfill({contentType:'application/json',body:JSON.stringify(model)});
    }
    if(payload?.tipo==='sheet-stages'){
      stageWrites.push(copy(payload));assert.equal(payload.caso_id,model.caso_id);assert.equal(payload.revision_esperada,model.revision);if(stageBlockedNext){stageBlockedNext=false;model.revision='stage-external';return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:false,error:'revision_conflict',persisted:false,request_id:payload.request_id})});}
      const collection={...payload.stages,stages:Array.from({length:payload.stages.count},(_,i)=>({id:'stage-'+(i+1),order:i+1,start_month:i*payload.stages.duration_months+1,duration_months:payload.stages.duration_months,end_month:(i+1)*payload.stages.duration_months}))};
      const checks={inventory:false,areas:false,sales:false,costs:false,cash:false,debt:false,distribution:false,horizon:true,formulas:true};
      model={...model,revision:'stage-r4',request_id:payload.request_id,intake:{...model.intake,stages:copy(payload.stages)},stages_by_scenario:{base:collection},stage_checks_by_scenario:{base:checks},stage_calculated_by_scenario:{base:false},capabilities:{stages:{...model.capabilities.stages,initial_pending:false}}};
      model.capabilities.intake={schema:1,read:true,write:true};if(['macrolotes','residencial'].includes(type))Object.assign(model.intake.inputs,{inEtapas:payload.stages.count,inMesesUrbEtapa:payload.stages.duration_months});
      model.stage_receipt={request_id:payload.request_id,caso_id:payload.caso_id,escenario_id:'base',base_revision:payload.revision_esperada,result_revision:model.revision,stages:collection,calculated:false,checks};
      stageReceipt=copy(model);if(stageConfirmNext){stageConfirmNext=false;return route.fulfill({contentType:'application/json',body:JSON.stringify(model)});}return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"synthetic_stage_uncertain"}'});
    }
    if(request.method()==='GET'&&url.searchParams.get('recurso')==='sheet-stages-receipt'){stageReceiptReads.push(url.searchParams.get('request_id'));assert.equal(url.searchParams.get('request_id'),stageReceipt.request_id);return route.fulfill({contentType:'application/json',body:JSON.stringify(stageReceipt)});}
    if(request.method()==='GET'&&url.searchParams.get('recurso')==='sheet-intake'){if(!url.searchParams.get('request_id'))freshReads++;if(failFreshNext&&!url.searchParams.get('request_id')){failFreshNext=false;return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"synthetic_read_failed"}'});}if(url.searchParams.get('request_id'))receiptReads.push(url.searchParams.get('request_id'));return route.fulfill({contentType:'application/json',body:JSON.stringify(url.searchParams.get('request_id')?receipts.get(url.searchParams.get('request_id')):model)});}
    if(request.method()==='GET'&&url.searchParams.get('recurso')==='caso'&&model){if(holdCaseRead){holdCaseRead=false;await new Promise(resolve=>{releaseCaseRead=resolve;caseReadHeld();});}return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,caso:{caso_id:model.caso_id,nombre_caso:model.intake.nombre_caso,calculo_sheet:model}})});}
    return route.fallback();
  });
  const legacyHtml=fs.readFileSync(path.join(__dirname,'..',intake.models[type].page),'utf8'),legacyInputs={};
  for(const [tag]of legacyHtml.matchAll(/<input\b[^>]*type="range"[^>]*>/g)){const id=tag.match(/\bid="([^"]+)"/)?.[1],value=tag.match(/\bvalue="([^"]+)"/)?.[1];if(id&&Number.isFinite(Number(value)))legacyInputs[id]=Number(value);}
  const preserved=JSON.stringify({caso:{caso_id:'old-synthetic-case',nombre_caso:'OLD_CASE_SENTINEL',version:7},inputs:legacyInputs,escenarios:[{id:'old-synthetic-version',nombre:'OLD_VERSION_SENTINEL',esBase:true,inputs:copy(legacyInputs)}],escActivo:'old-synthetic-version'});
  await context.addInitScript(({key,value})=>{if(!sessionStorage.getItem('intake-test-seeded')){localStorage.setItem(key,value);sessionStorage.setItem('intake-test-seeded','1');}},{key:oldKey,value:preserved});
  await page.goto('https://ppp.test/potenciales-yod/'+intake.models[type].page+'?new=1');
  const form=page.locator('.ppp-intake');await form.getByRole('heading',{name:'Empieza con lo que ya sabes'}).waitFor({timeout:10000}).catch(async error=>{console.error({type,width,errors,body:(await page.locator('body').innerText()).slice(0,1600)});throw error;});
  assert.equal(await form.locator('[name=model_type]').isDisabled(),true);
  await form.locator('[name=nombre_caso]').fill('Plan sintético');await form.locator('[name=ubicacion]').fill('Ubicación de ensayo');
  for(const f of intake.models[type].fields.filter(f=>f.required))await form.locator('[name='+f.id+']').fill(String(f.min));
  const optional=intake.models[type].fields.find(f=>!f.required);await form.locator('summary').click();await form.locator('[name='+optional.id+']').fill(String(optional.min));
  await form.getByRole('button',{name:'Abrir mi plan'}).click();await page.locator('.pi-board-banner').waitFor();
  assert.equal(writes.length,1);assert.equal(writes[0].tipo_desarrollo,type);assert.equal(Object.hasOwn(writes[0].intake,'provenance'),false);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),oldKey),preserved,'new capture preserves the old case draft');
  const captured=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('input[id^=in][type=number]')].map(el=>[el.id,el.value])));
  for(const f of intake.models[type].fields.filter(f=>f.required))assert.equal(Number(captured[f.id]),f.min);
  const known=new Set([...intake.models[type].fields.filter(f=>f.required).map(f=>f.id),optional.id,...(['macrolotes','residencial'].includes(type)?['inEtapas']:[])]);
  for(const [id,value] of Object.entries(captured))if(!known.has(id))assert.equal(value,'',type+': '+id+' must not inherit an example');
  assert.match(await page.locator('[data-intake-board-status]').textContent(),/guardada en Sheets/);assert.match(page.url(),/open=intake-synthetic/);
  await noLegacySummary();
  await page.getByRole('button',{name:'Editar ficha',exact:true}).click();await page.locator('.ppp-intake summary').click();await page.locator('.ppp-intake [name='+optional.id+']').fill('');await page.locator('.ppp-intake').getByRole('button',{name:'Abrir mi plan'}).click();await page.waitForFunction(()=>document.querySelector('[data-intake-board-status]')?.textContent.includes('r2'));
  assert.equal(await page.locator('#'+optional.id).inputValue(),'');assert.equal(model.intake.inputs[optional.id],null);
  // A normal-area control change uses the existing handler and the native autosave adapter.
  const required=intake.models[type].fields.find(f=>f.required),newValue=required.min+1;
  await page.locator('#'+required.id).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},newValue);
  await page.waitForFunction(()=>document.querySelector('[data-intake-board-status]')?.textContent.includes('r3'));
  assert.equal(writes.length,3);assert.deepEqual(writes[2].intake.inputs,{[required.id]:newValue});assert.equal(model.intake.inputs[required.id],newValue);
  const stageEditor=page.locator('#pppIntakeStages');assert.match(await stageEditor.locator('.ppp-stages-current').textContent(),/1 etapa actual/);
  if(['macrolotes','residencial'].includes(type))for(const duration of [1,25]){await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).fill(`1 etapa de ${duration} meses`);await stageEditor.getByRole('button',{name:'Revisar cambio',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#pppIntakeStages')?.dataset.stageState==='invalid');assert.equal(stageWrites.length,0,'native field bounds reject invalid durations without POST');assert.equal(await page.locator('#'+required.id).isDisabled(),false);}
  for(const text of ['no serán 3 etapas de 12 meses','3 etapas de 12 meses y 24 meses en total','3 etapas de 12.5 meses','3 a 4 etapas de 12 meses']){await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).fill(text);await stageEditor.getByRole('button',{name:'Revisar cambio',exact:true}).click();assert.equal(await stageEditor.getAttribute('data-stage-state'),'invalid');assert.equal(stageWrites.length,0);}
  const longInstruction='3 etapas consecutivas de 12 meses'+' '.repeat(300)+' no';await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).fill(longInstruction);assert.equal(await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).inputValue(),longInstruction,'never truncate an instruction into a valid prefix');await stageEditor.getByRole('button',{name:'Revisar cambio',exact:true}).click();assert.equal(await stageEditor.getAttribute('data-stage-state'),'invalid');assert.equal(stageWrites.length,0);
  await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('3 etapas de 12 meses');await stageEditor.getByRole('button',{name:'Revisar cambio',exact:true}).click();assert.equal(await stageEditor.getAttribute('data-stage-state'),'clarify');assert.equal(stageWrites.length,0);await stageEditor.getByRole('button',{name:'En paralelo',exact:true}).click();assert.equal(await stageEditor.getAttribute('data-stage-state'),'unsupported');assert.equal(await stageEditor.getByRole('button',{name:'Guardar',exact:true}).isVisible(),false);assert.equal(stageWrites.length,0);
   await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('3 etapas de 12 meses en paralelo');await stageEditor.getByRole('button',{name:'Revisar cambio',exact:true}).click();assert.equal(await stageEditor.getAttribute('data-stage-state'),'unsupported');assert.equal(await stageEditor.getByRole('button',{name:'Guardar',exact:true}).isVisible(),false);assert.equal(stageWrites.length,0);
  await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('3 etapas consecutivas de 12 meses');await stageEditor.getByRole('button',{name:'Revisar cambio',exact:true}).click();assert.equal(await stageEditor.getAttribute('data-stage-state'),'preview');assert.equal(stageWrites.length,0);
  await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('Van a ser 3 etapas de 12 meses');await reviewStages(stageEditor,stageWrites,model);await page.waitForFunction(()=>document.querySelector('#pppIntakeStages')?.dataset.stageState==='unconfirmed');
  assert.equal(await page.locator('#'+required.id).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Editar ficha',exact:true}).isDisabled(),true);
  await page.locator('#'+required.id).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},required.min+5);
  await page.waitForTimeout(800);assert.equal(writes.length,3,'uncertain stage blocks every new quantity POST');assert.equal(await page.locator('#'+required.id).inputValue(),String(newValue));
  if(width===390){await page.reload();await page.getByRole('button',{name:'Comprobar etapas',exact:true}).waitFor({timeout:10000}).catch(async error=>{console.error({errors,cache:await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes(':case:')).map(k=>JSON.parse(localStorage.getItem(k)))),banner:await page.locator('.pi-board-banner').textContent()});throw error;});assert.equal(await page.locator('#'+required.id).isDisabled(),true);await page.getByRole('button',{name:'Comprobar etapas',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-intake-edit]')?.disabled);}
  else{await stageEditor.getByRole('button',{name:'Comprobar guardado',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#pppIntakeStages')?.dataset.stageState==='needs_review');}
  assert.equal(await page.locator('#'+required.id).isDisabled(),false);assert.equal(writes.length,3);assert.equal(stageWrites.length,1);assert.equal(await stageEditor.locator('.ppp-stages-list li').count(),3);assert.match(await stageEditor.locator('.ppp-stages-list').textContent(),/mes 25 a 36/);assert.equal(await stageEditor.locator('.ppp-check-pending').count(),7);assert.equal(model.calculated,false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no viewport overflow');
  // Saved pending models reopen through the real existing-case pathway without running legacy finance.
  holdCaseRead=true;const held=new Promise(resolve=>{caseReadHeld=resolve;}),reloading=page.reload();await held;
  assert.equal(await page.locator(type==='vertical'?'#pppDeck':'main.container').isVisible(),false,type+': old draft hidden before requested case confirms');releaseCaseRead();await reloading;
  await page.locator('.pi-board-banner').waitFor();assert.equal(await page.locator('#'+required.id).inputValue(),String(newValue));assert.equal(writes.length,3);assert.equal(await page.locator('#pppIntakeStages .ppp-stages-list li').count(),3);assert.equal(stageWrites.length,1);await noLegacySummary();
  // An uncertain mutation survives a reload and is recovered by exact GET receipt only.
  uncertainNext=true;await page.locator('#'+required.id).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},required.min+2);
  await page.waitForFunction(()=>document.querySelector('[data-intake-board-status]')?.textContent.includes('por confirmar'));assert.equal(writes.length,4);
  await page.reload();await page.locator('[data-intake-check]').waitFor({state:'visible'});await page.getByRole('button',{name:'Comprobar guardado',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-intake-board-status]')?.textContent.includes('Ficha guardada en Sheets'));
  assert.equal(writes.length,4);assert.equal(await page.locator('#'+required.id).inputValue(),String(required.min+2));
  // A definitive pre-reservation rejection has no receipt: keep newest edits and reread before retry.
  blockedNext=true;await page.locator('#'+required.id).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},required.min+3);
  await page.getByRole('button',{name:'Releer y reintentar',exact:true}).waitFor();assert.equal(writes.length,5);const rejectedId=writes[4].request_id;
  await page.locator('#'+required.id).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},required.min+4);await page.waitForTimeout(800);assert.equal(writes.length,5);
  await page.getByRole('button',{name:'Releer y reintentar',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-intake-board-status]')?.textContent.includes('revisión r6'));
  assert.equal(writes.length,6);assert.equal(writes[5].revision_esperada,'r4');assert.deepEqual(writes[5].intake.inputs,{[required.id]:required.min+4});assert.equal(receiptReads.includes(rejectedId),false,'never reconcile an unreserved request');
  // Initial POST CAS conflicts have no receipt: preserve edits, fetch a fresh revision, then retry.
  blockedNext='revision_conflict';await page.locator('#'+required.id).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},required.min+5);
  await page.getByRole('button',{name:'Releer y reintentar',exact:true}).waitFor();assert.equal(writes.length,7);const conflictId=writes[6].request_id;
  await page.locator('#'+required.id).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},required.min+6);await page.waitForTimeout(800);assert.equal(writes.length,7);
  await page.getByRole('button',{name:'Releer y reintentar',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-intake-board-status]')?.textContent.includes('revisión r8'));assert.equal(writes[7].revision_esperada,'r-external-7');assert.equal(receiptReads.includes(conflictId),false);
  // Metadata conflicts reread while preserving the user's form, including after an uncertain ACK.
  await page.getByRole('button',{name:'Editar ficha',exact:true}).click();await page.locator('.ppp-intake [name=nombre_caso]').fill('Nombre revisado');blockedNext='revision_conflict';await page.locator('.ppp-intake').getByRole('button',{name:'Abrir mi plan'}).click();await page.locator('.ppp-intake').getByRole('button',{name:'Releer y reintentar',exact:true}).waitFor();assert.equal(writes.length,9);const metadataConflict=writes[8].request_id;
  assert.equal(await page.locator('.ppp-intake [name=nombre_caso]').inputValue(),'Nombre revisado');failFreshNext=true;await page.locator('.ppp-intake').getByRole('button',{name:'Releer y reintentar',exact:true}).click();await page.locator('.ppp-intake').getByRole('button',{name:'Releer y reintentar',exact:true}).waitFor();assert.equal(writes.length,9,'failed fresh GET cannot reserve a request');uncertainNext=true;await page.locator('.ppp-intake').getByRole('button',{name:'Releer y reintentar',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ppp-intake [data-intake-status]')?.textContent.includes('por confirmar'));assert.equal(writes.length,10);assert.equal(writes[9].revision_esperada,'r-external-9');
  await page.locator('.ppp-intake').getByRole('button',{name:'Comprobar guardado',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.ppp-intake'));assert.equal(writes.length,10,'uncertain metadata queries GET without repeat POST');assert.equal(receiptReads.includes(metadataConflict),false);assert.equal(model.intake.nombre_caso,'Nombre revisado');
  // Reloaded stage jobs accept only durable, payload-bound rejection proof.
  for(const atomic of [false,true]){
    const payload={tipo:'sheet-stages',tipo_desarrollo:type.toUpperCase(),caso_id:model.caso_id,escenario_id:'base',revision_esperada:model.revision,request_id:'cached-'+type+'-'+width+'-'+atomic,stages:{schema:1,count:3,duration_months:12,mode:'sequential',allocation:'preserve'}},actor='synthetic-actor';
    const proof={request_id:payload.request_id,caso_id:payload.caso_id,escenario_id:payload.escenario_id,base_revision:payload.revision_esperada,actor,payload_hash:createHash('sha256').update(stages.stable({actor,caso_id:payload.caso_id,escenario_id:payload.escenario_id,base_revision:payload.revision_esperada,stages:payload.stages})).digest('hex'),stage:atomic?'atomic_write':'prewrite',write_attempted:atomic,error:atomic?'native_stage_write_rejected':'revision_conflict',rejected_at:new Date().toISOString(),...(atomic?{committed:false}:{})};
    const valid={ok:false,error:'operation_rejected',request_id:payload.request_id,stage_operation_status:'rejected',stage_rejection:proof};
    stageReceipt=copy(valid);stageReceipt.stage_rejection.payload_hash='f'.repeat(64);
    const cached=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.includes('ppp_intake_draft_v2:')&&k.includes(':case:'));return{key,value:JSON.parse(localStorage.getItem(key))};});cached.value.stage_job=payload;
    await page.addInitScript(({key,value,marker})=>{if(!sessionStorage.getItem(marker)){localStorage.setItem(key,JSON.stringify(value));sessionStorage.setItem(marker,'1');}},{...cached,marker:payload.request_id});
    await page.reload();await page.getByRole('button',{name:'Comprobar etapas',exact:true}).waitFor();assert.equal(await page.locator('#'+required.id).isDisabled(),true);
    await page.getByRole('button',{name:'Comprobar etapas',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-intake-check]')?.disabled);
    assert.equal(await page.locator('#'+required.id).isDisabled(),true,'foreign hash cannot unlock the board');assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).stage_job.request_id,cached.key),payload.request_id);
    stageReceipt={ok:false,error:'revision_conflict',persisted:false,request_id:payload.request_id};await page.getByRole('button',{name:'Comprobar etapas',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-intake-check]')?.disabled);assert.equal(await page.locator('#'+required.id).isDisabled(),true,'plain GET errors cannot retire an uncertain write');
    stageReceipt=valid;await page.getByRole('button',{name:'Comprobar etapas',exact:true}).click();await page.waitForFunction(expected=>document.querySelector('#pppIntakeStages')?.dataset.stageState===expected,atomic?'rejected':'conflict');
    assert.equal(await page.locator('#'+required.id).isDisabled(),false);assert.equal(await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).inputValue(),'3 etapas de 12 meses');assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).stage_job,cached.key),null);assert.equal(await page.locator('#'+required.id).inputValue(),String(required.min+6));assert.equal(writes.length,10);assert.equal(stageWrites.length,1,'receipt recovery never creates another POST');
  }
  // Stage CAS rejection has a visible GET-only refresh; the command stays until explicit apply.
  await page.reload();await stageEditor.locator('.ppp-stages-current').waitFor();stageBlockedNext=true;await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('4 etapas de 12 meses');await reviewStages(stageEditor,stageWrites,model);await stageEditor.getByRole('button',{name:'Releer calendario',exact:true}).waitFor();assert.equal(stageWrites.length,2);const stageConflict=stageWrites[1].request_id,readsBefore=freshReads;
  await stageEditor.getByRole('button',{name:'Releer calendario',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#pppIntakeStages')?.dataset.stageState==='ready');assert.equal(freshReads,readsBefore+1);assert.equal(stageWrites.length,2,'reread does not apply automatically');assert.equal(stageReceiptReads.includes(stageConflict),false);assert.equal(await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).inputValue(),'4 etapas de 12 meses');
  stageConfirmNext=true;await reviewStages(stageEditor,stageWrites,model);await page.waitForFunction(()=>document.querySelector('#pppIntakeStages')?.dataset.stageState==='needs_review');assert.equal(stageWrites.length,3);assert.equal(stageWrites[2].revision_esperada,'stage-external');assert.equal(await stageEditor.locator('.ppp-stages-list li').count(),4);assert.equal(writes.length,10);
  const status=await page.locator('[data-intake-board-status]').textContent();assert.match(status,/Ficha guardada en Sheets/);assert.match(status,/El cálculo financiero de esta ficha aún no está conectado/);assert.doesNotMatch(status,/guardado.*pendiente|completar el modelo/);
  await page.evaluate(()=>localStorage.setItem('pyod_clave_v1','sy-second-synthetic-user'));
  await page.getByText('La sesión cambió.',{exact:false}).waitFor();assert.equal(await page.locator('.ppp-intake [name=nombre_caso]').count(),0);
  assert.deepEqual(errors,[]);assert.equal(net.posts.length,0);await context.close();console.log(type+' '+width+'px: minimum→same board, native capture, blank unknowns, edit CAS/readback, reopen, session revoke PASS');
 }
 // A lock rejection before reservation is recovered by an explicit, identical
 // native POST after the exact GET says its receipt is not present yet.
 const replayContext=await browser.newContext({viewport:{width:390,height:900}}),replayNet=await install(replayContext,{seed:null}),replayPage=await replayContext.newPage(),replayPosts=[];let replayBooks=0;
 await replayContext.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(!/script\.google/.test(url.hostname))return route.fallback();
  const payload=request.method()==='POST'?request.postDataJSON():null;
  if(payload?.tipo==='sheet-intake'){
   replayPosts.push(copy(payload));if(replayPosts.length===1)return route.fulfill({contentType:'application/json',body:'{"ok":false,"error":"ocupado"}'});
   replayBooks++;const response={ok:true,status:'confirmed',persisted:true,pending:true,calculated:false,model_status:'MODELO_PENDIENTE',caso_id:'replay-synthetic-residencial',revision:'replay-r1',request_id:payload.request_id,intake:copy(payload.intake),activo:'base',escenarios:[{id:'base',nombre:'Base',activo:true,esBase:true}],capabilities:{intake:{schema:1,read:true,write:true}}};return route.fulfill({contentType:'application/json',body:JSON.stringify(response)});
  }
  if(request.method()==='GET'&&url.searchParams.get('recurso')==='sheet-intake')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:false,error:'receipt_not_found',request_id:url.searchParams.get('request_id')})});
  return route.fallback();
 });
 await replayPage.goto('https://ppp.test/potenciales-yod/residencial.html?new=1');const replayForm=replayPage.locator('.ppp-intake');await replayForm.locator('[name=nombre_caso]').fill('Reenvío sintético');await replayForm.locator('[name=ubicacion]').fill('Ubicación sintética');await replayForm.locator('[name=inSuperficie]').fill('500');await replayForm.getByRole('button',{name:'Abrir mi plan'}).click();await replayForm.getByRole('button',{name:'Comprobar guardado',exact:true}).waitFor();
 assert.equal(await replayForm.getByRole('button',{name:'Reintentar misma solicitud',includeHidden:true}).isVisible(),false);assert.match(await replayForm.locator('[data-intake-status]').textContent(),/ocupado/);
 await replayForm.getByRole('button',{name:'Comprobar guardado',exact:true}).click();await replayForm.getByRole('button',{name:'Reintentar misma solicitud',exact:true}).waitFor();assert.equal(replayPosts.length,1,'receipt lookup never resubmits automatically');
 await replayForm.getByRole('button',{name:'Reintentar misma solicitud',exact:true}).click();await replayPage.locator('.pi-board-banner').waitFor();assert.equal(replayPosts.length,2);assert.deepEqual(replayPosts[1],replayPosts[0]);assert.equal(replayBooks,1);assert.equal(replayNet.posts.length,0);await replayContext.close();console.log('native creation replay: explicit same POST, same identity/payload, one synthetic book PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
