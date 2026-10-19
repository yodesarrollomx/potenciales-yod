'use strict';
// Macrolotes · tarjetas resumen y mini-tarjetas por subgrupo. Transporte aislado: ninguna escritura sale del navegador.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {install}=require('./ppp-fixture.js');
(async()=>{for(const [name,engine] of Object.entries({chromium,webkit})){
 if(process.env.PPP_ENGINE&&process.env.PPP_ENGINE!==name)continue;
 const b=await engine.launch({headless:true});try{
  const c=await b.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const t=await install(c,{seed:null}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('https://ppp.test/potenciales-yod/macrolotes.html');
  await p.waitForFunction(()=>document.querySelectorAll('.pm-chart').length===4);
  const before=await p.evaluate(()=>({ranges:document.querySelectorAll('input[type=range]').length,ids:[...document.querySelectorAll('[id]')].map(e=>e.id)}));
  assert.equal(new Set(before.ids).size,before.ids.length,'IDs stay unique');
  // Tarjeta cerrada: cada dato visible lleva icono y nunca hay más de 4 visibles.
  for(const card of await p.locator('.card[data-card]').all()){
    const visible=await card.locator('.kpi-box:visible').count();assert.ok(visible>0&&visible<=4,'At most four closed-card facts');
    assert.equal(await card.locator('.kpi-box:visible .pm-kpi-icon').count(),visible,'Every visible fact has an icon');
  }
  // Tarjeta abierta: un punto por subgrupo; varias mini-tarjetas abiertas a la vez.
  await p.locator('.card[data-card=dMezcla] .card-header').click();
  const heads=await p.locator('#dMezcla .tema-head').count(),chips=p.locator('#dMezcla .pm-chip');
  assert.equal(await chips.count(),heads);assert.equal(await p.locator('#dMezcla .pm-mini.pm-on').count(),1,'First topic opens by default');
  await chips.nth(2).click();await chips.nth(3).click();
  assert.equal(await p.locator('#dMezcla .pm-mini.pm-on').count(),3);
  assert.equal(await chips.nth(2).getAttribute('aria-pressed'),'true');
  await chips.nth(2).click();assert.equal(await p.locator('#dMezcla .pm-mini.pm-on').count(),2,'A chip closes its mini-card');
  await p.locator('#dMezcla .pm-all').click();assert.equal(await p.locator('#dMezcla .pm-mini.pm-on').count(),heads);
  // Mismos switches: mover uno dentro de su mini-tarjeta recalcula y repinta la gráfica.
  await p.locator('.card[data-card=dCostos] .card-header').click();
  const chart=p.locator('.card[data-card=dCostos] .pm-chart');const old=await chart.innerHTML();
  await p.locator('#dCostos .pm-mini.pm-on input[type=range]').first().evaluate(i=>{i.value=String(Number(i.max));i.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.waitForFunction(o=>document.querySelector('.card[data-card=dCostos] .pm-chart').innerHTML!==o,old);
  // Un salto a un control escondido (fórmulas) abre su tarjeta y su mini-tarjeta.
  const hidden=await p.evaluate(()=>{const body=[...document.querySelectorAll('#dCapital .tema-body')].find(b=>!b.classList.contains('abierto'));return body.querySelector('input[type=range]').id;});
  await p.evaluate(id=>document.getElementById(id).closest('.pm-mini').querySelector('.tema-head').click(),hidden);
  assert.equal(await p.locator('#'+hidden).isVisible(),true);
  const after=await p.evaluate(()=>document.querySelectorAll('input[type=range]').length);assert.equal(after,before.ranges,'Controls are moved, never cloned');
  for(const width of [320,390,430,1280]){await p.setViewportSize({width,height:932});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow at '+width);}
  assert.equal(t.posts.length,0);assert.deepEqual(errors,[]);await c.close();
  console.log('PASS '+name+': four facts with icons, small charts, topic chips open several mini-cards, same controls recalculate, responsive, no business writes.');
 }finally{await b.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
