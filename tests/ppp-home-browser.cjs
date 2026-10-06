'use strict';
// Leaflet y shell reales, 15 casos sintéticos; servicios remotos interceptados.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {install}=require('./ppp-fixture.js');
const assets=process.env.PPP_MAP_ASSETS||'/tmp/ppp-map-assets';
const types=['macrolotes','vertical','unifamiliar','residencial','patrimonial'];
const pages=['macrolotes','mixto','unifamiliar','residencial','patrimonial'];
const rows=t=>Array.from({length:3},(_,i)=>({caso_id:`prueba ${t}/${i}`,nombre_caso:`Proyecto de prueba ${t} ${i+1}`,palabra:`ensayo-${i+1}`,estado:'ANÁLISIS',utilidad:i?1200000:''}));
async function fixture(context,options={}){
 const base=await install(context,{seed:null}),calls=[],writes=[];
 await context.route('https://unpkg.com/**',route=>{
  const u=route.request().url(),gesture=u.includes('gesture-handling'),css=u.includes('.css');
  return route.fulfill({contentType:css?'text/css':'text/javascript',body:fs.readFileSync(path.join(assets,(gesture?'gesture':'leaflet')+(css?'.css':'.js')))});
 });
 await context.route('https://script.google.com/**',async route=>{
  const req=route.request(),u=new URL(req.url()),action=u.searchParams.get('recurso'),t=u.searchParams.get('tipo');
  if(req.method()==='POST'){const b=req.postDataJSON();if(b&&b.tipo!=='bitacora')writes.push(b);return route.fallback();}
  if(action==='lista'){
   calls.push(t);
   const status=options.status?.[t];
   if(status==='delay')await new Promise(r=>setTimeout(r,options.delay||1800));
   if(status==='network')return route.abort();
   if(status==='malformed')return route.fulfill({contentType:'application/json',body:'{"ok":true}'});
   const data=status==='denied'?{ok:false,error:'board'}:{ok:true,casos:status==='empty'?[]:rows(t)};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)}).catch(()=>{});
  }
  if(action==='mapa'){
   if(options.mapFail)return route.abort();
   return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,pines:options.pins||types.map((t,i)=>({tipo:t,lat:20+i,lng:-104+i,nombre:'Pin de prueba',lugar:'Lugar sintético',dato1:'Referencia',dato2:'',link:''}))})});
  }
  return route.fallback();
 });
 return {base,calls,writes};
}
async function waitForMapIdle(p){
 // Loading the catalogue does not finish ajusta(): it schedules fitBounds after 300 ms.
 // Observe a stable viewport before the menu gesture, without stopping map animation.
 await p.waitForFunction(()=>{
  const map=window._pyodMap;if(!map||map._panAnim?._inProgress||map._animatingZoom)return false;
  const center=map.getCenter(),size=map.getSize(),key=JSON.stringify([center.lat,center.lng,map.getZoom(),size.x,size.y]);
  if(size.x<=0||size.y<=0)return false;
  const now=performance.now(),last=window.__pppMapIdle;
  if(!last||last.key!==key){window.__pppMapIdle={key,since:now};return false;}
  return now-last.since>=400;
 },null,{timeout:5000});
}
async function menuAboveMap(p){
 await waitForMapIdle(p);
 await p.locator('#yodBurger').click();await p.waitForFunction(()=>document.querySelector('.yod-sidebar').getBoundingClientRect().left>=-1);
 assert.ok(await p.evaluate(()=>{const side=document.querySelector('.yod-sidebar'),r=side.getBoundingClientRect();return document.elementFromPoint(Math.min(r.right-16,100),300)?.closest('.yod-sidebar')===side;}),'Sidebar is above map, controls and catalogue');
 assert.ok(await p.evaluate(()=>document.elementFromPoint(innerWidth-10,300)?.closest('.yod-scrim')),'Scrim receives taps above map');
 const before=await p.evaluate(()=>window._pyodMap.getCenter());
 await p.locator('.yod-scrim').click({position:{x:await p.evaluate(()=>innerWidth-5),y:300}});
 await p.waitForTimeout(350);assert.equal(await p.locator('.yod-nav-open').count(),0);
 assert.deepEqual(await p.evaluate(()=>window._pyodMap.getCenter()),before,'Menu gesture does not pan the map');
}
(async()=>{
 for(const [name,engine] of Object.entries({chromium,webkit})){
  if(process.env.PPP_ENGINE&&process.env.PPP_ENGINE!==name)continue;
  const browser=await engine.launch({headless:true});
  try{
   const c=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true}),net=await fixture(c),p=await c.newPage(),errors=[];
   p.on('pageerror',e=>errors.push(e.message));
   for(const page of ['index','mapa']){
    await p.goto('https://ppp.test/potenciales-yod/'+page+'.html');
    await p.waitForFunction(()=>document.getElementById('cntTodos').textContent==='15');
    await p.locator('#btnTodos').click();assert.equal(await p.locator('#btnTodos').getAttribute('aria-expanded'),'true');assert.equal(await p.locator('#listaTodos .lt-item').count(),15);assert.equal(await p.locator('.lt-group').count(),5);
    for(let i=0;i<types.length;i++)assert.equal(await p.locator('.lt-group').nth(i).locator('a').first().getAttribute('href'),pages[i]+'.html?open=prueba%20'+types[i]+'%2F0');
    const scroll=await p.locator('#listaTodos').evaluate(e=>{e.scrollTop=e.scrollHeight;return e.scrollTop;});assert.ok(scroll>0,'Catalogue scrolls independently');
    // Force an in-flight initial pan so readiness cannot depend on machine speed.
    await p.evaluate(()=>window._pyodMap.panBy([24,-12],{animate:true,duration:.6}));
    await menuAboveMap(p);
    await p.locator('#btnTodos').click();assert.equal(await p.locator('#listaTodos').isVisible(),false);
    if(page==='index'){
     assert.equal(await p.locator('.ppp-main-link svg').count(),5,'Icons do not depend on a remote icon font');
     assert.equal(await p.locator('#planificadores .ppp details p').count(),5,'All descriptions retained');
     for(const width of [320,390,430,1280]){
      await p.setViewportSize({width,height:932});await p.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1,{},{timeout:5000}).catch(async e=>{console.error(await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.getBoundingClientRect().toJSON(),wide:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1&&r.width>1}).slice(0,20).map(e=>({tag:e.tagName,cls:e.className,id:e.id,rect:e.getBoundingClientRect().toJSON()}))})));throw e;});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No overflow at '+width);
      const boxes=await p.locator('.ppp-main-link').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));assert.ok(boxes.every(box=>Math.abs(boxes[0].top-box.top)<2&&box.width>=44),'Five touch targets share a row at '+width);
     }
     await p.setViewportSize({width:430,height:932});await p.locator('.ppp details summary').first().click();assert.equal(await p.locator('.ppp details p').first().isVisible(),true);
     await p.locator('#temaBtn').click();assert.equal(await p.locator('html').getAttribute('data-tema'),'oscuro');
     await p.locator('.ppp details summary').first().click();await p.locator('#planificadores').scrollIntoViewIfNeeded();
     if(process.env.PPP_SCREENSHOTS){fs.mkdirSync(process.env.PPP_SCREENSHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,name+'-home-icons.png')});}
    }
   }
   assert.deepEqual(errors,[]);assert.equal(net.writes.length,0);await c.close();
   console.log('PASS '+name+': 15 cases, 5 types, correct URLs, catalogue scroll, sidebar above Leaflet, 5 SVG tiles, descriptions, 320/390/430/1280 px, no writes.');
   const options={status:{vertical:'network',patrimonial:'malformed',residencial:'delay'},mapFail:true};
   const d=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true}),partial=await fixture(d,options),q=await d.newPage();
   await q.goto('https://ppp.test/potenciales-yod/index.html');await q.locator('#btnTodos').click();
   await q.waitForFunction(()=>document.getElementById('cntTodos').textContent==='6+');assert.match(await q.locator('.lt-status').innerText(),/Cargando|consultar/);assert.equal(await q.locator('.lt-item').count(),6);
   await q.waitForFunction(()=>document.getElementById('cntTodos').textContent==='9+');assert.match(await q.locator('.lt-status').innerText(),/2 de 5/);
   options.status={};await q.locator('.lt-retry').click();await q.waitForFunction(()=>document.getElementById('cntTodos').textContent==='15');
   assert.equal(partial.calls.filter(t=>t==='macrolotes').length,1,'Successful lists are not fetched on partial retry');
   assert.equal(await q.locator('.lt-status').count(),0,'No stale error after recovery');assert.equal(partial.writes.length,0);await d.close();
   console.log('PASS '+name+': catalogue independent of failed map; partial progress, malformed response, retry only failed types, complete count after recovery.');
   // A saved map access must survive a delayed/failed list, but never denial/empty confirmation.
   const recovery={status:{vertical:'network'},pins:[{tipo:'vertical',lat:29,lng:-110,nombre:'Terreno de prueba',dato1:'Dato histórico 999',dato2:'Importe histórico 999',link:'https://alexpueblag.github.io/potenciales-yod/mixto.html?open=prueba%20vertical%2F0'},{tipo:'vertical',nombre:'Duplicado',link:'https://alexpueblag.github.io/potenciales-yod/mixto.html?open=prueba%20vertical%2F0'},{tipo:'vertical',nombre:'Ajeno',link:'https://example.org/potenciales-yod/mixto.html?open=bad'}]};
   const rc=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true}),rn=await fixture(rc,recovery),rp=await rc.newPage();await rp.goto('https://ppp.test/potenciales-yod/index.html');await rp.locator('#btnTodos').click();await rp.waitForFunction(()=>document.getElementById('cntTodos').textContent==='13+');
   await rp.evaluate(()=>window._pyodMap.eachLayer(layer=>{if(layer.getPopup)layer.openPopup();}));assert.equal(await rp.locator('.pp-a').getAttribute('href'),'mixto.html?open=prueba%20vertical%2F0');await rp.evaluate(()=>window._pyodMap.closePopup());
   const group=rp.locator('.lt-group[data-type=vertical]');assert.equal(await group.locator('.lt-item').count(),1);assert.equal(await group.locator('a').getAttribute('href'),'mixto.html?open=prueba%20vertical%2F0');assert.match(await group.innerText(),/Acceso del mapa/);assert.equal((await rp.locator('#listaTodos').innerText()).includes('999'),false);assert.equal((await rp.locator('#listaTodos').innerText()).includes('Ajeno'),false);
   await rp.locator('#listaTodos').evaluate(e=>e.scrollTop=e.scrollHeight);assert.ok(await rp.locator('.lt-feedback').evaluate(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return a.top<b.top+8;}),'Failure remains visible above the scroll');
   recovery.status={};await group.locator('.lt-retry-type').click();await rp.waitForFunction(()=>document.getElementById('cntTodos').textContent==='15');assert.equal(await group.locator('.lt-item').count(),3);assert.equal((await group.innerText()).includes('Acceso del mapa'),false);assert.equal(rn.calls.filter(t=>t==='macrolotes').length,1);assert.equal(rn.writes.length,0);await rp.evaluate(()=>{localStorage.removeItem('pyod_clave_v1');PPPCatalog.load('');PPPCatalog.mapData('old-session',[{tipo:'vertical',nombre:'Private late pin',link:'mixto.html?open=late'}]);});assert.equal(await rp.locator('.lt-item').count(),0);await rc.close();
   for(const failure of ['denied','empty']){const cc=await browser.newContext({viewport:{width:430,height:932}});const blocked={status:{vertical:failure},pins:recovery.pins};await fixture(cc,blocked);const cp=await cc.newPage();await cp.goto('https://ppp.test/potenciales-yod/mapa.html');await cp.locator('#btnTodos').click();await cp.waitForFunction(expected=>document.getElementById('cntTodos').textContent===expected,failure==='denied'?'12+':'12');assert.equal(await cp.locator('.lt-group[data-type=vertical] .lt-item').count(),0);if(failure==='denied'){blocked.status.vertical='network';await cp.locator('.lt-retry').click();await cp.waitForFunction(()=>document.querySelector('.lt-retry'));assert.equal(await cp.locator('.lt-group[data-type=vertical] .lt-item').count(),0,'Transport retry cannot undo an access rejection');blocked.status.vertical='delay';await cp.locator('.lt-retry').click();assert.equal(await cp.locator('.lt-group[data-type=vertical] .lt-item').count(),0,'Rejected access stays suppressed during retry');await cp.waitForFunction(()=>document.getElementById('cntTodos').textContent==='15');}await cc.close();}
   console.log('PASS '+name+': saved map access survives missing list, canonical URL, no stale financial data or duplicates, visible feedback, targeted retry; denial and confirmed empty list remain authoritative.');
   const delayed={status:Object.fromEntries(types.map(t=>[t,'delay'])),delay:350};
   const e=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true}),slow=await fixture(e,delayed);
   await e.addInitScript(()=>{const native=setTimeout;window.setTimeout=(fn,ms,...args)=>native(fn,ms===60000?100:ms,...args);});
   const v=await e.newPage();await v.goto('https://ppp.test/potenciales-yod/index.html');await v.locator('#btnTodos').click();await v.locator('.lt-retry').waitFor();assert.match(await v.locator('.lt-status').innerText(),/5 de 5/);assert.equal(await v.locator('#cntTodos').innerText(),'…');
   delayed.status=Object.fromEntries(types.map(t=>[t,'empty']));await v.locator('.lt-retry').click();await v.waitForFunction(()=>document.getElementById('cntTodos').textContent==='0');assert.match(await v.locator('.lt-status').innerText(),/Aún no hay/);
   delayed.status=Object.fromEntries(types.map(t=>[t,'delay']));
   await v.evaluate(()=>{localStorage.setItem('pyod_clave_v1','new-synthetic-session');PPPCatalog.load('new-synthetic-session');localStorage.removeItem('pyod_clave_v1');PPPCatalog.load('');});await v.waitForTimeout(450);assert.equal(await v.locator('.lt-item').count(),0);assert.match(await v.locator('.lt-status').innerText(),/Entra con tu sesión/);assert.equal(slow.writes.length,0);await e.close();
   console.log('PASS '+name+': bounded timeout, true empty state, session change discards late private results.');
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
