import { mkdir, lstat, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { YodError } from './transport.mjs';

export class Journal {
  constructor(directory) { this.directory = directory; }
  async syncDirectory() {
    const f=await open(this.directory,'r');
    try { await f.sync(); } finally { await f.close(); }
  }
  path(id, suffix = '.json') {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new YodError('cambio_invalido');
    return join(this.directory, id + suffix);
  }
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const s = await lstat(this.directory);
    if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & 0o077) || (process.getuid && s.uid !== process.getuid())) throw new YodError('directorio_no_privado');
  }
  async create(record) {
    await this.init();
    const id = randomUUID(), f = await open(this.path(id), 'wx', 0o600);
    try { await f.writeFile(JSON.stringify({ ...record, id })); await f.sync(); } finally { await f.close(); }
    await this.syncDirectory();
    return { ...record, id };
  }
  async read(id) {
    await this.init();
    try {
      const path = this.path(id), s = await lstat(path);
      if (!s.isFile() || s.isSymbolicLink() || (s.mode & 0o077) || s.size > 1000000) throw Error();
      return JSON.parse(await readFile(path, 'utf8'));
    } catch { throw new YodError('cambio_no_encontrado'); }
  }
  async update(record) {
    const temp = this.path(record.id, '.' + randomUUID() + '.tmp');
    const f = await open(temp, 'wx', 0o600);
    try { await f.writeFile(JSON.stringify(record)); await f.sync(); } finally { await f.close(); }
    await rename(temp, this.path(record.id));
    await this.syncDirectory();
  }
  async claim(id) {
    try { const f = await open(this.path(id, '.claim'), 'wx', 0o600); await f.sync(); await f.close(); await this.syncDirectory(); }
    catch { throw new YodError('envio_ya_reclamado', { cambio_id:id, instruccion:'Consulta el recibo; no prepares otro cambio para repetir el envío.' }); }
  }
}
