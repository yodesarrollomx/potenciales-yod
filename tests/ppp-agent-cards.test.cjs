'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{cards}=require('../ppp-agent-cards.js'),fixture=require('./fixtures/patrimonial-native.json');
test('compact cards cover every original field exactly once and do not alter the model',()=>{
 const before=JSON.stringify(fixture),out=cards(fixture,id=>'Label '+id),ids=out.flatMap(c=>c.fields);
 assert.equal(ids.length,269);assert.equal(new Set(ids).size,269);assert.deepEqual(new Set(ids),new Set(fixture.campos.map(c=>c.id)));
 assert.equal(JSON.stringify(fixture),before);assert.equal(out[0].inputs[0].label,'Label inTerrenoM2');
});
test('missing inputs and unconfirmed financial results remain pending, not zero',()=>{
 const f=structuredClone(fixture),s=f.estados[f.activo];f.escenarios.find(e=>e.id===f.activo).inputs.inTerrenoM2=null;s.modeloValido=false;
 const out=cards(f);assert.equal(out[0].inputs[0].value,'Pendiente');assert.equal(out[1].results.find(r=>r.id==='noi').value,'Pendiente');
});

test('inactive cap rate is described as not applied without inventing a percentage or editing inputs',()=>{
 const {Store}=require('../ppp-patrimonial-native.js'),m=structuredClone(fixture),e=m.escenarios.find(e=>e.id===m.activo),s=m.estados[m.activo];
 e.inputs.inCapRateMercado=0;e.inputs.inValorM2Zona=25000;s.porM2=true;s.p.capMercado=0;s.inactive_fields=['inCapRateMercado'];
 const store=new Store({id:m.caso_id,get:()=>{},post:()=>{throw Error('no write');}});store.load(m);const before=JSON.stringify(store.model);
 const out=cards(store.model,id=>id,id=>store.fieldNote(id));
 assert.equal(out.flatMap(c=>c.inputs).find(x=>x.id==='inCapRateMercado').value,'No aplicado: valuación por m²');assert.equal(JSON.stringify(store.model),before);assert.equal(store.active().inputs.inCapRateMercado,0);
});
