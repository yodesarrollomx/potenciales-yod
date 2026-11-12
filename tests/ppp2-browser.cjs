'use strict';
/* Recorridos reales del DOM de ppp2.html con el servidor de PPP 2 corriendo en dobles
   (tests/ppp2-mundo.cjs) y un plan INVENTADO. No sale a la red: el marco de YOD OS,
   el Portero y las fuentes se sustituyen por vacíos. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { mundo, ADMIN, EDITOR, LECTOR, PLAN, filaDe } = require('./ppp2-mundo.cjs');

const RAIZ = path.join(__dirname, '..');
const FOTOS = process.env.PPP_SCREENSHOTS || '';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const ENDPOINT = 'https://script.google.com/macros/s/PRUEBA/exec';

function servidor() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const archivo = path.join(RAIZ, ruta === '/' ? 'ppp2.html' : ruta);
      if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
      res.end(fs.readFileSync(archivo));
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

async function pagina(navegador, base, w, llave, opciones) {
  const op = opciones || {};
  const ctx = await navegador.newContext({ viewport: op.movil ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const posts = [];
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(base)) {
      if (/\/portero\.js/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      return route.continue();
    }
    if (url.startsWith(ENDPOINT)) {
      let cuerpo;
      if (req.method() === 'POST') {
        const b = JSON.parse(req.postData() || '{}');
        posts.push(b);
        cuerpo = w.ctx.doPost({ postData: { contents: JSON.stringify(b) } }).contenido;
      } else {
        const p = Object.fromEntries(new URL(url).searchParams);
        cuerpo = w.ctx.doGet({ parameter: p }).contenido;
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: cuerpo });
    }
    const vacio = /\.css(\?|$)/.test(url) ? 'text/css' : 'text/javascript';
    return route.fulfill({ status: 200, contentType: vacio, body: '' });
  });
  await ctx.addInitScript(([llaveSesion, ep]) => {
    if (llaveSesion !== null) localStorage.setItem('pyod_clave_v1', llaveSesion);
    if (ep) window.PPP2_ENDPOINT = ep;
  }, [llave === undefined ? null : llave, op.sinServidor ? '' : ENDPOINT]);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto(base + '/ppp2.html' + (op.hash || ''));
  return { ctx, page, posts, errores };
}

async function sinDesborde(page, donde) {
  const d = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth }));
  assert.ok(d.ancho <= d.vista + 1, donde + ': la página se desborda a lo ancho (' + d.ancho + ' > ' + d.vista + ')');
}
async function foto(page, nombre) {
  if (!FOTOS) return;
  fs.mkdirSync(FOTOS, { recursive: true });
  await page.screenshot({ path: path.join(FOTOS, nombre + '.png'), fullPage: true });
}

(async () => {
  const s = await servidor();
  const base = 'http://127.0.0.1:' + s.address().port;
  const navegador = await chromium.launch();
  let fallos = 0;
  const caso = async (nombre, fn) => {
    try { await fn(); console.log('ok · ' + nombre); } catch (e) { fallos++; console.error('FALLA · ' + nombre + '\n  ' + (e && e.stack || e)); }
  };
  try {
    await caso('sin servidor instalado la página lo dice y no pide nada', async () => {
      const w = mundo();
      const { page, ctx, errores } = await pagina(navegador, base, w, EDITOR, { sinServidor: true });
      await page.getByText('El servidor de PPP 2 aún no está instalado').waitFor();
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('sin sesión pide entrar y no llama al servidor', async () => {
      const w = mundo();
      const { page, ctx } = await pagina(navegador, base, w, undefined);
      await page.getByText('Entra para ver el vivero').waitFor();
      assert.equal(w.llamadas.length, 0);
      await ctx.close();
    });

    await caso('una sesión rechazada avisa y no borra la credencial', async () => {
      const w = mundo();
      const { page, ctx } = await pagina(navegador, base, w, 'syinvalida000000000000000');
      await page.getByText('Tu sesión ya no sirve aquí').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('pyod_clave_v1')), 'syinvalida000000000000000');
      await ctx.close();
    });

    await caso('el vivero muestra lo que recibe el dueño y lleva al plan', async () => {
      const w = mundo();
      const { page, ctx, errores } = await pagina(navegador, base, w, EDITOR);
      await page.getByRole('heading', { name: 'El vivero' }).waitFor();
      const tarjeta = page.locator('a.p2-tarjeta', { hasText: 'Proyecto Ejemplo' });
      await tarjeta.waitFor();
      const viv = JSON.parse(w.ctx.doGet({ parameter: { recurso: 'ppp2-vivero', k: EDITOR } }).contenido).planes[0];
      const esperado = viv.dueno_recibe.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      assert.match(await tarjeta.innerText(), new RegExp(esperado.replace('.', '\\.') + ' MDP'));
      await page.getByRole('button', { name: /Sembrar un plan/ }).waitFor();
      await foto(page, 'ppp2-vivero');
      await tarjeta.click();
      await page.locator('.p2-recibe .p2-cifra').waitFor();
      assert.equal((await page.locator('.p2-recibe .p2-cifra').innerText()).replace(/\s+/g, ''), esperado + 'MDP');
      assert.equal(await page.locator('.p2-vbtn').count(), 3);
      assert.ok(await page.locator('.p2-grafica svg path').count() >= 2, 'dibuja la gráfica del dinero');
      await foto(page, 'ppp2-plan');
      await page.locator('.p2-vbtn[data-v="1"]').click();
      const v1 = JSON.parse(w.ctx.doGet({ parameter: { recurso: 'ppp2-plan', plan: PLAN, k: EDITOR } }).contenido).versiones[0];
      const esperadoV1 = v1.dueno_recibe.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      assert.equal((await page.locator('.p2-recibe .p2-cifra').innerText()).replace(/\s+/g, ''), esperadoV1 + 'MDP');
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('«No se sabe» y una palanca se guardan en el libro con la revisión vigente', async () => {
      const w = mundo();
      const { page, ctx, posts } = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN + '/preguntas' });
      await page.locator('.p2-pregunta').waitFor();
      const id = await page.locator('.p2-pregunta [data-accion="nose"]').getAttribute('data-q');
      await page.locator('.p2-pregunta [data-accion="nose"]').click();
      await page.getByText('Anotado: no se sabe todavía.').waitFor();
      const pq = w.libro.getSheetByName('Preguntas');
      assert.equal(pq.v[filaDe(pq, id) - 1][6], 'no se sabe');
      assert.equal(posts[0].tipo, 'ppp2-responder');
      assert.equal(posts[0].rev, 1);
      await page.locator('.p2-pestanas a', { hasText: 'Versiones y reparto' }).click();
      const campo = page.locator('input[data-palanca="obra_inicio"][data-v="3"]');
      await campo.waitFor();
      await campo.fill('10');
      await campo.press('Tab');
      await page.waitForFunction(() => document.querySelector('.p2-toast') && /recalcul/.test(document.querySelector('.p2-toast').textContent));
      const mod = w.libro.getSheetByName('Modelo');
      assert.equal(mod.v[filaDe(mod, 'obra_inicio') - 1][6], 10);
      assert.equal(posts[1].rev, 2, 'la segunda escritura lleva la revisión nueva');
      await ctx.close();
    });

    await caso('sólo Dirección ve «Aprobar» y al aprobar queda vigente con su nombre', async () => {
      const w = mundo();
      let r = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-recibe').waitFor();
      assert.equal(await r.page.locator('[data-accion="aprobar"]').count(), 0);
      await r.ctx.close();
      r = await pagina(navegador, base, w, ADMIN, { hash: '#/plan/' + PLAN });
      await r.page.getByRole('button', { name: /Aprobar esta versión/ }).click();
      await r.page.getByRole('button', { name: 'Sí, aprobar' }).click();
      await r.page.getByText('Versión vigente aprobada.').waitFor();
      const ver = w.libro.getSheetByName('Versiones');
      assert.equal(ver.v[filaDe(ver, 'estado') - 1][3], 'vigente');
      assert.equal(ver.v[filaDe(ver, 'aprobada_por') - 1][3], 'Admin Prueba');
      await r.ctx.close();
    });

    await caso('quien sólo lee no ve controles de edición', async () => {
      const w = mundo();
      const { page, ctx } = await pagina(navegador, base, w, LECTOR);
      await page.locator('a.p2-tarjeta').waitFor();
      assert.equal(await page.getByRole('button', { name: /Sembrar/ }).count(), 0);
      await page.locator('a.p2-tarjeta').click();
      await page.locator('.p2-recibe').waitFor();
      assert.equal(await page.locator('input[data-palanca]').count(), 0);
      await page.locator('.p2-pestanas a', { hasText: 'Preguntas' }).click();
      await page.locator('.p2-pregunta').waitFor();
      assert.equal(await page.locator('[data-accion="responder"], [data-accion="editar-dato"]').count(), 0);
      await ctx.close();
    });

    await caso('en teléfono nada se desborda a lo ancho', async () => {
      const w = mundo();
      const { page, ctx } = await pagina(navegador, base, w, EDITOR, { movil: true });
      await page.locator('a.p2-tarjeta').waitFor();
      await sinDesborde(page, 'vivero');
      await foto(page, 'ppp2-vivero-movil');
      for (const pest of ['versiones', 'preguntas', 'auton', 'bitacora']) {
        await page.evaluate((h) => { location.hash = h; }, '#/plan/' + PLAN + '/' + pest);
        await page.locator('.p2-pestanas a[aria-current="page"]').waitFor();
        await page.waitForTimeout(150);
        await sinDesborde(page, 'plan · ' + pest);
        await foto(page, 'ppp2-movil-' + pest);
      }
      await ctx.close();
    });

    await caso('la página publicada no lleva datos de planes reales', async () => {
      for (const f of ['ppp2.html', 'ppp2.js', 'ppp2.css']) {
        const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
        assert.doesNotMatch(t, /Mor[eé]o|Avermont|Morelos|@aurumarquitectos/i, f);
      }
    });
  } finally {
    await navegador.close();
    s.close();
  }
  if (fallos) { console.error(fallos + ' recorrido(s) fallaron'); process.exit(1); }
  console.log('PPP 2 · recorridos del navegador en verde');
})();
