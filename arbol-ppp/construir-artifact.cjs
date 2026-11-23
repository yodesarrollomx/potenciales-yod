/* Arma (1) definicion-tablas.js, las pestañas ARBOL_* del catálogo v2 en matrices con encabezado (definicion/*.csv, solo lectura) para la página local,
   (2) definicion-vertical.js, la misma definición como JSON de una línea (la que usaba la v2; ya no la carga la pantalla, queda por compatibilidad), y
   (3) artifact.html, un solo archivo con pantalla.css, motor.js, las tablas y pantalla.js en línea (autocontenido: sin red salvo las tipografías de Google Fonts).
   La pantalla v3 carga las TABLAS porque de ahí salen las filas completas que «Exportar» arma para pegar en las pestañas ARBOL_* del PPP Maestro.
   Uso: node construir-artifact.cjs */
const fs = require('fs'), path = require('path');
const leer = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
function leeCsv(txt) {
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
    else if (c === '"') q = true; else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; } else if (c !== '\r') campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const ancho = filas[0].length;
  return filas.filter((f) => f.length > 1 || f[0] !== '').map((f) => { while (f.length < ancho) f.push(''); return f; });
}
const PESTANAS = [['nodos', 'ARBOL_NODOS'], ['opciones', 'ARBOL_OPCIONES'], ['reglas', 'ARBOL_REGLAS'], ['factores', 'ARBOL_FACTORES'], ['componentes', 'ARBOL_COMPONENTES'], ['tipos', 'ARBOL_TIPOS'], ['flujos', 'ARBOL_FLUJOS']];
const tablas = {}; PESTANAS.forEach(([f, t]) => { tablas[t] = leeCsv(leer('definicion/' + f + '.csv')); });
const jsT = 'window.ARBOL_TABLAS=' + JSON.stringify(tablas).replace(/<\/script/gi, '<\\/script') + ';\n';
fs.writeFileSync(path.join(__dirname, 'definicion-tablas.js'), jsT);

const full = JSON.parse(leer('definicion/vertical.json'));
const MANTENER = ['esquema', 'formato', 'version', 'tipo', 'nodos', 'flujos', 'componentes', 'factores'];
const def = {}; MANTENER.forEach((k) => { if (full[k] !== undefined) def[k] = full[k]; });
const js = 'window.ARBOL_DEFINICION=' + JSON.stringify(def).replace(/<\/script/gi, '<\\/script') + ';\n';
fs.writeFileSync(path.join(__dirname, 'definicion-vertical.js'), js);

const css = leer('pantalla.css'), motor = leer('motor.js'), pant = leer('pantalla.js');
[motor, pant, jsT].forEach((s) => { if (/<\/script/i.test(s)) throw new Error('hay </script> dentro de un script'); });
const out =
  '<title>Árbol PPP</title>\n' +
  '<meta name="claude:viewport-fit-sides" content="cover">\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap">\n' +
  '<style>\n' + css + '</style>\n' +
  '<div id="arbol-ppp"></div>\n' +
  '<script>\n' + motor + '\n</script>\n' +
  '<script>\n' + jsT + '</script>\n' +
  '<script>\n' + pant + '\n</script>\n' +
  '<script>ArbolPantalla.montar(document.getElementById("arbol-ppp"), { motor: ArbolMotor });</script>\n';
fs.writeFileSync(path.join(__dirname, 'artifact.html'), out);
console.log('definicion-tablas.js: ' + jsT.length + ' caracteres · definicion-vertical.js: ' + js.length + ' · artifact.html: ' + out.length + ' caracteres');
