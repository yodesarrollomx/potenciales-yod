'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../ppp-volumes.js'),fields=require('../ppp-volumes-native.js').fields;
const copy=value=>JSON.parse(JSON.stringify(value));
const context=(patch={})=>({verified:true,ready:true,model_type:'vertical',native_capability:{schema:2,read:true,write:true,max_volumes:16,fields:copy(fields),allocation_modes:['preserve','built_area'],shared_resources:[]},native_collection:{schema:2,count:1,shared_allocation_mode:'preserve',volumes:[{id:'volume-1',values:Object.fromEntries(fields.map(f=>[f.id,f.id==='name'?'Synthetic new body':null]))}]},case_id:'synthetic-case',scenario_id:'scenario-a',revision:'r1',scenario_name:'Synthetic A',...patch});
function canonical(count=3){return{schema:2,count,shared_allocation_mode:'preserve',volumes:Array.from({length:count},(_,i)=>({id:'volume-'+(i+1),values:{...Object.fromEntries(fields.map(f=>[f.id,f.id==='name'?'Synthetic '+(i+1):null])),residential_levels:i+3,units_per_level:i+4,units:[12,20,30][i]??null,gross_area_m2:[1200,1900,2800][i]??null,construction_start_month:i*6,construction_duration_months:12}}))};}
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.parentNode=null;this.dataset={};this.attrs={};this.listeners={};this.hidden=false;this.value='';this._text='';this.classList={add(){}};}
 setAttribute(k,v){this.attrs[k]=String(v);}get textContent(){return this._text+this.children.map(n=>n.textContent).join(' ');}set textContent(v){this.children=[];this._text=String(v);}
 append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}removeEventListener(k,fn){this.listeners[k]=(this.listeners[k]||[]).filter(f=>f!==fn);}emit(k,e={}){for(const fn of this.listeners[k]||[])fn(e);}click(){if(!this.disabled)this.emit('click');}
 all(){return this.children.flatMap(n=>[n,...n.all()]);}
}
function mounted(initial=context(),save,options={}){
 let current=initial;const container=new Element('section'),win=new Element('window'),doc={createElement:tag=>new Element(tag)},states=[];
 const view=api.mount({container,getContext:()=>current,onSave:save||(async()=>{throw Error('synthetic uncertainty');}),onState:value=>states.push(copy(value)),uuid:()=> 'synthetic-request',doc,win,...options});
 const field=label=>container.all().find(n=>n.attrs['aria-label']===label),button=label=>container.all().find(n=>n.tag==='button'&&n.textContent===label);
 const h={container,view,win,states,getContext:()=>current,setContext:next=>current=next,field,button,edit(id,value,index=1){const n=field(fields.find(f=>f.id===id).label+' · volumen '+index);n.value=String(value);n.emit('change');}};
 view.setContext(current);return h;
}

test('new empty collections start with one independent blank body, while existing three are preserved',()=>{
 const draft=api.createDraft(context());assert.equal(draft.count,1);assert.equal(draft.volumes.length,1);assert.equal(draft.edit_revision,0);
 for(const id of api.FIELD_IDS.filter(id=>id!=='name'))assert.equal(draft.volumes[0].values[id],null);
 const native=canonical(),memory=api.createMemoryDrafts(),loaded=memory.read(context({native_collection:native}));assert.deepEqual(api.collectionOf(loaded),native);assert.equal(loaded.count,3);
});

test('all 21 exact native fields are required and the seven formula outputs cannot become writable',()=>{
 assert.equal(api.validateFields(fields).length,21);assert.equal(api.DERIVED_IDS.length,7);
 for(const bad of [fields.slice(1),[...fields,fields[0]],fields.map(f=>f.id==='units'?{...f,writable:true,derived:false}:f),fields.map(f=>f.id==='footprint_m2'?{...f,id:'price'}:f)])assert.throws(()=>api.validateFields(bad));
 const draft=api.createDraft(context());for(const id of api.DERIVED_IDS)assert.throws(()=>api.updateVolume(draft,'volume-1',{[id]:1}),/readonly/);
});

test('one, two, three and sixteen bodies retain distinct drivers without cloning or financial computation',()=>{
 const original=api.createDraft(context());let draft=api.resizeDraft(original,3);
 for(const[i,levels]of [3,9,5].entries())draft=api.updateVolume(draft,'volume-'+(i+1),{residential_levels:levels,units_per_level:i*7,footprint_m2:800+i*100,construction_start_month:i*8});
 const rows=copy(draft.volumes);draft=api.resizeDraft(draft,1);assert.equal(api.summarize(draft).inactive,2);draft=api.resizeDraft(draft,3);assert.deepEqual(draft.volumes,rows);
 draft=api.resizeDraft(draft,16);assert.equal(draft.volumes.length,16);assert.equal(new Set(draft.volumes.map(v=>v.id)).size,16);assert.equal(draft.volumes[15].values.residential_levels,null);assert.equal(draft.volumes[15].values.units,null);
 assert.equal(api.summarize(draft).units.value,null);assert.equal(Object.hasOwn(api.summarize(draft),'profit'),false);assert.deepEqual(original,api.createDraft(context()));
});

test('only declared native derived values are summarized and missing quantities remain missing',()=>{
 const source=canonical();source.volumes[0].values.units=0;source.volumes[2].values.units=null;const draft=api.createMemoryDrafts().read(context({native_collection:source}));
 assert.deepEqual(api.summarize(draft).units,{value:null,captured:20,filled:2,expected:3,complete:false});assert.deepEqual(api.summarize(draft).levels.map(v=>v.value),[3,4,5]);
 const edited=api.updateVolume(draft,'volume-1',{units_per_level:99});assert.equal(edited.volumes[0].values.units,0,'editing a driver never computes a native output');
});

test('invalid quantities, counts, formula text and foreign identities cannot contaminate a proposal',()=>{
 const draft=api.createDraft(context());for(const count of [0,17,-1,1.5,'2',null])assert.throws(()=>api.resizeDraft(draft,count));
 for(const[field,value]of [['residential_levels',0],['residential_levels',1.5],['units_per_level',-1],['footprint_m2',NaN],['footprint_m2',Infinity],['construction_start_month',-1],['construction_duration_months',0],['units_per_level','17'],['price',58000],['name','=IMPORTXML("https://synthetic.invalid")']])assert.throws(()=>api.updateVolume(draft,'volume-1',{[field]:value}));
 assert.throws(()=>api.updateVolume(draft,'missing',{units_per_level:1}));assert.deepEqual(draft,api.createDraft(context()));
});

test('memory isolates case, scenario and revision and returns detached copies',()=>{
 const memory=api.createMemoryDrafts(),a=context(),other=[context({case_id:'case-b'}),context({scenario_id:'scenario-b'}),context({revision:'r2'})];memory.write(a,api.updateVolume(memory.read(a),'volume-1',{units_per_level:17}));
 for(const ctx of other)assert.equal(memory.read(ctx).volumes[0].values.units_per_level,null);const copied=memory.read(a);copied.volumes[0].values.units_per_level=999;assert.equal(memory.read(a).volumes[0].values.units_per_level,17);
 memory.clear();assert.equal(memory.size,0);
});

test('only verified vertical native context can render controls, independently of case name',()=>{
 for(const patch of [{verified:false},{ready:false},{model_type:'macrolotes'},{case_id:''},{scenario_id:''},{revision:''}])assert.equal(api.validContext(context(patch)),false);
 const h=mounted(context({project_name:'Any verified project'}));assert.equal(h.container.hidden,false);assert.equal(h.button('3 volúmenes').disabled,false);h.view.dispose();
 const unavailable=mounted(context({native_capability:null}));assert.equal(unavailable.container.hidden,false);assert.match(unavailable.container.textContent,/Volúmenes sin conectar/);assert.equal(unavailable.field('Viviendas · volumen 1'),undefined);unavailable.view.dispose();
});

test('mounted drivers edit independently and derived controls remain read-only and explicitly stale',()=>{
 const h=mounted(context({native_collection:canonical()}));h.edit('units_per_level',17);h.edit('units_per_level',24,2);
 assert.equal(h.view.snapshot().volumes[0].values.units_per_level,17);assert.equal(h.view.snapshot().volumes[1].values.units_per_level,24);const derived=h.field('Viviendas · volumen 1');assert.equal(derived.readOnly,true);derived.value='999';derived.emit('change');assert.equal(h.view.snapshot().volumes[0].values.units,12);
 assert.match(h.container.textContent,/Último guardado en Sheets · pendiente de recalcular/);assert.equal(h.view.snapshotStatus().dirty,true);h.view.dispose();
});

test('revocation, stale callbacks and withdrawn input events wipe private drafts and visible values',()=>{
 for(const action of ['revoked','stale','input']){const h=mounted(),old=h.getContext();h.edit('units_per_level',17);const field=h.field('Viviendas por planta · promedio · volumen 1');h.setContext(action==='revoked'?context({verified:false}):context({scenario_id:'scenario-b'}));
  if(action==='input'){field.value='999';field.emit('change');}else h.view.setContext(action==='stale'?old:h.getContext());
  assert.equal(h.view.snapshot(),null);assert.equal(h.container.hidden,true);assert.equal(field.value,'');h.setContext(context());h.view.setContext(h.getContext());assert.equal(h.view.snapshot().volumes[0].values.units_per_level,null);h.view.dispose();}
});

test('suspension keeps exact private draft memory; session withdrawal or pagehide clears it',()=>{
 const h=mounted();h.edit('units_per_level',17);h.view.suspend();assert.equal(h.container.hidden,true);h.view.setContext(h.getContext());assert.equal(h.view.snapshot().volumes[0].values.units_per_level,17);
 h.win.emit('storage',{key:'unrelated'});assert.equal(h.view.snapshot().volumes[0].values.units_per_level,17);h.win.emit('storage',{key:'pyod_clave_v1'});h.view.setContext(h.getContext());assert.equal(h.view.snapshot().volumes[0].values.units_per_level,null);
 h.edit('units_per_level',23);h.win.emit('pagehide');h.view.setContext(h.getContext());assert.equal(h.view.snapshot().volumes[0].values.units_per_level,null);h.view.dispose();
});

test('a later revision requires explicit continuation and copies drivers over current native formula values',()=>{
 const h=mounted(context({native_collection:canonical()}));h.edit('units_per_level',17);const next=canonical();next.volumes[0].values.units=222;next.volumes[0].values.gross_area_m2=9999;h.setContext(context({revision:'r2',native_collection:next}));h.view.setContext(h.getContext());
 const review=h.button('Revisar y continuar la propuesta');assert.equal(review.parentNode.hidden,false);assert.equal(h.view.snapshot().volumes[0].values.units_per_level,4);assert.equal(h.view.snapshot().volumes[0].values.units,222);
 review.click();assert.equal(h.view.snapshot().volumes[0].values.units_per_level,17);assert.equal(h.view.snapshot().volumes[0].values.units,222);assert.equal(h.view.snapshot().volumes[0].values.gross_area_m2,9999);assert.equal(h.view.snapshot().continued_from_revision,'r1');assert.match(h.container.textContent,/Revisa y guarda en el PPP/);h.view.dispose();
});

test('continuation cannot cross scenarios or cases and may be explicitly dismissed',()=>{
 const h=mounted();h.edit('units_per_level',17);h.setContext(context({scenario_id:'scenario-b',revision:'r2'}));h.view.setContext(h.getContext());assert.equal(h.button('Revisar y continuar la propuesta').parentNode.hidden,true);
 h.setContext(context({revision:'r2'}));h.view.setContext(h.getContext());h.button('Empezar esta revisión en blanco').click();assert.equal(h.button('Revisar y continuar la propuesta').parentNode.hidden,true);assert.equal(h.view.snapshot().volumes[0].values.units_per_level,null);
 h.setContext(context({case_id:'case-b'}));h.view.setContext(h.getContext());h.setContext(context());h.view.setContext(h.getContext());assert.equal(h.view.snapshot().volumes[0].values.units_per_level,null);h.view.dispose();
});

test('a native save confirms only matching drivers, exact request identity and fresh canonical readback',async()=>{
 let h,received;h=mounted(context({native_collection:canonical()}),async request=>{received=copy(request);const next=copy(request.volumes);next.volumes[0].values.units=777;h.setContext(context({revision:'r2',native_collection:next}));h.view.suspend();h.view.setContext(h.getContext());return{ok:true,request_id:request.request_id,case_id:'synthetic-case',scenario_id:'scenario-a',revision:'r2',native_collection:next,calculated:true};});
 h.edit('units_per_level',17);assert.equal(await h.view.save(),true);assert.equal(received.volumes.volumes[0].values.units,12);assert.equal(h.view.snapshot().volumes[0].values.units,777);assert.equal(h.view.snapshotStatus().dirty,false);assert.equal(h.view.snapshotStatus().pending,false);assert.match(h.container.textContent,/Guardado en el PPP · recalculado en Sheets/);h.view.dispose();
});

test('uncertain saves freeze changes and reuse the same request, while malformed receipts never claim saved',async()=>{
 const calls=[];const h=mounted(context({native_collection:canonical()}),async request=>{calls.push(copy(request));throw Error('synthetic timeout');});h.edit('units_per_level',17);assert.equal(await h.view.save(),false);assert.equal(h.view.snapshotStatus().pending,true);h.edit('units_per_level',99);assert.equal(h.view.snapshot().volumes[0].values.units_per_level,17);assert.equal(await h.view.save(),false);assert.deepEqual(calls[0],calls[1]);assert.match(h.container.textContent,/Guardado por confirmar/);h.view.dispose();
 const bad=mounted(context({native_collection:canonical()}),async request=>({ok:true,request_id:request.request_id,case_id:'foreign-case',scenario_id:'scenario-a',revision:'r2',native_collection:request.volumes,calculated:true}));bad.edit('units_per_level',18);assert.equal(await bad.view.save(),false);assert.equal(bad.view.snapshotStatus().pending,true);assert.equal(bad.view.snapshotStatus().calculated,false);bad.view.dispose();
});

test('a late save ACK after revocation cannot restore a surface or private memory',async()=>{
 let resolve;const h=mounted(context({native_collection:canonical()}),()=>new Promise(r=>resolve=r));h.edit('units_per_level',17);const pending=h.view.save();h.view.revoke();resolve({ok:true});assert.equal(await pending,false);assert.equal(h.view.snapshot(),null);assert.equal(h.container.hidden,true);h.view.dispose();
});

test('a confirmed original receipt can retire uncertainty while showing a newer canonical revision',async()=>{
 let h;h=mounted(context({native_collection:canonical()}),async request=>{const original=copy(request.volumes),latest=copy(original);original.volumes[0].values.units=777;latest.volumes[0].values.units=888;latest.volumes[0].values.units_per_level=99;h.setContext(context({revision:'r3',native_collection:latest}));h.view.setContext(h.getContext());return{ok:true,status:'confirmed_superseded',request_id:request.request_id,case_id:'synthetic-case',scenario_id:'scenario-a',revision:'r2',native_collection:original,calculated:true,current_revision:'r3',current_collection:latest};});
 h.edit('units_per_level',17);assert.equal(await h.view.save(),true);assert.equal(h.view.snapshotStatus().pending,false);assert.equal(h.view.snapshotStatus().dirty,false);assert.equal(h.view.snapshotStatus().calculated,false);assert.equal(h.view.snapshot().volumes[0].values.units_per_level,99);assert.equal(h.view.snapshot().volumes[0].values.units,888);assert.match(h.container.textContent,/Guardado original confirmado · revisión posterior/);h.view.dispose();
});

test('typing enables save without blur and an invalid raw driver prevents a stale valid value from being saved',async()=>{
 const h=mounted(context({native_collection:canonical()}));const levels=h.field('Plantas residenciales · volumen 1'),units=h.field('Viviendas por planta · promedio · volumen 1');
 units.value='17';units.emit('input');assert.equal(h.button('Guardar en el PPP').disabled,false);levels.value='-1';levels.emit('input');assert.equal(h.button('Guardar en el PPP').disabled,true);assert.equal(await h.view.save(),false);
 units.value='23';units.emit('input');assert.equal(h.button('Guardar en el PPP').disabled,true,'editing a different valid field cannot erase the invalid driver');h.button('1 volumen').click();assert.equal(h.view.snapshot().count,3,'count changes do not silently discard an invalid raw field');levels.value='5';levels.emit('input');assert.equal(h.button('Guardar en el PPP').disabled,false);assert.equal(h.view.snapshot().volumes[0].values.residential_levels,5);h.view.dispose();
});

test('a saved receipt with calculated false explicitly keeps calculation pending',async()=>{
 let h;h=mounted(context({native_collection:canonical()}),async request=>{h.setContext(context({revision:'r2',native_collection:request.volumes}));return{ok:true,request_id:request.request_id,case_id:'synthetic-case',scenario_id:'scenario-a',revision:'r2',native_collection:request.volumes,calculated:false};});h.edit('units_per_level',17);assert.equal(await h.view.save(),true);assert.match(h.container.textContent,/Guardado en el PPP · cálculo pendiente/);assert.doesNotMatch(h.container.textContent,/recalculado en Sheets/);h.view.dispose();
});

test('a canonical rejection releases the pending request and preserves editable quantities with recovery text',async()=>{
 const h=mounted(context({native_collection:canonical()}),async()=>({ok:false,error:'invalid_volumes'}));h.edit('units_per_level',17);assert.equal(await h.view.save(),false);assert.equal(h.view.snapshotStatus().pending,false);assert.equal(h.view.snapshot().volumes[0].values.units_per_level,17);assert.equal(h.button('Guardar en el PPP').disabled,false);assert.match(h.container.textContent,/No se guardó\. Revisa las cantidades editadas y vuelve a guardar/);assert.doesNotMatch(h.container.textContent,/Guardado por confirmar/);h.view.dispose();
});

test('a canonical revision conflict keeps the draft and requires a fresh native revision before another save',async()=>{
 const h=mounted(context({native_collection:canonical()}),async()=>({ok:false,error:'conflicto_revision'}));h.edit('units_per_level',17);assert.equal(await h.view.save(),false);assert.equal(h.view.snapshotStatus().pending,false);assert.equal(h.view.snapshot().volumes[0].values.units_per_level,17);assert.equal(h.button('Guardar en el PPP').disabled,true);assert.match(h.container.textContent,/Actualiza desde Sheets y revisa las cantidades/);h.view.dispose();
});

function rejection(request,patch={}){return{ok:false,status:'rejected',error:'operation_rejected',request_id:request.request_id,case_id:request.context.case_id,board_case_id:request.context.case_id,scenario_id:request.context.scenario_id,base_revision:request.context.revision,prewrite_rejection:{request_id:request.request_id,caso_id:request.context.case_id,escenario_id:request.context.scenario_id,base_revision:request.context.revision,actor:'synthetic@example.invalid',payload_hash:'a'.repeat(64),stage:'prewrite',write_attempted:false,error:'native_geometry_conflict',rejected_at:'2026-10-20T00:00:00Z'},...patch};}

test('a host-validated bound prewrite rejection clears pending and exposes correction without claiming saved',async()=>{
 const h=mounted(context({native_collection:canonical()}),async request=>rejection(request));h.edit('units_per_level',17);assert.equal(await h.view.save(),false);assert.equal(h.view.snapshotStatus().pending,false);assert.equal(h.view.snapshot().volumes[0].values.units_per_level,17);assert.equal(h.button('Guardar en el PPP').disabled,false);assert.match(h.container.textContent,/Cambios rechazados · sin guardar/);assert.match(h.container.textContent,/tu propuesta se conserva y no se guardó/);h.view.dispose();
});

test('a raw operation_rejected or foreign/precommit-false proof never releases an uncertain request',async()=>{
 for(const mutate of [()=>({ok:false,error:'operation_rejected'}),request=>rejection(request,{case_id:'foreign'}),request=>{const ack=rejection(request);ack.prewrite_rejection.write_attempted=true;return ack;},request=>{const ack=rejection(request);ack.prewrite_rejection.escenario_id='foreign';return ack;}]){
  const h=mounted(context({native_collection:canonical()}),async request=>mutate(request));h.edit('units_per_level',17);assert.equal(await h.view.save(),false);assert.equal(h.view.snapshotStatus().pending,true);assert.match(h.container.textContent,/Guardado por confirmar/);h.view.dispose();
 }
});

test('an absent historical collection never becomes an editable new body under another scenario capability',()=>{
 for(const native_collection of [null,undefined]){const h=mounted(context({scenario_id:'historical-version',native_collection}));assert.equal(h.container.hidden,false);assert.match(h.container.textContent,/Volúmenes sin conectar/);assert.equal(h.field('Viviendas por planta · promedio · volumen 1'),undefined);assert.equal(h.view.snapshot(),null);assert.throws(()=>api.createMemoryDrafts().read(h.getContext()),/volumes_unavailable/);h.view.dispose();}
 const explicitFactory=mounted(context());assert.equal(explicitFactory.view.snapshot().count,1);assert.equal(explicitFactory.field('Viviendas por planta · promedio · volumen 1').value,'');explicitFactory.view.dispose();
});

function seedContext(){const collection={schema:2,count:1,shared_allocation_mode:'preserve',volumes:[{id:'seed-body-1',values:Object.fromEntries(fields.map(f=>[f.id,f.id==='name'?'Synthetic new body':f.derived?null:f.min>0?f.min:0]))}]};return context({case_id:'native-template',scenario_id:'new-project',revision:'template-r1',native_collection:collection});}

test('seed mode reviews 14 captured drivers explicitly without saving or claiming calculation',async()=>{
 let reviews=0,saves=0;const h=mounted(seedContext(),async()=>{saves++;},{mode:'seed',onReview:async request=>{reviews++;return{ok:true,status:'reviewed',request_id:request.request_id,template_revision:request.context.revision,volumes:request.volumes};}});
 assert.equal(h.view.snapshot().count,1);assert.equal(h.button('Usar este programa para crear el proyecto').disabled,false);h.edit('units_per_level',17);assert.equal(await h.view.save(),true);assert.equal(reviews,1);assert.equal(saves,0);assert.equal(h.view.snapshotStatus().reviewed,true);assert.match(h.container.textContent,/Programa revisado · proyecto sin crear/);assert.doesNotMatch(h.container.textContent,/Guardado en el PPP|recalculado en Sheets/);assert.equal(h.view.snapshot().volumes[0].values.units,null);
 h.edit('units_per_level',18);assert.equal(h.view.snapshotStatus().reviewed,false);h.view.dispose();
});

test('seed review requires every active native driver and does not turn a missing value into zero',async()=>{
 let calls=0;const ctx=seedContext();ctx.native_collection.volumes[0].values.footprint_m2=null;const h=mounted(ctx,null,{mode:'seed',onReview:async()=>{calls++;}});assert.equal(await h.view.save(),false);assert.equal(calls,0);assert.equal(h.view.snapshot().volumes[0].values.footprint_m2,null);assert.match(h.container.textContent,/Completa los datos de cada cuerpo/);h.view.dispose();
});

test('seed review needs the exact template revision and a late acknowledgement cannot restore a withdrawn template',async()=>{
 const h=mounted(seedContext(),null,{mode:'seed',onReview:async request=>({ok:true,status:'reviewed',request_id:request.request_id,template_revision:'foreign-template',volumes:request.volumes})});assert.equal(await h.view.save(),false);assert.equal(h.view.snapshotStatus().reviewed,false);assert.equal(h.view.snapshotStatus().pending,false);h.view.dispose();
 let resolve;const late=mounted(seedContext(),null,{mode:'seed',onReview:()=>new Promise(r=>resolve=r)});const pending=late.view.save();late.view.revoke();resolve({ok:true,status:'reviewed'});assert.equal(await pending,false);assert.equal(late.container.hidden,true);late.view.dispose();
});

test('the average homes per floor preserves six decimals while homes total changes only from canonical Sheets readback',async()=>{
 let h;h=mounted(context({native_collection:canonical()}),async request=>{const next=copy(request.volumes);next.volumes[0].values.units=17;h.setContext(context({revision:'r2',native_collection:next}));return{ok:true,request_id:request.request_id,case_id:'synthetic-case',scenario_id:'scenario-a',revision:'r2',native_collection:next,calculated:true};});
 const input=h.field('Viviendas por planta · promedio · volumen 1');assert.equal(input.step,'0.000001');h.edit('residential_levels',3);h.edit('units_per_level',5.666667);assert.equal(h.view.snapshot().volumes[0].values.units_per_level,5.666667);assert.equal(h.view.snapshot().volumes[0].values.units,12,'no client ROUND or multiplication');assert.match(h.container.textContent,/no define distribución por piso o recámaras/);assert.equal(await h.view.save(),true);assert.equal(h.view.snapshot().volumes[0].values.units,17);assert.equal(h.view.snapshot().volumes[0].values.units_per_level,5.666667);h.view.dispose();
});

function sharedContext(){const ctx=context({native_collection:canonical()});ctx.native_capability.shared_resources=[{id:'shared-a',label:'Synthetic infrastructure'},{id:'shared-b',label:'Synthetic amenities'}];return ctx;}

test('shared allocation is never inferred from count and policy selection requires explicit consent for every listed resource',async()=>{
 const h=mounted(sharedContext());const choice=h.field('Política de recursos compartidos'),confirm=h.field('Confirmo aplicar esta política a todos los recursos listados');h.button('1 volumen').click();assert.equal(h.view.snapshot().shared_allocation_mode,'preserve');h.button('2 volúmenes').click();assert.equal(h.view.snapshot().shared_allocation_mode,'preserve');choice.value='built_area';choice.emit('change');assert.equal(h.view.snapshot().shared_allocation_mode,'built_area');assert.match(h.container.textContent,/Synthetic infrastructure · shared-a/);assert.match(h.container.textContent,/Synthetic amenities · shared-b/);assert.equal(h.button('Guardar en el PPP').disabled,true);assert.equal(await h.view.save(),false);confirm.checked=true;confirm.emit('change');assert.equal(h.button('Guardar en el PPP').disabled,false);h.edit('units_per_level',3.4);assert.equal(confirm.checked,false,'changing drivers withdraws the previous policy approval');assert.equal(h.button('Guardar en el PPP').disabled,true);choice.value='preserve';choice.emit('change');assert.equal(h.view.snapshot().shared_allocation_mode,'preserve');assert.equal(h.button('Guardar en el PPP').disabled,false);h.view.dispose();
});

test('the shared policy is immutable receipt identity and resource metadata is withdrawn with the case',()=>{
 const original=canonical(),changed=copy(original);changed.shared_allocation_mode='built_area';assert.equal(api.matchingDrivers(original,changed,fields),false);assert.equal(api.sameCollection(original,changed,fields),false);assert.throws(()=>api.setAllocationMode(api.createMemoryDrafts().read(sharedContext()),'equal_average'));
 const h=mounted(sharedContext());assert.match(h.container.textContent,/shared-a/);h.view.revoke();assert.doesNotMatch(h.container.textContent,/shared-a|shared-b/);h.view.dispose();
});

test('withdrawing the whole-resource policy confirmation retires a local seed review',async()=>{
 const ctx=seedContext();ctx.native_capability.shared_resources=[{id:'shared-a',label:'Synthetic infrastructure'}];const h=mounted(ctx,null,{mode:'seed',onReview:async request=>({ok:true,status:'reviewed',request_id:request.request_id,template_revision:request.context.revision,volumes:request.volumes})});const choice=h.field('Política de recursos compartidos'),confirm=h.field('Confirmo aplicar esta política a todos los recursos listados');choice.value='built_area';choice.emit('change');confirm.checked=true;confirm.emit('change');assert.equal(await h.view.save(),true);assert.equal(h.view.snapshotStatus().reviewed,true);confirm.checked=false;confirm.emit('change');assert.equal(h.view.snapshotStatus().reviewed,false);assert.equal(h.button('Usar este programa para crear el proyecto').disabled,true);h.view.dispose();
});


test('stage-managed calendar remains native read-only without changing the 21-field volume schema',()=>{
 const managed=['construction_start_month','construction_duration_months','sales_start_month'];const h=mounted(context({native_collection:canonical(),managed_volume_fields:managed}));const before=copy(h.view.snapshot());
 for(const id of managed){const input=h.field(fields.find(f=>f.id===id).label+' · volumen 1');assert.equal(input.readOnly,true);h.edit(id,999);assert.equal(h.view.snapshot().volumes[0].values[id],before.volumes[0].values[id]);}
 assert.equal(h.field('Viviendas por planta · promedio · volumen 1').readOnly,false);assert.match(h.container.textContent,/Calendario calculado por etapas en Sheets/);assert.equal(api.validateFields(h.view.snapshot().fields).length,21);assert.equal(h.view.snapshotStatus().dirty,false);h.view.dispose();
});

test('factory seed preserves its native stage calendar while allowing geometry review',async()=>{
 const ctx=seedContext(),managed=['construction_start_month','construction_duration_months','sales_start_month'];ctx.managed_volume_fields=managed;let reviewed;
 const h=mounted(ctx,null,{mode:'seed',onReview:async request=>{reviewed=request;return{ok:true,status:'reviewed',request_id:request.request_id,template_revision:request.context.revision,volumes:request.volumes};}}),before=copy(h.view.snapshot());
 for(const id of managed){assert.equal(h.field(fields.find(f=>f.id===id).label+' · volumen 1').readOnly,true);h.edit(id,999);assert.equal(h.view.snapshot().volumes[0].values[id],before.volumes[0].values[id]);}
 assert.equal(h.button('2 volúmenes').disabled,true);assert.equal(h.button('Nuevo cuerpo: requiere revisar calendario').disabled,true);
 h.edit('footprint_m2',250);assert.equal(h.view.snapshot().volumes[0].values.footprint_m2,250);assert.equal(await h.view.save(),true);for(const id of managed)assert.equal(reviewed.volumes.volumes[0].values[id],before.volumes[0].values[id]);h.view.dispose();
});
