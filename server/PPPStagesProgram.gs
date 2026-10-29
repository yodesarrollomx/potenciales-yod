/* Native stage calendar and binding. Calendars are formulas in Sheets; monetary
 * formulas, physical volumes, prices and resource allocations remain native.
 * Installation is owner-only and requires a verified current formula hash.
 */
var PPPStagesProgram = (function () {
  'use strict';
  var INDEX = 'Etapas_Indice', HEADERS = ['escenario_id', 'etapas_hoja', 'programa_hoja', 'escenario_hoja', 'estado', 'modelo_revision', 'formula_hash', 'baseline_hash', 'source_count', 'operacion_id'];
  var FIRST = 9, BASE = 37, CAPACITY = 24;
  var DERIVED = ['construction_start_month', 'construction_duration_months', 'sales_start_month'];
  function fail(code) { var e = new Error(code); e.code = code; throw e; }
  function q(value) { return "'" + String(value).replace(/'/g, "''") + "'!"; }
  function same(a, b) { return PPPStages.stable(a) === PPPStages.stable(b); }
  function int(n, min, max) { return Number.isInteger(n) && n >= min && n <= max; }
  function cellRequest(sheet, row, column, matrix, formula) {
    return { updateCells: { range: { sheetId: sheet.getSheetId(), startRowIndex: row - 1, endRowIndex: row - 1 + matrix.length, startColumnIndex: column - 1, endColumnIndex: column - 1 + matrix[0].length }, rows: matrix.map(function (r) { return { values: r.map(function (value) { if (value === null || value === '') return {}; return { userEnteredValue: formula ? { formulaValue: value } : typeof value === 'number' ? { numberValue: value } : { stringValue: String(value) } }; }) }; }), fields: 'userEnteredValue' } };
  }
  function createStore(hooks) {
    var ss = hooks.ss;
    ['hash', 'atomicWrite', 'flush'].forEach(function (name) { if (typeof hooks[name] !== 'function') fail('missing_stage_hook_' + name); });
    function index(create) {
      var sheet = ss.getSheetByName(INDEX);
      if (!sheet && create) { sheet = ss.insertSheet(INDEX); sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]); }
      if (sheet && !same(sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0], HEADERS)) fail('native_stage_template_mismatch');
      return sheet;
    }
    function info(id) {
      var h = index(false), matches = [];
      if (h && h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, HEADERS.length).getValues().forEach(function (row, i) { if (String(row[0]) === String(id)) matches.push({ row: i + 2, values: row }); });
      if (matches.length > 1) fail('native_stage_template_mismatch');
      return matches[0] || null;
    }
    function bound(entry) {
      if (!entry || entry.values[4] !== 'ready') return false;
      var versions = ss.getSheetByName('Versiones'); if (!versions) return false;
      var matches = versions.getDataRange().getValues().slice(1).filter(function (r) { return String(r[0]) === String(entry.values[0]) && r[5] !== 'ARCHIVADO'; });
      return matches.length === 1 && String(matches[0][4]) === String(entry.values[3]);
    }
    function stageSheet(entry) { var h = ss.getSheetByName(String(entry.values[1])); if (!h) fail('stage_binding_missing'); return h; }
    function material(entry) {
      return [entry.values[1], entry.values[2], entry.values[3], 'PA_' + String(entry.values[0]).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60)].map(function (name) { var h = ss.getSheetByName(String(name)); if (!h) fail('stage_binding_missing'); return [String(name), h.getDataRange().getFormulas()]; });
    }
    function baseline(entry) { return stageSheet(entry).getRange(BASE, 1, 16, 6).getValues(); }
    function protectedSheets(entry) {
      if (typeof hooks.isProtected !== 'function') return false;
      return [entry.values[1], entry.values[2], entry.values[3], INDEX].every(function (name) { return hooks.isProtected(ss.getSheetByName(String(name)), name === entry.values[1] ? ['B1', 'B2'] : []) === true; });
    }
    function integrity(entry) {
      if (!bound(entry)) fail('stage_binding_missing');
      if (hooks.hash(PPPStages.stable(material(entry))) !== entry.values[6] || hooks.hash(PPPStages.stable(baseline(entry))) !== entry.values[7]) fail('native_stage_formula_changed');
      if (!protectedSheets(entry)) fail('native_stage_protection_missing');
      var h = stageSheet(entry);
      if (h.getRange('B1').getFormula() || h.getRange('B2').getFormula()) fail('protected_native_stage_driver');
      if (h.getRange(1, 7, PPPStages.checkIds.length, 1).getFormulas().some(function (row) { return !row[0]; })) fail('native_stage_formula_missing');
      return true;
    }
    function readPlan(ctx, id) {
      var entry = info(id); if (!bound(entry)) return null;
      var h = stageSheet(entry), count = h.getRange('B1').getValue(), duration = h.getRange('B2').getValue();
      if (!int(count, 1, CAPACITY)) fail('invalid_native_stage_calendar');
      var rows = h.getRange(FIRST, 1, count, 5).getValues();
      return PPPStages.normalize({ schema: 1, count: count, duration_months: duration, mode: 'sequential', allocation: 'preserve', stages: rows.map(function (r) { return { id: String(r[0]), order: r[1], start_month: r[2], duration_months: r[3], end_month: r[4] }; }) }, true);
    }
    function capability(ctx) {
      var entry = info(ctx.scenario_id), read = bound(entry), writable = false;
      if (read) try { integrity(entry); writable = true; } catch (e) { writable = false; }
      return { read: read, write: writable, max_stages: CAPACITY, max_months: 120 };
    }
    function validateWrite(ctx, before, desired) {
      desired = PPPStages.normalize(desired, false); var entry = info(ctx.scenario_id); integrity(entry);
      // Domain-only horizon check; all actual calendar and financial results
      // are read from Sheets. Preserve the longest existing delivery tail.
      // Delivery remains an editable native input after installation. The
      // current tail, not the captured installation tail, limits the next plan.
      var tails = ss.getSheetByName(String(entry.values[2])).getRange(7, 21, Number(entry.values[8]), 1).getValues();
      var first = stageSheet(entry).getRange('B3').getValue(), tail = Math.max.apply(null, tails.map(function (r) { return r[0]; }));
      if (!int(first, 1, 120) || !int(tail, 1, 120) || first + desired.count * desired.duration_months - 1 + tail > 120) fail('native_stage_horizon_conflict');
      if (!same(PPPStages.project(readPlan(ctx, ctx.scenario_id)), PPPStages.project(before))) fail('native_stage_template_mismatch');
      return true;
    }
    function writePlan(ctx, desired, commit) {
      var before = readPlan(ctx, ctx.scenario_id); validateWrite(ctx, before, desired);
      if (!commit) fail('operation_marker_required');
      var ledger = ss.getSheetByName('Etapas_Operaciones');
      if (!ledger || ledger.getSheetId() !== commit.ledger_sheet_id || !int(commit.ledger_row, 2, 1000000)) fail('operation_marker_mismatch');
      var r = ledger.getRange(commit.ledger_row, 1, 1, 7).getValues()[0];
      if (r[0] !== commit.request_id || r[1] !== ctx.caso_id || r[2] !== ctx.scenario_id || r[3] !== ctx.actor || r[3] !== commit.actor || r[5] !== commit.payload_hash || r[6] !== 'pending') fail('operation_marker_mismatch');
      return [cellRequest(stageSheet(info(ctx.scenario_id)), 1, 2, [[desired.count], [desired.duration_months]], false), cellRequest(ledger, commit.ledger_row, 7, [['applied']], false)];
    }
    function writeDrivers(ctx, desired, commit) { hooks.atomicWrite(ss.getId(), writePlan(ctx, desired, commit)); }
    function validateCalculation(ctx) {
      var entry = info(ctx.scenario_id), result = {};
      PPPStages.checkIds.forEach(function (key) { result[key] = false; });
      if (!bound(entry)) return result;
      var values = stageSheet(entry).getRange(1, 7, PPPStages.checkIds.length, 1).getValues();
      PPPStages.checkIds.forEach(function (key, i) { result[key] = values[i][0] === true; });
      try { integrity(entry); } catch (e) { result.formulas = false; }
      return result;
    }
    function revisionMaterial() {
      var h = index(false); if (!h) return [];
      var out = [[INDEX, h.getDataRange().getValues(), h.getDataRange().getFormulas()]];
      if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, HEADERS.length).getValues().forEach(function (r) { if (!r[0]) return; var sheet = ss.getSheetByName(String(r[1])); if (sheet) out.push([String(r[1]), sheet.getDataRange().getValues(), sheet.getDataRange().getFormulas()]); });
      return out;
    }
    function calendarOwned(ctx, id) { return bound(info(id || ctx.scenario_id)); }
    function assertVolumeEdit(ctx, before, desired) {
      var entry = info(ctx.scenario_id); if (!bound(entry)) return false;
      integrity(entry);
      // A new physical body needs a reviewed baseline; a stage command never
      // invents its schedule or adds a building to satisfy a stage count.
      if (desired.volumes.length > Number(entry.values[8])) fail('stage_volume_extension_requires_review');
      desired.volumes.forEach(function (row, i) { DERIVED.forEach(function (key) { if (row.values[key] !== before.volumes[i].values[key]) fail('protected_native_stage_driver'); }); });
      return true;
    }
    function protect(sheet, editable) {
      if (typeof hooks.protect !== 'function') fail('native_stage_protection_missing');
      hooks.protect(sheet, editable || []);
    }
    function installVertical(ctx, manifest) {
      if (typeof hooks.isOwner !== 'function' || hooks.isOwner(ctx) !== true) fail('owner_required');
      if (!manifest || manifest.schema !== 1 || !manifest.operation_id || !manifest.expected_formula_hash || !manifest.reference || !manifest.reason || !manifest.test) fail('invalid_install_manifest');
      var old = info(ctx.scenario_id);
      if (old) { if (old.values[9] !== manifest.operation_id) fail('stage_install_conflict'); return { ok: old.values[4] === 'ready', already_installed: old.values[4] === 'ready', error: old.values[4] === 'ready' ? null : 'operation_pending' }; }
      if (typeof hooks.volumeStore !== 'function') fail('native_stage_template_mismatch');
      var volumeStore = hooks.volumeStore(), entry = volumeStore.info(ctx.scenario_id);
      if (!entry || entry.values[7] !== 'ready' || !volumeStore.writeCapable(ctx) || !volumeStore.validateCalculation(ctx)) fail('native_stage_template_mismatch');
      var source = volumeStore.readCollection(ctx, ctx.scenario_id), program = ss.getSheetByName(String(entry.values[1])), financial = ss.getSheetByName(String(entry.values[2]));
      if (!source || source.count !== source.volumes.length || !int(source.count, 1, 16)) fail('native_stage_distribution_unsupported');
      var existingCalendarFormulas = program.getRange(7, 16, source.count, 4).getFormulas();
      if (existingCalendarFormulas.some(function(r){return !!r[0] || !!r[1] || !!r[3];})) fail('native_stage_template_mismatch');
      var formulaSource = [[program.getName(), program.getDataRange().getFormulas()], [financial.getName(), financial.getDataRange().getFormulas()], ['PA_' + String(ctx.scenario_id).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60), ss.getSheetByName('PA_' + String(ctx.scenario_id).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60)).getDataRange().getFormulas()]];
      if (hooks.hash(PPPStages.stable(formulaSource)) !== manifest.expected_formula_hash) fail('native_stage_formula_changed');
      var names = {}, metricRows = financial.getRange(8, 6, financial.getLastRow() - 7, 1).getValues();
      metricRows.forEach(function (r, i) { if (r[0]) names[String(r[0])] = '$G$' + (i + 8); });
      function metric(key) { if (!names[key]) fail('native_stage_template_mismatch'); return q(financial.getName()) + names[key]; }
      ['units', 'resSell', 'sales', 'cashCost', 'cashReconciliation', 'horizonPass', 'debtDraws', 'interest', 'cashInterest', 'feeDebt', 'debtRepayments', 'debt', 'ownerDist', 'devDist', 'distributable', 'ownerCapitalReturn', 'ownerPrefPaid', 'ownerResidual', 'devCapitalReturn', 'devPrefPaid', 'devResidual', 'ownerTotalProceeds', 'ownerSaleProceeds'].forEach(metric);
      var stageName = 'Etapas_' + String(ctx.scenario_id).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60);
      if (ss.getSheetByName(stageName)) fail('stage_install_conflict');
      var baseRows = source.volumes.map(function (v) { return [v.id, v.values.construction_start_month, v.values.construction_duration_months, v.values.sales_start_month, v.values.presale_months, v.values.delivery_months]; });
      while (baseRows.length < 16) baseRows.push(['', '', '', '', '', '']);
      var sourceSchedules = program.getRange(7, 16, 16, 6).getValues();
      // No private amounts or new defaults are introduced. The first plan uses
      // the observed native construction span exactly and proves full parity.
      var first = Math.min.apply(null, source.volumes.map(function (v) { return v.values.construction_start_month; })), end = Math.max.apply(null, source.volumes.map(function (v) { return v.values.construction_end_month; })), duration = end - first + 1;
      if (!int(first, 1, 120) || !int(duration, 1, 120)) fail('invalid_native_stage_calendar');
      var ledger = index(true), row = ledger.getLastRow() + 1, record = [ctx.scenario_id, stageName, program.getName(), financial.getName(), 'pending', 'native-stages-v1', '', '', source.count, manifest.operation_id];
      ledger.appendRow(record); hooks.flush(); // reservation before structural writes
      var stage = ss.insertSheet(stageName), requests = [], prefix = q(stageName), sep = ';';
      function formula(h, r, c, text) { requests.push(cellRequest(h, r, c, [[text.replace(/,/g, sep)]], true)); }
      requests.push(cellRequest(stage, 1, 1, [['Etapas', 1], ['Meses por etapa', duration]], false));
      requests.push(cellRequest(stage, BASE, 1, baseRows, false));
      requests.push(cellRequest(stage, BASE - 1, 1, [['volume_id', 'inicio_obra_fuente', 'duracion_fuente', 'inicio_ventas_fuente', 'preventa_fuente', 'entrega_fuente']], false));
      requests.push(cellRequest(stage, FIRST - 1, 1, [['stage_id', 'orden', 'inicio_mes', 'duracion_meses', 'fin_mes']], false));
      requests.push(cellRequest(stage, 3, 1, [['Inicio observado'], ['Tramo original'], ['Criterio: calendario proporcional; preventa y entrega conservan sus plazos'], ['Fuente: calendario nativo anterior; no reparto comercial nuevo']], false));
      formula(stage, 3, 2, '=MIN(B' + BASE + ':B' + (BASE + source.count - 1) + ')');
      formula(stage, 4, 2, '=MAX(' + baseRows.slice(0, source.count).map(function (_, i) { return 'B' + (BASE + i) + '+C' + (BASE + i) + '-1'; }).join(',') + ')-B3+1');
      for (var i = 0; i < CAPACITY; i++) {
        var r = FIRST + i;
        requests.push(cellRequest(stage, r, 1, [['stage-' + (i + 1), i + 1]], false));
        formula(stage, r, 3, '=IF(B' + r + '<=$B$1,$B$3+(B' + r + '-1)*$B$2,"")');
        formula(stage, r, 4, '=IF(B' + r + '<=$B$1,$B$2,"")');
        formula(stage, r, 5, '=IF(B' + r + '<=$B$1,C' + r + '+D' + r + '-1,"")');
      }
      for (var j = 0; j < source.count; j++) {
        var p = 7 + j, b = BASE + j, start = prefix + '$B$3', span = '(' + prefix + '$B$1*' + prefix + '$B$2)', original = prefix + '$B$4', sourceStart = prefix + '$B$' + b, sourceDuration = prefix + '$C$' + b;
        formula(program, p, 16, '=' + start + '+ROUND((' + sourceStart + '-' + start + ')*' + span + '/' + original + ',0)');
        formula(program, p, 17, '=MAX(1,ROUND((' + sourceStart + '+' + sourceDuration + '-' + start + ')*' + span + '/' + original + ',0)-ROUND((' + sourceStart + '-' + start + ')*' + span + '/' + original + ',0))');
        formula(program, p, 19, '=MAX(1,P' + p + '-(' + sourceStart + '-' + prefix + '$D$' + b + '))');
      }
      var programRef = q(program.getName()), finRef = q(financial.getName());
      var assertions = [
        '=AND(' + programRef + 'Y1,SUM(' + programRef + 'F7:F22)=' + metric('units') + ')',
        '=AND(' + programRef + 'Y1,ABS(SUM(' + programRef + 'H7:H22)-' + metric('resSell') + ')<1/1000000)',
        '=ABS(SUM(' + finRef + 'L8:L127)-' + metric('sales') + ')<1',
        '=ABS(SUM(' + finRef + 'M8:M127)-' + metric('cashCost') + ')<1',
        '=ABS(' + metric('cashReconciliation') + ')<1',
        '=AND(COUNT(' + ['debtDraws','interest','cashInterest','feeDebt','debtRepayments','debt'].map(metric).join(',') + ')=6,ABS(' + metric('debtDraws') + '+' + metric('interest') + '-' + metric('cashInterest') + '+' + metric('feeDebt') + '-' + metric('debtRepayments') + '-' + metric('debt') + ')<1)',
        '=AND(COUNT(' + ['ownerDist','devDist','distributable','ownerCapitalReturn','ownerPrefPaid','ownerResidual','devCapitalReturn','devPrefPaid','devResidual','ownerTotalProceeds','ownerSaleProceeds'].map(metric).join(',') + ')=11,ABS(' + metric('ownerDist') + '+' + metric('devDist') + '-' + metric('distributable') + ')<1,ABS(' + metric('ownerDist') + '-' + metric('ownerCapitalReturn') + '-' + metric('ownerPrefPaid') + '-' + metric('ownerResidual') + ')<1,ABS(' + metric('devDist') + '-' + metric('devCapitalReturn') + '-' + metric('devPrefPaid') + '-' + metric('devResidual') + ')<1,ABS(' + metric('ownerTotalProceeds') + '-' + metric('ownerSaleProceeds') + '-' + metric('ownerDist') + ')<1)',
        '=AND(' + metric('horizonPass') + ',MAX(E' + FIRST + ':E' + (FIRST + CAPACITY - 1) + ')<=120,MAX(' + programRef + 'R7:R22)=MAX(E' + FIRST + ':E' + (FIRST + CAPACITY - 1) + '))',
        '=AND(' + programRef + 'Y1,' + programRef + 'Y2)'
      ];
      PPPStages.checkIds.forEach(function (key, n) { requests.push(cellRequest(stage, n + 1, 6, [[key]], false)); formula(stage, n + 1, 7, assertions[n]); });
      if (typeof hooks.audit !== 'function') fail('missing_stage_audit');
      hooks.audit({ action: 'install-native-stages', request_id: manifest.operation_id, actor: ctx.actor, caso_id: ctx.caso_id, escenario_id: ctx.scenario_id, reference: manifest.reference, reason: manifest.reason, test: manifest.test, before: { formula_hash: manifest.expected_formula_hash, calendar: sourceSchedules }, formula_changes: requests.filter(function (r) { return r.updateCells.rows[0].values[0].userEnteredValue && r.updateCells.rows[0].values[0].userEnteredValue.formulaValue; }) });
      hooks.atomicWrite(ss.getId(), requests); hooks.flush();
      // Installation cannot silently change any existing native calendar. A
      // failure leaves a durable pending installation and never retries itself.
      if (!same(program.getRange(7, 16, source.count, 6).getValues(), sourceSchedules.slice(0, source.count))) fail('native_stage_initial_parity_failed');
      protect(stage, ['B1', 'B2']); protect(ledger, []);
      // Retain the existing program protection, but remove newly-derived cells
      // from its unprotected ranges via an explicit owner hook.
      if (typeof hooks.protectProgram !== 'function') fail('native_stage_protection_missing');
      hooks.protectProgram(program, source.count, DERIVED.slice());
      var nativeIndex = ss.getSheetByName('Volumenes_Indice');
      nativeIndex.getRange(entry.row, 10).setValue(hooks.hash(PPPStages.stable([[program.getName(), program.getDataRange().getFormulas()], [financial.getName(), financial.getDataRange().getFormulas()], formulaSource[2]])));
      record[4] = 'ready'; record[6] = hooks.hash(PPPStages.stable(material({ values: record }))); record[7] = hooks.hash(PPPStages.stable(baseRows));
      ledger.getRange(row, 1, 1, HEADERS.length).setValues([record]); hooks.flush();
      var result = validateCalculation(ctx);
      if (!PPPStages.checkIds.every(function (key) { return result[key]; })) { ledger.getRange(row, 5).setValue('validation_failed'); hooks.flush(); fail('native_stage_validation_failed'); }
      return { ok: true, installed: true, count: 1, duration_source: 'existing_native_construction_span', stages: readPlan(ctx, ctx.scenario_id), checks: result, calculated: true };
    }
    return { info: info, readPlan: readPlan, capability: capability, validateWrite: validateWrite, writePlan: writePlan, writeDrivers: writeDrivers, validateCalculation: validateCalculation, revisionMaterial: revisionMaterial, calendarOwned: calendarOwned, assertVolumeEdit: assertVolumeEdit, installVertical: installVertical, formulaMaterial: function (id) { var entry = info(id); return entry ? material(entry) : []; }, derivedCalendarFields: DERIVED.slice() };
  }
  return { createStore: createStore, indexName: INDEX, headers: HEADERS.slice(), derivedCalendarFields: DERIVED.slice() };
}());
