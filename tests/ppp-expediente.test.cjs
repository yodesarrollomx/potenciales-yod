const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname,'../ppp-expediente.js'),'utf8');
function fixture(text) {
  const nodes = new Map();
  class Element {
    constructor(tag) { this.tagName=tag; this.children=[]; this.style={}; this.textContent=''; this.attrs={}; }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren() { this.children=[]; }
    setAttribute(k,v) { this.attrs[k]=v; }
    insertAdjacentElement(_,el) { nodes.set(el.id,el); }
  }
  const source=new Element('div'); source.textContent=text; nodes.set('segLog',source);
  let observer;
  const document={readyState:'complete',getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag)};
  class MutationObserver { constructor(fn) {observer=fn;} observe() {} }
  vm.runInNewContext(script,{document,MutationObserver});
  const walk=(node)=>[node,...node.children.flatMap(walk)];
  return {source,update:()=>observer(),all:()=>walk(nodes.get('pppExpediente')),document,MutationObserver};
}
test('shows authorized links and literal timeline text',()=>{
  const f=fixture('Libro del caso: https://docs.google.com/spreadsheets/d/synthetic/edit\nExpediente Drive: https://drive.google.com/drive/folders/synthetic\nSupuesto inicial: S01 · documental\n2026-10-09 · <img onerror=bad>');
  const all=f.all();
  assert.equal(all.filter(n=>n.tagName==='a').length,2);
  assert.equal(all.find(n=>n.tagName==='li').textContent,'2026-10-09 · <img onerror=bad>');
  assert.ok(all.some(n=>n.textContent.includes('no son un estudio financiero')));
  assert.ok(all.filter(n=>n.tagName==='a').every(n=>n.rel==='noopener noreferrer'));
});
test('rejects credentials, unsafe schemes and deceptive hosts',()=>{
  const f=fixture('Libro del caso: javascript:alert(1)\nExpediente Drive: https://drive.google.com.evil.test/a\nNota Obsidian: https://drive.google.com@evil.test/a\nMinuta Obsidian: https://evil.test/a');
  assert.equal(f.all().filter(n=>n.tagName==='a').length,0);
});
test('changing case replaces previous book and timeline',()=>{
  const f=fixture('Libro del caso: https://docs.google.com/spreadsheets/d/first/edit\n2026-10-09 · first');
  f.source.textContent='Libro del caso: https://docs.google.com/spreadsheets/d/second/edit\n2026-10-10 · second'; f.update();
  assert.deepEqual(f.all().filter(n=>n.tagName==='a').map(n=>n.href),['https://docs.google.com/spreadsheets/d/second/edit']);
  assert.deepEqual(f.all().filter(n=>n.tagName==='li').map(n=>n.textContent),['2026-10-10 · second']);
  f.source.textContent='Sin notas todavía.'; f.update();
  assert.equal(f.all().filter(n=>n.tagName==='a').length,0);
});
test('mount is idempotent and all models include one shared script',()=>{
  const f=fixture('Sin notas todavía.');
  vm.runInNewContext(script,{document:f.document,MutationObserver:f.MutationObserver});
  for(const filename of ['residencial.html','patrimonial.html','macrolotes.html','mixto.html','unifamiliar.html']) {
    const html=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
    assert.equal((html.match(/src="ppp-expediente\.js\?v=20261009-1"/g)||[]).length,1);
    assert.ok(html.includes('id="segLog"'));
  }
});
