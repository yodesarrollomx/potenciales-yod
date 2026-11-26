'use strict';
/* Pantalla y servidor reales sobre un libro y una sesión de prueba. Todo el tráfico queda en Playwright. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { entorno, RAIZ, Servidor } = require('./arbol-ppp-servidor-mundo.cjs');
const { EDITOR } = require('./ppp2-mundo.cjs');
const URL_LOCAL = 'http://arbol.test';
const MAESTRO = entorno({}, 30).w;
const PROYECTO = 'Predio de prueba';
const FICHA = 'https://example.com/comparativo#range=B3:B6';
const VERSION = 'Prueba de costo';

function copia(nombre, version, id) {
  const r = MAESTRO.post({ tipo: 'arbol-guarda', k: EDITOR, request_id: id, nombre, version,
    columna: [{ id: 'T-01', valor: 1500 }, { id: 'E-04', valor: 1000 }, { id: 'C-01', valor: 11000 }, { id: 'I-07', valor: 'Ficha de prueba · ' + FICHA }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.columna;
}
const trae = (columna) => JSON.parse(JSON.stringify(MAESTRO.get({ recurso: 'arbol-columna', k: EDITOR, columna })));
const costo = (r) => r.valores.find((x) => x.id === 'C-01').valor;
const BASES = ['Alternativa A', 'Alternativa B', 'Alternativa C'].map((v, i) => copia(PROYECTO, v, 'base-' + i));
copia('Otro predio', 'Alternativa A', 'otro');
const ANTES = BASES.map(trae);

async function intercepta(route) {
  const u = new URL(route.request().url());
  if (u.origin === URL_LOCAL) {
    if (u.pathname === '/portero.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (!/^\/arbol-ppp\/(?:conexion\/)?[\w.-]+\.(?:html|js|css)$/.test(u.pathname)) return route.abort();
    const tipo = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(u.pathname)];
    return route.fulfill({ contentType: tipo + '; charset=utf-8', body: await fs.readFile(path.join(RAIZ, u.pathname)) });
  }
  if (u.origin + u.pathname !== Servidor.ENDPOINT) return route.abort();
  const r = route.request().method() === 'POST' ? MAESTRO.post(route.request().postDataJSON()) : MAESTRO.get(Object.fromEntries(u.searchParams));
  return route.fulfill({ json: r, headers: { 'access-control-allow-origin': '*' } });
}
const boton = (p, nombre) => p.getByRole('button', { name: nombre, exact: true });
const fila = (p, col) => p.locator('[data-as="abre"][data-col="' + col + '"]');
const estado = (p, mensaje) => p.locator('.as-msg').filter({ hasText: mensaje }).waitFor();
async function opciones(p, columnas) {
  await fila(p, columnas.at(-1)).waitFor();
  assert.deepEqual(await p.locator('[data-as="abre"]').evaluateAll((bs) => bs.map((b) => b.dataset.col)), columnas);
}
async function abre(p, col) {
  await fila(p, col).click();
  await fila(p, col).click();
  await estado(p, 'columna ' + col);
}

async function prueba() {
  const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 930 } });
    await ctx.addInitScript((k) => localStorage.setItem('pyod_clave_v1', k), EDITOR);
    await ctx.route('**/*', intercepta);
    const errores = [];
    const nuevaPagina = async (hash = '') => {
      const p = await ctx.newPage(); p.on('pageerror', (e) => errores.push(e.message));
      await p.goto(URL_LOCAL + '/arbol-ppp/arbol.html' + hash);
      return p;
    };
    let p = await nuevaPagina('#abrir=' + BASES[0]);
    await fila(p, BASES[0]).or(boton(p, 'Versiones del proyecto')).first().waitFor();
    if (await fila(p, BASES[0]).count()) await fila(p, BASES[0]).click();
    await estado(p, 'columna L');
    assert.equal(BASES[0], 'L');
    const claves = Servidor.CLAVES;
    const tamLocal = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)).plan.valores['T-01'].valor, claves.plan);
    assert.equal(await tamLocal(), 1500);
    await p.evaluate(({ plan, origen }) => {
      if (JSON.parse(localStorage.getItem(origen)).columna !== 'L') throw new Error('Se esperaba origen L');
      const local = JSON.parse(localStorage.getItem(plan));
      local.plan.valores = { 'T-01': { estado: 'confirmado', valor: 7350, fuente: 'dato de muestra' } };
      localStorage.setItem(plan, JSON.stringify(local));
    }, claves);
    await p.close();
    p = await nuevaPagina('#abrir=L');
    await fila(p, 'L').or(p.locator('.as-msg').filter({ hasText: 'Abrí «' })).first().waitFor();
    assert.equal(await tamLocal(), 7350, 'La liga debe conservar la edición local hasta confirmar');
    assert.match(await fila(p, 'L').innerText(), /Toca otra vez para abrir/);
    await fila(p, 'L').click();
    await estado(p, 'columna L');
    assert.equal(await tamLocal(), 1500);
    await p.close();
    p = await nuevaPagina('#abrir=L');
    await estado(p, 'Abrí «');
    await boton(p, 'Versiones del proyecto').click();
    await opciones(p, BASES);
    await boton(p, 'Agregar versión').click();
    await p.getByLabel('Nombre de la nueva versión').fill(VERSION);
    await boton(p, 'Crear versión').click();
    await estado(p, 'Creé «' + VERSION);
    const nueva = MAESTRO.get({ recurso: 'arbol-columnas', k: EDITOR }).columnas.find((c) => c.version === VERSION).columna;
    const columnas = [...BASES, nueva];
    await opciones(p, columnas);
    assert.equal(await fila(p, nueva).getAttribute('aria-current'), 'true');
    assert.equal(costo(trae(nueva)), 11000);
    await boton(p, 'Cerrar').click();
    await p.locator('.tarj[data-t="Costo y ganancia"]').click();
    await p.locator('.vp-menu button[data-ir="C-01"]').click();
    const campo = p.locator('[data-edit="C-01"] input[data-k="campo"]');
    await campo.fill('11100');
    await campo.press('Enter');
    await boton(p, 'Guardar en el libro').click();
    await p.locator('[data-as="sobre"]').click();
    await p.locator('[data-as="sobre"]').click();
    await estado(p, 'Guardado como Borrador');
    assert.equal(costo(trae(nueva)), 11100);
    assert.deepEqual(BASES.map(trae), ANTES);
    await p.close();
    p = await nuevaPagina();
    await p.setViewportSize({ width: 390, height: 844 });
    await boton(p, 'Versiones del proyecto').click();
    await opciones(p, columnas);
    await abre(p, BASES[1]);
    assert.equal(await p.locator('[data-panel]').isVisible(), false);
    const detalle = p.locator('.as-detalle');
    assert.equal(await detalle.locator('a').isVisible(), false);
    await detalle.locator('summary').click();
    assert.equal(await detalle.getByRole('link').getAttribute('href'), FICHA);
    await detalle.locator('summary').click();
    const acciones = await p.locator('.as-fila .as-btn').evaluateAll((bs) => bs.map(b => b.offsetTop));
    assert.equal(new Set(acciones).size, 1, 'Las cuatro acciones caben en una fila');
    await boton(p, 'Ver en lista').click();
    assert.equal(await p.locator('[data-panel]').isVisible(), true);
    await boton(p, 'Cerrar el panel').click();
    assert.equal(await p.locator('[data-panel]').isVisible(), false);
    await boton(p, 'Versiones del proyecto').click();
    await abre(p, nueva);
    await boton(p, 'Versiones del proyecto').click();
    await opciones(p, columnas);
    const ficha = fila(p, nueva).locator('..').getByRole('link');
    assert.equal(await ficha.getAttribute('href'), FICHA);
    await p.waitForFunction(() => [...document.querySelectorAll('.as-panel [data-as=abre], .as-panel .as-procedencia a')].every((e) => {
      const r = e.getBoundingClientRect();
      return [0.1, 0.5, 0.9].every((x) => e.contains(document.elementFromPoint(r.x + r.width * x, r.y + r.height / 2)));
    }));
    assert.deepEqual(errores, []);
    console.log('Árbol PPP: cuatro versiones, edición aislada, reapertura y fuente accesible a 390 px.');
  } finally { await browser.close(); }
}
prueba().catch((e) => { console.error(e); process.exitCode = 1; });
