// MAP-06/08: MapLibre GL adapter. It renders layers produced by operational-map.mjs and never
// changes the plan itself; edits are delegated back to the planner through callbacks.
import {baseLayers,opsLayers,BASE_LAYER_IDS,OPS_LAYER_IDS,markerImage,DEFAULT_VARIANT,MAP_VARIANTS} from './map-style.mjs';

const OP_EMPTY={type:'FeatureCollection',features:[]};
const OP_CLUSTER={cluster:true,clusterMaxZoom:10,clusterRadius:38};
// Layers belonging to each user-facing switch; basemap mode and switches both decide visibility.
export const OP_LAYER_GROUPS={
  routes:['routes-casing','routes-dim','routes','routes-active-casing'],
  arrows:['routes-arrows'],
  legs:['routes-leg-labels'],
  numbers:['visits-label'],
  unassigned:['unassigned-cluster','unassigned-cluster-count','unassigned','unassigned-measurement','selected-ring-queue'],
  buildings:['building','building-line'],
  streets:['road-labels'],
  places:['place-labels','place-labels-minor','town-labels'],
  nature:['landuse-forest','landuse-park','landuse-residential','landuse-industrial','landuse-cemetery','water','waterway','rail-casing','rail'],
  roads:['roads-casing','roads-fill','roads-track'],
};
const OP_FILL_LAYERS=['landuse-forest','landuse-park','landuse-residential','landuse-industrial','landuse-cemetery','water','waterway','rail-casing','rail','building','building-line'];
export const OP_DEFAULT_FLAGS={routes:true,arrows:true,legs:true,numbers:true,unassigned:true,buildings:true,streets:true,places:true,nature:true,roads:true};
let opRoadTiles=null,opPack=null,opProtocolRegistered=false,opCallbacks=null,opPackFailures=0,opPackReported=false;
const opEscape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Hides API keys/tokens in URLs before a message is shown or logged. */
export const maskSecrets=text=>String(text).replace(/([?&](?:key|apikey|api_key|token|access_token|signature)=)[^&\s"']+/gi,'$1***').replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/?#"'@]*@/gi,'$1***@');

export const SATELLITE_PRESETS={
  'gugik-orto':{label:'GUGiK — Ortofotomapa (WMS, bezpłatna)',url:'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=Raster&STYLES=&FORMAT=image/jpeg&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}',attribution:'Ortofotomapa © GUGiK'},
};

/** Validates a satellite provider configuration without contacting it. */
export function validateSatelliteConfig(config,allowedOrigins=[]) {
  if(!config||typeof config.url!=='string')return {ok:false,reason:'Nie skonfigurowano dostawcy zdjęć.'};
  if(config.consent!==true)return {ok:false,reason:'Brak potwierdzenia, że widoczny obszar mapy będzie wysyłany do dostawcy.'};
  let url;try{url=new URL(config.url.replaceAll('{','%7B').replaceAll('}','%7D'));}catch{return {ok:false,reason:'Nieprawidłowy adres dostawcy.'};}
  if(url.username||url.password)return {ok:false,reason:'Adres dostawcy nie może zawierać nazwy użytkownika ani hasła.'};
  const loopback=url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
  if(url.protocol!=='https:'&&!loopback)return {ok:false,reason:'Dostawca musi używać HTTPS.'};
  if(!/\{(z|bbox-epsg-3857)\}/.test(config.url))return {ok:false,reason:'Adres musi zawierać {z}/{x}/{y} albo {bbox-epsg-3857}.'};
  if(!String(config.attribution??'').trim())return {ok:false,reason:'Podaj atrybucję wymaganą przez dostawcę.'};
  if(!allowedOrigins.includes(url.origin))return {ok:false,reason:`Ten widok blokuje połączenia z ${url.origin}. Uruchom planer plikiem Uruchom-planer.bat (albo: python -X utf8 map05/serve.py --allow-tile-origin ${url.origin}). Samodzielny plik planner-offline.html nie pobiera zdjęć satelitarnych.`};
  return {ok:true,origin:url.origin};
}

export function createOperationalMapView({maplibregl,container,roadTiles,pack,towns,regionBounds,teams,callbacks,variant=DEFAULT_VARIANT}) {
  // Base tiles come from the rich local pack when present, otherwise from the roads-only generator (MAP-06).
  opRoadTiles=roadTiles??null;opPack=pack??null;opCallbacks=callbacks;opPackFailures=0;opPackReported=false;
  const rich=Boolean(pack);
  if(!opProtocolRegistered) {
    opProtocolRegistered=true;
    maplibregl.addProtocol('mmsroads',async(params,abortController)=>{
      const match=/mmsroads:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
      if(!match)throw Error('Nieprawidłowy adres kafla lokalnego.');
      if(!opRoadTiles)throw Error('Lokalne kafle dróg nie są dostępne.');
      return {data:await opRoadTiles.tile(Number(match[1]),Number(match[2]),Number(match[3]),abortController?.signal)};
    });
    maplibregl.addProtocol('mmspack',async(params,abortController)=>{
      const match=/mmspack:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
      if(!match)throw Error('Nieprawidłowy adres kafla pakietu mapy.');
      if(!opPack)throw Error('Pakiet mapy nie jest dostępny.');
      let data;
      try {data=await opPack.tile(Number(match[1]),Number(match[2]),Number(match[3]),abortController?.signal);}
      catch(error) {
        // Cancelled requests are normal; repeated real read errors mean the pack itself is unusable: let the planner fall back to roads.
        if(!abortController?.signal?.aborted&&++opPackFailures>=3&&!opPackReported){opPackReported=true;opCallbacks?.onPackFailure?.(error.message);}
        throw error;
      }
      // A tile missing from the archive is simply empty (outside coverage); never an error.
      return {data:data?data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength):new ArrayBuffer(0)};
    });
  }
  const packHeader=pack?.header;
  const attribution=pack?'© OpenStreetMap contributors (ODbL), lokalny pakiet mapy':'© OpenStreetMap contributors (ODbL), lokalny podkład dróg';
  const sources={
    roads:rich
      ?{type:'vector',tiles:['mmspack://{z}/{x}/{y}'],minzoom:packHeader.minZoom,maxzoom:packHeader.maxZoom,bounds:packHeader.bounds,attribution}
      :{type:'vector',tiles:['mmsroads://{z}/{x}/{y}'],minzoom:5,maxzoom:14,bounds:regionBounds??undefined,attribution},
    towns:{type:'geojson',data:towns},
    routes:{type:'geojson',data:OP_EMPTY},
    unassigned:{type:'geojson',data:OP_EMPTY,...OP_CLUSTER},
    visits:{type:'geojson',data:OP_EMPTY,...OP_CLUSTER},
  };
  let activeVariant=MAP_VARIANTS[variant]?variant:DEFAULT_VARIANT;
  const buildLayers=()=>[...baseLayers({variant:activeVariant,rich,packPlaces:!pack?.layers||pack.layers.has('places')}),...opsLayers({variant:activeVariant})];
  const map=new maplibregl.Map({container,style:{version:8,sources,layers:buildLayers()},bounds:regionBounds??undefined,fitBoundsOptions:{padding:24},attributionControl:{compact:true},maxZoom:19,minZoom:5,dragRotate:true,pitchWithRotate:false,cooperativeGestures:false});
  map.addControl(new maplibregl.NavigationControl({visualizePitch:false}),'top-right');
  map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
  map.getCanvas().setAttribute('aria-label','Interaktywna mapa operacyjna. Strzałki przesuwają, plus i minus zmieniają skalę. Lista wizyt obok mapy jest dostępna z klawiatury.');
  let satelliteKey=null,basemap='road',flags={...OP_DEFAULT_FLAGS},lastLayers=null,popup=null,popupOrder=null,popupSig='';
  // `ready` rejects when the map fails before its first load (e.g. the worker cannot start), so the planner falls back to the SVG map.
  let loaded=false;
  const ready=new Promise((resolve,reject)=>{
    map.once('load',()=>{
      loaded=true;
      registerImages();applyVisibility();
      resolve();
    });
    map.on('error',event=>{if(!loaded&&!event.sourceId&&!event.tile)reject(Error(maskSecrets(event.error?.message??String(event.error??event))));});
  });
  ready.catch(()=>{}); // callers that await `ready` still see the rejection
  function registerImages() {
    for(const team of teams)for(const shape of ['circle','square','diamond'])for(const confirmed of [false,true]) {
      const name=`op-${shape}-${team.teamId}${confirmed?'-c':''}`;
      if(!map.hasImage(name))map.addImage(name,markerImage(shape,team.color,{confirmed}),{pixelRatio:2});
    }
    if(!map.hasImage('op-diamond-queue'))map.addImage('op-diamond-queue',markerImage('diamond','#9aa19a'),{pixelRatio:2});
  }
  const setVisibility=(id,on)=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'visible':'none');};
  function applyVisibility() {
    const satellite=basemap==='satellite'&&satelliteKey&&map.getLayer('satellite'),hybrid=basemap==='hybrid'&&satelliteKey&&map.getLayer('satellite');
    if(map.getLayer('satellite'))setVisibility('satellite',Boolean(satellite||hybrid));
    // Switches decide first; the basemap mode then removes whatever would hide or fight with the photo.
    const on=new Map();
    for(const [group,ids] of Object.entries(OP_LAYER_GROUPS))for(const id of ids)on.set(id,(on.get(id)??true)&&flags[group]!==false);
    for(const id of BASE_LAYER_IDS)if(!OP_LAYER_GROUPS.routes.includes(id)){
      let visible=on.get(id)??true;
      if(satellite)visible=false;
      else if(hybrid)visible=visible&&!OP_FILL_LAYERS.includes(id);
      setVisibility(id,visible);
    }
    setVisibility('background',!(satellite||hybrid));
    for(const id of OPS_LAYER_IDS)setVisibility(id,on.get(id)??true);
    if(map.getLayer('roads-fill')){
      map.setPaintProperty('roads-fill','line-opacity',hybrid?0.6:1);
      map.setPaintProperty('roads-casing','line-opacity',hybrid?0.3:1);
    }
  }
  // Rebuilds every style layer for a variant while keeping sources, data, images and user switches.
  function rebuildLayers() {
    for(const id of [...OPS_LAYER_IDS].reverse().concat([...BASE_LAYER_IDS].reverse(),['satellite']))if(map.getLayer(id))map.removeLayer(id);
    const layers=buildLayers();
    map.addLayer(layers[0]);
    if(satelliteKey)map.addLayer({id:'satellite',type:'raster',source:'satellite'});
    for(const layer of layers.slice(1))map.addLayer(layer);
    applyVisibility();
  }
  const featuresAt=event=>{
    const found=map.queryRenderedFeatures([[event.point.x-12,event.point.y-12],[event.point.x+12,event.point.y+12]],{layers:['visits-icon','visits-label','unassigned','unassigned-measurement']});
    const seen=new Set(),unique=[];
    for(const feature of found){const id=feature.properties.orderId;if(id&&!seen.has(id)){seen.add(id);unique.push(feature);}}
    return unique;
  };
  // Popup content is derived from the current feature, so it can be rebuilt when the plan changes under an open popup.
  // `selected` only reflects the planner highlight, so it is not part of what the popup shows.
  const popupSignature=p=>JSON.stringify({...p,selected:undefined});
  const popupNode=p=>{
    const node=document.createElement('div');node.className='op-popup';
    const title=document.createElement('strong');title.textContent=`${p.orderId} · ${p.type}`;node.append(title);
    const lines=p.teamId?[`Koszyk ${p.teamId} · wizyta nr ${p.seq} · ${p.window}`,p.confirmed?'Okno potwierdzone (test)':p.origin==='MANUAL'?'Ręczna propozycja':'Automatyczna propozycja',p.address]:['Nieprzydzielone (kolejka)',p.ready?'Gotowe — parametr testowy':'Brak gotowości — parametr testowy',p.address];
    for(const text of lines){const line=document.createElement('span');line.textContent=text;node.append(line);}
    const edit=document.createElement('button');edit.type='button';edit.className='primary';edit.textContent='Edytuj w planerze';
    edit.addEventListener('click',()=>{popup?.remove();callbacks.onEdit(p.orderId);});node.append(edit);
    node.addEventListener('keydown',keyEvent=>{if(keyEvent.key==='Escape'){popup?.remove();callbacks.onPopupClosed?.(p.orderId);}});
    return node;
  };
  // Several orders at (almost) the same spot: let the user pick the exact one instead of guessing.
  const pickerNode=features=>{
    const node=document.createElement('div');node.className='op-popup op-picker';
    const title=document.createElement('strong');title.textContent=`${features.length} zlecenia w tym miejscu — wybierz`;node.append(title);
    for(const feature of features) {
      const p=feature.properties,button=document.createElement('button');button.type='button';
      button.textContent=`${p.teamId?`${p.seq}. `:''}${p.orderId} · ${p.type}${p.teamId?` · ${p.teamId}`:' · kolejka'}`;
      button.addEventListener('click',()=>{popup?.remove();openPopup(feature);});node.append(button);
    }
    return node;
  };
  function openPopup(feature) {
    const p=feature.properties;
    popup?.remove();popupOrder=p.orderId;popupSig=popupSignature(p);
    popup=new maplibregl.Popup({closeButton:true,maxWidth:'300px',focusAfterOpen:true}).setLngLat(feature.geometry.coordinates).setDOMContent(popupNode(p)).addTo(map);
    popup.on('close',()=>{if(popupOrder===p.orderId)popupOrder=null;});
    callbacks.onSelect?.(p.orderId);
  }
  map.on('click',event=>{
    const cluster=map.queryRenderedFeatures(event.point,{layers:['visits-cluster','unassigned-cluster']})[0];
    if(cluster) {
      const source=map.getSource(cluster.layer.id==='visits-cluster'?'visits':'unassigned');
      Promise.resolve(source.getClusterExpansionZoom(cluster.properties.cluster_id)).then(zoom=>map.easeTo({center:cluster.geometry.coordinates,zoom:Math.min(zoom+0.5,17),duration:500})).catch(()=>{});
      return;
    }
    const features=featuresAt(event);if(!features.length)return;
    if(features.length>1){popup?.remove();popupOrder=null;popup=new maplibregl.Popup({closeButton:true,maxWidth:'300px'}).setLngLat(features[0].geometry.coordinates).setDOMContent(pickerNode(features)).addTo(map);return;}
    openPopup(features[0]);
  });
  for(const id of ['visits-icon','visits-label','visits-cluster','unassigned','unassigned-measurement','unassigned-cluster']) {
    map.on('mouseenter',id,()=>{map.getCanvas().style.cursor='pointer';});
    map.on('mouseleave',id,()=>{map.getCanvas().style.cursor='';});
  }
  // Events of a destroyed view must never reach the planner: a replacement view may already be running.
  let destroyed=false;
  map.on('error',event=>{if(!destroyed)callbacks.onError?.(maskSecrets(event.error?.message??String(event.error??event)));});
  // A lost GPU context must not leave the coordinator without a map: the planner falls back to SVG.
  const canvas=map.getCanvas(),onContextLost=()=>{if(!destroyed)callbacks.onFatal?.('Utracono kontekst WebGL.');};
  canvas.addEventListener('webglcontextlost',onContextLost,{once:true});
  return {
    map,ready,rich,packLayers:pack?.layers??null,
    async update(layers) {
      await ready;lastLayers=layers;
      map.getSource('visits').setData(layers.visits);map.getSource('routes').setData(layers.routes);map.getSource('unassigned').setData(layers.unassigned);
      // An open popup follows its order: refreshed from the new feature, closed when the order left this day's map.
      if(popupOrder) {
        const feature=[...layers.visits.features,...layers.unassigned.features].find(f=>f.properties.orderId===popupOrder);
        if(!feature){popup?.remove();popupOrder=null;}
        else if(popupSignature(feature.properties)!==popupSig) {
          // Rebuilding the content makes MapLibre focus its first control; keep focus where the user has it unless it was inside the popup.
          const active=document.activeElement,inside=active&&popup.getElement()?.contains(active);
          popupSig=popupSignature(feature.properties);
          popup.setLngLat(feature.geometry.coordinates).setDOMContent(popupNode(feature.properties));
          if(active&&!inside&&active!==document.body&&active.isConnected)active.focus({preventScroll:true});
        }
      }
    },
    async fit(bounds,options={}) {
      await ready;if(!bounds)return;
      const [w,s,e,n]=bounds,pad=0.002;
      map.fitBounds([[w-pad,s-pad],[e+pad,n+pad]],{padding:options.padding??56,maxZoom:options.maxZoom??15,duration:options.duration??600});
    },
    async flyTo(coordinates,zoom=16){await ready;map.flyTo({center:coordinates,zoom:Math.max(map.getZoom(),zoom),duration:700});},
    async setFlags(next){await ready;flags={...flags,...next};applyVisibility();},
    get flags(){return {...flags};},
    async setVariant(id){await ready;if(!MAP_VARIANTS[id]||id===activeVariant)return;activeVariant=id;rebuildLayers();},
    get variant(){return activeVariant;},
    async setBasemap(mode,config){
      await ready;
      const removeSatellite=()=>{if(map.getLayer('satellite'))map.removeLayer('satellite');if(map.getSource('satellite'))map.removeSource('satellite');satelliteKey=null;};
      // Back to the local map: drop the raster source so no further tile request is made.
      if(mode==='road')removeSatellite();
      else {
        const key=JSON.stringify([config.url,config.attribution]);
        if(satelliteKey!==key) {
          removeSatellite();
          map.addSource('satellite',{type:'raster',tiles:[config.url],tileSize:256,attribution:opEscape(config.attribution),maxzoom:19});
          map.addLayer({id:'satellite',type:'raster',source:'satellite'},'roads-casing');
          satelliteKey=key;
        }
      }
      basemap=mode;applyVisibility();
    },
    get basemap(){return basemap;},
    get layers(){return lastLayers;},
    get packInfo(){return pack?{source:pack.source?.kind??'unknown',bounds:packHeader.bounds,minZoom:packHeader.minZoom,maxZoom:packHeader.maxZoom}:null;},
    resize(){map.resize();},
    destroy(){
      if(destroyed)return;
      destroyed=true;canvas.removeEventListener('webglcontextlost',onContextLost);popup?.remove();map.remove();
      if(opCallbacks===callbacks){opCallbacks=null;opPack=null;opRoadTiles=null;} // a stale protocol handler must not keep reading the pack
    },
  };
}
