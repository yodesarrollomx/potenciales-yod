'use strict';
// Independent store-contract tests with synthetic native readbacks. These tests
// do not execute Google Sheets or claim that the financial formulas recalculate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const sandbox = vm.createContext({});
for (const name of ['PPPStages.gs', 'PPPStagesProgram.gs', 'PPPVolumes.gs', 'PPPVolumesProgram.gs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'server', name), 'utf8'), sandbox, { filename: name });
}
const { PPPStages, PPPStagesProgram } = sandbox;
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const spec = (count = 3, duration = 12) => ({ schema: 1, count, duration_months: duration, mode: 'sequential', allocation: 'preserve' });

class Sheet {
  constructor(name, id) { this.name = name; this.id = id; this.data = []; this.formulas = []; this.writes = 0; }
  getName() { return this.name; }
  getSheetId() { return this.id; }
  getLastRow() { return Math.max(this.data.length, this.formulas.length); }
  put(row, column, value, formula = false) {
    const target = formula ? this.formulas : this.data;
    target[row - 1] ||= [];
    target[row - 1][column - 1] = value;
  }
  appendRow(row) { this.data.push(clone(row)); this.writes++; }
  getRange(row, column, height = 1, width = 1) {
    if (typeof row === 'string') {
      const match = /^([A-Z]+)(\d+)$/.exec(row);
      assert.ok(match, 'fixture accepts single-cell A1 addresses only');
      column = [...match[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      row = Number(match[2]);
    }
    const take = target => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => target[row + i - 1]?.[column + j - 1] ?? ''));
    return {
      getValues: () => take(this.data), getFormulas: () => take(this.formulas),
      getValue: () => take(this.data)[0][0], getFormula: () => take(this.formulas)[0][0],
      setValues: values => { this.writes++; values.forEach((r, i) => r.forEach((v, j) => this.put(row + i, column + j, v))); },
      setValue: value => { this.writes++; this.put(row, column, value); }
    };
  }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), 33); }
}

function fixture({ installed = true } = {}) {
  let nextId = 1;
  const sheets = new Map();
  const add = name => { const s = new Sheet(name, nextId++); sheets.set(name, s); return s; };
  const program = add('Program_A'), financial = add('Financial_A'), allocation = add('PA_scenario_a');
  const versions = add('Versiones'), volumesIndex = add('Volumenes_Indice');
  versions.data = [['id', 'name', 'base', 'order', 'sheet', 'status'], ['scenario-a', 'Synthetic', true, 1, 'Financial_A', 'ACTIVO']];
  volumesIndex.data = [Array(11).fill('header'), ['scenario-a', 'Program_A', 'Financial_A', 2, 2, 16, 'native-schema2', 'ready', 'Original', '', 'preserve']];
  const source = { schema: 2, count: 2, volumes: [
    { id: 'body-a', values: { construction_start_month: 3, construction_duration_months: 12, construction_end_month: 14, sales_start_month: 1, presale_months: 6, delivery_months: 2 } },
    { id: 'body-b', values: { construction_start_month: 9, construction_duration_months: 6, construction_end_month: 14, sales_start_month: 7, presale_months: 3, delivery_months: 4 } }
  ] };
  source.volumes.forEach((v, i) => {
    const x = v.values;
    [x.construction_start_month, x.construction_duration_months, x.construction_end_month, x.sales_start_month, x.presale_months, x.delivery_months].forEach((value, j) => program.put(i + 7, j + 16, value));
  });
  program.put(1, 25, '=AND(TRUE)', true);
  financial.put(8, 12, '=SUM(1)', true);
  allocation.put(2, 2, '=1', true);
  // Synthetic metric names permit installer preflight; values are deliberately
  // absent, so this fixture cannot stand in for native financial reconciliation.
  ['units', 'resSell', 'sales', 'cashCost', 'cashReconciliation', 'horizonPass',
    'debtDraws', 'interest', 'cashInterest', 'feeDebt', 'debtRepayments', 'debt',
    'ownerDist', 'devDist', 'distributable', 'ownerCapitalReturn', 'ownerPrefPaid',
    'ownerResidual', 'devCapitalReturn', 'devPrefPaid', 'devResidual',
    'ownerTotalProceeds', 'ownerSaleProceeds'].forEach((key, i) => financial.put(i + 8, 6, key));
  const ss = { getSheetByName: name => sheets.get(name) || null, insertSheet: add, getId: () => 'synthetic-stage-book' };
  const calls = { atomic: [], protections: [], audit: [], flush: 0 };
  const protectionFailures = new Set();
  const hooks = {
    ss, hash, flush: () => { calls.flush++; },
    atomicWrite: (id, requests) => { calls.atomic.push({ id, requests: clone(requests) }); },
    isProtected: sheet => !!sheet && !protectionFailures.has(sheet.getName()),
    isOwner: () => true,
    protect: (sheet, editable) => calls.protections.push({ name: sheet.getName(), editable: clone(editable) }),
    protectProgram: (sheet, count, fields) => calls.protections.push({ name: sheet.getName(), count, fields: clone(fields) }),
    audit: value => calls.audit.push(clone(value)),
    volumeStore: () => ({ info: () => ({ row: 2, values: clone(volumesIndex.data[1]) }), writeCapable: () => true, validateCalculation: () => true, readCollection: () => clone(source) })
  };
  const ctx = { caso_id: 'synthetic-case', scenario_id: 'scenario-a', actor: 'synthetic-owner' };
  let index, stage;
  if (installed) {
    index = add('Etapas_Indice'); stage = add('Etapas_scenario_a');
    index.data = [clone(PPPStagesProgram.headers), ['scenario-a', stage.name, program.name, financial.name, 'ready', 'native-stages-v1', '', '', 2, 'install-synthetic']];
    stage.put(1, 2, 1); stage.put(2, 2, 12); stage.put(3, 2, 3); stage.put(4, 2, 12);
    [ 'stage-1', 1, 3, 12, 14 ].forEach((value, j) => stage.put(9, j + 1, value));
    stage.put(9, 3, '=$B$3', true); stage.put(9, 4, '=$B$2', true); stage.put(9, 5, '=C9+D9-1', true);
    source.volumes.forEach((v, i) => {
      const x = v.values;
      [v.id, x.construction_start_month, x.construction_duration_months, x.sales_start_month, x.presale_months, x.delivery_months].forEach((value, j) => stage.put(i + 37, j + 1, value));
    });
    PPPStages.checkIds.forEach((key, i) => { stage.put(i + 1, 6, key); stage.put(i + 1, 7, true); stage.put(i + 1, 7, '=TRUE()', true); });
  }
  const store = PPPStagesProgram.createStore(hooks);
  const fingerprint = () => {
    index.data[1][6] = hash(PPPStages.stable(store.formulaMaterial('scenario-a')));
    index.data[1][7] = hash(PPPStages.stable(stage.getRange(37, 1, 16, 6).getValues()));
  };
  if (installed) fingerprint();
  const manifest = () => ({ schema: 1, operation_id: 'install-synthetic', expected_formula_hash: hash(PPPStages.stable([program, financial, allocation].map(s => [s.name, s.getDataRange().getFormulas()]))), reference: 'Synthetic contract fixture', reason: 'Validate calendar binding', test: 'Independent contract test; no real Sheets calculations' });
  const operation = () => {
    const ledger = add('Etapas_Operaciones');
    const marker = { request_id: 'request-synthetic', actor: ctx.actor, payload_hash: 'a'.repeat(64), ledger_sheet_id: ledger.id, ledger_row: 2 };
    ledger.data = [Array(13).fill('header'), [marker.request_id, ctx.caso_id, ctx.scenario_id, ctx.actor, 'r1', marker.payload_hash, 'pending']];
    return { ledger, marker };
  };
  return { store, ctx, source, ss, sheets, stage, index, program, financial, allocation, versions, volumesIndex, hooks, calls, protectionFailures, fingerprint, manifest, operation };
}

test('stage store reads the observed inclusive calendar without inventing an origin or financial values', () => {
  const f = fixture();
  assert.deepEqual(clone(f.store.readPlan(f.ctx, 'scenario-a')), { ...spec(1), stages: [{ id: 'stage-1', order: 1, start_month: 3, duration_months: 12, end_month: 14 }] });
  assert.deepEqual(clone(f.store.capability(f.ctx)), { read: true, write: true, max_stages: 24, max_months: 120 });
  assert.equal(f.calls.atomic.length, 0);
});

test('unbound, archived, duplicate and foreign scenarios cannot borrow the stage program', () => {
  for (const mutate of [f => f.versions.data[1][4] = 'Foreign_Sheet', f => f.versions.data[1][5] = 'ARCHIVADO', f => f.versions.data.push(clone(f.versions.data[1])), f => f.index.data[1][4] = 'pending']) {
    const f = fixture(); mutate(f);
    assert.equal(f.store.readPlan(f.ctx, 'scenario-a'), null);
    assert.equal(f.store.capability(f.ctx).write, false);
    assert.equal(f.store.calendarOwned(f.ctx), false);
    assert.equal(f.calls.atomic.length, 0);
  }
  const f = fixture();
  assert.equal(f.store.readPlan(f.ctx, 'scenario-b'), null);
  f.index.data.push(clone(f.index.data[1]));
  assert.throws(() => f.store.readPlan(f.ctx, 'scenario-a'), /native_stage_template_mismatch/);
});

test('formula, baseline and protection changes fail closed before the atomic writer', () => {
  const mutations = [
    [f => f.program.put(1, 25, '=FALSE()', true), /native_stage_formula_changed/],
    [f => f.financial.put(8, 12, '=2', true), /native_stage_formula_changed/],
    [f => f.allocation.put(2, 2, '=2', true), /native_stage_formula_changed/],
    [f => f.stage.put(37, 2, 4), /native_stage_formula_changed/],
    [f => f.protectionFailures.add('Program_A'), /native_stage_protection_missing/],
    [f => { f.stage.put(1, 2, '=3', true); f.fingerprint(); }, /protected_native_stage_driver/],
    [f => { f.stage.put(6, 7, '', true); f.fingerprint(); }, /native_stage_formula_missing/]
  ];
  for (const [mutate, expected] of mutations) {
    const f = fixture(), before = f.store.readPlan(f.ctx, 'scenario-a'); mutate(f);
    assert.equal(f.store.capability(f.ctx).write, false);
    assert.throws(() => f.store.validateWrite(f.ctx, before, spec()), expected);
    assert.equal(f.calls.atomic.length, 0);
  }
});

test('horizon checks retain the observed start and longest delivery tail', () => {
  const f = fixture(), before = f.store.readPlan(f.ctx, 'scenario-a');
  assert.equal(f.store.validateWrite(f.ctx, before, spec()), true);
  assert.equal(f.store.validateWrite(f.ctx, before, spec(1, 114)), true); // month 3 + 114 - 1 + delivery 4 = 120
  assert.throws(() => f.store.validateWrite(f.ctx, before, spec(1, 115)), /native_stage_horizon_conflict/);
  assert.throws(() => f.store.validateWrite(f.ctx, { ...clone(before), count: 2 }, spec()), /invalid_native_stage_calendar|native_stage_template_mismatch/);
  assert.equal(f.calls.atomic.length, 0);
});

test('driver mutation and applied marker are one atomic batch bound to actor, case and scenario', () => {
  const f = fixture(), { ledger, marker } = f.operation();
  const beforeProgram = clone(f.program.data), beforeFinancial = clone(f.financial.data), beforeAllocation = clone(f.allocation.data);
  assert.throws(() => f.store.writePlan(f.ctx, spec()), /operation_marker_required/);
  for (const changed of [{ ...marker, actor: 'foreign' }, { ...marker, payload_hash: 'b'.repeat(64) }, { ...marker, request_id: 'foreign' }, { ...marker, ledger_sheet_id: -1 }, { ...marker, ledger_row: 1 }]) {
    assert.throws(() => f.store.writePlan(f.ctx, spec(), changed), /operation_marker_mismatch/);
  }
  assert.throws(() => f.store.writePlan({ ...f.ctx, caso_id: 'foreign' }, spec(), marker), /operation_marker_mismatch/);
  const plan = clone(f.store.writePlan(f.ctx, spec(), marker));
  assert.equal(plan.length, 2);
  assert.deepEqual(plan[0].updateCells.range, { sheetId: f.stage.id, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 2 });
  assert.deepEqual(plan[0].updateCells.rows.map(r => r.values[0].userEnteredValue), [{ numberValue: 3 }, { numberValue: 12 }]);
  assert.equal(plan[1].updateCells.range.sheetId, ledger.id);
  assert.equal(plan[1].updateCells.range.startColumnIndex, 6);
  assert.equal(plan[1].updateCells.rows[0].values[0].userEnteredValue.stringValue, 'applied');
  f.store.writeDrivers(f.ctx, spec(), marker);
  assert.equal(f.calls.atomic.length, 1);
  assert.deepEqual(f.calls.atomic[0], { id: 'synthetic-stage-book', requests: plan });
  assert.deepEqual(clone(f.program.data), beforeProgram); assert.deepEqual(clone(f.financial.data), beforeFinancial); assert.deepEqual(clone(f.allocation.data), beforeAllocation);
  assert.equal(f.stage.writes + ledger.writes, 0, 'no separate driver or marker writes before/after the batch');
});

test('atomic writer failure propagates without a second mutation or a fabricated result', () => {
  const f = fixture(), { ledger, marker } = f.operation(); let attempts = 0;
  f.hooks.atomicWrite = () => { attempts++; throw Error('synthetic atomic transport failure'); };
  const before = clone(f.stage.data);
  assert.throws(() => f.store.writeDrivers(f.ctx, spec(), marker), /synthetic atomic transport failure/);
  assert.equal(attempts, 1); assert.deepEqual(clone(f.stage.data), before);
  assert.equal(ledger.data[1][6], 'pending'); assert.equal(f.stage.writes, 0);
});

test('readback checks require literal booleans and expose integrity failure', () => {
  const f = fixture();
  assert.deepEqual(clone(f.store.validateCalculation(f.ctx)), Object.fromEntries(clone(PPPStages.checkIds).map(k => [k, true])));
  f.stage.put(6, 7, 'TRUE'); f.stage.put(7, 7, 1);
  const checks = f.store.validateCalculation(f.ctx);
  assert.equal(checks.debt, false); assert.equal(checks.distribution, false);
  f.program.put(1, 25, '=FALSE()', true);
  assert.equal(f.store.validateCalculation(f.ctx).formulas, false);
  assert.equal(f.calls.atomic.length, 0);
});

test('physical edits cannot replace stage-owned calendar drivers or add an unreviewed body', () => {
  const f = fixture();
  assert.equal(f.store.assertVolumeEdit(f.ctx, f.source, clone(f.source)), true);
  for (const field of clone(PPPStagesProgram.derivedCalendarFields)) {
    const desired = clone(f.source); desired.volumes[0].values[field]++;
    assert.throws(() => f.store.assertVolumeEdit(f.ctx, f.source, desired), /protected_native_stage_driver/);
  }
  const extra = clone(f.source); extra.volumes.push(clone(extra.volumes[0]));
  assert.throws(() => f.store.assertVolumeEdit(f.ctx, f.source, extra), /stage_volume_extension_requires_review/);
  assert.equal(f.calls.atomic.length, 0);
});

test('installation rejects wrong owner, incomplete manifest and changed source before structural writes', () => {
  for (const [mutate, expected] of [
    [f => { f.hooks.isOwner = () => false; }, /owner_required/],
    [f => { f.installManifest.reason = ''; }, /invalid_install_manifest/],
    [f => { f.program.put(1, 25, '=FALSE()', true); }, /native_stage_formula_changed/]
  ]) {
    const f = fixture({ installed: false }); f.installManifest = f.manifest(); mutate(f);
    assert.throws(() => f.store.installVertical(f.ctx, f.installManifest), expected);
    assert.equal(f.sheets.has('Etapas_Indice'), false); assert.equal(f.sheets.has('Etapas_scenario_a'), false);
    assert.equal(f.calls.atomic.length, 0);
  }
});

test('failed installation keeps a pending journal and does not auto-replay its structural batch', () => {
  const f = fixture({ installed: false }); const manifest = f.manifest(); let attempts = 0;
  f.hooks.atomicWrite = () => { attempts++; throw Error('synthetic failed installation batch'); };
  assert.throws(() => f.store.installVertical(f.ctx, manifest), /synthetic failed installation batch/);
  const index = f.sheets.get('Etapas_Indice');
  assert.equal(index.data[1][4], 'pending'); assert.equal(index.data[1][9], manifest.operation_id);
  assert.equal(f.store.capability(f.ctx).write, false); assert.equal(attempts, 1);
  assert.deepEqual(clone(f.store.installVertical(f.ctx, manifest)), { ok: false, already_installed: false, error: 'operation_pending' });
  assert.equal(attempts, 1);
  assert.throws(() => f.store.installVertical(f.ctx, { ...manifest, operation_id: 'another-install' }), /stage_install_conflict/);
});

function stageManagedVolumes() {
  const f = fixture(), { PPPVolumes, PPPVolumesProgram } = sandbox, fields = clone(PPPVolumes.fields());
  f.volumesIndex.data[0] = ['escenario_id', 'programa', 'escenario_hoja', 'cantidad_activa', 'filas_guardadas', 'capacidad', 'modelo_revision', 'estado', 'programa_fuente', 'formula_hash', 'shared_allocation_mode'];
  f.source.volumes.forEach((body, i) => {
    Object.assign(body.values, { name: 'Synthetic body ' + (i + 1), footprint_m2: 250, open_courtyard_m2: 10, residential_levels: 2, units_per_level: 2, units: 4, private_area_per_unit_m2: 50, private_residential_area_m2: 200, built_residential_area_m2: 480, commercial_ground_m2: 40, ground_services_m2: 10, covered_ground_m2: 50, gross_area_m2: 530, basement_area_m2: 100, direct_cost: 5000000 });
    fields.forEach((field, column) => f.program.put(i + 7, column + 1, body.values[field.id]));
    f.program.put(i + 7, 22, body.id);
  });
  for (let i = 0; i < 16; i++) {
    fields.forEach((field, column) => { if (field.derived) f.program.put(i + 7, column + 1, '=1', true); });
    for (const column of [16, 17, 19]) f.program.put(i + 7, column, "='Etapas_scenario_a'!$B$3", true);
  }
  f.program.put(6, 25, 0);
  f.allocation.data = [Array(19).fill('heading'), ['resource-synthetic', 'native', 0.5, 0.5, ...Array(14).fill(0), 'Synthetic shared resource']];
  f.source.shared_allocation_mode = 'preserve';
  f.fingerprint();
  f.volumesIndex.data[1][9] = hash(PPPVolumes.stable([f.program, f.financial, f.allocation].map(s => [s.name, s.getDataRange().getFormulas()])));
  const volumeStore = PPPVolumesProgram.createStore({ ...f.hooks, stages: () => f.store });
  return { ...f, volumeStore, desired: clone(PPPVolumes.project(f.source)) };
}

test('real volume store accepts geometry edits while its batch excludes all stage-owned calendar cells', () => {
  const f = stageManagedVolumes();
  f.desired.volumes[0].values.footprint_m2 = 300;
  const requests = clone(f.volumeStore.writePlan(f.ctx, f.desired));
  const destinations = requests.filter(r => r.updateCells.range.sheetId === f.program.id).map(r => r.updateCells);
  for (const update of destinations) {
    for (let column = update.range.startColumnIndex; column < update.range.endColumnIndex; column++) {
      assert.equal([15, 16, 18].includes(column), false, 'P, Q and S remain native formulas');
    }
  }
  assert.equal(destinations[0].rows[0].values[1].userEnteredValue.numberValue, 300);
  assert.ok(destinations.some(r => r.range.startColumnIndex === 19 && r.range.endColumnIndex === 21), 'presale/delivery remain editable');
  assert.equal(f.calls.atomic.length, 0, 'planning alone cannot write');
});

test('real volume store fails closed if a stage-owned formula is absent or its driver is changed', () => {
  const f = stageManagedVolumes();
  f.desired.volumes[0].values.construction_start_month++;
  assert.throws(() => f.volumeStore.writePlan(f.ctx, f.desired), /protected_native_driver/);
  const next = stageManagedVolumes(); next.program.put(7, 16, '', true); next.fingerprint();
  next.volumesIndex.data[1][9] = hash(sandbox.PPPVolumes.stable([next.program, next.financial, next.allocation].map(s => [s.name, s.getDataRange().getFormulas()])));
  assert.throws(() => next.volumeStore.writePlan(next.ctx, next.desired), /native_formula_missing/);
  assert.equal(f.calls.atomic.length + next.calls.atomic.length, 0);
});
