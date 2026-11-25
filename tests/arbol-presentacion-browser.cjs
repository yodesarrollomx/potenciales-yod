'use strict';
/* Recorrido real del DOM de arbol-ppp/presentacion-prueba.html (datos de presentación y estrellas del Árbol PPP, copia de prueba).
   Sirve los archivos de esta copia en localhost (la página sólo monta en local) y comprueba, a 320, 430 y 1280 px:
   que no pide nada fuera, que las estrellas y el botón «Presentación» se pintan y cambian con el plan, que «Llenar con el supuesto
   estándar» completa la presentación, que la vista por láminas lleva a cada dato, y que una definición SIN el mapa (la página del
   reparto) no pinta ni una estrella. Datos inventados; no sale a la red.
   Uso: node tests/arbol-presentacion-browser.cjs   (BROWSER_EXECUTABLE=/ruta/al/chrome si playwright no trae navegador; PPP_SCREENSHOTS=carpeta para fotos) */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const RAIZ = path.join(__dirname, '..');
const FOTOS = process.env.PPP_SCREENSHOTS || '';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function servidor() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const archivo = path.join(RAIZ, ruta);
      if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
      res.end(fs.readFileSync(archivo));
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

const TAMANOS = [{ w: 430, h: 932, tel: true }, { w: 320, h: 640, tel: true }, { w: 1280, h: 800, tel: false }];
let hechas = 0;
const paso = (t) => { hechas++; console.log('  ok   ' + t); };

async function abre(navegador, base, pagina, t) {
  const ctx = await navegador.newContext({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 1, hasTouch: t.tel, isMobile: t.tel });
  const pg = await ctx.newPage(), errores = [], fuera = [];
  pg.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
  pg.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) fuera.push(r.url()); });
  await pg.goto(base + '/arbol-ppp/' + pagina);
  await pg.waitForSelector('.ppp [data-cards] .tarj');
  await pg.waitForTimeout(400);
  return { ctx, pg, errores, fuera };
}
const foto = async (pg, nombre) => { if (FOTOS) { fs.mkdirSync(FOTOS, { recursive: true }); await pg.screenshot({ path: path.join(FOTOS, 'arbol-presentacion-' + nombre + '.png') }); } };
const estado = (pg) => pg.evaluate(() => {
  const a = document.getElementById('arbol-ppp').__ppp, P = a.presentacion(), b = document.querySelector('[data-act="presentacion"]'), herr = [...document.querySelectorAll('[data-herr] .ppp-btn')].filter((x) => !x.hidden);
  const clases = {}; document.querySelectorAll('.nodo .estr').forEach((e) => { const c = e.getAttribute('class'); clases[c] = (clases[c] || 0) + 1; });
  return {
    P: P && { total: P.total, completos: P.completos, completa: P.completa, estrellas: P.estrellas, faltan: P.faltan.length },
    boton: b && { oculto: b.hidden, texto: b.textContent.trim(), voz: b.getAttribute('aria-label'), pulsado: b.getAttribute('aria-pressed') },
    filasHerr: new Set(herr.map((x) => x.offsetTop)).size, nHerr: herr.length, clases,
    desborda: document.documentElement.scrollWidth > window.innerWidth + 1, vista: a.estado().vista, sel: a.estado().sel
  };
});

(async () => {
  const s = await servidor(), base = 'http://127.0.0.1:' + s.address().port;
  const navegador = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE, args: ['--no-sandbox'] } : {}) });
  try {
    for (const t of TAMANOS) {
      console.log('\npresentacion-prueba.html a ' + t.w + ' px');
      const { ctx, pg, errores, fuera } = await abre(navegador, base, 'presentacion-prueba.html', t);

      /* 1 · al abrir: plan con solo el predio; la presentación está incompleta y el botón lo dice */
      let e = await estado(pg);
      assert.ok(e.P && e.P.total === 17 && !e.P.completa && e.P.completos < 5 && e.P.faltan > 20, 'al abrir la presentación está incompleta: ' + JSON.stringify(e.P));
      assert.ok(e.boton && !e.boton.oculto && /^☆ \d+\/17$/.test(e.boton.texto), 'el botón dice cuántos datos están completos: ' + JSON.stringify(e.boton));
      assert.match(e.boton.voz, /^Presentación: \d+ de 17 datos completos; faltan \d+ datos clave$/);
      assert.equal(e.clases['estr llena'], 1, 'el predio confirmado lleva estrella llena');
      assert.ok(e.clases['estr supuesto'] >= 1, 'hay datos con supuesto por confirmar a la vista');
      assert.equal(e.nHerr, 5); assert.equal(e.filasHerr, 1, 'las cinco herramientas caben en una fila a ' + t.w + ' px');
      assert.equal(e.desborda, false, 'sin desbordamiento horizontal');
      assert.match(await pg.locator('[data-pp-res]').textContent(), /^Presentación: \d+ de 17 datos completos · 1 firme, \d+ con supuesto y \d+ sin dato · faltan \d+ datos clave\.$/);
      await foto(pg, t.w + '-1-inicio');
      paso('al abrir: incompleta, botón «' + e.boton.texto + '», estrellas en el árbol y herramientas en una fila');

      /* 2 · el supuesto estándar llena el plan: 17 de 17, ninguna estrella vacía */
      await pg.click('[data-pp="estandar"]');
      await pg.waitForFunction(() => { const P = document.getElementById('arbol-ppp').__ppp.presentacion(); return P && P.completa; }, null, { timeout: 15000 });
      await pg.waitForTimeout(700);
      e = await estado(pg);
      assert.deepEqual(e.P, { total: 17, completos: 17, completa: true, estrellas: { total: 90, llenas: 1, supuestos: 89, vacias: 0 }, faltan: 0 });
      assert.equal(e.boton.texto, '★ 17/17'); assert.equal(e.boton.voz, 'Presentación: 17 de 17 datos completos');
      assert.ok(!e.clases['estr vacia'], 'ya no queda ninguna estrella vacía a la vista');
      assert.ok(e.clases['estr supuesto'] >= 15, 'las estrellas con supuesto se ven en el árbol: ' + JSON.stringify(e.clases));
      assert.equal(e.filasHerr, 1); assert.equal(e.desborda, false);
      assert.match(await pg.locator('[data-pp-res]').textContent(), /^Puse el supuesto estándar en 6 decisiones; cada una se cambia en el árbol\. Presentación: 17 de 17 datos completos · 1 firme, 89 con supuesto y 0 sin dato\.$/);
      assert.equal(await pg.locator('.ppp-rotulo').textContent(), 'Estimado · no sincronizado', 'todo sigue rotulado como estimado');
      await foto(pg, t.w + '-2-estandar');
      paso('«Llenar con el supuesto estándar»: 6 decisiones en su referencia, 17 de 17 completos, 90 estrellas (1 firme, 89 con supuesto)');

      /* 3 · la vista «Presentación»: once láminas, filtro por ficha, y cada dato lleva a su bolita */
      await pg.click('[data-act="presentacion"]'); await pg.waitForSelector('[data-panel] h3.pres-l');
      let v = await pg.evaluate(() => { const p = document.querySelector('[data-panel]'); return { h2: p.querySelector('h2').textContent.trim(), laminas: [...p.querySelectorAll('h3.pres-l')].map((h) => h.textContent.trim()), filas: p.querySelectorAll('.pres-n').length, botones: p.querySelectorAll('button.pres-n').length, fijos: p.querySelectorAll('div.pres-n.fijo').length, claves: p.querySelectorAll('.pres-c').length, ley: p.querySelector('.pres-ley').textContent.trim(), ancho: p.scrollWidth <= p.clientWidth + 1, pulsado: document.querySelector('[data-act="presentacion"]').getAttribute('aria-pressed'), falta: !!p.querySelector('.pres-falta') }; });
      assert.equal(v.h2, 'Presentación 17 de 17 completos'); assert.equal(v.pulsado, 'true'); assert.equal(v.falta, false);
      assert.deepEqual(v.laminas, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => 'Lámina ' + n + ' completa'));
      assert.equal(v.filas, 100); assert.equal(v.botones + v.fijos, 100); assert.ok(v.fijos >= 8 && v.fijos <= 14, 'los datos internos (sin bolita) se listan sin botón: ' + v.fijos); assert.equal(v.claves, 39, "39 datos clave en el mapa");
      assert.equal(v.ley, '★ 1 firme · ★ 89 con supuesto por confirmar · ☆ 0 sin dato'); assert.ok(v.ancho, 'la lista no se sale del panel');
      {   // la lista de láminas es larga: su panel es más alto que el de un dato y queda a la vista sin mover la página
        const m = await pg.evaluate(() => { const p = document.querySelector('[data-panel]'), r = p.getBoundingClientRect(); return { amplio: p.hasAttribute('data-amplio'), alto: r.height, arriba: r.top, vh: innerHeight, pagina: scrollY, ancho: document.documentElement.scrollWidth <= innerWidth + 1 }; });
        assert.equal(m.amplio, true); assert.equal(m.pagina, 0, 'la página no se mueve: sólo la pantalla del Árbol'); assert.ok(m.ancho, 'nada se sale a lo ancho');
        assert.ok(m.alto >= (t.w < 760 ? 0.55 : 0.38) * m.vh, 'el panel de la presentación ocupa buena parte de la pantalla: ' + JSON.stringify(m));
        assert.ok(m.arriba >= 0 && m.arriba < (t.w < 760 ? 0.5 : 0.65) * m.vh, 'el panel queda a la vista (en teléfono, de la mitad de la pantalla hacia arriba): ' + JSON.stringify(m));
      }
      await foto(pg, t.w + '-3-presentacion');
      await pg.click('[data-a="pficha:dueno"]'); await pg.waitForTimeout(200);
      v = await pg.evaluate(() => { const p = document.querySelector('[data-panel]'); return { h2: p.querySelector('h2').textContent.trim(), laminas: [...p.querySelectorAll('h3.pres-l')].map((h) => h.textContent.trim()), temas: [...p.querySelectorAll('h4.pres-d')].map((h) => h.textContent.trim()) }; });
      assert.equal(v.h2, 'Presentación 8 de 8 completos'); assert.deepEqual(v.laminas, [2, 7, 9, 10, 11, 12].map((n) => 'Lámina ' + n + ' completa'));
      assert.ok(v.temas.every((x) => / Dueño del terreno$/.test(x)) && v.temas.length === 8, JSON.stringify(v.temas));
      await pg.click('[data-a="pir:VD-08"]'); await pg.waitForTimeout(700);
      e = await estado(pg);
      assert.equal(e.vista, 'nodo'); assert.equal(e.sel, 'VD-08'); assert.equal(e.boton.pulsado, 'false');
      assert.equal(await pg.evaluate(() => document.querySelector('[data-panel]').hasAttribute('data-amplio')), false, 'al ir a un dato el panel vuelve a su alto de siempre');
      const nota = await pg.locator('[data-panel] .estr-nota').textContent();
      assert.equal(nota.replace(/\s+/g, ' ').trim(), '★ Alimenta la presentación · con supuesto por confirmar. Va en lámina 10, «Aportar o vender» (dato clave).');
      assert.match(await pg.locator('.nodo[data-id="VD-08"]').getAttribute('aria-label'), /Alimenta la presentación: con supuesto por confirmar\.$/);
      assert.equal(await pg.locator('.nodo[data-id="VD-08"] .estr').getAttribute('class'), 'estr supuesto');
      await foto(pg, t.w + '-4-dato');
      paso('vista «Presentación»: 11 láminas y 100 renglones; ficha del dueño (8 datos); un dato lleva a su bolita con su nota de estrella');

      /* 4 · quitar un dato clave vuelve incompleta la lámina y el botón lo dice; confirmar un dato lo vuelve firme */
      await pg.evaluate(() => document.getElementById('arbol-ppp').__ppp.decide('S-02', { 'S-02': { valor: 'no', estado: 'decidido' } }, {}));
      await pg.waitForTimeout(500);
      e = await estado(pg);
      assert.equal(e.P.completos, 16); assert.equal(e.P.completa, false); assert.equal(e.boton.texto, '☆ 16/17'); assert.match(e.boton.voz, /faltan 2 datos clave$/);
      await pg.click('[data-act="presentacion"]'); await pg.waitForSelector('[data-panel] .pres-falta');
      v = await pg.evaluate(() => { const p = document.querySelector('[data-panel]'); return { falta: p.querySelector('.pres-falta').textContent.replace(/\s+/g, ' ').trim(), mal: [...p.querySelectorAll('h3.pres-l.falta')].map((h) => h.textContent.trim()), chip: p.querySelector('h2 .chip').className }; });
      assert.equal(v.falta, 'Faltan 2 datos clave: «Aportar / vender», «Aportar vale hoy». Sin ellos la presentación queda incompleta.'); assert.deepEqual(v.mal, ['Lámina 10 incompleta']); assert.match(v.chip, /alerta/);
      await foto(pg, t.w + '-5-incompleta');
      await pg.evaluate(() => { const a = document.getElementById('arbol-ppp').__ppp; a.decide('S-02', { 'S-02': { estado: 'referencia' } }, {}); a.decide('T-04', { 'T-04': { valor: 14, estado: 'confirmado', fuente: 'escritura de prueba' } }, {}); });
      await pg.waitForTimeout(500);
      e = await estado(pg);
      assert.equal(e.P.completa, true); assert.ok(e.P.estrellas.llenas >= 3, 'con la tierra confirmada, ella y lo que sale sólo de ella quedan firmes: ' + JSON.stringify(e.P.estrellas));
      assert.equal(await pg.locator('.nodo[data-id="T-04"] .estr').getAttribute('class'), 'estr llena');
      paso('sin la regla de pago de la tierra la lámina 10 queda incompleta y se dice qué falta; al confirmar un dato su estrella se llena');

      /* 5 · la leyenda explica las tres estrellas, y nada salió de esta copia */
      await pg.click('[data-act="ley"]'); await pg.waitForTimeout(200);
      const ley = await pg.locator('[data-leyenda]').textContent();
      ['Presentación: dato firme', 'Presentación: con supuesto por confirmar', 'Presentación: todavía sin dato'].forEach((x) => assert.ok(ley.includes(x), 'la leyenda dice «' + x + '»'));
      await foto(pg, t.w + '-6-leyenda');
      assert.deepEqual(errores, [], 'sin errores en la página'); assert.deepEqual(fuera, [], 'ninguna petición fuera de esta copia');
      paso('leyenda con las tres estrellas; 0 errores y 0 peticiones fuera');
      await ctx.close();
    }

    /* 6 · una definición sin ARBOL_PRESENTACION (la página del reparto) no pinta ni una estrella ni el botón */
    console.log('\nreparto-prueba.html (sin el mapa de la presentación) a 430 px');
    const sin = await abre(navegador, base, 'reparto-prueba.html', TAMANOS[0]);
    const r = await estado(sin.pg);
    assert.equal(r.P, null); assert.equal(r.boton.oculto, true); assert.equal(r.nHerr, 4);
    assert.deepEqual(Object.keys(r.clases), ['estr'], 'las estrellas existen en el marcado pero sin estado: no se dibujan');
    assert.equal(await sin.pg.evaluate(() => [...document.querySelectorAll('.nodo .estr')].every((x) => getComputedStyle(x).display === 'none')), true);
    assert.equal(await sin.pg.evaluate(() => getComputedStyle(document.querySelector('[data-act="presentacion"]')).display), 'none');
    assert.equal(await sin.pg.evaluate(() => document.querySelector('[data-herr]').classList.contains('con-pres')), false);
    assert.equal(await sin.pg.evaluate(() => document.querySelector('[data-leyenda]').textContent.includes('Presentación')), false);
    assert.deepEqual(sin.errores.filter((x) => !/favicon|404/.test(x)), []);
    await foto(sin.pg, '430-7-sin-mapa');
    paso('sin el mapa: ni botón, ni estrellas, ni leyenda nueva (el Árbol de siempre se ve igual)');
    await sin.ctx.close();
  } finally { await navegador.close(); s.close(); }
  console.log('\narbol-presentacion-browser: ' + hechas + ' recorridos · TODO BIEN');
})().catch((e) => { console.error(e); process.exit(1); });
