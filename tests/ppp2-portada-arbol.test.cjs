'use strict';
/* La portada enseña cada proyecto del árbol una sola vez. Prueba las dos funciones de agrupar tal como están en ppp2.js
   (se extraen del archivo; no usan red ni pantalla). Nombres inventados. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ppp2.js'), 'utf8');
const trozo = src.slice(src.indexOf('  function claveProyecto(n) {'), src.indexOf('  function pintarVivero() {'));
const { agrupaArbol, claveProyecto } = new Function(trozo + '; return { agrupaArbol: agrupaArbol, claveProyecto: claveProyecto };')();
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
