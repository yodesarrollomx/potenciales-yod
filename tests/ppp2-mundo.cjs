'use strict';
/* Mundo de prueba de PPP 2: dobles de Apps Script (hojas, caché, Portero, Drive) y el
   servidor real (server/ppp2/PPP2.gs) cargado en un contexto aislado. El libro sale de
   tests/fixtures/ppp2-libro-ejemplo.json (plan INVENTADO). Nada habla con Google. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const RAIZ = path.join(__dirname, '..');
const CODIGO = fs.readFileSync(path.join(RAIZ, 'server/ppp2/PPP2.gs'), 'utf8');
const ACCESORIO = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ppp2-libro-ejemplo.json'), 'utf8'));

/* ── dobles de hoja ── */
function a1(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]), c];
}
/* Idioma del libro: con coma decimal (es-ES y similares) Google Sheets separa los argumentos con «;»
   y una fórmula escrita con comas queda en #ERROR!. El primer libro real vive así. */
function comaFuera(f) {
  let dentro = false;
  for (const ch of String(f)) { if (ch === '"') dentro = !dentro; else if (ch === ',' && !dentro) return true; }
  return false;
}
function aPuntoYComa(f) {
  let dentro = false, out = '';
  for (const ch of String(f)) { if (ch === '"') dentro = !dentro; out += (ch === ',' && !dentro) ? ';' : ch; }
  return out;
}
function moverFilas(f, delta) {
  return String(f).replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, (m, c1, col, r1, fila) => c1 + col + r1 + (r1 ? fila : String(Number(fila) + delta)));
}
class Hoja {
  constructor(nombre, valores, formulas, idioma) {
    this.nombre = nombre;
    this.v = (valores || []).map((r) => r.slice());
    this.f = Object.assign({}, formulas || {});
    this.idioma = idioma || 'coma';
    this.roto = {};
    if (this.idioma === 'puntoycoma') for (const k of Object.keys(this.f)) this.f[k] = aPuntoYComa(this.f[k]);
  }
  vacia(x) { return x === '' || x === null || x === undefined; }
  getLastRow() {
    for (let r = this.v.length; r >= 1; r--) if ((this.v[r - 1] || []).some((x) => !this.vacia(x))) return r;
    return 0;
  }
  ancho() { return this.v.reduce((m, r) => Math.max(m, r.length), 1); }
  asegura(r, c) {
    while (this.v.length < r) this.v.push([]);
    const fila = this.v[r - 1];
    while (fila.length < c) fila.push('');
  }
  getRange(a, b, n, m) {
    if (typeof a === 'string') { const [r, c] = a1(a); return new Rango(this, r, c, 1, 1); }
    return new Rango(this, a, b, n || 1, m || 1);
  }
  getDataRange() { return new Rango(this, 1, 1, Math.max(1, this.getLastRow()), this.ancho()); }
  appendRow(arr) {
    const r = this.getLastRow() + 1;
    this.asegura(r, arr.length);
    arr.forEach((x, i) => { this.v[r - 1][i] = x; delete this.f[r + ',' + (i + 1)]; });
  }
}
class Rango {
  constructor(h, r, c, n, m) { Object.assign(this, { h, r, c, n, m }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.n; i++) {
      const fila = [];
      for (let j = 0; j < this.m; j++) { const x = (this.h.v[this.r + i - 1] || [])[this.c + j - 1]; fila.push(x === undefined || x === null ? '' : x); }
      out.push(fila);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    vals.forEach((fila, i) => fila.forEach((x, j) => {
      this.h.asegura(this.r + i, this.c + j);
      this.h.v[this.r + i - 1][this.c + j - 1] = x;
      delete this.h.f[(this.r + i) + ',' + (this.c + j)];
      delete this.h.roto[(this.r + i) + ',' + (this.c + j)];
    }));
    return this;
  }
  setValue(x) { return this.setValues([[x]]); }
  getFormula() { return this.h.f[this.r + ',' + this.c] || ''; }
  setFormula(f) {
    const k = this.r + ',' + this.c;
    this.h.asegura(this.r, this.c);
    this.h.f[k] = f;
    if (this.h.idioma === 'puntoycoma' && comaFuera(f)) this.h.roto[k] = true; else delete this.h.roto[k];
    return this;
  }
  getDisplayValue() { return this.h.roto[this.r + ',' + this.c] ? '#ERROR!' : String(this.getValue()); }
  getFormulas() { return this.getValues().map((fila, i) => fila.map((x, j) => this.h.f[(this.r + i) + ',' + (this.c + j)] || '')); }
  getDisplayValues() { return this.getValues().map((fila, i) => fila.map((x, j) => (this.h.roto[(this.r + i) + ',' + (this.c + j)] ? '#ERROR!' : String(x)))); }
  copyTo(destino) {
    const f = this.getFormula();
    if (f) destino.setFormula(moverFilas(f, destino.r - this.r)); else destino.setValue(this.getValue());
    return destino;
  }
}
class Libro {
  constructor(hojas) { this.hojas = hojas; }
  getSheetByName(n) { return this.hojas[n] || null; }
  insertSheet(n) { this.hojas[n] = new Hoja(n, []); return this.hojas[n]; }
}
function libroDeAccesorio(idioma) {
  const hojas = {};
  for (const [nombre, d] of Object.entries(ACCESORIO)) hojas[nombre] = new Hoja(nombre, d.valores, d.formulas, idioma);
  return new Libro(hojas);
}

/* ── el mundo de cada prueba ── */
const PLAN = 'p2ejemplo001';
const SESIONES = {
  syadmin00000000000000000: { ok: true, rol: 'admin', boards: '*', nombre: 'Admin Prueba', correo: 'admin@ejemplo.mx' },
  syeditor0000000000000000: { ok: true, rol: 'editor', boards: 'PT,MK', nombre: 'Editora Prueba', correo: 'editora@ejemplo.mx' },
  sylector0000000000000000: { ok: true, rol: '', boards: ['PT'], nombre: 'Lector Prueba', correo: 'lector@ejemplo.mx' },
  syotroboard0000000000000: { ok: true, rol: '', boards: 'MK', nombre: 'Sin PT', correo: 'otro@ejemplo.mx' }
};
function mundo(opciones) {
  const op = opciones || {};
  const libros = { 'libro-ejemplo': libroDeAccesorio(op.idioma), 'libro-plantilla': libroDeAccesorio(op.idioma) };
  let flushes = 0;
  const vivero = new Libro({
    Planes: new Hoja('Planes', [
      ['plan_id', 'nombre', 'libro_id', 'estado', 'creado', 'creado_por', 'caso_ppp', 'plantilla', 'nota'],
      [PLAN, 'Proyecto Ejemplo', 'libro-ejemplo', 'activo', '2026-01-15', 'Pruebas', '', 'ppp2-libro-v1', '']
    ]),
    Config: new Hoja('Config', [
      ['clave', 'valor'], ['plantilla_id', 'libro-plantilla'], ['carpeta_id', 'carpeta'],
      ['portero_original', 'https://script.google.com/macros/s/ORIGINAL123/exec'],
      ['portero_respaldo', 'https://script.google.com/macros/s/RESPALDO456/exec'],
      ['board', 'PT'], ['roles_aprobar', 'admin'], ['roles_editar', 'admin,editor'], ['pausa', op.pausa || 'no']
    ]),
    'Bitácora': new Hoja('Bitácora', [['fecha', 'actor', 'accion', 'plan_id', 'detalle', 'request_id', 'resultado', 'nota']])
  });
  const llamadas = [];
  const cache = new Map();
  let copias = 0;
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => vivero,
      openById: (id) => { if (!libros[id]) throw new Error('no existe ' + id); return libros[id]; },
      flush: () => { flushes++; if (op.alFlush) op.alFlush(flushes, libros['libro-ejemplo']); },
      CopyPasteType: { PASTE_FORMULA: 'PASTE_FORMULA' }
    },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    UrlFetchApp: {
      fetch: (url) => {
        llamadas.push(url);
        const t = decodeURIComponent((/[?&]t=([^&]+)/.exec(url) || [])[1] || '');
        if (op.originalCaido && url.includes('ORIGINAL123')) return { getResponseCode: () => 503, getContentText: () => 'caído' };
        const r = SESIONES[t] || { ok: false, error: 'liga' };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(r) };
      }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ contenido: s, setMimeType() { return this; } }) },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        if (op.fechasReales && Object.prototype.toString.call(d) === '[object Date]') {
          const p2 = (n) => String(n).padStart(2, '0'), f = d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()), h = p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
          return fmt === 'yyyy-MM-dd' ? f : fmt === 'HH:mm' ? h : f + ' ' + h;
        }
        return fmt === 'yyyy-MM-dd' ? '2026-11-12' : fmt === 'HH:mm' ? '10:00' : '2026-11-12 10:00';
      },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64url'),
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }
    },
    DriveApp: {
      getFileById: (id) => ({
        makeCopy: () => { const nuevo = 'libro-copia-' + (++copias); libros[nuevo] = libroDeAccesorio(); return { getId: () => nuevo }; }
      }),
      getFolderById: () => ({})
    },
    Logger: { log: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(CODIGO, ctx, { filename: 'PPP2.gs' });
  const get = (p) => JSON.parse(ctx.doGet({ parameter: p }).contenido);
  const post = (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).contenido);
  return { ctx, libros, vivero, llamadas, get, post, libro: libros['libro-ejemplo'] };
}
const ADMIN = 'syadmin00000000000000000';
const EDITOR = 'syeditor0000000000000000';
const LECTOR = 'sylector0000000000000000';

function filaDe(hoja, clave) {
  return hoja.v.findIndex((r) => String(r[0]).trim() === clave) + 1;
}

module.exports = { mundo, PLAN, ADMIN, EDITOR, LECTOR, filaDe, CODIGO };
