import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.mjs';
import { PppTransport } from './transport.mjs';
import { PppAdapter } from './ppp.mjs';
import { Journal } from './journal.mjs';
import { createServer } from './server.mjs';

try {
  const config=await loadConfig();
  const server=createServer(new PppAdapter(config,new PppTransport(config.endpoint),new Journal(config.stateDir)));
  await server.connect(new StdioServerTransport());
} catch {
  console.error('YOD MCP no inició. Revisa endpoint, sesión individual y configuración privada según mcp/README.md.');
  process.exitCode=1;
}
