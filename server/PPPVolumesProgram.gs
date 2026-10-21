/* Native program A:U storage and owner migration. The index is per scenario;
 * old global Cuerpos is not an authority for another version. */
var PPPVolumesProgram = (function () {
  'use strict';
  var INDEX = 'Volumenes_Indice';
  var HEADERS = ['escenario_id', 'programa', 'escenario_hoja', 'cantidad_activa', 'filas_guardadas', 'capacidad', 'modelo_revision', 'estado', 'programa_fuente', 'formula_hash', 'shared_allocation_mode'];
  function fail(code) { var e = new Error(code); e.code = code; throw e; }
  function q(name) { return "'" + String(name).replace(/'/g, "''") + "'!"; }
  function col(i) { var result = ''; for (var n = i; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result; return result; }
  function createStore(hooks) {
    var ss = hooks.ss;
    function flush() { hooks.flush(); }
    function idx(create) {
      var sheet = ss.getSheetByName(INDEX);
      if (!sheet && create) { sheet = ss.insertSheet(INDEX); sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]); }
      if (sheet && PPPVolumes.stable(sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0]) !== PPPVolumes.stable(HEADERS)) fail('program_index_schema');
      return sheet;
    }
    function info(id) {
      var sheet = idx(false); if (!sheet || sheet.getLastRow() < 2) return null;
      var matches = [];
      sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues().forEach(function (r, i) { if (String(r[0]) === String(id)) matches.push({ row: i + 2, values: r }); });
      if (matches.length > 1) fail('duplicate_program');
      return matches[0] || null;
    }
    function readCollection(ctx, id) {
      var entry = info(id); if (!entry || entry.values[7] !== 'ready') return null;
      var r = entry.values, program = ss.getSheetByName(String(r[1])), count = Number(r[3]), stored = Number(r[4]);
      if (!program || !Number.isInteger(stored) || stored < count || stored > 16) fail('program_missing');
      var values = program.getRange(7, 1, stored, 22).getValues(), defs = PPPVolumes.fields();
      return PPPVolumes.normalize({ schema: 2, count: count, shared_allocation_mode: String(r[10]), volumes: values.map(function (row) {
        var fields = {}; defs.forEach(function (d, i) { fields[d.id] = row[i] === '' ? null : row[i]; });
        return { id: String(row[21]), values: fields };
      }) }, true);
    }
    function writePlan(ctx, value, commit) {
      var desired = PPPVolumes.normalize(value, false), entry = info(ctx.scenario_id);
      if (!entry || entry.values[7] !== 'ready') fail('program_missing');
      var before = readCollection(ctx, ctx.scenario_id);
      if (desired.volumes.length < before.volumes.length || before.volumes.some(function (v, i) { return desired.volumes[i].id !== v.id; })) fail('volume_identity_conflict');
      if (hooks.hash(PPPVolumes.stable(formulaMaterial(entry))) !== entry.values[9]) fail('native_formula_manifest_changed');
      var program = ss.getSheetByName(String(entry.values[1])), defs = PPPVolumes.fields(), formulas = program.getRange(7, 1, 16, 21).getFormulas();
      // Validate ALL destinations before the first write. A formerly editable
      // input turned into a native formula is no longer a client destination.
      desired.volumes.forEach(function (row, i) { defs.forEach(function (d, j) {
        if (d.writable && formulas[i][j]) fail('protected_native_driver');
        if (d.derived && !formulas[i][j]) fail('native_formula_missing');
        if (i < desired.count && d.writable && row.values[d.id] === null) fail('active_driver_missing');
      }); });
      desired.volumes.slice(0, desired.count).forEach(function (row) {
        var v = row.values;
        // Domain validation only: no money or displayed result is computed here.
        // For nonnegative inputs Math.round matches native ROUND(D*E;0). Sheets
        // remains authoritative for the returned total F and private area H.
        if (v.open_courtyard_m2 > v.footprint_m2 || v.commercial_ground_m2 + v.ground_services_m2 > v.footprint_m2 || Math.round(v.units_per_level * v.residential_levels) * v.private_area_per_unit_m2 > (v.footprint_m2 - v.open_courtyard_m2) * v.residential_levels) fail('native_geometry_conflict');
        // The inherited debt, IRR and waterfall ranges span months 1..120.
        // Transport bounds are broader; they do not authorize dropping cash
        // outside that native horizon or the predevelopment payment window.
        var end = v.construction_start_month + v.construction_duration_months - 1, horizon = end + v.delivery_months;
        if (v.construction_start_month < 1 || v.sales_start_month < 1 || v.construction_start_month <= v.sales_start_month || horizon > 120 || v.sales_start_month + v.presale_months - 1 > horizon) fail('native_horizon_conflict');
      });
      // A vertical collection with no built area above or below grade is not a
      // native financial program: it would divide every flow by zero hard cost.
      // This is a quantity-domain guard, never a monetary estimate.
      if (!desired.volumes.slice(0, desired.count).some(function (row) { var v = row.values; return (v.footprint_m2 - v.open_courtyard_m2) * v.residential_levels + v.commercial_ground_m2 + v.ground_services_m2 + v.basement_area_m2 > 0; })) fail('native_geometry_conflict');
      var commonHorizon = program.getRange('Y6').getValue();
      if (typeof commonHorizon !== 'number' || !isFinite(commonHorizon) || commonHorizon < 0 || commonHorizon > 120) fail('native_horizon_conflict');
      var allocations = ss.getSheetByName('PA_' + String(ctx.scenario_id).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60));
      if (!allocations) fail('native_allocations_missing');
      if (allocations.getLastRow() > 1) {
        // Explicit policy is part of the immutable proposal. Raw PA weights are
        // never edited or normalized by a count/driver save.
        if (desired.shared_allocation_mode === 'built_area' && desired.volumes.slice(0, desired.count).reduce(function (sum, row) { var v = row.values; return sum + (v.footprint_m2 - v.open_courtyard_m2) * v.residential_levels + v.commercial_ground_m2 + v.ground_services_m2; }, 0) <= 0) fail('shared_allocation_requires_reconciliation');
        allocations.getRange(2, 3, allocations.getLastRow() - 1, 16).getValues().forEach(function (weights) {
          var active = weights.slice(0, desired.count);
          if (weights.some(function (v) { return typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1; }) || (desired.shared_allocation_mode === 'preserve' && Math.abs(active.reduce(function (a, b) { return a + b; }, 0) - 1) > 1e-9)) fail('shared_allocation_requires_reconciliation');
        });
      }
      if (typeof hooks.atomicWrite !== 'function') fail('atomic_native_writer_required');
      var requests = [];
      function update(sheet, row, column, matrix) {
        requests.push({ updateCells: { range: { sheetId: sheet.getSheetId(), startRowIndex: row - 1, endRowIndex: row - 1 + matrix.length, startColumnIndex: column - 1, endColumnIndex: column - 1 + matrix[0].length }, rows: matrix.map(function (r) { return { values: r.map(function (v) { return v === '' || v === null ? {} : { userEnteredValue: typeof v === 'number' ? { numberValue: v } : { stringValue: String(v) } }; }) }; }), fields: 'userEnteredValue' } });
      }
      // Contiguous driver blocks exclude every protected derived column. All
      // blocks, identities and count commit in ONE Sheets batchUpdate request.
      [[1, 5], [7, 1], [10, 2], [14, 1], [16, 2], [19, 3]].forEach(function (block) {
        var matrix = desired.volumes.map(function (row) { return defs.slice(block[0] - 1, block[0] - 1 + block[1]).map(function (d) { return row.values[d.id] === null ? '' : row.values[d.id]; }); });
        update(program, 7, block[0], matrix);
      });
      update(program, 7, 22, desired.volumes.map(function (v) { return [v.id]; }));
      update(idx(false), entry.row, 4, [[desired.count, desired.volumes.length]]);
      update(idx(false), entry.row, 11, [[desired.shared_allocation_mode]]);
      if (commit) {
        var ledger = ss.getSheetByName('Volumenes_Operaciones');
        if (!ledger || ledger.getSheetId() !== commit.ledger_sheet_id || !Number.isInteger(commit.ledger_row) || commit.ledger_row < 2) fail('operation_marker_mismatch');
        var row = ledger.getRange(commit.ledger_row, 1, 1, 7).getValues()[0];
        if (row[0] !== commit.request_id || row[1] !== ctx.caso_id || row[2] !== ctx.scenario_id || row[3] !== ctx.actor || row[3] !== commit.actor || row[5] !== commit.payload_hash || row[6] !== 'pending') fail('operation_marker_mismatch');
        update(ledger, commit.ledger_row, 7, [['applied']]);
      }
      return requests;
    }
    function writeDrivers(ctx, value, commit) {
      if (!commit) fail('operation_marker_required');
      hooks.atomicWrite(ss.getId(), writePlan(ctx, value, commit));
    }
    function formulaMaterial(entry) {
      return [String(entry.values[1]), String(entry.values[2]), 'PA_' + String(entry.values[0]).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60)].map(function (name) { var h = ss.getSheetByName(name); if (!h) fail('program_missing'); return [name, h.getDataRange().getFormulas()]; });
    }
    function sharedResources(ctx) {
      var entry = info(ctx.scenario_id); if (!entry || entry.values[7] !== 'ready') return [];
      var allocation = ss.getSheetByName('PA_' + String(ctx.scenario_id).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60));
      if (!allocation) fail('native_allocations_missing');
      if (allocation.getLastRow() < 2) return [];
      return allocation.getRange(2, 1, allocation.getLastRow() - 1, 19).getValues().map(function (r) { return { id: String(r[0]), label: String(r[18] || r[0]) }; });
    }
    function revisionMaterial() {
      var sheet = idx(false); if (!sheet) return [];
      var out = [[INDEX, sheet.getDataRange().getValues(), sheet.getDataRange().getFormulas()]], seen = {};
      sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), HEADERS.length).getValues().forEach(function (r) {
        if (!r[0]) return;
        [r[1], r[2], 'PA_' + String(r[0]).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60)].forEach(function (name) {
          if (seen[name]) return; seen[name] = true; var h = ss.getSheetByName(String(name));
          if (h) out.push([String(name), h.getDataRange().getValues(), h.getDataRange().getFormulas()]);
        });
      });
      return out; // Operation receipts are deliberately outside business revision.
    }
    function validateCalculation(ctx) {
      var entry = info(ctx.scenario_id); if (!entry || entry.values[7] !== 'ready') return false;
      var program = ss.getSheetByName(String(entry.values[1]));
      return program.getRange('Y1').getValue() === true && program.getRange('Y2').getValue() === true && hooks.hash(PPPVolumes.stable(formulaMaterial(entry))) === entry.values[9];
    }
    function writeCapable(ctx) {
      var entry = info(ctx.scenario_id); if (!entry || entry.values[7] !== 'ready') return false;
      var program = ss.getSheetByName(String(entry.values[1]));
      if (!program || !program.getRange('Y5').getFormula() || hooks.hash(PPPVolumes.stable(formulaMaterial(entry))) !== entry.values[9]) return false;
      var effective = Session.getEffectiveUser().getEmail();
      return [String(entry.values[1]), String(entry.values[2]), 'PA_' + String(ctx.scenario_id).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60)].every(function (name) {
        var sheet = ss.getSheetByName(name); if (!sheet) return false;
        return sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).some(function (protection) { return !protection.isWarningOnly() && !protection.canDomainEdit() && protection.getEditors().every(function (editor) { return editor.getEmail() === effective; }); });
      });
    }
    function replaceRefs(sheet, fromProgram, toProgram, fromScenario, toScenario, sourceCount, delta) {
      var range = sheet.getDataRange(), fs = range.getFormulas(), requests = [];
      for (var i = 0; i < fs.length; i += 1) for (var j = 0; j < fs[i].length; j += 1) if (fs[i][j]) {
        var f = fs[i][j];
        // The clone's summaries/resources move after capacity expansion. A
        // financial scenario still points at the OLD program during insertion,
        // so Sheets cannot adjust those external row references for us.
        var escape = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
        var programPrefix = escape(q(fromProgram));
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(fromProgram)) programPrefix += '|' + escape(fromProgram + '!');
        f = f.replace(new RegExp('(?:' + programPrefix + ')(\\$?[A-Z]{1,3}\\$?)([0-9]+)(?::(\\$?[A-Z]{1,3}\\$?)([0-9]+))?', 'g'), function (all, column, row, endColumn, endRow) {
          var shifted = Number(row) > 6 + sourceCount ? Number(row) + delta : Number(row);
          var end = endRow ? (Number(endRow) > 6 + sourceCount ? Number(endRow) + delta : Number(endRow)) : null;
          return q(toProgram) + column + shifted + (endColumn ? ':' + endColumn + end : '');
        });
        [[fromProgram, toProgram], [fromScenario, toScenario]].forEach(function (pair) {
          f = f.split(q(pair[0])).join(q(pair[1]));
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(pair[0])) f = f.replace(new RegExp('(^|[^A-Za-z0-9_\'])' + pair[0] + '!', 'g'), function (_, prefix) { return prefix + q(pair[1]); });
        });
        if (sheet.getName() === toProgram) {
          // The source program's native summary rows move below the capacity.
          // Expand only its explicit body SUM ranges, masking inactive bodies.
          f = f.replace(new RegExp('SUM\\((\\$?[A-U]\\$?)7:\\$?([A-U])\\$?(?:' + (6 + sourceCount) + '|22)\\)', 'g'), function (all, left, right) {
            var letter = left.replace(/\$/g, ''); if (letter !== right) return all;
            return 'SUMIF($W$7:$W$22;TRUE;' + letter + '7:' + letter + '22)';
          });
        }
        if (f !== fs[i][j]) requests.push({ updateCells: { range: { sheetId: sheet.getSheetId(), startRowIndex: i, endRowIndex: i + 1, startColumnIndex: j, endColumnIndex: j + 1 }, rows: [{ values: [{ userEnteredValue: { formulaValue: f } }] }], fields: 'userEnteredValue' } });
      }
      if (requests.length) hooks.atomicWrite(ss.getId(), requests);
    }
    function protect(sheet, driverRows) {
      var protection = sheet.protect().setDescription('PPP native formulas and immutable identity: owner only');
      var defs = PPPVolumes.fields(), editable = [];
      if (driverRows) for (var i = 0; i < driverRows; i += 1) defs.forEach(function (d, j) { if (d.writable) editable.push(sheet.getRange(i + 7, j + 1)); });
      protection.setUnprotectedRanges(editable);
      protection.removeEditors(protection.getEditors());
      if (protection.canDomainEdit()) protection.setDomainEdit(false);
      return protection;
    }
    function migrate(ctx, manifest) {
      if (!hooks.isOwner(ctx)) fail('owner_required');
      if (!manifest || !manifest.operation_id || !manifest.model_revision || !manifest.reference || !manifest.reason || !manifest.test || manifest.max_volumes !== 16 || !manifest.expected_source_hash || !Number.isInteger(manifest.source_count) || manifest.source_count < 1 || manifest.source_count > 16) fail('invalid_install_manifest');
      var allocationMode = manifest.shared_allocation_mode || 'preserve';
      if (['preserve', 'built_area'].indexOf(allocationMode) < 0) fail('invalid_allocation_mode');
      var sourceCapacity = manifest.source_capacity || manifest.source_count, storedRows = manifest.source_stored_rows || manifest.source_count;
      if (!Number.isInteger(sourceCapacity) || sourceCapacity < manifest.source_count || sourceCapacity > 16 || !Number.isInteger(storedRows) || storedRows < manifest.source_count || storedRows > sourceCapacity) fail('invalid_source_capacity');
      var exists = info(ctx.scenario_id);
      if (exists) {
        if (exists.values[6] !== manifest.model_revision || exists.values[8] !== manifest.source_program) fail('migration_conflict');
        if (exists.values[7] !== 'ready') fail('migration_pending');
        return { ok: true, installed: false, collection: readCollection(ctx, ctx.scenario_id) };
      }
      var sourceProgram = ss.getSheetByName(manifest.source_program), sourceScenario = ss.getSheetByName(manifest.source_scenario);
      if (!sourceProgram || !sourceScenario) fail('native_template_missing');
      var sourceHash = hooks.hash(PPPVolumes.stable([sourceProgram.getDataRange().getFormulas(), sourceScenario.getDataRange().getFormulas()]));
      if (sourceHash !== manifest.expected_source_hash) fail('source_formula_conflict');
      if (manifest.mode === 'new-single' && manifest.source_count !== 1) fail('single_template_required');
      if (manifest.count !== manifest.source_count) fail('existing_body_count_must_be_preserved');
      var resources = manifest.resources || [], seenResources = Object.create(null);
      if (!Array.isArray(resources) || resources.length > 128) fail('invalid_shared_resources');
      resources.forEach(function (resource) {
        var label = String(resource.label || resource.id);
        if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(resource.id) || seenResources[resource.id] || !label || label !== label.trim() || label.length > 160 || /[\x00-\x1f]/.test(label)) fail('invalid_shared_resources');
        seenResources[resource.id] = true;
        if (!Array.isArray(resource.allocations) || resource.allocations.length !== manifest.source_count || !Number.isInteger(resource.source_row) || resource.source_row < 1) fail('explicit_native_allocations_required');
        if (resource.allocations.some(function (v) { return typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1; }) || (allocationMode === 'preserve' && Math.abs(resource.allocations.reduce(function (a, b) { return a + b; }, 0) - 1) > 1e-9)) fail('allocation_range');
      });
      var allocationName = 'PA_' + String(ctx.scenario_id).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60);
      var programName = manifest.target_program, scenarioName = manifest.target_scenario;
      if (!programName || !scenarioName || ss.getSheetByName(programName) || ss.getSheetByName(scenarioName)) fail('migration_target_exists');
      if (ss.getSheetByName(allocationName)) fail('allocation_target_exists');
      var indexSheet = idx(true), entryRow = indexSheet.getLastRow() + 1;
      hooks.audit({ action: 'reserve-native-volume-migration', operation_id: manifest.operation_id, actor: ctx.actor, scenario_id: ctx.scenario_id, source_hash: sourceHash, source_count: manifest.source_count, target: [programName, scenarioName], reference: manifest.reference, reason: manifest.reason, test: manifest.test });
      // A durable reservation exists before copies/formulas. A failed migration
      // remains pending; repeat calls do not copy a second program or financial model.
      indexSheet.appendRow([ctx.scenario_id, programName, scenarioName, manifest.count, storedRows, 16, manifest.model_revision, 'pending', manifest.source_program, '', allocationMode]); flush();
      var program = sourceProgram.copyTo(ss).setName(programName), scenario = sourceScenario.copyTo(ss).setName(scenarioName), delta = 16 - sourceCapacity;
      if (delta) program.insertRowsAfter(6 + sourceCapacity, delta);
      if (program.getMaxColumns() < 25) program.insertColumnsAfter(program.getMaxColumns(), 25 - program.getMaxColumns());
      replaceRefs(program, manifest.source_program, programName, manifest.source_scenario, scenarioName, sourceCapacity, delta);
      replaceRefs(scenario, manifest.source_program, programName, manifest.source_scenario, scenarioName, sourceCapacity, delta);
      program.getRange(6, 22, 1, 4).setValues([['volume_id', 'active', '', 'native_validation']]);
      var ids = [], flags = [];
      for (var r = 0; r < 16; r += 1) {
        ids.push([r < storedRows ? (manifest.volume_ids && manifest.volume_ids[r] || 'volume-' + (r + 1)) : '']);
        flags.push(['=' + (r + 1) + '<=' + q(INDEX) + '$D$' + entryRow]);
      }
      program.getRange(7, 22, 16, 1).setValues(ids); program.getRange(7, 23, 16, 1).setFormulas(flags);
      var allocation = ss.insertSheet(allocationName);
      allocation.getRange(1, 1, 1, 19).setValues([['resource_id', 'source', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', 'label']]);
      var configuredResources = resources.map(function (resource, i) {
        if (!Array.isArray(resource.allocations) || resource.allocations.length !== manifest.source_count || !Number.isInteger(resource.source_row)) fail('explicit_native_allocations_required');
        var weights = resource.allocations.slice(); while (weights.length < 16) weights.push(0);
        if (weights.some(function (v) { return typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1; })) fail('allocation_range');
        var rr = i + 2, sourceRow = resource.source_row > 6 + sourceCapacity ? resource.source_row + delta : resource.source_row;
        var label = String(resource.label || resource.id);
        if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(resource.id) || !label || label !== label.trim() || label.length > 160 || /[\x00-\x1f]/.test(label)) fail('invalid_shared_resources');
        allocation.getRange(rr, 1, 1, 19).setValues([[resource.id, q(programName) + '$B$' + sourceRow].concat(weights, [label])]);
        return { cost_ref: q(programName) + '$B$' + sourceRow, allocation_refs: weights.map(function (_, j) { return q(allocationName) + '$' + col(j + 3) + '$' + rr; }) };
      });
      var metricRows = {}, defs = scenario.getRange(8, 6, 228, 1).getValues(); defs.forEach(function (v, i) { if (v[0]) metricRows[String(v[0])] = i + 8; });
      function ref(key) { if (!metricRows[key]) fail('missing_native_metric_' + key); return q(scenarioName) + '$G$' + metricRows[key]; }
      var mapping = { hard: 'hard', price_residential: 'p.preViv', presale_effective: 'preventaEfectiva', downpayment: 'p.eng', construction_payment: 'p.obra', land_cash: 'landCash', land_closing: 'closing', indirect: 'indirect', legal: 'legal', contingency: 'p.imp', commission: 'p.comision', units: 'units', residential_sellable: 'resSell', build_finish: 'buildFinish', total_months: 'totalMonths', presale_discount: 'p.desc', commercial_revenue: 'comRev', parking_revenue: 'parkingRev', delivery_months_global: 'p.delivery', commission_total: 'commission', sales_total: 'sales', contingency_total: 'cont' }, metricCells = {};
      Object.keys(mapping).forEach(function (key) { metricCells[key] = ref(mapping[key]); });
      var relocation = manifest.relocation ? { total_ref: q(programName) + '$B$' + (manifest.relocation.total_row + delta), start_ref: q(programName) + '$B$' + (manifest.relocation.start_row + delta), end_ref: q(programName) + '$B$' + (manifest.relocation.end_row + delta) } : null;
      if (typeof manifest.inventory_formula !== 'string' || manifest.inventory_formula.charAt(0) !== '=') fail('native_inventory_formula_required');
      program.getRange('Y3').setFormula(manifest.inventory_formula.split(q(manifest.source_scenario)).join(q(scenarioName)));
      if (typeof manifest.inventory_area_formula !== 'string' || manifest.inventory_area_formula.charAt(0) !== '=') fail('native_inventory_formula_required');
      program.getRange('Y4').setFormula(manifest.inventory_area_formula.split(q(manifest.source_scenario)).join(q(scenarioName)));
      var plan = PPPVolumesFormulas.build({ program_name: programName, scenario_name: scenarioName, first_row: 7, max_volumes: 16, count_ref: q(INDEX) + '$D$' + entryRow, allocation_mode_ref: q(INDEX) + '$K$' + entryRow, rate_above_ref: q(scenarioName) + '$B$59', rate_basement_ref: q(scenarioName) + '$B$60', metric_cells: metricCells, months: 120, resources: configuredResources, relocation: relocation, program_valid_ref: 'Y1', inventory_units_ref: q(programName) + '$Y$3', inventory_area_ref: q(programName) + '$Y$4', separator: ';' });
      hooks.audit({ action: 'install-native-volume-formulas', operation_id: manifest.operation_id, actor: ctx.actor, scenario_id: ctx.scenario_id, before_hash: sourceHash, patches: plan.patches, reference: manifest.reference, reason: manifest.reason, test: manifest.test });
      var formulaRequests = plan.patches.map(function (patch) {
        var sheet = ss.getSheetByName(patch.sheet), address = PPPVolumesFormulas.cellAddress(patch.range);
        return { updateCells: { range: { sheetId: sheet.getSheetId(), startRowIndex: address.row - 1, endRowIndex: address.row, startColumnIndex: address.column - 1, endColumnIndex: address.column }, rows: [{ values: [{ userEnteredValue: { formulaValue: patch.formula } }] }], fields: 'userEnteredValue' } };
      });
      hooks.atomicWrite(ss.getId(), formulaRequests);
      var validation = '=AND(ABS(SUM(' + q(scenarioName) + 'L8:L127)-' + ref('sales') + ')<1;ABS(SUM(' + q(scenarioName) + 'M8:M127)-' + ref('cashCost') + ')<1;ABS(' + ref('cashReconciliation') + ')<1;' + ref('horizonPass') + ')';
      program.getRange('Y2').setFormula(validation);
      program.getRange('Y6').setFormula(relocation ? '=MAX(0;' + relocation.end_ref + '-1)' : '=0');
      function parityDifferenceFormula(source, target) { return 'SUMPRODUCT(IF(' + source + '=' + target + ';0;IF(ISNUMBER(' + source + ')*ISNUMBER(' + target + ');ABS(' + source + '-' + target + ');1000000000)))'; }
      program.getRange('Y5').setFormula('=AND(' + parityDifferenceFormula(q(manifest.source_scenario) + 'G8:G235', q(scenarioName) + 'G8:G235') + '<1;' + parityDifferenceFormula(q(manifest.source_scenario) + 'J8:AI127', q(scenarioName) + 'J8:AI127') + '<1)');
      protect(program, 16); protect(scenario, false); protect(allocation, false); protect(indexSheet, false); flush();
      var entry = { row: entryRow, values: [ctx.scenario_id, programName, scenarioName, manifest.count, storedRows, 16, manifest.model_revision, 'ready', manifest.source_program, '', allocationMode] };
      entry.values[9] = hooks.hash(PPPVolumes.stable(formulaMaterial(entry)));
      if (program.getRange('Y1').getValue() !== true || program.getRange('Y2').getValue() !== true || program.getRange('Y5').getValue() !== true) {
        entry.values[7] = 'validation_failed'; indexSheet.getRange(entryRow, 1, 1, HEADERS.length).setValues([entry.values]); flush();
        hooks.audit({ action: 'native-volume-baseline-validation-failed', operation_id: manifest.operation_id, scenario_id: ctx.scenario_id, formula_hash: entry.values[9] });
        fail('native_baseline_validation_failed');
      }
      indexSheet.getRange(entryRow, 1, 1, HEADERS.length).setValues([entry.values]); flush();
      return { ok: true, installed: true, scenario_sheet: scenarioName, program_sheet: programName, collection: readCollection(ctx, ctx.scenario_id), calculated: validateCalculation(ctx) };
    }
    return { info: info, readCollection: readCollection, sharedResources: sharedResources, writeDrivers: writeDrivers, validateWrite: function (ctx, before, desired) { writePlan(ctx, desired); return true; }, writePlan: writePlan, revisionMaterial: revisionMaterial, validateCalculation: validateCalculation, writeCapable: writeCapable, migrate: migrate, protectLedger: function (ctx, sheet) { protect(sheet, false); } };
  }
  return { createStore: createStore };
}());
