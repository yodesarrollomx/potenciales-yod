'use strict';
/* Servidor real sobre el Maestro y el Portero de prueba. No usa servicios externos. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { mundo, EDITOR } = require('./ppp2-mundo.cjs');
const RAIZ = path.join(__dirname, '..');
const { Hoja } = require(path.join(RAIZ, 'arbol-ppp/conexion/doble-sheets.cjs'));
const C = require(path.join(RAIZ, 'arbol-ppp/conexion/caso-muestra.cjs'));
const Conexion = require(path.join(RAIZ, 'arbol-ppp/conexion/conexion.js'));
const Servidor = require(path.join(RAIZ, 'arbol-ppp/servidor.js'));
const Motor = C.Motor;
const ARBOL_GS = fs.readFileSync(path.join(RAIZ, 'server/ppp2/ArbolPPP.gs'), 'utf8');
const MAESTRO = 'maestro0000000000000000000001';
const EP = 'https://script.google.com/macros/s/PRUEBA/exec';
const SIN = { sugerencias: 'no', rutas: 'no' };

/* El libro Maestro de prueba: identidad, todos los factores de la definición, la plantilla en J (con dos fórmulas) y una columna hecha a mano en K. */
function libroMaestro(ancho = 14) {
  const ident = ['I-01', 'I-02', 'I-03', 'I-04', 'I-05', 'I-06', 'I-07', 'I-08', 'X-01'];
  const ids = ident.concat(C.MAESTRO.ARBOL_FACTORES.slice(1).map((f) => f[0]).filter((id) => ident.indexOf(id) < 0));
  const filas = [['ID', 'Factor'], ['', 'IDENTIDAD']].concat(ids.map((id) => [id, 'Factor ' + id]));
  const h = new Hoja('MAESTRO', filas, ancho);
  const renglon = (id) => 3 + ids.indexOf(id);
  h.put(1, 10, '=IF({c}3="","",{c}3)'); h.put(3, 10, 'PLANTILLA');
  h.put(renglon('T-05'), 10, '={c}' + renglon('T-04') + '/{c}' + renglon('T-01'));   // dos factores con fórmula en la plantilla: el árbol no los escribe
  h.put(renglon('PT-07'), 10, '={c}' + renglon('T-01') + '*2');
  h.put(3, 11, 'Plan hecho a mano'); h.put(renglon('I-04'), 11, 'Borrador'); h.put(renglon('I-06'), 11, 'Persona'); h.put(renglon('T-01'), 11, 123);
  const hojas = { MAESTRO: h, CAMBIOS: new Hoja('CAMBIOS', [['Fecha', 'Quién', 'Qué se hizo', 'Columna o factor', 'Fuente', 'Pendiente']], 6) };
  Object.keys(C.MAESTRO).forEach((n) => { hojas[n] = new Hoja(n, C.MAESTRO[n], 60); });
  return { hojas, h, renglon, ids };
}
function entorno(config, ancho, opMundo) {
  const w = mundo(opMundo), m = libroMaestro(ancho);
  vm.runInContext(ARBOL_GS, w.ctx, { filename: 'ArbolPPP.gs' });
  w.libros[MAESTRO] = { getSheetByName: (n) => m.hojas[n] || null };
  const cfg = w.vivero.getSheetByName('Config');
  Object.entries(Object.assign({ maestro_id: MAESTRO, maestro_plantilla: 'J', arbol: 'sí' }, config || {})).forEach(([k, v]) => { if (v !== undefined) cfg.v.push([k, v]); });
  const pedidos = [];
  const traer = async (url, o) => {
    pedidos.push({ url, metodo: (o && o.method) || 'GET' });
    if (!url.startsWith(EP)) throw new Error('fuera del servidor de prueba: ' + url);
    const r = o && o.method === 'POST' ? w.post(JSON.parse(o.body)) : w.get(Object.fromEntries(new URL(url).searchParams));
    return { json: async () => JSON.parse(JSON.stringify(r)) };
  };
  const cliente = (k) => {
    const mem = {}; if (k) mem.pyod_clave_v1 = k;
    const almacen = { getItem: (x) => (x in mem ? mem[x] : null), setItem: (x, v) => { mem[x] = String(v); }, removeItem: (x) => { delete mem[x]; } };
    return { N: Servidor.nucleo({ endpoint: EP, fetch: traer, almacen, motor: Motor, conexion: Conexion }), mem };
  };
  return { w, m, pedidos, cliente };
}
module.exports = { entorno, RAIZ, C, Conexion, Servidor, Motor, SIN, Hoja };
