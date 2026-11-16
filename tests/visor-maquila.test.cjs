'use strict';
/* La maquila del visor (15-nov-2026): lo que se vio al mover factor por factor en las fotos del PPP de siempre y en el
   libro, y que ya no debe volver. Cada prueba falla con el visor de antes. Datos INVENTADOS (tests/ppp2-mundo.cjs);
   nada sale a la red.
   Corre con: node --test tests/visor-maquila.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../visor.js');
const TEXTOS = require('../visor-explica.js');
require('../visor-explica-grafo.js');
const { mundo, PLAN } = require('./ppp2-mundo.cjs');

const LIGA = 'liga0000000000000000000000000001';
const copia = (x) => JSON.parse(JSON.stringify(x));
const base = () => mundo({ ligas: [[LIGA, PLAN, 'Grupo', 'activa', '', '', '', '2026-01-01', '']] }).get({ recurso: 'ppp2-visor', liga: LIGA });
const texto = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const leyendas = (html) => [...String(html).matchAll(/data-t="([^"]+)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')));
const cuadro = (d, id) => V.pinta(d, null).cuadros.find((c) => c.id === id);
const filas = (c) => [].concat(...c.detalle.map((s) => s.filas));
const fila = (c, nombre) => filas(c).find((f) => f[0] === nombre);
/* el ancho que el visor estima para un texto (la misma regla de visor.js: ancho()) */
const ancho = (s, size, negrita) => String(s).length * size * (negrita ? 0.57 : 0.52);
/* los <text> de un SVG con su posición, tamaño y anclaje (sólo los de primer nivel de cada renglón) */
const textos = (svg) => [...String(svg).matchAll(/<text([^>]*)>([\s\S]*?)<\/text>/g)].map((m) => {
  const a = (k) => { const r = new RegExp('\\s' + k + '="([^"]*)"').exec(m[1]); return r ? r[1] : null; };
  return { x: Number(a('x')), y: Number(a('y')), size: Number(a('font-size')), bold: a('font-weight') === '700', fin: a('text-anchor') === 'end', medio: a('text-anchor') === 'middle', t: texto(m[2]) };
});
const caja = (t) => { const w = ancho(t.t, t.size, t.bold), a = t.fin ? t.x - w : (t.medio ? t.x - w / 2 : t.x); return { a, b: a + w, arriba: t.y - t.size * 0.8, abajo: t.y + t.size * 0.2 }; };
const tocan = (p, q) => Math.min(p.b, q.b) - Math.max(p.a, q.a) > 0.5 && Math.min(p.abajo, q.abajo) - Math.max(p.arriba, q.arriba) > 0.5;
/* una foto del PPP de siempre, inventada: sin etapa, candados, siguiente paso ni pruebas de estrés */
const foto = (d) => {
  d = copia(d || base());
  d.origen = 'PPP · MACROLOTES · versión vigente «Base de prueba» · foto del 1-ene-2026';
  d.plan.edad = null; d.plan.candados_abiertos = null; d.plan.paso_texto = null; d.candados = []; d.pruebas = []; d.pruebas_viejas = null;
  return d;
};

test('Reparto: si el dueño no pone su terreno (lo vende), «veces lo que puso» no aplica; un ×0.00 real sí se ve', () => {
  const d = copia(base());
  d.v.dueno_aporta = 0; d.v.dueno_recibe = d.v.tierra; d.v.dueno_veces = 1;
  const c = cuadro(d, 'reparto'), t = texto(c.svg);
  assert.match(t, /Dueño vende su terreno/);
  assert.doesNotMatch(t, /pone \$0\.0/, 'no dice que pone $0.0');
  assert.doesNotMatch(c.svg, />×1\.00</, 'no inventa «×1.00 veces lo que puso» para quien no puso nada');
  assert.match(t, /no aplica/);
  assert.equal(fila(c, 'Dueño · aporta su tierra')[1], 'no la aporta: la vende');
  const tip = leyendas(c.svg).find((l) => l.t === 'Dueño del terreno');
  assert.deepEqual(tip.f.find((f) => f[0] === 'Veces lo que puso'), ['Veces lo que puso', 'no aplica: no pone su terreno']);
  assert.deepEqual(tip.f.find((f) => f[0] === 'Veces el valor de su tierra'), ['Veces el valor de su tierra', '1.00×'], 'el múltiplo del servidor se dice contra lo que se mide');
  // el dueño que pone su terreno y no recibe nada: ×0.00, en rojo (0 no es «sin dato»)
  const cero = copia(base()); cero.v.dueno_recibe = 0; cero.v.dueno_veces = 0;
  const c0 = cuadro(cero, 'reparto');
  assert.match(c0.svg, /fill="#7f2f26">×0\.00</);
  assert.equal(fila(c0, 'Dueño · veces su tierra')[1], '0.00×');
  assert.match(c0.svgG, />×0\.00</);
});

test('Reparto: lo que se recibe en negativo se dice como pérdida, y un pago al capital de 0 no se vuelve «recupera todo»', () => {
  const d = copia(base());
  d.v.alianza_recibe = -5;
  d.flujo.total.pago_capital = 0;
  const c = cuadro(d, 'reparto'), t = texto(c.svg + c.svgG);
  assert.doesNotMatch(t, /recibe −\$/, 'nadie «recibe» una cifra negativa');
  assert.match(t, /pierde \$5\.0/);
  assert.equal(fila(c, 'Alianza · pierde')[1], '$5.0');
  assert.match(t, /Capital pone efectivo pone \$[\d.,]+ recibe \$0\.0/, 'el capital recupera lo que trae el servidor: 0');
  assert.match(c.svg, />×0\.00</);
  assert.doesNotMatch(c.svg, />×1\.00</);
});

test('Reparto: los rótulos de «pone» y «recibe» no se meten en la columna «×» ni bajo «veces lo que puso»', () => {
  for (const cambio of [{ dueno_aporta: 1600, dueno_recibe: 14.1, dueno_veces: 0.0088 }, { capital: 120, dueno_aporta: 30, dueno_recibe: 60, dueno_veces: 2 }]) {
    const d = copia(base()); Object.assign(d.v, cambio); d.flujo.total.pago_capital = 143.8;
    const ts = textos(cuadro(d, 'reparto').svg);
    const veces = ts.filter((t) => t.fin && t.x === 396);
    const otros = ts.filter((t) => !(t.fin && t.x === 396) && t.y < 120);
    for (const o of otros) for (const v of veces) assert.ok(!tocan(caja(o), caja(v)), '«' + o.t + '» toca «' + v.t + '»');
  }
});

test('Reparto: «Orden de cobro» cabe en su figura (se achica o se parte en renglones)', () => {
  const d = copia(base());
  d.reparto.parte_dueno = 0.3; d.reparto.parte_alianza = 0.7; d.v.dueno_meses = 76;
  const c = cuadro(d, 'reparto');
  for (const t of textos(c.svgG).filter((x) => /cobro|dueño cobra|→/.test(x.t))) assert.ok(caja(t).b <= 220.5, 'se sale de la figura grande: «' + t.t + '»');
  for (const t of textos(c.svg).filter((x) => /Orden de cobro/.test(x.t))) assert.ok(caja(t).b <= 396.5, 'se sale del cuadro: «' + t.t + '»');
  assert.match(texto(c.svgG), /alianza/, 'el renglón no se corta: sigue completo en dos líneas');
});

test('Terreno: un 0 m² de construcción es un dato (no «sin dato»); en lotes «vendible ÷ construcción» no aplica; manda el área vendible del dato', () => {
  const d = copia(base());
  d.plan.tipo = 'Lotes residenciales';
  d.datos['lamina.m2_construidos'] = { valor: 0, estado: null };
  d.datos['lamina.m2_vendibles'] = { valor: 12345, estado: null };
  const c = cuadro(d, 'terreno'), t = texto(c.svg);
  assert.match(t, /Construcción total 0 m²/);
  assert.doesNotMatch(t, /Construcción total sin dato/);
  assert.equal(fila(c, 'Construcción total')[1], '0 m²');
  assert.equal(fila(c, 'Vendible entre construcción')[1], 'no aplica');
  assert.match(fila(c, 'Vendible entre construcción')[2], /en lotes lo que se vende es terreno/);
  assert.equal(fila(c, 'Área vendible')[1], '12,345 m²', 'el dato del plan, no la suma de los productos');
  assert.match(fila(c, 'Área vendible')[2], /la suma de los productos da/);
  const tip = leyendas(c.svg).find((l) => l.t === 'Área vendible');
  assert.ok(tip.f.some((f) => f[0] === 'Suma de los productos'), 'la leyenda dice que la suma de los productos es otra');
});

test('Terreno: «% de ventas» sólo va junto a la tierra si cabe en la tarjeta', () => {
  const d = copia(base()); d.v.tierra = 1600; d.v.ventas = 241.3;
  const tierra = textos(cuadro(d, 'terreno').svg).find((t) => /^\$1,600\.0/.test(t.t));
  assert.ok(tierra && caja(tierra).b <= 184.5, 'se sale de la tarjeta: «' + (tierra && tierra.t) + '»');
  assert.match(texto(cuadro(d, 'terreno').detalle.map((s) => s.filas.map((f) => f.join(' ')).join(' ')).join(' ')), /663\.1%/, 'el cociente sigue en la hoja');
});

test('Producto: lo que no es de un producto se dice (ajuste de precio del libro u otros ingresos de la foto); un producto sin ventas no vale «$0.0»', () => {
  const d = copia(base());
  const suma = d.productos.reduce((s, p) => s + p.ventas, 0);
  d.v.ventas = Math.round((suma * 1.05) * 1000) / 1000;
  const c = cuadro(d, 'producto');
  assert.ok(fila(c, 'Ajuste de precio de la versión'), 'en un libro, la diferencia es el ajuste de precio de la versión');
  assert.match(texto(c.svg), /fuera de productos/);
  // una foto: lo que el motor suma a sus ventas sin ser un producto viene en v.otros_ingresos con su marca
  const f = foto(d); f.v.otros_ingresos = Math.round((d.v.ventas - suma) * 1000) / 1000;
  f.deducido = { 'v.otros_ingresos': 'retorno por financiar del motor: va en las ventas y no es de ningún producto' };
  const cf = cuadro(f, 'producto'), o = fila(cf, 'No es de un producto');
  assert.ok(o, 'la foto dice qué es lo que no es de un producto');
  assert.match(V.partesOrigen(o[2]).ded, /retorno por financiar/);
  assert.ok(!fila(cf, 'Diferencia sin explicar'), 'y ya cuadra');
  // un producto con metros y unidades y ventas en 0
  const s = copia(base()); s.productos[1].ventas = 0; s.productos[1].precio_unidad = null;
  const cs = cuadro(s, 'producto');
  assert.equal(filas(cs).find((x) => x[0] === s.productos[1].nombre)[1], 'sin ventas');
  assert.doesNotMatch(texto(cs.svg), new RegExp(s.productos[1].nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\$0\\.0'));
  const tip = leyendas(cs.svg).find((l) => l.t === s.productos[1].nombre);
  assert.ok(!tip.f.some((x) => /—/.test(x[1])), 'la leyenda no pinta huecos: ' + JSON.stringify(tip.f));
});

test('Producto: el nombre del mosaico se corta antes de llegar a su cifra', () => {
  const d = copia(base());
  d.productos = [{ nombre: 'Departamentos A · 60 m² con terraza', unidades: 40, m2: 2400, precio_m2: 55000, ventas: 132, precio_unidad: 3.3 },
    { nombre: 'Departamentos B · 85 m²', unidades: 40, m2: 3400, precio_m2: 55000, ventas: 187, precio_unidad: 4.675 },
    { nombre: 'Departamentos C · 80 m²', unidades: 40, m2: 3200, precio_m2: 55000, ventas: 176, precio_unidad: 4.4 }];
  d.v.ventas = 495;
  const svg = cuadro(d, 'producto').svg, ts = textos(svg.slice(svg.indexOf('pointer-events="none"')));
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) assert.ok(!tocan(caja(ts[i]), caja(ts[j])), '«' + ts[i].t + '» toca «' + ts[j].t + '»');
});

test('Tiempo y Dinero: los rótulos del eje dejan un hueco real («mes 1 9» se leía «mes 19») y hasta 78 meses no se recorre de lado', () => {
  const d = copia(base()); d.v.obra_inicio = 3;
  for (const id of ['tiempo', 'dinero']) {
    const c = cuadro(d, id), eje = textos(c.svg).filter((t) => t.size === 7.2 && /^(mes )?\d+$|^año$/.test(t.t));
    const cajas = eje.map(caja).sort((a, b) => a.a - b.a);
    for (let i = 1; i < cajas.length; i++) assert.ok(cajas[i].a - cajas[i - 1].b >= 4.9, id + ': rótulos del eje pegados ' + JSON.stringify(eje.map((t) => t.t)));
  }
  const largo = copia(base()), n = 65, mas = (a) => a.concat(Array(Math.max(0, n - a.length)).fill(0)).slice(0, n);
  Object.keys(largo.flujo.filas).forEach((k) => { largo.flujo.filas[k] = mas(largo.flujo.filas[k]); });
  largo.flujo.meses = n; largo.v.mes_reparto = n;
  for (const id of ['tiempo', 'dinero']) assert.doesNotMatch(cuadro(largo, id).svg, /class="vz-pan"/, id + ': 65 meses caben comprimidos');
});

test('Dinero: «a repartir» lleva halo y, si la figura se recorre de lado, va fija al borde (no la parte el borde)', () => {
  const d = copia(base()), n = 120, mas = (a) => a.concat(Array(Math.max(0, n - a.length)).fill(a.length ? a[a.length - 1] : 0)).slice(0, n);
  ['flujo_acum', 'cap_acum', 'saldo_banco', 'caja', 'saldo_capital'].forEach((k) => { if (d.flujo.filas[k]) d.flujo.filas[k] = mas(d.flujo.filas[k]); });
  Object.keys(d.flujo.filas).forEach((k) => { if (d.flujo.filas[k].length !== n) d.flujo.filas[k] = d.flujo.filas[k].concat(Array(n - d.flujo.filas[k].length).fill(0)); });
  d.flujo.meses = n; d.v.mes_reparto = n;
  const svg = cuadro(d, 'dinero').svg, pan = svg.indexOf('class="vz-pan"'), finPan = svg.indexOf('class="vz-des-i"');
  assert.ok(pan > 0, 'a 120 meses se recorre de lado');
  const rot = svg.indexOf('>a repartir ');
  assert.ok(rot > finPan, '«a repartir» va fuera de lo que se recorre');
  assert.match(svg.slice(svg.lastIndexOf('<text', rot), rot), /paint-order="stroke"/, 'con halo de papel');
});

test('Costo y ganancia: «Terreno y cierre», intereses con su propio texto y cada renglón se toca entero', () => {
  const d = copia(base()); d.flujo.total.cierre = 2.5;
  const c = cuadro(d, 'costo'), ls = leyendas(c.svg);
  assert.ok(ls.some((l) => l.t === 'Terreno y cierre'), 'el renglón que suma la tierra y su cierre lo dice');
  const int = ls.find((l) => l.t === 'Intereses y apertura');
  assert.equal(int.x, 'visor.intereses_apertura', 'no abre el texto de «Costo del dinero» (que incluye al capital)');
  assert.ok(TEXTOS['visor.intereses_apertura']);
  assert.ok(filas(c).some((f) => f[3] === 'visor.intereses_apertura'));
  const renglones = [...c.svg.matchAll(/<g class="vz-t" data-t="[^"]+"><rect x="71" y="[\d.]+" width="113" height="10.2" fill="#fffdf9" fill-opacity="0"><\/rect><text/g)];
  assert.ok(renglones.length >= 5, 'cada renglón de la derecha tiene su área tocable completa: ' + renglones.length);
});

test('Dinero en una foto: sin desglose de clientes no hay tres «—»; «nada» en lo que junta la preventa; el capital aportado; razones de lo vacío', () => {
  const f = foto();
  ['enganches', 'pagos_obra', 'saldos', 'caja_minima'].forEach((k) => { delete f.flujo.filas[k]; delete f.flujo.total[k]; });
  f.deducido = { 'flujo.total.enganches': 'sin dato: el motor de su tablero no separa lo que cobra en enganches, pagos durante la obra y saldos', 'flujo.total.caja_minima': 'no aplica: el motor de su tablero no guarda caja mínima; usa cada peso en cuanto entra' };
  f.flujo.filas.flujo_acum = f.flujo.filas.flujo_acum.map((x, i) => -1 - i);   // nunca sube antes de lo más hondo
  const c = cuadro(f, 'dinero'), h = V.detalleHtml(c), t = texto(h);
  assert.doesNotMatch(t, /enganches al firmar —|pagos durante la obra —|saldos al escriturar —/);
  assert.match(t, /Sin dato: el motor de su tablero no separa lo que cobra/);
  assert.match(t, /Caja mínima exigida no aplica [^]*?No aplica: el motor de su tablero no guarda caja mínima/);
  assert.equal(fila(c, 'Lo que junta la preventa')[1], 'nada');
  assert.match(t, /Capital aportado/);
  assert.doesNotMatch(t, /Capital devuelto/);
  assert.ok(leyendas(c.svg).some((l) => l.x === 'visor.trimestre'), 'las columnas por trimestre traen su texto');
});

test('Riesgo en una foto: sin etapa, candados, siguiente paso ni «por repetir»; «sin dato» no es «no aplica»', () => {
  const f = foto();
  f.v.rv_cobertura = null; f.v.rv_preventa_banco = 'sin banco';
  f.deducido = { 'v.rv_cobertura': 'sin dato: el calendario de firmas no cuadra con los cobros del motor' };
  const c = cuadro(f, 'riesgo'), h = V.detalleHtml(c), todo = texto(c.svg + c.svgG + h);
  assert.doesNotMatch(todo, /Etapa|Siguiente paso|por repetir|candados? abiertos?/, 'lo que sólo existe en el libro no se pinta en «—»');
  assert.match(texto(c.svg), /Estrés: sin pruebas/);
  assert.match(texto(h), /El PPP de siempre no corre pruebas de estrés/);
  const cob = c.detalle[0].filas.find((x) => x[3] === 'v.rv_cobertura'), pb = c.detalle[0].filas.find((x) => x[3] === 'v.rv_preventa_banco');
  assert.match(cob[2], /sin dato/);
  assert.match(cob[4], /^El plan: sin dato · el calendario de firmas no cuadra/);
  assert.match(pb[2], /no aplica/);
  assert.match(pb[4], /El plan: sin banco · esta prueba no aplica/);
  assert.match(texto(c.svgG), /sin dato/);
  // en un libro, una prueba sin número y sin razón también es «sin dato»
  const l = copia(base()); l.v.rv_cobertura = '';
  assert.match(texto(cuadro(l, 'riesgo').svgG), /sin dato/);
});

test('Qué es cada cifra en una foto: una cifra vacía dice por qué (nunca «la dio el motor»); lo del libro y los cocientes se dicen como son', () => {
  const f = foto();
  f.v.ganancia = null; f.v.margen = null;
  f.deducido = { 'v.margen': 'sin dato: la utilidad del motor es antes de la tierra que aporta el dueño', 'flujo.total.obra': 'la obra directa del motor', 'reparto.esquema': 'es el esquema que usa el motor de su tablero; no es uno de los cinco del libro del PPP 2' };
  const cs = V.pinta(f, null).cuadros, h = cs.map(V.detalleHtml).join('');
  // cada renglón cuya cifra vino vacía: sin «la dio el motor»
  for (const c of cs) for (const x of filas(c)) {
    if (!x[3] || !TEXTOS[x[3]]) continue;
    const panel = V.explicaHtml(x[3], x[4], x[2]);
    if (['—', 'sin dato', 'no aplica'].includes(x[1])) assert.doesNotMatch(texto(panel), /la dio el motor/, c.id + ' · ' + x[0]);
  }
  const margen = V.explicaHtml('v.margen', '', V.pinta(f, null).cuadros.find((c) => c.id === 'costo').detalle[1].filas.find((x) => x[3] === 'v.margen')[2]);
  assert.match(texto(margen), /En esta foto no hay cifra: la utilidad del motor es antes de la tierra que aporta el dueño\./);
  assert.match(texto(margen), /En el libro del PPP 2 se calcula así: ganancia real ÷ ventas/);
  // lo que sólo existe en el libro del PPP 2
  assert.match(texto(V.explicaHtml('estres', '', '')), /El PPP de siempre no tiene pruebas de estrés/);
  // un cociente del visor: lo saca el visor con cifras del motor
  const tv = texto(V.explicaHtml('visor.tierra_ventas', '', ''));
  assert.match(tv, /En esta foto, esas cifras las da el motor de su tablero/);
  assert.doesNotMatch(tv, /la dio el motor|cifras del libro/);
  // un renglón del flujo y el esquema llevan su marca
  assert.match(texto(V.explicaHtml('flujo.obra', '', '')), /Deducido: la obra directa del motor/);
  assert.match(texto(V.explicaHtml('reparto.esquema', '', '')), /Deducido: es el esquema que usa el motor de su tablero/);
  assert.match(h, /class="vz-vac">Sin dato: la utilidad del motor/);
});

test('De qué depende: a lo más tres bloques de segundo nivel a la vista y la leyenda sólo de los tipos que salen', () => {
  const d = copia(base());
  V.pinta(d, null);
  const largo = V.explicaHtml('v.costo_dinero', '', '');
  const bloques = largo.slice(0, largo.indexOf('<details') > 0 ? largo.indexOf('<details') : undefined).match(/ sale de<\/p>/g) || [];
  assert.ok(bloques.length <= 3, 'a la vista: ' + bloques.length);
  assert.match(largo, /<details class="vz-x-mas"><summary>Ver \d+ más<\/summary>/);
  const candados = V.explicaHtml('plan.candados_abiertos', '', '');
  assert.doesNotMatch(texto(candados), /Palanca:|Resultado:/, 'si sólo salen datos, la leyenda sólo dice qué es un dato');
});

test('Versiones de una foto: si su nombre trae su propio «V10», se rotula con ése y no se repite', () => {
  const f = foto(); f.version = 9; f.versiones = [{ n: 9, nombre: 'V10 · Tres edificios por etapas', estado: 'vigente' }]; f.v.estado = 'vigente';
  const html = V.pinta(f, null).html;
  assert.match(html, /<span class="vz-ver">V10 vigente/);
  assert.doesNotMatch(html, /<span class="vz-ver">V9/);
  assert.equal(V.etiquetaVersion(9, 'V10 · Tres edificios', true), 'V10');
  assert.equal(V.etiquetaVersion(2, 'V10 · algo', false), 'V2', 'en un libro, V1-V3 son las del libro');
  assert.equal(V.nombreSinEtiqueta('V10 · Tres edificios', true), 'Tres edificios');
});
