'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Store,MAX_AGENT_RECEIPTS,validateReceipts,saveCache}=require('../ppp-patrimonial-native.js');
const bridge=require('../ppp-agent-bridge.js'),fixture=require('./fixtures/patrimonial-native.json');
const copy=x=>structuredClone(x),ID=fixture.caso_id;
const proposal=()=>({request_id:'board-receipt-synthetic',case_id:ID,scenario_id:fixture.activo,revision:fixture.revision,cambios:[{campo:'inTerrenoM2',valor:644}]});
function setup(){
 let model=copy(fixture),writes=0,cache;model.escenarios.find(e=>e.id===model.activo).inputs.inTerrenoM2=500;
 const store=new Store({id:ID,get:async()=>copy(model),post:async p=>{writes++;model=copy(model);model.revision='receipt-r2';Object.assign(model.escenarios.find(e=>e.id===model.activo).inputs,p.inputs);return copy(model);},changed:s=>{cache=copy(s.snapshot());}});
 store.load(model);return{store,get model(){return model;},get writes(){return writes;},get cache(){return cache;}};
}
const receipt=(i=0)=>({request_id:'board-pending-'+i,case_id:ID,scenario_id:fixture.activo,revision:'prior-'+i,acknowledged_at:'2026-10-07T06:00:00.000Z'});
test('receipt derives only from a validated ACK and contains no quantities or credentials',async()=>{
 const s=setup();assert.equal(await bridge.apply(s.store,proposal()),true);assert.equal(s.writes,1);
 assert.equal(s.cache.job,null);assert.equal(s.cache.receipts.length,1);
 const r=s.cache.receipts[0];assert.deepEqual(Object.keys(r).sort(),['acknowledged_at','case_id','request_id','revision','scenario_id']);
 assert.equal(r.request_id,proposal().request_id);assert.equal(r.revision,'receipt-r2');assert.ok(Number.isFinite(Date.parse(r.acknowledged_at)));
 for(const response of [{ok:false,error:'offline'},{ok:true,revision:'untyped'},{...copy(fixture),caso_id:'other'}]){
  const x=setup();x.store.post=async()=>response;assert.equal(await bridge.apply(x.store,proposal()),false);assert.deepEqual(x.store.receipts,[]);assert.ok(x.store.job);
 }
});
test('full reload retains the exact ACK but requires a fresh confirmed read before replay',async()=>{
 const s=setup();await bridge.apply(s.store,proposal());let newWrites=0;
 const restored=new Store({id:ID,get:async()=>copy(s.model),post:async()=>{newWrites++;throw Error('forbidden replay');}});
 restored.restore(s.cache);assert.deepEqual(restored.readyReceipts(),[]);
 assert.equal(await restored.refresh(),true);assert.deepEqual(restored.readyReceipts(),s.cache.receipts);
 assert.equal(restored.acknowledgeReceipt({...s.cache.receipts[0],revision:'wrong'}),false);
 assert.equal(restored.acknowledgeReceipt(s.cache.receipts[0]),true);assert.deepEqual(restored.receipts,[]);assert.equal(s.writes,1);assert.equal(newWrites,0);
});
test('historical ACKs remain exact reconciliation candidates after later scenario/revision reads',async()=>{
 const s=setup();await bridge.apply(s.store,proposal());
 assert.throws(()=>new Store({id:'other'}).restore(s.cache));
 for(const mode of ['revision','scenario','read-failed']){
  const changed=copy(s.model);if(mode==='revision')changed.revision='later';
  if(mode==='scenario'){changed.escenarios[0].activo=false;changed.escenarios.push({...copy(changed.escenarios[0]),id:'other-scenario',activo:true,esBase:false});changed.activo='other-scenario';changed.estados['other-scenario']=copy(changed.estados[fixture.activo]);}
  const restored=new Store({id:ID,get:async()=>{if(mode==='read-failed')throw Error('offline');return changed;}});
  restored.restore(s.cache);assert.deepEqual(restored.readyReceipts(),[]);await restored.refresh();
  assert.deepEqual(restored.readyReceipts(),mode==='read-failed'?[]:s.cache.receipts);
  assert.equal(restored.receipts.length,1,'candidate delivery alone never removes the receipt');
 }
});
test('eight validated old ACKs drain by exact ack after a newer read, without replaying a write',async()=>{
 let model=copy(fixture),cache,writes=0;
 const store=new Store({id:ID,get:async()=>copy(model),post:async p=>{writes++;Object.assign(model.escenarios.find(e=>e.id===model.activo).inputs,p.inputs);model.revision='historical-r'+writes;return copy(model);},changed:s=>{cache=copy(s.snapshot());}});
 store.load(model);
 for(let i=0;i<MAX_AGENT_RECEIPTS;i++)assert.equal(await bridge.apply(store,{...proposal(),request_id:'board-historical-'+i,revision:model.revision}),true);
 assert.equal(writes,8);assert.equal(store.receipts.length,8);model.revision='later-book-revision';
 const restored=new Store({id:ID,get:async()=>copy(model),post:async()=>{throw Error('no replay');}});restored.restore(cache);await restored.refresh();
 const candidates=restored.readyReceipts();assert.equal(candidates.length,8);assert.equal(candidates[0].revision,'historical-r1');
 for(const r of candidates.slice(0,7))assert.equal(restored.acknowledgeReceipt(r),true);
 assert.equal(restored.receipts.length,1,'a server-rejected pending receipt is retained');
 assert.equal(restored.receipts[0].request_id,'board-historical-7');assert.equal(restored.canRecordReceipt('board-next'),true);
 assert.equal(restored.acknowledgeReceipt(candidates[7]),true);assert.equal(restored.receipts.length,0);assert.equal(writes,8);
});
test('bounded outbox blocks another autonomous write before a job is created',async()=>{
 const s=setup();s.store.receipts=Array.from({length:MAX_AGENT_RECEIPTS},(_,i)=>receipt(i));const before=copy(s.store.receipts);
 await assert.rejects(()=>bridge.apply(s.store,proposal()),/recibos_pendientes/);
 assert.equal(s.writes,0);assert.equal(s.store.job,null);assert.deepEqual(s.store.receipts,before);
 assert.equal(s.store.acknowledgeReceipt(before[0]),true);
 assert.equal(await bridge.apply(s.store,proposal()),true);assert.equal(s.writes,1);assert.equal(s.store.receipts.length,MAX_AGENT_RECEIPTS);
});
test('malformed receipt cache is rejected and old caches without receipts remain compatible',()=>{
 assert.deepEqual(validateReceipts(undefined,ID),[]);
 for(const receipts of [[{...receipt(),inputs:{inTerrenoM2:644}}],[{...receipt(),case_id:'other'}],[receipt(),receipt()],[{...receipt(),acknowledged_at:'yesterday'}],Array.from({length:9},(_,i)=>receipt(i))])assert.throws(()=>validateReceipts(receipts,ID));
 assert.equal(saveCache({model:fixture,receipts:[receipt()]},{setItem(){throw Error('quota');}}),false);
});
test('bridge replays after verified hello, rejects foreign ack and removes only exact receipt',async()=>{
 const s=setup();await bridge.apply(s.store,proposal());const restored=new Store({id:ID,get:async()=>copy(s.model)});restored.restore(s.cache);
 const origin='https://ppp.test',sent=[],parent={postMessage:m=>sent.push(m)};let receive;
 const win={parent,location:{origin,href:origin+'/potenciales-yod/patrimonial.html?agent=1'},document:{referrer:origin+'/yod-portal/despacho3d/receipt'},addEventListener:(name,fn)=>{receive=fn;},removeEventListener(){}};
 const mounted=bridge.mount(restored,{win});
 const event=(extra={},patch={})=>({origin,source:parent,data:{version:1,nonce:'nonce-receipt',case_id:ID,...extra},...patch});
 await receive(event({type:'yod:ppp:hello'}));assert.equal(sent.filter(m=>m.receipt).length,0);
 await restored.refresh();mounted.publish();const replay=sent.find(m=>m.receipt)?.receipt;assert.equal(replay.request_id,proposal().request_id);assert.equal(replay.revision,'receipt-r2');
 assert.equal(sent.at(-2).board.confirmed,true);
 for(const change of [{nonce:'wrong'},{case_id:'foreign'},{revision:'wrong'},{request_id:'board-wrong'}])await receive(event({type:'yod:ppp:receipt-ack',request_id:replay.request_id,revision:replay.revision,...change}));
 await receive(event({type:'yod:ppp:receipt-ack',request_id:replay.request_id,revision:replay.revision},{source:{}}));
 assert.equal(restored.receipts.length,1);
 await receive(event({type:'yod:ppp:receipt-ack',request_id:replay.request_id,revision:replay.revision}));assert.deepEqual(restored.receipts,[]);mounted.dispose();
});
