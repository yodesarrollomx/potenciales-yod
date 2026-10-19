'use strict';
// Macrolotes · recorrido por clics (decisiones → sección → fila con valor → control). Transporte aislado: cero escrituras.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {install}=require('./ppp-fixture.js');
(async()=>{for(const [name,engine] of Object.entries({chromium,webkit})){
 if(process.env.PPP_ENGINE&&process.env.PPP_ENGINE!==name)continue;
 const b=await engine.launch({headless:true});try{
  const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const t=await install(c,{seed:null}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('https://ppp.test/potenciales-yod/macrolotes.html');
  await p.waitForFunction(()=>document.querySelectorAll('.pm-card .pm-sum').length===6&&[...document.querySelectorAll('.pm-sum')].every(s=>s.textContent.trim()));
  const htmlRanges=await p.evaluate(()=>document.querySelectorAll('input[type=range]').length);
  const ids=await p.evaluate(()=>[...document.querySelectorAll('[id]')].map(e=>e.id));assert.equal(new Set(ids).size,ids.length,'IDs stay unique');
  // Página: barra de una línea, decisiones antes de los gráficos, un gráfico a la vez.
  assert.match(await p.locator('.pm-hudline').innerText(),/Utilidad/);
  assert.equal(await p.locator('.sticky-header .urban-hud').isVisible(),false);
  await p.locator('.pm-hudline').click();assert.equal(await p.locator('.sticky-header .urban-hud').isVisible(),true,'HUD expands on tap');await p.locator('.pm-hudline').click();
  assert.ok(await p.evaluate(()=>{const d=document.querySelector('.pm-col-dec'),v=document.querySelector('.pm-col-viz');return d.compareDocumentPosition(v)&Node.DOCUMENT_POSITION_FOLLOWING;}),'Decisions come before charts');
  assert.equal(await p.locator('.pm-col-viz .viz-card:visible').count(),1);await p.locator('.pm-tab').nth(2).click();
  assert.equal(await p.locator('.pm-tab').nth(2).getAttribute('aria-selected'),'true');assert.equal(await p.locator('.pm-col-viz .viz-card:visible').count(),1);
  // N1: lista cerrada, solo encabezados.
  for(const card of await p.locator('.pm-card').all()){assert.equal(await card.locator('.kpi-grid').isVisible(),false);assert.equal(await card.locator('.drawer').isVisible(),false);}
  // N2: abrir Producto muestra la franja y secciones con resumen.
  await p.locator('.card[data-card=dMezcla] > .card-header').click();
  assert.equal(await p.locator('.card[data-card=dMezcla] > .card-header').getAttribute('aria-expanded'),'true');
  const secs=p.locator('#dMezcla .pm-sec');assert.ok(await secs.count()>=3);
  for(const s of await secs.all())assert.ok((await s.locator('.pm-secsum').innerText()).trim().length>0,'Every section shows a summary');
  assert.equal(await p.locator('#dMezcla .pm-row:visible').count(),0,'Sections start closed');
  // N3: abrir dos secciones a la vez; filas con su valor y sin control visible.
  await p.locator('#dMezcla-sec2 > .tema-head').click();await p.locator('#dMezcla-sec3 > .tema-head').click();
  assert.ok(await p.locator('#dMezcla-sec2 .pm-row:visible').count()>0&&await p.locator('#dMezcla-sec3 .pm-row:visible').count()>0);
  const row=p.locator('#dMezcla-sec2 .pm-row').first(),slider=row.locator('input[type=range]');
  assert.ok((await row.locator('.val-display').innerText()).trim().length>0);assert.equal(await slider.isVisible(),false);
  // N4: tocar la fila abre su control; mover el control repinta el resumen de la tarjeta.
  await row.locator('.input-header label').click();await slider.waitFor({state:'visible'});
  const before=await p.locator('.card[data-card=dMezcla] .pm-sum').innerText();
  await slider.evaluate(i=>{i.value=String(Number(i.max));i.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.waitForFunction(o=>document.querySelector('.card[data-card=dMezcla] .pm-sum').textContent!==o,before);
  assert.equal(await row.locator('.pm-changed').isVisible(),true,'Changed value is marked');
  await p.locator('#dMezcla-sec2 .pm-row').nth(1).locator('.input-header label').click();
  assert.equal(await p.locator('#dMezcla .pm-row.pm-edit').count(),1,'One control open at a time');
  // Interruptores 0/1 como switch.
  const sw=p.locator('#dMezcla .pm-switch').first();if(await sw.count()){const id=await sw.evaluate(b=>b.closest('.pm-row').querySelector('input').id),v=await p.evaluate(id=>document.getElementById(id).value,id);await sw.click();assert.notEqual(await p.evaluate(id=>document.getElementById(id).value,id),v);}
  // Un salto a un control escondido abre tarjeta, sección y fila.
  const hidden=await p.evaluate(()=>document.querySelector('#dCapital .pm-row input[type=range]').id);
  await p.evaluate(id=>PPPMacroCards.reveal(document.getElementById(id)),hidden);assert.equal(await p.locator('#'+hidden).isVisible(),true);
  assert.equal(await p.evaluate(()=>document.querySelectorAll('input[type=range]').length),htmlRanges,'Controls are moved, never cloned');
  for(const width of [320,390,430,1280]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow at '+width);}
  assert.equal(t.posts.length,0);assert.deepEqual(errors,[]);await c.close();
  console.log('PASS '+name+': one-line HUD, decisions before charts, tabs, closed list, sections with summaries, value rows open one control, switches, reveal, same controls, responsive, no business writes.');
 }finally{await b.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
