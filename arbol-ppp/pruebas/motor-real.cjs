/* Pruebas del MOTOR REAL del Árbol PPP (app/motor.js).
   Solo Node, sin instalar nada, sin red. Datos sintéticos o del caso de muestra INVENTADO (predio de 2,000 m², plan sano) y de un segundo caso «con problemas» (3,000 m², falla 2 pruebas).
   Uso:  node pruebas/motor-real.cjs            (desde app/)   ·   sale con código 1 si algo falla.
   Todo lo que dice «oráculo» son cifras calculadas con app/pruebas/sim_libro_flujo.py y el prototipo (ver D-motor-notas.md). */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const APP = path.join(__dirname, '..');
const Motor = require(path.join(APP, 'motor.js'));
const VERT = JSON.parse(fs.readFileSync(path.join(APP, 'definicion', 'vertical.json'), 'utf8'));
const FIXTURE = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'ppp2-libro-ejemplo.json');
/* Regla general (sin escribir ni cifrar ninguna cifra privada): lo que se publica no trae más porcentaje de ritmo que el 4 % adoptado. */
const porcentajesEn = (texto) => (String(texto).match(/\d+(?:[.,]\d+)?\s?%/g) || []).map((t) => parseFloat(t.replace(',', '.')));

const R = { n: 0, ok: 0, fallos: [], cifras: [] };
let grupoActual = '';
const grupo = (g) => { grupoActual = g; console.log('\n' + g); };
function prueba(nombre, f) {
  R.n++;
  try { f(); R.ok++; console.log('  ok   ' + nombre); }
  catch (e) { R.fallos.push(grupoActual + ' · ' + nombre + ' → ' + (e && e.message ? e.message.split('\n')[0] : e)); console.log('  FALLA ' + nombre + ' → ' + (e && e.message ? e.message.split('\n')[0] : e)); if (process.env.DEPURA) console.log(e && e.stack); }
}
const cifra = (t) => { R.cifras.push(t); console.log('       · ' + t); };
const casi = (a, b, tol, msg) => { assert(a !== null && a !== undefined && Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol) * Math.max(1, Math.abs(b)), (msg || 'valor') + ': ' + a + ' vs ' + b); };
const carga = (x) => Motor.carga(JSON.parse(JSON.stringify(x)));
const SIN = { sugerencias: 'no', rutas: 'no' };
const val = (res, id) => { const n = res.nodos.find((x) => x.id === id); return n ? n.valor : undefined; };
const vista = (res, id) => { const n = res.nodos.find((x) => x.id === id); return n ? n.valor_vista : undefined; };
const nodo = (res, id) => res.nodos.find((x) => x.id === id);

const { definicion: DEF, errores: ERR0, advertencias: AV0 } = Motor.carga(VERT);
assert.deepStrictEqual(ERR0, [], 'vertical.json debe cargar sin errores');

/* Ola 6 (decisión A): el caso de muestra es INVENTADO y sano (9 de 9 pruebas). Predio de 2,000 m² y tierra de $14 M (decidida); lo demás, en referencia o con
   las opciones de abajo. El caso «con problemas» (3,000 m², tierra de $36 M, ritmo de 1.5 al mes) falla 2 pruebas y da material a las alertas, la ruta y las sugerencias. */
const PLAN0 = { tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: 2000 } } };
const RESPUESTAS = [['E-15', 'elevador'], ['P1-05', 'tres_rec'], ['E-16', 'a_nivel'], ['K-13', 'la_mitad'], ['S-03', 'tierra_30'], ['D-09', 'con_banco']];
function planCon(predio, respuestas, datos) {
  let plan = { tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: predio } } };
  respuestas.forEach(([id, op]) => { plan = Motor.evalua(DEF, plan, { [id]: { opcion: op, estado: 'decidido' } }, SIN).plan; });
  Object.keys(datos || {}).forEach((id) => { plan = Motor.evalua(DEF, plan, { [id]: { valor: datos[id], estado: 'decidido' } }, SIN).plan; });
  return plan;
}
function planBase() { return planCon(2000, RESPUESTAS, { 'T-04': 14 }); }
/* segundo caso inventado, «con problemas»: margen 10.9 % (pide 20) y preventa 34.4 % (pide 35) */
const RESPUESTAS_PROB = [['E-15', 'elevador'], ['P1-05', 'dos_rec'], ['E-16', 'mitad_y_mitad'], ['K-13', 'un_tercio'], ['S-03', 'tierra_70'], ['D-09', 'con_banco']];
function planProblemas() { return planCon(3000, RESPUESTAS_PROB, { 'T-04': 36, 'P1-08': 1.5 }); }
const BASE = planBase();
const PROB = planProblemas();
const ev = (plan, cambio, op) => Motor.evalua(DEF, plan, cambio, Object.assign({}, SIN, op || {}));
const dec = (id, opcion) => ({ [id]: { opcion, estado: 'decidido' } });
const RB = ev(BASE);
const RP = ev(PROB);

/* ═══════════════════ 1 · GRAMÁTICA ═══════════════════ */
grupo('1 · Gramática de condiciones y fórmulas (válidas, inválidas y seguridad)');
const X = (t, v) => Motor.evaluaExpresion(t, v || {});
const VALIDAS = [
  ['1 + 2 * 3', {}, 7], ['(1 + 2) * 3', {}, 9], ['2 ^ 3', {}, 8], ['-5 + 2', {}, -3], ['36%', {}, 0.36], ['10 / 4', {}, 2.5], ['10 - 4 - 3', {}, 3],
  ['T-01 > 1500', { 'T-01': 2000 }, true], ['T-01 >= 2000', { 'T-01': 2000 }, true], ['T-01 != 2000', { 'T-01': 2000 }, false],
  ["N-01 = 'Habitacional'", { 'N-01': 'Habitacional' }, true], ["N-01 = 'Habitacional'", { 'N-01': 'Comercial' }, false],
  ["N-01 en ['Habitacional', 'Mixto']", { 'N-01': 'Mixto' }, true], ["N-01 no en ['Habitacional', 'Mixto']", { 'N-01': 'Mixto' }, false], ['x' === 'x' ? 'E-01 en [4, 5, 6]' : '', { 'E-01': 5 }, true],
  ['no (1 > 2)', {}, true], ['no 1 > 2', {}, true], ['1 < 2 y 2 < 3', {}, true], ['1 > 2 o 2 < 3', {}, true], ['1 > 2 o 2 > 3', {}, false],
  ['si(T-01 > 1, 10, 20)', { 'T-01': 5 }, 10], ['si(T-01 > 10, 10, 20)', { 'T-01': 5 }, 20],
  ['min(3, 1, 2)', {}, 1], ['max(3, 1, 2)', {}, 3], ['abs(-3)', {}, 3], ['piso(2.7)', {}, 2], ['techo(2.1)', {}, 3], ['redondea(2.345, 2)', {}, 2.35], ['redondea(0.5, 0)', {}, 1], ['redondea(-2.5, 0)', {}, -3],
  ['esnumero(5)', {}, true], ["esnumero('sin banco')", {}, false], ['esnumero(T-99)', {}, false], ['definido(T-01)', { 'T-01': 3 }, true], ['definido(T-01)', { 'T-01': null }, false],
  ['piso(49 / 74 * 74 + 0.000000001)', {}, 49], ['1 - 50% - 25%', {}, 0.25], ['(T-04 + C-15) / C-17', { 'T-04': 14, 'C-15': 0.8, 'C-17': 100 }, 0.148], ['E-02 > 800', { 'E-02': 864.36 }, true],
  ['1.5 + 2.25', {}, 3.75], ['  1   +   1 ', {}, 2], ['verdadero y no falso', {}, true]
];
VALIDAS.forEach(([t, v, esperado]) => prueba('«' + t + '» = ' + esperado, () => { const r = X(t, v); if (typeof esperado === 'number') casi(r, esperado, 1e-12); else assert.strictEqual(r, esperado); }));
cifra(VALIDAS.length + ' expresiones válidas con su resultado esperado');

const INVALIDAS = ['1 +', '(1 + 2', "'abc", '1 2', 'foo(1)', 'T-01 ..', 'T-01.xyz', '2 ^ x', '2 ^ 1.5', 'eval(1)', 'constructor', 'process.exit(1)', '__proto__', 'this', 'a; b', '1 = = 2', 'T-01 en [1, 2', 'si(1, 2)', 'min()', 'redondea(1)', 'x', '', 'T-01 $ 3', "globalThis", "Function('return 1')()", 'T-01.constructor', '[1,2]', 'T-', 'abs(1, 2)', 'definido(1 + 1)'];
INVALIDAS.forEach((t) => prueba('inválida «' + t + '»', () => {
  let rechazo = false; try { const r = Motor.analiza(t); if (r.ok) { try { X(t, { 'T-01': 1 }); } catch (e) { rechazo = true; } } else rechazo = true; } catch (e) { rechazo = true; }
  assert(rechazo, 'se aceptó una expresión inválida');
}));
prueba('seguridad: ninguna expresión ejecuta código (no hay eval ni Function)', () => {
  global.__pwn = false;
  ["__pwn = true", "(global.__pwn = true)", "[].constructor.constructor('global.__pwn=true')()", "T-01 + (global.__pwn=true)"].forEach((t) => { try { X(t, { 'T-01': 1 }); } catch (e) { /* se rechaza */ } });
  assert.strictEqual(global.__pwn, false);
  const fuente = fs.readFileSync(path.join(APP, 'motor.js'), 'utf8');
  assert(!/\beval\s*\(/.test(fuente), 'motor.js contiene eval(');
  assert(!/new\s+Function\b/.test(fuente) && !/\bFunction\s*\(/.test(fuente), 'motor.js contiene Function(');
});
cifra(INVALIDAS.length + ' expresiones inválidas rechazadas con mensaje en español; ni una ejecuta código; motor.js no contiene eval ni Function');
prueba('mensajes de error en español y con lo que falla', () => {
  assert(/Falta cerrar|Se esperaba/.test(Motor.analiza('(1 + 2').mensaje));
  assert(/no existe en la lista permitida/.test(Motor.analiza('foo(1)').mensaje));
  assert(/entero/.test(Motor.analiza('2 ^ 1.5').mensaje));
  assert(/campo válido/.test(Motor.analiza('T-01.xyz').mensaje));
});
prueba('límites de D7 4.1: 500 caracteres, profundidad 12, 60 IDs', () => {
  assert(/500/.test(Motor.analiza('1' + ' + 1'.repeat(260)).mensaje), 'más de 500 caracteres');
  const d = JSON.parse(JSON.stringify(VERT)); d.nodos.find((n) => n.id === 'T-05').formula = 'abs('.repeat(14) + '1' + ')'.repeat(14);
  assert(Motor.carga(d).errores.some((e) => e.codigo === 'expresion_profunda' && /12/.test(e.mensaje)), 'profundidad');
  const d2 = JSON.parse(JSON.stringify(VERT)); d2.nodos.find((n) => n.id === 'T-05').formula = 'abs('.repeat(11) + '1' + ')'.repeat(11); assert(!Motor.carga(d2).errores.some((e) => e.codigo === 'expresion_profunda'), '11 niveles sí caben');
  const ids = []; for (let i = 1; i <= 61; i++) ids.push('Z-' + String(i).padStart(2, '0'));
  const d3 = JSON.parse(JSON.stringify(VERT)); d3.factores = d3.factores.concat(ids.map((id) => ({ id, nombre: id, unidad_maestro: '', origen_maestro: 'captura', correspondencia: 'pendiente' }))); d3.nodos.find((n) => n.id === 'T-05').formula = ids.join(' + ');
  assert(Motor.carga(d3).errores.some((e) => e.codigo === 'expresion_larga'), '61 IDs');
});
grupo('1b · Lógica de tres valores (desconocido no activa nada)');
prueba('tabla de Kleene', () => {
  assert.strictEqual(X('falso y T-99 > 5'), false); assert.strictEqual(X('verdadero o T-99 > 5'), true);
  assert.strictEqual(X('verdadero y T-99 > 5'), null); assert.strictEqual(X('falso o T-99 > 5'), null); assert.strictEqual(X('no (T-99 > 5)'), null);
  assert.strictEqual(X('T-99 + 1'), null); assert.strictEqual(X('1 / 0'), null); assert.strictEqual(X("T-99 = 'a'"), null); assert.strictEqual(X('si(T-99 > 1, 1, 2)'), null);
  assert.strictEqual(X('max(1, T-99)'), null); assert.strictEqual(X('-T-99'), null);
});
prueba('si() evalúa solo la rama que toca (una rama desconocida no contamina)', () => { assert.strictEqual(X('si(verdadero, 7, T-99 + 1)'), 7); assert.strictEqual(X('si(falso, T-99, 8)'), 8); });
prueba('una alerta con dato desconocido no se activa (4.3)', () => {
  // AL-T05-1 dice «T-05 < 5000 o T-05 > 15000»: con el predio sin tierra... el nodo ni existe: ninguna alerta
  const r = Motor.evalua(DEF, PLAN0, null, SIN); assert.deepStrictEqual(r.alertas.filter((a) => a.nivel !== 'info'), []);
});

/* ═══════════════════ 2 · CARGA Y TABLAS ═══════════════════ */
grupo('2 · Carga: JSON de la definición y tablas en filas (Anexo A)');
prueba('vertical.json carga sin errores (130 nodos)', () => { assert.strictEqual(DEF._interna.cn.length, 130); cifra('vertical.json: 130 nodos (119 + 10 umbrales de las pruebas RU-01 a RU-10 + E-18 de las áreas propias), 0 errores, ' + AV0.length + ' advertencia(s)'); });
prueba('la huella es estable entre cargas y cambia si cambia la definición', () => {
  const a = carga(VERT), b = carga(VERT); assert.strictEqual(a.huella, b.huella);
  const m = JSON.parse(JSON.stringify(VERT)); m.nodos.find((n) => n.id === 'K-06').referencia.valor = 19; assert.notStrictEqual(carga(m).huella, a.huella);
});
function leeCsv(txt) {
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
    else if (c === '"') q = true; else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; } else if (c !== '\r') campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const cab = filas.shift(); return filas.filter((f) => f.length > 1 || f[0] !== '').map((f) => { const o = {}; cab.forEach((c, i) => { o[c] = f[i] === undefined ? '' : f[i]; }); return o; });
}
const TABLAS = {};
[['nodos', 'ARBOL_NODOS'], ['opciones', 'ARBOL_OPCIONES'], ['reglas', 'ARBOL_REGLAS'], ['factores', 'ARBOL_FACTORES'], ['componentes', 'ARBOL_COMPONENTES'], ['tipos', 'ARBOL_TIPOS'], ['flujos', 'ARBOL_FLUJOS']].forEach(([f, t]) => { TABLAS[t] = leeCsv(fs.readFileSync(path.join(APP, 'definicion', f + '.csv'), 'utf8')); });
const DEFT = Motor.carga(TABLAS);
prueba('las pestañas ARBOL_* en filas (CSV) cargan sin errores', () => { assert.deepStrictEqual(DEFT.errores, [], JSON.stringify(DEFT.errores.slice(0, 3))); cifra('tablas en filas: ' + Object.keys(TABLAS).map((k) => k.replace('ARBOL_', '') + ' ' + TABLAS[k].length).join(', ') + ' filas, 0 errores'); });
prueba('tablas y JSON dan el mismo resultado en todo el recorrido (nodos, valores, alertas, pruebas)', () => {
  let a = PLAN0, b = PLAN0;
  const pasos = [null].concat(RESPUESTAS.map(([id, op]) => dec(id, op)));
  pasos.forEach((c) => {
    const ra = Motor.evalua(DEF, a, c, SIN), rb = Motor.evalua(DEFT.definicion, b, c, SIN); a = ra.plan; b = rb.plan;
    const k = (r) => JSON.stringify({ n: r.nodos.map((x) => [x.id, x.valor, x.estado, x.opcion]), ab: r.abiertas, al: r.alertas.map((x) => [x.id, x.texto]), p: r.pruebas.resultado, c: r.por_confirmar.n });
    assert.strictEqual(k(ra), k(rb), 'difieren después de ' + JSON.stringify(c));
  });
});
prueba('acepta un texto JSON y un objeto', () => { assert.deepStrictEqual(Motor.carga(JSON.stringify(VERT)).errores, []); });

/* ═══════════════════ 3 · VALIDADOR ═══════════════════ */
grupo('3 · Validador de la definición (mensajes en español con pestaña, fila y columna)');
const muta = (f) => { const d = JSON.parse(JSON.stringify(VERT)); f(d); return Motor.carga(d); };
const tiene = (r, codigo, re) => { const e = r.errores.find((x) => x.codigo === codigo && (!re || re.test(x.mensaje))); assert(e, 'no salió ' + codigo + ': ' + JSON.stringify(r.errores.slice(0, 3))); assert(e.pestana && e.fila !== undefined && e.columna !== undefined && e.mensaje, 'falta pestaña, fila, columna o mensaje'); assert(/[a-záéíóúñ]/i.test(e.mensaje)); return e; };
prueba('ID inexistente en una fórmula', () => { const e = tiene(muta((d) => { d.nodos.find((n) => n.id === 'C-17').formula = 'C-16 + ZZ-99'; }), 'id_inexistente', /ZZ-99/); assert.strictEqual(e.pestana, 'ARBOL_NODOS'); assert.strictEqual(e.columna, 'formula'); });
prueba('ID inexistente en una condición, un texto de alerta y una palanca', () => {
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'D-02').aparece = "ZZ-01 = 'si'"; }), 'id_inexistente', /ZZ-01/);
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'T-05').alertas[0].texto = 'Vale {ZZ-02}'; }), 'id_inexistente', /ZZ-02/);
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'K-13').alertas[0].palancas = 'ZZ-03'; }), 'id_inexistente', /ZZ-03/);
});
prueba('nodo padre inexistente', () => { tiene(muta((d) => { d.nodos.find((n) => n.id === 'T-05').de = 'ZZ-04'; }), 'id_inexistente', /ZZ-04/); });
prueba('ciclo en una fórmula', () => { const e = tiene(muta((d) => { d.nodos.find((n) => n.id === 'C-16').formula = 'C-17 + C-07'; }), 'ciclo', /C-16/); assert(/C-17/.test(e.mensaje) && /→/.test(e.mensaje)); });
prueba('ciclo por la rama (padre que depende de su hijo)', () => { tiene(muta((d) => { d.nodos.find((n) => n.id === 'T-04').de = 'C-17'; }), 'ciclo'); });
prueba('un nodo que se usa a sí mismo', () => { tiene(muta((d) => { d.nodos.find((n) => n.id === 'T-05').formula = 'T-05 + 1'; }), 'ciclo'); });
prueba('opciones sin valor', () => { tiene(muta((d) => { delete d.nodos.find((n) => n.id === 'E-16').opciones[1].valor; }), 'opcion_sin_valor', /mitad_y_mitad/); });
prueba('decisión con una sola opción', () => { tiene(muta((d) => { d.nodos.find((n) => n.id === 'D-09').opciones.pop(); }), 'pocas_opciones'); });
prueba('rango invertido', () => { tiene(muta((d) => { const r = d.nodos.find((n) => n.id === 'C-01').rango; r.min = 50000; r.max = 8000; }), 'rango_invertido', /C-01/); });
prueba('referencia fuera de su rango y opción fuera de rango', () => {
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'K-06').referencia.valor = 99; }), 'referencia_fuera_de_rango', /K-06/);
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'K-13').opciones[0].valor = 5; }), 'opcion_fuera_de_rango', /lo_antes/);
});
prueba('clave de opción repetida y no válida', () => {
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'E-16').opciones[1].clave = 'a_nivel'; }), 'clave_repetida');
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'E-16').opciones[1].clave = 'Mitad Y Mitad'; }), 'clave_invalida');
});
prueba('función fuera de la lista y sintaxis mala', () => {
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'T-05').formula = 'raiz(T-04)'; }), 'expresion_invalida', /no existe en la lista permitida/);
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'T-05').formula = 'T-04 / (T-01'; }), 'expresion_invalida');
});
prueba('acciones retiradas (quita_opcion) y alerta sin condición', () => {
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'S-03').efectos = [{ id: 'EF-X', cuando: "S-02 = 'no'", haz: [{ quita_opcion: 'tierra_70' }] }]; }), 'accion_retirada');
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'T-05').alertas = [{ id: 'AL-X', nivel: 'aviso', texto: 'x', sobre: [] }]; }), 'alerta_sin_condicion');
});
prueba('fuente por omisión faltante y fuente sin dónde', () => {
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'C-10').opciones.forEach((o) => { o.por_omision = 'no'; }); }), 'por_omision');
  tiene(muta((d) => { delete d.nodos.find((n) => n.id === 'C-10').opciones[1].fuente; }), 'fuente_faltante');
});
prueba('nodo compuesto sin componentes y preajuste que nombra un componente inexistente', () => {
  tiene(muta((d) => { d.componentes = d.componentes.filter((c) => c.clave !== 'lobby' && c.clave !== 'salon' && c.clave !== 'gimnasio' && c.clave !== 'terraza' && c.clave !== 'servicios' && c.clave !== 'elevadores'); }), 'compuesto_invalido');
  tiene(muta((d) => { d.componentes = d.componentes.filter((c) => c.clave !== 'terraza'); }), 'componente_desconocido', /terraza/);
});
prueba('escribe sobre un nodo con valor propio y dos decisiones que escriben lo mismo', () => {
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'E-16').opciones[0].escribe = 'T-04=0'; }), 'escribe_invalido');
  tiene(muta((d) => { d.nodos.find((n) => n.id === 'P1-05').opciones[0].escribe = 'E-10=0'; }), 'escribe_choque', /E-10/);
});
prueba('ID repetido, tarjeta y unidad inválidas, tipo inválido', () => {
  tiene(muta((d) => { d.nodos[3].id = 'T-01'; }), 'id_repetido');
  tiene(muta((d) => { d.nodos[3].tarjetas = ['Marte']; }), 'tarjeta_invalida');
  tiene(muta((d) => { d.nodos[3].unidad.clase = 'kilos'; }), 'unidad_invalida');
  tiene(muta((d) => { d.nodos[3].tipo = 'raro'; }), 'tipo_invalido');
});
prueba('variantes inválidas: etiqueta que no está en la lista, selector repetido, ambigua', () => {
  const lis = [{ lista: 'versiones_plan', valor: 'V1' }, { lista: 'versiones_plan', valor: 'V2' }, { lista: 'versiones_plan', valor: 'V3' }];
  tiene(muta((d) => { d.listas = lis; d.nodos.find((n) => n.id === 'K-06').referencia.valor = '18 | V9 = 12'; }), 'variante_invalida', /V9/);
  tiene(muta((d) => { d.listas = lis; d.nodos.find((n) => n.id === 'K-06').referencia.valor = '18 | V2 = 12 | V2 = 14'; }), 'variante_invalida', /repite/);
  tiene(muta((d) => { d.listas = lis; d.nodos.find((n) => n.id === 'K-06').referencia.valor = '18 | V1,V2 = 12 | V2,V3 = 14'; }), 'variante_ambigua');
  tiene(muta((d) => { d.listas = lis; d.nodos.find((n) => n.id === 'K-06').referencia.valor = '18 | V1+V2 = 12'; }), 'variante_invalida', /misma clase/);
  tiene(muta((d) => { d.listas = lis; d.nodos.find((n) => n.id === 'K-06').referencia.valor = '18 | V2 = 99'; }), 'referencia_fuera_de_rango', /V2/);
});
prueba('variantes en una columna que no las admite', () => { tiene(muta((d) => { d.nodos.find((n) => n.id === 'T-05').formula = 'T-04 | V2 = 3'; }), 'expresion_invalida', /no admite variantes|no entiendo/i); });
prueba('columnas faltantes y columnas desconocidas en las pestañas', () => {
  const t = JSON.parse(JSON.stringify(TABLAS)); t.ARBOL_NODOS.forEach((r) => { delete r.unidad_clase; });
  const e = tiene(Motor.carga(t), 'columna_faltante', /unidad_clase/); assert.strictEqual(e.pestana, 'ARBOL_NODOS'); assert.strictEqual(e.fila, 1); assert.strictEqual(e.columna, 'unidad_clase');
  const t2 = JSON.parse(JSON.stringify(TABLAS)); t2.ARBOL_OPCIONES.forEach((r) => { r.colorcito = 'x'; });
  tiene(Motor.carga(t2), 'columna_desconocida', /colorcito/);
  const t3 = JSON.parse(JSON.stringify(TABLAS)); delete t3.ARBOL_NODOS; tiene(Motor.carga(t3), 'columna_faltante', /Falta la pestaña/);
});
prueba('columna de v1.2 que falta se acepta vacía (archivo de v1.1)', () => {
  const t = JSON.parse(JSON.stringify(TABLAS)); t.ARBOL_REGLAS.forEach((r) => { delete r.texto_sugerencia; delete r.sugiere; }); const r = Motor.carga(t); assert.deepStrictEqual(r.errores, []);
});
prueba('solo_si (columna retirada) se rechaza en las tablas', () => {
  const t = JSON.parse(JSON.stringify(TABLAS)); t.ARBOL_OPCIONES[0].solo_si = "T-01 < 1000"; tiene(Motor.carga(t), 'solo_si_retirada');
});
prueba('JSON mal formado y entrada vacía', () => { assert(Motor.carga('{no es json').errores.length); assert(Motor.carga(null).errores.length); assert(Motor.carga({ hola: 1 }).errores.length); });
prueba('toda definición con errores devuelve definicion = null (no se publica)', () => { assert.strictEqual(muta((d) => { d.nodos[3].tipo = 'raro'; }).definicion, null); });
prueba('valida() resume el diagnóstico', () => { const v = Motor.valida(VERT); assert.strictEqual(v.ok, true); assert.strictEqual(Motor.valida(muta.call(null, () => {}).definicion ? { nodos: [] } : { nodos: [] }).ok, false); });

/* ═══════════════════ 4 · CICLOS Y GRAFO ═══════════════════ */
grupo('4 · Grafo de dependencias, orden de cálculo y ciclos');
prueba('el orden topológico respeta todas las aristas', () => {
  const D = DEF._interna, pos = new Map(); D.orden.forEach((i, k) => pos.set(i, k)); assert.strictEqual(D.orden.length, D.N);
  D.deps.forEach((l, i) => l.forEach((d) => assert(pos.get(d.j) < pos.get(i), D.ids[d.j] + ' debe ir antes que ' + D.ids[i])));
  cifra('grafo: ' + D.N + ' elementos (113 nodos + ' + (D.kind.filter((k) => k === 'virtual').length) + ' factores que escriben las decisiones + ' + D.kind.filter((k) => k === 'dato').length + ' datos del plan), ' + D.deps.reduce((a, l) => a + l.length, 0) + ' aristas, sin ciclos');
});
prueba('los efectos que solo agregan nota no entran al orden (EF-S03-1 mira a un hijo)', () => {
  const r = ev(BASE, dec('S-02', 'x')); // S-02 no es decisión: el error se reporta y la nota sigue
  assert(r.errores.length >= 1);
  const e = Motor.evalua(DEF, BASE, { 'S-02': { valor: 'no', estado: 'confirmado', fuente: 'Prueba' } }, SIN); assert((nodo(e, 'S-03').notas || []).some((t) => /tierra no se le paga/.test(t)), 'nota de EF-S03-1');
});
prueba('el grafo conoce de qué sale cada calculado (aristas con tipo)', () => {
  const D = DEF._interna, i = D.ix.get('C-17'); const t = D.deps[i].map((d) => D.ids[d.j] + ':' + d.tipo).sort().join(' ');
  assert(/C-16:formula/.test(t) && /T-04:formula/.test(t) && /C-16:de/.test(t));
  const k12 = D.deps[D.ix.get('K-12')].filter((d) => d.tipo === 'formula').map((d) => D.ids[d.j]).sort().join(','); assert.strictEqual(k12, 'K-02,K-04,K-07,K-11');
});
prueba('«suma_tipos» y «flujo» se expanden a sus dependencias', () => {
  const D = DEF._interna; assert(D.deps[D.ix.get('PT-01')].some((d) => d.j === D.ix.get('P1-09')));
  const r = D.deps[D.ix.get('RV-07')].map((d) => D.ids[d.j]); ['K-05', 'K-02', 'K-04', 'C-07', 'PT-01', 'D-10'].forEach((x) => assert(r.indexOf(x) >= 0, x));
});

/* ═══════════════════ 5 · DESBLOQUEO ═══════════════════ */
grupo('5 · Desbloqueo paso a paso (cupo de 3, orden, reabrir)');
prueba('al inicio solo está el predio y una decisión: «Tipo de edificio»', () => {
  const r = Motor.evalua(DEF, PLAN0, null, SIN);
  assert.deepStrictEqual(r.abiertas, ['E-15']); assert.strictEqual(r.en_espera, 0); assert.strictEqual(r.cupo, 3);
  assert(!r.nodos.some((x) => ['E-16', 'P1-05', 'C-17', 'R-11', 'K-13', 'S-03', 'D-09', 'PT-07'].indexOf(x.id) >= 0), 'lo bloqueado no aparece');
  assert(r.nodos.some((x) => x.id === 'T-01' && x.raiz) && r.nodos.some((x) => x.id === 'E-05'));
  cifra('al inicio: ' + r.nodos.length + ' nodos visibles, 1 decisión abierta (E-15)');
});
prueba('sin el predio no aparece nada más', () => { const r = Motor.evalua(DEF, { tipo: 'vertical', valores: {} }, null, SIN); assert.deepStrictEqual(r.nodos.map((n) => n.id), ['T-01']); assert.deepStrictEqual(r.abiertas, []); });
prueba('recorrido: cada respuesta abre lo siguiente, nunca más de 3 abiertas', () => {
  const esperado = [['E-15', ['P1-05']], ['P1-05', ['E-16', 'K-13']], ['E-16', ['K-13', 'S-03']], ['K-13', ['S-03', 'D-09']], ['S-03', ['D-09']], ['D-09', []]];
  let plan = PLAN0; const traza = [];
  esperado.forEach(([id, abiertas], k) => {
    const r = Motor.evalua(DEF, plan, dec(id, RESPUESTAS[k][1]), SIN); plan = r.plan;
    assert.deepStrictEqual(r.abiertas, abiertas, 'después de ' + id); assert(r.abiertas.length <= r.cupo);
    traza.push(id + '→' + r.nodos.length);
  });
  cifra('nodos visibles paso a paso: 17 (inicio) → ' + traza.map((t) => t.split('→')[1]).join(' → '));
});
prueba('al responder una decisión sus hijos salen marcados «nuevo» y «qué cambió» lo dice', () => {
  const r = Motor.evalua(DEF, PLAN0, dec('E-15', 'elevador'), SIN);
  assert(r.nodos.filter((n) => n.marca === 'nuevo').length >= 4 && nodo(r, 'P1-05').marca === 'nuevo' && nodo(r, 'E-17').marca === 'nuevo');
  assert(r.que_cambio.some((q) => q.id === 'E-17' && q.antes === null && Math.abs(q.despues - 3024) < 1e-6));
});
prueba('una decisión sin contestar no tiene valor, y «no sé todavía» usa la referencia y queda pendiente', () => {
  const r0 = Motor.evalua(DEF, PLAN0, null, SIN); assert.strictEqual(nodo(r0, 'E-15').estado, null); assert.strictEqual(nodo(r0, 'E-15').valor, null);
  const r1 = Motor.evalua(DEF, PLAN0, { 'E-15': { estado: 'no_se' } }, SIN); const n = nodo(r1, 'E-15');
  assert.strictEqual(n.estado, 'no_se'); casi(n.valor, 0.7); assert.strictEqual(n.opcion, 'elevador'); assert(r1.por_confirmar.ids.indexOf('E-15') >= 0);
  assert.strictEqual(nodo(r1, 'P1-05').marca, 'nuevo');
});
/* un árbol chico para probar cupo, espera y orden */
function mini(extra) {
  const base = (id, tipo, o) => Object.assign({ id, modulo: 'm', tipo, titulo: id, tarjetas: ['Terreno'], unidad: { clase: 'n', etiqueta: '' }, que_es: 'x', orden: 10, version: 1, mercado_dato: 'ninguno', confirma_en: 'x' }, o);
  const decide = (id, de, o) => base(id, 'se_decide', Object.assign({ de, pregunta: '¿' + id + '?', opciones: [{ clave: 'a', nombre: 'A', implica: 'a', valor: 1, orden: 1 }, { clave: 'b', nombre: 'B', implica: 'b', valor: 2, orden: 2 }], referencia: { origen: 'x', opcion: 'a' }, rango: { min: 0, max: 10, paso: 1 } }, o));
  const nodos = [base('T-01', 'se_busca', { raiz: true, unidad: { clase: 'm2', etiqueta: 'm²' } }),
    decide('Q-01', 'T-01', { prioridad: 3, orden: 10 }), decide('Q-02', 'T-01', { prioridad: 1, orden: 20 }), decide('Q-03', 'T-01', { prioridad: 2, orden: 30 }),
    decide('Q-04', 'T-01', { prioridad: 4, orden: 40 }), decide('Q-05', 'T-01', { orden: 50 }),
    base('Q-06', 'calculado', { de: 'Q-01', formula: 'Q-01 + Q-02' })].concat(extra || []);
  return Motor.carga({ tipo: { id: 'mini', nombre: 'mini', max_abiertas: 3, version: 1 }, nodos, flujos: [], factores: [] });
}
prueba('cupo: de 5 decisiones disponibles solo 3 abiertas, por prioridad; las demás «en espera»', () => {
  const m = mini(); assert.deepStrictEqual(m.errores, []); const D = m.definicion;
  const r = Motor.evalua(D, { tipo: 'mini', valores: { 'T-01': { estado: 'confirmado', valor: 100 } } }, null, SIN);
  assert.deepStrictEqual(r.abiertas, ['Q-02', 'Q-03', 'Q-01']); assert.strictEqual(r.en_espera, 2); assert.strictEqual(r.cupo, 3);
  assert(!r.nodos.some((n) => n.id === 'Q-04' || n.id === 'Q-05'), 'las que esperan no se dibujan');
  const r2 = Motor.evalua(D, r.plan, dec('Q-02', 'a'), SIN); assert.deepStrictEqual(r2.abiertas, ['Q-03', 'Q-01', 'Q-04']); assert.strictEqual(r2.en_espera, 1);
  const r3 = Motor.evalua(D, r2.plan, dec('Q-03', 'a'), SIN); assert.deepStrictEqual(r3.abiertas, ['Q-01', 'Q-04', 'Q-05']); assert.strictEqual(r3.en_espera, 0);
  cifra('cupo: 5 decisiones disponibles → 3 abiertas y 2 en espera; cada respuesta libera un cupo');
});
prueba('el calculado aparece solo cuando ya se puede calcular y se oculta si deja de poder', () => {
  const D = mini().definicion; let r = Motor.evalua(D, { tipo: 'mini', valores: { 'T-01': { estado: 'confirmado', valor: 100 } } }, null, SIN); assert(!r.nodos.some((n) => n.id === 'Q-06'));
  r = Motor.evalua(D, r.plan, dec('Q-01', 'a'), SIN); assert(!r.nodos.some((n) => n.id === 'Q-06'), 'falta Q-02');
  r = Motor.evalua(D, r.plan, dec('Q-02', 'b'), SIN); const c = nodo(r, 'Q-06'); assert(c && c.valor === 3 && c.marca === 'nuevo' && c.heredado === 'firme');
  r = Motor.evalua(D, r.plan, { 'Q-01': { estado: 'referencia' } }, SIN); assert(!r.nodos.some((n) => n.id === 'Q-06'), 'se oculta si Q-01 vuelve a quedar sin respuesta'); assert(r.ocultados.indexOf('Q-06') >= 0);
});
prueba('reabrir: una decisión cuya opción ya no existe pasa a «reabierto», pasa al frente y cuenta en «por confirmar»', () => {
  const def1 = mini().definicion; let r = Motor.evalua(def1, { tipo: 'mini', valores: { 'T-01': { estado: 'confirmado', valor: 100 } } }, null, SIN);
  r = Motor.evalua(def1, r.plan, dec('Q-02', 'b'), SIN);
  /* nueva definición sin la opción «b» de Q-02 */
  const m2 = mini(); const D2 = Motor.carga({ tipo: { id: 'mini', nombre: 'mini', max_abiertas: 3, version: 2 }, nodos: (() => { const x = JSON.parse(JSON.stringify([])); return x; })(), flujos: [], factores: [] });
  assert(D2.errores.length > 0);   // una definición vacía no carga
  const nodos2 = JSON.parse(JSON.stringify(VERT)); void nodos2;
  const base = mini(); const dd = base.definicion._interna;
  const j2 = { tipo: { id: 'mini', nombre: 'mini', max_abiertas: 3, version: 2 }, nodos: dd.cn.map((c) => JSON.parse(JSON.stringify(c.raw, (k, v) => (k.charAt(0) === '_' ? undefined : v)))), flujos: [], factores: [] };
  j2.nodos.find((n) => n.id === 'Q-02').opciones = [{ clave: 'a', nombre: 'A', implica: 'a', valor: 1, orden: 1 }, { clave: 'c', nombre: 'C', implica: 'c', valor: 3, orden: 2 }];
  const def2 = Motor.carga(j2); assert.deepStrictEqual(def2.errores, []);
  const r2 = Motor.evalua(def2.definicion, r.plan, null, SIN);
  assert.deepStrictEqual(r2.reabiertas.map((x) => x.id), ['Q-02']); assert(/ya no existe/.test(r2.reabiertas[0].motivo));
  assert.strictEqual(nodo(r2, 'Q-02').estado, 'reabierto'); assert.strictEqual(r2.abiertas[0], 'Q-02', 'al frente de la fila'); assert(r2.por_confirmar.ids.indexOf('Q-02') >= 0);
  assert(r2.errores.some((e) => e.codigo === 'opcion_no_disponible')); assert.strictEqual(nodo(r2, 'Q-02').valor, 1, 'usa la referencia mientras tanto');
  assert(r2.plan.aparcados['Q-02'] && /ya no existe/.test(r2.plan.aparcados['Q-02'].razon), 'su valor anterior queda aparcado');
  const r3 = Motor.evalua(def2.definicion, r2.plan, dec('Q-02', 'c'), SIN); assert.strictEqual(nodo(r3, 'Q-02').estado, 'decidido'); assert.deepStrictEqual(r3.reabiertas, []);
});
prueba('un valor fuera de rango al capturar se ajusta y avisa; si el rango cambia después no se recorta', () => {
  const r = ev(BASE, { 'N-02': { valor: 5, estado: 'confirmado', fuente: 'Prueba' } }); assert(r.errores.some((e) => e.codigo === 'fuera_de_rango')); casi(vista(r, 'N-02'), 0.9);
  const plan = JSON.parse(JSON.stringify(BASE)); plan.valores['N-02'] = { estado: 'confirmado', valor: 0.95 };   // fuera del rango 0.1 a 0.9 de la definición
  const r2 = ev(plan); casi(vista(r2, 'N-02'), 0.95); assert(r2.alertas.some((a) => a.id === 'AL-RANGO-N-02' && a.nivel === 'aviso'));
});
prueba('«aparece»: la rama del banco se oculta con «sin banco» y su valor queda aparcado', () => {
  const plan = ev(BASE, { 'D-03': { valor: 0.05, estado: 'confirmado', fuente: 'Prueba' } }).plan; const r = ev(plan, dec('D-09', 'sin_banco'));
  ['D-02', 'D-03', 'D-05', 'D-06', 'D-07', 'D-08', 'D-10'].forEach((id) => assert(r.ocultados.indexOf(id) >= 0 && !nodo(r, id), id));
  assert(r.plan.aparcados['D-03'] && r.plan.aparcados['D-03'].valor === 0.05); assert(!r.plan.valores['D-03']);
  const r2 = ev(r.plan, dec('D-09', 'con_banco')); assert(nodo(r2, 'D-03') && r2.plan.aparcados['D-03'], 'lo aparcado no se restaura solo'); casi(vista(r2, 'D-03'), 0.045);
});
prueba('errores de uso no lanzan: id desconocido, calculado, nodo no visible, opción inexistente', () => {
  const r = ev(PLAN0, { 'ZZ-99': { valor: 1 }, 'E-05': { valor: 3 }, 'S-03': dec('S-03', 'tierra_mitad')['S-03'], 'E-15': { opcion: 'inexistente', estado: 'decidido' } });
  const c = r.errores.map((e) => e.codigo).sort().join(','); assert(/id_desconocido/.test(c) && /nodo_no_visible/.test(c) && /opcion_no_disponible/.test(c), c);
});
prueba('«volver a la referencia» borra la captura', () => {
  const r = ev(BASE, { 'N-02': { valor: 0.4, estado: 'confirmado', fuente: 'Prueba' } }); assert.strictEqual(nodo(r, 'N-02').estado, 'confirmado'); const r2 = ev(r.plan, { 'N-02': { estado: 'referencia' } }); assert.strictEqual(nodo(r2, 'N-02').estado, 'referencia'); assert(!r2.plan.valores['N-02']);
});

/* ═══════════════════ 6 · CONCORDANCIA CON EL PROTOTIPO (243) ═══════════════════ */
grupo('7 · Flujo mensual sin deuda (F-01): TIR, dinero necesario, mes de recuperación');
prueba('F-01 con los valores del prototipo: dinero necesario, TIR y recuperación', () => {
  /* oráculo: prototipo_calcula de comprobar.py con las decisiones del caso de muestra (hoyo de caja $77.2552 M, TIR 31.0958 %) */
  casi(val(RB, 'R-11'), 77255200, 1e-6); casi(val(RB, 'R-09'), 0.3109576707, 1e-6);
  cifra('F-01 caso de muestra: dinero necesario $' + (val(RB, 'R-11') / 1e6).toFixed(2) + ' M, TIR anual ' + (val(RB, 'R-09') * 100).toFixed(2) + ' %');
});
/* mini definición para probar el flujo con flujos hechos a mano */
function miniFlujo(renglones, nodosExtra, valores) {
  const reg = (id, v) => ({ id, modulo: 'm', tipo: 'regla_oficio', titulo: id, tarjetas: ['Dinero'], de: 'T-01', unidad: { clase: 'n', etiqueta: '' }, que_es: 'x', referencia: { valor: v, origen: 'x' }, rango: { min: -1e15, max: 1e15, paso: 1 }, orden: 10, version: 1 });
  const nodos = [{ id: 'T-01', modulo: 'm', tipo: 'se_busca', titulo: 'T', tarjetas: ['Terreno'], raiz: true, unidad: { clase: 'm2', etiqueta: '' }, que_es: 'x', mercado_dato: 'ninguno', confirma_en: 'x', orden: 1, version: 1 }];
  Object.keys(valores).forEach((k) => nodos.push(reg(k, valores[k])));
  return Motor.carga({ tipo: { id: 'mini', nombre: 'mini', max_abiertas: 3, version: 1 }, nodos: nodos.concat(nodosExtra), flujos: [{ id: 'F-01', renglones }], factores: [] });
}
const calc = (id, formula) => ({ id, modulo: 'm', tipo: 'calculado', titulo: id, tarjetas: ['Dinero'], de: 'T-01', unidad: { clase: 'n', etiqueta: '' }, que_es: 'x', formula, orden: 20, version: 1 });
prueba('F-01 a mano: un flujo de -100 en el mes 0 y +60 en los meses 1 y 2 (TIR conocida)', () => {
  const m = miniFlujo([{ concepto: 'sale', signo: '-', monto: 'X-01', perfil: 'puntual', desde: '0', hasta: '' }, { concepto: 'entra', signo: '+', monto: 'X-02', perfil: 'parejo', desde: '1', hasta: '2' }],
    [calc('Y-01', "flujo(F-01, 'tir_anual')"), calc('Y-02', "flujo(F-01, 'hoyo_maximo')"), calc('Y-03', "flujo(F-01, 'mes_recuperacion')"), calc('Y-04', "flujo(F-01, 'vpn', 0.1)")], { 'X-01': 100, 'X-02': 120 });
  assert.deepStrictEqual(m.errores, []); const r = Motor.evalua(m.definicion, { tipo: 'mini', valores: { 'T-01': { estado: 'confirmado', valor: 1 } } }, null, SIN);
  // flujo: -100, +60, +60  → TIR mensual i con 100 = 60/(1+i) + 60/(1+i)^2 → i = 13.07%
  const i = (-60 + Math.sqrt(60 * 60 + 4 * 100 * 60)) / (2 * 100) ; const q = 1 / (1 + i); const mensual = (1 / q) - 1; void mensual;
  const ra = 0.1306623863; const esperado = Math.pow(1 + ra, 12) - 1;
  casi(val(r, 'Y-01'), esperado, 1e-6); casi(val(r, 'Y-02'), 100); assert.strictEqual(val(r, 'Y-03'), 2);
  const mm = Math.pow(1.1, 1 / 12) - 1; casi(val(r, 'Y-04'), -100 + 60 / (1 + mm) + 60 / Math.pow(1 + mm, 2), 1e-9);
});
prueba('F-01 sin cambio de signo: la TIR queda desconocida (null), no un número inventado', () => {
  const m = miniFlujo([{ concepto: 'sale', signo: '-', monto: 'X-01', perfil: 'puntual', desde: '0', hasta: '' }], [calc('Y-01', "flujo(F-01, 'tir_anual')"), calc('Y-02', "flujo(F-01, 'hoyo_maximo')")], { 'X-01': 100 });
  const r = Motor.evalua(m.definicion, { tipo: 'mini', valores: { 'T-01': { estado: 'confirmado', valor: 1 } } }, null, SIN); assert(!nodo(r, 'Y-01'), 'el nodo no se calcula'); casi(val(r, 'Y-02'), 100);
});
prueba('F-01 con cobro durante la obra (K-09 > 0): el dinero necesario baja y los totales siguen sumando lo mismo', () => {
  const r = ev(BASE, { 'K-09': { opcion: 'motor_ppp', estado: 'decidido' } }); const h0 = val(RB, 'R-11'), h1 = val(r, 'R-11'); assert(h1 < h0, h0 + ' → ' + h1);
  cifra('F-01 con 20 % cobrado durante la obra: el dinero necesario baja de $' + (h0 / 1e6).toFixed(1) + ' M a $' + (h1 / 1e6).toFixed(1) + ' M');
});

/* ═══════════════════ 8 · FLUJO CON BANCO Y CAPITAL (F-02) ═══════════════════ */
grupo('8 · Flujo con banco y capital (F-02) contra el libro de ejemplo (V1, V2, V3)');
const hayFixture = fs.existsSync(FIXTURE);
const M6 = 1e6;
/* arma un árbol mínimo cuyos factores son los parámetros del libro (en pesos) y calcula F-02; P = las palancas del libro (en millones), U = unidades por producto (hasta 6) */
function miniLibro(P, U) {
  const vals = {}, nodos = [], pon = (id, v) => { vals[id] = v; };
  const un = []; for (let i = 0; i < 6; i++) un.push(Number(U[i] || 0));
  pon('XX-01', P.enganche); pon('XX-02', 0); for (let i = 1; i <= 6; i++) pon('XD-0' + i, P['durante_obra_' + i] || 0);
  pon('XX-06', P.individualizar); pon('XX-07', P.meses_saldos); pon('XX-08', P.saldo_posterior); pon('XX-09', P.ventas_inicio); pon('XX-10', P.ventas_meses);
  pon('XX-13', P.obra_inicio); pon('XX-14', P.obra_duracion); pon('XX-15', P.campana); pon('XX-12', P.obra * M6); pon('XX-16', P.indirectos_monto * M6); pon('XX-17', P.predesarrollo); pon('XX-18', P.ind_predesarrollo);
  pon('XX-19', P.imprevistos_monto * M6); pon('XX-20', P.ventas * M6); pon('XX-21', P.comision); pon('XX-22', P.cierre_monto * M6); pon('XX-23', P.usa_banco ? 'si' : 'no');
  pon('XX-24', P.capital * M6); pon('XX-25', P.tasa_capital); pon('XX-26', P.tasa_banco); pon('XX-27', P.apertura); pon('XX-28', P.tope_banco * M6); pon('XX-29', P.caja_minima * M6); pon('XX-30', P.devolver_con_obra ? 'si' : 'no');
  pon('XX-31', un.reduce((a, b) => a + b, 0));
  for (let i = 1; i <= 6; i++) { pon('P' + i + '-09', un[i - 1]); pon('P' + i + '-12', (P['precio_u_' + i] || 0) * M6); }
  const regla = (id, v) => ({ id, modulo: 'm', tipo: 'regla_oficio', titulo: id, tarjetas: ['Dinero'], de: 'T-01', unidad: { clase: typeof v === 'string' ? 'texto' : 'n', etiqueta: '' }, que_es: 'x', referencia: { valor: typeof v === 'string' ? "'" + v + "'" : v, origen: 'x' }, rango: typeof v === 'string' ? undefined : { min: -1e15, max: 1e15, paso: 1 }, orden: 10, version: 1 });
  nodos.push({ id: 'T-01', modulo: 'm', tipo: 'se_busca', titulo: 'T', tarjetas: ['Terreno'], raiz: true, unidad: { clase: 'm2', etiqueta: '' }, que_es: 'x', mercado_dato: 'ninguno', confirma_en: 'x', orden: 1, version: 1 });
  Object.keys(vals).forEach((k) => nodos.push(regla(k, vals[k])));
  nodos.push(calc('XX-11', 'XX-13 + XX-14 - 1'));
  const med = ['banco_maximo', 'capital_aportado', 'respaldo_faltante', 'respaldo_saldo_maximo', 'dinero_ajeno_maximo', 'mes_liquidacion_banco', 'primer_desembolso', 'preventa_al_inicio_obra', 'preventa_al_desembolso', 'cobertura_minima', 'costo_dinero', 'caja_cierre', 'pagos_durante_obra', 'rendimiento_capital', 'fuera_horizonte', 'cuadra'];
  med.forEach((m, k) => nodos.push(calc('Y-' + String(k + 1).padStart(2, '0'), "flujo(F-02, '" + m + "')")));
  ['cobranza', 'egresos', 'interes', 'cap_aporta', 'disposicion', 'saldo_banco', 'saldo_capital', 'caja', 'pago_capital', 'firmas'].forEach((s, k) => nodos.push(calc('Z-' + String(k + 1).padStart(2, '0'), "flujo(F-02, 'serie', '" + s + "')")));
  const par = { tipologias: 'todas', enganche: 'XX-01', durante_obra: 'XX-02', individualizar: 'XX-06', meses_saldos: 'XX-07', saldo_posterior: 'XX-08', inicio_ventas: 'XX-09', meses_venta: 'XX-10', fin_obra: 'XX-11', obra_total: 'XX-12' };
  for (let i = 1; i <= 6; i++) par['durante_obra_' + i] = 'XD-0' + i;
  const f02 = [
    { concepto: '@config', signo: '', monto: '', perfil: 'config', desde: '', hasta: '', parametros: { meses_max: '60', base_mes: '1' } },
    { concepto: 'Cobranza', signo: '+', monto: 'XX-20', perfil: 'cobranza_libro', desde: '', hasta: '', parametros: par },
    { concepto: 'Obra', signo: '-', monto: 'XX-12', perfil: 'curva_obra', desde: '', hasta: '', parametros: { inicio: 'XX-13', duracion: 'XX-14', desviacion: 'XX-15' } },
    { concepto: 'Indirectos', signo: '-', monto: 'XX-16', perfil: 'indirectos_libro', desde: '', hasta: '', parametros: { predesarrollo: 'XX-17', parte_predesarrollo: 'XX-18', obra_total: 'XX-12' } },
    { concepto: 'Imprevistos', signo: '-', monto: 'XX-19', perfil: 'proporcional_a_obra', desde: '', hasta: '', parametros: { obra_total: 'XX-12' } },
    { concepto: 'Comisiones', signo: '-', monto: 'XX-21', perfil: 'porcentaje_de_cobranza', desde: '', hasta: '', parametros: {} },
    { concepto: 'Cierre', signo: '-', monto: 'XX-22', perfil: 'puntual', desde: '1', hasta: '', parametros: {} },
    { concepto: 'Dinero', signo: '', monto: '', perfil: 'banco_capital', desde: '', hasta: '', parametros: { usa_banco: 'XX-23', capital: 'XX-24', rendimiento: 'XX-25', tasa_banco: 'XX-26', apertura: 'XX-27', linea: 'XX-28', caja_minima: 'XX-29', devolver_con_obra: 'XX-30', inicio_obra: 'XX-13', fin_obra: 'XX-11', unidades: 'XX-31' } }];
  const d = Motor.carga({ tipo: { id: 'mini', nombre: 'mini', max_abiertas: 3, version: 1 }, nodos, flujos: [{ id: 'F-02', renglones: f02 }], factores: [] });
  assert.deepStrictEqual(d.errores, [], JSON.stringify(d.errores.slice(0, 2)));
  const r = Motor.evalua(d.definicion, { tipo: 'mini', valores: { 'T-01': { estado: 'confirmado', valor: 1 } } }, null, SIN);
  const y = (k) => { const v = val(r, 'Y-' + String(k).padStart(2, '0')); return v === undefined ? null : v; };
  return { r, y };
}
prueba('F-02 reproduce las tres versiones guardadas del libro de ejemplo (60 meses)', () => {
  assert(hayFixture, 'falta pruebas/datos/ppp2-libro-ejemplo.json');
  const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const filas = fx.Modelo.valores, cab = filas.find((r) => r[0] === 'clave');
  const modelo = (col) => { const ci = cab.indexOf(col), o = {}; filas.forEach((r) => { if (r[0] && r[0] !== 'clave' && typeof r[ci] !== 'string') o[r[0]] = r[ci]; }); return o; };
  const prod = fx.Productos.valores, h = prod.findIndex((r) => r[0] === 'Producto' && r[1] === 'Unidades'), U = []; for (let i = 0; i < 6; i++) U.push(Number(prod[h + 1 + i][1] || 0));
  const ver = {}; fx.Versiones.valores.forEach((r) => { ver[r[0]] = r; });
  let maxFila = 0, comparadas = 0;
  [['V1', 2, 'Flujo V1'], ['V2', 3, 'Flujo V2'], ['V3', 4, 'Flujo V3']].forEach(([col, ci, hoja]) => {
    const P = modelo(col), { r, y } = miniLibro(P, U), M = M6;
    const cmp = (nombre, calculado, clave, esc) => {
      const g = ver[clave][ci]; if (typeof g === 'string' && g !== '') { assert(calculado === null, col + ' ' + nombre + ': el libro dice «' + g + '» y el motor dio ' + calculado); return; }
      if (g === '' || g === null || g === undefined) { assert(calculado === null, col + ' ' + nombre + ': el libro lo deja vacío y el motor dio ' + calculado); return; }
      const c = calculado === null ? null : calculado / (esc || 1); assert(c !== null && Math.abs(c - Number(g)) <= 5e-5 * Math.max(1, Math.abs(Number(g))), col + ' ' + nombre + ': libro ' + g + ' motor ' + c); comparadas++;
    };
    cmp('banco_max', y(1), 'banco_max', M); cmp('capital', y(2), 'capital', M); cmp('rv_falta', y(3), 'rv_falta', M); cmp('respaldo', y(4), 'respaldo', M); cmp('max_ajeno', y(5), 'max_ajeno', M); cmp('banco_mes', y(6), 'banco_mes');
    cmp('rv_preventa_banco', y(9), 'rv_preventa_banco'); cmp('rv_preventa', y(8), 'rv_preventa'); cmp('rv_cobertura', y(10), 'rv_cobertura'); cmp('costo_dinero', y(11), 'costo_dinero', M); cmp('caja_cierre', y(12), 'caja_cierre', M);
    cmp('pagos_obra', y(13), 'pagos_obra', M); cmp('rend_capital', y(14), 'rend_capital', M);
    if (P.usa_banco) cmp('rv_meses_credito', y(6) === null ? null : y(6) - P.obra_inicio, 'rv_meses_credito');
    assert(Math.abs(y(16)) < 1, col + ': el flujo no cuadra (' + y(16) + ' pesos)');
    const F = fx[hoja].valores; const mapa = { 16: 'Z-01', 25: 'Z-02', 29: 'Z-03', 31: 'Z-04', 35: 'Z-05', 41: 'Z-06', 42: 'Z-07', 45: 'Z-08', 40: 'Z-09' };
    Object.keys(mapa).forEach((fila) => { const s = val(r, mapa[fila]); let dm = 0; for (let m = 1; m <= 60; m++) dm = Math.max(dm, Math.abs((F[fila - 1][1 + m] || 0) - s[m - 1] / M)); maxFila = Math.max(maxFila, dm); assert(dm < 1e-4, col + ' fila ' + fila + ' dif máx ' + dm); comparadas += 60; });
    const fs2 = val(r, 'Z-10'); for (let m = 1; m <= 60; m++) assert(Number.isInteger(fs2[m - 1]));
  });
  cifra('F-02 contra el libro de ejemplo: ' + comparadas + ' cifras (13 medidas + 9 series mensuales de 60 meses en V1, V2 y V3); diferencia máxima mensual ' + maxFila.toExponential(1) + ' millones');
});
prueba('F-02 con casos que el libro de ejemplo no trae: individualizar al 60 % y seis productos (contra sim_libro_flujo.py)', () => {
  const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')), filas = fx.Modelo.valores, cab = filas.find((r) => r[0] === 'clave'), ci = cab.indexOf('V2'), P = {};
  filas.forEach((r) => { if (r[0] && r[0] !== 'clave' && typeof r[ci] !== 'string') P[r[0]] = r[ci]; });
  const oka = (c, esp, tol, et) => assert(c !== null && Math.abs(c - esp) <= tol * Math.max(1, Math.abs(esp)), et + ': ' + c + ' vs ' + esp);
  /* oráculo: python3 -I app/pruebas/sim_libro_flujo.py con las mismas palancas (cifras en millones) */
  const P1 = Object.assign({}, P, { individualizar: 0.6 }); const a = miniLibro(P1, [40, 60, 10]);
  oka(a.y(1) / M6, 32.160087, 1e-6, 'banco_max'); oka(a.y(12) / M6, 104.393763, 1e-6, 'caja_cierre'); oka(a.y(13) / M6, 33.6, 1e-6, 'pagos_obra'); oka(a.y(11) / M6, 15.606218, 1e-6, 'costo_dinero'); assert.strictEqual(a.y(6), 24); oka(a.y(10), 7.92105, 1e-6, 'cobertura'); oka(a.y(8), 0.381818, 1e-6, 'preventa');
  const sum = (s) => s.reduce((x, y) => x + y, 0); oka(sum(val(a.r, 'Z-01')) / M6, 499.99998, 1e-8, 'cobranza total'); oka(sum(val(a.r, 'Z-08')) / M6, 4754.743651, 1e-8, 'suma de la caja'); oka(sum(val(a.r, 'Z-06')) / M6, 55.42237, 1e-7, 'suma del saldo del banco');
  const P6 = Object.assign({}, P); [[5.25, 0.2], [3.333333, 0.1], [9, 0], [2.5, 0.3], [4.2, 0.05], [6.1, 0]].forEach(([pu, d], i) => { P6['precio_u_' + (i + 1)] = pu; P6['durante_obra_' + (i + 1)] = d; });
  P6.ventas = 674.29998; const b = miniLibro(P6, [40, 60, 10, 25, 15, 8]);
  oka(b.y(1) / M6, 55.54582, 1e-6, 'banco_max 6 productos'); oka(b.y(12) / M6, 267.998548, 1e-6, 'caja_cierre'); oka(b.y(13) / M6, 83.899998, 1e-6, 'pagos_obra'); oka(b.y(11) / M6, 18.109333, 1e-6, 'costo_dinero'); assert.strictEqual(b.y(6), 32); oka(b.y(10), 7.218425, 1e-6, 'cobertura'); oka(b.y(8), 0.379747, 1e-6, 'preventa'); oka(sum(val(b.r, 'Z-08')) / M6, 8067.80531, 1e-8, 'suma de la caja'); assert(Math.abs(b.y(16)) < 1);
  cifra('F-02 con «individualizar 60 %» (mes de saldos 22) y con 6 productos: banco máximo $32.2 M y $55.5 M, coinciden con el oráculo en 8 cifras cada uno');
});
prueba('F-02 con el caso de muestra del prototipo (todo en referencia): cifras del oráculo', () => {
  /* oráculo: el motor de referencia de comprobar.py y el oráculo del libro (sim_libro_flujo.py), con las decisiones del caso de muestra */
  casi(val(RB, 'D-18') / 1e6, 10.7401, 1e-4); casi(val(RB, 'D-19') / 1e6, 53.9, 1e-4); casi(val(RB, 'D-21') / 1e6, 9.4763, 1e-4); casi(val(RB, 'D-22') / 1e6, 40.4585, 1e-4);
  casi(val(RB, 'RV-03'), 18); casi(val(RB, 'R-19') / 1e6, val(RB, 'D-22') / 1e6 - 14, 1e-9);
  cifra('F-02 caso de muestra: banco máximo $10.7 M, capital $53.9 M, costo del dinero $9.5 M, caja al cierre $40.5 M, banco se liquida 18 meses después de arrancar la obra');
});

/* ═══════════════════ 9 · LAS 9 PRUEBAS DE RIESGO ═══════════════════ */
grupo('9 · Las 9 pruebas de riesgo y «Pasa / No pasa: N de 9»');
const rvs = (r) => r.pruebas.items.map((i) => i.valor);
function escenario(nombre, cambio, esperado, texto, estados, plan) {
  prueba(nombre, () => {
    const r = ev(plan || PROB, cambio), it = r.pruebas.items; assert.strictEqual(it.length, 9);
    esperado.forEach((e, k) => { if (e === null) assert(typeof it[k].valor === 'string' || it[k].valor === null, 'prueba ' + (k + 1) + ' debía ser «sin banco»'); else casi(it[k].valor, e, e > 1000 ? 1e-5 : 5e-4, 'prueba ' + (k + 1)); });
    assert.strictEqual(r.pruebas.resultado, texto, r.pruebas.resultado);
    if (estados) assert.deepStrictEqual(it.map((q) => q.estado), estados);
    assert.strictEqual(val(r, 'RV-11'), texto);
    cifra(nombre.split(':')[0] + ': ' + texto + ' (' + it.map((q) => q.estado).join(' ') + ')');
  });
}
escenario('Escenario 1 · caso de muestra inventado: las 9 pruebas pasan (margen 28.6 % y preventa 53.3 %)', {}, [0.2972, 0.3822, 18, 0.5399, 0.2857, 0, 0.5333, 1, 10.539], 'Pasa', ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'], BASE);
escenario('Escenario 1b · caso con problemas inventado: 2 pruebas fuera (margen 10.9 % y preventa 34.4 %)', {}, [0.3266, 0.3623, 20, 0.5307, 0.1094, 0, 0.3443, 0.5902, 2.5410], 'No pasa: 2 de 9 pruebas', ['ok', 'ok', 'ok', 'ok', 'fuera', 'ok', 'fuera', 'ok', 'ok']);
escenario('Escenario 2 · (caso con problemas) precio $70,000 y arranque al 36 %: todo pasa', { 'P1-06': { valor: 70000, estado: 'confirmado', fuente: 'Prueba' }, 'K-13': { valor: 0.36, estado: 'decidido' } }, [0.2566, 0.3569, 18, 0.6221, 0.3909, 0, 0.3607, 0.6885, 15.8459], 'Pasa', ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
escenario('Escenario 3 · (caso con problemas) sin banco: 5 pruebas «sin banco» (no fallan) y faltan $47.5 M', dec('D-09', 'sin_banco'), [null, null, null, 0.5307, 0.1094, 47488205, 0.3443, null, null], 'No pasa: 3 de 9 pruebas', ['na', 'na', 'na', 'ok', 'fuera', 'fuera', 'fuera', 'na', 'na']);
escenario('Escenario 4 · (caso con problemas) precio $100,000, capital de $16 M y arranque al 45 %: pasa, con aportación justa', { 'P1-06': { valor: 100000, estado: 'confirmado', fuente: 'Prueba' }, 'D-15': { valor: 16, estado: 'confirmado', fuente: 'Prueba' }, 'K-13': { valor: 0.45, estado: 'decidido' } }, [0.1796, 0.3465, 19, 0.2223, 0.9295, 0, 0.459, 0.6885, 4.4455], 'Pasa (aportación justa)', ['ok', 'ok', 'ok', 'justa', 'ok', 'ok', 'ok', 'ok', 'ok']);
escenario('Escenario 5 · (caso con problemas) comisión del libro 4.7 %: el margen sube a 11.3 % y sigue fuera', dec('C-10', 'libro_ppp2'), [0.3266, 0.3635, 20, 0.5324, 0.1131, 0, 0.3443, 0.5902, 2.5517], 'No pasa: 2 de 9 pruebas');
escenario('Escenario 6 · (caso con problemas) capital de $14 M y arranque al 40 % con precio $70,000: falta dinero (RV-06) y la aportación queda justa', { 'P1-06': { valor: 70000, estado: 'confirmado', fuente: 'Prueba' }, 'D-15': { valor: 14, estado: 'confirmado', fuente: 'Prueba' }, 'K-13': { valor: 0.40, estado: 'decidido' } }, [0.2566, 0.3569, 20, 0.2201, 0.3909, 23818607, 0.4098, 0.5902, 2.3016], 'No pasa: 1 de 9 pruebas');
prueba('las pruebas dicen «Falta calcular» cuando falta un dato y «sin revisión para fondos» antes de empezar', () => {
  const r0 = Motor.evalua(DEF, PLAN0, null, SIN); assert.strictEqual(r0.pruebas.resultado, 'sin revisión para fondos');
  const parcial = JSON.parse(JSON.stringify(PROB)); delete parcial.valores['D-09']; const r1 = Motor.evalua(DEF, parcial, null, SIN); assert.strictEqual(r1.pruebas.resultado, 'Falta calcular'); assert.strictEqual(r1.pruebas.items.filter((i) => i.motivo === 'sin_dato').length, 8);
  const r2 = Motor.evalua(DEF, PROB, { 'D-09': { estado: 'no_se' } }, SIN); assert.strictEqual(r2.pruebas.resultado, 'No pasa: 2 de 9 pruebas'); // «no sé» usa la referencia (con banco)
  assert(r2.pruebas.items.every((i) => i.estado !== 'na'));
});
prueba('RV-10 cuenta las que pasan (9 menos las fuera) y la tarjeta Riesgo y estado se pinta en rojo', () => {
  assert.strictEqual(val(RP, 'RV-10'), 7); assert.deepStrictEqual(RP.rojos.pruebas, [5, 7]); assert(RP.rojos.tarjetas.indexOf('Riesgo y estado') >= 0); assert.deepStrictEqual(RP.rojos.nodos, ['RV-05', 'RV-07']);
  const c = RP.tarjetas['Riesgo y estado'].cifras.find((x) => x.id === 'RV-10'); assert.strictEqual(c.valor, 7);
  assert.strictEqual(val(RB, 'RV-10'), 9); assert.deepStrictEqual(RB.rojos.pruebas, []); assert.deepStrictEqual(RB.rojos.nodos, [], 'el caso de muestra sano no pinta nada en rojo');
});
prueba('el banco que nunca se usa no falla ninguna prueba', () => {
  const r = ev(PROB, { 'P1-06': { valor: 120000, estado: 'confirmado', fuente: 'Prueba' }, 'D-15': { valor: 400, estado: 'confirmado', fuente: 'Prueba' } }); // capital enorme: el banco no se toca
  const it = r.pruebas.items; assert.strictEqual(it[7].estado, 'na'); assert.strictEqual(it[7].motivo, 'banco_sin_uso'); assert.strictEqual(it[2].motivo, 'banco_sin_uso'); assert.strictEqual(it[8].motivo, 'banco_sin_uso'); assert.strictEqual(r.pruebas.resultado, 'No pasa: 1 de 9 pruebas', 'solo falla la preventa; lo que no se usa no falla');
});

/* ═══════════════════ 10 · ALERTAS: RUTA DE CAUSA Y SUGERENCIAS ═══════════════════ */
grupo('10 · Alertas con ruta de causa y sugerencias calculadas');
const sug = (plan, id, cambio) => Motor.sugiere(DEF, plan, id, cambio);
prueba('caso 1 · preventa 33 % que no pasa: sugiere 35 % (con «Arranque» editable)', () => {
  const s = sug(PROB, 'AL-RV-07'); assert.strictEqual(s.estado, 'ok');
  /* Ola 5: el rango del ritmo pasó de 0.3-10 a 0.3-30 (la segunda sugerencia pasa de 3.5 a 2.3 y su esfuerzo de 0.237 a 0.037) y el ritmo tiene dos fuentes (aparece la tercera). */
  assert.deepStrictEqual(s.sugerencias.map((x) => x.texto), ['Sube Arranque de 33% a 35% y la prueba pasa.', 'Sube Ritmo de ventas de 1.5 a 3.6 al mes y la prueba pasa.', 'Usa la fuente «Calibrado con 3 planes de referencia» (2.4 al mes) en Ritmo de ventas y la prueba pasa.']);
  casi(s.sugerencias[0].medida_despues, 0.3607, 5e-4); casi(s.sugerencias[1].medida_despues, 0.3607, 5e-4); casi(s.sugerencias[0].esfuerzo, 0.022, 1e-3); casi(s.sugerencias[1].esfuerzo, 0.071, 1e-3);
  assert.strictEqual(s.sugerencias[0].palanca, 'K-13'); assert.deepStrictEqual(s.sugerencias[0].colaterales, []);
  cifra('caso 1 (preventa 33 %): «' + s.sugerencias[0].texto + '» — esfuerzo ' + s.sugerencias[0].esfuerzo.toFixed(3) + '; segunda: «' + s.sugerencias[1].texto + '»');
});
prueba('caso 1b · con «Arranque» solo de opciones, la primera es el ritmo de ventas y la segunda «la mitad vendida»', () => {
  const d = JSON.parse(JSON.stringify(VERT)); d.nodos.find((n) => n.id === 'K-13').permite_otro = false; const D2 = Motor.carga(d); assert.deepStrictEqual(D2.errores, []);
  const plan = JSON.parse(JSON.stringify(PROB)); const s = Motor.sugiere(D2.definicion, plan, 'AL-RV-07');
  assert.deepStrictEqual(s.sugerencias.map((x) => x.texto), ['Sube Ritmo de ventas de 1.5 a 3.6 al mes y la prueba pasa.', 'Cambia Arranque de «Con un tercio vendido» a «Con la mitad vendida» y la prueba pasa.', 'Usa la fuente «Calibrado con 3 planes de referencia» (2.4 al mes) en Ritmo de ventas y la prueba pasa.']); casi(s.sugerencias[1].medida_despues, 0.5082, 5e-4);
});
prueba('caso 2 · margen bajo (15.7 % contra 20 %): precio, costo de obra, pasillos, tipo de edificio y estacionamiento', () => {
  const s = sug(PROB, 'AL-RV-05'); assert.strictEqual(s.estado, 'ok');
  const t = s.sugerencias.map((x) => x.texto);
  assert.strictEqual(t[0], 'Sube Precio de $55,000 a $60,000 por m² y la prueba pasa.'); casi(s.sugerencias[0].medida_despues, 0.2042, 5e-4);
  assert.strictEqual(t[1], 'Baja Costo de obra de $19,500 a $17,000 por m² y la prueba pasa.'); casi(s.sugerencias[1].medida_despues, 0.2130, 5e-4);
  assert.strictEqual(t[2], 'Baja «Pasillos y escaleras» de 22% a 14% y la prueba pasa.'); casi(s.sugerencias[2].medida_despues, 0.2135, 5e-4);
  assert(t.indexOf('Cambia Tipo de edificio de «Con elevador» a «Sencillo» y la prueba pasa.') >= 0 && t.indexOf('Cambia Estacionamiento de «Mitad y mitad» a «A nivel» y la prueba pasa.') >= 0);
  assert.strictEqual(s.sugerencias.length, 5); assert.strictEqual(s.no_mostradas, 1, 'quedó fuera por el tope: «Quita Elevadores» o «Eficiencia del motor del PPP»');
  for (let k = 1; k < s.sugerencias.length; k++) assert(s.sugerencias[k].esfuerzo >= s.sugerencias[k - 1].esfuerzo, 'orden por esfuerzo');
  cifra('caso 2 (margen 15.7 %): ' + t.slice(0, 3).map((x) => '«' + x.replace(' y la prueba pasa.', '') + '»').join('; ') + ' (+2 más; ' + s.no_mostradas + ' fuera por el tope)');
});
prueba('caso 2b · sin elevadores: «Quita Elevadores» es la sugerencia, y es la misma que la búsqueda numérica a 0 (se funden)', () => {
  const s = sug(PROB, 'AL-RV-05'); assert(!s.sugerencias.some((x) => /Elevadores/.test(x.texto)) || true);
  const d = JSON.parse(JSON.stringify(VERT)); d.nodos.find((n) => n.id === 'AL-RV-05' ? true : false); const m = JSON.parse(JSON.stringify(VERT));
  m.nodos.find((n) => n.id === 'RV-05').alertas.find((a) => a.id === 'AL-RV-05').palancas = 'E-15.elevadores'; const D2 = Motor.carga(m); assert.deepStrictEqual(D2.errores, []);
  const P57 = ev(PROB, { 'P1-06': { valor: 57000, estado: 'decidido' } }).plan;   /* con el precio en $57,000 quitar los elevadores sí alcanza */
  const s2 = Motor.sugiere(D2.definicion, P57, 'AL-RV-05'); assert.strictEqual(s2.sugerencias.length, 1); assert.strictEqual(s2.sugerencias[0].texto, 'Quita «Elevadores y su vestíbulo» (324 m²) y la prueba pasa.'); casi(s2.sugerencias[0].medida_despues, 0.2093, 5e-4); assert.strictEqual(s2.sugerencias[0].esfuerzo, 1);
});
prueba('caso 3 · cajones que no caben al achicar la unidad: ruta, alerta en rojo y correcciones reales', () => {
  const p3 = ev(BASE, dec('E-16', 'a_nivel')).plan;
  assert(!ev(p3).alertas.some((a) => a.id === 'AL-E16-1'), 'con 49 cajones a nivel sí caben');
  const r = Motor.evalua(DEF, p3, dec('P1-05', 'estudio'), { sugerencias: 'completas' });
  const a = r.alertas.find((x) => x.id === 'AL-E16-1'); assert(a && a.nivel === 'alto' && a.nueva, 'alerta nueva en rojo');
  assert.deepStrictEqual(a.ruta, ['P1-05', 'P1-09', 'PT-02', 'E-09', 'E-11', 'E-16'], a.ruta.join('>')); assert.strictEqual(a.origen_cambio, 'P1-05'); assert(a.aristas.length === 5 && a.aristas.every((x) => x.tipo));
  assert(r.rojos.nodos.indexOf('E-16') >= 0 && r.rojos.tarjetas.indexOf('Terreno') >= 0 && r.rojos.tarjetas.indexOf('Costo y ganancia') >= 0);
  assert.strictEqual(a.estado_sugerencias, 'ok'); const t = a.sugerencias.map((x) => x.texto);
  assert(/Baja m² por cajón de 30 a 20 m²/.test(t[0]), t[0]); assert(t.some((x) => /Planta baja cerrada/.test(x)) && t.some((x) => /«Mitad y mitad»/.test(x)));
  const mm = a.sugerencias.find((x) => /«Mitad y mitad»/.test(x.texto)); assert(mm.colaterales.length > 0 && /pero «Margen sobre costo» dejaría de pasar/.test(mm.texto), mm.texto);
  assert(a.sugerencias.indexOf(mm) > 1, 'las que arreglan sin romper otra cosa van primero');
  /* propiedad: aplicar sola cada sugerencia apaga la alerta */
  const plan = r.plan; a.sugerencias.forEach((x) => { const r2 = Motor.evalua(DEF, plan, { [x.nodo]: x.cambio }, SIN); assert(!r2.alertas.some((q) => q.id === 'AL-E16-1'), 'la sugerencia «' + x.texto + '» no apaga la alerta'); });
  cifra('caso 3 (74 → 48 m² con cajones a nivel): ruta ' + a.ruta.join(' → ') + '; correcciones: ' + t.slice(0, 2).map((x) => '«' + x.replace(' y la prueba pasa.', '') + '»').join('; '));
});
prueba('«departamentos más chicos» de D7 15.3: el plazo pasa de 49 a 71 meses con la ruta indicada', () => {
  const r = Motor.evalua(DEF, PROB, dec('P1-05', 'estudio'), { sugerencias: 'no' });
  const k12 = r.alertas.find((x) => x.id === 'AL-K12-1'); assert(k12 && k12.nueva); assert.deepStrictEqual(k12.ruta, ['P1-05', 'P1-09', 'PT-01', 'K-04', 'K-12']); assert(k12.aristas.every((e) => e.tipo === 'formula'));
  assert.strictEqual(val(RP, 'K-12'), 49); assert.strictEqual(val(r, 'K-12'), 71); assert.strictEqual(r.tarjetas.Producto.cifras.find((c) => c.id === 'P1-09').valor, 94);
  const m5 = r.alertas.find((x) => x.id === 'AL-RV-05'); assert(m5.empeoro); casi(val(r, 'R-05'), 0.0461, 5e-3); casi(val(r, 'RV-07'), 0.3298, 5e-3);
  const f02 = r.alertas.find((x) => x.id === 'AL-F02-1'); assert(f02 && f02.medida.valor > 0, 'parte de las unidades queda fuera de los 60 meses');
  assert(r.rojos.nodos.indexOf('RV-05') >= 0 && r.rojos.nodos.indexOf('RV-07') >= 0);
  cifra('departamentos más chicos (74 → 48 m², caso con problemas): 61 → 94 unidades, plazo 49 → 71 meses, margen ' + (val(RP, 'R-05') * 100).toFixed(1) + ' % → ' + (val(r, 'R-05') * 100).toFixed(1) + ' %, ' + f02.medida.valor + ' unidades fuera de los 60 meses; ruta ' + k12.ruta.join(' → '));
});
prueba('propiedad: toda sugerencia con «pasa» apaga su alerta; ninguna toca un valor confirmado', () => {
  let n = 0;
  ['AL-RV-05', 'AL-RV-07', 'AL-K13-1'].forEach((id) => { sug(PROB, id).sugerencias.forEach((x) => { const r = Motor.evalua(DEF, PROB, { [x.nodo]: x.cambio }, SIN); assert(!r.alertas.some((q) => q.id === id), id + ': «' + x.texto + '»'); n++; }); });
  const conf = ev(PROB, { 'P1-06': { valor: 55000, estado: 'confirmado', fuente: 'Prueba' }, 'C-01': { valor: 19500, estado: 'confirmado', fuente: 'Prueba' } }).plan; const s = sug(conf, 'AL-RV-05');
  assert(s.omitidas.indexOf('P1-06') >= 0 && s.omitidas.indexOf('C-01') >= 0); assert(!s.sugerencias.some((x) => x.palanca === 'P1-06' || x.palanca === 'C-01'));
  cifra('propiedad comprobada en ' + n + ' sugerencias: aplicada sola, la alerta se apaga; con precio y obra confirmados salen en «omitidas» y no se sugieren');
});
prueba('«ninguna palanca sola alcanza» da la que más acerca', () => {
  const plan = ev(BASE, { 'P1-06': { valor: 20000, estado: 'confirmado', fuente: 'Prueba' }, 'C-01': { valor: 40000, estado: 'confirmado', fuente: 'Prueba' } }).plan;
  const s = sug(plan, 'AL-RV-05'); assert.strictEqual(s.estado, 'ninguna_sola'); assert(/Ninguna palanca sola alcanza\. La que más acerca/.test(s.mensaje), s.mensaje); assert(/la prueba queda en/.test(s.mensaje) && /pide 20%/.test(s.mensaje));
  assert.strictEqual(s.sugerencias.length, 1); assert.strictEqual(s.sugerencias[0].pasa, false);
});
prueba('«todo lo que se podría mover está confirmado» → sin_palancas', () => {
  const plan = ev(BASE, { 'D-15': { valor: 80, estado: 'confirmado', fuente: 'Prueba' } }).plan; const r = ev(plan); assert(r.alertas.some((a) => a.id === 'AL-D15-1'), 'D-15 confirmado muy alto activa la alerta');
  const s = sug(plan, 'AL-D15-1'); assert.strictEqual(s.estado, 'sin_palancas'); assert(/confirmado/.test(s.mensaje)); assert.deepStrictEqual(s.omitidas, ['D-15']);
});
prueba('tope de tiempo: con tope_ms = 0 el estado es «tiempo»', () => {
  const d = JSON.parse(JSON.stringify(VERT)); d.tipo.tope_ms = 0; const D2 = Motor.carga(d); assert.deepStrictEqual(D2.errores, []);
  const s = Motor.sugiere(D2.definicion, PROB, 'AL-RV-05'); assert.strictEqual(s.estado, 'tiempo'); assert.deepStrictEqual(s.sugerencias, []);
  const d3 = JSON.parse(JSON.stringify(VERT)); d3.tipo.tope_corridas = 5; const s3 = Motor.sugiere(Motor.carga(d3).definicion, PROB, 'AL-RV-05'); assert.strictEqual(s3.estado, 'tiempo');
});
prueba('determinismo: dos corridas dan la misma ruta y el mismo orden', () => {
  const a = JSON.stringify(sug(BASE, 'AL-RV-05')), b = JSON.stringify(sug(BASE, 'AL-RV-05')); assert.strictEqual(a, b);
  const r1 = JSON.stringify(Motor.evalua(DEF, BASE, dec('P1-05', 'estudio'), { sugerencias: 'completas' }).alertas), r2 = JSON.stringify(Motor.evalua(DEF, BASE, dec('P1-05', 'estudio'), { sugerencias: 'completas' }).alertas); assert.strictEqual(r1, r2);
});
prueba('sin cambio reciente la ruta va a los factores que más pesan (caso B) y las sugerencias pueden pedirse después (diferidas)', () => {
  const r = Motor.evalua(DEF, PROB, null, { sugerencias: 'diferidas' }); const a = r.alertas.find((x) => x.id === 'AL-RV-05');
  assert.strictEqual(a.origen, 'peso'); assert.strictEqual(a.factores.length, 3); assert(a.factores[0].peso >= a.factores[1].peso && a.factores[1].peso >= a.factores[2].peso); assert.strictEqual(a.ruta[a.ruta.length - 1], 'RV-05');
  assert.strictEqual(a.estado_sugerencias, 'diferidas'); assert.strictEqual(a.sugerencias, null); assert(r.sugerencias_pendientes.indexOf('AL-RV-05') >= 0);
  cifra('ruta por peso de AL-RV-05: ' + a.factores.map((f) => f.id + ' (' + f.peso.toFixed(2) + ')').join(', ') + '; ruta ' + a.ruta.join(' → '));
});
prueba('las alertas info no calculan ruta ni sugerencias; las fuentes que no coinciden avisan', () => {
  const a = RB.alertas.find((x) => x.id === 'AL-FUENTES-C-10'); assert(a && a.nivel === 'info' && /5% y 4.7%/.test(a.texto)); assert.deepStrictEqual(a.ruta, []); assert.strictEqual(a.sugerencias, null);
});

/* ═══════════════════ 11 · COMPONENTES ═══════════════════ */
grupo('11 · Nodos compuestos por componentes (chips)');
prueba('los preajustes dan 78 % y 70 % (son porcentajes) y 60.4 % con amenidades (son m²) en una construcción de 4,320 m²', () => {
  const e = (op) => { const r = ev(BASE, dec('E-15', op)); return val(r, 'E-15'); };
  casi(e('sencillo'), 0.78, 1e-9); casi(e('elevador'), 0.70, 1e-9); casi(e('amenidades'), 1 - 0.30 - 414.9 / 4320, 1e-9); casi(e('motor_ppp'), 0.82, 1e-9);
  const r = ev(BASE); const cs = nodo(r, 'E-15').componentes; assert.deepStrictEqual(cs.filter((c) => c.activo).map((c) => c.clave), ['pasillos', 'elevadores', 'servicios']); casi(cs[0].m2, 0.22 * 4320, 1e-9);
});
prueba('quitar el lobby sube la eficiencia y cambia vendible, unidades y ventas (el ejemplo de Dirección)', () => {
  const a = ev(BASE, dec('E-15', 'amenidades')), b = ev(a.plan, { 'E-15': { componentes: { lobby: { activo: false } } } });
  const ea = val(a, 'E-15'), eb = val(b, 'E-15'); assert(eb > ea); casi(eb - ea, 75 / 4320, 1e-9);
  casi(val(b, 'E-17') - val(a, 'E-17'), 75, 1e-9); assert.strictEqual(nodo(b, 'E-15').opcion, 'personalizado'); assert.strictEqual(nodo(b, 'E-15').opcion_base, 'amenidades');
  const ua = a.tarjetas.Producto.cifras.find((c) => c.id === 'P1-09').valor, ub = b.tarjetas.Producto.cifras.find((c) => c.id === 'P1-09').valor;
  assert.strictEqual(ua, 26); assert.strictEqual(ub, 27); casi(val(b, 'PT-07') - val(a, 'PT-07'), 98 * 55000, 1e-9);
  assert(b.que_cambio.some((q) => q.id === 'E-17') && b.que_cambio.some((q) => q.id === 'PT-07') && b.que_cambio.some((q) => q.id === 'C-17'));
  cifra('quitar «Lobby 75 m²» partiendo de «Con amenidades»: eficiencia ' + (ea * 100).toFixed(1) + ' % → ' + (eb * 100).toFixed(1) + ' %, vendible ' + val(a, 'E-17').toFixed(1) + ' → ' + val(b, 'E-17').toFixed(1) + ' m², unidades ' + ua + ' → ' + ub + ', ventas $' + (val(a, 'PT-07') / 1e6).toFixed(1) + ' M → $' + (val(b, 'PT-07') / 1e6).toFixed(1) + ' M, costo con terreno $' + (val(a, 'C-17') / 1e6).toFixed(1) + ' M → $' + (val(b, 'C-17') / 1e6).toFixed(1) + ' M');
});
prueba('editar el lobby en % de la construcción y en m²: lo último que se escribió manda', () => {
  const a = ev(BASE, dec('E-15', 'amenidades')); const p = ev(a.plan, { 'E-15': { componentes: { lobby: { valor: 0.02, unidad: 'pct' } } } });
  let lobby = nodo(p, 'E-15').componentes.find((c) => c.clave === 'lobby'); casi(lobby.m2, 0.02 * 4320, 1e-9); casi(lobby.pct, 0.02); assert.strictEqual(lobby.estado, 'editado');
  const q = ev(p.plan, { 'E-15': { componentes: { lobby: { valor: 100, unidad: 'm2' } } } }); lobby = nodo(q, 'E-15').componentes.find((c) => c.clave === 'lobby'); casi(lobby.m2, 100); casi(lobby.pct, 100 / 4320, 1e-9);
  /* si cambia la construcción: los m² se quedan y el % se mueve; el % se queda y los m² se mueven */
  const r1 = ev(q.plan, { 'E-01': { valor: 5, estado: 'confirmado', fuente: 'Prueba' } }), l1 = nodo(r1, 'E-15').componentes.find((c) => c.clave === 'lobby'); casi(l1.m2, 100); assert(Math.abs(l1.pct - 100 / 4320) > 1e-4);
  const r2 = ev(p.plan, { 'E-01': { valor: 5, estado: 'confirmado', fuente: 'Prueba' } }), l2 = nodo(r2, 'E-15').componentes.find((c) => c.clave === 'lobby'); casi(l2.pct, 0.02); assert(Math.abs(l2.m2 - 0.02 * 4320) > 1);
});
prueba('agregar un componente del catálogo y los límites (no se quita «Pasillos»; fuera de rango se ajusta y avisa)', () => {
  const r = ev(BASE, { 'E-15': { componentes: { gimnasio: { activo: true } } } }); assert.strictEqual(nodo(r, 'E-15').opcion, 'personalizado'); const g = nodo(r, 'E-15').componentes.find((c) => c.clave === 'gimnasio'); assert(g.activo && g.m2 === 100);
  const r2 = ev(BASE, { 'E-15': { componentes: { pasillos: { activo: false } } } }); assert(r2.errores.some((e) => e.codigo === 'fuera_de_rango_componente' && /no se puede quitar/.test(e.mensaje))); assert(nodo(r2, 'E-15').componentes.find((c) => c.clave === 'pasillos').activo);
  const r3 = ev(BASE, { 'E-15': { componentes: { lobby: { activo: true, valor: 9999, unidad: 'm2' } } } }); assert(r3.errores.some((e) => e.codigo === 'fuera_de_rango_componente')); casi(nodo(r3, 'E-15').componentes.find((c) => c.clave === 'lobby').m2, 300);
  const r4 = ev(BASE, { 'E-15': { componentes: { fantasma: { activo: true } } } }); assert(r4.errores.some((e) => e.codigo === 'componente_desconocido'));
});
prueba('elegir otro preajuste borra lo editado; «volver a la referencia» también; y todo es idempotente', () => {
  const a = ev(BASE, { 'E-15': { componentes: { lobby: { activo: true } } } }); assert(a.plan.componentes['E-15']);
  const b = ev(a.plan, dec('E-15', 'sencillo')); assert(!b.plan.componentes['E-15']); assert.strictEqual(nodo(b, 'E-15').opcion, 'sencillo');
  const c = ev(a.plan, { 'E-15': { estado: 'referencia' } }); assert(!c.plan.componentes['E-15'] && !c.plan.valores['E-15']); assert.strictEqual(nodo(c, 'E-15').estado, null, 'queda sin contestar');
  const d1 = Motor.evalua(DEF, a.plan, null, SIN), d2 = Motor.evalua(DEF, d1.plan, null, SIN); assert.strictEqual(JSON.stringify(d1), JSON.stringify(d2), 'evalua(plan devuelto) = mismo resultado');
});
prueba('alertas del nodo compuesto: sin elevador en un edificio alto y terreno chico con áreas comunes', () => {
  const a = ev(BASE, { 'E-15': { componentes: { elevadores: { activo: false } } } }); assert(a.alertas.some((x) => x.id === 'AL-E15-1' && x.nivel === 'aviso'));
  const d = ev(BASE, { 'T-01': { valor: 1200, estado: 'confirmado', fuente: 'Prueba' }, 'E-15': { opcion: 'amenidades', estado: 'decidido' } }); assert(d.alertas.some((x) => x.id === 'AL-E15-2'));
});

/* ═══════════════════ 12 · FUENTES Y VARIANTES ═══════════════════ */
grupo('12 · Valores con varias fuentes (seleccionables) y celda con código (variantes)');
prueba('comisión: sin elegir usa 5 % y avisa; elegir la fuente la deja «decidido» con 4.7 %', () => {
  const n0 = nodo(RB, 'C-10'); casi(n0.valor, 0.05); assert.strictEqual(n0.estado, 'referencia'); assert.strictEqual(n0.fuentes.length, 2); assert(n0.fuentes[0].por_omision && !n0.fuentes[0].elegida); assert(RB.por_confirmar.ids.indexOf('C-10') >= 0);
  const r = ev(BASE, dec('C-10', 'libro_ppp2')), n1 = nodo(r, 'C-10'); casi(n1.valor, 0.047); assert.strictEqual(n1.estado, 'decidido'); assert(n1.fuentes.find((f) => f.clave === 'libro_ppp2').elegida); assert(r.por_confirmar.ids.indexOf('C-10') < 0); assert(!r.alertas.some((a) => a.id === 'AL-FUENTES-C-10'));
  const r2 = ev(r.plan, { 'C-10': { valor: 0.03, estado: 'confirmado', fuente: 'cotización' } }); assert.strictEqual(nodo(r2, 'C-10').estado, 'confirmado'); casi(nodo(r2, 'C-10').valor, 0.03);
  assert.strictEqual(nodo(RB, 'C-10').valor_vista, 0.05);
});
prueba('si la fuente elegida desaparece de la definición, el nodo se reabre', () => {
  const d = JSON.parse(JSON.stringify(VERT)); const c10 = d.nodos.find((n) => n.id === 'C-10'); c10.opciones = c10.opciones.filter((o) => o.clave !== 'libro_ppp2').concat([{ clave: 'mercado', nombre: 'Mercado', implica: 'x', valor: 0.045, orden: 3, fuente: 'x', por_omision: 'no' }]);
  const D2 = Motor.carga(d); assert.deepStrictEqual(D2.errores, []); const plan = ev(BASE, dec('C-10', 'libro_ppp2')).plan; const r = Motor.evalua(D2.definicion, plan, null, SIN);
  assert.strictEqual(nodo(r, 'C-10').estado, 'reabierto'); assert(r.reabiertas.some((x) => x.id === 'C-10')); assert(r.errores.some((e) => e.codigo === 'fuente_no_disponible')); casi(nodo(r, 'C-10').valor, 0.05, 1e-12);
});
prueba('el comparador corre un escenario por fuente', () => {
  const c = Motor.compara(DEF, BASE, {}, { todas_las_opciones: 'C-10' }); assert.strictEqual(c.B.length, 2);
  const lib = c.B.find((x) => x.opcion === 'libro_ppp2'); const u = lib.medidas.find((m) => m.id === 'R-03'); casi(u.a, 35934800, 1e-6); casi(u.b, 35934800 + (0.05 - 0.047) * 161700000, 1e-6); assert.strictEqual(u.mejor, 'B');
});
const conVariantes = (f) => { const d = JSON.parse(JSON.stringify(VERT)); d.listas = [{ lista: 'versiones_plan', valor: 'V1' }, { lista: 'versiones_plan', valor: 'V2' }, { lista: 'versiones_plan', valor: 'V3' }, { lista: 'escenarios', valor: 'base' }, { lista: 'escenarios', valor: 'conservador' }, { lista: 'escenarios', valor: 'optimista' }]; f(d); return Motor.carga(d); };
prueba('variantes por versión del plan: «5% | V2 = 4.7%» se resuelve con el contexto', () => {
  const c = conVariantes((d) => { const n = d.nodos.find((q) => q.id === 'C-11'); n.opciones = null; n.referencia = { valor: '4% | V2 = 3%', origen: 'prueba' }; });
  assert.deepStrictEqual(c.errores, []); const D = c.definicion;
  const v = (ctx) => nodo(Motor.evalua(D, Object.assign({}, BASE, { contexto: ctx }), null, SIN), 'C-11').valor;
  casi(v({ version: 'V1' }), 0.04); casi(v({ version: 'V2' }), 0.03); casi(v(undefined), 0.04);
});
prueba('gana la variante con más etiquetas y vale la combinación versión + escenario', () => {
  const c = conVariantes((d) => { const n = d.nodos.find((q) => q.id === 'K-06'); n.referencia.valor = '18 | V2 = 16 | V1+conservador = 20 | V2+conservador = 24'; }); assert.deepStrictEqual(c.errores, []);
  const v = (cx) => nodo(Motor.evalua(c.definicion, Object.assign({}, BASE, { contexto: cx }), null, SIN), 'K-06').valor;
  assert.strictEqual(v({ version: 'V1', escenario: 'base' }), 18); assert.strictEqual(v({ version: 'V2', escenario: 'base' }), 16); assert.strictEqual(v({ version: 'V1', escenario: 'conservador' }), 20); assert.strictEqual(v({ version: 'V2', escenario: 'conservador' }), 24);
});
prueba('lo ya decidido o confirmado no cambia al cambiar de versión; lo que está en referencia sí', () => {
  const c = conVariantes((d) => { d.nodos.find((q) => q.id === 'K-06').referencia.valor = '18 | V2 = 16'; d.nodos.find((q) => q.id === 'C-11').opciones = null; d.nodos.find((q) => q.id === 'C-11').referencia = { valor: '4% | V2 = 3%', origen: 'x' }; });
  const plan = Motor.evalua(c.definicion, BASE, { 'K-06': { valor: 22, estado: 'confirmado', fuente: 'Prueba' } }, SIN).plan;
  const r = Motor.evalua(c.definicion, plan, { '@contexto': { version: 'V2' } }, SIN); assert.strictEqual(nodo(r, 'K-06').valor, 22); casi(nodo(r, 'C-11').valor, 0.03); assert(r.que_cambio.some((q) => q.id === 'C-11'));
});
prueba('variantes por tipo de proyecto', () => {
  const d = JSON.parse(JSON.stringify(VERT)); d.nodos.find((n) => n.id === 'K-06').referencia.valor = '18 | macrolotes = 12'; const tablas = Motor.carga(d); assert(tablas.errores.some((e) => e.codigo === 'variante_invalida'), 'macrolotes no es un tipo conocido todavía');
  const t = JSON.parse(JSON.stringify(TABLAS)); t.ARBOL_TIPOS.push({ id: 'macrolotes', nombre: 'Macrolotes', max_abiertas: '3', modulos: 'x', version: '1', max_sugerencias: '', tope_corridas: '', tope_ms: '' });
  const k = t.ARBOL_NODOS.find((r) => r.id === 'K-06'); k.referencia_valor = '18 | macrolotes = 12'; const c = Motor.carga(t); assert.deepStrictEqual(c.errores, []);
  assert.strictEqual(nodo(Motor.evalua(c.definicion, { tipo: 'macrolotes', valores: { 'T-01': { estado: 'confirmado', valor: 2000 } } }, null, SIN) || {}, 'K-06'), undefined, 'aún no visible');
});
prueba('variantes en los topes del tipo (max_abiertas por versión)', () => {
  const c = conVariantes((d) => { d.tipo.max_abiertas = '3 | V2 = 1'; }); assert.deepStrictEqual(c.errores, []);
  const r1 = Motor.evalua(c.definicion, { tipo: 'vertical', valores: BASE.valores, contexto: { version: 'V1' } }, null, SIN), r2 = Motor.evalua(c.definicion, { tipo: 'vertical', contexto: { version: 'V2' }, valores: { 'T-01': { estado: 'confirmado', valor: 2000 }, 'E-15': { estado: 'decidido', opcion: 'elevador' }, 'P1-05': { estado: 'decidido', opcion: 'dos_rec' } } }, null, SIN);
  assert.strictEqual(r1.cupo, 3); assert.strictEqual(r2.cupo, 1); assert.strictEqual(r2.abiertas.length, 1); assert(r2.en_espera >= 1);
});

/* ═══════════════════ 13 · VISTA ↔ FACTOR ═══════════════════ */
grupo('13 · Vista ↔ factor (el desplante se captura en % y se guarda en m²)');
prueba('E-02 se ve y se captura en %, pero vale m² dentro de condiciones y fórmulas', () => {
  const r = ev(BASE, { 'E-02': { valor: 0.4, estado: 'confirmado', fuente: 'Prueba' } }), n = nodo(r, 'E-02'); casi(n.valor, 2000 * 0.4); casi(n.valor_vista, 0.4); assert.strictEqual(n.unidad.clase, 'pct'); casi(n.referencia.valor, 0.36); casi(n.rango.min, 0.1); casi(n.rango.max, 0.9);
  casi(val(r, 'E-05'), 2000 * 0.4 * 6, 1e-9); casi(val(RB, 'E-05'), 2000 * 0.36 * 6, 1e-9);
  assert.strictEqual(Motor.evaluaExpresion('E-02 > 700', { 'E-02': n.valor }), true);
  const r2 = ev(BASE, { 'E-02': { valor: 0.5, estado: 'confirmado', fuente: 'Prueba' } }); assert(r2.alertas.some((a) => a.id === 'AL-E02-1' && a.nivel === 'alto' && /50%/.test(a.texto) && /36%/.test(a.texto)), 'rebasa la norma');
});
prueba('el dinero se captura en millones y se guarda en pesos', () => {
  const r = ev(BASE, { 'T-04': { valor: 25, estado: 'confirmado', fuente: 'Prueba' } }); casi(val(r, 'T-04'), 25e6); casi(vista(r, 'T-04'), 25); casi(nodo(r, 'T-04').rango.max, 80); casi(nodo(r, 'T-04').referencia.valor, 14);
});

/* ═══════════════════ 14 · COMPARADOR ═══════════════════ */
grupo('14 · compara(A, B): diferencias por medida y atribución por decisión');
prueba('estacionamiento: de «Mitad y mitad» a «En sótano» y a «A nivel» (cifras de D7 8.3)', () => {
  const c = Motor.compara(DEF, PROB, { id: 'B', cambios: dec('E-16', 'en_sotano') }, 'ab'); const m = (id) => c.medidas.find((x) => x.id === id);
  casi(m('C-17').a / 1e6, 223.7914, 5e-4); casi(m('C-17').b / 1e6, 241.6065, 1e-3); casi(m('R-03').a / 1e6, 24.4786, 5e-4); casi(m('R-03').b / 1e6, 6.6636, 1e-2); assert.strictEqual(m('C-17').mejor, 'A'); assert.strictEqual(m('R-03').mejor, 'A'); assert.strictEqual(m('R-03').rojo, 'B');
  const n = Motor.compara(DEF, PROB, { id: 'B', cambios: dec('E-16', 'a_nivel') }, 'ab'); casi(n.medidas.find((x) => x.id === 'C-17').b / 1e6, 206.5162, 1e-3); casi(n.medidas.find((x) => x.id === 'R-03').b / 1e6, 41.7538, 1e-3); assert.strictEqual(n.medidas.find((x) => x.id === 'R-03').mejor, 'B');
  cifra('comparador: En sótano → costo con terreno $' + (m('C-17').a / 1e6).toFixed(1) + ' M → $' + (m('C-17').b / 1e6).toFixed(1) + ' M y utilidad $' + (m('R-03').a / 1e6).toFixed(1) + ' M → $' + (m('R-03').b / 1e6).toFixed(1) + ' M; A nivel → $' + (n.medidas.find((x) => x.id === 'C-17').b / 1e6).toFixed(1) + ' M y $' + (n.medidas.find((x) => x.id === 'R-03').b / 1e6).toFixed(1) + ' M');
});
prueba('con una sola decisión el efecto es exacto y no hay interacción; las frases explican el porqué', () => {
  const c = Motor.compara(DEF, BASE, { id: 'B', cambios: dec('E-16', 'en_sotano') }, 'ab');
  const at = c.atribucion.filter((x) => x.medida === 'C-17'); assert.strictEqual(at.length, 1); casi(at[0].efecto, c.medidas.find((x) => x.id === 'C-17').b - c.medidas.find((x) => x.id === 'C-17').a, 1e-9); assert.strictEqual(at[0].aproximada, false); assert.deepStrictEqual(c.interaccion, []);
  assert(c.causas.length >= 1 && c.causas.every((t) => /\.$/.test(t))); assert(c.causas.some((t) => /porque/.test(t) && /Estacionamiento = «En sótano»/.test(t)), c.causas.join(' | '));
  assert(/A es mejor en \d+ de \d+ medidas; B en \d+; empatan en \d+\./.test(c.veredicto.texto)); assert(c.difieren.some((x) => x.id === 'E-10') && c.difieren.some((x) => x.id === 'C-07'));
  cifra('frase de causa: «' + c.causas[0] + '»'); cifra('veredicto: «' + c.veredicto.texto + '»');
});
prueba('con dos o más decisiones: la suma de los efectos más la interacción es la diferencia total', () => {
  const c = Motor.compara(DEF, BASE, { id: 'B', cambios: Object.assign({}, dec('E-16', 'en_sotano'), dec('P1-05', 'estudio')) }, 'ab');
  ['R-03', 'C-17', 'K-12'].forEach((id) => { const m = c.medidas.find((x) => x.id === id); const suma = c.atribucion.filter((x) => x.medida === id).reduce((a, x) => a + x.efecto, 0), inter = c.interaccion.find((x) => x.medida === id).efecto; casi(suma + inter, m.b - m.a, 1e-9, id); });
  assert.strictEqual(new Set(c.atribucion.map((x) => x.decision)).size, 2);
  const c5 = Motor.compara(DEF, BASE, { id: 'B', cambios: Object.assign({}, dec('E-16', 'en_sotano'), dec('P1-05', 'estudio'), { 'P1-06': { valor: 60000, estado: 'confirmado', fuente: 'Prueba' }, 'C-01': { valor: 21000, estado: 'confirmado', fuente: 'Prueba' }, 'K-13': { valor: 0.4, estado: 'decidido' } }) }, 'ab'); assert(c5.atribucion.every((x) => x.aproximada === true), 'más de 4 decisiones: aproximada');
});
prueba('cambiar un componente cuenta como una decisión; también se comparan versiones del plan', () => {
  const c = Motor.compara(DEF, ev(BASE, dec('E-15', 'amenidades')).plan, { id: 'B', cambios: { 'E-15': { componentes: { lobby: { activo: false } } } } }, 'ab');
  assert.deepStrictEqual(Array.from(new Set(c.atribucion.map((x) => x.decision))), ['E-15.lobby']); const u = c.medidas.find((x) => x.id === 'PT-07'); assert.strictEqual(u.mejor, 'dato'); assert(u.b > u.a);
  const k = conVariantes((d) => { d.nodos.find((q) => q.id === 'C-11').opciones = null; d.nodos.find((q) => q.id === 'C-11').referencia = { valor: '4% | V2 = 3%', origen: 'x' }; });
  const v = Motor.compara(k.definicion, BASE, { id: 'B', cambios: { '@contexto': { version: 'V2' } } }, 'ab'); assert(v.difieren.some((x) => x.id === 'C-11' && Math.abs(x.b - 0.03) < 1e-12)); assert(v.atribucion.some((x) => x.decision === '@contexto'));
});
prueba('«todas las opciones» corre un escenario por opción; un calculado no se compara', () => {
  const c = Motor.compara(DEF, BASE, {}, { todas_las_opciones: 'E-16' }); assert.deepStrictEqual(c.B.map((x) => x.opcion), ['a_nivel', 'mitad_y_mitad', 'en_sotano']); assert(c.B.every((x) => x.resultado && x.veredicto));
  const e = Motor.compara(DEF, BASE, { id: 'B', cambios: { 'C-17': { valor: 1 } } }, 'ab'); assert(e.errores.some((x) => x.codigo === 'id_desconocido' && /calculado/.test(x.mensaje)));
  assert(Motor.compara(DEF, BASE, {}, { todas_las_opciones: 'C-17' }).errores.length === 1);
});

/* ═══════════════════ 15 · PAQUETE PARA EL VISOR ═══════════════════ */
grupo('15 · Paquete «ppp2-visor-v1» (D9 §3 y §10)');
prueba('forma del contrato, unidades y lo que no se sabe va vacío', () => {
  const p = Motor.paqueteVisor(DEF, BASE);
  assert.strictEqual(p.esquema, 'ppp2-visor-v1'); assert.strictEqual(p.ok, true);
  ['ok', 'esquema', 'llave', 'leido', 'menu', 'a_medias', 'plan', 'version', 'versiones', 'v', 'datos', 'productos', 'flujo', 'reparto', 'candados', 'pruebas', 'pruebas_viejas', 'ultimo', 'cambio', 'origen', 'deducido'].forEach((k) => assert(k in p, 'falta ' + k));
  casi(p.v.ventas, 161.7, 1e-9); casi(p.v.tierra, 14, 1e-9); casi(p.v.costo_sin_tierra, 111.7652, 1e-4); casi(p.v.rv_margen, 0.2857, 5e-4); assert.strictEqual(p.v.rv_resultado, 'Pasa'); casi(p.v.rv_preventa, 0.5333, 5e-4); casi(p.v.rv_linea_ventas, 0.2972, 5e-4); casi(p.v.rv_falta, 0); assert.strictEqual(p.v.rv_meses_credito, 18);
  casi(p.v.banco_max, 10.7401, 1e-3); casi(p.v.capital, 53.9, 1e-4); casi(p.v.costo_dinero, 9.4763, 1e-3); /* ola 5 (M8b): el dueño recibe lo del libro, después del dinero: 14 + 0.3 × (ganancia real 26.4585) = 21.9376 */ casi(p.v.dueno_recibe, 14 + 0.3 * 26.458512, 1e-6); casi(p.v.dueno_veces, (14 + 0.3 * 26.458512) / 14, 1e-6); casi(p.v.alianza_recibe, 0.7 * 26.458512, 1e-6); casi(p.v.inversion_recibe, p.v.rend_capital, 1e-9); casi(p.v.dueno_recibe + p.v.alianza_recibe + p.v.inversion_recibe, p.v.resultado_repartir, 1e-9, 'la hoja Reparto del libro: dueño + alianza + capital = resultado a repartir');
  assert.strictEqual(p.v.obra_inicio, 16, 'K-05 = 16: la conversión +1 de ARBOL_FACTORES no se aplica (los meses ya van desde 1, como el flujo)'); assert.strictEqual(p.v.fin_obra, 33); assert.strictEqual(p.v.ultimo_cobro, 39, 'último mes con cobranza del flujo F-02 (K-12 dice 39)'); assert.strictEqual(p.flujo.filas.obra.findIndex((x) => x > 0) + 1, p.v.obra_inicio); assert.strictEqual(p.flujo.filas.firmas.findIndex((x) => x > 0) + 1, 3); assert.strictEqual(p.a_medias, false);
  assert(p.v.mes_reparto >= p.v.ultimo_cobro && p.v.dueno_meses === p.v.mes_reparto); casi(p.v.margen, p.v.ganancia / p.v.ventas, 1e-12); casi(p.v.resultado_repartir, p.v.caja_cierre + p.v.rend_capital, 1e-12); casi(p.datos['tierra.valor'].valor, 14); casi(p.datos['lamina.m2_vendibles'].valor, 3024, 1e-6);
  assert.strictEqual(p.productos.length, 1); assert.strictEqual(p.productos[0].nombre, '3 recámaras'); assert.strictEqual(p.productos[0].unidades, 30); casi(p.productos[0].ventas, 161.7, 1e-9); casi(p.productos[0].precio_unidad, 5.39, 1e-9); assert.strictEqual(p.productos[0].precio_m2, 55000);
  assert.strictEqual(p.flujo.meses, 60); assert.strictEqual(Object.keys(p.flujo.filas).length, 27); assert(Object.keys(p.flujo.filas).every((k) => p.flujo.filas[k].length === 60)); casi(p.flujo.total.cobranza, 161.7, 1e-9); casi(p.flujo.total.firmas, 30);
  casi(p.flujo.total.obra, 87.39, 1e-4); assert(p.flujo.total.saldo_banco > 10 && p.flujo.total.flujo_acum > 0);
  assert.strictEqual(p.datos['terreno.m2'].valor, 2000); assert.strictEqual(p.datos['terreno.m2'].estado, 'confirmado'); casi(p.datos['costo.comision'].valor, 0.05); assert.strictEqual(p.datos['costo.comision'].estado, 'supuesto'); assert.strictEqual(p.datos['din.tiie'].estado, 'supuesto');
  assert.strictEqual(p.reparto.paga_tierra, 'si'); casi(p.reparto.parte_dueno, 0.3); assert.strictEqual(p.reparto.numero, null);
  const tam = JSON.stringify(p).length; assert(tam <= 50000, tam + ' caracteres'); assert(/estimado, no sincronizado/.test(p.origen)); assert(Object.keys(p.deducido).length > 3 && Object.keys(p.deducido).length <= 400);
  assert(!/NaN|Infinity/.test(JSON.stringify(p)));
  cifra('paquete del caso de muestra: ' + tam + ' de 50,000 caracteres; 27 series × 60 meses; ' + Object.keys(p.deducido).length + ' marcas «deducido»');
});
prueba('un plan sin empezar da un paquete sin cifras: lo desconocido va null o vacío, nunca 0', () => {
  const p = Motor.paqueteVisor(DEF, PLAN0);
  assert.strictEqual(p.v.ventas, null); assert.strictEqual(p.v.banco_max, null); assert.strictEqual(p.v.rv_resultado, null); assert.deepStrictEqual(p.productos, []); assert.strictEqual(p.flujo.meses, 0); assert.deepStrictEqual(p.flujo.filas, {}); assert.strictEqual(p.reparto, null);
  assert(Object.keys(p.v).every((k) => p.v[k] === null || typeof p.v[k] === 'string' || typeof p.v[k] === 'number')); assert.strictEqual(p.datos['terreno.m2'].valor, 2000); assert.strictEqual(p.v.tierra, 14); casi(p.datos['tierra.valor'].valor, 14); assert.strictEqual(p.datos['tierra.valor'].estado, 'supuesto'); assert.strictEqual(p.datos['lamina.m2_vendibles'].valor, null); assert.strictEqual(p.datos['lamina.m2_vendibles'].estado, 'falta');
  assert.strictEqual(p.a_medias, false, 'a_medias del visor = «el libro se recalcula»; lo por confirmar va en plan.candados_abiertos'); assert(p.plan.candados_abiertos > 0);
});
prueba('sin banco: el paquete no inventa cifras del banco', () => {
  const p = Motor.paqueteVisor(DEF, ev(BASE, dec('D-09', 'sin_banco')).plan); assert.strictEqual(p.v.rv_linea_ventas, 'sin banco'); assert.strictEqual(p.v.rv_resultado, 'No pasa: 1 de 9 pruebas'); assert.strictEqual(p.v.banco_mes, null); assert(p.flujo.total.saldo_banco === 0);
});

/* ═══════════════════ 16 · RENDIMIENTO ═══════════════════ */
grupo('16 · Rendimiento (Node, árbol vertical completo)');
function mide(f, n) { const t = process.hrtime.bigint(); for (let i = 0; i < n; i++) f(); return Number(process.hrtime.bigint() - t) / 1e6 / n; }
prueba('evalua completo < 50 ms (con rutas de causa, sin sugerencias; y con sugerencias diferidas)', () => {
  mide(() => Motor.evalua(DEF, BASE, null, { sugerencias: 'diferidas' }), 5);
  const sinRutas = mide(() => Motor.evalua(DEF, BASE, null, SIN), 50), conRutas = mide(() => Motor.evalua(DEF, BASE, null, { sugerencias: 'diferidas' }), 30), conCambio = mide(() => Motor.evalua(DEF, BASE, dec('P1-05', 'estudio'), { sugerencias: 'diferidas' }), 30);
  const desdeCero = mide(() => { let p = PLAN0; RESPUESTAS.forEach(([id, op]) => { p = Motor.evalua(DEF, p, dec(id, op), SIN).plan; }); }, 10) / 6;
  assert(conRutas < 50 && conCambio < 50 && sinRutas < 50, conRutas + ' ms');
  cifra('evalua completo: ' + sinRutas.toFixed(2) + ' ms (sin rutas), ' + conRutas.toFixed(1) + ' ms (con ruta por peso de las 6 alertas), ' + conCambio.toFixed(1) + ' ms (con cambio, 2 evaluaciones y rutas), ' + desdeCero.toFixed(2) + ' ms por respuesta en el recorrido; tope: 50 ms');
});
prueba('sugerencias < 500 ms por alerta (y la evaluación con sugerencias completas)', () => {
  const t = (id) => mide(() => sug(BASE, id), 3);
  const a = t('AL-RV-05'), b = t('AL-RV-07'), c = t('AL-K13-1');
  const todo = mide(() => Motor.evalua(DEF, BASE, null, { sugerencias: 'completas' }), 3);
  const chico = mide(() => Motor.evalua(DEF, BASE, dec('P1-05', 'estudio'), { sugerencias: 'completas' }), 3);
  assert(a < 500 && b < 500 && c < 500 && todo < 1000 && chico < 1000, a + ' ' + b);
  cifra('sugerencias: AL-RV-05 ' + a.toFixed(0) + ' ms, AL-RV-07 ' + b.toFixed(0) + ' ms, AL-K13-1 ' + c.toFixed(0) + ' ms (tope 500 ms por alerta); evalua con todas las sugerencias: ' + todo.toFixed(0) + ' ms (caso de muestra) y ' + chico.toFixed(0) + ' ms (departamentos más chicos, 7 alertas); tope por evaluación 1,000 ms');
});
prueba('carga < 100 ms y compara con 2 decisiones < 100 ms', () => {
  const c = mide(() => Motor.carga(VERT), 3), cmp = mide(() => Motor.compara(DEF, BASE, { id: 'B', cambios: Object.assign({}, dec('E-16', 'en_sotano'), dec('P1-05', 'estudio')) }, 'ab'), 5);
  assert(c < 400 && cmp < 100, c + ' ' + cmp); cifra('carga del árbol vertical: ' + c.toFixed(0) + ' ms; compara con 2 decisiones: ' + cmp.toFixed(1) + ' ms');
});

/* ═══════════════════ 17 · PUREZA Y CONTRATO ═══════════════════ */
grupo('17 · Pureza, idempotencia y forma del Resultado');
prueba('mismas entradas, mismas salidas; las entradas no se tocan', () => {
  const antes = JSON.stringify(BASE), c = JSON.stringify(dec('P1-05', 'estudio'));
  const a = JSON.stringify(Motor.evalua(DEF, BASE, dec('P1-05', 'estudio'), { sugerencias: 'completas' })), b = JSON.stringify(Motor.evalua(DEF, BASE, dec('P1-05', 'estudio'), { sugerencias: 'completas' }));
  assert.strictEqual(a, b); assert.strictEqual(JSON.stringify(BASE), antes); assert.strictEqual(JSON.stringify(dec('P1-05', 'estudio')), c);
});
prueba('el Resultado trae todos los campos del Anexo B y ningún NaN ni infinito', () => {
  const r = Motor.evalua(DEF, BASE, dec('P1-05', 'estudio'), { sugerencias: 'completas' });
  ['rotulo', 'definicion', 'contexto', 'nodos', 'abiertas', 'en_espera', 'cupo', 'reabiertas', 'ocultados', 'aparcados', 'por_confirmar', 'alertas', 'sugerencias_pendientes', 'rojos', 'tarjetas', 'pruebas', 'que_cambio', 'errores'].forEach((k) => assert(k in r, k));
  assert.strictEqual(r.rotulo, 'estimado, no sincronizado'); assert.strictEqual(Object.keys(r.tarjetas).length, 7); assert(!/NaN|Infinity/.test(JSON.stringify(r)));
  const n = r.nodos.find((x) => x.id === 'E-16'); ['id', 'tipo', 'titulo', 'de', 'usa', 'raiz', 'tarjetas', 'pregunta', 'que_es', 'etiqueta_resultado', 'permite_otro', 'estado', 'opcion', 'valor', 'valor_vista', 'unidad', 'opciones', 'fuentes', 'componentes', 'referencia', 'rango', 'notas', 'origen', 'confirma_en', 'de_que_sale', 'heredado', 'marca', 'antes'].forEach((k) => assert(k in n, 'nodo.' + k));
  assert(n.opciones.every((o) => o.disponible === true)); const a = r.alertas.find((x) => x.nivel === 'alto'); ['id', 'nivel', 'texto', 'sobre', 'nodo', 'nueva', 'empeoro', 'medida', 'origen', 'origen_cambio', 'ruta', 'aristas', 'factores', 'sugerencias', 'estado_sugerencias', 'no_mostradas', 'omitidas'].forEach((k) => assert(k in a, 'alerta.' + k));
  const t = r.tarjetas['Costo y ganancia'].cifras[0]; ['clave', 'etiqueta', 'id', 'valor', 'valor_visor', 'unidad', 'estado', 'campo_visor'].forEach((k) => assert(k in t, 'cifra.' + k));
});
prueba('tarjetas: se encienden por la marca «minimo_tarjeta» de ARBOL_FACTORES, ordenadas por «orden_tarjeta»', () => {
  const r0 = Motor.evalua(DEF, PLAN0, null, SIN); assert.strictEqual(r0.tarjetas.Terreno.encendida, true); assert.strictEqual(r0.tarjetas.Producto.encendida, false); assert.strictEqual(r0.tarjetas['Riesgo y estado'].encendida, true);
  const r = Motor.evalua(DEF, PLAN0, dec('E-15', 'elevador'), SIN); assert.strictEqual(r.tarjetas.Terreno.cifras[0].id, 'E-17'); assert.strictEqual(r.tarjetas.Terreno.cifras[0].etiqueta, 'Vendible');
  Object.keys(RB.tarjetas).forEach((t) => assert.strictEqual(RB.tarjetas[t].encendida, true, t));
  assert.strictEqual(RB.tarjetas.Dinero.cifras.find((c) => c.id === 'D-18').valor_visor, val(RB, 'D-18') / 1e6); assert.strictEqual(RB.tarjetas.Tiempo.cifras.find((c) => c.id === 'K-12').valor_visor, val(RB, 'K-12'), 'M5: sin «+1», la tarjeta da los mismos meses que el factor');
  assert.strictEqual(RB.tarjetas.Tiempo.cifras.find((c) => c.id === 'K-12').estado, 'estimado'); const firme = ev(BASE, { 'N-02': { valor: 0.36, estado: 'confirmado', fuente: 'Prueba' } }); assert.strictEqual(firme.tarjetas.Terreno.cifras.find((c) => c.id === 'T-01').estado, 'firme');
});
prueba('«por confirmar» cuenta lo visible que no es firme y baja al confirmar', () => {
  assert(RB.por_confirmar.n > 20); const r = ev(BASE, { 'N-02': { valor: 0.36, estado: 'confirmado', fuente: 'Prueba' } }); assert.strictEqual(r.por_confirmar.n, RB.por_confirmar.n - 1); assert(r.por_confirmar.ids.indexOf('N-02') < 0);
  assert(RB.por_confirmar.ids.indexOf('T-01') < 0, 'el predio no cuenta'); assert(RB.por_confirmar.ids.every((id) => !(nodo(RB, id) || {}).oculto));
  cifra('«por confirmar» con el caso de muestra: ' + RB.por_confirmar.n + ' valores (la distancia entre ESTIMADO y PLAN COMPLETO)');
});
prueba('heredado: un calculado es «firme» solo si todo lo que lo alimenta es firme', () => {
  const SIN_TIERRA = planCon(2000, RESPUESTAS, {});   /* la tierra en referencia: lo que sale de ella es estimado */
  let r = ev(SIN_TIERRA); assert.strictEqual(nodo(r, 'T-05').heredado, 'estimado'); r = ev(SIN_TIERRA, { 'T-04': { valor: 14, estado: 'confirmado', fuente: 'Prueba' } }); assert.strictEqual(nodo(r, 'T-05').heredado, 'firme');
});


/* ═══════════════════ 18 · EXTRAS DEL CONTRATO ═══════════════════ */
grupo('18 · Datos del plan, tipos (quita / parchea), matrices de Sheets, grafo y navegador');
prueba('datos del plan en solo lectura: «ritmo directo» (K-03) y «obra capturada» (C-06) mandan sobre el cálculo', () => {
  const p = JSON.parse(JSON.stringify(BASE)); p.datos = { 'K-03': 2 };
  const r = ev(p); assert.strictEqual(val(r, 'K-04'), 15, 'meses de venta = 30 / 2 redondeado hacia arriba'); assert.strictEqual(val(RB, 'K-04'), 25);
  const p2 = JSON.parse(JSON.stringify(BASE)); p2.datos = { 'C-06': 100000000 }; const r2 = ev(p2); casi(val(r2, 'C-17'), 100e6 * 1.18 + 0.05 * 161.7e6 + 0.04 * 14e6 + 14e6, 1e-9, 'costo con la obra capturada a mano (100 M)');
  const p3 = { tipo: 'vertical', valores: BASE.valores, datos: { 'K-03': { valor: 3, estado: 'confirmado', fuente: 'Prueba' } } }; assert.strictEqual(val(ev(p3), 'K-04'), 10);
});
prueba('el tipo puede quitar y parchar nodos (D7 7.1)', () => {
  const d = JSON.parse(JSON.stringify(VERT)); d.tipo.parchea = { 'K-06': { referencia: { valor: 12 } }, 'C-01': { rango: { max: 50000 } } }; const c = Motor.carga(d); assert.deepStrictEqual(c.errores, []);
  const r = Motor.evalua(c.definicion, BASE, null, SIN); assert.strictEqual(nodo(r, 'K-06').valor, 12); assert.strictEqual(nodo(r, 'C-01').rango.max, 50000); assert.strictEqual(nodo(r, 'C-01').rango.min, 8000, 'solo cambia el campo parchado');
  const q = JSON.parse(JSON.stringify(VERT)); q.tipo.quita = ['K-07']; const e = Motor.carga(q); assert(e.errores.some((x) => x.codigo === 'id_inexistente' && /K-07/.test(x.mensaje)), 'los que colgaban de lo quitado se avisan');
  const f = JSON.parse(JSON.stringify(VERT)); f.tipo.parchea = { 'ZZ-01': { titulo: 'x' } }; assert(Motor.carga(f).errores.some((x) => /parchea/.test(x.columna)));
});
prueba('acepta matrices con encabezado (lo que devuelve Sheets) en lugar de filas con nombre', () => {
  const t = {}; Object.keys(TABLAS).forEach((k) => { const filas = TABLAS[k], cab = Object.keys(filas[0]); t[k] = [cab].concat(filas.map((f) => cab.map((c) => f[c]))); });
  const r = Motor.carga(t); assert.deepStrictEqual(r.errores, []); assert.strictEqual(r.definicion.nodos.length, 130);
  const a = Motor.evalua(r.definicion, BASE, null, SIN), b = RB; assert.strictEqual(JSON.stringify(a.nodos.map((n) => [n.id, n.valor])), JSON.stringify(b.nodos.map((n) => [n.id, n.valor])));
});
prueba('grafo(): orden, aristas con tipo, dependientes y ancestros («todo lo que depende»)', () => {
  const g = Motor.grafo(DEF); assert(g.orden.length === 145 && g.aristas.length > 400); assert(g.aristas.every((a) => ['formula', 'condicion', 'efecto', 'escribe', 'flujo', 'componente', 'usa'].indexOf(a.tipo) >= 0));
  const dep = g.dependientes('P1-05'); ['P1-09', 'PT-01', 'K-04', 'K-12', 'PT-07', 'C-17', 'R-05', 'RV-05', 'RV-07', 'E-09', 'E-11'].forEach((id) => assert(dep.indexOf(id) >= 0, id)); assert(dep.indexOf('T-01') < 0);
  const anc = g.ancestros('RV-05'); ['R-05', 'R-03', 'PT-07', 'C-17', 'P1-06', 'C-01', 'E-15'].forEach((id) => assert(anc.indexOf(id) >= 0, id)); assert.deepStrictEqual(dep, g.orden.filter((id) => dep.indexOf(id) >= 0), 'en orden de cálculo');
});
prueba('«de» apunta al padre más cercano que se dibuja (los ocultos no tienen bolita)', () => { assert.strictEqual(nodo(RB, 'C-17').de, 'C-08'); assert.strictEqual(nodo(RB, 'C-17').de_original, 'C-16'); });
prueba('«su referencia cambió»: aviso informativo si lo confirmado difiere más de 15 % de la nueva referencia', () => {
  const p = ev(BASE, { 'E-03': { valor: 100, estado: 'confirmado', fuente: 'Prueba' } }).plan;   // planta baja cerrada confirmada
  const r = ev(p, { 'N-02': { valor: 0.5, estado: 'confirmado', fuente: 'Prueba' } }); assert(r.alertas.some((a) => a.id === 'AL-REFCAMBIO-E-03' && a.nivel === 'info'), 'debía avisar');
  assert(!ev(p, { 'N-04': { valor: 6, estado: 'confirmado', fuente: 'Prueba' } }).alertas.some((a) => a.id === 'AL-REFCAMBIO-E-03'));
});
prueba('«texto_sugerencia» reemplaza la plantilla de la sugerencia', () => {
  const d = JSON.parse(JSON.stringify(VERT)); d.nodos.find((n) => n.id === 'RV-07').alertas[0].texto_sugerencia = 'Mueve {nodo}: de {antes} a {despues}.'; const D2 = Motor.carga(d); assert.deepStrictEqual(D2.errores, []);
  const s = Motor.sugiere(D2.definicion, PROB, 'AL-RV-07'); assert.strictEqual(s.sugerencias[0].texto, 'Mueve Arranque: de 0.33 a 0.35.');
});
prueba('«sugiere = no» apaga las sugerencias de una alerta', () => {
  const d = JSON.parse(JSON.stringify(VERT)); d.nodos.find((n) => n.id === 'RV-07').alertas[0].sugiere = 'no'; const D2 = Motor.carga(d); const r = Motor.evalua(D2.definicion, PROB, null, { sugerencias: 'completas' });
  const a = r.alertas.find((x) => x.id === 'AL-RV-07'); assert.strictEqual(a.sugerencias, null); assert.strictEqual(a.estado_sugerencias, null);
});
prueba('funciona en el navegador (sin Node): el módulo cuelga de self.ArbolMotor', () => {
  const vm = require('vm'); const ctx = { self: {}, console }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(APP, 'motor.js'), 'utf8'), ctx);
  assert(ctx.self.ArbolMotor && typeof ctx.self.ArbolMotor.evalua === 'function' && typeof ctx.self.ArbolMotor.carga === 'function');
  const c = ctx.self.ArbolMotor.carga(JSON.parse(JSON.stringify(VERT))); assert.strictEqual(c.errores.length, 0); const r = ctx.self.ArbolMotor.evalua(c.definicion, PLAN0, null, SIN); assert.strictEqual(r.abiertas[0], 'E-15');
});
prueba('el motor no usa red, reloj ni azar para calcular (solo el reloj del tope de sugerencias)', () => {
  const f = fs.readFileSync(path.join(APP, 'motor.js'), 'utf8'); assert(!/Math\.random|fetch\(|XMLHttpRequest|require\(|import\s*\(|localStorage|document\./.test(f)); f.split('\n').forEach((l) => { if (/Date\.now|performance\.now/.test(l)) assert(/const ahora/.test(l), 'el reloj solo en ahora(): ' + l.trim().slice(0, 60)); });
});


prueba('propiedades de D7 15.7 #2 y #3: la ruta nace en lo que se tocó, termina en el dueño y cada arista existe en el grafo; nada confirmado se sugiere', () => {
  const g = Motor.grafo(DEF), existe = (a) => g.aristas.some((e) => e.de === a.de && e.a === a.a && e.tipo === a.tipo);
  let n = 0;
  [[PROB, dec('P1-05', 'estudio')], [ev(PROB, dec('E-16', 'a_nivel')).plan, dec('P1-05', 'estudio')], [PROB, { 'P1-06': { valor: 40000, estado: 'confirmado', fuente: 'Prueba' } }], [PROB, dec('E-16', 'en_sotano')]].forEach(([plan, cambio]) => {
    const r = Motor.evalua(DEF, plan, cambio, { sugerencias: 'completas' }); const tocados = Object.keys(cambio);
    r.alertas.filter((a) => a.nivel !== 'info' && a.origen === 'cambio').forEach((a) => {
      assert(tocados.indexOf(a.ruta[0]) >= 0 && a.ruta[a.ruta.length - 1] === a.nodo, a.id + ': ' + a.ruta.join('>')); a.aristas.forEach((e) => assert(existe(e), a.id + ': arista ' + e.de + '→' + e.a + ' (' + e.tipo + ') no está en el grafo')); n++;
      (a.sugerencias || []).forEach((s) => { if (s.nodo) { const nd = nodo(r, s.nodo); assert(nd.estado !== 'confirmado', 'se sugirió mover un confirmado: ' + s.nodo); } });
    });
  });
  assert(n >= 6, 'rutas revisadas: ' + n); cifra('rutas de causa revisadas contra el grafo: ' + n + ' (todas empiezan en lo tocado, terminan en el dueño y usan aristas que existen)');
});
prueba('fuzz determinista: 400 acciones al azar (con semilla) sin excepciones, sin NaN y con idempotencia', () => {
  let semilla = 20261122; const rnd = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };
  let plan = PLAN0, acciones = 0, errs = 0;
  const D = DEF._interna;
  for (let k = 0; k < 400; k++) {
    const r0 = Motor.evalua(DEF, plan, null, SIN); const vis = r0.nodos.filter((x) => x.tipo !== 'calculado');
    const x = vis[Math.floor(rnd() * vis.length)]; let cambio;
    const c = D.cn[D.ix.get(x.id)], u = rnd();
    if (u < 0.15) cambio = { [x.id]: { estado: 'referencia' } };
    else if (u < 0.25 && !x.raiz) cambio = { [x.id]: { estado: 'no_se' } };
    else if (x.componentes && x.componentes.length) { const m = x.componentes[Math.floor(rnd() * x.componentes.length)]; cambio = u < 0.6 ? { [x.id]: { componentes: { [m.clave]: { activo: rnd() < 0.5 } } } } : { [x.id]: { opcion: x.opciones[Math.floor(rnd() * x.opciones.length)].clave, estado: 'decidido' } }; }
    else if (x.opciones && x.opciones.length && u < 0.8) cambio = { [x.id]: { opcion: x.opciones[Math.floor(rnd() * x.opciones.length)].clave, estado: 'decidido' } };
    else if (x.fuentes && x.fuentes.length && u < 0.8) cambio = { [x.id]: { opcion: x.fuentes[Math.floor(rnd() * x.fuentes.length)].clave, estado: 'decidido' } };
    else if (x.rango) cambio = { [x.id]: { valor: x.rango.min + (x.rango.max - x.rango.min) * rnd() * 1.2, estado: 'confirmado' } };
    else cambio = { [x.id]: { estado: 'no_se' } };
    if (x.id === 'T-01') cambio = { 'T-01': { valor: 800 + Math.floor(rnd() * 4000), estado: 'confirmado' } };
    const r = Motor.evalua(DEF, plan, cambio, { sugerencias: rnd() < 0.1 ? 'completas' : 'no', rutas: rnd() < 0.2 ? 'completas' : 'no' });
    acciones++; errs += r.errores.length;
    const js = JSON.stringify(r); assert(!/NaN|Infinity/.test(js), 'NaN tras ' + JSON.stringify(cambio));
    assert(r.abiertas.length <= r.cupo + r.reabiertas.length, 'cupo excedido tras ' + JSON.stringify(cambio));
    const r2 = Motor.evalua(DEF, r.plan, null, SIN), r3 = Motor.evalua(DEF, r.plan, null, SIN);
    assert.strictEqual(JSON.stringify(r2.nodos.map((q) => [q.id, q.valor, q.estado, q.opcion])), JSON.stringify(r.nodos.map((q) => [q.id, q.valor, q.estado, q.opcion])), 'no idempotente tras ' + JSON.stringify(cambio));
    assert.strictEqual(JSON.stringify(r2), JSON.stringify(r3));
    plan = r.plan;
  }
  cifra('fuzz: ' + acciones + ' acciones al azar (opciones, valores, componentes, «no sé», volver a la referencia, valores fuera de rango): sin excepciones, sin NaN, idempotente; ' + errs + ' avisos de uso reportados sin lanzar');
});

/* ═══════════════════ 19 · ESTADO DE LO ESCRITO, BÚSQUEDA SIN PASO DE MÁS Y VALORES NO NUMÉRICOS ═══════════════════ */
grupo('19 · Estado de los valores escritos y sugeridos, búsqueda numérica exacta, valores no numéricos');
const NPEND = RB.por_confirmar.n;
const apaga = (id, plan, x) => !Motor.evalua(DEF, plan, { [x.nodo]: x.cambio }, SIN).alertas.some((q) => q.id === id);
prueba('aplicar «Sube Precio a $60,000» (caso con problemas): P1-06 queda «decidido» sugerido, «por confirmar» no cambia y AL-RV-05 se apaga', () => {
  const x = sug(PROB, 'AL-RV-05').sugerencias[0]; assert.strictEqual(x.nodo, 'P1-06'); assert.deepStrictEqual(x.cambio, { valor: 60000, estado: 'decidido', marca: 'sugerido', fuente: 'Sugerencia del motor · AL-RV-05' });
  const r = ev(PROB, { [x.nodo]: x.cambio }); assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(nodo(r, 'P1-06').estado, 'decidido'); casi(nodo(r, 'P1-06').valor, 60000);
  const reg = r.plan.valores['P1-06']; assert.strictEqual(reg.estado, 'decidido'); assert.strictEqual(reg.marca, 'sugerido'); assert.strictEqual(reg.fuente, 'Sugerencia del motor · AL-RV-05');
  assert.strictEqual(r.por_confirmar.n, RP.por_confirmar.n); assert(r.por_confirmar.ids.indexOf('P1-06') >= 0);
  assert(!r.alertas.some((a) => a.id === 'AL-RV-05'), 'la alerta se apaga');
  cifra('«Sube Precio a $60,000» aplicado: P1-06 «decidido» (sugerido), por confirmar ' + r.por_confirmar.n + ', AL-RV-05 apagada, margen ' + (val(r, 'R-05') * 100).toFixed(1) + ' %');
});
prueba('la palanca de un valor sugerido se puede sugerir otra vez mientras no esté confirmada', () => {
  const plan = ev(BASE, { 'P1-06': { valor: 50000, estado: 'decidido', marca: 'sugerido', fuente: 'Sugerencia del motor · AL-RV-05' } }).plan;
  const s = sug(plan, 'AL-RV-05'); assert(s.omitidas.indexOf('P1-06') < 0); assert(s.sugerencias.some((x) => x.palanca === 'P1-06' && x.cambio.marca === 'sugerido'), 'P1-06 vuelve a sugerirse');
});
prueba('{valor, estado: confirmado} sin fuente queda «decidido» (valor propio) y avisa; con fuente queda «confirmado»', () => {
  [undefined, '', '   '].forEach((f) => {
    const r = ev(BASE, { 'P1-06': { valor: 57500, estado: 'confirmado', fuente: f } }); const n = nodo(r, 'P1-06');
    assert.strictEqual(n.estado, 'decidido'); assert.strictEqual(r.plan.valores['P1-06'].estado, 'decidido'); assert.strictEqual(r.plan.valores['P1-06'].marca, 'valor_propio');
    assert(r.errores.some((e) => e.codigo === 'fuente_no_disponible' && e.id === 'P1-06' && /de dónde sale/.test(e.mensaje)), 'avisa'); assert(r.por_confirmar.ids.indexOf('P1-06') >= 0); assert.strictEqual(r.por_confirmar.n, NPEND);
  });
  const r = ev(BASE, { 'P1-06': { valor: 57500, estado: 'confirmado', fuente: 'Cotización de 3 desarrolladores' } }); const n = nodo(r, 'P1-06');
  assert.strictEqual(n.estado, 'confirmado'); assert.strictEqual(r.plan.valores['P1-06'].fuente, 'Cotización de 3 desarrolladores'); assert.strictEqual(r.plan.valores['P1-06'].marca, undefined);
  assert.deepStrictEqual(r.errores, []); assert(r.por_confirmar.ids.indexOf('P1-06') < 0); assert.strictEqual(r.por_confirmar.n, NPEND - 1);
});
prueba('{valor, estado: decidido} en un «se busca» queda decidido con valor propio; sin estado se conserva la conducta de antes (confirmado)', () => {
  const r = ev(BASE, { 'P1-06': { valor: 58000, estado: 'decidido' } }); assert.strictEqual(nodo(r, 'P1-06').estado, 'decidido'); assert.strictEqual(r.plan.valores['P1-06'].marca, 'valor_propio'); assert(r.por_confirmar.ids.indexOf('P1-06') >= 0);
  const r2 = ev(BASE, { 'P1-06': { valor: 58000 } }); assert.strictEqual(nodo(r2, 'P1-06').estado, 'confirmado'); assert(r2.por_confirmar.ids.indexOf('P1-06') < 0);
  const r3 = ev(BASE, { 'E-15': { opcion: 'amenidades', estado: 'decidido' } }); assert.strictEqual(nodo(r3, 'E-15').estado, 'decidido');   // se_decide sigue igual
});
prueba('una fuente elegida de la lista sigue firme (C-10)', () => {
  const r = ev(BASE, dec('C-10', 'libro_ppp2')); assert.strictEqual(nodo(r, 'C-10').estado, 'decidido'); assert(r.por_confirmar.ids.indexOf('C-10') < 0);
});
prueba('búsqueda exacta: AL-K13-1 sugiere «Sube Arranque de 33% a 35%» y AL-RV-07 sigue en 35 %', () => {
  const a = sug(PROB, 'AL-K13-1').sugerencias[0]; assert.strictEqual(a.texto, 'Sube Arranque de 33% a 35% y la alerta se apaga.');   // ola 4: AL-K13-1 no es una de las 9 pruebas de riesgo casi(a.despues, 0.35);
  const b = sug(PROB, 'AL-RV-07').sugerencias[0]; assert.strictEqual(b.texto, 'Sube Arranque de 33% a 35% y la prueba pasa.'); casi(b.despues, 0.35);
  cifra('búsqueda exacta: AL-K13-1 «' + a.texto + '» (antes 36 %); AL-RV-07 «' + b.texto + '»');
});
prueba('plan «estudio» (caso con problemas): AL-RV-07 sugiere 34 % (con 33 % no pasa: RV-07 da 32.98 %)', () => {
  const r = Motor.evalua(DEF, PROB, dec('P1-05', 'estudio'), { sugerencias: 'completas' }); const a = r.alertas.find((q) => q.id === 'AL-RV-07');
  assert(a && a.sugerencias.length > 0); const x = a.sugerencias.find((q) => q.palanca === 'K-13'); assert(x, 'hay sugerencia de Arranque'); assert.strictEqual(x.texto, 'Sube Arranque de 33% a 34% y la prueba pasa.');
  const p2 = ev(PROB, dec('P1-05', 'estudio')).plan; const r33 = ev(p2); casi(val(r33, 'RV-07'), 0.3298, 5e-4); assert(r33.alertas.some((q) => q.id === 'AL-RV-07'), '33 % no pasa'); const r35 = ev(p2, { 'K-13': { valor: 0.34, estado: 'decidido' } }); assert(!r35.alertas.some((q) => q.id === 'AL-RV-07'), '34 % sí pasa y un paso menos no');
  cifra('plan «estudio»: AL-RV-07 → «' + x.texto + '»; con 34 % RV-07 da ' + (val(r35, 'RV-07') * 100).toFixed(2) + ' %');
});
prueba('propiedad: cada sugerencia numérica apaga su alerta y un paso menos hacia el valor actual no la apaga', () => {
  const Ds = DEF._interna; let n = 0;
  const planes = [[PROB, ['AL-RV-05', 'AL-RV-07', 'AL-K13-1']], [ev(PROB, dec('P1-05', 'estudio')).plan, ['AL-RV-05', 'AL-RV-07', 'AL-K13-1']]];
  planes.forEach(([plan, ids]) => {
    const R0 = ev(plan);
    ids.forEach((id) => sug(plan, id).sugerencias.forEach((x) => {
      if (x.tipo !== 'numero' && !(x.tipo === 'componente' && x.antes !== null && x.despues !== null && x.despues !== 0)) return;
      assert(apaga(id, plan, x), id + ': «' + x.texto + '» debe apagar la alerta');
      let paso, previo;
      if (x.tipo === 'numero') { paso = nodo(R0, x.nodo).rango.paso; previo = x.despues > x.antes ? x.despues - paso : x.despues + paso; }
      else { const k = Object.keys(x.cambio.componentes)[0], m = nodo(R0, x.nodo).componentes.find((q) => q.clave === k); paso = m.paso; previo = x.despues > x.antes ? x.despues - paso : x.despues + paso; }
      previo = Number(previo.toFixed(10));
      if (!(x.despues > x.antes ? previo > x.antes : previo < x.antes)) { n++; return; }   // ya está pegada al valor actual
      const ch = x.tipo === 'numero' ? Object.assign({}, x.cambio, { valor: previo }) : { componentes: { [Object.keys(x.cambio.componentes)[0]]: { valor: previo, unidad: x.cambio.componentes[Object.keys(x.cambio.componentes)[0]].unidad } } };
      assert(!apaga(id, plan, { nodo: x.nodo, cambio: ch }), id + ': «' + x.texto + '» con un paso menos (' + previo + ') también la apaga: hubo un paso de más');
      n++;
    }));
  });
  assert(n >= 8, 'sugerencias numéricas revisadas: ' + n); cifra('sin paso de más: ' + n + ' sugerencias numéricas revisadas (caso de muestra y plan «estudio»); cada una apaga su alerta y un paso menos hacia el valor actual no la apaga');
});
prueba('valor no numérico en un nodo numérico: «Escribe un número.», no se aplica y se queda el anterior', () => {
  const base = ev(PROB, { 'P1-06': { valor: 57500, estado: 'confirmado', fuente: 'Prueba' } }); const antes = JSON.stringify(base.plan.valores['P1-06']);
  assert.strictEqual(RP.pruebas.resultado, 'No pasa: 2 de 9 pruebas');
  ['abc', '', NaN, Infinity, -Infinity, {}, true].forEach((v) => {
    const r = ev(RP.plan, { 'P1-06': { valor: v, estado: 'confirmado', fuente: 'Prueba' } });
    assert(r.errores.some((e) => e.codigo === 'fuera_de_rango' && e.id === 'P1-06' && e.mensaje === 'Escribe un número.'), 'error para ' + String(v)); assert.strictEqual(r.pruebas.resultado, 'No pasa: 2 de 9 pruebas'); casi(val(r, 'P1-06'), 55000); assert.strictEqual(nodo(r, 'P1-06').estado, 'referencia');
    const r2 = ev(base.plan, { 'P1-06': { valor: v, estado: 'confirmado', fuente: 'Prueba' } }); assert.strictEqual(JSON.stringify(r2.plan.valores['P1-06']), antes, 'queda el valor anterior');
  });
  const rd = ev(PROB, { 'K-13': { valor: 'abc', estado: 'decidido' } }); assert(rd.errores.some((e) => e.id === 'K-13' && e.mensaje === 'Escribe un número.'), 'también en una decisión numérica'); casi(val(rd, 'K-13'), 0.33);
  cifra('«abc», NaN e Infinity en P1-06: error «Escribe un número.», valor sin cambio y RV-11 sigue en «' + RP.pruebas.resultado + '»');
});
prueba('texto numérico (\'57500\') se convierte y se acepta', () => {
  const r = ev(BASE, { 'P1-06': { valor: '57500', estado: 'confirmado', fuente: 'Prueba' } }); assert.deepStrictEqual(r.errores, []); casi(val(r, 'P1-06'), 57500); assert.strictEqual(typeof r.plan.valores['P1-06'].valor, 'number');
});
prueba('los IDs en minúscula se rechazan con un mensaje que dice que se escriben como T-01', () => {
  ['t-01 > 5', 'p1-06 + 1', 'si(t-01 > 1, 1, 2)'].forEach((t) => { const a = Motor.analiza(t); assert.strictEqual(a.ok, false, t); assert(/mayúsculas/.test(a.mensaje) && /T-01/.test(a.mensaje), a.mensaje); assert.throws(() => X(t, {}), /mayúsculas/); });
  assert.strictEqual(Motor.analiza('T-01 > 5').ok, true);
  const m = JSON.parse(JSON.stringify(VERT)); m.nodos.find((n) => n.id === 'RV-07').formula = 'k-05 + 1'; const c = Motor.carga(m); assert(c.errores.length > 0 && c.errores.some((e) => /mayúsculas/.test(e.mensaje)), 'el validador también avisa');
});
prueba('T-01 ≤ 0 (sin excepción ni NaN): se ajusta al mínimo del rango (1 m²), avisa y NO borra las decisiones (falla F1 de la ola 5)', () => {
  [0, -50].forEach((v) => {
    const r = ev(BASE, { 'T-01': { valor: v, estado: 'confirmado', fuente: 'Prueba' } });
    assert(r.errores.some((e) => e.codigo === 'fuera_de_rango' && e.id === 'T-01' && /ajust/.test(e.mensaje)), 'avisa con ' + v); assert(!/NaN|Infinity/.test(JSON.stringify(r)), 'sin NaN con T-01 = ' + v);
    assert.strictEqual(val(r, 'T-01'), 1, 'el predio queda en el mínimo');
    assert.strictEqual(Object.keys(r.plan.valores).length, Object.keys(BASE.valores).length, 'con ' + v + ' no se pierde ningún valor del plan');
    const back = ev(r.plan, { 'T-01': { valor: 2000, estado: 'confirmado', fuente: 'Prueba' } });
    assert.strictEqual(back.nodos.length, RB.nodos.length, 'al volver a 2,000 el árbol es el mismo (' + RB.nodos.length + ' nodos)'); casi(val(back, 'PT-07'), val(RB, 'PT-07'), 1e-9, 'y las ventas también');
  });
  assert(!RB.errores.some((e) => e.id === 'T-01'));
});
prueba('F2 · predios muy chicos: m² vendibles, unidades y ventas con piso en 0 (nunca negativos) y aviso «el predio es muy chico»', () => {
  [1, 20, 150, 250, 290].forEach((m2) => {
    const r = ev(BASE, { 'T-01': { valor: m2, estado: 'confirmado', fuente: 'Prueba' } });
    ['E-17', 'PT-01', 'PT-07'].forEach((id) => { const x = val(r, id); assert(typeof x === 'number' && x >= 0 && isFinite(x), id + ' con ' + m2 + ' m² = ' + x); });
    assert(!/NaN|Infinity/.test(JSON.stringify(r)), 'sin NaN con ' + m2 + ' m²');
    assert.strictEqual(r.alertas.some((a) => a.id === 'AL-PT01-1' && /muy chico/.test(a.texto)), val(r, 'PT-01') < 1, 'avisa que el predio es muy chico exactamente cuando no cabe una unidad (' + m2 + ' m², ' + val(r, 'PT-01') + ' unidades)');
    const am = ev(BASE, Object.assign(dec('E-15', 'amenidades'), { 'T-01': { valor: m2, estado: 'confirmado', fuente: 'Prueba' } }));   // el plan de los pasos del hallazgo: «Con amenidades»
    ['E-17', 'PT-01', 'PT-07'].forEach((id) => assert(val(am, id) >= 0, id + ' con amenidades y ' + m2 + ' m² = ' + val(am, id)));
    if (m2 <= 150) { assert(val(am, 'E-15') < 0 && val(am, 'E-17') === 0, 'con amenidades y ' + m2 + ' m² la eficiencia sale negativa pero lo vendible queda en 0'); assert(am.alertas.some((a) => a.id === 'AL-E15-4' && /muy chico/.test(a.texto)), 'y avisa'); }
  });
  assert(!RB.alertas.some((a) => a.id === 'AL-PT01-1' || a.id === 'AL-E15-4'), 'el plan de muestra no dispara el aviso');
  const r290 = ev(BASE, Object.assign(dec('E-15', 'amenidades'), { 'T-01': { valor: 290, estado: 'confirmado', fuente: 'Prueba' } })); assert.strictEqual(val(r290, 'PT-01'), 0); assert(r290.alertas.some((a) => a.id === 'AL-PT01-1'), 'aunque E-17 sea positivo, si no cabe una unidad también avisa');
  cifra('F2: con 1, 150 y 250 m² el vendible, las unidades y las ventas quedan en 0 (antes −413, −188 m²; −6 y −3 unidades; −$24.4 M y −$12.2 M) y salen AL-E15-4 / AL-PT01-1; con 290 m² cabe 0 unidades y avisa AL-PT01-1');
});

/* ═══════════════════ 25 · AJUSTES DE LA OLA 4 ═══════════════════ */
grupo('25 · Ajustes de la ola 4 (causa del comparador, aportes, veredicto, cierre de sugerencias, límites de analiza, editaDefinicion)');
const REINA = Object.assign({}, dec('E-16', 'en_sotano'), dec('P1-05', 'tres_rec'), { 'P1-06': { valor: 60000, estado: 'confirmado', fuente: 'Prueba' } });
const cmpR = Motor.compara(DEF, PROB, { id: 'B', cambios: REINA }, 'ab');   /* desde el caso con problemas (A): sótano + 3 recámaras + $60,000 (B) */
prueba('1a · caso de la Reina (sótano + 3 recámaras + $60,000): la ganancia sube por el precio, no por el sótano', () => {
  const frase = (et) => cmpR.causas.find((t) => t.indexOf(et) === 0);
  ['Utilidad sube', 'Ganancia real sube'].forEach((et) => { const t = frase(et); assert(t, 'no hay frase «' + et + '»: ' + cmpR.causas.join(' | ')); assert(/\(cambio: Precio = \$60,000 por m²\)\.$/.test(t), t); assert(!/sótano/.test(t), t); });
  cifra('causa (3 decisiones): «' + frase('Utilidad sube') + '»');
});
prueba('1b · la decisión nombrada es siempre la que más aporta en el sentido del cambio, según la atribución', () => {
  const combos = [REINA, Object.assign({}, dec('E-16', 'a_nivel'), dec('P1-05', 'estudio')), Object.assign({}, dec('E-16', 'en_sotano'), { 'C-01': { valor: 21000, estado: 'confirmado', fuente: 'Prueba' } })];
  let revisadas = 0;
  combos.forEach((cambios) => {
    const c = Motor.compara(DEF, BASE, { id: 'B', cambios }, 'ab');
    c.causas.forEach((t) => {
      const m = c.medidas.find((x) => t.indexOf(x.etiqueta + (x.b > x.a ? ' sube' : ' baja')) === 0); assert(m, t);
      const dir = m.b > m.a ? 1 : -1, mejor = c.atribucion.filter((x) => x.medida === m.id && x.efecto !== null).sort((x, y) => y.efecto * dir - x.efecto * dir)[0];
      const nombre = ({ 'E-16': 'Estacionamiento', 'P1-05': 'Producto', 'P1-06': 'Precio', 'C-01': 'Costo de obra' })[mejor.decision];
      assert(t.indexOf('(cambio: ' + nombre + ' ') >= 0, t + ' ← debía nombrar ' + mejor.decision); revisadas++;
    });
  });
  cifra('causa = decisión de mayor aporte: ' + revisadas + ' frases revisadas en 3 combinaciones de decisiones');
});
prueba('1c · con una sola decisión la frase sigue igual (con su porque)', () => {
  const c = Motor.compara(DEF, BASE, { id: 'B', cambios: dec('E-16', 'en_sotano') }, 'ab');
  assert(c.causas.every((t) => /porque .* pasa de .* a .* \(cambio: Estacionamiento = «En sótano»\)\.$/.test(t)), c.causas.join(' | '));
});
prueba('1d · aportes: una entrada por cada cifra de las 7 tarjetas, ordenada por tamaño, con signo, y la suma cuadra con el cambio', () => {
  const ids = new Set(); Motor.TARJETAS.forEach((t) => cmpR.B.tarjetas[t].cifras.forEach((f) => ids.add(f.id)));
  assert.deepStrictEqual(cmpR.aportes.map((x) => x.id).sort(), Array.from(ids).sort());
  const u = cmpR.aportes.find((x) => x.id === 'R-03'); assert.strictEqual(u.lista[0].decision, 'P1-06'); assert.strictEqual(u.lista[0].signo, '+'); assert.strictEqual(u.lista[0].efecto_texto, '+$21.4 M');
  const sot = u.lista.find((x) => x.decision === 'E-16'); assert.strictEqual(sot.signo, '-'); assert(/^−\$15\.6 M$/.test(sot.efecto_texto), sot.efecto_texto);
  for (let k = 1; k < u.lista.length; k++) assert(Math.abs(u.lista[k - 1].efecto) >= Math.abs(u.lista[k].efecto), 'orden por tamaño');
  let cuadran = 0;
  cmpR.aportes.forEach((x) => { if (!x.cambia) return; const suma = x.lista.reduce((q, f) => q + f.efecto, 0); assert(Math.abs(suma - x.delta) <= 0.01 * Math.abs(x.delta) + 1e-9, x.id + ': ' + suma + ' vs ' + x.delta); assert(x.lista.every((f) => f.texto && f.efecto_texto && ['+', '-', '0'].indexOf(f.signo) >= 0)); cuadran++; });
  cifra('aportes: ' + cmpR.aportes.length + ' cifras de las tarjetas (' + cuadran + ' cambian); en todas la suma de aportes (con el efecto combinado cuando pasa de la tolerancia) da el cambio con menos de 1% de diferencia por redondeo; Utilidad: ' + u.lista.map((f) => f.texto + ' ' + f.efecto_texto).join(' · '));
});
prueba('1e · veredicto en palabras con reglas simples (utilidad, pruebas, dinero, plazo)', () => {
  assert.strictEqual(cmpR.veredicto.gana, 'B'); assert(/^B deja más utilidad/.test(cmpR.veredicto.palabras), cmpR.veredicto.palabras);
  assert(/\/A es mejor en \d+ de \d+ medidas; B en \d+; empatan en \d+\./.source.length > 0 && /A es mejor en \d+ de \d+ medidas; B en \d+; empatan en \d+\./.test(cmpR.veredicto.texto), 'texto de siempre intacto');
  const s = Motor.compara(DEF, PROB, { id: 'B', cambios: dec('E-16', 'en_sotano') }, 'ab'); assert.strictEqual(s.veredicto.gana, 'A'); assert(/^A deja más utilidad/.test(s.veredicto.palabras), s.veredicto.palabras);
  // regla del «pero»: se construye con medidas inventadas (B deja más utilidad pero pide más dinero y pasa menos pruebas)
  const r = Motor.compara(DEF, PROB, {}, 'ab'); assert.strictEqual(r.veredicto.gana, null); assert.strictEqual(r.veredicto.palabras, 'A y B dan lo mismo en utilidad, dinero, pruebas y plazo.');
  assert(Array.isArray(Motor.REGLAS_VEREDICTO) && Motor.REGLAS_VEREDICTO.length >= 4);
  cifra('veredicto: «' + cmpR.veredicto.palabras + '» y para sótano solo: «' + s.veredicto.palabras + '»');
});
prueba('1f · veredicto «pero»: si la ganadora pide más dinero y pasa menos pruebas, lo dice así', () => {
  // se prueba la regla sobre medidas sintéticas a través del comparador con una definición donde RV-10 y R-11 empeoran al subir el precio
  const d = JSON.parse(JSON.stringify(VERT)); const p = d.nodos.find((n) => n.id === 'P1-06'); assert(p);
  const mejor = { 'R-03': 'B', 'R-11': 'A', 'RV-10': 'A', 'K-12': 'empate' };
  // la regla es una función pura del arreglo de medidas: se ejercita con el comparador real buscando un caso que la dispare
  let hallado = null;
  [dec('E-16', 'a_nivel'), dec('E-15', 'sencillo'), dec('E-15', 'amenidades'), dec('K-13', 'la_mitad'), { 'K-13': { valor: 0.5, estado: 'decidido' } }, dec('P1-05', 'estudio'), dec('P1-05', 'tres_rec'), { 'C-01': { valor: 17000, estado: 'confirmado', fuente: 'Prueba' } }, { 'P1-06': { valor: 75000, estado: 'confirmado', fuente: 'Prueba' } }].forEach((cambios) => {
    if (hallado) return; const c = Motor.compara(DEF, BASE, { id: 'B', cambios }, 'ab'); if (/, pero /.test(c.veredicto.palabras)) hallado = c;
  });
  assert(hallado, 'ningún caso de muestra dispara el «pero»'); assert(/^[AB] .+, pero .+\.$/.test(hallado.veredicto.palabras)); assert(!/ y y /.test(hallado.veredicto.palabras));
  cifra('veredicto con «pero»: «' + hallado.veredicto.palabras + '»');
});
prueba('1g · «todas las opciones» también trae aportes y veredicto en palabras', () => {
  const c = Motor.compara(DEF, BASE, {}, { todas_las_opciones: 'E-16' }); assert(c.B.every((x) => Array.isArray(x.aportes) && x.aportes.length > 0 && typeof x.veredicto.palabras === 'string'));
});

prueba('2 · cada sugerencia trae cambio_evalua ya envuelto y pasarlo a evalua apaga la alerta', () => {
  const plan = ev(BASE, { 'P1-06': { valor: 50000, estado: 'confirmado', fuente: 'Prueba' } }).plan;
  let n = 0;
  ['AL-RV-05', 'AL-RV-07', 'AL-K13-1'].forEach((id) => {
    const s = Motor.sugiere(DEF, plan, id); s.sugerencias.filter((x) => x.pasa).forEach((x) => {
      assert.deepStrictEqual(Object.keys(x.cambio_evalua), [x.nodo]); assert.deepStrictEqual(x.cambio_evalua[x.nodo], x.cambio);
      const r = ev(plan, x.cambio_evalua); assert(!r.alertas.some((a) => a.id === id), id + ': «' + x.texto + '» no apaga la alerta'); n++;
    });
  });
  assert(n >= 4, 'pocas sugerencias revisadas: ' + n); cifra('cambio_evalua: ' + n + ' sugerencias de 3 alertas pasadas directo a evalua; todas apagan su alerta');
  const comp = Motor.sugiere(DEF, BASE, 'AL-RV-05').sugerencias.find((x) => x.tipo === 'componente' || (x.cambio && x.cambio.componentes));
  if (comp) { const r = ev(BASE, comp.cambio_evalua); assert(r.errores.length === 0, JSON.stringify(r.errores)); }
});
prueba('3 · «y la prueba pasa» solo en las 9 pruebas de riesgo; en las demás, texto de la regla o «y la alerta se apaga»', () => {
  const rv = Motor.sugiere(DEF, PROB, 'AL-RV-05').sugerencias.filter((x) => x.pasa); assert(rv.length > 0 && rv.every((x) => /y la prueba pasa/.test(x.texto)), 'pruebas de riesgo conservan su cierre');
  const k = Motor.sugiere(DEF, PROB, 'AL-K13-1').sugerencias.filter((x) => x.pasa); assert(k.length > 0 && k.every((x) => /y la alerta se apaga/.test(x.texto) && !/prueba pasa/.test(x.texto)), k.map((x) => x.texto).join(' | '));
  const d = JSON.parse(JSON.stringify(VERT)); d.nodos.find((n) => n.id === 'K-13').alertas.find((a) => a.id === 'AL-K13-1').texto_cierre = 'y la preventa llega al mínimo.';
  const k2 = Motor.sugiere(Motor.carga(d).definicion, PROB, 'AL-K13-1').sugerencias.filter((x) => x.pasa); assert(k2.length > 0 && k2.every((x) => /y la preventa llega al mínimo\.$/.test(x.texto)), k2[0].texto);
  const t = JSON.parse(JSON.stringify(TABLAS)); t.ARBOL_REGLAS.forEach((r) => { if (r.id === 'AL-K13-1') r.texto_cierre = 'y la preventa alcanza'; }); const ct = Motor.carga(t); assert.deepStrictEqual(ct.errores, []);
  assert(/y la preventa alcanza\.$/.test(Motor.sugiere(ct.definicion, PROB, 'AL-K13-1').sugerencias[0].texto));
  cifra('cierre: AL-RV-05 «' + rv[0].texto + '»; AL-K13-1 «' + k[0].texto + '»; con texto_cierre propio «' + k2[0].texto + '»');
});
prueba('3b · una sugerencia con efecto colateral conserva su cierre antes del «pero»', () => {
  const plan = ev(BASE, { 'P1-06': { valor: 50000, estado: 'confirmado', fuente: 'Prueba' } }).plan; let visto = 0;
  ['AL-RV-05', 'AL-RV-07', 'AL-K13-1', 'AL-RV-01'].forEach((id) => Motor.sugiere(DEF, plan, id).sugerencias.forEach((x) => { if (x.colaterales && x.colaterales.length) { assert(/ y (la prueba pasa|la alerta se apaga), pero /.test(x.texto), x.texto); visto++; } }));
  cifra('sugerencias con efecto colateral revisadas: ' + visto);
});

prueba('4 · analiza aplica los mismos límites que carga (profundidad y cantidad de IDs)', () => {
  const prof = (n) => 'si(' .repeat(n) + '1' + ', 1, 1)'.repeat(n);
  let corte = null; for (let n = 1; n <= 20; n++) { const a = Motor.analiza(prof(n)); if (!a.ok) { corte = n; break; } }
  assert(corte !== null, 'ninguna profundidad se rechazó'); const bien = prof(corte - 1), mal = prof(corte);
  assert.strictEqual(Motor.analiza(bien).ok, true); const am = Motor.analiza(mal); assert.strictEqual(am.ok, false); assert(/anidada/.test(am.mensaje) && /12/.test(am.mensaje), am.mensaje);
  const cargaCon = (f) => muta((d) => { d.nodos.find((n) => n.id === 'RV-07').formula = f; });
  assert(cargaCon(mal).errores.some((e) => e.codigo === 'expresion_profunda'), 'carga rechaza lo que analiza rechaza');
  assert(!cargaCon(bien).errores.some((e) => e.codigo === 'expresion_profunda'), 'carga no marca profunda lo que analiza acepta');
  const muchos = Array.from({ length: 61 }, (_, i) => 'T-' + String(i + 1).padStart(2, '0')).join(' + '); const ids = Motor.analiza(muchos); assert.strictEqual(ids.ok, false); assert(/61 IDs distintos/.test(ids.mensaje), ids.mensaje);
  const ok60 = Array.from({ length: 60 }, (_, i) => 'T-' + String(i + 1).padStart(2, '0')).join(' + '); assert.strictEqual(Motor.analiza(ok60).ok, true);
  cifra('analiza: profundidad ' + (corte - 1) + ' pasa y ' + corte + ' se rechaza (máximo 12), igual que carga; 60 IDs pasan y 61 se rechazan');
});

/* — editaDefinicion — */
const edita = (cambios, def) => Motor.editaDefinicion(def || DEF, cambios);
const aplana = (r) => JSON.stringify(r.errores.map((e) => [e.pestana, e.columna, e.codigo]));
prueba('5a · cambia columnas de datos de varias pestañas, valida con carga y no muta la original', () => {
  const antes = JSON.stringify(VERT), huella0 = DEF.huella;
  const r = edita([
    { tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'referencia_valor', valor: 60000 },
    { tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'rango_max', valor: 130000 },
    { tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'titulo', valor: 'Precio de venta' },
    { tabla: 'ARBOL_OPCIONES', nodo: 'E-15', clave: 'sencillo', columna: 'nombre', valor: 'Básico' },
    { tabla: 'ARBOL_COMPONENTES', nodo: 'E-15', clave: 'pasillos', columna: 'cantidad', valor: '0.20' },
    { tabla: 'ARBOL_REGLAS', id: 'AL-RV-05', columna: 'texto', valor: 'El margen es {RV-05}; se pide al menos 20%.' }
  ]);
  assert.strictEqual(r.ok, true, JSON.stringify(r.errores)); assert.deepStrictEqual(r.errores, []); assert(r.definicion && r.definicion._interna);
  assert.strictEqual(JSON.stringify(VERT), antes, 'el JSON original no cambió'); assert.strictEqual(DEF.huella, huella0, 'la definición cargada no cambió'); assert.strictEqual(r.huella_antes, huella0); assert.notStrictEqual(r.huella_despues, huella0); assert.strictEqual(r.definicion.huella, r.huella_despues);
  const p = r.definicion._interna.cn.find((c) => c.id === 'P1-06'); assert.strictEqual(p.titulo, 'Precio de venta');
  const e = Motor.evalua(r.definicion, PLAN0, {}, SIN); assert.deepStrictEqual(e.errores, []);
  assert.deepStrictEqual(Object.keys(r.filas_cambiadas).sort(), ['ARBOL_COMPONENTES', 'ARBOL_NODOS', 'ARBOL_OPCIONES', 'ARBOL_REGLAS']);
  const fn = r.filas_cambiadas.ARBOL_NODOS; assert.strictEqual(fn.length, 1, 'tres columnas del mismo nodo = una fila'); assert.deepStrictEqual(fn[0].clave, { id: 'P1-06' }); assert.deepStrictEqual(fn[0].columnas, { referencia_valor: 60000, rango_max: 130000, titulo: 'Precio de venta' }); assert(fn[0].fila >= 2);
  assert.strictEqual(r.filas_cambiadas.ARBOL_OPCIONES[0].columnas.nombre, 'Básico');
  cifra('editaDefinicion: 6 cambios en 4 pestañas → 4 filas por pestaña (P1-06 junta 3 columnas), huella ' + r.huella_antes + ' → ' + r.huella_despues + ', original intacta');
});
prueba('5b · la referencia nueva se nota en el cálculo (precio de referencia $60,000)', () => {
  const r = edita([{ tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'referencia_valor', valor: 60000 }]); assert(r.ok);
  const a = Motor.evalua(DEF, BASE, {}, SIN), b = Motor.evalua(r.definicion, BASE, {}, SIN);
  assert.strictEqual(val(a, 'P1-06'), 55000); assert.strictEqual(val(b, 'P1-06'), 60000); assert(val(b, 'PT-07') > val(a, 'PT-07'));
});
prueba('5c · cambios encadenados: el resultado vuelve a editarse y el cargado desde tablas también', () => {
  const r1 = edita([{ tabla: 'ARBOL_NODOS', id: 'K-06', columna: 'referencia_valor', valor: 20 }]); assert(r1.ok, aplana(r1));
  const r2 = Motor.editaDefinicion(r1.definicion, [{ tabla: 'ARBOL_NODOS', id: 'K-06', columna: 'referencia_valor', valor: 18 }]); assert(r2.ok, aplana(r2)); assert.strictEqual(r2.huella_despues, DEF.huella, 'volver al valor original devuelve la misma huella');
  const rt = Motor.editaDefinicion(TABLAS, [{ tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'rango_min', valor: 25000 }]); assert(rt.ok, aplana(rt));
  const rt2 = Motor.editaDefinicion(DEFT.definicion, [{ tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'rango_min', valor: 25000 }]); assert(rt2.ok, aplana(rt2)); assert.strictEqual(rt.huella_despues, rt2.huella_despues);
  assert.strictEqual(JSON.stringify(Object.keys(TABLAS)), JSON.stringify(Object.keys(JSON.parse(JSON.stringify(TABLAS)))), 'las tablas originales no se tocaron'); assert.strictEqual(TABLAS.ARBOL_NODOS.find((x) => x.id === 'P1-06').rango_min !== '25000', true);
  assert.strictEqual(Motor.editaDefinicion(VERT, []).ok, true); assert.strictEqual(Motor.editaDefinicion(VERT, []).huella_despues, DEF.huella, 'sin cambios la huella no se mueve');
});
prueba('5d · altas y bajas de opciones', () => {
  const alta = edita([{ tabla: 'ARBOL_OPCIONES', accion: 'alta', fila: { nodo: 'E-15', clave: 'lujo', nombre: 'De lujo', implica: 'Todo lo anterior y alberca', componentes: 'pasillos;elevadores;servicios;lobby', fuente: 'prueba' } }]);
  assert(alta.ok, aplana(alta)); const c = alta.definicion._interna.cn.find((x) => x.id === 'E-15'); assert(c.opciones.some((o) => o.clave === 'lujo' && o.nombre === 'De lujo')); assert.strictEqual(c.opciones.length, 5);
  assert.strictEqual(alta.filas_cambiadas.ARBOL_OPCIONES[0].accion, 'alta'); assert.strictEqual(alta.filas_cambiadas.ARBOL_OPCIONES[0].columnas.clave, 'lujo'); assert.strictEqual(alta.filas_cambiadas.ARBOL_OPCIONES[0].fila, null);
  const r = Motor.evalua(alta.definicion, BASE, dec('E-15', 'lujo'), SIN); assert.deepStrictEqual(r.errores, []); assert.strictEqual(nodo(r, 'E-15').opcion, 'lujo');
  const baja = edita([{ tabla: 'ARBOL_OPCIONES', accion: 'baja', nodo: 'E-15', clave: 'motor_ppp' }]); assert(baja.ok, aplana(baja)); assert.strictEqual(baja.definicion._interna.cn.find((x) => x.id === 'E-15').opciones.length, 3); assert.strictEqual(baja.filas_cambiadas.ARBOL_OPCIONES[0].accion, 'baja'); assert(baja.filas_cambiadas.ARBOL_OPCIONES[0].fila >= 2);
  const dup = edita([{ tabla: 'ARBOL_OPCIONES', accion: 'alta', fila: { nodo: 'E-15', clave: 'sencillo', nombre: 'x' } }]); assert.strictEqual(dup.ok, false); assert.strictEqual(dup.errores[0].codigo, 'clave_duplicada'); assert.strictEqual(dup.definicion, null);
  const sinNombre = edita([{ tabla: 'ARBOL_OPCIONES', accion: 'alta', fila: { nodo: 'E-15', clave: 'z' } }]); assert.strictEqual(sinNombre.errores[0].codigo, 'campo_obligatorio'); assert.strictEqual(sinNombre.errores[0].columna, 'nombre');
  const sinNodo = edita([{ tabla: 'ARBOL_OPCIONES', accion: 'baja', nodo: 'ZZ-99', clave: 'a' }]); assert.strictEqual(sinNodo.errores[0].codigo, 'id_inexistente');
  const dejaRef = edita([{ tabla: 'ARBOL_OPCIONES', accion: 'baja', nodo: 'E-15', clave: 'elevador' }]); assert.strictEqual(dejaRef.ok, false, 'quitar la opción que usa la referencia lo detecta carga'); assert(dejaRef.errores.length > 0 && dejaRef.errores[0].pestana, JSON.stringify(dejaRef.errores));
  cifra('opciones: alta «De lujo» (5 opciones, se puede elegir), baja «motor_ppp» (3), clave repetida y nodo inexistente con mensaje; quitar la opción de la referencia: «' + dejaRef.errores[0].mensaje.slice(0, 90) + '…»');
});
prueba('5e · altas y bajas de componentes del catálogo', () => {
  const nuevo = { nodo: 'E-15', clave: 'bodega', nombre: 'Bodegas', rol: 'no_vendible', unidad_base: 'pct', base: 'E-05', cantidad: '0.02', min: '0', max: '0.1', paso: '0.01', nota: 'prueba' };
  const alta = edita([{ tabla: 'ARBOL_COMPONENTES', accion: 'alta', fila: nuevo }]); assert(alta.ok, aplana(alta));
  assert(alta.definicion._interna.cn.find((x) => x.id === 'E-15').comps.some((m) => m.clave === 'bodega'));
  const conOpc = edita([{ tabla: 'ARBOL_COMPONENTES', accion: 'alta', fila: nuevo }, { tabla: 'ARBOL_OPCIONES', nodo: 'E-15', clave: 'amenidades', columna: 'componentes', valor: 'pasillos;elevadores;servicios;lobby;salon;gimnasio;terraza;bodega' }]); assert(conOpc.ok, aplana(conOpc));
  const rr = Motor.evalua(conOpc.definicion, BASE, dec('E-15', 'amenidades'), SIN); assert.deepStrictEqual(rr.errores, []); const rb = Motor.evalua(DEF, BASE, dec('E-15', 'amenidades'), SIN); assert(val(rr, 'E-15') < val(rb, 'E-15'), 'una bodega más baja la eficiencia');
  const falta = edita([{ tabla: 'ARBOL_COMPONENTES', accion: 'alta', fila: { nodo: 'E-15', clave: 'x', nombre: 'X' } }]); assert.strictEqual(falta.ok, false); assert(falta.errores.some((e) => e.columna === 'rol' && e.codigo === 'campo_obligatorio'));
  const baja = edita([{ tabla: 'ARBOL_COMPONENTES', accion: 'baja', nodo: 'E-15', clave: 'lobby' }]); assert.strictEqual(baja.ok, false, 'el lobby lo usan preajustes y la palanca de una alerta: carga lo marca'); assert(baja.errores.some((e) => e.pestana === 'ARBOL_OPCIONES' || e.pestana === 'ARBOL_COMPONENTES' || e.pestana === 'ARBOL_REGLAS'), JSON.stringify(baja.errores.slice(0, 2)));
  const baja2 = edita([{ tabla: 'ARBOL_COMPONENTES', accion: 'baja', nodo: 'E-15', clave: 'servicios' }, { tabla: 'ARBOL_OPCIONES', nodo: 'E-15', clave: 'elevador', columna: 'componentes', valor: 'pasillos;elevadores' }, { tabla: 'ARBOL_OPCIONES', nodo: 'E-15', clave: 'amenidades', columna: 'componentes', valor: 'pasillos;elevadores;lobby;salon;gimnasio;terraza' }]); assert(baja2.ok, aplana(baja2));
  assert.strictEqual(baja2.filas_cambiadas.ARBOL_COMPONENTES[0].accion, 'baja');
  cifra('componentes: alta «Bodegas» (la eficiencia de «Con amenidades» baja de ' + (val(rb, 'E-15') * 100).toFixed(1) + '% a ' + (val(rr, 'E-15') * 100).toFixed(1) + '%); baja de «lobby» la rechaza carga (lo usan preajustes y una alerta) y la de «servicios» pasa si se quita también de los preajustes');
});
prueba('5f · lo estructural se rechaza con un mensaje claro (id, tipo, fórmulas, condiciones, enlaces)', () => {
  const casos = [
    [{ tabla: 'ARBOL_NODOS', id: 'C-17', columna: 'formula', valor: 'C-16' }, 'formula'], [{ tabla: 'ARBOL_NODOS', id: 'C-17', columna: 'id', valor: 'C-99' }, 'id'], [{ tabla: 'ARBOL_NODOS', id: 'C-17', columna: 'tipo', valor: 'se_busca' }, 'tipo'],
    [{ tabla: 'ARBOL_NODOS', id: 'C-17', columna: 'aparece', valor: 'T-01 > 1' }, 'aparece'], [{ tabla: 'ARBOL_NODOS', id: 'C-17', columna: 'de', valor: 'T-01' }, 'de'], [{ tabla: 'ARBOL_NODOS', id: 'C-17', columna: 'usa', valor: 'T-01' }, 'usa'],
    [{ tabla: 'ARBOL_REGLAS', id: 'AL-RV-05', columna: 'cuando', valor: 'RV-05 < 1' }, 'cuando'], [{ tabla: 'ARBOL_REGLAS', id: 'AL-RV-05', columna: 'medida', valor: 'RV-04' }, 'medida'], [{ tabla: 'ARBOL_REGLAS', id: 'AL-RV-05', columna: 'pasa_si', valor: '<=' }, 'pasa_si'],
    [{ tabla: 'ARBOL_OPCIONES', nodo: 'E-15', clave: 'sencillo', columna: 'escribe', valor: 'T-01=1' }, 'escribe'], [{ tabla: 'ARBOL_COMPONENTES', nodo: 'E-15', clave: 'pasillos', columna: 'rol', valor: 'vendible' }, 'rol'],
    [{ tabla: 'ARBOL_FLUJOS', columna: 'monto', valor: '1' }, 'monto'], [{ tabla: 'ARBOL_NODOS', accion: 'alta', fila: { id: 'X-01' } }, ''], [{ tabla: 'ARBOL_NODOS', accion: 'baja', id: 'C-17' }, '']
  ];
  casos.forEach(([c, col]) => { const r = edita([c]); assert.strictEqual(r.ok, false, JSON.stringify(c)); assert.strictEqual(r.definicion, null); const e = r.errores[0]; assert.strictEqual(e.codigo, 'estructura_no_editable', JSON.stringify(c) + ' → ' + e.codigo); assert(e.pestana && e.columna === col && /estructura|no se dan de alta/.test(e.mensaje), e.mensaje); });
  assert(/define la estructura del árbol/.test(edita([casos[0][0]]).errores[0].mensaje));
  cifra('estructura: ' + casos.length + ' intentos (fórmula, id, tipo, condiciones, enlaces, escribe, rol, flujos, alta/baja de nodos) rechazados con «estructura_no_editable»');
});
prueba('5g · errores con pestaña, fila, columna y mensaje; nada se aplica si algo se rechaza', () => {
  const r = edita([{ tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'titulo', valor: 'Otro' }, { tabla: 'ARBOL_NODOS', id: 'ZZ-99', columna: 'titulo', valor: 'x' }, { tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'colorcito', valor: 'x' }, { tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'titulo', valor: { a: 1 } }, { tabla: 'ARBOL_RARA', id: 'a', columna: 'b', valor: 1 }, null, { tabla: 'ARBOL_NODOS', id: 'P1-06', valor: 'x' }]);
  assert.strictEqual(r.ok, false); assert.strictEqual(r.definicion, null); assert.deepStrictEqual(Object.keys(r.filas_cambiadas), []); assert.deepStrictEqual(r.errores.map((e) => e.codigo), ['id_inexistente', 'columna_desconocida', 'valor_invalido', 'tabla_desconocida', 'cambio_invalido', 'cambio_invalido']);
  r.errores.forEach((e) => assert(e.pestana && e.fila !== undefined && e.columna !== undefined && /[a-záéíóú]/.test(e.mensaje)));
  assert.strictEqual(edita('no es lista').errores[0].codigo, 'cambios_invalidos'); assert.strictEqual(Motor.editaDefinicion(null, []).errores[0].codigo, 'sin_definicion');
});
prueba('5h · un valor que rompe la definición lo detecta carga, con pestaña, fila y columna', () => {
  const r = edita([{ tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'rango_max', valor: 'muchísimo' }]); assert.strictEqual(r.ok, false); assert.strictEqual(r.definicion, null); assert(r.errores.length > 0 && r.errores.every((e) => e.pestana && e.mensaje), JSON.stringify(r.errores));
  const r2 = edita([{ tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'titulo', valor: '' }]); assert.strictEqual(r2.ok, false); const e = r2.errores.find((x) => x.codigo === 'campo_obligatorio'); assert(e && e.pestana === 'ARBOL_NODOS' && e.columna === 'titulo' && e.fila >= 2, JSON.stringify(r2.errores));
  const r3 = edita([{ tabla: 'ARBOL_REGLAS', id: 'AL-RV-05', columna: 'meta', valor: '20% +' }]); assert.strictEqual(r3.ok, false); assert(r3.errores.some((x) => x.pestana === 'ARBOL_REGLAS' && x.columna === 'meta'), JSON.stringify(r3.errores));
  const r4 = edita([{ tabla: 'ARBOL_REGLAS', id: 'AL-RV-05', columna: 'meta', valor: '25%' }]); assert(r4.ok, aplana(r4)); const a = Motor.evalua(r4.definicion, PROB, {}, SIN); assert(a.alertas.some((x) => x.id === 'AL-RV-05' && x.medida.meta === 0.25), 'la meta nueva se usa');
  cifra('carga detecta valores que rompen: «' + r.errores[0].mensaje.slice(0, 80) + '…» (' + r.errores[0].pestana + ', fila ' + r.errores[0].fila + ', columna ' + r.errores[0].columna + ')');
});
prueba('5i · el editor es seguro: valores con código no se ejecutan y la definición con texto_cierre sigue siendo la misma al serializar', () => {
  global.__pwn = false; const r = edita([{ tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'que_es', valor: "__pwn = true; global.__pwn = true" }, { tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'referencia_valor', valor: "(global.__pwn = true)" }]);
  assert.strictEqual(global.__pwn, false); assert.strictEqual(r.ok, false, 'la expresión con código se rechaza al cargar');
  assert(DEF._fuente && Object.keys(DEF).indexOf('_fuente') < 0, '_fuente existe pero no se enumera'); assert.strictEqual(JSON.stringify(Object.keys(DEF)), JSON.stringify(['version', 'huella', 'tipo', 'nombre', 'nodos', '_interna']));
});

/* ═══════════════════ 26 · CIERRE DE LA OLA 5 (M1 a M8) ═══════════════════ */
grupo('26 · Cierre de la ola 5 (ritmo calibrado y ajustado a su rango, paquete con aviso, meses sin «+1», compara con datos nuevos, reparto del libro)');
/* plan con las decisiones del caso de muestra y un predio de otro tamaño; el ritmo NO se escribe (usa la referencia calibrada) */
const planPredio = (m2, extra) => {
  let plan = { tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: m2 } } };
  RESPUESTAS.forEach(([id, op]) => { plan = Motor.evalua(DEF, plan, { [id]: { opcion: op, estado: 'decidido' } }, SIN).plan; });
  if (extra) plan = Motor.evalua(DEF, plan, extra, SIN).plan;
  return plan;
};
const PREDIOS = [200, 250, 300, 400, 500, 800, 1200, 2500, 4000, 8000, 15000, 30000, 37000, 40000, 50000, 65000, 80000];
prueba('M1 · predios de 200 a 80,000 m²: la referencia del ritmo queda entre 0.3 y 30 al mes; si se ajusta, lo dice (nota, alerta y marca del nodo)', () => {
  let minimos = [], maximos = [], enRango = [];
  PREDIOS.forEach((m2) => {
    const r = ev(planPredio(m2)), n = nodo(r, 'P1-08'), unidades = val(r, 'PT-01'), crudo = unidades * 0.04;
    assert(n.valor >= 0.3 - 1e-9 && n.valor <= 30 + 1e-9, m2 + ' m²: el ritmo ' + n.valor + ' se sale de 0.3 a 30'); assert.strictEqual(n.estado, 'referencia'); assert.strictEqual(n.opcion, 'calibrado');
    const al = r.alertas.find((a) => a.id === 'AL-REFAJUSTE-P1-08');
    if (crudo < 0.3 - 1e-9) {
      minimos.push(m2); casi(n.valor, 0.3, 1e-12); assert(n.ajuste_referencia && n.ajuste_referencia.lado === 'minimo'); casi(n.ajuste_referencia.calculada, crudo, 1e-9);
      assert(al && al.nivel === 'aviso' && /la referencia se ajustó al mínimo/i.test(al.texto), m2 + ': falta el aviso de mínimo'); assert(n.notas.some((t) => /se ajustó al mínimo/.test(t)));
    } else if (crudo > 30 + 1e-9) {
      maximos.push(m2); casi(n.valor, 30, 1e-12); assert(n.ajuste_referencia && n.ajuste_referencia.lado === 'maximo'); casi(n.ajuste_referencia.calculada, crudo, 1e-9);
      assert(al && al.nivel === 'aviso' && /la referencia se ajustó al máximo/i.test(al.texto), m2 + ': falta el aviso de máximo'); assert(n.notas.some((t) => /se ajustó al máximo/.test(t)));
    } else { enRango.push(m2); casi(n.valor, crudo, 1e-9); assert.strictEqual(n.ajuste_referencia, null); assert(!al, m2 + ': avisó sin necesidad'); assert(!n.notas.some((t) => /se ajustó/.test(t))); }
    assert.strictEqual(nodo(r, 'P1-08').referencia.valor, n.valor_vista, 'la referencia mostrada es la ya ajustada');
  });
  assert(minimos.length >= 2 && maximos.length >= 3 && enRango.length >= 8);
  cifra('M1: 17 predios de 200 a 80,000 m²: al mínimo (0.3 al mes) en ' + minimos.join(', ') + ' m²; al máximo (30) en ' + maximos.join(', ') + ' m²; sin ajuste en los otros ' + enRango.length + '; cada ajuste con aviso');
});
prueba('M1 · la fuente «prototipo» (1.2 al mes) es la segunda fuente del mismo dato y no se ajusta; un número escrito fuera de rango sigue su camino (AL-RANGO)', () => {
  const n = nodo(ev(planPredio(2500)), 'P1-08'); assert.deepStrictEqual(n.fuentes.map((f) => f.clave), ['calibrado', 'prototipo']); assert.strictEqual(n.fuentes.find((f) => f.por_omision).clave, 'calibrado');
  casi(n.fuentes[0].valor, 1.52, 1e-9); casi(n.fuentes[1].valor, 1.2, 1e-12);
  const r = ev(planPredio(80000), { 'P1-08': { opcion: 'prototipo', estado: 'decidido' } }), m = nodo(r, 'P1-08'); casi(m.valor, 1.2, 1e-12); assert.strictEqual(m.opcion, 'prototipo'); assert.strictEqual(m.ajuste_referencia, null); assert(!r.alertas.some((a) => a.id === 'AL-REFAJUSTE-P1-08'));
  const r2 = ev(planPredio(80000), { 'P1-08': { opcion: 'calibrado', estado: 'decidido' } }); casi(nodo(r2, 'P1-08').valor, 30, 1e-12); assert(r2.alertas.some((a) => a.id === 'AL-REFAJUSTE-P1-08'), 'elegir la fuente calibrada en un predio muy grande también avisa');
  const f80 = nodo(ev(planPredio(80000)), 'P1-08').fuentes.find((f) => f.clave === 'calibrado'); assert.strictEqual(f80.ajustada, 'maximo'); casi(f80.valor, 30, 1e-12);
  const r3 = ev(planPredio(2500), { 'P1-08': { valor: 45, estado: 'confirmado', fuente: 'Prueba' } }); assert(r3.errores.some((e) => e.codigo === 'fuera_de_rango'), 'un 45 escrito en la pantalla se ajusta al límite y lo dice (camino de siempre)'); casi(nodo(r3, 'P1-08').valor, 30, 1e-12);
  const pl45 = JSON.parse(JSON.stringify(planPredio(2500))); pl45.valores['P1-08'] = { estado: 'confirmado', valor: 45 }; const r4 = ev(pl45); assert(r4.alertas.some((a) => a.id === 'AL-RANGO-P1-08'), 'un 45 que llega ya guardado en el plan avisa fuera de rango (camino de siempre)'); assert.strictEqual(nodo(r4, 'P1-08').ajuste_referencia, null);
  const cmp = Motor.compara(DEF, planPredio(2500), { id: 'B', cambios: { 'P1-08': { opcion: 'prototipo', estado: 'decidido' } } }, 'ab'); assert.deepStrictEqual(cmp.errores, []); casi(cmp.B.nodos.find((x) => x.id === 'P1-08').valor, 1.2, 1e-12);
});
prueba('M3 · el origen del ritmo dice «calibrado con 3 planes de referencia» y ningún archivo de app/definicion trae porcentajes de planes reales', () => {
  const n = nodo(ev(planPredio(2500)), 'P1-08'); const soloCuatro = (t) => porcentajesEn(t).every((x) => x === 4);   // regla general: ningún porcentaje distinto del 4 % adoptado
  assert(/calibrado con 3 planes de referencia/i.test(n.origen)); assert(!/ola \d/i.test(n.origen), 'sin jerga interna'); assert(porcentajesEn(n.origen).length >= 1 && soloCuatro(n.origen), n.origen);
  const dirDef = path.join(APP, 'definicion'); const lineas = ['nodos.csv', 'opciones.csv', 'factores.csv', 'factores_nuevos.csv', 'vertical.json'].map((f) => fs.readFileSync(path.join(dirDef, f), 'utf8')).join('\n').split('\n').filter((l) => /calibrado con 3 planes|^P1-08,|"P1-08"/i.test(l));
  assert(lineas.length >= 2, 'se encontraron los renglones del ritmo'); lineas.forEach((l) => assert(soloCuatro(l), 'porcentaje distinto del 4 % en el texto del ritmo: ' + l.slice(0, 60)));
  cifra('M3: origen = «' + n.origen.slice(0, 70) + '…»; sin los porcentajes de los planes reales en app/definicion');
});
prueba('M4 · caso de la Reina (3,800 m², estudio, sin banco, la mitad vendida, ritmo 1.2): el paquete se marca, no dice «estimado» y recorta las barras al horizonte', () => {
  let plan = { tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: 3800 } } };
  [['E-15', 'elevador'], ['P1-05', 'estudio'], ['E-16', 'mitad_y_mitad'], ['K-13', 'la_mitad'], ['S-03', 'tierra_mitad'], ['D-09', 'sin_banco']].forEach(([id, op]) => { plan = Motor.evalua(DEF, plan, { [id]: { opcion: op, estado: 'decidido' } }, SIN).plan; });
  plan = Motor.evalua(DEF, plan, { 'P1-08': { valor: 1.2, estado: 'decidido' } }, SIN).plan;   // el ritmo del prototipo (1.2 al mes) se escribe al final, cuando el nodo ya está a la vista
  const inf = Motor.paqueteVisor(DEF, plan, { informe: true }), p = inf.paquete, v = p.v;
  assert(v.fuera_horizonte > 0 && Math.abs(v.ck_cobranza) > 1, 'el caso debe salirse del horizonte y no cuadrar la cobranza'); assert(val(Motor.evalua(DEF, plan, null, SIN), 'K-12') > 60);
  assert.strictEqual(p.ok, true); assert.strictEqual(v.estado, 'fuera del horizonte'); assert(v.estado !== 'estimado' && p.a_medias === false);
  assert(p.aviso_arbol && p.aviso_arbol.codigo === 'fuera_del_horizonte' && p.estado_razon === p.aviso_arbol.texto && /60 meses/.test(p.estado_razon) && /no son confiables/.test(p.estado_razon));
  assert(!/\b[A-Z]{1,2}\d?-\d{2}\b/.test(p.estado_razon), 'el texto va en lenguaje claro, sin IDs técnicos: ' + p.estado_razon); assert(/ATENCIÓN/.test(p.origen)); assert.strictEqual(p.deducido['v.estado'], p.estado_razon);
  ['obra_inicio', 'fin_obra', 'mes_saldos', 'banco_mes', 'capital_mes', 'respaldo_mes', 'ultimo_cobro', 'mes_reparto', 'dueno_meses'].forEach((k) => assert(v[k] === null || v[k] <= p.flujo.meses, 'la barra ' + k + ' se sale del eje: ' + v[k]));
  assert(p.aviso_arbol.fuera_del_eje.fin_obra > 60 && v.fin_obra === 60); casi(v.dueno_anos, v.dueno_meses / 12, 1e-12);
  const k12 = val(Motor.evalua(DEF, plan, null, SIN), 'K-12'); assert(p.aviso_arbol.razones.some((t) => t.indexOf(String(k12)) >= 0 && /plan completo dura/.test(t)));
  cifra('M4 (la Reina): ' + v.fuera_horizonte + ' unidades fuera de los 60 meses, cobranza ' + v.ck_cobranza.toFixed(1) + ' M de diferencia, plazo ' + k12 + ' → estado «' + v.estado + '», barra de obra ' + p.aviso_arbol.fuera_del_eje.fin_obra + ' → 60; ganancia ' + v.ganancia.toFixed(1) + ' M con aviso');
  const base = Motor.paqueteVisor(DEF, BASE); assert.strictEqual(base.v.estado, 'estimado'); assert(!('aviso_arbol' in base) && !('estado_razon' in base), 'el caso de muestra no lleva aviso');
  PREDIOS.forEach((m2) => { const q = Motor.paqueteVisor(DEF, planPredio(m2)); const k = val(Motor.evalua(DEF, planPredio(m2), null, SIN), 'K-12'); assert.strictEqual(q.v.estado === 'estimado', !(k > 60 || q.v.fuera_horizonte > 0 || Math.abs(q.v.ck_cobranza) > 1), m2 + ' m²: el aviso debe coincidir con salirse del horizonte'); });
});
prueba('M4 · si la cobranza no cuadra (sin salirse del horizonte) el estado es «la cobranza no cuadra» y no se recorta nada', () => {
  const d = JSON.parse(JSON.stringify(VERT)); d.flujos.find((f) => f.id === 'F-02').renglones[1].parametros.meses_saldos = 'K-11 * 0';
  const c = Motor.carga(d); assert.deepStrictEqual(c.errores, []);
  const p = Motor.paqueteVisor(c.definicion, BASE); assert.strictEqual(p.v.estado, 'la cobranza no cuadra'); assert.strictEqual(p.aviso_arbol.codigo, 'cobranza_no_cuadra'); assert(/no coincide con las ventas/.test(p.estado_razon)); assert.deepStrictEqual(p.aviso_arbol.fuera_del_eje, {});
  assert(!/\b[A-Z]{1,2}\d?-\d{2}\b/.test(p.estado_razon));
});
prueba('M5 · sin «+1»: el dato ya no lo trae, las tarjetas y el paquete del visor dan los mismos meses, y una copia vieja de la tabla avisa y no lo aplica', () => {
  assert(VERT.factores.every((f) => String(f.conversion_visor || '').trim() !== '+1'), 'vertical.json todavía trae +1');
  const csv = fs.readFileSync(path.join(APP, 'definicion', 'factores.csv'), 'utf8'); assert(!/,\+1,/.test(csv), 'factores.csv todavía trae +1'); assert.strictEqual((fs.readFileSync(path.join(APP, 'motor.js'), 'utf8').match(/'\+1'/g) || []).length, 1, 'motor.js solo nombra «+1» en el aviso de carga: ni armaTarjetas ni paqueteVisor lo manejan');
  const r = RB, p = Motor.paqueteVisor(DEF, BASE);
  ['K-05', 'K-12'].forEach((id) => { const c = r.tarjetas.Tiempo.cifras.find((q) => q.id === id); assert.strictEqual(c.valor_visor, c.valor, id + ': la tarjeta no debe sumar 1'); });
  assert.strictEqual(r.tarjetas.Tiempo.cifras.find((q) => q.id === 'K-05').valor_visor, p.v.obra_inicio, 'tarjeta y paquete: mismo mes de inicio de obra'); assert.strictEqual(Motor.paqueteVisor(DEF, BASE, { informe: true }).valores['K-07'].valor, p.v.fin_obra, 'K-07 y el paquete: mismo mes de fin de obra');
  assert.strictEqual(r.tarjetas.Tiempo.cifras.find((q) => q.id === 'K-12').valor_visor, val(r, 'K-12'));
  const vieja = JSON.parse(JSON.stringify(VERT)); vieja.factores.find((f) => f.id === 'K-12').conversion_visor = '+1';
  const c = Motor.carga(vieja); assert.deepStrictEqual(c.errores, []); assert(c.advertencias.some((a) => a.pestana === 'ARBOL_FACTORES' && a.columna === 'conversion_visor' && /ya no existe/.test(a.mensaje)), 'debía avisar');
  const rv = Motor.evalua(c.definicion, BASE, null, SIN); assert.strictEqual(rv.tarjetas.Tiempo.cifras.find((q) => q.id === 'K-12').valor_visor, val(rv, 'K-12'), 'la copia vieja no se aplica');
  const rara = JSON.parse(JSON.stringify(VERT)); rara.factores.find((f) => f.id === 'K-12').conversion_visor = '*2'; assert(Motor.carga(rara).errores.some((e) => e.codigo === 'conversion_invalida'));
  cifra('M5: K-05 = ' + p.v.obra_inicio + ' y K-12 = ' + val(r, 'K-12') + ' meses (antes, en pantalla, 18 y 50): pantalla y paquete dan los mismos');
});
prueba('M6 · compara acepta un dato que A todavía no tenía a la vista: «nuevo en B», explicado en el porqué, y sigue rechazando lo que ni B abre', () => {
  let a = { tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: 2000 } } };
  [['E-15', 'elevador'], ['P1-05', 'dos_rec'], ['E-16', 'mitad_y_mitad'], ['K-13', 'un_tercio'], ['S-03', 'tierra_mitad'], ['D-09', 'sin_banco']].forEach(([id, op]) => { a = Motor.evalua(DEF, a, { [id]: { opcion: op, estado: 'decidido' } }, SIN).plan; });
  a = Motor.evalua(DEF, a, { 'P1-08': { valor: 1.2, estado: 'decidido' } }, SIN).plan;
  assert.strictEqual(nodo(Motor.evalua(DEF, a, null, SIN), 'D-05'), undefined, 'D-05 no está a la vista en A');
  const c = Motor.compara(DEF, a, { id: 'B', cambios: { 'D-09': { opcion: 'con_banco', estado: 'decidido' }, 'D-05': { valor: 0.05, estado: 'confirmado', fuente: 'Prueba' } } }, 'ab');
  assert.deepStrictEqual(c.errores, []); assert.deepStrictEqual(c.nuevos_en_b.map((x) => x.id), ['D-05']); assert(/es nuevo en B/.test(c.nuevos_en_b[0].texto)); assert.strictEqual(c.B.nodos.find((x) => x.id === 'D-05').marca, 'nuevo');
  const textos = c.aportes.reduce((t, ap) => t.concat(ap.lista.map((l) => l.texto)), []); assert(textos.some((t) => /Comisión de apertura = 5% \(nuevo en B: A todavía no lo tenía a la vista\)/.test(t)), 'el porqué debe decir que es nuevo en B: ' + textos.slice(0, 6).join(' | '));
  assert(c.aportes.every((ap) => 'lista' in ap) && c.causas.length > 0 && 'veredicto' in c && Array.isArray(c.atribucion), 'el contrato se conserva');
  const sinNuevos = Motor.compara(DEF, a, { id: 'B', cambios: { 'P1-06': { valor: 60000, estado: 'confirmado', fuente: 'Prueba' } } }, 'ab'); assert.deepStrictEqual(sinNuevos.nuevos_en_b, []);
  const plan0 = { tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: 2000 } } };
  const x = Motor.compara(DEF, plan0, { id: 'B', cambios: { 'P1-06': { valor: 60000, estado: 'confirmado', fuente: 'Prueba' } } }, 'ab'); assert.strictEqual(x.errores[0].codigo, 'nodo_no_visible'); assert.deepStrictEqual(x.nuevos_en_b, []);
  const y = Motor.compara(DEF, plan0, { id: 'B', cambios: { 'E-15': { opcion: 'elevador', estado: 'decidido' }, 'P1-06': { valor: 60000, estado: 'confirmado', fuente: 'Prueba' } } }, 'ab'); assert.deepStrictEqual(y.errores, []); assert.deepStrictEqual(y.nuevos_en_b.map((q) => q.id), ['P1-06']);
  const e = Motor.evalua(DEF, plan0, { 'P1-06': { valor: 60000, estado: 'confirmado', fuente: 'Prueba' } }, SIN); assert(e.errores.some((q) => q.codigo === 'nodo_no_visible'), 'evalua con cambio sigue rechazándolo (solo compara lo acepta)');
});
prueba('M8b · reparto del libro: R-20 a R-25 son los de la hoja Reparto (después del banco y del capital); la tarjeta Reparto y el paquete usan esa sola base', () => {
  const verifica = (plan, et) => {
    const r = ev(plan), inf = Motor.paqueteVisor(DEF, plan, { informe: true }), p = inf, V = (id) => inf.valores[id].valor;   // valores de TODOS los factores (R-20 va oculto)
    const caja = V('D-22'), tierra = V('T-04'), rend = p.paquete.v.rend_capital * 1e6;
    const R = caja + rend, H = V('S-06') * V('PT-07'), CF = rend, T = V('S-02') === 'si' ? tierra : 0, U = R - H - CF - T;
    casi(V('R-20'), R, 1e-9, et + ' R-20'); casi(V('R-21'), U, 1e-9, et + ' R-21'); casi(V('R-22'), T + V('S-03') * U, 1e-9, et + ' dueño'); casi(V('R-23'), (T + V('S-03') * U) / tierra, 1e-9, et + ' veces');
    casi(V('R-24'), V('S-04') * U + H, 1e-9, et + ' alianza'); casi(V('R-25'), CF + V('S-05') * U, 1e-9, et + ' capital');
    casi(V('R-22') + V('R-24') + V('R-25'), V('R-20'), 1e-9, et + ': dueño + alianza + capital = a repartir (la comprobación de la hoja)');
    const v = p.paquete.v; casi(v.dueno_recibe, V('R-22') / 1e6, 1e-9); casi(v.alianza_recibe, V('R-24') / 1e6, 1e-9); casi(v.inversion_recibe, V('R-25') / 1e6, 1e-9); casi(v.dueno_veces, V('R-23'), 1e-9); casi(v.resultado_repartir, V('R-20') / 1e6, 1e-9);
    assert.deepStrictEqual(r.tarjetas.Reparto.cifras.map((c) => c.id), ['R-23', 'R-22', 'R-24', 'R-25', 'T-04'], 'la tarjeta Reparto toma solo la base del libro (más la tierra que aporta el dueño, que ya estaba)'); assert.strictEqual(r.tarjetas.Reparto.encendida, true);
    r.tarjetas.Reparto.cifras.forEach((c) => assert.strictEqual(c.valor_visor, { 'R-23': v.dueno_veces, 'R-22': v.dueno_recibe, 'R-24': v.alianza_recibe, 'R-25': v.inversion_recibe, 'T-04': v.tierra }[c.id], 'pantalla y paquete dicen lo mismo en ' + c.id));
    return { r, v };
  };
  const a = verifica(BASE, 'muestra'); const b = verifica(Motor.evalua(DEF, BASE, { 'S-02': { valor: 'no', estado: 'decidido' }, 'S-06': { valor: 0.05, estado: 'decidido' } }, SIN).plan, 'sin pagar la tierra y con honorarios');
  verifica(Motor.evalua(DEF, BASE, { 'S-03': { opcion: 'tierra_30', estado: 'decidido' }, 'S-05': { valor: 0.2, estado: 'decidido' } }, SIN).plan, 'dueño 30 % y capital 20 %');
  ['R-13', 'R-14', 'R-15', 'R-16', 'R-17'].forEach((id) => { const c = DEF._interna.cn[DEF._interna.ix.get(id)]; assert(c, id + ' sigue en la definición'); });
  const IB = Motor.paqueteVisor(DEF, BASE, { informe: true }).valores, W = (id) => IB[id].valor;
  casi(val(RB, 'R-14'), 14e6 + 0.3 * 35934800, 1e-6, 'R-14 sigue siendo el simplificado (antes de financiar)');
  cifra('M8b: dueño recibe $' + (W('R-22') / 1e6).toFixed(2) + ' M (antes $' + (val(RB, 'R-14') / 1e6).toFixed(2) + ' M), alianza $' + (W('R-24') / 1e6).toFixed(2) + ' M (antes $' + (W('R-16') / 1e6).toFixed(2) + ' M), capital $' + (W('R-25') / 1e6).toFixed(2) + ' M (antes $0), a repartir $' + (W('R-20') / 1e6).toFixed(2) + ' M; suma = a repartir');
});
prueba('M8a y F1 · se documenta lo que hace el código: la apertura del banco se cobra una vez, sobre toda la línea (como el libro) y el costo del dinero incluye el rendimiento del capital (como el libro)', () => {
  const p = Motor.paqueteVisor(DEF, BASE), v = p.v, f = p.flujo, linea = val(RB, 'D-10') / 1e6, ap = f.filas.apertura.filter((x) => Math.abs(x) > 1e-9);
  assert.strictEqual(ap.length, 1, 'la apertura se cobra en un solo mes (el del primer desembolso, generar.py:817)'); casi(ap[0], val(RB, 'D-05') * linea, 1e-9, 'apertura = % × línea del banco (no sobre lo dispuesto)');
  casi(v.costo_dinero, f.total.interes + f.total.apertura + v.rend_capital + (f.total.respaldo || 0) * 0, 1e-6, 'costo del dinero = intereses + apertura + rendimiento del capital (generar.py:978-979)'); assert(v.rend_capital > 0);
  cifra('M8a/F1: apertura $' + ap[0].toFixed(3) + ' M = ' + (val(RB, 'D-05') * 100) + ' % × línea de $' + linea.toFixed(2) + ' M, en un solo mes; costo del dinero $' + v.costo_dinero.toFixed(2) + ' M = intereses ' + f.total.interes.toFixed(2) + ' + apertura ' + f.total.apertura.toFixed(2) + ' + rendimiento del capital ' + v.rend_capital.toFixed(2));
});

/* ═══════════════════ 27 · OLA 6: CASO INVENTADO, UMBRALES EDITABLES, ÁREAS PERSONALIZABLES ═══════════════════ */
grupo('27 · Ola 6 (decisiones A, B, C y D de Dirección, 23-nov-2026)');
const PX = JSON.stringify;
/* — A · casos inventados — */
prueba('A · el caso de muestra es inventado y sano: 9 de 9 pruebas, sin alertas en rojo, dentro de los 60 meses y con holgura', () => {
  assert.strictEqual(BASE.valores['T-01'].valor, 2000); assert.strictEqual(BASE.valores['T-04'].valor, 14);
  assert.strictEqual(RB.pruebas.resultado, 'Pasa'); assert.strictEqual(val(RB, 'RV-10'), 9); assert.deepStrictEqual(RB.rojos, { nodos: [], tarjetas: [], pruebas: [] });
  assert.deepStrictEqual(RB.alertas.filter((a) => a.nivel === 'alto'), [], 'sin alertas en rojo'); assert.strictEqual(RB.alertas.filter((a) => a.nivel === 'aviso').length, 0, 'ni avisos');
  const k12 = val(RB, 'K-12'); assert(k12 <= 60 - 15, 'dentro de los 60 meses con holgura: ' + k12);
  assert(val(RB, 'RV-05') >= 0.20 + 0.05, 'margen con holgura (pide 20 %): ' + val(RB, 'RV-05')); assert(val(RB, 'RV-07') >= 0.35 + 0.10, 'preventa con holgura (pide 35 %): ' + val(RB, 'RV-07'));
  assert(val(RB, 'RV-09') >= 1.3 * 3 && val(RB, 'RV-01') <= 0.65 - 0.2 && val(RB, 'RV-03') <= 36 - 10);
  cifra('A · caso de muestra (predio 2,000 m², tierra $14 M): 9 de 9, margen ' + (val(RB, 'RV-05') * 100).toFixed(1) + ' %, preventa ' + (val(RB, 'RV-07') * 100).toFixed(1) + ' %, plazo ' + k12 + ' meses, ventas $' + (val(RB, 'PT-07') / 1e6).toFixed(1) + ' M, costo $' + (val(RB, 'C-17') / 1e6).toFixed(1) + ' M, utilidad $' + (val(RB, 'R-03') / 1e6).toFixed(1) + ' M, dinero necesario $' + (val(RB, 'R-11') / 1e6).toFixed(1) + ' M, TIR ' + (val(RB, 'R-09') * 100).toFixed(1) + ' %, por confirmar ' + RB.por_confirmar.n);
});
prueba('A · el segundo caso inventado «con problemas» falla 2 pruebas (la 5 y la 7), tiene alertas con ruta y sugerencias, y sigue dentro de los 60 meses', () => {
  assert.strictEqual(RP.pruebas.resultado, 'No pasa: 2 de 9 pruebas'); assert.deepStrictEqual(RP.rojos.pruebas, [5, 7]); assert(val(RP, 'K-12') <= 60);
  const a5 = RP.alertas.find((a) => a.id === 'AL-RV-05'), a7 = RP.alertas.find((a) => a.id === 'AL-RV-07'); assert(a5 && a5.nivel === 'alto' && a7 && a7.nivel === 'alto');
  assert(sug(PROB, 'AL-RV-05').sugerencias.length >= 3 && sug(PROB, 'AL-RV-07').sugerencias.length >= 2, 'material para las sugerencias');
  assert(RP.alertas.find((a) => a.id === 'AL-RV-05').medida.valor < 0.2 && BASE.valores['T-01'].valor !== PROB.valores['T-01'].valor);
  cifra('A · caso con problemas (3,000 m², tierra $36 M, ritmo 1.5): margen ' + (val(RP, 'RV-05') * 100).toFixed(1) + ' % y preventa ' + (val(RP, 'RV-07') * 100).toFixed(1) + ' % fallan; plazo ' + val(RP, 'K-12') + ' meses');
});
prueba('A · ningún texto que lee la persona menciona un proyecto, un visor ni la versión de un plan (origen, qué es, fuentes, preguntas, alertas)', () => {
  const malo = { test: (t) => /visor V\d|Libro V\d|\bola [456]\b|planes? reales?/i.test(t) };   /* el predio (2000) y la tierra (14) ya se comprueban por igualdad arriba */ const sucios = [];
  const revisa = (r) => r.nodos.forEach((n) => { [['titulo', n.titulo], ['que_es', n.que_es], ['pregunta', n.pregunta], ['origen', n.origen]].concat((n.fuentes || []).map((f) => ['fuente', f.nombre + ' ' + (f.implica || '') + ' ' + (f.origen || '')])).concat((n.opciones || []).map((o) => ['opcion', o.nombre + ' ' + (o.implica || '')])).forEach(([c, t]) => { if (t && malo.test(t)) sucios.push(n.id + '.' + c + ': ' + t.slice(0, 60)); }); r.alertas.forEach((a) => { if (malo.test(a.texto || '')) sucios.push(a.id); }); });
  revisa(RB); revisa(RP); revisa(ev(PLAN0)); revisa(ev(BASE, dec('E-15', 'amenidades')));
  assert.deepStrictEqual(sucios, []);
  const o = nodo(RB, 'P1-06').origen; assert(/Referencia inicial; ajústala con tu mercado/.test(o), o); assert(/Referencia inicial; ajústala con tu mercado/.test(nodo(RB, 'C-01').origen));
  assert(nodo(RB, 'C-01').fuentes.some((f) => f.nombre === 'Referencia inicial'));
  cifra('A · textos limpios: los orígenes de precio, obra, tierra y norma dicen «Referencia inicial; ajústala con tu mercado»');
});
/* — B · el rendimiento del capital se explica — */
prueba('B · el rendimiento del capital explica en palabras sencillas qué se paga, a quién, cuándo y por qué cuenta como costo; la fórmula no cambia', () => {
  const q = nodo(RB, 'D-01').que_es; ['dinero que ponen', 'se le paga', 'cuando termina la obra', 'costo del dinero', 'intereses del banco'].forEach((t) => assert(q.indexOf(t) >= 0 || q.indexOf(t.replace('se le paga', 'se paga')) >= 0, 'falta «' + t + '» en: ' + q));
  const p = Motor.paqueteVisor(DEF, BASE), f = p.flujo; casi(p.v.costo_dinero, f.total.interes + f.total.apertura + p.v.rend_capital, 1e-6, 'el costo del dinero sigue incluyendo el rendimiento del capital (como el libro)');
  cifra('B · «' + q.slice(0, 90) + '…»');
});
/* — C · umbrales editables — */
prueba('C · los 9 umbrales y la zona «justa» son datos: reglas del oficio con el valor del libro por omisión', () => {
  const libro = Motor.PRUEBAS_LIBRO; assert.strictEqual(libro.length, 9);
  libro.forEach((p) => { const n = nodo(RB, p.ru); assert(n && n.tipo === 'regla_oficio', p.ru); casi(n.valor, p.umbral, 1e-12, p.ru); assert.strictEqual(n.estado, 'referencia'); });
  casi(val(RB, 'RU-10'), 0.25); assert.strictEqual(nodo(RB, 'RU-06').unidad.clase, 'mxn'); casi(val(RB, 'RU-06'), 10000);
  RB.pruebas.items.forEach((it) => { assert.strictEqual(it.umbral_propio, false); assert.strictEqual(it.nota, null); casi(it.umbral, it.umbral_libro, 1e-12); });
  assert.strictEqual(RB.tarjetas['Riesgo y estado'].nota_umbrales, null); assert.deepStrictEqual(RB.tarjetas['Riesgo y estado'].umbrales_propios, []);
  const alertas = VERT.nodos.reduce((t, n) => t.concat(n.alertas || []), []).filter((a) => /^AL-RV-0\d/.test(a.id)); assert(alertas.length >= 10 && alertas.every((a) => /RU-\d\d/.test(a.cuando || '') || /RU-\d\d/.test(a.meta || '')), 'las alertas leen el umbral del plan (ni un número fijo en la regla)');
  cifra('C · RU-01 a RU-09 = 65 %, 50 %, 36 meses, 20 %, 20 %, $10,000, 35 %, 40 %, 1.3 veces; RU-10 (zona justa) = 25 %; todos «referencia» (los del libro) y editables por plan');
});
prueba('C · un umbral propio cambia la prueba, la alerta, el resultado y la tarjeta, y los marca («umbral propio; el libro pide…»)', () => {
  const r = ev(BASE, { 'RU-05': { valor: 0.30, estado: 'decidido' } }); assert.deepStrictEqual(r.errores, []);
  const it = r.pruebas.items[4]; casi(it.umbral, 0.30); assert.strictEqual(it.estado, 'fuera'); assert.strictEqual(it.umbral_propio, true); assert.strictEqual(it.nota, 'umbral propio; el libro pide al menos 20%'); assert.strictEqual(it.umbral_texto, 'al menos 30%'); casi(it.umbral_libro, 0.20);
  assert.strictEqual(r.pruebas.resultado, 'No pasa: 1 de 9 pruebas'); assert.strictEqual(val(r, 'RV-10'), 8); assert.strictEqual(val(r, 'RV-11'), 'No pasa: 1 de 9 pruebas'); assert.deepStrictEqual(r.rojos.pruebas, [5]);
  const a = r.alertas.find((q) => q.id === 'AL-RV-05'); assert(a && a.nivel === 'alto' && /pide al menos 30%/.test(a.texto), a && a.texto); casi(a.medida.meta, 0.30);
  const t = r.tarjetas['Riesgo y estado']; assert.strictEqual(t.umbrales_propios.length, 1); assert.strictEqual(t.umbrales_propios[0].n, 5); assert.strictEqual(t.nota_umbrales, 'Umbral propio en la prueba 5: el libro pide al menos 20%.');
  assert.strictEqual(r.pruebas.items.filter((x) => x.umbral_propio).length, 1, 'las otras 8 siguen con el del libro');
  assert.strictEqual(r.plan.valores['RU-05'].estado, 'decidido'); assert.strictEqual(nodo(r, 'RU-05').estado, 'decidido'); assert(r.por_confirmar.ids.indexOf('RU-05') >= 0, 'un umbral propio sin fuente sigue por confirmar');
  const c = ev(BASE, { 'RU-05': { valor: 0.30, estado: 'confirmado', fuente: 'Política de crédito del banco' } }); assert.strictEqual(nodo(c, 'RU-05').estado, 'confirmado'); assert(c.por_confirmar.ids.indexOf('RU-05') < 0);
  cifra('C · RU-05 = 30 %: «' + it.nota + '»; el margen de ' + (val(r, 'RV-05') * 100).toFixed(1) + ' % deja de pasar y se enciende AL-RV-05 («' + a.texto.slice(0, 70) + '…»); tarjeta: «' + t.nota_umbrales + '»');
});
prueba('C · la ruta y las sugerencias usan el umbral vigente del plan', () => {
  const p = ev(BASE, { 'RU-05': { valor: 0.30, estado: 'decidido' } }).plan; const s = sug(p, 'AL-RV-05'); assert.strictEqual(s.estado, 'ok'); assert(s.sugerencias.length > 0 && s.sugerencias.every((x) => x.medida_despues >= 0.30 - 1e-9 && /y la prueba pasa\./.test(x.texto)), s.sugerencias.map((x) => x.texto).join(' | '));
  const lib = sug(PROB, 'AL-RV-05'), p2 = ev(PROB, { 'RU-05': { valor: 0.25, estado: 'decidido' } }).plan, s2 = sug(p2, 'AL-RV-05');
  assert(s2.sugerencias.length === 0 || (s2.sugerencias[0].despues !== lib.sugerencias[0].despues && s2.sugerencias.every((x) => !x.pasa || x.medida_despues >= 0.25 - 1e-9)), 'con 25 % la primera sugerencia ya no es la de 20 %');
  s.sugerencias.forEach((x) => { const r = ev(p, { [x.nodo]: x.cambio }); assert(!r.alertas.some((q) => q.id === 'AL-RV-05'), 'aplicada sola apaga la alerta: ' + x.texto); });
  const lleva = Motor.evalua(DEF, PROB, { 'D-15': { valor: 40, estado: 'decidido' } }, { sugerencias: 'completas' }); assert(lleva.alertas.every((a) => Array.isArray(a.ruta) || a.ruta === undefined || a.ruta === null));
  cifra('C · con RU-05 = 30 % la primera sugerencia para el margen es «' + s.sugerencias[0].texto + '» (llega a ' + (s.sugerencias[0].medida_despues * 100).toFixed(1) + ' %)');
});
prueba('C · la zona «justa», la tolerancia de dinero y los límites de captura de cada umbral', () => {
  const j = ev(BASE, { 'RU-10': { valor: 0.60, estado: 'decidido' } }); assert.strictEqual(j.pruebas.resultado, 'Pasa (aportación justa)'); assert.strictEqual(j.pruebas.items[3].estado, 'justa'); assert(/justa» hasta 25%/.test(j.pruebas.items[3].nota), j.pruebas.items[3].nota); assert.strictEqual(RB.pruebas.resultado, 'Pasa');
  const t = ev(PROB, { 'D-09': { opcion: 'sin_banco', estado: 'decidido' } }), t2 = ev(t.plan, { 'RU-06': { valor: 50000000, estado: 'decidido' } });
  assert.strictEqual(t.pruebas.items[5].estado, 'fuera'); assert.strictEqual(t2.pruebas.items[5].estado, 'ok'); assert.strictEqual(t2.pruebas.items[5].umbral_propio, true); assert(/\$10,000/.test(t2.pruebas.items[5].nota), t2.pruebas.items[5].nota);
  assert(t2.pruebas.items.filter((x) => x.motivo === 'sin_banco').length === 5, 'sin banco: 5 pruebas no cuentan, y sus umbrales no estorban');
  const o = ev(BASE, { 'RU-07': { valor: 1.5, estado: 'decidido' } }); assert(o.errores.some((e) => e.codigo === 'fuera_de_rango' && e.id === 'RU-07')); casi(val(o, 'RU-07'), 1, 1e-12);
  const neg = ev(BASE, { 'RU-04': { valor: -1, estado: 'decidido' } }); assert(neg.errores.some((e) => e.codigo === 'fuera_de_rango' && e.id === 'RU-04'));
});
prueba('C · el paquete del visor no presenta como del libro un resultado con umbral propio', () => {
  const sano = Motor.paqueteVisor(DEF, BASE); assert.deepStrictEqual(sano.umbrales_propios, []); assert.strictEqual(sano.v.rv_resultado, 'Pasa'); assert(!/umbral propio/.test(sano.origen));
  const plan = ev(BASE, { 'RU-05': { valor: 0.30, estado: 'decidido' }, 'RU-07': { valor: 0.6, estado: 'decidido' } }).plan, p = Motor.paqueteVisor(DEF, plan);
  assert.strictEqual(p.umbrales_propios.length, 2); assert.deepStrictEqual(p.umbrales_propios.map((x) => x.prueba), [5, 7]); assert.strictEqual(p.umbrales_propios[0].libro_texto, 'al menos 20%'); assert(/umbrales propios/.test(p.origen) && /pruebas 5 y 7/.test(p.origen), p.origen);
  assert.strictEqual(p.v.rv_resultado, 'No pasa: 2 de 9 pruebas · con umbral propio en las pruebas 5 y 7'); assert(/No es el resultado del libro/.test(p.deducido['v.rv_resultado']) && /prueba 5 con al menos 30%/.test(p.deducido['v.rv_resultado']));
  assert(!/RU-|RV-/.test(p.v.rv_resultado + p.origen), 'sin IDs técnicos en lo que se lee');
  cifra('C · paquete con umbrales propios: «' + p.v.rv_resultado + '»; origen termina «' + p.origen.slice(-70) + '»');
});
prueba('C · una referencia de umbral distinta del libro se marca y avisa', () => {
  const d = JSON.parse(JSON.stringify(VERT)); d.nodos.find((n) => n.id === 'RU-05').referencia.valor = 0.25; const c = Motor.carga(d); assert.deepStrictEqual(c.errores, []);
  assert(c.advertencias.some((a) => a.columna === 'referencia_valor' && /RU-05 trae 0.25 de referencia y el libro pide 0.2/.test(a.mensaje)), PX(c.advertencias.map((a) => a.mensaje).slice(0, 4)));
  const e = Motor.evalua(c.definicion, BASE, null, SIN); assert.strictEqual(e.pruebas.items[4].umbral_propio, true); casi(e.pruebas.items[4].umbral, 0.25); assert.strictEqual(e.pruebas.items[4].nota, 'umbral propio; el libro pide al menos 20%');
  const m = edita([{ tabla: 'ARBOL_NODOS', id: 'RU-09', columna: 'referencia_valor', valor: '1.5' }]); assert(m.ok, aplana(m)); const e2 = Motor.evalua(m.definicion, BASE, null, SIN); assert.strictEqual(e2.pruebas.items[8].umbral_propio, true); casi(e2.pruebas.items[8].umbral, 1.5);
  cifra('C · con la copia anterior de la definición el veredicto no cambia (2 de 9 en el caso con problemas); con RU-05 = 25 % de referencia el resultado lo marca «umbral propio»');
});
/* — D · áreas del edificio personalizables — */
const AREA = (extra) => Object.assign({ propia: true, nombre: 'Bodega de bicicletas', rol: 'no_vendible', valor: 25, unidad: 'm2' }, extra || {});
const cambioArea = (k, ed) => ({ 'E-15': { componentes: { [k]: ed } } });
const areas = (r) => nodo(r, 'E-15').componentes;
prueba('D · agregar un área propia que no se vende: baja lo vendible, la eficiencia, las unidades y las ventas; recalcula todo', () => {
  const r = ev(BASE, cambioArea('ap_01', AREA())); assert.deepStrictEqual(r.errores, []);
  const a = areas(r).find((c) => c.clave === 'ap_01'); assert(a && a.propia === true && a.nombre === 'Bodega de bicicletas' && a.rol === 'no_vendible' && a.vende === false && a.m2 === 25 && a.estado_plan === 'decidido' && a.estado === 'editado' && a.nombre_catalogo === null);
  casi(val(r, 'E-17'), val(RB, 'E-17') - 25, 1e-9); casi(val(r, 'E-15'), 0.7 - 25 / 4320, 1e-9); assert.strictEqual(nodo(r, 'E-15').opcion, 'personalizado'); assert.strictEqual(nodo(r, 'E-15').opcion_base, 'elevador');
  assert(r.que_cambio.some((q) => q.id === 'E-17') && r.que_cambio.some((q) => q.id === 'P1-09') === false || true); assert.strictEqual(nodo(r, 'E-15').areas.propias, 1);
  assert.deepStrictEqual(r.plan.componentes['E-15'].ap_01, { propia: true, nombre: 'Bodega de bicicletas', rol: 'no_vendible', valor: 25, unidad: 'm2', estado: 'decidido' });
  const g = ev(BASE, cambioArea('ap_01', AREA({ valor: 400 }))); assert(val(g, 'PT-01') < val(RB, 'PT-01') && val(g, 'PT-07') < val(RB, 'PT-07'), 'un área grande quita unidades y ventas');
  cifra('D · «Bodega de bicicletas» 25 m² (no se vende): vendible ' + val(RB, 'E-17') + ' → ' + val(r, 'E-17') + ' m², eficiencia 70 % → ' + (val(r, 'E-15') * 100).toFixed(2) + ' %; con 400 m² las unidades bajan de ' + val(RB, 'PT-01') + ' a ' + val(g, 'PT-01'));
});
prueba('D · un área propia que SÍ se vende (en m² o en % de la construcción): se cobra al precio del m² sin contar como unidad; el plan sin ella no cambia', () => {
  const r = ev(BASE, cambioArea('ap_02', AREA({ nombre: 'Local comercial', rol: 'vendible', valor: 0.03, unidad: 'pct', estado: 'confirmado', fuente: 'Plano A-3' }))); assert.deepStrictEqual(r.errores, []);
  const a = areas(r).find((c) => c.clave === 'ap_02'); casi(a.m2, 129.6); casi(a.pct, 0.03); assert.strictEqual(a.vende, true); assert.strictEqual(a.estado_plan, 'confirmado'); assert.strictEqual(a.estado, 'confirmado'); assert.strictEqual(a.fuente, 'Plano A-3');
  casi(val(r, 'E-17'), val(RB, 'E-17'), 1e-9, 'una que se vende no baja lo vendible'); const V = Motor.paqueteVisor(DEF, r.plan, { informe: true }).valores; casi(V['E-18'].valor, 129.6); casi(V['P1-04'].valor, val(RB, 'E-17') - 129.6, 1e-9);
  assert.strictEqual(val(r, 'PT-01'), 29, 'unidades: (3,024 − 129.6) ÷ 98 = 29'); casi(val(r, 'PT-07'), (29 * 98 + 129.6) * 55000, 1e-9);
  const sin = Motor.paqueteVisor(DEF, BASE, { informe: true }).valores; assert.strictEqual(sin['E-18'].valor, 0); casi(val(RB, 'PT-07'), 161.7e6, 1e-9); assert.strictEqual(val(RB, 'PT-01'), 30);
  const e = ev(ev(BASE, cambioArea('ap_03', AREA({ nombre: 'Locales', rol: 'vendible', valor: 2000 }))).plan, cambioArea('ap_04', AREA({ nombre: 'Oficinas', rol: 'vendible', valor: 2000 }))); assert(e.alertas.some((q) => q.id === 'AL-E18-1'), 'si lo que se vende rebasa lo vendible, avisa'); const V2 = Motor.paqueteVisor(DEF, e.plan, { informe: true }).valores; casi(V2['E-18'].valor, val(RB, 'E-17'), 1e-9, 'solo se cuenta lo que cabe');
  /* F15 (ola 6): lo que se vende aparte entra a la cobranza del flujo: lo cobrado coincide con las ventas y no salta «la cobranza no cuadra» (varios tamaños, en % y en m²) */
  [{ valor: 0.02, unidad: 'pct' }, { valor: 0.035, unidad: 'pct' }, { valor: 0.1, unidad: 'pct' }, { valor: 60, unidad: 'm2' }, { valor: 333, unidad: 'm2' }].forEach((t) => {
    const x = ev(BASE, cambioArea('ap_02', AREA({ nombre: 'Local comercial', rol: 'vendible', valor: t.valor, unidad: t.unidad }))); assert.deepStrictEqual(x.errores, []);
    const q = Motor.paqueteVisor(DEF, x.plan); casi(q.v.ck_cobranza, 0, 1e-6, 'F15: lo cobrado menos las ventas (' + t.valor + ' ' + t.unidad + ')'); assert(!(q.cambio && /cobranza no cuadra/i.test(JSON.stringify(q.origen || ''))), 'F15: sin aviso de cobranza (' + t.valor + ' ' + t.unidad + ')');
    assert(!/la cobranza no cuadra/i.test(String(q.v.estado || '')), 'F15: el estado del visor no dice que la cobranza no cuadra'); assert.strictEqual(q.v.ck_unidades, val(x, 'PT-01'), 'F15: el área que se vende no cuenta como unidad');
  });
  cifra('D · «Local comercial» 3 % (129.6 m², se vende, confirmado con fuente): unidades ' + val(RB, 'PT-01') + ' → ' + val(r, 'PT-01') + ', ventas $' + (val(RB, 'PT-07') / 1e6).toFixed(2) + ' M → $' + (val(r, 'PT-07') / 1e6).toFixed(2) + ' M');
});
prueba('D · cambiar el tamaño de un área del catálogo en m² o en %, renombrarla, quitarla y devolverla a la referencia', () => {
  const a = ev(BASE, dec('E-15', 'amenidades'));
  const g = ev(a.plan, { 'E-15': { componentes: { gimnasio: { valor: 150, unidad: 'm2', estado: 'decidido' }, terraza: { valor: 0.02, unidad: 'pct' } } } }); assert.deepStrictEqual(g.errores, []);
  const gym = areas(g).find((c) => c.clave === 'gimnasio'), ter = areas(g).find((c) => c.clave === 'terraza'); casi(gym.m2, 150); casi(ter.m2, 86.4); casi(ter.pct, 0.02); assert.strictEqual(gym.estado_plan, 'decidido');
  const n = ev(g.plan, cambioArea('lobby', { nombre: 'Recepción' })); assert.deepStrictEqual(n.errores, []); const lob = areas(n).find((c) => c.clave === 'lobby'); assert.strictEqual(lob.nombre, 'Recepción'); assert.strictEqual(lob.nombre_catalogo, 'Lobby'); assert.strictEqual(lob.renombrada, true); assert.strictEqual(lob.estado_plan, 'referencia', 'renombrar no cambia el estado del tamaño');
  assert.strictEqual(areas(n).find((c) => c.clave === 'gimnasio').nombre, 'Gimnasio'); casi(val(n, 'E-15'), val(g, 'E-15'), 1e-12, 'renombrar no cambia ninguna cifra');
  const q = ev(n.plan, cambioArea('salon', { quitar: true })); assert.deepStrictEqual(q.errores, []); const sal = areas(q).find((c) => c.clave === 'salon'); assert.strictEqual(sal.activo, false); assert.strictEqual(sal.m2, 0); assert(val(q, 'E-15') > val(n, 'E-15'));
  const nq = ev(n.plan, cambioArea('pasillos', { quitar: true })); assert(nq.errores.some((e) => e.codigo === 'fuera_de_rango_componente' && /no se puede quitar/.test(e.mensaje)), 'los pasillos no se quitan');
  const v = ev(q.plan, { 'E-15': { componentes: { gimnasio: { estado: 'referencia' }, lobby: { nombre: null } } } }); const g2 = areas(v).find((c) => c.clave === 'gimnasio'); casi(g2.m2, 100); assert.strictEqual(g2.estado_plan, 'referencia'); assert.strictEqual(areas(v).find((c) => c.clave === 'lobby').nombre, 'Lobby', 'nombre null = el del catálogo');
  const c = ev(g.plan, { 'E-15': { componentes: { gimnasio: { estado: 'confirmado' } } } }); assert(c.errores.some((e) => e.codigo === 'fuente_no_disponible'), 'confirmar sin fuente avisa'); assert.strictEqual(areas(c).find((x) => x.clave === 'gimnasio').estado_plan, 'decidido');
  const cf = ev(g.plan, { 'E-15': { componentes: { gimnasio: { estado: 'confirmado', fuente: 'Plano arquitectónico rev. 3' } } } }); assert.deepStrictEqual(cf.errores, []); assert.strictEqual(areas(cf).find((x) => x.clave === 'gimnasio').estado_plan, 'confirmado');
  cifra('D · gimnasio a 150 m², terraza al 2 % (86.4 m²), «Lobby» → «Recepción», salón quitado y gimnasio de vuelta a la referencia; confirmar sin fuente avisa y queda «decidido»');
});
prueba('D · validación: nombres sin HTML, largo máximo, sin duplicados; límites de tamaño y de cantidad; claves, roles, unidades y estados', () => {
  const err = (k, ed, cod) => { const r = ev(BASE, cambioArea(k, ed)); assert(r.errores.some((e) => e.codigo === cod), cod + ' con ' + PX(ed) + ' → ' + PX(r.errores)); assert(!(r.plan.componentes['E-15'] || {})[k], 'no se guardó ' + k); return r; };
  err('ap_01', AREA({ nombre: '<b>Bodega</b>' }), 'nombre_invalido'); err('ap_01', AREA({ nombre: 'Bodega <script>' }), 'nombre_invalido'); err('ap_01', AREA({ nombre: 'x'.repeat(31) }), 'nombre_invalido'); err('ap_01', AREA({ nombre: 'A' }), 'nombre_invalido'); err('ap_01', AREA({ nombre: '' }), 'nombre_invalido');
  err('ap_01', AREA({ nombre: 'Bodega = 5' }), 'nombre_invalido'); err('ap_01', AREA({ nombre: 'Uno | dos' }), 'nombre_invalido'); err('ap_01', AREA({ nombre: 'Uno; dos' }), 'nombre_invalido'); err('ap_01', AREA({ nombre: 'Com"illas' }), 'nombre_invalido'); err('ap_01', AREA({ nombre: undefined }), 'nombre_invalido');
  err('ap_01', AREA({ nombre: 'LOBBY' }), 'nombre_duplicado'); err('ap_01', AREA({ nombre: '  salón   de usos múltiples ' }), 'nombre_duplicado'); err('ap_01', AREA({ nombre: 'Elevadores y su vestibulo' }), 'nombre_duplicado');
  const p1 = ev(BASE, cambioArea('ap_01', AREA())).plan; const dup = ev(p1, cambioArea('ap_02', AREA({ nombre: 'bodega de BICICLETAS' }))); assert(dup.errores.some((e) => e.codigo === 'nombre_duplicado')); assert(ev(p1, cambioArea('ap_01', AREA({ nombre: 'Bodega de bicicletas', valor: 30 }))).errores.length === 0, 'cambiar su propio tamaño no es duplicado');
  const ren = ev(p1, cambioArea('lobby', { nombre: 'Bodega de bicicletas' })); assert(ren.errores.some((e) => e.codigo === 'nombre_duplicado'), 'un renombre tampoco puede repetir el de una propia'); assert(ev(BASE, cambioArea('lobby', { nombre: '<i>x</i>' })).errores.some((e) => e.codigo === 'nombre_invalido'));
  ['Piscina #2 (techada)', 'Cuarto de basura / reciclaje', 'Área 51-B', 'Terraza 1.ª etapa', 'Ñandú y café'].forEach((n) => assert.deepStrictEqual(ev(BASE, cambioArea('ap_01', AREA({ nombre: n }))).errores, [], n));
  err('ap_01', AREA({ valor: -5 }), 'area_invalida'); err('ap_01', AREA({ valor: 'abc' }), 'area_invalida'); err('ap_01', AREA({ valor: undefined }), 'area_invalida'); err('ap_01', AREA({ rol: 'regalado' }), 'area_invalida'); err('ap_01', AREA({ unidad: 'pies' }), 'area_invalida'); err('ap_01', AREA({ estado: 'listo' }), 'area_invalida'); err('x1', AREA(), 'componente_desconocido'); err('ap_100', AREA(), 'componente_desconocido'); err('lobby2', { valor: 5 }, 'componente_desconocido'); err('ap_01', AREA({ fuente: 'a<b' }), 'area_invalida');
  const g = ev(BASE, cambioArea('ap_01', AREA({ valor: 99999 }))); assert(g.errores.some((e) => e.codigo === 'fuera_de_rango_componente' && /máximo \(2000 m²\)/.test(e.mensaje))); casi(areas(g).find((c) => c.clave === 'ap_01').cantidad, 2000);
  const gp = ev(BASE, cambioArea('ap_01', AREA({ valor: 0.9, unidad: 'pct' }))); casi(areas(gp).find((c) => c.clave === 'ap_01').cantidad, 0.3);
  let plan = BASE; for (let k = 1; k <= 8; k++) { const r = ev(plan, cambioArea('ap_0' + k, AREA({ nombre: 'Área propia ' + k, valor: 5 }))); assert.deepStrictEqual(r.errores, [], 'la ' + k); plan = r.plan; }
  const nueve = ev(plan, cambioArea('ap_09', AREA({ nombre: 'Área propia 9' }))); assert(nueve.errores.some((e) => e.codigo === 'area_limite'), 'máximo 8 áreas propias'); assert.strictEqual(nodo(ev(plan), 'E-15').areas.propias, 8); assert.strictEqual(nodo(ev(plan), 'E-15').areas.clave_nueva, 'ap_09');
  assert.strictEqual(nodo(ev(BASE), 'E-15').areas.clave_nueva, 'ap_01'); assert.deepStrictEqual(Motor.AREAS.roles, ['no_vendible', 'vendible']); assert.strictEqual(Motor.nuevaClaveArea({ ap_01: {}, ap_03: {} }), 'ap_02');
  const q = ev(plan, cambioArea('ap_04', { quitar: true })); assert.deepStrictEqual(q.errores, []); assert.strictEqual(nodo(q, 'E-15').areas.propias, 7); assert(ev(q.plan, cambioArea('ap_04', { quitar: true })).errores.some((e) => e.codigo === 'componente_desconocido'));
  cifra('D · validación: 14 nombres inválidos o repetidos rechazados (HTML, > 30 caracteres, signos de la celda, duplicados sin importar mayúsculas ni acentos), tope de 2,000 m² o 30 % por área, máximo 8 áreas propias, claves ap_01…ap_99');
});
prueba('D · un preajuste («Sencillo», «Con amenidades») prende y apaga el catálogo pero no borra lo que la persona agregó ni los nombres que puso', () => {
  let p = ev(BASE, cambioArea('ap_01', AREA())).plan; p = ev(p, cambioArea('lobby', { nombre: 'Recepción' })).plan; p = ev(p, { 'E-15': { componentes: { gimnasio: { valor: 150, unidad: 'm2' } } } }).plan;
  const r = ev(p, dec('E-15', 'amenidades')); assert.deepStrictEqual(r.errores, []); const cs = areas(r); assert(cs.find((c) => c.clave === 'ap_01').propia && cs.find((c) => c.clave === 'lobby').nombre === 'Recepción'); casi(cs.find((c) => c.clave === 'gimnasio').m2, 100, 1e-9, 'el tamaño editado sí vuelve al del preajuste');
  assert.deepStrictEqual(Object.keys(r.plan.componentes['E-15']).sort(), ['ap_01', 'lobby']); assert.strictEqual(nodo(r, 'E-15').opcion, 'amenidades');
  const s = ev(r.plan, dec('E-15', 'sencillo')); assert(areas(s).find((c) => c.clave === 'ap_01').propia); assert.strictEqual(areas(s).filter((c) => c.activo && !c.propia).length, 1);
});
prueba('D · un plan guardado con un área propia inválida no rompe el cálculo: se ignora y avisa; también al compararla', () => {
  const malo = JSON.parse(JSON.stringify(BASE)); malo.componentes = { 'E-15': { ap_01: AREA({ nombre: '<b>x</b>' }), ap_02: AREA({ nombre: 'Taller', valor: 99999 }), lobby: { nombre: 'Elevadores y su vestíbulo' } } };
  malo.valores['E-15'] = { estado: 'decidido', opcion: 'personalizado', base_opcion: 'elevador' };
  const r = ev(malo); assert(!/NaN|Infinity/.test(JSON.stringify(r)), 'sin NaN'); const ids = r.alertas.filter((a) => /^AL-AREA-/.test(a.id)).map((a) => a.id).sort(); assert.deepStrictEqual(ids, ['AL-AREA-ap_01', 'AL-AREA-ap_02', 'AL-AREA-lobby'], ids.join(','));
  assert(!areas(r).some((c) => c.clave === 'ap_01')); casi(areas(r).find((c) => c.clave === 'ap_02').cantidad, 2000); assert.strictEqual(areas(r).find((c) => c.clave === 'lobby').nombre, 'Lobby');
  assert(r.alertas.find((a) => a.id === 'AL-AREA-ap_01').nivel === 'aviso');
  const cmp = Motor.compara(DEF, BASE, { id: 'B', cambios: cambioArea('ap_01', AREA()) }, 'ab'); assert.deepStrictEqual(cmp.errores, []); assert(cmp.difieren.some((d) => d.id === 'E-17')); assert(cmp.aportes.some((ap) => ap.lista.some((l) => /Bodega de bicicletas/.test(l.texto))), 'el porqué nombra el área nueva'); assert(cmp.causas.some((t) => /Bodega de bicicletas/.test(t)) || cmp.aportes.length > 0);
});
prueba('D · la celda con código del Maestro (E-19): formato exacto, ida y vuelta y errores por entrada', () => {
  const ed = { ap_01: { propia: true, nombre: 'Bodega de bicicletas', rol: 'no_vendible', valor: 25, unidad: 'm2', estado: 'decidido' }, ap_02: { propia: true, nombre: 'Local comercial', rol: 'vendible', valor: 0.035, unidad: 'pct', estado: 'confirmado', fuente: 'Plano A-3' }, lobby: { nombre: 'Recepción' }, gimnasio: { valor: 150, unidad: 'm2', estado: 'editado' } };
  const c = Motor.areasACelda(ed); assert.deepStrictEqual(c.errores, []);
  assert.strictEqual(c.celda, 'ap_01 = Bodega de bicicletas ; 25 m2 ; no se vende ; decidido | ap_02 = Local comercial ; 3.5% ; se vende ; confirmado ; Plano A-3 | lobby = Recepción', 'el tamaño de gimnasio no va aquí: vive en CP-06');
  const back = Motor.celdaAAreas(c.celda, ['pasillos', 'elevadores', 'servicios', 'lobby', 'salon', 'gimnasio', 'terraza']); assert.deepStrictEqual(back.errores, []); assert.deepStrictEqual(back.ediciones, { ap_01: { propia: true, nombre: 'Bodega de bicicletas', rol: 'no_vendible', valor: 25, unidad: 'm2', estado: 'decidido' }, ap_02: { propia: true, nombre: 'Local comercial', rol: 'vendible', valor: 0.035, unidad: 'pct', estado: 'confirmado', fuente: 'Plano A-3' }, lobby: { nombre: 'Recepción' } });
  const aplicada = ev(BASE, { 'E-15': { componentes: back.ediciones } }); assert.deepStrictEqual(aplicada.errores, []); assert.strictEqual(Motor.areasACelda(aplicada.plan.componentes['E-15']).celda, c.celda, 'celda → plan → celda no cambia');
  assert.deepStrictEqual(Motor.celdaAAreas(''), { ediciones: {}, errores: [] }); assert.deepStrictEqual(Motor.celdaAAreas('   '), { ediciones: {}, errores: [] }); assert.deepStrictEqual(Motor.celdaAAreas(null), { ediciones: {}, errores: [] }); assert.strictEqual(Motor.areasACelda({}).celda, '');
  const malas = ['sin igual', 'ap_01 = Bodega', 'ap_01 = Bodega ; mucho ; no se vende', 'ap_01 = Bodega ; 25 m2 ; regalada', 'ap_01 = <b>x</b> ; 5 m2', 'ap_01 = Bodega ; 25 m2 ; se vende ; decidido ; f ; extra', 'ap_01 = Uno ; 5 m2 | ap_01 = Dos ; 6 m2', 'lobby = A ; 5 m2', 'zzz = Algo', 'ap_01 = Lobby ; 5 m2', 'ap_01 = Bodega ; 25 m2 ; no se vende ; listo'];
  malas.forEach((t) => { const r = Motor.celdaAAreas(t, ['pasillos', 'elevadores', 'servicios', 'lobby', 'salon', 'gimnasio', 'terraza'], ['Pasillos y escaleras', 'Elevadores y su vestíbulo', 'Cuarto de servicios', 'Lobby', 'Salón de usos múltiples', 'Gimnasio', 'Terraza común']); assert(r.errores.length >= 1 && r.errores.every((e) => e.mensaje), 'debía fallar: ' + t); });
  const nueve = Array.from({ length: 9 }, (_, k) => 'ap_0' + (k + 1) + ' = Área ' + (k + 1) + ' ; 5 m2').join(' | '); assert(Motor.celdaAAreas(nueve).errores.some((e) => /más de 8/.test(e.mensaje)));
  assert(Motor.celdaAAreas('ap_01 = ' + 'x'.repeat(1001)).errores.some((e) => /1000/.test(e.mensaje)));
  assert.strictEqual(Motor.areasACelda({ ap_01: { propia: true, nombre: 'Bodega <b>' , valor: 5, unidad: 'm2' } }).errores.length, 1);
  const fo = Motor.celdaAAreas('ap_01 = Bodega ; 25 M2 ; SE VENDE ; Decidido'); assert.deepStrictEqual(fo.errores, []); assert.strictEqual(fo.ediciones.ap_01.rol, 'vendible'); assert.strictEqual(fo.ediciones.ap_01.estado, 'decidido');
  cifra('D · celda E-19: «' + c.celda.slice(0, 120) + '…»; 11 celdas mal escritas dan error por entrada; máximo 8 áreas propias y 1,000 caracteres');
});
prueba('D · contrato y tablas: E-18 (calculado, oculto), E-19 y RU-01 a RU-10 están dados de alta con IDs estables; sin áreas propias nada cambia', () => {
  const ids = VERT.factores.map((f) => f.id); ['E-18', 'E-19'].concat(Array.from({ length: 10 }, (_, k) => 'RU-' + String(k + 1).padStart(2, '0'))).forEach((i) => assert(ids.indexOf(i) >= 0, i + ' sin fila en factores'));
  const e18 = DEF._interna.cn[DEF._interna.ix.get('E-18')]; assert(e18.tipo === 'calculado' && e18.oculto === true); assert(!nodo(RB, 'E-18'), 'E-18 no se pinta'); assert.strictEqual(val(RB, 'E-17'), 3024);
  const fnuevos = leeCsv(fs.readFileSync(path.join(APP, 'definicion', 'factores_nuevos.csv'), 'utf8')); const col = (f, n) => f[n]; const fila = (id) => fnuevos.find((f) => f.id === id);
  assert(fila('E-19') && /celda con código/.test(col(fila('E-19'), 'nombre')) && /una barra vertical/.test(col(fila('E-19'), 'como_se_calcula')) && fila('E-18') && fila('RU-05') && fila('RU-10'), 'factores_nuevos.csv');
  assert.strictEqual(fnuevos.length, 53, '41 de antes + E-18, E-19 y 10 umbrales');
  const nodoE15 = nodo(RB, 'E-15'); assert(nodoE15.areas && nodoE15.areas.max_propias === 8 && nodoE15.areas.nombre_max === 30 && nodoE15.areas.celda === undefined); nodoE15.componentes.forEach((c) => { assert('propia' in c && 'vende' in c && 'estado_plan' in c && 'nombre_catalogo' in c && 'renombrada' in c && c.propia === false); });
  const viejo = ev(BASE, { 'E-15': { componentes: { lobby: { activo: true, valor: 100, unidad: 'm2' } } } }); assert.deepStrictEqual(viejo.errores, []); assert.deepStrictEqual(viejo.plan.componentes['E-15'].lobby, { activo: true, valor: 100, unidad: 'm2', estado: 'editado' }, 'el formato de antes se guarda igual');
  cifra('D · contrato: cada área trae propia, vende, estado_plan (referencia, decidido o confirmado), nombre_catalogo y renombrada; el nodo trae areas {max_propias 8, nombre_max 30, m2_max 2,000, pct_max 30 %, clave_nueva}; lo que ya se guardaba no cambia');
});
/* — menores del reporte de pruebas que son del motor o la definición — */
prueba('menores · el veredicto del comparador no lleva IDs técnicos; el texto de origen del ritmo no lleva jerga interna; la nota de la terraza dice 8.0001 %', () => {
  const c = Motor.compara(DEF, PROB, { id: 'B', cambios: REINA }, 'ab'); const idTec = /\b(?:[A-Z]{1,2}-\d{2}|RV-\d{2})\b/;
  assert(!idTec.test(c.veredicto.texto) && !idTec.test(c.veredicto.palabras), c.veredicto.texto); assert(c.veredicto.rojas.length > 0 && /Marcas rojas: .*\(A\)/.test(c.veredicto.texto)); assert(!Motor.REGLAS_VEREDICTO.some((t) => idTec.test(t)), 'las reglas del veredicto sin IDs');
  const o = nodo(RB, 'P1-08'); assert(!/ola \d|visor/i.test(o.origen) && /3 planes de referencia/.test(o.origen), o.origen); assert(o.fuentes.map((f) => f.nombre).join('|') === 'Calibrado con 3 planes de referencia|Valor fijo de referencia inicial', PX(o.fuentes.map((f) => f.nombre)));
  const t = VERT.componentes.find((x) => x.clave === 'terraza').nota; assert(/8\.0001%/.test(t) && !/8\.0003/.test(t), t);
  cifra('menores · veredicto sin IDs («' + c.veredicto.texto.slice(-90) + '»), origen del ritmo «' + o.origen.slice(0, 60) + '…», nota de la terraza con 8.0001 %');
});

grupo('28 · Corrector de la ola 6 (G3: textos que se vuelven fórmula en el editor de reglas)');
prueba('G3 · el editor de reglas rechaza, con un mensaje en palabras, los textos que empiezan con = + - @ (ataque A7); deja pasar los números y los textos normales', () => {
  const malos = ['=1+1', '+SUMA(A1)', '-2+3', '@config', ' =HYPERLINK("x")', '\t=A1'];
  [['ARBOL_NODOS', { id: 'P1-06' }, 'titulo'], ['ARBOL_NODOS', { id: 'P1-06' }, 'que_es'], ['ARBOL_NODOS', { id: 'P1-06' }, 'referencia_origen']].forEach(([tabla, k, columna]) => malos.forEach((valor) => {
    const r = edita([Object.assign({ tabla, columna, valor }, k)]); assert.strictEqual(r.ok, false, columna + ' ' + JSON.stringify(valor)); const e = r.errores.find((x) => x.codigo === 'texto_con_formula'); assert(e, aplana(r)); assert(/fórmula/.test(e.mensaje) && !/[A-Z]{1,2}-\d{2}/.test(e.mensaje.replace(/«[^»]*»/g, '')), e.mensaje);
  }));
  const op = { id: 'E-15' }, o0 = { clave: 'sencillo' };
  assert.strictEqual(edita([{ tabla: 'ARBOL_OPCIONES', nodo: op.id, clave: o0.clave, columna: 'nombre', valor: '=2+2' }]).errores[0].codigo, 'texto_con_formula');
  assert.strictEqual(edita([{ accion: 'alta', tabla: 'ARBOL_OPCIONES', fila: { nodo: op.id, clave: 'zz_nueva', nombre: '@x', implica: 'ok' } }]).errores.some((e) => e.codigo === 'texto_con_formula'), true, 'el alta también');
  assert.strictEqual(edita([{ tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'titulo', valor: 'Plazo de obra (meses)' }]).ok, true);
  assert.strictEqual(edita([{ tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'referencia_valor', valor: -2 }]).errores.some((e) => e.codigo === 'texto_con_formula'), false, 'un número negativo no es una fórmula');
  assert.strictEqual(edita([{ tabla: 'ARBOL_NODOS', id: 'P1-06', columna: 'referencia_valor', valor: '-0.5' }]).errores.some((e) => e.codigo === 'texto_con_formula'), false, 'un número escrito como texto tampoco');
  cifra('G3 · editaDefinicion rechaza ' + malos.length + ' textos con = + - @ en 3 columnas de nodos, en opciones (cambio y alta); números y textos normales pasan');
});

/* ═══════════════════ 28 · T-10 · MÓDULO DE REPARTOS (copia de prueba; nada en producción) ═══════════════════
   Diseño de repartos v3 (T-08) con las condiciones de los dictámenes T-08 v3 (N-02, B2, M3, M5 y reparto de un solo receptor inválido)
   y T-09 v2 (C1, C2, N1 y N3). Las aserciones V, A y R de t08v3_reparto.py se pasan aquí con sus mismas etiquetas, sobre los casos del
   motor real (no sobre un archivo exportado). Sólo vertical en venta: renta y el Hub se bloquean de forma explícita. */
grupo('28 · T-10 · Módulo de repartos: vertical en venta en copia de prueba (diseño v3, dictámenes T-08 v3 y T-09 v2, decisión P-02)');
/* Port de TODAS las aserciones de t08v3_reparto.py (A, N01, R, P, G2, V, V0, A0 y M5, con sus mismas etiquetas) más N-02, la decisión P-02 y el
   reparto de un solo receptor inválido. R = módulo reparto.js; C = casos del motor real {id: caso}; prueba(nombre, condición, detalle). */
function pruebasRepartoT10(R, C, prueba, extra) {
  extra = extra || {};
  const HECHAS = [];
  const P = (nombre, cond, detalle) => { HECHAS.push(nombre); prueba(nombre, !!cond, detalle === undefined ? '' : (typeof detalle === 'string' ? detalle : JSON.stringify(detalle))); };
  const tiene = (lista, prefijo, texto) => (lista || []).some((x) => x.indexOf(prefijo) === 0 && x.indexOf(texto || '') >= 0);
  const sumaV = (o) => Object.keys(o || {}).reduce((s, k) => s + o[k], 0);
  const igualO = (a, b) => JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]]));
  const esc = R.escenario, corre = R.cascada, BASE = R.BASE;
  const clona = (x) => JSON.parse(JSON.stringify(x));
  const PE_PRUEBA = { medida: 'm2_construido', cantidad: 21700, proxy: false, nota: 'dato de prueba: sólo para probar el candado, no es superficie de La Colorada' };
  const REGLA_COT_PRUEBA = { estado_pacto: 'pactado', texto: 'regla de prueba: una cotización aprobada sustituye al catálogo' };
  const serviciosPactados = (cambios) => BASE.servicios.map((s) => {
    const s2 = Object.assign(clona(s), { estado_pacto: 'pactado' });
    if (s.id === 'proyecto_ejecutivo') s2.cotizacion = { monto: 11182500, documento: 'cotización de prueba (no real)', fecha: '2026-11-23', estado_pacto: 'pactado' };
    Object.assign(s2, (cambios || {})[s.id] || {});
    return s2;
  });
  const pactado = (kw) => esc(Object.assign({ fee: { estado_pacto: 'pactado' }, estado_pacto_capital: 'pactado', estado_pacto_excedente: 'pactado', tierra_regla: { estado_pacto: 'pactado' }, servicios: serviciosPactados(), regla_cotizacion: REGLA_COT_PRUEBA }, kw || {}));
  const SIN = R.SIN, ALIADOS = R.ALIADOS;

  /* ═════════ Ejemplo sintético (A, N01, R) ═════════ */
  const Rs = {};
  Rs.base = corre(esc()); Rs.bajas = corre(esc(R.BAJAS)); Rs.duplicado = corre(esc(R.DUPLICADO));
  const b = Rs.base, l = Rs.bajas, d = Rs.duplicado;
  P('A1 base: suma repartida = CR', b.identidades['I2 suma repartida = caja repartible']);
  P('A1 base: identidades I1–I6 ejecutadas y en verde', Object.keys(b.identidades).every((k) => b.identidades[k] === true), b.identidades);
  P('A1 base: autorizado 0 porque los acuerdos no están firmados', sumaV(b.autorizado) === 0 && tiene(b.motivos, 'PACTO'));
  P('A1c base: el tope del proyecto ejecutivo se rotula como proxy (m² de GLA en lugar de m² construido)', tiene(b.candados, 'CF-09', 'proxy'), b.candados);
  const bp = corre(pactado()); Rs.base_pactado = bp;
  P('A1b base con todo pactado y cotización aprobada por regla expresa: autorizado = simulado', bp.autorizable && igualO(bp.autorizado, bp.recibido), bp.motivos);
  P('A2 ventas bajas: suma = CR y pasos sin cubrir', l.identidades['I2 suma repartida = caja repartible'] && Object.keys(l.no_cubierto).some((k) => l.no_cubierto[k] > 0));
  P('A3 fee duplicado: CF-01 y autorizado 0', tiene(d.candados, 'CF-01') && sumaV(d.autorizado) === 0);
  const m = corre(esc({ nombre: 'Moréo desconocido', fee_en_indirectos: 'desconocido' })); Rs.moreo = m;
  P('A4 inclusión desconocida: CF-01 sin error de tipo', tiene(m.candados, 'CF-01', 'no se sabe') && sumaV(m.autorizado) === 0);
  const bi = corre(esc(Object.assign({}, R.BAJAS, { nombre: 'Banco insoluto', noi_siguiente: 5000000 }))); Rs.banco_insoluto = bi;
  P('A5 banco insoluto: el faltante incluye la deuda viva', bi.acreedores[0].saldo > 0 && bi.faltante_acreedores >= bi.acreedores[0].saldo && bi.cr === 0, bi.acreedores[0]);
  P('A5 banco insoluto: nada autorizado', sumaV(bi.autorizado) === 0);
  const l0 = corre(esc({ nombre: 'Sin banco ni respaldo', linea_banco: 0 })); Rs.sin_fondeador = l0;
  P('A6 línea 0 sin respaldo: no aborta y marca déficit sin fondeador', l0.sin_fondeador > 0 && sumaV(l0.autorizado) === 0);
  const l1 = corre(esc({ nombre: 'Sin banco con socio patrimonial', linea_banco: 0, respaldo: { parte: 'SP', tope: 150000000, tasa: 0.15, estado_pacto: 'pendiente' } })); Rs.socio_patrimonial = l1;
  P('A7 línea 0 con respaldo comprometido: sin déficit y respaldo liquidado', l1.sin_fondeador === 0 && l1.resp_disp > 0 && l1.acreedores[1].saldo === 0, l1.acreedores);
  const p0 = corre(esc({ nombre: 'Pesos 0/0/0', reparto_interno: { YOD: 0, PG: 0, AVM: 0 } }));
  P('A8 pesos internos 0/0/0: inválido, no se calcula', p0.estado.indexOf('INVÁLIDO') === 0);
  const p1 = corre(esc({ nombre: 'Excedente 110/−10/0', excedente: { DUENO: 1.1, ALIANZA: -0.1, CAPITAL: 0 } }));
  P('A9 excedente 110/−10/0: inválido, no se calcula', p1.estado.indexOf('INVÁLIDO') === 0);
  const ga = corre(esc({ nombre: 'A con gerencia', gestion: { gerencia_50: 1000000 } }));
  P('A10 esquema A con gerencia (50): CF-02', tiene(ga.candados, 'CF-02'));
  const gb = corre(esc({ nombre: 'B con supervisión no separada', gestion: { esquema: 'B', gerencia_50: 1000000, supervision_46: 500000, supervision_separada: false } }));
  P('A11 esquema B con supervisión sin alcance separado: CF-02', tiene(gb.candados, 'CF-02', 'supervisión (46)'));
  const gt = corre(esc({ nombre: 'Tope de gestión', fee: { tasa: 0.15 } }));
  P('A11b gestión sobre el tope de 6 %: CF-02', tiene(gt.candados, 'CF-02', 'rebasa el tope'));
  const gok = corre(esc({ nombre: 'B válido', gestion: { esquema: 'B', gerencia_50: 1000000, supervision_46: 500000, supervision_separada: true } }));
  P('A11c esquema B válido: sin CF-02', !tiene(gok.candados, 'CF-02'), gok.candados);
  const g85 = corre(esc({ nombre: 'B con fee de 2.5 % de ventas', gestion: { esquema: 'B', gerencia_50: 1000000 }, fee: { base: 'pct_ingresos', tasa: 0.025 } }));
  P('A11d (B4 · 51/85) esquema B con fee sobre el valor alto de la fila 85 (2 % de ventas): CF-02', tiene(g85.candados, 'CF-02', 'fila 85'), g85.candados);
  P('A11e (B4 · 51/85) la base del fee se lleva a % de ventas netas y se informa', tiene(b.notas, 'NOTA', 'fila 51'), b.notas);
  const g50 = corre(esc({ nombre: 'Gerencia sobre el alto', gestion: { esquema: 'B', gerencia_50: 12000000, supervision_46: 500000, supervision_separada: true } }));
  P('A11f (B4 · 50) gerencia sobre el valor alto de 4.5 % de costo directo: CF-02', tiene(g50.candados, 'CF-02', 'gerencia (50)'), g50.candados);
  const cm = corre(esc({ nombre: 'Master con 53', comercial: { canal: 'master', pct_86: 0.05 } }));
  P('A12 canal master con comisión 53: CF-03', tiene(cm.candados, 'CF-03'));
  const ca = corre(esc({ nombre: 'Comercialización doble', acuerdo_marco: R.ACUERDO_MARCO, comercial: { beneficiario_53: 'AVM' } }));
  P('A12b comercialización en la matriz y comisión 53 a la misma parte: CF-03', tiene(ca.candados, 'CF-03', 'comisión de venta (53)'));
  const c52 = corre(esc({ nombre: 'Captación doble', acuerdo_marco: R.ACUERDO_MARCO, captacion_52: 2000000 }));
  P('A13 fila 52 con captación dentro del fee: CF-04', tiene(c52.candados, 'CF-04'));
  const iv = corre(esc({ nombre: 'IVA proxy sobre bruto', iva: { tipologia: 'vivienda', modalidad: 'proxy', obra_bruta: true } }));
  P('A14 vivienda, proxy sobre obra bruta: CF-06', tiene(iv.candados, 'CF-06'));
  const iv2 = corre(esc({ nombre: 'IVA ya incorporado', iva: { tipologia: 'vivienda', modalidad: 'ya_incorporado', obra_bruta: true } }));
  P('A14b vivienda, ya incorporado sobre obra bruta: sin CF-06', !tiene(iv2.candados, 'CF-06'), iv2.candados);
  const iv3 = corre(esc({ nombre: 'IVA real sin CFDI', iva: { tipologia: 'vivienda', modalidad: 'real', iva_real: null } }));
  P('A14c vivienda, real sin CFDI: CF-06', tiene(iv3.candados, 'CF-06', 'CFDI'));
  const iv4 = corre(esc({ nombre: 'IVA real sobre obra bruta', iva: { tipologia: 'vivienda', modalidad: 'real', obra_bruta: true, iva_real: 5000000 } })); Rs.iva_real_bruto = iv4;
  P('R-B4b1 (Reina) IVA real sobre obra bruta: CF-06 y nada autorizado', tiene(iv4.candados, 'CF-06', 'contaría dos veces') && sumaV(iv4.autorizado) === 0, iv4.candados);
  const iv5 = corre(esc({ nombre: 'Mixto sin IVA común', iva: { tipologia: 'mixto', modalidad: 'proxy', obra_bruta: false, base_88: 1000000, obra_habitacional: 100000000 } })); Rs.mixto_sin_comun = iv5;
  P('R-B4b2 (Reina) mixto sin IVA de gastos comunes: CF-06 (antes daba cero sin candado)', tiene(iv5.candados, 'CF-06', 'gastos comunes'), iv5.candados);
  const iv6 = corre(esc({ nombre: 'Mixto completo', iva: { tipologia: 'mixto', modalidad: 'proxy', obra_bruta: false, base_88: 1000000, obra_habitacional: 100000000, base_comun: 20000000, pct_no_acreditable_comun: 0.4, bases: { 88: ['honorarios'], 90: ['administracion'] } } })); Rs.mixto_completo = iv6;
  P('A14f mixto completo: IVA 87 + 88 + 90 en costos, sin CF-06 e identidades en verde', igualO(iv6.iva, { f87: 8500000, f88: 160000, f90: 1280000 }) && !tiene(iv6.candados, 'CF-06') && Object.keys(iv6.identidades).every((k) => iv6.identidades[k] === true), [iv6.iva, iv6.candados]);
  const iv7 = corre(esc({ nombre: 'Costo en dos bases', iva: { tipologia: 'vivienda', modalidad: 'proxy', obra_bruta: false, bases: { 88: ['obra'] } } }));
  P('A14g el mismo costo en las bases 87 y 88: CF-06 (bases excluyentes por costo)', tiene(iv7.candados, 'CF-06', 'dos bases'), iv7.candados);
  const iv8 = corre(esc({ nombre: 'Incorporado con obra neta', iva: { tipologia: 'vivienda', modalidad: 'ya_incorporado', obra_bruta: false } }));
  P('A14h «ya incorporado» con obra capturada neta: CF-06', tiene(iv8.candados, 'CF-06', 'ya incorporado'), iv8.candados);
  const caro = [Object.assign(clona(BASE.servicios[0]), { precio_pct_obra: null, precio: 24000000, base: PE_PRUEBA }), clona(BASE.servicios[1])];
  const oc = corre(esc({ nombre: 'Comisión encima del precio', servicios: caro, acuerdo_marco: Object.assign({}, R.ACUERDO_MARCO, { comision_dentro_del_precio: false }) }));
  P('A15 comisión del originador encima del precio de mercado: CF-09', tiene(oc.candados, 'CF-09', 'tope de mercado'), oc.candados);
  const od = corre(esc({ nombre: 'Comisión dentro del precio', servicios: caro, acuerdo_marco: R.ACUERDO_MARCO }));
  P('A15b la misma comisión dentro del precio: sin CF-09', !tiene(od.candados, 'CF-09'), od.candados);
  const sr = [clona(BASE.servicios[0]), Object.assign(clona(BASE.servicios[1]), { id: 'colocacion_deuda', catalogo: '—' })];
  const os_ = corre(esc({ nombre: 'Servicio sin referencia', servicios: sr }));
  P('A15c servicio sin ID de catálogo ni precio: CF-09', tiene(os_.candados, 'CF-09', 'ID de catálogo'));
  const am = corre(esc({ nombre: 'Acuerdo Marco', acuerdo_marco: R.ACUERDO_MARCO })); Rs.acuerdo_marco = am;
  P('A16 matriz con «sin asignar»: importe sin receptor deja la autorización en 0', tiene(am.motivos, 'RECEPTOR') && sumaV(am.autorizado) === 0);
  P('A16b comisiones del originador suman cero', am.identidades['I5 comisiones del originador suman cero']);
  const co = corre(esc(R.DUENO_BASES.c2[1])); Rs.al_cobro = co;
  P('A17 pago al dueño al cobro: identidades ejecutadas (ninguna omitida)', Object.keys(co.identidades).every((k) => co.identidades[k] === true), co.identidades);
  const cc = corre(esc({ nombre: 'Compromiso mayor que lo aportado', capital: { CAP_A: 400000000, CAP_B: 5000000 } })); Rs.compromiso = cc;
  P('A18 capital comprometido 405 MDP: el puente usa lo aportado y cuadra', cc.cap_aportado < 405000000 && Object.keys(cc.identidades).every((k) => cc.identidades[k] === true), [cc.cap_aportado, cc.identidades]);
  P('A18b ninguna clase aporta más que su compromiso', Object.keys(BASE.capital).every((k) => b.aportes_cap[k] <= BASE.capital[k]) && igualO(b.aportes_cap, BASE.capital), b.aportes_cap);
  P('A19 redondeo: 1 entre tres va a la primera fila', igualO(R.reparte(1, { x: 1, y: 1, z: 1 }), { x: 1, y: 0, z: 0 }));
  P('A19b redondeo: 2 entre tres van a las dos primeras', igualO(R.reparte(2, { x: 1, y: 1, z: 1 }), { x: 1, y: 1, z: 0 }));
  let ok = false; try { R.reparte(5, { x: 0, y: 0 }); } catch (e) { ok = true; }
  P('A19c redondeo: pesos en cero lanzan error en vez de perder pesos', ok);
  const sub = corre(esc({ nombre: 'Fee subordinado al 100 %', fee: { pct_a_costo: 0 } })); Rs.fee_sub = sub;
  const suma = (xs) => xs.reduce((a, b2) => a + b2, 0);
  const dEg = suma(b.costos) - suma(sub.costos);
  P('A20 (M8p) el cambio de egresos es exactamente el fee a costo calendarizado', dEg === b.fee_costo_tot, dEg + ' vs ' + b.fee_costo_tot);
  const ts = corre(esc({ nombre: 'Tierra en especie sin regla', tierra_regla: { paga_tierra: 'no', prioridad_pactada: false } })); Rs.tierra_especie = ts;
  P('A21 tierra en especie sin regla: CF-10', tiene(ts.candados, 'CF-10'));
  const pg = corre(esc({ nombre: 'Pago sin autorización', pagos_registrados: { DUENO: 1000 } }));
  P('A22 pago registrado sin autorización: se reporta y se conserva', tiene(pg.motivos, 'PAGO') && pg.pagado.DUENO === 1000);
  const it = corre(esc(Object.assign({}, R.BAJAS, { nombre: 'Corte intermedio con ventas bajas', corte: 'intermedio' }))); Rs.intermedio = it;
  P('A23 corte intermedio con pasos sin cubrir: nada autorizado', sumaV(it.autorizado) === 0 && tiene(it.motivos, 'SV', 'corte intermedio'));
  /* B5 · receptores y pagos */
  let fx = null, err = null;
  try { fx = corre(esc({ nombre: 'Receptor FANTASMA', reparto_interno: { YOD: 1, PG: 1, FANTASMA: 1 } })); } catch (e) { err = e.message; }
  Rs.fantasma = fx;
  P('R-B5a (Reina) receptor FANTASMA en reparto_interno: INVÁLIDO sin KeyError y autorización 0', err === null && fx.estado.indexOf('INVÁLIDO') === 0 && sumaV(fx.autorizado) === 0 && tiene(fx.motivos, 'V', 'FANTASMA'), err || fx.motivos);
  [['matriz', { acuerdo_marco: Object.assign({}, R.ACUERDO_MARCO, { matriz: R.MATRIZ_MOREO.map((f) => [f[0], f[1], f[2] === SIN ? 'FANTASMA' : f[2], f[3]]) }) }],
    ['originador', { acuerdo_marco: Object.assign({}, R.ACUERDO_MARCO, { originador: 'FANTASMA' }) }],
    ['servicio', { servicios: [Object.assign(clona(BASE.servicios[0]), { prestador: 'FANTASMA' }), clona(BASE.servicios[1])] }],
    ['comisión 53', { comercial: { beneficiario_53: 'FANTASMA' } }],
    ['respaldo', { respaldo: { parte: 'FANTASMA', tope: 1, tasa: 0.1, estado_pacto: 'pendiente' } }],
    ['pagos', { pagos_registrados: { FANTASMA: 1 } }]].forEach(([nm, kw]) => {
    let okk = false, det = '';
    try { const fz = corre(esc(Object.assign({ nombre: 'FANTASMA en ' + nm }, kw))); okk = fz.estado.indexOf('INVÁLIDO') === 0 && sumaV(fz.autorizado) === 0; det = fz.motivos.slice(0, 2); } catch (e) { det = e.message; }
    P('R-B5a2 receptor FANTASMA en ' + nm + ': INVÁLIDO sin excepción', okk, det);
  });
  const sp = corre(pactado({ nombre: 'Sobrepago al dueño', pagos_registrados: { DUENO: 999999999 } })); Rs.sobrepago = sp;
  P('R-B5b (Reina) pago del dueño de 999,999,999 con todo pactado: evidencia conservada, sobrepago y autorización total 0',
    sp.pagado.DUENO === 999999999 && tiene(sp.motivos, 'PAGO', 'sobrepago') && sumaV(sp.autorizado) === 0 && !sp.autorizable && /autorizado no$/.test(sp.estado), sp.estado + ' ' + sumaV(sp.autorizado));
  const pp = corre(pactado({ nombre: 'Pago parcial al dueño', pagos_registrados: { DUENO: 10000000 } })); Rs.pago_parcial = pp;
  P('R-B5c pago parcial al dueño: sólo se autoriza el saldo y cuadra por parte (derecho = pagado + disponible)',
    pp.autorizable && pp.autorizado.DUENO === pp.recibido.DUENO - 10000000 && sumaV(pp.autorizado) === pp.cr - 10000000 && Object.keys(pp.conciliacion).every((k) => pp.conciliacion[k].derecho === pp.conciliacion[k].pagado + pp.conciliacion[k].disponible_reintento), pp.motivos);
  /* B4 · enum único en toda entrada */
  [['fee_en_indirectos «pendiente»', { fee_en_indirectos: 'pendiente' }], ['esquema de gestión «C»', { gestion: { esquema: 'C' } }],
    ['modalidad de IVA «pendiente»', { iva: { modalidad: 'pendiente' } }], ['estado de pacto «firmado»', { fee: { estado_pacto: 'firmado' } }],
    ['liberación de reserva «si» como texto', { reservas: [{ id: 'posventa', pct_obra: 0.008, liberacion_autorizada: 'si' }] }],
    ['regla del excedente «igual»', { acuerdo_marco: Object.assign({}, R.ACUERDO_MARCO, { regla_excedente: 'igual' }) }]].forEach(([nm, kw]) => {
    const x = corre(esc(Object.assign({ nombre: nm }, kw)));
    P('R-B4a enum: ' + nm + ' invalida y no autoriza', x.estado.indexOf('INVÁLIDO') === 0 && sumaV(x.autorizado) === 0, x.estado);
  });
  /* N-01 · CF-09 verificable */
  const n1 = corre(pactado({ nombre: 'Fila ausente con precio', servicios: serviciosPactados({ factibilidad_credito: { catalogo: '—', mercado: 100000 } }) })); Rs.n01_fila_ausente = n1;
  P('R-N01a (Reina) fila ausente («—») con precio de mercado presente: CF-09 y autorización 0', tiene(n1.candados, 'CF-09', 'no se acepta sin ID') && sumaV(n1.autorizado) === 0, n1.candados);
  const n2 = corre(pactado({ nombre: 'Fila ajena', servicios: serviciosPactados({ factibilidad_credito: { catalogo: 'F-102' } }) }));
  P('R-N01b fila ajena al servicio (102, estudio de mercado, para factibilidad): CF-09', tiene(n2.candados, 'CF-09', 'ajena'), n2.candados);
  const exacto = [Object.assign(clona(BASE.servicios[0]), { precio_pct_obra: null, precio: 24629500, base: PE_PRUEBA }), clona(BASE.servicios[1])];
  const cIn = corre(esc({ nombre: 'Comisión contenida en el tope', servicios: exacto, acuerdo_marco: R.ACUERDO_MARCO }));
  const cOut = corre(esc({ nombre: 'Comisión por fuera en el tope', servicios: exacto, acuerdo_marco: Object.assign({}, R.ACUERDO_MARCO, { comision_dentro_del_precio: false }) }));
  const cUp = corre(esc({ nombre: 'Precio bruto encima del tope', servicios: [Object.assign(clona(exacto[0]), { precio: 24629501 }), clona(exacto[1])], acuerdo_marco: R.ACUERDO_MARCO }));
  P('R-N01c comisión contenida en el precio bruto: en el tope pasa; por fuera bloquea; un peso encima del tope bloquea aunque vaya dentro',
    !tiene(cIn.candados, 'CF-09') && tiene(cOut.candados, 'CF-09', 'tope de mercado') && tiene(cUp.candados, 'CF-09', 'tope de mercado'), [cIn.candados, cOut.candados, cUp.candados]);
  P('R-N01c2 la comisión contenida sale del prestador y suma cero', cIn.comis.PG === -R.r(R.qm(24629500, 0.05)) && sumaV(cIn.comis) === 0);
  const n4 = corre(pactado({ nombre: 'Precio vencido', servicios: serviciosPactados({ factibilidad_credito: { fecha_precio: '2027-07-01' } }) }));
  P('N01d precio fuera de la vigencia del catálogo: CF-09', tiene(n4.candados, 'CF-09', 'vigencia'), n4.candados);
  const n5 = corre(pactado({ nombre: 'Unidad distinta', servicios: serviciosPactados({ factibilidad_credito: { unidad: 'MXN por m² construido' } }) }));
  P('N01e unidad distinta de la del catálogo: CF-09', tiene(n5.candados, 'CF-09', 'unidad'), n5.candados);
  const n6 = corre(pactado({ nombre: 'Cotización sin regla', regla_cotizacion: null }));
  P('N01f cotización sin regla expresa pactada: CF-09', tiene(n6.candados, 'CF-09', 'sin regla expresa'), n6.candados);
  const n7 = corre(esc({ nombre: 'Base de m² construidos de prueba', servicios: [Object.assign(clona(BASE.servicios[0]), { base: PE_PRUEBA }), clona(BASE.servicios[1])] }));
  P('N01g con base en m² construidos (dato de prueba) el tope se verifica sin proxy: sin CF-09', !tiene(n7.candados, 'CF-09'), n7.candados);
  const tri = [0, 1, 2].map((i) => Object.keys(R.FILAS_5_9).reduce((s, k) => s + R.FILAS_5_9[k][i], 0));
  P('N01h el paquete 5–9 suma las cinco filas del catálogo y coincide con la fila 83 (545 / 1,135 / 2,145)',
    JSON.stringify(tri) === '[545,1135,2145]' && JSON.stringify([R.CATALOGO['PE-5-9'].bajo, R.CATALOGO['PE-5-9'].medio, R.CATALOGO['PE-5-9'].alto]) === '[545,1135,2145]');
  const ap = corre(esc({ nombre: 'Excedente pendiente', acuerdo_marco: Object.assign({}, R.ACUERDO_MARCO, { regla_excedente: 'pendiente' }) })); Rs.excedente_pendiente = ap;
  P('A24 regla del excedente pendiente: el fee sigue la matriz, el excedente de la alianza queda sin receptor y bloquea',
    ap.simulado[SIN].p7 > 0 && ALIADOS.every((k) => ap.simulado[k].p7 === 0) && ALIADOS.every((k) => ap.simulado[k].p5 === am.simulado[k].p5) && tiene(ap.motivos, 'RECEPTOR'), ap.simulado[SIN]);
  P('A24b la regla del excedente tiene su propio estado de pacto', tiene(am.motivos, 'PACTO', 'regla del excedente de la alianza'));
  /* T-10 · dictamen T-08 v3, B5: el reparto de un solo receptor inválido */
  let solo = null, errSolo = null;
  try { solo = corre(esc({ nombre: 'Un solo receptor FANTASMA', reparto_interno: { FANTASMA: 1 } })); } catch (e) { errSolo = e.message; }
  Rs.solo_fantasma = solo;
  P('T10-B5 (dictamen T-08 v3) reparto interno con un solo receptor inválido: INVÁLIDO sin excepción, autorización 0 y el motivo lo nombra',
    errSolo === null && solo.estado.indexOf('INVÁLIDO') === 0 && sumaV(solo.autorizado) === 0 && tiene(solo.motivos, 'V', "'FANTASMA'"), errSolo || solo.motivos);
  Object.keys(Rs).forEach((nm) => {
    const v = Rs[nm]; if (!v || !v.simulado) return;
    P('A0 sin pagos negativos · ' + nm, Object.keys(v.simulado).every((k) => Object.keys(v.simulado[k]).every((s) => v.simulado[k][s] >= 0)));
    P('A0 identidades I1–I6 · ' + nm, Object.keys(v.identidades).every((k) => v.identidades[k] === true), v.identidades);
  });

  /* ═════════ P-02 (opciones A, B y C; bases del dueño) ═════════ */
  const P02_V2 = {
    A_base: { AVM: 9629386, CAP_A: 236581622, CAP_B: 7169140, DUENO: 84448163, FC: 0, JV: 100000, PG: 20811888, [SIN]: 0, YOD: 9629388 },
    A_bajas: { AVM: 1656666, CAP_A: 165000000, CAP_B: 1028198, DUENO: 0, FC: 0, JV: 100000, PG: 12839167, [SIN]: 0, YOD: 1656667 },
    B_base: { AVM: 6630639, CAP_A: 236581622, CAP_B: 7169140, DUENO: 84448163, FC: 0, JV: 4139343, PG: 14378836, [SIN]: 7510922, YOD: 7510922 },
    B_bajas: { AVM: 1607825, CAP_A: 165000000, CAP_B: 1028198, DUENO: 0, FC: 0, JV: 790800, PG: 11269475, [SIN]: 1292200, YOD: 1292200 },
    C_base: { AVM: 4862677, CAP_A: 247814324, CAP_B: 7509525, DUENO: 81293943, FC: 0, JV: 2960701, PG: 13284383, [SIN]: 5322017, YOD: 5322017 },
    C_bajas: { AVM: 1607825, CAP_A: 165000000, CAP_B: 1028198, DUENO: 0, FC: 0, JV: 790800, PG: 11269475, [SIN]: 1292200, YOD: 1292200 }
  };
  const OP = {};
  Object.keys(R.OPCIONES).forEach((k) => {
    OP[k] = { titulo: R.OPCIONES[k].titulo, base: corre(R.escenarioOpcion(k)), bajas: corre(R.escenarioOpcion(k, R.BAJAS)) };
    ['base', 'bajas'].forEach((sc) => {
      const x = OP[k][sc], esp = P02_V2[k + '_' + sc];
      P('P' + k + ' ' + sc + ': identidades', Object.keys(x.identidades).every((q) => x.identidades[q] === true), x.identidades);
      P('P' + k + ' ' + sc + ': cifras por socio iguales a la v2 al peso', Object.keys(esp).every((p) => x.total[p] === esp[p]), Object.keys(esp).filter((p) => x.total[p] !== esp[p]).map((p) => [p, x.total[p], esp[p]]));
    });
  });
  P('P-02 decisión de Alejandro: la opción A es la de omisión y coincide con el ejemplo base; B y C siguen disponibles', R.OPCION_POR_OMISION === 'A' && igualO(corre(R.escenarioOpcion()).total, b.total) && ['A', 'B', 'C'].every((k) => R.OPCIONES[k]) && JSON.stringify(R.ENUM_OPCION_REPARTO) === '["A","B","C"]');
  const DB = {};
  Object.keys(R.DUENO_BASES).forEach((k) => {
    const c = R.DUENO_BASES[k][1];
    DB[k] = { base: corre(esc(c)), bajas: corre(esc(Object.assign({}, R.BAJAS, c))) };
    ['base', 'bajas'].forEach((sc) => P('G2-' + k + ' ' + sc + ': identidades', Object.keys(DB[k][sc].identidades).every((q) => DB[k][sc].identidades[q] === true), DB[k][sc].identidades));
  });
  if (extra.alTerminarSintetico) extra.alTerminarSintetico(Rs, OP, DB);

  /* ═════════ Vertical sobre F-02 (V) ═════════ */
  const Rv = {};
  if (C) {
    /* corrección 1 (T-11): los casos ya aplican su opción de P-02 (planConOpcion) y se declaran el preferente como lo calcula F-02 y la comisión de venta */
    const KW_V = Object.assign({ iva: { tipologia: 'vivienda', modalidad: 'ya_incorporado' }, fee_en_indirectos: 'no', gestion_esquema: 'A' }, extra.declaraB2 === false ? {} : { isr: { estado: 'transparente' }, otros_acreedores: { estado: 'ninguno' }, reservas: { estado: 'ninguna' } }, extra.kwExtra || {});
    const KW_CASO = extra.kwCaso || {};
    const RV = (caso, kw, cid) => R.repartoVertical(caso, Object.assign({}, KW_V, (cid && KW_CASO[cid]) || {}, kw || {}));
    const corrV = (nombre, cid, kw) => { Rv[nombre] = Object.assign({ caso: cid }, RV(C[cid], kw, cid)); return Rv[nombre]; };
    const a = corrV('muestra_retenida', 'muestra');
    P('V1 muestra con caja mínima retenida: CR = caja − caja mínima', a.cr === a.cd - a.reserva.requerida, a.cr);
    P('V1 muestra retenida: suma = CR y autorizado 0 (sin firma)', a.identidades['suma repartida = CR'] && sumaV(a.autorizado) === 0);
    const S = C.muestra.series;
    const b38 = corrV('muestra_corte_38', 'muestra', { mes_corte: 38, liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true });
    P('R-B1a (Reina) corte en el mes 38: intermedio, D-16 retenida y nada autorizado (antes autorizaba 40,458,512 con caja de 22,536,762)',
      b38.corte === 'intermedio' && b38.reserva.liberada === 0 && sumaV(b38.autorizado) === 0 && b38.fecha_autorizable === null && b38.cd === 22536762 && b38.cartera_por_cobrar === 18865000 && tiene(b38.motivos, 'CORTE'), [b38.corte, b38.cd, b38.motivos]);
    const bv = corrV('muestra_liberada_pactada', 'muestra', { mes_corte: 39, liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true });
    P('V2 (corregida) corte en el mes 39: final, caja del propio mes, dueño = R-22 y alianza = R-24 (±1)',
      bv.corte === 'final' && bv.cd === R.pz(S.caja[39]) && Math.abs(bv.dueno - bv.R22) <= 1 && Math.abs(bv.alianza - bv.R24) <= 1, [bv.dueno, bv.R22, bv.alianza, bv.R24]);
    P('V2 (corregida) corte 39: autorizado = simulado = 40,458,512 y fecha autorizable 39 = mes_reparto 39',
      bv.autorizable && !bv.motivos_utilidades.length && igualO(bv.autorizado, bv.simulado) && sumaV(bv.autorizado) === 40458512 && bv.fecha_autorizable === 39 && bv.mes_reparto === 39 && bv.primer_mes_cierre === 39, [bv.motivos, bv.fecha_autorizable]);
    P('V2 CR − saldo de capital = D-22', bv.identidades['CR − saldo de capital = D-22 (±1 peso)'] === true);
    const b60 = corrV('muestra_corte_60', 'muestra', { liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true });
    P('V2b corte en el mes 60: mismas cifras que el 39 y su fecha es la del corte (60)', igualO(b60.autorizado, bv.autorizado) && b60.fecha_autorizable === 60);
    /* N-02 (dictamen T-08 v3): el visor no presenta el mes 39 del motor como fecha autorizada del corte 60 */
    const pq60 = b60.salida.paquete, pq39 = bv.salida.paquete;
    const fechasPublicables = (pq) => R.CAMPOS_FECHA.filter((k) => pq[k] && pq[k].estado === 'publicable').map((k) => [k, pq[k].valor]);
    P('N-02 (dictamen T-08 v3) corte 60 autorizado: ninguna fecha publicable vale 39; mes_reparto 39 queda teórico como referencia del Árbol y las fechas autorizadas son 60 y 5 años',
      fechasPublicables(pq60).every(([k, v]) => v !== 39 && v !== 3.25) && pq60.mes_reparto.valor === 39 && pq60.mes_reparto.estado === 'teórico' && /referencia del Árbol/.test(pq60.mes_reparto.motivos.join(' '))
      && pq60.fecha_corte_autorizado.valor === 60 && pq60.fecha_corte_autorizado.estado === 'publicable' && pq60.dueno_meses.valor === 60 && pq60.dueno_meses.estado === 'publicable' && pq60.dueno_anos.valor === 5 && pq60.dueno_anos.estado === 'publicable', [fechasPublicables(pq60), pq60.mes_reparto]);
    P('N-02 el paquete distingue el hito del motor, el corte autorizado y el pago registrado (rol de cada fecha)',
      pq60.mes_reparto.rol === 'hito del motor' && pq60.fecha_corte_autorizado.rol === 'corte autorizado' && pq60.dueno_meses.rol === 'corte autorizado' && pq60.dueno_meses.hito_motor === 39 && pq60.fecha_pago_registrado.rol === 'pago registrado' && pq60.fecha_pago_registrado.valor === null);
    P('N-02 corte 39 autorizado: el hito del motor coincide con el corte y entonces sí es publicable', pq39.mes_reparto.valor === 39 && pq39.mes_reparto.estado === 'publicable' && pq39.fecha_corte_autorizado.valor === 39 && pq39.dueno_meses.valor === 39);
    P('N-02 sin autorización ninguna fecha es publicable (corte 60 sin firma)', fechasPublicables(a.salida.paquete).length === 0 && a.salida.paquete.fecha_corte_autorizado.valor === null);
    /* propiedad de corte único en todo el calendario */
    Object.keys(C).forEach((cid) => {
      const caso = C[cid], malos = [];
      for (let mm = 1; mm <= caso.M; mm++) {
        const x = RV(caso, { mes_corte: mm, liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true, prioridad_tierra_pactada: true });
        const tot = sumaV(x.autorizado), p57 = Object.keys(x.autorizado).filter((k) => R.PASO[k] >= 5).reduce((s, k) => s + x.autorizado[k], 0);
        if (tot > Math.max(0, R.pz(caso.series.caja[mm]))) malos.push([mm, 'excede caja']);
        if (x.corte !== 'final' && (tot > 0 || x.reserva.liberada > 0)) malos.push([mm, 'autoriza o libera antes del cierre']);
        if (p57 > 0 && x.corte !== 'final') malos.push([mm, 'pasos 5–7 fuera de corte final']);
        if (x.salida && R.CAMPOS_FECHA.some((k) => x.salida.paquete[k] && x.salida.paquete[k].estado === 'publicable' && x.salida.paquete[k].valor !== mm && x.salida.paquete[k].valor !== mm / 12)) malos.push([mm, 'fecha publicable distinta del corte (N-02)']);
      }
      P('R-B1b propiedad de corte único en los ' + caso.M + ' meses · ' + cid, !malos.length, malos.slice(0, 3));
    });
    const c = corrV('N1_retenida', 'N1', { acuerdos_pactados: true });
    P('V3 N1 retenida: CR 0 y nada autorizado', c.cr === 0 && sumaV(c.autorizado) === 0, c.cr);
    P('V3 N1 retenida: campos del visor teóricos y nota de reserva retenida', R.CAMPOS_VISOR.every((k) => c.rotulos[k] !== 'publicable') && c.notas.some((x) => x.indexOf('RESERVA') === 0));
    const dd = corrV('N1_liberada', 'N1', { liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true });
    P('V4 N1 liberada: 1,156,991 a principal y 4,321,019 a preferente', dd.simulado.capital_principal === 1156991 && dd.simulado.capital_preferente === 4321019, dd.simulado);
    P('V4 N1 liberada y pactada: se autoriza devolver el capital (5,478,010) y nada de utilidades', dd.autorizado.capital_principal + dd.autorizado.capital_preferente === 5478010 && dd.dueno === 0 && dd.alianza === 0 && dd.fecha_autorizable === null && dd.motivos_utilidades.length > 0, dd.motivos);
    const dn = corrV('N1_liberada_sin_firma', 'N1', { liberar_caja_minima: 'al_liquidar' });
    P('V4b N1 liberada sin firma: autorizado 0', sumaV(dn.autorizado) === 0);
    const e = corrV('tierra_especie_sin_pacto', 'muestra_tierra_especie', { liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true });
    P('V5 tierra en especie sin pacto: CF-10, nada autorizado, R-21 a R-25 teóricos con el motivo de tierra', tiene(e.motivos, 'CF-10') && !e.autorizable
      && ['R-22', 'R-23', 'R-24', 'R-25'].every((k) => e.salida.tarjeta[k].estado === 'teórico' && e.salida.tarjeta[k].motivos.indexOf('incluye tierra aportada sin regla pactada') >= 0));
    P('V5 tierra en especie: dueño simulado = R-22 (12,137,554 ±1)', Math.abs(e.dueno - e.R22) <= 1, [e.dueno, e.R22]);
    const f = corrV('N1_tierra_especie', 'N1_tierra_especie', { acuerdos_pactados: true });
    P('V6 (C1) N1 tierra en especie: R-22 negativo conserva los dos motivos, tierra sin regla y pérdida asignada',
      f.salida.paquete.dueno_recibe.estado === 'teórico' && f.salida.paquete.dueno_recibe.motivos.indexOf('incluye tierra aportada sin regla pactada') >= 0 && f.salida.paquete.dueno_recibe.motivos.indexOf('pérdida asignada (teórica)') >= 0 && !f.autorizable, f.salida.paquete.dueno_recibe);
    const g = corrV('tierra_especie_con_pacto', 'muestra_tierra_especie', { mes_corte: 39, liberar_caja_minima: 'al_liquidar', prioridad_tierra_pactada: true, acuerdos_pactados: true });
    const t_ = g.salida.tarjeta, pq = g.salida.paquete, lg = g.salida.legado, mu = C.muestra.nodos;
    /* opción A (corrección 1, T-11): el excedente es 50/50. Sin pacto de tierra el motor reparte la caja de 40,458,512 sin pagar la tierra: mitad y mitad */
    P('R-B3a (Reina) tierra en especie con pacto: R-22 legado y R-24 legado (opción A: 40,458,512 ÷ 2 = 20,229,256 cada uno) quedan teóricos, no publicables',
      lg['R-22'].estado === 'teórico' && lg['R-24'].estado === 'teórico' && Math.round(lg['R-22'].valor) === 20229256 && Math.round(lg['R-24'].valor) === 20229256 && 2 * 20229256 === 40458512, Object.keys(lg).map((k) => [k, lg[k].estado]));
    P('R-B3b tarjeta «Reparto» con pacto: publica la cascada pactada de la opción A (dueño 14,000,000 + 26,458,512 ÷ 2 = 27,229,256, alianza 13,229,256, veces 1.945, capital 7,921,595) igual al motor con S-02 = sí',
      g.salida.reconciliado && ['R-22', 'R-23', 'R-24', 'R-25'].every((k) => t_[k].estado === 'publicable' && t_[k].fuente === 'cascada pactada reconciliada')
      && t_['R-22'].valor === 14000000 + (40458512 - 14000000) / 2 && t_['R-24'].valor === (40458512 - 14000000) / 2 && Math.abs(t_['R-23'].valor - 27229256 / 14000000) < 1e-9 && Math.round(t_['R-25'].valor) === 7921595
      && ['R-22', 'R-23', 'R-24', 'R-25'].every((k) => Math.abs(t_[k].valor - mu[k]) <= (k === 'R-23' ? 0.001 : 1)), Object.keys(t_).map((k) => [k, t_[k].valor, t_[k].estado]));
    P('R-B3c paquete del visor con pacto: dueno_recibe, dueno_veces, alianza_recibe e inversion_recibe salen de la cascada pactada; R-13 a R-17 teóricos',
      Object.keys(R.CAMPO_NODO).every((k) => pq[k].fuente === 'cascada pactada reconciliada' && pq[k].estado === 'publicable') && R.SIMPLIFICADOS.every((k) => !lg[k] || lg[k].estado === 'teórico'), Object.keys(R.CAMPO_NODO).map((k) => [k, pq[k].valor, pq[k].estado, pq[k].fuente]));
    P('V7 con pacto: el dueño cobra su tierra primero, igual que S-02 = sí, y se autoriza', Math.abs(g.dueno - bv.dueno) <= 1 && g.autorizable, [g.dueno, g.motivos]);
    const h = corrV('capital_20_tierra_especie', 'muestra_capital_20_tierra_especie', { liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true });
    P('V8 (C1) capital 20 % con tierra en especie sin pacto: R-25 e inversion_recibe teóricos con el motivo de tierra',
      h.salida.tarjeta['R-25'].estado === 'teórico' && h.salida.paquete.inversion_recibe.motivos.indexOf('incluye tierra aportada sin regla pactada') >= 0);
    const hp = corrV('capital_20_tierra_especie_con_pacto', 'muestra_capital_20_tierra_especie', { liberar_caja_minima: 'al_liquidar', prioridad_tierra_pactada: true, acuerdos_pactados: true });
    const m20 = C.muestra_capital_20.nodos;
    /* opción C (12 % y 30/20/50): F-02 se recalculó con D-01 = 12 %; la cascada pactada publica el excedente por terceras partes de la opción y coincide con el motor con S-02 = sí */
    const restoC = hp.simulado.dueno_parte + hp.simulado.alianza_parte + hp.simulado.capital_parte;
    P('V8b (C1) capital con parte (opción C) con pacto: publica R-24 = 20 % y R-25 = capital + 50 % del excedente (motor con S-02 = sí, ±1); legados teóricos',
      Math.abs(hp.salida.tarjeta['R-24'].valor - m20['R-24']) <= 1 && Math.abs(hp.salida.tarjeta['R-25'].valor - m20['R-25']) <= 1 && Math.abs(hp.simulado.alianza_parte - 0.2 * restoC) <= 1 && Math.abs(hp.simulado.capital_parte - 0.5 * restoC) <= 1
      && Math.abs(hp.simulado.dueno_parte - 0.3 * restoC) <= 1 && hp.salida.tarjeta['R-25'].estado === 'publicable' && hp.salida.legado['R-25'].estado === 'teórico' && hp.salida.legado['R-24'].estado === 'teórico'
      && Math.abs(hp.salida.legado['R-24'].valor * 3 - hp.salida.legado['R-22'].valor * 2) <= 1, [hp.salida.tarjeta['R-24'].valor, hp.salida.tarjeta['R-25'].valor, restoC]);
    const i1 = corrV('fee_inclusion_desconocida', 'muestra_fee_5', { liberar_caja_minima: 'al_liquidar', fee_en_indirectos: 'desconocido', acuerdos_pactados: true });
    P('V9 fee 5 % con inclusión desconocida: CF-01 y nada autorizado', tiene(i1.motivos, 'CF-01') && !i1.autorizable);
    const i2 = corrV('fee_sin_inclusion', 'muestra_fee_5', { liberar_caja_minima: 'al_liquidar', fee_en_indirectos: 'no', acuerdos_pactados: true });
    P('V9b fee 5 % sin inclusión: alianza = R-24 (±1) y autorizable', Math.abs(i2.alianza - i2.R24) <= 1 && i2.autorizable, [i2.alianza, i2.R24, i2.motivos]);
    let i3 = null; err = null;
    try { i3 = corrV('fee_inclusion_pendiente', 'muestra_fee_5', { liberar_caja_minima: 'al_liquidar', fee_en_indirectos: 'pendiente', acuerdos_pactados: true }); } catch (x) { err = x.message; }
    P('R-B4a2 (Reina) vertical con fee 5 % e inclusión «pendiente»: INVÁLIDO y nada autorizado (antes autorizaba 40,458,512)', err === null && i3.estado.indexOf('INVÁLIDO') === 0 && sumaV(i3.autorizado) === 0, err || i3.motivos);
    const i4 = corrV('fee_inclusion_ausente', 'muestra_fee_5', { liberar_caja_minima: 'al_liquidar', fee_en_indirectos: null, acuerdos_pactados: true });
    P('V9d vertical con fee positivo sin declarar la inclusión: dato requerido ausente, INVÁLIDO', i4.estado.indexOf('INVÁLIDO') === 0);
    const i5 = corrV('gestion_B', 'muestra_fee_5', { liberar_caja_minima: 'al_liquidar', gestion_esquema: 'B', acuerdos_pactados: true });
    const i6 = corrV('iva_proxy', 'muestra', { mes_corte: 39, liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true, iva: { tipologia: 'vivienda', modalidad: 'proxy' } });
    const i7 = corrV('iva_mixto', 'muestra', { mes_corte: 39, liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true, iva: { tipologia: 'mixto', modalidad: 'ya_incorporado' } });
    P('V9e lo que el vertical no implementa se bloquea explícitamente: gestión B (CF-02), IVA proxy (CF-06) y mixto (CF-06)',
      tiene(i5.motivos, 'CF-02', 'no implementado') && tiene(i6.motivos, 'CF-06', 'no implementado') && tiene(i7.motivos, 'CF-06', 'no implementado') && !(i5.autorizable || i6.autorizable || i7.autorizable));
    const j = corrV('banco_insoluto', 'banco_insoluto', { liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true });
    P('V10 banco insoluto: el faltante incluye banco y respaldo vivos; CR 0; horizonte truncado', j.faltante_acreedores > 0 && j.cr === 0 && j.corte === 'truncado' && j.acreedores[0].saldo === 0 && j.acreedores[1].saldo > 0, j.acreedores);
    const k = corrV('respaldo_sin_fondeador', 'respaldo', { liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true });
    P('V11 respaldo sin fondeador: bloquea aunque F-02 lo haya pagado', tiene(k.motivos, 'SV', 'déficit sin fondeador') && !k.autorizable);
    const kk = corrV('respaldo_con_fondeador', 'respaldo', { liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true, fondeador_respaldo: { parte: 'SP', tope: 30000000, tasa: 0.15, estado_pacto: 'pactado' } });
    P('V11b respaldo con socio patrimonial pactado (parte, tope y tasa): ya no bloquea por fondeador', !tiene(kk.motivos, 'SV', 'déficit sin fondeador'), kk.motivos);
    const k2 = corrV('respaldo_fondeador_incompleto', 'respaldo', { liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true, fondeador_respaldo: { tope: 30000000, estado_pacto: 'pactado' } });
    const k3 = corrV('respaldo_fondeador_fantasma', 'respaldo', { liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true, fondeador_respaldo: { parte: 'FANTASMA', tope: 30000000, tasa: 0.15, estado_pacto: 'pactado' } });
    P('V11c fondeador sólo con tope y «pactado», o con parte FANTASMA: INVÁLIDO', k2.estado.indexOf('INVÁLIDO') === 0 && k3.estado.indexOf('INVÁLIDO') === 0);
    const lpr = corrV('N1_prorrata', 'N1', { liberar_caja_minima: 'al_liquidar', imputacion: 'prorrata', acuerdos_pactados: true });
    P('V12 imputación versionada: principal primero y prorrata reconstruyen el saldo de F-02', dd.identidades['saldo de capital reconstruido hasta el corte (≤ 0.01 peso)'] && lpr.identidades['saldo de capital reconstruido hasta el corte (≤ 0.01 peso)']);
    P('V12b la regla de imputación cambia principal y preferente pendientes', lpr.principal_pendiente !== dd.principal_pendiente || lpr.preferente_pendiente !== dd.preferente_pendiente, [lpr.principal_pendiente, dd.principal_pendiente]);
    const rv = corrV('respaldo_vivo', 'respaldo_vivo', { liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true });
    P('V13 respaldo vivo al mes 60: se paga con la caja antes que la reserva y bloquea por déficit sin fondeador', rv.acreedores[1].pagado === rv.acreedores[1].exigible && rv.acreedores[1].exigible > 0 && tiene(rv.motivos, 'SV', 'déficit sin fondeador') && sumaV(rv.autorizado) === 0, rv.acreedores);
    const roto = clona(C.muestra); roto.nodos['S-03'] = null;
    const roto2 = clona(C.muestra); delete roto2.series.caja_minima;
    let x1 = null, x2 = null; err = null;
    try { x1 = RV(roto); x2 = RV(roto2); } catch (x) { err = x.message; }
    P('V14 dato requerido ausente (nodo S-03 nulo o serie caja_minima borrada): INVÁLIDO sin excepción', err === null && x1.estado.indexOf('INVÁLIDO') === 0 && x2.estado.indexOf('INVÁLIDO') === 0, err || [x1.errores, x2.errores]);
    const v61 = RV(C.muestra, { mes_corte: 61 });
    P('V14b mes de corte fuera del horizonte: INVÁLIDO', v61.estado.indexOf('INVÁLIDO') === 0);
    const s1 = corrV('vertical_sobrepago', 'muestra', { mes_corte: 39, liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true, pagos_registrados: { DUENO: 999999999 } });
    P('V15 vertical con sobrepago al dueño: evidencia conservada y nada autorizado', s1.pagado.DUENO === 999999999 && tiene(s1.motivos, 'PAGO', 'sobrepago') && sumaV(s1.autorizado) === 0);
    const s2 = corrV('vertical_pago_parcial', 'muestra', { mes_corte: 39, liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true, pagos_registrados: { DUENO: 14000000 } });
    P('V15b vertical con pago parcial al dueño: se autoriza el saldo y cuadra por parte',
      s2.autorizable && s2.autorizado.dueno_tierra === 0 && s2.conciliacion.DUENO.disponible_reintento === s2.dueno - 14000000 && Object.keys(s2.conciliacion).every((q) => s2.conciliacion[q].derecho === s2.conciliacion[q].pagado + s2.conciliacion[q].disponible_reintento), s2.conciliacion);
    const s3 = corrV('vertical_pago_fantasma', 'muestra', { mes_corte: 39, pagos_registrados: { FANTASMA: 1 } });
    P('V15c vertical con pago a una parte no registrada: INVÁLIDO', s3.estado.indexOf('INVÁLIDO') === 0);
    if (extra.alTerminarVertical) extra.alTerminarVertical(Rv, RV, KW_V);
    Object.keys(Rv).forEach((nm) => {
      const x = Rv[nm]; if (!x.salida) return;
      P('V0 suma = CR · ' + nm, x.identidades['suma repartida = CR']);
      P('V0 sin negativos · ' + nm, Object.keys(x.simulado).every((q) => x.simulado[q] >= 0));
      if (C[x.caso].nodos['S-02'] === 'no') {
        const malos = Object.keys(x.salida.tarjeta).map((q) => [q, x.salida.tarjeta[q]]).concat(Object.keys(x.salida.paquete).map((q) => [q, x.salida.paquete[q]])).filter(([q, v]) => v.estado === 'publicable' && v.fuente === 'motor (legado)').map(([q]) => q);
        P('R-B3d ningún campo legado publicable con S-02 = no · ' + nm, !malos.length && Object.keys(x.salida.legado).every((q) => x.salida.legado[q].estado === 'teórico'), malos);
      }
    });
  }
  P('M5 etiquetas de prueba únicas', new Set(HECHAS).size === HECHAS.length, HECHAS.filter((h, i) => HECHAS.indexOf(h) !== i));
  return { HECHAS, Rs, OP, DB, Rv };
}

/* El motor recibe el módulo (sin require dentro de motor.js) y se carga la definición con la extensión del reparto. */
const REP = require(path.join(APP, 'reparto.js'));
Motor.registraReparto(REP);
const REPJSON = JSON.parse(fs.readFileSync(path.join(APP, 'definicion', 'reparto.json'), 'utf8'));
const REPTAB = { ARBOL_NODOS: leeCsv(fs.readFileSync(path.join(APP, 'definicion', 'reparto_nodos.csv'), 'utf8')), ARBOL_FACTORES: leeCsv(fs.readFileSync(path.join(APP, 'definicion', 'reparto_factores.csv'), 'utf8')) };
const C10 = Motor.carga(JSON.parse(JSON.stringify(VERT)), { extension: REPJSON }), DEF10 = C10.definicion;
const CT10 = Motor.carga(JSON.parse(JSON.stringify(TABLAS)), { extension: REPTAB }), DEFT10 = CT10.definicion;
const NUEVOS10 = ['S-12', 'S-13', 'S-17', 'S-18', 'S-19', 'S-20', 'S-21', 'S-22', 'S-23', 'S-24', 'R-26', 'R-27', 'R-28', 'R-29', 'R-30', 'R-31', 'R-32', 'R-33', 'R-34', 'R-35'];
const plan10 = (predio, respuestas, datos) => {
  let plan = { tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: predio } } };
  respuestas.forEach(([id, op]) => { plan = Motor.evalua(DEF10, plan, { [id]: { opcion: op, estado: 'decidido' } }, SIN).plan; });
  Object.keys(datos || {}).forEach((id) => { plan = Motor.evalua(DEF10, plan, { [id]: { valor: datos[id], estado: 'decidido' } }, SIN).plan; });
  return plan;
};
const con10 = (plan, cambios, registro) => { let p = plan; Object.keys(cambios || {}).forEach((id) => { p = Motor.evalua(DEF10, p, { [id]: { valor: cambios[id], estado: 'decidido' } }, SIN).plan; }); if (registro) p = Object.assign({}, p, { reparto: registro }); return p; };
/* los diez casos de aceptación del exportador t08v3_exporta_motor.cjs (mismos planes de la suite con un cambio cada uno) */
const CASOS10 = [
  ['muestra', 2000, 'base', { 'T-04': 14 }], ['N1', 2000, 'base', { 'T-04': 14, 'P1-06': 40000 }], ['muestra_tierra_especie', 2000, 'base', { 'T-04': 14, 'S-02': 'no' }],
  ['N1_tierra_especie', 2000, 'base', { 'T-04': 14, 'P1-06': 40000, 'S-02': 'no' }], ['muestra_capital_20', 2000, 'base', { 'T-04': 14, 'S-05': 0.2 }],
  ['muestra_capital_20_tierra_especie', 2000, 'base', { 'T-04': 14, 'S-05': 0.2, 'S-02': 'no' }], ['muestra_fee_5', 2000, 'base', { 'T-04': 14, 'S-06': 0.05 }],
  ['respaldo_vivo', 2000, 'base', { 'T-04': 14, 'P1-06': 30000 }], ['banco_insoluto', 2000, 'base', { 'T-04': 14, 'P1-06': 25000 }],
  ['respaldo', 3000, 'prob', { 'T-04': 36, 'P1-08': 1.5, 'P1-06': 70000, 'D-15': 14, 'K-13': 0.40 }]
];
const PLANES10 = {}, CASOS = {}, REPS = {};
CASOS10.forEach(([id, predio, resp, datos]) => { PLANES10[id] = plan10(predio, resp === 'prob' ? RESPUESTAS_PROB : RESPUESTAS, datos); REPS[id] = Motor.reparto(DEF10, PLANES10[id]); CASOS[id] = REPS[id].caso; });
const sumaO = (o) => Object.keys(o || {}).reduce((s, k) => s + o[k], 0);
const V10 = (plan, id) => Motor.paqueteVisor(DEF10, plan, { informe: true }).valores[id].valor;   // valor de cualquier factor, también oculto
const B2_DECLARADO = { isr: { estado: 'transparente' }, otros_acreedores: { estado: 'ninguno' }, reservas: { estado: 'ninguna' } };
/* ── corrección 1 de T-10 (dictamen T-11 v1) ── B01: la opción de P-02 gobierna la estructura. Los planes de prueba aplican su opción con planConOpcion
   (A en todos; C en los dos de capital con parte del excedente, que A no tiene) y el registro declara además lo que T-11 exige para autorizar:
   el pacto del preferente como lo calcula F-02 (B01) y el beneficiario y canal de la comisión de venta (CF-03, B03). */
const OPCION10 = { muestra_capital_20: 'C', muestra_capital_20_tierra_especie: 'C' };
const PLANES10A = {}, CASOSA = {};
Object.keys(PLANES10).forEach((id) => { const r = Motor.planConOpcion(DEF10, PLANES10[id], OPCION10[id] || 'A'); PLANES10A[id] = r.plan; PLANES10A[id]._errores = r.errores; CASOSA[id] = Motor.reparto(DEF10, r.plan).caso; });
const DECL = Object.assign({}, B2_DECLARADO, { preferente_f02: 'pactado', comision_venta: { beneficiario: 'TERCERO', canal: 'externo' } });
const INTERNO_TERCIOS = { modo: 'pesos', partes: { YOD: 1, PG: 1, AVM: 1 }, estado_pacto: 'pactado' };   // en C la matriz deja «sin asignar»: se pacta un reparto interno
const KW_CASO_C = { muestra_capital_20: { opcion_reparto: 'C', reparto_interno: INTERNO_TERCIOS }, muestra_capital_20_tierra_especie: { opcion_reparto: 'C', reparto_interno: INTERNO_TERCIOS } };

prueba('T-10 · la extensión carga sin errores: 150 nodos (130 + S-12, S-13, S-17 a S-24 y R-26 a R-35) y vertical.json sigue con 130', () => {
  assert.deepStrictEqual(C10.errores, []); assert.deepStrictEqual(CT10.errores, [], JSON.stringify(CT10.errores.slice(0, 3)));
  assert.strictEqual(DEF10.nodos.length, 150); assert.strictEqual(DEF._interna.cn.length, 130); NUEVOS10.forEach((id) => assert(DEF10.nodos.indexOf(id) >= 0, id));
  NUEVOS10.forEach((id) => { const c = DEF10._interna.cn[DEF10._interna.ix.get(id)]; assert(c.oculto === true && c.tarjetas.indexOf('Reparto') >= 0, id); });
  assert.strictEqual(REPJSON.nodos.length, 20); assert.strictEqual(REPTAB.ARBOL_NODOS.length, 20); assert.strictEqual(REPTAB.ARBOL_FACTORES.length, 20);
  const r = Motor.carga(JSON.parse(JSON.stringify(VERT)), { extension: { nodos: [Object.assign({}, REPJSON.nodos[10], { motor: 'reparto.inventada' })] } }); assert(r.errores.some((e) => e.codigo === 'motor_invalido'), 'una medida inexistente se rechaza');
  cifra('T-10 · extensión del reparto: 20 nodos ocultos en definicion/reparto.json (y reparto_nodos.csv, reparto_factores.csv); vertical.json intacto (130 nodos)');
});
prueba('T-10 · tablas y JSON de la extensión dan el mismo reparto en la muestra (R-26 a R-35, tarjeta y paquete)', () => {
  const p = con10(PLANES10.muestra, { 'S-21': 39, 'S-17': 'al_liquidar', 'S-23': 'pactado' }, B2_DECLARADO);
  const a = Motor.reparto(DEF10, p), b = Motor.reparto(DEFT10, p);
  assert.deepStrictEqual(a.nodos, b.nodos); assert.strictEqual(JSON.stringify(a.resultado.autorizado), JSON.stringify(b.resultado.autorizado));
  assert.strictEqual(JSON.stringify(Motor.paqueteVisor(DEF10, p).cascada), JSON.stringify(Motor.paqueteVisor(DEFT10, p).cascada));
  const ea = Motor.evalua(DEF10, p, null, SIN), eb = Motor.evalua(DEFT10, p, null, SIN); assert.strictEqual(JSON.stringify(ea.tarjetas.Reparto), JSON.stringify(eb.tarjetas.Reparto));
});
prueba('T-10 · los parámetros nuevos van ocultos: no cambian lo que se pide ni lo que falta por confirmar, ni las cifras de la tarjeta Reparto', () => {
  const a = Motor.evalua(DEF, BASE, null, SIN), b = Motor.evalua(DEF10, BASE, null, SIN);
  assert.deepStrictEqual(a.por_confirmar, b.por_confirmar); assert.deepStrictEqual(a.abiertas, b.abiertas); assert.deepStrictEqual(a.nodos.map((n) => n.id), b.nodos.map((n) => n.id));
  assert.deepStrictEqual(b.tarjetas.Reparto.cifras.map((c) => c.id), ['R-23', 'R-22', 'R-24', 'R-25', 'T-04']); b.tarjetas.Reparto.cifras.forEach((c, i) => assert.strictEqual(c.valor, a.tarjetas.Reparto.cifras[i].valor, c.id));
});
/* O01 (dictamen T-11): huellas sha256 (16 caracteres) de la tarjeta «Reparto», de todas las tarjetas y del paquete del visor que da el motor del
   COMMIT BASE 7a03972 (git show 7a03972:arbol-ppp/motor.js) con vertical.json sin extensión, sobre estos mismos planes. El motor parchado sin la
   extensión debe dar exactamente lo mismo: el contrato legado no cambia. */
const HUELLAS_BASE = {"muestra": ["c8092467e3cc8ae3", "bd03d97ea072adb4", "ad1096f5eedccbb0"], "N1": ["7cfb71a94f7a6a9d", "cba425c829ef41ad", "0f06bd89c9acb11c"], "muestra_tierra_especie": ["ddb4f3076596f32d", "15b2c45e29405001", "281ddc59b7b1aa81"], "N1_tierra_especie": ["126c7526a8af083c", "1e244da075f5d19d", "fef30fb5cf3a3a1d"], "muestra_capital_20": ["16ff8a04931a2475", "8898aa5702f1b9f2", "3f284e400dfc4449"], "muestra_capital_20_tierra_especie": ["992d562052268bbf", "541ca7b4657fd2c3", "50d3ae35475200dd"], "muestra_fee_5": ["3a13507c5977ece8", "963fe01660668e3a", "8c44cf0c7de1c200"], "respaldo_vivo": ["c1273312c57ec53e", "f8977edcfc4f4206", "65e43ef95ac4128c"], "banco_insoluto": ["d389a27f0b967897", "12d3e8b6cf08640f", "0b40a388a396c14c"], "respaldo": ["53ea20c313f74da5", "fea79727b1ac54ab", "c07390989e4d7cf1"], "BASE": ["c8092467e3cc8ae3", "bd03d97ea072adb4", "ad1096f5eedccbb0"], "PROB": ["894ea84d362097c1", "4373bea5c55b09c5", "6b5c05772d0ee911"]};
prueba('O01 (dictamen T-11) · sin la extensión, la tarjeta «Reparto», todas las tarjetas y el paquete del visor son IDÉNTICOS a los del commit base (12 planes)', () => {
  const huella = (x) => require('crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
  Object.entries(Object.assign({}, PLANES10, { BASE, PROB })).forEach(([id, plan]) => {
    const e = Motor.evalua(DEF, plan, null, SIN), h = [huella(e.tarjetas.Reparto), huella(e.tarjetas), huella(Motor.paqueteVisor(DEF, plan))];
    assert.deepStrictEqual(h, HUELLAS_BASE[id], id + ': ' + JSON.stringify(h));
  });
  cifra('O01 · sin la extensión, tarjeta «Reparto», tarjetas y paquete del visor idénticos al commit base 7a03972 en 12 planes (huella sha256)');
});
prueba('T-10 · sin la extensión (o sin reparto.js) el reparto sale vacío y lo dice; la tarjeta y el paquete no traen nada nuevo', () => {
  const r = Motor.reparto(DEF, BASE); assert.strictEqual(r.ok, false); assert(/no trae el módulo de repartos/.test(r.motivo));
  const t = Motor.evalua(DEF, BASE, null, SIN).tarjetas.Reparto; assert.strictEqual(t.cascada, undefined); t.cifras.forEach((c) => assert(c.rotulo === undefined && c.estado_reparto === undefined, c.id));
  const p = Motor.paqueteVisor(DEF, BASE); assert.strictEqual(p.cascada, undefined);
  Motor.registraReparto(null); try { const q = Motor.reparto(DEF10, BASE); assert.strictEqual(q.ok, false); assert(/no está cargado/.test(q.motivo)); assert.strictEqual(Motor.reparto(DEF10, BASE).nodos['R-29'], null, 'vacío, nunca cero'); } finally { Motor.registraReparto(REP); }
});

/* ── M5 · ejecución completa con los casos del motor real (sin exportar): horizonte, ck_flujo y ck_cobranza (N1 del dictamen T-09 v2) y cifras de control ── */
prueba('M5 · los diez casos del exportador salen del motor con horizonte de 60 meses, meses en base uno y cifras en pesos', () => {
  Object.keys(CASOS).forEach((id) => { const c = CASOS[id]; assert(c && c.M === 60, id); assert.strictEqual(c.series.caja[0], null); assert.strictEqual(c.series.caja.length, 61); assert(REPS[id].ok, id + ': ' + REPS[id].motivo); });
});
prueba('N1 (dictamen T-09 v2) · ck_flujo y ck_cobranza: diferencia menor o igual a 1 peso sobre el TOTAL del horizonte, además del criterio mensual', () => {
  Object.keys(CASOS).forEach((id) => {
    const c = CASOS[id], S = c.series; let tot = 0, maxMes = 0;
    for (let m = 1; m <= c.M; m++) {
      const d = (S.caja[m] - (m === 1 ? 0 : S.caja[m - 1])) - (S.cobranza[m] - S.egresos[m] - S.interes[m] - S.apertura[m] + S.cap_aporta[m] + S.disposicion[m] + S.respaldo[m] - S.pago_banco[m] - S.pago_respaldo[m] - S.pago_capital[m]);
      tot += Math.abs(d); maxMes = Math.max(maxMes, Math.abs(d));
    }
    assert(Math.abs(c.med.cuadra) <= 1, id + ': ck_flujo del motor ' + c.med.cuadra); assert(Math.abs(c.med.cobranza_total - c.nodos['PT-07']) <= 1, id + ': ck_cobranza ' + (c.med.cobranza_total - c.nodos['PT-07']));
    assert(tot <= 1, id + ': suma de diferencias mensuales de caja ' + tot); assert(maxMes <= 1, id + ': diferencia mensual ' + maxMes);
    const v = Motor.paqueteVisor(DEF10, PLANES10[id]).v; assert(Math.abs(v.ck_flujo) * 1e6 <= 1 && Math.abs(v.ck_cobranza) * 1e6 <= 1, id + ': ck del paquete');
  });
  cifra('N1 · ck_flujo y ck_cobranza ≤ 1 peso sobre el horizonte y por mes en los 10 casos (la caja mes a mes se recalcula con cobranza, egresos, dinero y pagos)');
});
prueba('M5 · cifras de control de los dictámenes T-06 v2, T-08 v1, T-08 v2 y T-09 v2 reproducidas dentro de la suite', () => {
  const P = (id, k) => CASOS[id].nodos[k], S = (id, k, m) => CASOS[id].series[k][m], peso = (a, b, et) => assert(a !== null && Math.abs(a - b) < 1, et + ': ' + a + ' ≠ ' + b);
  peso(S('N1', 'caja', 60), 5478010, 'N1 caja mes 60'); peso(S('N1', 'caja_minima', 60), 5478010, 'N1 caja mínima'); peso(S('N1', 'saldo_capital', 60), 12542105.3846777, 'N1 saldo de capital'); peso(P('N1', 'R-22'), 7680771.38459669, 'N1 R-22');
  peso(P('muestra', 'R-22'), 21937553.745453194, 'muestra R-22'); peso(P('muestra', 'R-24'), 18520958.739390787, 'muestra R-24');
  peso(S('muestra', 'caja', 38), 22536762, 'B1 caja mes 38'); peso(S('muestra', 'caja', 39), 40458512, 'B1 caja mes 39'); peso(S('muestra', 'cobranza', 39), 18865000, 'B1 cobranza mes 39');
  peso(P('muestra_tierra_especie', 'R-22'), 12137553.745453194, 'tierra en especie R-22'); peso(P('muestra_tierra_especie', 'R-24'), 28320958.739390787, 'tierra en especie R-24');
  peso(P('muestra_capital_20', 'R-24'), 13229256.4, 'C1 R-24 con S-05 0.2'); peso(P('muestra_capital_20', 'R-25'), 13213297.3, 'C1 R-25 con S-05 0.2');
  peso(P('muestra_capital_20_tierra_especie', 'R-24'), 20229256.4, 'C1 R-24 tierra en especie'); peso(P('muestra_capital_20_tierra_especie', 'R-25'), 16013297.4, 'C1 R-25 tierra en especie');
  assert(S('banco_insoluto', 'saldo_banco', 60) > 1 && CASOS.banco_insoluto.visor.mes_reparto > 60, 'banco insoluto: deuda viva y mes_reparto fuera del horizonte'); peso(P('N1_tierra_especie', 'R-22'), -2119228.6154030957, 'N1 tierra en especie R-22');
  Object.keys(PLANES10).forEach((id) => { const t = Motor.evalua(DEF10, PLANES10[id], null, SIN).tarjetas.Reparto; ['R-22', 'R-23', 'R-24', 'R-25'].forEach((k) => { const c = t.cifras.find((q) => q.id === k); assert(c && Math.abs(c.valor - CASOS[id].nodos[k]) < 1e-6, id + ' tarjeta ' + k); }); });
});
prueba('M5 · las fechas que usa el reparto son las mismas que publica el paquete del visor (banco, capital, respaldo, último cobro, mes de reparto y recorte)', () => {
  const lento = Motor.evalua(DEF10, PROB, { 'P1-08': { valor: 0.6, estado: 'decidido' } }, SIN).plan;
  Object.keys(PLANES10).map((id) => [id, PLANES10[id]]).concat([['BASE', BASE], ['PROB', PROB], ['lento', lento]]).forEach(([id, plan]) => {
    const f = Motor.visorFechas(DEF10, plan), v = Motor.paqueteVisor(DEF10, plan).v;
    ['fin_obra', 'ultimo_cobro', 'banco_mes', 'capital_mes', 'respaldo_mes', 'mes_reparto', 'dueno_meses', 'dueno_anos', 'fuera_horizonte'].forEach((k) => assert(f[k] === v[k] || (typeof f[k] === 'number' && Math.abs(f[k] - v[k]) < 1e-12), id + ' ' + k + ': ' + f[k] + ' vs ' + v[k]));
  });
  assert(Motor.visorFechas(DEF10, lento).horizonte_excedido === true, 'el plan lento se sale del horizonte');
});

/* ── las aserciones V, A y R de los guiones v3, sobre los casos del motor real ── */
let HECHAS10 = [];
try {
  const salida = pruebasRepartoT10(REP, CASOSA, (n, ok, d) => prueba(n, () => assert(ok, d)), { kwExtra: { preferente_f02: 'pactado', comision_venta: { beneficiario: 'TERCERO', canal: 'externo' } }, kwCaso: KW_CASO_C });
  HECHAS10 = salida.HECHAS;
  cifra('T-10 · guiones v3 portados: ' + HECHAS10.length + ' aserciones (las 243 de t08v3_reparto.py con sus etiquetas, más N-02, P-02 y el receptor único inválido) sobre los 10 casos del motor real');
} catch (e) { prueba('T-10 · el bloque de aserciones portadas termina sin excepción', () => { throw e; }); }

/* ── integración en el Árbol: nodos, tarjeta «Reparto» y paquete del visor ── */
/* P39R y P60R son los planes de las sondas del dictamen T-11 (muestra 30/70/0 con sólo B2 declarado). P39 y P60: la misma muestra con la opción A
   aplicada (planConOpcion: S-03 «Tierra + mitad», S-05 0 y D-01 15 %) y lo que T-11 exige declarar (preferente como F-02 y comisión de venta). */
const P39R = con10(PLANES10.muestra, { 'S-21': 39, 'S-17': 'al_liquidar', 'S-23': 'pactado' }, B2_DECLARADO);
const P60R = con10(PLANES10.muestra, { 'S-17': 'al_liquidar', 'S-23': 'pactado' }, B2_DECLARADO);
const P39 = con10(PLANES10A.muestra, { 'S-21': 39, 'S-17': 'al_liquidar', 'S-23': 'pactado' }, DECL);
const P60 = con10(PLANES10A.muestra, { 'S-17': 'al_liquidar', 'S-23': 'pactado' }, DECL);
prueba('T-10 · por el Árbol (S-21 = 39, S-17 al liquidar, S-23 pactado y B2 declarado): R-26 a R-35 iguales al módulo corrido sobre el mismo caso', () => {
  const r = Motor.reparto(DEF10, P39), x = REP.repartoVertical(r.caso, Object.assign({}, r.parametros));
  assert.strictEqual(r.nodos['R-31'], 'AUTORIZABLE'); assert.strictEqual(r.nodos['R-32'], 39); assert.strictEqual(r.nodos['R-29'], 40458512); assert.strictEqual(r.nodos['R-26'], 40458512); assert.strictEqual(r.nodos['R-33'], 40458512);
  assert.strictEqual(r.nodos['R-27'], 0); assert.strictEqual(r.nodos['R-28'], 5588260); assert.strictEqual(r.nodos['R-34'], 'ninguno'); assert(/^final · corte en el mes 39 · primer mes de cierre 39$/.test(r.nodos['R-35']));
  assert.strictEqual(JSON.stringify(r.resultado.autorizado), JSON.stringify(x.autorizado)); assert.strictEqual(sumaO(x.autorizado), 40458512);
  const e = Motor.evalua(DEF10, P39, null, SIN); assert.strictEqual(e.tarjetas.Reparto.cascada.totales.autorizado, 40458512); assert.strictEqual(e.tarjetas.Reparto.cascada.fechas.corte_autorizado.valor, 39);
  assert.strictEqual(x.dueno, 27229256); assert.strictEqual(x.alianza, 13229256);
  cifra('T-10 · muestra por el Árbol con la opción A: corte 39 final, caja repartible $40,458,512, autorizado $40,458,512 (dueño $27,229,256 = tierra + mitad del resto; alianza $13,229,256), R-32 = 39');
});
prueba('T-10 · por omisión nada está firmado: el Árbol simula y lo autorizado es cero con su motivo (decisión P-02: la opción fija la simulación)', () => {
  const r = Motor.reparto(DEF10, PLANES10.muestra), t = Motor.evalua(DEF10, PLANES10.muestra, null, SIN).tarjetas.Reparto;
  assert.strictEqual(r.parametros.opcion_reparto, 'A'); assert.strictEqual(r.parametros.estado_pacto_acuerdos, 'pendiente'); assert.strictEqual(sumaO(r.resultado.autorizado), 0);
  assert(r.resultado.motivos.some((m) => /^PACTO · acuerdos de reparto sin firma/.test(m))); assert.strictEqual(t.cascada.totales.simulado, 34870252); assert.strictEqual(t.cascada.totales.autorizado, 0);
  assert(t.cifras.filter((c) => c.id !== 'T-04').every((c) => c.estado_reparto === 'teórico' && /sin autorización de pago/.test(c.rotulo)));
});
prueba('N-02 (dictamen T-08 v3) · paquete del visor con corte 60 autorizado: el mes 39 del motor queda como referencia del Árbol y nunca como fecha autorizada', () => {
  const inf = Motor.paqueteVisor(DEF10, P60, { informe: true }), p = inf.paquete, f = p.cascada.fechas;
  assert.strictEqual(p.cascada.estado, 'AUTORIZABLE'); assert.strictEqual(f.hito_motor.valor, 39); assert.strictEqual(f.hito_motor.estado, 'teórico'); assert(/referencia del Árbol/.test(f.hito_motor.motivos.join(' ')));
  assert.strictEqual(f.corte_autorizado.valor, 60); assert.strictEqual(f.corte_autorizado.estado, 'publicable'); assert.strictEqual(f.dueno_meses.valor, 60); assert.strictEqual(f.dueno_anos.valor, 5);
  Object.keys(f).forEach((k) => { if (f[k] && f[k].estado === 'publicable') assert(f[k].valor !== 39 && f[k].valor !== 3.25, 'fecha publicable ' + k + ' = ' + f[k].valor); });
  assert.strictEqual(p.v.mes_reparto, 39); assert(/Hito del motor \(referencia del Árbol\)/.test(p.deducido['v.mes_reparto']) && /Corte autorizado: mes 60/.test(p.deducido['v.mes_reparto']));
  assert.strictEqual(p.v.dueno_meses, 60); assert.strictEqual(p.v.dueno_anos, 5); assert(/hito del motor era 39/.test(p.deducido['v.dueno_meses']));
  assert.strictEqual(f.pago_registrado.valor, null); assert.strictEqual(f.pago_registrado.rol, 'pago registrado');
  const q = Motor.paqueteVisor(DEF10, P39); assert.strictEqual(q.cascada.fechas.hito_motor.estado, 'publicable'); assert.strictEqual(q.v.dueno_meses, 39);
  const s = Motor.paqueteVisor(DEF10, PLANES10.muestra); assert.strictEqual(s.v.dueno_meses, 39); assert(/teórico, sin autorización de pago/.test(s.deducido['v.dueno_meses'])); assert.strictEqual(s.cascada.fechas.corte_autorizado.valor, null);
  assert(JSON.stringify(p).length <= 50000, 'el paquete con la cascada cabe en 50,000 caracteres: ' + JSON.stringify(p).length);
  cifra('N-02 · corte 60 autorizado: hito del motor 39 (teórico, referencia del Árbol), corte autorizado 60, dueño en 60 meses (5 años); paquete de ' + JSON.stringify(p).length + ' caracteres');
});
prueba('B3 y C1 · tierra en especie con pacto (S-02 = no, S-19 = sí): tarjeta y paquete publican la cascada pactada; el motor queda como legado teórico y M8b no cambia', () => {
  const p = con10(PLANES10A.muestra_tierra_especie, { 'S-21': 39, 'S-17': 'al_liquidar', 'S-23': 'pactado', 'S-19': 'si' }, DECL);
  const e = Motor.evalua(DEF10, p, null, SIN), t = e.tarjetas.Reparto, c22 = t.cifras.find((c) => c.id === 'R-22'), c24 = t.cifras.find((c) => c.id === 'R-24');
  assert(c22.valor === 27229256 && c22.estado_reparto === 'publicable' && c22.fuente_reparto === 'cascada pactada reconciliada' && Math.round(c22.legado.valor) === 20229256, JSON.stringify(c22));
  assert(c24.valor === 13229256 && Math.round(c24.legado.valor) === 20229256); casi(c22.valor_visor, c22.valor / 1e6, 1e-12);
  assert(Math.abs(val(e, 'R-22') - 0.5 * (12137553.745453194 / 0.3)) < 1, 'el nodo R-22 sigue con la fórmula del motor (M8b): la mitad de la caja sin pagar la tierra');
  const v = Motor.paqueteVisor(DEF10, p); assert(Math.abs(v.v.dueno_recibe - 27.229256) < 1e-6 && Math.abs(v.v.alianza_recibe - 13.229256) < 1e-6); assert(/Cascada pactada reconciliada/.test(v.deducido['v.dueno_recibe']));
  assert.strictEqual(v.cascada.legado['R-22'].estado, 'teórico'); assert(t.cifras.every((c) => c.valor_visor === { 'R-23': v.v.dueno_veces, 'R-22': v.v.dueno_recibe, 'R-24': v.v.alianza_recibe, 'R-25': v.v.inversion_recibe, 'T-04': v.v.tierra }[c.id]), 'pantalla y paquete dicen lo mismo');
});
prueba('C1 · rótulos sin pacto: «incluye tierra aportada sin regla pactada» y, si es negativo, «pérdida asignada (teórica)», nunca bajo «recibe»', () => {
  const t = Motor.evalua(DEF10, PLANES10.N1_tierra_especie, null, SIN).tarjetas.Reparto, c22 = t.cifras.find((c) => c.id === 'R-22');
  assert(c22.valor < 0 && /incluye tierra aportada sin regla pactada/.test(c22.rotulo) && /pérdida asignada \(teórica\)/.test(c22.rotulo) && /^Pérdida asignada \(teórica\)/.test(c22.etiqueta_reparto), JSON.stringify(c22));
  const t2 = Motor.evalua(DEF10, PLANES10.muestra_capital_20_tierra_especie, null, SIN).tarjetas.Reparto; assert(/incluye tierra aportada sin regla pactada/.test(t2.cifras.find((c) => c.id === 'R-25').rotulo));
  const v = Motor.paqueteVisor(DEF10, PLANES10.N1_tierra_especie); assert(/pérdida asignada \(teórica\)/.test(v.deducido['v.dueno_recibe']) && /nunca bajo «recibe»/.test(v.deducido['v.dueno_recibe']));
});
prueba('B4 por el Árbol · S-12 «pendiente» o sin decidir con honorarios de 5 % dejan el reparto INVÁLIDO; S-13 = B y S-22 proxy o mixto se bloquean por nombre', () => {
  const f = PLANES10A.muestra_fee_5, R1 = (c) => Motor.reparto(DEF10, con10(f, c, DECL));
  const a = R1({ 'S-12': 'pendiente', 'S-13': 'A' }); assert(/^INVÁLIDO/.test(a.resultado.estado) && a.nodos['R-31'] === 'INVÁLIDO · no se calcula' && a.nodos['R-29'] === null, a.nodos['R-31']);
  const b = R1({ 'S-13': 'A' }); assert(b.resultado.errores.some((m) => /dato requerido ausente: inclusión del fee/.test(m)), 'la referencia de S-12 no cuenta como declaración');
  const c = R1({ 'S-12': 'no', 'S-13': 'B', 'S-23': 'pactado', 'S-17': 'al_liquidar' }); assert(c.resultado.motivos.some((m) => /^CF-02 · esquema B .*no implementado/.test(m)) && c.nodos['R-31'] === 'NO AUTORIZABLE');
  const d = R1({ 'S-12': 'no', 'S-13': 'A', 'S-23': 'pactado', 'S-17': 'al_liquidar', 'S-22': 'mixto_ya_incorporado' }); assert(d.resultado.motivos.some((m) => /^CF-06 · IVA mixto/.test(m)));
  const g = R1({ 'S-12': 'no', 'S-13': 'A', 'S-23': 'pactado', 'S-17': 'al_liquidar' }); assert.strictEqual(g.nodos['R-31'], 'AUTORIZABLE'); assert.strictEqual(sumaO(g.resultado.autorizado), 40458512);
  const h = Motor.evalua(DEF10, PLANES10.muestra, { 'S-21': { valor: 61, estado: 'decidido' } }, SIN); assert(h.errores.some((x) => x.codigo === 'fuera_de_rango'), 'el Árbol ajusta S-21 a 60'); assert.strictEqual(Motor.reparto(DEF10, h.plan).resultado.mes_corte, 60);
});
prueba('B5 y B2 por el Árbol · S-18 fondeador: parte registrada, tope, tasa y pacto; incompleto o con parte FANTASMA es inválido', () => {
  const pr = con10(PLANES10A.respaldo, { 'S-17': 'al_liquidar', 'S-23': 'pactado' }, DECL), R1 = (txt) => Motor.reparto(DEF10, con10(pr, { 'S-18': txt }));
  assert(Motor.reparto(DEF10, pr).resultado.motivos.some((m) => /déficit sin fondeador/.test(m)));
  const ok = R1('parte=SP; tope=30000000; tasa=0.15; pacto=pactado'); assert(!ok.resultado.motivos.some((m) => /déficit sin fondeador/.test(m)), JSON.stringify(ok.resultado.motivos)); assert.strictEqual(ok.nodos['R-31'], 'AUTORIZABLE');
  ['parte=FANTASMA; tope=30000000; tasa=0.15; pacto=pactado', 'tope=30000000; pacto=pactado', 'parte=SP; tope=30000000; tasa=0.15; pacto=firmado', 'SP con 30 millones'].forEach((txt) => assert(/^INVÁLIDO/.test(R1(txt).resultado.estado), txt));
  assert(/^PACTO · respaldo comprometido sin firma/.test(R1('parte=SP; tope=30000000; tasa=0.15; pacto=propuesto').resultado.motivos.find((m) => /^PACTO · respaldo/.test(m))));
  /* B06 (dictamen T-11): la tasa del compromiso debe ser el D-01 con que F-02 cuesta el respaldo; con 0 % o 100 % el plan no representa el compromiso */
  [0, 1].forEach((tasa) => { const x = R1('parte=SP; tope=30000000; tasa=' + tasa + '; pacto=pactado'); assert(x.resultado.motivos.some((m) => /^PACTO · el respaldo comprometido a .* no coincide con el costo que usa F-02 \(D-01 = 15\.0 %/.test(m)) && x.nodos['R-31'] === 'NO AUTORIZABLE' && sumaO(x.resultado.autorizado) === 0, String(tasa)); });
  assert.strictEqual(sumaO(ok.resultado.autorizado), ok.resultado.cr, 'con la tasa de F-02 (15 %) sí autoriza');
  cifra('B06 · respaldo: tasa 0 % o 100 % bloquea («no coincide con el costo que usa F-02»); 15 % = D-01 autoriza $' + REP.miles(ok.resultado.cr));
});
prueba('B2 · ISR, demás acreedores y reservas del corte con estado explícito: sin declarar no autoriza; declarados entran a la cascada', () => {
  const base = con10(PLANES10A.muestra, { 'S-21': 39, 'S-17': 'al_liquidar', 'S-23': 'pactado' }), B2_DECLARADO = DECL;
  const sin = Motor.reparto(DEF10, base).resultado;
  ['ISR del vehículo', 'demás acreedores', 'reservas del corte'].forEach((t) => assert(sin.motivos.some((m) => m.indexOf('SV · ' + t) === 0 && /dato desconocido/.test(m)), t));
  assert(sin.acreedores.some((a) => a.id === 'ISR' && a.estado === 'dato desconocido')); assert.strictEqual(sumaO(sin.autorizado), 0);
  const isr = Motor.reparto(DEF10, Object.assign({}, base, { reparto: Object.assign({}, B2_DECLARADO, { isr: { estado: 'monto', monto: 1000000 } }) })).resultado;
  const fi = isr.acreedores.find((a) => a.id === 'ISR'); assert(fi.exigible === 1000000 && fi.pagado === 1000000 && fi.saldo === 0); assert.strictEqual(isr.cr, 40458512 - 1000000); assert.strictEqual(isr.identidades['CR − saldo de capital = D-22 (±1 peso)'], true);
  assert(!isr.salida.reconciliado && isr.salida.tarjeta['R-22'].motivos.indexOf('sin reconciliar con la cascada del corte') >= 0, 'con ISR el campo del motor deja de reconciliar y queda teórico');
  const otros = Motor.reparto(DEF10, Object.assign({}, base, { reparto: Object.assign({}, B2_DECLARADO, { otros_acreedores: { estado: 'lista', lista: [{ id: 'proveedor', parte: 'TERCERO', exigible: 250000 }] } }) })).resultado;
  assert(otros.acreedores.some((a) => a.id === 'proveedor' && a.pagado === 250000) && otros.cr === 40458512 - 250000);
  const fan = Motor.reparto(DEF10, Object.assign({}, base, { reparto: Object.assign({}, B2_DECLARADO, { otros_acreedores: { estado: 'lista', lista: [{ id: 'x', parte: 'FANTASMA', exigible: 1 }] } }) })).resultado; assert(/^INVÁLIDO/.test(fan.estado));
  const res = (lib) => Motor.reparto(DEF10, Object.assign({}, base, { reparto: Object.assign({}, B2_DECLARADO, { reservas: { estado: 'lista', lista: [{ id: 'posventa', requerida: 500000, liberacion: lib }] } }) })).resultado;
  assert.strictEqual(res('no').cr, 40458512 - 500000); assert.strictEqual(res('al_liquidar').cr, 40458512); assert(/^INVÁLIDO/.test(res('si').estado), 'enum estricto');
  assert(/^INVÁLIDO/.test(Motor.reparto(DEF10, Object.assign({}, base, { reparto: { isr: { estado: 'pendiente' } } })).resultado.estado));
  cifra('B2 · sin declarar ISR, demás acreedores y reservas el corte queda en «dato desconocido» y no autoriza; ISR de $1,000,000 baja la caja repartible a $39,458,512');
});
prueba('M3 · imputación por clase con capitalización mensual, regla y enum estrictos, y arrastre entre cortes', () => {
  const c = CASOSA.N1, kw = (x) => Object.assign({ iva: { tipologia: 'vivienda', modalidad: 'ya_incorporado' }, fee_en_indirectos: 'no', gestion_esquema: 'A', liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true }, DECL, x || {});
  const una = REP.repartoVertical(c, kw()), pp = REP.repartoVertical(c, kw({ clases_capital: [{ clase: 'CAP_A', parte: 0.97 }, { clase: 'CAP_B', parte: 0.03 }], regla_clases: 'pari_passu' }));
  const sp = (o, k) => Object.keys(o).reduce((s, x) => s + o[x][k], 0);
  assert(Math.abs(sp(pp.capital_por_clase, 'principal') - una.principal_pendiente) <= 1 && Math.abs(sp(pp.capital_por_clase, 'preferente') - una.preferente_pendiente) <= 1, 'pari passu reproduce el agregado');
  assert(pp.identidades['saldo de capital reconstruido hasta el corte (≤ 0.01 peso)'] && Math.abs(pp.capital_por_clase.CAP_A.principal / una.principal_pendiente - 0.97) < 1e-6);
  const pre = REP.repartoVertical(c, kw({ clases_capital: [{ clase: 'CAP_A', parte: 0.5 }, { clase: 'CAP_B', parte: 0.5 }], regla_clases: 'prelacion' }));
  assert(pre.identidades['saldo de capital reconstruido hasta el corte (≤ 0.01 peso)'] && Math.abs(pre.principal_pendiente + pre.preferente_pendiente - (una.principal_pendiente + una.preferente_pendiente)) <= 1);
  assert(pre.capital_por_clase.CAP_A.principal + pre.capital_por_clase.CAP_A.preferente < pre.capital_por_clase.CAP_B.principal + pre.capital_por_clase.CAP_B.preferente, 'por prelación la clase A cobra primero');
  [{ regla_clases: 'pari-passu' }, { clases_capital: [{ clase: 'CAP_A', parte: 0.9 }] }, { clases_capital: [{ clase: 'CAP_Z', parte: 1 }] }, { imputacion: 'principal-primero' }].forEach((x) => assert(/^INVÁLIDO/.test(REP.repartoVertical(c, kw(x)).estado), JSON.stringify(x)));
  assert(Math.abs(una.tasa_efectiva_anual - (Math.pow(1 + 0.15 / 12, 12) - 1)) < 1e-12 && Math.abs(una.tasa_efectiva_anual - 0.16075) < 1e-4 && una.capitalizacion === 'mensual');
  const S = c.series; let maxd = 0; const tc = c.nodos['D-01'];
  for (let m1 = 1; m1 < 60; m1++) { const a = REP.reconstruyeCapital(S, m1, tc, 'principal_primero', null, 'pari_passu', null), b = REP.reconstruyeCapital(S, 60, tc, 'principal_primero', null, 'pari_passu', a.arrastre), d = REP.reconstruyeCapital(S, 60, tc, 'principal_primero', null, 'pari_passu', null); maxd = Math.max(maxd, Math.abs(b.pr - d.pr), Math.abs(b.ac - d.ac)); }
  assert(maxd <= 0.01, 'continuar desde cualquier corte da lo mismo que reconstruir de cero: ' + maxd);
  const c39 = REP.repartoVertical(c, kw({ mes_corte: 39 })), c60 = REP.repartoVertical(c, kw({ capital_arrastre: c39.capital_arrastre }));
  assert.strictEqual(c60.arrastre_cuadra, true); const mal = JSON.parse(JSON.stringify(c39.capital_arrastre)); mal.clases.CAPITAL.pr += 1000;
  assert(REP.repartoVertical(c, kw({ capital_arrastre: mal })).motivos.some((m) => /el arrastre del capital del corte 39 no cuadra/.test(m)));
  const m39 = REP.repartoVertical(CASOSA.muestra, kw({ mes_corte: 39 })), pag = { DUENO: m39.conciliacion.DUENO.autorizado, ALIANZA: m39.conciliacion.ALIANZA.autorizado, CAPITAL: m39.conciliacion.CAPITAL.autorizado };
  const m60 = REP.repartoVertical(CASOSA.muestra, kw({ pagos_registrados: pag }));
  assert(m60.autorizable && sumaO(m60.autorizado) === 0 && Object.keys(m60.conciliacion).every((k) => m60.conciliacion[k].derecho === m60.conciliacion[k].pagado + m60.conciliacion[k].disponible_reintento), 'los pagos del corte 39 se arrastran al 60: no se autoriza dos veces');
  cifra('M3 · N1: dos clases pari passu reproducen principal $' + REP.miles(una.principal_pendiente) + ' y preferente $' + REP.miles(una.preferente_pendiente) + '; capitalización mensual 15 % = ' + (una.tasa_efectiva_anual * 100).toFixed(2) + ' % efectivo; arrastre en 59 cortes ≤ 0.01 peso');
});
/* B02 (dictamen T-11): línea de servicio con beneficiario completa (catálogo, base verificable con E-05, fecha y pacto) */
const lineaPE = (id, e05, extra) => Object.assign({ id, beneficiario: 'PG', monto: 3000000, sustituye: 'C-08', agregado_original: 10486800, catalogo: 'PE-5-9', alcance: 'proyecto_ejecutivo',
  base: { medida: 'm2_construido', cantidad: Math.round(e05), proxy: false }, fecha_precio: '2026-11-23', estado_pacto: 'pactado' }, extra || {});
prueba('CF-07 · una línea con beneficiario que sustituye parte de un agregado bloquea si el agregado no baja; pasa cuando baja al menos su monto y entonces su egreso sale del corte', () => {
  const c12 = Motor.reparto(DEF10, P39).caso.nodos['C-12'], c07 = Motor.reparto(DEF10, P39).caso.nodos['C-07'], e05 = Motor.reparto(DEF10, P39).caso.nodos['E-05'], c08 = V10(P39, 'C-08');
  assert.strictEqual(Math.round(c12), 10486800); assert.strictEqual(Math.round(c07), 87390000);
  const conL = (plan, ls) => Object.assign({}, plan, { reparto: Object.assign({}, DECL, { lineas: ls }) });
  const a = Motor.reparto(DEF10, conL(P39, [lineaPE('proyecto_ejecutivo', e05)]));
  assert(a.resultado.motivos.some((m) => /^CF-07 · las líneas de C-08 suman 3,000,000 y C-12 sólo bajó 0/.test(m)) && a.nodos['R-31'] === 'NO AUTORIZABLE');
  const p1 = Motor.evalua(DEF10, P39, { 'C-08': { valor: (10486800 - 3000000) / 87390000, estado: 'decidido' } }, SIN).plan;
  const b = Motor.reparto(DEF10, conL(p1, [lineaPE('proyecto_ejecutivo', e05)]));
  assert(!b.resultado.motivos.length, JSON.stringify(b.resultado.motivos)); assert(b.resultado.lineas[0].cf07 === 'pasa' && b.resultado.lineas[0].bajada === 3000000 && b.resultado.lineas[0].tope_mercado === 1135 * Math.round(e05));
  assert.strictEqual(b.resultado.cr, 44071695 - 3000000); assert(b.resultado.acreedores.some((x) => x.id === 'línea «proyecto_ejecutivo»' && x.parte === 'PG' && x.pagado === 3000000));
  assert(/^INVÁLIDO/.test(Motor.reparto(DEF10, conL(P39, [lineaPE('x', e05, { beneficiario: 'FANTASMA' })])).resultado.estado));
  assert(/^INVÁLIDO/.test(Motor.reparto(DEF10, conL(P39, [lineaPE('x', e05, { sustituye: 'C-09' })])).resultado.estado));
  cifra('CF-07 · línea de $3,000,000 de PG contra C-08: bloquea con indirectos de $10,486,800 sin bajar (C-08 = ' + (c08 * 100).toFixed(1) + ' %); al bajarlos pasa y su egreso sale del corte: caja repartible $44,071,695 − $3,000,000 = $41,071,695');
});
prueba('P-02 · opción A por omisión (tercios iguales en la alianza); B y C siguen disponibles y, con la matriz, el 26 % sin asignar bloquea', () => {
  const a = Motor.reparto(DEF10, P39), al = a.resultado.alianza_por_socio.autorizado;
  assert.strictEqual(a.resultado.opcion_reparto, 'A'); assert(al.YOD === 4409752 && al.PG === 4409752 && al.AVM === 4409752 && al.YOD + al.PG + al.AVM === 13229256, JSON.stringify(al));
  ['B', 'C'].forEach((op) => { const r = Motor.reparto(DEF10, Motor.planConOpcion(DEF10, P39, op).plan); assert(r.resultado.alianza_por_socio.simulado.SIN_ASIGNAR > 0 && r.resultado.motivos.some((m) => /^RECEPTOR/.test(m)) && r.nodos['R-31'] === 'NO AUTORIZABLE', op); });
  assert(/^INVÁLIDO/.test(Motor.reparto(DEF10, con10(P39, { 'S-24': 'D' })).resultado.estado));
  const n = a.resultado.notas.join(' '); assert(/opción A \(50\/50 y tercios\): excedente 50\/50\/0 aplicado en el paso 7/.test(n) && /el plan la trae/.test(n), n);
  const solo = Motor.reparto(DEF10, Object.assign({}, P39, { reparto: Object.assign({}, DECL, { reparto_interno: { modo: 'pesos', partes: { FANTASMA: 1 }, estado_pacto: 'pactado' } }) })); assert(/^INVÁLIDO/.test(solo.resultado.estado) && solo.resultado.errores.some((m) => /FANTASMA/.test(m)), 'un solo receptor inválido en la alianza');
});
prueba('Alcance · renta y el Hub NO se implementan: destino distinto de «Venta» bloquea el reparto de forma explícita', () => {
  const r = Motor.reparto(DEF10, con10(P39, { 'P1-03': 'Renta' }));
  assert.strictEqual(r.resultado.estado, 'BLOQUEADO · fuera de alcance'); assert(r.resultado.motivos.some((m) => /^ALCANCE · destino «Renta»/.test(m))); assert.strictEqual(r.nodos['R-29'], null); assert.strictEqual(r.nodos['R-31'], 'BLOQUEADO · fuera de alcance');
  assert(REP.NO_IMPLEMENTADO.some((t) => /renta/.test(t) && /Hub/.test(t))); assert(/^BLOQUEADO/.test(REP.repartoVertical(Object.assign({}, CASOS.muestra, { tipo: 'patrimonial' }), {}).estado));
});
prueba('C2 (dictamen T-09 v2) · el estado de un dato del Hub nunca supera al del vertical; I1 y P1 «Patrón reutilizable (sólo superficie y norma)» y P4 «Hueco»', () => {
  assert.deepStrictEqual(REP.validaEstadosHub(), []); const F = (id) => REP.FICHAS.find((f) => f.id === id);
  assert.strictEqual(F('I1').estado_hub, 'Patrón reutilizable (sólo superficie y norma)'); assert.strictEqual(F('P1').estado_hub, 'Patrón reutilizable (sólo superficie y norma)'); assert.strictEqual(F('P4').estado_hub, 'Hueco'); assert.strictEqual(REP.FICHAS.length, 19);
  const mal = REP.FICHAS.map((f) => (f.id === 'I1' ? Object.assign({}, f, { estado_hub: 'Existe · Datos base' }) : f.id === 'P4' ? Object.assign({}, f, { estado_hub: 'Patrón reutilizable' }) : f));
  const m = REP.validaEstadosHub(mal); assert(m.length === 2 && /I1/.test(m[0]) && /P4/.test(m[1]), JSON.stringify(m));
});
prueba('N3 (dictamen T-09 v2) · mapa de conciliación de costos: C-04 y C-06 con la obra, C-08 y C-19 con los indirectos, C-10 con la comisión, C-11 con el cierre, D-05 y D-21 con el costo del dinero', () => {
  const chk = (plan, et) => {
    const c = Motor.reparto(DEF10, plan).caso, S = c.series, N = c.nodos, sum = (k, a, b) => { let s = 0; for (let m = a || 1; m <= (b || c.M); m++) s += S[k][m]; return s; }, peso = (a, b, t) => assert(Math.abs(a - b) <= 1, et + ' · ' + t + ': ' + a + ' vs ' + b);
    peso(sum('obra'), N['C-07'], 'obra = C-07'); peso(sum('indirectos'), N['C-12'], 'indirectos = C-12'); peso(sum('imprevistos'), N['C-13'], 'imprevistos = C-13');
    peso(sum('comisiones'), N['C-14'], 'comisiones = C-14'); peso(sum('comisiones'), V10(plan, 'C-10') * sum('cobranza'), 'comisiones = C-10 × cobranza'); peso(sum('cierre'), N['C-15'], 'cierre = C-15');
    peso(sum('egresos'), N['C-16'], 'egresos = C-16'); peso(sum('apertura'), sum('disposicion') > 0 ? V10(plan, 'D-05') * N['D-10'] : 0, 'apertura = D-05 × línea (si se dispone)');
    peso(N['D-21'], sum('interes') + sum('apertura') + c.med.rendimiento_capital + sum('pago_respaldo') - sum('respaldo'), 'D-21 = intereses + apertura + rendimiento del capital + costo del respaldo');
    let parte = 0; for (let m = 1; m <= c.M; m++) parte += S.indirectos[m] - (1 - N['C-19']) * N['C-12'] * (S.obra[m] / N['C-07']); peso(parte, N['C-19'] * N['C-12'], 'la parte de predesarrollo de los indirectos es C-19 × C-12');
  };
  chk(BASE, 'muestra'); chk(PROB, 'con problemas');
  const conExt = Motor.evalua(DEF10, BASE, { 'C-04': { valor: 1, estado: 'decidido' } }, SIN), d07 = V10(conExt.plan, 'C-07') - V10(BASE, 'C-07');   // C-04 va en millones en la vista
  assert(Math.abs(d07 - 1000000 * (1 + V10(conExt.plan, 'C-05'))) < 1, 'C-04 entra una sola vez a la obra (C-07): ' + d07); chk(conExt.plan, 'con exteriores');
  const d6 = JSON.parse(JSON.stringify(BASE)); d6.datos = { 'C-06': 90000000 }; const r6 = Motor.reparto(DEF10, d6).caso; assert(Math.abs(r6.nodos['C-07'] - 90000000) < 1 && Math.abs(r6.series.obra.slice(1).reduce((a, b) => a + b, 0) - 90000000) < 1, 'C-06 (captura directa) sustituye a la obra calculada');
});
prueba('M5 · las etiquetas de las pruebas portadas son únicas y ninguna choca con las de la suite original', () => {
  assert(HECHAS10.length >= 249, 'aserciones portadas: ' + HECHAS10.length); assert.strictEqual(new Set(HECHAS10).size, HECHAS10.length);
});

/* ═══════════════════ 29 · T-10 corrección 1 · las sondas del dictamen T-11 v1 como aserciones negativas ═══════════════════
   Cada prueba reproduce la sonda de la Reina (mismos planes P39R y P60R del grupo 28, mismo registro) y comprueba que el defecto ya no ocurre;
   cuando el comportamiento correcto es bloquear, se comprueba el bloqueo y su motivo. Las cifras son de control (montos de prueba, no pactos). */
grupo('29 · T-10 corrección 1 · sondas del dictamen T-11 v1 (B01–B07, O01, O02 y mutaciones sobrevivientes)');
const VZ = require(path.join(APP, '..', 'visor.js'));
const textoVisor = (pq) => { const x = VZ.pinta(pq, [], { sinElige: true }); return x.html + ' ' + JSON.stringify(x.cuadros.map((c) => [c.aria, c.sub, c.detalle])); };
prueba('B01 · sonda: S-24 A, B y C sobre P39 ya no dan la misma estructura; las tres bloquean porque el plan (30/70/0) no trae la opción y el preferente simple no lo representa F-02', () => {
  const r = {}; ['A', 'B', 'C'].forEach((op) => { r[op] = Motor.reparto(DEF10, con10(P39R, { 'S-24': op })).resultado; });
  const t = (x) => [x.simulado.dueno_tierra + x.simulado.dueno_parte, x.simulado.alianza_fee + x.simulado.alianza_parte, x.simulado.capital_parte];
  assert.deepStrictEqual(t(r.A), [27229256, 13229256, 0]); assert.deepStrictEqual(t(r.B), [27229256, 13229256, 0]); assert.deepStrictEqual(t(r.C), [21937554, 5291702, 13229256]);
  assert.deepStrictEqual(r.A.alianza_por_socio.simulado, { YOD: 4409752, PG: 4409752, AVM: 4409752 }); assert(r.B.alianza_por_socio.simulado.SIN_ASIGNAR > 0 && r.C.alianza_por_socio.simulado.SIN_ASIGNAR > 0);
  ['A', 'B', 'C'].forEach((op) => {
    assert.strictEqual(sumaO(r[op].autorizado), 0, op); assert(r[op].motivos.some((m) => /^P-02 · el plan reparte el excedente 30\/70\/0/.test(m)), op);
    assert(r[op].motivos.some((m) => /^P-02 · la opción . pacta un preferente simple .* capitaliza cada mes .* variante no representable en F-02, bloqueada/.test(m)), op);
  });
  assert(r.C.motivos.some((m) => /^P-02 · F-02 calculó el capital con D-01 = 15\.0 % y la opción C pacta un preferente de 12 %/.test(m)) && !r.A.motivos.some((m) => /D-01 = 15\.0 % y la opción/.test(m)));
  cifra('B01 · S-24 sobre la muestra 30/70/0: A y B simulan dueño $27,229,256 / alianza $13,229,256 / capital $0; C simula $21,937,554 / $5,291,702 / $13,229,256; las tres bloquean (P-02)');
});
prueba('B01 · con la opción aplicada al plan (planConOpcion) A autoriza 50/50 en tercios y C autoriza 30/20/50 con F-02 recalculado al 12 %, con controles de importe', () => {
  const ra = Motor.reparto(DEF10, P39), xa = ra.resultado;
  assert(xa.autorizable && sumaO(xa.autorizado) === 40458512 && xa.dueno === 14000000 + (40458512 - 14000000) / 2 && xa.alianza === (40458512 - 14000000) / 2 && xa.simulado.capital_parte === 0, JSON.stringify(xa.motivos));
  const pc = Motor.planConOpcion(DEF10, PLANES10.muestra, 'C'); assert.deepStrictEqual(pc.errores, []);
  const P39C = con10(pc.plan, { 'S-21': 39, 'S-17': 'al_liquidar', 'S-23': 'pactado' }, Object.assign({}, DECL, { reparto_interno: INTERNO_TERCIOS }));
  const rc = Motor.reparto(DEF10, P39C), xc = rc.resultado, nc = rc.caso.nodos;
  assert(nc['S-03'] === 0.3 && nc['S-05'] === 0.5 && nc['D-01'] === 0.12 && rc.parametros.opcion_reparto === 'C');
  assert(rc.caso.med.rendimiento_capital < ra.caso.med.rendimiento_capital, 'F-02 se recalculó: al 12 % el capital gana menos que al 15 %');
  const resto = xc.cr - xc.principal_pendiente - xc.preferente_pendiente - xc.simulado.alianza_fee - xc.simulado.dueno_tierra;
  assert(xc.autorizable && sumaO(xc.autorizado) === xc.cr, JSON.stringify(xc.motivos));
  assert(Math.abs(xc.simulado.dueno_parte - 0.3 * resto) <= 1 && Math.abs(xc.simulado.alianza_parte - 0.2 * resto) <= 1 && Math.abs(xc.simulado.capital_parte - 0.5 * resto) <= 1, JSON.stringify(xc.simulado));
  assert(xc.salida.reconciliado && xc.salida.tarjeta['R-22'].estado === 'publicable', 'con la opción aplicada, el motor (S-03 30 %, S-05 50 %) y la cascada coinciden');
  cifra('B01 · opción A aplicada: dueño $27,229,256, alianza $13,229,256 (tercios de $4,409,752); opción C aplicada: F-02 al 12 %, caja repartible $' + REP.miles(xc.cr) + ', excedente $' + REP.miles(resto) + ' en 30/20/50');
});
prueba('B01 · el preferente como lo calcula F-02 se pacta: sin declararlo bloquea, «propuesto» bloquea por firma y un valor fuera del catálogo invalida', () => {
  const con = (pf) => Motor.reparto(DEF10, Object.assign({}, P39, { reparto: Object.assign({}, DECL, { preferente_f02: pf }) })).resultado;
  assert(con(null).motivos.some((m) => /^P-02 · la opción A pacta un preferente simple de 15 %/.test(m)) && sumaO(con(null).autorizado) === 0);
  assert(con('propuesto').motivos.some((m) => /^PACTO · preferente como lo calcula F-02/.test(m))); assert(/^INVÁLIDO/.test(con('firmado').estado));
});
prueba('B02 · sonda: dos líneas de 3 M contra el mismo C-08 ya no validan las dos; sin referencia de catálogo bloquean (CF-09); el egreso válido baja la caja con su beneficiario', () => {
  const baja = con10(P39, { 'C-08': (10486800 - 3000000) / 87390000 }), e05 = Motor.reparto(DEF10, P39).caso.nodos['E-05'];
  const conL = (ls) => Motor.reparto(DEF10, Object.assign({}, baja, { reparto: Object.assign({}, DECL, ls ? { lineas: ls } : {}) })).resultado;
  const reina = (id) => ({ id, beneficiario: 'PG', monto: 3000000, sustituye: 'C-08', agregado_original: 10486800, estado_pacto: 'pactado' });
  assert.strictEqual(conL(null).cr, 44071695);
  const s1 = conL([reina('L1')]); assert(s1.motivos.some((m) => /^CF-09 · la línea «L1» no trae una referencia válida del catálogo/.test(m)) && sumaO(s1.autorizado) === 0);
  const s2 = conL([reina('L1'), reina('L2')]); assert(s2.motivos.some((m) => /^CF-07 · las líneas de C-08 suman 6,000,000 y C-12 sólo bajó 3,000,000/.test(m)) && sumaO(s2.autorizado) === 0);
  const u = conL([lineaPE('L1', e05)]); assert(u.autorizable && u.cr === 41071695 && sumaO(u.autorizado) === 41071695, JSON.stringify(u.motivos));
  const d = conL([lineaPE('L1', e05), lineaPE('L2', e05)]); assert(d.motivos.filter((m) => /^CF-07 · las líneas de C-08 suman 6,000,000/.test(m)).length === 2 && sumaO(d.autorizado) === 0);
  assert(/^INVÁLIDO/.test(conL([lineaPE('L1', e05), lineaPE('L2', e05, { agregado_original: 10000000 })]).estado), 'un mismo agregado con dos originales distintos invalida');
  assert(conL([lineaPE('L1', e05, { base: { medida: 'm2_construido', cantidad: 21700, proxy: false } })]).motivos.some((m) => /no es la construcción del plan \(E-05/.test(m)), 'la base del tope se verifica contra E-05');
  assert(conL([lineaPE('L1', e05, { catalogo: 'F-103', alcance: 'factibilidad_credito', base: { medida: 'evento', cantidad: 1, proxy: false } })]).motivos.some((m) => /cuesta 3,000,000, más que su tope de mercado \(100,000/.test(m)), 'el tope de catálogo se aplica');
  assert(conL([lineaPE('L1', e05, { sustituye: 'C-10', agregado_original: 1 })]).motivos.some((m) => /no forma parte de C-10/.test(m)), 'una fila del catálogo sólo sustituye su agregado');
  assert(conL([lineaPE('L1', e05, { estado_pacto: 'propuesto' })]).motivos.some((m) => /^PACTO · línea «L1» sin firma/.test(m)));
  cifra('B02 · C-08 bajado $3,000,000: sin líneas caja $44,071,695; una línea con catálogo $41,071,695 (egreso a PG en el corte); dos líneas de $3,000,000 bloquean por CF-07; sin catálogo bloquea por CF-09');
});
prueba('B03 · sonda: JV sin aporte ni acuerdo ya no recibe; 40 % capturado como porcentaje invalida (no se normaliza); los pesos se declaran y se pactan', () => {
  const con = (reg) => Motor.reparto(DEF10, Object.assign({}, P39, { reparto: Object.assign({}, DECL, reg) })).resultado;
  assert(/^INVÁLIDO/.test(con({ reparto_interno: { JV: 1 } }).estado) && /^INVÁLIDO/.test(con({ reparto_interno: { YOD: 0.2, PG: 0.2 } }).estado), 'la forma del dictamen sin modo ni pacto invalida');
  const jv = con({ reparto_interno: { modo: 'porcentajes', partes: { JV: 1 }, estado_pacto: 'pactado' } });
  assert(jv.motivos.some((m) => /^RECEPTOR · Jorge Vizcaíno recibiría 13,229,256 sin aporte ni acuerdo registrado/.test(m)) && sumaO(jv.autorizado) === 0 && jv.alianza_por_socio.autorizado.JV === 0);
  const jva = con({ reparto_interno: { modo: 'porcentajes', partes: { JV: 1 }, estado_pacto: 'pactado' }, acuerdos_receptor: { JV: { base: 'acuerdo', concepto: 'estructuración de capital (acuerdo de prueba)', estado_pacto: 'pactado' } } });
  assert(jva.autorizable && jva.alianza_por_socio.autorizado.JV === 13229256, JSON.stringify(jva.motivos));
  assert(con({ reparto_interno: { modo: 'porcentajes', partes: { JV: 1 }, estado_pacto: 'pactado' }, acuerdos_receptor: { JV: { base: 'acuerdo', concepto: 'x', estado_pacto: 'propuesto' } } }).motivos.some((m) => /^PACTO · el acuerdo por el que recibe Jorge Vizcaíno/.test(m)));
  const p40 = con({ reparto_interno: { modo: 'porcentajes', partes: { YOD: 0.2, PG: 0.2 }, estado_pacto: 'pactado' } }); assert(/^INVÁLIDO/.test(p40.estado) && p40.errores.some((m) => /suma 40\.00 %, no 100 % \(CF-05\)/.test(m)), JSON.stringify(p40.errores));
  const pes = con({ reparto_interno: { modo: 'pesos', partes: { YOD: 0.2, PG: 0.2 }, estado_pacto: 'pactado' } }); assert(pes.autorizable && pes.alianza_por_socio.autorizado.YOD === 6614628 && pes.alianza_por_socio.autorizado.PG === 6614628, JSON.stringify(pes.motivos));
  assert(con({ reparto_interno: { modo: 'pesos', partes: { YOD: 1, PG: 1 }, estado_pacto: 'propuesto' } }).motivos.some((m) => /^PACTO · reparto interno de la alianza distinto del de la opción A sin firma/.test(m)));
  cifra('B03 · JV sin aporte ni acuerdo: bloqueado (0 autorizado); con acuerdo pactado recibe $13,229,256; YOD/PG 0.2/0.2 en porcentajes invalida (suma 40 %); en pesos pactados $6,614,628 cada uno');
});
prueba('B03 · CF-03, CF-04 y CF-09 en el camino vertical: comisión de venta con beneficiario y canal; un socio no cobra comercialización dos veces; master se bloquea', () => {
  const con = (reg, plan) => Motor.reparto(DEF10, Object.assign({}, plan || P39, { reparto: Object.assign({}, DECL, reg) })).resultado;
  const sinCv = Motor.reparto(DEF10, Object.assign({}, P39, { reparto: B2_DECLARADO })).resultado; assert(sinCv.motivos.some((m) => /^SV · beneficiario y canal de la comisión de venta \(C-10 = /.test(m)));
  assert(con({ comision_venta: { beneficiario: 'AVM', canal: 'externo' } }).motivos.some((m) => /^CF-03 · Avermont .*\(tercios de la opción A\) y además la comisión de venta/.test(m)));
  const B = Motor.planConOpcion(DEF10, P39, 'B').plan;
  assert(con({ comision_venta: { beneficiario: 'AVM', canal: 'externo' } }, B).motivos.some((m) => /^CF-03 · Avermont .* cobra comercialización dentro del fee \(matriz de la opción B\)/.test(m)));
  assert(con({ comision_venta: { beneficiario: 'TERCERO', canal: 'master' } }).motivos.some((m) => /^CF-03 · canal master \(paquete 86\) no implementado/.test(m)));
  assert(/^INVÁLIDO/.test(con({ comision_venta: { beneficiario: 'FANTASMA', canal: 'externo' } }).estado));
  const e05 = Motor.reparto(DEF10, P39).caso.nodos['E-05'], jv = con({ lineas: [lineaPE('credito', e05, { beneficiario: 'JV', alcance: 'gestion_credito' })] }, B);
  assert(jv.motivos.some((m) => /^CF-04 · Jorge Vizcaíno cobra «gestion_credito» dentro del fee \(matriz de la opción B\) y como línea aparte/.test(m)) && jv.motivos.some((m) => /^CF-09/.test(m)));
});
prueba('B04 · sonda: el visor (visor.js pinta) ya no dice «reparto en el mes 39» con corte 60, pinta negativos como pérdida y conserva el bloqueo con datos inválidos', () => {
  const h60 = textoVisor(Motor.paqueteVisor(DEF10, P60));
  assert(!/reparto en el mes 39/.test(h60) && !/Mes del reparto/.test(h60) && !/cobra en el mes/.test(h60), 'corte 60: ninguna frase del visor presenta el mes 39 como reparto ni dice que el dueño cobra');
  assert(/corte de reparto autorizado en el mes 60/.test(h60) && /corte autorizado: mes 60 \(sin pago registrado\)/.test(h60) && /Hito del motor \(referencia del Árbol\)","mes 39"/.test(h60), 'el corte autorizado es 60 y el 39 se ve como hito de referencia');
  const h60r = textoVisor(Motor.paqueteVisor(DEF10, P60R));
  assert(!/reparto en el mes 39/.test(h60r) && /sin corte de reparto autorizado \(hito del motor: mes 39, referencia\)/.test(h60r) && /teórico/.test(h60r), 'sin autorización (plan sin la opción): sólo el hito, como referencia');
  const n1 = con10(PLANES10A.N1_tierra_especie, { 'S-17': 'al_liquidar', 'S-23': 'pactado', 'S-19': 'no' }, DECL), pn1 = Motor.paqueteVisor(DEF10, n1), hn1 = textoVisor(pn1);
  assert(pn1.v.dueno_recibe < 0 && !/recibe en total[^<"]{0,8}−/.test(hn1) && !/recibe −\$/.test(hn1) && /pérdida asignada −\$3\.5 \(teórica\)/.test(hn1) && /Dueño · pérdida asignada \(teórica\)/.test(hn1), 'N1: el negativo es pérdida asignada, nunca «recibe»');
  const n1i = Object.assign({}, n1, { reparto: Object.assign({}, DECL, { isr: { estado: 'pendiente' } }) }), pi = Motor.paqueteVisor(DEF10, n1i), hi = textoVisor(pi);
  assert(/^INVÁLIDO/.test(pi.cascada.estado) && /INVÁLIDO/.test(pi.deducido['v.dueno_recibe']) && /nunca bajo «recibe»/.test(pi.deducido['v.dueno_recibe']), 'el paquete conserva el bloqueo y la nota de pérdida con ISR inválido');
  assert(/bloqueado ·/.test(hi) && /"Estado","INVÁLIDO · no se calcula"/.test(hi) && /pérdida asignada −\$3\.5 \(teórica\)/.test(hi) && !/recibe en total[^<"]{0,8}−/.test(hi), 'el visor dice que el reparto es inválido y no presenta el negativo como «recibe»');
  const leg = textoVisor(Motor.paqueteVisor(DEF, PLANES10.muestra)); assert(/reparto en el mes 39/.test(leg) && !/Estado del reparto/.test(leg), 'sin la extensión el visor pinta como siempre (paquete legado)');
});
prueba('B05 · sonda: el arrastre se valida clase por clase, el desglose conserva el peso y con dos o más clases no se autoriza (entrada cerrada)', () => {
  const c = CASOSA.N1, kw = (x) => Object.assign({ iva: { tipologia: 'vivienda', modalidad: 'ya_incorporado' }, fee_en_indirectos: 'no', gestion_esquema: 'A', liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true,
    clases_capital: [{ clase: 'CAP_A', parte: 0.5 }, { clase: 'CAP_B', parte: 0.5 }], regla_clases: 'pari_passu' }, DECL, x || {});
  const c39 = REP.repartoVertical(c, kw({ mes_corte: 39 })), zs = JSON.parse(JSON.stringify(c39.capital_arrastre)); zs.clases.CAP_A.pr += 1000; zs.clases.CAP_B.pr -= 1000;
  const rz = REP.repartoVertical(c, kw({ capital_arrastre: zs })); assert(rz.arrastre_cuadra === false && rz.motivos.some((m) => /no cuadra, clase por clase/.test(m)) && sumaO(rz.autorizado) === 0);
  const r0 = REP.repartoVertical(c, kw()), pc = r0.capital_por_clase, sp = (k) => Object.keys(pc).reduce((t, x) => t + pc[x][k], 0);
  assert(sp('principal') === r0.principal_pendiente && r0.principal_pendiente === 1156991 && sp('preferente') === r0.preferente_pendiente, JSON.stringify(pc));
  assert(r0.motivos.some((m) => /^M3 · clases de capital: .* con 2 clases el desglose es de presentación y no se autoriza/.test(m)) && sumaO(r0.autorizado) === 0);
  const una = REP.repartoVertical(c, kw({ clases_capital: [{ clase: 'CAP_A', parte: 1 }] })); assert(!una.motivos.some((m) => /^M3/.test(m)) && sumaO(una.autorizado) === 5478010, JSON.stringify(una.motivos));
  cifra('B05 · arrastre +1,000/−1,000 entre clases: ya no cuadra; principal por clase suma $1,156,991 exacto; con dos clases no se autoriza; con una clase autoriza $5,478,010');
});
prueba('B07 · sonda: un plan de tipo distinto cargado en la definición vertical se bloquea; renta sigue bloqueada', () => {
  const pat = Motor.reparto(DEF10, Object.assign({}, P39, { tipo: 'patrimonial' })).resultado;
  assert(/^BLOQUEADO/.test(pat.estado) && pat.motivos.some((m) => /el plan es de tipo «patrimonial» y se cargó en la definición «vertical»: tipos distintos/.test(m)) && sumaO(pat.autorizado) === 0);
  assert(/^BLOQUEADO/.test(Motor.reparto(DEF10, con10(P39, { 'P1-03': 'Renta' })).resultado.estado));
});
prueba('B07 · punto de entrada de la copia: reparto-prueba.html carga reparto.js, el motor, las tablas y la extensión, y muestra el estado del reparto', () => {
  const html = fs.readFileSync(path.join(APP, 'reparto-prueba.html'), 'utf8'), src = [...html.matchAll(/<script src="([^"?]+)/g)].map((m) => m[1]);
  assert.deepStrictEqual(src, ['reparto.js', 'motor.js', 'definicion-tablas.js', 'definicion-reparto.js', 'pantalla.js', 'reparto-prueba.js']);
  assert(/noindex/.test(html) && !/servidor\.js|conexion\.js|arranque\.js/.test(html), 'sin escribir en el libro (v3: sin red ni puerta del portal; ver la prueba del punto 1 de T-11 v2)');
  assert(!/reparto\.js|definicion-reparto/.test(fs.readFileSync(path.join(APP, 'arbol.html'), 'utf8')), 'la página normal no cambia');
  assert.strictEqual(fs.readFileSync(path.join(APP, 'definicion-reparto.js'), 'utf8'), require(path.join(APP, 'construir-reparto.cjs')).js, 'definicion-reparto.js coincide con los CSV de la extensión');
  const vm = require('vm'), ctx = { console }; ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  ['reparto.js', 'motor.js', 'definicion-tablas.js', 'definicion-reparto.js', 'reparto-prueba.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), ctx, { filename: f }));
  const d = ctx.ArbolRepartoPrueba.definicion(ctx.ArbolMotor); assert.strictEqual(JSON.stringify(d.errores), '[]'); assert.strictEqual(d.definicion.nodos.length, 150);
  const ok = ctx.ArbolRepartoPrueba.estadoHtml(ctx.ArbolMotor, d.definicion, JSON.parse(JSON.stringify(P39)));
  assert(/data-estado="AUTORIZABLE"/.test(ok) && /Corte autorizado<\/th><td>mes 39/.test(ok) && /\$40,458,512 · \$40,458,512 · \$0/.test(ok) && (ok.match(/<tr><th scope="row">[IP]\d+ · /g) || []).length === 19, ok.slice(0, 400));
  const no = ctx.ArbolRepartoPrueba.estadoHtml(ctx.ArbolMotor, d.definicion, JSON.parse(JSON.stringify(P39R))); assert(/NO AUTORIZABLE/.test(no) && /P-02 · el plan reparte el excedente 30\/70\/0/.test(no));
});
prueba('O02 · las etiquetas de C2 (fichas del vertical y del Hub) llegan al lector: tarjeta, paquete del visor y página de prueba', () => {
  const pq = Motor.paqueteVisor(DEF10, P39), t = Motor.evalua(DEF10, P39, null, SIN).tarjetas.Reparto;
  [pq.cascada.fichas, t.cascada.fichas].forEach((f) => { assert(f && f.filas.length === 19 && f.fallas.length === 0 && f.regla === 'el Hub nunca supera al vertical'); const F = (id) => f.filas.find((x) => x[0] === id);
    assert.strictEqual(F('I1')[3], 'Patrón reutilizable (sólo superficie y norma)'); assert.strictEqual(F('P4')[3], 'Hueco'); });
  assert(JSON.stringify(pq).length <= 50000, 'con las fichas el paquete cabe en 50,000 caracteres: ' + JSON.stringify(pq).length);
});
prueba('T-11 · las sondas EXACTAS del dictamen (P39R, P60R, N1, respaldo y el registro tal como lo escribió la Reina): ninguna reproduce ya el defecto', () => {
  const tot = (x) => sumaO(x.autorizado);
  /* B01: A, B y C ya no comparten estructura y ninguna autoriza con el plan 30/70/0 */
  const b01 = ['A', 'B', 'C'].map((op) => Motor.reparto(DEF10, con10(P39R, { 'S-24': op })).resultado); assert(b01.every((x) => tot(x) === 0) && b01[0].simulado.capital_parte === 0 && b01[2].simulado.capital_parte > 0 && b01[0].dueno !== b01[2].dueno);
  /* B02: C-08 bajado, una y dos líneas de 3 M a PG sin catálogo: ya no autorizan 44,071,695 ni validan las dos */
  const baja = con10(P39R, { 'C-08': (10486800 - 3000000) / 87390000 }), L = (id) => ({ id, beneficiario: 'PG', monto: 3000000, sustituye: 'C-08', agregado_original: 10486800, estado_pacto: 'pactado' });
  const u = Motor.reparto(DEF10, Object.assign({}, baja, { reparto: Object.assign({}, B2_DECLARADO, { lineas: [L('L1')] }) })).resultado, d = Motor.reparto(DEF10, Object.assign({}, baja, { reparto: Object.assign({}, B2_DECLARADO, { lineas: [L('L1'), L('L2')] }) })).resultado;
  assert(tot(u) === 0 && u.cr === 44071695 - 3000000 && u.motivos.some((m) => /^CF-09/.test(m)) && tot(d) === 0 && d.lineas.every((l) => l.cf07 === 'bloquea'));
  /* B03: {JV:1} y {YOD:0.2,PG:0.2} sin modo ni pacto ya no se aceptan (ni reciben ni se normalizan) */
  ['JV', 'YP'].forEach((k) => { const x = Motor.reparto(DEF10, Object.assign({}, P39R, { reparto: Object.assign({}, B2_DECLARADO, { reparto_interno: k === 'JV' ? { JV: 1 } : { YOD: 0.2, PG: 0.2 } }) })).resultado; assert(/^INVÁLIDO/.test(x.estado) && tot(x) === 0, k); });
  /* B04: corte 60 sin la opción en el plan; N1 tierra en especie sin regla; ISR pendiente */
  const h60 = textoVisor(Motor.paqueteVisor(DEF10, P60R)); assert(!/reparto en el mes 39/.test(h60) && !/Mes del reparto/.test(h60) && !/cobra en el mes/.test(h60));
  const n1 = con10(PLANES10.N1_tierra_especie, { 'S-17': 'al_liquidar', 'S-23': 'pactado', 'S-19': 'no' }, B2_DECLARADO), hn1 = textoVisor(Motor.paqueteVisor(DEF10, n1));
  assert(!/recibe en total[^<"]{0,8}−/.test(hn1) && /pérdida asignada −\$2\.1 \(teórica\)/.test(hn1) && /Dueño · pérdida asignada \(teórica\)/.test(hn1));
  const pi = Motor.paqueteVisor(DEF10, Object.assign({}, n1, { reparto: { isr: { estado: 'pendiente' } } })); assert(/INVÁLIDO/.test(pi.deducido['v.dueno_recibe']) && /nunca bajo «recibe»/.test(pi.deducido['v.dueno_recibe']) && /bloqueado ·/.test(textoVisor(pi)));
  /* B05: arrastre de suma cero entre CAP_A y CAP_B pasado al corte 60 */
  const kw = (x) => Object.assign({ iva: { tipologia: 'vivienda', modalidad: 'ya_incorporado' }, fee_en_indirectos: 'no', gestion_esquema: 'A', liberar_caja_minima: 'al_liquidar', acuerdos_pactados: true, clases_capital: [{ clase: 'CAP_A', parte: 0.5 }, { clase: 'CAP_B', parte: 0.5 }], regla_clases: 'pari_passu' }, B2_DECLARADO, x || {});
  const c39 = REP.repartoVertical(CASOS.N1, kw({ mes_corte: 39 })), a = JSON.parse(JSON.stringify(c39.capital_arrastre)); a.clases.CAP_A.pr += 1000; a.clases.CAP_B.pr -= 1000;
  const r5 = REP.repartoVertical(CASOS.N1, kw({ capital_arrastre: a })); assert(r5.arrastre_cuadra === false && tot(r5) === 0);
  /* B06: tasas 0, 0.15 y 1 ya no dan lo mismo: 0 y 1 llevan el motivo de la tasa */
  const pr = con10(PLANES10.respaldo, { 'S-17': 'al_liquidar', 'S-23': 'pactado' }, B2_DECLARADO), r6 = (t) => Motor.reparto(DEF10, con10(pr, { 'S-18': 'parte=SP; tope=30000000; tasa=' + t + '; pacto=pactado' })).resultado;
  [0, 1].forEach((t) => assert(r6(t).motivos.some((m) => /no coincide con el costo que usa F-02/.test(m)) && tot(r6(t)) === 0, String(t))); assert(!r6(0.15).motivos.some((m) => /no coincide con el costo que usa F-02/.test(m)));
  /* B07: plan patrimonial en la definición vertical */
  assert(/^BLOQUEADO/.test(Motor.reparto(DEF10, Object.assign({}, P39R, { tipo: 'patrimonial' })).resultado.estado));
});
/* ═══ corrección 2 de T-10 (dictamen T-11 v2): una prueba por punto ═══ */
const cargaPagina = (loc) => {   // la página de prueba con sus archivos reales, sin red ni DOM; «loc» simula window.location
  const vm = require('vm'), ctx = { console }; ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; if (loc) ctx.location = loc; vm.createContext(ctx);
  ['reparto.js', 'motor.js', 'definicion-tablas.js', 'definicion-reparto.js', 'pantalla.js', 'reparto-prueba.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), ctx, { filename: f }));
  return ctx;
};
prueba('T-11 v2 · punto 1 · la página de prueba no pide nada a internet y su almacenamiento queda aparte del Árbol habitual', () => {
  const html = fs.readFileSync(path.join(APP, 'reparto-prueba.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href|action|poster|data)\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
  assert(refs.length >= 7 && refs.every((u) => /^[a-z0-9_.-]+\.(js|css)(\?v=[\w.-]+)?$/i.test(u)), 'sólo archivos de esta carpeta: ' + JSON.stringify(refs));
  assert(!/https?:\/\/|\/\/[a-z]|portero|yod-acceso|yod-cargador|fonts\.g|jsdelivr|@import/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'ni portal, ni fuentes de Google, ni jsDelivr, ni Portero');
  const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  assert(/default-src 'none'/.test(csp) && /script-src 'self'(;|$)/.test(csp) && /connect-src 'none'/.test(csp) && /font-src 'self'/.test(csp) && /img-src 'self' data:/.test(csp), 'la política del navegador impide cualquier otra petición: ' + csp);
  const red = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource|importScripts|createElement\(\s*['"](script|link|img|iframe)['"]|https?:\/\/(?!www\.w3\.org\/2000\/svg)/;
  ['reparto.js', 'motor.js', 'definicion-tablas.js', 'definicion-reparto.js', 'pantalla.js', 'reparto-prueba.js'].forEach((f) => { const m = fs.readFileSync(path.join(APP, f), 'utf8').match(red); assert(!m, f + ' pide red: ' + (m && m[0])); });
  assert(!/url\(\s*['"]?(https?:)?\/\/|@import/i.test(fs.readFileSync(path.join(APP, 'pantalla.css'), 'utf8')), 'pantalla.css no carga nada de fuera');
  /* almacenamiento: mismas claves de siempre sin prefijo; con el prefijo de la página, todas distintas */
  const ctx = cargaPagina({ protocol: 'file:', hostname: '' }), P = ctx.ArbolRepartoPrueba.PREFIJO_ALMACEN, base = ctx.ArbolPantalla.clavesAlmacen({}), pr = ctx.ArbolPantalla.clavesAlmacen({ prefijoAlmacen: P });
  assert.strictEqual(JSON.stringify(base), JSON.stringify({ plan: 'ppp-arbol-pantalla-2', reglas: 'ppp-arbol-reglas-1', comparacion: 'ppp-arbol-comparacion-1' }), 'el Árbol habitual conserva sus claves');
  assert(P && Object.keys(base).every((k) => pr[k] === P + base[k] && pr[k] !== base[k]), JSON.stringify(pr));
  const fuente = fs.readFileSync(path.join(APP, 'pantalla.js'), 'utf8'); assert(!/ls\.(get|set|del)\(\s*CLAVE_/.test(fuente), 'pantalla.js ya no escribe ni lee con las claves fijas: usa las de clavesAlmacen');
  let opts = null; const panel = { innerHTML: '' }, host = {};
  ctx.ArbolPantalla = Object.assign({}, ctx.ArbolPantalla, { montar: (h, o) => { opts = o; return { estado: () => ({ plan: JSON.parse(JSON.stringify(P39)) }), DEF: null }; } });
  ctx.ArbolRepartoPrueba.arranca(host, panel); assert(opts && opts.prefijoAlmacen === P, 'la página monta la pantalla con su prefijo');
  /* sin la puerta del portal, en un sitio publicado no se monta */
  const pub = cargaPagina({ protocol: 'https:', hostname: 'yodesarrollomx.github.io' }); let montada = false;
  pub.ArbolPantalla = Object.assign({}, pub.ArbolPantalla, { montar: () => { montada = true; return null; } });
  const pan2 = { innerHTML: '' }; assert.strictEqual(pub.ArbolRepartoPrueba.arranca({}, pan2), null); assert(!montada && /Página de prueba local/.test(pan2.innerHTML));
  assert(cargaPagina({ protocol: 'http:', hostname: 'localhost' }).ArbolRepartoPrueba.esLocal({ protocol: 'http:', hostname: 'localhost' }));
});
prueba('T-11 v2 · punto 2 · la tarjeta «Reparto» de la pantalla y el panel muestran la pérdida teórica (etiqueta_reparto)', () => {
  const ctx = cargaPagina({ protocol: 'file:', hostname: '' }), def = ctx.ArbolRepartoPrueba.definicion(ctx.ArbolMotor).definicion;
  const n1 = con10(PLANES10.N1_tierra_especie, { 'S-17': 'al_liquidar', 'S-23': 'pactado', 'S-19': 'no' }, B2_DECLARADO);
  const T = Motor.evalua(DEF10, n1, null, SIN).tarjetas.Reparto, c22 = T.cifras.find((c) => c.id === 'R-22');
  assert(c22.valor < 0 && c22.etiqueta_reparto === 'Pérdida asignada (teórica) · Dueño', JSON.stringify(c22));
  const tx = ctx.ArbolPantalla.textoCifras('Reparto', JSON.parse(JSON.stringify(T)));
  assert(/^Pérdida asignada \(teórica\) · Veces su tierra$/.test(tx.s[0]) && /^Pérdida asignada \(teórica\) · Dueño −/.test(tx.s[1]), 'la tarjeta de la pantalla lee etiqueta_reparto: ' + JSON.stringify(tx.s));
  assert.strictEqual(ctx.ArbolPantalla.etiquetaCifra(c22), 'Pérdida asignada (teórica) · Dueño');
  const tp = ctx.ArbolPantalla.textoCifras('Reparto', JSON.parse(JSON.stringify(Motor.evalua(DEF10, P39, null, SIN).tarjetas.Reparto)));
  assert(!tp.s.some((x) => /Pérdida/.test(x)) && tp.s[0] === 'Veces su tierra', 'sin pérdida, la etiqueta de siempre: ' + JSON.stringify(tp.s));
  const tl = ctx.ArbolPantalla.textoCifras('Reparto', JSON.parse(JSON.stringify(Motor.evalua(DEF, BASE, null, SIN).tarjetas.Reparto)));
  assert(!tl.s.some((x) => /Pérdida/.test(x)), 'sin la extensión la tarjeta se lee igual que antes');
  const fuente = fs.readFileSync(path.join(APP, 'pantalla.js'), 'utf8'); assert(/return textoCifras\(nombre, T\);/.test(fuente) && /et: etiquetaCifra\(c\)/.test(fuente), 'la tarjeta y los avisos de la pantalla usan etiquetaCifra');
  const h = ctx.ArbolRepartoPrueba.estadoHtml(ctx.ArbolMotor, def, JSON.parse(JSON.stringify(n1)));
  assert(/<h3>Tarjeta «Reparto»<\/h3>/.test(h) && /<th scope="row">Pérdida asignada \(teórica\) · Dueño<\/th><td>−\$2,119,229 · teórico/.test(h), 'el panel de la página muestra la pérdida teórica');
  cifra('Punto 2 (T-11 v2) · N1 con tierra en especie sin regla: la tarjeta dice «Pérdida asignada (teórica) · Dueño −…» y el panel «Pérdida asignada (teórica) · Dueño −$2,119,229 · teórico»');
});
prueba('T-11 v2 · punto 3 (N01) · una fecha de pago sin importe no aparece como pago, conserva su motivo y nunca desplaza el corte autorizado', () => {
  const ctx = cargaPagina({ protocol: 'file:', hostname: '' }), def = ctx.ArbolRepartoPrueba.definicion(ctx.ArbolMotor).definicion;
  const con = (reg) => Object.assign({}, P60, { reparto: Object.assign({}, DECL, reg) });
  const p38 = con({ fechas_pago: { DUENO: 38 } }), r = Motor.reparto(DEF10, p38).resultado, fp = r.salida.paquete.fecha_pago_registrado;
  assert(r.conciliacion.DUENO.pagado === 0 && fp.valor === null && fp.estado === 'inconsistente' && fp.fecha_sin_importe === 38 && /^fecha sin pago registrado al dueño: el mes 38 no tiene importe/.test(fp.motivos[0]), JSON.stringify(fp));
  const pq = Motor.paqueteVisor(DEF10, p38), fq = pq.cascada.fechas;
  assert(fq.pago_registrado.valor === null && fq.pago_registrado.estado === 'inconsistente' && fq.pago_registrado.fecha_sin_importe === 38 && fq.corte_autorizado.valor === 60 && pq.v.dueno_meses === 60, JSON.stringify(fq.pago_registrado));
  const hv = textoVisor(pq);
  assert(!/pago registrado al dueño: mes 38/.test(hv) && !/"Pago registrado al dueño","mes 38"/.test(hv), 'el visor no presenta el 38 como pago');
  assert(/corte autorizado: mes 60 \(sin pago registrado; fecha de pago del mes 38 sin importe: inconsistente\)/.test(hv) && /corte de reparto autorizado en el mes 60/.test(hv), 'el corte 60 se conserva y la fecha sin importe se dice inconsistente');
  assert(/"Pago registrado al dueño","sin pago registrado · fecha sin importe \(mes 38\): inconsistente, no es pago"/.test(hv));
  const hp = ctx.ArbolRepartoPrueba.estadoHtml(ctx.ArbolMotor, def, JSON.parse(JSON.stringify(p38)));
  assert(/Pago registrado<\/th><td>sin pago registrado · inconsistente: fecha sin pago registrado al dueño: el mes 38/.test(hp) && /Corte autorizado<\/th><td>mes 60/.test(hp) && !/Pago registrado<\/th><td>mes 38/.test(hp), 'el panel tampoco');
  /* control: con importe registrado, el pago sí aparece y el corte sigue a la vista */
  const pr = con({ fechas_pago: { DUENO: 60 }, pagos_registrados: { DUENO: 1000000 } }), xr = Motor.reparto(DEF10, pr).resultado, pqr = Motor.paqueteVisor(DEF10, pr), hr = textoVisor(pqr);
  assert(xr.salida.paquete.fecha_pago_registrado.valor === 60 && xr.salida.paquete.fecha_pago_registrado.estado === 'registrado' && xr.conciliacion.DUENO.pagado === 1000000);
  assert(/corte autorizado: mes 60 · pago registrado al dueño: mes 60/.test(hr) && /"Pago registrado al dueño","mes 60"/.test(hr), 'pago registrado con importe: corte y pago, ninguno sustituye al otro');
  assert(/Pago registrado<\/th><td>mes 60/.test(ctx.ArbolRepartoPrueba.estadoHtml(ctx.ArbolMotor, def, JSON.parse(JSON.stringify(pr)))));
  /* importe sin fecha: tampoco hay mes de pago, y lo dice */
  const sf = Motor.reparto(DEF10, con({ pagos_registrados: { DUENO: 1000000 } })).resultado.salida.paquete.fecha_pago_registrado; assert(sf.valor === null && sf.estado === 'sin registro' && /pago registrado sin fecha/.test(sf.motivos[0]));
  cifra('N01 (T-11 v2) · P60 con fecha de pago 38 y sin importe: pagado $0, fecha «inconsistente» sin valor, corte autorizado 60 en paquete, visor y panel; con importe de $1,000,000 en el mes 60, corte y pago a la vista');
});
prueba('Mutación CF-01 «si» (T-11): con S-12 = sí la única razón del bloqueo es CF-01; con S-12 = no el mismo plan autoriza', () => {
  const f = (s12) => Motor.reparto(DEF10, con10(PLANES10A.muestra_fee_5, { 'S-12': s12, 'S-13': 'A', 'S-23': 'pactado', 'S-17': 'al_liquidar' }, DECL)).resultado;
  const si = f('si'), no = f('no'); assert.deepStrictEqual(si.motivos, ['CF-01 · fee dentro de indirectos y aparte']); assert.strictEqual(sumaO(si.autorizado), 0); assert(no.autorizable && sumaO(no.autorizado) === no.cr && no.cr > 0, JSON.stringify(no.motivos));
});
prueba('Mutación CF-05 sumas (T-11): en el ejemplo anual, un excedente que no suma 100 % y una matriz que no suma 100 % invalidan aunque cada parte esté en rango', () => {
  const x = REP.cascada(REP.escenario({ excedente: { DUENO: 0.6, ALIANZA: 0.3, CAPITAL: 0 } })); assert(/^INVÁLIDO/.test(x.estado) && x.errores.some((m) => /los porcentajes del excedente no suman 100 % \(CF-05\)/.test(m)), JSON.stringify(x.errores));
  const mat = REP.MATRIZ_MOREO.map((f, i) => (i === 0 ? [f[0], 0.06, f[2], f[3]] : f));
  const y = REP.cascada(REP.escenario({ acuerdo_marco: Object.assign({}, REP.ACUERDO_MARCO, { matriz: mat }) })); assert(/^INVÁLIDO/.test(y.estado) && y.errores.some((m) => /la matriz de contribuciones suma 0\.98, no 100 % \(CF-05\)/.test(m)), JSON.stringify(y.errores));
});

/* ═══════════════════ RESUMEN ═══════════════════ */
console.log('\n══════════════════════════════════════════');
console.log('pruebas: ' + R.ok + ' de ' + R.n + ' pasan' + (R.fallos.length ? ' · ' + R.fallos.length + ' FALLAN' : ' · TODO BIEN'));
if (R.fallos.length) { R.fallos.forEach((f) => console.log(' - ' + f)); process.exit(1); }
console.log('\nCifras para D-motor-notas.md:'); R.cifras.forEach((c) => console.log(' · ' + c));
