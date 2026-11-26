'use strict';
/* La portada enseña cada proyecto del árbol una sola vez. Prueba las dos funciones de agrupar tal como están en ppp2.js
   (se extraen del archivo; no usan red ni pantalla). Nombres inventados. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ppp2.js'), 'utf8');
const trozo = src.slice(src.indexOf('  function claveProyecto(n) {'), src.indexOf('  function pintarVivero() {'));
const { agrupaArbol, claveProyecto, casoArbol } = new Function('var estado = {}, leer = function () {}, pintarVivero = function () {};' + trozo + '; return { agrupaArbol: agrupaArbol, claveProyecto: claveProyecto, casoArbol: casoArbol };')();
const gs = fs.readFileSync(path.join(__dirname, '..', 'server', 'ppp2', 'ArbolPPP.gs'), 'utf8');
const arbolCasoServidor = new Function(gs.slice(gs.indexOf('function arbol_caso_(nombre) {'), gs.indexOf('function arbol_visor_pon_(')) + '; return arbol_caso_;')();
const arbolJs = fs.readFileSync(path.join(__dirname, '..', 'arbol-ppp', 'servidor.js'), 'utf8');
const casoVisor = new Function(arbolJs.slice(arbolJs.indexOf('    function casoVisor(n) {'), arbolJs.indexOf('    function pinta() {')) + '; return casoVisor;')();
const visorJs = fs.readFileSync(path.join(__dirname, '..', 'visor.js'), 'utf8');
const col = (columna, nombre, version) => ({ columna, nombre, version, estado: 'Borrador' });

test('mayúsculas, acentos, espacios y signos no hacen otro proyecto', () => {
  assert.equal(claveProyecto('  Predio  Ñandú · 12 '), claveProyecto('predio nandu 12'));
  assert.notEqual(claveProyecto('Predio Ñandú 12'), claveProyecto('Predio Ñandú 13'));
});
test('una tarjeta por proyecto, en el orden en que aparecen, y abre la versión de más a la derecha', () => {
  const g = agrupaArbol([col('P', 'Predio Uno', 'V1'), col('BR', 'Predio Dos', 'V3'), col('BS', 'Torre Tres', 'V3'), col('BZ', 'predio dos', 'V4'),
    col('CA', 'Predio  Dos ', 'V5'), col('BW', 'Torre Tres', 'V1'), col('Z', 'TORRE TRES', 'V2')]);
  assert.deepEqual(g.map((x) => x.nombre), ['Predio Uno', 'Predio Dos', 'Torre Tres']);
  assert.deepEqual(g.map((x) => x.versiones.length), [1, 3, 3]);
  assert.deepEqual(g.map((x) => x.abre.columna), ['P', 'CA', 'BW'], 'BW va después de BS y de Z: las letras se ordenan como columnas');
  assert.deepEqual(g[2].versiones.map((x) => x.columna), ['Z', 'BS', 'BW']);
});
test('sin columnas no hay tarjetas, y un plan sin nombre no se junta con otro', () => {
  assert.deepEqual(agrupaArbol([]), []); assert.deepEqual(agrupaArbol(null), []);
  assert.equal(agrupaArbol([col('P', '', 'V1'), col('Q', '', 'V1')]).length, 2);
});
test('la portada no vuelve a pintar una tarjeta por columna', () => {
  assert.match(src, /proyectos\.map\(function \(g\)/);
  assert.doesNotMatch(src, /estado\.arbolPlanes\.map\(function \(c\)/);
});

test('la portada, el árbol y el servidor arman el mismo caso del visor para un proyecto', () => {
  ['Predio de Muestra · Ñandú 12', '  TORRE  tres ', 'Uno/Dos (prueba)', 'Áé íóú ñ', 'x'.repeat(90) + ' fin', ''].forEach((n) => {
    assert.equal(casoArbol(n), arbolCasoServidor(n), 'portada: ' + n);
    assert.equal(casoVisor(n), arbolCasoServidor(n), 'árbol: ' + n);
  });
});
test('el visor sólo abre sin liga un proyecto del árbol, y sólo con la sesión del navegador', () => {
  const re = /var m = (\/\[#&\?\]p=.*?\/)\.exec\(root\.location\.hash/.exec(visorJs);
  assert.ok(re, 'la regla de #p= está en visor.js');
  const regla = new RegExp(re[1].slice(1, -1));
  assert.ok(regla.test('#p=ppp:arbol-predio-de-muestra'));
  ['#p=ppp:otro-caso', '#p=p123abc', '#p=ppp:arbol-', '#p=ppp:arbol-Con-Mayus', '#p=ppp:arbol-uno:c2'].forEach((h) => assert.equal(regla.test(h), false, h));
  assert.match(visorJs, /if \(deSesion && sesion\(\)\)/, 'sin sesión no entra por #p=');
  assert.match(visorJs, /estado\.porSesion \? '' : '&liga='/, 'por sesión no se manda liga');
});

test('un proyecto sin ninguna versión en el visor no ofrece «Ver visor»; uno con versiones fija su buena', async () => {
  const respuestas = {
    'ppp:arbol-sin-visor': { ok: false, error: 'plan' },
    'ppp:arbol-con-visor': { ok: true, elige: { versiones: [{ v: 'cP', buena: false }, { v: 'cQ', buena: true }] } }
  };
  const hecho = new Function('respuestas', 'var estado = { planId: "x" }, leer = function (r, q) { return Promise.resolve(respuestas[q.plan]); }, pintarVivero = function () {};' + trozo +
    '; return { cargarBuenas: cargarBuenas, estado: estado };')(respuestas);
  hecho.cargarBuenas([{ nombre: 'Sin visor', versiones: [col('P', 'Sin visor', 'V1')] }, { nombre: 'Con visor', versiones: [col('P', 'Con visor', 'V1'), col('Q', 'Con visor', 'V2')] }]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(hecho.estado.arbolSinVisor['arbol-sin-visor'], true);
  assert.equal((hecho.estado.arbolSinVisor || {})['arbol-con-visor'], undefined);
  assert.equal(hecho.estado.arbolBuena['arbol-con-visor'], 'Q');
  assert.match(src, /caso && !\(estado\.arbolSinVisor \|\| \{\}\)\[caso\] \? '<a class="p2-btn suave" data-abre-visor/, 'la tarjeta esconde el botón');
});
