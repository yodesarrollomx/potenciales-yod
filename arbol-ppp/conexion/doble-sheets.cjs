/* Doble de Google Sheets en memoria para las pruebas del Árbol PPP: hojas con valores y fórmulas, rangos, copiar y agregar renglón.
   Solo lo que usa server/ppp2/ArbolPPP.gs. Un apóstrofo inicial vuelve texto literal, como en Sheets. No es Google Sheets: no calcula fórmulas
   (una celda con fórmula vale «ƒ») ni convierte textos en números o fechas. */
'use strict';
const letra = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
class Hoja {
  constructor(nombre, filas, cols) { this.nombre = nombre; this.g = {}; this.maxC = cols; this.maxR = 400; (filas || []).forEach((r, i) => r.forEach((c, j) => { if (c !== '' && c !== null && c !== undefined) this.put(i + 1, j + 1, c); })); }
  put(r, c, x) { if (typeof x === 'string' && x[0] === '=') this.g[r + ',' + c] = { f: x, v: 'ƒ' }; else this.g[r + ',' + c] = { v: x }; }
  celda(r, c) { return this.g[r + ',' + c]; }
  getLastRow() { let m = 0; Object.keys(this.g).forEach((k) => { m = Math.max(m, +k.split(',')[0]); }); return m; }
  getLastColumn() { let m = 0; Object.keys(this.g).forEach((k) => { m = Math.max(m, +k.split(',')[1]); }); return m; }
  getMaxColumns() { return this.maxC; }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  appendRow(fila) { const r = this.getLastRow() + 1; fila.forEach((x, j) => { if (typeof x === 'string' && x[0] === "'") this.g[r + ',' + (j + 1)] = { v: x.slice(1) }; else if (x !== '' && x !== null && x !== undefined) this.put(r, j + 1, x); }); }
  getRange(r, c, nr, nc) { return new Rango(this, r, c, nr || 1, nc || 1); }
}
class Rango {
  constructor(h, r, c, nr, nc) { Object.assign(this, { h, r, c, nr, nc }); }
  each(fn) { const o = []; for (let i = 0; i < this.nr; i++) { const fila = []; for (let j = 0; j < this.nc; j++) fila.push(fn(this.h.celda(this.r + i, this.c + j), this.r + i, this.c + j)); o.push(fila); } return o; }
  getValues() { return this.each((x) => (x ? x.v : '')); }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValue() { return String(this.getValue()); }
  getFormulas() { return this.each((x) => (x && x.f ? x.f : '')); }
  setValues(m) { m.forEach((fila, i) => fila.forEach((x, j) => { const r = this.r + i, c = this.c + j; if (x === '' || x === null) delete this.h.g[r + ',' + c]; else if (typeof x === 'string' && x[0] === "'") this.h.g[r + ',' + c] = { v: x.slice(1) }; else this.h.put(r, c, x); })); return this; }
  setValue(x) { return this.setValues([[x]]); }
  copyTo(dest) { this.each((x, r, c) => { const d = dest.h; const rr = dest.r + (r - this.r), cc = dest.c + (c - this.c); if (!x) { delete d.g[rr + ',' + cc]; return; } d.g[rr + ',' + cc] = x.f ? { f: x.f.split('{c}').join(letra(cc)), v: 'ƒ' } : { v: x.v }; }); }
}
module.exports = { Hoja, Rango, letra };
