'use strict';
// Full pages + synthetic native reads. All external requests are intercepted.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),{install}=require('./ppp-fixture.js'),{models}=require('../ppp-intake.js');
const clone=value=>JSON.parse(JSON.stringify(value));
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox']}:{})});
 try{for(const [type,spec]of Object.entries(models)){
  const context=await browser.newContext({viewport:{width:390,height:844}});await install(context,{seed:null});const page=await context.newPage(),errors=[],creates=[];let jobs=[],versions=[],resolverMissing=true,capability=false;
  const model={ok:true,status:'confirmed',persisted:true,pending:true,calculated:false,model_status:'MODELO_PENDIENTE',caso_id:'synthetic-'+type,revision:'capture-r12',activo:'base',escenarios:[{id:'base',nombre:'Captura guardada',activo:true,esBase:true}],intake:{schema:'ppp-intake-v1',model_type:type,nombre_caso:'Proyecto sintético',ubicacion:'Sitio de prueba',inputs:Object.fromEntries(spec.fields.filter(f=>f.required).map(f=>[f.id,f.min])),stages:{count:1,duration_months:null,mode:'sequential',allocation:'preserve'}},capabilities:{intake:{schema:1,read:true,write:true}}};
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(/script\.google/.test(url.hostname)){
    if(req.method()==='GET'&&url.searchParams.get('recurso')==='caso')return route.fulfill({json:{ok:true,caso:{caso_id:model.caso_id,nombre_caso:model.intake.nombre_caso,calculo_sheet:model}}});
    if(req.method()==='GET'&&url.searchParams.get('recurso')==='sheet-intake')return route.fulfill({json:model});
    if(req.method()==='POST'&&req.postDataJSON()?.operation==='resolvePresentationContext'){const payload=req.postDataJSON().payload;assert.deepEqual(payload,{board_case_id:model.caso_id,model_type:type});return route.fulfill({json:resolverMissing?{ok:false,error:'unknown_operation'}:{ok:true,case_id:'mapped-expediente-'+type,board_case_id:model.caso_id,endpoint:'https://synthetic.onrender.com',token:'x'.repeat(24)+'.'+'a'.repeat(64),expires_at:Date.now()+300000}});}
   }
   if(url.hostname==='synthetic.onrender.com'){
    const body=req.postDataJSON();assert.equal(req.headers().authorization,'Bearer '+'x'.repeat(24)+'.'+'a'.repeat(64));assert.equal(body.case_id,'mapped-expediente-'+type);assert.deepEqual(body.source,{board_case_id:model.caso_id,viewed_scenario_id:'base',ppp_revision:model.revision,model_type:type});
    if(url.pathname==='/presentations/list')return route.fulfill({json:{ok:true,jobs,presentations:versions,capabilities:{presentation_draft_v1:capability}}});
    if(url.pathname==='/presentations/status')return route.fulfill({json:{ok:false,accepted:false,error:'request_not_found',request_id:body.request_id,source:body.source,retry_contract:'presentation-idempotent-v1'}});
    if(url.pathname==='/presentations/create'){creates.push(body);if(type==='vertical'&&creates.length===1)return route.fulfill({status:503,json:{ok:false,error:'unavailable'}});const result={ok:true,request_id:body.request_id,job_id:'job-'+creates.length,phase:'queued',source:{case_id:body.case_id,ppp_id:model.caso_id,viewed_scenario_id:'base',ppp_revision:model.revision,source_revision:'expediente-r3'}};jobs.push(result);return route.fulfill({json:result});}
    throw Error('Unexpected synthetic presentation operation '+url.pathname);
   }
   return route.fallback();
  });
  await page.goto('https://ppp.test/potenciales-yod/'+spec.page+'?open='+model.caso_id);
  const panel=page.getByRole('region',{name:'Presentaciones de este plan'}),button=panel.getByRole('button',{name:'Mandar hacer presentación con estos números'});
  await button.waitFor({state:'visible'});await panel.getByText('No se pudo comprobar si este plan puede generar presentaciones. Vuelve a consultar.',{exact:true}).waitFor();assert.equal(await button.isDisabled(),true);assert.equal(creates.length,0);
  resolverMissing=false;await panel.getByRole('button',{name:'Consultar presentaciones'}).click();await panel.getByText('La generación de presentaciones todavía no está disponible para este plan.',{exact:true}).waitFor();assert.equal(await button.isDisabled(),true);assert.equal(creates.length,0);
  capability=true;await panel.getByRole('button',{name:'Consultar presentaciones'}).click();await page.waitForFunction(()=>{const node=document.querySelector('.ppp-presentation-actions button');return node&&!node.disabled;});
  await button.click();
  if(type==='vertical'){await panel.getByRole('button',{name:'Comprobar encargo'}).click();const retry=panel.getByRole('button',{name:'Reintentar mismo encargo'});await retry.waitFor({state:'visible'});assert.equal(creates.length,1,'checking does not create');await retry.click();await panel.getByText('En cola',{exact:true}).waitFor();assert.deepEqual(creates[1],creates[0]);}
  await panel.getByText('En cola',{exact:true}).waitFor();const attempts=type==='vertical'?2:1;assert.equal(creates.length,attempts);assert.equal(Object.hasOwn(creates[0],'inputs'),false);assert.equal(Object.hasOwn(creates[0],'results'),false);
  versions=[{presentation_id:'PRS-synthetic',presentation_version_id:'PV-synthetic-1',version_number:1,title:'Guion visual',created_at:'2026-10-31T00:00:00Z',source:jobs[0].source}];jobs[0]={...jobs[0],phase:'ready_for_review',presentation_id:'PRS-synthetic',presentation_version_id:'PV-synthetic-1'};
  await panel.getByRole('button',{name:'Consultar presentaciones'}).click();await panel.getByText('Guion visual · V1',{exact:true}).waitFor();assert.match(await panel.getByRole('link',{name:'Abrir y revisar'}).getAttribute('href'),/\/presentacion\/ppp\/\?id=PRS-synthetic#version=PV-synthetic-1$/);
  await page.reload();await panel.getByText('Guion visual · V1',{exact:true}).waitFor();assert.equal(creates.length,attempts,'reopening reads the original version without regeneration');
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:900}]){await page.setViewportSize(viewport);assert.equal(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'panel fits '+viewport.width);}
  assert.deepEqual(errors,[]);console.log('PASS '+type+': native pending capture → exact request → private saved version → reload; portrait/landscape/desktop.');await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
