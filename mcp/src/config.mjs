import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readConnection } from './connection.mjs';

export async function loadConfig(env = process.env, mode = 'stdio') {
  // Reuse the deployed frontend's configuration; never discover endpoints from tool arguments.
  const frontend = await readFile(new URL('../../ppp2.js', import.meta.url), 'utf8');
  const endpoint = env.YOD_PPP_ENDPOINT || frontend.match(/var ENDPOINT = window.PPP2_ENDPOINT \|\| '([^']+)'/)[1];
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) throw Error('endpoint_invalido');
  if (mode === 'http' && (env.YOD_PORTERO_SESSION || env.YOD_MCP_WRITE === '1')) throw Error('http_solo_lectura_compartida');
  const stateDir = env.YOD_MCP_STATE_DIR || join(homedir(), '.local', 'state', 'yod-mcp');
  const connection = mode === 'stdio' && !env.YOD_PORTERO_SESSION ? await readConnection(stateDir) : null;
  const session = mode === 'stdio' ? (env.YOD_PORTERO_SESSION || connection?.session || '') : '';
  // A master key is not a user identity. Only an individual Portero session is accepted.
  if (session && !/^sy[A-Za-z0-9_-]{18,198}$/.test(session)) throw Error('requiere_sesion_individual');
  let catalog = [];
  if (env.YOD_MCP_CATALOG_FILE) catalog = JSON.parse(await readFile(env.YOD_MCP_CATALOG_FILE, 'utf8'));
  else if (env.YOD_MCP_CATALOG_JSON) catalog = JSON.parse(env.YOD_MCP_CATALOG_JSON);
  if (!Array.isArray(catalog) || catalog.length > 100) throw Error('catalogo_invalido');
  const seen = new Set();
  for (const entry of catalog) {
    if (!entry || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(entry.id || '') || seen.has(entry.id) ||
        entry.publicada !== true || !/^[A-Za-z0-9_-]{24,80}$/.test(entry.liga || '') ||
        (entry.plan && !/^(p2[a-z0-9]{6,20}|ppp:[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)?)$/.test(entry.plan))) throw Error('catalogo_invalido');
    seen.add(entry.id);
  }
  return { endpoint, session, catalog, connectionId:connection?.id, allowedPlans:connection?.plans,
    write: mode === 'stdio' && !!session && (connection ? connection.write : env.YOD_MCP_WRITE === '1'),
    stateDir, mode };
}
