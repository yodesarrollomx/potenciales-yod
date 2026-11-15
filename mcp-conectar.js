/* Conexión al proceso que la persona acaba de iniciar en ESTE equipo. No guarda
   sesiones nuevas en la página ni las coloca en direcciones, mensajes o registros. */
(function(){
  'use strict';
  var $=function(id){return document.getElementById(id);};
  var args=new URLSearchParams(location.hash.slice(1)),port=args.get('puerto'),reto=args.get('reto');
  var valid=/^\d{1,5}$/.test(port||'') && Number(port)>=1024 && Number(port)<=65535 && /^[a-f0-9]{64}$/.test(reto||'');
  var session='', endpoint='',busy=false;
  function status(t){$('estado').textContent=t;}
  async function load(){
    $('permiso').hidden=true;$('reintentar').hidden=true;
    if(!valid){status('Primero inicia la conexión en tu equipo.');$('instruccion').hidden=false;return;}
    session=localStorage.getItem('pyod_clave_v1')||'';
    if(!/^sy[A-Za-z0-9_-]{18,198}$/.test(session)){status('Entra con tu cuenta para elegir tus planes.');$('entrar').hidden=false;return;}
    $('entrar').hidden=true;status('Consultando tus permisos y planes…');
    try{
      // Same source as the installed MCP and the plan screen; do not fork an endpoint.
      var source=await fetch('ppp2.js',{cache:'no-cache',credentials:'omit'}).then(function(r){if(!r.ok)throw Error();return r.text();});
      var match=source.match(/var ENDPOINT = window.PPP2_ENDPOINT \|\| '([^']+)'/);
      endpoint=match&&match[1];
      if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint||''))throw Error();
      var r=await fetch(endpoint+'?recurso=ppp2-vivero&k='+encodeURIComponent(session),{credentials:'omit',signal:AbortSignal.timeout(45000)}).then(function(x){return x.json();});
      if(session!==localStorage.getItem('pyod_clave_v1'))return load();
      if(!r.ok){status('No se pudo validar tu sesión de YOD. Vuelve a entrar.');$('entrar').hidden=false;return;}
      if(!Array.isArray(r.planes)||!r.yo||!r.puede)throw Error();
      $('identidad').textContent='Conectando como '+r.yo.nombre+'.';
      $('planes').replaceChildren();
      r.planes.forEach(function(p){
        if(!/^p2[a-z0-9]{6,20}$/.test(p.plan_id||''))return;
        var label=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span');
        input.type='checkbox';input.name='plan';input.value=p.plan_id;name.textContent=p.nombre||p.plan_id;
        label.append(input,name);$('planes').append(label);
      });
      $('editar').checked=false;$('editar').disabled=r.puede.editar!==true;
      $('permiso').hidden=false;status('Selecciona los planes. La conexión todavía no está autorizada.');
    }catch(e){status('No se pudieron consultar los planes. Tu sesión se conserva.');$('reintentar').hidden=false;}
  }
  $('entrar').onclick=function(){if(window.YODPortero)window.YODPortero.entrar();else status('El acceso de YOD todavía está cargando. Vuelve a intentar.');};
  $('reintentar').onclick=load;
  $('permiso').onsubmit=async function(e){
    e.preventDefault();if(busy)return;
    var plans=Array.from(document.querySelectorAll('input[name="plan"]:checked')).map(function(x){return x.value;});
    if(!plans.length){status('Elige al menos un plan.');return;}
    if(session!==localStorage.getItem('pyod_clave_v1'))return load();
    busy=true;var button=$('permiso').querySelector('button');button.disabled=true;status('Conectando con el proceso de tu equipo…');
    try{
      var r=await fetch('http://127.0.0.1:'+port+'/connect',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','X-Yod-Conexion':reto},body:JSON.stringify({session:session,plans:plans,write:$('editar').checked}),signal:AbortSignal.timeout(55000)}).then(function(x){return x.json();});
      if(!r.ok)throw Error();
      $('permiso').hidden=true;history.replaceState(null,'',location.pathname);
      status('Acceso autorizado para '+r.planes.length+' plan(es). Vuelve a la terminal para terminar la instalación y comprobar cada asistente.');session='';
    }catch(e){status('No se pudo confirmar la conexión. Comprueba el resultado en la terminal; si no quedó guardada, vuelve a iniciar «conectar» en ese mismo equipo.');}
    finally{busy=false;button.disabled=false;}
  };
  load();
})();
