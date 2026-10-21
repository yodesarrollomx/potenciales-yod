/* Native Sheets transport, schema 2. No financial result is computed in GAS.
 * This public add-on contains no workbook, case, deployment or credential.
 * The existing Portero owns authorization, workbook registry and native formulas.
 */
var PPPVolumes = (function () {
  'use strict';
  var MAX = 16, OPS = 'Volumenes_Operaciones';
  var OP_HEADERS = ['request_id', 'caso_id', 'escenario_id', 'actor', 'base_revision', 'payload_hash', 'estado', 'result_revision', 'receipt_json', 'before_json', 'after_json', 'creado', 'actualizado'];
  // A:U of the native program. Limits below are transport limits, not planning law.
  var DEFINITIONS = [
    ['name', 'Nombre', 'text', null, null, false],
    ['footprint_m2', 'Huella m²', 'number', 0, 1e9, false],
    ['open_courtyard_m2', 'Patio abierto m²', 'number', 0, 1e9, false],
    ['residential_levels', 'Plantas de vivienda', 'integer', 1, 500, false],
    ['units_per_level', 'Viviendas por planta · promedio', 'number', 0, 1e6, false],
    ['units', 'Departamentos', 'integer', 0, null, true],
    ['private_area_per_unit_m2', 'Privado por departamento m²', 'number', 0, 1e9, false],
    ['private_residential_area_m2', 'Vivienda privada m²', 'number', 0, null, true],
    ['built_residential_area_m2', 'Vivienda construida m²', 'number', 0, null, true],
    ['commercial_ground_m2', 'Locales PB m²', 'number', 0, 1e9, false],
    ['ground_services_m2', 'Servicios y pasaje cubierto PB m²', 'number', 0, 1e9, false],
    ['covered_ground_m2', 'PB cubierta m²', 'number', 0, null, true],
    ['gross_area_m2', 'Construcción sobre rasante m²', 'number', 0, null, true],
    ['basement_area_m2', 'Sótano m²', 'number', 0, 1e9, false],
    ['direct_cost', 'Obra directa', 'number', 0, null, true],
    ['construction_start_month', 'Inicio de obra, mes', 'integer', 0, 1200, false],
    ['construction_duration_months', 'Duración de obra, meses', 'integer', 1, 1200, false],
    ['construction_end_month', 'Fin de obra, mes', 'integer', 0, null, true],
    ['sales_start_month', 'Inicio de ventas, mes', 'integer', 0, 1200, false],
    ['presale_months', 'Preventa, meses', 'integer', 1, 1200, false],
    ['delivery_months', 'Entrega, meses', 'integer', 1, 1200, false]
  ];
  function fault(code) { var e = new Error(code); e.code = code; throw e; }
  function plain(value) { return value && Object.prototype.toString.call(value) === '[object Object]'; }
  function exactKeys(value, allowed) {
    if (!plain(value) || Object.keys(value).length !== allowed.length || Object.keys(value).some(function (key) { return allowed.indexOf(key) < 0; })) fault('invalid_payload');
  }
  function identity(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(value)) fault('invalid_identity'); return value; }
  function fields() { return DEFINITIONS.map(function (d) {
    var f = { id: d[0], label: d[1], type: d[2], nullable: d[2] !== 'text', writable: !d[5], derived: d[5] };
    if (d[3] !== null) f.min = d[3]; if (d[4] !== null) f.max = d[4]; if (d[2] !== 'text') f.step = d[0] === 'units_per_level' ? 0.000001 : d[2] === 'integer' ? 1 : 0.01;
    return f;
  }); }
  function normalize(value, canonical) {
    exactKeys(value, ['schema', 'count', 'shared_allocation_mode', 'volumes']);
    if (['preserve', 'built_area'].indexOf(value.shared_allocation_mode) < 0) fault('invalid_allocation_mode');
    if (value.schema !== 2 || !Number.isInteger(value.count) || value.count < 1 || value.count > MAX || !Array.isArray(value.volumes) || value.volumes.length < value.count || value.volumes.length > MAX) fault('invalid_collection');
    var defs = DEFINITIONS.filter(function (d) { return canonical || !d[5]; }), ids = Object.create(null);
    return { schema: 2, count: value.count, shared_allocation_mode: value.shared_allocation_mode, volumes: value.volumes.map(function (row) {
      exactKeys(row, ['id', 'values']);
      var id = identity(row.id); if (ids[id]) fault('duplicate_volume_id'); ids[id] = true;
      exactKeys(row.values, defs.map(function (d) { return d[0]; }));
      var values = {};
      defs.forEach(function (d) {
        var n = row.values[d[0]];
        if (d[2] === 'text') {
          if (typeof n !== 'string' || !n || n !== n.trim() || n.length > 80 || /[\x00-\x1f]/.test(n) || /^[=+@-]/.test(n)) fault('invalid_text');
        } else if (n !== null && (typeof n !== 'number' || !isFinite(n) || (d[3] !== null && n < d[3]) || (d[4] !== null && n > d[4]) || (d[2] === 'integer' && !Number.isInteger(n)))) fault('invalid_quantity');
        values[d[0]] = n;
      });
      return { id: id, values: values };
    }) };
  }
  function project(value) {
    var collection = normalize(value, true);
    return { schema: 2, count: collection.count, shared_allocation_mode: collection.shared_allocation_mode, volumes: collection.volumes.map(function (row) {
      var values = {}; DEFINITIONS.forEach(function (d) { if (!d[5]) values[d[0]] = row.values[d[0]]; }); return { id: row.id, values: values };
    }) };
  }
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (plain(value)) return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + stable(value[key]); }).join(',') + '}';
    return JSON.stringify(value);
  }
  function same(a, b) { return stable(a) === stable(b); }
  function table(ss, create) {
    var sheet = ss.getSheetByName(OPS);
    if (!sheet && create) { sheet = ss.insertSheet(OPS); sheet.getRange(1, 1, 1, OP_HEADERS.length).setValues([OP_HEADERS]); }
    if (sheet && !same(sheet.getRange(1, 1, 1, OP_HEADERS.length).getValues()[0], OP_HEADERS)) fault('schema_conflict');
    return sheet;
  }
  function requestIdentity(d) { if (!plain(d)) fault('invalid_payload'); return { caso_id: identity(d.caso_id), escenario_id: identity(d.escenario_id), request_id: identity(d.request_id) }; }
  function createService(host) {
    ['authorize', 'revision', 'readModel', 'readCollection', 'sharedResources', 'writeDrivers', 'validateWrite', 'withLock', 'hash', 'audit', 'protectLedger', 'flush'].forEach(function (key) { if (typeof host[key] !== 'function') fault('missing_host_' + key); });
    function now() { return host.now ? host.now() : new Date().toISOString(); }
    function context(d, intent) {
      var ctx = host.authorize(d, intent);
      if (!ctx || !ctx.ss || !ctx.actor || ctx.caso_id !== d.caso_id || ctx.type !== 'VERTICAL' || !Array.isArray(ctx.scenarios) || ctx.scenarios.indexOf(d.escenario_id) < 0) fault('access_denied');
      if (intent === 'write' && ctx.can_write !== true) fault('access_denied');
      if (intent === 'install' && ctx.can_install !== true) fault('owner_required');
      ctx.scenario_id = d.escenario_id; return ctx;
    }
    function opFind(ss, id, actor) {
      var sheet = table(ss, false), data = sheet && sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, OP_HEADERS.length).getValues() : [], matches = [];
      data.forEach(function (r, i) { if (String(r[0]) === id.request_id) matches.push({ sheet: sheet, row: i + 2, value: r }); });
      if (matches.length > 1) fault('duplicate_operation');
      var op = matches[0];
      if (op && (op.value[1] !== id.caso_id || op.value[2] !== id.escenario_id)) fault('request_context_mismatch');
      if (op && op.value[3] !== actor) fault('request_actor_mismatch');
      return op || null;
    }
    function opUpdate(op, revision, receipt) {
      op.value[6] = 'confirmed'; op.value[7] = revision; op.value[8] = JSON.stringify(receipt); op.value[12] = now();
      op.sheet.getRange(op.row, 1, 1, OP_HEADERS.length).setValues([op.value]); host.flush();
    }
    function rejected(op) {
      var result = { ok: false, error: 'operation_rejected', request_id: op.value[0], volume_operation_status: 'rejected' };
      if (op.value[8]) result.volume_rejection = JSON.parse(op.value[8]); return result;
    }
    function rejectPrewrite(ctx, id, base, payload, desired, before, code) {
      var allowed = ['revision_conflict', 'active_driver_missing', 'protected_native_driver', 'native_formula_missing', 'native_formula_manifest_changed', 'native_geometry_conflict', 'native_horizon_conflict', 'shared_allocation_requires_reconciliation', 'volume_identity_conflict'];
      if (allowed.indexOf(code) < 0) fault(code);
      var stamp = now(), evidence = { request_id: id.request_id, caso_id: id.caso_id, escenario_id: id.escenario_id, base_revision: base, actor: ctx.actor, payload_hash: payload, stage: 'prewrite', write_attempted: false, error: code, rejected_at: stamp };
      var ledger = table(ctx.ss, true); host.protectLedger(ctx, ledger);
      var record = [id.request_id, id.caso_id, id.escenario_id, ctx.actor, base, payload, 'rejected', '', JSON.stringify(evidence), JSON.stringify(before || null), JSON.stringify(desired), stamp, stamp];
      ledger.appendRow(record); host.flush();
      host.audit({ action: 'reject-volume-prewrite', actor: ctx.actor, caso_id: ctx.caso_id, escenario_id: id.escenario_id, request_id: id.request_id, base_revision: base, payload_hash: payload, error: code, write_attempted: false });
      return rejected({ value: record });
    }
    function enrich(ctx, model) {
      if (!model || model.ok !== true || String(model.caso_id) !== ctx.caso_id) fault('invalid_model_readback');
      model.volumes_by_scenario = {};
      ctx.scenarios.forEach(function (scenario) { var collection = host.readCollection(ctx, scenario); if (collection) model.volumes_by_scenario[scenario] = normalize(collection, true); });
      var installed = !!model.volumes_by_scenario[ctx.scenario_id];
      model.capabilities = model.capabilities || {};
      var resources = host.sharedResources(ctx);
      if (!Array.isArray(resources) || resources.length > 128) fault('invalid_shared_resources');
      var ids = Object.create(null);
      resources = resources.map(function (resource) {
        exactKeys(resource, ['id', 'label']); var id = identity(resource.id), label = resource.label;
        if (ids[id] || typeof label !== 'string' || !label || label !== label.trim() || label.length > 160 || /[\x00-\x1f]/.test(label)) fault('invalid_shared_resources');
        ids[id] = true; return { id: id, label: label };
      });
      model.capabilities.volumes = { schema: 2, read: installed, write: installed && ctx.can_write === true, max_volumes: MAX, fields: fields(), allocation_modes: ['preserve', 'built_area'], shared_resources: resources };
      return model;
    }
    function response(ctx, receipt) {
      var model = enrich(ctx, host.readModel(ctx));
      if (receipt && model.revision !== receipt.result_revision) { model.volume_receipt = receipt; model.volume_receipt_status = 'superseded'; return model; }
      if (receipt && !same(model.volumes_by_scenario[receipt.escenario_id], receipt.volumes)) fault('invalid_receipt_readback');
      if (receipt) model.volume_receipt = receipt; return model;
    }
    function finish(ctx, op) {
      var fresh = op.sheet.getRange(op.row, 1, 1, OP_HEADERS.length).getValues()[0];
      if (!same(fresh.slice(0, 6), op.value.slice(0, 6))) fault('operation_marker_mismatch');
      op.value = fresh;
      // Equality alone cannot prove this request committed. The applied marker
      // must have committed atomically with drivers/IDs/count in the same batch.
      if (fresh[6] !== 'applied') return { ok: false, error: 'operation_pending', request_id: fresh[0] };
      var desired = normalize(JSON.parse(op.value[10]), false), actual = normalize(host.readCollection(ctx, op.value[2]), true);
      if (!same(project(actual), desired)) return { ok: false, error: 'operation_pending', request_id: op.value[0] };
      var revision = host.revision(ctx.ss);
      // The host verifies current native formula hashes, protected cells, explicit
      // typology reconciliation, shared allocations and monthly parity sentinels.
      var calculated = typeof host.validateCalculation === 'function' && host.validateCalculation(ctx, actual) === true;
      var receipt = { request_id: op.value[0], caso_id: ctx.caso_id, escenario_id: op.value[2], base_revision: op.value[4], result_revision: revision, volumes: actual, calculated: calculated };
      var result = response(ctx, receipt);
      if (!result.ok || result.volume_receipt_status === 'superseded') fault('revision_changed');
      host.audit({ action: 'sheet-volumes', actor: op.value[3], caso_id: ctx.caso_id, escenario_id: op.value[2], request_id: op.value[0], base_revision: op.value[4], result_revision: revision, before: JSON.parse(op.value[9]), after: actual, state: 'confirmed' });
      opUpdate(op, revision, receipt); return result;
    }
    function guarded(fn) { try { return host.withLock(fn); } catch (e) { return { ok: false, error: e.code || 'operation_pending' }; } }
    function write(d) { return guarded(function () {
      var id = requestIdentity(d), ctx = context(d, 'write');
      if (d.tipo_desarrollo !== 'VERTICAL' || typeof d.revision_esperada !== 'string' || !d.revision_esperada) fault('invalid_request');
      var desired = normalize(d.volumes, false), payload = host.hash(stable({ actor: ctx.actor, caso_id: id.caso_id, escenario_id: id.escenario_id, base_revision: d.revision_esperada, volumes: desired })), old = opFind(ctx.ss, id, ctx.actor);
      if (old) {
        if (old.value[5] !== payload) fault('request_payload_mismatch');
        if (old.value[6] === 'confirmed') return response(ctx, JSON.parse(old.value[8]));
        if (old.value[6] === 'rejected') return rejected(old);
        return { ok: false, error: 'operation_pending', request_id: id.request_id }; // no replay
      }
      if (host.revision(ctx.ss) !== d.revision_esperada) return rejectPrewrite(ctx, id, d.revision_esperada, payload, desired, null, 'revision_conflict');
      var before = normalize(host.readCollection(ctx, id.escenario_id), true);
      if (desired.volumes.length < before.volumes.length || before.volumes.some(function (v, i) { return desired.volumes[i].id !== v.id; })) return rejectPrewrite(ctx, id, d.revision_esperada, payload, desired, before, 'volume_identity_conflict');
      try { if (host.validateWrite(ctx, before, desired) !== true) fault('unsupported_volume_edit'); }
      catch (preflight) { return rejectPrewrite(ctx, id, d.revision_esperada, payload, desired, before, preflight.code || 'unsupported_volume_edit'); }
      var ledger = table(ctx.ss, true), stamp = now(); host.protectLedger(ctx, ledger);
      var record = [id.request_id, id.caso_id, id.escenario_id, ctx.actor, d.revision_esperada, payload, 'pending', '', '', JSON.stringify(before), JSON.stringify(desired), stamp, stamp];
      ledger.appendRow(record); host.flush(); var op = { sheet: ledger, row: ledger.getLastRow(), value: record };
      // Durable reservation precedes any driver write. Native formulas are NEVER
      // sent by the client, overwritten, rolled back or retried on uncertainty.
      try { host.writeDrivers(ctx, desired, { request_id: id.request_id, actor: ctx.actor, payload_hash: payload, ledger_sheet_id: ledger.getSheetId(), ledger_row: op.row }); }
      catch (e) {
        // Only an authoritative atomic API rejection can prove no commit. A
        // network failure, timeout or ordinary thrown exception stays uncertain.
        if (e && e.definitely_not_committed === true) {
          op.value[6] = 'rejected'; op.value[12] = now();
          op.sheet.getRange(op.row, 1, 1, OP_HEADERS.length).setValues([op.value]); host.flush();
          return rejected(op);
        }
        throw e;
      }
      host.flush(); return finish(ctx, op);
    }); }
    function receipt(d) { return guarded(function () {
      var id = requestIdentity(d), ctx = context(d, 'read'), op = opFind(ctx.ss, id, ctx.actor);
      if (!op) return { ok: false, error: 'receipt_not_found', request_id: id.request_id };
      if (op.value[6] === 'confirmed') return response(ctx, JSON.parse(op.value[8]));
      if (op.value[6] === 'rejected') return rejected(op);
      return finish(ctx, op); // readback only, no driver write
    }); }
    function read(d) { return guarded(function () { return response(context(d, 'read')); }); }
    function install(d, manifest) { return guarded(function () {
      var ctx = context(d, 'install');
      if (!manifest || manifest.schema !== 2 || !manifest.model_revision || !manifest.reference || !manifest.reason || !manifest.test || !manifest.expected_formula_hash || !manifest.template_id || !manifest.reservation_id) fault('invalid_install_manifest');
      if (host.revision(ctx.ss) !== d.revision_esperada) fault('revision_conflict');
      if (typeof host.installProgram !== 'function') fault('native_factory_unavailable');
      // Only an owner-side, versioned manifest may supply ranges/formulas. The
      // installer must preserve an existing program and verify a one-body factory
      // independently; it must not turn an existing three-body case into one.
      return host.installProgram(ctx, manifest);
    }); }
    return { write: write, receipt: receipt, read: read, install: install };
  }
  return { createService: createService, normalize: normalize, project: project, stable: stable, fields: fields, maxVolumes: MAX };
}());
