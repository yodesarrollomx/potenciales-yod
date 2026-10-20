'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../ppp-volumes.js');
const context=(patch={})=>({verified:true,ready:true,project_name:'Torre Ruiseñor',case_id:'synthetic-pilot',scenario_id:'scenario-a',revision:'r1',scenario_name:'Synthetic A',...patch});

test('volume drafts start with one selected and three distinct empty records, without inferred quantities',()=>{
 const draft=api.createDraft(context()),summary=api.summarize(draft);
 assert.equal(draft.count,1);assert.equal(draft.volumes.length,3);assert.equal(new Set(draft.volumes.map(v=>v.id)).size,3);assert.equal(draft.edit_revision,0);
 for(const row of draft.volumes)for(const key of ['levels','units','gross_area_m2','start_month','duration_months'])assert.equal(row[key],null);
 assert.deepEqual(summary.units,{value:null,captured:0,filled:0,expected:1,complete:false});assert.equal(summary.gross_area_m2.value,null);
 assert.deepEqual(summary.levels,[{id:'volume-1',value:null}]);assert.equal(summary.inactive,0);
});

test('selecting one, two or three volumes preserves independent captured rows and never clones one row into others',()=>{
 const original=api.createDraft(context());let draft=api.resizeDraft(original,3);
 draft=api.updateVolume(draft,'volume-1',{name:'Synthetic low wing',levels:4,units:12,gross_area_m2:1200.5,stage:'Initial',start_month:0,duration_months:8});
 draft=api.updateVolume(draft,'volume-2',{name:'Synthetic high wing',levels:9,units:24,gross_area_m2:2500,stage:'Later',start_month:8,duration_months:12});
 draft=api.updateVolume(draft,'volume-3',{name:'Synthetic final wing',levels:6,units:18,gross_area_m2:1800,stage:'Final',start_month:20,duration_months:10});
 const captured=structuredClone(draft.volumes),revision=draft.edit_revision;
 draft=api.resizeDraft(draft,1);assert.equal(api.summarize(draft).inactive,2);assert.equal(api.summarize(draft).units.value,12);
 draft=api.resizeDraft(draft,2);assert.equal(api.summarize(draft).units.value,36);
 draft=api.resizeDraft(draft,3);assert.deepEqual(draft.volumes,captured);assert.equal(api.summarize(draft).units.value,54);assert.equal(api.summarize(draft).gross_area_m2.value,5500.5);
 assert.equal(draft.edit_revision,revision+3);assert.deepEqual(original,api.createDraft(context()),'updates never mutate the source draft');
 assert.equal(api.resizeDraft(draft,3).edit_revision,draft.edit_revision,'unchanged count does not create an edit');
});

test('zero is a captured quantity while missing values stay partial and levels never become a sum',()=>{
 let draft=api.resizeDraft(api.createDraft(context()),3);draft=api.updateVolume(draft,'volume-1',{units:0,gross_area_m2:0,levels:4});draft=api.updateVolume(draft,'volume-2',{units:7,levels:8});
 const partial=api.summarize(draft);assert.deepEqual(partial.units,{value:null,captured:7,filled:2,expected:3,complete:false});assert.deepEqual(partial.gross_area_m2,{value:null,captured:0,filled:1,expected:3,complete:false});
 assert.deepEqual(partial.levels.map(row=>row.value),[4,8,null]);draft=api.updateVolume(draft,'volume-3',{units:0});assert.equal(api.summarize(draft).units.value,7);
 draft=api.updateVolume(draft,'volume-2',{units:null});assert.equal(api.summarize(draft).units.value,null);assert.equal(api.summarize(draft).units.filled,2);
});

test('invalid quantities, foreign fields and volume identities cannot contaminate a draft',()=>{
 const draft=api.createDraft(context());
 for(const count of [0,4,-1,1.5,'2',null])assert.throws(()=>api.resizeDraft(draft,count));
 for(const [field,value]of [['levels',0],['levels',1.5],['units',-1],['units',NaN],['gross_area_m2',Infinity],['start_month',-1],['duration_months',0],['units','17'],['price',58000]])assert.throws(()=>api.updateVolume(draft,'volume-1',{[field]:value}));
 assert.throws(()=>api.updateVolume(draft,'volume-4',{units:5}));assert.throws(()=>api.updateVolume(draft,'volume-1',{name:''}));
 assert.deepEqual(draft,api.createDraft(context()));assert.equal(Object.hasOwn(api.summarize(draft),'profit'),false);assert.equal(Object.hasOwn(api.summarize(draft),'tir'),false);
});

test('memory proposals are keyed by case, scenario and base revision and reads return detached copies',()=>{
 const memory=api.createMemoryDrafts(),a=context(),variants=[context({case_id:'other-case'}),context({scenario_id:'scenario-b'}),context({revision:'r2'})];
 const saved=api.updateVolume(memory.read(a),'volume-1',{units:17});memory.write(a,saved);
 for(const other of variants)assert.equal(memory.read(other).volumes[0].units,null);
 const copy=memory.read(a);copy.volumes[0].units=999;assert.equal(memory.read(a).volumes[0].units,17);
 for(const other of variants)assert.throws(()=>memory.write(other,saved),/volume_context_changed/);
 assert.equal(memory.size,4);memory.clear();assert.equal(memory.size,0);assert.equal(memory.read(a).volumes[0].units,null);
});

test('only a verified ready pilot context can create or recover a proposal',()=>{
 for(const patch of [{verified:false},{ready:false},{project_name:'Other project'},{case_id:''},{scenario_id:''},{revision:''}]){
  const ctx=context(patch);assert.equal(api.validContext(ctx),false);assert.throws(()=>api.createDraft(ctx),/unverified_volume_context/);assert.throws(()=>api.createMemoryDrafts().read(ctx));
 }
});

class Element{
 constructor(tag){this.tag=tag;this.children=[];this.parentNode=null;this.dataset={};this.attrs={};this.listeners={};this.hidden=false;this.value='';this._text='';this.classList={add(){}};}
 setAttribute(k,v){this.attrs[k]=String(v);}get textContent(){return this._text+this.children.map(n=>n.textContent).join(' ');}set textContent(v){this.children=[];this._text=String(v);}
 append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}removeEventListener(k,fn){this.listeners[k]=(this.listeners[k]||[]).filter(f=>f!==fn);}emit(k,e={}){for(const fn of this.listeners[k]||[])fn(e);}click(){this.emit('click');}
 all(){return this.children.flatMap(n=>[n,...n.all()]);}
}
function mounted(){
 let current=context();const container=new Element('section'),win=new Element('window'),doc={createElement:tag=>new Element(tag)},view=api.mount({container,getContext:()=>current,doc,win});
 const field=label=>container.all().find(n=>n.attrs['aria-label']===label),button=label=>container.all().find(n=>n.tag==='button'&&n.textContent===label);
 return {container,view,win,getContext:()=>current,setContext:next=>current=next,field,button};
}

test('mounted fields edit only their proposal and switching revisions never reuses old quantities',()=>{
 const h=mounted();assert.equal(h.view.setContext(h.getContext()),true);h.button('3 volúmenes').click();
 const first=h.field('Viviendas · volumen 1'),second=h.field('Viviendas · volumen 2');first.value='17';first.emit('change');second.value='24';second.emit('change');
 assert.equal(h.view.snapshot().volumes[0].units,17);assert.equal(h.view.snapshot().volumes[1].units,24);assert.match(h.container.textContent,/41 viviendas capturados.*2 de 3 volúmenes/);
 h.setContext(context({revision:'r2'}));h.view.setContext(h.getContext());assert.equal(h.view.snapshot().count,1);assert.equal(first.value,'');assert.equal(second.value,'');assert.equal(h.view.snapshot().volumes[0].units,null);
 h.setContext(context());h.view.setContext(h.getContext());assert.equal(h.view.snapshot().volumes[0].units,17);assert.equal(h.view.snapshot().count,3);h.view.dispose();
});

test('invalid or revoked context wipes visible values and proposals before the same case can return',()=>{
 const h=mounted();h.view.setContext(h.getContext());const field=h.field('Viviendas · volumen 1');field.value='17';field.emit('change');
 h.setContext(context({verified:false}));assert.equal(h.view.setContext(h.getContext()),false);assert.equal(h.view.snapshot(),null);assert.equal(h.container.hidden,true);assert.equal(field.value,'');
 assert.doesNotMatch(h.container.textContent,/17 viviendas/);h.setContext(context());h.view.setContext(h.getContext());assert.equal(h.view.snapshot().volumes[0].units,null,'reverification cannot restore a revoked draft');h.view.dispose();
});

test('a stale setContext result cannot reveal an old draft after the trusted active scenario changes',()=>{
 const h=mounted(),old=h.getContext();h.view.setContext(old);const field=h.field('Viviendas · volumen 1');field.value='17';field.emit('change');
 h.setContext(context({scenario_id:'scenario-b'}));assert.equal(h.view.setContext(old),false);assert.equal(h.container.hidden,true);assert.equal(h.view.snapshot(),null);assert.equal(field.value,'');h.view.dispose();
});

test('an input from a withdrawn context cannot change the current proposal and clears the old surface',()=>{
 const h=mounted();h.view.setContext(h.getContext());const field=h.field('Viviendas · volumen 1');h.setContext(context({scenario_id:'scenario-b'}));field.value='999';field.emit('change');
 assert.equal(h.view.snapshot(),null);assert.equal(h.container.hidden,true);assert.equal(field.value,'');h.view.dispose();
});

test('an explicit temporary suspension clears the surface and resumes only its exact verified memory context',()=>{
 const h=mounted(),a=h.getContext();h.view.setContext(a);const field=h.field('Viviendas · volumen 1');field.value='17';field.emit('change');
 h.view.suspend();assert.equal(h.view.snapshot(),null);assert.equal(h.container.hidden,true);assert.equal(field.value,'');
 h.setContext(context({revision:'r2'}));h.view.setContext(h.getContext());assert.equal(h.view.snapshot().volumes[0].units,null);
 h.setContext(a);h.view.setContext(a);assert.equal(h.view.snapshot().volumes[0].units,17);h.view.dispose();
});

test('session withdrawal and leaving the page clear draft memory while unrelated storage events leave it alone',()=>{
 for(const event of [{type:'storage',data:{key:'pyod_clave_v1'}},{type:'storage',data:{key:null}},{type:'pagehide',data:{}}]){
  const h=mounted();h.view.setContext(h.getContext());const field=h.field('Viviendas · volumen 1');field.value='17';field.emit('change');
  h.win.emit('storage',{key:'unrelated-preference'});assert.equal(h.view.snapshot().volumes[0].units,17);
  h.win.emit(event.type,event.data);assert.equal(h.view.snapshot(),null);assert.equal(field.value,'');h.view.setContext(h.getContext());assert.equal(h.view.snapshot().volumes[0].units,null);h.view.dispose();
 }
});

test('a new native revision offers the old proposal but copies quantities only after explicit review',()=>{
 const h=mounted();h.view.setContext(h.getContext());h.button('3 volúmenes').click();
 const one=h.field('Viviendas · volumen 1'),two=h.field('Viviendas · volumen 2');one.value='17';one.emit('change');two.value='24';two.emit('change');
 h.setContext(context({revision:'r2'}));h.view.setContext(h.getContext());
 const review=h.button('Revisar y continuar la propuesta');assert.equal(review.parentNode.hidden,false);assert.match(h.container.textContent,/revisión r1.*revisión r2/);
 assert.equal(h.view.snapshot().count,1);assert.equal(h.view.snapshot().volumes[0].units,null,'there is no silent application to the new revision');
 review.click();const continued=h.view.snapshot();assert.equal(continued.base_revision,'r2');assert.equal(continued.continued_from_revision,'r1');assert.equal(continued.count,3);assert.deepEqual(continued.volumes.map(v=>v.units),[17,24,null]);assert.match(h.container.textContent,/sigue pendiente de aplicar al PPP/);h.view.dispose();
});

test('continuation never comes from another scenario and changing the case retires all captured proposals',()=>{
 const h=mounted();h.view.setContext(h.getContext());const field=h.field('Viviendas · volumen 1');field.value='17';field.emit('change');
 h.setContext(context({scenario_id:'scenario-b',revision:'r2'}));h.view.setContext(h.getContext());assert.equal(h.button('Revisar y continuar la propuesta').parentNode.hidden,true);h.button('Revisar y continuar la propuesta').click();assert.equal(h.view.snapshot().volumes[0].units,null);
 h.setContext(context({case_id:'other-case',revision:'r2'}));h.view.setContext(h.getContext());h.setContext(context({revision:'r2'}));h.view.setContext(h.getContext());assert.equal(h.button('Revisar y continuar la propuesta').parentNode.hidden,true);assert.equal(h.view.snapshot().volumes[0].units,null);h.view.dispose();
});

test('starting a revision blank dismisses continuation without applying or overwriting quantities',()=>{
 const h=mounted();h.view.setContext(h.getContext());const field=h.field('Viviendas · volumen 1');field.value='17';field.emit('change');
 h.setContext(context({revision:'r2'}));h.view.setContext(h.getContext());h.button('Empezar esta revisión en blanco').click();assert.equal(h.button('Revisar y continuar la propuesta').parentNode.hidden,true);assert.equal(h.view.snapshot().volumes[0].units,null);assert.equal(h.view.snapshot().count,1);
 h.view.setContext(h.getContext());assert.equal(h.button('Revisar y continuar la propuesta').parentNode.hidden,true);assert.equal(h.view.snapshot().volumes[0].units,null);h.view.dispose();
});
