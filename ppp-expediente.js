/* Expediente documental del PPP. Sólo lee enlaces y notas autorizadas del caso. */
(function () {
  'use strict';
  function safeUrl(value) {
    var url = String(value).trim();
    return /^https:\/\/(?:docs\.google\.com|drive\.google\.com|notebooklm\.google\.com)\/(?:[^\s]*)$/.test(url) ? url : '';
  }
  function parse(text) {
    var links = [], events = [], initial = false;
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var match = line.match(/^(Libro del caso|Historial documental|Documentos del caso|Expediente Drive|Nota Obsidian|Minuta Obsidian|Fuentes NotebookLM):\s*(https:\/\/\S+)\s*$/);
      if (match) { var url = safeUrl(match[2]); if (url) links.push({label:match[1],url:url}); return; }
      if (/^Supuesto inicial:\s*S01.*documental/i.test(line)) initial = true;
      if (/^\d{4}-\d{2}-\d{2}\s*[·|]/.test(line)) events.push(line);
    });
    return {links:links,events:events,initial:initial};
  }
  function mount() {
    var source = document.getElementById('segLog');
    if (!source || document.getElementById('pppExpediente')) return;
    var section = document.createElement('section');
    section.id = 'pppExpediente';
    section.style.cssText = 'margin:14px 0;padding:14px;border:1px solid var(--linea,#ddd);border-radius:12px;overflow-wrap:anywhere';
    source.insertAdjacentElement('afterend', section);
    function render() {
      var data = parse(source.textContent);
      section.replaceChildren();
      var h = document.createElement('h3'); h.textContent = 'Libro e historial del caso'; h.style.marginTop = '0'; section.appendChild(h);
      if (!data.links.length) {
        var empty = document.createElement('p');
        empty.textContent = 'El historial de seguimiento está arriba. Los enlaces al libro y al expediente se mostrarán aquí cuando se incorporen al caso.';
        section.appendChild(empty); return;
      }
      if (data.initial) {
        var note = document.createElement('p');
        note.textContent = 'S01 · Primera reunión: registro documental. Los campos pendientes y los resultados de plantilla del planificador no son un estudio financiero del predio.';
        section.appendChild(note);
      }
      var nav = document.createElement('nav'); nav.setAttribute('aria-label','Archivos e historial del caso');
      data.links.forEach(function (item) {
        var a = document.createElement('a'); a.href = item.url; a.textContent = item.label;
        a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.style.cssText = 'display:inline-block;margin:4px 10px 6px 0;padding:7px 10px;border:1px solid var(--linea,#ddd);border-radius:8px;color:inherit';
        nav.appendChild(a);
      });
      section.appendChild(nav);
      if (data.events.length) {
        var list = document.createElement('ol'); list.style.cssText = 'padding-left:20px;font-size:12px;line-height:1.6';
        data.events.forEach(function (event) {var li=document.createElement('li');li.textContent=event;list.appendChild(li);});
        section.appendChild(list);
      }
    }
    new MutationObserver(render).observe(source,{childList:true,characterData:true,subtree:true});
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true}); else mount();
})();
