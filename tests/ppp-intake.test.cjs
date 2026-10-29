'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const intake=require('../ppp-intake.js');
const sample=(type='vertical')=>({model_type:type,nombre_caso:'Proyecto de prueba',ubicacion:'Ubicación sintética',fuente:'Plano de ensayo',inputs:Object.fromEntries(intake.modelFor(type).fields.filter(f=>f.required).map(f=>[f.id,f.min]))});

test('Los cinco modelos abren las páginas existentes y usan identificadores reales de sus entradas',()=>{
  assert.equal(Object.keys(intake.models).length,5);
  for(const [type,model] of Object.entries(intake.models)){
    const html=fs.readFileSync(path.join(__dirname,'..',model.page),'utf8');
    for(const f of model.fields)assert.ok(html.includes('id="'+f.id+'"'),type+': '+f.id);
    assert.equal(intake.boardPath(type,'case:test-1'),model.page+'?open=case%3Atest-1');
  }
  assert.equal(intake.boardPath('mixto'),'mixto.html');
  assert.throws(()=>intake.boardPath('vertical','https://outside.invalid'),/caso_invalido/);
});
test('La ficha mínima conserva sólo lo capturado, deja los desconocidos pendientes y arranca en una etapa sin duración inventada',()=>{
  for(const type of Object.keys(intake.models)){
    const original=sample(type),before=JSON.stringify(original),result=intake.validate(original);
    assert.equal(result.ok,true,type);assert.equal(JSON.stringify(original),before);
    assert.deepEqual(result.value.inputs,original.inputs);
    assert.deepEqual(result.value.pending,intake.models[type].fields.filter(f=>!f.required).map(f=>f.id));
    assert.deepEqual(result.value.stages,{schema:1,count:1,duration_months:null,mode:'sequential',allocation:'preserve'});
    assert.equal(result.value.provenance.status,'por_validar');
    assert.ok(!Object.keys(result.value.inputs).some(key=>/Precio|Renta|Costo|Equity|Deuda/.test(key)));
  }
});
test('Ausencia, cero y cantidades inválidas no se confunden; no se aceptan fórmulas ni datos ajenos',()=>{
  for(const value of ['',null,undefined,'   '])assert.equal(intake.parseNumber(value),null);
  assert.equal(intake.parseNumber('0'),0);
  for(const value of ['=SUM(A1)',true,[],Infinity,'0x20','1,234','NaN'])assert.throws(()=>intake.parseNumber(value),/cantidad_invalida/);
  let raw=sample('patrimonial');raw.inputs.inPasillosPct='0';assert.equal(intake.validate(raw).value.inputs.inPasillosPct,0);
  raw.inputs.inUnidades=1.5;assert.ok(intake.validate(raw).errors.inUnidades);
  raw=sample();raw.inputs.inTerreno=45000;assert.ok(intake.validate(raw).errors.inTerreno);
  raw=sample();raw.inputs.inFrente=100;assert.ok(intake.validate(raw).errors.inputs);
  raw=sample();raw.caso_id='existing';assert.ok(intake.validate(raw).errors.caso_id);
});
test('No se abre otro plan ni se anuncia confirmación si el adaptador responde con un recibo ajeno o incompleto',async()=>{
  for(const response of [{ok:true,status:'confirmed',persisted:true,caso_id:'case-1',revision:'rev-1',request_id:'other'},
    {ok:true,status:'confirmed',persisted:true,caso_id:'case-1',request_id:'req-1'},
    {ok:true,status:'draft',persisted:true,request_id:'req-1'}]){
    const states=[],controller=intake.createController({requestId:()=> 'req-1',adapter:{open:async()=>response},onState:s=>states.push(s.status)});
    assert.equal((await controller.submit(sample())).ok,false);
    assert.equal(states.at(-1),'uncertain');assert.equal(controller.pending.request_id,'req-1');
  }
});
test('Una creación incierta reusa solicitud idéntica y no permite crear otro caso con datos distintos',async()=>{
  let calls=0,reads=0;const requests=[];
  const controller=intake.createController({requestId:()=> 'req-1',adapter:{open:async request=>{requests.push(request);calls++;throw Error('network');},read:async request=>{reads++;assert.equal(request.request_id,requests[0].request_id);return{ok:true,status:'confirmed',persisted:true,caso_id:'case-1',revision:'rev-1',request_id:request.request_id};}}});
  assert.equal((await controller.submit(sample())).ok,false);
  assert.equal((await controller.submit({...sample(),nombre_caso:'Otro'})).error,'creacion_por_confirmar');assert.equal(calls,1);
  const r=await controller.submit(sample());assert.equal(r.ok,true);assert.equal(r.board_path,'mixto.html?open=case-1');assert.equal(reads,1);
  await controller.submit(sample());assert.equal(calls,1);assert.equal(reads,1);
});
test('El modo borrador es explícito y nunca afirma persistencia Sheets',async()=>{
  const controller=intake.createController({requestId:()=> 'draft-1',adapter:{open:async request=>({ok:true,status:'draft',persisted:false,request_id:request.request_id})}});
  const result=await controller.submit(sample('residencial'));assert.equal(result.status,'draft');assert.equal(result.persisted,false);assert.equal(result.board_path,'residencial.html');assert.equal(result.caso_id,undefined);
});
test('El adaptador nativo manda sólo datos originales y verifica identidad, recibo y valores rereleídos',async()=>{
  const draft={...intake.validate(sample()).value,request_id:'req-native'},sent=[];
  const response={ok:true,status:'confirmed',persisted:true,pending:true,calculated:false,model_status:'MODELO_PENDIENTE',caso_id:'native-case',revision:'revision-1',request_id:draft.request_id,intake:{...draft,inputs:{...draft.inputs,inCUS:null}}};
  const adapter=intake.nativeAdapter({type:'vertical',post:async value=>{sent.push(value);return response;},get:async value=>{sent.push(value);return response;}});
  assert.equal((await adapter.open(draft)).caso_id,'native-case');
  assert.equal(sent[0].tipo,'sheet-intake');assert.equal(Object.hasOwn(sent[0].intake,'provenance'),false);assert.equal(Object.hasOwn(sent[0].intake,'pending'),false);assert.equal(Object.hasOwn(sent[0],'resultados'),false);
  assert.throws(()=>intake.validateRead({...response,calculated:true},{type:'vertical'}),/sin_confirmacion/);
  assert.throws(()=>intake.validateRead(response,{type:'vertical',id:'another-case'}),/sin_confirmacion/);
  assert.throws(()=>intake.validateRead(response,{type:'vertical',inputs:{inCUS:3}}),/sin_confirmacion/);
  await adapter.read({id:'native-case',request_id:'req-native'});assert.deepEqual(sent[1],{recurso:'sheet-intake',tipo:'vertical',id:'native-case',request_id:'req-native'});
});
test('Una creación incierta recuperada tras recarga consulta el request_id guardado sin un segundo POST',async()=>{
  const draft={...intake.validate(sample()).value,request_id:'creation-uncertain'},calls=[];
  const adapter={open:async()=>{calls.push('POST');throw Error('timeout');},read:async request=>{calls.push(request);return {ok:true,status:'confirmed',persisted:true,caso_id:'case-created',revision:'r1',request_id:request.request_id};}};
  const first=intake.createController({adapter,requestId:()=>draft.request_id});assert.equal((await first.submit(sample())).ok,false);
  const restored=intake.createController({adapter,resumeRequest:first.pending,requestId:()=>{throw Error('must not generate another identity');}});
  assert.equal((await restored.submit(sample())).caso_id,'case-created');assert.deepEqual(calls,['POST',{request_id:'creation-uncertain'}]);
});
test('Sólo el rechazo conocido del POST inicial con ID exacto retira una creación sin escritura',async()=>{
  const stages=require('../ppp-stages.js');assert.deepEqual(intake.PREWRITE_ERRORS,stages.PREWRITE_ERRORS);
  for(const error of intake.PREWRITE_ERRORS){
    const states=[],c=intake.createController({requestId:()=> 'new-request',adapter:{open:async p=>({ok:false,error,persisted:false,request_id:p.request_id})},onState:s=>states.push(s.status)});
    await c.submit(sample());assert.equal(c.pending,null,error);assert.equal(states.at(-1),'error');
    for(const request_id of [undefined,'foreign']){const x=intake.createController({requestId:()=> 'new-request',adapter:{open:async()=>({ok:false,error,persisted:false,request_id})}});await x.submit(sample());assert.equal(x.pending.request_id,'new-request',error);}
    let reads=0;const x=intake.createController({requestId:()=> 'new-request',adapter:{open:async()=>{throw Error('timeout');},read:async p=>{reads++;return{ok:false,error,persisted:false,request_id:p.request_id};}}});await x.submit(sample());await x.submit(sample());assert.equal(reads,1);assert.equal(x.pending.request_id,'new-request','GET '+error+' cannot discard an earlier write');
  }
  for(const error of ['unexpected','operation_pending','receipt_not_found','request_payload_mismatch','intake_readback_mismatch']){const c=intake.createController({requestId:()=> 'new-request',adapter:{open:async p=>({ok:false,error,persisted:false,request_id:p.request_id})}});await c.submit(sample());assert.equal(c.pending.request_id,'new-request');}
});

function clock(){let next=0;const timers=new Map();return{schedule(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},cancel(id){timers.delete(id);},expire(){assert.equal(timers.size,1);const [id,t]=timers.entries().next().value;timers.delete(id);t.fn();return t.ms;},get size(){return timers.size;}};}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('A slow creation releases the UI at 60 seconds, ignores its late ACK and recovers only by exact GET',async()=>{
  const timer=clock(),states=[],calls=[];let resolvePost,resolveRead;
  const controller=intake.createController({...timer,requestId:()=> 'slow-creation',onState:s=>states.push(s.status),adapter:{open:request=>{calls.push(['POST',request.request_id]);return new Promise(resolve=>{resolvePost=resolve;});},read:request=>{calls.push(['GET',request.request_id]);return new Promise(resolve=>{resolveRead=resolve;});}}});
  const opening=controller.submit(sample());await turn();assert.equal((await controller.submit(sample())).error,'ocupado');assert.equal(timer.expire(),60000);assert.equal((await opening).ok,false);assert.equal(states.at(-1),'uncertain');assert.equal(controller.pending.request_id,'slow-creation');
  resolvePost({ok:true,status:'confirmed',persisted:true,caso_id:'late-case',revision:'r1',request_id:'slow-creation'});await turn();assert.equal(states.includes('confirmed'),false);
  const checking=controller.submit(sample());await turn();assert.deepEqual(calls,[['POST','slow-creation'],['GET','slow-creation']]);
  resolveRead({ok:true,status:'confirmed',persisted:true,caso_id:'canonical-case',revision:'r2',request_id:'slow-creation'});assert.equal((await checking).caso_id,'canonical-case');assert.equal(states.at(-1),'confirmed');assert.equal(timer.size,0);
});
test('A slow receipt read is bounded and remains recoverable without another POST or request ID',async()=>{
  const timer=clock();let posts=0,reads=0,resolveLate;
  const controller=intake.createController({...timer,requestId:()=> 'same-request',adapter:{open:async()=>{posts++;throw Error('lost_ack');},read:()=>{reads++;if(reads===1)return new Promise(resolve=>{resolveLate=resolve;});return Promise.resolve({ok:true,status:'confirmed',persisted:true,caso_id:'same-case',revision:'r1',request_id:'same-request'});}}});
  await controller.submit(sample());const checking=controller.submit(sample());await turn();timer.expire();assert.equal((await checking).ok,false);resolveLate({ok:false,persisted:false,error:'invalid_request',request_id:'same-request'});await turn();assert.equal(controller.pending.request_id,'same-request');assert.equal((await controller.submit(sample())).caso_id,'same-case');assert.equal(posts,1);assert.equal(reads,2);
});
test('An uncertain custom adapter without a receipt reader never repeats the write',async()=>{
  let posts=0;const controller=intake.createController({requestId:()=> 'once-only',adapter:{open:async()=>{posts++;throw Error('lost_ack');}}});await controller.submit(sample());await controller.submit(sample());assert.equal(posts,1);assert.equal(controller.pending.request_id,'once-only');
});
test('Native autosave and both stage transports share a bounded wait without retrying any transport',async()=>{
  for(const operation of ['update','read','stage-write','stage-read']){
    const timer=clock(),calls=[];const adapter=intake.nativeAdapter({...timer,type:'vertical',get:query=>{calls.push(['GET',query]);return new Promise(()=>{});},post:payload=>{calls.push(['POST',payload]);return new Promise(()=>{});}});
    const job={caso_id:'case-1',request_id:'same-operation',intake:{inputs:{inTerreno:500}}};
    const waiting=operation==='update'?adapter.update(job):operation==='read'?adapter.read({id:'case-1',request_id:job.request_id}):adapter.saveStages(job,{reconcile:operation==='stage-read'});const rejected=assert.rejects(waiting,/request_timeout/);await turn();assert.equal(timer.expire(),60000);await rejected;assert.equal(calls.length,1);assert.equal(calls[0][0],['read','stage-read'].includes(operation)?'GET':'POST');
  }
});
test('Creation diagnostics retain the first failure and latest receipt reason without exposing arbitrary server content',async()=>{
  const states=[];let posts=0;const controller=intake.createController({requestId:()=> 'support-operation',onState:s=>states.push(s),adapter:{open:async()=>{posts++;return{ok:false,error:'lock_busy'};},read:async()=>({ok:false,error:'receipt_not_found'})}});
  await controller.submit(sample());await controller.submit(sample());const current=states.at(-1);assert.equal(current.initial_error,'lock_busy');assert.equal(current.error,'receipt_not_found');assert.equal(posts,1);assert.equal(intake.diagnosticText(current),' Diagnóstico: lock_busy · última consulta: receipt_not_found · Solicitud: support-operation');
  const unsafe={status:'uncertain',request_id:'support-operation',initial_error:'<img src=x> SECRET_TOKEN',error:'Bearer private-value'};assert.equal(intake.diagnosticText(unsafe),' Diagnóstico: sin_confirmacion · Solicitud: support-operation');assert.equal(intake.diagnosticText({...unsafe,request_id:'token<script>'}), '');
  const busy=intake.createController({requestId:()=> 'server-busy',adapter:{open:async()=>({ok:false,persisted:false,error:'ocupado',request_id:'server-busy'})}});await busy.submit(sample());assert.equal(busy.pending.request_id,'server-busy');assert.equal(intake.safeError('ocupado'),'ocupado');assert.equal(intake.PREWRITE_ERRORS.includes('ocupado'),false,'a support code never authorizes another POST');
});
