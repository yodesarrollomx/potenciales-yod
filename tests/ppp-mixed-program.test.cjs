'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const program=require('../ppp-mixed-program.js'),graph=require('../ppp40-graph.js');
const ctx={case_id:'synthetic-case',scenario_id:'base',revision:'synthetic-r1'};
const fixture=()=>({schema:program.VERSION,
 terrain:{gross_m2:1000,excluded_m2:100,normative_base_m2:null,cos_pct:null,cus:null,source:'Synthetic survey',status:'supuesto'},
 products:[{id:'office',use:'oficina',label:'Synthetic office',active:true,built_m2:400,sellable_m2:300,units:6,price_basis:'m2',price:20000,sale_enabled:true,source:'Synthetic program',status:'supuesto'},
 {id:'hotel',use:'hotel',label:'Synthetic hotel',active:false,built_m2:null,sellable_m2:null,units:null,price_basis:'unidad',price:null,sale_enabled:null,source:'',status:'pendiente'}],
 costs:[{id:'construction',label:'Synthetic cost',active:true,product_id:'office',quantity_basis:'construido',quantity:null,unit_cost:10000,source:'Synthetic budget',status:'supuesto'},
 {id:'common',label:'Shared infrastructure',active:true,product_id:null,quantity_basis:'fija',quantity:1,unit_cost:50000,source:'Synthetic budget',status:'supuesto'}],
 budget:{mode:'partidas',consolidated:null,source:'Synthetic budget',status:'supuesto'}});
test('native formulas and graph share a single acyclic, context-bound definition',()=>{
 const plan=program.build(fixture(),ctx);assert.equal(graph.validateGraph(plan.graph).ok,true);
 assert.equal(plan.calculated,false);assert.equal(plan.status,'migration_plan');
 const refs=new Set();for(const cell of plan.cells){assert.ok(!refs.has(cell.ref));refs.add(cell.ref);if(cell.formula){assert.equal(cell.editable,false);assert.ok(cell.formula.startsWith('='));assert.ok(!cell.formula.includes(','));}}
 assert.ok(plan.pending_modules.includes('debt'));assert.ok(plan.pending_modules.includes('waterfall'));
 const impact=graph.affected(plan.graph,['product:office:built_m2'],ctx);assert.equal(impact.ok,true);
 assert.ok(impact.fields.some(f=>f.field_id==='total:direct_cost'));assert.ok(impact.fields.some(f=>f.field_id==='check:capacity_delta'));
 assert.equal(graph.affected(plan.graph,['product:office:built_m2'],{...ctx,revision:'other'}).ok,false);
});
test('unknown permission, quantity and conflicting evidence stay blank instead of becoming revenue',()=>{
 const plan=program.build(fixture(),ctx),formula=ref=>plan.cells.find(c=>c.ref===ref).formula;
 assert.match(formula('M17'),/ISBLANK\(J17\)/);assert.match(formula('M17'),/en_conflicto/);
 assert.match(formula('M17'),/COUNT\(G17;I17\)<2/);assert.match(formula('B8'),/COUNT\(B4:B5\)<2/);
 assert.match(formula('E4'),/COUNT\(M16;M17\)<2/);
 assert.match(formula('O17'),/D17=FALSE;0;IF\(COUNT\(E17\)<1;"";E17\)/);
 // An inactive row can be activated in Sheets without rebuilding the totals.
 assert.match(formula('E2'),/O16;O17/);
});
test('budget chooses itemized OR consolidated, common cost appears once, no fee duplication',()=>{
 const input=fixture();input.budget.mode='consolidado';input.budget.consolidated=8000000;
 const p=program.build(input,ctx),f=p.cells.find(c=>c.ref==='E9').formula;
 assert.match(f,/E6="partidas"/);assert.doesNotMatch(f,/E5\+E7/);
 assert.equal(p.cells.filter(c=>c.ref==='J85').length,1);
 assert.match(p.cells.find(c=>c.ref==='J84').formula,/E16\*G84/);
 assert.match(p.cells.find(c=>c.ref==='J85').formula,/F85\*G85/);
});
test('invalid units, duplicate IDs, geometry and ungrounded confirmed sources reject before compilation',()=>{
 for(const mutate of [x=>x.products.push({...x.products[0]}),x=>x.products[0].units=2.5,x=>x.products[0].price='=IMPORTXML()',x=>x.products[0].sellable_m2=401,x=>x.terrain.excluded_m2=1001,x=>x.costs[0].product_id='missing',x=>x.costs[0].quantity=100,x=>{x.products[0].status='confirmado';x.products[0].source='';},x=>x.budget.mode='sumar']){
  const f=fixture();mutate(f);assert.throws(()=>program.build(f,ctx));
 }
});
test('all uses keep identities, and zero is distinct from absent',()=>{
 for(const use of program.USES){const f=fixture();f.products[0].use=use;f.products[0].price=0;assert.doesNotThrow(()=>program.build(f,ctx));}
 const f=fixture();f.products[0].price=null;const p=program.build(f,ctx);assert.equal(p.cells.find(c=>c.ref==='I16').value,null);
 assert.equal(p.cells.find(c=>c.ref==='B4').value,null);
});
test('no implicit financial defaults or fake terrain-to-sales multiplier',()=>{
 const p=program.build(fixture(),ctx),impact=graph.affected(p.graph,['land:gross_m2'],ctx);
 assert.deepEqual(impact.fields.map(x=>x.field_id),['land:net']);
 assert.equal(p.graph.nodes.some(n=>/TIR|waterfall/i.test(n.label)),false);
});
test('native migration protects formulas and structural links while allowing validated scenario edits',()=>{
 const plan=program.build(fixture(),ctx),requests=require('../scripts/ppp-mixed-plan.cjs').requests(plan,99);
 const guard=requests.find(r=>r.addProtectedRange).addProtectedRange.protectedRange;
 assert.equal(guard.warningOnly,false);
 const editable=ref=>plan.cells.find(c=>c.ref===ref).editable;
 for(const ref of ['A16','A84','C84','E84','J84','E9'])assert.equal(editable(ref),false,ref);
 for(const ref of ['E16','I16','D17','E6'])assert.equal(editable(ref),true,ref);
 const ranges=guard.unprotectedRanges;
 assert.equal(ranges.some(r=>r.startRowIndex===83&&r.startColumnIndex===2),false);
 const units=requests.find(r=>r.setDataValidation?.range.startRowIndex===15&&r.setDataValidation.range.startColumnIndex===6).setDataValidation;
 assert.equal(units.rule.strict,true);assert.match(units.rule.condition.values[0].userEnteredValue,/MOD\(G16;1\)=0/);
});
