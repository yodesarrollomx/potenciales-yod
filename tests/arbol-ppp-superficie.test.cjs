'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ArbolPantalla } = require('../arbol-ppp/pantalla.js');

const area = (id, etiqueta, valor) => ({ id, etiqueta, valor, unidad: { clase: 'm2' } });
const vendible = area('E-17', 'Vendible', 2400);
const construido = area('E-05', 'Construido', 3000);

test('la cifra compacta de Terreno muestra el predio y conserva la identificación del área vendible', () => {
  const predio = area('T-01', 'Predio', 1500);
  const cifras = [vendible, construido, predio];
  const tarjeta = ArbolPantalla.textoCifras('Terreno', { cifras });
  assert.equal(tarjeta.h, '1,500 m²');
  assert.equal(tarjeta.hc, '1,500 m²');
  assert.equal(tarjeta.hcc, '1,500m²');
  assert.deepEqual(tarjeta.s, ['Predio', 'Vendible 2,400 m²']);
  assert.deepEqual(cifras, [vendible, construido, predio]);
});

test('si falta la superficie del terreno, la tarjeta lo indica aunque ya haya áreas de construcción', () => {
  for (const cifras of [[vendible, construido], [vendible, area('T-01', 'Predio', null)], []]) {
    const tarjeta = ArbolPantalla.textoCifras('Terreno', { cifras });
    assert.equal(tarjeta.h, '?');
    assert.deepEqual(tarjeta.s, ['Superficie del predio pendiente']);
  }
});
