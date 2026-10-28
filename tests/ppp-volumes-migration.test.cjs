'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const context = vm.createContext({});
for (const name of ['PPPVolumes.gs', 'PPPVolumesFormulas.gs', 'PPPVolumesProgram.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'server', name), 'utf8'), context, { filename: name });
const { PPPVolumes, PPPVolumesProgram } = context;
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const column = value => [...value].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

// This double stores Sheets inputs and formula text. Native calculation outcomes
// are injected booleans; no financial formula or output is evaluated in Node.
class Sheet {
  constructor(book, name, values = [], formulas = []) { this.book = book; this.name = name; this.id = book.nextId++; this.values = clone(values).map(row => row || []); this.formulas = clone(formulas).map(row => row || []); this.protections = []; this.columns = 21; }
  getName() { return this.name; }
  getSheetId() { return this.id; }
  getLastRow() { return Math.max(this.values.length, this.formulas.length); }
  getMaxColumns() { return this.columns; }
  insertColumnsAfter(at, count) { this.columns += count; }
  insertRowsAfter(at, count) { this.values.splice(at, 0, ...Array.from({length:count}, () => [])); this.formulas.splice(at, 0, ...Array.from({length:count}, () => [])); }
  copyTo(book) { const sheet = new Sheet(book, this.name + '_copy_' + book.copies, this.values, this.formulas); sheet.columns = this.columns; book.sheets.set(sheet.name, sheet); book.copies++; return sheet; }
  setName(name) { assert.equal(this.book.sheets.has(name), false); this.book.sheets.delete(this.name); this.name = name; this.book.sheets.set(name, this); return this; }
  appendRow(values) { this.getRange(this.getLastRow() + 1, 1, 1, values.length).setValues([values]); }
  getRange(row, col, height = 1, width = 1) {
    if (typeof row === 'string') { const match = /^\$?([A-Z]+)\$?(\d+)$/.exec(row); assert.ok(match, row); col = column(match[1]); row = Number(match[2]); }
    const take = source => Array.from({length:height}, (_, i) => Array.from({length:width}, (_, j) => source[row + i - 1]?.[col + j - 1] ?? ''));
    const put = (source, matrix) => { matrix.forEach((r, i) => { source[row + i - 1] ||= []; r.forEach((v, j) => { source[row + i - 1][col + j - 1] = v; }); }); };
    return {
      getValues: () => take(this.values), getFormulas: () => take(this.formulas), getFormula: () => take(this.formulas)[0][0],
      getValue: () => { if (col === 25 && [1,2,5].includes(row) && take(this.formulas)[0][0]) return this.book.nativeSentinels['Y' + row]; return take(this.values)[0][0]; },
      setValues: matrix => { put(this.values, matrix); put(this.formulas, matrix.map(r => r.map(() => ''))); return this; },
      setFormulas: matrix => { put(this.formulas, matrix); return this; },
      setFormula: formula => { put(this.formulas, [[formula]]); return this; }
    };
  }
  getDataRange() { const width = Math.max(this.columns, ...this.values.map(r => r.length), ...this.formulas.map(r => r.length)); return this.getRange(1, 1, this.getLastRow() || 1, width); }
  protect() {
    const protection = { ranges:[], setDescription(){ return this; }, setUnprotectedRanges(ranges){ this.ranges = ranges; }, getEditors(){ return []; }, removeEditors(){}, canDomainEdit(){ return false; } };
    this.protections.push(protection); return protection;
  }
}
function fixture({count = 3, capacity = count, failParity = false} = {}) {
  const book = { sheets:new Map(), nextId:1, copies:0, nativeSentinels:{Y1:true,Y2:true,Y5:!failParity}, getId:()=>'synthetic-migration-book', getSheetByName(name){return this.sheets.get(name) || null;}, insertSheet(name){ const sheet = new Sheet(this, name); this.sheets.set(name, sheet); return sheet; } };
  const sourceProgram = book.insertSheet('Source_Program'), sourceScenario = book.insertSheet('Source_Scenario');
  sourceProgram.getRange(1,1).setValues([['Generic native program']]);
  const body = {name:'Body',footprint_m2:250,open_courtyard_m2:10,residential_levels:2,units_per_level:2,units:4,private_area_per_unit_m2:50,private_residential_area_m2:200,built_residential_area_m2:480,commercial_ground_m2:40,ground_services_m2:10,covered_ground_m2:50,gross_area_m2:530,basement_area_m2:100,direct_cost:500,construction_start_month:3,construction_duration_months:3,construction_end_month:5,sales_start_month:1,presale_months:6,delivery_months:2};
  const fields = clone(PPPVolumes.fields());
  for (let i = 0; i < count; i++) {
    sourceProgram.getRange(7+i,1,1,21).setValues([fields.map(field => field.id === 'name' ? 'Body ' + (i+1) : body[field.id])]);
    fields.forEach((field,j) => { if (field.derived) sourceProgram.getRange(7+i,j+1).setFormula('=1'); });
  }
  sourceProgram.getRange(7+capacity,2).setFormula('=SUM(F7:F' + (6+capacity) + ')');
  sourceProgram.getRange(9+capacity,2).setValues([[100]]);
  sourceScenario.getRange(2,2).setFormula("='Source_Program'!$B$" + (7+capacity));
  sourceScenario.getRange(21,2).setFormula("='Source_Program'!E7");
  const metrics = ['hard','p.preViv','preventaEfectiva','p.eng','p.obra','landCash','closing','indirect','legal','p.imp','p.comision','units','resSell','buildFinish','totalMonths','p.desc','comRev','parkingRev','p.delivery','commission','sales','cont','cashCost','cashReconciliation','horizonPass'];
  metrics.forEach((key,i) => { sourceScenario.getRange(i+8,6).setValues([[key]]); sourceScenario.getRange(i+8,7).setFormula('=1'); });
  sourceScenario.getRange(127,35).setFormula('=0');
  const events = [], atomic = [];
  const hooks = {ss:book,hash,isOwner:()=>true,flush:()=>{},audit:event=>events.push(clone(event)),atomicWrite(id,requests){ assert.equal(id,book.getId()); atomic.push(clone(requests)); for(const request of requests){ const update=request.updateCells; const sheet=[...book.sheets.values()].find(s=>s.id===update.range.sheetId); assert.ok(sheet); update.rows.forEach((row,i)=>row.values.forEach((entry,j)=>{ const v=entry.userEnteredValue; const range=sheet.getRange(update.range.startRowIndex+i+1,update.range.startColumnIndex+j+1); if(v?.formulaValue!==undefined)range.setFormula(v.formulaValue); else range.setValues([[v?.numberValue??v?.stringValue??'']]); })); }} };
  const store = PPPVolumesProgram.createStore(hooks), ctx = {caso_id:'synthetic-case',scenario_id:'synthetic-scenario',actor:'synthetic-owner'};
  const manifest = {operation_id:'install-test',model_revision:'generic-native-v2',reference:'synthetic-reference',reason:'test owner installer',test:'migration execution',max_volumes:16,expected_source_hash:hash(PPPVolumes.stable([sourceProgram.getDataRange().getFormulas(),sourceScenario.getDataRange().getFormulas()])),source_program:sourceProgram.name,source_scenario:sourceScenario.name,target_program:'Target_Program',target_scenario:'Target_Scenario',source_count:count,source_capacity:capacity,count,shared_allocation_mode:'preserve',mode:count===1?'new-single':'preserve-existing',resources:[{id:'shared-foundation',label:'Shared foundation',source_row:9+capacity,allocations:Array.from({length:count},()=>1/count)}],inventory_formula:"=SUM('Source_Scenario'!$B$81:$B$83)",inventory_area_formula:"='Source_Scenario'!$B$81*'Source_Scenario'!$B$15"};
  return {book,sourceProgram,sourceScenario,store,ctx,manifest,events,atomic};
}

test('owner migration executes capacity expansion, native planner and Y5 parity installation before becoming ready', () => {
  const f = fixture(), beforeSource = clone([f.sourceProgram.getDataRange().getValues(),f.sourceProgram.getDataRange().getFormulas(),f.sourceScenario.getDataRange().getFormulas()]);
  const result = clone(f.store.migrate(f.ctx,f.manifest));
  assert.equal(result.ok,true); assert.equal(result.installed,true); assert.equal(result.calculated,true);
  assert.equal(result.collection.count,3); assert.equal(result.collection.volumes.length,3); assert.equal(result.collection.shared_allocation_mode,'preserve');
  const program=f.book.getSheetByName('Target_Program'), scenario=f.book.getSheetByName('Target_Scenario'), allocation=f.book.getSheetByName('PA_synthetic_scenario');
  assert.match(program.getRange('Y5').getFormula(), /^=AND\(SUMPRODUCT\(IF\(/);
  assert.ok(program.getRange('Y5').getFormula().includes("'Source_Scenario'!G8:G235='Target_Scenario'!G8:G235"));
  assert.ok(program.getRange('Y5').getFormula().includes("'Source_Scenario'!J8:AI127='Target_Scenario'!J8:AI127"));
  assert.equal(program.getRange('B23').getFormula(),'=SUMIF($W$7:$W$22;TRUE;F7:F22)');
  assert.equal(scenario.getRange('B2').getFormula(),"='Target_Program'!$B$23");
  assert.ok(program.getRange('O22').getFormula().includes("'Volumenes_Indice'!$K$2=\"built_area\""));
  assert.ok(scenario.getRange('M127').getFormula().startsWith('='));
  assert.equal(allocation.getRange(2,19).getValue(),'Shared foundation');
  assert.equal(allocation.getRange(2,2).getValue(),"'Target_Program'!$B$25");
  assert.equal(program.protections[0].ranges.length,16*14);
  assert.equal(f.store.info(f.ctx.scenario_id).values[7],'ready');
  assert.ok(f.atomic.some(requests=>requests.length>470));
  assert.deepEqual([f.sourceProgram.getDataRange().getValues(),f.sourceProgram.getDataRange().getFormulas(),f.sourceScenario.getDataRange().getFormulas()],beforeSource);
  const calls=f.atomic.length,copies=f.book.copies;assert.equal(f.store.migrate(f.ctx,f.manifest).installed,false);assert.equal(f.atomic.length,calls);assert.equal(f.book.copies,copies);
});

test('one-body native factory with capacity already sixteen executes the same parity route without a row offset', () => {
  const f=fixture({count:1,capacity:16}),result=f.store.migrate(f.ctx,f.manifest);
  assert.equal(result.ok,true);assert.equal(result.collection.count,1);assert.equal(result.collection.volumes.length,1);
  assert.equal(f.book.getSheetByName('Target_Scenario').getRange('B2').getFormula(),"='Target_Program'!$B$23");
  assert.equal(f.book.getSheetByName('PA_synthetic_scenario').getRange(2,2).getValue(),"'Target_Program'!$B$25");
  assert.ok(f.book.getSheetByName('Target_Program').getRange('Y5').getFormula().includes('SUMPRODUCT'));
});

test('a separately authorized 32-body migration extends ranges and retains old source intact', () => {
  const f=fixture({count:1,capacity:16});
  f.sourceScenario.getRange(3,2).setFormula("=SUM('Source_Program'!$J$7:$J$22)");
  f.sourceProgram.getRange(1,27).setFormula("=SUM('External'!$F$7:$F$22)+COUNTIF(A7:A22;\"A7:A22\")");
  f.sourceProgram.getRange(2,27).setFormula("=OtherSource_Program!$F$7+\"'Source_Program'!$B$23\"");
  f.manifest.max_volumes=32;
  f.manifest.expected_source_hash=hash(PPPVolumes.stable([f.sourceProgram.getDataRange().getFormulas(),f.sourceScenario.getDataRange().getFormulas()]));
  const before=clone([f.sourceProgram.getDataRange().getFormulas(),f.sourceScenario.getDataRange().getFormulas()]);
  const result=f.store.migrate(f.ctx,f.manifest),program=f.book.getSheetByName('Target_Program'),scenario=f.book.getSheetByName('Target_Scenario'),allocation=f.book.getSheetByName('PA_synthetic_scenario');
  assert.equal(result.ok,true);assert.equal(f.store.info(f.ctx.scenario_id).values[5],32);
  assert.equal(program.getRange('B39').getFormula(),'=SUMIF($W$7:$W$38;TRUE;F7:F38)');
  assert.equal(scenario.getRange('B2').getFormula(),"='Target_Program'!$B$39");
  assert.equal(scenario.getRange('B3').getFormula(),"=SUM('Target_Program'!$J$7:$J$38)");
  assert.equal(scenario.getRange('B21').getFormula(),"=IF('Volumenes_Indice'!$D$2<=1;'Target_Program'!$E$7;IFERROR(SUM('Target_Program'!$F$7:$F$38)/MAX(FILTER('Target_Program'!$D$7:$D$38;'Target_Program'!$W$7:$W$38));0))");
  assert.equal(program.getRange('AA1').getFormula(),"=SUM('External'!$F$7:$F$22)+COUNTIF(A7:A38;\"A7:A22\")");
  assert.equal(program.getRange('AA2').getFormula(),"=OtherSource_Program!$F$7+\"'Source_Program'!$B$23\"");
  assert.ok(program.getRange('F38').getFormula().startsWith('='));
  assert.equal(allocation.getRange(2,35).getValue(),'Shared foundation');
  assert.equal(program.protections[0].ranges.length,32*14);
  assert.deepEqual([f.sourceProgram.getDataRange().getFormulas(),f.sourceScenario.getDataRange().getFormulas()],before);
});

test('a multi-body source needs a separate review before a 32-body migration', () => {
  const f=fixture({count:3,capacity:3});f.manifest.max_volumes=32;
  assert.throws(()=>f.store.migrate(f.ctx,f.manifest),/multi_body_expansion_requires_review/);
  assert.equal(f.book.copies,0);assert.equal(f.book.getSheetByName('Volumenes_Indice'),null);
});

test('native parity refusal leaves the owner migration non-writable and cannot be replayed as a second copy', () => {
  const f=fixture({failParity:true});assert.throws(()=>f.store.migrate(f.ctx,f.manifest),/native_baseline_validation_failed/);
  assert.equal(f.store.info(f.ctx.scenario_id).values[7],'validation_failed');
  assert.equal(f.store.readCollection(f.ctx,f.ctx.scenario_id),null);assert.equal(f.store.validateCalculation(f.ctx),false);
  const copies=f.book.copies;assert.throws(()=>f.store.migrate(f.ctx,f.manifest),/migration_pending/);assert.equal(f.book.copies,copies);
});
