'use strict';
// T-204 · Paridad de cifras con el cargador compartido (criterio 2 de salida de la Fase 1): lo que el usuario VE no cambia porque YodCargador esté activo.
// Para los 5 motores (macrolotes, unifamiliar, residencial, mixto, patrimonial) se abre el MISMO caso sintético (mismo caso_id, cifras inventadas, red de ppp-fixture.js)
// en dos contextos con el MISMO recorrido de dos cargas (la 1.ª sirve la versión A del caso y deja lo que el modo guarde; la 2.ª sirve la versión B):
//   (a) con ?cargador=legacy, el camino de siempre (sin caché del cargador);
//   (b) con el cargador real: la 2.ª carga es la de caché caliente (el canje y, donde el motor la lee con ?open, la primera lista salen de lo guardado por la 1.ª).
// Las dos primeras cargas deben verse igual, y las dos segundas también. Que los recorridos sean simétricos importa: cada motor deja estado local en la 1.ª carga
// (borradores, escenarios) que cambia lo que pinta la 2.ª, con o sin cargador; solo así la única diferencia entre (a) y (b) es el cargador.
// Se comparan, nodo por nodo, las cifras VISIBLES de cada motor (#hud*, #hero*, .kpi-box, tarjetas .ppp-main y .pm-sum y, en patrimonial, [data-native-result]); al menos 3 por motor
// contienen dígitos (si el motor dejara de pintarlas, la prueba falla en vez de comparar vacío). Además la foto de A tiene que distinguirse de la de B: si la carga
// caliente enseñara datos de la visita anterior, o el cargador alterara una cifra, las fotos dejarían de coincidir.
// Necesita el cargador servido desde YOD_ATLAS_DIR/os/yod-cargador.js: fuera de CI, si no está, se omite; en CI (CI=true) FALLA, igual que ppp-cargador-browser.cjs.
// No acredita login real, el backend ni el cargador en producción. Sin escrituras de negocio.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {install,native,compute}=require('./ppp-fixture.js');
const patrimonial=require('./fixtures/patrimonial-native.json');
const atlas=process.env.YOD_ATLAS_DIR||path.resolve(__dirname,'../../yod-atlas');
const cargador=path.join(atlas,'os','yod-cargador.js');if(!fs.existsSync(cargador)){if(process.env.CI==='true'){console.error('ERROR: en CI el atlas debe traer os/yod-cargador.js; no existe en '+cargador);process.exit(1);}console.log('OMITIDA: '+cargador+' no existe; los tableros corren por el camino de siempre.');process.exit(0);}
const PAGE='https://ppp.test/potenciales-yod/',ID='synthetic-case',MIN_CIFRAS=3;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const copia=o=>JSON.parse(JSON.stringify(o));

// ---- el caso sintético, en dos versiones (A: 1.ª carga con cargador · B: legacy y 2.ª carga con cargador) ----
// Motores clásicos: columnas planas `in*` (lo que el Sheet guarda por caso). Vertical y patrimonial: modelo nativo de Sheets.
const COLUMNAS={
 macrolotes:{A:{inFrente:600,inFondo:900},B:{inFrente:700,inFondo:1100}},
 unifamiliar:{A:{inSuperficie:200,inPrecioM2Terreno:6000},B:{inSuperficie:240,inPrecioM2Terreno:7000}},
 residencial:{A:{inSuperficie:20000,inM2Lote:210},B:{inSuperficie:26000,inM2Lote:240}}
};
const terrenoMixto=ver=>ver==='A'?1800:2300;
const modeloMixto=ver=>{const m=native(),e=m.escenarios[0];e.inputs.inTerreno=terrenoMixto(ver);m.estados[m.activo]=compute(e.inputs);m.revision='revision-paridad-'+ver;return m;};
const modeloPatrimonial=ver=>{const m=copia(patrimonial);if(ver==='B'){m.revision='revision-paridad-b';const e=m.estados[m.activo];e.rentaMes=Math.round(e.rentaMes*1.1);e.noi=Math.round(e.noi*1.1);}return m;};
const MOTORES=[
 {nombre:'macrolotes',leeLista:true,controles:ver=>COLUMNAS.macrolotes[ver]},
 {nombre:'unifamiliar',leeLista:true,controles:ver=>COLUMNAS.unifamiliar[ver]},
 {nombre:'residencial',leeLista:true,controles:ver=>COLUMNAS.residencial[ver]},
 {nombre:'mixto',leeLista:true,nativo:true,modelo:modeloMixto,controles:ver=>({inTerreno:terrenoMixto(ver)})},
 {nombre:'patrimonial',leeLista:false,nativo:true,modelo:modeloPatrimonial,resultados:ver=>({rentaMes:modeloPatrimonial(ver).estados[patrimonial.activo].rentaMes})}
];

// ---- red sintética: ppp-fixture.js (canje, lista, caso nativo del vertical) + el caso de cada motor clásico y de patrimonial ----
async function servir(context,spec,estado){
 const nombre='Paridad '+spec.nombre;
 const t=await install(context,{seed:null,native:spec.nombre==='mixto',model:spec.nombre==='mixto'?spec.modelo('A'):undefined,cases:[{caso_id:ID,nombre_caso:nombre,palabra:'paridad',estado:'ANÁLISIS'}]});
 if(spec.nombre!=='mixto')await context.route('https://script.google.com/**',route=>{
  const req=route.request(),recurso=new URL(req.url()).searchParams.get('recurso');
  if(req.method()!=='GET'||(recurso!=='caso'&&recurso!=='sheet-model'))return route.fallback();
  const ver=estado.ver,base={caso_id:ID,nombre_caso:nombre,palabra:'paridad',estado:'ANÁLISIS',version:1};
  const json=o=>route.fulfill({contentType:'application/json',body:JSON.stringify(o)});
  if(spec.nombre==='patrimonial')return json(recurso==='caso'?{ok:true,caso:{...base,calculo_sheet:spec.modelo(ver)}}:spec.modelo(ver));
  return json({ok:true,caso:{...base,...COLUMNAS[spec.nombre][ver]}});
 });
 // Al cambiar de versión el vertical sirve otro modelo nativo (el transporte del fixture lo lee en cada petición).
 estado.cambia=ver=>{estado.ver=ver;if(spec.nombre==='mixto')t.model=spec.modelo(ver);};
 return t;
}

// ---- lo que se compara (corre en el navegador: nada de cierres de Node) ----
const FOTO=()=>{
 // Solo lo que se ve: patrimonial en modo nativo conserva el HUD clásico oculto y macrolotes oculta su HUD urbano; sus valores no son cifras del usuario.
 const out={},visible=e=>!!(e.offsetParent||e.getClientRects().length),limpia=e=>e.textContent.replace(/\s+/g,' ').trim();
 document.querySelectorAll('[id^="hud"],[id^="hero"]').forEach(e=>{if(visible(e))out['#'+e.id]=limpia(e);});
 document.querySelectorAll('.kpi-box').forEach((e,i)=>{if(visible(e))out['kpi'+i]=limpia(e);});
 document.querySelectorAll('[data-card] .ppp-main').forEach(e=>{if(visible(e))out['tarjeta:'+e.closest('[data-card]').dataset.card]=limpia(e);});
 document.querySelectorAll('[data-card] .pm-sum').forEach((e,i)=>{if(visible(e))out['resumen'+i+':'+e.closest('[data-card]').dataset.card]=limpia(e);});
 document.querySelectorAll('[data-native-result]').forEach(e=>{if(visible(e))out['nativo:'+e.dataset.nativeResult]=limpia(e);});
 return out;
};
const conDigitos=foto=>Object.keys(foto).filter(k=>/\d/.test(foto[k]));
// El caso ya se aplicó cuando los controles (clásicos y vertical) o los resultados nativos (patrimonial) muestran los valores de esa versión.
const listo=(page,spec,ver)=>page.waitForFunction(({ctl,res})=>{
 for(const [id,v] of Object.entries(ctl)){const e=document.getElementById(id);if(!e||Number(e.value)!==v)return false;}
 for(const [k,v] of Object.entries(res)){const e=document.querySelector('[data-native-result="'+k+'"]');if(!e||Number(e.textContent.replace(/[^0-9.\-]/g,''))!==v)return false;}
 return true;
},{ctl:spec.controles?spec.controles(ver):{},res:spec.resultados?spec.resultados(ver):{}},{timeout:20000});
// Foto estable: dos lecturas seguidas iguales y con cifras (las animaciones y los repintados de fondo ya terminaron).
async function cifras(page,etiqueta){
 let previa=null;
 for(let i=0;i<60;i++){
  const actual=await page.evaluate(FOTO);
  if(conDigitos(actual).length>=MIN_CIFRAS&&previa&&JSON.stringify(actual)===JSON.stringify(previa))return actual;
  previa=actual;await sleep(250);
 }
 throw new Error(etiqueta+': las cifras no se estabilizaron o hay menos de '+MIN_CIFRAS+' con dígitos: '+JSON.stringify(previa).slice(0,400));
}
const modoDe=page=>page.evaluate(()=>{const C=window.YodCargador;return C?{v:typeof C.v==='string'&&C.v!=='',legacy:C.legacy===true}:null;});
// Telemetría del cargador: n = muestras guardadas; las nuevas de esta página son las últimas (n - n anterior) de `ultimos`.
const telemetria=page=>page.evaluate(()=>{const C=window.YodCargador,r=C&&C.telemetria&&typeof C.telemetria.resumen==='function'?C.telemetria.resumen({}):null;return r?{n:r.n,ultimos:r.ultimos.map(m=>m.p+':'+m.origen)}:{n:0,ultimos:[]};});
// Espera hasta `espera` décimas de segundo; si se pide `quiere` (RegExp sobre «tipo:origen»), vuelve en cuanto haya una muestra nueva que la cumpla.
async function nuevas(page,antes,espera,quiere){
 let nuevas=[];
 for(let i=0;i<espera;i++){
  const ahora=await telemetria(page),k=Math.max(0,Math.min(ahora.n-antes.n,ahora.ultimos.length));
  nuevas=k?ahora.ultimos.slice(-k):[];
  if(quiere&&nuevas.some(m=>quiere.test(m)))return nuevas;
  await sleep(100);
 }
 return nuevas;
}
const sinBorrador=page=>page.evaluate(()=>{for(const k of Object.keys(localStorage))if(/draft/i.test(k))localStorage.removeItem(k);});   // el borrador local de la visita anterior no es lo que mide esta prueba
function diferencias(a,b){
 const claves=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
 return claves.filter(k=>a[k]!==b[k]).map(k=>k+': «'+a[k]+'» ≠ «'+b[k]+'»');
}

async function abre(browser,spec,modo){
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),estado={};
 const salida={};
 try{
  await servir(context,spec,estado);
  const page=await context.newPage(),errores=[];page.on('pageerror',e=>errores.push(e.message));
  const url=PAGE+spec.nombre+'.html?open='+ID+(modo==='legacy'?'&cargador=legacy':'');
  // 1.ª carga: versión A por red; con el cargador deja guardado el canje (y la primera lista si el motor la lee con ?open)
  estado.cambia('A');
  const antes0=await telemetria(page);   // página en blanco: sin cargador, 0 muestras
  await page.goto(url);await listo(page,spec,'A');
  salida.fria=await cifras(page,spec.nombre+' · '+modo+' · 1.ª carga');
  salida.modoFrio=await modoDe(page);
  salida.telFria=await nuevas(page,antes0,modo==='legacy'?5:8,null);
  await sinBorrador(page);
  // 2.ª carga: versión B; con el cargador sirve de su caché lo que guardó, y el caso se lee siempre de la red
  estado.cambia('B');
  const antes=await telemetria(page);
  await page.goto(url);await listo(page,spec,'B');
  salida.cifras=await cifras(page,spec.nombre+' · '+modo+' · 2.ª carga');
  salida.modo=await modoDe(page);
  // con el cargador se espera la muestra que prueba la caché: la primera lista (donde el motor la lee con ?open) o, en patrimonial, la que sea
  salida.telCaliente=await nuevas(page,antes,modo==='legacy'?8:60,modo==='legacy'?null:spec.leeLista?/^lista:cache$/:/:cache$/);
  assert.deepEqual(errores,[],spec.nombre+' ('+modo+'): sin errores de página');
 }finally{await context.close();}
 return salida;
}

const cache=m=>/:cache$/.test(m);
async function motor(browser,name,spec){
 const legacy=await abre(browser,spec,'legacy'),conCargador=await abre(browser,spec,'cargador');
 // los dos modos son reales
 assert.ok(legacy.modo&&legacy.modo.legacy===true&&legacy.modoFrio&&legacy.modoFrio.legacy===true,spec.nombre+': con ?cargador=legacy el cargador está en modo legacy');
 assert.deepEqual([legacy.telFria.filter(cache),legacy.telCaliente.filter(cache)],[[],[]],spec.nombre+': legacy no sirve nada de caché');
 assert.ok(conCargador.modo&&conCargador.modo.v&&conCargador.modo.legacy===false&&conCargador.modoFrio&&conCargador.modoFrio.v&&conCargador.modoFrio.legacy===false,spec.nombre+': sin legacy el cargador está activo');
 assert.deepEqual(conCargador.telFria.filter(cache),[],spec.nombre+': la 1.ª carga no puede salir de caché ('+conCargador.telFria.join(' ')+')');
 assert.ok(conCargador.telCaliente.some(cache),spec.nombre+': la 2.ª carga sirvió algo de la caché del cargador (muestras nuevas: '+conCargador.telCaliente.join(' ')+')');
 // Con ?open, patrimonial abre el caso directo (abrirPorId) y NO lee la lista: su caché-primero no interviene en este recorrido (solo el canje y el catálogo del marco);
 // los otros cuatro sí la leen al arrancar, y la 2.ª vez esa primera lista sale de caché.
 if(spec.leeLista)assert.ok(conCargador.telCaliente.includes('lista:cache'),spec.nombre+': la primera lista de la 2.ª carga salió de caché (lista:cache; muestras nuevas: '+conCargador.telCaliente.join(' ')+')');
 // la comparación, 1.ª con 1.ª y 2.ª con 2.ª
 const comp={};
 for(const [cual,a,b] of [['1.ª carga',legacy.fria,conCargador.fria],['2.ª carga (caché caliente)',legacy.cifras,conCargador.cifras]]){
  const comparadas=conDigitos(a).filter(k=>k in b).length;
  assert.ok(conDigitos(a).length>=MIN_CIFRAS&&comparadas>=MIN_CIFRAS,spec.nombre+' · '+cual+': al menos '+MIN_CIFRAS+' cifras presentes en los dos modos ('+comparadas+' de '+conDigitos(a).length+')');
  const difiere=diferencias(a,b);
  assert.deepEqual(difiere,[],spec.nombre+' · '+cual+': con el cargador las cifras difieren de legacy:\n  '+difiere.join('\n  '));
  comp[cual]=comparadas;
 }
 // sensibilidad: la versión A (1.ª carga) y la B (2.ª) no pueden verse igual; si no, la comparación no probaría nada
 const cambiaron=diferencias(conCargador.fria,conCargador.cifras).length;
 assert.ok(cambiaron>=1,spec.nombre+': la foto de la versión A tiene que distinguirse de la B (si no, la prueba no detecta datos viejos)');
 console.log('PASS '+name+': paridad · '+spec.nombre+' · '+comp['1.ª carga']+' cifras idénticas en la 1.ª carga y '+comp['2.ª carga (caché caliente)']+' en la 2.ª con ?cargador=legacy y con el cargador ('+conCargador.telCaliente.filter(cache).join(' ')+'); '+cambiaron+' cambian entre A y B.');
}

(async()=>{
 for(const [name,engine] of Object.entries({chromium,webkit})){
  if(process.env.PPP_ENGINE&&process.env.PPP_ENGINE!==name)continue;
  const browser=await engine.launch({headless:true});
  try{
   for(const spec of MOTORES)await motor(browser,name,spec);
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
