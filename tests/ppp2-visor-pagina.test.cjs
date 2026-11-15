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
  for (const x of [d.v.ventas, d.v.dueno_aporta, d.v.dueno_recibe, d.v.alianza_recibe, d.v.capital, d.v.max_ajeno, d.v.ganancia])
    assert.ok(t.includes(mdp(x)), 'falta ' + mdp(x));
  // los totales de lo que entra y sale van en la hoja de «Dinero» (figura grande y desglose), no en el cuadro chico
  const dinero = texto(visor.detalleHtml(p.cuadros.find((c) => c.id === 'dinero')));
  for (const x of [d.flujo.total.cobranza, d.flujo.total.egresos, d.flujo.total.disposicion]) assert.ok(dinero.includes(mdp(x)), 'falta en Dinero ' + mdp(x));
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

/* Planes del PPP de siempre: misma forma de datos, pero con huecos y su propio «origen». */
const conHuecos = () => {
  const d = copia(datos());
  d.origen = 'PPP · motor vertical · caso de prueba';
  for (const p of visor.PRUEBAS) delete d.v[p.k];
  delete d.v.rv_resultado;
  Object.assign(d, { candados: [], pruebas: [], pruebas_viejas: 0, reparto: null });
  d.plan.edad = ''; d.plan.candados_abiertos = null; d.plan.paso_texto = '';
  for (const c of ['firmas', 'respaldo', 'pago_respaldo', 'saldo_respaldo', 'disposicion', 'pago_banco', 'interes', 'apertura', 'saldo_banco']) { delete d.flujo.filas[c]; delete d.flujo.total[c]; }
  for (const k of ['dueno_aporta', 'dueno_recibe', 'dueno_veces', 'dueno_meses', 'alianza_recibe', 'capital', 'rend_capital', 'max_ajeno']) delete d.v[k];
  return d;
};
const visible = (c) => texto('<svg>' + c.svg + '</svg>');

test('con «origen», cada leyenda dice ese origen y ninguna nombra el libro; sin él, todo sigue igual', () => {
  const d = conHuecos(), p = visor.pinta(d, null), ls = leyendas(p.html).concat(...p.cuadros.map((c) => leyendas(visor.detalleHtml(c))));
  assert.ok(ls.length > 20);
  for (const l of ls) assert.equal(l.o, d.origen, l.t);
  const todo = p.html + p.cuadros.map(visor.detalleHtml).join('');
  assert.doesNotMatch(todo, /Libro · /, 'nada dice «Libro»');
  assert.match(texto(todo), /PPP · motor vertical · caso de prueba/);
  const sin = visor.pinta(datos(), null);
  assert.ok(leyendas(sin.html).every((l) => /^Libro · /.test(l.o)), 'sin origen, el rótulo del libro de siempre');
});

test('Riesgo y estado sin revisión para fondos, sin candados ni etapa: un estado digno, no anillos vacíos', () => {
  const d = conHuecos(), c = visor.pinta(d, null).cuadros.find((x) => x.id === 'riesgo');
  assert.match(visible(c), /Sin revisión para fondos/);
  assert.doesNotMatch(c.svg, /<path d="M[^"]+ A/, 'no hay anillos');
  assert.doesNotMatch(visible(c), /no aplica|—|Etapa|candado/);
  assert.match(texto(visor.detalleHtml(c)), /Sin revisión para fondos/);
  const conEtapa = conHuecos(); conEtapa.plan.edad = 'semilla'; conEtapa.plan.candados_abiertos = 2;
  const ce = visor.pinta(conEtapa, null).cuadros.find((x) => x.id === 'riesgo');
  assert.match(visible(ce), /Sin revisión para fondos[\s\S]*Etapa semilla 1\/5 · 2 candados abiertos/, 'lo que sí hay del estado se dice');
});

test('una serie o clave que no llegó cae en un estado vacío limpio: sin ceros inventados, guiones sueltos ni NaN', () => {
  const d = conHuecos(), p = visor.pinta(d, null);
  assert.doesNotMatch(p.html, /NaN|undefined|Infinity|\[object/);
  for (const c of p.cuadros) {
    assert.doesNotMatch(visible(c), /—|NaN|\$0\.0\b/, c.id + ': ' + visible(c));
    assert.doesNotMatch(visor.detalleHtml(c), /NaN|undefined|Infinity/, c.id);
  }
  const por = Object.fromEntries(p.cuadros.map((c) => [c.id, visible(c)]));
  assert.match(por.reparto, /Aún no hay reparto calculado/);
  assert.match(por.tiempo, /Ventas sin dato/, 'sin firmas por mes, la fila de ventas lo dice');
  assert.doesNotMatch(por.dinero, /banco|respaldo|Dinero ajeno/, 'sin banco, respaldo ni dinero ajeno no se nombran');
  // sin flujo mensual en absoluto
  const sinFlujo = conHuecos(); sinFlujo.flujo = { meses: 0, filas: {}, total: {} };
  const q = Object.fromEntries(visor.pinta(sinFlujo, null).cuadros.map((c) => [c.id, visible(c)]));
  assert.match(q.tiempo, /Aún no hay calendario calculado/);
  assert.match(q.dinero, /Aún no hay flujo calculado/);
  for (const k of Object.keys(q)) assert.doesNotMatch(q[k], /—|NaN/, k);
  // sin terreno, construcción, vendible ni tierra
  const sinTerreno = conHuecos(); sinTerreno.datos = {}; sinTerreno.productos = []; delete sinTerreno.v.tierra;
  assert.match(visible(visor.pinta(sinTerreno, null).cuadros.find((c) => c.id === 'terreno')), /Aún no hay terreno capturado/);
});

test('selector de Dirección: sólo con `elige`, con la buena marcada, sin confundirse con los de la liga; la sesión sólo se lee', () => {
  const d = datos();
  assert.doesNotMatch(visor.pinta(d, null).html, /vz-elige/, 'sin `elige` (el servidor de hoy) no hay selector');
  const con = copia(d);
  // como lo manda el servidor (Visor.gs, eligeDe_): `v` es el escenario_id, un texto (vacío en un caso sin escenarios)
  con.elige = { versiones: [{ v: 'ebase', nombre: 'Base <b>', buena: false }, { v: 'v2', nombre: 'Con banco', buena: true }, { v: 'x"><i>', nombre: '', buena: false }] };
  const h = visor.pinta(con, null).html;
  assert.equal((h.match(/class="vz-elige-op[ "]/g) || []).length, 3);
  assert.match(h, /class="vz-elige-op vz-buena" role="radio" aria-checked="true" data-elige="v2"/);
  assert.match(h, /data-elige="ebase" data-nombre="Base &lt;b&gt;"/, 'los nombres se escapan');
  assert.match(h, /data-elige="x&quot;&gt;&lt;i&gt;"/, 'el id se escapa y no se convierte en número');
  assert.doesNotMatch(h, /data-elige="0"/, 'un id de texto nunca se vuelve 0');
  const unica = copia(d); unica.elige = { versiones: [{ v: '', nombre: 'Base', buena: true }] };
  assert.match(visor.pinta(unica, null).html, /data-elige="" data-nombre="Base"/, 'la versión única de un caso sin escenarios');
  assert.doesNotMatch(h, /vz-chip/, 'no es un selector de los de la liga');
  assert.match(h, /sólo tú ves esto/);
  const src = fs.readFileSync(path.join(RAIZ, 'visor.js'), 'utf8');
  assert.doesNotMatch(src, /(setItem|removeItem)\(\s*'pyod_clave_v1'/, 'la sesión del Portero nunca se escribe ni se borra');
  assert.match(src, /tipo: 'ppp2-elige', k: k, plan: plan, v: x\.v, request_id: rid/);
  assert.equal(visor.CADA_MS, 3000, 'el sondeo pregunta cada 3 s');
});

test('fotos del PPP de siempre: Dinero sin saldo acumulado, una sola casa, pruebas sin número y un solo dato de tiempo', () => {
  for (const vacio of [null, []]) {
    const d = copia(datos()); d.origen = 'PPP · caso'; d.flujo.filas.flujo_acum = vacio;
    const c = visor.pinta(d, null).cuadros.find((x) => x.id === 'dinero');
    assert.doesNotMatch(visible(c), /a repartir|\+\$0\.0/, 'no inventa un cero');
    assert.match(visible(c), /Aún no hay flujo calculado/);
  }
  const casa = (n) => { const d = copia(datos()); d.plan.tipo = 'Casa unifamiliar'; d.productos = [{ nombre: 'Casa', unidades: n, m2: 240 * n, precio_m2: 30000, ventas: 7.2 * n, precio_unidad: 7.2 }]; return visor.pinta(d, null).cuadros.find((x) => x.id === 'terreno').svg; };
  assert.match(casa(1), /<rect x="18" y="26" width="54" height="40"><\/rect>/, 'una casa se ve como una sola casa');
  assert.doesNotMatch(casa(1), /width="31" height="13"/);
  assert.equal((casa(5).match(/width="31" height="13"/g) || []).length, 5, 'cinco unidades, cinco casas');
  assert.equal((casa(40).match(/width="31" height="13"/g) || []).length, 12, 'muchas: el dibujo llega a doce');
  const sinNumero = conHuecos(); for (const p of visor.PRUEBAS) sinNumero.v[p.k] = 'no aplica';
  const r = visor.pinta(sinNumero, null).cuadros.find((x) => x.id === 'riesgo');
  assert.match(visible(r), /Sin revisión para fondos/, 'pruebas sin número no son una revisión');
  assert.doesNotMatch(visible(r), /no aplica/);
  const unDato = conHuecos(); unDato.flujo.filas.firmas = unDato.flujo.filas.cobranza.map((x, i) => (i === 4 ? 1 : 0));
  for (const k of ['obra_inicio', 'fin_obra', 'mes_reparto']) delete unDato.v[k];
  unDato.flujo.filas.saldos = unDato.flujo.filas.saldos.map(() => 0);
  const ti = visor.pinta(unDato, null).cuadros.find((x) => x.id === 'tiempo');
  assert.match(visible(ti), /Ventas[\s\S]*Obra sin dato[\s\S]*Escrituras sin dato/);
  assert.doesNotMatch(visible(ti), /—|NaN|undefined|arranca/);
  const sinFirmas = conHuecos(); sinFirmas.flujo.filas.firmas = sinFirmas.flujo.filas.cobranza.map(() => 0);
  const hoja = visor.detalleHtml(visor.pinta(sinFirmas, null).cuadros.find((x) => x.id === 'tiempo'));
  assert.doesNotMatch(hoja, /\b0 meses|÷ 0 meses|— unidades/, 'sin firmas, la hoja no inventa «0 meses»');
});

const largo = (n) => {
  const d = copia(datos());
  for (const c of Object.keys(d.flujo.filas)) { const s = d.flujo.filas[c], u = s[s.length - 1]; while (s.length < n) s.push(/saldo|acum|caja/.test(c) ? u : 0); d.flujo.filas[c] = s.slice(0, n); }
  Object.assign(d.v, { mes_reparto: n, dueno_meses: n, obra_inicio: Math.round(n * 0.2), fin_obra: Math.round(n * 0.7) }); d.flujo.meses = n;
  return d;
};
const rotulosDe = (svg, y) => [...svg.matchAll(new RegExp('<text x="([\\d.]+)" y="' + y + '"(?: text-anchor="(\\w+)")? font-size="7.2"[^>]*>([^<]+)</text>', 'g'))]
  .map((m) => { const x = +m[1], w = m[3].length * 7.2 * 0.55, a = m[2] || 'start'; return { t: m[3], a: a === 'end' ? x - w : a === 'middle' ? x - w / 2 : x, b: a === 'end' ? x : a === 'middle' ? x + w / 2 : x + w }; })
  .sort((p, q) => p.a - q.a);
const sinEncimar = (rs, que) => { for (let i = 1; i < rs.length; i++) assert.ok(rs[i].a - rs[i - 1].b >= 2, que + ': «' + rs[i - 1].t + '» y «' + rs[i].t + '» se enciman'); };

test('horizontes largos (hasta 153 meses): el cuadro conserva la escala de 60 meses y se recorre de lado; la hoja la enseña completa', () => {
  const ancho = (svg) => { const m = /data-t="\{&quot;t&quot;:&quot;Mes 1&quot;[^"]*" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/.exec(svg); return m ? +m[1] : null; };
  const normal = visor.pinta(largo(60), null).cuadros.find((c) => c.id === 'dinero').svg;
  assert.doesNotMatch(normal, /vz-pan/, 'un plan de 60 meses no se recorre');
  for (const n of [80, 92, 153]) {
    const cs = visor.pinta(largo(n), null).cuadros;
    for (const [id, y, yG] of [['tiempo', 89, 89], ['dinero', 116, 123.4]]) {
      const c = cs.find((x) => x.id === id);
      assert.doesNotMatch(c.svg + c.svgG, /NaN|undefined|Infinity/, id + ' ' + n);
      const pan = /<g class="vz-pan" data-pan-max="([\d.]+)"/.exec(c.svg);
      assert.ok(pan && +pan[1] > 0, id + ' ' + n + ': el cuadro se recorre de lado');
      assert.match(c.svg, /class="vz-des-d"/, id + ' ' + n + ': un desvanecido dice que hay más a la derecha');
      assert.match(visor.pinta(largo(n), null).html, /<svg[^>]*class="vz-panea"/, 'la tarjeta lo sabe (touch-action: pan-y)');
      const rs = rotulosDe(c.svg, y);
      assert.ok(rs.some((r) => r.t === 'mes ' + n), id + ' ' + n + ': el último mes, al final del recorrido');
      sinEncimar(rs, id + ' ' + n + ' (cuadro)');
      assert.doesNotMatch(c.svgG, /vz-pan/, id + ' ' + n + ': la hoja enseña la figura completa');
      const rg = rotulosDe(c.svgG, yG);
      assert.ok(rg.some((r) => r.t === 'año') && rg.some((r) => r.t === 'mes ' + n), id + ' ' + n + ': la hoja, por años');
      assert.ok(rg.length <= 9); sinEncimar(rg, id + ' ' + n + ' (hoja)');
    }
    // a lo largo, «arranca la obra» va dentro del recorte de la gráfica (que empieza en x = 47): no se corta por la izquierda
    for (const oi of [2, 9, Math.round(n * 0.2)]) {
      const dd = largo(n); dd.v.obra_inicio = oi;
      const t = visor.pinta(dd, null).cuadros.find((c) => c.id === 'tiempo').svg;
      const m = /x="([\d.]+)" y="8.5" text-anchor="middle" font-size="7.5"[^>]*>(arranca la obra · )<tspan[^>]*>([^<]+)<\/tspan>/.exec(t);
      assert.ok(m, 'tiempo ' + n + ': el rótulo del arranque');
      const w = (m[2] + m[3]).length * 7.5 * 0.52;
      assert.ok(+m[1] - w / 2 >= 47, 'tiempo ' + n + ', arranque en el mes ' + oi + ': el rótulo empieza dentro del recorte');
    }
    const d = cs.find((c) => c.id === 'dinero').svg;
    assert.equal(ancho(d), ancho(normal), 'un mes mide lo mismo que en un plan de 60 meses (misma escala)');
    assert.equal((d.match(/data-t="\{&quot;t&quot;:&quot;Mes \d+&quot;/g) || []).length, n, 'se pueden recorrer todos los meses');
  }
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
