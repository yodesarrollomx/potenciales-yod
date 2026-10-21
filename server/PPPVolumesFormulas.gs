/* Formula TEXT installer plan derived from the native vertical program.
 * All evaluation is performed by Google Sheets; GAS does not calculate money.
 * Sheet names, metric coordinates, resources and allocations are owner manifests,
 * never request parameters. Existing template formulas must be captured first.
 */
var PPPVolumesFormulas = (function () {
  'use strict';
  function fail(code) { throw new Error(code); }
  function q(name) { if (typeof name !== 'string' || !name || name.length > 100) fail('sheet_name'); return "'" + name.replace(/'/g, "''") + "'!"; }
  function cell(value) { if (typeof value !== 'string' || !/^(?:'(?:[^']|'')+'!|[A-Za-z0-9_]+!)?\$?[A-Z]{1,3}\$?[1-9][0-9]*(?::\$?[A-Z]{1,3}\$?[1-9][0-9]*)?$/.test(value)) fail('native_cell_reference'); return value; }
  function cellAddress(a1) {
    var match = typeof a1 === 'string' && /^\$?([A-Z]{1,3})\$?([1-9][0-9]*)$/.exec(a1), column = 0;
    if (!match) fail('native_formula_patch_range');
    for (var i = 0; i < match[1].length; i += 1) column = column * 26 + match[1].charCodeAt(i) - 64;
    return { row: Number(match[2]), column: column };
  }
  function build(config) {
    var program = q(config.program_name), scenario = q(config.scenario_name), first = config.first_row || 7, count = cell(config.count_ref), limit = config.max_volumes || 16, sep = config.separator === ';' ? ';' : ',';
    if (!Number.isInteger(first) || first < 1 || !Number.isInteger(limit) || limit < 1 || limit > 16) fail('program_dimensions');
    var metrics = config.metric_cells || {}, patches = [], resources = config.resources || [];
    var mode = config.allocation_mode_ref ? cell(config.allocation_mode_ref) : '"preserve"';
    if (resources.length && !config.allocation_mode_ref) fail('allocation_mode_reference_required');
    var needed = ['hard', 'price_residential', 'presale_effective', 'downpayment', 'construction_payment', 'land_cash', 'land_closing', 'indirect', 'legal', 'contingency', 'commission', 'units', 'residential_sellable', 'build_finish', 'total_months', 'presale_discount', 'commercial_revenue', 'parking_revenue', 'delivery_months_global', 'commission_total', 'sales_total', 'contingency_total'];
    needed.forEach(function (key) { cell(metrics[key]); });
    var rateAbove = cell(config.rate_above_ref), rateBasement = cell(config.rate_basement_ref);
    resources.forEach(function (r) { cell(r.cost_ref); if (!Array.isArray(r.allocation_refs) || r.allocation_refs.length !== limit) fail('resource_allocations'); r.allocation_refs.forEach(cell); });
    function m(key) { return metrics[key]; }
    function patch(sheet, a1, formula) { patches.push({ sheet: sheet, range: a1, formula: formula.replace(/,/g, sep) }); }
    function active(i) { return '(' + (i + 1) + '<=' + count + ')'; }
    function p(col, row) { return program + '$' + col + '$' + row; }
    function wave(month, row) {
      return 'IF(AND(' + month + '>=' + p('P', row) + ',' + month + '<=' + p('R', row) + '),SIN(PI()*(' + month + '-' + p('P', row) + '+1/2)/' + p('Q', row) + ')*SIN(PI()/(2*' + p('Q', row) + ')),0)';
    }
    var last = first + limit - 1, activeArea = 'SUM(' + program + '$M$' + first + ':$M$' + last + ')';
    for (var i = 0; i < limit; i += 1) {
      var r = first + i, gate = active(i);
      [['F', ['D', 'E'], 'ROUND(D' + r + '*E' + r + ',0)'], ['H', ['F', 'G'], 'F' + r + '*G' + r], ['I', ['B', 'C', 'D'], '(B' + r + '-C' + r + ')*D' + r], ['L', ['J', 'K'], 'J' + r + '+K' + r], ['M', ['I', 'L'], 'I' + r + '+L' + r], ['R', ['P', 'Q'], 'P' + r + '+Q' + r + '-1']].forEach(function (d) {
        var args = d[1].map(function (col) { return col + r; }).join(',');
        patch(config.program_name, d[0] + r, '=IF(NOT(' + gate + '),0,IF(COUNT(' + args + ')<' + d[1].length + ',"",' + d[2] + '))');
      });
      var shared = resources.map(function (resource) { return '(' + cell(resource.cost_ref) + '*IF(' + mode + '="built_area",IFERROR(M' + r + '/' + activeArea + ',0),' + cell(resource.allocation_refs[i]) + '))'; });
      patch(config.program_name, 'O' + r, '=IF(NOT(' + gate + '),0,IF(COUNT(M' + r + ',N' + r + ',' + rateAbove + ',' + rateBasement + ')<4,"",M' + r + '*' + rateAbove + '+N' + r + '*' + rateBasement + (shared.length ? '+' + shared.join('+') : '') + '))');
    }
    // The owner-reviewed rule is explicit and version-bound. The preserve path
    // retains PA weights exactly; built_area is evaluated in Sheets from active
    // above-grade M only. Raw PA weights are never rewritten.
    var checks = resources.map(function (resource) {
      var terms = resource.allocation_refs.map(function (ref, i) { return 'IF(' + active(i) + ',' + cell(ref) + ',0)'; });
      return 'AND(COUNT(' + cell(resource.cost_ref) + ')=1,' + cell(resource.cost_ref) + '>=0,IF(' + mode + '="built_area",' + activeArea + '>0,ABS((' + terms.join('+') + ')-1)<1/1000000000),' + resource.allocation_refs.map(function (ref) { return 'AND(COUNT(' + cell(ref) + ')=1,' + cell(ref) + '>=0,' + cell(ref) + '<=1)'; }).join(',') + ')';
    });
    checks.push('OR(' + mode + '="preserve",' + mode + '="built_area")');
    var numericCols = ['B', 'C', 'D', 'E', 'G', 'J', 'K', 'N', 'P', 'Q', 'S', 'T', 'U'];
    var validRows = [];
    for (var vi = 0; vi < limit; vi += 1) {
      var vr = first + vi;
      validRows.push('IF(' + active(vi) + ',AND(COUNT(' + numericCols.map(function (col) { return p(col, vr); }).join(',') + ')=13,' + p('B', vr) + '>=' + p('C', vr) + ',' + p('H', vr) + '<=' + p('I', vr) + ',' + p('L', vr) + '<=' + p('B', vr) + ',' + p('Q', vr) + '>0,' + p('T', vr) + '>0,' + p('U', vr) + '>0),TRUE)');
    }
    var quantityCheck = 'AND(' + validRows.concat(checks).join(',') + ')';
    if (config.inventory_units_ref) quantityCheck = 'AND(' + quantityCheck + ',SUM(' + p('F', first) + ':' + '$F$' + last + ')=' + cell(config.inventory_units_ref) + ')';
    if (config.inventory_area_ref) quantityCheck = 'AND(' + quantityCheck + ',ABS(SUM(' + p('H', first) + ':' + '$H$' + last + ')-' + cell(config.inventory_area_ref) + ')<1/1000000)';
    if (config.program_valid_ref) patch(config.program_name, config.program_valid_ref, '=' + quantityCheck);
    function total(col) { return 'SUM(' + program + '$' + col + '$' + first + ':$' + col + '$' + last + ')'; }
    patch(config.scenario_name, metrics.units.replace(/^.*!/, ''), '=' + total('F'));
    patch(config.scenario_name, metrics.residential_sellable.replace(/^.*!/, ''), '=' + total('H'));
    patch(config.scenario_name, metrics.hard.replace(/^.*!/, ''), '=' + total('O'));
    patch(config.scenario_name, metrics.build_finish.replace(/^.*!/, ''), '=MAX(' + program + '$R$' + first + ':$R$' + last + ')');
    var finishes = [];
    for (var fi = 0; fi < limit; fi += 1) finishes.push('IF(' + active(fi) + ',' + p('R', first + fi) + '+' + p('U', first + fi) + ',0)');
    if (config.relocation) finishes.push('MAX(0,' + cell(config.relocation.end_ref) + '-1)');
    patch(config.scenario_name, metrics.total_months.replace(/^.*!/, ''), '=MAX(' + finishes.join(',') + ')');
    var months = config.months || 120, flowStart = config.flow_first_row || 8;
    if (!Number.isInteger(months) || months < 1 || months > 1200 || !Number.isInteger(flowStart)) fail('flow_dimensions');
    for (var f = flowStart; f < flowStart + months; f += 1) {
      var month = '$J' + f, weights = [], revenues = [], costs = [], predev = [];
      for (var b = 0; b < limit; b += 1) {
        var row = first + b, on = active(b), w = wave(month, row), cost = p('O', row);
        weights.push('IF(' + on + ',(' + w + ')*' + cost + '/' + m('hard') + ',0)');
        var discountedPresale = '(' + m('presale_effective') + '*(1-' + m('presale_discount') + '))';
        revenues.push('IF(' + on + ',(' + p('H', row) + '*' + m('price_residential') + ')*(IF(AND(' + month + '>=' + p('S', row) + ',' + month + '<' + p('S', row) + '+' + p('T', row) + '),' + discountedPresale + '*' + m('downpayment') + '/' + p('T', row) + ',0)+' + discountedPresale + '*' + m('construction_payment') + '*(' + w + ')+IF(AND(' + month + '>' + p('R', row) + ',' + month + '<=' + p('R', row) + '+' + p('U', row) + '),(' + discountedPresale + '*(1-' + m('downpayment') + '-' + m('construction_payment') + ')+(1-' + m('presale_effective') + '))/' + p('U', row) + ',0)),0)');
        costs.push('IF(' + on + ',(' + cost + '+IFERROR(' + m('contingency_total') + '*' + cost + '/' + m('hard') + ',0))*(' + w + '),0)');
        var relocation = config.relocation ? cell(config.relocation.total_ref) : '0';
        predev.push('IF(AND(' + on + ',' + month + '>=' + p('S', row) + ',' + month + '<' + p('P', row) + '),(' + m('indirect') + '-' + relocation + '+' + m('legal') + ')*(' + cost + '/' + m('hard') + ')/(' + p('P', row) + '-' + p('S', row) + '),0)');
      }
      var relocationFlow = '';
      if (config.relocation) relocationFlow = '+IF(AND(' + month + '>=' + cell(config.relocation.start_ref) + ',' + month + '<' + cell(config.relocation.end_ref) + '),' + cell(config.relocation.total_ref) + '/(' + cell(config.relocation.end_ref) + '-' + cell(config.relocation.start_ref) + '),0)';
      patch(config.scenario_name, 'K' + f, '=' + weights.join('+'));
      // Native legacy revenue policy collects common commercial/parking sales
      // once in the final delivery window, not once for every volume.
      var commonRevenue = '+IF(AND(' + month + '>' + m('total_months') + '-' + m('delivery_months_global') + ',' + month + '<=' + m('total_months') + '),(' + m('commercial_revenue') + '+' + m('parking_revenue') + ')/' + m('delivery_months_global') + ',0)';
      patch(config.scenario_name, 'L' + f, '=' + revenues.join('+') + commonRevenue);
      // Land/closing and relocation are each outside the per-volume sum.
      patch(config.scenario_name, 'M' + f, '=IF(' + month + '=1,' + m('land_cash') + '+' + m('land_closing') + ',0)+' + costs.join('+') + '+' + predev.join('+') + relocationFlow + '+IFERROR(L' + f + '*' + m('commission_total') + '/' + m('sales_total') + ',0)');
    }
    return { schema: 2, patches: patches, required_readbacks: ['quantity/inventory reconciliation', 'explicit shared allocation policy, once per resource', 'monthly sales/cost parity', 'cash reconciliation', 'debt/cash/distribution parity', 'native horizon'], note: 'Debt, PIK, waterfall and IRR formulas remain those of the native scenario template; no client result constants.' };
  }
  return { build: build, cellAddress: cellAddress };
}());
