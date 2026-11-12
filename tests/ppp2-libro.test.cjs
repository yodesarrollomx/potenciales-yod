'use strict';
/* El libro de PPP 2 cuadra solo. El accesorio tests/fixtures/ppp2-libro-ejemplo.json es la
   plantilla real (ppp2/libro/generar.py) con el plan INVENTADO de ppp2/libro/ejemplo-plan.json,
   recalculada por una hoja de cálculo (LibreOffice). Si alguien rompe una fórmula de la
   plantilla y regenera el accesorio, estas comprobaciones lo detectan. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const L = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ppp2-libro-ejemplo.json'), 'utf8'));

function fila(hoja, clave) {
  const r = L[hoja].valores.find((f) => String(f[0]).trim() === clave);
  assert.ok(r, hoja + ': falta ' + clave);
  return r;
}
const ver = (clave) => fila('Versiones', clave).slice(2, 5);
const resumen = (clave) => fila('Resumen', clave)[1];

test('cada versión cuadra: flujo, cobranza y unidades', () => {
  for (const v of ver("ck_flujo")) assert.ok(Math.abs(v) < 1e-4, 'flujo ' + v);
  for (const v of ver('ck_cobranza')) assert.ok(Math.abs(Number(v) || 0) < 1e-6, 'cobranza ' + v);
  for (const v of ver('ck_unidades')) assert.equal(Number(v) || 0, 0);
});

test('la ganancia real es la caja al cierre menos la tierra, y el reparto suma el resultado', () => {
  const caja = ver('caja_cierre'), tierra = ver('tierra'), gan = ver('ganancia'), rep = ver('resultado_repartir'), rend = ver('rend_capital');
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(caja[k] - tierra[k] - gan[k]) < 1e-4);
    assert.ok(Math.abs(caja[k] + rend[k] - rep[k]) < 1e-4, "reparto " + k);
  }
  const check = L.Reparto.valores.find((f) => /^Comprobación/.test(String(f[0])));
  for (const v of check.slice(1, 6)) assert.ok(Math.abs(v) < 1e-6, 'reparto ' + v);
});

test('sin banco no hay pruebas de banco; con banco y preventa suficiente la versión pasa', () => {
  assert.equal(ver('rv_linea_ventas')[0], 'sin banco');
  assert.match(ver('rv_resultado')[0], /^No pasa/);
  assert.match(ver('rv_resultado')[1], /^Pasa/);
  assert.ok(ver('respaldo')[0] > 0, 'la base sin banco necesita respaldo');
  assert.equal(Number(ver('respaldo')[1]) || 0, 0, 'la versión con banco no necesita respaldo');
});

test('el resumen que lee el servidor trae edad, versión mostrada y lo que recibe el dueño', () => {
  assert.equal(resumen('esquema'), 'ppp2-libro-v1');
  assert.equal(resumen('plan.edad'), 'plántula');
  assert.equal(resumen('plan.version_mostrada'), 2);
  assert.ok(resumen('v2.dueno_recibe') > resumen('v2.dueno_aporta'));
  assert.ok(String(resumen('plan.siguiente_pregunta')).length > 10);
});

test('la plantilla no trae datos de planes reales', () => {
  for (const f of ['ppp2/libro/generar.py', 'ppp2/libro/ejemplo-plan.json', 'tests/fixtures/ppp2-libro-ejemplo.json']) {
    const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    assert.doesNotMatch(t, /Mor[eé]o|Avermont|Morelos|Colinas del Bachoco|aurumarquitectos/i, f);
  }
});
