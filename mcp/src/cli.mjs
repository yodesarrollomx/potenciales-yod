import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadConfig } from './config.mjs';
import { PppTransport } from './transport.mjs';
import { startConnection, readConnection, publicConnection, disconnect } from './connection.mjs';

const run=promisify(execFile);
const entry=fileURLToPath(new URL('./stdio.mjs',import.meta.url));
export function installation(client,{profile,node=process.execPath,script=entry,stateDir}={}) {
  const env=stateDir?['--env','YOD_MCP_STATE_DIR='+resolve(stateDir)]:[];
  if(client==='codex') return {command:'codex',args:['mcp','add','yod-os-local',...env,'--',node,script],check:['mcp','get','yod-os-local','--json']};
  if(client==='claude') return {command:'claude',args:['mcp','add',...env,'--transport','stdio','--scope','user','yod-os-local','--',node,script],check:['mcp','get','yod-os-local']};
  if(client==='hermes' && /^[a-zA-Z0-9_-]{1,60}$/.test(profile||'')) return {command:'hermes',args:['-p',profile,'mcp','add','yod-os-local',...env,'--command',node,'--args',script],check:['-p',profile,'mcp','list']};
  throw Error(client==='hermes'?'Indica --perfil con el perfil real de Hermes.':'Cliente válido: codex, claude o hermes.');
}
async function diagnostic() {
  const client=new Client({name:'yod-diagnostico',version:'0.2.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[entry],env:process.env,stderr:'pipe'});
  try {
    await client.connect(transport);
    const list=await client.listTools(),state=await client.callTool({name:'yod_estado',arguments:{}});
    return {protocolo:'verificado',herramientas:list.tools.map(t=>t.name),yod:state.structuredContent,
      alcance:'Este diagnóstico prueba el servidor local; la conexión de cada asistente se comprueba dentro de ese cliente.'};
  } finally {await client.close();}
}
async function main(argv) {
  const [action,...rest]=argv;
  if(!['conectar','estado','diagnostico','desconectar','instalar'].includes(action)) {
    console.log('YOD MCP\n  conectar             Abre YOD y elige planes y permisos\n  estado               Estado local (no comprueba el servidor)\n  diagnostico          Protocolo real e identidad contra YOD\n  desconectar          Retira la conexión local; conserva recibos\n  instalar codex|claude|hermes [--perfil NOMBRE]\n                       Registra este MCP por la CLI nativa, conservando otras conexiones');return;
  }
  const config=await loadConfig();
  if(action==='estado') return console.log(JSON.stringify(publicConnection(await readConnection(config.stateDir)),null,2));
  if(action==='desconectar') {
    if(process.env.YOD_PORTERO_SESSION)throw Error('Esta sesión usa la configuración anterior por entorno. Retira YOD_PORTERO_SESSION de ese cliente para desconectarla.');
    await disconnect(config.stateDir);console.log('Conexión local retirada. Recibos conservados.');return;
  }
  if(action==='diagnostico')return console.log(JSON.stringify(await diagnostic(),null,2));
  if(action==='conectar') {
    if(process.env.YOD_PORTERO_SESSION)throw Error('Retira la variable heredada YOD_PORTERO_SESSION antes de conectar desde YOD.');
    const flow=await startConnection({stateDir:config.stateDir,transport:new PppTransport(config.endpoint)});
    const cancel=()=>flow.stop();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
    console.log('Abre esta dirección en el navegador de ESTE equipo. Caduca en cinco minutos:\n'+flow.url);
    const opener=process.platform==='darwin'?'open':process.platform==='linux'?'xdg-open':null;
    if(opener){const child=spawn(opener,[flow.url],{stdio:'ignore'});child.on('error',()=>{});child.unref();}
    const outcome=await flow.completed;
    process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);
    console.log(JSON.stringify(outcome,null,2));if(!outcome.ok)process.exitCode=1;return;
  }
  const [client,...options]=rest,pi=options.indexOf('--perfil');
  if(options.length && !(options.length===2 && pi===0))throw Error('Opción desconocida.');
  const cmd=installation(client,{profile:pi<0?null:options[pi+1],stateDir:config.stateDir});
  // Never replace an existing connection. Native CLI writes only its named entry.
  try {
    const old=await run(cmd.command,cmd.check,{timeout:20000,maxBuffer:256000});
    if(client!=='hermes'||/\byod-os-local\b/.test(old.stdout))throw Object.assign(Error('Ya existe yod-os-local. Revisa esa conexión; no se ha reemplazado.'),{existing:true});
  } catch(e) {
    if(e.existing||e.code==='ENOENT'||e.killed||client==='hermes')throw e;
    if(!/not found|no mcp server|no server.*(?:named|name)/i.test(String(e.stderr||'')+' '+String(e.stdout||'')))throw e;
  }
  console.log('Registrando yod-os-local en '+client+(client==='hermes'?' / '+options[pi+1]:'')+'.');
  const code=await new Promise((r,j)=>{const c=spawn(cmd.command,cmd.args,{stdio:'inherit'});c.once('error',j);c.once('exit',r);});
  if(code!==0)throw Error('La CLI no confirmó el registro. Revisa su mensaje; no se cambió otro cliente.');
  const check=await run(cmd.command,cmd.check,{timeout:30000,maxBuffer:256000});
  if(!/\byod-os-local\b/.test(check.stdout))throw Error('La CLI terminó, pero su relectura no confirmó la conexión.');
  console.log('Registro comprobado. Abre o recarga MCP en ese cliente y solicita yod_estado. Ese resultado confirma su conexión con YOD.');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e=>{
  // Do not echo upstream bodies or credentials returned by a child process.
  console.error(e.code==='ENOENT'?'No se encontró la CLI del cliente en este equipo.':e instanceof Error && !e.stdout && !e.stderr?e.message:'No se pudo completar la operación. Revisa la CLI nativa.');process.exitCode=1;
});
