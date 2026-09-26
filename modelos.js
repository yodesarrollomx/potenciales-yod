/* PP-1 (26-sep-2026) · Una sola navegación entre los 5 modelos del Plan de Potencial.
   «Se cambia de modelo sin perder el terreno capturado»: al tocar otro modelo, el terreno
   (superficie, frente, fondo, precio del m²) viaja por localStorage y se escribe en los
   campos equivalentes del modelo nuevo. Solo lo que existe en ambos; nada se inventa. */
(function(){
  'use strict';
  var MODELOS=[['macrolotes','Macrolotes'],['mixto','Mixto'],['residencial','Residencial'],['unifamiliar','Unifamiliar'],['patrimonial','Patrimonial']];
  var CAMPOS={sup:['inSuperficie','inTerreno'],frente:['inFrente'],fondo:['inFondo'],precio:['inPrecioM2Terreno']};
  var LSK='ppp_terreno_v1', aqui=(location.pathname.split('/').pop()||'').replace('.html','');
  if(!MODELOS.some(function(m){return m[0]===aqui;})) return;
  function campo(ids){for(var i=0;i<ids.length;i++){var e=document.getElementById(ids[i]);if(e) return e;}return null;}
  function leer(){var t={};Object.keys(CAMPOS).forEach(function(k){var e=campo(CAMPOS[k]);if(e&&e.value!=='') t[k]=e.value;});return t;}
  var NOMBRE={sup:'superficie',frente:'frente',fondo:'fondo',precio:'precio del m²'};
  /* los deslizadores tienen mínimo y máximo por modelo (Residencial empieza en 500 m²): si el
     dato no cabe, el navegador lo ajusta en silencio — aquí se dice cuál y a cuánto */
  function escribir(t){var n=0,aj=[];Object.keys(t).forEach(function(k){var e=campo(CAMPOS[k]||[]);if(!e||t[k]==null||t[k]==='') return;
    e.value=t[k];if(Number(e.value)!==Number(t[k])) aj.push(NOMBRE[k]+' '+t[k]+' → '+e.value+' (este modelo va de '+e.min+' a '+e.max+')');
    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));n++;});return {n:n,aj:aj};}
  function barra(){
    if(document.getElementById('pppModelos')) return;
    var b=document.createElement('nav');b.id='pppModelos';b.setAttribute('aria-label','Modelos del Plan de Potencial');
    b.style.cssText='display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;padding:8px 12px;font:600 13px system-ui,sans-serif;border-bottom:1px solid rgba(128,128,128,.25)';
    b.innerHTML='<span style="opacity:.65;font-weight:500;margin-right:4px">Mismo terreno, otro modelo:</span>'+MODELOS.map(function(m){
      var on=m[0]===aqui;return '<a href="'+m[0]+'.html" data-m="'+m[0]+'" '+(on?'aria-current="page" ':'')+'style="text-decoration:none;padding:5px 12px;border-radius:999px;'+
        (on?'background:#c9a96e;color:#17130c':'border:1px solid rgba(128,128,128,.35);color:inherit')+'">'+m[1]+'</a>';}).join('');
    b.addEventListener('click',function(ev){var a=ev.target.closest('a[data-m]');if(!a||a.dataset.m===aqui) return;
      try{localStorage.setItem(LSK,JSON.stringify({t:leer(),de:aqui,ts:Date.now()}));}catch(e){}});
    document.body.insertBefore(b,document.body.firstChild);
  }
  function aplicar(){
    var d=null;try{d=JSON.parse(localStorage.getItem(LSK)||'null');}catch(e){}
    if(!d||d.de===aqui||Date.now()-d.ts>10*60*1000) return;
    try{localStorage.removeItem(LSK);}catch(e){}
    var r=escribir(d.t||{}), n=r.n;
    if(n){var aviso=document.createElement('div');aviso.textContent='Terreno traído de '+d.de+' ('+n+' dato'+(n>1?'s':'')+').'+
      (r.aj.length?' Ajustado al rango de este modelo: '+r.aj.join(' · ')+'.':' Revisa y ajusta si hace falta.');
      aviso.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#17130c;color:#f4f1ec;padding:10px 16px;border-radius:10px;z-index:9999;font:14px system-ui';
      document.body.appendChild(aviso);aviso.style.maxWidth='92vw';setTimeout(function(){aviso.remove();},r.aj.length?12000:5000);}
  }
  function arranca(){barra();setTimeout(aplicar,900);}   // después de cargarDraft(), que si no lo pisaría
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',arranca); else arranca();
  if(typeof module!=='undefined'&&module.exports) module.exports={CAMPOS:CAMPOS};
})();
