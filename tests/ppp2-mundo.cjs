'use strict';
/* Mundo de prueba de PPP 2: dobles de Apps Script (hojas, caché, Portero, Drive) y el
   servidor real (server/ppp2/PPP2.gs) cargado en un contexto aislado. El libro sale de
   tests/fixtures/ppp2-libro-ejemplo.json (plan INVENTADO). Nada habla con Google. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const RAIZ = path.join(__dirname, '..');
/* El proyecto de Apps Script tiene dos archivos y comparten ámbito, como aquí. */
const CODIGO = ['server/ppp2/PPP2.gs', 'server/ppp2/Visor.gs'].map((f) => fs.readFileSync(path.join(RAIZ, f), 'utf8')).join('\n');
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
  getLastColumn() { return this.getLastRow() ? this.ancho() : 0; }
  getMaxColumns() { return Math.max(26, this.ancho()); }
  insertColumnsAfter() { return this; }
  /* La cuadrícula tiene tope (en Sheets, 1000 renglones al nacer): getRange no la agranda y escribir fuera truena;
     appendRow sí agrega renglones. `tope` sólo se fija en las pruebas que lo necesitan. */
  getMaxRows() { return this.tope || Math.max(1000, this.v.length); }
  insertRowsAfter(desde, n) { if (this.tope) this.tope += n; return this; }
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
    if (this.tope && r > this.tope) this.tope = r;
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
    if (this.h.tope && this.r + vals.length - 1 > this.h.tope) throw new Error('Those rows are out of bounds.');
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
    // lo único que este mundo «recalcula»: una celda que copia la columna Datos (=$D8) toma su valor
    const m = /^=\$D(\d+)$/.exec(f);
    if (m) this.h.v[this.r - 1][this.c - 1] = (this.h.v[Number(m[1]) - 1] || [])[3];
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
  constructor(hojas, id) { this.hojas = hojas; this.id = id || ''; }
  getId() { return this.id; }
  getSheetByName(n) { return this.hojas[n] || null; }
  insertSheet(n) { this.hojas[n] = new Hoja(n, []); return this.hojas[n]; }
}
function libroDeAccesorio(idioma, id) {
  const hojas = {};
  for (const [nombre, d] of Object.entries(ACCESORIO)) if (nombre.charAt(0) !== '_') hojas[nombre] = new Hoja(nombre, d.valores, d.formulas, idioma);
  return new Libro(hojas, id);
}
/* «Última modificación» de un libro como la da Drive: cambia con CUALQUIER cambio de su contenido, también los
   que las pruebas hacen a mano (como una persona que edita la hoja). Aquí sale de una huella del contenido. */
function ultimoCambio(libro) {
  const h = crypto.createHash('sha256');
  for (const [n, hj] of Object.entries(libro.hojas)) h.update(n).update(JSON.stringify(hj.v)).update(JSON.stringify(hj.f)).update(JSON.stringify(hj.roto));
  return new Date(1.7e12 + parseInt(h.digest('hex').slice(0, 8), 16));
}
/* Blob de Apps Script con lo que usa el servidor: bytes con signo (como Java), texto en UTF-8. */
class Blob {
  constructor(buf, tipo) { this.buf = Buffer.from(buf); this.tipo = tipo || ''; }
  getBytes() { return Array.from(this.buf, (b) => (b > 127 ? b - 256 : b)); }
  getDataAsString() { return this.buf.toString('utf8'); }
}
const bytes = (xs) => Buffer.from(Array.from(xs, (b) => b & 255));

/* ── el mundo de cada prueba ── */
const PLAN = 'p2ejemplo001';
/* El otro libro («YOD - POTENCIALES» de mentira) con la pestaña de fotos del PPP 1 (PPP_VISOR). Su id llega por
   Config (`potenciales_id`); `op.fotos` trae sus renglones (sin `op.fotos` ese libro no existe). */
const POTENCIALES = 'potenciales00000000000001';
const FOTO_CAB = ['caso_id', 'tipo', 'escenario_id', 'escenario_nombre', 'estado', 'elegida', 'elegida_por', 'elegida_fecha', 'orden',
  'motor_commit', 'huella_entradas', 'calculado', 'origen', 'conciliacion', 'visor_json'];
/* La hoja de historial de mentira (pestañas Proyectos, Eventos, Pendientes y Chat). Su id llega por Config
   (`historial_id`); `op.historial` trae sus pestañas como { nombre: [encabezado, ...renglones] }. */
const HISTORIAL = 'historial00000000000000000001';
/* Drive de mentira para las pestañas del visor: `op.drive` = { carpetas: {id: {nombre, padres, papelera}},
   archivos: {id: {nombre, tipo, padres, tamano, fecha, contenido, papelera, exporta}} }. `exporta` (bytes del PDF
   o 'falla') es para los archivos de Google; un archivo sin `contenido` tiene `tamano` bytes de relleno. */
const TOKEN_DRIVE = 'token-de-prueba';
const SESIONES = {
  syadmin00000000000000000: { ok: true, rol: 'admin', boards: '*', nombre: 'Admin Prueba', correo: 'admin@ejemplo.mx' },
  syeditor0000000000000000: { ok: true, rol: 'editor', boards: 'PT,MK', nombre: 'Editora Prueba', correo: 'editora@ejemplo.mx' },
  sylector0000000000000000: { ok: true, rol: '', boards: ['PT'], nombre: 'Lector Prueba', correo: 'lector@ejemplo.mx' },
  syotroboard0000000000000: { ok: true, rol: '', boards: 'MK', nombre: 'Sin PT', correo: 'otro@ejemplo.mx' }
};
function mundo(opciones) {
  const op = opciones || {};
  const libros = { 'libro-ejemplo': libroDeAccesorio(op.idioma, 'libro-ejemplo'), 'libro-plantilla': libroDeAccesorio(op.idioma, 'libro-plantilla') };
  if (op.fotos) libros[POTENCIALES] = new Libro(op.sinPestanaFotos ? {} : { PPP_VISOR: new Hoja('PPP_VISOR', [FOTO_CAB].concat(op.fotos)) }, POTENCIALES);
  if (op.historial) libros[HISTORIAL] = new Libro(Object.fromEntries(Object.entries(op.historial).map(([n, filas]) => [n, new Hoja(n, filas)])), HISTORIAL);
  const drive = { carpetas: (op.drive && op.drive.carpetas) || {}, archivos: (op.drive && op.drive.archivos) || {} };
  const driveVistas = [];        // carpetas cuyo contenido pidió el servidor (recorrerlas es lo que tarda)
  const drivePedidos = [];       // pedidos a la API de Drive (trozos de un archivo)
  const driveBlobs = [];         // archivos que el servidor leyó enteros con getBlob
  const contenidoDe = (a) => {
    if (a._buf) return a._buf;
    if (a.contenido !== undefined) a._buf = Buffer.isBuffer(a.contenido) ? a.contenido : Buffer.from(String(a.contenido), 'utf8');
    else { a._buf = Buffer.alloc(a.tamano || 0); for (let i = 0; i < a._buf.length; i++) a._buf[i] = (i * 7 + 3) % 251; }
    return a._buf;
  };
  const iterador = (xs) => { let i = 0; return { hasNext: () => i < xs.length, next: () => xs[i++] }; };
  const padresDe = (x) => iterador((x.padres || []).filter((p) => drive.carpetas[p]).map((p) => carpetaDoble(p)));
  function carpetaDoble(id) {
    const c = drive.carpetas[id];
    return {
      getId: () => id, getName: () => c.nombre, getMimeType: () => 'application/vnd.google-apps.folder', isTrashed: () => !!c.papelera, getParents: () => padresDe(c),
      getFiles: () => { driveVistas.push(id); return iterador(Object.keys(drive.archivos).filter((k) => (drive.archivos[k].padres || []).includes(id)).map((k) => archivoDoble(k))); },
      getFolders: () => iterador(Object.keys(drive.carpetas).filter((k) => (drive.carpetas[k].padres || []).includes(id)).map((k) => carpetaDoble(k)))
    };
  }
  function archivoDoble(id) {
    const a = drive.archivos[id];
    return {
      getId: () => id, getName: () => a.nombre, getMimeType: () => a.tipo || 'application/octet-stream', isTrashed: () => !!a.papelera, getParents: () => padresDe(a),
      getSize: () => (a.tamano !== undefined ? a.tamano : contenidoDe(a).length),
      getLastUpdated: () => new Date(a.fecha || '2026-11-01T10:00:00Z'),
      getBlob: () => { driveBlobs.push(id); return new Blob(contenidoDe(a), a.tipo); },
      getAs: (mime) => {
        if (mime !== 'application/pdf' || !String(a.tipo).startsWith('application/vnd.google-apps.')) throw new Error('no se puede exportar');
        if (a.exporta === 'falla') throw new Error('Exceeded maximum export size');
        if (typeof a.exporta === 'number' && a.exporta > 40 * 1024 * 1024) return { getBytes: () => ({ length: a.exporta }) };   // sin apartar 40 MB de verdad
        const base = Buffer.from('%PDF-1.4 exportado de ' + a.nombre + '\n', 'utf8'), n = typeof a.exporta === 'number' ? a.exporta : base.length;
        return new Blob(n > base.length ? Buffer.concat([base, Buffer.alloc(n - base.length, 32)]) : base, 'application/pdf');
      }
    };
  }
  const aperturas = {};          // cuántas veces el servidor abrió cada libro (leerlo es lo que tarda)
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
    ].concat(op.config || [])),
    'Bitácora': new Hoja('Bitácora', [['fecha', 'actor', 'accion', 'plan_id', 'detalle', 'request_id', 'resultado', 'nota']])
  });
  if (op.ligas) vivero.hojas.Ligas = new Hoja('Ligas', [op.ligasCab || ['liga', 'plan_id', 'para', 'estado', 'vence', 'versiones', 'etiquetas', 'creada', 'nota']].concat(op.ligas));
  if (op.aperturas) vivero.hojas.Aperturas = new Hoja('Aperturas', [['fecha', 'liga', 'para', 'plan_id', 'equipo']]);
  const llamadas = [];
  const revocados = new Set();   // sesiones que el Portero dejó de aceptar a media prueba
  const iaPedidos = [];          // lo que el servidor le pidió a la API de IA (op.ia contesta; sin op.ia, la API «no está»)
  const cache = new Map();
  const propiedades = new Map();
  let copias = 0;
  const respuestaIA = (url, params) => {
    const cuerpo = JSON.parse(params.payload);
    iaPedidos.push({ url, headers: params.headers || {}, cuerpo, crudo: params.payload });
    const r = op.ia ? op.ia({ url, headers: params.headers || {}, cuerpo, n: iaPedidos.length }) : { codigo: 503, cuerpo: 'sin API' };
    if (r === 'truena') throw new Error('Timeout: ' + url);
    return { getResponseCode: () => r.codigo || 200, getContentText: () => (typeof r.cuerpo === 'string' ? r.cuerpo : JSON.stringify(r.cuerpo)) };
  };
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => vivero,
      openById: (id) => { if (!libros[id]) throw new Error('no existe ' + id); aperturas[id] = (aperturas[id] || 0) + 1; return libros[id]; },
      flush: () => { flushes++; if (op.alFlush) op.alFlush(flushes, libros['libro-ejemplo']); },
      CopyPasteType: { PASTE_FORMULA: 'PASTE_FORMULA' }
    },
    /* Como CacheService: valores de texto de hasta 100 KB (más truena) y llaves de hasta 250 caracteres. */
    CacheService: { getScriptCache: () => {
      const pon = (k, v) => {
        if (typeof v !== 'string') throw new Error('CacheService guarda texto');
        if (String(k).length > 250) throw new Error('Argument too large: key');
        if (Buffer.byteLength(v, 'utf8') > 100 * 1024) throw new Error('Argument too large: value');
        if (op.cacheLlena) throw new Error('Service invoked too many times');
        cache.set(k, v);
      };
      return {
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        getAll: (ks) => { const o = {}; ks.forEach((k) => { if (cache.has(k)) o[k] = cache.get(k); }); return o; },
        put: (k, v) => pon(k, v),
        putAll: (o) => { Object.keys(o).forEach((k) => pon(k, o[k])); },
        remove: (k) => cache.delete(k)
      };
    } },
    UrlFetchApp: {
      fetchAll: (pedidos) => {
        if (op.fetchAllTruena) throw new Error('Exception: Service invoked too many times');
        return pedidos.map((q) => respuestaIA(q.url, q));
      },
      fetch: (url, params) => {
        if (/^https:\/\/api\.(anthropic|openai)\.com\//.test(url)) return respuestaIA(url, params || {});
        const md = /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?/]+)\?alt=media/.exec(url);
        if (md) {                // la API de Drive: un trozo de un archivo con la credencial del dueño del script
          const id = decodeURIComponent(md[1]), h = (params && params.headers) || {}, a = drive.archivos[id];
          drivePedidos.push({ url, metodo: String((params && params.method) || 'get').toLowerCase(), headers: h, payload: params && params.payload });
          if (!a || h.Authorization !== 'Bearer ' + TOKEN_DRIVE) return { getResponseCode: () => 404, getContent: () => [] };
          const buf = contenidoDe(a), r = op.driveSinRango ? null : /^bytes=(\d+)-(\d+)$/.exec(h.Range || '');
          const trozo = r ? buf.subarray(Number(r[1]), Number(r[2]) + 1) : buf;
          return { getResponseCode: () => (r ? 206 : 200), getContent: () => Array.from(trozo, (b) => (b > 127 ? b - 256 : b)) };
        }
        llamadas.push(url);
        const t = decodeURIComponent((/[?&]t=([^&]+)/.exec(url) || [])[1] || '');
        if (op.originalCaido && url.includes('ORIGINAL123')) return { getResponseCode: () => 503, getContentText: () => 'caído' };
        const r = (revocados.has(t) ? { ok: false, error: 'revocado' } : SESIONES[t]) || { ok: false, error: 'liga' };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(r) };
      }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => !op.ocupado, waitLock: () => {}, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (propiedades.has(k) ? propiedades.get(k) : null), setProperty: (k, v) => { propiedades.set(k, String(v)); },
      deleteProperty: (k) => { propiedades.delete(k); }
    }) },
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
      base64EncodeWebSafe: (bs) => Buffer.from(bs).toString('base64url'),
      base64Encode: (bs) => bytes(bs).toString('base64'),
      base64Decode: (t) => Array.from(Buffer.from(String(t), 'base64'), (b) => (b > 127 ? b - 256 : b)),
      newBlob: (d, tipo) => new Blob(typeof d === 'string' ? Buffer.from(d, 'utf8') : bytes(d), tipo),
      gzip: (b) => new Blob(zlib.gzipSync(b.buf), 'application/x-gzip'),
      ungzip: (b) => new Blob(zlib.gunzipSync(b.buf)),
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }
    },
    DriveApp: {
      getFileById: (id) => {
        if (drive.archivos[id]) return archivoDoble(id);
        if (drive.carpetas[id]) return carpetaDoble(id);        // como Drive: una carpeta también se abre por su id
        return {
          makeCopy: () => { const nuevo = 'libro-copia-' + (++copias); libros[nuevo] = libroDeAccesorio(undefined, nuevo); if (op.prepararCopia) op.prepararCopia(libros[nuevo]); return { getId: () => nuevo }; },
          getLastUpdated: () => {
            if (op.driveCaido) throw new Error('Drive no contesta');
            if (!libros[id]) throw new Error('no existe ' + id);
            return op.driveTarda ? new Date(1.7e12) : ultimoCambio(libros[id]);     // driveTarda: Drive todavía no se entera de ningún cambio
          }
        };
      },
      getFolderById: (id) => (drive.carpetas[id] ? carpetaDoble(id) : {})
    },
    ScriptApp: { getOAuthToken: () => TOKEN_DRIVE },
    Logger: { log: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(CODIGO, ctx, { filename: 'PPP2.gs' });
  const get = (p) => JSON.parse(ctx.doGet({ parameter: p }).contenido);
  const post = (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).contenido);
  return { ctx, libros, vivero, llamadas, iaPedidos, propiedades, cache, aperturas, revocados, get, post, libro: libros['libro-ejemplo'],
    drive, driveVistas, drivePedidos, driveBlobs };
}
const ADMIN = 'syadmin00000000000000000';
const EDITOR = 'syeditor0000000000000000';
const LECTOR = 'sylector0000000000000000';

function filaDe(hoja, clave) {
  return hoja.v.findIndex((r) => String(r[0]).trim() === clave) + 1;
}

/* El «libro» de juguete para probar la MECÁNICA de la ronda: tras cada recálculo, el Resumen de cada versión
   sale de sus palancas con reglas INVENTADAS (más capital = menos faltante y un poco menos para el dueño). No es
   un motor financiero ni se parece al del libro real. El criterio se prueba además con cifras reales del libro
   (libroReal, más abajo). */
function juguete(libro) {
  const mod = libro.getSheetByName('Modelo'), res = libro.getSheetByName('Resumen'), ver = libro.getSheetByName('Versiones');
  const pon = (clave, v) => { const f = filaDe(res, clave); if (f) res.v[f - 1][1] = v; };
  const lee = (clave) => { const f = filaDe(res, clave); return f ? res.v[f - 1][1] : ''; };
  for (const k of [1, 2, 3]) {
    const val = (c) => Number(mod.v[filaDe(mod, c) - 1][3 + k]) || 0;
    const cap = val('capital'), obra = val('obra_inicio'), precio = val('ajuste_precio'), aobra = val('ajuste_obra'), vm = val('ventas_meses');
    const lentas = vm > Number(mod.v[filaDe(mod, 'ventas_meses') - 1][3]);
    const fallas = (cap < 60 ? 1 : 0) + (obra < 12 ? 1 : 0);
    const respaldo = (lentas ? Math.max(0, 80 - cap) * 0.5 : 0) + (aobra > 0 ? Math.max(0, 70 - cap) * 0.2 : 0);
    const dueno = 60 - 0.02 * cap + 0.3 * (obra - 12) + 100 * precio;
    pon('v' + k + '.rv_resultado', fallas ? 'No pasa: ' + fallas + ' de 9 pruebas' : (cap < 100 ? 'Pasa (aportación justa)' : 'Pasa'));
    pon('v' + k + '.respaldo', respaldo);
    pon('v' + k + '.dueno_recibe', dueno);
    pon('v' + k + '.dueno_meses', 25 + obra);
    pon('v' + k + '.ganancia', dueno - 5);
    pon('v' + k + '.rv_aportacion', Math.round((0.1 + cap / 500) * 1000) / 1000);
    pon('v' + k + '.rv_preventa', Math.round((0.2 + obra / 100) * 1000) / 1000);
    pon('v' + k + '.huella', ['h' + cap, obra, Math.round(precio * 100), Math.round(aobra * 100), vm].join('_'));
    for (const c of ['estado', 'nombre', 'que_cambia', 'propuesta_por', 'aprobada_por']) pon('v' + k + '.' + c, ver.v[filaDe(ver, c) - 1][1 + k]);
  }
  pon('plan.huella', lee('v' + (Number(lee('plan.defiende')) || 1) + '.huella'));
}

/* El ciclo del plan «en chico»: lo mismo que hacen en el libro las fórmulas de Plan!B28:B47, escrito aparte
   para los mundos de prueba. tests/ppp2-libro.test.cjs comprueba, escenario por escenario, que dice lo mismo
   que el libro real recalculado por LibreOffice (tests/fixtures/ppp2-ciclo.json). Las filas llegan como en
   las pestañas: Pruebas (versión en la col. 8, huella en la 11), Consejo (sesión, versión, juez, voto, …,
   huella en la 8, evidencia en la 9) y Rondas (parte de, huella, …, resultado en la 7). */
function cicloDe(e) {
  const tx = (x) => String(x === null || x === undefined ? '' : x).trim();
  const estados = e.estados.map((x) => tx(x).toLowerCase());
  const iProp = estados.indexOf('propuesta'), iVig = estados.indexOf('vigente');
  const t = iProp >= 0 ? iProp + 1 : (iVig >= 0 ? iVig + 1 : 1), h = tx(e.huellas[t - 1]);
  const verDe = (f) => tx(f[2]).slice(-1);
  const sesionDe = (ver, hue) => {
    if (!hue || !ver) return null;
    const vs = e.consejo.filter((f) => verDe(f) === String(ver) && tx(f[7]) === hue);
    if (!vs.length) return null;
    const ultimo = vs[vs.length - 1], nombre = tx(ultimo[1]), suyos = vs.filter((f) => tx(f[1]).toLowerCase() === nombre.toLowerCase());
    const cuenta = (v) => suyos.filter((f) => tx(f[4]).toLowerCase() === v).length;
    const o = { nombre, aprueban: cuenta('aprueba'), vetos: cuenta('veto'), votaron: suyos.length, evidencia: tx(ultimo[8]) };
    o.aprobada = o.votaron === 7 && o.aprueban >= 5 && o.vetos === 0;
    return o;
  };
  const ses = sesionDe(t, h);
  const probada = !!h && e.pruebas.some((f) => tx(f[7]).toUpperCase() === 'V' + t && f[10] === h);
  const sinMejora = !!h && e.rondas.some((f) => Number(f[3]) === t && f[4] === h && f[6] === 'sin mejora');
  const pasa = tx(e.revision[t - 1]).slice(0, 4) === 'Pasa', est = estados[t - 1], evid = tx(e.evidencia);
  let paso;
  if (e.edad === 'semilla') paso = 'datos';
  else if (e.edad === 'fruto') paso = 'cumplido';
  else if (!pasa) paso = sinMejora ? 'proponer' : 'explorar';
  else if (est === 'base' && !sinMejora) paso = 'explorar';
  else if (!probada) paso = 'probar';
  else if (!ses || ses.votaron !== 7) paso = 'consejo';
  else if (ses.aprobada) paso = est === 'vigente' ? (e.edad === 'flor' ? 'acuerdo' : 'candados') : 'direccion';
  else if (!sinMejora) paso = 'explorar';
  else paso = ses.evidencia !== evid ? 'consejo' : 'mundo';        // sin evidencia anotada también se vuelve a presentar
  const vig = iVig + 1, sv = vig ? sesionDe(vig, tx(e.huellas[vig - 1])) : null;
  const sinLeer = e.consejo.filter((f) => tx(f[3]) !== '' && (tx(f[7]) === '' || ['1', '2', '3'].indexOf(verDe(f)) < 0)).length;
  return { defiende: t, huella: h, probada, sesion: ses ? ses.nombre : '', aprueban: ses ? ses.aprueban : 0, vetos: ses ? ses.vetos : 0,
    votaron: ses ? ses.votaron : 0, aprobada: !!(ses && ses.aprobada), sin_mejora: sinMejora, paso, vigente: vig, vigente_aprobada: !!(sv && sv.aprobada),
    evidencia_sesion: ses ? ses.evidencia : '', sin_leer: sinLeer };
}
/* Lo mismo que dice el libro en Plan!B39 para cada paso (ppp2/libro/generar.py, ciclo_plan). */
const TEXTO_PASO = {
  datos: () => 'capturar los datos que faltan para calcular',
  explorar: () => 'mover capital y arranque de obra para proponer algo mejor',
  proponer: () => 'armar una propuesta que pase la revisión para fondos (moviendo sólo capital y arranque de obra no alcanza)',
  probar: (t) => 'probar la V' + t + ' contra los golpes (pruebas de estrés)',
  consejo: (t) => 'presentar la V' + t + ' al consejo de planes',
  direccion: (t) => 'que Dirección decida si la V' + t + ', que el consejo aprobó, queda vigente',
  mundo: () => 'conseguir lo que pidió el consejo (candados y datos): moviendo capital y arranque de obra ya no mejora',
  candados: () => 'cerrar los candados',
  acuerdo: () => 'firmar el acuerdo con el dueño'
};
/* Además del juguete, hace lo que en el libro real hacen las fórmulas del ciclo: qué versión defiende el plan
   y cuál es su siguiente paso (cicloDe). */
function jugueteConCiclo(libro) {
  const res = libro.getSheetByName('Resumen'), ver = libro.getSheetByName('Versiones');
  const pon = (clave, v) => { const f = filaDe(res, clave); if (f) res.v[f - 1][1] = v; };
  const lee = (clave) => { const f = filaDe(res, clave); return f ? res.v[f - 1][1] : ''; };
  const estados = [1, 2, 3].map((k) => String(ver.v[filaDe(ver, 'estado') - 1][1 + k]));
  const iProp = estados.indexOf('propuesta'), iVig = estados.indexOf('vigente');
  pon('plan.defiende', iProp >= 0 ? iProp + 1 : (iVig >= 0 ? iVig + 1 : 1));
  juguete(libro);
  const filas = (hoja, desde) => ((libro.getSheetByName(hoja) || { v: [] }).v.slice(desde).filter((f) => f.some((x) => x !== '' && x !== null && x !== undefined)));
  const c = cicloDe({ edad: lee('plan.edad'), estados, revision: [1, 2, 3].map((k) => lee('v' + k + '.rv_resultado')), huellas: [1, 2, 3].map((k) => lee('v' + k + '.huella')),
    pruebas: filas('Pruebas', 13), consejo: filas('Consejo', 4), rondas: filas('Rondas', 4), evidencia: lee('plan.evidencia') });
  pon('plan.defiende', c.defiende); pon('plan.huella', c.huella); pon('plan.vigente', c.vigente); pon('plan.probada', c.probada);
  pon('plan.consejo_sesion', c.sesion); pon('plan.consejo_aprueban', c.aprueban); pon('plan.consejo_votaron', c.votaron); pon('plan.consejo_vetos', c.vetos);
  pon('plan.consejo_aprobada', c.aprobada); pon('plan.sin_mejora', c.sin_mejora); pon('plan.evidencia_sesion', c.evidencia_sesion); pon('plan.consejo_sin_leer', c.sin_leer);
  pon('plan.paso', c.paso);
  const texto = TEXTO_PASO[c.paso] ? TEXTO_PASO[c.paso](c.defiende) : 'nada: plan cumplido';
  pon('plan.paso_texto', texto);
  // «Para crecer falta» de una plántula nombra el siguiente paso (Plan!B5): se pone al día igual que en el libro
  pon('plan.para_crecer', String(lee('plan.para_crecer') || '').replace(/Siguiente paso: .*?\. Datos sin resolver/, 'Siguiente paso: ' + texto + '. Datos sin resolver'));
}

/* «El libro real» para la ronda: tests/fixtures/ppp2-rejilla.json trae lo que la plantilla real, recalculada por
   LibreOffice con el plan inventado, da para cada combinación de capital, arranque de obra y golpe que una ronda
   prueba desde una situación de partida (ppp2/libro/rejilla.py). Aquí, al recalcular, el Resumen de la versión de
   trabajo toma esas cifras según sus palancas: el servidor real escoge sobre cifras reales del libro. */
const REJILLA = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ppp2-rejilla.json'), 'utf8'));
function libroReal(nombre) {
  const caso = REJILLA.casos[nombre];
  if (!caso) throw new Error('no existe el caso ' + nombre);
  const faltan = [];
  let original = '';            // cómo estaba la versión de trabajo antes de la ronda (a eso vuelve si no hay propuesta)
  const claveDe = (libro) => {
    const mod = libro.getSheetByName('Modelo'), val = (c) => mod.v[filaDe(mod, c) - 1][3 + caso.destino];
    const precio = Number(val('ajuste_precio')) || 0, aobra = Number(val('ajuste_obra')) || 0;
    const g = precio < 0 ? 'precio-5' : (aobra > 0 ? 'obra+5' : (Number(val('ventas_meses')) > Number(mod.v[filaDe(mod, 'ventas_meses') - 1][3]) ? 'lentas' : ''));
    return Number(val('capital')) + '|' + Number(val('obra_inicio')) + '|' + g;
  };
  const aplica = (libro) => {
    const res = libro.getSheetByName('Resumen'), ver = libro.getSheetByName('Versiones');
    const pon = (clave, v) => { const f = filaDe(res, clave); if (f) res.v[f - 1][1] = v; };
    const clave = claveDe(libro), fila = caso.tabla[clave];
    if (fila) for (const c of Object.keys(fila)) pon('v' + caso.destino + '.' + c, fila[c]);
    else if (clave !== original && !faltan.includes(clave)) faltan.push(clave);
    for (const k of [1, 2, 3]) for (const c of ['estado', 'nombre', 'que_cambia', 'propuesta_por']) pon('v' + k + '.' + c, ver.v[filaDe(ver, c) - 1][1 + k]);
  };
  /* Deja el libro de prueba en la situación de partida del caso: estados, palancas de la versión de partida y
     el Resumen que el libro real da para ella. */
  const partida = (libro) => {
    const mod = libro.getSheetByName('Modelo'), res = libro.getSheetByName('Resumen'), ver = libro.getSheetByName('Versiones');
    for (const [k, est] of Object.entries(caso.estados)) ver.v[filaDe(ver, 'estado') - 1][1 + Number(k)] = est;
    for (const [c, v] of Object.entries(caso.palancas || {})) { const f = filaDe(mod, c); mod.v[f - 1][3 + caso.origen] = v; delete mod.f[f + ',' + (4 + caso.origen)]; }
    for (const [clave, v] of Object.entries(caso.partida.resumen)) { const f = filaDe(res, clave); if (f) res.v[f - 1][1] = v; }
    for (const k of [1, 2, 3]) for (const c of ['estado', 'nombre', 'que_cambia', 'propuesta_por']) { const f = filaDe(res, 'v' + k + '.' + c); if (f) res.v[f - 1][1] = ver.v[filaDe(ver, c) - 1][1 + k]; }
    original = claveDe(libro);
  };
  return { caso, aplica, partida, faltan };
}

/* La API de IA de juguete para el consejo: cada juez contesta lo que diga `votos` (por su nombre) o, si no viene,
   «regresa» con una razón de prueba. Lee el nombre del juez del texto de sistema, como lo arma el servidor. */
const RAZON_PRUEBA = 'Falta la escritura y la constancia de zonificación del predio; las cifras del libro no bastan.';
function jueces(votos, otros) {
  const extra = otros || {};
  return ({ url, cuerpo, n }) => {
    // como la API real de esta generación: forzar la herramienta («tool» o «any») es un 400 (visto en vivo el 12-nov-2026)
    if (cuerpo.tool_choice && ['tool', 'any'].indexOf(cuerpo.tool_choice.type) >= 0) return { codigo: 400, cuerpo: { type: 'error', error: { type: 'invalid_request_error', message: 'tool_choice: type "tool" and "any" are not supported for this model.' } } };
    const sistema = String(cuerpo.system || cuerpo.instructions || '');
    const nombre = (/Eres «([^»]+)»/.exec(sistema) || [])[1] || '';
    let v = (votos || {})[nombre];
    if (typeof v === 'function') v = v({ url, cuerpo, n });
    if (v && v.codigo) return v;
    v = v || { voto: 'regresa', razon: RAZON_PRUEBA, condicion: 'Escritura y constancia de zonificación.' };
    if (extra.alContestar) extra.alContestar({ nombre, n });
    if (url.includes('anthropic')) return { codigo: 200, cuerpo: { content: [{ type: 'tool_use', id: 't' + n, name: 'votar', input: v }], stop_reason: 'tool_use' } };
    return { codigo: 200, cuerpo: { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(v) }] }] } };
  };
}
const JUECES = ['Alejandro virtual', 'Dueño de la tierra virtual', 'Inversionista virtual', 'Desarrollador-financiero', 'Arquitecto de norma y cabida', 'Broker de campo', 'Hormozi'];
/* Un plan al que le toca el consejo: la V2 del ejemplo es la propuesta, ya se probó con sus números y nadie la ha juzgado. */
function enConsejo(opciones) {
  const w = mundo(Object.assign({ alFlush: (i, libro) => jugueteConCiclo(libro) }, opciones || {}));
  jugueteConCiclo(w.libro);
  const res = w.libro.getSheetByName('Resumen'), lee = (c) => res.v[filaDe(res, c) - 1][1];
  w.libro.getSheetByName('Pruebas').getRange(14, 1, 1, 11).setValues([['Base de la versión 2', '(sin cambios)', 1, 0, 1, 1, 37, 'V2', '2026-01-15 10:00', 'Pruebas', lee('v2.huella')]]);
  jugueteConCiclo(w.libro);
  w.lee = lee;
  return w;
}

module.exports = { mundo, PLAN, POTENCIALES, FOTO_CAB, HISTORIAL, TOKEN_DRIVE, ADMIN, EDITOR, LECTOR, filaDe, CODIGO, juguete, jugueteConCiclo, cicloDe, libroReal, REJILLA, jueces, JUECES, enConsejo, RAZON_PRUEBA };
