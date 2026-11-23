/* Árbol PPP · arranque de la página: monta la pantalla y la barra del libro. */
(function () {
  'use strict';
  window.ArbolServidor.arranca(document.getElementById('arbol-ppp'), document.getElementById('arbol-libro'), { motor: window.ArbolMotor });
})();
