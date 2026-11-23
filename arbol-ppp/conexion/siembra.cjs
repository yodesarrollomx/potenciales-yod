/* Siembra de planes para las pruebas de ida y vuelta (ola 6). Determinista (semilla fija), solo datos inventados. Cada plan se arma con el motor
   (Motor.evalua) aplicando cambios válidos al azar: predio, decisiones, datos propios con estado, umbrales de las pruebas propios, áreas del edificio
   (tamaños, estados, renombres, quitar, áreas propias con nombre libre) y «no sé todavía». Los cambios que el motor rechaza se descartan. */
'use strict';
const C = require('./caso-muestra.cjs'), Motor = C.Motor;
function rng(semilla) { let s = semilla >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const NOMBRES_AREA = ['Bodega de bicicletas', 'Cuarto de basura', 'Local comercial', 'Sala de juntas', 'Roof garden', 'Cuarto de máquinas', 'Ludoteca', 'Business center', 'Alberca', 'Cava', 'Asador', 'Sala de cine'];
function siembra(def, n, semilla) {
  const R = rng(semilla || 20261123), pick = (a) => a[Math.floor(R() * a.length)], entre = (a, b) => a + R() * (b - a);
  const nodos = C.VERTICAL.nodos;
  const libres = nodos.filter((x) => (x.tipo === 'regla_oficio' || x.tipo === 'se_busca') && x.rango && x.rango.min !== undefined && x.rango.max !== undefined && !/^(RU-|T-01|T-04)/.test(x.id) && x.referencia && x.referencia.valor !== undefined && x.referencia.valor !== '' && !(x.opciones || []).length);
  const otrasOpciones = nodos.filter((x) => (x.tipo === 'se_busca' || x.tipo === 'regla_oficio') && (x.opciones || []).length >= 2 && !/^RU-/.test(x.id));
  const ru = nodos.filter((x) => /^RU-/.test(x.id));
  const planes = [];
  for (let k = 0; k < n; k++) {
    let plan = { tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: Math.round(entre(300, k % 25 === 0 ? 15000 : 6000) / 10) * 10 } } };
    const aplica = (cambio) => { const r = Motor.evalua(def, plan, cambio, C.SIN); if (!r.errores || r.errores.length === 0) plan = r.plan; };
    aplica({ 'E-15': { opcion: pick(['sencillo', 'elevador', 'amenidades', 'motor_ppp']), estado: pick(['decidido', 'decidido', 'confirmado']) , fuente: 'Plano de prueba' } });
    /* las decisiones se abren una tras otra (el árbol las muestra en este orden); a veces la persona se detiene antes */
    for (const id of ['P1-05', 'E-16', 'K-13', 'S-03', 'D-09']) { if (R() < 0.12) break; const x = nodos.find((q) => q.id === id); aplica({ [id]: { opcion: pick(x.opciones).clave, estado: 'decidido' } }); }
    otrasOpciones.filter(() => R() < 0.3).forEach((x) => aplica({ [x.id]: { opcion: pick(x.opciones).clave, estado: pick(['decidido', 'confirmado']), fuente: 'Fuente de prueba' } }));
    if (R() < 0.5) aplica({ 'T-04': { valor: Math.round(entre(5, 40) * 10) / 10, estado: pick(['decidido', 'confirmado']), fuente: 'Avalúo de prueba' } });
    for (let j = 0, m = Math.floor(R() * 4); j < m; j++) { const x = pick(libres), mn = Number(x.rango.min), mx = Number(x.rango.max); const v = Math.round(entre(mn, mx) / (x.rango.paso || 0.01)) * (x.rango.paso || 0.01); aplica({ [x.id]: { valor: Math.round(v * 1e6) / 1e6, estado: pick(['decidido', 'confirmado', 'decidido']), fuente: 'Dato de prueba' } }); }
    /* umbrales propios de las pruebas (decisión C) */
    if (R() < 0.45) ru.filter(() => R() < 0.4).forEach((x) => { const mn = Number(x.rango.min), mx = Number(x.rango.max); const v = Math.round(entre(mn, mx) * 100) / 100; aplica({ [x.id]: { valor: v, estado: pick(['decidido', 'confirmado']), fuente: 'Criterio del banco de prueba' } }); });
    /* áreas del edificio (decisión D) */
    const ed = {};
    if (R() < 0.5) ['lobby', 'salon', 'gimnasio', 'terraza', 'pasillos', 'elevadores', 'servicios'].filter(() => R() < 0.3).forEach((cl) => { const q = R(); ed[cl] = q < 0.25 && cl !== 'pasillos' ? { quitar: true } : q < 0.5 ? { nombre: pick(['Recepción', 'Acceso principal', 'Área común ' + cl]) } : { valor: Math.round(entre(10, 120)), unidad: 'm2', estado: pick(['decidido', 'confirmado']), fuente: 'Plano A-' + k }; });
    for (let j = 0, m = R() < 0.5 ? Math.floor(R() * 5) : 0; j < m; j++) { const cl = 'ap_0' + (j + 1), pct = R() < 0.4; ed[cl] = { propia: true, nombre: NOMBRES_AREA[(k + j * 3) % NOMBRES_AREA.length], rol: pick(['no_vendible', 'vendible']), valor: pct ? Math.round(entre(0.5, 4)) / 100 : Math.round(entre(8, 90) * 10) / 10, unidad: pct ? 'pct' : 'm2', estado: pick(['referencia', 'decidido', 'confirmado']), fuente: 'Plano B-' + j }; }
    if (Object.keys(ed).length) aplica({ 'E-15': { componentes: ed } });
    /* repetición ola 6: áreas que el preajuste NO trae y que la persona prende ({activo:true, valor, unidad, estado}), y áreas que sí trae y quita junto con tamaños nuevos en otras */
    {
      const CAT = ['lobby', 'salon', 'gimnasio', 'terraza', 'pasillos', 'elevadores', 'servicios'], x = R();
      const e15 = Motor.evalua(def, plan, null, C.SIN).nodos.find((q) => q.id === 'E-15'), act = {}; ((e15 && e15.componentes) || []).forEach((m) => { act[m.clave] = m.activo; });
      const ed2 = {};
      if (x < 0.35) CAT.filter((cl) => act[cl] === false && R() < 0.5).forEach((cl) => { ed2[cl] = { activo: true, valor: Math.round(entre(20, 150)), unidad: 'm2', estado: pick(['decidido', 'confirmado']), fuente: 'Plano C-' + k }; });
      else if (x < 0.65) { const dentro = CAT.filter((cl) => act[cl] === true && cl !== 'pasillos'); dentro.filter(() => R() < 0.5).forEach((cl) => { ed2[cl] = { quitar: true }; }); CAT.filter((cl) => !ed2[cl] && (act[cl] === true || act[cl] === false) && R() < 0.3).forEach((cl) => { ed2[cl] = { activo: true, valor: Math.round(entre(30, 160)), unidad: 'm2', estado: pick(['decidido', 'confirmado']), fuente: 'Plano D-' + k }; }); }
      if (Object.keys(ed2).length) aplica({ 'E-15': { componentes: ed2 } });
    }
    if (R() < 0.08) aplica({ [pick(['P1-06', 'C-01', 'K-13'])]: { estado: 'no_se' } });
    if (R() < 0.05) aplica({ 'E-15': { estado: 'no_se' } });
    planes.push(plan);
  }
  return planes;
}
module.exports = { siembra };
