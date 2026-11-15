'use strict';
// Núcleo de la foto del PPP 1 para el visor. Datos inventados; ninguna prueba abre la red ni escribe en hojas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const N = require('../scripts/visor-fotos/nucleo.cjs');

const raiz = path.resolve(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

/* Un motor de juguete con la misma estructura que los tableros: deslizantes, PRELLENADO, DEFAULTS y computar. */
const HTML = `<!doctype html><body>
<input type="range" id="inA" min="0" max="100" step="5" value="10">
<input id="inB" type="range" min="1" max="2" step="0.1" value="1.5">
<input type='range' id='inC' min='0' max='1000' step='any' value='3'>
<input type="number" id="inNo" value="9">
<script>
(() => {
  const PRELLENADO={inA:42,inB:1.26,
    inZ:7};
  const DEFAULTS=Object.assign(Object.fromEntries(controls.map(c=>[c.id,Number(c.value)])),{inModo:1},PRELLENADO);
  Object.entries(DEFAULTS).forEach(([id,v])=>{const c=$(id);if(c)c.value=v});
  function ayuda(x){return x*2}
  function computar(vals){const venta=ayuda(vals.inA)*1e6, costo=vals.inB*1e6; return {venta, costo, utilidad: venta-costo, raro: NaN};}
  function clampRelations(){if(get('inA')+get('inB')>50)setControl('inA',50-get('inB'))}
  function calculate(){ document.body; }
})();
</script>`;

test('controles: lee los deslizantes como los ve el navegador', () => {
  const c = N.controles(HTML);
  assert.deepEqual(Object.keys(c), ['inA', 'inB', 'inC']);
  assert.equal(c.inB.paso, 0.1);
  assert.equal(c.inC.paso, 'any');
  assert.equal(c.inA.valor, 10);
});

test('sanea: rango, paso, empate hacia arriba y máximo fuera de la rejilla (comprobado contra Chromium)', () => {
  const c = N.controles('<input type="range" id="x" min="0" max="103" step="5" value="0"><input type="range" id="y" min="0.3" max="7" step="0.25" value="1"><input type="range" id="z" min="1" max="8" step="1">').valueOf();
  assert.equal(N.sanea(c.x, 102.6), 100);       // 105 se sale: baja un paso
  assert.equal(N.sanea(c.x, 7.5), 10);           // empate: hacia arriba
  assert.equal(N.sanea(c.x, -3), 0);
  assert.equal(N.sanea(c.x, 1e9), 100);
  assert.equal(N.sanea(c.y, 2.25), 2.3);
  assert.equal(N.sanea(c.y, 0.1), 0.3);
  assert.equal(N.sanea(c.x, ''), 0);             // no es número: el valor por omisión
  assert.equal(c.z.valor, 5);                    // sin value: el punto medio (4.5) redondeado
  assert.equal(N.sanea({ min: 0, max: 1000, paso: 'any', base: 0 }, 3.14159), 3.14159);
});

test('valoresPorDefecto: PRELLENADO encima de los deslizantes, saneado; lo que no es deslizante queda aparte', () => {
  const d = N.valoresPorDefecto(HTML);
  assert.deepEqual(d.vals, { inA: 40, inB: 1.3, inC: 3 });     // 42 → paso de 5; 1.26 → paso de 0.1
  assert.deepEqual(d.extras, { inModo: 1, inZ: 7 });
  assert.equal(d.prellenado.inA, 42);
});

test('cortaMotor: corre computar sin DOM y clona su resultado', () => {
  const m = N.cortaMotor(HTML, { desde: '  function ayuda', hasta: '  function calculate(){' });
  const r = m.computar({ inA: 10, inB: 2 });
  assert.equal(r.utilidad, 18e6);
  assert.equal(r.raro, null);                    // como tests/ppp-fixture.js: JSON convierte NaN en null
  assert.equal(typeof m.contexto.ayuda, 'function');
  assert.match(m.huella, /^[0-9a-f]{16}$/);
  assert.throws(() => N.cortaMotor(HTML, { desde: 'no existe', hasta: 'function calculate' }), /inicio del motor/);
});

test('relaciones: corre clampRelations del HTML con deslizantes de mentira', () => {
  const c = N.controles(HTML);
  const r = N.relaciones(HTML, { inA: 60, inB: 2, inC: 3 }, c);
  assert.equal(r.inA, 50);                       // 48 → paso de 5 → 50 (lo mismo que haría el navegador)
});

test('entradas: renglón salta vacíos; escenario aplica Number("") = 0; lo que no es control se informa', () => {
  const c = N.controles(HTML);
  const renglon = { caso_id: 'caso-de-prueba', inA: '', inB: '1.7', inC: 'x', otra: 5, inSinControl: 3 };
  assert.deepEqual(N.entradasDeRenglon(renglon), { inB: 1.7, inSinControl: 3 });
  const base = { inA: 40, inB: 1.3, inC: 3 };
  assert.deepEqual(N.aplica(base, { inA: '', inB: 1.7 }, c, { modo: 'renglon' }), { inA: 40, inB: 1.7, inC: 3 });
  const informe = [], visto = [];
  const r = N.aplica(base, { inA: '', inC: null, inModo: 2, inNada: 1 }, c, { extras: { inModo: v => visto.push(v) }, informe });
  assert.equal(r.inA, 0);
  assert.equal(r.inC, 0);
  assert.deepEqual(visto, [2]);
  assert.deepEqual(informe, ['inNada']);
});

test('leeEscenarios: como escDesdeJson (filtra, a lo más 8, base y activa)', () => {
  const lista = Array.from({ length: 10 }, (_, i) => ({ id: 'e' + i, nombre: 'Versión ' + i, inputs: { inA: i } }));
  lista.splice(2, 0, { id: 'roto' }, null);
  const e = N.leeEscenarios(JSON.stringify(lista));
  assert.equal(e.lista.length, 8);
  assert.equal(e.lista[0].esBase, true);
  assert.equal(e.activo.id, 'e0');
  lista[5].activo = true;
  assert.equal(N.leeEscenarios(lista).activo.id, lista[5].id);
  assert.deepEqual(N.leeEscenarios('no es json'), { lista: [], activo: null, n: null });
});

test('huella: no depende del orden; cambia con cualquier número', () => {
  const a = N.huella({ inA: 1, inB: { x: 2, y: [1, 2] } }), b = N.huella({ inB: { y: [1, 2], x: 2 }, inA: 1 });
  assert.equal(a, b);
  assert.match(a, /^e1-[0-9a-f]{32}$/);
  assert.notEqual(a, N.huella({ inA: 1.0001, inB: { x: 2, y: [1, 2] } }));
  assert.equal(N.huella({ a: -0 }), N.huella({ a: 0 }));
});

test('concilia: 0.5 % en ventas, costo y utilidad; vacío = sin dato; sin nada = null', () => {
  const resumen = { ventas: '1000000', costo_proyecto: 800000, utilidad: 200000 };
  assert.equal(N.concilia({ cifras: { ventas: 1004000, costo_proyecto: 800000, utilidad: 200999 } }, resumen).ok, true);
  const fuera = N.concilia({ ventas: 1006000, costo_proyecto: 800000, utilidad: 200000 }, resumen);
  assert.equal(fuera.ok, false);
  assert.equal(fuera.campos[0].ok, false);
  assert.equal(N.concilia({ ventas: 1, costo_proyecto: 1, utilidad: 1 }, { ventas: '', costo_proyecto: '' }).ok, null);
  assert.equal(N.concilia({ ventas: null, costo_proyecto: 800000, utilidad: 200000 }, resumen).ok, false);   // el motor no lo dio
  assert.equal(N.concilia({ ventas: 0.6, costo_proyecto: 0, utilidad: 0 }, { ventas: 0, costo_proyecto: 0, utilidad: 0 }).ok, true);  // piso de un peso
});

test('conciliaFlujo: meses, totales, deuda máxima y caja final', () => {
  const g = [[1, 0, 500, 500, 0, 0, 0], [2, 1000, 200, 0, 10, 0, 300]];
  assert.equal(N.conciliaFlujo(g.map(f => f.slice()), g).ok, true);
  assert.equal(N.conciliaFlujo([g[0]], g).ok, false);
  assert.equal(N.conciliaFlujo(g, []).ok, null);
});

test('la forma vacía tiene todas las claves del servidor y del libro', () => {
  const visorGs = leer('server/ppp2/Visor.gs'), generar = leer('ppp2/libro/generar.py');
  const f = N.formaVacia();
  const filas = Object.keys(eval('({' + /FILAS: \{([\s\S]*?)\n  \},/.exec(visorGs)[1] + '})'));
  assert.deepEqual(Object.keys(N.FILAS_FLUJO).sort(), filas.sort());
  const mov = JSON.parse(/MOVIMIENTO: (\[[^\]]*\])/.exec(visorGs)[1].replace(/'/g, '"'));
  assert.deepEqual(N.MOVIMIENTO, mov);
  const datos = JSON.parse(/DATOS: (\[[^\]]*\])/.exec(visorGs)[1].replace(/'/g, '"').replace(/\s+/g, ' '));
  assert.deepEqual(Object.keys(N.DATOS), datos);
  const bloque = /VER_FILAS = \[([\s\S]*?)\n\]/.exec(generar)[1];
  const ver = [...bloque.matchAll(/^\s*\("([a-z_0-9]+)",/gm)].map(m => m[1]).filter(k => k !== 'propuesta_por' && k !== 'aprobada_por');
  assert.deepEqual(N.CLAVES_V, ver.concat('huella'));
  assert.deepEqual(Object.keys(f.v), N.CLAVES_V);
  assert.ok(Object.values(f.v).every(x => x === null));
  assert.equal(f.flujo.meses, null);
  for (const k of N.RESERVADAS) assert.ok(!(k in f), 'la forma no trae ' + k);
  for (const k of ['plan', 'version', 'versiones', 'v', 'datos', 'productos', 'flujo', 'reparto', 'candados', 'pruebas', 'pruebas_viejas', 'ultimo', 'cambio', 'origen']) assert.ok(k in f, k);
  assert.deepEqual(N.valida(f), []);
});

test('armaFlujo: pesos a MDP, totales con la regla del libro y recorte al último movimiento', () => {
  const fl = N.armaFlujo({ firmas: [2, 1, 0, 0], cobranza: [1e6, 2.5e6, 0, 0], saldo_banco: [3e6, 1e6, 0, 0], caja: [0, 0.5e6, 0.5e6, 0.5e6] });
  assert.equal(fl.meses, 2);
  assert.deepEqual(fl.filas.cobranza, [1, 2.5]);
  assert.deepEqual(fl.filas.firmas, [2, 1]);
  assert.equal(fl.total.cobranza, 3.5);
  assert.equal(fl.total.saldo_banco, 3);
  assert.equal(fl.total.caja, 0.5);
  assert.equal(N.armaFlujo({ cobranza: [1e6, 0, 0] }, { mesReparto: 3 }).meses, 3);
  assert.deepEqual(N.armaFlujo({}), { meses: null, filas: {}, total: {} });
  assert.throws(() => N.armaFlujo({ cobros: [1] }), /desconocida/);
});

test('productos: ventas y precio por unidad en MDP; sin m² ni unidades no entra', () => {
  const p = N.productos([{ nombre: 'Tipo A', unidades: 10, m2: 600, precio_m2: 30000, ventas: 18e6, precio_unidad: 1.8e6 }, { nombre: 'Vacío' }]);
  assert.deepEqual(p, [{ nombre: 'Tipo A', unidades: 10, m2: 600, precio_m2: 30000, ventas: 18, precio_unidad: 1.8 }]);
});

test('registro: estado, plan_id, límites del servidor y claves reservadas', () => {
  const base = { caso_id: 'caso-de-prueba', tipo: 'VERTICAL', escenario: { id: 'e1', nombre: 'Base' }, orden: 1, origen: 'lote', calculado: '2026-01-02 03:04', visor: {} };
  const ok = N.registro(Object.assign({ conciliacion: { ok: true } }, base));
  assert.equal(ok.estado, 'lista');
  assert.equal(ok.plan_id, 'ppp:caso-de-prueba:e1');
  assert.deepEqual(Object.keys(ok).filter(k => k !== 'plan_id'), N.COLUMNAS);
  assert.equal(N.registro(Object.assign({ conciliacion: { ok: false } }, base)).estado, 'propuesta');
  assert.equal(N.registro(Object.assign({ conciliacion: N.sinReferencia() }, base)).estado, 'lista');
  assert.throws(() => N.registro(Object.assign({}, base, { visor: { esquema: 'x' } })), /reservada/);
  assert.throws(() => N.registro(Object.assign({}, base, { visor: { cosa: 1 } })), /desconocida/);
  assert.throws(() => N.registro(Object.assign({}, base, { caso_id: 'a b' })), /caso_id/);
  assert.throws(() => N.registro(Object.assign({}, base, { visor: { plan: { nombre: 'x'.repeat(N.VISOR_MAX) } } })), /visor_json mide/);
  assert.throws(() => N.registro(Object.assign({}, base, { orden: 0 })), /orden/);
  assert.equal(N.planId('caso-de-prueba'), 'ppp:caso-de-prueba');
});

/* Un módulo de motor de juguete, con la interfaz que deben exportar scripts/visor-fotos/<motor>.cjs. */
const juguete = {
  TIPO: 'VERTICAL',
  foto(caso, ctx) {
    const N2 = ctx.nucleo, ctrls = N2.controles(HTML), def = N2.valoresPorDefecto(HTML, ctrls);
    let vals = N2.aplica(def.vals, N2.entradasDeRenglon(caso.renglon), ctrls, { modo: 'renglon' });
    if (ctx.version.escenario) vals = N2.aplica(vals, ctx.version.escenario.inputs, ctrls);
    if (vals.inA === 95) throw new Error('el motor no puede con esta versión');
    const m = N2.cortaMotor(HTML, { desde: '  function ayuda', hasta: '  function calculate(){' });
    const r = m.computar(vals);
    return {
      entradas: vals, origen: 'lote', cifras: { ventas: r.venta, costo_proyecto: r.costo, utilidad: r.utilidad },
      visor: { v: { ventas: N2.mdp(r.venta), ganancia: N2.mdp(r.utilidad) } },
      flujo: [[1, r.venta, r.costo, 0, 0, 0, r.utilidad]]
    };
  }
};
function casoJuguete() {
  return {
    tipo: 'VERTICAL',
    renglon: { caso_id: 'caso-de-prueba', version: 3, ventas: 80e6, costo_proyecto: 1.3e6, utilidad: 78.7e6,
      escenarios_json: JSON.stringify([{ id: 'e1', nombre: 'Base', esBase: true, inputs: { inA: 40 } }, { id: 'e2', nombre: 'Activa', activo: true, inputs: { inA: 40 } }, { nombre: 'Sin id', inputs: { inA: 20 } }]) },
    flujo: [[1, 80e6, 1.3e6, 0, 0, 0, 78.7e6]], flujo_version: 3
  };
}

test('tomaFotos: una foto por versión; sólo la activa se concilia; la última lista queda elegida', () => {
  const { fotos, errores } = N.tomaFotos(juguete, casoJuguete(), { calculado: '2026-01-02 03:04' });
  assert.deepEqual(errores, []);
  assert.deepEqual(fotos.map(f => [f.orden, f.escenario_id, f.estado, f.elegida]), [[1, 'e1', 'lista', ''], [2, 'e2', 'lista', ''], [3, 'v3', 'lista', 'sí']]);
  const c1 = JSON.parse(fotos[0].conciliacion), c2 = JSON.parse(fotos[1].conciliacion);
  assert.equal(c1.nota, N.SIN_REFERENCIA);
  assert.equal(c2.ok, true);
  assert.equal(c2.flujo.ok, true);
  const v = JSON.parse(fotos[1].visor_json);
  assert.equal(v.v.ventas, 80);
  assert.equal(v.v.estado, null);                  // «vigente» lo pone el servidor según `elegida`
  assert.equal(v.plan.vigente, null);
  assert.equal(v.version, 2);
  assert.deepEqual(v.versiones.map(x => x.n), [1, 2, 3]);
  assert.equal(v.origen, 'PPP · vertical · versión «Activa» · foto del 2-ene-2026');
  assert.ok(!/:"[^"]*vigente/.test(fotos.map(f => f.visor_json).join('')));   // ningún valor dice «vigente»
  assert.equal(fotos[0].huella_entradas, fotos[1].huella_entradas);   // mismas entradas, misma huella
});

test('tomaFotos: activa fuera de tolerancia queda propuesta; una versión que truena no tumba a las demás', () => {
  const caso = casoJuguete();
  caso.renglon.ventas = 90e6;
  const lista = JSON.parse(caso.renglon.escenarios_json);
  lista[2].inputs.inA = 95;
  caso.renglon.escenarios_json = JSON.stringify(lista);
  const { fotos, errores } = N.tomaFotos(juguete, caso, { calculado: '2026-01-02 03:04' });
  assert.deepEqual(fotos.map(f => [f.orden, f.estado, f.elegida]), [[1, 'lista', 'sí'], [2, 'propuesta', '']]);
  assert.equal(errores.length, 1);
  assert.equal(errores[0].orden, 3);
  assert.match(JSON.parse(fotos[1].visor_json).origen, /sin conciliar/);
});

test('elige: un solo puntero por caso, con quién y cuándo; no toca las fotos', () => {
  const { fotos } = N.tomaFotos(juguete, casoJuguete(), { calculado: '2026-01-02 03:04' });
  const otra = N.elige(fotos, 'caso-de-prueba', 1, { por: 'Dirección', fecha: '2026-01-03' });
  assert.deepEqual(otra.map(f => f.elegida), ['sí', '', '']);
  assert.equal(otra[0].elegida_por, 'Dirección');
  assert.deepEqual(otra.map(f => f.visor_json), fotos.map(f => f.visor_json));
  assert.deepEqual(N.eligeUltima(otra).map(f => f.elegida), ['sí', '', '']);   // lo que eligió Dirección se respeta
  assert.throws(() => N.elige(fotos, 'caso-de-prueba', 9, { por: 'x', fecha: '2026-01-03' }), /No hay foto/);
  assert.equal(N.aFila(otra[0]).length, N.COLUMNAS.length);
});

test('ensayo: JSON local a JSON local, nunca dentro del repositorio', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visor-fotos-'));
  const entrada = path.join(dir, 'renglones.json'), salida = path.join(dir, 'fotos.json');
  fs.writeFileSync(entrada, JSON.stringify({ casos: [casoJuguete(), { tipo: 'LOGISTICO', renglon: { caso_id: 'otro-caso' } }] }));
  const out = N.ensayo(entrada, salida, { calculado: '2026-01-02 03:04', modulos: { VERTICAL: juguete }, sinMotor: true });
  assert.equal(out.resumen.fotos, 3);
  assert.equal(out.resumen.elegidas, 1);
  assert.equal(out.errores.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(salida, 'utf8')).columnas, N.COLUMNAS);
  assert.throws(() => N.ensayo(entrada, path.join(raiz, 'fotos.json')), /dentro del repositorio/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('los cinco motores reales se cortan y corren con sus valores por defecto', () => {
  for (const tipo of Object.keys(N.MOTORES)) {
    const m = N.motor(tipo);
    const vals = Object.assign({}, m.defaults.vals, m.defaults.extras);
    const extra = tipo === 'RESIDENCIAL' ? [m.contexto.viviendaDefault()] : [];
    const r = m.computar(vals, ...extra);
    assert.ok(r && typeof r === 'object' && Object.keys(r).length > 20, tipo);
    assert.ok(Object.keys(m.controles).length > 10, tipo);
  }
});

test('el corte del vertical da lo mismo que tests/ppp-fixture.js y respeta clampRelations', () => {
  const F = require('./ppp-fixture.js');
  const v = N.motor('VERTICAL');
  assert.deepEqual(v.computar(F.inputs), F.compute(F.inputs));
  const r = N.relaciones(v.html, Object.assign({}, v.defaults.vals, { inEng: 70, inObra: 50, inCom: 1e9 }), v.controles);
  assert.equal(r.inObra, 30);
  assert.ok(r.inCom <= r.inTerreno * r.inCOS / 100);
});
