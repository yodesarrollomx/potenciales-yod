/* Native PPP stage transport. No financial calculation, formula or workbook ID
 * comes from the client. The authorized host owns all native bindings.
 */
var PPPStages = (function () {
  'use strict';
  var MAX = 24, MAX_MONTHS = 1200, OPS = 'Etapas_Operaciones';
  var CHECKS = ['inventory', 'areas', 'sales', 'costs', 'cash', 'debt', 'distribution', 'horizon', 'formulas'];
  var TYPES = ['VERTICAL', 'MACROLOTES', 'UNIFAMILIAR', 'RESIDENCIAL', 'PATRIMONIAL'];
  var HEADERS = ['request_id', 'caso_id', 'escenario_id', 'actor', 'base_revision', 'payload_hash', 'estado', 'result_revision', 'receipt_json', 'before_json', 'after_json', 'creado', 'actualizado'];
  var ASSUMPTION = 'Etapas consecutivas; la obra conserva las proporciones del calendario original y los plazos de preventa y entrega.';
  function fail(code) { var error = new Error(code); error.code = code; throw error; }
  function plain(value) { return value && Object.prototype.toString.call(value) === '[object Object]'; }
  function exact(value, keys) {
    if (!plain(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(function (k) { return keys.indexOf(k) < 0; })) fail('invalid_stage_payload');
  }
  function identity(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(value)) fail('invalid_identity'); return value; }
  function integer(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
  function normalize(value, canonical) {
    exact(value, ['schema', 'count', 'duration_months', 'mode', 'allocation'].concat(canonical ? ['stages'] : []));
    if (value.schema !== 1 || !integer(value.count, 1, MAX) || !integer(value.duration_months, 1, MAX_MONTHS) || value.mode !== 'sequential' || value.allocation !== 'preserve') fail('invalid_stage_plan');
    var result = { schema: 1, count: value.count, duration_months: value.duration_months, mode: 'sequential', allocation: 'preserve' };
    if (canonical) {
      if (!Array.isArray(value.stages) || value.stages.length !== value.count) fail('invalid_native_stage_calendar');
      var seen = Object.create(null), end = null;
      result.stages = value.stages.map(function (stage, index) {
        exact(stage, ['id', 'order', 'start_month', 'duration_months', 'end_month']);
        var id = identity(stage.id);
        if (seen[id] || stage.order !== index + 1 || stage.duration_months !== value.duration_months || !integer(stage.start_month, 1, MAX_MONTHS) || !integer(stage.end_month, stage.start_month, MAX_MONTHS) || stage.end_month - stage.start_month + 1 !== stage.duration_months || (end !== null && stage.start_month !== end + 1)) fail('invalid_native_stage_calendar');
        seen[id] = true; end = stage.end_month;
        return { id: id, order: stage.order, start_month: stage.start_month, duration_months: stage.duration_months, end_month: stage.end_month };
      });
    }
    return result;
  }
  function project(value) { var p = normalize(value, true); delete p.stages; return p; }
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (plain(value)) return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + stable(value[key]); }).join(',') + '}';
    return JSON.stringify(value);
  }
  function same(a, b) { return stable(a) === stable(b); }
  function checks(value) {
    exact(value, CHECKS);
    var out = {}; CHECKS.forEach(function (key) { if (typeof value[key] !== 'boolean') fail('invalid_stage_checks'); out[key] = value[key]; }); return out;
  }
  function capability(value) {
    exact(value, ['read', 'write', 'max_stages', 'max_months']);
    if (typeof value.read !== 'boolean' || typeof value.write !== 'boolean' || (value.write && !value.read) || !integer(value.max_stages, 1, MAX) || !integer(value.max_months, 1, MAX_MONTHS)) fail('invalid_stage_capability');
    return { schema: 1, read: value.read, write: value.write, max_stages: value.max_stages, max_months: value.max_months, modes: ['sequential'], allocation_modes: ['preserve'], assumption: ASSUMPTION, managed_volume_fields: value.read ? ['construction_start_month', 'construction_duration_months', 'sales_start_month'] : [] };
  }
  function createService(host) {
    ['authorize', 'revision', 'readModel', 'readPlan', 'capability', 'validateWrite', 'writeDrivers', 'validateCalculation', 'withLock', 'hash', 'audit', 'protectLedger', 'flush'].forEach(function (name) { if (typeof host[name] !== 'function') fail('missing_host_' + name); });
    function now() { return host.now ? host.now() : new Date().toISOString(); }
    function context(d, intent) {
      if (!plain(d)) fail('invalid_request');
      identity(d.caso_id); identity(d.escenario_id);
      var ctx = host.authorize(d, intent);
      if (!ctx || !ctx.ss || !ctx.actor || ctx.caso_id !== d.caso_id || TYPES.indexOf(ctx.type) < 0 || d.tipo_desarrollo !== ctx.type || !Array.isArray(ctx.scenarios) || ctx.scenarios.indexOf(d.escenario_id) < 0 || (intent === 'write' && ctx.can_write !== true)) fail('access_denied');
      ctx.scenario_id = d.escenario_id; return ctx;
    }
    function table(ss, create) {
      var sheet = ss.getSheetByName(OPS);
      if (!sheet && create) { sheet = ss.insertSheet(OPS); sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]); }
      if (sheet && !same(sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0], HEADERS)) fail('stage_ledger_schema');
      return sheet;
    }
    function find(ctx, d) {
      identity(d.request_id);
      var sheet = table(ctx.ss, false), matches = [];
      if (sheet && sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues().forEach(function (row, i) { if (row[0] === d.request_id) matches.push({ sheet: sheet, row: i + 2, value: row }); });
      if (matches.length > 1) fail('duplicate_operation');
      var op = matches[0];
      if (op && (op.value[1] !== d.caso_id || op.value[2] !== d.escenario_id)) fail('request_context_mismatch');
      if (op && op.value[3] !== ctx.actor) fail('request_actor_mismatch');
      return op || null;
    }
    function response(ctx, receipt) {
      var model = host.readModel(ctx);
      if (!model || model.ok !== true || model.caso_id !== ctx.caso_id || typeof model.revision !== 'string' || !model.revision || model.revision !== host.revision(ctx.ss)) fail('invalid_model_readback');
      model.stages_by_scenario = {};
      ctx.scenarios.forEach(function (id) { var plan = host.readPlan(ctx, id); if (plan) model.stages_by_scenario[id] = normalize(plan, true); });
      model.stage_checks_by_scenario = {}; model.stage_calculated_by_scenario = {};
      Object.keys(model.stages_by_scenario).forEach(function(id){
        var selected = Object.assign({}, ctx, {scenario_id:id}), verified = checks(host.validateCalculation(selected));
        model.stage_checks_by_scenario[id] = verified;
        model.stage_calculated_by_scenario[id] = CHECKS.every(function(key){return verified[key];});
      });
      var cap = capability(host.capability(ctx));
      cap.read = cap.read && !!model.stages_by_scenario[ctx.scenario_id];
      cap.write = cap.write && cap.read && ctx.can_write === true;
      model.capabilities = model.capabilities || {}; model.capabilities.stages = cap;
      if (receipt) {
        model.stage_receipt = receipt;
        if (model.revision !== receipt.result_revision) model.stage_receipt_status = 'superseded';
        else if (!same(model.stages_by_scenario[receipt.escenario_id], receipt.stages)) fail('invalid_receipt_readback');
      }
      return model;
    }
    function rejected(op) { return { ok: false, error: 'operation_rejected', request_id: op.value[0], stage_operation_status: 'rejected', stage_rejection: JSON.parse(op.value[8]) }; }
    function saveRejected(ctx, d, payload, desired, before, code) {
      var allowed = ['revision_conflict', 'stage_binding_missing', 'stage_read_only', 'native_stage_horizon_conflict', 'native_stage_formula_changed', 'native_stage_formula_missing', 'native_stage_protection_missing', 'native_stage_distribution_unsupported', 'protected_native_stage_driver', 'invalid_native_stage_calendar', 'native_stage_template_mismatch'];
      if (allowed.indexOf(code) < 0) fail(code);
      var stamp = now(), proof = { request_id: d.request_id, caso_id: d.caso_id, escenario_id: d.escenario_id, base_revision: d.revision_esperada, actor: ctx.actor, payload_hash: payload, stage: 'prewrite', write_attempted: false, error: code, rejected_at: stamp };
      var ledger = table(ctx.ss, true); host.protectLedger(ctx, ledger);
      var record = [d.request_id, d.caso_id, d.escenario_id, ctx.actor, d.revision_esperada, payload, 'rejected', '', JSON.stringify(proof), JSON.stringify(before), JSON.stringify(desired), stamp, stamp];
      ledger.appendRow(record); host.flush();
      host.audit({ action: 'reject-stage-prewrite', request_id: d.request_id, actor: ctx.actor, caso_id: d.caso_id, escenario_id: d.escenario_id, base_revision: d.revision_esperada, payload_hash: payload, error: code, write_attempted: false });
      return rejected({ value: record });
    }
    function finish(ctx, op) {
      var current = op.sheet.getRange(op.row, 1, 1, HEADERS.length).getValues()[0];
      if (!same(current.slice(0, 6), op.value.slice(0, 6))) fail('operation_marker_mismatch');
      op.value = current;
      if (current[6] !== 'applied') return { ok: false, error: 'operation_pending', request_id: current[0] };
      var desired = normalize(JSON.parse(current[10]), false), actual = normalize(host.readPlan(ctx, current[2]), true);
      if (!same(project(actual), desired)) return { ok: false, error: 'operation_pending', request_id: current[0] };
      var resultRevision = host.revision(ctx.ss), resultChecks = checks(host.validateCalculation(ctx));
      var receipt = { request_id: current[0], caso_id: current[1], escenario_id: current[2], base_revision: current[4], result_revision: resultRevision, stages: actual, calculated: CHECKS.every(function (key) { return resultChecks[key]; }), checks: resultChecks };
      var result = response(ctx, receipt);
      if (result.stage_receipt_status === 'superseded') fail('revision_changed');
      // The host audit must deduplicate by (action, request_id). Recovery can
      // reconcile an applied marker but must never append a second business event.
      host.audit({ action: 'sheet-stages', request_id: current[0], actor: current[3], caso_id: current[1], escenario_id: current[2], base_revision: current[4], result_revision: resultRevision, before: JSON.parse(current[9]), after: actual, checks: resultChecks, state: 'confirmed' });
      current[6] = 'confirmed'; current[7] = resultRevision; current[8] = JSON.stringify(receipt); current[12] = now();
      op.sheet.getRange(op.row, 1, 1, HEADERS.length).setValues([current]); host.flush(); return result;
    }
    function guarded(fn) { try { return host.withLock(fn); } catch (error) { return { ok: false, error: error.code || 'operation_pending' }; } }
    function write(d) { return guarded(function () {
      var ctx = context(d, 'write'); identity(d.request_id);
      if (typeof d.revision_esperada !== 'string' || !d.revision_esperada || d.revision_esperada.length > 256) fail('invalid_request');
      var desired = normalize(d.stages, false), payload = host.hash(stable({ actor: ctx.actor, caso_id: d.caso_id, escenario_id: d.escenario_id, base_revision: d.revision_esperada, stages: desired })), old = find(ctx, d);
      if (old) {
        if (old.value[5] !== payload) fail('request_payload_mismatch');
        if (old.value[6] === 'confirmed') return response(ctx, JSON.parse(old.value[8]));
        if (old.value[6] === 'rejected') return rejected(old);
        return { ok: false, error: 'operation_pending', request_id: d.request_id };
      }
      var before = null;
      if (host.revision(ctx.ss) !== d.revision_esperada) return saveRejected(ctx, d, payload, desired, before, 'revision_conflict');
      try {
        var cap = capability(host.capability(ctx));
        if (!cap.read) fail('stage_binding_missing');
        if (!cap.write) fail('stage_read_only');
        if (desired.count > cap.max_stages || desired.count * desired.duration_months > cap.max_months) fail('native_stage_horizon_conflict');
        before = normalize(host.readPlan(ctx, ctx.scenario_id), true);
        if (host.validateWrite(ctx, before, desired) !== true) fail('native_stage_distribution_unsupported');
      } catch (preflight) { return saveRejected(ctx, d, payload, desired, before, preflight.code || 'native_stage_template_mismatch'); }
      var ledger = table(ctx.ss, true), stamp = now(); host.protectLedger(ctx, ledger);
      var record = [d.request_id, d.caso_id, d.escenario_id, ctx.actor, d.revision_esperada, payload, 'pending', '', '', JSON.stringify(before), JSON.stringify(desired), stamp, stamp];
      ledger.appendRow(record); host.flush();
      var op = { sheet: ledger, row: ledger.getLastRow(), value: record };
      try { host.writeDrivers(ctx, desired, { request_id: d.request_id, actor: ctx.actor, payload_hash: payload, ledger_sheet_id: ledger.getSheetId(), ledger_row: op.row }); }
      catch (error) {
        if (error && error.definitely_not_committed === true) {
          record[6] = 'rejected'; record[8] = JSON.stringify({ request_id: d.request_id, caso_id: d.caso_id, escenario_id: d.escenario_id, base_revision: d.revision_esperada, actor: ctx.actor, payload_hash: payload, stage: 'atomic_write', write_attempted: true, committed: false, error: 'native_stage_write_rejected', rejected_at: now() }); record[12] = now();
          ledger.getRange(op.row, 1, 1, HEADERS.length).setValues([record]); host.flush(); return rejected(op);
        }
        throw error;
      }
      host.flush(); return finish(ctx, op);
    }); }
    function read(d) { return guarded(function () { return response(context(d, 'read')); }); }
    function receipt(d) { return guarded(function () {
      var ctx = context(d, 'read'), op = find(ctx, d);
      if (!op) return { ok: false, error: 'receipt_not_found', request_id: d.request_id };
      if (op.value[6] === 'confirmed') return response(ctx, JSON.parse(op.value[8]));
      if (op.value[6] === 'rejected') return rejected(op);
      return finish(ctx, op); // No driver writes, including after timeouts.
    }); }
    return { read: read, write: write, receipt: receipt };
  }
  return { createService: createService, normalize: normalize, project: project, stable: stable, checks: checks, checkIds: CHECKS.slice(), maxStages: MAX, maxMonths: MAX_MONTHS, assumption: ASSUMPTION };
}());
