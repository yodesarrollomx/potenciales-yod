/* Optional extension of the native vertical workbook. Formula text only.
 * This module never calculates a financial result in JavaScript. */
var PPPLandInKind = (function () {
  'use strict';
  var VERSION = 'native-land-in-kind-v1';
  var fields = [
    ['method', 'Acuerdo (1 utilidad, 2 interés simple, 3 ventas)', 250, 1, 3, true],
    ['upfront', 'Anticipo al inicio (MXN)', 251, 0, 1e12, false],
    ['profit_share', 'Participación en utilidad (%)', 252, 0, 100, false],
    ['annual_rate', 'Interés simple anual del saldo (%)', 253, 0, 100, false],
    ['sales_share', 'Pago total como porcentaje de ventas (%)', 254, 0, 100, false],
    ['delivery_start', 'Primera entrega (mes)', 255, 1, 120, true],
    ['delivery_months', 'Meses de entrega', 256, 1, 120, true],
    ['reserved_area', 'Vivienda reservada para pago (m²)', 257, 0, 1e7, false],
    ['commission_in_kind', 'Comisión también sobre adjudicaciones (0/1)', 258, 0, 1, true]
  ];
  function fail(code) { throw Error(code); }
  function validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('land_terms_invalid');
    var out = {};
    if (Object.keys(value).some(function (k) { return !fields.some(function (f) { return f[0] === k; }); })) fail('land_terms_unknown');
    fields.forEach(function (f) {
      var n = value[f[0]];
      if (typeof n !== 'number' || !isFinite(n) || n < f[3] || n > f[4] || f[5] && Math.floor(n) !== n) fail('land_terms_' + f[0]);
      out[f[0]] = n;
    });
    if (out.delivery_start + out.delivery_months - 1 > 120) fail('land_delivery_horizon');
    return out;
  }
  function build(baseline) {
    if (!baseline || !Array.isArray(baseline.revenue) || baseline.revenue.length !== 120 || baseline.revenue.some(function (f) { return typeof f !== 'string' || f[0] !== '='; })) fail('land_native_revenue_missing');
    var patches = [], metrics = [];
    function put(cell, formula) { patches.push({cell:cell, formula:formula}); }
    function metric(row, key, formula) { metrics.push({row:row, key:key}); put('G' + row, formula); }
    // The physical program is unchanged. Only the inventory that collects cash
    // is reduced, at the same native price and presale discount.
    put('G157', '=MAX(0;$G$88-$B$257)*$G$156');
    put('G158', '=IFERROR($G$97*(1-$B$257/$G$88)*$G$156;0)');
    put('G159', '=IFERROR($G$158/$G$56;0)');
    put('G161', '=MAX(0;$G$88-$B$257-$G$157)*$G$49');
    put('G166', '=$B$251');
    put('G172', '=IF($B$87>0;0;($G$164+IF($B$258=1;$G$250;0))*$G$65)');
    put('G198', '=MAX(0;$G$165-$B$251)');
    put('G76', '=IFERROR($G$198/$G$165;0)');
    put('G201', '=IF($B$250=2;$G$198*$B$253/100*($B$255-1+($B$256-1)/2)/12;0)');
    put('G202', '=0');
    put('G204', '=IF($B$250=1;$B$252/100;0)');
    put('G205', '=$G$208+$G$209');
    put('G206', '=$G$210');
    put('G207', '=MAX(0;$G$196-$G$209)');
    put('G208', '=MIN($G$198;$G$250)');
    put('G209', '=MIN($G$196;$G$199)');
    put('G210', '=IF($B$250=2;MAX(0;$G$250-$G$208);0)');
    put('G211', '=0');
    put('G212', '=IF($B$250=2;0;MAX(0;$G$250-$G$208))');
    put('G213', '=$G$196-$G$209');
    put('G214', '=$G$250');
    put('G215', '=$G$196');
    put('G223', '=$G$164+$G$250-$G$173-$G$183-$G$185');
    put('G224', '=IFERROR($G$223/($G$164+$G$250);0)');
    put('G225', '=IFERROR(($G$164+$G$250-$G$173)/($G$164+$G$250);0)');
    put('G227', '=IFERROR(MAX(0;($G$173+$G$183+$G$185-$G$162-$G$163)/((MAX(0;$G$88-$B$257)*$G$226)+$B$257));0)');
    metric(250, 'kindValue', '=$B$257*$G$49');
    metric(251, 'kindTarget', '=IF($B$250=1;$G$198+MAX(0;$G$223)*$B$252/100;IF($B$250=2;$G$198+$G$201;MAX(0;($G$164+$G$250)*$B$254/100-$B$251)))');
    metric(252, 'kindDifference', '=$G$250-$G$251');
    metric(253, 'kindReservedArea', '=$B$257');
    metric(254, 'kindEquivalentUnits', '=IFERROR($B$257/$G$88*$G$97;0)');
    metric(255, 'kindCashArea', '=MAX(0;$G$88-$B$257)');
    metric(256, 'kindCashUnits', '=IFERROR($G$255/$G$88*$G$97;0)');
    metric(257, 'kindGrossValue', '=$G$164+$G$250');
    metric(258, 'kindBalanced', '=ABS($G$252)<=1');
    metric(259, 'kindProgramValid', '=AND($G$165>0;$B$251<=$G$165;$G$88>0;$B$257<=$G$88;$B$255>$G$177;$B$255+$B$256-1<=$G$178)');
    metric(260, 'kindDebtAtDelivery', '=MAX(FILTER($AC$8:$AC$127;$J$8:$J$127>=$B$255;$J$8:$J$127<$B$255+$B$256))');
    metric(261, 'kindReady', '=AND($G$258;$G$259;$G$260<1;$G$190<1;ABS($G$195)<1;ABS($G$268)<1)');
    metric(262, 'kindMethod', '=$B$250');
    metric(263, 'kindUpfront', '=$B$251');
    metric(264, 'kindAnnualRate', '=$B$253/100');
    metric(265, 'kindSalesShare', '=$B$254/100');
    metric(266, 'kindProfitShare', '=$B$252/100');
    metric(267, 'kindInventoryCheck', '=$G$253+$G$255-$G$88');
    metric(268, 'kindEconomicCheck', '=$G$217+$G$218-$G$223');
    metric(269, 'kindDeliveryStart', '=$B$255');
    metric(270, 'kindDeliveryEnd', '=$B$255+$B$256-1');
    for (var row = 8; row < 128; row++) {
      var month = '$J' + row;
      var common = 'IF(AND(' + month + '>$G$178-$G$57;' + month + '<=$G$178);($G$162+$G$163)/$G$57;0)';
      put('L' + row, '=(' + baseline.revenue[row-8].slice(1) + '-(' + common + '))*(1-IFERROR($B$257/$G$88;0))+(' + common + ')');
      var during = 'AND(' + month + '>=$B$255;' + month + '<$B$255+$B$256)';
      var payment = 'IF($B$250=2;IFERROR($G$250/$G$251;0)*($G$198/$B$256+$G$198*$B$253/100/12*IF(' + month + '=$B$255;$B$255-1;1-(' + month + '-$B$255)/$B$256));$G$250/$B$256)';
      put('AG' + row, '=IF(' + month + '=1;-$G$198;0)+IF(' + during + ';' + payment + ';0)');
      put('AH' + row, '=0');
    }
    return {version:VERSION, fields:fields, patches:patches, metrics:metrics};
  }
  // Root finding is orchestration: evaluate writes a trial area and reads the
  // signed difference calculated by Sheets. No finance is reproduced here.
  function solve(evaluate, maximum, tolerance) {
    if (typeof evaluate !== 'function' || !isFinite(maximum) || maximum <= 0) fail('land_solver_invalid');
    tolerance = tolerance === undefined ? 1 : tolerance;
    function run(x) { var v=evaluate(x); if(typeof v!=='number'||!isFinite(v))fail('land_solver_non_numeric');return v; }
    var lo=0, hi=maximum, a=run(lo), b=run(hi), x, v, side=0;
    if(Math.abs(a)<=tolerance){run(lo);return lo;}
    if(Math.abs(b)<=tolerance)return hi;
    if(a>0||b<0)fail('land_inventory_insufficient');
    for(var n=0;n<36;n++) {
      x=(lo*b-hi*a)/(b-a);
      if(!isFinite(x)||x<=lo||x>=hi||n%6===5)x=(lo+hi)/2;
      v=run(x);
      if(Math.abs(v)<=tolerance)return x;
      if(v<0){lo=x;a=v;if(side===-1)b/=2;side=-1;}else{hi=x;b=v;if(side===1)a/=2;side=1;}
    }
    fail('land_solver_not_converged');
  }
  return {version:VERSION,fields:fields,validate:validate,build:build,solve:solve};
}());
if (typeof module !== 'undefined') module.exports = PPPLandInKind;
