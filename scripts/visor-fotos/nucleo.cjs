'use strict';
/**
 * Núcleo de «la foto» del PPP de siempre (PPP 1) para el visor en vivo.
 *
 * Qué hace: corre el motor REAL de cada tablero (su `computar()`, cortado del HTML) sin navegador, con las
 * mismas entradas que vería el navegador al abrir el caso, y arma un renglón para la pestaña PPP_VISOR con
 * la forma que el servidor sirve tal cual (esquema ppp2-visor-v1 + `origen`). No tiene fórmulas financieras:
 * sólo transporta, cambia unidades (pesos → MDP) y acomoda.
 *
 * Qué NO hace: no abre la red, no escribe en hojas de cálculo, no hace POST a ningún /exec. El modo ensayo
 * lee renglones de un JSON local y escribe fotos a otro JSON local (fuera del repositorio).
 *
 * Contrato completo y decisiones: docs/visor-ppp1.md. Cada motor vive en scripts/visor-fotos/<motor>.cjs.
 * Sin dependencias: sólo módulos de Node.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const ESQUEMA = 'ppp2-visor-v1';
const TOLERANCIA = 0.005;              // 0.5 %: ventas, costo del proyecto y utilidad (decisión 3)
const PISO = 1;                        // pesos: el resumen se guarda redondeado a pesos (toFixed(0))
const TZ = 'America/Hermosillo';       // la misma zona y forma que `ahora_()` del servidor
const VISOR_MAX = 50000;               // caracteres de visor_json que acepta el servidor (FOTO_MAX)
const MAX_ESCENARIOS = 8;              // MAX_ESC de los cinco motores
/* Un renglón por (caso, versión). `elegida` = «sí» en un solo renglón por caso (la que el visor rotula como
   vigente); por omisión, la última versión servible. Dirección la cambia desde el visor: el servidor sólo
   mueve ese puntero, las fotos ya están calculadas. */
const COLUMNAS = ['caso_id', 'tipo', 'escenario_id', 'escenario_nombre', 'orden', 'estado', 'elegida', 'elegida_por', 'elegida_fecha',
  'motor_commit', 'huella_entradas', 'calculado', 'origen', 'conciliacion', 'visor_json'];
const ESTADOS = ['propuesta', 'lista'];     // lista = se puede servir; propuesta = no se sirve
const SIN_REFERENCIA = 'sin referencia';
const ORIGENES = ['lote', 'libro', 'guardar'];
const CAMPOS_CONCILIA = ['ventas', 'costo_proyecto', 'utilidad'];
/* Lo que arma el servidor alrededor de los cuadros: una foto no lo puede traer (el servidor sólo toma de la foto las
   claves de la forma, con su tipo: `fotoLimpia_` de server/ppp2/Visor.gs). */
const RESERVADAS = ['ok', 'error', 'igual', 'llave', 'leido', 'menu', 'a_medias', 'puede', 'ligas', 'marcas', 'esquema', 'elige'];
const RE_CASO = /^[A-Za-z0-9_-]{3,64}$/;
const RE_ESC = /^[A-Za-z0-9_-]{1,40}$/;

/* Dónde está el motor de cada pestaña y cómo se corta. `desde` y `hasta` son textos literales del HTML:
   el corte es [desde, hasta). Si un motor cambia esos renglones, la prueba del núcleo lo avisa. */
const MOTORES = {
  VERTICAL: { archivo: 'mixto.html', modulo: 'vertical', desde: '  function parkingPerUnit', hasta: '  function calculate(){', firma: 'computar(vals)', relaciones: 'clampRelations' },
  MACROLOTES: { archivo: 'macrolotes.html', modulo: 'macrolotes', desde: '  function irr(', hasta: '  function calculate(){', firma: 'computar(vals)' },
  RESIDENCIAL: { archivo: 'residencial.html', modulo: 'residencial', desde: '  function irr(', hasta: '  function calculate(){', firma: 'computar(vals, viv)' },
  UNIFAMILIAR: { archivo: 'unifamiliar.html', modulo: 'unifamiliar', desde: '  function irr(', hasta: '  function calculate(){', firma: 'computar(vals)' },
  PATRIMONIAL: { archivo: 'patrimonial.html', modulo: 'patrimonial', desde: '  /* ================== MOTOR PATRIMONIAL', hasta: '  function calculate(){', firma: 'computar(vals, esc)' }
};

/* ───────────── la forma ppp2-visor-v1 (la de `leeVisor_` en server/ppp2/Visor.gs) ───────────── */
/* Claves `v.*`: las de VER_FILAS de ppp2/libro/generar.py, sin nombres de personas, más `huella`. */
const CLAVES_V = ['nombre', 'estado', 'que_cambia', 'fecha_aprobacion', 'dueno_aporta', 'dueno_recibe', 'dueno_veces', 'dueno_meses',
  'dueno_anos', 'alianza_recibe', 'inversion_recibe', 'ventas', 'costo_sin_tierra', 'tierra', 'obra_inicio', 'fin_obra', 'mes_saldos',
  'pagos_obra', 'max_ajeno', 'capital', 'banco_max', 'respaldo', 'costo_dinero', 'rend_capital', 'caja_cierre', 'ganancia', 'margen',
  'resultado_repartir', 'banco_mes', 'capital_mes', 'respaldo_mes', 'ultimo_cobro', 'mes_reparto', 'rv_linea_ventas', 'rv_linea_costo',
  'rv_aportacion', 'rv_preventa', 'rv_preventa_banco', 'rv_cobertura', 'rv_margen', 'rv_meses_credito', 'rv_falta', 'rv_resultado',
  'ck_flujo', 'ck_cobranza', 'ck_unidades', 'capital_sobre_tope', 'fuera_horizonte', 'norma_alertas', 'norma_texto', 'niveles', 'construidos', 'cos_usado',
  'cus_usado', 'cajones', 'cajones_pide', 'huella'];
/* Unidad de cada clave `v.*` numérica, como la escribe el libro: MDP (millones), fracción (0.25 = 25 %),
   meses, veces, años o unidades. Las de texto no aparecen. */
const UNIDAD_V = {
  dueno_aporta: 'MDP', dueno_recibe: 'MDP', alianza_recibe: 'MDP', inversion_recibe: 'MDP', ventas: 'MDP', costo_sin_tierra: 'MDP',
  tierra: 'MDP', pagos_obra: 'MDP', max_ajeno: 'MDP', capital: 'MDP', banco_max: 'MDP', respaldo: 'MDP', costo_dinero: 'MDP',
  rend_capital: 'MDP', caja_cierre: 'MDP', ganancia: 'MDP', resultado_repartir: 'MDP', rv_falta: 'MDP', ck_cobranza: 'MDP',
  capital_sobre_tope: 'MDP', margen: 'fraccion', rv_linea_ventas: 'fraccion', rv_linea_costo: 'fraccion', rv_aportacion: 'fraccion',
  rv_preventa: 'fraccion', rv_preventa_banco: 'fraccion', rv_margen: 'fraccion', rv_cobertura: 'veces', dueno_veces: 'veces',
  dueno_meses: 'mes', obra_inicio: 'mes', fin_obra: 'mes', mes_saldos: 'mes', banco_mes: 'mes', capital_mes: 'mes', respaldo_mes: 'mes',
  ultimo_cobro: 'mes', mes_reparto: 'mes', rv_meses_credito: 'mes', dueno_anos: 'anos', ck_flujo: 'MDP', ck_unidades: 'unidades',
  fuera_horizonte: 'unidades', norma_alertas: 'unidades', niveles: 'unidades', construidos: 'unidades', cos_usado: 'fraccion', cus_usado: 'veces', cajones: 'unidades',
  cajones_pide: 'unidades'
};
/* Claves de `datos` (VISOR.DATOS) y su unidad en el libro. */
const DATOS = {
  'terreno.m2': 'm2', 'tierra.valor': 'MDP', 'lamina.m2_construidos': 'm2', 'lamina.m2_vendibles': 'm2', 'cob.enganche': 'fraccion',
  'din.tasa_capital': 'fraccion', 'din.tiie': 'fraccion', 'din.sobretasa': 'fraccion', 'din.apertura': 'fraccion',
  'din.caja_pct': 'fraccion', 'din.preventa_minima': 'fraccion', 'costo.comision': 'fraccion'
};
/* Renglones del flujo (VISOR.FILAS) y cómo saca el libro su total: SUM, MAX o ULT (el último mes).
   Todos en MDP salvo `firmas` (unidades firmadas en el mes). */
const FILAS_FLUJO = {
  firmas: 'SUM', enganches: 'SUM', saldos: 'SUM', pagos_obra: 'SUM', cobranza: 'SUM', obra: 'SUM', indirectos: 'SUM',
  imprevistos: 'SUM', comisiones: 'SUM', cierre: 'SUM', egresos: 'SUM', caja_minima: 'MAX', interes: 'SUM', cap_aporta: 'SUM',
  cap_acum: 'MAX', apertura: 'SUM', disposicion: 'SUM', respaldo: 'SUM', pago_banco: 'SUM', pago_respaldo: 'SUM', pago_capital: 'SUM',
  saldo_banco: 'MAX', saldo_capital: 'MAX', saldo_respaldo: 'MAX', caja: 'ULT', flujo_acum: 'ULT', ajeno: 'MAX'
};
const UNIDADES_FLUJO = ['firmas'];
/* Las series que dicen hasta qué mes hay movimiento (VISOR.MOVIMIENTO). */
const MOVIMIENTO = ['firmas', 'cobranza', 'egresos', 'interes', 'cap_aporta', 'disposicion', 'respaldo', 'pago_banco', 'pago_respaldo', 'pago_capital'];
const CLAVES_PLAN = ['nombre', 'ubicacion', 'tipo', 'edad', 'candados_abiertos', 'paso_texto', 'esquema', 'vigente', 'mostrada'];
const CLAVES_PRODUCTO = ['nombre', 'unidades', 'm2', 'precio_m2', 'ventas', 'precio_unidad'];
const CLAVES_REPARTO = ['numero', 'esquema', 'tasa_capital', 'paga_tierra', 'parte_dueno', 'parte_alianza', 'parte_capital', 'honorarios_pct'];
const MAX_PRODUCTOS = 6;

function formaVacia() {
  const v = {}; CLAVES_V.forEach(k => { v[k] = null; });
  const plan = {}; CLAVES_PLAN.forEach(k => { plan[k] = null; });
  const datos = {}; Object.keys(DATOS).forEach(k => { datos[k] = { valor: null, estado: null }; });
  return {
    plan, version: null, versiones: [], v, datos, productos: [],
    flujo: { meses: null, filas: {}, total: {} },
    reparto: null, candados: [], pruebas: [], pruebas_viejas: null, ultimo: null, cambio: null, origen: null
  };
}

/* ───────────── números y unidades ───────────── */
function num(x) {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x);
  return null;
}
function r3(x) { const n = num(x); return n === null ? null : Math.round(n * 1000) / 1000; }        // r3v_ del servidor
function r6(x) { const n = num(x); return n === null ? null : Math.round(n * 1e6) / 1e6; }          // r6v_ del servidor
function mdp(pesos) { const n = num(pesos); return n === null ? null : r6(n / 1e6); }
function fraccion(porciento) { const n = num(porciento); return n === null ? null : r6(n / 100); }

/* ───────────── el HTML del motor ───────────── */
function leeHtml(archivo, raiz) {
  const f = path.isAbsolute(archivo) ? archivo : path.join(raiz || RAIZ, archivo);
  return fs.readFileSync(f, 'utf8');
}
function atributo(tag, nombre) {
  const m = tag.match(new RegExp('\\s' + nombre + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}
function flotante(s) { return s !== null && s !== undefined && String(s).trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : null; }
function decimales(x) {
  const s = String(x).toLowerCase();
  if (s.includes('e')) { const [m, e] = s.split('e'); return Math.max(0, decimales(m) - Number(e)); }
  const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1;
}

/* Los controles deslizantes del HTML (`input[type=range]`), con lo que el navegador usa para sanear. */
function controles(html) {
  const out = {};
  for (const [tag] of html.matchAll(/<input\b[^>]*>/gi)) {
    if (String(atributo(tag, 'type') || '').toLowerCase() !== 'range') continue;
    const id = atributo(tag, 'id');
    if (!id) continue;
    const min = flotante(atributo(tag, 'min')) ?? 0;
    let max = flotante(atributo(tag, 'max')) ?? 100;
    if (max < min) max = min;
    const pasoTxt = atributo(tag, 'step');
    let paso = 1;
    if (pasoTxt !== null && String(pasoTxt).trim().toLowerCase() === 'any') paso = 'any';
    else if (flotante(pasoTxt) !== null && flotante(pasoTxt) > 0) paso = flotante(pasoTxt);
    const valorAttr = flotante(atributo(tag, 'value'));
    const base = flotante(atributo(tag, 'min')) ?? valorAttr ?? 0;
    const c = { id, min, max, paso, base };
    c.inicial = valorAttr === null ? min + (max - min) / 2 : valorAttr;
    c.valor = sanea(c, c.inicial);
    out[id] = c;
  }
  return out;
}

/* Lo que hace el navegador al poner `control.value = v` en un deslizante: si no es número, el valor por
   omisión; luego lo encierra entre min y max y lo redondea al paso más cercano (empate: hacia arriba),
   sin salirse del rango. Igual que StepRange::ClampValue de Chromium. */
function sanea(c, valor) {
  let v = flotante(valor);
  if (v === null) v = c.inicial !== undefined ? c.inicial : c.min + (c.max - c.min) / 2;
  v = Math.max(c.min, Math.min(c.max, v));
  if (c.paso === 'any') return v;
  const prec = Math.min(15, Math.max(decimales(c.paso), decimales(c.base)) + 0);
  const q = Number(((v - c.base) / c.paso).toFixed(9));
  let k = Math.floor(q + 0.5);
  let r = Number((c.base + k * c.paso).toFixed(prec));
  if (r > c.max) r = Number((c.base + (k - 1) * c.paso).toFixed(prec));
  else if (r < c.min) r = Number((c.base + (k + 1) * c.paso).toFixed(prec));
  return r;
}

/* Fija un valor como lo hace `setControl` del motor fuera del modo nativo: si no es número finito
   (Number(valor)), no lo toca; si lo es, lo sanea. OJO: Number('') y Number(null) son 0. */
function fija(vals, ctrls, id, valor) {
  const c = ctrls[id];
  if (!c || !Number.isFinite(Number(valor))) return vals;
  vals[id] = sanea(c, Number(valor));
  return vals;
}
/* La primera parte de `clampRelations` (todos los deslizantes dentro de su rango y su paso). */
function limita(vals, ctrls) {
  const out = Object.assign({}, vals);
  Object.keys(ctrls).forEach(id => { out[id] = sanea(ctrls[id], out[id] === undefined ? ctrls[id].valor : out[id]); });
  return out;
}

/* Corta el texto de `const PRELLENADO=… ; const DEFAULTS=…;` y lo evalúa con unos deslizantes de mentira:
   así salen los valores por defecto EXACTOS del motor (incluidas sus claves que no son deslizantes, como
   `inGateAgua` o `inEstrategia`). Después, cada deslizante se sanea como lo hace el navegador al cargar. */
function valoresPorDefecto(html, ctrls) {
  ctrls = ctrls || controles(html);
  const ini = html.indexOf('const PRELLENADO=');
  const dIni = html.indexOf('const DEFAULTS=', ini);
  if (ini < 0 || dIni < 0) throw new Error('El HTML no trae PRELLENADO y DEFAULTS: no se pueden leer los valores por defecto.');
  const dFin = html.indexOf('\n', dIni);
  const codigo = html.slice(ini, dFin < 0 ? undefined : dFin);
  const ctx = vm.createContext({ controls: Object.values(ctrls).map(c => ({ id: c.id, value: String(c.valor) })) });
  vm.runInContext(codigo + '\n;globalThis.__salida=JSON.stringify({PRELLENADO,DEFAULTS});', ctx, { timeout: 2000 });
  const { PRELLENADO, DEFAULTS } = JSON.parse(ctx.__salida);
  const vals = {}, extras = {};
  Object.keys(DEFAULTS).forEach(id => { if (ctrls[id]) vals[id] = sanea(ctrls[id], DEFAULTS[id]); else extras[id] = DEFAULTS[id]; });
  Object.keys(ctrls).forEach(id => { if (!(id in vals)) vals[id] = ctrls[id].valor; });
  return { vals, extras, prellenado: PRELLENADO, crudos: DEFAULTS };
}

/* ───────────── cortar código del HTML ───────────── */
/* Busca el cierre de un bloque `{…}` saltando cadenas, plantillas, comentarios y expresiones regulares. */
function cierraLlave(src, abre) {
  let prof = 0, i = abre;
  const prevSignificativo = j => { while (j >= 0 && /\s/.test(src[j])) j--; return j < 0 ? '' : src[j]; };
  for (; i < src.length; i++) {
    const ch = src[i], sig = src[i + 1];
    if (ch === '/' && sig === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (ch === '/' && sig === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return -1; i++; continue; }
    if (ch === '"' || ch === "'") { for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++; continue; }
    if (ch === '`') {
      for (i++; i < src.length && src[i] !== '`'; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { const fin = cierraLlave(src, i + 1); if (fin < 0) return -1; i = fin; }
      }
      continue;
    }
    if (ch === '/' && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prevSignificativo(i - 1))) {
      let enClase = false;
      for (i++; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === '[') enClase = true; else if (src[i] === ']') enClase = false;
        else if (src[i] === '/' && !enClase) break;
        else if (src[i] === '\n') break;
      }
      continue;
    }
    if (ch === '{') prof++;
    else if (ch === '}') { prof--; if (prof === 0) return i; }
  }
  return -1;
}
/* El texto completo de `function nombre(…){…}` tal como está en el HTML. */
function cortaFuncion(html, nombre) {
  const re = new RegExp('function\\s+' + nombre.replace(/[$]/g, '\\$') + '\\s*\\(');
  const m = re.exec(html);
  if (!m) throw new Error('No encontré la función ' + nombre + ' en el HTML.');
  const abre = html.indexOf('{', html.indexOf(')', m.index));
  const fin = cierraLlave(html, abre);
  if (fin < 0) throw new Error('No encontré el cierre de la función ' + nombre + '.');
  return html.slice(m.index, fin + 1);
}

function clona(x) { return JSON.parse(JSON.stringify(x)); }
function sha(texto) { return crypto.createHash('sha256').update(texto).digest('hex'); }

/* Corta el bloque del motor [desde, hasta) y lo corre en un contexto aislado de Node (sin DOM ni red).
   Devuelve `computar(...)` (resultado clonado por JSON, como tests/ppp-fixture.js), el contexto (para
   alcanzar funciones auxiliares del mismo bloque, p. ej. `viviendaDefault` del residencial) y la huella
   del código cortado. Si el bloque toca el DOM al cargarse, falla aquí con el error del motor. */
function cortaMotor(html, opciones) {
  const { desde, hasta } = opciones || {};
  const i = html.indexOf(desde), j = html.indexOf(hasta, i + 1);
  if (!desde || i < 0) throw new Error('No encontré el inicio del motor: ' + JSON.stringify(desde));
  if (!hasta || j < 0) throw new Error('No encontré el final del motor: ' + JSON.stringify(hasta));
  const codigo = html.slice(i, j);
  if (!/function\s+computar\s*\(/.test(codigo)) throw new Error('El corte no trae function computar(.');
  const ctx = vm.createContext({});
  vm.runInContext(codigo, ctx, { timeout: 5000 });
  if (typeof ctx.computar !== 'function') throw new Error('El corte no deja computar() a la vista.');
  return {
    codigo, huella: sha(codigo).slice(0, 16), contexto: ctx,
    computarCrudo: (...a) => ctx.computar(...a),
    computar: (...a) => clona(ctx.computar(...a))
  };
}

/* Deslizantes de mentira para correr funciones del motor que hablan con el DOM sólo por `controls`,
   `$`, `get` y `setControl` (como `clampRelations` del vertical). `value` se sanea como en el navegador. */
function controlesSimulados(ctrls, vals) {
  const lista = Object.values(ctrls).map(c => {
    let actual = String(sanea(c, vals[c.id] === undefined ? c.valor : vals[c.id]));
    return {
      id: c.id, min: String(c.min), max: String(c.max), step: String(c.paso),
      get value() { return actual; },
      set value(x) { actual = String(sanea(c, x)); }
    };
  });
  const porId = Object.fromEntries(lista.map(c => [c.id, c]));
  const $ = id => porId[id] || null;
  return {
    controls: lista, $,
    get: id => Number($(id).value) || 0,
    setControl: (id, value) => { const c = $(id); if (!c || !Number.isFinite(Number(value))) return; c.value = Number(value); },
    valores: () => Object.fromEntries(lista.map(c => [c.id, Number(c.value)]))
  };
}
/* Corre una función del HTML (por omisión `clampRelations`) sobre los valores y devuelve los nuevos. */
function relaciones(html, vals, ctrls, nombre) {
  const fuente = cortaFuncion(html, nombre || 'clampRelations');
  const sim = controlesSimulados(ctrls, vals);
  const ctx = vm.createContext({ controls: sim.controls, $: sim.$, get: sim.get, setControl: sim.setControl });
  vm.runInContext(fuente + '\n;' + (nombre || 'clampRelations') + '();', ctx, { timeout: 2000 });
  return Object.assign({}, vals, sim.valores());
}

/* ───────────── entradas de un renglón y de un escenario ───────────── */
/* Columnas `in*` del renglón como las aplica `aplicarCasoRemoto`: se saltan las vacías y las que no son número. */
function entradasDeRenglon(renglon) {
  const out = {};
  Object.keys(renglon || {}).forEach(k => {
    const v = renglon[k];
    if (/^in[A-Z]/.test(k) && v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))) out[k] = Number(v);
  });
  return out;
}
/* Aplica entradas sobre unos valores. modo 'renglon' = aplicarCasoRemoto (salta ''); modo 'escenario' =
   setControl directo (Number('') = 0 sí se aplica). Las claves sin deslizante se ignoran, salvo que el motor
   dé un manejador en `extras` ({clave: (valor, vals) => void}). `informe` (lista) recibe las ignoradas. */
function aplica(vals, entradas, ctrls, opciones) {
  const o = opciones || {}, modo = o.modo || 'escenario', out = Object.assign({}, vals);
  Object.keys(entradas || {}).forEach(k => {
    const v = entradas[k];
    if (modo === 'renglon' && (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)))) return;
    if (ctrls[k]) { fija(out, ctrls, k, v); return; }
    if (o.extras && typeof o.extras[k] === 'function') { o.extras[k](v, out); return; }
    if (Array.isArray(o.informe)) o.informe.push(k);
  });
  return out;
}
/* `escenarios_json` como lo lee `escDesdeJson` de los motores: sólo objetos con `inputs`, a lo más 8; si
   ninguno es base, el primero; activo = el marcado activo, si no la base, si no el primero. */
function leeEscenarios(raw, max) {
  let arr = raw;
  if (typeof raw === 'string') { try { arr = JSON.parse(raw || 'null'); } catch (e) { arr = null; } }
  if (!Array.isArray(arr) || !arr.length) return { lista: [], activo: null, n: null };
  const lista = arr.filter(e => e && typeof e === 'object' && e.inputs && typeof e.inputs === 'object')
    .slice(0, max || MAX_ESCENARIOS)
    .map(e => Object.assign({}, e, { id: e.id === undefined || e.id === null || e.id === '' ? null : String(e.id), nombre: String(e.nombre || 'Versión').slice(0, 40), esBase: !!e.esBase, activo: !!e.activo }));
  if (!lista.length) return { lista: [], activo: null, n: null };
  if (!lista.some(e => e.esBase)) lista[0].esBase = true;
  const act = lista.find(e => e.activo) || lista.find(e => e.esBase) || lista[0];
  return { lista, activo: act, n: lista.indexOf(act) + 1 };
}

/* ───────────── huella, conciliación y fechas ───────────── */
function canonico(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === 'number') return Number.isFinite(x) ? (Object.is(x, -0) ? 0 : x) : null;
  if (Array.isArray(x)) return x.map(canonico);
  if (typeof x === 'object') {
    const o = {};
    Object.keys(x).sort().forEach(k => { if (x[k] !== undefined) o[k] = canonico(x[k]); });
    return o;
  }
  return x;
}
/* Huella estable de las entradas: no depende del orden de las claves; cambia si cambia cualquier número. */
function huella(entradas) { return 'e1-' + sha(JSON.stringify(canonico(entradas))).slice(0, 32); }

function compara(campo, calculado, guardado, tol, piso) {
  const c = num(calculado), g = num(guardado);
  if (g === null) return { campo, calculado: c, guardado: null, ok: null, motivo: 'sin_dato' };
  if (c === null) return { campo, calculado: null, guardado: g, ok: false, motivo: 'sin_calculo' };
  const dif = c - g, rel = g !== 0 ? Math.abs(dif) / Math.abs(g) : (dif === 0 ? 0 : null);
  return { campo, calculado: c, guardado: g, dif: r3(dif), rel: rel === null ? null : r6(rel), ok: Math.abs(dif) <= Math.max(tol * Math.abs(g), piso) };
}
function veredicto(campos) {
  if (campos.some(c => c.ok === false)) return false;
  return campos.some(c => c.ok === true) ? true : null;
}
/* Concilia lo que calculó el motor (`foto.cifras` o un objeto plano, en pesos) contra las columnas de
   resumen del renglón. ok: true (todo dentro), false (algo fuera o el motor no lo dio), null (sin con qué). */
function concilia(foto, resumen, opciones) {
  const o = typeof opciones === 'number' ? { tolerancia: opciones } : (opciones || {});
  const tol = o.tolerancia ?? TOLERANCIA, piso = o.piso ?? PISO, campos = o.campos || CAMPOS_CONCILIA;
  const calc = (foto && foto.cifras) || foto || {};
  const lista = campos.map(k => compara(k, calc[k], (resumen || {})[k], tol, piso));
  return { ok: veredicto(lista), contra: 'resumen', tolerancia: tol, piso, campos: lista };
}
/* Concilia el flujo mensual con la pestaña FLUJO (renglones [mes, cobros, costos, equity, pik_fee, deuda,
   caja], redondeados a pesos). Compara meses, totales de cobros/costos/equity/pik_fee, deuda máxima y caja
   final. Sólo tiene sentido si flujo_version == versión del caso (lo decide quien llama). */
const COLUMNAS_FLUJO = ['mes', 'cobros', 'costos', 'equity', 'pik_fee', 'deuda', 'caja'];
function conciliaFlujo(calculado, guardado, opciones) {
  const o = opciones || {}, tol = o.tolerancia ?? TOLERANCIA;
  const a = (calculado || []).map(f => f.map(Number)), b = (guardado || []).map(f => f.map(Number));
  if (!b.length) return { ok: null, contra: 'flujo', tolerancia: tol, campos: [], motivo: 'sin_flujo' };
  const piso = o.piso ?? Math.max(PISO, b.length);       // un peso por mes: cada mes se guardó redondeado
  const suma = (m, i) => m.reduce((s, f) => s + (Number.isFinite(f[i]) ? f[i] : 0), 0);
  const maxi = (m, i) => m.reduce((s, f) => Math.max(s, Number.isFinite(f[i]) ? f[i] : -Infinity), -Infinity);
  const ult = (m, i) => (m.length ? m[m.length - 1][i] : null);
  const campos = [{ campo: 'meses', calculado: a.length, guardado: b.length, ok: a.length === b.length }]
    .concat([1, 2, 3, 4].map(i => compara(COLUMNAS_FLUJO[i], a.length ? suma(a, i) : null, suma(b, i), tol, piso)))
    .concat([compara('deuda_max', a.length ? maxi(a, 5) : null, maxi(b, 5), tol, piso), compara('caja_final', ult(a, 6), ult(b, 6), tol, piso)]);
  return { ok: veredicto(campos), contra: 'flujo', tolerancia: tol, piso, campos };
}
function juntaConciliacion(resumen, flujo) {
  const partes = [resumen, flujo].filter(Boolean);
  const oks = partes.map(p => p.ok);
  const ok = oks.includes(false) ? false : (oks.includes(true) ? true : null);
  const out = { ok, tolerancia: (resumen || flujo || {}).tolerancia ?? TOLERANCIA, resumen: resumen || null, flujo: flujo || null };
  if (ok === null) out.nota = SIN_REFERENCIA;
  return out;
}
/* Las versiones que no son la activa del renglón no tienen contra qué compararse. */
function sinReferencia() { return { ok: null, nota: SIN_REFERENCIA, tolerancia: TOLERANCIA, resumen: null, flujo: null }; }

function ahora(fecha) {
  const d = fecha instanceof Date ? fecha : (fecha ? new Date(fecha) : new Date());
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  } catch (e) {
    return new Date(d.getTime() - 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');   // Hermosillo: UTC-7 sin horario de verano
  }
}
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaCorta(calculado) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(calculado || ''));
  return m ? `${Number(m[3])}-${MESES_CORTOS[Number(m[2]) - 1]}-${m[1]}` : '';
}
/* Texto para las leyendas «de dónde sale» del visor. No dice «vigente»: eso depende de `elegida`, que se
   mueve sin recalcular; el servidor antepone «vigente» al servir la elegida. */
function textoOrigen(tipo, estado, calculado, origen, nombre) {
  const ver = 'versión' + (nombre ? ' «' + String(nombre).slice(0, 40) + '»' : '') + (estado === 'propuesta' ? ' · sin conciliar' : '');
  const de = origen === 'libro' ? ' · copia del libro' : '';
  return `PPP · ${String(tipo || '').toLowerCase()} · ${ver}${de} · foto del ${fechaCorta(calculado)}`;
}
function planId(casoId, escenarioId) {
  if (!RE_CASO.test(String(casoId || ''))) throw new Error('caso_id inválido para una liga: ' + JSON.stringify(casoId));
  if (escenarioId === null || escenarioId === undefined || escenarioId === '') return 'ppp:' + casoId;
  if (!RE_ESC.test(String(escenarioId))) throw new Error('escenario_id inválido para una liga: ' + JSON.stringify(escenarioId));
  return 'ppp:' + casoId + ':' + escenarioId;
}

/* El commit del archivo del motor (sin red). «+local» si el archivo tiene cambios sin commit. */
function motorCommit(archivo, raiz) {
  const r = raiz || RAIZ;
  try {
    const h = execFileSync('git', ['-C', r, 'log', '-1', '--format=%H', '--', archivo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const sucio = execFileSync('git', ['-C', r, 'status', '--porcelain', '--', archivo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return (h ? h.slice(0, 12) : 'sin-commit') + (sucio ? '+local' : '');
  } catch (e) { return 'sin-git'; }
}

/* ───────────── ayudas para armar los cuadros ───────────── */
/* Arma `flujo` desde series mensuales EN PESOS (firmas en unidades). Convierte a MDP (r3, como el servidor),
   saca cada total con la regla del libro (SUM/MAX/ULT) salvo que el motor lo dé en `totales` (pesos), y
   recorta al último mes con movimiento (o al mes de reparto, si es mayor), igual que `leeVisor_`. */
function armaFlujo(series, opciones) {
  const o = opciones || {}, filas = {}, total = {};
  Object.keys(series || {}).forEach(k => {
    if (!FILAS_FLUJO[k]) throw new Error('Serie desconocida para el flujo del visor: ' + k);
    const s = series[k];
    if (!Array.isArray(s)) return;                         // ausente = no se entrega (nunca ceros inventados)
    const conv = UNIDADES_FLUJO.includes(k) ? (x => r3(x)) : (x => r3(num(x) === null ? null : num(x) / 1e6));
    filas[k] = s.map(x => conv(x) || 0);
    const t = o.totales && o.totales[k] !== undefined ? conv(o.totales[k])
      : FILAS_FLUJO[k] === 'SUM' ? r3(filas[k].reduce((a, b) => a + b, 0))
      : FILAS_FLUJO[k] === 'MAX' ? (filas[k].length ? r3(Math.max(...filas[k])) : null)
      : (filas[k].length ? filas[k][filas[k].length - 1] : null);
    total[k] = t;
  });
  let n = 0;
  MOVIMIENTO.forEach(c => { const s = filas[c] || []; for (let i = s.length - 1; i >= n; i--) if (Math.abs(s[i]) > 0.0005) { n = i + 1; break; } });
  const largo = Math.max(0, ...Object.values(filas).map(s => s.length));
  n = Math.max(n, Math.min(largo, Number(o.mesReparto) || 0));
  if (!Object.keys(filas).length) return { meses: null, filas: {}, total: {} };
  Object.keys(filas).forEach(c => { filas[c] = filas[c].slice(0, n); });
  return { meses: n || null, filas, total };
}
/* Un producto del cuadro 2 desde cifras en pesos (ventas y precio por unidad pasan a MDP). */
function producto(p) {
  const x = {
    nombre: p && p.nombre ? String(p.nombre).slice(0, 60) : '', unidades: r3(p && p.unidades), m2: r3(p && p.m2),
    precio_m2: r3(p && p.precio_m2), ventas: r3(mdp(p && p.ventas)), precio_unidad: r3(mdp(p && p.precio_unidad))
  };
  return x;
}
function productos(lista) {
  return (lista || []).map(producto).filter(x => x.nombre && (x.m2 > 0 || x.unidades > 0)).slice(0, MAX_PRODUCTOS);
}

/* Completa una forma parcial con la vacía. Rechaza claves desconocidas o reservadas del servidor. */
function completa(parcial) {
  const base = formaVacia(), p = parcial || {};
  Object.keys(p).forEach(k => {
    if (RESERVADAS.includes(k)) throw new Error('La foto no puede traer la clave reservada del servidor: ' + k);
    if (!(k in base)) throw new Error('Clave desconocida en la forma del visor: ' + k);
  });
  const out = Object.assign(base, p);
  out.plan = Object.assign(formaVacia().plan, p.plan || {});
  out.v = Object.assign(formaVacia().v, p.v || {});
  out.datos = Object.assign(formaVacia().datos, p.datos || {});
  out.flujo = Object.assign({ meses: null, filas: {}, total: {} }, p.flujo || {});
  return out;
}
/* Revisa la forma: tipos, listas, series del flujo y números finitos. Devuelve la lista de problemas. */
function valida(visor) {
  const e = [], d = visor || {};
  const fin = (x, donde) => { if (x !== null && x !== undefined && typeof x === 'number' && !Number.isFinite(x)) e.push(donde + ' no es finito'); };
  Object.keys(formaVacia()).forEach(k => { if (!(k in d)) e.push('falta ' + k); });
  Object.keys(d).forEach(k => { if (RESERVADAS.includes(k)) e.push('clave reservada ' + k); else if (!(k in formaVacia())) e.push('clave desconocida ' + k); });
  if (d.plan && typeof d.plan === 'object') Object.keys(d.plan).forEach(k => { if (!CLAVES_PLAN.includes(k)) e.push('plan.' + k + ' desconocida'); });
  if (d.v && typeof d.v === 'object') Object.keys(d.v).forEach(k => { fin(d.v[k], 'v.' + k); if (k === 'propuesta_por' || k === 'aprobada_por') e.push('v.' + k + ' lleva nombres de personas'); });
  if (!Array.isArray(d.productos)) e.push('productos no es lista');
  else {
    if (d.productos.length > MAX_PRODUCTOS) e.push('más de ' + MAX_PRODUCTOS + ' productos');
    d.productos.forEach((p, i) => Object.keys(p).forEach(k => { if (!CLAVES_PRODUCTO.includes(k)) e.push('productos[' + i + '].' + k + ' desconocida'); fin(p[k], 'productos[' + i + '].' + k); }));
  }
  if (d.datos && typeof d.datos === 'object') Object.keys(d.datos).forEach(k => { if (!DATOS[k]) e.push('datos.' + k + ' desconocida'); else fin(d.datos[k] && d.datos[k].valor, 'datos.' + k); });
  const f = d.flujo || {};
  Object.keys(f.filas || {}).forEach(k => {
    if (!FILAS_FLUJO[k]) e.push('flujo.filas.' + k + ' desconocida');
    if (!Array.isArray(f.filas[k])) e.push('flujo.filas.' + k + ' no es lista');
    else { if (f.filas[k].length !== f.meses) e.push('flujo.filas.' + k + ' no mide flujo.meses'); f.filas[k].forEach((x, i) => fin(x, 'flujo.filas.' + k + '[' + i + ']')); }
  });
  if (d.reparto !== null && d.reparto !== undefined) Object.keys(d.reparto).forEach(k => { if (!CLAVES_REPARTO.includes(k)) e.push('reparto.' + k + ' desconocida'); });
  ['versiones', 'candados', 'pruebas'].forEach(k => { if (!Array.isArray(d[k])) e.push(k + ' no es lista'); });
  return e;
}

/* ───────────── el renglón de PPP_VISOR ───────────── */
/* Arma el renglón de UNA versión (objeto con las COLUMNAS) y lo valida. estado: 'propuesta' sólo si la
   conciliación falló (algo fuera de tolerancia o el motor no lo dio); si pasó o no hubo con qué comparar
   («sin referencia»), 'lista'. `elegida` la reparte `eligeUltima` sobre todas las versiones del caso. */
function registro(d) {
  const ok = d.conciliacion ? d.conciliacion.ok : null;
  const estado = d.estado || (ok === false ? 'propuesta' : 'lista');
  if (!ESTADOS.includes(estado)) throw new Error('estado inválido: ' + estado);
  if (!ORIGENES.includes(d.origen)) throw new Error('origen inválido: ' + d.origen);
  if (estado === 'lista' && ok === false) throw new Error('Una foto fuera de tolerancia no puede quedar lista.');
  const orden = num(d.orden);
  if (!(orden >= 1) || Math.floor(orden) !== orden) throw new Error('orden inválido: ' + d.orden);
  const esc = d.escenario || {};
  const plan_id = planId(d.caso_id, esc.id);
  const visor = completa(d.visor);
  const problemas = valida(visor);
  if (problemas.length) throw new Error('La forma del visor no pasa: ' + problemas.slice(0, 5).join('; '));
  const visor_json = JSON.stringify(visor);
  if (visor_json.length > VISOR_MAX) throw new Error('visor_json mide ' + visor_json.length + ' caracteres; el servidor acepta ' + VISOR_MAX + '.');
  return {
    caso_id: String(d.caso_id), tipo: String(d.tipo || ''), escenario_id: esc.id || '', escenario_nombre: esc.nombre || '', orden,
    estado, elegida: '', elegida_por: '', elegida_fecha: '', motor_commit: String(d.motor_commit || ''), huella_entradas: String(d.huella_entradas || ''),
    calculado: String(d.calculado || ''), origen: d.origen, conciliacion: JSON.stringify(d.conciliacion || null), visor_json, plan_id
  };
}
/* Por omisión rige la última: marca `elegida` = 'sí' en la versión de mayor `orden` que esté `lista`, una por
   caso (si ninguna está lista, ninguna queda elegida). No toca renglones que ya traen elegida_por (Dirección). */
function eligeUltima(filas) {
  const porCaso = {};
  filas.forEach(f => { (porCaso[f.caso_id] = porCaso[f.caso_id] || []).push(f); });
  return filas.map(f => {
    const del = porCaso[f.caso_id];
    if (del.some(x => x.elegida_por)) return f;
    const listas = del.filter(x => x.estado === 'lista');
    const ultima = listas.length ? listas.reduce((a, b) => (b.orden > a.orden ? b : a)) : null;
    return Object.assign({}, f, { elegida: ultima === f ? 'sí' : '' });
  });
}
/* Lo que hace Dirección al elegir (el servidor hace lo mismo en la hoja): una sola elegida por caso, con
   quién y cuándo. No cambia ninguna foto ni su visor_json: sólo el puntero. */
function elige(filas, casoId, orden, quien) {
  const q = quien || {};
  const blanco = filas.find(f => f.caso_id === casoId && Number(f.orden) === Number(orden));
  if (!blanco) throw new Error('No hay foto de esa versión.');
  if (blanco.estado !== 'lista') throw new Error('Sólo se elige una foto lista (no una propuesta).');
  if (!q.por || !/^\d{4}-\d{2}-\d{2}/.test(String(q.fecha || ''))) throw new Error('Elegir pide quién (por) y fecha (AAAA-MM-DD).');
  return filas.map(f => f.caso_id !== casoId ? f : Object.assign({}, f, f === blanco
    ? { elegida: 'sí', elegida_por: String(q.por), elegida_fecha: String(q.fecha) }
    : { elegida: '', elegida_por: '', elegida_fecha: '' }));
}
function aFila(reg) { return COLUMNAS.map(c => reg[c] === undefined ? '' : reg[c]); }

/* ───────────── motores y la toma de las fotos ───────────── */
/* Todo lo que un módulo de motor necesita del HTML de su tablero, ya cortado y listo. */
function motor(tipo, opciones) {
  const def = MOTORES[String(tipo || '').toUpperCase()];
  if (!def) throw new Error('Tipo de motor desconocido: ' + tipo);
  const o = opciones || {}, raiz = o.raiz || RAIZ;
  const html = o.html || leeHtml(def.archivo, raiz);
  const ctrls = controles(html);
  const defaults = valoresPorDefecto(html, ctrls);
  const corte = cortaMotor(html, { desde: o.desde || def.desde, hasta: o.hasta || def.hasta });
  return Object.assign({ tipo: String(tipo).toUpperCase(), html, controles: ctrls, defaults, commit: o.html ? 'html-dado' : motorCommit(def.archivo, raiz) }, def, corte);
}

/* Las versiones de un caso desde `escenarios_json` del renglón, en su orden (orden = posición, 1 = la
   primera; la última es la de mayor orden). Sin escenarios: una sola versión con las columnas in*.
   Una versión sin id toma 'v<orden>' para que su liga `ppp:<caso>:<id>` sea única. */
function versionesDeRenglon(renglon) {
  const e = leeEscenarios(renglon && renglon.escenarios_json);
  if (!e.lista.length) return [{ id: '', nombre: 'Base', orden: 1, activa: true, escenario: null }];
  return e.lista.map((x, i) => ({ id: x.id && RE_ESC.test(x.id) ? x.id : 'v' + (i + 1), nombre: x.nombre, orden: i + 1, activa: x === e.activo, escenario: x }));
}

/* Toma la foto de UNA versión. `caso` = {tipo, renglon, flujo?, flujo_version?, libro?}; `version` = uno
   de `versiones…()`. El módulo devuelve {entradas, origen, visor, cifras, flujo}; aquí se pone la huella,
   la conciliación (sólo la versión activa tiene contra qué), el estado, la versión, la fecha y el origen. */
function tomaFoto(modulo, caso, version, opciones) {
  const o = opciones || {}, renglon = (caso && caso.renglon) || {}, ver = version || versionesDeRenglon(renglon).find(v => v.activa);
  const tipo = String((caso && caso.tipo) || modulo.TIPO || '').toUpperCase();
  const calculado = o.calculado || ahora(o.fecha);
  const r = modulo.foto(caso, { nucleo: module.exports, motor: o.motor, calculado, version: ver });
  if (!r || typeof r !== 'object') throw new Error('El módulo del motor no devolvió una foto.');
  const origen = r.origen || 'lote';
  const conFlujo = ver.activa && Array.isArray(caso.flujo) && caso.flujo.length && caso.flujo_version !== undefined && caso.flujo_version !== null
    && caso.flujo_version !== '' && String(caso.flujo_version) === String(renglon.version) && Array.isArray(r.flujo);
  const conc = ver.activa
    ? juntaConciliacion(concilia(r.cifras || {}, renglon, { tolerancia: o.tolerancia }), conFlujo ? conciliaFlujo(r.flujo, caso.flujo, { tolerancia: o.tolerancia }) : null)
    : sinReferencia();
  const estado = conc.ok === false ? 'propuesta' : 'lista';
  const esc = { id: ver.id, nombre: ver.nombre };
  const visor = completa(r.visor || {});
  visor.v.estado = null;                              // lo pone el servidor: «vigente» para la elegida
  if (visor.v.nombre === null || visor.v.nombre === undefined || visor.v.nombre === '') visor.v.nombre = ver.nombre || null;
  visor.version = ver.orden;
  visor.versiones = (o.todas || [ver]).map(x => ({ n: x.orden, nombre: x.nombre || '', estado: null }));
  visor.plan.mostrada = ver.orden;
  visor.plan.vigente = null;                          // el puntero `elegida` lo decide al servir
  visor.cambio = calculado;
  visor.origen = textoOrigen(tipo, estado, calculado, origen, ver.nombre);
  return registro({
    caso_id: renglon.caso_id, tipo, escenario: esc, orden: ver.orden, conciliacion: conc, origen, visor, calculado,
    motor_commit: r.motor_commit || (o.motor && o.motor.commit) || '', huella_entradas: huella(r.entradas || {})
  });
}
/* Todas las versiones de un caso: las del módulo (`versiones(caso, ctx)`, p. ej. pestañas de un libro
   nativo) o las de `escenarios_json`. Una versión que el motor no puede calcular no tumba a las demás:
   va a `errores`. Devuelve {fotos, errores} con la elegida por omisión ya marcada. */
function tomaFotos(modulo, caso, opciones) {
  const o = opciones || {}, calculado = o.calculado || ahora(o.fecha);
  const todas = typeof modulo.versiones === 'function' ? modulo.versiones(caso, { nucleo: module.exports, motor: o.motor }) : versionesDeRenglon(caso && caso.renglon);
  if (!Array.isArray(todas) || !todas.length) throw new Error('El caso no trae versiones.');
  if (todas.filter(v => v.activa).length > 1) throw new Error('Más de una versión activa.');
  const fotos = [], errores = [];
  todas.forEach(v => {
    try { fotos.push(tomaFoto(modulo, caso, v, Object.assign({}, o, { calculado, todas }))); }
    catch (err) { errores.push({ caso_id: caso && caso.renglon && caso.renglon.caso_id || null, orden: v.orden, escenario_id: v.id, error: String(err && err.message || err) }); }
  });
  return { fotos: eligeUltima(fotos), errores };
}

/* Modo ensayo: lee casos de un JSON local ({casos:[…]} o una lista) y escribe las fotos a otro JSON local.
   Sin red. No escribe dentro del repositorio (los datos reales no van a Git) salvo `permiteRepo`. */
function ensayo(entrada, salida, opciones) {
  const o = opciones || {};
  const fuera = path.resolve(salida);
  if (!o.permiteRepo && (fuera === RAIZ || fuera.startsWith(RAIZ + path.sep))) throw new Error('El ensayo no escribe dentro del repositorio: usa una carpeta fuera de él.');
  const crudo = JSON.parse(fs.readFileSync(entrada, 'utf8'));
  const casos = Array.isArray(crudo) ? crudo : (crudo.casos || []);
  const calculado = o.calculado || ahora(o.fecha);
  const fotos = [], errores = [], motores = {};
  casos.forEach((caso, i) => {
    const tipo = String((caso && caso.tipo) || '').toUpperCase(), id = caso && caso.renglon && caso.renglon.caso_id;
    try {
      const def = MOTORES[tipo];
      if (!def) throw new Error('tipo sin motor: ' + tipo);
      let mod = o.modulos && o.modulos[tipo];
      if (!mod) {
        const f = path.join(__dirname, def.modulo + '.cjs');
        if (!fs.existsSync(f)) throw new Error('motor pendiente: falta scripts/visor-fotos/' + def.modulo + '.cjs');
        mod = require(f);
      }
      if (!motores[tipo] && !o.sinMotor) motores[tipo] = motor(tipo, { raiz: o.raiz });
      const r = tomaFotos(mod, caso, { calculado, motor: motores[tipo], tolerancia: o.tolerancia });
      r.fotos.forEach(f => fotos.push(f));
      r.errores.forEach(e => errores.push(Object.assign({ i, tipo }, e)));
    } catch (err) { errores.push({ i, caso_id: id || null, tipo, error: String(err && err.message || err) }); }
  });
  const out = {
    esquema: 'ppp1-fotos-ensayo-v2', generado: calculado, columnas: COLUMNAS, fotos, errores,
    resumen: { casos: casos.length, fotos: fotos.length, listas: fotos.filter(f => f.estado === 'lista').length, propuestas: fotos.filter(f => f.estado === 'propuesta').length, elegidas: fotos.filter(f => f.elegida === 'sí').length, errores: errores.length }
  };
  fs.mkdirSync(path.dirname(fuera), { recursive: true });
  fs.writeFileSync(fuera, JSON.stringify(out, null, 2));
  return out;
}

module.exports = {
  RAIZ, ESQUEMA, TOLERANCIA, PISO, TZ, VISOR_MAX, MAX_ESCENARIOS, COLUMNAS, ESTADOS, SIN_REFERENCIA, ORIGENES, CAMPOS_CONCILIA, RESERVADAS, MOTORES,
  CLAVES_V, UNIDAD_V, DATOS, FILAS_FLUJO, MOVIMIENTO, CLAVES_PLAN, CLAVES_PRODUCTO, CLAVES_REPARTO, COLUMNAS_FLUJO, MAX_PRODUCTOS,
  formaVacia, completa, valida,
  num, r3, r6, mdp, fraccion,
  leeHtml, controles, sanea, fija, limita, valoresPorDefecto, cortaFuncion, cortaMotor, controlesSimulados, relaciones, motor, motorCommit,
  entradasDeRenglon, aplica, leeEscenarios,
  huella, concilia, conciliaFlujo, juntaConciliacion, sinReferencia, ahora, fechaCorta, textoOrigen, planId,
  armaFlujo, producto, productos,
  registro, eligeUltima, elige, aFila, versionesDeRenglon, tomaFoto, tomaFotos, ensayo
};

/* Línea de órdenes: node scripts/visor-fotos/nucleo.cjs ensayo <entrada.json> <salida.json> [--fecha "AAAA-MM-DD HH:mm"] */
if (require.main === module) {
  const [orden, entrada, salida, ...resto] = process.argv.slice(2);
  if (orden !== 'ensayo' || !entrada || !salida) {
    console.error('Uso: node scripts/visor-fotos/nucleo.cjs ensayo <entrada.json> <salida.json> [--fecha "AAAA-MM-DD HH:mm"]');
    process.exit(2);
  }
  const i = resto.indexOf('--fecha');
  const out = ensayo(entrada, salida, { calculado: i >= 0 ? resto[i + 1] : undefined });
  console.log(JSON.stringify(out.resumen));
  out.errores.forEach(e => console.error('· ' + (e.caso_id || '#' + e.i) + ' (' + e.tipo + '): ' + e.error));
  process.exit(out.errores.length ? 1 : 0);
}
