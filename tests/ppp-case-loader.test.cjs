'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create,validModel}=require('../ppp-case-loader.js'),{native}=require('./ppp-fixture.js');
test('Late case responses cannot replace a later selection',async()=>{const pending={};const c=create(p=>new Promise(resolve=>pending[p.id]=resolve));const first=c.load({id:'a'}),second=c.load({id:'b'});pending.b({id:'b'});assert.deepEqual(await second,{id:'b'});pending.a({id:'a'});assert.equal(await first,null);});
test('New case invalidates an earlier request, including rejection',async()=>{let reject;const c=create(()=>new Promise((_,r)=>reject=r));const reading=c.load({id:'old'});c.invalidate();reject(Error('offline'));assert.equal(await reading,null);});
test('An unresponsive read times out without accepting a late result',async()=>{let resolve;const c=create(()=>new Promise(r=>resolve=r),10);await assert.rejects(c.load({id:'a'}),/tiempo_agotado/);resolve({ok:true});});
test('A native response must match the case and contain every scenario result',()=>{const m=native();assert.equal(validModel(m,m.caso_id),true);assert.equal(validModel(m,'other'),false);assert.equal(validModel({...m,estados:{}},m.caso_id),false);assert.equal(validModel({...m,activo:'missing'},m.caso_id),false);assert.equal(validModel({...m,revision:null},m.caso_id),false);});
