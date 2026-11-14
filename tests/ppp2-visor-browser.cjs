'use strict';
/* Recorrido real del DOM de visor.html con el servidor de PPP 2 corriendo en dobles (tests/ppp2-mundo.cjs)
   y un plan INVENTADO. No sale a la red: las fuentes se sustituyen por vacíos. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { mundo, PLAN, filaDe, EDITOR, LECTOR } = require('./ppp2-mundo.cjs');

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
    if (url.startsWith(base)) return /\/portero\.js/.test(url) ? route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }) : route.continue();
    if (url.startsWith(ENDPOINT)) {
      if (req.method() === 'POST' && op.sesion) {          // la ficha del plan (con sesión) sí escribe: sus ligas
        const b = JSON.parse(req.postData() || '{}');
        otros.push(b.tipo);
        return route.fulfill({ status: 200, contentType: 'application/json', body: w.ctx.doPost({ postData: { contents: JSON.stringify(b) } }).contenido });
      }
      if (req.method() !== 'GET') { otros.push(req.method()); return route.abort(); }
      const p = Object.fromEntries(new URL(url).searchParams);
      pedidos.push(p);
      return route.fulfill({ status: 200, contentType: 'application/json', body: w.ctx.doGet({ parameter: p }).contenido });
    }
    return route.fulfill({ status: 200, contentType: /\.css(\?|$)|fonts\.googleapis/.test(url) ? 'text/css' : 'text/javascript', body: '' });
  });
  await ctx.addInitScript(([ep, sesion]) => { window.PPP2_ENDPOINT = ep; window.PPP2_VISOR_MS = 250; if (sesion) localStorage.setItem('pyod_clave_v1', sesion); }, [ENDPOINT, op.sesion || '']);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto(base + (op.pagina || '/visor.html' + (op.direccion === undefined ? '#l=' + LIGA : op.direccion)));
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

    await caso('en la ficha del plan (con sesión) están los mismos cuadros, de la versión escogida, con su pop-up', async () => {
      const w = mundo(), { ctx, page, pedidos, otros, errores } = await pagina(navegador, base, w, { ancha: true, sesion: LECTOR, pagina: '/ppp2.html#/plan/' + PLAN });
      await page.locator('#p2Cuadros .vz-card').first().waitFor();
      assert.equal(await page.locator('#p2Cuadros .vz-card').count(), 7);
      assert.match(await page.locator('.p2-cuadros-cab').innerText(), /V2/);
      assert.match(await page.locator('#p2Cuadros').innerText(), /\$500\.0/);
      assert.equal(await page.locator('[data-accion="compartir"]').count(), 0, 'quien sólo lee no da ligas');
      const cabe = await page.evaluate(() => { const m = document.querySelector('.vz-inc-marco').getBoundingClientRect(), c = [...document.querySelectorAll('#p2Cuadros .vz-card')].map((x) => x.getBoundingClientRect()); return c.every((r) => r.left >= m.left - 1 && r.right <= m.right + 1) && new Set(c.map((r) => Math.round(r.top))).size === 2; });
      assert.ok(cabe, 'en pantalla ancha: dos renglones de cuadros, dentro de la ficha');
      await page.locator('#p2Cuadros [data-card="dinero"]').click();
      await page.locator('#vzModal').waitFor({ state: 'visible' });
      assert.match(await page.locator('#vzModal').innerText(), /Libro · Flujo V2/);
      await page.keyboard.press('Escape');
      await page.locator('#vzModal').waitFor({ state: 'hidden' });
      await page.locator('.p2-vbtn[data-v="1"]').click();
      await page.locator('.p2-cuadros-cab', { hasText: 'V1' }).waitFor();
      await page.locator('#p2Cuadros .vz-card').first().waitFor();
      await page.locator('#p2Cuadros [data-card="reparto"]').click();
      assert.match(await page.locator('#vzModal').innerText(), /Libro · Resumen · v1\./, 'los cuadros siguen a la versión escogida');
      await page.keyboard.press('Escape');
      assert.ok(pedidos.some((p) => p.recurso === 'ppp2-visor' && p.k === LECTOR && p.v === '1' && !p.liga));
      assert.deepEqual(otros, []);
      assert.deepEqual(errores, []);
      if (FOTOS) await page.screenshot({ path: path.join(FOTOS, 'ppp2-ficha-cuadros.png'), fullPage: true });
      await ctx.close();
    });

    await caso('quien puede editar da la liga desde el plan, la liga abre el visor y apagarla lo cierra', async () => {
      const w = mundo(), { ctx, page, otros, errores } = await pagina(navegador, base, w, { sesion: EDITOR, pagina: '/ppp2.html#/plan/' + PLAN });
      await page.locator('#p2Cuadros .vz-card').first().waitFor();
      await page.locator('[data-accion="compartir"]').click();
      await page.getByText('Este plan todavía no tiene ligas.').waitFor();
      await page.locator('form[data-form="liga"] input[name="para"]').fill('Grupo de prueba');
      await page.locator('form[data-form="liga"] select[name="versiones"]').selectOption('todas');
      await page.evaluate(() => document.querySelector('[data-accion="compartir"]').click());   // el diálogo se vuelve a pintar (como cuando llega la lista de planes)…
      assert.equal(await page.locator('form[data-form="liga"] input[name="para"]').inputValue(), 'Grupo de prueba', '…y lo ya escrito se conserva');
      assert.equal(await page.locator('form[data-form="liga"] select[name="versiones"]').inputValue(), 'todas');
      await page.locator('form[data-form="liga"] button.verde').click();
      const campo = page.locator('#p2LigaNueva');
      await campo.waitFor();
      const url = await campo.inputValue();
      assert.match(url, /\/visor\.html#l=[a-f0-9]{40}$/);
      const h = w.vivero.getSheetByName('Ligas');
      assert.deepEqual(h.v[1].slice(1, 6), [PLAN, 'Grupo de prueba', 'activa', '', 'todas']);
      assert.match(await page.locator('.p2-ligas').innerText(), /Grupo de prueba[\s\S]*sin abrir todavía/);
      assert.deepEqual(otros, ['ppp2-liga']);
      const visor = await ctx.newPage();
      await visor.goto(url);
      await visor.locator('.vz-card').first().waitFor();
      assert.equal(await visor.locator('.vz-card').count(), 7);
      assert.ok(await visor.locator('.vz-chip').count() >= 2, 'la liga se dio con todas las versiones');
      await page.locator('[data-accion="cerrar"]').first().click();
      await page.locator('[data-accion="compartir"]').click();
      await page.locator('[data-accion="liga-estado"][data-op="apagar"]').click();
      await page.locator('.p2-liga.apagada').waitFor();
      await visor.getByText('Esta liga ya no está activa').waitFor({ timeout: 5000 });
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('desde el PPP de siempre: la portada lista los planes con libro y un caso que ya tiene su plan abre su ficha', async () => {
      const w = mundo(), hp = w.vivero.getSheetByName('Planes');
      hp.v[1][hp.v[0].indexOf('caso_ppp')] = 'casodeprueba01';
      hp.appendRow(['p2otroplan01', 'Otro Ejemplo', 'libro-plantilla', 'activo', '2026-01-15', 'Pruebas', '', 'ppp2-libro-v1', '']);
      w.cache.delete('planes');
      const sin = await pagina(navegador, base, w, { pagina: '/tests/fixtures/libro/index.html' });
      await sin.page.waitForTimeout(400);
      assert.equal(sin.pedidos.length, 0, 'sin sesión no pregunta nada');
      assert.equal(await sin.page.locator('[data-libro]').count(), 0);
      await sin.ctx.close();
      const { ctx, page, pedidos, otros, errores } = await pagina(navegador, base, w, { sesion: LECTOR, pagina: '/tests/fixtures/libro/index.html' });
      const ligado = page.locator('a.lt-item[data-libro="' + PLAN + '"]');
      await ligado.waitFor();
      assert.equal(await ligado.getAttribute('href'), 'ppp2.html#/plan/' + PLAN, 'el caso que ya tiene su plan abre la ficha');
      assert.match(await ligado.innerText(), /Caso con plan[\s\S]*V2 propuesta[\s\S]*plan con libro/);
      assert.equal(await page.locator('a.lt-item[href="mixto.html?open=casosinplan0002"]').count(), 1, 'el caso sin plan sigue abriendo su motor');
      assert.deepEqual(await page.locator('.lt-libros a.lt-item').evaluateAll((a) => a.map((x) => x.getAttribute('href'))), ['ppp2.html#/plan/p2otroplan01'], 'el plan sin caso sale en «Planes con libro»; el ligado no se repite');
      await page.evaluate(() => { const l = document.getElementById('listaTodos'); l.innerHTML = l.innerHTML.replace(/ data-libro="[^"]*"/g, '').replace(/ppp2\.html#\/plan\/[a-z0-9]+" class/g, '" class'); l.querySelector('.lt-libros').remove(); const a = l.querySelector('a.lt-item'); a.setAttribute('href', 'mixto.html?open=casodeprueba01'); a.querySelector('.yod-libro-chip').remove(); });
      await page.locator('.lt-libros a.lt-item').waitFor();           // la lista se repintó: lo del libro se repone solo
      assert.equal(await page.locator('a.lt-item[data-libro="' + PLAN + '"]').getAttribute('href'), 'ppp2.html#/plan/' + PLAN);
      assert.equal(pedidos.filter((p) => p.recurso === 'ppp2-vivero').length, 1, 'una sola pregunta por página');
      assert.deepEqual(otros, []);
      assert.deepEqual(errores, []);
      await ctx.close();
      const motor = await pagina(navegador, base, w, { sesion: LECTOR, pagina: '/tests/fixtures/libro/mixto.html?open=casodeprueba01' });
      await motor.page.locator('#yodLibroAviso').waitFor();
      assert.match(await motor.page.locator('#yodLibroAviso').innerText(), /ya tiene su plan completo/);
      await motor.page.waitForURL('**/ppp2.html#/plan/' + PLAN, { timeout: 5000 });
      await motor.ctx.close();
      const clasico = await pagina(navegador, base, w, { sesion: LECTOR, pagina: '/tests/fixtures/libro/mixto.html?open=casodeprueba01&clasico=1' });
      await clasico.page.locator('#yodLibroAviso a').waitFor();
      await clasico.page.waitForTimeout(1800);
      assert.match(clasico.page.url(), /mixto\.html\?open=casodeprueba01&clasico=1$/, 'pidiendo el motor, se queda en el motor');
      await clasico.ctx.close();
      const otro = await pagina(navegador, base, w, { sesion: LECTOR, pagina: '/tests/fixtures/libro/mixto.html?open=casosinplan0002' });
      await otro.page.waitForTimeout(500);
      assert.equal(await otro.page.locator('#yodLibroAviso').count(), 0, 'un caso sin plan no avisa nada');
      await otro.ctx.close();
    });
  } finally {
    await navegador.close();
    s.close();
  }
  console.log('visor: ' + n + ' recorridos PASS');
})().catch((e) => { console.error(e); process.exit(1); });
