const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{for(const [name,engine]of Object.entries({chromium,webkit})){
 const browser=await engine.launch({headless:true});
 try{const page=await browser.newPage({viewport:{width:430,height:932}});
  await page.route('**/*',route=>route.fulfill({body:'<html><head></head><body><div id="anchor"></div></body></html>',contentType:'text/html'}));
  await page.goto('https://synthetic.invalid/');
  await page.addStyleTag({path:path.resolve(__dirname,'../ppp-land-in-kind.css')});
  await page.addScriptTag({path:path.resolve(__dirname,'../ppp-land-in-kind.js')});
  await page.evaluate(()=>{
   window.posts=[];window.context={caseId:'synthetic',scenarioId:'source',native:true,ready:true,identity:'test'};
   window.answer={ok:true,schema:'native-land-in-kind-v1',case_id:'synthetic',scenario_id:'source',revision:'r1',versions:[{id:'source',name:'Programa de prueba',terms:null,results:{buildFinish:12,totalMonths:18}}]};
   window.editor=PPPLandUI.mount({anchor:document.getElementById('anchor'),context:()=>window.context,read:async()=>window.answer,busy:()=>{},refresh:async id=>{window.context.scenarioId=id;},write:async p=>{window.posts.push(p);await new Promise(r=>setTimeout(r,150));window.answer={...window.answer,scenario_id:'new-version',revision:'r2',versions:[...window.answer.versions,{id:'new-version',name:p.name,terms:p.terms,results:{kindValue:123456,kindReservedArea:12.34,kindBalanced:false}}]};return window.answer;}});
  });
  await page.locator('summary').click();await page.locator('[data-load]').click();
  await page.locator('[name=method]').selectOption('2');assert.equal(await page.locator('[name=annual_rate]').isVisible(),true);assert.equal(await page.locator('[name=profit_share]').isVisible(),false);
  await page.locator('[name=upfront]').fill('3000');await page.locator('[name=version_name]').fill('Interés de prueba');
  await page.locator('[data-action=duplicate]').click();assert.equal(await page.locator('[data-action=duplicate]').isDisabled(),true);
  await page.getByText('Acuerdo guardado y visor actualizado.',{exact:true}).waitFor();
  const posts=await page.evaluate(()=>window.posts);assert.equal(posts.length,1);assert.equal(posts[0].terms.upfront,3000);assert.equal(posts[0].terms.method,2);assert.equal(posts[0].revision_esperada,'r1');
  assert.match(await page.locator('[data-comparison]').innerText(),/123,456/);assert.match(await page.locator('[data-comparison]').innerText(),/Recalcular viviendas/);
  await page.locator('[name=annual_rate]').fill('25');await page.locator('[data-action=balance]').click();assert.match(await page.locator('[data-status]').innerText(),/Guarda primero/);assert.equal(await page.evaluate(()=>window.posts.length),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  console.log('PASS '+name+': mobile editor, explicit method, one request, native readback, stale-result notice');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
