'use strict';
/* El visor explica cada cifra (visor-explica.js + visor-explica-grafo.js), en el DOM de verdad: teléfonos de 430, 390 y
   375 px a 3×, escritorio, tema claro y oscuro del sistema, teclado y lector de pantalla. Servidor de PPP 2 en dobles
   (tests/ppp2-mundo.cjs) con un plan INVENTADO; no sale a la red. Con PPP_SCREENSHOTS guarda capturas. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { mundo, PLAN, filaDe, LECTOR, EDITOR } = require('./ppp2-mundo.cjs');

const RAIZ = path.join(__dirname, '..');
const FOTOS = process.env.PPP_SCREENSHOTS || '';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const ENDPOINT = 'https://script.google.com/macros/s/PRUEBA/exec';
const LIGA = 'liga0000000000000000000000000001';
const renglon = () => Object.values({ liga: LIGA, plan_id: PLAN, para: 'Grupo de prueba', estado: 'activa', vence: '', versiones: '', etiquetas: '', creada: '2026-01-01', nota: '' });
const conLiga = () => mundo({ ligas: [renglon()], aperturas: true });
const TELEFONOS = { 430: { width: 430, height: 932 }, 390: { width: 390, height: 844 }, 375: { width: 375, height: 667 } };

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
  const telefono = TELEFONOS[op.telefono];
  const ctx = await navegador.newContext(telefono ? { viewport: telefono, deviceScaleFactor: 3, hasTouch: true, isMobile: true, colorScheme: op.esquema || 'light' }
    : { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, colorScheme: op.esquema || 'light' });
  const pedidos = [], otros = [];
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(base)) {
      if (/\/portero\.js/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      if (op.sinTextos && /\/visor-explica\.js/.test(url)) return route.fulfill({ status: 404, body: '' });
      return route.continue();
    }
    if (url.startsWith(ENDPOINT)) {
      if (req.method() !== 'GET') { otros.push(req.method()); return route.abort(); }
      const p = Object.fromEntries(new URL(url).searchParams);
      pedidos.push(p);
      const cuerpo = w.ctx.doGet({ parameter: p }).contenido;
      return route.fulfill({ status: 200, contentType: 'application/json', body: op.transforma ? JSON.stringify(op.transforma(JSON.parse(cuerpo))) : cuerpo });
    }
    return route.fulfill({ status: 200, contentType: /\.css(\?|$)|fonts\.googleapis/.test(url) ? 'text/css' : 'text/javascript', body: '' });
  });
  await ctx.addInitScript(([ep, sesion, ms]) => { window.PPP2_ENDPOINT = ep; window.PPP2_VISOR_MS = ms; if (sesion) localStorage.setItem('pyod_clave_v1', sesion); }, [ENDPOINT, op.sesion || '', op.ms || 60000]);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto(base + (op.pagina || '/visor.html#l=' + LIGA));
  return { ctx, page, pedidos, otros, errores };
}

/* abre la hoja de un cuadro con un toque (o un clic) */
async function abreCuadro(page, id, toque) {
  const card = page.locator('.vz-card[data-card="' + id + '"]').first();
  await card.waitFor();
  if (toque) await card.tap(); else await card.click();
  await page.locator('#vzModal:not([hidden]) .vz-m-fig svg').waitFor();
  await page.waitForTimeout(350);                                  // la hoja termina de subir
}
/* espera a que la hoja deje de desplazarse (el renglón que se abre se trae a la vista con un desplazamiento suave) */
async function quieta(page) {
  let antes = -1;
  for (let i = 0; i < 40; i++) {
    const y = await page.locator('.vz-m-caja').evaluate((e) => e.scrollTop);
    if (y === antes) return;
    antes = y;
    await page.waitForTimeout(120);
  }
}
/* toca (o pulsa) la figura cuya leyenda tiene la clave x */
async function tocaFigura(page, x, toque) {
  await quieta(page);
  const caja = await page.locator('.vz-m-fig .vz-t').evaluateAll((els, x) => {
    const el = els.find((e) => { try { return JSON.parse(e.getAttribute('data-t')).x === x; } catch (er) { return false; } });
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(r.width / 2, 20), y: r.top + r.height / 2 };
  }, x);
  assert.ok(caja, 'no hay figura con ' + x);
  await page.waitForTimeout(150);
  if (toque) await page.touchscreen.tap(caja.x, caja.y); else await page.mouse.click(caja.x, caja.y);
  await page.locator('#vzTip:not([hidden])').waitFor();
}
/* nada se sale a lo ancho: ni la página, ni la hoja, ni lo que se abre */
async function cabe(page) {
  const r = await page.evaluate(() => {
    const W = window.innerWidth, caja = document.querySelector('.vz-m-caja');
    const fuera = [...document.querySelectorAll('.vz-xp:not([hidden]), .vz-xp:not([hidden]) *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > W + 0.5 || b.left < -0.5); }).map((e) => e.className || e.tagName);
    return { pagina: document.documentElement.scrollWidth <= W, hoja: !caja || caja.scrollWidth <= caja.clientWidth + 1, fuera };
  });
  assert.ok(r.pagina, 'la página se desliza de lado');
  assert.ok(r.hoja, 'la hoja se desliza de lado');
  assert.deepEqual(r.fuera, [], 'algo de lo abierto se sale de la pantalla');
}
/* contraste AA de lo que se lee en lo abierto (texto sobre su fondo) */
async function contraste(page) {
  const malos = await page.evaluate(() => {
    const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const fondo = (el) => { while (el) { const b = getComputedStyle(el).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return rgb(b); el = el.parentElement; } return [255, 255, 255]; };
    return [...document.querySelectorAll('.vz-xp:not([hidden]) p, .vz-xp:not([hidden]) li span, .vz-xp:not([hidden]) b, #vzTip:not([hidden]) *')].filter((e) => e.textContent.trim()).map((e) => {
      const a = lum(rgb(getComputedStyle(e).color)), b = lum(fondo(e)), r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return [e.className || e.tagName, Math.round(r * 100) / 100];
    }).filter((x) => x[1] < 4.5);
  });
  assert.deepEqual(malos, [], 'texto que no pasa AA');
}

(async () => {
  const s = await servidor(), base = 'http://127.0.0.1:' + s.address().port;
  const navegador = await chromium.launch();
  let n = 0;
  const caso = async (nombre, f) => { await f(); n++; console.log('ok · ' + nombre); };
  const foto = async (page, nombre) => { if (FOTOS) await page.screenshot({ path: path.join(FOTOS, nombre + '.png') }); };
  try {
    for (const [tel, esquema] of [[430, 'light'], [390, 'dark'], [375, 'light']]) {
      await caso('teléfono de ' + tel + ' px a 3×, tema ' + (esquema === 'dark' ? 'oscuro' : 'claro') + ': tocar un anillo da la leyenda breve y «Qué es y de qué depende» abre su renglón dentro de la hoja', async () => {
        const w = conLiga(), { ctx, page, pedidos, otros, errores } = await pagina(navegador, base, w, { telefono: tel, esquema });
        await abreCuadro(page, 'riesgo', true);
        await tocaFigura(page, 'v.rv_linea_costo', true);
        const tip = page.locator('#vzTip');
        assert.match(await tip.innerText(), /Línea del banco entre costo con terreno[\s\S]*La revisión pide[\s\S]*máx 50%[\s\S]*Cuánto presta el banco por cada \$100 de costo, terreno incluido\./);
        assert.doesNotMatch(await tip.innerText(), /banco pide/);
        const mas = tip.locator('.vz-tip-mas');
        assert.equal(await mas.innerText(), 'Qué es y de qué depende');
        const bm = await mas.boundingBox();
        assert.ok(bm.height >= 44, 'el botón de la leyenda mide 44 px o más: ' + bm.height);
        await contraste(page);
        await foto(page, 'explica-' + tel + '-' + esquema + '-1-leyenda');
        await mas.tap();
        const fila = page.locator('.vz-xf:has(.vz-xb[data-x="v.rv_linea_costo"])');
        await fila.locator('.vz-xp').waitFor({ state: 'visible' });
        await quieta(page);
        assert.equal(await page.locator('#vzTip').isHidden(), true, 'la leyenda se quita');
        assert.equal(await fila.locator('.vz-xb').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-x')), 'v.rv_linea_costo', 'el foco pasa al renglón');
        const pos = await page.evaluate(() => {
          const f = document.querySelector('.vz-xb[data-x="v.rv_linea_costo"]').closest('.vz-xf').getBoundingClientRect(), cab = document.querySelector('.vz-m-head').getBoundingClientRect();
          return { top: f.top, cab: cab.bottom, alto: window.innerHeight };
        });
        assert.ok(pos.top >= pos.cab - 1 && pos.top < pos.cab + 40, 'el renglón queda a la vista, bajo el encabezado de la hoja: ' + JSON.stringify(pos));
        const t = await fila.locator('.vz-xp').innerText();
        for (const parte of ['CÓMO SE CALCULA', 'HOY', 'DE QUÉ DEPENDE', 'QUÉ LA MUEVE', 'POR QUÉ IMPORTA']) assert.ok(t.includes(parte), 'falta ' + parte);
        assert.match(t, /En esta versión: costo sin terreno \$380\.0 · valor de la tierra \$30\.0\./);
        assert.match(t, /El plan: 40\.0% · la revisión para fondos pide 50% o menos · sobran 10\.0 pts\./);
        assert.match(t, /Línea del banco sale de/);
        assert.match(t, /Libro del plan · Resumen · v2\.rv_linea_costo/);
        await cabe(page);
        await contraste(page);
        await foto(page, 'explica-' + tel + '-' + esquema + '-2-renglon');
        await page.locator('.vz-m-caja').evaluate((el) => { el.scrollTop += Math.round(window.innerHeight * 0.55); });
        await page.waitForTimeout(200);
        await foto(page, 'explica-' + tel + '-' + esquema + '-3-depende');
        // tocar el renglón (no lo abierto) lo cierra
        await fila.locator('dd').first().tap();
        assert.equal(await fila.locator('.vz-xb').getAttribute('aria-expanded'), 'false');
        assert.equal(await fila.locator('.vz-xp').isHidden(), true);
        assert.ok(pedidos.some((p) => p.recurso === 'ppp2-visor') && pedidos.every((p) => /^ppp2-/.test(p.recurso)), 'sólo lecturas del visor y sus pestañas');
        assert.deepEqual(otros, [], 'sólo lecturas');
        assert.deepEqual(errores, []);
        await ctx.close();
      });
    }

    await caso('con teclado y lector de pantalla: cada renglón es un botón con su nombre, abre y cierra con Enter y Espacio, y Esc cierra la hoja', async () => {
      const w = conLiga(), { ctx, page, errores } = await pagina(navegador, base, w, { telefono: 390, esquema: 'dark' });
      await page.locator('.vz-card[data-card="riesgo"]').waitFor();
      await page.locator('.vz-card[data-card="riesgo"]').focus();
      await page.keyboard.press('Enter');
      await page.locator('#vzModal:not([hidden]) .vz-m-fig').waitFor();
      const boton = page.getByRole('button', { name: 'Margen antes de financiamiento sobre costo: qué es y de qué depende' });
      assert.equal(await boton.count(), 1);
      for (let i = 0; i < 40 && !(await boton.evaluate((b) => b === document.activeElement)); i++) await page.keyboard.press('Tab');
      assert.equal(await boton.evaluate((b) => b === document.activeElement), true, 'se llega con Tab');
      await page.keyboard.press('Enter');
      const region = page.getByRole('region', { name: 'Margen antes de financiamiento sobre costo' });
      await region.waitFor({ state: 'visible' });
      assert.equal(await boton.getAttribute('aria-expanded'), 'true');
      assert.equal(await boton.getAttribute('aria-controls'), await region.getAttribute('id'));
      assert.match(await region.innerText(), /Mejora: sube con precios más altos o con costos más bajos/);
      await page.keyboard.press('Space');
      assert.equal(await boton.getAttribute('aria-expanded'), 'false');
      assert.equal(await region.isHidden(), true);
      // el foco no sale de la hoja con Tab
      for (let i = 0; i < 60; i++) await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('.vz-m-caja')), true, 'el foco sigue en la hoja');
      await page.keyboard.press('Escape');
      await page.locator('#vzModal').waitFor({ state: 'hidden' });
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('375 px: «Dinero que faltaría», «Aguante» y «Etapa» también se explican, sin salirse de la pantalla', async () => {
      const w = conLiga(), { ctx, page, errores } = await pagina(navegador, base, w, { telefono: 375 });
      await abreCuadro(page, 'riesgo', true);
      for (const [x, frase] of [['v.rv_falta', /Se suma mes por mes[\s\S]*Falta \(\+\) o sobra \(-\) en el mes, antes de dinero nuevo/], ['estres', /otra huella y hay que repetirlas/], ['plan.edad', /Semilla: todavía no calcula/]]) {
        await tocaFigura(page, x, true);
        assert.equal(await page.locator('#vzTip .vz-tip-mas').count(), 1, x);
        await page.locator('#vzTip .vz-tip-mas').tap();
        const fila = page.locator('.vz-xf:has(.vz-xb[data-x="' + x + '"])');
        await fila.locator('.vz-xp').waitFor({ state: 'visible' });
        await quieta(page);
        assert.match(await fila.locator('.vz-xp').innerText(), frase, x);
        await cabe(page);
        if (x === 'plan.edad') await foto(page, 'explica-375-light-4-etapa');
        await page.locator('.vz-m-caja').evaluate((el) => { el.scrollTop = 0; });
        await page.waitForTimeout(200);
      }
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('escritorio: al pasar el ratón la leyenda va y viene; con un clic se queda, su botón abre el renglón y Esc la quita antes que la hoja', async () => {
      const w = conLiga(), { ctx, page, errores } = await pagina(navegador, base, w, {});
      await abreCuadro(page, 'riesgo', false);
      const anillo = await page.locator('.vz-m-fig .vz-t').nth(4).boundingBox();
      await page.mouse.move(anillo.x + anillo.width / 2, anillo.y + anillo.height / 3);
      await page.locator('#vzTip:not([hidden])').waitFor();
      assert.equal(await page.locator('#vzTip').getAttribute('data-fija'), null, 'al pasar el ratón no se fija');
      await page.mouse.move(5, 5);
      await page.locator('#vzTip').waitFor({ state: 'hidden' });
      await tocaFigura(page, 'v.rv_preventa', false);
      assert.equal(await page.locator('#vzTip').getAttribute('data-fija'), '1');
      const b = await page.locator('#vzTip .vz-tip-mas').boundingBox();
      const otro = await page.locator('.vz-m-fig .vz-t').nth(0).boundingBox();
      await page.mouse.move(otro.x + otro.width / 2, otro.y + otro.height / 2, { steps: 4 });   // pasa por otra figura
      assert.match(await page.locator('#vzTip').innerText(), /Preventa firmada al arrancar la obra/, 'la fijada no se cambia al pasar por otra');
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      const fila = page.locator('.vz-xf:has(.vz-xb[data-x="v.rv_preventa"])');
      await fila.locator('.vz-xp').waitFor({ state: 'visible' });
      await quieta(page);
      assert.match(await fila.locator('.vz-xp').innerText(), /En esta versión: la obra arranca en el mes 12\./);
      await cabe(page);
      await foto(page, 'explica-escritorio-renglon');
      await tocaFigura(page, 'v.rv_cobertura', false);
      await page.keyboard.press('Escape');
      await page.locator('#vzTip').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#vzModal').isVisible(), true, 'el primer Esc quita la leyenda');
      await page.keyboard.press('Escape');
      await page.locator('#vzModal').waitFor({ state: 'hidden' });
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('si el libro cambia con un renglón abierto, la hoja se repinta sola y el renglón sigue abierto, con la cifra nueva', async () => {
      const w = conLiga(), { ctx, page, errores } = await pagina(navegador, base, w, { telefono: 430, ms: 250 });
      await abreCuadro(page, 'riesgo', true);
      await page.locator('.vz-xb[data-x="v.rv_margen"]').tap();
      const fila = page.locator('.vz-xf:has(.vz-xb[data-x="v.rv_margen"])');
      await fila.locator('.vz-xp').waitFor({ state: 'visible' });
      const res = w.libro.getSheetByName('Resumen');
      res.v[filaDe(res, 'v2.ventas') - 1][1] = 512.3;         // alguien cambió el libro
      w.cache.delete('vk_' + PLAN);
      await page.locator('.vz-xp:not([hidden])').getByText('$512.3').first().waitFor({ timeout: 5000 });
      assert.equal(await page.locator('.vz-xb[data-x="v.rv_margen"]').getAttribute('aria-expanded'), 'true');
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('una foto del PPP de siempre: el renglón dice que la cifra salió del motor de su tablero y de qué se dedujo', async () => {
      const w = conLiga(), transforma = (j) => { if (j.ok && j.v) { j.origen = 'PPP · VERTICAL · versión «Base» · foto del 1-ene-2026'; j.deducido = { 'v.rv_aportacion': '(tierra que aporta el dueño + capital usado) ÷ costo con tierra' }; } return j; };
      const { ctx, page, errores } = await pagina(navegador, base, w, { telefono: 390, transforma });
      await abreCuadro(page, 'riesgo', true);
      await page.locator('.vz-xb[data-x="v.rv_aportacion"]').tap();
      const t = await page.locator('.vz-xf:has(.vz-xb[data-x="v.rv_aportacion"]) .vz-xp').innerText();
      assert.match(t, /Deducido de \(tierra que aporta el dueño \+ capital usado\) ÷ costo con tierra\./);
      assert.match(t, /motor de su tablero del PPP de siempre/);
      assert.doesNotMatch(t, /Sale directo de|Mejora:/);
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('si visor-explica.js no carga, la hoja y la leyenda son las de siempre', async () => {
      const w = conLiga(), { ctx, page, errores } = await pagina(navegador, base, w, { telefono: 430, sinTextos: true });
      await abreCuadro(page, 'riesgo', true);
      assert.equal(await page.locator('.vz-xb').count(), 0);
      await tocaFigura(page, 'v.rv_linea_costo', true);
      assert.equal(await page.locator('#vzTip .vz-tip-mas').count(), 0);
      assert.match(await page.locator('#vzTip').innerText(), /La revisión pide/);
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('en la ficha del plan (con sesión): los renglones también se abren y «Lo que mueve este cuadro» sigue en su hoja', async () => {
      const w = mundo(), { ctx, page, otros, errores } = await pagina(navegador, base, w, { sesion: LECTOR, pagina: '/ppp2.html#/plan/' + PLAN });
      await page.locator('#p2Cuadros .vz-card').first().waitFor();
      await page.locator('#p2Cuadros [data-card="riesgo"]').click();
      await page.locator('#vzModal').waitFor({ state: 'visible' });
      await page.locator('.vz-xb[data-x="v.rv_linea_ventas"]').click();
      await page.locator('.vz-xf:has(.vz-xb[data-x="v.rv_linea_ventas"]) .vz-xp').waitFor({ state: 'visible' });
      assert.match(await page.locator('.vz-xf:has(.vz-xb[data-x="v.rv_linea_ventas"]) .vz-xp').innerText(), /En banca se le llama LTV sobre el valor de venta \(LTGDV\)\./);
      await page.keyboard.press('Escape');
      await page.locator('#vzModal').waitFor({ state: 'hidden' });
      // y en un cuadro con lápiz, la hoja lleva los renglones que se abren y, debajo, «Lo que mueve este cuadro» (ppp2.js)
      await page.locator('#p2Cuadros [data-card="costo"]').click();
      await page.locator('#vzModal .p2-mueve').waitFor();
      assert.match(await page.locator('#vzModal .p2-mueve').innerText(), /Lo que mueve este cuadro/i);
      await page.keyboard.press('Escape');
      await page.locator('#vzModal').waitFor({ state: 'hidden' });
      assert.deepEqual(otros, []);
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('los demás cuadros (fase 2): Costo y ganancia, Dinero, Reparto y Terreno también se explican desde su figura', async () => {
      const w = conLiga(), { ctx, page, errores } = await pagina(navegador, base, w, { telefono: 390 });
      for (const [cuadro, x, frase, archivo] of [
        ['costo', 'flujo.obra', /Lo que cuesta construir el proyecto[\s\S]*Obra directa sale de/, 'explica-390-light-5-costo'],
        ['dinero', 'flujo.flujo_acum', /Se suma mes por mes: cobranza − egresos/, 'explica-390-light-6-dinero'],
        ['reparto', 'v.dueno_recibe', /Es lo que el dueño compara contra vender su terreno hoy\./, 'explica-390-light-7-reparto'],
        ['terreno', 'visor.tierra_ventas', /La acomoda el visor con cifras del libro\./, '']]) {
        await abreCuadro(page, cuadro, true);
        if (x === 'visor.tierra_ventas') await page.locator('.vz-xb[data-x="' + x + '"]').tap();     // un renglón que no tiene figura propia
        else {
          await tocaFigura(page, x, true);
          await page.locator('#vzTip .vz-tip-mas').tap();
        }
        const fila = page.locator('.vz-xf:has(.vz-xb[data-x="' + x + '"])').first();
        await fila.locator('.vz-xp').waitFor({ state: 'visible' });
        await quieta(page);
        assert.match(await fila.locator('.vz-xp').innerText(), frase, x);
        await cabe(page);
        await contraste(page);
        if (archivo) await foto(page, archivo);
        await page.keyboard.press('Escape');
        if (await page.locator('#vzModal').isVisible()) await page.keyboard.press('Escape');
        await page.locator('#vzModal').waitFor({ state: 'hidden' });
      }
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('en la ficha, quien edita: el lápiz de un renglón que se explica abre su diálogo y no abre ni cierra el renglón', async () => {
      const w = mundo(), { ctx, page, errores } = await pagina(navegador, base, w, { sesion: EDITOR, pagina: '/ppp2.html#/plan/' + PLAN });
      await page.locator('#p2Cuadros [data-card="terreno"]').first().waitFor();
      await page.locator('#p2Cuadros [data-card="terreno"]').click();
      await page.locator('#vzModal').waitFor({ state: 'visible' });
      const fila = page.locator('.vz-xf:has(.vz-xb[data-x="datos.terreno.m2"])');
      await fila.locator('.p2-lapiz-mini').waitFor();
      await fila.locator('.p2-lapiz-mini').click();
      await page.locator('#p2Dialogo').waitFor();
      assert.equal(await fila.locator('.vz-xb').getAttribute('aria-expanded'), 'false', 'el lápiz no abre el renglón');
      assert.deepEqual(errores, []);
      await ctx.close();
    });
  } finally {
    await navegador.close();
    s.close();
  }
  console.log(n + ' recorridos');
})().catch((e) => { console.error(e); process.exit(1); });
