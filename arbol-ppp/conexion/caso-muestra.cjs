/* Caso de muestra del árbol: predio INVENTADO de 2,000 m², tierra de $14 M y 6 decisiones; da un plan sano (9 de 9 pruebas). Solo Node. Datos inventados, sin datos de ningún proyecto real. */
'use strict';
const fs = require('fs'), path = require('path');
const APP = path.join(__dirname, '..');
const Motor = require(path.join(APP, 'motor.js'));
const VERTICAL = JSON.parse(fs.readFileSync(path.join(APP, 'definicion', 'vertical.json'), 'utf8'));
const MAESTRO = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', 'arbol-desde-maestro.json'), 'utf8')).tablas;
const SIN = { sugerencias: 'no', rutas: 'no' };
const DECISIONES = [['E-15', 'elevador'], ['P1-05', 'tres_rec'], ['E-16', 'a_nivel'], ['K-13', 'la_mitad'], ['S-03', 'tierra_30'], ['D-09', 'con_banco']];
/* segundo caso inventado, «con problemas» (3,000 m², tierra $36 M, ritmo 1.5 al mes): falla 2 pruebas */
const DECISIONES_PROB = [['E-15', 'elevador'], ['P1-05', 'dos_rec'], ['E-16', 'mitad_y_mitad'], ['K-13', 'un_tercio'], ['S-03', 'tierra_70'], ['D-09', 'con_banco']];
function armaPlan(def, predio, decisiones, datos) {
  let plan = { tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: predio } } };
  decisiones.forEach(([id, op]) => { plan = Motor.evalua(def, plan, { [id]: { opcion: op, estado: 'decidido' } }, SIN).plan; });
  Object.keys(datos || {}).forEach((id) => { plan = Motor.evalua(def, plan, { [id]: { valor: datos[id], estado: 'decidido' } }, SIN).plan; });
  return plan;
}
/* la tierra se escribe en millones (vista) y es un valor propio por confirmar */
function planMuestra(def) { return armaPlan(def, 2000, DECISIONES, { 'T-04': 14 }); }
function planProblemas(def) { return armaPlan(def, 3000, DECISIONES_PROB, { 'T-04': 36, 'P1-08': 1.5 }); }
const clon = (x) => JSON.parse(JSON.stringify(x));
function cargaVertical() { const r = Motor.carga(clon(VERTICAL)); if (r.errores.length) throw new Error('vertical.json: ' + JSON.stringify(r.errores[0])); return r.definicion; }
function cargaMaestro() { const r = Motor.carga(clon(MAESTRO)); if (r.errores.length) throw new Error('Maestro: ' + JSON.stringify(r.errores[0])); return r.definicion; }
module.exports = { Motor, VERTICAL, MAESTRO, SIN, DECISIONES, DECISIONES_PROB, armaPlan, planMuestra, planProblemas, cargaVertical, cargaMaestro, clon, APP };
