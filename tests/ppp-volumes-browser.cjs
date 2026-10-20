'use strict';
// Real vertical HTML with synthetic authenticated responses. All requests are
// intercepted; editing a proposal may never send native quantities or finances.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {install,native,draft}=require('./ppp-fixture.js');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 try{
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
   const context=await browser.newContext({viewport}),model=native(),net=await install(context,{seed:null,native:true,model});
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(/script\.google/.test(url.hostname)&&route.request().method()==='GET'&&url.searchParams.get('recurso')==='caso')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,caso:{...draft().caso,nombre_caso:'Torre Ruiseñor',escenarios_json:JSON.stringify(model.escenarios),calculo_sheet:model}})});return route.fallback();});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto('https://ppp.test/potenciales-yod/mixto.html?open=synthetic-case');
   const proposal=page.locator('#pppVolumes[data-verified="true"]');await proposal.waitFor({state:'visible',timeout:10000}).catch(async error=>{console.error({pageErrors:errors,state:await page.evaluate(()=>({sync:document.getElementById('syncDot')?.textContent,volumeHidden:document.getElementById('pppVolumes')?.hidden,volumeReady:!!window.PPPVolumes,gate:document.getElementById('gate')?.className,body:document.getElementById('casoNombreBar')?.textContent})),gets:net.gets});throw error;});
   const nativeView=()=>page.evaluate(()=>({inputs:Object.fromEntries([...document.querySelectorAll('input[type=range]')].map(n=>[n.id,n.value])),hero:['heroUtil','heroTir','readVol'].map(id=>document.getElementById(id)?.textContent),draft:localStorage.getItem('pyod_draft_v1')}));
   const before=await nativeView();assert.match(await proposal.textContent(),/aún sin aplicar al PPP/);
   await proposal.getByRole('button',{name:'3 volúmenes',exact:true}).click();
   for(const[i,values]of [[1,{units:17,levels:3,area:1800}],[2,{units:24,levels:7,area:2000}],[3,{units:11,levels:4,area:1300}]]){
    await proposal.getByRole('spinbutton',{name:'Viviendas · volumen '+i,exact:true}).fill(String(values.units));
    await proposal.getByRole('spinbutton',{name:'Niveles · volumen '+i,exact:true}).fill(String(values.levels));
    await proposal.getByRole('spinbutton',{name:'Superficie construida (m²) · volumen '+i,exact:true}).fill(String(values.area));
    await proposal.getByRole('textbox',{name:'Etapa · volumen '+i,exact:true}).fill('Etapa sintética '+i);
   }
   await proposal.getByRole('button',{name:'1 volumen',exact:true}).click();await proposal.getByRole('button',{name:'3 volúmenes',exact:true}).click();
   for(const[i,units]of [[1,17],[2,24],[3,11]])assert.equal(await proposal.getByRole('spinbutton',{name:'Viviendas · volumen '+i,exact:true}).inputValue(),String(units));
   assert.match(await proposal.locator('.pppv-totals').textContent(),/52 viviendas/);assert.deepEqual(await nativeView(),before);assert.equal(net.posts.length,0);
   // A changed native revision is read, never computed by this proposal editor.
   model.revision='revision-synthetic-2';await page.evaluate(()=>document.getElementById('sheetRecargar').click());
   await page.waitForFunction(()=>document.querySelector('#pppVolumes .pppv-version')?.textContent.includes('revision-synthetic-2'));
   const continueButton=proposal.getByRole('button',{name:'Revisar y continuar la propuesta',exact:true});await continueButton.waitFor({state:'visible'});
   assert.equal(await proposal.getByRole('spinbutton',{name:'Viviendas · volumen 1',exact:true}).inputValue(),'');await continueButton.click();
   for(const[i,units]of [[1,17],[2,24],[3,11]])assert.equal(await proposal.getByRole('spinbutton',{name:'Viviendas · volumen '+i,exact:true}).inputValue(),String(units));
   assert.equal(net.posts.length,0);assert.deepEqual((await nativeView()).inputs,before.inputs);assert.deepEqual((await nativeView()).hero,before.hero);assert.deepEqual(errors,[]);
   if(process.env.PPP_VOLUME_SCREENSHOTS){await proposal.scrollIntoViewIfNeeded();await page.screenshot({path:process.env.PPP_VOLUME_SCREENSHOTS+'/volumes-'+viewport.width+'.png',fullPage:false});}
   await context.close();console.log(viewport.width+'px: independent3-volume proposal, explicit revision continuation, unchanged native figures and zero business POST');
  }
  const context=await browser.newContext(),net=await install(context,{seed:null,native:true}),page=await context.newPage();await page.goto('https://ppp.test/potenciales-yod/mixto.html?open=synthetic-case&volume_draft=1');
  await page.waitForFunction(()=>document.getElementById('syncDot')?.textContent.includes('Sheets · revisión'));
  assert.equal(await page.locator('#pppVolumes').isVisible(),false,'query flags cannot activate another authenticated case');assert.equal(net.posts.length,0);await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
