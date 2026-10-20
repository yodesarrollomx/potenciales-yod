'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const context=vm.createContext({});
for(const name of ['PPPVolumes.gs','PPPVolumesFormulas.gs','PPPVolumesProgram.gs'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','server',name),'utf8'),context,{filename:name});
const {PPPVolumes,PPPVolumesProgram}=context,clone=value=>JSON.parse(JSON.stringify(value)),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const headers=['escenario_id','programa','escenario_hoja','cantidad_activa','filas_guardadas','capacidad','modelo_revision','estado','programa_fuente','formula_hash','shared_allocation_mode'];
const bodyValues=name=>({name,footprint_m2:250,open_courtyard_m2:10,residential_levels:2,units_per_level:2,units:4,private_area_per_unit_m2:50,private_residential_area_m2:200,built_residential_area_m2:480,commercial_ground_m2:40,ground_services_m2:10,covered_ground_m2:50,gross_area_m2:530,basement_area_m2:100,direct_cost:5000000,construction_start_month:3,construction_duration_months:3,construction_end_month:5,sales_start_month:1,presale_months:6,delivery_months:2});
class Sheet{
 constructor(name,id,data=[],formulas=[]){this.name=name;this.id=id;this.data=data;this.formulas=formulas;this.writes=0;}
 getName(){return this.name;}getSheetId(){return this.id;}getLastRow(){return this.data.length;}
 getRange(row,column,height=1,width=1){
  if(typeof row==='string'){const match=/^([A-Z]+)(\d+)$/.exec(row);column=[...match[1]].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);row=Number(match[2]);}
  const take=source=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>source[row+i-1]?.[column+j-1]??''));
  return{getValues:()=>take(this.data),getFormulas:()=>take(this.formulas),getValue:()=>this.data[row-1]?.[column-1]??'',setValues:()=>{this.writes++;throw Error('Unexpected non-atomic write');}};
 }
 getDataRange(){return this.getRange(1,1,Math.max(this.data.length,this.formulas.length,1),25);}
}
function fixture(){
 const definitions=clone(PPPVolumes.fields()),programData=Array.from({length:22},()=>Array(25).fill('')),formulas=Array.from({length:22},()=>Array(25).fill(''));
 for(let i=0;i<16;i++)for(let col=0;col<21;col++)if(definitions[col].derived)formulas[i+6][col]='=1';
 programData[5][24]=0;
 const native={schema:2,count:3,shared_allocation_mode:'preserve',volumes:Array.from({length:3},(_,i)=>({id:'body-'+(i+1),values:bodyValues('Body '+(i+1))}))};
 native.volumes.forEach((row,i)=>{definitions.forEach((field,col)=>{programData[i+6][col]=row.values[field.id];});programData[i+6][21]=row.id;});
 const program=new Sheet('Program_A',101,programData,formulas),scenario=new Sheet('Scenario_A',102,[['native']], [['=SUM(1)']]),allocation=new Sheet('PA_scenario_a',103,[Array(19).fill('heading'),['resource-a','native',0.5,0.3,0.2,...Array(13).fill(0),'Shared foundation']]),index=new Sheet('Volumenes_Indice',104,[headers.slice(),['scenario-a','Program_A','Scenario_A',3,3,16,'native-schema2','ready','Original','','preserve']]);
 const sheets=new Map([program,scenario,allocation,index].map(sheet=>[sheet.name,sheet])),atomic=[];
 const ss={getSheetByName:name=>sheets.get(name)||null,getId:()=> 'synthetic-book'};
 const hooks={ss,flush:()=>{},hash,atomicWrite:(id,requests)=>atomic.push({id,requests:clone(requests)})};
 const fingerprint=()=>{index.data[1][9]=hash(PPPVolumes.stable([program,scenario,allocation].map(sheet=>[sheet.name,sheet.getDataRange().getFormulas()])));};fingerprint();
 const store=PPPVolumesProgram.createStore(hooks),ctx={caso_id:'synthetic-case',scenario_id:'scenario-a',actor:'synthetic-actor'};
 return{store,ctx,native,desired:clone(PPPVolumes.project(native)),program,scenario,allocation,index,sheets,atomic,hooks,fingerprint};
}

test('native store preflight returns one atomic batch excluding all seven derived columns',()=>{
 const f=fixture(),before=clone(f.store.readCollection(f.ctx,'scenario-a')),plan=clone(f.store.writePlan(f.ctx,f.desired));
 assert.deepEqual(before,f.native);assert.equal(plan.length,9);assert.equal(f.atomic.length,0);
 const derivedColumns=new Set([5,7,8,11,12,14,17]);
 for(const request of plan){const update=request.updateCells;assert.equal(update.fields,'userEnteredValue');if(update.range.sheetId===101){for(let col=update.range.startColumnIndex;col<update.range.endColumnIndex;col++)assert.equal(derivedColumns.has(col),false);}}
 assert.equal(plan.filter(request=>request.updateCells.range.sheetId===104).length,2);
 assert.throws(()=>f.store.writeDrivers(f.ctx,f.desired),/operation_marker_required/);
 const marker={request_id:'synthetic-request',actor:f.ctx.actor,payload_hash:'a'.repeat(64),ledger_sheet_id:105,ledger_row:2},ledger=new Sheet('Volumenes_Operaciones',105,[Array(13).fill('header'),[marker.request_id,f.ctx.caso_id,f.ctx.scenario_id,f.ctx.actor,'r1',marker.payload_hash,'pending']]);f.sheets.set(ledger.name,ledger);
 f.store.writeDrivers(f.ctx,f.desired,marker);assert.equal(f.atomic.length,1);assert.equal(f.atomic[0].id,'synthetic-book');assert.deepEqual(f.atomic[0].requests.slice(0,9),plan);assert.equal(f.atomic[0].requests.length,10);const last=f.atomic[0].requests.at(-1).updateCells;assert.equal(last.range.sheetId,105);assert.equal(last.range.startColumnIndex,6);assert.equal(last.rows[0].values[0].userEnteredValue.stringValue,'applied');assert.equal(f.program.writes+f.scenario.writes+f.index.writes+ledger.writes,0);
 assert.throws(()=>f.store.writePlan(f.ctx,f.desired,{...marker,actor:'foreign'}),/operation_marker_mismatch/);assert.throws(()=>f.store.writePlan({...f.ctx,caso_id:'foreign'},f.desired,marker),/operation_marker_mismatch/);
});

test('store preserves inactive row identities and rejects deleting, reordering or replacing a native ID',()=>{
 for(const mutate of [d=>{d.count=2;d.volumes.pop();},d=>{d.volumes.reverse();},d=>{d.volumes[1].id='replacement';}]){
  const f=fixture(),d=clone(f.desired);mutate(d);assert.throws(()=>f.store.writePlan(f.ctx,d),/volume_identity_conflict/);assert.equal(f.atomic.length,0);
 }
 const f=fixture();f.allocation.data[1].splice(2,16,1,...Array(15).fill(0));const d=clone(f.desired);d.count=1;const plan=clone(f.store.writePlan(f.ctx,d));
 const idUpdate=plan.find(request=>request.updateCells.range.sheetId===101&&request.updateCells.range.startColumnIndex===21).updateCells;
 assert.equal(idUpdate.rows.length,3);assert.equal(idUpdate.rows[2].values[0].userEnteredValue.stringValue,'body-3');
 const indexUpdate=plan.find(request=>request.updateCells.range.sheetId===104).updateCells;assert.deepEqual(indexUpdate.rows[0].values.map(value=>value.userEnteredValue.numberValue),[1,3]);
});

test('preflight refuses changed native formulas and invalid physical or shared assumptions without calling the writer',()=>{
 for(const [mutate,expected]of [
  [f=>{f.program.formulas[6][5]='=2';},/native_formula_manifest_changed/],
  [f=>{f.program.formulas[6][5]='';f.fingerprint();},/native_formula_missing/],
  [f=>{f.program.formulas[6][0]='=2';f.fingerprint();},/protected_native_driver/],
  [f=>{f.desired.volumes[0].values.footprint_m2=null;},/active_driver_missing/],
  [f=>{f.desired.volumes[0].values.open_courtyard_m2=251;},/native_geometry_conflict/],
  [f=>{f.desired.volumes[0].values.units_per_level=3;f.desired.volumes[0].values.private_area_per_unit_m2=100;},/native_geometry_conflict/],
  [f=>{f.desired.volumes[0].values.commercial_ground_m2=250;},/native_geometry_conflict/],
  [f=>{f.desired.volumes[0].values.construction_start_month=119;},/native_horizon_conflict/],
  [f=>{f.allocation.data[1][2]=0.9;},/shared_allocation_requires_reconciliation/],
  [f=>{f.sheets.delete('PA_scenario_a');},/program_missing/],
  [f=>{delete f.hooks.atomicWrite;},/atomic_native_writer_required/]
 ]){const f=fixture();mutate(f);assert.throws(()=>f.store.validateWrite(f.ctx,f.native,f.desired),expected);assert.equal(f.atomic.length,0);}
});

test('a second scenario cannot borrow another native program or formula manifest',()=>{
 const f=fixture();assert.equal(f.store.readCollection(f.ctx,'scenario-b'),null);assert.throws(()=>f.store.writePlan({scenario_id:'scenario-b'},f.desired),/program_missing/);assert.equal(f.atomic.length,0);
 f.index.data.push(clone(f.index.data[1]));assert.throws(()=>f.store.readCollection(f.ctx,'scenario-a'),/duplicate_program/);
});


test('seventeen homes over five levels stays a numeric average driver while native F remains protected',()=>{
 const f=fixture(),desired=clone(f.desired);desired.volumes[0].values.residential_levels=5;desired.volumes[0].values.units_per_level=3.4;const plan=clone(f.store.writePlan(f.ctx,desired));const first=plan.find(request=>request.updateCells.range.sheetId===101&&request.updateCells.range.startColumnIndex===0).updateCells;assert.equal(first.rows[0].values[4].userEnteredValue.numberValue,3.4);assert.equal(first.range.endColumnIndex,5);
 assert.equal(f.store.readCollection(f.ctx,'scenario-a').volumes[0].values.units,4);f.program.data[6][5]=17;assert.equal(f.store.readCollection(f.ctx,'scenario-a').volumes[0].values.units,17);assert.equal(f.atomic.length,0);
});

test('a reduction requires explicit allocation policy and never rewrites raw shared allocations',()=>{
 const f=fixture(),raw=clone(f.allocation.data),desired=clone(f.desired);desired.count=1;
 assert.throws(()=>f.store.writePlan(f.ctx,desired),/shared_allocation_requires_reconciliation/);
 desired.shared_allocation_mode='built_area';const plan=clone(f.store.writePlan(f.ctx,desired));
 assert.equal(plan.length,9);assert.equal(plan.some(request=>request.updateCells.range.sheetId===103),false);
 const mode=plan.find(request=>request.updateCells.range.sheetId===104&&request.updateCells.range.startColumnIndex===10).updateCells;
 assert.equal(mode.rows[0].values[0].userEnteredValue.stringValue,'built_area');
 assert.deepEqual(f.allocation.data,raw);assert.equal(f.allocation.writes,0);assert.equal(f.atomic.length,0);
 assert.deepEqual(clone(f.store.sharedResources(f.ctx)),[{id:'resource-a',label:'Shared foundation'}]);
 assert.deepEqual(f.store.readCollection(f.ctx,'scenario-a').shared_allocation_mode,'preserve');
 desired.volumes[0].values.footprint_m2=0;desired.volumes[0].values.open_courtyard_m2=0;desired.volumes[0].values.commercial_ground_m2=0;desired.volumes[0].values.ground_services_m2=0;desired.volumes[0].values.units_per_level=0;
 assert.throws(()=>f.store.writePlan(f.ctx,desired),/shared_allocation_requires_reconciliation/);
});

test('allocation formula manifest and explicit stored policy cannot disappear silently',()=>{
 const f=fixture();delete f.desired.shared_allocation_mode;
 assert.throws(()=>f.store.writePlan(f.ctx,f.desired),/invalid_payload/);
 const next=fixture();next.allocation.formulas[1]=Array(19).fill('');next.allocation.formulas[1][1]='=2';
 assert.throws(()=>next.store.writePlan(next.ctx,next.desired),/native_formula_manifest_changed/);
 assert.equal(next.atomic.length,0);
});

test('all-zero native geometry fails before any atomic call while a zero body can coexist with a valid body',()=>{
 const f=fixture(),zero=row=>{for(const id of ['footprint_m2','open_courtyard_m2','units_per_level','private_area_per_unit_m2','commercial_ground_m2','ground_services_m2','basement_area_m2'])row.values[id]=0;};
 const all=clone(f.desired);all.volumes.forEach(zero);assert.throws(()=>f.store.validateWrite(f.ctx,f.native,all),/native_geometry_conflict/);assert.equal(f.atomic.length,0);
 const partial=clone(f.desired);zero(partial.volumes[0]);assert.equal(f.store.writePlan(f.ctx,partial).length,9);assert.equal(f.atomic.length,0);
});
