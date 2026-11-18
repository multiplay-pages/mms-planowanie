// Adapter contract tests with a fake MapLibre: popup lifecycle and provider URL validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createOperationalMapView,validateSatelliteConfig,maskSecrets} from '../maplibre-view.mjs';

// The adapter registers its protocol once per process, so the handler is kept at file level.
const registeredProtocols={};
function fakeMapLibre() {
  const state={popups:[],handlers:{}};
  class Popup {
    constructor(){state.popups.push(this);this.closed=false;this.lngLat=null;this.content=null;this.el=document.createElement('div');this.contentCalls=0;}
    setLngLat(c){this.lngLat=c;return this;}
    // Like the vendored Popup: new content is attached and its first control is focused.
    setDOMContent(n){this.content=n;this.contentCalls++;this.el.replaceChildren(n);if(this.el.isConnected)n.querySelector('button')?.focus();return this;}
    addTo(){document.body.append(this.el);this.el.querySelector('button')?.focus();return this;} on(){return this;} getElement(){return this.el;}
    remove(){this.closed=true;this.el.remove();}
  }
  class Map {
    constructor(){this.sources={};this.canvas=document.createElement('canvas');}
    addControl(){} getCanvas(){return this.canvas;} once(e,f){if(e==='load'&&!state.holdLoad)queueMicrotask(f);}
    addImage(){} getLayer(){return null;} getSource(id){return this.sources[id]??(this.sources[id]={setData(){}});}
    on(event,fn){(state.handlers[event]??=[]).push(fn);} queryRenderedFeatures(){return state.features;}
    setLayoutProperty(){} setPaintProperty(){} remove(){}
  }
  return {Map,Popup,NavigationControl:class{},FullscreenControl:class{},ScaleControl:class{},addProtocol(name,handler){registeredProtocols[name]=handler;},state};
}
const feature=(props)=>({type:'Feature',geometry:{type:'Point',coordinates:[18.1,50.6]},properties:props});
const collection=(...f)=>({type:'FeatureCollection',features:f});

test('an open popup is refreshed when its order changes and closed when it leaves the map',async()=>{
  const window=new Window();globalThis.document=window.document;
  const ctx=new Proxy({},{get:(_,k)=>k==='getImageData'?()=>({}):()=>{},set:()=>true});
  window.HTMLCanvasElement.prototype.getContext=()=>ctx;
  document.body.innerHTML='<div class="op-map-shell"><div id="m"></div></div>';
  const ml=fakeMapLibre(),visit=feature({orderId:'TEST-001',type:'Instalacja',teamId:'TEST-01',seq:1,window:'08:00–11:00',address:'A'});
  ml.state.features=[visit];
  const view=createOperationalMapView({maplibregl:ml,container:document.getElementById('m'),roadTiles:null,towns:{type:'FeatureCollection',features:[]},regionBounds:null,teams:[{teamId:'TEST-01',color:'#0072B2'}],callbacks:{onEdit(){}}});
  await view.ready;ml.state.handlers.click[0]({point:{x:1,y:1}});
  const popup=ml.state.popups[0];
  assert.match(popup.content.textContent,/Koszyk TEST-01/);
  // Same order moved to another basket: popup text follows the plan.
  await view.update({visits:collection(feature({orderId:'TEST-001',type:'Instalacja',teamId:'TEST-02',seq:2,window:'12:00–15:00',address:'A'})),routes:collection(),unassigned:collection()});
  assert.equal(popup.closed,false);assert.match(popup.content.textContent,/Koszyk TEST-02 · wizyta nr 2 · 12:00–15:00/);
  // Returned to the queue: the popup now describes an unassigned order, never a stale basket.
  await view.update({visits:collection(),routes:collection(),unassigned:collection(feature({orderId:'TEST-001',type:'Instalacja',address:'A',ready:true}))});
  assert.doesNotMatch(popup.content.textContent,/Koszyk/);assert.match(popup.content.textContent,/Nieprzydzielone/);
  // Gone from the day's map entirely: closed.
  await view.update({visits:collection(),routes:collection(),unassigned:collection()});
  assert.equal(popup.closed,true);
});

test('satellite config rejects credentials in the URL and masks userinfo in messages',()=>{
  const allowed=['https://tiles.example'];
  const base={consent:true,attribution:'© test'};
  assert.equal(validateSatelliteConfig({...base,url:'https://tiles.example/{z}/{x}/{y}.png'},allowed).ok,true);
  const bad=validateSatelliteConfig({...base,url:'https://review-user:review-password@tiles.example/{z}/{x}/{y}.png'},allowed);
  assert.equal(bad.ok,false);assert.doesNotMatch(bad.reason,/review-password/);
  assert.doesNotMatch(maskSecrets('Failed https://review-user:review-password@tiles.example/1/2/3.png?key=abc'),/review-password|abc/);
});

test('a map failure before the first load rejects ready (SVG fallback path); later tile errors do not',async()=>{
  const window=new Window();globalThis.document=window.document;
  document.body.innerHTML='<div class="op-map-shell"><div id="m"></div></div>';
  const ctx=new Proxy({},{get:(_,k)=>k==='getImageData'?()=>({}):()=>{},set:()=>true});
  window.HTMLCanvasElement.prototype.getContext=()=>ctx;
  const ml=fakeMapLibre();ml.state.holdLoad=true;const errors=[];
  const view=createOperationalMapView({maplibregl:ml,container:document.getElementById('m'),roadTiles:null,towns:{type:'FeatureCollection',features:[]},regionBounds:null,teams:[],callbacks:{onEdit(){},onError:m=>errors.push(m)}});
  for(const fn of ml.state.handlers.error)fn({sourceId:'roads',error:new Error('tile failed')});
  let settled='pending';view.ready.then(()=>{settled='resolved';},()=>{settled='rejected';});
  await new Promise(r=>setTimeout(r,5));assert.equal(settled,'pending');
  for(const fn of ml.state.handlers.error)fn({error:new Error('Worker failed to load. https://u:pw@x.example/w.js?key=abc')});
  await new Promise(r=>setTimeout(r,5));assert.equal(settled,'rejected');
  await assert.rejects(view.ready,e=>!/pw@|abc/.test(e.message));assert.equal(errors.length,2);
});

test('an open popup is not rebuilt, and focus is not stolen, by renders that leave its order unchanged',async()=>{
  const window=new Window();globalThis.document=window.document;
  document.body.innerHTML='<input id="outside"><div class="op-map-shell"><div id="m"></div></div>';
  const ctx=new Proxy({},{get:(_,k)=>k==='getImageData'?()=>({}):()=>{},set:()=>true});
  window.HTMLCanvasElement.prototype.getContext=()=>ctx;
  const ml=fakeMapLibre(),props={orderId:'TEST-001',type:'Instalacja',teamId:'TEST-01',seq:1,window:'08:00–11:00',address:'A'};
  ml.state.features=[feature(props)];
  const view=createOperationalMapView({maplibregl:ml,container:document.getElementById('m'),roadTiles:null,towns:{type:'FeatureCollection',features:[]},regionBounds:null,teams:[{teamId:'TEST-01',color:'#0072B2'}],callbacks:{onEdit(){}}});
  await view.ready;ml.state.handlers.click[0]({point:{x:1,y:1}});
  const popup=ml.state.popups[0],outside=document.getElementById('outside');outside.focus();
  // Same data (only the planner highlight differs): no rebuild, focus stays outside.
  await view.update({visits:collection(feature({...props,selected:true})),routes:collection(),unassigned:collection()});
  assert.equal(popup.contentCalls,1);assert.equal(document.activeElement,outside);
  // Data changed while the user works elsewhere: text follows, focus still stays outside.
  await view.update({visits:collection(feature({...props,teamId:'TEST-02'})),routes:collection(),unassigned:collection()});
  assert.equal(popup.contentCalls,2);assert.match(popup.content.textContent,/TEST-02/);assert.equal(document.activeElement,outside);
});

test('the mmsroads protocol forwards tile requests and the abort signal to the road-tile client',async()=>{
  const window=new Window();globalThis.document=window.document;
  document.body.innerHTML='<div class="op-map-shell"><div id="m"></div></div>';
  const ctx=new Proxy({},{get:(_,k)=>k==='getImageData'?()=>({}):()=>{},set:()=>true});
  window.HTMLCanvasElement.prototype.getContext=()=>ctx;
  const calls=[],roadTiles={tile:async(...args)=>{calls.push(args);return new ArrayBuffer(8);}};
  createOperationalMapView({maplibregl:fakeMapLibre(),container:document.getElementById('m'),roadTiles,towns:{type:'FeatureCollection',features:[]},regionBounds:null,teams:[],callbacks:{onEdit(){}}});
  const handler=registeredProtocols.mmsroads,controller=new AbortController();
  assert.equal(typeof handler,'function');
  const result=await handler({url:'mmsroads://14/8900/5400'},controller);
  assert.equal(result.data.byteLength,8);
  assert.deepEqual(calls[0].slice(0,3),[14,8900,5400]);assert.equal(calls[0][3],controller.signal);
  await assert.rejects(handler({url:'mmsroads://x'},controller),/Nieprawidłowy adres kafla/);
  // Without a client (e.g. after the map was disabled) the handler fails cleanly instead of crashing the worker thread.
  createOperationalMapView({maplibregl:fakeMapLibre(),container:document.getElementById('m'),roadTiles:null,towns:{type:'FeatureCollection',features:[]},regionBounds:null,teams:[],callbacks:{onEdit(){}}});
  await assert.rejects(handler({url:'mmsroads://14/1/1'},controller),/nie są dostępne/);
});
