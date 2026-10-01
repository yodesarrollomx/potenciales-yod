'use strict';
// Integración DOM: HTML real y Portero completo, con datos y red exclusivamente sintéticos.
// No ejecuta motores financieros ni acredita login OAuth real en un dispositivo físico.
const {chromium, webkit, devices} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const pages = ['index','mapa','macrolotes','mixto','residencial','patrimonial','unifamiliar'];
const script = fs.readFileSync(path.join(root,'portero.js'),'utf8');
const server = http.createServer((req,res)=>{
  const u = new URL(req.url,'http://localhost');
  if(u.pathname.startsWith('/exec/')) {
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify(u.pathname.endsWith('/deny') ? {ok:false,error:'revocado'} : u.pathname.endsWith('/network') ? {ok:false,error:'servidor'} : {ok:true,rol:'vista',boards:'PT',nombre:'Usuario sintético'}));
  }
  if(u.pathname === '/portero.js') {res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(script);}
  const name = path.basename(u.pathname,'.html');
  if(!pages.includes(name)) {res.writeHead(404);return res.end();}
  const original = fs.readFileSync(path.join(root,name+'.html'),'utf8');
  const html = original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script src="/portero.js"></script></body>');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base = 'http://127.0.0.1:'+server.address().port;
  let total = 0;
  try {
    for(const profile of [{name:'Chromium escritorio',engine:chromium,options:{viewport:{width:1280,height:900}}},{name:'WebKit móvil',engine:webkit,options:devices['iPhone 13']}]) {
      const browser = await profile.engine.launch({headless:true});
      try {
        for(const state of ['allow','deny','network','empty']) {
          for(const name of state==='allow'?pages:['mixto']) {
            const context = await browser.newContext(profile.options);
            await context.route('**/*',route=>new URL(route.request().url()).origin===base ? route.continue() : route.abort());
            await context.addInitScript(({base,state})=>{
              window.YOD_PORTERO={original:base+'/exec/'+state,respaldo:base+'/exec/'+state};
              if(state!=='empty')localStorage.setItem('pyod_clave_v1','sy-synthetic-browser-session');
              sessionStorage.setItem('pyod_rol',JSON.stringify({f:'sy-synthetic-browser-session'.slice(0,14),rol:'admin'}));
            },{base,state});
            const page = await context.newPage(), errors=[];
            page.on('pageerror',e=>errors.push(e.message));
            await page.goto(base+'/potenciales-yod/'+name+'.html',{waitUntil:'domcontentloaded'});
            if(state==='allow') {
              await page.waitForFunction(()=>['gate','mapGate'].every(id=>{const g=document.getElementById(id);return !g||getComputedStyle(g).display==='none';}),{},{timeout:10000});
              assert.equal(await page.locator('#porteroGate').count(),0);
              assert.equal(await page.evaluate(()=>localStorage.getItem('pyod_clave_v1')),'sy-synthetic-browser-session');
            } else if(state==='network') {
              await page.locator('#pyodReintentar').waitFor({state:'visible',timeout:10000});
              assert.equal(await page.locator('#porteroGate').count(),0);
              assert.equal(await page.evaluate(()=>localStorage.getItem('pyod_clave_v1')),'sy-synthetic-browser-session');
            } else {
              await page.locator('#porteroGate').waitFor({state:'visible',timeout:10000});
              assert.equal(await page.evaluate(()=>document.getElementById('gate').classList.contains('off')),false);
            }
            assert.deepEqual(errors,[]);
            console.log('PASS '+profile.name+' '+name+' '+state);total++;
            await context.close();
          }
        }
      } finally {await browser.close();}
    }
    console.log('PASS total='+total+'; siete plantillas reales, dos motores; red privada no utilizada.');
  } finally {server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
