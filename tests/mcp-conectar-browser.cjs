'use strict';
// Real page + loopback enrollment + MCP SDK + actual Apps Script + real PPP UI.
// All business data and upstream responses are synthetic; other network blocked.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const origin='https://yodesarrollomx.github.io';
const pageBase=origin+'/potenciales-yod/';
(async()=>{
  const [{setup,PLAN,EDITOR,ENDPOINT},{startConnection,disconnect,readConnection},{loadConfig},{PppAdapter},{createServer},{Client},{InMemoryTransport}]=await Promise.all([
    import('../mcp/test/helpers.mjs'),import('../mcp/src/connection.mjs'),import('../mcp/src/config.mjs'),import('../mcp/src/ppp.mjs'),import('../mcp/src/server.mjs'),
    import('../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'),import('../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js')]);
  const browser=await chromium.launch(process.env.PPP_CHROMIUM_PATH?{executablePath:process.env.PPP_CHROMIUM_PATH}:{});
  const f=await setup(),flow=await startConnection({stateDir:f.config.stateDir,transport:f.transport});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const errors=[],businessPosts=[];
  const nativeEndpoint=fs.readFileSync(path.join(root,'ppp2.js'),'utf8').match(/var ENDPOINT = window.PPP2_ENDPOINT \|\| '([^']+)'/)[1];
  await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.hostname==='127.0.0.1')return route.continue();
    if(req.url().startsWith(nativeEndpoint)) {
      const fields=req.method()==='POST'?JSON.parse(req.postData()):Object.fromEntries(u.searchParams);
      if(req.method()==='POST')businessPosts.push(fields);
      const r=req.method()==='POST'?f.world.post(fields):f.world.get(fields);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r)});
    }
    if(req.url().startsWith(pageBase)) {
      const rel=decodeURIComponent(u.pathname.slice('/potenciales-yod/'.length));
      const file=path.resolve(root,rel);
      if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()) {
        if(rel==='portero.js')return route.fulfill({status:200,contentType:'text/javascript',body:''});
        return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
      }
    }
    return route.fulfill({status:200,contentType:/\.css(?:\?|$)/.test(req.url())?'text/css':'text/javascript',body:''});
  });
  await context.addInitScript(key=>localStorage.setItem('pyod_clave_v1',key),EDITOR);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const env={YOD_PPP_ENDPOINT:ENDPOINT,YOD_MCP_STATE_DIR:f.config.stateDir};
  const factory=async()=>new PppAdapter(await loadConfig(env),f.transport,f.journal);
  const server=createServer(await factory(),{adapterForRequest:factory}),client=new Client({name:'recorrido-pantalla',version:'1'});
  try {
    const [s,c]=InMemoryTransport.createLinkedPair();await server.connect(s);await client.connect(c);
    await page.goto(flow.url);
    await page.locator('input[name="plan"]').waitFor();
    assert.equal(await readConnection(f.config.stateDir),null,'no implicit consent');
    await page.getByRole('button',{name:'Conectar este equipo'}).click();
    assert.match(await page.locator('#estado').innerText(),/Elige al menos/);
    await page.locator('input[name="plan"]').check();await page.locator('#editar').check();
    await page.getByRole('button',{name:'Conectar este equipo'}).click();
    await page.getByText(/Acceso autorizado para/).waitFor({timeout:20000});
    assert.equal((await flow.completed).conectado,true);
    assert.equal(new URL(page.url()).hash,'');
    if(process.env.PPP_SCREENSHOTS){fs.mkdirSync(process.env.PPP_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,'mcp-conexion-sintetica.png'),fullPage:true});}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return r.structuredContent;};
    const state=await call('yod_estado');assert.equal(state.conectado,true);assert.equal(state.edicion,true);
    const initial=await call('ppp_leer_plan',{plan:PLAN,seccion:'datos'});
    const old=initial.data.contenido.find(d=>d.clave==='terreno.m2').valor;assert.notEqual(old,3200);
    const proposal=await call('ppp_preparar_cambio',{plan:PLAN,cambio:{accion:'dato',clave:'terreno.m2',valor:3200,estado:'supuesto',fuente:'Plano inventado del ensayo MCP'}});
    const receipt=await call('ppp_aplicar_cambio',{cambio_id:proposal.cambio_id,confirmacion:proposal.confirmacion});
    assert.equal(receipt.estado,'verificado');
    await page.goto(receipt.url);
    await page.locator('.p2-pestanas a', {hasText:'Preguntas y evidencia'}).click();
    await page.locator('[data-accion="editar-dato"][data-clave="terreno.m2"]').waitFor({state:'attached'});
    const row=page.locator('[data-accion="editar-dato"][data-clave="terreno.m2"]').locator('xpath=ancestor::tr');
    assert.match(await row.textContent(),/3[,.\s]?200/);
    assert.match(await row.textContent(),/Plano inventado del ensayo MCP/);
    assert.equal(businessPosts.length,0,'the page does not resubmit the MCP change');
    await call('ppp_aplicar_cambio',{cambio_id:proposal.cambio_id,confirmacion:proposal.confirmacion});
    assert.equal(f.calls.filter(c=>c.method==='POST').length,1,'one native write, despite replay');
    await disconnect(f.config.stateDir);
    assert.equal((await call('yod_estado')).conectado,false);
    assert.equal((await client.callTool({name:'ppp_leer_plan',arguments:{plan:PLAN}})).isError,true);
    assert.deepEqual(errors,[]);
    if(process.env.PPP_SCREENSHOTS){fs.mkdirSync(process.env.PPP_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.PPP_SCREENSHOTS,'mcp-plan-sintetico.png'),fullPage:true});}
    console.log('OK: página YOD → permiso local → SDK MCP → servidor PPP → cambio/recibo → dato y fuente en pantalla → retirada; datos sintéticos.');
  } finally {flow.stop();await client.close();await server.close();await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
