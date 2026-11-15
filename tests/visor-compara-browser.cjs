'use strict';
/* Recorrido real del DOM de visor-comparar.html con el servidor de PPP 2 corriendo en dobles
   (tests/ppp2-mundo.cjs) y planes INVENTADOS. No sale a la red: las fuentes se sustituyen por vacíos.
   Teléfono (430 px, como un iPhone Pro Max), escritorio, una sola opción, liga apagada, «Descargar PDF»
   (window.print y la hoja de impresión, con un PDF carta horizontal de verdad) y nada que no sea GET. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { mundo, PLAN } = require('./ppp2-mundo.cjs');

const RAIZ = path.join(__dirname, '..');
const FOTOS = process.env.PPP_SCREENSHOTS || '';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const ENDPOINT = 'https://script.google.com/macros/s/PRUEBA/exec';
const LIGA = 'liga0000000000000000000000000001';
const OTRO = 'p2otroplan01';
const renglon = (cambios) => Object.values(Object.assign({ liga: LIGA, plan_id: PLAN, para: 'Grupo de prueba', estado: 'activa', vence: '', versiones: '', etiquetas: '', creada: '2026-01-01', nota: '' }, cambios || {}));
function conLiga(cambios) {
  const w = mundo({ ligas: [renglon(cambios)], aperturas: true, config: [['visor_marcas', 'Marca Uno|Marca Dos|Marca Tres']] });
  w.vivero.getSheetByName('Planes').appendRow([OTRO, 'Otro Ejemplo', 'libro-plantilla', 'activo', '2026-01-15', 'Pruebas', '', 'ppp2-libro-v1', '']);
  w.cache.delete('planes');
  return w;
}

function servidor() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const archivo = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
      res.end(fs.readFileSync(archivo));
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

async function pagina(navegador, base, w, op) {
  op = op || {};
  const ctx = await navegador.newContext({ viewport: op.ancha ? { width: 1280, height: 900 } : { width: 430, height: 932 }, deviceScaleFactor: 1, hasTouch: !op.ancha, isMobile: !op.ancha });
  const pedidos = [], otros = [];
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(base)) return route.continue();
    if (url.startsWith(ENDPOINT)) {
      if (req.method() !== 'GET') { otros.push(req.method()); return route.abort(); }
      const p = Object.fromEntries(new URL(url).searchParams);
      pedidos.push(p);
      return route.fulfill({ status: 200, contentType: 'application/json', body: w.ctx.doGet({ parameter: p }).contenido });
    }
    if (req.method() !== 'GET') otros.push(req.method() + ' ' + url);
    return route.fulfill({ status: 200, contentType: /\.css(\?|$)|fonts\.googleapis/.test(url) ? 'text/css' : 'text/javascript', body: '' });
  });
  await ctx.addInitScript((ep) => { window.PPP2_ENDPOINT = ep; window.__impresiones = 0; window.print = () => { window.__impresiones++; }; }, ENDPOINT);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto(base + '/visor-comparar.html' + (op.direccion === undefined ? '#l=' + LIGA : op.direccion));
  return { ctx, page, pedidos, otros, errores };
}

(async () => {
  const s = await servidor(), base = 'http://127.0.0.1:' + s.address().port;
  const navegador = await chromium.launch();
  let n = 0;
  const caso = async (nombre, f) => { await f(); n++; console.log('ok · ' + nombre); };
  try {
    await caso('teléfono: todas las opciones lado a lado, la tabla se desliza de lado con los factores fijos, sólo GET y una apertura', async () => {
      const w = conLiga({ plan_id: PLAN + ',' + OTRO, etiquetas: 'Terreno grande|Terreno chico', versiones: 'todas' });
      const { ctx, page, pedidos, otros, errores } = await pagina(navegador, base, w);
      await page.locator('.vc-tabla').waitFor();
      assert.equal(await page.locator('th.vc-op').count(), 6, 'dos planes × tres versiones');
      assert.deepEqual(await page.locator('.vc-op-n').allInnerTexts(), ['Terreno grande · V1', 'Terreno grande · V2', 'Terreno grande · V3', 'Terreno chico · V1', 'Terreno chico · V2', 'Terreno chico · V3']);
      assert.equal(await page.locator('.vc-gt').count(), 7, 'los siete cuadros');
      assert.match(await page.locator('.vc-resumen').innerText(), /es la mejor en \d+ de \d+ factores comparables|Empatan/);
      assert.equal(pedidos.length, 6);
      assert.equal(pedidos.filter((p) => p.abre === '1').length, 1);
      assert.ok(pedidos.every((p) => p.recurso === 'ppp2-visor' && p.liga === LIGA && !p.k), 'por liga, sin sesión del Portero');
      assert.equal(w.vivero.getSheetByName('Aperturas').getLastRow(), 2);
      assert.ok(await page.locator('svg[aria-label="mejor"]').count() > 0);
      assert.deepEqual(await page.locator('.vc-marcas span').first().allInnerTexts(), ['Marca Uno']);
      /* la página no se desliza de lado; la tabla sí, dentro de su caja, y la columna de factores no se mueve */
      const medida = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vista: innerWidth }));
      assert.ok(medida.doc <= medida.vista, 'sin deslizamiento lateral de la página: ' + JSON.stringify(medida));
      const caja = page.locator('.vc-caja');
      assert.equal(await caja.evaluate((el) => el.classList.contains('vc-cabe')), false, 'en el teléfono no cabe: se desliza');
      const antes = await page.locator('tr[data-factor="ganancia"] th').boundingBox();
      const celdaAntes = await page.locator('tr[data-factor="ganancia"] td').nth(2).boundingBox();
      await caja.evaluate((el) => { el.scrollLeft = 300; });
      await page.waitForTimeout(50);
      const despues = await page.locator('tr[data-factor="ganancia"] th').boundingBox();
      const celdaDespues = await page.locator('tr[data-factor="ganancia"] td').nth(2).boundingBox();
      assert.ok(Math.abs(antes.x - despues.x) < 1, 'la columna de factores se queda fija');
      assert.ok(celdaAntes.x - celdaDespues.x > 250, 'las opciones sí se deslizan');
      const cabeza0 = await page.locator('th.vc-op').first().boundingBox();
      await caja.evaluate((el) => { el.scrollTop = 600; });
      await page.waitForTimeout(50);
      const cabeza1 = await page.locator('th.vc-op').first().boundingBox();
      assert.ok(Math.abs(cabeza0.y - cabeza1.y) < 1, 'la fila de opciones se queda arriba al bajar');
      await caja.evaluate((el) => { el.scrollLeft = 0; el.scrollTop = 0; });
      if (FOTOS) await page.screenshot({ path: path.join(FOTOS, 'visor-comparar-430.png'), fullPage: true });
      assert.equal(await page.evaluate(() => /NaN|undefined|Infinity/.test(document.getElementById('vc').innerHTML)), false);
      assert.deepEqual(otros, [], 'el comparativo nunca escribe');
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('escritorio: si la tabla cabe, se ve completa y la página baja entera', async () => {
      const w = conLiga({ versiones: 'todas' });
      const { ctx, page, otros, errores } = await pagina(navegador, base, w, { ancha: true });
      await page.locator('.vc-tabla').waitFor();
      await page.waitForFunction(() => document.querySelector('.vc-caja.vc-cabe'));
      assert.equal(await page.locator('th.vc-op').count(), 3);
      const todas = await page.evaluate(() => [...document.querySelectorAll('th.vc-op')].every((c) => { const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
      assert.ok(todas, 'todas las columnas a la vista');
      assert.deepEqual(await page.locator('.vc-op-n').allInnerTexts(), ['V1 · Base', 'V2 · Con banco', 'V3 · Temprana']);
      assert.match(await page.locator('tr[data-factor="rv_resultado"]').innerText(), /Pasa[\s\S]*No pasa/);
      if (FOTOS) await page.screenshot({ path: path.join(FOTOS, 'visor-comparar-1280.png'), fullPage: true });
      assert.deepEqual(otros, []);
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('«Descargar PDF» abre la impresión; la hoja de impresión sale limpia en carta horizontal', async () => {
      const w = conLiga({ plan_id: PLAN + ',' + OTRO, etiquetas: 'Terreno grande|Terreno chico', versiones: 'todas' });
      const { ctx, page, errores } = await pagina(navegador, base, w, { ancha: true });
      await page.locator('#vcPdf').click();
      assert.equal(await page.evaluate(() => window.__impresiones), 1, 'el botón llama a window.print()');
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.locator('.vc-acciones').isVisible(), false, 'los botones no se imprimen');
      assert.equal(await page.locator('.vc-pie').isVisible(), false);
      assert.equal(await page.locator('.vc-impreso').isVisible(), true, 'marcas y aviso arriba');
      assert.match(await page.locator('.vc-impreso').innerText(), /Confidencial/);
      assert.match(await page.locator('.vc-datos').innerText(), /Datos leídos del libro el \d+-[a-z]{3}-\d{4} \d{2}:\d{2}/);
      const cabe = await page.evaluate(() => { const t = document.querySelector('.vc-tabla').getBoundingClientRect(); return t.width <= document.documentElement.clientWidth + 1; });
      assert.ok(cabe, 'impresa, la tabla cabe a lo ancho');
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      const t = pdf.toString('latin1');
      assert.equal(t.slice(0, 5), '%PDF-');
      assert.match(t, /\/MediaBox \[0 0 792 612\]/, 'carta horizontal: 11 × 8.5 pulgadas');
      const hojas = (t.match(/\/Type \/Page\b/g) || []).length;
      assert.ok(hojas >= 1 && hojas <= 3, 'hojas: ' + hojas);
      if (FOTOS) fs.writeFileSync(path.join(FOTOS, 'visor-comparar.pdf'), pdf);
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('una liga con una sola opción lo dice y no compara', async () => {
      const w = conLiga();
      const { ctx, page, pedidos, errores } = await pagina(navegador, base, w);
      await page.locator('.vc-una').waitFor();
      assert.match(await page.locator('.vc-una').innerText(), /una sola opción/);
      assert.equal(await page.locator('.vc-tabla').count(), 0);
      assert.equal(await page.locator('.vc-una a').getAttribute('href'), 'visor.html#l=' + LIGA);
      assert.equal(pedidos.length, 1);
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('sin liga, o con la liga apagada, no enseña nada del plan', async () => {
      const w = conLiga({ estado: 'apagada' });
      const a = await pagina(navegador, base, w);
      await a.page.locator('.vc-msg h1', { hasText: 'Esta liga ya no está activa' }).waitFor();
      assert.equal(await a.page.locator('.vc-tabla').count(), 0);
      await a.ctx.close();
      const b = await pagina(navegador, base, conLiga(), { direccion: '' });
      await b.page.locator('.vc-msg h1', { hasText: 'Falta la liga' }).waitFor();
      assert.equal(b.pedidos.length, 0);
      await b.ctx.close();
    });

    console.log('comparativo: ' + n + ' recorridos PASS');
  } finally {
    await navegador.close();
    s.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
