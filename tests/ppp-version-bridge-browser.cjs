'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {install,native}=require('./ppp-fixture.js');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});try{for(const page of ['mixto.html','macrolotes.html']){
 const context=await browser.newContext({viewport:{width:430,height:932}}),m=native(),first=m.escenarios[0];
 m.escenarios=[{...first,id:'old',nombre:'Anterior'},{...first,id:'new',nombre:'Última inscrita',inputs:{...first.inputs,inTerreno:1900}}];m.activo='old';m.estados={old:m.estados[first.id],new:m.estados[first.id]};
 const net=await install(context,{seed:null,native:page==='mixto.html',model:m});
 // Override only the synthetic case record to preserve both real UI variants.
 await context.route('https://script.google.com/**',async route=>{const u=new URL(route.request().url());if(u.searchParams.get('recurso')!=='caso')return route.fallback();return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,caso:{caso_id:'synthetic-case',palabra:'synthetic',nombre_caso:'Proyecto sintético',version:1,escenarios_json:JSON.stringify(m.escenarios.map(v=>({...v,activo:v.id==='old'}))),...(page==='mixto.html'?{calculo_sheet:m}:{})}})});});
 await context.route('https://ppp.test/yod-portal/despacho3d/test.html',route=>route.fulfill({contentType:'text/html',body:`<iframe src="/potenciales-yod/${page}?open=synthetic-case&agent=1&embed=1" style="width:100%;height:800px"></iframe><script>window.snapshots=[];addEventListener('message',e=>{if(e.data.type==='yod:ppp:state')snapshots.push(e.data)});setInterval(()=>{document.querySelector('iframe').contentWindow.postMessage({type:'yod:ppp:hello',version:1,nonce:'browser-test',case_id:'agent-case',board_case_id:'synthetic-case'},location.origin)},100)</script>`}));
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('https://ppp.test/yod-portal/despacho3d/test.html');
 await p.waitForFunction(()=>snapshots.some(s=>s.board?.scenario_id==='new'),{},{timeout:20000});
 const before=await p.evaluate(()=>snapshots.at(-1).board);assert.equal(before.version_context.viewed_scenario_id,'old');assert.equal(before.inputs.inTerreno,1900);assert.equal(before.fields.every(f=>!f.editable),true);
 const frame=p.frames().find(f=>f.url().includes('/potenciales-yod/'));if(page==='mixto.html'){const summary=frame.locator('#pppVersiones>summary');if(await summary.count())await summary.click();}
 assert.equal(await frame.locator('[data-esc]').count(),2);
 // No controls were replaced and opening the bridge did not issue a business write.
 assert.equal(net.posts.length,0);assert.deepEqual(errors,[]);await context.close();console.log(page+': original versions, latest defended, no writes; mobile passed');
 }}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
