'use strict';
/* Recorrido real del DOM de visor.html con el servidor de PPP 2 corriendo en dobles (tests/ppp2-mundo.cjs)
   y un plan INVENTADO. No sale a la red: las fuentes se sustituyen por vacíos. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { mundo, PLAN, filaDe } = require('./ppp2-mundo.cjs');

const RAIZ = path.join(__dirname, '..');
const FOTOS = process.env.PPP_SCREENSHOTS || '';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const ENDPOINT = 'https://script.google.com/macros/s/PRUEBA/exec';
const LIGA = 'liga0000000000000000000000000001';
const renglon = (cambios) => Object.values(Object.assign({ liga: LIGA, plan_id: PLAN, para: 'Grupo de prueba', estado: 'activa', vence: '', versiones: '', etiquetas: '', creada: '2026-01-01', nota: '' }, cambios || {}));
const conLiga = (cambios) => mundo({ ligas: [renglon(cambios)], aperturas: true, config: [['visor_marcas', 'Marca Uno|Marca Dos|Marca Tres']] });

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

async function pagina(navegador, base, w, opciones) {
  const op = opciones || {};
  const ctx = await navegador.newContext({ viewport: op.ancha ? { width: 1280, height: 900 } : { width: 440, height: 880 }, deviceScaleFactor: 1, hasTouch: !op.ancha });
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
    return route.fulfill({ status: 200, contentType: /\.css(\?|$)|fonts\.googleapis/.test(url) ? 'text/css' : 'text/javascript', body: '' });
  });
  await ctx.addInitScript(([ep]) => { window.PPP2_ENDPOINT = ep; window.PPP2_VISOR_MS = 250; }, [ENDPOINT]);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto(base + '/visor.html' + (op.direccion === undefined ? '#l=' + LIGA : op.direccion));
  return { ctx, page, pedidos, otros, errores };
}

(async () => {
  const s = await servidor(), base = 'http://127.0.0.1:' + s.address().port;
  const navegador = await chromium.launch();
  let n = 0;
  const caso = async (nombre, f) => { await f(); n++; console.log('ok · ' + nombre); };
  try {
    await caso('abre con la liga: ocho espacios, las cifras del libro, sólo lecturas y una apertura anotada', async () => {
      const w = conLiga(), { ctx, page, pedidos, otros, errores } = await pagina(navegador, base, w);
      await page.locator('.vz-card').first().waitFor();
      assert.equal(await page.locator('.vz-card').count(), 7);
      assert.equal(await page.locator('.vz-card.vz-doble').count(), 1);
      assert.equal(await page.locator('.vz-l2 h1').innerText(), 'Proyecto Ejemplo');
      assert.match(await page.locator('#vz').innerText(), /\$500\.0/);
      assert.equal(await page.locator('.vz-chip').count(), 0, 'sin versiones ni terrenos que escoger no hay selectores');
      assert.deepEqual(await page.locator('.vz-marcas span').allInnerTexts(), ['Marca Uno', 'Marca Dos', 'Marca Tres']);
      assert.match(await page.locator('.vz-pie').innerText(), /Confidencial/);
      assert.equal(pedidos[0].recurso, 'ppp2-visor');
      assert.equal(pedidos[0].abre, '1');
      assert.equal(pedidos[0].k, undefined, 'la liga no manda sesión del Portero');
      assert.equal(w.vivero.getSheetByName('Aperturas').getLastRow(), 2);
      const cabe = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: innerWidth, tarjetas: [...document.querySelectorAll('.vz-card')].every((c) => { const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5; }) }));
      assert.ok(cabe.ancho <= cabe.vista && cabe.tarjetas, 'cabe a lo ancho del teléfono');
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('.vz-card svg')].some((g) => /NaN|undefined/.test(g.innerHTML))), false);
      if (FOTOS) await page.screenshot({ path: path.join(FOTOS, 'ppp2-visor-440.png'), fullPage: true });
      await page.waitForFunction(() => true, null, { timeout: 1000 });
      await page.waitForTimeout(700);
      assert.ok(pedidos.length >= 3 && pedidos.slice(1).every((p) => p.si && !p.abre), 'después sólo pregunta si cambió');
      assert.equal(w.vivero.getSheetByName('Aperturas').getLastRow(), 2, 'preguntar si cambió no anota aperturas');
      assert.deepEqual(otros, [], 'el visor nunca escribe');
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('tocar un cuadro lo abre en la misma página; la leyenda dice de dónde sale; atrás, la × y tocar fuera lo cierran', async () => {
      const w = conLiga(), { ctx, page, errores } = await pagina(navegador, base, w);
      await page.locator('.vz-card').first().waitFor();
      const direccion = page.url();
      for (const id of ['reparto', 'terreno', 'producto', 'tiempo', 'costo', 'dinero', 'riesgo']) {
        await page.locator('[data-card="' + id + '"]').click();
        await page.locator('#vzModal').waitFor({ state: 'visible' });
        assert.ok(await page.locator('#vzModal dl > div').count() >= 3, id + ': trae su desglose');
        assert.match(await page.locator('#vzModal').innerText(), /Libro · /, id);
        assert.equal(page.url(), direccion, id + ': no cambia de página');
        await page.keyboard.press('Escape');
        await page.locator('#vzModal').waitFor({ state: 'hidden' });
      }
      await page.locator('[data-card="costo"]').click();
      await page.locator('#vzModal .vz-m-fig .vz-t').first().click();
      const tip = page.locator('#vzTip');
      await tip.waitFor({ state: 'visible' });
      assert.match(await tip.innerText(), /Ingresos por ventas[\s\S]*Producto A[\s\S]*Producto B[\s\S]*Producto C[\s\S]*Libro · Productos/, 'las ventas, desglosadas por producto');
      await page.locator('#vzModal .vz-m-head').click();
      await tip.waitFor({ state: 'hidden' });
      await page.goBack();                                   // el botón «atrás» del teléfono
      await page.locator('#vzModal').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.vz-card').count(), 7, 'sigue en la misma pantalla');
      await page.locator('[data-card="dinero"]').click();
      await page.locator('#vzModal').click({ position: { x: 8, y: 8 } });   // fuera del cuadro
      await page.locator('#vzModal').waitFor({ state: 'hidden' });
      await page.locator('[data-card="riesgo"]').click();
      await page.locator('#vzModal .vz-x').click();
      await page.locator('#vzModal').waitFor({ state: 'hidden' });
      if (FOTOS) { await page.locator('[data-card="dinero"]').click(); await page.screenshot({ path: path.join(FOTOS, 'ppp2-visor-detalle.png') }); }
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('si el libro cambia, la página lo pinta sola y marca el cuadro que cambió, también con el detalle abierto', async () => {
      const w = conLiga(), { ctx, page, errores } = await pagina(navegador, base, w);
      await page.locator('.vz-card').first().waitFor();
      await page.locator('[data-card="terreno"]').click();
      const res = w.libro.getSheetByName('Resumen');
      res.v[filaDe(res, 'v2.tierra') - 1][1] = 41.5;         // alguien cambió el libro
      w.cache.delete('vk_' + PLAN);
      await page.locator('#vzModal').getByText('$41.5').first().waitFor({ timeout: 5000 });
      assert.match(await page.locator('#vzVivo').innerText(), /Actualizado/);
      assert.equal(await page.locator('#vzModal').isVisible(), true, 'el detalle abierto se queda abierto');
      assert.ok(await page.locator('[data-card="terreno"].vz-cambio').count() === 1, 'el cuadro que cambió se marca');
      assert.equal(await page.locator('[data-card="tiempo"].vz-cambio').count(), 0, 'el que no cambió, no');
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('con varias versiones en la liga se puede escoger; la que se abre primero es la que el libro muestra', async () => {
      const w = conLiga({ versiones: 'todas' }), { ctx, page, pedidos, errores } = await pagina(navegador, base, w);
      await page.locator('.vz-chip').first().waitFor();
      assert.ok(await page.locator('.vz-chip').count() >= 2);
      assert.match(await page.locator('.vz-chip.vz-on').innerText(), /^V2/);
      await page.locator('.vz-chip[data-v="1"]').click();
      await page.locator('.vz-ver', { hasText: 'V1' }).waitFor();
      assert.match(await page.locator('.vz-chip.vz-on').innerText(), /^V1/);
      assert.ok(pedidos.some((p) => p.v === '1'));
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('sin liga, con una liga que no existe o apagada a media sesión no se ve nada del plan', async () => {
      const w = conLiga();
      const sin = await pagina(navegador, base, w, { direccion: '' });
      await sin.page.getByText('Falta la liga').waitFor();
      assert.equal(sin.pedidos.length, 0, 'sin liga no se llama al servidor');
      await sin.ctx.close();
      const mala = await pagina(navegador, base, w, { direccion: '#l=liga0000000000000000000000000002' });
      await mala.page.getByText('Esta liga ya no está activa').waitFor();
      assert.equal(await mala.page.locator('.vz-card').count(), 0);
      await mala.ctx.close();
      const viva = await pagina(navegador, base, w);
      await viva.page.locator('.vz-card').first().waitFor();
      await viva.page.locator('[data-card="reparto"]').click();
      const h = w.vivero.getSheetByName('Ligas');
      h.v[1][3] = 'apagada';
      w.cache.delete('ligas');
      await viva.page.getByText('Esta liga ya no está activa').waitFor({ timeout: 5000 });
      assert.equal(await viva.page.locator('.vz-card').count(), 0);
      assert.equal(await viva.page.locator('#vzModal').isVisible(), false);
      assert.doesNotMatch(await viva.page.locator('body').innerText(), /Proyecto Ejemplo|\$500/);
      assert.deepEqual(viva.errores, []);
      await viva.ctx.close();
    });

    await caso('en pantalla grande cabe completo y la leyenda sale al pasar el cursor', async () => {
      const w = conLiga(), { ctx, page, errores } = await pagina(navegador, base, w, { ancha: true });
      await page.locator('.vz-card').first().waitFor();
      const m = await page.evaluate(() => { const r = document.querySelector('.vz-marco').getBoundingClientRect(); return { abajo: r.bottom, alto: innerHeight, izq: r.left, der: innerWidth - r.right }; });
      assert.ok(m.abajo <= m.alto + 1, 'cabe a lo alto sin deslizar');
      assert.ok(Math.abs(m.izq - m.der) < 2, 'queda centrado');
      await page.locator('[data-card="producto"] .vz-t').first().hover();
      await page.locator('#vzTip').waitFor({ state: 'visible' });
      assert.match(await page.locator('#vzTip').innerText(), /Libro · Productos/);
      if (FOTOS) await page.screenshot({ path: path.join(FOTOS, 'ppp2-visor-1280.png') });
      assert.deepEqual(errores, []);
      await ctx.close();
    });
  } finally {
    await navegador.close();
    s.close();
  }
  console.log('visor: ' + n + ' recorridos PASS');
})().catch((e) => { console.error(e); process.exit(1); });
