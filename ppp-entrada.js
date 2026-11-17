/* Enlaces históricos y alta única. La sesión se consume en el destino por el Portero. */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var pagina = location.pathname.split('/').pop() || 'index.html';
  var archivo = params.get('archivo') === '1';
  var caso = params.get('open');
  function irAlPlan(nuevo) {
    var destino = new URL('ppp2.html', location.href);
    params.forEach(function (v,k) {
      if (['new','open','archivo','t','tipo'].indexOf(k) < 0) destino.searchParams.set(k,v);
    });
    destino.hash = nuevo ? '/nuevo' : location.hash;
    location.replace(destino.href);
  }
  if (pagina === 'index.html') {
    if (caso) {
      var tipos = {mixto:'mixto',vertical:'mixto',macrolotes:'macrolotes',residencial:'residencial',unifamiliar:'unifamiliar',patrimonial:'patrimonial'};
      var tipo = params.get('t') || 'mixto';
      var destino = new URL((Object.prototype.hasOwnProperty.call(tipos,tipo) ? tipos[tipo] : 'mixto') + '.html',location.href);
      destino.search = location.search;
      destino.hash = location.hash;
      location.replace(destino.href);
    } else if (!archivo) irAlPlan(params.get('new') === '1');
    return;
  }
  if (!caso && params.get('new') === '1') { irAlPlan(true); return; }
  document.addEventListener('click',function (ev) {
    if (!ev.target.closest || !ev.target.closest('#btnNuevo')) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    irAlPlan(true);
  }, true);
})();
