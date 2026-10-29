const {test}=require('node:test');const assert=require('node:assert/strict');
const {Store,validate}=require('../ppp-patrimonial-native.js');const fixture=require('./fixtures/patrimonial-native.json');const pendingFixture=require('./fixtures/patrimonial-pending.json');
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(post=async()=>copy(fixture),get=async()=>copy(fixture)){const s=new Store({id:'synthetic-case',get,post,requestId:()=> 'synthetic-request'});s.load(fixture);return s;}
test('Native formula fixture and missing CUS remain typed; no fallback',()=>{assert.equal(validate(fixture,'synthetic-case').state.noi,1387700);assert.equal(validate(pendingFixture,'synthetic-case').state.modeloValido,false);assert.equal(pendingFixture.state.noi,null);});
test('Reject foreign case, untyped model, invalid year and duplicate identities',()=>{for(const change of [m=>m.caso_id='other',m=>delete m.modelo_tipo,m=>m.estados.synthetic.rows[0].a=2,m=>m.escenarios.push(copy(m.escenarios[0]))]){const m=copy(fixture);change(m);assert.throws(()=>validate(m,'synthetic-case'));}});
test('Allow only editable fields; null is explicit; integer is enforced; zero rent retained',()=>{const s=setup();for(const [k,v] of [['inM2Rentable',120],['inUnidades',1.5],['inUnidades',null],['__proto__',0],['inCus',20]])assert.throws(()=>s.change(k,v));s.change('inCus',null);s.change('unidad01_renta',0);assert.deepEqual(s.pending,{inCus:null,unidad01_renta:0});});
test('Send only changed inputs and CAS; keep confirmed results until successful response',async()=>{let release,body;const s=setup(b=>{body=b;return new Promise(r=>release=r)});s.change('inRentaUnidadMes',20000);const p=s.flush();assert.equal(s.model.state.rentaMes,150000);assert.deepEqual(body.inputs,{inRentaUnidadMes:20000});assert.equal(body.revision_esperada,'synthetic-revision');assert.equal(body.escenario_id,'synthetic');const next=copy(fixture);next.revision='after';next.escenarios[0].inputs.inRentaUnidadMes=20000;next.estados.synthetic.rentaMes=200000;release(next);assert.equal(await p,true);assert.equal(s.model.state.rentaMes,200000);assert.equal(s.dirty(),false);});
test('Newer edits survive acknowledgement; failed retry keeps request identity',async()=>{let release,calls=[];const s=setup(b=>{calls.push(b);return new Promise(r=>release=r)});s.change('inCus',3);const p=s.flush();s.change('inCus',4);release({ok:false,error:'offline'});await p;assert.equal(s.values().inCus,4);assert.equal(s.model.inputs.inCus,2.8);const retry=s.flush();assert.deepEqual(calls[0],calls[1]);release(copy(fixture));await retry;assert.equal(s.pending.inCus,4);});
test('CAS conflict and refresh preserve local pending values and confirmed model',async()=>{const s=setup(async()=>({ok:false,error:'conflicto_revision'}),async()=>({...copy(fixture),revision:'other'}));s.change('inCus',3);await s.flush();assert.equal(s.error,'conflicto_revision');assert.equal(await s.flush(),false);assert.equal(await s.refresh(),false);assert.equal(s.values().inCus,3);assert.equal(s.model.revision,'synthetic-revision');assert.equal(await s.refresh(true),true);assert.equal(s.model.revision,'other');assert.equal(s.dirty(),false);});
test('Cached draft cannot send until fresh revision confirmed',async()=>{let posts=0;const s=setup(async()=>{posts++;return copy(fixture)});s.change('inCus',3);const restored=setup(async()=>{posts++;return copy(fixture)});restored.restore(s.snapshot());assert.equal(await restored.flush(),false);assert.equal(posts,0);await restored.refresh();assert.equal(await restored.flush(),true);assert.equal(posts,1);});
test('Version changes require confirmed synchronized quantities',async()=>{let posts=0;const s=setup(async()=>{posts++;return copy(fixture)});s.change('inCus',3);await assert.rejects(s.version('duplicar','synthetic','Next'),/pendientes/);assert.equal(posts,0);});
test('Late response after leaving the case cannot alter model or notify',async()=>{let release,notified=0;const s=setup(()=>new Promise(r=>release=r));s.changed=()=>notified++;s.change('inCus',3);const p=s.flush();s.destroy();const n=notified;release({...copy(fixture),revision:'late'});await p;assert.equal(s.model.revision,'synthetic-revision');assert.equal(notified,n);});
test('Malformed server response retains job and confirmed quantities',async()=>{const s=setup(async()=>({ok:true,revision:'bad'}));s.change('inCus',3);assert.equal(await s.flush(),false);assert.equal(s.error,'sin_confirmacion');assert.equal(s.values().inCus,3);assert.equal(s.model.revision,'synthetic-revision');});
test('Lost ACK survives reload: fresh read permits only the exact receipt replay',async()=>{
 let body;const receipt=copy(fixture);receipt.revision='receipt';receipt.escenarios[0].inputs.unidad01_renta=0;
 const s=setup(async b=>{body=b;throw Error('ACK lost');});s.change('unidad01_renta',0);await s.flush();
 const latest=copy(receipt);latest.revision='later';latest.escenarios[0].inputs.unidad02_renta=17000;
 let calls=[];const restored=setup(async b=>{calls.push(b);return receipt;},async()=>latest);restored.restore(s.snapshot());
 assert.equal(await restored.flush(),false);assert.equal(await restored.refresh(),false);assert.equal(restored.retryable(),true);
 assert.equal(await restored.flush(),true);assert.deepEqual(calls,[body]);assert.equal(restored.job,null);assert.equal(restored.model.revision,'later');assert.equal(restored.verified,true);
});
test('Expired receipt preserves job and later edits without changing CAS or request ID',async()=>{
 let request;const s=setup(async b=>{request=b;throw Error('ACK lost');});s.change('unidad01_renta',0);await s.flush();s.change('unidad02_renta',18000);
 let sent;const restored=setup(async b=>{sent=b;return {ok:false,error:'conflicto_revision'};},async()=>({...copy(fixture),revision:'later'}));restored.restore(s.snapshot());await restored.refresh();
 assert.equal(await restored.flush(),false);assert.deepEqual(sent,request);assert.equal(restored.values().unidad02_renta,18000);assert.equal(restored.job.request_id,request.request_id);assert.equal(restored.retryable(),false);
});
test('Restored cache cannot substitute an operation or introduce readonly quantities',()=>{
 const s=setup();s.change('inCus',null);for(const job of [{tipo:'archivar',caso_id:s.id,escenario_id:'synthetic',revision_esperada:'x',request_id:'x',inputs:{}},{tipo:'sheet-cantidades',caso_id:s.id,escenario_id:'synthetic',revision_esperada:'x',request_id:'x',inputs:{inM2Rentable:10}}])assert.throws(()=>setup().restore({...s.snapshot(),job}));
});
test('Per-case cache preserves Local, rent zero, missing CUS and metadata drafts across cases',()=>{
 const {saveCache,cached,removeCache}=require('../ppp-patrimonial-native.js');const data=new Map();const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const a=setup();a.change('unidad01_tipo',1);a.change('unidad01_renta',0);a.change('inCus',null);const first={metadata:{caso_id:a.id},metadataDraft:{notas_caso:'Pendiente para A'},...a.snapshot()};saveCache(first,storage);
 const b=copy(fixture);b.caso_id='case-B';saveCache({metadata:{caso_id:b.caso_id},model:b,pending:{},job:null},storage);
 const restored=setup();restored.restore(cached(a.id,storage));assert.deepEqual(restored.pending,first.pending);assert.equal(cached(a.id,storage).metadataDraft.notas_caso,'Pendiente para A');removeCache('case-B',storage);assert.ok(cached(a.id,storage));
 data.set('pyod_patrimonial_native_v1',JSON.stringify(first));data.delete('pyod_patrimonial_native_v1:'+a.id);assert.deepEqual(cached(a.id,storage),first);assert.equal(cached('foreign',storage),null);
});

function inactiveCapModel(){const m=copy(fixture),e=m.escenarios.find(e=>e.id===m.activo),s=m.estados[m.activo];e.inputs.inCapRateMercado=0;e.inputs.inValorM2Zona=25000;s.porM2=true;s.p.capMercado=0;s.inactive_fields=['inCapRateMercado'];return m;}
test('zero cap rate requires the exact inactive field contract and remains unwriteable',()=>{
 const m=inactiveCapModel(),before=JSON.stringify(m),s=setup();s.load(m);
 assert.equal(s.active().inputs.inCapRateMercado,0);assert.equal(s.fieldNote('inCapRateMercado'),'No aplicado: valuación por m²');assert.equal(s.fieldNote('inValorM2Zona'),'');
 for(const v of [0,null,.08,4.99,14.01])assert.throws(()=>s.change('inCapRateMercado',v),/campo_invalido/);
 assert.deepEqual(s.pending,{});assert.equal(JSON.stringify(m),before);s.change('inCapRateMercado',8);assert.equal(s.pending.inCapRateMercado,8);assert.equal(s.active().inputs.inCapRateMercado,0);
});
test('missing or incoherent inactive metadata never turns an invalid cap rate into a valid rate',()=>{
 for(const mutate of [m=>delete m.estados[m.activo].inactive_fields,m=>m.estados[m.activo].inactive_fields=[],m=>m.estados[m.activo].inactive_fields=['inValorM2Zona'],m=>m.estados[m.activo].inactive_fields.push('inCapRateMercado'),m=>m.escenarios[0].inputs.inCapRateMercado=8,m=>m.escenarios[0].inputs.inValorM2Zona=0,m=>m.estados[m.activo].porM2=false,m=>m.estados[m.activo].p.capMercado=.08]){
  const m=inactiveCapModel();mutate(m);assert.throws(()=>validate(m,m.caso_id));
 }
 const m=copy(fixture);m.escenarios[0].inputs.inCapRateMercado=0;assert.throws(()=>validate(m,m.caso_id));
});

test('native editor shows an inactive field as unapplied while retaining original edit constraints',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../ppp-patrimonial-native.js'),'utf8');
 const start=source.indexOf('const editor=c=>'),end=source.indexOf('\n      const resultNames=',start);assert.ok(start>=0&&end>start);
 const store=setup();store.load(inactiveCapModel());const field=store.model.campos.find(c=>c.id==='inCapRateMercado');
 const render=()=>vm.runInNewContext(source.slice(start,end)+';editor',{store,v:store.values(),escape:String,labelFor:id=>id})(field);
 let html=render();assert.match(html,/value=""/);assert.match(html,/min="5" max="14"/);assert.match(html,/required/);assert.match(html,/No aplicado: valuación por m²/);assert.equal(store.active().inputs.inCapRateMercado,0);
 store.change('inCapRateMercado',8);html=render();assert.match(html,/value="8"/);assert.equal(store.active().inputs.inCapRateMercado,0);
});
