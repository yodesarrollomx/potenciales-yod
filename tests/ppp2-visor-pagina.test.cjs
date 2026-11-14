'use strict';
/* La página del visor (visor.js) contra lo que entrega el servidor (server/ppp2/Visor.gs), con el plan
   INVENTADO de tests/ppp2-mundo.cjs. La página sólo dibuja: aquí se comprueba que cada cifra pintada es
   la del libro, que cada figura dice de dónde sale y que los límites de la revisión para fondos son los
   de la plantilla del libro. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mundo, PLAN } = require('./ppp2-mundo.cjs');

const RAIZ = path.join(__dirname, '..');
const visor = require('../visor.js');
const LIGA = 'liga0000000000000000000000000001';
const renglon = (cambios) => Object.values(Object.assign({ liga: LIGA, plan_id: PLAN, para: 'Grupo de prueba', estado: 'activa', vence: '', versiones: '', etiquetas: '', creada: '2026-01-01', nota: '' }, cambios || {}));
const datos = (cambios, extra) => mundo({ ligas: [renglon(cambios)] }).get(Object.assign({ recurso: 'ppp2-visor', liga: LIGA }, extra || {}));
const copia = (x) => JSON.parse(JSON.stringify(x));
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const leyendas = (html) => [...html.matchAll(/data-t="([^"]+)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')));
const mdp = (x) => '$' + x.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

test('pinta los siete cuadros con las cifras del libro, sin inventar ninguna', () => {
  const d = datos(), p = visor.pinta(d, null), t = texto(p.html);
  assert.deepEqual(p.cuadros.map((c) => c.id), ['reparto', 'terreno', 'producto', 'tiempo', 'costo', 'dinero', 'riesgo']);
  assert.equal((p.html.match(/class="vz-card/g) || []).length, 7);
  assert.equal((p.html.match(/vz-doble/g) || []).length, 1, 'Reparto ocupa dos espacios: ocho en total');
  assert.doesNotMatch(p.html, /NaN|undefined|Infinity|\[object/);
  assert.match(t, /Proyecto Ejemplo/);
  assert.match(t, new RegExp('V' + d.version + ' ' + d.v.estado));
  for (const x of [d.v.ventas, d.v.dueno_aporta, d.v.dueno_recibe, d.v.alianza_recibe, d.v.capital, d.v.max_ajeno, d.v.ganancia, d.flujo.total.cobranza, d.flujo.total.egresos, d.flujo.total.disposicion])
    assert.ok(t.includes(mdp(x)), 'falta ' + mdp(x));
  for (const prod of d.productos) assert.ok(t.includes(mdp(prod.ventas)), prod.nombre);
  assert.ok(t.includes('×' + d.v.dueno_veces.toFixed(2)));
  assert.ok(t.includes('mes ' + d.v.mes_reparto));
  assert.ok(t.includes((d.v.rv_preventa * 100).toFixed(1) + '%'));
  assert.ok(t.includes('3,000 m²'), 'la superficie del terreno sale de Datos');
});

test('cada figura dice qué hay detrás y de qué pestaña del libro sale', () => {
  const d = datos(), p = visor.pinta(d, null), ls = leyendas(p.html);
  assert.ok(ls.length > 80, 'hay leyendas en todas las figuras: ' + ls.length);
  for (const l of ls) {
    assert.ok(l.t && Array.isArray(l.f) && l.f.length, 'leyenda vacía: ' + JSON.stringify(l));
    assert.match(l.o, /^Libro · (Resumen|Flujo V\d|Datos|Productos|Reparto|Candados|Pruebas)/, l.t + ' → ' + l.o);
  }
  const ventas = ls.find((l) => l.t === 'Ingresos por ventas');
  assert.deepEqual(ventas.f.slice(0, 3), d.productos.map((x) => [x.nombre, mdp(x.ventas)]), 'las ventas se desglosan por producto');
  assert.deepEqual(ventas.f[3], ['Total de ventas', mdp(d.v.ventas)]);
  const clientes = ls.find((l) => l.t === 'Clientes');
  assert.deepEqual(clientes.f.map((f) => f[0]), ['Enganches al firmar', 'Pagos durante la obra', 'Saldos al escriturar', 'Total']);
  assert.equal(ls.filter((l) => /^Mes \d+$/.test(l.t)).length, d.flujo.meses, 'el saldo se puede recorrer mes por mes');
  assert.ok(ls.some((l) => l.o === 'Libro · Resumen · v' + d.version + '.rv_margen'));
  for (const c of p.cuadros) {
    const h = visor.detalleHtml(c);
    assert.match(h, /<dl>/, c.id);
    assert.match(h, /Libro · /, c.id + ': el detalle dice de dónde sale');
    assert.doesNotMatch(h, /NaN|undefined/, c.id);
  }
});

test('los selectores sólo aparecen si la liga trae varias versiones o varios terrenos; el pie de marcas, si hay marcas', () => {
  const una = visor.pinta(datos(), null).html;
  assert.doesNotMatch(una, /vz-chip|vz-marcas/);
  const varias = datos({ versiones: 'todas' });
  const h = visor.pinta(varias, [{ nombre: 'Marca Uno', img: '' }, { nombre: 'Marca <Dos>', img: 'data:image/png;base64,AAAA' }, { nombre: 'Mala', img: 'https://ejemplo.test/x.png' }]).html;
  assert.equal((h.match(/class="vz-chip[ "]/g) || []).length, varias.versiones.length);
  assert.match(h, new RegExp('class="vz-chip vz-on" data-v="' + varias.version + '"'));
  assert.match(h, /<div class="vz-marcas"><span>Marca Uno<\/span><img src="data:image\/png;base64,AAAA" alt="Marca &lt;Dos&gt;"><span>Mala<\/span><\/div>/, 'sólo imágenes incrustadas; lo demás, el nombre');
  const terrenos = copia(varias);
  terrenos.menu.planes = [{ id: 'p2aaaaaa01', etiqueta: 'Terreno chico' }, { id: terrenos.menu.plan, etiqueta: 'Terreno grande' }];
  const ht = visor.pinta(terrenos, null).html;
  assert.match(ht, /data-plan="p2aaaaaa01">Terreno chico</);
  assert.match(ht, new RegExp('class="vz-chip vz-on" data-plan="' + terrenos.menu.plan + '"'));
});

test('los límites de la revisión para fondos son los de la plantilla del libro', () => {
  const py = fs.readFileSync(path.join(RAIZ, 'ppp2/libro/generar.py'), 'utf8');
  const cuerpo = py.slice(py.indexOf('def revision_formula'), py.indexOf('def revision_formula') + 1800);
  const libro = {};
  for (const m of cuerpo.matchAll(/IF\(\{g\('(rv_\w+)'\)\}(<=|>=|<)([\d.]+),0,1\)/g)) libro[m[1]] = [m[2], Number(m[3])];
  assert.equal(Object.keys(libro).length, 9, 'la fórmula de la plantilla tiene nueve pruebas');
  assert.equal(visor.PRUEBAS.length, 9);
  for (const p of visor.PRUEBAS) {
    const l = libro[p.k];
    assert.ok(l, p.k + ' no está en la plantilla');
    assert.equal(p.modo, { '<=': 'max', '>=': 'min', '<': 'cero' }[l[0]], p.k);
    if (p.modo !== 'cero') assert.equal(p.lim, l[1], p.k);
  }
  const justa = /rv_aportacion'\)\}<([\d.]+),\\"Pasa \(aportación justa\)/.exec(cuerpo);
  assert.equal(visor.PRUEBAS.find((p) => p.k === 'rv_aportacion').ideal, Number(justa[1]));
  assert.equal(visor.estadoPrueba(visor.PRUEBAS[0], 0.65), 'ok');
  assert.equal(visor.estadoPrueba(visor.PRUEBAS[0], 0.651), 'fuera');
  assert.equal(visor.estadoPrueba(visor.PRUEBAS.find((p) => p.k === 'rv_aportacion'), 0.22), 'justa');
  assert.equal(visor.estadoPrueba(visor.PRUEBAS.find((p) => p.k === 'rv_falta'), 0.5), 'fuera');
  assert.equal(visor.estadoPrueba(visor.PRUEBAS[0], null), 'na', 'una prueba sin banco no aplica');
});

test('aguanta planes raros: sin banco, con pérdida, sin productos, a medio capturar', () => {
  const base = datos();
  const sinBanco = copia(base);
  for (const c of ['disposicion', 'pago_banco', 'interes', 'apertura', 'saldo_banco']) { sinBanco.flujo.filas[c] = sinBanco.flujo.filas[c].map(() => 0); sinBanco.flujo.total[c] = 0; }
  for (const c of ['rv_linea_ventas', 'rv_linea_costo', 'rv_meses_credito', 'rv_cobertura', 'rv_preventa_banco']) sinBanco.v[c] = 'sin banco';
  const pierde = copia(base);
  Object.assign(pierde.v, { ganancia: -12.5, rv_falta: 9.3, rv_resultado: 'No pasa: 2 de 9 pruebas', rv_margen: 0.05, alianza_recibe: 0 });
  const vacio = copia(base);
  Object.assign(vacio, { productos: [], flujo: { meses: 0, filas: {}, total: {} }, reparto: null, candados: [], datos: {}, pruebas: [], v: { estado: 'borrador' } });
  for (const [nombre, d] of [['sin banco', sinBanco], ['pierde', pierde], ['vacío', vacio]]) {
    const p = visor.pinta(d, null);
    assert.equal(p.cuadros.length, 7, nombre);
    assert.doesNotMatch(p.html, /NaN|undefined|Infinity|\[object/, nombre);
    for (const c of p.cuadros) assert.doesNotMatch(visor.detalleHtml(c), /NaN|undefined|Infinity/, nombre + ' · ' + c.id);
  }
  assert.match(texto(visor.pinta(sinBanco, null).html), /no aplica/);
  assert.doesNotMatch(texto(visor.pinta(sinBanco, null).html), /al banco/);
  const tp = texto(visor.pinta(pierde, null).html);
  assert.match(tp, /No pasa · 2 de 9/);
  assert.match(tp, /Pérdida después del costo del dinero −\$12\.5/);
  assert.match(tp, /falta \$9\.3/);
  assert.match(texto(visor.pinta(vacio, null).html), /Aún no hay/);
});

test('lo que escribe una persona en el libro no se vuelve marcado en la página', () => {
  const d = copia(datos());
  d.plan.nombre = '<img src=x onerror=alert(1)>';
  d.productos[0].nombre = '"><script>x</script>';
  d.plan.paso_texto = '<b>paso</b>';
  d.v.rv_resultado = '<i>raro</i>';
  const p = visor.pinta(d, [{ nombre: '<u>marca</u>', img: 'javascript:alert(1)' }]);
  const todo = p.html + p.cuadros.map(visor.detalleHtml).join('');
  assert.doesNotMatch(todo, /<img src=x|<script>|<b>paso|<i>raro|<u>marca|javascript:alert/);
});

test('la página publicada no lleva datos de planes reales y apunta al mismo servidor que PPP 2', () => {
  for (const f of ['visor.html', 'visor.js', 'visor.css', 'ppp-libro.js', 'tests/fixtures/libro/index.html', 'tests/fixtures/libro/mixto.html', 'server/ppp2/Visor.gs', 'tests/ppp2-visor-pagina.test.cjs', 'tests/ppp2-visor-browser.cjs']) {
    const t = fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/assert\.doesNotMatch\([^\n]*\n/g, '').replace(/const PROHIBIDO = [^\n]*\n/g, '');
    assert.doesNotMatch(t, /Mor[eé]o|Avermont|Morelos|Puebla Arquitectos|@aurumarquitectos/i, f);
  }
  const ep = /var ENDPOINT = window\.PPP2_ENDPOINT \|\| '([^']+)'/.exec(fs.readFileSync(path.join(RAIZ, 'ppp2.js'), 'utf8'))[1];
  assert.equal(visor.ENDPOINT, ep);
  assert.ok(fs.readFileSync(path.join(RAIZ, 'ppp-libro.js'), 'utf8').includes("'" + ep + "'"), 'ppp-libro.js pregunta al mismo servidor');
  const html = fs.readFileSync(path.join(RAIZ, 'visor.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex,nofollow,noarchive">/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.doesNotMatch(html, /portero\.js|yod-acceso|shell\.js/, 'el visor no pasa por el Portero ni carga el marco');
});
