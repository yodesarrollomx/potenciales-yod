const test=require('node:test'),assert=require('node:assert/strict');
const {Store}=require('../ppp-patrimonial-native.js'),bridge=require('../ppp-agent-bridge.js');
function fixture(){return{ok:true,modelo_tipo:'patrimonial',modelo_revision:'patrimonial-sheet-v1',caso_id:'case-synthetic',revision:'r1',activo:'scenario-base',
 campos:[{id:'inRenta',min:0,max:10000,editable:true,nullable:true,kind:'number'},{id:'inArea',min:0,max:1000,editable:false,nullable:false,kind:'number'}],
 escenarios:[{id:'scenario-base',nombre:'Base sintética',activo:true,esBase:true,inputs:{inRenta:100,inArea:200}}],
 estados:{'scenario-base':{p:{horizonte:1},modeloValido:false,geometriaEstado:'PENDIENTE',rows:[],unidades:[]}}};}
function setup(){const writes=[],store=new Store({id:'case-synthetic',get:async()=>fixture(),post:async payload=>{writes.push(payload);const m=fixture();m.revision='r2';m.escenarios[0].inputs={...m.escenarios[0].inputs,...payload.inputs};return m;}});store.load(fixture());return{store,writes};}
const proposal=()=>({request_id:'board-synthetic-1',case_id:'case-synthetic',scenario_id:'scenario-base',revision:'r1',cambios:[{campo:'inRenta',valor:95}]});
test('shared board contains numerical source state without contacts or credentials',()=>{
 const {store,writes}=setup();const s=bridge.snapshot(store);assert.equal(s.confirmed,true);assert.equal(s.inputs.inRenta,100);assert.equal(s.results.geometriaEstado,'PENDIENTE');assert.equal(writes.length,0);store.change('inRenta',90);assert.equal(bridge.snapshot(store).pending,true);assert.equal(bridge.snapshot(store).inputs.inRenta,100);
});
test('proposal is inert until applied through existing CAS and server results',async()=>{
 const {store,writes}=setup(),p=proposal();bridge.validateProposal(store,p);assert.equal(writes.length,0);
 assert.equal(await bridge.apply(store,p),true);assert.equal(writes.length,1);assert.equal(writes[0].request_id,p.request_id);assert.equal(writes[0].revision_esperada,'r1');assert.equal(store.model.revision,'r2');assert.equal(bridge.snapshot(store).inputs.inRenta,95);
});
test('changed revision, pending input, wrong case and computed fields never write',async()=>{
 for(const mutate of [p=>p.revision='stale',p=>p.case_id='other',p=>p.cambios=[{campo:'inArea',valor:5}],p=>p.cambios=[{campo:'inRenta',valor:-1}],p=>p.cambios=[{campo:'inRenta',valor:1},{campo:'inRenta',valor:2}]]){
  const {store,writes}=setup(),p=proposal();mutate(p);await assert.rejects(()=>bridge.apply(store,p));assert.equal(writes.length,0);assert.equal(store.dirty(),false);
 }
 const {store,writes}=setup();store.change('inRenta',88);await assert.rejects(()=>bridge.apply(store,proposal()));assert.equal(writes.length,0);assert.equal(store.values().inRenta,88);
});
test('uncertain application retries exact request and payload once confirmed',async()=>{
 const {store,writes}=setup();const post=store.post;let first=true;store.post=async p=>{if(first){first=false;writes.push(structuredClone(p));throw Error('network');}return post(p);};
 assert.equal(await bridge.apply(store,proposal()),false);assert.equal(store.job.request_id,proposal().request_id);
 assert.equal(await bridge.apply(store,proposal()),true);assert.deepEqual(writes[0],writes[1]);assert.equal(store.job,null);
});

test('snapshot preserves model identity and the selected scenario horizon',()=>{
 const {store,writes}=setup(),first=bridge.snapshot(store);
 assert.deepEqual(first.metadata,{model_type:'patrimonial',model_revision:'patrimonial-sheet-v1',horizon:{value:1,unit:'year'}});
 store.model.escenarios.push({...store.active(),id:'scenario-second',nombre:'Alternativa sintética',activo:true,esBase:false});
 store.model.escenarios[0].activo=false;store.model.activo='scenario-second';store.model.revision='r3';
 store.model.estados['scenario-second']={...store.model.estados['scenario-base'],p:{horizonte:12}};
 const second=bridge.snapshot(store);
 assert.equal(second.scenario_id,'scenario-second');assert.equal(second.revision,'r3');
 assert.deepEqual(second.metadata.horizon,{value:12,unit:'year'});
 assert.deepEqual(first.metadata.horizon,{value:1,unit:'year'});assert.equal(writes.length,0);
 store.verified=false;assert.equal(bridge.snapshot(store).confirmed,false);
});
test('metadata names known units without converting numbers or assuming currency',()=>{
 const {store,writes}=setup(),inputs=store.active().inputs,state=store.model.estados[store.model.activo];
 Object.assign(inputs,{inTerrenoM2:null,inVacanciaPct:5,inCus:2,inHorizonte:12,unidad01_m2:30,unidad61_m2:40,inInversionTotal:1000});
 Object.assign(state,{noi:100,rentaMes:10,yieldOnCost:.05,dscr:1.2,coc:null,capacidadConstruida:200,recupAnios:10});
 const before=JSON.stringify(store.model),snapshot=bridge.snapshot(store);
 assert.deepEqual(snapshot.metadata.input_units,{inTerrenoM2:'m2',inVacanciaPct:'percent',inCus:'ratio',inHorizonte:'year',unidad01_m2:'m2'});
 assert.deepEqual(snapshot.metadata.result_units,{capacidadConstruida:'m2',yieldOnCost:'ratio',dscr:'ratio',coc:'ratio',recupAnios:'year'});
 assert.equal(snapshot.inputs.inVacanciaPct,5);assert.equal(snapshot.results.yieldOnCost,.05);
 assert.equal(snapshot.inputs.inTerrenoM2,null);assert.equal(snapshot.results.coc,null);
 assert.equal(snapshot.metadata.input_units.inInversionTotal,undefined);assert.equal(snapshot.metadata.result_units.noi,undefined);
 assert.equal(JSON.stringify(store.model),before);assert.equal(writes.length,0);
});
test('missing and invalid horizons remain absent instead of becoming zero or a default',()=>{
 for(const value of [undefined,null,'10',0,26,-1,1.5,Infinity]){
  const {store}=setup();store.model.estados[store.model.activo].p.horizonte=value;
  assert.equal(bridge.snapshot(store).metadata.horizon,undefined);
 }
});
test('unknown model contracts retain identity without borrowing patrimonial semantics',()=>{
 for(const change of [{modelo_tipo:'vertical'},{modelo_revision:'patrimonial-sheet-v2'}]){
  const {store}=setup();Object.assign(store.model,change);store.active().inputs.inHorizonte=10;
  store.model.estados[store.model.activo].yieldOnCost=.05;
  assert.deepEqual(bridge.snapshot(store).metadata,{model_type:store.model.modelo_tipo,model_revision:store.model.modelo_revision});
 }
 const {store}=setup();delete store.model.modelo_revision;assert.equal(bridge.snapshot(store).metadata,undefined);
});
