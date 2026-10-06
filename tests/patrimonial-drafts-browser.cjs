'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {install}=require('./ppp-fixture.js'),fixture=require('./fixtures/patrimonial-native.json');
const copy=x=>JSON.parse(JSON.stringify(x));
(async()=>{for(const [name,engine] of Object.entries({chromium,webkit})){
 if(process.env.PPP_ENGINE&&process.env.PPP_ENGINE!==name)continue;
 const browser=await engine.launch({headless:true});try{
  const context=await browser.newContext({viewport:{width:390,height:844}});await install(context,{seed:null});
  const ids=['synthetic-case','synthetic-B'],models=Object.fromEntries(ids.map(id=>{const m=copy(fixture);m.caso_id=id;return[id,m];}));let posts=0;
  await context.route('https://script.google.com/**',async route=>{
   const req=route.request(),u=new URL(req.url());let out={ok:true};
   if(req.method()==='POST'){const d=req.postDataJSON();if(!d)return route.abort();if(d.tipo!=='bitacora'){posts++;out={ok:false,error:'offline'};}}
   else if(u.searchParams.get('recurso')==='caso'){const id=u.searchParams.get('id');out={ok:true,caso:{caso_id:id,nombre_caso:id,palabra:id,version:1,calculo_sheet:models[id]}};}
   else if(u.searchParams.get('recurso')==='sheet-model')out=models[u.searchParams.get('id')];
   else if(u.searchParams.get('recurso')==='lista')out={ok:true,casos:ids.map(id=>({caso_id:id,nombre_caso:id,palabra:id,version:1}))};
   else if(u.searchParams.get('recurso')==='canje')out={ok:true,token:'sy-synthetic-browser-session',boards:'PT',rol:'admin'};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(out)});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto('https://ppp.test/potenciales-yod/patrimonial.html?open=synthetic-case',{waitUntil:'domcontentloaded'});await page.locator('#patrimonialNative').waitFor();
  await page.locator('#pnCaseName').fill('Nombre borrador A');await page.locator('#pnCaseNotes').fill('Notas borrador A');
  await page.locator('[data-native-field=unidad01_tipo]').selectOption('1');await page.waitForFunction(()=>document.querySelector('.pn-status').textContent.includes('Sin confirmación'));
  for(const [field,value] of [['unidad01_renta','0'],['inCus','']]){const before=posts;await page.locator(`[data-native-field=${field}]`).fill(value);await page.locator(`[data-native-field=${field}]`).dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('.pn-status').textContent.includes('Sin confirmación'));while(posts===before)await page.waitForTimeout(20);}
  const beforeSwitch=posts;
  async function open(id){await page.locator('[data-action=cases]').click();await page.locator(`#listaCasos [data-id="${id}"]`).click();await page.waitForFunction(id=>document.querySelector('#patrimonialNative h1')?.textContent===id,id);}
  await open('synthetic-B');await open('synthetic-case');
  assert.equal(await page.locator('[data-native-field=unidad01_tipo]').inputValue(),'1');assert.equal(await page.locator('[data-native-field=unidad01_renta]').inputValue(),'0');assert.equal(await page.locator('[data-native-field=inCus]').inputValue(),'');
  assert.equal(await page.locator('#pnCaseName').inputValue(),'Nombre borrador A');assert.equal(await page.locator('#pnCaseNotes').inputValue(),'Notas borrador A');assert.equal(posts,beforeSwitch,'Opening another case must not replay pending writes');
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#patrimonialNative').waitFor();assert.equal(await page.locator('#pnCaseNotes').inputValue(),'Notas borrador A');assert.equal(posts,beforeSwitch);
  await context.close();console.log('PASS '+name+': A/B/A retains Local, rent zero, missing CUS and metadata; reload performs no implicit writes.');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
