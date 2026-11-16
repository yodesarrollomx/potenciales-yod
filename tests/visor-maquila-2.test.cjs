'use strict';
/* La maquila del visor, segunda vuelta (15-nov-2026): lo que encontraron las pasadas por palanca del libro (T3), las de
   residencial y casa (T5) y las del vertical (T6). Cada prueba falla con el visor de antes. Datos INVENTADOS
   (tests/ppp2-mundo.cjs); nada sale a la red.
   Corre con: node --test tests/visor-maquila-2.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../visor.js');
require('../visor-explica.js');
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
/* el ancho que el visor estima para un texto (la regla de ancho() de visor.js) y la caja de cada <text> */
const ancho = (s, size, negrita) => String(s).length * size * (negrita ? 0.57 : 0.52);
const textos = (svg) => [...String(svg).matchAll(/<text([^>]*)>([\s\S]*?)<\/text>/g)].map((m) => {
  const a = (k) => { const r = new RegExp('\\s' + k + '="([^"]*)"').exec(m[1]); return r ? r[1] : null; };
  return { x: Number(a('x')), y: Number(a('y')), size: Number(a('font-size')), bold: a('font-weight') === '700', fin: a('text-anchor') === 'end', medio: a('text-anchor') === 'middle', t: texto(m[2]) };
});
const caja = (t) => { const w = ancho(t.t, t.size, t.bold), a = t.fin ? t.x - w : (t.medio ? t.x - w / 2 : t.x); return { a, b: a + w, arriba: t.y - t.size * 0.8, abajo: t.y + t.size * 0.2 }; };
const tocan = (p, q) => Math.min(p.b, q.b) - Math.max(p.a, q.a) > 0.5 && Math.min(p.abajo, q.abajo) - Math.max(p.arriba, q.arriba) > 0.5;

test('«Falta calcular»: los anillos no pintan «sobran» con cifras a medias, el reparto no enseña ceros y no hay margen sobre costo', () => {
  const d = copia(base());
  Object.assign(d.v, { rv_resultado: 'Falta calcular', rv_aportacion: 1.645, rv_margen: 8.141, rv_linea_ventas: 0, rv_linea_costo: 0, ganancia: null, margen: null, dueno_recibe: 0, alianza_recibe: 0 });
  const r = cuadro(d, 'riesgo'), t = texto(r.svg + r.svgG);
  assert.doesNotMatch(t, /sobran/, 'ningún anillo dice «sobran»');
  assert.doesNotMatch(t, /164\.5|814\.1/, 'no enseña las cifras a medias');
  for (const f of r.detalle[0].filas) {
    assert.match(f[1], /^(—|sin dato)$/, f[0] + ': ' + f[1]);
    assert.match(f[4], /sin dato · falta calcular esta versión/, f[0] + ': «Hoy» dice por qué');
  }
  const rep = cuadro(d, 'reparto');
  assert.match(texto(rep.svg), /Falta calcular el reparto/);
  assert.doesNotMatch(texto(rep.svg + rep.svgG), /recibe \$0\.0/, 'el reparto sin calcular no se pinta con ceros');
  assert.match(rep.detalle[0].filas[0][0], /Falta calcular/);
  const co = texto(cuadro(d, 'costo').svg);
  assert.match(co, /Falta calcular: sin ganancia ni margen/);
  assert.doesNotMatch(co, /sobre costo/);
  /* control: la misma versión ya calculada sí pinta sus anillos */
  const ok = copia(base());
  assert.match(texto(cuadro(ok, 'riesgo').svg), /sobran|faltan/);
});

test('Dinero: «a repartir» y lo más hondo no se enciman (último mes, cerca del final o lejos con cifras parecidas)', () => {
  const caso = (serie) => { const d = copia(base()); d.flujo.meses = serie.length; d.flujo.filas.flujo_acum = serie; d.v.resultado_repartir = serie[serie.length - 1]; return d; };
  const N = 60, curva = (f) => Array.from({ length: N }, (_, i) => Math.round(f(i + 1) * 1000) / 1000);
  const casos = {
    /* lo más hondo es el último mes (H-T3-2: saldos que nunca se cobran) */
    ultimo: curva((m) => -4 * m),
    /* lo más hondo dos meses antes del final, casi la misma cifra (H-T5-7) */
    cerca: curva((m) => (m <= 58 ? -4 * m : -232 + (m - 58) * 0.4)),
    /* lo más hondo en el mes 37 y el final parecido, con una cima antes que aprieta la escala (H-T6-1: «a repartir
       −$1,764.3» sobre «−$2,126.8 · mes 37») */
    lejos: curva((m) => (m <= 10 ? 600 * m : (m <= 37 ? 6000 - 8126.8 * (m - 10) / 27 : -2126.8 + (m - 37) * (362.5 / 23))))
  };
  for (const [nombre, serie] of Object.entries(casos)) {
    const c = cuadro(caso(serie), 'dinero');
    for (const svg of [c.svg, c.svgG]) {
      const ts = textos(svg), rep = ts.find((t) => /^a repartir/.test(t.t)), hondo = ts.find((t) => /· mes \d+$/.test(t.t) && t.t !== rep.t);
      assert.ok(rep, nombre + ': falta «a repartir»');
      if (nombre === 'ultimo') {
        assert.ok(!hondo, 'el último mes es lo más hondo: un solo rótulo (no dos con la misma cifra encimados)');
        assert.ok(leyendas(svg).some((l) => l.t === 'Resultado a repartir' && l.f.some((f) => f[0] === 'Es también lo más hondo')), 'la leyenda lo dice');
      } else {
        assert.ok(hondo, nombre + ': falta el rótulo de lo más hondo');
        assert.ok(!tocan(caja(rep), caja(hondo)), nombre + ': «' + rep.t + '» toca «' + hondo.t + '»');
      }
    }
  }
});

test('Reparto y Tiempo con pérdida: sin «×−6.36» y sin «mes 61» en un plan que calcula 60', () => {
  const d = copia(base());
  d.flujo.meses = 60;
  Object.assign(d.v, { dueno_aporta: 30, dueno_recibe: -190.9, dueno_veces: -6.363, mes_reparto: 61, dueno_meses: 61, capital_mes: 61 });
  const r = cuadro(d, 'reparto'), tr = texto(r.svg + r.svgG);
  assert.doesNotMatch(tr, /×\s*[−-]\s*6/, 'no hay «veces» negativas');
  assert.match(tr, /pierde más de lo que puso/);
  assert.match(r.svg, /fill="#7f2f26">pierde más de lo que puso</, 'en rojo, como la pérdida');
  assert.equal(fila(r, 'Dueño · veces su tierra')[1], 'no aplica: pierde más que el valor de su tierra');
  assert.match(tr, /el dueño cobra después del mes 60/i);
  assert.doesNotMatch(tr, /mes 61/);
  const t = cuadro(d, 'tiempo'), tt = texto(t.svg + t.svgG);
  assert.doesNotMatch(tt, /mes 61/, 'el eje acaba en el mes 60: el reparto no se rotula «mes 61»');
  assert.match(tt, /después del mes 60/);
  assert.match(tt, /60\+ meses de plazo/);
  assert.equal(fila(t, 'Reparto')[1], 'después del mes 60');
  assert.equal(fila(t, 'Capital liquidado')[1], 'después del mes 60');
});

test('Terreno: lo vendible que pasa de lo construido se marca y se dice; Tiempo: el banco que nunca tuvo saldo no es «—»', () => {
  const d = copia(base());
  d.datos['lamina.m2_construidos'] = { valor: 370, estado: 'derivado' };
  d.datos['lamina.m2_vendibles'] = { valor: 808, estado: 'derivado' };
  const c = cuadro(d, 'terreno');
  assert.match(c.svg, /fill="#7f2f26">218\.4%</, 'el 218 % va marcado');
  assert.match(fila(c, 'Vendible entre construcción')[2], /lo vendible pasa de lo construido: revisa los datos/);
  assert.ok(leyendas(c.svg).some((l) => l.t === 'Área vendible' && l.f.some((f) => f[0] === 'Lo vendible pasa de lo construido')));
  const sinBanco = copia(base());
  sinBanco.v.banco_mes = 0; sinBanco.flujo.total.disposicion = 0; sinBanco.flujo.filas.disposicion = sinBanco.flujo.filas.disposicion.map(() => 0);
  assert.equal(fila(cuadro(sinBanco, 'tiempo'), 'Banco liquidado')[1], 'no aplica');
});
