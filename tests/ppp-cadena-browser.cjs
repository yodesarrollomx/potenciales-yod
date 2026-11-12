'use strict';
// Diagrama en cadena dentro del PPP vertical: HTML completo, marco real y transporte sintético.
// Ninguna petición llega a un servicio de negocio; los casos y versiones son de prueba.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {install,draft,native,inputs}=require('./ppp-fixture.js');
const copy=o=>JSON.parse(JSON.stringify(o));
function tresVersiones(){
  const d=draft(),mk=(id,nombre,base,patch)=>({id,nombre,esBase:base,inputs:Object.assign(copy(inputs),patch)});
  d.escenarios=[mk('r-bajo','Ritmo bajo',false,{inVel:45,inMesesPreventa:18,inInicioObra:14}),mk('r-medio','Ritmo medio',true,{}),mk('r-alto','Ritmo alto',false,{inVel:90,inMesesPreventa:9,inInicioObra:7})];
  d.escActivo='r-medio';d.inputs=copy(d.escenarios[1].inputs);d.savedInputs=copy(d.inputs);return d;
}
const lectura=p=>p.evaluate(()=>{
  const c=document.getElementById('pppCadena'),plots=[...c.querySelectorAll('.cad-plot')].filter(e=>e.getClientRects().length);
  const fuera=plots.flatMap(pl=>{const r=pl.getBoundingClientRect();return [...pl.querySelectorAll('.cad-nota.on')].filter(n=>{const q=n.getBoundingClientRect();return q.left<r.left-3||q.right>r.right+3||q.top<r.top-3||q.bottom>r.bottom+3;}).map(n=>n.textContent);});
  const nombre=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(typeof e.className==='string'&&e.className?'.'+e.className.trim().split(/\s+/).join('.'):'');
  const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
  const recortado=e=>{for(let a=e.parentElement;a&&a!==document.body;a=a.parentElement){const o=getComputedStyle(a).overflowX;if(o!=='visible')return true;}return false;};
  const salidos=raiz=>[...raiz.querySelectorAll('*')].filter(e=>visible(e)&&!recortado(e)&&(e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left<-1)).slice(0,6).map(e=>nombre(e)+'@'+Math.round(e.getBoundingClientRect().right));
  return {desborde:document.documentElement.scrollWidth-innerWidth,propios:salidos(c),ajenos:document.documentElement.scrollWidth-innerWidth>1?salidos(document.body).filter(x=>!x.includes('cad-')).slice(0,4):[],notas:c.querySelectorAll('.cad-nota.on').length,fuera,hud:document.getElementById('hudUtilidad').textContent.trim(),queda:document.querySelector('#cadCabD .cad-cifra').textContent.trim(),
    abiertos:[...c.querySelectorAll('.cad-cab')].map(b=>b.getAttribute('aria-expanded')).join(','),cuerpos:[...c.querySelectorAll('.cad-cuerpo')].filter(e=>e.getClientRects().length).length};
});
const finCadena=p=>p.waitForFunction(()=>window.PPPCadena.estado()&&!window.PPPCadena.estado().cadena,null,{timeout:30000});
(async()=>{
 for(const [name,engine] of Object.entries({chromium,webkit})){
  if(process.env.PPP_ENGINE&&process.env.PPP_ENGINE!==name)continue;
  const launch={headless:true};if(name==='chromium'&&process.env.PPP_SINGLE_PROCESS==='1')launch.args=['--single-process','--no-zygote'];
  const browser=await engine.launch(launch);
  try{
   // Teléfono, una versión, movimiento reducido: montaje, acordeón, misma cifra que el tablero, ligas y edición.
   const c=await browser.newContext({viewport:{width:430,height:932},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),t=await install(c),p=await c.newPage(),errors=[];
   p.on('pageerror',e=>errors.push(e.message));
   await p.goto('https://ppp.test/potenciales-yod/mixto.html');await p.locator('#pppCadena').waitFor();await p.waitForTimeout(700);
   const gets=t.gets.length;
   assert.equal(await p.locator('#pppCadena').count(),1);assert.equal(await p.locator('.ppp-card').count(),5);assert.equal(await p.locator('input[type=range]').count(),81);assert.equal(await p.locator('.ppp-all .kpi-box').count(),40);
   assert.ok(await p.evaluate(()=>{const c=document.getElementById('pppCadena'),hud=document.querySelector('.ppp-hud'),deck=document.getElementById('pppDeck');return !!(hud.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(c.compareDocumentPosition(deck)&Node.DOCUMENT_POSITION_FOLLOWING)&&!c.closest('.ppp-card');}),'El diagrama va después del encabezado de resultados y antes de las cinco tarjetas');
   assert.deepEqual(await p.locator('.cad-nom').allInnerTexts(),['Se vende','Entra y sale','En el banco y prestado','Lo que queda']);
   let s=await lectura(p);
   assert.deepEqual(s.propios,[]);assert.ok(s.desborde<=1,'Sin desborde horizontal: '+s.ajenos.join(' '));assert.equal(s.abiertos,'true,false,false,false');assert.equal(s.cuerpos,1);
   assert.equal(s.queda,s.hud,'«Lo que queda» es la misma utilidad del tablero');assert.ok(s.notas>=2,'Hay notas a mano: '+s.notas);assert.deepEqual(s.fuera,[],'Las notas caben en su gráfica');
   assert.match(await p.locator('.cad-una').innerText(),/Una sola versión/);assert.equal(await p.locator('.cad-vers').isVisible(),false);
   assert.match(await p.locator('.cad-fuente').innerText(),/Estimación de este plan.*no calcula/);
   if(process.env.PPP_SCREENSHOTS){fs.mkdirSync(process.env.PPP_SCREENSHOTS,{recursive:true});await p.locator('#pppCadena').screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-cadena-movil.png')});}
   for(const width of [320,390]){await p.setViewportSize({width,height:780});await p.waitForTimeout(450);for(const k of ['A','C']){if(await p.locator('#cadCab'+k).getAttribute('aria-expanded')!=='true'){await p.locator('#cadCab'+k).click();await p.waitForTimeout(300);}s=await lectura(p);assert.deepEqual(s.propios,[],'Nada del diagrama se sale a '+width+' px ('+k+')');assert.ok(s.desborde<=1,'Sin desborde a '+width+' px: '+s.ajenos.join(' '));assert.deepEqual(s.fuera,[],'Notas dentro a '+width);}}
   await p.setViewportSize({width:430,height:932});await p.waitForTimeout(450);await p.locator('#cadCabA').click();await p.waitForTimeout(250);s=await lectura(p);assert.equal(s.abiertos,'true,false,false,false');assert.deepEqual(s.propios,[]);
   for(const k of ['B','C','D']){await p.locator('#cadCab'+k).click();await p.waitForTimeout(250);s=await lectura(p);assert.equal(s.cuerpos,1,'Un solo eslabón abierto');assert.equal(await p.locator('#cadCab'+k).getAttribute('aria-expanded'),'true');assert.deepEqual(s.fuera,[]);if(k!=='D')assert.ok(s.notas>=2,'Notas en '+k);}
   assert.match(await p.locator('.cad-fila-util strong').innerText(),new RegExp('^'+s.hud.replace(/[$.]/g,'\\$&')+'$'));
   // Mover un dato del plan con su control original mueve el diagrama; el motor sigue siendo el del tablero.
   const antes=s.hud;await p.locator('#inPreViv').evaluate(e=>{e.value=Number(e.value)+Number(e.step||1)*20;e.dispatchEvent(new Event('input',{bubbles:true}));});await p.waitForTimeout(300);
   s=await lectura(p);assert.notEqual(s.hud,antes);assert.equal(s.queda,s.hud);assert.match(await p.locator('#cadCuerpoD .cad-dijo').innerText(),/antes/);
   assert.match(await p.locator('.cad-fila-util em').innerText(),/^[+−]\d/);
   // Cada eslabón lleva a la tarjeta del plan de donde sale y al control que lo mueve, sin enfocarlo.
   await p.locator('#cadCuerpoD .cad-liga').first().click();await p.waitForTimeout(500);assert.equal(await p.locator('.ppp-open').count(),1);assert.equal(await p.locator('[data-card=dMacro].ppp-open').count(),1);
   await p.locator('#pppBack').click();await p.waitForTimeout(400);assert.equal(await p.locator('.ppp-open').count(),0);
   await p.locator('#cadCabA').click();await p.waitForTimeout(250);await p.locator('#cadCuerpoA .cad-ajuste').first().click();await p.waitForTimeout(500);
   assert.ok(await p.evaluate(()=>{const i=document.getElementById('inVel'),card=i.closest('.ppp-card');return card.classList.contains('ppp-open')&&card.classList.contains('ppp-adjusting')&&i.closest('.input-group').classList.contains('cad-senalado')&&document.activeElement!==i;}),'El control queda a la vista, señalado y sin foco');
   assert.equal(await p.locator('#inVel').isVisible(),true);
   await p.locator('#pppBack').click();await p.waitForTimeout(400);
   await p.locator('.cad-una .cad-liga').click();await p.waitForTimeout(300);assert.equal(await p.locator('#pppVersiones').evaluate(e=>e.open),true);
   await p.locator('.cad-tabla').click();await p.waitForTimeout(300);assert.equal(await p.locator('#flowRows tr').first().isVisible(),true,'La tabla mes a mes queda a la vista');
   s=await lectura(p);assert.deepEqual(s.propios,[],'Nada del diagrama se sale del ancho');
   assert.equal(t.posts.length,0,'El diagrama no escribe');assert.equal(t.gets.length,gets,'El diagrama no pide nada a la red');assert.deepEqual(errors,[]);
   console.log('PASS '+name+': diagrama arriba de las cinco tarjetas, acordeón, misma utilidad que el tablero, edición viva con «antes», ligas a tarjeta y control, 320/390/430 px, sin red.');await c.close();

   // Escritorio con tres versiones y animación: los botones del diagrama son las versiones del caso y la cadena corre 1→4.
   const d=await browser.newContext({viewport:{width:1280,height:900}}),dt=await install(d,{seed:tresVersiones()}),q=await d.newPage(),de=[];q.on('pageerror',e=>de.push(e.message));
   await q.goto('https://ppp.test/potenciales-yod/mixto.html');await q.locator('#pppCadena').waitFor();await q.waitForTimeout(1700);
   s=await lectura(q);assert.equal(s.cuerpos,4,'Los cuatro eslabones a la vista');assert.deepEqual(s.propios,[]);assert.ok(s.desborde<=1,'Sin desborde: '+s.ajenos.join(' '));assert.deepEqual(s.fuera,[]);assert.ok(s.notas>=7,'Notas en escritorio: '+s.notas);assert.equal(s.queda,s.hud);
   assert.ok(await q.evaluate(()=>{const r=k=>document.querySelector('.cad-pan[data-k='+k+']').getBoundingClientRect(),A=r('A'),B=r('B'),C=r('C'),D=r('D');return B.left>=A.right-1&&Math.abs(B.top-A.top)<2&&C.top>=A.bottom-1&&Math.abs(C.left-A.left)<2&&Math.abs(D.left-B.left)<2&&Math.abs(D.top-C.top)<2;}),'Cuadrícula 2×2 que se lee 1→2→3→4');
   assert.deepEqual(await q.locator('.cad-ver span').allInnerTexts(),['Ritmo bajo','Ritmo medio','Ritmo alto']);assert.equal(await q.locator('.cad-ver[aria-pressed=true]').getAttribute('data-version'),'r-medio');
   assert.ok((await q.locator('.cad-ver small').allInnerTexts()).every(x=>/^queda [−]?\$\d/.test(x)));assert.match(await q.locator('.cad-rango p').innerText(),/Entre tus 3 versiones queda de \$/);
   const medio=s.hud;await q.locator('.cad-ver[data-version=r-alto]').click();
   assert.equal(await q.evaluate(()=>window.PPPCadena.estado().cadena),true,'La cadena arranca');
   assert.equal(await q.locator('[data-esc=r-alto]').getAttribute('aria-pressed'),'true','El botón del diagrama activa la versión con la función del tablero');
   await finCadena(q);await q.waitForTimeout(1300);
   s=await lectura(q);assert.notEqual(s.hud,medio);assert.equal(s.queda,s.hud);assert.equal(await q.locator('.cad-ver[aria-pressed=true]').getAttribute('data-version'),'r-alto');assert.deepEqual(s.fuera,[]);
   assert.equal((await q.locator('.cad-fila-util strong').innerText()).trim(),s.hud);
   assert.ok(await q.locator('.cad-con-antes').count()>=1,'Queda dibujada la línea de «antes»');assert.equal(await q.locator('.cad-dijo:visible').count(),4);assert.match(await q.locator('#cadCuerpoA .cad-dijo').innerText(),/por mes \(antes/);assert.match(await q.locator('#cadCuerpoD .cad-dijo').innerText(),/quedan .*\(antes/);
   assert.equal(await q.locator('.cad-rep').isVisible(),true);
   if(process.env.PPP_SCREENSHOTS)await q.locator('#pppCadena').screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-cadena-escritorio.png')});
   // Repetir despacio se puede interrumpir tocando el diagrama: queda en la lectura final.
   await q.locator('.cad-rep').click();await q.waitForFunction(()=>window.PPPCadena.estado().cadena,null,{timeout:8000});
   await q.locator('.cad-pan[data-k=A] .cad-plot').dispatchEvent('pointerdown');assert.equal(await q.evaluate(()=>window.PPPCadena.estado().cadena),false);s=await lectura(q);assert.equal(s.queda,s.hud);
   // Cambiar de versión con el control original del tablero también mueve el diagrama.
   await q.locator('#pppVersiones').evaluate(e=>{e.open=true;});await q.locator('[data-esc=r-bajo]').click();await q.waitForTimeout(400);await finCadena(q);await q.waitForTimeout(1300);
   s=await lectura(q);assert.equal(await q.locator('.cad-ver[aria-pressed=true]').getAttribute('data-version'),'r-bajo');assert.equal(s.queda,s.hud);assert.equal((await q.locator('.cad-fila-util strong').innerText()).trim(),s.hud);
   assert.equal(await q.evaluate(()=>{document.documentElement.setAttribute('data-tema','oscuro');return getComputedStyle(document.getElementById('pppCadena')).getPropertyValue('--cad-verde').trim();}),'#52a76d');
   assert.equal(dt.posts.length,0,'Cambiar de versión desde el diagrama no escribe');assert.deepEqual(de,[]);
   console.log('PASS '+name+': cuatro eslabones en cuadrícula, versiones del caso como botones, cadena 1→4 con «antes», repetir e interrumpir, versión cambiada desde el tablero, tema oscuro.');await d.close();

   // Modelo nativo: el diagrama dibuja el estado confirmado de Sheets, sin calcular.
   const seed=draft();seed.sheetModel=native();
   const n=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),nt=await install(n,{seed,native:true}),v=await n.newPage(),ne=[];v.on('pageerror',e=>ne.push(e.message));
   await v.goto('https://ppp.test/potenciales-yod/mixto.html');await v.locator('#pppCadena').waitFor();await v.waitForTimeout(900);
   s=await lectura(v);assert.equal(s.queda,s.hud);assert.match(await v.locator('.cad-fuente').innerText(),/Resultados de Sheets · revisión revision/);assert.ok(s.notas>=2);assert.deepEqual(s.fuera,[]);
   assert.equal(nt.posts.length,0);assert.deepEqual(ne,[]);
   console.log('PASS '+name+': modelo nativo dibujado desde la revisión confirmada, sin escrituras.');await n.close();
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1);});
