'use strict';
/* Recorridos reales del visor con pestañas (Plan · Historial · Archivos · Opciones). El plan lo contesta el
   servidor de PPP 2 en dobles (tests/ppp2-mundo.cjs); Historial y Archivos, los dobles del contrato
   (tests/visor-pestanas-dobles.cjs) o, para «el servidor de hoy», el mismo mundo, que todavía no los tiene.
   Datos INVENTADOS; nada sale a la red. pdf.js: si PPP_PDFJS_DIR apunta a la carpeta legacy/build de
   pdfjs-dist@3.11.174, se sirve de ahí (y su huella SRI tiene que cuadrar); si no, se prueba el respaldo. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { mundo, PLAN, ADMIN } = require('./ppp2-mundo.cjs');
const D = require('./visor-pestanas-dobles.cjs');
const M = require('./visor-pestanas-mundo.cjs');

const RAIZ = path.join(__dirname, '..');
const FOTOS = process.env.PPP_SCREENSHOTS || '';
const PDFJS = process.env.PPP_PDFJS_DIR || '';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const ENDPOINT = 'https://script.google.com/macros/s/PRUEBA/exec';
const LIGA = 'liga0000000000000000000000000001', OTRO = 'p2otroplan01';

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
function elMundo(op) {
  const varios = !!op.varios;
  const w = mundo({ ligas: [[LIGA, varios ? PLAN + ',' + OTRO : PLAN, 'Grupo de prueba', 'activa', '', varios ? 'todas' : '', varios ? 'Terreno grande|Terreno chico' : '', '2026-01-01', '']], aperturas: true });
  if (varios) { w.vivero.getSheetByName('Planes').appendRow([OTRO, 'Otro Ejemplo', 'libro-plantilla', 'activo', '2026-01-15', 'Pruebas', '', 'ppp2-libro-v1', '']); w.cache.delete('planes'); }
  return w;
}
/* op: { nuevo (los dobles del contrato contestan los recursos de las pestañas), real (los contesta el servidor de main,
   Visor.gs, con la hoja de historial y el Drive de tests/visor-pestanas-mundo.cjs), audiencia, ancho, alto, dpr, sesion,
   transforma, demora:{recurso: ms}, error:{recurso: código}, direccion }. Sin `nuevo` ni `real`, el servidor publicado
   hoy: a esos recursos contesta `sin_sesion`. */
async function abre(navegador, base, op) {
  op = op || {};
  const w = op.real ? M.mundoReal({ liga: LIGA, audiencia: op.audiencia }) : elMundo(op), pedidos = [], escrituras = [], vuelo = { ahora: 0, max: 0 };
  const movil = (op.ancho || 390) < 700;
  const ctx = await navegador.newContext({ viewport: { width: op.ancho || 390, height: op.alto || 844 }, deviceScaleFactor: op.dpr || 1, hasTouch: movil, isMobile: movil });
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(base)) return route.continue();
    if (url.startsWith('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/')) {
      const f = PDFJS && path.join(PDFJS, url.split('/').pop());
      if (f && fs.existsSync(f)) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
      return route.abort();
    }
    if (url.startsWith(ENDPOINT)) {
      if (req.method() !== 'GET') {
        const b = JSON.parse(req.postData() || '{}'); escrituras.push(b);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b.tipo === 'ppp2-elige' && b.k === ADMIN ? { ok: true } : { ok: false, error: 'permiso' }) });
      }
      const p = Object.fromEntries(new URL(url).searchParams);
      pedidos.push(p);
      if (p.recurso === 'ppp2-archivo') { vuelo.ahora++; vuelo.max = Math.max(vuelo.max, vuelo.ahora); }
      try {
        if (op.demora && op.demora[p.recurso]) await new Promise((r) => setTimeout(r, op.demora[p.recurso]));
        else if (p.recurso === 'ppp2-archivo') await new Promise((r) => setTimeout(r, 30));     // que una parte tarde algo: así se nota si se piden dos a la vez
        if (!op.nuevo && !op.real && D.RECURSOS.indexOf(p.recurso) >= 0) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'sin_sesion' }) });
        const doble = op.nuevo ? D.contesta(p, { audiencia: op.audiencia, malEducado: op.audiencia === 'externo', error: op.error, tamParte: op.tamParte }) : null;
        if (doble) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doble) });
      } finally { if (p.recurso === 'ppp2-archivo') vuelo.ahora--; }
      const q = Object.assign({}, p); delete q.k;
      let j = JSON.parse(w.ctx.doGet({ parameter: q }).contenido);
      if (j.ok && j.menu && j.menu.plan === OTRO && j.v) { j.v.ventas = 312.4; j.v.ganancia = 31.8; j.v.dueno_recibe = 36.2; j.v.dueno_veces = 1.61; j.datos['terreno.m2'] = { valor: 2164, estado: 'confirmado' }; }
      if (j.ok && op.direccion && p.k === ADMIN) j.elige = { versiones: (j.versiones || []).map((x) => ({ v: 'esc-' + x.n, nombre: x.nombre, buena: x.n === 2 })) };
      if (op.transforma) j = op.transforma(j, p);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
    }
    return route.fulfill({ status: 200, contentType: /\.css(\?|$)|fonts\.googleapis/.test(url) ? 'text/css' : 'text/javascript', body: '' });
  });
  await ctx.addInitScript(([ep, ses, ms]) => { window.PPP2_ENDPOINT = ep; window.PPP2_VISOR_MS = ms; if (ses) localStorage.setItem('pyod_clave_v1', ses); }, [ENDPOINT, op.sesion || '', op.ms || 60000]);
  const page = await ctx.newPage(), errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  if (process.env.PESTANAS_CONSOLA) page.on('console', (m) => console.log('  consola: ' + m.text()));
  await page.goto(base + '/visor.html' + (op.direccion === undefined || typeof op.direccion === 'boolean' ? '#l=' + LIGA : '') + (op.hash || ''));
  await page.locator('.vz-card').first().waitFor({ state: 'attached' });
  return { w, ctx, page, pedidos, escrituras, errores, vuelo };
}
const pestana = async (page, t) => { await page.locator('#vzpTab-' + t).click(); await page.locator('#vzpPanel-' + t).waitFor({ state: 'visible' }); };
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 0.5);

(async () => {
  const s = await servidor(), base = 'http://127.0.0.1:' + s.address().port;
  const navegador = await chromium.launch();
  let n = 0;
  const solo = process.env.PESTANAS_SOLO || '';
  const caso = async (nombre, f) => { if (solo && nombre.indexOf(solo) < 0) return; await f(); n++; console.log('ok · ' + nombre); };
  try {
    await caso('contra el servidor de hoy: la barra, cada pestaña con un estado digno, el plan intacto y sólo lecturas', async () => {
      const { ctx, page, pedidos, escrituras, errores } = await abre(navegador, base, {});
      await page.locator('.vz-card').first().waitFor();
      assert.deepEqual(await page.locator('#vzBarra .vzp-tab').allInnerTexts(), ['Plan', 'Historial', 'Archivos', 'Opciones']);
      assert.equal(await page.locator('#vzpTab-plan').getAttribute('aria-selected'), 'true');
      await pestana(page, 'historial');
      await page.getByText('Aún no hay historial en esta liga').waitFor();
      assert.match(page.url(), /#l=liga0+1&t=historial$/, 'la pestaña se recuerda en la dirección');
      await pestana(page, 'archivos');
      await page.getByText('Aún no hay archivos en esta liga').waitFor();
      await pestana(page, 'opciones');
      await page.getByText('Esta liga trae una sola opción del plan').waitFor();
      assert.equal(await page.locator('.vzp-op').count(), 1);
      assert.equal(await page.locator('.vzp-comparar').count(), 0);
      await pestana(page, 'plan');
      assert.equal(await page.locator('.vz-card').count(), 7, 'el plan sigue ahí: un recurso que no existe no apaga la liga');
      // con el teclado: Enter (o Espacio) en una pestaña la abre y el foco se queda en ella, no se pierde en la página
      await page.locator('#vzpTab-historial').focus();
      await page.keyboard.press('Enter');
      await page.locator('#vzpPanel-historial').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.activeElement.id), 'vzpTab-historial');
      await page.keyboard.press('ArrowLeft');
      await page.locator('#vzpPanel-plan').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.activeElement.id), 'vzpTab-plan');
      assert.ok(pedidos.some((p) => p.recurso === 'ppp2-historial') && pedidos.some((p) => p.recurso === 'ppp2-archivos'));
      assert.ok(pedidos.filter((p) => /ppp2-(historial|archivos)/.test(p.recurso)).every((p) => p.liga === LIGA && p.plan === PLAN && !p.k), 'con la liga y el plan, sin sesión');
      assert.deepEqual(escrituras, []);
      // volver a abrir la misma dirección abre la misma pestaña
      await pestana(page, 'archivos');
      await page.reload();
      await page.locator('#vzpPanel-archivos').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#vzpTab-archivos').getAttribute('aria-selected'), 'true');
      await page.getByText('Aún no hay archivos en esta liga').waitFor();
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('Historial del equipo: el día más reciente, otro día, la conversación en capturas y un archivo de la reunión', async () => {
      const { ctx, page, pedidos, errores } = await abre(navegador, base, { nuevo: true });
      await pestana(page, 'historial');
      await page.locator('.vzp-dia-on').waitFor();
      const h = D.historial();
      assert.equal(await page.locator('.vzp-dia').count(), h.dias.length);
      assert.equal(await page.locator('.vzp-dia-on').getAttribute('data-dia'), h.dias[0].fecha);
      const pista = await page.evaluate(() => { const p = document.querySelector('.vzp-linea-pista'); return { fin: p.scrollLeft + p.clientWidth >= p.scrollWidth - 2, mas: p.scrollWidth > p.clientWidth }; });
      assert.ok(pista.mas && pista.fin, 'la línea de tiempo se desliza y abre en lo más reciente');
      assert.match(await page.locator('.vzp-resumen').innerText(), /2\s+reuniones[\s\S]*3\s+versiones[\s\S]*3\s+pendientes/);
      await page.locator('.vzp-dia[data-dia="' + h.dias[2].fecha + '"]').click();
      await page.getByText('Se fija el arranque de obra').waitFor();
      await page.locator('.vzp-res[data-salta="reunion"]').click();
      await page.getByText('Reunión con el dueño del terreno').waitFor();
      assert.equal(await page.locator('.vzp-dia-on').getAttribute('data-dia'), h.dias[0].fecha, '«reuniones» lleva al día de la última');
      // la conversación
      await page.locator('[data-chat]').first().click();
      const hoja = page.locator('.vzp-hoja-chat');
      await hoja.locator('.vzp-captura').first().waitFor();
      assert.ok(pedidos.some((p) => p.recurso === 'ppp2-chat' && p.dia === h.dias[0].fecha && !p.k));
      const caps = await hoja.locator('.vzp-captura').count();
      assert.ok(caps >= 2, 'catorce mensajes, varias capturas: ' + caps);
      assert.equal(await hoja.locator('.vzp-msj').count(), 14);
      const cabe = await page.evaluate(() => [...document.querySelectorAll('.vzp-cap-msjs')].every((c) => c.scrollHeight <= c.clientHeight + 2));
      assert.ok(cabe, 'cada captura cabe a la vista, sin desplazarse por dentro');
      assert.equal(await hoja.locator('.vzp-cap-pos').innerText(), '1 de ' + caps);
      await hoja.locator('.vzp-cap-b[data-cap="1"]').click();
      await hoja.locator('.vzp-cap-pos', { hasText: '2 de ' + caps }).waitFor();
      assert.ok(await page.evaluate(() => document.activeElement && !!document.activeElement.closest('.vzp-hoja')), 'el foco está en la hoja');
      if (FOTOS) await page.screenshot({ path: path.join(FOTOS, 'visor-pestanas-chat.png') });
      // un adjunto del chat abre su archivo encima de la conversación
      await hoja.locator('.vzp-msj [data-archivo="' + D.ARCH.transcripcion + '"]').click();
      const prev = page.locator('.vzp-hoja-archivo');
      await prev.locator('.vzp-pdf, .vzp-prev-otro').first().waitFor({ timeout: 15000 });
      const partes = pedidos.filter((p) => p.recurso === 'ppp2-archivo' && p.id === D.ARCH.transcripcion).map((p) => +p.parte);
      assert.ok(partes.length >= 2 && partes.every((x, i) => x === i), 'por partes, desde la 0 y en orden: ' + partes);
      if (PDFJS) {
        await prev.locator('.vzp-pag img').first().waitFor({ timeout: 15000 });
        assert.equal(await prev.locator('.vzp-pag').count(), 2, 'el PDF se ve dentro de la página, página por página (pdf.js con su huella SRI)');
      } else assert.match(await prev.innerText(), /Abrir el PDF|PDF/, 'sin pdf.js, el PDF se abre aparte');
      assert.equal(await prev.locator('a[download]').count() >= 1, true, 'y se puede guardar');
      await page.keyboard.press('Escape');
      await prev.waitFor({ state: 'detached' });
      assert.equal(await hoja.isVisible(), true, 'Esc cierra sólo la de arriba');
      await page.goBack();                                   // «atrás» del teléfono cierra la conversación
      await hoja.waitFor({ state: 'detached' });
      assert.equal(await page.locator('#vzpPanel-historial').isVisible(), true);
      // la reunión abre su transcripción por Archivos
      await page.locator('.vzp-ev-arch [data-archivo]').first().click();
      await page.locator('.vzp-hoja-archivo .vzp-hoja-tits h2', { hasText: 'Transcripción de la reunión.pdf' }).waitFor();
      await page.locator('.vzp-hoja-archivo .vzp-x').click();
      await page.locator('.vzp-hoja-archivo').waitFor({ state: 'detached' });
      // pendientes, con el vencido marcado
      assert.match(await page.locator('#vzpPendientes').innerText(), /Enviar el levantamiento[\s\S]*venció/);
      assert.ok(await sinDesborde(page));
      if (FOTOS) await page.screenshot({ path: path.join(FOTOS, 'visor-pestanas-historial.png'), fullPage: true });
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('una liga de fuera nunca ve la conversación ni los pendientes, aunque el servidor los mandara', async () => {
      const { ctx, page, pedidos, errores } = await abre(navegador, base, { nuevo: true, audiencia: 'externo' });
      await pestana(page, 'historial');
      await page.locator('.vzp-dia-on').waitFor();
      assert.equal(await page.locator('[data-chat]').count(), 0);
      assert.equal(await page.locator('#vzpPendientes').count(), 0);
      assert.equal(await page.locator('.vzp-res[data-salta="pendientes"]').count(), 0);
      assert.doesNotMatch(await page.locator('#vzpPanel-historial').innerText(), /No debe verse|Chat del equipo|Fuente interna/);
      assert.equal(await page.locator('#vzpPanel-historial a[href*="ejemplo.test/interna"]').count(), 0, 'ni la liga de un evento');
      assert.equal(pedidos.filter((p) => p.recurso === 'ppp2-chat').length, 0);
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('contra el servidor de main (Visor.gs de verdad), liga de equipo: historial, conversación, un PDF de tres partes una tras otra, un HTML que nunca se abre como página y los errores', async () => {
      const { ctx, page, pedidos, errores, vuelo } = await abre(navegador, base, { real: true, audiencia: 'equipo', ancho: 375, alto: 667, dpr: 2 });
      const sinHuecos = async (sel) => assert.doesNotMatch(await page.locator(sel).innerText(), /\bundefined\b|\bNaN\b|\bnull\b|\[object/, sel);
      await pestana(page, 'historial');
      await page.locator('.vzp-dia-on').waitFor({ timeout: 15000 });
      await sinHuecos('#vzpPanel-historial');
      assert.match(await page.locator('#vzpPanel-historial').innerText(), /Reunión con el dueño del terreno[\s\S]*Decisiones: Preparar la versión/);
      assert.doesNotMatch(await page.locator('#vzpPanel-historial').innerText(), /Decisión sólo de Dirección|Pendiente de una decisión de Dirección/);
      // las versiones del libro de prueba no tienen fecha: el botón «versiones» lleva a su lista (no se queda muerto)
      await page.locator('.vzp-res[data-salta="version"]').click();
      await page.waitForFunction(() => {
        const r = document.getElementById('vzpVersiones').getBoundingClientRect(), barra = document.getElementById('vzBarra').getBoundingClientRect().top;
        const alFondo = scrollY >= document.documentElement.scrollHeight - innerHeight - 1;
        return scrollY > 0 && r.top >= 0 && (r.top < innerHeight / 2 || (alFondo && r.top < barra - 40));
      }, null, { timeout: 3000 });
      // la conversación del día: cada captura cabe a la vista y lleva varios mensajes
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('[data-chat]').first().click();
      const hoja = page.locator('.vzp-hoja-chat');
      await hoja.locator('.vzp-captura').first().waitFor();
      await page.waitForTimeout(200);
      const caps = await page.evaluate(() => [...document.querySelectorAll('.vzp-hoja-chat .vzp-captura')].map((c) => { const m = c.querySelector('.vzp-cap-msjs'); return { n: c.querySelectorAll('.vzp-msj').length, cabe: m.scrollHeight <= m.clientHeight + 2 }; }));
      assert.equal(caps.reduce((s, c) => s + c.n, 0), 14, 'los catorce mensajes, una sola vez');
      assert.ok(caps.every((c) => c.cabe), 'cada captura cabe sin desplazarse por dentro: ' + JSON.stringify(caps));
      assert.ok(caps.length <= 6, 'en 375×667, catorce mensajes caben en pocas capturas: ' + caps.length);
      await sinHuecos('.vzp-hoja-chat');
      await page.keyboard.press('Escape');
      await hoja.waitFor({ state: 'detached' });
      // Archivos: el servidor de verdad, sus grupos y lo que no sale
      await pestana(page, 'archivos');
      await page.locator('.vzp-grupo').first().waitFor({ timeout: 15000 });
      await sinHuecos('#vzpPanel-archivos');
      assert.doesNotMatch(await page.locator('#vzpPanel-archivos').innerText(), /Secreto de Dirección/);
      // un PDF de 7 MB: tres partes, desde la 0, una tras otra (nunca dos a la vez), pegadas y dibujadas
      await page.locator('[data-archivo="' + M.A.larga + '"]').click();
      const prev = page.locator('.vzp-hoja-archivo');
      await prev.locator(PDFJS ? '.vzp-pag img' : '.vzp-prev-otro, .vzp-pdf-marco').first().waitFor({ timeout: 30000 });
      assert.deepEqual(pedidos.filter((p) => p.recurso === 'ppp2-archivo' && p.id === M.A.larga).map((p) => p.parte), ['0', '1', '2']);
      assert.equal(vuelo.max, 1, 'las partes se piden de una en una');
      if (PDFJS) assert.equal(await prev.locator('.vzp-pag').count(), 2, 'las dos páginas del PDF, ya pegadas sus tres partes');
      assert.equal(await prev.locator('.vzp-acc[aria-label="Abrir aparte"]').count(), 1);
      await page.keyboard.press('Escape');
      await prev.waitFor({ state: 'detached' });
      // un HTML del expediente: el servidor lo manda sin tipo y la pantalla no lo abre aparte; sólo se guarda
      await page.locator('[data-archivo="' + M.A.pagina + '"]').click();
      const guardar = prev.locator('.vzp-prev-otro a[download]');
      await guardar.waitFor({ timeout: 10000 });
      assert.equal(await prev.locator('.vzp-acc[aria-label="Abrir aparte"]').count(), 0, 'lo que un navegador ejecuta no se ofrece para abrir aparte');
      assert.equal(await guardar.getAttribute('download'), 'Pagina del desarrollo.html');
      assert.equal(await guardar.evaluate((a) => fetch(a.href).then((r) => r.blob()).then((b) => b.type)), 'application/octet-stream', 'se arma como bytes sin tipo');
      assert.equal(await page.evaluate(() => typeof window.HTML_EJECUTADO), 'undefined');
      await page.keyboard.press('Escape');
      await prev.waitFor({ state: 'detached' });
      // un Doc de Google que no se pudo exportar: «grande», sin reintentar
      await page.locator('[data-archivo="' + M.A.enorme + '"]').click();
      await page.getByText('Este archivo no se puede abrir aquí').waitFor({ timeout: 10000 });
      assert.equal(await prev.locator('[data-reintenta]').count(), 0);
      await page.keyboard.press('Escape');
      assert.ok(await sinDesborde(page));
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('contra el servidor de main (Visor.gs de verdad), liga de fuera: sin conversación, pendientes ni fuentes; en Archivos sólo «Para compartir»', async () => {
      const { ctx, page, pedidos, errores } = await abre(navegador, base, { real: true, audiencia: '' });
      await pestana(page, 'historial');
      await page.locator('.vzp-dia-on').waitFor({ timeout: 15000 });
      const t = await page.locator('#vzpPanel-historial').innerText();
      assert.match(t, /Reunión con el dueño del terreno/);
      assert.doesNotMatch(t, /Aviso en el grupo|Levantamiento topográfico|Videollamada|Decisiones:|Pendientes abiertos/);
      assert.equal(await page.locator('[data-chat], #vzpPendientes, .vzp-res[data-salta="pendientes"]').count(), 0);
      await pestana(page, 'archivos');
      await page.locator('.vzp-grupo').first().waitFor({ timeout: 15000 });
      assert.deepEqual(await page.locator('#vzpPanel-archivos .vzp-arch-n b').allInnerTexts(), ['Presentación para el dueño.pdf']);
      await page.locator('[data-archivo="' + M.A.dueno + '"]').click();
      await page.locator('.vzp-hoja-archivo').locator(PDFJS ? '.vzp-pag img' : '.vzp-prev-otro, .vzp-pdf-marco').first().waitFor({ timeout: 20000 });
      assert.equal(pedidos.filter((p) => p.recurso === 'ppp2-chat').length, 0, 'nunca pide la conversación');
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('Archivos: grupos del contrato, imagen dentro de la página, avance real por partes, guardar y los errores con su mensaje', async () => {
      const { ctx, page, pedidos, errores } = await abre(navegador, base, { nuevo: true });
      await pestana(page, 'archivos');
      await page.locator('.vzp-grupo').first().waitFor();
      const grupos = await page.locator('.vzp-grupo .vzp-sec-tit').allInnerTexts();
      assert.deepEqual(grupos.map((g) => g.replace(/\s+\d+$/, '').toLowerCase()), ['presentaciones', 'propuestas', 'modelos financieros', 'terreno y polígonos', 'reuniones y minutas', 'otros']);
      assert.equal(await page.locator('.vzp-arch-no').count(), 1, 'lo que no se puede abrir no es botón');
      // imagen
      await page.locator('[data-archivo="' + D.ARCH.foto + '"]').click();
      await page.locator('.vzp-prev-img img').waitFor();
      assert.ok(await page.locator('.vzp-prev-img img').evaluate((im) => im.complete && im.naturalWidth === 160), 'la imagen se ve');
      const partesFoto = pedidos.filter((p) => p.recurso === 'ppp2-archivo' && p.id === D.ARCH.foto).map((p) => +p.parte);
      assert.ok(partesFoto.length > 1 && partesFoto.every((x, i) => x === i), 'partes ' + partesFoto);
      await page.keyboard.press('Escape');
      await page.locator('.vzp-hoja').waitFor({ state: 'detached' });
      // un archivo que no se ve: queda listo para guardar
      await page.locator('[data-archivo="' + D.ARCH.poligono + '"]').click();
      const guardar = page.locator('.vzp-prev-otro a[download]');
      await guardar.waitFor();
      assert.equal(await guardar.getAttribute('download'), 'Poligono del terreno.kmz', 'se guarda con su nombre, sin acentos, y su extensión');
      const [bajada] = await Promise.all([page.waitForEvent('download'), guardar.click()]);
      assert.equal(bajada.suggestedFilename(), 'Poligono del terreno.kmz');
      await page.locator('.vzp-hoja .vzp-x').click();
      // «grande»: un mensaje claro y sin reintentar
      await page.locator('[data-archivo="' + D.ARCH.grande + '"]').click();
      await page.getByText('Este archivo no se puede abrir aquí').waitFor();
      assert.equal(await page.locator('.vzp-hoja [data-reintenta]').count(), 0);
      await page.keyboard.press('Escape');
      // uno que ya no está en la carpeta
      await page.locator('[data-archivo="' + D.ARCH.ajeno + '"]').click();
      await page.getByText('Este archivo no está disponible en esta liga').waitFor();
      await page.keyboard.press('Escape');
      assert.ok(await sinDesborde(page));
      if (FOTOS) await page.screenshot({ path: path.join(FOTOS, 'visor-pestanas-archivos.png'), fullPage: true });
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('la primera lectura del expediente puede tardar: un esqueleto paciente, sin error por tiempo', async () => {
      const { ctx, page, errores } = await abre(navegador, base, { nuevo: true, demora: { 'ppp2-historial': 6500 } });
      await pestana(page, 'historial');
      await page.getByText('Reuniendo el expediente…').waitFor();
      await page.getByText('La primera vez tarda unos segundos').waitFor({ timeout: 7000 });
      assert.equal(await page.locator('#vzpPanel-historial .vzp-estado').count(), 0, 'no es un error');
      await page.locator('.vzp-dia-on').waitFor({ timeout: 10000 });
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('una falla se puede reintentar y lo que ya se veía no se pierde', async () => {
      const { ctx, page, errores } = await abre(navegador, base, { nuevo: true, error: { 'ppp2-archivos': 'interno' } });
      await pestana(page, 'archivos');
      await page.getByText('No pude abrir los archivos').waitFor();
      assert.equal(await page.locator('.vz-card').count(), 7);
      assert.equal(await page.locator('#vzpPanel-archivos [data-reintenta]').count(), 1);
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('Opciones: dos terrenos con tres versiones, la vigente y la que se ve, «Comparar todas» y tocar una la abre en el plan', async () => {
      const { ctx, page, pedidos, escrituras, errores } = await abre(navegador, base, { nuevo: true, varios: true });
      await pestana(page, 'opciones');
      await page.waitForFunction(() => document.querySelectorAll('.vzp-op').length === 6 && !document.querySelector('.vzp-op-cargando'), null, { timeout: 15000 });
      assert.match(await page.locator('#vzpPanel-opciones').innerText(), /TERRENO GRANDE[\s\S]*3,000 m²[\s\S]*TERRENO CHICO[\s\S]*2,164 m²/i);
      assert.equal(await page.locator('.vzp-op[aria-current="true"]').count(), 1);
      assert.equal(await page.locator('.vzp-comparar').getAttribute('href'), 'visor-comparar.html#l=' + LIGA);
      assert.match(await page.locator('.vzp-comparar').innerText(), /Comparar las 6 opciones/);
      const lecturas = pedidos.filter((p) => p.recurso === 'ppp2-visor');
      assert.ok(lecturas.every((p) => !p.k && (!p.abre || p === lecturas[0])), 'las opciones se leen sin sesión y sin anotar aperturas');
      // tocar la V3 del terreno chico: el plan la enseña
      await page.locator('.vzp-op[data-plan="' + OTRO + '"][data-version="3"]').click();
      await page.locator('#vzpPanel-plan').waitFor({ state: 'visible' });
      await page.locator('.vz-ver', { hasText: 'V3' }).waitFor();
      assert.equal(await page.locator('.vz-chip.vz-on[data-plan="' + OTRO + '"]').count(), 1);
      assert.ok(pedidos.some((p) => p.recurso === 'ppp2-visor' && p.plan === OTRO && p.v === '3'));
      assert.match(page.url(), /#l=liga0+1$/, 'el plan vuelve a la dirección de siempre');
      assert.deepEqual(escrituras, []);
      if (FOTOS) { await pestana(page, 'opciones'); await page.screenshot({ path: path.join(FOTOS, 'visor-pestanas-opciones.png'), fullPage: true }); }
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('Dirección: el punto en «Opciones», el selector de la buena ahí (no arriba del plan) y un solo POST ppp2-elige', async () => {
      /* como el servidor (Visor.gs, eligeDe_): `elige` sólo a quien trae la sesión de quien aprueba */
      const conElige = (j, p) => { if (j.ok && p.k === ADMIN) j.elige = { versiones: [{ v: 'esc-1', nombre: 'Base', buena: false }, { v: 'esc-2', nombre: 'Con banco', buena: true }] }; return j; };
      const { ctx, page, escrituras, errores } = await abre(navegador, base, { nuevo: true, sesion: ADMIN, transforma: conElige });
      await page.locator('#vzpTab-opciones .vzp-tab-punto').waitFor({ state: 'attached' });
      assert.equal(await page.locator('#vzpPanel-plan .vz-elige').count(), 0);
      await pestana(page, 'opciones');
      await page.locator('#vzpPanel-opciones .vz-elige-op').first().waitFor();
      await page.locator('#vzpPanel-opciones .vz-elige-op:not(.vz-buena)').first().click();
      await page.locator('.vz-elige-msg', { hasText: 'Listo: todos ven ahora' }).waitFor({ timeout: 5000 });
      assert.equal(escrituras.length, 1);
      assert.equal(escrituras[0].tipo, 'ppp2-elige');
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('«Deducido: …»: el pie lo avisa, la hoja lleva su chip y la leyenda lo dice', async () => {
      const ded = (j) => { if (j.ok && j.v) { j.origen = 'PPP · motor vertical · caso de prueba'; j.deducido = { 'v.rv_margen': '(ventas − costo con tierra) ÷ costo con tierra' }; } return j; };
      const { ctx, page, errores } = await abre(navegador, base, { transforma: ded, ancho: 1280, alto: 900 });
      await page.locator('.vz-pie-ded').waitFor();
      await page.locator('[data-card="riesgo"]').click();
      const chip = page.locator('#vzModal .vz-ded').first();
      await chip.waitFor();
      assert.equal(await page.locator('#vzModal .vz-ded-txt:not([hidden])').count(), 0);
      await chip.click();
      assert.equal(await chip.getAttribute('aria-expanded'), 'true');
      assert.match(await page.locator('#vzModal .vz-ded-txt').first().innerText(), /^Deducido: \(ventas − costo con tierra\)/);
      const anillo = page.locator('#vzModal .vz-m-fig .vz-t').filter({ has: page.locator('text') }).nth(4);
      await anillo.hover();
      await page.locator('#vzTip .vz-tip-ded').waitFor();
      assert.match(await page.locator('#vzTip').innerText(), /Deducido: /);
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('el primer toque después de bajar una hoja con el dedo no se pierde (cuadros y pestañas)', async () => {
      const { ctx, page, errores } = await abre(navegador, base, { nuevo: true, ancho: 390, alto: 844, dpr: 2 });
      await page.locator('.vz-card').first().waitFor();
      const cdp = await ctx.newCDPSession(page);
      const baja = async (sel) => {
        const h = await page.locator(sel).boundingBox(), x = h.x + 60, y = h.y + 24;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 24 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      const toca = async (sel) => { const b = await page.locator(sel).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + Math.min(b.height / 2, 40)); };
      for (const espera of [40, 300]) {
        await toca('[data-card="terreno"]');
        await page.locator('#vzModal').waitFor({ state: 'visible' });
        await page.waitForTimeout(350);
        await baja('#vzModal .vz-m-head');
        await page.waitForTimeout(espera);
        await toca('[data-card="producto"]');
        await page.waitForFunction(() => document.getElementById('vzModal').getAttribute('data-abierto') === 'producto', null, { timeout: 2000 });
        await page.keyboard.press('Escape');
        await page.locator('#vzModal').waitFor({ state: 'hidden' });
      }
      await page.locator('#vzpTab-archivos').click();
      await page.locator('[data-archivo="' + D.ARCH.foto + '"]').waitFor();
      await toca('[data-archivo="' + D.ARCH.foto + '"]');
      await page.locator('.vzp-prev-img img').waitFor();
      await page.waitForTimeout(350);
      await baja('.vzp-hoja-cab');
      await page.waitForTimeout(60);
      await toca('[data-archivo="' + D.ARCH.poligono + '"]');
      await page.locator('.vzp-hoja-tits h2', { hasText: 'Polígono del terreno.kmz' }).waitFor({ timeout: 3000 });
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('en tres teléfonos y en escritorio: nada se desborda, la barra se toca bien y no tapa el final de cada pestaña', async () => {
      for (const [ancho, alto, dpr] of [[375, 667, 2], [390, 844, 3], [430, 932, 3], [1440, 900, 1]]) {
        const { ctx, page, errores } = await abre(navegador, base, { nuevo: true, ancho, alto, dpr });
        await page.locator('.vz-card').first().waitFor();
        const tabs = await page.evaluate(() => [...document.querySelectorAll('.vzp-tab')].map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }));
        assert.ok(tabs.every(([w, h]) => w >= 44 && h >= 44), ancho + ': cada pestaña mide 44 px o más ' + JSON.stringify(tabs));
        for (const t of ['plan', 'historial', 'archivos', 'opciones']) {
          await pestana(page, t);
          await page.waitForTimeout(t === 'opciones' ? 500 : 250);
          assert.ok(await sinDesborde(page), ancho + ' · ' + t + ': sin desborde lateral');
          const tapado = await page.evaluate((t) => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            const barra = document.getElementById('vzBarra').getBoundingClientRect().top;
            const panel = document.getElementById('vzpPanel-' + t), hijos = [...panel.querySelectorAll('*')].filter((x) => x.offsetParent && x.getBoundingClientRect().height > 0);
            const fondo = Math.max.apply(null, hijos.map((x) => x.getBoundingClientRect().bottom));
            return fondo - barra;
          }, t);
          assert.ok(tapado <= 1, ancho + ' · ' + t + ': lo último queda arriba de la barra (' + tapado + ')');
        }
        if (FOTOS) await page.screenshot({ path: path.join(FOTOS, 'visor-pestanas-' + ancho + '.png') });
        assert.deepEqual(errores, []);
        await ctx.close();
      }
    });

    await caso('si la liga se apaga con una pestaña y una hoja abiertas, todo se cierra y no queda nada del plan', async () => {
      const { w, ctx, page, errores } = await abre(navegador, base, { nuevo: true, ms: 250 });
      await pestana(page, 'historial');
      await page.locator('[data-chat]').first().click();
      await page.locator('.vzp-hoja-chat .vzp-captura').first().waitFor();
      const h = w.vivero.getSheetByName('Ligas'); h.v[1][3] = 'apagada'; w.cache.delete('ligas');
      await page.getByText('Esta liga ya no está activa').waitFor({ timeout: 5000 });
      assert.equal(await page.locator('.vzp-hoja').count(), 0);
      assert.equal(await page.locator('#vzBarra').isVisible(), false);
      assert.equal(await page.locator('#vzpPanel-historial').isVisible(), false);
      assert.doesNotMatch(await page.locator('body').innerText(), /Proyecto Ejemplo|Reunión con el dueño/);
      assert.deepEqual(errores, []);
      await ctx.close();
    });
  } finally {
    await navegador.close();
    s.close();
  }
  console.log('visor con pestañas: ' + n + ' recorridos PASS' + (PDFJS ? ' (con pdf.js)' : ' (pdf.js: respaldo)'));
})().catch((e) => { console.error(e); process.exit(1); });
