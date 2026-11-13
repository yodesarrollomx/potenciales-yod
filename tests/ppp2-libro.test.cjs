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
  assert.equal(resumen('plan.defiende'), 2, 'el plan defiende su propuesta');
  assert.equal(resumen('plan.paso'), 'probar');
  assert.match(String(resumen('v2.huella')), /^h\d+(_-?\d+)+$/);
  assert.notEqual(resumen('v2.huella'), resumen('v3.huella'));
});

test('el tope de capital (1/3 de las ventas) sólo avisa: cuánto se pasa cada versión, al final del Resumen', () => {
  const dato = fila('Datos', 'din.capital');
  assert.match(String(dato[1]), /^Tope de capital: 1\/3 de las ventas/);
  const tope = Number(dato[2]), capital = fila('Modelo', 'capital').slice(4, 7);
  for (let k = 0; k < 3; k++) {
    const espera = Math.max(0, Math.round((Number(capital[k]) - tope) * 1000) / 1000);
    assert.ok(Math.abs(Number(ver('capital_sobre_tope')[k]) - espera) < 1e-6, 'V' + (k + 1) + ': capital ' + capital[k] + ' contra tope ' + tope);
    assert.equal(resumen('v' + (k + 1) + '.capital_sobre_tope'), ver('capital_sobre_tope')[k], 'el Resumen dice lo mismo');
  }
  // las claves nuevas del Resumen van al final, después de las que ya leían los libros vivos
  const claves = L.Resumen.valores.map((f) => String(f[0]).trim()).filter(Boolean);
  assert.deepEqual(claves.slice(claves.indexOf('plan.consejo_sin_leer') + 1), ['v1.capital_sobre_tope', 'v2.capital_sobre_tope', 'v3.capital_sobre_tope']);
  // y en Versiones va después de las comprobaciones: no mueve ningún renglón que ya existía
  const filas = L.Versiones.valores.map((f) => String(f[0]).trim());
  assert.ok(filas.indexOf('capital_sobre_tope') > filas.indexOf('ck_unidades'));
});

/* tests/fixtures/ppp2-ciclo.json sale de ppp2/libro/ciclo.py: la plantilla real con el plan inventado en
   distintos momentos de su vida, recalculada por LibreOffice. La edad y el siguiente paso los calcula el libro. */
const CICLO = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ppp2-ciclo.json'), 'utf8'));
const caso = (n) => { const e = CICLO.escenarios.find((x) => x.escenario === n); assert.ok(e, 'falta el escenario ' + n); return e; };

test('el plan llega a árbol sólo si el consejo aprueba ESA versión vigente (5 de 7, sin veto, misma huella)', () => {
  assert.equal(caso('plantilla vacía').edad, 'semilla', 'la plantilla vacía que copia Sembrar es semilla');
  assert.equal(caso('plantilla vacía').muestra, false, 'la plantilla vacía no enseña resultados');
  const esperado = {
    'vigente y aprobada': 'árbol',
    'vigente y aprobada, versión escrita como 2': 'árbol',
    'vigente sin consejo': 'plántula',
    'vigente con veto': 'plántula',
    'vigente con votos de otros números': 'plántula',     // los votos eran sobre otros números: ya no cuentan
    'el consejo aprueba la propuesta': 'plántula',        // aprobada por el consejo pero no vigente: falta Dirección
    'el consejo la regresa': 'plántula',
    'aprueban 4 de 7': 'plántula',
    'vigente aprobada y propuesta nueva regresada': 'árbol',   // que regresen una propuesta nueva no le quita el árbol a la vigente
    // una sesión con el mismo nombre que aprobó otros números, u otra versión, no vuelve árbol a la vigente
    'vigente: mismo nombre de sesión aprobó números viejos y regresa los de hoy': 'plántula',
    'vigente: la misma sesión aprobó la V3 y regresa la V2': 'plántula',
    'árbol con candados cerrados': 'flor',
    'flor con una propuesta nueva regresada y sin mejora': 'flor',
    'acuerdo firmado': 'fruto'
  };
  for (const [n, ed] of Object.entries(esperado)) assert.equal(caso(n).edad, ed, n);
  assert.match(caso('el consejo la regresa').falta, /Para ser árbol: una versión vigente que el consejo de planes apruebe \(5 de 7, sin veto\)/);
  assert.match(caso('el consejo la regresa').consejo, /Última sesión sobre la V2 con sus números de hoy: CP-1: aprueban 0 de 7\. La regresa\./);
  assert.match(caso('probada, falta el consejo').consejo, /todavía no se reúne sobre la V2 con sus números de hoy/);
  assert.match(caso('sesión incompleta: votaron 4').consejo, /aprueban 0 de 4\. Sesión incompleta: deben votar 7 jueces\./);
  assert.match(caso('flor con una propuesta nueva regresada y sin mejora').falta, /Firmar el acuerdo con el dueño/, 'la edad sigue pidiendo lo suyo aunque el paso hable de la propuesta nueva');
});

test('el siguiente paso del plan lo calcula el libro: probar, consejo, explorar, mundo, Dirección…', () => {
  const esperado = {
    'plantilla vacía': 'datos',
    'propuesta sin probar': 'probar',
    'pruebas de otros números': 'probar',                 // las pruebas eran de otros números: hay que repetirlas
    'probada, falta el consejo': 'consejo',
    'el consejo la regresa': 'explorar',                  // regresada: el plan mueve capital y arranque de obra
    'aprueban 4 de 7': 'explorar',
    'vigente con veto': 'explorar',
    'regresada y sin mejora por palancas': 'mundo',       // moviendo capital y arranque ya no mejora: falta el mundo real
    'sin mejora desde otros números': 'explorar',         // cambiaron los números: vuelve a explorar
    'el consejo aprueba la propuesta': 'direccion',
    'vigente y aprobada': 'candados',
    'vigente y aprobada, versión escrita como 2': 'candados',
    'vigente sin consejo': 'consejo',
    'vigente con votos de otros números': 'consejo',
    'vigente regresada y propuesta nueva en la V3': 'probar',
    'vigente aprobada y propuesta nueva regresada': 'explorar',
    'sólo la base': 'explorar',
    'la base sin mejora y no pasa': 'proponer',
    'árbol con candados cerrados': 'acuerdo',
    'acuerdo firmado': 'cumplido',
    // una versión que no pasa la revisión nunca va a pruebas ni al consejo
    'la propuesta no pasa la revisión': 'explorar',
    'la propuesta no pasa y ya no hay mejora': 'proponer',
    'la propuesta no pasa aunque tenga pruebas y votos': 'explorar',
    // una sesión vale con los siete jueces, sobre esa versión y esa huella
    'sesión incompleta: votaron 4': 'consejo',
    'la misma sesión dos veces: 14 votos': 'consejo',
    'mismo nombre de sesión: aprobó números viejos y regresa los de hoy': 'explorar',
    'vigente: mismo nombre de sesión aprobó números viejos y regresa los de hoy': 'explorar',
    'vigente: la misma sesión aprobó la V3 y regresa la V2': 'explorar',
    'votos escritos con espacios': 'direccion',           // «V2 », « V2», «V 2», «Versión 2»… y la huella con un espacio: se leen
    'votos sin huella': 'consejo',
    'votos sin versión': 'consejo',
    // el mundo real: si cambia la evidencia después de una sesión que la regresó, se vuelve a presentar
    'regresada, sin mejora y cambió la evidencia': 'consejo',
    'regresada, sin mejora, y se volvió a presentar con la evidencia nueva': 'mundo',
    // si la sesión no anotó la evidencia que había, no se sabe contra qué juzgó: se vuelve a presentar (antes se quedaba en «mundo» para siempre)
    'regresada, sin mejora, votos sin evidencia anotada': 'consejo',
    'flor con una propuesta nueva regresada y sin mejora': 'mundo',
    // una base que pasa la revisión explora primero; sólo después se prueba y se presenta
    'la base pasa: primero explora': 'explorar',
    'la base pasa con pruebas y votos pero sin haber explorado': 'explorar',
    'la base pasa y ya exploró sin mejora: se prueba': 'probar',
    'la base pasa, exploró y se probó: al consejo': 'consejo',
    'la base pasa, exploró y el consejo la aprueba: decide Dirección': 'direccion'
  };
  for (const [n, paso] of Object.entries(esperado)) assert.equal(caso(n).paso, paso, n);
  assert.equal(CICLO.escenarios.length, Object.keys(esperado).length, 'cada escenario del accesorio tiene su paso esperado aquí');
  assert.equal(caso('vigente regresada y propuesta nueva en la V3').defiende, 3, 'defiende la propuesta, no la vigente');
  assert.equal(caso('vigente aprobada y propuesta nueva regresada').sesion, 'CP-2');
  assert.match(caso('regresada y sin mejora por palancas').paso_texto, /conseguir lo que pidió el consejo .* moviendo capital y arranque de obra ya no mejora/);
  assert.match(caso('la propuesta no pasa y ya no hay mejora').paso_texto, /armar una propuesta que pase la revisión para fondos/);
  assert.match(caso('propuesta sin probar').falta, /Siguiente paso: probar la V2 contra los golpes/);
  // la base aprobada por el consejo sin haber explorado sigue en «explorar»: el libro dice que el consejo SÍ la aprobó
  // (la página no puede decir que «la regresó»)
  const b = caso('la base pasa con pruebas y votos pero sin haber explorado');
  assert.deepEqual([b.defiende, b.aprobada, b.aprueban, b.votaron], [1, true, 7, 7]);
  assert.equal(caso('la base pasa, exploró y el consejo la aprueba: decide Dirección').edad, 'plántula', 'aprobada por el consejo pero sin Dirección no es árbol');
});

test('los votos se cuentan por sesión, versión y huella; una sesión vale sólo con los siete jueces', () => {
  const cuenta = (n) => { const e = caso(n); return [e.sesion, e.aprueban, e.vetos, e.votaron, e.aprobada, e.sin_leer]; };
  assert.deepEqual(cuenta('el consejo aprueba la propuesta'), ['CP-1', 5, 0, 7, true, 0]);
  assert.deepEqual(cuenta('vigente con veto'), ['CP-1', 6, 1, 7, false, 0]);
  assert.deepEqual(cuenta('sesión incompleta: votaron 4'), ['CP-1', 0, 0, 4, false, 0]);
  assert.deepEqual(cuenta('la misma sesión dos veces: 14 votos'), ['CP-1', 7, 0, 14, false, 0], 'catorce votos con el mismo nombre no son una sesión: se vuelve a convocar');
  assert.deepEqual(cuenta('mismo nombre de sesión: aprobó números viejos y regresa los de hoy'), ['CP-1', 0, 0, 7, false, 0], 'los siete votos sobre otros números no se suman');
  assert.deepEqual(cuenta('vigente: la misma sesión aprobó la V3 y regresa la V2'), ['CP-1', 0, 0, 7, false, 0], 'ni los votos sobre otra versión');
  assert.deepEqual(cuenta('votos escritos con espacios'), ['CP-1', 5, 0, 7, true, 0]);
  assert.deepEqual(cuenta('votos sin huella'), ['', 0, 0, 0, false, 7], 'el libro avisa que hay votos que no puede leer');
  assert.deepEqual(cuenta('votos sin versión'), ['', 0, 0, 0, false, 7]);
  assert.equal(caso('regresada, sin mejora y cambió la evidencia').evidencia_sesion !== caso('regresada, sin mejora y cambió la evidencia').evidencia, true);
  assert.equal(caso('propuesta sin probar').paso_capital, 10, 'el paso de capital de la ronda lo da el libro: 3% del costo con tierra, a una cifra');
});

test('el ciclo «en chico» de los mundos de prueba dice lo mismo que las fórmulas del libro, escenario por escenario', () => {
  const { cicloDe } = require('./ppp2-mundo.cjs');
  for (const e of CICLO.escenarios) {
    const c = cicloDe({ edad: e.edad, estados: e.entradas.estados, revision: e.revision, huellas: e.huellas, evidencia: e.evidencia,
      pruebas: e.entradas.pruebas, consejo: e.entradas.consejo, rondas: e.entradas.rondas });
    const libro = { paso: e.paso, defiende: e.defiende, sesion: e.sesion, aprueban: e.aprueban, vetos: e.vetos, votaron: e.votaron,
      aprobada: e.aprobada, probada: e.probada, sin_mejora: e.sin_mejora, sin_leer: e.sin_leer, evidencia_sesion: e.evidencia_sesion };
    const chico = {};
    for (const k of Object.keys(libro)) chico[k] = c[k];
    assert.deepEqual(chico, libro, e.escenario);
    const arbol = ['árbol', 'flor', 'fruto'].indexOf(e.edad) >= 0;
    if (e.edad !== 'fruto') assert.equal(c.vigente_aprobada, arbol, e.escenario + ': árbol si y sólo si el consejo aprobó la vigente');
  }
});

test('los accesorios corresponden al generador: si cambia la plantilla hay que regenerarlos', () => {
  // la misma huella que calcula ppp2/libro/generar.py (huella_generador) sobre los archivos que producen los accesorios
  const crypto = require('node:crypto');
  const h = crypto.createHash('sha256');
  for (const nombre of ['generar.py', 'fixture.py', 'ciclo.py', 'rejilla.py', 'regenerar.py', 'ejemplo-plan.json', 'catalogo-preguntas.json']) {
    h.update(Buffer.concat([Buffer.from(nombre, 'utf8'), Buffer.from([0]), fs.readFileSync(path.join(RAIZ, 'ppp2/libro', nombre)), Buffer.from([0])]));
  }
  const huella = h.digest('hex');
  const REJILLA = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ppp2-rejilla.json'), 'utf8'));
  for (const [nombre, acc] of [['ppp2-libro-ejemplo.json', L], ['ppp2-ciclo.json', CICLO], ['ppp2-rejilla.json', REJILLA]]) {
    assert.equal(acc._generador, huella, nombre + ' no corresponde a ppp2/libro: ejecuta python3 ppp2/libro/regenerar.py (necesita LibreOffice)');
  }
});

test('ninguna fórmula pide ROW() de un rango fijo: en Google Sheets se sale de la hoja y da #N/A', () => {
  /* Visto en un libro real el 12-nov-2026 (LibreOffice no lo enseña, así que los accesorios tampoco):
     una hoja nace con 1000 renglones; un rango que se sale se recorta al leer sus valores (996), pero
     ROW(rango) no se recorta (5000) y la operación entre los dos queda en #N/A. Los números de fila se
     piden con ROW(OFFSET(celda,0,0,ROWS(rango))), que mide lo mismo que los valores. */
  const fuente = fs.readFileSync(path.join(RAIZ, 'ppp2/libro/generar.py'), 'utf8')
    .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const usos = fuente.match(/\bROW\((?!\))[^,]{0,40}/g) || [];
  assert.ok(usos.length >= 1, 'el ciclo usa números de fila');
  for (const u of usos) assert.match(u, /^ROW\(OFFSET\(/, 'ROW() de un rango fijo: ' + u);
});

test('la plantilla no trae datos de planes reales', () => {
  for (const f of ['ppp2/libro/generar.py', 'ppp2/libro/ejemplo-plan.json', 'ppp2/libro/ciclo.py', 'ppp2/libro/rejilla.py', 'ppp2/libro/regenerar.py',
    'tests/fixtures/ppp2-libro-ejemplo.json', 'tests/fixtures/ppp2-ciclo.json', 'tests/fixtures/ppp2-rejilla.json',
    'architecture-impact.json', 'docs/ppp2.md', 'ppp2/libro/README.md', 'server/ppp2/INSTALAR.md']) {
    const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    assert.doesNotMatch(t, /Mor[eé]o|Avermont|Morelos|Colinas del Bachoco|aurumarquitectos/i, f);
  }
});
