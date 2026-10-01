'use strict';
// Synthetic case and transport. No request can reach a business service.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'mixto.html'),'utf8');
const inputs=Object.fromEntries([...html.matchAll(/<input\b[^>]*type="range"[^>]*>/g)].map(([tag])=>[tag.match(/id="([^"]+)"/)[1],Number(tag.match(/value="([^"]+)"/)[1])]));
Object.assign(inputs,{inTerreno:1800,inCOS:65,inCUS:4,inCom:200,inMixLoft:30,inMix2Rec:50,inMix3Rec:20,inM2Loft:60,inM22Rec:90,inM23Rec:120,inPreViv:47000,inCostRas:18000,inMaxDeuda:190000000,inMesesObra:24,inMesesEntrega:12,inMesesPreventa:12});
const engine=html.slice(html.indexOf('  function parkingPerUnit'),html.indexOf('  function calculate(){'));
const ctx=vm.createContext({});vm.runInContext(engine,ctx);
const compute=values=>JSON.parse(JSON.stringify(ctx.computar(values)));
const copy=o=>JSON.parse(JSON.stringify(o));
function draft(){return {inputs:copy(inputs),caso:{caso_id:'synthetic-case',nombre_caso:'Torre de prueba',palabra:'ensayo',version:1,estado:'ANÁLISIS'},escenarios:[{id:'test-base',nombre:'Base de prueba',esBase:true,inputs:copy(inputs)}],escActivo:'test-base',savedInputs:copy(inputs)};}
function native(){const d=draft();return {ok:true,caso_id:d.caso.caso_id,revision:'revision-synthetic-1',activo:d.escActivo,escenarios:d.escenarios,estados:{[d.escActivo]:compute(inputs)},etapas:[],mercado:[],comparables:[],actualizado:'2026-10-01T00:00:00Z',libro_url:'https://docs.google.com/spreadsheets/d/synthetic-only'};}
const mime=p=>p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':p.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8';
async function install(context,opts={}){
 const atlas=process.env.YOD_ATLAS_DIR||path.resolve(root,'../yod-atlas');
 const transport={posts:[],gets:[],conflict:false,model:native()};
 await context.addInitScript(({seed})=>{localStorage.setItem('pyod_clave_v1','sy-synthetic-browser-session');sessionStorage.setItem('yod_drawer_seen','1');localStorage.setItem('yod_tema','claro');if(seed&&!sessionStorage.getItem('ppp_fixture_seeded')){localStorage.setItem('pyod_draft_v1',JSON.stringify(seed));sessionStorage.setItem('ppp_fixture_seeded','1');}},{seed:opts.seed===undefined?draft():opts.seed});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.hostname==='ppp.test'||(u.hostname==='yodesarrollomx.github.io'&&u.pathname.startsWith('/yod-portal/'))){
   const base=u.hostname==='ppp.test'?root:atlas, rel=u.pathname.replace(/^\/(potenciales-yod|yod-portal)\//,'');
   const file=path.resolve(base,rel);if(!file.startsWith(base+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:mime(file),body:fs.readFileSync(file)});
  }
  if(/script\.google/.test(u.hostname)){
   let out={ok:true};
   if(req.method()==='POST'){
    const b=req.postDataJSON();if(!b)return route.abort();if(b.tipo==='bitacora')return route.fulfill({contentType:'application/json',body:'{"ok":true}'});transport.posts.push(b);
    if(b.tipo==='sheet-cantidades'){
     if(transport.conflict)out={ok:false,error:'conflicto_revision'};
     else{const m=transport.model,e=m.escenarios.find(x=>x.id===b.escenario_id);Object.assign(e.inputs,b.inputs);m.estados[e.id]=compute(e.inputs);m.revision+='x';out=m;}
    }else if(b.tipo==='guardar')out={ok:true,caso_id:'synthetic-case',version:2,palabra:b.palabra,emailed:false};
   }else{
    const action=u.searchParams.get('recurso');transport.gets.push(action);
    if(action==='canje')out={ok:true,token:'sy-synthetic-browser-session',rol:'admin',boards:'PT',nombre:'Usuario de prueba'};
    else if(action==='lista')out={ok:true,casos:opts.cases||[],config:{titulo:'Prueba'}};
    else if(action==='caso')out={ok:true,caso:{...draft().caso,escenarios_json:JSON.stringify(draft().escenarios),calculo_sheet:opts.native?transport.model:undefined}};
    else if(action==='sheet-model')out=transport.model;
    else out={ok:true,actor:'SESSION',rows:[{system_id:'SYS-POTENCIALES',visible:'SI',nombre:'PPP',orden:1}],known_system_ids:['SYS-POTENCIALES']};
   }
   return route.fulfill({contentType:'application/json',body:JSON.stringify(out)});
  }
  if(process.env.PPP_ASSET_CACHE){const manifest=JSON.parse(fs.readFileSync(path.join(process.env.PPP_ASSET_CACHE,'manifest.json'),'utf8')),file=manifest[u.href];if(file)return route.fulfill({contentType:file.endsWith('.css')?'text/css':'application/octet-stream',body:fs.readFileSync(file)});}
  // Public typography may optionally be enabled for local visual review; never business endpoints.
  if(process.env.PPP_PUBLIC_FONTS==='1'&&['fonts.googleapis.com','fonts.gstatic.com','cdn.jsdelivr.net'].includes(u.hostname))return route.continue();
  return route.abort();
 });
 return transport;
}
module.exports={root,html,inputs,engine,compute,draft,native,install};
