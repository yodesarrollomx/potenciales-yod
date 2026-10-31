'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const p=require('../ppp-presentation.js');
const context=(type='vertical')=>({board_case_id:'synthetic-ppp',viewed_scenario_id:'viewed',ppp_revision:'ppp-r12',model_type:type,confirmed:true,pending:false,busy:false});
const job=(request,phase='queued')=>({ok:true,request_id:request.request_id,job_id:'job-1',phase,source:{case_id:'different-expediente',ppp_id:request.source.board_case_id,viewed_scenario_id:request.source.viewed_scenario_id,ppp_revision:request.source.ppp_revision,source_revision:'expediente-r3',snapshot_hash:'a'.repeat(64)}});
test('every motor sends the exact viewed reference with no financial values',async()=>{
 for(const type of p.TYPES){let sent;const current={...context(type),defended_scenario_id:'defended',results:{profit:900},inputs:{area:55}};
  const api=p.controller({read:()=>current,getIdentity:()=> 'actor',requestId:()=> 'request-1',transport:{create:async value=>{sent=value;return job(value);}}});assert.equal(await api.create(),true);assert.deepEqual(sent,{request_id:'request-1',source:p.sourceOf(current)});assert.equal(api.state().jobs[0].source.case_id,'different-expediente');
 }
});
test('pending model quantities are not pending saves: a confirmed capture can request its diagnostic',async()=>{
 let calls=0;const current={...context(),model_status:'MODELO_PENDIENTE',calculated:false};const api=p.controller({read:()=>current,getIdentity:()=> 'actor',requestId:()=> 'request-1',transport:{create:async value=>{calls++;return job(value);}}});assert.equal(await api.create(),true);assert.equal(calls,1);
 for(const patch of [{pending:true},{busy:true},{confirmed:false}]){Object.assign(current,{pending:false,busy:false,confirmed:true},patch);assert.equal(await api.create(),false);}assert.equal(calls,1);
});
test('legacy capture compares saved versions and live quantities without computing or activating another scenario',()=>{
 const scenarios=[{id:'viewed',nombre:'Visible',inputs:{inArea:10}},{id:'defended',nombre:'Defendida',inputs:{inArea:20}}],saved=p.rememberLegacy({caseId:'synthetic-ppp',revision:7,scenarios});
 const options={caseId:'synthetic-ppp',revision:7,scenarios,active:'viewed',inputs:{inArea:10},modelType:'macrolotes'};const c=p.legacyContext(saved,options);assert.equal(c.ppp_revision,'7');assert.equal(c.viewed_scenario_id,'viewed');assert.equal(c.pending,false);assert.equal(p.legacyContext(saved,{...options,inputs:{inArea:11}}).pending,true);assert.equal(p.legacyContext(saved,{...options,caseId:'another'}),null);assert.equal(p.legacyContext(null,options),null);
});
test('double click, lost ACK, reload and exact status recovery keep one request',async()=>{
 const memory=new Map(),storage=p.pendingStore({cryptoImpl:webcrypto,storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}});let calls=0;
 const options={read:()=>context(),getIdentity:()=> 'private-session',requestId:()=> 'request-original',storage,transport:{create:async()=>{calls++;throw Error('timeout');},status:async value=>job(value),list:async()=>({ok:true,jobs:[],presentations:[]})}};
 const first=p.controller(options);await Promise.all([first.create(),first.create()]);assert.equal(calls,1);assert.equal(memory.size,1);assert.doesNotMatch([...memory.keys()].join(),/private-session/);assert.doesNotMatch([...memory.values()].join(),/private-session/);
 const reloaded=p.controller({...options,requestId:()=> 'wrong-new-id'});assert.equal(await reloaded.create(),false);assert.equal(calls,1);assert.equal(await reloaded.reconcile(),true);assert.equal(reloaded.state().pending,null);assert.equal(memory.size,0);
});
test('another session or case cannot receive a late private result',async()=>{
 for(const field of ['actor','case']){let actor='actor-1',current=context(),finish;const api=p.controller({read:()=>current,getIdentity:()=>actor,requestId:()=> 'request-1',transport:{create:value=>new Promise(resolve=>{finish=()=>resolve(job(value));})}});const waiting=api.create();await Promise.resolve();if(field==='actor')actor='actor-2';else current={...current,board_case_id:'other'};finish();assert.equal(await waiting,false);assert.deepEqual(api.state().jobs,[]);}
});
test('manual retry requires exact missing-receipt proof and preserves the same payload',async()=>{
 const sent=[];let proof=null;const api=p.controller({read:()=>context(),getIdentity:()=> 'actor',requestId:()=> 'original-request',transport:{create:async value=>{sent.push(structuredClone(value));if(sent.length===1)throw Error('timeout');return job(value);},status:async()=>proof}});
 assert.equal(await api.create({presentation_id:'PRS-existing',base_presentation_version_id:'PV-existing'}),false);assert.equal(await api.retry(),false);assert.equal(sent.length,1);
 proof={ok:false,accepted:false,error:'request_not_found',request_id:'other',source:p.sourceOf(context()),retry_contract:'presentation-idempotent-v1'};assert.equal(await api.reconcile(),false);assert.equal(api.state().retryAllowed,false);
 proof.request_id='original-request';assert.equal(await api.reconcile(),true);assert.equal(api.state().retryAllowed,true);assert.equal(sent.length,1);assert.equal(await api.retry(),true);assert.deepEqual(sent[1],sent[0]);assert.equal(api.state().pending,null);
});
test('a pre-admission refusal cannot retire a different or unbound request',async()=>{
 for(const request_id of [undefined,'other']){const api=p.controller({read:()=>context(),getIdentity:()=> 'actor',requestId:()=> 'original-request',transport:{create:async()=>({ok:false,accepted:false,error:'service_unavailable',request_id})}});assert.equal(await api.create(),false);assert.equal(api.state().pending.request_id,'original-request');}
 const api=p.controller({read:()=>context(),getIdentity:()=> 'actor',requestId:()=> 'original-request',transport:{create:async value=>({ok:false,accepted:false,error:'service_unavailable',request_id:value.request_id})}});await api.create();assert.equal(api.state().pending,null);
});
test('receipt must match source, request and independent editorial version',()=>{
 const request={request_id:'request-1',source:p.sourceOf(context())};for(const mutate of [v=>v.request_id='foreign',v=>v.source.viewed_scenario_id='defended',v=>v.source.ppp_revision='expediente-r3',v=>v.source.ppp_id='other']){const value=job(request);mutate(value);assert.throws(()=>p.validateJob(value,request.source,request.request_id));}
 assert.throws(()=>p.validateJob(job(request,'ready_for_review'),request.source,request.request_id));const ready={...job(request,'ready_for_review'),presentation_id:'PRS-test',presentation_version_id:'PV-1'};assert.equal(p.validateJob(ready,request.source,request.request_id).presentation_version_id,'PV-1');
});
test('transport resolves mapping server-side, keeps credentials in memory and bounds uncertain writes',async()=>{
 let resolved,posted;const token='a'.repeat(24)+'.'+'b'.repeat(64),actor='portero-private';
 const transport=p.cloudTransport({getIdentity:()=>actor,resolve:async value=>{resolved=value;return {ok:true,board_case_id:value.board_case_id,case_id:'mapped-expediente',endpoint:'https://synthetic.onrender.com',token,expires_at:Date.now()+300000};},fetchImpl:async(url,options)=>{posted={url,options};return {ok:true,status:200,text:async()=>JSON.stringify(job(JSON.parse(options.body)))};}});
 const value=await transport.create({request_id:'request-1',source:p.sourceOf(context())});assert.equal(value.ok,true);assert.deepEqual(resolved,{board_case_id:'synthetic-ppp',model_type:'vertical'});assert.equal(posted.url,'https://synthetic.onrender.com/presentations/create');const body=JSON.parse(posted.options.body);assert.equal(body.case_id,'mapped-expediente');assert.equal(body.source.board_case_id,'synthetic-ppp');assert.equal(posted.options.headers.Authorization,'Bearer '+token);assert.doesNotMatch(posted.options.body,/portero-private/);
});
test('no mapping, invalid session and resolver timeout never become uncertain create writes',async()=>{
 for(const resolve of [async()=>({ok:false,error:'case_unavailable'}),async()=>({ok:true,board_case_id:'synthetic-ppp',case_id:'mapped'}),()=>new Promise(()=>{})]){let calls=0;const transport=p.cloudTransport({getIdentity:()=> 'actor',resolve,timeoutMs:5,fetchImpl:async()=>{calls++;throw Error('should not send');}});const value=await transport.create({request_id:'request-1',source:p.sourceOf(context())});assert.equal(value.ok,false);assert.equal(value.accepted,false);assert.equal(calls,0);}
});
test('timeout after submission remains uncertain and never retries automatically',async()=>{
 let calls=0;const transport=p.cloudTransport({getIdentity:()=> 'actor',resolve:async value=>({ok:true,board_case_id:value.board_case_id,case_id:'mapped',endpoint:'https://synthetic.onrender.com',token:'a'.repeat(24)+'.'+'b'.repeat(64),expires_at:Date.now()+300000}),timeoutMs:5,fetchImpl:()=>{calls++;return new Promise(()=>{});}});await assert.rejects(()=>transport.create({request_id:'request-1',source:p.sourceOf(context())}),/timeout/);assert.equal(calls,1);
});
