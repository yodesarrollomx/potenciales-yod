/* Pruebas de app/conexion/conexion.js (solo Node, sin red, datos sintéticos del caso de muestra).  Uso:  node conexion/pruebas.cjs  (desde app/)  ·  sale con 1 si algo falla. */
'use strict';
const assert = require('assert');
const C = require('./caso-muestra.cjs'), K = require('./conexion.js'), Motor = C.Motor;
const R = { n: 0, ok: 0, fallos: [] };
function prueba(nombre, f) { R.n++; try { f(); R.ok++; console.log('  ok   ' + nombre); } catch (e) { R.fallos.push(nombre + ' → ' + (e.message || e).split('\n')[0]); console.log('  FALLA ' + nombre + ' → ' + (e.message || e).split('\n')[0]); if (process.env.DEPURA) console.log(e.stack); } }
const cifra = (t) => console.log('       · ' + t);

const DEFS = { vertical: C.cargaVertical(), maestro: C.cargaMaestro() };
const leeTodo = (def, plan) => { const r = Motor.evalua(def, plan, null, C.SIN), inf = Motor.paqueteVisor(def, plan, { informe: true }); return { res: r, valores: inf.valores }; };
const columnaDe = (def, plan, orden) => { const t = leeTodo(def, plan); return K.planAColumna(def, plan, t.res, { valores: t.valores, orden, motor: Motor }); };
const cierra = (def, plan) => { const col = columnaDe(def, plan); return { col, back: K.columnaAPlan(def, col, { motor: Motor }) }; };
const nodosVal = (res) => { const o = {}; res.nodos.forEach((n) => { o[n.id] = n.valor; }); return o; };
const iguales = (a, b, msg) => { const ks = Object.keys(a); assert.deepStrictEqual(Object.keys(b).sort(), ks.sort(), msg + ': mismos nodos'); ks.forEach((k) => { const x = a[k], y = b[k]; if (typeof x === 'number' && typeof y === 'number') assert(Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x)), msg + ' ' + k + ': ' + x + ' vs ' + y); else assert.strictEqual(x, y, msg + ' ' + k); }); };
const ordena = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? JSON.stringify(o, Object.keys(o).sort()) : JSON.stringify(o));
const ev = (def, p, c) => Motor.evalua(def, p, c, C.SIN).plan;
const dec = (id, op) => ({ [id]: { opcion: op, estado: 'decidido' } });

console.log('\nA · planAColumna');
const def = DEFS.maestro, PLAN = C.planMuestra(def);
prueba('lista TODOS los factores del Maestro que el árbol conoce (191), cada uno una sola vez, con su tipo, estado y fuente', () => {
  const col = columnaDe(def, PLAN); assert.strictEqual(col.length, 191); assert.strictEqual(new Set(col.map((c) => c.id)).size, 191);
  col.forEach((c) => { assert(['captura', 'fórmula'].indexOf(c.tipo) >= 0, c.id); assert(c.estado && c.fuente, c.id + ' sin estado o fuente'); assert('valor' in c); });
  const por = {}; col.forEach((c) => { por[c.id] = c; });
  assert.strictEqual(por['T-01'].valor, 2000); assert.strictEqual(por['T-01'].estado, 'confirmado'); assert.strictEqual(por['T-01'].tipo, 'captura');
  assert.strictEqual(por['R-03'].tipo, 'fórmula'); assert.strictEqual(por['R-03'].estado, 'calculado'); assert(Math.abs(por['R-03'].valor - 35934800) < 1);
  assert.strictEqual(por['D-09'].valor, 'sí', 'los sí/no van como en el Maestro'); assert.strictEqual(por['P1-02'].valor, 'Vivienda');
  assert.strictEqual(por['E-10'].valor, 0); assert.strictEqual(por['C-02'].valor, 19750); assert(/E-16/.test(por['E-10'].fuente));
  assert(Math.abs(por['CP-01'].valor - 950.4) < 1e-6, 'componente en m²'); assert.strictEqual(por['CP-01'].unidad, 'm2'); assert.strictEqual(por['CP-04'].valor, 0, 'el lobby no está en «Con elevador»: 0 m²');
  assert.strictEqual(por['E-07'].valor, 0.36, 'también los factores ocultos del árbol'); assert.strictEqual(por['E-04'].valor, null); assert.strictEqual(por['E-04'].estado, 'falta');
  assert.strictEqual(por['P1-06'].estado, 'referencia'); assert(/Referencia/.test(por['P1-06'].fuente)); assert.strictEqual(por['E-16'].opcion, 'a_nivel');
  assert.strictEqual(por['RV-11'].valor, 'Pasa');
  const sinValor = col.filter((c) => c.valor === null).map((c) => c.id); cifra('191 factores; con valor ' + (191 - sinValor.length) + '; sin valor (el árbol aún no los calcula): ' + sinValor.join(' '));
});
prueba('con el orden del libro, la lista sale en ese orden', () => { const orden = ['R-03', 'T-01', 'K-12']; const col = columnaDe(def, PLAN, orden); assert.deepStrictEqual(col.slice(0, 3).map((c) => c.id), orden); assert.strictEqual(col.length, 191); });
prueba('sin la lista de todos los factores solo salen los visibles (los demás, vacíos) y no falla', () => { const r = Motor.evalua(def, PLAN, null, C.SIN); const col = K.planAColumna(def, PLAN, r); assert.strictEqual(col.find((c) => c.id === 'E-07').valor, null); assert.strictEqual(col.find((c) => c.id === 'T-01').valor, 2000); });
prueba('funciona igual con la definición del Maestro y con vertical.json', () => { const a = columnaDe(DEFS.vertical, C.planMuestra(DEFS.vertical)), b = columnaDe(DEFS.maestro, PLAN); assert.deepStrictEqual(a.map((c) => [c.id, c.valor, c.estado]), b.map((c) => [c.id, c.valor, c.estado])); });

console.log('\nB · columnaAPlan (ida y vuelta)');
function vuelta(nombre, plan, def2) {
  const d = def2 || def;
  prueba(nombre, () => {
    const a = leeTodo(d, plan), { col, back } = cierra(d, plan), b = leeTodo(d, back.plan);
    iguales(nodosVal(a.res), nodosVal(b.res), 'valores');
    assert.deepStrictEqual(a.res.por_confirmar.ids.slice().sort(), b.res.por_confirmar.ids.slice().sort(), 'por confirmar');
    assert.strictEqual(a.res.pruebas.resultado, b.res.pruebas.resultado);
    assert.strictEqual(ordena(Object.keys(a.res.plan.valores).reduce((o, k) => (o[k] = a.res.plan.valores[k].estado + '|' + (a.res.plan.valores[k].opcion || ''), o), {})), ordena(Object.keys(b.res.plan.valores).reduce((o, k) => (o[k] = b.res.plan.valores[k].estado + '|' + (b.res.plan.valores[k].opcion || ''), o), {})), 'estados del plan');
    assert.deepStrictEqual(back.avisos, []);
    const p1 = JSON.stringify(Motor.paqueteVisor(d, plan)), p2 = JSON.stringify(Motor.paqueteVisor(d, back.plan)); assert.strictEqual(p1, p2, 'el paquete del visor sale idéntico');
  });
}
vuelta('caso de muestra: el plan guardado y reabierto da el mismo resultado, los mismos estados y el mismo paquete', PLAN);
let p2 = ev(def, ev(def, PLAN, dec('E-15', 'amenidades')), { 'E-15': { componentes: { lobby: { activo: false } } } });
vuelta('edificio con amenidades sin lobby (componente apagado)', p2);
p2 = ev(def, p2, { 'E-15': { componentes: { salon: { valor: 0.02, unidad: 'pct' } } } });
vuelta('además el salón editado en % (se guarda en m²)', p2);
p2 = ev(def, p2, { 'P1-06': { valor: 57500, estado: 'confirmado', fuente: 'Cotización de prueba' } });
prueba('precio confirmado con su fuente: la fuente viaja en la columna', () => { assert.strictEqual(columnaDe(def, p2).find((c) => c.id === 'P1-06').fuente, 'Cotización de prueba'); assert.strictEqual(K.columnaAPlan(def, columnaDe(def, p2), { motor: Motor }).plan.valores['P1-06'].fuente, 'Cotización de prueba'); });
vuelta('precio confirmado con fuente', p2);
p2 = ev(def, p2, dec('C-10', 'libro_ppp2'));
vuelta('comisión con la fuente del libro (4.7%)', p2);
p2 = ev(def, p2, { 'K-13': { valor: 0.4, estado: 'decidido' } });
vuelta('arranque propio 40% (permite otro valor)', p2);
p2 = ev(def, p2, { 'C-01': { estado: 'no_se' } });
vuelta('«no sé todavía» en el costo de obra', p2);
p2 = ev(def, p2, { 'E-02': { valor: 0.3, estado: 'decidido' } });
vuelta('desplante propio al 30% (vista en %, factor en m²: el vista↔factor viaja bien)', p2);
p2 = ev(def, p2, dec('P1-05', 'estudio')); p2 = ev(def, p2, dec('D-09', 'sin_banco'));
vuelta('estudio y sin banco', p2);
p2 = ev(def, PLAN, { 'T-04': { valor: 25, estado: 'decidido' } });
prueba('tierra propia de 25 millones: la columna guarda 25,000,000 pesos y el plan 25 (escala de la vista)', () => { const col = columnaDe(def, p2); assert.strictEqual(col.find((c) => c.id === 'T-04').valor, 25000000); assert.strictEqual(K.columnaAPlan(def, col, { motor: Motor }).plan.valores['T-04'].valor, 25); const mapa = {}; col.forEach((c) => { if (c.valor !== null) mapa[c.id] = c.valor; }); assert.strictEqual(K.columnaAPlan(def, mapa, { motor: Motor }).plan.valores['T-04'].valor, 25); });
vuelta('tierra propia de 25 millones', p2);
vuelta('plan vacío (solo el predio)', { tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: 2000 } } });
prueba('con datos del plan (captura directa de ritmo y obra) la columna los guarda y los recupera', () => {
  const p = JSON.parse(JSON.stringify(PLAN)); p.datos = { 'K-03': 2, 'C-06': 100000000 };
  const col = columnaDe(def, p); assert.strictEqual(col.find((c) => c.id === 'K-03').valor, 2); assert.strictEqual(col.find((c) => c.id === 'C-06').valor, 100000000);
  const b = K.columnaAPlan(def, col, { motor: Motor }); assert.deepStrictEqual(b.plan.datos, { 'K-03': 2, 'C-06': 100000000 }); iguales(nodosVal(leeTodo(def, p).res), nodosVal(leeTodo(def, b.plan).res), 'datos');
});
prueba('solo valores, como los lee el libro (sin estados): mismos números; lo que es la referencia vuelve a serlo', () => {
  const col = columnaDe(def, PLAN), mapa = {}; col.forEach((c) => { if (c.valor !== null) mapa[c.id] = c.valor; });
  const b = K.columnaAPlan(def, mapa, { motor: Motor }), a = leeTodo(def, PLAN), r = leeTodo(def, b.plan);
  iguales(nodosVal(a.res), nodosVal(r.res), 'valores');
  /* el caso no fija el ritmo; la referencia calibrada da 1.2 igual que el valor fijo del prototipo, y sin estados vuelve a ser la referencia: «por confirmar» no cambia */
  const solo = a.res.por_confirmar.ids.filter((x) => r.res.por_confirmar.ids.indexOf(x) < 0), nuevo = r.res.por_confirmar.ids.filter((x) => a.res.por_confirmar.ids.indexOf(x) < 0);
  assert.deepStrictEqual(solo, []); assert.deepStrictEqual(nuevo, []);
  /* la tierra del caso ($14 M) coincide con la referencia: leída sin estados vuelve a ser la referencia y no entra al plan como valor de la persona */
  assert.deepStrictEqual(Object.keys(b.plan.valores).sort(), Object.keys(PLAN.valores).filter((k) => k !== 'T-04').sort());
  cifra('sin estados: ' + Object.keys(b.plan.valores).length + ' valores en el plan (los de la persona), por confirmar ' + r.res.por_confirmar.n + ' (' + a.res.por_confirmar.n + ' con estados: igual)');
});
prueba('solo valores con otras cifras de la persona: precio 60,000 y comisión 4.7%', () => {
  const pp = ev(def, ev(def, PLAN, { 'P1-06': { valor: 60000, estado: 'decidido' } }), dec('C-10', 'libro_ppp2')), col = columnaDe(def, pp), mapa = {}; col.forEach((c) => { if (c.valor !== null) mapa[c.id] = c.valor; });
  const b = K.columnaAPlan(def, mapa, { motor: Motor }); iguales(nodosVal(leeTodo(def, pp).res), nodosVal(leeTodo(def, b.plan).res), 'valores');
});
prueba('el sí/no del Maestro («sí») vuelve al plan como «si»', () => { const b = K.columnaAPlan(def, [{ id: 'T-01', valor: 2000 }, { id: 'D-09', valor: 'sí', estado: 'decidido', opcion: 'con_banco' }], { motor: Motor }); assert.strictEqual(b.plan.valores['D-09'].opcion, 'con_banco'); });
prueba('sin el motor avisa con claridad', () => { assert.throws(() => K.columnaAPlan(def, []), /necesita el motor/); });

console.log('\nB2 · ola 5 (M7: solo capturas · D5: sí/si · fuera de horizonte · factores del reparto)');
/* valores de TODOS los factores (visibles y ocultos) de un plan, y cuántos cambian al guardar solo las capturas y reabrir */
const valoresFactores = (d, plan) => { const o = {}; const v = Motor.paqueteVisor(d, plan, { informe: true }).valores; Object.keys(v).forEach((k) => { o[k] = v[k].valor; }); return o; };
const diferencias = (a, b) => { const out = []; Object.keys(a).forEach((k) => { const x = a[k], y = b[k]; if (typeof x === 'number' && typeof y === 'number') { if (Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x))) out.push(k); } else if (x !== y && !(x == null && y == null)) out.push(k); }); Object.keys(b).forEach((k) => { if (!(k in a)) out.push(k); }); return out; };
const soloCapturas = (d, plan, comoMapa) => { const col = columnaDe(d, plan); const cap = col.filter((c) => c.tipo === 'captura'); if (!comoMapa) return { n: cap.length, col: cap }; const m = {}; cap.forEach((c) => { if (c.valor !== null) m[c.id] = c.valor; }); return { n: Object.keys(m).length, col: m }; };
function idaVueltaCapturas(nombre, plan, comoMapa) {
  prueba('M7 · ' + nombre + ': solo las capturas (' + (comoMapa ? 'solo valores' : 'con estados') + '), sin el renglón de m² construidos ni ninguna fórmula: 0 diferencias en los factores', () => {
    const sc = soloCapturas(def, plan, comoMapa), ids = (Array.isArray(sc.col) ? sc.col.map((c) => c.id) : Object.keys(sc.col));
    ['E-05', 'E-06', 'C-07', 'R-03', 'R-22', 'K-12'].forEach((f) => assert(ids.indexOf(f) < 0, f + ' es fórmula y no debe viajar'));
    const b = K.columnaAPlan(def, sc.col, { motor: Motor });
    const dif = diferencias(valoresFactores(def, plan), valoresFactores(def, b.plan));
    assert.deepStrictEqual(dif, [], 'factores distintos: ' + dif.join(', '));
    iguales(nodosVal(leeTodo(def, plan).res), nodosVal(leeTodo(def, b.plan).res), 'valores de los nodos'); assert.deepStrictEqual(b.avisos, []);
    cifra(nombre + ': ' + sc.n + ' capturas → ' + Object.keys(valoresFactores(def, plan)).length + ' factores comparados, 0 diferencias');
  });
}
let pM = ev(def, PLAN, dec('E-15', 'amenidades')); pM = ev(def, pM, { 'E-15': { componentes: { lobby: { activo: false } } } }); pM = ev(def, pM, { 'E-15': { componentes: { salon: { valor: 0.02, unidad: 'pct' } } } });
idaVueltaCapturas('caso de muestra', PLAN, false); idaVueltaCapturas('caso de muestra', PLAN, true);
idaVueltaCapturas('amenidades sin lobby y salón en % de la construcción', pM, false); idaVueltaCapturas('amenidades sin lobby y salón en % de la construcción', pM, true);
idaVueltaCapturas('desplante propio al 30% y tierra de 25 millones', ev(def, ev(def, PLAN, { 'E-02': { valor: 0.3, estado: 'decidido' } }), { 'T-04': { valor: 25, estado: 'decidido' } }), true);
prueba('M7 · con la construcción cambiada (desplante al 30%) los componentes en % se reconstruyen con la construcción NUEVA, no con la del renglón', () => {
  const p = ev(def, ev(def, PLAN, dec('E-15', 'amenidades')), { 'E-02': { valor: 0.3, estado: 'decidido' } }), col = columnaDe(def, p), cap = col.filter((c) => c.tipo === 'captura');
  const b = K.columnaAPlan(def, cap, { motor: Motor }); assert.deepStrictEqual(diferencias(valoresFactores(def, p), valoresFactores(def, b.plan)), []);
  const e05 = valoresFactores(def, p)['E-05'], e05p = valoresFactores(def, PLAN)['E-05']; assert(Math.abs(e05 - e05p) > 100, 'la construcción sí cambió'); assert.strictEqual(Object.keys(b.plan.componentes['E-15'] || {}).length, 0, 'ningún componente quedó como «editado» por usar una construcción vieja');
});
prueba('M7 · el plan reabierto con solo capturas da el mismo paquete del visor', () => { const b = K.columnaAPlan(def, soloCapturas(def, PLAN, false).col, { motor: Motor }); assert.strictEqual(JSON.stringify(Motor.paqueteVisor(def, PLAN)), JSON.stringify(Motor.paqueteVisor(def, b.plan))); });
prueba('D5 · «sí», «Sí», «SÍ» y «si» se leen igual en la columna y en las pestañas; el texto «sí» dentro de otro texto no se toca', () => {
  ['sí', 'Sí', 'SÍ', 'si', ' sí '].forEach((x) => { const b = K.columnaAPlan(def, [{ id: 'T-01', valor: 2000 }, { id: 'D-09', valor: x, estado: 'decidido', opcion: 'con_banco' }], { motor: Motor }); assert.strictEqual(b.plan.valores['D-09'].opcion, 'con_banco', x); });
  const sin = K.columnaAPlan(def, [{ id: 'T-01', valor: 2000 }, { id: 'D-09', valor: 'sí', estado: 'decidido' }], { motor: Motor }); assert.strictEqual(sin.plan.valores['D-09'].opcion, 'con_banco', 'con «sí» y sin la opción: se reconoce la opción de banco');
  const t = C.clon(C.MAESTRO); const iOc = t.ARBOL_NODOS[0].indexOf('oculto'); const filaOc = t.ARBOL_NODOS.findIndex((r, i) => i > 0 && r[iOc] === 'si'); t.ARBOL_NODOS[filaOc][iOc] = 'sí';
  const r = K.definicionDeTablas(t); assert.deepStrictEqual(r.errores, []); assert.strictEqual(r.definicion.ARBOL_NODOS[filaOc - 1].oculto, 'si', 'oculto = sí queda como si'); assert.strictEqual(Motor.carga(r.definicion).huella, Motor.carga(C.clon(C.MAESTRO)).huella, 'misma huella con «sí» que con «si»');
  assert(K.definicionDeTablas({ nodos: [['id', 'tipo', 'que_es'], ['X-01', 'se_busca', 'dice sí y no']] }).definicion.ARBOL_NODOS[0].que_es === 'dice sí y no');
  assert.strictEqual(K.planAColumna(def, PLAN, leeTodo(def, PLAN).res, { valores: leeTodo(def, PLAN).valores }).find((c) => c.id === 'D-09').valor, 'sí', 'al escribir en el Maestro sigue yendo con tilde');
});
prueba('los factores nuevos del reparto (R-20 a R-25) salen en la columna con el valor del motor y sin repetir campo del visor', () => {
  const col = columnaDe(def, PLAN), por = {}; col.forEach((c) => { por[c.id] = c; });
  const v = leeTodo(def, PLAN).valores; ['R-20', 'R-21', 'R-22', 'R-23', 'R-24', 'R-25'].forEach((id) => { assert(por[id], id + ' falta'); assert.strictEqual(por[id].tipo, 'fórmula'); assert.strictEqual(por[id].valor, v[id].valor, id); });
  assert(Math.abs(por['R-22'].valor - 21937553.75) < 1, 'dueño $21.94 M'); assert(Math.abs(por['R-22'].valor + por['R-24'].valor + por['R-25'].valor - por['R-20'].valor) < 1, 'las tres partes suman el resultado a repartir (R-20)');
  cifra('R-20 ' + Math.round(por['R-20'].valor) + ' · dueño ' + Math.round(por['R-22'].valor) + ' · alianza ' + Math.round(por['R-24'].valor) + ' · capital ' + Math.round(por['R-25'].valor));
});
prueba('fuera del horizonte: un edificio de 200,000 m² (ritmo calibrado, ajustado a 30 al mes) llega al visor con el aviso y sin pérdida engañosa', () => {
  let p = { tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: 200000 } } }; C.DECISIONES.forEach(([id, op]) => { p = ev(def, p, dec(id, op)); });
  const pk = Motor.paqueteVisor(def, p); assert.strictEqual(pk.v.estado, 'fuera del horizonte'); assert(pk.aviso_arbol && pk.aviso_arbol.razones.length, 'trae aviso_arbol con razones'); assert(/ATENCIÓN: fuera del horizonte/.test(pk.origen), 'el origen lo dice'); assert(/dura \d+ meses/i.test(pk.estado_razon) && !/\b[A-Z]{1,2}-\d\d\b/.test(pk.estado_razon), 'la razón se lee en palabras, sin IDs técnicos');
  ['fin_obra', 'mes_saldos', 'ultimo_cobro', 'obra_inicio'].forEach((k) => { if (pk.v[k] != null) assert(pk.v[k] <= 60, k + ' dentro del eje de 60 meses'); });
  cifra('200,000 m²: estado «' + pk.v.estado + '» · ' + pk.aviso_arbol.razones.length + ' razón(es) · fuera del eje: ' + JSON.stringify(pk.aviso_arbol.fuera_del_eje).slice(0, 120));
});

console.log('\nC · definicionDeTablas');
const TABLAS = C.MAESTRO;
prueba('las matrices de Sheets quedan en filas con nombre y cargan en el motor con 0 errores', () => {
  const r = K.definicionDeTablas(C.clon(TABLAS)); assert.deepStrictEqual(r.errores, []); assert.strictEqual(r.definicion.ARBOL_NODOS.length, 177); assert.strictEqual(r.definicion.ARBOL_FACTORES.length, 191);
  const c = Motor.carga(r.definicion); assert.deepStrictEqual(c.errores, []); assert.strictEqual(c.definicion.nodos.length, 177);
  const d0 = Motor.carga(C.clon(TABLAS)); assert.strictEqual(c.huella, d0.huella, 'misma huella que cargar las matrices directamente');
});
prueba('nombres de pestaña en minúscula, filas vacías, números, booleanos', () => {
  const t = { nodos: C.clon(TABLAS.ARBOL_NODOS), opciones: C.clon(TABLAS.ARBOL_OPCIONES) }; t.nodos.push(['', '', '']); t.nodos.push([]); t.opciones[1][4] = 74;
  const r = K.definicionDeTablas(t); assert.deepStrictEqual(r.errores, []); assert(r.definicion.ARBOL_NODOS.length === 177 && typeof r.definicion.ARBOL_OPCIONES[0].valor === 'string');
});
prueba('detecta lo que rompe: falta ARBOL_NODOS, error de Sheets en una celda, columna repetida, encabezado ausente', () => {
  assert(K.definicionDeTablas({ ARBOL_OPCIONES: C.clon(TABLAS.ARBOL_OPCIONES) }).errores.some((e) => e.codigo === 'sin_definicion'));
  const t = C.clon(TABLAS); t.ARBOL_NODOS[5][11] = '#REF!'; const e = K.definicionDeTablas(t).errores; assert(e.some((x) => x.codigo === 'celda_con_error' && x.pestana === 'ARBOL_NODOS' && x.fila === 6 && x.columna === 'que_es'), JSON.stringify(e));
  const u = C.clon(TABLAS); u.ARBOL_NODOS[0][3] = 'id'; assert(K.definicionDeTablas(u).errores.some((x) => x.codigo === 'columna_repetida'));
  const w = C.clon(TABLAS); w.ARBOL_NODOS = [['x', 'y'], ['1', '2']]; assert(K.definicionDeTablas(w).errores.some((x) => x.codigo === 'sin_encabezado'));
  assert(K.definicionDeTablas(null).errores.length === 1); assert(K.definicionDeTablas({ ARBOL_X: [] }).avisos.length === 1);
});
prueba('una columna que no existe se reporta al cargar (el motor la rechaza con fila y columna)', () => {
  const t = C.clon(TABLAS); t.ARBOL_NODOS[0].push('inventada'); t.ARBOL_NODOS[1].push('x'); const r = K.definicionDeTablas(t); const c = Motor.carga(r.definicion); assert(c.errores.some((e) => e.codigo === 'columna_desconocida' && e.columna === 'inventada'));
});
prueba('textoSeguro protege = + - @ \' y deja pasar lo demás', () => { ['=A1', '+1', '-0.5', '@config', "'si'"].forEach((x) => assert.strictEqual(K.textoSeguro(x), "'" + x)); assert.strictEqual(K.textoSeguro('Vivienda'), 'Vivienda'); assert.strictEqual(K.textoSeguro(5), 5); assert.strictEqual(K.redondea(0.1 + 0.2), 0.3); });
prueba('puro: no toca lo que recibe', () => { const p = C.clon(PLAN), t = C.clon(TABLAS); const col = columnaDe(def, p); K.columnaAPlan(def, col, { motor: Motor }); K.definicionDeTablas(t); assert.deepStrictEqual(p, C.clon(PLAN)); assert.deepStrictEqual(t, TABLAS); });


console.log('\nD · ola 6 (umbrales propios · áreas propias · F5 · «No sé todavía» del edificio · números con formato · textoSeguro · 300 planes sembrados)');
const SIEMBRA = require('./siembra.cjs');
/* todo lo que debe volver igual: valores de TODOS los factores, de los nodos, por confirmar, estados y opciones del plan, áreas (nombre, tamaño, estado, fuente, se vende), umbrales y el paquete del visor */
function huellaPlan(d, plan) {
  const t = leeTodo(d, plan), est = {}; Object.keys(t.res.plan.valores).forEach((k) => { const v = t.res.plan.valores[k]; est[k] = [v.estado, v.opcion || '', v.base_opcion || '', v.fuente || ''].join('|'); });
  const e15 = t.res.nodos.find((n) => n.id === 'E-15'), areas = {}; ((e15 && e15.componentes) || []).forEach((c) => { areas[c.clave] = [c.nombre, c.propia ? 'propia' : 'catalogo', c.rol, c.vende, c.activo, Math.round(c.m2 * 1e6) / 1e6, c.estado_plan, c.fuente || ''].join('|'); });
  return { factores: valoresFactores(d, plan), nodos: nodosVal(t.res), confirmar: t.res.por_confirmar.ids.slice().sort(), estados: est, areas, pruebas: t.res.pruebas.items.map((i) => [i.umbral, i.umbral_propio, i.estado, i.nota || ''].join('|')), resultado: t.res.pruebas.resultado, pv: JSON.stringify(Motor.paqueteVisor(d, plan).v), areasV: JSON.stringify(Object.keys(areas).map((k) => areas[k].split('|').slice(0, 6).join('|'))), paquete: JSON.stringify(Motor.paqueteVisor(d, plan)) };
}
function difs(a, b) {
  const out = [];
  Object.keys(a).forEach((k) => { if (k === 'factores' || k === 'nodos') { const x = diferencias(a[k], b[k]); if (x.length) out.push(k + ': ' + x.slice(0, 5).join(',')); } else if (ordena(a[k]) !== ordena(b[k]) && JSON.stringify(a[k]) !== JSON.stringify(b[k])) { if (typeof a[k] === 'object' && !Array.isArray(a[k])) { const ks = Object.keys(Object.assign({}, a[k], b[k])).filter((q) => JSON.stringify(a[k][q]) !== JSON.stringify(b[k][q])); out.push(k + ': ' + ks.slice(0, 5).map((q) => q + ' «' + a[k][q] + '» → «' + b[k][q] + '»').join('; ')); } else out.push(k + (Array.isArray(a[k]) ? ': ' + a[k].filter((q) => b[k].indexOf(q) < 0).slice(0, 4).join(',') + ' / ' + b[k].filter((q) => a[k].indexOf(q) < 0).slice(0, 4).join(',') : '')); } });
  return out;
}
const idaVuelta = (d, plan, comoMapa) => {
  const col = columnaDe(d, plan); let entrada = col;
  if (comoMapa) { entrada = {}; col.forEach((c) => { if (c.valor !== null && c.valor !== '') entrada[c.id] = c.valor; }); }
  const b = K.columnaAPlan(d, entrada, { motor: Motor }); return { b, col };
};
prueba('300 planes sembrados (con umbrales propios, áreas propias, estados y «no sé todavía»): ida y vuelta por la columna con estados, 0 diferencias', () => {
  const planes = SIEMBRA.siembra(def, 300, 20261123); assert.strictEqual(planes.length, 300);
  let conUmbral = 0, conAreas = 0, conNombres = 0, conEstadoArea = 0, noSe = 0, prende = 0, quitaYTam = 0, malos = [];
  planes.forEach((p, i) => {
    const ru = Object.keys(p.valores).filter((k) => /^RU-/.test(k)).length, ed = (p.componentes && p.componentes['E-15']) || {};
    if (ru) conUmbral++; if (Object.keys(ed).some((k) => ed[k].propia)) conAreas++; if (Object.keys(ed).some((k) => !ed[k].propia && ed[k].nombre)) conNombres++; if (Object.keys(ed).some((k) => ed[k].estado === 'confirmado')) conEstadoArea++; if (Object.keys(p.valores).some((k) => p.valores[k].estado === 'no_se')) noSe++;
    { const ks = Object.keys(ed).filter((k) => !ed[k].propia); if (ks.some((k) => ed[k].activo === true && ed[k].valor !== undefined)) prende++; if (ks.some((k) => ed[k].activo === false) && ks.some((k) => ed[k].valor !== undefined && ed[k].activo !== false)) quitaYTam++; }
    const { b } = idaVuelta(def, p, false); const d = difs(huellaPlan(def, p), huellaPlan(def, b.plan)).concat(b.avisos.map((a) => 'aviso ' + a.codigo));
    if (d.length) malos.push('plan ' + i + ': ' + d.join(' · '));
  });
  if (process.env.DIFS) console.log(malos.slice(0, 8).join('\n').slice(0, 3500));
  assert.deepStrictEqual(malos.slice(0, 4), [], malos.length + ' planes con diferencias');
  assert(conUmbral >= 60 && conAreas >= 50 && conNombres >= 25 && conEstadoArea >= 20 && noSe >= 10 && prende >= 20 && quitaYTam >= 20, 'la siembra cubre los casos: prende ' + prende + ', quita y cambia tamaños ' + quitaYTam + ', umbral ' + conUmbral + ', áreas propias ' + conAreas + ', nombres ' + conNombres + ', áreas confirmadas ' + conEstadoArea + ', «no sé» ' + noSe);
  cifra('300 planes · con umbral propio ' + conUmbral + ' · con áreas propias ' + conAreas + ' · con áreas renombradas ' + conNombres + ' · con un área confirmada con fuente ' + conEstadoArea + ' · con «no sé todavía» ' + noSe + ' · que prenden un área que el preajuste no trae ' + prende + ' · que quitan áreas del preajuste y cambian tamaños ' + quitaYTam + ' · diferencias: 0 (valores de 145 factores, nodos, por confirmar, estados, opciones, áreas, umbrales y paquete del visor)');
});
prueba('los mismos 300 planes guardando solo los valores (sin estados, como los lee el libro): 0 diferencias en los 191 factores y en los nodos', () => {
  const planes = SIEMBRA.siembra(def, 300, 20261123); let malos = [];
  planes.forEach((p, i) => { const { b } = idaVuelta(def, p, true); const x = huellaPlan(def, p), y = huellaPlan(def, b.plan); const d = ['factores', 'nodos'].filter((k) => diferencias(x[k], y[k]).length).map((k) => k + ': ' + diferencias(x[k], y[k]).slice(0, 4).join(',')); if (x.resultado !== y.resultado) d.push('resultado'); if (x.pv !== y.pv) d.push('cifras del visor'); if (x.areasV !== y.areasV) d.push('áreas'); if (d.length) malos.push('plan ' + i + ': ' + d.join(' · ')); });
  if (process.env.DIFS) console.log(malos.slice(0, 8).join('\n').slice(0, 3500));
  assert.deepStrictEqual(malos.slice(0, 4), [], malos.length + ' planes con diferencias');
  cifra('300 planes, solo valores: 0 diferencias en factores, nodos, resultado de las pruebas, cifras del visor (v) y áreas (nombre, tipo, se vende, tamaño); lo único que cambia son los estados, que una columna sin estados no guarda');
});
const conArea = () => ev(def, PLAN, { 'RU-05': { valor: 0.3, estado: 'decidido' }, 'RU-07': { valor: 0.5, estado: 'confirmado', fuente: 'Política del banco' }, 'E-15': { componentes: { ap_01: { propia: true, nombre: 'Bodega de bicicletas', valor: 25, unidad: 'm2' }, ap_02: { propia: true, nombre: 'Local comercial', valor: 0.035, unidad: 'pct', rol: 'vendible', estado: 'confirmado', fuente: 'Plano A-3' }, lobby: { nombre: 'Recepción' } } } });
prueba('umbral propio: viaja en la columna con su estado y su fuente, vuelve igual y el paquete lo marca', () => {
  const p = conArea(), col = columnaDe(def, p), por = {}; col.forEach((c) => { por[c.id] = c; });
  assert.strictEqual(por['RU-05'].valor, 0.3); assert.strictEqual(por['RU-05'].estado, 'decidido'); assert.strictEqual(por['RU-07'].estado, 'confirmado'); assert.strictEqual(por['RU-07'].fuente, 'Política del banco'); assert.strictEqual(por['RU-01'].estado, 'referencia');
  const b = K.columnaAPlan(def, col, { motor: Motor }); assert.strictEqual(b.plan.valores['RU-05'].valor, 0.3); assert.strictEqual(b.plan.valores['RU-07'].fuente, 'Política del banco'); assert(!b.plan.valores['RU-01'], 'lo que vale el libro no se guarda como valor propio');
  const pk = Motor.paqueteVisor(def, b.plan); assert(pk.umbrales_propios.length === 2 && /umbral propio/.test(pk.v.rv_resultado), 'el paquete marca los umbrales propios: ' + JSON.stringify(pk.umbrales_propios).slice(0, 120));
  cifra('umbral propio de la prueba 5 (30%) y de la 7 (50%, confirmado con fuente): vuelven iguales; el paquete dice «' + pk.v.rv_resultado + '»');
});
prueba('áreas propias y renombres: una sola celda con código en E-19; ida y vuelta idéntica (nombre, tamaño, unidad, se vende, estado y fuente)', () => {
  const p = conArea(), col = columnaDe(def, p), e19 = col.find((c) => c.id === 'E-19');
  assert.strictEqual(e19.valor, 'ap_01 = Bodega de bicicletas ; 25 m2 ; no se vende ; decidido | ap_02 = Local comercial ; 3.5% ; se vende ; confirmado ; Plano A-3 | lobby = Recepción'); assert.strictEqual(e19.tipo, 'captura'); assert.strictEqual(e19.estado, 'decidido');
  const b = K.columnaAPlan(def, col, { motor: Motor }); assert.deepStrictEqual(b.avisos, []);
  assert.deepStrictEqual(difs(huellaPlan(def, p), huellaPlan(def, b.plan)), []);
  const sin = columnaDe(def, PLAN).find((c) => c.id === 'E-19'); assert.strictEqual(sin.valor, ''); assert.strictEqual(sin.estado, 'referencia');
  const cel = Motor.areasACelda(ev(def, p, null).componentes['E-15']).celda; assert.strictEqual(cel, e19.valor);
});
prueba('una celda E-19 mal escrita no rompe: avisa con su entrada y no inventa nada; el resto del plan vuelve', () => {
  const col = columnaDe(def, conArea()).map((c) => (c.id === 'E-19' ? Object.assign({}, c, { valor: 'ap_01 = Bodega ; mucho ; no se vende | ap_02 = Local comercial ; 3.5% ; se vende | lobby = Recepción' }) : c));
  const b = K.columnaAPlan(def, col, { motor: Motor }); assert(b.avisos.some((a) => a.id === 'E-19' && a.codigo === 'celda_areas' && /entrada 1/.test(a.mensaje)), JSON.stringify(b.avisos));
  const ed = b.plan.componentes['E-15']; assert(!ed.ap_01 && ed.ap_02 && ed.lobby.nombre === 'Recepción'); assert.deepStrictEqual(Motor.evalua(def, b.plan, null, C.SIN).errores, []);
});
prueba('F5 · «Eficiencia del motor del PPP» vuelve como esa opción (antes volvía «Personalizado»), con estados y solo con valores', () => {
  [false, true].forEach((m) => { const p = ev(def, PLAN, dec('E-15', 'motor_ppp')), { b } = idaVuelta(def, p, m); assert.strictEqual(b.plan.valores['E-15'].opcion, 'motor_ppp', m ? 'solo valores' : 'con estados'); assert.deepStrictEqual(difs(huellaPlan(def, p), huellaPlan(def, b.plan)).filter((x) => !m || /^(factores|nodos)/.test(x)), []); });
  const p2 = ev(def, PLAN, dec('E-15', 'sencillo')); assert.strictEqual(idaVuelta(def, p2, true).b.plan.valores['E-15'].opcion, 'sencillo');
});
prueba('«No sé todavía» del tipo de edificio vuelve como «no sé» (antes volvía con una opción fijada)', () => {
  const p = ev(def, PLAN, { 'E-15': { estado: 'no_se' } }), { b } = idaVuelta(def, p, false); assert.deepStrictEqual(b.plan.valores['E-15'], { estado: 'no_se' }); assert.deepStrictEqual(difs(huellaPlan(def, p), huellaPlan(def, b.plan)), []);
  const r = leeTodo(def, b.plan).res; assert(r.por_confirmar.ids.indexOf('E-15') >= 0, 'sigue por confirmar'); assert.strictEqual(r.nodos.find((n) => n.id === 'E-15').estado, 'no_se');
});
prueba('números con formato de pantalla: «2,000», «$15,000,000», «36.0%» se aceptan; «1,5», «1.234,5», «12.3.4» se rechazan con aviso claro y no se adivinan', () => {
  const base = [{ id: 'T-01', valor: '2,000' }, { id: 'T-04', valor: '$15,000,000' }, { id: 'E-07', valor: '36.0%' }];
  const b = K.columnaAPlan(def, base, { motor: Motor }); assert.deepStrictEqual(b.avisos, []); assert.strictEqual(b.plan.valores['T-01'].valor, 2000); assert.strictEqual(b.plan.valores['T-04'].valor, 15);
  const v = leeTodo(def, b.plan).res; assert.strictEqual(v.nodos.find((n) => n.id === 'T-01').valor, 2000);
  const num = K.columnaAPlan(def, [{ id: 'T-01', valor: 2000 }, { id: 'T-04', valor: 15000000 }], { motor: Motor }); assert.deepStrictEqual(b.plan.valores['T-04'], num.plan.valores['T-04']);
  const pct = K.columnaAPlan(def, [{ id: 'T-01', valor: 2000 }, { id: 'RU-05', valor: '30%' }], { motor: Motor }); assert.strictEqual(pct.plan.valores['RU-05'].valor, 0.3);
  ['1,5', '1.234,5', '12.3.4', '1,23'].forEach((x) => { const r = K.columnaAPlan(def, [{ id: 'T-01', valor: 2000 }, { id: 'T-04', valor: x }], { motor: Motor }); assert(r.avisos.length === 1 && r.avisos[0].codigo === 'numero_dudoso' && r.avisos[0].id === 'T-04' && /Se ignoró/.test(r.avisos[0].mensaje), x + ' → ' + JSON.stringify(r.avisos)); assert(!r.plan.valores['T-04'], x + ' no debe entrar al plan'); });
  const t = K.columnaAPlan(def, [{ id: 'T-01', valor: 2000 }, { id: 'D-09', valor: 'sí', estado: 'decidido' }, { id: 'P1-02', valor: 'Vivienda' }, { id: 'I-05', valor: '2026-11-22' }], { motor: Motor }); assert.deepStrictEqual(t.avisos, [], 'un texto o una fecha no son números dudosos');
  assert.deepStrictEqual(K.columnaAPlan(def, { 'T-01': '2,000', 'T-04': '$15,000,000' }, { motor: Motor }).plan.valores['T-01'], { valor: 2000, estado: 'confirmado' });
});
prueba('«d.ddd» en un factor de m² o de pesos avisa «numero_dudoso» y no se lee como 1.234; un factor que no es de m² ni de pesos, y los números ya numéricos, no se tocan', () => {
  ['1.234', '2.500', '$14.000'].forEach((x) => { const id = x[0] === '$' ? 'T-04' : 'T-01'; const r = K.columnaAPlan(def, [{ id: 'T-01', valor: id === 'T-01' ? x : 2000 }, { id: 'T-04', valor: id === 'T-04' ? x : 14000000 }], { motor: Motor }); assert(r.avisos.length === 1 && r.avisos[0].codigo === 'numero_dudoso' && r.avisos[0].id === id && /Se ignoró/.test(r.avisos[0].mensaje), x + ' → ' + JSON.stringify(r.avisos)); });
  const ok = K.columnaAPlan(def, [{ id: 'T-01', valor: 1234 }, { id: 'T-04', valor: 14000000 }, { id: 'E-07', valor: '0.360' }, { id: 'T-04', valor: '1.5' }], { motor: Motor }); assert.deepStrictEqual(ok.avisos, [], JSON.stringify(ok.avisos));
  assert.strictEqual(K.columnaAPlan(def, [{ id: 'T-01', valor: '1,234' }], { motor: Motor }).plan.valores['T-01'].valor, 1234);
  assert.strictEqual(K.columnaAPlan(def, [{ id: 'T-01', valor: '1.234' }], { motor: Motor }).plan.valores['T-01'], undefined);
});
prueba('textoSeguro cubre el espacio (y el tabulador) delante de = + - @ \'', () => {
  [' =A1', '  +1', '\t-0.5', ' @config', " 'si'"].forEach((x) => assert.strictEqual(K.textoSeguro(x), "'" + x, JSON.stringify(x)));
  ['Vivienda', ' Vivienda', '', 'a=b', '2 recámaras'].forEach((x) => assert.strictEqual(K.textoSeguro(x), x));
});

/* repetición ola 6 · áreas que el preajuste no trae (activo:true) y áreas que sí trae y se quitan junto con tamaños nuevos: con estados y con solo valores, 0 diferencias */
const CASOS_AREAS = [
  ['(a) Sencillo + lobby activo', 'sencillo', { lobby: { activo: true } }],
  ['(a2) Sencillo + lobby activo con tamaño, estado y fuente', 'sencillo', { lobby: { activo: true, valor: 90, unidad: 'm2', estado: 'decidido', fuente: 'Plano de prueba' } }],
  ['(b) Sencillo + gimnasio 80 m² confirmado con fuente', 'sencillo', { gimnasio: { activo: true, valor: 80, unidad: 'm2', estado: 'confirmado', fuente: 'Plano de prueba' } }],
  ['(c) Con elevador + quitar elevadores + servicios 150 m²', 'elevador', { elevadores: { quitar: true }, servicios: { valor: 150, unidad: 'm2' } }],
  ['(c2) Con elevador + quitar elevadores + servicios 150 m² confirmado con fuente', 'elevador', { elevadores: { quitar: true }, servicios: { valor: 150, unidad: 'm2', estado: 'confirmado', fuente: 'Plano de prueba' } }],
  ['(d) Con amenidades sin gimnasio ni salón', 'amenidades', { gimnasio: { quitar: true }, salon: { quitar: true } }],
  ['(d2) Con amenidades sin gimnasio ni salón y terraza de 60 m²', 'amenidades', { gimnasio: { quitar: true }, salon: { quitar: true }, terraza: { valor: 60, unidad: 'm2', estado: 'decidido' } }],
];
CASOS_AREAS.forEach(([nombre, base, areas]) => {
  prueba('áreas fuera del preajuste · ' + nombre + ': 0 diferencias en los 191 factores, nodos, áreas (activo, m², estado y fuente) y resultado de las pruebas', () => {
    const p = ev(def, PLAN, { 'E-15': { opcion: base, estado: 'decidido', componentes: areas } });
    [false, true].forEach((soloValores) => {
      const { b } = idaVuelta(def, p, soloValores), x = huellaPlan(def, p), y = huellaPlan(def, b.plan);
      const d = soloValores ? ['factores', 'nodos'].filter((k) => diferencias(x[k], y[k]).length).map((k) => k + ': ' + diferencias(x[k], y[k]).slice(0, 4).join(',')).concat(x.resultado !== y.resultado ? ['resultado'] : [], x.pv !== y.pv ? ['cifras del visor'] : [], x.areasV !== y.areasV ? ['áreas: ' + x.areasV + ' vs ' + y.areasV] : []) : difs(x, y);
      assert.deepStrictEqual(d.concat(b.avisos.map((a) => 'aviso ' + a.codigo)), [], (soloValores ? 'solo valores' : 'con estados') + ' · ' + nombre);
    });
  });
});
prueba('áreas fuera del preajuste: la edición lleva activo:true cuando el tamaño es mayor que 0 y activo:false cuando es 0', () => {
  const p = ev(def, PLAN, { 'E-15': { opcion: 'sencillo', estado: 'decidido', componentes: { gimnasio: { activo: true, valor: 80, unidad: 'm2', estado: 'confirmado', fuente: 'Plano de prueba' } } } });
  const { b } = idaVuelta(def, p, true), ed = b.plan.componentes['E-15'];
  assert.strictEqual(ed.gimnasio.activo, true); assert.strictEqual(ed.gimnasio.valor, 80);
  const q = ev(def, PLAN, { 'E-15': { opcion: 'elevador', estado: 'decidido', componentes: { elevadores: { quitar: true } } } }), b2 = idaVuelta(def, q, true).b.plan.componentes['E-15'];
  assert.strictEqual(b2.elevadores.activo, false);
});
prueba('la opción base elegida no cambia las cifras: con solo valores, cada plan sembrado vuelve con las mismas áreas elija la base que elija', () => {
  const planes = SIEMBRA.siembra(def, 300, 20261123); let n = 0, malos = [];
  planes.forEach((p, i) => {
    const col = columnaDe(def, p), valores = {}; col.forEach((c) => { if (c.valor !== null && c.valor !== '') valores[c.id] = c.valor; });
    const base = K.columnaAPlan(def, valores, { motor: Motor }).plan, x = huellaPlan(def, base);
    ['sencillo', 'elevador', 'amenidades', 'motor_ppp'].forEach((o) => { const v2 = Object.assign({}, valores); const col2 = col.map((c) => c); const entra = Object.assign({}, valores); const r = K.columnaAPlan(def, col2.filter((c) => c.valor !== null && c.valor !== '').map((c) => (c.id === 'E-15' ? Object.assign({}, c, { opcion_base: o, estado: undefined }) : Object.assign({}, c, { estado: undefined, fuente: undefined }))), { motor: Motor }), y = huellaPlan(def, r.plan); n++; const d = ['factores', 'nodos'].filter((k) => diferencias(x[k], y[k]).length); if (x.resultado !== y.resultado) d.push('resultado'); if (x.areasV !== y.areasV) d.push('áreas'); if (d.length) malos.push('plan ' + i + ' base ' + o + ': ' + d.join(',')); });
  });
  assert.deepStrictEqual(malos.slice(0, 4), [], malos.length + ' de ' + n + ' combinaciones con diferencias');
  cifra(n + ' combinaciones (300 planes × 4 opciones base forzadas): 0 diferencias en factores, nodos, resultado y áreas, solo con valores');
});
console.log('\n══════════════════════════════════════════\npruebas: ' + R.ok + ' de ' + R.n + ' pasan' + (R.fallos.length ? ' · ' + R.fallos.length + ' FALLAN' : ' · TODO BIEN'));
R.fallos.forEach((f) => console.log(' - ' + f)); process.exit(R.fallos.length ? 1 : 0);
