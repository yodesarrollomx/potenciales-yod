'use strict';
/* El lápiz de la ficha del plan.
   1) ppp2-simular: prueba otra cifra en la columna Prueba del libro, lee lo de antes y lo de después y la deja
      como estaba; nada se anota porque nada cambió.
   2) ppp2-relaciones.js: el «está ligado a» de cada dato y palanca, generado de las fórmulas de la plantilla
      (ppp2/libro/relaciones.py). Si cambia la plantilla y no se regenera, esta prueba falla.
   Plan INVENTADO (tests/ppp2-mundo.cjs); nada habla con Google. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { mundo, PLAN, EDITOR, LECTOR, filaDe } = require('./ppp2-mundo.cjs');

const RAIZ = path.join(__dirname, '..');
const pruebaDe = (mod) => Object.entries(mod.f).filter(([k]) => k.endsWith(',8'));
const b4De = (pru) => pru.getRange('B4').getFormula() || pru.getRange('B4').getValue();

test('el lápiz prueba una palanca en la columna Prueba, la deja como estaba y no anota nada', () => {
  const w = mundo();
  const mod = w.libro.getSheetByName('Modelo'), pru = w.libro.getSheetByName('Pruebas'), bit = w.libro.getSheetByName('Bitácora');
  const antes = pruebaDe(mod), b4 = b4De(pru), filas = bit.getLastRow();
  const versiones = JSON.stringify(mod.v.map((f) => [f[4], f[5], f[6]]));
  const r = w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 2, cambios: [{ clave: 'comision', valor: 0.06 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.hecho, 'simular');
  assert.deepEqual(r.cambios, [{ clave: 'comision', palanca: 'comision', valor: 0.06 }]);
  for (const k of ['ventas', 'costo_con_tierra', 'obra', 'banco_max', 'respaldo', 'costo_dinero', 'ganancia', 'mes_reparto']) {
    assert.ok(k in r.antes && k in r.despues, 'trae ' + k + ' antes y después');
  }
  for (const [k, f] of antes) assert.equal(mod.f[k], f, 'la columna Prueba vuelve a su fórmula en ' + k);
  assert.equal(b4De(pru), b4, 'la versión que se prueba vuelve a como estaba');
  assert.equal(JSON.stringify(mod.v.map((f) => [f[4], f[5], f[6]])), versiones, 'V1, V2 y V3 no se tocan: ningún visor ve el ensayo');
  assert.equal(bit.getLastRow(), filas, 'probar no se anota en la bitácora');
  assert.equal(r.plan, undefined, 'no trae el plan de vuelta: nada cambió');
});

test('un dato se prueba por la palanca que lo copia; si la versión tiene su propia cifra, el dato no la mueve', () => {
  const w = mundo();
  const r = w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 1, cambios: [{ clave: 'din.tasa_capital', valor: 0.2 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.cambios, [{ clave: 'din.tasa_capital', palanca: 'tasa_capital', valor: 0.2 }]);
  // la V2 trae su propio arranque de obra (12): cambiar el dato del calendario no la toca
  const r2 = w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 2, cambios: [{ clave: 'cal.obra_inicio', valor: 6 }] });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.deepEqual(r2.cambios, []);
  assert.equal(r2.sin_efecto.length, 1);
  assert.equal(r2.sin_efecto[0].palanca, 'obra_inicio');
  assert.equal(r2.sin_efecto[0].propia, 12);
  assert.equal(r2.antes, undefined, 'sin cambios no se recalcula nada');
});

test('un dato que también leen otras cuentas del libro no se prueba por su palanca (guardarlo movería más)', () => {
  const w = mundo();
  // la comisión de los datos también entra a la obra directa que sale de la lámina (=OBRA): probarla sólo por su
  // palanca daría otras cifras que guardarla; el servidor lo dice y no escribe nada.
  // (el accesorio sólo guarda las fórmulas del Modelo y de Pruebas: la de la obra directa se pone como la escribe la plantilla)
  const datos = w.libro.getSheetByName('Datos'), C = (k) => 'Datos!$C$' + filaDe(datos, k);
  datos.getRange(filaDe(datos, 'costo.obra_directa'), 3).setFormula('=IFERROR((' + C('lamina.costo_total') + '-' + C('tierra.valor') + '-' + C('costo.comision') + '*' + C('lamina.ventas') +
    '-' + C('costo.cierre') + '*' + C('tierra.valor') + ')/(1+' + C('costo.indirectos') + '+' + C('costo.imprevistos') + '),"")');
  const mod = w.libro.getSheetByName('Modelo'), antes = JSON.stringify(pruebaDe(mod));
  const r = w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 1, cambios: [{ clave: 'costo.comision', valor: 0.05 }] });
  assert.equal(r.error, 'sin_prueba');
  assert.equal(r.motivo, 'otros');
  assert.equal(JSON.stringify(pruebaDe(mod)), antes, 'no tocó la columna Prueba');
  ['tierra.valor', 'costo.indirectos', 'costo.imprevistos', 'costo.cierre'].forEach((clave) => {
    const x = w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 1, cambios: [{ clave, valor: 1 }] });
    assert.equal(x.error, 'sin_prueba', clave);
    assert.equal(x.motivo, 'otros', clave);
  });
  // la palanca sola (sólo en la versión) sí se prueba
  const p = w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 1, cambios: [{ clave: 'comision', valor: 0.05 }] });
  assert.equal(p.ok, true, JSON.stringify(p));
  // y el catálogo lo sabe, para que la página no ofrezca la prueba
  const R = require('vm').runInNewContext(fs.readFileSync(path.join(RAIZ, 'ppp2-relaciones.js'), 'utf8') + ';window.PPP2_RELACIONES', { window: {} });
  ['comision', 'tierra', 'indirectos', 'imprevistos', 'cierre'].forEach((k) => assert.equal(R.entradas['palanca:' + k].dato_otros, true, k));
  // el capital de los datos también lo lee el aviso del tope (Versiones), que el lápiz no enseña: sí se prueba
  ['tasa_capital', 'capital'].forEach((k) => assert.equal(R.entradas['palanca:' + k].dato_otros, undefined, k));
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 1, cambios: [{ clave: 'din.capital', valor: 100 }] }).ok, true);
});

test('el % pagado durante la obra, probado como dato de Productos, no mueve a la versión que tiene su propia cifra', () => {
  const w = mundo();
  // la V2 trae su propio 20% para el producto 1
  const r = w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 2, cambios: [{ clave: 'durante_obra_1', valor: 0.3, como_dato: true }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.cambios, []);
  assert.equal(r.sin_efecto[0].palanca, 'durante_obra_1');
  // sólo en la versión, sí
  const v = w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 2, cambios: [{ clave: 'durante_obra_1', valor: 0.3 }] });
  assert.equal(v.ok, true);
  assert.equal(v.cambios.length, 1);
});

test('el encabezado del Modelo no es una palanca: ni se prueba ni se escribe', () => {
  const w = mundo();
  const mod = w.libro.getSheetByName('Modelo'), e4 = mod.getRange(4, 5).getValue();
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 1, cambios: [{ clave: 'clave', valor: 1 }] }).error, 'clave');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-palanca', plan: PLAN, version: 1, clave: 'clave', valor: 1 }).error, 'clave');
  assert.equal(mod.getRange(4, 5).getValue(), e4);
});

test('el lápiz no prueba lo que calcula el libro, ni un dato sin columna de prueba, ni cifras inválidas', () => {
  const w = mundo();
  const post = (b) => w.post(Object.assign({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 1 }, b));
  assert.equal(post({ cambios: [{ clave: 'ventas', valor: 100 }] }).error, 'calculado');
  const sin = post({ cambios: [{ clave: 'terreno.m2', valor: 5000 }] });
  assert.equal(sin.error, 'sin_prueba');
  assert.equal(sin.clave, 'terreno.m2');
  assert.equal(post({ cambios: [{ clave: 'obra_inicio', valor: 999 }] }).error, 'valor');
  assert.equal(post({ cambios: [] }).error, 'clave');
  assert.equal(post({ version: 4, cambios: [{ clave: 'comision', valor: 0.05 }] }).error, 'version');
  assert.equal(post({ cambios: [{ clave: '../x', valor: 1 }] }).error, 'clave');
});

test('quien sólo lee no prueba cifras', () => {
  const w = mundo();
  const r = w.post({ k: LECTOR, tipo: 'ppp2-simular', plan: PLAN, version: 1, cambios: [{ clave: 'comision', valor: 0.05 }] });
  assert.equal(r.error, 'permiso');
});

test('con coma decimal (fórmulas con «;») el lápiz deja la columna Prueba sana, sin #ERROR!', () => {
  const w = mundo({ idioma: 'puntoycoma' });
  const mod = w.libro.getSheetByName('Modelo');
  const antes = pruebaDe(mod);
  const r = w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 2, cambios: [{ clave: 'ajuste_precio', valor: -0.05 }, { clave: 'din.tiie', valor: 0.09 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.cambios.length, 2);
  for (const [k, f] of antes) assert.equal(mod.f[k], f, 'Prueba restablecida igual en ' + k);
  assert.deepEqual(Object.keys(mod.roto), [], 'ninguna celda en #ERROR!');
});

test('si la columna Prueba no vuelve a su estado, el lápiz lo avisa y lo anota', () => {
  const w = mundo({ alFlush: (i, libro) => { if (i === 3) libro.getSheetByName('Pruebas').getRange(9, 2).setValue(-999); } });
  const bit = w.libro.getSheetByName('Bitácora'), filas = bit.getLastRow();
  const r = w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, version: 2, cambios: [{ clave: 'comision', valor: 0.06 }] });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'prueba');
  assert.equal(bit.getLastRow(), filas + 1);
  assert.match(String(bit.v[bit.getLastRow() - 1][2]), /NO volvió a su estado/);
});

test('una revisión vieja no se prueba: primero hay que ver lo último del libro', () => {
  const w = mundo();
  const r = w.post({ k: EDITOR, tipo: 'ppp2-simular', plan: PLAN, rev: 99999, version: 1, cambios: [{ clave: 'comision', valor: 0.05 }] });
  assert.equal(r.error, 'revision');
});

/* ── el catálogo «está ligado a» ── */
function catalogo() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, 'ppp2-relaciones.js'), 'utf8'), ctx);
  return ctx.window.PPP2_RELACIONES;
}

test('ppp2-relaciones.js está al día con la plantilla del libro (si no: python3 ppp2/libro/relaciones.py)', () => {
  const h = crypto.createHash('sha256');
  for (const nombre of ['generar.py', 'relaciones.py']) {
    h.update(Buffer.concat([Buffer.from(nombre + '\0'), fs.readFileSync(path.join(RAIZ, 'ppp2/libro', nombre)), Buffer.from('\0')]));
  }
  assert.equal(catalogo().huella, h.digest('hex'));
});

test('ppp2-relaciones.js no se editó a mano: su firma coincide con su contenido', () => {
  const R = vm.runInNewContext(fs.readFileSync(path.join(RAIZ, 'ppp2-relaciones.js'), 'utf8') + ';window.PPP2_RELACIONES', { window: {} });
  // el mismo texto que json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False) de Python
  const ordenado = (x) => Array.isArray(x) ? '[' + x.map(ordenado).join(',') + ']'
    : (x && typeof x === 'object') ? '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + ordenado(x[k])).join(',') + '}'
      : JSON.stringify(x);
  const cuerpo = {}; ['esquema', 'huella', 'cuadros', 'entradas', 'sobran'].forEach((k) => { cuerpo[k] = R[k]; });
  assert.equal(crypto.createHash('sha256').update(ordenado(cuerpo), 'utf8').digest('hex'), R.firma);
});

test('cada palanca del libro se edita en algún cuadro o está marcada como sobrante, y los cuadros son los del visor', () => {
  const R = catalogo();
  const w = mundo();
  const mod = w.libro.getSheetByName('Modelo');
  const palancas = mod.v.map((f, i) => ({ c: String(f[0] || ''), base: mod.f[(i + 1) + ',4'] || f[3] }))
    .filter((x, i) => i >= 6 && /^[a-z][a-z0-9_]*$/.test(x.c) && x.base !== '' && x.base !== undefined && x.base !== null).map((x) => x.c);
  assert.ok(palancas.length > 30);
  const sobran = new Set(R.sobran.filter((s) => s.palanca).map((s) => s.clave));
  for (const p of palancas) {
    const e = R.entradas['palanca:' + p];
    assert.ok(e || sobran.has(p), 'la palanca ' + p + ' no está en el catálogo');
    if (e) assert.ok(e.cuadro, 'la palanca ' + p + ' no se edita en ningún cuadro');
  }
  assert.deepEqual(Object.keys(R.cuadros).sort(), ['costo', 'dinero', 'producto', 'reparto', 'riesgo', 'terreno', 'tiempo']);
  for (const [cu, lista] of Object.entries(R.cuadros)) for (const id of lista) assert.ok(R.entradas[id], cu + ' nombra ' + id);
  // lo que copia un dato dice cuál, para que el lápiz ofrezca guardarlo en los datos del plan
  assert.equal(R.entradas['palanca:comision'].dato, 'costo.comision');
  assert.equal(R.entradas['palanca:durante_obra_1'].producto, 1);
  assert.ok(R.entradas['palanca:comision'].mueve.includes('Ganancia real'));
  assert.ok(R.entradas['palanca:comision'].pasa_por.includes('Comisiones'));
});

test('el catálogo no lleva cifras ni nombres de planes: sólo nombres y ligas', () => {
  const texto = fs.readFileSync(path.join(RAIZ, 'ppp2-relaciones.js'), 'utf8');
  const plan = JSON.parse(fs.readFileSync(path.join(RAIZ, 'ppp2/libro/ejemplo-plan.json'), 'utf8'));
  assert.doesNotMatch(texto, new RegExp(String(plan.datos['plan.nombre'].valor || plan.datos['plan.nombre']).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(texto, /docs\.google\.com|script\.google\.com|@/);
});

test('filaDe sigue sirviendo para el Modelo del accesorio', () => {
  const w = mundo();
  assert.ok(filaDe(w.libro.getSheetByName('Modelo'), 'comision') > 6);
});

/* ── deshacer un dato que el libro calculaba ── */
test('reemplazar un dato que el libro calculaba guarda su fórmula, y «restaurar» la regresa tal cual', () => {
  const w = mundo({ idioma: 'puntoycoma' });
  const datos = w.libro.getSheetByName('Datos'), f = filaDe(datos, 'din.capital');
  // como en la plantilla: el tope de capital lo calcula el libro (1/3 de las ventas), con «;» porque el libro usa coma decimal
  const formula = '=IFERROR(ROUND(Productos!$E$11/3;2);"")';
  datos.getRange(f, 3).setFormula(formula);
  assert.deepEqual(Object.keys(datos.roto), []);
  const r = w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 99, estado: 'supuesto', fuente: 'Prueba' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.guardo_formula, true);
  assert.equal(datos.f[f + ',3'], undefined, 'ya es una cifra');
  assert.equal(datos.v[f - 1][2], 99);
  assert.equal(String(datos.v[f - 1][11]).replace(/^'/, ''), formula, 'la fórmula quedó guardada como texto en la columna L');
  const r2 = w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', restaurar: true, estado: 'derivado', fuente: 'Regla de Dirección' });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal(datos.f[f + ',3'], formula, 'regresa la misma fórmula, con «;»');
  assert.equal(datos.v[f - 1][11], '', 'y la columna L queda vacía');
  assert.equal(datos.v[f - 1][4], 'derivado');
  const bit = w.libro.getSheetByName('Bitácora');
  assert.match(String(bit.v[bit.getLastRow() - 1][2]), /Regresó un dato a su fórmula/);
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', restaurar: true }).error, 'restaurar', 'sin fórmula guardada no hay qué regresar');
});

test('lo que una persona escribió en la columna L no se pisa', () => {
  const w = mundo();
  const datos = w.libro.getSheetByName('Datos'), f = filaDe(datos, 'din.capital');
  datos.getRange(f, 3).setFormula('=IFERROR(ROUND(Productos!$E$11/3,2),"")');
  datos.getRange(f, 12).setValue('Nota de Dirección: confirmar con el banco');
  const r = w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 99 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.guardo_formula, false, 'no había dónde guardarla sin pisar la nota');
  assert.equal(datos.getRange(f, 12).getValue(), 'Nota de Dirección: confirmar con el banco');
});

test('una cifra encima de otra cifra no guarda nada en la columna L', () => {
  const w = mundo();
  const datos = w.libro.getSheetByName('Datos'), f = filaDe(datos, 'din.tiie');
  const r = w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.tiie', valor: 0.08 });
  assert.equal(r.ok, true);
  assert.equal(r.guardo_formula, false);
  assert.equal((datos.v[f - 1] || [])[11] || '', '');
});
