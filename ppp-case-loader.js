/* Read-only case selection. A late response can never replace a newer selection. */
(function(root){
 'use strict';
 function create(read,timeoutMs=60000){
  let generation=0;
  return {invalidate(){generation++;},async load(params){
   const ticket=++generation;let timer;
   try{
    const result=await Promise.race([read(params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('tiempo_agotado')),timeoutMs);})]);
    return ticket===generation?result:null;
   }catch(error){if(ticket!==generation)return null;throw error;}
   finally{clearTimeout(timer);}
  }};
 }
 function validModel(m,id){return !!(m&&m.ok!==false&&m.caso_id===id&&typeof m.revision==='string'&&m.revision&&Array.isArray(m.escenarios)&&m.escenarios.length&&m.escenarios.some(e=>e.id===m.activo)&&m.estados&&m.escenarios.every(e=>e.inputs&&m.estados[e.id]?.p&&Array.isArray(m.estados[e.id].flows)));}
 const api={create,validModel};if(typeof module==='object'&&module.exports)module.exports=api;root.PPPCaseLoader=api;
})(typeof window==='undefined'?globalThis:window);
