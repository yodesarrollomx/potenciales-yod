import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PppTransport } from '../src/transport.mjs';
import { PppAdapter } from '../src/ppp.mjs';
import { Journal } from '../src/journal.mjs';
const require=createRequire(import.meta.url);
export const {mundo,PLAN,EDITOR,LECTOR,ADMIN,filaDe}=require('../../tests/ppp2-mundo.cjs');
export const LIGA='liga0000000000000000000000000001';
export const ENDPOINT='https://script.google.com/macros/s/FAKE_TEST_ONLY/exec';
export async function setup({session=EDITOR,write=true,mode='stdio',ligas=true,catalog=[],fetchOverride}={}) {
  const world=mundo(ligas?{ligas:[[LIGA,PLAN,'Prueba','activa','','','','2026-01-01','']],aperturas:true}:{});
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    const u=new URL(url),params=opts.method==='POST'?JSON.parse(opts.body):Object.fromEntries(u.searchParams);
    calls.push({method:opts.method,params});
    if(fetchOverride)return fetchOverride({world,params,opts,url:u});
    const r=opts.method==='POST'?world.post(params):world.get(params);
    return new Response(JSON.stringify(r),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const stateDir=await mkdtemp(join(tmpdir(),'yod-mcp-'));
  const config={endpoint:ENDPOINT,session,write,mode,catalog,stateDir};
  const transport=new PppTransport(ENDPOINT,{fetchImpl});
  const journal=new Journal(stateDir),adapter=new PppAdapter(config,transport,journal);
  return {world,calls,config,transport,journal,adapter};
}
