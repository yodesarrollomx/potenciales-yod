'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdapter,selected}=require('../ppp40-bootstrap.js');
const endpoint='https://script.google.com/macros/s/synthetic-only/exec';
test('only seed routes select PPP4; legacy new/open retain their existing path',()=>{
  for(const q of ['?ppp4=1','?seed=seed-test','?ppp40_op=test'])assert.equal(selected('https://ppp.test/mixto.html'+q),true);
  for(const q of ['','?new=1','?open=case-test','?ppp4=0'])assert.equal(selected('https://ppp.test/mixto.html'+q),false);
});
test('transport uses existing endpoint, current auth and fixed route; no retry on failed POST',async()=>{
  const calls=[];const adapter=createAdapter({endpoint,getIdentity:()=> 'synthetic-key',fetchImpl:async(url,options)=>{calls.push({url,options});if(options.method==='POST')throw new Error('response_lost');return {ok:true,json:async()=>({ok:true})};}});
  await adapter.read({id:'seed-test',k:'forged',recurso:'other'});
  const url=new URL(calls[0].url);assert.equal(url.searchParams.get('k'),'synthetic-key');assert.equal(url.searchParams.get('recurso'),'ppp40-seed');assert.equal(url.searchParams.get('id'),'seed-test');
  await assert.rejects(adapter.save({request_id:'request-test',seed:{},k:'forged',tipo:'other'}),/response_lost/);
  assert.equal(calls.length,2);const body=JSON.parse(calls[1].options.body);assert.equal(body.k,'synthetic-key');assert.equal(body.tipo,'ppp40-seed');assert.equal(calls[1].options.credentials,'omit');
});
test('identity change discards an otherwise successful in-flight response',async()=>{
  let identity='synthetic-a',release;const wait=new Promise(resolve=>{release=resolve;});
  const adapter=createAdapter({endpoint,getIdentity:()=>identity,fetchImpl:async()=>{await wait;return {ok:true,json:async()=>({ok:true,persisted:true})};}});
  const pending=adapter.read({});identity='synthetic-b';release();await assert.rejects(pending,/session_changed/);
});
test('unauthenticated requests never reach transport and arbitrary endpoints are rejected',async()=>{
  let calls=0;const args={endpoint,getIdentity:()=>null,fetchImpl:async()=>{calls++;}};
  await assert.rejects(createAdapter(args).read({}),/session_required/);assert.equal(calls,0);
  for(const endpoint of ['http://script.google.com/macros/s/test/exec','https://example.com/exec','https://script.google.com/macros/s/test/dev','https://script.google.com/macros/s/test/exec?alternate=1'])assert.throws(()=>createAdapter({...args,endpoint}));
});
test('HTTP and HTML errors cannot become successful seed reads',async()=>{
  for(const response of [{ok:false},{ok:true,json:async()=>{throw new SyntaxError('HTML');}}]){
    const adapter=createAdapter({endpoint,getIdentity:()=> 'synthetic-key',fetchImpl:async()=>response});await assert.rejects(adapter.read({}));
  }
});
