'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ctx = vm.createContext({ console });
for (const file of ['PPPVolumes.gs', 'PPPVolumesFormulas.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'server', file), 'utf8'), ctx, { filename: file });
const { PPPVolumes: api, PPPVolumesFormulas: formulas } = ctx;
const json = value => JSON.parse(JSON.stringify(value));
const copy = json;
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function collection(count = 1, length = 3) {
  return { schema: 2, count, shared_allocation_mode: 'preserve', volumes: Array.from({ length }, (_, i) => ({ id: 'body-' + (i + 1), values: Object.fromEntries(json(api.fields()).map(f => [f.id, f.type === 'text' ? 'Edificio ' + (i + 1) : f.derived ? 400 + i : f.type === 'integer' ? 2 + i : 50 + i])) })) };
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; this.writes = 0; }
  getLastRow() { return this.data.length; }
  getSheetId() { return this.name === 'Volumenes_Operaciones' ? 101 : 102; }
  appendRow(row) { this.data.push(copy(row)); this.writes++; }
  getRange(row, col, height = 1, width = 1) {
    return {
      getValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => this.data[row - 1 + i]?.[col - 1 + j] ?? '')),
      setValues: values => { values.forEach((r, i) => { this.data[row - 1 + i] ||= []; r.forEach((v, j) => { this.data[row - 1 + i][col - 1 + j] = v; }); }); this.writes++; }
    };
  }
}
function fixture() {
  const sheets = new Map();
  const native = { a: collection(), b: collection(2, 3) };
  const f = { writes: 0, flushes: 0, audits: [], owner: false, authorized: true, writable: true, actor: 'verified@example.invalid', revision: 'r1', native, throwAfterWrite: false, partial: false, journalFails: false, calculationValid: true, modelRevision: null };
  const ss = { getSheetByName: name => sheets.get(name), insertSheet: name => { const sheet = new Sheet(name); sheets.set(name, sheet); return sheet; } };
  const host = {
    authorize(d) { return f.authorized ? { ss, actor: f.actor, caso_id: 'case-a', type: 'VERTICAL', scenarios: ['a', 'b'], can_write: f.writable, can_install: f.owner } : null; },
    revision: () => f.revision,
    readModel: () => ({ ok: true, caso_id: 'case-a', revision: f.modelRevision || f.revision, activo: 'a' }),
    readCollection: (c, id) => copy(native[id]),
    sharedResources: () => [{id:'shared-a',label:'Recurso compartido A'}],
    writeDrivers(c, desired, commit) {
      if (f.noCommit) throw new Error('request never reached Sheets');
      f.writes++;
      const original = native[c.scenario_id];
      native[c.scenario_id] = { schema: 2, count: desired.count, shared_allocation_mode: desired.shared_allocation_mode, volumes: desired.volumes.map((row, i) => ({ id: row.id, values: { ...copy(original.volumes[i]?.values || collection().volumes[0].values), ...copy(row.values) } })) };
      if (f.partial) native[c.scenario_id].volumes[0].values.name = 'Unfinished';
      // This double does not calculate money: it represents native recalculation
      // as a new sentinel in a read-only field, which must survive the receipt.
      native[c.scenario_id].volumes[0].values.direct_cost = 999;
      f.revision = 'r2';
      sheets.get('Volumenes_Operaciones').data[commit.ledger_row - 1][6] = 'applied';
      if (f.throwAfterWrite) throw new Error('simulated timeout after Sheets commit');
    },
    validateWrite: () => { if (f.preflightCode) { const error = new Error(f.preflightCode); error.code = f.preflightCode; throw error; } return true; },
    withLock: fn => fn(), hash,
    audit: event => f.audits.push(copy(event)),
    protectLedger: () => {},
    flush() { f.flushes++; if (f.journalFails) throw new Error('journal not durable'); },
    validateCalculation: () => f.calculationValid,
    now: () => '2026-10-20T00:00:00Z'
  };
  f.service = api.createService(host); f.host = host; f.sheets = sheets;
  f.request = (changes = {}) => ({ tipo_desarrollo: 'VERTICAL', caso_id: 'case-a', escenario_id: 'a', request_id: 'req-1', revision_esperada: 'r1', volumes: json(api.project(native.a)), ...changes });
  return f;
}

test('native schema has 14 writable drivers and seven protected derived fields', () => {
  const fields = json(api.fields());
  assert.equal(fields.length, 21);
  assert.equal(fields.filter(f => f.writable).length, 14);
  assert.equal(fields.find(f => f.id === 'units_per_level').type, 'number');
  assert.equal(fields.find(f => f.id === 'units_per_level').step, 0.000001);
  assert.deepEqual(fields.filter(f => f.derived).map(f => f.id), ['units', 'private_residential_area_m2', 'built_residential_area_m2', 'covered_ground_m2', 'gross_area_m2', 'direct_cost', 'construction_end_month']);
  const value = collection(); value.volumes[0].values.footprint_m2 = null;
  assert.equal(api.normalize(value, true).volumes[0].values.footprint_m2, null);
});

test('server accepts thirty bodies only for a scenario with a verified larger capacity', () => {
  const many=json(api.project(collection(30,30))), old=fixture(), rejected=old.service.write(old.request({volumes:many}));
  assert.equal(rejected.error,'invalid_collection');assert.equal(old.writes,0);assert.equal(old.sheets.has('Volumenes_Operaciones'),false);
  const extended=fixture();extended.host.capacity=(context,id)=>id==='a'?32:16;
  const result=extended.service.write(extended.request({volumes:many}));
  assert.equal(result.ok,true);assert.equal(result.capabilities.volumes.max_volumes,32);assert.equal(result.volume_receipt.volumes.count,30);
  assert.equal(extended.native.b.count,2);assert.equal(extended.writes,1);
});

test('allocation mode is explicit, durable and bound to the same operation payload', () => {
  const f = fixture(), missing = f.request(); delete missing.volumes.shared_allocation_mode;
  assert.equal(f.service.write(missing).error, 'invalid_payload');
  const invalid = f.request(); invalid.volumes.shared_allocation_mode = 'normalize';
  assert.equal(f.service.write(invalid).error, 'invalid_allocation_mode');
  assert.equal(f.writes, 0);
  const request = f.request(); request.volumes.shared_allocation_mode = 'built_area';
  const result = f.service.write(request);
  assert.equal(result.ok, true);
  assert.equal(result.volume_receipt.volumes.shared_allocation_mode, 'built_area');
  assert.equal(result.volumes_by_scenario.a.shared_allocation_mode, 'built_area');
  assert.equal(f.service.receipt(request).volume_receipt.volumes.shared_allocation_mode, 'built_area');
  const changed = copy(request); changed.volumes.shared_allocation_mode = 'preserve';
  assert.equal(f.service.write(changed).error, 'request_payload_mismatch');
  assert.equal(f.writes, 1);
});

test('capability lists authoritative shared resource labels without costs, formulas or arbitrary keys', () => {
  const f = fixture(), result = f.service.read(f.request());
  assert.deepEqual(json(result.capabilities.volumes.allocation_modes), ['preserve', 'built_area']);
  assert.deepEqual(json(result.capabilities.volumes.shared_resources), [{id:'shared-a',label:'Recurso compartido A'}]);
  f.host.sharedResources = () => [{id:'shared-a', label:'Shared', cost:12}];
  assert.equal(f.service.read(f.request()).error, 'invalid_payload');
  f.host.sharedResources = () => [{id:'shared-a',label:'Shared'},{id:'shared-a',label:'Other'}];
  assert.equal(f.service.read(f.request()).error, 'invalid_shared_resources');
});

test('client cannot send derived values, formula text, unknown fields or duplicate IDs', () => {
  const f = fixture(), d = f.request();
  d.volumes.volumes[0].values.units = 777;
  assert.equal(f.service.write(d).error, 'invalid_payload');
  const formula = f.request(); formula.volumes.volumes[0].values.name = '=IMPORTXML("x")';
  assert.equal(f.service.write(formula).error, 'invalid_text');
  const duplicate = f.request(); duplicate.volumes.volumes[1].id = duplicate.volumes.volumes[0].id;
  assert.equal(f.service.write(duplicate).error, 'duplicate_volume_id');
  const missing = f.request(); delete missing.volumes.volumes[0].values.basement_area_m2;
  assert.equal(f.service.write(missing).error, 'invalid_payload');
  assert.equal(f.writes, 0);
});

test('revision and server authorization are checked before any native driver write', () => {
  const f = fixture();
  const rejected = f.service.write(f.request({ revision_esperada: 'old' }));
  assert.equal(rejected.error, 'operation_rejected');
  assert.equal(rejected.volume_rejection.error, 'revision_conflict');
  f.authorized = false;
  assert.equal(f.service.write(f.request()).error, 'access_denied');
  f.authorized = true; f.writable = false;
  assert.equal(f.service.write(f.request()).error, 'access_denied');
  assert.equal(f.writes, 0); assert.equal(f.sheets.get('Volumenes_Operaciones').data[1][6], 'rejected');
});

test('receipt uses canonical derived readback, exact context and new revision', () => {
  const f = fixture(), d = f.request(); d.volumes.volumes[0].values.name = 'Nuevo';
  const result = json(f.service.write(d));
  assert.equal(result.ok, true);
  assert.equal(result.volume_receipt.calculated, true);
  assert.equal(result.volume_receipt.base_revision, 'r1');
  assert.equal(result.volume_receipt.result_revision, 'r2');
  assert.equal(result.volume_receipt.volumes.volumes[0].values.direct_cost, 999);
  assert.deepEqual(result.volume_receipt.volumes, result.volumes_by_scenario.a);
  assert.deepEqual(json(api.project(result.volume_receipt.volumes)), d.volumes);
  assert.equal(f.writes, 1); assert.equal(f.audits.length, 1);
  assert.equal(f.native.b.volumes[0].values.name, 'Edificio 1');
});

test('count toggles preserve inactive bodies and native drivers independently', () => {
  const f = fixture(), d = f.request(); d.volumes.count = 2;
  d.volumes.volumes[1].values.footprint_m2 = 155;
  const result = f.service.write(d);
  assert.equal(result.volume_receipt.volumes.count, 2);
  assert.equal(result.volume_receipt.volumes.volumes.length, 3);
  assert.equal(result.volume_receipt.volumes.volumes[1].values.footprint_m2, 155);
  assert.equal(result.volume_receipt.volumes.volumes[2].values.footprint_m2, 52);
});

test('stored identities cannot be dropped, replaced or reordered when reducing the count', () => {
  const f = fixture(), drop = f.request(); drop.volumes.volumes.pop();
  assert.equal(f.service.write(drop).volume_rejection.error, 'volume_identity_conflict');
  const reorder = f.request(); [reorder.volumes.volumes[0], reorder.volumes.volumes[1]] = [reorder.volumes.volumes[1], reorder.volumes.volumes[0]];
  reorder.request_id = 'reorder';
  assert.equal(f.service.write(reorder).volume_rejection.error, 'volume_identity_conflict');
  const replace = f.request(); replace.volumes.volumes[2].id = 'replacement';
  replace.request_id = 'replace';
  assert.equal(f.service.write(replace).volume_rejection.error, 'volume_identity_conflict');
  assert.equal(f.writes, 0);
});

test('authorized prewrite rejection is durable exact evidence without a pending reservation or business attempt', () => {
  const f = fixture(), d = f.request(); f.preflightCode = 'active_driver_missing';
  d.volumes.volumes[0].values.footprint_m2 = null;
  const result = json(f.service.write(d));
  assert.equal(result.error, 'operation_rejected'); assert.equal(f.writes, 0);
  const proof = result.volume_rejection;
  assert.deepEqual(Object.keys(proof).sort(), ['request_id', 'caso_id', 'escenario_id', 'base_revision', 'actor', 'payload_hash', 'stage', 'write_attempted', 'error', 'rejected_at'].sort());
  assert.equal(proof.stage, 'prewrite'); assert.equal(proof.write_attempted, false);
  assert.equal(proof.payload_hash, hash(api.stable({ actor: f.actor, caso_id: d.caso_id, escenario_id: d.escenario_id, base_revision: d.revision_esperada, volumes: d.volumes })));
  assert.deepEqual(json(f.service.receipt(d).volume_rejection), proof);
  assert.deepEqual(json(f.service.write(d).volume_rejection), proof);
  assert.equal(f.sheets.get('Volumenes_Operaciones').data[1][6], 'rejected');
});

test('native all-zero geometry rejection returns canonical prewrite evidence and never reserves a pending write', () => {
  const f = fixture(), request = f.request();
  request.volumes.volumes.forEach(row => { for (const id of ['footprint_m2','open_courtyard_m2','units_per_level','private_area_per_unit_m2','commercial_ground_m2','ground_services_m2','basement_area_m2']) row.values[id] = 0; });
  // The real native-store domain validator is exercised in Program tests. Here
  // its closed rejection is bound through the transport and durable GET proof.
  f.preflightCode = 'native_geometry_conflict';
  const response = json(f.service.write(request)), rows = f.sheets.get('Volumenes_Operaciones').data.slice(1);
  assert.equal(response.error, 'operation_rejected');
  assert.equal(response.volume_rejection.error, 'native_geometry_conflict');
  assert.equal(response.volume_rejection.write_attempted, false);
  assert.equal(response.volume_rejection.payload_hash, hash(api.stable({actor:f.actor,caso_id:request.caso_id,escenario_id:request.escenario_id,base_revision:request.revision_esperada,volumes:request.volumes})));
  assert.equal(f.writes, 0); assert.equal(rows.length, 1);
  assert.ok(rows.every(row => row[6] === 'rejected'));
  assert.deepEqual(json(f.service.receipt(request).volume_rejection), response.volume_rejection);
});

test('same request and payload is durable; another payload or scenario cannot reuse it', () => {
  const f = fixture(), d = f.request();
  assert.equal(f.service.write(d).ok, true);
  assert.equal(f.service.write(d).ok, true); assert.equal(f.writes, 1);
  const changed = copy(d); changed.volumes.volumes[0].values.name = 'Different';
  assert.equal(f.service.write(changed).error, 'request_payload_mismatch');
  assert.equal(f.service.write({ ...d, escenario_id: 'b' }).error, 'request_context_mismatch');
  assert.equal(f.writes, 1);
});

test('timeout never writes again: repeated POST is pending; GET only reconciles', () => {
  const f = fixture(), d = f.request(); f.throwAfterWrite = true;
  assert.equal(f.service.write(d).error, 'operation_pending');
  assert.equal(f.service.write(d).error, 'operation_pending');
  assert.equal(f.writes, 1);
  const result = f.service.receipt(d);
  assert.equal(result.ok, true); assert.equal(result.volume_receipt.request_id, 'req-1');
  assert.equal(f.writes, 1);
});

test('another authorized actor cannot claim or replay a durable request', () => {
  const f = fixture(), d = f.request();
  assert.equal(f.service.write(d).ok, true); f.actor = 'second@example.invalid';
  assert.equal(f.service.write(d).error, 'request_actor_mismatch');
  assert.equal(f.service.receipt(d).error, 'request_actor_mismatch');
  assert.equal(f.writes, 1);
});

test('a durable confirmed receipt survives a later revision without replay or false current success', () => {
  const f = fixture(), d = f.request();
  const original = json(f.service.write(d).volume_receipt);
  f.revision = 'r3'; f.native.a.volumes[0].values.name = 'Later editor';
  const result = json(f.service.receipt(d));
  assert.equal(result.ok, true); assert.equal(result.volume_receipt_status, 'superseded');
  assert.deepEqual(result.volume_receipt, original);
  assert.equal(result.revision, 'r3');
  assert.equal(result.volumes_by_scenario.a.volumes[0].values.name, 'Later editor');
  assert.equal(f.writes, 1);
});

test('partial/foreign readback stays uncertain and never confirms or rolls back', () => {
  const f = fixture(), d = f.request(); f.partial = true;
  assert.equal(f.service.write(d).error, 'operation_pending');
  assert.equal(f.service.receipt(d).error, 'operation_pending');
  assert.equal(f.writes, 1); assert.equal(f.audits.length, 0);
  assert.equal(f.service.receipt({ ...d, escenario_id: 'b' }).error, 'request_context_mismatch');
  assert.equal(f.service.receipt({ ...d, caso_id: 'case-b' }).error, 'access_denied');
});

test('identical values written elsewhere do not prove that a pending request committed', () => {
  const f = fixture(), d = f.request(); f.noCommit = true;
  assert.equal(f.service.write(d).error, 'operation_pending');
  // Some other action happened to leave exactly these quantities behind.
  f.native.a = collection();
  assert.deepEqual(json(api.project(f.native.a)), d.volumes);
  assert.equal(f.service.receipt(d).error, 'operation_pending');
  assert.equal(f.audits.length, 0);
});

test('journal flush failure prevents all business writes', () => {
  const f = fixture(); f.journalFails = true;
  assert.equal(f.service.write(f.request()).error, 'operation_pending');
  assert.equal(f.writes, 0);
});

test('invalid model readback cannot make a durable confirmed receipt', () => {
  const f = fixture(); f.modelRevision = 'foreign-revision';
  assert.equal(f.service.write(f.request()).error, 'revision_changed');
  const ledger = f.sheets.get('Volumenes_Operaciones');
  assert.equal(ledger.data[1][6], 'applied'); assert.equal(f.audits.length, 0);
});

test('calculated flag requires formula and parity validator rather than stored label', () => {
  const f = fixture(); f.calculationValid = false;
  const result = f.service.write(f.request());
  assert.equal(result.ok, true); assert.equal(result.volume_receipt.calculated, false);
});

test('owner installation requires reservation, provenance, base revision and formula fingerprint', () => {
  const f = fixture(), d = f.request();
  assert.equal(f.service.install(d, {}).error, 'owner_required');
  f.owner = true;
  assert.equal(f.service.install(d, {}).error, 'invalid_install_manifest');
  assert.equal(f.writes, 0);
});

function formulaConfig(limit = 16) {
  const keys = ['hard', 'price_residential', 'presale_effective', 'downpayment', 'construction_payment', 'land_cash', 'land_closing', 'indirect', 'legal', 'contingency', 'commission', 'units', 'residential_sellable', 'build_finish', 'total_months', 'presale_discount', 'commercial_revenue', 'parking_revenue', 'delivery_months_global', 'commission_total', 'sales_total', 'contingency_total'];
  return { program_name: 'Program_A', scenario_name: 'Scenario_A', first_row: 7, max_volumes: limit, count_ref: "'Program_A'!$B$2", allocation_mode_ref: "'Index_A'!$K$2", rate_above_ref: "'Scenario_A'!$B$59", rate_basement_ref: "'Scenario_A'!$B$60", metric_cells: Object.fromEntries(keys.map((key, i) => [key, "'Scenario_A'!$G$" + (100 + i)])), months: 2, program_valid_ref: 'B30', inventory_units_ref: "'Scenario_A'!$B$81", resources: [{ cost_ref: "'Shared_A'!$B$2", allocation_refs: Array.from({ length: limit }, (_, i) => "'Shared_A'!$C$" + (i + 2)) }], relocation: { total_ref: "'Shared_A'!$B$22", start_ref: "'Shared_A'!$B$23", end_ref: "'Shared_A'!$B$24" } };
}
test('formula plan covers thirty-two bodies without truncating monthly flows',()=>{
 const plan=json(formulas.build(formulaConfig(32)));
 const derived=new Set(['F','H','I','L','M','O','R']);const body=plan.patches.filter(p=>p.sheet==='Program_A'&&derived.has(p.range.replace(/\d/g,''))&&Number(p.range.replace(/\D/g,''))>=7&&Number(p.range.replace(/\D/g,''))<=38);
 assert.equal(body.length,32*7);assert.ok(body.some(p=>p.range==='R38'));
 const revenue=plan.patches.find(p=>p.sheet==='Scenario_A'&&p.range==='L8').formula;
 assert.match(revenue,/\$H\$38/);assert.ok(plan.patches.every(p=>p.formula.length<50000));
 assert.throws(()=>formulas.build(formulaConfig(33)),/program_dimensions/);
});

test('formula planner spans every native body and does not overwrite the fourteen input drivers', () => {
  const plan = json(formulas.build(formulaConfig()));
  const derivedColumns = new Set(['F', 'H', 'I', 'L', 'M', 'O', 'R']);
  const body = plan.patches.filter(p => p.sheet === 'Program_A' && Number(p.range.replace(/\D/g, '')) >= 7 && Number(p.range.replace(/\D/g, '')) <= 22);
  assert.equal(body.length, 16 * 7);
  assert.ok(body.every(p => derivedColumns.has(p.range.replace(/\d/g, ''))));
  assert.ok(body.some(p => p.range === 'R22'));
  assert.ok(plan.patches.every(p => p.formula.startsWith('=')));
  assert.ok(plan.patches.every(p => { const at = formulas.cellAddress(p.range); return at.row > 0 && at.column > 0; }));
  assert.deepEqual(json(formulas.cellAddress('$G$234')), { row: 234, column: 7 });
  assert.throws(() => formulas.cellAddress('G8:G235'), /native_formula_patch_range/);
  assert.ok(plan.patches.find(p => p.sheet === 'Program_A' && p.range === 'F7').formula.includes('ROUND(D7*E7,0)'));
});

test('shared allocations are explicit, checked rather than normalized, and land appears once in monthly cash uses', () => {
  const plan = json(formulas.build(formulaConfig(3)));
  const valid = plan.patches.find(p => p.sheet === 'Program_A' && p.range === 'B30').formula;
  assert.match(valid, /ABS\(\(.*\)-1\)<1\/1000000000/);
  assert.match(valid, /SUM\('Program_A'!\$F\$7:\$F\$9\)='Scenario_A'!\$B\$81/);
  const cost = plan.patches.find(p => p.sheet === 'Scenario_A' && p.range === 'M8').formula;
  assert.equal(cost.split("'Scenario_A'!$G$105").length - 1, 1); // land cash
  assert.equal(cost.split("'Shared_A'!$B$22/(").length - 1, 1); // relocation cash
  assert.ok(!/\/3\b/.test(valid));
  assert.ok(plan.patches.find(p => p.range === '$G$114').formula.includes("'Shared_A'!$B$24-1"));
});

test('native shared-cost policy uses active above-grade area with explicit mode and preserves raw allocation references', () => {
  const config = formulaConfig(16), plan = json(formulas.build(config));
  for (let row = 7; row <= 22; row++) {
    const cost = plan.patches.find(p => p.sheet === 'Program_A' && p.range === 'O' + row).formula;
    const expected = `'Shared_A'!$B$2*IF('Index_A'!$K$2="built_area",IFERROR(M${row}/SUM('Program_A'!$M$7:$M$22),0),'Shared_A'!$C$${row - 5})`;
    assert.ok(cost.includes(expected));
    assert.equal(cost.split("'Shared_A'!$B$2").length - 1, 1);
    assert.ok(cost.includes('IF(NOT((' + (row - 6) + "<='Program_A'!$B$2)),0,"));
  }
  assert.ok(plan.patches.every(p => p.sheet !== 'Shared_A' && p.sheet !== 'Index_A'));
  const valid = plan.patches.find(p => p.range === 'B30').formula;
  assert.ok(valid.includes(`IF('Index_A'!$K$2="built_area",SUM('Program_A'!$M$7:$M$22)>0,ABS(`));
  assert.ok(valid.includes(`OR('Index_A'!$K$2="preserve",'Index_A'!$K$2="built_area")`));
  delete config.allocation_mode_ref;
  assert.throws(() => formulas.build(config), /allocation_mode_reference_required/);
});

test('one-body template and later scenarios use their own native references; locale keeps no decimal ambiguity', () => {
  const config = formulaConfig(1); config.separator = ';';
  const plan = json(formulas.build(config));
  const revenue = plan.patches.find(p => p.range === 'L8' && p.sheet === 'Scenario_A').formula;
  assert.match(revenue, /\$H\$7/); assert.ok(!revenue.includes('$H$8'));
  assert.ok(revenue.includes(';')); assert.ok(!revenue.includes('0.5'));
  const other = formulaConfig(1); other.program_name = 'Program_B';
  other.count_ref = "'Program_B'!$B$2";
  const later = json(formulas.build(other));
  assert.ok(later.patches.filter(p => p.sheet === 'Scenario_A').every(p => !p.formula.includes("'Program_A'!")));
});

test('native revenue includes the discount and common commercial/parking once; cash uses honor canonical total overrides', () => {
  const plan = json(formulas.build(formulaConfig(3)));
  const revenue = plan.patches.find(p => p.sheet === 'Scenario_A' && p.range === 'L8').formula;
  assert.ok(revenue.includes("(1-'Scenario_A'!$G$115)"));
  assert.equal(revenue.split("'Scenario_A'!$G$116").length - 1, 1);
  assert.equal(revenue.split("'Scenario_A'!$G$117").length - 1, 1);
  const costs = plan.patches.find(p => p.sheet === 'Scenario_A' && p.range === 'M8').formula;
  assert.ok(costs.includes("L8*'Scenario_A'!$G$119/'Scenario_A'!$G$120"));
  assert.equal(costs.split("'Scenario_A'!$G$121").length - 1, 3);
  assert.ok(!plan.patches.some(p => p.sheet === 'Scenario_A' && /^(N|O|P|Q|R|S|T|U|V|W|X|Y|Z|AA|AB|AC|AD|AE|AF|AG|AH|AI)\d+$/.test(p.range)));
});
