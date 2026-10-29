'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const sandbox = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'server', 'PPPStages.gs'), 'utf8'), sandbox, { filename: 'PPPStages.gs' });
const api = sandbox.PPPStages;
const copy = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const plan = (count = 1, duration = 12, start = 5) => ({
  schema: 1, count, duration_months: duration, mode: 'sequential', allocation: 'preserve',
  // Synthetic native readback only. The service must not rebuild this calendar
  // from month one, infer financial allocations, or change physical bodies.
  stages: Array.from({ length: count }, (_, i) => ({ id: 'native-stage-' + (i + 1), order: i + 1, start_month: start + i * duration, duration_months: duration, end_month: start + (i + 1) * duration - 1 }))
});
class Sheet {
  constructor(name) { this.name = name; this.data = []; this.writes = 0; }
  getLastRow() { return this.data.length; }
  getSheetId() { return 501; }
  appendRow(row) { this.data.push(copy(row)); this.writes++; }
  getRange(row, column, height = 1, width = 1) {
    return {
      getValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => this.data[row + i - 1]?.[column + j - 1] ?? '')),
      setValues: values => { values.forEach((r, i) => { this.data[row + i - 1] ||= []; r.forEach((v, j) => { this.data[row + i - 1][column + j - 1] = v; }); }); this.writes++; }
    };
  }
}
function fixture() {
  const sheets = new Map(), native = { a: plan(), b: plan(2, 8, 2) };
  const volumes = { a: { schema: 2, count: 2, volumes: [{ id: 'body-a', footprint_m2: 120 }, { id: 'body-b', footprint_m2: 80 }] } };
  const f = { native, volumes, actor: 'owner@example.invalid', authorized: true, writable: true, caseId: 'case-a', type: 'VERTICAL', scenarios: ['a', 'b'], revision: 'r1', writes: 0, attempts: 0, flushes: 0, audits: [], protectionCalls: 0, markers: [], checks: Object.fromEntries(copy(api.checkIds).map(key => [key, true])), cap: { read: true, write: true, max_stages: 8, max_months: 120 } };
  const ss = { getSheetByName: name => sheets.get(name), insertSheet: name => { const sheet = new Sheet(name); sheets.set(name, sheet); return sheet; } };
  const host = {
    authorize() { return f.authorized ? { ss, actor: f.actor, caso_id: f.caseId, type: f.type, scenarios: f.scenarios, can_write: f.writable } : null; },
    revision: () => f.revision,
    readModel: () => ({ ok: true, caso_id: f.modelCase || f.caseId, revision: f.modelRevision || f.revision, activo: 'a', volumes_by_scenario: copy(volumes) }),
    readPlan: (ctx, id) => native[id] ? copy(native[id]) : null,
    capability: () => copy(f.cap),
    validateWrite(ctx, before, desired) {
      if (f.preflightCode) { const error = new Error(f.preflightCode); error.code = f.preflightCode; throw error; }
      if (f.validateFalse) return false;
      assert.equal(before.stages[0].id, 'native-stage-1');
      assert.deepEqual(Object.keys(desired).sort(), ['allocation', 'count', 'duration_months', 'mode', 'schema']);
      return true;
    },
    writeDrivers(ctx, desired, marker) {
      f.attempts++; f.markers.push(copy(marker));
      const ledger = sheets.get('Etapas_Operaciones'), row = ledger?.data[marker.ledger_row - 1];
      assert.equal(marker.ledger_sheet_id, ledger.getSheetId());
      assert.deepEqual(row.slice(0, 4), [marker.request_id, ctx.caso_id, ctx.scenario_id, ctx.actor]);
      assert.equal(row[5], marker.payload_hash); assert.equal(row[6], 'pending');
      assert.equal(f.flushes > 0, true, 'reservation must flush before the first business write');
      if (f.definitelyRejected) { const error = new Error('authoritative Sheets rejection'); error.definitely_not_committed = true; throw error; }
      if (f.noCommit) throw Error('transport unavailable before commit; outcome unknown');
      f.writes++;
      native[ctx.scenario_id] = plan(desired.count, desired.duration_months, 5);
      if (f.partial) native[ctx.scenario_id] = plan(1, 12, 5);
      f.revision = 'r2';
      if (!f.omitMarker) row[6] = 'applied';
      if (f.throwAfterWrite) throw Error('response lost after atomic Sheets commit');
    },
    validateCalculation: () => copy(f.checks),
    withLock: fn => fn(), hash,
    audit: event => { if (!f.audits.some(previous => previous.action === event.action && previous.request_id === event.request_id)) f.audits.push(copy(event)); },
    protectLedger: () => { f.protectionCalls++; },
    flush: () => { f.flushes++; if (f.journalFails) throw Error('durable journal unavailable'); },
    now: () => '2026-10-29T05:00:00Z'
  };
  f.host = host; f.service = api.createService(host); f.sheets = sheets;
  f.request = (changes = {}) => ({ tipo_desarrollo: 'VERTICAL', caso_id: 'case-a', escenario_id: 'a', request_id: 'stage-request-1', revision_esperada: 'r1', stages: copy(api.project(plan(3, 12))), ...changes });
  return f;
}

test('stage plans remain separate from physical volumes and preserve exact native 3 by 12 calendar', () => {
  const f = fixture(), beforeVolumes = copy(f.volumes), otherScenario = copy(f.native.b), request = f.request();
  const result = copy(f.service.write(request));
  assert.equal(result.ok, true); assert.equal(f.writes, 1); assert.equal(f.protectionCalls, 1);
  assert.deepEqual(result.stage_receipt.stages, plan(3, 12, 5));
  assert.deepEqual(result.stage_receipt.stages, result.stages_by_scenario.a);
  assert.deepEqual(copy(api.project(result.stage_receipt.stages)), request.stages);
  assert.equal(result.stage_receipt.base_revision, 'r1'); assert.equal(result.stage_receipt.result_revision, 'r2');
  assert.equal(result.stage_receipt.calculated, true);
  assert.deepEqual(result.volumes_by_scenario, beforeVolumes); assert.deepEqual(f.volumes, beforeVolumes);
  assert.deepEqual(f.native.b, otherScenario); assert.equal(f.sheets.has('Volumenes_Operaciones'), false);
  assert.equal(f.audits.length, 1); assert.equal(f.audits[0].action, 'sheet-stages');
});

test('server authorizes the exact case, scenario, type and actor before reserving or writing', () => {
  for (const mutate of [f => { f.authorized = false; }, f => { f.writable = false; }, f => { f.caseId = 'foreign'; }, f => { f.type = 'MACROLOTES'; }, f => { f.type = 'UNKNOWN'; }, f => { f.scenarios = ['b']; }, f => { f.actor = ''; }]) {
    const f = fixture(); mutate(f);
    assert.equal(f.service.write(f.request()).error, 'access_denied');
    assert.equal(f.attempts, 0); assert.equal(f.sheets.size, 0);
  }
  for (const field of ['caso_id', 'escenario_id', 'request_id']) {
    const f = fixture(); assert.equal(f.service.write(f.request({ [field]: '../foreign' })).error, 'invalid_identity');
    assert.equal(f.attempts, 0); assert.equal(f.sheets.size, 0);
  }
  for (const type of ['VERTICAL', 'MACROLOTES', 'UNIFAMILIAR', 'RESIDENCIAL', 'PATRIMONIAL']) {
    const f = fixture(); f.type = type; assert.equal(f.service.read(f.request({ tipo_desarrollo: type })).ok, true);
  }
});

test('read-only users can inspect native stages but cannot acquire write capability', () => {
  const f = fixture(); f.writable = false;
  const result = copy(f.service.read(f.request()));
  assert.equal(result.capabilities.stages.read, true); assert.equal(result.capabilities.stages.write, false);
  assert.equal(f.service.write(f.request()).error, 'access_denied'); assert.equal(f.attempts, 0);
  delete f.native.a;
  const missing = f.service.read(f.request());
  assert.equal(missing.capabilities.stages.read, false); assert.equal(missing.capabilities.stages.write, false);
});

test('client cannot submit formulas, arbitrary ranges, calendars, equal allocations or volume collections', () => {
  for (const mutate of [p => { p.count = '=SUM(1,2)'; }, p => { p.duration_months = '12'; }, p => { p.range = 'A1:Z99'; }, p => { p.formula = '=IMPORTXML("x")'; }, p => { p.stages = plan(3).stages; }, p => { p.volumes = []; }, p => { p.allocation = 'equal'; }, p => { p.mode = 'parallel'; }, p => { p.count = 0; }, p => { p.duration_months = null; }]) {
    const f = fixture(), d = f.request(); mutate(d.stages);
    const result = f.service.write(d);
    assert.equal(result.ok, false); assert.match(result.error, /^invalid_stage_(payload|plan)$/);
    assert.equal(f.attempts, 0); assert.equal(f.sheets.size, 0);
  }
});

test('native calendar requires unique IDs, ordered consecutive months and complete integer durations', () => {
  for (const mutate of [p => { p.stages[1].id = p.stages[0].id; }, p => { p.stages[1].order = 1; }, p => { p.stages[1].start_month++; p.stages[1].end_month++; }, p => { p.stages[1].end_month--; }, p => { p.stages[1].duration_months = 11; }, p => { p.stages[0].start_month = 0; }, p => { p.stages.pop(); }]) {
    const p = plan(3); mutate(p); assert.throws(() => api.normalize(p, true), /invalid_native_stage_calendar/);
  }
});

test('revision conflicts create one durable prewrite rejection and never attempt native writes', () => {
  const f = fixture(), d = f.request({ revision_esperada: 'obsolete' });
  const result = copy(f.service.write(d)), proof = result.stage_rejection;
  assert.equal(result.error, 'operation_rejected'); assert.equal(result.stage_operation_status, 'rejected');
  assert.equal(proof.error, 'revision_conflict'); assert.equal(proof.stage, 'prewrite'); assert.equal(proof.write_attempted, false);
  assert.equal(proof.actor, f.actor); assert.equal(proof.base_revision, 'obsolete');
  assert.equal(proof.payload_hash, hash(api.stable({ actor: f.actor, caso_id: d.caso_id, escenario_id: d.escenario_id, base_revision: d.revision_esperada, stages: d.stages })));
  assert.deepEqual(copy(f.service.write(d).stage_rejection), proof); assert.deepEqual(copy(f.service.receipt(d).stage_rejection), proof);
  assert.equal(f.sheets.get('Etapas_Operaciones').data.length, 2); assert.equal(f.audits.length, 1); assert.equal(f.attempts, 0);
});

test('capability bounds and host formula/protection/distribution checks reject before driver writes', () => {
  const cases = [
    [f => { f.cap.read = false; f.cap.write = false; }, 'stage_binding_missing'],
    [f => { f.cap.write = false; }, 'stage_read_only'],
    [f => { f.cap.max_stages = 2; }, 'native_stage_horizon_conflict'],
    [f => { f.cap.max_months = 35; }, 'native_stage_horizon_conflict'],
    [f => { f.preflightCode = 'native_stage_formula_changed'; }, 'native_stage_formula_changed'],
    [f => { f.preflightCode = 'native_stage_protection_missing'; }, 'native_stage_protection_missing'],
    [f => { f.validateFalse = true; }, 'native_stage_distribution_unsupported']
  ];
  for (const [mutate, code] of cases) {
    const f = fixture(); mutate(f); const result = f.service.write(f.request());
    assert.equal(result.error, 'operation_rejected'); assert.equal(result.stage_rejection.error, code);
    assert.equal(result.stage_rejection.write_attempted, false); assert.equal(f.attempts, 0);
    assert.equal(f.sheets.get('Etapas_Operaciones').data[1][6], 'rejected');
  }
});

test('same request is idempotent while changed payload, actor or scenario cannot claim its receipt', () => {
  const f = fixture(), d = f.request(), first = copy(f.service.write(d).stage_receipt);
  assert.deepEqual(copy(f.service.write(d).stage_receipt), first); assert.equal(f.attempts, 1);
  assert.equal(f.service.write({ ...d, stages: { ...d.stages, duration_months: 13 } }).error, 'request_payload_mismatch');
  assert.equal(f.service.write({ ...d, escenario_id: 'b' }).error, 'request_context_mismatch');
  assert.equal(f.service.receipt({ ...d, escenario_id: 'b' }).error, 'request_context_mismatch');
  f.actor = 'another@example.invalid';
  assert.equal(f.service.write(d).error, 'request_actor_mismatch'); assert.equal(f.service.receipt(d).error, 'request_actor_mismatch');
  assert.equal(f.attempts, 1); assert.equal(f.audits.length, 1);
});

test('lost response preserves the pending request; receipt recovers the atomic marker without replay', () => {
  const f = fixture(), d = f.request(); f.throwAfterWrite = true;
  assert.equal(f.service.write(d).error, 'operation_pending');
  assert.equal(f.sheets.get('Etapas_Operaciones').data[1][6], 'applied');
  assert.equal(f.service.write(d).error, 'operation_pending'); assert.equal(f.attempts, 1);
  f.writable = false; // Receipt recovery needs read access, not fresh write permission.
  const result = copy(f.service.receipt(d));
  assert.equal(result.ok, true); assert.equal(result.stage_receipt.request_id, d.request_id);
  assert.equal(result.capabilities.stages.write, false); assert.equal(f.attempts, 1);
  assert.equal(f.sheets.get('Etapas_Operaciones').data[1][6], 'confirmed');
  assert.deepEqual(copy(f.service.receipt(d).stage_receipt), result.stage_receipt); assert.equal(f.audits.length, 1);
});

test('matching native values without an atomic operation marker never prove this request committed', () => {
  for (const noCommit of [true, false]) {
    const f = fixture(), d = f.request(); f.noCommit = noCommit; f.omitMarker = !noCommit;
    assert.equal(f.service.write(d).error, 'operation_pending');
    f.native.a = plan(3, 12); // Another operation can coincidentally leave equal inputs.
    assert.equal(f.service.receipt(d).error, 'operation_pending');
    assert.equal(f.service.write(d).error, 'operation_pending'); assert.equal(f.attempts, 1);
    assert.equal(f.sheets.get('Etapas_Operaciones').data[1][6], 'pending'); assert.equal(f.audits.length, 0);
  }
});

test('partial or invalid model readback remains unconfirmed and is never rolled back or replayed', () => {
  for (const mutate of [f => { f.partial = true; }, f => { f.modelRevision = 'foreign-revision'; }, f => { f.modelCase = 'foreign-case'; }]) {
    const f = fixture(), d = f.request(); mutate(f); const result = f.service.write(d);
    assert.equal(result.ok, false); assert.ok(['operation_pending', 'invalid_model_readback'].includes(result.error));
    assert.equal(f.sheets.get('Etapas_Operaciones').data[1][6], 'applied'); assert.equal(f.audits.length, 0);
    assert.equal(f.service.receipt(d).ok, false); assert.equal(f.service.write(d).error, 'operation_pending'); assert.equal(f.attempts, 1);
  }
});

test('authoritative atomic rejection records a rejection rather than pretending prewrite refusal', () => {
  const f = fixture(), d = f.request(); f.definitelyRejected = true;
  const result = copy(f.service.write(d));
  assert.equal(result.error, 'operation_rejected'); assert.equal(result.stage_rejection.stage, 'atomic_write');
  assert.equal(result.stage_rejection.write_attempted, true); assert.equal(result.stage_rejection.committed, false);
  assert.equal(result.stage_rejection.error, 'native_stage_write_rejected');
  assert.deepEqual(copy(f.service.receipt(d).stage_rejection), result.stage_rejection);
  assert.deepEqual(copy(f.service.write(d).stage_rejection), result.stage_rejection);
  assert.equal(f.attempts, 1); assert.equal(f.writes, 0);
});

test('superseded receipts preserve original evidence alongside the later native calendar', () => {
  const f = fixture(), d = f.request(), original = copy(f.service.write(d).stage_receipt);
  f.revision = 'r3'; f.native.a = plan(2, 15, 7);
  const result = copy(f.service.receipt(d));
  assert.equal(result.ok, true); assert.equal(result.stage_receipt_status, 'superseded'); assert.equal(result.revision, 'r3');
  assert.deepEqual(result.stage_receipt, original); assert.deepEqual(result.stages_by_scenario.a, plan(2, 15, 7));
  assert.equal(f.attempts, 1); assert.equal(f.audits.length, 1);
});

test('every consistency check must be true before the receipt may claim calculated', () => {
  for (const check of copy(api.checkIds)) {
    const f = fixture(); f.checks[check] = false; const result = f.service.write(f.request());
    assert.equal(result.ok, true); assert.equal(result.stage_receipt.calculated, false);
    assert.equal(result.stage_receipt.checks[check], false); assert.equal(f.sheets.get('Etapas_Operaciones').data[1][6], 'confirmed');
  }
  for (const mutate of [f => { delete f.checks.cash; }, f => { f.checks.cash = 1; }, f => { f.checks.unverified = true; }]) {
    const f = fixture(); mutate(f); const result = f.service.write(f.request());
    assert.equal(result.ok, false); assert.match(result.error, /^invalid_stage_(payload|checks)$/);
    assert.equal(f.sheets.get('Etapas_Operaciones').data[1][6], 'applied'); assert.equal(f.audits.length, 0);
  }
});

test('reservation flush failure prevents native writes, and missing receipt never creates a mutation', () => {
  const f = fixture(); f.journalFails = true;
  assert.equal(f.service.write(f.request()).error, 'operation_pending'); assert.equal(f.attempts, 0);
  const fresh = fixture(); assert.equal(fresh.service.receipt(fresh.request()).error, 'receipt_not_found');
  assert.equal(fresh.attempts, 0); assert.equal(fresh.sheets.size, 0);
});

test('changed ledger context or duplicate operation rows cannot become confirmed evidence', () => {
  const f = fixture(), d = f.request(); f.throwAfterWrite = true; f.service.write(d);
  const ledger = f.sheets.get('Etapas_Operaciones'); ledger.data[1][1] = 'foreign-case';
  assert.equal(f.service.receipt(d).error, 'request_context_mismatch'); assert.equal(f.audits.length, 0);
  ledger.data[1][1] = 'case-a'; ledger.data.push(copy(ledger.data[1]));
  assert.equal(f.service.receipt(d).error, 'duplicate_operation'); assert.equal(f.attempts, 1);
});
