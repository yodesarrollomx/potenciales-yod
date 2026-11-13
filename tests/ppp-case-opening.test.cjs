'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create,isAuthenticationError}=require('../ppp-case-opening.js'),{create:loaderFactory}=require('../ppp-case-loader.js');
const response=id=>({ok:true,caso:{caso_id:id}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup(options={}){const states=[],applied=[],timers=[],reads=[];let credential='synthetic-session',authorizations=0,denials=0;
 const opening=create({loaderFactory,timeoutMs:20,getCredential:()=>credential,onState:s=>states.push(s),
  apply:v=>{applied.push(v.caso_id);return options.apply?options.apply(v):true;},onAuthorized:()=>authorizations++,onUnauthorized:()=>denials++,
  read:p=>{reads.push(p);return options.read?options.read(p):Promise.resolve(response(p.id));},
  schedule:(fn,ms)=>{timers.push({fn,ms,cancelled:false});return timers.length-1;},cancel:id=>{timers[id].cancelled=true;}});
 return {opening,states,applied,timers,reads,setCredential:v=>credential=v,get credential(){return credential;},get authorizations(){return authorizations;},get denials(){return denials;}};
}
test('exact opening reads only its case, without a catalog dependency',async()=>{const s=setup();assert.equal(await s.opening.openId('case-a'),true);assert.deepEqual(s.reads,[{recurso:'caso',id:'case-a'}]);assert.deepEqual(s.applied,['case-a']);assert.equal(s.states.at(-1).phase,'ready');assert.equal(s.authorizations,1);s.opening.dispose();});
test('transient backend rejection retries read-only and preserves current credential',async()=>{let attempts=0;const s=setup({read:p=>Promise.resolve(++attempts===1?{ok:false,error:'lock_busy'}:response(p.id))});assert.equal(await s.opening.openId('case-a'),false);assert.equal(s.states.at(-1).phase,'retrying');assert.equal(s.denials,0);assert.equal(s.credential,'synthetic-session');assert.equal(s.timers[0].ms,2000);s.timers[0].fn();await settle();assert.equal(s.states.at(-1).phase,'ready');assert.equal(s.reads.length,2);assert.ok(s.reads.every(p=>p.recurso==='caso'));s.opening.dispose();});
test('a timed-out read has bounded retries and never accepts its late result',async()=>{const releases=[];const s=setup({read:()=>new Promise(resolve=>releases.push(resolve))});await s.opening.openId('case-a');assert.equal(s.states.at(-1).phase,'retrying');releases[0](response('case-a'));await settle();assert.deepEqual(s.applied,[]);s.timers[0].fn();await new Promise(resolve=>setTimeout(resolve,30));assert.equal(s.timers[1].ms,5000);s.timers[1].fn();await new Promise(resolve=>setTimeout(resolve,30));assert.equal(s.states.at(-1).phase,'error');assert.equal(s.reads.length,3);assert.equal(s.denials,0);assert.equal(s.credential,'synthetic-session');s.opening.dispose();});
test('a newer selection ignores success and rejection belonging to an older read',async()=>{const pending={};const s=setup({read:p=>new Promise(resolve=>pending[p.id]=resolve)});const first=s.opening.openId('case-a'),second=s.opening.openId('case-b');pending['case-b'](response('case-b'));assert.equal(await second,true);pending['case-a']({ok:false,error:'revocado'});assert.equal(await first,false);assert.deepEqual(s.applied,['case-b']);assert.equal(s.denials,0);assert.equal(s.states.at(-1).case_id,'case-b');s.opening.dispose();});
test('changing the credential while reading cannot publish or restore private content',async()=>{let release;const s=setup({read:()=>new Promise(resolve=>release=resolve)});const pending=s.opening.openId('case-a');s.setCredential('new-session');release(response('case-a'));assert.equal(await pending,false);assert.deepEqual(s.applied,[]);assert.equal(s.authorizations,0);s.opening.dispose();});
test('wrong case, invalid native model and unavailable case remain local failures',async()=>{for(const value of [{ok:true,caso:{caso_id:'other'}},{ok:false,error:'no_existe'}]){const s=setup({read:async()=>value});await s.opening.openId('case-a');assert.equal(s.states.at(-1).phase,'error');assert.equal(s.denials,0);assert.deepEqual(s.applied,[]);assert.equal(s.timers.length,0);s.opening.dispose();}const s=setup({apply:()=>false});assert.equal(await s.opening.openId('case-a'),false);assert.equal(s.states.at(-1).error,'invalid_model');assert.equal(s.authorizations,0);s.opening.dispose();});
test('real authentication refusal withdraws this surface without retrying or changing credential',async()=>{const s=setup({read:async()=>({ok:false,error:'revocado'})});await s.opening.openId('case-a');assert.equal(s.states.at(-1).phase,'unauthorized');assert.equal(s.denials,1);assert.equal(s.timers.length,0);assert.equal(s.credential,'synthetic-session');assert.equal(isAuthenticationError('lock_busy'),false);s.opening.dispose();});
test('invalidating or disposing cancels local retries and late reads',async()=>{const s=setup({read:async()=>({ok:false,error:'lock_busy'})});await s.opening.openId('case-a');s.opening.invalidate();assert.equal(s.timers[0].cancelled,true);s.timers[0].fn();await settle();assert.equal(s.reads.length,1);s.opening.dispose();assert.equal(await s.opening.retry(),false);});

test('malformed identity and absent credential block before any read',async()=>{const s=setup();assert.equal(await s.opening.openId('unsafe/id'),false);assert.equal(s.states.at(-1).phase,'error');assert.equal(s.reads.length,0);s.setCredential(null);assert.equal(await s.opening.openId('case-a'),false);assert.equal(s.states.at(-1).phase,'unauthorized');assert.equal(s.denials,1);assert.equal(s.reads.length,0);s.opening.dispose();});

test('an explicit board denial stays distinct without retrying, applying or discarding the session',async()=>{
 const s=setup({read:async()=>({ok:false,error:'board'})});await s.opening.openId('case-a');
 assert.equal(s.states.at(-1).error,'board');assert.equal(s.states.at(-1).kind,'permission');
 assert.equal(s.timers.length,0);assert.equal(s.denials,0);assert.equal(s.authorizations,0);assert.deepEqual(s.applied,[]);assert.equal(s.credential,'synthetic-session');s.opening.dispose();
});
const validation={code:'cantidad_fuera_rango',field_id:'inCapRateMercado',scenario_id:'scenario-synthetic',reason:'below_min'};
test('a typed validation error is permanent, bounded and manually reconnects the same case after correction',async()=>{
 let corrected=false;const s=setup({read:async p=>corrected?response(p.id):{ok:false,error:'modelo_invalido',validation}});
 await s.opening.openId('case-a');assert.equal(s.states.at(-1).error,'modelo_invalido');assert.equal(s.states.at(-1).kind,'validation');assert.deepEqual(s.states.at(-1).validation,validation);
 assert.equal(s.timers.length,0);assert.deepEqual(s.applied,[]);assert.equal(s.denials,0);
 corrected=true;assert.equal(await s.opening.retry(),true);assert.deepEqual(s.reads,[{recurso:'caso',id:'case-a'},{recurso:'caso',id:'case-a'}]);assert.deepEqual(s.applied,['case-a']);s.opening.dispose();
});
test('validation diagnostics discard unknown keys, IDs, codes and mismatched reason pairs',async()=>{
 for(const bad of [{...validation,value:'PRIVATE'}, {...validation,field_id:'private/field'}, {...validation,scenario_id:'https://private.invalid/?token=PRIVATE'}, {...validation,code:'PRIVATE'}, {...validation,code:'cantidad_invalida',reason:'below_min'}, {...validation,reason:'PRIVATE'}]){
  const s=setup({read:async()=>({ok:false,error:'modelo_invalido',validation:bad,detail:'PRIVATE'})});await s.opening.openId('case-a');
  assert.equal(s.states.at(-1).error,'modelo_invalido');assert.equal(s.states.at(-1).validation,undefined);assert.doesNotMatch(JSON.stringify(s.states),/PRIVATE|private/);assert.equal(s.timers.length,0);s.opening.dispose();
 }
});
test('server, timeout and network errors retain separate safe categories',async()=>{
 for(const [failure,kind] of [[{ok:false,error:'servidor'},'server'],[Error('timeout'),'timeout'],[new TypeError('PRIVATE transport URL'),'network']]){
  const s=setup({read:async()=>{if(failure instanceof Error)throw failure;return failure;}});await s.opening.openId('case-a');
  assert.equal(s.states.at(-1).phase,'retrying');assert.equal(s.states.at(-1).kind,kind);assert.doesNotMatch(JSON.stringify(s.states),/PRIVATE/);assert.equal(s.denials,0);s.opening.dispose();
 }
 const s=setup({read:async()=>({ok:false,error:'PRIVATE backend stack'})});await s.opening.openId('case-a');assert.equal(s.states.at(-1).kind,'server');assert.doesNotMatch(JSON.stringify(s.states),/PRIVATE/);s.opening.dispose();
});
test('visible notices explain typed validation and keep ambiguous server failures honest',()=>{
 const {describe}=require('../ppp-case-opening.js');
 const shown=describe({phase:'error',error:'modelo_invalido',kind:'validation',validation},()=> 'Cap de mercado');
 assert.match(shown.message,/Cap de mercado/);assert.match(shown.message,/mínimo/);assert.match(shown.detail,/cantidad_fuera_rango/);assert.match(shown.detail,/scenario-synthetic/);
 assert.match(describe({phase:'error',error:'board',kind:'permission'}).message,/permiso/);
 const server=describe({phase:'error',error:'servidor',kind:'server'});assert.match(server.message,/servidor/i);assert.match(server.message,/causa/i);assert.doesNotMatch(server.message,/sin conexión/i);
});

test('all supported validation reasons remain bounded and never retry automatically',async()=>{
 for(const [code,reason] of [['cantidad_invalida','invalid_type'],...['missing_required','below_min','above_max','non_integer'].map(reason=>['cantidad_fuera_rango',reason])]){
  const diagnostic={...validation,code,reason,field_id:'unidad60_renta'},s=setup({read:async()=>({ok:false,error:'modelo_invalido',validation:diagnostic})});
  await s.opening.openId('case-a');assert.deepEqual(s.states.at(-1).validation,diagnostic);assert.equal(s.timers.length,0);s.opening.dispose();
 }
});
test('real Patrimonial transport keeps safe HTTP status and rejects malformed responses without exposing the body',async()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),html=fs.readFileSync(path.join(__dirname,'../patrimonial.html'),'utf8');
 const start=html.indexOf('async function apiGet(params)'),end=html.indexOf('\n  function apiPost(',start);assert.ok(start>=0&&end>start);
 let parseCalls=0;const options={URLSearchParams,AbortController,setTimeout,clearTimeout,Error,NUBE:{ENDPOINT:'https://synthetic.invalid/exec',TIPO:'PATRIMONIAL'},clave:'synthetic-session'};
 const reader=fetch=>vm.runInNewContext(html.slice(start,end)+';apiGet',{...options,fetch});
 const http=reader(async()=>({ok:false,status:503,json:()=>{parseCalls++;throw Error('PRIVATE');}}));
 await assert.rejects(()=>http({recurso:'caso',id:'case-a'}),error=>error.message==='http_error'&&error.httpStatus===503);assert.equal(parseCalls,0);
 const invalid=reader(async()=>({ok:true,status:200,json:()=>{throw Error('PRIVATE response body');}}));await assert.rejects(()=>invalid({recurso:'caso',id:'case-a'}),/invalid_response/);
 const s=setup({read:()=>http({recurso:'caso',id:'case-a'})});await s.opening.openId('case-a');assert.equal(s.states.at(-1).http_status,503);assert.equal(s.states.at(-1).kind,'server');assert.doesNotMatch(JSON.stringify(s.states),/PRIVATE|synthetic-session/);s.opening.dispose();
});
