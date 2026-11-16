'use strict';
/* La maquila del visor, lo que es del servidor (server/ppp2/Visor.gs, 15-nov-2026): la versión que el libro muestra no
   se cae en silencio de la lista «todas» aunque no calcule, y los textos que no caben en su tope se cortan en palabra
   y con «…» (antes a media palabra y sin aviso). Mundo de dobles (tests/ppp2-mundo.cjs); plan y casos INVENTADOS.
   Corre con: node --test tests/ppp2-visor-maquila.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const { mundo, PLAN, filaDe, POTENCIALES, FOTO_CAB } = require('./ppp2-mundo.cjs');

const LIGA = 'liga0000000000000000000000000001';
const renglon = (cambios) => Object.values(Object.assign({ liga: LIGA, plan_id: PLAN, para: 'Grupo de prueba', estado: 'activa', vence: '', versiones: '', etiquetas: '', creada: '2026-01-01', nota: '' }, cambios || {}));
const conLiga = (cambios, op) => mundo(Object.assign({ ligas: [renglon(cambios)], aperturas: true }, op || {}));
const pide = (w, extra) => w.get(Object.assign({ recurso: 'ppp2-visor', liga: LIGA }, extra || {}));

test('con «todas», la versión que el libro muestra entra a la lista aunque no calcule (antes se veía la V1 sin decir nada)', () => {
  const w = conLiga({ versiones: 'todas' });
  const res = w.libro.getSheetByName('Resumen');
  assert.equal(res.v[filaDe(res, 'plan.version_mostrada') - 1][1], 2, 'el libro de ejemplo muestra la V2');
  res.v[filaDe(res, 'v2.ganancia') - 1][1] = '';                       // la V2 no calcula (p. ej. un dato en cero)
  const r = pide(w);
  assert.equal(r.ok, true);
  assert.equal(r.version, 2, 'se ve la que el libro muestra, con sus «sin dato»');
  assert.ok(r.versiones.some((x) => x.n === 2), 'y está en la lista');
  assert.ok(r.versiones.some((x) => x.n === 1), 'las que calculan siguen');
  assert.equal(r.v.ganancia === null || r.v.ganancia === undefined || r.v.ganancia === '', true, 'su ganancia viene vacía');
  /* con una lista explícita manda la lista: la mostrada no se agrega */
  const w2 = conLiga({ versiones: '1' }), res2 = w2.libro.getSheetByName('Resumen');
  res2.v[filaDe(res2, 'v2.ganancia') - 1][1] = '';
  assert.deepEqual(pide(w2).versiones.map((x) => x.n), [1]);
});

const CASO = 'casoprueba01';
const LARGO = 'Sin socio de tierra: la tierra se compra al arrancar; el inversionista cobra su rendimiento y la utilidad es de quien pone el capital';
const QUE = 'Con precio de mercado pierde y le falta dinero a media obra; con un precio un poco mayor (el caso usa un rango amplio) y un capital moderado cuadra, y con una venta más rápida de los lotes grandes la caja aguanta sin respaldo';
const vista = (extra) => JSON.stringify(Object.assign({
  esquema: 'ppp2-visor-v1', plan: { nombre: 'Caso Ejemplo', edad: '', mostrada: 1, esquema: LARGO }, version: 1, versiones: [{ n: 1, nombre: 'Base', estado: 'vigente' }],
  v: { ventas: 100, que_cambia: QUE }, datos: {}, productos: [], flujo: { meses: 0, filas: {}, total: {} }, reparto: { numero: 1, esquema: LARGO },
  candados: [], pruebas: [], pruebas_viejas: 0, ultimo: null, cambio: '', origen: 'PPP · casa · versión «Base» · foto del 1-feb-2026'
}, extra || {}));
const foto = (c) => FOTO_CAB.map((k) => (k in c ? c[k] : ({ caso_id: CASO, tipo: 'unifamiliar', escenario_id: 'e1', escenario_nombre: 'Base', estado: 'lista',
  elegida: '', elegida_por: '', elegida_fecha: '', orden: 1, motor_commit: 'abc1234', huella_entradas: 'h1', calculado: '2026-02-01 10:00',
  origen: 'lote', conciliacion: 'ok', visor_json: vista() })[k]));

test('los textos de una foto que no caben se cortan en palabra y con «…» (esquema a 80, textos de la versión a 200)', () => {
  const w = mundo({ fotos: [foto({})], ligas: [renglon({ plan_id: 'ppp:' + CASO })], config: [['potenciales_id', POTENCIALES]] });
  const r = pide(w);
  assert.equal(r.ok, true);
  for (const [nombre, t, max, entero] of [['reparto.esquema', r.reparto.esquema, 80, LARGO], ['plan.esquema', r.plan.esquema, 80, LARGO], ['v.que_cambia', r.v.que_cambia, 200, QUE]]) {
    assert.ok(t.length <= max, nombre + ' cabe en ' + max + ' (' + t.length + ')');
    assert.ok(t.endsWith('…'), nombre + ' dice que sigue: ' + t);
    const sin = t.slice(0, -1);
    assert.ok(entero.startsWith(sin), nombre + ' es el principio del texto');
    assert.match(entero.charAt(sin.length), /[\s,;:]/, nombre + ' se corta entre palabras, no a media palabra: «' + t + '»');
  }
  /* lo que cabe no cambia */
  const corto = mundo({ fotos: [foto({ visor_json: vista({ reparto: { numero: 1, esquema: 'Tierra comprada' } }) })], ligas: [renglon({ plan_id: 'ppp:' + CASO })], config: [['potenciales_id', POTENCIALES]] });
  assert.equal(pide(corto).reparto.esquema, 'Tierra comprada');
});

test('el nombre de un esquema del libro que no cabe también se corta en palabra', () => {
  const w = conLiga(), rep = w.libro.getSheetByName('Reparto');
  /* Reparto!B5 = esquema elegido (1 a 5); renglón 8 = nombres de los esquemas (B8:F8) */
  const elegido = Number(rep.v[4][1]);
  assert.ok(elegido >= 1 && elegido <= 5);
  rep.v[7][elegido] = 'B · Cincuenta y cincuenta con la tierra pagada a su valor antes de repartir la utilidad del proyecto';
  const r = pide(w);
  assert.ok(r.reparto.esquema.length <= 80 && r.reparto.esquema.endsWith('…'), r.reparto.esquema);
  assert.equal(r.reparto.esquema, 'B · Cincuenta y cincuenta con la tierra pagada a su valor antes de repartir la…');
});
