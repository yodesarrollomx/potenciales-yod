'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../ppp40-graph.js');
const ctx = {case_id:'case-1',scenario_id:'scenario-1',revision:'r1'};
function graph() {return {schema_version:1,...ctx,nodes:[
  {id:'land',field_refs:['land.area','land.boundary']}, {id:'road',field_refs:['road.area']},
  {id:'available',field_refs:['land.available']}, {id:'view',field_refs:[]}],
  rules:[{id:'road',version:'1',inputs:['land.boundary'],outputs:['road.area']},
    {id:'balance',version:'1',inputs:['road.area','land.area'],outputs:['land.available']}],
  edges:[{id:'e1',from:'land',to:'road',kind:'dependency',rule_id:'road',rule_version:'1'},
    {id:'e2',from:'road',to:'available',kind:'dependency',rule_id:'balance',rule_version:'1'},
    {id:'e3',from:'land',to:'available',kind:'dependency',rule_id:'balance',rule_version:'1'},
    {id:'e4',from:'view',to:'road',kind:'membership'},
    {id:'e5',from:'available',to:'land',kind:'alternative'}]};}
const catalog = {modules:[{id:'M01',questions:[{id:'M01.Q01',text:'¿Área?',depends_on:'ignore this text'}, {id:'M01.Q02',text:'¿Límite?'}]}]};
const mapping = [{question_id:'M01.Q01',actions:['apertura'],families:['vertical','macrolotes','patrimonial','residencial','unifamiliar'],field_ids:['land.area'],priority:2}, {question_id:'M01.Q02',actions:['vialidad'],families:['vertical'],field_ids:['land.boundary'],priority:1}];
function query(fields, action='apertura',family='vertical') {return api.nextQuestions({graph:graph(),context:ctx,catalog,mapping,fields,action,family});}
test('commonjs and browser UMD export identical public API',()=> {const scope={}; vm.runInNewContext(fs.readFileSync(require.resolve('../ppp40-graph.js'),'utf8'),scope); assert.deepEqual(Object.keys(scope.PPP40Graph).sort(),Object.keys(api).sort());});
test('mixed navigation and alternatives do not affect semantic dependencies',()=>{ const g=graph(), before=JSON.stringify(g); assert.equal(api.validateGraph(g).ok,true); assert.deepEqual(api.affected(g,['land.boundary'],ctx).fields,[{field_id:'road.area',causes:['land.boundary']},{field_id:'land.available',causes:['land.boundary']}]); assert.equal(JSON.stringify(g),before); });
test('multiple changes propagate both causes, without calculating',()=>{const r=api.affected(graph(),['land.area','land.boundary'],ctx); assert.deepEqual(r.fields.find(x=>x.field_id==='land.available').causes,['land.area','land.boundary']); assert.equal('value' in r.fields[0],false);});
test('unknown fields and mismatched case, scenario or revision fail closed',()=>{assert.equal(api.affected(graph(),['missing'],ctx).ok,false); for(const k of Object.keys(ctx)){assert.equal(api.affected(graph(),['land.area'],{...ctx,[k]:'other'}).errors[0].code,'context_mismatch');}});
test('cycles in calculation, broken node, rule and binding are rejected',()=>{let g=graph();g.rules.push({id:'back',version:'1',inputs:['land.available'],outputs:['land.area']});g.edges.push({id:'back',from:'available',to:'land',kind:'dependency',rule_id:'back',rule_version:'1'});assert.ok(api.validateGraph(g).errors.some(e=>e.code==='dependency_cycle')); g=graph();g.edges[0].to='missing';assert.ok(api.validateGraph(g).errors.some(e=>e.code==='broken_reference')); g=graph();g.rules[0].version='';assert.equal(api.validateGraph(g).ok,false);g=graph();g.rules[0].inputs=['unknown'];assert.ok(api.validateGraph(g).errors.some(e=>e.code==='broken_rule_field')); g=graph();g.edges[0].rule_id='balance';assert.ok(api.validateGraph(g).errors.some(e=>e.code==='rule_binding'));});
test('duplicate ids and malformed fields are rejected',()=>{const g=graph();g.nodes.push(g.nodes[0]);assert.equal(api.validateGraph(g).ok,false);assert.equal(api.affected(graph(),['land.area','land.area'],ctx).ok,false);});
test('absent and null are pending, explicit zero remains known, conflicts are asked',()=>{for(const fields of [{},{'land.area':{value:null,status:'pendiente'}},{'land.area':{value:0,status:'en_conflicto'}}]) assert.equal(query(fields).primary.id,'M01.Q01'); assert.equal(query({'land.area':{value:0,status:'confirmado'}}).primary,null);assert.equal(query({'land.area':{value:null,status:'no_aplica'}}).primary,null);});
test('one main question and mapping gate action and family; unknown remains pending',()=>{assert.equal(query({},'vialidad','vertical').primary.id,'M01.Q02');assert.equal(query({},'vialidad','macrolotes').primary,null);assert.equal(query({},'unmapped','vertical').primary,null);for(const f of ['vertical','macrolotes','patrimonial','residencial','unifamiliar']) assert.equal(query({},'apertura',f).primary.id,'M01.Q01');});
test('malformed mapping and invalid field metadata fail closed',()=>{const bad=[{...mapping[0],question_id:'M99.Q99'}];assert.equal(api.nextQuestions({graph:graph(),context:ctx,catalog,mapping:bad,fields:{},action:'apertura',family:'vertical'}).ok,false);assert.equal(query({'land.area':{value:4,status:'wrong'}}).ok,false);});
