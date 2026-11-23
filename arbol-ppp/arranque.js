/* Árbol PPP · arranque de la página: monta la pantalla y la barra del libro. */
(function () {
  'use strict';
  var barra = document.getElementById('arbol-libro');
  window.ArbolServidor.arranca(document.getElementById('arbol-ppp'), barra, { motor: window.ArbolMotor });

  /* El alto de la barra del libro cambia (mensajes, panel de abrir, renglones que se doblan):
     se vuelve a medir cada vez para que la pantalla de abajo no quede cortada. */
  function mide() { try { document.documentElement.style.setProperty('--as-alto', barra.offsetHeight + 'px'); } catch (e) { } }
  if (window.ResizeObserver) new ResizeObserver(mide).observe(barra);
  window.addEventListener('resize', mide); mide();

  /* «Dónde estoy» del marco de YOD OS: YOD OS › PPP › Árbol, con PPP como liga a la lista de planes.
     El marco (shell.js) se arma después de este archivo y luego reescribe el nombre con el del catálogo;
     se vuelve a poner «Árbol» cada vez. Sin marco (p. ej. ?embed=1) no pasa nada. */
  var intentos = 0;
  function fija(aqui) {
    if (!aqui.previousElementSibling || !aqui.previousElementSibling.previousElementSibling || aqui.previousElementSibling.previousElementSibling.getAttribute('data-arbol') !== 'ppp') {
      var ppp = document.createElement('a');
      ppp.href = '../ppp2.html'; ppp.textContent = 'PPP'; ppp.setAttribute('data-arbol', 'ppp');
      var flecha = document.createElement('i'); flecha.className = 'ti ti-chevron-right';
      aqui.parentNode.insertBefore(ppp, aqui);
      aqui.parentNode.insertBefore(flecha, aqui);
    }
    if (aqui.textContent !== 'Árbol') aqui.textContent = 'Árbol';
  }
  function migas() {
    var aqui = document.getElementById('yodCrumbHere');
    if (!aqui) { if (++intentos < 40) setTimeout(migas, 250); return; }
    fija(aqui);
    if (window.MutationObserver) new MutationObserver(function () { fija(aqui); }).observe(aqui, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', migas); else setTimeout(migas, 0);
})();
