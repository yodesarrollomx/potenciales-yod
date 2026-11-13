'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const sandbox = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'server', 'PPPIntake.gs'), 'utf8'), sandbox, { filename: 'PPPIntake.gs' });
const api = sandbox.PPPIntake;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const initialStages = () => ({ schema: 1, count: 1, duration_months: null, mode: 'sequential', allocation: 'preserve' });
const minimum = {
  vertical: { inTerreno: 2000, inCOS: 60 },
  macrolotes: { inFrente: 300, inFondo: 500, inM2Macro: 1200 },
  unifamiliar: { inSuperficie: 240, inNiveles: 2 },
  residencial: { inSuperficie: 10000, inM2Lote: 240 },
  patrimonial: { inTerrenoM2: 1000, inUnidades: 8 }
};

function request(type = 'vertical', overrides = {}) {
  return {
    tipo: 'sheet-intake', tipo_desarrollo: type, request_id: 'capture-request-1',
    intake: {
      schema: 'ppp-intake-v1', model_type: type, nombre_caso: 'Caso sintético',
      ubicacion: 'Ubicación sintética', fuente: 'Fuente de prueba',
      inputs: clone(minimum[type]), stages: initialStages()
    }, ...overrides
  };
}

// The fake host models durable reservations and atomic markers, not a financial
// calculator. Calendar rows stand in for a native Sheets readback only.
function fixture(type = 'vertical') {
  const f = {
    type, actor: 'actor-a', authorized: true, writable: true, sequence: 0,
    operations: new Map(), snapshots: new Map(), markers: new Map(), audits: [],
    createCalls: 0, writeCalls: 0, businessWrites: 0, reserves: 0, finishes: 0,
    reconciles: 0, locks: 0, identities: 0
  };
  function calendar(stages) {
    if (stages.duration_months === null) return null;
    return {
      ...clone(stages),
      stages: Array.from({ length: stages.count }, (_, i) => ({
        id: 'stage-' + (i + 1), order: i + 1,
        start_month: i * stages.duration_months + 1,
        duration_months: stages.duration_months,
        end_month: (i + 1) * stages.duration_months
      }))
    };
  }
  function apply(op, create) {
    assert.ok(f.operations.has(op.request_id), 'the operation must be reserved before any business write');
    assert.equal(f.operations.get(op.request_id).payload_hash, op.payload_hash);
    if (f.throwBeforeCommit) throw Error('transport failure; no authoritative commit result');
    const previous = f.snapshots.get(op.caso_id);
    if (!create) assert.ok(previous, 'an update cannot create a case');
    const capture = {
      caso_id: op.caso_id, model_type: op.model_type || op.type || type,
      intake: clone(op.after), revision: 'revision-' + (++f.sequence),
      model_status: 'MODELO_PENDIENTE', stage_plan: calendar(op.after.stages),
      stage_checks: { formulas: true, horizon: true }
    };
    if (f.partialReadback) capture.intake.nombre_caso = 'Otra captura';
    f.snapshots.set(op.caso_id, capture);
    f.businessWrites++;
    if (!f.omitMarker) {
      f.markers.set(op.request_id, {
        caso_id: op.caso_id, actor: op.actor, payload_hash: op.payload_hash,
        revision: capture.revision, snapshot: clone(capture)
      });
      const stored = f.operations.get(op.request_id); stored.state = 'applied';
    }
    if (f.throwAfterCommit) throw Error('response lost after native commit');
    return clone(capture);
  }
  const host = {
    authorize() { return f.authorized ? { actor: f.actor, type: f.type, can_write: f.writable } : null; },
    withLock(fn) { f.locks++; return fn(); }, hash,
    now: () => '2026-10-29T05:00:00Z',
    newCaseId() { return 'case-' + (++f.identities); },
    findOperation(id) { return clone(f.operations.get(id) || null); },
    reserveOperation(op) {
      assert.equal(f.operations.has(op.request_id), false, 'reservation cannot replace a prior request');
      if (f.reserveFailure) throw Error('journal unavailable');
      f.reserves++; f.operations.set(op.request_id, clone(op)); return clone(op);
    },
    createCapture(ctx, op) { f.createCalls++; return apply(op, true); },
    writeCapture(ctx, op) { f.writeCalls++; return apply(op, false); },
    readCapture(ctx, id) {
      const value = clone(f.snapshots.get(id) || null);
      if (value && f.badReadbackCase) value.caso_id = 'foreign-case';
      if (value && f.badReadbackType) value.model_type = 'macrolotes';
      return value;
    },
    reconcile(ctx, op) {
      f.reconciles++;
      const marker = f.markers.get(op.request_id);
      if (!marker || marker.caso_id !== op.caso_id || marker.actor !== ctx.actor || marker.payload_hash !== op.payload_hash) return null;
      return clone(marker.snapshot);
    },
    finishOperation(ctx, op, receipt) {
      if (f.finishFailure) throw Error('receipt journal unavailable');
      f.finishes++;
      const old = f.operations.get(op.request_id);
      old.state = 'confirmed'; old.receipt = clone(receipt);
    },
    audit(event) {
      if (!f.audits.some(old => old.request_id === event.request_id && old.action === event.action)) f.audits.push(clone(event));
    }
  };
  f.host = host; f.service = api.createService(host);
  f.create = (overrides = {}) => f.service.write(request(type, overrides));
  f.read = (id, requestId) => f.service.read({ tipo: type, tipo_desarrollo: type, id, caso_id: id, ...(requestId ? { request_id: requestId } : {}) });
  f.update = (result, intake, requestId = 'update-request-1', overrides = {}) => f.service.write({
    tipo: 'sheet-intake', tipo_desarrollo: type, caso_id: result.caso_id,
    revision_esperada: result.revision, request_id: requestId, intake, ...overrides
  });
  return f;
}

test('all five model types persist their own minimal capture without inventing financial inputs', () => {
  for (const type of Object.keys(minimum)) {
    const f = fixture(type), result = clone(f.create());
    assert.equal(result.ok, true, type); assert.equal(result.persisted, true);
    assert.equal(result.pending, true); assert.equal(result.calculated, false);
    assert.equal(result.model_status, 'MODELO_PENDIENTE');
    assert.equal(result.intake.model_type, type);
    assert.deepEqual(result.intake.stages, initialStages());
    assert.deepEqual(result.state.p, {}); assert.deepEqual(result.state.flows, []);
    assert.equal(result.state.sales, undefined); assert.equal(result.state.profit, undefined);
    for (const [field, value] of Object.entries(minimum[type])) assert.equal(result.intake.inputs[field], value);
    for (const [field, value] of Object.entries(result.intake.inputs)) if (!(field in minimum[type])) {
      const structural = ['macrolotes', 'residencial'].includes(type) && field === 'inEtapas';
      assert.equal(value, structural ? 1 : null, field);
    }
    assert.equal(f.createCalls, 1); assert.equal(f.businessWrites, 1);
  }
});

test('initial capture keeps one stage with unknown duration and no calculable timeline', () => {
  const f = fixture(), result = clone(f.create());
  assert.equal(result.intake.stages.count, 1);
  assert.equal(result.intake.stages.duration_months, null);
  assert.equal(f.snapshots.get(result.caso_id).stage_plan, null);
  assert.equal(result.calculated, false);
});

test('required minimum inputs are checked for every model before a reservation or workbook creation', () => {
  for (const type of Object.keys(minimum)) {
    const f = fixture(type), d = request(type); d.intake.inputs = {};
    assert.equal(f.service.write(d).ok, false, type);
    assert.equal(f.reserves, 0); assert.equal(f.createCalls, 0);
  }
});

test('formula strings, booleans, infinite quantities and out-of-range values never reach the host', () => {
  for (const value of ['=SUM(1,2)', '2000', true, Infinity, NaN, -1, 40001]) {
    const f = fixture(), d = request(); d.intake.inputs.inTerreno = value;
    assert.equal(f.service.write(d).ok, false, String(value));
    assert.equal(f.reserves, 0); assert.equal(f.createCalls, 0);
  }
});

test('fields from another model and arbitrary ranges or formulas are rejected', () => {
  for (const key of ['inTerrenoM2', 'A1', '__proto__', 'constructor', 'toString', 'formula']) {
    const f = fixture(), d = request();
    Object.defineProperty(d.intake.inputs, key, { value: 1000, enumerable: true });
    assert.equal(f.service.write(d).ok, false, key);
    assert.equal(f.createCalls, 0);
  }
  const f = fixture(), d = request(); d.intake.range = 'A1:Z99';
  assert.equal(f.service.write(d).ok, false); assert.equal(f.createCalls, 0);
});

test('metadata requires the name and location and respects bounded text', () => {
  for (const change of [{ nombre_caso: '' }, { ubicacion: '' }, { nombre_caso: 'x'.repeat(121) }, { ubicacion: 'x'.repeat(241) }, { fuente: 'x'.repeat(601) }]) {
    const f = fixture(), d = request(); Object.assign(d.intake, change);
    assert.equal(f.service.write(d).ok, false); assert.equal(f.reserves, 0);
  }
});

test('integer-only initial fields cannot persist fractional units or levels', () => {
  for (const [type, field] of [['unifamiliar', 'inNiveles'], ['patrimonial', 'inUnidades']]) {
    const f = fixture(type), d = request(type); d.intake.inputs[field] = 1.5;
    assert.equal(f.service.write(d).ok, false, type + ':' + field);
    assert.equal(f.reserves, 0); assert.equal(f.businessWrites, 0);
  }
});

test('the server authorizes actor, type and write privilege before reserving a case', () => {
  for (const mutate of [f => { f.authorized = false; }, f => { f.writable = false; }, f => { f.actor = ''; }, f => { f.type = 'macrolotes'; }]) {
    const f = fixture(); mutate(f);
    assert.equal(f.create().ok, false); assert.equal(f.reserves, 0); assert.equal(f.businessWrites, 0);
  }
});

test('unknown model types and mismatched intake model cannot fall back to vertical', () => {
  for (const change of [{ tipo_desarrollo: 'unknown' }, { tipo_desarrollo: 'macrolotes' }]) {
    const f = fixture(); assert.equal(f.create(change).ok, false); assert.equal(f.createCalls, 0);
  }
  const f = fixture(), d = request(); d.intake.model_type = 'patrimonial';
  assert.equal(f.service.write(d).ok, false); assert.equal(f.createCalls, 0);
});

test('the same creation request returns its receipt and never creates a second workbook', () => {
  const f = fixture(), a = clone(f.create()), b = clone(f.create());
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  assert.equal(b.caso_id, a.caso_id); assert.equal(b.request_id, a.request_id);
  assert.equal(f.createCalls, 1); assert.equal(f.businessWrites, 1); assert.equal(f.reserves, 1);
});

test('a request id cannot be reused for changed content or by another actor', () => {
  const f = fixture(), first = f.create(); assert.equal(first.ok, true);
  const changed = request(); changed.intake.nombre_caso = 'Contenido cambiado';
  assert.equal(f.service.write(changed).ok, false);
  f.actor = 'actor-b'; assert.equal(f.create().ok, false);
  assert.equal(f.createCalls, 1); assert.equal(f.businessWrites, 1);
});

test('an uncertain creation without an applied marker remains pending and is not retried', () => {
  const f = fixture(); f.throwBeforeCommit = true;
  const first = f.create(); assert.equal(first.ok, false);
  assert.notEqual(first.persisted, false, 'an attempted creation must not be declared definitely unwritten');
  f.throwBeforeCommit = false;
  assert.equal(f.create().ok, false); assert.equal(f.createCalls, 1);
  const op = f.operations.get('capture-request-1');
  assert.equal(f.read(op.caso_id, op.request_id).ok, false);
  assert.equal(f.createCalls, 1); assert.equal(f.businessWrites, 0);
});

test('lost creation response is recovered from the exact marker without another creation', () => {
  const f = fixture(); f.throwAfterCommit = true;
  const first = f.create(); assert.equal(first.ok, false); assert.notEqual(first.persisted, false);
  f.throwAfterCommit = false;
  const op = f.operations.get('capture-request-1'), recovered = clone(f.read(op.caso_id, op.request_id));
  assert.equal(recovered.ok, true); assert.equal(recovered.request_id, op.request_id);
  assert.equal(recovered.caso_id, op.caso_id); assert.equal(recovered.persisted, true);
  assert.equal(f.createCalls, 1); assert.equal(f.businessWrites, 1);
});

test('matching captured values without an operation marker do not confirm a write', () => {
  const f = fixture(); f.omitMarker = true;
  const first = f.create(); assert.equal(first.ok, false);
  const op = f.operations.get('capture-request-1');
  assert.equal(f.read(op.caso_id, op.request_id).ok, false);
  assert.equal(f.createCalls, 1); assert.equal(f.businessWrites, 1);
});

test('a marker cannot confirm a different actor, payload or case', () => {
  for (const [field, value] of [['actor', 'actor-other'], ['caso_id', 'case-other'], ['payload_hash', 'different-payload']]) {
    const f = fixture(); f.throwAfterCommit = true; f.create(); f.throwAfterCommit = false;
    const op = f.operations.get('capture-request-1'); f.markers.get(op.request_id)[field] = value;
    assert.equal(f.read(op.caso_id, op.request_id).ok, false, field);
    assert.equal(f.finishes, 0); assert.equal(f.createCalls, 1);
  }
});

test('partial readback cannot confirm a captured operation or discard its uncertainty', () => {
  const f = fixture(); f.partialReadback = true;
  const result = f.create();
  assert.equal(result.ok, false); assert.notEqual(result.persisted, false);
  assert.equal(f.finishes, 0); assert.equal(f.businessWrites, 1);
  assert.equal(f.create().ok, false); assert.equal(f.createCalls, 1);
});

test('an update changes only submitted inputs and retains explicit null instead of substituting zero', () => {
  const f = fixture(), created = f.create();
  const result = clone(f.update(created, { inputs: { inCOS: null } }));
  assert.equal(result.ok, true); assert.equal(result.intake.inputs.inCOS, null);
  assert.equal(result.intake.inputs.inTerreno, 2000);
  assert.equal(result.intake.nombre_caso, created.intake.nombre_caso);
  assert.equal(result.intake.ubicacion, created.intake.ubicacion);
  assert.equal(result.calculated, false); assert.notEqual(result.revision, created.revision);
});

test('autosave accepts explicit allowlisted board inputs beyond the minimal intake in every model', () => {
  const edits = {
    vertical: { inPreViv: 30000 }, macrolotes: { inCostoNave: 8000 },
    unifamiliar: { inRentaMes: 15000 }, residencial: { inUrbM2: 800 },
    patrimonial: { inRentaUnidadMes: 5000 }
  };
  for (const [type, inputs] of Object.entries(edits)) {
    const f = fixture(type), created = f.create();
    const saved = clone(f.update(created, { inputs }));
    assert.equal(saved.ok, true, type);
    for (const [field, value] of Object.entries(inputs)) assert.equal(saved.intake.inputs[field], value);
    assert.equal(saved.pending, true); assert.equal(saved.calculated, false);
    assert.deepEqual(saved.state.flows, []); assert.equal(f.writeCalls, 1);
  }
});

test('stale revisions and updates to another case cannot overwrite captured data', () => {
  const f = fixture(), created = f.create(), before = clone(f.snapshots.get(created.caso_id));
  assert.equal(f.update(created, { inputs: { inCOS: 70 } }, 'stale-request', { revision_esperada: 'stale' }).ok, false);
  assert.equal(f.update(created, { inputs: { inCOS: 70 } }, 'wrong-case-request', { caso_id: 'missing-case' }).ok, false);
  assert.deepEqual(f.snapshots.get(created.caso_id), before); assert.equal(f.writeCalls, 0);
});

test('a financial case already outside MODELO_PENDIENTE cannot be converted or overwritten by intake', () => {
  const f = fixture(), created = f.create();
  f.snapshots.get(created.caso_id).model_status = 'VIGENTE';
  const before = clone(f.snapshots.get(created.caso_id));
  assert.equal(f.update(created, { inputs: { inCOS: 70 } }).ok, false);
  assert.deepEqual(f.snapshots.get(created.caso_id), before); assert.equal(f.writeCalls, 0);
});

test('the same update is idempotent and an uncertain acknowledgement is recovered by GET', () => {
  const f = fixture(), created = f.create(); f.throwAfterCommit = true;
  const first = f.update(created, { inputs: { inCOS: 70 } });
  assert.equal(first.ok, false); assert.notEqual(first.persisted, false);
  f.throwAfterCommit = false;
  const read = clone(f.read(created.caso_id, 'update-request-1'));
  assert.equal(read.ok, true); assert.equal(read.intake.inputs.inCOS, 70);
  const retry = f.update(created, { inputs: { inCOS: 70 } });
  assert.equal(retry.ok, true); assert.equal(f.writeCalls, 1); assert.equal(f.businessWrites, 2);
});

test('read and receipt access remain bound to the current authorization and exact request context', () => {
  const f = fixture(), created = f.create();
  assert.equal(f.read('foreign-case', 'capture-request-1').ok, false);
  f.actor = 'actor-b'; assert.equal(f.read(created.caso_id, 'capture-request-1').ok, false);
  f.actor = 'actor-a'; f.authorized = false;
  assert.equal(f.read(created.caso_id).ok, false);
  assert.equal(f.businessWrites, 1);
});

test('ordinary read returns the saved capture without repeating a business write', () => {
  const f = fixture(), created = f.create();
  const read = clone(f.read(created.caso_id));
  assert.equal(read.ok, true); assert.equal(read.persisted, true);
  assert.deepEqual(read.intake, clone(created.intake)); assert.equal(read.revision, created.revision);
  assert.equal(f.createCalls, 1); assert.equal(f.writeCalls, 0);
});

test('a superseded receipt remains distinct from the currently saved capture', () => {
  const f = fixture(), created = clone(f.create());
  const updated = clone(f.update(created, { inputs: { inCOS: 70 } }));
  const oldReceipt = clone(f.read(created.caso_id, 'capture-request-1'));
  assert.equal(oldReceipt.ok, true); assert.equal(oldReceipt.revision, updated.revision);
  assert.equal(oldReceipt.intake.inputs.inCOS, 70);
  assert.equal(oldReceipt.intake_receipt_status, 'superseded');
  assert.equal(oldReceipt.intake_receipt.result_revision, created.revision);
  assert.equal(oldReceipt.intake_receipt.intake.inputs.inCOS, 60);
  assert.equal(f.businessWrites, 2);
});

test('read-only access never advertises capture or stage write capability', () => {
  const f = fixture(), created = f.create(); f.writable = false;
  const read = clone(f.read(created.caso_id));
  assert.equal(read.ok, true);
  assert.equal(read.capabilities.intake.write, false); assert.equal(read.capabilities.stages.write, false);
  assert.equal(f.update(created, { inputs: { inCOS: 70 } }).ok, false);
  assert.equal(f.writeCalls, 0);
});

test('a pending model can persist three successive twelve-month stages while financial checks stay pending', () => {
  for (const type of Object.keys(minimum)) {
    const f = fixture(type), created = f.create();
    const result = clone(f.service.writeStages({
      tipo_desarrollo: type, caso_id: created.caso_id, escenario_id: 'base',
      revision_esperada: created.revision, request_id: 'stages-request-1',
      stages: { schema: 1, count: 3, duration_months: 12, mode: 'sequential', allocation: 'preserve' }
    }));
    assert.equal(result.ok, true, type); assert.equal(result.stage_receipt.calculated, false);
    assert.deepEqual(result.stage_receipt.stages.stages.map(row => [row.start_month, row.end_month]), [[1, 12], [13, 24], [25, 36]]);
    assert.equal(result.stage_receipt.checks.inventory, false); assert.equal(result.stage_receipt.checks.cash, false);
    assert.equal(result.stage_receipt.checks.formulas, true); assert.equal(result.stage_receipt.checks.horizon, true);
    if (['macrolotes', 'residencial'].includes(type)) {
      assert.equal(result.intake.inputs.inEtapas, 3);
      assert.equal(result.intake.inputs.inMesesUrbEtapa, 12);
    }
    assert.equal(f.snapshots.get(created.caso_id).intake.inputs.inTerreno ?? null, created.intake.inputs.inTerreno ?? null);
    assert.equal(f.writeCalls, 1);
  }
});

test('stage commands reject unsupported allocation, fake dates, incomplete duration and stale context', () => {
  for (const change of [{ count: 0 }, { duration_months: null }, { allocation: 'equal' }, { mode: 'parallel' }, { start_date: '2026-01-01' }, { duration_months: '=12' }]) {
    const f = fixture(), created = f.create();
    const result = f.service.writeStages({ tipo_desarrollo: 'vertical', caso_id: created.caso_id, escenario_id: 'base', revision_esperada: created.revision, request_id: 'stages-request-1', stages: { schema: 1, count: 3, duration_months: 12, mode: 'sequential', allocation: 'preserve', ...change } });
    assert.equal(result.ok, false); assert.equal(f.writeCalls, 0);
  }
});

test('stage command recovery uses the original operation and never repeats the stage write', () => {
  const f = fixture(), created = f.create(), command = {
    tipo_desarrollo: 'vertical', caso_id: created.caso_id, escenario_id: 'base',
    revision_esperada: created.revision, request_id: 'stages-request-1',
    stages: { schema: 1, count: 3, duration_months: 12, mode: 'sequential', allocation: 'preserve' }
  };
  f.throwAfterCommit = true; assert.equal(f.service.writeStages(command).ok, false);
  f.throwAfterCommit = false;
  const result = clone(f.service.readStages(command));
  assert.equal(result.ok, true); assert.equal(result.stage_receipt.request_id, command.request_id);
  assert.equal(result.stage_receipt.calculated, false); assert.equal(f.writeCalls, 1);
  assert.equal(f.service.writeStages(command).ok, true); assert.equal(f.writeCalls, 1);
});

test('stage receipt reads and writes cannot change scenario or reuse a stale revision', () => {
  const f = fixture(), created = f.create(), command = {
    tipo_desarrollo: 'vertical', caso_id: created.caso_id, escenario_id: 'base',
    revision_esperada: created.revision, request_id: 'stages-request-1',
    stages: { schema: 1, count: 3, duration_months: 12, mode: 'sequential', allocation: 'preserve' }
  };
  assert.equal(f.service.writeStages({ ...command, escenario_id: 'foreign' }).ok, false);
  assert.equal(f.service.writeStages({ ...command, revision_esperada: 'stale' }).ok, false);
  assert.equal(f.writeCalls, 0);
  assert.equal(f.service.writeStages(command).ok, true);
  assert.equal(f.service.readStages({ ...command, escenario_id: 'foreign' }).ok, false);
  assert.equal(f.writeCalls, 1);
});

test('Macrolotes and Residencial mirror their initial stage structurally without inventing duration', () => {
  for (const type of ['macrolotes', 'residencial']) {
    const f = fixture(type), created = clone(f.create());
    assert.equal(created.intake.inputs.inEtapas, 1);
    assert.equal(created.intake.inputs.inMesesUrbEtapa, null);
    const same = f.update(created, { inputs: { inEtapas: 1, inMesesUrbEtapa: null } });
    assert.equal(same.ok, true); assert.equal(same.intake.stages.count, 1);
    assert.equal(same.intake.stages.duration_months, null);
  }
});

test('direct stage-driver changes cannot contradict the canonical stage plan', () => {
  for (const type of ['macrolotes', 'residencial']) {
    for (const inputs of [{ inEtapas: 2 }, { inEtapas: null }, { inMesesUrbEtapa: 12 }]) {
      const f = fixture(type), created = f.create(), before = clone(f.snapshots.get(created.caso_id));
      const result = f.update(created, { inputs });
      assert.equal(result.ok, false); assert.equal(result.error, 'use_stage_operation');
      assert.equal(f.writeCalls, 0); assert.deepEqual(f.snapshots.get(created.caso_id), before);
    }
    const f = fixture(type), d = request(type); d.intake.inputs.inEtapas = 2;
    assert.equal(f.service.write(d).ok, false); assert.equal(f.createCalls, 0);
  }
});

test('stage counts and durations respect the Macrolotes and Residencial driver bounds', () => {
  for (const [type, minDuration] of [['macrolotes', 4], ['residencial', 3]]) {
    for (const [count, duration] of [[9, 12], [3, 100], [3, minDuration - 1]]) {
      const f = fixture(type), created = f.create();
      const result = f.service.writeStages({ tipo_desarrollo: type, caso_id: created.caso_id, escenario_id: 'base', revision_esperada: created.revision, request_id: 'stage-bound-reject', stages: { schema: 1, count, duration_months: duration, mode: 'sequential', allocation: 'preserve' } });
      assert.equal(result.ok, false, type + ':' + count + 'x' + duration);
      assert.equal(f.writeCalls, 0);
    }
    for (const [count, duration] of [[1, minDuration], [8, 24]]) {
      const f = fixture(type), created = f.create();
      const result = clone(f.service.writeStages({ tipo_desarrollo: type, caso_id: created.caso_id, escenario_id: 'base', revision_esperada: created.revision, request_id: 'stage-bound-accept', stages: { schema: 1, count, duration_months: duration, mode: 'sequential', allocation: 'preserve' } }));
      assert.equal(result.ok, true, type + ':' + count + 'x' + duration);
      assert.equal(result.intake.inputs.inEtapas, count); assert.equal(result.intake.inputs.inMesesUrbEtapa, duration);
      assert.equal(result.stage_receipt.calculated, false); assert.equal(f.writeCalls, 1);
    }
  }
});
