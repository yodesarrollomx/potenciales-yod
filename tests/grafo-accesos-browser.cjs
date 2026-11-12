'use strict';
// Grafo del sistema en Accesos, en navegador real y sin red de negocio: el Portero es sintético, la rama de datos y el
// borrador son dobles servidos desde esta carpeta, y cualquier escritura o destino no previsto hace fallar la prueba.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const raiz=path.resolve(__dirname,'..'),REPO='https://github.com/yodesarrollomx/potenciales-yod';
const VIS=process.env.VIS_NETWORK_SOURCE||require.resolve('vis-network/standalone/umd/vis-network.min.js');
const V=JSON.parse(fs.readFileSync(path.join(raiz,'grafo/versiones.json'),'utf8')),APROBADO=V.aprobado,NUEVO='G-20991231-2359';
const BORRADOR={id:NUEVO,fecha:'31-dic 23:59',pr:70,liga:REPO+'/pull/70',rama:'grafo-borrador',antes:APROBADO,piezas:3190,ligas:10630,titulo:'Entró un tablero y cambió Accesos',
  resumen:'Se sumó un tablero y la página de Accesos trae controles nuevos.',recomendacion:'aprobar',ia:null,audiencias:['Cliente o inversionista','Dueño del terreno','Departamentos, lotes o casas'],sin_campo:[]};
const ESTADO={generado:'2026-11-12T16:17:00Z',errores:[{clave:'cambio:x',tipo:'cambio',nodos:['repo:yodesarrollomx/potenciales-yod'],msg:'potenciales-yod cambió después de armar el grafo'},
  {clave:'flujo:x',tipo:'flujo',nodos:['SYS-POTENCIALES'],msg:'Falló el flujo «Verificar interfaz PPP»',url:REPO}]};
const REGISTRO=[{cuando:'2026-11-12T15:17:00Z',que:'aparece',msg:'Falló el flujo «Verificar interfaz PPP»',tipo:'flujo'},{cuando:'2026-11-12T16:15:00Z',que:'grafo rehecho (borrador)',id:NUEVO,pr:70,por:'sintetico'}].map(x=>JSON.stringify(x)).join('\n')+'\n';
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
const local=p=>{const f=path.join(raiz,decodeURIComponent(p));return f.startsWith(raiz+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile()?f:null;};

async function run(){
  const server=http.createServer((req,res)=>{const f=local(new URL(req.url,'http://x').pathname);if(!f){res.writeHead(404);return res.end('');}res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origen='http://127.0.0.1:'+server.address().port;let recorridos=0;
  try{
    for(const [nombre,tipo,viewport] of [['Chromium',chromium,{width:1280,height:800}],['WebKit móvil',webkit,{width:390,height:844}]]){
      const browser=await tipo.launch({headless:true});
      try{
        for(const modo of ['admin','sin-admin','lista-falla','vista-previa']){
          const ctx=await browser.newContext({viewport});ctx.setDefaultTimeout(20000);
          // Este guion corre en CADA documento del contexto, también en los marcos y en about:blank. La sesión sintética se siembra
          // una sola vez y sólo en la página: si se sembrara siempre, al apagarse el grafo (su marco se vacía y pasa por about:blank)
          // el guion devolvería la llave que la prueba acaba de quitar y la página volvería a encenderse sola.
          await ctx.addInitScript(()=>{
            if(window.top===window&&!localStorage.getItem('qa_sesion_sembrada')){localStorage.setItem('qa_sesion_sembrada','1');localStorage.setItem('pyod_clave_v1','synthetic-session-never-real');}
            window.__abiertos=[];window.open=u=>{window.__abiertos.push(String(u));return null;};
          });
          const page=await ctx.newPage(),errores=[],pedidos=[];const mundo={borrador:{}};
          // WebKit reporta así cuando la librería de dibujo (vis-network) ajusta su lienzo dentro del mismo cuadro: el navegador
          // sólo difiere el aviso al cuadro siguiente. No es una falla de la página; cualquier otro error sí cuenta.
          page.on('pageerror',e=>{if(!/^ResizeObserver loop (completed with undelivered notifications|limit exceeded)\.?$/.test(e.message))errores.push(e.message);});
          await page.route('**/*',async route=>{
            const req=route.request(),u=new URL(req.url());pedidos.push({url:req.url(),metodo:req.method()});
            if(req.method()!=='GET'){await route.abort();throw Error('Escritura inesperada: '+req.method()+' '+req.url());}
            const da=(body,type='application/json')=>route.fulfill({status:200,contentType:type,headers:{'Access-Control-Allow-Origin':'*'},body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)});
            if(u.origin===origen){
              if(u.pathname==='/accesos.html'||u.pathname==='/grafo-control.js'||u.pathname.startsWith('/grafo/'))return route.continue();
              return da('',req.resourceType()==='stylesheet'?'text/css':'text/javascript');
            }
            if(u.pathname.endsWith('/yod-acceso.js'))return da("window.YOD_PORTERO={original:'https://synthetic.invalid/exec'};",'text/javascript');
            if(u.hostname==='synthetic.invalid'){
              if(u.searchParams.get('recurso')==='canje')return da({ok:true,rol:modo==='sin-admin'?'vista':'admin',boards:'*'});
              if(u.searchParams.get('recurso')==='accesos-lista')return modo==='lista-falla'?route.abort('failed'):da({ok:true,usuarios:[]});
              return da({ok:false});
            }
            if(u.hostname==='unpkg.com'&&u.pathname==='/vis-network@9.1.6/standalone/umd/vis-network.min.js')return da(fs.readFileSync(VIS),'text/javascript');
            if(u.hostname==='raw.githubusercontent.com'){
              const m=u.pathname.match(/^\/yodesarrollomx\/potenciales-yod\/(grafo-datos|grafo-borrador)\/(.+)$/);assert.ok(m,'archivo crudo no previsto: '+u.pathname);
              if(m[1]==='grafo-datos'){const d={'borrador.json':JSON.stringify(mundo.borrador),'estado.json':JSON.stringify(ESTADO),'registro.jsonl':REGISTRO}[m[2]];assert.ok(d!==undefined,'dato no previsto: '+m[2]);return da(d,'text/plain');}
              const f=local(m[2]);assert.ok(m[2].startsWith('grafo/'),'el borrador sólo se lee de grafo/');return f?da(fs.readFileSync(f),'text/plain'):route.fulfill({status:404,body:''});
            }
            assert.ok(!/script\.google\.com|openai\.com|anthropic\.com/.test(u.hostname),'destino prohibido: '+u.hostname);
            return da('',req.resourceType()==='stylesheet'?'text/css':'text/javascript');
          });
          if(modo==='vista-previa'){
            // La portada sólo trae de GitHub la rama del borrador; cualquier otro valor de ?rama= enseña lo publicado y no pide nada crudo.
            const crudos=(desde=0)=>pedidos.slice(desde).filter(p=>p.url.startsWith('https://raw.githubusercontent.com/')&&!/\/grafo-datos\/estado\.json(\?|$)/.test(p.url)).map(p=>p.url);
            for(const rama of ['main','b4c3a7a0b4c3a7a0b4c3a7a0b4c3a7a0b4c3a7a0','grafo-borrador-otra','../grafo-borrador','grafo-borrador/../main']){
              const antes=pedidos.length;
              await page.goto(origen+'/grafo/index.html?rama='+encodeURIComponent(rama),{waitUntil:'domcontentloaded'});
              await page.frameLocator('#marco').locator('canvas').first().waitFor();
              assert.equal(await page.locator('#borr').isVisible(),false,rama);assert.equal(await page.locator('#marco').getAttribute('src'),'mapa.html',rama);
              assert.deepEqual(crudos(antes),[],'con ?rama='+rama+' no se trae nada de GitHub');
            }
            assert.deepEqual(crudos(),[],'sólo el borrador se trae de GitHub');
            // El borrador: su lámina se dibuja en un marco aislado. Su código corre, pero no alcanza lo guardado por los tableros.
            await page.goto(origen+'/grafo/index.html?rama=grafo-borrador',{waitUntil:'domcontentloaded'});
            await page.locator('#borr').waitFor({state:'visible'});await page.frameLocator('#marco').locator('canvas').first().waitFor();
            assert.equal(await page.locator('#marco').getAttribute('sandbox'),'allow-scripts allow-popups');
            assert.ok(crudos().some(u=>u.includes('/grafo-borrador/grafo/mapa.html')),'la lámina del borrador se trae de su rama');
            assert.ok(crudos().every(u=>u.startsWith('https://raw.githubusercontent.com/yodesarrollomx/potenciales-yod/grafo-borrador/grafo/')),'nada fuera de grafo/ del borrador');
            assert.equal(await page.evaluate(()=>localStorage.getItem('pyod_clave_v1')),'synthetic-session-never-real');
            await page.evaluate(()=>{document.cookie='qa_galleta=sintetica; path=/';});assert.match(await page.evaluate(()=>document.cookie),/qa_galleta=sintetica/);
            const lam=await (await page.locator('#marco').elementHandle()).contentFrame();
            const intento=await lam.evaluate(()=>{const n=f=>{try{f();return 'leyó';}catch(e){return e.name;}};
              // Chromium niega la galleta con SecurityError; WebKit la deja vacía. Cualquiera de las dos: no alcanza la de la página.
              let galleta;try{galleta=document.cookie.includes('qa_galleta')?'leyó':'sin galleta';}catch(e){galleta='sin galleta';}
              return {origen:self.origin,propio:n(()=>localStorage.getItem('pyod_clave_v1')),sesion:n(()=>sessionStorage.length),galleta,padre:n(()=>parent.localStorage.getItem('pyod_clave_v1'))};});
            assert.deepEqual(intento,{origen:'null',propio:'SecurityError',sesion:'SecurityError',galleta:'sin galleta',padre:'SecurityError'});
            // …y sigue funcionando: la lámina pide a la portada ir a otra (postMessage) y la portada la trae del borrador.
            await lam.evaluate(()=>parent.postMessage({yod:2,ir:'tablero-ppp',nodo:''},'*'));
            await page.waitForFunction(()=>document.querySelector('#sel').value==='tablero-ppp');await page.frameLocator('#marco').locator('canvas').first().waitFor();
            assert.ok(crudos().some(u=>u.includes('/grafo-borrador/grafo/tablero-ppp.html')));
            // un mensaje que no viene de la lámina se ignora
            await page.evaluate(()=>window.postMessage({yod:2,ir:'mapa',nodo:''},'*'));await page.waitForTimeout(300);
            assert.equal(await page.locator('#sel').inputValue(),'tablero-ppp');
            assert.deepEqual(errores,[]);assert.ok(pedidos.every(p=>p.metodo==='GET'));
            assert.ok(pedidos.every(p=>!p.url.includes('synthetic-session')),'la sesión no viaja a ningún lado');
            recorridos++;await ctx.close();continue;
          }
          await page.goto(origen+'/accesos.html',{waitUntil:'domcontentloaded'});
          const sec=page.locator('#grafo-sistema'),caja=page.locator('#grafoControl'),marco=page.frameLocator('#grafoMarco'),lamina=marco.frameLocator('#marco');
          const cabe=()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2);
          if(modo==='lista-falla'){
            // El Portero confirma admin pero la lista no llega (12-nov-2026: tardó más de 20 s): lo privado se borra y el grafo se queda.
            await page.waitForFunction(()=>document.querySelector('#lista').textContent.includes('no contestó a tiempo'));
            await sec.waitFor({state:'visible'});await sec.scrollIntoViewIfNeeded();
            await caja.locator('.gc-ver b').first().filter({hasText:APROBADO}).waitFor();
            assert.equal(await page.locator('#grafoMarco').getAttribute('src'),'grafo/index.html');await lamina.locator('canvas').first().waitFor();
            assert.equal(await page.locator('#aBtn').isDisabled(),true);assert.equal(await page.locator('#aCorreo').isDisabled(),true);assert.equal(await page.locator('#aRetry').isDisabled(),false);
          }else if(modo==='sin-admin'){
            await page.waitForFunction(()=>document.querySelector('#lista').textContent.includes('administrador'));
            assert.equal(await sec.isVisible(),false);assert.equal(await caja.textContent(),'');
            assert.ok(pedidos.every(p=>!p.url.includes('raw.githubusercontent.com')&&!p.url.includes('/grafo/')&&!p.url.includes('unpkg.com')),'sin admin no se pide nada del grafo');
          }else{
            await sec.waitFor({state:'visible'});await sec.scrollIntoViewIfNeeded();
            // 1 · aprobado, estado y botón de rehacer
            await caja.locator('.gc-ver b').first().filter({hasText:APROBADO}).waitFor();
            assert.match(await caja.textContent(),new RegExp('Aprobado\\s*'+APROBADO));assert.equal(await caja.locator('[data-gc="rehacer"]').textContent(),'Rehacer grafo');
            assert.equal(await caja.locator('.gc-aviso').count(),0);assert.match(await page.locator('#grafoEstado').textContent(),/1 con error · 1 con cambios sin reflejar · revisado/);
            assert.equal(await page.locator('#grafoMarco').getAttribute('src'),'grafo/index.html');
            await lamina.locator('canvas').first().waitFor();assert.equal(await marco.locator('#borr').isVisible(),false);assert.ok(await cabe());
            // 2 · llega un borrador: pregunta, opciones y vista previa sin publicar
            mundo.borrador=BORRADOR;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
            await page.reload({waitUntil:'domcontentloaded'});await sec.waitFor({state:'visible'});await sec.scrollIntoViewIfNeeded();
            await caja.getByText('¿Lo apruebas ya o lo dejas en borrador?').waitFor();
            assert.match(await caja.textContent(),/Entró un tablero y cambió Accesos/);assert.match(await caja.textContent(),new RegExp('siguen leyendo el aprobado '+APROBADO+' y sus ligas no cambian'));
            assert.equal(await caja.locator('[data-gc="aprobar"]').getAttribute('href'),REPO+'/pull/70');assert.equal(await caja.locator('[data-gc="aprobar"]').getAttribute('target'),'_blank');
            assert.equal(await page.locator('#grafoMarco').getAttribute('src'),'grafo/index.html','con borrador se sigue viendo el aprobado');assert.ok(await cabe());
            await caja.locator('[data-gc="ver"]').click();
            assert.equal(await page.locator('#grafoMarco').getAttribute('src'),'grafo/index.html?rama=grafo-borrador');
            await marco.locator('#borr').waitFor({state:'visible'});await lamina.locator('canvas').first().waitFor();
            assert.equal(await caja.locator('[data-gc="ver"]').textContent(),'Ver el aprobado');
            // 3 · dejar en borrador: vuelve el aprobado y queda sólo el recordatorio
            await caja.locator('[data-gc="plegar"]').click();
            assert.equal(await page.locator('#grafoMarco').getAttribute('src'),'grafo/index.html');assert.equal(await caja.locator('.gc-aviso').count(),0);
            assert.match(await caja.locator('[data-gc="desplegar"]').textContent(),new RegExp('Borrador\\s*'+NUEVO+'\\s*en revisión'));
            await caja.locator('[data-gc="desplegar"]').click();assert.equal(await caja.locator('.gc-aviso').count(),1);
            // 4 · rehacer: pide confirmar, avisa del costo y abre el pedido en GitHub sin mandar nada desde la página
            await caja.locator('[data-gc="rehacer"]').click();assert.equal(await caja.locator('[data-gc="confirma"]').isVisible(),true);
            assert.match(await caja.locator('[data-gc="confirma"]').textContent(),/gasta una consulta/);assert.deepEqual(await page.evaluate(()=>window.__abiertos),[]);
            await caja.locator('[data-gc="motivo"]').fill('cambió el menú');await caja.locator('[data-gc="si"]').click();
            const abiertos=await page.evaluate(()=>window.__abiertos);assert.equal(abiertos.length,1);const pedido=new URL(abiertos[0]);
            assert.equal(pedido.origin+pedido.pathname,REPO+'/issues/new');assert.ok(pedido.searchParams.get('title').startsWith('🕸️ Rehacer grafo'));assert.match(pedido.searchParams.get('body'),/^Motivo: cambió el menú$/m);
            // 5 · registro y presentaciones
            await caja.locator('details.gc-det').nth(1).locator('summary').click();assert.match(await caja.locator('.gc-reg').textContent(),/Grafo rehecho, en borrador/);
            await caja.locator('details.gc-det').nth(0).locator('summary').click();
            assert.equal(await caja.locator('details.gc-det').nth(0).locator('a').getAttribute('href'),'https://yodesarrollomx.github.io/yodesarrollo-board/presentacion/grafo/');assert.ok(await cabe());
            if(process.env.QA_ARTIFACTS){fs.mkdirSync(process.env.QA_ARTIFACTS,{recursive:true});await page.screenshot({path:path.join(process.env.QA_ARTIFACTS,'grafo-accesos-'+viewport.width+'.png'),fullPage:true});}
            // 6 · sin sesión todo se apaga
            await page.evaluate(()=>localStorage.removeItem('pyod_clave_v1'));
            await page.waitForFunction(()=>document.querySelector('#grafo-sistema').hidden);
            assert.equal(await caja.textContent(),'');assert.equal(await page.locator('#grafoMarco').getAttribute('src'),null);
            // …y se queda apagado: pasado el vaciado del marco nadie devuelve la sesión ni vuelve a pedir el grafo.
            const antes=pedidos.length;await page.waitForTimeout(900);
            assert.equal(await page.evaluate(()=>localStorage.getItem('pyod_clave_v1')),null,'nadie vuelve a sembrar la sesión');
            assert.equal(await page.evaluate(()=>document.querySelector('#grafo-sistema').hidden),true);assert.equal(await caja.textContent(),'');
            assert.equal(await page.locator('#grafoMarco').getAttribute('src'),null);
            assert.deepEqual(pedidos.slice(antes).filter(p=>p.url.startsWith('https://synthetic.invalid/')).map(p=>p.url),[],'sin sesión no se vuelve a llamar al Portero');
          }
          assert.deepEqual(errores,[]);assert.ok(pedidos.every(p=>p.metodo==='GET'));
          assert.ok(pedidos.every(p=>!p.url.includes('synthetic-session')||p.url.startsWith('https://synthetic.invalid/')),'la sesión sólo viaja al Portero');
          recorridos++;await ctx.close();
        }
      }finally{await browser.close();}
      console.log(nombre+': aprobado, borrador con su pregunta, vista previa sin publicar y aislada (sólo la rama del borrador), dejar en borrador, pedido de rehacer, registro, apagado sin sesión y grafo visible aunque la lista no llegue correctos');
    }
  }finally{await new Promise(r=>server.close(r));}
  console.log('GRAFO_ACCESOS: '+recorridos+' recorridos; Portero, rama de datos y borrador exclusivamente sintéticos');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
