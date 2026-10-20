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
 assert.equal(x.sent.at(-1).status,'confirmed');assert.equal(x.sent.at(-1).observed.scenario_id,'newer');assert.deepEqual(x.bridge.snapshot(),financial);
 assert.equal(financial.scenario_id,'older');assert.equal(financial.version_context.viewed_scenario_id,'newer');assert.equal(financial.inputs.inArea,10);assert.equal(financial.version_context.read_only,true);
 x.bridge.publish();assert.equal(x.sent.at(-1).navigation_context.scenario_id,'newer');assert.equal(x.sent.at(-1).board.scenario_id,'older');
 const unverified=setup({scenario_id:'older'});assert.equal(unverified.bridge.getVerifiedContext(),null,'a saved-inputs-only model is not a native navigation context');
 for(const patch of [{pending:true},{error:true},{busy:true}]){const blocked=navigationSetup();Object.assign(blocked.view,patch);blocked.bridge.publish();assert.equal(blocked.sent.at(-1).navigation_context,null);}
});
