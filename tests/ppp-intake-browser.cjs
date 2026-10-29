'use strict';
// Real HTML, normal controls, synthetic transport. No business endpoint is reachable.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {install}=require('./ppp-fixture.js'),intake=require('../ppp-intake.js');
const keys={vertical:'pyod_draft_v1',macrolotes:'pyodm_draft_v1',residencial:'pyodr_draft_v1',unifamiliar:'pyodu_draft_v1',patrimonial:'pyodp_draft_v1'};
const copy=value=>JSON.parse(JSON.stringify(value));
(async()=>{
 const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9'},...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 try{for(const width of [1280,390])for(const [type,oldKey] of Object.entries(keys)){
  const context=await browser.newContext({viewport:{width,height:900}}),net=await install(context,{seed:null}),page=await context.newPage(),errors=[],writes=[],stageWrites=[],receipts=new Map();let model=null,uncertainNext=false;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());if(!/script\.google/.test(url.hostname))return route.fallback();
    const payload=request.method()==='POST'?request.postDataJSON():null;
    if(payload?.tipo==='sheet-intake'){
      writes.push(copy(payload));
      if(!model){model={ok:true,status:'confirmed',persisted:true,pending:true,calculated:false,model_status:'MODELO_PENDIENTE',caso_id:'intake-synthetic-'+type,revision:'r1',request_id:payload.request_id,intake:copy(payload.intake),activo:'base',escenarios:[{id:'base',nombre:'Base',activo:true,esBase:true}],capabilities:{intake:{schema:1,read:true,write:true},stages:{schema:1,read:true,write:true,max_stages:24,max_months:1200,modes:['sequential'],allocation_modes:['preserve'],initial_pending:true,assumption:'Calendario relativo desde el mes 1; resultados financieros pendientes.'}},stages_by_scenario:{}};if(['macrolotes','residencial'].includes(type))Object.assign(model.intake.inputs,{inEtapas:1,inMesesUrbEtapa:null});}
      else{assert.equal(payload.caso_id,model.caso_id);assert.equal(payload.revision_esperada,model.revision);model={...model,revision:'r'+writes.length,request_id:payload.request_id,intake:{...model.intake,...payload.intake,inputs:{...model.intake.inputs,...payload.intake.inputs}}};}
      receipts.set(payload.request_id,copy(model));if(uncertainNext){uncertainNext=false;return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"synthetic_uncertain"}'});}return route.fulfill({contentType:'application/json',body:JSON.stringify(model)});
    }
    if(payload?.tipo==='sheet-stages'){
      stageWrites.push(copy(payload));assert.equal(payload.caso_id,model.caso_id);assert.equal(payload.revision_esperada,model.revision);
      const collection={...payload.stages,stages:Array.from({length:payload.stages.count},(_,i)=>({id:'stage-'+(i+1),order:i+1,start_month:i*payload.stages.duration_months+1,duration_months:payload.stages.duration_months,end_month:(i+1)*payload.stages.duration_months}))};
      const checks={inventory:false,areas:false,sales:false,costs:false,cash:false,debt:false,distribution:false,horizon:true,formulas:true};
      model={...model,revision:'stage-r4',request_id:payload.request_id,intake:{...model.intake,stages:copy(payload.stages)},stages_by_scenario:{base:collection},stage_checks_by_scenario:{base:checks},stage_calculated_by_scenario:{base:false},capabilities:{stages:{...model.capabilities.stages,initial_pending:false}}};
      model.capabilities.intake={schema:1,read:true,write:true};if(['macrolotes','residencial'].includes(type))Object.assign(model.intake.inputs,{inEtapas:payload.stages.count,inMesesUrbEtapa:payload.stages.duration_months});
      model.stage_receipt={request_id:payload.request_id,caso_id:payload.caso_id,escenario_id:'base',base_revision:payload.revision_esperada,result_revision:model.revision,stages:collection,calculated:false,checks};
      return route.fulfill({contentType:'application/json',body:JSON.stringify(model)});
    }
    if(request.method()==='GET'&&url.searchParams.get('recurso')==='sheet-intake')return route.fulfill({contentType:'application/json',body:JSON.stringify(url.searchParams.get('request_id')?receipts.get(url.searchParams.get('request_id')):model)});
    if(request.method()==='GET'&&url.searchParams.get('recurso')==='caso'&&model)return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,caso:{caso_id:model.caso_id,nombre_caso:model.intake.nombre_caso,calculo_sheet:model}})});
    return route.fallback();
  });
  const preserved=JSON.stringify({caso:{caso_id:'old-synthetic-case'},inputs:{synthetic:42}});
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
  await page.getByRole('button',{name:'Editar ficha',exact:true}).click();await page.locator('.ppp-intake summary').click();await page.locator('.ppp-intake [name='+optional.id+']').fill('');await page.locator('.ppp-intake').getByRole('button',{name:'Abrir mi plan'}).click();await page.waitForFunction(()=>document.querySelector('[data-intake-board-status]')?.textContent.includes('r2'));
  assert.equal(await page.locator('#'+optional.id).inputValue(),'');assert.equal(model.intake.inputs[optional.id],null);
  // A normal-area control change uses the existing handler and the native autosave adapter.
  const required=intake.models[type].fields.find(f=>f.required),newValue=required.min+1;
  await page.locator('#'+required.id).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},newValue);
  await page.waitForFunction(()=>document.querySelector('[data-intake-board-status]')?.textContent.includes('r3'));
  assert.equal(writes.length,3);assert.deepEqual(writes[2].intake.inputs,{[required.id]:newValue});assert.equal(model.intake.inputs[required.id],newValue);
  const stageEditor=page.locator('#pppIntakeStages');assert.match(await stageEditor.locator('.ppp-stages-current').textContent(),/1 etapa actual/);
  await stageEditor.getByRole('textbox',{name:'Instrucción para etapas'}).fill('Van a ser 3 etapas de 12 meses');await stageEditor.getByRole('button',{name:'Aplicar al plan',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#pppIntakeStages')?.dataset.stageState==='needs_review');
  assert.equal(stageWrites.length,1);assert.equal(await stageEditor.locator('.ppp-stages-list li').count(),3);assert.match(await stageEditor.locator('.ppp-stages-list').textContent(),/mes 25 a 36/);assert.equal(await stageEditor.locator('.ppp-check-pending').count(),7);assert.equal(model.calculated,false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no viewport overflow');
  // Saved pending models reopen through the real existing-case pathway without running legacy finance.
  await page.reload();await page.locator('.pi-board-banner').waitFor();assert.equal(await page.locator('#'+required.id).inputValue(),String(newValue));assert.equal(writes.length,3);assert.equal(await page.locator('#pppIntakeStages .ppp-stages-list li').count(),3);assert.equal(stageWrites.length,1);
  // An uncertain mutation survives a reload and is recovered by exact GET receipt only.
  uncertainNext=true;await page.locator('#'+required.id).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},required.min+2);
  await page.waitForFunction(()=>document.querySelector('[data-intake-board-status]')?.textContent.includes('por confirmar'));assert.equal(writes.length,4);
  await page.reload();await page.locator('[data-intake-check]').waitFor({state:'visible'});await page.getByRole('button',{name:'Comprobar guardado',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-intake-board-status]')?.textContent.includes('Ficha guardada en Sheets'));
  assert.equal(writes.length,4);assert.equal(await page.locator('#'+required.id).inputValue(),String(required.min+2));
  await page.evaluate(()=>localStorage.setItem('pyod_clave_v1','sy-second-synthetic-user'));
  await page.getByText('La sesión cambió.',{exact:false}).waitFor();assert.equal(await page.locator('.ppp-intake [name=nombre_caso]').count(),0);
  assert.deepEqual(errors,[]);assert.equal(net.posts.length,0);await context.close();console.log(type+' '+width+'px: minimum→same board, native capture, blank unknowns, edit CAS/readback, reopen, session revoke PASS');
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
