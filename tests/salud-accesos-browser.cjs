'use strict';
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const html=fs.readFileSync('accesos.html','utf8');
const client=fs.readFileSync(process.env.SALUD_CLIENT_SOURCE,'utf8');
const now=new Date().toISOString();
const report={schema:1,generado_en:now,code_sha:'a'.repeat(40),run_id:'1',
 checks:[{id:'test-voz',nombre:'Voz sintética',components:['SYS-SALA'],estado:'ok',revisado_en:now,
 vence_en:new Date(Date.now()+300000).toISOString(),detalle:'Prueba sintética correcta',alcance:'Motor aislado'},
 {id:'test-drive',nombre:'Transferencia sintética',components:['EXT-DRIVE'],estado:'fallo',revisado_en:now,
 vence_en:new Date(Date.now()+300000).toISOString(),detalle:'Prueba sintética falló',alcance:'Transferencia aislada'}]};
const catalog={schema:1,components:[{id:'SYS-SALA',nombre:'Sala',tipo:'produccion'}],
 processes:[{id:'PROC-CONTENIDO',nombre:'Contenido',steps:[
 {id:'PROC-CONTENIDO:0',nombre:'Decidir',modo:'manual',components:['SYS-SALA']},
 {id:'PROC-CONTENIDO:1',nombre:'Producir',modo:'automatico',components:['SYS-SALA']}]}]};
async function run(){
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/accesos.html';
 let checks=0;
 try{
  for(const [name,type,viewport]of[['Chromium',chromium,{width:1280,height:800}],['WebKit móvil',webkit,{width:390,height:844}]]){
   const browser=await type.launch({headless:true});
   try{
    for(const mode of ['admin','sin-admin','respuesta-tardia','rol-revocado']){
     const ctx=await browser.newContext({viewport});
     await ctx.addInitScript(()=>localStorage.setItem('pyod_clave_v1','synthetic-session-never-real'));
     const page=await ctx.newPage(),errors=[],requests=[];let release,healthRequests=0,roleRevoked=false;
     page.on('pageerror',e=>errors.push(e.message));
     await page.route('**/*',async route=>{
      const req=route.request(),u=new URL(req.url());requests.push({url:req.url(),method:req.method()});
      if(req.method()!=='GET'){await route.abort();throw Error('Unexpected write in isolated health test');}
      const respond=(body,type='application/json')=>route.fulfill({status:200,contentType:type,
       headers:{'Access-Control-Allow-Origin':'*'},body:typeof body==='string'?body:JSON.stringify(body)});
      if(u.origin===new URL(url).origin&&u.pathname==='/accesos.html')return respond(html,'text/html');
      if(u.pathname.endsWith('/yod-acceso.js'))return respond("window.YOD_PORTERO={original:'https://synthetic.invalid/exec'};",'text/javascript');
      if(u.pathname.endsWith('/yod-salud.js'))return respond(client,'text/javascript');
      if(u.pathname.endsWith('/salud-catalogo.json'))return respond(catalog);
      if(u.pathname.endsWith('/estado-online.json')){
       healthRequests++;
       if(mode==='respuesta-tardia')await new Promise(resolve=>release=resolve);
       return respond(report);
      }
      if(u.hostname==='synthetic.invalid'){
       if(u.searchParams.get('recurso')==='canje')return respond({ok:true,rol:mode==='sin-admin'||roleRevoked?'vista':'admin',boards:'*'});
       if(u.searchParams.get('recurso')==='accesos-lista')return respond({ok:true,usuarios:[]});
       return respond({ok:false});
      }
      return respond('',req.resourceType()==='stylesheet'?'text/css':'text/javascript');
     });
     await page.goto(url,{waitUntil:'domcontentloaded'});
     if(mode==='sin-admin'){
      await page.waitForFunction(()=>document.querySelector('#lista').textContent.includes('administrador'));
      assert.equal(await page.locator('#salud-sistemas').isVisible(),false);assert.equal(healthRequests,0);
     }else if(mode==='admin'||mode==='rol-revocado'){
      await page.waitForSelector('#salud-sistemas .salud-row');
      assert.equal(await page.locator('#salud-sistemas .salud-verde').count()>=1,true);
      assert.equal(await page.locator('#salud-sistemas .salud-rojo').count()>=1,true);
      assert.match(await page.locator('#salud-sistemas').textContent(),/Pruebas por proceso/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true);
      if(mode==='rol-revocado'){
       roleRevoked=true;
       await page.locator('[data-salud-refrescar]').click();
      }else await page.evaluate(()=>localStorage.removeItem('pyod_clave_v1'));
      await page.waitForFunction(()=>document.querySelector('#salud-sistemas').hidden);
      assert.equal(await page.locator('#salud-sistemas').textContent(),'');
     }else{
      await page.waitForFunction(()=>document.querySelector('#salud-sistemas').textContent.includes('Comprobando'));
      await page.evaluate(()=>localStorage.removeItem('pyod_clave_v1'));
      await page.waitForFunction(()=>document.querySelector('#salud-sistemas').hidden);
      if(release)release();
      await page.waitForFunction(()=>document.querySelector('#salud-sistemas').textContent==='');
      assert.equal(await page.locator('#salud-sistemas').isVisible(),false);
     }
     assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'));
     assert.ok(requests.filter(r=>r.url.includes('estado-online.json')).every(r=>!r.url.includes('synthetic-session')));
     checks++;await ctx.close();
    }
   }finally{await browser.close();}
   console.log(name+': admin, rechazo, respuesta tardía y rol revocado correctos');
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
 console.log('SALUD_ACCESOS: '+checks+' recorridos; endpoints y usuarios exclusivamente sintéticos');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
