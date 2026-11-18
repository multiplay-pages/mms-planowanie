// Adapter contract tests with a fake MapLibre: popup lifecycle and provider URL validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createOperationalMapView,validateSatelliteConfig,maskSecrets} from '../maplibre-view.mjs';

// The adapter registers its protocol once per process, so the handler is kept at file level.
const registeredProtocols={};
function fakeMapLibre() {
  const state={popups:[],handlers:{},maps:[],added:[]};
  class Popup {
    constructor(){state.popups.push(this);this.closed=false;this.lngLat=null;this.content=null;this.el=document.createElement('div');this.contentCalls=0;}
    setLngLat(c){this.lngLat=c;return this;}
    // Like the vendored Popup: new content is attached and its first control is focused.
    setDOMContent(n){this.content=n;this.contentCalls++;this.el.replaceChildren(n);if(this.el.isConnected)n.querySelector('button')?.focus();return this;}
    addTo(){document.body.append(this.el);this.el.querySelector('button')?.focus();return this;} on(){return this;} getElement(){return this.el;}
    remove(){this.closed=true;this.el.remove();}
  }
  class Map {
    constructor(options){this.options=options;this.sources={};this.canvas=document.createElement('canvas');this.layers=new Set((options?.style?.layers??[]).map(layer=>layer.id));this.layout={};this.paint={};this.images=new Set();state.maps.push(this);}
    addControl(){} getCanvas(){return this.canvas;} once(e,f){if(e==='load'&&!state.holdLoad)queueMicrotask(f);}
    addImage(name){this.images.add(name);} hasImage(name){return this.images.has(name);}
    getLayer(id){return this.layers.has(id)?{id}:null;} addLayer(layer){this.layers.add(layer.id);state.added.push(layer.id);} removeLayer(id){this.layers.delete(id);}
    addSource(id){this.sources[id]={};} removeSource(id){delete this.sources[id];}
    getSource(id){return this.sources[id]??(this.sources[id]={setData(){},getClusterExpansionZoom:async()=>state.expansionZoom??11});}
    on(event,fn){(state.handlers[event]??=[]).push(fn);}
    queryRenderedFeatures(geometry,options){return (options?.layers??[]).some(id=>id.includes('cluster'))?(state.clusters??[]):state.features;}
    setLayoutProperty(id,key,value){this.layout[`${id}.${key}`]=value;} setPaintProperty(id,key,value){this.paint[`${id}.${key}`]=value;}
    easeTo(options){state.eased=options;} getZoom(){return 9;} resize(){} remove(){}
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

const canvasContext=()=>new Proxy({},{get:(_,k)=>k==='getImageData'?()=>({}):()=>{},set:()=>true});
function mountView(extra={},features=[]) {
  const window=new Window();globalThis.document=window.document;window.HTMLCanvasElement.prototype.getContext=canvasContext;
  document.body.innerHTML='<div class="op-map-shell"><div id="m"></div></div>';
  const ml=fakeMapLibre();ml.state.features=features;
  const view=createOperationalMapView({maplibregl:ml,container:document.getElementById('m'),roadTiles:null,towns:{type:'FeatureCollection',features:[]},regionBounds:null,teams:[{teamId:'TEST-01',color:'#0072B2'}],callbacks:{onEdit(){}},...extra});
  return {ml,view,map:ml.state.maps[0]};
}

test('the mmspack protocol reads tiles from the pack, treats missing tiles as empty and rejects bad URLs',async()=>{
  const calls=[],pack={header:{minZoom:5,maxZoom:14,bounds:[17.2,49.9,19,51.5]},tile:async(...args)=>{calls.push(args);return args[1]===1?null:new Uint8Array([1,2,3,4]);}};
  const {view,map}=mountView({pack});
  const handler=registeredProtocols.mmspack,controller=new AbortController();
  const result=await handler({url:'mmspack://12/2200/1400'},controller);
  assert.deepEqual([...new Uint8Array(result.data)],[1,2,3,4]);assert.deepEqual(calls[0].slice(0,3),[12,2200,1400]);assert.equal(calls[0][3],controller.signal);
  assert.equal((await handler({url:'mmspack://12/1/1'},controller)).data.byteLength,0);
  await assert.rejects(handler({url:'mmspack://x'},controller),/Nieprawidłowy adres kafla pakietu/);
  assert.equal(view.rich,true);assert.deepEqual(map.options.style.sources.roads.tiles,['mmspack://{z}/{x}/{y}']);assert.deepEqual(map.options.style.sources.roads.bounds,[17.2,49.9,19,51.5]);
  assert.ok(map.layers.has('building')&&map.layers.has('place-labels'),'pack layers are part of the style');
  assert.equal(view.packInfo.maxZoom,14);
});

test('without a pack the roads-only tiles and style are used and no pack layer exists',()=>{
  const {view,map}=mountView({});
  assert.equal(view.rich,false);assert.deepEqual(map.options.style.sources.roads.tiles,['mmsroads://{z}/{x}/{y}']);
  assert.ok(!map.layers.has('building')&&!map.layers.has('water')&&map.layers.has('town-labels'));assert.equal(view.packInfo,null);
});

test('visits and the queue are clustered when zoomed out',()=>{
  const {map}=mountView({});
  assert.equal(map.options.style.sources.visits.cluster,true);assert.equal(map.options.style.sources.unassigned.cluster,true);
  assert.ok(map.options.style.sources.visits.clusterMaxZoom<=12,'clusters dissolve before street level');
});

test('clicking a cluster zooms in; two orders at one spot open a picker instead of guessing',async()=>{
  const {ml,view}=mountView({},[]);
  await view.ready;
  ml.state.clusters=[{layer:{id:'visits-cluster'},properties:{cluster_id:7},geometry:{coordinates:[18.1,50.6]}}];ml.state.expansionZoom=11;
  ml.state.handlers.click[0]({point:{x:5,y:5}});
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(ml.state.eased.zoom,11.5);assert.deepEqual(ml.state.eased.center,[18.1,50.6]);
  ml.state.clusters=[];
  ml.state.features=[feature({orderId:'TEST-001',type:'MPL',teamId:'TEST-01',seq:1}),feature({orderId:'TEST-002',type:'BSA',teamId:'TEST-02',seq:2})];
  ml.state.handlers.click[0]({point:{x:5,y:5}});
  const picker=ml.state.popups.at(-1);
  assert.match(picker.content.textContent,/2 zlecenia w tym miejscu/);
  const buttons=[...picker.content.querySelectorAll('button')];assert.equal(buttons.length,2);
  buttons[1].click();
  assert.match(ml.state.popups.at(-1).content.textContent,/TEST-002/);
});

test('switching the variant rebuilds all layers in order and keeps the user switches',async()=>{
  const {ml,view,map}=mountView({});
  await view.ready;
  await view.setFlags({buildings:false,numbers:false});
  assert.equal(map.layout['visits-label.visibility'],'none');
  ml.state.added.length=0;
  await view.setVariant('nav');
  assert.equal(view.variant,'nav');assert.equal(ml.state.added[0],'background');assert.ok(ml.state.added.includes('routes')&&ml.state.added.includes('visits-label'));
  assert.equal(map.layout['visits-label.visibility'],'none','a hidden layer stays hidden after the style swap');
  await view.setVariant('does-not-exist');assert.equal(view.variant,'nav');
});

test('basemap modes: hybrid keeps roads and labels but removes fills, satellite removes the cartography, road restores it',async()=>{
  const {view,map}=mountView({pack:{header:{minZoom:5,maxZoom:14,bounds:[17,49,19,51]},tile:async()=>null}});
  await view.ready;
  await view.setBasemap('hybrid',{url:'https://tiles.example/{z}/{x}/{y}.png',attribution:'© test'});
  assert.equal(view.basemap,'hybrid');assert.equal(map.layout['satellite.visibility'],'visible');
  assert.equal(map.layout['building.visibility'],'none');assert.equal(map.layout['roads-fill.visibility'],'visible');assert.equal(map.layout['road-labels.visibility'],'visible');assert.equal(map.layout['background.visibility'],'none');
  await view.setBasemap('satellite',{url:'https://tiles.example/{z}/{x}/{y}.png',attribution:'© test'});
  assert.equal(map.layout['roads-fill.visibility'],'none');assert.equal(map.layout['place-labels.visibility'],'none');
  await view.setBasemap('road');
  assert.equal(view.basemap,'road');assert.equal(map.layout['roads-fill.visibility'],'visible');assert.equal(map.layout['building.visibility'],'visible');assert.equal(map.layout['background.visibility'],'visible');assert.ok(!map.layers.has('satellite'));
});
