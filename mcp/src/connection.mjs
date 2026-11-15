import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { YodError } from './transport.mjs';

export const YOD_ORIGIN = 'https://yodesarrollomx.github.io';
export const CONNECT_PAGE = YOD_ORIGIN + '/potenciales-yod/mcp-conectar.html';
const validSession = s => /^sy[A-Za-z0-9_-]{18,198}$/.test(s || '');
const validPlan = s => /^p2[a-z0-9]{6,20}$/.test(s || '');
const fileName = 'conexion.json';
function privateStat(s, directory = false) {
  if (s.isSymbolicLink() || !(directory ? s.isDirectory() : s.isFile()) ||
      (typeof process.getuid === 'function' && s.uid !== process.getuid()) || (s.mode & 0o077)) {
    throw new YodError('conexion_archivo_no_privado');
  }
}
async function directory(dir) {
  await mkdir(dir, {recursive:true, mode:0o700});
  privateStat(await lstat(dir), true);
}
export async function readConnection(dir) {
  let f;
  try {
    privateStat(await lstat(dir), true);
    f = await open(join(dir, fileName), constants.O_RDONLY | constants.O_NOFOLLOW);
    const st = await f.stat(); privateStat(st);
    if (st.size > 16384) throw new YodError('conexion_invalida');
    const c = JSON.parse(await f.readFile('utf8'));
    if (c.schema !== 'yod-conexion-v1' || !validSession(c.session) || !/^[a-f0-9-]{36}$/.test(c.id || '') ||
        !Array.isArray(c.plans) || !c.plans.length || c.plans.length > 100 || !c.plans.every(validPlan) ||
        new Set(c.plans).size !== c.plans.length || typeof c.write !== 'boolean') throw new YodError('conexion_invalida');
    return c;
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    if (e instanceof YodError) throw e;
    throw new YodError('conexion_invalida');
  } finally { await f?.close(); }
}
export async function saveConnection(dir, data) {
  await directory(dir);
  try { privateStat(await lstat(join(dir, fileName))); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  const temp = join(dir, '.conexion-' + randomUUID());
  let f;
  try {
    f = await open(temp, 'wx', 0o600);
    await f.writeFile(JSON.stringify({...data,schema:'yod-conexion-v1'})+'\n'); await f.sync(); await f.close(); f=null;
    await rename(temp, join(dir, fileName));
    const d = await open(dir, 'r'); try { await d.sync(); } finally { await d.close(); }
  } finally { await f?.close(); await unlink(temp).catch(()=>{}); }
}
export async function disconnect(dir) {
  await readConnection(dir); // never unlink an unexpected file
  try {await unlink(join(dir,fileName));} catch(e) {if(e.code==='ENOENT')return;throw e;}
  const d=await open(dir,'r');try {await d.sync();} finally {await d.close();}
}
export function publicConnection(c) {
  return c ? {conectado:true,id:c.id,actor:c.actor,planes:c.plans,edicion:c.write,creado:c.createdAt} : {conectado:false};
}

// One local enrollment, not a remotely accessible authorization service. The
// browser discloses the session only after the person selects plans and connects.
export async function startConnection({stateDir, transport, timeoutMs=5*60000}) {
  const challenge=randomBytes(32).toString('hex');
  let busy=false, done=false, timer, resolve;
  const completed=new Promise(r=>{resolve=r;});
  const server=createServer(async(req,res)=>{
    const finish=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
    if(req.headers.host!==`127.0.0.1:${server.address()?.port}` || req.headers.origin!==YOD_ORIGIN || req.url!=='/connect') return finish(403,{ok:false,error:'origen'});
    res.setHeader('Access-Control-Allow-Origin',YOD_ORIGIN);
    res.setHeader('Vary','Origin');
    if(req.method==='OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods','POST');
      res.setHeader('Access-Control-Allow-Headers','content-type,x-yod-conexion');
      res.setHeader('Access-Control-Allow-Private-Network','true');
      return finish(204,{});
    }
    const supplied=String(req.headers['x-yod-conexion']||'');
    if(req.method!=='POST' || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(challenge))) return finish(403,{ok:false,error:'conexion'});
    if(done || busy) return finish(409,{ok:false,error:'conexion_en_curso'});
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) return finish(415,{ok:false,error:'formato'});
    busy=true;
    try {
      let size=0, body='';
      for await (const part of req) {size+=part.length;if(size>8192)throw new YodError('conexion_invalida');body+=part.toString('utf8');}
      const b=JSON.parse(body);
      if(!validSession(b.session) || !Array.isArray(b.plans) || !b.plans.length || b.plans.length>100 || !b.plans.every(validPlan) ||
          new Set(b.plans).size!==b.plans.length || typeof b.write!=='boolean' || Object.keys(b).some(k=>!['session','plans','write'].includes(k))) throw new YodError('conexion_invalida');
      const r=await transport.get({recurso:'ppp2-vivero',k:b.session});
      if(!r.yo?.nombre || !Array.isArray(r.planes) || !r.puede) throw new YodError('contrato_incompatible');
      const available=new Set(r.planes.map(p=>p.plan_id));
      if(!b.plans.every(p=>available.has(p)) || (b.write && r.puede.editar!==true)) throw new YodError('permiso');
      if(done) throw new YodError('conexion_cancelada');
      const c={id:randomUUID(),session:b.session,plans:b.plans,write:b.write,actor:r.yo,createdAt:new Date().toISOString()};
      await saveConnection(stateDir,c);
      done=true;clearTimeout(timer);finish(200,{ok:true,...publicConnection(c)});
      server.close();resolve({ok:true,...publicConnection(c)});
    } catch(e) {finish(400,{ok:false,error:e instanceof YodError?e.code:'conexion_invalida'});}
    finally {busy=false;}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
  const stop=()=>{if(!done){done=true;clearTimeout(timer);server.close();server.closeAllConnections();resolve({ok:false,error:'conexion_cancelada'});}};
  timer=setTimeout(stop,timeoutMs);timer.unref();
  return {url:`${CONNECT_PAGE}#puerto=${server.address().port}&reto=${challenge}`,completed,stop};
}
