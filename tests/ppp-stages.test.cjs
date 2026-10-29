'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const api=require('../ppp-stages.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const hash=async text=>crypto.createHash('sha256').update(text).digest('hex');
const spec=(count=3,duration=12)=>({schema:1,count,duration_months:duration,mode:'sequential',allocation:'preserve'});
const canonical=(count=3,duration=12)=>({...spec(count,duration),stages:Array.from({length:count},(_,i)=>({id:'stage-'+(i+1),order:i+1,start_month:1+i*duration,duration_months:duration,end_month:(i+1)*duration}))});
const cap=()=>({schema:1,read:true,write:true,max_stages:24,max_months:1200,modes:['sequential'],allocation_modes:['preserve'],assumption:'Etapas consecutivas; se conservan las distribuciones existentes.'});
const context=(patch={})=>({verified:true,ready:true,model_type:'vertical',case_id:'synthetic-case',scenario_id:'scenario-a',revision:'r1',native_capability:cap(),native_collection:canonical(1,12),...patch});
function model(payload,patch={}){const collection=canonical(payload.stages.count,payload.stages.duration_months);return{ok:true,caso_id:payload.caso_id,revision:'r2',escenarios:[{id:payload.escenario_id}],capabilities:{stages:cap()},stages_by_scenario:{[payload.escenario_id]:collection},stage_receipt:{request_id:payload.request_id,caso_id:payload.caso_id,escenario_id:payload.escenario_id,base_revision:payload.revision_esperada,result_revision:'r2',stages:collection,calculated:true,checks:Object.fromEntries(api.CHECKS.map(k=>[k,true]))},...patch};}
function harness(onSave){let current=context(),i=0;const states=[];const c=api.createController({getContext:()=>current,onSave:(p,o)=>onSave(p,o,h),onState:s=>states.push(s),hash,uuid:()=>String(++i)});const h={c,states,setContext(n){current=n;c.setContext(n);},getContext:()=>current,accept(m){current=context({revision:m.revision,native_collection:m.stages_by_scenario['scenario-a']});c.setContext(current);}};c.setContext(current);return h;}
async function rejection(p,error='revision_conflict'){const actor='synthetic-actor';const proof={request_id:p.request_id,caso_id:p.caso_id,escenario_id:p.escenario_id,base_revision:p.revision_esperada,actor,payload_hash:await hash(api.stable({actor,caso_id:p.caso_id,escenario_id:p.escenario_id,base_revision:p.revision_esperada,stages:p.stages})),stage:'prewrite',write_attempted:false,error,rejected_at:new Date().toISOString()};return{ok:false,error:'operation_rejected',request_id:p.request_id,stage_operation_status:'rejected',stage_rejection:proof};}

test('typed and dictated Spanish produce the same bounded stages drivers',()=>{
 for(const text of ['3 etapas de 12 meses','Van a ser 3 etapas de 12 meses.','mira van a ser tres etapas de doce meses','Serán tres etapas de doce meses cada una','Por favor, organiza en tres etapas con doce meses por etapa','cambia a tres etapas de doce meses, por favor'])assert.deepEqual(api.parseCommand(text),spec());
 assert.deepEqual(api.parseCommand('una etapa de treinta y seis meses'),spec(1,36));
 assert.deepEqual(api.parseCommand('dos etapas de ciento veinte meses'),spec(2,120));
 assert.deepEqual(api.parseCommand('1 etapa de mil doscientos meses'),spec(1,1200));
 assert.match(api.describeProposal(spec()),/consecutivas, 36 meses/);assert.match(api.describeProposal(spec()),/distribuciones existentes/);
});
test('ambiguous, negative, fractional, multiple and unsupported commands never write',()=>{
 for(const text of ['3 etapas','3 etapas de 12 o 18 meses','3 etapas de doce meses y 2 etapas de seis meses','no hagas 3 etapas de 12 meses','3.5 etapas de 12 meses','-3 etapas de 12 meses','3 etapas de 12.5 meses','3 etapas simultáneas de 12 meses','3 etapas de 12 meses vende 20','cero etapas de 12 meses','25 etapas de 12 meses','3 etapas de 600 meses','=3 etapas de 12 meses','3 etapas de $12 meses'])assert.throws(()=>api.parseCommand(text),text);
 assert.throws(()=>api.parseCommand('3 etapas de 12 meses',{max_stages:2,max_months:1200}));assert.throws(()=>api.parseCommand('3 etapas de 12 meses',{max_stages:24,max_months:24}));
});
test('only five verified native model types can issue the exact request envelope',()=>{
 for(const type of ['vertical','macrolotes','unifamiliar','residencial','patrimonial'])assert.equal(api.request(context({model_type:type}),spec(),'stages-1').tipo_desarrollo,type.toUpperCase());
 const p=api.request(context(),spec(),'stages-1');assert.deepEqual(Object.keys(p).sort(),['caso_id','escenario_id','request_id','revision_esperada','stages','tipo','tipo_desarrollo']);
 for(const patch of [{model_type:'other'},{verified:false},{ready:false},{case_id:''},{scenario_id:''},{revision:''},{native_capability:{...cap(),write:false}},{native_capability:null}])assert.throws(()=>api.request(context(patch),spec(),'stages-1'));
 assert.throws(()=>api.request(context(),{...spec(),sales:12},'stages-1'));assert.throws(()=>api.request(context(),spec(),'../../foreign'));
});
test('canonical calendar must have distinct stable IDs, complete rows and consecutive months',()=>{
 assert.deepEqual(api.validateCollection(canonical()),canonical());
 for(const change of [m=>m.stages.pop(),m=>m.stages[1].id=m.stages[0].id,m=>m.stages[1].start_month=18,m=>m.stages[0].duration_months=13,m=>m.stages[1].order=1,m=>m.stages[0].end_month=13,m=>m.stages[0].sales=100,m=>m.count=0]){const c=canonical();change(c);assert.throws(()=>api.validateCollection(c));}
});
test('readback needs exact case, scenario, base, request, revision, all checks and matching canonical drivers',()=>{
 const p=api.request(context(),spec(),'stages-1'),m=model(p);assert.equal(api.receipt(m,p).calculated,true);
 for(const change of [m=>m.caso_id='other',m=>m.stage_receipt.caso_id='other',m=>m.stage_receipt.escenario_id='other',m=>m.stage_receipt.request_id='other',m=>m.stage_receipt.base_revision='other',m=>delete m.stage_receipt.checks.cash,m=>m.stage_receipt.checks.cash=false,m=>m.stage_receipt.stages=canonical(2,12),m=>m.stages_by_scenario['scenario-a']=canonical(2,12),m=>m.revision='r3']){const n=clone(m);change(n);assert.throws(()=>api.receipt(n,p));}
 assert.throws(()=>api.receipt(m,p,()=>false));
});
test('saved with pending checks and superseded historical receipts remain distinguished',()=>{
 const p=api.request(context(),spec(),'stages-1'),m=model(p);m.stage_receipt.calculated=false;m.stage_receipt.checks.distribution=false;assert.equal(api.receipt(m,p).calculated,false);
 m.revision='r3';m.stage_receipt_status='superseded';m.stages_by_scenario['scenario-a']=canonical(4,12);const ack=api.receipt(m,p);assert.equal(ack.status,'confirmed_superseded');assert.equal(ack.native_collection.count,3);assert.equal(ack.current_collection.count,4);
});
test('successful command updates the same view only after canonical receipt and matching live context',async()=>{
 const h=harness(async(p,o,h)=>{assert.equal(o.reconcile,false);const m=model(p);h.accept(m);return m;});h.c.setCommand('3 etapas de 12 meses');assert.equal(await h.c.save(),true);assert.equal(h.c.status().phase,'saved');assert.equal(h.c.status().pending,false);assert.equal(h.c.status().receipt.calculated,true);
 const stale=harness(async p=>model(p));stale.c.setCommand('3 etapas de 12 meses');assert.equal(await stale.c.save(),false);assert.equal(stale.c.status().phase,'unconfirmed');assert.equal(stale.c.status().pending,true);
});
test('an uncertain write is reconciled using the exact request ID and never retried as a new POST',async()=>{
 const calls=[];const h=harness(async(p,o,h)=>{calls.push({p,o});if(!o.reconcile)throw Error('timeout');const m=model(p);h.accept(m);return m;});h.c.setCommand('3 etapas de 12 meses');assert.equal(await h.c.save(),false);assert.equal(h.c.setCommand('4 etapas de 12 meses'),false);assert.equal(await h.c.save(),true);assert.deepEqual(calls.map(c=>c.o.reconcile),[false,true]);assert.deepEqual(calls[0].p,calls[1].p);
});
test('concurrent clicks create one request and callbacks cannot overwrite another case',async()=>{
 let finish,calls=0;const h=harness(p=>{calls++;return new Promise(resolve=>{finish=()=>resolve(model(p));});});h.c.setCommand('3 etapas de 12 meses');const pending=h.c.save();assert.equal(await h.c.save(),false);assert.equal(calls,1);h.setContext(context({case_id:'other-case'}));finish();assert.equal(await pending,false);assert.equal(h.c.status().command,'');assert.equal(h.c.status().receipt,null);assert.equal(h.c.status().context.case_id,'other-case');assert.equal(h.c.status().phase,'ready');assert.equal(h.states.at(-1).busy,false);assert.equal(h.states.at(-1).context.case_id,'other-case');
});
test('malformed receipt or plain error never falsely retires an uncertain operation',async()=>{
 for(const response of [{ok:false,error:'revision_conflict'},{ok:false,error:'forbidden'}, {ok:true,revision:'r2'}]){const h=harness(async()=>response);h.c.setCommand('3 etapas de 12 meses');assert.equal(await h.c.save(),false);assert.equal(h.c.status().pending,true);assert.equal(h.c.status().phase,'unconfirmed');}
});
test('durable prewrite rejection is bound to the exact actor, payload and identity',async()=>{
 const p=api.request(context(),spec(),'stages-1'),r=await rejection(p);assert.equal((await api.rejection(r,p,hash)).error,'revision_conflict');
 for(const change of [r=>r.stage_rejection.payload_hash='f'.repeat(64),r=>r.stage_rejection.caso_id='foreign',r=>r.stage_rejection.write_attempted=true,r=>r.stage_rejection.error='anything',r=>r.stage_rejection.actor='changed',r=>r.stage_rejection.stage='atomic_write']){const v=clone(r);change(v);await assert.rejects(()=>api.rejection(v,p,hash));}
});
test('proven conflict preserves instruction, blocks stale resubmit and permits review after refresh',async()=>{
 const h=harness(async(p,o,h)=>{if(h.getContext().revision==='r1')return rejection(p);const m=model(p,{revision:'r3'});m.stage_receipt.result_revision='r3';h.accept(m);return m;});h.c.setCommand('3 etapas de 12 meses');assert.equal(await h.c.save(),false);assert.equal(h.c.status().phase,'conflict');assert.equal(h.c.status().pending,false);assert.equal(h.c.status().command,'3 etapas de 12 meses');assert.equal(await h.c.save(),false);h.setContext(context({revision:'r2'}));assert.equal(await h.c.save(),true);
});
class Element{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.dataset={};this.classList={add(){}};this.value='';this._text='';this.hidden=false;}set textContent(v){this.children=[];this._text=String(v);}get textContent(){return this._text+this.children.map(x=>x.textContent).join(' ');}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;this._text='';}setAttribute(k,v){this.attrs[k]=String(v);}addEventListener(k,f){(this.listeners[k]??=[]).push(f);}removeEventListener(k,f){this.listeners[k]=(this.listeners[k]||[]).filter(x=>x!==f);}emit(k,e={}){for(const f of this.listeners[k]||[])f(e);}all(){return this.children.flatMap(n=>[n,...n.all()]);}}
function mounted({speech,initial=context(),onSave=async()=>{throw Error('timeout');}}={}){let current=initial;const container=new Element('section'),win=new Element('window'),doc={createElement:t=>new Element(t)};if(speech)win.SpeechRecognition=speech;const view=api.mount({container,getContext:()=>current,onSave,doc,win,uuid:()=> 'synthetic-1'});return{view,container,win,setContext(c){current=c;view.setContext(c);},button:text=>container.all().find(x=>x.tag==='button'&&x.textContent===text),input:()=>container.all().find(x=>x.tag==='textarea')};}
test('same inline panel has text alternative and disables unverified capabilities',()=>{
 const h=mounted();assert.equal(h.button('Dictar').hidden,true);assert.equal(h.input().disabled,false);assert.match(h.container.textContent,/1 etapa actual/);h.view.setCommand('3 etapas de 12 meses');assert.match(h.container.textContent,/36 meses/);h.view.dispose();
 const noCap=mounted({initial:context({native_capability:null})});assert.equal(noCap.input().disabled,true);assert.equal(noCap.button('Aplicar al plan').disabled,true);assert.match(noCap.container.textContent,/no está habilitada/);noCap.view.dispose();
});
test('speech starts only on click and returns editable text without submitting',()=>{
 let speech,started=0,writes=0;class Speech{constructor(){speech=this;}start(){started++;}abort(){}stop(){this.onend();}}
 const h=mounted({speech:Speech,onSave:async()=>{writes++;}});assert.equal(started,0);h.button('Dictar').emit('click');assert.equal(started,1);speech.onresult({resultIndex:0,results:[Object.assign([{transcript:'tres etapas de doce meses'}],{isFinal:true})]});assert.equal(h.input().value,'tres etapas de doce meses');assert.equal(writes,0);speech.onend();h.view.dispose();
});
test('late speech and private drafts are cleared on case changes or session withdrawal',()=>{
 let speech;class Speech{constructor(){speech=this;}start(){}abort(){}}
 const h=mounted({speech:Speech});h.button('Dictar').emit('click');h.setContext(context({case_id:'other'}));speech.onresult({results:[[{transcript:'tres etapas de doce meses'}]]});assert.equal(h.input().value,'');h.view.setCommand('3 etapas de 12 meses');h.win.emit('storage',{key:'pyod_clave_v1'});assert.equal(h.input().value,'');assert.equal(h.input().disabled,true);h.view.dispose();
});

test('a bound atomic rejection releases uncertainty only with explicit committed false',async()=>{
 const p=api.request(context(),spec(),'stages-1'),r=await rejection(p);Object.assign(r.stage_rejection,{stage:'atomic_write',write_attempted:true,committed:false,error:'native_stage_write_rejected'});assert.equal((await api.rejection(r,p,hash)).status,'rejected');
 for(const change of [r=>r.stage_rejection.committed=true,r=>delete r.stage_rejection.committed,r=>r.stage_rejection.write_attempted=false,r=>r.stage_rejection.payload_hash='0'.repeat(64)]){const v=clone(r);change(v);await assert.rejects(()=>api.rejection(v,p,hash));}
});


test('single month is valid Spanish while the malformed singular mese is rejected',()=>{
 assert.deepEqual(api.parseCommand('una etapa de un mes'),spec(1,1));assert.throws(()=>api.parseCommand('una etapa de un mese'));assert.match(api.describeProposal(spec(1,1)),/de 1 mes\. Supuesto: consecutivas, 1 mes para las etapas/);
});
test('canonical initial stage is displayed pending only with its explicit authoritative signal',()=>{
 const initial={schema:1,count:1,duration_months:null,mode:'sequential',allocation:'preserve'};const c=context({native_capability:{...cap(),initial_pending:true},native_collection:null,native_pending_stages:initial});assert.equal(api.initialPending(c),true);
 const h=mounted({initial:c});assert.match(h.container.textContent,/1 etapa actual · duración pendiente · lectura de Sheets/);assert.match(h.container.textContent,/Etapa 1 · duración por definir/);assert.equal(h.input().disabled,false);assert.equal(h.container.all().filter(e=>e.tag==='li').length,1);assert.equal(h.view.snapshotStatus().receipt,null);h.view.dispose();
 for(const patch of [{verified:false},{native_capability:cap()},{native_collection:canonical()},{native_pending_stages:{...initial,count:2}},{native_pending_stages:{...initial,duration_months:0}},{native_pending_stages:{...initial,stages:[]}}])assert.equal(api.initialPending({...c,...patch}),false);
 assert.throws(()=>api.validateStages(initial));assert.throws(()=>api.request(c,initial,'stages-1'));assert.deepEqual(api.request(c,spec(),'stages-1').stages,spec());
});
test('initial pending stage becomes a canonical calendar with pending finance checks after readback',async()=>{
 const c=context({native_capability:{...cap(),initial_pending:true},native_collection:null,native_pending_stages:{schema:1,count:1,duration_months:null,mode:'sequential',allocation:'preserve'}});const h=harness(async(p,o,h)=>{const m=model(p);m.stage_receipt.calculated=false;for(const key of ['sales','costs','cash','debt','distribution'])m.stage_receipt.checks[key]=false;h.accept(m);return m;});h.setContext(c);h.c.setCommand('3 etapas de 12 meses');assert.equal(await h.c.save(),true);assert.equal(h.c.status().phase,'needs_review');assert.equal(h.c.status().receipt.calculated,false);assert.equal(h.c.status().context.native_collection.count,3);
});

test('native checks describe the current revision after unrelated edits and never replay old confirmation',async()=>{
 const all=Object.fromEntries(api.CHECKS.map(k=>[k,true])),pending={...all,cash:false};const h=harness(async(p,o,h)=>{const m=model(p);h.accept(m);return m;});h.c.setCommand('3 etapas de 12 meses');assert.equal(await h.c.save(),true);h.setContext(context({revision:'r3',native_collection:canonical(),native_checks:pending,native_calculated:false}));assert.equal(h.c.status().receipt,null);assert.equal(h.c.status().phase,'ready');assert.deepEqual(api.nativeChecks(h.getContext()),pending);
 const ui=mounted({initial:h.getContext()});assert.equal(ui.container.all().filter(e=>e.className==='ppp-check-pending').length,1);assert.match(ui.container.textContent,/Caja: pendiente/);ui.view.dispose();
 assert.equal(api.nativeChecks(context({native_checks:pending,native_calculated:true})),null);assert.equal(api.nativeChecks(context({native_checks:{cash:false},native_calculated:false})),null);
});
test('command preview uses the native calendar assumption without claiming the full project horizon',()=>{
 const assumption='La obra conserva las proporciones del calendario original y los plazos de preventa y entrega.';const h=mounted({initial:context({native_capability:{...cap(),assumption}})});h.view.setCommand('3 etapas de 12 meses');assert.match(h.container.textContent,/36 meses para las etapas/);assert.match(h.container.textContent,/conserva las proporciones del calendario original/);assert.doesNotMatch(h.container.textContent,/36 meses en total/);h.view.dispose();
});
