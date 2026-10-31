'use strict';
// T-103 · Recorrido de navegador de la adopción de YodCargador (yod-portal/os/yod-cargador.js), con la red SINTÉTICA de ppp-fixture.js.
// Necesita el cargador servido desde YOD_ATLAS_DIR/os/yod-cargador.js; si no está, se omite (el cargador es opcional para los tableros).
//  1. Portada: 1.ª visita por red; 2.ª visita pinta la lista de caché MIENTRAS la red tarda y luego se actualiza, con un solo refresco por tipo;
//     con ?cargador=legacy nada sale de caché; el botón «Actualizar» pide a red.
//  2. Motor (residencial): la lista que se abre en «Mis casos» tras arrancar NO sale de caché (un caso guardado entre tanto debe verse).
//  3. Portero: con sesión canjeada antes, el engrane de administrador sale de inmediato aunque el canje tarde; con ?cargador=legacy espera a la red.
//  4. Caso: un caso se lee siempre de la red; sin red no se abre ni el de otro caso ni una copia vieja (el cargador sólo atiende la primera lista).
// No acredita login real, el backend ni el cargador en producción. Sin escrituras de negocio.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {install}=require('./ppp-fixture.js');
const atlas=process.env.YOD_ATLAS_DIR||path.resolve(__dirname,'../../yod-atlas');
if(!fs.existsSync(path.join(atlas,'os','yod-cargador.js'))){console.log('OMITIDA: '+path.join(atlas,'os','yod-cargador.js')+' no existe; los tableros corren por el camino de siempre.');process.exit(0);}
const assets=process.env.PPP_MAP_ASSETS||'/tmp/ppp-map-assets',PAGE='https://ppp.test/potenciales-yod/';
const rows=(tipo,n)=>Array.from({length:n},(_,i)=>({caso_id:`prueba ${tipo}/${i}`,nombre_caso:`Proyecto de prueba ${tipo} ${i+1}`,palabra:`ensayo-${i+1}`,estado:'ANÁLISIS'}));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Los predicados corren en el navegador: nada de cierres de Node, el texto viaja como argumento.
const cuenta=(page,text,timeout=15000)=>page.waitForFunction(t=>document.getElementById('cntTodos').textContent===t,text,{timeout});

async function servidor(context,state){
 await install(context,{seed:null});
 await context.route('https://unpkg.com/**',route=>{
  const u=route.request().url(),gesture=u.includes('gesture-handling'),css=u.includes('.css');
  return route.fulfill({contentType:css?'text/css':'text/javascript',body:fs.readFileSync(path.join(assets,(gesture?'gesture':'leaflet')+(css?'.css':'.js')))});
 });
 await context.route('https://script.google.com/**',async route=>{
  const req=route.request(),u=new URL(req.url()),action=u.searchParams.get('recurso'),tipo=u.searchParams.get('tipo');
  if(req.method()!=='GET')return route.fallback();
  if(action==='lista'){
   state.calls.lista.push(tipo);if(state.delay)await sleep(state.delay);
   return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,casos:rows(tipo,state.n),config:{}})}).catch(()=>{});
  }
  if(action==='caso'){
   const id=u.searchParams.get('id')||u.searchParams.get('palabra')||'sin-id';state.calls.caso.push(id);
   if(state.casoFalla)return route.abort('failed').catch(()=>{});
   return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,caso:{caso_id:id,nombre_caso:'Caso de prueba '+id,palabra:'ensayo',estado:'ANÁLISIS'}})}).catch(()=>{});
  }
  if(action==='canje'){state.calls.canje++;if(state.canjeDelay)await sleep(state.canjeDelay);return route.fallback().catch(()=>{});}
  if(action==='mapa')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,pines:[]})});
  return route.fallback();
 });
}
const nuevoEstado=()=>({calls:{lista:[],canje:0,caso:[]},delay:0,n:3,canjeDelay:0,casoFalla:false});
const rejects=async(promise,message)=>{let failed=false;try{await promise;}catch{failed=true;}assert.ok(failed,message);};

async function portada(browser,name){
 const state=nuevoEstado(),context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true});
 await servidor(context,state);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(PAGE+'index.html');await cuenta(page,'15');
 assert.equal(state.calls.lista.length,5,'1.ª visita: una lista por tipo, por red');
 // 2.ª visita: la red tarda 4 s y trae un proyecto más por tipo
 state.delay=4000;state.n=4;const inicio=Date.now();
 await page.goto(PAGE+'index.html');
 await cuenta(page,'15',3200);
 assert.ok(Date.now()-inicio<3900,'la lista de la visita anterior se pinta antes de que conteste la red');
 await cuenta(page,'20',12000);
 assert.equal(state.calls.lista.length,10,'un refresco de fondo por tipo, ni uno más');
 assert.equal(await page.locator('#listaTodos .lt-item').count(),20);
 // ?cargador=legacy: el camino de siempre, sin caché
 state.delay=1500;
 await page.goto(PAGE+'index.html?cargador=legacy');
 await rejects(page.waitForFunction(()=>/^(15|20)$/.test(document.getElementById('cntTodos').textContent),null,{timeout:900}),'con ?cargador=legacy nada se pinta de caché');
 await cuenta(page,'20',9000);
 assert.equal(state.calls.lista.length,15,'legacy: cinco lecturas de red, sin refrescos extra');
 // «Actualizar proyectos guardados»: SIEMPRE a red (si leyera caché mostraría 20 de inmediato)
 state.delay=0;state.n=5;await page.goto(PAGE+'index.html');await cuenta(page,'25',9000);
 state.delay=1500;state.n=6;const antes=state.calls.lista.length;
 await page.locator('#btnTodos').click();
 await rejects(page.waitForFunction(()=>/^(20|25)$/.test(document.getElementById('cntTodos').textContent),null,{timeout:700}),'actualizar no puede devolver caché');
 await cuenta(page,'30',9000);
 assert.equal(state.calls.lista.length-antes,5,'actualizar: exactamente una lectura de red por tipo');
 assert.deepEqual(errors,[]);await context.close();
 console.log('PASS '+name+': portada · 2.ª visita pinta de caché mientras la red tarda y se actualiza (1 refresco por tipo), legacy sin caché, actualizar va a red.');
}

async function motor(browser,name){
 const state=nuevoEstado(),context=await browser.newContext({viewport:{width:1280,height:900}});
 await servidor(context,state);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 state.n=2;await page.goto(PAGE+'residencial.html');
 await page.waitForFunction(()=>!!document.getElementById('btnMisCasos'));
 const esperaListas=async n=>{for(let i=0;i<100&&state.calls.lista.length<n;i++)await sleep(100);assert.ok(state.calls.lista.length>=n,'lista #'+n+' leída ('+state.calls.lista.length+')');};
 await esperaListas(1);
 // 2.ª visita: arranca con la lista de caché y la refresca en fondo (2 lecturas en total)
 state.n=3;await page.goto(PAGE+'residencial.html');await esperaListas(2);await sleep(400);
 assert.equal(state.calls.lista.length,2,'la 2.ª visita lee la lista una sola vez más (el refresco de fondo)');
 // alguien guarda un caso más; «Mis casos» debe verlo: esa lectura va a red, no a la caché de arriba
 state.n=4;
 await page.evaluate(()=>document.getElementById('btnMisCasos').click());
 await page.waitForFunction(()=>document.querySelectorAll('#listaCasos .caso-item').length===4,null,{timeout:8000});
 assert.equal(state.calls.lista.length,3,'«Mis casos» lee a red');
 assert.deepEqual(errors,[]);await context.close();
 console.log('PASS '+name+': motor · el arranque usa la lista de caché una vez; «Mis casos» siempre lee a red y ve el caso nuevo.');
}

async function portero(browser,name){
 const state=nuevoEstado(),context=await browser.newContext({viewport:{width:1280,height:900}});
 await servidor(context,state);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(PAGE+'residencial.html');await page.locator('#engraneBtn').waitFor({timeout:8000});
 // 2.ª visita: el canje tarda 6 s, pero la sesión ya canjeada abre la puerta y pinta el engrane de administrador antes
 state.canjeDelay=6000;await page.goto(PAGE+'residencial.html');
 await page.locator('#engraneBtn').waitFor({timeout:4000});
 // legacy: espera al Portero
 await page.goto(PAGE+'residencial.html?cargador=legacy');
 await rejects(page.locator('#engraneBtn').waitFor({timeout:1000}),'con ?cargador=legacy el engrane espera al canje de red');
 await page.locator('#engraneBtn').waitFor({timeout:14000});
 assert.deepEqual(errors,[]);await context.close();
 console.log('PASS '+name+': Portero · el canje de la sesión ya canjeada sale de caché sin esperar a la red; legacy espera a la red.');
}

async function contrato(browser,name){
 const state=nuevoEstado(),context=await browser.newContext({viewport:{width:1280,height:900}});
 await servidor(context,state);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // El borrador local del motor (pyodr_draft_v1) también recordaría el último caso: se quita para medir solo lo que podría aportar la caché del cargador.
 const sinBorrador=()=>page.evaluate(()=>{for(const k of Object.keys(localStorage))if(/draft/i.test(k))localStorage.removeItem(k);});
 const abre=async id=>{await page.goto(PAGE+'residencial.html?open='+id);};
 const barra=()=>page.evaluate(()=>document.getElementById('casoNombreBar').textContent);
 await abre('prueba-A');
 await page.waitForFunction(()=>/Caso de prueba prueba-A/.test(document.getElementById('casoNombreBar').textContent),null,{timeout:12000});
 // Sin red, un caso distinto jamás se abre con los datos del anterior, y el mismo caso tampoco se abre desde una copia vieja: un caso se lee siempre de la red.
 state.casoFalla=true;
 for(const id of ['prueba-B','prueba-A']){
  await sinBorrador();await abre(id);
  await page.waitForFunction(()=>/no se pudo abrir/i.test(document.getElementById('toast').textContent),null,{timeout:15000});
  const texto=await barra();
  assert.ok(!/prueba-A|prueba-B/.test(texto),'sin red, ?open='+id+' no abre ningún caso desde caché: '+texto);
 }
 assert.ok(state.calls.caso.length>=3,'cada apertura pidió el caso a la red: '+state.calls.caso.join(','));
 assert.deepEqual(errors,[]);await context.close();
 console.log('PASS '+name+': caso · un caso se lee siempre de la red; sin red no se abre ni el de otro ni una copia vieja.');
}

(async()=>{
 for(const [name,engine] of Object.entries({chromium,webkit})){
  if(process.env.PPP_ENGINE&&process.env.PPP_ENGINE!==name)continue;
  const browser=await engine.launch({headless:true});
  try{
   if(fs.existsSync(path.join(assets,'leaflet.js')))await portada(browser,name);else console.log('SIN PORTADA: faltan los archivos de Leaflet en '+assets+' (PPP_MAP_ASSETS)');
   await motor(browser,name);await portero(browser,name);await contrato(browser,name);
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
