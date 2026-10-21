const test=require('node:test'),assert=require('node:assert/strict');
const {create,latestRegistered}=require('../ppp-version-bridge.js');
const list=[{id:'older',nombre:'Anterior',inputs:{inArea:10}},{id:'newer',nombre:'Última inscrita',inputs:{inArea:20}}];
test('native ninth through hundredth versions preserve history and remain observable',()=>{
 const {versions}=require('../ppp-version-bridge.js');
 for(const count of [9,100]){const v=Array.from({length:count},(_,i)=>({id:'v'+i,nombre:'Version '+i,inputs:{inArea:i}}));assert.equal(versions(v).length,count);assert.equal(latestRegistered(v),'v'+(count-1));}
 assert.throws(()=>versions(Array.from({length:101},(_,i)=>({id:'v'+i,nombre:'Version '+i,inputs:{inArea:i}}))));
});
function setup(initial={}){let listener;const sent=[],parent={postMessage:m=>sent.push(m)},win={parent,location:{href:'https://example.test/potenciales-yod/macrolotes.html?agent=1',origin:'https://example.test'},document:{referrer:'https://example.test/yod-portal/despacho3d/index.html'},addEventListener:(n,f)=>listener=f,removeEventListener(){}};
 const view={caseId:'board-a',scenarios:structuredClone(list),active:'older'},bridge=create({modelType:'macrolotes',read:()=>view,win});
 bridge.remember({caseId:'board-a',revision:'rev1',scenarios:list,active:'older'});
 const send=m=>listener({source:parent,origin:win.location.origin,data:{version:1,case_id:'case-a',board_case_id:'board-a',nonce:'session-a',...m}});
 send({type:'yod:ppp:hello',...initial});return {bridge,view,send,sent,win,receive:event=>listener(event)};}
test('latest registered is array order, not active or a date invented from the name',()=>{assert.equal(latestRegistered(list),'newer');assert.throws(()=>latestRegistered([...list,list[0]]));});
test('viewing another version preserves defended version and all originals',()=>{const {bridge,view}=setup();let s=bridge.snapshot();assert.equal(s.scenario_id,'newer');assert.equal(s.version_context.viewed_scenario_id,'older');assert.equal(s.inputs.inArea,20);assert.equal(s.pending,false);view.active='newer';assert.equal(bridge.snapshot().scenario_id,'newer');assert.equal(bridge.snapshot().version_context.viewed_scenario_id,'newer');assert.deepEqual(view.scenarios,list);});
test('unsaved edits are pending and never become canonical values or local calculated results',()=>{const {bridge,view}=setup();view.scenarios[1].inputs.inArea=900;let s=bridge.snapshot();assert.equal(s.pending,true);assert.equal(s.inputs.inArea,20);assert.deepEqual(s.results,{});assert.ok(s.fields.every(f=>!f.editable));});
test('read-only model refuses every apply without a business write',()=>{const {send,sent}=setup();send({type:'yod:ppp:apply',proposal:{request_id:'request-1'}});assert.equal(sent.at(-1).receipt.error,'read_only_model');});
test('late case data, wrong mapping, foreign parent and changed handshake cannot switch authority',()=>{const x=setup();const count=x.sent.length;x.send({type:'yod:ppp:hello',case_id:'case-b',nonce:'session-b'});assert.equal(x.sent.length,count);x.view.caseId='board-b';assert.equal(x.bridge.snapshot(),null);x.bridge.dispose();x.send({type:'yod:ppp:read'});assert.equal(x.sent.length,count);});
test('refresh/new registration cannot silently change pinned defended version',()=>{const x=setup();const next=[...list,{id:'last',nombre:'Nueva',inputs:{inArea:40}}];x.view.scenarios=next;x.bridge.remember({caseId:'board-a',revision:'rev2',scenarios:next,active:'older'});assert.equal(x.bridge.snapshot().scenario_id,'newer');x.bridge.invalidate();assert.equal(x.bridge.snapshot().confirmed,false);});

test('same handshake cannot repin the defended version',()=>{const x=setup();const count=x.sent.length;x.send({type:'yod:ppp:hello',scenario_id:'older'});assert.equal(x.sent.length,count);assert.equal(x.bridge.snapshot().scenario_id,'newer');x.send({type:'yod:ppp:hello',scenario_id:'newer'});assert.ok(x.sent.length>count);assert.equal(x.bridge.snapshot().scenario_id,'newer');});
test('explicit initial pin survives retries and attempts to replace it',()=>{const x=setup({scenario_id:'older'});assert.equal(x.bridge.snapshot().scenario_id,'older');x.send({type:'yod:ppp:hello',scenario_id:'newer'});assert.equal(x.bridge.snapshot().scenario_id,'older');x.send({type:'yod:ppp:hello',scenario_id:'older'});assert.equal(x.bridge.snapshot().scenario_id,'older');});

test('heterogeneous versions share known fields without fabricating defended quantities and draft stays unconfirmed',()=>{
 const x=setup(),next=[{id:'older',nombre:'Anterior',inputs:{inArea:10,inExtra:3}},{id:'newer',nombre:'Última',inputs:{inArea:20}}];
 x.view.scenarios=structuredClone(next);x.bridge.remember({caseId:'board-a',revision:'rev2',scenarios:next,active:'older'});
 let s=x.bridge.snapshot();assert.equal(s.scenario_id,'newer');assert.equal(s.inputs.inArea,20);assert.equal(s.inputs.inExtra,null);assert.equal(s.version_context.viewed_inputs.inExtra,3);assert.ok(s.fields.some(f=>f.id==='inExtra'&&!f.editable));
 x.view.pending=true;x.view.draftInputs={inArea:12,inExtra:4,inOutside:999};s=x.bridge.snapshot();assert.equal(s.pending,true);assert.equal(s.inputs.inArea,20);assert.equal(s.version_context.viewed_inputs.inArea,12);assert.equal(Object.hasOwn(s.version_context.viewed_inputs,'inOutside'),false);assert.deepEqual(s.results,{});
});

function navigationSetup(){
 const x=setup({scenario_id:'older',agent_case_id:'logical-agent',presentation:{volume_draft:true}});let calls=0,section=null;
 x.bridge.remember({caseId:'board-a',revision:'rev1',scenarios:list,active:'older',native:true});
 x.win.PPPView={navigate:target=>{calls++;section=target;},navigationState:target=>section===target?{status:'confirmed',section_id:target}:{status:'unavailable',code:'view_changed'}};
 x.navigate=(patch={})=>x.send({type:'yod:ppp:navigate',request_id:'navigate-1',scenario_id:'older',revision:'rev1',target:'dArq',...patch});
 x.calls=()=>calls;x.changeView=target=>{section=target;};return x;
}
test('navigation confirms the actual section in the exact bound case and keeps every quantity intact',()=>{
 const x=navigationSetup(),before=JSON.stringify(x.view);x.navigate();const receipt=x.sent.at(-1);
 assert.equal(receipt.type,'yod:ppp:navigation');assert.equal(receipt.status,'confirmed');assert.equal(receipt.request_id,'navigate-1');
 assert.deepEqual(receipt.observed,{case_id:'logical-agent',board_case_id:'board-a',scenario_id:'older',revision:'rev1',tab:'ppp',target:'dArq',section_id:'dArq'});
 assert.equal(JSON.stringify(x.view),before);assert.equal(x.calls(),1);assert.equal(x.bridge.snapshot().fields.every(f=>!f.editable),true);
 assert.equal(x.bridge.getVerifiedContext().volume_draft,true);assert.deepEqual(x.sent.find(m=>m.type==='yod:ppp:state').capabilities,{navigate:true});
});
test('navigation retries reconcile without replay and a reused request cannot change its intent',()=>{
 const x=navigationSetup();x.navigate();x.navigate();assert.equal(x.calls(),1);assert.equal(x.sent.at(-1).status,'confirmed');
 x.changeView('dVentas');x.navigate();assert.equal(x.calls(),1);assert.equal(x.sent.at(-1).status,'unavailable');
 x.navigate({target:'dVentas'});assert.equal(x.calls(),1);assert.equal(x.sent.at(-1).code,'request_id_reused');
 const recovering=navigationSetup();recovering.view.pending=true;recovering.navigate();assert.equal(recovering.calls(),0);recovering.view.pending=false;recovering.navigate();assert.equal(recovering.calls(),1);assert.equal(recovering.sent.at(-1).status,'confirmed');
});
test('navigation rejects stale revisions, another scenario, unsupported targets and pending reads without executing',()=>{
 for(const patch of [{revision:'older-revision'},{scenario_id:'newer'},{board_case_id:'other-board'},{target:'https://foreign.test/'},{target:'arbitrary-panel'}]){
  const x=navigationSetup();x.navigate(patch);assert.notEqual(x.sent.at(-1).status,'confirmed');assert.equal(x.calls(),0);
 }
 for(const patch of [{pending:true},{busy:true},{error:true},{caseId:'other-board'}]){
  const x=navigationSetup();Object.assign(x.view,patch);x.navigate();assert.equal(x.sent.at(-1).status,'unavailable');assert.equal(x.calls(),0);
 }
 const x=navigationSetup();x.bridge.invalidate();x.navigate();assert.equal(x.sent.at(-1).code,'reading_unconfirmed');assert.equal(x.calls(),0);
});
test('navigation never blurs an editable element and ignores foreign frames or changed handshakes',()=>{
 for(const activeElement of [{matches:()=>true},{isContentEditable:true},{closest:()=>({})}]){
  const x=navigationSetup();x.win.document.activeElement=activeElement;x.navigate();assert.equal(x.sent.at(-1).code,'editing_in_progress');assert.equal(x.calls(),0);assert.equal(x.win.document.activeElement,activeElement);
 }
 const x=navigationSetup(),before=x.sent.length;
 for(const event of [{source:{},origin:x.win.location.origin},{source:x.win.parent,origin:'https://foreign.test'}])x.receive({...event,data:{type:'yod:ppp:navigate',version:1,case_id:'case-a',board_case_id:'board-a',nonce:'session-a',request_id:'navigation-foreign',target:'dArq',scenario_id:'older',revision:'rev1'}});
 x.navigate({nonce:'other-nonce'});x.navigate({case_id:'other-case'});assert.equal(x.sent.length,before);assert.equal(x.calls(),0);
 x.bridge.dispose();x.navigate();assert.equal(x.sent.length,before);
});
test('navigation requires a real UI readback and does not reinterpret an application as navigation',()=>{
 const x=navigationSetup();x.win.PPPView.navigationState=()=>({status:'unsupported',code:'volumes_not_installed'});x.navigate({target:'dVolumenes'});assert.equal(x.sent.at(-1).status,'unsupported');
 const y=navigationSetup();delete y.win.PPPView;y.navigate();assert.equal(y.sent.at(-1).code,'navigation_not_installed');assert.equal(y.calls(),0);
 y.send({type:'yod:ppp:apply',proposal:{request_id:'original-write'}});assert.equal(y.sent.at(-1).receipt.error,'read_only_model');
});
test('native visible-version navigation never repins the financial defended version',()=>{
 const x=navigationSetup();x.view.active='newer';const financial=x.bridge.snapshot();x.navigate({scenario_id:'newer'});
 assert.equal(x.sent.at(-1).status,'confirmed');assert.equal(x.sent.at(-1).observed.scenario_id,'newer');assert.deepEqual({...x.bridge.snapshot(),observed_at:financial.observed_at},financial);
 assert.equal(financial.scenario_id,'older');assert.equal(financial.version_context.viewed_scenario_id,'newer');assert.equal(financial.inputs.inArea,10);assert.equal(financial.version_context.read_only,true);
 x.bridge.publish();assert.equal(x.sent.at(-1).navigation_context.scenario_id,'newer');assert.equal(x.sent.at(-1).board.scenario_id,'older');
 const unverified=setup({scenario_id:'older'});assert.equal(unverified.bridge.getVerifiedContext(),null,'a saved-inputs-only model is not a native navigation context');
 for(const patch of [{pending:true},{error:true},{busy:true}]){const blocked=navigationSetup();Object.assign(blocked.view,patch);blocked.bridge.publish();assert.equal(blocked.sent.at(-1).navigation_context,null);}
});

const nativeVolumes=require('../ppp-volumes-native.js');
function nativeVolumeSetup(apply){
 let listener;const sent=[],writes=[],parent={postMessage:m=>sent.push(m)},win={parent,location:{href:'https://example.test/potenciales-yod/mixto.html?agent=1',origin:'https://example.test'},document:{referrer:'https://example.test/yod-portal/despacho3d/index.html'},addEventListener:(n,f)=>listener=f,removeEventListener(){}};
 const cap={schema:2,read:true,write:true,max_volumes:16,fields:nativeVolumes.fields,allocation_modes:['preserve','built_area'],shared_resources:[]},original={schema:2,count:1,shared_allocation_mode:'preserve',volumes:[{id:'body-a',values:Object.fromEntries(nativeVolumes.fields.map(f=>[f.id,f.id==='name'?'A':null]))}]},view={caseId:'board-a',scenarios:structuredClone(list),active:'older'},canonical={older:original,newer:structuredClone(original)};
 let bridge;const remember=(revision='rev1')=>bridge.remember({caseId:'board-a',revision,scenarios:list,active:'older',native:true,volumesByScenario:canonical,volumeCapability:cap});
 bridge=create({modelType:'vertical',read:()=>view,win,volumeContract:nativeVolumes,applyVolumes:async request=>{writes.push(structuredClone(request));if(apply)return apply({request,remember,canonical,view,bridge});const full={...request.volumes,volumes:request.volumes.volumes.map(row=>({id:row.id,values:{...original.volumes[0].values,...row.values,units:77}}))};canonical.older=full;remember('rev2');return{ok:true,request_id:request.request_id,case_id:'board-a',scenario_id:'older',base_revision:'rev1',revision:'rev2',native_collection:full,calculated:true};}});
 remember();const send=data=>listener({source:parent,origin:win.location.origin,data:{version:1,case_id:'board-a',board_case_id:'board-a',nonce:'native-session',...data}});send({type:'yod:ppp:hello',agent_case_id:'agent-a',scenario_id:'older'});
 const proposal={kind:'native_volumes',request_id:'native-request',case_id:'agent-a',board_case_id:'board-a',scenario_id:'older',revision:'rev1',before_volumes:structuredClone(original),volumes:nativeVolumes.project(original),user_confirmed:true,apply_requested_at:new Date().toISOString(),apply_expires_at:new Date(Date.now()+120000).toISOString()};proposal.volumes.volumes[0].values.residential_levels=17;
 return{bridge,view,sent,writes,canonical,proposal,send,apply:async patch=>{send({type:'yod:ppp:apply',proposal:{...structuredClone(proposal),...patch}});await new Promise(resolve=>setImmediate(resolve));}};
}
test('native volumes expose canonical readback without unlocking financial fields and require explicit confirmed intent',async()=>{
 const x=nativeVolumeSetup(),before=structuredClone(x.bridge.snapshot());assert.equal(before.volumes.schema,2);assert.equal(before.capabilities.volumes.write,true);assert.equal(before.version_context.read_only,true);assert.ok(before.fields.every(f=>!f.editable));
 await x.apply();assert.equal(x.writes.length,1);assert.equal(x.writes[0].context.case_id,'board-a');assert.equal(Object.keys(x.writes[0].volumes.volumes[0].values).length,14);assert.equal(x.writes[0].volumes.volumes[0].values.units,undefined);
 const receipt=x.sent.findLast(m=>m.receipt)?.receipt;assert.equal(receipt.ok,true);assert.equal(receipt.case_id,'agent-a');assert.equal(receipt.base_revision,'rev1');assert.equal(receipt.revision,'rev2');assert.equal(receipt.native_collection.volumes[0].values.units,77);assert.deepEqual(x.bridge.snapshot().inputs,before.inputs);
 await x.apply();assert.equal(x.writes.length,1,'a lost parent receipt is replayed without another transport mutation');assert.equal(x.sent.at(-1).receipt.ok,true);
});
test('unconfirmed, expired, wrong-case and derived-cell volume proposals never reach transport',async()=>{
 const patches=[{user_confirmed:false},{apply_requested_at:undefined},{apply_expires_at:new Date(Date.now()-1).toISOString()},{case_id:'other-agent'},{board_case_id:'other-board'},{scenario_id:'newer'},{revision:'stale'},{before_volumes:null}];
 for(const patch of patches){const x=nativeVolumeSetup();await x.apply(patch);assert.equal(x.writes.length,0);assert.equal(x.sent.at(-1).receipt.ok,false);}
 const x=nativeVolumeSetup();await x.apply({volumes:x.proposal.before_volumes});assert.equal(x.writes.length,0,'all21 including derived outputs cannot be used as a14driver wire proposal');
});
test('native volume bridge requires the host canonical model to contain the acknowledged revision and collection',async()=>{
 const x=nativeVolumeSetup(({request})=>({ok:true,request_id:request.request_id,case_id:'board-a',scenario_id:'older',revision:'invented-revision',native_collection:{...request.volumes,volumes:request.volumes.volumes.map(row=>({id:row.id,values:{...x.proposal.before_volumes.volumes[0].values,...row.values}}))},calculated:true}));
 await x.apply();assert.equal(x.sent.at(-1).receipt.ok,false);assert.equal(x.bridge.snapshot().revision,'rev1');
});
test('native volume proposals respect pending local drafts and keep scenario observation read only',async()=>{
 for(const patch of [{pending:true},{busy:true},{error:true},{active:'newer'}]){const x=nativeVolumeSetup();Object.assign(x.view,patch);assert.equal(x.bridge.snapshot().capabilities.volumes.write,false);await x.apply();assert.equal(x.writes.length,0);}
});

test('a replayed confirmed receipt names a newer canonical revision separately and never restores old quantities',async()=>{
 const x=nativeVolumeSetup();await x.apply();const newer=structuredClone(x.canonical.older);newer.volumes[0].values.residential_levels=25;x.canonical.older=newer;
 x.bridge.remember({caseId:'board-a',revision:'rev3',scenarios:list,active:'older',native:true,volumesByScenario:x.canonical,volumeCapability:{schema:2,read:true,write:true,max_volumes:16,fields:nativeVolumes.fields,allocation_modes:['preserve','built_area'],shared_resources:[]}});
 await x.apply();assert.equal(x.writes.length,1);const receipt=x.sent.at(-1).receipt;assert.equal(receipt.status,'confirmed_superseded');assert.equal(receipt.revision,'rev2');assert.equal(receipt.native_collection.volumes[0].values.residential_levels,17);assert.equal(receipt.current_revision,'rev3');assert.equal(receipt.current_collection.volumes[0].values.residential_levels,25);assert.equal(x.bridge.snapshot().volumes.volumes[0].values.residential_levels,25);
});
test('explicit receipt lookup after reload ignores expired approval and current write capability but stays read only',async()=>{
 const x=nativeVolumeSetup(({request,remember,canonical})=>{assert.equal(request.reconcile,true);const full={...request.volumes,volumes:request.volumes.volumes.map(row=>({id:row.id,values:{...x.proposal.before_volumes.volumes[0].values,...row.values}}))};canonical.older=full;remember('rev2');return{ok:true,request_id:request.request_id,case_id:'board-a',scenario_id:'older',revision:'rev2',native_collection:full,calculated:false};});
 x.bridge.remember({caseId:'board-a',revision:'rev1',scenarios:list,active:'older',native:true,volumesByScenario:x.canonical,volumeCapability:{schema:2,read:true,write:false,max_volumes:16,fields:nativeVolumes.fields,allocation_modes:['preserve','built_area'],shared_resources:[]}});x.view.pending=true;
 x.send({type:'yod:ppp:volumes-receipt',proposal:{...x.proposal,user_confirmed:false,apply_expires_at:new Date(Date.now()-120000).toISOString(),reconcile_only:true}});await new Promise(resolve=>setImmediate(resolve));assert.equal(x.writes.length,1);assert.equal(x.writes[0].reconcile,true);assert.equal(x.sent.at(-1).receipt.ok,true);
});
test('the bridge relays and replays a normalized prewrite rejection without claiming application or changing the model',async()=>{const x=nativeVolumeSetup(({request})=>({ok:false,status:'rejected',error:'operation_rejected',request_id:request.request_id,case_id:'board-a',board_case_id:'board-a',scenario_id:'older',base_revision:'rev1',prewrite_rejection:{request_id:request.request_id,caso_id:'board-a',escenario_id:'older',base_revision:'rev1',stage:'prewrite',write_attempted:false}}));await x.apply();const receipt=x.sent.at(-1).receipt;assert.equal(receipt.case_id,'agent-a');assert.equal(receipt.board_case_id,'board-a');assert.equal(receipt.status,'rejected');assert.equal(receipt.ok,false);assert.equal(receipt.revision,undefined);assert.equal(x.bridge.snapshot().revision,'rev1');await x.apply();assert.equal(x.writes.length,1);assert.equal(x.sent.at(-1).receipt.status,'rejected');});
