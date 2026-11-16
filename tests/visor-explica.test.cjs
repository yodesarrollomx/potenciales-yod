'use strict';
/* El visor explica cada cifra que se toca: qué es, cómo se calcula (con las cifras que el servidor ya trae), cómo está
   hoy, de qué depende (del grafo de fórmulas del libro), qué la mueve, por qué importa y de dónde sale.
   - Los textos viven en visor-explica.js; lo que lee cada fórmula, en visor-explica-grafo.js (generado de la plantilla
     por ppp2/libro/explica.py). Si la plantilla cambia y no se regenera, o si un texto describe otra fórmula, falla.
   - visor.js no calcula: enseña las cifras tal como llegan.
   Plan INVENTADO (tests/ppp2-mundo.cjs); nada sale a la red. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const { mundo, PLAN } = require('./ppp2-mundo.cjs');

const RAIZ = path.join(__dirname, '..');
const GRAFO = require('../visor-explica-grafo.js');
const TEXTOS = require('../visor-explica.js');
const visor = require('../visor.js');
const LIGA = 'liga0000000000000000000000000001';
const renglon = () => Object.values({ liga: LIGA, plan_id: PLAN, para: 'Grupo de prueba', estado: 'activa', vence: '', versiones: '', etiquetas: '', creada: '2026-01-01', nota: '' });
const datos = () => mundo({ ligas: [renglon()] }).get({ recurso: 'ppp2-visor', liga: LIGA });
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const leyendas = (html) => [...html.matchAll(/data-t="([^"]+)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')));
const mdp = (x) => '$' + x.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const cuadro = (d, id) => visor.pinta(d, null).cuadros.find((c) => c.id === id);
/* lo que se despliega bajo el renglón de una cifra, tal como lo pinta la hoja */
const panel = (html, x) => {
  const i = html.indexOf('data-x="' + x + '"');
  assert.ok(i > 0, 'no hay renglón para ' + x);
  const a = html.indexOf('<div class="vz-xp"', i), b = html.indexOf('</p></div></div>', a);
  return html.slice(a, b + 16);
};
const conGrafo = (G, f) => { const antes = globalThis.VISOR_EXPLICA_GRAFO; globalThis.VISOR_EXPLICA_GRAFO = G; try { return f(); } finally { globalThis.VISOR_EXPLICA_GRAFO = antes; } };
const RIESGO_X = visor.PRUEBAS.map((p) => 'v.' + p.k).concat(['estres', 'plan.edad', 'plan.candados_abiertos', 'plan.paso_texto']);

test('cada prueba de la revisión para fondos y cada cifra que se toca en «Riesgo y estado» tienen su texto completo', () => {
  for (const x of RIESGO_X) {
    const e = TEXTOS[x];
    assert.ok(e, 'falta el texto de ' + x);
    for (const k of ['corto', 'que', 'como', 'importa']) assert.ok(typeof e[k] === 'string' && e[k].length > 10, x + ': falta ' + k);
    assert.ok(e.mejora || e.cambia, x + ': falta qué la mueve');
    assert.ok(Array.isArray(e.opera) && e.opera.length, x + ': falta lo que lee su fórmula');
  }
  const d = datos(), c = cuadro(d, 'riesgo');
  // todas las figuras de la hoja que se pueden tocar traen su clave, y cada clave su texto
  const figuras = leyendas(c.svgG);
  assert.ok(figuras.length >= 13, 'anillos, aguante, etapa, candados y siguiente paso: ' + figuras.length);
  for (const l of figuras) {
    assert.ok(l.x, 'una figura de Riesgo y estado sin texto: ' + l.t);
    assert.ok(TEXTOS[l.x], 'sin texto: ' + l.x);
  }
  assert.deepEqual([...new Set(figuras.map((l) => l.x))].sort(), RIESGO_X.slice().sort(), 'cada cifra tiene su figura');
  // y en la hoja, cada renglón con texto es un botón que abre su región
  const h = visor.detalleHtml(c);
  const botones = [...h.matchAll(/<button type="button" class="vz-xb" aria-expanded="false" aria-controls="(vzX\d+)" aria-label="[^"]+: qué es y de qué depende" data-x="([^"]+)">/g)];
  assert.deepEqual(botones.map((b) => b[2]).sort(), RIESGO_X.slice().sort());
  for (const b of botones) assert.match(h, new RegExp('<div class="vz-xp" id="' + b[1] + '" role="region" aria-label="[^"]+" hidden>'), b[2]);
  assert.equal(new Set(botones.map((b) => b[1])).size, botones.length, 'ids únicos');
  assert.match(texto(h), /toca un renglón con flecha para ver qué es y de qué depende/);
});

test('los siete cuadros: cada cifra que se toca trae su texto (también las columnas por trimestre de Dinero) y cada texto tiene lo que pide', () => {
  const d = datos(), p = visor.pinta(d, null);
  const claves = new Set();
  for (const c of p.cuadros) {
    for (const l of leyendas((c.svgG || '') + c.svg)) {
      assert.ok(l.x, c.id + ': una cifra que se toca sin texto: ' + l.t);
      if (/^Mes(es)? \d+( a \d+)?$/.test(l.t) && /suma de (tres|seis) meses/.test(l.o)) assert.equal(l.x, 'visor.trimestre', 'las columnas por trimestre también traen su texto');
      if (!l.x) continue;
      claves.add(l.x);
    }
    for (const s of c.detalle) for (const f of s.filas) if (f[3]) claves.add(f[3]);
    // en su hoja, el botón de la leyenda siempre encuentra su renglón
    const h = visor.detalleHtml(c);
    for (const l of leyendas(c.svgG || c.svg)) if (l.x) assert.ok(h.includes('data-x="' + l.x + '"'), c.id + ': ' + l.x + ' no tiene renglón en la hoja');
  }
  // un plan al que le faltaría dinero: Dinero enseña además el respaldo (lo que faltó y lo que se le devuelve)
  const conRespaldo = datos(), n = conRespaldo.flujo.meses, serie = (m, x) => Array.from({ length: n }, (_, i) => (i === m ? x : 0));
  Object.assign(conRespaldo.flujo.filas, { respaldo: serie(14, 4.5), pago_respaldo: serie(30, 4.9), saldo_respaldo: serie(14, 4.5) });
  Object.assign(conRespaldo.flujo.total, { respaldo: 4.5, pago_respaldo: 4.9, saldo_respaldo: 4.5 });
  for (const c of visor.pinta(conRespaldo, null).cuadros) for (const l of leyendas((c.svgG || '') + c.svg)) if (l.x) claves.add(l.x);
  for (const x of claves) assert.ok(TEXTOS[x], 'clave sin texto: ' + x);
  for (const x of Object.keys(TEXTOS)) assert.ok(claves.has(x), 'texto que ninguna cifra usa: ' + x);
  // cuántos renglones se abren por cuadro (lo que no se abre son renglones de registro: candados, esquema por partes, desglose)
  const abren = Object.fromEntries(p.cuadros.map((c) => [c.id, [].concat(...c.detalle.map((s) => s.filas)).filter((f) => f[3]).length]));
  assert.deepEqual(abren, { reparto: 9, terreno: 6, producto: 4, tiempo: 8, costo: 15, dinero: 16, riesgo: 13 });
  for (const [x, e] of Object.entries(TEXTOS)) {
    for (const k of ['corto', 'que', 'como', 'importa']) assert.ok(typeof e[k] === 'string' && e[k].trim(), x + ': falta ' + k);
    assert.ok(e.mejora || e.cambia, x + ': falta qué la mueve');
    assert.ok(Array.isArray(e.opera), x + ': falta opera');
    for (const c of e.cifras || []) {
      assert.match(c[1], /^(v|datos|plan)\.[a-z0-9_.]+$|^flujo\.total\.[a-z_]+$/, x + ': ruta ' + c[1]);
      assert.ok(['mdp', 'pct', 'mes', 'meses', 'u', 'veces', 'm2', ''].includes(c[2] || ''), x + ': formato ' + c[2]);
    }
  }
});

test('lo que describe «cómo se calcula» es lo que lee la fórmula del libro (si la plantilla cambia, esto falla)', () => {
  for (const [x, e] of Object.entries(TEXTOS)) {
    if (e.de) {                                        // lo acomoda el visor: sale de esas cifras del grafo
      assert.deepEqual(e.opera, [], x + ': lo que acomoda el visor no es una fórmula del libro');
      assert.match(x, /^visor\./, x + ': lo que acomoda el visor se llama visor.…');
      for (const k of e.de) assert.ok(GRAFO.figuras[k], x + ': el grafo no tiene ' + k);
      assert.match(e.como, /lo (saca|hace) el visor|la hace el visor/, x + ': «cómo» dice que lo acomoda el visor');
      continue;
    }
    const f = GRAFO.figuras[e.figura || x];
    assert.ok(f, x + ': el grafo no tiene esa cifra');
    assert.deepEqual(e.opera.slice().sort(), f.d.slice().sort(), x + ': el texto describe otra fórmula; relee «como» contra ppp2/libro/generar.py');
    for (const n of e.opera) assert.ok(GRAFO.nodos[n], x + ': ' + n + ' no está en el grafo');
  }
  // lo que dicen los textos de las pruebas, contra la fórmula (revision_formula y VER_FILAS de generar.py)
  assert.deepEqual(GRAFO.figuras['v.rv_linea_costo'].d.slice().sort(), ['modelo:costo_con_tierra', 'modelo:tope_banco', 'palanca:usa_banco']);
  assert.deepEqual(GRAFO.figuras['v.rv_margen'].d.slice().sort(), ['modelo:costo_con_tierra', 'modelo:ventas']);
  assert.deepEqual(GRAFO.figuras['v.rv_falta'].via, ['flujo:37'], 'dinero que faltaría es el total de «Respaldo: lo que faltaría»');
  assert.equal(GRAFO.nodos['flujo:37'].n, 'Respaldo: lo que faltaría');
  assert.deepEqual(GRAFO.figuras['v.rv_falta'].d.slice().sort(), ['flujo:30', 'flujo:31', 'flujo:34', 'flujo:35']);
});

test('visor-explica-grafo.js está al día con la plantilla del libro y no se editó a mano (si no: python3 ppp2/libro/explica.py)', () => {
  const h = crypto.createHash('sha256');
  for (const nombre of ['generar.py', 'relaciones.py', 'explica.py']) {
    h.update(Buffer.concat([Buffer.from(nombre + '\0'), fs.readFileSync(path.join(RAIZ, 'ppp2/libro', nombre)), Buffer.from('\0')]));
  }
  assert.equal(GRAFO.huella, h.digest('hex'), 'cambió la plantilla o el guion: corre python3 ppp2/libro/explica.py');
  // el mismo texto que json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False) de Python
  const ordenado = (x) => Array.isArray(x) ? '[' + x.map(ordenado).join(',') + ']'
    : (x && typeof x === 'object') ? '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + ordenado(x[k])).join(',') + '}' : JSON.stringify(x);
  const cuerpo = {}; ['esquema', 'huella', 'nodos', 'figuras'].forEach((k) => { cuerpo[k] = GRAFO[k]; });
  assert.equal(crypto.createHash('sha256').update(ordenado(cuerpo), 'utf8').digest('hex'), GRAFO.firma, 'visor-explica-grafo.js no se edita a mano');
  const libro = fs.readFileSync(path.join(RAIZ, 'ppp2/libro/generar.py'), 'utf8');
  assert.equal(GRAFO.esquema, /^ESQUEMA = "([^"]+)"/m.exec(libro)[1]);
});

test('el guion regenera exactamente el mismo archivo (si hay Python con openpyxl)', (t) => {
  const py = cp.spawnSync('python3', ['-c', 'import openpyxl'], { encoding: 'utf8' });
  if (py.status !== 0) { t.skip('sin python3 con openpyxl: lo cubre la huella de arriba'); return; }
  const r = cp.spawnSync('python3', [path.join(RAIZ, 'ppp2/libro/explica.py'), '--check'], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('«De qué depende» sale del grafo: si el grafo dice otra cosa, la hoja dice otra cosa', () => {
  const d = datos(), c = cuadro(d, 'riesgo'), t0 = texto(panel(visor.detalleHtml(c), 'v.rv_linea_costo'));
  assert.match(t0, /De qué depende Sale directo de palanca ¿Usa crédito del banco\? resultados Línea del banco · , Costo con tierra/);
  assert.match(t0, /Línea del banco sale de palancas ¿Usa crédito del banco\? · , Banco: tope sobre obra directa · , Banco: tope sobre costo con terreno · , Banco: tope sobre ventas resultados Obra directa · , Costo con tierra · , Ventas/);
  assert.match(t0, /Costo con tierra sale de palanca Valor de la tierra resultado Costo sin tierra/);
  // un grafo distinto (como si la plantilla hubiera cambiado): la hoja lo sigue, sin nada escrito a mano
  const G = JSON.parse(JSON.stringify(GRAFO));
  G.nodos['modelo:costo_con_tierra'].n = 'Costo total inventado';
  G.figuras['v.rv_linea_costo'].d = ['modelo:costo_con_tierra'];
  const t1 = conGrafo(G, () => texto(panel(visor.detalleHtml(cuadro(d, 'riesgo')), 'v.rv_linea_costo')));
  assert.match(t1, /Sale directo de resultado Costo total inventado/);
  assert.doesNotMatch(t1, /Línea del banco sale de/);
  // una cifra que no sale de otra lo dice
  const sinNada = JSON.parse(JSON.stringify(GRAFO)); sinNada.figuras['v.rv_linea_costo'] = { d: [] };
  assert.match(conGrafo(sinNada, () => texto(panel(visor.detalleHtml(cuadro(d, 'riesgo')), 'v.rv_linea_costo'))), /No sale de otra cifra: es un dato del plan/);
  // aguante: las cifras de la huella de la versión, sin segundo nivel
  const ag = texto(panel(visor.detalleHtml(c), 'estres'));
  for (const n of GRAFO.figuras['v.huella'].d) assert.ok(ag.includes(GRAFO.nodos[n].n), 'aguante nombra ' + GRAFO.nodos[n].n);
  assert.doesNotMatch(ag.replace('Resultado: sale de otras cifras.', ''), / sale de /, 'aguante no abre el segundo nivel');
  assert.match(ag, /otra huella y hay que repetirlas/);
});

test('lo que acomoda el visor dice de qué cifras del libro sale; lo que no sale de otra cifra dice si es un dato o una decisión', () => {
  const d = datos(), p = visor.pinta(d, null);
  const h = (id) => visor.detalleHtml(p.cuadros.find((c) => c.id === id));
  const tv = texto(panel(h('terreno'), 'visor.tierra_ventas'));
  assert.match(tv, /Valor de la tierra ÷ ventas\. Este cociente lo saca el visor de dos cifras del libro\./);
  assert.match(tv, /De qué depende La acomoda el visor con cifras del libro\. Tierra sale de palanca Valor de la tierra Ventas sale de palanca Ajuste de precio sobre la lista dato Productos: unidades, m² y precio/);
  assert.match(texto(panel(h('terreno'), 'datos.terreno.m2')), /No sale de otra cifra: es un dato del plan\./);
  assert.match(texto(panel(h('reparto'), 'reparto.esquema')), /No sale de otra cifra: es una decisión del plan \(una palanca\)\./);
  // un dato que el libro calcula si nadie lo escribe: de qué sale
  assert.match(texto(panel(h('terreno'), 'datos.lamina.m2_construidos')), /Sale directo de datos Huella en planta baja \(desplante\) · , Niveles sobre el terreno · , Planta baja cerrada/);
  // Costo y ganancia, Dinero y Reparto: sus cifras con lo que trae el servidor
  assert.match(texto(panel(h('costo'), 'v.ganancia')), new RegExp('En esta versión: caja al cierre \\' + mdp(d.v.caja_cierre) + ' millones · valor de la tierra \\' + mdp(d.v.tierra) + ' millones'));
  assert.match(texto(panel(h('dinero'), 'flujo.cobranza')), new RegExp('enganches \\' + mdp(d.flujo.total.enganches) + ' millones · pagos durante la obra \\' + mdp(d.flujo.total.pagos_obra) + ' millones · saldos \\' + mdp(d.flujo.total.saldos) + ' millones'));
  assert.match(texto(panel(h('reparto'), 'v.dueno_veces')), /Es un criterio de Dirección: el dueño debe recibir por lo menos el valor de su tierra/);
});

test('las cifras de «cómo se calcula» son las que trae el servidor, tal cual; lo que no trae se dice sin cifra (visor.js no calcula)', () => {
  const d = datos(), h = visor.detalleHtml(cuadro(d, 'riesgo'));
  const lc = texto(panel(h, 'v.rv_linea_costo'));
  assert.match(lc, new RegExp('En esta versión: costo sin terreno \\' + mdp(d.v.costo_sin_tierra) + ' millones · valor de la tierra \\' + mdp(d.v.tierra) + ' millones \\.'));
  assert.match(lc, /La línea del banco no viene en esta pantalla\./);
  assert.match(lc, /Hoy El plan: 40\.0% · la revisión para fondos pide 50% o menos · sobran 10\.0 puntos\./);
  assert.match(texto(panel(h, 'v.rv_meses_credito')), new RegExp('el banco se liquida en el mes ' + d.v.banco_mes + ' · la obra arranca en el mes ' + d.v.obra_inicio));
  // ninguna cifra inventada: cada monto o mes del panel es uno que trajo el servidor (o el límite de la prueba)
  const servidas = new Set();
  const junta = (o) => { for (const v of Object.values(o || {})) if (typeof v === 'number') { servidas.add(mdp(v)); servidas.add('mes ' + v); } };
  junta(d.v); junta(d.flujo.total); junta(Object.fromEntries(Object.entries(d.datos).map(([k, v]) => [k, v.valor])));
  for (const x of RIESGO_X) {
    const t = texto(panel(h, x)).split('Hoy')[0];
    for (const m of t.match(/\$[\d,]+\.\d|mes \d+/g) || []) assert.ok(servidas.has(m), x + ': ' + m + ' no lo trajo el servidor');
  }
  // si el servidor no trae una cifra, no aparece ni se inventa
  const sin = datos(); delete sin.v.tierra;
  const t2 = texto(panel(visor.detalleHtml(cuadro(sin, 'riesgo')), 'v.rv_linea_costo'));
  assert.doesNotMatch(t2, /valor de la tierra \$/);
  assert.match(t2, /costo sin terreno \$380\.0 millones/);
  // el código que junta el texto no hace cuentas con las cifras: sólo las formatea
  const fuente = fs.readFileSync(path.join(RAIZ, 'visor.js'), 'utf8');
  const bloque = fuente.slice(fuente.indexOf('function cifraDe('), fuente.indexOf('function detalleHtml('));
  assert.doesNotMatch(bloque.replace(/'[^']*'/g, "''"), /\bx\s*[-+*/]\s*[\w(]|[\w)]\s*[-+*/]\s*x\b/, 'cifraDe sólo formatea');
});

test('la revisión para fondos es la regla del PPP: el límite se dice así, igual que en la plantilla, y nunca como política de un banco', () => {
  const d = datos(), c = cuadro(d, 'riesgo');
  const ls = leyendas(c.svgG).filter((l) => /^v\.rv_/.test(l.x));
  assert.equal(ls.length, 9);
  for (const l of ls) assert.deepEqual(l.f.map((f) => f[0]), ['El plan', 'La revisión pide', 'Holgura'], l.t);
  assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, 'visor.js'), 'utf8'), /[Ee]l banco pide/);
  const frase = { max: (p) => 'o menos', min: (p) => 'o más', cero: () => '$0' };
  for (const p of visor.PRUEBAS) {
    const e = TEXTOS['v.' + p.k], lim = p.modo === 'cero' ? '$0' : (p.u === '%' ? Math.round(p.lim * 100) + '%' : String(p.lim));
    assert.ok(e.importa.includes('La revisión para fondos del PPP pide'), p.k + ': el límite es la regla de la revisión para fondos del PPP');
    assert.ok(e.importa.includes(lim), p.k + ': el texto dice otro límite que la plantilla (' + lim + ')');
    assert.ok(visor.pideTexto(p).includes(frase[p.modo](p)), p.k);
  }
  assert.equal(visor.pideTexto(visor.PRUEBAS.find((p) => p.k === 'rv_aportacion')), '20% o más, y considera sano 25%');
  assert.equal(visor.pideTexto(visor.PRUEBAS.find((p) => p.k === 'rv_meses_credito')), '36 meses o menos');
  assert.equal(visor.pideTexto(visor.PRUEBAS.find((p) => p.k === 'rv_cobertura')), '1.3 veces o más');
  // aportación justa: la holgura no repite «lo sano» que ya dice el límite
  const ap = visor.detalleHtml(c).match(/data-x="v\.rv_aportacion"[\s\S]*?<small>([^<]+)<\/small>/)[1];
  assert.equal((ap.match(/lo sano/g) || []).length, 1, ap);
});

test('los textos: de tú, frases cortas, sin adjetivos de venta, sin nombres ni cifras de planes', () => {
  const plan = JSON.parse(fs.readFileSync(path.join(RAIZ, 'ppp2/libro/ejemplo-plan.json'), 'utf8'));
  const nombre = String((plan.datos['plan.nombre'] || {}).valor || plan.datos['plan.nombre'] || 'Proyecto Ejemplo');
  for (const [x, e] of Object.entries(TEXTOS)) {
    const todo = [e.corto, e.que, e.como, e.sin_cifra, e.mejora, e.empeora, e.cambia, e.importa, e.dep].filter(Boolean);
    for (const t of todo) {
      assert.doesNotMatch(t, /\busted\b|\bsu(s)? (plan|proyecto) de usted|!|¡/i, x + ': ' + t);
      assert.doesNotMatch(t, /incre[íi]ble|excelente|espectacular|garantiza|sin riesgo|oportunidad única|extraordinari/i, x + ': ' + t);
      assert.doesNotMatch(t, /\$\d{3,}(?!\b)|\$(?!100\b)\d+[.,]\d/, x + ': una cifra de plan en el texto: ' + t);
      assert.ok(!t.includes(nombre), x + ': nombra un plan');
      assert.match(t, /[.:)]$/, x + ': termina sin punto: ' + t);
    }
    assert.ok(e.corto.length <= 80, x + ': la línea corta es larga (' + e.corto.length + ')');
    assert.ok((e.que.match(/[.?](\s|$)/g) || []).length <= 2, x + ': «qué es» en una o dos frases');
    assert.ok(e.que.length <= 260, x + ': «qué es» largo (' + e.que.length + ')');
  }
  const archivo = fs.readFileSync(path.join(RAIZ, 'visor-explica.js'), 'utf8') + fs.readFileSync(path.join(RAIZ, 'visor-explica-grafo.js'), 'utf8');
  assert.doesNotMatch(archivo, /Mor[eé]o|Avermont|Morelos|Puebla Arquitectos|@aurumarquitectos|docs\.google\.com|script\.google\.com|AKfyc/i);
});

test('una foto del PPP de siempre: el renglón dice que la cifra salió del motor de su tablero y cómo se dedujo; no inventa fórmulas del libro', () => {
  const d = datos();
  d.origen = 'PPP · VERTICAL · versión «Base» · foto del 1-ene-2026';
  d.deducido = { 'v.rv_aportacion': '(tierra que aporta el dueño + capital usado) ÷ costo con tierra' };
  const h = visor.detalleHtml(cuadro(d, 'riesgo'));
  const ap = texto(panel(h, 'v.rv_aportacion'));
  assert.match(ap, /Cómo se calcula Deducido: \(tierra que aporta el dueño \+ capital usado\) ÷ costo con tierra\./);
  assert.match(ap, /sale del motor de su tablero del PPP de siempre \(es una foto\)/);
  assert.doesNotMatch(ap, /Sale directo de|Mejora:|palanca Capital|capital comprometido no viene/, 'nada del grafo ni de lo verificado contra el libro');
  assert.match(ap, /PPP · VERTICAL · versión «Base» · foto del 1-ene-2026$/);
  const lc = texto(panel(h, 'v.rv_linea_costo'));
  assert.match(lc, /Así la define el libro del PPP 2; en esta foto la dio el motor de su tablero\./, 'sin marca: la definición del libro, dicha como tal');
});

test('sin los textos o sin el grafo, el visor es el de siempre', () => {
  const d = datos();
  const t = globalThis.VisorExplica;
  delete globalThis.VisorExplica;
  try {
    const h = visor.detalleHtml(cuadro(d, 'riesgo'));
    assert.doesNotMatch(h, /vz-xb|vz-xp/);
    assert.match(texto(h), /Línea del banco entre costo con terreno 40\.0% máx 50% · sobran 10\.0 pts · Libro · Resumen · v2\.rv_linea_costo/);
    assert.match(texto(h), /Toca una cifra o una figura para ver qué hay detrás y de dónde sale\. Cifras/);
  } finally { globalThis.VisorExplica = t; }
  const sinGrafo = conGrafo(undefined, () => texto(panel(visor.detalleHtml(cuadro(d, 'riesgo')), 'v.rv_margen')));
  assert.match(sinGrafo, /Cómo se calcula/);
  assert.doesNotMatch(sinGrafo, /De qué depende/, 'sin grafo no se dice de qué depende (nada a mano)');
});

test('las series del flujo y los datos que recorre el guion son los que entrega el servidor', () => {
  const gs = fs.readFileSync(path.join(RAIZ, 'server/ppp2/Visor.gs'), 'utf8');
  const py = fs.readFileSync(path.join(RAIZ, 'ppp2/libro/explica.py'), 'utf8');
  const filas = Object.fromEntries([...gs.slice(gs.indexOf('FILAS: {'), gs.indexOf('MOVIMIENTO:')).matchAll(/(\w+): \[(\d+), /g)].map((m) => [m[1], Number(m[2])]));
  const series = Object.fromEntries([...py.slice(py.indexOf('FLUJO_SERIES = {'), py.indexOf('}', py.indexOf('FLUJO_SERIES = {'))).matchAll(/"(\w+)": (\d+)/g)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(series, filas);
  const dg = JSON.parse('[' + /DATOS: \[([^\]]+)\]/.exec(gs)[1].replace(/'/g, '"') + ']');
  const dp = JSON.parse('[' + /DATOS_VISOR = \[([^\]]+)\]/.exec(py)[1] + ']');
  assert.deepEqual(dp, dg);
  for (const k of Object.keys(filas)) assert.ok(GRAFO.figuras['flujo.' + k], 'flujo.' + k);
  for (const k of dg) assert.ok(GRAFO.figuras['datos.' + k], 'datos.' + k);
});
