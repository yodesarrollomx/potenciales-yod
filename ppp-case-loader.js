/* Read-only case selection. A late response can never replace a newer selection. */
(function(root){
 'use strict';
 function create(read,timeoutMs=90000){
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
 function validModel(m,id){
  if(!m||m.ok===false||m.caso_id!==id||typeof m.revision!=='string'||!m.revision||!Array.isArray(m.escenarios)||!m.escenarios.length||!m.estados)return false;
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v),ids=m.escenarios.map(e=>e?.id);
  return ids.every(v=>typeof v==='string'&&v.trim())&&new Set(ids).size===ids.length&&ids.includes(m.activo)&&m.escenarios.every(e=>object(e.inputs)&&object(m.estados[e.id]?.p))&&Array.isArray(m.estados[m.activo]?.flows);
 }
 function selectScenario(m,selected){return m.escenarios.some(e=>e.id===selected)&&Array.isArray(m.estados[selected]?.flows)?selected:m.activo;}

 const api={create,validModel,selectScenario};if(typeof module==='object'&&module.exports)module.exports=api;root.PPPCaseLoader=api;
})(typeof window==='undefined'?globalThis:window);
